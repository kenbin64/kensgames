# FastTrack rewrite: architecture and plan

**Goal:** a clean, modular FastTrack that keeps the exact look and feel (the speakeasy billiard 3D scene), the exact board and hole positions, and the peg motion, while rewriting the logic, state, turn engine, and multiplayer into single-concern, self-documenting, debuggable modules with no spaghetti and no monster files. The original is kept untouched for reference; this rewrite lives under `fasttrack/v2/`.

## What the deep dive found

- **Rules are already a declarative document:** `fasttrack.rules.json` (v3.4.0) is the single source of truth: board geometry, setup, every card, and 40+ labeled rules with assertions and provenance. We keep this and the new engine READS it instead of re-encoding it. This is the keystone, and it already exists.
- **Look and feel + board geometry live in `fasttrack-3d.js`** (6,943 lines): billiard room, herringbone floor, billiard-ball pegs, jazz speakeasy audio, and the 3D hole positions. We preserve this visual layer (refactored into clean render modules, visually identical).
- **The logic is the mess:** `fasttrack-game-core.js` (4,450 lines) hardcodes the rules and mixes logic, DOM, rendering, audio, and multiplayer. This is what we rewrite.

## Canonical naming decision

The rewrite adopts the **rules.json naming** as the one true hole id scheme, because it is the documented source of truth and is cleaner than the engine's current `side-left / outer / home / side-right` segment names:

- Outer track: `outer-{p}-{1..14}`, p in 0..5 (84 holes). FT hole is `outer-{p}-1` (dual role with `ft-{p}`). Safe-zone entrance is `outer-{p}-8`. Wedge end `outer-{p}-14` -> `outer-{(p+1)%6}-1`.
- FT ring: `ft-{p}` (6), clockwise `ft-0 -> ... -> ft-5 -> ft-0`, each shared with `outer-{p}-1`.
- Safe zone: `safe-{p}-{1..4}` (owner only, forward only, exact landing). Home/winner: `home-{p}`. Holding: `hold-{p}-{1..4}`. Bullseye: `center` (max one peg).

The render layer maps each canonical id to the existing 3D coordinate from `fasttrack-3d.js`, so the holes stay in their current places.

## Module layout (single concern per file)

```
fasttrack/v2/
  rules/                  -> uses ../fasttrack.rules.json (the existing source of truth)
  engine/                 (pure logic: no DOM, no Three.js, fully unit-testable)
    rules.js              load + index fasttrack.rules.json (cards, rule lookups, redraw set)
    board.js              build the hole topology + clockwise sequences from the geometry
    state.js              game state model (players, pegs, occupancy, deck, turn)
    deck.js               seeded deterministic deck build + shuffle
    moves.js              calculateValidMoves: one small function per move type
                          (enter, step, ftExit, bullseyeEnter, bullseyeExit, split, safeEntry)
    apply.js              applyMove: mutate state (move, cut, circuit, ft-status, win)
    turn.js               turn engine: draw -> play -> extra-turn -> end + rotation
  net/
    session.js            host-authoritative rotation (with the fixes already proven)
    transport.js          relay adapter (own-message filtering)
  render/                 (Three.js; reuse the existing visuals, refactored)
    scene.js              billiard room, lighting, floor (from fasttrack-3d.js)
    boardMesh.js          table + holes at the exact existing coordinates
    pegs.js               billiard-ball peg meshes + motion/animation
    camera.js  materials.js
  audio/
    speakeasy.js          jazz engine + SFX (reuse)
  ui/
    index.html            structure only
    styles.css            all CSS, separate
    hud.js cards.js controls.js
  app.js                  composition root: wires engine + render + net + ui
  tests/                  headless engine tests (reuse + extend the current 9 suites)
```

## What is reused vs rewritten vs kept

- **Kept:** `fasttrack.rules.json` (the declarative rules). The new engine reads it.
- **Reused (preserve look and feel, holes in place):** the Three.js scene building, materials, board mesh and hole coordinates, peg meshes and motion, the jazz speakeasy audio. Refactored into the `render/` and `audio/` modules, visually and audibly identical.
- **Rewritten clean:** engine (board, state, deck, moves, apply, turn), multiplayer rotation, UI glue, and the HTML/CSS split.

## Phasing (each phase ships only what is tested)

1. **Engine (pure logic), this is the keystone and where the bugs lived.** board, rules-loader, state, deck, moves, apply, turn, all driven by `fasttrack.rules.json`, with the host/turn fixes baked in, proven by a headless test suite ported and extended from the current 9 suites.
2. **Render layer.** Extract the visual and geometry from `fasttrack-3d.js` into `render/`, map canonical hole ids to the existing coordinates, wire to engine state. Verify the look and feel and hole positions are identical.
3. **Multiplayer + UI + audio.** Host-authoritative session (with the proven fixes), split HTML/CSS UI, speakeasy audio.
4. **Integration, full test pass, desktop packaging.**

## Principles

Single-concern files and functions; self-documenting names; no function over ~40 lines without a reason; no file mixing logic with DOM or rendering; every engine claim covered by a test; the rules live in JSON, never re-encoded in code.
