#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOMAIN="${1:-ttlrecall.com}"
WWW_DOMAIN="www.${DOMAIN}"
WEB_ROOT="${2:-/var/www/ttlrecall.com}"
EMAIL="${3:-admin@${DOMAIN}}"
SOURCE_DIR="${4:-${REPO_ROOT}/logistics-engine/web}"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/setup-ttlrecall-ssl.sh"
  exit 1
fi

echo "[1/8] Installing nginx + certbot if missing..."
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx rsync

echo "[2/8] Preparing web root at ${WEB_ROOT}..."
mkdir -p "${WEB_ROOT}"

echo "[3/8] Deploying site files from ${SOURCE_DIR}..."
if [[ -d "${SOURCE_DIR}" ]]; then
  rsync -av --delete --exclude ".DS_Store" "${SOURCE_DIR}/" "${WEB_ROOT}/"
  echo "Deployment sync complete."
else
  echo "Warning: source directory not found (${SOURCE_DIR}). Skipping sync."
fi

if [[ ! -f "${WEB_ROOT}/index.html" ]]; then
  cat > "${WEB_ROOT}/index.html" <<EOF
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${DOMAIN}</title></head>
<body><h1>${DOMAIN} is live</h1></body>
</html>
EOF
fi

echo "[4/8] Writing nginx HTTP server block..."
cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

if [[ ! -L "/etc/nginx/sites-enabled/${DOMAIN}" ]]; then
  ln -s "${NGINX_CONF}" "/etc/nginx/sites-enabled/${DOMAIN}"
fi

if [[ -L /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

echo "[5/8] Validating and reloading nginx..."
nginx -t
systemctl reload nginx

echo "[6/8] Requesting Let's Encrypt certificate..."
certbot --nginx \
  -d "${DOMAIN}" \
  -d "${WWW_DOMAIN}" \
  --agree-tos \
  --email "${EMAIL}" \
  --non-interactive \
  --redirect

echo "[7/8] Verifying SSL auto-renew..."
systemctl enable certbot.timer >/dev/null 2>&1 || true
systemctl start certbot.timer >/dev/null 2>&1 || true
certbot renew --dry-run || true

echo "[8/8] Smoke tests..."
curl -sI "http://${DOMAIN}" | head -n 1
curl -sI "https://${DOMAIN}" | head -n 1

cat <<EOF

Done.
If HTTPS failed, verify DNS first:
- ${DOMAIN} A record -> your VPS public IP
- ${WWW_DOMAIN} A record -> your VPS public IP

EOF
