---
phase: 03-payments
plan: "05"
subsystem: payments
tags: [pay-04, payment-history, order-status, ownership-join, idor, session, prisma, tdd]

# Dependency graph
requires:
  - phase: 03-payments
    provides: 03-02 Order/Outbox schema + orders-service (loadOrderForUser) + session-gated BFF pattern; 03-03/03-04 order state machine + kind-aware rows
  - phase: 02-keys-trial
    provides: lib/keys-service getKeyForUser ownership-join style; lib/session requireSession; DB-backed vitest style
provides:
  - lib/orders-service.ts — listOrdersForUser (ownership-joined, newest first) + toHistoryRow (provider-free raw row) + OrderHistoryRow
  - app/api/orders/[orderId]/route.ts — session-gated ownership-joined order status (3s poll target)
  - tests/unit/order-history.test.ts — history isolation + row mapping + empty/partial vectors
  - tests/unit/order-status-route.test.ts — route-level identical-404 + provider-field-absence vectors
affects: [03-06, 03-07]

# Actuals (#2632) — chars/4 over the realized plan diff (18594 diff chars / 4 ≈ 4649).
# Estimate was 46000 (raw 23000, low confidence); recorded honestly, not rounded.
actuals:
  tokens: 4649
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single provider-free mapper: toHistoryRow is the ONE narrowing function; both the history read and the status route use it, so no read surface can serialize plategaTxId/paymentUrl (T-03-provider-leak)"
    - "Ownership join on every read: findFirst/findMany `where: { user: { telegramId } }`; non-owned ≡ missing (404, no oracle)"
    - "listOrdersForUser returns mapped rows (not raw Order[]), forcing consumers through the provider-free shape"
    - "Route files use relative imports (vitest has no `@/*` alias) — mirrors app/api/keys/[id]/devices/route.ts"

key-files:
  created:
    - app/api/orders/[orderId]/route.ts
    - tests/unit/order-history.test.ts
    - tests/unit/order-status-route.test.ts
  modified:
    - lib/orders-service.ts
    - tests/unit/order-service.test.ts

key-decisions:
  - "Reused toHistoryRow as the status route's response mapper — the status view and a history row share the exact {id,amount,currency,status,kind,keyId,createdAt} shape, so one narrowing function guarantees both leak nothing"
  - "listOrdersForUser returns OrderHistoryRow[] (mapped) rather than Order[] — the caller can never accidentally serialize a provider field"
  - "Status route uses relative `../../../../lib/...` imports, not `@/lib`, because vitest.config.ts defines no alias and route tests import the handler directly"
  - "keyId nullable by contract: a row without a key reference renders amount+status+date and omits the link (partial rule, UI-SPEC §6); the mapper invents no link field"

