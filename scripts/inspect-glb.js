wh
/* eslint-disable no-console */
// Self-contained GLB inspector. No deps. Parses the glTF JSON chunk and the
// BIN chunk, then summarises meshes, materials, and per-mesh bounding box +
// vertex-position symmetry hints (axis means / extents) so we can reason
// about a 6-orientation z=xy construction.

const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node inspect-glb.js <file.glb>'); process.exit(1); }

const buf = fs.readFileSync(path);
if (buf.readUInt32LE(0) !== 0x46546C67) { console.error('not a GLB (magic mismatch)'); process.exit(2); }
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);
console.log(`GLB v${version}, declared length ${total}, actual ${buf.length}`);

let off = 12;
let json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.slice(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004E4942) bin = data;
  off += 8 + len;
}
if (!json) { console.error('no JSON chunk'); process.exit(3); }

console.log('--- ASSET ---');
console.log(JSON.stringify(json.asset, null, 2));
console.log('counts:',
  'scenes=' + (json.scenes || []).length,
  'nodes=' + (json.nodes || []).length,
  'meshes=' + (json.meshes || []).length,
  'materials=' + (json.materials || []).length,
  'accessors=' + (json.accessors || []).length,
  'bufferViews=' + (json.bufferViews || []).length);

// node tree
console.log('--- SCENE GRAPH ---');
const scene = (json.scenes || [])[json.scene || 0] || { nodes: [] };
const nodeName = i => (json.nodes[i].name || `node${i}`);
function walk(i, depth) {
  const n = json.nodes[i];
  const t = n.translation ? ` t=[${n.translation.map(x => x.toFixed(3)).join(',')}]` : '';
  const r = n.rotation ? ` r=[${n.rotation.map(x => x.toFixed(3)).join(',')}]` : '';
  const s = n.scale ? ` s=[${n.scale.map(x => x.toFixed(3)).join(',')}]` : '';
  const m = (n.mesh !== undefined) ? ` mesh=${n.mesh}` : '';
  console.log('  '.repeat(depth) + `[${i}] ${nodeName(i)}${t}${r}${s}${m}`);
  (n.children || []).forEach(c => walk(c, depth + 1));
}
scene.nodes.forEach(i => walk(i, 0));

// helpers to read accessor data from the BIN chunk
const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const componentReader = {
  5126: (b, o) => b.readFloatLE(o),
  5125: (b, o) => b.readUInt32LE(o),
  5123: (b, o) => b.readUInt16LE(o),
  5122: (b, o) => b.readInt16LE(o),
  5121: (b, o) => b.readUInt8(o),
  5120: (b, o) => b.readInt8(o)
};
const typeNumComponents = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const offset = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const nComp = typeNumComponents[a.type];
  const cs = componentSize[a.componentType];
  const stride = bv.byteStride || (cs * nComp);
  const reader = componentReader[a.componentType];
  const out = new Array(a.count);
  for (let i = 0; i < a.count; i++) {
    const row = new Array(nComp);
    for (let c = 0; c < nComp; c++) row[c] = reader(bin, offset + i * stride + c * cs);
    out[i] = row;
  }
  return out;
}

console.log('--- MESHES ---'); m
  (json.meshes || []).forEach((mesh, mi) => {
    console.log(`mesh[${mi}] name="${mesh.name || ''}" primitives=${mesh.primitives.length}`);
    mesh.primitives.forEach((p, pi) => {
      const posIdx = p.attributes.POSITION;
      const pos = readAccessor(posIdx);
      let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
      let xs = 0, ys = 0, zs = 0;
      for (const v of pos) {
        if (v[0] < xmin) xmin = v[0]; if (v[0] > xmax) xmax = v[0]; xs += v[0];
        if (v[1] < ymin) ymin = v[1]; if (v[1] > ymax) ymax = v[1]; ys += v[1];
        if (v[2] < zmin) zmin = v[2]; if (v[2] > zmax) zmax = v[2]; zs += v[2];
      }
      const n = pos.length;
      const idxCount = (p.indices !== undefined) ? json.accessors[p.indices].count : 0;
      const matName = (p.material !== undefined) ? (json.materials[p.material].name || `mat${p.material}`) : 'none';
      console.log(`  prim[${pi}] verts=${n} indices=${idxCount} mat=${matName}`);
      console.log(`    bbox  x[${xmin.toFixed(4)}, ${xmax.toFixed(4)}] y[${ymin.toFixed(4)}, ${ymax.toFixed(4)}] z[${zmin.toFixed(4)}, ${zmax.toFixed(4)}]`);
      console.log(`    mean  (${(xs / n).toFixed(4)}, ${(ys / n).toFixed(4)}, ${(zs / n).toFixed(4)})`);
      console.log(`    extent (${(xmax - xmin).toFixed(4)}, ${(ymax - ymin).toFixed(4)}, ${(zmax - zmin).toFixed(4)})`);
    });
  });

console.log('--- MATERIALS ---');
(json.materials || []).forEach((m, i) => {
  const pbr = m.pbrMetallicRoughness || {};
  const bc = pbr.baseColorFactor;
  console.log(`mat[${i}] name="${m.name || ''}" baseColor=${bc ? '[' + bc.map(v => v.toFixed(3)).join(',') + ']' : 'n/a'} metal=${pbr.metallicFactor ?? 'n/a'} rough=${pbr.roughnessFactor ?? 'n/a'} doubleSided=${m.doubleSided || false}`);
});
