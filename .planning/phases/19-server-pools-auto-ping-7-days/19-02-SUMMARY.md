---
phase: 19-server-pools-auto-ping-7-days
plan: 02
subsystem: mobile
tags: [dart-ffi, ffigen, sing-box, libbox, go-c-shared, urltest, writegroups, wireguard, no-tun, flutter]

requires:
  - phase: 19-server-pools-auto-ping-7-days
    provides: "19-01 Server/outbound model and minimal sing-box outbound shape (outbound tag srv-<id>, WireGuard as 1.14 endpoint) consumed by the ping config"
provides:
  - "Own C-shared sing-box v1.14.4 libbox shim: libbox_setup/check_config/start/stop, urltest/urltest_take, libbox_free_string"
  - "Real CommandClient.URLTest(outboundTag) trigger with async WriteGroups URLTestDelay/URLTestTime capture (CommandGroup=2, 0,0 => offline)"
  - "ffigen-generated bindings from a committed C ABI header + LibboxPingCore singleton (init/start/stop/urltest/dispose), serialized"
  - "Per-ABI native build script (Android arm64-v8a/armeabi-v7a, iOS arm64) + ffi/ffigen dependencies"
affects:
  - "Phase 19 plan 19-03 (PingRepository calls LibboxPingCore.urltest and owns the silent Socket.connect fallback) and phase 20 (VPN tunnel)"

actuals:
  tokens: 33198
  tasks: 1
  commits: 1

tech-stack:
  added:
    - "ffi ^2.2.0 (required by ffigen 23; ^1 constraint was unresolvable)"
    - "ffigen ^23.0.0 (dev) + generated libbox_bindings.dart"
    - "Go 1.25.5 toolchain + github.com/sagernet/sing-box v1.14.4/experimental/libbox"
  patterns:
    - "Own minimal C-shared Go shim + ffigen instead of gomobile / sing-ffi / community packages"
    - "URLTest(outboundTag) trigger only; RTT read asynchronously from OutboundGroupItem.URLTestDelay/URLTestTime"
    - "Serialized native calls through a Dart Completer tail; DynamicLibrary.open on Android, DynamicLibrary.process on iOS"
    - "Generic error strings only: sing-box errors may echo config fragments, so config/secrets never leave Dart or Go"

key-files:
  created:
    - mobile/native/libbox_shim/main.go
    - mobile/native/libbox_shim/go.mod
    - mobile/native/libbox_shim/go.sum
    - mobile/native/libbox_shim/libbox_shim.h
    - mobile/native/libbox_shim/build.sh
    - mobile/lib/core/ping/ffigen.yaml
    - mobile/lib/core/ping/generated/libbox_bindings.dart
    - mobile/lib/core/ping/libbox_core.dart
  modified:
    - mobile/pubspec.yaml
    - mobile/pubspec.lock
    - mobile/.gitignore

key-decisions:
  - "D-08 gate confirmed by the user as own-shim: own minimal C-shared Go shim + ffigen; sing-box v1.14.4; NOT gomobile-via-ffigen, NOT sing-ffi _new, NOT a community sing-box Flutter package, NOT a sing-box-provided URLTest C symbol"
  - "URLTest(outboundTag) returns only error; RTT is async via CommandClientHandler.WriteGroups -> OutboundGroupItem.URLTestDelay (int32 ms) / URLTestTime (int64 s), CommandGroup=2; 0,0 means no history or failed-then-cleared => offline"
  - "Minimal sing-box 1.14 no-TUN config (log/dns/inbounds/endpoints/outbounds/route), CheckConfig before start, WireGuard as endpoint, NEW DNS format, with_utls for Reality; no config/secrets logged"
  - "Native binaries are gitignored CI artifacts; the silent Socket.connect fallback is intentionally owned by plan 19-03, not this plan"
  - "ffigen 23 YAML config is deprecated but still supported; kept ffigen.yaml per plan rather than migrating to the programmatic generator API"

