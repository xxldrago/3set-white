// Retail pricing model: markup over the provider quote + a small manual grid.
//
// The device ceiling is 9999, so a per-cell price table cannot cover the range.
// The PRIMARY lever is a global markup (percent or fixed RUB) applied to the live
// ARTEMIDA quote; an exact manual cell still wins for the small range
// (≤ TARIFF_GRID_MAX_DEVICES). These vectors pin that precedence and the
// rounding/floor rules, plus the route-level guards that keep a bad markup from
// ever reaching a charge.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as adminGet, PATCH as adminPatch, PUT as adminPut } from "../../app/api/admin/pricing/route";
import { GET as pricingGet } from "../../app/api/pricing/route";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  DEFAULT_MARKUP,
  applyMarkup,
  getTariffMarkup,
  replaceTariffGrid,
  resolveTariffQuote,
  setTariffMarkup,
} from "../../lib/pricing";
import {
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_DEVICES,
} from "../../lib/tariff-grid";

const ADMIN_TG = 900910;
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Minimal provider `/pricing` envelope with a fixed quote amount. */
function providerPricing(amount: number) {
  return {
    ok: true,
    data: {
      quote: { amount, currency: "RUB", days: 30, devices: 2 },
      apiPricing: {
        devicePricePerMonth: 60,
        deviceTiers: [{ from: 0, price: 60 }],
        volume: { keys: 1, devices: 2 },
        upgradeRule: "x",
      },
    },
    meta: { requestId: "req_test" },
  };
}

async function cleanup(): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key: { in: ["pricing.markupKind", "pricing.markupValue"] } },
  });
  await prisma.tariffPrice.deleteMany({});
  await prisma.adminUser.deleteMany({ where: { telegramId: BigInt(ADMIN_TG) } });
  await prisma.user.deleteMany({ where: { telegramId: BigInt(ADMIN_TG) } });
}

async function adminSession(): Promise<void> {
  session.token = await signSession(ADMIN_TG, SECRET);
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const plain = () => new Request("http://localhost");

beforeAll(async () => {
  await cleanup();
  await prisma.user.create({ data: { telegramId: BigInt(ADMIN_TG) }, select: { id: true } });
  await prisma.adminUser.create({ data: { telegramId: BigInt(ADMIN_TG), role: "administrator" } });
});

afterAll(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  session.token = undefined;
  await prisma.setting.deleteMany({
    where: { key: { in: ["pricing.markupKind", "pricing.markupValue"] } },
  });
  await prisma.tariffPrice.deleteMany({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tariff grid dimensions", () => {
  it("offers the five provider-native terms", () => {
    expect([...TARIFF_DAYS]).toEqual([7, 30, 90, 180, 365]);
  });

  it("covers the provider device range while keeping the manual grid small", () => {
    expect(TARIFF_MIN_DEVICES).toBe(1);
    expect(TARIFF_MAX_DEVICES).toBe(9999);
    // A per-cell table for 9999 devices would be ~50k inputs — the grid must
    // stay editable by hand.
    expect(TARIFF_GRID_MAX_DEVICES).toBeLessThanOrEqual(25);
    expect(TARIFF_DAYS.length * TARIFF_GRID_MAX_DEVICES).toBeLessThanOrEqual(100);
  });
});

describe("applyMarkup — rounding and floor", () => {
  it("adds a percent markup", () => {
    expect(applyMarkup(1000, { kind: "percent", value: 30 })).toBe(1300);
    expect(applyMarkup(1000, { kind: "percent", value: 0 })).toBe(1000);
  });

  it("adds a fixed markup in whole RUB", () => {
    expect(applyMarkup(540, { kind: "fixed", value: 100 })).toBe(640);
  });

  it("rounds half-up so a fraction never silently favours the buyer", () => {
    // 120 × 1.075 = 129.0 → 129; 121 × 1.005 = 121.605 → 122.
    expect(applyMarkup(121, { kind: "percent", value: 0.5 })).toBe(122);
  });

  it("never returns a free order (clamped to 1 RUB)", () => {
    expect(applyMarkup(0, { kind: "percent", value: 50 })).toBe(1);
  });
});

describe("markup settings persistence", () => {
  it("defaults to no markup when nothing is stored", async () => {
    await expect(getTariffMarkup()).resolves.toEqual(DEFAULT_MARKUP);
  });

  it("round-trips percent and fixed markups", async () => {
    await setTariffMarkup({ kind: "percent", value: 25 });
    await expect(getTariffMarkup()).resolves.toEqual({ kind: "percent", value: 25 });

    await setTariffMarkup({ kind: "fixed", value: 300 });
    await expect(getTariffMarkup()).resolves.toEqual({ kind: "fixed", value: 300 });
  });

  it("keeps fractional percents but rounds fixed amounts to whole RUB", async () => {
    await setTariffMarkup({ kind: "percent", value: 7.55 });
    await expect(getTariffMarkup()).resolves.toEqual({ kind: "percent", value: 7.55 });

    await setTariffMarkup({ kind: "fixed", value: 99.6 });
    await expect(getTariffMarkup()).resolves.toEqual({ kind: "fixed", value: 100 });
  });

  it("rejects out-of-range values", async () => {
    await expect(setTariffMarkup({ kind: "percent", value: -1 })).rejects.toThrow();
    await expect(setTariffMarkup({ kind: "percent", value: 5000 })).rejects.toThrow();
    await expect(setTariffMarkup({ kind: "fixed", value: 0.5 })).resolves.toBeDefined();
  });
});

describe("resolveTariffQuote — manual cell wins over markup", () => {
  it("uses an exact manual cell without touching the provider", async () => {
    await replaceTariffGrid([{ days: 30, devices: 2, amount: 400 }], ADMIN_TG);
    const fetchSpy = vi.fn(() => {
      throw new Error("provider must not be called for a manual row");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(resolveTariffQuote(30, 2)).resolves.toEqual({
      amount: 400,
      currency: "RUB",
      source: "manual",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("applies the markup to the provider quote outside the grid", async () => {
    await setTariffMarkup({ kind: "percent", value: 50 });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(1000))));

    // 100 devices is above TARIFF_GRID_MAX_DEVICES, so no manual cell can exist.
    await expect(resolveTariffQuote(30, 100)).resolves.toMatchObject({
      amount: 1500,
      source: "provider",
    });
  });

  it("applies a fixed markup to the provider quote", async () => {
    await setTariffMarkup({ kind: "fixed", value: 150 });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(990))));

    await expect(resolveTariffQuote(365, 2)).resolves.toMatchObject({
      amount: 1140,
      source: "provider",
    });
  });

  it("ignores a manual cell for a term that is not offered", async () => {
    // 60 days is a provider period but NOT storefront-offered; the guard rejects
    // it before any lookup or provider call.
    const fetchSpy = vi.fn(async () => jsonResponse(providerPricing(100)));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(resolveTariffQuote(60, 2)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts the full device range without a manual grid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(499970))));

    await expect(resolveTariffQuote(30, 9999)).resolves.toMatchObject({ amount: 499970 });
  });
});

