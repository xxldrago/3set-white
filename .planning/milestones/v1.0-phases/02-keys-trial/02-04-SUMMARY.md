---
phase: 02-keys-trial
plan: '04'
subsystem: api
tags: [artemida, keys, cache-first, after, rsc, bff, telegraf, i18n, prisma, vitest, next]

# Dependency graph
requires:
  - phase: 02-keys-trial/02-01
    provides: docs/artemida-v1-contract.{md,json} — locked GET /keys envelope ({data.items}) + error envelopes
  - phase: 02-keys-trial/02-02
    provides: lib/artemida.ts (listKeys/NormalizedKey), lib/session.ts (requireSession), BFF/i18n patterns
  - phase: 02-keys-trial/02-03
    provides: lib/keys-service.ts (shared write path), expanded keys_cache mirror, trial key persisted
provides:
  - lib/keys-service.ts — listKeys/revalidateKeys + RenderedKey/statusKind (derived status), statusLabel/formatKeyDate
  - app/api/keys/route.ts — session-gated cache-first BFF read with after() revalidation
  - components/SubscriptionCard.tsx — presentational key card (status badge + amber TRIAL chip)
  - app/page.tsx — «Мои подписки» home section with after() revalidation, skeleton/empty/error states
  - lib/bot.ts — «Мои ключи» branch over the same read path
affects: [02-05, 02-06]

# Actuals (#2632) — chars/4 over the realized diff (30754 patch chars, two task commits).
actuals:
  tokens: 7689
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []                # no new packages (plan forbids new installs; T-02-SC mitigated)
  patterns:
    - "Cache-first read: serve keys_cache instantly, schedule ARTEMIDA GET /keys via after() post-response (D-29)"
    - "Status truth derives from expiresAt vs now, never the stored status string; status.unknown fallback (Pitfall 6)"
    - "One shared read path (listKeys/revalidateKeys) for cabinet BFF, RSC page, and bot — no parallel Prisma/fetch"
    - "after() works in a Suspense-streamed Server Component (validated by next build), so the cabinet page refreshes too"
    - "No-interpolation i18n: the badge switch calls five literal t(\"status.…\") keys so the completeness scanner registers them"

key-files:
  created:
    - app/api/keys/route.ts
    - components/SubscriptionCard.tsx
    - tests/unit/keys-service.test.ts
  modified:
    - lib/keys-service.ts
    - app/page.tsx
    - lib/i18n/messages/ru.ts
    - lib/bot.ts
    - app/globals.css

key-decisions:
  - "statusKind is derived from expiresAt vs now (active/expiring/expired) with status.unknown for absent data; the stored status string is only consulted for the non-time pending/expired lifecycle, never to claim validity"
  - "revalidateKeys consumes artemida.listKeys().items (the tracked client returns KeyList, not a bare array) and upserts by unique (userId, keyId); removals are never deleted (conservative reconcile)"
  - "The cabinet page itself schedules after(() => revalidateKeys(telegramId)) so D-29 fires on cabinet open, not only when /api/keys is hit"
  - "Background revalidation errors are caught and logger.warn'd (code+requestId only) so they can never surface to the response or render (T-02-16)"
  - "The home page now verifies the real session (requireSession) rather than cookie presence, because listKeys needs the trusted telegram id"
  - "statusLabel is a single shared switch in lib/keys-service.ts used by both SubscriptionCard and the bot; the five literal t(\"status.…\") calls remain scanner-visible"
  - "Bot «Мои ключи» replies from cache then refreshes fire-and-forget, caps the message at 4000 chars, and defers the sub-link detail to 02-05"

patterns-established:
  - "Cache-first subscription read shared by every channel: listKeys (instant) + revalidateKeys (background, best-effort)"
  - "Display status is never trusted from the mirror; it is recomputed against expiry on every read (Pitfall 6 / T-02-14)"

requirements-completed: [CAB-01]

