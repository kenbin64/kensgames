/**
 * ═══════════════════════════════════════════════════════════════════════
 * MANIFOLD BRIDGE  —  js/manifold_bridge.js
 * ═══════════════════════════════════════════════════════════════════════
 * Shared browser substrate that every kensgames.com game includes.
 *
 * Axiom:  Manifold = Expression + Attributes + Substrate
 *         z = x·y  (universal access rule)
 *
 * What this does
 * ──────────────
 * 1. Declares window.__MANIFOLD__ — the game's public manifold surface
 * 2. Handles PostMessage protocol between portal iframe and game
 * 3. Reports game state changes to the portal (score, phase, player count)
 * 4. Accepts commands from the portal (pause, resume, getState)
 *
 * Usage (in each game's HTML)
 * ───────────────────────────
 *   <script src="/js/manifold_bridge.js"></script>
 *   <script>
 *     ManifoldBridge.init({
 *       id:      'fasttrack',
 *       version: '2.1.0',
 *       x:       playerCount,    // dimension x
 *       y:       playTimeMin,    // dimension y
 *       exposes: () => ({        // live state snapshot
 *         gameState, playerCount, roundTime, score
 *       })
 *     });
 *   </script>
 * ═══════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  // ─── PostMessage origin whitelist ────────────────────────────────────
  const ALLOWED_ORIGINS = [
    'https://kensgames.com',
    'https://www.kensgames.com',
    // Allow localhost in development
    'http://localhost',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1',
  ];

  function isAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ':'));
  }

  // ─── Internal state ───────────────────────────────────────────────────
  let _config = null;
  let _listeners = {};
  let _ready = false;

  // ─── Public API ───────────────────────────────────────────────────────
  const ManifoldBridge = {

    /**
     * Initialise the bridge.  Call once after your game engine is ready.
     *
     * @param {object} opts
     * @param {string}   opts.id        game identifier  (e.g. 'fasttrack')
     * @param {string}   opts.version   semver string
     * @param {number}   opts.x         dimension x (player count)
     * @param {number}   opts.y         dimension y (play time minutes)
     * @param {Function} opts.exposes   () => object  — live state snapshot
     */
    init(opts = {}) {
      if (_ready) {
        console.warn('[ManifoldBridge] already initialised — skipping duplicate init()');
        return this;
      }

      if (!opts.id) throw new Error('[ManifoldBridge] opts.id is required');
      if (!opts.exposes) throw new Error('[ManifoldBridge] opts.exposes must be a function');

      const x = opts.x ?? 1;
      const y = opts.y ?? 1;
      const z = x * y;  // z = xy — universal access rule

      _config = { id: opts.id, version: opts.version ?? '1.0.0', x, y, z };

      // Publish to window so portal/compiler can inspect it
      global.__MANIFOLD__ = {
        id: _config.id,
        version: _config.version,
        schema: '1.0',
        dimension: { x, y, z },
        get state() { return opts.exposes(); },
        emit: (...args) => ManifoldBridge.emit(...args),
        on: (...args) => ManifoldBridge.on(...args),
      };

      _ready = true;
      _attachMessageListener();
      _announce();

      console.log(
        `%c🜂 ManifoldBridge%c ${_config.id} v${_config.version} · z=${z}`,
        'color:#7af;font-weight:bold', 'color:#888'
      );

      return this;
    },

    /**
     * Emit an event upward to the portal.
     *
     * @param {string} eventName   e.g. 'score', 'phase', 'gameOver'
     * @param {*}      payload     any JSON-serialisable value
     */
    emit(eventName, payload) {
      if (!_ready) {
        console.warn('[ManifoldBridge] emit() called before init()');
        return;
      }
      const msg = {
        type: 'manifold:event',
        game: _config.id,
        event: eventName,
        payload,
        dimension: global.__MANIFOLD__.dimension,
        ts: Date.now(),
      };
      // Send to parent (portal iframe host)
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(msg, '*');
      }
      // Also fire local listeners
      _fire(eventName, payload);
    },

    /**
     * Subscribe to commands sent from the portal.
     *
     * @param {string}   eventName  e.g. 'pause', 'resume', 'getState'
     * @param {Function} handler    fn(payload)
     */
    on(eventName, handler) {
      if (!_listeners[eventName]) _listeners[eventName] = [];
      _listeners[eventName].push(handler);
      return this;
    },

    /** Current dimension values (read-only snapshot) */
    get dimension() {
      return global.__MANIFOLD__?.dimension ?? null;
    },

    /** True after init() has been called */
    get ready() { return _ready; },
  };

  // ─── Private helpers ──────────────────────────────────────────────────

  function _fire(eventName, payload) {
    (_listeners[eventName] || []).forEach(fn => {
      try { fn(payload); }
      catch (err) { console.error(`[ManifoldBridge] listener error (${eventName}):`, err); }
    });
  }

  function _announce() {
    // Tell portal this game's bridge is ready
    ManifoldBridge.emit('manifold:ready', {
      id: _config.id,
      version: _config.version,
      dimension: global.__MANIFOLD__.dimension,
    });
  }

  function _attachMessageListener() {
    global.addEventListener('message', function (evt) {
      // Security: validate origin
      if (!isAllowedOrigin(evt.origin)) return;

      const msg = evt.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== 'manifold:command') return;
      if (msg.target && msg.target !== _config.id) return;

      switch (msg.command) {
        case 'getState':
          // Portal is requesting a state snapshot
          _sendStateSnapshot(evt.source, evt.origin);
          break;

        case 'pause':
          _fire('pause', msg.payload);
          break;

        case 'resume':
          _fire('resume', msg.payload);
          break;

        case 'setDimension':
          // Portal updating x or y (e.g. player joined)
          if (msg.payload?.x !== undefined) global.__MANIFOLD__.dimension.x = msg.payload.x;
          if (msg.payload?.y !== undefined) global.__MANIFOLD__.dimension.y = msg.payload.y;
          global.__MANIFOLD__.dimension.z =
            global.__MANIFOLD__.dimension.x * global.__MANIFOLD__.dimension.y;
          _fire('dimensionChanged', global.__MANIFOLD__.dimension);
          break;

        default:
          // Forward unknown commands to registered listeners
          _fire(msg.command, msg.payload);
      }
    });
  }

  function _sendStateSnapshot(source, origin) {
    if (!source) return;
    const snapshot = {
      type: 'manifold:stateSnapshot',
      game: _config.id,
      dimension: global.__MANIFOLD__.dimension,
      state: global.__MANIFOLD__.state,
      ts: Date.now(),
    };
    source.postMessage(snapshot, origin);
  }

  // ─── Expose globally ─────────────────────────────────────────────────
  global.ManifoldBridge = ManifoldBridge;

}(typeof globalThis !== 'undefined' ? globalThis : window));
