# FastTrack — Proof of Concept Walkthrough

> **What this document is.** A plain explanation of *how* FastTrack
> demonstrates the X-Dimensional manifold/substrate paradigm in practice,
> and the live metrics the game emits so the demonstration is observable
> rather than asserted.
>
> **What it is not.** This is not a formal proof. The formal model lives in
> [docs/X-DIMENSIONAL-AI-DIRECTIVE.md](X-DIMENSIONAL-AI-DIRECTIVE.md) and the
> substrate rules in [docs/SUBSTRATES.md](SUBSTRATES.md). This file shows
> where the axioms are exercised by working code, and how to read the
> evidence the running game produces.

---

## 1. The Concept Being Proven

The paradigm makes three claims that a working game must exhibit at the
same time:

1. **`z = x · y` is universal.** Every observable piece of state is the
   product of an identity (`x`, the seed/observer) and a set of
   attributes (`y`, modifiers extracted from the manifold). The state
   itself (`z`) is never stored — it is *derived* on demand.
2. **Observation, not storage.** Datatypes (positions, colors, audio
   pitch, frame timings) are extracted from the manifold field rather
   than persisted as `1`s and `0`s in dedicated records.
3. **Recursion happens between dimensions, never within one.** The same
   field is sampled at different scales (Russian-doll containment) to
   produce game state, audio, animation, and AI decisions, instead of
   each subsystem owning a parallel data model.

FastTrack is the smallest coherent gameplay surface in the portal that
exercises all three at once: a turn-based board with multiplayer, audio,
3D rendering, AI bots, and persistent identity.

---

## 2. Where Each Claim Lives in the Code

| Claim | Code path | What you see |
|---|---|---|
| `z = x · y` universal | [fasttrack/fasttrack-game-core.js](../fasttrack/fasttrack-game-core.js) — `RepresentationTable` (lines 7–16) and the `state` map (lines 18–32) | Ten substrate tables (`ft:players`, `ft:board`, `ft:deck`, `ft:turn`, `ft:movement`, `ft:safeZone`, `ft:meta`, `ft:cards`, `ft:holes`, `ft:pegs`, `ft:art`). Every cell is addressed by a `PathExpr` (section · angle · radius · depth) rather than stored as a record. |
| Observation, not storage | [fasttrack/fasttrack-3d.js](../fasttrack/fasttrack-3d.js) — `materialiseArtTexture` (line 144) and the `renderBoard` bridge (line 4683) | Pegs, hole geometry, art-wall textures, and even the dust motes are *materialised* from the manifold on each frame. The renderer holds zero authoritative state. |
| Audio = field samples | [js/manifold-instrument.js](../js/manifold-instrument.js), wrapped by [fasttrack/fasttrack-3d.js](../fasttrack/fasttrack-3d.js) `ManifoldAudio` | Each sound (peg drop, draw card, win) is the manifold field walked at audio rate. There is no PCM library; pitches come from `z = cos(θ) · sin(θ)` over the 7-section helix. |
| Russian-doll identity | [fasttrack/3d-bootstrap.js](../fasttrack/3d-bootstrap.js) | `KG_Game{ x, mode, code, … }` contains `KG_Player{ x, name, avatar }`. Both expose an identity-`x` so either can be reached directly without traversing the tree. |
| Recursion between dimensions | [fasttrack/fasttrack_manifold_substrate.js](../fasttrack/fasttrack_manifold_substrate.js) | The same field is sampled at three scales: gameplay (turn ticks), animation (60 Hz), and audio (44.1 kHz). |
| Substrate composition | [fasttrack/schwarz_diamond_renderer.js](../fasttrack/schwarz_diamond_renderer.js) | The Schwarz Diamond is used as a fast-evaluatable SDF approximation of the Zynxy substrate (per [SUBSTRATES.md](SUBSTRATES.md)). The board sits on its surface; peg positions are projections of the diamond's gradient field. |

---

## 3. How a Single Move Walks the Manifold

A user clicks a peg. The full chain, with no parallel state:

