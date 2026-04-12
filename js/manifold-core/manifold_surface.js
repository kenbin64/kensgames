/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD SURFACE CORE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mathematical Foundation: Schwartz Diamond Gyroid
 * z = xy (manifold equation)
 *
 * The manifold is the single source of truth for all game data.
 * Any coordinate (x, y, z, ..., n) encodes ALL information needed.
 * Different lenses (substrates) read the same coordinate differently.
 *
 * Example:
 *   Coordinate: [2.5, 3.2, 8.0, 'player_skill', 'hard']
 *
 *   Physics Lens reads:   { mass: 1200, thrust: 45, inertia: 0.92 }
 *   Graphics Lens reads:  { model: 'viper_mk7', color: '#00ff99' }
 *   Audio Lens reads:     { pitch: 440, volume: 0.8 }
 *   GameLogic Lens reads: { difficulty: 'hard', aiAggression: 0.8 }
 */

const ManifoldSurface = (() => {
  // ═══════════════════════════════════════════════════════════════════════════
  // MANIFOLD STORAGE & COORDINATE INDEXING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Core data structure: stores all game state as points on manifold
   * Key: coordinate hash
   * Value: raw data blob
   */
  const _manifoldData = new Map();

  /**
   * Dimension definitions for this manifold instance
   * [{ name: 'playerCount', min: 1, max: 6 },
   *  { name: 'playtime', min: 5, max: 120 },
   *  { name: 'difficulty', type: 'enum', values: ['easy', 'medium', 'hard'] }]
   */
  const _dimensions = [];

  /**
   * Schema: what data can be stored at any coordinate
   */
  const _schema = {};

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  const api = {
    /**
     * Initialize manifold with dimension definitions
     * @param {Array} dimensions - Dimension specs
     * @param {Object} schema - Data schema for coordinates
     */
    initialize(dimensions, schema) {
      _dimensions.length = 0;
      _dimensions.push(...dimensions);
      Object.assign(_schema, schema);
    },

    /**
     * Write data at a coordinate on the manifold
     * @param {Array|Object} coordinate - Position on manifold
     * @param {Object} data - The data to store
     * @returns {string} Coordinate hash for lookup
     */
    write(coordinate, data) {
      const hash = _coordinateToHash(coordinate);
      _manifoldData.set(hash, {
        coordinate: _normalizeCoordinate(coordinate),
        data: data,
        timestamp: Date.now(),
        hash: hash
      });
      return hash;
    },

    /**
     * Read raw data at a coordinate
     * @param {Array|Object} coordinate - Position on manifold
     * @returns {Object} Data stored at coordinate
     */
    read(coordinate) {
      const hash = _coordinateToHash(coordinate);
      const entry = _manifoldData.get(hash);
      return entry ? entry.data : null;
    },

    /**
     * Get all data stored on manifold
     * @returns {Array} All data entries
     */
    readAll() {
      return Array.from(_manifoldData.values()).map(e => ({
        coordinate: e.coordinate,
        data: e.data,
        timestamp: e.timestamp
      }));
    },

    /**
     * Query manifold by proximity (nearest neighbors)
     * @param {Array|Object} center - Center coordinate
     * @param {number} radius - Search radius
     * @returns {Array} Nearby entries within radius
     */
    queryNearby(center, radius = 10) {
      const centerCoord = _normalizeCoordinate(center);
      const results = [];

      _manifoldData.forEach((entry) => {
        const distance = _euclideanDistance(centerCoord, entry.coordinate);
        if (distance <= radius) {
          results.push({
            coordinate: entry.coordinate,
            data: entry.data,
            distance: distance
          });
        }
      });

      return results.sort((a, b) => a.distance - b.distance);
    },

    /**
     * Calculate Euclidean distance between two coordinates
     * @param {Array|Object} coord1
     * @param {Array|Object} coord2
     * @returns {number} Distance
     */
    distance(coord1, coord2) {
      return _euclideanDistance(_normalizeCoordinate(coord1), _normalizeCoordinate(coord2));
    },

    /**
     * Calculate Z coordinate for manifold surface
     * Default: z = x * y (can be overridden)
     * @param {number} x - First dimension
     * @param {number} y - Second dimension
     * @returns {number} Z coordinate on manifold
     */
    calculateZ(x, y) {
      return x * y;
    },

    /**
     * Get manifold statistics
     * @returns {Object} Stats about manifold
     */
    getStats() {
      return {
        totalCoordinates: _manifoldData.size,
        dimensions: _dimensions.length,
        dimensionNames: _dimensions.map(d => d.name),
        totalDataSize: Array.from(_manifoldData.values()).reduce((sum, e) =>
          sum + JSON.stringify(e.data).length, 0)
      };
    },

    /**
     * Stream data from manifold (for large datasets)
     * @param {Function} callback - Called with each entry
     * @param {number} batchSize - Entries per batch
     */
    stream(callback, batchSize = 100) {
      const entries = Array.from(_manifoldData.values());
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        callback(batch, {
          batchIndex: Math.floor(i / batchSize),
          totalBatches: Math.ceil(entries.length / batchSize)
        });
      }
    },

    /**
     * Clear manifold (reset all data)
     */
    clear() {
      _manifoldData.clear();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function _normalizeCoordinate(coord) {
    if (Array.isArray(coord)) return coord;
    if (typeof coord === 'object') {
      return _dimensions.map(d => coord[d.name] !== undefined ? coord[d.name] : 0);
    }
    return [coord];
  }

  function _coordinateToHash(coord) {
    const normalized = _normalizeCoordinate(coord);
    return normalized.map(v => {
      if (typeof v === 'number') return v.toFixed(6);
      return String(v);
    }).join(':');
  }

  function _euclideanDistance(coord1, coord2) {
    let sum = 0;
    for (let i = 0; i < Math.max(coord1.length, coord2.length); i++) {
      const v1 = coord1[i] || 0;
      const v2 = coord2[i] || 0;
      sum += Math.pow(v1 - v2, 2);
    }
    return Math.sqrt(sum);
  }

  return api;
})();

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ManifoldSurface;
}

// Expose globally in browser
if (typeof window !== 'undefined') {
  window.ManifoldSurface = ManifoldSurface;
}
