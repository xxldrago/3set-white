---
phase: 19-server-pools-auto-ping-7-days
plan: 03
subsystem: mobile
tags: [flutter, dart, ping, libbox, urltest, writegroups, socket-connect, tcp-fallback, freezed, mocktail]

requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-02 LibboxPingCore (init/start/urltest/dispose, async WriteGroups RTT) and 19-01 minimal sing-box outbound with tag srv-<id>"
provides:
  - "PingResult freezed model + pingClass buckets (good<=60, mid<=110, warn<=180, bad, offline)"
  - "LibboxPingService: real URLTest(srv-<id>) + async WriteGroups RTT; 0,0 => offline; approx=false"
  - "SocketPingService: silent approx TCP fallback via Socket.connect, IPv6 strip, int.tryParse, destroy"
  - "PingRepository: pingServer / quickPath / fullPing, 800ms + 2000ms budgets, concurrency 10-16, generation cancel, serialized urltests, fresh cache TTL 60s"
  - "PingCacheWriter + PingCacheLookup injection boundaries for 19-04 PingCacheDao"
  - "32 deterministic unit tests with fake libbox/socket/clock; no real network, no simulation"
affects:
  - "19-04 PingCacheDao implements PingCacheWriter/PingCacheLookup; 19-06 Server maps to PingTarget and bestServerProvider applies rankBest; phase 20 adds the tunnel"

actuals:
  tokens: 14816
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Injectable seams (LibboxPingClient, SocketConnector, PingClock, PingCacheWriter/Lookup) for network-free unit tests"
    - "Bounded worker pool + generation token for cancellation; Completer-tail serialization of native FFI calls"
    - "Silent boundary: LibboxPingService returns null and the repository performs the approx fallback without any UI signal"

key-files:
  created:
    - mobile/lib/core/ping/ping_result.dart
    - mobile/lib/core/ping/ping_result.freezed.dart
    - mobile/lib/core/ping/ping_result.g.dart
    - mobile/lib/core/ping/libbox_ping_service.dart
    - mobile/lib/core/ping/socket_ping_service.dart
    - mobile/lib/core/ping/ping_repository.dart
    - mobile/test/unit/core/ping/ping_result_test.dart
    - mobile/test/unit/core/ping/libbox_ping_service_test.dart
    - mobile/test/unit/core/ping/socket_ping_service_test.dart
    - mobile/test/unit/core/ping/ping_repository_test.dart
  modified: []

key-decisions:
  - "D-06 gate confirmed by the user as `locked`: ping primary = libbox.urltest HTTP-through-outbound with fixed generate_204 via real URLTest(outboundTag) + async WriteGroups URLTestDelay; NOT ICMP, NOT libbox_urltest, NOT synchronous RTT"
  - "The silent approx fallback is owned by PingRepository: LibboxPingService returns null on unavailable/config-rejected/0,0, then Socket.connect runs with approx=true and no UI indication"
  - "0,0 (offline plus zero delay) maps to fallback; an online sample with rttMs == 0 is kept as a real 0 ms observation"
  - "No load field anywhere; rankBest is RTT-only, stable, and separate from fullPing (REQ-PING-06 deferred, D-04)"
  - "PingTarget carries a String port (int.tryParse at the boundary) and a minimal outbound map; PingCacheDao implements both cache interfaces in 19-04"

patterns-established:
  - "PingResult/PingClass: offline or missing/negative RTT => offline; inclusive 60/110/180 thresholds"
  - "quickPath dedupes and caps the most-recent last-good at 3; an empty or all-offline set returns null so fullPing runs"
  - "fullPing preserves input order; rankBest is the separate RTT-ascending ranking used later by bestServerProvider"

requirements-completed: [REQ-PING-01, REQ-PING-02, REQ-PING-03, REQ-PING-04, REQ-PING-06]

