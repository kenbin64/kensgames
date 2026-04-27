#!/usr/bin/env node
// inspect_glb.js — parse a .glb, extract vertex positions, and test whether the geometry
// lies on the Schwarz-D triply-periodic minimal surface:
//   F(x,y,z) = sin(x)sin(y)sin(z) + sin(x)cos(y)cos(z) + cos(x)sin(y)cos(z) + cos(x)cos(y)sin(z) = 0
// Usage: node scripts/inspect_glb.js <path-to-glb>
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/inspect_glb.js <path-to-glb>'); process.exit(1); }
const buf = fs.readFileSync(file);
console.log(`file: ${file}  size: ${(buf.length / 1048576).toFixed(2)} MB`);

// GLB header: u32 magic 'glTF', u32 version, u32 length
const magic = buf.toString('ascii', 0, 4);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
console.log(`glb header: magic=${magic} version=${version} length=${length}`);
if (magic !== 'glTF') { console.error('not a GLB'); process.exit(2); }

// Chunks: u32 chunkLength, u32 chunkType ('JSON' / 'BIN\0'), bytes
let off = 12;
const chunks = [];
while (off < buf.length) {
  const cl = buf.readUInt32LE(off);
  const ct = buf.toString('ascii', off + 4, off + 8);
  chunks.push({ type: ct.replace(/\0/g, ''), start: off + 8, length: cl });
  off += 8 + cl;
}
const jsonChunk = chunks.find(c => c.type === 'JSON');
const binChunk = chunks.find(c => c.type === 'BIN');
const json = JSON.parse(buf.slice(jsonChunk.start, jsonChunk.start + jsonChunk.length).toString('utf8'));
const bin = buf.slice(binChunk.start, binChunk.start + binChunk.length);

console.log(`\nscenes: ${json.scenes ? json.scenes.length : 0}  nodes: ${json.nodes ? json.nodes.length : 0}  meshes: ${json.meshes ? json.meshes.length : 0}`);
console.log(`accessors: ${json.accessors ? json.accessors.length : 0}  bufferViews: ${json.bufferViews ? json.bufferViews.length : 0}  materials: ${json.materials ? json.materials.length : 0}`);

// Gather POSITION accessors from every mesh primitive.
const posAccessors = new Set();
(json.meshes || []).forEach(m => (m.primitives || []).forEach(p => {
  if (p.attributes && p.attributes.POSITION != null) posAccessors.add(p.attributes.POSITION);
}));
console.log(`\nposition accessors referenced by primitives: ${posAccessors.size}`);

// Read positions from each accessor and accumulate stats.
const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const verts = [];
let totalTri = 0;
posAccessors.forEach(idx => {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const off2 = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  if (acc.componentType !== 5126 || acc.type !== 'VEC3') {
    console.warn(`  accessor ${idx}: skipping (componentType=${acc.componentType} type=${acc.type})`);
    return;
  }
  const count = acc.count;
  const stride = bv.byteStride || (TYPE_COUNT[acc.type] * COMP_SIZE[acc.componentType]);
  for (let i = 0; i < count; i++) {
    const p = off2 + i * stride;
    verts.push([bin.readFloatLE(p), bin.readFloatLE(p + 4), bin.readFloatLE(p + 8)]);
  }
});
(json.meshes || []).forEach(m => (m.primitives || []).forEach(p => {
  if (p.indices != null) totalTri += json.accessors[p.indices].count / 3;
}));
console.log(`unique vertices read: ${verts.length}   total triangles (from indices): ${totalTri.toFixed(0)}`);

if (!verts.length) { console.error('no vertices'); process.exit(3); }

// Bounding box + size + center
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
verts.forEach(v => { for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; } });
const size = mn.map((_, k) => mx[k] - mn[k]);
const ctr = mn.map((_, k) => (mn[k] + mx[k]) / 2);
console.log(`\nbbox min: [${mn.map(v => v.toFixed(3)).join(', ')}]`);
console.log(`bbox max: [${mx.map(v => v.toFixed(3)).join(', ')}]`);
console.log(`size:     [${size.map(v => v.toFixed(3)).join(', ')}]   max dim: ${Math.max(...size).toFixed(3)}`);
console.log(`center:   [${ctr.map(v => v.toFixed(3)).join(', ')}]`);

// Schwarz-D test: try a range of period scales K and see which (if any) puts vertices near F=0.
// F is the implicit surface value at the vertex; if |F| is small for most vertices, the mesh lies on it.
// We test K such that the bbox spans N periods, for N in [1..10], plus K=1 (radians).
const F = (x, y, z) => {
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  return sx*sy*sz + sx*cy*cz + cx*sy*cz + cx*cy*sz;
};
// Recenter vertices about origin for scale-period analysis.
const cv = verts.map(v => [v[0] - ctr[0], v[1] - ctr[1], v[2] - ctr[2]]);
const halfMax = Math.max(...size) / 2;

console.log('\nSchwarz-D fit test — for each candidate period N (so bbox spans ~N unit cells):');
console.log('  K = N * pi / halfMax  (one period along each axis = 2*halfMax/N units)');
console.log('  reports mean(|F|) and fraction of vertices with |F| < 0.10');
console.log('  Schwarz-D mesh would show a clear minimum and high near-surface fraction.\n');

const Ns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
let bestN = -1, bestAbs = Infinity;
Ns.forEach(N => {
  const K = N * Math.PI / halfMax;
  let sumAbs = 0, near = 0;
  cv.forEach(([x, y, z]) => { const f = F(x*K, y*K, z*K); sumAbs += Math.abs(f); if (Math.abs(f) < 0.10) near++; });
  const meanAbs = sumAbs / cv.length;
  const frac = near / cv.length;
  console.log(`  N=${N.toString().padStart(2)}  K=${K.toFixed(4)}  period=${(2*halfMax/N).toFixed(3)}u   mean|F|=${meanAbs.toFixed(3)}   near-surface=${(frac*100).toFixed(1)}%`);
  if (meanAbs < bestAbs) { bestAbs = meanAbs; bestN = N; }
});
console.log(`\nbest fit: N=${bestN}  mean|F|=${bestAbs.toFixed(3)}`);
console.log(`baseline (random points in [-pi,pi]^3 give mean|F| ≈ 0.40-0.45)`);

// Sphere/blob test: how spherical is the geometry? compute std of distance from center.
let sumR = 0, sumR2 = 0;
cv.forEach(([x, y, z]) => { const r = Math.sqrt(x*x + y*y + z*z); sumR += r; sumR2 += r*r; });
const meanR = sumR / cv.length;
const stdR = Math.sqrt(sumR2 / cv.length - meanR * meanR);
console.log(`\nradial stats: mean radius = ${meanR.toFixed(3)}   std = ${stdR.toFixed(3)}   coefficient of variation = ${(stdR/meanR).toFixed(3)}`);
console.log(`(perfect sphere CoV ≈ 0 ; cube ≈ 0.10 ; periodic surface like Schwarz-D ≈ 0.15-0.25)`);
