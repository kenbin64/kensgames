/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD INSTRUMENT WORKLET — field synthesis on the audio thread
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Audio-thread twin of js/manifold-instrument.js. Field equations inlined
 * because AudioWorkletGlobalScope has no module loader. Same maths as the
 * kernel ⇒ same waveform sample-for-sample (assuming same parent point,
 * same bloom seed, same freq, same dur, same sampleRate).
 *
 *   main thread → port.postMessage({ type: 'trigger', voice: {...} })
 *   worklet     → mixes all active voices into output[0][0..127]
 *   voice ends  → removed from the active set; `port.postMessage({type:'end',id})`
 *
 * The kernel is the source of truth; this file is the realtime renderer.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
/* global AudioWorkletProcessor, registerProcessor, sampleRate */
'use strict';

const TAU = Math.PI * 2;

// ── Field equations (kept in lockstep with js/manifold-field.js) ────────────
function gyroid(x, y, z) {
  return Math.sin(x) * Math.cos(y)
       + Math.sin(y) * Math.cos(z)
       + Math.sin(z) * Math.cos(x);
}
function schwartzD(x, y, z) {
  const sx = Math.sin(x), cx = Math.cos(x);
  const sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
}
function fieldValue(x, y, z, t) {
  const w = (t == null) ? 0.5 : t;
  return gyroid(x, y, z) * (1 - w) + schwartzD(x, y, z) * w;
}

class ManifoldInstrumentProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._voices = [];
    this._nextId = 1;
    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'trigger')      this._trigger(msg.voice);
    else if (msg.type === 'release') this._release(msg.id);
    else if (msg.type === 'flush')   this._voices.length = 0;
  }

  _trigger(v) {
    if (!v || !v.parent || !v.seed) return;
    const sr = sampleRate;
    const freq = +v.freq || 220;
    const dur  = Math.max(0.005, +v.dur || 0.25);
    const stepBase = (TAU * freq) / sr;
    const id = v.id || ('v' + (this._nextId++));
    this._voices.push({
      id: id,
      px: +v.parent.x || 0, py: +v.parent.y || 0, pz: +v.parent.z || 0,
      dx: (+v.seed[0] || 0) * stepBase,
      dy: (+v.seed[1] || +v.seed[0] || 0) * stepBase * 1.6180339887498949,
      dz: (+v.seed[2] || +v.seed[0] || 0) * stepBase / 1.6180339887498949,
      t:  (v.t != null) ? +v.t : 0.5,
      attack: Math.max(1, Math.floor(((v.attack != null) ? +v.attack : 0.005) * sr)),
      total:  Math.floor(dur * sr),
      cursor: 0,
      gain:   (v.gain != null) ? +v.gain : 0.7,
      decayPow: 1 + Math.max(0, +v.gradMag || 0.5) * 2,
    });
  }

  _release(id) {
    for (let i = 0; i < this._voices.length; i++) {
      if (this._voices[i].id === id) { this._voices.splice(i, 1); return; }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const left = out[0];
    const right = out.length > 1 ? out[1] : null;
    const n = left.length;
    for (let i = 0; i < n; i++) left[i] = 0;
    if (right) for (let i = 0; i < n; i++) right[i] = 0;

    const voices = this._voices;
    for (let v = voices.length - 1; v >= 0; v--) {
      const vv = voices[v];
      let px = vv.px, py = vv.py, pz = vv.pz;
      const a = vv.attack, total = vv.total, dp = vv.decayPow, g = vv.gain;
      let c = vv.cursor;
      for (let i = 0; i < n && c < total; i++, c++) {
        const env = c < a
          ? (c / a)
          : Math.pow(1 - (c - a) / Math.max(1, total - a), dp);
        const s = fieldValue(px, py, pz, vv.t) * env * g;
        left[i] += s;
        if (right) right[i] += s;
        px += vv.dx; py += vv.dy; pz += vv.dz;
      }
      vv.px = px; vv.py = py; vv.pz = pz; vv.cursor = c;
      if (c >= total) {
        voices.splice(v, 1);
        try { this.port.postMessage({ type: 'end', id: vv.id }); } catch (e) { /* port closed */ }
      }
    }

    // Soft saturating limiter — keeps the bus inside ±1.0 even when many
    // voices stack at peaks. tanh is monotonic so the timbre survives.
    for (let i = 0; i < n; i++) {
      left[i] = Math.tanh(left[i]);
      if (right) right[i] = Math.tanh(right[i]);
    }
    return true;
  }
}

registerProcessor('manifold-instrument', ManifoldInstrumentProcessor);