coverage:
  - id: D1
    description: "PingResult freezed model and pingClass thresholds with offline handling"
    requirement: REQ-PING-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/ping_result_test.dart#pingClass thresholds / JSON round-trip / approx metadata"
        status: pass
    human_judgment: false
  - id: D2
    description: "LibboxPingService uses real URLTest(srv-<id>) with async RTT, 0,0 => offline, no-TUN config and WireGuard endpoint placement"
    requirement: REQ-PING-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/libbox_ping_service_test.dart#URLTestDelay / 0,0 / async future / no-TUN config / WG endpoint"
        status: pass
    human_judgment: false
  - id: D3
    description: "Silent approx TCP fallback: IPv6 strip, int.tryParse, socket.destroy, SocketException/TimeoutException => offline"
    requirement: REQ-PING-01
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/socket_ping_service_test.dart#IPv6 / bad ports / exceptions / destroy / timeout"
        status: pass
    human_judgment: false
  - id: D4
    description: "pingServer checks fresh 60s cache first, then libbox, then the silent fallback, and writes through the injected boundaries"
    requirement: REQ-PING-04
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/ping_repository_test.dart#pingServer fresh cache / libbox mapping / approx flags"
        status: pass
    human_judgment: false
  - id: D5
    description: "quickPath <=3 last-good at 800ms and fullPing at 2000ms with bounded concurrency, per-result callbacks, serialized urltests and generation cancellation"
    requirement: REQ-PING-02
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/ping_repository_test.dart#quickPath / fullPing concurrency / timeouts / serialization / cancellation"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full ping never fabricates a server; all-offline yields empty ranking and best ordering is a separate stable RTT-only step"
    requirement: REQ-PING-06
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/ping_repository_test.dart#all-offline / separate rankBest / stable tie-break"
        status: pass
    human_judgment: false
  - id: D7
    description: "libbox URLTest reaches a real outbound on a device with the native shim present"
    requirement: REQ-PING-01
    verification: []
    human_judgment: true
    rationale: "Native artifacts are gitignored CI outputs and Android JDK/SDK is absent in this env; on-device real-outbound RTT cannot be exercised here. The silent approx fallback keeps the app functional meanwhile."

duration: 9min
completed: 2026-11-27
status: complete
---

# Phase 19 Plan 03: Ping service, repository and tests Summary

**Real libbox `URLTest(tag)` ping with silent `Socket.connect` fallback, quick/full paths, bounded cancellation and RTT-only best ordering — 32 deterministic unit tests, no simulation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-27T03:48:37Z
- **Completed:** 2026-11-27T03:58:05Z
- **Tasks:** 3 implementation tasks (+ 1 D-06 decision gate confirmed `locked` by the user)
- **Files created:** 10 (4 production sources, 2 generated, 4 test files)

## Accomplishments

- `PingResult` freezed model with `pingClass` buckets (good <=60, mid <=110, warn <=180, bad, offline), `approx` internal metadata and injectable epoch-ms clock.
- `LibboxPingService` calls the 19-02 `LibboxPingCore.urltest(tag)` surface for a real `generate_204` probe through the outbound, reads async `WriteGroups` RTT, treats `0,0` as offline, builds a minimal no-TUN sing-box 1.14 config (WireGuard as endpoint), and never logs config or secrets.
- `SocketPingService` performs a real TCP connect RTT with IPv6 bracket stripping, `InternetAddress.tryParse`, `int.tryParse` port validation and `socket.destroy()`, mapping `SocketException`/`TimeoutException` to offline — silent and marked `approx=true`.
- `PingRepository` implements fresh 60 s cache lookup, libbox-first ping with silent fallback, `quickPath` (<=3 last-good, 800 ms), `fullPing` (all in tab, 2000 ms, concurrency 10-16, per-result + final), generation-based cancellation, serialized native calls and injected `PingCacheWriter`/`PingCacheLookup`.
- 32 unit tests with fake libbox client, fake socket connector and fake clock; `flutter analyze` reports 0 errors and 0 issues in the plan's files; build_runner generation is clean.

