#!/usr/bin/env bash
# backup.sh — DB dump + uploads-volume archive (D-78). Run BEFORE every deploy.
#
# Writes gzip archives to $BACKUP_DIR (default /opt/3set-white/backups) with
# retention pruning (default 7 days). Never reads or prints secrets.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/opt/3set-white/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date +%F-%H%M%S)"
COMPOSE="docker compose -f docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"

echo "==> pg_dump (db)"
$COMPOSE exec -T db pg_dump -U setwhite setwhite \
  | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

echo "==> archive uploads volume (ticket attachments)"
# Mount the running web container's volumes (--volumes-from) into a throwaway
# alpine container so we don't depend on the app image shipping tar, and so the
# volume name is resolved by Compose rather than hardcoded.
WEB_CID="$($COMPOSE ps -q web)"
docker run --rm --volumes-from "$WEB_CID" -v "$BACKUP_DIR:/backup" alpine \
  tar -czf "/backup/uploads-$STAMP.tar.gz" -C /data/uploads .

echo "==> prune backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name 'db-*.sql.gz'      -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Backup complete:"
echo "  $BACKUP_DIR/db-$STAMP.sql.gz"
echo "  $BACKUP_DIR/uploads-$STAMP.tar.gz"
echo "Copy both off-box (see docs/DEPLOY.md)."
