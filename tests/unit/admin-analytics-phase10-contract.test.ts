// Phase 10 /admin/analytics page contract (COH-01..05).
//
// Source-level pins for the two new cohort sections below the phase-9 timing
// section:
//   • «Когорты по регистрации» → «Когорты по первой оплате» sit strictly
//     BELOW TimeToProvisionCards and in that fixed order;
//   • two new <Suspense> boundaries (ChartSkeleton h-64 each) → 15 total on
//     the page; ChartSkeleton h-64 count rises from 2 to 4; CardsSkeleton
//     twoUp count stays 3 (1 burn + 2 timing);
//   • CohortTabs is the only new client component ('use client'); CohortMatrix
//     is a server component;
//   • the RSC no-leak boundary extends to CohortMatrix + CohortTabs (no
//     providerCost / provider_cost / userId);
//   • exactly the 14 phase-10 keys exist in ru.ts (Pitfall 10 pinned in both
//     directions — the i18n suite covers usage).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const COMPONENTS = join(ROOT, "components", "admin");

const PAGE_SOURCE = readFileSync(join(ROOT, "app", "admin", "analytics", "page.tsx"), "utf8");
const MATRIX_SOURCE = readFileSync(join(COMPONENTS, "CohortMatrix.tsx"), "utf8");
const TABS_SOURCE = readFileSync(join(COMPONENTS, "CohortTabs.tsx"), "utf8");
const RU_SOURCE = readFileSync(join(ROOT, "lib", "i18n", "messages", "ru.ts"), "utf8");

describe("/admin/analytics — phase 10 composition", () => {
  it("keeps the guard, force-dynamic and period normalization unchanged", () => {
    expect(PAGE_SOURCE).toContain("requireRole('administrator', 'manager')");
    expect(PAGE_SOURCE).toContain("dynamic = 'force-dynamic'");
    expect(PAGE_SOURCE).toContain("rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30");
  });

  it("whitelists regCh / payCh / payDev", () => {
    expect(PAGE_SOURCE).toContain("['all', 'referral', 'promo', 'organic'].includes(params.regCh ?? '')");
    expect(PAGE_SOURCE).toContain("['all', 'referral', 'promo', 'organic'].includes(params.payCh ?? '')");
    expect(PAGE_SOURCE).toContain("['all', '1', '2', '3', '4', '5+'].includes(params.payDev ?? '')");
  });

  it("places the cohort sections strictly below TimeToProvisionCards", () => {
    const regIndex = PAGE_SOURCE.indexOf("analyticsRegCohortTitle");
    const payerIndex = PAGE_SOURCE.indexOf("analyticsPayerCohortTitle");
    expect(regIndex).toBeGreaterThan(PAGE_SOURCE.indexOf("TimeToProvisionCards"));
    expect(payerIndex).toBeGreaterThan(regIndex);
  });

  it("adds exactly two new Suspense boundaries (ChartSkeleton h-64) → 15 total", () => {
    const chart64 = PAGE_SOURCE.match(/<ChartSkeleton className="h-64" \/>/g) ?? [];
    expect(chart64.length).toBe(4); // 1 churn (ph8) + 1 error (ph9) + 2 cohorts (ph10)

    const twoUp = PAGE_SOURCE.match(/<CardsSkeleton count=\{2\} twoUp \/>/g) ?? [];
    expect(twoUp.length).toBe(3); // 1 burn (ph8) + 2 timing (ph9), unchanged

    const suspenses = PAGE_SOURCE.match(/<Suspense fallback=\{/g) ?? [];
    expect(suspenses.length).toBe(15); // 3 ph7 + 5 ph8 + 5 ph9 + 2 ph10
  });
});

describe("/admin/analytics — cohort components server/client split", () => {
  it("CohortTabs is the only new client component", () => {
    expect(TABS_SOURCE).toContain("'use client'");
    expect(MATRIX_SOURCE).not.toContain("'use client'");
  });

  it("CohortMatrix calls the loaders", () => {
    expect(MATRIX_SOURCE).toContain("loadRegistrationCohorts");
    expect(MATRIX_SOURCE).toContain("loadPayerCohorts");
  });
});

describe("/admin/analytics — no cost/provider fields or user ids in the RSC surface (Pitfall 5)", () => {
  it("keeps providerCost / provider_cost / userId out of CohortMatrix and CohortTabs", () => {
    expect(MATRIX_SOURCE).not.toMatch(/providerCost|provider_cost|userId/);
    expect(TABS_SOURCE).not.toMatch(/providerCost|provider_cost|userId/);
  });
});

describe("ru.ts — exactly the 14 phase-10 analytics keys", () => {
  it("counts 14 keys matching the phase-10 prefix alternation", () => {
    const re = /^\s{4}analytics(RegCohort|PayerCohort|Cohort)/gm;
    const matches = RU_SOURCE.match(re) ?? [];
    expect(matches.length).toBe(14);
  });
});
