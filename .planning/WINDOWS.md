---
schema_version: 1
open_count: 5
waived_count: 0
fixed_count: 0
total_count: 5
last_updated: 2026-10-02T01:22:42.464Z
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
  }
]
````
