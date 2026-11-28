# Phase 22: Devices, Settings & Polish — Pattern Map

**Mapped:** 2026-11-28
**Files analyzed:** 31 new/modified files extracted from `22-CONTEXT.md` D-01..D-09, `22-RESEARCH.md` §Recommended Project Structure / Validation Architecture, and `22-VALIDATION.md` Wave 0
**Analogs found:** 26 / 31 (5 have no direct implementation analog — see "No Analog Found")
**Analog sources:** only git-tracked source files, verified with `git ls-files`. Generated `.g.dart` / `.freezed.dart`, `pubspec.lock`, `package-lock.json` are **regenerated artifacts, not implementation baselines**. The prototype `.planning/seeds/prototype-mobile-client.html` is a **design reference only** — its `state.net` toggle, `POST /devices` and splice-back undo are simulation and must never be copied as code.

## Hard Constraints (planner: apply to every plan action)

| Constraint | Canonical source | Pattern consequence |
|---|---|---|
| Kill switch always-on, read-only text; no toggle/flag in native layer | `22-CONTEXT.md` D-01..D-04; `22-RESEARCH.md` line 13-16 | Widget is a `Text` row only: «Kill switch: включён» + «Трафик вне VPN заблокирован». Do not touch `VpnService.kt` (`allowBypass=false`), `NEOnDemandRuleConnect`, FSM, or toast from phase 20 D-12. |
| No free add-device; no provider restore | D-05/D-06; `docs/artemida-v1-contract.md:45-57,96-115` | «Добавить это устройство» = open/copy subscription link (reuse `copySubscriptionLink`); capacity growth only via existing `POST /api/mobile/payments/create {kind:'upgrade',addDevices}` → webhook → outbox → worker. Never call `artemida.upgradeKey` from a route/UI button. |
| Undo = 5s deferred DELETE | D-06; `22-RESEARCH.md` Pattern 2 | Timer cancels before the DELETE reaches the BFF. After a real DELETE, never reinsert the row. |
| Network chip read-only | D-07; `mobile/lib/features/servers/widgets/pool_toolbar.dart:6-9` | Reuse `networkLabelProvider` + `PoolToolbar`; no WiFi/LTE toggle, no fake toast. |
| No client→ARTEMIDA; single issuer | `AGENTS.md` Constraints; `22-RESEARCH.md` lines 57, 236 | Client sends only opaque `token`; `keyId` derived server-side from `claims.userId`. |
| FCM deferred; local notifications gated | D-08/D-09; `22-RESEARCH.md` Q4 | No `firebase_*` packages, no fake token route. Insert `checkpoint:human-verify` before `flutter pub add flutter_local_notifications:23.0.4 timezone`. |
| No simulation / `load` / bottom nav / secrets in logs | `22-RESEARCH.md` line 60 | Stable error codes only; no `Math.random`, no fake rows, no `NavigationBar`, no device token/link/provider text in logs or toasts. |
| Path correction | — | Research cites `mobile/lib/core/theme/theme.dart`; the **tracked** theme file is `mobile/lib/app/theme.dart` (verified). All theme edits go there. |

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/api/mobile/devices/route.ts` (new) | route / controller | request-response | `app/api/mobile/subscription/route.ts` + `app/api/keys/[id]/devices/route.ts` | exact (envelope + device list) |
| `app/api/mobile/devices/[token]/route.ts` (new) | route / controller | request-response | `app/api/keys/[id]/devices/[token]/route.ts` + `app/api/mobile/subscription/route.ts` | exact (envelope delta noted) |
| `app/api/mobile/subscription/route.ts` (modify) | route / controller | request-response | itself (identity block `lines 23-27, 64-79`) | exact |
| `tests/unit/mobile-devices-route.test.ts` (new) | test | request-response | `tests/unit/mobile-subscription-route.test.ts`, `tests/unit/devices-route.test.ts` | exact |
| `mobile/lib/features/profile/profile_sheet.dart` (new, replaces stub) | component | request-response | `server_pool_screen.dart:386-391,463-484`; `main_header.dart:161-176` | role-match |
| `mobile/lib/features/profile/devices/device.dart` (freezed model) | model | request-response | `features/subscription/models/subscription.dart`; `lib/artemida.ts:298-301` | exact |
| `mobile/lib/features/profile/devices/devices_providers.dart` | provider / service | request-response | `features/subscription/providers.dart:27-110,155-160` | exact |
| `mobile/lib/features/profile/devices/devices_sheet.dart` | component | request-response | `shop_screen.dart:150-178`; `widgets/pool_toolbar.dart:42-98` | role-match |
| `mobile/lib/features/profile/devices/deferred_delete_controller.dart` | controller / service | event-driven (Timer) | `core/payment/payment_resume_listener.dart:50-69`; `error_toast.dart:64-100`; `connection_notifier.dart:71-98` | role-match |
| `mobile/lib/features/profile/settings/*` (kill switch row, referral row, reset row, network chip reuse) | component | request-response / event-driven | `shop_screen.dart:39-42,167-178`; `pool_toolbar.dart:6-9,73-98`; `main_header.dart:161-176` | role-match |
| `mobile/lib/core/settings/settings_table.dart` (new Drift table) | model | CRUD | `core/db/tables.dart:43-65`; `core/db/app_database.dart:15-26` | exact |
| `mobile/lib/core/settings/auto_connect_listener.dart` | provider / hook | event-driven | `core/payment/payment_resume_listener.dart:50-69`; `core/vpn/connection_notifier.dart:51-67,178-220` | exact |
| `mobile/lib/core/notifications/local_notifications.dart` | service / provider | event-driven (OS) | `android/.../VpnForegroundService.kt:94-111`; `ios/Runner/AppDelegate.swift:4-16` (partial — channel/delegate seam only) | partial |
| `mobile/lib/core/notifications/expiry_scheduler.dart` | service | event-driven (scheduling) | none in repo — use `22-RESEARCH.md` §Code Examples lines 311-349 + official FLN setup | **no analog** |
| `mobile/android/app/src/main/AndroidManifest.xml` (modify) | config | event-driven | itself (`lines 71-79` VPN service/receiver registration style) | partial |
| `mobile/ios/Runner/AppDelegate.swift` (modify) | config | event-driven | itself (`lines 4-16`) | partial |
| `mobile/lib/core/api/endpoints.dart` (modify) | utility / config | request-response | itself (`line 25` already has `devices`) | exact |
| `mobile/lib/main.dart` (modify) | bootstrap / config | event-driven | itself (`lines 24-40` always-on `ref.watch` listeners) | exact |
| `mobile/lib/app/router.dart` (modify) | config / route | request-response | itself (`lines 70-117` GoRoute list; profile entrypoint `server_pool_screen.dart:133`) | exact |
| `mobile/lib/app/theme.dart` (modify) | config | transform | itself (`lines 52-58, 317-358`) + `test/widget/app/theme_test.dart:22-45` | exact |
| `mobile/pubspec.yaml` (modify) | config | — | itself (`lines 10-48` pinned deps; `flutter_inappwebview: 6.1.5` exact-pin precedent) | exact |
| `.planning/REQUIREMENTS.md` (modify REQ-SET-01 per D-03) | doc | — | no code analog; wording only | no analog |
| `mobile/test/unit/features/devices/deferred_delete_test.dart` | test | event-driven | `test/unit/core/ping/network_invalidation_test.dart:80-95`; `payment_resume_listener_test.dart:51-67` | role-match |
| `mobile/test/unit/features/devices/device_limit_test.dart` | test | request-response | `test/unit/features/subscription/providers_test.dart:23-110` | exact |
| `mobile/test/widget/features/profile/profile_sheet_test.dart` | test | request-response | `test/widget/features/servers/server_pool_screen_test.dart:1-80`; `test/widget/app/theme_test.dart:1-143` | exact |
| `mobile/test/unit/core/settings/auto_connect_test.dart` | test | event-driven | `payment_resume_listener_test.dart:51-124`; `router_test.dart:55-75` (FakeAuthNotifier) | exact |
| `mobile/test/widget/features/profile/referral_row_test.dart` | test | request-response | `test/widget/features/shop/shop_screen_test.dart` (clipboard seam) | role-match |
| `mobile/test/unit/core/settings/reset_demo_test.dart` | test | CRUD | `test/unit/core/storage/token_store_test.dart`; `test/unit/core/db/ping_cache_test.dart` | exact |
| `mobile/test/widget/features/servers/pool_toolbar_test.dart` | test | request-response | `server_pool_screen_test.dart:1-80` + `pool_toolbar.dart` | exact |
| `mobile/test/unit/core/notifications/expiry_scheduler_test.dart` | test | event-driven | `providers_test.dart:19-21` (Mock seam) + RESEARCH scheduler snippet | partial |
| `mobile/test/widget/app/accessibility_test.dart` | test | transform | `test/widget/app/theme_test.dart:22-45,119-137` | exact |

---

## Pattern Assignments

### `app/api/mobile/devices/route.ts` (route, request-response)

**Analog A — mobile ownership + envelope:** `app/api/mobile/subscription/route.ts` (lines 19-50, 52-91):

```ts
export const dynamic = "force-dynamic";

function respond(body: SubscriptionBody, requestId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId },
  });
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const requestId = randomUUID();
  try {
    const claims = await verifyAccessToken(req);
    if (!claims) {
      logger.info({ route: ROUTE, requestId, outcome: "unauthorized", durationMs: Date.now() - started });
      return respond({ ok: false, error: "unauthorized" }, requestId, 401);
    }
    const keys = await listKeysByUserId(claims.userId);
    const active = keys.find(isKeyConnectable);          // SAME gate as /servers + /config
    if (!active) {
      return respond({ ok: false, error: "no_active_key", user: identity }, requestId);
    }
```

**Analog B — device listing + null-means-not-owned:** `app/api/keys/[id]/devices/route.ts` (lines 58-69):

```ts
  try {
    const devices = await listDevicesWithLabels(userId, parsed.data);
    if (devices === null) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ devices });
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({ route: "keys-devices", code: err.code, requestId: err.requestId });
      return Response.json({ error: err.code }, { status: mapArtemidaStatus(err.code) });
    }
    logger.error({ route: "keys-devices", outcome: "unexpected_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
```

**Planner delta (do NOT copy verbatim):** mobile route uses `verifyAccessToken` (not `requireSession`), `{ok:false,error}` envelope, HTTP **200** for provider/`no_active_key` failures, only stable codes + `requestId` in logs. `keyId` comes from `listKeysByUserId(claims.userId).find(isKeyConnectable)`, never from the client. Response should include `devices` (with `label`), and `deviceLimit` from the same owned key — one list call, no loop. `null` from `listDevicesWithLabels` → `no_active_key` (no enumeration oracle).

**Validation:** `z.string().min(1).max(200)` is the id-schema precedent (`app/api/keys/[id]/devices/route.ts:15`); the new route has no client id, so only zod-validate any query/body if introduced. Provider error mapping: `lib/artemida.ts:22-43` `ArtemidaError.code` (never `err.message`).

**Data source:** `lib/keys-service.ts:763-771`:

```ts
export async function listDevicesWithLabels(
  userId: number,
  keyId: string,
): Promise<Array<Device & { label: string | null }> | null> {
  const devices = await listDevicesByUserId(userId, keyId);
  if (devices === null) return null;
  const labels = await deviceLabelsFor(userId, keyId);
  return devices.map((device) => ({ ...device, label: labels.get(device.token) ?? null }));
}
```

---

### `app/api/mobile/devices/[token]/route.ts` (route, request-response)

**Analog:** `app/api/keys/[id]/devices/[token]/route.ts` (lines 16-17, 57-75):

```ts
const idSchema = z.string().min(1).max(200);
const tokenSchema = z.string().min(1).max(300);
...
  const { id, token } = await params;
  const parsedId = idSchema.safeParse(id);
  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedId.success || !parsedToken.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const owned = await removeDeviceByUserId(userId, parsedId.data, parsedToken.data);
    if (!owned) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) { /* stable code only, never provider text */ }
