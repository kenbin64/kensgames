/**
 * Starfighter Procedural Music Engine — SFMusic
 * Orchestral sci-fi soundtrack generated in real-time via Web Audio API
 * Zero external files — all synthesis procedural
 *
 * Architecture:
 * - 16-bar phrases in 4/4 time, always harmonic with hook + resolution
 * - Multi-layer orchestration: bass percussion, strings (violin/viola), oboe, brass, piano, melody
 * - Dynamic intensity system responds to game state:
 *   • Ambient (bay/docking) — sparse piano + pad
 *   • Cruise (combat, no nearby threats) — full orchestral, moderate tempo
 *   • Urgency (fighters closing in) — faster tempo, dissonant brass stabs, driving percussion
 *   • Battle (major engagement) — crescendo, full fortissimo, layered brass+strings
 *   • Fanfare (launch sequence) — triumphant brass, rising strings, timpani rolls
 *
 * Manifold substrate: music state is a continuous field, not discrete jumps.
 * Intensity interpolates smoothly between layers.
 */

const SFMusic = (function () {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let playing = false;
  let enabled = true;
  let _animFrame = null;

  // Tempo & timing
  let bpm = 72;
  let beatDuration = 60 / bpm;
  let barDuration = beatDuration * 4;
  let phraseLength = 8; // bars per phrase (faster adaptation to combat state)
  let phraseDuration = barDuration * phraseLength;

  // Musical state
  let currentBeat = 0;
  let currentBar = 0;
  let phraseStartTime = 0;
  let _lastScheduleTime = 0;
  let _scheduleAhead = 0.2; // seconds to schedule ahead

  // Intensity field (0 = silent/ambient, 1 = full battle crescendo)
  let _intensity = 0;
  let _targetIntensity = 0;
  let _intensitySmooth = 0.08; // lerp rate per frame

  // Manifold music lens — phase/field/gradient drive spectral choices.
  let _manifoldState = {
    phase: 0,
    field: 0,
    gradient: 0,
    waveNorm: 0,
    threatNorm: 0,
    x: 0,
    y: 0,
    z: 0,
    valid: false,
  };

  // Musical key system — cycle through related keys each phrase
  const KEYS = [
    // Each key: root MIDI note, scale intervals, mood
    { root: 48, scale: [0, 2, 3, 5, 7, 8, 10], name: 'C min' },    // dark, epic
    { root: 53, scale: [0, 2, 3, 5, 7, 8, 10], name: 'F min' },    // tension
    { root: 55, scale: [0, 2, 3, 5, 7, 8, 10], name: 'G min' },    // drive
    { root: 50, scale: [0, 2, 3, 5, 7, 8, 10], name: 'D min' },    // resolution approach
    { root: 48, scale: [0, 2, 4, 5, 7, 9, 11], name: 'C maj' },    // launch/fanfare only
    { root: 55, scale: [0, 2, 3, 5, 7, 8, 11], name: 'G harm min' }, // urgency
  ];
  let _keyIndex = 0;
  let _key = KEYS[0];

  // Chord progressions (scale degree indices) — 4 bars each, 4 per phrase = 16 bars
  const PROGRESSIONS = [
    // Epic minor: i - VI - III - VII
    [[0, 2, 4], [5, 0, 2], [2, 4, 6], [6, 1, 3]],
    // Dramatic: i - iv - V - i
    [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]],
    // Tension build: vi - IV - I - V (relative major feel)
    [[5, 0, 2], [3, 5, 0], [0, 2, 4], [4, 6, 1]],
    // Resolution: i - III - VII - i
    [[0, 2, 4], [2, 4, 6], [6, 1, 3], [0, 2, 4]],
    // Siege: i - bII - v - i (tight, unresolved pressure)
    [[0, 2, 4], [1, 3, 5], [4, 6, 1], [0, 2, 4]],
  ];
  let _progIndex = 0;

  // Melody patterns (scale degree offsets from chord root, rhythm slots in 16th notes)
  const MELODIES = [
    // Soaring theme
    [
      { deg: 0, start: 0, dur: 4 }, { deg: 2, start: 4, dur: 2 }, { deg: 4, start: 6, dur: 2 },
      { deg: 5, start: 8, dur: 4 }, { deg: 4, start: 12, dur: 2 }, { deg: 2, start: 14, dur: 2 }
    ],
    // Urgent motif
    [
      { deg: 0, start: 0, dur: 2 }, { deg: 1, start: 2, dur: 2 }, { deg: 2, start: 4, dur: 2 },
      { deg: 4, start: 6, dur: 1 }, { deg: 3, start: 7, dur: 1 }, { deg: 2, start: 8, dur: 4 },
      { deg: 0, start: 12, dur: 4 }
    ],
    // Hook — memorable rising phrase
    [
      { deg: 0, start: 0, dur: 3 }, { deg: 2, start: 3, dur: 1 }, { deg: 4, start: 4, dur: 4 },
      { deg: 6, start: 8, dur: 2 }, { deg: 5, start: 10, dur: 2 }, { deg: 4, start: 12, dur: 2 },
      { deg: 2, start: 14, dur: 2 }
    ],
    // Resolution descent
    [
      { deg: 6, start: 0, dur: 2 }, { deg: 5, start: 2, dur: 2 }, { deg: 4, start: 4, dur: 4 },
      { deg: 2, start: 8, dur: 3 }, { deg: 1, start: 11, dur: 1 }, { deg: 0, start: 12, dur: 4 }
    ],
  ];

  // Percussion patterns (16 slots per bar, 1 = hit)
  const PERC_PATTERNS = {
    // Deep bass drum — quarter notes + anacrusis
    kick: [
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],  // four-on-floor
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],  // syncopated
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1],  // driving urgency
    ],
    // Timpani rolls on phrase boundaries
    timpani: [
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],  // roll
    ],
    // Hi-hat / metallic tick
    hat: [
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
    ],
  };

  // Noise buffer for percussion
  let _noiseBuffer = null;
  function _getNoiseBuffer() {
    if (_noiseBuffer) return _noiseBuffer;
    const len = ctx.sampleRate * 2;
    _noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return _noiseBuffer;
  }

  // MIDI note to frequency
  function mtof(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  // Get note from scale degree
  function scaleNote(degree, octaveOffset) {
    const oct = Math.floor(degree / _key.scale.length);
    const deg = ((degree % _key.scale.length) + _key.scale.length) % _key.scale.length;
    return _key.root + _key.scale[deg] + (oct + (octaveOffset || 0)) * 12;
  }

  function setManifoldState(input = {}) {
    const x = Number.isFinite(input.x) ? input.x : 0;
    const y = Number.isFinite(input.y) ? input.y : 0;
    const z = Number.isFinite(input.z) ? input.z : (x * y);

    let phase = Number.isFinite(input.phase) ? input.phase : Math.atan2(y, x);
    let field = Number.isFinite(input.field) ? input.field : Math.sin(z);
    let gradient = Number.isFinite(input.gradient) ? input.gradient : Math.sqrt(x * x + y * y);

    if (window.SpaceManifold) {
      if (!Number.isFinite(input.phase) && typeof SpaceManifold.helixPhase === 'function') {
        phase = SpaceManifold.helixPhase(x, y);
      }
      if (!Number.isFinite(input.field) && typeof SpaceManifold.diamond === 'function') {
        field = SpaceManifold.diamond(x * 400, y * 400, z * 400);
      }
      if (!Number.isFinite(input.gradient) && typeof SpaceManifold.diamondGrad === 'function') {
        const g = SpaceManifold.diamondGrad(x * 400, y * 400, z * 400);
        gradient = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
      }
    }

    const waveNorm = Math.max(0, Math.min(1, Number.isFinite(input.waveNorm) ? input.waveNorm : 0));
    const threatNorm = Math.max(0, Math.min(1, Number.isFinite(input.threatNorm) ? input.threatNorm : 0));

    _manifoldState = {
      phase,
      field,
      gradient,
      waveNorm,
      threatNorm,
      x,
      y,
      z,
      valid: true,
    };
  }

  // ══════════════════════════════════════
  // INSTRUMENT VOICES — each creates short-lived oscillator chains
  // ══════════════════════════════════════

  // ── Deep bass percussion (taiko/cinematic kick) ──
  function _playKick(time, velocity) {
    const vol = velocity * 0.4 * _intensity;
    if (vol < 0.01) return;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    g.connect(musicGain);

    // Sub-bass body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.3);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + 0.5);

    // Attack transient
    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.setValueAtTime(150, time);
    click.frequency.exponentialRampToValueAtTime(20, time + 0.05);
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(vol * 0.6, time);
    clickG.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    click.connect(clickG);
    clickG.connect(musicGain);
    click.start(time);
    click.stop(time + 0.06);
  }

  // ── Timpani (pitched drum, can do rolls) ──
  function _playTimpani(time, velocity, pitch) {
    const vol = velocity * 0.3 * _intensity;
    if (vol < 0.01) return;
    const freq = pitch || mtof(scaleNote(0, -1)); // root note, low octave

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

    // Noise resonance (drum skin)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
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

  // ── Hi-hat / metallic percussion ──
  function _playHat(time, velocity) {
    const vol = velocity * 0.12 * Math.max(0.3, _intensity);
    if (vol < 0.005) return;

    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    noise.connect(hpf);
    hpf.connect(g);
    g.connect(musicGain);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  // ── String pad (violins + viola ensemble) — sustained harmonic bed ──
  function _playStringChord(time, notes, duration, velocity) {
    const vol = velocity * 0.08 * Math.max(0.2, _intensity);
    if (vol < 0.005) return;

    notes.forEach((note, i) => {
      const freq = mtof(note);
      const g = ctx.createGain();
      // Slow attack, sustain, slow release (bowed strings)
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.3);
      g.gain.setValueAtTime(vol, time + duration - 0.4);
      g.gain.linearRampToValueAtTime(0, time + duration);
      g.connect(musicGain);

      // Sawtooth for string richness, gentle LP filter
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      // Slight vibrato
      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 5 + i * 0.3; // slightly different vibrato rates
      const vibGain = ctx.createGain();
      vibGain.gain.value = freq * 0.003; // subtle pitch wobble
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      vib.start(time);
      vib.stop(time + duration + 0.1);

      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 3000 + _intensity * 4000; // brighter at higher intensity
      lpf.Q.value = 0.7;

      osc.connect(lpf);
      lpf.connect(g);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  // ── Oboe (solo melodic voice — nasal, reedy) ──
  function _playOboe(time, note, duration, velocity) {
    const vol = velocity * 0.1 * Math.max(0.3, _intensity);
    if (vol < 0.005) return;
    const freq = mtof(note + 12); // oboe register (octave up from bass)

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.08);
    g.gain.setValueAtTime(vol * 0.85, time + duration * 0.7);
    g.gain.linearRampToValueAtTime(0, time + duration);
    g.connect(musicGain);

    // Square wave + bandpass = nasal reed character
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    // Vibrato
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.5;
    const vibG = ctx.createGain();
    vibG.gain.value = freq * 0.005;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start(time);
    vib.stop(time + duration + 0.1);

    // Nasal formant filter
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 2.5;
    bp.Q.value = 3;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq * 5;

    osc.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  // ── Brass section (French horn / trumpet ensemble — heroic, bold) ──
  function _playBrass(time, notes, duration, velocity) {
    const vol = velocity * 0.12 * _intensity;
    if (vol < 0.005) return;

    notes.forEach((note, i) => {
      const freq = mtof(note);
      const g = ctx.createGain();
      // Brass attack: quick but not instant
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.1);
      g.gain.setValueAtTime(vol * 0.9, time + duration * 0.6);
      g.gain.linearRampToValueAtTime(0, time + duration);
      g.connect(musicGain);

      // Sawtooth is the core brass timbre
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      // Formant shaping — brass "blat" character
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.value = freq * 3;
      bp.Q.value = 2;
      bp.gain.value = 6;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      // Brass brightness opens with intensity
      lp.frequency.value = 1500 + _intensity * 3000;
      lp.Q.value = 1;

      osc.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }

  // ── Piano (percussive melodic — hammer + string decay) ──
  function _playPiano(time, note, duration, velocity) {
    const vol = velocity * 0.15;
    if (vol < 0.005) return;
    const freq = mtof(note);

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.setValueAtTime(vol * 0.7, time + 0.01);
    g.gain.exponentialRampToValueAtTime(vol * 0.4, time + duration * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    g.connect(musicGain);

    // Fundamental
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    const g1 = ctx.createGain();
    g1.gain.value = 0.7;
    osc1.connect(g1);
    g1.connect(g);
    osc1.start(time);
    osc1.stop(time + duration + 0.1);

    // 2nd harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.25, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.6);
    osc2.connect(g2);
    g2.connect(g);
    osc2.start(time);
    osc2.stop(time + duration + 0.1);

    // 3rd harmonic (brightness)
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = freq * 3;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.1, time);
    g3.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.3);
    osc3.connect(g3);
    g3.connect(g);
    osc3.start(time);
    osc3.stop(time + duration + 0.1);

    // Hammer attack click
    const click = ctx.createBufferSource();
    click.buffer = _getNoiseBuffer();
    const clickBP = ctx.createBiquadFilter();
    clickBP.type = 'bandpass';
    clickBP.frequency.value = freq * 4;
    clickBP.Q.value = 10;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(vol * 0.3, time);
    clickG.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.connect(clickBP);
    clickBP.connect(clickG);
    clickG.connect(musicGain);
    click.start(time);
    click.stop(time + 0.03);
  }

  // ── Combat pulse ostinato — relentless synth drive for battle tension ──
  function _playCombatPulse(time, note, duration, velocity) {
    const vol = velocity * Math.max(0.25, _intensity) * 0.11;
    if (vol < 0.004) return;
    const freq = mtof(note);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    g.connect(musicGain);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650 + _intensity * 1200;
    lp.Q.value = 1.2;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 80;

    osc.connect(lp);
    lp.connect(hp);
    hp.connect(g);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // ══════════════════════════════════════
  // PHRASE SCHEDULER — composes and schedules 16-bar phrases
  // ══════════════════════════════════════

  function _schedulePhrase(startTime) {
    const phase01 = ((_manifoldState.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    const fieldAbs = Math.min(1, Math.abs(_manifoldState.field || 0));
    const spectralBias = Math.min(1, (_manifoldState.gradient || 0) * 0.02 + (_manifoldState.threatNorm || 0) * 0.35 + (_manifoldState.waveNorm || 0) * 0.25);

    // Advance key and progression for variety
    if (_intensity > 0.7 || spectralBias > 0.75) {
      _keyIndex = 5; // harmonic minor for urgency
    } else if (_intensity > 0.5 || spectralBias > 0.45) {
      _keyIndex = Math.floor(phase01 * 4) % 4; // manifold phase selects minor mode
    } else if (_intensity < 0.15) {
      _keyIndex = 0; // ambient stays in C min
    }
    _key = KEYS[_keyIndex];

    // Choose progression based on phrase position
    _progIndex = (_progIndex + 1) % PROGRESSIONS.length;
    const prog = PROGRESSIONS[_progIndex];

    // Choose melody
    const melodyIdx = _intensity > 0.6
      ? (fieldAbs > 0.62 ? 1 : 2)
      : _intensity > 0.3
        ? (phase01 > 0.5 ? 2 : 3)
        : 3;
    const melody = MELODIES[melodyIdx];

    // Determine percussion intensity level
    const percLevel = (_intensity > 0.62 || spectralBias > 0.65) ? 2 : (_intensity > 0.28 || spectralBias > 0.38) ? 1 : 0;
    const combatDrive = _intensity > 0.38 || spectralBias > 0.45;

    // Schedule 16 bars
    for (let bar = 0; bar < phraseLength; bar++) {
      const barTime = startTime + bar * barDuration;
      const chordIdx = Math.floor(bar / 4) % 4;
      const chord = prog[chordIdx];

      // ── Strings: sustained chord per 4-bar group ──
      if (bar % 4 === 0 && _intensity > 0.15) {
        const chordNotes = chord.map(d => scaleNote(d, 1));
        _playStringChord(barTime, chordNotes, barDuration * 4, 0.8 + _intensity * 0.2);
      }

      // ── Brass: on strong beats of bars 1, 5, 9, 13 (phrase markers) ──
      if ((bar % 4 === 0) && _intensity > 0.4) {
        const brassNotes = [scaleNote(chord[0], 0), scaleNote(chord[1], 0), scaleNote(chord[2], 0)];
        _playBrass(barTime, brassNotes, beatDuration * 2, 0.6 + _intensity * 0.4);
      }
      // Additional brass stabs at high intensity
      if (_intensity > 0.7 && bar % 2 === 1) {
        const stabNote = [scaleNote(chord[0], 1)];
        _playBrass(barTime, stabNote, beatDuration * 0.5, 0.5);
      }

      // ── Piano: sparse support at low-mid intensity only (avoid sentimental wash) ──
      if ((_intensity < 0.48 || bar % 2 === 0) && !combatDrive) {
        for (let beat = 0; beat < 4; beat++) {
          const pianoNote = scaleNote(chord[beat % chord.length], 1 + Math.floor(beat / 3));
          const pianoTime = barTime + beat * beatDuration;
          // Only play some notes at low intensity (sparse)
          if (_intensity < 0.2 && beat > 0 && Math.random() > 0.4) continue;
          _playPiano(pianoTime, pianoNote, beatDuration * 0.8, 0.3 + _intensity * 0.3);
        }
      }

      // ── Combat ostinato: 8th-note engine that sustains pressure ──
      if (combatDrive) {
        const pulseStep = beatDuration / 2;
        const pulseSeq = [chord[0], chord[2], chord[1], chord[2], chord[0], chord[2], chord[4 % chord.length], chord[2]];
        for (let p = 0; p < 8; p++) {
          const pulseTime = barTime + p * pulseStep;
          const pulseNote = scaleNote(pulseSeq[p], -1);
          _playCombatPulse(pulseTime, pulseNote, pulseStep * 0.9, 0.55 + _intensity * 0.35);
        }
      }

      // ── Lead line: oboe only in calmer windows; brass stabs take over in combat ──
      if (_intensity > 0.22 && (bar % 4 < 3)) { // melody in first 3 bars of each 4-bar group
        const barInGroup = bar % 4;
        if (barInGroup === 0 || barInGroup === 2) {
          const sixteenthDur = beatDuration / 4;
          melody.forEach(note => {
            const noteTime = barTime + note.start * sixteenthDur;
            const noteDur = note.dur * sixteenthDur;
            const midiNote = scaleNote(chord[0] + note.deg, 1);
            if (_intensity < 0.58) {
              _playOboe(noteTime, midiNote, noteDur, 0.35 + _intensity * 0.22);
            } else {
              _playBrass(noteTime, [midiNote, midiNote - 12], Math.max(noteDur * 0.7, sixteenthDur), 0.45 + _intensity * 0.25);
            }
          });
        }
      }

      // ── Percussion ──
      const kickPattern = PERC_PATTERNS.kick[percLevel];
      const timpPattern = PERC_PATTERNS.timpani[percLevel];
      const hatPattern = PERC_PATTERNS.hat[percLevel];
      const sixteenthDur = beatDuration / 4;

      for (let slot = 0; slot < 16; slot++) {
        const slotTime = barTime + slot * sixteenthDur;

        if (kickPattern[slot] && _intensity > 0.2) {
          _playKick(slotTime, 0.7 + _intensity * 0.3);
        }
        if (timpPattern[slot] && bar >= 14 && _intensity > 0.3) {
          // Timpani only in last 2 bars (phrase boundary buildup)
          _playTimpani(slotTime, 0.6 + _intensity * 0.4);
        }
        if (hatPattern[slot] && _intensity > 0.35) {
          _playHat(slotTime, 0.5 + _intensity * 0.3);
        }
      }

      // ── Bass line (grounding low-octave support) ──
      if (_intensity > 0.2) {
        const bassNote = scaleNote(chord[0], -1);
        _playPiano(barTime, bassNote, beatDuration * 2, 0.5 + _intensity * 0.3);
        if (_intensity > 0.5) {
          // Walking bass on beat 3
          const walkNote = scaleNote(chord[1], -1);
          _playPiano(barTime + beatDuration * 2, walkNote, beatDuration * 1.5, 0.4);
        }
      }
    }

    // ── Hook: bars 12-13 (memorable motif that repeats each phrase) ──
    const hookTime = startTime + 12 * barDuration;
    const hookChord = prog[3]; // last chord group
    if (_intensity > 0.3 && !combatDrive) {
      const hookMelody = MELODIES[2]; // always use the hook melody
      const sixteenthDur = beatDuration / 4;
      hookMelody.forEach(note => {
        const noteTime = hookTime + note.start * sixteenthDur;
        const noteDur = note.dur * sixteenthDur;
        const midiNote = scaleNote(hookChord[0] + note.deg, 2);
        _playOboe(noteTime, midiNote, noteDur, 0.7);
        // Double with strings at high intensity
        if (_intensity > 0.6) {
          _playStringChord(noteTime, [midiNote, midiNote - 5], noteDur, 0.4);
        }
      });
    }

    // ── End bar: keep pressure in combat, resolve only in lower-intensity states ──
    const resTime = startTime + 15 * barDuration;
    const tonicChord = [scaleNote(0, 0), scaleNote(2, 0), scaleNote(4, 0)];
    if (_intensity > 0.2 && !combatDrive) {
      _playStringChord(resTime, tonicChord.map(n => n + 12), barDuration, 0.55);
      _playBrass(resTime, tonicChord, beatDuration * 3, 0.35 * _intensity);
      _playPiano(resTime, scaleNote(0, 0), barDuration, 0.35);
    } else if (combatDrive) {
      const tensionChord = [scaleNote(0, 0), scaleNote(1, 0), scaleNote(4, 0)];
      _playBrass(resTime, tensionChord, beatDuration * 2.5, 0.45 + _intensity * 0.2);
      _playCombatPulse(resTime + beatDuration * 2.5, scaleNote(0, -1), beatDuration * 1.2, 0.65);
    }
  }

  // ── Fanfare: special brass + timpani sequence for launch ──
  function _scheduleFanfare(startTime) {
    const dur = beatDuration;
    // Rising brass triad
    _playBrass(startTime, [mtof(60), mtof(64), mtof(67)].map(f => 60 + Math.round(12 * Math.log2(f / 440)) + 69 - 60), dur * 2, 0.9);
    // Use scale notes for proper fanfare
    const fanfareNotes = [
      { time: 0, notes: [scaleNote(0, 1), scaleNote(2, 1), scaleNote(4, 1)], dur: 2 },
      { time: 2, notes: [scaleNote(2, 1), scaleNote(4, 1), scaleNote(6, 1)], dur: 1.5 },
      { time: 3.5, notes: [scaleNote(4, 1), scaleNote(6, 1), scaleNote(1, 2)], dur: 2.5 },
      { time: 6, notes: [scaleNote(0, 2), scaleNote(2, 2), scaleNote(4, 2)], dur: 4 },
    ];
    fanfareNotes.forEach(f => {
      _playBrass(startTime + f.time * dur, f.notes, f.dur * dur, 0.85);
    });
    // Timpani roll under fanfare
    for (let i = 0; i < 8; i++) {
      _playTimpani(startTime + i * dur * 0.5, 0.6 + i * 0.05);
    }
    // Cymbal crash at climax
    const crashTime = startTime + 6 * dur;
    const crash = ctx.createBufferSource();
    crash.buffer = _getNoiseBuffer();
    const crashHP = ctx.createBiquadFilter();
    crashHP.type = 'highpass';
    crashHP.frequency.value = 3000;
    const crashG = ctx.createGain();
    crashG.gain.setValueAtTime(0.25, crashTime);
    crashG.gain.exponentialRampToValueAtTime(0.001, crashTime + 2);
    crash.connect(crashHP);
    crashHP.connect(crashG);
    crashG.connect(musicGain);
    crash.start(crashTime);
    crash.stop(crashTime + 2);
  }

  // ══════════════════════════════════════
  // MAIN LOOP — schedules phrases ahead of time
  // ══════════════════════════════════════

  function _tick() {
    if (!playing || !ctx) return;
    _animFrame = requestAnimationFrame(_tick);

    const now = ctx.currentTime;

    // Smooth intensity toward target
    _intensity += (_targetIntensity - _intensity) * _intensitySmooth;
    _intensity = Math.max(0, Math.min(1, _intensity));

    // Adjust tempo based on intensity and manifold spectral field.
    const fieldAbs = Math.min(1, Math.abs(_manifoldState.field || 0));
    const phasePulse = 0.5 + 0.5 * Math.sin(_manifoldState.phase || 0);
    const targetBpm = 80 + _intensity * 30 + fieldAbs * 10 + phasePulse * 4;
    bpm += (targetBpm - bpm) * 0.01;
    beatDuration = 60 / bpm;
    barDuration = beatDuration * 4;
    phraseDuration = barDuration * phraseLength;

    // Schedule next phrase if approaching end of current one
    if (now >= phraseStartTime + phraseDuration - _scheduleAhead) {
      phraseStartTime = phraseStartTime + phraseDuration;
      if (phraseStartTime < now) phraseStartTime = now; // catch up if we fell behind
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
    musicGain.gain.value = 0.35; // music sits under SFX
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
    if (_animFrame) {
      cancelAnimationFrame(_animFrame);
      _animFrame = null;
    }
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

  // ── Intensity control (called by game logic) ──
  function setIntensity(value) {
    _targetIntensity = Math.max(0, Math.min(1, value));
  }

  // ── Trigger fanfare (one-shot, additive on top of normal music) ──
  function triggerFanfare() {
    if (!ctx || !playing || !enabled) return;
    _keyIndex = 4; // C major for triumph
    _key = KEYS[_keyIndex];
    _scheduleFanfare(ctx.currentTime);
  }

  // ── Set volume (0-1) ──
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
    triggerFanfare,
    setVolume
  };
})();

window.SFMusic = SFMusic;
