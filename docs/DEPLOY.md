# 3set-white — Deploy Runbook (OPS-01)

Production deploy of the single-server topology to **64.188.97.106**, public
cabinet **`my.3set.online`**, White Label subscription host
**`sub.my.3set.online` → 144.31.93.193** (ARTEMIDA's IP, not ours).

> **Secret hygiene (D-77):** every real secret lives only in the server `.env`
> (mode `0600`) and a secret manager. Nothing in this runbook, the Dockerfile,
> the Compose file, the Nginx config, or the scripts contains a real secret —
> all placeholders are generated on the server. The root password is rotated and
> moved to the secret manager; SSH key access replaces password auth.

---

## 1. Prerequisites

On the server (`64.188.97.106`):

- Docker Engine + the Compose v2 plugin (`docker compose version`).
- The repo checked out at `/opt/3set-white` (or set `BACKUP_DIR` accordingly).
- SSH key access (password auth disabled); the rotated root password lives in
  the secret manager only.

## 2. Server `.env` (secrets, never committed)

Create `/opt/3set-white/.env` with `chmod 600`:

```bash
# In /opt/3set-white, as root
touch .env && chmod 600 .env
openssl rand -hex 32   # -> SESSION_SECRET
openssl rand -hex 24   # -> WEBHOOK_SECRET (>=16 chars)
openssl rand -hex 24   # -> DB_PASSWORD
openssl rand -hex 16   # -> CRON_SECRET (optional; closes /api/cron/reconcile if unset)
```

Populate the required vars (see `.env.example` for the full list). Required by
the fail-fast schema: `BOT_TOKEN`, `BOT_TEST_TOKEN`, `DATABASE_URL`,
`SESSION_SECRET` (≥32), `WEBHOOK_SECRET` (≥16), `ARTEMIDA_API_KEY`,
`PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET`. Also set in prod: `DB_PASSWORD`,
`BOT_MODE=webhook`, `ADMIN_TELEGRAM_IDS`, `WHITELABEL_HOST=sub.my.3set.online`,
`ARTEMIDA_LOW_BALANCE_RUB`. The Compose `web.environment` override rewrites
`DATABASE_URL` to the internal `db` host, but a value must still be present.

## 3. DNS checklist (Pitfall 6 / A8)

In Cloudflare:

| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| `my.3set.online` | A | `64.188.97.106` | **DNS only (grey cloud)** for first cert issuance |
| `sub.my.3set.online` | A | `144.31.93.193` | **DNS only (grey cloud)** |

- **No AAAA** records on either name. Verify: `dig AAAA sub.my.3set.online`
  must return **empty** (else paid users' sub-links break).
- `my.3set.online` stays DNS-only (grey cloud) for HTTP-01 first issuance; it
  may be re-proxied after the cert is issued, but DNS-only avoids Platega /
  Telegram webhook origin-IP surprises.

## 4. First TLS issuance (one-off)

The certbot sidecar only *renews*; first issuance is manual. Stop nginx so
certbot can bind 80 for HTTP-01:

```bash
cd /opt/3set-white
docker compose -f docker-compose.prod.yml stop nginx
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --standalone -d my.3set.online \
  --agree-tos --no-eff-email -m you@example.com --preferred-challenges http
docker compose -f docker-compose.prod.yml up -d nginx
```

The sidecar loop then renews via webroot (`/.well-known/acme-challenge/`).

## 5. Deploy

```bash
cd /opt/3set-white
scripts/backup.sh            # ALWAYS back up first (Pitfall 7)
scripts/deploy.sh            # git pull -> build -> up -d
```

Migrations run in the image entrypoint (`prisma migrate deploy`, forward-only —
never `migrate dev` in prod). First boot also runs `prisma generate` in the
builder, so the generated Prisma 7 client is present.

## 6. Webhooks (must be HTTPS on my.3set.online)

- **Telegram:** `setWebhook` to
  `https://my.3set.online/api/telegram/webhook/{WEBHOOK_SECRET}` with
  `secret_token={WEBHOOK_SECRET}` (the route checks both path and header).
- **Platega:** set the callback URL in the Platega LK to
  `https://my.3set.online/api/platega/callback` (header-verified, no signature).

## 7. Backup schedule + restore (D-78)

Cron (daily), as root:

```cron
0 3 * * * cd /opt/3set-white && scripts/backup.sh
```

- DB: `pg_dump` gzip to `/opt/3set-white/backups/db-<stamp>.sql.gz`.
- Uploads: ticket-attachment volume archive `uploads-<stamp>.tar.gz`.
- Retention: `+7` days pruned (`BACKUP_DIR`/`RETENTION_DAYS` overridable).
- **Copy both off-box** (the single server is also the only copy otherwise).

Restore (dry run): `gunzip -c db-<stamp>.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U setwhite setwhite`.

## 8. Rollback (Pitfall 7 — honest caveat)

```bash
scripts/rollback.sh /opt/3set-white/backups/db-<pre-deploy>.sql.gz
```

This restores the pre-deploy `pg_dump` AND checks out the previous commit.

> **An image redeploy alone does NOT roll back a migration.** Prisma has no
> automatic production rollback. The DB restore reverses a bad migration only
> if the dump predates it (plain-format dumps do not drop objects the migration
> added); otherwise ship a **forward-fix migration** and redeploy.

## 9. Monitoring checklist (D-78)

- **Health:** `curl -f https://my.3set.online/api/health` → `200`
  (`{ status:"ok", worker:true }`).
- **Worker:** `worker` must be `true`; if `false`, the outbox/broadcast/reminder
  drain is down.
- **ARTEMIDA balance:** watch `/admin` balance chip vs `ARTEMIDA_LOW_BALANCE_RUB`;
  `critical` (≤ 0) stops key issuance.
- **Disk/log caps:** `docker system df`; JSON logs are capped 10m×3 (Pitfall 8).
- **Cert renewals:** `docker compose -f docker-compose.prod.yml logs certbot`.

## 10. Dockerfile fixes (resolved this plan)

1. **Build-stage env:** the builder now sets non-secret placeholder ENV
   (`BOT_TOKEN=build-placeholder`, etc.) so `next build` passes the fail-fast
   `lib/env.ts` without any real secret in the image.
2. **Generated Prisma client:** the runner copies
   `--from=builder /app/generated ./generated` (Prisma 7 emits the client there)
   with a `next.config.ts` `outputFileTracingIncludes` entry as insurance.
