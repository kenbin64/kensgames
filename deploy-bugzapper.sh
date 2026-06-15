#!/bin/bash
# Deploy ONLY the Bug Zapper + its arcade card to kensgames.com.
# Does NOT touch the untested FastTrack / auth / server work in the repo.
set -e
cd "$(dirname "$0")"                      # always run from the kensgames repo dir, wherever you launch it

HOST="root@172.81.62.217"
SSH="ssh -p 2222 -i $HOME/.ssh/id_ed25519_mcp"

echo "🔎 Detecting live docroot..."
if $SSH "$HOST" 'test -d /var/www/kensgames.com/public'; then
  ROOT="/var/www/kensgames.com/public"
else
  ROOT="/var/www/kensgames.com"
fi
echo "   docroot: $ROOT"

echo "🚀 Deploying the bug zapper..."
rsync -avz -e "$SSH" bugzapper/ "$HOST:$ROOT/bugzapper/"

echo "🚀 Deploying the arcade card + registry..."
rsync -avz -e "$SSH" index.html arcade.js dist/manifold.registry.json "$HOST:$ROOT/"

echo "✅ Done → https://kensgames.com/bugzapper/  (and on the arcade)"
