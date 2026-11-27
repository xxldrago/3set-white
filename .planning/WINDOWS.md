---
schema_version: 1
open_count: 27
waived_count: 0
fixed_count: 0
total_count: 27
last_updated: 2026-11-27T09:26:33.524Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unmet-truth | docs/artemida-v1-contract.md |  | CAB-03/CAB-04 response shapes (GET /keys/{id}, /subscription-links, /devices) not observed: probe account had 0 keys; marked UNKNOWN (no key available) | open |  | 2026-10-02T00:48:31.110Z |  |
| 2 | 02 | unrun-verify | tests/integration/auth-flow.test.ts |  | Integration suite not run locally: no Postgres configured (vitest env uses a dummy DATABASE_URL); pre-existing, unrelated to 02-02 | open |  | 2026-10-02T01:00:19.726Z |  |
| 3 | 02 | deviation | lib/bot.ts |  | Bot tariff keyboard clamps devices to 2-10 (provider minDevices=2 / A7), not the plan's 1-10; devices=1 is rejected by ARTEMIDA | open |  | 2026-10-02T01:22:36.110Z |  |
| 4 | 02 | deviation | lib/keys-service.ts |  | Provider conflict (409) on POST /trial is terminal: claim kept + already_used returned (RESEARCH Q3), not rolled back as a transient failure | open |  | 2026-10-02T01:22:36.187Z |  |
| 5 | 02 | deviation | vitest.config.ts |  | DATABASE_URL now defers to process.env when present so the DB-backed trial-claim/rollback vectors run against local Postgres; dummy fallback retained for env-less runs | open |  | 2026-10-02T01:22:42.464Z |  |
| 6 | 02 | unrun-verify | tests/integration/auth-flow.test.ts |  | Full 'npx vitest run' parallel suite: auth-flow replay test flaked (200 vs 401) due to cross-file replay_cache cleanup; passes in isolation; pre-existing test isolation fragility, unrelated to 02-04 | open |  | 2026-10-02T01:32:49.958Z |  |
| 7 | 02 | deviation | lib/keys-service.ts |  | statusLabel() lives in lib/keys-service.ts as the single shared switch (five literal t('status.…') calls) used by both SubscriptionCard and the bot, instead of the switch living inside components/SubscriptionCard.tsx as the plan text specified | open |  | 2026-10-02T01:32:54.083Z |  |
| 8 | 02 | deviation | components/CopyButton.tsx |  | Key-detail copy control required a new client island components/CopyButton.tsx (not in 02-05 files_modified): the page is an async RSC and clipboard access is browser-only, so no listed file could host it without violating the RSC/'use client' contract | open |  | 2026-10-02T01:41:34.059Z |  |
| 9 | 03 | unrun-verify | scripts/artemida-probe.mjs |  | 03-01 Task 1 live paid create/upgrade probe not run: ARTEMIDA account balance 0 RUB — create/upgrade shapes remain UNKNOWN pending owner funding + approval | open |  | 2026-10-02T22:11:07.866Z |  |
| 10 | 4 | stub | lib/worker.ts | 365 | REMIND_EXPIRY dispatcher not wired until 04-08; rows stay pending | open |  | 2026-10-03T11:48:47.550Z |  |
| 11 | 04 | deviation | app/page.tsx |  | Rule 2 auto-fix: home unread read wrapped in try/catch defaulting to 0 so support read failure never breaks the home page (04-05 Task 3) | open |  | 2026-10-03T12:25:37.857Z |  |
| 12 | 05 | stub | app/admin/page.tsx |  | Overview metric cards render the intentional em-dash baseline; plan 05-07 fills DB/ARTEMIDA stats | open |  | 2026-10-03T22:14:55.389Z |  |
| 13 | 05 | stub | app/admin/page.tsx |  | Group try/catch degradation scaffolding wraps no data read yet; plan 05-07 wires the reads | open |  | 2026-10-03T22:14:55.456Z |  |
| 14 | 19 | unrun-verify | mobile/native/libbox_shim/build.sh |  | Native .so/.xcframework build and on-device URLTest not runnable in this env (Android JDK/SDK absent; iOS CI-built); silent Socket.connect fallback ships in 19-03 | open |  | 2026-11-27T03:44:45.644Z |  |
| 15 | 19 | deviation | mobile/lib/core/ping/ping_repository.dart |  | PingCacheLookup.fresh made async so the Drift PingCacheDao can implement the fresh-cache seam (SQLite reads are Future-based); 19-03 fake cache updated | open |  | 2026-11-27T04:11:52.727Z |  |
| 16 | 19 | deviation | mobile/lib/features/servers/providers.dart |  | REQ-POOL-04 load bar deferred (D-04); RTT-only ranking, no load field parsed or emitted | open |  | 2026-11-27T04:40:05.199Z |  |
| 17 | 19 | deviation | mobile/lib/features/home/providers.dart |  | bottomNavIndexProvider legacy shim kept until 19-07 removes bottom navigation | open |  | 2026-11-27T04:40:05.268Z |  |
| 18 | 19 | stub | mobile/lib/features/servers/server_pool_screen.dart |  | Shop/profile/logic actions are intentional stubs pending phase 21 (shop route added in 19-08) | open |  | 2026-11-27T05:12:11.520Z |  |
| 19 | 19 | stub | mobile/lib/features/servers/widgets/connect_panel.dart |  | IP/timer/traffic show dashes with phase-20 note; VPN core/FSM is phase 20 | open |  | 2026-11-27T05:12:11.595Z |  |
| 20 | 19 | deviation | mobile/lib/features/servers/server_pool_screen.dart |  | Rule 1: fixed nested-flex overlap that collapsed pool list; reordered offline banner; guarded refresh against phantom selection | open |  | 2026-11-27T05:12:11.662Z |  |
| 21 | 19-server-pools-auto-ping-7-days | stub | mobile/lib/features/shop/shop_screen.dart |  | Shop stub Купить shows phase-21 SnackBar only; no purchase (D-15/D-19), real shop ships in phase 21 | open |  | 2026-11-27T05:23:34.584Z |  |
| 22 | 20 | unrun-verify | app/api/mobile/config/route.ts |  | Live ARTEMIDA links[] shape re-verification on a paid key remains [ASSUMED] inherited from phase 19; manual-only, not exercised in 20-01 | open |  | 2026-11-27T07:23:47.502Z |  |
| 23 | 20 | deviation | lib/bot.ts |  | Global npx tsc --noEmit red on unrelated actively-edited parallel-work files; 20-01 slice proven by scoped tsc + 23 passing tests | open |  | 2026-11-27T07:23:47.569Z |  |
| 24 | 20 | unrun-verify | mobile/native/libbox_shim/main.go |  | Real OS TUN fd path, per-ABI .so/.dylib artifacts and on-device traffic counters unverified here (no Android JDK/SDK; non-TUN fd aborts with SIGABRT) | open |  | 2026-11-27T09:08:03.055Z |  |
| 25 | 20 | deviation | mobile/native/libbox_shim/main.go |  | Rule 2: stop existing no-TUN service before libbox_start_with_tun so the fd-carrying platform is used | open |  | 2026-11-27T09:08:03.135Z |  |
| 26 | 20 | deviation | mobile/native/libbox_shim/main.go |  | Rule 3: added Go-side cString seam checkConfigErrorText because cgo cannot be imported from _test.go | open |  | 2026-11-27T09:08:03.217Z |  |
| 27 | 20 | unrun-verify | mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt |  | Android native build + on-device tunnel/notification/revoke/kill-switch UAT not run here: no JDK17/Android SDK/NDK; CI artifacts required | open |  | 2026-11-27T09:26:33.524Z |  |

