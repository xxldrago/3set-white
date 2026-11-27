# Phase 21: Subscription & Purchase (7 days) - Research

**Researched:** 2026-11-27
**Domain:** Next.js 16 BFF money pipeline (ARTEMIDA + Platega) ↔ Flutter 3.50 mobile purchase UI
**Confidence:** HIGH on backend reuse contracts (source files read this session), MEDIUM on the external WebView dependency and client JSON shape, LOW on anything requiring live Platega credentials (external blocker)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Verbatim from `.planning/phases/21-subscription-purchase-7-days/21-CONTEXT.md`, `<decisions>`:

- **D-01:** Цен тарифов отдаёт бэкенд через новый `GET /api/mobile/pricing`,computed через существующий `lib/pricing.ts` (ARTEMIDA quote + retail markup). При 2 устройствах значения ровно 115/400/1000/1900/3800 ₽. Клиент не хардкодит цены и не дёргает ARTEMIDA напрямую. — **Reversibility:** costly — публичный контракт; клиент и тесты завязаны на формулу ответа.
- **D-02:** Мобильный поток жёстко 2–10 устройств; бэкенд валидирует `devices ∈ [2,10]` для мобильных роутов, остальной бэкенд сохраняет `TARIFF_MAX_DEVICES=9999`. — **Reversibility:** reversible — границы валидации.
- **D-03:** Итоговая сумма = база × devices/2 × (1 − discount), целые RUB, округление **вверх**. Бэкенд — источник правды для суммы заказа; клиент считает только для предпросмотра. — **Reversibility:** reversible — формула/округление.
- **D-04:** Мобильные платежные роуты — тонкие обёртки над существующим `orders-service`: `createOrder`, `precheckOwnedKeyByUserId`, `loadOrderForUserId`; `payload = orderId`, идемпотентность по `transaction_id`. Webhook Platega остаётся общий (`app/api/platega/callback/route.ts`) с header-verification, server-side re-query, amount check, outbox. — **Reversibility:** costly — заказной контракт и webhook; откат = отдельный мобильный конвейер.
- **D-05:** Пользователь подтверждает оплату в WebView внутри приложения (`flutter_inappwebview`), открывая `payment_url` из `/payments/create`. Внешний браузер/deep-link return — не основной путь. — **Reversibility:** costly — новая зависимость + навигация + lifecycle.
- **D-06:** Клиент опрашивает `GET /api/mobile/payments/status/{id}` каждые 3 с, макс 5 мин; webhook — единственный источник выпуска ключа. Если приложение убито во время оплаты, при следующем запуске находится последний `PENDING` заказ и опрос продолжается. — **Reversibility:** reversible — можно убрать continuation.
- **D-07:** `CONFIRMED` → outbox → ARTEMIDA issue/renew → обновление `/subscription`; `CANCELED`/`CHARGEBACKED`/`DISPUTED` не выпускают ключ; статусы и суммы сверяются сервером, клиент не инициирует выпуск. — **Reversibility:** reversible.
- **D-08:** Промокоды LIME15 (−15%) и 3SET5 (−5%) проверяются бэкендом через `/api/mobile/promo/apply` (переиспользование существующей promo-логики). Клиент применяет только полученный процент, не хранит коды как источник правды. — **Reversibility:** reversible — можно перевести проверку в общий заказной конвейер.
- **D-09:** Trial-ключи: `/subscription` отдаёт `isTrial`; бэкенд дополнительно проверяет `precheckOwnedKeyByUserId`/`isTrialConflict`; UI скрывает продление/апгрейд и показывает «Триал не продлевается». — **Reversibility:** reversible.
- **D-10:** Grace period 24 ч authoritative на бэкенде: `/subscription` отдаёт `statusKind` + `graceUntil`; подключение разрешено в grace; UI показывает «expires soon»-баннер. Клиент не вычисляет 24 ч сам. — **Reversibility:** reversible.
- **D-11:** Нет активного ключа (или grace) → connect заблокирован, тост «Нужен активный ключ», переход в магазин. Наследует D-21 фазы 19 и D-03 фазы 20 (`/config` требует ключ). — **Reversibility:** reversible.
- **D-12:** Статус подписки читается из одного `GET /api/mobile/subscription` (реальные ключи/устройства/лимит/ссылка/isTrial/graceUntil через `getSubscriptionForUserId`). Раздельные `/keys`/`/devices` — фаза 22. — **Reversibility:** reversible — можно разделить эндпоинты.
- **D-13:** Кольцо срока подписки days/30 рисуется Flutter `CustomPainter`, цвет по порогам; без `flutter_svg` и без load-бара. — **Reversibility:** reversible.
- **D-14:** Confetti при `CONFIRMED` — собственный overlay на `AnimationController`/`CustomPainter`, без новой зависимости и без симуляции оплаты; затем overlay с деталями ключа и тост «Подписка продлена до {date}». — **Reversibility:** reversible.
- **D-15:** Копирование subscription-ссылки — через `Clipboard.setData` (`flutter/services`), тост «Ссылка скопирована»; без дополнительной зависимости. — **Reversibility:** reversible.
- **D-16:** Shop Screen — тёмная тема прототипа, русская копия, 5 тарифов, payment chips, stepper, promo, живая сумма; заменяет заглушку `features/shop/shop_screen.dart` без нижней навигации. — **Reversibility:** costly — переделка экрана+навигации; откат к заглушке.

### the agent's Discretion

Verbatim:

- Точный JSON-контракт `/pricing`, `/subscription`, `/promo/apply`, `/payments/*`; имена полей и freezed-модели Dart.
- Выбор merchant-аккаунта Platega для мобильных заказов (site vs bot) при появлении тестовых кредов; контракт остаётся совместимым с header-verification.
- Точный WebView-контроллер и deep-link return handling; способ сохранения pending-order id.
- Длительность/частицы confetti, пороги цветов кольца, текста «expires soon».
- Как именно хранить последний pending заказ (Drift vs secure storage) при условии, что secrets не сохраняются в открытом виде.

### Deferred Ideas (OUT OF SCOPE)

Verbatim from `<specifics>` → Deferred Ideas and `<deferred>`:

