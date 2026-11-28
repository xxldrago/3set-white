---
phase: 22-devices-settings-polish-5-days
plan: 03
subsystem: mobile
tags: [flutter, freezed, riverpod, dark-ui, profile, identity, referral, clipboard, reset-demo, connectivity, read-only, vitest, prisma]

requires:
  - phase: 22-devices-settings-polish-5-days
    provides: 22-01 dark profile sheet, device provider and device-limit handoffs
  - phase: 22-devices-settings-polish-5-days
    provides: 22-02 local-only resetDemo(ref, onNavigateToAuth:) seam
  - phase: 21-subscription-purchase-7-days
    provides: ownership-joined GET /api/mobile/subscription with the session-restore identity block
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: always-on native kill switch (D-09) and the D-15 network-change invalidation listener
provides:
  - Real nullable name/referral identity on the single subscription row, with NULL legacy codes ensured on the caller's own row only
  - Deterministic identity fallback and an always-on read-only kill-switch row with no toggle, tap or native change
  - Referral and subscription-link copy rows over the existing clipboard/toast seam, with the stored code prefixed exactly once
  - Confirm-then-call local-only Reset Demo row with zero outbound requests
  - Read-only network chip fed by the real connectivity stream; cache invalidation remains owned by the existing listener
affects:
  - 22-04 (blocking-human package gate for local notifications stays untouched), 22-05 (final polish/accessibility consumes these rows)

actuals:
  tokens: 13932
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - Server-ensured own-row referral code returned verbatim; no client-side prefix duplication or invented identity
    - Freezed identity fields extended and generated parts rebuilt with build_runner
    - Provider seams (resetDemoCallProvider, resetNavigationProvider, linkCopierProvider) make copy/reset effects observable without HTTP or platform channels
    - Read-only presentation rows: kill switch and network chip carry no GestureDetector, Switch or toast on tap

key-files:
  created:
    - mobile/lib/features/profile/settings/kill_switch_row.dart
    - mobile/lib/features/profile/settings/referral_row.dart
    - mobile/lib/features/profile/settings/reset_row.dart
    - mobile/test/widget/features/profile/referral_row_test.dart
    - mobile/test/widget/features/profile/reset_row_test.dart
    - mobile/test/widget/features/servers/pool_toolbar_test.dart
  modified:
    - app/api/mobile/subscription/route.ts
    - tests/unit/mobile-subscription-route.test.ts
    - mobile/lib/features/subscription/models/subscription.dart
    - mobile/lib/features/subscription/models/subscription.freezed.dart
    - mobile/lib/features/subscription/models/subscription.g.dart
    - mobile/lib/features/profile/profile_sheet.dart
    - mobile/test/widget/features/profile/profile_sheet_test.dart

key-decisions:
  - "Identity stays server-authoritative: firstName/lastName/username/referralCode are added to the same already-fetched own-user select; a NULL referral code is ensured only via ensureReferralCode(claims.userId) and the stored 3SET- code is returned verbatim."
  - "REQ-SET-01 remains a read-only status row per D-01/D-03/D-04: frozen D-02 copy, no Switch/GestureDetector/flag and no native VPN, FSM or phase-20 toast change."
  - "The profile display name resolves firstName -> username -> email local part -> 'Пользователь'; no email or name is invented and the auth pill follows real telegramId presence."
  - "Referral URL appends ?ref= to the already-prefixed stored code exactly once; both copy rows reuse the existing clipboard seam and frozen 'Ссылка скопирована' toast."
  - "Reset Demo confirms then calls only the injected local reset seam with one navigation callback; widget tests prove zero Dio calls."
  - "The network chip observes networkLabelProvider with no tap behavior; real-change ping-cache clearing remains owned by networkPingInvalidationProvider and is proven through the existing listener."
  - "The tracer slice re-ran its full automated verify end-to-end (all six commands green, 0 errors/warnings in 22-03 files) before expansion; no checkpoint task exists in this plan."

patterns-established:
  - "Pure profileDisplayName/profileAuthMethod helpers make identity fallback testable without a widget tree."
  - "Injected action seams keep money/local-reset UI honest: no keyId, no amount, no outbound request, no fake link in fixtures or logs."

