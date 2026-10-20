---
phase: 05-admin-deploy
plan: 06
subsystem: infra
tags: [docker, docker-compose, nginx, certbot, letsencrypt, deploy, backup, rollback, prisma, nextjs]

# Dependency graph
requires:
  - phase: 05-03
    provides: "Admin RBAC + admin BFF routes surfaced at /admin and /api/admin/**"
  - phase: 05-04
    provides: "Telegram webhook route (app/api/telegram/webhook/[secret]) and Platega callback route (app/api/platega/callback)"
  - phase: 05-07
    provides: "health endpoint (app/api/health/route.ts) consumed by the compose healthcheck"
provides:
  - "Production Dockerfile: build-stage placeholder env + generated Prisma client copied into the runner"
  - "docker-compose.prod.yml: web + db + nginx + certbot, db internal-only, log caps, healthcheck"
  - "nginx/my.3set.online.conf: TLS termination + ACME challenge + fixed proxy to web:3000"
  - "scripts/deploy.sh, scripts/backup.sh, scripts/rollback.sh"
  - "docs/DEPLOY.md deploy runbook (DNS, secrets, TLS, webhooks, backup, rollback, monitoring)"
affects: [05-admin-deploy]

# Actuals (#2632) — chars/4 over the realized diff (estimate was 100000, confidence: low)
actuals:
  tokens: 4066
  tasks: 4
  commits: 4

# Tech tracking
tech-stack:
  added: [] # no npm packages; official images only (postgres:17-alpine, nginx:alpine, certbot/certbot)
  patterns:
    - "Build-stage placeholder ENV satisfies fail-fast env schema without baking secrets (D-77)"
    - "Node native fetch healthcheck (node:24-bookworm-slim ships no wget/curl)"
    - "db service has no published ports; fixed proxy_pass (no user-derived upstream)"

key-files:
  created:
    - docker-compose.prod.yml
    - nginx/my.3set.online.conf
    - scripts/deploy.sh
    - scripts/backup.sh
    - scripts/rollback.sh
    - docs/DEPLOY.md
  modified:
    - Dockerfile
    - next.config.ts
    - .env.example

key-decisions:
  - "Certbot runs as a Compose sidecar (renewal loop); first issuance is a one-off owner `certonly --standalone` step"
  - "Web healthcheck uses Node native fetch rather than wget/curl (not present in node:24-bookworm-slim)"
  - "Backup mounts the running web container's volumes via --volumes-from (no hardcoded volume name)"

patterns-established:
  - "Secret hygiene: build uses placeholders, runtime reads the server .env (0600); no secret in image/git/scripts/nginx"
  - "Rollback honesty: image redeploy does not roll back a Prisma migration — restore pre-deploy pg_dump + previous commit, or ship a forward-fix migration"

requirements-completed: [] # OPS-01 is NOT marked complete until the owner's server verification (Task 5) passes.

# Coverage metadata (#1602). Every deliverable is server-gated, so human_judgment: true.
coverage:
  - id: D1
    description: "Dockerfile build-stage placeholder env + generated Prisma client copied into runner"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "grep Dockerfile for build-placeholder/generated + npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Static checks pass, but the actual `docker compose build` + `node server.js` boot can only be verified on the server (Docker unavailable on the dev Mac)."
  - id: D2
    description: "docker-compose.prod.yml topology (web + db + nginx + certbot)"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "grep compose for services/nginx/certbot + absence of published db/web ports"
        status: pass
    human_judgment: true
    rationale: "Compose file authored and statically verified; live `docker compose up` requires the server."
  - id: D3
    description: "Nginx TLS config + deploy/backup/rollback scripts"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "nginx conf has proxy_read_timeout 75s + client_max_body_size 8m; scripts executable"
        status: pass
    human_judgment: true
    rationale: "`nginx -t` and a live `curl https://my.3set.online/api/health` require the server."
  - id: D4
    description: "Deploy runbook (docs/DEPLOY.md) + server-side deploy verification"
    requirement: "OPS-01"
    verification: []
    human_judgment: true
    rationale: "Runbook is prose; the server-side deploy/webhook/backup/rollback checks it documents are owner-gated (Task 5, checkpoint:human-verify gate=blocking-human)."

# Metrics
duration: 40min
completed: 2026-10-05
status: complete
---

# Phase 5 Plan 6: Production Deploy Summary

**Single-server Docker Compose + Nginx/HTTPS production topology for my.3set.online: buildable image, prod Compose, TLS reverse proxy, deploy/backup/rollback scripts, and a full runbook — server verification owner-gated.**

## Performance

- **Duration:** ~40 min (two executor runs)
- **Started:** 2026-10-05T02:10:00Z (approx)
- **Completed:** 2026-10-05T02:50:36Z
- **Tasks:** 4 completed / 1 owner-gated (Task 5, blocking-human)
- **Files modified:** 9

## Accomplishments

