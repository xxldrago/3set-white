---
phase: 01-foundation
plan: '03'
subsystem: auth
tags: [telegram, hmac, jose, telegraf, webhook, replay-guard, vitest]

# Dependency graph
requires:
  - phase: 01-foundation-01
    provides: [vitest runner with Wave 0 stub specs, pinned telegraf/jose/zod/pino deps]
  - phase: 01-foundation-02
    provides: [users table with telegram_id UNIQUE, ReplayCache model, prisma singleton, zod env, pino logger]
  - phase: 01-foundation-04
    provides: [LoginButton posting Widget and initData shapes to /api/auth/telegram, i18n completeness spec]
provides:
  - Dual Telegram HMAC verifiers (Widget + initData) with timing-safe compare and 24h window
  - jose HS256 session mint/verify plus httpOnly cookie builder (secure-in-prod)
  - POST /api/auth/telegram accepting either payload shape, one-time replay consume, users upsert by telegram id
  - Module-singleton Telegraf bot with /start skeleton persisting chat_id plus spoof-resistant webhook intake
  - Green adversarial vectors (12 unit) plus end-to-end Widget-to-row flow test (2 integration)
affects: [01-foundation-04, phase-2-trial-keys, phase-3-payments, phase-4-tickets]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff, lockfile excluded), never a harness token count.
actuals:
  tokens: 7100
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-crypto auth module importable without Next runtime, sequential zod safeParse per payload shape, secret path plus header webhook double-check, ack-200 on handler errors]

key-files:
  created: [lib/auth.ts, lib/replay.ts, app/api/auth/telegram/route.ts, app/api/telegram/webhook/[secret]/route.ts, lib/bot.ts, tests/integration/auth-flow.test.ts]
  modified: [tests/unit/auth-widget.test.ts, tests/unit/auth-initdata.test.ts, tests/unit/session.test.ts, lib/i18n/messages/ru.ts, vitest.config.ts]

key-decisions:
  - "lib/auth.ts kept pure (node:crypto + jose, secrets as params, no next/headers or env import) so unit tests run hermetically; cookie serialization is a string builder, the route sets raw Set-Cookie"
  - "Auth route validates initData and Widget shapes with sequential safeParse (initData precedence) instead of z.union — a looseObject member defeats TS 'in' narrowing (TS2345)"
  - "lib/bot.ts launch() additionally guarded by NEXT_PHASE build-phase check plus a globalThis once-flag so next build collection and dev HMR never double-launch polling"
  - "BOT_TEST_TOKEN absent from the environment: all fixtures use synthetic throwaway tokens; live browser login stays an explicit manual item, never faked or silently skipped"

patterns-established:
  - "Relative imports in lib/ and route files so vitest can import route handlers directly (no @/ alias in vitest config)"
  - "Test-only env lives in shell exports (dummy throwaway values), never in files; surface that demands it: any suite importing lib/env transitively"
  - "Integration specs live under tests/ and vitest include covers tests/** (was tests/unit only)"

