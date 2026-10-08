// Promo code tracer: discount math, validation states, atomic consumption
// (single-use code survives a double-consume race), admin gate + CRUD,
// pricing preview with promo, and order-time promo (discounted Platega
// amount + snapshot).
//
// Runs against the real local Postgres with a URL-dispatching fetch stub
// (ARTEMIDA + Platega, order-route pattern) so no network is hit. Throwaway
// codes only, cleaned up.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as promosGET, POST as promosPOST } from "../../app/api/admin/promos/route";
import { DELETE as promosDELETE } from "../../app/api/admin/promos/[id]/route";
import { POST as ordersPOST } from "../../app/api/orders/route";
import { GET as pricingGET } from "../../app/api/pricing/route";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  applyDiscount,
  consumePromo,
  createPromo,
  deletePromo,
  isPromoUsable,
  listPromos,
  normalizePromoCode,
  validatePromo,
} from "../../lib/promo";
import { jsonResponse, success } from "../helpers/fake-fetch";

const ADMIN_TG = BigInt("910000201");
const BUYER_TG = BigInt("910000202");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

const RUN = Date.now().toString(36).toUpperCase();
const CODE_PCT = `T-PCT-${RUN}`;
const CODE_ONCE = `T-ONCE-${RUN}`;
const CODE_ADMIN = `T-ADM-${RUN}`;
const CODE_ORDER = `T-ORD-${RUN}`;
const CODE_PREVIEW = `T-PRV-${RUN}`;
const CODES = [CODE_PCT, CODE_ONCE, CODE_ADMIN, CODE_ORDER, CODE_PREVIEW];

let buyerId = 0;

