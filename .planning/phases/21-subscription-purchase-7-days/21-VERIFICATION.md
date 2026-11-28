---
phase: 21-subscription-purchase-7-days
verified: 2026-11-28T05:39:16Z
status: human_needed
score: 35/35 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "REQ-SUB-04 device-limit enforcement (block add when at limit, «Лимит устройств достигнут»)"
    addressed_in: "Phase 22"
    evidence: "ROADMAP Phase 22 task 22.1 «Backend: /api/mobile/devices — GET list, DELETE remove» and 22.4 «Add Current Device — button → POST → appears in list»; 21-CONTEXT.md §Deferred Ideas line 148; 21-02-PLAN.md T-21-15 accept. Phase 21 surfaces deviceLimit/devices for display only, no mutation endpoint."
  - truth: "REQ-SUB-05 copy-link button in the profile sheet (shop-side copy is delivered)"
    addressed_in: "Phase 22"
    evidence: "ROADMAP Phase 22 task 22.2 «Profile Sheet — … subscription status, device count, link copy | Matches prototype»; no profile screen exists yet. In-phase shop and success-overlay copy actions are implemented and widget-tested."
  - truth: "REQ-BE-08 OpenAPI → Dart type generation in CI"
    addressed_in: "Advisory / not scheduled (locked decision)"
    evidence: "21-02-PLAN.md:24, 21-04-PLAN.md:50 and 21-04-SUMMARY.md:47 record REQ-BE-08 as advisory/deferred; no generator or new package added. No later roadmap phase claims it."
human_verification:
  - test: "Live Platega test-mode purchase end-to-end: create → hosted page → CONFIRMED webhook → key issued exactly once; then CANCELED / CHARGEBACKED / DISPUTED settlements."
    expected: "Order completes, /payments/status/{id} becomes provisioned, confetti + dated toast appear, subscription refresh shows the real key; non-success statuses issue nothing and clear the pending id."
    why_human: "Platega test credentials are an external blocker (STATE.md / 21-VALIDATION.md); no real payment was attempted and simulation is explicitly forbidden. Only source-level and mocked-fetch proof exists."
  - test: "On a physical device, open the hosted payment URL in the in-app WebView, leave the page open through settlement, then kill the app mid-payment and relaunch."
    expected: "The 3s poll runs while the WebView is open with «Ожидаем оплату…» visible; after a kill, startup resumes from the stored non-secret order id without a second create; on-allowlist redirects stay in-app and off-allowlist navigation is cancelled; terminal statuses clear the id; Android debug build and iOS compile succeed."
    why_human: "WebView lifecycle, native builds and concurrent navigation/poll timing require a device/SDK; covered in code by the never-completing-launcher and allowlist tests but not observable in this host."
  - test: "Visual comparison of the Shop screen, days/30 ring, «Истекает вскоре» banner and confetti overlay against .planning/seeds/prototype-mobile-client.html."
    expected: "Dark theme, five terms with «Хит» on 1м, ten stepper dots, threshold ring colors, correct RU copy, status-driven confetti with real expiresAt date and working copy-link affordance."
    why_human: "21-UI-REVIEW.md is a static audit (no screenshots captured, no browser/Playwright session). Visual fidelity and animation feel are manual-only by locked decision."
  - test: "With a real expired (non-trial) key at expiresAt + 24h ± 1ms and a live tunnel, tap connect through the app."
    expected: "Connection is allowed inside grace and denied just past it; /servers and /config agree with /subscription; the expiring banner reflects the server-supplied deadline without client-side 24h math."
    why_human: "Needs a paid ARTEMIDA key, a real tunnel and device timing; the ±1ms predicate and both gate fixtures are unit-proven but the live entitlement path cannot be exercised here."
  - test: "Confirm the deployed Platega hosted-page hostname against PaymentFlow.allowedPaymentHosts / PLATEGA_PAYMENT_HOST."
    expected: "The real provider host (and its subdomains) is allowlisted at runtime; arbitrary https hosts and suffix/label tricks are rejected."
    why_human: "21-REVIEW-FIX.md marks the allowlist default as a logic-sensitive control worth a human eye for any custom deployment; negative vectors are unit-tested but the production merchant host is external config."
  - test: "Complete the inherited phase-19 and phase-20 deferred UAT before milestone close."
    expected: "The 7 open items in 19-VERIFICATION.md and 8 open items in 20-VERIFICATION.md (live ARTEMIDA links[], real ping/fallback, native builds, tunnel/kill-switch, network-change reconnect) are resolved."
    why_human: "Device/live-key/native items explicitly deferred by the prior phases; phase 21 changed the phase-19/20 connect gates via D-10 and must re-check them on-device."
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
---

# Phase 21: Subscription & Purchase (7 days) Verification Report

