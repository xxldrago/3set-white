// Growth bundle tracer: balance auto-renew (toggle route + scan) and the
// revenue dashboard reads. Runs against the real local Postgres with a
// URL-dispatching fetch stub (ARTEMIDA + Platega) so no network is hit.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as autorenewGET, POST as autorenewPOST } from "../../app/api/keys/[id]/autorenew/route";
import { signSession } from "../../lib/auth";
import { runAutoRenewScan } from "../../lib/autorenew";
import { prisma } from "../../lib/prisma";
import { loadRevenue } from "../../lib/revenue";
import { jsonResponse, success } from "../helpers/fake-fetch";

const TG = BigInt("930000401");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";
const KEY = "key_autorenew_route";
const TRIAL_KEY = "key_autorenew_trial";

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId: TG }, select: { id: true } });
  if (user) {
    await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.walletTx.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: TG } });
}

async function authorize(): Promise<void> {
  session.token = await signSession(Number(TG), SECRET);
}

function pricingEnvelope(amount = 1000): unknown {
  return success({
    quote: { amount, currency: "RUB", days: 30, devices: 2 },
    segment: { currency: "RUB" },
    apiPricing: {
      devicePricePerMonth: 500,
      deviceTiers: [{ from: 0, price: 500 }],
      volume: { keys: 1, devices: 2 },
      upgradeRule: "x",
    },
  });
}

function installFetch(): void {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("artemida.test")) {
      return jsonResponse({ body: pricingEnvelope() });
    }
    if (url.includes("platega.test")) {
      return jsonResponse({
        body: { transactionId: `tx_auto_${Date.now()}`, url: "https://pay.platega.test/auto", status: "PENDING" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", spy);
}

function autorenewReq(id: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { headers: { "content-type": "application/json" } };
  if (body === undefined) return autorenewGET(new Request(`http://localhost/api/keys/${id}/autorenew`, init), {
    params: Promise.resolve({ id }),
  });
  return autorenewPOST(
    new Request(`http://localhost/api/keys/${id}/autorenew`, {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("autorenew toggle route", () => {
  let userId = 0;
  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({ data: { telegramId: TG }, select: { id: true } });
    userId = row.id;
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: KEY,
        status: "ACTIVE",
        isTrial: false,
        deviceLimit: 2,
        devices: 2,
        expiresAt: new Date(Date.now() + 2 * 86_400_000),
        customerRef: String(TG),
      },
    });
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: TRIAL_KEY,
        status: "ACTIVE",
        isTrial: true,
        expiresAt: new Date(Date.now() + 2 * 86_400_000),
        customerRef: String(TG),
      },
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 without a session", async () => {
    session.token = undefined;
    await expect(autorenewReq(KEY, { enabled: true })).resolves.toMatchObject({ status: 401 });
  });

  it("returns 404 for an unknown key", async () => {
    await authorize();
    await expect(autorenewReq("nope", { enabled: true })).resolves.toMatchObject({ status: 404 });
  });

  it("rejects trial keys with 409", async () => {
    await authorize();
    const res = await autorenewReq(TRIAL_KEY, { enabled: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "trial" });
  });

  it("toggles on and off with a round-trip read", async () => {
    await authorize();
    await expect(autorenewReq(KEY)).resolves.toMatchObject({ status: 200 });
    const on = await autorenewReq(KEY, { enabled: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ ok: true, autoRenew: true });
    const read = await autorenewGET(
      new Request(`http://localhost/api/keys/${KEY}/autorenew`),
      { params: Promise.resolve({ id: KEY }) },
    );
    expect(await read.json()).toEqual({ autoRenew: true });
    const off = await autorenewReq(KEY, { enabled: false });
    expect(await off.json()).toEqual({ ok: true, autoRenew: false });
  });
});

describe("auto-renew scan", () => {
  let userId = 0;
  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({ data: { telegramId: TG }, select: { id: true } });
    userId = row.id;
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: KEY,
        status: "ACTIVE",
        isTrial: false,
        autoRenew: true,
        deviceLimit: 2,
        devices: 2,
        expiresAt: new Date(Date.now() + 2 * 86_400_000),
        customerRef: String(TG),
      },
    });
    // Prior purchase sets the 30-day term; seed wallet covers one renewal.
    await prisma.order.create({
      data: {
        userId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 1000,
        finalAmount: 1000,
        currency: "RUB",
        status: "provisioned",
        keyId: KEY,
        paidAt: new Date(Date.now() - 20 * 86_400_000),
      },
    });
    await prisma.walletTx.create({
      data: { userId, amount: 1000, reason: "referral_bonus", refId: "autoseed" },
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renews from balance: paid order, no Platega leg", async () => {
    installFetch();
    const outcome = await runAutoRenewScan(new Date());
    expect(outcome).toMatchObject({ scanned: 1, renewed: 1, pending: 0 });
    const order = await prisma.order.findFirst({
      where: { userId, kind: "renew" },
      orderBy: { createdAt: "desc" },
      select: { status: true, balanceUsed: true, finalAmount: true },
    });
    expect(order?.status).toBe("paid");
    expect(order?.balanceUsed).toBe(1000);
  });

  it("skips keys with a pending renewal (no duplicates)", async () => {
    // Balance is spent; the next scan mints a pending order instead.
    installFetch();
    const outcome = await runAutoRenewScan(new Date());
    expect(outcome.pending).toBe(1);
    const again = await runAutoRenewScan(new Date());
    expect(again).toMatchObject({ scanned: 1, skipped: 1, pending: 0, renewed: 0 });
  });
});

describe("revenue dashboard", () => {
  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({
      data: { telegramId: TG, trialUsed: true },
      select: { id: true },
    });
    const now = Date.now();
    await prisma.order.createMany({
      data: [
        {
          userId: row.id,
          kind: "new",
          days: 30,
          devices: 2,
          amount: 1000,
          finalAmount: 900,
          balanceUsed: 0,
          promoCode: "DASH10",
          currency: "RUB",
          status: "provisioned",
          paidAt: new Date(now - 2 * 86_400_000),
        },
        {
          userId: row.id,
          kind: "renew",
          days: 30,
          devices: 2,
          amount: 1000,
          finalAmount: 1000,
          balanceUsed: 200,
          currency: "RUB",
          status: "paid",
          paidAt: new Date(now - 1 * 86_400_000),
        },
      ],
    });
  });
  afterAll(async () => {
    await cleanup();
  });

  it("sums captured cash and splits by kind", async () => {
    const data = await loadRevenue(30);
    // Captured = (900 - 0) + (1000 - 200) = 1700.
    expect(data.revenue).toBe(1700);
    expect(data.orders).toBe(2);
    expect(data.avgCheck).toBe(850);
    expect(data.byKind).toContainEqual({ kind: "new", revenue: 900, orders: 1 });
    expect(data.byKind).toContainEqual({ kind: "renew", revenue: 800, orders: 1 });
    expect(data.topPromos).toContainEqual({ code: "DASH10", revenue: 900, orders: 1 });
    expect(data.trialConversion).toMatchObject({ trials: 1, converted: 1 });
  });
});
