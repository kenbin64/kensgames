// Throwaway diagnostic — parse winki.glb and report vertex distribution.
const fs = require("fs");
const path = process.argv[2] || "/home/butterfly/apps/kensgames-portal/4DTicTacToe/assets/models/winki.glb";
console.log("=== INSPECTING:", path, "===");
const buf = fs.readFileSync(path);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const binChunkOffset = 20 + jsonLen;
const binLen = buf.readUInt32LE(binChunkOffset);
const binData = buf.slice(binChunkOffset + 8, binChunkOffset + 8 + binLen);

console.log("buffer views:");
json.bufferViews.forEach((bv, i) =>
  console.log("  " + i + ": byteOffset=" + bv.byteOffset + ", byteLength=" + bv.byteLength + ", target=" + (bv.target || ""))
);
console.log("\naccessors:");
json.accessors.forEach((a, i) =>
  console.log("  " + i + ": bufferView=" + a.bufferView + ", type=" + a.type + ", componentType=" + a.componentType + ", count=" + a.count)
);

const posAcc = json.accessors[0];
const posBV = json.bufferViews[posAcc.bufferView];
const verts = [];
for (let i = 0; i < posAcc.count; i++) {
  const off = (posBV.byteOffset || 0) + i * 12;
  verts.push([
    binData.readFloatLE(off),
    binData.readFloatLE(off + 4),
    binData.readFloatLE(off + 8)
  ]);
}

function quartiles(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return [s[0], s[Math.floor(s.length * 0.25)], s[Math.floor(s.length * 0.5)], s[Math.floor(s.length * 0.75)], s[s.length - 1]];
}
console.log("\nvertex coord quartiles (min, q25, q50, q75, max):");
console.log("X:", quartiles(verts.map(v => v[0])).map(x => x.toFixed(3)));
console.log("Y:", quartiles(verts.map(v => v[1])).map(x => x.toFixed(3)));
console.log("Z:", quartiles(verts.map(v => v[2])).map(x => x.toFixed(3)));

function histogram(arr, name) {
  const min = Math.min(...arr), max = Math.max(...arr);
  const bins = 10, w = (max - min) / bins;
  const h = new Array(bins).fill(0);
  arr.forEach(v => {
    const b = Math.min(bins - 1, Math.floor((v - min) / w));
    h[b]++;
  });
  const peak = Math.max(...h);
  console.log(name + " histogram:");
  h.forEach((c, i) =>
    console.log("  " + (min + i * w).toFixed(2) + ".." + (min + (i + 1) * w).toFixed(2) + ": " + "#".repeat(Math.round(c / peak * 40)) + " " + c)
  );
}
histogram(verts.map(v => v[0]), "X");
histogram(verts.map(v => v[1]), "Y");
histogram(verts.map(v => v[2]), "Z");

let saddle = 0, anchor = 0;
verts.forEach(([x, y, z]) => {
  const expected = x * y;
  if (Math.abs(z - expected) < 0.05) saddle++;
  else anchor++;
});
console.log("\nVertices satisfying z = x*y (within 0.05): " + saddle + " / " + verts.length);
console.log("Vertices NOT on saddle: " + anchor);

// Indices: how many triangles, what's the connectivity layout
const idxAcc = json.accessors[2];
console.log("\nindex count: " + idxAcc.count + " (= " + (idxAcc.count / 3) + " triangles)");

// Hypothesis A: GLB is a 2×2×2 = 8-chamber composite. Chamber centres at (0/2, 0/2, -2/0).
// Test: snap each vertex to nearest chamber centre, compute chamber-local (lx,ly,lz),
// and see how many satisfy lz = lx*ly (saddle in local coords, normalised to chamber radius=1).
const cxs = [0, 2], cys = [0, 2], czs = [-2, 0];
let multiChamberFit = 0;
verts.forEach(([x, y, z]) => {
  let best = null, bestD = Infinity;
  for (const cx of cxs) for (const cy of cys) for (const cz of czs) {
    const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
    if (d < bestD) { bestD = d; best = [cx, cy, cz]; }
  }
  const lx = x - best[0], ly = y - best[1], lz = z - best[2];
  if (Math.abs(lz - lx * ly) < 0.1) multiChamberFit++;
});
console.log("\nHYP A (2×2×2 chamber composite, lz=lx*ly):");
console.log("  fit: " + multiChamberFit + " / " + verts.length + " (" + (100 * multiChamberFit / verts.length).toFixed(1) + "%)");

// Hypothesis B: GLB is a single chamber centred at (1,1,-1), spanning ±2 with anchor extensions
let singleChamberFit = 0;
verts.forEach(([x, y, z]) => {
  const lx = x - 1, ly = y - 1, lz = z + 1;
  if (Math.abs(lz - lx * ly) < 0.1) singleChamberFit++;
});
console.log("\nHYP B (single chamber centred at (1,1,-1), lz=lx*ly with anchors):");
console.log("  fit: " + singleChamberFit + " / " + verts.length + " (" + (100 * singleChamberFit / verts.length).toFixed(1) + "%)");

// Look at first 20 vertices to spot the pattern manually
console.log("\nfirst 12 vertices:");
verts.slice(0, 12).forEach((v, i) => console.log("  " + i + ": (" + v.map(c => c.toFixed(3)).join(", ") + ")"));
