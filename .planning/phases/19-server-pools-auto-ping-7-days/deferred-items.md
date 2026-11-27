# Phase 19 / Plan 19-01 — Deferred & Out-of-Scope Items

## Out-of-scope pre-existing suite failures (NOT caused by 19-01)

Full-suite `npx vitest run tests/unit` → 860 passed / 8 failed in 5 unrelated files.
All failures are pre-existing and outside this plan's files; per the scope-boundary
rule they were **not** fixed. Focused verification for this plan is green:
`npx tsc --noEmit` exit 0; `npx vitest run tests/unit/server-pool.test.ts
tests/unit/mobile-servers-route.test.ts tests/unit/servers-source.test.ts` → 41/41 passed;
`npx prisma validate` exit 0.

| File | Failing test | Why out of scope |
|------|--------------|------------------|
| `tests/unit/env.test.ts` | defaults WHITELABEL_HOST to `sub.my.3set.online` | `lib/env.ts:60` default is `our.3set.online`; unrelated to servers route |
| `tests/unit/whitelabel.test.ts` | reads WL host from env | same env default mismatch |
| `tests/unit/artemida-client.test.ts` (2) | subscriptionUrl / createKey normalization | same WHITELABEL_HOST rewrite mismatch |
| `tests/unit/i18n.test.ts` | dictionary has no unused keys | 3 unused `bot.guidesApp*` keys from unrelated work |
| `tests/unit/analytics-phase11-loaders.test.ts` (3) | recomputeAllRfm / loadSegments / thresholds | phase-11 analytics DB loaders, unrelated |

## Deferred by locked decisions (not implemented here)

- **REQ-POOL-04 `load` bar** — deferred per CONTEXT D-04; no `load` field served, no simulation.
- **ARTEMIDA `/pricing`** — superseded for `/servers` by CONTEXT D-01; source is subscription-links.
- **`getKeyWithLinks`** — does not exist; `getSubscriptionForUserId` is the canonical read.
- **`[ASSUMED]` real ARTEMIDA `links[]` payload** — re-verify on a live paid key in staging (only a `vless://placeholder` probe was observable here). Parser is tolerant with a scheme allowlist.

## Plan 19-02 — out-of-scope pre-existing issues (NOT caused by 19-02)

| Check | Result | Why out of scope |
|-------|--------|------------------|
| `cd mobile && flutter analyze` | exit 1, 1583 `info`/`warning` lints in pre-existing files (`test/widget/features/auth/*` single quotes / long lines, `analysis_options.yaml` legacy plugin warning, duplicate imports in two auth tests) | 0 issues in files created by 19-02; the same 1583 pre-existing issues were present before this plan. Not fixed per scope-boundary rule. |
| `npx tsc --noEmit` (repo root) | errors in untracked pre-existing `app/api/admin/promos/directory/route.ts` + `lib/admin-promos-directory.ts` (missing sibling modules) | Files predate 19-02 and are unrelated to the mobile ping slice; no backend file was touched here. |

## Plan 19-02 — intentionally not runnable in this environment

- **Android native `.so` build** — requires OpenJDK 17 + Android SDK/NDK (absent here). `mobile/native/libbox_shim/build.sh android` is provided for CI; the app ships the silent `Socket.connect` fallback (implemented in 19-03) when the artifact is absent.
- **iOS `.xcframework` packaging / on-device URLTest** — Xcode build script is provided, but no device UAT in this env. Native artifact is a gitignored CI output.
- **GPL-3.0 legal review** — recorded blocker (dynamic linking + source offer), Phase 23; not resolved here.

## Plan 19-07 — out-of-scope pre-existing issues (NOT caused by 19-07)

| Check | Result | Why out of scope |
|-------|--------|------------------|
| `cd mobile && flutter analyze` | exit 1 with 1630 pre-existing `info` lints (baseline before this plan: 1622). 0 errors and 0 warnings. The 8 additional infos are the unavoidable framework-wide `package:flutter/material.dart` deprecation notice on each new file (the entire repo uses `material.dart`). All other new-file lints were cleaned to zero. | Lint baseline predates 19-07; per scope-boundary rule not fixed here. Focused verification: `flutter analyze <new files>` has 0 errors/0 warnings; `flutter test test/widget/features/servers/` → 11/11 passed. |
| Router swap / `/shop` route / bottom-nav removal in `app/router.dart` | intentionally NOT touched in 19-07 (owned by 19-08) | `ServerPoolScreen` itself has no `NavigationBar`; the legacy router still compiles until 19-08. |
