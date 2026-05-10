/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 JAZZ SPEAKEASY — procedural live music engine
 *
 * Browser-first Web Audio. No samples, no MIDI files. Everything is
 * synthesized at scheduled times:
 *
 *   • Walking bass        — quarter notes, root/3/5/approach motion
 *   • Brushed drums       — kick (1,3), brushed snare (2,4),
 *                           swung ride pattern, occasional hi-hat splash
 *   • Comp chords         — piano-like FM stabs on the off-beats with
 *                           bright extensions (maj9, 13, b9, #11)
 *   • Melody              — bebop-scale phrases (verse) & a hook line
 *                           (chorus) with phi-anchored rhythmic spacing
 *
 * Form (16-bar loop, repeats forever):
 *   bars 1- 4   Verse A           ii-V-I-VI  (Dm7 G7 Cmaj7 A7)
 *   bars 5- 8   Verse B           ii-V-I-VI  (Dm7 G7 Cmaj7 C7)
 *   bars 9-12   Chorus / Hook     IV-iv-iii-VI ii-V-I (Fmaj7 Fm7 Em7 A7 Dm7 G7 Cmaj7)
 *   bars 13-16  Turnaround        I-VI-ii-V  (Cmaj7 A7 Dm7 G7) with a resolution
 *
 * Swing = 0.62 (16th-note grid).  Tempo defaults to 122 bpm and gently
 * breathes between 116..130 over the verse/chorus arc.
 *
 * API:
 *   JazzSpeakeasy.start(audioContext, { gain=0.55, bpm=122 })
 *   JazzSpeakeasy.stop()
 *   JazzSpeakeasy.setGain(0..1)
 *   JazzSpeakeasy.setEnergy(0..1)   // bumps fills, ride density, brightness
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  const A4 = 440;
  // Map a pitch letter+octave (e.g. "C4", "Eb3", "F#5") to Hz.
  const NOTE_MAP = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function hz(noteName) {
    const m = /^([A-G][b#]?)(-?\d+)$/.exec(noteName);
    if (!m) return 0;
    const semis = NOTE_MAP[m[1]] + (parseInt(m[2], 10) + 1) * 12 - 69;
    return A4 * Math.pow(2, semis / 12);
  }

  // ── Progressions (16 bars, two chords per bar) ─────────────────────
  // Each chord: { root, type } — `type` resolves to a chord-tone set.
  const FORM = [
    // Verse A — bars 1..4
    ['Dm7', 'Dm7'], ['G7', 'G7'], ['Cmaj7', 'Cmaj7'], ['A7b9', 'A7b9'],
    // Verse B — bars 5..8
    ['Dm7', 'Dm7'], ['G7', 'G7'], ['Cmaj7', 'Em7'], ['A7', 'A7'],
    // Chorus / Hook — bars 9..12
    ['Fmaj7', 'Fmaj7'], ['Fm7', 'Fm7'], ['Em7', 'A7'], ['Dm7', 'G7'],
    // Turnaround / Resolution — bars 13..16
    ['Cmaj7', 'Cmaj7'], ['A7', 'A7'], ['Dm7', 'Dm7'], ['G7', 'Cmaj7'],
  ];
  // Section markers (1-indexed bar → flag) to drive intensity automation.
  // verseA = 1..4, verseB = 5..8, chorus = 9..12, turnaround = 13..16.
  function sectionForBar(bar) {
    const b = ((bar - 1) % 16) + 1;
    if (b <= 4) return 'verseA';
    if (b <= 8) return 'verseB';
    if (b <= 12) return 'chorus';
    return 'turnaround';
  }

  // ── Chord-tone sets (all in the C-major neighbourhood) ─────────────
  // Stored as semitone offsets above the root. The voicer picks 3-4
  // tones per stab to keep the chord bright but not muddy.
  const CHORD_TONES = {
    'Cmaj7': [0, 4, 7, 11, 14],          // 1 3 5 7 9
    'Dm7': [0, 3, 7, 10, 14, 17],      // 1 b3 5 b7 9 11
    'Em7': [0, 3, 7, 10, 14],
    'Fmaj7': [0, 4, 7, 11, 14, 18],      // 1 3 5 7 9 #11
    'Fm7': [0, 3, 7, 10, 14],
    'G7': [0, 4, 7, 10, 14, 21],      // 1 3 5 b7 9 13
    'A7': [0, 4, 7, 10, 13],           // 1 3 5 b7 b9 (jazzy alt)
    'A7b9': [0, 4, 7, 10, 13],
  };
  // Root pitch class for walking bass.
  const CHORD_ROOT = {
    'Cmaj7': 'C', 'Dm7': 'D', 'Em7': 'E', 'Fmaj7': 'F', 'Fm7': 'F', 'G7': 'G', 'A7': 'A', 'A7b9': 'A'
  };

  // Bebop / blues melody scale around C (used by both melody & fills).
  // Pitch classes that always sound great over the loop's tonal centre.
  const BEBOP_C = ['C', 'D', 'Eb', 'E', 'F', 'G', 'A', 'Bb', 'B'];

  // ── Engine state ───────────────────────────────────────────────────
  const ENG = {
    ctx: null,
    master: null,
    musicBus: null,
    drumBus: null,
    started: false,
    bpm: 122,
    swing: 0.62,
    gain: 0.55,
    energy: 0.6,           // 0..1 — affects fill density + chorus lift
    bar: 1,                // 1-indexed bar counter
    beat: 0,               // 0..3 within bar
    nextNoteTime: 0,       // seconds (audio context time)
    schedAhead: 0.18,      // sec lookahead
    schedTimer: 0,
  };

  // ── Helper synths ──────────────────────────────────────────────────
  function adsr(param, t0, a, d, s, r, peak) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    param.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t0 + a + d);
    param.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  // Plucky upright-bass-ish tone — sine + tri body + LP filter.
  function playBass(freq, t0, dur, vel) {
    const ctx = ENG.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 1.005;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280 + 220 * vel; lp.Q.value = 4;
    const g = ctx.createGain();
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ENG.musicBus);
    adsr(g.gain, t0, 0.005, 0.08, 0.5, dur * 0.9, 0.45 * vel);
    o1.start(t0); o2.start(t0);
    o1.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);
  }

  // Piano-comp chord stab — additive FM-ish, bright but short.
  function playStab(freqs, t0, dur, vel) {
    const ctx = ENG.ctx;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ENG.musicBus);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.6;
    out.connect(hp); hp.connect(lp); lp.connect(ENG.musicBus);
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      const car = ctx.createOscillator(); car.type = 'triangle'; car.frequency.value = f;
      const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 2;
      const modGain = ctx.createGain(); modGain.gain.value = f * 0.5;
      mod.connect(modGain); modGain.connect(car.frequency);
      const g = ctx.createGain();
      car.connect(g); g.connect(hp);
      adsr(g.gain, t0, 0.004, 0.06, 0.25, dur, (0.12 + 0.06 * vel) / freqs.length * 2);
      car.start(t0); mod.start(t0);
      car.stop(t0 + dur + 0.1); mod.stop(t0 + dur + 0.1);
    }
  }

  // Lead melody — clarinet-ish: square through soft LP, slight vibrato.
  function playLead(freq, t0, dur, vel) {
    const ctx = ENG.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.5;
    const vibG = ctx.createGain(); vibG.gain.value = freq * 0.006;
    vib.connect(vibG); vibG.connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 + 1400 * vel; lp.Q.value = 2;
    const g = ctx.createGain();
    o.connect(lp); lp.connect(g); g.connect(ENG.musicBus);
    adsr(g.gain, t0, 0.018, 0.08, 0.7, dur * 0.7, 0.22 * vel);
    o.start(t0); vib.start(t0);
    o.stop(t0 + dur + 0.15); vib.stop(t0 + dur + 0.15);
  }

  // Drums — all noise/sine based.
  function playKick(t0, vel) {
    const ctx = ENG.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.connect(g); g.connect(ENG.drumBus);
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.9 * vel, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.start(t0); o.stop(t0 + 0.25);
  }
  // Brushed snare = filtered noise burst.
  function playSnare(t0, vel) {
    const ctx = ENG.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
    const g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(ENG.drumBus);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.28 * vel, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    src.start(t0); src.stop(t0 + 0.2);
  }
  // Ride/hi-hat tick — short high-pass noise.
  function playRide(t0, vel) {
    const ctx = ENG.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
    const g = ctx.createGain();
    src.connect(hp); hp.connect(g); g.connect(ENG.drumBus);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    src.start(t0); src.stop(t0 + 0.08);
  }

  // ── Voicers ────────────────────────────────────────────────────────
  function voiceChord(name, octave) {
    const tones = CHORD_TONES[name] || CHORD_TONES['Cmaj7'];
    const root = CHORD_ROOT[name] || 'C';
    const rootHz = hz(`${root}${octave}`);
    // Pick three pretty tones: root-skip (3), 5/7, and a colour tone.
    const pick = [tones[1], tones[3], tones[4] || tones[2]].filter(v => v != null);
    return pick.map(s => rootHz * Math.pow(2, s / 12));
  }
  function bassNote(chordName, beatInBar) {
    const root = CHORD_ROOT[chordName] || 'C';
    const tones = CHORD_TONES[chordName] || CHORD_TONES['Cmaj7'];
    const rootHz = hz(`${root}2`);
    // Walking pattern: 1 - 3/5 - 5 - chromatic approach (jazz idiom).
    const choices = [0, tones[1], tones[2] || 7, tones[3] || 10];
    let semis = choices[beatInBar % 4];
    if (beatInBar === 3) {
      // Random chromatic approach for forward motion.
      semis = (Math.random() < 0.5) ? -1 : 1;
      return rootHz * Math.pow(2, semis / 12) * Math.pow(2, -1 / 12);  // a half-step approach
    }
    return rootHz * Math.pow(2, semis / 12);
  }

  // Melodic phrase generator — picks bebop-scale notes that resolve at
  // bar boundaries. Verse uses sparse arching lines; chorus throws in
  // the "hook" — a repeated 3-note pickup that lands on the I chord.
  function melodyNotes(bar, beat16, section) {
    // beat16 = 0..15 (sixteenth index within the bar). Return [{ pitch, dur16, vel }] or [].
    if (section === 'verseA' || section === 'verseB') {
      // Verse: a note every 2..3 sixteenths, light density.
      const ok = (beat16 === 0 || beat16 === 6 || beat16 === 10);
      if (!ok) return [];
      const scale = BEBOP_C;
      const pc = scale[(bar * 3 + beat16) % scale.length];
      const oct = (beat16 >= 8) ? 5 : 4;
      return [{ freq: hz(`${pc}${oct}`), dur16: 2, vel: 0.6 }];
    }
    if (section === 'chorus') {
      // Chorus: hook on the "1+2+" of every bar, lands on E or G.
      const hookPositions = [0, 2, 4, 8, 10];
      if (hookPositions.indexOf(beat16) < 0) return [];
      const land = ['E', 'G', 'E', 'G', 'C'][hookPositions.indexOf(beat16)];
      return [{ freq: hz(`${land}5`), dur16: 2, vel: 0.85 }];
    }
    // turnaround: a descending lick on bar 16 to resolve.
    const lick = [
      { at: 0, pc: 'G', oct: 5 },
      { at: 2, pc: 'F', oct: 5 },
      { at: 4, pc: 'E', oct: 5 },
      { at: 6, pc: 'D', oct: 5 },
      { at: 8, pc: 'C', oct: 5 },
      { at: 12, pc: 'B', oct: 4 },
      { at: 14, pc: 'C', oct: 5 },
    ];
    const hit = lick.find(n => n.at === beat16);
    if (!hit) return [];
    return [{ freq: hz(`${hit.pc}${hit.oct}`), dur16: 2, vel: 0.7 }];
  }

  // Convert a (bar, beat16) position to audio-clock time, applying swing
  // to off-eighths (16ths 2 and 6 within each beat).
  function beat16ToTime(originTime, bar, beat16, secPerBeat) {
    const beat = Math.floor(beat16 / 4);
    const sub = beat16 % 4;
    let t = beat * secPerBeat;
    // sub 0 → on-beat, 1 → e, 2 → "and", 3 → a
    const swing = ENG.swing;
    if (sub === 0) t += 0;
    else if (sub === 1) t += secPerBeat * (swing - 0.5) * 0.5 + secPerBeat * 0.25;
    else if (sub === 2) t += secPerBeat * swing;
    else t += secPerBeat * swing + secPerBeat * (1 - swing) * 0.5;
    return originTime + ((bar - 1) % 1) * 0 + t;
  }

  // ── Scheduler ──────────────────────────────────────────────────────
  // We schedule one bar at a time, then advance and repeat.
  function scheduleBar(barOriginTime, bar) {
    const secPerBeat = 60 / ENG.bpm;
    const section = sectionForBar(bar);
    const chords = FORM[(bar - 1) % FORM.length];        // [chord1, chord2]
    const e = ENG.energy;
    const isChorus = section === 'chorus';
    const isTurn = section === 'turnaround';

    // ── Drums ──────────────────────────────────────────────────────
    for (let beat = 0; beat < 4; beat++) {
      const tBeat = barOriginTime + beat * secPerBeat;
      // Kick on 1 and 3 (light upright-bass feel)
      if (beat === 0 || beat === 2) playKick(tBeat, 0.7 + 0.2 * e);
      // Brushed snare on 2 and 4 (the classic jazz back-beat with brushes)
      if (beat === 1 || beat === 3) playSnare(tBeat, 0.6 + 0.2 * (isChorus ? 1 : e));
      // Ride pattern — quarter + swung "and": ding-da-ding, ding-da-ding
      playRide(tBeat, 0.55 + 0.15 * e);
      // The swung "and" — second eighth note, offset by swing
      const tSwing = tBeat + secPerBeat * ENG.swing;
      // Skip the swung ride after beat 4 to leave breathing room on chorus bars
      if (!(isChorus && beat === 3)) playRide(tSwing, 0.4 + 0.15 * e);
    }
    // Light fill on the last bar of each 4-bar phrase.
    const phrasePos = ((bar - 1) % 4);
    if (phrasePos === 3) {
      playSnare(barOriginTime + 3 * secPerBeat + secPerBeat * 0.5, 0.45);
      playSnare(barOriginTime + 3 * secPerBeat + secPerBeat * 0.75, 0.55);
    }

    // ── Walking bass on quarter notes ──────────────────────────────
    for (let beat = 0; beat < 4; beat++) {
      const tBeat = barOriginTime + beat * secPerBeat;
      const chord = (beat < 2) ? chords[0] : chords[1];
      const f = bassNote(chord, beat);
      playBass(f, tBeat, secPerBeat * 0.92, 0.85);
    }

    // ── Comp chord stabs on the "and" of 2 and 4 (Charleston/Basie) ─
    const compTimes = [secPerBeat * 1.5, secPerBeat * 3.5];
    const compVel = [0.7, 0.9];
    for (let i = 0; i < compTimes.length; i++) {
      const chord = (i === 0) ? chords[0] : chords[1];
      const voicing = voiceChord(chord, 4);
      playStab(voicing, barOriginTime + compTimes[i] + secPerBeat * (ENG.swing - 0.5) * 0.5,
        secPerBeat * 0.55, compVel[i] * (0.85 + 0.15 * e));
    }
    // Extra chorus / turnaround ornament: a "push" stab on the "and of 1".
    if (isChorus || isTurn) {
      const chord = chords[0];
      const voicing = voiceChord(chord, 4).map(f => f * Math.pow(2, 1 / 12)); // briefly tense
      playStab(voicing.slice(0, 2), barOriginTime + secPerBeat * 0.5,
        secPerBeat * 0.25, 0.55);
    }

    // ── Melody / hook ──────────────────────────────────────────────
    for (let s = 0; s < 16; s++) {
      const notes = melodyNotes(bar, s, section);
      if (!notes.length) continue;
      const tNote = beat16ToTime(barOriginTime, bar, s, secPerBeat);
      for (const n of notes) {
        const dur = secPerBeat * 0.25 * n.dur16;
        playLead(n.freq, tNote, dur, n.vel);
      }
    }

    // ── Resolution: on bar 16 beat 4, drop a held Cmaj9 to breathe. ─
    if ((bar % 16) === 0) {
      const t = barOriginTime + 3 * secPerBeat;
      const voicing = voiceChord('Cmaj7', 4);
      playStab(voicing, t, secPerBeat * 1.4, 0.65);
    }
  }

  function scheduler() {
    if (!ENG.started) return;
    const ctx = ENG.ctx;
    const secPerBar = (60 / ENG.bpm) * 4;
    // Catch up if we've fallen far behind (tab throttle, suspend/resume,
    // stop→start cycles, etc). Without this guard the while loop below can
    // iterate thousands of times and freeze the browser.
    if (ENG.nextNoteTime < ctx.currentTime - secPerBar) {
      ENG.nextNoteTime = ctx.currentTime + 0.05;
    }
    // Hard upper bound on bars scheduled per tick — at most 4 lookahead bars.
    let safety = 0;
    while (ENG.nextNoteTime < ctx.currentTime + ENG.schedAhead + secPerBar && safety++ < 4) {
      scheduleBar(ENG.nextNoteTime, ENG.bar);
      ENG.nextNoteTime += secPerBar;
      ENG.bar++;
      // Gentle tempo breathing across the form (±4 bpm).
      const sec = sectionForBar(ENG.bar);
      const target = (sec === 'chorus') ? 128 : (sec === 'turnaround') ? 125 : 120;
      ENG.bpm += (target - ENG.bpm) * 0.18;
    }
    ENG.schedTimer = setTimeout(scheduler, 60);
  }

  // ── Public API ─────────────────────────────────────────────────────
  function start(audioContext, opts) {
    if (ENG.started) return;
    const o = opts || {};
    ENG.ctx = audioContext;
    ENG.bpm = o.bpm || 122;
    ENG.gain = o.gain != null ? o.gain : 0.55;
    ENG.master = audioContext.createGain();
    ENG.master.gain.value = ENG.gain;
    // Allow the host to supply its own destination AudioNode (e.g. a
    // slider-controlled gain bus). Falls back to the raw destination.
    const dest = o.destination || audioContext.destination;
    ENG.master.connect(dest);
    ENG.musicBus = audioContext.createGain(); ENG.musicBus.gain.value = 0.85;
    ENG.drumBus = audioContext.createGain(); ENG.drumBus.gain.value = 0.65;
    // Gentle compressor on the master to glue it together.
    const comp = audioContext.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.005; comp.release.value = 0.18;
    ENG.musicBus.connect(comp);
    ENG.drumBus.connect(comp);
    comp.connect(ENG.master);
    ENG.bar = 1;
    ENG.nextNoteTime = audioContext.currentTime + 0.1;
    ENG.started = true;
    scheduler();
  }
  function stop() {
    if (!ENG.started) return;
    ENG.started = false;
    clearTimeout(ENG.schedTimer);
    ENG.schedTimer = 0;
    try { ENG.master.disconnect(); } catch (e) { }
    ENG.master = ENG.musicBus = ENG.drumBus = null;
    // Reset clock so a subsequent start() reinitialises cleanly.
    ENG.nextNoteTime = 0;
    ENG.bar = 1;
    ENG.beat = 0;
  }
  function setGain(v) {
    ENG.gain = Math.max(0, Math.min(1, v));
    if (ENG.master) ENG.master.gain.setTargetAtTime(ENG.gain, ENG.ctx.currentTime, 0.05);
  }
  function setEnergy(v) { ENG.energy = Math.max(0, Math.min(1, v)); }
  function isRunning() { return ENG.started; }
  function getSection() { return sectionForBar(ENG.bar); }

  global.JazzSpeakeasy = { start, stop, setGain, setEnergy, isRunning, getSection };
})(typeof window !== 'undefined' ? window : globalThis);
