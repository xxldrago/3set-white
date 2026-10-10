// Referral funnel stats tracer: click dedupe, funnel numbers, series
// buckets, and the admin/partner stats route gates.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as adminStatsGET } from "../../app/api/admin/referrals/stats/route";
import { POST as clickPOST } from "../../app/api/referrals/click/route";
import { GET as ownStatsGET } from "../../app/api/referrals/stats/route";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  ensureReferralCode,
  pinReferrer,
} from "../../lib/referrals";
import { funnelSeries, funnelStats, recordClick } from "../../lib/referral-stats";

const ADMIN_TG = BigInt("980000901");
const PARTNER_TG = BigInt("980000902");
const BUYER_TG = BigInt("980000903");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";
const RUN = Date.now().toString(36).toUpperCase();

async function cleanup(): Promise<void> {
  for (const telegramId of [ADMIN_TG, PARTNER_TG, BUYER_TG]) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (user) {
      await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
      await prisma.order.deleteMany({ where: { userId: user.id } });
      await prisma.walletTx.deleteMany({ where: { userId: user.id } });
      await prisma.referralClick.deleteMany({ where: { ownerUserId: user.id } });
    }
    await prisma.user.deleteMany({ where: { telegramId } });
  }
  await prisma.adminUser.deleteMany({
    where: { telegramId: { in: [ADMIN_TG, PARTNER_TG] } },
  });
}

async function authorize(telegramId: bigint): Promise<void> {
  session.token = await signSession(Number(telegramId), SECRET);
}

describe("funnel stats", () => {
  let partnerId = 0;
  let buyerId = 0;
  let code = "";

  beforeAll(async () => {
    await cleanup();
    await prisma.adminUser.create({ data: { telegramId: ADMIN_TG, role: "administrator" } });
    await prisma.user.create({ data: { telegramId: ADMIN_TG }, select: { id: true } });
    const partner = await prisma.user.create({
      data: { telegramId: PARTNER_TG },
      select: { id: true },
    });
    const buyer = await prisma.user.create({
      data: { telegramId: BUYER_TG },
      select: { id: true },
    });
    partnerId = partner.id;
    buyerId = buyer.id;
    code = await ensureReferralCode(partnerId);
    await pinReferrer(buyerId, code);

    await recordClick(partnerId, code, "198.51.100.1", "link");
    // Same IP within the hour dedupes.
    await expect(recordClick(partnerId, code, "198.51.100.1", "link")).resolves.toBe(false);
    await recordClick(partnerId, code, "198.51.100.2", "subdomain");

    await prisma.order.create({
      data: {
        userId: buyerId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 1000,
        finalAmount: 900,
        balanceUsed: 100,
        currency: "RUB",
        status: "provisioned",
        paidAt: new Date(),
      },
    });
    await prisma.keyCache.create({
      data: {
        userId: buyerId,
        keyId: `key-funnel-${RUN}`,
        status: "ACTIVE",
        isTrial: false,
        deviceLimit: 2,
        devices: 3,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        customerRef: String(BUYER_TG),
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

  it("counts clicks, registrations, purchases, revenue, devices", async () => {
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const stats = await funnelStats({ ownerUserId: partnerId }, from, to);
    expect(stats).toMatchObject({
      clicks: 2,
      registrations: 1,
      purchases: 1,
      revenue: 800,
      devices: 3,
    });
    // Global scope includes the same rows.
    const global = await funnelStats({}, from, to);
    expect(global.clicks).toBeGreaterThanOrEqual(2);
    expect(global.registrations).toBeGreaterThanOrEqual(1);
  });

  it("splits a series into day buckets", async () => {
    const from = new Date(Date.now() - 2 * 86_400_000);
    const to = new Date();
    const series = await funnelSeries({ ownerUserId: partnerId }, from, to, "day");
    expect(series.length).toBeGreaterThanOrEqual(2);
    expect(series.length).toBeLessThanOrEqual(4);
    const total = series.reduce((sum, bucket) => sum + bucket.clicks, 0);
    expect(total).toBe(2);
  });

  it("serves the click beacon idempotently", async () => {
    const req = (body: unknown) =>
      new Request("http://localhost/api/referrals/click", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "198.51.100.9" },
        body: JSON.stringify(body),
      });
    const ok = await clickPOST(req({ code: code.toLowerCase() }));
    expect(ok.status).toBe(200);
    // Unknown codes answer identically (no oracle).
    const unknown = await clickPOST(req({ code: "NOPE-1" }));
    expect(unknown.status).toBe(200);
    const bad = await clickPOST(req({}));
    expect(bad.status).toBe(400);
  });

  it("gates the admin stats route and serves data", async () => {
    session.token = undefined;
    const anon = await adminStatsGET(
      new Request("http://localhost/api/admin/referrals/stats?granularity=day"),
    );
    expect(anon.status).toBe(401);

    await authorize(ADMIN_TG);
    const res = await adminStatsGET(
      new Request("http://localhost/api/admin/referrals/stats?granularity=day"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stats: { clicks: number };
      series: unknown[];
      granularity: string;
    };
    expect(body.granularity).toBe("day");
    expect(body.stats.clicks).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(body.series)).toBe(true);

    const bad = await adminStatsGET(
      new Request("http://localhost/api/admin/referrals/stats?granularity=fortnight"),
    );
    expect(bad.status).toBe(400);
  });

  it("scopes the partner stats route to the caller", async () => {
    await authorize(PARTNER_TG);
    const res = await ownStatsGET(
      new Request("http://localhost/api/referrals/stats?granularity=week"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stats: { clicks: number } };
    expect(body.stats.clicks).toBe(3);

    await authorize(BUYER_TG);
    const empty = await ownStatsGET(
      new Request("http://localhost/api/referrals/stats"),
    );
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { stats: { clicks: number } }).stats.clicks).toBe(0);
  });
});