- Device management/add/remove/limit UI — Phase 22 (`REQ-DEV-01..05`, `REQ-BE-06`).
- Settings/profile screen, push notifications — Phase 22.
- Hardening/release, Play Internal/TestFlight, GPL legal — Phase 23/external.
- Real Platega test credentials — external blocker; test-mode/source verification only here.
- load-бар — deferred from phase 19 (REQ-POOL-04).
- Static server catalog, SNI allowlist, light theme, bottom nav, manual network-chip simulation — rejected in phases 19/20; do not revisit.
- Phase 19/20 deferred UAT — must be resolved before milestone close.
- See `<specifics>` Deferred Ideas above. No scope creep captured; no folded/reviewed todos (`todo.match-phase` empty). No UI-SPEC by explicit choice consistent with prior phases.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-SUB-01 | `GET /api/mobile/subscription` → expiresAt, deviceLimit, link, devices[] | `listKeysByUserId` + `getSubscriptionForUserId` + `isActiveKey` reuse (§Pattern 2); stub route at `app/api/mobile/subscription/route.ts:18-47` |
| REQ-SUB-02 | No active key → connect blocked → shop | Existing `isActiveKey` gate in `/servers` and `/config`; shop route already exists in `mobile/lib/app/router.dart:93-97` |
| REQ-SUB-03 | «ключ · N дн.» header + days/30 ring | `daysUntilExpiry`, `deriveStatusKind`; ring via `CustomPainter` (D-13); prototype geometry quoted in §Code Examples |
| REQ-SUB-04 | Device limit enforcement | `deviceLimit`/`devices` already on `RenderedKey`; add/remove UI is **Phase 22** — this phase only surfaces the limit |
| REQ-SUB-05 | Copy subscription link | `subscriptionUrl` from `getSubscriptionForUserId`; `Clipboard.setData` (D-15) |
| REQ-SUB-06 | 24h grace + «expires soon» banner | **No grace exists in `StatusKind`/`SubscriptionForUser` today** — must be derived server-side; cross-phase gate conflict flagged in §Open Questions Q1 |
| REQ-SHOP-01 | 5 terms 115/400/1000/1900/3800 ₽, «Хит» on 1м | Calibration pinned at `tests/unit/tariff-markup.test.ts:125-142`; `/api/mobile/pricing` wraps `resolveTariffQuote` |
| REQ-SHOP-02 | Device stepper 2–10 | D-02 mobile validation; `TARIFF_GRID_MAX_DEVICES = 10` exactly covers the manual grid |
| REQ-SHOP-03 | LIME15 / 3SET5, invalid → shake + error | `validatePromo` read-only preview + `consumePromo` at checkout; existing `/api/pricing` promo-preview pattern |
| REQ-SHOP-04 | Payment chips МИР/VISA/MC/SBP/CRYPTO, selection persists | Prototype chips are UI state; Platega method codes do NOT distinguish МИР/VISA/MC — see §Open Questions Q2 |
| REQ-SHOP-05 | Live summary base/devices/discount/total/per-day-per-device | Prototype formula `Math.round(base*devices/2*(1-discount))` — D-03; backend remains source of truth |
| REQ-SHOP-06 | Platega create → WebView → poll 3s/5min | `createOrder` already returns `url` with `payload=orderId`; `flutter_inappwebview` (D-05) + poll service (D-06) |
| REQ-SHOP-07 | Confetti + «Подписка продлена до {date}» | D-14 own overlay; toast copy in `21-CONTEXT.md` `<specifics>` |
| REQ-SHOP-08 | Trial cannot renew/upgrade | `TRIAL_ERROR_CODE`/`precheckOwnedKeyByUserId`/`isTrialConflict` all exist; 409 mapping pattern in `app/api/orders/route.ts:156-196` |
| REQ-BE-03 | Mobile subscription route | Fill the existing stub from `getSubscriptionForUserId`, no new provider path |
| REQ-BE-04 | Mobile payments create/status | Thin wrappers over `createOrder` + `loadOrderForUserId`; status is DB-only (no live provider call needed) |
| REQ-BE-05 | Mobile keys issue/renew | **Advisory:** already fulfilled by the webhook → outbox → `worker.processFulfillOrder` path. Do **not** add client-callable `/api/mobile/keys/issue|renew` — that would duplicate the sole issuer (D-04/D-07) |
| REQ-BE-07 | Platega webhook, idempotent on transaction_id | Existing `app/api/platega/callback/route.ts` is complete; reuse unchanged, including merchant check |
| REQ-BE-08 | Shared Zod → Dart types via OpenAPI | Advisory only; no OpenAPI generator in repo — defer, keep hand-written freezed models this phase |

</phase_requirements>

## Summary

This phase is predominantly **wiring and UI**, not new backend mechanics. The money pipeline already exists and is deliberately single-path: `createOrder()` in `lib/orders-service.ts` server-quotes the amount, persists a `pending` order, calls Platega with `payload = order.id`, and the shared webhook re-queries Platega, checks amount/currency, atomically claims `pending → paid`, and enqueues exactly one `fulfill-order` outbox row. The worker is the only component that calls ARTEMIDA `keys.issue`/`keys.renew`, with a deterministic `order:{id}:{kind}` idempotency key. [VERIFIED: lib/orders-service.ts:124-318, 365-386, 493-524; lib/worker.ts:112-220; app/api/platega/callback/route.ts:62-179] Mobile routes must be thin wrappers over these functions — never a second issuer and never a client-supplied price.

Three real gaps need new code: (1) `GET /api/mobile/subscription` is a stub returning `keys: []`; (2) no `/api/mobile/pricing`, `/promo/apply`, `/payments/create`, `/payments/status/{id}` routes exist; (3) the Flutter `ShopScreen` is a stub and `subscription/providers.dart` returns a mock payment URL. The 24h grace period is **not implemented anywhere** in the subscription domain — `StatusKind` has five values and no grace state, and `SubscriptionForUser` has three fields and no `graceUntil`; it must be derived server-side in this phase and will require touching the phase-19/20 connect gate if «connection allowed in grace» is to be honoured. [VERIFIED: lib/keys-service.ts:27-97, 243-319; app/api/mobile/servers/route.ts:16-38]

The main external risk is `flutter_inappwebview`: the locked stable release is 6.1.5 published 2024-10-08 (a 6.2.0 beta line continued into 2026), so the dependency is ~2 years old relative to the installed Flutter 3.50.1 / Dart 3.14.0. [CITED: pub.dev/api/packages/flutter_inappwebview] It declares compatibility `sdk ^3.5.0`, `flutter >=3.24.0`, which nominally covers our SDKs, but device-level verification is a human gate. Live payment verification is blocked on Platega test credentials (recorded in `STATE.md`); this phase can only do source-level and mocked-fetch verification.

**Primary recommendation:** Implement four narrow route handlers that call the existing services unchanged, fill `/subscription` from `listKeysByUserId` + `getSubscriptionForUserId` + a new server-side grace derivation, and build the Shop UI against the prototype with a hand-written freezed model layer — treating the webhook/outbox as untouchable and the client as presentation-only.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Price quote (5 terms × 2–10 devices) | API / Backend (`/api/mobile/pricing`) | — | `ARTEMIDA_API_KEY` must never leave the server; `resolveTariffQuote` is already the shared source for display and billing (D-01) |
| Client price preview (discount, per-day) | Browser / Client (Flutter) | API / Backend | Preview only; D-03 makes the backend authoritative for the charged amount |
| Subscription status, expiry, devices, link, trial, grace | API / Backend (`/api/mobile/subscription`) | Database / Storage (`keys_cache`) | Ownership-joined reads; client never computes grace (D-10) or calls ARTEMIDA |
| Order creation + Platega transaction | API / Backend (`/payments/create` → `createOrder`) | — | Server quote, `payload=orderId`, no auto-retry on create; merchant selection server-side |
| Payment status polling | API / Backend (`/payments/status/{id}`) | Browser / Client (3s/5min poll) | DB-only ownership-scoped read; no live provider call in the poll path (mirrors `/api/orders/[orderId]`) |
| Key issuance / renewal | API / Backend (webhook → outbox → worker) | Database / Storage (Order, Outbox) | Sole issuer; client never initiates (D-04/D-07) |
| Promo validation | API / Backend (`/promo/apply`) | API / Backend (`createOrder` re-validates + consumes) | Preview is read-only; consumption is atomic at checkout so the client cannot spoof a discount (D-08) |
| WebView payment confirmation | Browser / Client (`flutter_inappwebview`) | API / Backend (`payment_url`) | Hosted page owns card entry; app only displays and polls (D-05) |
| Ring, confetti, copy link, chips, toasts | Browser / Client (Flutter) | — | Pure presentation; no new dependencies beyond the WebView plugin (D-13..D-16) |
| Connect gating on no key / grace | API / Backend (`/servers`, `/config`) | Browser / Client (shop redirect + toast) | Backend owns entitlement; client only reflects the gate (D-11, phases 19/20) |

## Standard Stack

