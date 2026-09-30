# Phase 2: Keys & Trial - Research

**Researched:** 2026-10-01
**Domain:** ARTEMIDA Paid API V1 client + trial anti-abuse + cache-first keys read path + live pricing + server-rendered QR + RU i18n interpolation
**Confidence:** MEDIUM (transport contract — auth, error envelope, headers — verified by live unauthenticated probe this session; V1 success-body shapes are behind an authenticated developer account we do not hold, so they remain `[ASSUMED]` with a mandatory live-probe checkpoint)

## Summary

Phase 2 is the first real ARTEMIDA integration. Three facts discovered this session shape the plan. First, the API host is live and its **transport contract is observable without a key**: `https://artemida.cc/v1` requires `Authorization: Bearer <key>`, returns a consistent `{ok, error:{code,message}, meta:{requestId}}` envelope, echoes `X-Request-Id`, advertises `X-RateLimit-Policy: adaptive-account-and-ip`, and ships a strict CSP with `connect-src 'self'` — which proves the API is server-to-server only and that the BFF design (D-26) is not merely preferred but forced. Second, the provider's **public cabinet** confirms the price model vocabulary and current RUB price points (7d/30d/60d/90d from 49/120/220/300 at 2 devices, per-device discount tiers), but this is the *consumer cabinet* product, not the Bearer Paid API — so it is corroborating evidence, not the contract. Third, `qrcode`'s server API is `toString(text, { type: 'svg', ... })`; there is **no `toSvg()` export** (the UI-SPEC names one). The planner must correct that call.

The successful-response shapes for `GET /pricing`, `POST /trial`, `GET /keys`, `GET /keys/{id}/subscription-links`, and `GET /keys/{id}/devices` could not be read this session because the developer documentation at `/developer-api` redirects unauthenticated callers to the cabinet login and `ARTEMIDA_API_KEY` is not present in the environment. The dominant planning risk is therefore contract drift: a client built on guessed field names fails at the executor's `parse()`. The mitigation is structural — a single `lib/artemida.ts` with tolerant zod schemas at the boundary, a normalized internal model, and one `checkpoint:human-verify` task that runs a live probe as soon as the key is supplied, before any dependent UI is wired.

**Primary recommendation:** Build `lib/artemida.ts` as the single server-only client with a typed `ArtemidaError` mapped off the verified `error.code` envelope, `p-retry@^7.1.1` honoring `Retry-After`/429 and backing off 502/503, `crypto.randomUUID()` `Idempotency-Key` on POST/DELETE; put trial and keys logic in a shared `lib/keys-service.ts` so bot and PWA read through one path; expand `keys_cache` into a usable rendered model with a `GET /api/keys` cache-first route that revalidates via `after()`; render QR server-side with `QRCode.toString(..., { type: 'svg' })`; and gate all live ARTEMIDA calls behind an owner-supplied `ARTEMIDA_API_KEY`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-17:** Полный клиент `lib/artemida.ts` сразу (весь V1 surface: pricing/trial/keys CRUD/renew/upgrade/traffic/devices/subscription-links), даже если Phase 2 использует только read+trial — **Reversibility:** costly — ретрофитить клиент в вызывающие места позже больнее, чем определить единый контракт сейчас
- **D-18:** Retry — `p-retry`: повтор на 429 с уважением `Retry-After`, и на 502/503 с backoff; `Idempotency-Key` (UUID) на каждый POST/DELETE — **Reversibility:** costly — смена retry/idempotency-политики затрагивает все write-вызовы (trial/renew/upgrade/create)
- **D-19:** Ошибки — типизированный `ArtemidaError` с полем `code` и HTTP-статусом, маппинг 401/402/409/429/502/503; вызывающий код ветвится по `code`, не парсит текст — **Reversibility:** costly — смена типа ошибки затрагивает все catch-сайты и UI-сообщения
- **D-20:** `ARTEMIDA_API_KEY` + `ARTEMIDA_BASE_URL` (default `https://artemida.cc/v1`) добавляются в `lib/env.ts` и валидируются fail-fast как остальные секреты

### Trial anti-abuse

- **D-21:** Факт trial хранится на `users`: `trialUsed: Boolean` + `trialKeyId: String?` — одна запись на telegram-id, отдельная таблица не нужна — **Reversibility:** costly — переезд на отдельную trials-таблицу потребует миграции и перепривязки
- **D-22:** Атомарная защита от гонки: `UPDATE users SET trial_used=true WHERE telegram_id=? AND trial_used=false` до `POST /trial`; строка не изменена → trial уже использован, отдаём чистый ответ (не проксируем ошибку ARTEMIDA)
- **D-23:** Если `POST /trial` упал (502/429), флаг откатывается в `false` (rollback), чтобы пользователь мог повторить; `Idempotency-Key` защищает от дубля на стороне ARTEMIDA
- **D-24:** Повторный trial — чистый RU-ответ с CTA «купить подписку» (через i18n-ключ), без raw-ошибок API

### Tariff UX

- **D-25:** Выбор тарифа есть и в боте (inline keyboard), и в PWA
- **D-26:** PWA получает цену через серверный BFF `GET /api/pricing` (проксирует ARTEMIDA) — клиент никогда не носит API-ключ
- **D-27:** Цена обновляется живьём при смене числа устройств (1–10), без submit
- **D-28:** Цены показываем ровно как считает ARTEMIDA `GET /pricing` (без своей витрины/наценки)

### Keys freshness & display

- **D-29:** Cache-first: `keys_cache` рендерится мгновенно, фоновое обновление из ARTEMIDA `GET /keys` при открытии — **Reversibility:** costly — смена модели чтения затрагивает cabinet + bot read path
- **D-30:** Конфиги подключения — sub-ссылка + QR-код (отдельный экран в PWA / сообщение в боте)
- **D-31:** Расход трафика показываем (display-only, продажа лимитов — вне scope v1)
- **D-32:** Необратимые действия устройств (удаление одного, сброс всех) требуют подтверждения

### the agent's Discretion

