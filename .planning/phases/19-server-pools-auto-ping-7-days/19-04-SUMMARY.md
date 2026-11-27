---
phase: 19-server-pools-auto-ping-7-days
plan: 04
subsystem: database
tags: [flutter, dart, drift, sqlite, drift_flutter, native-database-memory, ttl-cache, ping-cache, last-good, per-tab-persistence, riverpod]

# Dependency graph
requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-03 PingCacheWriter/PingCacheLookup seams, PingCacheEntry row shape and pingCacheTtl=60s used by the Drift DAO"
provides:
  - "Drift AppDatabase (ping_cache, last_good, selection, current_tab, server_list_cache), generated .g.dart and appDatabaseProvider"
  - "PingCacheDao: upsert/fresh/isFresh/watchFresh/clear, last_good <=5 dedupe, per-tab selection and current_tab, metadata-only server_list_cache"
  - "clearPingCacheAndLastGood: network-change invalidation clears ping_cache + last_good while keeping selection + current_tab (D-11)"
  - "14 deterministic NativeDatabase.memory() unit tests covering TTL, idempotency, concurrency and keep-on-clear"
affects:
  - "19-06 ping providers consume appDatabaseProvider / PingCacheDao through PingRepository; phase 20 reuses the local store for tunnel state"

# Actuals — same scale as the plan estimate (chars/4 over realized handwritten diff)
actuals:
  tokens: 7650
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added:
    - "drift ^2.35.4, drift_flutter ^0.3.1, sqlite3 ^3.9.2, sqlite3_flutter_libs ^0.6.0+eol"
    - "path ^1.9.1, path_provider ^2.1.6, dev drift_dev ^2.35.3 (build_runner already present)"
  patterns:
    - "Drift @DriftDatabase/@DriftAccessor with generated mixins and NativeDatabase.memory() for network-free unit tests"
    - "Composite-PK upsert as an idempotent cache write; inclusive TTL `ts >= now - 60000`"
    - "Async injectable cache boundaries so PingRepository can read a real SQLite-backed cache without simulation"

key-files:
  created:
    - mobile/lib/core/db/app_database.dart
    - mobile/lib/core/db/app_database.g.dart
    - mobile/lib/core/db/tables.dart
    - mobile/lib/core/db/ping_cache_dao.dart
    - mobile/lib/core/db/ping_cache_dao.g.dart
    - mobile/test/unit/core/db/ping_cache_test.dart
  modified:
    - mobile/pubspec.yaml
    - mobile/pubspec.lock
    - mobile/lib/core/ping/ping_repository.dart
    - mobile/test/unit/core/ping/ping_repository_test.dart

key-decisions:
  - "D-10/D-11: one Drift row per (server_id, tab); TTL is inclusive at 60 s (`ts >= now-60000`); re-ping only after expiry, manual refresh or connectivity change"
  - "Network-change `clearPingCacheAndLastGood()` deletes ping_cache + last_good in a transaction and deliberately keeps selection + current_tab (Karing-bug guard)"
  - "last_good uses PK(tab, server_id) for dedupe; pushLastGood re-timestamps an existing id so it becomes most-recent, then trims the tab to five rows"
  - "selection is one row per tab (overwrite on set); current_tab is a singleton row defaulting to `simple`; server_list_cache stores metadata-only JSON for offline display"
  - "PingCacheLookup.fresh was changed from sync to async (Rule 2) — a SQLite-backed Drift DAO cannot implement a synchronous read; the 19-03 fake cache and 32 tests were updated"
  - "No Prisma schema change, no `load`, no simulation, no secrets/raw links in local storage; `npx prisma validate` stays green"

patterns-established:
  - "DAO method `lastGoodFor(tab)` (not `lastGood`) because drift_dev generates a `lastGood` table getter on the accessor mixin"
  - "Companion upserts use `InsertMode.insertOrReplace`; `Value(...)` is explicit for companion fields without defaults"
  - "Repository-level re-ping is proven with a call counter rather than mocktail `verify(...).called(n)` chains, which consume matched calls"

