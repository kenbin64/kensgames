/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD INGESTOR — Shim
 * Delegates to the unified Manifold (window.Manifold)
 * Kept for backward compatibility — all existing code works unchanged.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const ManifoldIngestor = (() => {
  const M = () => (typeof window !== 'undefined' ? window : global).Manifold;

  return {
    ingest: (...a) => M() ? M().ingest(...a) : null,
    ingestAll: (...a) => M() ? M().ingestAll(...a) : [],
    sortByToken: (...a) => M() ? M().sortByToken(...a) : [],
    nearest: (...a) => M() ? M().nearest(...a) : [],
    resolveAxis: (...a) => M() ? M().resolveAxis(...a) : 0,
    distance: (e1, e2) => {
      const dx = e1.position3d.x - e2.position3d.x;
      const dy = e1.position3d.y - e2.position3d.y;
      const dz = e1.position3d.z - e2.position3d.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    validateSchema: schema => {
      const errors = [];
      if (schema.x === undefined) errors.push('schema.x is required');
      if (schema.y === undefined) errors.push('schema.y is required');
      return { valid: errors.length === 0, errors };
    },
    surface: {
      get gyroidValue() { return M()?.surface?.gyroid || ((x, y, z) => 0); },
      get diamondValue() { return M()?.surface?.diamond || ((x, y, z) => 0); },
      get surfaceBlend() { return M()?.surface?.blend || ((x, y, z) => 0); },
      projectTo3D: (mx, my, mz) => {
        const S = 10, angle = Math.PI / 10;
        return {
          x: Math.cos(mx * angle) * (mx * S),
          y: mz / S,
          z: Math.sin(my * angle) * (my * S),
        };
      },
    },
  };
})();

// Browser + Node dual export
if (typeof window !== 'undefined') window.ManifoldIngestor = ManifoldIngestor;
if (typeof module !== 'undefined') module.exports = ManifoldIngestor;