None — все развилки закрыты явным выбором пользователя.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRIAL-01 | Пользователь может получить trial-ключ в один тап (1 день / 2 устройства) из бота и из кабинета, повторный trial заблокирован сервером | `users.trialUsed` + atomic `updateMany` claim (D-21/D-22), shared `lib/keys-service.ts` for bot+PWA; live probe confirmed the public offer is 1 день · 2 устройства · 2 ₽ |
| TRIAL-02 | Пользователь может выбрать тариф 7/30/90 дней и число устройств 1–10 с живой ценой через `GET /pricing` | BFF `GET /api/pricing?days=&devices=` (D-26), `lib/artemida.ts getPricing`, exact-price display (D-28); provider cabinet confirms per-device pricing matrix shape |
| TRIAL-03 | Пользователь видит инструкции по подключению (v2rayNG / Streisand / Hiddify) в боте и кабинете | Already satisfied by `app/guides/page.tsx` (Phase 1) — only the deep-link from key detail remains |
| CAB-01 | Пользователь видит список «Мои подписки» со статусом, сроком, лимитами в боте и в PWA | `keys_cache` expansion + cache-first read (D-29) + shared read service; ordering active→expiring→expired→pending per UI-SPEC |
| CAB-03 | Пользователь управляет устройствами ключа (список, удаление одного, сброс всех) | BFF device routes proxying `GET /keys/{id}/devices`, `DELETE .../devices/{token}`, `POST .../devices/clear`; inline destructive confirm panel (D-32/UI-SPEC) |
| CAB-04 | Пользователь получает актуальные конфиги VLESS/Trojan + `subscriptionUrl` (`GET /keys/{id}/subscription-links`), видит расход трафика | `lib/artemida.ts getSubscriptionLinks`, server-rendered SVG QR (`qrcode.toString`), traffic fields in `keys_cache` (D-30/D-31) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ARTEMIDA HTTP calls (pricing/trial/keys/devices) | API / Backend (`lib/artemida.ts`, server-only) | — | `ARTEMIDA_API_KEY` is a secret; provider CSP is `connect-src 'self'`, so the browser cannot call it at all (verified live) |
| Trial anti-abuse (one per telegram-id) | Database / Storage (atomic `UPDATE ... WHERE trial_used=false`) | API / Backend (orchestration) | Only an atomic DB claim is race-safe (D-22); client-side flags are bypassable |
| Pricing quote (live price) | API / Backend (BFF `GET /api/pricing`) | Browser (renders returned number) | D-26; exact ARTEMIDA value must not be recomputed client-side (D-28) |
| Keys list / detail read | Database / Storage (`keys_cache` first paint) | API / Backend (background revalidate via `after()`) | D-29 cache-first; instant render + fresh data without blocking |
| Subscription-link + QR | API / Backend (fetch links; render SVG server-side) | Browser (displays inert SVG) | QR must encode only `subscriptionUrl` and be produced locally (UI-SPEC contract); no third-party image URL |
| Device management | API / Backend (BFF routes) | Browser / Client (confirmation UI state only) | Mutations are irreversible (D-32); all authority server-side |
| Bot trial/tariff entry | API / Backend (Telegraf handlers → same service) | — | Bot shares the read/write path with the BFF (single source of truth) |

## Standard Stack

### Core (no new core libraries — reuse Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.7 (installed) `[VERIFIED: package.json]` | RSC pages, Route Handlers, `after()` | Phase 1 pin; `after()` stable since v15.1 `[CITED: https://nextjs.org/docs/app/api-reference/functions/after]` |
| zod | 4.6.5 (installed) `[VERIFIED: package.json]` | Validate ARTEMIDA request/response bodies at the boundary | Project pin; every external boundary gets a schema |
| prisma / @prisma/client | 7.10.0 (installed) `[VERIFIED: package.json]` | `keys_cache` expansion + trial flag migration | Pin `^7.10.0`; never v8-RC |
| pino | 10.3.1 (installed) `[VERIFIED: package.json]` | Log request ids, outcomes, retry waits | Project pin |

### Supporting (new this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-retry | `^7.1.1` `[VERIFIED: npm registry]` | Retry ARTEMIDA 429/502/503 with backoff, honoring `Retry-After` | Inside `lib/artemida.ts` only (D-18); ESM-only, `engines node>=20` — fine on Node 24 `[VERIFIED: npm registry]` |
| qrcode | `^1.5.4` `[VERIFIED: npm registry]` | Server-side SVG generation of `subscriptionUrl` | Key-detail screen rendering (D-30); **use `QRCode.toString(text, { type: 'svg' })` — there is no `toSvg()` export** `[VERIFIED: cdn.jsdelivr.net/npm/qrcode@1.5.4/lib/server.js:93]` |
| @types/qrcode | `^1.5.6` (dev) `[VERIFIED: npm registry]` | Types for `toString`/renderers options | With `qrcode` |

### Built-ins (do not install)

| API | Source | Purpose |
|-----|--------|---------|
| `crypto.randomUUID()` | Node 24 `[VERIFIED: node -e]` | `Idempotency-Key` per POST/DELETE (D-18) |
| `after()` | `next/server` since v15.1 `[CITED: nextjs.org/docs/app/api-reference/functions/after]` | Schedule cache revalidation after the response (D-29) |
| `Intl.NumberFormat('ru-RU')` | V8 `[ASSUMED]` | Price formatting `{price} ₽` per UI-SPEC |
| `Intl.PluralRules('ru')` | V8 `[VERIFIED: node -e 2026-10-01]` | RU plural categories `one/few/many/other` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `qrcode` | `qrcode-generator`, `qr-code-styling` | `qrcode` is the de-facto server SVG renderer (30.6M weekly, `soldair/node-qrcode`); alternatives add styling we do not need |
| `p-retry@^7.1.1` | `p-retry@^8.0.1` | v8 exists (published 2026-09-01, `engines node>=22`, flagged `too-new` by the legitimacy seam); STACK pins `^7`, and v7 is the conservative choice — bump later |
| `after()` | A queue/worker | Overkill for v1 (locked in STACK: no BullMQ/Redis); `after()` is the platform-native way to revalidate post-response |

**Installation:**
```bash
npm install qrcode@^1.5.4 p-retry@^7.1.1
npm install -D @types/qrcode@^1.5.6
# Never bare-install prisma — latest tag is 8.0.0-rc.19 (Phase 1 pin stands)
```

**Version verification:** `npm view` run 2026-10-01: `qrcode@1.5.4`, `@types/qrcode@1.5.6`, `p-retry@8.0.1` (latest), `p-retry@7.1.1` (v7 line), `p-retry@7.1.1 engines {node:>=20} type=module`. `qrcode` server exports confirmed at `lib/server.js` (`toString`, `toDataURL`, `toBuffer`, `toFile`, `toFileStream`; **no `toSvg`**).

## Package Legitimacy Audit

Seam check run this session (`query package-legitimacy check --ecosystem npm qrcode @types/qrcode p-retry`).

| Package | Registry | Age/Published | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|---------------|------------------|-------------|---------|-------------|
| qrcode | npm | latest 1.5.4 (2024-08-05) | 30,668,368 | github.com/soldair/node-qrcode | OK | Approved |
| @types/qrcode | npm | 1.5.6 (2025-10-24) | 16,219,345 | DefinitelyTyped | OK | Approved (dev) |
| p-retry | npm | 8.0.1 (2026-09-01) | 64,073,568 | github.com/sindresorhus/p-retry | SUS (`too-new` only) | **Approved pinned `^7.1.1`** — SUS is patch-recency noise (Phase 1 precedent: official repo + 64M/wk, `postinstall: null`); pin v7 per STACK |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `p-retry` — sole reason `too-new`; official repo + mass downloads + no `postinstall`. No `checkpoint:human-verify` needed for install, but the version is pinned to `^7.1.1` (not the flagged 8.0.1).

