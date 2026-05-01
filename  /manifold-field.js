/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD FIELD KERNEL — TPMS + trig as the fabric of the runtime
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pure math. Zero storage. The manifold IS this file.
 *
 *   Gyroid:           G(x,y,z) = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
 *   Schwartz Diamond: D(x,y,z) = sin(x)sin(y)sin(z) + sin(x)cos(y)cos(z)
 *                              + cos(x)sin(y)cos(z) + cos(x)cos(y)sin(z)
 *
 * Both are triply periodic minimal surfaces — infinite, boundaryless, every
 * point has a defined value and a defined neighborhood. trig interpolates
 * between regions. Together they form the field on which observe / solve /
 * collapse / bloom operate.
 *
 * Loadable in both browser (window.ManifoldField) and Node (module.exports)
 * so the same kernel backs the client and the lobby server.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root, factory) {
  'use strict';
  const F = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = F;
  if (root) root.ManifoldField = F;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  const TAU = Math.PI * 2;
  const PHI = (1 + Math.sqrt(5)) / 2;

  // ── Surfaces ──────────────────────────────────────────────────────────────
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

  // Blended scalar field. t in [0,1] biases toward Schwartz D.
  function value(x, y, z, t) {
    const w = (t == null) ? 0.5 : t;
    return gyroid(x, y, z) * (1 - w) + schwartzD(x, y, z) * w;
  }

  // ── Gradients (analytic) ──────────────────────────────────────────────────
  function gyroidGrad(x, y, z) {
    const sx = Math.sin(x), cx = Math.cos(x);
    const sy = Math.sin(y), cy = Math.cos(y);
    const sz = Math.sin(z), cz = Math.cos(z);
    return {
      x:  cx * cy - sz * sx,
      y: -sx * sy + cy * cz,
      z: -sy * sz + cz * cx,
    };
  }

  function schwartzDGrad(x, y, z) {
    const sx = Math.sin(x), cx = Math.cos(x);
    const sy = Math.sin(y), cy = Math.cos(y);
    const sz = Math.sin(z), cz = Math.cos(z);
    return {
      x:  cx * sy * sz + cx * cy * cz - sx * sy * cz - sx * cy * sz,
      y:  sx * cy * sz - sx * sy * cz + cx * cy * cz - cx * sy * sz,
      z:  sx * sy * cz - sx * cy * sz - cx * sy * sz + cx * cy * cz,
    };
  }

  function grad(x, y, z, t) {
    const w = (t == null) ? 0.5 : t;
    const g = gyroidGrad(x, y, z), d = schwartzDGrad(x, y, z);
    return {
      x: g.x * (1 - w) + d.x * w,
      y: g.y * (1 - w) + d.y * w,
      z: g.z * (1 - w) + d.z * w,
    };
  }

  // ── Neighborhood / region ─────────────────────────────────────────────────
  // n points on a Fibonacci sphere of radius r around (x,y,z), each tagged
  // with the field value at that point. Used by `observe` to pull "what the
  // manifold reveals about x" without storing anything.
  function neighbors(x, y, z, r, n, t) {
    r = (r == null) ? 1 : r;
    n = (n == null) ? 12 : Math.max(1, n | 0);
    const out = new Array(n);
    const inc = Math.PI * (3 - Math.sqrt(5)); // golden angle
    for (let i = 0; i < n; i++) {
      const yk = 1 - (2 * i + 1) / n;          // (-1, 1)
      const rk = Math.sqrt(1 - yk * yk);
      const ph = i * inc;
      const ux = Math.cos(ph) * rk;
      const uy = yk;
      const uz = Math.sin(ph) * rk;
      const px = x + ux * r, py = y + uy * r, pz = z + uz * r;
      out[i] = { x: px, y: py, z: pz, v: value(px, py, pz, t) };
    }
    return out;
  }

  // Sampled cube of side `size` around (x,y,z), `steps`³ samples. Useful for
  // region-level lenses that need the local field shape.
  function region(x, y, z, size, steps, t) {
    size  = (size  == null) ? 1 : size;
    steps = (steps == null) ? 4 : Math.max(2, steps | 0);
    const half = size * 0.5;
    const ds = size / (steps - 1);
    const total = steps * steps * steps;
    const out = new Float64Array(total * 4); // x,y,z,v per sample
    let k = 0;
    for (let i = 0; i < steps; i++) {
      const px = x - half + i * ds;
      for (let j = 0; j < steps; j++) {
        const py = y - half + j * ds;
        for (let m = 0; m < steps; m++) {
          const pz = z - half + m * ds;
          out[k++] = px; out[k++] = py; out[k++] = pz;
          out[k++] = value(px, py, pz, t);
        }
      }
    }
    return { size: size, steps: steps, samples: out };
  }

  // Deterministic seed → field-coordinate mapping. Any vector of numbers
  // (a "seed") collapses to a point in (x,y,z) ∈ R³ via golden-ratio mixing.
  // This is how an arbitrary identity becomes addressable in the manifold.
  function seedToPoint(seed) {
    const s = Array.isArray(seed) ? seed : [seed];
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < s.length; i++) {
      const v = +s[i] || 0;
      a += v * Math.cos(i * PHI);
      b += v * Math.sin(i * PHI);
      c += v * Math.cos(i / PHI);
    }
    return { x: a % TAU, y: b % TAU, z: c % TAU };
  }

  return {
    TAU, PHI,
    gyroid, schwartzD, value,
    gyroidGrad, schwartzDGrad, grad,
    neighbors, region,
    seedToPoint,
  };
});