async function cleanup(): Promise<void> {
  for (const telegramId of [ADMIN_TG, BUYER_TG]) {
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
  await prisma.promoCode.deleteMany({ where: { code: { in: CODES } } });
  await prisma.adminUser.deleteMany({ where: { telegramId: ADMIN_TG } });
}

async function authorize(telegramId: bigint): Promise<void> {
  session.token = await signSession(Number(telegramId), SECRET);
}

function pricingEnvelope(): unknown {
  return success({
    quote: { amount: 1000, currency: "RUB", days: 30, devices: 2 },
    segment: { currency: "RUB" },
    apiPricing: {
      devicePricePerMonth: 500,
      deviceTiers: [{ from: 0, price: 500 }],
      volume: { keys: 1, devices: 2 },
      upgradeRule: "x",
    },
  });
}

/** URL-dispatching fetch stub: ARTEMIDA pricing + Platega create, no network. */
function installFetch(): void {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("artemida.test")) {
      return jsonResponse({ body: pricingEnvelope() });
    }
    if (url.includes("platega.test")) {
      return jsonResponse({
        body: {
          transactionId: `tx_${RUN}`,
          url: "https://pay.platega.test/promo",
          status: "PENDING",
        },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", spy);
}

describe("promo math (pure)", () => {
  it("normalizes codes case-insensitively", () => {
    expect(normalizePromoCode("  sale-10 ")).toBe("SALE-10");
  });

  it("applies percentage and fixed discounts, floored at zero", () => {
    expect(applyDiscount(1000, { discount: 10, type: "percentage" })).toBe(900);
    expect(applyDiscount(999, { discount: 10, type: "percentage" })).toBe(900);
    expect(applyDiscount(1000, { discount: 250, type: "fixed" })).toBe(750);
    expect(applyDiscount(100, { discount: 500, type: "fixed" })).toBe(0);
  });

  it("flags exhausted and expired codes unusable", () => {
    const base = { maxUses: null as number | null, usedCount: 0, expiresAt: null as Date | null };
    expect(isPromoUsable(base)).toBe(true);
    expect(isPromoUsable({ ...base, maxUses: 1, usedCount: 1 })).toBe(false);
    expect(isPromoUsable({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
  });
});

describe("promo validate + consume (DB)", () => {
  beforeAll(async () => {
    await cleanup();
    await createPromo({ code: CODE_PCT, discount: 10, type: "percentage" });
    await createPromo({ code: CODE_ONCE, discount: 5, type: "percentage", maxUses: 1 });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates a percentage code against an amount", async () => {
    const result = await validatePromo(CODE_PCT.toLowerCase(), 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalAmount).toBe(900);
      expect(result.row.code).toBe(CODE_PCT);
    }
  });

  it("returns not_found for unknown and malformed codes", async () => {
    await expect(validatePromo("NOPE-XYZ", 1000)).resolves.toMatchObject({ ok: false });
    await expect(validatePromo("!!", 1000)).resolves.toMatchObject({ ok: false });
  });

  it("consumes a single-use code exactly once (race-safe)", async () => {
    const [first, second] = await Promise.all([consumePromo(CODE_ONCE), consumePromo(CODE_ONCE)]);
    const winners = [first, second].filter((row) => row !== null);
    expect(winners).toHaveLength(1);
    await expect(validatePromo(CODE_ONCE, 1000)).resolves.toMatchObject({
      ok: false,
      reason: "exhausted",
    });
  });

  it("lists and deletes codes (admin CRUD primitives)", async () => {
    const rows = await listPromos();
    expect(rows.map((row) => row.code)).toContain(CODE_PCT);
    const target = rows.find((row) => row.code === CODE_PCT);
    expect(target).toBeDefined();
    await expect(deletePromo(target!.id)).resolves.toBe(true);
    await expect(deletePromo(target!.id)).resolves.toBe(false);
  });
});

describe("admin promo routes (gate + CRUD)", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.adminUser.create({
      data: { telegramId: ADMIN_TG, role: "administrator" },
    });
    const row = await prisma.user.create({
      data: { telegramId: ADMIN_TG },
      select: { id: true },
    });
    void row;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 signed out and 404 for a non-admin telegram user", async () => {
    session.token = undefined;
    await expect(promosGET()).resolves.toMatchObject({ status: 401 });
    await authorize(BUYER_TG);
    // BUYER_TG has no users row → legacy tid token resolves nothing → the
    // role gate treats it as non-staff (404, never a distinct forbidden).
    await expect(promosGET()).resolves.toMatchObject({ status: 404 });
  });

  it("creates, lists, rejects duplicates, and deletes a code", async () => {
    await authorize(ADMIN_TG);
    const created = await promosPOST(
      new Request("http://localhost/api/admin/promos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: CODE_ADMIN.toLowerCase(), discount: 15, type: "percentage" }),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { promo: { id: string; code: string } };
    expect(createdBody.promo.code).toBe(CODE_ADMIN);

    const listed = await promosGET();
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { promos: { code: string }[] };
    expect(listedBody.promos.map((row) => row.code)).toContain(CODE_ADMIN);

    const dup = await promosPOST(
      new Request("http://localhost/api/admin/promos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: CODE_ADMIN, discount: 15, type: "percentage" }),
      }),
    );
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: "code_taken" });

    const deleted = await promosDELETE(
      new Request(`http://localhost/api/admin/promos/${createdBody.promo.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: createdBody.promo.id }) },
    );
    expect(deleted.status).toBe(200);
    await expect(
      promosDELETE(
        new Request(`http://localhost/api/admin/promos/${createdBody.promo.id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: createdBody.promo.id }) },
      ),
    ).resolves.toMatchObject({ status: 404 });
  });

  it("rejects invalid bodies with 400", async () => {
    await authorize(ADMIN_TG);
    const res = await promosPOST(
      new Request("http://localhost/api/admin/promos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "X", discount: 150, type: "percentage" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("pricing preview + order with promo", () => {
  beforeAll(async () => {
    await cleanup();
    await createPromo({ code: CODE_PREVIEW, discount: 10, type: "percentage" });
    await createPromo({ code: CODE_ORDER, discount: 100, type: "fixed" });
    const row = await prisma.user.create({
      data: { telegramId: BUYER_TG },
      select: { id: true },
    });
    buyerId = row.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews the discounted price without consuming", async () => {
    await authorize(BUYER_TG);
    installFetch();
    const res = await pricingGET(
      new Request(
        `http://localhost/api/pricing?days=30&devices=2&promo=${CODE_PREVIEW.toLowerCase()}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      price: number;
      promo: { code: string; finalPrice: number } | null;
    };
    expect(body.price).toBe(1000);
    expect(body.promo?.code).toBe(CODE_PREVIEW);
    expect(body.promo?.finalPrice).toBe(900);
    const row = await prisma.promoCode.findUnique({ where: { code: CODE_PREVIEW } });
    expect(row?.usedCount).toBe(0);
  });

  it("previews an invalid code as promo:null with the list price", async () => {
    await authorize(BUYER_TG);
    installFetch();
    const res = await pricingGET(
      new Request("http://localhost/api/pricing?days=30&devices=2&promo=NOPE-XYZ"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { price: number; promo: null };
    expect(body.price).toBe(1000);
    expect(body.promo).toBeNull();
  });

  it("charges the discounted amount and snapshots the code on the order", async () => {
    await authorize(BUYER_TG);
    installFetch();
    const res = await ordersPOST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", days: 30, devices: 2, promoCode: CODE_ORDER }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://pay.platega.test/promo" });
    const order = await prisma.order.findFirst({
      where: { userId: buyerId, promoCode: CODE_ORDER },
      select: { amount: true, finalAmount: true, promoCode: true },
    });
    expect(order).toMatchObject({ amount: 1000, finalAmount: 900, promoCode: CODE_ORDER });
    const row = await prisma.promoCode.findUnique({ where: { code: CODE_ORDER } });
    expect(row?.usedCount).toBe(1);
  });

  it("rejects an unknown promo at order time with 400 promo_invalid", async () => {
    await authorize(BUYER_TG);
    installFetch();
    const res = await ordersPOST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", days: 30, devices: 2, promoCode: "NOPE-XYZ" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "promo_invalid" });
  });
});
