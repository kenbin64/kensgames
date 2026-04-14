/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Starfighter Procedural Music Engine — SFMusic
 * Manifold-driven orchestral sci-fi soundtrack via Web Audio API
 *
 * MANIFOLD SUBSTRATE:
 *   Surface:  z = xy  (timing/modulation projection)
 *   Geometry: Schwartz Diamond  cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0
 *   Curvature  → filter sweeps, vibrato depth
 *   Gradient   → arpeggiator rate, percussion density
 *   Geodesic   → stereo panning flow, pitch drift
 *   Phase      → section-internal variation, chord voicing rotation
 *   Field      → spectral brightness, harmonic density
 *
 * SECTIONS (game-phase mapped):
 *   1. Launch Bay     – Em(add2), Cmaj7, G5, Dsus2/F#
 *   2. Foreboding     – Bm, Gm(b5), Ebmaj(#11), F#sus4
 *   3. Heat of Battle – Em, G, Bm, D
 *   4. Exploration     – Dmaj9, Asus2, Bm7, Gmaj7(add6)
 *   5. Enemy Nearby   – F#m, F#m/E, Dmaj(#11), C#dim7
 *   6. Opening Theme  – Em, C, G, D
 *   7. Closing Theme  – Gmaj7, D/F#, Em9, Cmaj7
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SFMusic = (function () {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let playing = false;
  let enabled = true;
  let _animFrame = null;

  // ══════════════════════════════════════
  // TEMPO & TIMING
  // ══════════════════════════════════════
  let bpm = 72;
  let beatDuration = 60 / bpm;
  let barDuration = beatDuration * 4;
  const PHRASE_BARS = 8;
  let phraseDuration = barDuration * PHRASE_BARS;

  let phraseStartTime = 0;
  const _scheduleAhead = 0.25;

  // Intensity field (0 = ambient, 1 = full battle crescendo)
  let _intensity = 0;
  let _targetIntensity = 0;
  const _intensitySmooth = 0.08;

  // Current section
  let _section = 'launch-bay';
  let _sectionBlend = 0; // 0-1 crossfade between outgoing/incoming

  // ══════════════════════════════════════
  // MANIFOLD STATE
  // ══════════════════════════════════════
  let _ms = {
    phase: 0, field: 0, gradient: 0,
    waveNorm: 0, threatNorm: 0,
    x: 0, y: 0, z: 0,
    curvature: 0, geodesic: 0,
    valid: false,
  };

  function setManifoldState(input = {}) {
    const x = Number.isFinite(input.x) ? input.x : 0;
    const y = Number.isFinite(input.y) ? input.y : 0;
    const z = Number.isFinite(input.z) ? input.z : (x * y); // z = xy

    let phase = Number.isFinite(input.phase) ? input.phase : Math.atan2(y, x);
    let field = Number.isFinite(input.field) ? input.field : Math.sin(z);
    let gradient = Number.isFinite(input.gradient) ? input.gradient : Math.sqrt(x * x + y * y);

    if (window.SpaceManifold) {
      const SM = SpaceManifold;
      if (!Number.isFinite(input.phase) && SM.helixPhase) phase = SM.helixPhase(x, y);
      if (!Number.isFinite(input.field) && SM.diamond) field = SM.diamond(x * 400, y * 400, z * 400);
      if (!Number.isFinite(input.gradient) && SM.diamondGrad) {
        const g = SM.diamondGrad(x * 400, y * 400, z * 400);
        gradient = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
      }
    }

    // Schwartz Diamond curvature approximation: second derivative of field
    const eps = 0.01;
    const fPlus = Math.cos(x + eps) * Math.cos(y) * Math.cos(z)
      - Math.sin(x + eps) * Math.sin(y) * Math.sin(z);
    const fMinus = Math.cos(x - eps) * Math.cos(y) * Math.cos(z)
      - Math.sin(x - eps) * Math.sin(y) * Math.sin(z);
    const curvature = Math.abs(fPlus + fMinus - 2 * field) / (eps * eps);

    // Geodesic flow direction (normalized gradient angle on the surface)
    const geodesic = Math.atan2(
      Math.cos(x) * Math.sin(y) - Math.sin(x) * Math.cos(y),
      Math.cos(y) * Math.sin(z) - Math.sin(y) * Math.cos(z)
    );

    _ms = {
      phase, field, gradient,
      waveNorm: Math.max(0, Math.min(1, Number.isFinite(input.waveNorm) ? input.waveNorm : 0)),
      threatNorm: Math.max(0, Math.min(1, Number.isFinite(input.threatNorm) ? input.threatNorm : 0)),
      x, y, z,
      curvature: Math.min(curvature, 10),
      geodesic,
      valid: true,
    };
  }

  // ══════════════════════════════════════
  // MIDI / FREQUENCY HELPERS
  // ══════════════════════════════════════
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // Note name → MIDI number
  const _noteMap = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };
  function noteToMidi(name, octave) {
    return 12 + (octave || 4) * 12 + (_noteMap[name] || 0);
  }

  // ══════════════════════════════════════
  // SECTION DEFINITIONS — chords as MIDI arrays
  // ══════════════════════════════════════

  // 1. Launch Bay – Em(add2), Cmaj7, G5, Dsus2/F#
  const SEC_LAUNCH_BAY = {
    name: 'launch-bay',
    bpmBase: 68, bpmRange: 6,
    chords: [
      [noteToMidi('E', 2), noteToMidi('F#', 3), noteToMidi('G', 3), noteToMidi('B', 3)],   // Em(add2)
      [noteToMidi('C', 2), noteToMidi('E', 3), noteToMidi('G', 3), noteToMidi('B', 3)],    // Cmaj7
      [noteToMidi('G', 2), noteToMidi('D', 3), noteToMidi('G', 3)],                         // G5
      [noteToMidi('F#', 2), noteToMidi('D', 3), noteToMidi('E', 3), noteToMidi('A', 3)],   // Dsus2/F#
    ],
    bass: [noteToMidi('E', 1), noteToMidi('C', 1), noteToMidi('G', 1), noteToMidi('F#', 1)],
    instruments: { pad: 1.0, bass: 0.7, tick: 0.3, arp: 0.0, brass: 0.0, drums: 0.0, bell: 0.0 },
  };

  // 2. Foreboding – Bm, Gm(b5), Ebmaj(#11), F#sus4
  const SEC_FOREBODING = {
    name: 'foreboding',
    bpmBase: 60, bpmRange: 8,
    chords: [
      [noteToMidi('B', 2), noteToMidi('D', 3), noteToMidi('F#', 3)],                        // Bm
      [noteToMidi('G', 2), noteToMidi('Bb', 3), noteToMidi('Db', 3)],                       // Gm(b5)
      [noteToMidi('Eb', 2), noteToMidi('G', 3), noteToMidi('Bb', 3), noteToMidi('A', 3)],  // Ebmaj(#11)
      [noteToMidi('F#', 2), noteToMidi('B', 3), noteToMidi('C#', 3)],                       // F#sus4
    ],
    bass: [noteToMidi('B', 1), noteToMidi('G', 1), noteToMidi('Eb', 1), noteToMidi('F#', 1)],
    instruments: { pad: 0.5, bass: 0.8, tick: 0.1, arp: 0.0, brass: 0.0, drums: 0.0, bell: 0.0, fm: 0.7 },
  };

  // 3. Heat of Battle – Em, G, Bm, D
  const SEC_BATTLE = {
    name: 'heat-of-battle',
    bpmBase: 108, bpmRange: 16,
    chords: [
      [noteToMidi('E', 2), noteToMidi('G', 3), noteToMidi('B', 3)],   // Em
      [noteToMidi('G', 2), noteToMidi('B', 3), noteToMidi('D', 3)],   // G
      [noteToMidi('B', 2), noteToMidi('D', 3), noteToMidi('F#', 3)],  // Bm
      [noteToMidi('D', 2), noteToMidi('F#', 3), noteToMidi('A', 3)],  // D
    ],
    bass: [noteToMidi('E', 1), noteToMidi('G', 1), noteToMidi('B', 1), noteToMidi('D', 1)],
    instruments: { pad: 0.4, bass: 1.0, tick: 0.0, arp: 1.0, brass: 0.8, drums: 1.0, bell: 0.0 },
  };

  // 4. Exploration – Dmaj9, Asus2, Bm7, Gmaj7(add6)
  const SEC_EXPLORATION = {
    name: 'exploration',
    bpmBase: 76, bpmRange: 8,
    chords: [
      [noteToMidi('D', 2), noteToMidi('F#', 3), noteToMidi('A', 3), noteToMidi('C#', 4), noteToMidi('E', 4)], // Dmaj9
      [noteToMidi('A', 2), noteToMidi('B', 3), noteToMidi('E', 3)],                                            // Asus2
      [noteToMidi('B', 2), noteToMidi('D', 3), noteToMidi('F#', 3), noteToMidi('A', 3)],                       // Bm7
      [noteToMidi('G', 2), noteToMidi('B', 3), noteToMidi('D', 3), noteToMidi('F#', 3), noteToMidi('E', 3)],  // Gmaj7(add6)
    ],
    bass: [noteToMidi('D', 1), noteToMidi('A', 1), noteToMidi('B', 1), noteToMidi('G', 1)],
    instruments: { pad: 0.9, bass: 0.3, tick: 0.0, arp: 0.2, brass: 0.0, drums: 0.15, bell: 0.8 },
  };

  // 5. Enemy Nearby – F#m, F#m/E, Dmaj(#11), C#dim7
  const SEC_ENEMY_NEARBY = {
    name: 'enemy-nearby',
    bpmBase: 84, bpmRange: 12,
    chords: [
      [noteToMidi('F#', 2), noteToMidi('A', 3), noteToMidi('C#', 3)],                       // F#m
      [noteToMidi('E', 2), noteToMidi('F#', 3), noteToMidi('A', 3), noteToMidi('C#', 3)],  // F#m/E
      [noteToMidi('D', 2), noteToMidi('F#', 3), noteToMidi('A', 3), noteToMidi('G#', 3)],  // Dmaj(#11)
      [noteToMidi('C#', 2), noteToMidi('E', 3), noteToMidi('G', 3), noteToMidi('Bb', 3)],  // C#dim7
    ],
    bass: [noteToMidi('F#', 1), noteToMidi('E', 1), noteToMidi('D', 1), noteToMidi('C#', 1)],
    instruments: { pad: 0.4, bass: 1.0, tick: 0.5, arp: 0.4, brass: 0.3, drums: 0.5, bell: 0.0, riser: 0.7 },
  };

  // 6. Opening Theme – Em, C, G, D
  const SEC_OPENING = {
    name: 'opening-theme',
    bpmBase: 88, bpmRange: 10,
    chords: [
      [noteToMidi('E', 2), noteToMidi('G', 3), noteToMidi('B', 3)],   // Em
      [noteToMidi('C', 2), noteToMidi('E', 3), noteToMidi('G', 3)],   // C
      [noteToMidi('G', 2), noteToMidi('B', 3), noteToMidi('D', 3)],   // G
      [noteToMidi('D', 2), noteToMidi('F#', 3), noteToMidi('A', 3)],  // D
    ],
    bass: [noteToMidi('E', 1), noteToMidi('C', 1), noteToMidi('G', 1), noteToMidi('D', 1)],
    instruments: { pad: 0.6, bass: 0.7, tick: 0.0, arp: 0.3, brass: 0.9, drums: 0.8, bell: 0.0, choir: 0.7 },
  };

  // 7. Closing Theme – Gmaj7, D/F#, Em9, Cmaj7
  const SEC_CLOSING = {
    name: 'closing-theme',
    bpmBase: 64, bpmRange: 4,
    chords: [
      [noteToMidi('G', 2), noteToMidi('B', 3), noteToMidi('D', 3), noteToMidi('F#', 3)],              // Gmaj7
      [noteToMidi('F#', 2), noteToMidi('D', 3), noteToMidi('F#', 3), noteToMidi('A', 3)],             // D/F#
      [noteToMidi('E', 2), noteToMidi('G', 3), noteToMidi('B', 3), noteToMidi('D', 3), noteToMidi('F#', 4)], // Em9
      [noteToMidi('C', 2), noteToMidi('E', 3), noteToMidi('G', 3), noteToMidi('B', 3)],               // Cmaj7
    ],
    bass: [noteToMidi('G', 1), noteToMidi('F#', 1), noteToMidi('E', 1), noteToMidi('C', 1)],
    instruments: { pad: 1.0, bass: 0.4, tick: 0.0, arp: 0.0, brass: 0.0, drums: 0.0, bell: 0.3, strings: 1.0 },
  };

  const SECTIONS = {
    'launch-bay': SEC_LAUNCH_BAY,
    'foreboding': SEC_FOREBODING,
    'heat-of-battle': SEC_BATTLE,
    'exploration': SEC_EXPLORATION,
    'enemy-nearby': SEC_ENEMY_NEARBY,
    'opening-theme': SEC_OPENING,
    'closing-theme': SEC_CLOSING,
  };

  function _getSec() { return SECTIONS[_section] || SEC_LAUNCH_BAY; }

  // ══════════════════════════════════════
  // NOISE BUFFER
  // ══════════════════════════════════════
  let _noiseBuffer = null;
  function _noise() {
    if (_noiseBuffer) return _noiseBuffer;
    const len = ctx.sampleRate * 2;
    _noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return _noiseBuffer;
  }

  // ══════════════════════════════════════
  // MANIFOLD MODULATORS
  // ══════════════════════════════════════

  // z = xy projection for timing offset (0-1 range, frac of beat)
  function mTiming(bar, beat) {
    const x = (bar * 0.31 + _ms.x) % 6.28;
    const y = (beat * 0.47 + _ms.y) % 6.28;
    return (x * y) % 1.0; // z=xy mod 1
  }

  // Schwartz Diamond curvature → filter cutoff multiplier (0.5 – 2.0)
  function mFilter() {
    return 0.5 + Math.min(1.5, _ms.curvature * 0.15 + Math.abs(_ms.field) * 0.5);
  }

  // Gradient magnitude → arpeggiator rate multiplier (0.5 – 2.0)
  function mArpRate() {
    return 0.5 + Math.min(1.5, _ms.gradient * 0.3 + _ms.threatNorm * 0.7);
  }

  // Geodesic flow → stereo pan position (-1 to 1)
  function mPan(offset) {
    const geo = _ms.geodesic + (offset || 0);
    return Math.sin(geo) * 0.6; // ±0.6 range, never hard L/R
  }

  // Phase → vibrato depth multiplier (0.5 – 1.5)
  function mVibrato() {
    return 0.5 + Math.abs(Math.sin(_ms.phase)) * 1.0;
  }

  // Field → spectral brightness (0.3 – 1.0)
  function mBrightness() {
    return 0.3 + Math.abs(_ms.field) * 0.7;
  }

  // ══════════════════════════════════════
  // STEREO PANNER NODE
  // ══════════════════════════════════════
  function _pan(value) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, value));
    return p;
  }

  // ══════════════════════════════════════
  // INSTRUMENT VOICES
  // ══════════════════════════════════════

  // ── Metallic Pad (strings / warm synth) — sustained harmonic bed ──
  function _playPad(time, notes, duration, velocity) {
    const sec = _getSec();
    const vol = velocity * 0.08 * Math.max(0.15, _intensity) * (sec.instruments.pad || 0);
    if (vol < 0.004) return;

    const filterMul = mFilter();
    const bright = mBrightness();
    const panVal = mPan(0);
    const vibMul = mVibrato();

    notes.forEach((note, i) => {
      const freq = mtof(note);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.4);
      g.gain.setValueAtTime(vol * 0.9, time + duration - 0.5);
      g.gain.linearRampToValueAtTime(0, time + duration);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      // Manifold vibrato
      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 4.5 + i * 0.2;
      const vibG = ctx.createGain();
      vibG.gain.value = freq * 0.003 * vibMul;
      vib.connect(vibG);
      vibG.connect(osc.frequency);
      vib.start(time);
      vib.stop(time + duration + 0.1);

      // Manifold-driven filter
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = (2000 + _intensity * 4000) * filterMul * bright;
      lp.Q.value = 0.7;

      const pan = _pan(panVal + i * 0.15);

      osc.connect(lp);
      lp.connect(g);
      g.connect(pan);
      pan.connect(musicGain);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  // ── Soft Strings (closing/exploration) — warmer, slower attack ──
  function _playStrings(time, notes, duration, velocity) {
    const sec = _getSec();
    const mix = sec.instruments.strings || 0;
    if (mix < 0.01) return;
    const vol = velocity * 0.07 * mix * Math.max(0.2, _intensity);
    if (vol < 0.004) return;

    const bright = mBrightness();
    const panVal = mPan(0.5);

    notes.forEach((note, i) => {
      const freq = mtof(note);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.6);
      g.gain.setValueAtTime(vol * 0.85, time + duration - 0.8);
      g.gain.linearRampToValueAtTime(0, time + duration);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 5.2 + i * 0.15;
      const vibG = ctx.createGain();
      vibG.gain.value = freq * 0.004 * mVibrato();
      vib.connect(vibG);
      vibG.connect(osc.frequency);
      vib.start(time);
      vib.stop(time + duration + 0.1);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500 * bright;
      lp.Q.value = 0.5;

      const pan = _pan(panVal + i * 0.12);
      osc.connect(lp);
      lp.connect(g);
      g.connect(pan);
      pan.connect(musicGain);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  // ── Bass sustain / chromatic creep ──
  function _playBass(time, note, duration, velocity) {
    const sec = _getSec();
    const vol = velocity * 0.18 * (sec.instruments.bass || 0) * Math.max(0.25, _intensity);
    if (vol < 0.005) return;
    const freq = mtof(note);

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.setValueAtTime(vol * 0.8, time + 0.02);
    g.gain.exponentialRampToValueAtTime(Math.max(vol * 0.3, 0.001), time + duration * 0.7);
    g.gain.linearRampToValueAtTime(0, time + duration);

    // Fundamental
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Sub octave layer
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq * 0.5;
    const subG = ctx.createGain();
    subG.gain.value = 0.5;
    sub.connect(subG);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300 + _intensity * 500 * mFilter();
    lp.Q.value = 1.0;

    osc.connect(lp);
    subG.connect(lp);
    lp.connect(g);
    g.connect(musicGain);
    osc.start(time);
    sub.start(time);
    osc.stop(time + duration + 0.1);
    sub.stop(time + duration + 0.1);
  }

  // ── Heartbeat bass (Enemy Nearby section) ──
  function _playHeartbeat(time, note, velocity) {
    const vol = velocity * 0.2 * Math.max(0.3, _intensity);
    if (vol < 0.005) return;
    const freq = mtof(note);

    // Double thump: lub-dub
    [0, 0.18].forEach((off, i) => {
      const g = ctx.createGain();
      const att = i === 0 ? vol : vol * 0.6;
      g.gain.setValueAtTime(att, time + off);
      g.gain.exponentialRampToValueAtTime(0.001, time + off + 0.3);
      g.connect(musicGain);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * (i === 0 ? 1.2 : 1.0), time + off);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + off + 0.15);
      osc.connect(g);
      osc.start(time + off);
      osc.stop(time + off + 0.35);
    });
  }

  // ── Metallic tick (launch bay ambient) ──
  function _playTick(time, velocity) {
    const sec = _getSec();
    const vol = velocity * 0.06 * (sec.instruments.tick || 0);
    if (vol < 0.003) return;

    const noise = ctx.createBufferSource();
    noise.buffer = _noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4000 + mBrightness() * 5000;
    bp.Q.value = 15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    const pan = _pan(mPan(time * 0.7));
    noise.connect(bp);
    bp.connect(g);
    g.connect(pan);
    pan.connect(musicGain);
    noise.start(time);
    noise.stop(time + 0.04);
  }

  // ── FM alien texture (foreboding section) ──
  function _playFMTexture(time, note, duration, velocity) {
    const sec = _getSec();
    const mix = sec.instruments.fm || 0;
    if (mix < 0.01) return;
    const vol = velocity * 0.06 * mix * Math.max(0.2, _intensity);
    if (vol < 0.003) return;
    const freq = mtof(note);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.2);
    g.gain.linearRampToValueAtTime(0, time + duration);

    // Carrier
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    // Modulator — manifold-driven modulation index
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * (1.414 + _ms.field * 0.3); // irrational ratio → inharmonic
    const modG = ctx.createGain();
    modG.gain.value = freq * (2 + _ms.curvature * 0.5); // modulation index from curvature
    mod.connect(modG);
    modG.connect(carrier.frequency);

    const pan = _pan(mPan(1.2));
    carrier.connect(g);
    g.connect(pan);
    pan.connect(musicGain);
    carrier.start(time);
    mod.start(time);
    carrier.stop(time + duration + 0.1);
    mod.stop(time + duration + 0.1);
  }

  // ── Soft bell (exploration section) ──
  function _playBell(time, note, duration, velocity) {
    const sec = _getSec();
    const mix = sec.instruments.bell || 0;
    if (mix < 0.01) return;
    const vol = velocity * 0.08 * mix;
    if (vol < 0.003) return;
    const freq = mtof(note);

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);

    // Bell = sine fundamental + inharmonic partials (2.76, 5.4)
    [1, 2.76, 5.4].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(vol / (1 + i * 1.5), time);
      pg.gain.exponentialRampToValueAtTime(0.001, time + duration * (1 - i * 0.2));
      const pan = _pan(mPan(i * 0.8));
      osc.connect(pg);
      pg.connect(pan);
      pan.connect(musicGain);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  // ── Brass section (cinematic, heroic) ──
  function _playBrass(time, notes, duration, velocity) {
    const sec = _getSec();
    const vol = velocity * 0.12 * (sec.instruments.brass || 0) * _intensity;
    if (vol < 0.004) return;

    const bright = mBrightness();
    const panBase = mPan(0.3);

    notes.forEach((note, i) => {
      const freq = mtof(note);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.1);
      g.gain.setValueAtTime(vol * 0.9, time + duration * 0.6);
      g.gain.linearRampToValueAtTime(0, time + duration);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.value = freq * 3;
      bp.Q.value = 2;
      bp.gain.value = 6;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = (1500 + _intensity * 3000) * bright * mFilter();
      lp.Q.value = 1;

      const pan = _pan(panBase + i * 0.2);
      osc.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(pan);
      pan.connect(musicGain);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  // ── Choir pad (opening theme) ──
  function _playChoir(time, notes, duration, velocity) {
    const sec = _getSec();
    const mix = sec.instruments.choir || 0;
    if (mix < 0.01) return;
    const vol = velocity * 0.06 * mix * Math.max(0.3, _intensity);
    if (vol < 0.003) return;

    const panBase = mPan(-0.4);
    notes.forEach((note, i) => {
      const freq = mtof(note + 12); // octave up for choir register

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.5);
      g.gain.setValueAtTime(vol * 0.8, time + duration - 0.6);
      g.gain.linearRampToValueAtTime(0, time + duration);

      // "Ooh" vowel: 2 detuned saws + formant filters
      [-3, 3].forEach(detune => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detune;

        // Vocal formants (approx "ooh")
        const f1 = ctx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.value = 300;
        f1.Q.value = 5;
        const f2 = ctx.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.value = 870;
        f2.Q.value = 5;
        const fG = ctx.createGain();
        fG.gain.value = 0.5;

        const pan = _pan(panBase + i * 0.15 + detune * 0.05);
        osc.connect(f1);
        osc.connect(f2);
        f1.connect(fG);
        f2.connect(fG);
        fG.connect(g);
        g.connect(pan);
        pan.connect(musicGain);
        osc.start(time);
        osc.stop(time + duration + 0.1);
      });
    });
  }

  // ── Arpeggiator (battle/exploration section) — manifold-rate driven ──
  function _playArp(time, chord, duration, velocity) {
    const sec = _getSec();
    const mix = sec.instruments.arp || 0;
    if (mix < 0.01) return;
    const vol = velocity * 0.07 * mix * Math.max(0.3, _intensity);
    if (vol < 0.003) return;

    const rate = mArpRate();
    const stepDur = (beatDuration / 4) / rate; // 16th note / rate
    const steps = Math.floor(duration / stepDur);
    const bright = mBrightness();

    for (let s = 0; s < steps && s < 32; s++) {
      const noteIdx = s % chord.length;
      const note = chord[noteIdx] + (Math.floor(s / chord.length) % 2 === 1 ? 12 : 0);
      const freq = mtof(note);
      const sTime = time + s * stepDur + mTiming(0, s) * stepDur * 0.1;

      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, sTime);
      g.gain.exponentialRampToValueAtTime(0.001, sTime + stepDur * 0.8);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = (1200 + s * 100) * bright * mFilter();
      lp.Q.value = 2;

      // Geodesic panning — each arp step moves across the stereo field
      const pan = _pan(Math.sin(_ms.geodesic + s * 0.4) * 0.5);

      osc.connect(lp);
      lp.connect(g);
      g.connect(pan);
      pan.connect(musicGain);
      osc.start(sTime);
      osc.stop(sTime + stepDur + 0.02);
    }
  }

  // ── Tension riser (enemy nearby) ──
  function _playRiser(time, duration, velocity) {
    const sec = _getSec();
    const mix = sec.instruments.riser || 0;
    if (mix < 0.01) return;
    const vol = velocity * 0.05 * mix * _intensity;
    if (vol < 0.003) return;

    const noise = ctx.createBufferSource();
    noise.buffer = _noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(200, time);
    bp.frequency.exponentialRampToValueAtTime(4000 * mBrightness(), time + duration);
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + duration * 0.8);
    g.gain.linearRampToValueAtTime(0, time + duration);
    noise.connect(bp);
    bp.connect(g);
    g.connect(musicGain);
    noise.start(time);
    noise.stop(time + duration + 0.1);
  }

  // ══════════════════════════════════════
  // PERCUSSION — manifold-driven density
  // ══════════════════════════════════════

  function _playKick(time, velocity) {
    const vol = velocity * 0.4 * _intensity;
    if (vol < 0.01) return;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    g.connect(musicGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.3);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + 0.5);

    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.setValueAtTime(150, time);
    click.frequency.exponentialRampToValueAtTime(20, time + 0.05);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.6, time);
    cg.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    click.connect(cg);
    cg.connect(musicGain);
    click.start(time);
    click.stop(time + 0.06);
  }

  function _playSnare(time, velocity) {
    const vol = velocity * 0.15 * _intensity;
    if (vol < 0.005) return;

    const noise = ctx.createBufferSource();
    noise.buffer = _noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    noise.connect(hp);
    hp.connect(g);
    g.connect(musicGain);
    noise.start(time);
    noise.stop(time + 0.15);

    // Tonal body
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 200;
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.4, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(og);
    og.connect(musicGain);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  function _playHat(time, velocity) {
    const vol = velocity * 0.1 * Math.max(0.3, _intensity);
    if (vol < 0.003) return;

    const noise = ctx.createBufferSource();
    noise.buffer = _noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    const pan = _pan(mPan(time * 1.3));
    noise.connect(hp);
    hp.connect(g);
    g.connect(pan);
    pan.connect(musicGain);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  function _playTimpani(time, velocity, freq) {
    const vol = velocity * 0.3 * _intensity;
    if (vol < 0.01) return;
    freq = freq || 65;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
    g.connect(musicGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.02);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + 0.8);

    const noise = ctx.createBufferSource();
    noise.buffer = _noise();
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = freq * 2;
    nf.Q.value = 5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.4, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(musicGain);
    noise.start(time);
    noise.stop(time + 0.3);
  }

  // ── Cymbal crash ──
  function _playCrash(time, velocity) {
    const vol = velocity * 0.12 * _intensity;
    if (vol < 0.005) return;

    const noise = ctx.createBufferSource();
    noise.buffer = _noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 2.0);
    noise.connect(hp);
    hp.connect(g);
    g.connect(musicGain);
    noise.start(time);
    noise.stop(time + 2.0);
  }

  // ══════════════════════════════════════
  // PERCUSSION PATTERN SCHEDULER
  // ══════════════════════════════════════

  function _scheduleDrums(barTime, bar) {
    const sec = _getSec();
    const drumMix = sec.instruments.drums || 0;
    if (drumMix < 0.01 || _intensity < 0.15) return;

    const sixteenth = beatDuration / 4;
    // Gradient drives percussion density: higher gradient = more hits
    const density = Math.min(1, _ms.gradient * 0.4 + _intensity * 0.6 + _ms.threatNorm * 0.3);

    for (let slot = 0; slot < 16; slot++) {
      const t = barTime + slot * sixteenth + mTiming(bar, slot) * sixteenth * 0.05;

      // Kick: quarter notes, add syncopation at high density
      if (slot % 4 === 0) {
        _playKick(t, (0.7 + _intensity * 0.3) * drumMix);
      } else if (density > 0.7 && (slot === 6 || slot === 14)) {
        _playKick(t, 0.5 * drumMix); // syncopated kick
      }

      // Snare: beats 2 and 4
      if (slot === 4 || slot === 12) {
        _playSnare(t, (0.6 + _intensity * 0.4) * drumMix);
      }

      // Hi-hat: 8ths or 16ths depending on density
      if (density > 0.5 && slot % 2 === 0) {
        _playHat(t, (0.4 + density * 0.3) * drumMix);
      } else if (density > 0.8 && slot % 2 === 1) {
        _playHat(t, 0.25 * drumMix); // ghost 16ths
      }
    }

    // Timpani roll on last bar of phrase
    if (bar === PHRASE_BARS - 1 && _intensity > 0.4) {
      for (let i = 0; i < 8; i++) {
        _playTimpani(barTime + i * sixteenth * 2, (0.4 + i * 0.05) * drumMix);
      }
    }

    // Crash on bar 0 (phrase start) at high intensity
    if (bar === 0 && _intensity > 0.6) {
      _playCrash(barTime, 0.7 * drumMix);
    }
  }

  // ══════════════════════════════════════
  // PHRASE SCHEDULER — the conductor
  // ══════════════════════════════════════

  function _schedulePhrase(startTime) {
    const sec = _getSec();

    for (let bar = 0; bar < PHRASE_BARS; bar++) {
      const barTime = startTime + bar * barDuration;
      const chordIdx = bar % 4;
      const chord = sec.chords[chordIdx];
      const bassNote = sec.bass[chordIdx];

      // ── Manifold timing offset per bar ──
      const tOff = mTiming(bar, 0) * beatDuration * 0.05;

      // ── Pad / Strings — sustained chord per 2-bar group ──
      if (bar % 2 === 0) {
        const padDur = barDuration * 2;
        _playPad(barTime + tOff, chord, padDur, 0.8 + _intensity * 0.2);
        _playStrings(barTime + tOff, chord, padDur, 0.7);
      }

      // ── Choir (opening theme) ──
      if (bar % 4 === 0 && sec.instruments.choir) {
        _playChoir(barTime + tOff, chord, barDuration * 4, 0.7 + _intensity * 0.3);
      }

      // ── Bass line ──
      if (sec.instruments.bass > 0.01) {
        // Chromatic creep for foreboding: bass walks between chord roots
        if (sec.name === 'foreboding') {
          const nextBass = sec.bass[(chordIdx + 1) % 4];
          const steps = 4;
          for (let s = 0; s < steps; s++) {
            const frac = s / steps;
            const midi = Math.round(bassNote + (nextBass - bassNote) * frac);
            const bTime = barTime + s * beatDuration + mTiming(bar, s) * beatDuration * 0.08;
            _playBass(bTime, midi, beatDuration * 0.9, 0.6 + _intensity * 0.3);
          }
        } else {
          // Standard bass: root on beat 1, fifth on beat 3
          _playBass(barTime + tOff, bassNote, beatDuration * 2, 0.7 + _intensity * 0.3);
          if (_intensity > 0.3 && sec.instruments.bass > 0.5) {
            const fifth = bassNote + 7; // perfect 5th
            _playBass(barTime + beatDuration * 2, fifth, beatDuration * 1.5, 0.5);
          }
        }
      }

      // ── Heartbeat bass (enemy nearby) ──
      if (sec.name === 'enemy-nearby') {
        // One heartbeat per bar, tempo follows intensity
        _playHeartbeat(barTime + tOff, bassNote, 0.7 + _intensity * 0.3);
        if (_intensity > 0.5) {
          _playHeartbeat(barTime + beatDuration * 2, bassNote, 0.4);
        }
      }

      // ── FM alien textures (foreboding) ──
      if (sec.instruments.fm) {
        if (bar % 2 === 1) {
          _playFMTexture(barTime + tOff, chord[0] + 12, barDuration * 0.8, 0.5);
        }
      }

      // ── Metallic ticks (launch bay) ──
      if (sec.instruments.tick > 0.01) {
        const tickCount = 2 + Math.floor(_ms.gradient * 4);
        for (let t = 0; t < tickCount; t++) {
          const tTime = barTime + (t / tickCount) * barDuration + mTiming(bar, t) * beatDuration * 0.15;
          _playTick(tTime, 0.4 + Math.random() * 0.3);
        }
      }

      // ── Soft bells (exploration) ──
      if (sec.instruments.bell > 0.01 && bar % 2 === 0) {
        chord.forEach((note, i) => {
          if (i > 2) return; // max 3 bell notes
          const bTime = barTime + i * beatDuration + mTiming(bar, i) * beatDuration * 0.1;
          _playBell(bTime, note + 12, beatDuration * 3, 0.5 + _ms.field * 0.2);
        });
      }

      // ── Arpeggiator (battle / exploration / enemy nearby) ──
      if (sec.instruments.arp > 0.01 && _intensity > 0.2) {
        _playArp(barTime + tOff, chord, barDuration, 0.6 + _intensity * 0.3);
      }

      // ── Brass (battle / opening theme) ──
      if (sec.instruments.brass > 0.01 && _intensity > 0.3) {
        if (bar % 4 === 0) {
          _playBrass(barTime + tOff, chord, beatDuration * 2, 0.7 + _intensity * 0.3);
        }
        // Brass stabs at high intensity
        if (_intensity > 0.7 && bar % 2 === 1) {
          _playBrass(barTime, [chord[0]], beatDuration * 0.5, 0.5);
        }
      }

      // ── Tension riser (enemy nearby, last 2 bars of phrase) ──
      if (sec.instruments.riser && bar >= PHRASE_BARS - 2) {
        _playRiser(barTime, barDuration, 0.6 + _intensity * 0.4);
      }

      // ── Drums ──
      _scheduleDrums(barTime, bar);
    }
  }

  // ── Fanfare: special brass + timpani for launch sequence ──
  function _scheduleFanfare(startTime) {
    const dur = beatDuration;

    // Switch to opening theme chords for the fanfare
    const fanfareChords = SEC_OPENING.chords;
    [
      { time: 0, chord: fanfareChords[0], dur: 2 },
      { time: 2, chord: fanfareChords[1], dur: 1.5 },
      { time: 3.5, chord: fanfareChords[2], dur: 2.5 },
      { time: 6, chord: fanfareChords[3], dur: 4 },
    ].forEach(f => {
      _playBrass(startTime + f.time * dur, f.chord, f.dur * dur, 0.85);
      _playPad(startTime + f.time * dur, f.chord, f.dur * dur, 0.6);
    });

    // Timpani roll
    for (let i = 0; i < 8; i++) {
      _playTimpani(startTime + i * dur * 0.5, 0.6 + i * 0.05);
    }

    // Cymbal crash at climax
    _playCrash(startTime + 6 * dur, 0.8);
  }

  // ══════════════════════════════════════
  // MAIN LOOP
  // ══════════════════════════════════════

  function _tick() {
    if (!playing || !ctx) return;
    _animFrame = requestAnimationFrame(_tick);

    const now = ctx.currentTime;

    // Smooth intensity
    _intensity += (_targetIntensity - _intensity) * _intensitySmooth;
    _intensity = Math.max(0, Math.min(1, _intensity));

    // Manifold-driven tempo: base from section + field/phase modulation
    const sec = _getSec();
    const fieldPulse = Math.abs(_ms.field) * 0.5;
    const phasePulse = 0.5 + 0.5 * Math.sin(_ms.phase);
    const targetBpm = sec.bpmBase + _intensity * sec.bpmRange + fieldPulse * 6 + phasePulse * 4;
    bpm += (targetBpm - bpm) * 0.01;
    beatDuration = 60 / bpm;
    barDuration = beatDuration * 4;
    phraseDuration = barDuration * PHRASE_BARS;

    // Schedule next phrase
    if (now >= phraseStartTime + phraseDuration - _scheduleAhead) {
      phraseStartTime = phraseStartTime + phraseDuration;
      if (phraseStartTime < now) phraseStartTime = now;
      _schedulePhrase(phraseStartTime);
    }
  }

  // ══════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════

  function init(audioCtx, master) {
    ctx = audioCtx;
    masterGain = master;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.35;
    musicGain.connect(masterGain);
  }

  function start() {
    if (!ctx || playing) return;
    playing = true;
    phraseStartTime = ctx.currentTime;
    _schedulePhrase(phraseStartTime);
    _tick();
  }

  function stop() {
    playing = false;
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  }

  function toggle() {
    enabled = !enabled;
    if (enabled) {
      if (musicGain) musicGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.5);
      if (!playing) start();
    } else {
      if (musicGain) musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    }
    return enabled;
  }

  function isEnabled() { return enabled; }
  function isPlaying() { return playing; }

  function setIntensity(value) {
    _targetIntensity = Math.max(0, Math.min(1, value));
  }

  /**
   * Set the active music section. Sections map to game phases:
   *   'launch-bay' | 'foreboding' | 'heat-of-battle' | 'exploration'
   *   'enemy-nearby' | 'opening-theme' | 'closing-theme'
   */
  function setSection(name) {
    if (SECTIONS[name] && name !== _section) {
      _section = name;
    }
  }

  function getSection() { return _section; }

  function triggerFanfare() {
    if (!ctx || !playing || !enabled) return;
    _scheduleFanfare(ctx.currentTime);
  }

  function setVolume(v) {
    if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, v)) * 0.35;
  }

  return {
    init,
    start,
    stop,
    toggle,
    isEnabled,
    isPlaying,
    setIntensity,
    setManifoldState,
    setSection,
    getSection,
    triggerFanfare,
    setVolume,
  };
})();

window.SFMusic = SFMusic;
