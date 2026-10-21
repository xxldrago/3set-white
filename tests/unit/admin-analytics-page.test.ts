// Phase 7 /admin/analytics page contract (D-10/D-11, ANL-01/02/03).
//
// The RBAC Facts the page must uphold: signed-out → NEXT_REDIRECT /login,
// no staff row or a non-privileged role → identical 404 (never a 403 page),
// administrator/manager → renders. The guard re-check lives IN the page, not
// only in the layout (RSC payloads skip layouts — Pitfall 12). A source scan
// also pins the leak contract (Pitfall 5): no cost/provider field enters the
// page props or any chart component. Runs against the real local Postgres
// with a private id range (never collides with admin-route.test.ts).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = "910000299";
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.token === undefined ? undefined : { name, value: session.token },
  }),
}));

import AdminAnalyticsPage from "../../app/admin/analytics/page";
import { signSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

const ADMIN = 910000241;
const MANAGER = 910000242;
const SUPPORT = 910000243;
const STRANGER = 910000244;
const IDS = [ADMIN, MANAGER, SUPPORT, STRANGER].map((id) => BigInt(id));

const SECRET =
  process.env["SESSION_SECRET"] ?? "unit-test-session-secret-at-least-32-characters";

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
      { telegramId: BigInt(MANAGER), role: "manager" },
      { telegramId: BigInt(SUPPORT), role: "support" },
    ],
  });
});

afterAll(async () => {
  await cleanup();
});

beforeEach(() => {
  session.token = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Invoke the page as Next would and capture its redirect/not-found digest. */
async function callPage(): Promise<{ ok: true } | { digest: string }> {
  try {
    await AdminAnalyticsPage();
    return { ok: true };
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    return { digest: typeof digest === "string" ? digest : "unknown" };
  }
}

describe("/admin/analytics — page re-checks the guard (RSC payloads skip layouts)", () => {
  it("redirects a signed-out visitor to /login", async () => {
    const result = await callPage();

    expect(result).toHaveProperty("digest");
    expect("digest" in result && result.digest).toContain("NEXT_REDIRECT");
    expect("digest" in result && result.digest).toContain("/login");
  });

  it("returns an identical 404 for a wrong-role (support) and a missing caller", async () => {
    await authorize(SUPPORT);
    const wrongRole = await callPage();
    expect(wrongRole).toEqual({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    await authorize(STRANGER);
    const missing = await callPage();
    expect(missing).toEqual(wrongRole);
  });

  it("renders for an administrator and for a manager", async () => {
    await authorize(ADMIN);
    await expect(callPage()).resolves.toEqual({ ok: true });

    await authorize(MANAGER);
    await expect(callPage()).resolves.toEqual({ ok: true });
  });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_SOURCE = readFileSync(
  join(HERE, "..", "..", "app", "admin", "analytics", "page.tsx"),
  "utf8",
);
const CHART_SOURCES = ["AnalyticsKpi.tsx", "MrrWaterfall.tsx", "MrrSparkline.tsx"].map((name) =>
  readFileSync(join(HERE, "..", "..", "components", "admin", name), "utf8"),
);

describe("/admin/analytics — force-dynamic + ?period= contract", () => {
  it("re-checks requireRole('administrator', 'manager') inside the page", () => {
    expect(PAGE_SOURCE).toContain("requireRole('administrator', 'manager')");
  });

  it("is force-dynamic", () => {
    expect(PAGE_SOURCE).toContain("dynamic = 'force-dynamic'");
  });

  it("accepts only 7|30|90 for ?period= (anything else → 30)", () => {
    expect(PAGE_SOURCE).toContain("rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30");
  });
});

describe("/admin/analytics — no cost/provider fields in the RSC payload (Pitfall 5)", () => {
  it("keeps providerCost / provider_cost out of the page props and chart components", () => {
    expect(PAGE_SOURCE).not.toMatch(/providerCost|provider_cost/);
    for (const source of CHART_SOURCES) {
      expect(source).not.toMatch(/providerCost|provider_cost/);
    }
  });
});
