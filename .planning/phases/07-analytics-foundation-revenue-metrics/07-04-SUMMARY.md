---
phase: 07-analytics-foundation-revenue-metrics
plan: "04"
subsystem: analytics
tags: [mrr, arr, arpu, arppu, waterfall, reconciliation-identity, msk, europe-moscow, vitest, pure-derivation]

# Dependency graph
requires:
  - phase: 07-analytics-foundation-revenue-metrics
    provides: "lib/analytics/series.ts KeyTerm/buildKeyTerms shared term-chain engine + PaidOrderRow (07-02); lib/analytics/time.ts MSK month helpers (07-01)"
provides:
  - "lib/analytics/mrr.ts — keyRefOf COALESCE join, per-instant MRR chain (mrrAt/totalMrrAt/activeKeysAt/arrAt), ARPU/ARPPU/coverage helpers (all pure, ANL-01/03)"
  - "lib/analytics/waterfall.ts — waterfallForMonth/waterfallForMonths with the exact reconciliation identity (ANL-02)"
  - "18 new unit tests (mrr 8, waterfall 6, metrics 4) incl. DB-backed denominator vectors"
affects: [07-05, phase-08]

# Actuals (#2632) — chars/4 over the realized diff (38.6k chars / 856 added lines).
actuals:
  tokens: 9660
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Per-instant segment base resolved THROUGH buildKeyTerms on chain suffixes — no second cursor implementation outside the 07-02 shared engine"
    - "Reconciliation identity as a test assertion over EVERY month pair, not a comment (ANL-02)"
    - "Null-denominator contract: ratios return the exact rational and null on zero denominators; whole-ruble rounding belongs to the UI (Math.round)"

key-files:
  created:
    - lib/analytics/mrr.ts
    - lib/analytics/waterfall.ts
    - tests/unit/analytics-mrr.test.ts
    - tests/unit/analytics-waterfall.test.ts
    - tests/unit/analytics-metrics.test.ts
  modified: []

key-decisions:
  - "Per-instant segment base = the chain op whose term contains t (LAST new|renew paid by t, per RESEARCH §'chain op whose term contains t' and D-01 «его последний paid-заказ»), not the frozen first-op equivalent — the only reading that makes Task 2's REQUIRED contraction classification constructible from pure order fixtures (base-frozen MRR can never decrease pre-expiry), keeps D-03's exclusion of balance-covered renewals literal (cashOf=0 → 0 ₽ segment) and preserves the waterfall's promo/renewal contraction semantics"
  - "BuildKeyTerms is still the ONLY chain-cursor implementation: the per-instant base is resolved by rebuilding chain suffixes through the shared engine, never by re-deriving cursor math in mrr.ts"
  - "waterfallForMonth takes (monthLabel, prevLabel | null, orders): prevLabel = null means the all-zero baseline of a period start — reconciles the plan artifact's 2-arg mention with the task action's 3-arg prescriptive signature, and keeps 'keys carried in before the window count as new' honest"
  - "ANL-01/02/03 NOT yet marked Complete in REQUIREMENTS.md — the shared-ID gate blocks them until 07-05 (which also declares them) produces its SUMMARY"

patterns-established:
  - "Analytics derivation discipline: pure modules over PaidOrderRow[], money math downstream of cashOf, PAID-status filtering stays in the DB layer"
  - "Exactness discipline in money tests: fixtures restricted to exact-in-IEEE values (30/90/180-day terms, 15/60-day upgrade remainders) so identities assert with toBe, no epsilon"

requirements-completed: [ANL-01, ANL-02, ANL-03]

