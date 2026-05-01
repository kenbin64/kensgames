/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🜂 FASTTRACK SOUND LENS — fasttrack/fasttrack-sound.js
 * ═══════════════════════════════════════════════════════════════════════
 *
 * No stored audio. No samples. No presets.
 * Every sound — music, chord, melody, beat, effect — is synthesized live
 * by walking the manifold field as an audio-rate waveform (Stradivarius
 * metaphor: the instrument IS the field; every game moment plays it
 * differently).
 *
 * Architecture
 * ────────────
 *   FastTrackSound.init(audioContext, game)
 *     → binds ManifoldInstrument (worklet) + starts ManifoldConductor
 *
 *   FastTrackSound.tick(deltas)             ← call after drainDeltas()
 *     → converts each delta into a manifold voice trigger
 *     → ticks the conductor so the background music follows game state
 *
 *   FastTrackSound.dispose()
 *     → stops all voices and the conductor interval
 *
 * Sound design map (x-point → event type → voicing)
 * ──────────────────────────────────────────────────
 *   peg-move        → Pluck  — mid energy, position on outer track
 *   peg-state       → Pluck  — energy from state (holding=low, safezone=high)
 *   peg-cut         → Burst  — high energy collision burst
 *   peg-enter-safe  → Voice  — sustained bright tone (Lydian lobe)
 *   peg-winner      → Stream — full harmonic bloom (all segments)
 *   card-play       → Pluck  — card face value as energy
 *   card-7-split    → Pluck×2 — two simultaneous plucks
 *   turn-start      → Pluck  — soft tick, low energy
 *   ambient         → Stream — background music driven by conductor
 *
 * Manifold coordinates
 * ──────────────────────────────────────────────────────────────────────
 * Each game object maps to a stable x-point derived from its id.
 * The conductor maps the live game-state vector (peg progress, turn
 * count, cut count, player count) onto a region of the field so the
 * music's mode, tempo, and density reflect the actual game tension.
 *
 * Axiom:  z = x·y — peg identity × field at that point = audible event
 * ═══════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  'use strict';
  const S = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  if (root) root.FastTrackSound = S;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  // ── Dependency resolution ─────────────────────────────────────────────
  function _resolve(globalName, modulePath) {
    if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
    if (typeof globalThis !== 'undefined' && globalThis[globalName]) return globalThis[globalName];
    if (typeof require === 'function') {
      try { return require(modulePath); } catch (e) { /* optional */ }
    }
    return null;
  }

  const INSTR = _resolve('ManifoldInstrument', '../js/manifold-instrument.js');
  const CONDUCTOR = _resolve('ManifoldConductor', '../js/manifold-conductor.js');
  const CODEC = _resolve('ManifoldCodec', '../js/manifold-codec.js');

  const PHI = (1 + Math.sqrt(5)) / 2;

  // ── Seed from id string ───────────────────────────────────────────────
  // Every peg, hole, player, card gets a deterministic seed so the same
  // object always maps to the same manifold point → same timbre.
  function _seedFromId(id) {
    let h = 0x811c9dc5;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    // Three-component seed: fnv, phi-rotated, inverse-phi-rotated.
    const u = (h / 0xffffffff);
    return [u, u * PHI % 1, u / PHI % 1];
  }

  function _xFromId(id, dim) {
    return { seed: _seedFromId(id), dim: (dim | 0), id: String(id) };
  }

  // ── State vector from game ────────────────────────────────────────────
  // Maps current game state to a [0-1]-normalised numeric vector.
  // The conductor uses this to drive tempo, mode, density, bass weight.
  //
  // Components:
  //   [0] normalised outer-track occupancy  (tension when board is busy)
  //   [1] safezone progress ratio            (brightness → game nearly won)
  //   [2] recent cut rate                    (roughness → lots of cuts)
  //   [3] active player fraction             (fullness → more players = more energy)
  function _stateVector(game, counters) {
    const c = counters || {};
    let outerCount = 0, safeCount = 0, totalPegs = 0;
    game.pegs.forEach(p => {
      totalPegs++;
      if (p.state === 'outer' || p.state === 'bullseye') outerCount++;
      if (p.state === 'safezone' || p.state === 'winner') safeCount++;
    });
    const denom = Math.max(1, totalPegs);
    return [
      outerCount / denom,
      safeCount / denom,
      Math.min(1, (c.cuts || 0) / 10),
      Math.min(1, game.playerCount / 6),
    ];
  }

  // ── Event-to-voice mapping ────────────────────────────────────────────
  // Each delta type → { voicing, energy, opts }
  // energy is in [0, 1]; higher = sharper attack, brighter pitch, longer tail.

  const _STATE_ENERGY = {
    holding: 0.2,
    home: 0.35,
    outer: 0.5,
    safezone: 0.75,
    bullseye: 0.9,
    winner: 1.0,
  };

  function _voiceForDelta(delta, game) {
    if (!INSTR) return null;
    const type = delta.type || '';

    switch (type) {
      case 'peg-move': {
        // Energy from how far along the outer track the peg moved.
        // Holes closer to the safe zone entrance (index 8-14) are brighter.
        const toHole = (delta.to && delta.to.holeId) || '';
        const idxMatch = toHole.match(/outer-\d+-(\d+)/);
        const holeIdx = idxMatch ? parseInt(idxMatch[1], 10) : 7;
        const energy = Math.max(0.15, Math.min(0.85, holeIdx / 14));
        return { fn: 'Pluck', x: _xFromId(delta.target, 1), energy };
      }

      case 'peg-state': {
        const toState = (delta.to && delta.to.state) || 'outer';
        const energy = _STATE_ENERGY[toState] || 0.5;
        // Entering safe zone gets a Voice (sustained, bright)
        if (toState === 'safezone') return { fn: 'Voice', x: _xFromId(delta.target, 2), energy };
        // Winner gets a full Stream bloom
        if (toState === 'winner') return { fn: 'Stream', x: _xFromId(delta.target, 3), energy, segments: 8 };
        return { fn: 'Pluck', x: _xFromId(delta.target, 1), energy };
      }

      case 'peg-cut': {
        // Cut is a Burst — turbulent, short, energetic
        const victimId = (delta.to && delta.to.cutBy) ? delta.to.cutBy : delta.target;
        return { fn: 'Burst', x: _xFromId(victimId, 0), energy: 0.85 };
      }

      case 'card-play': {
        // Card value (2-14 mapped to [0.1, 0.9])
        const val = (delta.to && delta.to.value) ? Number(delta.to.value) : 7;
        const energy = Math.max(0.1, Math.min(0.9, (val - 2) / 12));
        return { fn: 'Pluck', x: _xFromId(`card-${val}`, 1), energy };
      }

      case 'card-7-split': {
        // Two pegs moving — two simultaneous plucks, slightly detuned
        const peg1 = (delta.to && delta.to.peg1) || delta.target;
        const peg2 = (delta.to && delta.to.peg2) || (delta.target + '-b');
        return [
          { fn: 'Pluck', x: _xFromId(peg1, 1), energy: 0.55 },
          { fn: 'Pluck', x: _xFromId(peg2, 1), energy: 0.45 },
        ];
      }

      case 'turn-start': {
        // Soft tick — the clock of the game
        const playerX = _xFromId((delta.target || 'turn'), 0);
        return { fn: 'Pluck', x: playerX, energy: 0.2 };
      }

      default:
        return null;
    }
  }

  // ── Trigger a voice description via the instrument ────────────────────
  function _fire(desc) {
    if (!desc || !INSTR) return;
    const entries = Array.isArray(desc) ? desc : [desc];
    for (const d of entries) {
      const fn = d.fn || 'Pluck';
      const opts = Object.assign({}, d.opts || {});
      if (d.segments) opts.segments = d.segments;
      if (fn === 'Voice') INSTR.Voice(d.x, opts);
      else if (fn === 'Burst') INSTR.Burst(d.x, d.energy, opts);
      else if (fn === 'Stream') INSTR.Stream(d.x, opts);
      else INSTR.Pluck(d.x, d.energy, opts);
    }
  }

  // ── FastTrackSound public API ─────────────────────────────────────────

  let _game = null;
  let _conductor = null;
  let _interval = null;
  let _counters = { cuts: 0 };
  let _bound = false;
  let _musicOn = true;
  let _sfxOn = true;

  /**
   * Initialise the sound lens.
   *
   * @param {AudioContext} audioContext   — caller-created (after user gesture)
   * @param {FastTrackGame} game          — the live game instance
   * @param {object} [opts]
   * @param {boolean} [opts.music=true]   — enable background music
   * @param {boolean} [opts.sfx=true]     — enable sound effects
   * @param {number}  [opts.masterGain=0.7]
   * @param {string}  [opts.workletPath]  — override worklet URL
   * @returns {Promise<void>}
   */
  function init(audioContext, game, opts) {
    const o = opts || {};
    _game = game;
    _musicOn = o.music !== false;
    _sfxOn = o.sfx !== false;
    _counters = { cuts: 0 };

    if (!INSTR) return Promise.reject(new Error('FastTrackSound: ManifoldInstrument not available'));

    return INSTR.bind(audioContext, {
      masterGain: o.masterGain != null ? o.masterGain : 0.7,
      workletPath: o.workletPath || '/js/manifold-instrument.worklet.js',
    }).then(() => {
      _bound = true;
      if (_musicOn && CONDUCTOR) {
        _startConductor();
      }
    });
  }

  function _startConductor() {
    if (!CONDUCTOR || !_game) return;
    const seedX = _xFromId(_game.id, 0);
    _conductor = CONDUCTOR.create({
      seed: seedX.seed,
      stateFn: () => _stateVector(_game, _counters),
    });

    // First musical phrase immediately
    _conductor.tick();
    if (_bound) _conductor.play(4);

    // Tick every ~250 ms — music walks the manifold continuously
    _interval = setInterval(() => {
      if (!_musicOn) return;
      _conductor.tick();
      if (_bound) _conductor.play(4);
    }, 250);
  }

  /**
   * Process a batch of deltas — call this immediately after drainDeltas().
   * Produces sound effects for every meaningful change.
   * Also updates internal counters used by the conductor state vector.
   *
   * @param {object[]} deltas — from FastTrackGame.drainDeltas()
   */
  function tick(deltas) {
    if (!deltas || !deltas.length) return;   // nothing changed — nothing to play
    for (const delta of deltas) {
      // Track cuts for conductor state vector
      if (delta.type === 'peg-cut') _counters.cuts = (_counters.cuts || 0) + 1;

      if (_sfxOn && _bound) {
        const desc = _voiceForDelta(delta, _game);
        if (desc) _fire(desc);
      }
    }
  }

  /**
   * Stop all sound and release resources.
   */
  function dispose() {
    if (_interval) { clearInterval(_interval); _interval = null; }
    _conductor = null;
    _bound = false;
    _game = null;
  }

  /** Toggle background music without restarting. */
  function setMusic(on) {
    _musicOn = !!on;
  }

  /** Toggle sound effects without restarting. */
  function setSfx(on) {
    _sfxOn = !!on;
  }

  /**
   * Return the current conductor section (for UI visualisers — BPM, mode, etc.)
   * Returns null before init() or if music is off.
   */
  function currentSection() {
    return _conductor ? _conductor.lastSection() : null;
  }

  return { init, tick, dispose, setMusic, setSfx, currentSection };
});
