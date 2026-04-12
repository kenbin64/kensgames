/**
 * Universal Substrate — JavaScript Implementation
 * ButterflyFX Dimensional Computing Framework
 *
 * Coordinate-first architecture: resources are never stored, only coordinates.
 * Invoke a coordinate → resource manifests → resource evaporates (unless persist=true).
 *
 * See: docs/UNIVERSAL_CONNECTOR_BLUEPRINT.md
 *
 * Copyright (c) 2024-2026 Kenneth Bingham
 * Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)
 */

'use strict';

// ── Resolver Type Constants (Fibonacci y-values) ──────────────────────────────
const RESOLVER = Object.freeze({
    LOCAL_DISK:  1,
    LOCAL_CACHE: 2,
    SW_CACHE:    3,
    HTTP:        5,
    PEER:        8,
    COMPUTE:     13
});

// ── Layer Constants (7-Layer Genesis Model) ───────────────────────────────────
const LAYER = Object.freeze({
    SPARK:      1,   // lift      — coordinate declared
    MIRROR:     2,   // map       — resolver assigned
    RELATION:   3,   // bind      — z = x·y computed
    FORM:       4,   // navigate  — resolver routed
    LIFE:       5,   // transform — resource fetched
    MIND:       6,   // merge     — resource assembled
    COMPLETION: 7    // resolve   — resource delivered
});

// ── Lineage Node ──────────────────────────────────────────────────────────────
class LineageNode {
    constructor(op, coordId, detail = {}) {
        this.op        = op;
        this.coordId   = coordId;
        this.timestamp = Date.now();
        this.detail    = detail;
        this.children  = [];
    }
    addChild(node) { this.children.push(node); return node; }
    explain(indent = 0) {
        const pad = '  '.repeat(indent);
        let out = `${pad}[${this.op}] ${this.coordId} @ ${new Date(this.timestamp).toISOString()}\n`;
        if (Object.keys(this.detail).length)
            out += `${pad}  ${JSON.stringify(this.detail)}\n`;
        for (const c of this.children) out += c.explain(indent + 1);
        return out;
    }
}

// ── Universal Coordinate ──────────────────────────────────────────────────────
class UniversalCoordinate {
    /**
     * @param {object} descriptor
     * @param {string} descriptor.id       — stable resource ID
     * @param {string} [descriptor.version] — semver / asset version
     * @param {boolean} [descriptor.persist] — cache after release (default: false)
     * @param {number|null} [descriptor.ttl] — cache lifetime ms (null = indefinite)
     */
    constructor(descriptor) {
        this.id      = descriptor.id;
        this.version = descriptor.version || 'v1';
        this.persist = descriptor.persist === true;
        this.ttl     = descriptor.ttl ?? null;
        this.layer   = LAYER.SPARK;
        this.spiral  = 0;
        this.x       = this._hashId(this.id + '@' + this.version);
        this.y       = 0;       // set by map()
        this.z       = 0;       // set by bind()
        this.uri     = null;    // set by map()
        this.resolverType = null;
        this.lineage = new LineageNode('lift', this.id, { version: this.version });
    }

    _hashId(str) {
        // Simple djb2 hash → positive float in (0, 1)
        let h = 5381;
        for (let i = 0; i < str.length; i++)
            h = ((h << 5) + h) ^ str.charCodeAt(i);
        return ((h >>> 0) % 100000) / 100000 + 0.00001;
    }

    computeZ() { return this.x * this.y; }

    spiralUp()   { this.layer = LAYER.SPARK;      this.spiral++; }
    spiralDown()  { this.layer = LAYER.COMPLETION; this.spiral = Math.max(0, this.spiral - 1); }

    toJSON() {
        return { id: this.id, version: this.version, layer: this.layer,
                 spiral: this.spiral, x: this.x, y: this.y, z: this.z,
                 uri: this.uri, persist: this.persist, ttl: this.ttl,
                 resolverType: this.resolverType };
    }

    static fromJSON(obj) {
        const c = new UniversalCoordinate(obj);
        Object.assign(c, obj);
        return c;
    }
}

