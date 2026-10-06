# ARTEMIDA Paid API V1 — Locked Contract

**Captured:** 2026-10-02 (read-only baseline) and **2026-10-03** (owner-gated paid create + upgrade probe)
**Base URL:** `https://artemida.cc/v1`
**Machine-readable source of truth:** `docs/artemida-v1-contract.json` (verbatim `--json` probe output).
Raw paid-probe evidence: `docs/artemida-v1-contract-create-probe.json`, `docs/artemida-v1-contract-upgrade-probe.json`.
**Probe account state at capture:** 2026-10-02 — 0 keys, balance 0 RUB, key-scoped endpoints unreachable.
2026-10-03 (owner-funded) — balance 120 RUB; one paid create charged 120 RUB (balance → 0), so the
upgrade success body could not be reached (`402 insufficient_balance` on `{addDevices}`).

> This document records **observed** field names only. Every value below was returned by a live
> authenticated call this session. Anything not reachable is explicitly marked; no field name is
> guessed. A shape mismatch after this point is a bug in the client, not a provider outage.

## Confidence

| Endpoint | Status |
|----------|--------|
| `GET /pricing` | **OBSERVED** (200; 400 for `devices=1`) |
| `GET /keys` | **OBSERVED** (200) |
| `GET /balance` | **OBSERVED** (200) |
| `POST /keys` (paid create) | **OBSERVED** (201; 400 for a bare `{customerRef}`) |
| `POST /keys/{id}/upgrade` | **REQUEST/ERROR OBSERVED** — success body `[UNOBSERVED]` (402 insufficient_balance) |
| `POST /trial` | **NOT OBSERVED** — `UNKNOWN (trial not run)` (one-time offer not consumed) |
| `GET /keys/{id}` | **OBSERVED** (200) |
| `GET /keys/{id}/subscription-links` | **OBSERVED** (200) |
| `GET /keys/{id}/devices` | **OBSERVED** (200) |

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
| POST | `/keys` | body `{customerRef, days:int, devices:int}` (all required; a bare `{customerRef}` fails) + header `Idempotency-Key` | `ok`, `data.operationId`, `data.key.{id,name,customerRef,status,devices,trafficUnlimited,trafficLimitGb,trafficLimitBytes,expireAt,remainingDays,subscriptionUrl,customSubscriptionUrl,createdAt,updatedAt,revokedAt,trial}`, `data.charged`, `data.balance`, `data.currency`, `meta.requestId` | `400 invalid_purchase_params` ("Передайте целые days и devices."); mapped `401`/`402`/`409`/`429`/`502`/`503` |
| POST | `/keys/{id}/upgrade` | body `{addDevices:int}` **ONLY** + header `Idempotency-Key` | `[UNOBSERVED — request/error locked]` (success body not reached; balance 0) | `400 unsupported_fields` (`{days,devices}` rejected); `402 insufficient_balance` (message reports the prorated charge) |
| POST | `/trial` | body `{customerRef}` + `Idempotency-Key` | `UNKNOWN (trial not run)` | `UNKNOWN (trial not run)` |
| GET | `/keys/{id}` | path `id` (a key from `/keys`) | `ok`, `data.key.{id,name,customerRef,status,devices,trafficUnlimited,trafficLimitGb,trafficLimitBytes,expireAt,remainingDays,subscriptionUrl,customSubscriptionUrl,createdAt,updatedAt,revokedAt,trial}`, `meta.requestId` | `404 unknown-route` shape observed elsewhere |
| GET | `/keys/{id}/subscription-links` | path `id` | `ok`, `data.{keyId,subscriptionUrl,fetchedAt,cached,count,vless[],links[],protocols.{vless[]}}`, `meta.requestId` | — |
| GET | `/keys/{id}/devices` | path `id` | `ok`, `data.{items[],used,limit}`, `meta.requestId` | — |

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

## Observed paid-key create shape (2026-10-03)

`POST /keys` — **OBSERVED** (live, owner-gated `--confirm-create-key`; charged real balance).

- **Request body:** `{ customerRef: string, days: int, devices: int }` — `days` and `devices` are
  **required integers**. A bare `{ customerRef }` returns
  `400 {"ok":false,"error":{"code":"invalid_purchase_params","message":"Передайте целые days и devices."}}`.
- **Header:** `Idempotency-Key` (a paid write; a retry must reuse the same key).
- **Request path observed:** `POST /keys` (the `/keys/create` candidate was never needed).
- **Success `201` body field names:** `data.operationId`; `data.key.{ id, name, customerRef, status,
  devices, trafficUnlimited, trafficLimitGb, trafficLimitBytes, expireAt, remainingDays,
  subscriptionUrl, customSubscriptionUrl, createdAt, updatedAt, revokedAt, trial }`; `data.charged`;
  `data.balance`; `data.currency`; `meta.requestId`.