coverage:
  - id: D1
    description: "Per-key MRR chain (ANL-01): keyRefOf COALESCE(keyId, provisionedKeyId) — kind=new via provisionedKeyId; renew extends from the CURRENT expiry (termEnd = first paidAt + Σ days); expiry boundary t === termEnd → 0, termEnd − 1ms → full; upgrade spread via ARTEMIDA's own max(1, (termEnd − paidAt)/30) rule, no NaN/Infinity; one key = one MRR row; trials (no order) contribute nothing; bonus renewals (cashOf 0) excluded per D-03"
    requirement: "ANL-01"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-mrr.test.ts#8 tests (keyRefOf, new-via-provisionedKeyId, renew extension, expiry boundary, upgrade spread ×2, one-key-one-row, trials/bonus)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "MRR waterfall (ANL-02): MSK calendar month-end snapshots via per-key mrrAt; deterministic classification (new / expansion / contraction / churned / neither); exact reconciliation identity new + expansion − contraction − churned = ΔMRR asserted for EVERY sampled month pair; empty month → truthful all-zero row; upgrade lands in the month its paidAt falls"
    requirement: "ANL-02"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-waterfall.test.ts#6 tests (identity loop over 2026-06…2026-10, classification table, neither bucket, empty month ×2, upgrade month-end attribution)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ARPU/ARPPU/coverage helpers (ANL-03): zero denominator → null never 0; exact rational returned (UI rounds with Math.round); computeCoverage knows known=0/total>0 (0 ratio, «0 из N») from total=0 (null, «за период не было оплаченных заказов»); D-05 «без заблокированных» documented as a no-op; denominators proven against the real DB (prisma.user.count() + COUNT(DISTINCT user_id) ≠ order count)"
    requirement: "ANL-03"
    verification:
      - kind: unit
        ref: "tests/unit/analytics-metrics.test.ts#4 tests (null contracts, exact rational + Math.round, coverage states, DB-backed denominators incl. raw SQL)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Manual reconciliation cross-check (VALIDATION): a manual month calculation over REAL production orders matches the waterfall components"
    requirement: "ANL-02"
    verification: []
    human_judgment: true
    rationale: "Requires the deployed environment against the production order history — not reachable from this executor (local test DB has no real history). Structurally de-risked by the exact reconciliation identity asserted over every sampled month pair in tests/unit/analytics-waterfall.test.ts; execution instructions belong to the deploy runbook (07-USER-SETUP.md / docs/DEPLOY.md)."

duration: 21min
completed: 2026-10-21
status: complete
---

# Phase 7 Plan 4: Derivation Core Summary

**Pure derivation core shipped: per-key MRR/ARR chain plus the reconciled MRR waterfall and ARPU/ARPPU/coverage helpers, pinned by 18 tests including the reconciliation identity asserted exactly for every sampled month pair.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-21T07:44:16Z
- **Completed:** 2026-10-21T08:05:09Z
- **Tasks:** 3 of 3 (TDD: RED + GREEN each)
- **Files modified:** 5 (all created)

## Accomplishments

- `lib/analytics/mrr.ts` (pure, no Prisma import): `keyRefOf` = COALESCE(keyId, provisionedKeyId) (Pitfall 3); term chains from 07-02's `buildKeyTerms` — the ONE shared engine; renew extends from the CURRENT expiry (A3); strict boundary `t < termEnd ⇔ active` (`t === termEnd → 0`); upgrade spread with ARTEMIDA's own `max(1, (termEnd − paidAt)/30 days)` rule (Pitfall 4, never `/(days/30)`); `mrrAt`/`totalMrrAt`/`activeKeysAt`/`arrAt`; D-01/A3/boundary/D-03 documented in the module comment.
- `lib/analytics/waterfall.ts` (pure): `waterfallForMonth(monthLabel, prevLabel | null, orders)` + `waterfallForMonths(monthLabels, orders)` — per-key month-end snapshots via mrrAt (one derivation for KPI and waterfall), deterministic five-way classification, and the module comment stating the contraction truth: NO downgrade OrderKind exists — observed contraction is pricing/promo-driven or balance-covered (cashOf = 0).
- `tests/unit/analytics-mrr.test.ts` (8 tests), `analytics-waterfall.test.ts` (6), `analytics-metrics.test.ts` (4, one DB-backed): boundary/precision probes, unclassified keys never fabricated, adjacency/ordering of month pairs, empty-month truthfulness, upgrade month-end attribution, exact-rational/null-denominator contracts, and `COUNT(DISTINCT user_id)` DB vectors on the real test Postgres.
- **Full suite: 525 passed / 62 files** (07-03 baseline 507/59). `npx tsc --noEmit` exit 0. No schema change, no new npm dependencies.