requirements-completed: [REQ-SET-01, REQ-SET-03, REQ-SET-04, REQ-SET-05, REQ-SUB-04, REQ-SUB-05]

coverage:
  - id: D1
    description: Subscription identity block carries real nullable name/referral fields from the caller's own row, ensuring a NULL code only on that row
    requirement: REQ-SUB-05
    verification:
      - kind: unit
        ref: tests/unit/mobile-subscription-route.test.ts#ensures a NULL legacy code on claims.userId only and returns it verbatim
        status: pass
      - kind: unit
        ref: tests/unit/mobile-subscription-route.test.ts#returns an already-stored prefixed code verbatim without a second ensure or prefix
        status: pass
    human_judgment: false
  - id: D2
    description: Always-on kill switch renders frozen read-only D-02 copy with no interactive control on any rebuild
    requirement: REQ-SET-01
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#read-only kill switch copy is identical on every rebuild
        status: pass
    human_judgment: false
  - id: D3
    description: Deterministic identity fallback (firstName -> username -> email local part -> neutral) and real Telegram/Email method pill
    requirement: REQ-SET-03
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#identity prefers the real firstName over username and email
        status: pass
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#identity ends at the neutral label when no field is present
        status: pass
    human_judgment: false
  - id: D4
    description: Referral URL uses the stored 3SET- code exactly once and both copy rows use the existing clipboard/toast seam
    requirement: REQ-SET-03
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/referral_row_test.dart#referral URL uses the stored code once with exactly one prefix
        status: pass
      - kind: widget
        ref: mobile/test/widget/features/profile/referral_row_test.dart#subscription-link row copies the real server link
        status: pass
    human_judgment: false
  - id: D5
    description: Reset Demo confirms then calls only the local reset seam with one navigation and zero outbound requests
    requirement: REQ-SET-04
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/reset_row_test.dart#confirm then call only the local reset with one navigation
        status: pass
    human_judgment: false
  - id: D6
    description: Read-only network chip shows real labels including no connection, has no tap behavior and leaves ping-cache invalidation to the existing listener
    requirement: REQ-SET-05
    verification:
      - kind: widget
        ref: mobile/test/widget/features/servers/pool_toolbar_test.dart#the chip renders real labels including the no-connection case
        status: pass
      - kind: widget
        ref: mobile/test/widget/features/servers/pool_toolbar_test.dart#a real stream change still clears the Drift ping cache through the existing networkPingInvalidationProvider listener
        status: pass
    human_judgment: false
  - id: D7
    description: Device-limit handoffs stay server-derived with no local counter, capacity arithmetic or bottom navigation
    requirement: REQ-SUB-04
    verification:
      - kind: widget
        ref: mobile/test/widget/features/profile/profile_sheet_test.dart#at exactly deviceLimit only the paid upgrade is offered
        status: pass
    human_judgment: false
  - id: D8
    description: Visual parity of the assembled dark profile sheet with the locked prototype
    verification: []
    human_judgment: true
    rationale: "No screenshot/browser MCP comparison available; typography, spacing and dark-palette parity with .planning/seeds/prototype-mobile-client.html remain manual-only (22-VALIDATION.md)."
  - id: D9
    description: Live referral code on a production user row and on-device network-change behavior with a real tunnel
    verification: []
    human_judgment: true
    rationale: "Flagged assumptions: a NULL legacy code is mock-tested, not observed on a real user row; real connectivity/invalidation timing and biometric-reset resurrection remain manual-only."

duration: 9 min 47s
completed: 2026-11-28
status: complete
---

# Phase 22 Plan 03: Profile Identity & Settings Rows Summary

**Real own-user identity and a server-ensured referral code feed a dark profile sheet whose kill switch and network chip stay read-only, with honest copy/reset handoffs and no toggle, fake link or outbound call**

## Performance

- **Duration:** 9 min 47s
- **Started:** 2026-11-28T10:12:33Z
- **Completed:** 2026-11-28T10:22:20Z
- **Tasks:** 2 of 2 (tracer identity/kill-switch slice, then expansion)
- **Files modified:** 13 (7 created, 6 modified including regenerated freezed/json parts)

