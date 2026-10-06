// POST /api/orders renew/upgrade vectors (PAY-02/PAY-03, D-42..D-45):
// a renew/upgrade on an owned NON-trial key is accepted with a server-quoted
// amount and the keyId persisted; a trial key is rejected 409 with the clean
// trial-family signal (never a raw provider error, never a Platega call); a key
// the caller does not own is indistinguishable from a missing key (404, no
// oracle); an upgrade beyond the 10-device ceiling is 400; and no session is
// 401 with no provider call. Runs against the real local Postgres with a
// URL-dispatching fetch stub (ARTEMIDA + Platega) so no network is hit.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { POST } from "../../app/api/orders/route";
import { signSession } from "../../lib/auth";
import { TRIAL_ERROR_CODE, isTrialConflict } from "../../lib/orders-service";
import { prisma } from "../../lib/prisma";
import { jsonResponse, success } from "../helpers/fake-fetch";

const OWNER = BigInt("200000410");
const OTHER = BigInt("200000411");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

const OWNED_KEY = "key_owned_route";
const TRIAL_KEY = "key_trial_route";
const OTHER_KEY = "key_other_route";

let userId: number;
let otherUserId: number;

async function cleanup(): Promise<void> {
  for (const telegramId of [OWNER, OTHER]) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      await prisma.keyCache.deleteMany({ where: { userId: user.id } });
    }
    await prisma.user.deleteMany({ where: { telegramId } });
  }
}

async function seedKey(
  ownerId: number,
  keyId: string,
  overrides: { isTrial?: boolean; deviceLimit?: number | null; devices?: number } = {},
): Promise<void> {
  await prisma.keyCache.create({
    data: {
      userId: ownerId,
      keyId,
      status: "ACTIVE",
      isTrial: overrides.isTrial ?? false,
      deviceLimit: overrides.deviceLimit === undefined ? 2 : overrides.deviceLimit,
      devices: overrides.devices ?? 2,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      customerRef: String(OWNER),
    },
  });
}

async function authorize(telegramId: number): Promise<void> {
  session.token = await signSession(telegramId, SECRET);
}

/**
 * Pricing envelope carrying BOTH the `new`/`renew` quote (`quote.amount`) and
 * the observed `apiPricing` document the local upgrade derivation reads.
 */
function pricingEnvelope(): unknown {
  return success({
    quote: { amount: 120, currency: "RUB", days: 30, devices: 2 },
    segment: { currency: "RUB" },
    apiPricing: {
      devicePricePerMonth: 60,
      deviceTiers: [{ from: 0, price: 60 }],
      volume: { keys: 1, devices: 2 },
      upgradeRule:
        "tier device price per added device; minimum one full month, proportional above 30 remaining days",
    },
  });
}

/** URL-dispatching fetch stub: ARTEMIDA pricing + Platega create, no network. */
function installFetch(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("artemida.test")) {
      return jsonResponse({ body: pricingEnvelope() });
    }
    if (url.includes("platega.test")) {
      return jsonResponse({
        body: {
          transactionId: "tx_route",
          url: "https://pay.platega.test/route",
          status: "PENDING",
        },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  await cleanup();
  const owner = await prisma.user.create({ data: { telegramId: OWNER }, select: { id: true } });
  userId = owner.id;
  const other = await prisma.user.create({ data: { telegramId: OTHER }, select: { id: true } });
  otherUserId = other.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

beforeEach(async () => {
  session.token = undefined;
  await prisma.outbox.deleteMany({ where: { order: { userId: { in: [userId, otherUserId] } } } });
  await prisma.order.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.keyCache.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await seedKey(userId, OWNED_KEY);
  await seedKey(userId, TRIAL_KEY, { isTrial: true });
  await seedKey(otherUserId, OTHER_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/orders — renew (PAY-02, D-42..D-45)", () => {
  it("accepts renew on an owned non-trial key with a server-quoted amount + keyId", async () => {
    await authorize(Number(OWNER));
    installFetch();

    const res = await post({ kind: "renew", keyId: OWNED_KEY, days: 30 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://pay.platega.test/route" });
    const order = await prisma.order.findFirst({ where: { userId } });
    expect(order).toMatchObject({
      kind: "renew",
      keyId: OWNED_KEY,
      days: 30,
      devices: 2,
      amount: 120,
      currency: "RUB",
      status: "pending",
    });
  });

  it("rejects renew on a trial key with the clean 409 trial signal and never calls Platega", async () => {
    await authorize(Number(OWNER));
    const fetchSpy = installFetch();

    const res = await post({ kind: "renew", keyId: TRIAL_KEY, days: 30 });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "trial" });
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 (no oracle) for a key the caller does not own and never calls Platega", async () => {
    await authorize(Number(OWNER));
    const fetchSpy = installFetch();

    const res = await post({ kind: "renew", keyId: OTHER_KEY, days: 30 });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for a completely unknown keyId", async () => {
    await authorize(Number(OWNER));
    installFetch();

    const res = await post({ kind: "renew", keyId: "key_does_not_exist", days: 30 });

    expect(res.status).toBe(404);
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
  });
});

describe("POST /api/orders — upgrade (PAY-03, D-42..D-45)", () => {
  it("accepts upgrade on an owned non-trial key with the prorated server quote", async () => {
    await authorize(Number(OWNER));
    installFetch();

    const res = await post({ kind: "upgrade", keyId: OWNED_KEY, addDevices: 1 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://pay.platega.test/route" });
    const order = await prisma.order.findFirst({ where: { userId } });
    expect(order).toMatchObject({
      kind: "upgrade",
      keyId: OWNED_KEY,
      devices: 1, // stored as the addDevices delta the worker sends to the provider
      amount: 60, // observed prorated +1 device / 30d → 60 RUB
      status: "pending",
    });
  });

  it("rejects an upgrade pushing past the 10-device ceiling with 400 and no provider call", async () => {
    await authorize(Number(OWNER));
    const fetchSpy = installFetch();

    const res = await post({ kind: "upgrade", keyId: OWNED_KEY, addDevices: 9 });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects upgrade on a trial key with the clean 409 trial signal", async () => {
    await authorize(Number(OWNER));
    const fetchSpy = installFetch();

    const res = await post({ kind: "upgrade", keyId: TRIAL_KEY, addDevices: 1 });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "trial" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("trial-family parity: BFF pre-check and worker conflict share one code (D-44)", () => {
  it("the BFF trial rejection and the worker's provider-conflict mapping are identical", async () => {
    await authorize(Number(OWNER));
    installFetch();

    const res = await post({ kind: "renew", keyId: TRIAL_KEY, days: 30 });
    const body = (await res.json()) as { error: string };

    // BFF misuses no code other than the shared trial-family signal.
    expect(res.status).toBe(409);
    expect(body.error).toBe(TRIAL_ERROR_CODE);
    // The worker's provider `conflict` maps to that same signal — neither layer
    // ever surfaces a raw provider 409/code.
    expect(isTrialConflict("conflict")).toBe(true);
    expect(TRIAL_ERROR_CODE).not.toBe("conflict");
  });
});

describe("POST /api/orders — session gate", () => {
  it("returns 401 with no session and never calls a provider", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch must not be called without a session");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await post({ kind: "renew", keyId: OWNED_KEY, days: 30 });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