## Task Commits

1. **Task 1 (`checkpoint:decision`, gate `blocking`):** D-06 confirmed by the user as `locked` — no code commit (decision gate).
2. **Task 2 (`tracer`): end-to-end ping slice** — `c6583e4` (feat)
3. **Task 3: ping layer unit tests + build_runner** — `5a06054` (fix, RTT-0 edge) + `aacac78` (test)
4. **Task 4: full ping + best-ordering test slice** — `2f197f5` (test)

**Plan metadata:** recorded in the final docs commit.

_Note: the shared-ID gate (`requirements.ready-ids`) reported 0/5 requirements ready because sibling plans 19-04..19-08 declare the same REQ-PING IDs without a SUMMARY yet; the checkboxes flip when the last declaring plan finishes._

## Files Created/Modified

- `mobile/lib/core/ping/ping_result.dart` — `PingResult`, `PingClass`, `pingClass`, `PingClock`.
- `mobile/lib/core/ping/ping_result.freezed.dart`, `ping_result.g.dart` — generated by build_runner.
- `mobile/lib/core/ping/libbox_ping_service.dart` — `LibboxPingClient`, `LibboxCoreClient`, `LibboxPingService`, `generate204Url`, no-TUN config builder.
- `mobile/lib/core/ping/socket_ping_service.dart` — `SocketConnector`, `SocketPingService`.
- `mobile/lib/core/ping/ping_repository.dart` — `PingTarget`, `PingCacheEntry`, `PingCacheWriter`, `PingCacheLookup`, `PingOutcome`, `rankBest`, `PingRepository`.
- `mobile/test/unit/core/ping/ping_result_test.dart` — thresholds, JSON, approx metadata.
- `mobile/test/unit/core/ping/libbox_ping_service_test.dart` — async urltest, `0,0`, tag, config, WG endpoint.
- `mobile/test/unit/core/ping/socket_ping_service_test.dart` — IPv6, ports, exceptions, destroy, timeout.
- `mobile/test/unit/core/ping/ping_repository_test.dart` — single path, cache, quick/full paths, concurrency, cancellation, ordering.

## Decisions Made

- D-06 gate: user selected `locked` — HTTP-through-outbound `libbox.urltest` with fixed `generate_204`, real `URLTest(outboundTag) error` plus async `WriteGroups.URLTestDelay`; no ICMP, no `libbox_urltest`, no synchronous RTT.
- The `approx` fallback is silent by construction: `LibboxPingService` returns `null`, and only `PingRepository` decides to run `Socket.connect`; `PingResult.approx` is metadata, never a UI bucket.
- An online sample with `rttMs == 0` is a real observation; only `online:false, rttMs:0` (`0,0`) triggers the fallback.
- `PingResult` has no `load` field. `rankBest` is stable RTT-ascending and separate from `fullPing`; REQ-PING-06's `load` tie-break stays deferred (D-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Online 0 ms urltest sample was forced offline**
- **Found during:** Task 3 (writing the RTT-0 edge test)
- **Issue:** `LibboxPingService` treated any `rttMs <= 0` as offline, conflating a real 0 ms sample with the `0,0` no-history/failed case.
- **Fix:** Only `!sample.online` triggers the silent fallback; an online 0 ms sample is returned with `rttMs: 0`.
- **Files modified:** `mobile/lib/core/ping/libbox_ping_service.dart`
- **Verification:** New `an online 0 ms sample is kept` test plus the `0,0` test pass; 32/32 ping tests green.
- **Committed in:** `5a06054`

**2. [Rule 2 - Missing Critical] Added `PingCacheLookup` boundary**
- **Found during:** Task 2 (tracer implementation)
- **Issue:** The plan names only `PingCacheWriter`, but REQ-PING-04 requires a fresh-cache (TTL 60 s) lookup before pinging; no read seam existed for 19-04's DAO or tests.
- **Fix:** Added the `PingCacheLookup.fresh(...)` interface alongside `PingCacheWriter`; `PingRepository` takes both as optional injection points.
- **Files modified:** `mobile/lib/core/ping/ping_repository.dart`
- **Verification:** `uses fresh cache first and does not re-ping` test passes with a fake cache.
- **Committed in:** `c6583e4`

