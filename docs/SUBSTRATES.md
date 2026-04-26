# Substrates of the Manifold

> Read this before adding any new "lattice", "field", or "surface" to the code.

This repo speaks the manifold dialect: `x` is identity, `y` is current state and what to do next, `z = xy` (or `z = xy²`) is the manifold surface that joins them. Apps and games are seeded with an `x` and bloom organically as `y` evolves.

This doc names the two TPMS surfaces in this repo, the role each one plays, and the rule that keeps them separate.

## The two surfaces

| Surface | Equation | Role | Defined in |
|---|---|---|---|
| **Gyroid** | `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0` | **Substrate** — storage, indexing, joining | Governing Doc §3, §9 |
| **Schwartz Diamond** | `cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0` | **Auxiliary lens** — visual geometry, force fields, AI inflection timing | This repo only |

The Gyroid is the canonical substrate — the single TPMS the engine is built on. The Schwartz Diamond is a derived field computed on read; it is never stored, never indexed, and never used as a key.

## How the two surfaces map to x / y / z

| Manifold term | Meaning | Where it lives |
|---|---|---|
| **x** (canvas / identity) | Each game's seed; each entity's first coordinate. The 5-game product spec is an x-side artifact. | `universe/`, `docs/KENSGAMES_5_GAME_SPEC.md`, `*.x.json`, `_xy[index*2]` in `js/manifold.js` |
| **y** (state / next) | The dynamic coordinate. Current state and what the entity should do next. | `_xy[index*2 + 1]`, runtime updates |
| **z = xy** (linear) | Primary manifold surface. Most queries and joins resolve here. | `js/manifold.js` `_z()` — canonical here is `z = xy²`; both are valid per spec |
| **z = xy²** (quadratic) | Secondary, more expressive surface. Used when linear resolution is insufficient. | same |
| **m = xyz** (manifold value) | Full multiplicative coupling — the entity's identity at this point. | `_m()` |
| **Gyroid field** | Substrate. Indexer. Joiner. | `gyroid()` |
| **Schwartz Diamond field** | Lens. Sampled for geometry, gradient, inflection. | `diamond()`, `diamondGrad()` |

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
