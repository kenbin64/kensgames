/**
 * SpectrumManifold — Universal Coordinate Kernel
 * ═══════════════════════════════════════════════════════════════════════════
 * A single coordinate space from which ALL game properties derive.
 *
 * Core principle: every phenomenon is a wave — audio, light, colour, emotion,
 * game-state tension.  Waves are fully described by (frequency, amplitude,
 * phase).  Map those three numbers into a manifold and every property of
 * every system in the game becomes a direct address — no hardcoding, no
 * random picks, no switch chains.
 *
 * Spectrum axes:
 *   x  — frequency  (log-normalised 0..1 across the relevant domain)
 *   y  — amplitude  (0..1, intensity / magnitude)
 *   z  — phase      (0..1, position in cycle, time, rotation)
 *
 * Derived manifold layers (matching SFPhrase conventions):
 *   r  = x·y                  Layer 3  — relation / tone
 *   f  = x·y²                 Layer 4  — form / shape
 *   m  = x·y·z                Layer 7  — full consciousness / meaning
 *   d  = cos(πx)cos(πy)cos(πz) − sin(πx)sin(πy)sin(πz)   Schwartz Diamond
 *
 * Domain lenses (substrates) translate normalised [0,1] coords into the
 * natural units of each domain.  Substrates expose only what their consumers
 * ask for — a graphics substrate never touches audio numbers and vice-versa.
 *
 * Injection mechanism:
 *   SpectrumManifold.subscribe(lens, callback) → id
 *   SpectrumManifold.update(gameStateSlice)       — drives all subscribers
 *   SpectrumManifold.read(lens, key)              — pull any value on demand
 *
 * Everything a computer can do lives somewhere on this manifold.
 */

