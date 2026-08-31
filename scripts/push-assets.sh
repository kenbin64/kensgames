#!/bin/bash
# push-assets.sh - send 3D models and large media to the live server.
#
# WHY THIS EXISTS
# ---------------
# .glb files are already-compressed binary, so git cannot delta them. Every
# re-export stored another full copy: AlienMotherShip.glb sat in the history
# four times at 82, 66, 54 and 31 MB. 69 model files came to 1,466 MB and drove
# the repository toward 1.2 GB. They are now gitignored and travel this way.
#
# The normal deploy is unchanged for code. The server's post-receive hook uses
# `rsync -a` WITHOUT `--delete`, so untracking the models did not remove them
# from the live site. This script is only needed when a model is added or
# changed.
#
# Uses tar over ssh rather than rsync: Git Bash on Windows ships ssh, scp and
# tar but NOT rsync, and requiring an install would make this fail at the worst
# possible moment. Only changed files are sent, decided by size and mtime.
#
# USAGE
#   ./scripts/push-assets.sh            # dry run: list what would transfer
#   ./scripts/push-assets.sh --go       # transfer
#
set -euo pipefail

HOST="kensgames"                                  # ~/.ssh/config entry
DEST="/var/www/kensgames.com/public"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
GO=0
[ "${1:-}" = "--go" ] && GO=1

cd "$SRC"

# Git Bash has no bc; use awk for the megabyte formatting.
mb() { awk -v b="$1" 'BEGIN{printf "%.1f", b/1048576}'; }

# Collect asset paths, relative to the repo root.
# Prune by NAME, not by path: the real node_modules here is server/node_modules,
# which a "./node_modules" path prune sails straight past.
# '.obj' is deliberately NOT matched. In this tree it is only ever compiler
# output from better-sqlite3, never a Wavefront model.
mapfile -t FILES < <(
  find . \
    \( -name node_modules -o -name .git -o -name .venv -o -name .venv-1 \
       -o -name build -o -name dist \) -prune -o \
    \( -name '*.glb' -o -name '*.gltf' -o -name '*.fbx' \
       -o -name '*.mp4' -o -name '*.mov' -o -name 'zorgonWarrior' \) \
    -type f -print | sed 's|^\./||' | sort
)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No asset files found under $SRC"
  exit 0
fi

total=0
for f in "${FILES[@]}"; do total=$((total + $(stat -c %s "$f"))); done
printf "source : %s\n" "$SRC"
printf "target : %s:%s\n" "$HOST" "$DEST"
printf "assets : %d files, %s MB

" "${#FILES[@]}" "$(mb "$total")"

# Ask the server what it already has, so only differences move.
remote_list=$(printf '%s\n' "${FILES[@]}" | ssh "$HOST" "cd '$DEST' 2>/dev/null || exit 0; while IFS= read -r f; do if [ -f \"\$f\" ]; then printf '%s\t%s\n' \"\$f\" \"\$(stat -c %s \"\$f\")\"; fi; done")

declare -A REMOTE
while IFS=$'\t' read -r path size; do
  [ -n "${path:-}" ] && REMOTE["$path"]="$size"
done <<< "$remote_list"

CHANGED=()
for f in "${FILES[@]}"; do
  local_size=$(stat -c %s "$f")
  if [ "${REMOTE[$f]:-missing}" != "$local_size" ]; then CHANGED+=("$f"); fi
done

if [ ${#CHANGED[@]} -eq 0 ]; then
  echo "Server is already up to date. Nothing to send."
  exit 0
fi

changed_bytes=0
echo "would transfer ${#CHANGED[@]} file(s):"
for f in "${CHANGED[@]}"; do
  s=$(stat -c %s "$f")
  changed_bytes=$((changed_bytes + s))
  printf "  %10s MB  %s
" "$(mb "$s")" "$f"
done
printf "
total to send: %s MB
" "$(mb "$changed_bytes")"

if [ "$GO" -eq 0 ]; then
  echo
  echo "Dry run only. Re-run with --go to transfer."
  exit 0
fi

echo
echo "transferring..."
# tar the changed files preserving relative paths, unpack on the server.
# No deletion happens at either end.
printf '%s\0' "${CHANGED[@]}" \
  | tar czf - --null -T - \
  | ssh "$HOST" "mkdir -p '$DEST' && tar xzf - -C '$DEST'"

echo "done."
echo "verify with:"
echo "  ssh $HOST 'find $DEST -name \"*.glb\" | wc -l'"