### Core (already installed; no new backend packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.3.x | Route Handlers for the four new mobile endpoints | Repo-wide pattern; `force-dynamic`, zod, typed error envelope [VERIFIED: app/api/mobile/servers/route.ts:14, 66-148] |
| zod | `^4.6` (npm `latest` 4.6.5 verified 2026-10-12) | Boundary validation for all four new routes | Already used in every mobile route and in `/api/orders` [VERIFIED: app/api/orders/route.ts:31-70] |
| `lib/orders-service.ts` | repo | `createOrder`, `loadOrderForUserId`, `precheckOwnedKeyByUserId`, `applyConfirmedPayment` | Single money-pipeline entry point (D-04) [VERIFIED: lib/orders-service.ts:124, 349-357, 421-429, 505-524] |
| `lib/pricing.ts` + `lib/tariff-grid.ts` | repo | `resolveTariffQuote`, `getAllMarkupsPerDevice`, five-day grid | Live quote + manual-cell precedence, same source as billing [VERIFIED: lib/pricing.ts:119-142, 206-219] |
| `lib/promo.ts` | repo | `validatePromo` (preview), `consumePromo` (atomic claim) | Case-insensitive, bounded, race-safe [VERIFIED: lib/promo.ts:48-122] |
| `lib/keys-service.ts` | repo | `listKeysByUserId`, `getSubscriptionForUserId`, `daysUntilExpiry`, `deriveStatusKind`, `isTrialConflict` via orders-service | Ownership-joined, cache-first, no IDOR [VERIFIED: lib/keys-service.ts:27-97, 157-165, 272-319] |
| `lib/platega.ts` + `lib/payments.ts` | repo | `getPaymentClient`, merchant selection, `createTransaction` never retried | Typed codes, header auth, `payload`, no provider text [VERIFIED: lib/platega.ts:189-200, 273-331, 357-386; lib/payments.ts:99-183] |
| Flutter + Dart | Flutter 3.50.1 stable, Dart 3.14.0 | Mobile client | Probed this session (`flutter --version`, `dart --version`) — matches `mobile/pubspec.yaml:7-8` `sdk: ^3.14.0` |
| Riverpod / freezed / Dio | 3.4.2 / 4.0.3 / 5.9.2 | State, models, HTTP with `AuthInterceptor` | Already configured; `AsyncValue.when`, `ref.invalidate` established in phases 18–20 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `flutter_inappwebview` `[ASSUMED]` | stable `6.1.5` (pub.dev, published 2024-10-08); beta `6.2.0-beta.3` (2026-02-04) | In-app WebView for Platega `payment_url` (D-05) | Only for the payment confirmation screen; declares `sdk ^3.5.0`, `flutter >=3.24.0` [CITED: pub.dev/api/packages/flutter_inappwebview]. Package name is `[ASSUMED]` per provenance rule — the legitimacy seam does not support the `pub` ecosystem, so a human-verify install checkpoint is mandatory |
| `flutter/services` `Clipboard` | Flutter SDK | Copy subscription link (D-15) | No new dependency |
| `CustomPainter` + `AnimationController` | Flutter SDK | Ring and confetti (D-13/D-14) | No `flutter_svg`, no confetti package, no simulation |
| `flutter_secure_storage` | `^11.2.0` | Persist only the pending **order id** (not a token/secret) if using storage for continuation | D-06; agent discretion between Drift and secure storage |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `flutter_inappwebview` (locked D-05) | `webview_flutter` (official Google plugin) | Better maintenance cadence, but contradicts a costly locked decision; do not revisit here |
| One `/subscription` route (D-12) | Separate `/keys` + `/devices` routes | Cleaner separation but explicitly deferred to Phase 22 |
| Live Platega status re-query in `/payments/status` | DB-only order read (recommended) | Live query adds quota use and a second source of truth; webhook/outbox owns issuance, so DB status is sufficient for the poll |
| Storing the Platega URL in secure storage | Store only our `order.id` | URL is a payment handle, not a secret, but storing order id keeps continuation provider-agnostic and idempotent |
| Hand-written freezed Dart models | `openapi-generator` Dart client (REQ-BE-08) | No generator in repo; adding one is advisory/Phase 23 scope for this phase |

**Installation:**

```bash
# mobile only — ONE new dependency; pin the stable release, no beta
cd mobile && flutter pub add flutter_inappwebview:6.1.5
# backend: no new packages
```

**Version verification:** `pub.dev` API queried this session (`curl https://pub.dev/api/packages/flutter_inappwebview`): latest stable `6.1.5`, published `2024-10-08T22:11:28Z`, `environment.sdk ^3.5.0`, `environment.flutter >=3.24.0`; federated `flutter_inappwebview_android 1.1.3`, `_ios 1.1.2`, `_platform_interface 1.3.0+1`. [CITED: pub.dev/api/packages/flutter_inappwebview] npm cross-ecosystem probe returned only `0.0.1-security`, confirming the real package lives in `pub`, not npm. The seam `package-legitimacy check` only accepts `npm|pypi|crates` and rejected `--ecosystem pub`, so no automated legitimacy verdict is available for this dependency.

## Package Legitimacy Audit

> Required because the phase adds an external package. The seam could not gate the `pub` ecosystem; the table records what *was* verified and what still needs a human checkpoint.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `flutter_inappwebview` `[ASSUMED]` | pub.dev | Stable 6.1.5 published 2024-10-08 (~2 yrs); prerelease 6.2.0-beta.3 on 2026-02-04 | Not exposed by the pub.dev package-metadata endpoint queried this session | `github.com/pichillilorenzo/flutter_inappwebview` (from pubspec `repository`) | **NOT GATED** — seam rejects `pub`; marked `[ASSUMED]` per provenance rule | **Flagged — planner must add `checkpoint:human-verify` before `flutter pub add`** |

**Packages removed due to [SLOP] verdict:** none (no npm/pypi/crates package added this phase).
**Packages flagged as suspicious [SUS]:** `flutter_inappwebview` — not a legitimacy-SUS signal; flagged because (a) the package-name provenance rule applies when the seam cannot gate it, and (b) the stable line is ~2 years old against Flutter 3.50.1. Verify the version resolves on the target machine and that an Android debug build + iOS compile succeed before relying on it.

*No other new packages are recommended. Ring, confetti and clipboard use the Flutter SDK only (D-13/D-14/D-15).*

## Architecture Patterns

### System Architecture Diagram

```text
   Flutter client (mobile/)
   ──────────────────────────────────────────────────────────────────────
   ShopScreen ──► /api/mobile/pricing ──► resolveTariffQuote ──► ARTEMIDA /pricing (server-only key)
        │                                   └─► manual tariffPrice cell wins (≤10 devices)
        ├─► /api/mobile/promo/apply ─────► validatePromo (read-only; returns % preview)
        ├─► /api/mobile/payments/create ─► createOrder ──► Order(pending, payload=id) ──► Platega /v2/transaction/process
        │                                                          └─► returns {payment_url, orderId}
        ├─► InAppWebView(payment_url) ────► Platega hosted page ──► user pays
        ├─► poll /api/mobile/payments/status/{orderId} every 3 s (≤5 min) ──► DB-only loadOrderForUserId
        └─► after kill/restart: last PENDING orderId from secure storage ──► resume polling
                                                       │
   Internet ──► POST /api/platega/callback (X-MerchantId/X-Secret) ──► detect merchant
                    │  1 verify headers → 2 zod body → 3 resolve by txId or payload
                    │  4 server re-query GET /transaction/{id} → 5 status + amount/currency check
                    └─► 6 applyConfirmedPayment: atomic pending→paid ──► Outbox(fulfill-order)
                                                                              │
                                                       worker.processFulfillOrder
                                                       ├─► ARTEMIDA keys.issue / renew / upgrade
                                                       │     idempotency-key order:{id}:{kind}
                                                       └─► upsertCachedKey ──► /subscription reflects new key
   Flutter ──► GET /api/mobile/subscription ──► listKeysByUserId → isActiveKey → getSubscriptionForUserId
                    └─► {expiresAt, remainingDays, deviceLimit, link, devices[], isTrial, statusKind, graceUntil}
                              │
                              └─► no active key (and no grace) ──► /servers,/config 403 ──► shop + «Нужен активный ключ»
```

External boundaries: ARTEMIDA (server-side only), Platega (hosted page + callback), Postgres/Prisma (orders, outbox, keys_cache). The client never holds `ARTEMIDA_API_KEY`, `PLATEGA_SECRET`, a raw subscription link in logs, or a provider transaction id.

### Recommended Project Structure

```text
app/api/mobile/
├── pricing/route.ts           # NEW: batched 5-term quote, devices 2..10
├── promo/apply/route.ts       # NEW: validatePromo preview only (no consume)
├── payments/create/route.ts   # NEW: thin createOrder wrapper
├── payments/status/[id]/route.ts # NEW: thin loadOrderForUserId wrapper
└── subscription/route.ts      # FILL: existing stub → real aggregated keys
lib/
└── subscription-view.ts       # NEW (recommended): pure aggregation + grace derivation (testable)
mobile/lib/
├── core/api/endpoints.dart           # ADD pricing, promoApply, paymentCreate, paymentStatus
├── core/payment/                     # NEW: WebView page, pending-order store, poll service
├── features/shop/
│   ├── shop_screen.dart              # REPLACE stub (no bottom nav)
│   ├── widgets/                      # term cards, stepper, promo field, chips, summary
│   └── painting/                     # ring CustomPainter, confetti CustomPainter/overlay
└── features/subscription/
    ├── providers.dart                # REPLACE hardcoded plans + mock URL
    └── models/                       # freezed: pricing, subscription, promo, payment
```

