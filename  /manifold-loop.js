/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD LOOP — observe → solve → collapse → bloom
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   observe(x)        — map x to a field coordinate; read value, grad, neighbors
 *   solve(obs, intent) → y   — derive operator from manifold attributes for x
 *   collapse(x, y)    → z    — z = x · y   (the algebraic result)
 *   bloom(parent, y, z) → x' — x' = y / z  (next-dimension seed, componentwise)
 *
 * y is FOUND, not given: it is grad(x) modulated by intent and damped by
 * field magnitude. The manifold reveals; the loop closes.
 *
 * Pure functions; optional log handle for bloom persistence. Loadable in
 * browser (window.ManifoldLoop) and Node (module.exports).
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  'use strict';
  const L = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (root) root.ManifoldLoop = L;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  function getField() {
    if (typeof window !== 'undefined' && window.ManifoldField) return window.ManifoldField;
    if (typeof globalThis !== 'undefined' && globalThis.ManifoldField) return globalThis.ManifoldField;
    if (typeof require === 'function') { try { return require('./manifold-field.js'); } catch (e) { } }
    return null;
  }

  const FIELD = getField();
  const PHI = (FIELD && FIELD.PHI) || ((1 + Math.sqrt(5)) / 2);

  // Deterministic 8-char hex id (FNV-1a over the contributing parts).
  function _hash() {
    let h = 0x811c9dc5;
    const s = Array.prototype.map.call(arguments, function (p) { return JSON.stringify(p); }).join('|');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function _seedOf(x) {
    if (Array.isArray(x)) return x.slice();
    if (x && Array.isArray(x.seed)) return x.seed.slice();
    if (typeof x === 'number') return [x];
    return [0];
  }
  function _idOf(x) { return (x && x.id) ? x.id : _hash('x', _seedOf(x), (x && x.parent) || null); }
  function _dimOf(x) { return (x && typeof x.dim === 'number') ? x.dim : 0; }

  // ── observe ───────────────────────────────────────────────────────────────
  function observe(x, opts) {
    if (!FIELD) throw new Error('ManifoldLoop: ManifoldField not loaded');
    const seed = _seedOf(x);
    const p = FIELD.seedToPoint(seed);
    const t = (opts && opts.t != null) ? opts.t : 0.5;
    const r = (opts && opts.r != null) ? opts.r : 0.5;
    const n = (opts && opts.n != null) ? opts.n : 8;
    return {
      x: x,
      id: _idOf(x),
      dim: _dimOf(x),
      seed: seed,
      point: p,
      value: FIELD.value(p.x, p.y, p.z, t),
      grad: FIELD.grad(p.x, p.y, p.z, t),
      neighbors: FIELD.neighbors(p.x, p.y, p.z, r, n, t),
    };
  }

  // ── solve ─────────────────────────────────────────────────────────────────
  // y is the operator the manifold reveals for x. Same arity as the seed.
  // Components mix grad through a golden rotation so y is well-defined for
  // seeds of any length. Damped by 1/(1+|value|): calmer field → stronger y.
  function solve(obs, intent) {
    const seed = obs.seed;
    const g = obs.grad, v = obs.value;
    const damp = 1 / (1 + Math.abs(v));
    const intentVec = Array.isArray(intent) ? intent : null;
    const len = seed.length;
    const y = new Array(len);
    for (let i = 0; i < len; i++) {
      const ii = intentVec ? (+intentVec[i % intentVec.length] || 0) : 1;
      const mix = g.x * Math.cos(i * PHI)
        + g.y * Math.sin(i * PHI)
        + g.z * Math.cos(i / PHI);
      y[i] = ii * damp * mix;
    }
    return y;
  }

  // ── collapse ──────────────────────────────────────────────────────────────
  // z = x · y. Two faces of the same act:
  //   scalar = Σ x_i y_i   — the algebraic z
  //   vec    = x_i y_i     — componentwise, used by bloom
  function collapse(x, y) {
    const seed = _seedOf(x);
    const len = Math.min(seed.length, y.length);
    const vec = new Array(len);
    let scalar = 0;
    for (let i = 0; i < len; i++) {
      const v = seed[i] * y[i];
      vec[i] = v;
      scalar += v;
    }
    return { scalar: scalar, vec: vec };
  }

  // ── bloom ─────────────────────────────────────────────────────────────────
  // x' = y / z, where z is the SCALAR collapse (z = Σ x_i y_i). Dividing the
  // operator y by the scalar agreement preserves the direction the manifold
  // revealed and scales it inversely by how strongly x agreed with it:
  //   strong agreement (|z| large) → small next step (settled)
  //   weak   agreement (|z| small) → large next step (exploring)
  // Componentwise z (vec) is kept on the collapse object for inspection but
  // is intentionally NOT used here — that path algebraically cancels y.
  function bloom(parent, y, z) {
    const denom = z.scalar;
    const safe = (Math.abs(denom) < 1e-12) ? 1e-12 * (denom < 0 ? -1 : 1) : denom;
    const seed = new Array(y.length);
    for (let i = 0; i < y.length; i++) seed[i] = y[i] / safe;
    const parentId = _idOf(parent);
    const dim = _dimOf(parent) + 1;
    return {
      id: _hash('x', seed, parentId, dim),
      parent: parentId,
      dim: dim,
      seed: seed,
      t: Date.now(),
    };
  }

  // ── cycle ─────────────────────────────────────────────────────────────────
  // One full observe → solve → collapse → bloom turn. If a log handle is
  // supplied, the bloomed seed is appended (fire-and-forget).
  function cycle(x, intent, log, opts) {
    const obs = observe(x, opts);
    const y = solve(obs, intent);
    const z = collapse(x, y);
    const xp = bloom(x, y, z);
    if (log && typeof log.append === 'function') log.append(xp);
    return { obs: obs, y: y, z: z, x: xp };
  }

  return { observe: observe, solve: solve, collapse: collapse, bloom: bloom, cycle: cycle };
});
