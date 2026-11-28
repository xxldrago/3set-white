---
phase: 22-devices-settings-polish-5-days
fixed_at: 2026-11-28T11:34:22Z
review_path: .planning/phases/22-devices-settings-polish-5-days/22-UI-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 22: UI Review Fix Report

**Fixed at:** 2026-11-28T11:34:22Z
**Source review:** `.planning/phases/22-devices-settings-polish-5-days/22-UI-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (3 BLOCKER-class priority fixes + 4 warnings explicitly
  requested by the orchestrator)
- Fixed: 7
- Skipped: 0
- Verification environment: **main checkout** (only phase-22 mobile files were
  staged per fix; the checkout's unrelated web/admin edits were left untouched).

## Fixed Issues

### Top Fix 1 (BLOCKER): auto-connect preference has no UI writer

**Files modified:** `mobile/lib/features/profile/profile_sheet.dart`,
`mobile/test/widget/features/profile/auto_connect_row_test.dart` (new),
`mobile/test/widget/features/profile/profile_sheet_test.dart`
**Commit:** `bed437b`
**Applied fix:** Added `AutoConnectRow` to the «Настройки» section: a
`SwitchListTile` with a frozen Russian `Semantics` label, seeded asynchronously
from `autoConnectStoreProvider.readAutoConnect()` and read-only until loaded
(so a default `false` can never overwrite a stored `true`). Each toggle calls
`setAutoConnect` exactly once; a local storage failure reverts the optimistic
value. Widget tests prove seeded state, one write per toggle, read-only-before-
load, and that the one-shot launch listener connects when the same persisted
store holds `true`.

### Top Fix 2 (BLOCKER): local expiry reminders never permission-gated on Android 13+

**Files modified:** `mobile/lib/core/notifications/local_notifications.dart`,
`mobile/lib/features/profile/profile_sheet.dart`,
`mobile/test/unit/core/notifications/expiry_scheduler_test.dart`,
`mobile/test/widget/features/profile/notification_status_row_test.dart` (new)
**Commit:** `3711ac1`
**Status:** fixed: requires human verification (OS dialog / alarm delivery is
manual UAT)
**Applied fix:** Same change as code-review `CR-01` — runtime `POST_NOTIFICATIONS`
request through the installed `flutter_local_notifications` plugin API plus a
visible Russian permission status row with a re-request action. No new
package, no FCM route/token, navigation-only payload unchanged.

### Top Fix 3 (BLOCKER): no logout affordance in the mobile client

**Files modified:** `mobile/lib/features/profile/settings/logout_row.dart` (new),
`mobile/lib/features/profile/profile_sheet.dart`,
`mobile/test/widget/features/profile/logout_row_test.dart` (new)
**Commit:** `37774c0`
**Applied fix:** Added a danger-styled («Выйти из аккаунта», `AppTheme.red`)
row at the bottom of the profile sheet with confirm-then-call semantics.
`logoutCallProvider` delegates only to the existing `authNotifier.logout()`;
`logoutNavigationProvider` is router-backed (no BuildContext across the await).
Widget test asserts one logout call, one `/auth` handoff and zero provider/device
deletes. Reset Demo remains a distinct, honestly labelled local action.

### Warning: tappable copy/reset rows are not marked as buttons

**Files modified:** `mobile/lib/features/profile/settings/referral_row.dart`,
`mobile/lib/features/profile/settings/reset_row.dart`,
`mobile/test/widget/features/profile/referral_row_test.dart`,
`mobile/test/widget/features/profile/reset_row_test.dart`
**Commit:** `085147d`
**Applied fix:** Wrapped both `_CopyAction`'s `InkWell` and the reset `InkWell`
in `Semantics(button: true, label: <frozen Russian label>)` while preserving
the visible labels. Added widget assertions that TalkBack/VoiceOver see button
semantics for all three tappable rows.

### Warning: network chip icon contradicts its label

**Files modified:** `mobile/lib/features/servers/widgets/pool_toolbar.dart`,
`mobile/lib/features/profile/profile_sheet.dart`,
`mobile/test/widget/features/servers/pool_toolbar_test.dart`
**Commit:** `11a7863`
**Applied fix:** Added pure `networkIconForLabel`: LTE → `signal_cellular_alt`,
Ethernet → `settings_ethernet`, Wi-Fi → `wifi`, Нет сети → `wifi_off`. Both
`NetworkStatusRow` and `PoolToolbar` now use it; the chips stay read-only with
no tap handler (D-07/D-11 preserved). Test drives real label transitions.

### Warning: header avatar identity is fabricated

**Files modified:** `mobile/lib/features/servers/widgets/main_header.dart`,
`mobile/test/widget/app/accessibility_test.dart`
**Commit:** `258add5`
**Applied fix:** Replaced the hardcoded «А» with a pure `avatarInitial` derived
from the already-passed real greeting name. When only the generic «друг»
fallback is available, a neutral `person_outline` icon is shown instead of
inventing an identity letter. Added unit + widget coverage.

### Warning: device list has no loading feedback and no error recovery

**Files modified:** `mobile/lib/features/profile/devices/devices_sheet.dart`,
`mobile/test/widget/features/profile/profile_sheet_test.dart`
**Commit:** `a7b9477`
**Applied fix:** Loading now renders a compact `CircularProgressIndicator`
instead of `SizedBox.shrink()`; errors keep the frozen mapped notice and gain
a «Повторить» `TextButton` that invalidates `devicesProvider`. Tests cover the
in-flight spinner and a failing read that succeeds after retry.

## Relatedly addressed (from the code-review scope)

- «Увеличить лимит» is no longer rendered while the subscription is unknown
  (`6434d5c`, WR-04), tightening the "paid upgrade before it can work" warning.
- The logout confirm button uses `AppTheme.red` rather than lime, addressing
  the missing destructive/danger styling for this new destructive action.

## Not addressed (out of the requested scope)

Remaining UI-review observations — subscription summary card, explicit sheet
close button, identity-card gradient treatment, primary-row label token,
type/style breadth, 10px chip copy, section-header hierarchy, and the page
inset/gap scales — are visual-fidelity/token items that need a UI contract
(no `22-UI-SPEC.md` exists). They were not part of the orchestrator's requested
fix list and were deliberately left untouched.

## Verification

| Gate | Result |
|------|--------|
| `dart run build_runner build --delete-conflicting-outputs` | PASS |
| `flutter analyze --no-fatal-infos --no-fatal-warnings` | PASS (no errors/warnings in changed files; 2 pre-existing warnings elsewhere) |
| `flutter test` | PASS — 398 tests, all green |
| `npx vitest run tests/unit/mobile-devices-route.test.ts` | PASS — 16/16 |

Ran in the **main checkout**. Visual-runtime parity, on-device TalkBack and OS
alarm delivery remain manual UAT (already recorded in `22-VALIDATION.md`).

---

_Fixed: 2026-11-28T11:34:22Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