### Pattern 1: Thin wrapper, never a second pipeline

**What:** Each new mobile route does `verifyAccessToken` → zod parse → call one existing service → map to a stable typed body. No new Prisma writes to `orders`, no direct `fetch` to ARTEMIDA/Platega from a route.
**When to use:** `/payments/create`, `/payments/status`, `/promo/apply`, `/subscription`, `/pricing`.
**Example:** mirror `app/api/mobile/config/route.ts:43-121` (JWT, `x-request-id`, `ok:false` envelope, no 5xx) and `app/api/orders/route.ts:98-143` (typed `OrderPromoError` → 400 `promo_invalid`, `ArtemidaError` codes → 402/429/502). [VERIFIED: app/api/mobile/config/route.ts:37-121; app/api/orders/route.ts:98-143]

### Pattern 2: Subscription aggregation from one owned key

**What:** `getSubscriptionForUserId(userId, keyId)` is **per-key**, not an aggregate — it requires a `keyId` and returns `{subscriptionUrl, links, traffic}`. The route must first pick the active key with `listKeysByUserId` + the phase-19 `isActiveKey` predicate, then call `getSubscriptionForUserId(claims.userId, active.id)` once. [VERIFIED: lib/keys-service.ts:243-247, 272-319; app/api/mobile/servers/route.ts:24-38, 80-99]
**When to use:** filling the `/subscription` stub.
**Example:** the ordering in `/servers` (`listKeysByUserId` → `find(isActiveKey)` → `getSubscriptionLinksCacheFirst`) is the direct template; reuse `isActiveKey` by import, do not re-declare it. [VERIFIED: app/api/mobile/config/route.ts:13-20, 53-63]

### Pattern 3: Pricing quote and preview parity

**What:** `/api/mobile/pricing` calls `resolveTariffQuote(days, devices)` for each of the five `TARIFF_DAYS`, with a **mobile-only** zod bound `devices ∈ [2,10]`. Manual grid cells win for exact `(days, devices)`; above the grid `applyMarkup(providerAmount, days, devices, markup)` is `Math.round(base + markupPerDevice * devices)`, clamped to `[TARIFF_MIN_AMOUNT, TARIFF_MAX_AMOUNT]`. [VERIFIED: lib/pricing.ts:168-178, 206-219; lib/tariff-grid.ts:12-39, 65-71]
**When to use:** quote endpoint and Dart preview formula.
**Important:** D-03's `base × devices/2` is the *client preview* shorthand calibrated at 2 devices; the backend's actual multisetep formula is additive per-device markup, so preview can diverge at ≥3 devices. Keep the client preview explicitly labelled as an estimate and always use the server amount in the order (the backend never accepts a client amount — `createOrder` quotes internally). [VERIFIED: lib/orders-service.ts:148-165]

### Pattern 4: WebView + poll + resume

**What:** `/payments/create` returns the `url` from `createOrder` plus our own `order.id`; the app opens it in `InAppWebView` and polls `/payments/status/{orderId}` every 3 s up to 5 min. On `provisioned`/terminal state, invalidate `/subscription` and show confetti + toast. Persist only the order id (never a secret) so a killed app resumes polling. [VERIFIED: lib/orders-service.ts:263-300; app/api/orders/[orderId]/route.ts:22-55]
**When to use:** D-05/D-06. The poll route is DB-only and side-effect-free — the webhook alone provisions.

### Pattern 5: Trial precheck and clean error codes

**What:** For `renew`/`upgrade`, mirror `app/api/orders/route.ts:156-196`: `precheckOwnedKeyByUserId(userId, keyId)` → `not_found` = 404, `trial` = 409; never surface a raw provider 409. The same clean code is used by the worker via `isTrialConflict`. [VERIFIED: lib/orders-service.ts:43-56, 326-357; app/api/orders/route.ts:148-196]
**When to use:** `/payments/create` when `kind !== "new"`.

### Anti-Patterns to Avoid

- **Second key issuer:** any client-callable `/keys/issue` or `/keys/renew` route, or a poll handler that calls ARTEMIDA. Violates D-04/D-07 and defeats the outbox idempotency guarantee. (REQ-BE-05 is advisory; do not implement its literal route.)
- **Client-supplied price/discount:** `createOrder` already ignores any client amount; do not add an `amount` field to the mobile create body. The `/promo/apply` result is a preview only — the code is re-validated and consumed at checkout. [VERIFIED: lib/orders-service.ts:148-202]
- **Payload mutation for `source=mobile`:** `resolveOrderByTxOrPayload` resolves by `findUnique({ where: { id: payload } })`; writing `payload="orderId:mobile"` would silently break lost-create recovery. The `Order` model has no `source` column. [VERIFIED: lib/orders-service.ts:388-406; prisma/schema.prisma:182-212]
- **Retrying create:** `createTransaction` is explicitly never retried (no idempotency contract); `/payments/create` must not auto-retry on provider error. [VERIFIED: lib/platega.ts:12-14, 273-309]
- **Logging secrets or raw provider text:** pino logs carry only `{route, outcome, code, orderId, durationMs}`. Never log `payment_url`, `payload`, subscription link, headers, or the provider message. [VERIFIED: app/api/platega/callback/route.ts:57-178; lib/platega.ts:32-42]
- **Reimplementing the gate:** import `isActiveKey` from `/servers`; do not copy a new `key.statusKind === "active"` check that would omit the raw-status exclusions (`expired`, `revoked`, `disabled`, `trial-expired`). [VERIFIED: app/api/mobile/servers/route.ts:16-38]
- **Prototype simulation:** no `sleep`, no fake prices, no demo confetti, no `localStorage` state. The prototype is a visual contract only. [CITED: .planning/seeds/SEED-001-mobile-client-karing.md:48-55]

## Verbatim Source Values

> These quotes are the checkable proof for every discrete value used in this research. Values not present here are `[ASSUMED]`.

**`OrderKind` / `OrderStatus` — [VERIFIED: lib/orders-service.ts:22-30]**
```ts
export type OrderKind = "new" | "renew" | "upgrade";
export type OrderStatus =
  | "pending"
  | "paid"
  | "provisioning"
  | "provisioned"
  | "failed"
  | "canceled"
  | "refunded";
```

**`CreateOrderInput` — [VERIFIED: lib/orders-service.ts:73-101]**
```ts
export interface CreateOrderInput {
  userId?: number;
  telegramId?: number;
  kind: OrderKind;
  days: number | null;
  devices: number;
  addDevices?: number;
  keyId?: string | null;
  userName?: string | null;
  promoCode?: string | null;
  useBalance?: boolean;
  channel?: "web" | "bot";
}
```

**Trial + amount discipline — [VERIFIED: lib/orders-service.ts:51-71]**
```ts
export const TRIAL_ERROR_CODE = "trial";
export function isTrialConflict(code: string): boolean {
  return code === "conflict";
}
export function amountMatches(charged: number, expected: number): boolean {
  return charged === expected;
}
```

**Payload, merchant and return URLs — [VERIFIED: lib/orders-service.ts:214-218, 270-293]**
```ts
const plategaMerchant: PlategaMerchant =
  input.channel === "bot" && hasBotMerchant() ? "bot" : "site";
// ...
const returnUrl = botReturn
  ? `https://t.me/${botUsername}?start=payment_success_${order.id}`
  : `${env.APP_BASE_URL}/pay/success`;
const failedUrl = botReturn
  ? `https://t.me/${botUsername}?start=payment_failed_${order.id}`
  : `${env.APP_BASE_URL}/pay/fail`;
