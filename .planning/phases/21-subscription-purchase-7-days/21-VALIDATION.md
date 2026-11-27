---
phase: "21"
slug: "subscription-purchase-7-days"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-27"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for pricing/subscription/payment backend, Platega reuse, and Flutter Shop/WebView/UI.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test (mobile) |
| **Config file** | `package.json` + `mobile/pubspec.yaml` |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `cd mobile && flutter analyze && flutter test` |
| **Estimated runtime** | ~60s backend + ~120s mobile |

`npx prisma validate`; `cd mobile && dart run build_runner build --delete-conflicting-outputs`.

---

## Sampling Rate

- **After every task commit:** focused backend/mobile tests.
- **After every plan wave:** full suites + analyzer.
- **Before `/gsd-verify-work`:** all green; live payment items tracked as manual-only (no Platega test credentials).
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | REQ-BE-03 / D-10 | — | no secret in subscription body | unit | `npx vitest run tests/unit/mobile-subscription-route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Planner expands to all implementation tasks with `<automated>` + `<fails_when>`.*

---

## Wave 0 Requirements

- [ ] Backend vitest infrastructure — existing.
- [ ] Mobile `flutter_test` — existing (256/256 at phase 20 closeout).
- [ ] `flutter_inappwebview ^6.1.5` new dependency — `checkpoint:human-verify` before install (pub.dev legitimacy ungated); source-level fallback if blocked.
- [ ] No Prisma schema change (orders/outbox already exist); `npx prisma validate`.
- [ ] New shared grace predicate must update phase-19/20 `isActiveKey` fixtures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Platega payment + webhook key issuance | REQ-SHOP-06/BE-07 | No test credentials | Test-mode transaction in staging; confirm CONFIRMED → key issued once; CANCELED/CHARGEBACKED issue nothing. |
| WebView lifecycle + resume pending order | REQ-SHOP-06 | Device/browser | Kill app during payment, relaunch, confirm polling resumes from stored orderId. |
| Confetti + ring + shop UX | REQ-SHOP-07/SUB-03 | Visual judgment | Compare with prototype; colors/thresholds. |
| Grace connection on device | REQ-SUB-06/D-10 | Needs expired key + real tunnel | Key at `expiresAt + 24h ±1ms`: `/servers`/`/config` allow connect; banner shows. |
| Phase 19/20 deferred UAT | inherited | Device/live key | `/gsd-verify-work 19` and `/gsd-verify-work 20` before milestone close. |

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
