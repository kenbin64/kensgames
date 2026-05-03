#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOMAIN="${1:-dimensionos.net}"
WWW_DOMAIN="www.${DOMAIN}"
EMAIL="${3:-kenetics.art@gmail.com}"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

# Auto-detect the kensgames.com web root. The GH Actions workflow rsyncs to
# /var/www/kensgames.com/public, but legacy deploy.sh uses /var/www/kensgames.com.
# Caller can override with arg 2.
if [[ -n "${2:-}" ]]; then
  WEB_ROOT="$2"
elif [[ -d /var/www/kensgames.com/public/x-dimensional ]]; then
  WEB_ROOT=/var/www/kensgames.com/public
elif [[ -d /var/www/kensgames.com/x-dimensional ]]; then
  WEB_ROOT=/var/www/kensgames.com
else
  WEB_ROOT=/var/www/kensgames.com/public
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/setup-dimensionos-ssl.sh"
  exit 1
fi

echo "[1/7] Installing nginx + certbot if missing..."
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

echo "[2/7] Verifying shared web root at ${WEB_ROOT}..."
if [[ ! -d "${WEB_ROOT}/x-dimensional" ]]; then
  echo "Error: ${WEB_ROOT}/x-dimensional not found."
  echo "       Deploy the kensgames repo to ${WEB_ROOT} first so the paradigm pages exist."
  echo "       (Either fix the GH Actions VPS_SSH_KEY secret and re-push, or rsync"
  echo "        the x-dimensional/ tree manually from a working clone of the repo.)"
  exit 1
fi

echo "[3/7] Writing nginx HTTP server block for ${DOMAIN}..."
cat > "${NGINX_CONF}" <<EOF
# dimensionos.net — X-Dimensional Programming paradigm
# Shares the /var/www/kensgames.com web root so paradigm pages stay in sync
# with the kensgames repo. Root path lands on the reading sequence.

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    # Land visitors on the paradigm reading sequence.
    location = / {
        return 302 /x-dimensional/;
    }

    # Allow direct access to the paradigm tree and its absolute-path assets
    # (/x-dimensional/, /lib/, /assets/, /docs/, /js/).
    location / {
        try_files \$uri \$uri/ =404;
    }

    # Lock the rest of the kensgames portal down on this domain — this site
    # is the paradigm, not the games portal. Anything not under the
    # whitelisted prefixes returns 404 so the two domains stay distinct.
    location ~ ^/(?!x-dimensional|lib|assets|docs|js|favicon|robots\.txt|\.well-known) {
        return 404;
    }

    gzip on;
    gzip_types text/html text/plain text/css text/javascript application/javascript application/json image/svg+xml;
    gzip_min_length 1000;
}
EOF

if [[ ! -L "/etc/nginx/sites-enabled/${DOMAIN}" ]]; then
  ln -s "${NGINX_CONF}" "/etc/nginx/sites-enabled/${DOMAIN}"
fi

echo "[4/7] Validating and reloading nginx..."
nginx -t
systemctl reload nginx

echo "[5/7] Requesting Let's Encrypt certificate..."
certbot --nginx \
  -d "${DOMAIN}" \
  -d "${WWW_DOMAIN}" \
  --agree-tos \
  --email "${EMAIL}" \
  --non-interactive \
  --redirect

echo "[6/7] Verifying SSL auto-renew..."
systemctl enable certbot.timer >/dev/null 2>&1 || true
systemctl start certbot.timer >/dev/null 2>&1 || true
certbot renew --dry-run || true

echo "[7/7] Smoke tests..."
curl -sI "http://${DOMAIN}"  | head -n 1
curl -sI "https://${DOMAIN}" | head -n 1
curl -sI "https://${DOMAIN}/x-dimensional/identity/" | head -n 1
curl -sI "https://${DOMAIN}/x-dimensional/saddle/"   | head -n 1

cat <<EOF

Done.

If HTTPS failed, verify DNS first:
  ${DOMAIN}      A  ->  $(curl -s ifconfig.me 2>/dev/null || echo 'your VPS public IP')
  ${WWW_DOMAIN}  A  ->  $(curl -s ifconfig.me 2>/dev/null || echo 'your VPS public IP')

Once DNS resolves, re-run this script.
EOF
