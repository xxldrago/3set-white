---
phase: 02-keys-trial
plan: "02"
subsystem: api
tags: [artemida, pricing, bff, session-gate, i18n, p-retry, idempotency, vitest, next]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Node 24 + Next 16 App Router, Prisma 7, jose session (lib/auth.ts), i18n t()/I18nKey, BFF route discipline
  - phase: 02-keys-trial/02-01
    provides: docs/artemida-v1-contract.{md,json} — locked pricing field names (data.quote.amount), devices min=2, object+string error envelopes
provides:
  - lib/artemida.ts — full ARTEMIDA V1 client (D-17): transport, Retry-After-aware retry, typed errors, Idempotency-Key, tolerant normalizers
  - lib/session.ts — route-side requireSession() over the pure lib/auth session
  - app/api/pricing/route.ts — session-gated BFF returning the exact provider price
  - components/TariffPicker.tsx — live 7/30/90 × 2–10 tariff picker on the home screen
  - lib/i18n — t(key, params) interpolation + tp(base, n) RU plurals
  - tests/helpers/fake-fetch.ts — verified-envelope + injectable fake fetch helper
affects: [02-03, 02-04, 02-05, 02-06]

# Actuals (#2632) — chars/4 over the realized diff (60490 non-lockfile chars / 4).
actuals:
  tokens: 15100
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: ["p-retry@^7.1.1"]
  patterns:
    - "One server-only typed transport with envelope-aware errors; every provider shape change stays inside lib/artemida.ts"
    - "Session-gated BFF route: requireSession() first, z.coerce query validation, exact provider value out, generic error bodies"
    - "Client dependency injection: createArtemidaClient({fetch, retry}) for fast hermetic tests + global fetch singleton for routes"
    - "i18n interpolation + Intl.PluralRules('ru') plural helper with a source scanner that resolves tp() bases"

key-files:
  created:
    - lib/artemida.ts
    - lib/session.ts
    - app/api/pricing/route.ts
    - components/TariffPicker.tsx
    - tests/helpers/fake-fetch.ts
    - tests/unit/artemida-client.test.ts
    - tests/unit/pricing-route.test.ts
  modified:
    - lib/env.ts
    - .env.example
    - app/page.tsx
    - lib/i18n/index.ts
    - lib/i18n/messages/ru.ts
    - tests/unit/i18n.test.ts
    - package.json
    - vitest.config.ts

key-decisions:
  - "getPricing reads the OBSERVED provider field data.quote.amount (with data.amount/data.price tolerant fallbacks) — the 02-01 contract, not the plan's pre-probe assumption"
  - "Route import depth is ../../../lib (app/api/pricing/route.ts) mirroring the auth route's relative-import convention"
  - "ArtemidaError message is never rendered or logged: routes log {route, code, requestId} only (T-02-06)"
  - "p-retry retries only 429/502/503; Retry-After is awaited in onFailedAttempt and only when a retry will actually occur"
  - "vitest supplies dummy env so lib/env.ts loads without a real .env/DB; tests never touch the network (fake fetch)"

patterns-established:
  - "Provider contract lock drives client field names: re-read docs/artemida-v1-contract.md before editing lib/artemida.ts"
  - "New BFF routes copy app/api/auth/telegram/route.ts: dynamic=force-dynamic, typed 401, generic 400/500"
  - "i18n keys added only when this plan's code references them (unused-key invariant is enforced by tests/unit/i18n.test.ts)"

requirements-completed: [TRIAL-02]

coverage:
  - id: D1
    description: "GET /api/pricing is session-gated, clamps days to {7,30,90} and devices to 2..10, and returns ARTEMIDA's exact price"
    requirement: TRIAL-02
    verification:
      - kind: unit
        ref: "tests/unit/pricing-route.test.ts#returns the exact ARTEMIDA amount for a valid selection"
        status: pass
    human_judgment: false
  - id: D2
    description: "ARTEMIDA V1 transport: both error envelopes parse, status→code maps 401/402/409/429/502/503, retries only 429/502/503, Retry-After extracted"
    requirement: TRIAL-02
    verification:
      - kind: unit
        ref: "tests/unit/artemida-client.test.ts#extracts Retry-After seconds from a terminal 429"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full D-17 ARTEMIDA V1 client surface (trial/keys/links/devices/traffic/renew/upgrade/lifecycle/balance) typechecked and unit-tested"
    requirement: TRIAL-02
    verification:
      - kind: unit
        ref: "tests/unit/artemida-client.test.ts#artemida client — full V1 surface (D-17)"
        status: pass
    human_judgment: false
  - id: D4
    description: "i18n t(key, params) interpolation + RU plural helper tp() with a widened completeness scanner"
    requirement: TRIAL-02
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#resolves RU plural categories via tp()"
        status: pass
    human_judgment: false
  - id: D5
    description: "Logged-in home screen shows TariffPicker with live price, disabled-until-ready controls, progress bar, and error+retry state"
    requirement: TRIAL-02
    verification: []
    human_judgment: true
    rationale: "Visual/interaction contract (UI-SPEC) — debounce feel, in-flight cancellation, and layout require a human/device review; no automated_ui test exists for TariffPicker"

