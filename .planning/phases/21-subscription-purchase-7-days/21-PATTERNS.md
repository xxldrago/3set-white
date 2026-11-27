# Phase 21: Subscription & Purchase (7 days) - Pattern Map

**Mapped:** 2026-11-27
**Files analyzed:** 23 new/modified files (from `21-CONTEXT.md` §Integration Points, `21-RESEARCH.md` §Recommended Project Structure + §Validation Architecture Wave 0 gaps)
**Analogs found:** 22 / 23 (all analog paths verified git-TRACKED; the one no-analog file is the CustomPainter ring/confetti pair)

## Hard Constraints (apply to every file below)

These are locked and must be copied as **absences** as well as presences. Verified against source this session:

1. **Reuse the money pipeline — never a second issuer.** `createOrder` (`lib/orders-service.ts:124-165`), the shared webhook (`app/api/platega/callback/route.ts:62-179`), `applyConfirmedPayment` (`lib/orders-service.ts:505-524`) and the outbox/worker are the ONLY path that issues keys. REQ-BE-05 is **advisory**: do NOT create `/api/mobile/keys/issue|renew` or call ARTEMIDA from a route/poll handler. Mobile routes are wrappers only.
2. **No `load`, no simulation.** `lib/tariff-grid.ts` has no load bar; `mobile/lib/features/servers/server_pool_screen.dart:61-65` states "No bottom `NavigationBar`, no `load` bar, no simulated ping/connection/IP/traffic". Prototype `sleep`/fake prices/demo confetti/localStorage are visual contract only.
3. **No secret logging.** pino/logger lines carry only `{route, outcome, code, orderId, durationMs, requestId}` — never `payment_url`, `payload`, subscription link, `plategaTxId`, headers or provider text (`app/api/platega/callback/route.ts:57-178`, `lib/orders-service.ts:447-462`, `mobile/lib/core/api/dio_client.dart:36-48` with all four LogInterceptor bodies/headers off).
4. **No bottom nav.** `/shop` is a GoRouter `GoRoute` (`mobile/lib/app/router.dart:93-97`), not a tab in a `NavigationBar`.
5. **iOS / phase 19/20 gates change ONLY through the shared grace predicate.** `isActiveKey` lives in `app/api/mobile/servers/route.ts:24-38` and is imported by `/config` (`app/api/mobile/config/route.ts:16`). One new pure helper (`lib/subscription-view.ts`) must own `statusKind + graceUntil`; `/subscription`, `/servers` and `/config` all consume it. Boundary tests at `expiresAt + 24h ± 1ms`. Do not inline a second `statusKind === "active"` check.
6. **`flutter_inappwebview` needs `checkpoint:human-verify` before install.** Stable 6.1.5 (2024-10-08) against Flutter 3.50.1; the pub ecosystem cannot be gated by the legitimacy seam. Pin `flutter pub add flutter_inappwebview:6.1.5` behind a human checkpoint + `flutter analyze` + Android debug build + iOS compile.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog (all git-TRACKED) | Match Quality |
|-------------------|------|-----------|----------------------------------|---------------|
| `app/api/mobile/pricing/route.ts` (NEW) | route/controller | request-response | `app/api/pricing/route.ts` | exact |
| `app/api/mobile/promo/apply/route.ts` (NEW) | route/controller | request-response | `app/api/pricing/route.ts` (promo-preview branch) | role-match |
| `app/api/mobile/payments/create/route.ts` (NEW) | route/controller | request-response | `app/api/orders/route.ts` | exact |
| `app/api/mobile/payments/status/[id]/route.ts` (NEW) | route/controller | request-response | `app/api/orders/[orderId]/route.ts` | exact |
| `app/api/mobile/subscription/route.ts` (FILL stub) | route/controller | request-response | `app/api/mobile/servers/route.ts` | exact |
| `lib/subscription-view.ts` (NEW) | utility/service | transform | `lib/keys-service.ts` + `lib/servers-source.ts` | role-match |
| `app/api/mobile/servers/route.ts` (MODIFY gate) | route | request-response | `app/api/mobile/config/route.ts` (shows import-of-gate pattern) | self |
| `app/api/mobile/config/route.ts` (MODIFY gate import) | route | request-response | `app/api/mobile/servers/route.ts` (exports `isActiveKey`) | self |
| `tests/unit/mobile-subscription-route.test.ts` (NEW) | test | request-response | `tests/unit/mobile-servers-route.test.ts` | exact |
| `tests/unit/mobile-payments-route.test.ts` (NEW) | test | request-response | `tests/unit/pricing-route.test.ts` + `tests/unit/mobile-servers-route.test.ts` | role-match |
| `tests/unit/mobile-pricing-route.test.ts` (NEW) | test | request-response | `tests/unit/pricing-route.test.ts` | exact |
| `tests/unit/subscription-grace.test.ts` (NEW) | test | transform | `tests/unit/tariff-markup.test.ts` | role-match |
| `mobile/lib/core/api/endpoints.dart` (MODIFY) | config | config | itself | exact |
| `mobile/lib/features/subscription/providers.dart` (REPLACE) | provider/store | request-response | `mobile/lib/features/servers/providers.dart` | role-match |
| `mobile/lib/features/subscription/models/*` (NEW freezed) | model | transform | `mobile/lib/features/servers/server.dart` | exact |
| `mobile/lib/features/shop/shop_screen.dart` (REPLACE stub) | component | request-response | `mobile/lib/features/servers/server_pool_screen.dart` | role-match |
| `mobile/lib/features/shop/widgets/*` (NEW) | component | request-response | `mobile/lib/features/servers/widgets/main_header.dart` + `no_key_banner.dart` | role-match |
| `mobile/lib/features/shop/painting/*` (NEW ring/confetti) | utility (painting) | transform | `mobile/lib/features/auth/screens/telegram_wait_screen.dart` (AnimationController only) | partial |
| `mobile/lib/core/payment/*` (NEW WebView/poll/store) | service/provider | request-response + polling | `mobile/lib/core/deep_link/deep_link_handler.dart` + `mobile/lib/core/storage/token_store.dart` | role-match |
| `mobile/pubspec.yaml` (MODIFY) | config | config | itself | exact |
| `mobile/lib/app/router.dart` (MODIFY `/shop`) | config/route | request-response | itself | exact |
| `mobile/test/unit/core/payment/*` (NEW) | test | request-response | `mobile/test/unit/core/deep_link/deep_link_handler_test.dart` | exact |
| `mobile/test/widget/features/shop/shop_screen_test.dart` (NEW) | test | transform | `mobile/test/widget/features/servers/connect_panel_test.dart` | exact |

