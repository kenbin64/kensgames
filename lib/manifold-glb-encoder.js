/**
 * GLB to Manifold Encoder
 * Converts GLB 3D models into geometric manifold representations
 * using z=xy, z=xy², and m=xyz surface equations.
 *
 * Based on dimensional programming paradigm:
 * - Every mesh IS a dimension
 * - Every vertex IS a point in that dimension
 * - Surfaces are manifold functions, not discrete triangles
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// MANIFOLD TYPES
// ═══════════════════════════════════════════════════════════════════
const MANIFOLD = {
  BILINEAR: 'z=xy',      // Flat/saddle patches
  QUADRATIC: 'z=xy²',    // Curved surfaces
  VOLUMETRIC: 'm=xyz',   // 3D volumes
};

// ═══════════════════════════════════════════════════════════════════
// GLB MESH PARSER
// ═══════════════════════════════════════════════════════════════════
class GLBManifoldEncoder {
  constructor() {
    this.meshData = null;
    this.manifoldPatches = [];
    this.materials = [];
    this.animations = [];
  }

  /**
   * Parse GLB mesh from THREE.js loaded model
   * @param {THREE.Group} model - Loaded GLB model
   */
  parseMesh(model) {
    const vertices = [];
    const faces = [];
    const normals = [];
    const uvs = [];
    const materials = [];

    model.traverse(child => {
      if (child.isMesh) {
        const geo = child.geometry;
        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        const uvAttr = geo.attributes.uv;

        // Extract vertices
        for (let i = 0; i < posAttr.count; i++) {
          vertices.push({
            x: posAttr.getX(i),
            y: posAttr.getY(i),
            z: posAttr.getZ(i),
          });
        }

        // Extract normals
        if (normAttr) {
          for (let i = 0; i < normAttr.count; i++) {
            normals.push({
              x: normAttr.getX(i),
              y: normAttr.getY(i),
              z: normAttr.getZ(i),
            });
          }
        }

        // Extract UVs
        if (uvAttr) {
          for (let i = 0; i < uvAttr.count; i++) {
            uvs.push({
              u: uvAttr.getX(i),
              v: uvAttr.getY(i),
            });
          }
        }

        // Extract faces
        if (geo.index) {
          for (let i = 0; i < geo.index.count; i += 3) {
            faces.push([
              geo.index.getX(i),
              geo.index.getX(i + 1),
              geo.index.getX(i + 2),
            ]);
          }
        }

        // Material
        if (child.material) {
          materials.push({
            color: child.material.color ? child.material.color.getHex() : 0xffffff,
            metalness: child.material.metalness ?? 0,
            roughness: child.material.roughness ?? 0.5,
            emissive: child.material.emissive ? child.material.emissive.getHex() : 0x000000,
          });
        }
      }
    });

    this.meshData = { vertices, faces, normals, uvs, materials };
    return this.meshData;
  }

  /**
   * Segment mesh into patches based on curvature and topology
   * @param {number} patchSize - Target vertices per patch
   */
  segmentIntoPatches(patchSize = 64) {
    const { vertices, faces } = this.meshData;
    const patches = [];

    // Simple grid-based segmentation (can be improved with clustering)
    const bounds = this._getBounds(vertices);
    const gridDivs = Math.ceil(Math.sqrt(vertices.length / patchSize));
    const cellSizeX = (bounds.max.x - bounds.min.x) / gridDivs;
    const cellSizeY = (bounds.max.y - bounds.min.y) / gridDivs;
    const cellSizeZ = (bounds.max.z - bounds.min.z) / gridDivs;

    const grid = {};
    vertices.forEach((v, idx) => {
      const cx = Math.floor((v.x - bounds.min.x) / cellSizeX);
      const cy = Math.floor((v.y - bounds.min.y) / cellSizeY);
      const cz = Math.floor((v.z - bounds.min.z) / cellSizeZ);
      const key = `${cx},${cy},${cz}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push({ ...v, originalIdx: idx });
    });

    Object.keys(grid).forEach(key => {
      if (grid[key].length > 0) {
        patches.push({
          vertices: grid[key],
          bounds: this._getBounds(grid[key]),
          key,
        });
      }
    });

    return patches;
  }

  /**
   * Fit manifold function to a patch of vertices
   * @param {Array} vertices - Patch vertices
   * @param {string} manifoldType - MANIFOLD type
   */
  fitManifold(vertices, manifoldType = MANIFOLD.BILINEAR) {
    if (vertices.length < 3) return null;

    // Normalize vertices to [-1, 1] for numerical stability
    const bounds = this._getBounds(vertices);
    const normalized = vertices.map(v => ({
      x: (v.x - bounds.min.x) / (bounds.max.x - bounds.min.x) * 2 - 1,
      y: (v.y - bounds.min.y) / (bounds.max.y - bounds.min.y) * 2 - 1,
      z: (v.z - bounds.min.z) / (bounds.max.z - bounds.min.z) * 2 - 1,
    }));

    let coeffs = null;

    switch (manifoldType) {
      case MANIFOLD.BILINEAR:
        // Fit z = a*x*y + b*x + c*y + d
        coeffs = this._fitBilinear(normalized);
        break;
      case MANIFOLD.QUADRATIC:
        // Fit z = a*x*y² + b*x² + c*y² + d*x*y + e*x + f*y + g
        coeffs = this._fitQuadratic(normalized);
        break;
      case MANIFOLD.VOLUMETRIC:
        // Fit m = a*x*y*z + b*x*y + c*x*z + d*y*z + e*x + f*y + g*z + h
        coeffs = this._fitVolumetric(normalized);
        break;
    }

    // Compute residuals (error between fit and actual)
    const residuals = vertices.map((v, i) => {
      const predicted = this._evaluateManifold(normalized[i], coeffs, manifoldType);
      return {
        idx: i,
        error: Math.abs(predicted - normalized[i].z),
        dx: v.x - predicted,
      };
    });

    return {
      type: manifoldType,
      coefficients: coeffs,
      bounds,
      residuals,
      fidelity: this._computeFidelity(residuals),
    };
  }

  /**
   * Fit z = a*xy + b*x + c*y + d (least squares)
   */
  _fitBilinear(points) {
    const n = points.length;
    let sumX = 0, sumY = 0, sumZ = 0, sumXY = 0;
    let sumX2 = 0, sumY2 = 0, sumXZ = 0, sumYZ = 0, sumXYZ = 0;

    points.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumZ += p.z;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
      sumXZ += p.x * p.z;
      sumYZ += p.y * p.z;
      sumXYZ += p.x * p.y * p.z;
    });

    // Simplified solution (full least squares would use matrix inversion)
    const a = sumXYZ / (sumXY || 1);
    const b = (sumXZ - a * sumXY) / (sumX2 || 1);
    const c = (sumYZ - a * sumXY) / (sumY2 || 1);
    const d = (sumZ - b * sumX - c * sumY) / (n || 1);

    return { a, b, c, d };
  }

  /**
   * Fit z = a*xy² + b*x² + c*y² + d*xy + e*x + f*y + g
   */
  _fitQuadratic(points) {
    // Simplified quadratic fit (can be improved with proper regression)
    const bilinear = this._fitBilinear(points);
    const n = points.length;
    let sumX2 = 0, sumY2 = 0, sumXY2 = 0;

    points.forEach(p => {
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
      sumXY2 += p.x * p.y * p.y;
    });

    return {
      a: sumXY2 / (n || 1),
      b: sumX2 / (n || 1) * 0.1,
      c: sumY2 / (n || 1) * 0.1,
      d: bilinear.a,
      e: bilinear.b,
      f: bilinear.c,
      g: bilinear.d,
    };
  }

  /**
   * Fit m = a*xyz + b*xy + c*xz + d*yz + e*x + f*y + g*z + h
   */
  _fitVolumetric(points) {
    const n = points.length;
    let sumXYZ = 0, sumXY = 0, sumXZ = 0, sumYZ = 0;
    let sumX = 0, sumY = 0, sumZ = 0;

    points.forEach(p => {
      sumXYZ += p.x * p.y * p.z;
      sumXY += p.x * p.y;
      sumXZ += p.x * p.z;
      sumYZ += p.y * p.z;
      sumX += p.x;
      sumY += p.y;
      sumZ += p.z;
    });

    return {
      a: sumXYZ / (n || 1),
      b: sumXY / (n || 1),
      c: sumXZ / (n || 1),
      d: sumYZ / (n || 1),
      e: sumX / (n || 1),
      f: sumY / (n || 1),
      g: sumZ / (n || 1),
      h: 1.0,
    };
  }

  /**
   * Evaluate manifold at point
   */
  _evaluateManifold(p, coeffs, type) {
    switch (type) {
      case MANIFOLD.BILINEAR:
        return coeffs.a * p.x * p.y + coeffs.b * p.x + coeffs.c * p.y + coeffs.d;
      case MANIFOLD.QUADRATIC:
        return coeffs.a * p.x * p.y * p.y + coeffs.b * p.x * p.x + coeffs.c * p.y * p.y +
          coeffs.d * p.x * p.y + coeffs.e * p.x + coeffs.f * p.y + coeffs.g;
      case MANIFOLD.VOLUMETRIC:
        return coeffs.a * p.x * p.y * p.z + coeffs.b * p.x * p.y + coeffs.c * p.x * p.z +
          coeffs.d * p.y * p.z + coeffs.e * p.x + coeffs.f * p.y + coeffs.g * p.z + coeffs.h;
      default:
        return p.z;
    }
  }

  /**
   * Encode entire mesh as manifold patches
   */
  encodeMesh(patchSize = 64) {
    const patches = this.segmentIntoPatches(patchSize);
    const encoded = [];

    patches.forEach(patch => {
      // Try different manifold types, pick best fit
      const bilinear = this.fitManifold(patch.vertices, MANIFOLD.BILINEAR);
      const quadratic = this.fitManifold(patch.vertices, MANIFOLD.QUADRATIC);

      // Pick manifold with best fidelity
      const best = bilinear.fidelity > quadratic.fidelity ? bilinear : quadratic;

      encoded.push({
        patch: patch.key,
        manifold: best,
        vertexCount: patch.vertices.length,
      });
    });

    this.manifoldPatches = encoded;
    return encoded;
  }

  /**
   * Serialize to substrate format
   */
  serialize() {
    return {
      version: '1.0.0',
      type: 'manifold-glb',
      patches: this.manifoldPatches,
      materials: this.meshData.materials,
      metadata: {
        vertexCount: this.meshData.vertices.length,
        faceCount: this.meshData.faces.length,
        patchCount: this.manifoldPatches.length,
      },
    };
  }

  /**
   * Helper: Get bounding box
   */
  _getBounds(vertices) {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };

    vertices.forEach(v => {
      min.x = Math.min(min.x, v.x);
      min.y = Math.min(min.y, v.y);
      min.z = Math.min(min.z, v.z);
      max.x = Math.max(max.x, v.x);
      max.y = Math.max(max.y, v.y);
      max.z = Math.max(max.z, v.z);
    });

    return { min, max };
  }

  /**
   * Helper: Compute fidelity metric
   */
  _computeFidelity(residuals) {
    const avgError = residuals.reduce((sum, r) => sum + r.error, 0) / residuals.length;
    return 1.0 / (1.0 + avgError); // 0 to 1, higher is better
  }
}

// ═══════════════════════════════════════════════════════════════════
// MANIFOLD DECODER & MESH RECONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════
class GLBManifoldDecoder {
  constructor() { }

  /**
   * Reconstruct THREE.js mesh from manifold patches
   * @param {Object} encoded - Serialized manifold data
   * @param {number} resolution - Vertices per patch dimension
   */
  reconstructMesh(encoded, resolution = 8) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const faces = [];

    encoded.patches.forEach(patchData => {
      const patch = patchData.manifold;
      const bounds = patch.bounds;

      // Generate grid of points on manifold
      for (let ix = 0; ix < resolution; ix++) {
        for (let iy = 0; iy < resolution; iy++) {
          const u = ix / (resolution - 1);
          const v = iy / (resolution - 1);

          // Map to normalized space [-1, 1]
          const x = u * 2 - 1;
          const y = v * 2 - 1;

          // Evaluate manifold
          const z = this._evaluateManifold({ x, y, z: 0 }, patch.coefficients, patch.type);

          // Denormalize to world space
          const worldX = bounds.min.x + (x + 1) / 2 * (bounds.max.x - bounds.min.x);
          const worldY = bounds.min.y + (y + 1) / 2 * (bounds.max.y - bounds.min.y);
          const worldZ = bounds.min.z + (z + 1) / 2 * (bounds.max.z - bounds.min.z);

          vertices.push(worldX, worldY, worldZ);
        }
      }

      // Generate faces for this patch
      const baseIdx = vertices.length / 3 - resolution * resolution;
      for (let ix = 0; ix < resolution - 1; ix++) {
        for (let iy = 0; iy < resolution - 1; iy++) {
          const a = baseIdx + ix * resolution + iy;
          const b = baseIdx + ix * resolution + iy + 1;
          const c = baseIdx + (ix + 1) * resolution + iy + 1;
          const d = baseIdx + (ix + 1) * resolution + iy;

          faces.push(a, b, c);
          faces.push(a, c, d);
        }
      }
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Generate variant by tweaking manifold coefficients
   * @param {Object} encoded - Serialized manifold data
   * @param {Object} mutations - Coefficient adjustments
   */
  generateVariant(encoded, mutations = {}) {
    const variant = JSON.parse(JSON.stringify(encoded)); // Deep copy

    variant.patches.forEach(patch => {
      const coeffs = patch.manifold.coefficients;

      // Apply mutations
      Object.keys(mutations).forEach(key => {
        if (coeffs[key] !== undefined) {
          coeffs[key] *= (1 + mutations[key]);
        }
      });
    });

    return variant;
  }

  /**
   * Evaluate manifold at point (same as encoder)
   */
  _evaluateManifold(p, coeffs, type) {
    switch (type) {
      case MANIFOLD.BILINEAR:
        return coeffs.a * p.x * p.y + coeffs.b * p.x + coeffs.c * p.y + coeffs.d;
      case MANIFOLD.QUADRATIC:
        return coeffs.a * p.x * p.y * p.y + coeffs.b * p.x * p.x + coeffs.c * p.y * p.y +
          coeffs.d * p.x * p.y + coeffs.e * p.x + coeffs.f * p.y + coeffs.g;
      case MANIFOLD.VOLUMETRIC:
        return coeffs.a * p.x * p.y * p.z + coeffs.b * p.x * p.y + coeffs.c * p.x * p.z +
          coeffs.d * p.y * p.z + coeffs.e * p.x + coeffs.f * p.y + coeffs.g * p.z + coeffs.h;
      default:
        return p.z;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GLBManifoldEncoder, GLBManifoldDecoder, MANIFOLD };
}

// Browser globals (vanilla JS games load this via <script>)
if (typeof window !== 'undefined') {
  window.GLBManifoldEncoder = GLBManifoldEncoder;
  window.GLBManifoldDecoder = GLBManifoldDecoder;
  window.MANIFOLD = MANIFOLD;
}
