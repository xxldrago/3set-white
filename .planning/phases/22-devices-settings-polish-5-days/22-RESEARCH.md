# Phase 22: Devices, Settings & Polish — Research

**Researched:** 2026-11-28
**Domain:** ARTEMIDA device-management contract + Flutter profile/settings/notification polish (mobile v2.0)
**Confidence:** MEDIUM (repo contract and code paths HIGH; package/version and external Firebase facts LOW, gated)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Kill switch остаётся **всегда включённым**, без пользовательского toggle. Решение фазы 20 D-09 и безусловное требование REQ-CONN-06 «disconnect → no traffic leaks» не пересматриваются. ROADMAP 22.5 / старый REQ-SET-01 с toggle не реализуются. — **Reversibility:** costly — откат меняет публичное поведение безопасности и нативные правила: Android `VpnService` `allowBypass=false` и iOS `NEOnDemandRuleConnect`; нужны новые тесты на утечки трафика и пересмотр REQ-CONN-06.
- **D-02:** В профиле показывается read-only строка «Kill switch: включён» + пояснение мелким текстом «Трафик вне VPN заблокирован». Не кликабельно, без выключателя и без изменения тоста фазы 20 D-12. — **Reversibility:** reversible — локальный виджет и копия.
- **D-03:** `REQ-SET-01` в `.planning/REQUIREMENTS.md` переписывается из «Toggle» в «Kill Switch Status (read-only)» с явной ссылкой на D-09 фазы 20 как причину. Планировщик не должен строить toggle. — **Reversibility:** reversible — формулировка требования, без миграции.
- **D-04:** Фаза 22 **не меняет нативный VPN-код**: `allowBypass=false`, `NEOnDemandRuleConnect`, Foreground Service и Entitlements остаются как в фазе 20. Никаких скрытых флагов и выключателей в нативном слое. — **Reversibility:** costly — нативный контракт и проверка утечек трафика; откат требует изменения Android/iOS-кода и повторной верификации.

### the agent's Discretion

- Формат профиля/настроек (shutter vs отдельный экран), конкретные виджеты и порядок секций — на усмотрение планировщика, если сохраняются тёмная тема прототипа и отсутствие нижней навигации (D-15/D-16 фазы 19, D-16 фазы 21).

### Deferred Ideas (OUT OF SCOPE)

- Пользовательский toggle kill switch — отклонён пользователем 2026-11-28 как конфликтующий с D-09 фазы 20; не переносить в более поздние фазы без нового решения.
- Идеи вне обсуждённой зоны (устройства/undo, сеть-чип, push, источник профиля, Reset Demo) не были выбраны для обсуждения; они не являются новыми фичами, а остаются открытыми вопросами в рамках текущей фазы и подлежат research.
- Отложенное из фаз 19/20 UAT остаётся внешним долгом и не входит в фазу 22.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-DEV-01 | Device list: name, last seen, remove button | Provider gives `{token,name}` only; no `lastSeen`; labels exist locally (`listDevicesWithLabels`) — see Q1 |
| REQ-DEV-02 | Remove with 5s «Вернуть» undo | No provider restore endpoint; deferred-delete window is the only honest undo — Q2 |
| REQ-DEV-03 | «Добавить это устройство» → POST → count +1 | No free provider add-device call; subscription-link import or PAID `upgradeKey(addDevices)` — Q1 |
| REQ-DEV-04 / REQ-SUB-04 | Limit enforcement at `deviceLimit` | `GET /subscription` already exposes `deviceLimit`/`devices`; mobile 2..10 paid bounds exist — Q1 |
| REQ-SET-01 | Kill switch read-only status (rewritten by D-03) | D-01..D-04 locked; widget copy from D-02; no native changes |
| REQ-SET-02 | Auto-connect toggle persisted | New local setting + launch listener; FSM already has network-change reconnect (D-15 phase 20) — Q7 |
| REQ-SET-03 | Referral link copy | Real `user.referralCode` (schema) + `ensureReferralCode`; reuse `Clipboard.setData` helper — Q5 |
| REQ-SET-04 | Reset Demo (secure storage + Drift) | `TokenStore.clearAll`/`SecureStorage.clearAll`/Drift DB; never server session/key — Q6 |
| REQ-SET-05 | Network Chip WiFi/LTE, invalidate ping cache | Read-only label from `connectivity_plus` (D-11 phase 19); real invalidation from existing listener — Q3 |
| REQ-NOTIF-01 | Local expiry reminders T-7/3/1d | `flutter_local_notifications` 23.0.4 + `zonedSchedule`; Android/iOS setup required — Q4 |
| REQ-NOTIF-02 | FCM token registration with backend | BLOCKED: no Firebase project/credentials/backend route; external gate — Q4 |
| REQ-BE-06 | `GET/DELETE /api/mobile/devices` | Reuse ownership-joined `keys-service` + shared `/subscription` identity gate — Q1 |

</phase_requirements>

## Project Constraints (from AGENTS.md)

