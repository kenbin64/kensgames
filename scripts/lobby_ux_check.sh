#!/usr/bin/env bash
# Lobby UX verification — runs static, same-screen, and live audits.
#  1/8 Static          = HTML structure conformance for all lobby pages
#  2/8 Same-screen     = Client-side runtime persistence (no server needed)
#  3/8 Live            = WebSocket protocol smoke (solo + friend + 4-player friend)
#  4/8 Coexistence     = Kernel router does not break legacy game_action relay
#  5/8 4DTTT kernel    = 4DTicTacToe drop / settle / turn-advance over the kernel
#  6/8 FT kernel       = FastTrack hybrid mode: server-validated turn rotation
#  7/8 SF kernel       = Starfighter real-time tick + input echo through kernel
#  8/8 BB3D-multi      = BB3D multi-paddle real-time tick + paddle input
set -e
cd "$(dirname "$0")/.."

echo "── 1/6  Static lobby UX audit ──"
node scripts/lobby_ux_audit.js

echo
echo "── 2/6  Same-screen runtime smoke ──"
node scripts/same_screen_smoke.js

echo
echo "── 3/6  Live lobby protocol smoke (requires lobby-server on :8765) ──"
node scripts/portal_flow_smoke.js

echo
echo "── 4/6  Kernel/legacy coexistence smoke (requires lobby-server on :8765) ──"
node scripts/kernel_coexistence_smoke.js

echo
echo "── 5/6  4DTicTacToe kernel integration smoke (requires lobby-server on :8765) ──"
node scripts/4dtictactoe_kernel_smoke.js

echo
echo "── 6/7  FastTrack kernel integration smoke (requires lobby-server on :8765) ──"
node scripts/fasttrack_kernel_smoke.js

echo
echo "── 7/8  Starfighter kernel integration smoke (requires lobby-server on :8765) ──"
node scripts/starfighter_kernel_smoke.js

echo
echo "── 8/8  BrickBreaker3D multi-paddle kernel smoke (requires lobby-server on :8765) ──"
node scripts/brickbreaker3d_multi_kernel_smoke.js

echo
echo "All lobby UX checks passed."