coverage:
  - id: D1
    description: "listKeys derives statusKind from expiresAt (never the stored status) and orders active → expiring → expired → pending, preserving the isTrial badge flag"
    requirement: CAB-01
    verification:
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#derives statusKind from expiresAt, never the stored status string"
        status: pass
    human_judgment: false
  - id: D2
    description: "revalidateKeys upserts provider keys by the unique (userId, keyId) pair without duplicating or deleting rows"
    requirement: CAB-01
    verification:
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#revalidateKeys upserts by unique (userId, keyId) without duplicating"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/keys is session-gated, returns cached rows instantly, and schedules after() revalidation scoped to the session user"
    requirement: CAB-01
    verification: []
    human_judgment: true
    rationale: "No dedicated route unit-vector; the route is a thin wrapper over the unit-tested listKeys plus the requireSession/ArtemidaError pattern proven by pricing-route.test.ts. The after() scheduling needs a request-scope integration run."
  - id: D4
    description: "Cabinet «Мои подписки» renders instantly from keys_cache with the trial badge, empty state, count header, mapped error state, and page-flow scrolling"
    requirement: CAB-01
    verification: []
    human_judgment: true
    rationale: "Visual/interaction contract (UI-SPEC): instant cache-first feel, skeleton fallback, mobile page-flow scroll, badge colours and error copy require a device/browser review."
  - id: D5
    description: "Bot «Мои ключи» lists subscriptions via the shared read path and the Geist font renders on cabinet/login/guides"
    requirement: CAB-01
    verification: []
    human_judgment: true
    rationale: "Telegraf handlers are not unit-tested (importing lib/bot.ts launches polling) and typography is a visual check; the production build is green but the bot flow and font need a manual Telegram/browser pass."
  - id: D6
    description: "i18n dictionary has no missing or unused keys after the subscription/status/bot strings and removal of the orphaned home.keys* keys"
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

# Phase 02 Plan 04: Cache-First «Мои подписки» Summary

**Instant cache-first subscription list (cabinet RSC + bot) with status derived from `expiresAt` against `now`, an amber TRIAL badge, `after()`-scheduled background revalidation on cabinet open, and the Geist font normalization.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-02T01:29:10Z
- **Completed:** 2026-10-02T01:33:13Z
- **Tasks:** 2 of 2
- **Files modified/created:** 8 (6 in Task 1, 3 in Task 2, one overlap)
- **Commits:** 2

## Accomplishments

- **Cache-first read path (D-29):** `listKeys(telegramId)` reads `keys_cache` scoped by the owning user row (T-02-13 IDOR) and returns `RenderedKey[]`, ordered active → expiring → expired → pending → unknown. The status is recomputed from `expiresAt` vs `now` (Pitfall 6 / T-02-14), so a stale mirror can never render an expired key as active; absent data maps to `status.unknown`.
- **Background revalidation:** `revalidateKeys(telegramId)` calls `artemida.listKeys()`, upserts every returned key via the unique `(userId, keyId)` pair, stamps `lastSyncedAt`, and reconciles removals conservatively. Wired post-response through `after()` in both `GET /api/keys` and the home page, so D-29 fires on cabinet open, not only when the JSON route is hit.
- **Correct, safe status surface (CAB-01):** `components/SubscriptionCard.tsx` shows name, derived status badge, expiry (`key.expires`) and device usage (`key.devicesCount`), plus a distinct amber `TRIAL` chip on trial keys. The five literal `t("status.…")` keys live in the shared `statusLabel` switch — never string-interpolated — so the i18n scanner registers them.
- **Home screen rebuilt:** the skeleton logged-in card was replaced by the «Мои подписки» section (cache-first) plus `TrialButton` + `TariffPicker`. Zero keys renders `subs.emptyHeading`/`subs.emptyBody`; ≥2 keys shows the `tp("subs.count", n)` plural header; a read failure renders mapped copy (`common.errorLoad` / `common.errorUnavailable` / `common.errorRateLimit`) + retry, never raw provider text. A Suspense fallback renders 3 `h-16 animate-pulse rounded-2xl` skeleton rows while the cache read resolves. The list scrolls in normal page flow (no fixed-height inner scroll region).
- **Bot parity:** the «Мои ключи» handler uses the SAME `listKeys`/`revalidateKeys` path, replies with a compact per-key summary (name, derived status, expiry, device count) capped at 4000 chars, and refreshes fire-and-forget. Sub-link detail is deferred to 02-05 as planned.
- **Typography:** removed the `Arial, Helvetica, sans-serif` body override from `app/globals.css` so the loaded Geist face wins via the `--font-sans` token (UI-SPEC "Font rationale").

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — cache-first «Мои подписки» list (PWA)** — `4b66218` (feat)
2. **Task 2: Bot «Мои ключи» branch + font normalization** — `acac32e` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified

