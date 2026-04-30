#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${WORKSPACE:-/home/butterfly/apps/kensgames-portal}"
REPO_URL="${REPO_URL:-https://github.com/kenbin64/kensgames.git}"
BRANCH="${BRANCH:-main}"
LANES_ROOT="${LANES_ROOT:-/var/www/kensgames-lanes}"
DOMAIN="${DOMAIN:-kensgames.com}"
ARTIFACT_MODE="${ARTIFACT_MODE:-repo-root}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRE_GATE_SCRIPT="$SCRIPT_DIR/pre_deploy_test_gate.sh"
POST_GATE_SCRIPT="$SCRIPT_DIR/automated-task-execution.sh"

DEV_DIR="$LANES_ROOT/dev"
TEST_DIR="$LANES_ROOT/test"
PROD_DIR="$LANES_ROOT/prod"
PROD_PUBLIC="$PROD_DIR/public"
PROD_LOGS="$PROD_DIR/logs"
VHOST="/etc/nginx/sites-enabled/kensgames.com"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

say() { printf '[prod-promote] %s\n' "$*"; }
fail() { printf '[prod-promote] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: scripts/prod-promote.sh [--artifact-mode repo-root|public-dir] [--workspace PATH]

Environment overrides:
  WORKSPACE     default /home/butterfly/apps/kensgames-portal
  REPO_URL      default https://github.com/kenbin64/kensgames.git
  BRANCH        default main
  LANES_ROOT    default /var/www/kensgames-lanes
  DOMAIN        default kensgames.com
  ARTIFACT_MODE default repo-root
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact-mode)
      ARTIFACT_MODE="$2"
      shift 2
      ;;
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[[ "$ARTIFACT_MODE" == "repo-root" || "$ARTIFACT_MODE" == "public-dir" ]] || fail "ARTIFACT_MODE must be repo-root or public-dir"
[[ -d "$WORKSPACE" ]] || fail "Workspace missing: $WORKSPACE"

say "Refreshing sudo session"
sudo -v

say "Validating lane directories"
for d in "$DEV_DIR" "$TEST_DIR" "$PROD_DIR"; do
  [[ -d "$d" ]] || fail "Missing lane directory: $d"
done

say "Syncing repository from $REPO_URL ($BRANCH)"
cd "$WORKSPACE"
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

say "Promoting source to dev lane"
sudo rsync -a --delete --exclude='.git' --exclude='node_modules' "$WORKSPACE/" "$DEV_DIR/"

say "Promoting dev to test lane"
sudo rsync -a --delete --exclude='.git' --exclude='node_modules' "$DEV_DIR/" "$TEST_DIR/"

say "Running strict pre-deploy gate (must pass before any prod promotion)"
[[ -x "$PRE_GATE_SCRIPT" ]] || fail "Missing executable pre-deploy gate: $PRE_GATE_SCRIPT"
ARTIFACT_MODE="$ARTIFACT_MODE" LANES_ROOT="$LANES_ROOT" "$PRE_GATE_SCRIPT"

ARTIFACT_STAGE="/tmp/kensgames-artifacts-$STAMP"
rm -rf "$ARTIFACT_STAGE"
mkdir -p "$ARTIFACT_STAGE"

say "Building artifact stage (mode=$ARTIFACT_MODE)"
if [[ "$ARTIFACT_MODE" == "public-dir" ]]; then
  [[ -d "$TEST_DIR/public" ]] || fail "public-dir mode requires $TEST_DIR/public"
  rsync -a --delete "$TEST_DIR/public/" "$ARTIFACT_STAGE/"
else
  # Artifact subset from repo root structure.
  rsync -a --delete \
    --include='*/' \
    --include='*.html' \
    --include='*.css' \
    --include='*.js' \
    --include='*.json' \
    --include='*.xml' \
    --include='*.txt' \
    --include='assets/***' \
    --include='js/***' \
    --include='lib/***' \
    --include='fasttrack/***' \
    --include='brickbreaker3d/***' \
    --include='4DTicTacToe/***' \
    --include='starfighter/***' \
    --include='login/***' \
    --include='register/***' \
    --include='forgot-password/***' \
    --include='reset-password/***' \
    --include='verify-email/***' \
    --exclude='*' \
    "$TEST_DIR/" "$ARTIFACT_STAGE/"
fi

say "Promoting artifact stage to prod/public"
sudo mkdir -p "$PROD_PUBLIC" "$PROD_LOGS"
sudo rsync -a --delete "$ARTIFACT_STAGE/" "$PROD_PUBLIC/"

say "Enforcing prod purity (only public + logs at lane root)"
for entry in "$PROD_DIR"/*; do
  base="$(basename "$entry")"
  [[ "$base" == "public" || "$base" == "logs" ]] || sudo rm -rf "$entry"
done

say "Setting ownership and permissions"
sudo chown -R www-data:www-data "$PROD_DIR"
sudo find "$PROD_DIR" -type d -exec chmod 755 {} +
sudo find "$PROD_DIR" -type f -exec chmod 644 {} +

say "Validating nginx and reloading"
sudo test -f "$VHOST" || fail "Missing nginx vhost: $VHOST"
sudo nginx -t
sudo systemctl reload nginx

say "Smoke tests"
ROOT_CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")"
DOCS_CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/docs/")"
printf '[prod-promote] HTTPS / code: %s\n' "$ROOT_CODE"
printf '[prod-promote] HTTPS /docs/ code: %s\n' "$DOCS_CODE"

# Keep strictness on root availability; docs can be policy-dependent upstream.
[[ "$ROOT_CODE" == "200" || "$ROOT_CODE" == "301" || "$ROOT_CODE" == "302" ]] || fail "Root endpoint check failed with $ROOT_CODE"

say "Running strict post-deploy automated task execution gate"
[[ -x "$POST_GATE_SCRIPT" ]] || fail "Missing executable post-deploy gate: $POST_GATE_SCRIPT"
LANES_ROOT="$LANES_ROOT" DOMAIN="$DOMAIN" "$POST_GATE_SCRIPT"

say "Completed: main -> dev -> test -> prod promotion at $STAMP"
rm -rf "$ARTIFACT_STAGE"
