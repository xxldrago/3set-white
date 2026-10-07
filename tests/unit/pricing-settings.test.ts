// Admin tariff settings (retail price grid) vectors.
//
// The manual grid is the single source for displayed AND charged amounts:
// /api/pricing, createOrder (incl. renew) and the bot display resolve through
// resolveTariffQuote; upgrade deltas derive from the same base-grid month unit
// with provider-tier fallback. Unset combos fall back to the live provider
// quote. The admin BFF is administrator-only (401/404/200). Runs against the
// real local Postgres; the tariff table is fully cleaned per test so parallel
// billing suites are unaffected (exotic (days,10) combos only).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as adminGet, PUT as adminPut } from "../../app/api/admin/pricing/route";
import { GET as pricingGet } from "../../app/api/pricing/route";
import { POST as ordersPost } from "../../app/api/orders/route";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  listTariffPrices,
  replaceTariffGrid,
  resolveTariffQuote,
  resolveUpgradeQuote,
} from "../../lib/pricing";
import { jsonResponse, success } from "../helpers/fake-fetch";

const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

const ADMIN_TG = 920000101;
let buyerId: number;

async function cleanup(): Promise<void> {
  await prisma.tariffPrice.deleteMany({});
  const buyer = await prisma.user.findFirst({
    where: { email: "tariff-buyer-05@example.test" },
    select: { id: true },
  });
  if (buyer) {
    await prisma.order.deleteMany({ where: { userId: buyer.id } });
    await prisma.user.deleteMany({ where: { id: buyer.id } });
  }
  await prisma.adminUser.deleteMany({ where: { telegramId: BigInt(ADMIN_TG) } });
  await prisma.user.deleteMany({ where: { telegramId: BigInt(ADMIN_TG) } });
}

async function buyerSession(): Promise<void> {
  session.token = await signSession(buyerId, null, SECRET);
}

function providerPricing(amount: number): unknown {
  return success({
    quote: { amount, currency: "RUB", days: 30, devices: 2 },
    segment: { currency: "RUB" },
    apiPricing: {
      devicePricePerMonth: 60,
      deviceTiers: [{ from: 0, price: 60 }],
      volume: { keys: 1, devices: 2 },
      upgradeRule: "x",
    },
  });
}

beforeAll(async () => {
  await cleanup();
  const admin = await prisma.user.create({
    data: { telegramId: BigInt(ADMIN_TG) },
    select: { id: true },
  });
  buyerId = (
    await prisma.user.create({
      data: { email: "tariff-buyer-05@example.test", emailCanonical: "tariff-buyer-05@example.test" },
      select: { id: true },
    })
  ).id;
  await prisma.adminUser.create({ data: { telegramId: BigInt(ADMIN_TG), role: "administrator" } });
  void admin;
});

afterAll(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  session.token = undefined;
  await prisma.tariffPrice.deleteMany({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replaceTariffGrid — validation + replace semantics", () => {
  it("rejects bad rows without touching the grid", async () => {
    await expect(
      replaceTariffGrid([{ days: 7, devices: 10, amount: 777 }], ADMIN_TG),
    ).resolves.toHaveLength(1);

    await expect(replaceTariffGrid([{ days: 8, devices: 10, amount: 1 }], ADMIN_TG)).rejects.toThrow(
      /pricing:bad_request/,
    );
    await expect(replaceTariffGrid([{ days: 7, devices: 11, amount: 1 }], ADMIN_TG)).rejects.toThrow(
      /pricing:bad_request/,
    );
    await expect(replaceTariffGrid([{ days: 7, devices: 10, amount: 0 }], ADMIN_TG)).rejects.toThrow(
      /pricing:bad_request/,
    );
    await expect(
      replaceTariffGrid(
        [
          { days: 7, devices: 10, amount: 1 },
          { days: 7, devices: 10, amount: 2 },
        ],
        ADMIN_TG,
      ),
    ).rejects.toThrow(/pricing:bad_request/);

    // The failed write left the prior row untouched.
    await expect(listTariffPrices()).resolves.toMatchObject([
      { days: 7, devices: 10, amount: 777, currency: "RUB" },
    ]);
  });

  it("clears null cells and returns the grid ordered", async () => {
    await replaceTariffGrid(
      [
        { days: 90, devices: 10, amount: 9000 },
        { days: 7, devices: 10, amount: null },
      ],
      ADMIN_TG,
    );

    await expect(listTariffPrices()).resolves.toMatchObject([
      { days: 90, devices: 10, amount: 9000, currency: "RUB" },
    ]);
  });
});

describe("resolveTariffQuote — manual wins, provider fallback", () => {
  it("returns the manual amount without calling the provider", async () => {
    await replaceTariffGrid([{ days: 7, devices: 10, amount: 555 }], ADMIN_TG);
    const fetchSpy = vi.fn(() => {
      throw new Error("provider must not be called for a manual row");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(resolveTariffQuote(7, 10)).resolves.toEqual({
      amount: 555,
      currency: "RUB",
      source: "manual",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to the live provider amount for unset combos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ body: providerPricing(321) })));

    await expect(resolveTariffQuote(7, 10)).resolves.toEqual({
      amount: 321,
      currency: "RUB",
      source: "provider",
    });
  });
});

describe("resolveUpgradeQuote — grid month unit with provider fallback", () => {
  it("derives the delta from the grid 30-day row", async () => {
    await replaceTariffGrid([{ days: 30, devices: 10, amount: 600 }], ADMIN_TG);

    // unit 20/mo × 1 device = 20.
    await expect(resolveUpgradeQuote({ days: 30, devices: 9, addDevices: 1 })).resolves.toEqual({
      amount: 20,
      currency: "RUB",
      source: "manual",
    });
  });

  it("falls back to the provider tier method without a grid row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ body: providerPricing(120) })));

    await expect(resolveUpgradeQuote({ days: 30, devices: 9, addDevices: 1 })).resolves.toEqual({
      amount: 60,
      currency: "RUB",
      source: "provider",
    });
  });
});

