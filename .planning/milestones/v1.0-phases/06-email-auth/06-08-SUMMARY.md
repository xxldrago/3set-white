---
phase: 06-email-auth
plan: 08
subsystem: auth
tags:
  - telegram-widget
  - data-onauth
  - regression-fix
  - gap-closure
  - auth-03
  - auth-06

# Dependency graph
requires:
  - phase: 06-email-auth
    plan: "05"
    provides: TelegramWidgetInjector + TelegramWidgetSlot in-flow widget UI (the component whose data-onauth this plan repairs)
  - phase: 06-email-auth
    plan: "02"
    provides: link/unlink service + /api/auth/email/link (the endpoint the Account widget posts to)
provides:
  - lib/telegram-widget.ts pure builder (sanitizeWidgetIdPart / widgetCallbackName / widgetOnAuthExpression)
  - Identifier-only data-onauth contract for the Telegram Login Widget (no hyphens, no window. dot path)
  - Regression test that evaluates the emitted attribute exactly as telegram-widget.js?22 __parseFunction does
  - Dead-global cleanup in LoginButton / LinkTelegramRow
affects:
  - 06-email-auth UAT (inline widget login + Account link widget click-through)
  - AUTH-03 / AUTH-06 re-verification

# Actuals (#2632) — same scale as the plan's estimate (chars/4 over the realized diff).
actuals:
  tokens: 2541
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Identifier-only global callback: sanitize every non-[A-Za-z0-9_] char and force a letter start before exposing a global to a third-party eval boundary"
    - "Exact-parser regression test: evaluate the emitted data-onauth with direct eval('(function(user){<value>})') to mirror the third-party contract, plus a negative-control that keeps the old broken shape throwing"

key-files:
  created:
    - lib/telegram-widget.ts
    - tests/unit/telegram-widget.test.ts
  modified:
    - components/TelegramWidgetInjector.tsx
    - components/LoginButton.tsx
    - components/LinkTelegramRow.tsx

key-decisions:
  - "Callback prefix `tgAuth_` guarantees a leading letter, so widgetCallbackName always matches /^[A-Za-z][A-Za-z0-9_]*$/ even for empty or digit-leading inputs."
  - "data-onauth is built by a direct string builder returning `${callbackName}(user)` — never window. dot notation — so a future edit cannot silently reintroduce a member expression."
  - "The regression test registers the handler on globalThis and uses direct eval, mirroring telegram-widget.js?22 __parseFunction; the negative control aliases window to globalThis so the observed failure is the hyphenated name (ReferenceError: login is not defined), not a missing global."
  - "AUTH-06 containment (TelegramWidgetSlot) and both onAuth props are untouched; only the callback plumbing changed."

patterns-established:
  - "Pure widget-string builder module (lib/telegram-widget.ts) mirrors lib/auth.ts purity: no next/headers, no env, importable by vitest node env."
  - "Defect-class guard: a test asserts the previous invalid shape still throws, so the regression cannot be re-introduced without a red suite."