- **Observed example (verbatim field values):** `days=30, devices=2` → `charged: 120` (RUB);
  `key.id: "key_9f603bde96971407"`; `key.status: "ACTIVE"`; `key.trial: false`;
  `key.subscriptionUrl: "https://xskx.artemida.live/M2HGD-qjFynCB9Ns"`;
  `key.expireAt: "2026-11-02T02:58:54.730Z"`; `balance: 0`.
- Note the boolean field is **`trial`** (not `isTrial`) and the link field is **`subscriptionUrl`**.

## Observed upgrade request/error shape (2026-10-03)

`POST /keys/{id}/upgrade` — **REQUEST/ERROR OBSERVED; success body `[UNOBSERVED — request/error locked]`**.

- **Request body:** `{ addDevices: int }` **ONLY**. Sending `{ days, devices }` returns
  `400 {"ok":false,"error":{"code":"unsupported_fields","message":"Неподдерживаемые поля для операции
  «добавление устройств»: days, devices. Используйте только параметры из документации."}}`.
- **Header:** `Idempotency-Key`.
- **Insufficient-balance shape:** with balance 0 after the create, `{ addDevices: 1 }` returns
  `402 {"ok":false,"error":{"code":"insufficient_balance", ...}}`; the provider message reports the
  prorated charge — **"Нужно 60 ₽"** for +1 device on a 30-day key (60 RUB = one device-month).
- **Success `2xx` body:** **`[UNOBSERVED — request/error locked]`** — not reachable because the account
  balance was exhausted by the create. Not fabricated here.
- **Prorated-charge derivation (observed inputs, not guessed):** `apiPricing.devicePricePerMonth = 60`;
  `apiPricing.deviceTiers = [{from:0,price:60},{from:100,price:55},{from:1000,price:50}]`;
  `apiPricing.volume.devices` is the tier basis ("…including the order being placed"); `apiPricing.upgradeRule`
  = *"tier device price per added device; minimum one full month, proportional above 30 remaining days"*.
  Derivation: `amount = selectedDeviceTierPrice(volume.devices + addDevices) × addDevices × max(1, remainingDays/30)`.
  For `+1` device on a 30-day key this yields `60 × 1 × 1 = 60 RUB`, matching the observed `402` quote.
  The provider recomputes the authoritative charge server-side on the real call.

## Observed key-scoped shapes (2026-10-03)

The upgrade probe held a real key, so the three Phase-2 `UNKNOWN (no key available)` endpoints were
observed in the same session:

- `GET /keys/{id}` → `data.key.{id,name,customerRef,status,devices,trafficUnlimited,trafficLimitGb,
  trafficLimitBytes,expireAt,remainingDays,subscriptionUrl,customSubscriptionUrl,createdAt,updatedAt,
  revokedAt,trial}`.
- `GET /keys/{id}/subscription-links` → `data.{keyId,subscriptionUrl,fetchedAt,cached,count,vless[],
  links[],protocols.{vless[]}}` (the `vless`/`links` entries are placeholder links for the probe key).
- `GET /keys/{id}/devices` → `data.{items[],used,limit}`.

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
3. **Key-scoped shapes are now locked (was `UNKNOWN`).** The 2026-10-03 upgrade probe held a real key,
   so `GET /keys/{id}`, `/subscription-links` and `/devices` returned `200` and their field names are
   recorded above. `lib/artemida.ts` normalizers map them (`data.key` nesting, `devices` count,
   `expireAt`, `trial`, `subscriptionUrl`).
4. **Trial response shape remains unlocked.** `POST /trial` was deliberately not called; the
   trial request/response shape stays `UNKNOWN (trial not run)` until the owner approves
   consuming the one-time offer.
5. **Upgrade takes `{addDevices}`, NOT `{days,devices}` (blocks PAY-03 wire correctness).** The
   provider rejects `{days,devices}` with `400 unsupported_fields`. `lib/artemida.ts::upgradeKey`
   currently posts `{days,devices}` (used by no shipped caller yet) and **MUST be switched to
   `{addDevices}` before plan 03-04 wires upgrade fulfillment** — flagged so 03-04 is revised against
   this observed shape rather than the pre-probe assumption.
6. **Paid create requires integer `days` + `devices`.** A bare `{customerRef}` is rejected
   (`400 invalid_purchase_params`); `lib/artemida.ts::createKey` posts all three observed fields.

## Secret hygiene

The ARTEMIDA API key and the `Authorization` header value appear nowhere in this document, in
`docs/artemida-v1-contract.json`, or in the two raw paid-probe artifacts
(`docs/artemida-v1-contract-create-probe.json`, `docs/artemida-v1-contract-upgrade-probe.json`).
The probe reads the key from the process env only, never prints it, and each artifact is grepped for
the literal key value before commit (T-02-01 / T-03-01).
