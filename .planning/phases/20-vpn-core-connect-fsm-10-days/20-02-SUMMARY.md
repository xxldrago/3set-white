---
phase: 20-vpn-core-connect-fsm-10-days
plan: 02
subsystem: mobile
tags: [dart-ffi, ffigen, sing-box, libbox, go-c-shared, tun, traffic, write-status, flutter, no-simulation]

# Dependency graph
requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "Own C-shared sing-box v1.14.4 shim, committed libbox_shim.h, ffigen config and serialized LibboxPingCore (D-08)"
  - phase: 20-vpn-core-connect-fsm-10-days
    provides: "20-01 /api/mobile/config returns the complete TUN config consumed by startWithTun"
provides:
  - "libbox_start_with_tun(int32_t fd, char* config) and libbox_traffic() C exports from the own Go shim"
  - "Regenerated libbox_shim.h + ffigen.yaml include list + LibboxBindings (startWithTun/traffic)"
  - "LibboxPingCore.startWithTun(fd, config) and traffic() -> TrafficSnapshot behind the existing _serialized/_takeString discipline"
  - "Go/Dart host tests: full TUN CheckConfig vector, generic-error discipline, lossless int64 decode, serialization"
affects:
  - "Phase 20 plans 03-07: Android VpnService fd handoff, connection FSM, restart backoff and Connected Panel consume this ABI"

# Actuals (#2632) — same chars/4 scale as the plan estimate (50000 tokens).
actuals:
  tokens: 7436
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One C-shared shim, two config modes: no-TUN generate_204 ping path stays byte-for-byte functional alongside the TUN path"
    - "Platform-owned fd; libbox queries the TUN name from it and dups it internally — no Kotlin-side dup, no fd stored in Dart"
    - "Traffic counters captured in WriteStatus under the existing mutex with AddCommand(CommandStatus=1); raw int64 crosses FFI losslessly"
    - "Generated ABI chain only: Go //export -> build.sh host header -> ffigen.yaml -> generated bindings; never hand-written"
    - "Generic C/Dart error strings only; config, links, secrets and fd numbers never cross or get logged"

key-files:
  created:
    - mobile/native/libbox_shim/main_test.go
    - mobile/test/unit/core/ping/libbox_core_tun_test.dart
  modified:
    - mobile/native/libbox_shim/main.go
    - mobile/native/libbox_shim/libbox_shim.h
    - mobile/lib/core/ping/ffigen.yaml
    - mobile/lib/core/ping/generated/libbox_bindings.dart
    - mobile/lib/core/ping/libbox_core.dart

key-decisions:
  - "D-05 confirmed by the user at the blocking decision gate as own-c-shared (locked): TUN fd enters libbox through our own C-shared Go shim, regenerated via build.sh header + ffigen; NOT gomobile, NOT sing-ffi, NOT a community package, NOT libbox_urltest"
  - "D-08 preserved: the no-TUN generate_204 ping path (libbox_start + urltest/urltest_take) remains intact — one shim, two config modes"
  - "fd stays platform-owned and libbox dups it; no reset export before CI evidence; no dummy-fd invocation in any test"
  - "Traffic contract is {down:int64, up:int64, available:bool} from StatusMessage DownlinkTotal/UplinkTotal/TrafficAvailable via WriteStatus; no fabricated bytes"
  - "A no-TUN service is stopped before a TUN session starts so libbox uses the fd-carrying platform rather than the inert ping platform"

patterns-established:
  - "C ABI regeneration is idempotent: header grep + shasum-stable ffigen output + git diff --exit-code on generated bindings"
  - "Test-only injectable LibboxTrafficBridge seam exercises the real _serialized/_takeString path without loading native code"