## Task Commits

Each task committed RED → GREEN (TDD):

1. **Task 1: per-key MRR chain** — RED `1e75b6b` (test) → GREEN `1d339da` (feat)
2. **Task 2: MRR waterfall** — RED `344da15` (test) → GREEN `68e30be` (feat)
3. **Task 3: ARPU/ARPPU/coverage** — RED `e9d2d44` (test) → GREEN `fe646dc` (feat)

_No REFACTOR commits were needed — the implementations passed their suites as written._

**Plan metadata:** committed with this SUMMARY. STATE.md/ROADMAP.md intentionally untouched — orchestrator owns those writes; ANL-01/02/03 left pending in REQUIREMENTS.md by the shared-ID gate (07-05 also declares them).

## Files Created/Modified

- `lib/analytics/mrr.ts` — keyRefOf, per-instant MRR chain, activeKeys/totalMrr/arr, ARPU/ARPPU/coverage helpers
- `lib/analytics/waterfall.ts` — month-end snapshot classification with the exact reconciliation identity
- `tests/unit/analytics-mrr.test.ts` — 8 pure vectors (boundary/precision, one-key-one-row, trials/bonus)
- `tests/unit/analytics-waterfall.test.ts` — 6 pure vectors (exact identity every month, classification edges, empty months, upgrade attribution)
- `tests/unit/analytics-metrics.test.ts` — 4 vectors (null contracts, precision, coverage states, DB denominators)

## Decisions Made

- **Per-instant segment base = the chain op whose term contains t** (the last new|renew with paidAt ≤ t — RESEARCH §MRR's "chain op whose term contains t" and D-01's «ключ → его последний paid-заказ»). The plan's Task 1 action line "base = term.base" (first chain op) was **inconsistent with Task 2's REQUIRED contraction classification**: a first-op-frozen MRR can never decrease before expiry, so no pure order fixture could ever produce both > 0 with after < before, contradicting the mandated waterfall module comment (balance-covered/promo renewals as contraction sources). The chosen reading satisfies every prescribed behavior across all three tasks and keeps D-03 literal. Documented in the mrr.ts module comment.
- **The shared engine stays the only cursor implementation:** the per-instant base is resolved by rebuilding chain suffixes via `buildKeyTerms` (its `.base` IS the i-th chain op for a suffix starting at i), never by duplicating cursor math in mrr.ts.
- **waterfallForMonth's prevLabel is `string | null`:** null = all-zero baseline for a period start (the task action's "first month has prev = all-zero baseline"); internal month-arithmetic unchanged (D-15 MSK months, endOfMonth = mskDayStartInstant(addMonths(label, 1)) − 1ms).
- **Float-exact test fixtures:** all monthly equivalents are integers (30/90/180-day terms, 15/60-day upgrade remainders → dyadic factors), so the reconciliation identity asserts with exact `toBe` — matching the must-have "holds EXACTLY", not just toBeCloseTo(6).
- **`activeKeysAt` counts keys with MRR > 0** (as the plan action prescribes). A key alive on a 0 ₽ balance-covered segment is not a paying subscription and is excluded; series.ts's daily `activeKeys` remains the term-based day-bucket counter — the two counters measure different definitions by design.
- **ANL-01/02/03 not marked yet** — the shared-ID gate requires 07-05's SUMMARY first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] One self-authored RED test expectation mis-modeled the upgrade spread after renewals**
- **Found during:** Task 1 (first GREEN run)
- **Issue:** The "two renewals + one upgrade" fixture expected MRR 4500, but renewals extend the chain's termEnd (Sep 8) so the upgrade, per the RESEARCH/plan formula `cash / max(1, (termEnd − paidAt)/30)`, correctly spreads over 75 remaining days → 1500/2.5 = 600, total 3600. A subset-comparison line in the same test also compared structurally different terms and was ill-formed.
- **Fix:** Test corrected to 3600 with the day-math spelled out; the subset-comparison replaced with the honest one-key-one-row probes (`activeKeysAt == 1`, exact total).
- **Files modified:** `tests/unit/analytics-mrr.test.ts`
- **Verification:** `npx vitest run tests/unit/analytics-mrr.test.ts` → 8 passed
- **Committed in:** `1d339da` (GREEN commit — fixed before implementation was committed)