## Pattern Assignments

### `app/api/mobile/pricing/route.ts` (route, request-response) — NEW

**Analog:** `app/api/pricing/route.ts` (same data flow: server-quoted price, zod boundary, ArtemidaError mapping) + `app/api/mobile/config/route.ts` (mobile envelope/auth).

**Imports pattern** (`app/api/pricing/route.ts:11-23`):
```ts
import { z } from "zod";
import { ArtemidaError } from "../../../lib/artemida";
import { logger } from "../../../lib/logger";
import { resolveTariffQuote, resolveUpgradeQuote } from "../../../lib/pricing";
import { validatePromo } from "../../../lib/promo";
import { requireSession, SessionError } from "../../../lib/session";
import {
  TARIFF_DAYS,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_DEVICES,
} from "../../../lib/tariff-grid";
export const dynamic = "force-dynamic";
```
For the mobile route replace `requireSession` with `verifyAccessToken` and the `@/` alias import used by every mobile route (`app/api/mobile/config/route.ts:10-20`):
```ts
import { verifyAccessToken } from "@/lib/mobile-auth";
```

**Auth/guard pattern** (`app/api/mobile/config/route.ts:47-51`):
```ts
const claims = await verifyAccessToken(req);
if (!claims) {
  logger.info({ route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started });
  return respond({ ok: false, error: "unauthorized" }, requestId, 401);
}
```

**Core pattern** — batched 5-term quote (`app/api/pricing/route.ts:93-97`, `lib/pricing.ts:206-219`, `lib/tariff-grid.ts:12-24`):
```ts
// Displayed price: manual tariff row wins, otherwise the live provider amount.
const pricing = await resolveTariffQuote(parsed.data.days, parsed.data.devices);
amount = pricing.amount;
```
```ts
export const TARIFF_DAYS = [7, 30, 90, 180, 365] as const;
export const TARIFF_MIN_DEVICES = 2;
export const TARIFF_MAX_DEVICES = 9999;
export const TARIFF_GRID_MAX_DEVICES = 10; // mobile-only bound 2..10 here
```
`applyMarkup` (`lib/pricing.ts:168-178`) — the authoritative additive formula; D-03's `base × devices/2` is only the client preview:
```ts
const raw = base + markupPerDevice * devices;
const rounded = Math.round(raw);
```
Lock-price fixtures: `tests/unit/tariff-markup.test.ts:125-142` pins `115/400/1000/1900/3800` at 2 devices.

**Validation pattern** (`app/api/pricing/route.ts:28-39`) — mobile narrows `.max(10)`:
```ts
days: z.coerce.number().int().refine((v) => (ALLOWED_DAYS as readonly number[]).includes(v)),
devices: z.coerce.number().int().min(TARIFF_MIN_DEVICES).max(MAX_DEVICES),
```
**Error handling** (`app/api/pricing/route.ts:111-125`): `ArtemidaError` → `rate_limited` 429 / `payment_required` 402 / `bad_gateway|unavailable` 502, warn log with stable `code`, never provider text; unexpected → `{error:"internal"}` 500. **But** for mobile envelopes use `/config`'s `respond()` (`app/api/mobile/config/route.ts:37-41` + `:116-120`): provider failures are `{ok:false,error}` with **200**, never 5xx, per resolved Open Question 6.

