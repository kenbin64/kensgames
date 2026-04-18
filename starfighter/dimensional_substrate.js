/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIMENSIONAL SUBSTRATE — Starfighter / ButterflyFX
 * ═══════════════════════════════════════════════════════════════════════════
 * Dimensional Programming: every object is a point in a higher dimension;
 * every point contains objects from the dimension below.
 *
 * The 7 levels, derived from the Schwartz Diamond lattice at each step:
 *
 *   0. VOID    — potential, unaddressed. No value, no position.
 *   1. POINT   — an object with a value. The seed z₀ placed on the lattice.
 *   2. LENGTH  — an array of points. 1D extent = bandwidth from |∇D|.
 *   3. WIDTH   — a perpendicular length. 2D plane {xH, yH} from gradient.
 *   4. Z       — another perpendicular. Full 3D bounds {xH, yH, zH}.
 *   5. FOLD    — z = xy. The manifold surface: vertex = z₀ × D(lattice).
 *   6. VOLUME  — m = xyz. The complete object. All dimensions present.
 *
 * Each level is a fluent step. You can stop at any level.
 * Completion at VOLUME gives a fully-addressable manifold object ready for
 * tessellation by any role constructor.
 *
 * Entry:  SFDimensional.observe('label').seed(z)
 * Chain:  .extend() → .perpendicular() → .elevate() → .fold() → .complete(role)
 * Short:  SFDimensional.manifest('label', z, role) → Volume in one call
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFDimensional = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // Schwartz Diamond lattice (same field as manifold.js, self-contained here
  // so this substrate has no external dependency)
  // ═══════════════════════════════════════════════════════════════════════════

  const _TWO_PI = Math.PI * 2;

  function _D(px, py, pz) {
    const x = px * _TWO_PI, y = py * _TWO_PI, z = pz * _TWO_PI;
    return Math.cos(x) * Math.cos(y) * Math.cos(z)
         - Math.sin(x) * Math.sin(y) * Math.sin(z);
  }

  function _G(px, py, pz) {
    const x = px * _TWO_PI, y = py * _TWO_PI, z = pz * _TWO_PI;
    const cx = Math.cos(x), sx = Math.sin(x);
    const cy = Math.cos(y), sy = Math.sin(y);
    const cz = Math.cos(z), sz = Math.sin(z);
    return {
      x: _TWO_PI * (-sx * cy * cz - cx * sy * sz),
      y: _TWO_PI * (-cx * sy * cz - sx * cy * sz),
      z: _TWO_PI * (-cx * cy * sz - sx * sy * cz),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 0 — VOID
  // Potential. Unaddressed. No value, no position. Pre-existence.
  // ═══════════════════════════════════════════════════════════════════════════

  function _void(label) {
    return {
      dim: 0,
      label,
      z: undefined,
      channel: null,
      /** Seed the void with a scalar value → Point (Dim 1) */
      seed(z) { return _point(label, z); },
      toString() { return `[Void:${label}]`; },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 1 — POINT
  // An object with a value. z₀ placed on the Schwartz Diamond lattice.
  // D(z₀,z₀,z₀) determines which channel (A if D≥0, B if D<0).
  // ═══════════════════════════════════════════════════════════════════════════

  function _point(label, z) {
    const D = _D(z, z, z);
    const channel = D >= 0 ? 'A' : 'B';
    return {
      dim: 1,
      label,
      z,
      D,
      channel,
      /** Extend into 1D → Length (Dim 2) */
      extend() { return _length(label, z, channel); },
      toString() { return `[Point:${label} z=${z.toFixed(4)} D=${D.toFixed(4)} ch=${channel}]`; },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 2 — LENGTH
  // An array of points — the 1D extent around the seed.
  // bandwidth = 0.25 / |∇D|: tight curvature → narrow; loose → wide.
  // ═══════════════════════════════════════════════════════════════════════════

  function _length(label, z, channel) {
    const g   = _G(z, z, z);
    const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    const bw  = mag < 0.01 ? 0.4 : Math.min(0.45, Math.max(0.04, 0.25 / mag));
    return {
      dim: 2,
      label,
      z,
      channel,
      grad: g,
      gradMag: mag,
      /** Half-width of the 1D interval around z₀ */
      bw,
      /** Add a perpendicular axis → Width (Dim 3) */
      perpendicular() { return _width(label, z, channel, g, mag, bw); },
      toString() { return `[Length:${label} bw=${bw.toFixed(4)} |∇D|=${mag.toFixed(4)}]`; },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 3 — WIDTH
  // A perpendicular length — 2D bounding plane {xH, yH}.
  // Aspect ratio derived from gradient direction (gz/gx ratio).
  // ═══════════════════════════════════════════════════════════════════════════

  function _width(label, z, channel, g, gradMag, bw) {
    const aspect = gradMag > 0.01 ? Math.abs(g.x) / (Math.abs(g.z) + 0.01) : 1;
    const xH = bw * (1 + Math.abs(z));
    const yH = bw * (1 + Math.abs(z) * aspect);
    return {
      dim: 3,
      label,
      z,
      channel,
      grad: g,
      gradMag,
      bw,
      xH,
      yH,
      /** Add the Z axis → Depth (Dim 4) */
      elevate() { return _depth(label, z, channel, g, gradMag, bw, xH, yH); },
      toString() { return `[Width:${label} xH=${xH.toFixed(4)} yH=${yH.toFixed(4)}]`; },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 4 — Z (DEPTH)
  // Another perpendicular length — full 3D bounds {xH, yH, zH}.
  // zH is elongated by the dominant gradient axis (elongated ships vs spheres).
  // ═══════════════════════════════════════════════════════════════════════════

  function _depth(label, z, channel, g, gradMag, bw, xH, yH) {
    const zAspect = gradMag > 0.01 ? Math.abs(g.z) / (gradMag + 0.01) : 0.5;
    const zH = (2.0 + Math.abs(z) * 2.0) * (0.5 + zAspect);
    return {
      dim: 4,
      label,
      z,
      channel,
      grad: g,
      gradMag,
      bw,
      xH,
      yH,
      zH,
      /** Apply the fold z=xy → Fold (Dim 5) */
      fold() { return _fold(label, z, channel, g, gradMag, bw, xH, yH, zH); },
      toString() { return `[Depth:${label} xH=${xH.toFixed(3)} yH=${yH.toFixed(3)} zH=${zH.toFixed(3)}]`; },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 5 — FOLD  (z = x·y)
  // The manifold surface. Computation manifests here.
  // vertex value = z₀ × D(lattice)  — the fold: z = xy where y = D(lattice).
  // phase = atan2(∇D.y, ∇D.x) — position along the helix.
  // ═══════════════════════════════════════════════════════════════════════════

  function _fold(label, z0, channel, g, gradMag, bw, xH, yH, zH) {
    const foldValue = z0 * _D(z0, z0, z0);   // z = xy: x=z₀, y=D(lattice)
    const phase     = Math.atan2(g.y, g.x);

    // LOD-adaptive resolution: driven by gradient magnitude, not hardcoded
    function resolution(lodLevel) {
      return Math.max(3, Math.round(([12, 7, 4][lodLevel] || 8) + gradMag * 0.5));
    }

    return {
      dim: 5,
      label,
      z: z0,
      channel,
      grad: g,
      gradMag,
      bw,
      xH,
      yH,
      zH,
      /** z = xy evaluated at the seed's lattice position */
      foldValue,
      /** Helix phase at this seed */
      phase,
      /** resolution(lodLevel) → vertex count per axis */
      resolution,
      /** Manifest as a complete volume → Volume (Dim 6) */
      complete(role) {
        return _volume(label, z0, channel, g, gradMag, bw, xH, yH, zH,
                       foldValue, phase, resolution, role);
      },
      toString() {
        return `[Fold:${label} z=xy=${foldValue.toFixed(4)} phase=${phase.toFixed(4)}]`;
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § DIM 6 — VOLUME  (m = x·y·z)
  // The complete object. All seven levels are present.
  // m = z₀ × D(z₀) × |∇D|  — the full product of all three dimensions.
  // This is the manifested entity: ready for tessellation by any role constructor.
  // ═══════════════════════════════════════════════════════════════════════════

  function _volume(label, z0, channel, g, gradMag, bw, xH, yH, zH,
                   foldValue, phase, resolution, role) {
    // m = x·y·z where x=z₀, y=D(lattice), z=|∇D|
    const m = z0 * _D(z0, z0, z0) * gradMag;

    return {
      dim: 6,
      label,
      z: z0,
      channel,
      grad: g,
      gradMag,
      bw,
      xH,
      yH,
      zH,
      foldValue,
      phase,
      resolution,
      role: role || 'volume',
      /** m = xyz — the complete dimensional product */
      m,
      /**
       * Sample the diamond field at any point within this volume's bounds.
       * Used by role constructors (fuselage, wing, dome, ...) for vertex displacement.
       */
      sample(px, py, pz) { return _D(px, py, pz); },
      toString() {
        return `[Volume:${label} m=${m.toFixed(4)} role=${role || 'volume'} ch=${channel}]`;
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /** Dimension level constants */
  const DIM = {
    VOID:   0,  // potential
    POINT:  1,  // value
    LENGTH: 2,  // 1D extent
    WIDTH:  3,  // 2D plane
    DEPTH:  4,  // 3D bounds
    FOLD:   5,  // z=xy surface
    VOLUME: 6,  // m=xyz complete
  };

  /**
   * Begin the dimensional chain from Void.
   * @param {string} label - Semantic label (e.g. 'fuselage', 'enemy')
   * @returns {Void} - Dim 0, ready to be seeded
   */
  function observe(label) {
    return _void(label);
  }

  /**
   * Shortcut: traverse all 7 levels in one call.
   * void → point → length → width → depth → fold → volume
   * @param {string} label
   * @param {number} z     - Seed value
   * @param {string} role  - Semantic role (e.g. 'fuselage', 'wing')
   * @returns {Volume}     - Dim 6, fully manifested
   */
  function manifest(label, z, role) {
    return observe(label)
      .seed(z)
      .extend()
      .perpendicular()
      .elevate()
      .fold()
      .complete(role);
  }

  return {
    observe,
    manifest,
    DIM,
    // Expose raw lattice for substrates that want to sample directly
    diamond:  _D,
    gradient: _G,
  };
})();

window.SFDimensional = SFDimensional;