- **Tech stack:** Node + Next.js + Telegraf backend; Flutter mobile client; PostgreSQL + Prisma 7; RU/RUB.
- **API limits:** trial cannot renew/upgrade; permanent delete without refund; handle 401/402/409/429/502/503 and `Retry-After`.
- **Security:** `ARTEMIDA_API_KEY`, Platega secrets, SSH/root password env-only; never commit secrets; no secrets/token in logs or UI.
- **Compatibility:** PWA installable, Telegram Bot API + Login Widget; mobile PWA-style dark prototype; HTTPS mandatory for webhooks.
- **Infrastructure:** single server, `dash.3set.online`; no client→ARTEMIDA calls; backend is the only provider client.
- **Workflow enforcement:** use GSD commands before file edits; commit docs through GSD, not ad-hoc `git add -A` (42+ unrelated working-tree edits exist).
- **Next.js agent rule:** `AGENTS.md:167-173` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing backend code (e.g. `01-app/01-getting-started/15-route-handlers.md`, read this session). Route Handlers are `app/api/**/route.ts`, `GET/POST/DELETE` supported, `force-dynamic` for BFF reads (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:29-51`).
- **Established invariants (from phase contexts):** no simulation/`Math.random`/fake IP/`load`; no bottom navigation; `AppTheme.dark` app-wide; generated freezed/`.g.dart` rebuilt via `dart run build_runner build --delete-conflicting-outputs`; backend errors degrade to HTTP 200 stable `{ok:false,error}` codes with `Retry-After` on rate limits.

## Summary

Phase 22 sits on top of a complete backend device-management layer that is **already implemented for the PWA** but not yet exposed under the mobile JWT contract. The ARTEMIDA V1 contract observed exactly three device operations: `GET /keys/{id}/devices` → `{items[],used,limit}`, `DELETE /keys/{id}/devices/{token}`, and `POST /keys/{id}/devices/clear`; `lib/artemida.ts` and `lib/keys-service.ts` already wrap all three with ownership joins. What the contract does **not** contain is a device "add" call or a device "restore" call: devices appear when a client imports the subscription link, and extra device slots are sold as a **paid, prorated** `POST /keys/{id}/upgrade` with `{addDevices}` only (observed 402 quote «Нужно 60 ₽» for +1 device on a 30-day key). Two of the locked requirements therefore cannot be implemented literally without lying to the user: REQ-DEV-02 undo must be a client-side **deferred delete** (cancel before the real DELETE is sent), and REQ-DEV-03 must be a **subscription-link handoff** plus a clearly labelled paid upgrade path, not a free POST that fakes a count increment.

The rest of the phase is mostly wiring into existing seams: the profile sheet stub (`server_pool_screen.dart:463-484`) replaces with a sheet fed by the single `/api/mobile/subscription` identity block (which already carries `user{id,telegramId,email}` and can cheaply carry real `firstName/username/referralCode` from the same DB row); the read-only network chip already exists (`PoolToolbar`), fed by `connectivity_plus` and already connected to ping-cache invalidation (`networkPingInvalidationProvider`); kill switch is a text row only per D-01..D-04; and Reset Demo is purely local (secure storage + Drift) with no server-side revocation. External blockers are real: FCM needs a Firebase project, `firebase_options.dart`, APNs key, and a backend token-registration route — none exist in this repo — so REQ-NOTIF-02 must be gated as a human/owner decision rather than silently stubbed.

**Primary recommendation:** Implement 22.1–22.4 as honest BFF + UI work using the existing ownership-joined `keys-service`, resolve device-limit growth through the *existing paid upgrade flow*, make undo a 5-second deferred DELETE, and split push into (a) shippable local notifications and (b) a BLOCKED FCM task requiring owner credentials; add a `checkpoint:human-verify` before installing any new pub package.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Device list / delete (`GET`, `DELETE /api/mobile/devices`) | API / Backend | Database / Storage | Ownership join happens server-side (`keyCache` row by `claims.userId`); client must never send `keyId` or call ARTEMIDA |
| Device "add" / device-limit growth | API / Backend (paid order) | Browser / Client (link handoff only) | Provider has no add-device call; new slot is a paid upgrade through webhook→outbox→worker (single issuer) |
| Profile identity / referral code | API / Backend | Browser / Client | JWT carries only `uid`/`tid`; name/referral must come from the DB row via `/subscription`, never invented |
| Kill switch status | Browser / Client (read-only text) | — | D-01..D-04: native layer untouched; no toggle, no flag |
| Auto-connect preference | Browser / Client (Drift) | API / Backend (key gate) | Local preference only; the launch-time connect still uses the server-gated `/servers` + `/config` path |
| Network chip + ping invalidation | Browser / Client | — | Real `connectivity_plus` stream; cache clear/re-ping already owned by Riverpod notifier |
| Reset Demo | Browser / Client | — | Secure storage + Drift only; never server session/key |
| Expiry reminders | Browser / Client (OS scheduler) | API / Backend (expiry data) | `expiresAt` is server-authoritative; scheduling is local; FCM remote delivery blocked externally |
| Accessibility polish | Browser / Client | — | Theme + `MediaQuery` live entirely in Flutter |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js Route Handlers | installed (`16.3.x` per AGENTS.md stack) | `/api/mobile/devices` GET + DELETE | Already the pattern for every mobile BFF route; `GET/POST/DELETE` supported, `force-dynamic` BFF reads `[VERIFIED: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:29-51]` |
| zod | `^4.6` (verified 4.6.5 previously) | Validate path token, body, provider boundary | Mandated at every boundary by AGENTS.md/phase 21 |
| Telegraf / Prisma 7 / Postgres 17 | existing | unchanged | Phase 22 adds no bot or schema migration for devices (labels table already exists) |
| `connectivity_plus` | `^7.3.2` in `mobile/pubspec.yaml`; latest `7.3.2` published 2026-10-01 `[CITED: https://pub.dev/api/packages/connectivity_plus]` | Read-only WiFi/LTE/none chip + real network-change invalidation | Already wired in `ConnectivityService`, `networkLabelProvider`, two app-level listeners |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `flutter_local_notifications` | latest `23.0.4`, published 2026-11-23, SDK `^3.12.0`, Flutter `>=3.44.0` `[CITED: https://pub.dev/api/packages/flutter_local_notifications]` (seam confidence LOW) | T-7/3/1d local expiry scheduling | Add as **exact pin** behind `checkpoint:human-verify` — version is 4 days old and 23.0.3 had a calendar regression fixed in 23.0.4 |
| `timezone` | `^0.11.0` transitive; add as **direct** dep (same pin family) `[CITED: https://pub.dev/api/packages/flutter_local_notifications]` | `TZDateTime.from(serverUtcInstant, tz.local)` for DST-safe scheduling | Required directly by official docs; avoids adding `flutter_timezone` |
| Existing `ScaffoldMessenger` + `ErrorToastService` | in-repo | Toasts with actions (undo) | `SnackBarAction` already supported at `error_toast.dart:89-97`; reuse instead of a toast package |
| Drift `app_db` | schemaVersion 1, 5 tables `[VERIFIED: mobile/lib/core/db/app_database.dart:15-26]` | Auto-connect preference row + Reset Demo clear | Add a table via normal migration (v2); no SQLite rewrite |
| `Clipboard.setData` | Flutter services | Referral + subscription link copy | Already used at `shop_screen.dart:39-41,167-176` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deferred client-side undo (no DELETE until 5s elapses) | Immediate DELETE + provider restore | No restore endpoint exists in the locked contract — a "restored" row would be fake. Deferred delete is honest; risk is app kill during window (no deletion occurs — safe) |
| "Add this device" = open/copy subscription link | Backend `POST /devices` | Provider has no add-device write; a fake POST that increments a local count would desync from `GET /devices` on next refresh |
| Local notifications for T-7/3/1d | FCM only | FCM needs credentials + backend registration that do not exist; local scheduling works offline once scheduled |
| Session-cookie/PWA profile | Telegram Login Widget hash in mobile | Mobile uses deep-link nonce flow, not the widget; JWT only has `uid`/`tid`; real name lives in the DB row |

**Installation:**

```bash
cd mobile
flutter pub add flutter_local_notifications:23.0.4 timezone   # ONLY after human-verify gate
dart run build_runner build --delete-conflicting-outputs      # if new freezed/Drift code added
```

**Version verification (this session):**

- `flutter_local_notifications` latest `23.0.4`, published `2026-11-23T09:47:03.955336Z`; declared SDK `^3.12.0`, Flutter `>=3.44.0` `[CITED: https://pub.dev/api/packages/flutter_local_notifications]`.
- `connectivity_plus` latest `7.3.2`, published `2026-10-01T19:32:11.339157Z`, SDK `>=3.2.0 <4.0.0`, Flutter `>=3.7.0` `[CITED: https://pub.dev/api/packages/connectivity_plus]` — matches existing `^7.3.2` pin.
- Local toolchain verified: Flutter `3.50.1` stable (rev `ae9b586f34`, 2026-11-18), Dart `3.14.0` stable (2026-11-04) — satisfies both packages' declared SDK floors.

## Package Legitimacy Audit

> `gsd-tools query package-legitimacy check --ecosystem pub ...` is **not supported** (only npm/pypi/crates: `Error: Usage: ... <npm|pypi|crates>`). Context7 MCP and `ctx7` CLI are both unavailable in this session. Therefore no pub package can earn `[VERIFIED: npm registry]`-style status, and all new installs must be gated by a human checkpoint.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `flutter_local_notifications` | pub.dev (latest 23.0.4, 2026-11-23, publisher `dexterx.dev`) | 8+ yrs (first publish 2018-03-25) | not queried (pub.dev API has no count) | `github.com/MaikuB/flutter_local_notifications` `[CITED: pub.dev API]` | UNVERIFIED (seam unsupported; 4-day-old latest) | Flagged — planner must add `checkpoint:human-verify` before install |
| `timezone` | pub.dev (`^0.11.0` declared dependency of FLN) | long-standing | not queried | pub.dev ecosystem `[CITED: pub.dev FLN API]` | UNVERIFIED (direct dep) | Flagged — same human checkpoint |
| `connectivity_plus` | pub.dev (7.3.2, already in `pubspec.yaml`) | 6+ yrs | not queried | `github.com/fluttercommunity/plus_plugins` `[CITED: pub.dev API]` | Already installed; no new install | Approved (no action) |
| `firebase_core` / `firebase_messaging` | pub.dev | — | — | official Firebase docs `[CITED: https://firebase.google.com/docs/flutter/setup]` | BLOCKED (no Firebase project/credentials) | Do not install in this phase |

**Packages removed due to SLOP verdict:** none (no seam verdict available for pub ecosystem).
**Packages flagged as suspicious/unverified:** `flutter_local_notifications`, `timezone` — planner inserts `checkpoint:human-verify` before each install (identity, exact pin, SDK compatibility), mirroring the phase 21 `flutter_inappwebview` gate.

## Architecture Patterns

### System Architecture Diagram

```text
[Flutter Profile Sheet] ──GET /api/mobile/subscription──> [Next BFF: identity + deviceLimit]
        │                                                      │
        │  GET /api/mobile/devices ────────────────────────────>│ verifyAccessToken → claims.userId
        │  DELETE /api/mobile/devices/{token} ─────────────────>│ zod(token) → keyCache ownership join
        │                                                      │ → keys-service → ARTEMIDA (server-only)
        │  [5s undo timer] ──(if not cancelled)──> DELETE ──────>│
        │                                                      ▼
        │                                            [ARTEMIDA V1 /keys/{id}/devices]
        │
        ├─ "Add this device" ──> open/copy subscription link (client imports config; provider registers device)
        ├─ "Увеличить лимит" ──> POST /payments/create {kind:'upgrade',addDevices}
        │                          → Platega webhook → outbox → worker → upgradeKey (PAID, sole issuer)
        ├─ Network chip ──> connectivity_plus stream ──> clearPingCacheAndLastGood + re-ping
        │                          └──> FSM reconnect only while connected (phase 20 D-15)
        ├─ Kill switch row ──> read-only text (no native path, no toggle)
        ├─ Auto-connect toggle ──> Drift setting ──> launch listener ──> existing FSM connect()
        ├─ Reset Demo ──> TokenStore.clearAll + SecureStorage.clearAll + Drift clear → /auth
        └─ Expiry reminders ──> server expiresAt ──> zonedSchedule(T-7/3/1d) ──> OS notification → /shop
                       [FCM token ──X── blocked: no Firebase credentials / backend route]
```

### Recommended Project Structure

```text
app/api/mobile/devices/
├── route.ts                  # GET: JWT → owned key → listDevicesWithLabels
└── [token]/route.ts          # DELETE: JWT → zod token → removeDeviceByUserId
mobile/lib/features/profile/
├── profile_sheet.dart        # replaces _ProfileSheet stub; read-only kill-switch row
├── devices/                  # Device model (freezed), providers, list widget, deferred-delete controller
└── settings/                 # auto-connect, referral copy, reset demo widgets
mobile/lib/core/settings/
├── settings_table.dart       # Drift table: autoConnect + wasConnected (schema v2)
└── auto_connect_listener.dart# app-level provider, same shape as paymentResumeListenerProvider
mobile/lib/core/notifications/
├── expiry_scheduler.dart     # zonedSchedule from server expiresAt; timezone direct dep
└── local_notifications.dart  # initialize + Android/iOS platform setup
mobile/lib/core/api/endpoints.dart  # already has devices; add token helper if needed
mobile/lib/main.dart                # watch auto-connect + notification listeners
```

### Pattern 1: Ownership-joined mobile device route (copy the PWA route, swap the auth gate)

**What:** JWT `claims.userId` replaces `requireSession()`; client sends **only** the opaque device `token`, never `keyId`. Resolve the active owned key server-side with the same `listKeysByUserId` + `isKeyConnectable` predicate used by `/subscription`, `/servers`, `/config`.
**When to use:** both `GET` and `DELETE /api/mobile/devices` (REQ-BE-06).
**Evidence:** `/subscription` already does exactly this read (`app/api/mobile/subscription/route.ts:69-82`); the PWA device DELETE already calls `removeDeviceByUserId(userId, keyId, token)` after an ownership join (`app/api/keys/[id]/devices/[token]/route.ts:57-67`); `keys-service.ts:763-770` joins local labels.
```ts
// Source: app/api/mobile/subscription/route.ts:50-74 + app/api/keys/[id]/devices/[token]/route.ts:57-75
const claims = await verifyAccessToken(req);            // 401 on null
const keys = await listKeysByUserId(claims.userId);
const active = keys.find(isKeyConnectable);             // same gate as /servers + /config
if (!active) return respond({ ok: false, error: "no_active_key", user: identity }, requestId);
const devices = await listDevicesWithLabels(claims.userId, active.id); // null → not owned
// DELETE: zod-validate token (min 1, max 300) BEFORE provider call;
// await removeDeviceByUserId(claims.userId, active.id, token);
// provider errors → HTTP 200 stable code + Retry-After on rate_limited; never 5xx/provider text
```

### Pattern 2: Deferred-delete undo (no provider restore exists)

**What:** keep the row on screen for 5 s with a «Вернуть» `SnackBarAction`; only send the real DELETE when the timer fires. Tapping «Вернуть» cancels the timer — nothing was ever removed provider-side.
**When to use:** REQ-DEV-02 (5-second undo).
**Evidence:** locked contract lists only GET/DELETE/clear `[VERIFIED: docs/artemida-v1-contract.md:27,57,127]`; `lib/artemida.ts:687-693` implements exactly `deleteDevice`/`clearDevices`, no restore.
```dart
// Source: mobile/lib/features/auth/widgets/error_toast.dart:89-97 (SnackBarAction pattern)
final timer = Timer(const Duration(seconds: 5), () => ref.read(devicesNotifierProvider.notifier).remove(token));
ScaffoldMessenger.of(context).showSnackBar(SnackBar(
  content: const Text('Устройство отключено'),
  duration: const Duration(seconds: 5),
  action: SnackBarAction(label: 'Вернуть', onPressed: timer.cancel),
));
// UI shows the row as pending-removal during the window; refresh must not resurrect a deleted row.
```

### Pattern 3: Read-only network chip → real invalidation

**What:** chip text comes from the existing `connectivity_plus` stream; no toggle. Cache invalidation is already automatic; a manual refresh uses the existing `refresh()` path.
**When to use:** REQ-SET-05 without violating phase 19 D-11.
**Evidence:** `server_pool_screen.dart:41-55` maps real results to `"Нет сети"`, `"Wi-Fi"`, `"LTE"`, `"Ethernet"`, `"Онлайн"`; `pool_toolbar.dart:6-9` documents "read-only network chip"; `providers.dart:495-520` clears ping cache + last-good and re-pings on real changes.
```dart
// Source: mobile/lib/features/servers/providers.dart:450-486,495-520
await ref.read(connectControllerProvider.notifier).refresh(tab); // manual: clear cache + full ping + "Пинг обновлён"
// automatic path already runs in networkPingInvalidationProvider; do NOT add a fake toggle.
```

### Anti-Patterns to Avoid

- **Fake undo / fake add:** reinserting a deleted device into local state after a real provider DELETE, or incrementing a local count without a provider write — next `GET` proves it false.
- **Client-supplied `keyId`:** IDOR vector; always derive from `claims.userId` (phase 21 T-21-11).
- **Free "upgrade" call:** `upgradeKey(addDevices)` is a paid prorated charge `[VERIFIED: docs/artemida-v1-contract.md:100-115]`; never call it from a UI button that promises a free add. Only `/payments/create {kind:'upgrade'}` → webhook → outbox → worker may issue it.
- **Manual network simulation:** prototype `state.net` toggle (`prototype-mobile-client.html:791-798`) is a demo artifact; D-11 forbids it in production.
- **Toggle/flag in native layer:** D-01/D-04 forbid any hidden kill-switch flag; the profile row is text only.
- **Server-side Reset Demo:** never revoke JWTs, delete keys/devices, or call provider "clear" from a local reset button.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Device CRUD / ownership | New ARTEMIDA client or direct fetch | `lib/artemida.ts` + `lib/keys-service.ts` (`listDevicesWithLabels`, `removeDeviceByUserId`) | Ownership joins and both provider error envelopes already handled |
| Auth gate on new route | Custom session parsing | `verifyAccessToken` + `listKeysByUserId` + `isKeyConnectable` | One predicate serves `/subscription`, `/servers`, `/config`; no duplicate gating |
| Error mapping | 5xx / raw provider text | Existing `{ok:false,error}` envelope + stable Russian notice table (`subscriptionNotices`, `providers.dart:42-56`) | Provider text/requestId never reaches UI or logs |
| Toasts with action | New toast package | `ScaffoldMessenger` + `SnackBarAction` (`error_toast.dart`) | Already themed; supports 5s duration + action |
| Clipboard | Plugin | `Clipboard.setData` helper (`shop_screen.dart:39-41`) | No new dependency, consistent toast |
| Ping invalidation | New connectivity listener | `networkPingInvalidationProvider` + `connectControllerProvider.refresh()` | Debounce 500 ms, VPN-only filter, generation token already implemented |
| Expiry dates | Client-side entitlement math | `expiresAt` from `/subscription` | Backend is the only authority for key status/grace |
| Push transport | Home-grown socket push | FCM (when credentials exist) / local notifications now | Firebase setup is externally blocked; do not fake it |

**Key insight:** nearly every phase-22 feature already has a seam in the repo. The real work is honest contract alignment (no free add/restore) and wiring, not new infrastructure.

## Common Pitfalls

### Pitfall 1: Treating "undo" as provider restore
**What goes wrong:** UI re-adds a row after the provider DELETE succeeded; next refresh shows fewer devices than the UI promised.
**Why it happens:** the prototype's undo splices the removed object back into `state.sub.devices` (`prototype-mobile-client.html:890-891`) — pure local simulation, no provider call.
**How to avoid:** defer the DELETE until the 5 s window closes; cancel the timer on «Вернуть».
**Warning signs:** any DELETE issued before the snackbar is shown, or a "restored" toast without a subsequent `GET` confirming the device.

### Pitfall 2: Free add-device / wrong `addDevices` wire shape
**What goes wrong:** `POST /keys/{id}/upgrade` with `{days,devices}` → `400 unsupported_fields`; or a UI promises a free add for 60 RUB worth of capacity.
**Why it happens:** pre-probe assumption superseded by contract finding #5.
**How to avoid:** only the existing paid `/payments/create {kind:'upgrade',addDevices}` path plus webhook/outbox/worker may increase the limit; `lib/artemida.ts:716-722` already posts `{ addDevices }` only.
**Warning signs:** an `upgradeKey` call outside `worker.ts`, or a count changing without a confirmed payment.

### Pitfall 3: Device names / "last seen" invented
**What goes wrong:** UI shows a fake name or "был(а) ... назад" the provider never returned.
**Why it happens:** `Device` is `{token, name}` only `[VERIFIED: lib/artemida.ts:298-301: "export interface Device { token: string; name: string | null; }"]`; the observed `items` array was empty, and the normalizer tolerates `id` as a token fallback with `name` possibly null (`lib/artemida.ts:433-446`). Local labels exist through `DeviceLabel` (`prisma/schema.prisma` model with `@@unique([userId, keyId, token])`) and `listDevicesWithLabels`.
**How to avoid:** show `label ?? name ?? «Устройство»`, omit "last seen" rather than fabricate it (or mark REQ-DEV-01's last-seen sub-item as unfulfillable with the current provider contract).
**Warning signs:** any formatted relative time in the device row without a provider field backing it.

### Pitfall 4: Double prefix on referral link
**What goes wrong:** `?ref=3SET-3SET-XXXXXX`.
**Why it happens:** REQ-SET-03 says `?ref=3SET-{code}` while the DB already stores the full code.
**How to avoid:** schema comment says `3SET-XXXXXX` (`prisma/schema.prisma:56-62`: `referralCode String? @unique @map("referral_code")`, comment «публичный `referralCode` (`3SET-XXXXXX`, ensured on first use …)»); build `?ref=${referralCode}` and call `ensureReferralCode(userId)` (`lib/referrals.ts:226-245`) for NULL legacy rows.
**Warning signs:** a constructed string containing `3SET-` twice.

### Pitfall 5: Reset Demo misses biometric-scoped storage / touches the server
**What goes wrong:** stale access token survives reset, or the provider key is cleared.
**Why it happens:** `SecureStorage.clearAll()` clears only `_storage` (`secure_storage.dart:52-54`), while `getAccessToken()` reads `_biometricStorage` (`token_store.dart:38-40`); writes go to `_storage.storage` (`token_store.dart:28-33`). Nothing server-side is called today — adding it would break the single-issuer rule.
**How to avoid:** call `TokenStore.clearAll()` (deletes all three keys) **and** `SecureStorage.clearAll()`, clear Drift `app_db`, then invalidate auth; never call ARTEMIDA. Verify on-device that a biometric prompt does not resurrect a session.
**Warning signs:** a reset that leaves `hasTokens() == true`, or any DELETE/clear reaching the backend.

### Pitfall 6: Auto-connect racing biometric gate / FSM
**What goes wrong:** tunnel starts before unlock, or a second connection starts while D-15 reconnect is in flight.
**Why it happens:** `main.dart:24-40` wires app-level listeners; FSM generation token guards only its own attempts (`connection_notifier.dart:71-74`), not a launch-time call.
**How to avoid:** gate auto-connect on authenticated state + active key + biometric resume; call `connectionNotifier.connect(tab, auto: true)` once after restore; let the existing `onConnectivityChanged` handle later network changes (`connection_notifier.dart:467-479`).
**Warning signs:** two `connecting` transitions in logs, or a tunnel before `/auth` redirect resolves.

### Pitfall 7: Accessibility regressions in the existing dark theme
**What goes wrong:** large system text is clamped and small secondary text fails contrast.
**Why it happens:** `main.dart:55` overrides `textScaler` with `.clamp(0.8, 1.3)`; `AppTheme.dim = Color(0xFF6f8272)` (`theme.dart:57-58`) is used by `bodySmall`/`titleSmall`/`labelSmall` (`theme.dart:317-358`).
**How to avoid:** raise/remove the upper clamp for real dynamic type; compute WCAG ratios (this session: `dim` on `surface #131c16` = **4.24:1**, on `surface2 #182419` = **3.92:1**, below AA 4.5:1) and darken dim text or restrict it to large/decorative copy; add `Semantics` to custom controls.
**Warning signs:** a 200% system font setting rendering at 130%; text below 4.5:1 on cards.

### Pitfall 8: Android/iOS notification setup omitted
**What goes wrong:** reminders never fire when the app is closed.
**Why it happens:** since FLN v16 the plugin declares only bare-minimum permissions; scheduling requires manifest receivers and Android 14 exact-alarm permission; iOS needs `UNUserNotificationCenter.delegate`.
**How to avoid:** follow official setup (`pub.dev/packages/flutter_local_notifications`): add `ScheduledNotificationReceiver`/`BootReceiver`, `POST_NOTIFICATIONS`/`VIBRATE`, `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM`, iOS AppDelegate delegate; use `zonedSchedule` with `tz.TZDateTime.from(parsedUtcExpiry.subtract(...), tz.local)`.
**Warning signs:** notifications only while foreground; missing boot receiver after reboot.

## Code Examples

Verified patterns from official sources / this repo:

### Local expiry scheduling (three absolute instants from server `expiresAt`)
```dart
// Source: https://pub.dev/packages/flutter_local_notifications (zonedSchedule section)
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
    onDidReceiveNotificationResponse: (response) {
      // payload == 'shop' → go('/shop'); never treat a tap as payment proof
    },
  );
  for (final days in const <int>[7, 3, 1]) {
    final when = tz.TZDateTime.from(
      serverExpiryUtc.toLocal().subtract(Duration(days: days)),
      tz.local,
    );
    if (when.isBefore(tz.TZDateTime.now(tz.local))) continue; // no past schedules
    await plugin.zonedSchedule(
      days, // stable id per reminder
      title: 'Подписка истекает',
      body: 'Продлите подписку, чтобы не потерять доступ',
      scheduledDate: when,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails('expiry', 'Напоминания', channelDescription: 'Срок подписки'),
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      payload: 'shop',
    );
  }
}
```
`IOSInitializationSettings` exists from FLN 17.3.0+ `[CITED: pub.dev FLN README]`; latest 23.0.4 requires the `settings:` named parameter and `notificationDetails:` named parameter in `zonedSchedule` (see the 23.x example on pub.dev). Verify exact signatures with `flutter analyze` after install (human-verify gate).

### Device row name/label fallback (no fake last-seen)
```dart
// Source: lib/artemida.ts:298-301 + lib/keys-service.ts:763-770
String deviceTitle(Device device) => device.label?.trim().isNotEmpty == true
    ? device.label!
    : (device.name?.trim().isNotEmpty == true ? device.name! : 'Устройство');
// Render token only as an opaque id (truncated); NEVER as a clickable subscription link.
```

### Reset Demo (local-only)
```dart
// Source: mobile/lib/core/storage/token_store.dart:67-73, secure_storage.dart:52-54, app_database.dart:19-26
await ref.read(tokenStoreProvider).clearAll();
await ref.read(secureStorageProvider).clearAll();
await ref.read(appDatabaseProvider).deleteAllTables(); // regenerate .g.dart if helpers added
ref.invalidate(authNotifierProvider);
context.go('/auth');
// No ARTEMIDA call, no key deletion, no server session revocation.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prototype `state.settings.kill` toggle | Always-on status row (D-01..D-04) | 2026-11-28 (phase 22 context) | No toggle, no native rules; REQ-SET-01 rewritten |
| Prototype `POST /devices` / splice-back undo | Subscription-link handoff + deferred DELETE | Locked ARTEMIDA contract 2026-10-03 | No fake restore/add; paid upgrade for capacity |
| Prototype manual Wi-Fi/LTE chip | Read-only `connectivity_plus` chip + real invalidation | Phase 19 D-11 / 20 D-15 | No simulation; re-ping on real changes |
| `schedule()` (deprecated) | `zonedSchedule()` with `TZDateTime` | FLN 2.0+ | DST-safe absolute scheduling |
| `next-pwa` / hand-written SW | `@serwist/next` (unrelated to this phase) | 2026 stack research | No change in phase 22 |

**Deprecated/outdated:**
- `flutter_local_notifications.schedule()` — deprecated since v2.0; use `zonedSchedule` `[CITED: pub.dev README]`.
- Prototype auth at `prototype-mobile-client.html:286-300` (email/password) — mobile uses deep-link nonce + JWT; no Login Widget hash on this path.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Provider has no device-restore or free add-device endpoint (not present in the locked contract or repo) | Q1/Q2, Pitfalls | Planner builds fake restore/add; next GET disproves UI. Confirm with provider docs/owner before committing UX copy |
| A2 | `TZDateTime.from(utcInstant.toLocal(), tz.local)` is the correct DST-safe conversion in timezone `^0.11` | Code Examples | Compile/runtime mismatch; caught by `flutter analyze` + on-device check |
| A3 | Device "last seen" is unavailable (provider `Device` has only `token,name`) | Q1, Pitfall 3 | REQ-DEV-01 acceptance criterion cannot be fully met; needs owner decision |
| A4 | Auto-connect should run after auth restore + biometric gate, not at `main()` start | Q7 | Duplicate connect or tunnel before unlock; gate with integration test |
| A5 | `firebase_messaging` token registration is blocked for this phase (no credentials/route/env) | Q4 | If owner supplies credentials, FCM becomes a separate scoped task, not a silent stub |
| A6 | `DeviceLabel` row can supply a friendly name via `listDevicesWithLabels` | Pattern 1, Pitfall 3 | If labels are PWA-only, mobile name falls back to provider `name`/«Устройство» |

## Open Questions (RESOLVED or BLOCKED)

### Q1 — `/api/mobile/devices`: operations, safe token, and "Add Current Device" — **RESOLVED (contract), BLOCKED (paid add UX needs owner decision)**

**Evidence:**
- Provider surface actually documented: `GET /keys/{id}/devices` → `{items[],used,limit}` `[VERIFIED: docs/artemida-v1-contract.md:27,57,127]`; observed raw body `{"items": [], "used": 0, "limit": 2}` `[VERIFIED: docs/artemida-v1-contract.json, devices.observed]`.
- Client methods: `getDevices: (id) => request("GET", ...), deleteDevice: (id, token) => request("DELETE", ..., encodeURIComponent(token)), clearDevices: (id) => request("POST", .../clear)` `[VERIFIED: lib/artemida.ts:684-693]`.
- Device identity client can safely send: opaque `token` (`asString(r.token) ?? asString(r.id) ?? ""`) `[VERIFIED: lib/artemida.ts:433-446]`; ownership-joined delete already exists (`removeDeviceByUserId`, `keys-service.ts:408-424`).
- `upgradeKey(addDevices)` **is a paid prorated charge**: contract says `{addDevices:int}` ONLY, `{days,devices}` → `400 unsupported_fields`, 402 message «Нужно 60 ₽» for +1 device on a 30-day key, formula `selectedDeviceTierPrice(volume.devices + addDevices) × addDevices × max(1, remainingDays/30)` `[VERIFIED: docs/artemida-v1-contract.md:96-115]`; client already posts only `{addDevices}` `[VERIFIED: lib/artemida.ts:716-722]`; mobile paid intent supports `{kind:'upgrade',addDevices}` `[VERIFIED: app/api/mobile/payments/create/route.ts:47,65-66,143-158]`.
- "Add Current Device" therefore means: user imports the subscription link on the new device (provider registers it on connect); capacity growth is a **paid upgrade**, not a free POST. No `POST /devices` exists in the contract or repo `[VERIFIED: docs/artemida-v1-contract.md:45-57; grep over lib/ app/ found only payment-order addDevices]`.

**Recommendation:** GET/DELETE via existing services; UI button = open/copy subscription link with honest copy; separate clearly-labelled paid "увеличить лимит" path via existing `/payments/create`. Planner should add `checkpoint:human-verify` for the REQ-DEV-03 reinterpretation.

### Q2 — Undo «Вернуть» 5s — **RESOLVED (no provider restore; deferred delete)**

No restore/re-add provider operation is documented; the prototype's undo is pure `localStorage` splice `[VERIFIED: .planning/seeds/prototype-mobile-client.html:890-891]`. Honest UX: delay the real DELETE 5 s and cancel the timer on «Вернуть»; during the window mark the row pending. Also must handle refresh mid-window (don't show the row as fully removed until DELETE succeeds) and app kill (safe: nothing deleted). See Pattern 2.

### Q3 — Network Chip vs phase 19 D-11 — **RESOLVED (read-only signal, existing invalidation)**

The app can observe only real `connectivity_plus` results; the chip already maps them to `"Нет сети"/"Wi-Fi"/"LTE"/"Ethernet"/"Онлайн"` `[VERIFIED: mobile/lib/features/servers/server_pool_screen.dart:41-55]` and is documented read-only `[VERIFIED: mobile/lib/features/servers/widgets/pool_toolbar.dart:6-9]`. Cache invalidation already runs in `networkPingInvalidationProvider` (cancel in-flight, `clearPingCacheAndLastGood`, invalidate + full re-ping) `[VERIFIED: mobile/lib/features/servers/providers.dart:489-520]`; manual re-ping is `ConnectController.refresh()` `[VERIFIED: providers.dart:450-486]`. Toast copy «Сеть изменена — кеш пинга сброшен» is only truthful for a **real** network change; a manual refresh should keep «Пинг обновлён». No simulated toggle.

### Q4 — Push: local notifications + FCM — **PARTIALLY RESOLVED (local) / BLOCKED (FCM)**

- Local: `flutter_local_notifications` 23.0.4 is current on pub.dev, SDK `^3.12`/Flutter `>=3.44` compatible with local 3.14/3.50.1 `[CITED: pub.dev API]`; official docs require `zonedSchedule`, direct `timezone` dep, Android receivers/permissions, iOS delegate `[CITED: pub.dev README]`. Install behind human-verify (4-day-old release, no pub legitimacy seam).
- FCM: official Firebase setup requires `firebase_core` + `firebase_messaging`, `flutterfire configure` → `firebase_options.dart`, APNs auth key + Push Notifications capability, Google-Play emulator/API 24+ `[CITED: https://firebase.google.com/docs/flutter/setup]`. This repo has **no** `google-services.json`, `GoogleService-Info.plist`, `firebase_options.dart`, `FIREBASE_*` env keys, or backend token-registration route `[VERIFIED: find/grep over repo + .env key listing this session]`. No Firebase provider exists server-side (AGENTS.md explicitly avoids Firebase). **BLOCKED** — planner must not create a fake token route or store a fabricated token; escalate to owner or descope REQ-NOTIF-02 with an explicit UAT exclusion.

### Q5 — Profile data source — **RESOLVED (DB row via /subscription)**

Mobile JWT carries only `{uid, tid, typ}` `[VERIFIED: lib/mobile-auth.ts:22; mobile/lib/utils/jwt_utils.dart:50-70]`; `/subscription` already returns `user{id,telegramId,email}` `[VERIFIED: app/api/mobile/subscription/route.ts:20-30,57-61]`; the Dart model has exactly those fields `[VERIFIED: mobile/lib/features/subscription/models/subscription.dart:9-20]`. Real DB fields exist: `firstName`, `lastName`, `username`, `referralCode` `[VERIFIED: prisma/schema.prisma:49-51,56-62 — quoted in Pitfall 4]`. Recommendation: extend the `/subscription` user block (same already-fetched row, one `select`) with nullable `firstName/lastName/username/referralCode`; display `firstName ?? username ?? email-local-part ?? «Пользователь»`; method pill = `telegramId != null ? 'telegram' : 'email'`. No invented email, no Telegram Login Widget in the mobile nonce flow.

### Q6 — Reset Demo boundaries — **RESOLVED (local-only)**

Clear `TokenStore.clearAll()` + `SecureStorage.clearAll()` + Drift `app_db` tables; then `ref.invalidate(authNotifierProvider)` and `go('/auth')`. Do **not** revoke server sessions, delete keys, or call `clearDevices` — that would violate the single-issuer rule and destroy paid entitlements. Note the biometric-storage nuance in Pitfall 5.

### Q7 — Auto-Connect vs FSM D-15 / no bottom nav — **RESOLVED (new local setting + launch listener)**

No auto-connect state exists today; `ConnectionNotifier.build()` starts at `idle` `[VERIFIED: mobile/lib/core/vpn/connection_notifier.dart:88-99]`; network-change reconnect is already debounced and only while `connected` `[VERIFIED: connection_notifier.dart:463-479]`. Recommendation: persist `autoConnect` + `wasConnected` in a new Drift table (schema v2), watch a launch listener in `main.dart` alongside `paymentResumeListenerProvider` (`main.dart:37-40`), fire once after auth restore + active key + biometric gate, and call the existing `connect(tab, auto: true)`. No FSM or native change, no bottom nav.

### Q8 — Accessibility with `AppTheme.dark` + dynamic type — **RESOLVED with a required fix**

Existing clamp `.clamp(0.8, 1.3)` at `main.dart:55` suppresses platform dynamic type above 130%; `AppTheme.dark` is app-wide (`main.dart:47-49`, `theme.dart:123-421`). Computed WCAG ratios show `dim` below AA on cards (Pitfall 7). Recommendation: remove/raise the upper clamp, darken `dim` or limit it to non-essential large text, add `Semantics` labels to icon-only controls (existing precedent: `main_header.dart:161-176`, segmented tabs in phase 19), mark confetti/ring painters `excludeFromSemantics`, and widget-test at 200% text scale.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Flutter SDK | all mobile tasks | ✓ | 3.50.1 stable (rev `ae9b586f34`) | — |
| Dart SDK | all mobile tasks | ✓ | 3.14.0 stable | — |
| `flutter_local_notifications` | REQ-NOTIF-01 | ✗ (not in `pubspec.yaml`) | 23.0.4 available on pub.dev | T-7/3/1d reminders cannot ship without install; human-verify gate |
| `timezone` (direct) | REQ-NOTIF-01 | transitive only | `^0.11.0` | add alongside FLN |
| Firebase project / credentials / `firebase_options.dart` | REQ-NOTIF-02 | ✗ | — | local-only reminders; owner decision to descope FCM |
| APNs auth key / Push Notifications capability | iOS FCM | ✗ (STATE.md blocker) | — | external |
| Android SDK/JDK | device on-device verification | ✗ (known phase 19/20 blocker) | — | iOS build + `flutter analyze` + unit/widget tests; CI artifacts |
| Next.js local docs | backend route patterns | ✓ | installed | read `15-route-handlers.md` (done) |
| Context7 / `ctx7` CLI | authoritative docs seam | ✗ | — | pub.dev API + official docs via webfetch/websearch (seam confidence LOW) |

**Missing dependencies with no fallback:** Firebase credentials + backend FCM token route (REQ-NOTIF-02); provider "restore"/free "add" operations (REQ-DEV-02 literal wording, REQ-DEV-03 literal wording).
**Missing dependencies with fallback:** `flutter_local_notifications`/`timezone` (install after human gate).

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Flutter `flutter_test` + `mocktail` (unit/widget), `integration_test` for auth flow |
| Config file | `mobile/pubspec.yaml` (no separate config); `analysis_options.yaml` if present |
| Quick run command | `cd mobile && flutter test test/unit test/widget` |
| Full suite command | `cd mobile && flutter test && flutter analyze` |
| Backend | `npm test` (`vitest run tests/unit`), `npx tsc --noEmit`, `npx prisma validate` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-BE-06 / DEV-01 | GET devices returns owned, labelled devices; non-owned key → no oracle | unit (backend) | `npx vitest run tests/unit/mobile-devices-route.test.ts -x` | ❌ Wave 0 |
| REQ-BE-06 / DEV-02 | DELETE token deleted after ownership join; malformed token rejected | unit (backend) | `npx vitest run tests/unit/mobile-devices-route.test.ts -x` | ❌ Wave 0 |
| REQ-DEV-02 | Undo cancels DELETE within 5 s; no provider call on undo | unit (Dart, fake async) | `flutter test test/unit/features/devices/deferred_delete_test.dart` | ❌ Wave 0 |
| REQ-DEV-03/04, SUB-04 | Limit gate reads server `deviceLimit`, paid upgrade intent carries only `addDevices` | unit (Dart + backend) | `flutter test test/unit/features/devices/device_limit_test.dart`; `npx vitest run tests/unit/mobile-payments-route.test.ts -x` | ❌ Wave 0 (Dart) / ✅ backend |
| REQ-SET-01 | Kill switch row is read-only; no ` Switch` in tree | widget | `flutter test test/widget/features/profile/profile_sheet_test.dart` | ❌ Wave 0 |
| REQ-SET-02 | Auto-connect setting persists; one connect on launch; no duplicate on network change | unit (Riverpod + Drift memory) | `flutter test test/unit/core/settings/auto_connect_test.dart` | ❌ Wave 0 |
| REQ-SET-03 | Referral link uses real code once, clipboard + toast | unit/widget | `flutter test test/widget/features/profile/referral_row_test.dart` | ❌ Wave 0 |
| REQ-SET-04 | Reset clears tokens + Drift; no backend call | unit | `flutter test test/unit/core/settings/reset_demo_test.dart` | ❌ Wave 0 |
| REQ-SET-05 | Chip shows real label; no toggle; no fake invalidation | widget | `flutter test test/widget/features/servers/pool_toolbar_test.dart` | ❌ Wave 0 |
| REQ-NOTIF-01 | Three reminders scheduled from server expiry; past instants skipped | unit (fake plugin) | `flutter test test/unit/core/notifications/expiry_scheduler_test.dart` | ❌ Wave 0 |
| REQ-NOTIF-02 | FCM token registration | manual/external | blocked — no automated path until credentials exist | ❌ blocked |
| REQ-SET-12 / accessibility | Semantics labels + 200% text scale + contrast tokens | widget | `flutter test test/widget/app/accessibility_test.dart` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `flutter test test/unit <changed area>` + `flutter analyze` (or `npx vitest run tests/unit` for backend)
- **Per wave merge:** `cd mobile && flutter test && flutter analyze`; `npm test && npx tsc --noEmit && npx prisma validate`
- **Phase gate:** full suites green before `/gsd-verify-work`; FCM UAT marked blocked with owner decision recorded

### Wave 0 Gaps
- [ ] `tests/unit/mobile-devices-route.test.ts` — GET/DELETE envelope + ownership + zod token
- [ ] `mobile/test/unit/features/devices/deferred_delete_test.dart` — 5 s undo with fake async
- [ ] `mobile/test/unit/core/settings/auto_connect_test.dart` + `reset_demo_test.dart`
- [ ] `mobile/test/widget/features/profile/profile_sheet_test.dart` — read-only kill switch + Semantics
- [ ] `mobile/test/unit/core/notifications/expiry_scheduler_test.dart` — fake FLN platform
- [ ] Framework install: `flutter pub add flutter_local_notifications:23.0.4 timezone` — human-verify gate first
- [ ] New Drift table migration (`app_database.dart` schemaVersion 2) + regenerated `.g.dart`

## Security Domain

> `security_enforcement` is enabled, ASVS level 1 (`config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `verifyAccessToken` JWT on both device routes; 401 on missing/invalid |
| V3 Session Management | yes | Reset Demo clears local tokens only; no server revocation in this phase |
| V4 Access Control | yes | Ownership join by `claims.userId` → `keyCache` before any provider call; no client `keyId`; token zod-validated |
| V5 Input Validation | yes | zod on path token (min1/max300), body; Dart parsing of `expiresAt` with `DateTime.tryParse` |
| V6 Cryptography | no new code | Existing secure storage (Keystore/Keychain); no hand-rolled crypto |
| V7 Logging / data hygiene | yes | Only stable codes + `requestId` in logs; never token, link, name, or provider text |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via client-supplied `keyId`/`userId` | Elevation | Derive key from JWT claims + `listKeysByUserId` + `isKeyConnectable`; non-owned → same `no_active_key`/404 as missing |
| Device token as bearer-ish identifier in URL | Information disclosure | Opaque token only, encoded, length-bounded, never logged; no keyId in path |
| Fake "device added" count after failed payment | Tampering | Count comes only from provider `GET /devices`; upgrade executes only from webhook→outbox→worker |
| Local notification payload treated as auth/payment proof | Spoofing | Payload `'shop'` only navigates; no entitlement or payment effect |
| Referral code enumeration | Information disclosure | `ensureReferralCode` on own user only; never expose another user's code |
| Secrets in logs/UI | Information disclosure | Existing pino/`logger` discipline; no device token in toasts |

## Sources

### Primary (HIGH confidence — tool-read, authoritative in-repo)
- `docs/artemida-v1-contract.md:27,45-57,96-115,127` — locked V1 contract, device endpoints, paid upgrade finding #5
- `docs/artemida-v1-contract.json` — verbatim observed devices body (`items: []`, `used: 0`, `limit: 2`)
- `lib/artemida.ts:298-301,433-446,684-693,716-722` — Device shape, normalizer, method implementations
- `lib/keys-service.ts:336-424,758-771` — ownership joins, `removeDeviceByUserId`, `listDevicesWithLabels`
- `app/api/mobile/subscription/route.ts:20-30,50-82` — identity + single active-key predicate
- `app/api/keys/[id]/devices/[token]/route.ts:57-75`, `app/api/keys/[id]/devices/route.ts:37-69` — PWA route patterns
- `app/api/mobile/payments/create/route.ts:47,143-158` — paid upgrade intent
- `prisma/schema.prisma:23-70, DeviceLabel model` — user identity/referral fields, label uniqueness
- `mobile/lib/...` files cited inline (theme, main, router, providers, connection notifier, storage, db, toolbar, sheet stubs)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:29-51` — Next 16 Route Handlers

### Secondary (official docs, seam tier LOW)
- `https://pub.dev/api/packages/flutter_local_notifications` — 23.0.4 metadata, SDK constraints
- `https://pub.dev/api/packages/connectivity_plus` — 7.3.2 metadata
- `https://pub.dev/packages/flutter_local_notifications` — `initialize`, `zonedSchedule`, Android/iOS setup
- `https://firebase.google.com/docs/flutter/setup` — Firebase/FCM prerequisites

### Tertiary (LOW — assumptions needing confirmation)
- A1–A6 in Assumptions Log; prototype behavior in `.planning/seeds/prototype-mobile-client.html` (simulation, not production truth)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — in-repo versions HIGH; new pub packages from official registry but seam returned LOW and no legitimacy check for pub ecosystem
- Architecture: HIGH — all seams read directly this session with file:line evidence
- Pitfalls: HIGH (repo) / LOW (external package APIs) — human-verify gate required
- Open questions: RESOLVED 6, BLOCKED 2 (FCM; literal free add/restore UX pending owner decision)

**Research date:** 2026-11-28
**Valid until:** 2026-12-05 (fast-moving pub versions; re-check pin before install)
