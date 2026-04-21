/**
 * ═══════════════════════════════════════════════════════════════════════
 * MANIFOLD BRIDGE  —  js/manifold_bridge.js
 * ═══════════════════════════════════════════════════════════════════════
 * Shared browser substrate that every kensgames.com game includes.
 *
 * Axiom:  Manifold = Expression + Attributes + Substrate
 *         z = x · y²   (x, y are the primary 2D coordinates;
 *                        z is their quadratic 3D projection — never stored, always derived)
 *
 * Schwartz Diamond field: F(x,y,z) = cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z)
 *
 * Integration with Manifold.sample (js/manifold_sample.js)
 * ─────────────────────────────────────────────────────────
 * Load manifold_sample.js BEFORE this file.  When present, every
 * setDimension command also fires Manifold.update() so all subscribers
 * (audio, UI, AI) receive a fresh ManifoldSample automatically.
 * ManifoldBridge.sample() is a convenience shortcut for the same thing.
 *   Entities where |F| → 0 sit on the surface boundary and get highest fork priority.
 *   Entities deep in a channel (|F| → 1) have lower priority.
 *   This is the Dijkstra ordering used to prevent deadlock in multi-entity operations.
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
 *       x:       4,           // suits (primary axis)
 *       y:       13,          // ranks (quadratic axis)  →  z = 4·169 = 676
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
     * @param {number}   opts.x         primary coordinate (e.g. suits, rows, board dimension)
     * @param {number}   opts.y         quadratic coordinate (e.g. ranks, cols) — dominates z
     * @param {Function} opts.exposes   () => object  — live state snapshot
     */
    init(opts = {}) {
      if (_ready) {
        console.warn('[ManifoldBridge] already initialised — skipping duplicate init()');
        return this;
      }

      if (!opts.id) throw new Error('[ManifoldBridge] opts.id is required');
      if (!opts.exposes) throw new Error('[ManifoldBridge] opts.exposes must be a function');

      // z = x · y²  — the quadratic 3D projection of the 2D coordinate (x, y).
      // x and y are the primary inputs. z is always derived, never primary.
      // Small changes in y produce quadratic change in z — y is the dominant axis.
      const x = opts.x ?? 1;
      const y = opts.y ?? 1;
      const z = x * y * y;   // canonical: z = x·y²

      // Schwartz Diamond field value at this coordinate (wrapped to [0, 2π)).
      // |field| → 0: entity sits on the surface boundary → highest fork priority.
      // |field| → 1: entity deep in a channel → lower priority.
      const PERIOD = 2 * Math.PI;
      const wrap = c => ((c % PERIOD) + PERIOD) % PERIOD;
      const field = Math.cos(wrap(x)) * Math.cos(wrap(y)) * Math.cos(wrap(z))
        - Math.sin(wrap(x)) * Math.sin(wrap(y)) * Math.sin(wrap(z));

      _config = { id: opts.id, version: opts.version ?? '1.0.0', x, y, z, field };

      // Publish to window so portal/compiler can inspect it
      global.__MANIFOLD__ = {
        id: _config.id,
        version: _config.version,
        schema: '1.0',
        dimension: { x, y, z, field },  // field: Schwartz Diamond value — drives fork priority
        get state() { return opts.exposes(); },
        emit: (...args) => ManifoldBridge.emit(...args),
        on: (...args) => ManifoldBridge.on(...args),
      };

      _ready = true;
      _attachMessageListener();
      _announce();

      console.log(
        `%c🜂 ManifoldBridge%c ${_config.id} v${_config.version} · (${x}, ${y}) → z=${z} · field=${field.toFixed(4)}`,
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

    /**
     * Compute a ManifoldSample from the current game dimensions.
     * Delegates to Manifold.sample() if manifold_sample.js is loaded;
     * otherwise returns a minimal struct with just x, y, z, f1, f2, G.
     *
     * @param {object} [overrides]  merged into the ctx before sampling
     * @returns {ManifoldSample|object}
     */
    sample(overrides) {
      const dim = global.__MANIFOLD__?.dimension;
      if (!dim) return null;
      // Normalize integer game dimensions (e.g. x=4, y=13) to 0..1
      // by dividing by their product (z = x·y in the integer dimension axiom).
      const maxXY = Math.max(1, dim.x * dim.y);
      const nx = Math.min(1, dim.x / Math.max(1, dim.x));
      const ny = Math.min(1, dim.y / Math.max(1, maxXY / dim.x));
      const ctx = Object.assign({ x: nx, y: ny }, overrides);
      if (global.Manifold && global.Manifold.sample) {
        return global.Manifold.sample(ctx);
      }
      // Fallback: minimal sample without the full lattice
      const f1 = nx * ny;
      const f2 = nx * ny * ny;
      const G = dim.field;
      return { x: nx, y: ny, z: f2, f1, f2, G, surfaceProximity: 1 - Math.abs(G) };
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

        case 'setDimension': {
          // Portal updating x or y (e.g. player count changed, difficulty changed).
          // z and field are derived — recompute both whenever x or y changes.
          if (msg.payload?.x !== undefined) global.__MANIFOLD__.dimension.x = msg.payload.x;
          if (msg.payload?.y !== undefined) global.__MANIFOLD__.dimension.y = msg.payload.y;
          const dx = global.__MANIFOLD__.dimension.x;
          const dy = global.__MANIFOLD__.dimension.y;
          const dz = dx * dy * dy;  // z = x·y²
          const PERIOD = 2 * Math.PI;
          const wrap = c => ((c % PERIOD) + PERIOD) % PERIOD;
          global.__MANIFOLD__.dimension.z = dz;
          global.__MANIFOLD__.dimension.field =
            Math.cos(wrap(dx)) * Math.cos(wrap(dy)) * Math.cos(wrap(dz))
            - Math.sin(wrap(dx)) * Math.sin(wrap(dy)) * Math.sin(wrap(dz));
          _fire('dimensionChanged', global.__MANIFOLD__.dimension);
          // Propagate to Manifold.update() so all substrate subscribers
          // (audio, UI, AI) receive a fresh ManifoldSample automatically.
          if (global.Manifold && global.Manifold.update) {
            global.Manifold.update(ManifoldBridge.sample());
          }
          break;
        }

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
