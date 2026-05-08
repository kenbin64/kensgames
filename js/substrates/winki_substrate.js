/**
 * winki_substrate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The Winki Substrate — a manifold of manifolds, observed not stored.
 *
 * AXIOM: z = x · y
 *   x = the identity       — what we have; the subject; the fixed point of reference
 *   y = the modifier       — what we want from the substrate; extracted, never assumed
 *   z = the result         — the now; the present state; always derived, never stored
 *
 * OPERATORS are not numbers. They are ACTORS that change the view:
 *   · (gather)   — multiplication unites: all parts become one thing
 *   ÷ (explode)  — division decomposes: one thing becomes all its constituent parts
 *   + (union)    — all parts that belong to x or y
 *   − (exclude)  — all remaining parts after removal
 *   < > = (compare) — parts that are less than, greater than, or equal to x
 *   log (depth)  — how many layers deep until you reach the identity
 *   ^ (power)    — x observing itself through itself n times (recursive identity)
 *   √ (root)     — what x must be such that observing it through y yields z
 *
 * THE WINKI UNIT CELL — FRACTAL WAVEFORM ARCHITECTURE
 *   A single hyperbolic saddle (z = xy in normalized space) rotated into
 *   six cube-face orientations. Each face holds one complete phase of z = xy.
 *   The GLB (winki.glb, 5400 vertices) was the artist's reference — the equation IS
 *   the truth. Runtime geometry is generated directly from the equation; the GLB is
 *   never loaded at runtime. Unit cell spans [-h,+h]³ where h = cellSize/2.
 *
 *   FRACTAL SELF-SIMILARITY:
 *     Every Winki cell fits exactly in a cube. Every cube face is compatible with
 *     every other cube face — zero rotation ever needed. Any cell can be placed
 *     against any face of any other cell and the saddle surfaces meet seamlessly.
 *     This makes Winki infinitely tileable in all directions, at all scales.
 *
 *     A [2,2,2] block of 8 cells has the same boundary conditions as a single cell
 *     at 2× scale. Zoom in and the structure repeats. Zoom out and it still repeats.
 *     The equation z = xy IS the fractal generator — no separate fractal rule needed.
 *
 *   PASSAGES AND CHAMBERS:
 *     Within each cell the saddle creates two kinds of space:
 *
 *     PASSAGE  — near the zero-crossing planes (u≈0 or v≈0, where z = xy ≈ 0).
 *                Two planes intersect at 90° forming a + cross through every cell.
 *                The + cross connects to the + crosses of all 6 adjacent cells.
 *                Result: an infinite connected network of corridors at every scale.
 *                classify() returns 'passage' or 'spine' here.
 *
 *     CHAMBER  — the four lobes between the spine planes (|u|>ε and |v|>ε).
 *                Each lobe is a curved enclosure — a room bounded by the saddle wall.
 *                4 chambers per cell × infinite tile = infinite hive of rooms.
 *                classify() returns 'chamber' here.
 *
 *     SPINE    — exactly on both zero-crossing planes (u≈0 AND v≈0): the axis of
 *                the passage junction. The void point — no manifold pressure. The
 *                center of the crosshair in the image. r=1 void crossing.
 *
 *   KNOWN USES OF THIS STRUCTURE (all the same equation at different scales):
 *     4DTicTacToe board  — each play-cell is one Winki chamber; ball navigates passages
 *     Alien baseship     — tile([0,0,0],[8,8,8]) at ship scale; hive of chambers
 *     Human starfighter sorties — pilots navigate passages between chambers;
 *                                 chambers are combat rooms; passages are flight corridors
 *     Portal gyroid bg   — infinite tile of Winki cells at view scale
 *
 *   In the reference mesh (before scene-graph 90° X rotation):
 *     At x=0 → z = -y           (cross-spine 1, passage plane 1)
 *     At y=0 → z = -x           (cross-spine 2, passage plane 2)
 *     General: z = -(xy + x + y) = 1 - (1+x)(1+y)
 *
 *   TWO TRISTARS — the actual topology of the Winki unit cell:
 *
 *     The 6 faces split into two groups of 3, each group meeting at one corner
 *     of the cube at exactly 90° to its two neighbours. Each tristar is a complete
 *     description of 3D space from one pole — X·Y·Z covered once each.
 *
 *     TOP tristar   (pole +1,+1,+1):   +W  +U  +V   — negative-chirality saddles
 *       +W (top):    w = -(u·v)   normal = +Z   [z = -xy]
 *       +U (right):  u = -(v·w)   normal = +X   [x = -yz]
 *       +V (front):  v = -(w·u)   normal = +Y   [y = -zx]
 *       Each pair meets at 90°: +W⋂+U along the z=1,x=1 edge
 *                               +U⋂+V along the x=1,y=1 edge
 *                               +V⋂+W along the y=1,z=1 edge
 *
 *     BOTTOM tristar (pole -1,-1,-1):  -W  -U  -V   — positive-chirality saddles
 *       -W (bottom): w = +(u·v)   normal = -Z   [z = +xy]
 *       -U (left):   u = +(v·w)   normal = -X   [x = +yz]
 *       -V (back):   v = +(w·u)   normal = -Y   [y = +zx]
 *       Each pair meets at 90° at the (-1,-1,-1) vertex.
 *
 *     The two tristars connect through the 6 cell-face seam planes (u=±1, v=±1, w=±1).
 *     Self-tiling proof:
 *       Face +U boundary: u=1 → 1 = -(v·w)
 *       Face -U of neighbor: u=-1 → -1 = +(v·w)
 *       These are identical — the seam is seamless.
 *       The cube tiles in all three axis directions with zero rotation correction.
 *
 *     Game-semantic meaning of the two poles:
 *       Top tristar    = x positive dominant → advancing / high-energy / offensive zone
 *       Bottom tristar = x negative dominant → retreating / low-energy / defensive zone
 *       Seam planes (zero-crossings) = transition zones, walls, boundaries, neutral ground
 *
 * USAGE PATTERN — always call, never store:
 *   const z = WinkiSubstrate.observe(x, y);       // gather: z = x·y on the field
 *   const parts = WinkiSubstrate.explode(z, x);   // who are the parts of z given x?
 *   const gradient = WinkiSubstrate.grad(x);      // direction of steepest ascent at x
 *   const phase = WinkiSubstrate.faceOf(x);       // which of the 6 saddle phases owns x?
 *   const depth = WinkiSubstrate.depth(x, root);  // log-depth from root to x
 *   const lattice = WinkiSubstrate.tile(x, n);    // observe an n×n×n lattice around x
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HARD RULE: Nothing in this file stores state. Every function is a pure lens.
 * The manifold is the garden (m). You are the observer (x). This file is the
 * operator set that lets x look at m from any angle and extract z.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const WinkiSubstrate = (() => {

  // ── Core saddle — the one equation everything else is built from ──────────
  //
  // In normalized space [-1,1]³ the Winki surface on any given face is:
  //   w = -(u · v)
  // where (u,v,w) are the two face-tangent coords and the face-normal coord.
  //
  // This IS z = x · y from the manifold axiom, negated (the saddle bows inward
  // toward the cube center). The six phases are the six ways to assign (u,v,w)
  // from (x,y,z) — one permutation per face.
  //
  // OPERATOR READING: "gather" means multiply — unite u and v into one thing (w).
  // The minus sign is the inward orientation: the cube shell faces inward.

  // The six face descriptors — each is a pure function observation, not data.
  // group: 'top'    = top tristar,    pole (+1,+1,+1) — the three faces meeting there
  // group: 'bottom' = bottom tristar, pole (-1,-1,-1) — the three faces meeting there
  // Within each tristar the three faces are mutually at 90° — covering X, Y, Z once each.
  const FACES = [
    { id: '+W', normal: [0, 0, +1], observe: (x, y, _z) => -(x * y), name: 'top', group: 'top' },
    { id: '-W', normal: [0, 0, -1], observe: (x, y, _z) => +(x * y), name: 'bottom', group: 'bottom' },
    { id: '+U', normal: [+1, 0, 0], observe: (_x, y, z) => -(y * z), name: 'right', group: 'top' },
    { id: '-U', normal: [-1, 0, 0], observe: (_x, y, z) => +(y * z), name: 'left', group: 'bottom' },
    { id: '+V', normal: [0, +1, 0], observe: (x, _y, z) => -(z * x), name: 'front', group: 'top' },
    { id: '-V', normal: [0, -1, 0], observe: (x, _y, z) => +(z * x), name: 'back', group: 'bottom' },
  ];
  // Precomputed tristar views — no storage, pure lookup
  const TRISTARS = {
    top: FACES.filter(f => f.group === 'top'),    // +W +U +V — pole (+1,+1,+1)
    bottom: FACES.filter(f => f.group === 'bottom'), // -W -U -V — pole (-1,-1,-1)
  };

  // ── OPERATOR: observe ────────────────────────────────────────────────────
  // "Gather" operator applied to the manifold field at point x with modifier y.
  // z = x · y applied to the Winki field — returns the manifold value (the
  // face-normal displacement) at position [px,py,pz] given modifier [mx,my,mz].
  //
  // x (identity vector) = the point in space we are observing FROM
  // y (modifier vector) = the lens / direction / attribute we are applying
  // z = what the manifold says at that intersection — the present state
  //
  // Operators in play: · (gather), sign (orientation), face assignment (routing)
  function observe(x, y) {
    // x is the observer position: {px, py, pz} or [px,py,pz]
    // y is the modifier: a scalar weight, a direction, or a semantic tag
    const [px, py, pz] = _vec(x);
    const face = faceOf([px, py, pz]);
    const raw = face.observe(px, py, pz);       // w = -(u·v) on this face
    const weight = _weight(y);                  // extract scalar from whatever y is
    return raw * weight;                        // z = (face saddle) · (y modifier)
  }

  // ── OPERATOR: explode ────────────────────────────────────────────────────
  // Division operator — decompose z back into its constituent parts given identity x.
  // "What are all the y values that, combined with x, produce z?"
  // Returns an array of candidate y values — the parts that were gathered.
  //
  // This is the inverse lens: given z and x, solve for y.
  //   z = face.observe(x) · y  →  y = z / face.observe(x)
  // At zero-crossings (where the saddle = 0) the decomposition is infinite —
  // those are inflection points where the identity cannot be further decomposed.
  function explode(z, x) {
    const [px, py, pz] = _vec(x);
    const face = faceOf([px, py, pz]);
    const saddle = face.observe(px, py, pz);
    if (Math.abs(saddle) < 1e-9) {
      // Zero-crossing: inflection point — return the boundary condition, not infinity
      return { inflection: true, face: face.id, position: [px, py, pz] };
    }
    const y = z / saddle;  // explode: z ÷ saddle = the modifier that produced z
    return { y, face: face.id, saddle, position: [px, py, pz] };
  }

  // ── OPERATOR: grad ───────────────────────────────────────────────────────
  // The gradient of the Winki field at point x — direction of steepest ascent.
  // This is the manifold's "pull" direction at the identity's current position.
  //
  // For face +W (w = -xy): ∂w/∂x = -y, ∂w/∂y = -x, ∂w/∂z = 0
  // The gradient IS the substrate's force on x — where it pushes x next.
  // Used for: ANPC inflection pressure, ship hull normals, force fields, audio curvature.
  function grad(x) {
    const [px, py, pz] = _vec(x);
    const face = faceOf([px, py, pz]);
    // Analytic gradient per face (d/du, d/dv, 0) in face-local coords,
    // then rotated back to world coords via the face normal
    switch (face.id) {
      case '+W': return _normalizeV([-py, -px, 0]);   // ∂(-xy)/∂(x,y,z)
      case '-W': return _normalizeV([py, px, 0]);   // ∂(+xy)/∂(x,y,z)
      case '+U': return _normalizeV([0, -pz, -py]);   // ∂(-yz)/∂(x,y,z)
      case '-U': return _normalizeV([0, pz, py]);
      case '+V': return _normalizeV([-pz, 0, -px]);   // ∂(-zx)/∂(x,y,z)
      case '-V': return _normalizeV([pz, 0, px]);
    }
  }

  // ── OPERATOR: compare ────────────────────────────────────────────────────
  // Returns all parts of the manifold field that are < | > | = x at position p.
  //
  //   compare(x, 'lt', threshold) — parts less than x (the "remaining" view)
  //   compare(x, 'gt', threshold) — parts greater than x (the "exceeding" view)
  //   compare(x, 'eq', threshold, epsilon) — parts equal to x (the "identity" view)
  //
  // This is how the substrate answers "show me everything that is NOT x" or
  // "show me everything that IS x" — the lens of inclusion and exclusion.
  function compare(x, op, threshold, epsilon = 0.05) {
    const val = observe(x, 1.0);  // observe x with neutral modifier y=1
    switch (op) {
      case 'lt': return val < threshold;
      case 'gt': return val > threshold;
      case 'eq': return Math.abs(val - threshold) < epsilon;
      case 'lte': return val <= threshold + epsilon;
      case 'gte': return val >= threshold - epsilon;
      default: return false;
    }
  }

  // ── OPERATOR: depth (log) ────────────────────────────────────────────────
  // How many Winki-cell layers deep is x from a root identity?
  // This is the logarithmic operator — the "how many times must I apply y to
  // reach x from root?" question. Each step is one Winki cube traversal.
  //
  // Traversal resistance r ≥ 1; r=1 is the void (no resistance).
  // depth = log_r(|x - root|) in each axis — returns per-axis depths and total.
  function depth(x, root, r = 1) {
    const [px, py, pz] = _vec(x);
    const [rx, ry, rz] = _vec(root);
    const dx = Math.abs(px - rx);
    const dy = Math.abs(py - ry);
    const dz = Math.abs(pz - rz);
    // In the Winki lattice each cell is 2 units wide ([-1,+1])
    const cellSize = 2;
    const stepsX = dx / cellSize;
    const stepsY = dy / cellSize;
    const stepsZ = dz / cellSize;
    const totalSteps = Math.sqrt(stepsX ** 2 + stepsY ** 2 + stepsZ ** 2);
    // Apply traversal resistance: actual depth = log_r of step count
    const logDepth = r === 1 ? totalSteps : Math.log(totalSteps + 1) / Math.log(r);
    return { steps: { x: stepsX, y: stepsY, z: stepsZ }, total: totalSteps, logDepth, r };
  }

  // ── OPERATOR: power (recursive identity) ─────────────────────────────────
  // x observing itself through itself n times.
  // Each application folds x back through the Winki field: z_n = observe(z_{n-1}, x).
  // This is "x to the power of n" as an ACTOR — each iteration x becomes its own y.
  // The sequence reveals the attractor structure of the manifold at x.
  //
  // n=0: z = x itself (the identity, unchanged)
  // n=1: z = observe(x, x) = the saddle value at x with x as its own modifier
  // n=k: z = observe(z_{k-1}, x) = k-th fold of x through the manifold
  //
  // Returns the full sequence — the trajectory, not just the final value.
  function power(x, n) {
    const steps = [_vec(x)];
    let current = _vec(x);
    for (let i = 0; i < n; i++) {
      const val = observe(current, current);
      // The scalar result is the new "z" — express as a scaled version of x
      const [cx, cy, cz] = current;
      const scale = Math.abs(val) < 1e-9 ? 0 : val;
      current = [cx * scale, cy * scale, cz * scale];
      steps.push(current);
    }
    return { sequence: steps, attractor: steps[steps.length - 1], folds: n };
  }

  // ── OPERATOR: root (inverse power) ───────────────────────────────────────
  // What x must be such that observing it through y n times yields z?
  // This is the √ operator applied to the manifold — undoing the gather.
  // Solved numerically via Newton's method on the Winki field.
  function root(z_target, y, n = 1, maxIter = 32, tol = 1e-6) {
    let x = _vec(y).map(v => v * 0.5);  // initial guess: y scaled down
    for (let iter = 0; iter < maxIter; iter++) {
      const z = observe(x, y);
      const err = z - z_target;
      if (Math.abs(err) < tol) break;
      const g = grad(x);
      const gDotG = g[0] ** 2 + g[1] ** 2 + g[2] ** 2;
      if (gDotG < 1e-12) break;  // at inflection, no gradient — stop
      const step = err / gDotG;
      x = [x[0] - step * g[0], x[1] - step * g[1], x[2] - step * g[2]];
    }
    return { x, z_achieved: observe(x, y), target: z_target, iterations: maxIter };
  }

  // ── OPERATOR: faceOf ────────────────────────────────────────────────────
  // Which of the 6 Winki saddle phases owns this point?
  // The face is determined by which absolute-maximum axis component x has.
  // This routes x to the correct saddle orientation — the identity's face assignment.
  function faceOf(x) {
    const [px, py, pz] = _vec(x);
    const ax = Math.abs(px), ay = Math.abs(py), az = Math.abs(pz);
    if (ax >= ay && ax >= az) return px >= 0 ? FACES[2] : FACES[3];  // ±U (x dominant)
    if (ay >= ax && ay >= az) return py >= 0 ? FACES[4] : FACES[5];  // ±V (y dominant)
    return pz >= 0 ? FACES[0] : FACES[1];                            // ±W (z dominant)
  }

  // ── OPERATOR: groupOf ───────────────────────────────────────────────────
  // Which of the two tristars does x belong to?
  //
  // The two tristars are defined by the dominant sign of x's position:
  //   top    tristar (pole +1,+1,+1): x is in a positive-dominant octant
  //   bottom tristar (pole -1,-1,-1): x is in a negative-dominant octant
  //
  // "Dominant sign" = sign of the largest-magnitude axis component —
  // the same axis faceOf() uses, so groupOf and faceOf are always consistent.
  //
  // Returns 'top' or 'bottom'.  At the void (x=0) returns 'bottom' (neutral).
  //
  // Game use: groupOf(ballPosition) → 'top' = offensive zone, 'bottom' = defensive.
  //           groupOf(playerSlot)   → which tristar owns this player's side.
  //           groupOf(pieceCell)    → which half of the board this piece is in.
  function groupOf(x) {
    return faceOf(x).group;
  }

  // ── OPERATOR: tristar ───────────────────────────────────────────────────
  // Returns the three face descriptors that form the named tristar.
  //   tristar('top')    → [+W, +U, +V]  — pole at (+1,+1,+1)
  //   tristar('bottom') → [-W, -U, -V]  — pole at (-1,-1,-1)
  //
  // Each face in a tristar is at exactly 90° to its two neighbours —
  // they share a common cube vertex and their saddle edges join seamlessly.
  //
  // Use for: assigning player sides, dividing the board into two hemispheres,
  // routing AI strategy (attack = top tristar, defend = bottom tristar).
  function tristar(pole) {
    return TRISTARS[pole] || TRISTARS.bottom;
  }

  // ── OPERATOR: union ──────────────────────────────────────────────────────
  // All parts of a set A and set B — the manifold view that includes both.
  // Used for: combining two game states, merging two player views.
  // Returns a new "gathered" observation without storing either input.
  function union(xA, xB, y) {
    const zA = observe(xA, y);
    const zB = observe(xB, y);
    return zA + zB;  // additive union — all of both
  }

  // ── OPERATOR: exclude ────────────────────────────────────────────────────
  // All remaining parts of x after removing the influence of xB.
  // Used for: "what is left of x after xB acts on it?"
  function exclude(x, xB, y) {
    const zTotal = observe(x, y);
    const zRemoved = observe(xB, y);
    return zTotal - zRemoved;
  }

  // ── OPERATOR: classify ───────────────────────────────────────────────────
  // Where inside the Winki cell is this point? Returns the spatial type:
  //
  //   'spine'   — on both zero-crossing planes simultaneously (u≈0 AND v≈0).
  //               The void point. Center of the crosshair. r=1, no pressure.
  //               In the hive: the central pillar of each passage junction.
  //
  //   'passage' — on one zero-crossing plane (u≈0 OR v≈0 but not both).
  //               The + cross arm. A corridor connecting adjacent chambers.
  //               In Starfighter: flyable corridor between rooms.
  //               In 4DTicTacToe: the gap between play-cells.
  //
  //   'chamber' — away from both planes (|u|>ε AND |v|>ε).
  //               The curved lobe. An enclosed room. 4 per cell.
  //               In the hive: a room. In 4DTicTacToe: a play-cell.
  //               In Starfighter: a combat room (later sorties).
  //
  //   passageThreshold (default 0.15): how close to a zero-crossing counts as
  //   a passage. Tune per use-case — tighter = narrower corridors.
  function classify(x, passageThreshold) {
    const pt = typeof passageThreshold === 'number' ? passageThreshold : 0.15;
    const face = faceOf(_vec(x));
    const [px, py, pz] = _vec(x);
    // Get the two tangent-plane coordinates for this face (the ones that multiply to give w)
    let u, v;
    switch (face.id) {
      case '+W': case '-W': u = px; v = py; break;  // w = ±(u·v)
      case '+U': case '-U': u = py; v = pz; break;  // u = ±(v·w)
      case '+V': case '-V': u = pz; v = px; break;  // v = ±(w·u)
      default: u = px; v = py;
    }
    const onU = Math.abs(u) < pt;
    const onV = Math.abs(v) < pt;
    if (onU && onV) return 'spine';
    if (onU || onV) return 'passage';
    return 'chamber';
  }

  // ── OPERATOR: fractalTile ────────────────────────────────────────────────
  // The fractal property made explicit: tile a region at MULTIPLE scales,
  // each scale level containing the structure of the level above.
  //
  // Because z = xy is scale-invariant (the equation is the same at any scale)
  // and the boundary conditions always match (no rotation correction), a
  // [2,2,2] block of cells IS a single larger cell IS a tile in an even larger
  // block — infinitely in both directions.
  //
  // fractalTile(origin, dims, levels) returns an array of tile observations
  // at each scale level. Level 0 = one cell. Level 1 = dims×dims cells.
  // Level 2 = (dims²)×(dims²) cells. Each level is one recursive step.
  //
  //   fractalTile([0,0,0], [2,2,2], 3)
  //     → level 0: 1   cell  at scale 1   (unit cell)
  //     → level 1: 8   cells at scale 2   (2×2×2 block — same topology as level 0)
  //     → level 2: 64  cells at scale 4   (4×4×4 block — same topology at larger scale)
  //
  // Use for: multi-scale hive geometry, LOD rendering, AI navigation hierarchy
  // (chamber within a wing within a ship section within the whole baseship).
  function fractalTile(origin, dims, levels) {
    const [ox, oy, oz] = _vec(origin);
    const [dx, dy, dz] = Array.isArray(dims) ? dims : [dims, dims, dims];
    const depth = typeof levels === 'number' ? Math.max(1, levels) : 1;
    const result = [];
    for (let lv = 0; lv < depth; lv++) {
      // At level lv: cell size = 2^lv (unit cell = 2 at lv=0, 4 at lv=1, ...)
      // because each level doubles the spatial extent via self-tiling.
      const scale = Math.pow(2, lv);           // cell edge in world units at this level
      const nx = Math.pow(dx, lv + 1);         // number of cells per axis at this level
      const ny = Math.pow(dy, lv + 1);
      const nz = Math.pow(dz, lv + 1);
      const cells = [];
      for (let ix = 0; ix < nx; ix++) {
        for (let iy = 0; iy < ny; iy++) {
          for (let iz = 0; iz < nz; iz++) {
            const cx = ox + (ix + 0.5) * scale * 2;
            const cy = oy + (iy + 0.5) * scale * 2;
            const cz = oz + (iz + 0.5) * scale * 2;
            const face = faceOf([cx, cy, cz]);
            const saddle = face.observe(cx / scale, cy / scale, cz / scale);
            cells.push({
              level: lv,
              scale,
              index: [ix, iy, iz],
              origin: [cx, cy, cz],
              face: face.id,
              group: face.group,
              saddle,
              type: classify([cx / scale, cy / scale, cz / scale]),
            });
          }
        }
      }
      result.push({ level: lv, scale, cellCount: cells.length, cells });
    }
    return result;
  }

  // ── OPERATOR: tile ───────────────────────────────────────────────────────
  // Observe the Winki lattice — an n×n×n array of cells around identity x.
  // Each cell is one unit cube of the tiling. No cell is stored — the array
  // is computed on demand and returned as a lazy iterable of observations.
  //
  // No rotation is ever needed between cells — any face connects to any face.
  // This is the single-level form. For multi-scale use fractalTile().
  //
  //   tile(x, [3,1,1]) = a 3-wide passage (3 cells in X, 1 in Y, 1 in Z)
  //   tile(x, [2,2,2]) = a 2×2×2 block of 8 Winki chambers
  //   tile(x, [1,1,4]) = a vertical stack of 4 chambers (a tower)
  //   tile(x, [8,8,8]) = alien baseship hive structure
  function tile(x, dims, y = 1.0) {
    const [px, py, pz] = _vec(x);
    const [nx, ny, nz] = Array.isArray(dims) ? dims : [dims, dims, dims];
    const cells = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let iz = 0; iz < nz; iz++) {
          // Each cell center offset by 2 units (cell size = [-1,+1] = 2 units)
          const cx = px + ix * 2;
          const cy = py + iy * 2;
          const cz = pz + iz * 2;
          const cellOrigin = [cx, cy, cz];
          const face = faceOf(cellOrigin);
          const saddle = face.observe(cx, cy, cz);
          const z = saddle * _weight(y);
          cells.push({
            index: [ix, iy, iz],
            origin: cellOrigin,
            face: face.id,
            group: face.group,           // 'top' or 'bottom' tristar
            type: classify(cellOrigin),  // 'chamber' | 'passage' | 'spine'
            saddle,
            z,
            // The six face boundary values — proves seamless tiling (no rotation needed)
            boundaries: {
              xPos: face.observe(cx + 1, cy, cz),
              xNeg: face.observe(cx - 1, cy, cz),
              yPos: face.observe(cx, cy + 1, cz),
              yNeg: face.observe(cx, cy - 1, cz),
              zPos: face.observe(cx, cy, cz + 1),
              zNeg: face.observe(cx, cy, cz - 1),
            }
          });
        }
      }
    }
    return cells;  // each cell is an observation snapshot, not stored state
  }

  // ── OPERATOR: project ───────────────────────────────────────────────────
  // Project the manifold onto a lower dimension — "x as a whole in a lower dimension".
  // This is the axiom: "everything is a point in a higher dimension and a whole
  // in a lower dimension."
  //
  // project(x, 'yz') — collapse x axis: x becomes a single point, yz is the whole
  // project(x, 'x')  — collapse y,z: the full 3D identity becomes a 1D identity value
  function project(x, onto) {
    const [px, py, pz] = _vec(x);
    switch (onto) {
      case 'x': return { axis: 'x', value: px, saddle: -(py * pz) };
      case 'y': return { axis: 'y', value: py, saddle: -(pz * px) };
      case 'z': return { axis: 'z', value: pz, saddle: -(px * py) };
      case 'xy': return { plane: 'xy', point: [px, py], saddle: -(px * py) };
      case 'yz': return { plane: 'yz', point: [py, pz], saddle: -(py * pz) };
      case 'xz': return { plane: 'xz', point: [px, pz], saddle: -(px * pz) };
    }
  }

  // ── OPERATOR: isEqual, isLess, isGreater ─────────────────────────────────
  // Relational operators — not on numbers, but on manifold observations.
  // "Is the manifold at x the same as the manifold at xB given the same modifier?"
  function isEqual(x, xB, y, epsilon = 0.01) { return Math.abs(observe(x, y) - observe(xB, y)) < epsilon; }
  function isLess(x, xB, y) { return observe(x, y) < observe(xB, y); }
  function isGreater(x, xB, y) { return observe(x, y) > observe(xB, y); }

  // ── Six named saddle evaluators (direct access to each face phase) ────────
  // Use when you know which face/phase you need without the routing overhead.
  const saddle = {
    top: (x, y, _z) => -(x * y),   // Face +W
    bottom: (x, y, _z) => +(x * y),   // Face -W
    right: (_x, y, z) => -(y * z),   // Face +U
    left: (_x, y, z) => +(y * z),   // Face -U
    front: (x, _y, z) => -(z * x),   // Face +V
    back: (x, _y, z) => +(z * x),   // Face -V
  };

  // ── Manifold-of-manifolds: nestObserve ───────────────────────────────────
  // The substrate observing ITSELF — a manifold whose x is another manifold result.
  // "x is the result of a previous z, now becoming the identity for the next observation."
  // This is the identity recursion: z_prev becomes x_next; y stays the same substrate lens.
  //
  // Use this for: chaining game states, ANPC decision chains, wave progression,
  // campaign sortie sequencing — any time the output of one z becomes the seed of the next.
  //
  // Critically: this is NOT recursion WITHIN a dimension (forbidden by axiom).
  // It is recursion BETWEEN dimensions — z of level n becomes x of level n+1.
  function nestObserve(zPrev, y, depth = 1) {
    // zPrev is the manifold output from the previous observation.
    // It now IS the identity x for this level.
    // y is the same modifier substrate being applied again.
    let x = zPrev;
    const trace = [];
    for (let d = 0; d < depth; d++) {
      const z = observe(x, y);
      trace.push({ level: d, x: _vec(x), z, face: faceOf(_vec(x)).id });
      x = z;  // z becomes x for the next level — the identity recursion
    }
    return { final: x, trace };
  }

  // ── Lattice configurations (block-building presets) ──────────────────────
  // These are pure observations of specific tiling arrangements.
  // Like blocks: cube, rectangle, pyramid, tower — all derived from the same unit cell.
  const lattice = {
    cube: (x, n, y) => tile(x, [n, n, n], y),
    rectangle: (x, w, h, d, y) => tile(x, [w, h, d], y),
    tower: (x, h, y) => tile(x, [1, 1, h], y),
    plane: (x, w, d, y) => tile(x, [w, 1, d], y),
    pyramid: (x, base, y) => {
      // A pyramid: each layer is a shrinking square base
      const cells = [];
      for (let h = 0; h < base; h++) {
        const w = base - h;
        const [px, py, pz] = _vec(x);
        const layer = tile([px, py, pz + h * 2], [w, w, 1], y);
        cells.push(...layer);
      }
      return cells;
    },
    // Two cells joined as a rectangle — the simplest compound
    pair: (xA, xB, y) => [
      ...tile(xA, [1, 1, 1], y),
      ...tile(xB, [1, 1, 1], y),
    ],
  };

  // ── Internal helpers ─────────────────────────────────────────────────────
  function _vec(v) {
    if (Array.isArray(v)) return [v[0] || 0, v[1] || 0, v[2] || 0];
    if (typeof v === 'object' && v !== null) return [v.x || 0, v.y || 0, v.z || 0];
    if (typeof v === 'number') return [v, v, v];
    return [0, 0, 0];
  }
  function _weight(y) {
    if (typeof y === 'number') return y;
    if (typeof y === 'object' && y !== null) {
      // Extract a scalar magnitude from whatever y is
      if ('weight' in y) return y.weight;
      if ('value' in y) return y.value;
      if ('m' in y) return y.m;  // manifold coefficient
      const [yx, yy, yz] = _vec(y);
      return Math.sqrt(yx * yx + yy * yy + yz * yz);  // magnitude as modifier
    }
    return 1.0;  // neutral modifier — y = 1 means "unchanged"
  }
  function _normalizeV(v) {
    const [a, b, c] = v;
    const mag = Math.sqrt(a * a + b * b + c * c);
    if (mag < 1e-12) return [0, 0, 0];
    return [a / mag, b / mag, c / mag];
  }

  // ── GEOMETRY: makeSaddleWireframe ────────────────────────────────────────
  // Returns line-segment vertex data for one Winki saddle face (+W: z = xy)
  // as a grid of iso-u and iso-v lines — the orange wireframe in the Blender view.
  //
  // Returns { positions: Float32Array } — pairs of [x,y,z,x,y,z,...] line endpoints.
  // No index buffer needed — every 6 floats = one line segment.
  //
  // N = grid resolution (default 16 → 16 u-lines + 16 v-lines per face).
  // h = cell half-size (default 1.0, the unit cell).
  //
  // To render all 6 faces: call once per face with the appropriate axis permutation,
  // or use makeFullWireframe() which does all 6.
  function makeSaddleWireframe(h, N) {
    h = typeof h === 'number' ? h : 1.0;
    N = typeof N === 'number' ? N : 16;
    // Lines along v-axis (constant u):  u fixed, v varies → point (u·h, v·h, u·v·h)
    // Lines along u-axis (constant v):  v fixed, u varies → same equation
    const segCount = N * (N - 1) * 2;  // N iso-u lines × (N-1) segments + same for iso-v
    const pos = new Float32Array(segCount * 2 * 3);
    let pi = 0;
    const step = 2.0 / (N - 1);
    // iso-u lines (u fixed, v walks from -h to +h)
    for (let i = 0; i < N; i++) {
      const u = -1.0 + i * step;
      for (let j = 0; j < N - 1; j++) {
        const v0 = -1.0 + j * step;
        const v1 = v0 + step;
        // +W face: x=u·h, y=v·h, z=u·v·h
        pos[pi++] = u * h; pos[pi++] = v0 * h; pos[pi++] = u * v0 * h;
        pos[pi++] = u * h; pos[pi++] = v1 * h; pos[pi++] = u * v1 * h;
      }
    }
    // iso-v lines (v fixed, u walks)
    for (let j = 0; j < N; j++) {
      const v = -1.0 + j * step;
      for (let i = 0; i < N - 1; i++) {
        const u0 = -1.0 + i * step;
        const u1 = u0 + step;
        pos[pi++] = u0 * h; pos[pi++] = v * h; pos[pi++] = u0 * v * h;
        pos[pi++] = u1 * h; pos[pi++] = v * h; pos[pi++] = u1 * v * h;
      }
    }
    return { positions: pos, face: '+W', h, N };
  }

  // ── GEOMETRY: makeFullWireframe ───────────────────────────────────────────
  // The complete Winki unit cell as wireframe — all 6 saddle faces combined.
  // This is exactly image 1: the star-shaped wireframe filling the cube.
  //
  // Each face is one permutation of (u,v,w) from (x,y,z) — same equation,
  // six orientations. No rotation matrix needed — the axis permutation IS
  // the orientation.
  //
  // Returns { positions: Float32Array } — line segment pairs, ready for THREE.BufferGeometry.
  function makeFullWireframe(h, N) {
    h = typeof h === 'number' ? h : 1.0;
    N = typeof N === 'number' ? N : 16;
    const step = 2.0 / (N - 1);
    const segsPerFace = N * (N - 1) * 2;
    const pos = new Float32Array(6 * segsPerFace * 2 * 3);
    let pi = 0;

    // For each face: define which world axes are (u, v, w)
    // w = -(u·v) for the negative-chirality faces (top tristar)
    // w = +(u·v) for the positive-chirality faces (bottom tristar)
    const faceAxes = [
      // [uAxis, vAxis, wAxis, sign]  — wAxis = sign * u * v
      { u: 0, v: 1, w: 2, s: -1 },  // +W: x=u, y=v, z=-(uv)  face +W
      { u: 0, v: 1, w: 2, s: +1 },  // -W: x=u, y=v, z=+(uv)  face -W
      { u: 1, v: 2, w: 0, s: -1 },  // +U: y=u, z=v, x=-(uv)  face +U
      { u: 1, v: 2, w: 0, s: +1 },  // -U: y=u, z=v, x=+(uv)  face -U
      { u: 2, v: 0, w: 1, s: -1 },  // +V: z=u, x=v, y=-(uv)  face +V
      { u: 2, v: 0, w: 1, s: +1 },  // -V: z=u, x=v, y=+(uv)  face -V
    ];

    for (const fa of faceAxes) {
      // iso-u lines
      for (let i = 0; i < N; i++) {
        const u = -1.0 + i * step;
        for (let j = 0; j < N - 1; j++) {
          const v0 = -1.0 + j * step;
          const v1 = v0 + step;
          const p0 = [0, 0, 0]; const p1 = [0, 0, 0];
          p0[fa.u] = u * h; p0[fa.v] = v0 * h; p0[fa.w] = fa.s * u * v0 * h;
          p1[fa.u] = u * h; p1[fa.v] = v1 * h; p1[fa.w] = fa.s * u * v1 * h;
          pos[pi++] = p0[0]; pos[pi++] = p0[1]; pos[pi++] = p0[2];
          pos[pi++] = p1[0]; pos[pi++] = p1[1]; pos[pi++] = p1[2];
        }
      }
      // iso-v lines
      for (let j = 0; j < N; j++) {
        const v = -1.0 + j * step;
        for (let i = 0; i < N - 1; i++) {
          const u0 = -1.0 + i * step;
          const u1 = u0 + step;
          const p0 = [0, 0, 0]; const p1 = [0, 0, 0];
          p0[fa.u] = u0 * h; p0[fa.v] = v * h; p0[fa.w] = fa.s * u0 * v * h;
          p1[fa.u] = u1 * h; p1[fa.v] = v * h; p1[fa.w] = fa.s * u1 * v * h;
          pos[pi++] = p0[0]; pos[pi++] = p0[1]; pos[pi++] = p0[2];
          pos[pi++] = p1[0]; pos[pi++] = p1[1]; pos[pi++] = p1[2];
        }
      }
    }
    return { positions: pos.slice(0, pi), h, N, faceCount: 6 };
  }

  // ── GEOMETRY: makeCage ───────────────────────────────────────────────────
  // The bounding cube wireframe — the 12 edges of the unit cube.
  // This is the orange square outline in image 1.
  // Every Winki cell lives inside exactly one of these cubes.
  // When tiled, the cages tile seamlessly — no gaps, no overlaps.
  //
  // Returns { positions: Float32Array } — 12 edges × 2 points × 3 floats = 72 floats.
  function makeCage(h) {
    h = typeof h === 'number' ? h : 1.0;
    // 8 corners of the cube, 12 edges
    const c = [
      [-h, -h, -h], [+h, -h, -h], [+h, +h, -h], [-h, +h, -h],  // bottom face
      [-h, -h, +h], [+h, -h, +h], [+h, +h, +h], [-h, +h, +h],  // top face
    ];
    const edges = [
      // bottom face ring
      [0, 1], [1, 2], [2, 3], [3, 0],
      // top face ring
      [4, 5], [5, 6], [6, 7], [7, 4],
      // vertical pillars
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const pos = new Float32Array(edges.length * 2 * 3);
    let pi = 0;
    for (const [a, b] of edges) {
      pos[pi++] = c[a][0]; pos[pi++] = c[a][1]; pos[pi++] = c[a][2];
      pos[pi++] = c[b][0]; pos[pi++] = c[b][1]; pos[pi++] = c[b][2];
    }
    return { positions: pos, h, edgeCount: 12 };
  }

  // ── GEOMETRY: makeFractalCages ────────────────────────────────────────────
  // The nested cubes showing fractal depth — image 2, top-down view.
  // Each chamber of the Winki cell contains another Winki cell at half scale.
  // Zoom in and the structure repeats. This is the recursive tunnel effect.
  //
  // Returns an array of cage descriptors at decreasing scales:
  //   level 0: the outer cube at scale h
  //   level 1: 8 inner cubes at scale h/2, one per chamber octant
  //   level 2: 64 cubes at scale h/4, one per sub-chamber
  //   ...up to `levels` deep
  //
  // Each level: { level, scale, cages: [{origin, positions}] }
  // The top-down grid convergence in image 2 is this structure projected onto Z.
  function makeFractalCages(h, levels) {
    h = typeof h === 'number' ? h : 1.0;
    levels = typeof levels === 'number' ? Math.max(1, levels) : 3;
    const result = [];
    // Chamber centers: the 8 octant midpoints of the cell (between spine and cube face)
    // Each octant is a chamber — the 4-lobe saddle splits into 4 in 2D → 8 in 3D
    const octantSigns = [
      [-1, -1, -1], [+1, -1, -1], [-1, +1, -1], [+1, +1, -1],
      [-1, -1, +1], [+1, -1, +1], [-1, +1, +1], [+1, +1, +1],
    ];
    let origins = [[0, 0, 0]];  // level 0: just the root cell
    for (let lv = 0; lv < levels; lv++) {
      const scale = h / Math.pow(2, lv);
      const childScale = scale / 2;
      const cages = [];
      const nextOrigins = [];
      for (const [ox, oy, oz] of origins) {
        cages.push({
          origin: [ox, oy, oz], positions: makeCage(scale).positions.map
            ? makeCage(scale).positions : makeCage(scale).positions,
          scale,
        });
        // Each cell spawns 8 children at half scale, centered in each octant
        for (const [sx, sy, sz] of octantSigns) {
          nextOrigins.push([
            ox + sx * childScale * 0.5,
            oy + sy * childScale * 0.5,
            oz + sz * childScale * 0.5,
          ]);
        }
      }
      result.push({ level: lv, scale, cageCount: cages.length, cages });
      origins = nextOrigins;
      if (origins.length > 4096) break;  // safety cap — beyond this use LOD
    }
    return result;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    // Core operators (the actors, not the numbers)
    observe,        // gather:   z = x · y on the field
    explode,        // divide:   z ÷ field → what y produced z
    grad,           // gradient: direction the field pulls x
    compare,        // compare:  <  >  =  on manifold values
    depth,          // log:      how many layers from root to x
    power,          // power:    x observing itself through itself n times
    root,           // root:     inverse — what x produces z through y
    project,        // project:  x as a whole in a lower dimension
    union,          // add:      all parts of A and B
    exclude,        // subtract: all remaining parts after removing xB
    isEqual,        // relational: manifold equality
    isLess,         // relational: manifold less-than
    isGreater,      // relational: manifold greater-than
    nestObserve,    // manifold of manifolds: z_prev becomes x_next (identity recursion)

    // Geometry & spatial structure
    faceOf,              // which of the 6 saddle phases owns this point
    groupOf,             // which tristar ('top' | 'bottom') owns this point
    tristar,             // return the 3 faces of a named tristar pole
    classify,            // 'chamber' | 'passage' | 'spine' — spatial type at this point
    fractalTile,         // multi-scale recursive tile (same equation at every zoom level)
    saddle,              // direct access to the 6 named saddle evaluators
    tile,                // flat n×n×n block lattice (single scale)
    lattice,             // named block presets: cube, rectangle, tower, plane, pyramid, pair

    // Geometry generators — raw Float32Array buffers, no Three.js dependency
    makeSaddleWireframe, // one saddle face (+W) as line segments — the grid mesh
    makeFullWireframe,   // all 6 saddle faces combined — image 1 (the full star wireframe)
    makeCage,            // 12-edge bounding cube — the orange outline in image 1
    makeFractalCages,    // nested cubes at decreasing scale — image 2 (recursive tunnels)
    lattice,        // named block presets: cube, rectangle, tower, plane, pyramid, pair

    // The 6 face descriptors — read-only, for inspection
    FACES: Object.freeze(FACES.map(f => ({ id: f.id, normal: f.normal, name: f.name, group: f.group }))),

    // The two tristar poles — read-only
    TRISTARS: Object.freeze({
      top: TRISTARS.top.map(f => f.id),   // ['+W', '+U', '+V']
      bottom: TRISTARS.bottom.map(f => f.id),   // ['-W', '-U', '-V']
    }),

    // Identity constants
    CELL_SIZE: 2,          // each Winki unit cell spans 2 units per axis (h=1)
    DOMAIN: [-1, 1],       // normalized domain of one cell
    // Reference mesh facts (artist reference only — not loaded at runtime):
    // winki.glb: 5400 vertices, 2700 tris, 75×72 parametric grid, bbox [-2,+2]³
    // The equation z = -(xy+x+y) exactly reproduces that mesh.
    REFERENCE_GRID: [75, 72],  // resolution of the artist reference mesh
  };

})();

// Make available both as a module and as a browser global
if (typeof module !== 'undefined') module.exports = WinkiSubstrate;
if (typeof window !== 'undefined') window.WinkiSubstrate = WinkiSubstrate;
