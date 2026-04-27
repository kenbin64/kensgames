/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 FASTTRACK MANIFOLD LENS — game-side projection of the unified manifold
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Round 4 of the paradigm reversal. FastTrack's existing IIFE substrates
 * (auth_substrate, board_manifold, peg_substrate, …) are not rewritten here;
 * they keep working. This lens is the seam that lets any of them — or the
 * lobby client — read the unified field, drive the four-function loop, and
 * derive identity that matches what the lobby server derives.
 *
 *   client: window.FastTrackLens.observe(seed, intent)        ← four-function loop
 *           window.FastTrackLens.observeField(seed)           ← pure field view
 *           window.FastTrackLens.deriveCode(seed)             ← server-parity code
 *           window.FastTrackLens.intentFor(mode | action)     ← named intents
 *           window.FastTrackLens.wrap(name, substrate)        ← retrofit IIFEs
 *
 * The lens loads the unified Manifold (field + loop + seedLog) on either
 * runtime — Node for smoke tests, browser for the live game. It mirrors the
 * server's MODE_INTENT vectors so a 'private' bloom client-side and a
 * 'private' bloom server-side land at the same point.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(true);
  else root.FastTrackLens = factory(false);
})(typeof self !== 'undefined' ? self : this, function (isNode) {
  'use strict';

  // ── unified manifold pieces — field + loop + seedLog + codec ────────────
  function load(modName, globalName) {
    if (!isNode) {
      const w = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : globalThis);
      return w[globalName] || null;
    }
    try { return require('../js/' + modName); } catch (e) { return null; }
  }
  const Field = load('manifold-field.js', 'ManifoldField');
  const Loop = load('manifold-loop.js', 'ManifoldLoop');
  const SLog = load('manifold-seedlog.js', 'ManifoldSeedLog');
  const Codec = load('manifold-codec.js', 'ManifoldCodec');
  if (!Field || !Loop || !Codec) {
    // Soft-fail in production. The lens is additive; missing core ⇒ lens
    // exposes a no-op surface so callers can feature-detect.
    return { ready: false, missing: { Field: !Field, Loop: !Loop, Codec: !Codec } };
  }

  // ── mode + action intent vectors — must match server/manifold-projection ─
  const MODE_INTENT = {
    solo: [1, 0, 0, 0, 1, 1],
    private: [0, 1, 0, 0, 1, -1],
    join: [0, 0, 1, 0, 1, 0],
    auto: [0, 0, 0, 1, 1, 0],
    public: [0, 0, 0, 1, -1, 0],
  };
  // FastTrack-specific actions also bloom on the loop. Keep deliberately
  // sparse — each axis claims one rule the engine cares about.
  const ACTION_INTENT = {
    move: [1, 0, 0, 0, 0, 0],
    capture: [0, 1, 0, 0, 0, 0],
    enter_safe: [0, 0, 1, 0, 0, 0],
    finish_peg: [0, 0, 0, 1, 0, 0],
    draw_card: [0, 0, 0, 0, 1, 0],
    play_card: [0, 0, 0, 0, 0, 1],
  };
  function intentFor(name) {
    return (MODE_INTENT[name] || ACTION_INTENT[name] || ACTION_INTENT.move).slice();
  }

  // ── seed normalisation — accept array, {x,y,z}, or scalar ──────────────
  function toSeed(input) {
    if (Array.isArray(input)) return input.slice();
    if (input && typeof input === 'object' && 'seed' in input) return Array.isArray(input.seed) ? input.seed.slice() : [input.seed];
    if (input && typeof input === 'object' && typeof input.x === 'number') return [input.x, input.y || 0, input.z || 0];
    if (typeof input === 'number') return [input];
    return [0];
  }

  // ── the field-aware lens API — same shape as Round 3 SubstrateBase ─────
  function observeField(seedLike) {
    const seed = toSeed(seedLike);
    const point = Field.seedToPoint(seed);
    const value = Field.value(point.x, point.y, point.z);
    const grad = Field.grad(point.x, point.y, point.z);
    return { seed, point, value, gradient: grad, timestamp: Date.now() };
  }

  function observe(seedLike, intent) {
    const parent = (seedLike && seedLike.id && seedLike.dim != null)
      ? seedLike
      : { id: 'lens:' + Codec.idFromSeed(toSeed(seedLike)), parent: null, dim: 0, seed: toSeed(seedLike), t: Date.now(), meta: { kind: 'lens' } };
    return Loop.cycle(parent, intent || intentFor('move'));
  }

  // ── identity helpers — the server-parity bit ────────────────────────────
  const deriveCode = (seedOrSession) => {
    const seed = (seedOrSession && seedOrSession.seed) ? seedOrSession.seed : toSeed(seedOrSession);
    return Codec.codeFromSeed(seed);
  };
  const deriveId = (seedOrSession) => {
    const seed = (seedOrSession && seedOrSession.seed) ? seedOrSession.seed : toSeed(seedOrSession);
    return Codec.idFromSeed(seed);
  };
  function verifyCode(seedOrSession, expectedCode) {
    return deriveCode(seedOrSession) === String(expectedCode || '').toUpperCase();
  }

  // ── retrofit existing FastTrack IIFE substrates ─────────────────────────
  // Adds field-aware methods to any plain object substrate without touching
  // its source. The original methods stay; observeField / observe / cycle
  // become available on the wrapped instance. Idempotent.
  function wrap(name, substrate) {
    if (!substrate || substrate.__lensWrapped) return substrate;
    Object.defineProperty(substrate, '__lensWrapped', { value: true, enumerable: false });
    substrate.observeField = function (seedLike) { return observeField(seedLike || name); };
    substrate.observe = function (seedLike, intent) { return observe(seedLike || name, intent); };
    substrate.deriveCode = function (seedLike) { return deriveCode(seedLike || name); };
    substrate.deriveId = function (seedLike) { return deriveId(seedLike || name); };
    substrate._lensName = name;
    return substrate;
  }

  // ── opt-in seed log binding (game session lifecycle, optional) ──────────
  let _log = null;
  function bindLog(logOrPath) {
    if (logOrPath && typeof logOrPath === 'object' && typeof logOrPath.append === 'function') { _log = logOrPath; return _log; }
    if (typeof logOrPath === 'string' && SLog && SLog.file) { _log = SLog.file(logOrPath); return _log; }
    if (SLog && SLog.memory) { _log = SLog.memory(); return _log; }
    return null;
  }
  function appendBloom(parentSeedOrX, intent, meta) {
    if (!_log) bindLog();
    const r = observe(parentSeedOrX, intent);
    if (meta) r.x.meta = Object.assign({}, r.x.meta || {}, meta);
    if (_log) _log.append(r.x);
    return r.x;
  }

  return {
    ready: true,
    Field, Loop, SLog, Codec,
    MODE_INTENT, ACTION_INTENT,
    intentFor, toSeed,
    observeField, observe,
    deriveCode, deriveId, verifyCode,
    wrap,
    bindLog, appendBloom,
    get log() { return _log; },
  };
});