1. **Identity resolved** — `KG_Player.x` is the seed. The active player
   table cell is addressed as `state.turn.get('current')` → returns a
   `PathExpr`, not a record.
2. **Card drawn** — `drawCard()` in [fasttrack-game-core.js](../fasttrack/fasttrack-game-core.js)
   samples `state.deck` at the current depth. The drawn card's `moves`,
   `release`, and `replay` flags are *derived* from the card's path on
   the helix, not stored on a card object.
3. **Valid moves computed** — `calculateValidMoves()` walks the
   `CLOCKWISE_TRACK` and asks the manifold which holes are reachable.
   Reachability is `z = peg.x · card.moves` projected onto the board's
   `y` (track plane).
4. **Move executed** — `executeMove()` updates exactly one
   `RepresentationTable` cell (`state.pegs`). No collision array, no
   board grid, no movement history table is written.
5. **Renderer reacts** — `syncPegMatrix()` re-samples the pegs table the
   next frame; the 3D scene materialises the new position. No render
   state was ever held outside the manifold.
6. **Audio reacts** — the same move event is projected onto
   `ManifoldInstrument`, which samples the field along the bloom and
   emits PCM for the peg-drop sound. The sound *is* the move's manifold
   signature, not a separate asset lookup.

The point: between steps 1 and 6 there is no intermediate "game-state
object." Everything is a query against the same field.

---

## 4. Live Metrics — The Observable Proof

The game ships with a built-in dev panel that quantifies the
storage-vs-observation claim every frame.

**How to view it:** open any FastTrack 3D match with `?dev` in the URL
(e.g. `/fasttrack/3d.html?dev`). The panel "🌀 Manifold Metrics"
appears bottom-right. Click to expand.

**What it measures** ([fasttrack-game-core.js](../fasttrack/fasttrack-game-core.js) `getManifoldMetrics`, lines ≈ 2880–2945):

| Column | Meaning |
|---|---|
| `Players`, `Board`, `Deck`, `Turn`, … | Each of the ten substrate tables. |
| `entries` | How many cells are currently addressed in that table. |
| `manifold` bytes | Cost under the manifold model: `entries × (PATH_EXPR_BYTES + 8)` where `PATH_EXPR_BYTES = 32` (4 × Float64 — section, angle, radius, depth) and `8` is the Map-key reference. |
| `json` bytes | Cost if the same data were serialised as a flat JSON object — `JSON.stringify` length of every `key: value` pair. |
| bar / `±%` | Per-table savings (green) or address-cost overhead (red). |
| `Ratio` total | `jsonBytes / manifoldBytes` across all ten tables. |

**How to read the result.** A ratio `> 1×` means observation beats
storage at the current game state; a ratio `< 1×` means the
PathExpr-address cost outweighs the value payload (typical for very
small/early-game tables where the data is too cheap to address).

The interesting datapoint isn't the absolute ratio at any one moment —
it's the **shape of the curve over a match**:

- **Early game** (only `Holes`, `Cards`, `Players` populated) — the
  ratio sits near `1×` or below; the address overhead dominates because
  there's almost nothing to derive.
- **Mid game** (pegs scattered, deck thinned, movement history
  accumulating) — the ratio climbs as more `z` values are derivable
  from the same `x · y` pairs.
- **Late game / safe-zone phase** — `state.pegs` and `state.safeZone`
  carry many implicitly-related cells; the ratio peaks because the
  manifold can address them all with one PathExpr family while a JSON
  serialisation must repeat keys.

**Why this is the right metric.** The paradigm doesn't claim "manifold
is always smaller than JSON." It claims "you don't have to store derived
state." The metric makes the trade-off visible: address cost vs. value
cost. If you ever see a permanently growing `entries` count in a table
whose underlying field hasn't changed dimensionality, that's a paradigm
violation — somebody is storing what they should be deriving.

---

## 5. Other Observable Improvements

Not everything is a byte ratio. The paradigm produces measurable
differences in places that aren't usually counted:

