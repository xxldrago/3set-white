---
phase: 22-devices-settings-polish-5-days
fixed_at: 2026-11-28T11:34:22Z
review_path: .planning/phases/22-devices-settings-polish-5-days/22-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-11-28T11:34:22Z
**Source review:** `.planning/phases/22-devices-settings-polish-5-days/22-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 Critical, 5 Warning; `IN-01` is Info and out of scope)
- Fixed: 6
- Skipped: 0
- Verification environment: **main checkout** (not an isolated worktree — the
  working tree contains unrelated user edits outside `mobile/`; only phase-22
  mobile files were staged per fix).

## Fixed Issues

### CR-01: Android 13+ notification permission is declared but never requested — reminders never display

**Files modified:** `mobile/lib/core/notifications/local_notifications.dart`,
`mobile/lib/features/profile/profile_sheet.dart`,
`mobile/test/unit/core/notifications/expiry_scheduler_test.dart`,
`mobile/test/widget/features/profile/notification_status_row_test.dart` (new)
**Commit:** `3711ac1`
**Status:** fixed: requires human verification (real-device OS permission
dialog / alarm delivery cannot be exercised in a widget test)
**Applied fix:** Extended the fakeable `LocalNotificationDispatcher` seam with
`requestNotificationsPermission()` and `notificationsEnabled()`; the real
implementation resolves `AndroidFlutterLocalNotificationsPlugin` and uses the
already-installed `flutter_local_notifications:23.0.4` API (no new package,
no version change). `initialize()` now requests the runtime grant once and
caches the future. Added a read-only Russian «Уведомления о сроке подписки»
status row with a "Разрешить" re-request affordance and frozen copy. Tests
cover granted/denied states and the re-request path.

### WR-01: Failed deferred DELETE leaves an unhandled async error, no user notice, and a permanently dimmed row

**Files modified:** `mobile/lib/features/profile/devices/devices_sheet.dart`,
`mobile/lib/features/profile/devices/deferred_delete_controller.dart`,
`mobile/test/widget/features/profile/devices/deferred_delete_failure_test.dart` (new)
**Commit:** `77d0bc5`
**Applied fix:** The `onDelete` callback now catches any BFF failure, shows the
frozen Russian notice «Не удалось отключить устройство», and invalidates
`devicesProvider` + rebuilds in `finally`, clearing the pending row. The
controller consumes the error (`then(..., onError:)`) so `unawaited` can no
longer produce an unhandled async exception. `_notice` hides the stale undo
SnackBar first so the newer outcome is never queued behind it. Added a widget
test where the DELETE throws: notice shown, no pending row, list refetched.

### WR-02: Undo SnackBar is not tied to the 5-second undo window

**Files modified:** `mobile/lib/features/profile/devices/devices_sheet.dart`,
`mobile/lib/features/profile/devices/deferred_delete_controller.dart`,
`mobile/test/widget/features/profile/profile_sheet_test.dart`,
`mobile/test/widget/features/profile/devices/deferred_delete_failure_test.dart`
**Commit:** `054a0f5`
**Applied fix:** `SnackBar(duration: _controller.window)` so «Вернуть» stays
available for the whole locked window. Premature past-tense copy replaced with
«Отключение…» on both the row and the snackbar until the provider confirms;
added `onDeleteCompleted` to the controller so «Устройство отключено» is only
shown after a successful fired DELETE. Test asserts the 5s duration and that
the completed copy waits for the BFF.

### WR-03: Expiry scheduling races plugin initialization and permanently consumes a failed attempt

**Files modified:** `mobile/lib/core/notifications/local_notifications.dart`,
`mobile/lib/core/notifications/expiry_notification_listener.dart`,
`mobile/test/unit/core/notifications/expiry_notification_listener_test.dart` (new)
**Commit:** `f2cfed6`
**Status:** fixed: requires human verification (real platform-channel timing
is not reproducible in unit tests)
**Applied fix:** `localNotificationsReadyProvider` now returns the cached
`Future<void>` instead of an eager `true`. `apply()` awaits that future before
touching `zonedSchedule`, and only sets `hasScheduled`/`lastExpiry` *after*
`scheduleFromServerExpiry` succeeds, so a transient failure stays retryable.
T-7/T-3/T-1 offsets, past-instant skipping and cancel-before-reschedule remain
in `ExpiryScheduler` and are still covered by the existing scheduler tests.
New tests prove no channel call before init completes and that a failed
schedule is retried on a later emission.

### WR-04: `deviceCapacity` defaults a missing `deviceLimit` to 0, showing a false "limit reached" state

**Files modified:** `mobile/lib/features/profile/devices/devices_sheet.dart`,
`mobile/test/widget/features/profile/profile_sheet_test.dart`
**Commit:** `6434d5c`
**Applied fix:** Capacity is only computed when the subscription has a loaded,
`ok` value with a real `deviceLimit`. While loading/errored, no limit claim and
no add/upgrade handoff are rendered (the paid upgrade is also gated on a
loaded subscription), while the device list still renders from its own
provider. Added widget tests for both the loading and errored states.

### WR-05: Reset row passes a `BuildContext` across async gaps into the navigation callback

**Files modified:** `mobile/lib/features/profile/settings/reset_row.dart`,
`mobile/lib/core/settings/reset_demo.dart`,
`mobile/test/widget/features/profile/reset_row_test.dart`
**Commit:** `bb71132`
**Applied fix:** `ResetNavigation` is now `void Function()`; the default
provider resolves `routerProvider` eagerly and returns `() => router.go("/auth")`.
`_confirmAndReset` captures that seam before the async reset, so no widget
context crosses `resetDemo`'s storage/table awaits. Removed two pre-existing
unused imports in the touched file. Added a test that invokes the captured
callback after the whole widget tree is disposed.

## Skipped Issues

None.

## Verification

| Gate | Result |
|------|--------|
| `dart run build_runner build --delete-conflicting-outputs` | PASS (69 outputs, no source-model changes) |
| `flutter analyze --no-fatal-infos --no-fatal-warnings` | PASS (exit 0; only pre-existing warnings in `analysis_options.yaml` and `test/unit/features/devices/deferred_delete_test.dart` — neither touched here) |
| `flutter test` | PASS — 398 tests, all green |
| `npx vitest run tests/unit/mobile-devices-route.test.ts` | PASS — 16/16 |
| `npx vitest run tests/unit` | 75/103 files pass; 138 failures are all in web/admin TS suites untouched by this phase (the checkout carries unrelated in-progress user edits there). No Dart change can affect these. |

Ran in the **main checkout** (no worktree): numbers are reproducible from the
current tree. The two planning reports were written but intentionally not
committed.

---

_Fixed: 2026-11-28T11:34:22Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
