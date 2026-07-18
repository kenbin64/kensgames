# FastTrack v2 bridge: engine-backed core driving the existing 3D scene

This is the wiring that puts the clean, tested v2 engine underneath the untouched 3D renderer, so the
turn bug is fixed in a playable build without changing the look, feel, or rules.

## What it is
- `fasttrack/v2/browser/fasttrack-core-v2.js` — an ES module that presents the exact
  `window.FastTrackCore` surface the renderer already reads (`state` tables, `initGame`, `drawCard`,
  `executeMove`, `passTurn`, `setRenderer`, `updateUI`, `botTurn`, split staging), but every rule,
  peg position, and turn is owned by the v2 engine in `fasttrack/v2/engine/`.
- `fasttrack/v2/browser/project.js` — pure projection of engine state into the renderer's shapes.
- `fasttrack/v2/browser/holemap.js` — the only vocabulary differences (holding index, center vs
  bullseye, card suit glyphs).
- `fasttrack/v2/browser/rules-data.js` — `fasttrack.rules.json` as an importable module (so rules
  load synchronously, no fetch race with `init3D`). Regenerate if the JSON changes.
- `fasttrack/3d-v2.html` — a copy of `3d.html` with one line changed: the legacy
  `fasttrack-game-core.js` (and the opt-in manifold alternate engine) is replaced by this module.

## Why it fixes the turn bug
The legacy core advanced the turn inside an animation/cutscene callback chain
(`waitForAnimations -> whenDrained -> advanceTurn`). A misfired callback skipped a seat or granted a
wrong extra turn. Here the engine rotates the turn SYNCHRONOUSLY the instant a move is applied; the
hop animation is fired afterward and is purely cosmetic. Rotation can never wait on an animation.

## What is proven headlessly
- `node tests/*.test.js` — 126 engine assertions incl. the 545-step full game, the turn-sync
  anti-skip proof, and the ported bullseye entry.
- `node browser/adapter-harness.js` — runs a full all-bot game through the real renderer contract:
  the turn/hole projection is valid on every render (0 invalid), a legitimate winner is reached.

## What still needs a live browser (only the pixels)
Open `3d-v2.html` and confirm the scene looks/plays identically. The 3D rendering cannot be verified
headless.

## Known v1 limitations (tracked, not hidden)
- Bot AI is a sensible heuristic, not the legacy AI's exact behavior.
- Multiplayer transport is Phase 3; solo and same-screen work now (snapshot hooks are stubs).
- AFK/break chrome is simplified for solo.
