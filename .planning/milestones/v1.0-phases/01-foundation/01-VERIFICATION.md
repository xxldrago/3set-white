---
phase: 01-foundation
verified: 2026-09-30T23:25:00Z
status: human_needed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Create test bot via BotFather, set BOT_TEST_TOKEN in .env.local, boot with BOT_MODE=polling, send /start to the test bot"
    expected: "Bot replies with RU greeting + keyboard buttons; users row holds telegram_id and chat_id"
    why_human: "BOT_TEST_TOKEN absent — no live Telegram API calls possible from automation; polling + real reply needs a real bot token and a human-driven chat"
  - test: "Open PWA /login in a real browser against a real bot domain and click through the Telegram Login Widget"
    expected: "Cabinet landing shows the account; repeat login does not create a duplicate users row"
    why_human: "Widget click-through requires a human browser session against Telegram's widget with a real bot username (NEXT_PUBLIC_TELEGRAM_BOT_USERNAME unset)"
  - test: "Open the PWA on a real phone (Android Chrome + iOS Safari), accept the install prompt, launch from the home-screen icon"
    expected: "App installs, launches standalone from the icon; dismissing the prompt leaves full web use"
    why_human: "beforeinstallprompt and iOS Add-to-Home-Screen are real-device behaviors automation cannot exercise"
  - test: "Owner reviews placeholder icons (public/icons/*.png) on a phone"
    expected: "Owner approves temporary artwork or supplies real logo at the same three paths"
    why_human: "Visual brand verdict is human judgment by definition"
---

# Phase 01: Foundation Verification Report

