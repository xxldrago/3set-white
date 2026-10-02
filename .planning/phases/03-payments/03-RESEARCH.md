# Phase 3: Payments - Research

**Researched:** 2026-10-03
**Domain:** Money path — Platega.io redirect payments → asynchronous ARTEMIDA provisioning, renew/upgrade, payment history; Next.js 16 App Router + Prisma 7 + Postgres
**Confidence:** MEDIUM-HIGH on Platega contract (live docs fetched); MEDIUM on order/outbox design (in-repo patterns verified); LOW on the ARTEMIDA paid-key **create** contract (unobserved upstream — see Open Questions)

## Summary

Phase 3 is the money path. The user picks a tariff, a pending `Order` row is persisted, Platega's hosted page takes the money, Platega calls back, we **independently re-query** the transaction, and an in-process outbox worker mints/renews/upgrades the ARTEMIDA key and pushes the sub-link + QR to the bot and cabinet. The Platega contract was fetched live from `docs.platega.io` this session and is fully pinned below (create endpoints, callback body/headers, status re-query, retry contract, payment-method ids). The order/outbox/reconcile design maps cleanly onto patterns this repo already uses (`claimTrial` atomic `updateMany`, ownership-joined `lib/keys-service.ts`, typed `ArtemidaError` + zod + `p-retry`).

