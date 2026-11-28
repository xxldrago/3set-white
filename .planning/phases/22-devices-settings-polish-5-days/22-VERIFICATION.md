---
phase: 22-devices-settings-polish-5-days
verified: 2026-11-28T11:58:08Z
status: human_needed
score: 48/48 must-haves verified
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 9
  total: 9
  not_honored: []
deferred:
  - truth: "REQ-NOTIF-02 FCM token registration (roadmap task 22.10)"
    addressed_in: "Owner decision / future scoped phase after Firebase credentials exist (D-08) — not claimed by any later roadmap phase"
    evidence: "22-CONTEXT.md D-08; 22-04-PLAN.md must_haves; COVERAGE.md:21,26; STATE.md:59,156; no firebase_* dependency, token route or fabricated token in the codebase. External blocker, not a code gap."
human_verification:
  - test: "Live ARTEMIDA device list and deferred delete with a paid key"
    expected: "GET /api/mobile/devices shows only that user's real device rows in provider order with real labels and server deviceLimit; a five-second undo cancels before any provider call; a confirmed delete removes only that token and a refresh never resurrects it."
    why_human: "Requires a paid ARTEMIDA key and live provider network; only mocked provider behavior is exercised by vitest."
  - test: "Auto-connect single-fire with real biometric resume and live tunnel"
    expected: "After enabling the persisted toggle, locking, relaunching and unlocking biometrically, connect(tab, auto: true) happens exactly once, no second reconnect path starts, and a network change stays owned by the existing listener."
    why_human: "Real biometric prompt/timing and tunnel state cannot be reproduced with the fake auth/FSM seams used by auto_connect_test.dart."
  - test: "Real on-disk Drift v1 to v2 database upgrade"
    expected: "A v1 build with existing ping/selection/tab rows upgrades to v2 with all rows preserved and the settings table created."
    why_human: "The migration is source- and in-memory-tested only; no real v1 database file was upgraded in this environment."
  - test: "On-device Reset Demo biometric-resurrection check"
    expected: "After reset, triggering a biometric prompt returns no access token and the app stays at /auth; no server session or paid key/device is affected."
    why_human: "reset_demo_test.dart uses fake stores; OS keystore/biometric behavior needs a device."
  - test: "Live referral row on a production user with a NULL legacy referralCode"
    expected: "ensureReferralCode runs only on the authenticated user's own row, produces exactly one 3SET- prefix, and the copied URL contains it once."
    why_human: "The ensure path is mock-tested; a real database row is not available here."
  - test: "On-device network change and ping-cache invalidation with a live tunnel"
    expected: "The read-only chip updates its label (including no connection and LTE/Ethernet icons) and a real connectivity change invalidates the Drift ping cache through the existing listener; tapping the chip does nothing."
    why_human: "Connectivity streams are injected in widget tests; real OS connectivity and tunnel timing are device-only."
  - test: "Local expiry notification delivery, reboot and permission dialog"
    expected: "With the app killed, T-7/T-3/T-1 reminders fire at their absolute instants and a tap opens /shop only; a reboot restores the schedule; the Android 13+ POST_NOTIFICATIONS dialog is shown/granted and the status row reflects the OS answer; iOS prompts for authorization."
    why_human: "OS alarms, exact-alarm policy, reboot receivers and platform permission dialogs cannot be exercised through a fake dispatcher or the analyzer."
  - test: "Visual parity of the assembled profile/devices/settings surfaces with the prototype"
    expected: "Dark palette, spacing, identity treatment, device rows, kill-switch/network/referral/reset/logout rows and dynamic type match .planning/seeds/prototype-mobile-client.html to the extent allowed by D-01/D-05/D-06/D-07/D-08."
    why_human: "No screenshot/browser MCP was available; 22-UI-REVIEW.md was a static audit and its remaining fidelity items (subscription summary card, explicit close button, identity gradient, type/spacing scale) were deliberately left for a UI contract."
  - test: "Live screen-reader pass (TalkBack/VoiceOver) over profile and pool surfaces"
    expected: "Icon-only actions, referral/reset/logout rows, device rows and the kill-switch status are announced with their frozen Russian labels; confetti and ring painters are not announced; no token or link is spoken."
    why_human: "Semantics nodes are asserted in widget tests, but a real screen reader's output and focus order require a device."
  - test: "Owner decision on REQ-NOTIF-02 (FCM token registration)"
    expected: "Either confirm continued deferral while no Firebase project/credentials/backend route exist, or supply credentials and scope a separate task; no fabricated token or fake route is introduced in either case."
    why_human: "External blocker (D-08); there is no code path to test and no credentials in this environment."
  - test: "Inherited phase-19/20/21 UAT before milestone close"
    expected: "Close the open live-key, native build/tunnel, payment and visual UAT items recorded in 19-, 20- and 21-VERIFICATION.md, re-checking the connect gates changed by phase 21 D-10."
    why_human: "Device, live-key and external-service items explicitly deferred by earlier phases; phase 22 does not own them."
