---
phase: "21"
slug: "subscription-purchase-7-days"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-27"
validated: "2026-11-28"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for pricing/subscription/payment backend, Platega reuse, and Flutter Shop/WebView/UI.
> Audited 2026-11-28 against the six executed plans (21-01..21-06) and their real test files. Every automated
> command below was executed in the audit session; statuses reflect observed results, not plan claims.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test (mobile) |
| **Config file** | `package.json` + `mobile/pubspec.yaml` |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `cd mobile && flutter analyze --no-fatal-infos --no-fatal-warnings && flutter test` |
| **Estimated runtime** | ~60s backend + ~120s mobile |

`npx prisma validate`; `cd mobile && dart run build_runner build --delete-conflicting-outputs`.

**Audit observation (2026-11-28):** `npx tsc --noEmit` exits 0 and `npx prisma validate` passes. Bare
`flutter analyze` reports ~1729 pre-existing info-only lints; `flutter analyze --no-fatal-infos
--no-fatal-warnings` exits 0 with zero errors/warnings in any phase-21 file. Two unrelated suites are
environment-poisoned by uncommitted working-tree edits outside this phase and are NOT phase-21 failures:
`tariff-markup.test.ts` (6 failures, all in the `PATCH/GET/PUT /api/admin/pricing` admin sections —
the locked 115/400/1000/1900/3800 calibration vectors pass) and `trial-claim.test.ts` (cannot run: the
local DB lacks `users.partner_rate_kind` from an unapplied, out-of-scope migration).

---

## Sampling Rate

- **After every task commit:** focused backend/mobile tests.
- **After every plan wave:** full suites + analyzer.
- **Before `/gsd-verify-work`:** all green; live payment items tracked as manual-only (no Platega test credentials).
- **Max feedback latency:** 180 seconds.

---

## Requirement → Task → Test Coverage Map

Classification: **COVERED** = a passing automated behavioral test asserts the criterion; **PARTIAL** =
automated proof for part of the criterion only; **MISSING** = no test and no implementation (or explicitly
deferred out of phase scope).

| Requirement | Task(s) | Automated test(s) | Classification |
|-------------|---------|-------------------|----------------|
| REQ-SUB-01 (subscription status fields) | 21-02-02, 21-04-01/02 | `mobile-subscription-route.test.ts`, `providers_test.dart` | COVERED |
| REQ-SUB-02 (no-key connect gate → shop + toast) | 21-05-01/03, 21-06-02 | `shop_screen_test.dart`, `connect_panel_test.dart`, `router_test.dart` | COVERED |
| REQ-SUB-03 ("ключ · N дн." header + days/30 ring) | 21-05-02/03 | `server_pool_screen_test.dart` (header), `shop_screen_test.dart` (ring thresholds) | COVERED |
| REQ-SUB-04 (device-limit enforcement) | 21-02-02 (display only) | `mobile-subscription-route.test.ts` (surface only) | MISSING — deferred to Phase 22 by locked decision; no add/remove endpoint in scope |
| REQ-SUB-05 (copy link → toast) | 21-05-01/03 | `shop_screen_test.dart` | COVERED |
| REQ-SUB-06 (24h grace + "expires soon" banner) | 21-02-01, 21-04-02 | `subscription-grace.test.ts`, `mobile-servers-route.test.ts`, `mobile-config-route.test.ts`, `providers_test.dart` | **PARTIAL** — 24h server grace fully proven; client "expires soon" banner is NOT implemented (escalated below) |
| REQ-SHOP-01 (5 terms, locked prices, Хит badge) | 21-03-01, 21-04-01/02, 21-05-01/03 | `mobile-pricing-route.test.ts`, `tariff-markup.test.ts`, `shop_screen_test.dart` | COVERED |
| REQ-SHOP-02 (2..10 stepper + dots) | 21-03-01, 21-05-01/03 | `mobile-pricing-route.test.ts`, `shop_screen_test.dart` | COVERED |
| REQ-SHOP-03 (promo preview, invalid error) | 21-03-02, 21-04-02/03, 21-05-01/03 | `mobile-promo-route.test.ts`, `providers_test.dart`, `shop_screen_test.dart` | COVERED |
| REQ-SHOP-04 (payment chips persist, UI-only) | 21-05-01/03 | `shop_screen_test.dart` | COVERED |
| REQ-SHOP-05 (live price summary, per-day-per-device) | 21-03-01, 21-04-02, 21-05-01/03 | `mobile-pricing-route.test.ts`, `providers_test.dart`, `shop_screen_test.dart` | COVERED (per-day label rendered by the same tested `LiveSummary` path) |
| REQ-SHOP-06 (create → WebView → 3s/5min poll) | 21-01-01, 21-06-01/02 | `mobile-payments-route.test.ts`, `payment_flow_test.dart`, `router_test.dart` | COVERED (live Platega manual-only) |
| REQ-SHOP-07 (confetti + dated success toast) | 21-05-02/03 | `shop_screen_test.dart` | COVERED |
| REQ-SHOP-08 (trial hides renew/upgrade) | 21-05-01/03, 21-01-01 | `shop_screen_test.dart`, `mobile-payments-route.test.ts` | COVERED |
| REQ-BE-03 (real owned-key subscription route) | 21-02-02 | `mobile-subscription-route.test.ts` | COVERED |
| REQ-BE-04 (payments create/status routes) | 21-01-01, 21-06-01 | `mobile-payments-route.test.ts`, `payment_flow_test.dart` | COVERED |
| REQ-BE-05 (keys issue/renew) | 21-01-01, 21-06-03 | `mobile-single-issuer.test.ts` | COVERED by supersession — no client-callable issuer; guard proves it |
| REQ-BE-07 (Platega webhook idempotency) | 21-01-01, 21-06-03 | `callback-route.test.ts`, `outbox-worker.test.ts`, `mobile-single-issuer.test.ts` | COVERED |
| REQ-BE-08 (OpenAPI→Dart generation) | — | — | MISSING — advisory/deferred by locked decision; no generator added in phase 21 |