---

### `app/api/mobile/promo/apply/route.ts` (route, request-response) — NEW

**Analog:** `app/api/pricing/route.ts` promo-preview branch (`:98-109`) + `lib/promo.ts:48-102`.

**Core pattern** (read-only preview — NEVER `consumePromo` here; consumption stays in `createOrder`):
```ts
// app/api/pricing/route.ts:98-109
if (parsed.data.promo !== undefined) {
  const preview = await validatePromo(parsed.data.promo, Math.round(amount));
  if (preview.ok) {
    return Response.json({
      price: Math.round(amount),
      promo: { code: preview.row.code, finalPrice: preview.finalAmount },
    });
  }
  return Response.json({ price: Math.round(amount), promo: null });
}
```
`validatePromo` (`lib/promo.ts:87-102`): uppercase/regex normalize → `findUnique` → exhausted/expired checks → `applyDiscount`. Invalid codes are `not_found` with no oracle. Client applies only the returned percentage (D-08).

**Validation:** `z.string().trim().min(1).max(32)` matching `PROMO_CODE_RE = /^[A-Z0-9-]{3,32}$/` (`lib/promo.ts:12, 30-44`).

**Error handling:** same `{ok:false,error}` envelope + no 5xx as `/config`.

---

### `app/api/mobile/payments/create/route.ts` (route, request-response) — NEW

**Analog:** `app/api/orders/route.ts` (exact create-order wrapper + trial 409 mapping) + `app/api/mobile/config/route.ts` (auth/envelope).

**Imports pattern** (`app/api/orders/route.ts:13-25`):
```ts
import { z } from "zod";
import { ArtemidaError } from "../../../lib/artemida";
import {
  OrderPromoError, createOrder, keyDeviceLimit, precheckOwnedKeyByUserId,
} from "../../../lib/orders-service";
import { TARIFF_DAYS } from "../../../lib/tariff-grid";
import { logger } from "../../../lib/logger";
```

**Auth/guard:** `verifyAccessToken(req)` → `claims.userId` (mobile routes), mirroring `app/api/mobile/subscription/route.ts:13-16`.

**Core pattern** (`app/api/orders/route.ts:98-121`):
```ts
const result =
  parsed.data.kind === "new"
    ? await createOrder({
        userId, kind: "new", days: parsed.data.days ?? null,
        devices: parsed.data.devices ?? MIN_DEVICES,
        userName: null,
        promoCode: parsed.data.promoCode ?? null,
        useBalance: parsed.data.useBalance ?? false,
      })
    : await createMutationOrder(userId, parsed.data);

if (result.kind === "provider_error") { /* typed code mapping */ }
return Response.json({ url: result.url });
```
Mobile adds `channel: "web"` (resolves to site merchant, `lib/orders-service.ts:214-218`) and returns `{ok:true, orderId: result.order.id, paymentUrl: result.url}`. **Do not send a client amount** — `createOrder` quotes internally (`lib/orders-service.ts:148-165`). **Do not mutate payload with `source=mobile`** — `resolveOrderByTxOrPayload` does `findUnique({where:{id:payload}})` (`lib/orders-service.ts:394-406`); the Order model has no `source` column.

**Validation** (`app/api/orders/route.ts:31-70`): `kind: z.enum(["new","renew","upgrade"])`, `days ∈ TARIFF_DAYS`, `devices` bounded (mobile `2..10`), `keyId` required for renew/upgrade; `superRefine` enforces per-kind fields.

**Trial precheck / clean 409 pattern** (`app/api/orders/route.ts:156-196`):
```ts
const precheck = await precheckOwnedKeyByUserId(userId, body.keyId ?? "");
if (!precheck.ok) {
  // trial → 409, not_found → 404 (never a raw provider 409)
  throw new OrderRequestError(precheck.reason === "trial" ? 409 : 404, precheck.reason);
}
```
Shared codes: `TRIAL_ERROR_CODE = "trial"`, `isTrialConflict(code) => code === "conflict"` (`lib/orders-service.ts:51-56`).

**Error handling** (`app/api/orders/route.ts:122-143`): `OrderRequestError` → its status/code; `OrderPromoError` → 400 `promo_invalid`; `ArtemidaError` → 429/402/502 with `retryAfter`; provider text never echoed. `createTransaction` is **never retried** (`lib/platega.ts:12-14, 273-309`).

---

### `app/api/mobile/payments/status/[id]/route.ts` (route, request-response) — NEW

**Analog:** `app/api/orders/[orderId]/route.ts` (exact DB-only ownership-scoped status poll).

