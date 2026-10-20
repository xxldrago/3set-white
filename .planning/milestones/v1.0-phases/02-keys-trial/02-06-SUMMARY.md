---
phase: 02-keys-trial
plan: '06'
subsystem: api
tags: [artemida, devices, bff, rsc, destructive-confirm, i18n, vitest, next, idor]

# Dependency graph
requires:
  - phase: 02-keys-trial/02-01
    provides: docs/artemida-v1-contract.md — GET /keys/{id}/devices shape explicitly UNKNOWN (0-key probe)
  - phase: 02-keys-trial/02-02
    provides: lib/artemida.ts (getDevices/deleteDevice/clearDevices, tolerant `{token,name}` normalizer accepting token|id), lib/session.ts (requireSession), BFF pattern
  - phase: 02-keys-trial/02-03
    provides: lib/keys-service.ts shared path, keys_cache ownership join
  - phase: 02-keys-trial/02-05
    provides: getKeyForUser ownership-joined detail read, app/keys/[id]/page.tsx shell, key.linkUnavailable/linkError fallback pattern
provides:
  - lib/keys-service.ts — listDevices/removeDevice/clearDevices (ownership-joined, no provider call for a non-owned key)
  - app/api/keys/[id]/devices/route.ts — session-gated, zod-validated GET device list BFF
  - app/api/keys/[id]/devices/[token]/route.ts — session-gated DELETE one device
  - app/api/keys/[id]/devices/clear/route.ts — session-gated POST clear all devices
  - components/ConfirmPanel.tsx — inline destructive confirmation (D-32), focus-trapped, no native dialog
  - app/keys/[id]/page.tsx — «Устройства» section with truncate/title and RU empty fallback
  - tests/unit/devices-route.test.ts — session / validation / ownership vectors (12)
affects: [02-verification, 03-payments]

# Actuals (#2632) — chars/4 over the realized non-lockfile diff (30622 patch chars / 4).
actuals:
  tokens: 7656
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Device mutations are ownership-joined on (userId, keyId) BEFORE any provider call: non-owned key → null/false → 404, never a cross-user mutation (T-02-21)"
    - "Unknown provider shape stays tolerant: unaddressable device entries are dropped, and absence/failure degrades to the RU devices.empty fallback — never a fabricated row (02-01 KEY CONTRACT)"
    - "Irreversible device actions use an inline in-row confirm panel (D-32): second explicit tap required, Escape/Cancel are no-ops, focus trapped, no window.confirm/<dialog>/alert"
    - "Client mutation island (ConfirmPanel) fetches the session-gated BFF and calls router.refresh() so the async RSC re-reads the device list after a mutation"

key-files:
  created:
    - app/api/keys/[id]/devices/route.ts
    - app/api/keys/[id]/devices/[token]/route.ts
    - app/api/keys/[id]/devices/clear/route.ts
    - components/ConfirmPanel.tsx
    - tests/unit/devices-route.test.ts
  modified:
    - lib/keys-service.ts
    - app/keys/[id]/page.tsx
    - lib/i18n/messages/ru.ts

key-decisions:
  - "listDevices returns null and removeDevice/clearDevices return false for a non-owned key, so every device route answers the same 404 as a missing key (no IDOR oracle, T-02-21)"
  - "listDevices filters out entries with an empty token: with the provider shape UNKNOWN, an unaddressable device is omitted rather than rendered with a delete control that would target an empty token"
  - "The page treats a device-fetch failure as the devices.empty RU fallback (logged as devices_unavailable) instead of throwing — matches the 02-01 KEY CONTRACT to degrade cleanly rather than fabricate"
  - "One ConfirmPanel component drives both delete-one and clear-all via a `kind` prop; the second tap is the only path that issues the fetch, and success calls router.refresh()"
  - "ConfirmPanel was created in Task 1 (as the client mutation island the task-1 UI requires) and hardened in Task 2 with the confirmation gate, Escape/focus-trap and mapped error keys — it is in the plan's frontmatter files_modified"

patterns-established:
  - "Destructive UI contract: trigger opens an inline panel; cancel/Escape send no request; only the red second tap mutates"
  - "Device route error mapping mirrors the existing BFF pattern (ArtemidaError → status, logger.warn with {route, code, requestId}, generic 500 otherwise)"

requirements-completed: [CAB-03]