requirements-completed: [PAY-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "listOrdersForUser reads only the caller's orders from our DB, newest first, with no live Platega query (D-46); another user's order is absent (T-03-hist-idor)"
    requirement: PAY-04
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-history.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "toHistoryRow maps amount/status/date/kind/keyId raw and drops every provider field; a null keyId yields no dangling key link (partial row)"
    requirement: PAY-04
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-history.test.ts#toHistoryRow — raw-value mapping (D-48)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/orders/[orderId] is session-gated, ownership-joined, DB-only; a non-owned id and a missing id return an identical 404; the serialized body contains no provider transaction id"
    requirement: PAY-04
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/order-status-route.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~3min
started: 2026-10-03T03:30:40Z
completed: 2026-10-03T03:33:30Z
status: complete
---

# Phase 03 Plan 05: Order Status Route + Payment-History Read Summary

**A session-gated `GET /api/orders/[orderId]` now returns only the caller's order as a provider-free mapped shape (non-owned ≡ missing → identical 404), and `listOrdersForUser` + `toHistoryRow` give the cabinet and bot one DB-only, ownership-joined payment-history read that never triggers a live Platega query (D-46/47/48).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-03T03:30:40Z
- **Completed:** 2026-10-03T03:33:30Z
- **Tasks:** 2 of 2
- **Files:** 3 created, 2 modified

## Accomplishments

- **History read service (`lib/orders-service.ts`).** `listOrdersForUser(telegramId)` runs `prisma.order.findMany({ where: { user: { telegramId } }, orderBy: { createdAt: 'desc' } })` and maps every row through `toHistoryRow` — the read is entirely DB-native (D-46, no live Platega request) and ownership-joined so a caller only ever sees their own orders (T-03-hist-idor). `toHistoryRow(order)` is a pure mapper emitting `{ id, amount, currency, status, kind, keyId, createdAt }`; it deliberately drops `plategaTxId`/`paymentUrl` (T-03-provider-leak) and leaves `keyId` nullable so a partial row omits the key link instead of inventing a broken one.
- **Order-status route (`app/api/orders/[orderId]/route.ts`).** Mirrors the keys-detail BFF: `requireSession()` gate → zod `string().min(1).max(200)` on the path param → `loadOrderForUser(BigInt(telegramId), orderId)`. A null result (missing OR non-owned) returns an identical `404 {error:'not_found'}` with no enumeration oracle (T-03-enumeration). The 200 body is `{ order: toHistoryRow(order) }` — no provider field is ever serialized. `export const dynamic = 'force-dynamic'`; the handler is side-effect-free and DB-only for the 3s poller (UI-SPEC §2).
- **Tests.** `order-history.test.ts` (8 DB-backed vectors): newest-first ordering, foreign-order exclusion, empty-state, raw mapping with a `plategaTxId` present in the row, null-`keyId` partial row, and `loadOrderForUser` no-oracle. `order-status-route.test.ts` (4 vectors): exact provider-free key set, identical 404 bodies, 400 over-long id, 401 no session. `order-service.test.ts` gained a focused `loadOrderForUser` ownership vector.

## Task Commits

Each task was committed atomically (RED then GREEN for the TDD task):

1. **Task 1 (RED): failing payment-history + order-load vectors** — `bc5d338` (test)
2. **Task 1 (GREEN): ownership-joined payment-history read service** — `9b94701` (feat)
3. **Task 2: session-gated order status route + tests** — `e83cb60` (feat)

**Plan metadata:** (this SUMMARY commit) (docs)

## Files Created/Modified

- `lib/orders-service.ts` (modified) — `OrderHistoryRow`, `toHistoryRow`, `listOrdersForUser`.
- `app/api/orders/[orderId]/route.ts` (created) — session-gated ownership-joined status GET.
- `tests/unit/order-history.test.ts` (created) — 8 DB-backed history/isolation/mapping vectors.
- `tests/unit/order-status-route.test.ts` (created) — 4 route-level vectors.
- `tests/unit/order-service.test.ts` (modified) — `loadOrderForUser` ownership vector.

## Decisions Made

- **One provider-free mapper for both read surfaces.** The status response and a history row share the identical shape, so the route imports `toHistoryRow` rather than declaring a second mapper. This makes "the response leaks no provider field" a single-point guarantee rather than a convention repeated per route.
- **`listOrdersForUser` returns mapped rows, not raw `Order[]`.** Consumers (cabinet `PaymentHistoryList`, bot menu reply) physically cannot serialize `plategaTxId`/`paymentUrl`.
- **Relative imports in the route.** `vitest.config.ts` has no `@/*` alias, so `@/lib/...` would fail when the test imports the handler directly; the route follows the tested `app/api/keys/[id]/devices/route.ts` relative-import style.
- **No i18n keys added.** This plan is service + route only; the RU history/status copy lands with the UI in plan 03-06, so the "new keys in the same task" criterion is vacuously satisfied here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Authored route test read a response body twice**
- **Found during:** Task 2 (order-status-route test run)
- **Issue:** The identical-404 vector called `missingRes.json()` twice (`expect(await foreignRes.json()).toEqual(await missingRes.json())` then `expect(await missingRes.json())...`), throwing `TypeError: Body is unusable: Body has already been read`.
- **Fix:** Read each body once into a local and compare the locals.
- **Files modified:** `tests/unit/order-status-route.test.ts`
- **Verification:** Full test file green (4/4); full unit suite green.
- **Committed in:** `e83cb60`

**2. [Rule 1 - Bug] Route comment shadowed the plan's manual `plategaTxId` grep**
- **Found during:** Task 2 (manual verification)
- **Issue:** The route's explanatory comment contained the literal token `plategaTxId`, so the plan's manual check `grep -v '^#' … | grep -c 'plategaTxId'` returned 1 instead of 0 (the comment marker is `//`, which `^#` does not strip).
- **Fix:** Reworded the comment to "the provider transaction id / payment URL" — no literal token remains.
- **Files modified:** `app/api/orders/[orderId]/route.ts`
- **Verification:** manual grep count = 0 (both `plategaTxId` and `paymentUrl`).
- **Committed in:** `e83cb60`

---

**Total deviations:** 2 auto-fixed (2 bugs — one test, one comment/verification hygiene). No production behavior changed by either.
**Impact on plan:** None on scope. No package installs (T-03-SC honored); no architectural decisions.

## Issues Encountered

None beyond the two auto-fixed nits above. Tests run against the real local Postgres with `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite`.

## TDD Gate Compliance

- **Plan-level type:** `execute` (not a `type: tdd` plan).
- **Task 1 (`tdd="true"`):** RED `bc5d338` (`test(...)`) confirmed failing (5 failed / 16 passed) → GREEN `9b94701` (`feat(...)`). ✅
- **Task 2 (`type="auto"`, no `tdd`):** single `feat` commit `e83cb60` (its tests are Wave-0 deliverables bundled with the route).

## Known Stubs

None. The cabinet `PaymentHistoryList` and the bot history menu that consume `listOrdersForUser`/`toHistoryRow` are intentionally built in plans 03-06 and 03-07 respectively (both producers exist here); this is documented scope, not a stub.

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`:
- **T-03-hist-idor** mitigated — every read is ownership-joined (`user: { telegramId }`); proven by foreign-order exclusion vectors.
- **T-03-provider-leak** mitigated — `toHistoryRow` narrows to our fields; route test asserts the exact key set and absence of the provider tx id / payment URL, including in the full serialized JSON.
- **T-03-enumeration** mitigated — non-owned and missing both return an identical `404 {error:'not_found'}` (asserted equal bodies).
- **T-03-SC** honored — no new packages.

## Next Phase Readiness

- `GET /api/orders/[orderId]` is live for plan 03-06's `OrderStatusPanel` 3s poller (terminal-safe shape, no provider fields).
- `listOrdersForUser` + `toHistoryRow` are the shared read path for both the cabinet history page (03-06) and the bot menu reply (03-07) — parity by construction.
- The 200/404/400/401 contract is locked by tests; no live Platega dependency on any read path.

---

*Phase: 03-payments*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: commit `bc5d338` (Task 1 RED — history/load vectors)
- FOUND: commit `9b94701` (Task 1 GREEN — history read service)
- FOUND: commit `e83cb60` (Task 2 — status route + route tests)
- FOUND: lib/orders-service.ts, app/api/orders/[orderId]/route.ts
- FOUND: tests/unit/order-history.test.ts, tests/unit/order-status-route.test.ts
- VERIFY: `export DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite && npx vitest run tests/unit` → 20 files / 155 tests green
- VERIFY: `npx tsc --noEmit` clean
- VERIFY (manual): `grep -v '^#' "app/api/orders/[orderId]/route.ts" | grep -c 'plategaTxId'` = 0
- SECURITY: no provider id/field in any read response; no secret committed; no new packages
- NOTE: STATE.md / ROADMAP.md intentionally NOT written by this executor (orchestrator owns those)
