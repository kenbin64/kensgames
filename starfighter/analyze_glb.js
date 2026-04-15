#!/usr/bin/env node
const fs = require('fs');
const dir = 'assets/models/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb') && !f.includes('moon') && !f.includes('Earth'));
for (const m of files) {
  const buf = fs.readFileSync(dir + m);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.slice(20, 20 + jl));
  const prims = (j.meshes || []).reduce(function (s, mesh) { return s + (mesh.primitives || []).length; }, 0);
  const anims = (j.animations || []).length;
  console.log(m.padEnd(48) + ' meshes=' + (j.meshes || []).length + ' prims=' + prims + ' anims=' + anims);
}