---

# Phase 22: Devices, Settings & Polish — Verification Report

**Phase Goal:** Device management, settings, push notifications, UI polish.
**Verified:** 2026-11-28T11:58:08Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior 22-VERIFICATION.md existed)

**Evidence policy:** SUMMARY/VALIDATION/REVIEW claims were treated as narration. Every artifact was re-read
in the working tree, key links were traced through imports and call sites, the five PLAN artifact sets were
re-checked with `gsd-tools query verify.artifacts` (40/40 pass), and all automated suites were executed in
this session. No implementation file was modified by this verification; `git status --short` stayed at 78
entries (44+ unrelated user edits untouched).

Phase mode is not `mvp`; standard goal-backward verification applies. ROADMAP §22 has no
`success_criteria` array, so must-haves are the deduplicated union of the five PLAN frontmatter truth
blocks (36 unique truths) plus 12 post-review fix obligations explicitly carried into this verification.
Literal ROADMAP task wording that conflicts with locked decisions (22.3 "Undo restores", 22.4
"POST → count increments", 22.5 kill-switch toggle, 22.8 WiFi/LTE toggle, 22.10 FCM) is superseded by
22-CONTEXT.md D-01–D-09 and the rewritten REQ-SET-01; it is not counted as a failed truth.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | JWT user sees one row per device token; equal labels never merge | ✓ VERIFIED | `devices/route.ts:52-123` derives key from `claims.userId`, maps every device verbatim; `device.dart` is per-token; `profile_sheet_test.dart` asserts distinct rows. |
| 2 | Empty list renders «Нет устройств», no placeholder row | ✓ VERIFIED | `devices_sheet.dart:188-189`; `profile_sheet_test.dart` empty-state vector. |
| 3 | Opaque tokens: server zod 1..300, client `Uri.encodeComponent`, no client keyId | ✓ VERIFIED | `devices/[token]/route.ts:23,57-66`; `endpoints.dart:27-29`; `devices_providers.dart:74-81`; no `keyId` in Dart device code. |
| 4 | Rows keep provider order; no client ranking or fabricated best device | ✓ VERIFIED | Route preserves `devices.map` order (`:115-119`); provider decodes list as-is; sheet iterates `for (final device in devices)`. |
| 5 | Refresh during the undo window keeps the row pending; no reinsert after a successful delete | ✓ VERIFIED | `deferred_delete_controller.dart:41-48,55-83`; `devices_sheet.dart:61-63,194`; unit test "a refresh during the window keeps the row pending, never reinserted" passes. |
| 6 | «Вернуть» cancels before any provider call; repeated tap/double tick issues at most one DELETE | ✓ VERIFIED | Generation guard + `_inFlight` at `deferred_delete_controller.dart:52-100`; fakeAsync tests "undo inside the window cancels before any provider call", "a fired timer sends exactly one DELETE; a double tick cannot send two", "repeated undo taps and dispose stay safe" pass. |
| 7 | Second delete while in flight yields the stable Russian notice, no second call or restored row | ✓ VERIFIED | `remove()` guard at `:53`; `deviceAlreadyPendingNotice` at `:5`; test "a second delete while one is pending is ignored (one stable outcome)" passes. |
| 8 | At exactly deviceLimit only paid upgrade; below it the subscription-link handoff; over the limit no spare capacity | ✓ VERIFIED | `deviceCapacity` integer comparison at `devices_sheet.dart:29-33,179-219`; four `device_limit_test.dart` vectors pass, including the «Лимит устройств достигнут» boundary. |
| 9 | Device counts/limits are server integers; no rounding, percentage or local counter | ✓ VERIFIED | Route sends `active.deviceLimit` (`:120`); `deviceCapacity` clamps integers only; test "repeated reads with the same server integers never grow capacity" passes. |
| 10 | Repeated GET/DELETE return the same `{ok,error}` envelope; provider failures are HTTP 200 stable codes, no provider text | ✓ VERIFIED | `respond()` + catch maps in both routes; `Retry-After` on rate limits; 29 backend vectors pass with no token/link/provider text assertions. |
| 11 | Concurrent deletes resolve one stable outcome, no 5xx; malformed token rejected by zod before any provider call | ✓ VERIFIED | zod `safeParse` before `listKeysByUserId` at `devices/[token]/route.ts:57-68`; non-owned/unauthorized collapse to `no_active_key` (`:70-108`); backend vectors pass. |
| 12 | Auto-connect preference survives a store rebuild (singleton Drift row) | ✓ VERIFIED | `settings_table.dart` id=1; `AutoConnectStore.setAutoConnect` insertOrReplace at `auto_connect_listener.dart:47-52`; tests "persists across a store rebuild" and "one singleton row holds the value" pass. |
| 13 | One connect per authenticated + key-gated + biometrically-resumed launch; re-watch adds none | ✓ VERIFIED | `fired` flag and gate at `auto_connect_listener.dart:80-111`, wired once at `main.dart:48`; tests for one call, unauthenticated/no-key/false preference and storage failure pass. |
| 14 | Later network changes stay with the existing reconnect listener; no second path/native change | ✓ VERIFIED | `main.dart:36,40`; auto-connect listener subscribes to no connectivity stream (`:101-107`); no phase-22 commit touched `connection_notifier.dart` or native files. |
| 15 | Reset Demo clears tokens (incl. biometric namespace), secure storage and all Drift tables, then invalidates auth and routes to /auth | ✓ VERIFIED | `reset_demo.dart:22-54`; `app_database.dart:18-27` registers all six tables; `reset_demo_test.dart` full-clear vectors pass. |
| 16 | Reset Demo performs no server revocation, provider clear, key/device delete or ARTEMIDA call | ✓ VERIFIED | `reset_demo.dart` has no HTTP client; `reset_row_test.dart` and `reset_demo_test.dart` assert zero outbound calls; `COVERAGE.md:18` records `clearDevices` opt-out. |
| 17 | After reset `hasTokens()` is false and no biometric prompt can resurrect a session | ✓ VERIFIED (fake-store evidence) | `reset_demo_test.dart` "hasTokens stays false after reset even with a stored biometric copy" passes; the real-device prompt check is human-only (listed below). |
| 18 | Profile shows a real DB name with deterministic fallback; no invented email | ✓ VERIFIED | `subscription/route.ts:71-103` selects real nullable fields; `profileDisplayName` at `profile_sheet.dart:38-49`; widget tests for firstName/username/email-local/neutral pass. |
| 19 | Kill switch row shows exact frozen copy on every rebuild with no interactive control | ✓ VERIFIED | `kill_switch_row.dart:18-21` has no `Switch`/`GestureDetector`; `profile_sheet_test.dart` "read-only kill switch copy is identical on every rebuild" and no-toggle/no-nav vectors pass. |
| 20 | Referral URL uses the stored code once; NULL legacy code ensured on the caller's own row only | ✓ VERIFIED | `subscription/route.ts:90-103` calls `ensureReferralCode(claims.userId)`; `referral_row.dart:21-25` appends `?ref=` once; backend + widget single-prefix vectors pass. |
| 21 | Reset Demo is reachable from the profile and calls only the local reset function | ✓ VERIFIED | `profile_sheet.dart:91` renders `ResetRow`; `reset_row.dart:27-37,71-94` injects local reset + router seam; `reset_row_test.dart` passes. |
| 22 | Network chip shows real connectivity labels including no connection, is non-interactive and has no fake switch/toast | ✓ VERIFIED | `NetworkStatusRow` at `profile_sheet.dart:237-283` has no tap; `networkIconForLabel` at `pool_toolbar.dart:10-15`; `pool_toolbar_test.dart` real-label/no-tap vectors pass. |
| 23 | Real connectivity change still invalidates the Drift ping cache; rebuilds keep the same label | ✓ VERIFIED | `main.dart:36` keeps `networkPingInvalidationProvider`; `pool_toolbar_test.dart` "a real stream change still clears the Drift ping cache" passes. |
| 24 | Three local reminders at T-7/T-3/T-1 from server `expiresAt`, absolute zoned instants | ✓ VERIFIED | `expiry_scheduler.dart:16-64`, wired from `userSubscriptionProvider` via `expiry_notification_listener.dart:54-60`; three-instant unit vectors pass. |
| 25 | Past instants skipped; rescheduling cancels older reminders instead of stacking | ✓ VERIFIED | Cancel-before-schedule at `expiry_scheduler.dart:42-44`, past-skip at `:56`; scheduler tests "skips instants already in the past" and "cancels prior reminders before rescheduling" pass. |
| 26 | Payload is navigation-only `shop`; no link/token/amount/entitlement or payment effect | ✓ VERIFIED | `local_notifications.dart:17-18,43-47,159-172`; `handleExpiryNotificationTap` ignores every other payload; scheduler/tap tests pass. |
| 27 | Plugin and timezone initialize once; a tap is never payment proof | ✓ VERIFIED | Cached `_initialization` at `local_notifications.dart:90-95`, `localNotificationsReadyProvider` at `:185-190`; tap handler only calls `go('/shop')`. |
| 28 | Android declares its own expiry receivers/permissions without altering the VPN service or channel | ✓ VERIFIED | `AndroidManifest.xml:9-12,68-76` adds POST_NOTIFICATIONS/VIBRATE/exact-alarm/boot + FLN receivers; `VpnForegroundService.kt:47` still `3set-vpn`; no phase-22 commit touched it. |
| 29 | iOS registers the notification center delegate with no remote-push setup | ✓ VERIFIED | `AppDelegate.swift:7,15`; no Firebase SDK, credential file or token route in `mobile/`. |
| 30 | REQ-NOTIF-02 is explicitly deferred (D-08) — no fabricated token or fake backend route | ✓ VERIFIED (deferral) | `22-CONTEXT.md:28`, `COVERAGE.md:21,26`, `STATE.md:59,156`; grep for `firebase_` in `mobile/` finds only explanatory comments. Owner decision remains human-only. |
| 31 | Exact pins human-verified before install; no beta or substitute | ✓ VERIFIED | `STATE.md:155` gate record; `pubspec.yaml:21` `flutter_local_notifications: 23.0.4`, `:35` `timezone: ^0.11.2`; `pubspec.lock` resolves 23.0.4 / 0.11.2. |
| 32 | A 200% platform text scale renders at 200% with no upper clamp and no overflow | ✓ VERIFIED | `AppTextScalePolicy` passes `TextScaler` through at `main.dart:75-89`; `accessibility_test.dart` "a 200% platform text scale reaches text unclamped" passes. |
| 33 | Secondary text token clears WCAG AA 4.5:1 on both dark card surfaces | ✓ VERIFIED | `theme.dart:63` `dim = 0xFF829486`; `theme_test.dart` computes ratios (5.42 surface / 5.00 surface2 / 4.61 surface3); accessibility token test passes. |
| 34 | Every icon-only pool-header action has a Semantics label; kill-switch/device rows are announced | ✓ VERIFIED | `main_header.dart:149-196` labels four actions; `referral_row.dart:91-94` and `reset_row.dart:47-50` mark copy/reset as buttons; `accessibility_test.dart` label and announcement vectors pass. |
| 35 | Decorative confetti and ring painters contribute no semantics nodes | ✓ VERIFIED | `ExcludeSemantics` at `confetti_overlay.dart:193` and `ring_painter.dart:94`; both CONFIRMED-edge and ring-count vectors pass. |
| 36 | Accessibility polish introduced no simulation, load bar, bottom nav, FSM or native change | ✓ VERIFIED | No `NavigationBar` in phase UI sources; no phase-22 commit touched VPN/FSM/payment files; analyzer and both widget suites pass. |
| 37 | CR-01 fix: Android 13+ notification permission is requested and surfaced in a status row | ✓ VERIFIED (code) | `local_notifications.dart:57-64,100-126` requests/grants via installed FLN API; `NotificationStatusRow` at `profile_sheet.dart:176-229` with «Разрешить» re-request; `notification_status_row_test.dart` passes. OS dialog is human-only. |
| 38 | bed437b: persisted auto-connect UI writer exists and writes once per toggle | ✓ VERIFIED | `AutoConnectRow` at `profile_sheet.dart:114-174` seeds asynchronously and is read-only until loaded; `auto_connect_row_test.dart` seeds/one-write/read-only-before-load vectors pass. |
| 39 | 37774c0: danger-styled logout row calls only `authNotifier.logout()` then /auth | ✓ VERIFIED | `logout_row.dart:18-32,67-91`; `logout_row_test.dart` asserts one logout call, one navigation and zero provider/device deletes; passes. |
| 40 | 77d0bc5: failed deferred DELETE shows a stable notice, refetches and clears pending state | ✓ VERIFIED | `devices_sheet.dart:48-71` try/catch/finally; controller consumes the error at `deferred_delete_controller.dart:72-80`; `deferred_delete_failure_test.dart` passes. |
| 41 | 054a0f5: undo SnackBar duration equals the five-second window; completed copy waits for BFF | ✓ VERIFIED | `devices_sheet.dart:98-110` uses `_controller.window` and «Отключение…» until `onDeleteCompleted` (`:68-70`); duration/pending-copy assertions pass. |
| 42 | f2cfed6: expiry scheduling awaits init and retries a transient failure | ✓ VERIFIED | `expiry_notification_listener.dart:37-52` awaits the cached future and only records success; `expiry_notification_listener_test.dart` both vectors pass. |
| 43 | 6434d5c: unknown `deviceLimit` shows no false limit claim and no premature paid CTA | ✓ VERIFIED | `devices_sheet.dart:179-183` computes capacity only for a loaded `ok` subscription; widget loading/errored-state vectors pass. |
| 44 | bb71132: reset navigation uses a router seam, no BuildContext across awaits | ✓ VERIFIED | `reset_row.dart:24-37,90-93`, `reset_demo.dart:6-9`; disposed-tree callback test passes. |
| 45 | 085147d: tappable copy/reset rows expose button semantics | ✓ VERIFIED | `Semantics(button: true, label: …)` at `referral_row.dart:91-94`, `reset_row.dart:47-50`; widget assertions pass. |
| 46 | 11a7863: network chip icon matches the real label (LTE/Ethernet/Wi-Fi/offline) | ✓ VERIFIED | `pool_toolbar.dart:10-15` pure mapping; both chips use it; `pool_toolbar_test.dart` label-transition test passes. |
| 47 | 258add5: header avatar letter comes from real identity, neutral icon when unknown | ✓ VERIFIED | `main_header.dart:9,149,196`; `accessibility_test.dart` real-letter and neutral-avatar vectors pass. |
| 48 | a7b9477: device loading shows a spinner and failed reads offer «Повторить» | ✓ VERIFIED | `devices_sheet.dart:142-173`; `profile_sheet_test.dart` spinner and retry-then-success vectors pass. |

