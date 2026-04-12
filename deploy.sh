#!/bin/bash
# 🚀 Manifold Gaming Portal - Deployment Script

set -e

echo "🌀 Manifold Gaming Portal - Deployment"
echo "========================================"

# Configuration
REPO_PATH=$(pwd)
DEPLOY_PATH="/var/www/kensgames.com"
BACKUP_PATH="/var/www/backups/kensgames.com.backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# =========================================
# PRE-DEPLOYMENT CHECKS
# =========================================

echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

# Check if running as appropriate user
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

# Check disk space
AVAILABLE_SPACE=$(df /var/www | awk 'NR==2 {print $4}')
if [ "$AVAILABLE_SPACE" -lt 500000 ]; then
    echo -e "${RED}Error: Insufficient disk space (need >500MB)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ System ready for deployment${NC}"

# =========================================
# BACKUP EXISTING DEPLOYMENT
# =========================================

if [ -d "$DEPLOY_PATH" ]; then
    echo -e "${YELLOW}[2/5] Backing up existing deployment...${NC}"
    mkdir -p "$BACKUP_PATH"
    tar czf "$BACKUP_PATH/kensgames.com_$TIMESTAMP.tar.gz" "$DEPLOY_PATH" 2>/dev/null
    echo -e "${GREEN}✓ Backup created: $BACKUP_PATH/kensgames.com_$TIMESTAMP.tar.gz${NC}"
else
    echo -e "${YELLOW}[2/5] No existing deployment to backup${NC}"
fi

# =========================================
# DEPLOY NEW FILES
# =========================================

echo -e "${YELLOW}[3/5] Deploying files...${NC}"

# Create deployment directory if it doesn't exist
mkdir -p "$DEPLOY_PATH/js/substrates"
mkdir -p "$DEPLOY_PATH/login/facebook"
mkdir -p "$DEPLOY_PATH/login/google"
mkdir -p "$DEPLOY_PATH/login/discord"

# Copy portal pages
cp "$REPO_PATH/kensgames.com/index.html" "$DEPLOY_PATH/"
cp "$REPO_PATH/kensgames.com/lounge.html" "$DEPLOY_PATH/"
cp "$REPO_PATH/kensgames.com/discover.html" "$DEPLOY_PATH/"

# Copy substrates
cp "$REPO_PATH/kensgames.com/js/substrates/"*.js "$DEPLOY_PATH/js/substrates/"

# Copy OAuth callbacks
cp "$REPO_PATH/kensgames.com/login/facebook/callback.html" "$DEPLOY_PATH/login/facebook/"
cp "$REPO_PATH/kensgames.com/login/google/callback.html" "$DEPLOY_PATH/login/google/"
cp "$REPO_PATH/kensgames.com/login/discord/callback.html" "$DEPLOY_PATH/login/discord/"

echo -e "${GREEN}✓ Files deployed to $DEPLOY_PATH${NC}"

# =========================================
# CONFIGURE WEB SERVER
# =========================================

echo -e "${YELLOW}[4/5] Configuring web server...${NC}"

# Create nginx config if it doesn't exist
NGINX_CONF="/etc/nginx/sites-available/kensgames.com"
if [ ! -f "$NGINX_CONF" ]; then
    cat > "$NGINX_CONF" << 'EOF'
server {
    listen 80;
    server_name kensgames.com;

    root /var/www/kensgames.com;
    index index.html;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;

        # Caching
        add_header Cache-Control "public, max-age=3600";
        add_header Vary "Accept-Encoding";
    }

    # OAuth callbacks
    location /login/ {
        try_files $uri $uri/ /index.html;
    }

    # Disable directory listing
    location / {
        autoindex off;
    }

    # Gzip compression
    gzip on;
    gzip_types text/html text/plain text/css text/javascript application/javascript application/json;
    gzip_min_length 1000;
}
EOF

    ln -s "$NGINX_CONF" "/etc/nginx/sites-enabled/kensgames.com"

    echo -e "${GREEN}✓ Nginx configuration created${NC}"
else
    echo -e "${YELLOW}✓ Nginx configuration already exists${NC}"
fi

# Test and reload nginx
if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    echo -e "${GREEN}✓ Nginx reloaded${NC}"
else
    echo -e "${RED}Error: Nginx configuration test failed${NC}"
    exit 1
fi

# =========================================
# VERIFY DEPLOYMENT
# =========================================

echo -e "${YELLOW}[5/5] Verifying deployment...${NC}"

# Check key files exist
REQUIRED_FILES=(
    "index.html"
    "lounge.html"
    "discover.html"
    "js/substrates/leaderboard_substrate.js"
    "login/facebook/callback.html"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$DEPLOY_PATH/$file" ]; then
        echo -e "${RED}Error: Missing file $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ All required files verified${NC}"

# =========================================
# DEPLOYMENT COMPLETE
# =========================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ DEPLOYMENT SUCCESSFUL!             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "📊 Deployment Summary:"
echo "   Location: $DEPLOY_PATH"
echo "   Timestamp: $TIMESTAMP"
echo "   Backup: $BACKUP_PATH/kensgames.com_$TIMESTAMP.tar.gz"
echo ""
echo "🌍 Access portal:"
echo "   http://kensgames.com/"
echo "   http://kensgames.com/lounge.html"
echo "   http://kensgames.com/discover.html"
echo ""
echo "⚡ Next Steps:"
echo "   1. Configure SSL/TLS certificate"
echo "   2. Setup OAuth provider credentials"
echo "   3. Configure DNS A record"
echo "   4. Monitor logs: tail -f /var/log/nginx/access.log"
echo ""
echo "📚 Documentation: $DEPLOY_PATH/DEPLOYMENT_GUIDE.md"
echo ""
