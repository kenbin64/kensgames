#!/bin/bash
# push-assets.sh - send 3D models and large media to the live server.
#
# WHY THIS EXISTS
# ---------------
# .glb files are already-compressed binary, so git cannot delta them. Every
# re-export stored another full copy: AlienMotherShip.glb sat in the history
# four times at 82, 66, 54 and 31 MB. 69 model files came to 1,466 MB and drove
# the repository to 1.2 GB. They are now gitignored and travel this way instead.
#
# The normal deploy still works exactly as before for code. The post-receive
# hook on the server uses `rsync -a` WITHOUT `--delete`, so untracking the
# models did not remove them from the live site. This script is only needed
# when a model is added or changed.
#
# USAGE
#   ./scripts/push-assets.sh            # dry run, shows what would move
#   ./scripts/push-assets.sh --go       # actually transfer
#
set -euo pipefail

HOST="kensgames"                                   # ~/.ssh/config entry
DEST="/var/www/kensgames.com/public"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

DRY="--dry-run"
[ "${1:-}" = "--go" ] && DRY=""

echo "source : $SRC"
echo "target : $HOST:$DEST"
[ -n "$DRY" ] && echo "mode   : DRY RUN (pass --go to transfer)" || echo "mode   : TRANSFERRING"
echo

# Only asset types, only where they already live. No --delete: this never
# removes anything from the server.
rsync -avh --progress $DRY \
  --include='*/' \
  --include='*.glb' --include='*.gltf' --include='*.fbx' \
  --include='*.obj' --include='*.mp4' --include='*.mov' \
  --include='starfighter/assets/models/zorgonWarrior' \
  --exclude='*' \
  --exclude='node_modules/' --exclude='.git/' \
  --exclude='.venv/' --exclude='.venv-1/' \
  "$SRC"/ "$HOST:$DEST"/

echo
if [ -n "$DRY" ]; then
  echo "Dry run only. Re-run with --go to transfer."
else
  echo "Done. Verify with:"
  echo "  ssh $HOST 'find $DEST -name \"*.glb\" | wc -l'"
fi
