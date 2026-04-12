#!/bin/bash
#
# Fast Track Deployment Script for kensgames.com
# Sets up HTTPS with Let's Encrypt, nginx, and systemd services
#
# Usage: sudo bash deploy_kensgames.sh
#
# VPS: 172.81.62.217
# Domain: kensgames.com
#

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

DOMAIN="kensgames.com"
VPS_IP="172.81.62.217"
SSL_EMAIL="admin@kensgames.com"  # Change to your email
APP_DIR="/opt/butterflyfx/dimensionsos/web/games/fasttrack"
APP_USER="www-data"
LOBBY_PORT=8765
MANIFOLD_PORT=8766

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      🎯 FAST TRACK - kensgames.com Deployment 🎯          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
fi

# Check if domain points to this server
log_info "Checking DNS for $DOMAIN..."
RESOLVED_IP=$(dig +short $DOMAIN 2>/dev/null | head -1)
if [[ "$RESOLVED_IP" != "$VPS_IP" ]]; then
    log_warn "DNS not yet pointing to VPS. Current: $RESOLVED_IP, Expected: $VPS_IP"
    log_warn "Make sure to add these DNS records:"
    echo "    A    @       $VPS_IP"
    echo "    A    www     $VPS_IP"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# =============================================================================
# INSTALL DEPENDENCIES
# =============================================================================

log_info "Updating system packages..."
apt-get update -qq

log_info "Installing required packages..."
apt-get install -y -qq \
    nginx \
    certbot \
    python3-certbot-nginx \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    dnsutils

log_success "Dependencies installed"

# =============================================================================
# SETUP PYTHON ENVIRONMENT
# =============================================================================

log_info "Setting up Python environment..."

cd $APP_DIR

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q websockets aiohttp

log_success "Python environment ready"

# =============================================================================
# CONFIGURE NGINX
# =============================================================================

log_info "Configuring nginx..."

# Create certbot webroot
mkdir -p /var/www/certbot

# Copy nginx config (temporary HTTP-only for SSL cert)
cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_TEMP'
server {
    listen 80;
    listen [::]:80;
    server_name kensgames.com www.kensgames.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        root /opt/butterflyfx/dimensionsos/web/games/fasttrack;
        try_files $uri $uri/ /board_3d.html;
    }
}
NGINX_TEMP

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t
systemctl reload nginx

log_success "Nginx configured (HTTP)"

# =============================================================================
# OBTAIN SSL CERTIFICATE
# =============================================================================

log_info "Obtaining SSL certificate from Let's Encrypt..."

certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d $DOMAIN \
    -d www.$DOMAIN \
    --email $SSL_EMAIL \
    --agree-tos \
    --non-interactive \
    || log_warn "SSL cert may already exist or DNS not ready"

# Check if cert exists
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    log_success "SSL certificate obtained"
    
    # Install full nginx config with SSL
    cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/$DOMAIN
    nginx -t && systemctl reload nginx
    log_success "HTTPS enabled"
else
    log_warn "SSL cert not found - continuing with HTTP only"
fi

# =============================================================================
# CREATE SYSTEMD SERVICES
# =============================================================================

log_info "Creating systemd services..."

# Lobby Server Service
cat > /etc/systemd/system/fasttrack-lobby.service << EOF
[Unit]
Description=Fast Track Lobby Server
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
ExecStart=$APP_DIR/venv/bin/python -u server/lobby_server.py --host 127.0.0.1 --port $LOBBY_PORT
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF

# Manifold Server Service (for future use)
cat > /etc/systemd/system/fasttrack-manifold.service << EOF
[Unit]
Description=Fast Track Manifold Server
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
Environment="PYTHONPATH=/opt/butterflyfx/dimensionsos"
ExecStart=$APP_DIR/venv/bin/python -c "
import asyncio
import sys
sys.path.insert(0, '/opt/butterflyfx/dimensionsos')
from helix.manifold_server import ManifoldServer
# Placeholder - implement WebSocket wrapper
print('Manifold server ready on port $MANIFOLD_PORT')
asyncio.get_event_loop().run_forever()
"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

# Enable and start services
systemctl enable fasttrack-lobby
systemctl start fasttrack-lobby

log_success "Services configured and started"

# =============================================================================
# FIREWALL CONFIGURATION
# =============================================================================

log_info "Configuring firewall..."

if command -v ufw &> /dev/null; then
    ufw allow 'Nginx Full'
    ufw allow ssh
    ufw --force enable
    log_success "UFW configured"
else
    log_warn "UFW not installed - configure firewall manually"
fi

# =============================================================================
# AUTO-RENEWAL CRON
# =============================================================================

log_info "Setting up SSL auto-renewal..."

# Add cron job for cert renewal
(crontab -l 2>/dev/null || true; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -

log_success "SSL auto-renewal configured"

# =============================================================================
# FINAL CHECKS
# =============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "                    DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  🌐 Website:     https://$DOMAIN/fasttrack"
echo "  📱 Mobile:      https://$DOMAIN/mobile"
echo "  🔌 WebSocket:   wss://$DOMAIN/ws"
echo "  📊 Manifold:    wss://$DOMAIN/manifold"
echo ""
echo "  Services:"
echo "    systemctl status fasttrack-lobby"
echo "    systemctl status fasttrack-manifold"
echo ""
echo "  Logs:"
echo "    journalctl -u fasttrack-lobby -f"
echo ""
echo "  SSL Renewal:"
echo "    certbot renew --dry-run"
echo ""
echo "═══════════════════════════════════════════════════════════"

# Test the site
if command -v curl &> /dev/null; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN/ 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ] || [ "$HTTP_STATUS" = "200" ]; then
        log_success "Site is responding (HTTP $HTTP_STATUS)"
    else
        log_warn "Site may not be accessible yet (HTTP $HTTP_STATUS)"
    fi
fi

echo ""
log_success "Deployment complete! 🎯"