describe("GET /api/pricing — manual display quote", () => {
  it("returns the manual price for an email session", async () => {
    await replaceTariffGrid([{ days: 90, devices: 10, amount: 1234 }], ADMIN_TG);
    await buyerSession();

    const res = await pricingGet(
      new Request("http://localhost/api/pricing?days=90&devices=10"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ price: 1234 });
  });
});

describe("POST /api/orders — manual billed amount", () => {
  it("charges the grid amount for a new email order", async () => {
    await replaceTariffGrid([{ days: 7, devices: 10, amount: 555 }], ADMIN_TG);
    await buyerSession();
    // URL-dispatching fetch stub: ARTEMIDA quotes + Platega create, no network.
    const urlOf = (input: RequestInfo | URL) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes("artemida.test")) {
          return jsonResponse({ body: providerPricing(120) });
        }
        if (url.includes("platega.test")) {
          return jsonResponse({
            body: { transactionId: "tx_manual", url: "https://pay.platega.test/manual" },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const res = await ordersPost(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", days: 7, devices: 10 }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://pay.platega.test/manual" });
    const stored = await prisma.order.findFirst({
      where: { userId: buyerId, plategaTxId: "tx_manual" },
      select: { amount: true, currency: true },
    });
    expect(stored).toMatchObject({ amount: 555, currency: "RUB" });
  });
});

describe("GET/PUT /api/admin/pricing — administrator-only grid", () => {
  async function adminSession(): Promise<void> {
    session.token = await signSession(ADMIN_TG, SECRET);
  }

  it("returns 401 signed out and 404 for a non-admin telegram user", async () => {
    expect((await adminGet()).status).toBe(401);

    const stranger = await prisma.user.create({
      data: { telegramId: BigInt(920000102) },
      select: { id: true },
    });
    session.token = await signSession(920000102, SECRET);
    expect((await adminGet()).status).toBe(404);
    await prisma.user.deleteMany({ where: { id: stranger.id } });
  });

  it("replaces the grid and round-trips through GET", async () => {
    await adminSession();
    const put = await adminPut(
      new Request("http://localhost/api/admin/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: [
            { days: 7, devices: 10, amount: 777 },
            { days: 90, devices: 10, amount: null },
          ],
        }),
      }),
    );
    expect(put.status).toBe(200);
    const get = await adminGet();
    expect(get.status).toBe(200);
    const body = (await get.json()) as { rows?: { days: number; devices: number; amount: number }[] };
    expect(body.rows).toMatchObject([{ days: 7, devices: 10, amount: 777 }]);
  });

  it("rejects invalid cells with 400 and leaves the grid alone", async () => {
    await adminSession();
    await adminPut(
      new Request("http://localhost/api/admin/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ days: 7, devices: 10, amount: 777 }] }),
      }),
    );
    const bad = await adminPut(
      new Request("http://localhost/api/admin/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [{ days: 5, devices: 10, amount: 1 }] }),
      }),
    );
    expect(bad.status).toBe(400);
    const rows = await listTariffPrices();
    expect(rows.map((row) => [row.days, row.devices, row.amount])).toEqual([[7, 10, 777]]);
  });
});