patterns-established:
  - "C ABI is committed as libbox_shim.h (emitted by build.sh) so ffigen runs without a Go build; generated bindings carry ffigen's own ignore_for_file header"
  - "urltest tail-waits for a real WriteGroups update up to timeoutMs; no polling of fake data, no Math.random, no sleep, no ICMP"
  - "All C strings allocated with toNativeUtf8 and freed in finally; returned C strings freed through libbox_free_string"

requirements-completed: [REQ-PING-01]

coverage:
  - id: D1
    description: "Own C-shared shim builds and exports libbox_setup/check_config/start/stop, urltest/urltest_take and libbox_free_string against sing-box v1.14.4"
    requirement: REQ-PING-01
    verification:
      - kind: other
        ref: "cd mobile/native/libbox_shim && go build -trimpath -buildmode=c-shared -tags 'with_gvisor,with_quic,with_wireguard,with_utls,with_naive_outbound,with_clash_api,badlinkname,tfogo_checklinkname0' -ldflags '-X github.com/sagernet/sing-box/constant.Version=1.14.4 -s -w -buildid= -checklinkname=0' -o /tmp/libboxshim.dylib ."
        status: pass
    human_judgment: false
  - id: D2
    description: "ffigen config generates LibboxBindings from the committed C ABI header; generation is idempotent"
    requirement: REQ-PING-01
    verification:
      - kind: other
        ref: "cd mobile && dart run ffigen --config lib/core/ping/ffigen.yaml (no diff in generated/libbox_bindings.dart on re-run)"
        status: pass
    human_judgment: false
  - id: D3
    description: "LibboxPingCore exposes init/start/config-validate/urltest/dispose, serializes urltests and adds no analyzer issues"
    requirement: REQ-PING-01
    verification:
      - kind: other
        ref: "cd mobile && flutter pub get && dart run build_runner build --delete-conflicting-outputs && flutter analyze (0 issues in lib/core/ping/**; 0 errors overall)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Native .so/.xcframework artifacts exist on a real device and libbox URLTest reaches a real outbound"
    requirement: REQ-PING-01
    verification: []
    human_judgment: true
    rationale: "Android build is blocked in this env (no OpenJDK 17 / Android SDK) and iOS artifacts are CI-built; on-device URLTest cannot be exercised here. Plan 19-03 ships the silent TCP fallback when the artifact is absent."

duration: 11min
completed: 2026-11-27
status: complete
---

# Phase 19 Plan 02: Native libbox ping slice Summary

**Own C-shared sing-box v1.14.4 shim + ffigen bindings + LibboxPingCore using real `URLTest(outboundTag)` and async `WriteGroups` RTT — no ICMP, no simulation, no secrets in logs**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-11-27T03:34:00Z
- **Completed:** 2026-11-27T03:43:30Z
- **Tasks:** 1 implementation task (the D-08 `checkpoint:decision` gate is non-implementation)
- **Files committed:** 11 (8 created in this plan, 3 modified)

## Accomplishments

- Built and compiled a minimal C-shared Go shim on `github.com/sagernet/sing-box/experimental/libbox` v1.14.4. Exports `libbox_setup`, `libbox_check_config`, `libbox_start`, `libbox_stop`, `urltest`, `urltest_take`, `libbox_free_string` from `package main` with no gomobile, no sing-ffi and no community package.
- Implemented the honest ping contract: `CommandClient.URLTest(outboundTag) error` is the trigger; RTT is captured from the asynchronous `CommandClientHandler.WriteGroups` stream via `OutboundGroupItem.URLTestDelay`/`URLTestTime`, `AddCommand(CommandGroup=2)`, with `0,0` treated as no-history/failed => offline. No RTT return value, no ICMP, no fake measurement.
- Wired a no-op `PlatformInterface` and `CommandServerHandler`, `libbox.Setup`, `CheckConfig`, `NewCommandServer` + `StartOrReloadService`, `NewCommandClient` + `Connect`, all on a no-TUN config validated before start.
- Generated `LibboxBindings` with ffigen 23 from the committed C header emitted by the shim build; `DynamicLibrary.open("libboxshim.so")` on Android and `DynamicLibrary.process()` on iOS.
- Delivered `LibboxPingCore` singleton (`init`, `start`, `stop`, `urltest`, `dispose`), serializing native calls and freeing every C string; configuration and outbound secrets are never logged or propagated in errors.
- Added `ffi`/`ffigen` dependencies (sorted) and `build.sh` for host dylib, Android `arm64-v8a`/`armeabi-v7a` and iOS `arm64`; native binaries are gitignored CI outputs.

