// 1plat.cash payment client (parallel to lib/platega.ts).
//
// The single server-side place that talks to 1plat.cash API.
// Never import this from a client component: it reads ONPLAT_* env vars
// through lib/env.ts and must never be bundled into the browser.
//
// Transport discipline:
// - API key via Authorization header (Bearer) per 1plat docs
// - JSON over HTTPS
// - createPayment is NEVER auto-retried (no idempotency key documented)
// - getPayment is safe-read retryable
// - Provider text is discarded — callers branch on OneplatError.code

import { timingSafeEqual } from "node:crypto";
import pRetry from "p-retry";
import { z } from "zod";
import { env } from "./env";

export type OneplatCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "server_error"
  | "network";

/** Typed provider failure. Callers branch on `code`; `message` is never shown. */
export class OneplatError extends Error {
  constructor(
    readonly code: OneplatCode,
    readonly status: number,
    readonly retryAfterSec?: number,
  ) {
    super(`oneplat:${code}`);
    this.name = "OneplatError";
  }
}

export interface OneplatRetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
}

export interface OneplatClientOptions {
  fetch?: typeof globalThis.fetch;
  retry?: OneplatRetryOptions;
}

export type OneplatStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

export interface CreatePaymentResult {
  paymentId: string;
  url: string;
  status: OneplatStatus;
}

export interface PaymentStatus {
  id: string;
  status: OneplatStatus;
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

const STATUSES: ReadonlySet<string> = new Set(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]);

function normalizeStatus(value: unknown): OneplatStatus {
  return typeof value === "string" && STATUSES.has(value)
    ? (value as OneplatStatus)
    : "PENDING";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  return undefined;
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

function mapStatus(status: number): OneplatCode {
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

export interface OneplatClient {
  createPayment(input: {
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    failedUrl: string;
    payload: string;
    metadata: { userId: string; userName: string };
  }): Promise<CreatePaymentResult>;
  getPayment(id: string): Promise<PaymentStatus>;
}

export function createOneplatClient(options: OneplatClientOptions = {}): OneplatClient {
  const retry: Required<OneplatRetryOptions> = {
    retries: 2,
    minTimeout: 250,
    maxTimeout: 2_000,
    factor: 2,
    ...options.retry,
  };
  const doFetch: typeof globalThis.fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    opts: RequestOptions,
    normalize: (data: unknown) => T,
    retryable: boolean,
  ): Promise<T> {
    const url = new URL(`${env.ONPLAT_BASE_URL}${path}`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${env.ONPLAT_API_KEY}`,
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
        throw new OneplatError("network", 0);
      }
      if (!res.ok) {
        throw new OneplatError(
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
        error instanceof OneplatError && error.code === "server_error",
    });
  }

  return {
    createPayment: (input) =>
      request(
        "POST",
        "/v1/payments",
        {
          body: {
            amount: input.amount,
            currency: input.currency,
            description: input.description,
            return_url: input.returnUrl,
            failed_url: input.failedUrl,
            metadata: {
              payload: input.payload,
              user_id: input.metadata.userId,
              user_name: input.metadata.userName,
            },
          },
        },
        (data) => {
          const d = asRecord(data);
          const url = asString(d.url) ?? asString(d.payment_url);
          const paymentId = asString(d.id) ?? asString(d.payment_id);
          if (!url || !paymentId) throw new OneplatError("network", 200);
          return {
            paymentId,
            url,
            status: normalizeStatus(d.status),
          };
        },
        false, // NEVER retry a create — no idempotency contract
      ),

    getPayment: (id) =>
      request(
        "GET",
        `/v1/payments/${encodeURIComponent(id)}`,
        {},
        (data) => {
          const d = asRecord(data);
          const amount = pickNumber(d.amount);
          const currency = asString(d.currency);
          if (amount === null || !currency) throw new OneplatError("network", 200);
          const metadata = d.metadata ? asRecord(d.metadata) : {};
          return {
            id: asString(d.id) ?? id,
            status: normalizeStatus(d.status),
            amount,
            currency,
            payload: asString(metadata.payload ?? d.payload),
          };
        },
        true, // safe read — retryable
      ),
  };
}

/** Default server-side singleton used by BFF routes and the worker. */
export const oneplat = createOneplatClient();