**Imports pattern** (`app/api/orders/[orderId]/route.ts:13-17`):
```ts
import { z } from "zod";
import { loadOrderForUserId, toHistoryRow } from "../../../../lib/orders-service";
import { logger } from "../../../../lib/logger";
import { requireSession, SessionError } from "../../../../lib/session";
```
Mobile swaps `requireSession` → `verifyAccessToken` and uses the `{ok,...}` envelope.

**Auth/guard + ownership** (`app/api/orders/[orderId]/route.ts:37-52`):
```ts
const parsed = orderIdSchema.safeParse(orderId); // z.string().min(1).max(200)
if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
const order = await loadOrderForUserId(userId, parsed.data);
if (!order) return Response.json({ error: "not_found" }, { status: 404 }); // missing == non-owned
return Response.json({ order: toHistoryRow(order) });
```
`loadOrderForUserId` (`lib/orders-service.ts:422-429`) is the ownership join; `toHistoryRow` (`:452-462`) drops `plategaTxId`/`paymentUrl`. The poll id is **our `order.id`**, never the provider tx id. DB-only, side-effect-free: the webhook alone provisions.

---

### `app/api/mobile/subscription/route.ts` (route, request-response) — FILL stub

**Analog:** `app/api/mobile/servers/route.ts` (active-key selection then per-key subscription read).

**Imports pattern** (`app/api/mobile/servers/route.ts:6-12`):
```ts
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/mobile-auth";
import { daysUntilExpiry, listKeysByUserId, type RenderedKey } from "@/lib/keys-service";
import { getSubscriptionLinksCacheFirst } from "@/lib/servers-source";
import { logger } from "@/lib/logger";
```
Also import the new grace helper and `getSubscriptionForUserId` from `@/lib/keys-service`.

**Core pattern** (`app/api/mobile/servers/route.ts:80-100`) — `getSubscriptionForUserId` is PER-KEY, not an aggregate:
```ts
const keys = await listKeysByUserId(claims.userId);
const active = keys.find(isActiveKey);
if (!active) { /* 403 no_active_key */ }
const key: KeyMeta = {
  active: true, keyId: active.id, isTrial: active.isTrial === true,
  remainingDays: daysUntilExpiry(active.expiresAt), expireAt: active.expiresAt,
};
const source = await getSubscriptionLinksCacheFirst(claims.userId, active.id);
```
Then once: `getSubscriptionForUserId(claims.userId, active.id)` (`lib/keys-service.ts:273-278`) → `{subscriptionUrl, links, traffic}` (`:243-247`). Response adds `expiresAt`, `remainingDays`, `deviceLimit`, `devices[]`, `isTrial`, `statusKind`, `graceUntil`. `isTrialConflict`/trial flags come from `RenderedKey` (`lib/keys-service.ts:29-33`).

**Error handling** (`app/api/mobile/servers/route.ts:102-130, 139-147`): provider unauthorized → `no_active_key` 403; other provider errors → `{ok:false,error,stale,retryAfterSec}` with **200**; outer catch logs only stable `outcome:"internal"` and returns 200 `{ok:false,error:"internal"}` (no 5xx).

---

### `lib/subscription-view.ts` (utility/service, transform) — NEW

**Analog:** `lib/keys-service.ts:27-97` (pure status helpers) + `lib/servers-source.ts` (pure result mapping, no throw).

**Core pattern to copy** (`lib/keys-service.ts:37-39, 55-65, 92-97`):
```ts
const DAY_MS = 86_400_000;
const EXPIRING_WINDOW_MS = 3 * DAY_MS;

export function deriveStatusKind(status: string, expiresAt: Date | null): StatusKind {
  if (expiresAt) {
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) return "expired";
    if (remaining <= EXPIRING_WINDOW_MS) return "expiring";
    return "active";
  }
  if (status === "pending") return "pending";
  if (status === "expired") return "expired";
  return "unknown";
}
export function daysUntilExpiry(expiresAt: string | null): number | null { /* ceil diff / DAY_MS */ }
```
New pure grace derivation (D-10, research §Code Examples):
```ts
export const GRACE_MS = 24 * DAY_MS;
export function graceStateFor(key: Pick<RenderedKey, "status"|"expiresAt"|"isTrial">) {
  const statusKind = deriveStatusKind(key.status, key.expiresAt);
  const graceUntil = statusKind === "expired" && key.expiresAt && !key.isTrial
    ? new Date(new Date(key.expiresAt).getTime() + GRACE_MS).toISOString()
    : null;
  const inGrace = graceUntil !== null && Date.now() < new Date(graceUntil).getTime();
  return { statusKind, graceUntil, inGrace };
}
```
This single predicate is imported by `isActiveKey` (`/servers`) and therefore by `/config`; never duplicate the check. Boundary fixtures at `expiresAt + 24h ± 1ms` in `tests/unit/subscription-grace.test.ts`.

**No-secret pattern:** pure function, no I/O, no logging — mirrors `statusLabel`/`daysUntilExpiry` purity.

---

