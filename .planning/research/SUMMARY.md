# Project Research Summary

**Project:** 3set-white — VPN subscription service (Telegram bot + Next.js PWA cabinet + tickets + admin)
**Domain:** Telegram-bot storefront + API-wrapper backend (ARTEMIDA Paid API V1 + Platega.io payments, RU/RUB market, single VPS)
**Researched:** 2026-09-30
**Confidence:** MEDIUM

## Executive Summary

This is a pay-per-key VPN shop: users buy time × devices in a Telegram bot or PWA cabinet, pay via Platega (cards/SBP), and receive a subscription link + QR issued by the ARTEMIDA Paid API. Every comparable CIS product (Sota, YouFast, MarzBot/Remnawave shops, Nemo) converges on the same shape — trial entry, tariff picker, instant post-payment delivery, in-bot renewal, expiry reminders, guides, and an admin/support backoffice. Our differentiator is a full PWA cabinet on our own domain plus a unified bot+cabinet ticket queue, where most competitors are bot-only.

The recommended approach is a single Next.js 16 App Router codebase acting as thin BFF over ARTEMIDA: Route Handlers proxy all upstream calls (secrets never leave the server), the Telegraf bot runs inside the same Next.js process via webhook `handleUpdate` (one container + Postgres + Nginx on 64.188.97.106), and payments follow ingest-fast/fulfill-async — Platega callback verified and acked with 200 immediately, key provisioning done from an outbox worker with idempotent order state machine and hourly reconcile. Postgres 17 + Prisma 7 + Tailwind v4 + Serwist round out the stack.

The dominant risk is money taken but no key delivered (ARTEMIDA 502/429/402 between CONFIRMED and provisioning), compounded by Platega's retry contract (3×/5min) causing double provisioning, forged callbacks minting free keys, trial farming, and wallet depletion (402 everywhere). All are preventable with the same medicine: persistent orders table before redirect, tx-id dedup + `Idempotency-Key` + transition-guard fulfillment, header verification + server re-query, one-telegram-id identity with server-side trial flag, and wallet monitoring in admin.

## Key Findings

### Recommended Stack

Single-repo Next.js 16.3.x + React 19 + TypeScript 5.9 (strict) + Telegraf 4.16.3 + Postgres 17 + Prisma 7.10 + Tailwind 4.3 + Serwist 9.5, deployed as Docker Compose (web + db) behind Nginx on one VPS. Thin hand-rolled `fetch` clients for ARTEMIDA/Platega (no official Node SDK exists) wrapped with zod 4.6 validation, p-retry honoring `Retry-After`, pino logging, jose sessions. Details: STACK.md.

**Core technologies:**
- Next.js 16.3.x (App Router) — PWA cabinet + BFF Route Handlers + admin in one deployable
- React 19.3 + Tailwind 4.3 — mobile-first cabinet UI
- Telegraf 4.16.3 — bot, webhook mode in prod (polling dev-only, separate test token)
- PostgreSQL 17 + Prisma 7.10 (pin v7, never v8-RC) — users/orders/tickets/keys_cache/outbox
- zod 4.6 + p-retry + pino + jose — validation at every boundary, backoff retries, logging, sessions
- @serwist/next 9.5 + `app/manifest.ts` — installability/offline (prod-build only)
- Node 24 LTS + Docker Compose + Nginx — single-server TLS termination for both webhooks

Do NOT use: `next-pwa` (dead), Prisma v8-RC, NestJS/tRPC server, Mongo/Firebase, Vercel/serverless, TS 7, SQLite, BullMQ/Redis in v1.

### Expected Features

Market-convergent v1 (all P1, must launch together to validate "buy VPN in 2 clicks"). Details: FEATURES.md.

