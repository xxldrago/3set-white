---
phase: 19-server-pools-auto-ping-7-days
plan: 05
subsystem: ui
tags: [flutter, dart, material3, dark-theme, design-system, variable-fonts, auth, riverpod]

# Dependency graph
requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-04 Drift/Riverpod foundation and the phase-18 auth screens/widgets re-themed here"
  - phase: 18-mobile-auth
    provides: "LoginScreen, RegisterScreen, TelegramWaitScreen, AuthForm and errorToast re-themed without changing auth logic"
provides:
  - "AppTheme.dark: app-wide Material 3 dark prototype theme with verbatim seed palette and all component theme slots"
  - "Bundled offline-safe Manrope / Unbounded / JetBrains Mono variable fonts with OFL licences"
  - "pingColor good<=60/mid<=110/warn<=180/bad/offline constants with no load colors and no simulation"
  - "Re-themed phase-18 auth screens/widgets/toast on the dark palette, min password 8 preserved"
  - "9 theme assertions + 20 auth widget tests (28 total) green; 0 errors/warnings in plan files"
affects:
  - "19-06/19-07/19-08 consume AppTheme.dark palette constants for the server screen, copy and layout; phase 20 reuses the ping colors"

# Actuals (#2632) — same scale as the estimate (chars/4 over realized diff)
actuals:
  tokens: 19500
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "Bundled variable font assets (Manrope, Unbounded, JetBrains Mono) via flutter.fonts; no new pub/npm dependency"
    - "OFL licence texts shipped with the fonts"
  patterns:
    - "Centralized AppTheme palette constants consumed by screens and widget tests instead of scattered Color literals"
    - "Material 3 component theming (appBar/card/button/input/text/divider/snackBar/bottomSheet/dialog/navigationBar) from one ThemeData"
    - "pingColor(bool, int?) pure threshold mapper with explicit offline state; no load class"

key-files:
  created:
    - mobile/test/widget/app/theme_test.dart
    - mobile/assets/fonts/Manrope-Variable.ttf
    - mobile/assets/fonts/Unbounded-Variable.ttf
    - mobile/assets/fonts/JetBrainsMono-Variable.ttf
    - mobile/assets/fonts/OFL-Manrope.txt
    - mobile/assets/fonts/OFL-Unbounded.txt
    - mobile/assets/fonts/OFL-JetBrainsMono.txt
  modified:
    - mobile/lib/app/theme.dart
    - mobile/lib/main.dart
    - mobile/pubspec.yaml
    - mobile/lib/features/auth/screens/login_screen.dart
    - mobile/lib/features/auth/screens/register_screen.dart
    - mobile/lib/features/auth/screens/telegram_wait_screen.dart
    - mobile/lib/features/auth/widgets/auth_form.dart
    - mobile/lib/features/auth/widgets/error_toast.dart
    - mobile/test/widget/features/auth/login_screen_test.dart
    - mobile/test/widget/features/auth/register_screen_test.dart

key-decisions:
  - "D-16 gate resolved by the user as `locked`: dark prototype theme app-wide, ThemeMode.dark, M3 kept, AppTheme.light retained unused, no light toggle, no load, auth re-themed, min password 8"
  - "Fonts bundled as official Google Fonts variable TTFs (OFL) rather than google_fonts: offline-safe, no runtime CDN fetch, no new package dependency"
  - "Palette copied verbatim from prototype :root, including rgba line tokens (alpha 0x24/0x4d) and both gradient start/end pairs"
  - "pingOffline = dim is distinct from pingBad = red; offline/no-response Russian copy exposed as constants for later UI plans"
  - "Auth logic, GoRouter redirects, Telegram polling and scaffoldMessengerKey untouched; only presentation re-themed"
  - "No load color, no prototype simulation, no fake server/connection state, no secrets in theme or tests"

patterns-established:
  - "AppTheme.<token> public const colors let later plans and tests reference the design system without magic hex values"
  - "WidgetStateProperty.resolve(<WidgetState>{}) is required when asserting ButtonStyle colors/side in Flutter 3.50"
  - "Source-level tests guard main.dart theme wiring and the absence of load/simulation artifacts"

requirements-completed: [REQ-POOL-01]

