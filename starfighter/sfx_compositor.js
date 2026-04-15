/**
 * SFX Compositor — Procedural Sound Effects Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Zero hardcoded sounds.  Every SFX is a coordinate on the SpectrumManifold.
 *
 * Architecture:
 *   Game event → event descriptor (type + snap) → manifold coords via SFX lens
 *   → SFX synthesis parameters → Web Audio graph → speaker
 *
 * An "event" is itself just a point: (eventClass, intensity, spatialAngle).
 * These three numbers fully describe what sound to make.  No switch blocks,
 * no named sound files — the coordinate IS the sound.
 *
 * Building blocks:
 *   • Oscillator layers  (fundamental + harmonics from instrument archetype)
 *   • Noise layer        (white/pink noise shaped by filter)
 *   • Ring modulator     (AM for metallic/alien timbres)
 *   • Frequency sweep    (glide for Doppler, alerts, impacts)
 *   • Spatial panning    (stereo or HRTF from spatial angle)
 *   • Reverb / delay     (from room-size manifold coordinate)
 *   • Envelope (ADSR)    (from instrument archetype table)
 *
 * Injection:
 *   SFXCompositor.trigger(eventType, snap, options)
 *   SFXCompositor.triggerAt(eventType, x, y, z)   ← direct manifold address
 *
 * No external files.  No enumerated sound lists.  No hardcoded frequencies.
 */

