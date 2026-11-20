// Retail pricing model: per-device markup over the live ARTEMIDA quote.
//
// The primary lever is a fixed RUB markup PER DEVICE for each offered term:
//   7d 33, 30d 140, 90d 350, 180d 680, 365d 1405.
// The storefront minimum is 2 devices. An exact manual cell still wins for the
// small range (≤ TARIFF_GRID_MAX_DEVICES). These vectors pin the calibration,
// the per-device multiplication, and the route-level guards.
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
  applyMarkup,
  getAllMarkupsPerDevice,
  getMarkupPerDevice,
  replaceTariffGrid,
  resolveTariffQuote,
  setMarkupPerDevice,
} from "../../lib/pricing";
import {
  MARKUP_PER_DEVICE,
  TARIFF_DAYS,
  TARIFF_GRID_MAX_DEVICES,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_DEVICES,
} from "../../lib/tariff-grid";

const ADMIN_TG = 900910;
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

const MARKUP_KEYS = TARIFF_DAYS.map((d) => `pricing.markupPerDevice.${d}`);

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
  await prisma.setting.deleteMany({ where: { key: { in: MARKUP_KEYS } } });
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
  await prisma.setting.deleteMany({ where: { key: { in: MARKUP_KEYS } } });
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

  it("sells from 2 up to 9999 devices while keeping the manual grid small", () => {
    expect(TARIFF_MIN_DEVICES).toBe(2);
    expect(TARIFF_MAX_DEVICES).toBe(9999);
    expect(TARIFF_GRID_MAX_DEVICES).toBeLessThanOrEqual(25);
    expect(TARIFF_DAYS.length * TARIFF_GRID_MAX_DEVICES).toBeLessThanOrEqual(100);
  });
});

describe("per-device markup calibration", () => {
  it("is locked to the owner's values", () => {
    expect(MARKUP_PER_DEVICE).toEqual({ 7: 33, 30: 140, 90: 350, 180: 680, 365: 1405 });
  });

  it("yields 400 RUB for 2 devices and +200 per device at 30 days", () => {
    const provider = 120; // live ARTEMIDA quote for 30d/2 devices
    expect(applyMarkup(provider, 30, 2, MARKUP_PER_DEVICE[30])).toBe(400);
    expect(applyMarkup(180, 30, 3, MARKUP_PER_DEVICE[30])).toBe(600);
    expect(applyMarkup(240, 30, 4, MARKUP_PER_DEVICE[30])).toBe(800);
  });

  it("adds the markup to the provider price for every term", () => {
    expect(applyMarkup(49, 7, 2, 33)).toBe(115);
    expect(applyMarkup(300, 90, 2, 350)).toBe(1000);
    expect(applyMarkup(540, 180, 2, 680)).toBe(1900);
    expect(applyMarkup(990, 365, 2, 1405)).toBe(3800);
  });

  it("clamps to a whole-RUB floor", () => {
    expect(applyMarkup(0, 30, 2, 0)).toBe(1);
  });
});

describe("markup settings persistence", () => {
  it("defaults to the locked value when nothing is stored", async () => {
    await expect(getMarkupPerDevice(30)).resolves.toBe(140);
    await expect(getAllMarkupsPerDevice()).resolves.toEqual(MARKUP_PER_DEVICE);
  });

  it("round-trips a saved per-device markup", async () => {
    await setMarkupPerDevice(30, 200);
    await expect(getMarkupPerDevice(30)).resolves.toBe(200);
    expect((await getAllMarkupsPerDevice())[30]).toBe(200);
  });

  it("rejects out-of-range values and unknown terms", async () => {
    await expect(setMarkupPerDevice(30, -1)).rejects.toThrow();
    await expect(setMarkupPerDevice(30, 1.5)).rejects.toThrow();
    await expect(setMarkupPerDevice(60, 100)).rejects.toThrow();
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

  it("applies the per-device markup above the grid ceiling", async () => {
    await setMarkupPerDevice(30, 140);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(1000))));

    // 100 devices is above TARIFF_GRID_MAX_DEVICES, so no manual cell can exist.
    await expect(resolveTariffQuote(30, 100)).resolves.toMatchObject({
      amount: 1000 + 140 * 100,
      source: "provider",
    });
  });

  it("uses the term's own markup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(990))));

    await expect(resolveTariffQuote(365, 2)).resolves.toMatchObject({
      amount: 990 + 1405 * 2,
      source: "provider",
    });
  });

  it("rejects a term that is not offered", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(providerPricing(100)));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(resolveTariffQuote(60, 2)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects fewer than 2 devices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(110))));
    await expect(resolveTariffQuote(30, 1)).rejects.toThrow();
  });

  it("accepts the full device range without a manual grid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(499970))));

    await expect(resolveTariffQuote(30, 9999)).resolves.toMatchObject({
      amount: 499970 + 140 * 9999,
    });
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

  it("returns provider + per-device markup otherwise", async () => {
    await adminSession();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(1000))));

    const res = await pricingGet(new Request("http://localhost?days=30&devices=5"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 1000 + 140 * 5 });
  });
});

describe("PATCH /api/admin/pricing — per-device markup BFF", () => {
  it("rejects a non-administrator", async () => {
    const res = await adminPatch(patchRequest({ days: 30, value: 10 }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid markup body", async () => {
    await adminSession();

    expect((await adminPatch(patchRequest({ days: 30, value: -5 }))).status).toBe(400);
    expect((await adminPatch(patchRequest({ days: 60, value: 10 }))).status).toBe(400);
    expect((await adminPatch(patchRequest({ days: 30, value: 1.5 }))).status).toBe(400);
    expect((await adminPatch(patchRequest({}))).status).toBe(400);
  });

  it("saves a valid markup and returns it", async () => {
    await adminSession();

    const res = await adminPatch(patchRequest({ days: 30, value: 15 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: 30, value: 15 });
    await expect(getMarkupPerDevice(30)).resolves.toBe(15);
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

  it("returns both the grid and the per-device markups", async () => {
    await adminSession();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(providerPricing(100))));
    await replaceTariffGrid([{ days: 7, devices: 2, amount: 100 }], ADMIN_TG);
    await setMarkupPerDevice(30, 200);

    const res = await adminGet();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; markups: Record<number, number> };
    expect(body.rows).toHaveLength(1);
    expect(body.markups).toMatchObject({ 7: 33, 30: 200, 90: 350 });
  });
});
