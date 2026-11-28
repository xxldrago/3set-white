---
phase: "21"
slug: "subscription-purchase-7-days"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-11-28"
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail. Register authored at plan time in all six `21-NN-PLAN.md` `<threat_model>` blocks; ASVS L1, `block_on: high`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client → mobile BFF routes | JWT (`verifyAccessToken`) on `/api/mobile/*`; stable `{ok:false,error}` envelope | access token, device count, promo code, order id |
| BFF → ARTEMIDA | Server-only Bearer + `Idempotency-Key`; client never calls provider | key/link/expiry, pricing quote, wallet |
| Platega → webhook | Header signature (`timingSafeEqual`), merchant check, server re-query, amount/currency equality | signature headers, transaction id, payment status |
| Webhook/worker → Postgres | Atomic outbox claim with deterministic `order:{id}:{kind}` key | payment state, entitlement (key issuance) |
| App → WebView | Server-returned `payment_url` gated by https + absolute URL + provider-host allowlist; navigation interception on every redirect | payment URL, no token/paymentUrl logged or persisted |
| Client entitlement display | Server `statusKind`/`graceUntil`/`hasActiveKey` authoritative; no local 24h math in gates | expiry/status flags only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-21-01 | Spoofing | both payment routes | high | mitigate | `verifyAccessToken` + 401 (create/:90, status/[id]/:46) | closed |
| T-21-02 | Tampering | `/payments/create` body | high | mitigate | zod strict, devices 2..10, `TARIFF_DAYS` refine, no `amount`; server quotes (create/:37-68,172) | closed |
| T-21-03 | Information disclosure | `/payments/status/{id}` | high | mitigate | `loadOrderForUserId`, byte-identical 404, no tx id in body (status/:65-69) | closed |
| T-21-04 | Tampering | Platega callback | high | mitigate | timing-safe headers, merchant, re-query, amount/currency, atomic claim (callback/:66-164) | closed |
| T-21-05 | Tampering | key issuance | high | mitigate | no client issuer; worker sole issuer; deterministic idempotency (single-issuer.test:31-47, worker:213) | closed |
| T-21-06 | Tampering | WebView navigation | high | mitigate | https + absolute + exact/subdomain provider-host allowlist (`pay.platega.io` default, `PLATEGA_PAYMENT_HOST` override) at create-response and router entry, plus `shouldOverrideUrlLoading` cancellation of off-allowlist redirects (payment_flow:127-139,171-204,232-234; router:106-115) | closed (fixed in `dde4984`) |
| T-21-07 | Information disclosure | logs and UI copy | high | mitigate | 7 mobile routes log only `{route,requestId,outcome,code,retryAfterSec,durationMs}` | closed |
| T-21-08 | Tampering | simulated payment | medium | mitigate | DB status only; no timer/demo success (status/:71-80; payment_flow:281-291) | closed |
| T-21-09 | Information disclosure | pending order persistence | medium | mitigate | only non-secret order id in `FlutterSecureStorage` (payment_flow:69-93,241,285) | closed |
| T-21-SC | Tampering | package installs | high | mitigate | `blocking-human` gate + exact `flutter_inappwebview: 6.1.5` pin; no new packages in plans 02–06 (pubspec:20; STATE.md:126) | closed |
| T-21-10 | Spoofing | `/subscription` | high | mitigate | `verifyAccessToken` (subscription/:56-60) | closed |
| T-21-11 | Information disclosure | subscription response | high | mitigate | `listKeysByUserId` → `getSubscriptionForUserId` ownership filter (subscription/:83,97; keys-service:157,273) | closed |
| T-21-12 | Tampering | grace predicate | high | mitigate | pure helper `GRACE_MS=86_400_000`, trial excluded, ±1ms fixtures (subscription-view:13,62; grace.test:43-71) | closed |
| T-21-13 | Tampering | `/servers` and `/config` gates | high | mitigate | both delegate to shared `isKeyConnectable` (servers/:24; config/:54; subscription-view:78) | closed |
| T-21-14 | Information disclosure | subscription logs | high | mitigate | stable outcome codes only; no link/provider text (subscription/:58,86,121,142) | closed |
| T-21-15 | Elevation of privilege | deviceLimit surface | low | accept | display-only; device management deferred to Phase 22 (`21-02-PLAN.md:167`) — see Accepted Risks Log | closed (accepted) |
| T-21-16 | Spoofing | pricing/promo routes | high | mitigate | `verifyAccessToken` (pricing/:56; promo/:51) | closed |
| T-21-17 | Tampering | devices query | high | mitigate | zod 2..10, no amount accepted (pricing/:27-29; promo/:22) | closed |
| T-21-18 | Tampering | promo preview | high | mitigate | `validatePromo` read-only, no `consumePromo`, one stable `promo_invalid` code (promo/:79-83) | closed |
| T-21-19 | Information disclosure | error bodies | high | mitigate | stable 200 codes, no 5xx/provider text (pricing/:92-123; promo/:91-95) | closed |
| T-21-20 | Denial of service | batched quote | medium | mitigate | one five-term request/loop (pricing/:78-82) | closed |
| T-21-21 | Tampering | client price preview | high | mitigate | server unit/percent only, no amount posted, no Dart price table (providers.dart:139,190,222) | closed |
| T-21-22 | Tampering | subscription model | high | mitigate | freezed model decodes `statusKind`/`graceUntil`; no grace computation (models/subscription.dart:22-46) | closed |
| T-21-23 | Information disclosure | provider error copy | high | mitigate | allowlisted Russian notices; all failures mapped (providers.dart:42-68,93-113) | closed |
| T-21-24 | Spoofing | Bearer handling | high | mitigate | `AuthInterceptor` owns tokens (dio_client:34; providers.dart:141-211) | closed |
| T-21-25 | Tampering | generated model parts | medium | mitigate | build_runner generated `.freezed.dart`/`.g.dart`, not hand-edited | closed |
| T-21-26 | Tampering | Shop price rendering | high | mitigate | server pricing provider only; no literal price table in Dart (shop_screen:85,183; shop_widgets) | closed |
| T-21-27 | Information disclosure | copy link | high | mitigate | `Clipboard.setData` seam only; no logging/persistence (shop_screen:37-40,207-215) | closed |
| T-21-28 | Tampering | confetti trigger | high | mitigate | rising edge from DB-derived status only (shop_screen:227-232; confetti:99-149) | closed |
| T-21-29 | Elevation of privilege | trial UI | high | mitigate | hide renew/upgrade; backend 409 `trial` (shop_screen:255,285; create/:131-134) | closed |
| T-21-30 | Spoofing | gating UI | high | mitigate | server `statusKind`/`graceUntil`/`hasActiveKey`; new `ExpiresSoonBanner` server-gated with no local time math (shop_screen:194,387-393; shop_widgets `ExpiresSoonBanner`) | closed |
| T-21-31 | Tampering | payment chips | medium | mitigate | UI-only, no `paymentMethod` binding in create body (providers.dart:128,196; shop_widgets:348-399) | closed |
| T-21-32 | Tampering | pending order resume | high | mitigate | resume polls stored id only, never re-creates (payment_flow:248-296) | closed |
| T-21-33 | Information disclosure | secure storage | high | mitigate | no URL/token/tx id stored or logged (payment_flow:69-93,241,285) | closed |
| T-21-34 | Spoofing | deep-link return | high | mitigate | no CONFIRMED side effect from return URL (router:106-147; deep_link_handler) | closed |
| T-21-35 | Elevation of privilege | connect panel gate | high | mitigate | server `hasActiveKey`; no local 24h computation (connect_panel:100; server_pool_screen:83,186) | closed |
| T-21-36 | Tampering | duplicate key issuance | high | mitigate | source-level single-issuer guard, 4 invariants (single-issuer.test:31-105; worker:213; outbox:25) | closed |
| T-21-37 | Denial of service | poll timeout | medium | mitigate | 100-attempt cap → `timeout`, no fake success (payment_flow:155-157,255,294-295) | closed |

*Status: closed · open · open — below `block_on` threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-21-01 | T-21-15 | `deviceLimit` and `devices[]` are display-only in this phase; add/remove device enforcement is locked to Phase 22 (D-02 / REQ-SUB-04 deferred). No entitlement decision is made client-side. | gsd-security-auditor verdict + orchestrator (locked plan rationale, user-confirmed phase scope) | 2026-11-28 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-28 | 38 | 36 | 2 (1 blocking: T-21-06; 1 non-blocking accepted: T-21-15) | gsd-security-auditor (initial) |
| 2026-11-28 | 38 | 38 | 0 | gsd-security-auditor (post-fix re-verification: `dde4984`, `d9b7a6f`, `4bcfac9`, `34458ec`) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-28
