#!/usr/bin/env bash
# deploy-local.sh — build the web image on the LOCAL machine (colima/docker)
# and upload it to the production host. This keeps the server free of the CPU,
# RAM and disk cost of `npm ci` + `next build`, which is what made the box
# "hang" during previous deploys.
#
# The built image is saved, gzipped, copied over SSH, loaded, and the `web`
# service is recreated by Compose. Migrations still run in the image ENTRYPOINT
# (`prisma migrate deploy`), exactly as with a server-side build.
#
# SECRETS: this script never contains or prints credentials. Supply them via
# the environment:
#   DEPLOY_SSH_PASS  — SSH password for the host (read by sshpass, never echoed)
#   DEPLOY_HOST       — e.g. root@212.192.14.166
#   DEPLOY_DIR        — remote checkout dir (default /opt/3set-white)
#   BOT_PUBLIC_USERNAME — build arg (defaults to threeSet_bot)
#
# Usage:  DEPLOY_SSH_PASS=... DEPLOY_HOST=root@host ./scripts/deploy-local.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${DEPLOY_SSH_PASS:-}" || -z "${DEPLOY_HOST:-}" ]]; then
  echo "error: set DEPLOY_SSH_PASS and DEPLOY_HOST" >&2
  exit 2
fi

DEPLOY_DIR="${DEPLOY_DIR:-/opt/3set-white}"
IMAGE="3set-white-web:local"
TARBALL="/tmp/3set-web.tar.gz"
PLATFORM="linux/amd64"
COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.ports.yml"

echo "==> build ${PLATFORM}"
docker build --platform "$PLATFORM" \
  --build-arg "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${BOT_PUBLIC_USERNAME:-threeSet_bot}" \
  -t "$IMAGE" .

echo "==> save + gzip"
docker save "$IMAGE" | gzip > "$TARBALL"
ls -lh "$TARBALL"

echo "==> upload to ${DEPLOY_HOST}:${DEPLOY_DIR}"
SSHPASS="$DEPLOY_SSH_PASS" sshpass -e scp \
  -o PubkeyAuthentication=no -o PreferredAuthentications=password \
  -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
  "$TARBALL" "${DEPLOY_HOST}:${DEPLOY_DIR}/3set-web.tar.gz"

echo "==> load image + recreate web container"
SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh \
  -o PubkeyAuthentication=no -o PreferredAuthentications=password \
  -o StrictHostKeyChecking=no -o ConnectTimeout=15 \
  "$DEPLOY_HOST" \
  "cd '$DEPLOY_DIR' && docker load < 3set-web.tar.gz && docker tag ${IMAGE} 3set-white-web:latest && rm -f 3set-web.tar.gz && $COMPOSE up -d web && $COMPOSE ps"

echo "==> done. Wait for the healthcheck, then verify dash.3set.online."
