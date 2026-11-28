---
phase: 22-devices-settings-polish-5-days
plan: 04
subsystem: notifications
tags: [flutter, flutter_local_notifications, timezone, zonedSchedule, riverpod, android, ios, local-notifications]

requires:
  - phase: 22-devices-settings-polish-5-days
    provides: "22-01/22-02 established the app-level listener pattern and the server-authoritative subscription provider used by the expiry listener"
provides:
  - "Local T-7/T-3/T-1 expiry reminders from the server expiresAt with past-instant skip and cancel-before-reschedule"
  - "One-time plugin/timezone initialization with a fakeable dispatcher seam and navigation-only tap payload"
  - "Additive Android receivers/permissions and iOS notification delegate registration with the VPN channel untouched"
  - "REQ-NOTIF-02 (FCM) explicitly deferred with reason; no fake token or backend route"
affects: [push-notifications, subscription, shop-navigation, android-manifest, ios-appdelegate]

actuals:
  tokens: 6201
  tasks: 3
  commits: 2

tech-stack:
  added:
    - "flutter_local_notifications 23.0.4 (exact stable pin, human-verified)"
    - "timezone 0.11.2 (direct dependency, ^0.11.x family)"
  patterns:
    - "Fakeable plugin seam (LocalNotificationDispatcher) keeps unit tests off platform channels"
    - "Absolute TZDateTime instants derived only from the server expiresAt; OS is the sole scheduler"
    - "Navigation-only marker payload; a tap can never become payment or entitlement proof"

key-files:
  created:
    - mobile/lib/core/notifications/local_notifications.dart
    - mobile/lib/core/notifications/expiry_scheduler.dart
    - mobile/lib/core/notifications/expiry_notification_listener.dart
    - mobile/test/unit/core/notifications/expiry_scheduler_test.dart
  modified:
    - mobile/pubspec.yaml
    - mobile/pubspec.lock
    - mobile/lib/main.dart
    - mobile/android/app/src/main/AndroidManifest.xml
    - mobile/ios/Runner/AppDelegate.swift

key-decisions:
  - "D-09 blocking-human package gate: user explicitly confirmed flutter_local_notifications stable 23.0.4 (publisher dexterx.dev, github.com/MaikuB/flutter_local_notifications, SDK ^3.12.0 / Flutter >=3.44.0) and direct timezone ^0.11.x before any install; no beta or substitute was used."
  - "REQ-NOTIF-02/FCM stays deferred by D-08: no Firebase project, credentials or backend token route exist; no fake token or token route was added."
  - "timezone 0.11.2 moved initializeTimeZones() into package:timezone/data/latest.dart; imported that bundled data library instead of a newer/different package."
  - "FLN 23.x named-argument signatures verified against the installed 23.0.4 source before writing zonedSchedule/initialize calls."
  - "The tap callback is a pure function over a router seam, so navigation-only behavior is unit-testable without GoRouter or platform channels."

patterns-established:
  - "App-level always-on listeners watched once in App.build with subscription close on dispose (mirrors paymentResumeListenerProvider)"
  - "Cancel all stable reminder ids before every reschedule; skip instants before the current instant"
  - "Fixed Russian notification copy with no expiry instant, link, token or amount interpolated into body/payload/logs"

requirements-completed: [REQ-NOTIF-01]

coverage:
  - id: D1
    description: "Three absolute local reminders at T-7/T-3/T-1 from the server expiresAt, with past-instant skip and stable-id cancel-before-reschedule"
    requirement: REQ-NOTIF-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/notifications/expiry_scheduler_test.dart#schedules exactly three future instants at T-7/T-3/T-1"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/notifications/expiry_scheduler_test.dart#skips instants already in the past"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/notifications/expiry_scheduler_test.dart#cancels prior reminders before rescheduling, with no duplicates"
        status: pass
    human_judgment: false
  - id: D2
    description: "Navigation-only payload and tap handling; no link, token, amount or payment effect crosses the boundary"
    requirement: REQ-NOTIF-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/notifications/expiry_scheduler_test.dart#payload is navigation-only; no link, token or expiry leaks"
        status: pass
      - kind: unit
        ref: "mobile/test/unit/core/notifications/expiry_scheduler_test.dart#tap opens shop only for the navigation marker"
        status: pass
    human_judgment: false
  - id: D3
    description: "On-device reminder firing with the app killed, reboot receiver behavior and iOS permission prompt"
    requirement: REQ-NOTIF-01
    verification: []
    human_judgment: true
    rationale: "Alarm and OS delivery behavior cannot be proven by unit tests or the analyzer; 22-VALIDATION.md records this as manual-only UAT."
  - id: D4
    description: "REQ-NOTIF-02 FCM token registration accounted for as deferred, not stubbed"
    requirement: REQ-NOTIF-02
    verification:
      - kind: other
        ref: "grep -q flutter_local_notifications:23.0.4 pubspec.yaml && ! grep -q firebase_ pubspec.yaml"
        status: pass
    human_judgment: true
    rationale: "Owner decision required once Firebase credentials and a backend token route exist (D-08); no code path exists to verify automatically."

duration: 13min
completed: 2026-11-28
status: complete
---

# Phase 22-devices-settings-polish-5-days Plan 04: Local Expiry Reminders Summary

**Server-authoritative T-7/T-3/T-1 local expiry reminders via FLN 23.0.4 with a one-time plugin seam, navigation-only payload, additive Android/iOS setup, and FCM explicitly deferred**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-28T10:29:33Z
- **Completed:** 2026-11-28T10:42:49Z
- **Tasks:** 3 (blocking-human gate + tracer + additive native setup)
- **Files modified:** 9

## Accomplishments

