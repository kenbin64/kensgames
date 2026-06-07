/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD KERNEL — the one thing everything collapses to
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The dimensional-programming move is to collapse to ONE. So the engine is not a
 * harness AND a compiler AND an adapter AND a set of lenses — it is two verbs,
 * and every one of those tools is just those two verbs with different arguments:
 *
 *     collapse(x, ys, step)  →  z        // z = x·y·y·…   (multiply / fold to a point)
 *     expand(z, lens)        →  artifact // z → manifestation   (divide / invoke)
 *
 *   • the harness            = collapse (+ append) ; reject = step returns input
 *   • the folder compiler    = collapse over files, then expand to an artifact
 *   • the FastTrack adapter   = collapse over actions, then expand to the board
 *   • every artifact type    = a different `lens` passed to the SAME expand
 *
 * collapse keeps a hash-chained record of its y-stream, so the one fold is also
 * reproducible, auditable, and tamper-evident — those are properties of the
 * verb, not separate features. Nothing else needs to exist.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

(function (root, factory) {
  const codec = (typeof require === 'function') ? require('./manifold-codec.js') : (root && root.ManifoldCodec);
  const mod = factory(codec);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.ManifoldKernel = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (codec) {

  const canon = (v) => JSON.stringify(v === undefined ? null : v);
  const eq = (a, b) => canon(a) === canon(b);
  const _fnv = (s) => { let h = 0x811c9dc5 >>> 0; const t = String(s); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0'); };
  const hash = (s) => (codec && codec.idFromSeed) ? codec.idFromSeed(String(s)) : _fnv(s);

  // ── COLLAPSE  (z = x · y · y · …) — the one fold ───────────────────────────
  // x: the seed/identity (or a thunk producing the initial z).
  // ys: the ordered y-stream (actions, files, anything).
  // step(z, y): pure; return a NEW z to accept, the SAME z to reject.
  // Returns { z, log, head } — the point, its hash-chained ancestry, and the root.
  function collapse(x, ys, step) {
    let z = (typeof x === 'function') ? x() : x;
    const log = [];
    let head = hash('genesis|' + canon((typeof x === 'function') ? z : x));
    for (const y of (ys || [])) {
      const next = step(z, y);
      if (eq(next, z)) continue;                 // rejected → never recorded
      head = hash(head + '|' + canon(y) + '|' + canon(next));
      log.push({ y, hash: head });
      z = next;
    }
    return { z, log, head };
  }

  // ── EXPAND  (z → artifact) — the one projection ────────────────────────────
  // Every artifact type (manifest, image, board, db, video) is just a different
  // `lens`. The verb does not change; only the lens does.
  function expand(z, lens, ctx) {
    if (typeof lens !== 'function') throw new Error('ManifoldKernel.expand: lens(z, ctx) required');
    return lens(z, ctx);
  }

  return { collapse, expand, hash, canon, version: '0.1.0' };
});
