# Phase 1: Foundation - Research

**Researched:** 2026-09-30
**Domain:** Next.js 16 App Router scaffold + Telegraf bot-in-Next + Telegram dual-auth identity + Postgres/Prisma + PWA shell + GitHub repo bootstrap
**Confidence:** MEDIUM-HIGH (core contracts verified verbatim against official docs this session; versions verified against npm registry this session)

## Summary

Phase 1 turns an empty repo into a runnable app: one Next.js process serves the PWA shell and the Telegram bot webhook, one `users` table keyed by `telegram-id` unifies bot and web identity, and Docker Compose defines web+db from day one. No ARTEMIDA/Platega calls, no tickets, no admin — only skeleton, identity, and infrastructure.

Three facts discovered this session shape the plan. First, Telegram's Login Widget documentation has moved: the main `/widgets/login` page now describes a new OIDC flow (`oauth.telegram.org`, JWKS, Client ID/Secret from BotFather), while the classic iframe-widget HMAC check lives on at `/widgets/login-legacy` and still works — the plan should build the classic HMAC verifier now (it matches the locked `lib/auth.ts` design) and treat OIDC as a future migration (see OQ-1). Second, the Prisma `latest` npm tag currently points at `8.0.0-rc.19`, so a bare `npm install prisma` would install a release candidate into a money-handling codebase — every install command must pin `^7.10.0`. Third, Next.js's own PWA guide states install prompts work without offline support, which confirms the locked decision to defer Serwist: `app/manifest.ts` + icons + viewport `themeColor` is the whole Phase 1 PWA scope.

**Primary recommendation:** Scaffold with `create-next-app` (TS + Tailwind, no src-dir ambiguity — pick one layout and stick to it), wire `POST /api/telegram/webhook/[secret]` → `bot.handleUpdate()` with `secret_token` header check, implement `lib/auth.ts` with both HMAC verifiers (Widget `SHA256(bot_token)` key; WebApp `HMAC("WebAppData", bot_token)` key) minting one jose-HS256 httpOnly session, define `users` + `keys_cache` in Prisma 7 pinned, ship `app/manifest.ts` + RU key-dictionary + `/start` skeleton, and create/push GitHub repo `3set-white` — all verified patterns below.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bot runtime**
- **D-01:** Прод — bot-in-Next: один Next.js-процесс, Telegraf через webhook-route `handleUpdate`, один контейнер + Postgres + Nginx — **Reversibility:** costly — сплит на отдельный bot-процесс меняет деплой (второй deployable, отдельные рестарты, общий доступ к БД)
- **D-02:** Dev — polling (`launch()` локально), прод — webhook; режим по env
- **D-03:** Два Bot API токена: прод-бот и отдельный тестовый бот для dev (исключить спам реальным юзерам)
- **D-04:** Структура — single Next app: `app/` + `lib/bot.ts` + webhook-route, без `apps/*` monorepo на старте

**DB setup**
- **D-05:** Postgres 17 + Prisma 7 (`^7.10`, не v8-RC) в Docker с day one, локально тоже через Compose — **Reversibility:** one-way — смена СУБД/ORM позже требует миграции данных и переписывания всех запросов
- **D-06:** `docker-compose.yml` (web + db) создается в Phase 1, Nginx/HTTPS — по минимуму для локального запуска, полный прод-стенд в Phase 5
- **D-07:** Таблицы Phase 1: `users` (ключ `telegram_id`, `chat_id`, создан) + `keys_cache` (зеркало ARTEMIDA: ключ, статус, срок) — заказы/тикеты/outbox в своих фазах
- **D-08:** `prisma migrate` + минимальный seed (тестовый юзер, проверка коннекта)

**Auth (Telegram identity)**
- **D-09:** Оба входа в одну сессию: Telegram Login Widget (web) + WebApp `initData` (вход из бота), один модуль `lib/auth.ts` — **Reversibility:** costly — разделение на две identity-системы ломает связку бот↔кабинет
- **D-10:** Сессии — подписанная httpOnly cookie (jose), никаких JWT в localStorage — **Reversibility:** costly — смена хранилища сессии затрагивает все auth-места (бота, BFF, кабинет)
- **D-11:** Окно `auth_date` 24 часа + одноразовый replay-cache (защита от переигрывания Login Widget)
- **D-12:** Ключ идентичности — `telegram-id`, один `users` на id, дубликаты запрещены на уровне БД (unique) — **Reversibility:** one-way — смена ключа идентичности требует миграции аккаунтов и перепривязки ключей/тикетов

