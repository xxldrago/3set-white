// ARTEMIDA Paid API V1 client (D-17/D-18/D-19).
//
// The single server-side place that talks to https://artemida.cc/v1. Never
// import this from a client component: it reads `ARTEMIDA_API_KEY` through
// lib/env.ts and must never be bundled into the browser.
//
// Transport discipline (RESEARCH Pattern 1):
// - `Authorization: Bearer <key>` on every call.
// - A fresh `Idempotency-Key` (UUID) on every POST/DELETE (D-18).
// - p-retry retries ONLY 429/502/503; every other status aborts immediately.
// - 429 honors `Retry-After` (seconds); all provider messages are discarded —
//   callers branch on `ArtemidaError.code`, never on provider text (D-19).
//
// Response shapes are tolerant (`.passthrough()`) and normalized to internal
// models; the observed contract lives in docs/artemida-v1-contract.md.
import { randomUUID } from "node:crypto";
import pRetry from "p-retry";
import { z } from "zod";
import { env } from "./env";

export type ArtemidaCode =
  | "unauthorized"
  | "payment_required"
  | "conflict"
  | "rate_limited"
  | "bad_gateway"
  | "unavailable"
  | "not_found"
  | "unknown";

/** Typed provider failure. Callers branch on `code`; `message` is never shown. */
export class ArtemidaError extends Error {
  constructor(
    readonly code: ArtemidaCode,
    readonly status: number,
    readonly retryAfterSec?: number,
    readonly requestId?: string,
  ) {
    super(`artemida:${code}`);
    this.name = "ArtemidaError";
  }
}

/** Retry policy override — exported so unit tests can run without real delays. */
export interface ArtemidaRetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
}

export interface ArtemidaClientOptions {
  /** Inject a fake fetch in tests; defaults to the runtime global fetch. */
  fetch?: typeof globalThis.fetch;
  retry?: ArtemidaRetryOptions;
}

const RETRYABLE: ReadonlySet<ArtemidaCode> = new Set([
  "rate_limited",
  "bad_gateway",
  "unavailable",
]);

const MAX_RETRY_AFTER_MS = 60_000;
const DEFAULT_RETRY: Required<ArtemidaRetryOptions> = {
  retries: 2,
  minTimeout: 250,
  maxTimeout: 2_000,
  factor: 2,
};

/** Both error envelope shapes: object `{code,message}` AND plain string (404). */
const errorEnvelope = z.object({
  ok: z.literal(false),
  error: z.union([
    z.object({ code: z.string(), message: z.string().optional() }).passthrough(),
    z.string(),
  ]),
  meta: z.object({ requestId: z.string().optional() }).passthrough().optional(),
});

