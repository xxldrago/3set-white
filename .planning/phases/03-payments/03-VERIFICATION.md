---
phase: 03-payments
verified: 2026-10-03T03:58:24Z
status: human_needed
score: 20/24 must-haves verified
behavior_unverified: 4
overrides_applied: 0
gaps: []
behavior_unverified_items:
  - truth: "SC1 live E2E: a real Platega card/СБП payment reaches CONFIRMED and the user receives a working subscription"
    test: "Run a live (test-merchant) payment through POST /api/orders → Platega hosted page → CONFIRMED callback; confirm the order reaches provisioned and the key is delivered"
    expected: "Order pending→paid→provisioning→provisioned with a real ARTEMIDA key; no live Platega test-mode payment has been executed (PLATEGA_* not in .env.local)"
    why_human: "Requires live Platega merchant credentials and a public callback URL; the full local pipeline is unit-tested against fakes (callback, worker, dispatch) but the provider integration is only exercised by a real payment"
  - truth: "SC1 bot half: after CONFIRMED the bot pushes the sub-link text + a server-generated QR photo to the owning chat"
    test: "Telegram: /start → Тарифы → days/devices → pay → Platega → receive bot.payProvisioned + sub-link + QR photo"
    expected: "One notify-provisioned push to the owning chat containing the sub-link and a PNG QR; verified by unit test with an injectable sender, not by a live Telegram client"
    why_human: "A real Telegram client + real/sandbox payment is needed to observe the push and the photo end-to-end"
  - truth: "Upgrade fulfillment against the real provider: POST /keys/{id}/upgrade success response shape"
    test: "After funding the ARTEMIDA account, call upgrade with {addDevices} and record the 2xx body"
    expected: "A 2xx body normalized by normalizeKeyResponse; the request/error shapes are locked but the success body is [UNOBSERVED] (balance exhausted by the paid create), and the prorated charge is locally derived"
    why_human: "The provider success body is unreachable without a funded account; the local upgrade transition is covered by a mocked test"
  - truth: "SC1 cabinet half: /payments/[orderId] polls every 3 s and, on provisioned, renders the Phase-2 sub-link + QR markup"
    test: "Browser: open a pending order, complete payment, observe the poller transition to provisioned and render the sub-link + CopyButton + QrSvg"
    expected: "Status chip advances to provisioned and the delivered sub-link + QR render; the polling/render path has no automated DOM/browser test"
    why_human: "Real-time polling, terminal transition and QR presentation are visual/browser behaviors"
coincidental_reliance_items: []
human_verification:
  - test: "Live Platega test-mode payment (or a sandbox equivalent) through the hosted page to CONFIRMED"
    expected: "Order reaches provisioned; a real ARTEMIDA key is minted once under order:<id>:new; one notify-provisioned row is consumed"
    why_human: "External service integration; PLATEGA_* is absent from .env.local, so only the fake-fetch pipeline was exercised"
  - test: "Live Telegram purchase → CONFIRMED → receive key text + QR photo"
    expected: "bot.payCreated URL button → Platega → bot.payProvisioned + sub-link + PNG QR to the owning chat"
    why_human: "Real Telegram client + real/sandbox payment; the dispatch path is unit-tested only"
  - test: "ARTEMIDA upgrade success response capture"
    expected: "A real 2xx body for POST /keys/{id}/upgrade {addDevices}, confirming normalizeKeyResponse maps the observed shape"
    why_human: "Provider success body is [UNOBSERVED] without a funded account"
  - test: "Browser cabinet pass: tariff → pay → return page polls → provisioned sub-link + QR; trial card shows no renew/upgrade; history empty/one/many + long-key ellipsis"
    expected: "Rendered DOM matches UI-SPEC; provider-free rows; trial cards render only key.buyCta"
    why_human: "Visual/state coverage has no DOM-level automated test"
---

# Phase 3: Payments Verification Report

