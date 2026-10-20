---
phase: 06-email-auth
plan: "02"
subsystem: auth
tags: [account-linking, merge, unlink, change-password, prisma-transaction, bff, postgres]

# Dependency graph
requires:
  - phase: 06-email-auth
    plan: "01"
    provides: nullable-telegramId User identity + userId-subject sessions + argon2id lib
provides:
  - linkAccounts/unlinkTelegram merge service (lib/accounts.ts)
  - link/unlink/change-password BFF routes with session re-mint
  - merge + edge integration vectors incl. AUTH-05 farm boundary
affects: [06-03-mail, 06-04-login-ui, admin email support]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 12000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [single-transaction merge with delete-before-inherit ordering, dual-proof link (session plus widget), confirm-flag unlink with lastMethod hint, privilege-change session re-mint]

key-files:
  created:
    - lib/accounts.ts
    - app/api/auth/email/link/route.ts
    - app/api/auth/email/unlink/route.ts
    - app/api/auth/email/password/change/route.ts
  modified:
    - tests/integration/email-auth-flow.test.ts

key-decisions:
  - "D-81 gate cleared: owner locked merge-on-link (trialUsed OR, one-way) in 06-CONTEXT.md — proceeded without re-litigation"
  - "Link of a Telegram bound to another email account is 409 telegram_taken with zero merge (T-06-05)"
  - "Full unlink allowed service-side per D-93; route gates on explicit confirm flag and returns a lastMethod hint for the 06-04 UI warning"
  - "Every privilege change (link/unlink/change-password) re-mints the session"

