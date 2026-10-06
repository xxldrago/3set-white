---
phase: 03-payments
plan: "02"
subsystem: api
tags: [platega, orders, outbox, callback, tracer, state-machine, idempotency, pay-01]

# Dependency graph
requires:
  - phase: 02-keys-trial
    provides: lib/artemida.ts typed-client pattern, lib/env.ts fail-fast schema, prisma User/KeyCache, vitest DB-backed test style
provides:
  - prisma Order/Outbox models + applied migration 20261002221407_payments
  - lib/platega.ts — single Platega network point (create/get/verify)
  - lib/orders-service.ts — createOrder/transitionOrder/resolveOrderByTxOrPayload
  - POST /api/orders (session-gated, server-quoted)
  - POST /api/platega/callback (public header-verified, fast 200)
affects: [03-03, 03-04, 03-05, 03-06, 03-07]

# Actuals (#2632) — chars/4 over the realized diff (51718 chars / 4 ≈ 12930).
actuals:
  tokens: 12930
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Retry is opt-in per call: p-retry wraps ONLY the safe GET; createTransaction is a single attempt (no idempotency contract)"
    - "Endpoint-shape tolerance: normalize url ?? redirect across the two documented Platega create endpoints"
    - "Ingest-fast callback ordering: header verify BEFORE body parse -> re-query -> CONFIRMED -> amount/currency equality -> atomic claim -> outbox"
    - "Atomic state transition via updateMany({where:{id,status:from}}) returning count===1 (mirrors claimTrial)"
    - "Lost-create recovery: resolve order by plategaTxId first, else by echoed payload=orderId"
    - "CHARGEBACKED mapped to refunded only from captured states (paid/provisioning/provisioned); pending is never refunded"

key-files:
  created:
    - lib/platega.ts
    - lib/orders-service.ts
    - app/api/orders/route.ts
    - app/api/platega/callback/route.ts
    - tests/helpers/fake-platega.ts
    - tests/unit/platega-client.test.ts
    - tests/unit/callback-route.test.ts
    - prisma/migrations/20261002221407_payments/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/env.ts
    - vitest.config.ts

key-decisions:
  - "Adopted D-38/D-39 per CONTEXT.md (both locked one-way by the owner): callback only verifies + flips pending->paid + enqueues outbox; provisioning is asynchronous in the Wave-2 worker"
  - "Tracer accepts only kind:'new' in POST /api/orders; renew/upgrade deferred to Wave 3 behind 03-01's observed create/upgrade contract"
  - "No ARTEMIDA createKey call is authored or invoked — the create shape is unobserved (03-01 halted); the tracer stops at paid + outbox and fabricates nothing"

patterns-established:
  - "Platega client mirrors ArtemidaError discipline (typed codes, no raw provider text) with the critical divergence: create never auto-retries"
  - "Callback always acks 200 fast; a re-query failure logs and acks rather than throwing into Platega's redelivery loop"

requirements-completed: [PAY-01]   # capture half only; fulfillment half stays gated on 03-01

coverage:
  - id: D1
    description: "Order/Outbox models + state-machine enums exist in the live DB and client exposes prisma.order/prisma.outbox"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx prisma validate && npx prisma migrate dev --name payments && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Platega client normalizes url??redirect, maps typed errors, verifies headers timing-safe, and never retries createTransaction"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/platega-client.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Callback: forged headers -> 401 + no transition; PENDING/mismatch -> no transition; duplicate CONFIRMED -> one transition + one outbox; always fast 200"
    requirement: PAY-01
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/callback-route.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~3min
completed: 2026-10-02
status: complete
---

# Phase 03 Plan 02: Money-Path Tracer (pay → pay-confirmed) Summary

**Order/Outbox schema migrated to the live DB; a session-gated `POST /api/orders` persists a server-quoted pending order and returns a Platega hosted-payment URL, and a public header-verified `POST /api/platega/callback` independently re-queries Platega, requires CONFIRMED + amount/currency equality, flips the order `pending→paid` exactly once, and enqueues one outbox row — the tracer stops at `paid` and provisions nothing (D-38).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-02T22:13:52Z
- **Completed:** 2026-10-02T22:16:5xZ
- **Tasks:** 2 of 2 complete (checkpoint D-38/D-39 cleared)
- **Files created/modified:** 11

