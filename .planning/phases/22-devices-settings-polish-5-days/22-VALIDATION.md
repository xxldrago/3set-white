---
phase: "22"
slug: "devices-settings-polish-5-days"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-28"
audited: "2026-11-28"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for devices/profile/settings backend, Flutter UI, deferred-delete undo and local notifications.
> Nyquist audit 2026-11-28: expanded to all 10 implementation tasks (2 per plan); every automated requirement verified green.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test / mocktail (mobile) |
| **Config file** | `package.json` + `mobile/pubspec.yaml` |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test test/unit test/widget` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `cd mobile && dart run build_runner build --delete-conflicting-outputs && flutter analyze --no-fatal-infos --no-fatal-warnings && flutter test` |
| **Estimated runtime** | ~90s backend + ~180s mobile |

`npx prisma validate`; `flutter_local_notifications` 23.0.4 + direct `timezone` install behind `checkpoint:human-verify` (pub.dev legitimacy seam unsupported).

---

## Sampling Rate

- **After every task commit:** focused backend/mobile tests.
- **After every plan wave:** full suites + analyzer.
- **Before `/gsd-verify-work`:** all green; live-key/device/package items stay manual-only.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | REQ-BE-06 / REQ-DEV-01 / REQ-SUB-04 | T-22-01/02/06/07 | JWT ownership-scoped device read; one row per token; no client keyId, lastSeen or link; no token/provider text in body or logs; 401 with zero provider calls | unit + widget | `npx vitest run tests/unit/mobile-devices-route.test.ts` + `cd mobile && flutter test test/widget/features/profile/profile_sheet_test.dart` | ✅ W0 | ✅ green |
| 22-01-02 | 01 | 1 | REQ-DEV-02 / REQ-DEV-03 / REQ-DEV-04 / REQ-BE-06 / REQ-SUB-04 | T-22-01/02/03/04/07 | zod 1..300 token before provider call; 5s deferred DELETE with undo cancel before provider call; double tick/second delete yields one call; at-limit paid CTA only; below limit copies real link; no local counter | unit + widget | `npx vitest run tests/unit/mobile-devices-route.test.ts` + `cd mobile && flutter test test/unit/features/devices/deferred_delete_test.dart test/unit/features/devices/device_limit_test.dart test/widget/features/profile/profile_sheet_test.dart` | ✅ W0 | ✅ green |
| 22-02-01 | 02 | 2 | REQ-SET-02 | T-22-09/10/13 | AutoConnect preference persists across in-memory Drift rebuild (singleton row); connect called once only when authenticated + active key + preference true; re-watch/network event adds no second call; storage failure never breaks startup | unit | `cd mobile && flutter test test/unit/core/settings/auto_connect_test.dart` | ✅ W0 | ✅ green |
| 22-02-02 | 02 | 2 | REQ-SET-04 | T-22-11/12 | Reset Demo clears token store (incl. biometric namespace), secure storage and all six Drift tables; invalidates auth, navigates once; zero outbound calls; hasTokens stays false | unit | `cd mobile && flutter test test/unit/core/settings/reset_demo_test.dart` | ✅ W0 | ✅ green |
| 22-03-01 | 03 | 3 | REQ-SET-01 / REQ-SUB-05 / REQ-SET-03 | T-22-14/15/20 | Identity fallback firstName→username→email-local→«Пользователь» with no invented email; kill switch exact frozen read-only copy on every rebuild with no Switch/nav; own-row referral ensure only; no other user's code in body or logs | unit + widget | `npx vitest run tests/unit/mobile-subscription-route.test.ts` + `cd mobile && flutter test test/widget/features/profile/profile_sheet_test.dart` | ✅ W0 | ✅ green |
| 22-03-02 | 03 | 3 | REQ-SET-03 / REQ-SET-04 / REQ-SET-05 / REQ-DEV-03 / REQ-SUB-04 / REQ-SUB-05 | T-22-16/17/18/19/20 | Referral URL single stored prefix; both copy rows use existing toast; confirm-then-call local reset with zero Dio; network chip real labels incl. no-connection, no tap handler, real stream change still invalidates ping cache; device-limit from server only | widget | `cd mobile && flutter test test/widget/features/profile/referral_row_test.dart test/widget/features/profile/reset_row_test.dart test/widget/features/servers/pool_toolbar_test.dart test/widget/features/profile/profile_sheet_test.dart` | ✅ W0 | ✅ green |
| 22-04-02 | 04 | 3 | REQ-NOTIF-01 | T-22-21/22/23 | Three absolute reminders at T-7/T-3/T-1 from server expiresAt; past instants skipped; cancel-before-reschedule with no duplicates; navigation-only payload (`shop`), no link/token/expiry; tap opens shop only for marker | unit | `cd mobile && flutter test test/unit/core/notifications/expiry_scheduler_test.dart` | ✅ W0 | ✅ green |
| 22-04-03 | 04 | 3 | REQ-NOTIF-01 | T-22-24/25/08 | Android declares FLN scheduled/boot receivers + POST_NOTIFICATIONS/VIBRATE/exact-alarm outside VPN block; iOS registers UNUserNotificationCenter.delegate; VPN channel id `3set-vpn` intact; no firebase_ dependency | smoke (source-level) + unit | `cd mobile && grep -q 'ScheduledNotificationReceiver' android/app/src/main/AndroidManifest.xml && grep -q 'UNUserNotificationCenter' ios/Runner/AppDelegate.swift && grep -q '3set-vpn' android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt && ! grep -q 'firebase_' pubspec.yaml && flutter analyze --no-fatal-infos --no-fatal-warnings` | ✅ source | ✅ green |
| 22-05-01 | 05 | 4 | REQ-DEV-01 / REQ-SET-01 | T-22-27/28 | 200% platform text scale reaches text unclamped (16→32px) with no overflow; secondary/dim token clears WCAG AA 4.5:1 on both dark surfaces; no clamp, nav bar or load bar | widget | `cd mobile && flutter test test/widget/app/accessibility_test.dart test/widget/app/theme_test.dart` | ✅ W0 | ✅ green |
| 22-05-02 | 05 | 4 | REQ-SET-05 / REQ-SET-01 | T-22-29/30/31 | Every icon-only pool-header action has a frozen Russian Semantics label with no link/token; kill switch + device rows announced, never interactive; confetti/ring painters under ExcludeSemantics after CONFIRMED edge while day count stays announced | widget | `cd mobile && flutter test test/widget/app/accessibility_test.dart` | ✅ W0 | ✅ green |

*Non-implementation gate tasks are intentionally absent from this map: `22-01` task 1 (blocking `checkpoint:decision`, recorded in STATE.md, no code) and `22-04` task 1 (`checkpoint:human-verify` blocking-human package legitimacy gate, no code). Status key: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky.*

---

## Requirement → Coverage Classification

| Requirement | Task(s) | Test evidence | Classification |
|-------------|---------|---------------|----------------|
| REQ-BE-06 (devices routes) | 22-01-01, 22-01-02 | `tests/unit/mobile-devices-route.test.ts` (14 vectors) | COVERED |
| REQ-DEV-01 (device list) | 22-01-01, 22-05-01 | `mobile-devices-route.test.ts`, `profile_sheet_test.dart`, `accessibility_test.dart` | COVERED* |
| REQ-DEV-02 (remove + deferred undo) | 22-01-02 | `deferred_delete_test.dart`, `profile_sheet_test.dart`, `mobile-devices-route.test.ts` | COVERED |
| REQ-DEV-03 (honest add via link) | 22-01-02, 22-03-02 | `profile_sheet_test.dart`, `device_limit_test.dart` | COVERED |
| REQ-DEV-04 (limit enforcement) | 22-01-02 | `device_limit_test.dart`, `profile_sheet_test.dart` («Лимит устройств достигнут» asserted) | COVERED |
| REQ-SET-01 (read-only kill switch) | 22-03-01, 22-05-01, 22-05-02 | `profile_sheet_test.dart`, `accessibility_test.dart`, `mobile-subscription-route.test.ts` | COVERED† |
| REQ-SET-02 (auto-connect) | 22-02-01 | `auto_connect_test.dart` (7 vectors) | COVERED‡ |
| REQ-SET-03 (referral link) | 22-03-01, 22-03-02 | `mobile-subscription-route.test.ts`, `referral_row_test.dart` | COVERED§ |
| REQ-SET-04 (Reset Demo) | 22-02-02, 22-03-02 | `reset_demo_test.dart`, `reset_row_test.dart` | COVERED‡ |
| REQ-SET-05 (read-only network chip) | 22-03-02, 22-05-02 | `pool_toolbar_test.dart`, `accessibility_test.dart` | COVERED∥ |
| REQ-NOTIF-01 (expiry reminders) | 22-04-02, 22-04-03 | `expiry_scheduler_test.dart` (6 vectors), source-level native checks | COVERED¶ |
| REQ-NOTIF-02 (FCM token) | — | Deferred by D-08; no code path | JUSTIFIED SKIP (external blocker) |
| REQ-SUB-04 (device limit source) | 22-01-01, 22-01-02, 22-03-02 | `device_limit_test.dart`, `profile_sheet_test.dart` | COVERED |
| REQ-SUB-05 (subscription link copy) | 22-03-01, 22-03-02 | `profile_sheet_test.dart`, `referral_row_test.dart` | COVERED (shop copy inherited phase 21) |

- \* `last seen` (REQ-DEV-01) is intentionally omitted per locked decision A3/research — the provider shape supplies no such field; tests assert no fabricated `lastSeen`. Documented opt-out, not a gap.
- † "Traffic stays blocked outside VPN" is the inherited native always-on kill-switch behavior (phase 20 D-09); the row's read-only presentation is fully tested here; live traffic-leak UAT stays manual.
- ‡ Single-fire/biometric-resume and v1→v2 on-disk migration are proven with fakes/in-memory Drift; real-device checks stay manual.
- § Live NULL-legacy-code ensure on a production user row is mock-tested; live row check stays manual.
- ∥ Real connectivity/invalidation timing is proven with an injected stream; on-device timing stays manual.
- ¶ OS delivery with the app killed, reboot receivers and iOS permission prompt stay manual (cannot be proven by unit tests/analyzer).

---

## Wave 0 Requirements

- [x] Backend vitest infrastructure — existing.
- [x] Mobile `flutter_test` + mocktail — existing.
- [x] `flutter_local_notifications` 23.0.4 + `timezone` — installed behind `checkpoint:human-verify`; pins present in `mobile/pubspec.yaml`, no `firebase_` dependency.
- [x] No Prisma schema change for read/delete routes; Drift v2 settings covered by in-memory fixtures; `npx prisma validate` valid.
- [x] Deferred-delete timer fixtures deterministic (`fakeAsync` / `elapse`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ARTEMIDA device list / deferred delete with real key | REQ-DEV-01/02, REQ-BE-06 | Needs paid key + provider network | Confirm GET shows real devices, undo cancels before provider call, confirmed delete removes only that token. |
| Auto-connect single-fire with real biometric resume + live tunnel | REQ-SET-02 | Real device biometric prompt/timing | Enable preference, lock, relaunch, unlock via biometrics; confirm exactly one connect and no second reconnect path. |
| Real on-disk Drift v1→v2 database upgrade | REQ-SET-02 | Migration not exercised against real v1 file | Install a v1 build with data, upgrade to v2, confirm existing rows preserved and settings table created. |
| On-device check no biometric prompt can resurrect a session after Reset Demo | REQ-SET-04 | Fake store only | After reset, trigger biometric prompt; confirm no access token is returned and app stays at /auth. |
| Live referral row on a production user with a NULL legacy code | REQ-SET-03 | Mock-tested ensure only | Open profile on a user whose `referralCode` is NULL; confirm exactly one `3SET-` prefix is generated and copied. |
| On-device network-change / ping-cache invalidation with live tunnel | REQ-SET-05 | Mock stream only | Toggle WiFi/LTE on device; confirm chip label updates and ping cache invalidates through the existing listener. |
| Local expiry notification firing with the app killed, reboot receivers, iOS permission prompt | REQ-NOTIF-01 | OS channels/exact alarms | Set expiry to T-7/T-3/T-1, kill app, confirm notification and deep-link to shop; reboot and confirm reschedule; grant iOS permission. |
| FCM token registration | REQ-NOTIF-02 | External blocker — no Firebase project/credentials | Deferred by D-08; do not fake. Requires owner-supplied config + backend route in a later phase. |
| Install of `flutter_local_notifications` / `timezone` | D-09 | pub.dev legitimacy seam unsupported | Human verified publisher/version before `flutter pub add`; no silent substitute (recorded in 22-04 SUMMARY). |
| Visual/accessibility parity with prototype | 22.11/22.12, REQ-SET-01..05, REQ-DEV-01 | No screenshots/browser MCP | Compare profile sheet, device list, settings rows, chip labels, contrast and dynamic type to `.planning/seeds/prototype-mobile-client.html`. |
| Live screen-reader pass on a device | REQ-SET-05, REQ-SET-01 | Semantics nodes in tests, not a real screen reader | Run TalkBack/VoiceOver over profile, device rows and kill-switch status; confirm labels and no decorative painter announcements. |
| Inherited phase-19/20/21 UAT | inherited | Device/live key | `/gsd-verify-work 19/20/21` before milestone close. |

*All other phase behaviors have automated verification. The justified FCM skip (REQ-NOTIF-02) and the absent free add/restore operations are reasoned opt-outs in `COVERAGE.md`, not untested gaps.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (10/10 implementation tasks mapped).
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags (all commands use `run`/one-shot).
- [x] Feedback latency < 180s (observed: vitest ~0.3s, focused mobile suites ~2s).
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved — Nyquist audit 2026-11-28.

---

## Validation Audit 2026-11-28

Adversarial Nyquist audit: every requirement was re-mapped to an executable test, and every test was run (not read as "passing" from summaries). Result: **all automated requirement behaviors are COVERED; no genuinely missing tests found, so no new test files were created.**

### Verification commands actually executed

| Command | Result |
|---------|--------|
| `npx vitest run tests/unit/mobile-devices-route.test.ts tests/unit/mobile-subscription-route.test.ts` | 2 files / 29 tests passed |
| `cd mobile && flutter test <11 phase-22 test files>` | All tests passed (64 tests) |
| `npx prisma validate` | Schema valid |
| `npx tsc --noEmit` | 0 errors (no phase-file errors) |
| `cd mobile && flutter analyze --no-fatal-infos --no-fatal-warnings` | Exit 0; 1887 pre-existing infos + 4 warnings; 0 errors |

### Adversarial checks performed

- Confirmed each test file exists and contains fail-able behavioral assertions (not structural stubs): auth/zod/ownership envelopes with provider-text secrecy, `fakeAsync` undo clock with double-tick/refresh edges, integer-only capacity boundaries with the «Лимит устройств достигнут» toast, Drift persistence + single-fire gating, full local reset with `verifyNever` on Dio, three absolute TZ instants with past-skip/cancel-before-reschedule and navigation-only payload, and Semantics/contrast/200% text-scale assertions.
- Confirmed the two locked no-code gates (22-01 decision, 22-04 blocking-human package) are legitimately outside the test map and accounted for in STATE.md / 22-04 SUMMARY.
- Confirmed REQ-NOTIF-02 (FCM) is an explicit D-08 deferral with a reasoned `COVERAGE.md` opt-out, not an untested code path.
- Confirmed no remote-push dependency in `mobile/pubspec.yaml` (`flutter_local_notifications: 23.0.4`, `timezone: ^0.11.2`, no `firebase_`).

### Non-blocking caveats

- `flutter analyze` reports 3 non-fatal lint warnings in phase files (2 unused imports / unused shown-name in `lib/core/settings/reset_demo.dart`, 1 unused `dart:async` import in `test/unit/features/devices/deferred_delete_test.dart`). All are `warning`-level, non-fatal under `--no-fatal-warnings` (exit 0), and do not affect behavior. Implementation files are read-only for this audit and were not modified.
- Full backend `tsc --noEmit` currently exits 0 (cleaner than the ~174-error baseline noted at phase start).

### Outcome

Every requirement → task → test link is green. Status moved from `draft` to `validated` with `nyquist_compliant: true` and `wave_0_complete: true`. Manual-only items (FCM/device live, notification OS delivery, on-device biometric/migration, visual/screen-reader UAT) remain explicitly listed above.
