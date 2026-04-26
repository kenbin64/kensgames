# Governing Document — Addendum (pending fold-in to PDF v1.1)

> The PDF Governing Document is read-only binary in this repo. Until v1.1 is regenerated, treat this file as the canonical source for the two glossary entries below.

## Glossary additions for Chapter 13

### Lens

A pure function `f(x, y, z) → value` evaluated on read. Lenses are not storage; they exist only at the moment of query. The substrate is the canvas; lenses are the projections drawn from it.

Examples in this engine: surface field at a point, color at a point, audio amplitude at a point, force vector at a point.

A lens may be derived from any TPMS, any algebraic combination of `(x, y, z)`, or any further composition of lenses. A lens never persists, never indexes, and never participates in the join model of Chapter 9.

### Schwartz Diamond (auxiliary)

An optional secondary triply periodic minimal surface, defined by:

```
cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0
```

Used as a lens for visual geometry (its zero-set has 8-fold symmetry suited to certain game structures), for force fields via its gradient `∇D`, and for inflection timing in audio and AI sub-systems.

The Schwartz Diamond is **not part of the database substrate**. The substrate role defined in §9.4 is reserved for the Gyroid. The Schwartz Diamond never serves as an index, never as a join surface, never as a storage encoding.

A repo-side reference for the role split lives in `docs/SUBSTRATES.md`.

## Suggested PDF section to add (optional, for v1.1 §3.5)

A short subsection after §3.4 ("Substrate Traversal") titled "Auxiliary Lenses" that:

1. Restates the lens definition above.
2. Names the Schwartz Diamond as the first canonical auxiliary lens.
3. Reaffirms that auxiliary lenses do not amend Chapter 9 — the Gyroid remains the sole substrate.
4. Allows future auxiliary lenses to be registered without spec revision, provided they obey the same rules.

This keeps the spec faithful to its current architecture while making room for the lenses the games already use.
