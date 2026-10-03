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
import AdminUserProfilePage from "../../app/admin/users/[id]/page";
import { POST as adminRoleChange } from "../../app/api/admin/roles/route";
import { getAdminRole, requireRole, type AdminRole } from "../../lib/admin-auth";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { AdminError, SessionError } from "../../lib/session";

const BOOTSTRAP = 910000101;
const ADMIN = 910000201;
const SUPPORT = 910000202;
const MANAGER = 910000203;
const STRANGER = 910000204;
const ROLE_TARGET = 910000205;
const PROFILE_STAFF = 910000206;
const IDS = [BOOTSTRAP, ADMIN, SUPPORT, MANAGER, STRANGER, ROLE_TARGET, PROFILE_STAFF].map((id) =>
  BigInt(id),
);

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
  await prisma.user.deleteMany({ where: { telegramId: { in: IDS } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.adminUser.createMany({
    data: [
      { telegramId: BigInt(ADMIN), role: "administrator" },
      { telegramId: BigInt(SUPPORT), role: "support" },
      { telegramId: BigInt(MANAGER), role: "manager" },
      { telegramId: BigInt(ROLE_TARGET), role: "support" },
      { telegramId: BigInt(PROFILE_STAFF), role: "support" },
    ],
  });
  await prisma.user.create({
    data: { telegramId: BigInt(PROFILE_STAFF), firstName: "Staff", lastName: "Member" },
  });
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  session.token = undefined;
  // Keep the bootstrap row absent by default; bootstrap tests create it.
  await prisma.adminUser.deleteMany({ where: { telegramId: BigInt(BOOTSTRAP) } });
  // Reset the role-change target to a known state before each test.
  await prisma.adminUser.updateMany({
    where: { telegramId: BigInt(ROLE_TARGET) },
    data: { role: "support" },
  });
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

function roleChangeRequest(payload: unknown): Request {
  return new Request("http://localhost/api/admin/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

type AnyElement = { props?: Record<string, unknown> };

/** Walk a rendered React element tree (function components pre-invoked). */
function walkElements(node: unknown, visit: (element: AnyElement) => void): void {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit);
    return;
  }
  const element = node as AnyElement;
  if (!element.props) return;
  visit(element);
  walkElements(element.props.children, visit);
}

/** True when the tree contains a RoleChangeControl element (target telegramId). */
function hasRoleControl(node: unknown): boolean {
  let found = false;
  walkElements(node, (element) => {
    if (element.props?.telegramId !== undefined && element.props?.currentRole !== undefined) {
      found = true;
    }
  });
  return found;
}

describe("POST /api/admin/roles — gate + conditional write (D-66 / T-05-15)", () => {
  it("returns 401 for a signed-out caller", async () => {
    const res = await adminRoleChange(
      roleChangeRequest({ telegramId: ROLE_TARGET, role: "manager" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a support or manager caller (administrator only)", async () => {
    await authorize(SUPPORT);
    expect(
      (await adminRoleChange(roleChangeRequest({ telegramId: ROLE_TARGET, role: "manager" })))
        .status,
    ).toBe(404);

    await authorize(MANAGER);
    expect(
      (await adminRoleChange(roleChangeRequest({ telegramId: ROLE_TARGET, role: "manager" })))
        .status,
    ).toBe(404);
  });

  it("changes another staff member's role through a conditional write", async () => {
    await authorize(ADMIN);
    const res = await adminRoleChange(
      roleChangeRequest({ telegramId: ROLE_TARGET, role: "manager" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: "manager" });
    const row = await prisma.adminUser.findUnique({
      where: { telegramId: BigInt(ROLE_TARGET) },
    });
    expect(row?.role).toBe("manager");
  });

  it("404s an unknown target and writes nothing", async () => {
    await authorize(ADMIN);
    const res = await adminRoleChange(
      roleChangeRequest({ telegramId: 919999999, role: "manager" }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a self-change (400) and leaves the caller's role unchanged", async () => {
    await authorize(ADMIN);
    const res = await adminRoleChange(
      roleChangeRequest({ telegramId: ADMIN, role: "support" }),
    );

    expect(res.status).toBe(400);
    const row = await prisma.adminUser.findUnique({ where: { telegramId: BigInt(ADMIN) } });
    expect(row?.role).toBe("administrator");
  });

  it("rejects a malformed payload with 400", async () => {
    await authorize(ADMIN);
    expect((await adminRoleChange(roleChangeRequest({ telegramId: ROLE_TARGET }))).status).toBe(
      400,
    );
    expect(
      (await adminRoleChange(roleChangeRequest({ telegramId: ROLE_TARGET, role: "owner" })))
        .status,
    ).toBe(400);
  });
});

describe("/admin/users/[id] — role action visibility (UI-SPEC §4)", () => {
  it("renders the role-change control for an administrator viewing staff", async () => {
    await authorize(ADMIN);
    const header = await prisma.user.findUniqueOrThrow({
      where: { telegramId: BigInt(PROFILE_STAFF) },
      select: { id: true },
    });
    const tree = await AdminUserProfilePage({
      params: Promise.resolve({ id: String(header.id) }),
    });
    expect(hasRoleControl(tree)).toBe(true);
  });

  it("omits the control for support and manager callers", async () => {
    const header = await prisma.user.findUniqueOrThrow({
      where: { telegramId: BigInt(PROFILE_STAFF) },
      select: { id: true },
    });

    await authorize(SUPPORT);
    const supportTree = await AdminUserProfilePage({
      params: Promise.resolve({ id: String(header.id) }),
    });
    expect(hasRoleControl(supportTree)).toBe(false);

    await authorize(MANAGER);
    const managerTree = await AdminUserProfilePage({
      params: Promise.resolve({ id: String(header.id) }),
    });
    expect(hasRoleControl(managerTree)).toBe(false);
  });
});