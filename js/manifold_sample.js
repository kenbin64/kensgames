/**
 * ═══════════════════════════════════════════════════════════════════════
 * MANIFOLD SAMPLE  —  js/manifold_sample.js
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The single shared substrate entry point for every system in a game or app:
 * logic, UI/UX, audio, VFX, camera, and AI all read from one call.
 *
 *   const s = Manifold.sample({ x: 0.4, y: 0.7 });
 *   // → ManifoldSample { x, y, z, f1, f2, G, region, intensity,
 *   //                    theme, aiMode, logic, ui, audio, ai }
 *
 * Reactive pattern — wire all systems once, then drive them from the game loop:
 *   Manifold.subscribe(sample => {
 *     audioSubstrate.apply(sample.audio);
 *     uiSubstrate.apply(sample.ui);
 *     aiRouter.apply(sample.ai);
 *   });
 *   // Each frame / screen transition / context change:
 *   Manifold.update({ x: progression, y: tension });
 *
 * ── Manifold axioms ───────────────────────────────────────────────────
 *   Manifold = Expression + Attributes + Substrate
 *   z  = x · y        — dimension axiom (integer coords in manifold.game.json)
 *   f1 = x · y        — interaction density / complexity (normalized 0..1)
 *   f2 = x · y²       — non-linear intensity / urgency projection
 *   G(x,y,z) = cos(x·τ)cos(y·τ)cos(z·τ) − sin(x·τ)sin(y·τ)sin(z·τ)
 *                     — Schwarz Diamond field (TPMS implicit surface)
 *     |G| → 0  : on the surface boundary — highest fork / render priority
 *     |G| → 1  : deep inside a channel  — lowest priority
 *
 * ── Gyroid semantic lattice ──────────────────────────────────────────
 *   Nine nodes anchor the (x, y) unit square.  Systems read from whichever
 *   node is nearest (strings) or blend across all nodes (numbers) using
 *   inverse-distance weighting.  Add or move nodes to tune game feel without
 *   touching any substrate.
 *
 * ── Substrate outputs ────────────────────────────────────────────────
 *   logic  : spawnRate, difficulty, featureFlags, forkPriority
 *   ui     : layoutDensity, animSpeed, colorScheme, glowIntensity
 *   audio  : musicMode, sfxDensity, notifyStyle, masterVolume
 *   ai     : modelSize, temperature, cacheHint, promptStyle
 *
 * ── Load order ────────────────────────────────────────────────────────
 *   Load BEFORE manifold_bridge.js (bridge will delegate to Manifold.update
 *   on setDimension commands if this file is present).
 *   Load BEFORE any substrate that calls Manifold.sample().
 * ═══════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  // ─── Gyroid semantic lattice ─────────────────────────────────────────────
  //
  // Each node is a semantic anchor in the normalized (x, y) unit square:
  //   x = progression / depth  (0 = start, 1 = end / peak complexity)
  //   y = intensity / tension  (0 = calm,  1 = crisis / max urgency)
  //
  // Numeric fields are IDW-blended; string fields use nearest-neighbor.
  // To tune game feel: adjust intensity, spawnRate, theme, aiMode per node.

  const LATTICE = [
    //            x    y   region       intensity  theme       aiMode        spawnRate  musicMode
    { x: 0.0, y: 0.0, region: 'idle', intensity: 0.00, theme: 'ambient', aiMode: 'cached', spawnRate: 0.00, musicMode: 'ambient' },
    { x: 0.5, y: 0.0, region: 'opening', intensity: 0.15, theme: 'default', aiMode: 'reactive', spawnRate: 0.15, musicMode: 'casual' },
    { x: 1.0, y: 0.0, region: 'opening', intensity: 0.25, theme: 'default', aiMode: 'reactive', spawnRate: 0.25, musicMode: 'casual' },
    { x: 0.0, y: 0.5, region: 'midgame', intensity: 0.45, theme: 'default', aiMode: 'deliberate', spawnRate: 0.45, musicMode: 'active' },
    { x: 0.5, y: 0.5, region: 'midgame', intensity: 0.55, theme: 'tension', aiMode: 'deliberate', spawnRate: 0.55, musicMode: 'tension' },
    { x: 1.0, y: 0.5, region: 'midgame', intensity: 0.65, theme: 'tension', aiMode: 'aggressive', spawnRate: 0.65, musicMode: 'tension' },
    { x: 0.0, y: 1.0, region: 'endgame', intensity: 0.75, theme: 'danger', aiMode: 'aggressive', spawnRate: 0.75, musicMode: 'climax' },
    { x: 0.5, y: 1.0, region: 'crisis', intensity: 0.90, theme: 'danger', aiMode: 'aggressive', spawnRate: 0.90, musicMode: 'climax' },
    { x: 1.0, y: 1.0, region: 'crisis', intensity: 1.00, theme: 'victory', aiMode: 'aggressive', spawnRate: 1.00, musicMode: 'climax' },
  ];

  // ─── Math ────────────────────────────────────────────────────────────────

  const TAU = 2 * Math.PI;

  /**
   * Schwarz Diamond implicit surface field.
   * G ≈ 0 → on the surface boundary (highest priority).
   * G ≈ ±1 → deep channel interior (lowest priority).
   *
   * @param {number} x  normalized 0..1
   * @param {number} y  normalized 0..1
   * @param {number} z  normalized 0..1  (pass f2 = x·y² for standard use)
   * @returns {number}  field value in [−1, 1]
   */
  function schwarzDiamond(x, y, z) {
    const wx = x * TAU, wy = y * TAU, wz = z * TAU;
    return (
      Math.cos(wx) * Math.cos(wy) * Math.cos(wz) -
      Math.sin(wx) * Math.sin(wy) * Math.sin(wz)
    );
  }

  /**
   * Inverse-distance weighting over all lattice nodes — numeric fields only.
   * power = 2 gives smooth "bowl" interpolation between nodes.
   *
   * @param {number} nx    query x
   * @param {number} ny    query y
   * @param {string} field lattice node property name (must be numeric)
   * @param {number} power IDW exponent (default 2)
   * @returns {number}
   */
  function idw(nx, ny, field, power) {
    power = power || 2;
    var sumW = 0, sumV = 0;
    for (var i = 0; i < LATTICE.length; i++) {
      var node = LATTICE[i];
      var dx = nx - node.x, dy = ny - node.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 1e-9) return node[field]; // exact hit
      var w = 1 / Math.pow(d2, power * 0.5);
      sumW += w;
      sumV += w * node[field];
    }
    return sumV / sumW;
  }

  /**
   * Nearest-neighbor lookup — string fields.
   *
   * @param {number} nx    query x
   * @param {number} ny    query y
   * @param {string} field lattice node property name
   * @returns {string}
   */
  function nearest(nx, ny, field) {
    var bestD = Infinity, bestV = LATTICE[0][field];
    for (var i = 0; i < LATTICE.length; i++) {
      var node = LATTICE[i];
      var dx = nx - node.x, dy = ny - node.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; bestV = node[field]; }
    }
    return bestV;
  }

  // ─── Core sample function ─────────────────────────────────────────────────

  /**
   * Compute a complete ManifoldSample from a context object.
   *
   * Pure function — does NOT update shared state or fire subscribers.
   * Use Manifold.update(ctx) to do both.
   *
   * @param {object} ctx
   * @param {number}  ctx.x      primary axis, normalized 0..1
   *                             games:  progression, turn fraction, depth
   *                             apps:   journey stage, feature depth
   * @param {number}  ctx.y      intensity axis, normalized 0..1
   *                             games:  tension, difficulty, urgency
   *                             apps:   intent strength, context weight
   * @param {number} [ctx.z]     override derived z (default = f2 = x·y²)
   * @param {object} [ctx.logic] merge into logic substrate output
   * @param {object} [ctx.ui]    merge into ui substrate output
   * @param {object} [ctx.audio] merge into audio substrate output
   * @param {object} [ctx.ai]    merge into ai substrate output
   *
   * @returns {ManifoldSample}
   */
  function sample(ctx) {
    ctx = ctx || {};

    // ── Clamp coordinates to [0, 1] ──────────────────────────────────────
    var x = Math.max(0, Math.min(1, ctx.x || 0));
    var y = Math.max(0, Math.min(1, ctx.y || 0));

    // ── Derived fields ────────────────────────────────────────────────────
    var f1 = x * y;          // interaction density / complexity
    var f2 = x * y * y;      // non-linear intensity projection (z = x·y²)
    var z = ctx.z !== undefined ? ctx.z : f2;

    // Schwarz Diamond field at this coordinate
    var G = schwarzDiamond(x, y, z);
    var surfaceProximity = 1 - Math.abs(G);  // 1 = on surface, 0 = deep channel

    // ── Lattice interpolation ─────────────────────────────────────────────
    var intensity = idw(x, y, 'intensity');
    var spawnRate = idw(x, y, 'spawnRate');
    var region = nearest(x, y, 'region');
    var theme = nearest(x, y, 'theme');
    var aiMode = nearest(x, y, 'aiMode');
    var musicMode = nearest(x, y, 'musicMode');

    // ── Logic substrate ───────────────────────────────────────────────────
    //    Drives: spawn systems, difficulty curves, feature flags, AI trees
    var logic = _merge({
      spawnRate: spawnRate,
      difficulty: f2,
      forkPriority: surfaceProximity,   // higher near G=0 — use for Dijkstra ordering
      featureFlags: {
        highDetail: surfaceProximity > 0.7,
        showCrowds: x > 0.3,
        enableCombo: f1 > 0.2,
      },
    }, ctx.logic);

    // ── UI/UX substrate ───────────────────────────────────────────────────
    //    Drives: layout density, animation speed, color themes, glow FX
    var ui = _merge({
      layoutDensity: f1,
      animSpeed: 0.5 + f2 * 1.5,   // range 0.5x (calm) → 2.0x (crisis)
      colorScheme: theme,
      glowIntensity: surfaceProximity,
      panelOpacity: 0.6 + f2 * 0.35,
    }, ctx.ui);

    // ── Audio substrate ───────────────────────────────────────────────────
    //    Drives: music mode, SFX density, notification style, master volume
    var audio = _merge({
      musicMode: musicMode,
      sfxDensity: f1,
      notifyStyle: intensity < 0.35 ? 'subtle'
        : intensity < 0.70 ? 'normal'
          : 'urgent',
      masterVolume: 0.40 + f2 * 0.55,  // range 0.40 → 0.95
    }, ctx.audio);

    // ── AI substrate ─────────────────────────────────────────────────────
    //    Drives: model selection, temperature, caching, prompt style
    //    Key insight: use small/cached models in low-novelty (low f2) regions
    //    to reduce GPU/TPU load without degrading perceived quality.
    var ai = _merge({
      modelSize: f2 < 0.25 ? 'small'
        : f2 < 0.65 ? 'medium'
          : 'large',
      temperature: 0.30 + f2 * 0.65,   // range 0.30 (deterministic) → 0.95 (creative)
      cacheHint: f2 < 0.30,           // true = safe to return cached response
      maxTokens: f2 < 0.25 ? 128
        : f2 < 0.65 ? 256
          : 512,
      promptStyle: aiMode,              // 'cached' | 'reactive' | 'deliberate' | 'aggressive'
    }, ctx.ai);

    return {
      // Raw coordinates
      x: x,
      y: y,
      z: z,

      // Derived fields
      f1: f1,               // x·y    — interaction density
      f2: f2,               // x·y²   — non-linear intensity

      // Surface field
      G: G,                           // Schwarz Diamond value [−1, 1]
      surfaceProximity: surfaceProximity, // 0 = deep channel, 1 = on surface

      // Semantic region (from lattice)
      region: region,    // 'idle' | 'opening' | 'midgame' | 'endgame' | 'crisis'
      intensity: intensity, // 0..1 blended
      theme: theme,     // 'ambient' | 'default' | 'tension' | 'danger' | 'victory'
      aiMode: aiMode,    // 'cached' | 'reactive' | 'deliberate' | 'aggressive'

      // Substrate outputs
      logic: logic,
      ui: ui,
      audio: audio,
      ai: ai,
    };
  }

  // ─── Reactive shared state ────────────────────────────────────────────────

  var _current = null;
  var _subscribers = [];

  // ─── Public API ───────────────────────────────────────────────────────────

  var Manifold = {

    /**
     * Compute a sample without updating shared state.
     * Use for one-off queries (e.g. pre-rendering a UI preview).
     *
     * @param {object} ctx
     * @returns {ManifoldSample}
     */
    sample: sample,

    /**
     * Compute a sample, store it as current, and notify all subscribers.
     *
     * Call this:
     *   - each game frame (pass live progression / tension)
     *   - on every screen transition
     *   - on major user actions (context changes)
     *
     * @param {object} ctx  — same shape as sample(ctx)
     * @returns {ManifoldSample}
     */
    update: function (ctx) {
      _current = sample(ctx);
      for (var i = 0; i < _subscribers.length; i++) {
        try { _subscribers[i](_current); }
        catch (e) { console.error('[Manifold] subscriber error:', e); }
      }
      return _current;
    },

    /**
     * Subscribe to all future Manifold.update() calls.
     *
     * Pattern — wire once at init, then just call Manifold.update() per frame:
     *
     *   Manifold.subscribe(function(s) {
     *     AudioSubstrate.apply(s.audio);
     *     UISubstrate.apply(s.ui);
     *     AIRouter.apply(s.ai);
     *   });
     *
     * @param {Function} handler  fn(ManifoldSample)
     * @returns {Function}        call to unsubscribe
     */
    subscribe: function (handler) {
      _subscribers.push(handler);
      // If a current sample exists, fire immediately so late subscribers
      // start in sync without waiting for the next update.
      if (_current !== null) {
        try { handler(_current); } catch (e) { }
      }
      return function unsubscribe() {
        var i = _subscribers.indexOf(handler);
        if (i !== -1) _subscribers.splice(i, 1);
      };
    },

    /**
     * The last sample produced by Manifold.update().
     * Null before the first update.
     */
    get current() { return _current; },

    /**
     * Compute the Schwarz Diamond field value directly.
     *
     * @param {number} x  0..1
     * @param {number} y  0..1
     * @param {number} z  0..1
     * @returns {number}  field in [−1, 1]
     */
    schwarzDiamond: schwarzDiamond,

    /**
     * The gyroid semantic lattice — inspect or extend at runtime.
     * Push a new node to tune a region without touching substrate code.
     *
     * Example — add a "boss fight" node at peak difficulty:
     *   Manifold.lattice.push({
     *     x: 0.8, y: 0.9,
     *     region: 'boss', intensity: 0.95, theme: 'danger',
     *     aiMode: 'aggressive', spawnRate: 0.95, musicMode: 'climax'
     *   });
     */
    lattice: LATTICE,

    /**
     * IDW blend helper — useful for custom numeric fields on extended lattice nodes.
     *
     * @param {number} x
     * @param {number} y
     * @param {string} field   numeric property name on lattice nodes
     * @returns {number}
     */
    blend: idw,

    /**
     * Nearest-node lookup helper — useful for custom string fields.
     *
     * @param {number} x
     * @param {number} y
     * @param {string} field   string property name on lattice nodes
     * @returns {string}
     */
    nearest: nearest,
  };

  // ─── Private helper ───────────────────────────────────────────────────────

  // Shallow merge: base ← override (override wins; missing override = use base)
  function _merge(base, override) {
    if (!override) return base;
    var result = {};
    for (var k in base) result[k] = base[k];
    for (var k in override) result[k] = override[k];
    return result;
  }

  // ─── Expose globally ─────────────────────────────────────────────────────
  global.Manifold = Manifold;

}(typeof globalThis !== 'undefined' ? globalThis : window));
