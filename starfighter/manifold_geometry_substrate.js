/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD GEOMETRY SUBSTRATE — Starfighter
 * ═══════════════════════════════════════════════════════════════════════════
 * Dimensional Programming Architecture:
 * - GLB files are NOT loaded as binary assets
 * - Instead, geometry is encoded as manifold equations (z=xy, z=xy², m=xyz)
 * - This substrate OBSERVES manifold data and EXTRACTS geometry on demand
 * - The manifold IS the data; substrates observe and interpret
 *
 * Philosophy:
 * - Every mesh IS a dimension
 * - Every vertex IS a point in that dimension
 * - Surfaces are manifold functions, not discrete triangles
 * - No binary asset loading — pure mathematical reconstruction
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFManifoldGeometry = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1. MANIFOLD TYPE CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const MANIFOLD_TYPE = {
    BILINEAR: 'z=xy',      // z = a·xy + b·x + c·y + d
    QUADRATIC: 'z=xy²',    // z = a·xy² + b·x² + c·y² + d·xy + e·x + f·y + g
    VOLUMETRIC: 'm=xyz',   // m = a·xyz + b·xy + c·xz + d·yz + e·x + f·y + g·z + h
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2. MANIFOLD GEOMETRY DATABASE
  // ═══════════════════════════════════════════════════════════════════════════
  // Encoded geometry for all ship types
  // Each entry: { patches: [...], bounds: {...}, material: {...} }

  const _geometryManifolds = {
    // Fighter ships (simple, 8-12 patches)
    'enemy': {
      type: 'fighter',
      patches: [
        // Fuselage (bilinear saddle)
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.35, -0.1, 0.2, 0.0], bounds: { x: [-1, 1], y: [-0.5, 0.5], z: [-2, 2] } },
        // Wings (quadratic curves)
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.18, -0.05, 0.12, 0.08, 0.0, 0.0, 0.0], bounds: { x: [-2, 2], y: [0, 1], z: [-1, 1] } },
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.18, -0.05, 0.12, -0.08, 0.0, 0.0, 0.0], bounds: { x: [-2, 2], y: [0, -1], z: [-1, 1] } },
        // Cockpit dome (volumetric)
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.25, 0.15, 0.15, 0.15, 0.0, 0.0, 0.0, 0.4], bounds: { x: [-0.3, 0.3], y: [-0.3, 0.3], z: [1.5, 2.2] } },
        // Engine nacelles
        { type: MANIFOLD_TYPE.BILINEAR, coef: [-0.2, 0.0, 0.0, 0.0], bounds: { x: [-0.4, -0.2], y: [-0.3, 0.3], z: [-2.5, -1.5] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [-0.2, 0.0, 0.0, 0.0], bounds: { x: [0.2, 0.4], y: [-0.3, 0.3], z: [-2.5, -1.5] } },
      ],
      material: { color: 0x44ff88, metalness: 0.6, roughness: 0.3, emissive: 0x002200 },
      scale: 100
    },

    'ally': {
      type: 'fighter',
      patches: [
        // Human fighter — angular, less organic
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.25, 0.0, 0.0, 0.0], bounds: { x: [-0.8, 0.8], y: [-0.4, 0.4], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.15, 0.0, 0.0, 0.0], bounds: { x: [-1.8, -0.8], y: [-0.2, 0.2], z: [-0.5, 0.5] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.15, 0.0, 0.0, 0.0], bounds: { x: [0.8, 1.8], y: [-0.2, 0.2], z: [-0.5, 0.5] } },
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.2, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.3], bounds: { x: [-0.25, 0.25], y: [-0.25, 0.25], z: [1.8, 2.3] } },
      ],
      material: { color: 0x4488ff, metalness: 0.7, roughness: 0.2, emissive: 0x001144 },
      scale: 100
    },

    'interceptor': {
      type: 'fighter',
      patches: [
        // Needle-like, very sleek
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.12, 0.0, 0.0, 0.0], bounds: { x: [-0.3, 0.3], y: [-0.2, 0.2], z: [-3, 3] } },
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.08, -0.02, 0.05, 0.04, 0.0, 0.0, 0.0], bounds: { x: [-1, 1], y: [0, 0.5], z: [-0.8, 0.8] } },
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.08, -0.02, 0.05, -0.04, 0.0, 0.0, 0.0], bounds: { x: [-1, 1], y: [0, -0.5], z: [-0.8, 0.8] } },
      ],
      material: { color: 0x66ff44, metalness: 0.8, roughness: 0.1, emissive: 0x003300 },
      scale: 100
    },

    'bomber': {
      type: 'heavy',
      patches: [
        // Bulky, armored
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.4, 0.25, 0.25, 0.25, 0.0, 0.0, 0.0, 0.5], bounds: { x: [-1, 1], y: [-0.8, 0.8], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.3, 0.0, 0.0, 0.0], bounds: { x: [-2, -1], y: [-0.5, 0.5], z: [-1, 1] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.3, 0.0, 0.0, 0.0], bounds: { x: [1, 2], y: [-0.5, 0.5], z: [-1, 1] } },
      ],
      material: { color: 0x88ff44, metalness: 0.5, roughness: 0.5, emissive: 0x223300 },
      scale: 240
    },

    'predator': {
      type: 'heavy',
      patches: [
        // Organic, curved heavily
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.45, 0.18, 0.22, 0.15, 0.0, 0.0, 0.0], bounds: { x: [-1.5, 1.5], y: [-1, 1], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.35, 0.2, 0.2, 0.2, 0.0, 0.0, 0.0, 0.6], bounds: { x: [-0.8, 0.8], y: [-0.6, 0.6], z: [1.5, 2.8] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [-0.25, 0.0, 0.0, 0.0], bounds: { x: [-0.5, -0.3], y: [-0.4, 0.4], z: [-3, -2] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [-0.25, 0.0, 0.0, 0.0], bounds: { x: [0.3, 0.5], y: [-0.4, 0.4], z: [-3, -2] } },
      ],
      material: { color: 0xffaa44, metalness: 0.4, roughness: 0.6, emissive: 0x442200 },
      scale: 400
    },

    'dreadnought': {
      type: 'capital',
      patches: [
        // Massive, blocky
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.5, 0.3, 0.3, 0.3, 0.0, 0.0, 0.0, 0.8], bounds: { x: [-2, 2], y: [-1.5, 1.5], z: [-4, 4] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.4, 0.0, 0.0, 0.0], bounds: { x: [-3, -2], y: [-1, 1], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.4, 0.0, 0.0, 0.0], bounds: { x: [2, 3], y: [-1, 1], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.35, 0.15, 0.18, 0.12, 0.0, 0.0, 0.0], bounds: { x: [-1.5, 1.5], y: [1.5, 2.5], z: [-3, 3] } },
      ],
      material: { color: 0xff8844, metalness: 0.3, roughness: 0.7, emissive: 0x442211 },
      scale: 1200
    },

    // Capital ships
    'baseship': {
      type: 'capital',
      patches: [
        // Human battleship — industrial, modular
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.6, 0.35, 0.35, 0.35, 0.0, 0.0, 0.0, 1.0], bounds: { x: [-3, 3], y: [-2, 2], z: [-5, 5] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.5, 0.0, 0.0, 0.0], bounds: { x: [-4, -3], y: [-1.5, 1.5], z: [-3, 3] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.5, 0.0, 0.0, 0.0], bounds: { x: [3, 4], y: [-1.5, 1.5], z: [-3, 3] } },
      ],
      material: { color: 0x6688ff, metalness: 0.6, roughness: 0.4, emissive: 0x112244 },
      scale: 3000
    },

    'alien-baseship': {
      type: 'capital',
      patches: [
        // Alien mothership — organic sphere with tendrils
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.7, 0.4, 0.4, 0.4, 0.0, 0.0, 0.0, 1.2], bounds: { x: [-3, 3], y: [-3, 3], z: [-3, 3] } },
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.55, 0.25, 0.28, 0.2, 0.0, 0.0, 0.0], bounds: { x: [-4, -2], y: [-1, 1], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.QUADRATIC, coef: [0.55, 0.25, 0.28, -0.2, 0.0, 0.0, 0.0], bounds: { x: [2, 4], y: [-1, 1], z: [-2, 2] } },
      ],
      material: { color: 0xaa44ff, metalness: 0.3, roughness: 0.6, emissive: 0x330066 },
      scale: 4200
    },

    'station': {
      type: 'structure',
      patches: [
        // Cylindrical station with rotating sections
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.8, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0, 1.5], bounds: { x: [-5, 5], y: [-5, 5], z: [-8, 8] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.6, 0.0, 0.0, 0.0], bounds: { x: [-2, 2], y: [-2, 2], z: [8, 10] } },
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.6, 0.0, 0.0, 0.0], bounds: { x: [-2, 2], y: [-2, 2], z: [-10, -8] } },
      ],
      material: { color: 0x8888aa, metalness: 0.5, roughness: 0.5, emissive: 0x222244 },
      scale: 30000
    },

    // Support ships
    'tanker': {
      type: 'support',
      patches: [
        // Bulbous fuel tanks
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.5, 0.3, 0.3, 0.3, 0.0, 0.0, 0.0, 0.9], bounds: { x: [-1, 1], y: [-1, 1], z: [-2, 2] } },
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.4, 0.25, 0.25, 0.25, 0.0, 0.0, 0.0, 0.7], bounds: { x: [-0.8, 0.8], y: [-0.8, 0.8], z: [2, 3.5] } },
      ],
      material: { color: 0xffcc44, metalness: 0.4, roughness: 0.6, emissive: 0x442200 },
      scale: 600
    },

    'medic': {
      type: 'support',
      patches: [
        // Medical frigate — clean, modular
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.35, 0.0, 0.0, 0.0], bounds: { x: [-1.2, 1.2], y: [-0.8, 0.8], z: [-2.5, 2.5] } },
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.3, 0.2, 0.2, 0.2, 0.0, 0.0, 0.0, 0.5], bounds: { x: [-0.6, 0.6], y: [-0.6, 0.6], z: [2.5, 3.5] } },
      ],
      material: { color: 0xffffff, metalness: 0.3, roughness: 0.3, emissive: 0x001144 },
      scale: 800
    },

    // Projectiles
    'laser': {
      type: 'projectile',
      patches: [
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.05, 0.0, 0.0, 0.0], bounds: { x: [-0.05, 0.05], y: [-0.05, 0.05], z: [-0.8, 0.8] } },
      ],
      material: { color: 0xff4444, metalness: 0.9, roughness: 0.1, emissive: 0xff0000 },
      scale: 1
    },

    'torpedo': {
      type: 'projectile',
      patches: [
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.15, 0.0, 0.0, 0.0], bounds: { x: [-0.2, 0.2], y: [-0.2, 0.2], z: [-1.5, 1.5] } },
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.12, 0.08, 0.08, 0.08, 0.0, 0.0, 0.0, 0.2], bounds: { x: [-0.15, 0.15], y: [-0.15, 0.15], z: [1.5, 2] } },
      ],
      material: { color: 0xffaa00, metalness: 0.7, roughness: 0.3, emissive: 0xff4400 },
      scale: 1
    },

    'missile': {
      type: 'projectile',
      patches: [
        { type: MANIFOLD_TYPE.BILINEAR, coef: [0.12, 0.0, 0.0, 0.0], bounds: { x: [-0.15, 0.15], y: [-0.15, 0.15], z: [-1.2, 1.2] } },
      ],
      material: { color: 0xff6600, metalness: 0.6, roughness: 0.4, emissive: 0xff2200 },
      scale: 1
    },

    'flare': {
      type: 'projectile',
      patches: [
        { type: MANIFOLD_TYPE.VOLUMETRIC, coef: [0.08, 0.05, 0.05, 0.05, 0.0, 0.0, 0.0, 0.12], bounds: { x: [-0.1, 0.1], y: [-0.1, 0.1], z: [-0.1, 0.1] } },
      ],
      material: { color: 0x00ffff, metalness: 0.3, roughness: 0.2, emissive: 0x00ffff },
      scale: 1
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3. MANIFOLD EVALUATION (Math → Geometry)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate manifold equation at (x, y) or (x, y, z)
   * @param {string} type - MANIFOLD_TYPE
   * @param {Array<number>} coef - Coefficients
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate (for volumetric)
   * @returns {number} - Result value
   */
  function _evaluateManifold(type, coef, x, y, z = 0) {
    switch (type) {
      case MANIFOLD_TYPE.BILINEAR:
        // z = a·xy + b·x + c·y + d
        return coef[0] * x * y + coef[1] * x + coef[2] * y + coef[3];

      case MANIFOLD_TYPE.QUADRATIC:
        // z = a·xy² + b·x² + c·y² + d·xy + e·x + f·y + g
        return coef[0] * x * y * y +
          coef[1] * x * x +
          coef[2] * y * y +
          coef[3] * x * y +
          coef[4] * x +
          coef[5] * y +
          coef[6];

      case MANIFOLD_TYPE.VOLUMETRIC:
        // m = a·xyz + b·xy + c·xz + d·yz + e·x + f·y + g·z + h
        return coef[0] * x * y * z +
          coef[1] * x * y +
          coef[2] * x * z +
          coef[3] * y * z +
          coef[4] * x +
          coef[5] * y +
          coef[6] * z +
          coef[7];

      default:
        return 0;
    }
  }

  /**
   * Reconstruct THREE.BufferGeometry from manifold patches
   * @param {Array} patches - Manifold patch definitions
   * @param {number} resolution - Grid resolution (e.g., 12 = 12x12 vertices per patch)
   * @returns {THREE.BufferGeometry}
   */
  function _reconstructGeometry(patches, resolution = 12) {
    const vertices = [];
    const indices = [];
    let vertexOffset = 0;

    for (const patch of patches) {
      const { type, coef, bounds } = patch;
      const { x: [xMin, xMax], y: [yMin, yMax], z: [zMin, zMax] } = bounds;

      // Generate grid of vertices for this patch
      for (let iy = 0; iy <= resolution; iy++) {
        for (let ix = 0; ix <= resolution; ix++) {
          const u = ix / resolution;
          const v = iy / resolution;

          const x = xMin + u * (xMax - xMin);
          const y = yMin + v * (yMax - yMin);

          let z;
          if (type === MANIFOLD_TYPE.VOLUMETRIC) {
            // For volumetric, use z bounds and evaluate at midpoint
            const zMid = (zMin + zMax) / 2;
            z = zMid + _evaluateManifold(type, coef, x, y, zMid) * (zMax - zMin) * 0.5;
          } else {
            // For 2D manifolds, z is the evaluated result
            z = zMin + _evaluateManifold(type, coef, x, y) * (zMax - zMin);
          }

          vertices.push(x, y, z);
        }
      }

      // Generate triangle indices for this patch
      const patchVertCount = (resolution + 1) * (resolution + 1);
      for (let iy = 0; iy < resolution; iy++) {
        for (let ix = 0; ix < resolution; ix++) {
          const i0 = vertexOffset + iy * (resolution + 1) + ix;
          const i1 = i0 + 1;
          const i2 = i0 + (resolution + 1);
          const i3 = i2 + 1;

          // Two triangles per quad
          indices.push(i0, i2, i1);
          indices.push(i1, i2, i3);
        }
      }

      vertexOffset += patchVertCount;
    }

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4. SUBSTRATE OBSERVATION INTERFACE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Observe manifold and extract geometry for entity type
   * @param {string} entityType - Entity type (e.g., 'enemy', 'ally', 'bomber')
   * @param {number} lodLevel - LOD level (0=high, 1=medium, 2=low)
   * @returns {object} - { geometry: THREE.BufferGeometry, material: {...}, scale: number }
   */
  function observeGeometry(entityType, lodLevel = 0) {
    const manifold = _geometryManifolds[entityType];
    if (!manifold) {
      console.warn(`[ManifoldGeometry] No manifold for type: ${entityType}`);
      return null;
    }

    // LOD affects reconstruction resolution
    const resolutionMap = [16, 10, 6]; // High, Medium, Low
    const resolution = resolutionMap[lodLevel] || 12;

    const geometry = _reconstructGeometry(manifold.patches, resolution);

    return {
      geometry,
      material: manifold.material,
      scale: manifold.scale
    };
  }

  /**
   * Generate variant by mutating manifold coefficients
   * @param {string} entityType - Base entity type
   * @param {object} mutations - Coefficient mutations { a: 0.1, b: -0.05, ... }
   * @param {number} lodLevel - LOD level
   * @returns {object} - { geometry, material, scale }
   */
  function observeVariant(entityType, mutations, lodLevel = 0) {
    const manifold = _geometryManifolds[entityType];
    if (!manifold) return null;

    // Clone patches and apply mutations
    const variantPatches = manifold.patches.map(patch => {
      const newCoef = [...patch.coef];
      for (const key in mutations) {
        const idx = key.charCodeAt(0) - 'a'.charCodeAt(0);
        if (idx >= 0 && idx < newCoef.length) {
          newCoef[idx] += mutations[key];
        }
      }
      return { ...patch, coef: newCoef };
    });

    const resolutionMap = [16, 10, 6];
    const resolution = resolutionMap[lodLevel] || 12;
    const geometry = _reconstructGeometry(variantPatches, resolution);

    return {
      geometry,
      material: manifold.material,
      scale: manifold.scale
    };
  }

  /**
   * List all available manifold types
   * @returns {Array<string>}
   */
  function getAvailableTypes() {
    return Object.keys(_geometryManifolds);
  }

  /**
   * Check if manifold exists for type
   * @param {string} entityType
   * @returns {boolean}
   */
  function hasManifold(entityType) {
    return !!_geometryManifolds[entityType];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 5. PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Observation interface (substrate pattern)
    observeGeometry,
    observeVariant,

    // Introspection
    hasManifold,
    getAvailableTypes,

    // Constants (for external use)
    MANIFOLD_TYPE,
  };
})();

// Expose globally
window.SFManifoldGeometry = SFManifoldGeometry;
