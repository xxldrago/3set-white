// Platega client transport vectors (T-03-create-retry / T-03-secret): the
// `url ?? redirect` endpoint normalization, typed error codes, timing-safe
// header verification, and the load-bearing guarantee that `createTransaction`
// is NEVER auto-retried (no idempotency contract). Fetch is injected — no
// network is ever touched.
import { describe, expect, it } from "vitest";
import { createPlategaClient, PlategaError, verifyPlategaHeaders } from "../../lib/platega";
import {
  capturingFetch,
  createRedirectResponse,
  createResponse,
  statusResponse,
} from "../helpers/fake-platega";
import { jsonResponse, objectError, sequenceFetch } from "../helpers/fake-fetch";

const FAST = { retries: 2, minTimeout: 0, maxTimeout: 0, factor: 1 };

const CREATE_INPUT = {
  amount: 49,
  currency: "RUB",
  description: "Order order_1",
  returnUrl: "http://localhost:3000/payments/order_1",
  failedUrl: "http://localhost:3000/payments/order_1",
  payload: "order_1",
  metadata: { userId: "424242", userName: "424242" },
};

describe("platega client — createTransaction", () => {
  it("normalizes `url` and sends X-MerchantId/X-Secret with the no-method body", async () => {
    const cap = capturingFetch([createResponse("tx_1", "https://pay.platega.io/?id=tx_1")]);
    const client = createPlategaClient({ fetch: cap.fetch, retry: FAST });

    const tx = await client.createTransaction(CREATE_INPUT);

    expect(tx).toEqual({
      transactionId: "tx_1",
      url: "https://pay.platega.io/?id=tx_1",
      status: "PENDING",
    });
    expect(cap.calls[0]?.method).toBe("POST");
    expect(cap.calls[0]?.url).toContain("/v2/transaction/process");
    expect(cap.calls[0]?.headers["X-MerchantId"]).toBe("unit-test-merchant-id");
    expect(cap.calls[0]?.headers["X-Secret"]).toBe("unit-test-platega-secret");
    const body = JSON.parse(cap.calls[0]?.body ?? "{}");
    expect(body.paymentMethod).toBeUndefined();
    expect(body.paymentDetails).toEqual({ amount: 49, currency: "RUB" });
    expect(body.payload).toBe("order_1");
    expect(body.metadata).toEqual({ userId: "424242", userName: "424242" });
  });

  it("normalizes `redirect` (method-specified endpoint shape)", async () => {
    const cap = capturingFetch([createRedirectResponse()]);
    const client = createPlategaClient({ fetch: cap.fetch, retry: FAST });

    await expect(client.createTransaction(CREATE_INPUT)).resolves.toMatchObject({
      transactionId: "tx_redir",
      url: "https://pay.platega.io/?id=tx_redir",
    });
  });

  it("NEVER retries a create — a 5xx is attempted exactly once", async () => {
    const seq = sequenceFetch([
      jsonResponse({ status: 500, body: objectError("server_error") }),
      createResponse(),
    ]);
    const client = createPlategaClient({ fetch: seq.fetch, retry: FAST });

    await expect(client.createTransaction(CREATE_INPUT)).rejects.toMatchObject({
      code: "server_error",
    });
    expect(seq.calls()).toBe(1); // no retry, no second transaction
  });

  it("maps 401 to unauthorized and 400 to bad_request without retrying", async () => {
    const auth = createPlategaClient({
      fetch: capturingFetch([jsonResponse({ status: 401, body: objectError("auth") })]).fetch,
      retry: FAST,
    });
    await expect(auth.createTransaction(CREATE_INPUT)).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });

    const bad = createPlategaClient({
      fetch: capturingFetch([jsonResponse({ status: 400, body: objectError("bad") })]).fetch,
      retry: FAST,
    });
    await expect(bad.createTransaction(CREATE_INPUT)).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("throws a typed error (not a ZodError) when the 200 body has no payable URL", async () => {
    const client = createPlategaClient({
      fetch: capturingFetch([jsonResponse({ body: { status: "PENDING" } })]).fetch,
      retry: FAST,
    });
    const err = (await client.createTransaction(CREATE_INPUT).catch((e) => e)) as PlategaError;
    expect(err).toBeInstanceOf(PlategaError);
    expect(err.code).toBe("network");
  });
});

describe("platega client — getTransaction (safe GET, retryable)", () => {
  it("normalizes status + paymentDetails.{amount,currency}", async () => {
    const client = createPlategaClient({
      fetch: capturingFetch([
        statusResponse({ id: "tx_1", status: "CONFIRMED", amount: 49, currency: "RUB" }),
      ]).fetch,
      retry: FAST,
    });

    await expect(client.getTransaction("tx_1")).resolves.toEqual({
      id: "tx_1",
      status: "CONFIRMED",
      amount: 49,
      currency: "RUB",
      payload: "order_1",
    });
  });

  it("accepts the CHARGEBACKED status enum", async () => {
    const client = createPlategaClient({
      fetch: capturingFetch([statusResponse({ status: "CHARGEBACKED" })]).fetch,
      retry: FAST,
    });
    await expect(client.getTransaction("tx_1")).resolves.toMatchObject({
      status: "CHARGEBACKED",
    });
  });

  it("retries a 5xx on the safe GET then succeeds", async () => {
    const seq = sequenceFetch([
      jsonResponse({ status: 503, body: objectError("unavailable") }),
      statusResponse({ status: "CONFIRMED" }),
    ]);
    const client = createPlategaClient({ fetch: seq.fetch, retry: FAST });

    await expect(client.getTransaction("tx_1")).resolves.toMatchObject({
      status: "CONFIRMED",
    });
    expect(seq.calls()).toBe(2);
  });

  it("maps 404 to not_found", async () => {
    const client = createPlategaClient({
      fetch: capturingFetch([jsonResponse({ status: 404, body: objectError("nf") })]).fetch,
      retry: FAST,
    });
    await expect(client.getTransaction("missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("verifyPlategaHeaders (T-03-forge)", () => {
  const good = () =>
    new Headers({ "x-merchantid": "unit-test-merchant-id", "x-secret": "unit-test-platega-secret" });

  it("accepts the exact env pair", () => {
    expect(verifyPlategaHeaders(good())).toBe(true);
  });

  it("rejects a wrong merchant id, wrong secret, or missing header without throwing", () => {
    expect(
      verifyPlategaHeaders(
        new Headers({ "x-merchantid": "attacker", "x-secret": "unit-test-platega-secret" }),
      ),
    ).toBe(false);
    expect(
      verifyPlategaHeaders(
        new Headers({ "x-merchantid": "unit-test-merchant-id", "x-secret": "wrong" }),
      ),
    ).toBe(false);
    expect(verifyPlategaHeaders(new Headers({ "x-merchantid": "unit-test-merchant-id" }))).toBe(
      false,
    );
    expect(verifyPlategaHeaders(new Headers())).toBe(false);
  });

  it("rejects a length-mismatch secret without throwing (timing-safe guard)", () => {
    expect(
      verifyPlategaHeaders(
        new Headers({
          "x-merchantid": "unit-test-merchant-id",
          "x-secret": "unit-test-platega-secret-plus-more",
        }),
      ),
    ).toBe(false);
  });
});