**Must have (table stakes):**
- Trial key one-tap (1 day / 2 devices, one per user, server-enforced) — entry point
- Tariff picker 7/30/90 days × 1–10 devices with live `GET /pricing`
- Platega pay → CONFIRMED webhook → instant sub-link + QR delivery (pending-payment state for delayed callbacks)
- Renewal + device upgrade (blocked on trial keys, backend + UI)
- My subscriptions (bot + cabinet, `telegram-id` identity via Login Widget/initData)
- Expiry reminders (3-day push with renew button — highest-ROI retention)
- Per-platform setup guides (v2rayNG/Streisand/Hiddify)
- Unified ticket queue bot+cabinet with attachments
- Admin panel with 3 roles (admin/support/manager): user lookup, stats, broadcast
- Payment history per user

**Should have (competitive, v1.x):**
- Referral program — after payments stable (needs confirmed-payment history for anti-fraud)
- Promo codes / gift subscriptions — for launches/bloggers
- Traffic display, crypto payment method, server status page — on user demand

**Defer (v2+):**
- Autopay / recurrent SBP (HIGH complexity: mandates, dunning, isolated from pay-per-key)
- EN localization (RU-only v1, but key-based i18n strings from day one)
- Metered tariffs, native apps, wallet/balance, manual card-to-card — explicit anti-features

### Architecture Approach

One Next.js process serves everything: PWA pages, BFF Route Handlers, admin route group, bot webhook (`bot.handleUpdate`), and an in-process outbox worker. Own DB is deliberately thin — ARTEMIDA owns keys/pricing/traffic/links, Postgres owns users/orders/tickets/outbox/keys_cache mirror. Four load-bearing patterns: (1) signed-proxy Route Handlers, (2) payment ingest-fast/fulfill-async via outbox, (3) one ticket queue with fan-out to both channels, (4) dual Telegram auth (Widget hash + WebApp initData) minting one session keyed by `telegram-id`. Details: ARCHITECTURE.md.

**Major components:**
1. PWA cabinet + admin route group — keys/devices/traffic/buy/tickets UI, role-gated admin
2. Telegraf bot (no `launch()` in prod) — onboarding, trial, buy/renew, delivery, tickets with photos
3. BFF Route Handlers + server-only `lib/` (artemida/platega/auth/tickets/notify/prisma/validations) — the only place secrets and retry/idempotency policy live
4. Payment module (orders state machine + outbox worker) — pending→confirmed/canceled/chargebacked, fulfill only on transition
5. Ticket core + notify fan-out — channel-agnostic queue, `chat_id` persisted per user
6. Postgres — users, orders, tickets(+messages), keys_cache, outbox; Nginx TLS edge

Note — STACK.md suggests a separate bot process; ARCHITECTURE.md (adopted) recommends bot-in-Next via webhook route for single-VPS ops simplicity. Split only at 100k+ scale.

### Critical Pitfalls

Top risks, all Phase 1 unless noted. Details: PITFALLS.md.

1. **Paid but no key** — provision only on `PENDING→PAID` atomic transition; `PROVISION_ERROR` + backoff retry; reconciler polls `GET /transaction/{id}` every 2–5 min; admin manual-grant button.
2. **Double provisioning on retries** — unique constraint on `platega_tx_id`, paid-never-reprovisions rule, `Idempotency-Key` from order id on every ARTEMIDA POST, 200-fast then async fulfill. Verify: duplicate callback → one key.
3. **Forged callbacks (no HMAC exists — only `X-MerchantId`/`X-Secret` headers)** — timing-safe header check + server re-query + amount/currency compare; only `CONFIRMED` provisions; always send `metadata.userId`. Verify: headerless forgery → 401, no key.
4. **ARTEMIDA wallet dry (402 everywhere)** — poll balance, admin widget + runway alerts, honest 402 UX, 2-minute topup runbook.
5. **Trial farming + trial renew crash** — `UNIQUE(trial_used)` per telegram-id, atomic check-then-set, single identity table, block renew/upgrade on trials in UI *and* backend, per-key in-flight locks, ARTEMIDA codes mapped to user messages (never raw 4xx).
6. **Bot/Auth/Deploy traps** — one update consumer (prod webhook + `secret_token`, dev on separate token, `update_id` dedup); Widget `auth_date` ≤24h + one-time-use replay cache; White Label DNS checklist (A→144.31.93.193, no AAAA, DNS-Only, external content-parse check) + fallback domain + reissue button; role-gated delete (support cannot delete, two-step admin confirm); secrets never in git, key-only SSH.