**Phase Goal:** Full purchase flow — subscription status, shop, Platega payment, key issuance.
**Verified:** 2026-11-28T05:39:16Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior `21-VERIFICATION.md` existed)

**Evidence policy:** SUMMARY.md claims were treated as narration only. Every artifact below was re-read in the
working tree, every key link was traced through imports/call sites, and the automated suites were executed in
this session (not copied from SUMMARY/VALIDATION). No implementation file was modified by this verification.

## Goal Achievement

### Observable Truths

All truths are consolidated from the six PLAN frontmatter `must_haves.truths` blocks (35 unique truths).
Roadmap §Phase 21 has no `success_criteria` array; its tasks 21.1–21.13 and deliverables are covered by the
requirement matrix below. Phase mode is not `mvp` (no `**Mode:** mvp` in ROADMAP.md), so standard verification applies.

| # | Truth (source plan) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | JWT client POSTs `/payments/create` → `{ok:true,orderId,paymentUrl}`; pending order persisted, amount server-quoted (P01) | ✓ VERIFIED | `app/api/mobile/payments/create/route.ts:84-188` — `verifyAccessToken`, zod strict object with no `amount`, `createOrder(input)` at :172, response at :181. `tests/unit/mobile-payments-route.test.ts` asserts orderId/paymentUrl envelope and 401/bad_request (92/92 backend suite). |
| 2 | Only server-returned https URL opened in in-app WebView; 3s/≤5min ownership-safe poll; identical 404 (P01) | ✓ VERIFIED | `payment_flow.dart:192-204` allowlist validator, :241-243 `unawaited(openPaymentPage)` + `_poll`, :155-157 3s×100; status route `status/[id]/route.ts:65-69` uses `loadOrderForUserId` and one `not_found` body. Unit tests: "accepts only absolute https URLs on an allowlisted provider host", "polls every 3s with a 100-attempt cap", "poll runs even when the WebView is never dismissed", byte-identical 404 vectors. |
| 3 | Webhook → outbox → worker is sole issuer; CONFIRMED idempotent on transaction_id; no client issuer (P01) | ✓ VERIFIED | `find app/api/mobile -type d -name keys` → none; grep for `keys/(issue\|renew)` under `app/api/mobile` → none. `tests/unit/mobile-single-issuer.test.ts:32-105` asserts no issue/renew route or direct call, header verify before parse, re-query, amount+currency equality, atomic one-row claim, worker `order:${id}:${kind}` key. |
| 4 | No amount/discount/paymentUrl/tx id/token/provider text in logs, bodies or UI (P01) | ✓ VERIFIED | All six mobile routes log only `{route,requestId,outcome,code,retryAfterSec,durationMs}` (grep for secret fields in `logger.*` calls → none); status route serializes only `status/paidAt/provisionedKeyId`; Dart no price literals, no mock URL, no token handling in providers; payment-flow storage writes only `orderId` (:85-86, :241). |
| 5 | No simulated payment; success only from DB status written by webhook (P01) | ✓ VERIFIED | `payment_flow.dart:299-316` maps terminal status only (`provisioned` = success; CANCELED/CHARGEBACKED/DISPUTED/refund non-success); test "never reports success from a timer: paid is not terminal". Live settlement is a separate human item (below). |
| 6 | WebView dependency human-verified at pub.dev and build-compatible before install (P01) | ✓ VERIFIED | Recorded blocking-human gate in `.planning/STATE.md:126,128` (publisher, exact stable 6.1.5 not beta, SDK coverage), `21-01-SUMMARY.md` gate commit `88dc24f`; `mobile/pubspec.yaml` exact pin `flutter_inappwebview: 6.1.5`, no other new package in plans 02–06. |
| 7 | `/subscription` returns real owned-key status with all eight fields; `keys:[]` stub gone (P02) | ✓ VERIFIED | `app/api/mobile/subscription/route.ts:83-136`: `listKeysByUserId` → `isKeyConnectable` → one `getSubscriptionForUserId(userId, active.id)` at :97; response :129-136 carries `expiresAt, remainingDays, deviceLimit, link, devices, isTrial, statusKind, graceUntil`. No `keys: []` literal in route. `mobile-subscription-route.test.ts` covers fields/ownership/degradation. |
| 8 | One shared pure predicate owns statusKind+graceUntil; `/subscription`, `/servers`, `/config` consume it (P02) | ✓ VERIFIED | `lib/subscription-view.ts:62-92` pure `deriveSubscriptionStatus`/`isKeyConnectable`; `servers/route.ts:13,24-25` delegates `isActiveKey`; `config/route.ts:16,54` imports `isActiveKey`; `subscription/route.ts:17,84,120` uses both. No inline duplicate status check found. |
| 9 | Boundary fixtures at `expiresAt + 24h ± 1ms`; trial keys never graced (P02) | ✓ VERIFIED | `tests/unit/subscription-grace.test.ts` (105 lines) with ±1ms fixtures, trial exclusion, raw-status exclusions and independent `expect(GRACE_MS).toBe(24*60*60*1000)`; `mobile-servers-route.test.ts` / `mobile-config-route.test.ts` grace allow/deny vectors. Suite green. |
| 10 | Missing/non-owned/raw-disqualified key treated as no key; client computes no grace (P02) | ✓ VERIFIED | `subscription-view.ts:78-92` id + raw-status disqualification + grace branch; `subscription/route.ts:88-90` `no_active_key`. Client grep for `DateTime.now`/`86400000`/`Duration(hours: 24)` across subscription/shop/payment/connect files → none; `ExpiresSoonBanner` uses only `DateTime.tryParse(graceUntil)` for display (`shop_widgets.dart:670`). |
| 11 | deviceLimit/devices surfaced for display only; enforcement deferred to Phase 22 (P02) | ✓ VERIFIED | Response fields at `subscription/route.ts:131,133`; models decode them; no device mutation endpoint or UI exists. Deferred to Phase 22 (see deferred block). `T-21-15` accepted in `21-SECURITY.md:48,82`. |
| 12 | No key status/link/provider text in logs; only stable codes (P02) | ✓ VERIFIED | `subscription/route.ts` logs `{route,requestId,outcome,durationMs}` at :58,88,101,115,141; no `subscriptionUrl`/link in any log call. |
| 13 | `/pricing` returns five ordered terms at live server prices; 115/400/1000/1900/3800 at 2 devices (P03) | ✓ VERIFIED | `app/api/mobile/pricing/route.ts:78-91` loops `TARIFF_DAYS` through `resolveTariffQuote` and returns `{ok,currency,terms}`; `tariff-markup.test.ts` locked vectors "is locked to the owner's values" and "adds the markup to the provider price for every term" each pass in isolation (1/1); `mobile-pricing-route.test.ts` asserts order/values. |
| 14 | Mobile devices bound 2..10; TARIFF_MAX_DEVICES stays 9999; out-of-range 400 (P03) | ✓ VERIFIED | `pricing/route.ts:28` zod coerce int min2 max10; `create/route.ts:30-31,46,139-147` same bounds incl. upgrade total; grep confirms `lib/tariff-grid.ts` untouched by phase 21; bad_request vectors pass. |
| 15 | Route never accepts client amount; client never calls ARTEMIDA or web `/pricing` (P03) | ✓ VERIFIED | zod `strictObject` with no amount on create/promo; pricing response has no amount input; Dart grep for price literals and ARTEMIDA calls → none; all traffic through `Endpoints` constants via `dioClientProvider`. |
| 16 | `/promo/apply` read-only preview, code+percentage only, no consumption, no oracle (P03) | ✓ VERIFIED | `promo/apply/route.ts:13,77-88` imports only `validatePromo`, probe amount discarded, `{ok:true,code,discountPercent}`; `consumePromo` absent (grep); unknown/malformed/exhausted all `promo_invalid`; tests assert no oracle and no authoritative amount. |
| 17 | Provider failures → 200 `{ok:false,error}` stable code, no text/5xx (P03) | ✓ VERIFIED | Error mapping in all six routes returns status 200 with typed codes (401/400/404/409 exceptions where required); logs carry code only; `mobile-pricing-route.test.ts` rate-limit vector and promo invalid vector pass. |
| 18 | Hand-written freezed models decode four responses with @JsonKey; build_runner parts, no OpenAPI generator (P04) | ✓ VERIFIED | Four `models/*.dart` + 8 generated parts exist (579/576/294/615 `.freezed.dart`; 47/37/23/53 `.g.dart` lines); `build_runner` clean per `21-UI-REVIEW-FIX.md`; `providers_test.dart` decodes subscription/promo/payment-create; no generator dependency added. |
| 19 | `pricingPlansProvider` backed by GET `/pricing`; no hardcoded Dart prices (P04) | ✓ VERIFIED | `providers.dart:139-153` `Endpoints.pricing` with `deviceCountProvider` watch; grep for `115\|400\|1000\|1900\|3800` in Dart lib excluding generated → none; widget test "server amounts are used verbatim, never a Dart price table". |
| 20 | `userSubscriptionProvider` backed by `/subscription` with all fields; no client grace/local stub (P04) | ✓ VERIFIED | `providers.dart:155-163` uses `Endpoints.subscription`; `models/subscription.dart` decodes `statusKind/graceUntil/devices/isTrial`; tests assert server values emitted and no local 24h math (truth 10). |
| 21 | Payment create/status providers use plan-01 routes; mock URL gone (P04) | ✓ VERIFIED | `providers.dart:190-215` uses `Endpoints.paymentCreate` / `Endpoints.paymentStatus`; grep for `dash.3set.online/payment/mock` → none; test asserts `paymentUrl` not containing `payment/mock`. |
| 22 | Live-sum preview multiplies server unit by devices and applies server percentage only (P04) | ✓ VERIFIED | `providers.dart:222` `previewTotalRub` with server `unitAmount` + server `discountPercent`; `shop_screen.dart:199-209` base/total/discount derivation; test `previewTotalRub(115,2,15)==98`; create body has no amount. |
| 23 | Every provider maps `{ok:false,error}` to stable Russian copy; no provider text/5xx (P04) | ✓ VERIFIED | `providers.dart:27-68,82` `SubscriptionFailure` allowlist + frozen notices; grep shows no raw exception passthrough; test "unknown wire codes and transport errors never reach the UI as text". |
| 24 | Shop stub replaced by dark ConsumerWidget: 5 terms, 2..10 dots stepper, promo field, chips, live summary (P05) | ✓ VERIFIED | `shop_screen.dart` (495 lines) + `shop_widgets.dart` (819 lines) real widgets; widget tests for terms, «Хит», stepper bounds/dots, summary, chip persistence; no `NavigationBar` in router or screen. |
| 25 | «Хит» only on 1 month; invalid promo shake+error; valid code shows server percentage (P05) | ✓ VERIFIED | Widget tests "renders five server terms in order and hits only 1 month" and "invalid promo shows stable Russian error and no discount"; promo state via `appliedPromoCodeProvider` + server `discountPercent`. |
| 26 | Payment chips UI-only persisted state; no Platega paymentMethod binding (P05) | ✓ VERIFIED | `paymentMethodProvider` at `providers.dart:128` (StateProvider, UI only); create intent `PaymentRequest` has no paymentMethod/amount field; widget test "pay hands intent to the real flow without amount or chip". |
| 27 | days/30 ring CustomPainter with threshold colors, no flutter_svg/load bar; copy link via clipboard + toast (P05) | ✓ VERIFIED | `ring_painter.dart` (104 lines) clamped CustomPainter; widget test "ring is clamped and colored only by day thresholds"; `shop_screen.dart:167-178` `Clipboard.setData` seam + «Ссылка скопирована»; widget test "copy uses the clipboard seam and shows the frozen toast". |
| 28 | Confetti CustomPainter overlay only on real CONFIRMED/provisioned transition, key details + real-date toast (P05) | ✓ VERIFIED | `confetti_overlay.dart` (275 lines) status-driven `AnimationController`, date from `expiresAt`, optional `onCopyLink` (fix `650ea16`); widget tests "confetti needs a real status transition, not a timer pump", "a screen opened already provisioned never replays confetti", "success overlay copies the real server link…". |
| 29 | Trial keys hide renew/upgrade + «Триал не продлевается»; no-key gate «Нужен активный ключ» → shop, no bottom nav (P05) | ✓ VERIFIED | `shop_screen.dart:303-330` gating; `connect_panel.dart:95,101-109` toast/shop redirect; router `/shop` renders `ShopScreen`; widget tests for trial/nav/no-key + `router_test.dart` source assertions. |
| 30 | Killed-app resume reads only stored non-secret order id and polls to terminal (D-06, P06) | ✓ VERIFIED | `payment_flow.dart:248-252` `resumePending`; wired into production by fix `5b17d1c`: `payment_resume_listener.dart` `paymentResumeListenerProvider` watched at `main.dart:40`; tests "resumes a stored PENDING order by polling, never by a second create" and "watching at startup calls resumePending exactly once". |
| 31 | Pending id cleared on CONFIRMED/CANCELED/CHARGEBACKED/DISPUTED/refund; no URL/token/secret stored (P06) | ✓ VERIFIED | `payment_flow.dart:299-316` terminal normalization + cleanup; `SecurePendingOrderStore` writes only `orderId` (:85-86); tests "clears the stored id on $status without ever showing success", "persists only the non-secret order id", "normalizes provider status spelling". |
| 32 | `/shop` renders real Shop Screen, no bottom nav; WebView route without deep-link confirmation (P06) | ✓ VERIFIED | `router.dart:97-101` `/shop` → `ShopScreen`, :106-115 `/payment/webview` reuses `PaymentFlow.isHttpsPaymentUrl` and has no status side effect; `router_test.dart` asserts real screen, no `NavigationBar`, no `purchaseStatusProvider`/`onProvisioned` in router source. |
| 33 | No-active-key (and no-grace) connect blocked with exact toast and shop redirect; server gate authoritative (P06) | ✓ VERIFIED | `connect_panel.dart:50-51,95,101-109` consumes server `hasKey`; `server_pool_screen.dart` routes buy actions to `/shop` (fix `993d4c7`); tests "no-key connection is blocked with the exact toast and shop route", "a connectable key still drives the FSM". |
| 34 | REQ-BE-05 superseded: no client issue/renew route; webhook→outbox→worker sole issuer, idempotent on transaction_id (P06) | ✓ VERIFIED | Truth 3 evidence plus `tests/unit/mobile-single-issuer.test.ts:31-105` (4 invariants) and existing `callback-route.test.ts`/`outbox-worker.test.ts` (28/28 with the guard in the prior audit); `21-SECURITY.md` threats T-21-05/T-21-36 closed. |
| 35 | All phase-21 automated suites green; live payment/WebView/device gating recorded human-only (P06) | ✓ VERIFIED | This session: backend 8 files 92/92 pass; mobile 6 files 69/69 pass; `npx tsc --noEmit` exit 0; `npx prisma validate` valid; `flutter analyze --no-fatal-infos --no-fatal-warnings` exit 0 (0 errors/warnings). Manual items enumerated below. |

