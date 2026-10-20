---
phase: 01-foundation
plan: '01'
subsystem: infra
tags: [nextjs, vitest, telegraf, github, secret-hygiene]

# Dependency graph
requires: []
provides:
  - Runnable Next.js 16 scaffold (3set-white) with pinned deps installed
  - Green vitest runner with four Wave 0 stub specs (skipped)
  - Secret hygiene (.gitignore + placeholder-only .env.example)
  - Private GitHub repo 3set-white with main pushed and clean history
affects: [01-foundation-02, 01-foundation-03, 01-foundation-04]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff, lockfile excluded), never a harness token count.
actuals:
  tokens: 4600
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: [next@16.3.7, react@19.2.8, telegraf@4.16.3, jose@6.2.12, zod@4.6.5, pino@10.3.1, prisma@^7.10.0, @prisma/client@7.10.0, vitest@5.0.3, tsx@^4.19.2, tailwindcss@^4]
  patterns: [single Next app scaffold (app/ + @/* alias), vitest tests/unit glob, placeholder-only .env.example]

key-files:
  created: [package.json, vitest.config.ts, tests/unit/auth-widget.test.ts, tests/unit/auth-initdata.test.ts, tests/unit/session.test.ts, tests/unit/i18n.test.ts, .gitignore, .env.example]
  modified: []

key-decisions:
  - "Scaffolded via create-next-app into /tmp then merged into repo root (root already held .planning/ + AGENTS.md, so in-place scaffolding would risk clobbering planning artifacts)"
  - "@types/node bumped ^20 to ^24 to satisfy vitest 5.0.3 peerOptional range"
  - "Task 3 produced no file commit — the push of task 1-2 commits to the new private remote IS the deliverable"

patterns-established:
  - "Pinned installs only: never bare prisma (latest tag is 8.0.0-rc.19)"
  - "Wave 0 stub specs are describe.skip placeholders; real known-answer vectors land in plan 01-03"

requirements-completed: [OPS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Scaffold builds and boots; pinned installs match RESEARCH pins"
    requirement: "OPS-03"
    verification:
      - kind: other
        ref: "npm run build (exit 0, static prerender of / and /_not-found)"
        status: pass
      - kind: other
        ref: "npm ls telegraf jose zod pino vitest + npx prisma --version (7.10.0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "vitest exits zero with four stub specs collected as skipped"
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit (4 files skipped, 12 tests skipped, no FAILED)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Env files ignored; example file tracked with placeholders only"
    verification:
      - kind: other
        ref: "git check-ignore -q .env && git check-ignore -q .env.local && test -f .env.example"
        status: pass
    human_judgment: false
  - id: D4
    description: "Remote is private, main is pushed, history scan reports clean"
    requirement: "OPS-03"
    verification:
      - kind: other
        ref: "gh repo view 3set-white --json visibility (PRIVATE) + token-shape grep over git log --all -p (HISTORY_CLEAN)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-09-30
status: complete
---

# Phase 01 Plan 01: Scaffold + Test Runner + GitHub Repo Summary

**Next.js 16 scaffold with pinned Telegraf/jose/zod/pino/Prisma-7 deps, green vitest runner with four Wave 0 stub specs, and private GitHub repo 3set-white pushed with secret-clean history**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-30T19:28:00Z
- **Completed:** 2026-09-30T19:38:00Z
- **Tasks:** 3 of 3
- **Files modified:** 24 (22 scaffold + test, 2 hygiene)

## Accomplishments
- Single-Next-app scaffold (TS + Tailwind + App Router + ESLint, `@/*` alias) installed in repo root; `npm run build` green
- Pinned runtime deps installed: telegraf 4.16.3, jose 6.2.12, zod 4.6.5, pino 10.3.1; dev: prisma ^7.10.0 (resolved 7.10.0), @prisma/client 7.10.0, vitest 5.0.3, tsx ^4.19.2; next 16.3.7, react 19.2.8 (CNA-resolved peer)
- `npx vitest run tests/unit` green: 4 stub specs collected, 12 tests skipped, zero failures (real known-answer vectors land in plan 01-03)
- `.gitignore` covers all env variants with `!.env.example` exception; `.env.example` documents BOT_TOKEN, BOT_TEST_TOKEN, DATABASE_URL, SESSION_SECRET, WEBHOOK_SECRET, BOT_MODE as placeholders only
- GitHub repo `xxldrago/3set-white` created **private**, local main pushed, full-history token-shape grep clean (HISTORY_CLEAN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer: scaffold boots and test runner is green end-to-end** - `17af3bc` (feat)
2. **Task 2: Secret hygiene plus env example** - `08f1a0b` (chore)
3. **Task 3: GitHub repo create plus first push plus history scan** - no file commit (tracked tree clean; the `gh repo create --private --source=. --push` of commits 1-2 IS the deliverable, verified on origin/main)

_Note: Task 3's `<files>` (.gitignore, .env.example) were already committed by Task 2; pushing them to the new private remote completed the task with no remaining diff._

## Files Created/Modified
- `package.json` - renamed to 3set-white, pinned runtime/dev deps, `test` script
- `package-lock.json` - resolved install (prisma 7.10.0, vitest 5.0.3)
- `vitest.config.ts` - vitest config for `tests/unit/**/*.test.ts`, node environment
- `tests/unit/auth-widget.test.ts` - Wave 0 stub (4 skipped placeholders; real HMAC vectors in 01-03)
- `tests/unit/auth-initdata.test.ts` - Wave 0 stub (4 skipped placeholders)
- `tests/unit/session.test.ts` - Wave 0 stub (3 skipped placeholders)
- `tests/unit/i18n.test.ts` - Wave 0 stub (1 skipped placeholder)
- `app/`, `public/`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `README.md` - create-next-app scaffold output
- `.gitignore` - CNA template + `!.env.example` exception so the example stays trackable
- `.env.example` - six placeholder keys with header warning, no real values

## Decisions Made
- Scaffolded via `create-next-app` into `/tmp/cna-scaffold` then merged into the repo root instead of scaffolding in place: the root already held `.planning/`, `AGENTS.md`, `.git`, and in-place scaffolding risked prompts/clobbering. Merged only app scaffold files; root `AGENTS.md` left untouched; CNA-generated `AGENTS.md`/`CLAUDE.md` not copied.
- `@types/node` bumped `^20` → `^24` (deviation Rule 3, recorded below).
- `gh repo view` returns visibility as `PRIVATE` (uppercase); the plan's verify expectation of lowercase `private` was matched case-insensitively — remote is private per OQ-3 default.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @types/node ^20 conflicts with vitest 5.0.3 peer range**
- **Found during:** Task 1 (Tracer: scaffold boots and test runner is green end-to-end)
- **Issue:** `npm install` failed with ERESOLVE — vitest 5.0.3 declares `peerOptional @types/node@^22.0.0 || >=24.0.0`, but the CNA scaffold pins `@types/node@^20`
- **Fix:** Bumped `@types/node` to `^24` (matches Node 24 runtime already in use, v24.15.0)
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm install` succeeds; `npx vitest run tests/unit` green
- **Committed in:** 17af3bc (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal — type-package major bump only, aligned with the Node 24 runtime. No scope creep. No architectural changes (Rule 4 not triggered).

## Issues Encountered
- Vitest prints a cosmetic warning about ESM syntax in `vitest.config.ts` under `configLoader: 'native'` (package.json lacks `"type": "module"`). Exit code stays zero and the run is green; left as-is since renaming to `.mts` would deviate from the plan's `vitest.config.ts` artifact contract. Later plans may silence it if it becomes noisy.
- `create-next-app` resolved react 19.2.8 rather than the RESEARCH-verified 19.3.0 (CNA peer resolution at scaffold time). Next 16.3.7 peer requirement is satisfied; recorded here for plan 01-02+ awareness.

## User Setup Required
None - no external service configuration required. (Note for later plans: a Telegram test-bot token from BotFather is still needed before bot dev-testing, per RESEARCH Environment Availability — out of scope for this plan.)

## Next Phase Readiness
- Scaffold, green runner, secret hygiene, and pushed private repo are all in place — plans 01-02 (PWA shell), 01-03 (lib/auth.ts + real test vectors), and 01-04+ can build directly on this base.
- No blockers. Watch item: react 19.2.8 vs 19.3.0 drift is cosmetic; Prisma `latest`-tag still points at v8-RC — every future install must keep the `^7.10.0` pin.

## Self-Check: PASSED
- All 8 key files exist on disk (package.json, vitest.config.ts, 4 stub specs, .gitignore, .env.example) — verified via task verifications.
- Commits `17af3bc` and `08f1a0b` exist in `git log` and on `origin/main`.
- Remote `xxldrago/3set-white` reports PRIVATE; history grep reports HISTORY_CLEAN.

---
*Phase: 01-foundation*
*Completed: 2026-09-30*
