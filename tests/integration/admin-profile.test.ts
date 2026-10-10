// Admin profile enrichment + partner subdomains + per-payment partner credit.
//
// - Subdomain assign/resolve/taken/reserved + the admin route gates.
// - Partner inviter earns on EVERY paid order (regulars: first only).
// - Admin referrals section: count, earned, spent, rows with profile links.
// - Admin key-devices route: auth gate, ownership 404, device list.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import { GET as devicesGET } from "../../app/api/admin/users/[id]/keys/[keyId]/devices/route";
import { POST as subdomainPOST } from "../../app/api/admin/users/[id]/subdomain/route";
import { signSession } from "../../lib/auth";
import { loadAdminReferrals } from "../../lib/admin-service";
import { artemida } from "../../lib/artemida";
import { prisma } from "../../lib/prisma";
import {
  creditReferralForPaidOrder,
  ensureReferralCode,
  pinReferrer,
  resolveSubdomainOwner,
  setCustomSubdomain,
} from "../../lib/referrals";

const ADMIN_TG = BigInt("970000801");
const PARTNER_TG = BigInt("970000802");
const BUYER_TG = BigInt("970000803");
const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";
const RUN = Date.now().toString(36).toUpperCase();
const SUB = `T${RUN}`.slice(0, 12).toLowerCase();
const KEY = `key-admprof-${RUN}`;

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
      await prisma.keyCache.deleteMany({ where: { userId: user.id } });
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

describe("partner subdomains", () => {
  let partnerId = 0;
  beforeAll(async () => {
    await cleanup();
    const row = await prisma.user.create({
      data: { telegramId: PARTNER_TG },
      select: { id: true },
    });
    partnerId = row.id;
    await prisma.adminUser.create({ data: { telegramId: ADMIN_TG, role: "administrator" } });
    await prisma.user.create({ data: { telegramId: ADMIN_TG }, select: { id: true } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assigns, resolves, and rejects taken/reserved names", async () => {
    await expect(setCustomSubdomain(partnerId, SUB)).resolves.toBe("ok");
    const resolved = await resolveSubdomainOwner(SUB);
    expect(resolved?.userId).toBe(partnerId);
    expect(resolved?.code).toMatch(/^3SET-/);

    const other = await prisma.user.create({
      data: { telegramId: BUYER_TG },
      select: { id: true },
    });
    await expect(setCustomSubdomain(other.id, SUB)).resolves.toBe("taken");
    await expect(setCustomSubdomain(other.id, "my")).resolves.toBe("invalid");
    await expect(setCustomSubdomain(other.id, "!!!")).resolves.toBe("invalid");
    await expect(resolveSubdomainOwner("my")).resolves.toBeNull();
    await expect(resolveSubdomainOwner("free-never-taken")).resolves.toBeNull();
  });

  it("clears with null", async () => {
    await expect(setCustomSubdomain(partnerId, null)).resolves.toBe("ok");
    await expect(resolveSubdomainOwner(SUB)).resolves.toBeNull();
    await expect(setCustomSubdomain(partnerId, SUB)).resolves.toBe("ok");
  });

  it("gates the admin route (401/404/409) and saves", async () => {
    const req = (body: unknown) =>
      new Request(`http://localhost/api/admin/users/${partnerId}/subdomain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
    session.token = undefined;
    await expect(subdomainPOST(req({ name: "x" }), params(partnerId))).resolves.toMatchObject({
      status: 401,
    });
    await authorize(ADMIN_TG);
    await expect(
      subdomainPOST(req({ name: SUB }), params(partnerId)),
    ).resolves.toMatchObject({ status: 200 });
    // Unknown user → 404.
    await expect(
      subdomainPOST(req({ name: "other" }), params(999999999)),
    ).resolves.toMatchObject({ status: 404 });
  });
});

describe("partner earns on every payment", () => {
  let partnerId = 0;
  let buyerId = 0;
  beforeAll(async () => {
    await cleanup();
    await prisma.adminUser.create({ data: { telegramId: PARTNER_TG, role: "partner" } });
    const partner = await prisma.user.create({
      data: { telegramId: PARTNER_TG, customInviterKind: "fixed", customInviterReward: 100 },
      select: { id: true },
    });
    const buyer = await prisma.user.create({
      data: { telegramId: BUYER_TG },
      select: { id: true },
    });
    partnerId = partner.id;
    buyerId = buyer.id;
    const code = await ensureReferralCode(partnerId);
    await pinReferrer(buyerId, code);
  });
  afterAll(async () => {
    await cleanup();
  });

  it("credits two separate payments", async () => {
    await creditReferralForPaidOrder(buyerId, 1000, "order-a");
    await creditReferralForPaidOrder(buyerId, 1000, "order-b");
    const earned = await prisma.walletTx.aggregate({
      where: { userId: partnerId, reason: "referral_bonus" },
      _sum: { amount: true },
    });
    expect(earned._sum.amount).toBe(200);
  });
});

describe("admin referrals section + key devices", () => {
  let partnerId = 0;
  let buyerId = 0;
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
    const code = await ensureReferralCode(partnerId);
    await pinReferrer(buyerId, code);
    await prisma.walletTx.create({
      data: { userId: partnerId, amount: 300, reason: "referral_bonus", refId: String(buyerId) },
    });
    await prisma.walletTx.create({
      data: { userId: partnerId, amount: -120, reason: "order_spend", refId: "o1" },
    });
    await prisma.keyCache.create({
      data: {
        userId: buyerId,
        keyId: KEY,
        status: "ACTIVE",
        isTrial: false,
        deviceLimit: 2,
        devices: 1,
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

  it("loads count, earned, spent, and rows", async () => {
    const data = await loadAdminReferrals(partnerId);
    expect(data.count).toBe(1);
    expect(data.earned).toBe(300);
    expect(data.spent).toBe(120);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]?.userId).toBe(buyerId);
  });

  it("gates the devices route and lists devices", async () => {
    const params = { params: Promise.resolve({ id: String(buyerId), keyId: KEY }) };
    session.token = undefined;
    await expect(devicesGET(new Request("http://localhost/x"), params)).resolves.toMatchObject({
      status: 401,
    });
    await authorize(ADMIN_TG);
    const spy = vi
      .spyOn(artemida, "getDevices")
      .mockResolvedValue([{ token: "tok-1", name: "iPhone" }]);
    try {
      const res = await devicesGET(new Request("http://localhost/x"), params);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ devices: [{ token: "tok-1", name: "iPhone" }] });
    } finally {
      spy.mockRestore();
    }
    // Non-owned key is indistinguishable from missing.
    const missing = await devicesGET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: String(buyerId), keyId: "nope" }),
    });
    expect(missing.status).toBe(404);
  });
});
