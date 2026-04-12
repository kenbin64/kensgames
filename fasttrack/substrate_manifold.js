/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * SUBSTRATE MANIFOLD
 * Meta-substrate: Substrates as points on a higher-order manifold
 * 
 * PARADIGM: Substrates themselves are points on dimensions.
 * The manifold is a whole object, and substrates are its parts.
 * Each substrate is a whole object containing lower-dimensional
 * operations.
 * 
 * This enables:
 * - Geometric substrate composition (z = x·y)
 * - Automatic substrate routing
 * - Dimensional pipelines (flow through layers)
 * - Dependency discovery
 * - Self-organizing architecture
 * 
 * ============================================================
 */

'use strict';

const SubstrateManifold = {
    version: '1.0.0',
    name: 'Substrate Manifold - Meta-Substrate',
    
    // Substrates as points on manifold
    _substrates: new Map(),
    
    // Fibonacci weights for dimensional layers
    _fibonacci: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
    _phi: 1.618033988749895,
    
    // 7-Layer Genesis Model mapping
    _layers: {
        SPARK: 1,       // Individual operations (lift)
        MIRROR: 2,      // Pairs and mappings (map)
        RELATION: 3,    // Binding and filtering (bind)
        FORM: 4,        // Transformations (navigate)
        LIFE: 5,        // Aggregations and meaning (transform)
        MIND: 6,        // Coherence and sorting (merge)
        COMPLETION: 7   // Unified whole (resolve)
    },
    
    // ============================================================
    // SUBSTRATE REGISTRATION (Points on Manifold)
    // ============================================================
    
    /**
     * Register substrate at manifold coordinates
     * @param {Object} substrate - Substrate to register
     * @param {Object} coords - Manifold coordinates { x, y, layer, domain }
     * @returns {Object} Manifold point
     */
    register(substrate, coords) {
        // Support: register('Name', Class)  — string + class/constructor
        if (typeof substrate === 'string') {
            substrate = { name: substrate };
            coords = typeof coords === 'function' ? {} : (coords || {});
        }

        // Support: register(SubstrateClass)  — class/constructor with no coords
        // JS classes have Function.name set automatically
        coords = coords || {};

        if (!substrate || !substrate.name) {
            throw new Error('Substrate must have a name');
        }

        const x = coords.x || substrate.name;
        const y = coords.y || 1;
        const z = this._computeZ(x, y);
        const layer = coords.layer || this._inferLayer(substrate);
        const domain = coords.domain || this._inferDomain(substrate);
        
        const point = {
            substrate,
            name: substrate.name,
            version: substrate.version || '1.0.0',
            x,
            y,
            z,
            layer,
            domain,
            weight: this._fibonacci[layer - 1] || 1,
            registered: Date.now()
        };
        
        this._substrates.set(substrate.name, point);
        
        console.log(`[SubstrateManifold] Registered ${substrate.name} at layer ${layer} (${this._getLayerName(layer)})`);
        
        return point;
    },
    
    /**
     * Compute z coordinate (relation surface)
     * @private
     */
    _computeZ(x, y) {
        // If x is string, use hash
        if (typeof x === 'string') {
            x = this._hash(x);
        }
        return x * y;
    },
    
    /**
     * Simple string hash
     * @private
     */
    _hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) % 1000;
    },
    
    /**
     * Infer layer from substrate characteristics
     * @private
     */
    _inferLayer(substrate) {
        const name = substrate.name.toLowerCase();
        
        if (name.includes('validation')) return this._layers.RELATION;
        if (name.includes('event')) return this._layers.MIRROR;
        if (name.includes('state')) return this._layers.LIFE;
        if (name.includes('array')) return this._layers.COMPLETION; // Contains all layers
        
        return this._layers.FORM; // Default
    },
    
    /**
     * Infer domain from substrate name
     * @private
     */
    _inferDomain(substrate) {
        const name = substrate.name.toLowerCase();
        
        if (name.includes('validation')) return 'validation';
        if (name.includes('event')) return 'events';
        if (name.includes('state')) return 'state';
        if (name.includes('array')) return 'collections';
        
        return 'general';
    },
    
    /**
     * Get layer name
     * @private
     */
    _getLayerName(layer) {
        const names = ['Spark', 'Mirror', 'Relation', 'Form', 'Life', 'Mind', 'Completion'];
        return names[layer - 1] || 'Unknown';
    },
    
    // ============================================================
    // SUBSTRATE DISCOVERY (Locate Points)
    // ============================================================
    
    /**
     * Get substrate by name
     * @param {string} name - Substrate name
     * @returns {Object} Substrate or null
     */
    get(name) {
        const point = this._substrates.get(name);
        return point ? point.substrate : null;
    },
    
    /**
     * Get substrate point (includes coordinates)
     * @param {string} name - Substrate name
     * @returns {Object} Manifold point or null
     */
    getPoint(name) {
        return this._substrates.get(name) || null;
    },
    
    /**
     * Find substrates by layer
     * @param {number} layer - Layer number (1-7)
     * @returns {Array} Substrates at layer
     */
    findByLayer(layer) {
        const results = [];
        for (const point of this._substrates.values()) {
            if (point.layer === layer) {
                results.push(point);
            }
        }
        return results;
    },
    
    /**
     * Find substrates by domain
     * @param {string} domain - Domain name
     * @returns {Array} Substrates in domain
     */
    findByDomain(domain) {
        const results = [];
        for (const point of this._substrates.values()) {
            if (point.domain === domain) {
                results.push(point);
            }
        }
        return results;
    },
    
    /**
     * Find nearest substrate to coordinates
     * @param {Object} coords - Target coordinates { x, y, layer }
     * @returns {Object} Nearest substrate point
     */
    findNearest(coords) {
        let nearest = null;
        let minDistance = Infinity;
        
        const targetX = typeof coords.x === 'string' ? this._hash(coords.x) : coords.x;
        const targetY = coords.y || 1;
        const targetLayer = coords.layer || 0;
        
        for (const point of this._substrates.values()) {
            const pointX = typeof point.x === 'string' ? this._hash(point.x) : point.x;
            const distance = this._distance(
                { x: pointX, y: point.y, layer: point.layer },
                { x: targetX, y: targetY, layer: targetLayer }
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearest = point;
            }
        }
        
        return nearest;
    },
    
    /**
     * Calculate distance between two points on manifold
     * @private
     */
    _distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dLayer = (p1.layer - p2.layer) * 10; // Layer distance weighted
        
        return Math.sqrt(dx*dx + dy*dy + dLayer*dLayer);
    },
    
    // ============================================================
    // SUBSTRATE COMPOSITION (z = x·y Binding)
    // ============================================================
    
    /**
     * Bind two substrates geometrically
     * Creates composite operation where output of A feeds into B
     * @param {string|Object} substrateA - First substrate
     * @param {string|Object} substrateB - Second substrate
     * @returns {Object} Bound operation
     */
    bind(substrateA, substrateB) {
        const pointA = typeof substrateA === 'string' 
            ? this.getPoint(substrateA) 
            : this._substrates.get(substrateA.name);
            
        const pointB = typeof substrateB === 'string' 
            ? this.getPoint(substrateB) 
            : this._substrates.get(substrateB.name);
        
        if (!pointA || !pointB) {
            throw new Error('Both substrates must be registered');
        }
        
        // Compute binding strength (z = x·y)
        const bindingZ = pointA.z * pointB.z;
        
        return {
            type: 'binding',
            substrates: [pointA.name, pointB.name],
            z: bindingZ,
            execute: (data, methodA, methodB) => {
                // Execute A, then B
                const resultA = pointA.substrate[methodA](data);
                return pointB.substrate[methodB](resultA);
            }
        };
    },
    
    /**
     * Compose multiple substrates into pipeline
     * @param {Array} substrates - Array of substrate names or objects
     * @returns {Object} Pipeline
     */
    compose(...substrates) {
        const points = substrates.map(s => {
            if (typeof s === 'string') return this.getPoint(s);
            if (s.name) return this.getPoint(s.name);
            return s;
        }).filter(p => p !== null);
        
        return {
            type: 'composition',
            substrates: points.map(p => p.name),
            layers: points.map(p => p.layer),
            execute: (data, methods) => {
                return points.reduce((result, point, index) => {
                    const method = methods[index];
                    if (method && typeof point.substrate[method] === 'function') {
                        return point.substrate[method](result);
                    }
                    return result;
                }, data);
            }
        };
    },
    
    // ============================================================
    // DIMENSIONAL PIPELINES (Flow Through Layers)
    // ============================================================
    
    /**
     * Create dimensional flow through substrate layers
     * Data ascends through layers 1→7
     * @param {Array} pipeline - Array of { substrate, method, layer }
     * @returns {Object} Flow pipeline
     */
    flow(pipeline) {
        // Sort by layer (ascending)
        const sorted = [...pipeline].sort((a, b) => {
            const layerA = a.layer || this.getPoint(a.substrate)?.layer || 0;
            const layerB = b.layer || this.getPoint(b.substrate)?.layer || 0;
            return layerA - layerB;
        });
        
        return {
            type: 'flow',
            pipeline: sorted,
            execute: (data) => {
                return sorted.reduce((result, step) => {
                    const point = typeof step.substrate === 'string'
                        ? this.getPoint(step.substrate)
                        : this._substrates.get(step.substrate.name);
                    
                    if (!point) return result;
                    
                    const method = step.method;
                    if (method && typeof point.substrate[method] === 'function') {
                        console.log(`[Flow] Layer ${point.layer} (${this._getLayerName(point.layer)}): ${point.name}.${method}()`);
                        return point.substrate[method](result, ...(step.args || []));
                    }
                    
                    return result;
                }, data);
            }
        };
    },
    
    // ============================================================
    // SUBSTRATE DEPENDENCIES (Manifold Graph)
    // ============================================================
    
    /**
     * Get substrates that this substrate depends on
     * @param {string|Object} substrate - Substrate to analyze
     * @returns {Array} Dependencies
     */
    dependencies(substrate) {
        const point = typeof substrate === 'string' 
            ? this.getPoint(substrate) 
            : this._substrates.get(substrate.name);
        
        if (!point) return [];
        
        // Substrates in lower layers are dependencies
        const deps = [];
        for (const other of this._substrates.values()) {
            if (other.layer < point.layer) {
                deps.push(other);
            }
        }
        
        return deps;
    },
    
    /**
     * Get substrates that depend on this substrate
     * @param {string|Object} substrate - Substrate to analyze
     * @returns {Array} Dependents
     */
    dependents(substrate) {
        const point = typeof substrate === 'string' 
            ? this.getPoint(substrate) 
            : this._substrates.get(substrate.name);
        
        if (!point) return [];
        
        // Substrates in higher layers are dependents
        const deps = [];
        for (const other of this._substrates.values()) {
            if (other.layer > point.layer) {
                deps.push(other);
            }
        }
        
        return deps;
    },
    
    // ============================================================
    // SUBSTRATE ROUTING (Automatic Selection)
    // ============================================================
    
    /**
     * Route operation to appropriate substrate
     * @param {string} operation - Operation type
     * @param {*} data - Data to operate on
     * @returns {*} Result
     */
    route(operation, data) {
        // Find substrate that handles this operation
        for (const point of this._substrates.values()) {
            if (typeof point.substrate[operation] === 'function') {
                console.log(`[Route] ${operation} → ${point.name}`);
                return point.substrate[operation](data);
            }
        }
        
        console.warn(`[Route] No substrate found for operation: ${operation}`);
        return null;
    },
    
    // ============================================================
    // MANIFOLD STATISTICS
    // ============================================================
    
    /**
     * Get manifold statistics
     * @returns {Object} Stats
     */
    getStats() {
        const layerCounts = {};
        const domainCounts = {};
        
        for (const point of this._substrates.values()) {
            layerCounts[point.layer] = (layerCounts[point.layer] || 0) + 1;
            domainCounts[point.domain] = (domainCounts[point.domain] || 0) + 1;
        }
        
        return {
            totalSubstrates: this._substrates.size,
            layerDistribution: layerCounts,
            domainDistribution: domainCounts,
            layers: Object.keys(layerCounts).map(l => ({
                layer: parseInt(l),
                name: this._getLayerName(parseInt(l)),
                count: layerCounts[l]
            }))
        };
    },
    
    /**
     * List all registered substrates
     * @returns {Array} Substrate points
     */
    list() {
        return Array.from(this._substrates.values());
    },
    
    /**
     * Visualize manifold structure
     * @returns {string} ASCII visualization
     */
    visualize() {
        const lines = [];
        lines.push('\n🌌 Substrate Manifold Visualization\n');
        lines.push('='.repeat(60));
        
        for (let layer = 1; layer <= 7; layer++) {
            const substrates = this.findByLayer(layer);
            if (substrates.length > 0) {
                const layerName = this._getLayerName(layer);
                const weight = this._fibonacci[layer - 1];
                lines.push(`\nLayer ${layer}: ${layerName} (weight: ${weight})`);
                substrates.forEach(point => {
                    lines.push(`  • ${point.name} [${point.domain}] z=${point.z}`);
                });
            }
        }
        
        lines.push('\n' + '='.repeat(60));
        return lines.join('\n');
    }
};

