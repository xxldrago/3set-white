---
phase: 06-email-auth
plan: "04"
subsystem: ui
tags: [email-auth, nextjs-app-router, react-client-islands, tailwind, i18n, telegram-widget, account-linking]

# Dependency graph
requires:
  - phase: 06-email-auth
    plan: "01"
    provides: email register/login routes with typed errors (email_taken/invalid_credentials/rate_limited+retryAfterSec)
  - phase: 06-email-auth
    plan: "02"
    provides: link/unlink/change-password routes (telegram_taken, confirmation_required+lastMethod, current_password_wrong) with session re-mint
  - phase: 06-email-auth
    plan: "03"
    provides: reset request/confirm routes (reset_no_account/reset_invalid/expired/used, no auto-session on confirm)
provides:
  - stacked /login (EmailAuthCard + TelegramWidgetSlot, AUTH-06 desktop fix)
  - /reset + /reset/confirm pages with token-state panels
  - Account section (methods + link/unlink + change-password) wired into cabinet home
  - full auth.* RU copy block (59 keys) with i18n-completeness green
affects: [06-verify, admin email support, trial-by-email UI wiring]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 15000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [server-read-token-prop (never rendered), confirmation_required-400 as pre-mutation lastMethod hint, per-task i18n key batches (added keys referenced in the same task), email-only home branch beside the untouched TG branch]

key-files:
  created:
    - components/EmailAuthCard.tsx
    - components/PasswordField.tsx
    - components/TelegramWidgetSlot.tsx
    - components/ResetRequestForm.tsx
    - components/ResetConfirmForm.tsx
    - components/AccountSection.tsx
    - components/LinkTelegramRow.tsx
    - components/UnlinkConfirmPanel.tsx
    - components/ChangePasswordForm.tsx
    - app/reset/page.tsx
    - app/reset/confirm/page.tsx
  modified:
    - app/login/page.tsx
    - app/page.tsx
    - lib/i18n/messages/ru.ts

key-decisions:
  - "Register 409 email_taken renders the identical generic invalidCredentials copy — registration must not disclose account existence (only reset-request may, D-89)"
  - "Unlink lastMethod warning is read from the route's own confirmation_required 400 (body without confirm never mutates), so the D-93 warning renders BEFORE the second tap"
  - "ChangePasswordForm renders only when the account has a passwordHash — TG-only accounts get no dead form (no set-password flow exists in Phase 6)"
  - "app/page.tsx extended under Rule 2 (outside files_modified): Account UI is otherwise unreachable; TG branch byte-identical, email-only users get banner + Account only"
  - "Contract-gap failures reuse existing keys (no invented copy): unexpected login/link errors → login.error, unexpected change-password failure → common.errorLoad, link retry keeps the widget actionable"

patterns-established:
  - "Client islands POST credentials and follow with window.location.href or router.refresh on privilege change; the httpOnly session cookie is never read/written/rendered client-side"
  - "429 handling: static server-provided {n} via t() interpolation + setTimeout unlock; no client-invented countdown"
  - "Field-error slots reserve min-h-5 so validation messages never shift the submit CTA"

