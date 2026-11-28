---
phase: "22"
slug: "devices-settings-polish-5-days"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-28"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for devices/profile/settings backend, Flutter UI, deferred-delete undo and local notifications.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test / mocktail (mobile) |
| **Config file** | `package.json` + `mobile/pubspec.yaml` |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test test/unit test/widget` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `cd mobile && dart run build_runner build --delete-conflicting-outputs && flutter analyze --no-fatal-infos --no-fatal-warnings && flutter test` |
| **Estimated runtime** | ~90s backend + ~180s mobile |

`npx prisma validate`; `flutter_local_notifications` + direct `timezone` install behind `checkpoint:human-verify` (pub.dev legitimacy seam unsupported).

---

## Sampling Rate

- **After every task commit:** focused backend/mobile tests.
- **After every plan wave:** full suites + analyzer.
- **Before `/gsd-verify-work`:** all green; live-key/device/package items stay manual-only.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | REQ-BE-06 / REQ-DEV-01 | — | ownership-safe device read, no token in logs | unit | `npx vitest run tests/unit/mobile-devices-route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Planner expands to all implementation tasks with `<automated>` + `<fails_when>`.*

---

## Wave 0 Requirements

- [ ] Backend vitest infrastructure — existing.
- [ ] Mobile `flutter_test` + mocktail — existing.
- [ ] `flutter_local_notifications` 23.0.4 + `timezone` — new dependencies, `checkpoint:human-verify` before install.
- [ ] No Prisma schema change for read/delete routes; Drift setting additions covered by existing generated fixtures; `npx prisma validate`.
- [ ] Deferred-delete timer fixtures must be deterministic (fakeAsync/Tick).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ARTEMIDA device list / deferred delete with real key | REQ-DEV-01/02, REQ-BE-06 | Needs paid key + provider network | Confirm GET shows real devices, undo cancels before provider call, confirmed delete removes only that token. |
| Local expiry notifications on device | REQ-NOTIF-01 | OS notification channels/exact alarms | Set expiry to T-7/T-3/T-1, kill app, confirm notification and deep-link to shop. |
| FCM token registration | REQ-NOTIF-02 | External blocker — no Firebase project/credentials | Deferred; do not fake. Requires owner-supplied config + backend route in later phase. |
| Install of `flutter_local_notifications` / `timezone` | D-09 | pub.dev legitimacy seam unsupported | Human verifies publisher/version before `flutter pub add`; no silent substitute. |
| Visual/accessibility parity with prototype | 22.11/22.12, REQ-SET-01..05 | No screenshots/browser MCP | Compare profile sheet, device list, settings rows, chip labels, contrast and dynamic type to prototype. |
| Inherited phase-19/20/21 UAT | inherited | Device/live key | `/gsd-verify-work 19/20/21` before milestone close. |

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
