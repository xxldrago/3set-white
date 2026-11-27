---
phase: "20"
slug: "vpn-core-connect-fsm-10-days"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-27"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for backend `/config`, Flutter FSM/VPN core, Android Kotlin VpnService, and iOS compile-only NE.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test (mobile) + Go `go test`/`go build -buildmode=c-shared` (native shim) |
| **Config file** | `package.json` (`vitest run tests/unit`) + `mobile/pubspec.yaml` + `mobile/native/libbox_shim/go.mod` |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `cd mobile && flutter analyze && flutter test` + `cd mobile/native/libbox_shim && go build -buildmode=c-shared` |
| **Estimated runtime** | ~60s backend + ~120s mobile + ~120s Go |

`npx prisma validate`; `cd mobile && dart run build_runner build --delete-conflicting-outputs`; `dart run ffigen --config lib/core/ping/ffigen.yaml`.

---

## Sampling Rate

- **After every task commit:** quick backend + mobile tests (focused path).
- **After every plan wave:** full suites + analyzer + Go shim build/typecheck.
- **Before `/gsd-verify-work`:** all green; native device/on-device items tracked as manual-only.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | REQ-CONN-03 | — | no secrets | unit | `npx vitest run tests/unit/mobile-config-route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Planner expands rows with `<automated>` + `<fails_when>`.*

No silent drops: every runnable command has `<fails_when>`. Human-only native items are listed below.

---

## Wave 0 Requirements

- [ ] Backend vitest infrastructure — existing.
- [ ] Mobile `flutter_test` — existing, 199/199 green at phase 19 closeout.
- [ ] Go toolchain available for C-shared smoke build (`go build -buildmode=c-shared` with locked tags) — verified in phase 19 research.
- [ ] `cd mobile && flutter pub get` if new deps added; keep `ffi/ffigen/drift`.
- [ ] `dart run build_runner build` + `dart run ffigen` after C ABI changes.
- [ ] No Prisma schema change; `npx prisma validate`.
- [ ] Android native build NOT runnable here (no JDK17/SDK/NDK) — CI artifact only; tracked manual.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real TUN tunnel on Android | REQ-CONN-03/04 | No JDK/SDK + real device | CI build VpnService + shim, install, connect, confirm tunnel and notification. |
| Cancel/restart/kill switch on device | REQ-CONN-02/06/08/09 | Native lifecycle | Device UAT with real network changes and permission revocation. |
| Connected Panel live IP/traffic | REQ-CONN-07 | Needs live tunnel + IP endpoint | Compare displayed IP with `ipify` inside tunnel; counters update 1s. |
| iOS NE tunnel | REQ-CONN-05/06 | No Apple entitlement | Build compile-only; device test after approval. |
| GPL/Play compliance | all | Legal | `/gsd-secure-phase 20` + legal review (external). |
| Phase 19 deferred UAT | inherited | Device/live key | `/gsd-verify-work 19` before milestone close. |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
