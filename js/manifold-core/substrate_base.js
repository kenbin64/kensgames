/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUBSTRATE BASE CLASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Abstract "lens" that reads from manifold and transforms data for a specific domain.
 *
 * Example:
 *   class PhysicsSubstrate extends SubstrateBase {
 *     name() { return 'physics'; }
 *     extract(coordinate) {
 *       const raw = this.manifold.read(coordinate);
 *       return {
 *         mass: raw.mass || 1000,
 *         thrust: raw.thrust || 50,
 *         inertia: raw.inertia || 0.9
 *       };
 *     }
 *   }
 *
 * All substrates follow the same pattern:
 * 1. Read raw data from manifold coordinate
 * 2. Transform/extract domain-specific properties
 * 3. Apply defaults if missing
 * 4. Return structured data
 */

class SubstrateBase {
  constructor(manifold, config = {}) {
    this.manifold = manifold;
    this.config = config;
    this._cache = new Map();
    this._listeners = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERRIDE THESE IN SUBCLASSES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Unique name for this substrate
   * @returns {string}
   */
  name() {
    return 'substrate-base';
  }

  /**
   * Extract domain-specific data from a manifold coordinate
   * @param {Array|Object} coordinate - Position on manifold
   * @returns {Object} Domain-specific data
   */
  extract(coordinate) {
    return this.manifold.read(coordinate) || {};
  }

  /**
   * Validate that extracted data is correctly structured
   * @param {Object} data - Data to validate
   * @returns {boolean}
   */
  validate(data) {
    return true; // Override in subclasses
  }

  /**
   * Get schema for this substrate's data
   * @returns {Object} JSON Schema
   */
  getSchema() {
    return {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD OPERATIONS AVAILABLE TO ALL SUBSTRATES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract with caching
   * @param {Array|Object} coordinate
   * @param {Object} options - { useCache: true, expiry: 5000 }
   * @returns {Object}
   */
  extractCached(coordinate, options = {}) {
    const { useCache = true, expiry = 5000 } = options;
    const hash = this._coordinateHash(coordinate);

    if (useCache && this._cache.has(hash)) {
      const cached = this._cache.get(hash);
      if (Date.now() - cached.timestamp < expiry) {
        return cached.data;
      }
    }

    const data = this.extract(coordinate);

    if (useCache) {
      this._cache.set(hash, {
        data: data,
        timestamp: Date.now()
      });
    }

    return data;
  }

  /**
   * Extract data for multiple coordinates
   * @param {Array} coordinates - Array of coordinates
   * @returns {Array} Extracted data for each coordinate
   */
  extractBatch(coordinates) {
    return coordinates.map(coord => this.extract(coord));
  }

  /**
   * Extract nearby data (query manifold proximity + extract)
   * @param {Array|Object} center - Center coordinate
   * @param {number} radius - Search radius
   * @returns {Array} Extracted data from nearby coordinates
   */
  extractNearby(center, radius = 10) {
    const nearby = this.manifold.queryNearby(center, radius);
    return nearby.map(entry => ({
      coordinate: entry.coordinate,
      data: this.extract(entry.coordinate),
      distance: entry.distance
    }));
  }

  /**
   * Watch for changes to a coordinate
   * @param {Array|Object} coordinate
   * @param {Function} callback - Called when data changes
   * @returns {string} Listener ID (for removal)
   */
  watch(coordinate, callback) {
    const hash = this._coordinateHash(coordinate);
    const listenerId = `${hash}-${Date.now()}`;

    if (!this._listeners.has(hash)) {
      this._listeners.set(hash, []);
    }

    this._listeners.get(hash).push({ id: listenerId, callback });
    return listenerId;
  }

  /**
   * Stop watching a coordinate
   * @param {string} listenerId
   */
  unwatch(listenerId) {
    for (const [, listeners] of this._listeners) {
      const idx = listeners.findIndex(l => l.id === listenerId);
      if (idx >= 0) {
        listeners.splice(idx, 1);
        break;
      }
    }
  }

  /**
   * Notify listeners of changes
   * @param {Array|Object} coordinate
   * @param {Object} newData
   */
  notifyListeners(coordinate, newData) {
    const hash = this._coordinateHash(coordinate);
    const listeners = this._listeners.get(hash);

    if (listeners) {
      listeners.forEach(l => {
        try {
          l.callback(newData);
        } catch (error) {
          console.error(`Error in listener for ${this.name()}:`, error);
        }
      });
    }
  }

  /**
   * Clear cache for a coordinate (or all if not specified)
   * @param {Array|Object} coordinate - Optional
   */
  clearCache(coordinate) {
    if (coordinate) {
      this._cache.delete(this._coordinateHash(coordinate));
    } else {
      this._cache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      substrateName: this.name(),
      cachedItems: this._cache.size,
      listeners: Array.from(this._listeners.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  /**
   * Transform data using a pipeline of functions
   * @param {Object} data
   * @param {Array} transformers - Array of functions
   * @returns {Object}
   */
  transform(data, transformers) {
    let result = data;
    for (const transformer of transformers) {
      result = transformer(result);
    }
    return result;
  }

  /**
   * Merge data from this substrate with another
   * @param {Object} thisData - Data from this substrate
   * @param {Object} otherData - Data from another substrate
   * @param {Function} merger - Custom merge function
   * @returns {Object}
   */
  merge(thisData, otherData, merger = null) {
    if (merger) {
      return merger(thisData, otherData);
    }
    return { ...thisData, ...otherData };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  _coordinateHash(coordinate) {
    if (Array.isArray(coordinate)) {
      return coordinate.map(v => {
        if (typeof v === 'number') return v.toFixed(6);
        return String(v);
      }).join(':');
    }
    if (typeof coordinate === 'object') {
      return JSON.stringify(coordinate);
    }
    return String(coordinate);
  }
}

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubstrateBase;
}

// Expose globally in browser
if (typeof window !== 'undefined') {
  window.SubstrateBase = SubstrateBase;
}
