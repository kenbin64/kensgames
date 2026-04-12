/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * ARRAY SUBSTRATE
 * Universal array operations - Dimensional Computing paradigm
 * 
 * PARADIGM: Arrays are points on dimensions. A dimension is a 
 * whole object, and points are its parts. Those parts are whole 
 * objects of lower-dimensional points.
 * 
 * Every array operation exists on a geometric manifold:
 * - Layer 1 (Spark): Individual elements
 * - Layer 2 (Mirror): Pairs and mappings
 * - Layer 3 (Relation): Filtering and binding (z = x·y)
 * - Layer 4 (Form): Transformations and shapes
 * - Layer 5 (Life): Reductions and aggregations
 * - Layer 6 (Mind): Sorting and coherence
 * - Layer 7 (Completion): Full array as unified whole
 * 
 * Reusable in: FastTrack, Chess, Blog, any ButterflyFX app
 * ============================================================
 */

'use strict';

const ArraySubstrate = {
    version: '1.0.0',
    name: 'Universal Array Substrate - Dimensional Computing',
    
    // Fibonacci weights for dimensional operations
    _fibonacci: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
    _phi: 1.618033988749895,
    
    // ============================================================
    // LAYER 1: SPARK - Individual Elements (Existence)
    // ============================================================
    
    /**
     * Get element at index (point on dimension)
     * @param {Array} arr - Array dimension
     * @param {number} index - Point coordinate
     * @param {*} defaultValue - Default if out of bounds
     * @returns {*} Element at point
     */
    at(arr, index, defaultValue = null) {
        if (!Array.isArray(arr)) return defaultValue;
        if (index < 0) index = arr.length + index; // Negative indexing
        return index >= 0 && index < arr.length ? arr[index] : defaultValue;
    },
    
    /**
     * First element (origin point)
     */
    first(arr, defaultValue = null) {
        return this.at(arr, 0, defaultValue);
    },
    
    /**
     * Last element (terminal point)
     */
    last(arr, defaultValue = null) {
        return this.at(arr, -1, defaultValue);
    },
    
    // ============================================================
    // LAYER 2: MIRROR - Pairs and Mappings (Direction)
    // ============================================================
    
    /**
     * Map array to new dimension (transformation)
     * Each element becomes a point on new manifold
     */
    map(arr, fn) {
        if (!Array.isArray(arr)) return [];
        return arr.map((item, index) => fn(item, index, arr));
    },
    
    /**
     * Map with dimensional coordinates (x, y, z)
     * z = x·y where x = value, y = index
     */
    mapDimensional(arr, fn) {
        return this.map(arr, (item, index) => {
            const x = item;
            const y = index;
            const z = x * y; // Relation manifold
            return fn({ x, y, z, item, index });
        });
    },
    
    /**
     * Zip two arrays (pair points from two dimensions)
     */
    zip(arr1, arr2) {
        const length = Math.min(arr1.length, arr2.length);
        const result = [];
        for (let i = 0; i < length; i++) {
            result.push([arr1[i], arr2[i]]);
        }
        return result;
    },
    
    // ============================================================
    // LAYER 3: RELATION - Filtering and Binding (z = x·y)
    // ============================================================
    
    /**
     * Filter array (select points on manifold)
     * Predicate determines which points exist in result dimension
     */
    filter(arr, predicate) {
        if (!Array.isArray(arr)) return [];
        return arr.filter((item, index) => predicate(item, index, arr));
    },
    
    /**
     * Filter by property value (dimensional projection)
     */
    filterBy(arr, key, value) {
        return this.filter(arr, item => item[key] === value);
    },
    
    /**
     * Filter active items (common pattern)
     * Filters out items where inactiveKey is true
     */
    filterActive(arr, inactiveKey = 'completed') {
        return this.filter(arr, item => !item[inactiveKey]);
    },
    
    /**
     * Find first matching element (locate point)
     */
    find(arr, predicate) {
        if (!Array.isArray(arr)) return null;
        return arr.find((item, index) => predicate(item, index, arr)) || null;
    },
    
    /**
     * Find by property value
     */
    findBy(arr, key, value) {
        return this.find(arr, item => item[key] === value);
    },
    
    // ============================================================
    // LAYER 4: FORM - Transformations and Shapes (Purpose)
    // ============================================================
    
    /**
     * Group array by key function (partition dimension)
     * Creates sub-dimensions based on key
     */
    groupBy(arr, keyFn) {
        if (!Array.isArray(arr)) return {};
        
        return arr.reduce((groups, item, index) => {
            const key = typeof keyFn === 'function' 
                ? keyFn(item, index) 
                : item[keyFn];
            
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
            return groups;
        }, {});
    },
    
    /**
     * Partition into two arrays based on predicate
     * Splits dimension into two sub-dimensions
     */
    partition(arr, predicate) {
        const pass = [];
        const fail = [];
        
        arr.forEach((item, index) => {
            if (predicate(item, index, arr)) {
                pass.push(item);
            } else {
                fail.push(item);
            }
        });
        
        return [pass, fail];
    },
    
    /**
     * Chunk array into groups of size n
     * Divides dimension into equal segments
     */
    chunk(arr, size) {
        if (!Array.isArray(arr) || size < 1) return [];
        
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    },
    
    /**
     * Flatten nested arrays (collapse dimensions)
     * Reduces multi-dimensional array to single dimension
     */
    flatten(arr, depth = 1) {
        if (!Array.isArray(arr)) return [];
        
        return arr.reduce((flat, item) => {
            if (Array.isArray(item) && depth > 0) {
                return flat.concat(this.flatten(item, depth - 1));
            }
            return flat.concat(item);
        }, []);
    },
    
    // ============================================================
    // LAYER 5: LIFE - Reductions and Aggregations (Motion/Meaning)
    // ============================================================
    
    /**
     * Reduce array to single value (collapse dimension to point)
     * All points converge to unified meaning
     */
    reduce(arr, fn, initialValue) {
        if (!Array.isArray(arr)) return initialValue;
        return arr.reduce(fn, initialValue);
    },
    
    /**
     * Sum numeric array (aggregate energy)
     */
    sum(arr) {
        return this.reduce(arr, (sum, val) => sum + (Number(val) || 0), 0);
    },
    
    /**
     * Average (center of mass)
     */
    average(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return this.sum(arr) / arr.length;
    },
    
    /**
     * Min value (lowest point)
     */
    min(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return Math.min(...arr);
    },
    
    /**
     * Max value (highest point)
     */
    max(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return Math.max(...arr);
    },
    
    /**
     * Count elements matching predicate
     */
    count(arr, predicate) {
        if (!predicate) return arr.length;
        return this.filter(arr, predicate).length;
    },
    
    // ============================================================
    // LAYER 6: MIND - Sorting and Coherence (Order)
    // ============================================================
    
    /**
     * Sort array by key function (impose order on dimension)
     * Creates coherent sequence from chaos
     */
    sortBy(arr, keyFn, descending = false) {
        if (!Array.isArray(arr)) return [];
        
        const sorted = [...arr].sort((a, b) => {
            const aVal = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
            const bVal = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
            
            if (aVal < bVal) return descending ? 1 : -1;
            if (aVal > bVal) return descending ? -1 : 1;
            return 0;
        });
        
        return sorted;
    },
    
    /**
     * Sort by multiple keys (hierarchical coherence)
     */
    sortByMultiple(arr, keyFns) {
        if (!Array.isArray(arr)) return [];
        
        return [...arr].sort((a, b) => {
            for (const keyFn of keyFns) {
                const aVal = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
                const bVal = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
                
                if (aVal < bVal) return -1;
                if (aVal > bVal) return 1;
            }
            return 0;
        });
    },
    
    /**
     * Unique elements (remove duplicates, maintain coherence)
     */
    unique(arr, keyFn = null) {
        if (!Array.isArray(arr)) return [];
        
        if (!keyFn) {
            return [...new Set(arr)];
        }
        
        const seen = new Set();
        return arr.filter(item => {
            const key = keyFn(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },
    
    /**
     * Reverse array (invert dimension)
     */
    reverse(arr) {
        if (!Array.isArray(arr)) return [];
        return [...arr].reverse();
    },
    
    // ============================================================
    // LAYER 7: COMPLETION - Full Array as Unified Whole
    // ============================================================
    
    /**
     * Check if all elements satisfy predicate (universal truth)
     */
    all(arr, predicate) {
        if (!Array.isArray(arr)) return false;
        return arr.every((item, index) => predicate(item, index, arr));
    },
    
    /**
     * Check if any element satisfies predicate (existential truth)
     */
    any(arr, predicate) {
        if (!Array.isArray(arr)) return false;
        return arr.some((item, index) => predicate(item, index, arr));
    },
    
    /**
     * Check if array is empty (void dimension)
     */
    isEmpty(arr) {
        return !Array.isArray(arr) || arr.length === 0;
    },
    
    /**
     * Get array length (dimension size)
     */
    size(arr) {
        return Array.isArray(arr) ? arr.length : 0;
    },
    
    /**
     * Clone array (duplicate dimension)
     */
    clone(arr) {
        if (!Array.isArray(arr)) return [];
        return [...arr];
    },
    
    /**
     * Deep clone (recursive dimension duplication)
     */
    deepClone(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map(item => {
            if (Array.isArray(item)) return this.deepClone(item);
            if (item && typeof item === 'object') return { ...item };
            return item;
        });
    },
    
    // ============================================================
    // DIMENSIONAL OPERATIONS (Manifold Mathematics)
    // ============================================================
    
    /**
     * Map array to manifold coordinates
     * Each element gets (x, y, z) where z = x·y
     */
    toManifold(arr) {
        return this.map(arr, (item, index) => ({
            x: index,
            y: item,
            z: index * item, // Relation surface
            item
        }));
    },
    
    /**
     * Weight array by Fibonacci sequence
     * Applies dimensional weights to elements
     */
    fibonacciWeight(arr) {
        return this.map(arr, (item, index) => {
            const weight = this._fibonacci[index % this._fibonacci.length];
            return {
                item,
                weight,
                weighted: item * weight
            };
        });
    },
    
    /**
     * Apply golden ratio scaling
     * Scales elements by φ (phi) for natural proportions
     */
    goldenScale(arr) {
        return this.map(arr, (item, index) => {
            const scale = Math.pow(this._phi, index);
            return item * scale;
        });
    },
    
    /**
     * Dimensional distance between two arrays
     * Measures separation in n-dimensional space
     */
    distance(arr1, arr2) {
        const length = Math.min(arr1.length, arr2.length);
        let sumSquares = 0;
        
        for (let i = 0; i < length; i++) {
            const diff = arr1[i] - arr2[i];
            sumSquares += diff * diff;
        }
        
        return Math.sqrt(sumSquares);
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.ArraySubstrate = ArraySubstrate;
    console.log('✅ ArraySubstrate loaded - Dimensional array operations ready');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArraySubstrate;
}