### `app/api/mobile/servers/route.ts` + `app/api/mobile/config/route.ts` (MODIFY gates)

**Analog:** themselves. The existing shared-gate import is already demonstrated at `app/api/mobile/config/route.ts:14-16`:
```ts
import { listKeysByUserId } from "@/lib/keys-service";
// The active-key predicate is the phase-19 gate, reused verbatim (D-03).
import { isActiveKey } from "@/app/api/mobile/servers/route";
```
Change `isActiveKey` (`app/api/mobile/servers/route.ts:24-38`) to delegate to the shared grace predicate:
```ts
export function isActiveKey(key: RenderedKey): boolean {
  const id = typeof key.id === "string" ? key.id.trim() : "";
  if (!id) return false;
  if (key.statusKind !== "active" && key.statusKind !== "expiring") return false;
  // ... raw-status exclusions ...
  if (DISQUALIFIED_STATUSES.has(rawStatus)) return false;
  return true;
}
```
Keep `DISQUALIFIED_STATUSES = new Set(["expired","revoked","disabled","trial-expired"])` (`:16`) and the raw-status normalization (`:32-36`) — the research warns a bare `statusKind === "active"` would omit excluded raw statuses. Update `tests/unit/mobile-servers-route.test.ts` + `tests/unit/mobile-config-route.test.ts` to cover grace. `/config` itself needs no other edit; it already calls `keys.find(isActiveKey)` (`:53-61`).

---

### Backend tests (Wave 0) — `tests/unit/{mobile-subscription-route,mobile-payments-route,mobile-pricing-route,subscription-grace}.test.ts`

**Analogs (all tracked):** `tests/unit/mobile-servers-route.test.ts`, `tests/unit/pricing-route.test.ts`, `tests/unit/tariff-markup.test.ts`.

**Mock + hoist pattern** (`tests/unit/mobile-servers-route.test.ts:5-28`):
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), listKeys: vi.fn(), days: vi.fn(() => 7), source: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/keys-service', () => ({ listKeysByUserId: mocks.listKeys, daysUntilExpiry: mocks.days }));
vi.mock('../../lib/logger', () => ({ logger: { info: mocks.info, error: mocks.error, warn: vi.fn(), debug: vi.fn() } }));
import { GET } from '../../app/api/mobile/servers/route';
```
**Fixture shape** (`tests/unit/mobile-servers-route.test.ts:34-52`) — `RenderedKey` with `statusKind`, `isTrial`, `expiresAt`, `deviceLimit`, `devices`, `subscriptionUrl`.

**Session + fetch-stub pattern** (`tests/unit/pricing-route.test.ts:4-17, 41-52`): `vi.mock('next/headers')`, `signSession`, `jsonResponse` helper from `tests/helpers/fake-fetch`; assert no provider call without auth.

**Locked-value fixture pattern** (`tests/unit/tariff-markup.test.ts:125-142`):
```ts
expect([...TARIFF_DAYS]).toEqual([7, 30, 90, 180, 365]);
expect(MARKUP_PER_DEVICE).toEqual({ 7: 33, 30: 140, 90: 350, 180: 680, 365: 1405 });
expect(applyMarkup(49, 7, 2, 33)).toBe(115);
```
Use the same style for 115/400/1000/1900/3800 and for `expiresAt ± 24h ± 1ms` grace boundaries.

---

### `mobile/lib/core/api/endpoints.dart` (config) — MODIFY

**Analog:** itself (`:11-21`):
```dart
static const String subscription = '/api/mobile/subscription';
static const String servers = '/api/mobile/servers';
static const String config = '/api/mobile/config';
static const String keys = '/api/mobile/keys';
static const String payments = '/api/mobile/payments';
static const String devices = '/api/mobile/devices';
```
Add `pricing`, `promoApply`, `paymentCreate`, `paymentStatus` constants in the same class; keep `/payments/{orderId}` as our order id.

---

### `mobile/lib/features/subscription/providers.dart` (provider/store, request-response) — REPLACE

**Analog:** `mobile/lib/features/servers/providers.dart:99-135` (real Dio `FutureProvider.autoDispose` with degraded errors, no simulation).

**Core pattern to copy** (`mobile/lib/features/servers/providers.dart:105-135`):
```dart
final serverPoolProvider = FutureProvider.autoDispose<ServerPools>((ref) async {
  final dio = ref.read(dioClientProvider).dio;
  try {
    final response = await dio.get<dynamic>(Endpoints.servers);
    final raw = response.data;
    if (raw is! Map) return const ServerPools(error: "invalid_response", notice: "Нет активного ключа");
    final pools = ServerPools.fromJson(Map<String, dynamic>.from(raw));
    // ... map machine-readable errors to stable UI copy ...
    return pools;
  } on DioException catch (error) {
    final status = error.response?.statusCode;
    if (status == 403 || status == 402) return const ServerPools(error: "no_active_key", notice: "Нет ключа");
    return _offlinePools(dao);
  } on Object catch (_) { return _offlinePools(dao); }
});
```
**Replace, do not keep:** `pricingPlansProvider` hardcoded 115/400/1000/1900/3800 (`:36-74`), `paymentUrlProvider` mock URL (`:83`), `createPaymentProvider` `https://dash.3set.online/payment/mock...` (`:97-101`), and the `userSubscriptionProvider` stub returning `null` (`:86-94`). Keep the provider *names* where useful but back them with `/pricing`, `/subscription`, `/payments/create`, `/promo/apply`. `dioClientProvider` is defined at `mobile/lib/core/auth/auth_notifier.dart:11-14` (`DioClient.create()`); AuthInterceptor attaches Bearer automatically (`mobile/lib/core/api/auth_interceptor.dart:29-47`) and handles 401 refresh single-flight (`:50-142`).

