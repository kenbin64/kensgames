#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-/home/butterfly/apps/kensgames-portal/version.json}"
BUMP="${2:-patch}"   # major|minor|patch
CHANNEL="${3:-mvp-hold}"
DELTA="${4:-delta-1}"

usage() {
  echo "Usage: scripts/versioning.sh [version_file] [major|minor|patch] [channel] [delta-level]"
}

[[ -f "$FILE" ]] || { echo "Version file not found: $FILE" >&2; exit 1; }
[[ "$BUMP" =~ ^(major|minor|patch)$ ]] || { usage; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 1; }

VERSION_RAW="$(node -e "const j=require('$FILE'); process.stdout.write(String(j.version||''));")"
[[ "$VERSION_RAW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid semantic version in $FILE: $VERSION_RAW" >&2; exit 1; }

read -r MAJOR MINOR PATCH < <(printf '%s\n' "$VERSION_RAW" | tr '.' ' ')

case "$BUMP" in
  major) MAJOR=$((MAJOR+1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR+1)); PATCH=0 ;;
  patch) PATCH=$((PATCH+1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

node -e "
const fs=require('fs');
const p='$FILE';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.version='$NEW_VERSION';
j.release_channel='$CHANNEL';
j.delta_level='$DELTA';
j.build_utc='$NOW';
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\\n');
"

echo "Updated $FILE -> $NEW_VERSION ($CHANNEL, $DELTA)"
