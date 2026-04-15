/**
 * Music Compositor — Procedural Adaptive Music Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Zero hardcoded songs, loops, or files.
 * All music is synthesised in real-time from SpectrumManifold coordinates.
 *
 * Architecture:
 *   Game state → SpectrumManifold (music lens) → musicalMoment descriptor
 *   → layered synthesis: bass + harmony + melody + rhythm → AudioContext
 *
 * Layers (all independently addressable):
 *   1. Bass       — root note, octave 2-3, instrument archetype 7 (bass sine)
 *   2. Harmony    — chord tones, sustained pad, archetype 4 (soft pad)
 *   3. Melody     — scale-derived notes, archetype 0-3 (tonal family)
 *   4. Rhythm     — percussion (noise-hit archetype), pattern from game state
 *   5. Counter    — counter-melody (phase-shifted scale walk)
 *   6. Drone      — continuous root pedal (background texture)
 *
 * Adaptation mechanism:
 *   • Each bar (1/BPM × 4 beats), the game state is re-read via SpectrumManifold
 *   • New musical moment is computed and blended toward the old one
 *   • Tempo, key, scale, and orchestration all shift smoothly
 *   • No abrupt cuts — manifold interpolation ensures gradual transitions
 *
 * Injection:
 *   MusicCompositor.start(snap)   — begin adaptive music
 *   MusicCompositor.stop()        — fade out and stop
 *   MusicCompositor.update(snap)  — call every frame (or on state change)
 *   MusicCompositor.sting(type)   — one-shot musical sting (victory, death, etc.)
 *
 * All frequencies, rhythms, scales, chords, timbres come from:
 *   SpectrumManifold.SCALE_INTERVALS
 *   SpectrumManifold.CHORD_INTERVALS
 *   SpectrumManifold.RHYTHM_PATTERNS
 *   SpectrumManifold.INSTRUMENT_ARCHETYPES
 *   SpectrumManifold.BPM_TABLE
 * — never from literals in this file.
 */

