// Phase 5 admin enforcement vectors (ADM-01 / T-05-01/T-05-02/T-05-03).
//
// The RBAC contract that every /admin page and /api/admin route must uphold:
// signed-out → 401 (SessionError), no staff row → 404, wrong role → 404 — never
// 403, and byte-identical to a missing route (no role/route oracle, D-51). The
// overview page re-checks the guard itself (layouts are not a boundary) and
// bootstrap membership creates exactly one row without ever re-elevating a
// stored role. Runs against the real local Postgres with a private id range.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = "910000101";
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import AdminOverviewPage from "../../app/admin/page";
import { getAdminRole, requireRole, type AdminRole } from "../../lib/admin-auth";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { AdminError, SessionError } from "../../lib/session";

const BOOTSTRAP = 910000101;
const ADMIN = 910000201;
const SUPPORT = 910000202;
const MANAGER = 910000203;
const STRANGER = 910000204;
const IDS = [BOOTSTRAP, ADMIN, SUPPORT, MANAGER, STRANGER].map((id) => BigInt(id));

const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

/** The canonical route/page error mapping every admin surface must follow. */
async function statusFor(...allowed: AdminRole[]): Promise<number> {
  try {
    await requireRole(...allowed);
    return 200;
  } catch (err) {
    if (err instanceof SessionError) return 401;
    if (err instanceof AdminError) return 404;
    throw err;
  }
}

/** Invoke the page as Next would and capture its redirect/not-found digest. */
async function callOverviewPage(): Promise<{ ok: true } | { digest: string }> {
  try {
    await AdminOverviewPage();
    return { ok: true };
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    return { digest: typeof digest === "string" ? digest : "unknown" };
  }
}

async function authorize(telegramId: number): Promise<void> {
  session.token = await signSession(telegramId, SECRET);
}

async function cleanup(): Promise<void> {
  await prisma.adminUser.deleteMany({ where: { telegramId: { in: IDS } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.adminUser.createMany({
    data: [
      { telegramId: BigInt(ADMIN), role: "administrator" },
      { telegramId: BigInt(SUPPORT), role: "support" },
      { telegramId: BigInt(MANAGER), role: "manager" },
    ],
  });
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  session.token = undefined;
  // Keep the bootstrap row absent by default; bootstrap tests create it.
  await prisma.adminUser.deleteMany({ where: { telegramId: BigInt(BOOTSTRAP) } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin surface status mapping (401 / 404 / 200)", () => {
  it("maps a signed-out caller to 401 (SessionError)", async () => {
    await expect(statusFor("administrator")).resolves.toBe(401);
  });

  it("maps a signed-in caller with no staff row to 404", async () => {
    await authorize(STRANGER);
    await expect(statusFor("administrator")).resolves.toBe(404);
  });

  it("maps a support caller on an administrator-only surface to 404, never 403", async () => {
    await authorize(SUPPORT);
    const status = await statusFor("administrator");

    expect(status).toBe(404);
    expect(status).not.toBe(403);
  });

  it("resolves 200 for an administrator and a manager on their allowed surfaces", async () => {
    await authorize(ADMIN);
    await expect(statusFor("administrator")).resolves.toBe(200);

    await authorize(MANAGER);
    // Overview is administrator + manager.
    await expect(statusFor("administrator", "manager")).resolves.toBe(200);
    // But manager is not a roles-surface caller.
    await expect(statusFor("administrator")).resolves.toBe(404);
  });
});

describe("GET /admin — page re-checks the guard (layout is not the boundary)", () => {
  it("redirects a signed-out visitor to /login", async () => {
    const result = await callOverviewPage();

    expect(result).toHaveProperty("digest");
    expect("digest" in result && result.digest).toContain("NEXT_REDIRECT");
    expect("digest" in result && result.digest).toContain("/login");
  });

  it("returns an identical 404 for a wrong-role and a missing caller (no oracle)", async () => {
    await authorize(SUPPORT);
    const wrongRole = await callOverviewPage();

    await authorize(STRANGER);
    const missing = await callOverviewPage();

    expect(wrongRole).toEqual({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(missing).toEqual(wrongRole);
  });

  it("renders for an administrator and for a manager", async () => {
    await authorize(ADMIN);
    await expect(callOverviewPage()).resolves.toEqual({ ok: true });

    await authorize(MANAGER);
    await expect(callOverviewPage()).resolves.toEqual({ ok: true });
  });
});

describe("bootstrap is create-only across repeated calls", () => {
  it("leaves exactly one row and an unchanged role after two consecutive resolves", async () => {
    await authorize(BOOTSTRAP);
    await expect(statusFor("administrator")).resolves.toBe(200);
    await expect(statusFor("administrator")).resolves.toBe(200);

    const rows = await prisma.adminUser.findMany({ where: { telegramId: BigInt(BOOTSTRAP) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("administrator");

    // A UI downgrade must survive the next resolve — env never re-elevates.
    await prisma.adminUser.update({
      where: { telegramId: BigInt(BOOTSTRAP) },
      data: { role: "support" },
    });
    await expect(getAdminRole(BOOTSTRAP)).resolves.toBe("support");
    await expect(statusFor("administrator")).resolves.toBe(404);
  });
});