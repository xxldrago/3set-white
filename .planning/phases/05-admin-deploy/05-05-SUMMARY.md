---
phase: 05-admin-deploy
plan: 05
subsystem: infra
tags: [whitelabel, dns, healthcheck, env, zod, vitest, ops]

# Dependency graph
requires:
  - phase: 05-admin-deploy
    provides: "Plan 05-01 admin RBAC spine + vitest env baseline (no code dependency for this plan, wave-order only)"
provides:
  - "lib/whitelabel.ts — verifySubscriptionHost / resolveSubscriptionUrl with provider-default fallback (never fabricates a host)"
  - "app/api/health/route.ts — shallow 200 {status,uptime,worker} liveness probe"
  - "lib/env.ts — WHITELABEL_HOST + ARTEMIDA_LOW_BALANCE_RUB schema fields (consumed by 05-07)"
  - ".env.example — prod origin / WL host / low-balance / webhook-mode documented as placeholders"
affects: [05-06, 05-07, admin-deploy]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 4212
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Verify-don't-construct: read the provider URL, compare the host, fall back to the provider value — never build a host"
    - "Shallow liveness endpoint: no DB, no env, no version — worker flag from globalThis handle"
    - "Exported zod envSchema so schema behavior is unit-testable without mutating process.env"

key-files:
  created:
    - lib/whitelabel.ts
    - app/api/health/route.ts
    - tests/unit/whitelabel.test.ts
    - tests/unit/health-route.test.ts
    - tests/unit/env.test.ts
  modified:
    - lib/env.ts
    - .env.example

key-decisions:
  - "White Label host comes from env (WHITELABEL_HOST) — a single source, never hardcoded twice"
  - "On host mismatch, resolveSubscriptionUrl returns the provider URL byte-for-byte with a warning + fallback flag; no host is ever rewritten (T-05-20)"
  - "Empty/malformed provider URLs return { url: null } without throwing (OPS-02 encoding edge)"
  - "Health endpoint returns 200 even when the worker global is absent (worker: false) so a down worker cannot fail liveness"
  - ".env.example keeps BOT_MODE=polling as the local-copy default and documents the prod value (BOT_MODE=webhook) in the comment"

patterns-established:
  - "Pure host-verification helper with no Next/Prisma dependency — unit-testable with no DB"
  - "Health probe reads only globalThis.__setwhiteWorker.started and process.uptime()"

requirements-completed: [OPS-02]

coverage:
  - id: D1
    description: "White Label sub-link host verified against sub.my.3set.online; mismatch falls back to the provider URL with a warning and never rewrites/constructs a host"
    requirement: OPS-02
    verification:
      - kind: unit
        ref: "tests/unit/whitelabel.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shallow /api/health returns 200 with {status,uptime,worker}, no DB round-trip, no env/version/token leakage"
    verification:
      - kind: unit
        ref: "tests/unit/health-route.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "lib/env.ts schema carries ARTEMIDA_LOW_BALANCE_RUB (default 500, coerce, non-negative) and WHITELABEL_HOST (default sub.my.3set.online); .env.example documents the prod vars as placeholders"
    verification:
      - kind: unit
        ref: "tests/unit/env.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Owner DNS A-record (sub.my.3set.online -> 144.31.93.193, no AAAA, DNS Only) and ARTEMIDA brand-cabinet domain config"
    verification: []
    human_judgment: true
    rationale: "External owner actions in Cloudflare and the ARTEMIDA cabinet; cannot be executed or automated by the executor and must be done at deploy time (D-72/D-73)."

duration: 4min
completed: 2026-10-03
status: complete
---

# Phase 5 Plan 05: White Label sub-link verification + shallow health + env wiring Summary

**White Label sub-link host verification with provider-default fallback (`resolveSubscriptionUrl`, never fabricates a host), a shallow DB-free `/api/health` probe, and env wiring for `WHITELABEL_HOST` + `ARTEMIDA_LOW_BALANCE_RUB`.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-03T22:26:00Z
- **Completed:** 2026-10-03T22:30:28Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- `lib/whitelabel.ts`: `verifySubscriptionHost` / `resolveSubscriptionUrl` verify the provider-returned URL host against `WHITELABEL_HOST` and, on mismatch, return the provider URL unchanged with a `fallback` flag + warning — the host is never constructed or rewritten (OPS-02 / D-72/D-74).
- `app/api/health/route.ts`: shallow `200 { status, uptime, worker }`, `dynamic = force-dynamic`, no DB, no env/version/token (OPS-01 / D-78).
- `lib/env.ts`: added `WHITELABEL_HOST` (default `sub.my.3set.online`) and `ARTEMIDA_LOW_BALANCE_RUB` (`z.coerce.number().nonnegative().default(500)`, D-70) so plan 05-07 can read them; exported `envSchema` for direct schema tests.
- `.env.example`: documents `PLATEGA_MERCHANT_ID`/`PLATEGA_SECRET`/`PLATEGA_BASE_URL`, `APP_BASE_URL`, `BOT_MODE` (prod webhook), `CRON_SECRET`, `WHITELABEL_HOST`, `ARTEMIDA_LOW_BALANCE_RUB` as placeholders only.

