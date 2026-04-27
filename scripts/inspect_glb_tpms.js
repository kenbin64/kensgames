#!/usr/bin/env node
// inspect_glb_tpms.js — extension of inspect_glb.js that tests several TPMS implicit
// surfaces against the GLB vertices, plus reports thin-shell fraction and obvious
// connect-4 features (4×4 grid of vertical hole columns).
'use strict';
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/inspect_glb_tpms.js <path-to-glb>'); process.exit(1); }
const buf = fs.readFileSync(file);
const length = buf.readUInt32LE(8);
let off = 12;
const chunks = [];
while (off < buf.length) {
  const cl = buf.readUInt32LE(off);
  const ct = buf.toString('ascii', off + 4, off + 8).replace(/\0/g, '');
  chunks.push({ type: ct, start: off + 8, length: cl });
  off += 8 + cl;
}
const json = JSON.parse(buf.slice(chunks[0].start, chunks[0].start + chunks[0].length).toString('utf8'));
const bin = buf.slice(chunks[1].start, chunks[1].start + chunks[1].length);
const posIdx = new Set();
(json.meshes || []).forEach(m => (m.primitives || []).forEach(p => posIdx.add(p.attributes.POSITION)));
const verts = [];
posIdx.forEach(idx => {
  const acc = json.accessors[idx], bv = json.bufferViews[acc.bufferView];
  const o2 = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || 12;
  for (let i = 0; i < acc.count; i++) {
    const p = o2 + i * stride;
    verts.push([bin.readFloatLE(p), bin.readFloatLE(p + 4), bin.readFloatLE(p + 8)]);
  }
});
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
verts.forEach(v => { for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; } });
const ctr = mn.map((_, k) => (mn[k] + mx[k]) / 2);
const cv = verts.map(v => [v[0] - ctr[0], v[1] - ctr[1], v[2] - ctr[2]]);
const halfMax = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]) / 2;

console.log(`vertices: ${verts.length}   bbox half-extent: ${halfMax.toFixed(3)}\n`);

// TPMS candidates
const SURFACES = {
  'Schwarz-D':  (x,y,z) => Math.sin(x)*Math.sin(y)*Math.sin(z) + Math.sin(x)*Math.cos(y)*Math.cos(z) + Math.cos(x)*Math.sin(y)*Math.cos(z) + Math.cos(x)*Math.cos(y)*Math.sin(z),
  'Gyroid':     (x,y,z) => Math.sin(x)*Math.cos(y) + Math.sin(y)*Math.cos(z) + Math.sin(z)*Math.cos(x),
  'Schwarz-P':  (x,y,z) => Math.cos(x) + Math.cos(y) + Math.cos(z),
  'Neovius':    (x,y,z) => 3*(Math.cos(x)+Math.cos(y)+Math.cos(z)) + 4*Math.cos(x)*Math.cos(y)*Math.cos(z),
  'I-WP':       (x,y,z) => 2*(Math.cos(x)*Math.cos(y) + Math.cos(y)*Math.cos(z) + Math.cos(z)*Math.cos(x)) - (Math.cos(2*x)+Math.cos(2*y)+Math.cos(2*z)),
};

// For each surface, sweep K and report best (lowest mean|F|, normalized by surface RMS amplitude).
// Normalization makes the metric comparable across surfaces with different magnitudes.
const RMS = {};
{ // estimate RMS over uniform [-pi,pi]^3 sampling
  for (const [n, F] of Object.entries(SURFACES)) {
    let s2 = 0, N = 4096;
    for (let i = 0; i < N; i++) {
      const x = (Math.random()*2-1)*Math.PI, y = (Math.random()*2-1)*Math.PI, z = (Math.random()*2-1)*Math.PI;
      const f = F(x,y,z); s2 += f*f;
    }
    RMS[n] = Math.sqrt(s2/N);
  }
}
console.log('Surface RMS amplitudes (over random unit-period samples):');
for (const [n, r] of Object.entries(RMS)) console.log(`  ${n.padEnd(12)} RMS=${r.toFixed(3)}`);