const SFXCompositor = (function () {
  'use strict';

  // ── Audio context management ──────────────────────────────────────────────

  let _ctx = null;
  let _master = null;
  let _reverb = null;
  let _reverbWet = null;

  function _ensureCtx() {
    if (_ctx && _ctx.state !== 'closed') return true;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _master = _ctx.createGain();
      _master.gain.value = 0.7;
      _master.connect(_ctx.destination);
      _buildReverb();
      return true;
    } catch (e) { return false; }
  }

  function _buildReverb() {
    // Synthesise a short reverb impulse response (no file)
    const len = _ctx.sampleRate * 1.2;
    const buf = _ctx.createBuffer(2, len, _ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    _reverb = _ctx.createConvolver();
    _reverb.buffer = buf;
    _reverbWet = _ctx.createGain();
    _reverbWet.gain.value = 0.15;
    _reverb.connect(_reverbWet);
    _reverbWet.connect(_master);
  }

  // ── Event Class Table ─────────────────────────────────────────────────────
  //
  // Maps event type names → (x, y) in the SFX manifold.
  // x = frequency axis (determines base pitch + instrument family)
  // y = amplitude axis (determines loudness + envelope character)
  //
  // ALL events are coordinates — no switches, no hardcoded waveforms.
  // Intensity (z) is provided at trigger time.

  const EVENT_COORDS = {
    // ── Combat ──────────────────────────────────────────────────────────────
    laser_fire: [0.72, 0.55],   // high freq, medium intensity
    laser_impact: [0.60, 0.65],
    explosion_small: [0.25, 0.75],   // low freq, high intensity
    explosion_medium: [0.20, 0.85],
    explosion_large: [0.14, 0.95],
    torpedo_launch: [0.30, 0.70],
    torpedo_impact: [0.18, 0.90],
    shield_hit: [0.55, 0.50],
    shield_down: [0.50, 0.80],
    hull_crack: [0.35, 0.65],
    hull_critical: [0.28, 0.85],
    // ── Enemy events ────────────────────────────────────────────────────────
    enemy_spawn: [0.65, 0.45],
    enemy_death: [0.22, 0.70],
    dreadnought_fire: [0.10, 0.90],
    hive_pulse: [0.12, 0.80],
    hive_queen_scream: [0.08, 0.95],
    alien_beam: [0.40, 0.75],
    // ── Player systems ──────────────────────────────────────────────────────
    engine_boost: [0.38, 0.60],
    engine_cut: [0.30, 0.40],
    afterburner: [0.42, 0.70],
    fuel_warning: [0.80, 0.50],
    lock_on: [0.85, 0.55],
    lock_lost: [0.78, 0.45],
    // ── Base / carrier ──────────────────────────────────────────────────────
    base_hit: [0.20, 0.75],
    base_critical: [0.16, 0.90],
    docking_clamp: [0.35, 0.55],
    launch_catapult: [0.25, 0.80],
    // ── UI / navigation ─────────────────────────────────────────────────────
    ui_confirm: [0.78, 0.30],
    ui_cancel: [0.70, 0.30],
    ui_alert: [0.82, 0.55],
    wave_start: [0.60, 0.65],
    wave_complete: [0.50, 0.70],
    victory: [0.55, 0.75],
    game_over: [0.20, 0.60],
    // ── Ambient ─────────────────────────────────────────────────────────────
    sensor_ping: [0.90, 0.25],
    comms_open: [0.75, 0.35],
    comms_close: [0.73, 0.30],
    power_up: [0.65, 0.50],
    power_down: [0.45, 0.45],
  };

  // ── SFX Layer Functions ───────────────────────────────────────────────────
  //
  // Each returns an AudioNode connected into the graph.  All parameters are
  // derived from manifold coords — never hardcoded.

  /**
   * Oscillator layer: fundamental + harmonic overtones.
   * c      — SpectrumManifold coords
   * desc   — sfx substrate descriptor from SpectrumManifold
   * dest   — destination AudioNode
   * startT — AudioContext time
   */
  function _layerOscillator(c, desc, dest, startT, durOverride) {
    const arch = SpectrumManifold.INSTRUMENT_ARCHETYPES[desc.archetype];
    const [oscType, harmonics, atk, dec, sus, rel] = arch;
    const dur = durOverride || desc.duration;
    const endT = startT + dur;

    // Filter
    const filt = _ctx.createBiquadFilter();
    filt.type = desc.filterType || 'lowpass';
    filt.frequency.value = desc.filterHz || 4000;
    filt.Q.value = 0.8 + c.r * 4;
    filt.connect(dest);

    // Fundamental
    const osc = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type = oscType;
    osc.frequency.value = desc.hz;
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(desc.gain, startT + atk);
    gain.gain.linearRampToValueAtTime(desc.gain * sus, startT + atk + dec);
    gain.gain.setValueAtTime(desc.gain * sus, endT - rel);
    gain.gain.linearRampToValueAtTime(0, endT);
    osc.connect(gain);
    gain.connect(filt);
    osc.start(startT);
    osc.stop(endT + 0.05);

    // Harmonics — each at a fractional gain
    harmonics.forEach((mult, i) => {
      const h = _ctx.createOscillator();
      const hg = _ctx.createGain();
      h.type = oscType;
      h.frequency.value = desc.hz * mult;
      hg.gain.value = desc.gain / (mult * (i + 2));
      h.connect(hg);
      hg.connect(filt);
      h.start(startT);
      h.stop(endT + 0.05);
    });
  }

  /**
   * Noise layer: white noise shaped by a bandpass filter.
   * Used for explosions, impacts, engine hiss, etc.
   */
  function _layerNoise(c, desc, dest, startT, durOverride) {
    const dur = durOverride || desc.duration;
    const bufLen = Math.ceil(_ctx.sampleRate * dur);
    const noiseBuf = _ctx.createBuffer(1, bufLen, _ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    // Pink-ish noise: each sample = avg of 3 white samples (cheap 1/f approx)
    let prev = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      prev = 0.97 * prev + 0.03 * w;  // simple IIR low shelf
      data[i] = w * 0.7 + prev * 0.3;
    }
    const src = _ctx.createBufferSource();
    const filt = _ctx.createBiquadFilter();
    const gain = _ctx.createGain();
    src.buffer = noiseBuf;
    filt.type = 'bandpass';
    filt.frequency.value = desc.hz * (0.5 + c.y);
    filt.Q.value = 1 + c.r * 3;
    gain.gain.setValueAtTime(desc.gain * 0.4, startT);
    gain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(dest);
    src.start(startT);
    src.stop(startT + dur + 0.05);
  }

  /**
   * Frequency sweep layer: portamento from start to end frequency.
   * Used for Doppler effects, rising alerts, falling impacts.
   */
  function _layerSweep(startHz, endHz, desc, dest, startT, durOverride) {
    const dur = durOverride || desc.duration;
    const osc = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startHz, startT);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endHz, 10), startT + dur);
    gain.gain.setValueAtTime(desc.gain * 0.5, startT);
    gain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startT);
    osc.stop(startT + dur + 0.05);
  }

  /**
   * Ring modulator: amplitude modulation for metallic / alien timbres.
   */
  function _layerRingMod(carrierHz, modHz, desc, dest, startT, durOverride) {
    const dur = durOverride || desc.duration;
    const carrier = _ctx.createOscillator();
    const modulator = _ctx.createOscillator();
    const modGain = _ctx.createGain();
    const outGain = _ctx.createGain();
    carrier.frequency.value = carrierHz;
    modulator.frequency.value = modHz;
    modGain.gain.value = carrierHz * 0.5;
    outGain.gain.setValueAtTime(desc.gain * 0.4, startT);
    outGain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);  // AM
    carrier.connect(outGain);
    outGain.connect(dest);
    carrier.start(startT);
    modulator.start(startT);
    carrier.stop(startT + dur + 0.05);
    modulator.stop(startT + dur + 0.05);
  }

  /**
   * Panner: route audio to stereo position based on manifold z (spatial angle).
   * Returns a StereoPannerNode or a plain GainNode fallback.
   */
  function _makePanner(c, desc) {
    try {
      const pan = _ctx.createStereoPanner();
      pan.pan.value = desc.pan;
      pan.connect(_master);
      if (_reverb) {
        const reverbSend = _ctx.createGain();
        reverbSend.gain.value = 0.1 + c.y * 0.2;
        pan.connect(reverbSend);
        reverbSend.connect(_reverb);
      }
      return pan;
    } catch (_) {
      const g = _ctx.createGain();
      g.connect(_master);
      return g;
    }
  }

  // ── Synthesis Strategies ──────────────────────────────────────────────────
  //
  // The archetype index (from SpectrumManifold) selects a synthesis strategy.
  // Index ranges map naturally to timbral families:
  //   0-3  → pure/warm tones (sine/triangle)   → status, UI, soft events
  //   4-7  → padded/sustained                  → ambient, BGM stabs
  //   8-11 → bell/pluck/attack                 → impacts, hits
  //  12-15 → harsh/buzz/stab                   → danger, explosions

  const _STRATEGIES = [
    // 0-3: tonal
    (c, d, dest, t, dur) => _layerOscillator(c, d, dest, t, dur),
    (c, d, dest, t, dur) => _layerOscillator(c, d, dest, t, dur),
    (c, d, dest, t, dur) => _layerOscillator(c, d, dest, t, dur),
    (c, d, dest, t, dur) => _layerOscillator(c, d, dest, t, dur),
    // 4-7: padded
    (c, d, dest, t, dur) => _layerOscillator(c, d, dest, t, dur),
    (c, d, dest, t, dur) => { _layerOscillator(c, d, dest, t, dur * 0.3); _layerNoise(c, d, dest, t, dur * 0.7); },
    (c, d, dest, t, dur) => _layerOscillator(c, d, dest, t, dur),
    (c, d, dest, t, dur) => { _layerOscillator(c, d, dest, t, dur); _layerNoise(c, d, dest, t, dur * 0.2); },
    // 8-11: attack/bell
    (c, d, dest, t, dur) => { _layerOscillator(c, d, dest, t, dur); _layerSweep(d.hz * 1.5, d.hz, d, dest, t, dur * 0.3); },
    (c, d, dest, t, dur) => { _layerSweep(d.hz * 2, d.hz * 0.5, d, dest, t, dur); _layerNoise(c, d, dest, t, dur * 0.1); },
    (c, d, dest, t, dur) => { _layerOscillator(c, d, dest, t, dur * 0.2); _layerNoise(c, d, dest, t, dur); },
    (c, d, dest, t, dur) => { _layerSweep(d.hz, d.hz * 4, d, dest, t, dur); _layerOscillator(c, d, dest, t, dur); },
    // 12-15: harsh/impact
    (c, d, dest, t, dur) => { _layerNoise(c, d, dest, t, dur * 0.7); _layerOscillator(c, d, dest, t, dur * 0.4); },
    (c, d, dest, t, dur) => { _layerNoise(c, d, dest, t, dur); _layerSweep(d.hz * 3, d.hz * 0.2, d, dest, t, dur); },
    (c, d, dest, t, dur) => { _layerNoise(c, d, dest, t, dur); _layerRingMod(d.hz, d.hz * 0.3, d, dest, t, dur); },
    (c, d, dest, t, dur) => { _layerNoise(c, d, dest, t, dur * 0.5); _layerOscillator(c, d, dest, t, dur * 0.8); _layerSweep(d.hz * 2, d.hz * 0.1, d, dest, t, dur); },
  ];

  // ── Main trigger function ─────────────────────────────────────────────────

  /**
   * Trigger a sound effect by event type.
   * @param {string} eventType — key from EVENT_COORDS (or custom)
   * @param {object} [snap]    — game state snapshot (for manifold derivation)
   * @param {object} [opts]    — { intensity: 0-1, spatialAngle: radians, durationMult: 1.0 }
   */
  function trigger(eventType, snap, opts) {
    if (!_ensureCtx()) return;
    if (_ctx.state === 'suspended') _ctx.resume();

    const xy = EVENT_COORDS[eventType] || [0.5, 0.5];
    const intensity = (opts && opts.intensity != null) ? opts.intensity : 0.7;
    const angle = (opts && opts.spatialAngle != null) ? opts.spatialAngle : 0;
    const durMult = (opts && opts.durationMult) ? opts.durationMult : 1.0;

    // Build per-event snap extension
    const extSnap = Object.assign({}, snap || {}, { spatialAngle: angle });

    // Get full manifold coords + SFX substrate output
    const fullC = SpectrumManifold.coords(xy[0], xy[1] * intensity, angle / (2 * Math.PI));
    const desc = SpectrumManifold.SUBSTRATES.sfx(
      SpectrumManifold.LENSES.sfx(fullC, extSnap),
      extSnap
    );

    const panner = _makePanner(fullC, desc);
    const startT = _ctx.currentTime + 0.005;
    const dur = desc.duration * durMult;
    const archIdx = desc.archetype;
    const strategy = _STRATEGIES[archIdx % _STRATEGIES.length];
    strategy(fullC, desc, panner, startT, dur);
  }

  /**
   * Trigger directly from (x, y, z) manifold coordinates.
   * @param {number} x  0-1 frequency axis
   * @param {number} y  0-1 amplitude axis
   * @param {number} z  0-1 spatial/phase axis
   * @param {object} [opts] { durationMult }
   */
  function triggerAt(x, y, z, opts) {
    if (!_ensureCtx()) return;
    if (_ctx.state === 'suspended') _ctx.resume();
    const fullC = SpectrumManifold.coords(x, y, z || 0);
    const desc = SpectrumManifold.SUBSTRATES.sfx(
      SpectrumManifold.LENSES.sfx(fullC, {}), {}
    );
    const panner = _makePanner(fullC, desc);
    const startT = _ctx.currentTime + 0.005;
    const dur = desc.duration * ((opts && opts.durationMult) || 1);
    const strategy = _STRATEGIES[desc.archetype % _STRATEGIES.length];
    strategy(fullC, desc, panner, startT, dur);
  }

  /**
   * Map a Three.js world position to a spatial angle for panning.
   * Assumes player is at origin looking down -Z.
   */
  function worldPosToPan(pos, playerPos) {
    if (!pos || !playerPos) return 0;
    const dx = pos.x - (playerPos.x || 0);
    return Math.max(-1, Math.min(1, dx / 400));
  }

  /**
   * Trigger an event with a 3D world position for automatic panning.
   */
  function triggerAt3D(eventType, worldPos, playerPos, snap, opts) {
    const pan = worldPosToPan(worldPos, playerPos);
    const angle = pan * Math.PI;  // convert pan (-1..1) to angle (-π..π)
    trigger(eventType, snap, Object.assign({}, opts, { spatialAngle: angle }));
  }

  /**
   * Register a custom event type at a specific manifold coordinate.
   * @param {string} name
   * @param {number} x  0-1
   * @param {number} y  0-1
   */
  function registerEvent(name, x, y) {
    EVENT_COORDS[name] = [x, y];
  }

  /**
   * Set master SFX volume.
   */
  function setVolume(v) {
    if (_master) _master.gain.value = Math.max(0, Math.min(1, v));
  }

  // ── Integration: subscribe to SpectrumManifold updates ───────────────────
  // Automatically trigger ambient SFX based on game state changes

  let _stateSubId = null;

  function startStateReactive() {
    if (_stateSubId) return;
    _stateSubId = SpectrumManifold.subscribe('sfx', (sfxData, lc, full, snap) => {
      // Only auto-trigger at inflection moments (Schwartz Diamond near zero)
      if (full.nearZero && snap && snap.totalHostile > 0) {
        trigger('sensor_ping', snap, { intensity: 0.3 });
      }
    }, 3000);  // throttle: max once per 3 seconds
  }

  function stopStateReactive() {
    if (_stateSubId) { SpectrumManifold.unsubscribe(_stateSubId); _stateSubId = null; }
  }

  return {
    trigger,
    triggerAt,
    triggerAt3D,
    worldPosToPan,
    registerEvent,
    setVolume,
    startStateReactive,
    stopStateReactive,
    EVENT_COORDS,
  };
})();

window.SFXCompositor = SFXCompositor;
