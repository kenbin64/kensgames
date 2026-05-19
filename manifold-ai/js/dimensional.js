// manifold-ai/js/dimensional.js
// The dimensional paradigm — encoded for runtime use.
//
//   void  →  empty container; the precondition of x
//   x     →  current observer / point of reference / identity
//   y[]   →  attributes drawn FROM the manifold m about x
//            (never assumed; always extracted)
//   z     →  current state = x · collapse(y)   (z = xy)
//            z becomes the next x for the next state.
//
//   A dimension is a perpendicular direction.
//   The next higher dimension occupies one point of the lower
//   (width occupies a single point of length).
//
//     point    — atomic discrete identity                          (dim 1)
//     line     — linear: add / subtract                            (dim 2)
//     plane    — spatial: length × width                           (dim 3)
//     volume   — xyz, multiplied                                   (dim 4)
//     identity — volume given identity collapses to a point        (dim 5)
//                   in the next-higher dimension
//     spiral   — golden-ratio collapse                             (dim 6)
//     bloom    — re-emergence as the new point of reference        (dim 7)
//
//   Seven steps. Fibonacci-scaled. Spirals collapse at φ.

import { SUBSTRATES } from './substrates.js';

export const VOID = Object.freeze({
  x: 0, y: [], z: 0,
  substrate: 'zynxy',
  dim: 0,
  step: 0,
  isVoid: true
});

// Seven-rung Fibonacci ladder.
export const FIB = [1, 1, 2, 3, 5, 8, 13];
export const PHI = (1 + Math.sqrt(5)) / 2;          // 1.6180339887...
export const PHI_INV = 1 / PHI;                      // 0.6180339887...

// Stable observer hash → x in [-1, 1].
export function seedFromQuery(query) {
  let h = 2166136261 >>> 0;
  const s = String(query || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ((h / 0xffffffff) * 2) - 1;
}

// Pull y[] from the manifold reading of a query, conditioned on observer x.
// Each component is ∈ [-1, 1]. We never assume y; we extract it.
export function extractY(query, x) {
  const q = String(query || '');
  const tokens = (q.match(/\S+/g) || []).length;
  const charset = new Set(q.toLowerCase()).size;
  const hasCode = /```|def\s|function\s|=>|class\s|import\s/.test(q);
  const isAsk = /\?$/.test(q.trim()) || /^(what|how|why|when|who|where|can|do|is|are)\b/i.test(q.trim());
  const polarity = /\b(no|not|never|cannot|won't)\b/i.test(q) ? -1 : 1;
  return [
    Math.tanh((tokens - 12) / 12),         // length signal
    Math.tanh((charset - 24) / 16),        // entropy signal
    hasCode ? 1 : -1,                      // form: code vs prose
    isAsk ? 1 : -1,                        // intent: query vs assert
    polarity,                              // sign: affirmative vs negative
    Math.sin(x * Math.PI),                 // observer-coupled phase
    Math.cos(x * Math.PI * PHI),           // φ-rotated phase
  ];
}

// Multiplication GATHERS (unite). Division EXPLODES (decompose).
// Collapse y[] → scalar y by gathering: product, soft-clamped to [-1, 1].
export function collapseY(yArr) {
  if (!Array.isArray(yArr)) return Number(yArr) || 0;
  if (yArr.length === 0) return 0;
  let p = 1;
  for (const v of yArr) p *= (Number(v) || 0);
  return Math.tanh(p);   // soft-clamp; preserves sign and magnitude trend
}

// Inverse: division explodes a single z back into a y-row of length n.
export function explodeZ(z, n = 7) {
  // Distribute z across n attributes via φ-tapered roots.
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = Math.pow(PHI_INV, i);                    // φ-decaying weights
    out.push(Math.tanh(z * w * (i % 2 === 0 ? 1 : -1)));
  }
  return out;
}

// Given a conversation step, return the dimensional level (1..7) and
// where on the φ-spiral we sit (0..1).
export function ladderPosition(step) {
  const idx = Math.min(FIB.length - 1, Math.max(0, step));
  const dim = idx + 1;
  // Spiral phase = step / 7, wrapped through φ for collapse cadence.
  const phase = ((step % FIB.length) / FIB.length);
  const spiral = (phase * PHI) % 1;
  return {
    dim,
    rung: FIB[idx],
    phase,
    spiral,
    collapsing: spiral > PHI_INV,        // past the golden cut → collapsing
    label: ['point', 'line', 'plane', 'volume', 'identity', 'spiral', 'bloom'][idx]
  };
}

// Build the next manifold point from a query and the prior z (or VOID).
// Implements:  void → x → y[] → z = xy → next-x
export function nextPoint(query, prior = VOID, substrateId = 'zynxy') {
  const sub = SUBSTRATES[substrateId] || SUBSTRATES.zynxy;
  // Fresh observer hash, blended with the prior z (z becomes next x).
  const seed = seedFromQuery(query);
  const x = prior.isVoid ? seed : Math.tanh((seed + prior.z) * 0.5);
  const y = extractY(query, x);
  const yScalar = collapseY(y);
  const step = (prior.step || 0) + 1;
  const ladder = ladderPosition(step);

  let z, lens_value = null;
  if (sub.canonical) {
    z = x * yScalar;                     // z = xy — exact
  } else {
    // Non-canonical SDF lens — z carries the lens reading for display,
    // but the point's identity remains observer-defined.
    lens_value = sub.expr(x * Math.PI, yScalar * Math.PI, ladder.spiral * Math.PI);
    z = lens_value;
  }

  return {
    x, y, z, yScalar, lens_value,
    substrate: sub.id,
    dim: ladder.dim,
    step,
    ladder,
    isVoid: false
  };
}