```

**Ownership seam:** `lib/keys-service.ts:407-424`:

```ts
export async function removeDeviceByUserId(
  userId: number, keyId: string, token: string,
): Promise<boolean> {
  return removeDeviceForOwner({ userId }, keyId, token);
}
async function removeDeviceForOwner(owner, keyId, token): Promise<boolean> {
  if ((await ownedKeyRowIdForOwner(owner, keyId)) === null) return false;
  await artemida.deleteDevice(keyId, token);
  return true;
}
```

**Planner delta:** mobile path is `/api/mobile/devices/[token]` — **no `keyId` in the path**; resolve active key with the `/subscription` predicate, then `tokenSchema` zod-validate (min 1 / max 300, matching precedent), then `removeDeviceByUserId(claims.userId, active.id, token)`. Non-owned/missing → `ok:false, error:'no_active_key'` (or `not_found`) on HTTP 200. Provider error → stable `ArtemidaError.code` on 200; `rate_limited` carries `Retry-After` like `app/api/mobile/payments/create/route.ts:78-82`:

```ts
function respond(body: CreateBody, requestId: string, status = 200, retryAfterSec?: number) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (retryAfterSec !== undefined) headers["Retry-After"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}
```

**No free add / no restore route:** the locked provider surface is exactly `lib/artemida.ts:684-693` (`getDevices`, `deleteDevice`, `clearDevices`). Do not create `POST /api/mobile/devices` that fakes a count increment.

---

### `app/api/mobile/subscription/route.ts` (modify — real profile identity)

**Analog:** self (lines 23-27, 64-79, 125-139). Add the real DB fields to the **same already-fetched row**, one `select`:

```ts
interface UserIdentity {
  id: number;
  telegramId: number | null;
  email: string | null;
}
...
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, telegramId: true, email: true },
    });
