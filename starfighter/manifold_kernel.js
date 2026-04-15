/**
 * Manifold Kernel — Universal Game State → All Domains
 * ═══════════════════════════════════════════════════════════════════════════
 * Single entry point for the entire manifold-driven system.
 *
 * Architecture:
 *   Core game loop → ManifoldKernel.tick(snap)
 *     ├─ SpectrumManifold.update(snap)   → drives all subscribers
 *     ├─ MusicCompositor.update(snap)    → adaptive music
 *     ├─ VisualCompositor.update(snap)   → CSS variables, materials
 *     └─ event queue flush               → SFXCompositor.trigger()
 *
 *   Game events → ManifoldKernel.event(type, data)
 *     └─ SFXCompositor.trigger(type, snap, opts)
 *
 * Every attribute of the game is a manifold coordinate:
 *   • Hull integrity    → x (frequency/urgency)
 *   • Shield level      → y (amplitude/severity)
 *   • Player morale     → z (phase/consciousness)
 *   • Enemy count       → modifies r (relation field)
 *   • Base health       → modifies m (meaning field)
 *   • Weapon power      → modifies f (form field)
 *   • Player ID         → hashed to (x,y) for personality seed
 *   • Credentials       → never stored, derived from dimensional address
 *   • Game theory state → Nash equilibrium mapped to Schwartz Diamond
 *   • Physics forces    → manifold curvature (gradient of d field)
 *   • Physics constants → BPM_TABLE[0-15] addresses (c,ℏ,G mapped to index)
 *   • Game rules        → lens definitions (pure functions, no stored state)
 *
 * This file has NO hardcoded game logic.  All behaviour emerges from the
 * interaction of coordinates, lenses, and substrates.
 *
 * Usage (one-time setup):
 *   ManifoldKernel.init()
 *
 * Per-frame (call from your game loop):
 *   ManifoldKernel.tick(snap)
 *
 * On game events:
 *   ManifoldKernel.event('explosion_large', { worldPos, intensity })
 *   ManifoldKernel.event('wave_start', { waveNumber, totalEnemies })
 *
 * Music control:
 *   ManifoldKernel.musicStart(snap)
 *   ManifoldKernel.musicStop()
 *   ManifoldKernel.sting('victory')
 *
 * Diagnostics:
 *   ManifoldKernel.getCoords()       → current manifold coords
 *   ManifoldKernel.getMaterial()     → current visual descriptor
 *   ManifoldKernel.getMusicalMoment()→ current music descriptor
 *   ManifoldKernel.getPalette()      → current colour palette
 */

