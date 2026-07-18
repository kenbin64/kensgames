# FastTrack v2 Netcode: deterministic lockstep over a relay

Stable peer multiplayer built on the one property the v2 engine already has and that is verified
in `tests/netcode-determinism.test.js`: the game is a deterministic function of the seed plus the
ordered move deltas. Same seed plus same deltas gives byte-identical state on every client.

## The model
- **Deterministic lockstep.** Each move is a delta (the engine emits and applies deltas). Clients
  share the seed and the ordered stream of move deltas, and each replays them. No full-state sync,
  so no divergence and minimal bandwidth.
- **One delta log, three jobs.** The same ordered stream is the save file, the netcode stream, and
  the reconnection resync (a peer that drops rejoins by replaying the seed plus the log).
- **The socket server is a relay, not a host.** A dedicated WebSocket server on the new server
  forwards delta messages between players and runs the lobby and turn order. It holds no game
  state, which is the serverless peer play, and keeps server-holds-nothing intact.
- **Host-authoritative choices.** A human turn has a choice (which peg, which split). One client
  (the active seat, or the host driving a bot seat) resolves the choice and broadcasts the chosen
  delta; every client applies that one delta deterministically. The relay only forwards.
- **Performance.** Native desktop (no browser tab overhead) plus deltas-only on the wire plus
  deterministic replay (no full-state messages) plus the render-decoupled engine (never blocks on
  animation) is the performance story, and it is honest: the win is small messages and no DOM/
  animation coupling, not a speed claim about the manifold.

## The hard requirement
Determinism must stay airtight, because any nondeterminism desyncs peers. The engine uses integer
state, a seeded RNG (mulberry32), pure apply, and no Date.now or Math.random, and the determinism
test guards it. New engine code must keep that: no wall-clock, no unseeded randomness, no float
that varies across machines, in the engine.

## Build pieces
1. **Relay socket server** (WebSocket on the new server): rooms/lobby, seat assignment, turn order,
   and forward-only delta relay with per-room sequence numbers. Holds no game state. (Buildable now.)
2. **Client netcode layer:** connect, send the locally-resolved delta, receive and apply remote
   deltas through the same engine, host-authoritative choice resolution, and reconnect-by-replay.
3. **Lobby / matchmaking** as needed.
4. **Live two-player proof** on real machines (the one thing that cannot be fully tested headless).

## Upgrade path
Relay now, true peer-to-peer (WebRTC) later, with this same relay acting as the signaling channel.
The delta-lockstep model does not change; only the transport does.