- `lib/keys-service.ts` — `RenderedKey`/`StatusKind`/`deriveStatusKind`/`statusLabel`/`formatKeyDate`, `listKeys`, `revalidateKeys`; the single cache-first read path shared by page/route/bot.
- `app/api/keys/route.ts` — session-gated `GET`, cache-first body, `after()` revalidation with swallowed provider errors.
- `components/SubscriptionCard.tsx` — presentational RSC card; status badge + amber `TRIAL` chip; `key.expires`/`key.devicesCount`.
- `app/page.tsx` — real session resolution, `SubscriptionsSection` (cache-first + `after()`), skeleton/empty/error states, `subs.title`/count header; typography normalized to the declared scale.
- `lib/i18n/messages/ru.ts` — `subs.*`, `status.*`, `trial.badge`, `key.expires`, `key.devicesCount`, `common.errorLoad/errorUnavailable/errorRateLimit`, `bot.keysTitle/keysEmpty/keysError`; removed orphaned `home.keysTitle`/`home.keysText`.
- `lib/bot.ts` — «Мои ключи» handler over the shared read path.
- `app/globals.css` — dropped the body font override.
- `tests/unit/keys-service.test.ts` — status derivation, ordering, field mapping/isTrial, upsert-by-unique vectors.

## Decisions Made

- **Expiry wins over stored status:** `deriveStatusKind` computes active/expiring (≤3 days)/expired from `expiresAt`; the stored status string is only used for the non-time `pending`/`expired` lifecycle, and `unknown` covers absent data. This satisfies the prohibition "never present an expired key as active".
- **Consume `KeyList.items`:** the tracked `lib/artemida.ts#listKeys` returns `{ items, count, query }`, not a bare array as the plan's interface block stated; `revalidateKeys` iterates `.items`.
- **`after()` in the page:** the home page imports `after` from `next/server` and schedules `revalidateKeys(telegramId)` inside the Suspense-streamed section, proving D-29 on cabinet open (validated by production build).
- **Real session on the page:** `Home` now calls `requireSession()` (invalid/absent cookie → logged-out branch) instead of the previous cookie-presence stub, because `listKeys` needs the trusted telegram id.
- **Shared `statusLabel`:** the badge switch is one helper in `lib/keys-service.ts` used by both the card and the bot, keeping the five literal `t("status.…")` calls scanner-visible and the copy identical across channels.

## Deviations from Plan

### Auto-fixed / adjustments

**1. [Scope adjustment] Shared `statusLabel` instead of a component-local switch**
- **Found during:** Task 1 (`components/SubscriptionCard.tsx`)
- **Issue:** The plan placed the badge switch inside `SubscriptionCard`, but the bot (Task 2) needs the identical derivation; duplicating it risks divergence.
- **Fix:** One `statusLabel(kind, expiresAt)` helper in `lib/keys-service.ts`, used by both the card and the bot. The five literal `t("status.…")` calls remain in scanned source, so the i18n invariant is unaffected.
- **Files modified:** `lib/keys-service.ts`, `components/SubscriptionCard.tsx`, `lib/bot.ts`
- **Verification:** `tests/unit/i18n.test.ts` green (no missing/unused keys).
- **Committed in:** `4b66218` / `acac32e`

**2. [Rule 1 - Bug] `revalidateKeys` reads `artemida.listKeys().items`**
- **Found during:** Task 1
- **Issue:** The plan's interface block typed `listKeys` as `Promise<NormalizedKey[]>`, but the shipped 02-02 client returns `KeyList` (`{items,count,query}`). Iterating the object directly would silently do nothing.
- **Fix:** `revalidateKeys` iterates `list.items`.
- **Files modified:** `lib/keys-service.ts`
- **Verification:** upsert-by-unique unit vector passes and persists rows.
- **Committed in:** `4b66218`

**3. [Rule 2 - Missing Critical] Page verifies the real session**
- **Found during:** Task 1 (`app/page.tsx`)
- **Issue:** The previous page only checked cookie presence; a forged/expired cookie would still enter the logged-in branch, and there was no telegram id to scope `listKeys`.
- **Fix:** `Home` calls `requireSession()` and treats `SessionError` as logged-out; any other error rethrows. All reads remain scoped by the verified id (T-02-13).
- **Files modified:** `app/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npx vitest run tests/unit` green.
- **Committed in:** `4b66218`