**Score:** 48/48 truths verified (0 present-but-behavior-unverified, 0 overrides).
**Status driver:** `human_needed` — no truth failed, but the phase is user-facing and its external/device/
visual acceptance items and the D-08 FCM owner decision cannot be executed here (Step 9 rule 2).

### Deferred Items

Items intentionally not implemented under locked decisions; they are not actionable phase gaps.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | REQ-NOTIF-02 FCM token registration (roadmap 22.10) | Owner decision / future scoped phase once Firebase credentials and a backend token route exist (D-08) | 22-CONTEXT.md D-08; COVERAGE.md:21,26; STATE.md:59,156; no `firebase_*` dependency, token or route in code. |
| 2 | REQ-DEV-01 «last seen» sub-item | Not scheduled — provider supplies only `{token,name}` | 22-RESEARCH.md A3 / Pitfall 3 and 22-PATTERNS.md "No Analog Found"; model deliberately omits `lastSeen` rather than fabricating relative time. |
| 3 | Literal POST add / provider restore / kill-switch toggle / WiFi-LTE toggle | Replaced by locked D-01/D-05/D-06/D-07 honest handoffs | 22-CONTEXT.md D-01–D-07; REQUIREMENTS.md REQ-SET-01 rewritten; COVERAGE.md opt-outs. |

