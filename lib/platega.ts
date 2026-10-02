// Platega.io payment client (D-36/D-37).
//
// The single server-side place that talks to https://app.platega.io. Never
// import this from a client component: it reads PLATEGA_MERCHANT_ID /
// PLATEGA_SECRET through lib/env.ts and must never be bundled into the browser.
//
// Transport discipline (RESEARCH §Platega API Contract):
// - Headers `X-MerchantId` + `X-Secret` on every call; JSON over HTTPS.
// - No signature/HMAC exists — the callback is authenticated only by those two
//   headers, so `verifyPlategaHeaders` is the sole authenticator (combined with
//   the mandatory server-side re-query in the callback).
// - `createTransaction` is NEVER auto-retried: Platega documents no idempotency
//   key, so a blind retry can mint two transactions. Retry is opt-in and used
//   ONLY for the safe `getTransaction` read.
// - Provider text is discarded — callers branch on `PlategaError.code`, never
//   on provider message strings (D-19/D-24 discipline).
//
// Response shapes are tolerant (`.passthrough()`) and normalized to internal
// models; the observed contract lives in docs (RESEARCH, not an SDK).
import { timingSafeEqual } from "node:crypto";
import pRetry from "p-retry";
import { z } from "zod";
import { env } from "./env";

export type PlategaCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "server_error"
  | "network";

/** Typed provider failure. Callers branch on `code`; `message` is never shown. */
export class PlategaError extends Error {
  constructor(
    readonly code: PlategaCode,
    readonly status: number,
    readonly retryAfterSec?: number,
  ) {
    super(`platega:${code}`);
    this.name = "PlategaError";
  }
}

/** Retry policy override — exported so unit tests can run without real delays. */
export interface PlategaRetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
}

export interface PlategaClientOptions {
  /** Inject a fake fetch in tests; defaults to the runtime global fetch. */
  fetch?: typeof globalThis.fetch;
  retry?: PlategaRetryOptions;
}

/** Only 5xx are retryable, and only for safe GETs. */
const RETRYABLE: ReadonlySet<PlategaCode> = new Set(["server_error"]);
const DEFAULT_RETRY: Required<PlategaRetryOptions> = {
  retries: 2,
  minTimeout: 250,
  maxTimeout: 2_000,
  factor: 2,
};

// ---------------------------------------------------------------------------
// Tolerant response normalization (bare objects, no {ok,data} envelope).
// ---------------------------------------------------------------------------

export type PlategaStatus = "PENDING" | "CANCELED" | "CONFIRMED" | "CHARGEBACKED";

export interface CreateTransactionResult {
  transactionId: string;
  url: string;
  status: PlategaStatus;
}

export interface TransactionStatus {
  id: string;
  status: PlategaStatus;
  amount: number;
  currency: string;
  payload: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

const STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "CANCELED",
  "CONFIRMED",
  "CHARGEBACKED",
]);

function normalizeStatus(value: unknown): PlategaStatus {
  return typeof value === "string" && STATUSES.has(value)
    ? (value as PlategaStatus)
    : "PENDING";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return undefined;
}

// ---------------------------------------------------------------------------
// Request helper (retry is opt-in per call — only safe GETs use it)
// ---------------------------------------------------------------------------

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

function mapStatus(status: number): PlategaCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
    case 403:
      return "unauthorized";
    case 404:
      return "not_found";
    default:
      return status >= 500 ? "server_error" : "bad_request";
  }
}

export interface PlategaClient {
  createTransaction(input: {
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    failedUrl: string;
    payload: string;
    metadata: { userId: string; userName: string };
  }): Promise<CreateTransactionResult>;
  getTransaction(id: string): Promise<TransactionStatus>;
}

export function createPlategaClient(options: PlategaClientOptions = {}): PlategaClient {
  const retry: Required<PlategaRetryOptions> = { ...DEFAULT_RETRY, ...options.retry };
  const doFetch: typeof globalThis.fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    opts: RequestOptions,
    normalize: (data: unknown) => T,
    retryable: boolean,
  ): Promise<T> {
    const url = new URL(`${env.PLATEGA_BASE_URL}${path}`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {
      "X-MerchantId": env.PLATEGA_MERCHANT_ID,
      "X-Secret": env.PLATEGA_SECRET,
      Accept: "application/json",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const attempt = async (): Promise<T> => {
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
      } catch {
        // Transport failure — typed as network, never surfaces raw error text.
        throw new PlategaError("network", 0);
      }
      if (!res.ok) {
        throw new PlategaError(
          mapStatus(res.status),
          res.status,
          parseRetryAfter(res.headers.get("retry-after")),
        );
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        json = undefined;
      }
      return normalize(json);
    };

    if (!retryable) return attempt();

    return pRetry(attempt, {
      retries: retry.retries,
      minTimeout: retry.minTimeout,
      maxTimeout: retry.maxTimeout,
      factor: retry.factor,
      randomize: true,
      shouldRetry: ({ error }) =>
        error instanceof PlategaError && RETRYABLE.has(error.code),
    });
  }

  return {
    createTransaction: (input) =>
      request(
        "POST",
        "/v2/transaction/process",
        {
          body: {
            paymentDetails: { amount: input.amount, currency: input.currency },
            description: input.description,
            return: input.returnUrl,
            failedUrl: input.failedUrl,
            payload: input.payload,
            metadata: input.metadata,
          },
        },
        (data) => {
          const d = asRecord(data);
          // Endpoint-shape divergence: `url` on /v2/…, `redirect` on /….
          const url = asString(d.url) ?? asString(d.redirect);
          const transactionId = asString(d.transactionId) ?? asString(d.id);
          if (!url || !transactionId) throw new PlategaError("network", 200);
          return {
            transactionId,
            url,
            status: normalizeStatus(d.status),
          };
        },
        false, // NEVER retry a create — no idempotency contract.
      ),

    getTransaction: (id) =>
      request(
        "GET",
        `/transaction/${encodeURIComponent(id)}`,
        {},
        (data) => {
          const d = asRecord(data);
          const details = asRecord(d.paymentDetails);
          const amount = pickNumber(details.amount, d.amount);
          const currency = asString(details.currency) ?? asString(d.currency);
          if (amount === null || !currency) throw new PlategaError("network", 200);
          return {
            id: asString(d.id) ?? id,
            status: normalizeStatus(d.status),
            amount,
            currency,
            payload: asString(d.payload),
          };
        },
        true, // safe read — retryable.
      ),
  };
}

// ---------------------------------------------------------------------------
// Callback header verification (mirrors lib/auth.ts timing-safe discipline).
// Platega has no HMAC; header equality to env is the only authenticator.
// ---------------------------------------------------------------------------

function safeEq(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Constant-time comparison of both Platega callback headers against env. A
 * length guard prevents `timingSafeEqual` from throwing on crafted input; any
 * mismatch (or absence) returns false, never a throw.
 */
export function verifyPlategaHeaders(headers: Headers): boolean {
  return (
    safeEq(headers.get("x-merchantid"), env.PLATEGA_MERCHANT_ID) &&
    safeEq(headers.get("x-secret"), env.PLATEGA_SECRET)
  );
}

/** Default server-side singleton used by BFF routes and the worker. */
export const platega = createPlategaClient();