const SpectrumManifold = (function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  /** Audio: 20 Hz → 20 000 Hz, log scale (value of 10 decade range) */
  const AUDIO_LOG_RANGE = Math.log(20000 / 20);                // ≈ 6.908
  /** Visible light: 380 nm → 700 nm */
  const LIGHT_NM_MIN = 380, LIGHT_NM_MAX = 700;
  /** 12-TET semitones per octave */
  const SEMITONES = 12;
  /** Concert A */
  const A4_HZ = 440;
  /** MIDI note for A4 */
  const A4_MIDI = 69;
  /** Equal-tempered semitone ratio */
  const SEMITONE_RATIO = Math.pow(2, 1 / SEMITONES);

  // ── Music Theory Tables — all defined as intervals, never as literal strings ─

  /**
   * Scale interval patterns (semitone steps from root, including root = 0).
   * Addressed by index [0..N-1] — no names hardcoded in logic.
   * Companion SCALE_NAMES array provides human labels but is never used in
   * coordinate arithmetic.
   */
  const SCALE_INTERVALS = [
    // index 0  — Ionian (Major)
    [0, 2, 4, 5, 7, 9, 11],
    // index 1  — Dorian
    [0, 2, 3, 5, 7, 9, 10],
    // index 2  — Phrygian
    [0, 1, 3, 5, 7, 8, 10],
    // index 3  — Lydian
    [0, 2, 4, 6, 7, 9, 11],
    // index 4  — Mixolydian
    [0, 2, 4, 5, 7, 9, 10],
    // index 5  — Aeolian (Natural Minor)
    [0, 2, 3, 5, 7, 8, 10],
    // index 6  — Locrian
    [0, 1, 3, 5, 6, 8, 10],
    // index 7  — Harmonic Minor
    [0, 2, 3, 5, 7, 8, 11],
    // index 8  — Melodic Minor (ascending)
    [0, 2, 3, 5, 7, 9, 11],
    // index 9  — Pentatonic Major
    [0, 2, 4, 7, 9],
    // index 10 — Pentatonic Minor
    [0, 3, 5, 7, 10],
    // index 11 — Blues
    [0, 3, 5, 6, 7, 10],
    // index 12 — Whole Tone
    [0, 2, 4, 6, 8, 10],
    // index 13 — Chromatic
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    // index 14 — Diminished (HW)
    [0, 1, 3, 4, 6, 7, 9, 10],
    // index 15 — Augmented
    [0, 3, 4, 7, 8, 11],
  ];

  const SCALE_NAMES = [
    'Major', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Minor',
    'Locrian', 'Harmonic Minor', 'Melodic Minor', 'Pentatonic Major',
    'Pentatonic Minor', 'Blues', 'Whole Tone', 'Chromatic', 'Diminished', 'Augmented',
  ];

  /**
   * Chord interval stacks (semitones above root).
   * Chord quality is an address [0..N-1], never a string in logic.
   */
  const CHORD_INTERVALS = [
    [0, 4, 7],          // 0  Major triad
    [0, 3, 7],          // 1  Minor triad
    [0, 3, 6],          // 2  Diminished triad
    [0, 4, 8],          // 3  Augmented triad
    [0, 4, 7, 11],      // 4  Major 7
    [0, 3, 7, 10],      // 5  Minor 7
    [0, 4, 7, 10],      // 6  Dominant 7
    [0, 3, 6, 9],       // 7  Diminished 7
    [0, 3, 6, 10],      // 8  Half-diminished 7
    [0, 4, 7, 9],       // 9  Major 6
    [0, 3, 7, 9],       // 10 Minor 6
    [0, 5, 7],          // 11 Suspended 4
    [0, 2, 7],          // 12 Suspended 2
    [0, 4, 7, 11, 14],  // 13 Major 9
    [0, 3, 7, 10, 14],  // 14 Minor 9
    [0, 4, 7, 10, 14],  // 15 Dominant 9
  ];

  /**
   * Rhythm patterns — each is an array of [beat, accent] pairs where
   * beat is a 16th-note offset [0..15] and accent is 0..1.
   * Addressed by index — no pattern names in logic paths.
   */
  const RHYTHM_PATTERNS = [
    // 0  — Whole (one hit per bar)
    [[0, 1.0]],
    // 1  — Half notes
    [[0, 1.0], [8, 0.7]],
    // 2  — Quarter notes
    [[0, 1.0], [4, 0.7], [8, 0.8], [12, 0.6]],
    // 3  — 8th notes
    [[0, 1], [2, 0.7], [4, 0.8], [6, 0.6], [8, 0.9], [10, 0.6], [12, 0.7], [14, 0.5]],
    // 4  — 16th notes (dense)
    Array.from({ length: 16 }, (_, i) => [i, i % 4 === 0 ? 1.0 : i % 2 === 0 ? 0.7 : 0.5]),
    // 5  — Offbeat (afterbeat)
    [[2, 0.8], [6, 0.7], [10, 0.8], [14, 0.7]],
    // 6  — Syncopated
    [[0, 1], [3, 0.7], [6, 0.8], [8, 1], [11, 0.6], [14, 0.7]],
    // 7  — Triplet feel (swing 8ths mapped to 16ths)
    [[0, 1], [3, 0.6], [4, 0.8], [7, 0.6], [8, 0.9], [11, 0.6], [12, 0.8], [15, 0.5]],
    // 8  — March (4-on-floor + backbeat)
    [[0, 1], [2, 0.5], [4, 0.9], [6, 0.5], [8, 1], [10, 0.5], [12, 0.9], [14, 0.5]],
    // 9  — Breakbeat
    [[0, 1], [3, 0.6], [6, 0.8], [7, 0.5], [10, 0.9], [13, 0.6], [14, 0.7]],
    // 10 — Space (sparse, tension)
    [[0, 1], [8, 0.6]],
    // 11 — Pulse (steady 8ths, minimal accent)
    [[0, 0.9], [2, 0.5], [4, 0.9], [6, 0.5], [8, 0.9], [10, 0.5], [12, 0.9], [14, 0.5]],
    // 12 — Gallop (action)
    [[0, 1], [1, 0.6], [4, 0.9], [5, 0.6], [8, 1], [9, 0.6], [12, 0.9], [13, 0.6]],
    // 13 — Waltz (3/4 mapped to 4/4 grid)
    [[0, 1], [4, 0.7], [10, 0.7]],
    // 14 — Chaos (full 16ths randomised accent)
    Array.from({ length: 16 }, (_, i) => [i, 0.5 + 0.5 * Math.abs(Math.sin(i * 2.39))]),
    // 15 — Victory (fanfare hits)
    [[0, 1], [4, 0.8], [6, 0.7], [8, 1], [10, 0.9], [12, 0.9], [14, 1]],
  ];

  /**
   * Instrument / oscillator archetypes.
   * Each entry: [oscillatorType, harmonics[], attackS, decayS, sustainL, releaseS, filterType, filterFreq]
   * All numbers — no string identifiers in coordinate arithmetic.
   */
  const INSTRUMENT_ARCHETYPES = [
    // 0  — Sine (pure tone, comms, status)
    ['sine', [], 0.01, 0.1, 0.8, 0.3, 'lowpass', 8000],
    // 1  — Square (retro, alert)
    ['square', [2, 3, 4], 0.005, 0.05, 0.6, 0.1, 'lowpass', 3000],
    // 2  — Sawtooth (brass, danger)
    ['sawtooth', [2, 3, 4, 5, 6], 0.003, 0.08, 0.5, 0.2, 'lowpass', 4000],
    // 3  — Triangle (mellow, exploration)
    ['triangle', [2, 3], 0.02, 0.15, 0.7, 0.4, 'lowpass', 6000],
    // 4  — Soft pad (string-like, ambient)
    ['sine', [2, 3, 4, 5], 0.08, 0.3, 0.6, 0.8, 'lowpass', 2000],
    // 5  — Pluck (pizzicato, attack)
    ['sawtooth', [2, 3], 0.001, 0.05, 0.0, 0.2, 'bandpass', 1200],
    // 6  — Organ (sustained, harmonic)
    ['square', [2, 3, 4, 5, 6, 7, 8], 0.01, 0.01, 0.9, 0.05, 'lowpass', 5000],
    // 7  — Bass (sub-bass, low register)
    ['sine', [2], 0.005, 0.1, 0.7, 0.2, 'lowpass', 400],
    // 8  — Bell (decay, victory)
    ['sine', [2, 3, 4, 5, 6, 7], 0.001, 0.5, 0.0, 1.5, 'highpass', 600],
    // 9  — Brass (fanfare)
    ['sawtooth', [2, 3, 4], 0.005, 0.05, 0.7, 0.1, 'bandpass', 800],
    // 10 — Noise hit (SFX, percussive)
    ['sawtooth', [], 0.001, 0.02, 0.0, 0.08, 'highpass', 2000],
    // 11 — Warm pad (victory, calm)
    ['triangle', [2, 3, 4], 0.1, 0.5, 0.5, 1.0, 'lowpass', 1500],
    // 12 — Buzz (engine, tension)
    ['sawtooth', [2, 3, 4, 5, 6, 7, 8, 9, 10], 0.001, 0.0, 1.0, 0.0, 'lowpass', 800],
    // 13 — Chime (UI, positive)
    ['sine', [3, 5, 7], 0.001, 0.3, 0.0, 0.8, 'highpass', 1200],
    // 14 — Stab (impact, boss)
    ['sawtooth', [2, 3, 4], 0.001, 0.03, 0.0, 0.05, 'lowpass', 6000],
    // 15 — Choir (epic, morale peak)
    ['sine', [2, 3, 4, 5, 6, 7], 0.15, 0.5, 0.7, 1.5, 'lowpass', 1800],
  ];

  /**
   * Tempo table: BPM ranges indexed [0..15].
   * Addressed by urgency × morale coordinate.
   */
  const BPM_TABLE = [
    40, 52, 60, 68, 76, 84, 92, 100,
    110, 120, 132, 144, 156, 168, 184, 200,
  ];

  // ── Physical spectrum tables (non-audio) ─────────────────────────────────

  /**
   * Visible spectrum: wavelength (nm) → approximate sRGB.
   * 16 samples from 380nm to 700nm, each [r, g, b] in 0..255.
   * Derived from CIE XYZ → sRGB (D65 white point, gamma 2.2).
   */
  const SPECTRUM_RGB = [
    [148, 0, 211],  // 380 nm — violet
    [75, 0, 130],  // 425 nm — indigo
    [0, 0, 255],  // 445 nm — blue
    [0, 71, 255],  // 460 nm — blue
    [0, 148, 255],  // 475 nm — cyan-blue
    [0, 206, 255],  // 490 nm — cyan
    [0, 255, 255],  // 500 nm — cyan-green
    [0, 255, 148],  // 510 nm — green
    [0, 255, 0],  // 530 nm — green
    [148, 255, 0],  // 555 nm — yellow-green
    [255, 255, 0],  // 570 nm — yellow
    [255, 206, 0],  // 585 nm — amber
    [255, 148, 0],  // 600 nm — orange
    [255, 71, 0],  // 620 nm — orange-red
    [255, 0, 0],  // 660 nm — red
    [148, 0, 0],  // 700 nm — deep red
  ];

  /**
   * Emotional colour associations: 16 affective states mapped to [h, s, l]
   * (hue 0-360, sat 0-100, lightness 0-100).
   * Index = emotional coordinate derived from urgency × morale manifold.
   */
  const AFFECTIVE_HSL = [
    [220, 60, 20],   // 0  — desolation (deep blue-black)
    [240, 70, 25],   // 1  — dread (dark blue)
    [200, 80, 30],   // 2  — tension (steel blue)
    [180, 60, 35],   // 3  — unease (teal-grey)
    [160, 50, 40],   // 4  — caution (muted green)
    [90, 55, 38],   // 5  — readiness (olive)
    [60, 70, 45],   // 6  — alert (amber-green)
    [45, 85, 50],   // 7  — urgency (amber)
    [30, 90, 50],   // 8  — danger (orange)
    [10, 90, 45],   // 9  — critical (red-orange)
    [0, 95, 40],   // 10 — emergency (red)
    [350, 80, 45],   // 11 — rage (crimson)
    [280, 60, 40],   // 12 — mystery (purple)
    [290, 55, 50],   // 13 — awe (violet)
    [50, 80, 65],   // 14 — triumph (bright gold)
    [55, 90, 75],   // 15 — elation (brilliant yellow)
  ];

  /**
   * Particle behaviour archetypes.
   * [count, speedMultiplier, sizeMultiplier, spread, drag, gravityY, emissive]
   */
  const PARTICLE_ARCHETYPES = [
    [20, 0.5, 0.5, 0.2, 0.98, 0.0, 0.3],  // 0  — dust / ambient
    [50, 1.0, 0.8, 0.4, 0.97, 0.0, 0.5],  // 1  — debris / float
    [80, 2.0, 1.0, 0.6, 0.95, 0.0, 0.6],  // 2  — thruster
    [30, 1.5, 1.2, 0.3, 0.96, -0.01, 0.8],  // 3  — sparks
    [100, 3.0, 1.5, 0.8, 0.93, 0.0, 1.0],  // 4  — explosion
    [60, 0.8, 0.6, 0.5, 0.99, 0.0, 0.4],  // 5  — smoke
    [40, 1.2, 1.0, 0.4, 0.97, 0.0, 0.9],  // 6  — energy glow
    [200, 4.0, 2.0, 1.0, 0.90, 0.0, 1.0],  // 7  — mega explosion
    [15, 0.3, 2.0, 0.1, 0.99, 0.0, 1.0],  // 8  — hive spore
    [25, 1.0, 0.5, 0.2, 0.98, 0.0, 0.7],  // 9  — hull damage
    [35, 2.5, 0.8, 0.5, 0.94, 0.0, 0.8],  // 10 — shield hit
    [10, 0.5, 3.0, 0.1, 0.995, 0.0, 1.0],  // 11 — torpedo trail
    [5, 0.2, 5.0, 0.05, 0.999, 0.0, 1.0],  // 12 — sensor ping
    [150, 2.0, 1.2, 0.7, 0.95, 0.0, 0.9],  // 13 — warp / FTL
    [50, 1.0, 1.0, 0.3, 0.97, 0.0, 0.6],  // 14 — base impact
    [30, 3.0, 1.5, 0.8, 0.91, 0.0, 1.0],  // 15 — victory burst
  ];

  // ── Core Manifold Mathematics ─────────────────────────────────────────────

  function _clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function _addrN(v, len) { return Math.min(len - 1, Math.floor(_clamp01(v) * len)); }

  /**
   * Compute all manifold layer values from (x, y, z) ∈ [0,1]³.
   * Returns a frozen coordinate object — the universal address.
   */
  function coords(x, y, z) {
    x = _clamp01(x); y = _clamp01(y); z = _clamp01(z || 0);
    const r = x * y;                      // Layer 3: relation
    const f = x * y * y;                  // Layer 4: form
    const m = x * y * z;                  // Layer 7: consciousness
    const u = x * Math.PI, v = y * Math.PI, w = z * Math.PI;
    const d = Math.cos(u) * Math.cos(v) * Math.cos(w) - Math.sin(u) * Math.sin(v) * Math.sin(w);
    return Object.freeze({ x, y, z, r, f, m, d, nearZero: Math.abs(d) < 0.2 });
  }

  // ── Domain: Audio / Music ─────────────────────────────────────────────────

  /**
   * Normalised frequency [0,1] → Hz (logarithmic, 20 Hz base).
   * x=0 → 20 Hz, x=1 → 20 000 Hz.
   */
  function freqHz(normX) {
    return 20 * Math.exp(_clamp01(normX) * AUDIO_LOG_RANGE);
  }

  /**
   * Hz → normalised [0,1].
   */
  function freqNorm(hz) {
    return _clamp01(Math.log(hz / 20) / AUDIO_LOG_RANGE);
  }

  /**
   * Normalised frequency [0,1] → MIDI note number (float).
   * Covers approximately C0 (16 Hz) to C10 (16 744 Hz).
   */
  function freqToMidi(normX) {
    return 12 * Math.log2(freqHz(normX) / A4_HZ) + A4_MIDI;
  }

  /**
   * MIDI note → Hz.
   */
  function midiToHz(midi) {
    return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
  }

  /**
   * Normalised coord → scale index [0..SCALE_INTERVALS.length-1].
   * Addressed by Layer 3 (r = urgency × morale) shifted by phase.
   */
  function scaleIndex(c) {
    // Low r → bright scales (major, lydian, pentatonic major)
    // High r → dark/tense scales (locrian, diminished, blues)
    return _addrN(c.r, SCALE_INTERVALS.length);
  }

  /**
   * Normalised coord → root note (MIDI semitone 0..11, C=0).
   * Addressed by z (phase = musical progress through the piece).
   */
  function rootNote(c) {
    return Math.floor(_clamp01(c.z) * 12) % 12;
  }

  /**
   * Normalised coord → BPM.
   * Urgency (x) drives tempo: high urgency → fast tempo.
   */
  function bpm(c) {
    return BPM_TABLE[_addrN(c.x, BPM_TABLE.length)];
  }

  /**
   * Normalised coord → rhythm pattern.
   * Layer 4 (form = x·y²) addresses pattern complexity.
   */
  function rhythmPattern(c) {
    return RHYTHM_PATTERNS[_addrN(c.f, RHYTHM_PATTERNS.length)];
  }

  /**
   * Normalised coord → chord intervals.
   * r (relation) addresses chord quality — tense states → dissonant chords.
   */
  function chordIntervals(c) {
    return CHORD_INTERVALS[_addrN(c.r, CHORD_INTERVALS.length)];
  }

  /**
   * Normalised coord → instrument archetype.
   * m (consciousness = full meaning) selects timbre.
   */
  function instrument(c) {
    return INSTRUMENT_ARCHETYPES[_addrN(c.m, INSTRUMENT_ARCHETYPES.length)];
  }

  /**
   * Normalised coord → complete musical moment descriptor.
   * Returns everything needed to synthesise a musical phrase.
   */
  function musicalMoment(c) {
    const si = scaleIndex(c);
    const root = rootNote(c);
    const scale = SCALE_INTERVALS[si];
    const chord = CHORD_INTERVALS[_addrN(c.r, CHORD_INTERVALS.length)];
    const inst = INSTRUMENT_ARCHETYPES[_addrN(c.m, INSTRUMENT_ARCHETYPES.length)];
    const rhy = RHYTHM_PATTERNS[_addrN(c.f, RHYTHM_PATTERNS.length)];
    const tempoHz = bpm(c) / 60;
    // Melody notes: walk the scale using z-derived step pattern
    const melodyLen = 4 + Math.floor(c.z * 4);         // 4-7 notes
    const melodyNotes = Array.from({ length: melodyLen }, (_, i) => {
      const step = Math.floor(c.d * scale.length + i) % scale.length;
      const octave = 4 + Math.floor(c.y * 2);           // octave 4 or 5
      return midiToHz(root + scale[step] + octave * 12);
    });
    // Harmony: chord tones above root (octave 3)
    const harmonyFreqs = chord.map(st => midiToHz(root + st + 3 * 12));
    // Bass: root one octave below chord
    const bassFreq = midiToHz(root + 2 * 12);
    return {
      scaleName: SCALE_NAMES[si],
      scaleIntervals: scale,
      rootMidi: root,
      rootHz: midiToHz(root + 4 * 12),
      bpm: bpm(c),
      tempoHz,
      beatLengthS: 1 / tempoHz,
      instrument: inst,
      chordIntervals: chord,
      harmonyFreqs,
      melodyNotes,
      bassFreq,
      rhythm: rhy,
    };
  }

  // ── Domain: Colour / Visual ───────────────────────────────────────────────

  /**
   * Normalised x → visible wavelength in nm (380..700).
   */
  function wavelengthNm(normX) {
    return LIGHT_NM_MIN + _clamp01(normX) * (LIGHT_NM_MAX - LIGHT_NM_MIN);
  }

  /**
   * Normalised x → spectrum sRGB [0..255] via table lookup + interpolation.
   */
  function spectrumRGB(normX) {
    const fIdx = _clamp01(normX) * (SPECTRUM_RGB.length - 1);
    const lo = Math.floor(fIdx), hi = Math.min(lo + 1, SPECTRUM_RGB.length - 1);
    const t = fIdx - lo;
    return SPECTRUM_RGB[lo].map((c, i) => Math.round(c + t * (SPECTRUM_RGB[hi][i] - c)));
  }

  /**
   * Coords (x, y, z) → HSL colour.
   * x → hue (spectrum), y → saturation (amplitude), z → lightness (phase).
   */
  function hsl(c) {
    return {
      h: Math.round(_clamp01(c.x) * 360),
      s: Math.round(20 + _clamp01(c.y) * 80),  // sat 20..100
      l: Math.round(15 + _clamp01(c.z) * 70),  // lightness 15..85
      css: `hsl(${Math.round(_clamp01(c.x) * 360)},${Math.round(20 + _clamp01(c.y) * 80)}%,${Math.round(15 + _clamp01(c.z) * 70)}%)`,
    };
  }

  /**
   * Affective (emotional) colour from urgency × morale manifold.
   * Returns HSL + CSS string.
   */
  function affectiveColor(c) {
    const [h, s, l] = AFFECTIVE_HSL[_addrN(c.r, AFFECTIVE_HSL.length)];
    // Modulate lightness by z (phase = time → pulsing)
    const lmod = l + Math.round(c.z * 15);
    return { h, s, l: lmod, css: `hsl(${h},${s}%,${lmod}%)` };
  }

  /**
   * Chord interval offsets → colour palette (colour harmony).
   * Each interval maps to a hue rotation — just as music intervals map to
   * semitone gaps, colour harmonies map to hue gaps.
   * Returns array of CSS hsl() strings.
   */
  function chordToPalette(rootHue, chordIdx) {
    const intervals = CHORD_INTERVALS[_addrN(chordIdx / CHORD_INTERVALS.length, CHORD_INTERVALS.length)];
    return intervals.map(st => {
      const hue = (rootHue + (st / 12) * 360) % 360;
      return `hsl(${Math.round(hue)},70%,55%)`;
    });
  }

  /**
   * Normalised coord → particle archetype.
   * m (full consciousness) selects particle behaviour.
   */
  function particleArchetype(c) {
    return PARTICLE_ARCHETYPES[_addrN(c.m, PARTICLE_ARCHETYPES.length)];
  }

  /**
   * Manifold surface point → Three.js geometry vertex offset.
   * z_surface = cos(πx)cos(πy)cos(πz) − sin(πx)sin(πy)sin(πz) (Schwartz D)
   * Returns {x, y, z} displacement for procedural mesh deformation.
   */
  function surfacePoint(u, v, phase) {
    const c = coords(u, v, phase);
    return { x: u * 2 - 1, y: v * 2 - 1, z: c.d * 0.5 };
  }

  /**
   * Sample a manifold surface grid for Three.js BufferGeometry.
   * Returns Float32Array of (x,y,z) triples, res×res grid.
   */
  function surfaceGrid(res, phase) {
    const arr = new Float32Array(res * res * 3);
    let i = 0;
    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const pt = surfacePoint(col / (res - 1), row / (res - 1), phase || 0);
        arr[i++] = pt.x; arr[i++] = pt.y; arr[i++] = pt.z;
      }
    }
    return arr;
  }

  // ── Game-State → Manifold Translation ────────────────────────────────────

  /**
   * Translate a game state snapshot into the canonical (x, y, z) manifold
   * coordinates for each active domain.
   *
   * x = urgency   (derived from hull, shields, enemy count)
   * y = severity  (derived from damage, base health)
   * z = phase     (derived from wave progress, morale, time)
   *
   * Additional per-domain coords are computed by the domain lenses below.
   */
  function fromGameState(snap) {
    if (!snap) return coords(0, 0, 0);
    // Urgency: inverse of hull × enemy pressure
    const invHull = 1 - _clamp01((snap.hullPct || 100) / 100);
    const invShield = 1 - _clamp01((snap.shieldPct || 100) / 100);
    const enemies = _clamp01((snap.totalHostile || 0) / 20);
    const dread = snap.dreadnoughts > 0 ? 0.15 : 0;
    const x = _clamp01(invHull * 0.4 + invShield * 0.2 + enemies * 0.3 + dread);
    // Severity: base+hull cross-damage product
    const invBase = 1 - _clamp01((snap.basePct || 100) / 100);
    const y = _clamp01(invHull * invBase * 0.5 + invShield * 0.2 + enemies * 0.3);
    // Phase: wave progress × morale
    const waveProg = _clamp01((snap.wave || 1) / 10);
    const morale = _clamp01((snap.basePct || 100) / 100);
    const z = _clamp01(waveProg * 0.5 + morale * 0.5);
    return coords(x, y, z);
  }

  // ── Lenses ─────────────────────────────────────────────────────────────────
  //
  // A lens narrows the full manifold into a domain-specific view.
  // Lenses are pure functions: (fullCoords, snap) → domainCoords.
  // They do NOT modify state; they translate coordinates.

  const LENSES = {
    /** Music: urgency → tempo, severity → scale darkness, phase → key */
    music: (c, snap) => {
      const personality = snap && snap.ocean ? snap.ocean : [0.5, 0.5, 0.5, 0.5, 0.5];
      const [O, C, E, A, N] = personality;
      return coords(
        _clamp01(c.x + N * 0.1),    // x = urgency + neuroticism
        _clamp01(c.y),               // y = severity
        _clamp01(c.z + A * 0.1),     // z = phase + agreeableness (lifts key)
      );
    },
    /** SFX: urgency → pitch/speed, severity → layering, spatial → panning */
    sfx: (c, snap) => {
      const spatial = snap ? _clamp01((snap.spatialAngle || 0) / (2 * Math.PI)) : 0;
      return coords(
        c.x,
        c.y,
        spatial,
      );
    },
    /** Colour/Visual: morale → brightness, urgency → hue shift toward red */
    visual: (c, snap) => {
      const morale = snap ? _clamp01((snap.basePct || 100) / 100) : 0.5;
      return coords(
        _clamp01(1 - c.x * 0.7),    // x: low urgency → blue end; high → red end
        _clamp01(c.y * 0.8 + 0.1),  // y: saturation midrange
        _clamp01(morale),            // z: lightness by morale
      );
    },
    /** Particle FX: severity → density, urgency → speed */
    particles: (c, _snap) => coords(c.y, c.x, c.z),
    /** Physics (future use): maps force fields to manifold curvature */
    physics: (c, _snap) => coords(c.r, c.f, c.m),
    /** UI: urgency → alert level, morale → warmth */
    ui: (c, snap) => {
      const morale = snap ? _clamp01((snap.basePct || 100) / 100) : 0.5;
      return coords(c.x, morale, c.z);
    },
  };

  // ── Substrates ────────────────────────────────────────────────────────────
  //
  // A substrate is the execution context for a lens.
  // It takes the lens output and produces the concrete values needed by the
  // consumer.  Substrates are also pure functions.

  const SUBSTRATES = {
    /** → musical moment descriptor for the synthesiser */
    music: (lensCoords, _snap) => musicalMoment(lensCoords),

    /** → SFX descriptor: pitch, pan, envelope, archetype index */
    sfx: (lc, snap) => {
      const baseHz = freqHz(lc.x);
      const archIdx = _addrN(lc.m, INSTRUMENT_ARCHETYPES.length);
      const [, , atk, dec, sus, rel, flt, fltHz] = INSTRUMENT_ARCHETYPES[archIdx];
      return {
        hz: baseHz,
        archetype: archIdx,
        pan: (lc.z * 2) - 1,  // -1 (left) .. +1 (right)
        gain: 0.2 + lc.y * 0.6,
        attack: atk, decay: dec, sustain: sus, release: rel,
        filterType: flt, filterHz: fltHz,
        duration: 0.05 + lc.r * 0.5,
      };
    },

    /** → material/colour descriptor for Three.js materials */
    visual: (lc, snap) => {
      const col = affectiveColor(lc);
      const [r, g, b] = spectrumRGB(lc.x);
      const parti = PARTICLE_ARCHETYPES[_addrN(lc.m, PARTICLE_ARCHETYPES.length)];
      return {
        color: col.css,
        rgb: { r, g, b },
        emissive: hsl(coords(lc.x, 0.5, lc.z * 0.5)),
        roughness: 0.1 + lc.y * 0.7,
        metalness: 0.1 + (1 - lc.x) * 0.5,
        opacity: 0.5 + lc.z * 0.5,
        emissiveIntensity: lc.r * 2,
        particle: parti,
      };
    },

    /** → HUD/UI colour palette */
    ui: (lc, _snap) => {
      const primary = affectiveColor(lc);
      const secondary = hsl(coords((lc.x + 0.5) % 1, lc.y, lc.z));
      return {
        primary: primary.css,
        secondary: secondary.css,
        alert: lc.x > 0.6 ? `hsl(${Math.round(lc.x * 30)},90%,55%)` : primary.css,
        intensity: lc.r,
      };
    },

    /** → particle system parameters */
    particles: (lc, _snap) => {
      const arch = PARTICLE_ARCHETYPES[_addrN(lc.m, PARTICLE_ARCHETYPES.length)];
      const [count, speed, size, spread, drag, gravity, emissive] = arch;
      const col = affectiveColor(lc);
      return {
        count: Math.round(count * (0.5 + lc.y)),
        speed: speed * (0.5 + lc.x * 1.5),
        size: size * (0.5 + lc.z),
        spread,
        drag,
        gravity,
        emissive,
        color: col.css,
      };
    },
  };

  // ── Subscription / Injection Engine ──────────────────────────────────────
  //
  // This is the mechanism that drives all subsystems from a single game-state
  // update.  No subsystem polls game state — the manifold pushes coordinates
  // to every subscriber.

  let _subscribers = [];
  let _nextId = 1;
  let _lastSnap = null;

  /**
   * Subscribe to manifold updates.
   * @param {string}   lensName  — one of the LENSES keys
   * @param {function} callback  — called with (substrateOutput, lensCoords, fullCoords, snap)
   * @param {number}   [throttleMs=0] — minimum ms between calls (0 = every update)
   * @returns {number} subscription id for unsubscribe()
   */
  function subscribe(lensName, callback, throttleMs) {
    const id = _nextId++;
    _subscribers.push({ id, lensName, callback, throttleMs: throttleMs || 0, lastCall: 0 });
    return id;
  }

  /**
   * Unsubscribe by id.
   */
  function unsubscribe(id) {
    _subscribers = _subscribers.filter(s => s.id !== id);
  }

  /**
   * Drive all subscribers from a new game-state snapshot.
   * Call this once per frame (or on each significant state change).
   */
  function update(snap) {
    _lastSnap = snap;
    const now = performance.now();
    const full = fromGameState(snap);
    _subscribers.forEach(sub => {
      if (now - sub.lastCall < sub.throttleMs) return;
      sub.lastCall = now;
      const lens = LENSES[sub.lensName] || LENSES.music;
      const sub_out = SUBSTRATES[sub.lensName] || SUBSTRATES.music;
      const lc = lens(full, snap);
      sub.callback(sub_out(lc, snap), lc, full, snap);
    });
  }

  /**
   * Pull any domain value on-demand without a subscription.
   * @param {string} lensName
   * @param {object} [snap] — optional snapshot; uses last if omitted
   * @returns substrate output object
   */
  function read(lensName, snap) {
    const s = snap || _lastSnap || {};
    const full = fromGameState(s);
    const lens = LENSES[lensName] || LENSES.music;
    const sub = SUBSTRATES[lensName] || SUBSTRATES.music;
    return sub(lens(full, s), s);
  }

  /**
   * Register a custom lens + substrate pair.
   * @param {string}   name
   * @param {function} lensFunc      (fullCoords, snap) → coords
   * @param {function} substrateFunc (lensCoords, snap) → any
   */
  function registerDomain(name, lensFunc, substrateFunc) {
    LENSES[name] = lensFunc;
    SUBSTRATES[name] = substrateFunc;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // Coordinate computation
    coords,
    fromGameState,
    // Audio domain
    freqHz, freqNorm, freqToMidi, midiToHz,
    scaleIndex, rootNote, bpm, rhythmPattern, chordIntervals, instrument,
    musicalMoment,
    // Visual domain
    wavelengthNm, spectrumRGB, hsl, affectiveColor, chordToPalette,
    particleArchetype, surfacePoint, surfaceGrid,
    // Tables (exposed for tests and custom substrates)
    SCALE_INTERVALS, SCALE_NAMES,
    CHORD_INTERVALS,
    RHYTHM_PATTERNS,
    INSTRUMENT_ARCHETYPES,
    BPM_TABLE,
    SPECTRUM_RGB,
    AFFECTIVE_HSL,
    PARTICLE_ARCHETYPES,
    // Injection engine
    subscribe, unsubscribe, update, read,
    registerDomain,
    LENSES, SUBSTRATES,
    // Helpers
    _clamp01, _addrN,
  };
})();

window.SpectrumManifold = SpectrumManifold;