### Required Artifacts

`gsd-tools query verify.artifacts` reported `all_passed: true` for all five plans:
22-01 9/9, 22-02 7/7, 22-03 10/10, 22-04 7/7, 22-05 7/7. Every file was additionally
checked for substance (line counts) and manual wiring/data flow.

| Artifact group | Expected | Status | Details |
|----------------|----------|--------|---------|
| `app/api/mobile/devices/route.ts`, `…/[token]/route.ts` | JWT ownership-scoped list and zod-bounded delete | ✓ VERIFIED | 130/121 lines; force-dynamic, 401/no-oracle, stable envelopes, `Retry-After`. |
| `tests/unit/mobile-devices-route.test.ts`, `mobile-subscription-route.test.ts` | Wave 0 backend contract proof | ✓ VERIFIED | 310/281 lines; 29 tests pass here. |
| `device.dart`, `devices_providers.dart`, `deferred_delete_controller.dart`, `devices_sheet.dart` | Honest model, live provider, undo clock, capacity UI | ✓ VERIFIED | 50/82/101/269 lines; all wired from `Endpoints` and watched by `ProfileSheet`. |
| `profile_sheet.dart`, `server_pool_screen.dart` | Real dark profile sheet replacing stub | ✓ VERIFIED | 320/462 lines; avatar `onProfile` opens the sheet; no stub copy remains. |
| `settings_table.dart`, `app_database.dart(.g.dart)`, `auto_connect_listener.dart`, `reset_demo.dart`, `main.dart` | Drift v2 + single-fire listener + local reset + app wiring | ✓ VERIFIED | 22/57/2597/122/54/89 lines; all three app-level watches present. |
| `kill_switch_row.dart`, `referral_row.dart`, `reset_row.dart`, `logout_row.dart` | Read-only status + honest copy/reset/logout handoffs | ✓ VERIFIED | 51/110/95/92 lines; injected seams keep every action local/navigation-only. |
| `local_notifications.dart`, `expiry_scheduler.dart`, `expiry_notification_listener.dart`, native setup, `pubspec.yaml/.lock` | Local expiry reminders behind a human-gated pin | ✓ VERIFIED | 211/66/63 lines; exact pins resolved; manifest/delegate additive. |
| `theme.dart`, `main_header.dart`, painters, `accessibility_test.dart`, `theme_test.dart` | Real AA contrast, dynamic type, Semantics, exclusions | ✓ VERIFIED | 531/317/280/113 lines; computed ratios and semantics assertions pass. |
| Post-fix new test files (6) | Prove every 22-REVIEW / 22-UI-REVIEW fix | ✓ VERIFIED | `notification_status_row_test.dart`, `auto_connect_row_test.dart`, `logout_row_test.dart`, `deferred_delete_failure_test.dart`, `expiry_notification_listener_test.dart`, plus all existing suites; all pass. |

