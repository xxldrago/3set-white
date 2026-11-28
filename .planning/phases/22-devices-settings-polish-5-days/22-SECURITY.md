---
phase: "22"
slug: "devices-settings-polish-5-days"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-28"
---

# Phase 22 — Security

> Per-phase security contract. Register authored at plan time in all five `22-NN-PLAN.md` `<threat_model>` blocks; ASVS L1, `block_on: high`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client → `/api/mobile/devices` | JWT (`verifyAccessToken`) + active owned key derived from claims; client never sends `keyId` | device token (opaque), ownership outcome |
| BFF → ARTEMIDA | Server-only Bearer + `Idempotency-Key`; only `listDevicesWithLabels`/`removeDeviceByUserId` | device labels/tokens, no provider secrets in logs |
| Webhook → outbox → worker | Sole key issuer, including paid `upgradeKey(addDevices)` | payment status, entitlement (no client-side issuance) |
| App → local notifications | Server `expiresAt` drives T-7/T-3/T-1; payload is navigation-only marker `shop` | expiry timestamp, no link/token/amount |
| App → local storage | Drift v2 settings + `flutter_secure_storage` (standard + biometric namespaces) | auto-connect flag, tokens, session; reset is local-only |
| App → OS network/VPN | `connectivity_plus` label read-only; native VPN/FSM/kill-switch untouched | real connectivity state; no fake toggle |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | Elevation of privilege | both device routes | high | mitigate | `verifyAccessToken` before reads; active owned key from `claims.userId`; token only from path (devices/route.ts:52-62, devices/[token]/route.ts:49-69) | closed |
| T-22-02 | Information disclosure | device rows and logs | high | mitigate | zod 1..300 token; `Uri.encodeComponent`; stable log fields only; no token in body (devices/[token]/route.ts:23,58-66,85-88) | closed |
| T-22-03 | Tampering | add-device / limit UI | high | mitigate | No free POST add route; add = link copy; upgrade intent-only, no keyId/amount; `createOrder` sole creator (devices_sheet.dart:92-108; payments/create/route.ts:137-148,192) | closed |
| T-22-04 | Tampering | deferred-delete undo | high | mitigate | `Timer` sole DELETE caller; undo cancels + generation guard; `_inFlight`; dispose; no reinsert (deferred_delete_controller.dart:16-85) | closed |
| T-22-05 | Elevation of privilege | key issuance | high | mitigate | `lib/worker.ts:227` only `upgradeKey` caller — webhook→outbox→worker; payments/create only looks up + creates order | closed |
| T-22-06 | Tampering | device state representation | medium | mitigate | Model has no lastSeen/keyId/link; fallback `label ?? name ?? «Устройство»`; no bottom nav (device.dart:6-11,44-50) | closed |
| T-22-07 | Information disclosure | non-owned key outcome | medium | mitigate | All non-owned/missing outcomes → same `no_active_key` 200 envelope (devices/route.ts:63-69,78-80,97-104; keys-service.ts:763-770) | closed |
| T-22-08 | Tampering | native VPN / kill switch | high | mitigate | No phase-22 commit touched VPN service/FSM/OnDemand; channel `3set-vpn` intact; kill-switch row read-only (kill_switch_row.dart:13-50) | closed |
| T-22-SC | Tampering | package installs | high | mitigate | `blocking-human` gate approved; exact pin `flutter_local_notifications: 23.0.4`, `timezone: ^0.11.2`; no beta/substitute (pubspec.yaml:21,35; STATE.md:155) | closed |
| T-22-09 | Elevation of privilege | auto-connect listener | high | mitigate | Biometric + auth + active-key gates; one-shot `fired` flag; single `connect(tab, auto:true)` (auto_connect_listener.dart:74-121) | closed |
| T-22-10 | Tampering | auto-connect vs reconnect | high | mitigate | Delegates to existing FSM; no connectivity subscription; existing reconnect listener retained in `main.dart:40` | closed |
| T-22-11 | Information disclosure | reset_demo | high | mitigate | Clears tokenStore + secureStorage + biometricStorage + 6 Drift tables; local-only (reset_demo.dart:35-39) | closed |
| T-22-12 | Tampering | reset_demo network effect | high | mitigate | No provider clear/revoke/ARTEMIDA call; widget test `verifyNever` on Dio (reset_row_test.dart) | closed |
| T-22-13 | Tampering | Drift v2 migration | medium | mitigate | `app_database.dart:18-49` registers Settings, schemaVersion 2, onUpgrade creates only settings and preserves rows | closed |
| T-22-14 | Information disclosure | subscription identity block | high | mitigate | Own-user select only; `ensureReferralCode(claims.userId)`; stored code verbatim, no invented email (subscription/route.ts:71-103) | closed |
| T-22-15 | Spoofing | kill switch row | high | mitigate | Frozen D-02 read-only copy; no `Switch`/`GestureDetector`/flag/native call (kill_switch_row.dart:13-50) | closed |
| T-22-16 | Information disclosure | referral and link copy | high | mitigate | `?ref=` added once to already-prefixed stored code; copy via existing `linkCopierProvider`; real server link (referral_row.dart:21-74) | closed |
| T-22-17 | Tampering | reset row | high | mitigate | Confirm-then-call local reset seam; one local call + one nav, `verifyNever` Dio (reset_row.dart:23-83) | closed |
| T-22-18 | Tampering | network chip | high | mitigate | Real `connectivity_plus` label only; no tap/toggle/toast; real changes invalidate ping cache in `main.dart:36` (pool_toolbar.dart:73-98) | closed |
| T-22-19 | Tampering | device-limit presentation | medium | mitigate | Integer compare from server `deviceLimit`; no local counter; paid intent only (devices_sheet.dart:29-33,128-166) | closed |
| T-22-20 | Information disclosure | widget fixtures / logs | medium | mitigate | No token/secret in body/logs; no link in failure notices; Semantics labels carry no link (accessibility_test.dart:108-127) | closed |
| T-22-21 | Tampering | expiry_scheduler | high | mitigate | T-7/T-3/T-1 from server `expiresAt`; past skip; cancel-before-reschedule; stable ids (expiry_scheduler.dart:16-64) | closed |
| T-22-22 | Information disclosure | notification payload | high | mitigate | Single marker `shop`, fixed copy, no link/token/amount; silent errors (local_notifications.dart:19-37,149-155) | closed |
| T-22-23 | Spoofing | notification tap handler | high | mitigate | `handleExpiryNotificationTap` → `go('/shop')` only for exact marker; no payment/entitlement side effect (local_notifications.dart:117-130) | closed |
| T-22-24 | Tampering | native notification setup | high | mitigate | Additive permissions/receivers outside VPN block; iOS delegate only; VPN foreground channel unchanged (AndroidManifest.xml:7-12,64-76; AppDelegate.swift:13-16) | closed |
| T-22-25 | Tampering | deferred FCM scope | high | mitigate | No firebase deps; `COVERAGE.md:21,26` documents deferral (D-08 — no Firebase credentials); no fake token route | closed (deferred) |
| T-22-26 | Tampering | package install | high | mitigate | Human-approved exact stable pin; no substitute/beta (STATE.md:155; pubspec.yaml:21) | closed |
| T-22-27 | Tampering | text-scale policy | medium | mitigate | `AppTextScalePolicy` passes `TextScaler` through, no clamp; 200% widget test (main.dart:64,75-89) | closed |
| T-22-28 | Information disclosure | secondary text token | medium | mitigate | `AppTheme.dim` → `0xFF829486` (5.42:1 / 5.00:1 / 4.61:1 on dark surfaces); computed contrast test (theme.dart:59-63) | closed |
| T-22-29 | Spoofing | Semantics labels | medium | mitigate | Frozen Russian labels on four icon-only header actions; no link/token in labels (main_header.dart:136-194) | closed |
| T-22-30 | Tampering | decorative painters | low | accept | Non-interactive confetti/ring painters excluded from semantics; day-count label preserved — see Accepted Risks Log | closed (accepted) |
| T-22-31 | Tampering | simulation / navigation regressions | medium | mitigate | No FSM/native/payment file touched by phase commits; no NavigationBar/load bar/fake network control | closed |

*Status: closed · open · open — below `block_on` threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above ASVS L1 `high` count toward `threats_open`*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-30 | Confetti and ring painters are decorative and non-interactive; `ExcludeSemantics` avoids false affordances while preserving the day-count label. Low severity, accepted per plan-time rationale. | gsd-security-auditor verdict + orchestrator | 2026-11-28 |
| AR-22-02 | T-22-25 | FCM registration (REQ-NOTIF-02) deferred by owner decision D-08: no Firebase project, credentials, or backend token route. Local reminders ship without it; no fake route/token was added. | User (explicit choice 2026-11-28) | 2026-11-28 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-28 | 32 (31 numbered + T-22-SC, deduplicated) | 32 | 0 | gsd-security-auditor |
| 2026-11-28 | 18 re-checked after fixes `3711ac1`…`a7b9477` | 18 | 0 | gsd-security-auditor (post-fix re-verification; no backend/native/pubspec/FSM/payment file changed) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-28
