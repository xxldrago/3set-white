# API Coverage — ARTEMIDA Paid API V1 + Platega (Phase 21)

> Full coverage by default. Every OPT-OUT is a reasoned decision, not an oversight.
> Scope: the mobile purchase flow in Phase 21. Capabilities owned by earlier phases or explicitly deferred are recorded as opt-outs with their owning phase.

The phase integrates two external services through the existing backend: ARTEMIDA (`https://artemida.cc/v1`, Bearer + `Idempotency-Key`, server-only) and Platega (hosted payment page + callback). The client never holds either credential and never calls either service directly. The money pipeline is deliberately single-path: `createOrder` → `Order(pending, payload=order.id)` → Platega URL → shared webhook → `applyConfirmedPayment` → one outbox row → `worker.processFulfillOrder` → ARTEMIDA `keys.issue|renew|upgrade`. Key issuance is never duplicated by a client-callable route (REQ-BE-05 superseded; D-04/D-07).

## ARTEMIDA Paid API V1

| capability | decision | reason |
|---|---|---|
| `GET /pricing` (quote / markups) | INTEGRATE | Server-side via `resolveTariffQuote`, exposed as batched `GET /api/mobile/pricing`; client never calls ARTEMIDA directly (D-01) |
| `GET /keys` (list owned keys) | INTEGRATE | `listKeysByUserId` feeds `/api/mobile/subscription` and the shared active-key gate |
| `GET /keys/{id}` subscription links | INTEGRATE | `getSubscriptionForUserId(userId, active.id)` supplies link and devices in `/subscription` |
| `keys.issue` | INTEGRATE | Via the existing webhook → outbox → worker only; no second client-callable issuer (REQ-BE-05 superseded) |
| `keys.renew` | INTEGRATE | Via `createOrder(kind: renew)` → webhook → outbox → worker; trial precheck returns a clean 409 |
| `keys.upgrade` | INTEGRATE | Via `createOrder(kind: upgrade)` → webhook → outbox → worker; no new mobile route |
| `GET /wallet` (balance) | OPT-OUT | Not needed by the mobile purchase flow; balance is an existing web/bot capability and no client route exposes it here |
| Traffic / usage counters | OPT-OUT | Owned by Phase 20 connected panel from live libbox counters; phase 21 does not reintroduce a second traffic source |
| Device add / remove | OPT-OUT | Explicitly Phase 22 scope (`REQ-DEV-01..05`); phase 21 only surfaces `deviceLimit` and `devices[]` |
| Permanent key delete | OPT-OUT | Destructive, non-refundable operation; deliberately absent from the mobile client (project constraint) |
| Trial state derivation | INTEGRATE | `isTrial` from `RenderedKey` plus `isTrialConflict` feeds `/subscription` and the trial precheck; UI hides renew/upgrade |

## Platega

| capability | decision | reason |
|---|---|---|
| Create transaction (`/v2/transaction/process`) | INTEGRATE | Via `createOrder` → `createTransaction`, `payload = order.id`, never retried; exposed as `POST /api/mobile/payments/create` |
| Hosted payment page (`payment_url`) | INTEGRATE | Opened in the in-app WebView (D-05) with https validation; no external browser as primary path |
| Get transaction status (`/transaction/{id}`) | INTEGRATE | Server re-query inside the webhook for amount/currency/status equality; poll route is DB-only, not a second live query |
| Callback / webhook (`CONFIRMED`/`CANCELED`/`CHARGEBACKED`/`DISPUTED`) | INTEGRATE | Existing `app/api/platega/callback/route.ts` reused unchanged: header verification, merchant match, atomic claim, one outbox row, idempotent on `transaction_id` |
| Refund / chargeback handling | INTEGRATE | Webhook records terminal status and issues no key; no new mobile refund surface |
| `paymentMethod` codes (2/11/12/13/14) | OPT-OUT | UI-only chips in phase 21: Platega codes cannot express МИР vs VISA vs MC and `REQ-SHOP-04` only requires persisted selection (Open Question Q2 resolved) |
| Merchant selection (site vs bot) | INTEGRATE | `channel: "web"` resolves to the site merchant; header verification and merchant↔order match retained; revisit only with test credentials |
| Periodic status reconcile job | OPT-OUT | Existing job unchanged; no mobile-visible work or new route in this phase |
| Client-side payment confirmation | OPT-OUT | No deep-link or timer may mark a payment confirmed; only the DB status written by the webhook drives success |

## Seal-time note

This matrix is produced at plan time because the deterministic detector does not see the integration vocabulary in the compact ROADMAP phase section, while the phase scope clearly integrates both services through backend wrappers. Every capability of both services is enumerated above; each opt-out carries an explicit reason. No key issuance capability was duplicated to satisfy a literal reading of `REQ-BE-05`.