coverage:
  - id: D1
    description: "GET/DELETE/POST device routes are session-gated, zod-validate id/token, and ownership-join before any provider call; a non-owned key cannot mutate the provider (404/no-op)"
    requirement: CAB-03
    verification:
      - kind: unit
        ref: "tests/unit/devices-route.test.ts (12 vectors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Key-detail «Устройства» section lists devices with truncate + title, hides clear-all when empty, and shows the RU devices.empty fallback when the list is absent"
    requirement: CAB-03
    verification:
      - kind: other
        ref: "npm run build → /keys/[id] dynamic (ƒ), compiled successfully"
        status: pass
    human_judgment: true
    rationale: "Visual contract (long-text truncation backstop, mobile row layout) needs a browser pass; the plan's UI-SPEC marks device names as a held-out visual test."
  - id: D3
    description: "Delete-one and clear-all require an explicit second tap inside an inline panel; Escape/Cancel send no request; no window.confirm/native dialog/alert"
    requirement: CAB-03
    verification:
      - kind: other
        ref: "grep ConfirmPanel.tsx: no window.confirm/alert/<dialog> (only the local confirm() second-tap handler)"
        status: pass
    human_judgment: true
    rationale: "The confirmation interaction (focus trap, Escape no-op, second-tap-only mutation) is a UI behaviour; unit tests cover the route half, a browser pass confirms the panel half."
  - id: D4
    description: "i18n dictionary has no missing or unused keys after the device strings (Task 1: 4 keys, Task 2: 9 keys)"
    requirement: null
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-10-02
status: complete
---

# Phase 02 Plan 06: Device Management — List, Delete-One & Reset-All Summary

**Ownership-joined device list/delete/clear BFF routes plus an inline second-tap confirmation panel (D-32), with a tolerant `{token,name}` device normalizer and a RU `devices.empty` fallback when the still-UNKNOWN provider shape yields nothing.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-02T01:45:25Z
- **Completed:** 2026-10-02T01:49:35Z
- **Tasks:** 2 of 2
- **Files created/modified:** 8 (created 5, modified 3)

## Accomplishments

- **Server half (CAB-03 / T-02-21):** `lib/keys-service.ts` gained `listDevices` / `removeDevice` / `clearDevices`, each resolving the owning `keys_cache` row from the session telegram id via `(userId, keyId)` before any provider call. A non-owned key returns `null`/`false` and the routes answer 404 exactly as for a missing key — no cross-user mutation and no reason oracle.
- **Three session-gated BFF routes:** `GET /api/keys/[id]/devices`, `DELETE /api/keys/[id]/devices/[token]` and `POST /api/keys/[id]/devices/clear`. All are `force-dynamic`, `requireSession()` first, zod-validate every path segment (T-02-23), await async `params`, and map `ArtemidaError` → status with `logger.warn({route, code, requestId})` (provider text never surfaced).
- **Tolerant unknown shape (02-01 KEY CONTRACT):** the client normalizer accepts both `token` and `id` (ASSUMP-A5); `listDevices` drops entries with an empty token so the UI never renders a delete control targeting an empty token. A fetch failure or an unaddressable payload degrades to the RU `devices.empty` fallback (logged `devices_unavailable`) — no fabricated device row.
- **Inline confirmation (D-32 / T-02-22):** `components/ConfirmPanel.tsx` opens an in-row panel with title + body + `common.cancel` (secondary `h-11`) and a red-filled `devices.*Confirm`. Escape and Cancel dismiss with NO request; only the explicit second tap fetches the BFF. Focus is trapped between the two buttons while open. There is no `window.confirm`, `<dialog>` or `alert`.
- **Key-detail UI:** `app/keys/[id]/page.tsx` renders a «Устройства» section — one row per device with `truncate` at container width and the full value in `title`, the clear-all control hidden when the list is empty, and `devices.empty` when nothing is connected.
- **Tests:** `tests/unit/devices-route.test.ts` adds 12 vectors (401 without session, 400 invalid id/token, 404 + provider-not-called for a non-owned key, and happy paths) using the real local Postgres and a spied `artemida`. Full unit suite: 11 files / 71 tests green; `npm run build` compiles with all three new routes dynamic (ƒ).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — device list + delete-one + reset-all (server + UI)** - `d347f75` (feat)
2. **Task 2: Inline destructive confirmation (D-32)** - `75c05a1` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified

- `lib/keys-service.ts` — added `listDevices` (null = not owned; filters unaddressable entries), `removeDevice` / `clearDevices` (false = not owned), plus an `ownedKeyRowId` ownership helper.
- `app/api/keys/[id]/devices/route.ts` — session-gated device list BFF (`{ devices }` / 404).
- `app/api/keys/[id]/devices/[token]/route.ts` — session-gated DELETE of one device (`{ ok: true }` / 404).
- `app/api/keys/[id]/devices/clear/route.ts` — session-gated POST clear-all (`{ ok: true }` / 404).
- `components/ConfirmPanel.tsx` — inline second-tap confirmation island; fetch + `router.refresh()`; mapped RU error key on failure.
- `app/keys/[id]/page.tsx` — «Устройства» section (list, truncate/title, empty fallback, clear-all hidden when empty); best-effort device fetch.
- `lib/i18n/messages/ru.ts` — Task 1: `key.devicesTitle`, `devices.{empty,delete,clear}`; Task 2: `devices.{deleteTitle,deleteBody,deleteConfirm,clearTitle,clearBody,clearConfirm,deleteError,clearError}` and `common.cancel`.
- `tests/unit/devices-route.test.ts` — 12 device-route vectors.