requirements-completed: [CAB-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "One genuine Widget payload verifies, consumes one-time, mints a session cookie, and persists exactly one users row; replay of the same hash is rejected"
    requirement: "CAB-02"
    verification:
      - kind: integration
        ref: "tests/integration/auth-flow.test.ts (2 passed: mints session + persists one row, rejects replay)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Adversarial vectors: Widget genuine/forged/stale/replayed, initData genuine/tampered/missing-hash/stale, session roundtrip/wrong-secret/alg-none/tampered"
    requirement: "CAB-02"
    verification:
      - kind: unit
        ref: "tests/unit/auth-widget.test.ts + tests/unit/auth-initdata.test.ts + tests/unit/session.test.ts (12 passed, 0 skipped)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/start upserts telegram id plus chat id with RU menu; webhook rejects forged calls before Telegraf; build compiles both API routes as dynamic"
    requirement: "CAB-02"
    verification:
      - kind: other
        ref: "npx tsc --noEmit clean + npm run build (routes /api/auth/telegram, /api/telegram/webhook/[secret] dynamic) + POLLING_GUARDED grep"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live browser login click-through (Widget on real domain + test bot) proves the owner-visible end of CAB-02"
    requirement: "CAB-02"
    verification: []
    human_judgment: true
    rationale: "Needs BOT_TEST_TOKEN from BotFather (absent) plus a human-driven browser session against a real bot; automation cannot click Telegram's widget or judge the cabinet landing"

# Metrics
duration: 10min
completed: 2026-09-30
status: complete
---

# Phase 01 Plan 03: Telegram Identity + Bot Skeleton + Webhook Intake Summary

**Dual Telegram HMAC verifiers plus jose httpOnly sessions plus replay guard plus /start skeleton with spoof-resistant webhook intake — one telegram id maps to exactly one users row from bot and PWA alike**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-30T13:05:09Z
- **Completed:** 2026-09-30T13:14:35Z
- **Tasks:** 3 of 3
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- `lib/auth.ts` verifies classic Widget HMAC (`SHA256(bot_token)` key) and WebApp initData HMAC (`WebAppData` key) with length-guarded `timingSafeEqual`, try-catch false paths, future-date rejection, and a 24h `auth_date` window; mints/verifies HS256 sessions with an explicit algorithm allow-list
- `POST /api/auth/telegram` accepts either payload shape, consumes the Widget hash one-time via `ReplayCache`, upserts the single `users` row by `telegramId`, sets the httpOnly lax session cookie (secure in prod only), and maps every failure to generic 400/401/500 bodies with no reason oracle
- Tracer flow test posts a genuine Widget payload through the real route handler into the real database: 200 + session cookie round-tripping to the same telegram id + exactly one persisted row; the identical replay returns 401 with the row untouched
- All 12 adversarial unit vectors execute and pass with zero skips (forged/stale/replayed Widget; tampered/missing-hash/stale initData; wrong-secret/alg:none/tampered session)
- `lib/bot.ts` singleton selects the test token in polling mode and the prod token otherwise, `launch()` guarded behind polling mode + build-phase + once-flag; `/start` upserts telegram id + chat id and replies with the RU skeleton menu; the secret-path webhook route double-checks path + `X-Telegram-Bot-Api-Secret-Token` header (403 fast) with a minimal zod shape guard
- `tsc --noEmit` clean, full suite 17/17 green, `npm run build` compiles both API routes as dynamic server routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer: one genuine payload travels Widget-verify to session to users row** - `e4e382a` (feat)
2. **Task 2: Adversarial vectors fill the Wave 0 stubs** - `c16cd58` (test)
3. **Task 3: Bot singleton plus /start skeleton plus webhook intake** - `8e2da62` (feat)
4. **Follow-up fix: separate zod parses for initData vs Widget branches** - `d6fb81c` (fix: type error in the task-1 route file surfaced by the task-3 typecheck; behavior unchanged)

## Files Created/Modified

- `lib/auth.ts` - verifyWidget + verifyInitData + signSession/verifySession + buildSessionCookie (pure, Next-free)
- `lib/replay.ts` - consumeWidgetHash one-time insert guard (D-11)
- `app/api/auth/telegram/route.ts` - dual-shape intake, replay consume, users upsert, session cookie, generic failures
- `app/api/telegram/webhook/[secret]/route.ts` - secret path + header double check, zod shape guard, ack-200 discipline
- `lib/bot.ts` - Telegraf singleton, /start upsert + RU menu, polling-guarded launch
- `tests/integration/auth-flow.test.ts` - tracer flow: session + single row + replay rejection against real Postgres
- `tests/unit/auth-widget.test.ts` - 4 known-answer Widget vectors (was skipped stub)
- `tests/unit/auth-initdata.test.ts` - 4 initData vectors (was skipped stub)
- `tests/unit/session.test.ts` - 4 session vectors incl. alg:none (was skipped stub)
- `lib/i18n/messages/ru.ts` - 4 `bot.*` keys (D-16; keeps the unused-keys spec green)
- `vitest.config.ts` - include widened `tests/unit/**` → `tests/**` so the integration spec is collected

## Decisions Made

- Kept `lib/auth.ts` pure (secrets as function params, no `next/headers`, no env import): unit tests stay hermetic and the integration test imports the route handler directly. Cookie flags follow the RESEARCH pattern via a string builder instead of `cookies()`.
- Replaced the planned `z.union` with sequential `safeParse` calls (initData precedence): a `looseObject` Widget member defeats TS `in`-narrowing on the union, which `tsc` rejected (TS2345). Runtime behavior is identical to the plan.
- `launch()` guard is triple: `BOT_MODE === 'polling'` (test token selected above it) + `NEXT_PHASE !== 'phase-production-build'` + `globalThis` once-flag. The build-phase clause is cheap insurance because `next build` collects route modules that import the singleton.
- `BOT_TEST_TOKEN` is absent from the environment, so no live-bot verification was possible: every fixture uses synthetic throwaway tokens, and the live browser login is recorded below as an explicit pending manual item (per the plan's ASSUMP-CAB-02-E2E) — not faked, not silently skipped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest include excluded tests/integration, so the plan's own verify command collected zero integration tests**
- **Found during:** Task 1 (Tracer verify ran only the unit files)
- **Issue:** `vitest.config.ts` included `tests/unit/**/*.test.ts` only; positional CLI filters apply after include-globbing, so `tests/integration/auth-flow.test.ts` was silently skipped
- **Fix:** Widened include to `tests/**/*.test.ts` (one line; `npm test` / `npx vitest run tests/unit` filters keep working)
- **Files modified:** vitest.config.ts
- **Verification:** Re-ran the exact plan verify command — integration file collected, 2/2 pass
- **Committed in:** e4e382a (part of task commit)

**2. [Rule 3 - Blocking] Route-to-lib relative import depth miscounted (4 levels used, 5 exist)**
- **Found during:** Task 1 (integration suite failed to import the route)
- **Issue:** `app/api/auth/telegram/route.ts` used `../../../lib/*`; the file sits 4 directories deep so the correct prefix is `../../../../lib/*`
- **Fix:** Corrected all five lib imports (same 5-up depth applied to the webhook route from the start)
- **Verification:** Suite imports resolve; flow test green
- **Committed in:** e4e382a (part of task commit)

**3. [Rule 2 - Missing critical] Task 3 file list omitted the `bot.*` i18n keys, leaving hardcoded RU copy or an unused-keys failure**
- **Found during:** Task 3 (`/start` reply + menu buttons are user-visible strings; D-16 requires key-based strings)
- **Issue:** No `bot.*` keys existed in `ru.ts`; hardcoding RU in `lib/bot.ts` would violate D-16 and the 01-04 zero-hardcoded-copy precedent
- **Fix:** Added 4 keys (`bot.welcome`, `bot.menuKeys`, `bot.menuGuides`, `bot.menuHelp`), all consumed via `t()` literals in `lib/bot.ts`
- **Verification:** `tests/unit/i18n.test.ts` green (no missing, no unused); full unit run 15/15
- **Committed in:** 8e2da62 (part of task commit)

**4. [Rule 1 - Bug] `z.union` + `in`-narrowing rejected by tsc (TS2345) in the auth route**
- **Found during:** Task 3 verify (`tsc --noEmit` over the combined tree)
- **Issue:** With a `looseObject` Widget member, `"initData" in parsed.data` does not narrow the union, so `parsed.data.initData` stays `unknown`
- **Fix:** Sequential `safeParse` (initData first, then Widget) with precise per-branch types; initData precedence documented
- **Verification:** `tsc --noEmit` clean; full suite re-run 17/17 green
- **Committed in:** d6fb81c (follow-up fix commit — the fault lay in the task-1 file but surfaced under the task-3 gate)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing-critical, 1 bug)
**Impact on plan:** All deviations serve the plan's own acceptance criteria (verify commands collect and pass, no hardcoded copy, typecheck green). No scope creep, no architectural changes (Rule 4 not triggered).

## Issues Encountered

- `npx tsc --noEmit` initially failed on two files: the auth-route union narrowing above and a direct `Update` cast in the webhook route (`as Parameters<...>` insufficiently overlapping → cast via `unknown`). Both fixed without behavior change; the final tree typechecks and builds.
- `npm run build` was smoke-tested with dummy throwaway env: both API routes compile as dynamic (`ƒ`), static pages unaffected. Real-env builds (CI/server) need the same six keys present, per `lib/env.ts`.

## User Setup Required

- **Blocked-by-precondition (plan `user_setup`, live verification only): `BOT_TEST_TOKEN` is absent from the environment — no `.env.local` exists and the variable is unset.** Nothing in this plan was faked around it: all automated tests use synthetic throwaway tokens by design. What still needs the owner before CAB-02 is fully closed:
  1. Create a test bot via BotFather (`/newbot`), keeping the production audience untouched.
  2. Store the token in `.env.local` (gitignored, never committed) as `BOT_TEST_TOKEN=<token>` alongside the other five keys from `.env.example` (`BOT_TOKEN`, `DATABASE_URL`, `SESSION_SECRET`, `WEBHOOK_SECRET`, `BOT_MODE=polling`).
  3. Verify live: `BOT_MODE=polling` dev boot shows `bot-polling-started` with no `409 Conflict`; `/start` to the test bot persists `chat_id`; browser Widget click-through on `/login` lands on the cabinet skeleton with exactly one `users` row for the telegram id.
- No other external setup required. Local Postgres (`setwhite` on Homebrew) covered migrate/seed/proof runs.

## Threat Flags

None beyond the plan's own register — all new surface maps to already-mitigated threats:
- Auth route (untrusted Widget/initData) → T-03-01/T-03-02 (doc-verbatim HMAC, timing-safe compare, 24h window, replay-cache) — pinned by the 12 vectors
- Webhook route (untrusted updates) → T-03-03 (secret path + header double check, 403 fast, shape guard) — verified by build + typecheck; forged-update unit probes arrive with Phase 4 fan-out
- Session cookie → T-03-04 (HS256 allow-list, httpOnly lax, secure-in-prod) — pinned by session vectors
- Bot logging → T-03-05 (update ids + outcomes only; no tokens/JWTs/full updates) — by inspection, no violations found

## Known Stubs

None — no placeholder values flow to any rendering path. The `bot.*` RU strings are final skeleton copy (D-15), not stubs; purchase/trial actions arrive in Phases 2–3.

## Self-Check: PASSED

- All 6 created + 5 modified key files exist on disk (verified via `git status` + task verifications).
- Commits `e4e382a`, `c16cd58`, `8e2da62`, `d6fb81c` exist in `git log`; post-commit deletion check empty on all four.
- `npx tsc --noEmit` clean; `npx vitest run` 5 files / 17 tests green, zero skipped; `npm run build` green with both API routes dynamic.
- Post-run DB state: `users` holds exactly the seed row, `replay_cache` empty — test fixtures clean up after themselves.
- Secret hygiene: token-shape grep over the four commits reports no hits; every test token is labeled THROWAWAY/DUMMY and every real secret stayed in shell env only.

---

*Phase: 01-foundation*
*Completed: 2026-09-30*