...
    const identity: UserIdentity = {
      id: user.id,
      telegramId: user.telegramId ? Number(user.telegramId) : null,
      email: user.email,
    };
```

**DB source:** `prisma/schema.prisma:49-51,56-62` — `firstName`, `lastName`, `username`, `referralCode String? @unique @map("referral_code")` with comment «`3SET-XXXXXX`, ensured on first use».

**Referral helper:** `lib/referrals.ts:226-245` `ensureReferralCode(userId)` (re-read in a 5-attempt retry loop, own user only). Build `?ref=${referralCode}` **once** — the code already contains `3SET-`; never prefix it again. Do not invent an email.

**Tests to extend:** `tests/unit/mobile-subscription-route.test.ts:45-49,107-126` fixture `USER` and `toMatchObject` identity assertion.

---

### `tests/unit/mobile-devices-route.test.ts` (test, request-response)

**Analog A — JWT/BFF mock style:** `tests/unit/mobile-subscription-route.test.ts` (lines 10-45, 87-105, 178-191):

```ts
const mocks = vi.hoisted(() => ({ verify: vi.fn(), listKeys: vi.fn(), ... }));
vi.mock('../../lib/mobile-auth', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../../lib/keys-service', () => ({ listKeysByUserId: mocks.listKeys, ... }));
vi.mock('../../lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
...
  it('401 without a valid JWT and makes no provider or DB read', async () => {
    mocks.verify.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mocks.listKeys).not.toHaveBeenCalled();
  });
```

**Analog B — ownership/no-oracle vectors:** `tests/unit/devices-route.test.ts` (lines 76-104, 122-161): 401 without session never calls provider; invalid token → 400 before provider; non-owned key → 404/no mutation; owned → `deleteDevice` called once with `(keyId, token)`.

**Required new vectors (from `22-VALIDATION.md:43-45` + research §Validation):** zod token min/max boundaries, non-owned key yields same outcome as missing, undo window is client-only (nothing sent until timer), provider `ArtemidaError` → HTTP 200 stable code with no provider text/link in body or logs, `rate_limited` → `Retry-After`.

---

### `mobile/lib/features/profile/profile_sheet.dart` (component, request-response)

**Analog — stub to replace:** `mobile/lib/features/servers/server_pool_screen.dart` (lines 386-391, 463-484):

```dart
  void _profileSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => const _ProfileSheet(),
    );
  }