## ARTEMIDA Paid API V1 — Observed Contract

> **Confidence split.** Everything under "Verified by live probe" was observed this session against the real host without a key. Everything under "Request/response shapes" is `[ASSUMED]`/`[CITED: project]` and MUST be confirmed by the live-probe checkpoint before dependent UI is wired.

### Verified by live probe (2026-10-01, unauthenticated)

- **Base URL:** `https://artemida.cc/v1` — no trailing slash returns `301 Moved Permanently`; `https://artemida.cc/v1/` (and all `/v1/*` paths) return `401` with the missing-key envelope. `[VERIFIED: live probe]`
- **Auth:** `Authorization: Bearer <key>`. Missing key body:
  ```json
  {"ok":false,"error":{"code":"missing_api_key","message":"Передайте API-ключ в Authorization: Bearer <key>."},"meta":{"requestId":"req_b311d7c76eeca680"}}
  ```
  Invalid key body (code changes, envelope identical):
  ```json
  {"ok":false,"error":{"code":"invalid_api_key","message":"API-ключ недействителен."},"meta":{"requestId":"req_87a748d16d0c34b1"}}
  ```
  `[VERIFIED: live probe GET /v1/pricing?devices=2&days=30 with bogus Bearer]`
- **Unknown route envelope is a DIFFERENT shape** — `error` is a plain string, not an object: `{"ok":false,"error":"Маршрут не найден"}` (observed on cabinet 404s). The client parser must accept both `error: {code,message}` and `error: string`. `[VERIFIED: live probe https://artemida.cc/api/quote]`
- **Response headers on API responses:** `X-Request-Id: req_…`, `X-RateLimit-Policy: adaptive-account-and-ip`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, and a CSP whose `connect-src 'self'` means no browser may call the API. `[VERIFIED: live probe response headers]`
- **`OPTIONS` is unsupported:** `501 Unsupported method ('OPTIONS')` on `/v1/pricing` — no CORS preflight; server-to-server only. `[VERIFIED: live probe]`
- **Rate limiting is adaptive account+IP** (`X-RateLimit-Policy: adaptive-account-and-ip`); the project constraint says honor `Retry-After` on 429. `[VERIFIED: header]` + `[CITED: .planning/PROJECT.md:14, :51]`

### Provider public offer (corroborating — consumer cabinet, NOT the Paid V1 contract)

- `/own-vpn` shows: trial `2 ₽ · 1 день · 2 устройства`; paid `7 дней 49 ₽`, `30 дней 120 ₽`, `60 дней 220 ₽`, `90 дней 300 ₽`, all `2 устройства`. `[CITED: https://artemida.cc/own-vpn]`
- Cabinet `GET /api/bootstrap` returns `pricing.segment {currency:"RUB", base_devices:2, prices_by_days:{7:49,30:120,60:220,90:300}}`, `periods:[7,30,60,90]`, `discountTiers:[{minDevices:10,percent:2},{minDevices:20,percent:3},{minDevices:30,percent:4},{minDevices:50,percent:5}]`, and a `matrix` keyed by device count. `[VERIFIED: live probe https://artemida.cc/api/bootstrap]`
- Cabinet frontend (`app.js`) renders key objects with fields `id, name, devices, expireAt, customerRef, shortUuid, createdAt, isTrial, deviceLimit`. This is the **cabinet's session API**, not the Bearer API, but the field vocabulary is strong evidence for the Paid API key shape. `[VERIFIED: https://artemida.cc/static/app.js?v=155]`

### Request/response shapes for the Paid V1 endpoints (`[ASSUMED]` — confirm via checkpoint)

| Method | Path | Request | Response (assumed) | Used by |
|--------|------|---------|--------------------|---------|
| GET | `/pricing?devices=&days=` | query `devices` int, `days` int | `{ok:true, data:{price|amount, currency, devices, days, …}}` | TRIAL-02 / D-26 |
| POST | `/trial` | body `{customerRef}` (maybe empty) | `{ok:true, data:{key:{id, …}, subscriptionUrl?}}` | TRIAL-01 |
| GET | `/keys?limit=&offset=&includeRevoked=&q=` | query | `{ok:true, data:{items:[key…], total}}` | CAB-01 / D-29 |
| GET | `/keys/{id}` | — | `{ok:true, data:key}` | CAB-01 |
| GET | `/keys/{id}/subscription-links` | — | `{ok:true, data:{subscriptionUrl, vless:[], links:[]}}` | CAB-04 / D-30 |
| GET | `/keys/{id}/devices` | — | `{ok:true, data:{items:[{token|id, name, …}]}}` | CAB-03 |
| DELETE | `/keys/{id}/devices/{token}` | — | `{ok:true}` | CAB-03 |
| POST | `/keys/{id}/devices/clear` | — | `{ok:true}` | CAB-03 |
| POST | `/keys/{id}/traffic`, `POST /keys/{id}/traffic/reset` | body | — | future |
| POST | `/keys/{id}/disable` \| `/enable` | — | — | future |
| POST | `/keys/{id}/renew`, `/upgrade` | body `{days, devices}` | — | Phase 3 |
| DELETE | `/keys/{id}`, `/keys/{id}/permanent` | — | — | Phase 5 (admin) |

**`customerRef` mapping:** no verified mapping exists. Recommendation: set `customerRef = String(telegramId)` and also persist it; because the API exposes `q` search and the cabinet renders `customerRef`, this gives the admin phase (ADM-02, "поиск по `customerRef`") a stable join without trusting provider behavior. Treat any provider-side uniqueness/format rule as `[ASSUMED]` until probed. `[ASSUMED]`

**Trial duration:** PROJECT.md locks "trial 1 день через `POST /trial`"; `/own-vpn` corroborates `1 день · 2 устройства`; the cabinet `/api/bootstrap` reports `trialDays: 2` but that is the cabinet product. Do not send a duration to `/trial` (fixed server-side) without probe confirmation. `[CITED: .planning/PROJECT.md:20,61]` + `[VERIFIED: /own-vpn]` + `[ASSUMED: endpoint takes no duration]`

## Architecture Patterns

### System Architecture Diagram

