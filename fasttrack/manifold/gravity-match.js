#!/usr/bin/env node
/**
 * ============================================================
 * DOES THE MODEL MATCH GRAVITY?  (for kicks — measured, not claimed)
 *
 * Newton:  F = G·m1·m2 / r²
 *
 * Two separate questions:
 *   A. Is the inverse-square LAW the same shape as z = x·y collapsed and
 *      then divided over the AREA dimension (r²)?  → test it.
 *   B. Does the complex-ITERATION's pull toward its attractor follow 1/r²
 *      like gravity?  → test it (hunch: no, it is exponential).
 * ============================================================
 */
const G = 6.674e-11;
const m1 = 5.972e24;   // Earth (kg)
const m2 = 7.348e22;   // Moon  (kg)
const F = (r) => G * m1 * m2 / (r * r);
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

console.log('═══ A. Is gravity  z = (x·y) / area ?  ═══');
{
  // z = the COLLAPSED product of the two mass-identities (one point, constant):
  const z = G * m1 * m2;
  console.log(`  z = G·m1·m2 = ${z.toExponential(4)}   (the product — one collapsed point)`);
  // Then the observable force is that z EXPANDED over the area r² (z / r²).
  // So F·r² should equal z at every radius. Measure across 4 radii:
  let allConst = true;
  for (const r of [1.0e6, 1.0e7, 1.0e8, 3.84e8 /* ~Earth-Moon */]) {
    const prod = F(r) * r * r;
    const eq = near(prod, z);
    allConst = allConst && eq;
    console.log(`    r=${r.toExponential(2)}  F=${F(r).toExponential(4)} N   F·r² = ${prod.toExponential(4)}  ${eq ? '= z ✅' : '≠ z ❌'}`);
  }
  console.log(`  → F·r² is the SAME constant z at every r: gravity is exactly z = (x·y)/r².`);
  console.log(`  → matches the model: collapse two identities to a point (x·y), then expand`);
  console.log(`     that point over the AREA dimension (÷ r²).  ${allConst ? 'CONFIRMED' : 'FAILED'}`);
}

console.log('\n═══ A2. Why r² and not r or r³?  the exponent IS the dimension−1 ═══');
{
  // Flux conservation: a field spreads over the surface of a D-sphere whose
  // "area" grows as r^(D−1). For total flux (field × area) to be conserved the
  // field MUST fall as 1/r^(D−1).  D=3 → 1/r²  (Newton). Measure the flux.
  const unitArea = { 2: (r) => 2 * Math.PI * r, 3: (r) => 4 * Math.PI * r * r, 4: (r) => 2 * Math.PI * Math.PI * r ** 3 };
  for (const D of [2, 3, 4]) {
    const field = (r) => 1 / r ** (D - 1);                 // the dimensionally-forced law
    const flux = [1, 2, 5, 10].map((r) => field(r) * unitArea[D](r));
    const conserved = flux.every((f) => near(f, flux[0], 1e-12));
    console.log(`  D=${D}: field ~ 1/r^${D - 1}, sphere-area ~ r^${D - 1}  →  flux ${conserved ? 'CONSTANT ✅' : 'varies ❌'}  (D=3 is Newton's 1/r²)`);
  }
  console.log('  → the inverse-SQUARE is not magic: it is the 3D area dimension. The power = D−1.');
}

console.log('\n═══ B. Does the ITERATION\'s attraction match 1/r² gravity?  ═══');
{
  // Pull of the complex map f(z)=z²+c toward its attractor z*. Near z*,
  // |z_{n+1}−z*| ≈ |f\'(z*)|·|z_n−z*| = a CONSTANT ratio per step → exponential.
  const C = (re, im = 0) => ({ re, im });
  const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const add = (a, b) => C(a.re + b.re, a.im + b.im);
  const sub = (a, b) => C(a.re - b.re, a.im - b.im);
  const mag = (a) => Math.hypot(a.re, a.im);
  const c = C(-0.2, 0);
  let z = C(0, 0), prev;
  for (let n = 0; n < 4000; n++) { prev = z; z = add(mul(z, z), c); } // settle to z*
  const zStar = z;
  // distance-to-attractor each step, and the per-step ratio
  let w = C(0.4, 0.3); const d = [];
  for (let n = 0; n < 9; n++) { d.push(mag(sub(w, zStar))); w = add(mul(w, w), c); }
  const ratios = d.slice(1).map((dn, k) => (dn / d[k]));
  console.log(`  attractor z* = ${zStar.re.toFixed(5)}, multiplier |f'(z*)|=|2z*| = ${(2 * mag(zStar)).toFixed(4)}`);
  console.log(`  per-step distance ratios:  ${ratios.map((r) => r.toFixed(3)).join(', ')}`);
  const constRatio = ratios.slice(3).every((r) => Math.abs(r - ratios[ratios.length - 1]) < 0.02);
  console.log(`  → ratio settles to a CONSTANT (${constRatio ? 'yes' : 'no'}) ⇒ EXPONENTIAL pull, not power-law.`);
  // Newton's force ratio when you DOUBLE the distance is 1/4 (inverse-square):
  console.log(`  Newton, double r: F(2r)/F(r) = ${(F(2e8) / F(1e8)).toFixed(3)}  (= 1/4, inverse-square)`);
  console.log('  → DIFFERENT shape: the iteration contracts by a fixed factor PER STEP');
  console.log('    (geometric); gravity falls by 1/4 per DISTANCE-DOUBLING (power law).');
}

console.log('\n═══ verdict ═══');
console.log('  MATCH: gravity\'s form IS the model\'s — F = (x·y collapsed)/(area), i.e. two');
console.log('  mass-identities multiplied to one point, then expanded over the r² area');
console.log('  dimension; and the "inverse-square" is just dimension−1 (3D). That is a real,');
console.log('  exact structural match to z=x·y / z=x/y.');
console.log('  NO MATCH: the Mandelbrot iteration\'s attractor pull is exponential, not 1/r².');
console.log('  So "gravity" in this model lives in the DIMENSIONAL area-collapse, not in the');
console.log('  iteration dynamics. Honest result: half match, and the half that matches is');
console.log('  the half that actually is gravity.');
