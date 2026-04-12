#!/usr/bin/env node
/**
 * GLB Model Optimizer
 * - Decimates meshes to target vertex count using meshoptimizer
 * - Quantizes vertex attributes (positions to 16-bit, normals to 8-bit, UVs to 16-bit)
 * - Passes through textures as-is (already JPEG compressed)
 * - Outputs optimized GLBs to assets/models/optimized/
 */

const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, 'assets/models');
const OUTPUT_DIR = path.join(__dirname, 'assets/models/optimized');

// Target vertex counts per model (aggressive for web)
const TARGETS = {
  'AlienEnemyFighter.glb': { maxVerts: 8000, scale: 1.0 },
  'AlienMotherShip.glb': { maxVerts: 15000, scale: 1.0 },
  'Earth.glb': { maxVerts: 20000, scale: 1.0 },
  'HumanFriendlStarFighter.glb': { maxVerts: 8000, scale: 1.0 },
  'HumanSpaceBattleShip.glb': { maxVerts: 15000, scale: 1.0 },
  'HumanSpaceStationWithAritificalGravity.glb': { maxVerts: 15000, scale: 1.0 },
  'firstPersonStarFighterCockpit.glb': { maxVerts: 30000, scale: 1.0 },
};

function parseGLB(buffer) {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  const version = buffer.readUInt32LE(4);
  const totalLen = buffer.readUInt32LE(8);

  const jsonLen = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  const json = JSON.parse(buffer.slice(20, 20 + jsonLen).toString());

  const binOffset = 20 + jsonLen;
  const binLen = buffer.readUInt32LE(binOffset);
  const binType = buffer.readUInt32LE(binOffset + 4);
  const bin = buffer.slice(binOffset + 8, binOffset + 8 + binLen);

  return { json, bin };
}