- Human verified the exact package identity at a `blocking-human` gate before any install; `flutter pub add flutter_local_notifications:23.0.4 timezone` resolved only the approved pins (timezone 0.11.2), with no beta or substitute.
- `ExpiryScheduler` parses `/api/mobile/subscription` `expiresAt`, computes three absolute `TZDateTime` instants (T-7/T-3/T-1), skips past instants and cancels all stable ids before every reschedule.
- One-time plugin and timezone initialization with a fakeable dispatcher seam; the notification payload is the single marker `shop`, and a tap only calls `go('/shop')` — never a payment, entitlement or key-issuing path.
- App-level listener watches subscription expiry once for the app lifetime, dedupes identical expiries and closes its subscription on dispose; wired in `main.dart` beside the existing listeners.
- Android declares the FLN scheduled/boot receivers plus POST_NOTIFICATIONS, VIBRATE, SCHEDULE_EXACT_ALARM and RECEIVE_BOOT_COMPLETED outside the VPN service block; iOS registers `UNUserNotificationCenter.delegate`. The VPN channel id `3set-vpn`, FSM, kill switch and OnDemand rules are untouched.
- REQ-NOTIF-02 is recorded as deferred (D-08): no Firebase SDK, credential file, fabricated token or backend token route exists.

## Task Commits

Each task was committed atomically:

1. **Task 1: blocking-human package legitimacy gate** — approved by the human; no code commit (recorded as a decision below).
2. **Task 2: end-to-end local expiry reminder (tracer)** — `33bc33a` (feat)
3. **Task 3: additive Android and iOS notification setup** — `51f3e4a` (feat)

**Plan metadata:** final docs commit created after this summary (SUMMARY/STATE/ROADMAP).

## Files Created/Modified

- `mobile/pubspec.yaml` / `mobile/pubspec.lock` — exact pins and resolved dependencies for the two approved packages.
- `mobile/lib/core/notifications/local_notifications.dart` — one-time init, dedicated expiry channel, fakeable dispatcher, navigation-only tap handler.
- `mobile/lib/core/notifications/expiry_scheduler.dart` — three absolute instants from server expiry, past skip, cancel-before-reschedule.
- `mobile/lib/core/notifications/expiry_notification_listener.dart` — app-level expiry watcher with dedupe and dispose cleanup.
- `mobile/lib/main.dart` — watches the expiry listener once at startup.
- `mobile/android/app/src/main/AndroidManifest.xml` — additive notification permissions and FLN receivers.
- `mobile/ios/Runner/AppDelegate.swift` — notification center delegate registration, no remote-push setup.
- `mobile/test/unit/core/notifications/expiry_scheduler_test.dart` — six Wave 0 tests for instants, past skip, reschedule, payload safety and tap filtering.

## Decisions Made

- Accepted the human's explicit approval of `flutter_local_notifications` 23.0.4 and direct `timezone` ^0.11.x at the blocking-human gate; installed only that pin and verified the resolved versions from pub.dev output.
- Used the installed 23.0.4 package source as the authority for `initialize` and `zonedSchedule` named-argument signatures instead of relying on research snippets.
- Kept package-style imports in the new Dart files to match the surrounding `core/` code, accepting the non-fatal `prefer_relative_imports` infos.
- Marked only REQ-NOTIF-01 complete; REQ-NOTIF-02 remains explicitly deferred rather than being falsely closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `initializeTimeZones()` is not exported by the main timezone library in 0.11.2**
- **Found during:** Task 2 (first automated verify run)
- **Issue:** The research snippet and initial code called `tz.initializeTimeZones()` from `package:timezone/timezone.dart`, which no longer defines it in the resolved 0.11.2; `flutter analyze` reported two undefined-function errors.
- **Fix:** Imported `package:timezone/data/latest.dart` as `tzdata` and called `tzdata.initializeTimeZones()` in the startup provider and test setup — no different version or substitute package.
- **Files modified:** `mobile/lib/core/notifications/local_notifications.dart`, `mobile/test/unit/core/notifications/expiry_scheduler_test.dart`
- **Verification:** `flutter analyze --no-fatal-infos --no-fatal-warnings` exits 0 with zero errors; all six scheduler tests pass.
- **Committed in:** `33bc33a` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Correctness fix for the exact approved dependency version; no scope creep and no package substitution.

## Issues Encountered

- The initial analyzer run surfaced 1,876 pre-existing infos/warnings across the project (including `prefer_relative_imports` in older files). They are unrelated to this plan and were left untouched; the plan's verify command treats them as non-fatal and exits 0.
- No authentication gates, resolution failures, skipped tests or unrun verification steps occurred.

## User Setup Required

None for local reminders — no credentials or external service configuration is needed. The deferred FCM scope (REQ-NOTIF-02) would require Firebase project credentials and a backend token registration route before it can be scoped as a future task; this is an owner decision recorded in D-08, not a setup step for this plan.

## Known Stubs

None. No placeholder, fake token, simulated notification or empty data path was introduced; REQ-NOTIF-02 is an explicit deferral, not a code stub.

## Next Phase Readiness

- The local expiry path is shippable: scheduling logic, payload safety and native source setup are verified by unit tests, analyzer and source checks.
- Manual-only UAT remains: on-device firing with the app killed, reboot behavior and the iOS permission prompt (recorded in `22-VALIDATION.md`).
- REQ-NOTIF-02 stays an external debt; if credentials appear it should be a separately scoped task, not a silent addition to this phase.

## Self-Check: PASSED

- All 4 created implementation/test files and the SUMMARY file exist on disk.
- Both task commits (`33bc33a`, `51f3e4a`) are present in git history.
- Final verify chain: pin check + analyzer + source-level native checks + 6/6 scheduler tests passed.

---
*Phase: 22-devices-settings-polish-5-days*
*Completed: 2026-11-28*
