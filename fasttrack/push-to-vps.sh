#!/bin/bash
# =============================================================================
# Fast Track Remote Deployment to VPS
# Deploys to kensgames.com (172.81.62.217)
# Version: 2.1.0 - Dimensional Substrate Architecture
# =============================================================================

set -e

VPS_IP="172.81.62.217"
VPS_USER="${1:-root}"
DOMAIN="kensgames.com"
REMOTE_DIR="/var/www/kensgames.com/fasttrack"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${HOME}/.ssh/id_ed25519_mcp"
SSH_OPTS="-i ${SSH_KEY} -o StrictHostKeyChecking=no -o PasswordAuthentication=no"
HELIX_DIR="/opt/butterflyfx/dimensionsos/helix"
DEPLOY_VERSION="v2.1.0-$(date +%Y%m%d-%H%M%S)"

echo "================================================"
echo "Fast Track Remote Deploy - Dimensional Architecture"
echo "  Version: $DEPLOY_VERSION"
echo "  VPS: $VPS_IP ($DOMAIN)"
echo "  From: $LOCAL_DIR"
echo "  To: $VPS_USER@$VPS_IP:$REMOTE_DIR"
echo "================================================"

# Pre-deployment validation
echo ""
echo "[Pre-Deploy] Validating dimensional substrates..."
REQUIRED_SUBSTRATES=(
    "validation_substrate.js"
    "event_substrate.js"
    "state_substrate.js"
    "array_substrate.js"
    "substrate_manifold.js"
    "move_generation_substrate.js"
    "card_logic_substrate.js"
    "ui_manifold.js"
    "ai_manifold.js"
    "game_engine_manifold.js"
)

MISSING_FILES=0
for substrate in "${REQUIRED_SUBSTRATES[@]}"; do
    if [ ! -f "$LOCAL_DIR/$substrate" ]; then
        echo "  ❌ Missing: $substrate"
        MISSING_FILES=$((MISSING_FILES + 1))
    else
        echo "  ✅ Found: $substrate"
    fi
done

if [ $MISSING_FILES -gt 0 ]; then
    echo ""
    echo "ERROR: $MISSING_FILES required substrate(s) missing!"
    echo "Please ensure all dimensional substrates are present before deploying."
    exit 1
fi

echo "  ✅ All dimensional substrates present"

# Create remote directories first
echo ""
echo "[0/5] Creating remote directories..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "mkdir -p $REMOTE_DIR /opt/butterflyfx/dimensionsos /opt/fasttrack-deploy"

# Sync game files to VPS
echo ""
echo "[1/5] Syncing game files..."
rsync -avz --delete \
    --exclude='*.pyc' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='*.log' \
    --exclude='.env' \
    -e "ssh $SSH_OPTS" \
    "$LOCAL_DIR/" "$VPS_USER@$VPS_IP:$REMOTE_DIR/"

