# Phase 6: Email Auth — Deferred Items

Out-of-scope discoveries logged during plan execution (not fixed; see deviation
scope boundary in the executor contract).

## From plan 06-08 (Telegram widget callback regression)

| Category | Item | Location | Status | Notes |
|----------|------|----------|--------|-------|
| lint-error (pre-existing) | `react-hooks/set-state-in-effect` — `setWebappAvailable(...)` called synchronously in the effect body | `components/LoginButton.tsx:44` | open | Present before 06-08 (verified against `HEAD~1` via `eslint --stdin`); the effect also performs a legitimate post-mount external-system read. Fixing requires a lazy-init/hydration-safe redesign, i.e. out of this plan's scope. Does not affect `tsc` or vitest. |
| lint-warning (pre-existing) | `@next/next/no-location-assign-relative-destination` — `window.location.href = '/'` after successful auth | `components/LoginButton.tsx:40` | open | Predates 06-08. |
| lint-warning (pre-existing) | `react-hooks/exhaustive-deps` — `ref.current` read in the effect cleanup | `components/TelegramWidgetInjector.tsx:61` | open | Predates 06-08 (cleanup copied `ref.current` before this plan too). |