```
 Browser (PWA)                 Next.js server (one process)                 External
 ─────────────                 ────────────────────────────                 ────────
      │  GET /api/pricing ───────▶ requireSession (lib/auth session)          ARTEMIDA V1
      │                           └▶ lib/artemida.getPricing ────────────────▶ GET /pricing
      │◀── {price} (exact) ──────┘   p-retry: 429 Retry-After / 502,503        (Bearer)
      │                                                                        ▲
      │  GET /api/keys ──────────▶ lib/keys-service.listKeys(user)             │
      │                           ├▶ read keys_cache (instant)                 │
      │                           └▶ after( revalidateFromArtemida ) ──────────┘ GET /keys
      │◀── cached rows ──────────┘
      │
      │  POST /api/trial ────────▶ atomic claim (UPDATE … WHERE trial_used=false)
      │                           ├─ claimed? ─▶ artemida.createTrial ─────────▶ POST /trial
      │                           │                 │ fail → rollback trial_used=false
      │                           │                 └ success → set trialKeyId
      │◀── key | clean "already" ─┘
      │
      │  Page /keys/[id] (RSC) ──▶ service.getSubscription ───────────────────▶ GET /keys/{id}/subscription-links
      │                           └▶ QRCode.toString(url,{type:'svg'}) → <svg>
      │◀── SVG + sub-link ───────┘
      │
 Telegram bot ──(same process)──▶ lib/keys-service / lib/artemida  (identical read/write path)
```

### Recommended Project Structure (additions only)

```
lib/
├── artemida.ts          # D-17: full V1 client — transport, retry, idempotency, error map
├── keys-service.ts      # shared read/write path for bot + BFF (trial, list, detail, devices)
├── qr.ts                # server-only SVG QR renderer (qrcode.toString wrapper)
└── i18n/index.ts        # t(key, params?) + tp(base, n) — extended this phase
app/
├── page.tsx             # «Мои подписки» (cache-first RSC) or login
├── keys/[id]/page.tsx   # key detail: sub-link + QR + traffic + devices
└── api/
    ├── pricing/route.ts            # GET (D-26)
    ├── trial/route.ts              # POST (D-21..D-24)
    └── keys/
        ├── route.ts                # GET list
        └── [id]/
            ├── route.ts            # GET detail
            ├── subscription/route.ts       # GET sub-links JSON
            └── devices/
                ├── route.ts                 # GET devices
                ├── [token]/route.ts         # DELETE one
                └── clear/route.ts           # POST clear
prisma/schema.prisma     # User.trialUsed/trialKeyId + KeyCache expansion
components/
├── SubscriptionCard.tsx
├── TariffPicker.tsx     # client; live price via /api/pricing (D-27)
├── TrialButton.tsx      # client; in-flight lock
├── QrSvg.tsx            # renders server-produced SVG string
└── ConfirmPanel.tsx     # D-32 inline destructive confirm
```

### Pattern 1: Typed transport with envelope-aware errors (D-18/D-19)

**What:** one `request()` core builds the URL/headers, attaches a fresh `Idempotency-Key` on POST/DELETE, wraps the call in `p-retry`, and parses both success and error envelopes.
**When to use:** every ARTEMIDA call.

```typescript
// lib/artemida.ts (skeleton; response zod schemas are ASSUMED until probe)
import { randomUUID } from "node:crypto";
import pRetry, { AbortError } from "p-retry";
import { z } from "zod";

export type ArtemidaCode =
  | "unauthorized" | "payment_required" | "conflict"
  | "rate_limited" | "bad_gateway" | "unavailable" | "unknown";

export class ArtemidaError extends Error {
  constructor(
    readonly code: ArtemidaCode,
    readonly status: number,
    readonly retryAfterSec?: number,
    readonly requestId?: string,
  ) { super(`artemida:${code}`); }
}

const errorEnvelope = z.object({
  ok: z.literal(false),
  error: z.union([
    z.object({ code: z.string(), message: z.string().optional() }),
    z.string(), // 404 route shape: {"ok":false,"error":"Маршрут не найден"}
  ]),
  meta: z.object({ requestId: z.string().optional() }).optional(),
});

function mapStatus(status: number, code?: string): ArtemidaCode {
  switch (status) {
    case 401: return "unauthorized";
    case 402: return "payment_required";
    case 409: return "conflict";
    case 429: return "rate_limited";
    case 502: return "bad_gateway";
    case 503: return "unavailable";
    default: return code === "invalid_api_key" || code === "missing_api_key"
      ? "unauthorized" : "unknown";
  }
}
```

`p-retry` decision: retry only `429`/`502`/`503` (5xx), abort on every other status; on `429` read `Retry-After` and throw to let `p-retry` delay the next attempt (or pass a delay via a custom `shouldRetry`). `[CITED: .planning/PROJECT.md:51]`

### Pattern 2: Atomic trial claim + compensating rollback (D-21..D-23)

**What:** claim before the network call so two concurrent requests cannot both win; roll the flag back only if the provider call fails and no key was recorded.

```typescript
// lib/keys-service.ts
export async function claimTrial(telegramId: bigint): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { telegramId, trialUsed: false },
    data: { trialUsed: true },          // D-22 atomic guard
  });
  return count === 1;                    // false → already used
}

export async function releaseTrialOnFailure(telegramId: bigint): Promise<void> {
  await prisma.user.updateMany({
    where: { telegramId, trialUsed: true, trialKeyId: null }, // never clobber a success
    data: { trialUsed: false },         // D-23 rollback
  });
}

export async function startTrial(telegramId: bigint) {
  if (!(await claimTrial(telegramId))) return { kind: "already_used" as const };
  try {
    const key = await artemida.createTrial({ customerRef: String(telegramId) });
    await prisma.user.update({
      where: { telegramId },
      data: { trialKeyId: key.id },
    });
    return { kind: "created" as const, key };
  } catch (err) {
    await releaseTrialOnFailure(telegramId);
    throw err;
  }
}
```

`trialKeyId: null` as the in-flight sentinel is what makes the rollback safe against a concurrent success. `[VERIFIED: prisma schema User shape from lib/prisma + schema.prisma:19-30]`

### Pattern 3: Cache-first read with `after()` revalidation (D-29)

**What:** render `keys_cache` immediately; schedule a background refresh that never blocks the response.

```typescript
// app/api/keys/route.ts
import { after } from "next/server";          // stable since 15.1
import { requireSession } from "@/lib/auth";
import { listKeys, revalidateKeys } from "@/lib/keys-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const telegramId = await requireSession();
  const cached = await listKeys(telegramId);  // instant from keys_cache
  after(async () => { await revalidateKeys(telegramId); }); // GET /keys → upsert
  return Response.json({ keys: cached });
}
```

`after()` works in Route Handlers on the Node self-host runtime and runs even if the response failed; it does not make a route dynamic by itself. `[CITED: https://nextjs.org/docs/app/api-reference/functions/after]`

### Pattern 4: Server-rendered QR (D-30 / UI-SPEC)

**What:** the subscription URL never leaves the server as an image request; render the SVG inline.

