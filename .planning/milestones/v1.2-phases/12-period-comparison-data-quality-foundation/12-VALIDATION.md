---
phase: "12"
slug: "period-comparison-data-quality-foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-31"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in lockfile — no new dependency) |
| **Config file** | `vitest.config.ts` (`include: ['tests/**/*.test.ts']`, `environment: 'node'`, `fileParallelism: false`, `@/` alias) |
| **Quick run command** | `npx vitest run tests/unit/analytics-windows.test.ts tests/unit/analytics-compare.test.ts tests/unit/analytics-quality.test.ts tests/unit/metric-registry.test.ts` |
| **Full suite command** | `npm test` → `vitest run tests/unit` (requires local Postgres; ~6s) |
| **Estimated runtime** | ~2s (quick, pure) / ~6s (full, DB-backed) |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the module the task touched (pure suites — no DB, seconds).
- **After every plan wave:** Run `npx vitest run tests/unit/analytics-*.test.ts tests/unit/admin-analytics-*.test.ts tests/unit/trial-*.test.ts tests/unit/i18n.test.ts` — catches the D-04 (`windowStartDay` upper-bound) blast radius immediately.
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npm run build` (the only typecheck of RSC/page/route files and the metric-registry/label wiring).
- **Max feedback latency:** 10 seconds (quick), 60 seconds (wave).

---

## Per-Task Verification Map

> Seeded by plan-phase. The planner fills one row per task from the PLAN.md `<verify>` blocks; requirement → expected test mapping is fixed by `12-RESEARCH.md` §Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ALR-01 / EXT-05 / PRM-01 base / PRM-04 base / D-15 | see RESEARCH §Security Domain | Write-guard never lets a degraded run overwrite a healthy day; click/trial IP capture stores sha256 only, never raw IP, never `"direct"` | unit / integration / contract / regression | see `12-RESEARCH.md` §Phase Requirements → Test Map | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/analytics-windows.test.ts` — window pair derivation; today in neither; equal lengths; adjacency; 7/30/90
- [ ] `tests/unit/analytics-compare.test.ts` — `compareFlow` all four outcomes (`ok` / `no-base(zero)` / `no-base(absent)` / `incomparable`); percent formatting
- [ ] `tests/unit/analytics-quality.test.ts` — degraded classifier taxonomy + in-window open-event summary
- [ ] `tests/unit/analytics-rollup-guard.test.ts` — healthy overwrites / degraded preserves healthy / degraded inserts into hole / concurrency
- [ ] `tests/unit/analytics-phase12-loaders.test.ts` — upper bound present in every windowed loader (incl. payers raw SQL); stock metrics use `mrrAt(endExclusive)`
- [ ] `tests/unit/analytics-v11-regression.test.ts` — SC-7 derivation identity under pinned bounds
- [ ] `tests/unit/referral-clicks.test.ts` — promo kind, hourly dedupe, `"direct"` rejection, funnel-scope isolation, 13-month retention sweep
- [ ] `tests/unit/analytics-ip-capture.test.ts` — register `signupIpHash`; trial `trialIpHash` atomicity; `"direct"` → `null`
- [ ] `tests/unit/metric-registry.test.ts` — every `MetricId` has all seven fields non-empty
- [ ] `tests/unit/admin-analytics-phase12-contract.test.ts` — `MetricCard` accepts optional `delta`/`quality`; existing call sites unchanged
- [ ] **Extend** `tests/unit/analytics-rollup.test.ts`, `tests/unit/analytics-cron-route.test.ts`, `tests/unit/trial-claim.test.ts`, `tests/unit/client-ip.test.ts`, `tests/unit/i18n.test.ts`
- [ ] **Fix** the D-04 fallout in `analytics-phase8-loaders`, `analytics-phase9-loaders`, `analytics-phase10-loaders`, `analytics-phase11-loaders`, `admin-analytics-phase9-contract` (expect failures; decide old-semantics vs derivation per assertion)
- [ ] Framework install: none — vitest is already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Delta/quality presentation reads correctly on mobile PWA and with neutral tokens (no red/green) | ALR-01 / EXT-05 | Visual judgement; no visual-regression harness in repo | Open `/admin/analytics` at 375px and desktop; confirm `—` + «нет базы» on zero base, badge «данные неполные (N)» + tooltip, and no red/green semantics review with `ui-brand` tokens |
| Side-by-side manual reconciliation of two adjacent periods against raw orders | ALR-01 SC-2 | Requires operator picking an arbitrary live window; data-dependent | Pick a `?period`, export the same window and its predecessor from `orders`, sum `cash = finalAmount − balanceUsed`, compare with card value and delta |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