requirements-completed: [REQ-CONN-04, REQ-CONN-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Own C-shared shim exports libbox_start_with_tun(int32_t fd, char* cfg) and libbox_traffic() alongside phase-19 symbols"
    requirement: REQ-CONN-04
    verification:
      - kind: other
        ref: "cd mobile/native/libbox_shim && ./build.sh host && nm -gU ../build/libboxshim.dylib | grep -E '_libbox_start_with_tun|_libbox_traffic'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Commited libbox_shim.h and ffigen bindings contain both new exports; regeneration is byte-idempotent"
    requirement: REQ-CONN-04
    verification:
      - kind: other
        ref: "dart run ffigen --config lib/core/ping/ffigen.yaml && git diff --exit-code -- lib/core/ping/generated/libbox_bindings.dart"
        status: pass
    human_judgment: false
  - id: D3
    description: "LibboxPingCore exposes startWithTun/traffic, decodes lossless int64 counters, zeroes on unavailable/missing, and serializes native calls"
    requirement: REQ-CONN-07
    verification:
      - kind: unit
        ref: "mobile/test/unit/core/ping/libbox_core_tun_test.dart#7 tests; flutter test 7/7; flutter test test/unit/core/ping/ 45/45"
        status: pass
    human_judgment: false
  - id: D4
    description: "Go test accepts the smoke-proven full TUN config and asserts generic errors never echo a config fragment; no dummy-fd call exists"
    requirement: REQ-CONN-04
    verification:
      - kind: unit
        ref: "mobile/native/libbox_shim/main_test.go#TestCheckConfigAcceptsFullTUNConfig, TestGenericErrorMessageNeverEchoesConfigFragment; go test ./... ok"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real Android VpnService fd path, per-ABI .so/.dylib artifacts and on-device traffic counters"
    requirement: REQ-CONN-04
    verification: []
    human_judgment: true
    rationale: "External blockers: no OpenJDK 17 / Android SDK/NDK in this environment and a non-TUN fd aborts the process (exit 134). Only a real platform TUN fd may be used; CI/on-device verification is required."

# Metrics
duration: 10 min
completed: 2026-11-27
status: complete
---

# Phase 20 Plan 02: VPN Core TUN FFI Slice Summary

**Own C-shared shim extended with `libbox_start_with_tun(int32_t fd, char* config)` and `libbox_traffic()` counters, regenerated ffigen bindings, and a serialized Dart facade — one shim, two config modes**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-27T08:57:00Z
- **Completed:** 2026-11-27T09:07:17Z
- **Tasks:** 3 (1 blocking decision gate + 1 tracer + 1 auto)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- Extended the phase-19 own C-shared Go shim with a TUN-mode `PlatformInterface` (`tunPlatform.OpenTun` returns the platform-owned fd; libbox queries the name from it and dups it internally) and the `libbox_start_with_tun(int32_t fd, char* cfg)` export, with only fixed generic errors crossing FFI.
- Added real traffic counters: `WriteStatus(*StatusMessage)` captures `TrafficAvailable/UplinkTotal/DownlinkTotal` under the existing mutex, `AddCommand(CommandStatus=1)` subscribes to them, and `libbox_traffic()` returns `{down,up,available}` JSON with lossless int64 values — no simulation.
- Regenerated the committed C ABI header via `./build.sh host` and the ffigen bindings from an extended include list; verified `nm -gU` exposes both new symbols and that a second ffigen run is byte-identical.
- Added `LibboxPingCore.startWithTun(fd, config)` and `traffic() -> TrafficSnapshot` using the existing `_serialized` Completer tail, `toNativeUtf8`/`calloc.free` ownership and `LibboxConfigException` discipline; the fd is never stored or logged.
- Kept the no-TUN `generate_204` ping path (`init/start/stop/urltest/dispose`) functional — no new dependency, no gomobile, no community package, no `libbox_urltest`.
- Added host tests: Go full-TUN `CheckConfig` vector with exact research values, generic-error assertion, and 7 Dart tests covering lossless counters, zero fallbacks, injection seam and serialization.

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint:decision, gate blocking): D-05 TUN fd handoff via own C-shared shim** — no file changes; the user explicitly selected `own-c-shared` (locked). Decision recorded here and in STATE.md; not auto-approved.
2. **Task 2 (tracer): two-mode shim + regenerated ABI/bindings + Dart facade** — `f4027ef` (feat)
3. **Task 3 (auto): Go and Dart host tests** — `7b101df` (test)

**Plan metadata:** see final `docs(20-02): complete ...` commit.

## Files Created/Modified

- `mobile/native/libbox_shim/main.go` — `tunPlatform`, `libbox_start_with_tun`, `libbox_traffic`, `WriteStatus` capture, `CommandStatus` subscription, shared stop helper and Go-side C-string test seam.
- `mobile/native/libbox_shim/libbox_shim.h` — regenerated C ABI emitted by `build.sh host`; adds both new exports.
- `mobile/lib/core/ping/ffigen.yaml` — include list extended with `libbox_start_with_tun` and `libbox_traffic`.
- `mobile/lib/core/ping/generated/libbox_bindings.dart` — regenerated `LibboxBindings` (never hand-written).
- `mobile/lib/core/ping/libbox_core.dart` — `TrafficSnapshot`, `decodeTrafficSnapshot`, injectable `LibboxTrafficBridge`, `startWithTun` and `traffic`.
- `mobile/native/libbox_shim/main_test.go` — Go full-TUN vector, exact-value assertions and generic-error test; no dummy fd.
- `mobile/test/unit/core/ping/libbox_core_tun_test.dart` — 7 Dart unit tests for decode, zero fallbacks, serialization and safe exceptions.

## Decisions Made