```typescript
// lib/qr.ts
import QRCode from "qrcode";

export async function renderSubscriptionQr(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",   // UI-SPEC
    margin: 4,                   // quiet zone
    width: 256,                  // viewBox 0 0 256 256
  });
}
```

`QRCodeRenderersOptions` exposes `margin?`, `width?`, `errorCorrectionLevel` (via `QRCodeOptions`), `color?`. `[VERIFIED: @types/qrcode@1.5.6 index.d.ts:155-172, :431-438]` **Correction to UI-SPEC:** there is no `toSvg()`; use `toString(..., { type: "svg" })`. `[VERIFIED: qrcode@1.5.4/lib/server.js:93]`

### Anti-Patterns to Avoid

- **Calling ARTEMIDA from the browser:** impossible via CSP `connect-src 'self'` and would leak `ARTEMIDA_API_KEY`. Everything goes through the BFF (D-26). `[VERIFIED: live probe CSP]`
- **Proxying raw API error text to users:** D-19/D-24 — map `code` to RU i18n keys, never render the provider message.
- **Client-side trial gating only:** bypassable; the atomic DB claim is the gate (PITFALLS §5).
- **Recomputing prices client-side:** D-28 forbids it; display the number ARTEMIDA returned verbatim.
- **Rendering the QR client-side / via a third-party image URL:** UI-SPEC contract requires a locally-rendered server SVG.
- **Bare `npm install prisma`:** resolves to v8-RC; pin `^7.10.0`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR SVG encoding | A custom QR matrix renderer | `qrcode` `toString({type:'svg'})` | QR error-correction/masking/quiet-zone edge cases are the classic bug source; 30M/wk battle-tested |
| Retry/backoff | A `setTimeout` loop | `p-retry` with `Retry-After` parsing | Off-by-one attempts, lost abort semantics, unhandled rejections |
| RU pluralization | A `n % 10` switch | `Intl.PluralRules('ru')` categories | RU's 11/21 edge cases are easy to get wrong; verified `one/few/many/other` |
| JWT/session | (already owned) custom crypto | `jose` (Phase 1) | Reuse `verifySession` — do not add a second session mechanism |
| Background revalidation | `setTimeout` inside a request | `after()` from `next/server` | Runs post-response, survives response failure, platform-supported |
| Provider SDK | A generated client with guessed shapes | Hand-rolled thin `fetch` + tolerant zod | No official SDK exists; guessed generated types would fail at runtime |

## Common Pitfalls

### Pitfall 1: Building the whole UI against unverified ARTEMIDA response shapes
**What goes wrong:** field names guessed (`data.price` vs `data.amount`, `deviceLimit` vs `devices`) fail at the executor's `parse()` and look like a provider outage.
**Why it happens:** the developer docs are auth-gated and `ARTEMIDA_API_KEY` is absent.
**How to avoid:** a single tolerant schema per endpoint (`.passthrough()`), a normalized internal model, and a `checkpoint:human-verify` live-probe task as the first executable step before UI wiring; keep every shape change local to `lib/artemida.ts`.
**Warning signs:** `ZodError` on a real 200 response; multiple places adjusting field names.

### Pitfall 2: The i18n completeness test breaks when `t()` gains params
**What goes wrong:** the existing test scans source with `/\bt\(\s*['"]([A-Za-z0-9_.]+)['"]\s*\)/g` `[VERIFIED: tests/unit/i18n.test.ts:35]` — it only matches `t('key')`. Any `t('key', { n })` call stops matching, so those keys are reported **unused** and the suite goes red.
**Why it happens:** the regex requires the closing `)` immediately after the key string.
**How to avoid:** widen the regex to allow an optional params argument (`t\(\s*['"]([A-Za-z0-9_.]+)['"][^)]*\)`) as part of the i18n task, and add tests for interpolation + plural categories.
**Warning signs:** `i18n.test.ts` "dictionary has no unused keys" failing after adding interpolated strings.

### Pitfall 3: `qrcode` import shape / missing `toSvg`
**What goes wrong:** calling `QRCode.toSvg(...)` throws `undefined is not a function`; the UI-SPEC names that method.
**Why it happens:** the package exports `toString` with `{ type: 'svg' }`, not `toSvg`.
**How to avoid:** use `toString(..., { type: 'svg' })` and note that `qrcode`'s main entry is CommonJS (`main: ./lib/index.js`), so import it as a default/named interop under `moduleResolution: bundler` `[VERIFIED: tsconfig.json moduleResolution]`.
**Warning signs:** type error "Property 'toSvg' does not exist".

### Pitfall 4: Non-atomic trial suppression
**What goes wrong:** check-then-set (`findUnique` then `update`) lets two concurrent taps both pass the check → two trial keys, ARTEMIDA balance consumed twice.
**Why it happens:** the check and set are separate statements.
**How to avoid:** `updateMany({ where:{ trialUsed:false }, data:{ trialUsed:true } })` and branch on `count` (D-22) — one statement, atomic. `[VERIFIED: Prisma `updateMany` returns `{count}` — standard Prisma 7 API, `[ASSUMED]` on exact return until migration runs]`
**Warning signs:** a "two simultaneous /trial calls yield two keys" test passes when it must fail.

### Pitfall 5: Rollback clobbers a successful trial
**What goes wrong:** a retry fails and `trialUsed` is reset to `false` even though a key was already issued.
**Why it happens:** rollback written as an unconditional `trialUsed=false`.
**How to avoid:** guard the rollback with `trialKeyId: null` (Pattern 2) so a recorded success can never be reopened.
**Warning signs:** user can obtain a second trial after a successful one.

### Pitfall 6: Cache-first shows stale rows with no freshness signal
**What goes wrong:** an expired key keeps rendering "Активен" until the background refresh lands.
**Why it happens:** D-29 renders cache before revalidation by design.
**How to avoid:** display `updatedAt`-derived status conservatively (compute expiring/expired from `expiresAt` against `now`, not from a stale `status` string), and upsert the background result; UI-SPEC's `status.unknown` covers missing status.
**Warning signs:** status badge disagrees with the expiry date on the card.

### Pitfall 7: 429 retry storms against an adaptive limiter
**What goes wrong:** parallel price fetches (device changes) each spawn retries and trip the adaptive account+IP limiter harder.
**Why it happens:** live price updates on every device tap (D-27) without debounce/cancellation.
**How to avoid:** debounce the device control, cancel in-flight requests on a new selection, and cap `p-retry` attempts; surface `common.errorRateLimit` with `{seconds}` from `Retry-After` (UI-SPEC).
**Warning signs:** `429` bursts in logs while a user scrubs the device stepper.