...
/// Profile sheet stub; the full profile lands in phase 21.
class _ProfileSheet extends StatelessWidget {
  const _ProfileSheet();
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text("Профиль", style: theme.textTheme.headlineSmall),
          const SizedBox(height: 12),
          Text("Устройства и подписка — фаза 21", ...),
        ],
      ),
    );
  }
}
```

**Analog — dark sheet + Semantics entrypoint:** `mobile/lib/features/servers/widgets/main_header.dart:136-177` (icon actions and `Semantics(label: "Профиль", child: GestureDetector(onTap: onProfile, ...))`), `mobile/lib/app/theme.dart:382-393` (bottom-sheet surface styling).

**Implementation seam:** keep `showModalBottomSheet` and the avatar's `onProfile` callback; replace only the stub body. Feed name/avatar/method pill from the extended `SubscriptionUser` block; display `firstName ?? username ?? email-local-part ?? «Пользователь»`; keep the dark theme and **no bottom navigation**. Kill switch is a plain `Text` row per D-02.

---

### `mobile/lib/features/profile/devices/device.dart` (freezed model) + `devices_providers.dart` (provider/service)

**Model analog:** `mobile/lib/features/subscription/models/subscription.dart` (lines 1-20):

```dart
import "package:freezed_annotation/freezed_annotation.dart";
part "subscription.freezed.dart";
part "subscription.g.dart";

