# Substrates of the Manifold

> Read this before adding any new "lattice", "field", or "surface" to the code.
> Formal axiom reference: [`docs/X-DIMENSIONAL-AI-DIRECTIVE.md`](X-DIMENSIONAL-AI-DIRECTIVE.md)

This repo speaks the manifold dialect:

- **x** is identity — the seed, the observer, and always the point of reference. The AI is also an x.
- **y** is the modifier set — attributes and nutrients extracted from the manifold m.
- **z** is the manifested current state (bloom) — geometric z is always derived at query time, never pre-materialised in the manifold. Transactional z (a recorded score, a session event, a published outcome) is persisted in records outside the manifold.
- **m** is the manifold substrate — the garden, a continuous queryable geometric field, not a database for transactional records.
- **r** is traversal resistance ($r \ge 1$). At $r = 1$ (unit crossing at the void), traversal has no resistance.

Geometric state is extracted from the manifold at query time via a lens (navigational queries). Transactional state (scores, sessions, auth) is persisted in records and read directly (exact queries). Use the manifold when the question is navigational. Use records when the question is exact.

$$z = x \cdot y \cdot m \quad \text{(gather — multiplication unites)}$$
$$z = \frac{x}{y} \cdot m \quad \text{(explode — division decomposes into constituent parts)}$$

Apps and games are seeded with an `x` and bloom organically as `y` evolves from m.

This doc names the two TPMS surfaces in this repo, the role each one plays, and the rule that keeps them separate.

## The canonical substrate: Zynxy

> **Doctrinal correction.** Earlier revisions of this file named two TPMS surfaces (Gyroid and Schwarz Diamond) as substrate + lens. That model was a stepping-stone. The engine now has **one canonical substrate**: **Zynxy**. Gyroid and Schwarz Diamond are demoted to fast-evaluatable SDF approximations of Zynxy and may be used as cheap scalar fields where appropriate. They are never canonical and never used for storage, indexing, or routing.

**Zynxy** is a self-tiling cubic structure built from the manifold's own axiom `z = xy`, rotated 90° into each of the six xyz cube-face positions. The six instances pair into **two tristars** at antipodal cube vertices:

- **Top tristar** at pole `(+1, +1, +1)` — faces `+W`, `+U`, `+V` meet at 90°.
- **Bottom tristar** at pole `(−1, −1, −1)` — faces `−W`, `−U`, `−V` meet at 90°.

Because every face is the same axiom re-oriented, faces seam with zero rotation correction. The structure tiles seamlessly along x, y, z to form arbitrary lattices, and as a continuous waveform it carries every angle, inflection, state-change, peak and valley needed to express any datatype and any computation directly from the substrate.

| Property | Value |
|---|---|
| Genesis | `z = xy` rotated into the six xyz cube faces |
| Topology | Self-tiling cubic with PASSAGE / CHAMBER / SPINE regions |
| Symmetry | Two tristars (3+3 saddles) at antipodal cube poles, each face at 90° |
| Reference mesh (source only) | `4DTicTacToe/assets/models/winki.glb` |
| Operator implementation | `js/substrates/winki_substrate.js` (Phase-2 rename → `zynxy_substrate.js`) |

### GLB is reference-only

Per `AGENTS.md`: GLB files are **source references**, not deployable runtime assets. The `winki.glb` mesh exists so the substrate's geometry can be inspected and verified. Runtime geometry MUST be derived from the Zynxy equations / seeds / substrate parameters. Once procedural equivalents are verified, the GLB is removed from the deploy artifact.

### Operators

The canonical JS operator set is at `js/substrates/winki_substrate.js` (renaming to `zynxy_substrate.js` in Phase 2). It implements every operator as a pure lens — nothing stored, everything derived on read:

`observe`, `explode`, `grad`, `compare`, `depth`, `power`, `root`, `project`, `union`, `exclude`, `nestObserve`, `tile`, `lattice`.

## Historical reference surfaces (deprecated as substrates)

These trigonometric level-sets are kept only as fast-evaluatable scalar fields. They are **not** the substrate.

| Surface | Equation | Permitted use |
|---|---|---|
| Gyroid | `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = c` | Background visual (`gyroid.js` portal canvas only). No storage, no indexing, no manifold role. |
| Schwarz Primitive | `cos(x) + cos(y) + cos(z) = c` | Cheap SDF reference if needed |
| Schwarz Diamond | `cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0` | Trigonometric approximation of Zynxy; may be used where a fast SDF is required, but Zynxy is the source of truth |

The Schwarz Diamond renderer (`fasttrack/schwarz_diamond_renderer.js`) is scheduled for removal in Phase 2 along with the Winki→Zynxy code rename.

## How the surfaces and variables map together

