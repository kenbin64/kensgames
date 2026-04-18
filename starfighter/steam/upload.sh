#!/bin/bash
# 🜂 Steam Upload — run after manifold_dist.js completes
# Requires steamcmd installed and authenticated
# Usage: bash steam/upload.sh

set -e
STEAMCMD=${STEAMCMD:-steamcmd}
STEAM_USER=${STEAM_USER:-"your_steam_username"}
VDF="/var/www/kensgames.com/starfighter/steam/app_build.vdf"

echo "🜂  Uploading Starfighter build 57ec7d95f01062f1 to Steam..."
$STEAMCMD +login "$STEAM_USER" +run_app_build "$VDF" +quit
echo "✓ Upload complete."