**UI state persistence:** `StateProvider` from `flutter_riverpod/legacy.dart` is already used (`providers.dart:2, 77-83`) for selected plan/processing; selected term, device count (2–10), promo code and payment chip can follow that pattern, but prices must come from the server.

---

### `mobile/lib/features/subscription/models/*` (freezed models, transform) — NEW

**Analog:** `mobile/lib/features/servers/server.dart:1-6, 32-52, 54-90`.

**Imports + declaration pattern**:
```dart
import "package:freezed_annotation/freezed_annotation.dart";
part "server.freezed.dart";
part "server.g.dart";

@freezed
abstract class ServerKey with _$ServerKey {
  const factory ServerKey({
    required bool active,
    required String keyId,
    required bool isTrial,
    @JsonKey(name: "remainingDays") int? remainingDays,
    @JsonKey(name: "expireAt") String? expireAt,
  }) = _ServerKey;
  factory ServerKey.fromJson(Map<String, dynamic> json) => _$ServerKeyFromJson(json);
}
```
Create hand-written freezed models for pricing plans, subscription status (`expiresAt`, `remainingDays`, `deviceLimit`, `link`, `devices[]`, `isTrial`, `statusKind`, `graceUntil`), promo result (percentage only) and payment create/status. Add `@JsonKey(name: ...)` for camelCase backend fields. Run `build_runner` to generate `*.freezed.dart`/`*.g.dart` (no OpenAPI generator — REQ-BE-08 advisory, defer).

---

### `mobile/lib/features/shop/shop_screen.dart` (component, request-response) — REPLACE stub

**Analog:** `mobile/lib/features/servers/server_pool_screen.dart:61-75` (full prototype `ConsumerWidget` screen, `AsyncValue.watch`, widgets split into `widgets/`).

**Stub to replace** (`mobile/lib/features/shop/shop_screen.dart:1-75`) — currently `Scaffold` + single «Купить» card with snackbar "Магазин ключей — фаза 21". Rebuild with `ConsumerWidget`, dark `AppTheme.dark`, `Endpoints`-backed providers, term cards, stepper, promo field, chips, live summary, ring, copy-link and payment actions. **No bottom nav**; `/shop` is a `GoRoute` (`mobile/lib/app/router.dart:93-97`).

**Gating UI to copy:** `mobile/lib/features/servers/widgets/no_key_banner.dart:31-63` — inline banner with machine-code-driven Russian copy and one action («Купить» / «Повторить»), red accent for errors, amber for gates; never renders provider text. `mobile/lib/features/servers/widgets/main_header.dart:228-243` — `_keyLabel` produces "ключ · N дн." / "Нет ключа" / "Ключ истёк" and `AppTheme.lime` when active. Trial UI: hide renew/upgrade and show «Триал не продлевается» from `isTrial`.

**Theme tokens** (`mobile/lib/app/theme.dart:8-97`): `AppTheme.bg/surface/surface2/surface3/line`, `lime/lime2/teal/amber/red`, `text/muted/dim`, `fontBody/fontDisplay/fontMono`; `AppTheme.dark` at `:124`, `light` at `:424` (no light theme for shop — prototype is dark only).

---

### `mobile/lib/features/shop/widgets/*` (components, request-response) — NEW

**Analog:** `mobile/lib/features/servers/widgets/main_header.dart` + `no_key_banner.dart` + `connect_panel.dart` (all tracked). Extract stateless widgets with constructor-injected callbacks and `Theme.of(context)` + `AppTheme` constants — no provider access inside leaf widgets. Russian copy literals live in the widget, never built from provider text. Payment chips are **UI-only persisted state** (REQ-SHOP-04; Platega has no brand-level codes — do not bind `paymentMethod`). Copy link via `Clipboard.setData` from `package:flutter/services.dart` (D-15, no plugin).

---

### `mobile/lib/features/shop/painting/*` (ring/confetti, transform) — NEW

