---
phase: "10"
slug: "cohorts-retention-analytics"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-29"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-cohorts.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-cohorts.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | COH-01..05 | — | N/A | unit | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-cohorts.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | COH-01..05 | T-10-01 | RSC payload leak scan | integration | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/analytics-phase10-loaders.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 3 | COH-01..05 | T-10-02 | Input whitelist on tabs/period | unit (contract) | `DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test' npx vitest run tests/unit/admin-analytics-phase10-contract.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/analytics-cohorts.test.ts` — pure derivation (channel, device bucket, registration/payer cohorts, gaps, MSK boundaries).
- [ ] `tests/unit/analytics-phase10-loaders.test.ts` — DB-backed identity tests for `loadRegistrationCohorts`/`loadPayerCohorts`.
- [ ] `tests/unit/admin-analytics-phase10-contract.test.ts` — page composition, Suspense count 15, no-leak scan, i18n key count (14).

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual layout of 12×12 matrix on mobile (horizontal scroll, tab wrap) | COH-01..05 | Layout | Open `/admin/analytics` on a 375px viewport; confirm region scrolls, tabs wrap, no clipping. |
| Cell tint gradient readability | COH-01, COH-02 | Visual | Inspect a 100% cell and a 0% cell; confirm numbers remain readable at 32% tint. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
