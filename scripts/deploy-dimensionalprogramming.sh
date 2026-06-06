#!/bin/bash
# =============================================================================
# Deploy: dimensionalprogramming.com
# Run as: sudo bash scripts/deploy-dimensionalprogramming.sh
#
# Source:  /var/www/kensgames.com/public  (git repo on VPS)
# Target:  /var/www/dimensionalprogramming.com/public
#
# What this deploys:
#   /                       <- dimensional-programming/index.html
#   /space-travel.html      <- dimensional-programming/space-travel.html (ITA showcase)
#   /manifold-ai/           <- full manifold-ai directory (agent, monitor, engine)
#   /x-dimensional/         <- proof system and experiments
#   /docs/                  <- markdown downloads
#   /js/                    <- shared JS utilities (schwarz-router etc.)
#
# Fixes the butterflyfx redirect by:
#   1. Using Let's Encrypt cert (same pattern as butterflyfx.us.conf)
#   2. Ensuring the config is symlinked in sites-enabled
#   3. Removing any catch-all redirects that pointed away from this domain
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  z = x · y  --  Dimensional Programming          │"
echo "  │  Deploy --> dimensionalprogramming.com            │"
echo "  │  Endpoints: / + /space-travel + /manifold-ai/    │"
echo "  │             /x-dimensional/ + /docs/             │"
echo "  └──────────────────────────────────────────────────┘"
echo -e "${NC}"

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}Run as root: sudo bash scripts/$0${NC}"
  exit 1
fi

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_PATH="/var/www/kensgames.com/public"
DEPLOY_PATH="/var/www/dimensionalprogramming.com/public"
BACKUP_PATH="/var/www/backups/dimensionalprogramming.com"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
NGINX_AVAIL="/etc/nginx/sites-available/dimensionalprogramming.com.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/dimensionalprogramming.com.conf"
DOMAIN="dimensionalprogramming.com"
LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
FALLBACK_CERT="/home/butterfly/apps/butterflyfx/nginx/ssl/dimensionalprogramming.crt"
FALLBACK_KEY="/home/butterfly/apps/butterflyfx/nginx/ssl/dimensionalprogramming.key"

# ── Step 1: Ensure deploy directory exists ────────────────────────────────────
echo -e "${YELLOW}[1/6] Ensuring target directory exists...${NC}"
mkdir -p "$DEPLOY_PATH"
mkdir -p "$BACKUP_PATH"
mkdir -p "$DEPLOY_PATH/docs"
mkdir -p "$DEPLOY_PATH/manifold-ai/js"
mkdir -p "$DEPLOY_PATH/manifold-ai/css"
mkdir -p "$DEPLOY_PATH/x-dimensional"
mkdir -p "$DEPLOY_PATH/js"
echo -e "${GREEN}✓ Directories ready${NC}"

# ── Step 2: Backup ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] Backing up existing deployment...${NC}"
if [ -f "$DEPLOY_PATH/index.html" ]; then
  tar czf "$BACKUP_PATH/backup_$TIMESTAMP.tar.gz" -C "$DEPLOY_PATH" . 2>/dev/null || true
  echo -e "${GREEN}✓ Backup: $BACKUP_PATH/backup_$TIMESTAMP.tar.gz${NC}"
else
  echo -e "${YELLOW}  No existing deployment to back up${NC}"
fi

# ── Step 3: Deploy files ──────────────────────────────────────────────────────
echo -e "${YELLOW}[3/6] Deploying files from $REPO_PATH ...${NC}"

# Root page
cp "$REPO_PATH/dimensional-programming/index.html" "$DEPLOY_PATH/index.html"
echo -e "  ${GREEN}✓${NC} index.html  (main paradigm page)"

# ITA Space Travel showcase
cp "$REPO_PATH/dimensional-programming/space-travel.html" "$DEPLOY_PATH/space-travel.html"
echo -e "  ${GREEN}✓${NC} space-travel.html  (Interdimensional Transit Authority)"