requirements-completed: [AUTH-03, AUTH-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "lib/telegram-widget.ts emits an identifier-only data-onauth direct call that Telegram's eval parse path can invoke"
    requirement: "AUTH-06"
    verification:
      - kind: unit
        ref: "tests/unit/telegram-widget.test.ts#emits data-onauth that Telegram can eval and invoke (regression guard)"
        status: pass
      - kind: unit
        ref: "tests/unit/telegram-widget.test.ts#builds an identifier-only callback name from hyphen/dot inputs"
        status: pass
    human_judgment: false
  - id: D2
    description: "The previous hyphenated `window.telegram-login-...OnAuth(user)` shape is proven to throw when evaluated the same way (defect class guarded)"
    requirement: "AUTH-03"
    verification:
      - kind: unit
        ref: "tests/unit/telegram-widget.test.ts#throws on the previous hyphenated window dot-path shape"
        status: pass
    human_judgment: false
  - id: D3
    description: "TelegramWidgetInjector sets data-onauth via widgetOnAuthExpression and registers exactly that identifier global; LoginButton/LinkTelegramRow dead globals removed"
    requirement: "AUTH-03"
    verification: []
    human_judgment: true
    rationale: "Component wiring is verified structurally (npx tsc --noEmit clean; grep shows no onTelegramAuth/onTelegramLink refs and the only data-onauth producer is widgetOnAuthExpression), but the delivered capability is browser-only: completing the inline /login widget and the Account 'link Telegram' widget must be confirmed by a human click-through (plan verification)."

# Metrics
duration: 3min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 08: Telegram Widget Callback Regression Summary

**Identifier-only `data-onauth` builder replaces the 06-05 hyphenated `window.` dot-path, restoring the classic Telegram login and Account link widget callbacks with an exact-parser regression guard.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-05T12:40:25Z
- **Completed:** 2026-10-05T12:43:19Z
- **Tasks:** 2/2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- **BLOCKER closed:** `TelegramWidgetInjector` no longer emits `window.telegram-login-<bot>-<rand>OnAuth(user)`. It now emits `${widgetCallbackName(botUsername, nonce)}(user)` from `lib/telegram-widget.ts` — an identifier-only direct call with no hyphens and no dot path, which `telegram-widget.js?22`'s `__parseFunction` → `eval('(function(user){<value>})')` can invoke.
- **Pure builder added:** `sanitizeWidgetIdPart` replaces every non-`[A-Za-z0-9_]` char and forces a letter start; `widgetCallbackName` prefixes `tgAuth_` (leading letter) so it always matches `/^[A-Za-z][A-Za-z0-9_]*$/`; `widgetOnAuthExpression` returns `${name}(user)` (never `window.` notation). Module mirrors `lib/auth.ts` purity (no `next/headers`, no env).
- **Exact-parser regression test:** evaluates the emitted attribute exactly as Telegram does, asserting the registered global receives `{ id: 42 }`; a negative control proves the old hyphenated shape throws `ReferenceError` (the documented `login is not defined` failure). This defect class can no longer slip past the suite.
- **Dead-global cleanup:** removed the now-unreachable `window.onTelegramAuth` (LoginButton) and `window.onTelegramLink` (LinkTelegramRow) registrations, their effects/cleanups, their `Window` interface members, and the associated unused `TelegramUser`/`TelegramAccount` interfaces. Both consumers now pass their handlers directly via the injector's `onAuth` prop.
- **AUTH-06 containment preserved:** `TelegramWidgetSlot` and both `onAuth` prop paths are untouched; no absolute/fixed positioning introduced.
- **Verification:** `npx tsc --noEmit` clean; full suite `45 files / 405 tests` pass (was 44/401 — the new file adds 4 vectors); i18n completeness green (no unused keys introduced); ESLint clean on the new files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure widget callback builder + Telegram-eval regression test** - `c3bad03` (feat)
2. **Task 2: Rewire injector + remove dead global handlers** - `6b94e58` (fix)
3. **Cleanup: drop unused eslint-disable directives in widget test** - `b71dbf6` (chore)

**Plan metadata:** `docs(06-08): complete telegram widget callback regression plan` (final commit)

## Files Created/Modified

- `lib/telegram-widget.ts` — pure `sanitizeWidgetIdPart` / `widgetCallbackName` / `widgetOnAuthExpression` builder (identifier-only `data-onauth`).
- `tests/unit/telegram-widget.test.ts` — 4 vectors: identifier-only name, Telegram-exact eval path, negative control (old shape throws), empty/digit-leading sanitization.
- `components/TelegramWidgetInjector.tsx` — derives `callbackName` from the builder, registers that global, emits `data-onauth` via `widgetOnAuthExpression`; cleanup keyed on `callbackName`; `window as any` casts replaced with `Record<string, unknown>`.
- `components/LoginButton.tsx` — removed dead `window.onTelegramAuth` registration/cleanup, `Window.onTelegramAuth` member, and unused `TelegramUser`; kept `Telegram?` WebApp member and `loginFromBot` path.
- `components/LinkTelegramRow.tsx` — removed dead `window.onTelegramLink` registration/cleanup, `Window.onTelegramLink` member, unused `TelegramAccount`, and the now-unused `useEffect` import.

## Decisions Made

- **`tgAuth_` prefix:** guarantees a leading letter so the builder's output is a valid identifier for any input (including empty/digit-leading bot names or nonces).
- **Direct call expression builder:** `widgetOnAuthExpression` owns the `${name}(user)` shape so no call site can reintroduce a `window.` dot path.
- **Faithful eval reproduction:** the test uses direct `eval` and aliases `window` to `globalThis` in the negative control, so the asserted failure is exactly the hyphenated-name `ReferenceError` the verifier observed, not a missing-global artifact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Self-introduced lint warning] Removed unused `eslint-disable-next-line no-eval` directives**
- **Found during:** post-Task-2 lint sweep.
- **Issue:** `next/typescript` does not enable `no-eval`, so the two suppression comments I added in Task 1 were reported as unused-directive warnings.
- **Fix:** deleted both directives; no behavior change.
- **Files modified:** `tests/unit/telegram-widget.test.ts`
- **Verification:** `npx eslint tests/unit/telegram-widget.test.ts lib/telegram-widget.ts` clean; `npx vitest run tests/unit/telegram-widget.test.ts` 4/4 pass.
- **Committed in:** `b71dbf6`.