requirements-completed: [AUTH-01, AUTH-02, AUTH-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "auth.* RU copy block (59 keys) wired key-for-key — every rendered key exists, no unused keys"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys + every t() key exists"
        status: pass
    human_judgment: false
  - id: D2
    description: "/login stacks email form over centered Telegram widget on desktop (AUTH-06 fix)"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "npm run build — /login renders dynamic, no absolute/fixed positioning in slot chain"
        status: pass
    human_judgment: true
    rationale: "1440px iframe centering and late-inject no-shift are held-out visual checks per plan — need a human with a desktop browser"
  - id: D3
    description: "Register/login flows: mode switch + ?mode=register deep-link, identical generic failure, 429 server-wait lock, redirect on success"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "npm run build — /login compiles; no scripted browser coverage for the interaction"
        status: pass
    human_judgment: true
    rationale: "No automated UI tests in repo — mode swap retaining email, wrong-credential copy, and rate-limit lock need a human click-through"
  - id: D4
    description: "Reset request/confirm surfaces: sent/no-account/error states, invalid/expired/used panels, explicit re-login (no auto-session)"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "npm run build — /reset and /reset/confirm render dynamic"
        status: pass
    human_judgment: true
    rationale: "Token-state panels and the no-auto-session redirect need a human with a real reset letter"
  - id: D5
    description: "Account section: methods list, link/unlink with last-method warning, change-password, link banner for email-only users"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "npm run build — home renders with AccountSection Suspense boundary"
        status: pass
    human_judgment: true
    rationale: "Link widget flow, two-tap unlink with lockout copy, and banner visibility need a human signed in as email-only and TG users"

# Metrics
duration: 40min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 04: Cabinet auth UI Summary

**Stacked /login with centered Telegram widget (AUTH-06 fix), reset request/confirm pages, and Account section with link/unlink + change-password — full auth.* RU copy block wired key-for-key**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-10-05T16:25:00Z
- **Completed:** 2026-10-05T17:05:00Z
- **Tasks:** 3 (tracer + reset + account)
- **Files modified:** 14 (11 created + 3 modified, +1448/-7)

## Accomplishments

- /login reworked per D-91: single `max-w-md` centered column, EmailAuthCard on top → `auth.orContinue` divider → TelegramWidgetSlot wrapping LoginButton verbatim → InstallPrompt; slot is in-flow flex centered with `min-h-24`, zero absolute/fixed positioning (AUTH-06)
- EmailAuthCard: login/register segmented switch with `?mode=register` deep-link (email retained, passwords + errors cleared on swap), client shape/min-8 checks, 44px show/hide PasswordField, in-flight lock with loading labels, reserved error slots, identical generic failure for 401 + 409, 429 with server `retryAfterSec` lock, success → `/`
- Reset surfaces per contract: request form (sent / honest no-account + register deep-link / error + retry, email retained), confirm form (server-read token prop never rendered, mismatch check, invalid/expired/used panels each with request-new-link, success → explicit re-login, no auto-session); signed-in visitors redirect to `/`
- Account section (D-92/D-93): server-rendered card group with SkeletonRows loading + section-scoped error, email row (truncated + title, no affordances), Telegram row (linked `{id}` / not-linked), link CTA opening the widget in a bounded in-flow slot posting to the link route, UnlinkConfirmPanel with ConfirmPanel anatomy + last-method lockout warning, ChangePasswordForm (wrong-current copy, success status); linked home branch byte-identical, email-only users get linkBanner + Account
- `ru.ts`: updated `login.title`/`login.text` + 59-key `auth.*` block added in per-task batches — every added key referenced in the same task, i18n completeness green
- Full verification green: `npx tsc --noEmit` clean, 41 files / 369 unit tests pass, `npm run build` clean with `/login`, `/reset`, `/reset/confirm` dynamic

## Task Commits

Each task was committed atomically:

1. **Tracer: /login stacked form plus widget centered end-to-end** - `44c19b7` (feat: EmailAuthCard + PasswordField + TelegramWidgetSlot + login rework + 19 i18n keys)
2. **Reset pages: request + confirm (AUTH-04 surface)** - `100e341` (feat: reset pages + both forms + 19 i18n keys)
3. **Account section: methods + link/unlink + change-password** - `c0bfaf2` (feat: AccountSection group + home wiring + 21 i18n keys)

**Plan metadata:** summary commit follows (docs: complete plan).

⚡ Tracer verified end-to-end (unit 369 green + build clean after task 1) before expansion, per the tracer gate.

## Files Created/Modified

- `components/EmailAuthCard.tsx` (new) — mode switch, validation, typed-error mapping, rate-limit lock, redirect-on-success
- `components/PasswordField.tsx` (new) — label + input + 44px toggle + reserved error slot, shared by all four password forms
- `components/TelegramWidgetSlot.tsx` (new) — AUTH-06 containment: `flex min-h-24 flex-col items-center justify-center gap-3`
- `components/ResetRequestForm.tsx` (new) — sent / noAccount / error + retry, 429 server-wait
- `components/ResetConfirmForm.tsx` (new) — token prop, two PasswordFields, token-state panels, re-login success
- `components/AccountSection.tsx` (new) — server group + skeleton export + section error, legacy tid fallback
- `components/LinkTelegramRow.tsx` (new) — linked/unlinked rows, link widget posting to link route
- `components/UnlinkConfirmPanel.tsx` (new) — destructive inline confirm with pre-mutation lastMethod hint
- `components/ChangePasswordForm.tsx` (new) — current + new fields, wrong-current copy, success status
- `app/reset/page.tsx`, `app/reset/confirm/page.tsx` (new) — shell + max-w-md + signed-in redirect
- `app/login/page.tsx` — stacked centered rework + `?mode=register` initial mode
- `app/page.tsx` — AccountSection Suspense in TG branch (untouched surfaces identical); linkBanner + Account in new email-only branch
- `lib/i18n/messages/ru.ts` — updated login copy + 59-key auth.* block (19 + 19 + 21 per task)

## Decisions Made

- Register 409 `email_taken` → identical generic `auth.invalidCredentials`: D-89 reserves the honest existence answer for reset-request only; a second enumeration oracle on register would violate T-06-09's spirit.
- Unlink `lastMethod` comes from the route's own `confirmation_required` 400 (first tap fetches the hint, body without `confirm` never mutates) — the D-93 lockout warning renders before any mutation with zero new endpoints.
- ChangePasswordForm renders only when `passwordHash` is set: TG-only accounts see no dead form; Phase 6 has no set-password flow and inventing one is out of scope.
- Unexpected-failure copy reuses existing keys instead of inventing new ones: login/link widget errors → `login.error`, change-password 500/network → `common.errorLoad` + `common.retry`, link retry dismisses the error while the widget stays actionable.
- `app/page.tsx` modified under deviation Rule 2 (outside plan files_modified): without home wiring the Account UI is unreachable. TG branch output is byte-identical apart from the appended Account section; trial/keys/payments/tickets/admin untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Wired AccountSection + linkBanner into app/page.tsx**
- **Found during:** Task 3 (acceptance "Account shows both methods" unreachable — no page rendered the new components)
- **Issue:** Plan files_modified listed only the four Account components + ru.ts; without a host page the section and banner never render
- **Fix:** Minimal home wiring: TG branch gains an AccountSection Suspense (skeleton fallback); new email-only branch (requireSession ok + no telegramId) renders linkBanner card + AccountSection; login card and all TG sections byte-identical
- **Files modified:** app/page.tsx
- **Verification:** tsc clean, unit 369 green, build clean
- **Committed in:** c0bfaf2 (task 3 commit)

**2. [Rule 1 - Bug] ResetConfirmForm token-state copy via lookup table broke the i18n contract**
- **Found during:** Task 2 (self-review before verify)
- **Issue:** A `TOKEN_PANEL` record held the invalid/expired/used keys as plain strings — the i18n completeness test only sees static `t('…')` literals, so all three keys would read as unused and fail the suite
- **Fix:** Explicit ternary rendering with three static `t()` calls; table removed
- **Files modified:** components/ResetConfirmForm.tsx
- **Verification:** i18n unit tests green (no-unused-keys passes with all 59 keys)
- **Committed in:** 100e341 (task 2 commit)

**3. [Rule 1 - Bug] EmailAuthCard 429 handler never read retryAfterSec**
- **Found during:** Task 1 (self-review before verify)
- **Issue:** First draft parsed only `error` from the 429 body and left placeholder cruft; the server-provided wait never reached the lock timer
- **Fix:** Parse the full payload once (`error` + `retryAfterSec`, finite-number guarded, 60s fallback) and drive the lock + `t('auth.rateLimited', { n })` from it
- **Files modified:** components/EmailAuthCard.tsx
- **Verification:** tsc clean; same pattern reused correctly in ResetRequestForm
- **Committed in:** 44c19b7 (task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 2 missing-critical, 2 Rule 1 bugs)
**Impact on plan:** All fixes required for correctness/reachability; no scope creep. No new packages (T-06-SC clean). No STATE.md / ROADMAP.md writes (orchestrator-owned).

## Issues Encountered

- `npm run build` fails on a bare checkout: `.env.local` carries only ARTEMIDA keys, so fail-fast `lib/env.ts` throws during page-data collection (pre-existing, unrelated to this plan). Verified with throwaway build-time env inline (nothing written to disk): `BOT_TOKEN=build-dummy-token … npm run build` → exit 0. Production deploy already supplies real env; local devs need a fuller `.env.local` — flagged for the deploy phase, not fixed here.
- `BUILD_EXIT:$?` after a pipe reports grep's status, not the build's — reran the final build with output to a log file to capture the true exit code (0).

## Threat Flags

None beyond the plan's `<threat_model>` — all new surface maps to registered threats with the planned mitigations: T-06-09 (identical generic copy on login 401 + register 409; honest answer only on reset-request per D-89), T-06-06 (unlink-last allowed, warned via `auth.unlinkLastBody`, D-93 accepted), T-06-10 (in-flow containment only, LoginButton `postPayload` + httpOnly discipline verbatim, no client trust decisions), T-06-SC (zero new packages).

## Known Stubs

None — no placeholders, TODOs, or unwired paths. Grep over all new/modified UI files matches only Tailwind `placeholder:` pseudo-classes and legitimate email `placeholder=` attributes. Deliberate non-surfaces (email change/remove, verified indicator, set-password flow, client rate-limit countdown) are contract absences per UI-SPEC §4, not stubs.

## Auth Gates

None — no external auth required; all verification ran against local `setwhite` with throwaway build env.

## User Setup Required

None - no external service configuration required. (SMTP prod relay remains the 06-03 user_setup item; nothing new here.)

## Next Phase Readiness

- Ready: visual UAT (D2–D5 in coverage need a human: 1440px widget centering, late-inject no-shift, mode/register flows, reset letter round-trip, link/unlink/change as email-only + TG users), then Phase 6 close-out.
- Note: email-only users see banner + Account only until Telegram is linked (trial/keys/payments are TG-keyed by design); linking re-mints the session with tid so `router.refresh()` lands them in the full cabinet.
- Note for deploy: bare-checkout `npm run build` needs full env (see Issues) — ensure CI/prod env carries all `lib/env.ts` keys.
- No blockers.

## Self-Check: PASSED

- Created files on disk: all 11 new components/pages FOUND
- Commits exist: `44c19b7` FOUND, `100e341` FOUND, `c0bfaf2` FOUND (via `git rev-parse`)
- No `STATE.md` / `ROADMAP.md` writes made (pre-existing `M .planning/STATE.md` left untouched; orchestrator-owned)
- Verification: `npx tsc --noEmit` exit 0, unit 41 files / 369 tests green, `npm run build` exit 0

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*