console.log('\nFit test — lower is better. score = mean|F| / RMS  (random baseline ≈ 0.79).');
console.log('A mesh that lies ON the surface scores ≪ 0.79; a mesh unrelated to it scores ≈ 0.79.\n');

const Ns = [];
for (let i = 1; i <= 12; i += 0.5) Ns.push(i);

for (const [name, F] of Object.entries(SURFACES)) {
  let bestN = -1, bestScore = Infinity, bestNear = 0;
  Ns.forEach(N => {
    const K = N * Math.PI / halfMax;
    let sumAbs = 0, near = 0;
    cv.forEach(([x, y, z]) => { const f = F(x*K, y*K, z*K); const a = Math.abs(f); sumAbs += a; if (a < 0.10*RMS[name]) near++; });
    const score = (sumAbs / cv.length) / RMS[name];
    if (score < bestScore) { bestScore = score; bestN = N; bestNear = near / cv.length; }
  });
  console.log(`  ${name.padEnd(12)} best N=${bestN.toFixed(1).padStart(4)}   period=${(2*halfMax/bestN).toFixed(3).padStart(7)}u   score=${bestScore.toFixed(3)}   thin-shell %=${(bestNear*100).toFixed(1)}`);
}

// Connect-4 test: does the geometry have 16 vertical hole columns in a 4×4 grid?
// Sample horizontal slices at several Y heights; for each, compute occupancy on a 4×4 grid
// and check whether the cell centers are HOLLOW (low vertex density) and the cell corners are SOLID.
console.log('\nConnect-4 lattice test — vertical hole columns at 4×4 grid positions?');
const Y_SLABS = 4;
const halfY = (mx[1]-mn[1])/2;
const halfXZ = Math.max((mx[0]-mn[0]),(mx[2]-mn[2]))/2;
for (let s = 0; s < Y_SLABS; s++) {
  const ymin = mn[1] + s/Y_SLABS*(mx[1]-mn[1]);
  const ymax = mn[1] + (s+1)/Y_SLABS*(mx[1]-mn[1]);
  const slab = cv.filter(v => v[1] >= ymin-ctr[1] && v[1] < ymax-ctr[1]);
  // 4x4 grid in XZ plane (cell width = halfXZ*2/4 = halfXZ/2)
  const grid = Array.from({length: 4}, () => new Array(4).fill(0));
  slab.forEach(v => {
    const ix = Math.min(3, Math.max(0, Math.floor((v[0]+halfXZ)/(halfXZ/2))));
    const iz = Math.min(3, Math.max(0, Math.floor((v[2]+halfXZ)/(halfXZ/2))));
    grid[ix][iz]++;
  });
  const total = slab.length;
  const expected = total / 16;
  const cellRatios = grid.flat().map(c => c / Math.max(1, expected));
  const minR = Math.min(...cellRatios), maxR = Math.max(...cellRatios);
  console.log(`  slab y∈[${ymin.toFixed(2)},${ymax.toFixed(2)}]  verts=${slab.length.toString().padStart(7)}  cell-ratio min=${minR.toFixed(2)} max=${maxR.toFixed(2)}  (uniform=1.0; column-cage would show repeating pattern with min<<1 in hole centers)`);
}

// Print a coarse 4×4 occupancy heatmap of the equator slab for visual confirmation.
console.log('\nEquator-slab 4×4 heatmap (vertex count per cell, slab = middle 25% of Y):');
const eqMin = -halfY*0.25, eqMax = halfY*0.25;
const eqSlab = cv.filter(v => v[1] >= eqMin && v[1] < eqMax);
const eqGrid = Array.from({length: 4}, () => new Array(4).fill(0));
eqSlab.forEach(v => {
  const ix = Math.min(3, Math.max(0, Math.floor((v[0]+halfXZ)/(halfXZ/2))));
  const iz = Math.min(3, Math.max(0, Math.floor((v[2]+halfXZ)/(halfXZ/2))));
  eqGrid[ix][iz]++;
});
for (let z = 0; z < 4; z++) {
  console.log('  ' + eqGrid.map(row => row[z].toString().padStart(7)).join(' '));
}