### Key Link Verification

`gsd-tools query verify.key-links` returns zero structured links for these plans (their `key_links`
are prose strings), so each link was traced manually through imports and call sites.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Flutter `devicesProvider` | `GET /api/mobile/devices` | `dio.get(Endpoints.devices)` at `devices_providers.dart:66` | ✓ WIRED | No client keyId; stable `_send`/`_decodeBody` mapper. |
| `DeleteDevice` | `DELETE /api/mobile/devices/{token}` | `dio.delete(Endpoints.device(token))` at `devices_providers.dart:78` | ✓ WIRED | `Uri.encodeComponent` at `endpoints.dart:29`. |
| DELETE route | `removeDeviceByUserId` → ARTEMIDA | `devices/[token]/route.ts:80`, `keys-service.ts:408` | ✓ WIRED | Ownership join from `claims.userId`; no POST add route exists. |
| Deferred-delete timer | BFF DELETE | `deferred_delete_controller.dart:60-81` → `devices_sheet.dart:48-65` | ✓ WIRED | Timer is the only caller; undo bumps generation first. |
| Paid upgrade CTA | `/payments/create {kind:'upgrade',addDevices}` | `devices_sheet.dart:123-133` → `paymentFlowStarterProvider` | ✓ WIRED | Server derives the owned key at `payments/create/route.ts:136-148`; `createOrder` remains sole issuer. |
| `/subscription` identity | `SubscriptionUser` → profile header/referral | `subscription/route.ts:71-103` → `models/subscription.dart` → `profile_sheet.dart:74-88` | ✓ WIRED | Real row only; own-row NULL-code ensure. |
| `reset_row` | `resetDemo` → router seam | `reset_row.dart:27-37,92-93` | ✓ WIRED | No BuildContext across storage awaits; zero HTTP. |
| `autoConnectStore` | Drift settings row → one-shot connect | `auto_connect_listener.dart:47-52,114-121` | ✓ WIRED | UI writer at `profile_sheet.dart:148-156`; `main.dart:48` watches the listener. |
| `networkLabelProvider` | read-only chip (profile + toolbar) | `profile_sheet.dart:242-278`, `pool_toolbar.dart:97-100` | ✓ WIRED | Real-change invalidation stays in `main.dart:36`. |
| Server `expiresAt` | `ExpiryScheduler` → `zonedSchedule` | `expiry_notification_listener.dart:54-59` → `expiry_scheduler.dart:39-64` → `local_notifications.dart:136-153` | ✓ WIRED | Dedicated `expiry` channel; navigation-only payload. |
| Notification tap | `/shop` | `notificationTapHandlerProvider` at `local_notifications.dart:166-172` | ✓ WIRED | No entitlement/payment side effect. |
| Text scale / tokens | every profile/device/settings widget | `main.dart:64,75-89` → `AppTheme.dark` | ✓ WIRED | Pass-through policy; AA `dim` token used by small text styles. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `GET /devices` | `devices[]`, `deviceLimit` | `listDevicesWithLabels(userId, active.id)`, `active.deviceLimit` | ✓ ownership-joined provider/DB values | ✓ FLOWING |
| Device rows | `label ?? name ?? «Устройство»` | server row fields, no local generation | ✓ real label with honest fallback | ✓ FLOWING |
| Profile identity | `firstName/username/email/referralCode` | `prisma.user.findUnique` on `claims.userId` | ✓ real own-user row | ✓ FLOWING |
| Capacity CTA | `deviceLimit`, `devices.length` | `/subscription` + `/devices` | ✓ server integers, no local counter | ✓ FLOWING |
| Auto-connect | `autoConnect` | Drift singleton row written by `AutoConnectRow` | ✓ real persisted preference | ✓ FLOWING |
| Network chip | `networkLabelProvider` | `connectivity_plus` stream | ✓ real label; «Онлайн» only while unknown | ✓ FLOWING |
| Expiry reminders | `expiresAt`, payload `shop` | `/subscription` server instant; fixed marker | ✓ server time, no client entitlement math | ✓ FLOWING |
| Notification permission row | OS grant | FLN `areNotificationsEnabled()` through fakeable seam | ✓ real OS state (device check pending) | ✓ FLOWING |
| Notification body | fixed Russian title/body | constants, no interpolation | ✓ intentionally static copy, not a data stub | ✓ VERIFIED (static by design) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend device/identity envelopes, auth, zod, Retry-After, secrecy | `npx vitest run tests/unit/mobile-devices-route.test.ts tests/unit/mobile-subscription-route.test.ts` | 2 files / 29 tests pass | ✓ PASS |
| All phase-22 Dart unit/widget suites (undo clock, gating, reset, scheduler/retry, permission row, UI fixes) | `cd mobile && flutter test` on 16 named phase-22 test files | 84/84 tests pass | ✓ PASS |
| TypeScript contract | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Prisma schema unchanged/valid | `npx prisma validate` | valid | ✓ PASS |
| Flutter analyzer | `flutter analyze --no-fatal-infos --no-fatal-warnings` | exit 0 (1916 pre-existing infos, 0 errors) | ✓ PASS |
| Generated bindings | `dart run build_runner build --delete-conflicting-outputs` | exit 0, 0 outputs written | ✓ PASS |
| Exact pins / no remote-push SDK / native additions | grep over `pubspec.yaml`, `pubspec.lock`, manifest, AppDelegate, VPN service | 23.0.4 + 0.11.2, no `firebase_*`, receivers/delegate present, `3set-vpn` intact | ✓ PASS |

