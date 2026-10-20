---
phase: 06-email-auth
plan: "03"
subsystem: auth
tags: [smtp, nodemailer, password-reset, mail, postgres]

# Dependency graph
requires:
  - phase: 06-email-auth
    plan: "01"
    provides: email identity (nullable telegramId, passwordHash, PasswordReset model), argon2id hashing, shared login rate-limit counter
provides:
  - SMTP mail module with fake-transport seam (lib/mail.ts, reset + welcome templates)
  - optional SMTP env keys with no-op-safe dev/test behavior (lib/env.ts)
  - reset request/confirm BFF routes with 1h one-time tokens (AUTH-04)
  - 10 reset-flow unit vectors incl. concurrency + mail-failure + throttling
affects: [06-04-login-ui (reset pages consume the typed error codes + confirm link shape), prod deploy (SMTP relay env setup)]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: [nodemailer@10.0.14 (exact pin, canonical nodemailer/nodemailer repo), "@types/nodemailer@8.0.2 (dev, exact pin)"]
  patterns: [injectable mail transport seam (SMTP prod / fake tests / logged no-op unconfigured), atomic reset consume via updateMany-count-in-transaction, shared per-email+IP throttle reused for reset-mail spam]

key-files:
  created:
    - lib/mail.ts
    - app/api/auth/email/password/request/route.ts
    - app/api/auth/email/password/confirm/route.ts
    - tests/unit/reset-flow.test.ts
  modified:
    - lib/env.ts
    - app/api/auth/email/register/route.ts
    - package.json
    - package-lock.json

key-decisions:
  - "SMTP env keys OPTIONAL (not min-1-required): fail-fast boot would crash without creds, so unconfigured relay degrades to a logged no-op — orchestrator-ordered, plan-deviation documented below"
  - "Reset requests reuse the login rate-limit counter (check + record): throttles reset-mail spam with 429 + retryAfterSec, same lock-bites-next discipline as login"
  - "Confirm consumes via updateMany(where usedAt null) count===1 inside the hash-rotation transaction — a raced double-confirm loses deterministically with reset_used (T-06-07)"
  - "Token-state errors share 400 with distinct codes (reset_invalid/expired/used); unknown-email is the honest 404 reset_no_account (D-89); confirm success mints no session"

