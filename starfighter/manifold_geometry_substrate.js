/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD GEOMETRY SUBSTRATE — Starfighter
 * ═══════════════════════════════════════════════════════════════════════════
 * Seed Inversion Doctrine:
 *   z is the corner. xy are the perpendicular walls.
 *   You only need z to reconstruct all of xy or xy².
 *
 * Schwartz Diamond as universal spiral lattice (TPMS):
 *   D(x,y,z) = cos(2πx)cos(2πy)cos(2πz) − sin(2πx)sin(2πy)sin(2πz)
 *
 *   Place seed z₀ on lattice → gradient ∇D gives the walls (xy recovered).
 *   vertex_z = z₀ × D(lattice)   ← the fold: z = xy, y = D(lattice)
 *
 * Ship DB: list of [z_seed, role] pairs per entity.
 * Bounds, resolution, and all shape derive from seeds + lattice. Zero GLBs.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFManifoldGeometry = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1. SCHWARTZ DIAMOND LATTICE CORE
  // ═══════════════════════════════════════════════════════════════════════════

  const _TWO_PI = Math.PI * 2;

  /** Schwartz Diamond field at normalized lattice point (px, py, pz in [0,1]) */
  function _diamond(px, py, pz) {
    const x = px * _TWO_PI, y = py * _TWO_PI, z = pz * _TWO_PI;
    return Math.cos(x) * Math.cos(y) * Math.cos(z)
         - Math.sin(x) * Math.sin(y) * Math.sin(z);
  }

  /**
   * Gradient of the diamond field at (px, py, pz).
   * ∇D gives perpendicular walls — recovering xy from z alone.
   */
  function _diamondGrad(px, py, pz) {
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

  /**
   * Derive patch bandwidth from seed's lattice gradient.
   * Inverse of gradient magnitude: tight curvature → narrow (compact),
   * loose curvature → wide (spread-out, like a wing).
   */
  function _bandwidth(z0) {
    const g = _diamondGrad(z0, z0, z0);
    const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    if (mag < 0.01) return 0.4;
    return Math.min(0.45, Math.max(0.04, 0.25 / mag));
  }

  /**
   * LOD-adaptive vertex resolution from seed + LOD level.
   * Higher gradient magnitude = faster-changing surface = more vertices.
   */
  function _resolution(z0, lodLevel) {
    const g = _diamondGrad(z0, z0, z0);
    const mag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    const base = [12, 7, 4][lodLevel] !== undefined ? [12, 7, 4][lodLevel] : 8;
    return Math.max(3, Math.round(base + mag * 0.5));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2. ROLE CONSTRUCTORS
  // Each role generates verts + indices for one semantic part of the ship.
  // All shape character comes from z₀ + diamond lattice. Zero explicit bounds.
  // ═══════════════════════════════════════════════════════════════════════════

  const _roles = {};

  /**
   * FUSELAGE — primary body, elongated along z-axis.
   * Cross-section profile modulated by diamond field.
   * vertex_radius = |z₀ × D(lattice)|   ← the fold: z = xy, y = D(lattice)
   */
  _roles.fuselage = function (z0, resolution) {
    const bw = _bandwidth(z0);
    const p = z0;
    const length = 2.0 + Math.abs(z0) * 2.0;
    const N = resolution;
    const verts = [], idx = [];

    for (let iu = 0; iu <= N; iu++) {
      for (let iv = 0; iv <= N; iv++) {
        const u = iu / N;
        const v = iv / N;
        const angle = v * _TWO_PI;
        const t = (u * 2 - 1) * bw;

        const lx = p + Math.cos(angle) * bw * 0.4;
        const ly = p + Math.sin(angle) * bw * 0.4;
        const lz = p + t;
        const D = _diamond(lx, ly, lz);

        const radius = Math.abs(D) * Math.abs(z0) * 0.8 + 0.08;
        verts.push(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          (u * 2 - 1) * length
        );
      }
    }

    for (let iu = 0; iu < N; iu++) {
      for (let iv = 0; iv < N; iv++) {
        const i0 = iu * (N + 1) + iv;
        const i1 = i0 + 1;
        const i2 = (iu + 1) * (N + 1) + iv;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    return { verts, idx };
  };

  /**
   * WING — flat swept surface, generates mirrored +x/-x pair automatically.
   * Span along x, chord along z. Diamond field provides wing camber.
   * vertex_y = z₀ × D(lattice)   ← camber from the fold
   */
  _roles.wing = function (z0, resolution) {
    const bw = _bandwidth(z0);
    const span  = 1.2 + Math.abs(z0) * 3.0;
    const chord = 0.4 + Math.abs(z0) * 0.6;
    const p = z0;
    const N = resolution;
    const verts = [], idx = [];
    let offset = 0;

    for (const sx of [1, -1]) {
      for (let iu = 0; iu <= N; iu++) {
        for (let iv = 0; iv <= N; iv++) {
          const u = iu / N;
          const v = iv / N;
          const lx = p + u * bw * 2;
          const lz = p + (v * 2 - 1) * bw;
          const D = _diamond(lx, p, lz);

          const camber = z0 * D * 0.15;
          verts.push(
            sx * u * span,
            camber,
            (v * 2 - 1) * chord
          );
        }
      }

      const base = offset;
      for (let iu = 0; iu < N; iu++) {
        for (let iv = 0; iv < N; iv++) {
          const i0 = base + iu * (N + 1) + iv;
          const i1 = i0 + 1;
          const i2 = base + (iu + 1) * (N + 1) + iv;
          const i3 = i2 + 1;
          if (sx === 1) idx.push(i0, i2, i1, i1, i2, i3);
          else          idx.push(i0, i1, i2, i1, i3, i2);
        }
      }
      offset += (N + 1) * (N + 1);
    }
    return { verts, idx };
  };

  /**
   * DOME — hemispherical cap (cockpit, sensor dome).
   * Radius modulated by diamond field. Placed near nose.
   */
  _roles.dome = function (z0, resolution) {
    const bw = _bandwidth(z0);
    const p = z0;
    const N = resolution;
    const baseR = Math.abs(z0) * 0.5 + 0.1;
    const verts = [], idx = [];

    for (let iu = 0; iu <= N; iu++) {
      for (let iv = 0; iv <= N; iv++) {
        const u = iu / N;
        const v = iv / N;
        const polar   = u * Math.PI * 0.5;
        const azimuth = v * _TWO_PI;

        const lx = p + Math.sin(polar) * Math.cos(azimuth) * bw;
        const ly = p + Math.sin(polar) * Math.sin(azimuth) * bw;
        const lz = p + Math.cos(polar) * bw;
        const D = _diamond(lx, ly, lz);

        const r = baseR + Math.abs(D * z0) * 0.15;
        verts.push(
          Math.sin(polar) * Math.cos(azimuth) * r,
          Math.sin(polar) * Math.sin(azimuth) * r,
          Math.cos(polar) * r + Math.abs(z0) * 1.5
        );
      }
    }

    for (let iu = 0; iu < N; iu++) {
      for (let iv = 0; iv < N; iv++) {
        const i0 = iu * (N + 1) + iv;
        const i1 = i0 + 1;
        const i2 = (iu + 1) * (N + 1) + iv;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    return { verts, idx };
  };

  /**
   * NACELLE — engine pod, generates mirrored ±x pair automatically.
   */
  _roles.nacelle = function (z0, resolution) {
    const bw = _bandwidth(z0) * 0.5;
    const p  = Math.abs(z0);
    const length  = 0.8 + Math.abs(z0) * 0.6;
    const xOffset = 0.5 + Math.abs(z0) * 0.3;
    const N = Math.max(3, Math.round(resolution * 0.7));
    const verts = [], idx = [];
    let vertOffset = 0;

    for (const sx of [1, -1]) {
      for (let iu = 0; iu <= N; iu++) {
        for (let iv = 0; iv <= N; iv++) {
          const u = iu / N;
          const v = iv / N;
          const angle = v * _TWO_PI;
          const t = (u * 2 - 1) * bw;

          const lx = p + Math.cos(angle) * bw * 0.3;
          const ly = p + Math.sin(angle) * bw * 0.3;
          const lz = p + t;
          const D = _diamond(lx, ly, lz);

          const radius = Math.abs(D) * Math.abs(z0) * 0.4 + 0.05;
          verts.push(
            sx * (xOffset + Math.cos(angle) * radius),
            Math.sin(angle) * radius,
            (u * 2 - 1) * length - Math.abs(z0) * 1.2
          );
        }
      }

      const base = vertOffset;
      for (let iu = 0; iu < N; iu++) {
        for (let iv = 0; iv < N; iv++) {
          const i0 = base + iu * (N + 1) + iv;
          const i1 = i0 + 1;
          const i2 = base + (iu + 1) * (N + 1) + iv;
          const i3 = i2 + 1;
          if (sx === 1) idx.push(i0, i2, i1, i1, i2, i3);
          else          idx.push(i0, i1, i2, i1, i3, i2);
        }
      }
      vertOffset += (N + 1) * (N + 1);
    }
    return { verts, idx };
  };

  /**
   * HULL — broad flat plate for capital ships.
   * vertex_y = z₀ × D(lattice)   ← hull undulation from the fold
   */
  _roles.hull = function (z0, resolution) {
    const bw    = _bandwidth(z0);
    const p     = z0;
    const width = 2.0 + Math.abs(z0) * 2.0;
    const depth = 3.0 + Math.abs(z0) * 3.0;
    const N = resolution;
    const verts = [], idx = [];

    for (let iu = 0; iu <= N; iu++) {
      for (let iv = 0; iv <= N; iv++) {
        const u = iu / N;
        const v = iv / N;
        const lx = p + (u * 2 - 1) * bw;
        const lz = p + (v * 2 - 1) * bw;
        const D = _diamond(lx, p, lz);

        verts.push(
          (u * 2 - 1) * width,
          z0 * D * 0.2,
          (v * 2 - 1) * depth
        );
      }
    }

    for (let iu = 0; iu < N; iu++) {
      for (let iv = 0; iv < N; iv++) {
        const i0 = iu * (N + 1) + iv;
        const i1 = i0 + 1;
        const i2 = (iu + 1) * (N + 1) + iv;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    return { verts, idx };
  };

  /**
   * TENDRIL — helical appendage following diamond lattice channel.
   * For alien ships. Diamond field modulates cross-section radius.
   */
  _roles.tendril = function (z0, resolution) {
    const p = Math.abs(z0);
    const length = 2.0 + Math.abs(z0) * 2.0;
    const radius = 0.06 + Math.abs(z0) * 0.1;
    const N = resolution;
    const verts = [], idx = [];

    for (let iu = 0; iu <= N; iu++) {
      for (let iv = 0; iv <= N; iv++) {
        const u = iu / N;
        const v = iv / N;
        const t = u * _TWO_PI;

        const px = p + u * 0.5;
        const py = p + Math.sin(t) * 0.15;
        const pz = p + Math.cos(t) * 0.15;
        const D = _diamond(px, py, pz);

        const angle = v * _TWO_PI;
        const cr = radius * (1 + Math.abs(D) * 0.3);

        verts.push(
          u * length * 0.8 - length * 0.4 + Math.cos(t * 0.5) * length * 0.3,
          Math.sin(t * 0.5) * length * 0.3 + Math.cos(angle) * cr,
          Math.sin(angle) * cr
        );
      }
    }

    for (let iu = 0; iu < N; iu++) {
      for (let iv = 0; iv < N; iv++) {
        const i0 = iu * (N + 1) + iv;
        const i1 = i0 + 1;
        const i2 = (iu + 1) * (N + 1) + iv;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    return { verts, idx };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3. SEED DATABASE
  // Each entity: list of [z_seed, role] pairs + material + scale.
  // NO explicit bounds, coefficients, or vertex parameters.
  // ALL shape derived from z-seed + Schwartz Diamond lattice.
  //
  // Seed magnitude → part size  (larger |z| = larger volume on lattice)
  // Seed sign      → channel    (positive = Diamond A, negative = B)
  // Role           → orientation + sampling strategy
  // ═══════════════════════════════════════════════════════════════════════════

  const _seeds = {
    // ── Fighters ─────────────────────────────────────────────────────────────
    'enemy': {
      type: 'fighter',
      seeds: [[0.35,'fuselage'],[0.08,'wing'],[0.15,'dome'],[-0.12,'nacelle']],
      mat: { color:0x44ff88, metalness:0.6, roughness:0.3, emissive:0x002200 },
      scale: 100
    },
    'ally': {
      type: 'fighter',
      seeds: [[0.25,'fuselage'],[0.10,'wing'],[0.12,'dome']],
      mat: { color:0x4488ff, metalness:0.7, roughness:0.2, emissive:0x001144 },
      scale: 100
    },
    'interceptor': {
      type: 'fighter',
      seeds: [[0.12,'fuselage'],[0.05,'wing']],
      mat: { color:0x66ff44, metalness:0.8, roughness:0.1, emissive:0x003300 },
      scale: 100
    },

    // ── Heavy ships ───────────────────────────────────────────────────────────
    'bomber': {
      type: 'heavy',
      seeds: [[0.40,'fuselage'],[0.20,'wing'],[-0.18,'nacelle']],
      mat: { color:0x88ff44, metalness:0.5, roughness:0.5, emissive:0x223300 },
      scale: 240
    },
    'predator': {
      type: 'heavy',
      seeds: [[0.45,'fuselage'],[0.22,'wing'],[0.30,'dome'],[-0.20,'nacelle']],
      mat: { color:0xffaa44, metalness:0.4, roughness:0.6, emissive:0x442200 },
      scale: 400
    },

    // ── Capital ships ─────────────────────────────────────────────────────────
    'dreadnought': {
      type: 'capital',
      seeds: [[0.50,'hull'],[0.35,'fuselage'],[-0.28,'nacelle']],
      mat: { color:0xff8844, metalness:0.3, roughness:0.7, emissive:0x442211 },
      scale: 1200
    },
    'baseship': {
      type: 'capital',
      seeds: [[0.60,'hull'],[0.40,'hull'],[-0.35,'nacelle']],
      mat: { color:0x6688ff, metalness:0.6, roughness:0.4, emissive:0x112244 },
      scale: 3000
    },
    'alien-baseship': {
      type: 'capital',
      seeds: [[0.70,'hull'],[0.42,'tendril'],[0.38,'tendril']],
      mat: { color:0xaa44ff, metalness:0.3, roughness:0.6, emissive:0x330066 },
      scale: 4200
    },

    // ── Structures ────────────────────────────────────────────────────────────
    'station': {
      type: 'structure',
      seeds: [[0.80,'hull'],[0.55,'hull'],[0.60,'nacelle']],
      mat: { color:0x8888aa, metalness:0.5, roughness:0.5, emissive:0x222244 },
      scale: 30000
    },

    // ── Support ships ─────────────────────────────────────────────────────────
    'tanker': {
      type: 'support',
      seeds: [[0.50,'fuselage'],[0.42,'dome']],
      mat: { color:0xffcc44, metalness:0.4, roughness:0.6, emissive:0x442200 },
      scale: 600
    },
    'medic': {
      type: 'support',
      seeds: [[0.35,'fuselage'],[0.28,'dome']],
      mat: { color:0xffffff, metalness:0.3, roughness:0.3, emissive:0x001144 },
      scale: 800
    },

    // ── Projectiles ───────────────────────────────────────────────────────────
    'laser': {
      type: 'projectile',
      seeds: [[0.05,'fuselage']],
      mat: { color:0xff4444, metalness:0.9, roughness:0.1, emissive:0xff0000 },
      scale: 1
    },
    'torpedo': {
      type: 'projectile',
      seeds: [[0.15,'fuselage'],[0.10,'dome']],
      mat: { color:0xffaa00, metalness:0.7, roughness:0.3, emissive:0xff4400 },
      scale: 1
    },
    'missile': {
      type: 'projectile',
      seeds: [[0.12,'fuselage']],
      mat: { color:0xff6600, metalness:0.6, roughness:0.4, emissive:0xff2200 },
      scale: 1
    },
    'flare': {
      type: 'projectile',
      seeds: [[0.08,'dome']],
      mat: { color:0x00ffff, metalness:0.3, roughness:0.2, emissive:0x00ffff },
      scale: 1
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4. GEOMETRY ASSEMBLER
  // ═══════════════════════════════════════════════════════════════════════════

  function _assembleMesh(entry, lodLevel) {
    const allVerts = [];
    const allIdx   = [];
    let vertOffset = 0;

    for (const [z0, role] of entry.seeds) {
      const fn  = _roles[role];
      if (!fn) continue;
      const res = _resolution(z0, lodLevel);

      const { verts, idx } = fn(z0, res);
      for (const v of verts) allVerts.push(v);
      for (const i of idx)   allIdx.push(i + vertOffset);
      vertOffset += verts.length / 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
    geometry.setIndex(allIdx);
    geometry.computeVertexNormals();
    return geometry;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 5. PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  // Kept for backward compatibility with external references
  const MANIFOLD_TYPE = {
    BILINEAR:   'z=xy',
    QUADRATIC:  'z=xy²',
    VOLUMETRIC: 'm=xyz',
  };

  /**
   * Observe manifold and extract geometry for entity type.
   * @param {string} entityType - e.g. 'enemy', 'ally', 'bomber'
   * @param {number} lodLevel   - 0=high, 1=medium, 2=low
   * @returns {{ geometry: THREE.BufferGeometry, material: object, scale: number } | null}
   */
  function observeGeometry(entityType, lodLevel = 0) {
    const entry = _seeds[entityType];
    if (!entry) {
      console.warn(`[ManifoldGeometry] No seeds for type: ${entityType}`);
      return null;
    }
    return {
      geometry: _assembleMesh(entry, lodLevel),
      material: entry.mat,
      scale:    entry.scale,
    };
  }

  /**
   * Generate variant by shifting seeds on the lattice.
   * A small zDelta traverses the diamond helix to an adjacent shape.
   * @param {string}           entityType
   * @param {number|number[]}  deltas - z-shift per seed (array) or scalar for all
   * @param {number}           lodLevel
   */
  function observeVariant(entityType, deltas, lodLevel = 0) {
    const base = _seeds[entityType];
    if (!base) return null;

    const variantEntry = {
      ...base,
      seeds: base.seeds.map(([z0, role], i) => {
        const dz = Array.isArray(deltas) ? (deltas[i] ?? 0) : (deltas ?? 0);
        return [z0 + dz, role];
      }),
    };

    return {
      geometry: _assembleMesh(variantEntry, lodLevel),
      material: base.mat,
      scale:    base.scale,
    };
  }

  function getAvailableTypes() { return Object.keys(_seeds); }
  function hasManifold(entityType) { return !!_seeds[entityType]; }

  return {
    observeGeometry,
    observeVariant,
    hasManifold,
    getAvailableTypes,
    MANIFOLD_TYPE,
  };
})();

window.SFManifoldGeometry = SFManifoldGeometry;