**Score:** 35/35 truths verified (0 present-but-behavior-unverified, 0 overrides).
**Status driver:** `human_needed` — the phase is user-facing and carries explicit external/device/visual UAT items
(Step 9 rule 2); no truth failed and no artifact is missing/stubbed.

### Required Artifacts

All 35 artifacts named in the six PLAN frontmatter `must_haves.artifacts` blocks were checked. Every one
exists, is substantive (not a stub), and is wired to its consumer.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/mobile/payments/create/route.ts` | Thin `createOrder` wrapper | ✓ VERIFIED | 188 lines; auth+zod+createOrder+envelope; imported by no other route (called by Dart client). |
| `app/api/mobile/payments/status/[id]/route.ts` | Ownership-scoped DB-only poll | ✓ VERIFIED | 87 lines; `loadOrderForUserId`, no provider call. |
| `lib/subscription-view.ts` | Pure shared grace predicate | ✓ VERIFIED | 92 lines; imported by `/servers`, `/subscription`; `/config` via `isActiveKey`. |
| `app/api/mobile/subscription/route.ts` | Real single-key subscription read | ✓ VERIFIED | 145 lines; stub `keys:[]` gone. |
| `app/api/mobile/servers/route.ts` | Delegated active-key gate | ✓ VERIFIED | 136 lines; `isActiveKey → isKeyConnectable`. |
| `app/api/mobile/pricing/route.ts` | Five-term batched quote | ✓ VERIFIED | 124 lines; `resolveTariffQuote` loop, no price literals. |
| `app/api/mobile/promo/apply/route.ts` | Read-only promo preview | ✓ VERIFIED | 96 lines; `validatePromo` only. |
| `mobile/lib/core/payment/payment_flow.dart` | Real purchase + resume path | ✓ VERIFIED | 318 lines; allowlist, concurrent poll, terminal cleanup, 100-cap. |
| `mobile/lib/core/payment/payment_resume_listener.dart` | Startup resume wiring (fix `5b17d1c`) | ✓ VERIFIED | 69 lines; watched in `main.dart:40`. |
| `mobile/lib/features/subscription/providers.dart` | Live Dio providers | ✓ VERIFIED | 247 lines; all four routes via `Endpoints`. |
| `mobile/lib/features/subscription/models/{pricing,subscription,promo,payment}.dart` | Freezed decode models | ✓ VERIFIED | 42/47/24/45 lines + 8 generated parts; no amount/grace field. |
| `mobile/lib/features/shop/shop_screen.dart` | Real dark Shop Screen | ✓ VERIFIED | 495 lines; no bottom nav/stub. |
| `mobile/lib/features/shop/widgets/shop_widgets.dart` | Stateless leaf widgets | ✓ VERIFIED | 819 lines; incl. `ExpiresSoonBanner` (:659) and `PaymentPendingNotice` (:736). |
| `mobile/lib/features/shop/painting/{ring_painter,confetti_overlay}.dart` | CustomPainter ring/confetti | ✓ VERIFIED | 104/275 lines; no flutter_svg/confetti package. |
| `mobile/lib/app/router.dart` | Real `/shop` + WebView route | ✓ VERIFIED | 149 lines; allowlist reused, no confirmation side effect. |
| `mobile/lib/features/servers/widgets/connect_panel.dart` | No-key gate | ✓ VERIFIED | 246 lines; exact toast, `/shop` redirect. |
| `mobile/pubspec.yaml` | Exact WebView pin | ✓ VERIFIED | `flutter_inappwebview: 6.1.5`; no other new dep. |
| 8 backend + 6 mobile phase-21 test files | Wave 0 / widget / guard proof | ✓ VERIFIED | All exist and are substantive; 92 + 69 tests pass here. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `payment_flow.dart` | `/payments/create` → `createOrder` → Platega hosted page | `dio.post(Endpoints.paymentCreate, request.toJson())` (:216-220) | ✓ WIRED | Intent-only body; no amount. |
| `/payments/status/{id}` | `loadOrderForUserId(userId, id)` | `status/[id]/route.ts:65` | ✓ WIRED | DB-only, no provider call. |
| Platega callback | outbox → worker (sole issuer) | `applyConfirmedPayment`/`enqueueFulfillOrder` | ✓ WIRED | Asserted by `mobile-single-issuer.test.ts`. |
| `lib/subscription-view.ts` | `/servers` `isActiveKey` → `/config` | import at `servers/:13`, `config/:16` | ✓ WIRED | One predicate, no inline duplicate. |
| `/subscription` | `listKeysByUserId` + `getSubscriptionForUserId(userId, active.id)` | `subscription/route.ts:83,97` | ✓ WIRED | Exactly one per-key call. |
| `graceUntil` | Flutter «Истекает вскоре» banner | `shop_screen.dart:303-305` → `shop_widgets.dart:659` | ✓ WIRED | Fix `d9b7a6f`; server fields only. |
| `/pricing` | `resolveTariffQuote` / `applyMarkup` | `pricing/route.ts:17,80` | ✓ WIRED | Same source as `createOrder`. |
| `/promo/apply` | `validatePromo` preview only | `promo/apply/route.ts:13,79` | ✓ WIRED | `consumePromo` stays in `createOrder`. |
| `payment_flow.dart` resume | `payment_resume_listener.dart` → `main.dart` | `ref.watch(paymentResumeListenerProvider)` (:40) | ✓ WIRED | Fix `5b17d1c`. |
| `connect_panel.dart` | server `hasKey` → `/shop` route | callback + `router.dart:97` | ✓ WIRED | No local entitlement math. |
| `payment.dart` typed models | provider decode | `providers.dart:205,215` | ✓ WIRED | Providers use models; see INFO note below — the production `PaymentFlow` decodes raw maps instead of consuming these models (plan key-link wording drift, no behavior gap). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/pricing` route | `terms[]` | `resolveTariffQuote(days, devices)` per `TARIFF_DAYS` | ✓ DB/ARTEMIDA quote | ✓ FLOWING |
| `/subscription` route | status/link/devices fields | `listKeysByUserId` → per-key `getSubscriptionForUserId` | ✓ owned-key rows | ✓ FLOWING |
| `pricingPlansProvider` | `List<PricingTerm>` | GET `/api/mobile/pricing` | ✓ server terms | ✓ FLOWING |
| `userSubscriptionProvider` | `SubscriptionStatus` | GET `/api/mobile/subscription` | ✓ server fields | ✓ FLOWING |
| Shop Screen / summary | `unitAmount`, `discount`, `perDayPerDevice` | provider values × device count | ✓ server price + percentage | ✓ FLOWING |
| `ExpiresSoonBanner` | `graceUntil` | server response (display parse only) | ✓ server deadline | ✓ FLOWING |
| Confetti overlay | success date + link | real `expiresAt` / `link` from subscription | ✓ server values | ✓ FLOWING |
| `PaymentFlow` poll | `status` | DB status via `/payments/status/{id}` | ✓ webhook-written status | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 8 backend contract suites | `npx vitest run tests/unit/mobile-payments-route … mobile-single-issuer` | 8 files / 92 tests pass | ✓ PASS |
| 6 mobile unit/widget suites | `cd mobile && flutter test` on payment_flow, resume_listener, providers, shop_screen, connect_panel, router | 69/69 pass | ✓ PASS |
| Locked price calibration | `npx vitest run tests/unit/tariff-markup.test.ts -t "adds the markup to the provider price for every term"` | 1/1 pass | ✓ PASS |
| Grace constant | `-t "is locked to the owner's values"` | 1/1 pass | ✓ PASS |
| TypeScript contract | `npx tsc --noEmit` | exit 0, 0 errors | ✓ PASS |
| Prisma schema | `npx prisma validate` | valid | ✓ PASS |
| Flutter analyzer | `flutter analyze --no-fatal-infos --no-fatal-warnings` | exit 0, 0 errors/warnings (1746 pre-existing infos) | ✓ PASS |

