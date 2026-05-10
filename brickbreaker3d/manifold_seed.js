/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 BRICKBREAKER 3D — MANIFOLD SEED  v1.0
 *
 * "x is the seed, xy is the expression, x/y is the bloom,
 *  z is the point in the next dimension — thus the next x
 *  in the higher plane."
 *
 * One number enters this file. Every game constant — gravity, drag,
 * wall boost, brick color, paddle color, ball speed — leaves it.
 *
 * THE LADDER  —  Fibonacci, seven planes per dimension
 * ─────────────────────────────────────────────────────
 * One "dimension" is exactly 7 planes.  Inside a dimension, y walks the
 * Fibonacci ratios — the φ-converging staircase that nature itself uses:
 *
 *     yₖ = F(k) / F(k+1)        F = 1, 1, 2, 3, 5, 8, 13, 21
 *     →   1/1, 1/2, 2/3, 3/5, 5/8, 8/13, 13/21
 *
 * x is carried up the dimension by the user's formula:
 *
 *     zₙ = xₙ · yₙ            ← expression / point in the next dimension
 *     bₙ = xₙ / yₙ            ← bloom / divergence
 *     xₙ₊₁ = frac(zₙ + bₙ)    ← climb within the dimension
 *
 * On the 7th plane (k = 6, the F = 13 step), x COLLAPSES TO 1 — and
 * that 1 *is* the next dimension.  It becomes the bootstrap x of plane
 * 0 of dimension d+1, lightly stamped with the collapse's own bloom so
 * successive dimensions don't repeat verbatim.
 *
 *     7-plane Fibonacci climb  →  collapse → 1  →  next dimension begins
 *
 * Each plane is then *observed* once via the global Manifold instrument
 * and yields one game constant.  Nothing is invented; every constant
 * is read off the geometry of the chosen seed.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── 1. THE SEED ────────────────────────────────────────────────────
  // The VOID is the potential — the seed before it manifests.
  // 1/φ — the golden conjugate — is the most "natural" point on (0,1).
  // Override before this script loads via window.__BB_SEED__.
  const SEED = (typeof window !== 'undefined' && window.__BB_SEED__)
    || 0.6180339887498949;

  // ── 2. THE LADDER ──────────────────────────────────────────────────
  const frac = v => {
    const f = v - Math.floor(v);
    return f < 1e-9 ? 1e-9 : f;            // never let y go to 0 — bloom would explode
  };

  // The seven steps within a dimension are not arbitrary numbers — they
  // are the emergence of dimension itself, in order:
  //
  //   void         the SEED, pure potential, no coordinate yet
  //   ── then the climb begins ───────────────────────────────────────
  //   k=0  F=1     POINT         the single dimensionless mark
  //   k=1  F=1     LENGTH        one mark + one mark = a single length
  //   k=2  F=2     WIDTH         length + length = a single plane forming
  //   k=3  F=3     PLANE         length + width  = the single plane
  //   k=4  F=5     VOLUME        point + length + width + plane = single volume
  //   k=5  F=8     EMBODIMENT    the new identity — a thing that *is*
  //   k=6  F=13    REST          the seventh — collapse to 1, the seed
  //                              of the NEXT dimension
  //
  // Each Fibonacci value is literally the sum of all the dimensions
  // that came before it — that's why the climb is Fibonacci.
  const STEP_NAMES = ['point', 'length', 'width', 'plane', 'volume', 'embodiment', 'rest'];
  const FIB = [1, 1, 2, 3, 5, 8, 13, 21];

  // Walk N planes via the Fibonacci ladder.
  //
  //   y is locked to the Fibonacci ratio at step k = n mod 7:
  //       y = F(k) / F(k+1)         F = 1,1,2,3,5,8,13,21
  //
  //   x climbs by the user's formula inside a dimension:
  //       z = x·y         (the point in the next dimension)
  //       bloom = x/y     (the divergence)
  //       x ← frac(z + bloom)
  //
  //   On the 7th plane (k = 6, F = 13 — REST) x COLLAPSES TO 1.
  //   That 1 IS the seed (the new POINT) of dimension d+1.
  //
  // Returns [{plane, dim, k, fib, name, x, y, z, bloom}, ...] of length N.
  function climb(seed, planes) {
    const out = [];
    let x = frac(seed);
    let dim = 0;
    for (let n = 0; n < planes; n++) {
      const k = n % 7;
      const y = FIB[k] / FIB[k + 1];          // φ-converging staircase
      const z = x * y;
      const bloom = x / y;
      out.push({
        plane: n, dim, k,
        fib: FIB[k],
        name: STEP_NAMES[k],
        x, y, z, bloom
      });
      if (k === 6) {
        // REST → the 1 that collapses into the next dimension's POINT.
        // Sit just under 1 (frac(1) === 0) and carry the bloom as a
        // tiny memory of where this dimension ended.
        x = 1 - (bloom % 1) * 1e-3 - 1e-9;
        dim++;
      } else {
        x = frac(z + bloom);
      }
    }
    return out;
  }

  // ── 3. INSTRUMENT HOOK ─────────────────────────────────────────────
  // We use the manifold itself when available so observations are
  // recorded on the global record.  If it isn't loaded yet we fall
  // back to the bare surface — same numbers, no eventing.
  const MI = typeof window !== 'undefined' ? window.ManifoldIngestor : null;
  function observe(x, y, label, channels) {
    const BB = (typeof window !== 'undefined') && window.BBManifoldSubstrate;
    if (BB && BB.observe) {
      return BB.observe(x, y, label, { channels });
    }
    // Bare-surface fallback (no recording, same geometry)
    const z = x * y;
    const out = { x, y, z, readings: {} };
    return out;
  }

  // ── 4. CONSTANT MAP ────────────────────────────────────────────────
  // Each entry says: at plane N, take this geometric quantity, fit
  // it into this real-world range, and call it K.  The fit is the
  // ONLY artisanal step — the value itself is the surface's answer.
  //
  //   take('z')         → use z = x·y      (small)
  //   take('1-z')       → close to 1
  //   take('x')         → coordinate
  //   take('bloom01')   → bloom folded into [0,1]
  //   take('slope01')   → |∇z|/√2 at (x,y) ∈ [0,1]
  const SHAPES = {
    z: p => p.z,
    'x': p => p.x,
    'y': p => p.y,
    '1-z': p => 1 - p.z,
    bloom01: p => p.bloom > 1 ? 1 / p.bloom : p.bloom,
    slope01: p => Math.sqrt(p.x * p.x + p.y * p.y) / Math.SQRT2,
  };

  // Linear fit: pull the unit-interval shape into [lo, hi].
  const fit = (s, lo, hi) => lo + s * (hi - lo);

  // The recipe.  Each row: [name, planeIndex, shape, lo, hi].
  // The lo/hi ranges are picked to match the FEEL of the original
  // hardcoded values — the seed then lands somewhere inside that
  // range, with no further intervention.
  const RECIPE = [
    // ── Geometry ──
    ['phi', 0, 'bloom01', 1.500, 1.700],
    ['ballRadius', 1, 'x', 0.85, 1.15],
    ['paddleRadius', 2, 'x', 4.0, 5.0],
    ['paddleThickness', 3, 'x', 0.7, 1.0],
    // ── Speeds (φ-scaled in game.js, so we publish raw φ-coefficients) ──
    ['speedEasyPhi', 4, 'x', 0.20, 0.30],
    ['speedHardPhi', 5, 'x', 0.35, 0.45],
    ['speedMultiPhi', 6, 'x', 0.25, 0.35],
    ['minBallSpeedPhi', 7, 'x', 0.18, 0.26],
    ['maxBallSpeedPhi', 8, 'x', 0.78, 0.92],
    // ── Dynamics ──
    ['gravity', 9, 'z', 0.0004, 0.0011],
    ['freeFlightDrag', 10, '1-z', 0.9988, 0.9998],
    ['wallBoost', 11, 'slope01', 1.020, 1.050],
    ['ceilingBoost', 12, 'slope01', 1.045, 1.075],
    ['wallBoostAdd', 13, 'z', 0.002, 0.006],
    ['ceilingBoostAdd', 14, 'z', 0.004, 0.008],
    ['brickAbsorbBase', 15, '1-z', 0.955, 0.980],
    ['brickAbsorbSpeedFactor', 16, 'z', 0.05, 0.11],
    ['brickDeflect', 17, 'z', 0.020, 0.040],
    ['wallDeflect', 18, 'z', 0.008, 0.016],
    ['turbulenceDecay', 19, '1-z', 0.980, 0.992],
    ['turbulenceMax', 20, 'z', 0.06, 0.10],
    ['turbulenceBrickAdd', 21, 'z', 0.018, 0.028],
    ['turbulenceWallAdd', 22, 'z', 0.008, 0.014],
    // ── Spin ──
    ['magnusStrength', 23, 'z', 0.0015, 0.0025],
    ['spinDecay', 24, '1-z', 0.996, 0.999],
    ['spinTransfer', 25, 'x', 0.25, 0.35],
    // ── Paddle launch / penalties ──
    ['paddleLaunchEasy', 26, 'x', 0.30, 0.40],
    ['paddleLaunchHard', 27, 'x', 0.38, 0.46],
    ['paddleLaunchMulti', 28, 'x', 0.34, 0.42],
    ['paddleShrinkFactor', 29, 'x', 0.55, 0.70],
    ['finalLayerSpeedMult', 30, 'bloom01', 1.50, 1.75],
  ];

  // ── 5. WALK & DERIVE ───────────────────────────────────────────────
  // 49 planes = exactly 7 dimensions of 7 Fibonacci steps each.
  // Recipe uses planes 0..30; planes 31..48 are reserved for colors.
  const planes = climb(SEED, 49);
  const k = {};
  for (const [name, idx, shapeKey, lo, hi] of RECIPE) {
    const p = planes[idx];
    const s = SHAPES[shapeKey](p);
    const value = fit(Math.max(0, Math.min(1, s)), lo, hi);
    k[name] = value;
    // Record the reading on the global manifold so it's auditable.
    observe(p.x, p.y, 'seed:' + name, ['decision']);
  }

  // ── 6. COLORS — read straight off the optical aperture ────────────
  // The original game has 4 brick layers (top→bottom) and up to 4
  // paddle owners.  Each colour is the manifold's `interpret.color`
  // reading at a coordinate built from (slot, channelOffset).
  const BB = (typeof window !== 'undefined') && window.BBManifoldSubstrate;
  function paletteHex(rowFraction, yFraction) {
    if (BB && BB.interpret && BB.interpret.color) {
      return BB.interpret.color(rowFraction, yFraction).hex;
    }
    return '#888888';                                // safe fallback
  }
  // Same hue as paletteHex, but read through the SHADE aperture so
  // lightness is honest (z = surface height).  Use this for chrome /
  // background / fog where the original game wants dim colours, not
  // saturated spectral ones.  `lightness` overrides the default z.
  function paletteShade(rowFraction, yFraction, lightness) {
    if (BB && BB.interpret && BB.interpret.shade) {
      return BB.interpret.shade(rowFraction, yFraction, lightness).hex;
    }
    return '#222222';
  }
  // Read a colour from the WHOLE winki — the full saddle z = x·y over
  // [-1, 1]².  This is the only aperture that can reach non-spectral
  // colours (pinks, magentas, the speakeasy amber) because it spans
  // both signs of every channel.  Pass coords in [-1, 1].
  function paletteWinki(x, y, lightness) {
    if (BB && BB.interpret && BB.interpret.winkiRGB) {
      return BB.interpret.winkiRGB(x, y, lightness).hex;
    }
    return '#444444';
  }
  const hexToInt = h => parseInt(h.slice(1), 16);

  // Brick colours — walk the WARM diagonal of the winki, from the Q1
  // peak (cream/amber, top row, hottest) down through the origin
  // toward the Q3 peak (spring green, bottom row).  Same single law,
  // four equally-spaced readings — the bricks are LITERALLY a slice
  // through the saddle.
  const brickRows = 4;
  const brickPalette = [];
  for (let row = 0; row < brickRows; row++) {
    // t in [-1, +1]: top row at +1 (Q1), bottom row at -1 (Q3)
    const t = 1 - (row * 2 / (brickRows - 1));
    brickPalette.push(hexToInt(paletteWinki(t, t, 1.0)));
  }
  k.brickColors = {
    red: brickPalette[0],
    orange: brickPalette[1],
    yellow: brickPalette[2],
    green: brickPalette[3],
  };

  // Player colours — one per quadrant of the winki.  Four players,
  // four corners, four most-saturated naturally-related colours.
  k.playerColors = [
    hexToInt(paletteWinki(0.85, 0.85, 1.0)),  // Q1 — cream / amber
    hexToInt(paletteWinki(-0.85, 0.85, 1.0)),  // Q2 — deep red
    hexToInt(paletteWinki(-0.85, -0.85, 1.0)),  // Q3 — spring green
    hexToInt(paletteWinki(0.85, -0.85, 1.0)),  // Q4 — violet
  ];

  // Scene chrome — wireframes, glass, floor, sky, glows, starfield.
  // Read straight off the WINKI (the full saddle, all four quadrants).
  // The four corners of the manifold are its four most-saturated
  // colours; the cross at the origin is pure grey.  Together they
  // form a chrome where every colour is mathematically related to
  // every other colour — coherence you can feel without knowing why.
  //
  //   Q1 peak  (+1, +1)  →  #ffff80   warm bright   (cream / amber)
  //   Q2 valley(-1, +1)  →  #800000   warm dark     (deep red)
  //   Q3 peak  (-1, -1)  →  #00ff80   cool bright   (spring green)
  //   Q4 valley(+1, -1)  →  #8000ff   cool dark     (violet)
  //   origin   ( 0,  0)  →  #808080   true grey
  //
  // The chrome below assigns each scene element to a winki point
  // chosen for MOOD, not for matching arbitrary targets:
  //   - cyan/highlight  → Q3 peak (the manifold's "cool bright")
  //   - dark / floor    → near-origin grey, very dim (enveloping black)
  //   - wall            → between origin and Q4 (cool mid-tone)
  //   - glowA / glowB   → the two valleys (the saturated complements)
  k.chromeColors = {
    cyan: hexToInt(paletteWinki(-1.00, -1.00, 1.00)),  // Q3 peak — bright spring green
    dark: hexToInt(paletteWinki(0.00, 0.00, 0.10)),  // origin × dim — enveloping black
    floor: hexToInt(paletteWinki(0.00, 0.00, 0.18)),  // origin × slightly brighter — floor base
    wall: hexToInt(paletteWinki(0.30, -0.70, 0.85)),  // approaching Q4 — cool mid-tone
    glowA: hexToInt(paletteWinki(-1.00, 1.00, 1.00)),  // Q2 valley — deep red glow
    glowB: hexToInt(paletteWinki(1.00, -1.00, 1.00)),  // Q4 valley — violet glow
  };
  // Five background star colours — walk a curve through the winki
  // from origin out to the Q1 peak, so stars dim near the centre and
  // brighten toward the corner.  Same surface, just a different cut.
  k.starColors = [];
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;                    // 0.17 .. 0.83
    k.starColors.push(hexToInt(paletteWinki(t, t, 1.0)));
  }

  // ── 7. PUBLISH ─────────────────────────────────────────────────────
  // Game.js reads from this object.  Frozen so no late mutation can
  // break the "one seed → one game" contract.
  const BBSeed = Object.freeze({
    seed: SEED,
    void: SEED,                                      // pure potential, pre-manifestation
    planes: planes.length,
    ladder: planes,                                  // for inspection / debugging
    fibonacci: FIB.slice(0, 7),                      // 1,1,2,3,5,8,13
    planesPerDimension: 7,
    dimensions: Math.ceil(planes.length / 7),
    /** The seven steps of dimensional emergence — one per Fibonacci value. */
    stepNames: Object.freeze(STEP_NAMES.slice()),
    /** Lookup the meaning of a step by k=0..6. */
    nameOf(k) { return STEP_NAMES[((k % 7) + 7) % 7]; },
    /** Get all planes belonging to a single dimension. */
    dimension(d) { return planes.filter(p => p.dim === d); },
    /** Get all planes that share a step name (e.g. every "embodiment" across dims). */
    step(name) { return planes.filter(p => p.name === name); },
    k: Object.freeze(k),
    /** Re-derive a single value from a fresh seed (utility / dev tools). */
    rederive(newSeed) {
      const ps = climb(newSeed, 49);
      const out = {};
      for (const [name, idx, shapeKey, lo, hi] of RECIPE) {
        out[name] = fit(Math.max(0, Math.min(1, SHAPES[shapeKey](ps[idx]))), lo, hi);
      }
      return out;
    }
  });

  if (typeof window !== 'undefined') {
    window.BBSeed = BBSeed;
    if (typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('manifold:seed-ready', {
        detail: { seed: SEED, constants: Object.keys(k).length }
      }));
    }
  }
})();
