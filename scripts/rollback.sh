#!/usr/bin/env bash
# rollback.sh — restore a pre-deploy DB dump + deploy the previous commit (D-78).
#
# HONEST CAVEAT (Pitfall 7): an image redeploy alone does NOT roll back a
# Prisma migration. This script restores the pre-deploy pg_dump (which reverses
# the data/schema effect of a bad migration only if the dump predates it) AND
# checks out the previous commit. If a migration added tables/columns and the
# dump is plain-format, a forward-fix migration may still be required — see
# docs/DEPLOY.md "Rollback" for the full caveat.
#
# Usage: scripts/rollback.sh /path/to/pre-deploy-db-*.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  echo "Usage: scripts/rollback.sh /path/to/pre-deploy-db-*.sql.gz" >&2
  exit 1
fi
if [ ! -f "$DUMP" ]; then
  echo "Dump not found: $DUMP" >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> restore DB from $DUMP"
gunzip -c "$DUMP" | $COMPOSE exec -T db psql -U setwhite setwhite

echo "==> checkout previous commit"
git checkout HEAD~1

echo "==> rebuild + restart previous code"
$COMPOSE build
$COMPOSE up -d

echo "Rollback complete (DB restore + previous commit)."
echo "WARNING: redeploying an image does NOT undo a migration by itself —"
echo "see docs/DEPLOY.md 'Rollback' for the migration caveat."
