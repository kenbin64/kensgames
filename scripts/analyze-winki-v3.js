#!/usr/bin/env node
/* eslint-disable no-console */
// v3: classify quads by normal-axis dominance + sign of curvature, group into
// the 6 expected saddles (z=±xy/k, y=±xz/k, x=±yz/k), and fit each group.

const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
let off = 12, json, bin;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004E4942) bin = data;
  off += 8 + len;
}
function rotByInverse(v, q) {
  const [qx, qy, qz, qw] = q, cx = -qx, cy = -qy, cz = -qz, cw = qw;
  const tx = cw * v[0] + cy * v[2] - cz * v[1];
  const ty = cw * v[1] + cz * v[0] - cx * v[2];
  const tz = cw * v[2] + cx * v[1] - cy * v[0];
  const tw = -cx * v[0] - cy * v[1] - cz * v[2];
  return [tw * qx + tx * qw + ty * qz - tz * qy,
  tw * qy - tx * qz + ty * qw + tz * qx,
  tw * qz + tx * qy - ty * qx + tz * qw];
}
const compR = { 5125: (b, o) => b.readUInt32LE(o), 5123: (b, o) => b.readUInt16LE(o), 5126: (b, o) => b.readFloatLE(o) };
const compS = { 5125: 4, 5123: 2, 5126: 4 };
const tN = { SCALAR: 1, VEC3: 3 };
function readAcc(idx) {
  const a = json.accessors[idx], bv = json.bufferViews[a.bufferView];
  const off2 = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = tN[a.type], cs = compS[a.componentType], r = compR[a.componentType];
  const stride = bv.byteStride || cs * n;
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const row = new Array(n);
    for (let c = 0; c < n; c++) row[c] = r(bin, off2 + i * stride + c * cs);
    out.push(n === 1 ? row[0] : row);
  }
  return out;
}

const useAuthored = process.argv.includes('--authored');
const q = json.nodes[0].rotation;
const rawPos = readAcc(json.meshes[0].primitives[0].attributes.POSITION);
const positions = useAuthored ? rawPos.map(v => rotByInverse(v, q)) : rawPos;
const indices = readAcc(json.meshes[0].primitives[0].indices);
console.log(`frame: ${useAuthored ? 'authored (inverse-rotated)' : 'display (as-stored)'}`);

// Build quads
const quads = [];
for (let i = 0; i < indices.length; i += 6) {
  const idxs = [...new Set([indices[i], indices[i + 1], indices[i + 2], indices[i + 3], indices[i + 4], indices[i + 5]])];
  const v = idxs.map(j => positions[j]);
  // mean
  const c = [0, 0, 0]; for (const p of v) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= v.length; c[1] /= v.length; c[2] /= v.length;
  // normal from triangle (v[0],v[1],v[2])
  const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
  const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n[0] /= len; n[1] /= len; n[2] /= len;
  quads.push({ verts: v, center: c, normal: n });
}