# Manifold AI directory -- agent, monitor, engine, modules
rsync -a --delete \
  --exclude='*.test.js' \
  "$REPO_PATH/manifold-ai/" "$DEPLOY_PATH/manifold-ai/"
echo -e "  ${GREEN}✓${NC} manifold-ai/  (agent, monitor, engine, substrates)"

# x-dimensional proof system
rsync -a --delete \
  "$REPO_PATH/x-dimensional/" "$DEPLOY_PATH/x-dimensional/"
echo -e "  ${GREEN}✓${NC} x-dimensional/  (proof system, saddle, experiments)"

# Shared JS utilities
if [ -d "$REPO_PATH/js" ]; then
  rsync -a "$REPO_PATH/js/" "$DEPLOY_PATH/js/"
  echo -e "  ${GREEN}✓${NC} js/  (schwarz-router, shared utilities)"
fi

# Markdown downloads
for f in DIMENSIONAL_PROGRAMMING.md DIMENSIONAL_PROGRAMMING_STRATEGY.md RUSSIAN_DOLL_HELLO_WORLD.md; do
  if [ -f "$REPO_PATH/docs/$f" ]; then
    cp "$REPO_PATH/docs/$f" "$DEPLOY_PATH/docs/$f"
    echo -e "  ${GREEN}✓${NC} docs/$f"
  fi
done

# Set ownership and permissions
chown -R butterfly:butterfly "$DEPLOY_PATH"
find "$DEPLOY_PATH" -type f -exec chmod 664 {} \;
find "$DEPLOY_PATH" -type d -exec chmod 775 {} \;
echo -e "${GREEN}✓ All files deployed${NC}"

# ── Step 4: Determine SSL certificate to use ─────────────────────────────────
echo -e "${YELLOW}[4/6] Checking SSL certificate...${NC}"

SSL_CERT=""
SSL_KEY=""

if [ -f "$LE_CERT" ] && [ -f "$LE_KEY" ]; then
  SSL_CERT="$LE_CERT"
  SSL_KEY="$LE_KEY"
  echo -e "${GREEN}✓ Using Let's Encrypt cert: $LE_CERT${NC}"
elif [ -f "$FALLBACK_CERT" ] && [ -f "$FALLBACK_KEY" ]; then
  SSL_CERT="$FALLBACK_CERT"
  SSL_KEY="$FALLBACK_KEY"
  echo -e "${YELLOW}  Using fallback cert: $FALLBACK_CERT${NC}"
  echo -e "${YELLOW}  (Run: certbot --nginx -d dimensionalprogramming.com -d www.dimensionalprogramming.com)${NC}"
else
  echo -e "${YELLOW}  No cert found. Attempting certbot...${NC}"
  if command -v certbot &>/dev/null; then
    certbot certonly --nginx \
      -d dimensionalprogramming.com \
      -d www.dimensionalprogramming.com \
      --non-interactive --agree-tos \
      --email admin@butterflyfx.us || {
      echo -e "${RED}Certbot failed -- deploying HTTP-only config.${NC}"
      echo -e "${RED}Fix SSL manually then re-run this script.${NC}"
    }
    if [ -f "$LE_CERT" ]; then
      SSL_CERT="$LE_CERT"
      SSL_KEY="$LE_KEY"
      echo -e "${GREEN}✓ Let's Encrypt cert issued${NC}"
    fi
  fi
fi

# ── Step 5: Write nginx config ────────────────────────────────────────────────
echo -e "${YELLOW}[5/6] Writing nginx config...${NC}"

if [ -n "$SSL_CERT" ]; then
  # Full HTTPS config
  cat > "$NGINX_AVAIL" << NGINXEOF
# =============================================================================
# dimensionalprogramming.com -- nginx config
# Generated by scripts/deploy-dimensionalprogramming.sh on $TIMESTAMP
#
# Endpoints:
#   /                  Dimensional Programming paradigm page
#   /space-travel.html Interdimensional Transit Authority showcase
#   /manifold-ai/      Manifold Agent, Monitor, AI engine, substrates
#   /x-dimensional/    Proof system, saddle surface, experiments
#   /docs/             Markdown spec downloads
#   /js/               Shared utilities
# =============================================================================

# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name dimensionalprogramming.com www.dimensionalprogramming.com;

    location /.well-known/acme-challenge/ {
        root /var/www/dimensionalprogramming.com/public;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dimensionalprogramming.com www.dimensionalprogramming.com;

    ssl_certificate     ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
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

    # Auth API proxy (shared with kensgames auth server)
    location ^~ /api/auth/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Authorization \$http_authorization;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    }

    # Ollama API proxy (for manifold agent local LLM)
    location ^~ /api/ollama/ {
        rewrite ^/api/ollama/(.*) /\$1 break;
        proxy_pass http://127.0.0.1:11434;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    }

    # Manifold AI directory -- serve ES modules with correct MIME type
    location ^~ /manifold-ai/ {
        try_files \$uri \$uri/ =404;
        # ES modules need correct Content-Type
        types {
            text/javascript  js mjs;
            application/json json;
        }
        # No caching for development; set cache headers for production
        add_header Cache-Control "no-cache";
    }

    # x-dimensional proof system
    location ^~ /x-dimensional/ {
        try_files \$uri \$uri/ /x-dimensional/index.html;
    }

    # Markdown files -- force download
    location ~* \.md$ {
        add_header Content-Disposition "attachment";
        add_header Content-Type "text/markdown; charset=utf-8";
    }

    # Static assets -- cache aggressively
    location ~* \.(css|js|mjs|png|jpg|jpeg|gif|svg|ico|woff2?|ttf)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files \$uri =404;
    }

    # Everything else -- serve real file or fall back to index
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    gzip on;
    gzip_vary on;
    gzip_types
        text/html text/plain text/css text/javascript
        application/javascript application/json text/markdown
        image/svg+xml;
    gzip_min_length 1000;
}
NGINXEOF

else
  # HTTP-only fallback (no cert available)
  cat > "$NGINX_AVAIL" << NGINXEOF