coverage:
  - id: D1
    description: "AppTheme.dark verbatim prototype palette and Material 3 ColorScheme.dark with all component theme slots"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#AppTheme.dark app-wide (D-16) verbatim prototype palette constants"
        status: pass
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#component themes cover app bars, cards, buttons and inputs"
        status: pass
    human_judgment: false
  - id: D2
    description: "ThemeMode.dark forced with theme=darkTheme=AppTheme.dark while AppTheme.light is retained unused"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#main.dart forces ThemeMode.dark with AppTheme.dark"
        status: pass
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#light theme is retained for a deferred toggle"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manrope / Unbounded / JetBrains Mono variable fonts bundled offline-safe and wired into the text theme"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#three prototype typefaces are wired into the text theme"
        status: pass
      - kind: other
        ref: "cd mobile && flutter pub get"
        status: pass
    human_judgment: false
  - id: D4
    description: "pingClass thresholds good<=60/mid<=110/warn<=180/bad/offline with no load colors"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#ping classes use good/mid/warn/bad/offline only"
        status: pass
      - kind: unit
        ref: "mobile/test/widget/app/theme_test.dart#no load colors, light toggle or prototype simulation shipped"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase-18 auth screens, form and toast re-themed dark; auth logic and min password 8 preserved"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/widget/features/auth/#20 tests including dark theme and 6-char password rejection"
        status: pass
      - kind: other
        ref: "cd mobile && flutter test test/widget/features/auth/"
        status: pass
    human_judgment: false
  - id: D6
    description: "Analyzer cleanliness and font asset resolution"
    requirement: REQ-POOL-01
    verification:
      - kind: other
        ref: "cd mobile && flutter analyze --no-fatal-infos --no-fatal-warnings"
        status: pass
    human_judgment: false
  - id: D7
    description: "On-device visual confirmation that the whole app reads as the dark prototype with correct typography"
    requirement: REQ-POOL-01
    verification: []
    human_judgment: true
    rationale: "Requires a physical device/simulator and human visual judgement; this environment has no interactive device session. All palette, font and theme assertions are covered deterministically."

# Metrics
duration: 8 min
started: 2026-11-27T04:16:30Z
completed: 2026-11-27T04:24:34Z
status: complete
---

# Phase 19 Plan 05: Dark prototype theme app-wide Summary

**App-wide Material 3 dark theme with the verbatim prototype palette, bundled variable fonts, pingClass colors and a re-themed phase-18 auth flow — no light toggle, no load, no simulation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-27T04:16:30Z
- **Completed:** 2026-11-27T04:24:34Z
- **Tasks:** 3 implementation tasks plus the D-16 decision gate (confirmed `locked`)
- **Files created/modified:** 17 (10 created, 7 modified)

## Accomplishments

- Rewrote `AppTheme.dark` with every prototype token verbatim (`#0e1512`, `#b7ff45`, `#3ee6b0`, all surfaces/lines/text tones, both gradients, 18 px radius) and a full `ColorScheme.dark` plus app bar, card, elevated/outlined/text button, input, text, divider, snack bar, bottom-sheet, dialog and navigation-bar themes. Material 3 stays on; `AppTheme.light` is retained but unused.
- Forced `theme: AppTheme.dark`, `darkTheme: AppTheme.dark`, `themeMode: ThemeMode.dark` in `main.dart`; ProviderScope, GoRouter, deep-link/biometric listeners and MediaQuery scaler unchanged.
- Bundled Manrope, Unbounded and JetBrains Mono variable TTFs from the official Google Fonts repository with their OFL licences and declared them in `pubspec.yaml` — offline-safe, no runtime CDN fetch and no new package dependency.
- Exposed `pingColor` with the prototype thresholds (good ≤60, mid ≤110, warn ≤180, bad, offline) and explicit offline/no-response Russian copy; no `load` color, no `loadClass`, no simulation.
- Re-themed Login, Register and Telegram-wait screens, `AuthForm` and `ErrorToastService` to the dark palette while keeping all auth logic, redirects, polling and the 8-character password minimum.
- Added 9 theme assertions and 2 dark/min-8 widget tests; 28/28 widget tests pass and plan files have 0 analyzer errors or warnings.

## Task Commits

Each task was committed atomically:

1. **Task 1 (`checkpoint:decision`, D-16)** — no commit; user selected `locked` (non-implementation gate).
2. **Task 2 (`tracer`): end-to-end dark prototype theme app-wide** — `b6f1430` (feat; includes fonts and the tracer smoke test)
3. **Task 3: re-theme phase-18 auth screens + widgets + tests, min-8** — `4daa480` (refactor)
4. **Task 4: theme widget test slice** — `f0ad749` (test)

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `mobile/lib/app/theme.dart` — dark prototype `AppTheme.dark`, palette/ping/font constants, unused light theme retained.
- `mobile/lib/main.dart` — forces `ThemeMode.dark` with `AppTheme.dark` for both theme slots.
- `mobile/pubspec.yaml` — font assets and three font families.
- `mobile/assets/fonts/*.ttf`, `mobile/assets/fonts/OFL-*.txt` — offline-safe variable fonts and licences.
- `mobile/lib/features/auth/screens/*.dart` — dark surfaces/accents, no hardcoded light colors; logic unchanged.
- `mobile/lib/features/auth/widgets/auth_form.dart` — dark inputs, primary/ghost buttons, min-8 validation intact.
- `mobile/lib/features/auth/widgets/error_toast.dart` — dark error/success/info snacks reusable by later phase-19 flows.
- `mobile/test/widget/app/theme_test.dart` — palette, theme slots, fonts, ping thresholds and no-`load`/no-simulation guards.
- `mobile/test/widget/features/auth/*_test.dart` — dark theme assertions, 6-char rejection, duplicate imports removed.

## Decisions Made