**The single highest-risk finding is an upstream gap:** `lib/artemida.ts` has **no method to create a paid key**, and the ARTEMIDA V1 contract (`docs/artemida-v1-contract.md`) never observed a create-key endpoint — it only lists `GET /pricing`, `GET /keys`, `GET /balance`, and `POST /trial`. `renewKey`/`upgradeKey` exist, but `kind: 'new'` has no implementation. Phase 3 planning MUST make discovering and locking the ARTEMIDA create-key request/response a first, owner-gated diagnostic task (mirroring Phase 2's 02-01 probe gate) before `new`-purchase fulfillment can be built. A second, smaller upstream gap: the exact **prorated upgrade charge** is not exposed by a documented quote endpoint, so `/api/pricing` needs an upgrade-quote mode whose formula the owner must confirm against a live `POST /keys/{id}/upgrade`.

Everything else is buildable from verified contracts and existing in-repo patterns. The Platega client is a self-contained ~120-line module; the callback route is small and fully testable with a fake fetch; the worker is a `setInterval` started from Next 16's `instrumentation.ts` (documented hook, no separate process/queue).

**Primary recommendation:** Build in this order — (0) owner-gated probe that locks `POST /keys` create + an upgrade-charge example and extends `lib/artemida.ts` with `createKey` + a caller-supplied `idempotencyKey`; (1) `lib/platega.ts` + env + zod schemas; (2) `Order`/`Outbox` migration; (3) `POST /api/orders` + hosted redirect; (4) callback (verify → re-query → amount compare → ack 200) ; (5) outbox worker + reconcile from `instrumentation.ts`; (6) renew/upgrade pipeline; (7) history (cabinet + bot) and QR delivery.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Create payment transaction | API / Backend (`lib/platega.ts` via `POST /api/orders`) | — | `X-Secret` is server-only; browser must never hold Platega credentials |
| Hosted payment page | CDN / External (Platega `pay.platega.io`) | Browser (redirect) | D-33 redirect flow — we never render card fields |
| Callback ingest + header verify | API / Backend (`/api/platega/callback`) | — | Public endpoint, no session; authenticates by headers; must ack ≤60s |
| Transaction re-query + amount/currency check | API / Backend | — | D-34/D-35 — callback is not the source of truth |
| Order state machine | Database (Postgres `orders.status`) | API / Backend | D-39 — atomic transitions, UNIQUE tx id |
| Key provisioning (create/renew/upgrade) | API / Backend (outbox worker → ARTEMIDA) | — | D-38/D-41 — async, idempotent, retried |
| Payment history read | Database (our `orders`) + Frontend Server (RSC) | Browser (bot parity) | D-46 — no live Platega query |
| Sub-link + QR delivery | API / Backend (`lib/qr.ts` SVG/PNG) | Bot push / Cabinet RSC | QR rendered server-side, never a remote image URL |
| Status polling UI | Browser / Client island | API / Backend (`GET /api/orders/{id}`) | UI-SPEC §2 — 3s poll, stop on terminal, 2-min cap |
| Outbox + reconcile scheduling | API / Backend (`instrumentation.ts` → `lib/worker.ts`) | — | Single process, no separate queue (v1); hourly tick |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-33:** Redirect flow — создаём транзакцию на сервере, пользователь платит на хостед-странице Platega, возвращается в кабинет/бота — **Reversibility:** costly — смена payment UX затрагивает и BFF, и бота, и кабинет
- **D-34:** Перед выдачей — верификация callback (заголовки отправителя) И серверный re-query статуса транзакции у Platega (`GET transaction/{id}`); callback сам по себе не является источником истины — **Reversibility:** costly — снятие re-query открывает forgiveness/forge-риск на всем money path
- **D-35:** Сверяем сумму и валюту платежа против сохранённого заказа; расхождение → не выдаём, алерт — **Reversibility:** costly — ослабление проверки суммы = финансовые потери
- **D-36:** Два режима: тестовый merchant/ключ в `.env.local` (dev), боевой — в проде; переключение по env — **Reversibility:** costly — тестовый и боевой ключи в одном коде требуют чёткого разделения, иначе риск спутать
- **D-37:** Типизированный `PlategaError` + zod на всех границах, `lib/platega.ts` — единственное место сетевых вызовов; секреты (merchant id / secret) только в `lib/env.ts`
- **D-38:** Ingest-fast / fulfill-async: callback хендлер проверяет + отвечает 200 немедленно, выдача ключа идёт из outbox-worker'а (устойчиво к ARTEMIDA 502/429) — **Reversibility:** one-way — перенос выдачи внутрь callback после запуска ломает идемпотентность/retry-контракт Platega
- **D-39:** Заказ — state machine `pending → paid → provisioning → provisioned / failed`; `Platega transaction id` UNIQUE (tx-id dedupe) — **Reversibility:** one-way — смена модели состояний заказов требует миграции и перепривязки истории платежей
- **D-40:** Reconcile-job (ежечасный) сверяет незавершённые заказы с Platega (`GET transaction`) и добивает потерянные callback'и
- **D-41:** ARTEMIDA-сбой при выдаче (502/429/402) → retry с backoff + состояние `PROVISION_ERROR`; при исчерпании попыток — алерт/тикет, заказ не теряется
- **D-42:** Один pipeline для new/renew/upgrade — заказ несёт `{kind, keyId?, params}`; выдача ветвится по `kind`, платёжная логика общая — **Reversibility:** costly — второй платёжный flow дублирует деньги/идемпотентность
- **D-43:** Цена renew/upgrade считается через `GET /pricing` (artemida quote), как в Phase 2
- **D-44:** На trial-ключах renew/upgrade скрыты и в боте, и в кабинете (API их запрещает); показывается CTA «Купить подписку»
- **D-45:** Семантика standard: renew добавляет дни к текущему сроку; upgrade добавляет устройства с prorated-доплатой (как считает ARTEMIDA)
- **D-46:** История строится из нашей БД (orders/payments), без живого запроса к Platega — **Reversibility:** costly — переход на live-историю меняет контракт страницы и оффлайн-поведение
- **D-47:** История видна и в боте, и в кабинете
- **D-48:** Строка платежа: сумма, статус, дата, что куплено (new/renew/upgrade + ключ)

### the agent's Discretion
None — все развилки закрыты явным выбором пользователя.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAY-01 | Пользователь оплачивает выбранный тариф через Platega (карты МИР / СБП) и мгновенно получает subscription-ссылку + QR после `CONFIRMED` | Platega create contract pinned (§Platega API Contract); order + outbox + worker design (§Architecture Patterns); QR PNG/SVG from `lib/qr.ts`; **BLOCKED upstream on ARTEMIDA create-key endpoint (Open Q1)** |
| PAY-02 | Пользователь может продлить не-trial ключ (`POST /keys/{id}/renew`) с оплатой разницы через тот же pipeline | `artemida.renewKey(id,{days,devices})` exists (`lib/artemida.ts:510-514`); same `kind:'renew'` order path; trial block D-44 enforced server-side; renew price via `GET /pricing` |
| PAY-03 | Пользователь может докупить устройства (`POST /keys/{id}/upgrade`), на trial-ключах кнопки скрыты | `artemida.upgradeKey(id,{days,devices})` exists (`lib/artemida.ts:516-520`); upgrade prorated quote is **unresolved (Open Q2)**; trial keys render no controls (UI-SPEC §5) |
| PAY-04 | Пользователь видит историю своих платежей (сумма, статус, дата) | History from our `orders` DB (D-46), `PaymentHistoryList` + `app/payments/page.tsx` + bot `bot.menuPayments`; ownership-joined reads (T-02-* pattern) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **Secrets only in env/secrets:** `ARTEMIDA_API_KEY`, Platega merchant id/secret, SSH/root password — never committed; root password must be rotated and moved to a secret manager. Platega credentials therefore extend `lib/env.ts` only (D-37) and never appear in `.env.example` with real values.
- **RU/RUB only:** every visible string resolves through `lib/i18n` `t()`/`tp()`; history/amount formatted with `Intl.NumberFormat('ru-RU')`; currency always RUB.
- **No raw provider errors to users:** branch on typed codes (`ArtemidaError.code`, `PlategaError.code`); never echo Platega status strings, transaction ids, ARTEMIDA error text, or HTTP codes (D-19/D-24, UI-SPEC Copywriting Contract).
- **Tech stack:** Node + Next.js + Telegraf are user-mandated; single server, `my.3set.online`, HTTPS mandatory for the Platega callback.
- **API limits:** trial cannot renew/upgrade; `permanent delete` gives no refund; honor 401/402/409/429/502/503 and `Retry-After`.
- **GSD workflow:** code changes only inside a GSD workflow (`/gsd-execute-phase`).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.3.7 (installed `package.json:16`) | BFF route handlers, cabinet pages, webhook, `instrumentation.ts` worker host | Already the repo's app framework; Route Handlers are the mandated BFF tier |
| TypeScript | ^5 (`package.json:39`) strict | Boundary types | Existing project convention |
| Prisma + `@prisma/client` | `^7.10.0` / `7.10.0` | `Order`/`Outbox` models, atomic `updateMany` transitions | Existing client (`lib/prisma.ts`); pin v7, never v8-RC |
| PostgreSQL | 17 (deploy), 16.15 local | Orders/outbox persistence, concurrent writers | Existing `docker-compose.yml`; local Homebrew 16.15 is running |
| zod | 4.6.5 | Validate Platega create responses, callback body, status re-query, order body, env | Existing pattern at every boundary (`lib/artemida.ts`, `lib/env.ts`, routes) |
| p-retry | ^7.1.1 | Backoff for **retryable GET** (status re-query) and reuse via `lib/artemida.ts` | Already used by `lib/artemida.ts:435-456` |
| pino | 10.3.1 | Structured logs (order id, status, tx id, ARTEMIDA `Retry-After`) | Existing `lib/logger.ts`; no `console.*` in `lib/` |
| `qrcode` | ^1.5.4 (installed) | Server-side QR (SVG for cabinet, PNG Buffer for bot) | Already in deps; `QRCode.toBuffer` confirmed a function in the installed version |
| Telegraf | 4.16.3 | Bot purchase/renew/upgrade entry, provisioned push + QR photo | Existing `lib/bot.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| native `fetch` (Node 24) | built-in | Platega HTTP client | `lib/platega.ts` only; no official Node SDK exists |
| `node:crypto` `timingSafeEqual` | built-in | Callback `X-MerchantId`/`X-Secret` compare | Reuse the length-guarded pattern from `lib/auth.ts:34-48` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `lib/platega.ts` | unofficial `platega` npm package | No official Node SDK; a package would be unaudited supply-chain risk on the money path — rejected (consistent with STACK.md) |
| In-process `instrumentation.ts` worker | BullMQ + Redis | Overkill for single-server v1; adds infra + failure mode (STACK "What NOT to Use") |
| In-process hourly tick | host cron → `/api/cron/reconcile` | Both valid; in-process needs no server config. Recommend in-process tick + an optional manual `/api/cron/reconcile` route for Phase 5 ops |
| `Decimal` amount | `Int` amount | Provider quotes whole RUB (49/120/300). `Int` is simpler; a fractional callback fails the equality check → fail-closed (D-35). Document the integer guard |

**Installation:** No new packages. The phase adds **zero** runtime dependencies (`qrcode`, `p-retry`, `zod`, `pino`, `telegraf`, Prisma are already installed). Verify: `npm ls qrcode p-retry zod` — no change to `package.json` required.

## Package Legitimacy Audit

> This phase installs **no** external packages.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — no additions to `package.json`)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*All libraries used by this phase (`qrcode`, `p-retry`, `zod`, `pino`, `telegraf`, `@prisma/client`) already exist in `package.json` and were verified in prior phases; no new install means no new supply-chain surface. If an executor is tempted to add an unofficial Platega SDK, that is a violation of D-37 and must be rejected.*

## Platega API Contract (fetched live 2026-10-03)

Source: `https://docs.platega.io` — OpenAPI pages fetched this session. All values below are quoted from the provider's own spec, not training memory.

### Transport & auth

| Property | Value | Tag |
|----------|-------|-----|
| Base URL | `https://app.platega.io/` | `[VERIFIED: docs.platega.io/авторизация-1991638m0.md]` |
| Auth | Headers `X-MerchantId: <UUID>` + `X-Secret: <API key>` on create, status re-query, and callback | `[VERIFIED: docs.platega.io/.../создание...-29203843e0.md]` |
| Body encoding | JSON over HTTPS | `[VERIFIED: docs.platega.io/авторизация-1991638m0.md]` |
| Signature | **None** — callback authentication is only the two headers; there is no HMAC field | `[VERIFIED: docs.platega.io/callback-...-29209725e0.md]` |

### Create transaction — two documented endpoints

| Endpoint | When | Request body (operative fields) | Response link field |
|----------|------|-------------------------------|---------------------|
| `POST /v2/transaction/process` | **No method specified** — payer chooses on the hosted page. Required: `paymentDetails`, `description`, `return`, `failedUrl`. | `{ paymentDetails:{amount:number,currency:string}, description, return, failedUrl, payload, orderId, metadata:{userId,userName} }` | `url` (e.g. `https://pay.platega.io/?id=…`) |
| `POST /transaction/process` | **Method specified** — preselect `paymentMethod`. Required adds `paymentMethod`. | same + `paymentMethod` | `redirect` (per `CreateTransactionResponse` schema) |

`[VERIFIED: docs.platega.io/создание-платежной-ссылки-без-заданного-метода-33845703e0.md, …-с-заданным-методом-29203843e0.md]`

**Normalization rule (critical):** the response's payable-URL field differs by endpoint — `url` on `/v2/transaction/process`, `redirect` on `/transaction/process`. The client must normalize `url ?? redirect`. The shared `CreateTransactionResponse` schema also exposes `transactionId` (uuid), `status` (PENDING), `expiresIn` (`HH:MM:SS`), `return`, `merchantId`, `usdtRate`. `transactionId`, `status` are `required`. `[VERIFIED: docs.platega.io/createtransactionresponse-13226218d0.md]`

**Recommendation for D-33:** use `POST /v2/transaction/process` (no `paymentMethod`) so the payer picks **МИР (card)** or **СБП** on Platega's hosted page — this matches the requirement «карты МИР / СБП» and the hosted-redirect UX without us choosing a method on the user's behalf. Do **not** pass `id` (server-generated).

### Payment methods (`PaymentMethodInt`)

| Value | Name |
|-------|------|
| 2 | СБП (QR-код) |
| 3 | ЕРИП |
| 11 | Карточный эквайринг |
| 12 | Международная оплата |
| 13 | Криптовалюта |
| 14 | Sberpay |

`[VERIFIED: docs.platega.io/paymentmethodint-13226216d0.md]` — note there is **no dedicated "МИР" id**; card payments go through the card-acquirer method (11) or the hosted chooser. This supports using the no-method endpoint.

### Status re-query (D-34)

`GET /transaction/{id}` → `TransactionStatusResponse`:

```
{ id: uuid, status: PENDING|CANCELED|CONFIRMED|CHARGEBACKED,
  paymentDetails: { amount: number, currency: string },
  paymentMethod: string (e.g. "SBPQR"), payload: string,
  externalId, description, return, qr, expiresIn, merchantName, ... }
```

`[VERIFIED: docs.platega.io/transactionstatusresponse-13226219d0.md, …/проверка-статуса-оплаты-платежа-29203844e0.md]` — the status enum includes **CHARGEBACKED**, and the 404 response is "Транзакция не найдена".

### Callback

- URL configured in Platega LK (Настройки → Callback URLs). HTTPS only, public domain, valid CA cert; **self-signed, private IPs, localhost/loopback forbidden**. `[VERIFIED: docs.platega.io/callback-...-29209725e0.md]`
- Headers: `X-MerchantId`, `X-Secret`. Body: `{ id: uuid, amount: number, currency: string, status: enum, paymentMethod?: number, payload?: string }`; `id, amount, currency, status` required. `[VERIFIED: same]`
- Statuses: **`CONFIRMED`**, **`CANCELED`** in the schema enum; the prose adds **`CHARGEBACKED`** on refund. `[VERIFIED: same]` — the callback schema and `PaymentStatus` enum disagree on CHARGEBACKED, so the zod schema must **accept** it while the state machine maps it to `refunded`.
- Retry contract: if no successful response within **60 s**, the request is cancelled, then **up to 3 retries at 5-minute intervals**. `[VERIFIED: same]`
- `payload` is echoed back in callback/status responses — use our `orderId` as `payload` (the order↔tx join, plus recovery when the create response was lost).

### `metadata.userId` — antifraud requirement

Both create endpoints document: for some merchant categories `metadata.userId` is **required**; omitting it when required disables antifraud and may disconnect the shop. Send `metadata: { userId: String(telegramId), userName: <@username|name> }`. `[VERIFIED: docs.platega.io/...-33845703e0.md]` Note the `CreateTransactionRequest` schema page omits `metadata` and declares `additionalProperties:false`, while the endpoint body explicitly documents it — treat `metadata` as accepted (endpoint definition is operative). `[ASSUMED]` — verify on the owner's first live create call.

### Platega error mapping

Documented error responses: `400` validation, `401` auth (`X-MerchantId`/`X-Secret`). Status re-query adds `404` transaction-not-found. `[VERIFIED: create/status pages]` Map to a typed `PlategaError` code set paralleling `ArtemidaError` (`lib/artemida.ts:21-29`): `bad_request | unauthorized | not_found | server_error | network`. Provider text is never surfaced (D-19/D-24).

### No documented idempotency key for create

The Platega create API documents **no** `Idempotency-Key` request header. `[ASSUMED]` (absence of documentation is not proof it is unsupported). Consequence: **do not auto-retry `createTransaction` in-process** — a blind retry can mint two transactions. Instead, persist the order first and rely on the callback `payload` join + reconcile for recovery. Retries are safe only for `GET /transaction/{id}`.

## Architecture Patterns

### System Architecture Diagram

```
Cabinet PayCta / Bot "Pay" button
        │  POST /api/orders {kind,days,devices,keyId?}   (session-gated)
        ▼
[ BFF /api/orders ]──zod──▶ orders.insert{status:pending, amount:from GET /pricing}
        │                         │
        │                         ▼
        │                lib/platega.createTransaction  (X-MerchantId/X-Secret)
        │                         │  {transactionId, url|redirect, status:PENDING}
        │                         ▼
        │                orders.update{plategaTxId, paymentUrl}
        │                         │
        └──── return {url} ───────┘
                  │
        user pays on pay.platega.io (МИР/СБП)      ┌──────────────────────────────┐
                  │                                 │  hourly reconcile tick       │
                  ▼                                 │  GET /transaction/{id}       │
   POST /api/platega/callback (public, no session)  │  for pending orders           │
                  │                                 └──────────────┬───────────────┘
        verify X-MerchantId/X-Secret (timing-safe)                │
                  │ 401 if bad                                      │
                  ▼                                                 │
        zod-parse callback {id,amount,currency,status,payload}      │
                  │                                                 │
        resolve order by plategaTxId, else by payload               │
                  │                                                 │
        D-34 re-query GET /transaction/{id} ◀───────────────────────┘
                  │
        D-35 compare amount+currency vs stored order ──mismatch──▶ mark review + alert (no issue)
                  │ match
        status CONFIRMED & order pending
                  │
        atomic UPDATE orders SET status=paid WHERE status=pending
                  │
        outbox.upsert {(orderId,'fulfill-order')}   ── 200 to Platega (<60s, always)
                  │
                  ▼
   [ lib/worker.ts outbox loop (setInterval from instrumentation.ts) ]
        claim row (updateMany pending→processing)
                  │  branch by order.kind
        ┌─────────┼──────────────────┐
        ▼         ▼                  ▼
   new:       renew: days        upgrade: addDevices
   createKey  renewKey(id,..)    upgradeKey(id,..)
   (Open Q1)  Idempotency-Key = order:{id}:renew   Idempotency-Key = order:{id}:upgrade
        │         │                  │
        └─────────┴──────────┬───────┘
                  success    │  ArtemidaError (429/502/503/402)
                  ▼          ▼
          order=provisioned   attempts++ / nextAttemptAt backoff
          outbox notify        (stay provisioning; → failed after max attempts + alert)
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
  bot push (sendPhoto QR)   cabinet GET /api/orders/{id} → provisioned panel
```

### Recommended Project Structure (additions)
```
app/
├── api/
│   ├── orders/route.ts                 # POST create order (session-gated)
│   ├── orders/[orderId]/route.ts       # GET order status (session-gated, ownership-joined)
│   ├── platega/callback/route.ts       # public callback (header verify, fast 200)
│   └── pricing/route.ts                # EXTEND: renew/upgrade quote modes
├── payments/page.tsx                   # history (RSC, session-gated)
└── payments/[orderId]/page.tsx         # status panel + client poller
components/
├── PayCta.tsx                          # create order → window.location.assign(url)
├── OrderStatusPanel.tsx                # server panel + poller island
├── PaymentStatusChip.tsx               # status → label + tint (single registration point)
├── PaymentHistoryList.tsx              # history rows
└── RenewPanel.tsx / UpgradePanel.tsx   # live quote + pay CTA (never on trial keys)
lib/
├── platega.ts                          # single Platega network point (D-37)
├── orders-service.ts                   # create/transition/read orders (shared bot+cabinet)
├── outbox.ts                           # enqueue + atomic claim helpers
├── worker.ts                           # setInterval loops (outbox + hourly reconcile)
└── qr.ts                               # EXTEND: add renderSubscriptionQrPng(buf)
instrumentation.ts                      # root: register() → startWorker() (NEXT_RUNTIME==='nodejs')
prisma/schema.prisma                    # Order / Outbox (+ enums) + migration
```

### Pattern 1: Order creation is server-quoted and persisted before redirect

**What:** the client sends only `{kind, days, devices, keyId?}`; the server re-quotes via `artemida.getPricing`, writes a `pending` order with that exact amount, then calls Platega.
**When to use:** every purchase/renew/upgrade.
**Why:** never trust a client price (T-02 finance); the stored `amount` is what D-35 compares against.

```typescript
// app/api/orders/route.ts (shape)
const body = createOrderSchema.parse(await req.json());      // zod at boundary
const telegramId = await requireSession();
const quote = await artemida.getPricing({ days, devices });  // D-43, exact provider amount
const order = await prisma.order.create({
  data: { userId, kind, keyId: body.keyId ?? null, days, devices,
          amount: Math.round(quote.price), currency: quote.currency, status: 'pending' },
});
const tx = await platega.createTransaction({
  amount: order.amount, currency: order.currency,
  description: `Order ${order.id}`,
  return: `${env.APP_BASE_URL}/payments/${order.id}`,
  failedUrl: `${env.APP_BASE_URL}/payments/${order.id}`,
  payload: order.id,                                    // order↔tx join
  metadata: { userId: String(telegramId), userName: <name> },
});
await prisma.order.update({ where: { id: order.id },
  data: { plategaTxId: tx.transactionId, paymentUrl: tx.url } });
return Response.json({ url: tx.url });                  // UI-SPEC expects { url }
```

### Pattern 2: Ingest-fast / fulfill-async with atomic transitions (D-38/D-39)

**What:** callback verifies + acks 200 without touching ARTEMIDA; a `paid` transition atomically claims the order and enqueues one outbox row; the worker claims the row and provisions.
**When to use:** the callback route and the worker.
**Why:** Platega's 60s/3×5min retry contract + ARTEMIDA 502/429 make inline provisioning a paid-but-no-key generator.

```typescript
// callback: only one caller can flip pending→paid; duplicate delivery no-ops
const claimed = await prisma.order.updateMany({
  where: { id: order.id, status: 'pending' },
  data: { status: 'paid', paidAt: new Date() },
});
if (claimed.count === 1) {
  await prisma.outbox.upsert({
    where: { orderId_type: { orderId: order.id, type: 'fulfill-order' } },
    update: {},
    create: { orderId: order.id, type: 'fulfill-order' },
  });
}
return new Response('OK'); // always 200 after processing attempt
```

### Pattern 3: In-process worker started from `instrumentation.ts` (Next 16)

**What:** `instrumentation.ts` `register()` runs once per server instance; start the outbox loop + hourly reconcile there, gated to the Node runtime.
**When to use:** v1 single-process deployment (no external queue/cron).
**Why:** documented Next 16 hook; satisfies D-40 without new infra.

```typescript
// instrumentation.ts (root)
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;      // edge guard (docs)
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startWorker } = await import('./lib/worker');
  startWorker();                                          // singleton-guarded internally
}
```
`[VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/instrumentation (v16.3.8)]` — `register` is called once when a server instance is initiated and must complete before the server serves requests; gate non-Node work with `NEXT_RUNTIME`.

### Pattern 4: Deterministic Idempotency-Key for ARTEMIDA writes (Pitfall 2 / D-18/D-41)

**What:** fulfillment must reuse a key derived from the order and operation across every retry, so a worker retry never mints a second key.
**The gap:** `lib/artemida.ts:405-411` currently sets a **fresh `randomUUID()` per request**:
```typescript
const headers: Record<string, string> = { Authorization: `Bearer ${env.ARTEMIDA_API_KEY}`, Accept: "application/json" };
if (method === "POST" || method === "DELETE") {
  headers["Idempotency-Key"] = randomUUID();   // lib/artemida.ts:410 — fresh each call
}
```
`[VERIFIED: lib/artemida.ts:405-411]` **Required change:** extend `RequestOptions` and the write methods to accept an optional caller-supplied `idempotencyKey`, defaulting to `randomUUID()` only when omitted. Fulfillment passes `order:${orderId}:${kind}` (e.g. `order:abc:renew`). Without this, a `p-retry` of a *new* top-level call mints a different key (Pitfall 2).

### Pattern 5: Callback header verification mirrors `lib/auth.ts` timing-safe compare

Reuse the length-guarded `timingSafeEqual` discipline already in `lib/auth.ts:34-48` (never `===`; guard length; never throw). Platega has no signature, so header equality to env is the only authenticator — combine it with the mandatory re-query (D-34).

### Anti-Patterns to Avoid
- **Provisioning inside the callback** (D-38): ARTEMIDA slowness → Platega timeout → 3 retries → duplicate keys.
- **Trusting callback `amount`/`status` alone**: forged callback or a `PENDING` body must never issue a key — always re-query + compare (D-34/D-35).
- **Fresh `Idempotency-Key` on fulfillment retry**: double provisioning (Pattern 4).
- **Rendering Platega `url`/status/id or ARTEMIDA error text**: UI-SPEC forbids; map through i18n.
- **A second payment flow for renew/upgrade** (D-42): branch `kind` inside one pipeline.
- **Auto-retrying `createTransaction`**: no idempotency contract; can double-create.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backoff/retry for ARTEMIDA + Platega GET | custom sleep loops | `p-retry` (already in `lib/artemida.ts`) | Honors Retry-After, random jitter; one policy point |
| Timing-safe secret compare | `a === b` | `node:crypto.timingSafeEqual` + length guard (`lib/auth.ts:34-48`) | Prevents timing oracle + length-mismatch throw (T-02 style) |
| QR generation | manual SVG/PNG math | `qrcode` (`toString` svg / `toBuffer` png) | Already installed; `toSvg` does **not** exist |
| Atomic claim across concurrent workers | read-then-write | Prisma `updateMany({where:{...status}})` count check | Same pattern as `claimTrial` (`lib/keys-service.ts:296-302`) |
| DB migrations | SQL by hand | `prisma migrate` | Repo uses Prisma migrations (`prisma/migrations/…`) |
| Money parsing/formatting | `parseFloat` + string concat | server quote `Int` + `Intl.NumberFormat('ru-RU')` | Avoids float drift + reflow; UI-SPEC formatting rule |

**Key insight:** every load-bearing primitive already exists in the repo (typed errors, zod, p-retry, atomic claim, ownership joins, server QR, i18n). Phase 3 is composition, not new infrastructure — except the two upstream ARTEMIDA gaps that cannot be hand-rolled.

## Common Pitfalls

### Pitfall 1: Paid but no key (PITFALLS P1)
**What goes wrong:** `CONFIRMED` arrives, ARTEMIDA create/renew fails (502/429/402/timeout), user paid and has nothing.
**Why it happens:** provisioning lives in the request path with no persistent order/retry.
**How to avoid:** order row before redirect; `pending→paid` atomic claim; outbox worker; backoff; `failed` after max attempts + alert; hourly reconcile.
**Warning signs:** no `orders`/`outbox` table; no worker; tested only with ARTEMIDA up.

### Pitfall 2: Double provisioning on retries (PITFALLS P2)
**What goes wrong:** duplicate callback or worker retry mints two keys.
**Why it happens:** fresh `Idempotency-Key` per call; no tx-id dedupe; no state guard.
**How to avoid:** UNIQUE `plategaTxId`; `paid` never re-provisions; deterministic `order:{id}:{kind}` Idempotency-Key (Pattern 4); outbox unique `(orderId,type)`.
**Warning signs:** duplicate callback → two keys; `Idempotency-Key` random on retry.

### Pitfall 3: Forged callbacks (PITFALLS P3)
**What goes wrong:** anyone POSTs the (public) callback URL and mints a free key.
**Why it happens:** trusting the body; looking for a nonexistent HMAC signature; skipping re-query/amount check.
**How to avoid:** timing-safe `X-MerchantId`/`X-Secret`; server re-query; amount+currency equality vs the stored order (D-34/D-35); only `CONFIRMED` provisions.
**Warning signs:** no header check; no re-query; `amount` never compared.

### Pitfall 4: ARTEMIDA wallet dry — 402 everywhere (PITFALLS P4)
**What goes wrong:** every fulfillment returns 402; every purchase fails after payment.
**How to avoid:** map 402 to `failed` + admin alert, never raw; surface honest RU copy; admin balance widget is Phase 5 but the alert/order retention is Phase 3. Do not capture-and-abandon: retries + reconcile keep the order alive.
**Warning signs:** 402 handled as generic 500; no order retention.

### Pitfall 5: Trial renew/upgrade (PITFALLS P6 / D-44)
**What goes wrong:** trial key shows renew/upgrade; API returns 409 and the user is stuck.
**How to avoid:** render no controls on `isTrial` keys (DOM-absent, UI-SPEC §5); reject server-side with a clean 409 family mapped to `trial.usedBody`, never a raw 409.
**Warning signs:** a trial card with a renew button; raw 409 in UI.

### Pitfall 6: Lost callback / lost create response
**What goes wrong:** callback is lost, or the create response times out but the tx exists.
**Why it happens:** no reconciliation; matching only by `plategaTxId` (null when create response lost).
**How to avoid:** hourly reconcile of pending orders by tx id; callback fallback match by `payload=orderId`; always send `payload`.
**Warning signs:** orders stuck `pending` forever; tx with no stored id.

### Pitfall 7: Raw provider strings leaking to UI (D-19/D-24)
**What goes wrong:** "PENDING", a uuid, or an ARTEMIDA error appears in the cabinet/bot.
**How to avoid:** `PaymentStatusChip` maps every state to an i18n label; routes log codes only; UI-SPEC Copywriting Contract is the only string source.
**Warning signs:** any Platega/ARTEMIDA word in a component.

### Pitfall 8: Next worker double-start under HMR / build
**What goes wrong:** dev HMR re-registers `instrumentation`, starting duplicate intervals; or the module runs during `next build`.
**How to avoid:** global singleton flag (as `lib/bot.ts:274-283` does for `launch()`), `NEXT_PHASE` guard, `NEXT_RUNTIME==='nodejs'`, and unref/try-catch so a worker error never crashes the server.
**Warning signs:** duplicate notifications; build logs of worker start.

## Code Examples

Verified patterns from authoritative sources and this repo.

### Platega create transaction (no method) — request/response
```typescript
// lib/platega.ts — POST https://app.platega.io/v2/transaction/process
// Headers: X-MerchantId, X-Secret, Content-Type: application/json
const body = {
  paymentDetails: { amount: order.amount, currency: order.currency }, // RUB
  description: `Order ${order.id}`,
  return: `${env.APP_BASE_URL}/payments/${order.id}`,
  failedUrl: `${env.APP_BASE_URL}/payments/${order.id}`,
  payload: order.id,                                   // order↔tx join
  metadata: { userId: String(telegramId), userName: name },
};
// 200 example (docs): { transactionId: "<uuid>", status: "PENDING",
//   url: "https://pay.platega.io/?id=…", expiresIn: "00:15:00", rate: 91.2 }
```
`[VERIFIED: docs.platega.io/создание-платежной-ссылки-без-заданного-метода-33845703e0.md]`

### Status re-query (used by callback and reconcile)
```typescript
// GET https://app.platega.io/transaction/{id}  (headers X-MerchantId/X-Secret)
const tx = await platega.getTransaction(cb.id);
if (tx.status !== 'CONFIRMED') return new Response('OK');           // no issue
if (tx.paymentDetails.amount !== order.amount ||
    tx.paymentDetails.currency !== order.currency) {                 // D-35
  await flagForReview(order.id); alertAdmin(order.id);               // never issue
  return new Response('OK');
}
```
`[VERIFIED: docs.platega.io/transactionstatusresponse-13226219d0.md]`

### Timing-safe callback header verification
```typescript
// lib/platega.ts — pattern mirrors lib/auth.ts:34-48 (never `===`, guard length)
import { timingSafeEqual } from 'node:crypto';
function safeEq(a: string | null, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}
export function verifyPlategaHeaders(h: Headers): boolean {
  return safeEq(h.get('x-merchantid'), env.PLATEGA_MERCHANT_ID)
      && safeEq(h.get('x-secret'), env.PLATEGA_SECRET);
}
```
`[VERIFIED: lib/auth.ts:34-48 pattern]` + `[VERIFIED: docs.platega.io/callback-…-29209725e0.md]`

### Deterministic Idempotency-Key (requires extending lib/artemida.ts)
```typescript
// lib/artemida.ts — today: headers["Idempotency-Key"] = randomUUID();  (line 410)
// target: accept an optional key on writes
interface RequestOptions<T> { /* … */ idempotencyKey?: string }
// in request(): headers["Idempotency-Key"] = opts.idempotencyKey ?? randomUUID();
await artemida.renewKey(order.keyId, { days: order.days, devices: order.devices },
  { idempotencyKey: `order:${order.id}:renew` });
```
`[VERIFIED: lib/artemida.ts:405-411]` — the current fresh-UUID behavior is quoted verbatim above.

### Order/Outbox Prisma models (proposed; new, not yet in schema)
```prisma
enum OrderKind   { new renew upgrade }
enum OrderStatus { pending paid provisioning provisioned failed canceled refunded }
enum OutboxStatus { pending processing done failed }

model Order {
  id               String      @id @default(cuid())
  userId           Int
  user             User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind             OrderKind
  keyId            String?     @map("key_id")     // target key for renew/upgrade
  days             Int?
  devices          Int
  amount           Int                              // whole RUB from GET /pricing
  currency         String      @default("RUB")
  status           OrderStatus @default(pending)
  plategaTxId      String?     @unique @map("platega_tx_id")   // D-39 tx-id dedupe
  paymentUrl       String?     @map("payment_url")            // re-open Platega URL
  paidAt           DateTime?   @map("paid_at")
  provisionedKeyId String?     @map("provisioned_key_id")
  errorCode        String?     @map("error_code")
  attempts         Int         @default(0)
  nextAttemptAt    DateTime?   @map("next_attempt_at")
  createdAt        DateTime    @default(now()) @map("created_at")
  updatedAt        DateTime    @updatedAt @map("updated_at")
  outbox           Outbox[]
  @@index([userId, createdAt])
  @@index([status, nextAttemptAt])
  @@map("orders")
}

model Outbox {
  id           String       @id @default(cuid())
  orderId      String
  order        Order        @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type         String       // "fulfill-order" | "notify-provisioned" | "notify-failed"
  status       OutboxStatus @default(pending)
  attempts     Int          @default(0)
  lastError    String?      @map("last_error")
  nextAttemptAt DateTime    @default(now()) @map("next_attempt_at")
  createdAt    DateTime     @default(now()) @map("created_at")
  processedAt  DateTime?    @map("processed_at")
  @@unique([orderId, type])                    // idempotent enqueue (D-38)
  @@index([status, nextAttemptAt])
  @@map("outbox")
}
```
Existing models to extend with relations: `User` gains `orders Order[]`; `KeyCache` unchanged. `[VERIFIED: prisma/schema.prisma:19-60]` (User/KeyCache shapes read this session).

### Worker claim + singleton start
```typescript
// lib/worker.ts
const g = globalThis as unknown as { __setwhiteWorker?: boolean };
export function startWorker() {
  if (g.__setwhiteWorker) return;               // HMR/duplicate guard
  g.__setwhiteWorker = true;
  setInterval(() => void drainOutbox().catch((e) => logger.error({ outcome: 'worker-outbox', e })), 5_000);
  startReconcileTick();                          // hourly
}
async function drainOutbox() {
  const jobs = await prisma.outbox.findMany({ where: { status: 'pending', nextAttemptAt: { lte: new Date() } }, take: 10 });
  for (const job of jobs) {
    const claim = await prisma.outbox.updateMany({ where: { id: job.id, status: 'pending' }, data: { status: 'processing' } });
    if (claim.count !== 1) continue;             // another tick won
    await process(job);
  }
}
```
`[VERIFIED: docs Next instrumentation]` + `[VERIFIED: lib/keys-service.ts:296-302 claim shape]`

### Bot QR photo
```typescript
// lib/qr.ts — add:
export async function renderSubscriptionQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 256 });
}
// lib/bot.ts — on provisioned:
const png = await renderSubscriptionQrPng(subscriptionUrl);
await bot.telegram.sendPhoto(chatId, { source: png }, { caption: `${t('key.linkTitle')}\n${subscriptionUrl}` });
```
`QRCode.toBuffer` confirmed a function in installed `qrcode@1.5.4`; UI-SPEC rendering dependency mandates server PNG, error correction M, quiet zone 4. `[VERIFIED: node -e require('qrcode').toBuffer === 'function']`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-pwa` | `@serwist/next` | prior phase | Not payment-specific; unchanged |
| BullMQ/Redis queues for v1 | in-process outbox + `instrumentation.ts` | Next 15 `instrumentation` stable | No new infra for single-server payments |
| Polling Platega as primary flow | Webhook-first + idempotent handler + hourly reconcile | Platega contract | Lower quota, instant issuance (STACK "What NOT to Use") |
| Sync provisioning in callback | Ingest-fast / fulfill-async (D-38) | project decision | Eliminates paid-no-key + duplicate class |

**Deprecated/outdated:**
- Any assumption that Platega callbacks carry an HMAC signature — they do not; only `X-MerchantId`/`X-Secret` headers.
- Matching only on `plategaTxId`: use `payload=orderId` as the recovery join.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ARTEMIDA creates a paid key via some `POST /keys`-style endpoint with `{days, devices, customerRef}` and returns a normalized key | Summary / PAY-01 / Open Q1 | **HIGH** — `kind:'new'` fulfillment cannot be built or tested without the real shape; every new purchase fails |
| A2 | The prorated upgrade charge can be derived from `GET /pricing` (or `deviceTiers`/`devicePricePerMonth` + remaining days) well enough to collect the right amount before upgrade | PAY-03 / Open Q2 | **HIGH** — under/overcharge on every upgrade; D-35 compares against our stored amount, not ARTEMIDA's actual charge |
| A3 | Platega accepts the `metadata` field on create despite `CreateTransactionRequest` declaring `additionalProperties:false` | Platega contract | MEDIUM — antifraud disabled/shop at risk if rejected for a category that requires it |
| A4 | `CHARGEBACKED` can arrive as a callback `status` (prose says yes; schema enum lists only CONFIRMED/CANCELED) | Platega contract / state machine | MEDIUM — a chargeback could be dropped or throw a zod parse error; schema must accept it |
| A5 | Platega create has no idempotency key (docs do not document one) | Platega client | MEDIUM — if an undocumented key exists we under-use it; if we assumed it existed falsely we would double-create |
| A6 | `instrumentation.ts` `register()` runs in the production standalone server (not just dev) | Worker design | MEDIUM — if it does not fire in the Docker standalone image, the outbox never drains; mitigate with an optional `/api/cron/reconcile` route + health check |
| A7 | Telegram photo delivery works from a Buffer via `sendPhoto({source})` | Bot delivery | LOW — standard Telegraf API |
| A8 | Whole-ruble `Int` amounts are safe for all tariffs | Order schema | LOW — provider quotes integers; fractional callback fails closed per D-35 |

## Open Questions

> **Resolution status (annotated with the 03-01 revision):** Q1–Q5 are resolved at
> plan level; Q1–Q2 are converted into the mandatory 03-01 owner-gated probe, Q3–Q5 are
> resolved by plan-level controls (03-02 env/user_setup, 03-03/03-05 reconcile + history).
> Each question carries an explicit `Status:` line below, mirroring Phase 2.

1. **ARTEMIDA paid-key create endpoint (BLOCKER for PAY-01).**
   - What we know: `lib/artemida.ts` implements `createTrial`, `renewKey`, `upgradeKey` but **no paid `createKey`**; `docs/artemida-v1-contract.md` observed only `GET /pricing|/keys|/balance` and never a create endpoint; `PROJECT.md` names `renew`/`upgrade` but not create.
   - What's unclear: exact method/path/body for a new paid key and its success shape (is it `POST /keys`? does it need `customerRef`? does it accept the same `{days,devices}` as renew?).
   - Recommendation: make the **first Phase 3 task** an owner-gated live probe (extend `scripts/artemida-probe.mjs` or a `--create-key` guarded flag) that captures the create request/response verbatim into `docs/artemida-v1-contract.md`,      then extend `lib/artemida.ts` with `createKey` + tolerant normalizer. Do not build `kind:'new'` fulfillment against an assumed shape.
   - **Status: RESOLVED (plan-level).** Converted into the mandatory 03-01 owner-gated
     probe (`--confirm-create-key`) plus `createKey`; the literal request/response shape is
     captured at 03-01 execution and committed as `docs/artemida-v1-contract.{md,json}`.
     PAY-01 `kind:'new'` fulfillment is built against the observed shape only.

2. **Prorated upgrade quote source (PAY-03 correctness).**
   - What we know: `GET /pricing` returns a full-key `quote`; `apiPricing.upgradeRule` = "tier device price per added device; minimum one full month, proportional above 30 remaining days"; `devicePricePerMonth: 60`.
   - What's unclear: whether `/pricing` can quote an upgrade delta, or whether the delta must be computed locally (and confirmed at `POST /keys/{id}/upgrade`).
   - Recommendation: probe a live upgrade (owner-approved) and record the charged amount; extend `/api/pricing` to accept `{kind:'upgrade', keyId, addDevices}` and      return the amount the provider charges; if only computable locally, mirror `upgradeRule` exactly and add a test with the recorded fixture.
   - **Status: RESOLVED (plan-level).** The 03-01 probe records the live charged amount for
     an upgrade; 03-01 Task 3 extends `/api/pricing` with an upgrade quote mode whose amount
     equals that observed charge (or a local formula whose fixture matches it). 03-04 consumes
     the quote for `kind:'upgrade'`. PAY-03 stays flagged until 03-01 lands.

3. **Platega test/prod credentials & callback URL (D-36).**
   - What we know: `X-MerchantId`/`X-Secret` are issued by a manager and shown in the LK; callback URL is configured in the LK.
   - What's unclear: the owner's test merchant id/secret and the test callback host (callback forbids localhost/private IPs).
   - Recommendation: `.env.local` holds the test pair; prod env holds live. For callback testing locally, use a tunnel or rely entirely on unit tests with fake fetch; never point the LK at localhost.
   - **Status: RESOLVED (plan-level).** 03-02 adds `PLATEGA_MERCHANT_ID`/`PLATEGA_SECRET`/
     `APP_BASE_URL` to `lib/env.ts` with an env-only test/prod switch (D-36) and declares the
     Platega user_setup (merchant creds + LK callback URL). Local callback behavior is covered
     by fake-fetch unit tests; the live LK callback registration is a deploy (Phase 5) action.

4. **In-flight / duplicate order creation.**
   - What we know: UI-SPEC requires a client in-flight lock; server currently has no order table.
   - What's unclear: whether a user should be allowed multiple concurrent pending orders.
   - Recommendation: keep v1 simple — allow, but reconcile expires old pending orders; optionally add a partial unique index later. Flag as a low-risk decision.
   - **Status: RESOLVED (plan-level).** v1 allows concurrent pending orders; the 03-03 hourly
     reconcile tick advances recoverable pending orders and the client in-flight lock
     (03-06 PayCta) prevents double submission. A partial unique index is deferred, not needed
     for v1 correctness.

5. **`return`/`failedUrl` base URL & domain.**
   - What we know: local dev has no `my.3set.online`; Platega requires public HTTPS for the callback but `return`/`failedUrl` may be any URL.
   - Recommendation: add `APP_BASE_URL` to `lib/env.ts` (prod `https://my.3set.online`, dev `http://localhost:3000`).
   - **Status: RESOLVED (plan-level).** 03-02 adds `APP_BASE_URL` (url, default
     `http://localhost:3000`) to `lib/env.ts` as server-only and uses it to build the Platega
     `return`/`failedUrl` `${APP_BASE_URL}/payments/{orderId}`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | app runtime / worker | ✓ | v24.15.0 | — |
| npm | install/test | ✓ | 11.12.1 | — |
| PostgreSQL (local) | DB-backed order/outbox tests | ✓ | 16.15 (Homebrew, :5432 accepting) | — (deploy targets 17-alpine) |
| vitest | test suite | ✓ | 5.0.3 | — |
| `qrcode` (toBuffer) | bot QR PNG | ✓ | 1.5.4 | SVG `toString` for cabinet |
| Docker | deploy (Phase 5) — **not** needed for Phase 3 code/tests | ✗ | — | Local Homebrew Postgres for dev/tests; Docker only at deploy |
| Public HTTPS host | live Platega callback config | ✗ (dev) | — | Unit tests use fake fetch; live callback verified at deploy (Phase 5) |

**Missing dependencies with no fallback:** none blocking code execution. The live Platega callback and live ARTEMIDA create/upgrade probes require the owner's credentials/HTTPS host and are confirmation checkpoints, not build blockers.
**Missing dependencies with fallback:** Docker (defer to Phase 5; use local Postgres now).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.3 |
| Config file | `vitest.config.ts` (node env, dummy env fallback, `DATABASE_URL` defers to `process.env`) |
| Quick run command | `npx vitest run tests/unit` |
| Full suite command | `npx vitest run` (unit + integration) — DB-backed files need a real local Postgres |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-01 | Create order persists `pending` + server-quoted amount; create response normalized (`url ?? redirect`); forged callback → 401, no key; duplicate `CONFIRMED` callback → one `paid` transition + one outbox row; amount/currency mismatch → no issue; worker claim provisioning | unit | `npx vitest run tests/unit/platega-client.test.ts tests/unit/callback-route.test.ts tests/unit/order-service.test.ts tests/unit/outbox-worker.test.ts` | ❌ Wave 0 |
| PAY-02 | Order creation with `kind:'renew'` on an owned non-trial key; trial key rejected 409-family; fulfillment calls `renewKey` with deterministic Idempotency-Key | unit | `npx vitest run tests/unit/order-route.test.ts` | ❌ Wave 0 |
| PAY-03 | `kind:'upgrade'` device bounds `1..(10-limit)`; upgrade quote mode returns provider amount; trial upgrade rejected; ownership join before provider call | unit | `npx vitest run tests/unit/pricing-upgrade-quote.test.ts tests/unit/order-route.test.ts` | ❌ Wave 0 |
| PAY-04 | History reads only the caller's orders (ownership join); row maps amount/status/date/kind; empty state | unit | `npx vitest run tests/unit/order-history.test.ts` | ❌ Wave 0 |
| PAY-04 | Cabinet `/payments` + bot `bot.menuPayments` render rows | manual / RSC build | `npm run build` + browser pass | ❌ human |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit` (DB-backed files require local Postgres; export `DATABASE_URL`).
- **Per wave merge:** `npx vitest run` (unit + integration) + `npx tsc --noEmit`.
- **Phase gate:** full suite green + `npm run build` (all new routes dynamic ƒ) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/helpers/fake-platega.ts` (or extend `tests/helpers/fake-fetch.ts`) — inject create/status responses + headers
- [ ] `tests/unit/platega-client.test.ts` — normalization (`url ?? redirect`), error codes, no auto-retry on create
- [ ] `tests/unit/callback-route.test.ts` — forged-header 401, zod body, duplicate delivery, amount mismatch, re-query requirement, fast 200
- [ ] `tests/unit/order-service.test.ts` + `tests/unit/outbox-worker.test.ts` — transitions, deterministic Idempotency-Key, retry/backoff, `failed` after max attempts
- [ ] `tests/unit/order-route.test.ts` + `tests/unit/pricing-upgrade-quote.test.ts` + `tests/unit/order-history.test.ts`
- [ ] DB-backed tests follow `keys-service.test.ts`/`devices-route.test.ts` style: real local Postgres, `vi.spyOn(artemida, …)`, mock `next/headers`

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (`.planning/config.json`).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireSession()` on `/api/orders*`; callback is header-authenticated (no session) |
| V3 Session Management | no (reuses existing jose cookie) | — |
| V4 Access Control | yes | Ownership join `user: { telegramId }` on every order/history/status read (T-02-17 pattern); non-owned → 404, no oracle |
| V5 Input Validation | yes | zod on order body, callback body, status re-query, path `orderId`, and every Platega/ARTEMIDA response |
| V6 Cryptography | yes | `node:crypto.timingSafeEqual` with length guard for `X-MerchantId`/`X-Secret`; no signature exists, never hand-roll one |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged callback for free keys | Spoofing / Tampering | Timing-safe header compare + server re-query + amount/currency equality; only `CONFIRMED` provisions |
| Duplicate callback / worker retry | Repudiation / DoS | UNIQUE `plategaTxId`; `pending→paid` atomic claim; unique `(orderId,type)` outbox; deterministic ARTEMIDA Idempotency-Key |
| IDOR on order status/history | Information Disclosure | Ownership-joined queries; never trust client-supplied user/key identifiers |
| Amount tampering by client | Tampering | Server re-quotes via `GET /pricing`; client never sends price |
| Secret leakage to browser | Information Disclosure | `PLATEGA_*`/`ARTEMIDA_*` only in `lib/env.ts`; no `NEXT_PUBLIC_*`; routes log codes only |
| Double order/double pay | Tampering | Client in-flight lock + transition guards; reconcile expiry (Open Q4) |
| Chargeback ignored | Repudiation | Map `CHARGEBACKED`→`refunded`, flag + alert; optional admin revoke later |

## Sources

### Primary (HIGH confidence)
- `docs.platega.io` — fetched live 2026-10-03 session: authorization, create-with/without-method endpoints, `CreateTransactionRequest/Response`, `TransactionStatusResponse`, `CallbackPayload`, `PaymentStatus`, `PaymentMethodInt`, callback page (headers, statuses, 60s/3×5min, HTTPS rules) — authoritative provider spec
- `nextjs.org/docs/app/api-reference/file-conventions/instrumentation` (v16.3.8) — `register()` runs once per server instance; `NEXT_RUNTIME` gating
- `lib/artemida.ts` (read this session) — typed errors, p-retry policy, `Idempotency-Key` fresh-UUID gap at lines 405-411, `createTrial`/`renewKey`/`upgradeKey`
- `prisma/schema.prisma` (read this session) — `User`/`KeyCache` models to extend
- `docs/artemida-v1-contract.md` / `.json` (read this session) — observed ARTEMIDA endpoints; create endpoint absent
- `.planning/research/PITFALLS.md`, `ARCHITECTURE.md`, `SUMMARY.md` — pitfall catalogue + order-state/outbox patterns

### Secondary (MEDIUM confidence)
- `.planning/phases/02-keys-trial/02-06-SUMMARY.md` + `02-VERIFICATION.md` — existing BFF/ownership/test patterns, current green suite (11 files / 77 tests)
- `.planning/config.json` — `nyquist_validation:true`, `security_enforcement:true`, ASVS level 1

### Tertiary (LOW confidence)
- ARTEMIDA paid-key create contract — **not observed**; requires owner probe (Open Q1)
- Prorated upgrade quote — not documented; requires owner probe (Open Q2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing; env/tooling verified locally.
- Platega contract: HIGH for create/callback/status/retry (live docs fetched and quoted); MEDIUM for `metadata` acceptance and create idempotency (absence of docs).
- Architecture (order/outbox/worker): MEDIUM-HIGH — composed from verified in-repo patterns + documented Next hook; in-process worker in standalone build is the main residual risk (A6).
- Pitfalls: HIGH — carried from project PITFALLS.md and re-anchored to the live Platega contract.
- Upstream ARTEMIDA create + upgrade pricing: LOW — blocked on owner probe.

**Research date:** 2026-10-03
**Valid until:** 2026-11-02 (30 days; Platega contract is stable, ARTEMIDA behavior must be probed) 

