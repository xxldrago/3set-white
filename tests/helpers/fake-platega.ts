// Platega fixtures + a header/body-capturing fake fetch (no network).
// Shapes mirror the RESEARCH §Platega API Contract (bare objects, no envelope).
import { jsonResponse } from "./fake-fetch";

export interface CapturedCall {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

/** Fake fetch recording method/url/headers/body; replays queued responses. */
export function capturingFetch(
  responses: Response[],
): { fetch: typeof globalThis.fetch; calls: CapturedCall[] } {
  if (responses.length === 0) throw new Error("capturingFetch needs >= 1 response");
  const calls: CapturedCall[] = [];
  let index = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      method: init?.method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const res = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return res.clone();
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls };
}

/** Observed create-transaction success body (`url` variant on /v2/…). */
export function createResponse(
  id = "tx_1",
  url = "https://pay.platega.io/?id=tx_1",
  status = "PENDING",
): Response {
  return jsonResponse({ body: { transactionId: id, url, status, expiresIn: "00:15:00" } });
}

/** Method-specified create variant uses `redirect` instead of `url`. */
export function createRedirectResponse(
  id = "tx_redir",
  redirect = "https://pay.platega.io/?id=tx_redir",
): Response {
  return jsonResponse({ body: { transactionId: id, redirect, status: "PENDING" } });
}

/** TransactionStatusResponse for the re-query. */
export function statusResponse(opts: {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  payload?: string;
} = {}): Response {
  const {
    id = "tx_1",
    status = "CONFIRMED",
    amount = 49,
    currency = "RUB",
    payload = "order_1",
  } = opts;
  return jsonResponse({
    body: {
      id,
      status,
      paymentDetails: { amount, currency },
      payload,
      paymentMethod: "SBPQR",
    },
  });
}

/** Callback body as Platega sends it. */
export function callbackBody(opts: {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  payload?: string;
} = {}): unknown {
  const {
    id = "tx_1",
    amount = 49,
    currency = "RUB",
    status = "CONFIRMED",
    payload = "order_1",
  } = opts;
  return { id, amount, currency, status, payload };
}
