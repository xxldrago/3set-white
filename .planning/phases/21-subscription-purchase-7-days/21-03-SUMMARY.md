---
phase: 21-subscription-purchase-7-days
plan: 03
subsystem: api
tags: [mobile-bff, pricing, promo, jwt, zod, artemida, vitest, no-5xx]
requires:
  - phase: 21-subscription-purchase-7-days
    provides: Plan 01 payment routes and Plan 02 subscription/grace envelope establish the mobile JWT + {ok,error} route pattern
  - phase: 19-server-pools-auto-ping-7-days
    provides: lib/pricing.ts and lib/tariff-grid.ts live quote + markup calibration reused verbatim
  - phase: 18-mobile-auth-7-days
    provides: verifyAccessToken JWT gate used by both new routes
provides:
  - GET /api/mobile/pricing — one batched five-term server-quoted RUB price list with mobile-only 2..10 device bounds
  - POST /api/mobile/promo/apply — read-only backend-validated percentage preview with no consumption and no oracle
  - 43 Wave 0 unit vectors covering locked prices, bounds, auth, stable no-5xx errors and secret discipline
affects:
  - 21-04 (live providers bind these contracts), 21-05 (Shop Screen consumes pricing/promo), Phase 22 (device enforcement)
actuals:
  tokens: 5484
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - Batched server quote: one response over TARIFF_DAYS through resolveTariffQuote, no client price authority
    - Mobile-only validation bounds local to the route; shared TARIFF_MAX_DEVICES = 9999 untouched
    - Read-only promo preview: validatePromo only; atomic consumePromo stays in createOrder
    - Uniform stable 200 {ok:false,error} degradation with typed codes, Retry-After and no provider text
key-files:
  created:
    - app/api/mobile/pricing/route.ts
    - app/api/mobile/promo/apply/route.ts
    - tests/unit/mobile-pricing-route.test.ts
    - tests/unit/mobile-promo-route.test.ts
  modified: []
key-decisions:
  - D-01: the mobile route is the single price authority — it loops TARIFF_DAYS through resolveTariffQuote so no price is hardcoded in the route or the client and a price change ships without an app release.
  - D-02: devices are bounded 2..10 only in the mobile route; TARIFF_MAX_DEVICES stays 9999 and tariff-grid.ts/pricing.ts were not touched.
  - D-03: only a device count is accepted; no amount is accepted or returned from the client and currency comes from TARIFF_CURRENCY.
  - D-08: promo preview calls validatePromo only, returns a percentage (never an amount), and collapses unknown/malformed/exhausted/expired/fixed-type codes to one promo_invalid code; consumption remains in createOrder.
  - Provider failures map to stable 200 codes (rate_limited with Retry-After, payment_required, provider_error, internal); no 5xx and no upstream message or requestId reaches bodies or logs.
patterns-established:
  - One batched mobile quote request instead of five term-by-term calls (T-21-20)
  - Strict zod body/query at the boundary; malformed promo codes get the same error as unknown ones
  - Logs carry only {route, requestId, outcome, code|retryAfterSec, durationMs}; promo codes, amounts and provider text are excluded
requirements-completed: [REQ-SHOP-01, REQ-SHOP-02, REQ-SHOP-03, REQ-SHOP-05]
coverage:
  - id: D1
    description: GET /api/mobile/pricing returns five ordered terms with the locked 2-device prices from the shared quote source
    requirement: REQ-SHOP-01
    verification:
      - kind: unit
        ref: tests/unit/mobile-pricing-route.test.ts#returns all five terms in order with the locked 2-device prices
        status: pass
      - kind: unit
        ref: tests/unit/tariff-markup.test.ts#adds the markup to the provider price for every term
        status: pass
    human_judgment: false
  - id: D2
    description: Mobile device bounds 2..10 enforced in the route while the shared grid stays unchanged
    requirement: REQ-SHOP-02
    verification:
      - kind: unit
        ref: tests/unit/mobile-pricing-route.test.ts#rejects devices=1 and devices=11 with bad_request and no provider call
        status: pass
      - kind: unit
        ref: tests/unit/mobile-pricing-route.test.ts#accepts the mobile ceiling of 10 devices with one batched request
        status: pass
    human_judgment: false
  - id: D3
    description: No client amount authority; response carries only ok/currency/terms and no provider key
    requirement: REQ-SHOP-05
    verification:
      - kind: unit
        ref: tests/unit/mobile-pricing-route.test.ts#exposes no client amount field and no provider key in the body or logs
        status: pass
    human_judgment: false
  - id: D4
    description: Read-only promo preview returns the validated code and percentage only, never consuming or returning an amount
    requirement: REQ-SHOP-03
    verification:
      - kind: unit
        ref: tests/unit/mobile-promo-route.test.ts#previews LIME15 as 15% with a percentage only
        status: pass
      - kind: unit
        ref: tests/unit/mobile-promo-route.test.ts#never returns a client-authoritative amount or consumes the code
        status: pass
    human_judgment: false
  - id: D5
    description: Invalid codes and provider failures degrade to one stable 200 code with no oracle, no 5xx and no leaks
    requirement: REQ-SHOP-03
    verification:
      - kind: unit
        ref: tests/unit/mobile-promo-route.test.ts#returns one stable promo_invalid code for an unknown code
        status: pass
      - kind: unit
        ref: tests/unit/mobile-pricing-route.test.ts#maps a provider rate limit to a stable 200 code with Retry-After
        status: pass
    human_judgment: false
duration: 3 min
completed: 2026-11-28
status: complete
---

# Phase 21 Plan 03: Mobile pricing and promo preview routes Summary

**Batched five-term server-quoted pricing and a read-only backend-validated promo preview exposed to the Flutter client without any price or discount authority**

