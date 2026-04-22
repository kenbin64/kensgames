#!/bin/bash
# KensGames Portal — Production Deployment Script
# Usage: sudo bash deploy.sh [--no-backup] [--no-restart]
#
# Source : /home/butterfly/apps/kensgames-portal/manifold/
# Webroot: /var/www/kensgames.com/public/
# Server : pm2 — kensgames-auth (port 3000), kensgames-lobby (port 8765)
# Nginx  : /etc/nginx/sites-available/kensgames.com
#
# The server processes run FROM SOURCE (manifold/server/), so copying
# server/ to webroot is intentional — it keeps the live copy in sync.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
SRC="$(cd "$(dirname "$0")" && pwd)"
WEB="/var/www/kensgames.com/public"
BACKUP_DIR="/var/www/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PM2_AUTH="kensgames-auth"
PM2_LOBBY="kensgames-lobby"
DO_BACKUP=true
DO_RESTART=true

# Parse flags
for arg in "$@"; do
  [[ "$arg" == "--no-backup"  ]] && DO_BACKUP=false
  [[ "$arg" == "--no-restart" ]] && DO_RESTART=false
done

# ── Colors ───────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'

# ── Guards ───────────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && { echo -e "${R}Run as root: sudo bash deploy.sh${NC}"; exit 1; }

AVAIL=$(df "$WEB" 2>/dev/null | awk 'NR==2{print $4}')
[[ -n "$AVAIL" && "$AVAIL" -lt 200000 ]] && { echo -e "${R}Low disk space (<200 MB free)${NC}"; exit 1; }

echo -e "${Y}KensGames Portal — Deployment  ${TIMESTAMP}${NC}"
echo "────────────────────────────────────────────────"