- Fixed the two HIGH Dockerfile build blockers: builder sets non-secret placeholder ENV so `next build` passes the fail-fast `lib/env.ts`, and the runner copies `--from=builder /app/generated ./generated` (Prisma 7 client) with a `next.config.ts` tracing-include as insurance.
- Authored `docker-compose.prod.yml`: `web` + `db` + `nginx` + `certbot` with the DB port unpublished, log caps (10m×3), and a Node-native-fetch healthcheck against `/api/health`.
- Authored `nginx/my.3set.online.conf`: HTTP→HTTPS redirect + ACME challenge + TLS termination proxying to `web:3000` with `client_max_body_size 8m` and `proxy_read_timeout 75s`.
- Authored `scripts/deploy.sh`, `scripts/backup.sh`, `scripts/rollback.sh` (executable, secret-free) and `docs/DEPLOY.md` (runbook covering DNS grey-cloud, `.env` 0600, first TLS issuance, webhooks, backup/restore, rollback caveat, monitoring).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Dockerfile build blockers** — `757db4e` (fix)
2. **Task 2: Prod Compose topology** — `d1e019c` (feat)
3. **Task 3: Nginx TLS config + ops scripts** — `b565d62` (feat)
4. **Task 4: Deploy runbook** — `56c72b7` (docs)

**Plan metadata:** (this SUMMARY commit — see below)

## Files Created/Modified

- `Dockerfile` — build-stage placeholder ENV; runner copies `generated/`
- `next.config.ts` — `outputFileTracingIncludes` for `generated/prisma/**`
- `docker-compose.prod.yml` — prod web/db/nginx/certbot topology
- `.env.example` — added `DB_PASSWORD` placeholder
- `nginx/my.3set.online.conf` — TLS + proxy + limits
- `scripts/deploy.sh` — git pull → build → up -d
- `scripts/backup.sh` — pg_dump + uploads archive + retention
- `scripts/rollback.sh` — restore dump + previous commit (with migration caveat)
- `docs/DEPLOY.md` — full deploy runbook

## Decisions Made

- Certbot as a Compose sidecar (renewal loop via webroot); first issuance is a one-off owner `certonly --standalone` while nginx is stopped.
- Web healthcheck uses Node native `fetch` because `node:24-bookworm-slim` does not ship `wget`/`curl` (deviation from the plan's literal `wget --spider`).
- Backup uses `--volumes-from` on the running web container so the uploads volume name is resolved by Compose, not hardcoded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Healthcheck tool unavailable in image**
- **Found during:** Task 2 (Prod Compose)
- **Issue:** Plan/research specified `wget --spider` for the web healthcheck, but `node:24-bookworm-slim` installs only `openssl ca-certificates` — no `wget`/`curl`.
- **Fix:** Used Node's native `fetch` (always present in Node 24): `node -e "fetch('http://localhost:3000/api/health').then(...)"`.
- **Files modified:** `docker-compose.prod.yml`
- **Verification:** command is dependency-free in the base image; healthcheck path still `/api/health`.
- **Committed in:** `d1e019c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing-critical tooling)
**Impact on plan:** Correctness fix only — the healthcheck now actually runs in the shipped image. No scope creep.

## Owner-Gated Server Verification (Task 5 — NOT PERFORMED, NOT FABRICATED)

The plan's final task is a `checkpoint:human-verify gate="blocking-human"`. Docker and the live server are unavailable to this agent, so **no server-side check has been performed**. The owner must run, on 64.188.97.106 (per `docs/DEPLOY.md`):

1. `docker compose -f docker-compose.prod.yml build` and confirm `node server.js` boots (no missing-env/generated-client crash).
2. `nginx -t` in the nginx container; `curl -f https://my.3set.online/api/health` → 200.
3. TLS issued; Telegram `setWebhook` → `https://my.3set.online/api/telegram/webhook/{WEBHOOK_SECRET}` and Platega callback → `https://my.3set.online/api/platega/callback`.
4. A `pg_dump` backup restores in a dry run.
5. The rollback path is exercised in a dry run.
6. `dig AAAA sub.my.3set.online` returns empty.

`OPS-01` is **not** marked complete until this verification passes and is recorded by the continuation agent.

## User Setup Required

- `vps` (64.188.97.106): install Docker + Compose plugin; create `/opt/3set-white/.env` (0600); add SSH key; rotate root password into the secret manager.
- `cloudflare-dns`: `my.3set.online A → 64.188.97.106` (grey cloud for first cert); `sub.my.3set.online A → 144.31.93.193` (no AAAA, DNS Only).

## Next Phase Readiness

- Phase 5 admin/deploy artifacts are complete; the single remaining gate is the owner's live-server deploy verification (Task 5).
- Blocking: server deploy verification is a human gate — nothing further is implementable from the dev Mac.

---
*Phase: 05-admin-deploy*
*Completed: 2026-10-05 (local artifacts; server verification pending)*
