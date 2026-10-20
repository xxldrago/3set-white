---
phase: 06-email-auth
plan: 07
subsystem: auth
tags:
  - bot-redirect-login
  - telegram-deep-link
  - gap-closure
  - email-only-cabinet
  - userId-keyed-trial
  - trial-anti-abuse

# Dependency graph
requires:
  - phase: 06-email-auth
    plan: "06"
    provides: telegram-bot request/status/consume contract + TelegramLoginToken handshake
  - phase: 06-email-auth
    plan: "02"
    provides: userId-subject sessions (D-82), claimTrialByUserId/releaseTrialOnFailureByUserId, merge trialUsed OR (D-80/D-81)
provides:
  - TelegramBotLoginButton client consuming the frozen 06-06 contract on /login
  - userId-keyed keys/trial service path (listKeysByUserId/revalidateKeysByUserId/startTrialByUserId)
  - /api/trial session-agnostic identity (TG-linked keeps TG path, email-only takes userId path)
  - email-only cabinet landing (keys dashboard + one-tap trial + Account)
affects:
  - 06-email-auth UAT (G-06-4b client, G-06-9, UAT test 8)
  - any future email-scoped key/order surface

# Actuals (#2632) — same scale as the plan's estimate (chars/4 over the realized diff).
actuals:
  tokens: 6461
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bot-redirect login client: request → open t.me deep link → 2s status poll → atomic consume → full redirect; timer teardown on unmount and server-TTL expiry
    - Shared subscription renderer parameterized by session scope (TG telegramId vs email userId), identical empty/error copy

key-files:
  created:
    - components/TelegramBotLoginButton.tsx
  modified:
    - app/login/page.tsx
    - lib/i18n/messages/ru.ts
    - lib/keys-service.ts
    - app/api/trial/route.ts
    - app/page.tsx
    - tests/integration/email-auth-flow.test.ts

key-decisions:
  - "Bot button renders the deep link as anchor target=_blank rel=noopener and auto-clicks it once after the request; the anchor doubles as the manual fallback if the popup is blocked (single tap still reaches the bot)."
  - "Email trials use provider customerRef email:{userId} (not the numeric userId) so the provider-side one-trial-per-email-account invariant is distinct from the TG telegram-id namespace (D-80)."
  - "SubscriptionsSection split into a shared SubscriptionsBody so the email-only landing reuses the exact TG CARD/empty/error copy; only the scope and after() revalidate target differ."
  - "Email-only home keeps tariff/payments/support TG-gated: those surfaces key orders/tickets by telegramId and are out of this gap's scope; the link banner still funnels toward linking."

patterns-established:
  - "Scope-parameterized subscription renderer: one body component, two readers (listKeys vs listKeysByUserId) with matching after() revalidate."
  - "Session-agnostic BFF route: requireSession identity branches on telegramId presence, preserving legacy TG byte-for-byte while enabling email-only."