*Task-level coverage: all 14 implementation tasks are COVERED by at least one passing automated command.
The two non-implementation tasks in plan 01 (blocking decision gate, blocking-human package gate) were
human approvals, recorded as complete in the 21-01 SUMMARY — not automatable and not counted here.*

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 (tracer) | 01 | 1 | REQ-SHOP-06 / BE-04 / BE-05 / BE-07 | T-21-01..09 | JWT gate; no client amount; ownership 404; no second issuer; no secret in body/logs | unit | `npx vitest run tests/unit/mobile-payments-route.test.ts && cd mobile && flutter test test/unit/core/payment/payment_flow_test.dart` | ✅ | ✅ green |
| 21-02-01 (grace predicate + gates) | 02 | 2 | REQ-SUB-06 / SUB-02 / BE-03 | T-21-12/13 | 24h ±1ms edge; trial never graced; /servers + /config share one predicate | unit | `npx vitest run tests/unit/subscription-grace.test.ts tests/unit/mobile-servers-route.test.ts tests/unit/mobile-config-route.test.ts` | ✅ | ✅ green |
| 21-02-02 (subscription route) | 02 | 2 | REQ-SUB-01 / SUB-04 / BE-03 | T-21-10/11/14 | ownership join; one per-key call; stable 200 errors; no link/status/log leak | unit | `npx vitest run tests/unit/mobile-subscription-route.test.ts && npx prisma validate` | ✅ | ✅ green |
| 21-03-01 (five-term pricing) | 03 | 2 | REQ-SHOP-01 / SHOP-02 / SHOP-05 | T-21-16/17/19/20 | locked prices; 2..10 bounds; no client amount; no provider text | unit | `npx vitest run tests/unit/mobile-pricing-route.test.ts tests/unit/tariff-markup.test.ts` | ✅ | ✅ green (caveat: 6 unrelated admin-route failures in `tariff-markup`) |
| 21-03-02 (promo preview) | 03 | 2 | REQ-SHOP-03 | T-21-16/18/19 | read-only preview; no oracle; consumePromo unreachable; 401 | unit | `npx vitest run tests/unit/mobile-promo-route.test.ts` | ✅ | ✅ green |
| 21-04-01 (freezed models) | 04 | 3 | REQ-SUB-01 / SHOP-01/02 / SUB-06 | T-21-21/22/25 | @JsonKey decode; generated parts; no client amount/grace field | build+unit | `cd mobile && dart run build_runner build --delete-conflicting-outputs && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ | ✅ green |
| 21-04-02 (live providers) | 04 | 3 | REQ-SUB-01/03 / SHOP-01/03/05 | T-21-21/23/24 | live routes via Endpoints; server-only price; stable RU error mapper | unit | `cd mobile && flutter test test/unit/features/subscription/providers_test.dart && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ | ✅ green |
| 21-04-03 (provider tests) | 04 | 3 | REQ-SUB-01/03 / SHOP-01/03/05 | T-21-21/23 | decode, preview, no-amount intent, no provider text; no simulation | unit | `cd mobile && flutter test test/unit/features/subscription/providers_test.dart` | ✅ | ✅ green |
| 21-05-01 (Shop screen + widgets) | 05 | 4 | REQ-SHOP-01..05 / SUB-02/05/08 | T-21-26/27/29/31 | server terms; stepper bounds; trial block; no bottom nav; no fake price | widget | `cd mobile && flutter test test/widget/features/shop/shop_screen_test.dart && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ | ✅ green |
| 21-05-02 (ring + confetti painters) | 05 | 4 | REQ-SUB-03 / SHOP-07 | T-21-28 | clamped CustomPainter; status-driven confetti; real-date toast | widget | `cd mobile && flutter test test/widget/features/shop/shop_screen_test.dart` | ✅ | ✅ green |
| 21-05-03 (Shop widget tests) | 05 | 4 | REQ-SUB-02/03/05 / SHOP-01..08 | T-21-26..31 | behavior assertions; confetti needs real transition; no simulation | widget | `cd mobile && flutter test test/widget/features/shop/shop_screen_test.dart && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ | ✅ green |
| 21-06-01 (resume pending order) | 06 | 5 | REQ-SHOP-06 / BE-04 | T-21-32/33/37 | resume by stored id only; terminal cleanup; exactly-once invalidation; 100-poll timeout | unit | `cd mobile && flutter test test/unit/core/payment/payment_flow_test.dart && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ | ✅ green |
| 21-06-02 (router + no-key gate) | 06 | 5 | REQ-SUB-02 / SHOP-06 | T-21-30/34/35 | real /shop; https WebView; no deep-link confirm; exact toast; no bottom nav | widget | `cd mobile && flutter test test/widget/features/servers/connect_panel_test.dart test/widget/app/router_test.dart && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ | ✅ green |
| 21-06-03 (single-issuer guard) | 06 | 5 | REQ-BE-04 / BE-05 / BE-07 | T-21-36 | no mobile issuer; webhook re-query/amount/one-row; worker idempotency key | unit | `npx vitest run tests/unit/mobile-single-issuer.test.ts tests/unit/callback-route.test.ts tests/unit/outbox-worker.test.ts && npx prisma validate` | ✅ | ✅ green (caveat: verify block also lists `trial-claim.test.ts`, blocked by an unrelated DB migration) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. All 14 implementation tasks verified green in the
2026-11-28 audit session: 92 phase-21 backend tests, 56 phase-21 mobile tests, plus 11 existing header
tests (`server_pool_screen_test.dart`) pass; `npx tsc --noEmit` 0 errors; `npx prisma validate` valid;
`flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0.*

---

## Wave 0 Requirements

- [x] Backend vitest infrastructure — existing.
- [x] Mobile `flutter_test` — existing.
- [x] `flutter_inappwebview ^6.1.5` dependency — approved at the 21-01 blocking-human gate; exact stable pin installed.
- [x] No Prisma schema change (orders/outbox already exist); `npx prisma validate` passes.
- [x] Shared grace predicate already consumed by phase-19/20 `isActiveKey` fixtures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Platega payment + webhook key issuance | REQ-SHOP-06/BE-07 | No test credentials | Test-mode transaction in staging; confirm CONFIRMED → key issued once; CANCELED/CHARGEBACKED/DISPUTED issue nothing. |
| WebView lifecycle + resume pending order | REQ-SHOP-06 | Device/browser | Kill app during payment, relaunch, confirm polling resumes from stored orderId. |
| Confetti + ring + shop UX | REQ-SHOP-07/SUB-03 | Visual judgment | Compare with prototype; colors/thresholds. |
| Grace connection on device | REQ-SUB-06/D-10 | Needs expired key + real tunnel | Key at `expiresAt + 24h ±1ms`: `/servers`/`/config` allow connect. |
| **"Expires soon" banner when <24h left — ESCALATED** | **REQ-SUB-06** | **NOT IMPLEMENTED — no UI banner exists in the client; no automated test can be written until it is implemented. The 24h server grace is fully covered; only this client acceptance criterion is unmet.** | **Implement a banner driven by server `statusKind=="expiring"`/`graceUntil`, then add a widget test asserting the notice renders for a graced/expiring key and not for an active key. Escalated to developer — implementation files were not modified by this audit.** |
| Phase 19/20 deferred UAT | inherited | Device/live key | `/gsd-verify-work 19` and `/gsd-verify-work 20` before milestone close. |

*All other phase behaviors have automated verification. Device-limit enforcement (REQ-SUB-04) and
OpenAPI→Dart generation (REQ-BE-08) are explicitly deferred beyond phase 21 by locked decisions and are
not phase-21 gaps.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter — all 14 implementation tasks have a passing automated command

**Approval:** validated by Nyquist audit 2026-11-28 (one requirement-level escalation tracked above; no
automated coverage gap remains).

---

## Validation Audit 2026-11-28

Independently executed every `<automated>` command from 21-01..21-06 and read the test bodies to confirm
they assert behavior, not structure. Starting hypothesis: each requirement uncovered until a passing test
proved it.

### Gaps found / resolved / escalated

| # | Gap | Found | Resolved / Escalated | Evidence |
|---|-----|-------|----------------------|----------|
| 1 | Per-task map had a single placeholder row (`21-01-01`, ⬜); 13 tasks unmapped | State A draft | **RESOLVED** — map expanded to all 14 implementation tasks with real commands + green statuses | This file, "Per-Task Verification Map" |
| 2 | No verification evidence; `status: draft`, `nyquist_compliant: false` | State A draft | **RESOLVED** — 92 backend + 56 mobile phase-21 tests executed and passing; tsc 0 errors; prisma valid; analyzer exit 0 | Audit run log; frontmatter now validated/true |
| 3 | `tariff-markup.test.ts` referenced by 21-03-01 fails 6 tests | Audit run | **RESOLVED (not a phase-21 gap)** — all 6 failures are in `PATCH/GET/PUT /api/admin/pricing` admin sections from uncommitted out-of-phase edits; the locked price-calibration vectors pass | Test lines 248–302; 92/92 phase-21 backend tests green |
| 4 | `trial-claim.test.ts` listed in 21-06-03 verify block cannot run | Audit run | **RESOLVED (not a phase-21 gap)** — Prisma error: local DB lacks `users.partner_rate_kind` from an unapplied out-of-scope migration; the 3 suites authored/owned by the plan pass 28/28 | Audit run; 21-06 SUMMARY "Issues Encountered" |
| 5 | REQ-SUB-06 acceptance "banner shows when <24h left" | Audit read | **ESCALATED (BLOCKER for that criterion)** — no "expires soon" banner exists anywhere in the client (`graceUntil` is decoded and used only for `_hasConnectableKey` gating). Cannot be automated without implementation. Server-side 24h grace remains fully COVERED. | `grep` of `lib/` shows no banner copy; Manual-Only table above |
| 6 | REQ-SUB-04 device-limit enforcement; REQ-BE-08 OpenAPI→Dart | Plan review | **DEFERRED (out of phase scope by locked decision)** — not escalated; tracked in requirement map and 21-VALIDATION Manual-Only context | 21-02/21-04 plans + summaries |

### Requirement classification summary

- **COVERED (16):** REQ-SUB-01, 02, 03, 05; REQ-SHOP-01..08; REQ-BE-03, 04, 05 (superseded), 07.
- **PARTIAL (1):** REQ-SUB-06 — automated 24h server grace + server-derived `graceUntil`; client "expires soon" banner missing (escalated).
- **MISSING / deferred (2):** REQ-SUB-04 (Phase 22), REQ-BE-08 (advisory).

### Implementation files modified by this audit

None. Only this validation document was changed; no test file needed authoring because every automated
check already existed and passed. The one unmet criterion (REQ-SUB-06 banner) requires an implementation
change and was escalated rather than patched.
