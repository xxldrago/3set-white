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

interface RequestOptions<T> {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
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

export interface ArtemidaClient {
  getPricing(input: { days: number; devices: number }): Promise<Pricing>;
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
      headers["Idempotency-Key"] = randomUUID();
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

  return {
    getPricing: ({ days, devices }) =>
      request("GET", "/pricing", {
        query: { days, devices },
        normalize: (data) => normalizePricing(data, days, devices),
      }),
  };
}

/** Default server-side singleton used by BFF routes and the bot. */
export const artemida = createArtemidaClient();
