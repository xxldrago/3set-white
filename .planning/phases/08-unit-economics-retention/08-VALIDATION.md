---
phase: "8"
slug: "unit-economics-retention"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.0.3` (`environment: 'node'`, `fileParallelism: false`) |
| **Config file** | `vitest.config.ts` (alias `@` → repo root; dummy env incl. `CRON_SECRET`, `ADMIN_TELEGRAM_IDS: '910000101'`) |
| **Quick run command** | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-retention.test.ts tests/unit/analytics-economics.test.ts` |
| **Full suite command** | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npm test` |
| **Estimated runtime** | Wave-0 ~2 s; full suite ~60–90 s |

**Baseline (measured 2026-10-22 during research):** `analytics-*.test.ts` + `admin-analytics-page.test.ts` + `i18n.test.ts` = **11 files, 68 passed, 1 pre-existing failure** — `tests/unit/analytics-mrr.test.ts:190`, "expected 4000 to be 3600" (the test encodes the pre-CR-01 expectation; the code returns the correct 4000). **Phase gate = "no new failures", not "zero failures". Do NOT "fix" that baseline test in this phase.**

**Note:** `DATABASE_URL` is not present in `.env.local` locally — pass it inline for every command (repo convention). Local Postgres is 16.15; production is `postgres:17-alpine`.

---

## Sampling Rate

- **After every task commit:** Run the single new test file for that task (`analytics-retention.test.ts` / `analytics-economics.test.ts`, both < 2 s; DB-backed loader suite ~1–2 s).
- **After every plan wave:** Run the full suite (`DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npm test`) — must show exactly the one known baseline failure.
- **Before `/gsd-verify-work`:** Full suite green except the pinned baseline.
- **Max feedback latency:** ~90 seconds.

---

## Per-Task Verification Map

> Task IDs are assigned by the planner; this map is keyed by requirement so every planned task can be bound to a test at plan time. Every row below MUST resolve to a real `<automated>` command in the plan.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-xx-xx | 08-01 | 0 | ANL-04 | — | Historical LTV = Σ cash / DISTINCT paid signup payers; predictive = ARPPU(30)/logo churn(30) with churn 0 → null «—»; lock D-01/D-02 | unit (pure) | `… npx vitest run tests/unit/analytics-economics.test.ts -t "ltv"` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-01 | 0 | ANL-05 | Info Disclosure | Net LTV restricted to fully-costed orders, costed-payers denominator, trade window label, no costed → null «—»; lock D-03 | unit (pure) | `… npx vitest run tests/unit/analytics-economics.test.ts -t "net"` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-01 | 0 | ANL-06 | — | Term-end events (+7-day inclusive grace), bonus renewal within grace = retained, upgrade ≠ renewal, pending grace not churned, trial excluded, churn ≤ 100%; locks D-05..D-10 | unit (pure) | `… npx vitest run tests/unit/analytics-retention.test.ts` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-01 | 0 | ANL-07 | — | MSK month slots match waterfall; `expiring=0` → null rate while zeros render; chronological order | unit (pure) | `… npx vitest run tests/unit/analytics-retention.test.ts -t "months"` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-01 | 0 | ANL-13 | Info Disclosure | Margin = Σ(cash−cost) over costed; margin % on costed Σcash; cost/key = Σcost/costed orders; wallet-only row → negative margin; 0 costed → null «—»; locks D-11..D-13 | unit (pure) | `… npx vitest run tests/unit/analytics-economics.test.ts -t "margin"` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-01 | 0 | ANL-14 | — | Burn null unless 100% coverage + ≥7 distinct MSK days; real zero burn = 0; runway `floor(balance/exactBurn)`; balance error isolated | unit (pure + stubbed client) | `… npx vitest run tests/unit/analytics-economics.test.ts -t "burn"` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-01 | 0 | ANL-04..07/13/14 | El. of Privilege | Loaders return §6.7 shapes, `null` not `0`, `::int` numbers, trial filter, balance isolation in `loadBurnRunway` only | integration (DB + `vi.spyOn(artemida,'getBalance')`) | `… npx vitest run tests/unit/analytics-phase8-loaders.test.ts` | ❌ W0 | ⬜ pending |
| 08-xx-xx | 08-02 | 1/2 | ANL-04..14 + UI gate | El. of Privilege / Info Disclosure | Page: two `<AnalyticsSection>`s below sparkline, guard intact, five Suspense boundaries, no `'use client'` in the new components, balance called only in `BurnRunwayCards`, no `providerCost`/`userId`/API key leaked | source-contract | `… npx vitest run tests/unit/admin-analytics-page.test.ts tests/unit/i18n.test.ts` | ✅ (page) ❌ (new sibling) | ⬜ pending |
| 08-xx-xx | 08-02 | 1 | i18n (44 new keys) | — | 44 new keys referenced literally, none unused, no missing in any locale | existing i18n suite | `… npx vitest run tests/unit/i18n.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/analytics-retention.test.ts` — term events, grace boundary (±1 ms), upgrade, pending grace, exit/win-back, trial filter, multi-term 90-day window, cohort clamp, month slots, `expiring=0` marker
- [ ] `tests/unit/analytics-economics.test.ts` — LTV gross/net/predictive (churn 0 → null), margin + wallet-only negative case, cost/key, burn coverage rules, runway `floor`, zero denominators → null «—»
- [ ] `tests/unit/analytics-phase8-loaders.test.ts` — DB fixture in a fresh telegram-id range (mirror `tests/unit/analytics-rollup.test.ts` conventions + `cleanup()` in `beforeEach`/`afterAll`), stubbed `artemida.getBalance`, asserts `null` vs `0` and shape parity with UI-SPEC §6.7
- [ ] Source-contract sibling (new file is safer than editing the existing page test): two `<AnalyticsSection>`s below the sparkline, five Suspense boundaries, no `'use client'` in the five components, balance called only in `BurnRunwayCards`, no-leak scan extended to params
- [ ] No framework install needed

*Prior Phase-7 Wave-0 files are reused as fixtures/reference, not re-written.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual layout of the two new sections at 360/768/1280 px | ANL-04..14 (UI gate) | Table overflow + responsive breakpoints need a real browser | Open `/admin/analytics` as administrator/manager; confirm «Юнит-экономика» / «Удержание» sections sit below the sparkline, first screen unchanged, `ChurnTable` scrolls horizontally at 360 px with accessible region, «—» nulls render, windows always labelled |
| Real balance + burn render, runway correct | ANL-14 | Requires live ARTEMIDA balance + real orders | After deploy with 100% cost coverage: open the page, confirm balance card shows live value, burn card shows the 30-day average with coverage badge, runway `floor(balance/burn)` sane |
| Real provider outage during load | ANL-14 | Network fault injection | Stop/abuse the provider or unset the key temporarily: balance card shows load-error state while every other block renders normally (isolation) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}