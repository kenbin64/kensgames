#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  HELIX — VPS Deployment Agent
#  /opt/butterflyfx/dimensionsos/helix/helix.sh
#
#  Called by GitHub Actions after a successful deploy:
#    helix.sh deploy-complete <path/to/deploy.manifest.json>
#
#  Implements all steps from AGENTS.md §5.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

HELIX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$HELIX_DIR/deploy.log"
REGISTRY="/var/www/kensgames.com/js/manifold.registry.json"

# ── helpers ──────────────────────────────────────────────────
log()  { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [helix] $*" | tee -a "$LOG"; }
ok()   { log "✓ $*"; }
warn() { log "⚠  $*"; }
fail() { log "✗ $*"; exit 1; }

# ── entry point ──────────────────────────────────────────────
CMD="${1:-help}"
MANIFEST="${2:-$HELIX_DIR/deploy.manifest.json}"

case "$CMD" in
  deploy-complete)
    log "=== deploy-complete triggered ==="

    # ── Step A — read manifest ────────────────────────────────
    if [ ! -f "$MANIFEST" ]; then
      fail "deploy.manifest.json not found at $MANIFEST"
    fi
    SCHEMA=$(node -e "const m=require('$MANIFEST'); console.log(m._schema||'?')")
    ok "manifest schema: $SCHEMA"

    # ── Step B — validate registry (z = x*y) ─────────────────
    if [ ! -f "$REGISTRY" ]; then
      warn "registry not found at $REGISTRY — skipping axiom check"
    else
      node -e "
        const r = require('$REGISTRY');
        let ok = true;
        (r.games || []).forEach(g => {
          const z = g.dimension.x * g.dimension.y;
          if (z !== g.dimension.z) {
            console.error('AXIOM VIOLATION: ' + g.id + ' z=' + g.dimension.z + ' expected ' + z);
            ok = false;
          } else {
            console.log('OK ' + g.id + ' z=' + g.dimension.z);
          }
        });
        process.exit(ok ? 0 : 1);
      " || fail "Registry axiom check failed — deploy halted (z ≠ x*y)"
      ok "all game manifolds satisfy z=xy"
    fi

    # ── Step C — restart Node server via PM2 ─────────────────
    cd /var/www/kensgames.com/server
    npm ci --omit=dev --silent

    if pm2 restart kensgames-server 2>/dev/null; then
      ok "PM2 restart: kensgames-server"
    else
      pm2 start /var/www/kensgames.com/server/index.js \
        --name kensgames-server \
        --env production
      ok "PM2 start: kensgames-server (fresh)"
    fi
    pm2 save --force

    # ── Step D — reload nginx ─────────────────────────────────
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      ok "nginx reloaded"
    else
      warn "nginx config invalid — NOT reloading (current config preserved)"
    fi

    # ── Step E — smoke test ───────────────────────────────────
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://kensgames.com/ 2>/dev/null || echo "000")
    if [ "$HTTP" = "200" ]; then
      ok "smoke test: https://kensgames.com/ → $HTTP"
    else
      warn "smoke test: https://kensgames.com/ → $HTTP (may be CDN cache)"
    fi

    # ── Step F — log completion ───────────────────────────────
    ok "=== deploy-complete finished ==="
    ;;

  status)
    log "=== status check ==="
    pm2 list --no-color | grep kensgames || warn "kensgames-server not in PM2"
    nginx -t 2>&1 | head -3
    ;;

  validate)
    # Validate registry only — no restarts
    if [ ! -f "$REGISTRY" ]; then fail "registry not found"; fi
    node -e "
      const r = require('$REGISTRY');
      let ok = true;
      (r.games || []).forEach(g => {
        const z = g.dimension.x * g.dimension.y;
        const check = z === g.dimension.z ? 'OK' : 'FAIL';
        console.log(check + ' ' + g.id + '  z=' + g.dimension.z + '  (expected ' + z + ')');
        if (check === 'FAIL') ok = false;
      });
      process.exit(ok ? 0 : 1);
    "
    ;;

  rollback)
    LATEST=$(ls -t /var/www/backups/kensgames.com_*.tar.gz 2>/dev/null | head -1 || true)
    [ -z "$LATEST" ] && fail "no backups found in /var/www/backups/"
    log "rolling back to $LATEST"
    tar xzf "$LATEST" -C / --strip-components=1
    pm2 restart kensgames-server
    systemctl reload nginx
    ok "rollback complete: $LATEST"
    ;;

  *)
    echo "Usage: helix.sh <deploy-complete|status|validate|rollback> [manifest_path]"
    exit 1
    ;;
esac
