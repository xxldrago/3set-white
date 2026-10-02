---
phase: "3"
slug: "payments"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-02"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.3 |
| **Config file** | `vitest.config.ts` (node env, dummy env fallback; `DATABASE_URL` defers to `process.env`) |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite green + `npm run build`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | — | — | ARTEMIDA create contract locked from live probe | manual (checkpoint) | probe checklist | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 0 | PAY-01 | T-03-02 | createKey + caller-supplied idempotencyKey | unit | `npx vitest run tests/unit/artemida-client.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | PAY-01 | T-03-forge | Forged callback → 401, no key | unit | `npx vitest run tests/unit/callback-route.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | PAY-01 | T-03-dup | Duplicate CONFIRMED → one transition + one outbox row | unit | `npx vitest run tests/unit/callback-route.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | PAY-01 | T-03-create-retry | Platega client normalization (`url ?? redirect`), typed errors, no create retry | unit | `npx vitest run tests/unit/platega-client.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | PAY-01 | T-03-doubleprov | Deterministic Idempotency-Key on fulfillment retries; terminal → notify-failed | unit | `npx vitest run tests/unit/outbox-worker.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | PAY-01 | — | Order state machine transitions + PROVISION_ERROR retry | unit | `npx vitest run tests/unit/order-service.test.ts` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 3 | PAY-02/03 | T-03-trial-bypass | Trial renew/upgrade rejected backend + ownership join | unit | `npx vitest run tests/unit/order-route.test.ts` | ❌ W0 | ⬜ pending |
| 3-04-02 | 04 | 3 | PAY-03 | T-03-upgrade-amount | Upgrade quote mode returns provider amount; device bounds | unit | `npx vitest run tests/unit/pricing-upgrade-quote.test.ts` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 4 | PAY-04 | T-03-hist-idor | History reads only caller's orders | unit | `npx vitest run tests/unit/order-history.test.ts` | ❌ W0 | ⬜ pending |
| 3-05-02 | 05 | 4 | PAY-04 | T-03-provider-leak | Status route leaks no provider field; non-owned → 404 | unit | `npx vitest run tests/unit/order-status-route.test.ts` | ❌ W0 | ⬜ pending |
| 3-06-01 | 06 | 5 | PAY-01..04 | T-03-raw-leak | Payment surfaces render keyed copy only; trial hides mutations | unit | `npx vitest run tests/unit/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 3-07-01 | 07 | 6 | PAY-01/04 | T-03-sublink-leak | Bot payment entry + notify consumer; QR PNG render | unit | `npx vitest run tests/unit/bot-payments.test.ts tests/unit/qr.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/fake-platega.ts` (or extend `tests/helpers/fake-fetch.ts`) — inject create/status responses + headers
- [ ] `tests/unit/platega-client.test.ts` — normalization (`url ?? redirect`), error codes, no auto-retry on create
- [ ] `tests/unit/callback-route.test.ts` — forged-header 401, zod body, duplicate delivery, amount mismatch, re-query requirement, fast 200
- [ ] `tests/unit/order-service.test.ts` + `tests/unit/outbox-worker.test.ts` — transitions, deterministic Idempotency-Key, retry/backoff, `failed` after max attempts
- [ ] `tests/unit/order-route.test.ts` + `tests/unit/pricing-upgrade-quote.test.ts` + `tests/unit/order-history.test.ts` + `tests/unit/order-status-route.test.ts`
- [ ] DB-backed tests follow `keys-service.test.ts` style: real local Postgres, `vi.spyOn(artemida, …)`, mock `next/headers`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ARTEMIDA paid-key create contract | PAY-01 | Needs live API key; create shape unobserved | Owner-gated probe (mirrors 02-01): `POST /keys` shape locked before `createKey` is wired |
| Platega test-mode real payment | PAY-01 | Needs Platega test merchant creds | Test merchant → hosted page → CONFIRMED callback → key delivered |
| Bot payment message + QR | PAY-01/04 | Telegraf handlers not unit-tested | Real Telegram chat: pay → receive sub-link + PNG QR |
| Cabinet `/payments` render | PAY-04 | RSC + poller visual | `npm run build` + browser pass, 3s polling |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