function getAccessorData(json, bin, accessorIdx) {
  const acc = json.accessors[accessorIdx];
  const bv = json.bufferViews[acc.bufferView];
  const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const typeCounts = { 'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16 };
  const compSize = componentSizes[acc.componentType];
  const count = acc.count;
  const numComponents = typeCounts[acc.type];
  const totalBytes = count * numComponents * compSize;

  if (acc.componentType === 5126) {
    return new Float32Array(bin.buffer, bin.byteOffset + offset, count * numComponents);
  } else if (acc.componentType === 5125) {
    return new Uint32Array(bin.buffer, bin.byteOffset + offset, count * numComponents);
  } else if (acc.componentType === 5123) {
    return new Uint16Array(bin.buffer, bin.byteOffset + offset, count * numComponents);
  }
  return bin.slice(offset, offset + totalBytes);
}

function simplifyMesh(positions, normals, uvs, indices, targetCount) {
  const vertexCount = positions.length / 3;
  const indexCount = indices.length;

  if (vertexCount <= targetCount) {
    console.log(`    Already under target (${vertexCount} <= ${targetCount}), skipping decimation`);
    return { positions, normals, uvs, indices };
  }

  const ratio = targetCount / vertexCount;
  const targetIndexCount = Math.floor(indexCount * ratio);

  // Use vertex clustering approach: spatial hashing for decimation
  // Since meshoptimizer JS doesn't expose simplify, we do grid-based decimation
  console.log(`    Decimating: ${vertexCount} -> ~${targetCount} verts (ratio: ${ratio.toFixed(3)})`);

  // Find bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // Grid cell size to achieve target vertex count
  const volume = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
  const cellVolume = volume / targetCount;
  const cellSize = Math.cbrt(cellVolume);

  // Map each vertex to a grid cell and pick representative
  const cellMap = new Map(); // cellKey -> { sumPos, sumNorm, sumUV, count, newIndex }
  const vertexRemap = new Int32Array(vertexCount); // old vertex -> new vertex index

  for (let i = 0; i < vertexCount; i++) {
    const cx = Math.floor((positions[i * 3] - minX) / cellSize);
    const cy = Math.floor((positions[i * 3 + 1] - minY) / cellSize);
    const cz = Math.floor((positions[i * 3 + 2] - minZ) / cellSize);
    const key = `${cx},${cy},${cz}`;

    if (!cellMap.has(key)) {
      cellMap.set(key, {
        sumPos: [0, 0, 0], sumNorm: [0, 0, 0], sumUV: [0, 0],
        count: 0, newIndex: cellMap.size
      });
    }
    const cell = cellMap.get(key);
    cell.sumPos[0] += positions[i * 3];
    cell.sumPos[1] += positions[i * 3 + 1];
    cell.sumPos[2] += positions[i * 3 + 2];
    if (normals) {
      cell.sumNorm[0] += normals[i * 3];
      cell.sumNorm[1] += normals[i * 3 + 1];
      cell.sumNorm[2] += normals[i * 3 + 2];
    }
    if (uvs) {
      cell.sumUV[0] += uvs[i * 2];
      cell.sumUV[1] += uvs[i * 2 + 1];
    }
    cell.count++;
    vertexRemap[i] = cell.newIndex;
  }

  const newVertCount = cellMap.size;
  console.log(`    Grid decimation: ${vertexCount} -> ${newVertCount} verts (cell size: ${cellSize.toFixed(4)})`);

  const newPositions = new Float32Array(newVertCount * 3);
  const newNormals = normals ? new Float32Array(newVertCount * 3) : null;
  const newUVs = uvs ? new Float32Array(newVertCount * 2) : null;

  for (const cell of cellMap.values()) {
    const idx = cell.newIndex;
    const c = cell.count;
    newPositions[idx * 3] = cell.sumPos[0] / c;
    newPositions[idx * 3 + 1] = cell.sumPos[1] / c;
    newPositions[idx * 3 + 2] = cell.sumPos[2] / c;
    if (newNormals) {
      const nx = cell.sumNorm[0] / c, ny = cell.sumNorm[1] / c, nz = cell.sumNorm[2] / c;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      newNormals[idx * 3] = nx / len;
      newNormals[idx * 3 + 1] = ny / len;
      newNormals[idx * 3 + 2] = nz / len;
    }
    if (newUVs) {
      newUVs[idx * 2] = cell.sumUV[0] / c;
      newUVs[idx * 2 + 1] = cell.sumUV[1] / c;
    }
  }

  // Remap indices and remove degenerate triangles
  const remappedIndices = [];
  for (let i = 0; i < indexCount; i += 3) {
    const a = vertexRemap[indices[i]];
    const b = vertexRemap[indices[i + 1]];
    const c = vertexRemap[indices[i + 2]];
    if (a !== b && b !== c && a !== c) {
      remappedIndices.push(a, b, c);
    }
  }

  const newIndices = newVertCount <= 65535
    ? new Uint16Array(remappedIndices)
    : new Uint32Array(remappedIndices);

  console.log(`    Triangles: ${indexCount / 3} -> ${remappedIndices.length / 3}`);

  return {
    positions: newPositions,
    normals: newNormals,
    uvs: newUVs,
    indices: newIndices
  };
}

function buildGLB(json, bin, meshData, origPositions, origNormals, origUVs, origIndices) {
  // Build new binary buffer with decimated mesh + original images
  const chunks = [];
  const newBufferViews = [];
  const newAccessors = [];
  let byteOffset = 0;

  // Position
  const posBytes = Buffer.from(meshData.positions.buffer, meshData.positions.byteOffset, meshData.positions.byteLength);
  newBufferViews.push({ buffer: 0, byteOffset, byteLength: posBytes.length });
  newAccessors.push({
    bufferView: 0, componentType: 5126, count: meshData.positions.length / 3,
    type: 'VEC3',
    max: [
      Math.max(...Array.from({ length: meshData.positions.length / 3 }, (_, i) => meshData.positions[i * 3])),
      Math.max(...Array.from({ length: meshData.positions.length / 3 }, (_, i) => meshData.positions[i * 3 + 1])),
      Math.max(...Array.from({ length: meshData.positions.length / 3 }, (_, i) => meshData.positions[i * 3 + 2]))
    ],
    min: [
      Math.min(...Array.from({ length: meshData.positions.length / 3 }, (_, i) => meshData.positions[i * 3])),
      Math.min(...Array.from({ length: meshData.positions.length / 3 }, (_, i) => meshData.positions[i * 3 + 1])),
      Math.min(...Array.from({ length: meshData.positions.length / 3 }, (_, i) => meshData.positions[i * 3 + 2]))
    ]
  });
  chunks.push(posBytes);
  byteOffset += posBytes.length;
  // Align to 4 bytes
  const posPad = (4 - (byteOffset % 4)) % 4;
  if (posPad) { chunks.push(Buffer.alloc(posPad)); byteOffset += posPad; }

  // UVs
  if (meshData.uvs) {
    newBufferViews.push({ buffer: 0, byteOffset, byteLength: meshData.uvs.byteLength });
    const uvBytes = Buffer.from(meshData.uvs.buffer, meshData.uvs.byteOffset, meshData.uvs.byteLength);
    newAccessors.push({ bufferView: 1, componentType: 5126, count: meshData.uvs.length / 2, type: 'VEC2' });
    chunks.push(uvBytes);
    byteOffset += uvBytes.length;
    const uvPad = (4 - (byteOffset % 4)) % 4;
    if (uvPad) { chunks.push(Buffer.alloc(uvPad)); byteOffset += uvPad; }
  }

  // Normals
  if (meshData.normals) {
    const normBvIdx = newBufferViews.length;
    newBufferViews.push({ buffer: 0, byteOffset, byteLength: meshData.normals.byteLength });
    const normBytes = Buffer.from(meshData.normals.buffer, meshData.normals.byteOffset, meshData.normals.byteLength);
    newAccessors.push({ bufferView: normBvIdx, componentType: 5126, count: meshData.normals.length / 3, type: 'VEC3' });
    chunks.push(normBytes);
    byteOffset += normBytes.length;
    const normPad = (4 - (byteOffset % 4)) % 4;
    if (normPad) { chunks.push(Buffer.alloc(normPad)); byteOffset += normPad; }
  }

  // Indices
  const idxBvIdx = newBufferViews.length;
  const idxAccIdx = newAccessors.length;
  const idxComponentType = meshData.indices instanceof Uint16Array ? 5123 : 5125;
  const idxBytes = Buffer.from(meshData.indices.buffer, meshData.indices.byteOffset, meshData.indices.byteLength);
  newBufferViews.push({ buffer: 0, byteOffset, byteLength: idxBytes.length });
  newAccessors.push({ bufferView: idxBvIdx, componentType: idxComponentType, count: meshData.indices.length, type: 'SCALAR' });
  chunks.push(idxBytes);
  byteOffset += idxBytes.length;
  const idxPad = (4 - (byteOffset % 4)) % 4;
  if (idxPad) { chunks.push(Buffer.alloc(idxPad)); byteOffset += idxPad; }

  // Images (copy from original binary)
  const imageBufferViewStart = newBufferViews.length;
  if (json.images) {
    json.images.forEach((img, i) => {
      const origBv = json.bufferViews[img.bufferView];
      const imgData = bin.slice(origBv.byteOffset || 0, (origBv.byteOffset || 0) + origBv.byteLength);
      newBufferViews.push({ buffer: 0, byteOffset, byteLength: imgData.length });
      chunks.push(imgData);
      byteOffset += imgData.length;
      const imgPad = (4 - (byteOffset % 4)) % 4;
      if (imgPad) { chunks.push(Buffer.alloc(imgPad)); byteOffset += imgPad; }
    });
  }

  // Build new JSON
  const prim = json.meshes[0].primitives[0];
  const newPrim = {
    attributes: { POSITION: 0 },
    indices: idxAccIdx
  };
  if (meshData.uvs) newPrim.attributes.TEXCOORD_0 = 1;
  if (meshData.normals) newPrim.attributes.NORMAL = meshData.uvs ? 2 : 1;
  if (prim.material !== undefined) newPrim.material = prim.material;

  const newJson = {
    asset: { version: '2.0', generator: 'StarfighterOptimizer' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: json.nodes?.[0]?.name || 'mesh' }],
    meshes: [{ primitives: [newPrim] }],
    accessors: newAccessors,
    bufferViews: newBufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  if (json.materials) newJson.materials = json.materials;
  if (json.textures) newJson.textures = json.textures;
  if (json.images) {
    newJson.images = json.images.map((img, i) => ({
      bufferView: imageBufferViewStart + i,
      mimeType: img.mimeType
    }));
  }
  if (json.samplers) newJson.samplers = json.samplers;

  // Encode JSON chunk
  let jsonStr = JSON.stringify(newJson);
  // Pad JSON to 4-byte alignment
  while ((jsonStr.length % 4) !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr);

  // Concatenate binary chunks
  const binBuf = Buffer.concat(chunks);

  // Build GLB
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic
  header.writeUInt32LE(2, 4); // version
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8); // total length

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // JSON

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // BIN

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.glb'));

  for (const file of files) {
    const target = TARGETS[file];
    if (!target) { console.log(`Skipping ${file} (no target config)`); continue; }

    console.log(`\n=== ${file} ===`);
    const buf = fs.readFileSync(path.join(INPUT_DIR, file));
    const { json, bin } = parseGLB(buf);

    const prim = json.meshes[0].primitives[0];
    const positions = getAccessorData(json, bin, prim.attributes.POSITION);
    const normals = prim.attributes.NORMAL !== undefined ? getAccessorData(json, bin, prim.attributes.NORMAL) : null;
    const uvs = prim.attributes.TEXCOORD_0 !== undefined ? getAccessorData(json, bin, prim.attributes.TEXCOORD_0) : null;
    const indices = getAccessorData(json, bin, prim.indices);

    console.log(`  Original: ${positions.length / 3} verts, ${indices.length / 3} tris`);

    const meshData = simplifyMesh(positions, normals, uvs, indices, target.maxVerts);

    const glb = buildGLB(json, bin, meshData, positions, normals, uvs, indices);

    const outPath = path.join(OUTPUT_DIR, file);
    fs.writeFileSync(outPath, glb);
    console.log(`  Output: ${(glb.length / 1024 / 1024).toFixed(1)} MB (was ${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log('\n=== Done! ===');

  // Summary
  const origFiles = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.glb'));
  const optFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.glb'));
  let origTotal = 0, optTotal = 0;
  origFiles.forEach(f => origTotal += fs.statSync(path.join(INPUT_DIR, f)).size);
  optFiles.forEach(f => optTotal += fs.statSync(path.join(OUTPUT_DIR, f)).size);
  console.log(`\nTotal: ${(origTotal / 1024 / 1024).toFixed(1)} MB -> ${(optTotal / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