// ... payload: order.id,
```

**Order resolution / ownership reads — [VERIFIED: lib/orders-service.ts:388-429]**
```ts
export async function resolveOrderByTxOrPayload(
  txId: string | null,
  payload: string | null,
): Promise<Order | null> {
  if (txId) {
    const byTx = await prisma.order.findUnique({ where: { plategaTxId: txId } });
    if (byTx) return byTx;
  }
  if (payload) {
    return prisma.order.findUnique({ where: { id: payload } });
  }
  return null;
}
export async function loadOrderForUserId(
  userId: number,
  orderId: string,
): Promise<Order | null> {
  return prisma.order.findFirst({
    where: { id: orderId, user: { id: userId } },
  });
}
```

**`Order` schema (note: no `source` column) — [VERIFIED: prisma/schema.prisma:182-217]**
```prisma
model Order {
  id               String      @id @default(cuid())
  userId           Int         @map("user_id")
  user             User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind             OrderKind
  keyId            String?     @map("key_id")
  days             Int?
  devices          Int
  amount           Int // whole RUB from ARTEMIDA GET /pricing (server-quoted)
  currency         String      @default("RUB")
  status           OrderStatus @default(pending)
  plategaTxId      String?     @unique @map("platega_tx_id")
  paymentUrl       String?     @map("payment_url")
  paidAt           DateTime?   @map("paid_at")
  provisionedKeyId String?     @map("provisioned_key_id")
  errorCode        String?     @map("error_code")
  attempts         Int         @default(0)
  nextAttemptAt    DateTime?   @map("next_attempt_at")
  createdAt        DateTime    @default(now()) @map("created_at")
  updatedAt        DateTime    @updatedAt @map("updated_at")
  promoCode        String?     @map("promo_code")
  finalAmount      Int         @default(0) @map("final_amount")
  balanceUsed      Int         @default(0) @map("balance_used")
  providerCost     Int?        @map("provider_cost")
  provider         String?     @map("provider") // platega | oneplat — active payment provider
  plategaMerchant  String?     @map("platega_merchant") // "site" | "bot" — which Platega merchant
  outbox           Outbox[]

  @@index([userId, createdAt])
  @@index([status, nextAttemptAt])
  @@map("orders")
}
```
*No `source` field exists in this model.*

**Tariff dimensions and markups — [VERIFIED: lib/tariff-grid.ts:12-24, 65-71]**
```ts
export const TARIFF_DAYS = [7, 30, 90, 180, 365] as const;
export type TariffDays = (typeof TARIFF_DAYS)[number];
export const TARIFF_MIN_DEVICES = 2;
export const TARIFF_MAX_DEVICES = 9999;
export const TARIFF_GRID_MAX_DEVICES = 10;
export const TARIFF_MIN_AMOUNT = 1;
export const TARIFF_MAX_AMOUNT = 1_000_000_000;
export const TARIFF_CURRENCY = "RUB";
export const MARKUP_PER_DEVICE: Record<TariffDays, number> = {
  7: 33,
  30: 140,
  90: 350,
  180: 680,
  365: 1405,
};
```

**Locked price calibration — [VERIFIED: tests/unit/tariff-markup.test.ts:125-142]**
```ts
expect([...TARIFF_DAYS]).toEqual([7, 30, 90, 180, 365]);
expect(MARKUP_PER_DEVICE).toEqual({ 7: 33, 30: 140, 90: 350, 180: 680, 365: 1405 });
expect(applyMarkup(49, 7, 2, 33)).toBe(115);
expect(applyMarkup(300, 90, 2, 350)).toBe(1000);
expect(applyMarkup(540, 180, 2, 680)).toBe(1900);
expect(applyMarkup(990, 365, 2, 1405)).toBe(3800);
```

**Status domain (no grace today) — [VERIFIED: lib/keys-service.ts:27, 37-39, 55-65, 92-97]**
```ts
export type StatusKind = "active" | "expiring" | "expired" | "pending" | "unknown";
const DAY_MS = 86_400_000;
const EXPIRING_WINDOW_MS = 3 * DAY_MS;
export function deriveStatusKind(status: string, expiresAt: Date | null): StatusKind {
  if (expiresAt) {
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) return "expired";
    if (remaining <= EXPIRING_WINDOW_MS) return "expiring";
    return "active";
  }
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";
  return "unknown";
}
export function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return null;
  return Math.max(0, Math.ceil((expires - Date.now()) / DAY_MS));
}
```

**Subscription read shape (no `graceUntil` today) — [VERIFIED: lib/keys-service.ts:243-247, 272-278]**
```ts
export interface SubscriptionForUser {
  subscriptionUrl: string | null;
  links: string[];
  traffic: { usedBytes: number | null; limitBytes: number | null };
}
export async function getSubscriptionForUserId(
  userId: number,
  keyId: string,
): Promise<SubscriptionForUser | null> {
  return getSubscriptionForOwnedKey({ id: userId }, keyId);
}
```

**Connect gate disqualifiers — [VERIFIED: app/api/mobile/servers/route.ts:16-37]**
```ts
const DISQUALIFIED_STATUSES = new Set(["expired", "revoked", "disabled", "trial-expired"]);
if (key.statusKind !== "active" && key.statusKind !== "expiring") return false;
```

**Platega status enum and typed codes — [VERIFIED: lib/platega.ts:25-30, 97-103]**
```ts
export type PlategaCode = "bad_request" | "unauthorized" | "not_found" | "server_error" | "network";
export type PlategaStatus =
  | "PENDING"
  | "CANCELED"
  | "CONFIRMED"
  | "CHARGEBACKED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED";