### Pitfall 8: Secret leakage into logs or client
**What goes wrong:** logging the `Authorization` header or a full provider body, or shipping the key via a `NEXT_PUBLIC_*` var.
**Why it happens:** convenience logging / copy-paste.
**How to avoid:** log `requestId`, outcome, and status only (V7 discipline already established in `lib/logger.ts`); `ARTEMIDA_API_KEY` is server-only, never `NEXT_PUBLIC_`.
**Warning signs:** `git grep ARTEMIDA_API_KEY` hits outside `lib/env.ts`/`.env.example`.

## Code Examples

### Prisma schema additions (D-21 + D-29/keys_cache expansion)

```prisma
model User {
  id         Int      @id @default(autoincrement())
  telegramId BigInt   @unique @map("telegram_id")
  chatId     BigInt?  @map("chat_id")
  firstName  String?  @map("first_name")
  lastName   String?  @map("last_name")
  username   String?
  createdAt  DateTime @default(now()) @map("created_at")
  keys       KeyCache[]
  // Phase 2 — trial anti-abuse (D-21)
  trialUsed  Boolean  @default(false) @map("trial_used")
  trialKeyId String?  @map("trial_key_id")
  @@map("users")
}

// ARTEMIDA mirror only — ARTEMIDA owns the truth (D-07/D-29).
model KeyCache {
  id              Int       @id @default(autoincrement())
  userId          Int       @map("user_id")
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  keyId           String    @map("key_id")
  name            String?
  status          String
  isTrial         Boolean   @default(false) @map("is_trial")
  expiresAt       DateTime? @map("expires_at")
  deviceLimit     Int?      @map("device_limit")
  devices         Int?      // count observed at last sync
  trafficUsedBytes  BigInt? @map("traffic_used_bytes")
  trafficLimitBytes BigInt? @map("traffic_limit_bytes") // 0/null = unlimited
  subscriptionUrl String?   @map("subscription_url")
  customerRef     String?   @map("customer_ref")
  lastSyncedAt    DateTime? @map("last_synced_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  @@unique([userId, keyId])
  @@map("keys_cache")
}
```

Current verified baseline being extended: `User(telegramId BigInt @unique, chatId BigInt?, firstName, lastName, username, createdAt)` and `KeyCache(userId, keyId, status, expiresAt, updatedAt, @@unique([userId,keyId]))` `[VERIFIED: prisma/schema.prisma:19-44]`.

### i18n interpolation + RU pluralization

```typescript
// lib/i18n/index.ts (extend existing t(key: I18nKey): string)
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const raw = lookup(key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`);
}

/** RU plural helper: pick <base>One / <base>Few / <base>Many via Intl. */
export function tp(base: string, n: number): string {
  const cat = new Intl.PluralRules("ru").select(n); // one|few|many|other
  const suffix = cat === "one" ? "One" : cat === "few" ? "Few" : "Many";
  return t(`${base}${suffix}` as I18nKey, { n });
}
```

Current verified `t` takes no params: `export function t(key: I18nKey): string { return lookup(key) ?? key; }` `[VERIFIED: lib/i18n/index.ts:20-22]`. RU categories verified: `1→one, 2→few, 5→many, 11→many, 21→one, 22→few, 25→many` `[VERIFIED: node Intl.PluralRules('ru') 2026-10-01]`.

### BFF route shape (mirrors the Phase 1 auth route discipline)

```typescript
// app/api/pricing/route.ts (D-26)
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { artemida, ArtemidaError } from "@/lib/artemida";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const query = z.object({
  days: z.coerce.number().int().refine((v) => [7, 30, 90].includes(v)),
  devices: z.coerce.number().int().min(1).max(10),
});

export async function GET(req: Request) {
  const telegramId = await requireSession();       // throws → 401
  const url = new URL(req.url);
  const parsed = query.safeParse({
    days: url.searchParams.get("days"),
    devices: url.searchParams.get("devices"),
  });
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  try {
    const price = await artemida.getPricing(parsed.data); // exact value (D-28)
    return Response.json({ price });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "pricing", code: err.code, requestId: err.requestId });
      const status = err.code === "rate_limited" ? 429 : err.code === "payment_required" ? 402 : 502;
      return Response.json({ error: err.code, retryAfter: err.retryAfterSec }, { status });
    }
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
```

Note: `requireSession` in `lib/auth.ts` is currently a `verifySession(token, secret)` pure function plus cookie plumbing; Phase 1 exposed `verifySession`/`SESSION_COOKIE`, not a `requireSession()` helper. `[VERIFIED: lib/auth.ts:128-139, :14]` The planner should add a thin `requireSession()` wrapper in a route-side helper (read `cookies()`, call `verifySession` with `env.SESSION_SECRET`, throw a typed 401) rather than changing the pure module.

### Trial route — clean RU response on repeat (D-24)

```typescript
// app/api/trial/route.ts
export async function POST() {
  const telegramId = await requireSession();
  const result = await startTrial(BigInt(telegramId));
  if (result.kind === "already_used")
    return Response.json({ ok: false, reason: "trial_used" }, { status: 409 });
  if (result.kind === "created")
    return Response.json({ ok: true, key: result.key });
}
```

The React layer maps `reason: "trial_used"` to `t('trial.usedHeading')`/`t('trial.usedBody')`, never to a provider message (D-24/UI-SPEC).

### Bot + PWA shared path

`lib/bot.ts` already owns the Telegraf singleton and `/start` `[VERIFIED: lib/bot.ts:23-58]`. Phase 2 adds inline-keyboard handlers that call the **same** `lib/keys-service.ts` functions the BFF routes call — no duplicate Prisma or `fetch` logic in the bot. The bot's "Попробовать" handler calls `startTrial(from.id)` and replies with `t('trial.*')`; "Мои ключи" calls `listKeys` + `revalidateKeys`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `unstable_after` | `after` from `next/server` | v15.1 stable `[CITED: nextjs.org/.../after]` | Safe foundation for D-29 background revalidation |
| Route Handler `GET` cached statically | Default dynamic | v15.0.0-RC `[CITED: nextjs.org/.../route]` | `keys_cache` reads are live by default; `force-dynamic` is explicit and consistent with Phase 1 |
| `?` `params` | `params` is a `Promise` (await it) | v15.0.0-RC `[CITED: nextjs.org/.../route]` | Already the Phase 1 pattern (`app/api/telegram/webhook/[secret]/route.ts:20`) `[VERIFIED: lib/bot route]` |

**Deprecated/outdated:**
- UI-SPEC's `toSvg()` — no such export; use `QRCode.toString(...,{type:'svg'})`.
- `next-pwa` / `@ducanh2912/next-pwa` — dead (Phase 1 decision stands).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GET /pricing` response field name (e.g. `data.price` vs `data.amount`) | ARTEMIDA shapes | HIGH — pricing UI renders wrong/empty; isolated to one schema by design |
| A2 | `POST /trial` request body + response shape (`{data:{key:{id}}}`) | ARTEMIDA shapes | HIGH — trial key id/`trialKeyId` persistence breaks |
| A3 | `GET /keys` returns `{data:{items:[…]}}` with `id, name, status, expiresAt, isTrial, deviceLimit` | ARTEMIDA shapes | HIGH — cache mapper + card rendering break |
| A4 | `subscription-links` returns `{subscriptionUrl, vless[], links[]}` | ARTEMIDA shapes | MEDIUM — sub-link/QR screen breaks |
| A5 | Devices payload item key is `token` (for `DELETE /devices/{token}`) vs `id` | ARTEMIDA shapes | MEDIUM — device delete/clear path wrong |
| A6 | `customerRef` accepts an arbitrary telegram-id string and is searchable via `q` | ARTEMIDA shapes | MEDIUM — admin search (ADM-02) join degrades |
| A7 | `devices=1` is a valid price input (provider cabinet min is 2) | ARTEMIDA shapes | MEDIUM — 1-device tariff rejected; requires product decision or `/pricing` clamp to min |
| A8 | `/trial` takes no duration (fixed 1 day server-side) | ARTEMIDA shapes | LOW/MEDIUM — if it takes params, we must send them |
| A9 | `p-retry` retries only 429/502/503 and reads `Retry-After` | Retry design | LOW — configurable in one place |
| A10 | `Intl.NumberFormat('ru-RU')` + ` ₽` matches UI-SPEC display | i18n/format | LOW — formatting only |
| A11 | Prisma `updateMany` atomicity semantics as used for the trial claim | Trial design | LOW — standard Prisma behavior; proven by a concurrent-claim test |

