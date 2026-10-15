// Referral program tracer: code ensure/pin, settings, first-paid credit
// (percent, custom override, invitee bonus, once-only), balance spend on
// orders (partial, full-cover, Platega-failure refund), withdrawal
// request/decide, and the wallet/pin route gates.
//
// Runs against the real local Postgres with a URL-dispatching fetch stub
// (ARTEMIDA + Platega, order-route pattern) so no network is hit.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as walletGET } from "../../app/api/wallet/route";
import { POST as withdrawPOST } from "../../app/api/wallet/withdraw/route";
import { POST as pinPOST } from "../../app/api/referrals/pin/route";
import { POST as ordersPOST } from "../../app/api/orders/route";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  REFERRAL_CODE_RE,
  bonusBalance,
  creditReferralForPaidOrder,
  decideWithdrawal,
  ensureReferralCode,
  getReferralSettings,
  getReferralSummary,
  listWithdrawals,
  pinReferrer,
  requestWithdrawal,
  setReferralSettings,
  walletBalance,
} from "../../lib/referrals";
import { jsonResponse, success } from "../helpers/fake-fetch";

const INVITER_TG = BigInt("920000301");
const REFEREE_TG = BigInt("920000302");
const STRANGER_TG = BigInt("920000303");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

async function cleanup(): Promise<void> {
  // Settings are global rows — reset so the defaults test reads true values.
  await prisma.setting.deleteMany({
    where: {
      key: {
        in: [
          "referral.inviterKind",
          "referral.inviterValue",
          "referral.inviteeValue",
          "referral.userDays",
          "referral.inviteeDays",
          "referral.minWithdraw",
        ],
      },
    },
  });
  for (const telegramId of [INVITER_TG, REFEREE_TG, STRANGER_TG]) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      await prisma.walletTx.deleteMany({ where: { userId: user.id } });
      await prisma.withdrawal.deleteMany({ where: { userId: user.id } });
    }
    await prisma.user.deleteMany({ where: { telegramId } });
  }
  await prisma.setting.deleteMany({
    where: {
      key: {
        in: [
          "referral.inviterKind",
          "referral.inviterValue",
          "referral.inviteeValue",
          "referral.minWithdraw",
        ],
      },
    },
  });
}