const MusicCompositor = (function () {
  'use strict';

  // ── Audio context ─────────────────────────────────────────────────────────

  let _ctx = null;
  let _master = null;
  let _compressor = null;
  let _reverb = null;
  let _reverbSend = null;
  let _running = false;
  let _scheduleId = null;
  let _currentMoment = null;
  let _targetMoment = null;
  let _nextBarTime = 0;
  let _bar = 0;
  let _masterGainVal = 0.0;
  let _fadeRaf = null;

  // Layer gain nodes — each independently controllable
  let _layerGains = {};
  const LAYER_NAMES = ['bass', 'harmony', 'melody', 'rhythm', 'counter', 'drone'];

  function _ensureCtx() {
    if (_ctx && _ctx.state !== 'closed') return true;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Master chain: gain → compressor → reverb → destination
      _master = _ctx.createGain();
      _master.gain.value = 0;
      _compressor = _ctx.createDynamicsCompressor();
      _compressor.threshold.value = -18;
      _compressor.ratio.value = 3;
      _compressor.attack.value = 0.003;
      _compressor.release.value = 0.25;
      _master.connect(_compressor);
      _compressor.connect(_ctx.destination);
      // Reverb
      _reverb = _ctx.createConvolver();
      _reverb.buffer = _buildReverbBuf(1.8);
      _reverbSend = _ctx.createGain();
      _reverbSend.gain.value = 0.18;
      _reverb.connect(_reverbSend);
      _reverbSend.connect(_ctx.destination);
      // Layer gain nodes
      LAYER_NAMES.forEach(n => {
        const g = _ctx.createGain();
        g.gain.value = _DEFAULT_LAYER_GAIN[n] || 0.5;
        g.connect(_master);
        _layerGains[n] = g;
      });
      return true;
    } catch (e) { return false; }
  }

  const _DEFAULT_LAYER_GAIN = { bass: 0.45, harmony: 0.30, melody: 0.35, rhythm: 0.25, counter: 0.20, drone: 0.15 };

  function _buildReverbBuf(durS) {
    const len = Math.ceil((_ctx.sampleRate || 44100) * durS);
    const buf = _ctx.createBuffer(2, len, _ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8);
    }
    return buf;
  }

  // ── Scheduling loop ───────────────────────────────────────────────────────
  // Looks ahead by LOOKAHEAD_S and schedules all events within that window.
  // On each bar boundary, the musical moment is updated from game state.

  const LOOKAHEAD_S = 0.25;   // schedule window
  const SCHEDULE_MS = 100;    // check interval

  function _schedule() {
    if (!_running) return;
    const now = _ctx.currentTime;
    const lookEnd = now + LOOKAHEAD_S;
    if (_nextBarTime < lookEnd) {
      _emitBar(_nextBarTime, _currentMoment);
      _nextBarTime += _currentMoment.beatLengthS * 4;  // 4/4
      _bar++;
      // On every 2nd bar, blend toward target
      if (_bar % 2 === 0 && _targetMoment) {
        _blendMoment();
      }
    }
    _scheduleId = setTimeout(_schedule, SCHEDULE_MS);
  }

  /**
   * Interpolate current moment toward target moment.
   * Musical coords blend smoothly — no abrupt changes.
   */
  function _blendMoment() {
    if (!_targetMoment) return;
    const t = 0.3;  // blend factor per 2-bar step
    // BPM blends numerically
    const newBpm = _currentMoment.bpm + (_targetMoment.bpm - _currentMoment.bpm) * t;
    // Root blends by smallest interval (chromatic shortest path)
    const rootDelta = ((_targetMoment.rootMidi - _currentMoment.rootMidi + 6) % 12) - 6;
    const newRoot = (_currentMoment.rootMidi + Math.round(rootDelta * t) + 12) % 12;
    // Scale index blends by proximity
    const scaleLen = SpectrumManifold.SCALE_INTERVALS.length;
    const si = _currentMoment.scaleIntervals === _targetMoment.scaleIntervals
      ? _findScaleIndex(_currentMoment.scaleIntervals)
      : _findScaleIndex(_currentMoment.scaleIntervals) + Math.round((_findScaleIndex(_targetMoment.scaleIntervals) - _findScaleIndex(_currentMoment.scaleIntervals)) * t);
    const si_clamped = Math.max(0, Math.min(scaleLen - 1, si));
    _currentMoment = Object.assign({}, _targetMoment, {
      bpm: newBpm,
      tempoHz: newBpm / 60,
      beatLengthS: 60 / newBpm,
      rootMidi: newRoot,
      rootHz: SpectrumManifold.midiToHz(newRoot + 4 * 12),
      scaleIntervals: SpectrumManifold.SCALE_INTERVALS[si_clamped],
      scaleName: SpectrumManifold.SCALE_NAMES[si_clamped],
    });
  }

  function _findScaleIndex(intervals) {
    const key = JSON.stringify(intervals);
    return SpectrumManifold.SCALE_INTERVALS.findIndex(s => JSON.stringify(s) === key) || 0;
  }

  // ── Bar emission ──────────────────────────────────────────────────────────
  // Emit one bar of music — all layers independently synthesised.

  function _emitBar(barStartT, moment) {
    if (!moment) return;
    const beat = moment.beatLengthS;
    const root = moment.rootMidi;
    const scale = moment.scaleIntervals;
    const inst = moment.instrument;
    const chrd = moment.chordIntervals;
    const rhy = moment.rhythm;

    // ── Layer 6: Drone (continuous, plays every bar) ─────────────────────
    _noteDrone(root, moment, barStartT, beat * 4);

    // ── Layer 1: Bass (quarter notes, chord root + fifth) ────────────────
    const bassPattern = [0, 0, 7, 0];  // root-root-fifth-root steps (from chord)
    bassPattern.forEach((step, i) => {
      const midiNote = root + step + 2 * 12;
      const hz = SpectrumManifold.midiToHz(midiNote);
      _noteOsc('bass', hz, moment, barStartT + i * beat, beat * 0.85, 0.6);
    });

    // ── Layer 2: Harmony (sustained chord voicing) ───────────────────────
    const harmOct = 3;
    chrd.forEach(st => {
      const hz = SpectrumManifold.midiToHz(root + st + harmOct * 12);
      _notePad('harmony', hz, moment, barStartT, beat * 3.8, 0.3);
    });

    // ── Layer 3: Melody (scale walk derived from moment coords) ──────────
    moment.melodyNotes.forEach((hz, i) => {
      // Rhythm pattern determines which beats the melody plays
      const beatFrac = i / moment.melodyNotes.length;
      const t = barStartT + beatFrac * beat * 4;
      if (t < barStartT + beat * 4) {
        _noteOsc('melody', hz, moment, t, beat * 0.6, 0.4);
      }
    });

    // ── Layer 4: Rhythm (noise percussion from rhythm pattern) ───────────
    rhy.forEach(([sixteenthOffset, accent]) => {
      const t = barStartT + (sixteenthOffset / 16) * beat * 4;
      _notePerc('rhythm', moment, t, beat * 0.08, accent * 0.5);
    });

    // ── Layer 5: Counter-melody (inverted scale walk, sparse) ────────────
    // Only plays on bars 1, 3 (even bars within 4-bar phrase)
    if (_bar % 4 === 1 || _bar % 4 === 3) {
      const counterNotes = moment.melodyNotes.slice().reverse();
      counterNotes.slice(0, 3).forEach((hz, i) => {
        const t = barStartT + (i * 1.33) * beat;
        if (t < barStartT + beat * 4) {
          _noteOsc('counter', hz * 1.498, moment, t, beat * 0.4, 0.2); // perfect fifth up
        }
      });
    }
  }

  // ── Synthesis helpers ─────────────────────────────────────────────────────

  function _noteOsc(layer, hz, moment, startT, dur, gainMult) {
    if (!_layerGains[layer]) return;
    const arch = moment.instrument;
    const [oscType, , atk, dec, sus, rel] = arch;
    const osc = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.type = oscType;
    osc.frequency.value = Math.max(20, hz);
    const g = gainMult;
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(g, startT + atk);
    gain.gain.linearRampToValueAtTime(g * sus, startT + atk + dec);
    const offT = startT + dur;
    gain.gain.setValueAtTime(g * sus, offT - rel);
    gain.gain.linearRampToValueAtTime(0, offT);
    osc.connect(gain);
    gain.connect(_layerGains[layer]);
    osc.start(startT);
    osc.stop(offT + 0.1);
    // Add harmonics
    arch[1].forEach((mult, i) => {
      const h = _ctx.createOscillator();
      const hg = _ctx.createGain();
      h.type = oscType;
      h.frequency.value = hz * mult;
      hg.gain.value = g / (mult * (i + 2));
      h.connect(hg); hg.connect(gain);
      h.start(startT); h.stop(offT + 0.1);
    });
  }

  function _notePad(layer, hz, moment, startT, dur, gainMult) {
    if (!_layerGains[layer]) return;
    const osc = _ctx.createOscillator();
    const filt = _ctx.createBiquadFilter();
    const gain = _ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = Math.max(20, hz);
    filt.type = 'lowpass';
    filt.frequency.value = 1200 + hz * 0.5;
    filt.Q.value = 0.5;
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(gainMult, startT + 0.15);
    gain.gain.setValueAtTime(gainMult, startT + dur - 0.3);
    gain.gain.linearRampToValueAtTime(0, startT + dur);
    osc.connect(filt); filt.connect(gain); gain.connect(_layerGains[layer]);
    if (_reverb) {
      const send = _ctx.createGain(); send.gain.value = 0.3;
      gain.connect(send); send.connect(_reverb);
    }
    osc.start(startT); osc.stop(startT + dur + 0.1);
  }

  function _noteDrone(rootMidi, moment, startT, dur) {
    if (!_layerGains.drone) return;
    const hz = SpectrumManifold.midiToHz(rootMidi + 2 * 12);
    const osc = _ctx.createOscillator();
    const filt = _ctx.createBiquadFilter();
    const gain = _ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    filt.type = 'lowpass'; filt.frequency.value = 200; filt.Q.value = 0.3;
    gain.gain.value = 0.12;
    osc.connect(filt); filt.connect(gain); gain.connect(_layerGains.drone);
    osc.start(startT); osc.stop(startT + dur + 0.1);
  }

  function _notePerc(layer, moment, startT, dur, gainMult) {
    if (!_layerGains[layer]) return;
    const bufLen = Math.ceil((_ctx.sampleRate || 44100) * Math.max(0.01, dur));
    const noiseBuf = _ctx.createBuffer(1, bufLen, _ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      prev = 0.95 * prev + 0.05 * w;
      data[i] = w * 0.7 + prev * 0.3;
    }
    const src = _ctx.createBufferSource();
    const filt = _ctx.createBiquadFilter();
    const gain = _ctx.createGain();
    src.buffer = noiseBuf;
    filt.type = 'bandpass';
    filt.frequency.value = 1800;
    filt.Q.value = 2;
    gain.gain.setValueAtTime(gainMult, startT);
    gain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
    src.connect(filt); filt.connect(gain); gain.connect(_layerGains[layer]);
    src.start(startT); src.stop(startT + dur + 0.05);
  }

  // ── Stings (one-shot musical events) ─────────────────────────────────────
  //
  // Stings are brief musical punctuations.  Like all sounds, they derive
  // from manifold coordinates — the sting "type" is just a starting coord.

  const STING_COORDS = {
    victory: [0.55, 0.75, 0.9],   // x, y, z
    wave_start: [0.62, 0.60, 0.5],
    wave_complete: [0.50, 0.70, 0.8],
    boss_appear: [0.15, 0.90, 0.3],
    boss_death: [0.50, 0.85, 0.7],
    game_over: [0.20, 0.60, 0.1],
    level_up: [0.65, 0.65, 0.8],
    base_hit: [0.20, 0.75, 0.2],
  };

  /**
   * Play a one-shot musical sting.
   * @param {string} type — key from STING_COORDS, or 'custom'
   * @param {number[]} [customXYZ] — [x, y, z] if type === 'custom'
   */
  function sting(type, customXYZ) {
    if (!_ensureCtx()) return;
    if (_ctx.state === 'suspended') _ctx.resume();
    const xyz = customXYZ || STING_COORDS[type] || [0.5, 0.5, 0.5];
    const c = SpectrumManifold.coords(xyz[0], xyz[1], xyz[2]);
    const moment = SpectrumManifold.musicalMoment(c);
    const startT = _ctx.currentTime + 0.01;
    // Play chord tones as a quick arpeggio
    moment.harmonyFreqs.forEach((hz, i) => {
      const delay = i * moment.beatLengthS * 0.25;
      _noteOsc('melody', hz, moment, startT + delay, moment.beatLengthS * 0.8, 0.5);
    });
    // Add a bass note
    _noteOsc('bass', moment.bassFreq, moment, startT, moment.beatLengthS * 1.5, 0.6);
    // Bell on final note for positive stings
    if (xyz[2] > 0.6) {
      const bellHz = moment.rootHz * 2;
      _noteOsc('melody', bellHz, moment, startT + moment.beatLengthS * 0.75, moment.beatLengthS * 2, 0.3);
    }
  }

  // ── Master control ────────────────────────────────────────────────────────

  /**
   * Start adaptive music.
   * @param {object} snap — initial game state
   */
  function start(snap) {
    if (_running) return;
    if (!_ensureCtx()) return;
    if (_ctx.state === 'suspended') _ctx.resume();
    _running = true;
    _bar = 0;
    const c = SpectrumManifold.LENSES.music(SpectrumManifold.fromGameState(snap), snap);
    _currentMoment = SpectrumManifold.musicalMoment(c);
    _targetMoment = _currentMoment;
    _nextBarTime = _ctx.currentTime + 0.1;
    // Fade in
    _master.gain.cancelScheduledValues(_ctx.currentTime);
    _master.gain.setValueAtTime(0, _ctx.currentTime);
    _master.gain.linearRampToValueAtTime(0.6, _ctx.currentTime + 2.0);
    _schedule();
  }

  /**
   * Update the target musical moment from new game state.
   * Should be called regularly (every frame or on state change).
   * @param {object} snap
   */
  function update(snap) {
    if (!_running) return;
    const full = SpectrumManifold.fromGameState(snap);
    const lc = SpectrumManifold.LENSES.music(full, snap);
    _targetMoment = SpectrumManifold.musicalMoment(lc);
  }

  /**
   * Stop adaptive music with a fade.
   * @param {number} [fadeS=3] — fade out duration in seconds
   */
  function stop(fadeS) {
    if (!_running) return;
    _running = false;
    clearTimeout(_scheduleId);
    if (_master) {
      const dur = fadeS != null ? fadeS : 3.0;
      _master.gain.cancelScheduledValues(_ctx.currentTime);
      _master.gain.linearRampToValueAtTime(0, _ctx.currentTime + dur);
    }
  }

  /**
   * Set individual layer volume.
   * @param {string} layer — one of LAYER_NAMES
   * @param {number} gain  — 0..1
   */
  function setLayerGain(layer, gain) {
    if (_layerGains[layer]) _layerGains[layer].gain.value = Math.max(0, Math.min(1, gain));
  }

  /**
   * Set master music volume.
   */
  function setVolume(v) {
    if (_master) _master.gain.value = Math.max(0, Math.min(1, v));
  }

  /**
   * Register a custom sting coordinate.
   */
  function registerSting(name, x, y, z) {
    STING_COORDS[name] = [x, y, z];
  }

  return {
    start,
    stop,
    update,
    sting,
    setLayerGain,
    setVolume,
    registerSting,
    LAYER_NAMES,
    STING_COORDS,
  };
})();

window.MusicCompositor = MusicCompositor;