**Analog (partial):** `mobile/lib/features/auth/screens/telegram_wait_screen.dart:27-56` for `AnimationController` lifecycle:
```dart
class _TelegramWaitScreenState extends ConsumerState<TelegramWaitScreen>
    with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _pulseAnimation;
  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(duration: const Duration(seconds: 2), vsync: this)
      ..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.2).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut));
  }
```
Ring geometry (prototype parity, D-13): `progress = (days/30).clamp(0.0,1.0)`, dash offset `351.86 * (1 - progress)`, radius 56; color thresholds from `AppTheme.lime/amber/red`. Confetti (D-14) is a custom `CustomPainter` overlay driven only by a real `CONFIRMED`/`provisioned` status transition — never a timer or demo. Dispose the controller in `dispose()`; check `mounted` before `setState`.

---

### `mobile/lib/core/payment/*` (service/provider, request-response + polling) — NEW

**Analog:** `mobile/lib/core/deep_link/deep_link_handler.dart` (polling state machine) + `mobile/lib/core/storage/token_store.dart` (secure storage wrapper) + `mobile/lib/core/vpn/config_repository.dart` (Dio wrapper).

**Poll pattern** (`deep_link_handler.dart:70-73, 142-154`):
```dart
Timer? _pollingTimer;
int _pollAttempts = 0;
static const int _maxPollAttempts = 60; // 3 minutes at 3s interval
static const Duration _pollInterval = Duration(seconds: 3);
_pollingTimer?.cancel();
_pollAttempts = 0;
_pollingTimer = Timer.periodic(_pollInterval, (_) => _pollForAuth());
_pollForAuth(); // also poll immediately
```
Adapt to **100 attempts = 5 min** (D-06) for `/payments/status/{orderId}`; stop on `provisioned`/terminal, invalidate `/subscription`, show confetti + «Подписка продлена до {date}». Always `cancel()` in `dispose()` (`:260-261`). Logger via `createLogger('...')` (`mobile/lib/utils/logger.dart`), never log URLs/tokens.

**Pending-order store pattern** (`token_store.dart:15-25, 27-34, 67-73`) — persist ONLY the non-secret `orderId` in `flutter_secure_storage` under a dedicated key; clear on terminal status:
```dart
static const String _accessKey = 'access_token';
final SecureStorage _storage;
const TokenStore(this._storage);
Future<void> saveTokenPair(TokenPair tokens) async { /* storage.write */ }
Future<void> clearAll() async { /* storage.delete */ }
```
`SecureStorage.instance` (`mobile/lib/core/storage/secure_storage.dart:7-28`) already configures Android Keystore / iOS Keychain with `preferencesKeyPrefix: '3set_vpn'`. Resume logic: on app start read the stored order id and restart polling (D-06).

**WebView:** open ONLY the server-returned `payment_url`; validate https before navigation; use `flutter_inappwebview` 6.1.5 behind `checkpoint:human-verify` (see Hard Constraints §6). No external browser as primary path (D-05).

---

### `mobile/pubspec.yaml` (config) — MODIFY

**Analog:** itself (`:7-8` sdk, `:10-33` deps, `:35-47` dev_deps). Add `flutter_inappwebview: 6.1.5` (pin exact, not beta) in `dependencies` behind the human checkpoint; keep `flutter_secure_storage: ^11.2.0` (`:21`), drift/ffi/ffigen, dio, riverpod, freezed, mocktail. No other new dependency — ring/confetti/clipboard are Flutter SDK.

---

### `mobile/lib/app/router.dart` (config/route) — MODIFY

**Analog:** itself (`:37-99`). `/shop` already exists (`:93-97`) — only change the destination to the real `ShopScreen`. Add the payment WebView route here (GoRoute) rather than a bottom-nav destination; keep the auth redirect (`:41-65`) and `refreshListenable` pattern.

---

### Mobile tests (Wave 0) — `mobile/test/unit/core/payment/*`, `mobile/test/widget/features/shop/shop_screen_test.dart`

**Analogs (all tracked):** `mobile/test/unit/core/deep_link/deep_link_handler_test.dart`, `mobile/test/unit/features/servers/server_pool_providers_test.dart:1-28, 56-85`, `mobile/test/widget/features/servers/connect_panel_test.dart:1-70`.

**Unit mock pattern** (`server_pool_providers_test.dart:1-28`): `mocktail` `MockDioClient extends Mock implements DioClient`, `MockDio extends Mock implements Dio`, fake collaborator classes with deterministic outputs ("no simulation in prod"), `_payload()` JSON builders.

**Widget pattern** (`connect_panel_test.dart:34-57`): helper wrapping widget in `MaterialApp(theme: AppTheme.dark, home: Scaffold(body: ...))`, then `testWidgets(...)` with `tester.pumpWidget`. Use for term cards, stepper bounds, promo preview, chip persistence, ring colors, copy-link, confetti trigger. Poll service tests use fake timers/attempt counts like the deep-link tests; assert no `sleep`, no fake prices and no simulated success.

