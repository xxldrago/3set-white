// Partner role tracer: matrix isolation, dashboard guard, percent-kind
// override, and personal-promo attribution (order-time pin to the owner).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import AdminPartnerPage from "../../app/admin/partner/page";
import { POST as ordersPOST } from "../../app/api/orders/route";
import { signSession } from "../../lib/auth";
import { can } from "../../lib/admin-auth";
import { prisma } from "../../lib/prisma";
import {
  creditReferralForPaidOrder,
  ensureReferralCode,
  pinReferrer,
} from "../../lib/referrals";
import { createPromo } from "../../lib/promo";
import { jsonResponse, success } from "../helpers/fake-fetch";

const PARTNER_TG = BigInt("940000501");
const BUYER_TG = BigInt("940000502");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";
const RUN = Date.now().toString(36).toUpperCase();
const CODE = `T-PART-${RUN}`;

async function cleanup(): Promise<void> {
  for (const telegramId of [PARTNER_TG, BUYER_TG]) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      await prisma.walletTx.deleteMany({ where: { userId: user.id } });
    }
    await prisma.user.deleteMany({ where: { telegramId } });
  }
  await prisma.promoCode.deleteMany({ where: { code: CODE } });
  await prisma.adminUser.deleteMany({ where: { telegramId: PARTNER_TG } });
}

async function authorize(telegramId: bigint): Promise<void> {
  session.token = await signSession(Number(telegramId), SECRET);
}

function installFetch(): void {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("artemida.test")) {
      return jsonResponse({
        body: success({
          quote: { amount: 1000, currency: "RUB", days: 30, devices: 2 },
          segment: { currency: "RUB" },
          apiPricing: {
            devicePricePerMonth: 500,
            deviceTiers: [{ from: 0, price: 500 }],
            volume: { keys: 1, devices: 2 },
            upgradeRule: "x",
          },
        }),
      });
    }
    if (url.includes("platega.test")) {
      return jsonResponse({
        body: { transactionId: `tx_part_${RUN}`, url: "https://pay.platega.test/part", status: "PENDING" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", spy);
}

describe("partner role matrix", () => {
  it("holds only the partner section; staff queues stay closed", () => {
    expect(can("partner", "partner")).toBe(true);
    expect(can("partner", "users")).toBe(false);
    expect(can("partner", "tickets")).toBe(false);
    expect(can("partner", "roles")).toBe(false);
    expect(can("partner", "pricing")).toBe(false);
    expect(can("administrator", "partner")).toBe(false);
  });

  it("renders the dashboard for a partner and 404s everyone else", async () => {
    await cleanup();
    await prisma.adminUser.create({ data: { telegramId: PARTNER_TG, role: "partner" } });
    await prisma.user.create({ data: { telegramId: PARTNER_TG } });
    await authorize(PARTNER_TG);
    await expect(AdminPartnerPage()).resolves.toBeDefined();

    session.token = undefined;
    try {
      await AdminPartnerPage();
      expect.unreachable("signed-out must redirect");
    } catch (err) {
      expect((err as Error).message).toMatch(/NEXT_REDIRECT/);
    }
    await cleanup();
  });
});

describe("partner percent rate + personal promo", () => {
  let partnerId = 0;
  let buyerId = 0;

  beforeAll(async () => {
    await cleanup();
    const partner = await prisma.user.create({
      data: {
        telegramId: PARTNER_TG,
        customInviterKind: "percent",
        customInviterReward: 25,
      },
      select: { id: true },
    });
    const buyer = await prisma.user.create({
      data: { telegramId: BUYER_TG },
      select: { id: true },
    });
    partnerId = partner.id;
    buyerId = buyer.id;
    await createPromo({ code: CODE, discount: 10, type: "percentage", ownerUserId: partnerId });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("credits the individual percent on first paid order", async () => {
    const code = await ensureReferralCode(partnerId);
    await expect(pinReferrer(buyerId, code)).resolves.toBe(partnerId);
    await creditReferralForPaidOrder(buyerId, 1000);
    const earned = await prisma.walletTx.aggregate({
      where: { userId: partnerId, reason: "referral_bonus" },
      _sum: { amount: true },
    });
    expect(earned._sum.amount).toBe(250);
  });

  it("attributes a buyer to the promo owner at order time", async () => {
    await authorize(BUYER_TG);
    installFetch();
    // Buyer has no inviter yet in this scenario — clear the pin first.
    await prisma.user.update({ where: { id: buyerId }, data: { referredById: null } });
    const res = await ordersPOST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", days: 30, devices: 2, promoCode: CODE }),
      }),
    );
    expect(res.status).toBe(200);
    const row = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { referredById: true },
    });
    expect(row?.referredById).toBe(partnerId);
  });
});