- **D-16 gate:** the user explicitly selected `locked` — dark prototype app-wide with `ThemeMode.dark`, M3 kept, `AppTheme.light` unused, no light toggle, no `load`, auth re-themed, min password 8. `system` was rejected as contradicting the locked decision.
- **Fonts:** bundled official OFL variable TTFs instead of `google_fonts` to avoid runtime network fetching; same three families as the prototype.
- **Offline color:** `pingOffline` is `dim` rather than `red`, keeping bad-RTT and no-answer visually distinct while both remain dark-theme tokens.
- **Auth:** presentation-only changes; no rewrite of login/register/Telegram polling or router redirects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Theme and toast compile errors on Flutter 3.50**
- **Found during:** Task 2 (first tracer test run)
- **Issue:** `final` is not a valid parameter modifier in Dart, and `SnackBarThemeData` has no `disabledContentColor` field.
- **Fix:** Removed the parameter modifiers and the unsupported field.
- **Files modified:** `mobile/lib/app/theme.dart`
- **Verification:** `flutter test test/widget/app/theme_test.dart` 3/3, then 8/8 after the final slice.
- **Committed in:** `b6f1430`

**2. [Rule 1 - Bug] Test-side Material API mismatches**
- **Found during:** Task 4 (theme slice compilation)
- **Issue:** `ButtonStyle.side`/`foregroundColor` are `WidgetStateProperty`s and `ThemeData.fontFamily` no longer exists in Flutter 3.50; several null-aware operators were unnecessary.
- **Fix:** Resolved properties with `resolve(<WidgetState>{})`, asserted `textTheme.bodyLarge.fontFamily`, and removed redundant `?.` on non-null theme getters.
- **Files modified:** `mobile/test/widget/app/theme_test.dart`
- **Verification:** 28/28 widget tests pass; 0 errors/warnings in changed files.
- **Committed in:** `f0ad749`

**3. [Rule 3 - Blocking] Tracer verify needed a theme test that the plan scheduled for the last task**
- **Found during:** Task 2 (tracer `<verify>` references `theme_test.dart`)
- **Issue:** The plan's final task owns `theme_test.dart`, but the tracer verification command runs it first.
- **Fix:** Created a 3-assertion smoke version in the tracer commit so the end-to-end path was provable, then expanded it to the full slice in Task 4.
- **Files modified:** `mobile/test/widget/app/theme_test.dart`
- **Verification:** tracer verify re-run after commit; green.
- **Committed in:** `b6f1430` (smoke), `f0ad749` (full slice)

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3). **Impact:** no scope creep — all fixes were required to compile against the installed Flutter 3.50 and to satisfy the tracer's own verification command.

## Issues Encountered

- `flutter analyze` in this environment still exits 1 because of ~1500 pre-existing `info` lints in phase-18 auth tests and one pre-existing `analysis_options_deprecated_plugins` config warning. Per the scope boundary these were not fixed; run with `--no-fatal-infos --no-fatal-warnings` for an errors-only gate. All files created/modified by this plan have 0 errors and 0 warnings.
- Unrelated admin/promo files remain modified or untracked by a concurrent process. They were deliberately left unstaged; explicit pathspec commits ensured none were swept into the plan commits.
- Font binaries were downloaded from the official `google/fonts` repository and their OFL licences are committed alongside them; no third-party theme package was introduced.

## User Setup Required

None — no external service configuration required for this plan.

## Known Stubs

None. `AppTheme.light` is intentionally retained but unused (deferred light toggle), and the re-themed «Функция в разработке» toast is an existing phase-18 placeholder outside this plan's scope.

## Threat Flags

None new. The implementation stays inside the PLAN threat register: only static assets from the official Google Fonts repository (OFL), no network runtime fetch, no `load` colors, no simulation artifacts, no raw links or secrets in UI or logs, and no new npm/pub dependency.

## Next Phase Readiness

- 19-06 can build the server-pool screen directly on `AppTheme` tokens (`bg`, `surface`, `line`, `lime`, `teal`, `pingColor`, `radius`, font families) and reuse `showErrorToast`/`showInfoToast` for «Пинг обновлён», «Нет активного ключа», «Купить» and «Повторить».
- 19-07 can add the Russian prototype copy and 19-08 the full layout without touching bottom navigation here.
- Open human-UAT item: on-device visual confirmation that the whole app reads as the dark prototype (coverage D7).

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*

## Self-Check: PASSED

- All created files present on disk (theme/test sources, three variable TTFs, three OFL licences, SUMMARY).
- All three task commits verified in `git log` (`b6f1430`, `4daa480`, `f0ad749`).
- No tracked-file deletions across the plan's commits.
- Final rerun: `flutter test test/widget/app/theme_test.dart test/widget/features/auth/` 28/28 pass; `flutter pub get` clean; `flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0; 0 errors/warnings in all files created or modified by this plan.
- Prohibition scan: no `Math.random`, `sleep(`, `loadClass`, `vless://` or placeholder artifacts in the shipped theme/auth sources (only negative assertions in the test).
