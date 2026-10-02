# API Coverage — Platega.io (payment provider)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: Phase 3 processes money only. Capabilities outside the v1 money path are
> listed so the omission is a decision, not an unseen hole.

| capability | decision | reason |
|---|---|---|
| create-transaction (no method, hosted chooser) | INTEGRATE | D-33 redirect flow; payer picks МИР/СБП on Platega's page (`POST /v2/transaction/process`) |
| create-transaction (fixed `paymentMethod`) | OPT-OUT | not needed — the no-method chooser already satisfies «карты МИР / СБП»; a fixed method would remove user choice (RESEARCH recommendation) |
| status re-query (`GET /transaction/{id}`) | INTEGRATE | D-34 mandatory source-of-truth before issuance |
| callback ingest (`CONFIRMED`/`CANCELED`/`CHARGEBACKED`) | INTEGRATE | D-38 ingest-fast; header-verified + re-queried; CHARGEBACKED mapped → `refunded` |
| hourly reconcile of pending orders | INTEGRATE | D-40 lost-callback recovery |
| payment methods enumeration (`PaymentMethodInt`) | OPT-OUT | not needed — we never hardcode a method id; the hosted page owns selection |
| refund / chargeback initiation API | OPT-OUT | explicitly out of scope v1 — refunds are manual/admin (Phase 5); we only record CHARGEBACKED |
| recurrent / autopayment (subscription tokens) | OPT-OUT | v2 (GRO-03) — user chose redirect one-shot flow |
| payment-link QR in-place | OPT-OUT | D-33 chose hosted redirect, not in-place СБП QR |
| transaction list API | OPT-OUT | D-46 history is built from our own DB, no live Platega read |
| payout / settlement APIs | OPT-OUT | not applicable — merchant acquiring only |
| webhook registration API | OPT-OUT | callback URL is configured in the Platega LK (Phase 5 deploy), no API call |