const successEnvelope = z
  .object({
    ok: z.literal(true),
    data: z.unknown(),
    meta: z.object({ requestId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

function mapStatus(status: number, providerCode?: string): ArtemidaCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 402:
      return "payment_required";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 429:
      return "rate_limited";
    case 502:
      return "bad_gateway";
    case 503:
      return "unavailable";
    default:
      if (providerCode === "invalid_api_key" || providerCode === "missing_api_key") {
        return "unauthorized";
      }
      return "unknown";
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Optional per-write controls. A caller-supplied `idempotencyKey` lets a
 *  retried fulfillment reuse one provider-side idempotency token
 *  (D-18/Pitfall 2, e.g. `order:{orderId}:new`) instead of minting a fresh
 *  UUID per attempt. */
export interface ArtemidaWriteOptions {
  idempotencyKey?: string;
}

interface RequestOptions<T> {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  normalize: (data: unknown) => T;
}

interface ErrorBody {
  code?: string;
  requestId?: string;
}

async function readErrorBody(res: Response, fallbackRequestId?: string): Promise<ErrorBody> {
  const out: ErrorBody = { requestId: fallbackRequestId };
  try {
    const json: unknown = await res.json();
    const parsed = errorEnvelope.safeParse(json);
    if (parsed.success) {
      if (typeof parsed.data.error === "object") out.code = parsed.data.error.code;
      out.requestId = parsed.data.meta?.requestId ?? out.requestId;
    }
  } catch {
    // Non-JSON error body: fall through with status-only mapping.
  }
  return out;
}

/** Build the typed error for a non-2xx response (extracts Retry-After). */
async function buildError(res: Response, fallbackRequestId?: string): Promise<ArtemidaError> {
  const body = await readErrorBody(res, fallbackRequestId);
  return new ArtemidaError(
    mapStatus(res.status, body.code),
    res.status,
    parseRetryAfter(res.headers.get("retry-after")),
    body.requestId,
  );
}

// ---------------------------------------------------------------------------
// Normalized internal models (provider shapes are tolerant until re-probed).
// ---------------------------------------------------------------------------

export interface Pricing {
  price: number;
  currency: string;
  days: number;
  devices: number;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePricing(data: unknown, days: number, devices: number): Pricing {
  const d = asRecord(data);
  const quote = asRecord(d.quote);
  // Live contract: data.quote.amount. Tolerant fallbacks: data.amount / data.price.
  const amount = pickNumber(quote.amount, d.amount, d.price);
  if (amount === null) throw new ArtemidaError("unknown", 200);
  return {
    price: amount,
    currency: (typeof quote.currency === "string" && quote.currency) || "RUB",
    days: pickNumber(quote.days, d.days) ?? days,
    devices: pickNumber(quote.devices, d.devices) ?? devices,
  };
}

/** Locally derived prorated upgrade delta (PAY-03). */
export interface UpgradeQuote {
  /** Total charge for the added devices, in whole RUB. */
  amount: number;
  currency: string;
  addDevices: number;
  /** Selected tier's device-month price (observed apiPricing basis). */
  devicePricePerMonth: number;
}

/**
 * The provider exposes no upgrade-quote endpoint (RESEARCH Open Q2). The
 * `402 insufficient_balance` body reports the charge, but provider text is
 * never surfaced (D-19), so the delta is derived locally from the observed
 * pricing document instead of being scraped from an error string.
 *
 * Mirrors the observed `apiPricing`:
 * - `deviceTiers[]` / `devicePricePerMonth` — tier price per added device,
 *   selected on `volume.devices + addDevices` ("…including the order being placed").
 * - `upgradeRule` = "tier device price per added device; minimum one full month,
 *   proportional above 30 remaining days" → `factor = max(1, remainingDays/30)`.
 * - Fixture (2026-10-03): +1 device on a 30-day key → 60 RUB.
 */
export function deriveUpgradeQuote(
  data: unknown,
  addDevices: number,
  remainingDays: number,
): UpgradeQuote {
  if (!Number.isInteger(addDevices) || addDevices < 1) {
    throw new ArtemidaError("unknown", 200);
  }
  const d = asRecord(data);
  const api = asRecord(d.apiPricing);
  const tiers = asArray(api.deviceTiers)
    .map((tier) => asRecord(tier))
    .map((tier) => ({ from: pickNumber(tier.from) ?? 0, price: pickNumber(tier.price) ?? 0 }))
    .filter((tier) => tier.price > 0)
    .sort((a, b) => a.from - b.from);
  const volume = asRecord(api.volume);
  const totalDevices = (pickNumber(volume.devices) ?? 0) + addDevices;
  let devicePrice = pickNumber(api.devicePricePerMonth) ?? 0;
  for (const tier of tiers) {
    if (totalDevices >= tier.from) devicePrice = tier.price;
  }
  if (devicePrice <= 0) throw new ArtemidaError("unknown", 200);
  const months = Math.max(1, remainingDays / 30);
  const quote = asRecord(d.quote);
  const segment = asRecord(d.segment);
  return {
    amount: Math.round(devicePrice * addDevices * months),
    currency: asString(quote.currency) ?? asString(segment.currency) ?? "RUB",
    addDevices,
    devicePricePerMonth: devicePrice,
  };
}

// ---------------------------------------------------------------------------
// Shared normalized models consumed by the later phase slices (D-17).
// Key-scoped shapes were NOT observable in the 02-01 probe (0-key account), so
// every schema below is tolerant/`.passthrough()` and extraction falls back
// across the cabinet field vocabulary until a key exists to re-probe.
// ---------------------------------------------------------------------------

export interface NormalizedKey {
  id: string;
  name: string | null;
  status: string;
  isTrial: boolean;
  expiresAt: string | null;
  deviceLimit: number | null;
  devices: number | null;
  subscriptionUrl: string | null;
  customerRef: string | null;
  trafficUsedBytes: number | null;
  trafficLimitBytes: number | null;
}

export interface KeyList {
  items: NormalizedKey[];
  count: number;
  query: string;
}

export interface Device {
  token: string;
  name: string | null;
}

export interface SubscriptionLinks {
  subscriptionUrl: string | null;
  links: string[];
}

export interface Traffic {
  usedBytes: number | null;
  limitBytes: number | null;
}

export interface Balance {
  balance: number;
  currency: string;
  unlimited: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `devices` may be a count or an array of connected devices. */
function asDeviceCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return null;
}

function normalizeKey(raw: unknown, fallbackId?: string): NormalizedKey {
  const d = asRecord(raw);
  return {
    id: asString(d.id) ?? asString(d.keyId) ?? asString(d.key_id) ?? fallbackId ?? "",
    name: asString(d.name),
    status: asString(d.status) ?? "unknown",
    // Observed 2026-10-03 create/upgrade probe: the key boolean is `trial`
    // (not `isTrial`). Keep the camel/snake variants for tolerance.
    isTrial: asBool(d.isTrial) || asBool(d.is_trial) || asBool(d.trial),
    expiresAt: asString(d.expiresAt) ?? asString(d.expireAt) ?? asString(d.expire_at),
    deviceLimit: pickNumber(d.deviceLimit, d.device_limit),
    devices: asDeviceCount(d.devices),
    subscriptionUrl: asString(d.subscriptionUrl) ?? asString(d.subscription_url),
    customerRef: asString(d.customerRef) ?? asString(d.customer_ref),
    trafficUsedBytes: pickNumber(d.trafficUsedBytes, d.traffic_used_bytes),
    trafficLimitBytes: pickNumber(d.trafficLimitBytes, d.traffic_limit_bytes),
  };
}

/** Single-key responses may nest the key under `data.key` or return it directly. */
function normalizeKeyResponse(data: unknown, fallbackId?: string): NormalizedKey {
  const d = asRecord(data);
  return normalizeKey(d.key !== undefined ? d.key : data, fallbackId);
}

function normalizeKeyList(data: unknown): KeyList {
  const d = asRecord(data);
  const rawItems = asArray(d.items).length
    ? asArray(d.items)
    : asArray(d.keys).length
      ? asArray(d.keys)
      : asArray(data);
  const items = rawItems.map((item) => normalizeKey(item));
  return {
    items,
    count: pickNumber(d.count, d.total) ?? items.length,
    query: asString(d.query) ?? "",
  };
}

function normalizeSubscriptionLinks(data: unknown): SubscriptionLinks {
  const d = asRecord(data);
  const links = asStringArray(d.links);
  const vless = asStringArray(d.vless);
  return {
    subscriptionUrl:
      asString(d.subscriptionUrl) ?? asString(d.subscription_url) ?? asString(d.url),
    links: links.length ? links : vless,
  };
}

function normalizeDevices(data: unknown): Device[] {
  const d = asRecord(data);
  const raw = asArray(d.items).length
    ? asArray(d.items)
    : asArray(d.devices).length
      ? asArray(d.devices)
      : asArray(data);
  return raw.map((item) => {
    const r = asRecord(item);
    return {
      token: asString(r.token) ?? asString(r.id) ?? "",
      name: asString(r.name),
    };
  });
}

function normalizeTraffic(data: unknown): Traffic {
  const d = asRecord(data);
  return {
    usedBytes: pickNumber(d.usedBytes, d.used, d.trafficUsedBytes, d.traffic_used_bytes),
    limitBytes: pickNumber(d.limitBytes, d.limit, d.trafficLimitBytes, d.traffic_limit_bytes),
  };
}

function normalizeBalance(data: unknown): Balance {
  const d = asRecord(data);
  return {
    balance: pickNumber(d.balance, d.amount) ?? 0,
    currency: asString(d.currency) ?? "RUB",
    unlimited: asBool(d.unlimited),
  };
}

/** Full ARTEMIDA V1 surface (D-17). Methods are authored here even where a
 *  later phase owns the route/UI wiring (see COVERAGE.md). */
export interface ArtemidaClient {
  getPricing(input: { days: number; devices: number }): Promise<Pricing>;
  /** Locally derived prorated upgrade delta (PAY-03; no provider quote endpoint). */
  getUpgradeQuote(input: {
    days: number;
    devices: number;
    addDevices: number;
    /** Defaults to one full month (30) — the observed minimum charge window. */
    remainingDays?: number;
  }): Promise<UpgradeQuote>;
  createTrial(input: { customerRef: string }): Promise<NormalizedKey>;
  /** Paid key create — observed 2026-10-03: `POST /keys` with
   *  `{customerRef, days, devices}` (all required integers) → `201`. */
  createKey(
    input: { customerRef: string; days: number; devices: number },
    opts?: ArtemidaWriteOptions,
  ): Promise<NormalizedKey>;
  listKeys(input?: {
    limit?: number;
    offset?: number;
    includeRevoked?: boolean;
    q?: string;
  }): Promise<KeyList>;
  getKey(id: string): Promise<NormalizedKey>;
  getSubscriptionLinks(id: string): Promise<SubscriptionLinks>;
  getDevices(id: string): Promise<Device[]>;
  deleteDevice(id: string, token: string): Promise<void>;
  clearDevices(id: string): Promise<void>;
  getTraffic(id: string): Promise<Traffic>;
  resetTraffic(id: string): Promise<void>;
  renewKey(
    id: string,
    input: { days: number; devices: number },
    opts?: ArtemidaWriteOptions,
  ): Promise<NormalizedKey>;
  /** Add devices to an existing key. Observed 2026-10-03: the provider accepts
   *  `{ addDevices }` ONLY (`{days,devices}` → `400 unsupported_fields`); the
   *  prorated charge is computed provider-side. See contract finding #5. */
  upgradeKey(
    id: string,
    input: { addDevices: number },
    opts?: ArtemidaWriteOptions,
  ): Promise<NormalizedKey>;
  disableKey(id: string): Promise<void>;
  enableKey(id: string): Promise<void>;
  deleteKey(id: string, input?: { permanent?: boolean }): Promise<void>;
  getBalance(): Promise<Balance>;
}

/**
 * Build a client. The default singleton uses global fetch resolved at call
 * time (so tests can `vi.stubGlobal`); a factory lets unit tests inject a fake
 * fetch and a zero-delay retry policy.
 */
export function createArtemidaClient(options: ArtemidaClientOptions = {}): ArtemidaClient {
  const retry: Required<ArtemidaRetryOptions> = { ...DEFAULT_RETRY, ...options.retry };
  const doFetch: typeof globalThis.fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts: RequestOptions<T>,
  ): Promise<T> {
    const url = new URL(`${env.ARTEMIDA_BASE_URL}${path}`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${env.ARTEMIDA_API_KEY}`,
      Accept: "application/json",
    };
    if (method === "POST" || method === "DELETE") {
      headers["Idempotency-Key"] = opts.idempotencyKey ?? randomUUID();
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const attempt = async (): Promise<T> => {
      const res = await doFetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const requestId = res.headers.get("x-request-id") ?? undefined;
      if (!res.ok) throw await buildError(res, requestId);
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        json = undefined;
      }
      const parsed = successEnvelope.safeParse(json);
      if (!parsed.success) {
        throw new ArtemidaError("unknown", res.status, undefined, requestId);
      }
      return opts.normalize(parsed.data.data);
    };

    return pRetry(attempt, {
      retries: retry.retries,
      minTimeout: retry.minTimeout,
      maxTimeout: retry.maxTimeout,
      factor: retry.factor,
      randomize: true,
      shouldRetry: ({ error }) =>
        error instanceof ArtemidaError && RETRYABLE.has(error.code),
      onFailedAttempt: async ({ error, retriesLeft }) => {
        // Honor Retry-After on 429; p-retry still applies its own backoff.
        // Skip when no retry will occur (retries exhausted/aborted).
        if (retriesLeft <= 0) return;
        if (
          error instanceof ArtemidaError &&
          error.code === "rate_limited" &&
          error.retryAfterSec !== undefined &&
          error.retryAfterSec > 0
        ) {
          await sleep(Math.min(error.retryAfterSec * 1000, MAX_RETRY_AFTER_MS));
        }
      },
    });
  }

  const keyPath = (id: string) => `/keys/${encodeURIComponent(id)}`;

  return {
    getPricing: ({ days, devices }) =>
      request("GET", "/pricing", {
        query: { days, devices },
        normalize: (data) => normalizePricing(data, days, devices),
      }),

    getUpgradeQuote: ({ days, devices, addDevices, remainingDays }) =>
      request("GET", "/pricing", {
        query: { days, devices },
        normalize: (data) => deriveUpgradeQuote(data, addDevices, remainingDays ?? 30),
      }),

    createTrial: ({ customerRef }) =>
      request("POST", "/trial", {
        body: { customerRef },
        normalize: (data) => normalizeKeyResponse(data),
      }),

    createKey: ({ customerRef, days, devices }, opts) =>
      request("POST", "/keys", {
        body: { customerRef, days, devices },
        idempotencyKey: opts?.idempotencyKey,
        normalize: (data) => normalizeKeyResponse(data),
      }),

    listKeys: (input = {}) =>
      request("GET", "/keys", {
        query: {
          limit: input.limit,
          offset: input.offset,
          includeRevoked: input.includeRevoked,
          q: input.q,
        },
        normalize: normalizeKeyList,
      }),

    getKey: (id) =>
      request("GET", keyPath(id), { normalize: (data) => normalizeKeyResponse(data, id) }),

    getSubscriptionLinks: (id) =>
      request("GET", `${keyPath(id)}/subscription-links`, {
        normalize: normalizeSubscriptionLinks,
      }),

    getDevices: (id) =>
      request("GET", `${keyPath(id)}/devices`, { normalize: normalizeDevices }),

    deleteDevice: (id, token) =>
      request("DELETE", `${keyPath(id)}/devices/${encodeURIComponent(token)}`, {
        normalize: () => undefined,
      }),

    clearDevices: (id) =>
      request("POST", `${keyPath(id)}/devices/clear`, { normalize: () => undefined }),

    getTraffic: (id) =>
      request("GET", `${keyPath(id)}/traffic`, { normalize: normalizeTraffic }),

    resetTraffic: (id) =>
      request("POST", `${keyPath(id)}/traffic/reset`, { normalize: () => undefined }),

    renewKey: (id, { days, devices }, opts) =>
      request("POST", `${keyPath(id)}/renew`, {
        body: { days, devices },
        idempotencyKey: opts?.idempotencyKey,
        normalize: (data) => normalizeKeyResponse(data, id),
      }),

    upgradeKey: (id, { addDevices }, opts) =>
      request("POST", `${keyPath(id)}/upgrade`, {
        // Observed contract (contract finding #5): {addDevices} ONLY.
        body: { addDevices },
        idempotencyKey: opts?.idempotencyKey,
        normalize: (data) => normalizeKeyResponse(data, id),
      }),

    disableKey: (id) =>
      request("POST", `${keyPath(id)}/disable`, { normalize: () => undefined }),

    enableKey: (id) =>
      request("POST", `${keyPath(id)}/enable`, { normalize: () => undefined }),

    deleteKey: (id, input = {}) =>
      request("DELETE", `${keyPath(id)}${input.permanent ? "/permanent" : ""}`, {
        normalize: () => undefined,
      }),

    getBalance: () => request("GET", "/balance", { normalize: normalizeBalance }),
  };
}

/** Default server-side singleton used by BFF routes and the bot. */
export const artemida = createArtemidaClient();