Per the spot-check constraint, the full workspace suite was not re-run: the working tree carries unrelated
web/admin edits that produce out-of-phase test failures (documented in `22-REVIEW-FIX.md`). Only targeted
phase suites were executed here.

### Probe Execution

No `probe-*.sh` script is declared by any 22-NN PLAN/SUMMARY and none exists under `scripts/*/tests/`.
**SKIPPED — no probes declared.**

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| REQ-DEV-01 | 01, 05 | Device list: name, remove, per-token rows | ✓ SATISFIED | `devices/route.ts`, `devices_sheet.dart`, widget/backend tests; «last seen» intentionally omitted (A3), not fabricated. |
| REQ-DEV-02 | 01 | Remove with five-second deferred undo; «Вернуть» cancels before provider | ✓ SATISFIED | Controller generation guard + fakeAsync vectors; no fake restore (D-06 supersedes literal "Undo restores"). |
| REQ-DEV-03 | 01, 03 | Honest add via subscription link; paid capacity only | ✓ SATISFIED | `devices_sheet.dart:114-133`; no POST add route; D-05 supersedes literal POST. |
| REQ-DEV-04 | 01 | Enforce limit at `deviceLimit` with «Лимит устройств достигнут» | ✓ SATISFIED | `deviceCapacity` boundary tests; server value only. |
| REQ-SET-01 | 03, 05 | Kill-switch status, read-only, always-on | ✓ SATISFIED | `kill_switch_row.dart` frozen copy; no toggle/native change; D-03 rewrote the old toggle requirement. |
| REQ-SET-02 | 02, 03 | Auto-connect toggle persisted in Drift | ✓ SATISFIED | Store + `AutoConnectRow` writer + one-shot listener; on-device biometric/migration checks human-only. |
| REQ-SET-03 | 03 | Referral link copy with one prefix | ✓ SATISFIED | Own-row ensure + `referralUrl`; live NULL-code row human-only. |
| REQ-SET-04 | 02, 03 | Reset Demo clears local stores, no server effect | ✓ SATISFIED | Local-only function + confirm UI row + zero-outbound tests; on-device biometric check human-only. |
| REQ-SET-05 | 03, 05 | Read-only network chip; real change invalidates ping cache | ✓ SATISFIED | Real labels/icons, no tap; injected-stream invalidation test; D-07 forbids the roadmap toggle. |
| REQ-NOTIF-01 | 04 | Local expiry reminders T-7/T-3/T-1, deep-link to shop | ✓ SATISFIED (code) | Scheduler/listener/source checks + unit tests; OS delivery and permission dialog human-only. |
| REQ-NOTIF-02 | 04 | FCM token registration | ↳ DEFERRED (D-08) | No Firebase project/credentials/route; explicit opt-out in COVERAGE.md and STATE.md; no fake token or route. Owner decision required. |
| REQ-BE-06 | 01 | `GET`/`DELETE /api/mobile/devices` via ARTEMIDA | ✓ SATISFIED | Both routes + 29 backend vectors; ownership join and stable envelopes. |
| REQ-SUB-04 | 01, 03 | Device-limit enforcement (phase-21 deferral closed) | ✓ SATISFIED | Server `deviceLimit` drives the UI; integer boundary tests. |
| REQ-SUB-05 | 03 | Subscription-link copy in profile (phase-21 deferral closed) | ✓ SATISFIED | `ReferralRow` + `DevicesSheet` use the existing clipboard seam and frozen toast; shop copy inherited. |