## Performance

- **Duration:** 3 min (2026-11-28T03:21:17Z → 03:24:33Z)
- **Started:** 2026-11-28T03:21:17Z
- **Completed:** 2026-11-28T03:24:33Z
- **Tasks:** 2 of 2 (both `tdd="true"`: RED + GREEN commits each)
- **Files modified:** 4 (2 route handlers, 2 Wave 0 test files)

## Accomplishments

- Added `GET /api/mobile/pricing`: JWT-gated, device count validated to 2..10 only on this route, one batched loop over `TARIFF_DAYS` calling the shared `resolveTariffQuote`, returning `{ok:true, currency:"RUB", terms:[{days,amount}]}` with `x-request-id`. At 2 devices the real calibration yields exactly 115/400/1000/1900/3800 ₽ (proved by `tariff-markup.test.ts`, no literals in the route).
- Added `POST /api/mobile/promo/apply`: JWT-gated strict code body, `validatePromo` preview only, `{ok:true, code, discountPercent}`; unknown, malformed, exhausted, expired and fixed-type codes all return the same stable `promo_invalid`. `consumePromo` is neither imported nor called.
- Both routes degrade provider/unexpected failures to HTTP 200 `{ok:false,error}` with typed codes, `Retry-After` on rate limits, and no provider message, requestId, promo code or amount in bodies or logs — no 5xx path.
- 43 Wave 0 tests pass (19 pricing + 12 promo + 12 existing markup/grid vectors); `npx tsc --noEmit` exits 0 and `npx prisma validate` reports a valid schema.

## Task Commits

Each task was committed atomically (TDD RED then GREEN):

1. **Task 1 (RED): five-term pricing route contract tests** - `4a04a6e` (test)
2. **Task 1 (GREEN): batched five-term mobile pricing route** - `dd592f1` (feat)
3. **Task 2 (RED): read-only promo preview contract tests** - `3e913ec` (test)
4. **Task 2 (GREEN): read-only mobile promo preview route** - `62afca5` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `app/api/mobile/pricing/route.ts` - JWT + zod device bound 2..10; five-term quote via `resolveTariffQuote`; stable 200 error envelopes
- `app/api/mobile/promo/apply/route.ts` - JWT + strict code body; `validatePromo` preview only; percentage-only response, uniform invalid code
- `tests/unit/mobile-pricing-route.test.ts` - locked prices/order, 2..10 bounds, auth gate, no-amount/no-secret and error mapping vectors
- `tests/unit/mobile-promo-route.test.ts` - percentages, normalization, no oracle, no consumption, auth and degradation vectors

No changes to `lib/tariff-grid.ts`, `lib/pricing.ts`, `lib/promo.ts`, the schema or any package manifest.

## Decisions Made

- The public D-01 response shape is `{ok, currency, terms[{days,amount}]}` with integer RUB amounts; it is already locked by the Plan 01 decision gate, so no new gate was needed.
- Promo previews for `fixed`-type codes are reported as `promo_invalid` because the client contract carries a percentage only; a fixed amount cannot be applied client-side without granting price authority.
- `validatePromo` is called with a neutral probe amount whose computed `finalAmount` is discarded, so the preview cannot be mistaken for an authoritative checkout amount.
- Device bounds and the promo code format are enforced at the route boundary; the shared backend constants remain the single source for everything outside mobile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pricing test helper returned a Request instead of a Response**
- **Found during:** Task 1 GREEN (first test run after adding the route)
- **Issue:** The hoisted-test `request()` helper built the Request but did not invoke the route, so every success/error vector received a `Request` object and failed with `status === undefined`.
- **Fix:** Made the helper `async` and returned `GET(new Request(...))` directly; the dedicated 401 vector already called `GET` correctly and stayed unchanged.
- **Files modified:** `tests/unit/mobile-pricing-route.test.ts`
- **Verification:** All 19 pricing vectors and the 12 shared markup vectors pass; committed with the GREEN implementation.
- **Committed in:** `dd592f1`

---

**Total deviations:** 1 auto-fixed (test-harness bug). **Impact:** No production behavior change; the route and all acceptance criteria are unchanged. No scope creep, no schema change and no new dependency.

## Issues Encountered

- The Vite config emits a pre-existing ESM/CommonJS `configLoader: 'native'` advisory on every vitest run; it is unrelated to this plan and was not changed.
- `npx tsc --noEmit` reports 0 errors on the current working tree (no unrelated type errors to triage here).
- All four requirement IDs (REQ-SHOP-01/02/03/05) are also declared by sibling plans 21-04 and 21-05, which have no summaries yet. Per the shared-ID gate they remain blocked from `Complete` until those plans finish; no status surface was invented.

## User Setup Required

None. No new service, credential or environment variable was introduced; ARTEMIDA and Platega secrets remain server-side env-only.

## Next Phase Readiness

- Plans 04 and 05 can bind `Endpoints.pricing` / `Endpoints.promoApply` to these live contracts; the Shop Screen must multiply the returned per-term amount for preview only and let `createOrder` quote the final amount.
- The single webhook → outbox → worker key issuer is unchanged; no client-callable `/keys/issue` or `/keys/renew` route was added.
- The 115/400/1000/1900/3800 ₽ calibration is enforced by backend tests; a future price change ships through `lib/pricing.ts` settings without a client release.

---
*Phase: 21-subscription-purchase-7-days*
*Completed: 2026-11-28*

## Self-Check: PASSED

All 5 created files exist, all 4 task commits are present in git history, no stub patterns were found in the two new routes, and every verification command is green (43 unit tests, `npx tsc --noEmit` 0 errors, `npx prisma validate` valid).