**PWA shell**
- **D-13:** Объем Phase 1 — manifest + базовый shell + install prompt; Serwist/offline отложен (проверяется только на прод-сборке, не в dev под Turbopack)
- **D-14:** PWA показывает: экран входа через Telegram + статические гайды подключения (v2rayNG/Streisand/Hiddify) как скелет кабинета
- **D-15:** `/start` бота — приветствие + меню-кнопки (скелет, без покупки/trial — они в Phase 2–3)
- **D-16:** Строки интерфейса — русские сразу, но через i18n-ключи (EN позже без рефакторинга)

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-03 | Код хранится в GitHub `3set-white`, все изменения коммитятся и пушатся, затем деплой на сервер | Environment Availability (gh CLI present, no remote yet); scaffold-then-push order in Architecture Patterns |
| CAB-02 | Вход в PWA через Telegram Login Widget, единый аккаунт (ключ `telegram-id`), сессии бот ↔ сайт синхронизированы | Dual-HMAC verifier patterns + jose session + replay-cache (Code Examples, Pitfalls); 24h `auth_date` window |
| CAB-05 | PWA устанавливается на устройство (manifest + Serwist), мобильный фокус, RU-интерфейс | `app/manifest.ts` + viewport `themeColor` + install-prompt pattern; Serwist explicitly deferred per D-13 (Next.js docs: install prompts work without offline support) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Telegram update intake (`/start`, `chat_id` capture) | API / Backend (Next Route Handler → Telegraf) | — | Bot token is a secret; updates must hit server code, never the browser |
| Web login verify (Widget HMAC) + WebApp `initData` verify | API / Backend (`lib/auth.ts`, server-only) | — | `BOT_TOKEN` must never ship to client; verification is the trust root |
| Session mint/read (jose HS256 httpOnly cookie) | API / Backend (Route Handlers + `cookies()`) | Browser (cookie store only, opaque) | Browser only stores; all crypto server-side per D-10 |
| PWA shell, login screen, guides, install prompt | Browser / Client (App Router pages) | — | Static-first pages; no server data needed in Phase 1 |
| Users + keys_cache persistence | Database / Storage (Postgres 17 + Prisma 7) | — | Single writer-shared store for bot + web (same process in v1) |
| Local run topology (web + db) | Infrastructure (Docker Compose) | — | Reproducible `up`; Nginx/HTTPS full shape deferred to Phase 5 per D-06 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.7 [VERIFIED: npm registry] | App Router PWA + BFF routes + bot webhook in one process | Pinned by project stack; `app/manifest.ts` is the documented PWA path [CITED: https://nextjs.org/docs/app/guides/progressive-web-apps] |
| react (+ react-dom) | 19.3.0 [VERIFIED: npm registry] | UI, peer of Next 16 | `npm view` confirms; Next 16 requires React 19 [ASSUMED for the requirement link, verified for the version] |
| typescript | ~5.9 strict [ASSUMED] | Type safety | Project pin; TS 7 deferred per STACK.md (ecosystem unverified) |
| telegraf | 4.16.3 [VERIFIED: npm registry] | Bot framework; `handleUpdate` fed by webhook route, `launch()` dev-only | `npm view` confirms; README sanctions custom integrations via `bot.handleUpdate` [CITED: https://github.com/telegraf/telegraf] |
| prisma / @prisma/client | 7.10.0, pin `^7.10.0` (never bare install) [VERIFIED: npm registry] | ORM + migrations for `users` + `keys_cache` | `latest` tag = `8.0.0-rc.19`, `prev` tag = `7.10.0` — verified via `npm view prisma dist-tags` this session |
| postgres (Docker) | `postgres:17-alpine` [ASSUMED] | `users`, `keys_cache` | Locked D-05; matches project stack (local fallback: Homebrew Postgres 16 running — see Environment Availability) |
| tailwindcss | 4.3.3 [VERIFIED: npm registry] | Mobile-first cabinet styling, CSS-first config | `npm view` confirms; v4 needs no `tailwind.config.js` by default |
| jose | 6.2.12 [VERIFIED: npm registry] | Sign/verify HS256 session cookies | Standard JOSE lib; `SignJWT`/`jwtVerify` API confirmed [CITED: https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md] |
| zod | 4.6.5 [VERIFIED: npm registry] | Validate Widget/initData payloads, webhook bodies, env | Project pin; every external boundary gets a schema |
| pino | 10.3.1 [VERIFIED: npm registry] | Structured logging (bot updates, auth attempts) | `npm view` confirms |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 5.0.3 [VERIFIED: npm registry] | Unit tests for HMAC verifiers, replay-cache, i18n keys | Wave 0 install; pure-logic coverage (no E2E in Phase 1) |
| tsx | latest [ASSUMED] | Dev runner if any standalone script needed | Only if a seed/cli script runs outside Next; prefer `prisma db seed` via tsx |
| `undici`-native `fetch` | built-in Node 24 | No HTTP client needed in Phase 1 | Phase 2+ ARTEMIDA/Platega clients |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled RU key-dictionary (`messages/ru.json` + typed `t()`) | `next-intl` | next-intl is the standard for real EN/RU routing, but Phase 1 is RU-only skeleton — a typed dictionary satisfies D-16 with zero deps; adopt next-intl in v2 when EN ships (keys already key-based, no refactor) |
| Classic Widget HMAC verify | Telegram OIDC login (`oauth.telegram.org` + JWKS) | OIDC is Telegram's new documented default, but needs Client ID/Secret via BotFather and a code-exchange round-trip; classic `data-onauth` + HMAC is still documented, simpler, and matches locked `lib/auth.ts` design — see OQ-1 |
| `crypto.timingSafeEqual` compare | `===` on hex strings | `===` leaks timing + throws on length mismatch; always `timingSafeEqual` on buffers (Pitfall 2) |

**Installation:**
```bash
npx create-next-app@latest 3set-white --typescript --tailwind --app --eslint --import-alias "@/*"
npm install telegraf@4.16.3 jose@6.2.12 zod@4.6.5 pino@10.3.1
npm install -D prisma@^7.10.0 vitest@5.0.3 tsx
npm install @prisma/client@^7.10.0
# NEVER bare `npm install prisma` / `npm install -D prisma` — latest tag is 8.0.0-rc.19 [VERIFIED: npm registry]
```

**Version verification:** all versions above confirmed via `npm view <pkg> version` on 2026-09-30 (Node 24.15.0, npm 11.12.1). `prisma` dist-tags: `latest=8.0.0-rc.19`, `prev=7.10.0`, `next=8.0.0-rc.10`.

## Package Legitimacy Audit

Seam check run this session (`query package-legitimacy check --ecosystem npm`, 11 packages). Verdicts `SUS` with sole reason `too-new` are **false positives**: the seam flags the recency of the latest patch publish, while signals show official repos + tens/hundreds of millions of weekly downloads. `postinstall` is `null` for every package (no install-script risk).

| Package | Registry | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------|-------------|---------|-------------|
| next | npm | 70,004,350 | github.com/vercel/next.js | SUS (too-new only) | **Approved** — official repo, mass downloads; flag is patch-recency noise |
| react | npm | 207,637,325 | github.com/react/react | SUS (too-new only) | **Approved** — same rationale |
| telegraf | npm | 334,488 | github.com/telegraf/telegraf | OK | Approved |
| jose | npm | 159,972,561 | github.com/panva/jose | SUS (too-new only) | **Approved** — same rationale |
| zod | npm | 352,091,457 | github.com/colinhacks/zod | SUS (too-new only) | **Approved** — same rationale |
| prisma | npm | 20,087,592 | github.com/prisma/prisma-cli | SUS (too-new only) | **Approved pinned to ^7.10.0** — never bare-install (v8-RC on latest) |
| @prisma/client | npm | 19,244,880 | github.com/prisma/prisma | OK | Approved, pin 7.10.0 |
| tailwindcss | npm | (registry OK) [ASSUMED] | github.com/tailwindlabs/tailwindcss [ASSUMED] | (not seam-checked, version verified) | Approved — version 4.3.3 verified via `npm view` |
| pino | npm | 59,156,593 | github.com/pinojs/pino | OK | Approved |
| vitest | npm | 126,594,893 | github.com/vitest-dev/vitest | SUS (too-new only) | **Approved** — same rationale |
| p-retry | npm | 64,073,568 | github.com/sindresorhus/p-retry | SUS (too-new only) | **Approved, deferred to Phase 2+** (no upstream calls in Phase 1) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none requiring `checkpoint:human-verify` — all SUS flags traced to patch-recency with official-repo + high-download signals; no postinstall scripts anywhere.

## Architecture Patterns

### System Architecture Diagram

```
Telegram API                    Single VPS (Phase 1: local Compose)
───────────                     ────────────────────────────────────
Bot updates ──(prod: webhook)──▶ POST /api/telegram/webhook/[secret]
                                     │ verify X-Telegram-Bot-Api-Secret-Token
                                     ▼
                              bot.handleUpdate(update)   (lib/bot.ts, NO launch())
                                     │ /start → upsert users{telegram_id, chat_id}
                                     ▼ replies via Bot API

Browser ──HTTPS──▶ PWA shell (/, /guides, /login)
                       │ ① Widget data-onauth ──▶ POST /api/auth/telegram
                       │ ② WebApp initData ──────▶ POST /api/auth/telegram
                       ▼                          lib/auth.ts: HMAC verify ×2
                   session cookie ◀── jose HS256, httpOnly, one identity (telegram_id)
                                                  users.telegram_id UNIQUE

docker-compose: web (next start) + db (postgres:17-alpine, volume-persisted)
Phase 5 adds: nginx + Certbot + my.3set.online (D-06: stub/minimum now)
```

### Recommended Project Structure

```
3set-white/
├── app/
│   ├── manifest.ts                  # PWA manifest (MetadataRoute.Manifest)
│   ├── layout.tsx                   # <html lang="ru">, viewport themeColor, metadata
│   ├── page.tsx                     # shell: login state ? кабинет-скелет : экран входа
│   ├── login/page.tsx               # Telegram Login Widget (data-onauth → /api/auth/telegram)
│   ├── guides/page.tsx              # static v2rayNG / Streisand / Hiddify skeleton
│   └── api/
│       ├── auth/telegram/route.ts   # Widget ∪ initData verify → mint session cookie
│       └── telegram/webhook/[secret]/route.ts  # secret_token check → bot.handleUpdate
├── lib/
│   ├── bot.ts        # Telegraf singleton: /start + menu skeleton, no launch() in prod
│   ├── auth.ts       # verifyWidget + verifyInitData + signSession/requireSession
│   ├── replay.ts     # one-time Widget payload cache (hash → used)
│   ├── prisma.ts     # PrismaClient singleton via globalThis
│   ├── env.ts        # zod-validated process.env (BOT_TOKEN, BOT_TEST_TOKEN, DATABASE_URL, SESSION_SECRET…)
│   ├── logger.ts     # pino instance
│   └── i18n/         # messages/ru.ts (typed keys) + t() helper
├── components/
│   ├── LoginButton.tsx   # widget embed (next/script) + initData sender (WebApp bridge)
│   └── InstallPrompt.tsx # beforeinstallprompt capture → «Установить» кнопка
├── prisma/
│   ├── schema.prisma     # users + keys_cache (+ replay_cache table, see below)
│   └── seed.ts           # тестовый юзер + connectivity check
├── public/icons/         # icon-192.png, icon-512.png (+ maskable)
├── docker-compose.yml    # web + db
├── Dockerfile            # node:24-bookworm-slim, standalone output
└── .env.example          # key names only, NO secrets (commit-safe)
```

**Why this shape:** one process, one Prisma client, one auth module — every later phase imports these without restructuring. ARTEMIDA/Platega clients slot into `lib/` in Phases 2–3; `orders`/`tickets`/`outbox` tables extend the same schema.

### Pattern 1: Bot-in-Next via `handleUpdate` (locked D-01)
**What:** the webhook Route Handler verifies the secret header/path, then feeds the raw update into a module-singleton Telegraf instance. Telegraf's own README lists `bot.handleUpdate` as the sanctioned primitive for custom integrations [CITED: https://github.com/telegraf/telegraf] (`webhookCallback`/`createWebhook` target express-style servers, not Route Handlers).
**When to use:** prod webhook path; dev uses `bot.launch()` (long-polling) against the **test** bot token only (D-02/D-03).
**Example:**
```typescript
// Source: Telegraf README (handleUpdate for custom integrations) + Bot API secret_token semantics
// app/api/telegram/webhook/[secret]/route.ts
import { bot, WEBHOOK_SECRET } from '@/lib/bot';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params; // Next 16: params is async [ASSUMED — verify at plan time against installed Next]
  const header = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== WEBHOOK_SECRET || header !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }
  const update = await req.json();
  await bot.handleUpdate(update); // no reply-via-webhook; responses go via Bot API
  return Response.json({ ok: true });
}
```

### Pattern 2: Dual Telegram verifier → one session (locked D-09/D-10)
**What:** `lib/auth.ts` exposes two verifiers that both resolve to `telegram_id`, then mints one jose-HS256 cookie. Widget check (classic): `secret_key = SHA256(bot_token)`, `hex(HMAC_SHA256(data_check_string, secret_key)) == hash`, fields sorted `key=<value>` joined by `\n` [CITED: https://core.telegram.org/widgets/login-legacy]. WebApp check: `secret_key = HMAC_SHA256(bot_token, "WebAppData")`, same data-check-string construction over `initData` pairs [CITED: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app]. Both docs mandate an `auth_date` freshness check — locked to 24 h (D-11).
**When to use:** `POST /api/auth/telegram` accepts either payload shape; both paths upsert the same `users` row.
**Example:** see Code Examples (verifyWidget, verifyInitData, session mint/read).

### Pattern 3: PWA installability without offline (locked D-13)
**What:** `app/manifest.ts` returning `MetadataRoute.Manifest` + 192/512 icons + `display: 'standalone'` is sufficient for the install prompt. Next.js docs state explicitly: "you can trigger install prompts without needing offline support" [CITED: https://nextjs.org/docs/app/guides/progressive-web-apps]. `themeColor` lives in the `viewport` export, **not** `metadata` [CITED: https://nextjs.org/docs/app/api-reference/functions/generate-viewport — v16.3.4]. Serwist arrives in a later phase; its absence must not block the install-prompt verification.
**When to use:** Phase 1 PWA scope, nothing more.

### Anti-Patterns to Avoid
- **Calling `bot.launch()` in prod:** polling + webhook on the same token causes `409 Conflict: terminated by other getUpdates`. Guard: `if (process.env.BOT_MODE === 'polling') bot.launch()` with the **test** token only.
- **Two user tables (bot_users + web_users):** split identity breaks every later phase; one `users` keyed by `telegram_id` UNIQUE from the first migration (D-12).
- **JWT in localStorage:** locked out (D-10) — httpOnly cookie only, else any XSS steals sessions.
- **`themeColor` inside `metadata`:** silently ignored in Next 14+; use the `viewport` export or the PWA has no themed status bar (Pitfall 5).
- **Bare `npm install prisma`:** installs v8-RC via the `latest` tag; always pin `^7.10.0` (Pitfall 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Custom HMAC-cookie crypto | `jose` `SignJWT`/`jwtVerify` (HS256, explicit `algorithms` allow-list) | Silent algorithm-confusion (`alg:none`) and exp-bypass bugs; jose enforces both [CITED: https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md] |
| Env validation | `process.env.X!` sprinkled through code | One zod `envSchema` in `lib/env.ts`, fail-fast at boot | Typo'd `BOT_TOKNE` becomes a 500 in prod instead of a boot error |
| Telegram update dedupe | In-memory `Set<update_id>` | DB-backed guard (or at minimum persistent store) — in-process Set resets on restart/redeploy and Telegram redelivers | Lost-dedupe → double `/start` side effects after every deploy |
| i18n framework (Phase 1) | `next-intl` + routing setup now | Typed `messages/ru.ts` dictionary + `t(key)` | RU-only skeleton doesn't need locale routing; keys are already key-based so v2 EN adoption needs no refactor (D-16) |
| Password/user-table auth | Any credential system | Telegram HMAC identity only | No passwords in scope; a second credential store doubles auth attack surface for zero v1 benefit |

**Key insight:** Phase 1's trust root is two ~20-line HMAC verifiers specified verbatim by Telegram docs — hand-rolling *those* is correct (no library needed, `node:crypto` only), while everything around them (JWT, validation, logging) must be library-owned.

## Common Pitfalls

### Pitfall 1: Prisma v8-RC via unpinned install
**What goes wrong:** `npm install -D prisma` resolves `latest` = `8.0.0-rc.19`; RC ORM in a payments codebase.
**Why it happens:** Prisma moved `latest` to the v8 prerelease line while v7 rides the `prev` tag — verified via `npm view prisma dist-tags` this session [VERIFIED: npm registry].
**How to avoid:** Pin `prisma@^7.10.0` + `@prisma/client@7.10.0`; add a CI/grep guard for `"prisma": "8` or `latest`-resolved installs.
**Warning signs:** `prisma --version` shows `8.0.0-rc.x`; migration diff noise.

### Pitfall 2: Hash compare with `===` or without length guard
**What goes wrong:** `===` on hex digests leaks timing; `crypto.timingSafeEqual` throws if buffers differ in length (DoS via crafted `hash`).
**Why it happens:** Copy-pasting the docs' pseudocode (`hex(...) == hash`) literally.
**How to avoid:** Compare `Buffer.from(computed,'hex')` vs `Buffer.from(received,'hex')` inside `timingSafeEqual`, wrapped in length check + try/catch → `false`. See Code Examples.
**Warning signs:** Auth route throws 500 on garbage input instead of 401.

### Pitfall 3: PrismaClient exhausts connections under dev HMR
**What goes wrong:** Each hot-reload constructs a new client → `Too many connections` against local Postgres.
**Why it happens:** Module re-evaluation in dev; well-known Next+Prisma interaction [ASSUMED — standard community pattern, confirm via Prisma docs at plan time].
**How to avoid:** `globalThis` singleton in `lib/prisma.ts` (Code Examples). Same instance shared by routes + bot + seed.
**Warning signs:** `P1017` / connection refused after a few saves in dev.

### Pitfall 4: Cookie `Secure` breaks localhost login
**What goes wrong:** Session cookie set with `Secure` over `http://localhost` is never stored → login loop in dev.
**Why it happens:** Blindly copying prod cookie flags.
**How to avoid:** `secure: process.env.NODE_ENV === 'production'`, always `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`.
**Warning signs:** `/api/auth/telegram` returns 200 + `Set-Cookie`, but next request has no session.

### Pitfall 5: `themeColor` in `metadata` (removed API)
**What goes wrong:** Status-bar theming silently missing; reviewer thinks PWA theming is broken.
**Why it happens:** Old tutorials put `themeColor` in `metadata`; since Next 14 it lives in the `viewport` export [CITED: https://nextjs.org/docs/app/api-reference/functions/generate-viewport].
**How to avoid:** `export const viewport: Viewport = { themeColor: '#000000' }` in `app/layout.tsx`.
**Warning signs:** No `<meta name="theme-color">` in rendered `<head>`.

### Pitfall 6: Dev polling against the prod token
**What goes wrong:** Test `/start` messages spam real users; worse, polling steals updates from the prod webhook (409s).
**Why it happens:** One `.env` shared between dev and prod, or `BOT_TOKEN` pointing at prod locally.
**How to avoid:** Two tokens (D-03); dev `.env.local` uses `BOT_TEST_TOKEN` + `BOT_MODE=polling`; prod env has `BOT_TOKEN` + `BOT_MODE=webhook`; `deleteWebhook` before first dev `launch()`.
**Warning signs:** `409 Conflict: terminated by other getUpdates` in logs.

### Pitfall 7: Secrets committed to git (project-critical)
**What goes wrong:** `BOT_TOKEN`/`*_SECRET` in `.env` committed → token must be rotated via BotFather, history rewritten.
**Why it happens:** `.env` created before `.gitignore`, or `.env.example` filled with real values.
**How to avoid:** `.gitignore` covers `.env*` (except `.env.example` with placeholder values only) on the **first** commit; `lib/env.ts` zod schema lists required keys so missing env fails fast; pre-commit grep for `BOT_TOKEN=\d+:` pattern [ASSUMED — process control, not a library fact].
**Warning signs:** `git log --all -p | grep -E '[0-9]{8,10}:[A-Za-z0-9_-]{35}'` returns hits.

## Code Examples

Verified patterns from official sources (adapted to this project's locked decisions):

### Widget HMAC verification (classic Login Widget)
```typescript
// Source: https://core.telegram.org/widgets/login-legacy (algorithm quoted verbatim)
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface WidgetPayload {
  id: number; first_name: string; last_name?: string; username?: string;
  photo_url?: string; auth_date: number; hash: string;
}

export function verifyWidget(data: WidgetPayload, botToken: string, maxAgeSec = 86_400): boolean {
  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k as keyof typeof fields]}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest(); // SHA256(<bot_token>)
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest();
  let received: Buffer;
  try { received = Buffer.from(hash, 'hex'); } catch { return false; }
  if (received.length !== computed.length) return false;
  if (!timingSafeEqual(computed, received)) return false;
  const now = Math.floor(Date.now() / 1000);
  return now - data.auth_date <= maxAgeSec; // 24h window per D-11
}
```

### WebApp initData verification
```typescript
// Source: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyInitData(initData: string, botToken: string, maxAgeSec = 86_400): Record<string, string> | null {
  const pairs = new URLSearchParams(initData);
  const hash = pairs.get('hash');
  if (!hash) return null;
  pairs.delete('hash');
  const dataCheckString = [...pairs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest();
  let received: Buffer;
  try { received = Buffer.from(hash, 'hex'); } catch { return null; }
  if (received.length !== computed.length || !timingSafeEqual(computed, received)) return null;
  const out: Record<string, string> = {};
  pairs.forEach((v, k) => { out[k] = v; });
  const authDate = Number(out['auth_date'] ?? 0);
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSec) return null;
  return out; // caller JSON.parses out['user'] → { id, first_name, ... }
}
```

### Replay-cache (Widget one-time use, D-11)
```typescript
// Design: dirty-check via UNIQUE(hash) insert; race-safe under concurrency [ASSUMED — standard pattern]
// Prisma model: model ReplayCache { hash String @id, usedAt DateTime @default(now()) }
import { prisma } from './prisma';

export async function consumeWidgetHash(hash: string): Promise<boolean> {
  try {
    await prisma.replayCache.create({ data: { hash } });
    return true; // first use
  } catch {
    return false; // duplicate → reject as replay
  }
}
// NOTE: initData carries no one-time guarantee the same way; enforce auth_date window
// + short session issuance there. Periodic cleanup: delete rows older than 48h (Phase 4 cron or pg cron).
```

### jose session (sign + read, httpOnly cookie)
```typescript
// Source: jose API (SignJWT / jwtVerify) — https://github.com/panva/jose ; cookie via next/headers
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);
const COOKIE = '3set_session';

export async function signSession(telegramId: number): Promise<string> {
  return new SignJWT({ tid: telegramId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production', // Pitfall 4
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function requireSession(): Promise<number> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) throw new Error('unauthorized');
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
  return payload.tid as number;
}
```

### PWA manifest + viewport (CAB-05 skeleton)
```typescript
// Source: https://nextjs.org/docs/app/guides/progressive-web-apps + generate-viewport docs (v16.3.4)
// app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '3set VPN', short_name: '3set',
    description: 'VPN-подписки: покупка и управление ключами',
    lang: 'ru', start_url: '/', scope: '/',
    display: 'standalone', orientation: 'portrait',
    background_color: '#0b0f14', theme_color: '#0b0f14',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// app/layout.tsx
import type { Viewport } from 'next';
export const viewport: Viewport = { themeColor: '#0b0f14', width: 'device-width', initialScale: 1 };
export const metadata = { title: '3set VPN', description: '...', applicationName: '3set VPN' };
```

### Prisma schema skeleton (D-07) + singleton + seed
```prisma
// prisma/schema.prisma — Postgres 17, Prisma 7 [versions VERIFIED: npm registry]
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id         Int      @id @default(autoincrement())
  telegramId BigInt   @unique @map("telegram_id") // D-12: identity key, unique at DB level
  chatId     BigInt?  @map("chat_id")             // refreshed on every bot update (fan-out in Phase 4)
  firstName  String?  @map("first_name")
  username   String? 
  createdAt  DateTime @default(now()) @map("created_at")
  keys       KeyCache[]
  @@map("users")
}

model KeyCache {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  keyId     String   @map("key_id") // ARTEMIDA key id (mirror only; ARTEMIDA owns truth)
  status    String   // e.g. active/expired — refined in Phase 2 [ASSUMED values]
  expiresAt DateTime? @map("expires_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@unique([userId, keyId])
  @@map("keys_cache")
}

model ReplayCache {
  hash   String   @id
  usedAt DateTime @default(now()) @map("used_at")
  @@map("replay_cache")
}
```
```typescript
// lib/prisma.ts — singleton (Pitfall 3)
import { PrismaClient } from '@prisma/client';
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = prisma;
```

### Install prompt component (CAB-05)
```tsx
// Standard beforeinstallprompt pattern [ASSUMED — stable web-platform API, verify in browser test]
// components/InstallPrompt.tsx ('use client')
'use client';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

export default function InstallPrompt() {
  const [evt, setEvt] = useState<any>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!evt) return null;
  return <button onClick={() => { evt.prompt(); setEvt(null); }}>{t('pwa.install')}</button>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Telegram Login Widget = classic iframe (`data-onauth`, HMAC `SHA256(bot_token)`) as the only documented web login | OIDC flow is now the primary documented login (`oauth.telegram.org`, JWKS, Client ID/Secret via BotFather); classic widget docs moved to `/widgets/login-legacy` | Observed 2026-09-30 [CITED: https://core.telegram.org/widgets/login vs …/login-legacy] | Phase 1 builds classic HMAC (simpler, still documented); OIDC is the migration path — see OQ-1 |
| `themeColor` inside `metadata` | `viewport` export (`export const viewport: Viewport`) | Next 14+ [CITED: https://nextjs.org/docs/app/api-reference/functions/generate-viewport] | Old tutorials silently break PWA theming |
| PWA needs service worker for installability | Manifest + icons suffice for install prompt; SW only for offline | Current Next.js PWA guide [CITED: https://nextjs.org/docs/app/guides/progressive-web-apps] | Confirms D-13: Serwist deferred with zero installability cost |
| Prisma `latest` = stable v7 | `latest` = `8.0.0-rc.19`, stable v7 on `prev` tag | Observed 2026-09-30 [VERIFIED: npm registry] | Unpinned installs pull an RC; pin `^7.10.0` everywhere |
| `next-pwa` / `@ducanh2912/next-pwa` for offline | `@serwist/next` (deferred to later phase anyway) | Per project STACK.md (dead/redirected packages) | Do not introduce PWA plugins in Phase 1 at all |

**Deprecated/outdated:**
- `next-pwa` (last publish ~4y ago), `@ducanh2912/next-pwa` (author redirects to Serwist) — never install, not even later in Phase 1
- `themeColor` in `metadata` — removed API, use `viewport`
- Bare `npm install prisma` — resolves to v8-RC, not stable

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next 16 route-handler `params` is async (`await params`) | Architecture Patterns P1 | Low — trivial compile error caught at build; planner should verify against installed Next version |
| A2 | React 19 required as Next 16 peer | Standard Stack | Low — `create-next-app` resolves peers automatically |
| A3 | Prisma `globalThis` singleton still the recommended dev pattern for v7 | Pitfalls P3 | Low — worst case is dev-only connection churn, caught immediately |
| A4 | Classic Login Widget (`data-onauth` + HMAC) still fully functional (docs say "archived", not "removed") | State of the Art, OQ-1 | Medium — if retired, fallback is OIDC flow; planner keeps OQ-1 checkpoint |
| A5 | `beforeinstallprompt` behavior for the install button | Code Examples | Low — cosmetic; verified by manual mobile test in validation |
| A6 | Replay-cache via `ReplayCache(hash @id)` unique-insert is sufficient one-time-use guard | Code Examples | Low — failure mode is duplicate login accepted within 24h window, bounded risk for skeleton |
| A7 | `postgres:17-alpine` image tag exists and local Compose can pull it | Standard Stack | Low — verified at `docker compose pull` time; local Docker absent anyway (see Environment) |
| A8 | tailwindcss 4.3 CSS-first config needs no `tailwind.config.js` | Standard Stack | Low — scaffold default handles it |

## Open Questions

1. **Classic Widget HMAC vs new Telegram OIDC login for web auth?**
   - What we know: Main widget docs now describe OIDC (Client ID/Secret via BotFather mini-app, `Allowed URLs` registration, JWKS at `oauth.telegram.org/.well-known/jwks.json`); classic HMAC flow still documented at `/widgets/login-legacy` with unchanged algorithm [CITED both pages, fetched 2026-09-30].
   - What's unclear: Whether Telegram plans to retire the classic `data-onauth` callback; no deprecation notice found on the legacy page (negative claim — page read in full this session, no sunset date present).
   - Recommendation: Build classic HMAC now (matches D-09 `lib/auth.ts` shape, zero BotFather reconfiguration, testable on localhost). Planner adds a Phase 4/5 backlog note to re-evaluate OIDC. No user decision needed to start.

2. **PWA icon source — is there a brand logo for 192/512/maskable icons?**
   - What we know: CAB-05 needs installable PWA with icon from the first skeleton (CONTEXT.md Specific Ideas).
   - What's unclear: No logo asset in repo (empty repo verified via `ls`).
   - Recommendation: Planner includes a task generating placeholder icons (e.g., simple SVG→PNG) + a `checkpoint:human-verify` for the owner to supply the real logo; placeholder must be trivially replaceable in `public/icons/`.

3. **GitHub repo `3set-white` — who creates it (owner account vs org) and public vs private?**
   - What we know: `gh` CLI 2.98.0 present and functional; no git remote configured (verified this session).
   - What's unclear: Owner preference (visibility affects secret-handling posture: private recommended since early commits may precede audit hygiene).
   - Recommendation: Planner defaults to **private** repo under the owner's account via `gh repo create 3set-white --private --source=. --push`, flaggable to public later. Confirm at plan review, don't block scaffolding.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16, Telegraf, Prisma | ✓ | 24.15.0 | — |
| npm | installs | ✓ | 11.12.1 | — |
| Docker / Compose | `docker-compose.yml` run (D-05/D-06) | ✗ (absent: `command -v docker` empty) | — | Local Homebrew Postgres (running, `/tmp:5432` accepting connections); Compose file still authored in Phase 1, `up` verified on server or after Docker install |
| PostgreSQL (local) | Dev DB without Docker | ✓ | Server running (pg_isready OK); client psql 16.15 | Use `DATABASE_URL` → localhost for migrate/seed/dev; keep `db` service in Compose for prod parity |
| gh CLI | OPS-03 repo create + push | ✓ | 2.98.0 | Manual repo creation in github.com UI |
| GitHub remote | OPS-03 | ✗ (no remote; `git remote -v` empty) | — | `gh repo create 3set-white --private --source=. --push` in Phase 1 |
| Telegram test-bot token | Dev polling without spamming prod (D-03) | ✗ (no env in repo; expected) | — | Owner creates via BotFather; stored in `.env.local` only (never git). **Blocks bot dev-testing until provided** |
| Internet (npm registry) | Installs | ✓ | registry reachable (`npm view` OK) | — |

**Missing dependencies with no fallback:**
- Telegram test-bot token (owner action via BotFather) — bot polling test blocked until provided; scaffold + webhook route + unit tests proceed without it.

**Missing dependencies with fallback:**
- Docker — local Postgres fallback covers migrate/seed/dev; Compose `up` deferred to machine with Docker (or Phase 5 server).

## Validation Architecture

Test framework: **vitest 5.0.3** (Wave 0 install). No test infra exists (empty repo — verified via `ls`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.3 |
| Config file | none — see Wave 0 (`vitest.config.ts` + `tests/` dir) |
| Quick run command | `npx vitest run tests/unit` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAB-02 | Widget HMAC accept/reject (good hash, forged hash, stale auth_date, replayed hash) | unit | `npx vitest run tests/unit/auth-widget.test.ts` | ❌ Wave 0 |
| CAB-02 | initData HMAC accept/reject (good, tampered pair, missing hash, stale auth_date) | unit | `npx vitest run tests/unit/auth-initdata.test.ts` | ❌ Wave 0 |
| CAB-02 | Session sign → verify roundtrip; wrong secret rejected; `alg:none` rejected | unit | `npx vitest run tests/unit/session.test.ts` | ❌ Wave 0 |
| CAB-02 | i18n keys complete (no missing `t()` keys vs `ru.ts`) | unit | `npx vitest run tests/unit/i18n.test.ts` | ❌ Wave 0 |
| CAB-05 | PWA manifest valid (name, icons 192/512, display standalone) + build passes | build/smoke | `npm run build && node scripts/check-manifest.mjs` | ❌ Wave 0 |
| CAB-05 | Install prompt + login screen render (mobile viewport) | manual | Chrome DevTools → Application → Manifest; real-device install | manual-only (no Playwright in Phase 1) |
| CAB-02 | End-to-end login (Widget click → cookie → cabinet skeleton) | manual | Browser + test bot | manual-only (needs owner test-bot token) |
| OPS-03 | Repo exists on GitHub, main pushed, no secrets in history | manual | `gh repo view 3set-white`; `git log --all -p \| grep` token pattern | manual-only |
| DB | migrate + seed green on local Postgres | smoke | `npx prisma migrate dev && npm run db:seed` | ❌ Wave 0 (script) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit`
- **Per wave merge:** `npx vitest run && npm run build`
- **Phase gate:** Full suite green + manual install/login checklist before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` + `tests/unit/` — covers CAB-02 verifiers, session, i18n
- [ ] `tests/unit/auth-widget.test.ts` — known-answer HMAC vectors (compute fixtures with `BOT_TEST_TOKEN`-independent fixed token, e.g. `test-token`)
- [ ] `tests/unit/auth-initdata.test.ts` — same for WebAppData path
- [ ] `tests/unit/session.test.ts` — jose roundtrip with throwaway `SESSION_SECRET`
- [ ] `scripts/check-manifest.mjs` — fetch `/manifest.webmanifest`, assert icons/display
- [ ] Framework install: `npm install -D vitest@5.0.3`

## Security Domain

`security_enforcement: true`, ASVS Level 1 (per `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Telegram HMAC (Widget + initData) as sole authenticator; jose HS256 session; `auth_date` ≤24h + replay-cache one-time use |
| V3 Session Management | yes | httpOnly + `SameSite=Lax` + `Secure`-in-prod cookie; 30d exp; no token in URL/localStorage; logout clears cookie |
| V4 Access Control | partial | No roles in Phase 1 (admin arrives Phase 5); webhook route gated by secret path + `secret_token` header; auth route rate-limit-friendly (stateless verify) [ASSUMED posture — no RBAC needed yet] |
| V5 Input Validation | yes | zod schemas on `/api/auth/telegram` body + webhook update shape (minimal: `update_id` number); env schema fail-fast |
| V6 Cryptography | yes | `node:crypto` HMAC-SHA256 + `timingSafeEqual` for Telegram checks; jose for JWT — never hand-roll either primitive beyond the doc-specified constructions |
| V7 Errors/Logging | yes | pino; never log `BOT_TOKEN`, session JWTs, or full updates with PII at info level; auth failures → 401/403 without reason oracle |
| V14 Configuration | yes | Secrets only via env (`.env.local` gitignored, `.env.example` placeholders); `SESSION_SECRET` ≥256-bit random; two bot tokens segregated |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged Widget payload minting free sessions | Spoofing | HMAC verify + `auth_date` window + replay-cache one-time insert (CAB-02 tests) |
| Replay of captured Widget `data-onauth` | Spoofing | `ReplayCache(hash @id)` + 24h window (D-11) |
| Webhook flooding / forged updates | Spoofing/DoS | Secret path + `X-Telegram-Bot-Api-Secret-Token` check before `handleUpdate`; 403 fast |
| Session theft via XSS | Info disclosure | httpOnly cookie (D-10); React default-escapes; no token in JS-accessible storage |
| Secret leak via git history | Info disclosure | `.gitignore` first commit; placeholder-only `.env.example`; pre-push grep (Pitfall 7) |
| Dev polling stealing prod updates | DoS (self-inflicted) | Separate test token; `deleteWebhook` before `launch()`; mode-by-env (Pitfall 6) |

## Sources

### Primary (HIGH confidence — official docs fetched + read verbatim this session)
- `core.telegram.org/widgets/login-legacy` — Widget fields (`id, first_name, …, auth_date, hash`), data-check-string construction, `secret_key = SHA256(bot_token)` check
- `core.telegram.org/bots/webapps` § Validating data received via the Mini App — `initData` query-string, `secret_key = HMAC_SHA256(bot_token, "WebAppData")`, `auth_date` freshness, third-party Ed25519 path (not needed Phase 1)
- `nextjs.org/docs/app/guides/progressive-web-apps` (+ `.md` variant) — `app/manifest.ts` + `MetadataRoute.Manifest`, install prompts without offline support
- `nextjs.org/docs/app/api-reference/functions/generate-viewport` (v16.3.4, updated 2026-06-09) — `viewport` export with `themeColor`
- `github.com/telegraf/telegraf` README — `bot.handleUpdate` for custom integrations, `secretToken` launch option, `secretPathComponent()` default
- `github.com/panva/jose` docs (`jwt/verify/functions/jwtVerify`) + npm page — `SignJWT`/`jwtVerify`, HS256, Edge/Node runtimes
- npm registry via `npm view` (2026-09-30): next 16.3.7, react 19.3.0, telegraf 4.16.3, jose 6.2.12, zod 4.6.5, prisma dist-tags (`latest=8.0.0-rc.19`, `prev=7.10.0`), @prisma/client 7.10.0, tailwindcss 4.3.3, pino 10.3.1, vitest 5.0.3

### Secondary (MEDIUM confidence — official docs via excerpts / project research)
- `.planning/research/{STACK,ARCHITECTURE,SUMMARY}.md` — stack pins, bot-in-Next decision, dual-auth design (project source of truth, cross-checked with official docs above where Phase 1-relevant)
- jwt.io libraries page — jose as the standard JS JOSE implementation (cross-check)

### Tertiary (LOW confidence — community only, used for minor patterns)
- WebSearch results on install-prompt gist (recommends `next-pwa` — **rejected** per project stack; manifest portion consistent with official guide)
- WebSearch jose HS256 cookie examples (consistent with official jose API; code in RESEARCH.md follows official API, not community snippets)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions `npm view`-verified today; pins match project STACK.md
- Architecture: HIGH — locked decisions + Telegraf README sanction for `handleUpdate` + Next.js PWA guide
- Auth contracts: HIGH — both HMAC algorithms read verbatim from `core.telegram.org` this session
- Pitfalls: MEDIUM — mix of verified (Prisma tags, viewport API) and standard-community patterns (Prisma singleton, Secure-cookie localhost)
- PWA installability: HIGH — official Next.js guide quote on prompts-without-offline

**Research date:** 2026-09-30
**Valid until:** 2026-10-30 (stable domain; re-check Prisma dist-tags + Telegram widget docs at Phase 2 planning — both move)

**What might I have missed:** (1) Next 16 `create-next-app` scaffold flags may differ from the command above — planner should run with `--help` tolerance; (2) Bot API `secret_token` charset/length limits (1–256 chars, `[A-Za-z0-9_-]`) relied on training memory — verify at webhook-registration time, not load-bearing for code; (3) Prisma 7 `prisma.config.ts` vs legacy `schema.prisma`-datasource layout — v7 changed config surface; planner must follow the installed v7 `prisma init` output, not memory; (4) Apple `apple-touch-icon` + `apple-mobile-web-app-capable` meta for iOS installability — iOS ignores `beforeinstallprompt`; include Apple meta/icon as a plan task.
