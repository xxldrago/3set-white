# Stack Research

**Domain:** VPN subscription service — Telegram bot + Next.js PWA cabinet + Platega.io payments behind ARTEMIDA Paid API V1
**Researched:** 2026-09-30
**Confidence:** MEDIUM (versions verified against npm registry + official docs on research date; API details from Platega public docs)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24 LTS (`node:24-bookworm-slim`) | Runtime for Next.js app + standalone bot process | Current LTS line (local env already v24.15.0); native `fetch`, `crypto.randomUUID` (needed for ARTEMIDA `Idempotency-Key`), stable `fetch` timeout/undici. Pin major in Docker, never `node:latest`. |
| TypeScript | `^5.9` (strict) | Type safety across web + bot + API clients | Proven with Next 15/16 + Zod 4. TS 7 native port exists on npm (7.0.2) but ecosystem support is unverified — defer. |
| Next.js (App Router) | `16.3.x` (latest verified: 16.3.7) | PWA cabinet + BFF API routes (`/api/*`) for ARTEMIDA + Platega webhooks | 16.x is stable (`latest` dist-tag); App Router gives `app/manifest.ts` PWA manifest built-in and Route Handlers for webhooks. Single codebase for cabinet + backend-thin-wrapper. |
| React | `19.3.0` | UI | Peer of Next 16; Server Components keep ARTEMIDA key listing fast. |
| Telegraf | `4.16.3` | Telegram bot (mandated by PROJECT.md) | Latest stable, webhook mode with secret path is production standard behind HTTPS. Run as **separate Node process** (not inside Next server) sharing Postgres — independent restarts, no lost polling state. |
| PostgreSQL | `17-alpine` (Docker) | Users (`telegram-id`), orders/payments, tickets, idempotency records | Relational fits orders + ticket threads; concurrent writers (bot process + Next + webhook handler). SQLite would serialize webhook + bot writes on one file — avoid. |
| Prisma | `^7.10` (v7 stable; **not v8**) | ORM + migrations | v7 is the stable line (`prev: 7.10.0`); `latest` tag currently points at `8.0.0-rc.19` — an RC, do not touch for prod. Typed client, easy migrations for tickets/orders schema. |
| Tailwind CSS | `^4.3` (verified 4.3.3) | Mobile-first PWA styling | v4 is current; CSS-first config suits fast cabinet UI. Pair with a small component set, not a heavy kit. |
| @serwist/next | `^9.5` (verified 9.5.12) | Service worker / offline + installability | Official Next.js PWA guide (v15 + v16 docs) recommends built-in manifest + Serwist for offline. Successor of Workbox-based PWA plugins. Note: SW disabled in dev under Turbopack — prod-only, by design. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | `^4.6` (verified 4.6.5) | Validate ARTEMIDA responses, Platega webhook bodies, bot inputs, env | Every external boundary: ARTEMIDA (`pricing`, `keys`, errors 401/402/409/429/502/503), Platega callback (`CONFIRMED`/`CANCELED`), Telegram Login Widget data. |
| pino | `^10.3` (verified 10.3.1) | Structured logging (JSON in prod) | Always; log `paymentId`, ARTEMIDA `Retry-After`, webhook delivery attempts. |
| p-retry | latest `^7` | Backoff retries for ARTEMIDA 429/502/503 honoring `Retry-After` | All ARTEMIDA calls; Platega status reconcile job. No BullMQ/Redis in v1 — overkill for single-server MVP; graduate to BullMQ only if retry volume demands it. |
| jose | latest `^6` | Sign/verify PWA session cookies (Telegram-authenticated) | After verifying Telegram Login Widget hash (HMAC-SHA256 per Telegram docs), issue httpOnly signed session keyed by `telegram-id`. No email/password per scope. |
| `undici`-native `fetch` | built-in (Node 24) | ARTEMIDA + Platega HTTP clients | Hand-rolled thin clients (no official Node SDK exists for Platega — only unofficial Python/.NET). `fetch` + `zod` + `p-retry` is the whole "SDK". |
| sharp | latest `^0.34` | Downscale ticket screenshots on upload | Ticket attachments (фото/скриншоты) before storing to volume. |
| vitest | latest | Unit tests for pricing/webhook-signature/idempotency logic | Pure-logic coverage; Playwright only if cabinet flows need E2E later. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose | Single-server deploy: `web` (Next standalone) + `bot` (Telegraf webhook) + `postgres` + `nginx` | `output: 'standalone'` for Next; Nginx terminates HTTPS (Platega webhook + Telegram webhook both require HTTPS). Secrets only via `.env`, never git. |
| ESLint (flat) + Prettier | Lint/format | `create-next-app` baseline; add `no-console` rule (use pino). |
| tsx | Run bot process in dev | `tsx src/bot/index.ts`; prod runs compiled `tsc` output or `tsx` in container — prefer build to `dist`. |

## Installation

```bash
# Core
npm install next@^16.3.7 react@^19.3.0 react-dom@^19.3.0 telegraf@^4.16.3
npm install @prisma/client zod@^4.6.5 pino jose p-retry sharp
npm install @serwist/next@^9.5.12

# Styling
npm install tailwindcss@^4.3.3

# Dev dependencies
npm install -D typescript@~5.9 dev typescript @types/node @types/react
npm install -D prisma@^7.10.0 tsx vitest eslint prettier
```

