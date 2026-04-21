/**
 * Protocol 3.2 — Lens Composition Hardening
 * ButterflyFX™ / KensGames.com
 *
 * All four lens properties must hold for every registered lens:
 *   Pure      — same inputs → same output; no side effects, no I/O
 *   Read-only — substrate passed to lenses is frozen (throws on write in debug mode)
 *   Composable — composeLens(A, B)(substrate) === A(B(substrate)); associative
 *   Bounded   — each lens declares its coordinate domain; reads outside domain flagged
 *
 * Usage:
 *   import (or script-tag) this file before any substrate lens definitions.
 *
 * Registering a lens:
 *   LensRegistry.register('scoreLens', scoreLens, { domain: ['game.score.current'] });
 *
 * Composing lenses:
 *   const displayScore = LensRegistry.compose('displayLens', 'scoreLens');
 *   // displayScore.domain = union of both domains
 *
 * Debug mode (development only — set before loading):
 *   window.LENS_DEBUG = true;
 *   — Wraps substrate in Proxy that throws on write
 *   — Logs actual coordinate access and compares to declared domain
 *   — Flags domain violations to console
 *
 * Production mode: set window.LENS_DEBUG = false (or omit). Zero overhead.
 */

(function (global) {
  'use strict';

  const DEBUG = typeof global.LENS_DEBUG !== 'undefined'
    ? !!global.LENS_DEBUG
    : (typeof global.location !== 'undefined' && global.location.hostname === 'localhost');

  // ─── Domain violation log ──────────────────────────────────────────────────
  const _violations = [];

  function _flagViolation(lensName, accessedKey, declaredDomain) {
    const msg = `[LensRegistry] Domain violation — lens "${lensName}" accessed ` +
      `coordinate "${accessedKey}" not in declared domain [${declaredDomain.join(', ')}]`;
    console.warn(msg);
    _violations.push({ lensName, accessedKey, declaredDomain, ts: Date.now() });
  }

  // ─── Read-only proxy factory ───────────────────────────────────────────────
  // Creates a deep-path Proxy that throws on any set/delete and optionally
  // tracks property access for domain verification.
  function _freezeProxy(obj, lensName, declaredDomain, accessLog) {
    if (!obj || typeof obj !== 'object') return obj;
    return new Proxy(obj, {
      get(target, prop) {
        const val = target[prop];
        if (accessLog !== null) {
          accessLog.push(String(prop));
        }
        if (val && typeof val === 'object') {
          return _freezeProxy(val, lensName, declaredDomain, accessLog);
        }
        return val;
      },
      set(_, prop) {
        throw new TypeError(
          `[LensRegistry] Lens "${lensName}" attempted to write property "${String(prop)}" ` +
          `to the substrate. Lenses are read-only.`
        );
      },
      deleteProperty(_, prop) {
        throw new TypeError(
          `[LensRegistry] Lens "${lensName}" attempted to delete property "${String(prop)}" ` +
          `from the substrate. Lenses are read-only.`
        );
      }
    });
  }

  // ─── Lens wrapper (debug mode) ─────────────────────────────────────────────
  function _wrapLens(name, fn, domain) {
    const wrapped = function lensWrapper(substrate) {
      const accessLog = [];
      const guardedSubstrate = _freezeProxy(substrate, name, domain, accessLog);
      const result = fn(guardedSubstrate);
      // Check declared domain coverage
      if (domain && domain.length > 0) {
        for (const accessed of accessLog) {
          const inDomain = domain.some(d => d === accessed || d.startsWith(accessed + '.') || accessed.startsWith(d));
          if (!inDomain) {
            _flagViolation(name, accessed, domain);
          }
        }
      }
      return result;
    };
    wrapped.lensName = name;
    wrapped.domain = domain ? [...domain] : [];
    wrapped._isLens = true;
    return wrapped;
  }

  // ─── Lens wrapper (production mode) ───────────────────────────────────────
  function _wrapLensProd(name, fn, domain) {
    const wrapped = function lens(substrate) {
      return fn(substrate);
    };
    wrapped.lensName = name;
    wrapped.domain = domain ? [...domain] : [];
    wrapped._isLens = true;
    return wrapped;
  }

  // ─── LensRegistry ─────────────────────────────────────────────────────────
  const _registry = new Map();

  const LensRegistry = {
    /**
     * Register a lens.
     * @param {string} name - Unique lens identifier
     * @param {Function} fn - Pure lens function: (substrate) => value
     * @param {Object} [options]
     * @param {string[]} [options.domain] - Coordinate paths this lens reads
     */
    register(name, fn, options = {}) {
      if (_registry.has(name)) {
        console.warn(`[LensRegistry] Lens "${name}" already registered — overwriting.`);
      }
      if (typeof fn !== 'function') {
        throw new TypeError(`[LensRegistry] register("${name}"): fn must be a function`);
      }
      const domain = Array.isArray(options.domain) ? options.domain : [];
      const wrapped = DEBUG
        ? _wrapLens(name, fn, domain)
        : _wrapLensProd(name, fn, domain);
      _registry.set(name, wrapped);
      return wrapped;
    },

    /**
     * Retrieve a registered lens by name.
     * @param {string} name
     * @returns {Function}
     */
    get(name) {
      const lens = _registry.get(name);
      if (!lens) throw new ReferenceError(`[LensRegistry] Lens "${name}" not found.`);
      return lens;
    },

    /**
     * Compose two registered lenses: result(substrate) = lensA(lensB(substrate))
     * Composed lens domain = union of both domains.
     *
     * @param {string} nameA - Outer lens name (already registered)
     * @param {string} nameB - Inner lens name (already registered)
     * @param {string} [composedName] - Optional name to register the composed lens under
     * @returns {Function} Composed lens
     */
    compose(nameA, nameB, composedName) {
      const lensA = this.get(nameA);
      const lensB = this.get(nameB);
      return composeLens(lensA, lensB, composedName);
    },

    /** List all registered lens names */
    list() {
      return [..._registry.keys()];
    },

    /** Return all recorded domain violations (debug mode only) */
    violations() {
      return [..._violations];
    },

    /** Clear violations log */
    clearViolations() {
      _violations.length = 0;
    },

    /** Expose debug flag */
    debug: DEBUG
  };

  // ─── composeLens standalone function ──────────────────────────────────────
  /**
   * Compose two lens functions without requiring registry registration.
   * composeLens(A, B)(substrate) === A(B(substrate))
   *
   * @param {Function} lensA - Outer lens
   * @param {Function} lensB - Inner lens
   * @param {string}   [name] - Optional name for the composed lens
   * @returns {Function} Composed lens with merged domain
   */
  function composeLens(lensA, lensB, name) {
    if (typeof lensA !== 'function') throw new TypeError('[composeLens] lensA must be a function');
    if (typeof lensB !== 'function') throw new TypeError('[composeLens] lensB must be a function');

    const domainA = Array.isArray(lensA.domain) ? lensA.domain : [];
    const domainB = Array.isArray(lensB.domain) ? lensB.domain : [];
    const mergedDomain = [...new Set([...domainA, ...domainB])];
    const composedName = name || `${lensA.lensName || 'lensA'}∘${lensB.lensName || 'lensB'}`;

    const composed = function composedLens(substrate) {
      return lensA(lensB(substrate));
    };
    composed.lensName = composedName;
    composed.domain = mergedDomain;
    composed._isLens = true;

    return composed;
  }

  // ─── Exports ───────────────────────────────────────────────────────────────
  global.LensRegistry = LensRegistry;
  global.composeLens = composeLens;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LensRegistry, composeLens };
  }

})(typeof window !== 'undefined' ? window : global);