@freezed
abstract class SubscriptionUser with _$SubscriptionUser {
  const factory SubscriptionUser({
    required int id,
    @JsonKey(name: "telegramId") int? telegramId,
    String? email,
  }) = _SubscriptionUser;
  factory SubscriptionUser.fromJson(Map<String, dynamic> json) =>
      _$SubscriptionUserFromJson(json);
}
```

Extend `SubscriptionUser` with nullable `firstName/lastName/username/referralCode`; add a `Device` freezed model `{token, label?}` — provider truth from `lib/artemida.ts:298-301` is **only** `{token, name}`, so do not model `lastSeen` as a server field.

**Provider/error analog:** `mobile/lib/features/subscription/providers.dart` (lines 41-68, 89-110, 155-160):

```dart
const Map<String, String> subscriptionNotices = <String, String>{
  "no_active_key": "Нужен активный ключ",
  "unauthorized": "Войдите снова",
  "rate_limited": "Слишком много запросов. Попробуйте позже",
  "provider_error": "Сервис временно недоступен. Попробуйте позже",
  "internal": "Ошибка сервиса. Попробуйте позже",
  "network": "Нет соединения. Повторите",
};
...
Future<Map<String, dynamic>> _send(Future<Response<dynamic>> Function() call) async {
  try { response = await call(); }
  on DioException catch (error) {
    final data = error.response?.data;
    if (data is Map && data["ok"] == false) throw _failure(...); // domain failure first
    final status = error.response?.statusCode;
    if (status == 401) throw _failure("unauthorized");
    if (status == 404) throw _failure("not_found");
    ...
  }
}
final userSubscriptionProvider = FutureProvider.autoDispose<SubscriptionStatus>((ref) async {
  final dio = ref.read(dioClientProvider).dio;
  final body = await _send(() => dio.get<dynamic>(Endpoints.subscription));
  return _decodeBody(body, SubscriptionStatus.fromJson);
});
```

Add `devicesProvider` (GET `Endpoints.devices`) and a DELETE call following the same `_send`/`_decodeBody` path. Endpoint already exists: `mobile/lib/core/api/endpoints.dart:25` `static const String devices = '/api/mobile/devices';`; add only a token helper mirroring `paymentStatus(String)` at lines 32-33 (`Uri.encodeComponent(token)`).

**Row title fallback (no fake last-seen):** `label ?? name ?? «Устройство»`, token rendered truncated as opaque id, never as a clickable link (`22-RESEARCH.md` line 351-358). Omit «был(а) … назад» — REQ-DEV-01's last-seen sub-item is unfulfillable with the locked provider contract.

---

### `mobile/lib/features/profile/devices/devices_sheet.dart` + `deferred_delete_controller.dart` (component + event-driven controller)

**Widget analog:** `mobile/lib/features/shop/shop_screen.dart` (lines 165-178) and `mobile/lib/features/servers/widgets/pool_toolbar.dart:73-98`:

```dart
  Future<void> copySubscriptionLink(BuildContext context, WidgetRef ref, String? link) async {
    if (link == null || link.isEmpty) return;
    await ref.read(linkCopierProvider)(link);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Ссылка скопирована")),
    );
  }
```

**Toast-with-action analog:** `mobile/lib/features/auth/widgets/error_toast.dart` (lines 64-100):

```dart
    scaffoldMessengerKey.currentState?.hideCurrentSnackBar();
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(
        content: Text(message, style: TextStyle(...)),
        backgroundColor: background,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), ...),
        duration: duration,
        action: action ? SnackBarAction(label: "OK", textColor: foreground,
            onPressed: () => scaffoldMessengerKey.currentState?.hideCurrentSnackBar()) : null,
      ),
    );