```bash
# Infra (server 64.188.97.106): Postgres 17 + Nginx via docker-compose.yml
# npx prisma migrate deploy  # on deploy, never `migrate dev` in prod
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Telegraf 4 | grammY | Only if you hit Telegraf limits (conversations, menus); grammY is modern but switching costs exceed benefits since stack is user-mandated Telegraf. |
| Prisma 7 | Drizzle ORM | If bundle/query control matters more than migration DX; Drizzle is lighter but Prisma's schema+migrate velocity wins for tickets/orders MVP. |
| Serwist | hand-written SW | Only for trivial precache needs; Serwist runtime-caching for subscription-link pages is worth the dep. |
| p-retry (in-process) | BullMQ + Redis | When retry/outbox volume outgrows one server or you need delayed jobs UI; not v1. |
| Native fetch client | unofficial `platega` npm package (if one appears) | Only after auditing it against `docs.platega.io` (headers `X-MerchantId`/`X-Secret`, statuses, retry contract); hand-rolled client is ~100 lines and fully owned. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `next-pwa` (shadowwalker) | Dead — last publish ~4 years ago (5.6.0); incompatible with Next 15/16 App Router | `@serwist/next` + `app/manifest.ts` |
| `@ducanh2912/next-pwa` | Author's own README redirects to `@serwist/next`; last publish 2 years ago | `@serwist/next` |
| Prisma v8 (`8.0.0-rc.x`) | Release candidate on the `latest` tag — do not run RC ORM in prod handling money | Pin `prisma@^7.10.0` / `@prisma/client@^7.10.0` |
| NestJS / tRPC server | Over-engineering: backend is a thin wrapper over ARTEMIDA (`balance`, `pricing`, `keys`, wallet) + one Platega webhook | Next.js Route Handlers + shared `lib/` clients |
| MongoDB / Firebase | Orders + tickets + idempotency are relational; document store buys nothing here | PostgreSQL 17 |
| Vercel / serverless hosting | Violates single-server constraint; bot long-process + Platega/Telegram webhooks + local file uploads fit one host | Docker Compose on 64.188.97.106 + Nginx + `my.3set.online` |
| TypeScript 7 (`^7.0`) | Native port, ecosystem (Next/SW tooling) support unverified at research time | `typescript@~5.9`, revisit in a later milestone |
| Polling Platega status as primary flow | Webhook contract exists (200 ≤ 60s, 3 retries / 5 min); polling wastes quota and delays key issuance | Webhook-first + idempotent handler keyed by transaction `id` + hourly reconcile job |

## Stack Patterns by Variant

**If ARTEMIDA rate-limits (429 + `Retry-After`):**
- Queue renew/upgrade calls through `p-retry` honoring the header; surface "повторите через N сек" in bot/cabinet instead of failing silently.

**If Platega webhook arrives twice (retry contract):**
- Handler must be idempotent on transaction `id` (unique constraint in `payments`); always return 200 fast, process async.

**If trial rules change (currently `POST /trial` fixed 1 day / 2 devices, no renew/upgrade):**
- Keep trial logic behind a `trialPolicy` module validated by zod, so UI blocks (renew/upgrade buttons) follow server flags, not hardcoded copy.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.3.x` | `react@19.x`, `typescript@5.x` | Verified `latest`/`19.3.0` on npm 2026-09-30; TS 7 not verified with Next 16 — stay on TS 5.9. |
| `@serwist/next@9.5.x` | Next 15/16 (webpack prod build) | Disabled in dev under Turbopack — expected; test SW on `next build && next start`. |
| `telegraf@4.16.3` | Node ≥ 18 (we run 24) | Webhook mode needs public HTTPS — satisfied by Nginx + `my.3set.online`. |
| `prisma@7.10.x` | Node ≥ 20, Postgres 17 | `migrate deploy` in container entrypoint. |
| `tailwindcss@4.3.x` | Next 16 (CSS-first `@import "tailwindcss"`) | No `tailwind.config.js` needed by default. |

## Sources

- npm registry (`npm view` / `dist-tag`, 2026-09-30): `next@16.3.7`, `react@19.3.0`, `telegraf@4.16.3`, `zod@4.6.5`, `@serwist/next@9.5.12`, `tailwindcss@4.3.3`, `pino@10.3.1`, `prisma` stable `7.10.0` vs `latest=8.0.0-rc.19` — MEDIUM (registry = ground truth, cross-checked via dist-tags)
- Official Next.js PWA guide (`nextjs.org/docs/app/guides/progressive-web-apps`, v16.3.4 + v15) — manifest built-in, Serwist for offline — MEDIUM (verified via websearch excerpts)
- `docs.platega.io` (callback spec, `CallbackPayload`, `PaymentStatus` schemas; `X-MerchantId`/`X-Secret` headers; CONFIRMED/CANCELED/CHARGEBACKED; 60s/3×5min retry) — MEDIUM
- Community 2025–2026 templates (Next 15/16 + Tailwind v4 + Serwist) + `next-pwa`/`@ducanh2912/next-pwa` npm publish dates — LOW-MEDIUM (community, consistent across sources)
- `.planning/PROJECT.md` — ARTEMIDA `https://artemida.cc/v1`, `Bearer` + `Idempotency-Key`, trial/pricing constraints — project source of truth

---
*Stack research for: 3set-white VPN subscription service*
*Researched: 2026-09-30*