describe("GET /api/pricing — markup is what the storefront shows", () => {
  it("returns the manual price when a cell exists", async () => {
    await adminSession();
    await replaceTariffGrid([{ days: 90, devices: 2, amount: 900 }], ADMIN_TG);

    const res = await pricingGet(new Request("http://localhost?days=90&devices=2"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 900 });
  });

  it("returns the marked-up provider price otherwise", async () => {
    await adminSession();
    await setTariffMarkup({ kind: "percent", value: 20 });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(1000))));

    const res = await pricingGet(new Request("http://localhost?days=30&devices=5"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 1200 });
  });
});

describe("PATCH /api/admin/pricing — markup BFF", () => {
  it("rejects a non-administrator", async () => {
    const res = await adminPatch(patchRequest({ kind: "percent", value: 10 }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid markup body", async () => {
    await adminSession();

    expect((await adminPatch(patchRequest({ kind: "percent", value: -5 }))).status).toBe(400);
    expect((await adminPatch(patchRequest({ kind: "bogus", value: 10 }))).status).toBe(400);
    expect((await adminPatch(patchRequest({ kind: "fixed", value: 1.5 }))).status).toBe(400);
    expect((await adminPatch(patchRequest({}))).status).toBe(400);
  });

  it("saves a valid markup and returns it", async () => {
    await adminSession();

    const res = await adminPatch(patchRequest({ kind: "percent", value: 15 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ markup: { kind: "percent", value: 15 } });
    await expect(getTariffMarkup()).resolves.toEqual({ kind: "percent", value: 15 });
  });
});

describe("GET/PUT /api/admin/pricing — grid stays bounded", () => {
  it("rejects a grid row above the manual ceiling", async () => {
    await adminSession();

    const res = await adminPut(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: [{ days: 30, devices: TARIFF_GRID_MAX_DEVICES + 1, amount: 100 }],
        }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns both the grid and the markup", async () => {
    await adminSession();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(100))));
    await replaceTariffGrid([{ days: 7, devices: 1, amount: 100 }], ADMIN_TG);
    await setTariffMarkup({ kind: "fixed", value: 50 });

    const res = await adminGet();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; markup: unknown };
    expect(body.rows).toHaveLength(1);
    expect(body.markup).toEqual({ kind: "fixed", value: 50 });
  });
});
