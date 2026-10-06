// Phase 5 RBAC vectors (ADM-01 / D-64..D-67).
//
// `can()` is pinned to the UI-SPEC §1 literal matrix. `getAdminRole` is a
// create-only bootstrap: an existing `admin_users` row is the source of truth
// (D-66) and `ADMIN_TELEGRAM_IDS` membership must NEVER update it — otherwise a
// UI downgrade would silently revert (T-05-02 / Pitfall 4). Runs against the
// real local Postgres with a private telegram-id range, cleaned up around the
// suite.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = "910000101";
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

import { can, getAdminRole } from "../../lib/admin-auth";
import { prisma } from "../../lib/prisma";

const BOOTSTRAP = BigInt("910000101");
const EXISTING = BigInt("910000102");
const STRANGER = BigInt("910000103");
const IDS = [BOOTSTRAP, EXISTING, STRANGER];

beforeAll(async () => {
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: IDS } } });
});

afterAll(async () => {
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: IDS } } });
});

describe("can() — UI-SPEC §1 role matrix", () => {
  it("administrator has every section", () => {
    const sections = [
      "overview",
      "users",
      "profileKeys",
      "profilePayments",
      "profileTickets",
      "tickets",
      "broadcast",
      "roles",
    ] as const;
    for (const section of sections) {
      expect(can("administrator", section)).toBe(true);
    }
  });

  it("support is limited to users + keys/tickets views", () => {
    expect(can("support", "users")).toBe(true);
    expect(can("support", "profileKeys")).toBe(true);
    expect(can("support", "profileTickets")).toBe(true);
    expect(can("support", "tickets")).toBe(true);
    expect(can("support", "overview")).toBe(false);
    expect(can("support", "profilePayments")).toBe(false);
    expect(can("support", "broadcast")).toBe(false);
    expect(can("support", "roles")).toBe(false);
  });

  it("manager is limited to overview + users + payments view", () => {
    expect(can("manager", "overview")).toBe(true);
    expect(can("manager", "users")).toBe(true);
    expect(can("manager", "profilePayments")).toBe(true);
    expect(can("manager", "profileKeys")).toBe(false);
    expect(can("manager", "profileTickets")).toBe(false);
    expect(can("manager", "tickets")).toBe(false);
    expect(can("manager", "broadcast")).toBe(false);
    expect(can("manager", "roles")).toBe(false);
  });
});

describe("getAdminRole — bootstrap is create-only", () => {
  it("returns the stored role for an existing row (UI is source of truth)", async () => {
    await prisma.adminUser.create({ data: { telegramId: EXISTING, role: "manager" } });

    await expect(getAdminRole(Number(EXISTING))).resolves.toBe("manager");
  });

  it("creates exactly one administrator row for a bootstrap id", async () => {
    await expect(getAdminRole(Number(BOOTSTRAP))).resolves.toBe("administrator");
    // A second resolve must not insert a duplicate row.
    await expect(getAdminRole(Number(BOOTSTRAP))).resolves.toBe("administrator");

    const rows = await prisma.adminUser.findMany({ where: { telegramId: BOOTSTRAP } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("administrator");
  });

  it("never re-elevates a downgraded bootstrap admin", async () => {
    await prisma.adminUser.update({
      where: { telegramId: BOOTSTRAP },
      data: { role: "support" },
    });

    await expect(getAdminRole(Number(BOOTSTRAP))).resolves.toBe("support");

    const row = await prisma.adminUser.findUnique({ where: { telegramId: BOOTSTRAP } });
    expect(row?.role).toBe("support");
  });

  it("returns null (and writes nothing) for a non-bootstrap, unknown id", async () => {
    await expect(getAdminRole(Number(STRANGER))).resolves.toBeNull();
    await expect(
      prisma.adminUser.findUnique({ where: { telegramId: STRANGER } }),
    ).resolves.toBeNull();
  });
});