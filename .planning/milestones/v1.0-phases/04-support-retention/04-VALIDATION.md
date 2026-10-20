---
phase: "4"
slug: "support-retention"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-03"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.3 |
| **Config file** | `vitest.config.ts` (dummy env; `fileParallelism: false` for shared Postgres) |
| **Quick run command** | `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/unit` |
| **Full suite command** | `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run` |
| **Estimated runtime** | ~70 seconds |

---

## Sampling Rate

- **After every task commit:** Run `DATABASE_URL=… npx vitest run tests/unit`
- **After every plan wave:** Run `DATABASE_URL=… npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` (inline throwaway env)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | SUP-01 | T-ticket-idor | bot+cabinet create/read via one `tickets-service`; non-owner → null | integration | `npx vitest run tests/unit/tickets-service.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | SUP-01 | T-04-02/03 | open→answered→closed; reply reopens in-thread; unread +1 / clears on read | integration | `npx vitest run tests/unit/tickets-service.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | SUP-03 | T-04-28 | `clearSupportPrompt` single-winner claim (first true, second false) prevents double-create | integration | `npx vitest run tests/unit/tickets-service.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | SUP-02 | T-attach-type | `normalizeImage` accepts jpeg/png/webp by magic bytes, rejects others; downscale; path under UPLOAD_DIR | unit | `npx vitest run tests/unit/ticket-attachments.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | SUP-02 | T-attach-type | `saveAttachment`/`readAttachment` confined to UPLOAD_DIR; escape rejected | unit | `npx vitest run tests/unit/ticket-attachments.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | SUP-03 | T-notify-dup | reply copy prefixed + capped; dispatch to `chatId ?? telegramId`; failure reschedules | integration | `npx vitest run tests/unit/ticket-notify.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | SUP-03 | T-notify-dup | `enqueueNotification` idempotent by dedupeKey; `claimNextNotification` single-winner | integration | `npx vitest run tests/unit/notifications-queue.test.ts` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 3 | SUP-01/SUP-02 | T-attach-gate | multipart route 401/400/413/201; gated serve 404 non-owner, 200 owner/admin, nosniff | unit | `npx vitest run tests/unit/tickets-route.test.ts` | ❌ W0 | ⬜ pending |
| 4-04-02 | 04 | 3 | SUP-01/SUP-03 | T-admin | user reply/reopen + mark-read; admin reply enqueues exactly one notification, no inline send | unit | `npx vitest run tests/unit/tickets-route.test.ts` | ❌ W0 | ⬜ pending |
| 4-05-01 | 05 | 4 | SUP-01 | T-04-20 | `/support` list session-scoped; empty/list/count states | render | `npx tsc --noEmit && npx vitest run tests/unit/i18n.test.ts` | ✅ | ⬜ pending |
| 4-05-02 | 05 | 4 | SUP-02 | T-04-21 | create form multipart + client 5 MiB/type validation; redirect on success | render | `npx tsc --noEmit && npx vitest run tests/unit/i18n.test.ts` | ✅ | ⬜ pending |
| 4-05-03 | 05 | 4 | SUP-03 | — | home support entry: badge hidden at 0, capped otherwise | render | `npx tsc --noEmit && npx vitest run tests/unit/i18n.test.ts` | ✅ | ⬜ pending |
| 4-06-01 | 06 | 5 | SUP-01/SUP-03 | — | thread RSC + bubbles; one-shot mark-read clears unread | render | `npx tsc --noEmit && npx vitest run tests/unit/i18n.test.ts` | ✅ | ⬜ pending |
| 4-06-02 | 06 | 5 | SUP-02 | T-04-17 | `AttachmentImage` uses the gated route; composer reopens in place | render | `npx tsc --noEmit && npx vitest run tests/unit/i18n.test.ts` | ✅ | ⬜ pending |
| 4-07-01 | 07 | 3 | SUP-01/SUP-02 | T-04-28/29 | bot intake via shared service; photo → normalize → attachment; claim-before-create | integration | `npx vitest run tests/unit/tickets-service.test.ts tests/unit/ticket-attachments.test.ts tests/unit/i18n.test.ts` | ❌ W0/✅ | ⬜ pending |
| 4-07-02 | 07 | 3 | SUP-01 | T-04-28 | unarmed/stale → fall through; retried update cannot double-create | integration | `npx vitest run tests/unit/tickets-service.test.ts` | ❌ W0 | ⬜ pending |
| 4-08-01 | 08 | 6 | PAY-05 | T-reminder-dup | `listExpiringKeys` ≤3d+trials; per-day idempotent enqueue | integration | `npx vitest run tests/unit/reminder-cron.test.ts` | ❌ W0 | ⬜ pending |
| 4-08-02 | 08 | 6 | PAY-05 | — | daily tick + instrumentation + `/api/cron/remind` fallback | integration | `npx vitest run tests/unit/reminder-cron.test.ts tests/unit/cron-reconcile-route.test.ts` | ❌ W0/✅ | ⬜ pending |
| 4-08-03 | 08 | 6 | PAY-05 | — | reminder inline keyboard: trial=buy, non-trial=renew | unit | `npx vitest run tests/unit/ticket-notify.test.ts tests/unit/i18n.test.ts` | ❌ W0/✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/ticket-attachments.test.ts` — `normalizeImage` magic-byte accept/reject, downscale, path confinement
- [ ] `tests/unit/tickets-service.test.ts` — create (both channels), transitions, reopen, unread, ownership join
- [ ] `tests/unit/tickets-route.test.ts` — multipart validation (401/400/413), gated serve (404/200, nosniff)
- [ ] `tests/unit/notifications-queue.test.ts` — `enqueueNotification` idempotency by dedupeKey + single-winner `claimNextNotification`
- [ ] `tests/unit/ticket-notify.test.ts` — reply fan-out enqueue/dispatch/dedupe; reminder buttons
- [ ] `tests/unit/reminder-cron.test.ts` — expiring-key selection + per-day idempotency
- [ ] `tests/helpers/fake-sender.ts` (or extend) — injectable bot sender for worker tests
- [ ] `sharp` install gated by a `checkpoint:human-verify` (legitimacy SUS false-positive) — pin `^0.35.5`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bot photo attachment intake | SUP-02 | Telegraf handler + real Telegram file_id | Real bot: send photo to support → ticket with image |
| Reminder arriving in Telegram | PAY-05 | Real push | Key expiring ≤3d → receive reminder with «Продлить» |
| Attachment downscale visual quality | SUP-02 | Visual judgment | Upload large screenshot → thumbnail legible |
| Fastify/Next standalone boots worker + uploads dir | — | Runtime/Docker | `npm run build` + serve; verify UPLOAD_DIR writable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