No orphaned requirement: the union of the five PLAN `requirements:` fields equals the phase ID set
(REQ-DEV-01..04, REQ-SET-01..05, REQ-NOTIF-01/02, REQ-BE-06, REQ-SUB-04/05).

### Decision Coverage

`gsd-tools query check.decision-coverage-verify` returned **9/9 honored, 0 not honored**:
"All trackable CONTEXT.md decisions are honored by shipped artifacts." Non-blocking gate; no status impact.

### Test Quality Audit

| Test group | Linked requirements | Skipped | Circular | Assertion level | Verdict |
|------------|--------------------|---------|----------|-----------------|---------|
| 2 backend vitest files | BE-06, DEV-01/02/03/04, SUB-04/05, SET-01/03 | 0 | none | value + behavioral (auth, zod, ownership, secrecy) | ✓ PASS |
| `deferred_delete_test.dart` + `deferred_delete_failure_test.dart` | DEV-02 | 0 | none | behavioral (fakeAsync clock, double tick, refresh, failure) | ✓ PASS |
| `device_limit_test.dart` | DEV-04, SUB-04 | 0 | none | value boundaries | ✓ PASS |
| `auto_connect_test.dart`, `auto_connect_row_test.dart` | SET-02 | 0 | none | behavioral (persistence, single-fire, gating, one write) | ✓ PASS |
| `reset_demo_test.dart`, `reset_row_test.dart` | SET-04 | 0 | none | behavioral (full clear, verifyNever Dio, one nav) | ✓ PASS |
| scheduler + listener tests | NOTIF-01 | 0 | none | value + behavioral (instants, past skip, retry) | ✓ PASS |
| `notification_status_row_test.dart` | NOTIF-01 / CR-01 | 0 | none | behavioral (granted/denied/re-request) | ✓ PASS |
| `profile_sheet`, `referral_row`, `pool_toolbar`, `logout_row`, `accessibility`, `theme` widget tests | DEV-01/03, SET-01/03/05, SUB-05 | 0 | none | behavioral (rows, labels, semantics, contrast, scale) | ✓ PASS |