```

**Callback body statuses — [VERIFIED: app/api/platega/callback/route.ts:42-49]**
```ts
status: z.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELED",
  "CHARGEBACKED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
]),
```

**Unified payment statuses — [VERIFIED: lib/payments.ts:16-39]**
```ts
export type PaymentProvider = "platega" | "oneplat";
export type PaymentCode = "bad_request" | "unauthorized" | "not_found" | "server_error" | "network";
// status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED"
```

**Mobile endpoints already present — [VERIFIED: mobile/lib/core/api/endpoints.dart:11-21]**
```dart
static const String subscription = '/api/mobile/subscription';
static const String servers = '/api/mobile/servers';
static const String config = '/api/mobile/config';
static const String keys = '/api/mobile/keys';
static const String payments = '/api/mobile/payments';
static const String devices = '/api/mobile/devices';
```

**Prototype ring geometry and formula — [CITED: .planning/seeds/prototype-mobile-client.html:359, 804, 808]**
```js
Math.round(t.base*state.shop.devices/2*(1-state.shop.discount))
(351.86*(1-Math.min(dl/30,1))).toFixed(2)
```
*Prototype simulation (`sleep`, fake prices, demo confetti) is explicitly NOT copied. [CITED: .planning/seeds/SEED-001-mobile-client-karing.md:48-55]*

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payment webhook authentication + idempotency | New webhook, new signature scheme, new `CONFIRMED` branch | Existing `app/api/platega/callback/route.ts` unchanged | Header timing-safe check + server re-query + amount check + atomic claim + one outbox row; already tested [VERIFIED: callback/route.ts:62-179] |
| Key issue/renew | Any client-callable issue route or inline provisioning in the poll handler | `worker.processFulfillOrder` via outbox | Deterministic `order:{id}:{kind}` idempotency key; provider retries can't mint two keys [VERIFIED: lib/worker.ts:112-220] |
| Order amount calculation | Client price as source of truth, re-implemented quote | `createOrder` internal `resolveTariffQuote`/`resolveUpgradeQuote` | Client price is never trusted; single source for display and billing [VERIFIED: lib/orders-service.ts:148-165] |
| Promo validation/consumption | Client-side discount table | `validatePromo` + `consumePromo` | Atomic `usedCount` claim re-checks expiry inside the UPDATE; concurrent checkouts can't overspend [VERIFIED: lib/promo.ts:87-122] |
| Payment create retry | `p-retry` around `createTransaction` | Single call + typed `PaymentError` mapping | No provider idempotency key exists for create; blind retry can mint two transactions [VERIFIED: lib/platega.ts:12-14, 273-309] |
| Subscription status derivation | Client-side 24h grace math | Server-derived `statusKind`/`graceUntil` (new pure helper recommended) | D-10; client must not own entitlement [VERIFIED: lib/keys-service.ts:27-97] |
| Ring / confetti | `flutter_svg`, confetti package, Lottie | `CustomPainter` + `AnimationController` | D-13/D-14 forbid a new dependency and simulation |
| Clipboard copy | Method channel / plugin | `Clipboard.setData` from `flutter/services` | D-15; in Flutter SDK already |

**Key insight:** the risky parts of this domain (money, idempotency, ownership, provider errors) are already solved once in shared libs. The phase's real work is honest wiring plus a faithful, non-simulated UI.

## Common Pitfalls

### Pitfall 1: Treating `getSubscriptionForUserId` as an aggregate
**What goes wrong:** Calling it without a key id, or calling it per key on every poll, producing IDOR risk and extra ARTEMIDA traffic.
**Why it happens:** Its name suggests a whole-subscription read; its signature requires `(userId, keyId)`. [VERIFIED: lib/keys-service.ts:272-278]
**How to avoid:** Resolve one active key via `listKeysByUserId` + `isActiveKey`, then call it once; reuse the cache-first `/servers` source if links only are needed.

### Pitfall 2: `payload=orderId` is load-bearing
**What goes wrong:** Prefixing the payload with a mobile marker (`mobile:{id}`), or setting `source` in it, breaks the callback's lost-create fallback (`findUnique({where:{id:payload}})`). [VERIFIED: lib/orders-service.ts:388-406]
**Why it happens:** The DB has no `source` column; everything is encoded in `plategaMerchant` and the echoed payload. [VERIFIED: prisma/schema.prisma:182-212]
**How to avoid:** Keep `payload: order.id` verbatim; identify mobile orders by the route that created them, not by mutating the payload.

### Pitfall 3: Grace period conflicts with the phase-19/20 gate
**What goes wrong:** `/subscription` reports a 24h grace while `/servers` and `/config` still return 403 for `statusKind === "expired"` and raw `expired`/`revoked`/`disabled`/`trial-expired`. [VERIFIED: app/api/mobile/servers/route.ts:16-38; app/api/mobile/config/route.ts:53-61]
**Why it happens:** D-10 is new in phase 21; the locked gate predates it.
**How to avoid:** Decide explicitly (see Open Questions Q1). If grace is to permit connection, change the shared predicate once and update `mobile-servers-route.test.ts`/`mobile-config-route.test.ts`; do not let the two surfaces disagree.

### Pitfall 4: Device-range mismatch between backend and D-03 formula
**What goes wrong:** Client preview uses `base × devices/2` at 3–10 devices while `resolveTariffQuote` uses `provider quote + markup × devices`, so the "live sum" differs from what the server charges. [VERIFIED: lib/pricing.ts:168-178; lib/tariff-grid.ts:65-71]
**Why it happens:** D-03 is calibrated at 2 devices; the backend must cover 2–9999.
**How to avoid:** Make `/api/mobile/pricing` the source of per-device prices for all 9 counts (2–10), and have the client multiply the returned unit price by device count for preview; never preview from a hardcoded base.

### Pitfall 5: Payment chips cannot map 1:1 to Platega methods
**What goes wrong:** Assuming МИР/VISA/MC are separate provider methods and wiring each chip to a `paymentMethod` code.
**Why it happens:** Platega's numeric codes are `2` SBP QR, `11` bank cards, `12` international cards, `13` crypto, `14` SberPay, `3` ЕРИП — no brand-level codes. [CITED: docs.platega.com/создание-платежной-ссылки-с-заданным-методом-29203843e0]
**How to avoid:** Treat chips as persisted UI state (REQ-SHOP-04 says "selection persists", not "provider binding"); if binding is required, extend `CreateOrderInput` deliberately — it currently has no method field. [VERIFIED: lib/orders-service.ts:73-101]

### Pitfall 6: Provider metadata requirements for Telegram-only users
**What goes wrong:** Platega docs mark `metadata.user_email` as required; the current client omits it when the user has no email. [VERIFIED: lib/orders-service.ts:285-292; CITED: docs.platega.com/...29203843e0]
**Why it happens:** v2 endpoint shape diverges from v1 docs; the existing web integration apparently tolerates omission, but nothing is proven without test credentials.
**How to avoid:** Do not change the shared `createOrder` behaviour in this phase; record as a UAT check with real test credentials rather than inventing a synthetic email (the code deliberately avoids antifraud-looking fakes).

### Pitfall 7: Stale WebView dependency
**What goes wrong:** `flutter_inappwebview` stable is 6.1.5 from 2024 while the project runs Flutter 3.50.1; Android Gradle / iOS API drift can break the build even though SDK constraints nominally match. [CITED: pub.dev/api/packages/flutter_inappwebview]
**Why it happens:** A prerelease line (6.2.0-beta.x) continued development while stable stayed old.
**How to avoid:** Pin `6.1.5`, run `flutter pub get`, `flutter analyze`, an Android debug build and an iOS compile at the start of the WebView task; escalate to a human checkpoint if either fails.

### Pitfall 8: Simulation creep from the prototype
**What goes wrong:** Copying `sleep`-based payment success, fake prices, demo confetti or `localStorage` state into Flutter.
**Why it happens:** The prototype is fully simulated and is the visual source. [CITED: .planning/seeds/SEED-001-mobile-client-karing.md:48-55, `.planning/seeds/prototype-mobile-client.html:589-866`]
**How to avoid:** Success must come only from the DB order status written by the webhook/outbox; confetti is triggered by `CONFIRMED`/`provisioned`, never by a timer.

## Code Examples

Verified patterns from source (all values appear in the verbatim quotes above):

### Thin payment-create wrapper (backend skeleton)

```ts
// Source pattern: app/api/orders/route.ts:98-143 + app/api/mobile/config/route.ts:43-121
// MY-CODE marker: field NAMES below are proposed contract, not in-repo values -> [ASSUMED]
const parsed = bodySchema.safeParse(await req.json()); // zod at the boundary
if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
const result = await createOrder({
  userId: claims.userId,
  kind: parsed.data.kind,        // "new" | "renew" | "upgrade"  (quoted above)
  days: parsed.data.days,
  devices: parsed.data.devices,  // mobile zod bound 2..10 (D-02)
  keyId: parsed.data.keyId ?? null,
  promoCode: parsed.data.promoCode ?? null,
  channel: "web",                // "web" | "bot" (quoted above) -> site merchant
});
if (result.kind === "provider_error") {
  return NextResponse.json({ ok: false, error: result.code }, { status: 502 });
}
// result.order.id is our order id; result.url is the Platega payment_url.
return NextResponse.json({ ok: true, orderId: result.order.id, paymentUrl: result.url });
```

### Status poll (backend, DB-only)

```ts
// Source pattern: app/api/orders/[orderId]/route.ts:22-55
const order = await loadOrderForUserId(claims.userId, parsedOrderId);
if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
// status is the OrderStatus union quoted above; never expose plategaTxId/paymentUrl here.
return NextResponse.json({ ok: true, status: order.status, paidAt: order.paidAt,
                           provisionedKeyId: order.provisionedKeyId });
```

### Server-side grace derivation (new pure helper — values `24h`/`graceUntil` are `[ASSUMED]` pending Q1)

```ts
// Uses StatusKind + DAY_MS quoted above; 24h is D-10, not present in repo today.
const GRACE_MS = 24 * 86_400_000; // [ASSUMED] new constant, D-10
const statusKind = deriveStatusKind(key.status, key.expiresAt); // quoted above
const graceUntil = statusKind === "expired" && key.expiresAt
  ? new Date(new Date(key.expiresAt).getTime() + GRACE_MS).toISOString()
  : null;
const inGrace = graceUntil !== null && Date.now() < new Date(graceUntil).getTime();
```

### Ring painter geometry (prototype parity)

```dart
// Prototype values [CITED: prototype-mobile-client.html:359,808]: r=56, dasharray 351.86,
// offset = 351.86 * (1 - min(days/30, 1)). D-13 locks CustomPainter, no flutter_svg.
final progress = (days / 30).clamp(0.0, 1.0);
final dashOffset = 351.86 * (1 - progress);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-quote `/api/pricing?days=&devices=` | Batched `/api/mobile/pricing` (one response with 5 terms) | Phase 21 (new) | One round trip for the shop; same `resolveTariffQuote` source prevents price drift |
| Flutter `createPaymentProvider` mock URL | `POST /api/mobile/payments/create` → real Platega `payment_url` | Phase 21 | No simulation; real money path |
| Static `pricingPlansProvider` prices in Dart | Server-delivered prices, Dart model preview only | D-01 | Price changes ship without app release |
| Poll Platega as primary flow | Webhook → outbox → worker; poll only reflects DB | D-06/D-07 established earlier | Idempotent issuance; no double key |
| `keys: []` subscription stub | Owned-key aggregation + derived grace | Phase 21 | Entitlement becomes real |

