#!/usr/bin/env bash
# deploy.sh — production deploy for 3set-white (D-76): git pull → build → up -d.
# Migrations run inside the image entrypoint (`prisma migrate deploy`, forward-only).
#
# Secrets are read only from the server `.env` (gitignored) and are never
# printed. Run `scripts/backup.sh` BEFORE deploying (see docs/DEPLOY.md).
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> git pull"
git pull --ff-only

echo "==> build images"
$COMPOSE build

echo "==> start services (migrations run in the web entrypoint)"
# `up -d` recreates changed containers; the web entrypoint runs
# `prisma migrate deploy && node server.js` on every start.
$COMPOSE up -d

echo "==> verify containers"
$COMPOSE ps

echo "Deploy complete. Webhook/DNS/monitoring steps: docs/DEPLOY.md"
echo "Reminder: run scripts/backup.sh BEFORE the next deploy."
