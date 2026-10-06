---
phase: 06-email-auth
plan: 10
subsystem: auth
tags: [rate-limit, x-forwarded-for, nginx, prisma, security]

requires:
  - phase: 06-email-auth
    provides: "lib/auth-rate-limit.ts login lock + LoginAttempt model"
provides:
  - "lib/client-ip.ts — shared trusted client-IP resolver (X-Real-IP / last XFF hop)"
  - "Per-email login lock counter independent of IP (no migration)"
  - "Routes wired to the shared helper; nginx overwrites X-Forwarded-For with $remote_addr"
affects: [06-email-auth]

actuals:
  tokens: 11000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Trust the edge hop, never the client-supplied first XFF entry"
    - "Two-key lock: per-(email, ip) plus per-email-only (ip='') counter"

key-files:
  created:
    - lib/client-ip.ts
    - tests/unit/client-ip.test.ts
  modified:
    - lib/auth-rate-limit.ts
    - app/api/auth/email/login/route.ts
    - app/api/auth/email/password/request/route.ts
    - app/api/auth/telegram-bot/request/route.ts
    - nginx/my.3set.online.conf
    - tests/unit/auth-rate-limit.test.ts

key-decisions:
  - "Resolve client IP from X-Real-IP, falling back to the LAST XFF hop — the first hop is client-controlled and spoofable"
  - "Add a per-email-only lock counter using the existing LoginAttempt (email, ip='') unique row — no schema migration"
  - "nginx sets X-Forwarded-For $remote_addr (overwrite, not append) so downstream can trust it"

patterns-established:
  - "Trusted-edge IP: clientIp() is the single source for rate-limit keys across routes"
  - "Dual-key lock defeats header rotation: per-account counter is IP-independent"

requirements-completed: [AUTH-02, AUTH-04]

coverage:
  - id: D1
    description: "Client IP is resolved from a trusted edge header, not the client-controlled first XFF hop"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/client-ip.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-email login lock counter cannot be reset by rotating X-Forwarded-For"
    requirement: "AUTH-04"
    verification:
      - kind: unit
        ref: "tests/unit/auth-rate-limit.test.ts"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 10: Trusted client IP + per-email lock Summary

**CR-02 closed: rate-limit keys now derive from a trusted edge hop, and a per-account lock counter defeats `X-Forwarded-For` rotation.**

## Performance

- **Duration:** ~4 min
- **Tasks:** 3/3
- **Commits:** 3

## Accomplishments

- Added `lib/client-ip.ts` — a shared `clientIp()` that prefers `X-Real-IP` and otherwise takes the LAST `X-Forwarded-For` hop (the edge-appended value), never the client-supplied first entry.
- Extended `lib/auth-rate-limit.ts` with a per-email-only lock counter keyed on the existing `LoginAttempt` unique via an empty-`ip` sentinel — no migration required.
- Rewired `email/login`, `email/password/request`, and `telegram-bot/request` routes to the shared helper.
- Hardened `nginx/my.3set.online.conf` to overwrite `X-Forwarded-For` with `$remote_addr` instead of `$proxy_add_x_forwarded_for`.

## Task Commits

1. `60f9bc5` feat(06-10): add shared trusted client-IP resolver
2. `1b19a1f` feat(06-10): add per-email login lock counter (no migration)
3. `8fd9f4c` fix(06-10): trust edge hop in routes and overwrite XFF at nginx

## Files Created/Modified

- `lib/client-ip.ts` (created) — trusted client-IP resolver
- `tests/unit/client-ip.test.ts` (created) — 6 tests
- `lib/auth-rate-limit.ts` (modified) — dual-key lock counter
- `tests/unit/auth-rate-limit.test.ts` (modified) — 5 tests
- `app/api/auth/email/login/route.ts`, `app/api/auth/email/password/request/route.ts`, `app/api/auth/telegram-bot/request/route.ts` (modified) — use shared helper
- `nginx/my.3set.online.conf` (modified) — overwrite XFF

## Decisions & Deviations

- Reused the `LoginAttempt` `(email, ip='')` unique row for the per-account counter to avoid a schema migration (matches the plan's CR-02 fix hint).
- nginx change is deploy-time only; it takes effect on the next deploy.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run tests/unit/client-ip.test.ts tests/unit/auth-rate-limit.test.ts` — 11/11 pass (with `DATABASE_URL=…/setwhite`).

## Issues Encountered

None.

## Next Phase Readiness

- Closes CR-02. Enables 06-13 (registration throttle) which builds on the same limiter.

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*