**Deprecated/outdated:** none newly deprecated. Do not use `/api/mobile/keys/issue|renew` (never existed); do not reintroduce `next-pwa`/Workbox or bottom navigation (rejected in phases 19/20).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `flutter_inappwebview` stable `6.1.5` builds and runs on Flutter 3.50.1 / Android + iOS targets | Standard Stack, Pitfall 7 | WebView task blocked; need beta pin, plugin swap or escalation — invalidates D-05 implementation |
| A2 | Mobile Platega merchant should be `"site"` (default) because `hasBotMerchant()` is not proven configured | Open Questions Q4 | Merchant mismatch at callback → order never settles (webhook acks but does not transition) |
| A3 | Payment chips are presentation-only and need no `paymentMethod` in `createOrder` | Pitfall 5, Open Questions Q2 | Chosen method ignored by Platega; user confusion at hosted page |
| A4 | 24h grace can be derived as `expiresAt + 24h` for non-trial keys and shared with `/servers`/`/config` | Pitfall 3, Open Questions Q1 | If ARTEMIDA itself already enforces grace, double-granting access; if gates stay unchanged, UI/entitlement disagree |
| A5 | JSON field names (`paymentUrl`, `orderId`, `statusKind`, `graceUntil`, `deviceLimit`, etc.) are chosen by this phase | Everywhere marked `[ASSUMED]` | Client/server contract mismatch until aligned in one plan task |
| A6 | Platega v2 `/transaction/process` tolerates omitted `metadata.user_email` for Telegram-only accounts as the current code does | Pitfall 6 | Payment creation rejected 400 in UAT; needs credential-backed fix |
| A7 | REQ-BE-05 is satisfied by the existing worker/outbox and needs no new route | Phase Requirements | A literal reading would add a duplicate issuer — must be confirmed by the planner/user |

## Open Questions

1. **Does 24h grace actually grant connection, or is it display-only?**
   - What we know: D-10 explicitly says «подключение разрешено в grace»; `StatusKind` has no grace state and `/servers`/`/config` reject `expired` and four raw statuses. [VERIFIED: lib/keys-service.ts:27-65; app/api/mobile/servers/route.ts:16-38]
   - What's unclear: whether ARTEMIDA keeps the key usable after expiry, and whether phases 19/20 gates may be modified.
   - Recommendation: implement one shared server-side predicate (`statusKind` + `graceUntil`) in a new pure helper, use it in `/subscription` AND import it into `isActiveKey`; add ±1ms boundary fixtures at exactly `expiresAt + 24h`. Confirm with the user at a blocking checkpoint before changing the locked gate.

2. **Do payment chips bind to a Platega `paymentMethod`?**
   - What we know: REQ-SHOP-04 only requires persistence; Platega codes are 2/3/11/12/13/14 and cannot express МИР vs VISA vs MC. [CITED: docs.platega.com/...29203843e0]
   - What's unclear: product intent of the chips.
   - Recommendation: treat as UI-only this phase; if binding is wanted, extend `CreateOrderInput` with `paymentMethod` and map МИР/VISA/MC → 11, SBP → 2, CRYPTO → 13 in one explicit place.

3. **What exactly is `{id}` in `/payments/status/{id}` — our order id or the provider transaction id?**
   - What we know: `loadOrderForUserId(userId, orderId)` exists and is the ownership-safe read; `plategaTxId` is deliberately dropped from history rows. [VERIFIED: lib/orders-service.ts:421-429, 447-462]
   - Recommendation: use our `order.id` for polling; never expose `plategaTxId`.

4. **Which Platega merchant for mobile orders?**
   - What we know: `channel: "web"` resolves to `"site"` unless a bot merchant is configured; callback requires the calling merchant to match `order.plategaMerchant`. [VERIFIED: lib/orders-service.ts:214-218; app/api/platega/callback/route.ts:93-105]
   - Recommendation: default `channel: "web"` → `"site"`; keep header-verification compatibility; revisit only when test credentials arrive (agent discretion in D-04).

5. **Where to store the pending order id for resume?**
   - What we know: `flutter_secure_storage ^11.2.0` is already used for tokens; Drift is used for ping cache. [VERIFIED: mobile/pubspec.yaml:21, 15]
   - Recommendation: store only the order id (a non-secret identifier) in secure storage under a dedicated key; clear it on terminal status. Do not store `paymentUrl` or any token.

6. **API envelope for the new routes: `{ok, ...}` or bare `{...}`?**
   - What we know: `/servers` and `/config` use `{ok:false,error}` with 200 for provider errors; `/orders` uses bare `{url}` and HTTP error statuses. [VERIFIED: app/api/mobile/servers/route.ts:48-62; app/api/orders/route.ts:112-143]
   - Recommendation: follow the `/servers`/`config` envelope for all new mobile routes so the Flutter error mapper has one shape; this is explicitly agent discretion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js BFF routes + vitest | ✓ | v24.15.0 | — |
| npm | install/run backend scripts | ✓ | 11.12.1 | — |
| Flutter SDK | Shop UI, WebView, `flutter test`/`analyze` | ✓ | 3.50.1 stable (2026-11-18) | — |
| Dart SDK | `mobile/pubspec.yaml` | ✓ | 3.14.0 stable (satisfies `^3.14.0`) | — |
| PostgreSQL (`psql`) | DB-backed vitest suites, orders/outbox | ✓ | client 16.15 (server version not probed; project targets 17-alpine) | local DB required for DB-backed tests |
| Docker | `docker compose` deploy path | ✓ | 29.9.3 | — |
| Redis | Not required — BullMQ explicitly out of scope | ✗ | — | None needed |
| `flutter_inappwebview` | D-05 WebView | ✗ not yet installed | target 6.1.5 | Human checkpoint if build fails |
| Platega test credentials | Real payment UAT | ✗ | — | Source-level + fake-fetch tests only; external blocker in `STATE.md` |
| Context7 MCP / `ctx7` CLI | Official doc lookup seam | ✗ | — | Used official docs via websearch/webfetch/curl; confidence downgraded accordingly |

**Missing dependencies with no fallback:** Platega test credentials (external blocker; do not simulate payments). Apple NetworkExtension entitlement and GPL legal review are inherited blockers recorded in `STATE.md` — record, do not solve in this phase.

