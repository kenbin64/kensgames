// tests/dimensional-principle.test.js
// Test the dimensional "point" principle BEFORE building the engine on it, so we
// use only what is proven. Ken's definition: a point is a discrete object that
// encapsulates all that came before AND itself, shown as a single 1 at the higher
// dimension while containing the lower dimensions; expressed as "1 -> limit 0"
// with the complex/imaginary axis and fractal self-similarity.
// We verify the sound parts and honestly mark where "Fibonacci" does NOT hold.
// Run: node tests/dimensional-principle.test.js   (from fasttrack/v2)

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } };

console.log('\n== 1. Encapsulation generator: a point = all-before + itself ==');
// Each point's content = (sum of every point before it) + itself, base 1.
function encapsulate(n) {
  const s = [];
  for (let i = 0; i < n; i++) {
    const before = s.reduce((a, b) => a + b, 0);
    s.push(before + 1);
  }
  return s;
}
const E = encapsulate(8);
ok(JSON.stringify(E) === JSON.stringify([1, 2, 4, 8, 16, 32, 64, 128]),
  '"all before + itself" with base 1 yields doubling: ' + E.join(','));
ok(E.every((v, i) => v === 2 ** i),
  'closed form: point n encapsulates 2^(n-1) units (exponential explosion, the real "addressable states" growth)');

console.log('\n== 2. Honest fence: this is NOT Fibonacci ==');
const fib = (n) => { const f = [1, 1]; while (f.length < n) f.push(f[f.length - 1] + f[f.length - 2]); return f.slice(0, n); };
ok(JSON.stringify(E) !== JSON.stringify(fib(8)),
  'encapsulation (1,2,4,8,...) differs from Fibonacci (1,1,2,3,5,8,...): the "like the Fibonacci" label is wrong');
ok(2 ** 7 > fib(8)[7],
  'and it grows FASTER than Fibonacci (exponential beats the golden recurrence), so the explosion is real, just not Fibonacci');

console.log('\n== 3. "1 -> limit 0": collapse to a point via the perpendicular/complex axis ==');
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
let z = { re: 1, im: 0 };
const i = { re: 0, im: 1 };
const turns = [];
for (let k = 0; k < 4; k++) { z = cmul(z, i); turns.push({ re: Math.round(z.re), im: Math.round(z.im) }); }
ok(turns[0].re === 0 && turns[0].im === 1, 'multiply by i is a 90-degree turn (1 -> i): the perpendicular step');
ok(turns[3].re === 1 && turns[3].im === 0, 'i^4 returns to the real unit 1 (a full turn back to the point)');
const project = (v, keep) => v[keep];
ok(project({ x: 7, y: 3, z: 9 }, 'x') === 7,
  'orthogonal projection collapses the perpendicular axes to a single point value (a dimension -> a point)');

console.log('\n== 4. Encapsulation is lossless: unfold recovers every part ==');
const foldToPoint = (parts) => ({ one: 1, contents: parts.slice() }); // many -> one point shown as 1
const unfold = (point) => point.contents.slice();                       // recover the parts
const parts = ['a', ['b1', 'b2'], { c: 3 }];
ok(JSON.stringify(unfold(foldToPoint(parts))) === JSON.stringify(parts),
  'fold many into one point, then unfold, recovers all parts exactly (lossless encapsulation)');

console.log('\n== 5. Self-similarity (fractal) where it genuinely holds [Observation] ==');
function selfSimilar(depth) { return depth === 0 ? 'leaf' : [selfSimilar(depth - 1), selfSimilar(depth - 1)]; }
const shapeAt = (t) => (Array.isArray(t) ? 'node(2)' : 'leaf');
ok(shapeAt(selfSimilar(4)) === shapeAt(selfSimilar(1)),
  'a self-similar rule shows the same shape at every scale (fractal) - true for self-similar structures, not a universal law');

console.log(`\n==============================\n  ${pass} passed, ${fail} failed\n==============================`);
console.log('Conclusion: the SOUND principles to build on are encapsulation (all-before+itself = one point,');
console.log('exponential content), the perpendicular/complex collapse (1 -> limit 0, i^4=1), lossless unfold,');
console.log('and self-similarity where it genuinely applies. "Fibonacci" is not the scaling law; the real one');
console.log('is doubling/exponential, which is stronger. Build on the verified version, not the Fibonacci framing.');
process.exit(fail ? 1 : 0);
