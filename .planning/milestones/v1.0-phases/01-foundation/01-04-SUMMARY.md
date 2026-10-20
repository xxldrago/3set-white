---
phase: 01-foundation
plan: '04'
subsystem: pwa-cabinet
tags: [pwa, manifest, i18n, telegram-login, install-prompt]

# Dependency graph
requires: [01-foundation-01]
provides:
  - Installable RU PWA shell (manifest + layout + session-aware home page)
  - Typed RU key dictionary with missing/unused completeness spec
  - Login page with Telegram widget + WebApp bridges posting to plan 01-03 auth route
  - Static connection guides (v2rayNG / Streisand / Hiddify) + install prompt
affects: [01-foundation-03]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff, lockfile excluded), never a harness token count.
actuals:
  tokens: 7000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [MetadataRoute.Manifest PWA route, viewport-exported themeColor, typed leaf-path i18n keys, source-scanning key-completeness spec, beforeinstallprompt capture component]

key-files:
  created: [app/manifest.ts, scripts/check-manifest.mjs, lib/i18n/messages/ru.ts, lib/i18n/index.ts, public/icons/icon-192.png, public/icons/icon-512.png, public/icons/icon-maskable-512.png, app/login/page.tsx, app/guides/page.tsx, components/LoginButton.tsx, components/InstallPrompt.tsx]
  modified: [app/layout.tsx, app/page.tsx, tests/unit/i18n.test.ts]

key-decisions:
  - "Task 1 shell page shipped with hardcoded RU copy, then migrated to i18n keys in task 3 — the dictionary did not exist at tracer time and the plan's file split requires it"
  - "Task 2 + 3 implemented in one working tree before the task 2 commit: the unused-keys spec can only pass once consumers exist, so verify ran over the combined tree and commits stayed per-task"
  - "app/page.tsx and app/layout.tsx edited in task 3 though absent from its file list — D-16 key-based strings plus the unused-keys spec require zero hardcoded RU copy"
  - "Widget bot username read from NEXT_PUBLIC_TELEGRAM_BOT_USERNAME; unset in Phase 1 renders the note without the script — no dead config, no crash"

patterns-established:
  - "i18n scanner rule: every t() call must use a string literal — variable indirection (SECTIONS map) is invisible to the completeness spec"
  - "Placeholder icons are dependency-free pure-node PNGs (dark bg + amber center square), trivially replaceable at the same public/icons paths"