// ── Manifold Resolution Error ─────────────────────────────────────────────────
class ManifoldResolutionError extends Error {
    constructor(coord, tried) {
        super(`[UniversalSubstrate] Cannot resolve coordinate '${coord.id}' (tried: ${tried.join(', ')})`);
        this.name = 'ManifoldResolutionError';
        this.coord = coord;
        this.tried = tried;
    }
}

// ── Universal Substrate ───────────────────────────────────────────────────────
class UniversalSubstrate {
    constructor() {
        this._registry  = new Map();   // id → UniversalCoordinate
        this._cache     = new Map();   // z  → { resource, expires }
        this._resolvers = new Map();   // resolverType (string) → async fn(uri) → resource

        // Register built-in resolvers
        this._registerBuiltins();
    }

    // ── Lifecycle: Layer 1 — Spark ──────────────────────────────────────────
    /**
     * Declare a coordinate. Resource does not yet exist.
     * @param {object} descriptor
     * @returns {UniversalCoordinate}
     */
    lift(descriptor) {
        const coord = new UniversalCoordinate(descriptor);
        coord.layer = LAYER.SPARK;
        return coord;
    }

    // ── Lifecycle: Layer 2 — Mirror ─────────────────────────────────────────
    /**
     * Assign resolver type and URI. Positions coordinate on the manifold.
     * @param {UniversalCoordinate} coord
     * @param {string} resolverType   — key from RESOLVER constants
     * @param {string} uri            — fetch target (path, URL, peer addr, compute fn name)
     * @returns {UniversalCoordinate}
     */
    map(coord, resolverType, uri) {
        coord.resolverType = resolverType;
        coord.y   = RESOLVER[resolverType.toUpperCase().replace('-', '_')] || 5;
        coord.uri = uri;
        coord.layer = LAYER.MIRROR;
        coord.lineage.addChild(new LineageNode('map', coord.id, { resolverType, uri, y: coord.y }));
        return coord;
    }

    // ── Lifecycle: Layer 3 — Relation ───────────────────────────────────────
    /**
     * Compute z = x · y. Register coordinate in substrate registry.
     * @param {UniversalCoordinate} coord
     * @returns {UniversalCoordinate}
     */
    bind(coord) {
        coord.z = coord.computeZ();
        coord.layer = LAYER.RELATION;
        this._registry.set(coord.id, coord);
        coord.lineage.addChild(new LineageNode('bind', coord.id, { z: coord.z }));
        return coord;
    }

    // ── Lifecycle: Layers 4–7 — Form → Completion ──────────────────────────
    /**
     * Invoke a coordinate — manifest the resource.
     * Resolution priority: local-cache → local-disk → sw-cache → http → peer → compute
     * @param {UniversalCoordinate} coord
     * @returns {Promise<any>} the manifested resource
     */
    async invoke(coord) {
        coord.layer = LAYER.FORM;
        const tried = [];

        // 1. local-cache (fastest)
        const cached = this._fromCache(coord);
        if (cached !== undefined) {
            coord.layer = LAYER.COMPLETION;
            coord.lineage.addChild(new LineageNode('resolve', coord.id, { via: 'local-cache' }));
            return cached;
        }

        // 2. Attempt resolvers in priority order
        const priority = ['local-disk', 'sw-cache', 'http', 'peer', 'compute'];
        let resource;
        let usedResolver = null;

        for (const type of priority) {
            if (!this._resolvers.has(type)) continue;
            // skip if coord's primary resolver is a different type and no uri for this
            if (type !== coord.resolverType && type !== 'local-cache') {
                // allow fallback only for http if uri looks like URL
                if (type === 'http' && coord.uri && !coord.uri.startsWith('http')) continue;
                if (type === 'local-disk' && coord.uri && coord.uri.startsWith('http')) continue;
            }
            tried.push(type);
            try {
                coord.layer = LAYER.LIFE;
                resource = await this._resolvers.get(type)(coord.uri, coord);
                usedResolver = type;
                break;
            } catch (_) {
                // try next resolver
            }
        }

        if (resource === undefined) throw new ManifoldResolutionError(coord, tried);

        // transform → resolve
        coord.layer = LAYER.COMPLETION;
        coord.lineage.addChild(new LineageNode('resolve', coord.id, { via: usedResolver }));

        // cache-as-fallback: if primary resolver was unavailable, persist to cache
        if (usedResolver !== coord.resolverType && coord.persist) {
            this._toCache(coord, resource);
        } else if (coord.persist) {
            this._toCache(coord, resource);
        }

        return resource;
    }

