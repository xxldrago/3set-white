---
phase: 06-email-auth
plan: 06
subsystem: auth
tags:
  - telegram-login
  - bot-redirect
  - one-time-token
  - session-fixation
  - gap-closure
dependency:
  requires:
    - phase: 06-email-auth
      provides: userId-subject sessions (D-82), shared httpOnly cookie (D-86), auth BFF skeleton
    - phase: 06-email-auth
      provides: TelegramLoginToken pattern analogue (PasswordReset D-88, atomic claim D-22)
  provides:
    - TelegramLoginToken one-time guard + lib/telegram-login.ts handshake service
    - POST /api/auth/telegram-bot/{request,status,consume} BFF contract for the 06-07 client
    - bot /start login_<token> bind handler
  affects:
    - 06-email-auth/06-07 (client consumes this contract)
    - any future bot-deep-link auth surface
tech_stack:
  added: []
  patterns:
    - One-time login token with HMAC claim cookie (anti session-fixation)
    - Atomic single-use consume via updateMany + count===1 inside $transaction
    - Per-IP throttle over a rolling window keyed by sha256(ip) (PII-safe)
    - Unknown-token no-oracle status mapping (expired)
key_files:
  created:
    - lib/telegram-login.ts
    - app/api/auth/telegram-bot/request/route.ts
    - app/api/auth/telegram-bot/status/route.ts
    - app/api/auth/telegram-bot/consume/route.ts
    - tests/integration/telegram-bot-login.test.ts
    - prisma/migrations/20261005113459_telegram_login_token/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/env.ts
    - lib/bot.ts
    - lib/i18n/messages/ru.ts
    - .env.example
key-decisions:
  - "Claim = HMAC_SHA256(token, SESSION_SECRET) hex stored only in an httpOnly cookie scoped to /api/auth/telegram-bot; consume requires it so only the issuing browser can mint a session (T-06-06-01)."
  - "Token = 24 random bytes hex (48 chars) so the login_ start parameter fits Telegram's 64-byte cap; TTL 10 minutes."
  - "getMe fallback implemented as a direct fetch in lib/telegram-login.ts (not by importing lib/bot.ts) to avoid the bot singleton's polling launch side effect in routes/tests."
  - "Throttle keyed by sha256(issuer IP): raw IP never persisted; max 20 tokens per rolling hour."
patterns-established:
  - "Bot-redirect login: issue token + claim cookie → t.me deep link → bot binds telegramId → atomic single-use consume into the shared session."
requirements-completed: [AUTH-02, AUTH-03]
coverage:
  - id: D1
    description: "Cabinet can issue a short-lived login token and a t.me deep link, with an httpOnly claim cookie binding the token to the issuing browser"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/telegram-bot-login.test.ts#request issues a one-time token, deep link, and httpOnly claim cookie"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pressing Start in the bot with login_<token> binds the token to that Telegram user (idempotent, different id rejected)"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/telegram-bot-login.test.ts#status is pending, then ready once the bot binds; binding a different telegramId is rejected"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cabinet polling sees the bind and mints the same httpOnly session exactly once; replay/expiry/unknown fail closed"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/telegram-bot-login.test.ts#consume mints the shared httpOnly session; double consume; expired token; unknown token"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stolen or replayed tokens cannot yield another browser's session (claim-cookie anti-fixation + per-IP throttle)"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/telegram-bot-login.test.ts#missing or wrong claim cookie is 401; per-IP throttle trips"
        status: pass
    human_judgment: false
actuals:
  tokens: 7694
  tasks: 3
  commits: 3
metrics:
  duration: 4min
  started: 2026-10-05T11:34:08Z
  completed: 2026-10-05T11:37:51Z
  tasks: 3
  files: 11
status: complete
---

# Phase 06 Plan 06: Bot-Redirect Login Spine — Summary

