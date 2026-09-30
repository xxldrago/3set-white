---
phase: "2"
slug: "keys-trial"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-01"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.3 |
| **Config file** | `vitest.config.ts` (include `tests/**/*.test.ts`, environment node) |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | all | — | ArtemidaError maps 401/402/409/429/502/503 + Retry-After; no retry on 4xx | unit | `npx vitest run tests/unit/artemida-client.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | TRIAL-01 | T-trial-race | Concurrent claim yields one key; rollback guarded | unit | `npx vitest run tests/unit/trial-claim.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | TRIAL-01 | — | Trial failure rolls back `trialUsed` | unit | `npx vitest run tests/unit/trial-rollback.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 1 | TRIAL-02 | — | `/api/pricing` validates days/devices; 401 without session | unit | `npx vitest run tests/unit/pricing-route.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 1 | CAB-01 | — | Cache-first read + background revalidate | unit | `npx vitest run tests/unit/keys-service.test.ts` | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 1 | CAB-03 | T-device-authz | Device delete/clear require session; token validated | unit | `npx vitest run tests/unit/devices-route.test.ts` | ❌ W0 | ⬜ pending |
| 2-06-01 | 06 | 1 | CAB-04 | — | QR rendered server-side from subscriptionUrl; `toSvg` NOT called | unit | `npx vitest run tests/unit/qr.test.ts` | ❌ W0 | ⬜ pending |
| 2-07-01 | 07 | 1 | all | — | i18n interpolation + RU plurals; completeness regex widened | unit | `npx vitest run tests/unit/i18n.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/artemida-client.test.ts` — envelope parsing (object AND string `error`), status→code mapping, retry policy, `Retry-After` (inject fake `fetch`)
- [ ] `tests/unit/trial-claim.test.ts` — concurrent `claimTrial` one winner; rollback guarded by `trialKeyId: null`
- [ ] `tests/unit/pricing-route.test.ts` — query validation (1–10 devices, 7/30/90) + 401 without session
- [ ] `tests/unit/keys-service.test.ts` — cache→render mapping, status from `expiresAt`, trial badge flag
- [ ] `tests/unit/qr.test.ts` — `renderSubscriptionQr` returns `<svg`, encodes URL, asserts `toSvg` not called
- [ ] `tests/unit/devices-route.test.ts` — session required, token path param validated
- [ ] `tests/unit/i18n.test.ts` — widen regex for `t(key, params)` + plural-category assertions
- [ ] `tests/helpers/fake-fetch.ts` — fixture helper returning verified envelopes (no network)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ARTEMIDA pricing/trial/keys field names | all | Needs real `ARTEMIDA_API_KEY`; success shapes `[ASSUMED]` | `checkpoint:human-verify` live probe — confirm response shapes before wiring dependent UI |
| Bot trial + tariff flow end-to-end | TRIAL-01/02 | Needs test bot token + live API | BotFather test bot, send /start, tap trial, verify key issued |
| PWA install + device-management confirm UX | CAB-03 | Visual/device judgment | Real device, verify inline confirm panel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