**Missing dependencies with fallback:** Context7 → official docs via web tools; `package-legitimacy` pub support → pub.dev metadata + human checkpoint.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (backend) + `flutter test` (mobile) |
| Config file | `vitest.config.ts` (`fileParallelism: false`, `include: ['tests/**/*.test.ts']`, dummy env) |
| Quick run command | `npx vitest run tests/unit/<file>.test.ts -x` |
| Full suite command | `npm test` (= `vitest run tests/unit`, 115 test files present) + `cd mobile && flutter test && flutter analyze` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-SUB-01 | `/subscription` aggregates owned key + link + devices | unit (mocked services) | `npx vitest run tests/unit/mobile-subscription-route.test.ts -x` | ❌ Wave 0 |
| REQ-SUB-02 | No active key → 403 / shop redirect | unit | `npx vitest run tests/unit/mobile-servers-route.test.ts -x` | ✅ |
| REQ-SUB-03 | `daysUntilExpiry`, ring geometry | unit (Dart) | `cd mobile && flutter test test/unit/features/subscription/ -x` | ❌ Wave 0 |
| REQ-SUB-04 | deviceLimit surfaced from key | unit | `npx vitest run tests/unit/keys-service.test.ts -x` | ✅ |
| REQ-SUB-05 | copy link uses `Clipboard.setData` | widget (Dart) | `cd mobile && flutter test test/widget/features/shop/ -x` | ❌ Wave 0 |
| REQ-SUB-06 | grace boundary ±1ms, banner | unit | `npx vitest run tests/unit/subscription-grace.test.ts -x` | ❌ Wave 0 |
| REQ-SHOP-01/07 | 5 locked prices, confetti trigger | unit + widget | `npx vitest run tests/unit/tariff-markup.test.ts -x` + `flutter test test/widget/features/shop/` | ✅ / ❌ |
| REQ-SHOP-02/03/05 | stepper bounds, promo preview, live sum | widget (Dart) | `cd mobile && flutter test test/widget/features/shop/shop_screen_test.dart -x` | ❌ Wave 0 |
| REQ-SHOP-04 | chip selection persists | widget (Dart) | same as above | ❌ Wave 0 |
| REQ-SHOP-06 | create → WebView → poll 3s/5min, resume | unit (Dart + mocked Dio) | `cd mobile && flutter test test/unit/core/payment/ -x` | ❌ Wave 0 |
| REQ-SHOP-08 | trial → 409, UI hides renew | unit | `npx vitest run tests/unit/orders-trial.test.ts -x` (existing trial tests) | ✅ |
| REQ-BE-03/04 | route contracts, ownership 404 | unit | `npx vitest run tests/unit/mobile-subscription-route.test.ts tests/unit/mobile-payments-route.test.ts -x` | ❌ Wave 0 |
| REQ-BE-05 | no duplicate issuer | unit (worker/outbox) | `npx vitest run tests/unit/worker.test.ts -x` | ✅ (existing worker tests) |
| REQ-BE-07 | webhook idempotency | unit | `npx vitest run tests/unit/platega-callback.test.ts -x` | ✅ (verify exact filename in Wave 0) |

### Sampling Rate

- **Per task commit:** targeted vitest file(s) + `flutter analyze` for Dart changes.
- **Per wave merge:** `npm test` + `cd mobile && flutter test`.
- **Phase gate:** full suites green before `/gsd-verify-work`; real payment UAT remains human/blocked.

### Wave 0 Gaps

- [ ] `tests/unit/mobile-subscription-route.test.ts` — REQ-SUB-01 / REQ-BE-03
- [ ] `tests/unit/mobile-payments-route.test.ts` — REQ-BE-04 (create/status mapping, trial 409, ownership 404)
- [ ] `tests/unit/mobile-pricing-route.test.ts` — D-01/D-02/D-03 (5 terms, 2–10 bounds, provider-error mapping)
- [ ] `tests/unit/subscription-grace.test.ts` — REQ-SUB-06 boundary fixtures
- [ ] `mobile/test/unit/core/payment/` — poll service + pending-order continuation
- [ ] `mobile/test/widget/features/shop/shop_screen_test.dart` — REQ-SHOP-01..08 UI
- [ ] Framework install: `cd mobile && flutter pub add flutter_inappwebview:6.1.5` behind `checkpoint:human-verify`

*(Backend tests use a real local Postgres per `vitest.config.ts:16-29`; ensure `DATABASE_URL` is set before the DB-backed suites.)*

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` in `.planning/config.json` — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `verifyAccessToken` on every new mobile route; no session in the webhook (header auth only) [VERIFIED: lib/mobile-auth.ts:44-76] |
| V3 Session Management | yes | Access token 15m / refresh 30d with rotation and `credentialsChangedAt` watermark [VERIFIED: lib/mobile-auth.ts:10-42, 61-70] |
| V4 Access Control | yes | `loadOrderForUserId` / `getKeyForUserId` ownership joins; missing and non-owned are both null/404 (no oracle) [VERIFIED: lib/orders-service.ts:421-429; lib/keys-service.ts:233-241] |
| V5 Input Validation | yes | zod at every route boundary; `devices` 2–10 on mobile; `days ∈ TARIFF_DAYS`; order id `min(1).max(200)` [VERIFIED: app/api/orders/route.ts:31-70; app/api/orders/[orderId]/route.ts:20] |
| V6 Cryptography | no (no new crypto) | Reuse existing JWT HS256 + timing-safe header comparison; never hand-roll [VERIFIED: lib/platega.ts:340-362] |

### Known Threat Patterns for Next.js + Flutter money path

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged Platega callback | Tampering / Spoofing | Timing-safe `X-MerchantId`/`X-Secret` check, merchant↔order match, mandatory server re-query [VERIFIED: app/api/platega/callback/route.ts:62-108] |
| Under/over-payment settlement | Tampering | `amountMatches` strict equality on re-queried amount **and** currency equality [VERIFIED: lib/orders-service.ts:69-71; callback/route.ts:143-160] |
| Duplicate key issuance | Tampering | Atomic `pending→paid` claim + UNIQUE `(orderId,type)` outbox + deterministic provider idempotency key [VERIFIED: lib/orders-service.ts:365-386, 493-495; lib/worker.ts:112-220] |
| IDOR on order/key read | Information disclosure | Ownership-joined reads; identical 404 for missing and non-owned [VERIFIED: lib/orders-service.ts:421-429] |
| Client price/discount spoof | Tampering | Server-quoted amount; promo validated + consumed server-side [VERIFIED: lib/orders-service.ts:148-202] |
| Secret/provider-text leakage to logs or client | Information disclosure | Stable outcome codes only; provider identifiers dropped from mapped rows [VERIFIED: lib/orders-service.ts:447-462; app/api/mobile/config/route.ts:116-120] |
| Stored secrets on device | Information disclosure | Only order id persisted; access/refresh tokens already in `flutter_secure_storage`; never plaintext subscription secret or payment URL |
| WebView content injection | Tampering | Open only the server-returned Platega `payment_url`; validate it is an https URL from the configured provider before navigation `[ASSUMED]` — add explicit validation in the WebView controller |

## Sources

### Primary (HIGH confidence)
- Source files read this session: `lib/orders-service.ts`, `lib/platega.ts`, `lib/payments.ts`, `lib/pricing.ts`, `lib/tariff-grid.ts`, `lib/promo.ts`, `lib/keys-service.ts`, `lib/outbox.ts`, `lib/worker.ts`, `lib/mobile-auth.ts`, `lib/servers-source.ts`, `prisma/schema.prisma`
- Route files read this session: `app/api/platega/callback/route.ts`, `app/api/pricing/route.ts`, `app/api/orders/route.ts`, `app/api/orders/[orderId]/route.ts`, `app/api/mobile/{subscription,servers,config}/route.ts`
- Flutter files read this session: `mobile/pubspec.yaml`, `mobile/lib/app/{router,theme}.dart`, `mobile/lib/features/shop/shop_screen.dart`, `mobile/lib/features/subscription/providers.dart`, `mobile/lib/core/api/endpoints.dart`
- Planning sources: `21-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `SEED-001`, `prototype-mobile-client.html`

### Secondary (MEDIUM confidence)
- `pub.dev/api/packages/flutter_inappwebview` — version, publish date, SDK constraints (queried via curl)
- `docs.platega.com` — `/transaction/process` request schema, `paymentMethod` numeric codes, required `metadata.user_email`, `/transaction/{id}` status check, callback statuses
- `gsd_run query classify-confidence --provider context7` → MEDIUM; `--provider websearch --verified` → MEDIUM (used for cached digests; Context7 MCP/CLI unavailable in this subagent)

### Tertiary (LOW confidence)
- `gsd_run query classify-confidence --provider websearch` → LOW (unverified web material)
- Flutter WebView navigation/deep-link specifics beyond the pub.dev metadata — no official Flutter/InAppWebView docs fetched in this session; `[ASSUMED]` where used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — backend versions and APIs read from source; Flutter/Dart versions probed; WebView dependency version from pub.dev (name `[ASSUMED]` because the seam cannot gate `pub`)
- Architecture: HIGH — the reuse contract (createOrder → webhook → outbox → worker) is fully present in read files; new route shapes are `[ASSUMED]` agent discretion
- Pitfalls: HIGH for backend idempotency/amount/ownership (source-proven); MEDIUM for Platega metadata and WebView build compatibility (needs credentials/device)

**Research date:** 2026-11-27
**Valid until:** 2026-12-27 (30 days; re-check `flutter_inappwebview` stable and Platega docs if the beta graduates)
