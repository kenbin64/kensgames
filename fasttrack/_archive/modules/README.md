# Archived: `fasttrack/modules/` — unwired derived-data refactor

**Status:** Archived 2026-06-05. Not loaded by the live game.

These eight files were an early attempt to decompose the two monolith files
(`fasttrack-3d.js`, `fasttrack-game-core.js`) into a clean "manifold / substrate"
derived-data layer:

| file | exported | intended role |
|---|---|---|
| `ai_manifold.js` | `AIManifold` | AI move selection by difficulty |
| `board_substrate.js` | `BoardSubstrate` | board geometry as a hole registry |
| `card_substrate.js` | `CardSubstrate` | card data as a manifold |
| `game_manifold.js` | `GameManifold` | game-state facade |
| `peg_substrate.js` | `PegSubstrate` | peg registry |
| `peg_personality_substrate.js` | `PegPersonalitySubstrate` | peg reactions/personality |
| `render_manifold.js` | `FastTrackRender` | 3D rendering refactor |
| `rules_manifold.js` | `RulesManifold` | legal-move calculation (≈50 lines vs the 600+ live monolith) |

**Why archived, not deleted:** verified dead — no `<script>` tag loads them, no
symbol (`AIManifold`, `RulesManifold`, …) is referenced outside this folder, no
dynamic `import()`/loader pulls them, and the service worker does not precache
them. They also do not `require` each other; the cluster is fully standalone.
The work represents a real direction (the "everything from derived data" goal),
so it is preserved here rather than thrown away. The repo's audit scripts skip
`_archive/`, so this no longer shows up as live surface area.

**If you revive any of it:** `rules_manifold.js` is the most useful starting
point — it is the compact, readable version of `calculateValidMoves()` that the
live `fasttrack-game-core.js` decomposition (in progress) is converging toward.
Re-wire by adding a `<script>` to `3d.html` and replacing the corresponding
inline logic, one substrate at a time, with tests at each step.