**Phase Goal:** Пользователь платит картой/СБП и мгновенно получает рабочую подписку; продление и апгрейд работают тем же путём.
**Verified:** 2026-10-03T03:58:24Z
**Status:** human_needed (no gaps/blockers; 4 live/visual items flagged)
**Re-verification:** No — initial verification

**Mode note:** ROADMAP marks Phase 3 `Mode: mvp`, but the phase goal provided for this verification is an outcome statement, not an `As a … I want … so that …` user story, and the runtime resolved via `verify_context` explicitly asks for goal-backward verification. I therefore ran standard goal-backward verification rather than the MVP User-Flow-Coverage variant. No `gsd-tools` runtime is present in this repository.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | ARTEMIDA paid create/upgrade contract is OBSERVED; `createKey` exists with a caller-supplied idempotency key; no API-key material in artifacts | ✓ VERIFIED | `docs/artemida-v1-contract.md` (13× OBSERVED, create/upgrade sections), probe JSONs contain no 40+ char secrets; `lib/artemida.ts:572` `createKey`, `:502` `Idempotency-Key = opts.idempotencyKey ?? randomUUID()` |
| 2 | Order/Outbox models + state machine exist in the live DB after a blocking migration | ✓ VERIFIED | `prisma/schema.prisma:74-116`; migration `prisma/migrations/20261002221407_payments`; `prisma.order`/`prisma.outbox` exercised by DB-backed tests |
| 3 | `POST /api/orders` is session-gated, re-quotes server-side, persists a pending order, returns a hosted URL | ✓ VERIFIED | `app/api/orders/route.ts:66-110`; `lib/orders-service.ts:78-154` (order persisted before Platega call, server quote) |
| 4 | The callback authenticates by timing-safe header compare, re-queries Platega, and requires CONFIRMED + amount/currency equality before pending→paid | ✓ VERIFIED | `app/api/platega/callback/route.ts:43-101`; `lib/platega.ts:289-311` timing-safe; tests `callback-route.test.ts:152-167,139-150` |
| 5 | A forged callback, a non-CONFIRMED status, or an amount mismatch never provisions | ✓ VERIFIED | `callback-route.test.ts:92-137` (401/no transition, PENDING/mismatch no transition); callback never imports/calls ARTEMIDA |
| 6 | A duplicate CONFIRMED delivery yields exactly one transition and exactly one outbox row | ✓ VERIFIED | `lib/orders-service.ts:301-308` atomic claim + idempotent upsert; `callback-route.test.ts:169-184`; `outbox.ts:24-30` UNIQUE `(orderId,type)` |
| 7 | A lost create response is recoverable via `payload=orderId` when `plategaTxId` is unknown | ✓ VERIFIED | `lib/orders-service.ts:209-221`; `callback-route.test.ts:186-201` |
| 8 | Platega credentials are read only from `lib/env.ts`, with the test/prod switch env-only (no code branch) | ✓ VERIFIED | `lib/platega.ts:182-186` reads `env.PLATEGA_*`; `lib/env.ts:21-23`; no mode branch in code |
| 9 | The outbox worker provisions `paid→provisioned` asynchronously; retryable ARTEMIDA errors back off and the order is never left indefinitely unprocessed | ✓ VERIFIED | `lib/worker.ts:84-125,164-195`; `outbox-worker.test.ts:99-128,139-173` |
| 10 | Fulfillment retries pass deterministic `Idempotency-Key order:{orderId}:{kind}`; 402/exhausted attempts → `failed` + exactly one notify-failed row | ✓ VERIFIED | `lib/worker.ts:140,176-203`; `outbox-worker.test.ts:139-173,175-216`; `order-service.test.ts:232-258` |
| 11 | The worker starts exactly once from `instrumentation.ts`, gated to Node/non-build; an hourly reconcile re-queries pending orders and recovers a lost callback without provisioning inline | ✓ VERIFIED | `instrumentation.ts:11-21`; `lib/worker.ts:305-374`; `order-service.test.ts:127-190` (incl. "never provisions inline") |
| 12 | Renew/upgrade ride the SAME order→Platega→outbox→worker pipeline, branching only on `order.kind`; `upgradeKey` posts the observed `{addDevices}` | ✓ VERIFIED | `lib/worker.ts:132-162`; `lib/artemida.ts:622-628`; `order-service.test.ts:193-229`; `artemida-client.test.ts:330-350,406-415` |
| 13 | Trial renew/upgrade are rejected server-side with a clean 409 signal; non-owned keys are 404 (no oracle); trial keys render no renew/upgrade UI | ✓ VERIFIED | `app/api/orders/route.ts:142-167`; `lib/orders-service.ts:40-45,174-182`; `order-route.test.ts:174-205,240-266`; `SubscriptionCard.tsx:68-77`; `bot.ts:400-407` |
| 14 | `GET /api/orders/[orderId]` is session-gated/ownership-joined; non-owned ≡ missing (identical 404) and no provider field is serialized | ✓ VERIFIED | `app/api/orders/[orderId]/route.ts:22-56`; `order-status-route.test.ts:121-177` |
| 15 | Payment history is read entirely from our DB (no live Platega); rows expose amount/status/date/kind+key and a null keyId yields a partial row | ✓ VERIFIED | `lib/orders-service.ts:242-281`; `order-history.test.ts:106-205`; no `platega.getTransaction` on the read path |
| 16 | Cabinet PayCta creates an order via the BFF (intent only, no price), locks in flight, and redirects same-tab; the provider URL is never stored in state | ✓ VERIFIED | `components/PayCta.tsx:42-63`; `TariffPicker.tsx:164-165` (`disabled={price === null}`) |
| 17 | The `/payments` history page renders DB rows with empty/one/many states and long-key ellipsis; linked from the home page | ✓ VERIFIED | `app/payments/page.tsx`, `PaymentHistoryList.tsx:51-109`, `app/page.tsx:140-141` (`pay.toHistory`) |
| 18 | Bot supports pay/renew/upgrade entry via an inline Platega URL button and a history menu reply with caller-only rows, capped under 4096 | ✓ VERIFIED | `lib/bot.ts:235-314,247-258`; `lib/bot-payments.ts:95-118`; `bot-payments.test.ts:82-112`; `i18n.test.ts` key gate |
| 19 | The worker consumes `notify-provisioned`/`notify-failed` and pushes the sub-link + PNG QR (or failure copy) to the owning chat exactly once | ✓ VERIFIED | `lib/worker.ts:216-263`; `lib/bot-payments.ts:175-220`; `bot-payments.test.ts:139-283` (owning chat, done/pending/reschedule) |
| 20 | Every visible payment string resolves through `t()`; no raw Platega/ARTEMIDA status, id, or error renders | ✓ VERIFIED | `PaymentStatusChip.tsx`, `OrderStatusPanel.tsx:35-43`, `bot-payments.ts:55-86`; `i18n.test.ts:67-76`; grep found no `plategaTxId`/`paymentUrl` in components/bot |
| 21 | **SC1 live E2E** — real Platega payment to CONFIRMED delivers a working subscription | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Pipeline present + wired + locally tested (fakes); no live test-mode payment run (no creds) — see Human Verification |
| 22 | **SC1 bot half live** — bot pushes sub-link + QR after CONFIRMED | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `dispatchNotification` unit-tested with injectable sender; live Telegram flow manual — see Human Verification |
| 23 | **Upgrade provider success body** | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Request/error locked; success body `[UNOBSERVED]` (balance exhausted); local transition mocked-tested — see Human Verification |
| 24 | **SC1 cabinet half live** — `/payments/[orderId]` polls to terminal and renders sub-link + QR | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Poller/render code present; no automated DOM/browser test — see Human Verification |