Disabled tests on requirements: **0**. Circular patterns: **0**. Insufficient assertions: **0**.
`Color.computeLuminance()` contrast assertions are independent numeric checks, not generated expectations.

### Anti-Patterns Found

| File / area | Pattern | Severity | Impact |
|-------------|---------|----------|--------|
| All phase-22 implementation files | `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`, empty implementations, hardcoded empty data feeding UI | ℹ️ none found | No debt-marker blocker. |
| `main.dart:75-89` `AppTextScalePolicy` | Pass-through `MediaQuery` wrapper (22-REVIEW IN-01) | ℹ️ Info | Intentional test seam after removing the clamp; documented in code. |
| `profile_sheet.dart` identity/summary, spacing, type scale | UI-fidelity items from 22-UI-REVIEW not addressed (no 22-UI-SPEC.md) | ⚠️ Warning | Visual parity moved to human UAT; not behaviorally blocking and not in Phase-22 must_haves. |
| `mobile/` analyzer | ~1916 pre-existing info lints | ℹ️ Info | Baseline; `--no-fatal-infos --no-fatal-warnings` exits 0. |
| Working tree (44+ unrelated web/admin edits) | Out-of-phase changes cause unrelated backend suite failures | ⚠️ Warning (out of phase) | Targeted phase suites were run instead; no Dart change can affect those suites. |

All six findings in `22-REVIEW.md` and all seven in `22-UI-REVIEW.md` that were marked fixed are present
in code and covered by passing tests (`3711ac1`, `bed437b`, `37774c0`, `77d0bc5`, `054a0f5`, `f2cfed6`,
`6434d5c`, `bb71132`, `085147d`, `11a7863`, `258add5`, `a7b9477`).

### Human Verification Required

See the frontmatter `human_verification` list for the structured items. Summary:

1. **Live ARTEMIDA devices / deferred delete** — paid key required; mocks cannot prove provider behavior.
2. **Auto-connect with real biometric resume + tunnel** — device timing/prompt required.
3. **On-disk Drift v1→v2 migration** — not exercised against a real v1 file.
4. **No biometric resurrection after Reset Demo** — OS keystore behavior required.
5. **Live NULL referral code on a production user** — ensure path only mock-tested.
6. **On-device network change / ping invalidation** — injected stream only.
7. **OS notification delivery, reboot, permission dialog** — OS alarms/dialogs are not unit-testable.
8. **Visual parity with prototype** — no screenshot/browser MCP; remaining fidelity items need a UI contract.
9. **Live screen-reader pass** — Semantics nodes exist but TalkBack/VoiceOver output needs a device.
10. **FCM owner decision (D-08)** — external blocker; no credentials or backend route.
11. **Inherited phase-19/20/21 UAT** — live-key/native/payment items owned by earlier phases.

### Gaps Summary

No gaps. Every consolidated must-have, artifact, key link and data flow is satisfied in the working tree;
the five post-review fix sets are present and tested. Status is `human_needed` solely because the phase is
user-facing and its external, device and visual acceptance items (plus the D-08 FCM owner decision)
cannot be executed in this environment — none was faked or simulated. ROADMAP task text that contradicts
locked decisions is a deliberate, documented reinterpretation, not an unmet acceptance criterion.

---

_Verified: 2026-11-28T11:58:08Z_
_Verifier: the agent (gsd-verifier)_
