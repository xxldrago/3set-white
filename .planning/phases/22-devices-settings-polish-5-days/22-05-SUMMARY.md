---
phase: 22-devices-settings-polish-5-days
plan: 05
subsystem: ui
tags: [flutter, accessibility, dynamic-type, wcag-aa, semantics, exclude-from-semantics, dark-theme, widget-tests]

requires:
  - phase: 22-devices-settings-polish-5-days
    provides: 22-01 device rows, 22-02 settings persistence, 22-03 dark profile/settings rows and 22-04 subscription expiry source consumed here
  - phase: 21-subscription-purchase-7-days
    provides: confetti and days/30 ring from real CONFIRMED/provisioned state; animation behavior preserved
provides:
  - Text-scale policy that passes the platform TextScaler through unchanged (200% renders at 200%)
  - AA-compliant dark secondary text token (dim 5.42:1 on surface, 5.00:1 on surface2, 4.61:1 on surface3)
  - Frozen Russian Semantics labels on all icon-only pool-header actions and readable kill-switch/device-row announcements
  - Decorative confetti and ring CustomPainters excluded from the semantics tree without hiding the day-count state
  - Two Wave 0 accessibility widget suites covering scale, contrast, labels and exclusion
affects:
  - 22-VALIDATION.md (manual visual/screen-reader parity remains), future UI plans (inherit the AA token and text-scale policy)

actuals:
  tokens: 4111
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - AppTextScalePolicy: a pass-through MediaQuery wrapper replaces the 0.8-1.3 text scale clamp, testable without booting router/listeners
    - WCAG contrast asserted from Color.computeLuminance() on every dark card surface in the palette test
    - ExcludeSemantics wraps decorative CustomPainters while informational Semantics labels stay announced
    - Frozen Russian labels on icon-only controls; never a device token, subscription link or provider text

key-files:
  created:
    - mobile/test/widget/app/accessibility_test.dart
  modified:
    - mobile/lib/app/theme.dart
    - mobile/lib/main.dart
    - mobile/lib/features/servers/widgets/main_header.dart
    - mobile/lib/features/shop/painting/confetti_overlay.dart
    - mobile/lib/features/shop/painting/ring_painter.dart
    - mobile/test/widget/app/theme_test.dart

key-decisions:
  - "Removed the 0.8-1.3 upper bound entirely instead of raising it: the platform TextScaler is carried through AppTextScalePolicy unchanged, so 200% system text is genuinely 200% (T-22-27)."
  - "The research's word 'darken' for the failing dim token was interpreted as 'raise contrast': on dark surfaces luminance must increase. dim moved from 0xFF6f8272 (4.24:1 / 3.92:1) to 0xFF829486 (5.42:1 / 5.00:1), still clearly subordinate to muted (T-22-28)."
  - "Icon-only help/shop/refresh/profile actions carry explicit frozen Russian Semantics labels; the kill switch stays a read-only text row with no Switch, and device-row labels reuse the honest display name (T-22-29)."
  - "Decorative confetti and days-ring painters are wrapped in ExcludeSemantics; the ring's 'N дней осталось' label is deliberately preserved so excluding art never hides real state (T-22-30)."
  - "The tracer slice's full automated verify re-ran green after its commit before expansion; no checkpoint task exists in this plan."

patterns-established:
  - "Contrast tokens are verified numerically in widget tests, not asserted by a visual report."
  - "Dynamic-type policy lives in one small widget so a forced MediaQuery can prove the resolved scale without booting app-level listeners."

requirements-completed: [REQ-DEV-01, REQ-SET-01, REQ-SET-05]

coverage:
  - id: D1
    description: "A 200% platform text scale reaches the profile/device/settings text block unclamped, without overflow"
    requirement: REQ-DEV-01
    verification:
      - kind: widget
        ref: "mobile/test/widget/app/accessibility_test.dart#a 200% platform text scale reaches text unclamped"
        status: pass
    human_judgment: false
  - id: D2
    description: "Secondary/dim text token clears WCAG AA 4.5:1 on both dark card surfaces and resolves on small text styles"
    requirement: REQ-SET-01
    verification:
      - kind: widget
        ref: "mobile/test/widget/app/theme_test.dart#secondary text tokens clear WCAG AA 4.5:1 on dark cards"
        status: pass
      - kind: widget
        ref: "mobile/test/widget/app/accessibility_test.dart#small text tokens are the AA token, not the prototype gray"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every icon-only pool-header action carries a frozen Russian Semantics label with no leaked link or token"
    requirement: REQ-SET-05
    verification:
      - kind: widget
        ref: "mobile/test/widget/app/accessibility_test.dart#every icon-only pool header action has a Russian label"
        status: pass
    human_judgment: false
  - id: D4
    description: "Kill-switch status and device rows are announced and remain read-only/non-toggleable"
    requirement: REQ-SET-01
    verification:
      - kind: widget
        ref: "mobile/test/widget/app/accessibility_test.dart#kill switch and device rows are announced, never interactive"
        status: pass
    human_judgment: false
  - id: D5
    description: "Confetti and ring painters add no semantics node after a real CONFIRMED transition while the day count stays announced"
    requirement: REQ-SET-05
    verification:
      - kind: widget
        ref: "mobile/test/widget/app/accessibility_test.dart#confetti on a real CONFIRMED edge adds no semantics node"
        status: pass
      - kind: widget
        ref: "mobile/test/widget/app/accessibility_test.dart#the days ring excludes its painter but announces the count"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual parity with the dark prototype and a live screen-reader pass on a device"
    verification: []
    human_judgment: true
    rationale: "No screenshot/browser MCP and no device screen reader available; 22-VALIDATION.md records this as manual-only UAT."