requirements-completed: [AUTH-01, AUTH-02, AUTH-05, AUTH-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Bot-login button on /login consumes the 06-06 request/status/consume contract: issue token, open bot, poll, consume, redirect"
    requirement: "AUTH-02"
    verification: []
    human_judgment: true
    rationale: "Client click-through (tab open + bot Start + redirect) cannot be asserted from the vitest node environment; the underlying server contract is auto-covered by telegram-bot-login.test.ts, but the end-to-end click path is a manual UAT step."
  - id: D2
    description: "Email-only POST /api/trial claims once under customerRef email:{userId} and a second call returns 409 trial_used with no provider retry"
    requirement: "AUTH-05"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#email-only POST /api/trial succeeds once, then 409 trial_used with no provider retry"
        status: pass
    human_judgment: false
  - id: D3
    description: "A Telegram-linked session still takes the pre-Phase-6 TG trial path (customerRef = telegram id)"
    requirement: "AUTH-05"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#a Telegram-linked session still takes the TG trial path"
        status: pass
    human_judgment: false
  - id: D4
    description: "listKeysByUserId returns only the caller's rows (second-user isolation, T-06-07-03)"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#listKeysByUserId returns only the caller's rows (second-user isolation)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Email-only users land in the keys-dashboard cabinet (banner + subscriptions + trial + Account), not the profile view"
    requirement: "AUTH-06"
    verification: []
    human_judgment: true
    rationale: "The rendered landing is a visual/server-render outcome; UAT test 9 (post-login landing) remains the human sign-off."

# Metrics
duration: 3min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 07: Bot-Login Button + Email-Only Cabinet Summary

**Bot-redirect Telegram login wired into /login against the frozen 06-06 contract, plus a userId-keyed keys/trial path so email-only users land in a real cabinet with a working one-per-account trial.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-05T11:40:49Z
- **Completed:** 2026-10-05T11:43:50Z
- **Tasks:** 3/3
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- **G-06-4b client closed:** `TelegramBotLoginButton` issues a token via `/api/auth/telegram-bot/request`, opens the `t.me` deep link in a new tab, polls `/status` every 2s, calls `/consume` on `ready`, and redirects to `/` — all cookie handling left to the browser jar (no client-side trust decisions). Handles `expired`/`consumed` with a retry action and errors with `login.error`; timers stop on unmount and at the server-supplied TTL (no client-invented countdown). Placed as the primary Telegram entry directly under `EmailAuthCard`, preserving the D-91 order (email, bot button, «или» divider, inline widget).
- **G-06-9 closed:** email-only sessions resolve to a server-side `userId`; the home page renders the real cabinet — link banner, a `SubscriptionsSectionByUserId` (keys dashboard sharing the TG body/empty/error copy), the one-tap `TrialButton`, and the Account section. Tariff/payments/support remain TG-gated per scope.
- **Trial parity for email accounts:** `listKeysByUserId` / `revalidateKeysByUserId` / `startTrialByUserId` mirror the TG path. Email trials create the provider key under `customerRef = email:{userId}` with the atomic `claimTrialByUserId` + guarded `releaseTrialOnFailureByUserId` rollback, so one-trial-per-account (D-80) holds locally and provider-side.
- **Tests:** 3 new integration vectors (email-only trial once/409, TG-linked path preserved, second-user isolation) alongside the 06-06 handshake suite; full suite 44 files / 401 tests pass; `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bot-login button on /login** - `151ce11` (feat)
2. **Task 2: Email-only cabinet landing + userId trial** - `4f2188c` (feat)
3. **Task 3: Cover the new paths with tests** - `7f25dc3` (test)

**Plan metadata:** `docs(06-07): complete bot-login + email-only cabinet plan` (final commit)

## Files Created/Modified

- `components/TelegramBotLoginButton.tsx` — bot-redirect login client (request → open → poll → consume → redirect; timer teardown).
- `app/login/page.tsx` — renders `TelegramBotLoginButton` as the primary Telegram entry under `EmailAuthCard` (D-91 order preserved).
- `lib/i18n/messages/ru.ts` — `auth.loginViaBot`, `auth.botLoginWaiting`, `auth.botLoginExpired` (each referenced by a `t()` literal; i18n completeness green).
- `lib/keys-service.ts` — `listKeysByUserId`, `revalidateKeysByUserId` (ownerRef `email:{userId}`), `startTrialByUserId` (email customerRef + atomic claim + guarded rollback).
- `app/api/trial/route.ts` — `requireSession`; branches on `telegramId` presence to keep the TG path and add the email-only userId path.
- `app/page.tsx` — email-only branch becomes the keys dashboard (shared `SubscriptionsBody`, `after()` revalidate by userId) + `TrialButton` + Account; TG branches unchanged.
- `tests/integration/email-auth-flow.test.ts` — 3 new vectors with a spied `artemida.createTrial` (no network) and real DB claim/cache.

## Decisions Made

- **Auto-open with an anchor fallback:** the waiting state renders the deep link as `<a target="_blank" rel="noopener noreferrer">` and clicks it once after the request resolves, so a single tap reaches the bot while a blocked popup still leaves a manual anchor. No `document.cookie` access anywhere in the island.
- **`email:{userId}` provider ref:** chosen over the bare numeric id so the email trial namespace cannot collide with the TG telegram-id namespace at the provider, reinforcing D-80.
- **Shared body, two readers:** extracted `SubscriptionsBody` so the email landing mirrors the TG cabinet copy exactly (no divergent empty/error strings) while scoping the read/revalidate by userId.
- **TG-gated surfaces kept:** tariff/payments/support still key by telegramId; the link banner remains the funnel, avoiding out-of-scope order/ticket changes.

## Deviations from Plan

None - plan executed exactly as written. No new dependencies; no architectural changes.

## Issues Encountered

- The plan's Task 3 verify used `DATABASE_URL=...?host=/tmp`; the run used the objective-provided `postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite` (same `setwhite` DB over TCP). Both suites and the full run passed against it.
- `trialPOST` takes no request argument, so the test helper calls `trialPOST()` directly (initial `new Request(...)` failed `tsc`, fixed before commit).

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. T-06-07-02 (trial farm) is mitigated by the atomic userId claim plus the `email:{userId}` provider ref; T-06-07-03 (IDOR) by server-resolved session scope with a second-user isolation vector; T-06-07-01 (status oracle) remains read-only and token-scoped in the 06-06 route. No new packages (T-06-07-SC clean).

## Known Stubs

None — no placeholders, hardcoded empty data flows, or unwired paths introduced.

## Next Phase Readiness

- G-06-4b and G-06-9 are closed at the code level; the remaining sign-off is human click-through (UAT tests 4/8/9): the /login bot CTA → bot Start → cabinet, and the email-only home showing the dashboard with a working one-tap trial.
- No blockers. `STATE.md` / `ROADMAP.md` intentionally untouched (orchestrator-owned).

---

*Phase: 06-email-auth*
*Completed: 2026-10-05*

## Self-Check: PASSED

- Created/modified files exist on disk: `components/TelegramBotLoginButton.tsx`, `app/login/page.tsx`, `lib/keys-service.ts`, `app/api/trial/route.ts`, `app/page.tsx`, `tests/integration/email-auth-flow.test.ts`.
- Commits exist: `151ce11`, `4f2188c`, `7f25dc3`.
- `npx tsc --noEmit` clean; full `npx vitest run` 44 files / 401 tests pass.