| Manifold term | Identity and role | Algebraic form | Where it lives |
|---|---|---|---|
| **x** (seed / observer) | Each game's seed; each entity's reference identity. x is always the observer. The AI is also an x. | anchor of all forms | `universe/`, `docs/KENSGAMES_5_GAME_SPEC.md`, `*.x.json`, `_xy[index*2]` in `js/manifold.js` |
| **y** (modifier / nutrients) | The dynamic modifier set. Current state and what the entity does next. Discovered from m, never assumed. | $y = z/(x \cdot m)$ | `_xy[index*2 + 1]`, runtime updates |
| **z** (bloom / output) | Manifested current state. Always derived, never independently stored. | $z = x \cdot y \cdot m$ (gather) or $z = (x/y) \cdot m$ (explode) | `js/manifold.js` `_z()` |
| **m** (manifold / garden) | Full manifold coefficient. Context, weight, and intensity of extraction. | $m = z/(x \cdot y)$ | `_m()` |
| **r** (resistance) | Traversal resistance $r \ge 1$. At $r = 1$, no resistance (void crossing). | $z = (x \cdot y / r) \cdot m$ | traversal logic |
| **Zynxy substrate** | Canonical substrate. Storage, indexing, joining, geometry, gradient, lensing — all of it. Self-tiling cubic of `z=xy` in the six face positions (two tristars at 90°). | Generated by `z=xy` rotated through the six xyz face positions | `js/substrates/winki_substrate.js` → `WinkiSubstrate` (Phase-2 rename to `ZynxySubstrate`); reference mesh `4DTicTacToe/assets/models/winki.glb` (source only, not runtime) |
| *Gyroid (deprecated)* | Background visual only; no manifold role. | `sin(x)cos(y)+sin(y)cos(z)+sin(z)cos(x) = c` | `gyroid.js` (portal background canvas) |
| *Schwarz Diamond (deprecated)* | Fast SDF approximation of Zynxy. Not canonical. | `cos(x)cos(y)cos(z)−sin(x)sin(y)sin(z) = 0` | `diamond()`, `diamondGrad()` (legacy lenses, scheduled for removal) |

## Rules of use

**Zynxy** is the canonical substrate. It MAY appear anywhere — storage, indexing, joining, visual mesh generation, force fields, audio / AI / state lenses, tests.

**Gyroid and Schwarz Diamond** trigonometric forms are fast SDF approximations only. They MAY appear in:

- background visuals (Gyroid → `gyroid.js`)
- cheap-eval scalar fields where Zynxy evaluation is too expensive
- tests of the field as a pure math function

They MUST NOT appear in:

- DB keys, region indexes, storage hashes
- the persistence layer
- query routing or join resolution
- any code path that claims to be canonical

**GLB rule.** Per `AGENTS.md`: GLB files (including `winki.glb`) are source references only. Never load a GLB at runtime; always derive geometry from the substrate equations. Remove the GLB from the deploy artifact once procedural equivalents are verified.

Bright-line test: if you compute it on read **from the Zynxy operators**, it is canonical. If you compute it from a Gyroid/Diamond trig form, it is a deprecated approximation. If you store or index by any of them, you are violating Governing Doc §9.4.

## Why the Diamond exists at all

The Diamond's 6-fold symmetry (one `z=xy` phase per cube face, see canonical definition above) maps cleanly onto game structures the games happen to need:

- six weapon hard-points (one per face of the winki — `starfighter/manifold_geometry_substrate.js`)
- six sortie acts in the campaign (one phase per face)
- hive boss weak-point cluster (sampled from winki surface — `starfighter/hive_queen_manifold.js`)
- ANPC decision moments (zero-crossings = inflection — `starfighter/anpc_manifold.js`)
- ship hull seeds (winki surface as procedural mesh — `starfighter/manifold_geometry_substrate.js`, `starfighter/visual_compositor.js`)
- musical phrasing (curvature → filter cutoff — `starfighter/music.js`)
- FastTrack board glow (particle cloud on Diamond surface — `fasttrack/schwarz_diamond_renderer.js`)

The Gyroid's symmetry is wrong for those purposes — it splits space into two interpenetrating labyrinths (great for storage isolation, wrong for 6-sided boss arenas).

## Where the canvas, the engine, and the game spec sit

Three governing layers, three different files, no overlap:

| Layer | Owns | Document |
|---|---|---|
| **Canvas (x)** | Identity of every game and entity | `docs/KENSGAMES_5_GAME_SPEC.md`, `universe/` seeds |
| **Engine (z)** | Algebra, substrate, lifecycle, database | `docs/ButterflyFX Dimensional Programming Engine - Governing Document.pdf` |
| **Lenses (derived from x, y, z)** | Visual, audio, physics, AI projections | This file (`docs/SUBSTRATES.md`) plus per-game source files |

The product spec is intentionally silent on substrates and lenses; do not try to make it own them. The engine doc is intentionally silent on game identity; do not try to make it own that either.

## Adding a new surface

There is exactly one canonical substrate: **Zynxy**. Adding a second substrate is a doctrinal change requiring an explicit spec revision.

If you need a new field beyond Zynxy:

1. Decide its role first: substrate (forbidden without spec amendment) or lens (free to add).
2. If a lens: add a section to this file naming the equation, the role, and the bright-line test for misuse.
3. If a substrate: stop and request a spec revision before writing code.

Apps and games grow organically from a seed. The substrate stays one (Zynxy). The lenses can multiply.