## Decisions Made

- **Non-owned = not-found:** returning `null`/`false` from the service (rather than throwing) keeps the routes' 404 identical to a genuinely missing key and makes the ownership check directly unit-assertable.
- **Drop unaddressable devices:** with `GET /keys/{id}/devices` still UNKNOWN, an entry without a token/id cannot be deleted; omitting it avoids a fabricated row with a broken delete control.
- **Fetch failure → empty state:** the page logs the `ArtemidaError` and shows `devices.empty` instead of crashing the detail screen, honouring the KEY CONTRACT's clean-fallback rule.
- **One component, two actions:** `ConfirmPanel` selects its copy/error keys from a `kind` prop so delete-one and clear-all share one confirmed-mutation path.
- **ConfirmPanel created in Task 1, hardened in Task 2:** Task 1's tracer UI needs a browser-only mutation island (the page is an async RSC); `ConfirmPanel.tsx` is in the plan's frontmatter `files_modified`, so it was created there and upgraded with the confirmation gate in Task 2.

## Deviations from Plan

None — plan executed as written. `components/ConfirmPanel.tsx` was introduced in Task 1 (its plan `<files>` lists only the page, but the frontmatter `files_modified` names it) as the mutation island the task-1 UI requires; Task 2 then delivered the confirmation behaviour the plan assigns to it. No new packages (T-02-SC).

## Issues Encountered

None. The full unit suite and production build are green with the local Homebrew Postgres (`setwhite`); the build was given throwaway env values (same hermetic approach as prior waves).

## Known Stubs

None. The `devices.empty` state is the intentional RU fallback for the UNKNOWN provider shape / empty list, not a stub — no hardcoded-empty data flows into a successful connected-device render.

## Threat Flags

None — the new surface is exactly the plan's threat model. Mitigations implemented: T-02-21 (ownership join before any provider call; non-owned key → 404; tests assert no provider mutation), T-02-22 (inline `ConfirmPanel`, no request until the explicit second tap, Escape/Cancel no-op, no native dialog), T-02-23 (zod-validated `id`/`token` + awaited async params), T-02-SC (no new packages).

## User Setup Required

None for steady state. To reproduce the verification:

```bash
export DATABASE_URL="postgresql://<local-user>@127.0.0.1:5432/setwhite"
npx tsc --noEmit
npx vitest run tests/unit
BOT_TOKEN=... BOT_TEST_TOKEN=... SESSION_SECRET=... WEBHOOK_SECRET=... npm run build
```

## Next Phase Readiness

- Phase 2's requirement set (TRIAL-01/02/03, CAB-01/03/04) is now fully covered by DB-backed route + service tests; the whole `npx vitest run tests/unit` suite is green.
- ⚠️ `GET /keys/{id}/devices`, `/keys/{id}` and `/subscription-links` remain `UNKNOWN` (0-key probe): the first phase holding a key should re-probe and tighten the tolerant normalizers (tracked in `.planning/WINDOWS.md`).
- The `Dispose`-style device routes reuse the same ownership-join shape as `getKeyForUser`/`getSubscriptionForUser`; no parallel Prisma/fetch path was introduced.

---

*Phase: 02-keys-trial*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: lib/keys-service.ts (listDevices/removeDevice/clearDevices)
- FOUND: app/api/keys/[id]/devices/route.ts
- FOUND: app/api/keys/[id]/devices/[token]/route.ts
- FOUND: app/api/keys/[id]/devices/clear/route.ts
- FOUND: components/ConfirmPanel.tsx
- FOUND: tests/unit/devices-route.test.ts
- FOUND: commit d347f75 (Task 1)
- FOUND: commit 75c05a1 (Task 2)
- VERIFY: `npx tsc --noEmit` exits 0
- VERIFY: `npx vitest run tests/unit` → 11 files / 71 tests passed (with local Postgres)
- VERIFY: `npx vitest run tests/unit/devices-route.test.ts tests/unit/i18n.test.ts` → 17 passed
- VERIFY: `npm run build` → Compiled successfully; `/api/keys/[id]/devices`, `/api/keys/[id]/devices/[token]`, `/api/keys/[id]/devices/clear` all dynamic (ƒ)
- VERIFY: no `window.confirm` / `alert` / `<dialog>` in ConfirmPanel.tsx
- VERIFY: no STATE.md / ROADMAP.md modification by this executor
