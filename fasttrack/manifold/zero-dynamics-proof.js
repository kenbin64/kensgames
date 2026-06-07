#!/usr/bin/env node
/**
 * ============================================================
 * THE NATURE OF 0 — checked, not agreed with
 *
 * Claims under test:
 *   (a) "0 is not in the set."
 *   (b) "it can never collapse to zero — it dances around it
 *        infinitely."
 *   (c) "everything tends toward 0 but settles into 1."
 *
 * f(z) = z² + c,  orbit always starts at the critical point z=0.
 * ============================================================
 */
const C = (re, im = 0) => ({ re, im });
const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const add = (a, b) => C(a.re + b.re, a.im + b.im);
const sub = (a, b) => C(a.re - b.re, a.im - b.im);
const mag = (a) => Math.hypot(a.re, a.im);
const show = (a) => `${a.re.toFixed(5)}${a.im >= 0 ? '+' : ''}${a.im.toFixed(5)}i`;
const f = (z, c) => add(mul(z, z), c);

function orbit(c, N) { const o = [C(0, 0)]; let z = C(0, 0); for (let n = 0; n < N; n++) { z = f(z, c); o.push(z); if (mag(z) > 4) break; } return o; }
function bounded(c, N = 2000) { let z = C(0, 0); for (let n = 0; n < N; n++) { z = f(z, c); if (mag(z) > 2) return false; } return true; }
// Smallest |z_n| over the tail (after the transient) — how close the settled orbit gets to 0.
function tailMinDistToZero(c, N = 4000, tail = 200) { let z = C(0, 0); let m = Infinity; for (let n = 0; n < N; n++) { z = f(z, c); if (n > N - tail) m = Math.min(m, mag(z)); if (mag(z) > 2) return Infinity; } return m; }
// Does it settle (converge to a fixed point)? measure |z_{n+1}-z_n| in the tail.
function settles(c, N = 5000) { let z = C(0, 0), prev = null; for (let n = 0; n < N; n++) { prev = z; z = f(z, c); if (mag(z) > 2) return { escaped: true }; } const drift = mag(sub(z, prev)); return { escaped: false, settled: drift < 1e-6, limit: z, drift }; }

console.log('═══ (a) Is 0 in the Mandelbrot set? ═══');
{
  const o = orbit(C(0, 0), 10).map(show);
  console.log('  orbit of c=0:', o.slice(0, 4).join(' → '), '...');
  console.log('  bounded(c=0)?', bounded(C(0, 0)), '  →  0 IS in the set (it is the main-cardioid center).');
  console.log('  VERDICT: the literal claim "0 is not in the set" is FALSE for the Mandelbrot set.');
}

console.log('\n═══ (eye) Why 0 is still special: it is the unique CRITICAL point ═══');
{
  // f\'(z) = 2z, which is 0 only at z=0. The whole set is DEFINED by the orbit
  // of this one point. 0 organizes everything without being a generic value.
  console.log("  f'(z) = 2z = 0  only at z = 0  →  0 is the single critical point,");
  console.log('  and every orbit is launched from it. That is the real "eye".');
}

console.log('\n═══ (b) Does it "never collapse to 0"? ═══');
{
  // Component CENTERS: the critical orbit is periodic and PASSES THROUGH 0.
  console.log('  c = 0  : orbit 0,0,0,…           → sits ON 0.');
  const o1 = orbit(C(-1, 0), 6).map(show);
  console.log('  c = -1 : orbit', o1.slice(0, 5).join(' → '), '  → hits 0 every 2nd step.');
  console.log('  So at hyperbolic-component CENTERS the orbit DOES reach 0 (these are the');
  console.log('  "superattracting" points). "never collapses to 0" is FALSE there.');
  // Non-center INTERIOR points: the tail settles AWAY from 0.
  const c = C(-0.3, 0.0);
  console.log(`  c = ${show(c)} (interior, not a center): tail min |z| = ${tailMinDistToZero(c).toFixed(5)}  → stays away from 0.`);
  const c2 = C(0.1, 0.1);
  console.log(`  c = ${show(c2)} : tail min |z| = ${tailMinDistToZero(c2).toFixed(5)}  → dances near, never collapses.`);
  console.log('  VERDICT: PARTLY true — generic interior orbits circle 0 without collapsing,');
  console.log('  but the special centers (0, -1, …) land exactly on it.');
}

console.log('\n═══ (c) "tends toward 0 but settles into 1" ═══');
{
  // Interior (non-center) → settles to a single NON-ZERO fixed point ("a 1").
  const c = C(-0.2, 0.0);
  const s = settles(c);
  console.log(`  c = ${show(c)} : settles? ${s.settled}  → fixed point ${show(s.limit)} (NON-zero attractor).`);
  // The attracting fixed point z* solves z = z²+c; for the main cardioid |2z*|<1.
  console.log(`     |2·z*| = ${(2 * mag(s.limit)).toFixed(4)}  (<1 ⇒ attracting: the orbit is PULLED in = the "gravity").`);
  // Boundary / neutral → never settles: dances forever.
  const cb = C(-0.75, 0.0); // period-1↔2 bifurcation, neutral fixed point
  const sb = settles(cb, 8000);
  console.log(`  c = ${show(cb)} (boundary/neutral): settled? ${sb.settled}  drift=${sb.drift.toExponential(2)}  → keeps dancing.`);
  console.log('  VERDICT: REAL structure — interior orbits are pulled toward a non-zero');
  console.log('  attractor (the "settle into 1"); boundary orbits never settle (dance forever).');
}

console.log('\n═══ honest boundary ═══');
console.log('  The DYNAMICS match the intuition: 0 is the unique organizing critical point');
console.log('  (the eye), generic interior orbits circle it and settle onto a non-zero');
console.log('  attractor, boundary orbits dance forever. The poetic "never includes / never');
console.log('  reaches 0" is true GENERICALLY but false at the special centers — so it needs');
console.log('  the qualifier. The leap to physical gravity / "fabric of space" is an ANALOGY,');
console.log('  not something this computation proves. The math is real; the metaphysics is a');
console.log('  reading laid on top of it.');