## Task Commits

Each task was committed atomically (Task 2 followed RED→GREEN):

1. **Task 1: WL sub-link host verification + fallback (tracer)** - `156a1a6` (feat)
2. **Task 2: /api/health — failing contract test (RED)** - `450ff86` (test)
3. **Task 2: /api/health — implementation (GREEN)** - `85f4503` (feat)
4. **Task 3: prod env wiring + documentation** - `afa57f4` (chore)

**Plan metadata:** committed separately as `docs(05-05): complete ...` (this SUMMARY).

## Files Created/Modified
- `lib/whitelabel.ts` — pure host verification + safe fallback; never fabricates a host.
- `app/api/health/route.ts` — shallow liveness probe.
- `lib/env.ts` — `WHITELABEL_HOST` + `ARTEMIDA_LOW_BALANCE_RUB` schema fields; `envSchema` exported.
- `tests/unit/whitelabel.test.ts` — match / mismatch+fallback / empty / malformed / env-source.
- `tests/unit/health-route.test.ts` — 200 shape, worker flag, no-leak + no-DB (mocked prisma).
- `tests/unit/env.test.ts` — prod origin accepted, non-URL rejected, threshold default+coerce+non-negative, WL default, BOT_MODE enum.
- `.env.example` — placeholder documentation for the prod env vars.

## Decisions Made
- **Single source for the WL host:** `WHITELABEL_HOST` lives in `lib/env.ts`; `lib/whitelabel.ts` re-exports it, so the host is not hardcoded in two places (enforced by test).
- **Verify-don't-construct:** on a host mismatch the function returns the provider URL exactly as returned (byte-for-byte) — no interpolation of `WHITELABEL_HOST` (T-05-20).
- **Shallow health:** worker absence yields `worker: false` with HTTP 200 (liveness must not fail when the background worker is down); the body carries no env/version/token.
- **BOT_MODE template value:** kept `polling` as the copy-to-`.env.local` default and documented the prod value `BOT_MODE=webhook` in the comment, avoiding a broken local-dev default while satisfying the prod-documentation requirement.

## Deviations from Plan
None - plan executed exactly as written.

(The plan's Task 3 said "Extend `tests/unit/env.test.ts`"; the file did not yet exist, so it was created with the required coverage. The plan's Task 1 already added the two `.env.example` vars and Task 3 documented the remaining prod vars — intended split, no overlap.)

## Issues Encountered
- `tests/unit/env.test.ts` did not exist despite the plan wording ("Extend"), so it was authored from scratch. Resolved via the exported `envSchema` (avoids mutating `process.env` / re-importing the fail-fast module).

## User Setup Required

Two owner actions from the plan's `user_setup` are **not** code and were not attempted — they must be completed before sub-links resolve:

- **Cloudflare DNS:** create `A sub.my.3set.online → 144.31.93.193`, **no AAAA**, **DNS Only (grey cloud)**.
- **ARTEMIDA cabinet:** set the White Label brand domain to `sub.my.3set.online`.

Deploy-time verification (D-74): `curl -sI https://sub.my.3set.online/...` the provider-returned sub-link, assert the URL host equals the WL host, and on failure keep the provider-default fallback (never rewrite the host). `dig AAAA sub.my.3set.online` must be empty.

## Next Phase Readiness
- `ARTEMIDA_LOW_BALANCE_RUB` and `WHITELABEL_HOST` are now in the schema for **05-07** (stats/balance) to consume.
- `/api/health` is available for the **05-06** deploy `HEALTHCHECK` / compose probe.
- No blockers; owner DNS/brand steps are the only outstanding external dependency and are tracked above.

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-03*

## Self-Check: PASSED

- All 5 created source/test files exist; SUMMARY.md exists.
- All 4 task commits exist (`156a1a6`, `450ff86`, `85f4503`, `afa57f4`).
- `npx tsc --noEmit` clean; `npx vitest run tests/unit` green (35 files, 315 tests).