| Property | How FastTrack demonstrates it | Where to look |
|---|---|---|
| **No render-state drift** | The 3D scene cannot fall out of sync with game state because there is no second copy. Reload mid-match restores exactly the same position because state lives in the manifold tables. | [fasttrack-3d.js](../fasttrack/fasttrack-3d.js) `syncPegMatrix` |
| **Audio has zero asset weight** | No `.wav`/`.mp3` files for sound effects. PCM is generated from the same field that drives gameplay. Browser network panel shows zero audio asset requests. | [js/manifold-instrument.js](../js/manifold-instrument.js) |
| **Geometry is procedural** | The `winki.glb` reference mesh is not loaded at runtime; the board/diamond geometry is derived from the substrate equations. Network panel shows no GLB request from `/fasttrack/3d.html`. | [fasttrack/schwarz_diamond_renderer.js](../fasttrack/schwarz_diamond_renderer.js); confirmed by [AGENTS.md](../AGENTS.md) "GLB files are source references, not deployable runtime assets" |
| **One identity, many surfaces** | The same `KG_Player.x` drives the player chip, the active-turn pulse, the audio voice index, and the bot AI's opponent model. Change the avatar in the lobby and every surface re-derives — no per-surface caches to invalidate. | [fasttrack/3d-bootstrap.js](../fasttrack/3d-bootstrap.js) + [js/player-panel.js](../js/player-panel.js) |
| **Lobby/auth has no game logic** | After the kernel-lobby consolidation, FastTrack carries zero per-game socket or auth code. The shared `KGKernelClient` handles every game identically. | [server/lobby-server.js](../server/lobby-server.js) (commits `4ade2a4`, `866e4e2`) |
| **Chrome ↔ logic separation** | [fasttrack/3d.html](../fasttrack/3d.html) is 195 lines of pure markup; CSS/JS are in sibling files. The HTML file contains zero inline `<style>` or `<script>` blocks. | `fasttrack/3d.{html,css}` and `3d-{bootstrap,loader,ui}.js` |

---

## 6. Reproducing the Demonstration Locally

```bash
# Static portal
cd /var/www/kensgames.com && python3 -m http.server 8000
# Unified multiplayer + auth
cd /var/www/kensgames.com && node server/lobby-server.js
```

Then:

1. Open <http://localhost:8000/fasttrack/3d.html?dev>.
2. Start a solo-with-bots match from the wizard.
3. Open the dev panel "🌀 Manifold Metrics" (bottom-right).
4. Play a few turns; watch the `Ratio` value evolve as `entries`
   accumulate in `Pegs`, `Movement`, and `SafeZone`.
5. Open the browser Network panel and confirm:
   - No `.wav` / `.mp3` / `.ogg` requests.
   - No `.glb` / `.gltf` requests from the gameplay surface.
   - The only large assets are the art-wall PNGs (paintings; legitimate
     image content, ingested *onto* the manifold via the `ft:art` table —
     see `ingestArt` in [fasttrack-3d.js](../fasttrack/fasttrack-3d.js) line 105).

If any of those checks fail, the paradigm has been broken somewhere
between the manifold and the renderer — fix the violator rather than
adding a workaround.

---

## 7. What to Do When the Metrics Look Wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| `entries` in any table grows unbounded across turns | Somebody is appending derived state instead of updating in place. | Find the writer; replace `set(newKey, …)` with a query against an existing PathExpr. |
| `Ratio` falls below `1×` and stays there for a whole match | Address-cost is dominating — the table is too sparse to justify a PathExpr. | Either fold the table into a sibling (compose substrates) or accept the overhead and document why this table is the exception. |
| A new asset request appears in the network panel | Somebody loaded a GLB / WAV / texture instead of deriving it. | Replace with a manifold-derived equivalent. GLBs are blueprints, not runtime assets ([AGENTS.md](../AGENTS.md)). |
| Audio cuts out or "pops" on certain events | The instrument was asked to render outside the field's defined range. | Clamp the seed to the helix's valid θ range; do not extend the field arbitrarily. |

---

*FastTrack is the smallest coherent demonstration. The same patterns
extend to the other portal games — verify each against this checklist
before claiming paradigm compliance.*