**One-time bot-redirect login handshake: cabinet-issued token with an HMAC claim cookie, bot `/start` bind, and atomic single-use consume into the shared httpOnly session (G-06-4b).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-05T11:34:08Z
- **Completed:** 2026-10-05T11:37:51Z
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- `TelegramLoginToken` model + migration (`telegram_login_tokens`): 48-hex one-time token, `ip_hash` (sha256 of issuer IP), nullable `telegram_id`, 10-min TTL, `consumed_at`, `expires_at` index.
- `lib/telegram-login.ts` server-only handshake service: `issueLoginToken` (per-IP throttle, 20/hour), `bindLoginToken` (idempotent per telegramId, rejects a different one), `consumeLoginToken` (timing-safe HMAC claim check + atomic single-use consume + user upsert), plus `resolveBotUsername` / `buildBotLoginUrl` / `buildClaimCookie` / `parseLoginStartPayload`.
- Three BFF routes (`request`/`status`/`consume`) following the established auth skeleton; `consume` mints the SAME httpOnly session cookie every other method uses (D-86).
- Bot `/start` now binds `login_<token>` payloads and replies keyed copy, falling through to the unchanged welcome for all non-login starts.
- 10 integration vectors covering every must_have truth, including fixation, replay, expiry, no-oracle, throttle, and cross-id reject.

## Task Commits

Each task was committed atomically:

1. **Task 1: TelegramLoginToken model + service** - `e2b1412` (feat)
2. **Task 2: BFF routes + bot start-payload handler** - `0b7764f` (feat)
3. **Task 3: Integration tests for the handshake** - `1803f22` (test)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `prisma/schema.prisma` — `TelegramLoginToken` model (one-time guard, no FK: token precedes any users row).
- `prisma/migrations/20261005113459_telegram_login_token/migration.sql` — creates `telegram_login_tokens` + expiry index.
- `lib/telegram-login.ts` — handshake service (issue/bind/consume + bot-url + claim cookie).
- `lib/env.ts` — optional `TELEGRAM_BOT_USERNAME` (server-only; `getMe()` fallback when unset).
- `app/api/auth/telegram-bot/request/route.ts` — POST issues token + deep link, sets claim cookie, 429 on throttle.
- `app/api/auth/telegram-bot/status/route.ts` — POST `{ token }` → `{ status: pending|ready|consumed|expired }`; read-only, no oracle.
- `app/api/auth/telegram-bot/consume/route.ts` — POST `{ token }` + claim cookie → atomic consume + session mint; 401 on claim mismatch, 409 `login_not_ready` otherwise.
- `lib/bot.ts` — `/start` login-payload branch (import `bindLoginToken`, `parseLoginStartPayload`).
- `lib/i18n/messages/ru.ts` — `bot.loginBound`, `bot.loginInvalid`.
- `.env.example` — documents `TELEGRAM_BOT_USERNAME` (owner user_setup).
- `tests/integration/telegram-bot-login.test.ts` — 10 handshake vectors.

## Frozen Server Contract (for plan 06-07 client)

| Endpoint | Body | Success | Errors |
|----------|------|---------|--------|
| `POST /api/auth/telegram-bot/request` | none | `200 { token, botUrl, expiresInSec }` + `Set-Cookie: tg_login_claim=…; HttpOnly; SameSite=Lax; Path=/api/auth/telegram-bot; Max-Age=600` | `429 { error:"rate_limited", retryAfterSec }`, `500 { error:"internal" }` |
| `POST /api/auth/telegram-bot/status` | `{ token }` | `200 { status: "pending"\|"ready"\|"consumed"\|"expired" }` (unknown/malformed-shape → `expired`) | `400 { error:"bad_request" }`, `500` |
| `POST /api/auth/telegram-bot/consume` | `{ token }` + claim cookie | `200 { ok:true }` + `Set-Cookie: 3set_session=…` (same cookie as all auth) | `400 bad_request` (malformed), `401 unauthorized` (claim mismatch/missing), `409 { error:"login_not_ready" }` (unknown/expired/unbound/already-consumed), `500` |

`botUrl` = `https://t.me/<TELEGRAM_BOT_USERNAME>?start=login_<token>`. Client flow: `request` → open `botUrl` → poll `status` until `ready` → `consume` (cookie jar sends the claim automatically because `Path=/api/auth/telegram-bot`) → navigate to the cabinet.

## Decisions Made

