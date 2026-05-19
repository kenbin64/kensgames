# Whorl — Grid-Painting Plan

> A grid-edge variant of [qixoid/index.html](qixoid/index.html). Players paint
> the **edges** of grid cells and must **close a section** before the antagonist
> touches the open edge. Lives on the same snail-shell substrate as Qixoid, so
> the antagonist is chosen to be **complementary with the shell** rather than
> an arbitrary plasma blob.

---

## 1. Naming

| Role | Name | Why |
|------|------|-----|
| Game | **Whorl** | A whorl is one turn of a snail shell's spiral. Also evokes the spinning motion of the antagonist. Single syllable, brandable, not "Qix". |
| Player avatar | **Stylus** | Walks the grid graph; paints edges. |
| Antagonist | **Coilworm** | A creature that natively inhabits shell whorls. It travels **along the same logarithmic spiral as the shell**, but in the opposite handedness — mathematically *complementary* to the shell's parametrization. |
| Painted edge | **Filament** (matches Qixoid) | Same term reused. |
| Closed cell | **Scute** | Plate-like sealed cell, like a shell scute. |

Naming is reversible — none of this hard-codes lore into the manifold.

---

## 2. Substrate — Grid on the Snail Shell

The Qixoid shell is already a parametric surface
$\mathbf{S}(u,v)$ with $u$ winding around the spiral and $v$ across the aperture.
Tile it into a **graph grid** without leaving the manifold:

- $N_u$ cells along the spiral (suggest $N_u = 34$ — Fibonacci).
- $N_v$ cells across the aperture (suggest $N_v = 13$ — Fibonacci).
- **Vertices** = lattice points $(i/N_u,\ j/N_v)$ pulled back through $\mathbf{S}$.
- **Edges** = geodesic-ish segments between 4-neighbour vertices, drawn as
  short tube meshes on the shell surface.
- **Faces** = quad cells; each carries state `{open, painting, closed, eaten}`.

The grid is **derived from the substrate**, not stored independently — per
manifold rule, $z$ (the current grid state) is a projection from
$x$ (seed: shell parameters + Fibonacci dims) and $y$ (modifiers: player paints,
Coilworm position). See [docs/HARD_RULES.md](docs/HARD_RULES.md) HR-27..30.

Because the shell already has a 1D spiral coordinate, "grid section" maps
naturally to a contiguous patch of $(i,j)$ indices — no Euclidean cheating.

---

## 3. Core Loop

1. Stylus stands on a **vertex** (graph node).
2. Player presses a direction → Stylus walks one **edge** to the neighbour
   vertex. While moving, that edge is marked `painting` (live).
3. When the Stylus returns to a vertex already on a `closed` edge or the
   border of a closed region, the painted path closes a polygon.
   - All cells **inside the smaller of the two resulting regions** flip to
     `closed` and award score.
   - If the larger region contains the Coilworm, the smaller one is always
     the one the player just enclosed (standard Qix rule).
4. **Coilworm** travels through the *open* region only. Its **only**
   offensive option is to strike a `painting` (live, in-progress) edge:
   - Touching a `painting` edge → that filament shatters, all of the
     player's in-progress edges revert to `open`, life lost.
   - Touching a **`closed`** cell or its border → **the Coilworm is
     destroyed** (or the segment that struck it is severed). Closed
     territory is lethal to it.
5. **Objective — squeeze, don't just fence.** Score scales super-linearly
   with the fraction of the shell closed, so the optimal play is to keep
   closing cells until the Coilworm has nowhere left to run without
   touching closed territory. Forcing the worm into a closed cell is the
   intended kill condition — the player wins by **shrinking the open
   region to zero**, not by reaching an arbitrary 80% threshold.
   - Suggested score curve: $\text{score}(p) = \lfloor 1000 \cdot p^{\varphi} \rfloor$
     where $p$ is fraction closed. At $p = 0.5$ this is $\approx 325$;
     at $p = 0.95$ it jumps to $\approx 920$ — disproportionate reward
     for the final hard-to-close cells where the worm is cornered.
   - Bonus: forcing a Coilworm self-destruct on closed territory awards
     a "**Corner**" multiplier on the next round.