```

**Deferred-delete shape (proposed implementation from `22-RESEARCH.md` Pattern 2, lines 210-219 — NOT existing code):**

```dart
final timer = Timer(const Duration(seconds: 5), () => ref.read(devicesNotifierProvider.notifier).remove(token));
ScaffoldMessenger.of(context).showSnackBar(SnackBar(
  content: const Text('Устройство отключено'),
  duration: const Duration(seconds: 5),
  action: SnackBarAction(label: 'Вернуть', onPressed: timer.cancel),
));
// mark the row pending-removal during the window; never reinsert after a real DELETE
```

**Listener/provider shape analog:** `mobile/lib/core/payment/payment_resume_listener.dart:50-69` (one-shot `Provider<bool>` doing `unawaited(...)` with an `on Object catch` that never breaks startup) and `mobile/lib/core/vpn/connection_notifier.dart:71-98` (generation token + `ref.onDispose` cancellation — use the same discipline if a cancel races a timer). `Timer` import precedent: `networkPingInvalidationProvider` at `features/servers/providers.dart:495-527` (`Timer? debounce`, cancel on dispose).

**Device-limit / paid upgrade:** read `deviceLimit` from `userSubscriptionProvider` (server authority), not a local constant. The «увеличить лимит» button starts the **existing** `PaymentRequest(kind: "upgrade", ...)` flow — `mobile/lib/features/subscription/models/payment.dart:6-25` carries intent/order only, no amount; backend zod enforces `{addDevices}` at `app/api/mobile/payments/create/route.ts:37-68,143-158`. No direct `upgradeKey` call, no free increment.

---

### `mobile/lib/features/profile/settings/*` (components)

- **Kill switch row:** plain `Text` + small caption per D-02; no `Switch`, no `GestureDetector`. Test asserts no `Switch` in tree (`22-VALIDATION.md:475`). Semantics precedent: `main_header.dart:161-176`.
- **Referral row:** reuse `linkCopierProvider` (`shop_screen.dart:30-42`) and the toast helper (`shop_screen.dart:165-178`); button passes `?ref=${user.referralCode}` from the `/subscription` identity block; call `ensureReferralCode` server-side for NULL legacy rows. Watch `context.mounted` after await, as in the analog.
- **Reset Demo:** local-only sequence from `22-RESEARCH.md` lines 360-369:

```dart
await ref.read(tokenStoreProvider).clearAll();
await ref.read(secureStorageProvider).clearAll();
await ref.read(appDatabaseProvider).deleteAllTables(); // regenerate .g.dart if helpers added
ref.invalidate(authNotifierProvider);
context.go('/auth');
  // No ARTEMIDA call, no key deletion, no server session revocation.
```

  Evidence: `core/storage/token_store.dart:66-73` (`clearAll` deletes 3 keys) vs `secure_storage.dart:51-54` (`clearAll` covers only `_storage`, not `_biometricStorage`); `core/auth/auth_notifier.dart:246-253` `logout()` clears tokens then sets `unauthenticated`. Never call `clearDevices` or revoke JWTs server-side.
- **Network chip:** do not rebuild. Reuse `networkLabelProvider` (`server_pool_screen.dart:33-55`) and `PoolToolbar` (`pool_toolbar.dart:6-9,73-98`); invalidation already lives in `networkPingInvalidationProvider` (`features/servers/providers.dart:489-527`) and manual re-ping toast is «Пинг обновлён» (`providers.dart:483`). No toggle, no «Сеть изменена» toast on tap.

---

### `mobile/lib/core/settings/settings_table.dart` + `auto_connect_listener.dart` (Drift model + event-driven provider)

**Drift analog:** `mobile/lib/core/db/tables.dart` (lines 43-65) singleton-row pattern and `mobile/lib/core/db/app_database.dart:15-26`:

```dart
/// The currently displayed pool tab, persisted across restarts (D-14).
class CurrentTab extends Table {
  /// Singleton row id; always 1.
  IntColumn get id => integer()();
  TextColumn get tab => text()();
  @override
  Set<Column> get primaryKey => {id};
}
```
```dart
@DriftDatabase(
  tables: [PingCache, LastGood, Selection, CurrentTab, ServerListCache],
  daos: [PingCacheDao],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: "app_db"));
  @override
  int get schemaVersion => 1;
}
```

Add a `Settings`/`AutoConnect` table with singleton `id = 1`, `autoConnect` bool and `wasConnected` bool; bump `schemaVersion` to 2 with a real `migration` strategy; regenerate `app_database.g.dart` via `dart run build_runner build --delete-conflicting-outputs` (generated file is not an implementation baseline). In-memory test constructor `AppDatabase(NativeDatabase.memory())` precedent: `app_database.dart:20-23` and `network_invalidation_test.dart:80-95`.

**Listener analog:** `mobile/lib/core/payment/payment_resume_listener.dart:50-69` (one-shot provider) + `mobile/lib/core/vpn/connection_notifier.dart:178-220`:

```dart
final Provider<bool> connectionReconnectListenerProvider = Provider<bool>((ref) {
  final service = ref.read(connectivityServiceProvider);
  final subscription = service.connectivityStream.distinct().listen(
        (results) => ref.read(connectionNotifierProvider.notifier).onConnectivityChanged(results));
  ref.onDispose(subscription.cancel);
  return true;
});
```
```dart
  Future<void> connect(PoolTab tab, {required bool auto, String? manualServerId}) async {
    final generation = ++_generation;
    ...
```

Gate auto-connect on authenticated state (`core/auth/auth_state.dart:13-28` `AuthState.authenticated/unauthenticated/loading/error`), an active key (`userSubscriptionProvider`), and biometric resume (`resumeBiometricGateProvider` in `main.dart:27`); call `connect(tab, auto: true)` **once**. Let existing `onConnectivityChanged` (`connection_notifier.dart:463-479`) handle later changes — do not add a second reconnect path or touch native rules.

---

### `mobile/lib/core/notifications/local_notifications.dart` + `expiry_scheduler.dart` (+ native setup) (event-driven services)

**No Dart analog exists** — use `22-RESEARCH.md` §Code Examples (lines 310-349), which is sourced from official FLN docs, and treat exact FLN 23.x signatures as unverified until `flutter analyze` after the human-verify gate:

```dart
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

Future<void> scheduleExpiryReminders(DateTime serverExpiryUtc) async {
  tz.initializeTimeZones(); // once, at startup
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('app_icon'),
      iOS: IOSInitializationSettings(),
    ),
    onDidReceiveNotificationResponse: (response) { /* payload == 'shop' → go('/shop') only */ },
  );
  for (final days in const <int>[7, 3, 1]) {
    final when = tz.TZDateTime.from(serverExpiryUtc.toLocal().subtract(Duration(days: days)), tz.local);
    if (when.isBefore(tz.TZDateTime.now(tz.local))) continue; // no past schedules
    await plugin.zonedSchedule(days, 'Подписка истекает', 'Продлите подписку, чтобы не потерять доступ',
        scheduledDate: when,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails('expiry', 'Напоминания', channelDescription: 'Срок подписки'),
          iOS: DarwinNotificationDetails()),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        payload: 'shop');
  }
}
```

Rules: `expiresAt` is server-authoritative (`userSubscriptionProvider`); never client-side entitlement math; a notification tap navigates to `/shop` only — no payment/entitlement effect. Install `flutter_local_notifications:23.0.4` + direct `timezone` **only after** `checkpoint:human-verify` (D-09; pub legitimacy seam unsupported); on refusal, record the blocked dependency with no silent substitute. Do not add `firebase_core`/`firebase_messaging` or a fake FCM token route (D-08).

**Native channel/delegate seam analogs (tracked):**
- `mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnForegroundService.kt:94-111` — idempotent `NotificationChannel` creation pattern (separate `expiry` channel; do not alter the VPN channel/`CHANNEL_ID = "3set-vpn"`).
- `mobile/android/app/src/main/AndroidManifest.xml:71-79` — existing service/receiver declaration style; add FLN-required `ScheduledNotificationReceiver`/`BootReceiver` and permissions alongside, without touching the VPN service block.
- `mobile/ios/Runner/AppDelegate.swift:4-16` — `didFinishLaunchingWithOptions` insertion point for `UNUserNotificationCenter.delegate` and plugin registration; no Firebase setup.

---

### Bootstrap / config modifications

**`mobile/lib/main.dart`** (lines 24-40, 51-59): add `ref.watch(autoConnectListenerProvider)` and the expiry-notification listener alongside existing always-on listeners; keep `theme: AppTheme.dark`, `darkTheme`, `themeMode: ThemeMode.dark`. For Q8 accessibility, **raise/remove** the upper clamp:

```dart
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(MediaQuery.of(context).textScaler.scale(1.0).clamp(0.8, 1.3)),
          ),
          child: child!,
        );