requirements-completed: [REQ-PING-04, REQ-PING-05, REQ-PING-07, REQ-POOL-01]

# Coverage metadata
coverage:
  - id: D1
    description: "Drift AppDatabase and tables with ping_cache PK(server_id,tab), approx default false and TTL 60 s"
    requirement: REQ-PING-04
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/db/ping_cache_test.dart#write -> fresh read -> TTL -> clear is a single working path"
        status: pass
    human_judgment: false
  - id: D2
    description: "Upsert idempotency: same key overwrites in place, concurrent upserts leave no duplicates and no lost rows"
    requirement: REQ-PING-04
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/db/ping_cache_test.dart#upsert overwrites the same key / concurrent upserts leave no duplicates and no lost rows"
        status: pass
    human_judgment: false
  - id: D3
    description: "Re-ping only after 60 s expiry, manual refresh or connectivity change; empty/null-RTT rows handled"
    requirement: REQ-PING-05
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/db/ping_cache_test.dart#re-pings only after TTL expiry, manual refresh or network change / empty cache is stale"
        status: pass
    human_judgment: false
  - id: D4
    description: "last_good <=5 with most-recent-first dedupe, per-tab isolation and clearLastGood"
    requirement: REQ-PING-07
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/db/ping_cache_test.dart#pushLastGood dedupes, caps at five and stays per-tab"
        status: pass
    human_judgment: false
  - id: D5
    description: "Per-tab selection and current_tab persistence, both preserved by network-change invalidation"
    requirement: REQ-POOL-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/db/ping_cache_test.dart#selection persists per tab / current tab defaults to simple and is kept on network change"
        status: pass
    human_judgment: false
  - id: D6
    description: "Metadata-only server_list_cache per tab for offline display"
    requirement: REQ-PING-04
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/db/ping_cache_test.dart#server list cache stores metadata JSON per tab for offline use"
        status: pass
    human_judgment: false
  - id: D7
    description: "Generated Drift code and analyzer cleanliness with no backend schema change"
    requirement: REQ-PING-04
    verification:
      - kind: other
        ref: "cd mobile && dart run build_runner build --delete-conflicting-outputs && flutter analyze && npx prisma validate"
        status: pass
    human_judgment: false
  - id: D8
    description: "On-device persistence across app restarts and real network switches"
    requirement: REQ-PING-05
    verification: []
    human_judgment: true
    rationale: "Requires a physical device and a real connectivity transition; this environment has no device/ADB session. The DAO semantics are fully unit-tested with NativeDatabase.memory()."

# Metrics
duration: 10 min
completed: 2026-11-27
status: complete
---

# Phase 19 Plan 04: Drift ping cache and per-tab persistence Summary

**Drift SQLite store with a 60 s `ping_cache` TTL, ≤5 last-good dedupe and per-tab selection/current-tab persistence that survives network invalidation — no simulation, no Prisma change**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-27T04:01:43Z
- **Completed:** 2026-11-27T04:11:33Z
- **Tasks:** 3 (1 tracer + 2 auto)
- **Files created/modified:** 10 (6 created, 4 modified)

## Accomplishments