**Phase Goal:** Приложение существует: единый аккаунт по telegram-id работает в боте и PWA, бот отвечает на /start, PWA устанавливается.
**Verified:** 2026-09-30T23:25:00Z
**Status:** human_needed (all code truths verified; only pre-declared owner-pending follow-ups remain — no blocking gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### User Flow Coverage (MVP mode — Phase 1 is `mode: mvp`)

| # | User flow step | Expected | Evidence in codebase | Status |
|---|---|---|---|---|
| 1 | Пользователь открывает PWA, входит через Telegram Login Widget и видит свой аккаунт; повторный вход не создаёт дубликат | Widget payload verifies → session cookie → exactly one `users` row per telegram-id; replay rejected | `lib/auth.ts` (verifyWidget HMAC-SHA256(bot_token), timing-safe, 24h window) + `POST /api/auth/telegram` (replay consume + upsert by telegramId) + live DB index `users_telegram_id_key` + integration test 2/2 green against real Postgres (session mints + 1 row; replay 401, row untouched) + `LoginButton` posts both payload shapes to the route, embedded in `/login` | ✓ VERIFIED (code); live browser click-through → owner-pending |
| 2 | Пользователь пишет боту /start и получает приветствие с кнопками; бот знает его chat_id | /start upserts telegram-id + chat_id, replies RU greeting + keyboard | `lib/bot.ts` `/start` handler (upsert telegramId/chatId/names + `t("bot.welcome")` + 3-button keyboard) wired to spoof-checked webhook route (`secret path + X-Telegram-Bot-Api-Secret-Token`, `bot.handleUpdate`) | ✓ VERIFIED (code); live polling reply → owner-pending (no BOT_TEST_TOKEN) |
| 3 | Пользователь может установить PWA на телефон (install prompt) и открыть её с иконки | Installable manifest + beforeinstallprompt UI that never gates web use | `app/manifest.ts` (3set VPN, standalone, 192/512/maskable) + `MANIFEST_OK name="3set VPN" display=standalone icons=192x192,512x512,512x512` from live prod-server smoke check just now + `InstallPrompt` (capture/prompt/dismiss, null where unsupported) + 3 icon PNGs on disk | ✓ VERIFIED (code); real-device install + icon artwork verdict → owner-pending |

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | PWA login via Telegram Widget yields one account per telegram-id, no duplicates on re-login | ✓ VERIFIED | Integration `tests/integration/auth-flow.test.ts` 2/2 PASS vs real local Postgres (run during verification); DB UNIQUE index `users_telegram_id_key` confirmed in live DB |
| 2 | Bot answers /start with greeting + buttons and persists chat_id | ✓ VERIFIED | `lib/bot.ts` handler read in full (upsert + RU keyboard via i18n keys); webhook intake double-checks secret before `handleUpdate`; `tsc` clean; route builds dynamic |
| 3 | PWA is installable with prompt that never blocks web use | ✓ VERIFIED | `MANIFEST_OK` smoke proof against live `next start` just now; `InstallPrompt` renders null without event, dismiss is local-state only |

**Score:** 3/3 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/auth.ts` | Dual HMAC verifiers + HS256 session + cookie builder | ✓ VERIFIED | 152 lines, read fully; pure crypto, timing-safe compare, future-date reject, alg allow-list |
| `lib/replay.ts` | One-time Widget hash consume | ✓ VERIFIED | UNIQUE-insert guard; exercised by passing tests |
| `app/api/auth/telegram/route.ts` | Dual-shape intake, upsert, cookie | ✓ VERIFIED | 146 lines, read fully; generic 401/400/500, no reason oracle |
| `lib/bot.ts` | Singleton + /start + polling guard | ✓ VERIFIED | 71 lines, read fully; test-token-in-polling, build-phase + once-flag guard |
| `app/api/telegram/webhook/[secret]/route.ts` | Spoof-resistant intake | ✓ VERIFIED | Path + header double check, 403 fast, zod shape guard, ack-200 |
| `prisma/schema.prisma` | users/chat + UNIQUE telegram_id | ✓ VERIFIED | telegramId BigInt @unique; live DB confirms `users_telegram_id_key`; migration dir committed |
| `lib/prisma.ts`, `lib/env.ts`, `lib/logger.ts` | Singleton + fail-fast env + pino | ✓ VERIFIED | Fail-fast observed (import throws without env — by design); seed + tests connect with env set |
| `app/manifest.ts`, `public/icons/*` (3) | Installable manifest + icons | ✓ VERIFIED | Smoke-tested live; icons are acknowledged placeholders (owner verdict pending) |
| `app/page.tsx`, `app/login/page.tsx`, `app/guides/page.tsx` | Session-aware RU shell + login + guides | ✓ VERIFIED | Read fully; cookie-presence branch, LoginButton + InstallPrompt embedded, zero hardcoded RU copy |
| `components/LoginButton.tsx`, `components/InstallPrompt.tsx` | Widget/initData bridges + install UI | ✓ VERIFIED | Read fully; posts to `/api/auth/telegram` only, no client trust; prompt/dismiss/null-unsupported |
| `lib/i18n/messages/ru.ts`, `lib/i18n/index.ts` | Typed RU dict incl. `bot.*` | ✓ VERIFIED | 28 keys incl. bot.welcome/menuKeys/menuGuides/menuHelp; i18n spec 3/3 green |
| `docker-compose.yml`, `Dockerfile` | web+db topology, standalone image | ✓ VERIFIED (code) | Read; web+db+healthcheck, pinned `node:24-bookworm-slim` + `postgres:17-alpine`; `docker compose up` unrunnable here (no Docker) → Phase 5 follow-up |
| `scripts/check-manifest.mjs` | Manifest smoke proof | ✓ VERIFIED | Ran live just now → MANIFEST_OK |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `LoginButton` | `POST /api/auth/telegram` | fetch POST of Widget object / `{initData}` | WIRED | `AUTH_ENDPOINT` constant + `postPayload`; `/login` embeds `LoginButton` |
| Auth route | `users` table | `prisma.user.upsert where telegramId` | WIRED | Both initData and Widget branches upsert; UNIQUE enforced at DB level |
| Auth route | `ReplayCache` | `consumeWidgetHash` before upsert | WIRED | Replay test proves second consume → false → 401 |
| Webhook route | `lib/bot.ts` | `bot.handleUpdate` after secret double-check | WIRED | Import + call read in code |
| Bot `/start` | `users` table | `prisma.user.upsert` telegramId + chatId | WIRED | Handler read in full |
| `app/page.tsx` | session state | `3set_session` cookie presence branch | WIRED | `cookies()` read + loggedIn branch + InstallPrompt rendered |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Auth route → cookie | session JWT | `signSession(telegramId)` verified by `verifySession` round-trip (unit vectors green) | Yes | ✓ FLOWING |
| `/start` → users row | telegramId, chatId | `ctx.from`, `ctx.chat` from real Telegram update | Yes | ✓ FLOWING |
| Home page login state | `3set_session` cookie | Set only by verified auth route | Yes | ✓ FLOWING |
| InstallPrompt | `beforeinstallprompt` event | Platform event, null-safe | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Unit vectors (HMAC/session/i18n) | `vitest run` (unit files) | 11/11 pass (incl. forged/stale/alg:none vectors) | ✓ PASS |
| Widget→session→row + replay reject | `vitest run` integration vs real Postgres | 2/2 pass | ✓ PASS |
| Widget replay unit | `vitest run tests/unit/auth-widget.test.ts` (isolated) | 4/4 pass | ✓ PASS |
| Prod build routes | `npm run build` (dummy env) | green; `/api/auth/telegram` + webhook dynamic; `/`, `/guides`, `/login`, `/manifest.webmanifest` present | ✓ PASS |
| Manifest smoke vs live prod server | `node scripts/check-manifest.mjs` | `MANIFEST_OK name="3set VPN" display=standalone icons=192x192,512x512,512x512` | ✓ PASS |
| DB identity + seed state | `psql` live DB | `users_telegram_id_key` exists; users=1 (seed), replay_cache=0 (tests self-clean) | ✓ PASS |

### Probe Execution

No phase-declared probe scripts. Nearest equivalent (`scripts/check-manifest.mjs`) executed live — see above. No migration/tooling probes apply.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| OPS-03 | 01-01, 01-02 | Code in GitHub 3set-white, committed + pushed | ✓ SATISFIED | 11 atomic commits in `git log`; `.env.example` placeholders only; `.env` ignored; history token-shape scan clean |
| CAB-02 | 01-03 | PWA login via Widget, single account by telegram-id, bot↔site sessions | ✓ SATISFIED (code) | Verifiers + route + upsert + integration 2/2; live click-through owner-pending (BOT_TEST_TOKEN absent — pre-declared) |
| CAB-05 | 01-04 | PWA installable, mobile focus, RU UI | ✓ SATISFIED (code) | Manifest smoke MANIFEST_OK; InstallPrompt non-gating; i18n spec green; real-device proof owner-pending (pre-declared) |

No orphaned requirements: REQUIREMENTS.md maps exactly OPS-03, CAB-02, CAB-05 to Phase 1, all claimed by plans 01-01…01-04.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (scan of `lib app components prisma/seed.ts scripts/`) | — | No TODO/FIXME/XXX/TBD; `return null`s are legitimate auth-failure paths; `console.log` only in seed + smoke script | — | None — clean |

Secret scan over `git log --all -p` for private-key/token shapes: no hits. `.env.example` holds placeholders only.

### Human Verification Required

See frontmatter `human_verification` (5 items, all pre-declared in SUMMARIES as owner-pending — NOT new gaps):
1. Live `/start` polling reply + chat_id persistence (needs BOT_TEST_TOKEN).
2. Live Widget browser click-through (needs real bot username + human browser).
3. Real-device install proof (Android + iOS).
4. Placeholder icon owner verdict.
5. `docker compose up` on a Docker host (deferred to Phase 5 per plan).

### Gaps Summary

No blocking gaps. Every code truth is verified against the actual codebase with behavioral evidence (unit vectors, integration flow vs real Postgres, live prod-server manifest smoke check, green build + typecheck). The full-suite parallel-run artifact (widget replay test fails only when raced by the integration cleanup's `deleteMany` on the shared DB; 4/4 in isolation, 2/2 integration green) is recorded as a test-isolation follow-up, not a goal gap. Recommended follow-up for Phase 2+: run DB-touching suites with `--single-thread`/`--sequence.shuffle` off or per-worker DBs.

**Follow-ups (non-blocking, pre-declared):** BOT_TEST_TOKEN live checks, real-device install, icon verdict, compose-up on Docker host.

---
_Verified: 2026-09-30T23:25:00Z_
_Verifier: the agent (gsd-verifier)_