    // ── Lifecycle: Layer 7 — Completion / Release ───────────────────────────
    /**
     * Release the resource. If persist=false, evict from memory.
     * Coordinate remains — re-invocation is always possible.
     * @param {UniversalCoordinate} coord
     */
    release(coord) {
        if (!coord.persist) this.evict(coord);
        coord.layer = LAYER.SPARK;   // reset to Layer 1 — re-invocable
        coord.lineage.addChild(new LineageNode('release', coord.id, { persist: coord.persist }));
    }

    // ── Resolver Registry ───────────────────────────────────────────────────
    /**
     * Register a custom resolver.
     * @param {string} type  — e.g. 'http', 'local-disk', 'compute'
     * @param {Function} fn  — async (uri, coord) => resource
     */
    registerResolver(type, fn) { this._resolvers.set(type, fn); }
    getResolver(type)          { return this._resolvers.get(type); }

    // ── Coordinate Registry ─────────────────────────────────────────────────
    register(coord)   { this._registry.set(coord.id, coord); }
    lookup(id)        { return this._registry.get(id) ?? null; }
    lookupByZ(z)      { for (const c of this._registry.values()) if (c.z === z) return c; return null; }

    // ── Cache Management ────────────────────────────────────────────────────
    cache(coord, resource)  { this._toCache(coord, resource); }
    evict(coord)            { this._cache.delete(coord.z); }
    isCached(coord)         { return this._fromCache(coord) !== undefined; }

    _toCache(coord, resource) {
        const expires = coord.ttl ? Date.now() + coord.ttl : null;
        this._cache.set(coord.z, { resource, expires });
    }
    _fromCache(coord) {
        const entry = this._cache.get(coord.z);
        if (!entry) return undefined;
        if (entry.expires && Date.now() > entry.expires) { this._cache.delete(coord.z); return undefined; }
        return entry.resource;
    }

    // ── Lineage ─────────────────────────────────────────────────────────────
    trace(coord)   { return coord.lineage; }
    explain(coord) { return coord.lineage.explain(); }

    // ── Built-in Resolvers ──────────────────────────────────────────────────
    _registerBuiltins() {
        // HTTP resolver (browser + Node.js)
        this.registerResolver('http', async (uri) => {
            const response = await fetch(uri);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${uri}`);
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) return response.json();
            if (ct.includes('text/'))            return response.text();
            return response.arrayBuffer();
        });

        // SW Cache resolver (browser only)
        this.registerResolver('sw-cache', async (uri) => {
            if (typeof caches === 'undefined') throw new Error('SW cache not available');
            const cache = await caches.open('universal-substrate-v1');
            const hit   = await cache.match(uri);
            if (!hit) throw new Error(`SW cache miss: ${uri}`);
            return hit.arrayBuffer();
        });

        // Compute resolver — uri is a function name registered in compute registry
        this._computeRegistry = new Map();
        this.registerResolver('compute', async (uri, coord) => {
            const fn = this._computeRegistry.get(uri);
            if (!fn) throw new Error(`No compute function '${uri}'`);
            return fn(coord);
        });
    }

    /**
     * Register a compute function for the 'compute' resolver.
     * @param {string} name
     * @param {Function} fn  — async (coord) => resource
     */
    registerCompute(name, fn) { this._computeRegistry.set(name, fn); }
}

// ── Module exports ─────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UniversalSubstrate, UniversalCoordinate, LineageNode,
                       ManifoldResolutionError, RESOLVER, LAYER };
} else if (typeof window !== 'undefined') {
    window.UniversalSubstrate  = UniversalSubstrate;
    window.UniversalCoordinate = UniversalCoordinate;
    window.LineageNode         = LineageNode;
    window.ManifoldResolutionError = ManifoldResolutionError;
    window.RESOLVER = RESOLVER;
    window.LAYER    = LAYER;
}