# Remove legacy lobby files that should no longer exist on the server
echo ""
echo "[1b/5] Removing legacy lobby files..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "
    for f in $REMOTE_DIR/lobby.html $REMOTE_DIR/lobby_old.html; do
        if [ -f \"\$f\" ]; then
            rm -f \"\$f\"
            echo \"  Removed: \$f\"
        fi
    done
"

# Sync helix module for manifold server
echo ""
echo "[2/5] Syncing helix module (ButterflyFX)..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "mkdir -p /opt/butterflyfx/dimensionsos"
rsync -avz \
    --exclude='*.pyc' \
    --exclude='__pycache__' \
    --exclude='.git' \
    -e "ssh $SSH_OPTS" \
    "$HELIX_DIR/" "$VPS_USER@$VPS_IP:/opt/butterflyfx/dimensionsos/helix/"

# Sync deploy scripts
echo ""
echo "[3/5] Syncing deployment configs..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "mkdir -p /opt/fasttrack-deploy"
rsync -avz \
    "$LOCAL_DIR/deploy/" \
    -e "ssh $SSH_OPTS" \
    "$VPS_USER@$VPS_IP:/opt/fasttrack-deploy/"

# Install systemd services
echo ""
echo "[4/5] Installing systemd services..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" << 'REMOTE_SCRIPT'
    # Copy service files
    cp /opt/fasttrack-deploy/fasttrack-game.service /etc/systemd/system/
    cp /opt/fasttrack-deploy/fasttrack-manifold.service /etc/systemd/system/
    
    # Reload and enable
    systemctl daemon-reload
    systemctl enable fasttrack-game fasttrack-manifold
    
    # Restart services
    systemctl restart fasttrack-game
    systemctl restart fasttrack-manifold
    
    echo "Services status:"
    systemctl status fasttrack-game --no-pager -l || true
    systemctl status fasttrack-manifold --no-pager -l || true
REMOTE_SCRIPT

# Reload nginx
echo ""
echo "[5/7] Reloading nginx..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "nginx -t && systemctl reload nginx"

# Deploy landing page
echo ""
echo "[6/7] Deploying landing page..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" "cp /var/www/kensgames.com/fasttrack/landing/index.html /var/www/kensgames.com/index.html"

# Post-deployment verification
echo ""
echo "[7/7] Verifying dimensional substrate deployment..."
ssh $SSH_OPTS "$VPS_USER@$VPS_IP" << 'VERIFY_SCRIPT'
    cd /var/www/kensgames.com/fasttrack
    
    echo "Checking dimensional substrates:"
    SUBSTRATES=(
        "validation_substrate.js"
        "event_substrate.js"
        "state_substrate.js"
        "array_substrate.js"
        "substrate_manifold.js"
        "move_generation_substrate.js"
        "card_logic_substrate.js"
        "ui_manifold.js"
        "ai_manifold.js"
        "game_engine_manifold.js"
    )
    
    ALL_PRESENT=true
    for substrate in "${SUBSTRATES[@]}"; do
        if [ -f "$substrate" ]; then
            SIZE=$(stat -f%z "$substrate" 2>/dev/null || stat -c%s "$substrate" 2>/dev/null)
            echo "  ✅ $substrate (${SIZE} bytes)"
        else
            echo "  ❌ MISSING: $substrate"
            ALL_PRESENT=false
        fi
    done
    
    if [ "$ALL_PRESENT" = true ]; then
        echo ""
        echo "✅ All dimensional substrates deployed successfully"
    else
        echo ""
        echo "⚠️  WARNING: Some substrates missing on production"
        exit 1
    fi
    
    echo ""
    echo "Checking core game files:"
    CORE_FILES=(
        "board_3d.html"
        "game_engine.js"
        "game_ui_minimal.js"
        "move_selection_modal.js"
    )
    
    for file in "${CORE_FILES[@]}"; do
        if [ -f "$file" ]; then
            SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
            echo "  ✅ $file (${SIZE} bytes)"
        else
            echo "  ❌ MISSING: $file"
        fi
    done
VERIFY_SCRIPT

echo ""
echo "================================================"
echo "Deployment Complete! - Dimensional Architecture v2.1.0"
echo "================================================"
echo ""
echo "🎮 Game URLs:"
echo "  Landing: https://kensgames.com"
echo "  Game:    https://kensgames.com/fasttrack"
echo "  Manifold: wss://kensgames.com/manifold"
echo ""
echo "🧪 Test Suites:"
echo "  Rules:   https://kensgames.com/fasttrack/test_runner_ui.html"
echo "  Flows:   https://kensgames.com/fasttrack/test_game_flows_ui.html"
echo ""
echo "📊 Monitoring:"
echo "  Game logs:     ssh $VPS_USER@$VPS_IP journalctl -u fasttrack-game -f"
echo "  Manifold logs: ssh $VPS_USER@$VPS_IP journalctl -u fasttrack-manifold -f"
echo "  Nginx logs:    ssh $VPS_USER@$VPS_IP tail -f /var/log/nginx/access.log"
echo ""
echo "✅ Dimensional Substrates: 10 deployed"
echo "✅ Core Game Files: Updated"
echo "✅ Test Suites: Available"
echo "✅ Services: Running"
echo ""
echo "Deployment Version: $DEPLOY_VERSION"
echo "================================================"
