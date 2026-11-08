// Unified payment provider abstraction — single entry point for the money
// pipeline. Chooses the active provider (platega | oneplat) at runtime from
// the PAYMENT_PROVIDER env var. Callers depend ONLY on this module, never
// on lib/platega.ts or lib/payment-1plat.ts directly.

import { env } from "./env";
import { PlategaError, platega } from "./platega";
import { OneplatError, oneplat } from "./payment-1plat";

export type PaymentProvider = "platega" | "oneplat";

export type PaymentCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "server_error"
  | "network";

export interface CreatePaymentResult {
  paymentId: string;
  url: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  provider: PaymentProvider;
}

export interface PaymentStatusResult {
  id: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  amount: number;
  currency: string;
  payload: string | null;
  provider: PaymentProvider;
}

/** Typed provider failure — callers branch on `code`; message is never shown. */
export class PaymentError extends Error {
  constructor(
    readonly code: PaymentCode,
    readonly status: number,
    readonly provider: PaymentProvider,
    readonly retryAfterSec?: number,
  ) {
    super(`payment:${provider}:${code}`);
    this.name = "PaymentError";
  }
}

/** Normalize status strings from different providers to a common enum. */
export function normalizeStatus(
  provider: PaymentProvider,
  raw: string,
): "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" {
  if (provider === "platega") {
    switch (raw) {
      case "CONFIRMED":
        return "SUCCESS";
      case "CANCELED":
        return "FAILED";
      case "CHARGEBACKED":
        return "REFUNDED";
      default:
        return "PENDING";
    }
  }
  // oneplat
  switch (raw) {
    case "SUCCESS":
      return "SUCCESS";
    case "FAILED":
      return "FAILED";
    case "REFUNDED":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}

/** Map provider-specific error to unified PaymentError. */
function mapError(
  provider: PaymentProvider,
  err: PlategaError | OneplatError,
): PaymentError {
  return new PaymentError(err.code, err.status, provider, err.retryAfterSec);
}

/** Get the active provider client — returns { create, getStatus }. */
export function getPaymentClient() {
  const provider: PaymentProvider = env.PAYMENT_PROVIDER;

  if (provider === "oneplat") {
    return {
      provider: "oneplat" as PaymentProvider,
      async createPayment(input: {
        amount: number;
        currency: string;
        description: string;
        returnUrl: string;
        failedUrl: string;
        payload: string;
        metadata: { userId: string; userName: string };
      }): Promise<CreatePaymentResult> {
        try {
          const res = await oneplat.createPayment(input);
          return { ...res, provider: "oneplat" };
        } catch (err) {
          if (err instanceof OneplatError) throw mapError("oneplat", err);
          throw err;
        }
      },
      async getPaymentStatus(id: string): Promise<PaymentStatusResult> {
        try {
          const res = await oneplat.getPayment(id);
          return {
            id: res.id,
            status: normalizeStatus("oneplat", res.status),
            amount: res.amount,
            currency: res.currency,
            payload: res.payload,
            provider: "oneplat",
          };
        } catch (err) {
          if (err instanceof OneplatError) throw mapError("oneplat", err);
          throw err;
        }
      },
    };
  }

  // Default: platega
  return {
    provider: "platega" as PaymentProvider,
    async createPayment(input: {
      amount: number;
      currency: string;
      description: string;
      returnUrl: string;
      failedUrl: string;
      payload: string;
      metadata: { userId: string; userName: string };
    }): Promise<CreatePaymentResult> {
      try {
        const res = await platega.createTransaction(input);
        return {
          paymentId: res.transactionId,
          url: res.url,
          status: normalizeStatus("platega", res.status),
          provider: "platega",
        };
      } catch (err) {
        if (err instanceof PlategaError) throw mapError("platega", err);
        throw err;
      }
    },
    async getPaymentStatus(id: string): Promise<PaymentStatusResult> {
      try {
        const res = await platega.getTransaction(id);
        return {
          id: res.id,
          status: normalizeStatus("platega", res.status),
          amount: res.amount,
          currency: res.currency,
          payload: res.payload,
          provider: "platega",
        };
      } catch (err) {
        if (err instanceof PlategaError) throw mapError("platega", err);
        throw err;
      }
    },
  };
}

/** Get the active provider name for display/logging. */
export function getActiveProviderName(): PaymentProvider {
  return env.PAYMENT_PROVIDER;
}