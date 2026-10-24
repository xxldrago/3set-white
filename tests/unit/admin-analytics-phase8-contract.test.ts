// Phase 8 /admin/analytics page contract (D-17/D-19, ANL-04..07/13/14).
//
// Source-level pins for the two new sections below the Phase 7 sparkline:
//   • the sections sit strictly BELOW <MrrSparkline> (index assertion);
//   • five new <Suspense> boundaries (3 × CardsSkeleton + 1 × CardsSkeleton
//     twoUp + 1 × ChartSkeleton h-64);
//   • the guard / force-dynamic / period normalization are byte-unchanged;
//   • none of the five new components is a client component ('use client');
//   • artemida.getBalance lives only in service.ts (inside loadBurnRunway) and
//     never in the four non-balance components;
//   • the RSC no-leak boundary extends to the five new components (no
//     providerCost / provider_cost / userId in their sources);
//   • exactly the 44 locked keys from UI-SPEC §Copywriting exist in ru.ts
//     (Pitfall 10 pinned in both directions — the i18n suite covers usage).
//
// The RBAC section mirrors tests/unit/admin-analytics-page.test.ts: the page
// re-checks the guard for direct RSC fetches (Pitfall 12). Fresh adminUser id
// range 910000351-354 — never collides with the existing page test (…241-244).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = "910000351";
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

const ADMIN = 910000351;
const MANAGER = 910000352;
const SUPPORT = 910000353;
const STRANGER = 910000354;
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

describe("/admin/analytics — phase 8 sections still sit behind the same guard", () => {
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
const COMPONENTS = join(HERE, "..", "..", "components", "admin");
const SERVICE_PATH = join(HERE, "..", "..", "lib", "analytics", "service.ts");

const PAGE_SOURCE = readFileSync(
  join(HERE, "..", "..", "app", "admin", "analytics", "page.tsx"),
  "utf8",
);
const SERVICE_SOURCE = readFileSync(SERVICE_PATH, "utf8");
const LTV_SOURCE = readFileSync(join(COMPONENTS, "LtvCards.tsx"), "utf8");
const MARGIN_SOURCE = readFileSync(join(COMPONENTS, "MarginCards.tsx"), "utf8");
const BURN_SOURCE = readFileSync(join(COMPONENTS, "BurnRunwayCards.tsx"), "utf8");
const RETENTION_SOURCE = readFileSync(join(COMPONENTS, "RetentionCards.tsx"), "utf8");
const CHURN_SOURCE = readFileSync(join(COMPONENTS, "ChurnTable.tsx"), "utf8");
const NEW_COMPONENT_SOURCES = [LTV_SOURCE, MARGIN_SOURCE, BURN_SOURCE, RETENTION_SOURCE, CHURN_SOURCE];

describe("/admin/analytics — phase 8 composition (D-17: below the sparkline, nothing above moves)", () => {
  it("keeps the guard, force-dynamic and period normalization unchanged", () => {
    expect(PAGE_SOURCE).toContain("requireRole('administrator', 'manager')");
    expect(PAGE_SOURCE).toContain("dynamic = 'force-dynamic'");
    expect(PAGE_SOURCE).toContain("rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30");
  });

  it("places the AnalyticsSection blocks strictly below MrrSparkline", () => {
    expect(PAGE_SOURCE).toContain("AnalyticsSection");
    expect(PAGE_SOURCE.indexOf("AnalyticsSection")).toBeGreaterThan(
      PAGE_SOURCE.indexOf("MrrSparkline"),
    );
  });

  it("adds exactly five new Suspense boundaries (3 × count=3, 1 × twoUp, 1 × ChartSkeleton h-64)", () => {
    const count3 = PAGE_SOURCE.match(/<CardsSkeleton count=\{3\} \/>/g) ?? [];
    expect(count3.length).toBe(3);
    expect(PAGE_SOURCE).toContain("<CardsSkeleton count={2} twoUp />");
    expect(PAGE_SOURCE).toContain('<ChartSkeleton className="h-64" />');
    const suspenses = PAGE_SOURCE.match(/<Suspense fallback=\{/g) ?? [];
    expect(suspenses.length).toBe(8); // KPI + waterfall + sparkline + 5 new
    expect(PAGE_SOURCE).toContain("BurnRunwayCards");
    expect(PAGE_SOURCE).toContain("RetentionCards");
    expect(PAGE_SOURCE).toContain("ChurnTable");
  });
});

describe("/admin/analytics — the five new components are server components (D-19)", () => {
  it("contains no 'use client' directive in any of the five new components", () => {
    for (const source of NEW_COMPONENT_SOURCES) {
      expect(source).not.toContain("'use client'");
    }
  });
});

describe("/admin/analytics — the only live balance caller is loadBurnRunway (D-15)", () => {
  it("keeps the provider module out of all five new components — the balance is in the payload", () => {
    for (const source of NEW_COMPONENT_SOURCES) {
      expect(source).not.toMatch(/artemida/);
    }
  });

  it("resolves the balance inside loadBurnRunway (service.ts), not in any component", () => {
    // The call spans two source lines (artemida / .getBalance()) — tolerate whitespace.
    expect(SERVICE_SOURCE).toMatch(/artemida\s*\.\s*getBalance/);
  });
});

describe("/admin/analytics — no cost/provider fields or user ids in the RSC surface (Pitfall 5)", () => {
  it("keeps providerCost / provider_cost / userId out of the five new components and the page", () => {
    expect(PAGE_SOURCE).not.toMatch(/providerCost|provider_cost|userId/);
    for (const source of NEW_COMPONENT_SOURCES) {
      expect(source).not.toMatch(/providerCost|provider_cost|userId/);
    }
  });
});

describe("ru.ts — exactly the 44 locked phase-8 analytics keys (UI-SPEC §Copywriting)", () => {
  it("counts 44 keys matching the phase-8 prefix alternation", () => {
    const ruSource = readFileSync(
      join(HERE, "..", "..", "lib", "i18n", "messages", "ru.ts"),
      "utf8",
    );
    const re = /^\s{4}analytics(Unit|Retention|Window|Ltv|Gross|Margin|Cost|Burn|Runway|Renewal|Logo|Revenue|Churn|Col)/gm;
    const matches = ruSource.match(re) ?? [];
    expect(matches.length).toBe(44);
    // The D-01 under-amortization marker is part of the 44 (43 locked + 1).
    expect(/^\s{4}analyticsLtvGrossHistSubActive:/gm.test(ruSource)).toBe(true);
  });
});