**A1–A8 are the live-probe checkpoint payload.** The planner must place the probe as the first executable task and treat its output as the schema source of truth.

## Open Questions

1. **What are the exact Paid V1 success-body shapes?**
   - What we know: transport (auth, envelope, headers) is verified; provider pricing vocabulary/values are observable via the public cabinet.
   - What's unclear: every success field name for pricing/trial/keys/sub-links/devices.
   - Recommendation: `checkpoint:human-verify` live probe with a supplied `ARTEMIDA_API_KEY` before any dependent UI; keep schemas tolerant so a mismatch fails locally in one file.

2. **Does the Paid API accept `devices=1`, and does it allow 7/30/90 only?**
   - What we know: cabinet min is 2 devices, periods `[7,30,60,90]`; requirements lock 1–10 devices and 7/30/90.
   - What's unclear: whether the Paid API mirrors or overrides cabinet constraints.
   - Recommendation: probe `/pricing?devices=1&days=7` and `devices=2&days=30`; if 1 is rejected, return a clamp decision to the owner (requirements vs provider).

3. **Which HTTP status does `/trial` return on a duplicate trial?**
   - What we know: D-24 requires a clean RU response, never a proxy of the provider error.
   - What's unclear: whether the provider enforces its own one-trial rule (409?) or expects us to (we do, via `trialUsed`).
   - Recommendation: the DB claim is authoritative; provider 409/4xx on trial is mapped to `already_used`, not surfaced.

4. **How is the White Label domain reflected in `subscriptionUrl` (OPS-02)?**
   - What we know: PROJECT requires `my.3set.online`; the provider offers White Label config.
   - What's unclear: whether `subscriptionUrl` already returns the configured brand domain or a provider domain.
   - Recommendation: store and display whatever `subscriptionUrl` returns (D-28 spirit); confirm at the Phase 5 staging experiment, not here.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | client, services | ✓ | 24.15.0 | — |
| npm | installs | ✓ | 11.12.1 | — |
| Postgres (local) | migrations, tests | ✓ | running (Phase 1 proof) | — |
| `ARTEMIDA_API_KEY` | live pricing/trial/keys probe and any real call | ✗ | — | All provider calls mocked in tests; one `checkpoint:human-verify` probe when supplied |
| Docker / Compose | `db` service parity | ✗ | — | Local Postgres covers migrate/seed/test (Phase 1 precedent) |
| Internet | npm install | ✓ | registry reachable | — |

**Missing dependencies with no fallback:**
- `ARTEMIDA_API_KEY` — blocks the live probe and all real integration; every dependent acceptance test is either mocked or a recorded manual checklist until the owner supplies it. No secret exists in `.env.local` or the environment. `[VERIFIED: no .env* files besides .env.example]`

**Missing dependencies with fallback:**
- Docker — local Postgres fallback; compose `up` deferred as in Phase 1.

## Validation Architecture

`workflow.nyquist_validation: true` `[VERIFIED: .planning/config.json:24]`. Framework: **vitest 5.0.3**, config `vitest.config.ts` with `include: ['tests/**/*.test.ts']`, `environment: 'node'` `[VERIFIED: vitest.config.ts:4-7]`. Existing suites: `tests/unit/{auth-widget,auth-initdata,session,i18n}.test.ts`, `tests/integration/auth-flow.test.ts`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.3 `[VERIFIED: package.json]` |
| Config file | `vitest.config.ts` (include `tests/**`) |
| Quick run command | `npx vitest run tests/unit` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRIAL-01 | Duplicate trial blocked; concurrent claims yield one key | unit/integration | `npx vitest run tests/unit/trial-claim.test.ts` | ❌ Wave 0 |
| TRIAL-01 | Trial failure rolls back `trialUsed` (retryable) | unit | `npx vitest run tests/unit/trial-rollback.test.ts` | ❌ Wave 0 |
| TRIAL-02 | `/api/pricing` validates `days`/`devices` and returns exact provider price | unit | `npx vitest run tests/unit/pricing-route.test.ts` | ❌ Wave 0 |
| TRIAL-03 | Guides deep-link exists | unit | covered by i18n/nav | ✅ (`app/guides/page.tsx`) |
| CAB-01 | Cache-first list read + background revalidate scheduling | unit/integration | `npx vitest run tests/unit/keys-service.test.ts` | ❌ Wave 0 |
| CAB-03 | Device delete/clear routes require session + confirmation contract | unit | `npx vitest run tests/unit/devices-route.test.ts` | ❌ Wave 0 |
| CAB-04 | QR rendered server-side from `subscriptionUrl`; no `toSvg` | unit | `npx vitest run tests/unit/qr.test.ts` | ❌ Wave 0 |
| all | `ArtemidaError` mapping 401/402/409/429/502/503 + `Retry-After` | unit | `npx vitest run tests/unit/artemida-client.test.ts` | ❌ Wave 0 |
| all | i18n interpolation + RU plural categories; completeness test widened | unit | `npx vitest run tests/unit/i18n.test.ts` (extend) | ✅ extend |
| live | Real pricing/trial/keys against ARTEMIDA | manual (checkpoint) | checklist; blocked on `ARTEMIDA_API_KEY` | manual-only |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit`
- **Per wave merge:** `npx vitest run` (+ `npx tsc --noEmit`)
- **Phase gate:** full suite green + manual live-probe checklist before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/artemida-client.test.ts` — envelope parsing (object **and** string `error`), status→code mapping, no-retry on 4xx, retry on 429/502/503, `Retry-After` extraction (inject a fake `fetch`).
- [ ] `tests/unit/trial-claim.test.ts` — concurrent `claimTrial` yields one winner; rollback guarded by `trialKeyId: null`.
- [ ] `tests/unit/pricing-route.test.ts` — query validation (1–10 devices, 7/30/90) + 401 without session.
- [ ] `tests/unit/keys-service.test.ts` — cache→render mapping, status derived from `expiresAt`, trial badge flag.
- [ ] `tests/unit/qr.test.ts` — `renderSubscriptionQr` returns `<svg` and encodes the URL; asserts `toSvg` is **not** called.
- [ ] `tests/unit/devices-route.test.ts` — session required, token path param validated.
- [ ] Extend `tests/unit/i18n.test.ts` regex for `t(key, params)` and add plural-category assertions.
- [ ] Fixture helper for a fake `fetch` returning the verified envelopes (no network).

