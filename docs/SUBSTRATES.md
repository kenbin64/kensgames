# Substrates of the Manifold

> Read this before adding any new "lattice", "field", or "surface" to the code.
> Formal axiom reference: [`docs/X-DIMENSIONAL-AI-DIRECTIVE.md`](X-DIMENSIONAL-AI-DIRECTIVE.md)

This repo speaks the manifold dialect:

- **x** is identity — the seed, the observer, and always the point of reference. The AI is also an x.
- **y** is the modifier set — attributes and nutrients extracted from the manifold m.
- **z** is the manifested current state (bloom) — always derived, never stored independently.
- **m** is the manifold substrate — the garden, a continuous queryable geometric field, not a database.
- **r** is traversal resistance ($r \ge 1$). At $r = 1$ (unit crossing at the void), traversal has no resistance.

State is never stored; it is extracted from the manifold at query time via a lens:

$$z = x \cdot y \cdot m \quad \text{(gather — multiplication unites)}$$
$$z = \frac{x}{y} \cdot m \quad \text{(explode — division decomposes into constituent parts)}$$

Apps and games are seeded with an `x` and bloom organically as `y` evolves from m.

This doc names the two TPMS surfaces in this repo, the role each one plays, and the rule that keeps them separate.

## The two surfaces

| Surface | Equation | Role | Defined in |
|---|---|---|---|
| **Gyroid** | `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = c` | **Substrate** — storage, indexing, joining; canonical m field | Governing Doc §3, §9 |
| **Schwarz Diamond (D-class)** | `cos(x) + cos(y) + cos(z) = c` | **Auxiliary lens** — visual geometry, AI inflection, force fields | This repo only |
| **Schwarz Diamond (full)** | `cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0` | **Amplified lens** — 8-fold symmetry for boss geometry, phrasing, ANPC inflection | This repo only |

The Gyroid is the canonical substrate — the single TPMS the engine is built on. The algebraic transforms (gather/explode families) applied to x, y, z, and m generate the geometric shapes that are the manifolds. The Schwarz Diamond surfaces are derived lenses computed on read; they are never stored, never indexed, and never used as keys.

The closest proximity reference for continuous periodic manifold structure is the Schwarz (Swartz) Diamond gyroid trigonometric family — see [`docs/X-DIMENSIONAL-AI-DIRECTIVE.md`](X-DIMENSIONAL-AI-DIRECTIVE.md) Def 1.8.

## How the surfaces and variables map together

| Manifold term | Identity and role | Algebraic form | Where it lives |
|---|---|---|---|
| **x** (seed / observer) | Each game's seed; each entity's reference identity. x is always the observer. The AI is also an x. | anchor of all forms | `universe/`, `docs/KENSGAMES_5_GAME_SPEC.md`, `*.x.json`, `_xy[index*2]` in `js/manifold.js` |
| **y** (modifier / nutrients) | The dynamic modifier set. Current state and what the entity does next. Discovered from m, never assumed. | $y = z/(x \cdot m)$ | `_xy[index*2 + 1]`, runtime updates |
| **z** (bloom / output) | Manifested current state. Always derived, never independently stored. | $z = x \cdot y \cdot m$ (gather) or $z = (x/y) \cdot m$ (explode) | `js/manifold.js` `_z()` |
| **m** (manifold / garden) | Full manifold coefficient. Context, weight, and intensity of extraction. | $m = z/(x \cdot y)$ | `_m()` |
| **r** (resistance) | Traversal resistance $r \ge 1$. At $r = 1$, no resistance (void crossing). | $z = (x \cdot y / r) \cdot m$ | traversal logic |
| **Gyroid field** | Canonical substrate. Indexer. Joiner. Gather-family geometry. | `sin(x)cos(y)+sin(y)cos(z)+sin(z)cos(x) = c` | `gyroid()` |
| **Schwarz Diamond field** | Auxiliary lens. Sampled for geometry, gradient, AI inflection. Explode-family geometry. | `cos(x)cos(y)cos(z)−sin(x)sin(y)sin(z) = 0` | `diamond()`, `diamondGrad()` |

## Rules of use

The Schwartz Diamond MAY appear in:

- visual mesh generation (e.g. `manifold_geometry_substrate.js`, `visual_compositor.js`, `schwarz_diamond_renderer.js`)
- force fields via `∇D` (e.g. `manifold_kernel.js`)
- audio / AI / state lenses (e.g. `anpc_manifold.js`, `music.js`, `phrase_compositor.js`)
- tests of the field as a pure math function

The Schwartz Diamond MUST NOT appear in:

- DB keys, region indexes, storage hashes
- the persistence layer
- query routing or join resolution

Bright-line test: if you compute it on read, it is a lens (allowed). If you store it or index by it, you are violating Governing Doc §9.4 (not allowed).

## Why the Diamond exists at all

The Diamond's zero-set has 8-fold symmetry that maps cleanly onto game structures the games happen to need:

- hive boss weak-points (8 sites by construction — `starfighter/hive_queen_manifold.js`)
- ANPC decision moments (zero-crossings = inflection — `starfighter/anpc_manifold.js`)
- ship hull seeds (Diamond surface as procedural mesh — `starfighter/manifold_geometry_substrate.js`, `starfighter/visual_compositor.js`)
- musical phrasing (curvature → filter cutoff — `starfighter/music.js`)
- FastTrack board glow (particle cloud on Diamond surface — `fasttrack/schwarz_diamond_renderer.js`)

The Gyroid's symmetry is wrong for those purposes — it splits space into two interpenetrating labyrinths (great for storage isolation, wrong for 8-pointed boss arenas).

## Where the canvas, the engine, and the game spec sit

Three governing layers, three different files, no overlap:

| Layer | Owns | Document |
|---|---|---|
| **Canvas (x)** | Identity of every game and entity | `docs/KENSGAMES_5_GAME_SPEC.md`, `universe/` seeds |
| **Engine (z)** | Algebra, substrate, lifecycle, database | `docs/ButterflyFX Dimensional Programming Engine - Governing Document.pdf` |
| **Lenses (derived from x, y, z)** | Visual, audio, physics, AI projections | This file (`docs/SUBSTRATES.md`) plus per-game source files |

The product spec is intentionally silent on substrates and lenses; do not try to make it own them. The engine doc is intentionally silent on game identity; do not try to make it own that either.

## Adding a new surface

If you ever need a third TPMS or any new field beyond Gyroid and Diamond:

1. Decide its role first: substrate (would conflict with §9.4 — needs spec amendment) or lens (free to add).
2. If a lens: add a section to this file naming the equation, the role, and the bright-line test for misuse.
3. If a substrate: stop and request a spec revision before writing code.

Apps and games grow organically from a seed. The substrate stays one. The lenses can multiply.