## Shared Patterns

### Authentication (every new mobile route)
**Source:** `lib/mobile-auth.ts:44-76` + `app/api/mobile/config/route.ts:47-51`
```ts
const claims = await verifyAccessToken(req);
if (!claims) return respond({ ok: false, error: "unauthorized" }, requestId, 401);
```
Bearer JWT HS256, 15m access / 30d refresh, `credentialsChangedAt` watermark (`:34-38, 61-70`). Webhook is the sole exception: header auth only (`app/api/platega/callback/route.ts:62-70`). Mobile client: `AuthInterceptor` attaches Bearer (`mobile/lib/core/api/auth_interceptor.dart:29-47`).

### Error envelope (all new mobile routes)
**Source:** `app/api/mobile/servers/route.ts:58-62, 133-147` + `app/api/mobile/config/route.ts:37-41, 116-120`
```ts
function respond(body: ConfigBody, requestId: string, status = 200, retryAfterSec?: number) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}
```
`{ok:false,error}` with 200 for provider errors, 401 unauthorized, 403 no_active_key, 400 bad_request; outer catch logs only `outcome:"internal"` and returns 200 (never 5xx). Flutter maps one shape (`ServerPools` style).

### Money pipeline / single issuer (do not duplicate)
**Sources:** `lib/orders-service.ts:124-165, 219-233, 365-386, 493-524`; `app/api/platega/callback/route.ts:62-179`; `lib/promo.ts:87-122`.
Order of operations is load-bearing: `createOrder` quote → pending row with `payload = order.id` → Platega URL; webhook verify headers → zod → resolve by tx/payload → merchant match → server re-query → `amountMatches` + currency → `applyConfirmedPayment` (atomic pending→paid + one outbox row) → 200 fast. Worker issues the key with `order:{id}:{kind}` idempotency. **Nothing in phase 21 adds a client-callable issuer or moves issuance into a route/poll.**

### Ownership reads (no IDOR oracle)
**Sources:** `lib/orders-service.ts:412-429`, `lib/keys-service.ts:233-241, 273-288`.
All reads are `findFirst({where:{id, user:{id:userId}}})`; missing and non-owned both return null/404.

### Logging (no secrets)
**Sources:** `app/api/platega/callback/route.ts:57-178`, `app/api/mobile/servers/route.ts:133-147`, `lib/orders-service.ts:447-462`, `mobile/lib/core/api/dio_client.dart:36-48`.
Stable outcome codes only (`route`, `outcome`, `code`, `orderId`, `requestId`, `durationMs`); no payment URL, payload, link, header or provider message.

### Validation at boundaries
**Source:** `app/api/orders/route.ts:31-70`, `app/api/pricing/route.ts:28-52`, `app/api/orders/[orderId]/route.ts:20`.
zod on every route; mobile devices ∈ [2,10]; days ∈ `TARIFF_DAYS`; order id `min(1).max(200)`; promo `min(3).max(32)` + `PROMO_CODE_RE`.

### Grace gate (cross-cutting)
**Source:** new `lib/subscription-view.ts` (pattern from `lib/keys-service.ts:55-65`); consumed by `app/api/mobile/servers/route.ts:24-38` and `app/api/mobile/config/route.ts:16, 53-61`. One predicate, boundary-tested at `expiresAt + 24h ± 1ms`. Client never computes grace.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `mobile/lib/features/shop/painting/*` (ring + confetti `CustomPainter`) | utility (painting) | transform | No `CustomPainter` exists anywhere in `mobile/lib`; closest is `AnimationController` in `telegram_wait_screen.dart:27-56`. Use RESEARCH §Code Examples ring geometry (`r=56`, dash `351.86`, `progress=(days/30).clamp(0,1)`) and a fresh `CustomPainter` for confetti; no package, no simulation. |
| `flutter_inappwebview` install | dependency | — | Not installed; pub ecosystem cannot be legitimacy-gated. Human-verify checkpoint before `flutter pub add flutter_inappwebview:6.1.5`; verify Android debug build + iOS compile. |

## Metadata

**Analog search scope:** `app/api/mobile/*`, `app/api/{orders,pricing,platega}/*`, `lib/{orders-service,keys-service,pricing,tariff-grid,promo,platega,payments,mobile-auth,servers-source}.ts`, `tests/unit/*`, `mobile/lib/{core,features,app}/*`, `mobile/test/{unit,widget}/*`.
**Files scanned:** ~60 tracked source/test files; 25 analogs read in full or targeted ranges.
**Tracked-source gate:** every analog path above verified with `git ls-files --error-unmatch` (non-empty). Note: `tests/unit/worker.test.ts` mentioned in RESEARCH is **not tracked** — use the tracked `tests/unit/outbox-worker.test.ts` instead. `mobile/AGENTS.md` is not present on disk.
**Pattern extraction date:** 2026-11-27
