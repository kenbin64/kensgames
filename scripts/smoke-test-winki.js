// Smoke test for the algebraic Winki + Helix lenses on Manifold.
// Verifies: surface evaluation, residual = 0 on-surface, central collapse,
// axis-spine sharing, mesh shape, helix sample shape.
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'js', 'manifold.js'));

let fails = 0;
function ok(name, cond, note) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) fails++;
  console.log(`  [${tag}] ${name}${note ? '  — ' + note : ''}`);
}

console.log('=== Winki ===');
const W = M.Winki, H = M.Helix;
ok('Winki exposed', !!W && !!W.surface && !!W.mesh);
ok('Helix exposed', !!H && !!H.curve && !!H.samples);
ok('M = 0.25', W.M === 0.25);
ok('HALF = 2', W.HALF === 2);
ok('6 surfaces', W.SURFACES.length === 6);

// Surface evaluation: each surface should evaluate to sign * M * a * b.
for (let s = 0; s < 6; s++) {
  const v = W.surface(s, 1, 2);
  const expected = W.SURFACES[s].sign * W.M * 2;
  ok(`surface[${s}] @ (1,2) = ${expected}`, Math.abs(v - expected) < 1e-12, `got ${v}`);
}

// Residual: for any (a,b), the point (axA=a, axB=b, axOut=sign*M*a*b) is on
// the surface, so residual must be ~0.
for (let s = 0; s < 6; s++) {
  const S = W.SURFACES[s];
  const a = 1.7, b = -0.9;
  const o = S.sign * W.M * a * b;
  const xyz = [0, 0, 0];
  xyz[S.axA] = a; xyz[S.axB] = b; xyz[S.axOut] = o;
  const r = W.residual(s, xyz[0], xyz[1], xyz[2]);
  ok(`residual[${s}] on-surface = 0`, Math.abs(r) < 1e-12, `got ${r}`);
}

// Central collapse: at the origin, every surface's residual is 0.
for (let s = 0; s < 6; s++) {
  ok(`origin lies on surface[${s}]`, Math.abs(W.residual(s, 0, 0, 0)) < 1e-12);
}

// Axis spines: each coordinate axis (one nonzero coord) lies on 4 surfaces.
function spineCount(x, y, z) {
  let n = 0;
  for (let s = 0; s < 6; s++) if (Math.abs(W.residual(s, x, y, z)) < 1e-12) n++;
  return n;
}
ok('x-axis lies on 4 surfaces', spineCount(1.3, 0, 0) === 4, `got ${spineCount(1.3, 0, 0)}`);
ok('y-axis lies on 4 surfaces', spineCount(0, 1.3, 0) === 4);
ok('z-axis lies on 4 surfaces', spineCount(0, 0, 1.3) === 4);

// Cell sign: bipartite parity.
ok('cellSign(0,0,0) = +1', W.cellSign(0, 0, 0) === +1);
ok('cellSign(1,0,0) = -1', W.cellSign(1, 0, 0) === -1);
ok('cellSign(1,1,1) = -1', W.cellSign(1, 1, 1) === -1);
ok('cellSign(1,1,0) = +1', W.cellSign(1, 1, 0) === +1);

// Localize: world coords → cell index + local offset.
const loc = W.localize(0, 0, 0);
ok('origin in cell (0,0,0)', loc.cell[0] === 0 && loc.cell[1] === 0 && loc.cell[2] === 0);
const loc2 = W.localize(5, 0, 0);
ok('x=5 in cell (1,0,0)', loc2.cell[0] === 1 && loc2.sign === -1);

// Mesh: dimensions, finiteness, normal length ~ 1.
const mesh = W.mesh(8);
const expectedVerts = 6 * (8 + 1) * (8 + 1);
ok('mesh vertex count', mesh.positions.length === expectedVerts * 3, `got ${mesh.positions.length / 3}`);
ok('mesh index count', mesh.indices.length === 6 * 8 * 8 * 6);
let allFinite = true, normOk = true;
for (let i = 0; i < mesh.normals.length; i += 3) {
  const nx = mesh.normals[i], ny = mesh.normals[i + 1], nz = mesh.normals[i + 2];
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) allFinite = false;
  const nl = Math.hypot(nx, ny, nz);
  if (Math.abs(nl - 1) > 1e-4) normOk = false;
}
ok('mesh values finite', allFinite);
ok('mesh normals unit-length', normOk);

// Bbox: positions stay inside the [-2, 2] cube on a/b axes; out axis bounded
// by |sign*M*a*b| ≤ M*HALF² = 1.
let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
for (let i = 0; i < mesh.positions.length; i += 3) {
  const x = mesh.positions[i], y = mesh.positions[i + 1], z = mesh.positions[i + 2];
  if (x < xmin) xmin = x; if (x > xmax) xmax = x;
  if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  if (z < zmin) zmin = z; if (z > zmax) zmax = z;
}
ok(`bbox x in [-2, 2]`, xmin >= -2 - 1e-9 && xmax <= 2 + 1e-9, `[${xmin}, ${xmax}]`);
ok(`bbox y in [-2, 2]`, ymin >= -2 - 1e-9 && ymax <= 2 + 1e-9, `[${ymin}, ${ymax}]`);
ok(`bbox z in [-2, 2]`, zmin >= -2 - 1e-9 && zmax <= 2 + 1e-9, `[${zmin}, ${zmax}]`);

console.log('\n=== Helix ===');
ok('PHI ≈ 1.618', Math.abs(H.PHI - 1.6180339887498949) < 1e-12);
const p0 = H.curve(0), p1 = H.curve(1);
ok('helix start at (radius, 0, 0)', Math.abs(p0.x - 1) < 1e-12 && Math.abs(p0.y) < 1e-12);
ok('helix t=1 height = pitch (φ)', Math.abs(p1.y - H.PHI) < 1e-12);
const samples = H.samples(13);
ok('helix samples flat array', samples.length === 13 * 3);
ok('helix samples finite', Array.from(samples).every(Number.isFinite));

console.log(`\n=== ${fails === 0 ? 'ALL PASS' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
