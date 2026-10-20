---
phase: 02-keys-trial
plan: "03"
subsystem: api
tags: [artemida, trial, anti-abuse, prisma, migration, atomic-claim, bff, telegraf, i18n, vitest]

# Dependency graph
requires:
  - phase: 02-keys-trial/02-01
    provides: docs/artemida-v1-contract.{md,json} — locked pricing shape, minDevices=2, error envelopes
  - phase: 02-keys-trial/02-02
    provides: lib/artemida.ts (createTrial/getPricing), lib/session.ts (requireSession), BFF/i18n patterns
  - phase: 01-foundation
    provides: Prisma 7 singleton, Telegraf bot-in-Next, jose sessions, i18n t()/I18nKey
provides:
  - prisma/schema.prisma — User.trialUsed/trialKeyId (D-21) + expanded KeyCache render mirror
  - prisma/migrations/20261002010428_keys_trial — applied, drift-free schema migration (the phase's only schema change)
  - lib/keys-service.ts — shared claimTrial/releaseTrialOnFailure/startTrial (single read/write path)
  - app/api/trial/route.ts — session-gated POST /api/trial with clean trial_used 409 (D-24)
  - components/TrialButton.tsx — in-flight-locked one-tap trial CTA
  - lib/bot.ts — bot «Попробовать» branch + D-25 live 7/30/90 × 2–10 tariff keyboard
affects: [02-04, 02-05, 02-06]

# Actuals (#2632) — chars/4 over the realized diff (27559 chars).
actuals:
  tokens: 6889
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []                # no new packages (prisma stays pinned ^7.10.0; never the v8-RC)
  patterns:
    - "Atomic DB claim as the anti-abuse gate: updateMany({where:{trialUsed:false}}) + branch on count (D-22)"
    - "Compensating rollback guarded by trialKeyId:null so a recorded success is never reopened (D-23/Pitfall 5)"
    - "Shared service-over-Prisma path for bot + BFF — no duplicated Prisma or fetch in either channel"
    - "Provider conflict (409) treated as terminal already-used, never a retry loop (RESEARCH Q3)"
    - "In-flight lock in the client swaps the CTA label and disables double submit (PITFALLS §6)"

key-files:
  created:
    - lib/keys-service.ts
    - app/api/trial/route.ts
    - components/TrialButton.tsx
    - prisma/migrations/20261002010428_keys_trial/migration.sql
    - tests/unit/trial-claim.test.ts
    - tests/unit/trial-rollback.test.ts
  modified:
    - prisma/schema.prisma
    - app/page.tsx
    - lib/i18n/messages/ru.ts
    - lib/bot.ts
    - vitest.config.ts

key-decisions:
  - "The DB claim is the single source of trial truth; a repeat attempt is answered {ok:false, reason:'trial_used'} 409 with no provider text (D-22/D-24)"
  - "Provider conflict (409) on POST /trial keeps trialUsed set and returns already_used — terminal, not a rollback (RESEARCH Open Q3)"
  - "Bot tariff device range clamps to 2–10 (provider minDevices=2, A7) rather than the plan's stale 1–10; devices=1 is rejected by ARTEMIDA"
  - "trialKeyId is written BEFORE the keys_cache upsert so a cache-write failure can never reopen a used trial"
  - "vitest.config DATABASE_URL defers to process.env when present so the DB-backed trial vectors run against local Postgres"

patterns-established:
  - "Trial issuance: claim (one atomic statement) → provider call → success sentinel → cache upsert; transient failure rolls back, terminal conflict does not"
  - "Bot and BFF share lib/keys-service/lib/artemida — new channels wire the same functions, never a parallel path"

requirements-completed: [TRIAL-01, TRIAL-02]

coverage:
  - id: D1
    description: "Two concurrent startTrial calls yield exactly one key; the loser never reaches ARTEMIDA"
    requirement: TRIAL-01
    verification:
      - kind: unit
        ref: "tests/unit/trial-claim.test.ts#two concurrent startTrial calls yield exactly one created + one already_used"
        status: pass
    human_judgment: false
  - id: D2
    description: "A failed provider call releases the claim (retryable); a recorded success is never reopened; provider conflict is terminal"
    requirement: TRIAL-01
    verification:
      - kind: unit
        ref: "tests/unit/trial-rollback.test.ts#releases the claim when artemida.createTrial fails; never reopens a recorded success (guarded rollback)"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/trial is session-gated, returns a clean trial_used 409 on repeat, and never proxies provider text"
    requirement: TRIAL-01
    verification: []
    human_judgment: true
    rationale: "No dedicated route unit-vector was authored; the route is a thin wrapper over the unit-tested startTrial plus the same requireSession/ArtemidaError mapping pattern proven by pricing-route.test.ts. A human/device pass should confirm the 409 UX."
  - id: D4
    description: "The live database schema matches prisma/schema.prisma with no pending migration or drift (the phase's only schema change)"
    requirement: null
    verification:
      - kind: other
        ref: "npx prisma migrate dev --name keys_trial && npx prisma migrate status && npx prisma validate"
        status: pass
    human_judgment: false
  - id: D5
    description: "Bot offers one-tap trial via the shared service and a 7/30/90 × 2–10 tariff keyboard priced through the same artemida.getPricing path"
    requirement: TRIAL-02
    verification: []
    human_judgment: true
    rationale: "Telegraf handlers are not unit-tested (importing lib/bot.ts launches polling); the inline-keyboard flow and live-price reply require a manual Telegram review."
  - id: D6
    description: "i18n dictionary has no missing or unused keys after the new trial/bot strings"
    requirement: null
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-10-02
status: complete
---

# Phase 02 Plan 03: Trial Vertical Slice + keys_trial Migration Summary

**Server-enforced one-tap trial (atomic DB claim + compensating rollback) shipped from both bot and cabinet, with the phase's only schema migration (`trial_used`/`trial_key_id` + expanded `keys_cache`) applied drift-free to live Postgres.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-10-02T01:00:00Z
- **Completed:** 2026-10-02T01:23:00Z
- **Tasks:** 3 of 3 (Task 2 was a verification-only gate → no file delta)
- **Files modified/created:** 11 (9 in Task 1, 2 in Task 3)
- **Commits:** 2

## Accomplishments

- **Atomic trial gate (D-22/T-02-09):** `claimTrial` runs a single `updateMany({ where: { telegramId, trialUsed: false }, data: { trialUsed: true } })` and branches on `count`. The concurrent-claim vector proves exactly one winner and one `already_used`, and the loser never calls ARTEMIDA.
- **Safe rollback (D-23/T-02-10):** a failing provider call releases the claim (retryable) while the `trialKeyId: null` guard keeps a recorded success terminal. `trialKeyId` is persisted before the `keys_cache` upsert so a cache-write failure can never reopen a used trial.
- **Clean repeat response (D-24/T-02-11):** `POST /api/trial` resolves the telegram id server-side via `requireSession`, answers a repeat with `{ ok: false, reason: "trial_used" }` 409, and maps provider codes to statuses without ever rendering provider text.
- **Phase schema migration applied:** `prisma/migrations/20261002010428_keys_trial` adds `users.trial_used`/`trial_key_id` and the renderable `keys_cache` mirror (`name/is_trial/device_limit/devices/traffic_used_bytes/traffic_limit_bytes/subscription_url/customer_ref/last_synced_at`). `migrate status` reports up to date; `prisma validate` clean.
- **Both channels share one path:** the bot's «Попробовать» calls the same `startTrial`, and its D-25 tariff keyboard resolves live prices through the same `artemida.getPricing` the BFF uses — no duplicated Prisma or fetch.
- **Test suite:** 8 files / 51 tests green, including the two new Wave-0 vectors.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — one-tap trial from the cabinet (schema + atomic claim)** — `a746a7d` (feat)
2. **Task 2: [BLOCKING] Schema push gate** — none (verification-only; `migrate dev` was idempotent, no file delta)
3. **Task 3: Bot trial branch + tariff keyboard** — `9885891` (feat)

**Plan metadata:** committed with this SUMMARY (docs). Task 2 is intentionally commit-less because the migration was generated and applied by the Task 1 tracer; re-running the gate produced no change (per the plan's "idempotent if the tracer already applied it").

## Files Created/Modified

- `prisma/schema.prisma` — `User.trialUsed`/`trialKeyId` (D-21) + expanded `KeyCache` mirror; `@@unique([userId, keyId])` and `onDelete: Cascade` preserved.
- `prisma/migrations/20261002010428_keys_trial/migration.sql` — generated by `prisma migrate dev` (never hand-authored) and applied.
- `lib/keys-service.ts` — `claimTrial`, `releaseTrialOnFailure`, `startTrial`, private `upsertCachedKey`; the single read/write trial path.
- `app/api/trial/route.ts` — session-gated `POST`; clean `trial_used` 409; typed `ArtemidaError` → status mapping + PII-safe `{route, code, requestId}` logging.
- `components/TrialButton.tsx` — client CTA with in-flight lock, used-state copy + «Купить подписку» CTA, error + retry.
- `app/page.tsx` — mounts `TrialButton` above `TariffPicker`; wraps the picker in `#tariff` for the buy CTA anchor.
- `lib/i18n/messages/ru.ts` — task-1 keys (`trial.cta/ctaLoading/error/usedHeading/usedBody`, `key.buyCta`) plus task-3 keys (`trial.subtitle`, `bot.menuTrial/menuTariffs/trialIssued`).
- `lib/bot.ts` — «Попробовать» handler over shared `startTrial`; `tariff:days:*`/`tariff:devices:*` callback handlers over `artemida.getPricing`; new reply-keyboard buttons.
- `tests/unit/trial-claim.test.ts` — concurrent-claim vector (1 created + 1 already_used, provider called once).
- `tests/unit/trial-rollback.test.ts` — failure releases claim, retry succeeds once, success never reopened, provider conflict terminal.
- `vitest.config.ts` — `DATABASE_URL` defers to `process.env` when present (deviation; see below).

## Decisions Made

- **DB claim is authoritative (D-22):** a repeat attempt never reaches ARTEMIDA; the response is a clean RU signal, not a provider error.
- **Provider conflict is terminal (RESEARCH Open Q3):** a provider 409 on `/trial` keeps `trialUsed` set and returns `already_used` instead of rolling back into a retry loop.
- **Device floor is 2 (A7):** the bot tariff keyboard offers 2–10 devices, matching the provider and `/api/pricing`, not the plan's stale 1–10 text.
- **Success sentinel ordering:** `trialKeyId` is written before the cache upsert so a post-issue DB gap cannot reopen the trial (Pitfall 5).
- **Task 2 carries no commit:** the tracer generated and applied the migration; the blocking gate re-ran idempotently with zero file delta (no empty commit created).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Clamped the bot tariff device range to 2–10**
- **Found during:** Task 3 (bot tariff keyboard)
- **Issue:** The plan and `must_haves` say "1–10 devices", but the locked 02-01 contract sets provider `minDevices=2` and `GET /pricing?devices=1` returns `400 invalid_pricing_params`. Offering 1 would guarantee a failure.
- **Fix:** `MIN_DEVICES = 2` in `lib/bot.ts`, mirroring `/api/pricing` (zod `.min(2)`) and `TariffPicker.MIN_DEVICES`.
- **Files modified:** `lib/bot.ts`
- **Verification:** `npx tsc --noEmit` clean; unit suite green.
- **Committed in:** `9885891` (Task 3)

**2. [Rule 2 - Missing Critical] Treat provider conflict (409) as terminal, not retryable**
- **Found during:** Task 1 (`lib/keys-service.ts` `startTrial`)
- **Issue:** Rolling back `trialUsed` on ANY provider error would reopen the trial on a provider conflict, letting a user loop the one-time offer. A provider conflict means the account is already ineligible provider-side.
- **Fix:** `startTrial` keeps the claim and returns `already_used` on `ArtemidaError.code === "conflict"`; only transient failures trigger `releaseTrialOnFailure`. RESEARCH Open Q3 (resolved) mandates mapping provider 4xx to already-used; covered by a rollback vector.
- **Files modified:** `lib/keys-service.ts`
- **Verification:** `tests/unit/trial-rollback.test.ts#treats a provider conflict as terminal (non-retryable)` passes.
- **Committed in:** `a746a7d` (Task 1)

**3. [Rule 3 - Blocking] `vitest.config.ts` DATABASE_URL defers to the caller's env**
- **Found during:** Task 1 (running the DB-backed trial vectors)
- **Issue:** The vitest `test.env` block unconditionally overrode `DATABASE_URL` with a non-connectable dummy (`postgresql://test:test@.../test`), so the plan-mandated `trial-claim`/`trial-rollback` Prisma vectors could never reach the live local Postgres.
- **Fix:** `DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:5432/test'` — real DB when the caller provides it, dummy fallback otherwise.
- **Files modified:** `vitest.config.ts`
- **Verification:** trial vectors pass against local Postgres; 51/51 unit tests green.
- **Committed in:** `a746a7d` (Task 1)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking).
**Impact on plan:** All three were required for correctness or to make the plan's own automated verify runnable. No scope creep — no runtime feature beyond the plan.

## Issues Encountered

- **Local DB env was undocumented in the shell:** no `.env` file exists (only `.env.local` with ARTEMIDA keys). The executor exported `DATABASE_URL="postgresql://<localuser>@127.0.0.1:5432/setwhite"` (Homebrew Postgres, trust auth; DB and foundation migration already present). This is the exact DB setup step for reproducing the verify; see "User Setup Required".
- **`prisma migrate dev` did not auto-regenerate the client:** an explicit `npx prisma generate` was required before the new fields typechecked (generated client is gitignored and regenerable).
- **Pre-existing blocker #2 in `.planning/WINDOWS.md`** ("Integration suite not run locally: no Postgres configured") is partially addressed by the `vitest.config.ts` change; the integration suite still requires the exported `DATABASE_URL`.

## Known Stubs

None. The bot trial reply sends the key id + `trial.subtitle` and deliberately defers the subscription-link message to plan 02-05 (as the plan specifies) — this is a planned handoff, not a stub, and no data is hardcoded-empty into a rendering path.

## Threat Flags

None — the new surface (`POST /api/trial` + `lib/keys-service.ts`) is exactly the plan's threat model. Mitigations implemented: T-02-09 (atomic claim), T-02-10 (guarded rollback), T-02-11 (clean repeat response), T-02-12 (`requireSession` resolves the id server-side), T-02-SC (no new packages; prisma stays `^7.10.0`).

## User Setup Required

None for steady state. To reproduce the DB-backed verification on a fresh checkout, provide a local Postgres and export its URL before running Prisma/vitest:

```bash
export DATABASE_URL="postgresql://<local-user>@127.0.0.1:5432/setwhite"   # Homebrew Postgres, trust auth
npx prisma migrate dev --name keys_trial
npx prisma migrate status && npx prisma validate
npx tsc --noEmit && npx vitest run tests/unit
```

`ARTEMIDA_API_KEY` already lives in `.env.local` (gitignored); the trial tests use a spied `artemida.createTrial`, so no live provider call is made.

## Next Phase Readiness

- `lib/keys-service.ts` is the single trial/keys write path; 02-04 (keys list/detail/devices) and 02-05 (subscription links + QR) should extend it (`listKeys`/`revalidateKeys`/`getSubscription`) rather than add parallel Prisma.
- The expanded `keys_cache` columns are ready for the 02-04 cache-first list and 02-05 sub-link/traffic rendering.
- `trial.subtitle`, `trial.badge` (02-04), and the sub-link message (02-05) remain to be wired; the trial key is persisted with `trialKeyId` + a `keys_cache` row so later plans can render it.
- The bot tariff keyboard uses the same `getPricing` path as the BFF, so any provider pricing change stays in `lib/artemida.ts`.
- ⚠️ Device floor: any later UI/renew/upgrade must keep the minimum at 2 (A7), and trial keys must not expose renew/upgrade.

---

*Phase: 02-keys-trial*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: lib/keys-service.ts
- FOUND: app/api/trial/route.ts
- FOUND: components/TrialButton.tsx
- FOUND: prisma/migrations/20261002010428_keys_trial/migration.sql
- FOUND: tests/unit/trial-claim.test.ts
- FOUND: tests/unit/trial-rollback.test.ts
- FOUND: commit a746a7d (Task 1)
- FOUND: commit 9885891 (Task 3)
- VERIFY: `npx prisma migrate status` → "Database schema is up to date!" (2 migrations, no drift/pending)
- VERIFY: `npx prisma validate` → schema valid
- VERIFY: `npx tsc --noEmit` exits 0
- VERIFY: `npx vitest run tests/unit` → 8 files / 51 tests passed
- COMMIT: no file deletions in either task commit