- **D-05 (user-confirmed at the blocking gate):** own C-shared shim + ffigen; fd native-owned, libbox dups it, no Kotlin-side dup, no reset export before CI evidence, no dummy-fd test.
- **D-08:** one shim, two config modes — the `generate_204` ping path is untouched and TUN is additive.
- **D-17/REQ-CONN-07:** traffic counters are read from libbox `StatusMessage`, not from ping RTT fields; `{down,up,available}` is a separate JSON contract.
- **D-19/D-20:** only generic messages cross FFI; the Dart decoder zeroes stale/missing counters instead of fabricating bytes; no config, link, secret or fd number is logged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Stop any existing no-TUN service before a TUN session**
- **Found during:** Task 2 (tracer implementation)
- **Issue:** `libbox_start` creates its `CommandServer` with the inert `noopPlatform`; reloading a TUN config into that server would call `OpenTun` on a platform with no fd, so the tunnel could never start.
- **Fix:** factored `stopServiceLocked()` out of `libbox_stop` and call it at the start of `libbox_start_with_tun` before creating the fd-carrying command server.
- **Files modified:** `mobile/native/libbox_shim/main.go`
- **Verification:** `./build.sh host`, `nm -gU`, `go test ./...` all green; ping path unchanged.
- **Committed in:** `f4027ef`

**2. [Rule 3 - Blocking] cgo cannot be imported from `_test.go` files**
- **Found during:** Task 3 (Go generic-error test)
- **Issue:** the plan's generic-error assertion needs to read the `*C.char` returned by `libbox_check_config`, but Go forbids `import "C"` in test files.
- **Fix:** added a small non-exported Go-side seam `checkConfigErrorText` in `main.go` that converts the returned C string (and frees both buffers); the test asserts the fixed generic message and absence of the config fragment.
- **Files modified:** `mobile/native/libbox_shim/main.go`, `mobile/native/libbox_shim/main_test.go`
- **Verification:** `go test ./...` passes both error-discipline and full-TUN vectors.
- **Committed in:** `7b101df`

---

**Total deviations:** 2 auto-fixed (1 Rule 2 correctness, 1 Rule 3 test infrastructure). **Impact on plan:** no scope creep, no new dependency and no security-behavior change; both were required for the TUN ABI to actually work and be testable.

## Issues Encountered

- `flutter analyze` exits non-zero with 1622 pre-existing `info`/`warning` lints in unrelated files; **0 errors and 0 issues in 20-02 files**. Per the scope-boundary rule these were not fixed. `npx prisma validate` is green (unrelated in-progress schema edits in the working tree are valid).
- The blocking D-05 gate halted the first executor session with no production commits; the user selected `own-c-shared` explicitly and execution resumed without auto-approval.
- Real TUN fd / per-ABI native artifacts / on-device counters remain unverified here (external blockers); recorded in `.planning/WINDOWS.md` as `unrun-verify`.

## Authentication Gates

None. No CLI/credential gate occurred.

## User Setup Required

None — no external service configuration is introduced by this plan. Native artifacts remain gitignored CI outputs built by `mobile/native/libbox_shim/build.sh`.

## Known Stubs

None. The `TrafficSnapshot.zero()` fallback is an intentional safe default for unavailable counters, not a placeholder; all real values come from libbox `StatusMessage`.

## Threat Flags

None new. All changes stay inside the plan's threat register (T-20-05, T-20-06, T-20-SC, T-20-GPL): no dummy fd, generic errors only, no package install, and GPL-3.0 remains an accepted external blocker (Phase 23).

## Next Phase Readiness

- Ready for native platform work: Android `VpnService` can pass the real `establish()` fd to `libbox_start_with_tun` and the FSM can poll `traffic()` for the Connected Panel.
- Remaining external checks: on-device TUN fd path, per-ABI `.so`/`.dylib` CI artifacts and live traffic counters; iOS fd acquisition stays `[ASSUMED]`/compile-only until entitlement approval.

## Self-Check: PASSED

- All 7 created/modified source files exist on disk.
- Task commits `f4027ef` and `7b101df` are present in `git log`.
- `./build.sh host` exit 0; `nm -gU` shows both `_libbox_start_with_tun` and `_libbox_traffic`.
- `go test ./...` ok; `flutter test test/unit/core/ping/libbox_core_tun_test.dart` 7/7; full ping suite 45/45.
- `dart run ffigen` idempotent (shasum identical, `git diff --exit-code` clean); `flutter analyze` 0 errors / 0 issues in 20-02 files; `npx prisma validate` valid.
- No `libbox_urltest`, gomobile, community package, dummy-fd call, `Math.random`/fake traffic, or config/secret/fd logging in the new code.

---
*Phase: 20-vpn-core-connect-fsm-10-days*
*Completed: 2026-11-27*