**3. [Rule 1 - Lint] Analyzer infos in new Dart files**
- **Found during:** Tasks 2-3 (verification)
- **Issue:** Initial drafts emitted `comment_references`, `prefer_initializing_formals`, `always_put_required_named_parameters_first`, `directives_ordering` and mocktail `namedArguments` key infos.
- **Fix:** Reworded the cross-library doc reference, used initializing formals with public final fields, reordered freezed named parameters and imports, and used `Symbol` keys (`#timeout`) for mocktail named arguments.
- **Files modified:** the four production sources and four test files under `mobile/`.
- **Verification:** `flutter analyze` reports 0 issues in `lib/core/ping/**` and `test/unit/core/ping/**`, 0 errors overall.
- **Committed in:** `c6583e4`, `aacac78`

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2). **Impact on plan:** No scope creep; all fixes were required for correct ping semantics, cache lookup and lint-clean code.

## Issues Encountered

- The D-06 blocking decision gate halted the first executor session; the user explicitly selected `locked`, and execution resumed without auto-approval.
- `flutter analyze` still exits 1 with ~1593 pre-existing `info` lints in unrelated phase-18 auth widget tests (0 errors, 0 issues in this plan's files). Per the scope-boundary rule these were not fixed.
- `npx tsc --noEmit` fails on the pre-existing untracked `app/admin/promos/page.tsx` (missing `./PromosApp`); no backend file was touched by this plan. Both are out of scope.
- Unrelated admin files (`app/admin/promos/*`, `lib/admin-promos-directory.ts`, `next-env.d.ts`) were modified/untracked by another process during execution and were deliberately left untouched and unstaged.

## User Setup Required

None — no external service configuration required for this plan. Native artifacts remain gitignored CI outputs; the silent TCP fallback keeps the app functional until they are built.

## Threat Flags

None new. Implementation stays inside the PLAN threat register: fixed `generate_204`, trusted `srv-<id>` tags, no TUN, no config/link/secret logging, scheme/address validation at the TCP boundary, no simulation, no new dependency, no schema change. GPL-3.0 remains an accepted external blocker (Phase 23).

## Known Stubs

None. The absent native binaries are intentional gitignored CI artifacts, not code stubs; the silent `Socket.connect` fallback is fully implemented here.

## Next Phase Readiness

- 19-04 can implement `PingCacheDao` against `PingCacheWriter` (`write`) and `PingCacheLookup` (`fresh`) with the `PingCacheEntry` row shape and 60 s TTL; the DAO is the missing Drift implementation.
- 19-06 maps `Server` onto `PingTarget` (`port.toString()`, existing `srv-<id>` outbound) and applies `rankBest` in `bestServerProvider`; no tunnel/FSM is started here (Phase 20).
- Open risk: on-device real-outbound URLTest and per-ABI native packaging remain unverified in this environment (already recorded in `.planning/WINDOWS.md` id 14).

---

## Self-Check: PASSED

- All 10 plan-created source/generated/test files plus `19-03-SUMMARY.md` are present on disk.
- All 4 task commits verified in `git log` (`c6583e4`, `5a06054`, `aacac78`, `2f197f5`).
- Task commits contain no tracked-file deletions.
- Final verification rerun: `dart run build_runner build --delete-conflicting-outputs` clean; `flutter analyze` 0 errors and 0 issues in `lib/core/ping/**` / `test/unit/core/ping/**`; `flutter test test/unit/core/ping/` 32/32 pass; prohibition scan finds no simulation, `libbox_urltest`, `/pricing`, `load` field or secret logging in implementation code.

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*
