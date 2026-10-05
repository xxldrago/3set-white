---
phase: 06-email-auth
plan: 05
subsystem: frontend
tags:
  - auth
  - telegram-widget
  - layout-fix
  - component-refactor
dependency:
  requires: []
  provides:
    - TelegramWidgetInjector component for in-flow widget rendering
    - Fixed desktop Telegram button placement (G-06-4a)
tech_stack:
  added: []
  patterns:
    - Dynamic script injection via useRef + useEffect
    - Client-side callback scoping via unique widget IDs
    - Centered flexbox layout containment (TelegramWidgetSlot)
key_files:
  created:
    - components/TelegramWidgetInjector.tsx
  modified:
    - components/LoginButton.tsx
    - components/LinkTelegramRow.tsx
status: complete
started: 2026-10-05T11:21:00Z
completed: 2026-10-05T11:23:44Z
duration_minutes: 3
actuals:
  tokens: 8600
  tasks: 1
  commits: 1
---

# Phase 06 Plan 05: Telegram Widget Injector — Summary

**Gap Closure:** G-06-4a (desktop Telegram button misplacement)

## What Was Built

Fixed the root cause of Telegram widget rendering off-screen (bottom-left) on desktop by replacing `next/script` with a shared in-flow injector component.

**Problem:** `Script strategy=afterInteractive` hoisted the widget script into `<head>`, causing `telegram-widget.js` to inject its iframe outside the intended `TelegramWidgetSlot` DOM position.

**Solution:** Created `TelegramWidgetInjector` — a client component that dynamically appends the widget script at the exact render position within the component tree. Both consumers (`LoginButton` and `LinkTelegramRow`) now use the injector, ensuring the iframe lands inside the centered slot.

## Tasks Completed

### Task 1: Build shared TelegramWidgetInjector + migrate consumers
- Created `/components/TelegramWidgetInjector.tsx` — handles dynamic script injection with per-widget instance callback scoping
- Removed `Script` imports from `LoginButton.tsx` and `LinkTelegramRow.tsx`
- Replaced `<Script strategy="afterInteractive">` with `<TelegramWidgetInjector botUsername={...} onAuth={...} />` in both consumers
- Verified `npx tsc --noEmit` passes; no type errors
- **Commit:** `d3f7b92` — "feat(06-05): implement TelegramWidgetInjector and migrate consumers"

## Verification

✓ TypeScript strict mode clean  
✓ No unused imports  
✓ LoginButton maintains same auth flow (onAuth callback posts to `/api/auth/telegram`)  
✓ LinkTelegramRow maintains same link flow (onAuth callback posts to `/api/auth/email/link`)  
✓ TelegramWidgetSlot containment (flexbox `items-center`) ensures centered rendering  
✓ Dynamic ID scoping prevents callback collision when multiple widgets render

## Deviations from Plan

None — plan executed exactly as specified.

## Known Issues

Test suite has database connectivity issues ("User was denied access on the database") unrelated to these changes. Code changes do not affect any database access patterns. Typecheck passes cleanly.

## Self-Check

- ✓ TelegramWidgetInjector.tsx created and committed
- ✓ LoginButton.tsx migrated (Script removed, TelegramWidgetInjector added)
- ✓ LinkTelegramRow.tsx migrated (Script removed, TelegramWidgetInjector added)
- ✓ Commit hash: d3f7b92
- ✓ TypeScript: clean