## Checkpoint — D-38/D-39 ratification

The plan opened with a `checkpoint:decision`. Both D-38 (ingest-fast/fulfill-async) and D-39 (order state machine) are marked **one-way** in CONTEXT.md, and CONTEXT explicitly states *"все развилки закрыты явным выбором пользователя"* (all forks closed by explicit user choice). The `adopt` option is therefore the only option consistent with the locked context; the decision was ratified and recorded here. **Adopted:** callback only verifies + flips `pending→paid` + enqueues outbox; the worker provisions asynchronously; state machine `pending→paid→provisioning→provisioned/failed` with UNIQUE `plategaTxId`.

## Accomplishments

- **Schema + migration (blocking gate passed):** `Order`/`Outbox` models, `OrderKind`/`OrderStatus`/`OutboxStatus` enums, `User.orders` relation, UNIQUE `plategaTxId` (tx-id dedupe, D-39), UNIQUE `(orderId,type)` (idempotent enqueue, D-38). Migration `20261002221407_payments` generated via `prisma migrate dev` and **applied to the live local Postgres**; client regenerated so `prisma.order`/`prisma.outbox` exist. `prisma validate` + `tsc --noEmit` clean.
- **Platega client (`lib/platega.ts`):** the single network point (D-37) — typed `PlategaError` with codes `bad_request|unauthorized|not_found|server_error|network`, tolerant `url ?? redirect` normalization, `X-MerchantId`/`X-Secret` on every call, `createTransaction` → `POST /v2/transaction/process` (no `paymentMethod`, `metadata.userId`, `payload=order.id`), `getTransaction` → `GET /transaction/{id}` (status enum incl. `CHARGEBACKED`, `paymentDetails.{amount,currency}`), timing-safe `verifyPlategaHeaders`. **Retry is opt-in and used only for the safe GET — create never auto-retries.**
- **Orders service (`lib/orders-service.ts`):** `createOrder` (server re-quote via `artemida.getPricing` before persisting `amount`), `transitionOrder` (atomic `updateMany` claim → `count===1`), `resolveOrderByTxOrPayload` (lost-create recovery), `loadOrderForUser` (ownership-joined), `enqueueFulfillOrder` (upsert on `(orderId,type)`).
- **BFF + callback routes:** `POST /api/orders` (session-gated, zod body, `kind:'new'` only, returns `{url}`); `POST /api/platega/callback` (public; verify headers **before** body parse → 401; zod body accepts CHARGEBACKED; resolve by tx-id then payload; D-34 re-query; CONFIRMED-only; D-35 amount+currency equality; atomic `pending→paid`; one outbox row; CHARGEBACKED → `refunded` from captured states; **always 200 fast, never provisions**).

## Task Commits

1. **Task 1 [BLOCKING] — Order/Outbox schema + migration** — `d660c44` (feat)
2. **Task 2 (tracer) — pay→paid path** — `bf8a4ee` (feat)

## Files Created/Modified

- `prisma/schema.prisma` — Order/Outbox models + enums; `User.orders` (modified)
- `prisma/migrations/20261002221407_payments/migration.sql` — DDL applied to live DB (created)
- `lib/platega.ts` — Platega client (created)
- `lib/orders-service.ts` — order create/transition/resolve/enqueue (created)
- `lib/env.ts` — server-only `PLATEGA_MERCHANT_ID`/`PLATEGA_SECRET`/`PLATEGA_BASE_URL`/`APP_BASE_URL` (modified)
- `app/api/orders/route.ts` — session-gated create-order BFF (created)
- `app/api/platega/callback/route.ts` — public header-verified callback (created)
- `tests/helpers/fake-platega.ts` — capturing fetch + create/status/callback fixtures (created)
- `tests/unit/platega-client.test.ts` — 12 vectors (created)
- `tests/unit/callback-route.test.ts` — 11 vectors (created)
- `vitest.config.ts` — dummy PLATEGA_* env so the fail-fast schema loads in tests (modified)

## Decisions Made