`tariff-markup.test.ts` as a whole exits 1 with 6 failures — all in `GET /api/pricing`, `PATCH/GET/PUT
/api/admin/pricing` sections touched by the ~42 uncommitted out-of-phase working-tree edits (schema + admin
routes); the phase-21 locked calibration vectors pass in isolation. Not a phase-21 gap.

### Probe Execution

No `probe-*.sh` script is declared by any 21-NN PLAN/SUMMARY and none exists under `scripts/*/tests/` for
this phase. **SKIPPED — no probes declared.**

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| REQ-SUB-01 | 02, 04 | Subscription status fields | ✓ SATISFIED | `subscription/route.ts:129-136`, `models/subscription.dart`, provider test. |
| REQ-SUB-02 | 02, 05, 06 | No-key gate → toast → shop | ✓ SATISFIED | `connect_panel.dart:95,101`, router `/shop`; on-device grace connection is human UAT. |
| REQ-SUB-03 | 04, 05 | «ключ · N дн.» header + days/30 ring | ✓ SATISFIED | `main_header.dart:242`, `ring_painter.dart`, widget test. |
| REQ-SUB-04 | 02 | Device-limit enforcement | ⤵ DEFERRED | Display-only surface delivered; enforcement in Phase 22 (22.1/22.4). |
| REQ-SUB-05 | 05 | Copy link in shop & profile | ◐ PARTIAL → DEFERRED | Shop + success-overlay copy delivered and tested; profile copy is Phase 22 task 22.2. |
| REQ-SUB-06 | 02, 04, 05 | 24h grace + «expires soon» banner | ✓ SATISFIED | `subscription-view.ts` ±1ms tests + `ExpiresSoonBanner` (fix `d9b7a6f`), 3 banner widget tests. |
| REQ-SHOP-01 | 03, 04, 05 | 5 terms / locked prices / «Хит» | ✓ SATISFIED | `pricing/route.ts`, `mobile-pricing-route.test.ts`, widget test. |
| REQ-SHOP-02 | 03, 04, 05 | 2..10 stepper + dots | ✓ SATISFIED | zod bounds + stepper widget test. |
| REQ-SHOP-03 | 03, 04, 05 | Promo preview / invalid error | ✓ SATISFIED | `promo/apply/route.ts`, provider + widget tests. |
| REQ-SHOP-04 | 05 | Payment chips persist | ✓ SATISFIED | UI-only `paymentMethodProvider`; widget test. |
| REQ-SHOP-05 | 03, 04, 05 | Live summary / per-day-per-device | ✓ SATISFIED | `previewTotalRub` + `LiveSummary` widget test. |
| REQ-SHOP-06 | 01, 06 | Create → WebView → 3s/5min poll | ✓ SATISFIED (source) | Routes + flow + tests; live Platega payment is human UAT. |
| REQ-SHOP-07 | 05 | Confetti + dated success toast | ✓ SATISFIED | Status-edge tests; visual parity is human UAT. |
| REQ-SHOP-08 | 01, 05 | Trial block | ✓ SATISFIED | Backend 409 `trial` + UI hiding widget test. |
| REQ-BE-03 | 02 | Real owned-key subscription route | ✓ SATISFIED | `subscription/route.ts:83-136`. |
| REQ-BE-04 | 01, 06 | Payments create/status routes | ✓ SATISFIED | Both routes + contract tests. |
| REQ-BE-05 | 01, 06 | Keys issue/renew routes | ✓ SUPERSEDED | No client-callable issuer; sole webhook issuer guarded by test. |
| REQ-BE-07 | 01, 06 | Platega webhook idempotency | ✓ SATISFIED | Unchanged callback + `mobile-single-issuer.test.ts`. |
| REQ-BE-08 | — | OpenAPI → Dart generation | ⤵ DEFERRED | Advisory by locked decision; no generator added; no later phase claims it. |

