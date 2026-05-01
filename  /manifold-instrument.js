/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD INSTRUMENT — the field as the only sound source
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   z = x · y       — the audible event (PCM)
 *   y = z / x       — the rule the manifold supplied (timbre / envelope)
 *   x'= y / z       — the bloom (the next thing this sound spawns)
 *
 * Every method below takes a parent x (the thing being voiced — a peg, a hit,
 * a ship, a moment), runs ONE turn of the four-function loop, and renders the
 * resulting bloom as PCM by sampling the manifold field along an audio-rate
 * path. No samples. No presets. No `playSound('captured')`.
 *
 * Renderer is pure-sync so Node tests can produce bit-identical PCM. Browser
 * playback is delegated to the AudioWorklet which inlines the same field
 * equations. The seed log records every bloom — replay = re-render.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  'use strict';
  const I = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = I;
  if (root) root.ManifoldInstrument = I;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  function _resolve(globalName, modulePath) {
    if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
    if (typeof globalThis !== 'undefined' && globalThis[globalName]) return globalThis[globalName];
    if (typeof require === 'function') {
      try { return require(modulePath); } catch (e) { /* not on Node path */ }
    }
    return null;
  }
  const FIELD = _resolve('ManifoldField', './manifold-field.js');
  const LOOP = _resolve('ManifoldLoop', './manifold-loop.js');
  const CODEC = _resolve('ManifoldCodec', './manifold-codec.js');

  const PHI = (FIELD && FIELD.PHI) || ((1 + Math.sqrt(5)) / 2);
  const TAU = Math.PI * 2;

  // Twelve-tone equal-temperament reference, but the *mode* is selected by the
  // field region (scaleAt). The note picked from the mode is selected by the
  // observation value — same observation, same note, every time.
  const A4 = 440;
  function midiToHz(m) { return A4 * Math.pow(2, (m - 69) / 12); }

  // Modes are 7-degree subsets of 12-TET. The field at the parent's point
  // chooses one of these — gyroid-positive lobes lean ionian/lydian (bright),
  // schwartz-negative lobes lean phrygian/locrian (dark). Pure projection.
  const MODES = [
    { name: 'ionian', deg: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'lydian', deg: [0, 2, 4, 6, 7, 9, 11] },
    { name: 'mixolydian', deg: [0, 2, 4, 5, 7, 9, 10] },
    { name: 'dorian', deg: [0, 2, 3, 5, 7, 9, 10] },
    { name: 'aeolian', deg: [0, 2, 3, 5, 7, 8, 10] },
    { name: 'phrygian', deg: [0, 1, 3, 5, 7, 8, 10] },
    { name: 'locrian', deg: [0, 1, 3, 5, 6, 8, 10] },
  ];

  // scaleAt — the manifold region's musical mode + root. Bright fields pick
  // bright modes; dark regions pick dark modes; root drifts with field phase.
  function scaleAt(point, t) {
    const v = FIELD.value(point.x, point.y, point.z, t);
    const idx = Math.max(0, Math.min(MODES.length - 1, Math.floor(((v + 1.5) / 3) * MODES.length)));
    const mode = MODES[idx];
    // root MIDI in [48,71] (C3..B4), driven by field phase at the point.
    const root = 48 + (((Math.sin(point.x + point.y * PHI + point.z / PHI) * 0.5 + 0.5) * 24) | 0);
    return { mode: mode.name, degrees: mode.deg, root: root };
  }

  function _scaleNote(scale, obsValue, octaveBias) {
    const u = (obsValue + 1) * 0.5; // [0,1]
    const idx = Math.max(0, Math.min(scale.degrees.length - 1, Math.floor(u * scale.degrees.length)));
    return scale.root + scale.degrees[idx] + 12 * (octaveBias | 0);
  }

  // ── Path through the field ────────────────────────────────────────────────
  // For a parent x, the bloom's seed *is* the path direction. We walk from the
  // parent's point along the bloom seed, sampling field.value at each audio
  // sample. That walk IS the waveform — no oscillator.
  function _audioPath(parentPoint, bloomSeed, n, sampleRate, freq, t) {
    // Path step size scales with frequency: one cycle of the field per period.
    const stepBase = (TAU * freq) / sampleRate;
    const dx = (bloomSeed[0] || 0) * stepBase;
    const dy = (bloomSeed[1] || bloomSeed[0] || 0) * stepBase * PHI;
    const dz = (bloomSeed[2] || bloomSeed[0] || 0) * stepBase / PHI;
    const out = new Float32Array(n);
    let px = parentPoint.x, py = parentPoint.y, pz = parentPoint.z;
    for (let i = 0; i < n; i++) {
      out[i] = FIELD.value(px, py, pz, t);
      px += dx; py += dy; pz += dz;
    }
    return out;
  }

  // Envelope shaped by the *gradient* of the field at the parent — calm
  // regions decay slowly, turbulent regions snap.
  function _gradEnvelope(grad, n, attack, sustain) {
    const mag = Math.sqrt(grad.x * grad.x + grad.y * grad.y + grad.z * grad.z);
    const decayPow = 1 + mag * 2;             // higher gradient → faster decay
    const a = Math.max(1, attack | 0);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const env = i < a
        ? (i / a)
        : Math.pow(1 - (i - a) / Math.max(1, n - a), decayPow);
      out[i] = env * sustain;
    }
    return out;
  }

  // Normalize and clip — the field is unbounded in principle; in practice
  // value(x,y,z) ∈ ~[-1.5, 1.5]. We normalize to ±0.9 to leave headroom.
  function _normalize(buf, peak) {
    let mx = 1e-9;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > mx) mx = a; }
    const g = (peak || 0.9) / mx;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
    return buf;
  }

  // Render = run one loop turn, walk the field along the bloom seed, shape
  // by gradient envelope. Returns { x', pcm, freq, dur, sr, scale, note }.
  function _render(parentX, opts) {
    if (!FIELD || !LOOP) throw new Error('ManifoldInstrument: ManifoldField + ManifoldLoop required');
    const sr = (opts && opts.sampleRate) || 44100;
    const dur = (opts && opts.dur != null) ? opts.dur : 0.25;
    const intent = (opts && opts.intent) || [1, 1, 1];
    const t = (opts && opts.t != null) ? opts.t : 0.5;
    const attack = (opts && opts.attack != null) ? Math.floor(opts.attack * sr) : Math.floor(0.005 * sr);
    const octBias = (opts && opts.octave) | 0;
    const peak = (opts && opts.peak) || 0.9;
    const turn = LOOP.cycle(parentX, intent, opts && opts.log, { t: t });
    const scale = scaleAt(turn.obs.point, t);
    const note = _scaleNote(scale, turn.obs.value, octBias);
    const freq = (opts && opts.freq != null) ? opts.freq : midiToHz(note);
    const n = Math.max(1, Math.floor(dur * sr));
    const wave = _audioPath(turn.obs.point, turn.x.seed, n, sr, freq, t);
    const env = _gradEnvelope(turn.obs.grad, n, attack, 1.0);
    for (let i = 0; i < n; i++) wave[i] *= env[i];
    _normalize(wave, peak);
    const id = (CODEC && CODEC.idFromSeed) ? CODEC.idFromSeed(turn.x.seed) : turn.x.id;
    return { x: turn.x, id: id, pcm: wave, freq: freq, note: note, scale: scale, dur: dur, sr: sr, parent: turn.obs };
  }

  // ── Public voicings — every one is z = x · y at audio rate ────────────────

  // Voice — sustained tone. The thing being voiced (parentX) is held; the
  // manifold supplies its timbre. Use for ambient pads, ship engines, holds.
  function Voice(parentX, opts) {
    return _render(parentX, Object.assign({ dur: 0.8, attack: 0.05, peak: 0.7 }, opts || {}));
  }

  // Pluck — percussive, gradient-shaped. Use for hits, captures, button taps.
  // Energy in [0,1] biases envelope sharpness and pitch octave.
  function Pluck(parentX, energy, opts) {
    const e = (energy == null) ? 0.5 : Math.max(0, Math.min(1, energy));
    return _render(parentX, Object.assign({
      dur: 0.08 + e * 0.25,
      attack: 0.001 + (1 - e) * 0.01,
      octave: e > 0.6 ? 1 : 0,
      peak: 0.85,
    }, opts || {}));
  }

  // Burst — noise-band burst (replaces the explosion samples). Walks the
  // field at a chaotic rate so the path samples behave like band-limited
  // turbulence. Energy biases length, brightness, and headroom.
  function Burst(parentX, energy, opts) {
    const e = (energy == null) ? 0.7 : Math.max(0, Math.min(1, energy));
    const baseFreq = 60 + e * 240;        // low-mid rumble band
    return _render(parentX, Object.assign({
      dur: 0.15 + e * 0.55,
      attack: 0.0005,
      freq: baseFreq * (8 + e * 24),      // overdrive the path so field aliases
      intent: [1, PHI, 1 / PHI],
      peak: 0.95,
    }, opts || {}));
  }

  // Stream — long-form line. Use for music phrases / intro / continuous beds.
  // Drives the loop multiple times so the bloom of one segment becomes the
  // parent x of the next — a melody that walks the manifold by itself.
  function Stream(parentX, opts) {
    const o = opts || {};
    const segments = Math.max(1, (o.segments | 0) || 8);
    const segDur = (o.segDur != null) ? o.segDur : 0.25;
    const sr = o.sampleRate || 44100;
    const n = Math.floor(segDur * sr);
    const total = new Float32Array(n * segments);
    let parent = parentX;
    const events = new Array(segments);
    for (let s = 0; s < segments; s++) {
      const seg = _render(parent, Object.assign({}, o, { dur: segDur, sampleRate: sr }));
      total.set(seg.pcm, s * n);
      events[s] = { id: seg.id, note: seg.note, scale: seg.scale };
      parent = seg.x;             // bloom becomes the next x — recursion up
    }
    return { pcm: total, dur: segDur * segments, sr: sr, segments: events, x: parent };
  }

  // Render a parent x to a single audible event. Convenience for legacy
  // playSound(name) style callers — the name becomes part of the seed so
  // distinct names yield distinct sounds while same name + same parent
  // always yield the same sound.
  function event(parentX, name, energy, opts) {
    const seed = Array.isArray(parentX) ? parentX
      : (parentX && parentX.seed) ? parentX.seed
        : [0];
    const tag = (CODEC ? CODEC.fnv1a(String(name || '')) : 0) / 0xffffffff;
    const childSeed = seed.concat([tag]);
    const x = { seed: childSeed, parent: (parentX && parentX.id) || null, dim: ((parentX && parentX.dim) | 0) };
    return Pluck(x, energy != null ? energy : tag, opts);
  }

  // ── Browser bridge — bind to an AudioContext and the worklet ──────────────
  // Once bound, every voicing additionally emits a trigger to the worklet so
  // the same parameters that produced the offline PCM also play in realtime.
  // Node callers never call bind(); their _render PCM is the only output.
  let _ctx = null, _node = null, _master = null;

  function bind(audioContext, opts) {
    if (typeof audioContext === 'undefined' || !audioContext) return Promise.reject(new Error('bind: AudioContext required'));
    const path = (opts && opts.workletPath) || 'js/manifold-instrument.worklet.js';
    const dest = (opts && opts.destination) || audioContext.destination;
    return audioContext.audioWorklet.addModule(path).then(() => {
      _ctx = audioContext;
      _node = new AudioWorkletNode(_ctx, 'manifold-instrument', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      _master = _ctx.createGain();
      _master.gain.value = (opts && opts.masterGain != null) ? opts.masterGain : 0.8;
      _node.connect(_master).connect(dest);
      return { node: _node, master: _master };
    });
  }

  function isBound() { return !!_node; }
  function setMasterGain(g) { if (_master) _master.gain.value = +g; }

  function _emitTrigger(rendered) {
    if (!_node || !rendered || !rendered.parent) return;
    const grad = rendered.parent.grad;
    const gradMag = Math.sqrt(grad.x * grad.x + grad.y * grad.y + grad.z * grad.z);
    _node.port.postMessage({
      type: 'trigger',
      voice: {
        id: rendered.id,
        parent: { x: rendered.parent.point.x, y: rendered.parent.point.y, z: rendered.parent.point.z },
        seed: rendered.x.seed.slice(0, 3),
        freq: rendered.freq,
        dur: rendered.dur,
        attack: 0.005,
        gain: 0.7,
        gradMag: gradMag,
        t: 0.5,
      },
    });
  }

  // Wrap the public voicings so a bound context is fed automatically. The
  // returned shape is unchanged for test parity.
  const _Voice = Voice, _Pluck = Pluck, _Burst = Burst, _Stream = Stream;
  function VoiceB(parentX, opts) { const r = _Voice(parentX, opts); _emitTrigger(r); return r; }
  function PluckB(parentX, e, o) { const r = _Pluck(parentX, e, o); _emitTrigger(r); return r; }
  function BurstB(parentX, e, o) { const r = _Burst(parentX, e, o); _emitTrigger(r); return r; }
  function StreamB(parentX, opts) {
    const r = _Stream(parentX, opts);
    if (_node) {
      // A stream's segments are a melody; trigger each as its own voice so
      // the worklet can polyphonically render them with their own envelopes.
      // (The aggregate PCM is also returned for offline use.)
      // No-op without per-segment metadata; left for the conductor to drive.
    }
    return r;
  }

  return {
    scaleAt, midiToHz, MODES,
    Voice: VoiceB, Pluck: PluckB, Burst: BurstB, Stream: StreamB,
    event, _render,
    bind, isBound, setMasterGain,
  };
});
