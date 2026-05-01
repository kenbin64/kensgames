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

  function _safeDivide(a, b, fallback = 1) {
    const n = Number(a);
    const d = Number(b);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return fallback;
    return n / d;
  }

  const DimensionalAlgebra = {
    // z = x * y (combining / bloom)
    zFromXY(x, y) {
      return _toNumber(x, 1) * _toNumber(y, 1);
    },

    // z = x / y (separating / exploding)
    zExplodeFromXY(x, y) {
      return _safeDivide(x, y, _toNumber(x, 1));
    },

    // x = z / y (extract x from whole)
    xFromZY(z, y) {
      return _safeDivide(z, y, _toNumber(z, 1));
    },

    // x = y / z (separate attributes of z to reveal x)
    xSeparateFromYZ(y, z) {
      return _safeDivide(y, z, _toNumber(y, 1));
    },

    // x = y * z (combine attributes to isolate x)
    xCombineFromYZ(y, z) {
      return _toNumber(y, 1) * _toNumber(z, 1);
    },

    // y = z / x (extract y from whole)
    yFromZX(z, x) {
      return _safeDivide(z, x, _toNumber(z, 1));
    },

    // y = x / z (separate attributes to reveal y)
    ySeparateFromXZ(x, z) {
      return _safeDivide(x, z, _toNumber(x, 1));
    },

    // y = x * z (combine objects to isolate y)
    yCombineFromXZ(x, z) {
      return _toNumber(x, 1) * _toNumber(z, 1);
    },

    // Seed -> bloom chain using repeated combine (default) or explode.
    seedToBloom(seedX, yModifiers, mode) {
      const x = _toNumber(seedX, 1);
      const ys = _normalizeModifiers(yModifiers);
      let z = x;
      const op = mode === 'explode' ? 'explode' : 'combine';

      const steps = ys.map((m) => {
        const prev = z;
        z = op === 'explode'
          ? this.zExplodeFromXY(z, m.value)
          : this.zFromXY(z, m.value);
        return {
          y: m,
          prev,
          next: z,
          op,
        };
      });

      return {
        x,
        y: ys,
        z,
        mode: op,
        steps,
      };
    },
  };

  function _toNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function _clamp01(v) {
    const n = _toNumber(v, 0);
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function _coordFromObservedY(yObserved) {
    return _clamp01(0.5 + 0.5 * Math.tanh(_toNumber(yObserved, 0)));
  }

  function _rgbFromCoordinate(c) {
    const coord = _clamp01(c);
    const r = Math.round(255 * coord);
    const g = Math.round(255 * (1 - Math.abs(2 * coord - 1)));
    const b = Math.round(255 * (1 - coord));
    return { r, g, b };
  }

  function _htmlFromRgb(rgb) {
    const toHex = (v) => Math.max(0, Math.min(255, _toNumber(v, 0) | 0)).toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  function _resolveYScalar(modifier, idx) {
    if (typeof modifier === 'number') return modifier;
    if (typeof modifier === 'string') return 1;
    if (modifier && typeof modifier === 'object') {
      if (typeof modifier.value === 'number') return modifier.value;
      if (typeof modifier.weight === 'number') return modifier.weight;
      if (typeof modifier.factor === 'number') return modifier.factor;
    }
    return idx === 0 ? 1 : 1;
  }

  function _normalizeModifiers(yInput) {
    if (Array.isArray(yInput)) {
      return yInput.map((item, idx) => {
        if (item && typeof item === 'object') {
          return Object.assign({
            id: item.id || `y_${idx + 1}`,
            value: _toNumber(_resolveYScalar(item, idx), 1),
          }, item);
        }
        return {
          id: `y_${idx + 1}`,
          value: _toNumber(_resolveYScalar(item, idx), 1),
          source: 'array',
        };
      });
    }

    if (yInput && typeof yInput === 'object') {
      return Object.entries(yInput).map(([key, value], idx) => ({
        id: key || `y_${idx + 1}`,
        value: _toNumber(_resolveYScalar(value, idx), _toNumber(value, 1)),
        raw: value,
        source: 'object',
      }));
    }

    if (yInput === undefined || yInput === null) {
      return [{ id: 'y_1', value: 1, source: 'default' }];
    }

    return [{
      id: 'y_1',
      value: _toNumber(_resolveYScalar(yInput, 0), 1),
      source: 'scalar',
    }];
  }

  function _solveZ(xScalar, yInput) {
    const x = _toNumber(xScalar, 1);
    const ys = _normalizeModifiers(yInput);
    return DimensionalAlgebra.seedToBloom(x, ys, 'combine').z;
  }

  function _composeEntity(spec) {
    const opts = spec || {};
    const entityType = opts.type || 'entity';
    const xRef = opts.xRef !== undefined ? opts.xRef : opts.x;
    const xScalar = _toNumber(opts.xScalar !== undefined ? opts.xScalar : (typeof xRef === 'number' ? xRef : 1), 1);
    const y = _normalizeModifiers(opts.y);
    const z = _solveZ(xScalar, y);
    const idBase = (xRef && typeof xRef === 'object' ? (xRef.id || xRef.x || xRef.user_id) : xRef) || `${entityType}_${Date.now()}`;

    return {
      type: entityType,
      x: {
        ref: xRef,
        scalar: xScalar,
      },
      y,
      xy: y.map(mod => ({ x: idBase, y: mod.id })),
      z,
      attrs: opts.attrs && typeof opts.attrs === 'object' ? opts.attrs : {},
      whole: {
        id: idBase,
        type: entityType,
        z,
      },
      axiom: 'z=xy',
      schema: '1.1-dimensional',
      createdAt: Date.now(),
    };
  }

  function _composePixelLens(spec) {
    const opts = spec || {};
    const xRef = opts.pixel !== undefined ? opts.pixel : (opts.xRef !== undefined ? opts.xRef : opts.x);
    const yObserved = _toNumber(opts.yObserved, 0);
    const coordinate = opts.coordinate != null ? _clamp01(opts.coordinate) : _coordFromObservedY(yObserved);

    const rgb = _rgbFromCoordinate(coordinate);
    const html = _htmlFromRgb(rgb);
    const wavelength = 380 + coordinate * 370;
    const frequency = 299792458 / (wavelength * 1e-9);
    const intensity = _clamp01(Math.abs(yObserved));
    const brightness = _clamp01(0.35 + coordinate * 0.65);
    const alpha = _clamp01(opts.alpha != null ? opts.alpha : (0.2 + intensity * 0.8));

    const shader = Object.assign({}, opts.shader || {}, {
      coordinate,
      alpha,
      intensity,
      brightness,
    });

    const entity = _composeEntity({
      type: 'pixel',
      xRef,
      xScalar: 1,
      y: [
        { id: 'pixel.coordinate', value: coordinate },
        { id: 'pixel.alpha', value: alpha },
        { id: 'pixel.intensity', value: intensity },
        { id: 'pixel.brightness', value: brightness },
      ],
      attrs: {
        color: {
          coordinate,
          html,
          rgb,
          wavelength,
          frequency,
        },
        shader,
      },
    });

    entity.yObserved = yObserved;
    entity.pixel = {
      coordinate,
      color: {
        coordinate,
        html,
        rgb,
        wavelength,
        frequency,
      },
      shader,
      alpha,
      intensity,
      brightness,
    };
    return entity;
  }

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

    /**
     * Normalize y modifiers from arrays/objects/scalars into a canonical list.
     */
    normalizeY(yInput) {
      return _normalizeModifiers(yInput);
    },

    /**
     * Solve z using z = x * product(y[i].value).
     */
    solveZ(x, yInput) {
      return _solveZ(x, yInput);
    },

    /**
     * Compose a canonical dimensional entity where x is reference and z is whole.
     */
    composeEntity(spec) {
      return _composeEntity(spec);
    },

    /**
     * Compose a pixel identity where y is manifold-observed pixel attributes.
     */
    composePixelLens(spec) {
      return _composePixelLens(spec);
    },

    /**
     * Full x/y/z equation helpers for combine/separate/isolate patterns.
     */
    algebra: DimensionalAlgebra,
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