## Security Domain

`security_enforcement: true`, ASVS Level 1 `[VERIFIED: .planning/config.json:47-49]`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Phase 1 session (`verifySession` + `SESSION_COOKIE`) gates every BFF route `[VERIFIED: lib/auth.ts:14,128-139]` |
| V3 Session Management | yes | httpOnly `3set_session` cookie (Phase 1, unchanged) |
| V4 Access Control | yes | Every keys/trial/device route resolves `telegramId` from the session; queries scoped by `userId` — never trust a client-supplied id |
| V5 Input Validation | yes | zod on request query/body **and** on every ARTEMIDA response (`lib/artemida.ts`) |
| V6 Cryptography | yes | No hand-rolled crypto; `crypto.randomUUID()` for idempotency, `jose` for sessions — never custom |
| V7 Errors/Logging | yes | Map provider `code` to RU i18n keys; log `requestId`/outcome only; never log `ARTEMIDA_API_KEY`, `Authorization`, or full provider bodies |
| V14 Configuration | yes | `ARTEMIDA_API_KEY`/`ARTEMIDA_BASE_URL` only in `lib/env.ts` (fail-fast), server-only, never `NEXT_PUBLIC_*`; `.env.example` placeholders only |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key theft / client-side exposure | Info disclosure | Server-only client; CSP `connect-src 'self'` (verified); no `NEXT_PUBLIC_ARTEMIDA_*` |
| Trial farming via concurrent requests | Elevation/abuse | Atomic `updateMany` claim, one per `telegramId` (D-22); concurrent-claim test |
| Cross-user key access (IDOR on `/keys/{id}`) | Tampering/Info disclosure | Scope every detail/device query by `telegramId`→`userId`; never fetch by key id without an ownership join |
| Idempotency-key reuse across operations | Tampering | Fresh `randomUUID()` per POST/DELETE (D-18); never derive from user input |
| Raw provider error leached to UI / logs | Info disclosure | `ArtemidaError.code` → i18n; provider `message` never rendered or logged at info |
| 429/5xx retry amplification | DoS | Cap attempts, honor `Retry-After`, debounce client price calls |
| Destructive device actions without confirmation | Repudiation | D-32 inline confirm panel; no request until the second tap |

## Sources

### Primary (HIGH confidence — observed/verified this session)
- Live probe `https://artemida.cc/v1/pricing` (+ `/v1/keys`, `/v1/trial`, `/v1/balance`, bogus Bearer) — 401 bodies with `missing_api_key`/`invalid_api_key`, `{ok,error,meta}` envelope, `X-Request-Id`, `X-RateLimit-Policy`, CSP `connect-src 'self'`, `OPTIONS → 501`
- Live probe `https://artemida.cc/api/bootstrap` — provider pricing model (`prices_by_days`, `base_devices`, `discountTiers`, `matrix`)
- `https://artemida.cc/static/app.js?v=155` — provider key field vocabulary (`customerRef`, `isTrial`, `deviceLimit`, `expireAt`, `shortUuid`)
- `https://artemida.cc/own-vpn` — trial `1 день · 2 устройства · 2 ₽`; paid 49/120/220/300 ₽
- npm registry via `npm view` (2026-10-01): `qrcode@1.5.4`, `@types/qrcode@1.5.6`, `p-retry@8.0.1`/`7.1.1`
- `cdn.jsdelivr.net/npm/qrcode@1.5.4/lib/server.js` — `exports.toString` present, `toSvg` absent
- `unpkg.com/@types/qrcode@1.5.6/index.d.ts` — `QRCodeRenderersOptions` (`margin`, `width`, `color`), `toString` overloads
- In-repo `Read` this session: `lib/env.ts:7-18`, `lib/auth.ts:14,128-139`, `lib/bot.ts:23-58`, `lib/i18n/index.ts:20-22`, `prisma/schema.prisma:19-44`, `tests/unit/i18n.test.ts:35`, `vitest.config.ts:4-7`, `tsconfig.json`, `package.json`, `.planning/config.json`

### Secondary (MEDIUM confidence — official docs)
- `nextjs.org/docs/app/api-reference/functions/after` (v16.3.8) — `after` stable since v15.1, Route Handler usage, no cookies in SC callbacks
- `nextjs.org/docs/app/api-reference/file-conventions/route` (v16.3.8) — async `params`, `GET` default dynamic since v15.0.0-RC, segment config
- Project documents: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/research/{ARCHITECTURE,PITFALLS,FEATURES,SUMMARY}.md`, `.planning/phases/01-foundation/01-*SUMMARY.md`

### Tertiary (LOW confidence — training/ecosystem)
- Prisma 7 `updateMany` return shape (`{count}`) — standard API, not re-verified against installed v7 types this session
- `Intl.NumberFormat('ru-RU')` output — formatting only

## Metadata

**Confidence breakdown:**
- ARTEMIDA transport contract: HIGH — live-probed this session (auth, envelope, headers, CSP)
- ARTEMIDA success shapes: LOW — auth-gated docs; explicitly quarantined behind the probe checkpoint
- Prisma/i18n/QR mechanics: MEDIUM-HIGH — in-repo values read verbatim; `qrcode`/`Intl` behaviors verified
- Next 16 revalidation (`after`): HIGH — official docs (v16.3.8)
- Pitfalls: MEDIUM — mix of verified repo facts (i18n regex, missing `toSvg`) and project PITFALLS research

**Research date:** 2026-10-01
**Valid until:** 2026-10-31 (provider API is pre-integration and may change; re-probe at plan execution)
