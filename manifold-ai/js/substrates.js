// manifold-ai/js/substrates.js
// Three substrates as queryable lenses. Zynxy is canonical (z = xy).
// Schwarz Diamond and Gyroid are SDF approximations of Zynxy used as
// fast-evaluatable routing lenses (per AGENTS.md & docs/SUBSTRATES.md).

export const SUBSTRATES = {
  zynxy: {
    id: 'zynxy',
    glyph: '◈',
    canonical: true,
    // z = xy on the unit cube, six-face self-tiling.
    expr: (x, y) => x * y,
    // Keywords + intent vector — the router scores against these.
    keywords: [
      'identity', 'seed', 'observer', 'exact', 'canonical', 'manifold', 'rule',
      'definition', 'axiom', 'specification', 'schema', 'contract'
    ],
    bestFor: 'Exact / canonical / identity-defining queries. Default substrate.',
    lensColor: '#7df9ff'
  },

  schwarz: {
    id: 'schwarz',
    glyph: '◆',
    canonical: false,
    // Schwarz Diamond SDF approximation: sin·sin·sin + cos·cos·cos
    expr: (x, y, z = 0) =>
      Math.sin(x) * Math.sin(y) * Math.sin(z) +
      Math.sin(x) * Math.cos(y) * Math.cos(z) +
      Math.cos(x) * Math.sin(y) * Math.cos(z) +
      Math.cos(x) * Math.cos(y) * Math.sin(z),
    keywords: [
      'decide', 'choose', 'split', 'either', 'or', 'branch', 'path', 'option',
      'discrete', 'classify', 'category', 'boundary', 'edge', 'threshold'
    ],
    bestFor: 'Decision / branching / discrete-choice queries.',
    lensColor: '#ffb35a'
  },

  gyroid: {
    id: 'gyroid',
    glyph: '◉',
    canonical: false,
    // Gyroid SDF: sin·cos shifted three ways
    expr: (x, y, z = 0) =>
      Math.sin(x) * Math.cos(y) +
      Math.sin(y) * Math.cos(z) +
      Math.sin(z) * Math.cos(x),
    keywords: [
      'flow', 'smooth', 'continuous', 'interpolate', 'blend', 'transform', 'animate',
      'gradient', 'traverse', 'navigate', 'code', 'refactor', 'debug', 'compose'
    ],
    bestFor: 'Flow / continuity / code & process queries.',
    lensColor: '#b07dff'
  }
};

// Cheap lexical router (no embedding download required for v1).
// Returns { substrate, score, runners }.
export function routeSubstrate(query) {
  const q = String(query || '').toLowerCase();
  const tokens = q.match(/[a-z][a-z0-9_-]+/g) || [];
  const tset = new Set(tokens);

  const scored = Object.values(SUBSTRATES).map(s => {
    let hits = 0;
    for (const k of s.keywords) if (tset.has(k)) hits++;
    // Slight bias toward zynxy when nothing matches (canonical default).
    const bias = s.canonical ? 0.5 : 0;
    return { substrate: s, score: hits + bias };
  }).sort((a, b) => b.score - a.score);

  return {
    substrate: scored[0].substrate,
    score: scored[0].score,
    runners: scored.slice(1).map(r => ({ id: r.substrate.id, score: r.score }))
  };
}

// Validate a manifold point. z MUST equal x * y for the canonical substrate.
// For non-canonical lenses, we record the SDF value as `lens_value` instead.
export function validateManifoldPoint(point) {
  const errors = [];
  if (!point || typeof point !== 'object') {
    return { ok: false, errors: ['point must be an object'] };
  }
  const { x, y, z, substrate, lens_value } = point;
  if (typeof x !== 'number' || !Number.isFinite(x)) errors.push('x must be a finite number');
  if (typeof y !== 'number' || !Number.isFinite(y)) errors.push('y must be a finite number');
  const sub = SUBSTRATES[substrate];
  if (!sub) errors.push(`unknown substrate: ${substrate}`);

  if (sub && sub.canonical) {
    const expected = x * y;
    if (typeof z !== 'number' || Math.abs(z - expected) > 1e-9) {
      errors.push(`z = xy violation: got z=${z}, expected ${expected}`);
    }
  } else if (sub) {
    // Non-canonical: lens_value is the SDF reading; z is derived for display.
    if (typeof lens_value !== 'number') {
      errors.push(`${sub.id} substrate requires numeric lens_value`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// Project a free-form query into a manifold seed.
// x = identity hash of the query (stable, observer-defined).
// y = modifier extracted by the LLM (or routed substrate's default modifier).
export function seedX(query) {
  // Deterministic 32-bit hash → normalized to [-1, 1].
  let h = 2166136261 >>> 0;
  for (let i = 0; i < query.length; i++) {
    h ^= query.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ((h / 0xffffffff) * 2) - 1;
}