requirements-completed: [AUTH-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Reset request for an existing email creates an unused 1h token row and sends one reset mail (AUTH-04)"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#request for an existing email creates an unused 1h token row and sends one reset mail"
        status: pass
    human_judgment: false
  - id: D2
    description: "Confirm rotates the hash, marks the token used, mints no session; reuse is rejected; new password logs in, old fails (AUTH-04)"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#confirm with the token rotates the hash, marks used, and does NOT auto-login"
        status: pass
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#a second confirm with the same token is rejected as used"
        status: pass
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#concurrent double-confirm: exactly one wins, the loser gets reset_used (T-06-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unknown email returns the honest no-account 404 with no row and no mail (AUTH-04, D-89)"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#request for an unknown email returns the honest no-account answer (D-89)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Malformed/expired tokens map to distinct errors; SMTP failure maps to generic reset_error; rapid requests 429; welcome outage never fails registration (AUTH-04)"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "tests/unit/reset-flow.test.ts#reset edges: token states, mail failure, throttling (AUTH-04)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 03: Password reset + SMTP delivery Summary

**One-time 1h reset tokens over an env-configured SMTP mailer with fake-transport test seam, honest no-account answer, and fire-and-forget welcome mail**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-05T16:00:00Z
- **Completed:** 2026-10-05T16:25:00Z
- **Tasks:** 2 (tracer + edge tests)
- **Files modified:** 8 (4 created modules/routes/tests + env/register/package manifests)

## Accomplishments

- `lib/mail.ts`: single `sendMail` export with SMTP transport from env, typed `MailError(code: send_failed)`, to-domain-only logs (never address/token/link), exactly two templates (reset + welcome, D-90); test seam `setMailTransportForTests` — zero real network sends in tests
- `lib/env.ts`: `SMTP_HOST/USER/PASS/FROM` optional, `SMTP_PORT` coerce-default 587, `SMTP_SECURE` stringbool-default false; reset links built off shared `APP_BASE_URL`
- `POST /api/auth/email/password/request`: strict email zod → existing user gets a fresh `PasswordReset` row (1h TTL) + reset mail, always 200-shaped; unknown email → honest 404 `reset_no_account` (D-89, the only enumeration surface); shared per-email+IP throttle → 429 + `retryAfterSec`; SMTP failure → generic 500 `reset_error`
- `POST /api/auth/email/password/confirm`: 64-hex shape gate → timing-safe compare → used/expiry checks → hash-rotation + mark-used in ONE transaction with `count === 1` consume guard; success does NOT auto-login (no Set-Cookie)
- Register wires `sendWelcomeMail` fire-and-forget (rejection swallowed, outcome logged inside `sendMail`) — registration 200 never waits on SMTP
- Full unit suite green: 41 files / 369 tests pass (incl. 10 new reset vectors); `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Tracer: reset request → email → confirm → new password end-to-end** - `5687abb` (feat: env SMTP keys + mail module + both routes + welcome hook + 4-vector tracer test + nodemailer dep)
2. **Reset edge tests + mail failure mapping** - `22763d8` (test: 6 edge vectors appended — malformed/expired/concurrent-use/SMTP-failure/throttle/welcome-outage)

**Plan metadata:** summary commit follows (docs: complete plan).

## Files Created/Modified

- `lib/mail.ts` (new) — sendMail/MailError/test-transport seam, `resetLinkFor`, `sendResetMail`, `sendWelcomeMail`
- `lib/env.ts` — optional SMTP_* keys + secure/port defaults (server-only, never `NEXT_PUBLIC_*`)
- `app/api/auth/email/password/request/route.ts` (new) — 400/404-honest/429/500-reset_error discipline, `RESET_TTL_MS` export
- `app/api/auth/email/password/confirm/route.ts` (new) — 400 token-state codes, atomic consume transaction, no session mint
- `app/api/auth/email/register/route.ts` — welcome-mail fire-and-forget hook (replaces the 06-01 comment seam)
- `tests/unit/reset-flow.test.ts` (new) — 10 DB-backed vectors against real `setwhite` with fake transport
- `package.json` / `package-lock.json` — `nodemailer@10.0.14` exact + `@types/nodemailer@8.0.2` exact (dev)

## Decisions Made

- SMTP keys optional (plan said min-1-required): required keys would crash fail-fast boot in every env without relay creds. Unconfigured relay → logged `skipped_unconfigured` no-op returning `{ sent: false }`. Production relay setup recorded below as owner user_setup.
- Reset throttle reuses `checkLoginRateLimit` + `recordFailedLogin` (shared per-email+IP counter): the plan's "reuses auth-rate-limit" read as the full check+record mechanism, so reset spam from one IP locks out with 429 + `retryAfterSec` exactly like login abuse. Side effect (reset requests consume login attempts for that email+IP) is blast-radius-limited to the abusing IP and documented in the route comment.
- Oversized tokens (300 chars) hit the zod `max(256)` boundary → `bad_request`, not `reset_invalid`: shape violations belong to the boundary layer, consistent with every other route. The test pins both behaviors explicitly.
- `MailError` catch in the request route is `instanceof`-narrowed: transport failures → `reset_error`, anything else propagates to generic `internal` (never mislabels a DB crash as a mail problem).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Route import depth off by one**
- **Found during:** Tracer (first vitest run: `Cannot find module '../../../../../lib/logger'`)
- **Issue:** New routes sit at `password/request|confirm` (one level deeper than `register`), so the 5-up `lib/` relative path from the plan skeleton resolves outside the repo root
- **Fix:** 6-up imports (`../../../../../../lib/*`), matching the existing `password/change` route convention
- **Files modified:** app/api/auth/email/password/request/route.ts, app/api/auth/email/password/confirm/route.ts
- **Verification:** suite resolves; pattern-matches the sibling change route byte-for-byte in depth
- **Committed in:** 5687abb (tracer commit)

**2. [Rule 1 - Bug] Edge-block transport was null (afterAll ordering)**
- **Found during:** Edge task (3 vectors failed: SMTP-failure returned 200, welcome waitFor timed out)
- **Issue:** The tracer describe's `afterAll` cleared the fake transport before the edge describe's `beforeAll` ran, so edge tests hit the unconfigured no-op path instead of the fake
- **Fix:** Each describe installs the transport in its own `beforeAll`; only the final `afterAll` clears it
- **Files modified:** tests/unit/reset-flow.test.ts
- **Verification:** 10/10 vectors green
- **Committed in:** 22763d8 (edge commit)

**3. [Rule 1 - Bug] Welcome-failure vector used a pre-seeded address**
- **Found during:** Edge task (test design review before first run)
- **Issue:** The welcome mail fires only on successful user creation; asserting against the pre-seeded address would exercise the 409 path (no mail ever sent) and prove nothing
- **Fix:** Fresh mailbox per run inside the test with `vi.waitFor` on the fire-and-forget attempt + row cleanup
- **Files modified:** tests/unit/reset-flow.test.ts
- **Verification:** vector green; proves registration 200s while the transport is down
- **Committed in:** 22763d8 (edge commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 3 blocking, 2 Rule 1 bugs) + 1 orchestrator-ordered plan adjustment (optional SMTP keys for no-op-safe dev/test, per execution objective)
**Impact on plan:** All fixes required for correctness; no scope creep. `files_modified` extended by necessity only (`package.json/lock` for the planned nodemailer dep, register route for the planned welcome hook).

## Issues Encountered

- Two orphan `phase6-reset-wfresh-*` user rows from the pre-fix failing runs (the failing welcome test exited before its row cleanup). Deleted manually; `password_resets` was already 0, suite afterAlls are otherwise clean.
- `npm install` printed an `npm audit fix --force` nudge (pre-existing advisories, out of scope — not acted on).

## Threat Flags

None beyond the plan's `<threat_model>` — all new surface maps to registered threats with the planned mitigations implemented: T-06-07 (one-time 1h token, timing-safe compare, expiry+used checks before effect, atomic consume transaction, token never in logs/responses), T-06-04 (honest no-account accepted per D-89; login itself still never enumerates), T-06-08 (MailError → generic `reset_error`, no provider text/token/hash in responses or logs — pinned by test), T-06-SC (package-legitimacy gate for `nodemailer`: verified `nodemailer@10.0.14` = canonical `nodemailer/nodemailer` repo via the npm registry before install, exact-pinned like 06-01's argon2; install succeeded so no blocking-human checkpoint was triggered).

## Known Stubs

None — no placeholders, TODOs, or unwired paths. The unconfigured-relay no-op is an intentional degraded mode (logged `skipped_unconfigured`), not a stub: every route completes its contract without SMTP, and production wiring is the user_setup item below.

## Auth Gates

None — no external auth required; all verification ran against local `setwhite` with the fake mail transport.

## User Setup Required

- **Production SMTP relay (owner user_setup):** set `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` (`true`/`false`, default `false`) in the prod env (and document in the secrets manager — never commit). Until set, `sendResetMail`/`sendWelcomeMail` log `skipped_unconfigured` and report `{ sent: false }`: registration and reset-request still return 200, but NO mail is delivered. Verify with: request a reset for a real account and confirm the letter arrives; watch logs for `route: mail, outcome: sent`.

## Next Phase Readiness

- Ready: 06-04 (reset/request UI pages consume `{ ok: true }`, `reset_no_account`, `reset_invalid/expired/used`, `rate_limited + retryAfterSec`, `reset_error`; confirm link shape `${APP_BASE_URL}/reset/confirm?token=…`; reset-confirm success does NOT set a session — UI must route the user to login, not to `/`).
- Note: the shared login/reset throttle counter means 5+ rapid reset requests from one IP also 429s that email+IP on login until the lock lapses — UI copy should reuse the existing `rate_limited` messaging, not invent a reset-specific one.
- No blockers.

## Self-Check: PASSED

- New modules/routes/tests on disk: `lib/mail.ts`, both reset routes, `tests/unit/reset-flow.test.ts` FOUND
- Commits exist: `5687abb` FOUND, `22763d8` FOUND (verified via `git rev-parse`)
- No `STATE.md` / `ROADMAP.md` writes made (orchestrator-owned)
- DB clean: 0 `password_resets` rows, 0 `phase6-reset-*` users (2 pre-fix orphans deleted)
- No secrets in the diff: `git diff` carries no `SMTP_PASS`/relay values (keys only, values live in env)

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*
