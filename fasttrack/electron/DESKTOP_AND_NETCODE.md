# FastTrack desktop + host-authoritative netcode (2026-06-15)

## Desktop wrapper (Electron → itch.io)
The game pages use absolute web paths (`/js`, `/lib`, `/assets`, `/fasttrack`) and a
location-derived WebSocket URL, exactly as served on kensgames.com where the web
docroot is the repo root. Loading via `file://` breaks all of that. So the desktop
build serves the repo root over a 127.0.0.1 HTTP server and injects a fixed relay URL.

- `electron/loopback-server.js` — static server for the repo root; injects
  `__KG_WS_URL__` (+ platform globals) into every HTML page before its own scripts run.
- `electron/main.js` — starts the loopback server, loads `/fasttrack/index.html` from it.
- `electron/package.json` — `extraResources` copies `js`/`lib`/`assets`/`fasttrack`
  into `resources/app-root`; `main.js` serves that when packaged.
- `js/multiplayer-client.js` `_wsUrl()` — honors `window.__KG_WS_URL__` first (the seam
  where a future P2P/LAN transport substitutes its endpoint). Web is unaffected.

Run dev: `cd electron && npm install && npm start`
Override relay for local testing: `KG_WS_URL=ws://127.0.0.1:8765/ws npm start`

Target: itch.io (no Steam fee for now; greenworks stays dormant).

## Host-authoritative turns (the "turns not dividing properly" fix)
Root cause: the old model let the *active player's* client advance its own turn and
broadcast `turn_advance`. Because `_isMyTurn()`/`_isHost()` have permissive fallbacks,
two clients could both think it was their turn → double or skipped advances; per-client
turn seqs collided; dropped/duplicated self-broadcasts desynced rotation.

Fix (in `fasttrack-game-core.js`): the **host is the sole turn authority**.
- The host runs the full simulation for every seat — its own turns and bots directly,
  every remote human's turn by replaying their relayed draw/move under `_applying`.
  So the host's `endTurn()` fires once per turn for ALL players.
- Host `endTurn()` calls `_applyTurnAdvance` + broadcasts `turn_advance`; non-hosts
  never advance locally — they clear turn UI and commit only when the host's broadcast
  arrives (idempotent via fresh seq).
- Stuck-watchdog: on the host it watches *whichever* seat is current (not only its own)
  so a genuinely AFK remote still gets backstop-passed.
- Invariant: the only in-game mutation of `state.players.current` is `_applyTurnAdvance`,
  reached only from the host's `endTurn` and the `turn_advance` apply handler.

Dependency: exactly one client must be flagged host. The lobby guarantees this
(`server/lobby-server.js`: sets `host_id` on create, reassigns on host disconnect).

NOT YET PROVEN: needs a live 2-human session to verify end-to-end. Solo tests
(28 passing) only exercise `_applyTurnAdvance`, not the MP host/non-host branch.

Transport unchanged (still the kensgames.com relay). P2P/LAN deferred per the
"relay now, P2P later" decision.
