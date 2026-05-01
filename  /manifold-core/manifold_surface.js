/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD SURFACE — Shim
 * Delegates to the unified Manifold (window.Manifold)
 * Kept for backward compatibility — all existing code works unchanged.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ManifoldSurface = (() => {
  const M = () => window.Manifold;

  return {
    initialize(dimensions, schema) {
      // No-op — unified Manifold manages its own state
    },
    write(coordinate, data) {
      return M() ? M().write(coordinate, data) : null;
    },
    read(coordinate) {
      return M() ? M().read(coordinate) : null;
    },
    readAll() {
      return M() ? M().readAll() : [];
    },
    queryNearby(center, radius = 10) {
      return M() ? M().queryNearby(center, radius) : [];
    },
    distance(coord1, coord2) {
      const c1 = Array.isArray(coord1) ? coord1 : [coord1];
      const c2 = Array.isArray(coord2) ? coord2 : [coord2];
      let sum = 0;
      for (let i = 0; i < Math.max(c1.length, c2.length); i++) {
        const v1 = c1[i] || 0, v2 = c2[i] || 0;
        sum += (v1 - v2) * (v1 - v2);
      }
      return Math.sqrt(sum);
    },
    calculateZ(x, y) { return x * y; },
    getStats() {
      return M() ? M().stats() : { totalCoordinates: 0, dimensions: 0 };
    },
    stream(callback, batchSize = 100) {
      const all = this.readAll();
      for (let i = 0; i < all.length; i += batchSize) {
        callback(all.slice(i, i + batchSize), {
          batchIndex: Math.floor(i / batchSize),
          totalBatches: Math.ceil(all.length / batchSize)
        });
      }
    },
    clear() {
      // No-op — unified Manifold does not support destructive clear
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ManifoldSurface;
if (typeof window !== 'undefined') window.ManifoldSurface = ManifoldSurface;
