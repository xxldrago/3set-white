---
phase: 15
plan: '15'
type: execute
wave: 1
depends_on: [13, 14]
files_modified:
  - lib/reminder-service.ts
  - app/api/cron/remind/route.ts
  - app/admin/retention/save-list/page.tsx
  - app/admin/retention/upsell/page.tsx
  - components/admin/SaveListTable.tsx
  - components/admin/UpsellRadarTable.tsx
  - app/api/admin/retention/save-list/route.ts
  - app/api/admin/retention/upsell/route.ts
  - app/api/admin/retention/bulk-remind/route.ts
  - lib/i18n/messages/ru.ts
autonomous: true
requirements: [EXT-01, EXT-02]

must_haves:
  truths:
    - "Save-list shows keys expiring in ≤7 days not renewed with owner contact"
    - "Reminders sent T-7/T-3/T-1 via outbox with MSK day key and stage-aware dedup"
    - "autorenew.ts not modified"
    - "Upsell radar shows heavy users on low tariffs"
    - "Bulk send uses broadcast with preview"
    - "Quiet hours 21:00-10:00 MSK for user pushes defer to 10:00"
  artifacts:
    - app/admin/retention/save-list/page.tsx
    - app/admin/retention/upsell/page.tsx
    - lib/reminder-service.ts extended

---

# Phase 15: Expiry Save-List & Upsell Radar

**Goal:** Admin sees keys expiring soon and heavy users on low tariffs, can send reminders.

## Tasks

<task type="auto">
  <name>Task 1: Extend reminder system for T-7/T-3/T-1 with MSK keys</name>
  <files>lib/reminder-service.ts, app/api/cron/remind/route.ts</files>
  <action>
    Extend reminder logic to support stages 7,3,1 days before expiry.
    Use MSK day key in dedup: `remind:{keyId}:{stage}:{mskDay}`
    Defer to 10:00 MSK during quiet hours 21:00-10:00
  </action>
  <verify><automated>npx tsc --noEmit</automated></verify>
</task>

<task type="auto">
  <name>Task 2: Save-list page and API</name>
  <files>app/admin/retention/save-list/page.tsx, app/api/admin/retention/save-list/route.ts, components/admin/SaveListTable.tsx</files>
  <action>
    Create save-list showing expiring keys (≤7 days), not renewed, with owner contact.
    Filter by segment, show renewal history, last reminder stage.
  </action>
  <verify><automated>npx tsc --noEmit</automated></verify>
</task>

<task type="auto">
  <name>Task 3: Upsell radar page and API</name>
  <files>app/admin/retention/upsell/page.tsx, app/api/admin/retention/upsell/route.ts, components/admin/UpsellRadarTable.tsx</files>
  <action>
    Score users by traffic/devices vs tariff limits.
    Exclude trials, churned, open tickets, offered in last 30 days.
    Mark stale if traffic >48h old.
  </action>
  <verify><automated>npx tsc --noEmit</automated></verify>
</task>

<task type="auto">
  <name>Task 4: Bulk remind with broadcast preview</name>
  <files>app/api/admin/retention/bulk-remind/route.ts</files>
  <action>
    Bulk send reminders via existing broadcast mechanism with recipient count preview.
    Idempotent by key/stage/day.
  </action>
  <verify><automated>npx tsc --noEmit</automated></verify>
</task>

</tasks>

<verification>
- `npx tsc --noEmit`
- `npm run build`
</verification>

<success_criteria>
- EXT-01: Save-list with T-7/T-3/T-1 reminders ✓
- EXT-02: Upsell radar ✓
</success_criteria>
