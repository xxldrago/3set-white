# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 30 (new scaffold, zero modifications)
**Analogs found:** 0 / 30 — greenfield repo, no codebase analogs exist

> **Greenfield notice (verified):** `git ls-files` in repo root lists only
> `.planning/**` + `AGENTS.md`; `Glob("**/*.{ts,tsx,js,jsx,prisma,yml,yaml,Dockerfile}")`
> returns zero hits; `git remote -v` is empty. There is no tracked source to copy
> patterns from, so the tracked-source gate (#3645) is trivially satisfied — this
> document names **no analog paths at all** and instead points the planner at
> verbatim reference patterns in `01-RESEARCH.md` (Code Examples, lines cited)
> plus official-doc contracts listed in its `## Sources`. Planner MUST scaffold
> from `create-next-app` + those references, not search the codebase for patterns.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `package.json` (+ `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`) | config | — (build) | none | no-analog (greenfield) |
| `.gitignore` | config | — | none | no-analog (greenfield) |
| `.env.example` | config | — | none | no-analog (greenfield) |
| `Dockerfile` | config | — (build) | none | no-analog (greenfield) |
| `docker-compose.yml` | config | — (infra) | none | no-analog (greenfield) |
| `vitest.config.ts` | config (test) | — | none | no-analog (greenfield) |
| `app/manifest.ts` | config (PWA) | — (static) | none | no-analog (greenfield) |
| `app/layout.tsx` | component (root layout) | request-response (RSC) | none | no-analog (greenfield) |
| `app/page.tsx` | component (page) | request-response (RSC) | none | no-analog (greenfield) |
| `app/login/page.tsx` | component (page) | request-response (RSC) | none | no-analog (greenfield) |
| `app/guides/page.tsx` | component (page) | — (static) | none | no-analog (greenfield) |
| `app/api/auth/telegram/route.ts` | route (controller) | request-response | none | no-analog (greenfield) |
| `app/api/telegram/webhook/[secret]/route.ts` | route (controller) | request-response (webhook intake) | none | no-analog (greenfield) |
| `lib/bot.ts` | service (bot singleton) | event-driven (updates) | none | no-analog (greenfield) |
| `lib/auth.ts` | service (auth) | request-response (verify → mint) | none | no-analog (greenfield) |
| `lib/replay.ts` | service (replay-cache) | CRUD (one-time insert) | none | no-analog (greenfield) |
| `lib/prisma.ts` | utility (db singleton) | — (connection) | none | no-analog (greenfield) |
| `lib/env.ts` | utility (config) | — (boot validation) | none | no-analog (greenfield) |
| `lib/logger.ts` | utility (logging) | — | none | no-analog (greenfield) |
| `lib/i18n/messages/ru.ts` + `lib/i18n/index.ts` | utility (i18n) | — (static dict) | none | no-analog (greenfield) |
| `components/LoginButton.tsx` | component (client) | request-response | none | no-analog (greenfield) |
| `components/InstallPrompt.tsx` | component (client) | event-driven (DOM event) | none | no-analog (greenfield) |
| `prisma/schema.prisma` | model (migration) | — (DDL) | none | no-analog (greenfield) |
| `prisma/seed.ts` | migration (seed) | CRUD | none | no-analog (greenfield) |
| `public/icons/*` (192/512/maskable) | asset | — (static) | none | no-analog (greenfield) |
| `tests/unit/auth-widget.test.ts` | test | — (unit) | none | no-analog (greenfield) |
| `tests/unit/auth-initdata.test.ts` | test | — (unit) | none | no-analog (greenfield) |
| `tests/unit/session.test.ts` | test | — (unit) | none | no-analog (greenfield) |
| `tests/unit/i18n.test.ts` | test | — (unit) | none | no-analog (greenfield) |
| `scripts/check-manifest.mjs` | utility (script) | — (build smoke) | none | no-analog (greenfield) |

## Pattern Assignments

Reference source for ALL files below is `01-RESEARCH.md` (verbatim code examples
fetched from official docs this session). Line numbers refer to that file.

### Scaffold + config (package.json, tsconfig, next.config, .gitignore, .env.example, Dockerfile, docker-compose.yml, vitest.config.ts)

**Analog:** none — generate via tooling, do not hand-write.

**Scaffold pattern** (`01-RESEARCH.md` lines 100-109):
```bash
npx create-next-app@latest 3set-white --typescript --tailwind --app --eslint --import-alias "@/*"
npm install telegraf@4.16.3 jose@6.2.12 zod@4.6.5 pino@10.3.1
npm install -D prisma@^7.10.0 vitest@5.0.3 tsx
npm install @prisma/client@^7.10.0
# NEVER bare `npm install prisma` — latest tag is 8.0.0-rc.19
```

**Per-file rules for planner:**
- `.gitignore` — MUST cover `.env*` (except `.env.example`) on the **first** commit; placeholders only in `.env.example` (Pitfall 7, lines 281-286). Required env keys: `BOT_TOKEN`, `BOT_TEST_TOKEN`, `DATABASE_URL`, `SESSION_SECRET`, `WEBHOOK_SECRET`, `BOT_MODE` (see `lib/env.ts` below).
- `docker-compose.yml` — `web` (`node:24-bookworm-slim`, `output: 'standalone'`) + `db` (`postgres:17-alpine`, volume-persisted) only; Nginx/HTTPS stub deferred to Phase 5 (D-06). Local Docker absent — dev runs against Homebrew Postgres on `/tmp:5432` (Environment Availability, lines 532-549).
- `Dockerfile` — `node:24-bookworm-slim`, never `node:latest`; `npx prisma migrate deploy` at entrypoint, never `migrate dev` in prod.
- `vitest.config.ts` — Wave 0 gap (lines 581-587); run `npx vitest run tests/unit` per commit.

### `app/api/telegram/webhook/[secret]/route.ts` (route, request-response webhook intake)

**Analog:** none. Reference: Pattern 1, `01-RESEARCH.md` lines 192-213.

**Imports pattern:**
```typescript
import { bot, WEBHOOK_SECRET } from '@/lib/bot';
```

**Core pattern** (lines 199-212) — copy verbatim shape, verify `params`-async against installed Next (assumption A1, line 504):
```typescript
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const header = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== WEBHOOK_SECRET || header !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }
  const update = await req.json();
  await bot.handleUpdate(update); // no reply-via-webhook; responses go via Bot API
  return Response.json({ ok: true });
}
```

**Error handling:** 403 fast before `handleUpdate`; zod-validate minimal update shape (`update_id` number) — 400 on garbage, never 500 (Pitfall 2 analogue, lines 251-256).

### `lib/bot.ts` (service, event-driven)

**Analog:** none. Reference: Architecture diagram lines 139-144 + Anti-Patterns line 225.

**Core pattern:**
```typescript
// lib/bot.ts — module-singleton Telegraf, NO launch() in prod path
import { Telegraf } from 'telegraf';
import { prisma } from './prisma';
import { logger } from './logger';

export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;
const token = process.env.BOT_MODE === 'polling'
  ? process.env.BOT_TEST_TOKEN!   // dev only, D-03
  : process.env.BOT_TOKEN!;       // prod webhook
export const bot = new Telegraf(token);

bot.start(async (ctx) => {
  // /start skeleton (D-15): upsert users{telegram_id, chat_id}, welcome + menu buttons
  await prisma.user.upsert({
    where: { telegramId: BigInt(ctx.from.id) },
    update: { chatId: BigInt(ctx.chat.id) },
    create: { telegramId: BigInt(ctx.from.id), chatId: BigInt(ctx.chat.id) },
  });
  await ctx.reply('…', { reply_markup: { /* skeleton menu */ } });
});

if (process.env.BOT_MODE === 'polling') { bot.launch(); } // test token only; prod never launches
```

**Guard:** `launch()` behind `BOT_MODE === 'polling'` with **test** token only; prod polling on same token → `409 Conflict` (Pitfall 6, lines 274-279).

### `lib/auth.ts` (service, request-response verify → mint)

**Analog:** none. Reference: `01-RESEARCH.md` lines 292-316 (Widget), 318-343 (initData), 363-395 (jose session).

**Imports pattern:**
```typescript
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
```

**Core pattern — verifyWidget** (lines 301-315, algorithm verbatim from `core.telegram.org/widgets/login-legacy`):
```typescript
export function verifyWidget(data: WidgetPayload, botToken: string, maxAgeSec = 86_400): boolean {
  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k as keyof typeof fields]}`).join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest();
  let received: Buffer;
  try { received = Buffer.from(hash, 'hex'); } catch { return false; }
  if (received.length !== computed.length) return false;
  if (!timingSafeEqual(computed, received)) return false;
  return Math.floor(Date.now() / 1000) - data.auth_date <= maxAgeSec;
}
```

**Core pattern — verifyInitData** (lines 323-342, verbatim from `core.telegram.org/bots/webapps`):
```typescript
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 86_400): Record<string, string> | null {
  const pairs = new URLSearchParams(initData);
  const hash = pairs.get('hash');
  if (!hash) return null;
  pairs.delete('hash');
  const dataCheckString = [...pairs.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest();
  let received: Buffer;
  try { received = Buffer.from(hash, 'hex'); } catch { return null; }
  if (received.length !== computed.length || !timingSafeEqual(computed, received)) return null;
  /* ...collect pairs, enforce auth_date window, return record... */
}
```

**Session pattern** (lines 372-394): `SignJWT({ tid })` HS256, 30d exp; `jwtVerify` with `algorithms: ['HS256']`; httpOnly cookie `3set_session`, `sameSite: 'lax'`, `secure: NODE_ENV === 'production'` (Pitfall 4).

### `app/api/auth/telegram/route.ts` (route, request-response)

**Analog:** none. Reference: Architecture diagram lines 147-151 + auth patterns above.

**Core pattern:** accept EITHER Widget JSON OR `{ initData: string }` (zod union), verify via `lib/auth.ts`, `consumeWidgetHash` for Widget path (D-11), upsert `users` by `telegramId`, `setSessionCookie(signSession(tid))` → 200. Failures → 401/403 without reason oracle (Security Domain V7, lines 595-603).

### `lib/replay.ts` (service, CRUD one-time insert)

**Analog:** none. Reference: `01-RESEARCH.md` lines 345-361.

```typescript
import { prisma } from './prisma';
export async function consumeWidgetHash(hash: string): Promise<boolean> {
  try {
    await prisma.replayCache.create({ data: { hash } });
    return true;
  } catch {
    return false; // duplicate → reject as replay
  }
}
```
Cleanup of rows >48h deferred (Phase 4 cron note, line 360).

### `lib/prisma.ts` + `prisma/schema.prisma` + `prisma/seed.ts` (utility / model / seed)

**Analog:** none. Reference: `01-RESEARCH.md` lines 424-465.

**Singleton** (lines 460-465, Pitfall 3):
```typescript
import { PrismaClient } from '@prisma/client';
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = prisma;
```

**Schema shape** (lines 430-457): `User{ telegramId BigInt @unique, chatId BigInt?, ... } @@map("users")`; `KeyCache{ userId, keyId, status, expiresAt } @@unique([userId, keyId]) @@map("keys_cache")`; `ReplayCache{ hash @id } @@map("replay_cache")`. Planner MUST follow installed Prisma v7 `prisma init` config-surface output, not memory (assumption A3 / open item in Metadata line 643 — v7 `prisma.config.ts` vs legacy datasource layout).

**Seed:** minimal — connectivity check + one test user via `prisma db seed` (tsx runner).

### `lib/env.ts` (utility, boot validation)

**Analog:** none. Reference: Don't-Hand-Roll table, `01-RESEARCH.md` lines 231-240.

**Pattern:** single zod `envSchema` (`BOT_TOKEN`, `BOT_TEST_TOKEN`, `DATABASE_URL`, `SESSION_SECRET` ≥256-bit random, `WEBHOOK_SECRET`, `BOT_MODE: 'polling' | 'webhook'`), fail-fast at boot; no `process.env.X!` scattered.

### `lib/logger.ts` (utility)

**Analog:** none. Reference: Standard Stack line 84 (`pino@10.3.1`).

**Pattern:** `pino` instance, JSON in prod; `no-console` lint rule. Never log `BOT_TOKEN`, session JWTs, or full updates with PII at info level (V7).

### `lib/i18n/*` (utility, static dict)

**Analog:** none. Reference: Alternatives table line 96 — hand-rolled typed RU dictionary, NOT `next-intl`.

**Pattern:** `lib/i18n/messages/ru.ts` (typed keys) + `t(key)` helper; all UI strings via keys from day one (D-16) so EN later needs no refactor.

### `app/manifest.ts` + `app/layout.tsx` (PWA config + root layout)

**Analog:** none. Reference: `01-RESEARCH.md` lines 397-422.

```typescript
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
```
`<html lang="ru">`. `themeColor` in `viewport` export ONLY — never in `metadata` (Pitfall 5, lines 268-273). Icons are placeholders until owner supplies logo (OQ-2, lines 523-526) — keep replaceable in `public/icons/`.

### `app/page.tsx` + `app/login/page.tsx` + `app/guides/page.tsx` (pages, RSC)

**Analog:** none. Reference: D-14 + Architecture lines 146-151.

**Pattern:** server components, static-first. `page.tsx`: session cookie present → cabinet skeleton, else login screen. `login/page.tsx`: embeds `LoginButton`. `guides/page.tsx`: static v2rayNG/Streisand/Hiddify guides. All strings via `t()` (RU now, D-16).

### `components/LoginButton.tsx` + `components/InstallPrompt.tsx` (client components)

**Analog:** none. Reference: `01-RESEARCH.md` lines 467-485.

**LoginButton:** `'use client'`; Widget embed via `next/script` (`data-onauth` → `POST /api/auth/telegram`) + WebApp bridge (`window.Telegram.WebApp.initData` → same endpoint).

**InstallPrompt** (lines 471-484):
```tsx
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
iOS note: `beforeinstallprompt` is Android/Chrome-only — add `apple-touch-icon` + Apple meta as a plan task (RESEARCH Metadata line 647, item 4).

### `tests/unit/*.test.ts` + `scripts/check-manifest.mjs` (tests)

**Analog:** none. Reference: Validation Architecture, `01-RESEARCH.md` lines 551-587.

**Pattern:** vitest 5.0.3; known-answer HMAC vectors with fixed throwaway token (`test-token`), never real `BOT_TOKEN`; session roundtrip with throwaway `SESSION_SECRET`; i18n key-completeness test; `scripts/check-manifest.mjs` fetches `/manifest.webmanifest` and asserts icons/display (CAB-05 build smoke: `npm run build && node scripts/check-manifest.mjs`).

---

## Shared Patterns

### Authentication (applies to: `lib/auth.ts`, `app/api/auth/telegram/route.ts`, all pages reading session)
**Source:** `01-RESEARCH.md` Code Examples lines 292-395 (= `core.telegram.org/widgets/login-legacy` + `/bots/webapps` contracts).
- Two HMAC verifiers → one `telegram_id`; `auth_date` window 24h; `timingSafeEqual` with length guard + try/catch (never `===`); Widget path additionally `consumeWidgetHash` one-time insert.
- Session: jose HS256 `SignJWT`/`jwtVerify` (explicit `algorithms` allow-list), httpOnly `SameSite=Lax` cookie, `Secure` in prod only, 30d exp, `requireSession()` throws → route maps to 401.

### Input Validation (applies to: both API routes, `lib/env.ts`)
**Source:** `01-RESEARCH.md` Security Domain V5 + Don't-Hand-Roll (lines 231-240, 595-603).
- zod schema on every external boundary: `/api/auth/telegram` body (Widget ∪ initData union), webhook update (`update_id` number minimum), env fail-fast at boot.

### Error Handling (applies to: both API routes, `lib/auth.ts`)
**Source:** `01-RESEARCH.md` Pitfalls P2 + Security V7 (lines 251-256, 595-603).
- Auth failures → 401/403 JSON without reason oracle; malformed input → 400/401, never 500 on garbage `hash`; webhook secret mismatch → 403 fast before `handleUpdate`; pino logs server-side only (no secrets/PII).

### Logging (applies to: `lib/logger.ts`, `lib/bot.ts`, both API routes)
**Source:** Standard Stack (line 84) + V7.
- `pino` everywhere, `no-console` lint; log `update_id`/auth-attempt outcomes; never `BOT_TOKEN`, JWTs, full PII updates at info.

### Persistence (applies to: `lib/prisma.ts`, `prisma/schema.prisma`, `lib/bot.ts`, `lib/replay.ts`)
**Source:** `01-RESEARCH.md` lines 424-465 + Pitfall 3.
- `globalThis` Prisma singleton shared by routes + bot + seed; identity key `users.telegram_id UNIQUE` (D-12, one-way decision); replay via `ReplayCache(hash @id)` unique-insert (race-safe dirty-check).

## No Analog Found

All 30 files — greenfield scaffold, no codebase analogs (verified: `git ls-files` = `.planning/**` + `AGENTS.md` only; no `git remote`; Glob for source files = zero hits). Planner scaffolds from `create-next-app` + `01-RESEARCH.md` verbatim examples + official docs below, not from repo history.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| all 30 (see File Classification) | — | — | Empty repo: only `.planning/`, `AGENTS.md`, `.git` exist; Established Patterns section of CONTEXT.md states "Паттерны не установлены — Phase 1 их задает" |

Reference docs the planner should treat as pattern authority instead:
- `core.telegram.org/widgets/login-legacy` — Widget HMAC (HIGH confidence, read verbatim)
- `core.telegram.org/bots/webapps` § validating Mini App data — initData HMAC (HIGH)
- `nextjs.org/docs/app/guides/progressive-web-apps` + `generate-viewport` — manifest/viewport (HIGH)
- `github.com/telegraf/telegraf` README — `bot.handleUpdate` custom integration (HIGH)
- `github.com/panva/jose` docs — `SignJWT`/`jwtVerify` HS256 (HIGH)
- npm registry pins (verified 2026-09-30): `next@16.3.7`, `react@19.3.0`, `telegraf@4.16.3`, `jose@6.2.12`, `zod@4.6.5`, `prisma@^7.10.0` (NOT v8-RC), `tailwindcss@4.3.3`, `pino@10.3.1`, `vitest@5.0.3`

## Metadata

**Analog search scope:** repo root (`git ls-files`, Glob `**/*.{ts,tsx,js,jsx,prisma,yml,yaml,Dockerfile}`, `git status`, `git remote -v`); `AGENTS.md` project context (stack pins, "Conventions not yet established", "Architecture not yet mapped").
**Files scanned:** 0 source files on disk (only `.planning/**`, `AGENTS.md` tracked).
**Pattern extraction date:** 2026-09-30
**Valid until:** 2026-10-30 (re-check Prisma dist-tags + Telegram widget docs at Phase 2 planning — both move; see RESEARCH.md Metadata).