No orphaned requirement: the union of PLAN `requirements:` fields exactly equals the phase-21 ID set
(REQ-SUB-01..06, REQ-SHOP-01..08, REQ-BE-03/04/05/07). REQ-BE-08 is not claimed by any plan and is advisory.

### Decision Coverage

`check.decision-coverage-verify` returned **16/16 honored, 0 not honored**, message: "All trackable
CONTEXT.md decisions are honored by shipped artifacts." Non-blocking gate; recorded for drift tracking.

### Test Quality Audit

| Test file | Req | Active | Skipped | Circular | Assertion level | Verdict |
|-----------|-----|--------|---------|----------|-----------------|---------|
| 8 backend vitest files | BE-03/04/05/07, SHOP-01..06, SUB-01/02/06 | 92 | 0 | none | value + behavioral | ✓ PASS |
| `payment_flow_test.dart` | SHOP-06, BE-04 | 19 | 0 | none | behavioral (terminal edge, allowlist, timeout) | ✓ PASS |
| `payment_resume_listener_test.dart` | SHOP-06 / D-06 | 2 | 0 | none | behavioral (startup watch, refresh) | ✓ PASS |
| `providers_test.dart` | SUB-01/03/06, SHOP-01/03/05 | 12 | 0 | none | value + decode | ✓ PASS |
| `shop_screen_test.dart` | SUB-02/03/05/06, SHOP-01..08 | 22 | 0 | none | behavioral (status edge, clipboard, banner) | ✓ PASS |
| `connect_panel_test.dart`, `router_test.dart` | SUB-02, SHOP-06 | 14 | 0 | none | behavioral + source guard | ✓ PASS |

