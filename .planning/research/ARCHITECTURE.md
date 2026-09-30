# Architecture Research

**Domain:** Telegram-bot + PWA cabinet + API-wrapper + payments + tickets + admin (VPN subscription service, single VPS)
**Researched:** 2026-09-30
**Confidence:** MEDIUM (official docs cross-checked: nextjs.org, docs.platega.io OpenAPI, Telegraf npm/README, core.telegram.org; seam tier for web sources is MEDIUM/LOW — Platega contract details quoted verbatim from its official OpenAPI spec)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Telegram app │  │ PWA cabinet  │  │ Admin panel (Next.js │   │
│  │ (bot chat +  │  │ my.3set.     │  │ route group, same    │   │
│  │ WebApp btn)  │  │ online)      │  │ origin, RBAC)        │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │ Telegram       │ HTTPS                │ HTTPS         │
│         │ Bot API        │                      │               │
├─────────┴────────────────┴──────────────────────┴───────────────┤
│                     Edge (single VPS 64.188.97.106)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Nginx (TLS termination, reverse proxy, Certbot)          │  │
│  │  /api/telegram/webhook ─┐  /api/platega/callback ─┐      │  │
│  └──────────────┬──────────┴────────────┬────────────┘      │  │
├─────────────────┴───────────────────────┴───────────────────┤
│                   App layer (ONE Next.js process)              │
│  ┌────────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │ Telegraf   │  │ Route Handlers BFF  │  │ Fulfillment / │  │
│  │ bot instance│  │ /api/keys /orders  │  │ outbox worker │  │
│  │ (handleUpd- │  │ /tickets /admin    │  │ (same proc,   │  │
│  │ ate via     │  │ /auth + PWA pages  │  │ setInterval)  │  │
│  │ route)      │  │                     │  │               │  │
│  └─────┬──────┘  └──────────┬──────────┘  └───────┬───────┘  │
│        │ shared services (server-only lib/)       │          │
│        │  artemida.ts · platega.ts · auth.ts      │          │
│        │  tickets.ts · notify.ts · prisma.ts      │          │
├────────┴──────────────────────────────────────────┴──────────┤
│                        Data layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Postgres 16  │  │ ARTEMIDA API │  │ Platega.io       │    │
│  │ (own state:  │  │ (source of   │  │ (payment links + │    │
│  │ users/orders/│  │ truth: keys, │  │ status callbacks)│    │
│  │ tickets/keys │  │ pricing, sub │  │                  │    │
│  │ _cache/outbox│  │ links)       │  │                  │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Core decision: one Next.js process serves everything.** PWA pages, BFF Route Handlers, admin panel, AND the Telegram bot webhook (via `bot.handleUpdate()` inside `app/api/telegram/webhook/route.ts`). One Docker container + one Postgres container + host Nginx. This is the standard shape for bot+PWA shops on a single VPS — it eliminates a second deployable, shares the Prisma client/session code, and both Telegram and Platega webhooks ride the same TLS endpoint.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| PWA cabinet | Key list/detail, sub-links, devices, traffic, buy/renew/upgrade, tickets UI, installable mobile shell | Next.js App Router pages + `app/manifest.ts`; Serwist service worker only if offline needed (v1: manifest alone is enough for installability) |
| Telegram bot | Onboarding, trial, buy/renew buttons, key delivery, ticket creation with photos, support replies | Telegraf v4: Composer middleware, WizardScene/Stage for buy + ticket flows, `bot.handleUpdate` fed by webhook route |
| BFF Route Handlers | Auth, validation (Zod), call ARTEMIDA/Platega with server secrets, own order/ticket state | `app/api/*/route.ts`; force-dynamic; never expose `ARTEMIDA_API_KEY`/Platega secret to client |
| ARTEMIDA wrapper | Single server-only client: Bearer auth, `Idempotency-Key` per POST/DELETE, Retry-After/429/5xx retry, error-code mapping | `lib/artemida.ts`; Art­emida is source of truth for keys/pricing — local DB only caches |
| Payment module | Order state machine `pending→confirmed/canceled/chargebacked`; link creation; callback verification; async fulfillment | `lib/platega.ts` + `orders` table + `outbox` for bot notifications; callback responds 200 fast, fulfills after |
| Ticket core | Single queue: `tickets` + `ticket_messages`; channel-agnostic read/write; fan-out delivery to bot + cabinet | `lib/tickets.ts` + `lib/notify.ts`; attachments stored as Telegram `file_id` ↔ local file refs |
| Admin panel | Same Next.js app, `(admin)` route group, role-gated queries: admin / support (tickets+key view) / manager (finance+stats) | `middleware.ts` + server-side role check per handler; no separate deployable |
| Outbox worker | Reliable side-effects: send Telegram messages, retry fulfillment after callback | `outbox` table + `setInterval` loop in same process (v1); extract later if needed |
| Postgres | Own state only: users, orders, tickets, keys_cache, outbox | Docker `postgres:16-alpine` + Prisma; volume-persisted |

## Recommended Project Structure

```
src/ (Next.js App Router repo "3set-white")
├── app/
│   ├── manifest.ts               # PWA manifest (installability, no plugin needed)
│   ├── layout.tsx page.tsx       # Cabinet shell (mobile-first)
│   ├── keys/ tickets/ buy/       # Cabinet pages
│   ├── (admin)/                  # Admin route group (role-gated layout)
│   └── api/
│       ├── auth/telegram/route.ts     # Login Widget + WebApp initData verify → session cookie
│       ├── telegram/webhook/route.ts  # → bot.handleUpdate (secret path)
│       ├── keys/[...]/route.ts        # list/detail/devices/traffic/renew/upgrade/trial
│       ├── orders/route.ts            # create order → Platega link
│       ├── platega/callback/route.ts  # CONFIRMED/CANCELED/CHARGEBACKED ingest
│       ├── tickets/route.ts           # CRUD + messages + uploads
│       └── admin/*/route.ts           # scoped by role
├── bot/
│   ├── index.ts        # Telegraf instance, Composer wiring (NO launch())
│   ├── scenes/         # buy.ts, ticket.ts (WizardScene), start.ts, keys.ts
│   └── keyboards.ts    # inline keyboards, WebApp button → PWA
├── lib/ (server-only)
│   ├── artemida.ts     # Bearer + Idempotency-Key + retry + error map
│   ├── platega.ts      # X-MerchantId/X-Secret, create tx, verify callback hdrs
│   ├── auth.ts         # HMAC verify (Widget + initData), session
│   ├── tickets.ts      # queue ops (channel-agnostic)
│   ├── notify.ts       # bot sendMessage/photo fan-out via outbox
│   ├── prisma.ts       # singleton client
│   └── validations.ts  # Zod schemas at every route boundary
├── prisma/schema.prisma  # users/orders/tickets(+messages)/keys_cache/outbox
├── public/icons/*        # PWA icons 192/512 (+maskable)
├── docker-compose.yml    # web (next start standalone) + db
└── nginx/my.3set.online.conf  # reverse proxy + Certbot
```

### Structure Rationale

- **`bot/` without `launch()`:** the bot never opens its own port in production. The webhook Route Handler imports the shared instance and calls `handleUpdate`. Dev uses polling (`bot.launch()` only when `NODE_ENV=development`). This is Telegraf's documented `webhookCallback` pattern, adapted to a Route Handler.
- **`lib/` server-only, Zod at every boundary:** Next.js BFF guidance — Route Handlers validate, transform, and proxy so secrets and upstream shape never leak to the client. One `artemida.ts` means retry/idempotency policy lives in exactly one place.
- **`(admin)` group, not a second app:** three roles × small team = middleware + per-query scoping. A separate admin deployable doubles ops for zero v1 benefit.
- **Own DB is thin:** users/orders/tickets/outbox + `keys_cache`. ARTEMIDA owns keys/pricing/traffic; we mirror what the UI needs to render fast and to survive ARTEMIDA 502/503.

## Architectural Patterns

### Pattern 1: BFF Route Handler as signed proxy

**What:** every external call goes through a Route Handler that authenticates the user (session cookie), validates input with Zod, then calls the upstream with server secrets.
**When to use:** all ARTEMIDA reads/writes and Platega link creation.
**Trade-offs:** +secrets never ship to client, +single error-mapping point; −extra hop (negligible on same VPS).

**Example:**
```typescript
// app/api/keys/[id]/renew/route.ts
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();          // cookie → telegram-id
  const body = renewSchema.parse(await req.json()); // Zod at boundary
  const key = await artemida.renewKey(params.id, body, session.telegramId); // Bearer + Idempotency-Key inside
  await db.keysCache.upsert(...);                   // mirror for fast UI
  return Response.json(key);
}
```

### Pattern 2: Payment callback — ingest fast, fulfill async (outbox)

**What:** the Platega callback handler only verifies headers (`X-MerchantId`/`X-Secret`), validates the Zod body, and idempotently upserts the order (`CONFIRMED`/`CANCELED`/`CHARGEBACKED` by transaction `id`). Fulfillment (create/renew ARTEMIDA key + notify user) happens after the 200 response via an `outbox` row processed by the in-process worker. Platega requires 200 within 60 s and retries ≤3× every 5 min — so the handler must never do slow work inline, and must dedupe by transaction id because retries redeliver.
**When to use:** `/api/platega/callback` and any ARTEMIDA call chained off it.
**Trade-offs:** +no lost/duplicate keys on retry storms; −needs a reconcile sweep for orders stuck `pending` (poll Platega status endpoint on interval).

**Example:**
```typescript
// app/api/platega/callback/route.ts
export async function POST(req: Request) {
  verifyPlategaHeaders(req.headers);                 // X-MerchantId + X-Secret, timing-safe compare
  const cb = callbackSchema.parse(await req.json()); // { id, amount, currency, status, payload }
  const order = await db.orders.upsertByTxId(cb);    // idempotent: same id → same state
  if (cb.status === 'CONFIRMED' && order.prev === 'pending')
    await db.outbox.add({ type: 'fulfill-order', orderId: order.id }); // worker does ARTEMIDA + notify
  return new Response('OK');                          // fast 200, always
}
```

### Pattern 3: One ticket queue, two heads (fan-out delivery)

**What:** bot scenes and cabinet handlers call the same `tickets.ts` write path (`tickets` + `ticket_messages` rows, `telegram_id` as owner). A support reply triggers fan-out: (a) outbox → `bot.telegram.sendMessage/sendPhoto` to the user's chat, (b) cabinet reads the same row. Attachments: bot side stores Telegram `file_id`; cabinet uploads are saved locally and forwarded via `sendDocument` using the stored `chat_id`.
**When to use:** all support flows.
**Trade-offs:** +no channel drift, support works from admin panel only; −need `chat_id` persisted on first contact (`users.chat_id` updated on every bot update).

### Pattern 4: Telegram auth — Widget on web, initData from bot, one verifier

**What:** canonical identity is `telegram_id`. Web login uses the Login Widget (verify `hash` = HMAC-SHA-256 of `data_check_string` with `SHA256(bot_token)` as key — core.telegram.org; `@grammyjs/validator`-style check). Entry from the bot's WebApp button sends `initData` instead (HMAC with `WebAppData` key chain — `@tma.js/init-data-node` pattern). Both verifiers live in `lib/auth.ts` and mint the same session cookie; `auth_date` freshness enforced (≤24 h).
**When to use:** `/api/auth/telegram` accepts either payload shape.
**Trade-offs:** +zero-password, bot↔PWA accounts unified by construction; −must keep `BOT_TOKEN` server-only and compare hashes timing-safely.

## Data Flow

### Request Flow

```
Bot update:  Telegram → Nginx → POST /api/telegram/webhook → bot.handleUpdate
               → scene middleware → lib/* → Prisma + ARTEMIDA → reply via Bot API
Cabinet read:  PWA → GET /api/keys → requireSession → artemida.list (cache-first,
               refresh async) → keys_cache → JSON → render
Purchase:      PWA/bot → POST /api/orders → Zod → orders.insert(pending)
               → Platega /v2/transaction/process (payload=orderId, metadata.userId=tgId)
               → { url } → user pays on pay.platega.io
Callback:      Platega → POST /api/platega/callback → verify → upsert → 200
               → outbox → worker → ARTEMIDA create/renew → notify (bot + cabinet)
Ticket:        bot photo/msg OR cabinet form → tickets.ts insert → admin replies
               → fan-out: sendMessage to chat_id + row visible in cabinet
```

### State Management

```
Source of truth split (deliberate):
  ARTEMIDA  owns: keys, pricing, traffic, devices, subscription links
  Postgres  owns: users, orders (payment state), tickets, outbox, keys_cache mirror
Rule: never render key state from cache without a background revalidate;
      never treat cache as authoritative for renew/upgrade (trial blocked: API 409 → UI disables buttons)
```

### Key Data Flows

1. **Purchase (pay-for-key, no user balance):** quote via `GET /pricing` → order(pending, txId) → Platega link → callback CONFIRMED → ARTEMIDA create/renew → deliver sub-link. Order↔tx linked by `payload=orderId`; user linked by `metadata.userId=telegram_id`.
2. **Ticket round-trip:** inbound (either channel) → one row → admin reply → outbox → Telegram push + cabinet read. `users.chat_id` refreshed on each bot update so push never loses the target.
3. **White Label:** brand domain `my.3set.online` stored in settings; ARTEMIDA White Label configured to it (A-record, DNS-Only, no AAAA — infra step, not code); subscription links rendered with the brand host.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | As drawn: 1× Next.js + 1× Postgres on the single VPS. Nothing to split. |
| 1k–100k users | First: add reconcile/poll tuning + Postgres indexes on (telegram_id, status); second: extract outbox worker to a tiny second process if callback latency grows. |
| 100k+ users | Split bot webhook into its own service; read-replica or managed Postgres; CDN in front of PWA static. Not a v1 concern — do not pre-build. |

### Scaling Priorities

1. **First bottleneck:** ARTEMIDA rate limits (429 + `Retry-After`) and 502/503 blips — mitigated by cache-first reads, single retry-with-backoff wrapper, and serving cabinet from `keys_cache` during outages.
2. **Second bottleneck:** duplicate fulfillment on Platega retry redelivery — mitigated by tx-id idempotent upsert + `pending→confirmed` transition guard (fulfill only on transition, never on repeat CONFIRMED).

## Anti-Patterns

### Anti-Pattern 1: Calling ARTEMIDA/Platega from the client

**What people do:** embed API keys in PWA code or call upstream directly from bot scenes.
**Why it's wrong:** key leak = full wallet/key control compromise; no validation, no idempotency, no retry policy.
**Do this instead:** everything through Route Handlers + `lib/`; scenes call the same service functions the routes call.

### Anti-Pattern 2: Fulfilling the order inside the payment callback

**What people do:** `await artemida.createKey()` before returning 200.
**Why it's wrong:** ARTEMIDA slowness → callback timeout → Platega retries → double keys / double charges logic. (Same class of bug as double-processing Telegram updates without dedupe.)
**Do this instead:** ingest + 200, fulfill from outbox, dedupe by transaction id, transition-guard fulfillment.

### Anti-Pattern 3: Separate user tables for bot and cabinet

**What people do:** `bot_users` + `web_users` with a later "merge".
**Why it's wrong:** split identity breaks tickets, orders, and key ownership; merge migrations are where data loss happens.
**Do this instead:** one `users` table keyed by `telegram_id` from day one; Widget and initData verifiers mint the same session.

### Anti-Pattern 4: Bot as a second always-on server process from day one

**What people do:** separate bot service + port + process manager + its own DB pool.
**Why it's wrong on one VPS:** doubles deploy/secret/env drift surface for a workload the Next.js process can absorb via `handleUpdate`.
**Do this instead:** bot-in-Next via webhook route; split only when update volume forces it (100k+ scale row).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ARTEMIDA Paid API V1 (`https://artemida.cc/v1`) | Server-only REST client; `Authorization: Bearer $API_KEY`; fresh `Idempotency-Key` (UUID) on every POST/DELETE; honor 429/`Retry-After`, retry 502/503 with backoff; map 401/402/409/429 | Trial `POST /trial` fixed (1 day/2 devices); trial keys reject renew/upgrade — disable in UI by `is_trial` flag, not by catching errors |
| Platega.io (`https://app.platega.io`) | Create: `POST /v2/transaction/process` with `X-MerchantId`+`X-Secret`, body `{paymentDetails{amount,currency}, description, return, failedUrl, payload=orderId, metadata{userId: telegramId}}` → `{transactionId, url, expiresIn}`; no `id` in request (server-generated). Status: callback POST to LK-configured HTTPS URL, headers `X-MerchantId`/`X-Secret`, body `{id, amount, currency, status: CONFIRMED\|CANCELED (+CHARGEBACKED), paymentMethod, payload}`; must return 200 ≤60 s or ≤3 retries @5 min | Callback URL must be public HTTPS with trusted cert (no self-signed/private IP); `payload`+`metadata.userId` are the order↔user join — always set both |
| Telegram Bot API | Inbound: webhook `POST /api/telegram/webhook/<secret>` → `handleUpdate` (secret-token verify); outbound: `sendMessage/sendPhoto/sendDocument` via outbox; auth: Login Widget hash + WebApp `initData` HMAC | HTTPS mandatory for webhooks; dev = long-polling, prod = webhook; persist `chat_id` per user on every update |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| PWA ↔ Route Handlers | `fetch` + session cookie | Same origin — no CORS; Zod validates both directions |
| Bot scenes ↔ services | Direct import of `lib/*` (same process) | Scenes never touch Prisma raw for cross-cutting flows — go through `tickets.ts`/`orders` helpers so invariants (outbox, fan-out) hold |
| Callback ↔ fulfillment | `outbox` table rows | Only async bridge in the system; worker is `setInterval` loop, idempotent by `(type, refId)` |
| Admin UI ↔ data | Route Handlers with `requireRole('admin'\|'support'\|'manager')` | Support: tickets + key read; manager: orders/stats read; admin: all + settings (White Label domain, topup) |
| Web ↔ Postgres | Prisma singleton | One client instance (`lib/prisma.ts`) shared by routes, scenes, worker |

## Suggested Build Order (dependencies)

```
1. DB + auth skeleton      (users, session; Widget/initData verifier)      ← everything keys off telegram_id
2. ARTEMIDA wrapper        (lib/artemida.ts + error/retry policy)          ← all key flows depend on it
3. Bot webhook plumbing    (route → handleUpdate, /start, chat_id capture) ← cheapest E2E slice
4. Keys read path          (cabinet list/detail + bot "my keys", cache)    ← proves wrapper + auth + UI
5. Orders + Platega link   (pending orders, callback ingest + 200)         ← money in, fulfillment deferred
6. Fulfillment worker      (outbox → ARTEMIDA create/renew → notify)       ← money → value; needs 2+5
7. Trial + renew/upgrade   (scenes + cabinet buttons, trial guards)        ← needs 2+4+6
8. Tickets both channels   (queue + fan-out + attachments)                 ← needs 1+3, independent of payments
9. Admin panel + roles     (tickets triage, finance/stats, settings)       ← needs 5+8
10. PWA polish + deploy    (manifest, icons, Docker+Nginx+TLS, webhooks)   ← needs 3+5 (public HTTPS for callbacks)
```

**Ordering rationale:** identity (1) and the upstream wrapper (2) are load-bearing — every other component imports them. Bot plumbing (3) before cabinet depth because `/start` + chat_id capture unblocks notifications for everything later. Payments split into ingest (5) then fulfill (6) so the risky money path is testable without key-minting side effects. Tickets (8) parallelize after (1–3). Deploy (10) last but requires zero architecture changes because webhooks were designed for one public origin from the start.

## Sources

- Next.js official: Backend-for-Frontend guide + Route Handlers (`nextjs.org/docs/app/guides/backend-for-frontend`, `…/getting-started/route-handlers`) — BFF/proxy pattern, public-endpoint auth warning (HIGH relevance, official)
- Next.js official PWA guide (v15/v16, `…/guides/progressive-web-apps`) — `app/manifest.ts`, Serwist for offline (HIGH relevance, official)
- Platega.io official OpenAPI (`docs.platega.io/llms.txt` + auth/callback/create-transaction pages) — headers, callback contract, retry policy, HTTPS constraints (HIGH relevance, official; quoted verbatim)
- Platega SDK refs (github.com/VeyDlin/Platega.SDK, ploki1337/plategaio) — webhook verify + `payload`/`metadata.userId` linkage pattern (MEDIUM, cross-check)
- Telegraf npm README + telegraf.js.org (v4.16.x, Bot API 7.1) — `launch({webhook})`, `createWebhook`/`webhookCallback`, middleware/scenes model (HIGH relevance, official)
- core.telegram.org (Login Widget hash check), Telegram Mini Apps init-data docs + `@tma.js/init-data-node`, grammy `@grammyjs/validator` — dual auth verification (MEDIUM-HIGH, official + ecosystem)
- VPS deploy guides (Stackademic/Medium 2026, Docker+Nginx+Certbot flows) — single-server reverse-proxy shape (MEDIUM, multi-source convergent)

---
*Architecture research for: bot-artemida (Telegram-bot + PWA + API-wrapper + Platega + tickets + admin, single VPS)*
*Researched: 2026-09-30*
