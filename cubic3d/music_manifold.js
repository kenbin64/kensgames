/* ──────────────────────────────────────────────────────────────────────────
   Cubic · Music Manifold
   m = xyz  (Manifold = Expression + Attributes + Substrate)

     x  = identity / seed         → scale field + root pitch  (the "garden")
     y  = modifier / time         → beat phase × intensity    (the "nutrient")
     z  = manifested note (= x·y) → audible frequency         (the "bloom")

   Notes are NEVER stored. Each step the field is queried:
       step n → scaleDegree = fib[n mod 7]  (1,1,2,3,5,8,13)
                z = root · 2^(scale[degree mod len] / 12)
   That is the universal access rule (z = xy) operating on the music garden.

   Attributes: pentatonic-minor on A (Aeolian flavour, snappy and ear-worm)
   Substrate : WebAudio oscillators (square lead, triangle bass, noise hat)
   Tempo     : 96 + 6·(level-1)  bpm, locked to a 16-step bar.
   ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  // x — seed garden (immutable identity field)
  const ROOT_HZ = 220.0;                                  // A3
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];           // A minor pentatonic + extensions
  const FIB = [1, 1, 2, 3, 5, 8, 13];                 // dimensional ladder
  const BASS = [0, 0, 7, 5, 0, 0, 7, 10];              // root walk (semitones from A2)
  const HATS = [1, 0, 1, 1, 0, 1, 1, 1,
    1, 0, 1, 1, 1, 1, 0, 1];               // 16-step hat pattern

  // z = x · y  →  derive frequency (no storage, pure projection)
  function note(stepIndex, intensity) {
    const fib = FIB[stepIndex % FIB.length];
    const deg = SCALE[(fib + stepIndex) % SCALE.length];
    // Intensity bends octave: high level = brighter top octave on accents
    const oct = (intensity > 3 && stepIndex % 4 === 0) ? 12 : 0;
    return ROOT_HZ * Math.pow(2, (deg + oct) / 12);
  }
  function bassNote(barStep) {
    const semi = BASS[barStep % BASS.length] - 12; // one octave below
    return ROOT_HZ * Math.pow(2, semi / 12);
  }

  const MusicManifold = {
    ctx: null, master: null, timer: null,
    step: 0, intensity: 1, playing: false, muted: false,

    _ac() {
      if (this.ctx) return this.ctx;
      this.ctx = new (global.AudioContext || global.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    },

    // y — time substrate: schedule one 16th-note "tick"
    _voice(freq, dur, type, vol, when, attack) {
      const ctx = this.ctx, t = when;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    },

    _hat(when, vol) {
      const ctx = this.ctx, dur = 0.04;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(when);
    },

    _tick(when) {
      const s = this.step;
      const bar16 = s % 16;
      const intensity = this.intensity;

      // Lead — every 16th, square wave, short pluck
      const leadVol = 0.07 + Math.min(intensity, 6) * 0.008;
      this._voice(note(s, intensity), 0.16, 'square', leadVol, when, 0.004);

      // Sub harmony every 4th step — triangle, longer
      if (bar16 % 4 === 0) {
        this._voice(note(s + 2, intensity) * 0.5, 0.32, 'triangle', 0.05, when, 0.01);
      }

      // Bass on each quarter (steps 0,4,8,12) — sawtooth, punchy
      if (bar16 % 4 === 0) {
        const b = bassNote(bar16 / 4 + Math.floor(s / 16));
        this._voice(b, 0.28, 'sawtooth', 0.11, when, 0.006);
      }

      // Hi-hat 16th pattern (busier at higher levels)
      if (HATS[bar16] && (intensity >= 2 || bar16 % 2 === 0)) {
        this._hat(when, 0.04 + Math.min(intensity, 6) * 0.005);
      }

      // Kick on 1 and 3
      if (bar16 === 0 || bar16 === 8) {
        this._voice(60, 0.18, 'sine', 0.22, when, 0.002);
      }

      this.step++;
    },

    start(intensity) {
      if (this.playing) return;
      const ctx = this._ac();
      if (ctx.state === 'suspended') ctx.resume();
      this.playing = true;
      this.intensity = intensity || 1;
      this.step = 0;
      // fade in
      const now = ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0.0001, now);
      this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.5, now + 0.6);

      // 16th-note scheduler — lookahead 0.12s, tick every 50ms
      let nextTime = now + 0.05;
      const sched = () => {
        if (!this.playing) return;
        const bpm = 96 + (this.intensity - 1) * 6;
        const stepDur = 60 / bpm / 4;                 // 16th note
        while (nextTime < this.ctx.currentTime + 0.12) {
          this._tick(nextTime);
          nextTime += stepDur;
        }
        this.timer = setTimeout(sched, 50);
      };
      sched();
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearTimeout(this.timer); this.timer = null;
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      }
    },

    pause() { this.stop(); },
    resume() { if (!this.playing) this.start(this.intensity); },

    setIntensity(level) {
      this.intensity = Math.max(1, level | 0);
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.5, now + 0.15);
      }
      return this.muted;
    },
  };

  global.MusicManifold = MusicManifold;
})(window);
