# Phase 7: User Setup Required

**Generated:** 2026-10-21
**Phase:** 07-analytics-foundation-revenue-metrics
**Status:** Incomplete

Complete these items for the nightly analytics rollup (ANL-15 / D-13) to run on
the live server. The code artifacts (route, rollup engine, backfill CLI,
Dockerfile copy, DEPLOY.md docs) are shipped by plans 07-01/07-02; what remains
requires root access to the production host.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [x] | `CRON_SECRET` | Already set in the server `.env` (used by the existing `/api/cron/reconcile` cron) — no new secret needed | server `.env` (already present) |

## Dashboard Configuration

- [ ] **Add the analytics cron line to the host crontab**
  - Location: Server `81.90.31.102` crontab (root) — next to the existing `0 3 * * *` backup entry (`docs/DEPLOY.md` §7 documents it)
  - Set to:

    ```cron
    5 3 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/analytics
    ```

  - Notes: 03:05 (not 03:00) — the 03:00 minute belongs to `pg_dump` of the same database (RESEARCH A5). The route re-rolls the last 7 MSK days each run; the absolute-value upsert makes repeated/skipped runs harmless.

## Verification

After deploying the phase and adding the crontab line:

```bash
# Secret present in .env?
grep CRON_SECRET /opt/3set-white/.env

# Route answers correctly after deploy:
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://dash.3set.online/api/cron/analytics                       # expect 401 (no header)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H "x-cron-secret: wrong" https://dash.3set.online/api/cron/analytics   # expect 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/analytics   # expect 200 {"ok":true,...}

# One-off history backfill (after first deploy, or after a data fix):
docker compose -f docker-compose.prod.yml exec web npx tsx --version   # tsx must exist in the image
docker compose -f docker-compose.prod.yml exec web npx tsx scripts/backfill-analytics.ts
```

Expected results: `401 / 401 / 200` for the route probe; the backfill prints a
range line (`backfill: range <first-paid-day> .. <yesterday> (MSK)`), month
chunks with `days=… upserted=…`, and a final `backfill: done days=N upserted=N`;
re-running it produces the same values (idempotent absolute upsert). A final
manual row stays for phase verification: pick a known past day and compare
`daily_metrics.paid_cash_rub` against a hand-written
`sum(final_amount - balance_used)` psql query over that MSK day.

---

**Once all items complete:** Mark status as "Complete" at top of file.
