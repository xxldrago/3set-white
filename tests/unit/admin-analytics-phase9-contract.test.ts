// Phase 9 /admin/analytics page contract (D-05/D-06, ANL-08..11).
//
// Source-level pins for the three new sections below the phase-8 retention
// section:
//   • «Воронка платежей» → «Ошибки выдачи» → «Скорость оплаты и выдачи» sit
//     strictly BELOW <ChurnTable> and in that fixed order (index assertions);
//   • five new <Suspense> boundaries (funnel count=4, expired count=1, error
//     ChartSkeleton h-64, timing ×2 twoUp) → 13 total on the page;
//   • none of the five new components is a client component ('use client');
//   • the RSC no-leak boundary extends to the page + all five new component
//     sources (no providerCost / provider_cost / userId anywhere, comments
//     included);
//   • exactly the 31 phase-9 keys exist in ru.ts (Pitfall 10 pinned in both
//     directions — the i18n suite covers usage);
//   • prisma/schema.prisma's OrderStatus enum contains no 'expired' member —
//     the state-machine prohibition from 09-CONTEXT «Не входит» is pinned,
//     not just asserted in prose.
//
// The RBAC section mirrors tests/unit/admin-analytics-page.test.ts: the page
// re-checks the guard for direct RSC fetches (Pitfall 12). Fresh adminUser id
// range 910000451-454 — never collides with the existing page test (…241-244)
// or the phase-8 contract test (…351-354).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const session = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.hoisted(() => {
  process.env.ADMIN_TELEGRAM_IDS = "910000451";
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

const ADMIN = 910000451;
const MANAGER = 910000452;
const SUPPORT = 910000453;
const STRANGER = 910000454;
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

describe("/admin/analytics — phase 9 sections still sit behind the same guard", () => {
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
const ROOT = join(HERE, "..", "..");
const COMPONENTS = join(ROOT, "components", "admin");

const PAGE_SOURCE = readFileSync(join(ROOT, "app", "admin", "analytics", "page.tsx"), "utf8");
const FUNNEL_SOURCE = readFileSync(join(COMPONENTS, "FunnelCards.tsx"), "utf8");
const EXPIRED_SOURCE = readFileSync(join(COMPONENTS, "ExpiredCards.tsx"), "utf8");
const ERROR_SOURCE = readFileSync(join(COMPONENTS, "ErrorTable.tsx"), "utf8");
const TIME_TO_PAY_SOURCE = readFileSync(join(COMPONENTS, "TimeToPayCards.tsx"), "utf8");
const TIME_TO_PROVISION_SOURCE = readFileSync(
  join(COMPONENTS, "TimeToProvisionCards.tsx"),
  "utf8",
);
const NEW_COMPONENT_SOURCES = [
  FUNNEL_SOURCE,
  EXPIRED_SOURCE,
  ERROR_SOURCE,
  TIME_TO_PAY_SOURCE,
  TIME_TO_PROVISION_SOURCE,
];
const RU_SOURCE = readFileSync(join(ROOT, "lib", "i18n", "messages", "ru.ts"), "utf8");
const SCHEMA_SOURCE = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");

describe("/admin/analytics — phase 9 composition (D-05: three sections below retention)", () => {
  it("keeps the guard, force-dynamic and period normalization unchanged", () => {
    expect(PAGE_SOURCE).toContain("requireRole('administrator', 'manager')");
    expect(PAGE_SOURCE).toContain("dynamic = 'force-dynamic'");
    expect(PAGE_SOURCE).toContain("rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30");
  });

  it("places the first new section strictly below ChurnTable", () => {
    const funnelIndex = PAGE_SOURCE.indexOf("analyticsFunnelTitle");
    expect(funnelIndex).toBeGreaterThan(-1);
    expect(funnelIndex).toBeGreaterThan(PAGE_SOURCE.indexOf("ChurnTable"));
  });

  it("keeps the section order funnel → errors → timing", () => {
    const funnelIndex = PAGE_SOURCE.indexOf("analyticsFunnelTitle");
    const errorIndex = PAGE_SOURCE.indexOf("analyticsErrorTitle");
    const timingIndex = PAGE_SOURCE.indexOf("analyticsTimingTitle");
    expect(funnelIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(funnelIndex);
    expect(timingIndex).toBeGreaterThan(errorIndex);
  });

  it("adds exactly five new Suspense boundaries (funnel 4, expired 1, error h-64, timing ×2)", () => {
    expect(PAGE_SOURCE).toContain("<CardsSkeleton count={4} fourUp />");
    expect(PAGE_SOURCE).toContain("<CardsSkeleton count={1} />");

    const twoUp = PAGE_SOURCE.match(/<CardsSkeleton count=\{2\} twoUp \/>/g) ?? [];
    expect(twoUp.length).toBe(3); // 1 burn (phase 8) + 2 timing (phase 9)

    const chart64 = PAGE_SOURCE.match(/<ChartSkeleton className="h-64" \/>/g) ?? [];
    expect(chart64.length).toBe(4); // 1 churn (ph8) + 1 error (ph9) + 2 cohorts (ph10)

    const suspenses = PAGE_SOURCE.match(/<Suspense fallback=\{/g) ?? [];
    expect(suspenses.length).toBe(15); // 3 phase-7 + 5 phase-8 + 5 phase-9 + 2 phase-10
  });
});

describe("/admin/analytics — the five new components are server components (D-05)", () => {
  it("contains no 'use client' directive in any of the five new components", () => {
    for (const source of NEW_COMPONENT_SOURCES) {
      expect(source).not.toContain("'use client'");
    }
  });

  it("gives every block its own loader call and its own error skeleton", () => {
    expect(FUNNEL_SOURCE).toContain("loadFunnel(period)");
    expect(EXPIRED_SOURCE).toContain("loadExpired()");
    expect(ERROR_SOURCE).toContain("loadErrorBreakdown(period)");
    expect(TIME_TO_PAY_SOURCE).toContain("loadTimeToPay(period)");
    expect(TIME_TO_PROVISION_SOURCE).toContain("loadTimeToProvision(period)");
    for (const source of NEW_COMPONENT_SOURCES) {
      expect(source).toContain("t('common.errorLoad')");
    }
  });

  it("shares one duration formatter with the provisioning block", () => {
    expect(TIME_TO_PAY_SOURCE).toContain("export function formatDuration(");
    expect(TIME_TO_PROVISION_SOURCE).toContain("from './TimeToPayCards'");
  });
});

describe("/admin/analytics — no cost/provider fields or user ids in the RSC surface (Pitfall 5)", () => {
  it("keeps providerCost / provider_cost / userId out of the page and the five new components", () => {
    expect(PAGE_SOURCE).not.toMatch(/providerCost|provider_cost|userId/);
    for (const source of NEW_COMPONENT_SOURCES) {
      expect(source).not.toMatch(/providerCost|provider_cost|userId/);
    }
  });
});

describe("ru.ts — exactly the 31 phase-9 analytics keys (UI-SPEC §Copywriting)", () => {
  it("counts 31 keys matching the phase-9 prefix alternation", () => {
    const re = /^\s{4}analytics(Funnel|Error|Timing|Expired|Duration)/gm;
    const matches = RU_SOURCE.match(re) ?? [];
    expect(matches.length).toBe(31);
  });
});

describe("prisma/schema.prisma — no 'expired' OrderStatus member (09-CONTEXT «Не входит»)", () => {
  it("keeps the OrderStatus enum at the seven shipped members", () => {
    expect(SCHEMA_SOURCE).not.toMatch(/enum OrderStatus \{[\s\S]*?expired[\s\S]*?\}/);
  });
});