requirements-completed: [AUTH-03, AUTH-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Link merges TG account into email account: one row, keys/orders/tickets re-pointed, trialUsed OR (AUTH-03)"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#link merges the TG account"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unlink requires explicit confirm; bare POST never unlinks; confirm clears telegramId and re-mints tid-less session (AUTH-03, D-93)"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#unlink without the confirm flag never unlinks + unlink with confirm clears telegramId"
        status: pass
    human_judgment: false
  - id: D3
    description: "Change-password verifies current (wrong → 401), rotates hash, re-mints session; old password dies (AUTH-03-support)"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#change with the wrong/right current password"
        status: pass
    human_judgment: false
  - id: D4
    description: "AUTH-03/AUTH-05 edge probes as assumptions: idempotent re-link, 409 on taken Telegram, 401 unlink-without-session, per-account trial farm boundary"
    requirement: "AUTH-05"
    verification:
      - kind: integration
        ref: "tests/integration/email-auth-flow.test.ts#account linking edges + change-password"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-10-05
status: complete
---

# Phase 06 Plan 02: Link/merge + unlink + change-password Summary

**Merge-on-link with trialUsed OR, confirm-gated full unlink, and current-password-checked rotation — every privilege change re-mints the session**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-05T16:00:00Z
- **Completed:** 2026-10-05T16:20:00Z
- **Tasks:** 3 (decision gate + tracer + edges)
- **Files modified:** 5 (1 service + 3 routes + 1 test file, +267/-2 vs 06-01 baseline)

## Accomplishments

- D-81 merge-on-link live: `linkAccounts` collapses a pure-TG row into the session account in ONE transaction — KeyCache/Order/Ticket (+PasswordReset/Notification pins) re-pointed, trialUsed = OR, trialKeyId/chatId/profile fill-forward, loser deleted; un-merging without manual разборка is impossible (one-way, owner-accepted)
- Link of a Telegram bound to another email account → 409 `telegram_taken` with NOTHING merged (T-06-05 elevation-of-privilege guard)
- Full unlink allowed per D-93 including the last method: service never blocks, route requires `{ confirm: true }` (bare POST → 400 `confirmation_required` + `lastMethod` hint for the 06-04 lockout warning), session re-minted tid-less so TG-keyed access stops in the same response
- Change-password: current-password check (wrong → 401 `current_password_wrong`, TG-only rows take the identical path — no oracle), min-8 new, Argon2id rotation, session re-mint (T-06-03)
- Bot call-sites untouched per D-94 (accounts layer resolves telegramId → userId internally)
- Full suite green: 42 files / 378 tests pass (+9 new); `npx tsc --noEmit` clean; DB left with zero test rows

## Task Commits

Each task was committed atomically:

1. **Gate: confirm one-way account merge (D-81)** — no code; owner locked merge-on-link + trialUsed=OR + full unlink in `06-CONTEXT.md` (D-81/D-93, one-way, explicit) — proceeded and recorded here
2. **Tracer: link Telegram to email account end-to-end** - `cafb278` (feat: accounts service + link/unlink routes + merge/unlink integration vectors)
3. **Change-password + merge edge tests (AUTH-05)** - `b37f7f7` (feat: change route + 6 edge vectors incl. farm boundary)

**Plan metadata:** summary commit follows (docs: complete plan).

## Files Created/Modified

- `lib/accounts.ts` — `linkAccounts` (attach / idempotent / 409-conflict / single-tx merge) + `unlinkTelegram` (never blocks) + `AccountConflictError`/`AccountNotFoundError`
- `app/api/auth/email/link/route.ts` — requireSession → widget shape → verifyWidget + replay consume → linkAccounts → re-mint (`invalid_telegram` 401, `telegram_taken` 409)
- `app/api/auth/email/unlink/route.ts` — requireSession → `confirm: true` literal gate → unlinkTelegram → re-mint tid-less (`confirmation_required` 400 + `lastMethod`)
- `app/api/auth/email/password/change/route.ts` — requireSession → verify current → rotate → re-mint (`current_password_wrong` 401)
- `tests/integration/email-auth-flow.test.ts` — `next/headers` mock (tickets-route pattern), widget-signer helper, 2100000xx TG range; 3 merge/unlink + 6 edge vectors

## Decisions Made

- D-81 gate: owner pre-approved the one-way merge in 06-CONTEXT.md discussion — treated as cleared, recorded here, not re-litigated (per plan instruction, same as D-79 in 06-01).
- 409 (not silent merge, not 400) for taken Telegrams: stealing a linked identity is the T-06-05 elevation case — the conflict must be explicit and side-effect-free.
- `lastMethod` rides on the `confirmation_required` 400 instead of a new status route: the 06-04 Account UI needs the D-93 warning BEFORE the second tap, and this is own-account metadata (no oracle, no extra surface).
- Every privilege change re-mints: link (cookie gains tid), unlink (cookie loses tid — otherwise the old cookie keeps TG-keyed access), change (anti-fixation, same as login).
- KeyCache dupe-drop inside the merge transaction: `@@unique([userId, keyId])` would P2002 the bulk re-point if both accounts ever held the same keyId — defense-in-depth, keyIds are globally unique in practice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Merge branch never inherited the telegramId**
- **Found during:** Tracer (integration: survivor lookup by telegramId → null after merged:true)
- **Issue:** Re-point + loser delete ran, but the survivor update omitted `telegramId` — the TG identity dangled on no row, unlink became a noop
- **Fix:** Survivor inherits `telegramId: tg` inside the same transaction
- **Files modified:** lib/accounts.ts
- **Verification:** merge vector green (one row, tid on survivor, session claims match)
- **Committed in:** cafb278 (tracer commit)

**2. [Rule 1 - Bug] UNIQUE violation from set-before-delete ordering**
- **Found during:** Tracer (direct service repro: P2002 on users after fix 1)
- **Issue:** Setting survivor.telegramId while the loser still held it violates UNIQUE within the transaction
- **Fix:** Loser delete lands BEFORE the survivor inherit update, same transaction
- **Files modified:** lib/accounts.ts
- **Verification:** service repro + full merge vector green
- **Committed in:** cafb278 (tracer commit)

**3. [Rule 1 - Bug] Route import depth off by one**
- **Found during:** Tracer (vitest: Cannot find module '../../../../lib/auth')
- **Issue:** New link/unlink routes used 4-level `../` like shallower routes; `app/api/auth/email/*/route.ts` needs 5 levels (register-route shape)
- **Fix:** Corrected to `../../../../../lib/*` in both routes; change route (one level deeper) uses 6 levels, verified against the tickets `[id]/messages` route
- **Files modified:** app/api/auth/email/link/route.ts, app/api/auth/email/unlink/route.ts
- **Verification:** suite imports resolve, 11/11 then 17/17 green
- **Committed in:** cafb278 (tracer commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs, all required for correctness)
**Impact on plan:** No scope creep. files_modified used exactly as planned; no new packages (T-06-SC clean).

## Issues Encountered

- `prisma db execute` prints only a success line (no result rows) — verified row counts via a `tsx` + `lib/prisma` script instead.
- `tsx -e` does not load `.env`/vitest dummies — debug scripts need the env block exported explicitly (same dummy values as `vitest.config.ts`).

## Threat Flags

None beyond the plan's `<threat_model>` — all new surface (dual-proof link, confirm-gated unlink, password rotation with re-mint) maps to registered T-06-05/T-06-06/T-06-03 with the planned mitigations implemented. No new packages (T-06-SC clean).

## Known Stubs

None — no placeholders, TODOs, or unwired paths. The `lastMethod` hint is a complete seam for the 06-04 UI warning, not a stub.

## Auth Gates

None — no external auth required; all verification ran against local `setwhite` with throwaway secrets.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready: 06-03 (reset mail via `PasswordReset` model + the register welcome hook), 06-04 (Account UI: link row → widget payload POST, unlink → two-tap ConfirmPanel driven by `confirmation_required`+`lastMethod`, change-password form against `current_password_wrong`).
- Note for 06-04: unlink response re-mints a tid-less cookie — the UI must `router.refresh()` after unlink so TG-keyed sections re-gate to the link prompt.
- AUTH-05 boundary documented in-test: Phase 6 registration has no mailbox proof, so N emails can claim N trials (one per account, atomic per account); anti-farm beyond that is out of Phase 6 scope.
- No blockers.

## Self-Check: PASSED

- New service/routes on disk: `lib/accounts.ts`, `link|unlink|password/change` routes FOUND
- Test file extended: 17/17 flow tests pass, full suite 42 files / 378 tests green, `tsc` clean
- Commits exist: `cafb278` FOUND, `b37f7f7` FOUND (verified via `git rev-parse`)
- No `STATE.md` / `ROADMAP.md` writes made (orchestrator-owned)
- DB clean: 0 `example.test` users, 0 `21x` TG rows

---
*Phase: 06-email-auth*
*Completed: 2026-10-05*