# dimensionalprogramming.com -- HTTP only (no cert found)
# Re-run deploy script after obtaining SSL cert.
server {
    listen 80;
    listen [::]:80;
    server_name dimensionalprogramming.com www.dimensionalprogramming.com;

    root  /var/www/dimensionalprogramming.com/public;
    index index.html;

    location ^~ /manifold-ai/ {
        try_files \$uri \$uri/ =404;
        types { text/javascript js mjs; application/json json; }
    }

    location ^~ /x-dimensional/ {
        try_files \$uri \$uri/ /x-dimensional/index.html;
    }

    location ~* \.md$ {
        add_header Content-Disposition "attachment";
        add_header Content-Type "text/markdown; charset=utf-8";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    gzip on;
    gzip_types text/html text/plain text/css text/javascript application/javascript application/json;
}
NGINXEOF
  echo -e "${YELLOW}  Warning: HTTP-only config written. Get a cert and re-run.${NC}"
fi

echo -e "${GREEN}✓ Nginx config written: $NGINX_AVAIL${NC}"

# Symlink into sites-enabled (this is what activates the config)
if [ ! -L "$NGINX_ENABLED" ]; then
  ln -sf "$NGINX_AVAIL" "$NGINX_ENABLED"
  echo -e "${GREEN}✓ Symlinked to sites-enabled${NC}"
else
  echo -e "${GREEN}✓ sites-enabled symlink already exists${NC}"
fi

# ── Step 5.5: Remove STALE redirect configs for this domain ───────────────────
# Older setups pointed dimensionalprogramming.com -> butterflyfx.us/dimensional-programming
# with a separate 301 config. If such a file shadows our real config nginx may
# serve the redirect instead of the pages. Disable any *dimensionalprogramming*
# config (other than the canonical one we just wrote) that still issues a
# redirect. NAME-SCOPED on purpose: this can never match butterflyfx.us.conf or
# any other domain's config — it only touches files named for THIS domain.
echo -e "${YELLOW}[5.5] Scanning for stale ${DOMAIN} redirect configs...${NC}"
STALE_BACKUP="/var/www/backups/nginx-stale-redirects"
mkdir -p "$STALE_BACKUP"
_removed_stale=0
for cfg in /etc/nginx/sites-enabled/*dimensionalprogramming* /etc/nginx/sites-available/*dimensionalprogramming*; do
  [ -e "$cfg" ] || continue
  # Never touch the canonical config we manage.
  case "$(readlink -f "$cfg" 2>/dev/null || echo "$cfg")" in
    "$(readlink -f "$NGINX_AVAIL" 2>/dev/null || echo "$NGINX_AVAIL")") continue ;;
  esac
  [ "$cfg" = "$NGINX_ENABLED" ] && continue
  # Only disable it if it actually performs a redirect / points at butterflyfx.
  if grep -qsE 'return[[:space:]]+30[12]|rewrite[[:space:]].*(butterflyfx|dimensional-programming)|proxy_pass.*butterflyfx' "$cfg"; then
    echo -e "  ${YELLOW}Disabling stale redirect config: $cfg${NC}"
    cp -aL "$cfg" "$STALE_BACKUP/$(basename "$cfg").$TIMESTAMP.bak" 2>/dev/null || true
    if [ -L "$cfg" ]; then rm -f "$cfg"; else mv "$cfg" "${cfg}.disabled.$TIMESTAMP"; fi
    _removed_stale=$((_removed_stale + 1))
  fi
done
if [ "$_removed_stale" -gt 0 ]; then
  echo -e "${GREEN}✓ Disabled $_removed_stale stale redirect config(s) (backed up to $STALE_BACKUP)${NC}"
else
  echo -e "${GREEN}✓ No stale redirect configs found${NC}"
fi

# ── Step 6: Test + reload nginx ───────────────────────────────────────────────
echo -e "${YELLOW}[6/6] Testing and reloading nginx...${NC}"

if nginx -t 2>&1; then
  systemctl reload nginx
  echo -e "${GREEN}✓ Nginx reloaded${NC}"
else
  echo -e "${RED}Nginx config test failed.${NC}"
  echo -e "${RED}Check: nginx -t${NC}"
  echo -e "${RED}Config: $NGINX_AVAIL${NC}"
  exit 1
fi

# ── Smoke test ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}Running smoke tests...${NC}"
sleep 2

check_url() {
  local url="$1"
  local expected="${2:-200}"
  local code
  code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 8 "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $url ($code)"
  else
    echo -e "  ${YELLOW}?${NC} $url (got $code, expected $expected)"
  fi
}

check_url "https://dimensionalprogramming.com/"
check_url "https://dimensionalprogramming.com/space-travel.html"
check_url "https://dimensionalprogramming.com/manifold-ai/agent.html"
check_url "https://dimensionalprogramming.com/manifold-ai/monitor.html"
check_url "https://dimensionalprogramming.com/manifold-ai/index.html"
check_url "https://dimensionalprogramming.com/x-dimensional/index.html"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗"
echo    "║  z = x · y  --  dimensionalprogramming.com deployed          ║"
echo -e "╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  https://dimensionalprogramming.com/"
echo "  https://dimensionalprogramming.com/space-travel.html"
echo "  https://dimensionalprogramming.com/manifold-ai/"
echo "  https://dimensionalprogramming.com/manifold-ai/agent.html"
echo "  https://dimensionalprogramming.com/manifold-ai/monitor.html"
echo "  https://dimensionalprogramming.com/x-dimensional/"
echo "  https://dimensionalprogramming.com/docs/DIMENSIONAL_PROGRAMMING.md"
echo ""
echo -e "${YELLOW}If you still see a butterflyfx redirect, check:${NC}"
echo "  nginx -T | grep -A5 'server_name dimensionalprogramming'"
echo "  ls -la /etc/nginx/sites-enabled/"
echo "  curl -Iv https://dimensionalprogramming.com/ 2>&1 | grep -i location"
echo ""