# ── Logging policy install (daily archive/rotation) ───────────────────────
LOGROTATE_SRC="$SRC/ops/logging/kensgames-manifold.logrotate"
LOGROTATE_DST="/etc/logrotate.d/kensgames-manifold"
if [[ -f "$LOGROTATE_SRC" ]]; then
  mkdir -p /var/www/kensgames.com/logs
  mkdir -p /home/butterfly/.pm2/logs
  cp -f "$LOGROTATE_SRC" "$LOGROTATE_DST"
  chmod 644 "$LOGROTATE_DST"
  chown root:root "$LOGROTATE_DST"
  touch /var/www/kensgames.com/logs/app.log /var/www/kensgames.com/logs/error.log
  chown -R butterfly:www-data /var/www/kensgames.com/logs
  chmod 775 /var/www/kensgames.com/logs
  chmod 664 /var/www/kensgames.com/logs/*.log || true
  echo -e "${G}  ✓ Logging policy installed: $LOGROTATE_DST${NC}"
else
  echo -e "${Y}  ! Logging policy source missing: $LOGROTATE_SRC${NC}"
fi

# ── [1] Backup ───────────────────────────────────────────────────────────────
if $DO_BACKUP && [[ -d "$WEB" ]]; then
  echo -e "${Y}[1/5] Backing up...${NC}"
  mkdir -p "$BACKUP_DIR"
  tar czf "$BACKUP_DIR/kensgames_${TIMESTAMP}.tar.gz" \
      --exclude="$WEB/server/node_modules" \
      "$WEB" 2>/dev/null || true
  echo -e "${G}  ✓ Backup: $BACKUP_DIR/kensgames_${TIMESTAMP}.tar.gz${NC}"
else
  echo "[1/5] Backup skipped"
fi

# ── [2] Create directory tree ─────────────────────────────────────────────
echo -e "${Y}[2/5] Preparing directories...${NC}"
DIRS=(
  "$WEB/js/substrates"
  "$WEB/css"
  "$WEB/lib/fonts"
  "$WEB/assets/images"
  "$WEB/assets/masterImageFile"
  "$WEB/admin"
  "$WEB/login"
  "$WEB/register"
  "$WEB/forgot-password"
  "$WEB/reset-password"
  "$WEB/verify-email"
  "$WEB/invite"
  "$WEB/invited"
  "$WEB/lobby"
  "$WEB/player"
  "$WEB/social"
  "$WEB/tos"
  "$WEB/gallery"
  "$WEB/fasttrack"
  "$WEB/brickbreaker3d"
  "$WEB/starfighter"
  "$WEB/assemble"
  "$WEB/4dconnect"
  "$WEB/chomp"
  "$WEB/play"
  "$WEB/docs"
  "$WEB/server/routes"
  "$WEB/dist"
)
for d in "${DIRS[@]}"; do mkdir -p "$d"; done
echo -e "${G}  ✓ Directory tree ready${NC}"

# ── [3] Copy files ────────────────────────────────────────────────────────
echo -e "${Y}[3/5] Copying files...${NC}"

cp_dir() {
  local src="$1" dst="$2"
  [[ -d "$src" ]] && rsync -a --delete \
    --exclude='node_modules/' \
    --exclude='*.test.js' \
    --exclude='.git/' \
    --exclude='*.sh' \
    "$src/" "$dst/" && echo -e "  ${G}✓${NC} $(basename $src)/"
}
cp_file() {
  local src="$1" dst="$2"
  [[ -f "$src" ]] && cp -f "$src" "$dst" && echo -e "  ${G}✓${NC} $(basename $src)"
}

# Portal root
cp_file "$SRC/index.html"           "$WEB/index.html"
cp_file "$SRC/portal.html"          "$WEB/portal.html"
cp_file "$SRC/manifold.html"        "$WEB/manifold.html"
cp_file "$SRC/arcade.css"           "$WEB/arcade.css"
cp_file "$SRC/arcade.js"            "$WEB/arcade.js"
cp_file "$SRC/lounge.html"          "$WEB/lounge.html"
cp_file "$SRC/discover.html"        "$WEB/discover.html"
cp_file "$SRC/showcase.html"        "$WEB/showcase.html"
cp_file "$SRC/admin.html"           "$WEB/admin.html"
cp_file "$SRC/admin.js"             "$WEB/admin.js"
cp_file "$SRC/gyroid.js"            "$WEB/gyroid.js"
cp_file "$SRC/sitemap.xml"          "$WEB/sitemap.xml"
cp_file "$SRC/manifold.portal.json" "$WEB/manifold.portal.json"
cp_file "$SRC/substrates.json"      "$WEB/substrates.json"

# Shared dirs
cp_dir "$SRC/js"          "$WEB/js"
cp_dir "$SRC/css"         "$WEB/css"
cp_dir "$SRC/lib"         "$WEB/lib"
cp_dir "$SRC/assets"      "$WEB/assets"
cp_dir "$SRC/shared"      "$WEB/shared"
cp_dir "$SRC/dist"        "$WEB/dist"

# Auth pages
cp_dir "$SRC/login"           "$WEB/login"
cp_dir "$SRC/register"        "$WEB/register"
cp_dir "$SRC/forgot-password" "$WEB/forgot-password"
cp_dir "$SRC/reset-password"  "$WEB/reset-password"
cp_dir "$SRC/verify-email"    "$WEB/verify-email"
cp_dir "$SRC/invite"          "$WEB/invite"
cp_dir "$SRC/invited"         "$WEB/invited"
cp_dir "$SRC/tos"             "$WEB/tos"
cp_dir "$SRC/player"          "$WEB/player"
cp_dir "$SRC/social"          "$WEB/social"
cp_dir "$SRC/lobby"           "$WEB/lobby"
cp_dir "$SRC/play"            "$WEB/play"

# Gallery
cp_dir "$SRC/gallery"    "$WEB/gallery"

# Admin
cp_dir "$SRC/admin"      "$WEB/admin"

# Games
cp_dir "$SRC/fasttrack"     "$WEB/fasttrack"
cp_dir "$SRC/brickbreaker3d" "$WEB/brickbreaker3d"
cp_dir "$SRC/starfighter"   "$WEB/starfighter"
cp_dir "$SRC/assemble"      "$WEB/assemble"
cp_dir "$SRC/4dconnect"     "$WEB/4dconnect"
cp_dir "$SRC/chomp"         "$WEB/chomp"
[[ -d "$SRC/dungeon"   ]] && cp_dir "$SRC/dungeon"   "$WEB/dungeon"
[[ -d "$SRC/geowars"   ]] && cp_dir "$SRC/geowars"   "$WEB/geowars"
[[ -d "$SRC/racer"     ]] && cp_dir "$SRC/racer"      "$WEB/racer"
[[ -d "$SRC/siege"     ]] && cp_dir "$SRC/siege"      "$WEB/siege"

# Server (runs from source; keep webroot copy in sync for reference/fallback)
cp_dir "$SRC/server"     "$WEB/server"

echo -e "${G}  ✓ All files copied${NC}"

# ── [4] Restart services ──────────────────────────────────────────────────
if $DO_RESTART; then
  echo -e "${Y}[4/5] Restarting services...${NC}"
  sudo -u butterfly pm2 restart "$PM2_AUTH"  --update-env 2>&1 | tail -2 || \
    echo -e "${R}  ! $PM2_AUTH restart failed — check pm2 logs${NC}"
  sudo -u butterfly pm2 restart "$PM2_LOBBY" --update-env 2>&1 | tail -2 || \
    echo -e "${R}  ! $PM2_LOBBY restart failed — check pm2 logs${NC}"
  echo -e "${G}  ✓ pm2 processes restarted${NC}"

  if nginx -t >/dev/null 2>&1; then
    nginx -s reload
    echo -e "${G}  ✓ nginx reloaded${NC}"
  else
    echo -e "${R}  ! nginx config test failed — skipping reload${NC}"
  fi
else
  echo "[4/5] Service restart skipped"
fi

# ── [5] Verify ───────────────────────────────────────────────────────────
echo -e "${Y}[5/5] Verifying...${NC}"
REQUIRED=(
  "index.html"
  "arcade.css"
  "portal.html"
  "js/kg_lobby.js"
  "js/kg_gate.js"
  "js/access_status.js"
  "server/index.js"
  "server/lobby-server.js"
  "fasttrack/index.html"
  "brickbreaker3d/index.html"
  "starfighter/index.html"
  "assemble/index.html"
  "4dconnect/index.html"
  "gallery/index.html"
  "tos/index.html"
  "player/setup.html"
)
FAIL=0
for f in "${REQUIRED[@]}"; do
  if [[ -f "$WEB/$f" ]]; then
    echo -e "  ${G}✓${NC} $f"
  else
    echo -e "  ${R}✗ MISSING: $f${NC}"
    FAIL=1
  fi
done
[[ $FAIL -ne 0 ]] && { echo -e "${R}Verification failed — check missing files above${NC}"; exit 1; }

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${G}╔══════════════════════════════════════════╗${NC}"
echo -e "${G}║  DEPLOYMENT COMPLETE — ${TIMESTAMP}  ║${NC}"
echo -e "${G}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Live:    https://kensgames.com"
echo "  Gallery: https://kensgames.com/gallery/"
echo "  Admin:   https://kensgames.com/admin/"
echo "  Logs:    pm2 logs $PM2_AUTH"
echo "           pm2 logs $PM2_LOBBY"
echo "           tail -f /var/www/kensgames.com/logs/error.log"
echo ""