**2. [Rule 3 - Blocking] Raw SQL table name — `Order` does not exist, the physical table is `orders`**
- **Found during:** Task 3 (GREEN DB test)
- **Issue:** The SQL mirror of the ARPPU denominator queried `FROM "Order"` per the Prisma model name; every model is `@@map`ed to snake_case (`orders`, `users` — `PrismaClientKnownRequestError 42P01`).
- **Fix:** `FROM "Order"` → `FROM orders` in both raw queries of the DB test.
- **Files modified:** `tests/unit/analytics-metrics.test.ts`
- **Verification:** `npx vitest run tests/unit/analytics-metrics.test.ts` → 4 passed
- **Committed in:** `fe646dc` (fixed before the GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 self-authored test bug, 1 blocking table name) + 1 documented plan-interpretation deviation (Task 2 Task 1's "base = term.base" superseded by the per-instant segment base required for Task 2's contract — see Decisions Made).
**Impact on plan:** All fixes were inside the plan's own five files; no schema, helper, or signature changes beyond the plan's own conflict resolution. No scope creep.

## Issues Encountered

- **Plan-internal inconsistency resolved autonomously** (Task 1 action `base = term.base` vs Task 2's mandated contraction behaviors/module comment): detailed under Decisions Made. The RESEARCH §MRR formula (`base = chain op whose term contains t`) was always the precise wording; the plan's compressed line was the anomaly.
- The shared-ID gate (`requirements.ready-ids` semantics backed by the workflow contract) blocks ANL-01/02/03 marking because 07-05-PLAN.md declares the same IDs and has no SUMMARY yet — no defect, just sequencing.
- `.planning/STATE.md` carried a pre-existing uncommitted orchestrator modification; left untouched per the execution mode.

## User Setup Required

None — no external service configuration required. (The deploy-time manual reconciliation row noted as D4 in coverage is part of the phase runbook established in 07-02's USER-SETUP/DEPLOY docs; the derivation core changes no deploy steps.)

## Next Phase Readiness

- 07-05 (UI/server plans) can consume: `totalMrrAt`/`arrAt`/`activeKeysAt` for the KPI row, `waterfallForMonths` for the waterfall block, `computeArpu`/`computeArppu`/`computeCoverage` with their exact null contracts (render «—», never «0 ₽»; Math.round in the UI), all against `PaidOrderRow[]` loads with the PAID-status filter in the DB layer (lib/revenue.ts pattern).
- `waterfallForMonths` labels are first-of-month MSK labels; pass the window's months in order (e.g. from `mskMonthLabel(addMonths)`), the first month counts carried-in keys as new against its all-zero baseline.
- Phase 8 margin blocks can sit on the same per-key chain: `equivalentOf`/segment resolution live in mrr.ts and reuse `buildKeyTerms`.

---
*Phase: 07-analytics-foundation-revenue-metrics*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All 5 plan artifacts + this SUMMARY exist on disk.
- All 6 task commits present: RED `1e75b6b` / GREEN `1d339da`, RED `344da15` / GREEN `68e30be`, RED `e9d2d44` / GREEN `fe646dc` — TDD gate sequence (test before feat) honored for every task; no REFACTOR needed.
- Task verifies re-run: mrr → 8 passed; waterfall → 6 passed; metrics → 4 passed.
- Plan-level verification re-run: all three files → 18 passed; full `npm test` → **525 passed (62 files)**; `npx tsc --noEmit` → exit 0.
- Restrictions honored: no new DB tables/columns (no migration), no new npm dependencies, no prettier run, no deploy commands, STATE.md/ROADMAP.md untouched (orchestrator-owned), ANL-01/02/03 left pending per the shared-ID gate (07-05 also declares them).