async function authorize(telegramId: bigint): Promise<void> {
  session.token = await signSession(Number(telegramId), SECRET);
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
        body: { transactionId: `tx_ref_${Date.now()}`, url: "https://pay.platega.test/ref", status: "PENDING" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", spy);
}

let inviterId = 0;
let refereeId = 0;

describe("referral codes + pinning", () => {
  beforeAll(async () => {
    await cleanup();
    const inviter = await prisma.user.create({
      data: { telegramId: INVITER_TG },
      select: { id: true },
    });
    const referee = await prisma.user.create({
      data: { telegramId: REFEREE_TG },
      select: { id: true },
    });
    inviterId = inviter.id;
    refereeId = referee.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ensures a well-formed code, stable across calls", async () => {
    const first = await ensureReferralCode(inviterId);
    expect(first).toMatch(REFERRAL_CODE_RE);
    await expect(ensureReferralCode(inviterId)).resolves.toBe(first);
  });

  it("pins the first valid code; self/unknown/re-pins are no-ops", async () => {
    const code = await ensureReferralCode(inviterId);
    await expect(pinReferrer(refereeId, code.toLowerCase())).resolves.toBe(inviterId);
    // Re-pin with another code is ignored (first wins).
    const stranger = await prisma.user.create({
      data: { telegramId: STRANGER_TG },
      select: { id: true },
    });
    const strangerCode = await ensureReferralCode(stranger.id);
    // Already pinned — the first code wins, the re-pin is a silent no-op.
    await expect(pinReferrer(refereeId, strangerCode)).resolves.toBeNull();
    const row = await prisma.user.findUnique({
      where: { id: refereeId },
      select: { referredById: true },
    });
    expect(row?.referredById).toBe(inviterId);
    // Self-pin and garbage are no-ops.
    await expect(pinReferrer(inviterId, code)).resolves.toBeNull();
    await expect(pinReferrer(refereeId, "NOPE")).resolves.toBeNull();
  });
});

describe("settings + first-paid credit", () => {
  beforeAll(async () => {
    await cleanup();
    const inviter = await prisma.user.create({
      data: { telegramId: INVITER_TG },
      select: { id: true },
    });
    const referee = await prisma.user.create({
      data: { telegramId: REFEREE_TG },
      select: { id: true },
    });
    inviterId = inviter.id;
    refereeId = referee.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads defaults and saves admin rates", async () => {
    const defaults = await getReferralSettings();
    expect(defaults).toMatchObject({
      inviterKind: "percent",
      inviterValue: 10,
      userDays: 5,
      inviteeDays: 5,
    });
    const saved = await setReferralSettings({
      inviterKind: "percent",
      inviterValue: 20,
      inviteeValue: 50,
      userMode: "days",
      userDays: 7,
      inviteeDays: 4,
      minWithdraw: 100,
    });
    expect(saved).toMatchObject({
      inviterKind: "percent",
      inviterValue: 20,
      userMode: "days",
      userDays: 7,
      inviteeDays: 4,
      minWithdraw: 100,
    });
  });

  it("credits inviter days + invitee days once, on the first paid order", async () => {
    const code = await ensureReferralCode(inviterId);
    await expect(pinReferrer(refereeId, code)).resolves.toBe(inviterId);
    await creditReferralForPaidOrder(refereeId, 1000, "order-1");
    // Plain users earn days, not money.
    await expect(bonusBalance(inviterId)).resolves.toBe(7);
    await expect(bonusBalance(refereeId)).resolves.toBe(4);
    await expect(walletBalance(inviterId)).resolves.toBe(0);
    // Second paid order credits nothing more.
    await creditReferralForPaidOrder(refereeId, 1000, "order-2");
    await expect(bonusBalance(inviterId)).resolves.toBe(7);
    await expect(getReferralSummary(inviterId)).resolves.toMatchObject({
      referrals: 1,
      earned: 0,
      balance: 0,
      bonusDays: 7,
    });
  });

  it("honors the per-user custom inviter reward (legacy fixed money)", async () => {
    await prisma.user.update({
      where: { id: inviterId },
      data: { customInviterReward: 77 },
    });
    const stranger = await prisma.user.create({
      data: { telegramId: STRANGER_TG, referredById: inviterId },
      select: { id: true },
    });
    await creditReferralForPaidOrder(stranger.id, 1000, "order-1");
    // 77 fixed money (invitee still gets days).
    await expect(walletBalance(inviterId)).resolves.toBe(77);
    await expect(bonusBalance(stranger.id)).resolves.toBe(4);
  });
});

describe("balance spend on orders", () => {
  beforeAll(async () => {
    await cleanup();
    await setReferralSettings({ inviterKind: "fixed", inviterValue: 1000, inviteeValue: 0 });
    const referee = await prisma.user.create({
      data: { telegramId: REFEREE_TG },
      select: { id: true },
    });
    refereeId = referee.id;
    await prisma.walletTx.create({
      data: { userId: refereeId, amount: 400, reason: "referral_bonus", refId: "seed" },
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reduces the Platega charge and snapshots balanceUsed", async () => {
    await authorize(REFEREE_TG);
    installFetch();
    const res = await ordersPOST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", days: 30, devices: 2, useBalance: true }),
      }),
    );
    expect(res.status).toBe(200);
    const order = await prisma.order.findFirst({
      where: { userId: refereeId },
      orderBy: { createdAt: "desc" },
      select: { amount: true, finalAmount: true, balanceUsed: true },
    });
    expect(order).toMatchObject({ amount: 1000, finalAmount: 1000, balanceUsed: 400 });
    await expect(walletBalance(refereeId)).resolves.toBe(0);
  });

  it("fully covers the order: no Platega leg, straight to paid + fulfill", async () => {
    await prisma.walletTx.create({
      data: { userId: refereeId, amount: 2000, reason: "referral_bonus", refId: "seed2" },
      // unique guard is [userId, reason, refId] — distinct refId, no clash.
    });
    await authorize(REFEREE_TG);
    installFetch();
    const fetchSpy = vi.mocked(globalThis.fetch);
    const callsBefore = fetchSpy.mock.calls.length;
    const res = await ordersPOST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", days: 30, devices: 2, useBalance: true }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("/payments/");
    // No new Platega call: fetch count unchanged apart from the ARTEMIDA quote.
    const plategaCalls = fetchSpy.mock.calls
      .slice(callsBefore)
      .filter(([input]) =>
        (typeof input === "string" ? input : input instanceof URL ? input.href : input.url).includes(
          "platega.test",
        ),
      );
    expect(plategaCalls).toHaveLength(0);
    const order = await prisma.order.findFirst({
      where: { userId: refereeId },
      orderBy: { createdAt: "desc" },
      select: { status: true, balanceUsed: true },
    });
    expect(order?.status).toBe("paid");
    expect(order?.balanceUsed).toBe(1000);
    const jobs = await prisma.outbox.findMany({
      where: { order: { userId: refereeId } },
      select: { id: true },
    });
    expect(jobs.length).toBeGreaterThan(0);
  });
});