## Task Commits

Each task was committed atomically:

1. **Task 1 (`checkpoint:decision`, gate `blocking`):** D-08 confirmed by the user as `own-shim` — no code commit (decision gate; resumed in this session).
2. **Task 2 (`tracer`): End-to-end native ping skeleton** — `32e413c` (feat)

**Plan metadata:** pending final docs commit (SUMMARY.md + STATE.md + ROADMAP.md + deferred-items ledger).

## Files Created/Modified

- `mobile/native/libbox_shim/main.go` — C-shared shim; no-op platform/server handlers; URLTest handler capturing WriteGroups into a tag-keyed record; `urltest` waits for the real async update up to `timeoutMs`.
- `mobile/native/libbox_shim/go.mod`, `go.sum` — Go 1.25.5 module pinned to sing-box v1.14.4 with resolved dependencies.
- `mobile/native/libbox_shim/libbox_shim.h` — committed C ABI contract generated by c-shared; ffigen input.
- `mobile/native/libbox_shim/build.sh` — per-ABI builds with all sing-box build tags, `-X .../constant.Version=1.14.4` and `-checklinkname=0`.
- `mobile/lib/core/ping/ffigen.yaml` — ffigen config (paths relative to the config file).
- `mobile/lib/core/ping/generated/libbox_bindings.dart` — generated `LibboxBindings` (excluded from scope budget; ffigen's own `ignore_for_file` header keeps the analyzer quiet).
- `mobile/lib/core/ping/libbox_core.dart` — `LibboxPingCore` plus `LibboxUnavailableException`, `LibboxConfigException`, `LibboxUrltestResult`.
- `mobile/pubspec.yaml`, `mobile/pubspec.lock` — `ffi ^2.2.0` + dev `ffigen ^23.0.0`; dependency lists sorted.
- `mobile/.gitignore` — gitignore for CI-built `.so`/`.dylib`/xcframework outputs while tracking Go sources and the header.
- `.planning/phases/19-server-pools-auto-ping-7-days/deferred-items.md` — out-of-scope pre-existing failures and intentionally unrun native builds.

## Decisions Made

- The user selected `own-shim` at the D-08 blocking decision gate. Alternatives (gomobile + platform channels, community `flutter_sing_box`/`singbox_ffi`) were rejected: not ffigen, no `URLTest`, unverified pub legitimacy and/or contradiction of D-08.
- `ffi ^2.2.0` instead of `^1.0.0`: ffigen 23 requires `ffi ^2.0.1`; `flutter pub get` failed until the constraint was raised.
- Kept the deprecated-but-supported YAML ffigen config because the plan explicitly names `ffigen.yaml`; migration to the programmatic `FfiGenerator` API is deferred.
- Native error strings are generic on both sides of the FFI boundary because sing-box errors can echo configuration fragments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ffi ^1.0.0` conflicted with ffigen 23**
- **Found during:** Task 2 (dependency setup)
- **Issue:** `flutter pub get` failed: `ffigen >=6.0.2 depends on ffi ^2.0.1`; the plan only said "add ffi".
- **Fix:** Raised the constraint to `ffi ^2.2.0` (same lock resolution the pub solver suggested).
- **Files modified:** `mobile/pubspec.yaml`, `mobile/pubspec.lock`
- **Verification:** `flutter pub get` resolves ffi 2.2.0 + ffigen 23.0.0; build_runner and analyze pass.
- **Committed in:** `32e413c`

**2. [Rule 3 - Missing critical artifact] Committed C ABI header and go.sum**
- **Found during:** Task 2 (ffigen setup)
- **Issue:** The plan lists `ffigen.yaml` but ffigen needs a header; c-shared emits it as a build artifact, and `go.sum` is required for reproducible Go builds. Neither was in `files_modified`.
- **Fix:** Committed `libbox_shim.h` (the emitted ABI contract, regenerated by `build.sh`) and `go.sum`; added gitignore rules so the actual binaries stay untracked.
- **Files modified:** `mobile/native/libbox_shim/libbox_shim.h`, `go.sum`, `mobile/.gitignore`
- **Verification:** `go build -buildmode=c-shared` succeeds; ffigen regenerates byte-identical bindings from the committed header.
- **Committed in:** `32e413c`

**3. [Rule 1 - Lint] Two analyzer infos in the new Dart file**
- **Found during:** Task 2 (verification)
- **Issue:** `prefer_relative_imports` on the generated-bindings import and `cascade_invocations` on three consecutive `calloc.free(...)` calls.
- **Fix:** Switched to a relative import and used a `calloc..free(..)..free(..)..free(..)` cascade.
- **Files modified:** `mobile/lib/core/ping/libbox_core.dart`
- **Verification:** `flutter analyze` reports 0 issues in `lib/core/ping/**` and 0 errors overall.
- **Committed in:** `32e413c`

---

**Total deviations:** 3 auto-fixed (2 Rule 3 missing critical/blocking, 1 Rule 1 lint). **Impact on plan:** No scope creep; native ping slice behavior matches the locked constraints exactly.

## Issues Encountered

- The D-08 blocking decision gate halted the first executor session; the user explicitly selected `own-shim`, and execution resumed without auto-approval.
- `flutter analyze` exits 1 with 1583 pre-existing `info`/`warning` lints in unrelated auth widget tests and `analysis_options.yaml`; 0 errors and 0 issues in this plan's files. Per the scope-boundary rule these were recorded in `deferred-items.md` and not fixed.
- `npx tsc --noEmit` fails on pre-existing untracked backend files (`app/api/admin/promos/directory/`, `lib/admin-promos-directory.ts`); no backend file was touched by this plan. Recorded as out of scope.

## User Setup Required

None for source code. Native artifacts are CI outputs: Android requires OpenJDK 17 + Android SDK/NDK (blocked in this env), iOS requires Xcode; both are built by `mobile/native/libbox_shim/build.sh` and gitignored. Until an artifact is present, plan 19-03's silent `Socket.connect` fallback keeps the app functional.

## Threat Flags

None new. The implementation stays inside the PLAN threat register (T-19-01, T-19-04, T-19-06, T-19-07, T-19-09, T-19-SC, T-19-GPL): fixed `generate_204` default, trusted outbound tags, no TUN, `CheckConfig`, no config/link/secret logging, no simulation, no unvetted package. GPL-3.0 remains an accepted external blocker (Phase 23).

## Known Stubs

None in source. The absent native binaries are intentional gitignored CI artifacts, not code stubs; the silent fallback is owned by plan 19-03.

## Next Phase Readiness

- Plan 19-03 can build `LibboxPingService` on `LibboxPingCore.urltest(tag, timeout)`, map an exception/negative code to the silent `Socket.connect` fallback (`approx`), and leave the TCP core to phase 20.
- The shim's result contract is `{"online":bool,"rttMs":int}`; `rttMs == 0` with `online == false` covers both no-history and failed-then-cleared cases.
- Open risk: on-device URLTest and per-ABI native packaging remain unverified in this environment (coverage D4).

---

## Self-Check: PASSED

- All 8 plan-created source files plus `19-02-SUMMARY.md` are present on disk.
- Task commit `32e413c` verified in `git log`.
- Verification rerun after commit: `flutter pub get` OK; `dart run build_runner build --delete-conflicting-outputs` OK; `dart run ffigen --config lib/core/ping/ffigen.yaml` OK and idempotent; `flutter analyze` 0 issues in `lib/core/ping/**` and 0 errors overall; `go build -buildmode=c-shared` OK with the locked tags/linker flags.
- No `libbox_urltest` symbol, no ICMP, no `Math.random`/fake IP/`sleep`/`load`, no secret or config logging in the new files.

---
*Phase: 19-server-pools-auto-ping-7-days*
*Completed: 2026-11-27*