Disabled tests on requirements: **0**. Circular patterns: **0**. Insufficient assertions: **0**.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| phase-21 implementation files (17 audited) | — | debt markers / TODO / placeholder / stub phrases / `console.log` | ℹ️ none found | No blocker |
| `mobile/lib/features/subscription/models/payment.dart` | 12, 32 | Typed create/status models are consumed by providers, not by `PaymentFlow` (raw-map decode) | ℹ️ Info | Plan key-link wording drift only; both paths hit the same routes/fields and are tested |
| `mobile/lib/features/shop/shop_screen.dart` | 45-55 | Fresh purchase uses manual `ref.invalidate` rather than the documented `onProvisioned` seam; resume path wires the seam (`5b17d1c`) | ℹ️ Info | Prior IN-02, intentionally accepted; both paths tested, no duplicate invalidation |
| `tests/unit/tariff-markup.test.ts` | 226-303 | 6 failures in admin/web-pricing sections from uncommitted out-of-phase edits | ⚠️ Warning (out of phase) | Locked phase-21 calibration vectors pass; not a phase gap |
| `mobile/` analyzer | — | ~1746 pre-existing info lints | ℹ️ Info | Baseline; `--no-fatal-infos --no-fatal-warnings` exit 0 |

No `TBD`/`FIXME`/`XXX` marker exists in any phase-21 implementation file → no debt-marker blocker.