- **Claim-cookie anti-fixation (T-06-06-01):** claim is `HMAC_SHA256(token, SESSION_SECRET)` hex, returned only as an httpOnly cookie scoped to the bot-login route prefix; `consume` requires it, so a leaked/observed token alone cannot mint another browser's session.
- **Atomic single-use (T-06-06-02):** consume is one `updateMany` (`consumed_at IS NULL AND expires_at > now AND telegram_id IS NOT NULL`) with a `count === 1` guard inside `$transaction`; the winner upserts the user row in the same transaction. Bind uses the parallel `telegram_id IS NULL → tg` single-winner transition and is idempotent for the same id.
- **No-oracle status (T-06-06-03):** unknown and shape-invalid tokens both report `expired`; no user data is returned by request/status.
- **getMe without the bot singleton:** the deep-link fallback is a direct `fetch` in `lib/telegram-login.ts` (mode-selected token, success cached) rather than importing `lib/bot.ts`, avoiding its polling `launch()` side effect at route import time.
- **PII-safe throttle (T-06-06-04):** throttle counts rows by `ipHash = sha256(ip)` over a rolling hour; raw IP never persisted. 20 issues allowed, 21st → 429 with server-computed `retryAfterSec`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `TELEGRAM_BOT_USERNAME` to `lib/env.ts` in Task 1**
- **Found during:** Task 1 (service)
- **Issue:** `lib/telegram-login.ts` reads `env.TELEGRAM_BOT_USERNAME`, but the env key was only scheduled for Task 2 — `tsc --noEmit` failed on the missing property.
- **Fix:** Added the optional server-only key to `envSchema`. The plan lists `lib/env.ts` under Task 2; committing it with Task 1 keeps the task self-consistent (the service would not compile otherwise).
- **Files modified:** `lib/env.ts`
- **Verification:** `npx tsc --noEmit` clean; `tests/unit/env.test.ts` (7 tests) still green.
- **Committed in:** `e2b1412` (part of Task 1 commit)

**2. [Rule 2 - Missing critical functionality] Documented `TELEGRAM_BOT_USERNAME` in `.env.example`**
- **Found during:** Task 2 (routes)
- **Issue:** The plan's `user_setup` introduces a new env var; without a template entry operators would not know to set it (a missing var silently falls back to a network `getMe`).
- **Fix:** Added a commented placeholder mirroring `BOT_PUBLIC_USERNAME`, noting it must match.
- **Files modified:** `.env.example`
- **Verification:** No test reads `.env.example`; `env.test.ts` unaffected (key is optional).
- **Committed in:** `0b7764f` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 2 critical-functionality)
**Impact on plan:** Both are minimal and necessary — no scope creep; no new dependencies; no architectural changes.

## Issues Encountered

None — the `getMe`-import side-effect (bot polling launch) was avoided up front by using a direct fetch resolver, so integration tests never touch the Telegram API.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. All five registered threats are mitigated and covered by integration vectors:

| Threat | Mitigation | Test |
|--------|-----------|------|
| T-06-06-01 Spoofing (fixation) | Claim cookie required by consume | `missing or wrong claim cookie is 401` |
| T-06-06-02 Tampering (replay) | Atomic single-use + TTL + idempotent/rejecting bind | `double consume`, `expired token`, `different telegramId rejected` |
| T-06-06-03 Info disclosure (oracle) | Unknown/malformed → `expired`; no user data | `unknown token reports expired with no oracle` |
| T-06-06-04 DoS (issuance) | Per-IP throttle 20/hour → 429 | `per-IP throttle trips after 20 issues` |
| T-06-06-05 Spoofing (start payload) | Shape-gated `login_` + 48 hex | `rejects garbage bodies with 400` + parse gate cover |

## User Setup Required

`TELEGRAM_BOT_USERNAME` (BotFather username, without `@`) should be set so `request` builds the deep link without a `getMe()` round-trip. It must match the client's `BOT_PUBLIC_USERNAME`. When unset the route falls back to a cached `getMe()`.

## Verification

- `npx tsc --noEmit` — clean.
- `npx prisma validate` — valid; `npx prisma migrate dev` applied `20261005113459_telegram_login_token` on the local `setwhite` DB.
- `npx vitest run tests/integration/telegram-bot-login.test.ts` — 10/10 pass.
- `npx vitest run` — 44 files, 398 tests pass; no regressions.

## Next Phase Readiness

Ready for plan 06-07, which renders the bot button on `/login`, polls `status`, and calls `consume` against the frozen contract above. No blockers. Strictly client-side follow-on; the server spine is complete and committed.

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*

## Self-Check: PASSED

- All 5 created source/test files + migration exist on disk.
- Commits e2b1412, 0b7764f, 1803f22 present.
- `npx tsc --noEmit` clean; `npx vitest run` 398/398 pass.