## Implications for Roadmap

Based on research, suggested phase structure (follows ARCHITECTURE.md dependency order; payments split into ingest then fulfill so money path is testable):

### Phase 1: Foundation — repo, DB, auth identity, bot skeleton
**Rationale:** `telegram-id` identity and update plumbing underpin everything (tickets, orders, notify).
**Delivers:** Next.js + Postgres + Prisma skeleton, `users` table, Widget/initData verifier + session, bot webhook route (`/start`, `chat_id` capture), Docker+Nginx+TLS stub, secrets hygiene.
**Addresses:** My subscriptions identity, ticket/auth prerequisite.
**Avoids:** Split-identity trial bypass, polling split-brain, secret leaks.

### Phase 2: ARTEMIDA integration — wrapper + keys read path
**Rationale:** Upstream wrapper is the second load-bearing import; read path proves it + auth + UI before money flows.
**Delivers:** `lib/artemida.ts` (Bearer, Idempotency-Key, Retry-After/429/5xx, error map), cabinet key list/detail + bot "my keys" (cache-first + background revalidate), trial one-tap with server-side one-per-user guard.
**Addresses:** Trial, tariff picker + live pricing, My subscriptions, setup guides.
**Avoids:** Trial farming, raw-error proxying, 429/cache-miss storms.

### Phase 3: Payments — orders + Platega ingest, then fulfillment
**Rationale:** Critical path; split ingest (testable without minting keys) from fulfill (side effects).
**Delivers:** Orders table + `POST /api/orders` → Platega link, callback verify + idempotent upsert + fast 200, outbox worker → ARTEMIDA create/renew/upgrade → notify, reconciler job, 402 mapping, wallet alert stub.
**Addresses:** Instant delivery, renewal/upgrade, payment history.
**Avoids:** Paid-no-key, double provisioning, forged callbacks, wallet-blindness.

### Phase 4: Tickets + reminders + cabinet polish
**Rationale:** Independent of payments after identity exists; reminders are cheapest retention and need key read model.
**Delivers:** Unified ticket queue both channels + attachments + fan-out, expiry scheduler (7/3/1-day push with renew), trial-key badging, per-key locks, diagnostics card ("проверить подключение", reissue link).
**Addresses:** Tickets, reminders, setup-instruction depth.
**Avoids:** Trial-renew crash, reply-only-one-channel, dead-link tickets.

### Phase 5: Admin panel + deploy hardening
**Rationale:** Needs orders + tickets read models; deploy last but zero arch change (webhooks designed for one origin).
**Delivers:** Role-gated admin (support: tickets+key view; manager: finance/stats+wallet runway; admin: all + settings + two-step delete + broadcast), White Label DNS checklist + fallback domain, backup/log-rotation, "Looks Done But Isn't" verification pass.
**Addresses:** Admin, broadcast, wallet widget.
**Avoids:** Wrongful deletes, dead White Label links, disk-full/log-bloat.

### Phase Ordering Rationale

- Identity (Phase 1) and ARTEMIDA wrapper (Phase 2) are imported by every later component — build them first.
- Bot plumbing before cabinet depth: `/start` + `chat_id` capture unblocks all notifications.
- Payments ingest before fulfill: money path testable (forgery/duplicate/lost-callback tests) without key-minting side effects.
- Tickets/reminders parallelize after identity + keys-read; admin last as it only reads models built earlier.
- Grouping mirrors the one-process architecture: no phase requires a second deployable or infra split.

### Research Flags