````json
[
  {
    "id": 1,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "docs/artemida-v1-contract.md",
    "line": null,
    "description": "CAB-03/CAB-04 response shapes (GET /keys/{id}, /subscription-links, /devices) not observed: probe account had 0 keys; marked UNKNOWN (no key available)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T00:48:31.110Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "tests/integration/auth-flow.test.ts",
    "line": null,
    "description": "Integration suite not run locally: no Postgres configured (vitest env uses a dummy DATABASE_URL); pre-existing, unrelated to 02-02",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:00:19.726Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "02",
    "file": "lib/bot.ts",
    "line": null,
    "description": "Bot tariff keyboard clamps devices to 2-10 (provider minDevices=2 / A7), not the plan's 1-10; devices=1 is rejected by ARTEMIDA",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:22:36.110Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "02",
    "file": "lib/keys-service.ts",
    "line": null,
    "description": "Provider conflict (409) on POST /trial is terminal: claim kept + already_used returned (RESEARCH Q3), not rolled back as a transient failure",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:22:36.187Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "02",
    "file": "vitest.config.ts",
    "line": null,
    "description": "DATABASE_URL now defers to process.env when present so the DB-backed trial-claim/rollback vectors run against local Postgres; dummy fallback retained for env-less runs",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:22:42.464Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "tests/integration/auth-flow.test.ts",
    "line": null,
    "description": "Full 'npx vitest run' parallel suite: auth-flow replay test flaked (200 vs 401) due to cross-file replay_cache cleanup; passes in isolation; pre-existing test isolation fragility, unrelated to 02-04",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:32:49.958Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "02",
    "file": "lib/keys-service.ts",
    "line": null,
    "description": "statusLabel() lives in lib/keys-service.ts as the single shared switch (five literal t('status.…') calls) used by both SubscriptionCard and the bot, instead of the switch living inside components/SubscriptionCard.tsx as the plan text specified",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:32:54.083Z",
    "resolved_at": null
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "02",
    "file": "components/CopyButton.tsx",
    "line": null,
    "description": "Key-detail copy control required a new client island components/CopyButton.tsx (not in 02-05 files_modified): the page is an async RSC and clipboard access is browser-only, so no listed file could host it without violating the RSC/'use client' contract",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T01:41:34.059Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "scripts/artemida-probe.mjs",
    "line": null,
    "description": "03-01 Task 1 live paid create/upgrade probe not run: ARTEMIDA account balance 0 RUB — create/upgrade shapes remain UNKNOWN pending owner funding + approval",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T22:11:07.866Z",
    "resolved_at": null
  },
  {
    "id": 10,
    "kind": "stub",
    "phase": "4",
    "file": "lib/worker.ts",
    "line": 365,
    "description": "REMIND_EXPIRY dispatcher not wired until 04-08; rows stay pending",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T11:48:47.550Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "deviation",
    "phase": "04",
    "file": "app/page.tsx",
    "line": null,
    "description": "Rule 2 auto-fix: home unread read wrapped in try/catch defaulting to 0 so support read failure never breaks the home page (04-05 Task 3)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T12:25:37.857Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "stub",
    "phase": "05",
    "file": "app/admin/page.tsx",
    "line": null,
    "description": "Overview metric cards render the intentional em-dash baseline; plan 05-07 fills DB/ARTEMIDA stats",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T22:14:55.389Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "stub",
    "phase": "05",
    "file": "app/admin/page.tsx",
    "line": null,
    "description": "Group try/catch degradation scaffolding wraps no data read yet; plan 05-07 wires the reads",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T22:14:55.456Z",
    "resolved_at": null
  },
  {
    "id": 14,
    "kind": "unrun-verify",
    "phase": "19",
    "file": "mobile/native/libbox_shim/build.sh",
    "line": null,
    "description": "Native .so/.xcframework build and on-device URLTest not runnable in this env (Android JDK/SDK absent; iOS CI-built); silent Socket.connect fallback ships in 19-03",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T03:44:45.644Z",
    "resolved_at": null
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "19",
    "file": "mobile/lib/core/ping/ping_repository.dart",
    "line": null,
    "description": "PingCacheLookup.fresh made async so the Drift PingCacheDao can implement the fresh-cache seam (SQLite reads are Future-based); 19-03 fake cache updated",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T04:11:52.727Z",
    "resolved_at": null
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "19",
    "file": "mobile/lib/features/servers/providers.dart",
    "line": null,
    "description": "REQ-POOL-04 load bar deferred (D-04); RTT-only ranking, no load field parsed or emitted",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T04:40:05.199Z",
    "resolved_at": null
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "19",
    "file": "mobile/lib/features/home/providers.dart",
    "line": null,
    "description": "bottomNavIndexProvider legacy shim kept until 19-07 removes bottom navigation",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T04:40:05.268Z",
    "resolved_at": null
  },
  {
    "id": 18,
    "kind": "stub",
    "phase": "19",
    "file": "mobile/lib/features/servers/server_pool_screen.dart",
    "line": null,
    "description": "Shop/profile/logic actions are intentional stubs pending phase 21 (shop route added in 19-08)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T05:12:11.520Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "stub",
    "phase": "19",
    "file": "mobile/lib/features/servers/widgets/connect_panel.dart",
    "line": null,
    "description": "IP/timer/traffic show dashes with phase-20 note; VPN core/FSM is phase 20",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T05:12:11.595Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "19",
    "file": "mobile/lib/features/servers/server_pool_screen.dart",
    "line": null,
    "description": "Rule 1: fixed nested-flex overlap that collapsed pool list; reordered offline banner; guarded refresh against phantom selection",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T05:12:11.662Z",
    "resolved_at": null
  },
  {
    "id": 21,
    "kind": "stub",
    "phase": "19-server-pools-auto-ping-7-days",
    "file": "mobile/lib/features/shop/shop_screen.dart",
    "line": null,
    "description": "Shop stub Купить shows phase-21 SnackBar only; no purchase (D-15/D-19), real shop ships in phase 21",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T05:23:34.584Z",
    "resolved_at": null
  },
  {
    "id": 22,
    "kind": "unrun-verify",
    "phase": "20",
    "file": "app/api/mobile/config/route.ts",
    "line": null,
    "description": "Live ARTEMIDA links[] shape re-verification on a paid key remains [ASSUMED] inherited from phase 19; manual-only, not exercised in 20-01",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T07:23:47.502Z",
    "resolved_at": null
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "20",
    "file": "lib/bot.ts",
    "line": null,
    "description": "Global npx tsc --noEmit red on unrelated actively-edited parallel-work files; 20-01 slice proven by scoped tsc + 23 passing tests",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T07:23:47.569Z",
    "resolved_at": null
  },
  {
    "id": 24,
    "kind": "unrun-verify",
    "phase": "20",
    "file": "mobile/native/libbox_shim/main.go",
    "line": null,
    "description": "Real OS TUN fd path, per-ABI .so/.dylib artifacts and on-device traffic counters unverified here (no Android JDK/SDK; non-TUN fd aborts with SIGABRT)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T09:08:03.055Z",
    "resolved_at": null
  },
  {
    "id": 25,
    "kind": "deviation",
    "phase": "20",
    "file": "mobile/native/libbox_shim/main.go",
    "line": null,
    "description": "Rule 2: stop existing no-TUN service before libbox_start_with_tun so the fd-carrying platform is used",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T09:08:03.135Z",
    "resolved_at": null
  },
  {
    "id": 26,
    "kind": "deviation",
    "phase": "20",
    "file": "mobile/native/libbox_shim/main.go",
    "line": null,
    "description": "Rule 3: added Go-side cString seam checkConfigErrorText because cgo cannot be imported from _test.go",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T09:08:03.217Z",
    "resolved_at": null
  },
  {
    "id": 27,
    "kind": "unrun-verify",
    "phase": "20",
    "file": "mobile/android/app/src/main/kotlin/com/u3set/mobile/VpnService.kt",
    "line": null,
    "description": "Android native build + on-device tunnel/notification/revoke/kill-switch UAT not run here: no JDK17/Android SDK/NDK; CI artifacts required",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-27T09:26:33.524Z",
    "resolved_at": null
  }
]
````
