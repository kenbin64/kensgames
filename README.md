# kensgames

A browser-based 3D game portal: multiple games, a multiplayer lobby server, and a shared
rules-and-geometry layer, written in dependency-light JavaScript and served from a single
modest VPS.

Live: https://kensgames.com

## Games in the portal

| Game | What it is | Approx. size |
|------|------------|--------------|
| Starfighter | 3D space shooter | ~24,000 lines JS |
| Fast Track | 3D board-race game with a formal rules engine | ~17,000 lines JS |
| 4D Tic-Tac-Toe | tic-tac-toe on a four-dimensional board | ~2,400 lines JS |
| Brick Breaker 3D | 3D brick breaker | ~3,000 lines JS |
| Assemble | parts-assembly puzzle | ~3,000 lines JS |
| Qixoid | a Qix-style area-capture game | ~1,400 lines JS |
| Lobby server | Node multiplayer lobby and session sync | ~8,000 lines JS |

Roughly 127,000 lines of JavaScript across the portal, excluding dependencies. Rendering
is browser 3D (WebGL and canvas). Games are loaded in sandboxed iframes and talk to the
portal over a `postMessage` protocol, so a game can be added without coupling it to the host.

## Fast Track: a rules engine with a verifiable core

Fast Track's rules live in one source of truth, `fasttrack/fasttrack.rules.json`, which
consolidated six earlier parallel rule files. The registry is keyed on `z = x * y`: every
rule carries a unique `(x, y)` with `z = x*y`, which gives the rule set a built-in collision
check. That is the one place the geometry idea earns its keep, and it is covered by a test.

The engine's invariants are checked by an automated suite. These are measured results:

| Test | Result | Proves |
|------|--------|--------|
| `test_path_contiguity.js` | 503 paths, 0 teleports | every move is hole-by-hole adjacent, no shortcuts |
| `test_deck_determinism.js` | 11 / 0 | the same session code yields the same deck on both clients |
| `test_win_and_safezone.js` | 12 / 0 | exact-landing win, overshoot dies, safe-zone fill order |
| `test_card7_completeness.js` | 14 / 0 | every bullseye split launches from a fast-track hole |
| `test_no_legal_move_relinquish.js` | 5 / 0 | a turn is relinquished only when no legal move exists |
| `test_card7_splits.js` | 35 / 0 | 7-card split generation obeys the rules across 278 splits, 0 violations |
| rules.json sync | green | code matches the source of truth; every rule satisfies `z = x*y` |

Run them:

```bash
node fasttrack/test_path_contiguity.js
node fasttrack/test_card7_splits.js
# and the rest in fasttrack/
```

## Architecture

- **Portal + iframed games.** The host page launches each game in a sandboxed iframe and
  exchanges config and scores over a validated `postMessage` protocol. No cross-domain
  coupling, and any game engine can plug in.
- **Lobby server.** A Node server handles multiplayer lobbies and session sync. Decks are
  seeded so both clients deal identically (see `test_deck_determinism.js`).
- **Shared modules.** Common rules and geometry helpers live in shared substrate modules so
  games reuse one implementation rather than re-encoding rules.

## Honest scope

- The games run in the browser and the Fast Track tests above pass and are reproducible.
- `z = x * y` is used here as an organizing and rule-keying scheme with the tested benefit
  noted above. It is not claimed to make anything faster; a geometric derivation is often
  slower than a lookup. Its value is one consistent representation and a checkable rule set.
- The broader geometric theory behind the manifold is a separate, clearly-labeled
  exploration at https://dimensionalprogramming.com, not part of this repo's claims.

## Author and license

Kenneth W. Bingham. The games and code are mine. The underlying mathematical principles are
universal and unowned, applied here in particular ways.