Phases likely needing deeper research during planning (`--research-phase`):
- **Phase 3 (payments):** Platega recurrent-vs-oneshot API edge cases, `CHARGEBACKED` handling, reconcile polling semantics — verify against live `docs.platega.io` at plan time.
- **Phase 1 (auth):** Telegram Login Widget vs WebApp `initData` verification details + OIDC one-way-switch risk — confirm against `core.telegram.org` at plan time.
- **Phase 5 (deploy):** White Label DNS/cert behavior + Nginx/Certbot single-VPS shape — validate with an external fetch test plan.

Phases with standard patterns (skip research-phase):
- **Phase 2 (keys read):** BFF proxy + cache-first reads are textbook Next.js.
- **Phase 4 (tickets/reminders):** CRUD queue + cron fan-out, well-documented; per-key locks are standard.
- **Admin CRUD/broadcast:** standard role-gated Route Handlers.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Versions verified against npm registry on research date; Platega contract from public docs (no private LK access) |
| Features | MEDIUM | Cross-verified across 10+ products/repos, but web sources (GramBots listings, GitHub) — no user interviews |
| Architecture | MEDIUM | Official docs (Next.js, Platega OpenAPI, Telegraf, Telegram) + convergent community patterns; single-VPS shape confirmed multi-source |
| Pitfalls | MEDIUM | Official retry/auth contracts quoted verbatim; failure patterns convergent across 4+ production codebases |

**Overall confidence:** MEDIUM

### Gaps to Address

- ARTEMIDA Paid API V1 full contract (exact pricing/trial/wallet endpoints, error-code enum): only PROJECT.md summary available — validate with a live authenticated probe in Phase 2 planning; wrap all calls so shape changes are localized to `lib/artemida.ts`.
- Platega merchant-category antifraud (`metadata.userId` requirement) and commission/return-URL behavior: confirm in Platega LK + docs re-check during Phase 3 planning before first real ruble.
- White Label cert issuance timing and whether cabinet + sub-links can share `my.3set.online` without conflict: staging DNS experiment in Phase 5 (fallback to default ARTEMIDA domain if blocked).
- Bot process topology (bot-in-Next vs separate process): STACK vs ARCHITECTURE disagree — adopted bot-in-Next; revisit only if update volume or callback latency forces a split.
- Real tariff/price points and reminder-day tuning: business inputs, not researchable — confirm with owner at roadmap review.

## Sources

### Primary (HIGH confidence)
- `docs.platega.io` (OpenAPI/llms.txt): callback headers, statuses, 60s/3×5min retry, HTTPS constraints, `metadata.userId` — via research files
- `core.telegram.org`: Login Widget HMAC, Bot Payments/`pre_checkout` rules, webhook/`secret_token` semantics — via research files
- `nextjs.org/docs/app` (BFF guide, Route Handlers, PWA guide v15/v16): proxy pattern, `app/manifest.ts`, Serwist — via research files
- Telegraf npm README / telegraf.js.org v4.16.x: webhookCallback/handleUpdate, scenes model — via research files

### Secondary (MEDIUM confidence)
- npm registry dist-tags 2026-09-30: next 16.3.7, react 19.3.0, telegraf 4.16.3, zod 4.6.5, @serwist/next 9.5.12, tailwind 4.3.3, pino 10.3.1, prisma 7.10.0 vs 8.0.0-rc.19
- Production VPN-bot codebases (MarzBot, remnawave-tg-bot, Nemo/Platega bots, savenet, AliMehrjou): idempotency, reconciler, replay-cache, expiry-reminder patterns
- Platega SDK refs + Nemo Docker layout: `payload`/`metadata.userId` linkage, 5-container single-host shape

### Tertiary (LOW confidence)
- Marketplace/blog sources (GramBots, Sub2Base, panel docs): trial-length norms, referral/autopay prevalence — directionally consistent, needs owner validation
- VPS deploy guides (2026): Docker+Nginx+Certbot single-server shape — convergent but generic

---
*Research completed: 2026-09-30*
*Ready for roadmap: yes*