**4. [Rule 2 - Missing Critical] Defensive cache-read handling on the route**
- **Found during:** Task 1 (`app/api/keys/route.ts`)
- **Issue:** An unexpected DB error in `listKeys` would escape as an unhandled 500 with a stack; the BFF discipline returns a generic body.
- **Fix:** wrapped the cache read in try/catch → `{error:"internal"}` 500 with `logger.error({route:"keys"})`.
- **Files modified:** `app/api/keys/route.ts`
- **Verification:** `npx tsc --noEmit` clean; build green.
- **Committed in:** `4b66218`

---

**Total deviations:** 4 (1 scope adjustment, 1 bug, 2 missing-critical). All were required for correctness or to keep one source of truth; no unplanned runtime feature and no new packages (T-02-SC).

## Issues Encountered

- **Full `npx vitest run` parallel-suite flake (pre-existing):** `tests/integration/auth-flow.test.ts > rejects the replayed payload` returned 200 instead of 401 when the whole suite runs in parallel workers; it passes in isolation (2 passed). The replay row is wiped by a sibling file's `prisma.replayCache.deleteMany()`. Not caused by this plan — recorded in `deferred-items.md` and `.planning/WINDOWS.md` (id 6). The authoritative task verify (`npx vitest run tests/unit`) is green.
- **Build/DB env:** `.env.local` holds only ARTEMIDA vars, so the build verification supplied throwaway `BOT_TOKEN`/`BOT_TEST_TOKEN`/`DATABASE_URL`/`SESSION_SECRET`/`WEBHOOK_SECRET` inline (same hermetic approach as `vitest.config.ts` test env); the DB-backed vectors ran against local Postgres `setwhite`.

## Known Stubs

None. The Suspense skeleton is a loading state, not a stub. The bot's key-detail / subscription-link message is a planned 02-05 handoff (the trial key is already persisted with `subscriptionUrl`), with no hardcoded-empty data flowing into a render path.

## Threat Flags

None — the new surface (`GET /api/keys`, the home cache read, the bot read) is exactly the plan's threat model. Mitigations implemented: T-02-13 (every read scoped by session telegram id → owning user row), T-02-14 (`statusKind` from `expiresAt`, `status.unknown` fallback), T-02-16 (`after()` errors caught + `logger.warn` with code/requestId only), T-02-SC (no new packages).

## User Setup Required

None for steady state. To reproduce the DB-backed verification:

```bash
export DATABASE_URL="postgresql://<local-user>@127.0.0.1:5432/setwhite"
npx tsc --noEmit
npx vitest run tests/unit
BOT_TOKEN=... BOT_TEST_TOKEN=... SESSION_SECRET=... WEBHOOK_SECRET=... npm run build
```

## Next Phase Readiness

- `lib/keys-service.ts#listKeys/revalidateKeys` + `RenderedKey` are the shared read path; 02-05 extends it with `getSubscription`/sub-link + QR rather than adding parallel Prisma.
- The expanded `keys_cache` columns (`subscriptionUrl`, traffic, devices) are already mirrored, so the key-detail screen can render without a second read model.
- `statusLabel`/`formatKeyDate` are reusable for the key-detail and devices screens.
- ⚠️ Trial keys must keep showing only «Купить подписку» (no renew/upgrade) and the device floor stays at 2 (A7 findings from 02-01/02-03).

---

*Phase: 02-keys-trial*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: app/api/keys/route.ts
- FOUND: components/SubscriptionCard.tsx
- FOUND: tests/unit/keys-service.test.ts
- FOUND: lib/keys-service.ts
- FOUND: app/page.tsx
- FOUND: commit 4b66218 (Task 1)
- FOUND: commit acac32e (Task 2)
- VERIFY: `npx tsc --noEmit` exits 0
- VERIFY: `npx vitest run tests/unit` → 9 files / 55 tests passed
- VERIFY: `npm run build` → Compiled successfully; `/` and `/api/keys` rendered as dynamic (ƒ)
- VERIFY: `app/globals.css` has no `font-family: Arial` override
- VERIFY: no file deletions in either task commit
- DEFERRED: full `npx vitest run` parallel-suite auth-flow replay flake (pre-existing; WINDOWS id 6)