// ============================================================
// AUTO-REGISTRATION (Register existing substrates)
// ============================================================

if (typeof window !== 'undefined') {
    window.SubstrateManifold = SubstrateManifold;
    
    // Auto-register existing substrates
    if (window.ValidationSubstrate) {
        SubstrateManifold.register({
            name: 'Universal Validation Substrate',
            substrate: window.ValidationSubstrate
        }, {
            layer: 3, // Relation (truth tables)
            domain: 'validation'
        });
    }
    
    if (window.EventSubstrate) {
        SubstrateManifold.register({
            name: 'Universal Event Substrate',
            substrate: window.EventSubstrate
        }, {
            layer: 2, // Mirror (event pairs)
            domain: 'events'
        });
    }
    
    if (window.StateSubstrate) {
        SubstrateManifold.register({
            name: 'Universal State Substrate',
            substrate: window.StateSubstrate
        }, {
            layer: 5, // Life (reactive meaning)
            domain: 'state'
        });
    }
    
    if (window.ArraySubstrate) {
        SubstrateManifold.register({
            name: 'Universal Array Substrate - Dimensional Computing',
            substrate: window.ArraySubstrate
        }, {
            layer: 7, // Completion (contains all layers)
            domain: 'collections'
        });
    }
    
    console.log('✅ SubstrateManifold loaded - Meta-substrate ready');
    console.log(SubstrateManifold.visualize());
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubstrateManifold;
}