---

## 4. The Coilworm — Why It's Complementary

The Qixoid antagonist is currently a generic plasma blob with tentacles.
Replacing it with a Coilworm makes the antagonist *belong* to the shell:

- **Path:** The Coilworm's body is sampled from the shell's own
  logarithmic-spiral curve $\mathbf{C}(t) = \mathbf{S}(t,\ v_0(t))$ with
  **opposite chirality** ($t \to -t$ in the spiral phase). Player paints
  with the shell's handedness; the Coilworm uncoils against it.
  This is the literal manifold complement: if the shell is $(u,v)$,
  the Coilworm rides $(-u, v)$.
- **Speed:** Phi-scaled — head moves at $1$, each body segment lags by
  $1/\varphi$. Body length grows with the player's claimed percentage,
  enforcing the "bigger fills pay disproportionately more" Qixoid maxim
  in reverse: bigger claims summon a longer worm.
- **Behaviour:** Worm prefers the **largest open region** (Voronoi-style
  centroid of open cells in $(u,v)$ space). It cannot enter closed cells —
  and crucially, **cannot even touch their borders without dying**, so as
  the player tightens the noose the worm is forced into ever-narrower
  open corridors. Its *only* viable move against the player is to dash
  at a `painting` edge before the player closes it. If no `painting`
  edge exists, the worm is purely on the defensive.
- **Visual fit:** Worm rendered as a chain of small calcite-coloured
  segments hugging the shell surface — looks like it was always meant
  to live there.

Other antagonists considered and rejected as less complementary:
- *Hermit crab* — too literal, breaks the abstract feel.
- *Glow-worm* — fine visually, but no mathematical link to shell coords.
- *Parasite bloom* — would erode closed cells; too punishing for a paint loop.

---

## 5. Files to Touch

| File | Change |
|------|--------|
| [qixoid/index.html](qixoid/index.html) | New mode toggle: classic vs Whorl. Or fork to `whorl/index.html`. |
| [qixoid/game.js](qixoid/game.js) | Add `GridGraph` derived from existing shell mesh; add `Coilworm` class beside the existing `Qix` class; keep both behind a `MODE` flag. |
| [qixoid/manifold.game.json](qixoid/manifold.game.json) | Bump version, add `modes: ["classic","whorl"]`, or duplicate to `whorl/manifold.game.json` with same `dimension` shape. |
| `whorl/` (optional new folder) | Mirror Qixoid layout if we want a separate portal tile rather than a mode. |

Recommend **forking into `whorl/`** rather than modifying Qixoid in place —
keeps Qixoid stable, lets Whorl iterate independently, and matches how
[brickbreaker3d/](brickbreaker3d/) and [fasttrack/](fasttrack/) coexist.

---

## 6. Open Questions (decide before implementation)

1. **Edge painting cadence** — instant per-edge (snappy, Light Cycles feel)
   or sub-edge cursor that the worm can intercept mid-edge (closer to Qix)?
   *Default: sub-edge cursor for tension.*
2. **Multiplayer** — co-op stylus painting shares the grid; competitive
   stylus painting splits regions by colour. Whorl naturally supports both
   because the graph is global.
3. **Lives vs streaks** — Qixoid uses lives. Whorl could use a "filament
   bank" that regenerates, aligning with the shell's continuous growth motif.
4. **Mobile controls** — the grid graph makes touch trivial (tap adjacent
   vertex). Worth confirming this is the right entry point for a phone build.

---

## 7. Manifold Compliance Check

- $x$ (seed) = shell parameters + $(N_u, N_v)$ Fibonacci dims + RNG seed.
- $y$ (modifiers) = player paint events + Coilworm phase $t$.
- $z = x \cdot y$ (bloom) = current `{open, painting, closed}` grid state,
  derived every frame, never persisted.
- $m$ (manifold garden) = the queryable shell+grid field; the UI and the
  Coilworm both query it rather than reading a shared array.

No new state container needed beyond what Qixoid already exposes via
`window.__MANIFOLD__`. Add `gridCells`, `paintingEdges`, `coilwormPhase`
to that bridge.