**Score:** 20/24 truths verified (4 present, behavior-unverified — 0 failed)

### Deferred Items

None. No gap was deferred to a later milestone phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/platega.ts` | single Platega network point | ✓ VERIFIED | 314 lines; create/get/verify; create never auto-retried |
| `lib/orders-service.ts` | create/transition/resolve/history | ✓ VERIFIED | 384 lines; atomic `updateMany` claims; provider-free mapper |
| `lib/outbox.ts` | idempotent enqueue + atomic claim | ✓ VERIFIED | 121 lines; UNIQUE `(orderId,type)` upsert; `updateMany` state writes |
| `lib/worker.ts` | singleton worker + reconcile + notify consumer | ✓ VERIFIED | 375 lines; guarded loops; deterministic idempotency |
| `lib/artemida.ts` | createKey + idempotency + upgrade quote | ✓ VERIFIED | `createKey` `:572`, `upgradeKey {addDevices}` `:622`, `deriveUpgradeQuote` `:237` |
| `app/api/orders/route.ts` | session-gated create + kind pre-checks | ✓ VERIFIED | 189 lines |
| `app/api/platega/callback/route.ts` | public header-verified callback | ✓ VERIFIED | 116 lines; verify→parse→requery→match→claim |
| `app/api/orders/[orderId]/route.ts` | ownership-joined status | ✓ VERIFIED | 57 lines |
| `app/api/cron/reconcile/route.ts` | secret-gated reconcile | ✓ VERIFIED | 46 lines; 503 when `CRON_SECRET` unset |
| `app/api/pricing/route.ts` | live quote + upgrade quote mode | ✓ VERIFIED | 100 lines |
| `prisma/schema.prisma` + `20261002221407_payments` | Order/Outbox + enums | ✓ VERIFIED | lines 51-116; unique tx id / `(orderId,type)` |
| `components/PayCta.tsx` | create-order CTA + redirect | ✓ VERIFIED | 86 lines |
| `components/OrderStatusPanel.tsx` | status panel + 3s poller | ✓ VERIFIED | 211 lines |
| `components/PaymentStatusChip.tsx` | single status→label/tint map | ✓ VERIFIED | 79 lines |
| `components/PaymentHistoryList.tsx` | history rows + states | ✓ VERIFIED | 111 lines |
| `components/RenewPanel.tsx` / `UpgradePanel.tsx` | live-quote mutation panels | ✓ VERIFIED | 161 / 165 lines |
| `app/payments/page.tsx` / `[orderId]/page.tsx` | session-gated RSCs | ✓ VERIFIED | 86 / 77 lines |
| `lib/qr.ts` | SVG + PNG QR renderers | ✓ VERIFIED | 49 lines; PNG signature test |
| `lib/bot-payments.ts` | pure builders + dispatch | ✓ VERIFIED | 221 lines |
| `lib/bot.ts` | payment entry + history | ✓ VERIFIED | `tariff:buy` `:235`, renew/upgrade `:266-314`, history `:247` |
| `lib/i18n/messages/ru.ts` | pay./renew./upgrade./bot.* keys | ✓ VERIFIED | nested dictionary; i18n completeness gate green |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `PayCta` | `POST /api/orders` | `fetch('/api/orders')` | ✓ WIRED | `PayCta.tsx:46` |
| `OrderStatusPanel` | `GET /api/orders/[orderId]` | `fetch` every 3 s | ✓ WIRED | `OrderStatusPanel.tsx:93` |
| `RenewPanel`/`UpgradePanel`/`TariffPicker` | `GET /api/pricing` | `fetch` | ✓ WIRED | `RenewPanel.tsx:51`, `UpgradePanel.tsx:51`, `TariffPicker` |
| `POST /api/orders` | DB + Platega | `createOrder` → `prisma.order.create` / `platega.createTransaction` | ✓ WIRED | `orders-service.ts:114-146` |
| callback | outbox | `applyConfirmedPayment` → `enqueueFulfillOrder` | ✓ WIRED | `callback/route.ts:101` → `orders-service.ts:301-308` |
| worker | outbox (notify) | `enqueueNotifyProvisioned`/`enqueueNotifyFailed` → producer | ✓ WIRED | `worker.ts:119,202` |
| worker notify consumer | Telegram owning chat | `dispatchNotification` → `getSubscriptionForUser` | ✓ WIRED | `worker.ts:251`, `bot-payments.ts:189-205` |
| `GET /api/orders/[orderId]` | DB (ownership join) | `loadOrderForUser` | ✓ WIRED | `route.ts:44` |
| `/payments/[orderId]` RSC | delivered sub-link + QR | `getSubscriptionForUser` + `renderSubscriptionQr` | ✓ WIRED | `page.tsx:28-46` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `PaymentHistoryList` | `rows` | `listOrdersForUser` → `prisma.order.findMany` | Yes | ✓ FLOWING |
| `OrderStatusPanel` | `order` / polled status | `loadOrderForUser` + `GET /api/orders/[orderId]` | Yes | ✓ FLOWING |
| `/payments/[orderId]` delivered | `subscriptionUrl` / `qr` | `artemida.getSubscriptionLinks` (cache fallback) | Yes (live provider; cache fallback) | ✓ FLOWING |
| bot history reply | rows | `listOrdersForUser` | Yes | ✓ FLOWING |
| bot provisioned push | `subscriptionUrl` | `getSubscriptionForUser` (ownership-joined) | Yes | ✓ FLOWING |

No static/hardcoded/mock data path found on any read surface.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full unit suite (DB-backed, real Postgres) | `DATABASE_URL=… npx vitest run tests/unit` | 21 files / **169 passed** | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Production build | `npm run build` (dummy inline env) | compiled successfully; `/payments`, `/payments/[orderId]`, `/api/orders`, `/api/orders/[orderId]`, `/api/platega/callback`, `/api/cron/reconcile` all present (dynamic) | ✓ PASS |
| Forged callback rejected | `callback-route.test.ts` "returns 401 for forged headers…" | 401, no transition, no outbox | ✓ PASS |
| Duplicate CONFIRMED idempotency | `callback-route.test.ts` "is idempotent…" | one transition, one outbox row | ✓ PASS |
| Deterministic retry key | `outbox-worker.test.ts` "reuses the SAME Idempotency-Key" | `order:<id>:new` reused | ✓ PASS |
| Trial/403/404 order gating | `order-route.test.ts` | 409 `{error:'trial'}`, 404 no oracle, no provider call | ✓ PASS |
| IDOR isolation (status/history) | `order-status-route.test.ts`, `order-history.test.ts` | foreign order absent; identical 404 | ✓ PASS |

### Probe Execution

Not applicable. This is not a migration/CLI phase and no `scripts/*/tests/probe-*.sh` exist. The owner-gated `scripts/artemida-probe.mjs` is the phase's probe mechanism; its output artifacts (`docs/artemida-v1-contract-create-probe.json`, `docs/artemida-v1-contract-upgrade-probe.json`) were inspected and contain no secret material. The live probe is a one-shot owner-run capture (recorded `[UNOBSERVED]` upgrade body), not a repeatable verifier probe.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PAY-01 | 03-01, 03-02, 03-03, 03-06, 03-07 | Pay via Platega; instant sub-link + QR after CONFIRMED | ✓ SATISFIED | capture pipeline, outbox worker, cabinet + bot delivery paths (live E2E human-flagged) |
| PAY-02 | 03-04, 03-06 | Renew non-trial key via same pipeline | ✓ SATISFIED | `createMutationOrder` + worker renew branch + RenewPanel |
| PAY-03 | 03-01, 03-04, 03-06 | Buy additional devices; trial buttons hidden | ✓ SATISFIED | upgrade branch `{addDevices}`, upgrade quote, UpgradePanel, trial gating |
| PAY-04 | 03-05, 03-06, 03-07 | Payment history (amount, status, date) | ✓ SATISFIED | `listOrdersForUser` + `toHistoryRow`, history page + bot menu |

**Orphaned requirements:** none. All Phase-3 REQUIREMENTS IDs (PAY-01..04) appear in at least one PLAN `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `lib/orders-service.ts` | 301-308 | `applyConfirmedPayment` — if `enqueueFulfillOrder` throws after a successful `pending→paid` claim, the callback (or reconcile) catches and acks 200, leaving a `paid` order with no fulfill job; `listReconcilableOrders` only scans `pending`, so no recovery path picks it up | ⚠️ WARNING | Narrow crash-consistency hazard: a transient DB error exactly between the claim and the enqueue could strand a paid order without delivery. Not a must-have failure (the enqueue is a same-DB upsert immediately adjacent), but worth a follow-up sweep for `paid` orphans. No fix required to pass. |
| `lib/bot.ts` | 266-314 | `key:renew:{index}` / `key:upgrade:{index}` re-read `listKeys` and index into it; if the cached order changed since the message, the wrong same-user key could be targeted | ℹ️ Info | No cross-user risk (`precheckOwnedKey` enforces ownership); minor UX risk of targeting a different key of the same user. Pre-existing index-callback pattern. |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`), no `console.log`, and no raw provider data on user surfaces in any phase-modified file.

### Human Verification Required

### 1. Live Platega test-mode payment

**Test:** With test-merchant credentials + a public callback URL, create an order from the cabinet, pay on the Platega hosted page, and let the callback fire.
**Expected:** Order advances `pending→paid→provisioning→provisioned`; ARTEMIDA key minted once under `order:<id>:new`; one `notify-provisioned` row consumed; cabinet shows sub-link + QR.
**Why human:** External service integration; `PLATEGA_*` is absent from `.env.local` — only the fake-fetch pipeline was exercised.

### 2. Live Telegram bot flow

**Test:** `/start → Тарифы → days/devices → pay →` complete payment `→` observe the bot push.
**Expected:** `bot.payCreated` with a Platega URL button, then after CONFIRMED `bot.payProvisioned` + sub-link text + PNG QR photo to the owning chat.
**Why human:** Real Telegram client + real/sandbox payment; only `dispatchNotification` is unit-tested.

### 3. ARTEMIDA upgrade success body

**Test:** Fund the ARTEMIDA account and call `POST /keys/{id}/upgrade {addDevices}`.
**Expected:** A 2xx body that `normalizeKeyResponse` maps (field names for id/status/expiry/devices/subscriptionUrl).
**Why human:** Success body is `[UNOBSERVED]` (balance exhausted by the paid create); request/error shapes are locked and the local transition is mocked-tested.

### 4. Cabinet browser pass (polling + trial DOM + history states)

**Test:** Open a pending order and complete payment; inspect a trial card and a non-trial card; open `/payments` with 0/1/≥2 rows and a long key id.
**Expected:** Return page polls every 3 s to terminal and renders the sub-link + QR; trial card shows only «Купить подписку» with no renew/upgrade in the DOM; non-trial card shows both; history renders empty/single/count-header states with ellipsis + title.
**Why human:** Visual/state + real-time polling coverage has no DOM-level automated test.

### Gaps Summary

No gaps and no blockers. The Phase-3 money path is implemented end-to-end in the codebase and is exercised by 169 green unit/DB tests: capture (order → Platega → verified callback → paid + one outbox row), async fulfillment (deterministic idempotency key, retryable backoff, terminal failure + notify), the shared renew/upgrade pipeline, ownership-joined status/history reads with no provider leakage, the cabinet payment surfaces, and the bot parity + QR push consumer. `tsc --noEmit` and the production build are clean.

The 4 flagged items are live/visual/third-party behaviors that cannot be exercised without credentials or a browser — all code paths are present, wired, and validated with fakes. They are recorded as `behavior_unverified_items` and routed to human/UAT verification; none is a must-have failure. One non-blocking WARNING (paid-order orphan window in `applyConfirmedPayment`) is noted for a possible follow-up sweep.

---

_Verified: 2026-10-03T03:58:24Z_
_Verifier: the agent (gsd-verifier)_
