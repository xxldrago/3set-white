# Phase 15: Expiry Save-List & Upsell Radar — Context

**Phase:** 15  
**Milestone:** v1.2 Стабилизация и качество  
**Requirements:** EXT-01, EXT-02  
**Depends on:** Phase 13 (outbox/notify), Phase 14 (sources/segments)  

## Goals

1. **Save-list**: Keys expiring in ≤7 days, not renewed, with owner contact. Send reminders T-7/T-3/T-1 via outbox/cron with MSK day key and stage-aware deduplication.
2. **Upsell radar**: Heavy users on low tariffs with upgrade potential.

## Key Decisions

- **Cadence:** T-7, T-3, T-1 (reminders already exist for T-3)
- **Idempotency:** `remind:{keyId}:{stage}:{mskDay}` - stage + MSK day key (not UTC)
- **Don't touch autorenew.ts** (money path)
- **Quiet hours:** Defer user pushes 21:00–10:00 MSK to 10:00
- **Exclusions:** autoRenew with sufficient balance, open ticket on key, bot-blocked (403), trial keys (separate copy)
- **Bulk send** via existing broadcast with preview
- **Upsell exclusions:** trial, churned/at-risk, open ticket, offered in last 30 days
- **Freshness:** traffic >48h old marked stale

## Success Criteria
- Save-list with filters, T-7/T-3/T-1 reminders
- Upsell radar with scoring
- Bulk send with preview