// For a saddle "out = m*a*b", the analytic normal is proportional to (-m*b, -m*a, 1) (axes permuted accordingly).
// At a point on the surface, the "out" axis component of the normal is the largest in magnitude near the origin
// and falls off away from it. Rather than relying on |nz| alone, we use a combined heuristic: classify by
// the axis whose normal component has the LARGEST mean across the quad's neighborhood — but simpler is to
// just test all 6 surface hypotheses and see which fits best with all quads assigned to the best surface.
// Strategy: assign each quad to the surface S that minimizes |out_S(center) - m_S * a_S(center) * b_S(center)|
// for an initial guess m_S = 1/2 (since [-2,2] domain produces output up to xy=4 → /2 keeps it within ±2).
const SURFACES = [
  { name: 'z = +xy/2', axOut: 2, axA: 0, axB: 1, sign: +1 },
  { name: 'z = -xy/2', axOut: 2, axA: 0, axB: 1, sign: -1 },
  { name: 'y = +xz/2', axOut: 1, axA: 0, axB: 2, sign: +1 },
  { name: 'y = -xz/2', axOut: 1, axA: 0, axB: 2, sign: -1 },
  { name: 'x = +yz/2', axOut: 0, axA: 1, axB: 2, sign: +1 },
  { name: 'x = -yz/2', axOut: 0, axA: 1, axB: 2, sign: -1 },
];
// Iterative reclassification: start with m=0.5, refit per-surface, reassign,
// repeat until assignments stabilise.
let mPer = SURFACES.map(() => 0.5);
let groups = SURFACES.map(() => []);
for (let iter = 0; iter < 8; iter++) {
  groups = SURFACES.map(() => []);
  quads.forEach(qd => {
    let best = -1, bestErr = Infinity;
    for (let s = 0; s < SURFACES.length; s++) {
      const S = SURFACES[s];
      const pred = S.sign * mPer[s] * qd.center[S.axA] * qd.center[S.axB];
      const err = Math.abs(qd.center[S.axOut] - pred);
      if (err < bestErr) { bestErr = err; best = s; }
    }
    groups[best].push(qd);
  });
  // refit per surface
  const newM = SURFACES.map((S, s) => {
    let num = 0, den = 0;
    for (const qd of groups[s]) for (const v of qd.verts) {
      const ab = S.sign * v[S.axA] * v[S.axB];
      num += ab * v[S.axOut]; den += ab * ab;
    }
    return den > 1e-9 ? num / den : mPer[s];
  });
  const delta = newM.reduce((s, m, i) => s + Math.abs(m - mPer[i]), 0);
  mPer = newM;
  if (delta < 1e-5) { console.log(`converged at iter ${iter}, delta=${delta.toExponential(2)}`); break; }
}

function fit(verts, axOut, axA, axB, sign) {
  let num = 0, den = 0, mean = 0;
  for (const v of verts) { const ab = sign * v[axA] * v[axB]; num += ab * v[axOut]; den += ab * ab; mean += v[axOut]; }
  mean /= verts.length;
  const m = den > 1e-9 ? num / den : 0;
  let ssRes = 0, ssTot = 0;
  for (const v of verts) { const pred = m * sign * v[axA] * v[axB]; ssRes += (v[axOut] - pred) ** 2; ssTot += (v[axOut] - mean) ** 2; }
  return { m, r2: ssTot > 1e-9 ? 1 - ssRes / ssTot : 1 };
}

console.log('\nGroup assignments (initial heuristic, m=1/2):');
groups.forEach((g, i) => {
  const S = SURFACES[i];
  const allV = []; for (const qd of g) for (const v of qd.verts) allV.push(v);
  const f = allV.length ? fit(allV, S.axOut, S.axA, S.axB, S.sign) : { m: 0, r2: 0 };
  let omin = Infinity, omax = -Infinity, amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
  for (const v of allV) {
    if (v[S.axOut] < omin) omin = v[S.axOut]; if (v[S.axOut] > omax) omax = v[S.axOut];
    if (v[S.axA] < amin) amin = v[S.axA]; if (v[S.axA] > amax) amax = v[S.axA];
    if (v[S.axB] < bmin) bmin = v[S.axB]; if (v[S.axB] > bmax) bmax = v[S.axB];
  }
  console.log(`  [${i}] ${S.name}  quads=${g.length} verts=${allV.length}`);
  console.log(`       fitted m=${f.m.toFixed(4)}  R^2=${f.r2.toFixed(5)}`);
  if (allV.length) console.log(`       out range [${omin.toFixed(3)}, ${omax.toFixed(3)}]  a [${amin.toFixed(3)}, ${amax.toFixed(3)}]  b [${bmin.toFixed(3)}, ${bmax.toFixed(3)}]`);
});

// Also print global stats
let xmn = Infinity, ymn = Infinity, zmn = Infinity, xmx = -Infinity, ymx = -Infinity, zmx = -Infinity;
for (const v of positions) {
  if (v[0] < xmn) xmn = v[0]; if (v[0] > xmx) xmx = v[0];
  if (v[1] < ymn) ymn = v[1]; if (v[1] > ymx) ymx = v[1];
  if (v[2] < zmn) zmn = v[2]; if (v[2] > zmx) zmx = v[2];
}
console.log(`\nGlobal bbox: x[${xmn.toFixed(3)},${xmx.toFixed(3)}] y[${ymn.toFixed(3)},${ymx.toFixed(3)}] z[${zmn.toFixed(3)},${zmx.toFixed(3)}]`);