## Accomplishments

- Extended `GET /api/mobile/subscription` with real nullable `firstName`, `lastName`, `username` and `referralCode` on the single already-fetched own-user row; a NULL legacy code is ensured via `ensureReferralCode(claims.userId)` and the stored code is returned verbatim with no invented email or other user's code.
- Extended the freezed `SubscriptionUser` model and rebuilt generated parts; added a deterministic `profileDisplayName` chain (firstName → username → email local part → neutral) and a real-`telegramId` method pill.
- Extracted the always-on kill switch into a plain themed `KillSwitchRow` with the exact D-02 copy on every rebuild, no `Switch`, `GestureDetector`, flag or native/FSM/toast change.
- Added referral and subscription-link copy rows over the existing `linkCopierProvider` and frozen «Ссылка скопирована» toast; the referral URL appends `?ref=` to the already-prefixed stored code exactly once and no link is fabricated for a NULL code.
- Added a confirm-then-call Reset Demo row over the injected plan-02 local reset seam with one `/auth` navigation callback and zero HTTP calls.
- Assembled the settings section with a read-only chip fed by `networkLabelProvider`; cache invalidation remains owned by the existing `networkPingInvalidationProvider` listener, and device-limit handoffs still come from the server `deviceLimit` with no local counter.
- Verified end to end: vitest 13/13, `tsc --noEmit` and `prisma validate` clean, build_runner success, `flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0 with no errors/warnings in 22-03 files, targeted widget tests 23/23 and full `flutter test` 364/364.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end profile identity and read-only kill switch — one path only** (tracer) - `f5badd6` (feat)
2. **Task 2: Referral, Reset Demo and read-only network chip rows** - `5f9e6e1` (feat)

**Plan metadata:** pending final docs commit

_Note: the tracer feedback gate re-ran the full automated `<verify>` chain end-to-end and passed with automated-only evidence, so expansion continued without an added checkpoint. No `checkpoint:*` task exists in this plan._

## Files Created/Modified

- `app/api/mobile/subscription/route.ts` — real identity/referral fields from the own-user select with own-row NULL-code ensure and stable-outcome logging.
- `tests/unit/mobile-subscription-route.test.ts` — 13 contract vectors including own-row ensure, verbatim stored code, no invented email and no identity/referral text in logs.
- `mobile/lib/features/subscription/models/subscription.dart` — four nullable identity fields on the freezed user block; generated parts rebuilt.
- `mobile/lib/features/profile/profile_sheet.dart` — full dark profile sheet with real identity header, settings rows, read-only network chip and scrollable content; no bottom nav.
- `mobile/lib/features/profile/settings/kill_switch_row.dart` — read-only always-on status with frozen D-02 copy.
- `mobile/lib/features/profile/settings/referral_row.dart` — single-prefix referral URL and real subscription-link copy over the shared clipboard/toast seam.
- `mobile/lib/features/profile/settings/reset_row.dart` — confirm-then-call local-only reset with injected provider seams.
- `mobile/test/widget/features/profile/profile_sheet_test.dart` — identity fallback, unchanged kill-switch copy on rebuild and no-toggle/no-nav vectors.
- `mobile/test/widget/features/profile/referral_row_test.dart` — single-prefix, real-link and NULL-code no-fabrication vectors.
- `mobile/test/widget/features/profile/reset_row_test.dart` — confirm gating, one navigation and zero outbound requests.
- `mobile/test/widget/features/servers/pool_toolbar_test.dart` — real labels incl. no connection, no-tap/no-toggle and real-change invalidation vectors.

## Decisions Made

- Identity remains server-authoritative; a NULL legacy referral code is ensured only on the authenticated account's own row and the stored `3SET-` value is never re-prefixed.
- The kill switch is a locked read-only status row (D-01/D-02/D-04): no user toggle exists anywhere in this plan and no native VPN code was touched.
- Reset Demo and clipboarding are injected provider seams, so widget tests observe exactly one local call and zero HTTP/platform side effects.
- The network chip is a pure observer; a real stream change continues to clear the Drift ping cache through the existing listener rather than any tap handler.
- Device capacity stays a server value; no client-side arithmetic, second key issuer or fabricated device appeared.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a reset-row widget test to prove the zero-outbound acceptance criterion**
- **Found during:** Task 2 (acceptance-criteria verification)
- **Issue:** The plan listed no test file for `reset_row.dart`, but its acceptance criteria require proof that the row calls only the local reset function and sends no outbound request. Without a test the criterion was unproven.
- **Fix:** Added `mobile/test/widget/features/profile/reset_row_test.dart`, overriding `resetDemoCallProvider`, `resetNavigationProvider` and `dioClientProvider`; it asserts confirm gating, one local call, one navigation and `verifyNever` on Dio get/post.
- **Files modified:** `mobile/test/widget/features/profile/reset_row_test.dart` (new).
- **Verification:** `flutter test test/widget/features/profile/reset_row_test.dart` 1/1 pass; full suite 364/364.
- **Committed in:** `5f9e6e1`

**2. [Rule 1 - Bug] Assembled settings section overflowed the profile sheet viewport**
- **Found during:** Task 2 verification (`profile_sheet_test.dart` RenderFlex overflow errors)
- **Issue:** Adding referral, network and reset rows to the `mainAxisSize.min` column exceeded the 560px test viewport, producing RenderFlex overflow failures and unreachable rows on small screens.
- **Fix:** Wrapped the sheet content in `SingleChildScrollView` while preserving the dark theme and no-bottom-nav layout.
- **Files modified:** `mobile/lib/features/profile/profile_sheet.dart`.
- **Verification:** All 15 profile-sheet widget tests pass; full `flutter test` 364/364; analyzer exit 0 with no errors in 22-03 files.
- **Committed in:** `5f9e6e1`

---

**Total deviations:** 2 auto-fixed (1 missing-critical test, 1 layout bug). **Impact:** Both were required for the plan's acceptance criteria and for the assembled sheet to be usable; no new endpoint, dependency, nav pattern or interactive security control was introduced. Recorded in `.planning/WINDOWS.md`.

## Issues Encountered

- A first draft of the identity fallback test reused one `ProviderScope` across three injected users; Riverpod kept the first override, so the email-local-part case saw no `alex`. Split into three independent `testWidgets` cases with fresh containers.
- The network-chip tests first injected a `ConnectivityService` fake whose double-stream delivery did not settle inside `pumpAndSettle`; switched to injecting the `networkLabelProvider` stream seam directly, while a separate provider-container test still drives the real `networkPingInvalidationProvider` from the same fake connectivity stream.
- `flutter analyze` still reports the pre-existing ~1850 info-level lint baseline across the repository; the plan's `--no-fatal-infos --no-fatal-warnings` verification exits 0 with no errors or warnings in 22-03 files.
- Vite emits its pre-existing `configLoader: 'native'` advisory on every vitest run; unrelated to this plan.

## User Setup Required

None - no external service configuration or package install required. `flutter_local_notifications`/`timezone` remain behind the 22-04 blocking-human gate and FCM stays deferred (D-08).

## Next Phase Readiness

- The dark profile sheet is fully assembled and testable with injected identity, referral, reset and connectivity values; 22-04 can add local expiry reminders without touching the read-only kill switch or chip.
- Manual-only items remain in `22-VALIDATION.md`: visual parity with the prototype, a real referral row on a production user with a NULL legacy code, real biometric-reset behavior and on-device network-change timing with a live tunnel.
- Full local verification is green: vitest 13/13, typecheck/schema valid, build_runner success, analyzer exit 0, widget tests 23/23 and full `flutter test` 364/364.

---
*Phase: 22-devices-settings-polish-5-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

- All 13 key files exist on disk and both task commits (`f5badd6`, `5f9e6e1`) are present in git history.
- Verification chain re-run green: vitest 13/13, `tsc --noEmit` exit 0, `prisma validate` valid, build_runner success, `flutter analyze` exit 0 with 0 errors/warnings in 22-03 files, targeted widget tests 23/23 and full `flutter test` 364/364.
- Stub scan over every changed file found no TODO/FIXME/placeholder fabrications.