# Metrics
duration: 13min
completed: 2026-10-02
status: complete
---

# Phase 02 Plan 02: Live Tariff Price (PWA tracer) Summary

**Session-gated `GET /api/pricing` returns ARTEMIDA's exact live price for a 7/30/90 × 2–10 selection, driven by a complete server-only V1 client (`lib/artemida.ts`) with Retry-After-aware retries and Idempotency-Keyed writes.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-10-02T00:47:00Z
- **Completed:** 2026-10-02T01:00:00Z
- **Tasks:** 2 of 2
- **Files modified/created:** 17 (per `git diff --name-only`; 16 in Task 1, 2 in Task 2, one overlap)

## Accomplishments
- **End-to-end price slice (TRIAL-02/D-26..D-28):** logged-in user selects days (7/30/90) and devices (2–10) in `TariffPicker`; the component fetches `/api/pricing`, which resolves the telegram id from the httpOnly session cookie and returns the raw `data.quote.amount`. No local markup or recomputation; the browser never sees `ARTEMIDA_API_KEY`.
- **Complete ARTEMIDA V1 client (D-17):** one server-only transport with Bearer auth, fresh `Idempotency-Key` per POST/DELETE (D-18), typed `ArtemidaError` mapped from 401/402/404/409/429/502/503 (D-19), p-retry limited to 429/502/503 with `Retry-After` honored. All remaining V1 methods authored and normalized (trial, keys list/detail/links/devices/traffic/renew/upgrade/lifecycle/balance) with tolerant schemas for the still-unobserved key-scoped shapes.
- **Contract-exact pricing:** the 02-01 live probe locked the field to `data.quote.amount`; the client reads that first (with `data.amount`/`data.price` fallbacks) and throws a typed `unknown` error — not a ZodError — if a 200 body is unrecognized.
- **i18n extension:** `t(key, params)` interpolates `{token}`s and `tp(base, n)` selects RU plural categories via `Intl.PluralRules`. The completeness scanner was widened for params and taught to resolve `tp()` bases, keeping the no-unused-keys invariant green.
- **Test infrastructure:** `tests/helpers/fake-fetch.ts` supplies the verified envelopes and an injectable `fetch`; `createArtemidaClient({fetch, retry})` keeps client tests hermetic and instant.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — live tariff price end-to-end (PWA)** — `67dc0de` (feat)
2. **Task 2: Complete the full ARTEMIDA V1 client surface (D-17)** — `f70277e` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified
- `lib/artemida.ts` — ARTEMIDA V1 client: transport, retry/idempotency, error mapping, tolerant normalizers, full method surface.
- `lib/session.ts` — `requireSession()` + `SessionError` over `lib/auth.ts` (pure module untouched).
- `app/api/pricing/route.ts` — GET BFF: session gate, `days ∈ {7,30,90}`, `devices ∈ 2..10`, `{price}` out, provider-code error mapping.
- `components/TariffPicker.tsx` — client segmented days + devices stepper, debounced fetch, AbortController cancellation, progress bar, error+retry.
- `app/page.tsx` — mounts `TariffPicker` in the logged-in branch (logged-out branch unchanged).
- `lib/env.ts` / `.env.example` — `ARTEMIDA_API_KEY` + `ARTEMIDA_BASE_URL` (server-only; no `NEXT_PUBLIC_*`).
- `lib/i18n/index.ts` / `lib/i18n/messages/ru.ts` — interpolation + `tp()`, plus only the `pricing.*`/`common.retry` keys this plan references.
- `tests/helpers/fake-fetch.ts`, `tests/unit/artemida-client.test.ts` (23 tests), `tests/unit/pricing-route.test.ts` (6 tests), `tests/unit/i18n.test.ts` (5 tests).
- `package.json` / `package-lock.json` — `p-retry@^7.1.1`.
- `vitest.config.ts` — dummy test env (deviation; see below).