### Human Verification Required

1. **Live Platega payment + webhook key issuance** — **Test:** test-mode transaction through the Shop; confirm CONFIRMED issues one key and non-success statuses issue none. **Expected:** DB status → provisioned, dated confetti, refreshed subscription. **Why human:** no test credentials; simulation forbidden.
2. **On-device WebView lifecycle + builds** — **Test:** leave WebView open through settlement, kill/relaunch mid-payment, Android debug build, iOS compile. **Expected:** concurrent poll and «Ожидаем оплату…», resume without second create, allowlist interception, clean builds. **Why human:** device/SDK required; timing-sensitive.
3. **Visual / prototype parity** — **Test:** compare Shop, ring, banner, confetti with the prototype. **Expected:** locked D-13–D-16 visuals and RU copy. **Why human:** static audit only, no screenshots captured.
4. **Grace connection on device** — **Test:** expired non-trial key at ±1ms grace boundary with live tunnel. **Expected:** allow inside grace, deny after; gates agree. **Why human:** real key + tunnel required.
5. **Platega host allowlist deployment check** — **Test:** verify real merchant host vs `allowedPaymentHosts`/`PLATEGA_PAYMENT_HOST`. **Expected:** allowlisted host works, off-allowlist blocked. **Why human:** external config.
6. **Inherited phase-19/20 UAT** — **Test:** close 7 + 8 open items in `19-VERIFICATION.md`/`20-VERIFICATION.md`, especially `/servers`/`/config` gate behavior changed by D-10. **Expected:** all prior device/live-key items green. **Why human:** device/native/live-key blockers inherited.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | REQ-SUB-04 device-limit enforcement | Phase 22 | ROADMAP 22.1/22.4; locked deferral in 21-CONTEXT/21-02. |
| 2 | REQ-SUB-05 profile-sheet copy link | Phase 22 | ROADMAP 22.2 «Profile Sheet — … link copy». |
| 3 | REQ-BE-08 OpenAPI→Dart | Advisory / not scheduled | Locked decision in 21-04; no generator, no later phase claims it. |

### Gaps Summary

No gaps. Every must-have truth, artifact and key link is satisfied in the working tree; all five post-review
fixes (`dde4984` WebView host allowlist + navigation interception, `d9b7a6f` server-driven «Истекает
вскоре» banner, `4bcfac9` concurrent poll + «Ожидаем оплату…», `5b17d1c` killed-app resume wired at startup,
`650ea16` success-overlay copy action) are present in code and covered by passing tests. Status is
`human_needed` solely because the phase is user-facing and its external/device/visual acceptance items
(live Platega, WebView/device lifecycle, visual parity, grace-on-device, inherited UAT) cannot be executed
in this environment — none was faked or simulated.

---

_Verified: 2026-11-28T05:39:16Z_
_Verifier: the agent (gsd-verifier)_
