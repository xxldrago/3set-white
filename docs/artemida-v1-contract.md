# ARTEMIDA Paid API V1 — Locked Contract

**Captured:** 2026-10-02 by `scripts/artemida-probe.mjs` (live, authenticated, read-only)
**Base URL:** `https://artemida.cc/v1`
**Machine-readable source of truth:** `docs/artemida-v1-contract.json` (verbatim `--json` probe output)
**Probe account state at capture:** 0 keys, balance 0 RUB — key-scoped endpoints could not be exercised.

> This document records **observed** field names only. Every value below was returned by a live
> authenticated call this session. Anything not reachable is explicitly marked; no field name is
> guessed. A shape mismatch after this point is a bug in the client, not a provider outage.

## Confidence

| Endpoint | Status |
|----------|--------|
| `GET /pricing` | **OBSERVED** (200; 400 for `devices=1`) |
| `GET /keys` | **OBSERVED** (200, empty list) |
| `GET /balance` | **OBSERVED** (200) |
| `POST /trial` | **NOT OBSERVED** — `UNKNOWN (trial not run)` (one-time offer not consumed) |
| `GET /keys/{id}` | **NOT OBSERVED** — `UNKNOWN (no key available)` |
| `GET /keys/{id}/subscription-links` | **NOT OBSERVED** — `UNKNOWN (no key available)` |
| `GET /keys/{id}/devices` | **NOT OBSERVED** — `UNKNOWN (no key available)` |

## Transport (verified live)

| Property | Observed value |
|----------|----------------|
| Base URL | `https://artemida.cc/v1` (trailing slash → `301`; base without slash is correct) |
| Auth scheme | `Authorization: Bearer <ARTEMIDA_API_KEY>` (header value never logged/committed) |
| Request id echo | Response header `X-Request-Id: req_…`; also mirrored at `meta.requestId` for JSON `/v1` endpoints |
| Rate-limit header | `X-RateLimit-Policy: adaptive-account-and-ip` |
| Cache header | `Cache-Control: no-store` |
| CORS | `OPTIONS` → `501`; provider CSP `connect-src 'self'` — **server-to-server only**, browser must never call it |
| Error envelope (object) | `{"ok":false,"error":{"code":"<code>","message":"<ru text>"},"meta":{"requestId":"req_…"}}` |
| Error envelope (string) | `{"ok":false,"error":"Маршрут не найден"}` — 404 unknown-route shape; `error` is a plain string |
| Success envelope | `{"ok":true,"data":{…},"meta":{"requestId":"req_…"}}` |

The client parser MUST accept both `error` shapes (object and string) `[VERIFIED 2026-10-01: https://artemida.cc/api/quote]`.

## Endpoint contract

| Method | Endpoint | Request | Observed success body (field names) | Observed error codes |
|--------|----------|---------|-------------------------------------|----------------------|
| GET | `/pricing` | query `days` (int), `devices` (int) | `ok`, `data.segment.{id,title,currency,base_devices,prices_by_days{7,30,60,90}}`, `data.periods[]`, `data.minDevices`, `data.maxDevices`, `data.discountTiers[]`, `data.apiPricing.{baseDevices,keyTiers[]{from,price},deviceTiers[]{from,price},periodFactors{7,30,60,90},volume{keys,devices},keyPrices{7,30,60,90},keyMonthPrice,devicePricePerMonth,personal,tierBasis,upgradeRule}`, `data.trial.{days,devices,amount,currency}`, `data.quote.{devices,days,amount,currency}`, `meta.requestId` | `400 invalid_pricing_params` (observed for `devices=1`); error envelope object |
| GET | `/keys` | query `limit`,`offset`? (empty list observed) | `ok`, `data.items[]`, `data.count`, `data.query`, `meta.requestId` | — |
| GET | `/balance` | — | `ok`, `data.balance`, `data.currency`, `data.unlimited`, `meta.requestId` | — |
| POST | `/trial` | body `{customerRef}` + `Idempotency-Key` | `UNKNOWN (trial not run)` | `UNKNOWN (trial not run)` |
| GET | `/keys/{id}` | path `id` (first key from `/keys`) | `UNKNOWN (no key available)` | `UNKNOWN (no key available)` |
| GET | `/keys/{id}/subscription-links` | path `id` | `UNKNOWN (no key available)` | `UNKNOWN (no key available)` |
| GET | `/keys/{id}/devices` | path `id` | `UNKNOWN (no key available)` | `UNKNOWN (no key available)` |

## Observed pricing details

Three successful quotes were observed with `devices=2`:

| `days` | `data.quote.amount` | `currency` |
|--------|---------------------|------------|
| 7 | 49 | RUB |
| 30 | 120 | RUB |
| 90 | 300 | RUB |

`data.periods` = `[7, 30, 60, 90]` — the provider also offers a **60-day** period (220 RUB per
`data.segment.prices_by_days`), beyond the requirement's locked 7/30/90 set.

`data.minDevices` = `2`, `data.maxDevices` = `9999`.

`data.trial` (offer metadata returned by `/pricing`, not the `/trial` response):
`{ "days": 1, "devices": 2, "amount": 2, "currency": "RUB" }`.

## Findings that affect downstream plans

1. **`devices=1` is rejected (A7 resolved).** `GET /pricing?days=7&devices=1` returned
   `400 {"ok":false,"error":{"code":"invalid_pricing_params","message":"Параметры тарифа вне допустимого диапазона."}}`.
   The provider minimum is **2 devices** (`data.minDevices=2`). Requirement TRIAL-02 locks a
   1–10 device selector, so plan 02-02's `/api/pricing` and the tariff picker MUST clamp the
   minimum to **2** (server-side guard + UI stepper floor). This is a requirements-vs-provider
   clamp decision surfaced for the owner.
2. **60-day period exists.** The provider accepts `days=60`; requirements only show 7/30/90.
   `/api/pricing` should still restrict input to the locked `[7,30,90]` set (D-26) unless the owner
   expands the offering.
3. **Key-scoped shapes remain unlocked.** The probe account held 0 keys, so `GET /keys/{id}`,
   `/subscription-links` and `/devices` could not be observed. `lib/artemida.ts` (plan 02-02) MUST
   keep these three schemas tolerant/`.passthrough()` until a key exists to re-probe; the
   CAB-03/CAB-04 response contracts are still `[ASSUMED]`.
4. **Trial response shape remains unlocked.** `POST /trial` was deliberately not called; the
   trial request/response shape stays `UNKNOWN (trial not run)` until the owner approves
   consuming the one-time offer.

## Secret hygiene

The ARTEMIDA API key and the `Authorization` header value appear nowhere in this document or in
`docs/artemida-v1-contract.json`. The probe reads the key from the process env only, never prints
it, and the artifact is grepped for the literal key value before commit (T-02-01).