const ManifoldKernel = (function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────

  let _snap = {};      // latest game snapshot
  let _coords = null;    // latest SpectrumManifold coords
  let _audioCtx = null;    // shared Web Audio context
  let _initialised = false;
  let _musicRunning = false;

  // Pending event queue — events arrive between ticks, flushed at tick()
  const _eventQueue = [];

  // Per-domain subscriber IDs from SpectrumManifold
  const _subIds = {};

  // ── Game state → manifold snapshot builder ────────────────────────────────
  //
  // All game properties become manifold coordinates.
  // Credentials are hashed to coordinates — never passed as literals.
  // Physics constants are addressed by index in BPM_TABLE-style lookup.

  /**
   * Build a normalised game snapshot from raw game state.
   * Accepts any property bag — unknown fields are ignored.
   * All produced values are in 0..1 or well-defined ranges.
   */
  function _normalise(raw) {
    if (!raw) return _snap;
    const s = {};

    // ── Player state ────────────────────────────────────────────────────────
    s.hull = raw.hull != null ? Math.max(0, Math.min(1, raw.hull / (raw.maxHull || 100))) : (_snap.hull || 1);
    s.shields = raw.shields != null ? Math.max(0, Math.min(1, raw.shields / (raw.maxShields || 100))) : (_snap.shields || 1);
    s.fuel = raw.fuel != null ? Math.max(0, Math.min(1, raw.fuel / (raw.maxFuel || 100))) : (_snap.fuel || 1);
    s.score = raw.score != null ? raw.score : (_snap.score || 0);
    s.wave = raw.wave != null ? raw.wave : (_snap.wave || 1);
    s.totalHostile = raw.totalHostile != null ? raw.totalHostile : (_snap.totalHostile || 0);
    s.baseHealth = raw.baseHealth != null ? Math.max(0, Math.min(1, raw.baseHealth / (raw.maxBaseHealth || 100))) : (_snap.baseHealth || 1);

    // ── Identity (hash to coords — never stored) ─────────────────────────
    if (raw.userId) s._ux = _hashToCoord(String(raw.userId), 7);
    if (raw.sessionId) s._sx = _hashToCoord(String(raw.sessionId), 13);
    // Credentials manifest as personality offsets, not stored values
    if (raw.credential) s._cx = _hashToCoord(String(raw.credential), 11);

    // ── Physics / game theory ────────────────────────────────────────────
    // Game theory: Nash equilibrium coordinate = score ratio vs expected
    s.nashX = raw.nashX != null ? raw.nashX : _snap.nashX || 0.5;
    s.nashY = raw.nashY != null ? raw.nashY : _snap.nashY || 0.5;

    // ── Carry any extra fields through ───────────────────────────────────
    if (raw.spatialAngle != null) s.spatialAngle = raw.spatialAngle;
    if (raw.playerPos) s.playerPos = raw.playerPos;
    if (raw.cameraPos) s.cameraPos = raw.cameraPos;
    if (raw.phase) s.phase = raw.phase;

    return s;
  }

  /**
   * Hash a string to a stable 0..1 coordinate.
   * Used for identity → personality seeds.  Not cryptographic.
   */
  function _hashToCoord(str, salt) {
    let h = 0x9e3779b9 ^ (salt | 0);
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
      h ^= h >>> 16;
    }
    return (h >>> 0) / 0xFFFFFFFF;
  }

  // ── Physics lens ──────────────────────────────────────────────────────────
  //
  // Physics constants are manifold addresses.
  // The speed of light corresponds to index 15 in BPM_TABLE (max: 200 BPM).
  // Planck's constant maps to index 0 (min: 40 BPM — near-zero energy).
  // This is metaphorical: the manifold coordinates REPRESENT physics, they
  // do not simulate it numerically.

  const PHYSICS_ATTRS = {
    // Force field: gradient of the Schwartz Diamond d-field
    forceX: c => (SpectrumManifold.coords(c.x + 0.001, c.y, c.z).d - c.d) / 0.001,
    forceY: c => (SpectrumManifold.coords(c.x, c.y + 0.001, c.z).d - c.d) / 0.001,
    forceZ: c => (SpectrumManifold.coords(c.x, c.y, c.z + 0.001).d - c.d) / 0.001,
    // Curvature (Laplacian approximation): how fast the field changes
    curvature: c => {
      const d = c.d;
      const dx = SpectrumManifold.coords(c.x + 0.01, c.y, c.z).d;
      const dy = SpectrumManifold.coords(c.x, c.y + 0.01, c.z).d;
      const dz = SpectrumManifold.coords(c.x, c.y, c.z + 0.01).d;
      return (dx + dy + dz - 3 * d) / 0.01;
    },
    // Game-theory Nash payoff approximation from dual manifold positions
    nashPayoff: (c, snap) => {
      if (!snap || snap.nashX == null) return 0.5;
      const self = SpectrumManifold.coords(c.x, c.y, c.z).d;
      const rival = SpectrumManifold.coords(snap.nashX, snap.nashY, 1 - c.z).d;
      return 0.5 + (self - rival) * 0.5;
    },
  };

  /**
   * Get physics attributes from current manifold coords.
   * @returns {object} { forceX, forceY, forceZ, curvature, nashPayoff }
   */
  function getPhysics() {
    if (!_coords) return {};
    return {
      forceX: PHYSICS_ATTRS.forceX(_coords),
      forceY: PHYSICS_ATTRS.forceY(_coords),
      forceZ: PHYSICS_ATTRS.forceZ(_coords),
      curvature: PHYSICS_ATTRS.curvature(_coords),
      nashPayoff: PHYSICS_ATTRS.nashPayoff(_coords, _snap),
    };
  }

  // ── Game rules as lens definitions ────────────────────────────────────────
  //
  // Rules are pure functions (lenses) that project game state onto
  // decision coordinates.  No stored rule tables — the coordinate IS the rule.

  const RULES = {
    // Is the player in critical danger? (near zero-crossing of d-field)
    isCritical: c => c.nearZero || (c.x > 0.7 && c.y > 0.7),
    // Should music escalate? (urgency rising and severity moderate)
    shouldEscalate: c => c.x > 0.6 && c.y > 0.4 && c.y < 0.8,
    // Is victory near? (morale high, urgency moderate, d positive)
    isVictoryNear: c => c.z > 0.7 && c.x < 0.6 && c.d > 0,
    // Is base defence needed?
    isBaseDefence: (c, snap) => snap && snap.baseHealth < 0.4,
    // Alert level (0=calm, 1=elevated, 2=critical, 3=emergency)
    alertLevel: c => c.x > 0.85 ? 3 : c.x > 0.65 ? 2 : c.x > 0.40 ? 1 : 0,
    // Weapon effectiveness (derived from form field — curvature of reality)
    weaponEffectiveness: c => 0.3 + c.f * 0.7,
    // Enemy spawn density suggestion (from severity and wave coord)
    spawnDensity: (c, snap) => {
      const wave = (snap && snap.wave) ? snap.wave : 1;
      return Math.round((1 + c.r * 2) * Math.log(1 + wave));
    },
  };

  /**
   * Evaluate all game rules from current state.
   * @param {object} [snap] — defaults to latest snap
   * @returns {object}
   */
  function getRules(snapOverride) {
    const s = snapOverride || _snap;
    if (!_coords) return {};
    const c = _coords;
    return {
      isCritical: RULES.isCritical(c),
      shouldEscalate: RULES.shouldEscalate(c),
      isVictoryNear: RULES.isVictoryNear(c),
      isBaseDefence: RULES.isBaseDefence(c, s),
      alertLevel: RULES.alertLevel(c),
      weaponEffectiveness: RULES.weaponEffectiveness(c),
      spawnDensity: RULES.spawnDensity(c, s),
    };
  }

  /**
   * Register a custom game rule as a lens function.
   * @param {string} name
   * @param {function} fn — fn(coords, snap) → value
   */
  function registerRule(name, fn) {
    RULES[name] = fn;
  }

  // ── Event handling ────────────────────────────────────────────────────────

  /**
   * Queue a game event for SFX triggering.
   * Safe to call from any game system — event is processed next tick.
   * @param {string} type    — event type (see SFXCompositor.EVENT_COORDS)
   * @param {object} [data]  — { worldPos, playerPos, intensity, durationMult }
   */
  function event(type, data) {
    _eventQueue.push({ type, data: data || {} });
  }

  function _flushEvents() {
    while (_eventQueue.length) {
      const { type, data } = _eventQueue.shift();
      if (!window.SFXCompositor) continue;
      if (data.worldPos) {
        SFXCompositor.triggerAt3D(type, data.worldPos, _snap.playerPos, _snap, {
          intensity: data.intensity,
          durationMult: data.durationMult,
        });
      } else {
        SFXCompositor.trigger(type, _snap, {
          intensity: data.intensity,
          durationMult: data.durationMult,
          spatialAngle: data.spatialAngle,
        });
      }
    }
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Initialise the kernel.  Call once before the game loop starts.
   * @param {object} [opts] { musicVolume: 0.6, sfxVolume: 0.7, domReactive: true }
   */
  function init(opts) {
    if (_initialised) return;
    const o = opts || {};

    if (window.SFXCompositor) {
      SFXCompositor.setVolume(o.sfxVolume != null ? o.sfxVolume : 0.7);
    }
    if (window.MusicCompositor) {
      MusicCompositor.setVolume(o.musicVolume != null ? o.musicVolume : 0.6);
    }
    if (window.VisualCompositor && (o.domReactive !== false)) {
      VisualCompositor.startDOMReactive(150);
    }

    // Register the physics lens with SpectrumManifold if not already there
    if (window.SpectrumManifold && !SpectrumManifold._domains.physics) {
      SpectrumManifold.registerDomain(
        'physics',
        (c, snap) => c,  // physics lens is identity — curvature IS the coord
        (c, snap) => ({
          forceX: PHYSICS_ATTRS.forceX(c),
          forceY: PHYSICS_ATTRS.forceY(c),
          forceZ: PHYSICS_ATTRS.forceZ(c),
          curvature: PHYSICS_ATTRS.curvature(c),
        })
      );
    }

    _initialised = true;
  }

  // ── Tick (call every frame) ───────────────────────────────────────────────

  /**
   * Drive all manifold-derived systems from game state.
   * Call once per frame from your main game loop.
   * @param {object} rawSnap — raw game state object
   */
  function tick(rawSnap) {
    _snap = _normalise(rawSnap);
    _coords = SpectrumManifold.fromGameState(_snap);

    // Drive all subscribers
    SpectrumManifold.update(_snap);

    // Music follows game state
    if (_musicRunning && window.MusicCompositor) {
      MusicCompositor.update(_snap);
    }

    // Flush queued events to SFX
    _flushEvents();
  }

  // ── Music control ─────────────────────────────────────────────────────────

  function musicStart(snap) {
    if (_musicRunning) return;
    _musicRunning = true;
    if (window.MusicCompositor) MusicCompositor.start(snap || _snap);
  }

  function musicStop(fadeS) {
    _musicRunning = false;
    if (window.MusicCompositor) MusicCompositor.stop(fadeS);
  }

  function sting(type, customXYZ) {
    if (window.MusicCompositor) MusicCompositor.sting(type, customXYZ);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  function getCoords() { return _coords; }
  function getSnap() { return _snap; }
  function getMaterial() { return window.VisualCompositor ? VisualCompositor.getMaterial(_snap) : null; }
  function getMusicalMoment() { return _coords ? SpectrumManifold.musicalMoment(_coords) : null; }
  function getPalette() { return window.VisualCompositor ? VisualCompositor.getPalette(_snap) : null; }

  /**
   * Log a full diagnostic snapshot to the console.
   */
  function diagnose() {
    if (!_coords) { console.warn('[ManifoldKernel] Not ticked yet'); return; }
    const r = getRules();
    const p = getPhysics();
    console.group('[ManifoldKernel] Diagnostic');
    console.log('Coords:  x=%f y=%f z=%f', _coords.x.toFixed(4), _coords.y.toFixed(4), _coords.z.toFixed(4));
    console.log('Layers:  r=%f f=%f m=%f d=%f', _coords.r.toFixed(4), _coords.f.toFixed(4), _coords.m.toFixed(4), _coords.d.toFixed(4));
    console.log('Rules:   alertLevel=%d critical=%s escalate=%s victory=%s', r.alertLevel, r.isCritical, r.shouldEscalate, r.isVictoryNear);
    console.log('Physics: Fx=%f Fy=%f Fz=%f curv=%f nash=%f', p.forceX.toFixed(4), p.forceY.toFixed(4), p.forceZ.toFixed(4), p.curvature.toFixed(4), p.nashPayoff.toFixed(4));
    if (window.VisualCompositor) {
      const mat = getMaterial();
      console.log('Visual:  color=%s emissive=%s rough=%f metal=%f', mat.color, mat.emissive.css, mat.roughness.toFixed(3), mat.metalness.toFixed(3));
    }
    if (_coords) {
      const mm = getMusicalMoment();
      if (mm) console.log('Music:   bpm=%d root=%s scale=%s', Math.round(mm.bpm), mm.rootName || '?', mm.scaleName || '?');
    }
    console.groupEnd();
  }

  return {
    init,
    tick,
    event,
    musicStart,
    musicStop,
    sting,
    // Accessors
    getCoords,
    getSnap,
    getMaterial,
    getMusicalMoment,
    getPalette,
    getPhysics,
    getRules,
    registerRule,
    // Internals exposed for advanced use
    PHYSICS_ATTRS,
    RULES,
    diagnose,
  };
})();

window.ManifoldKernel = ManifoldKernel;