- Added the verified pub.dev Drift stack (`drift 2.35.4`, `drift_flutter 0.3.1`, `sqlite3 3.9.2`, `sqlite3_flutter_libs`, `path`, `path_provider`, dev `drift_dev 2.35.3`); `flutter pub get` and `dart run build_runner build --delete-conflicting-outputs` are clean.
- Created `AppDatabase` with five tables and a Riverpod `appDatabaseProvider`; the app executor uses `driftDatabase(name: "app_db")`, tests inject `NativeDatabase.memory()`.
- Implemented `PingCacheDao` against the 19-03 seams: idempotent composite-PK upsert, inclusive 60 s `fresh`/`isFresh`/`watchFresh`, `clearPingCache`, `markOnline`, `last_good` ≤5 dedupe, per-tab selection/current_tab, metadata-only `server_list_cache`.
- Network-change `clearPingCacheAndLastGood()` clears only ping samples and last-good in a transaction; selection and current tab are preserved (Karing-bug guard, D-11).
- Wrote 14 deterministic unit tests: tracer write→fresh→TTL→clear, repository integration through the real DAO, ≤5 dedupe/ordering, per-tab persistence, re-ping triggers, concurrency and stream TTL filtering. All 14 pass; the 32 phase-19-03 ping tests still pass.

## Task Commits

Each task was committed atomically:

1. **Task 1 (`tracer`): end-to-end Drift `ping_cache`** — `1cc0114` (feat; includes the async cache-seam fix)
2. **Task 2: last-good ≤5 + per-tab selection/current-tab persistence** — `9ddd21a` (test)
3. **Task 3: TTL + idempotency + concurrency slice** — `39d5f3f` (test)

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `mobile/lib/core/db/app_database.dart` — `@DriftDatabase` over five tables and `appDatabaseProvider`.
- `mobile/lib/core/db/app_database.g.dart` — generated database/row/companion code.
- `mobile/lib/core/db/tables.dart` — `PingCache`, `LastGood`, `Selection`, `CurrentTab`, `ServerListCache`.
- `mobile/lib/core/db/ping_cache_dao.dart` — `PingCacheDao` implementing `PingCacheWriter`/`PingCacheLookup`.
- `mobile/lib/core/db/ping_cache_dao.g.dart` — generated accessor mixin.
- `mobile/test/unit/core/db/ping_cache_test.dart` — 14 `NativeDatabase.memory()` tests.
- `mobile/pubspec.yaml`, `mobile/pubspec.lock` — Drift dependencies, sorted.
- `mobile/lib/core/ping/ping_repository.dart` — `PingCacheLookup.fresh` made async so the Drift DAO can implement it.
- `mobile/test/unit/core/ping/ping_repository_test.dart` — fake cache updated for the async seam.

## Decisions Made

- TTL boundary is inclusive (`ts >= now - 60000`), matching the 19-03 fake cache: exactly 60 s is fresh, 60001 ms is stale.
- `last_good` dedupes via PK(tab, server_id); re-pushing an id updates its timestamp, making it most-recent, then the tab is trimmed to five rows.
- `selection` has one row per tab (overwrite), `current_tab` a singleton row defaulting to `simple`; both survive `clearPingCacheAndLastGood()`.
- Drift-generated `lastGood` table getter forced the read method name `lastGoodFor(tab)`.
- No `load` field, no network/Cache simulation, no secrets or raw share links persisted; no Prisma schema change (`npx prisma validate` exit 0).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `PingCacheLookup.fresh` had to become async**
- **Found during:** Task 1 (tracer implementation)
- **Issue:** The 19-03 seam declared `PingCacheEntry? fresh(...)` synchronously. A real Drift DAO reads SQLite through a `Future`, so it could not implement the interface; a memory-mirror workaround would go stale on restart.
- **Fix:** Changed the interface and `PingRepository.pingServer` to `await` the lookup; updated the 19-03 fake cache and its two assertions. All 32 ping tests still pass.
- **Files modified:** `mobile/lib/core/ping/ping_repository.dart`, `mobile/test/unit/core/ping/ping_repository_test.dart`
- **Verification:** `flutter test test/unit/core/ping/` 32/32 and the new repository-through-DAO tracer test pass.
- **Committed in:** `1cc0114`