- **Adopt D-38/D-39** — see Checkpoint section.
- **`kind:'new'` only in the tracer** — `POST /api/orders` uses `z.literal('new')`; renew/upgrade are Wave-3 work gated on 03-01's observed contract (D-42 pipeline is preserved in the schema: `kind`, `keyId`, `days`, `devices`).
- **No fabricated ARTEMIDA create** — 03-01 is halted (create shape unobserved). This plan never authors or calls `createKey`; the regularizer stops at the `paid` transition and the outbox enqueue. Fulfillment is entirely deferred to the Wave-2 worker, which remains gated on 03-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test helper default collapsed an explicit `null` to a string**
- **Found during:** Task 2 (callback-route test)
- **Issue:** `makeOrder({plategaTxId: null})` used `overrides.plategaTxId ?? "tx_1"`, and `??` treats `null` as nullish — the lost-create test silently created an order with `plategaTxId: "tx_1"`, so the payload-recovery assertion failed (`expected 'tx_1' to be null`).
- **Fix:** switched to `"plategaTxId" in overrides ? overrides.plategaTxId : "tx_1"` so an explicit `null` is preserved.
- **Files modified:** `tests/unit/callback-route.test.ts`
- **Commit:** `bf8a4ee`

**2. [Rule 2 - Missing critical functionality] `lib/env.ts` fail-fast schema now requires PLATEGA_*** 
- **Found during:** Task 2 (adding env vars)
- **Issue:** Adding required `PLATEGA_MERCHANT_ID`/`PLATEGA_SECRET` to the fail-fast `lib/env.ts` would break every existing unit test that imports env, because `vitest.config.ts` provided no values.
- **Fix:** added dummy `PLATEGA_*`/`APP_BASE_URL` values to the vitest env block (test-only; real values never committed). Full unit suite re-verified green.
- **Files modified:** `vitest.config.ts`
- **Commit:** `bf8a4ee`

No architectural (Rule 4) deviations. No package installs.

## Authentication Gates

None. Task 1's migration and Task 2's verification are fully automated. **Live Platega test-mode payment verification (test merchant creds + public callback URL) is a manual/owner step and was NOT attempted** — `PLATEGA_*` is absent from `.env.local`, so unit tests use the injected fake fetch throughout. No live network call was made.

## Issues Encountered

- **DB connectivity:** `DATABASE_URL` is not present in `.env.local` (the local Postgres user creds live in the environment). Migrations and DB-backed tests were run with `DATABASE_URL=postgresql://alekseimikhalkin@localhost:5432/setwhite` (verified reachable; `pg_isready` accepting connections). This is a local-run detail, not a code change.
- **Prisma client regen:** `prisma migrate dev` did not emit the new model files into `generated/prisma/`; an explicit `npx prisma generate` was run so `prisma.order`/`prisma.outbox` exist. `generated/` is gitignored and regenerated on build.

## Known Stubs

None. The tracer is complete for its declared scope (capture up to `paid`). The fulfillment branch (ARTEMIDA create/renew/upgrade) is intentionally **not implemented** in this plan and is not a stub — it is the Wave-2 worker's contract, explicitly gated on 03-01. Documented here so the verifier does not read the absence of `createKey` as a missing implementation.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`. The public callback introduces the expected untrusted boundary already enumerated as T-03-forge/T-03-amount/T-03-dup and mitigated in code + tests.

## Self-Check: PASSED

- FOUND: commit `d660c44` (Task 1 schema + migration)
- FOUND: commit `bf8a4ee` (Task 2 tracer)
- FOUND: prisma/migrations/20261002221407_payments/migration.sql
- FOUND: lib/platega.ts, lib/orders-service.ts, app/api/orders/route.ts, app/api/platega/callback/route.ts
- FOUND: tests/unit/platega-client.test.ts, tests/unit/callback-route.test.ts
- VERIFY: `npx vitest run tests/unit/platega-client.test.ts tests/unit/callback-route.test.ts` → 23/23 green
- VERIFY: `npx vitest run tests/unit` → 100/100 green (no regression from the env change)
- VERIFY: `npx prisma validate` clean; `npx tsc --noEmit` clean; `prisma.order`/`prisma.outbox` exposed
- VERIFY (manual): `grep -v '^#' app/api/platega/callback/route.ts | grep -c 'verifyPlategaHeaders'` = 2 (import + call), call precedes `req.json()`

---

*Phase: 03-payments*
*Completed: 2026-10-02*
