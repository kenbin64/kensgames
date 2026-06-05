#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy: dimensionalprogramming.com
# Run as: sudo bash deploy-dimensionalprogramming.sh
# Source: /var/www/kensgames.com/public  (the git repo)
# Target: /var/www/dimensionalprogramming.com/public
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ┌──────────────────────────────────────────────┐"
echo "  │  z = x · y  —  Dimensional Programming       │"
echo "  │  Deploy → dimensionalprogramming.com          │"
echo "  └──────────────────────────────────────────────┘"
echo -e "${NC}"

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Run as root: sudo bash $0${NC}"
  exit 1
fi

REPO_PATH="/var/www/kensgames.com/public"
DEPLOY_PATH="/var/www/dimensionalprogramming.com/public"
BACKUP_PATH="/var/www/backups/dimensionalprogramming.com"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
NGINX_CONF="/etc/nginx/sites-available/dimensionalprogramming.com.conf"

# ── 1. Fix permissions ───────────────────────────────────────────────────────
echo -e "${YELLOW}[1/5] Fixing permissions on $DEPLOY_PATH ...${NC}"
chown -R butterfly:butterfly "$DEPLOY_PATH"
chmod -R 775 "$DEPLOY_PATH"
echo -e "${GREEN}✓ Permissions fixed${NC}"

# ── 2. Backup ────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/5] Backing up existing deployment...${NC}"
mkdir -p "$BACKUP_PATH"
if [ -f "$DEPLOY_PATH/index.html" ]; then
  tar czf "$BACKUP_PATH/backup_$TIMESTAMP.tar.gz" "$DEPLOY_PATH" 2>/dev/null || true
  echo -e "${GREEN}✓ Backup: $BACKUP_PATH/backup_$TIMESTAMP.tar.gz${NC}"
else
  echo -e "${YELLOW}  No existing deployment to back up${NC}"
fi

# ── 3. Deploy files ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/5] Deploying files...${NC}"

mkdir -p "$DEPLOY_PATH/docs"

# Main page
cp "$REPO_PATH/dimensional-programming/index.html" "$DEPLOY_PATH/index.html"

# Markdown documents (for download buttons)
for f in DIMENSIONAL_PROGRAMMING.md DIMENSIONAL_PROGRAMMING_STRATEGY.md RUSSIAN_DOLL_HELLO_WORLD.md; do
  if [ -f "$REPO_PATH/docs/$f" ]; then
    cp "$REPO_PATH/docs/$f" "$DEPLOY_PATH/docs/$f"
    echo -e "  ${GREEN}✓${NC} docs/$f"
  fi
done

# Set ownership
chown -R butterfly:butterfly "$DEPLOY_PATH"
chmod -R 664 "$DEPLOY_PATH"
find "$DEPLOY_PATH" -type d -exec chmod 775 {} \;

echo -e "${GREEN}✓ Files deployed to $DEPLOY_PATH${NC}"

# ── 4. Update nginx config ───────────────────────────────────────────────────
echo -e "${YELLOW}[4/5] Updating nginx config...${NC}"

cat > "$NGINX_CONF" << 'NGINXEOF'
# dimensionalprogramming.com — Dimensional Programming paradigm site
# Serves the standalone index.html at root.
# Manifold IDE remains accessible at /manifold-ide/

server {
    listen 80;
    listen [::]:80;
    server_name dimensionalprogramming.com www.dimensionalprogramming.com;

    location /.well-known/acme-challenge/ {
        root /var/www/dimensionalprogramming.com/public;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dimensionalprogramming.com www.dimensionalprogramming.com;

    ssl_certificate     /home/butterfly/apps/butterflyfx/nginx/ssl/dimensionalprogramming.crt;
    ssl_certificate_key /home/butterfly/apps/butterflyfx/nginx/ssl/dimensionalprogramming.key;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Content-Type-Options   nosniff;
    add_header X-Frame-Options          SAMEORIGIN;
    add_header X-XSS-Protection         "1; mode=block";
    add_header Referrer-Policy          strict-origin-when-cross-origin;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    access_log /var/log/nginx/dimensionalprogramming.access.log;
    error_log  /var/log/nginx/dimensionalprogramming.error.log;

    root  /var/www/dimensionalprogramming.com/public;
    index index.html;

    # Auth gate API proxy
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    }

    # Manifold IDE at its own path
    location ^~ /manifold-ide/ {
        try_files $uri $uri/ /manifold-ide/index.html;
    }

    # Everything else — serve real files, fall back to homepage
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Markdown downloads — force download header
    location ~* \.md$ {
        add_header Content-Disposition "attachment";
        add_header Content-Type "text/markdown; charset=utf-8";
    }

    gzip on;
    gzip_types text/html text/plain text/css text/javascript application/javascript application/json text/markdown;
    gzip_min_length 1000;
}
NGINXEOF

echo -e "${GREEN}✓ Nginx config updated${NC}"

# ── 5. Test + reload nginx ───────────────────────────────────────────────────
echo -e "${YELLOW}[5/5] Testing and reloading nginx...${NC}"
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
  echo -e "${GREEN}✓ Nginx reloaded${NC}"
else
  echo -e "${RED}Nginx config test failed — check /etc/nginx/sites-available/dimensionalprogramming.com.conf${NC}"
  nginx -t
  exit 1
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗"
echo    "║  ✓  dimensionalprogramming.com deployed          ║"
echo -e "╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  https://dimensionalprogramming.com"
echo "  https://dimensionalprogramming.com/manifold-ide/  (IDE preserved)"
echo "  https://dimensionalprogramming.com/docs/DIMENSIONAL_PROGRAMMING.md"
echo ""