---

**Total deviations:** 1 auto-fixed (1 self-introduced lint warning).
**Impact on plan:** Cosmetic only. No scope creep, no behavior change, no new dependencies.

## Issues Encountered

- **Pre-existing (out-of-scope) lint error:** `react-hooks/set-state-in-effect` in `components/LoginButton.tsx` at the surviving `setWebappAvailable(...)` effect body. Confirmed pre-existing by running ESLint against `HEAD~1` via `--stdin` (same error before this plan); fixing it needs a lazy-init/hydration-safe redesign, which is outside this plan's scope. Logged to `.planning/phases/06-email-auth/deferred-items.md` along with two pre-existing warnings. It does not affect `tsc` or vitest.

## User Setup Required

None - no external service configuration required. No new dependencies (T-06-08-SC clean).

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. T-06-08-01 (tampering with `data-onauth`) is mitigated by the identifier-only sanitizer + direct-call builder + exact-parser regression test + unmount cleanup; T-06-08-02 (spoofing) is unchanged (client makes no trust decision; the BFF still re-verifies the widget HMAC + one-time replay consume); T-06-08-03 (link elevation) is unchanged (`/api/auth/email/link` still requires a valid session AND a verified widget payload). No new packages.

## Known Stubs

None — no placeholders, hardcoded empty data flows, or unwired paths introduced. The `data-onauth` string is produced by the real builder and the registered handler is the component's live `onAuth` prop.

## Next Phase Readiness

- BLOCKER 1 from `06-VERIFICATION.md` is closed at the code level: no `data-onauth` value contains a hyphenated dot path, and both widget callbacks (`/api/auth/telegram` via `LoginButton`, `/api/auth/email/link` via `LinkTelegramRow`) are wired to fire. AUTH-03's link UI and AUTH-06's button are functional in code.
- Remaining sign-off is a human browser click-through (recorded in the plan's verification): complete the inline widget on `/login` and the Account "link Telegram" widget, confirming each posts its payload.
- `STATE.md` / `ROADMAP.md` intentionally untouched (orchestrator-owned).
- No blockers.

---

*Phase: 06-email-auth*
*Completed: 2026-10-05*

## Self-Check: PASSED

- Created/modified files exist on disk: `lib/telegram-widget.ts`, `tests/unit/telegram-widget.test.ts`, `components/TelegramWidgetInjector.tsx`, `components/LoginButton.tsx`, `components/LinkTelegramRow.tsx`.
- Commits exist: `c3bad03`, `6b94e58`, `b71dbf6`.
- `npx tsc --noEmit` clean; full `npx vitest run` (DATABASE_URL=`setwhite`) 45 files / 405 tests pass.