## Decisions Made
- **Observed field name wins:** `getPricing` reads `data.quote.amount` (contract), keeping the plan's tolerant fallbacks for `data.amount`/`data.price`. A shape mismatch throws `ArtemidaError("unknown")`, never a `ZodError`, so it is visible in the client unit-vectors rather than looking like a provider outage.
- **Device floor is 2** (provider `minDevices=2`, A7 resolved by 02-01) enforced in three places: route zod `.min(2)`, `TariffPicker.MIN_DEVICES = 2`, and route tests for `devices=1`.
- **Client factory + singleton:** `createArtemidaClient` accepts an injected `fetch` and retry policy for fast tests; the exported `artemida` singleton resolves global `fetch` at call time so route tests can `vi.stubGlobal`.
- **No provider text ever surfaces:** routes log `{route, code, requestId}` and return `{error: code}`; TariffPicker renders `pricing.error`/`common.retry` only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added dummy test env to `vitest.config.ts`**
- **Found during:** Task 1 (running the plan's `npx vitest run ...` verify)
- **Issue:** `lib/env.ts` fails fast at import. `.env.local` currently holds only the ARTEMIDA probe keys, so any unit test importing `lib/env.ts` (including the new client + route tests, and pre-existing `auth-widget.test.ts`) crashed on missing `BOT_TOKEN`/`DATABASE_URL`/`SESSION_SECRET`/`WEBHOOK_SECRET`.
- **Fix:** Added `test.env` defaults (dummy values; hermetic — no network, no real secrets) so the fail-fast schema loads in unit tests.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx tsc --noEmit` clean; the three plan test files pass (23 tests).
- **Committed in:** `67dc0de` (part of Task 1)

**2. [Rule 1 - Bug] Corrected route import depth**
- **Found during:** Task 1 (first `npx tsc --noEmit`)
- **Issue:** `app/api/pricing/route.ts` is three levels below root, not four; the copied auth-route `../../../../lib/*` paths did not resolve.
- **Fix:** Changed to `../../../lib/*`.
- **Files modified:** `app/api/pricing/route.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `67dc0de`

**3. [Rule 1 - Bug] Aligned `p-retry` usage with the installed v7.1.1 types**
- **Found during:** Task 1 (`npx tsc --noEmit` after install)
- **Issue:** `RetryContext` in p-retry 7.1.1 has no `retryDelay` property (the README excerpt showing it was for an unreleased version), so the first `onFailedAttempt` implementation did not typecheck.
- **Fix:** Honor `Retry-After` directly in `onFailedAttempt` (awaited only when `retriesLeft > 0`, capped at 60s).
- **Files modified:** `lib/artemida.ts`
- **Verification:** Retry unit-vectors pass; typecheck clean.
- **Committed in:** `67dc0de`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs).
**Impact on plan:** All three were necessary to make the plan's own verify runnable/typecheck. No scope creep — no new runtime feature beyond the plan.

## Issues Encountered
- **Pre-existing DB-dependent unit test:** `tests/unit/auth-widget.test.ts > rejects a replayed hash` needs a live Postgres (`consumeWidgetHash`). With no local DB it fails; this predates and is unrelated to 02-02 (the plan's verify excludes it). Recorded in `deferred-items.md` and `.planning/WINDOWS.md`.
- **Integration suite not runnable locally** for the same missing-Postgres reason; the task-level automated verify (the authoritative gate) is green.

## User Setup Required
None — `ARTEMIDA_API_KEY` already lives in `.env.local` (gitignored). `ARTEMIDA_BASE_URL` is optional (defaults to `https://artemida.cc/v1`).

## Known Gaps
- **Key-scoped provider shapes remain unobserved** (probe account had 0 keys, recorded as `UNKNOWN (no key available)` in the 02-01 contract): `getKey`, `getSubscriptionLinks`, `getDevices` (and downstream trial/key normalizers) use tolerant `.passthrough()` schemas + multi-key fallbacks. Tracked as an open `unmet-truth` window for the phase that first holds a key.
- **`POST /trial` response shape remains unobserved** (one-time offer not consumed); `createTrial` normalizes tolerantly.

## Next Phase Readiness
- `lib/artemida.ts` is the single contract for all later ARTEMIDA calls — 02-03 (trial route + bot keyboard) and 02-04..02-06 wire routes/services only, never retrofit the client.
- `lib/session.ts#requireSession()` is the shared session gate for every new BFF route.
- `t(key, params)` + `tp()` are ready for the pluralized subscription/device copy in 02-04/02-06.
- No secret is reachable from the browser (T-02-04 mitigated); threat-model dispositions T-02-05/06/07/08 implemented and unit-verified.

## Self-Check: PASSED

- FOUND: lib/artemida.ts
- FOUND: lib/session.ts
- FOUND: app/api/pricing/route.ts
- FOUND: components/TariffPicker.tsx
- FOUND: tests/helpers/fake-fetch.ts
- FOUND: tests/unit/artemida-client.test.ts
- FOUND: tests/unit/pricing-route.test.ts
- FOUND: commit 67dc0de (Task 1)
- FOUND: commit f70277e (Task 2)
- VERIFY: `npx tsc --noEmit` exits 0
- VERIFY: `npx vitest run tests/unit/{artemida-client,pricing-route,i18n}.test.ts` → 23 passed
- DEVICE CLAMP: 2..10 enforced in route zod, TariffPicker, and route tests

---

*Phase: 02-keys-trial*
*Completed: 2026-10-02*