describe("withdrawals", () => {
  beforeAll(async () => {
    await cleanup();
    await setReferralSettings({ minWithdraw: 100 });
    const referee = await prisma.user.create({
      data: { telegramId: REFEREE_TG },
      select: { id: true },
    });
    refereeId = referee.id;
    await prisma.walletTx.create({
      data: { userId: refereeId, amount: 500, reason: "referral_bonus", refId: "wseed" },
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests with a hold, approves, and lists the queue", async () => {
    const req = await requestWithdrawal(refereeId, 200, "@user");
    expect(req.status).toBe("pending");
    await expect(walletBalance(refereeId)).resolves.toBe(300);
    await expect(decideWithdrawal(req.id, true)).resolves.toMatchObject({
      id: req.id,
      status: "approved",
    });
    await expect(walletBalance(refereeId)).resolves.toBe(300);
    const queue = await listWithdrawals("pending");
    expect(queue.find((row) => row.id === req.id)).toBeUndefined();
  });

  it("rejects below minimum and beyond balance", async () => {
    await expect(requestWithdrawal(refereeId, 50, null)).rejects.toThrow("withdrawal:too_small");
    await expect(requestWithdrawal(refereeId, 10_000, null)).rejects.toThrow(
      "withdrawal:insufficient",
    );
  });

  it("reject refunds the hold", async () => {
    const req = await requestWithdrawal(refereeId, 100, null);
    await expect(walletBalance(refereeId)).resolves.toBe(200);
    await expect(decideWithdrawal(req.id, false)).resolves.toMatchObject({ status: "rejected" });
    await expect(walletBalance(refereeId)).resolves.toBe(300);
  });

  it("wallet + pin routes gate and serve", async () => {
    session.token = undefined;
    await expect(walletGET()).resolves.toMatchObject({ status: 401 });
    await expect(
      withdrawPOST(
        new Request("http://localhost/api/wallet/withdraw", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: 100 }),
        }),
      ),
    ).resolves.toMatchObject({ status: 401 });

    await authorize(REFEREE_TG);
    const wallet = await walletGET();
    expect(wallet.status).toBe(200);
    const summary = (await wallet.json()) as { balance: number; referrals: number };
    expect(summary.balance).toBe(300);

    const code = await ensureReferralCode(refereeId);
    const pin = await pinPOST(
      new Request("http://localhost/api/referrals/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      }),
    );
    expect(pin.status).toBe(200);
    // Self-pin is a silent no-op.
    expect(await pin.json()).toEqual({ ok: true, pinned: false });
  });
});

