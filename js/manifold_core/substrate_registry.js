/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUBSTRATE REGISTRY & LOADER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Central registry for all substrates in the ecosystem.
 * Manages substrate lifecycle, dependencies, and discovery.
 *
 * Usage:
 *   SubstrateRegistry.register('physics', PhysicsSubstrate);
 *   const physics = SubstrateRegistry.get('physics');
 *   const allSubstrates = SubstrateRegistry.getAll();
 */

const SubstrateRegistry = (() => {
  const _registry = new Map();
  const _instances = new Map();
  const _dependencies = new Map();
  const _config = {};

  const api = {
    /**
     * Initialize registry with manifold and config
     * @param {Object} manifold - ManifoldSurface instance
     * @param {Object} config - Global configuration
     */
    initialize(manifold, config = {}) {
      Object.assign(_config, {
        manifold,
        ...config
      });
    },

    /**
     * Register a substrate class
     * @param {string} name - Unique substrate name
     * @param {Class} SubstrateClass - Class extending SubstrateBase
     * @param {Array} dependencies - Other substrate names this depends on
     * @param {Object} defaultConfig - Default config for this substrate
     */
    register(name, SubstrateClass, dependencies = [], defaultConfig = {}) {
      if (_registry.has(name)) {
        console.warn(`Substrate '${name}' already registered, overwriting`);
      }

      _registry.set(name, {
        name,
        class: SubstrateClass,
        dependencies,
        defaultConfig,
        registered: new Date()
      });

      _dependencies.set(name, dependencies);
    },

    /**
     * Instantiate a substrate (lazy loading)
     * @param {string} name - Substrate name
     * @param {Object} config - Runtime config (merges with defaults)
     * @returns {SubstrateBase} Substrate instance
     */
    get(name, config = {}) {
      // Return cached instance if available
      const cacheKey = `${name}:${JSON.stringify(config)}`;
      if (_instances.has(cacheKey)) {
        return _instances.get(cacheKey);
      }

      // Resolve dependencies
      const deps = _dependencies.get(name) || [];
      const resolvedDeps = {};
      for (const depName of deps) {
        resolvedDeps[depName] = this.get(depName);
      }

      // Create instance
      const registration = _registry.get(name);
      if (!registration) {
        throw new Error(`Substrate '${name}' not registered`);
      }

      const SubstrateClass = registration.class;
      const mergedConfig = {
        ...registration.defaultConfig,
        ...config
      };

      const instance = new SubstrateClass(_config.manifold, mergedConfig);
      instance._dependencies = resolvedDeps;

      _instances.set(cacheKey, instance);
      return instance;
    },

    /**
     * Get all registered substrate names
     * @returns {Array}
     */
    listAll() {
      return Array.from(_registry.keys());
    },

    /**
     * Get metadata for a substrate
     * @param {string} name
     * @returns {Object}
     */
    getMetadata(name) {
      const registration = _registry.get(name);
      if (!registration) return null;

      return {
        name: registration.name,
        dependencies: registration.dependencies,
        registered: registration.registered,
        hasInstance: _instances.has(name)
      };
    },

    /**
     * Get all substrates with their instances
     * @returns {Object} { name: instance, ... }
     */
    getAll() {
      const all = {};
      for (const name of _registry.keys()) {
        all[name] = this.get(name);
      }
      return all;
    },

    /**
     * Get substrates that can extract a specific data type
     * @param {string} dataType - E.g., 'position', 'color', 'sound'
     * @returns {Array} Substrate names that can extract this type
     */
    getCapabilities(dataType) {
      return Array.from(_registry.values())
        .filter(reg => {
          const instance = this.get(reg.name);
          const schema = instance.getSchema();
          return schema[dataType] !== undefined;
        })
        .map(reg => reg.name);
    },

    /**
     * Clear all cached instances (for testing or hot reload)
     */
    clearCache() {
      _instances.clear();
    },

    /**
     * Get current registry statistics
     * @returns {Object}
     */
    getStats() {
      const cached = Array.from(_instances.values());
      const totalCached = cached.reduce((sum, s) => sum + (s.getCacheStats?.().cachedItems || 0), 0);

      return {
        totalRegistered: _registry.size,
        totalInstances: _instances.size,
        totalCachedItems: totalCached,
        substrates: Array.from(_registry.keys())
      };
    },

    /**
     * Chain multiple substrate extractions on same coordinate
     * @param {Array} substrateName - Names to chain
     * @param {Array|Object} coordinate
     * @returns {Object} { substrateName: data, ... }
     */
    extractMultiple(substrateNames, coordinate) {
      const result = {};
      for (const name of substrateNames) {
        const substrate = this.get(name);
        result[name] = substrate.extract(coordinate);
      }
      return result;
    },

    /**
     * Validate that all dependencies are registered
     * @returns {Object} { valid: boolean, errors: Array }
     */
    validateDependencies() {
      const errors = [];

      for (const [name, deps] of _dependencies) {
        for (const dep of deps) {
          if (!_registry.has(dep)) {
            errors.push(`Substrate '${name}' depends on '${dep}' which is not registered`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    }
  };

  return api;
})();

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubstrateRegistry;
}

// Expose globally in browser
if (typeof window !== 'undefined') {
  window.SubstrateRegistry = SubstrateRegistry;
}
