---
phase: "19"
slug: "server-pools-auto-ping-7-days"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-27"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Phase spans **backend (Next.js `app/api/mobile/servers` + `lib/`)** and **mobile (Flutter `mobile/`)**.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (backend) + flutter_test (mobile) |
| **Config file** | `package.json` (`test`: `vitest run tests/unit`) + `mobile/pubspec.yaml` (`flutter_test`) |
| **Quick run command** | `npx vitest run tests/unit` and `cd mobile && flutter test` |
| **Full suite command** | `npm test` and `cd mobile && flutter test` |
| **Estimated runtime** | ~60s backend + ~120s mobile |

Backend typecheck `npx tsc --noEmit`. Mobile `cd mobile && flutter analyze`. Codegen `cd mobile && dart run build_runner build --delete-conflicting-outputs`. `npx prisma validate`. 

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit` and `cd mobile && flutter test`
- **After every plan wave:** `npm test` + `npx tsc --noEmit` + `cd mobile && flutter analyze && flutter test`
- **Before `/gsd-verify-work`:** Full suite green + `npx prisma validate`
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | REQ-PING-02 | — | — | unit | `cd mobile && flutter test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Planner fills per-task `<automated>` + `<fails_when>`; rows expand after planning.*

**No silent drops:** every `<automated>` command has a `<fails_when>`. SPEC-absent `## Edge Coverage` / `## Prohibitions` are sourced via the spec-less probe fallback (`$COVERAGE` + `must_haves.prohibitions` descriptor-less). REQ-POOL-04 `load` bar is explicitly deferred (CONTEXT D-04), not a missing test. REQ-PING-06 `load` tie-break is RTT-only while `load` is hidden.

---

## Wave 0 Requirements

- [ ] Backend vitest present (`tests/unit`, `vitest.config.*`) — existing.
- [ ] Mobile `flutter_test` present — existing.
- [ ] `cd mobile && flutter pub get` after adding `drift`, `drift_flutter`, `sqlite3`, `sqlite3_flutter_libs`, `path`, `path_provider`, `ffigen`, `ffi`.
- [ ] `cd mobile && dart run build_runner build --delete-conflicting-outputs` for Drift + freezed + riverpod codegen.
- [ ] libbox native artifacts + own C-shared shim + `ffigen` bindings (Android blocked here: no JDK; iOS buildable). `libbox.urltest` callable; fallback retains app.
- [ ] No new Prisma schema in phase 19 (`KeyCache` read only); `npx prisma validate`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `links[]` payload on live key | REQ-POOL-02 | No live paid ARTEMIDA key in env (`[ASSUMED]` in research) | With a paid key, `GET /api/mobile/servers`, inspect `simple`/`whitelist`, `proto`, `sni`, `remark` mapping, `key.remainingDays`. |
| `libbox.urltest` on real servers | REQ-PING-01 | Native build + real servers; Android JDK17 absent | On built app, trigger full ping; confirm RTT + online; confirm silent `Socket.connect` fallback. |
| WiFi↔LTE invalidation | REQ-PING-05 | Real device network change | Toggle network; cache cleared; re-ping; no stale; read-only chip. |
| Android native build | REQ-PING-01 | No JDK in env | With OpenJDK 17 + Android SDK, build `libbox.aar`; `flutter build apk`. |
| No-simulation / no-secret-leak | All | Security | `grep` no raw share-links in logs/UI; no `Math.random` ping; no fake IP; prototype simulation removed. |

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