duration: 11 min
completed: 2026-11-28
status: complete
---

# Phase 22 Plan 05: Accessibility & Dark Theme Polish Summary

**Platform dynamic type restored to a true 200% via a pass-through AppTextScalePolicy, dark card text raised to WCAG AA, and Semantics labels/painter exclusions proven by widget tests**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-28T10:45:38Z
- **Completed:** 2026-11-28T10:56:36Z
- **Tasks:** 2 of 2 (tracer accessibility slice, then label/exclusion expansion)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- Removed the 0.8–1.3 text-scale clamp: `AppTextScalePolicy` passes the platform `TextScaler` through unchanged, and a forced 200% `MediaQuery` proves a 16px label resolves to 32px with no overflow. `ThemeMode.dark`, `AppTheme.dark` and all app-level listeners are unchanged.
- Raised `AppTheme.dim` from `0xFF6f8272` to `0xFF829486`, moving the small-text token from 4.24:1 / 3.92:1 (failing AA) to 5.42:1 on `surface` and 5.00:1 on `surface2` (4.61:1 on `surface3`), still visually below `muted`. The palette test computes every ratio.
- Added explicit frozen Russian `Semantics` labels to the help, shop, refresh and profile icon actions on the pool header, including the profile entry that opens the plan-01 sheet; labels never carry a link, token or provider text.
- Confirmed the read-only kill-switch copy and device-row remove labels are announced, with no `Switch` or new interactive control introduced.
- Wrapped the confetti overlay and the days/30 ring `CustomPaint` in `ExcludeSemantics`, preserving the phase-21 animation and keeping the real «N дней осталось» state announced.
- Verified end to end: build_runner success, `flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0 with no errors/warnings in 22-05 files, focused suites 16/16 and full `flutter test` 378/378.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end accessibility path — one theme at real text scale** (tracer) - `755c2df` (feat)
2. **Task 2: Semantics labels and decorative painter exclusion** - `e3d6e20` (feat)

**Plan metadata:** recorded in the final docs commit.

_Note: the tracer feedback gate re-ran the full automated `<verify>` (build_runner → analyze → both focused suites) green after the task-1 commit, so expansion proceeded without an added checkpoint._

## Files Created/Modified

- `mobile/lib/main.dart` — `AppTextScalePolicy` replaces the clamped `MediaQuery` builder; listeners and dark theme untouched.
- `mobile/lib/app/theme.dart` — AA-compliant `dim` token with the contrast rationale in its doc comment.
- `mobile/lib/features/servers/widgets/main_header.dart` — explicit labelled Semantics wrappers on four icon-only actions.
- `mobile/lib/features/shop/painting/confetti_overlay.dart` — confetti `CustomPaint` wrapped in `ExcludeSemantics`.
- `mobile/lib/features/shop/painting/ring_painter.dart` — decorative arc excluded from semantics; day-count label/Text preserved.
- `mobile/test/widget/app/accessibility_test.dart` — six Wave 0 widget tests for scale, AA tokens, labels, read-only status, CONFIRMED-edge exclusion and label secrecy.
- `mobile/test/widget/app/theme_test.dart` — new palette value, computed contrast assertions and a source guard against the old clamp.

## Decisions Made

- Chose to remove the upper clamp rather than merely raise it, because the plan requires a 200% system setting to render at 200% and the artifact promises a policy that preserves the platform text scale.
- Interpreted the research's "darken dim" as "raise its contrast": on a near-black card, higher luminance increases the ratio. The new token passes AA on all three dark surfaces while remaining subordinate to `muted`.
- Excluded only the decorative `CustomPaint` nodes, not the informational labels: a screen reader still announces the remaining days and kill-switch status, while no painter appears as an interactive affordance.
- No architectural, dependency, native, FSM or payment change was made; no package was installed (REQ-NOTIF-02/FCM stays deferred by D-08).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A first draft of the contrast helper typed `Color.r/g/b` as `int`; this SDK exposes them as doubles. Replaced the hand-rolled luminance math with Flutter's WCAG `Color.computeLuminance()` in both test files (no behavior impact).
- Flutter merges a wrapper `Semantics` label with its child text (e.g. «Профиль А», «26 дней осталось 26»), so two `find.semantics.byLabel` exact-string assertions were changed to `RegExp` patterns; the assertions still prove the labels are announced.
- `flutter analyze` still reports the pre-existing ~1,887 info-level lint baseline across the repository; the plan's verification flags treat infos as non-fatal and exit 0 with 0 errors and no warnings in 22-05 files.

## User Setup Required

None - no external service configuration or package install required. Live visual/screen-reader checks remain manual in `22-VALIDATION.md`.

## Known Stubs

None. No placeholder, fake token, simulated notification, load bar or empty data path was introduced.

## Next Phase Readiness

- Phase 22 is complete with all five plans summarized: JWT-safe device management, local-only settings, read-only security rows, local expiry reminders and an accessible dark UI.
- Manual-only before milestone close: visual parity with `.planning/seeds/prototype-mobile-client.html` and a live device screen-reader pass (`22-VALIDATION.md`); inherited phase-19/20/21 UAT and FCM (REQ-NOTIF-02) remain external debts.

---
*Phase: 22-devices-settings-polish-5-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

- All 7 created/modified files exist on disk.
- Both task commits (`755c2df`, `e3d6e20`) are present in git history.
- Re-ran plan verification: build_runner exit 0, analyzer exit 0 (0 errors), focused suites 16/16 and full `flutter test` 378/378.
- No stub/TODO/placeholder pattern found in any changed file; no unrun `<verify>` and no skipped test.
