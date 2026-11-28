# API Coverage — ARTEMIDA V1 (Phase 22 device surface)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: the external ARTEMIDA V1 API touched by phase 22 through the Next BFF,
> plus the OS notification and identity seams that share the same trust boundary.
> The Flutter client never calls ARTEMIDA directly; every INTEGRATE row below is
> server-side behind `verifyAccessToken` and the single active-key predicate.

| capability | decision | reason |
|---|---|---|
| `getDevices` — `GET /keys/{id}/devices` | INTEGRATE | Backs `GET /api/mobile/devices`; ownership join via `listDevicesWithLabels(claims.userId, active.id)` |
| `deleteDevice` — `DELETE /keys/{id}/devices/{token}` | INTEGRATE | Backs `DELETE /api/mobile/devices/{token}`; token is opaque, zod-bounded, never a client `keyId` |
| `listDevicesWithLabels` / local `DeviceLabel` | INTEGRATE | Real friendly name via `label ?? name ?? «Устройство»`; no invented `lastSeen` |
| provider error envelope (401/402/409/429/502/503 + `Retry-After`) | INTEGRATE | Existing `ArtemidaError.code` mapper; HTTP 200 stable codes, no provider text in body or logs |
| `getSubscription` identity block (`firstName`, `username`, `referralCode`) | INTEGRATE | Extend the already-fetched row in `app/api/mobile/subscription/route.ts`; one `select`, no new provider call |
| `ensureReferralCode(userId)` | INTEGRATE | Own user only; the stored code already carries the `3SET-` prefix, so it is copied once without re-prefixing |
| local expiry reminders (`flutter_local_notifications` + direct `timezone`) | INTEGRATE | OS scheduler, not a remote service; `zonedSchedule` from server `expiresAt`; install behind the blocking-human package gate (D-09) |
| `clearDevices` — `POST /keys/{id}/devices/clear` | OPT-OUT | Destructive bulk provider clear would erase paid entitlements; phase 22 Reset Demo is local-only secure storage + Drift (D-06, REQ-SET-04) |
| `addDevice` / `restoreDevice` | OPT-OUT | No such operation exists in the locked ARTEMIDA V1 contract; honest subscription-link handoff and a 5-second deferred DELETE replace the fake add/restore (D-05, D-06) |
| `upgradeKey(addDevices)` | OPT-OUT | Capacity growth is already paid through phase 21 `/payments/create {kind:'upgrade',addDevices}` → webhook → outbox → worker; no new client-callable provider call and no free add (D-05, single issuer) |
| FCM token registration | OPT-OUT | No Firebase project, credentials or backend route exists; external blocker — REQ-NOTIF-02 deferred, local reminders ship without it (D-08) |
| `getKeyWithLinks` / `/pricing` as a device-limit source | OPT-OUT | `GET /subscription` already exposes `deviceLimit` from the owned key; no second source of truth |

## Seal-time notes

- `REQ-NOTIF-02` is accounted for as deferred (D-08), not silently dropped: the
  reason is recorded in `22-04-PLAN.md` `must_haves`, the threat register, and the
  manual-only verification table of `22-VALIDATION.md`.
- The "no free add" and "no fake restore" opt-outs are locked user decisions
  (D-05/D-06), not scope reductions; the phase delivers the honest handoff and
  deferred-delete semantics in full.