```

**`mobile/lib/app/router.dart`** (lines 41-118): keep `GoRouter` auth redirect and the existing 6 routes; do not introduce `NavigationBar`. Profile sheet opens via the existing avatar callback (`server_pool_screen.dart:133` `onProfile: () => _profileSheet(context)`); a named `/profile` route is optional, but WebView/payment routes stay side-effect free. Notification deep link uses `go('/shop')` only.

**`mobile/lib/app/theme.dart`** (lines 52-58, 317-358): `dim = Color(0xFF6f8272)` fails AA on `surface` (4.24:1) and `surface2` (3.92:1) per `22-RESEARCH.md` Pitfall 7; darken `dim` or restrict it to decorative large text. Update `mobile/test/widget/app/theme_test.dart:22-45` palette assertions when the token changes; add `Semantics` to custom controls (`main_header.dart:161-176` precedent) and `excludeFromSemantics` to confetti/ring painters.

**`mobile/pubspec.yaml`** (lines 10-48): pin new deps exactly like `flutter_inappwebview: 6.1.5`; regenerate lockfile only after the human gate. Never hand-edit generated files.

---

### Wave 0 test analogs

- **Backend** — `tests/unit/mobile-subscription-route.test.ts:10-45` for `vi.hoisted` mocks; `tests/unit/devices-route.test.ts:76-161` for no-oracle/no-provider-call vectors.
- **Deferred delete** — `mobile/test/unit/core/ping/network_invalidation_test.dart:80-95` (Timer/stream fixture + `NativeDatabase.memory()`) and `payment_resume_listener_test.dart:51-67` (one-shot listener verification). Use `fakeAsync`/`tick` for deterministic 5s window (`22-VALIDATION.md:55`).
- **Providers/models** — `mobile/test/unit/features/subscription/providers_test.dart:23-110` (server fixtures decoded, no client-generated values; assert `toJson()` has no `amount`).
- **Widgets** — `mobile/test/widget/features/servers/server_pool_screen_test.dart:1-80` (`ProviderContainer` overrides with mock Dio + fake FSM) and `mobile/test/widget/app/theme_test.dart:22-45,119-137` (theme/source assertions). Inject clipboard/toast seams like `shop_screen.dart:30-42` so no platform channel is needed.
- **Reset** — `mobile/test/unit/core/storage/token_store_test.dart` + `mobile/test/unit/core/db/ping_cache_test.dart` for storage/Drift assertions; assert no backend call.
- **Notifications** — fake FLN platform seam following the `MockDio`/`MockDioClient` pattern at `providers_test.dart:19-21`; assert 3 absolute instants, past ones skipped, payload `'shop'`.

## Shared Patterns

### Authentication / ownership gate
**Sources:** `lib/mobile-auth.ts:44-76` (`verifyAccessToken`: Bearer + HS256 + `typ='access'` + credentials watermark), `app/api/mobile/subscription/route.ts:52-91` (JWT → user row → `listKeysByUserId` → `isKeyConnectable`).
**Apply to:** both `/api/mobile/devices` routes and the modified `/subscription`. Never `requireSession()` on mobile routes; never accept a client `keyId`.

### Response envelope / error mapping
**Sources:** `app/api/mobile/subscription/route.ts:45-50,98-111,140-144`; `mobile/lib/features/subscription/providers.dart:41-68,89-110`.
**Apply to:** all new BFF routes and Flutter providers. Backend: HTTP 200 + `{ok:false,error:<stable code>}` for provider failures, 401 for missing JWT, `x-request-id` always, `Retry-After` on rate limits; log only `{route,requestId,userId,outcome,code,durationMs}`. Client: `SubscriptionFailure(code, frozen Russian notice)`, unknown exceptions → «Нет соединения. Повторите».

### Provider boundary (single source of truth)
**Sources:** `lib/artemida.ts:1-15,22-43,590-634,684-693,716-722`; `lib/keys-service.ts:367-424,763-771`.
**Apply to:** device list/delete. ARTEMIDA is server-only, `Bearer` + fresh `Idempotency-Key` on writes, p-retry only 429/502/503 with `Retry-After`, `.passthrough()` normalization. `upgradeKey({addDevices})` may be called **only** from the worker after a paid order.

### App-level listeners + generated code
**Sources:** `mobile/lib/main.dart:24-40`; `core/payment/payment_resume_listener.dart:50-69`; `features/servers/providers.dart:489-527`; `core/vpn/connection_notifier.dart:51-67`.
**Apply to:** auto-connect and expiry-reminder wiring. Watch listeners once in `App.build`; cancel timers/subscriptions in `ref.onDispose`; wrap startup work in `unawaited(...)` + catch. Regenerate every `.g.dart`/`.freezed.dart` with `dart run build_runner build --delete-conflicting-outputs`; never hand-edit them.

### Toasts, clipboard, semantics, dark theme
**Sources:** `features/auth/widgets/error_toast.dart:64-100`; `features/shop/shop_screen.dart:30-42,165-178`; `features/servers/widgets/main_header.dart:161-176`; `features/servers/widgets/pool_toolbar.dart:73-98`; `app/theme.dart:52-58,317-358`.
**Apply to:** all new profile/settings/device widgets. Dark surfaces only, frozen Russian copy, no bottom nav, `Semantics` on icon-only controls, no fake network toggle.

## No Analog Found

| File | Role | Data Flow | Reason / planner guidance |
|------|------|-----------|---------------------------|
| `mobile/lib/core/notifications/expiry_scheduler.dart` | service | event-driven | No local-notification code in repo (only the VPN foreground channel). Use `22-RESEARCH.md` lines 311-349 (official FLN docs) and verify signatures with `flutter analyze` after install. |
| `mobile/lib/core/notifications/local_notifications.dart` | service | event-driven | No FLN plugin wiring exists. Partial native seam only (`VpnForegroundService.kt:94-111`, `AppDelegate.swift:4-16`); do not modify VPN notification behavior. |
| FCM token registration (REQ-NOTIF-02) | backend + client | event-driven | No Firebase credentials/route/env exist (`22-RESEARCH.md` Q4). BLOCKED — no fake route, no fabricated token; descope with explicit UAT exclusion. |
| Device `lastSeen` (REQ-DEV-01 sub-item) | model field | request-response | Provider `Device` is `{token,name}` only (`lib/artemida.ts:298-301`). Omit the field; mark acceptance criterion unfulfillable rather than fabricate relative time. |
| Free add / provider restore (REQ-DEV-03/02 literal wording) | route | request-response | Contract has no `POST /devices` and no restore (`docs/artemida-v1-contract.md:45-57`). Reinterpreted by D-05/D-06; no analog to copy. |
| `.planning/REQUIREMENTS.md` REQ-SET-01 rewrite | doc | — | Wording-only change per D-03; reference phase 20 D-09 as the reason. |

## Metadata

**Analog search scope:** `app/api/mobile/**`, `app/api/keys/[id]/devices/**`, `lib/*` (artemida, keys-service, mobile-auth, referrals), `tests/unit/*`, `mobile/lib/{app,core,features}/**`, `mobile/test/{unit,widget}/**`, `mobile/android/**`, `mobile/ios/**`, `prisma/schema.prisma`, `mobile/pubspec.yaml`.
**Files scanned:** ~110 candidates; 28 distinct tracked analog files read (non-overlapping ranges; large files > 200 lines read only at grep-located sections).
**Pattern extraction date:** 2026-11-28.
**Tracking gate:** every named analog path verified via `git ls-files`; no plugin/runtime mirror paths, no generated `.g.dart`/`.freezed.dart` or lockfiles used as implementation baselines.