requirements-completed: [CAB-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Manifest endpoint serves a valid installable manifest with 192 plus 512 icons"
    requirement: "CAB-05"
    verification:
      - kind: other
        ref: "npm run build (exit 0, routes /, /guides, /login, /manifest.webmanifest) + node scripts/check-manifest.mjs (MANIFEST_OK name=3set VPN display=standalone icons=192x192,512x512,512x512)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cabinet shell renders login state aware pages in Russian through i18n keys"
    requirement: "CAB-05"
    verification:
      - kind: unit
        ref: "npx vitest run tests/unit/i18n.test.ts (3 passed: non-empty dict, no missing keys, no unused keys)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit clean; full suite 3 passed / 11 skipped (01-01 baseline stubs untouched)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Install prompt appears where supported and never blocks web use"
    verification:
      - kind: other
        ref: "InstallPrompt renders null without beforeinstallprompt; dismiss sets local state only, all page content stays reachable"
        status: pass
    human_judgment: true
  - id: D4
    description: "Static connection guides readable on a phone viewport"
    verification:
      - kind: other
        ref: "guides page is static server-rendered sections with mobile-first Tailwind layout; real-device read remains manual"
        status: pass
    human_judgment: true

# Metrics
duration: 12min
completed: 2026-09-30
status: complete
---

# Phase 01 Plan 04: Installable RU PWA Shell + Login + Guides Summary

**Installable RU PWA shell with manifest smoke proof, typed key dictionary with completeness spec, Telegram login bridges, static guides, and graceful install prompt — no offline claims, no install gating**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-30T12:54:32Z
- **Completed:** 2026-09-30T13:06:00Z
- **Tasks:** 3 of 3
- **Files modified:** 14 (11 created, 3 modified)

## Accomplishments

- `app/manifest.ts` serves RU manifest (`3set VPN`, standalone, portrait, 192/512/maskable icons); smoke script boots prod `next start`, asserts name/display/icons, prints `MANIFEST_OK`
- Root layout: `<html lang="ru">`, `viewport`-exported `themeColor` (never `metadata`), Apple touch icon + `appleWebApp` meta for iOS (ASSUMP-CAB-05-IOS)
- Session-aware home page branches on `3set_session` cookie presence only — no runtime dependency on plan 01-03's verifier
- Typed RU dictionary (24 keys) + `t()` helper with `LeafPaths` dot-path union; completeness spec scans `app/`, `components/`, `lib/` and fails on any missing OR unused key
- Login page + `LoginButton`: Telegram widget via `next/script` (`data-onauth` → `POST /api/auth/telegram`) + WebApp `initData` bridge; posts to the verified auth route only, no client-side trust decisions (T-04-01 mitigated)
- Guides page: static v2rayNG / Streisand / Hiddify sections per D-14; `InstallPrompt` captures `beforeinstallprompt` behind install + dismiss buttons, renders null where unsupported
- Zero hardcoded RU copy in pages/components; no offline-support claims anywhere (Serwist deferred per D-13)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer: manifest served and shell page renders from the prod build** - `5649b07` (feat)
2. **Task 2: RU key dictionary plus placeholder icons** - `d972e5e` (feat)
3. **Task 3: Login plus guides pages with client bridges** - `0d15807` (feat)

## Files Created/Modified

- `app/manifest.ts` - RU manifest route (standalone, portrait, 3-icon set)
- `app/layout.tsx` - lang ru, viewport themeColor, Apple meta, metadata via `t()` (modified from scaffold)
- `app/page.tsx` - session-aware shell skeleton, all strings via `t()` + InstallPrompt (modified from scaffold)
- `app/login/page.tsx` - login screen embedding LoginButton + InstallPrompt
- `app/guides/page.tsx` - static v2rayNG/Streisand/Hiddify guides with back link
- `components/LoginButton.tsx` - widget embed + initData bridge, generic error only (no reason oracle)
- `components/InstallPrompt.tsx` - beforeinstallprompt capture, install + dismiss, null when unsupported
- `lib/i18n/messages/ru.ts` - 24-key typed RU dictionary (EN-ready shape)
- `lib/i18n/index.ts` - `t()` lookup with key-fallback + `I18nKey` export
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` - pure-node placeholder PNGs (dark + amber square, obviously temporary)
- `scripts/check-manifest.mjs` - prod-server manifest smoke check with MANIFEST_OK marker
- `tests/unit/i18n.test.ts` - 3-test completeness spec (non-empty, no missing, no unused)

## Decisions Made

- Task 1 page shipped with hardcoded RU first because the dictionary (task 2) did not exist yet; task 3 migrated it to keys. Sequencing necessity, not scope change.
- Tasks 2 + 3 were implemented in one working tree before the task 2 commit because the unused-keys spec is only satisfiable once consumers exist; verification ran over the combined tree while commits stayed per-task per the plan's file lists.
- `app/page.tsx` / `app/layout.tsx` edited in task 3 despite absence from its `<files>` — D-16 (key-based strings) plus the unused-keys gate leave no room for hardcoded copy survivors.
- Widget username from `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (unset in Phase 1 → note text only, no broken script tag); real username lands with the test-bot token in a later plan.
- Guides sections written as explicit literals, not a `SECTIONS` key-map — the spec's literal scanner cannot see variable indirection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n spec ROOT off by one (`tests/unit` + three `..` = repo parent)**
- **Found during:** Task 2 verify (all 24 keys reported unused)
- **Issue:** `join(HERE, '..', '..', '..')` from `tests/unit/` escapes the repo, so the source scan found zero files
- **Fix:** Corrected to `join(HERE, '..', '..')`
- **Files modified:** tests/unit/i18n.test.ts
- **Committed in:** d972e5e (part of task commit)

**2. [Rule 2 - Missing critical] Task 3 file list omitted `app/page.tsx` / `app/layout.tsx`, leaving hardcoded RU copy**
- **Found during:** Task 3 (unused-keys spec + D-16 requires zero hardcoded copy)
- **Issue:** Tracer-time hardcoded strings in page/layout would strand `home.*` / `app.*` keys as unused and violate D-16
- **Fix:** Migrated both files to `t()` keys; layout metadata now resolves through the dictionary
- **Files modified:** app/page.tsx, app/layout.tsx
- **Committed in:** 0d15807 (part of task commit)

**3. [Rule 1 - Bug] Guides `SECTIONS` key-map invisible to the literal key scanner**
- **Found during:** Task 3 verify (6 guides keys reported unused)
- **Issue:** `t(s.titleKey)` passes variables; the spec regex only matches `t('literal')`
- **Fix:** Rewrote guides page with direct literal `t('guides.…')` calls
- **Files modified:** app/guides/page.tsx
- **Committed in:** 0d15807 (part of task commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing-critical, 1 bug)
**Impact on plan:** No scope creep. All deviations serve the plan's own acceptance criteria (completeness gate green, no hardcoded copy). No architectural changes (Rule 4 not triggered).

## Issues Encountered

- None beyond the three auto-fixed deviations above.

## User Setup Required

- **Owner icon verdict (ASSUMP-CAB-05-LOGO, human-check):** placeholder icons in `public/icons/` are dark-background PNGs with an amber center square — obviously temporary by design. Owner reviews on a phone and either approves or supplies the real logo at the same three paths (no code change needed for the swap).
- **Real-device install proof (ASSUMP-CAB-05-IOS):** iOS ignores `beforeinstallprompt`; Apple touch icon + meta ship, but install proof on a real device stays manual before verify-work.
- **Telegram bot username:** `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` unset — widget script renders once the test-bot token/username exists (BotFather, owner action, already tracked as a Phase 1 dependency).

## Next Phase Readiness

- Plan 01-03 can own `POST /api/auth/telegram` unchanged — `LoginButton` already posts both payload shapes (Widget object, `{ initData }`) to that contract path.
- `t()` + `LeafPaths` union means new UI strings are compile-checked: a typo'd key fails `tsc`, a missing/unused key fails vitest.
- Watch item: `npm run build` prerenders `/login` and `/guides` statically — when 01-03 adds cookie-dependent reads to those routes, add `export const dynamic = 'force-dynamic'` if prerender output goes stale.

## Threat Flags

None beyond the plan's own register — all new surface maps to already-covered threats:
- `LoginButton` bridge → T-04-01 (posts to verified auth route only, no client trust, httpOnly cookie untouched) — mitigated as planned.
- Static pages → T-04-02 (no per-user rendering) — accepted as planned.
- Placeholder icons → T-04-03 (static assets, no code path) — accepted as planned.

## Known Stubs

None — no placeholder values flow to any rendering path. The placeholder *icons* are intentional temporary artwork (owner verdict pending, tracked above), not code stubs; the missing bot username degrades to note text, not a dead control.

## Self-Check: PASSED

- All 11 created + 3 modified key files exist on disk (verified via build + `git status`).
- Commits `5649b07`, `d972e5e`, `0d15807` exist in `git log`; no unintended deletions (`git diff --diff-filter=D` empty on all three).
- `npm run build` green (/, /guides, /login, /manifest.webmanifest); `node scripts/check-manifest.mjs` prints MANIFEST_OK; `npx tsc --noEmit` clean; `npx vitest run tests/unit` 3 passed / 11 skipped (baseline stubs).
- No secrets committed; no offline claims in copy or UI.
- Post-write check: SUMMARY file on disk, all three task commits in `git log --all` — verified 2026-09-30.

---
*Phase: 01-foundation*
*Completed: 2026-09-30*