**2. [Rule 1 - Bug] Drift API/naming mismatches during tracer compilation**
- **Found during:** Task 1 (first `flutter test` run)
- **Issue:** Missing `ping_result.dart` import (`PingClock`/`defaultPingClock`), DAO not declaring `implements PingCacheWriter, PingCacheLookup`, a `lastGood` method colliding with the generated table getter, and `CurrentTabCompanion.insert(id:)` needing `Value(1)`.
- **Fix:** Added the import and interface declaration, renamed the method to `lastGoodFor`, and wrapped the companion id in `Value`.
- **Files modified:** `mobile/lib/core/db/ping_cache_dao.dart`
- **Verification:** build_runner, `flutter analyze` (0 issues in plan files) and all 14 DB tests pass.
- **Committed in:** `1cc0114`

**3. [Rule 1 - Bug] Concurrent admin process' staged deletion swept into the first commit**
- **Found during:** Task 1 post-commit deletion check
- **Issue:** Another process had staged `components/admin/PromoManagerForm.tsx` for deletion; `git diff --cached` showed it after my explicit `git add`, and the first commit included it.
- **Fix:** Restored the file from the parent commit to index and worktree, then amended the task commit. No tracked-file deletions remain in any plan commit.
- **Files modified:** `components/admin/PromoManagerForm.tsx` (restored, no net change vs. pre-plan HEAD)
- **Verification:** `git diff --diff-filter=D HEAD~1 HEAD` empty; file tracked again.
- **Committed in:** `1cc0114` (amended)

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2). **Impact on plan:** no scope creep — all fixes were required for the DAO to compile and for the repository to read a real SQLite cache. One ledger entry was appended to `.planning/WINDOWS.md` for the async seam change.

## Issues Encountered

- `flutter analyze` still exits 1 with ~1583 pre-existing `info` lints in unrelated phase-18 auth widget tests (`error`/`warning`/`info` count in every file created or modified by this plan is 0). Per the scope-boundary rule these were not fixed.
- Two initial Task 3 test failures were test-harness mistakes, not product bugs: chained mocktail `verify(...).called(n)` calls consume matched invocations, and `watchFresh(...).skip(1).first` raced the stream's initial emission. Replaced with an explicit call counter and a collecting subscription; all 14 tests pass.
- Unrelated admin/promos files remain modified/untracked by a concurrent process and were deliberately left untouched and unstaged.

## User Setup Required

None — no external service configuration required for this plan.

## Known Stubs

None. The generated `.g.dart` files are build outputs, and the absent native libbox binaries are intentional gitignored CI artifacts (already in `.planning/WINDOWS.md` id 14), not code stubs.

## Threat Flags

None new. Implementation stays inside the PLAN threat register: no secrets/raw links in local SQLite, only metadata JSON in `server_list_cache`, real `connectivity_plus`-driven invalidation (no simulation), verified pub.dev packages only, no backend/npm dependency and no Prisma schema change.

## Next Phase Readiness

- 19-06 can wire `appDatabaseProvider` / `PingCacheDao` into `pingCacheProvider`, map `Server` → `PingTarget` and apply `rankBest`; `PingRepository` already reads and writes through the DAO with 60 s TTL and generation-based cancellation.
- Network-change listeners should call `clearPingCacheAndLastGood()` and `PingRepository.cancelInflight()`; keep `getSelection`/`getCurrentTab` untouched.
- Open risk: on-device persistence across real restarts/network switches remains a human-UAT item (coverage D8); native URLTest remains the 19-03/19-02 CI-artifact risk.

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*

## Self-Check: PASSED

- All seven created files (5 DB sources/generated + test + SUMMARY) present on disk.
- All three task commits verified in `git log` (`1cc0114`, `9ddd21a`, `39d5f3f`).
- No tracked-file deletions across the plan's commits.
- Final rerun: `flutter test test/unit/core/db/` 14/14 pass; `flutter test test/unit/core/ping/` 32/32 pass; `flutter analyze` 0 errors/issues in all plan files; `npx prisma validate` exit 0; prohibition scan finds no simulation, `load`, `libbox_urltest` or secret logging in the new code.