describe("sub-partner residuals (multi-level)", () => {
  const A_TG = BigInt("920000311");
  const B_TG = BigInt("920000312");
  const C_TG = BigInt("920000313");
  let aId = 0;
  let bId = 0;
  let cId = 0;

  beforeAll(async () => {
    for (const tg of [A_TG, B_TG, C_TG]) {
      await prisma.user.deleteMany({ where: { telegramId: tg } });
    }
    // A: partner with a fixed 100/deal rate.
    await prisma.adminUser.create({ data: { telegramId: A_TG, role: "partner" } });
    const a = await prisma.user.create({
      data: {
        telegramId: A_TG,
        customInviterKind: "fixed",
        customInviterReward: 100,
      },
      select: { id: true },
    });
    const b = await prisma.user.create({ data: { telegramId: B_TG }, select: { id: true } });
    const c = await prisma.user.create({ data: { telegramId: C_TG }, select: { id: true } });
    aId = a.id;
    bId = b.id;
    cId = c.id;
    const aCode = await ensureReferralCode(aId);
    await pinReferrer(bId, aCode);
    // A shares 60 fixed with the downline.
    const { setSubRate } = await import("../../lib/referrals");
    await setSubRate(aId, { kind: "fixed", value: 60 });
  });

  afterAll(async () => {
    for (const tg of [A_TG, B_TG, C_TG]) {
      const user = await prisma.user.findUnique({
        where: { telegramId: tg },
        select: { id: true },
      });
      if (user) {
        await prisma.walletTx.deleteMany({ where: { userId: user.id } });
      }
      await prisma.user.deleteMany({ where: { telegramId: tg } });
    }
    await prisma.adminUser.deleteMany({ where: { telegramId: A_TG } });
  });

  it("splits 100/60: B gets 60, A nets 40", async () => {
    const bCode = await ensureReferralCode(bId);
    await pinReferrer(cId, bCode);
    await creditReferralForPaidOrder(cId, 1000, "order-sub-1");
    await expect(walletBalance(bId)).resolves.toBe(60);
    await expect(walletBalance(aId)).resolves.toBe(40);
  });

  it("floors the residual at zero when the downline share exceeds it", async () => {
    const { setSubRate } = await import("../../lib/referrals");
    await setSubRate(aId, { kind: "fixed", value: 150 });
    // Fresh buyer (first payment): B earns the 150 downline share, A's
    // 100-entitlement minus 150 floors at zero — A stays at 40.
    const c2 = await prisma.user.create({
      data: { telegramId: BigInt("920000314") },
      select: { id: true },
    });
    const bCode = await ensureReferralCode(bId);
    await pinReferrer(c2.id, bCode);
    await creditReferralForPaidOrder(c2.id, 1000, "order-sub-2");
    await expect(walletBalance(bId)).resolves.toBe(210);
    await expect(walletBalance(aId)).resolves.toBe(40);
    const upline = await prisma.walletTx.findMany({
      where: { userId: aId, reason: "referral_bonus" },
      select: { amount: true },
    });
    expect(upline.map((row) => row.amount)).toEqual([40]);
    await prisma.walletTx.deleteMany({ where: { userId: c2.id } });
    await prisma.walletTx.deleteMany({
      where: { userId: bId, OR: [{ refId: String(c2.id) }, { refId: { startsWith: `${c2.id}:` } }] },
    });
    await prisma.user.delete({ where: { id: c2.id } });
  });
});

describe("bonus-day redemption", () => {
  const R_TG = BigInt("920000321");
  const KEY = "key-bonus-redeem";
  let userId = 0;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { telegramId: R_TG } });
    const row = await prisma.user.create({
      data: { telegramId: R_TG, bonusDays: 10 },
      select: { id: true },
    });
    userId = row.id;
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: KEY,
        status: "ACTIVE",
        isTrial: false,
        deviceLimit: 2,
        devices: 1,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        customerRef: String(R_TG),
      },
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const user = await prisma.user.findUnique({
      where: { telegramId: R_TG },
      select: { id: true },
    });
    if (user) await prisma.keyCache.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { telegramId: R_TG } });
  });

  it("extends the key and decrements the balance (provider spied)", async () => {
    const { artemida } = await import("../../lib/artemida");
    const { redeemBonusDays } = await import("../../lib/referrals");
    const spy = vi.spyOn(artemida, "renewKey").mockImplementation(async (id, input) => ({
      id,
      name: "K",
      status: "active",
      isTrial: false,
      expiresAt: new Date(Date.now() + (30 + input.days) * 86_400_000).toISOString(),
      deviceLimit: input.devices,
      devices: 1,
      subscriptionUrl: "https://example.test/sub",
      customerRef: String(R_TG),
      trafficUsedBytes: 0,
      trafficLimitBytes: null,
    }));
    try {
      const result = await redeemBonusDays(userId, KEY, 4);
      expect(result.ok).toBe(true);
      await expect(bonusBalance(userId)).resolves.toBe(6);
      expect(spy).toHaveBeenCalledWith(KEY, { days: 4, devices: 2 }, expect.anything());
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects short balances without touching the provider", async () => {
    const { artemida } = await import("../../lib/artemida");
    const { redeemBonusDays } = await import("../../lib/referrals");
    const spy = vi.spyOn(artemida, "renewKey");
    try {
      const result = await redeemBonusDays(userId, KEY, 999);
      expect(result).toMatchObject({ ok: false, reason: "insufficient" });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
