#!/usr/bin/env bash
# provision-subdomain.sh — host-side companion for admin-assigned partner
# subdomains (see middleware.ts + SubdomainControl).
#
# The owner adds DNS manually (`<name>.3set.online A → this host`); this
# script does everything else on the box: certbot HTTP-01 cert for the exact
# host (non-interactive, idempotent — skips when a live cert exists),
# an nginx include carrying `<name>.3set.online`, and a config test + reload.
# Safe to re-run. Run as root on 64.188.97.106 AFTER the DNS record exists:
#
#   sudo bash scripts/provision-subdomain.sh partner1
#
# Wildcard alternative (one shot, needs DNS-01 + a provider plugin):
#   certbot certonly --manual --preferred-challenges dns -d '*.3set.online'
# and a single `server_name *.3set.online` vhost — then per-subdomain certs
# are unnecessary. This script covers the no-plugin path instead.
set -euo pipefail

NAME="${1:-}"
if [[ ! "$NAME" =~ ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ ]]; then
  echo "usage: $0 <subdomain>   (a-z, 0-9, hyphen; e.g. partner1)" >&2
  exit 2
fi
case "$NAME" in
  www|my|api|admin|app|status|mail|cdn|static|sub|smtp|ftp|blog|support|pay)
    echo "refusing reserved name: $NAME" >&2
    exit 2
    ;;
esac

HOST="${NAME}.3set.online"
CONF_DIR="/etc/nginx/sites-available"
CONF="${CONF_DIR}/3set-sub-${NAME}.conf"
EMAIL="${CERTBOT_EMAIL:-admin@3set.online}"

echo "==> DNS check: $HOST must resolve to this host"
if ! getent hosts "$HOST" >/dev/null; then
  echo "DNS for $HOST does not resolve yet — add the A record first." >&2
  exit 3
fi

if [[ ! -f "/etc/letsencrypt/live/${HOST}/fullchain.pem" ]]; then
  echo "==> certbot HTTP-01 for $HOST"
  certbot certonly --nginx --non-interactive --agree-tos \
    --email "$EMAIL" -d "$HOST"
else
  echo "==> cert exists for $HOST, skipping issuance"
fi

if [[ ! -f "$CONF" ]]; then
  echo "==> writing $CONF (proxies to the compose web on 127.0.0.1:3001)"
  cat > "$CONF" <<EOF
# Managed by scripts/provision-subdomain.sh — partner host $HOST.
server {
    listen 80;
    server_name $HOST;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $HOST;

    ssl_certificate /etc/letsencrypt/live/$HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$HOST/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
  ln -sf "$CONF" /etc/nginx/sites-enabled/ 2>/dev/null || true
else
  echo "==> vhost $CONF exists, keeping it"
fi

echo "==> nginx -t && reload"
nginx -t && systemctl reload nginx
echo "OK: https://$HOST → cabinet (partner attribution via /sub/$NAME)"
