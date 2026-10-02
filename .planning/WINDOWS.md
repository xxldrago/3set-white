---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-10-02T01:00:19.726Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unmet-truth | docs/artemida-v1-contract.md |  | CAB-03/CAB-04 response shapes (GET /keys/{id}, /subscription-links, /devices) not observed: probe account had 0 keys; marked UNKNOWN (no key available) | open |  | 2026-10-02T00:48:31.110Z |  |
| 2 | 02 | unrun-verify | tests/integration/auth-flow.test.ts |  | Integration suite not run locally: no Postgres configured (vitest env uses a dummy DATABASE_URL); pre-existing, unrelated to 02-02 | open |  | 2026-10-02T01:00:19.726Z |  |

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
  }
]
````
