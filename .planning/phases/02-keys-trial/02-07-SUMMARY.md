---
phase: 02-keys-trial
plan: "07"
subsystem: api
tags: [prisma, postgres, vitest, idor, ownership, artemida, keys-cache]

# Dependency graph
requires:
  - phase: 02-keys-trial
    provides: keys_cache model + migration (customer_ref), artemida.listKeys/getSubscriptionLinks normalizers, the cache-first read path (D-29)
provides:
  - ownership-filtered revalidateKeys population step (filters account-wide GET /keys to the caller's customerRef)
  - null-safe subscription_url cache write in getSubscriptionForUser
  - two-user regression suite proving A never sees B's key (cache, detail, sub-link, devices)
affects: [03-payments, cabinet, bot, device-routes]

# Actuals (#2632) — chars/4 over the realized diff (8,509 chars), same scale as the plan's estimate.
actuals:
  tokens: 2127
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership filter at the cache population step: filter the account-wide provider list to key.customerRef === String(telegramId) before any upsert; absent/null ownership evidence is never ownership"
    - "Non-null guarded Prisma update: spread the field only when the tolerant normalizer produced a real value, so a 2xx shape mismatch cannot persist null over a good cached value"

key-files:
  created: []
  modified:
    - lib/keys-service.ts
    - tests/unit/keys-service.test.ts

key-decisions:
  - "Filter on the observed normalized customerRef field rather than relying on the provider's unverified q query semantics (ASSUMP-A6)"
  - "Guard only the cache write (subscription_url), not the returned value: the owning caller still receives the live null and renders key.linkUnavailable"
  - "Did not touch lib/artemida.ts or prisma/schema.prisma — no signature change or migration required"

patterns-established:
  - "Two-user isolation vectors: seed users A and B, run revalidateKeys per user against one account-wide list, assert per-user cache contents"
  - "Fail-closed ownership: a null customerRef is skipped, so an unrecognized provider shape leaks nothing (may under-populate, never over-populate)"

requirements-completed: [CAB-01, CAB-03, CAB-04]

coverage:
  - id: D1
    description: "revalidateKeys(A) upserts only keys whose customerRef === String(A); B's key never enters A's cache (cross-user leak closed)"
    requirement: "CAB-01"
    verification:
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#ownership: revalidateKeys(A) never mirrors B's key into A's cache"
        status: pass
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#ownership: a mixed account-wide list populates each user only with their own keys"
        status: pass
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#ownership: a key with null customerRef is never upserted (absence ≠ ownership)"
        status: pass
    human_judgment: false
  - id: D2
    description: "After revalidateKeys(A) accepts an account-wide list, B's key is not readable (detail/sub-link) or mutable (devices) by A"
    requirement: "CAB-03"
    verification:
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#ownership: a key owned only by B is not readable or mutable by A after revalidation"
        status: pass
    human_judgment: false
  - id: D3
    description: "A tolerant-normalizer null on a 2xx preserves a previously good cached subscription_url; a real URL still refreshes the cache"
    requirement: "CAB-04"
    verification:
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#preserves a good cached subscription_url when a 2xx normalizes to null (gap #7)"
        status: pass
      - kind: unit
        ref: "tests/unit/keys-service.test.ts#refreshes the cached subscription_url when the provider returns a real URL"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-10-02
status: complete
---

# Phase [2] Plan [07]: Keys & Trial gap-closure — ownership leak + null-safe sub-link

**Ownership-filtered `revalidateKeys` closes the cross-user IDOR at the cache population step, a null-safe `subscription_url` write stops a 2xx shape mismatch wiping a good cached URL, and a two-user regression suite proves A never sees B's key.**

## Performance

- **Duration:** 3min
- **Started:** 2026-10-02T02:16:00Z
- **Completed:** 2026-10-02T02:19:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `revalidateKeys` now mirrors ONLY provider keys whose normalized `customerRef === String(telegramId)`; a foreign or null-ref key is skipped, so the account-wide `GET /keys` (single service-wide `ARTEMIDA_API_KEY`) can no longer populate another user's `keys_cache`.
- `getSubscriptionForUser` writes `subscription_url` only when `links.subscriptionUrl` is non-null, so a tolerant-normalizer null on a 2xx no longer overwrites a previously good cached URL; traffic + `lastSyncedAt` still refresh.
- Two-user regression suite added: A's cache stays empty when the provider returns only B's key; a mixed list populates each user only with their own; a null-ref key is never upserted; and after `revalidateKeys(A)`, B's key is not readable via `getKeyForUser`/`getSubscriptionForUser` nor mutable via `listDevices`.
- Full Phase 2 unit suite green: **11 files / 77 tests** (was 71), `tsc --noEmit` exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end ownership filter at the cache population step (tracer)** - `3df2abf` (fix)
2. **Task 2: Null-safe subscription write + foreign-key non-mutability assertion** - `414d844` (fix)

**Plan metadata:** committed separately by the orchestrator (docs: complete plan).

_Note: Task 1 followed RED→GREEN within the single tracer commit — the three ownership vectors failed against the unfiltered population step before the fix and passed after._

## Files Created/Modified
- `lib/keys-service.ts` - ownership-filtered `revalidateKeys` (customerRef filter + doc comment) and null-guarded `subscription_url` write in `getSubscriptionForUser` (`lib/artemida.ts` intentionally untouched).
- `tests/unit/keys-service.test.ts` - two-user scaffolding (users A/B, per-user cleanup), updated the pre-existing upsert/no-duplicate vector fixtures to carry `customerRef: String(TELEGRAM_ID)`, and added 5 vectors: 3 ownership-isolation, 1 null-preservation, 1 sub-link freshness, plus the gap-#6 foreign-key non-mutability lock.

## Decisions Made
- Filter on the observed normalized `customerRef` at the population step rather than relying on the provider's unverified `q` query semantics (ASSUMP-A6) — authoritative regardless of provider filter behavior.
- Guard only the cache write, not the return value: the owning caller still receives the live `null` and renders `key.linkUnavailable`.
- No change to `lib/artemida.ts` (its `listKeys` already declares `input.q?`) and no schema/migration change (`keys_cache.customer_ref` already exists).

## Deviations from Plan

None - plan executed exactly as written. The pre-existing `revalidateKeys` upsert vector's fixtures were updated with `customerRef: String(TELEGRAM_ID)` exactly as the plan's Test 4 required, folded into Task 1.

## Issues Encountered
None. Local Postgres at `postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite` was reachable; `DATABASE_URL` exported for DB-backed runs.

## Known Stubs
None — no hardcoded empty values, placeholder text, or unwired data sources were introduced. (The fail-closed null-`customerRef` skip is intentional behavior, asserted by test, not a stub.)

## Threat Flags
None — no new network endpoints, auth paths, file access, or schema changes at a trust boundary. The change strictly narrows an existing trust boundary (ARTEMIDA account → per-user cache) and closes T-02-22/T-02-23; T-02-24's existing ownership join is now backed by a regression assertion.

## Next Phase Readiness
- The phase goal's ownership guarantee («видит **свои** подписки») is restored at the population step; the cross-user leak no longer reproduces.
- Remaining Phase 2 caveats are unchanged and owner-pending: live ARTEMIDA key-scoped shapes remain UNKNOWN (0-key probe account) and bot trial/guides flows remain human-verifiable — neither is affected by this plan.
- Note: if the live provider ever returns `customerRef` as a number, `normalizeKey` yields null and every key is skipped (fail-closed: no leak, but no population). Confirming the live type is part of the owner-pending probe; a number→string coercion would be a follow-up if needed.

---
*Phase: 02-keys-trial*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: `.planning/phases/02-keys-trial/02-07-SUMMARY.md`
- FOUND: `lib/keys-service.ts`
- FOUND: `tests/unit/keys-service.test.ts`
- FOUND commit: `3df2abf` (Task 1)
- FOUND commit: `414d844` (Task 2)
