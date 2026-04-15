#!/usr/bin/env node
/**
 * GLB Model Optimizer — ButterflyFX Manifold Quality Pipeline
 * ═══════════════════════════════════════════════════════════════
 * Uses a triple manifold  m = x · y · z  to compute quality budgets.
 *
 *   x = visual importance   (0–1)   how central to gameplay visuals
 *   y = proximity factor    (0–1)   how often seen at close range
 *   z = complexity need     (0–1)   silhouette complexity required
 *   m = x · y · z          (0–1)   quality multiplier
 *
 * m drives:
 *   - lod0 vertex target   = m_lod0 · BASE_VERTS
 *   - lod1 vertex target   = m_lod1 · BASE_VERTS  (m_lod1 = m · LOD1_FALLOFF)
 *   - lod2 vertex target   = m_lod2 · BASE_VERTS  (m_lod2 = m · LOD2_FALLOFF²  ← z=xy²)
 *   - texture quality      = TEX_Q_MIN + m · (TEX_Q_MAX – TEX_Q_MIN)
 *
 * This means:
 *   - Cockpit (m≈1): 80k verts, textures at 92% JPEG quality
 *   - Combat fighters (m≈0.63): ~32k verts, textures at 87%
 *   - Background capitals (m≈0.27): ~14k verts, textures at 83%
 *   Nothing is hardcoded — every model's LOD budget is manifold-derived.
 *
 * Mesh reduction: spatial-grid vertex clustering (no native deps).
 * Texture reduction: jimp JPEG re-encode at manifold-derived quality.
 * lod1 / lod2 strip textures (applied from lod0 at runtime by Three.js).
 *
 * Usage:  node optimize_models.js
 * Output: assets/models/optimized/<name>_lod{0,1,2}.glb
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const INPUT_DIR = path.join(__dirname, 'assets/models');
const OUTPUT_DIR = path.join(__dirname, 'assets/models/optimized');

// ── Manifold constants ──────────────────────────────────────────────
const BASE_VERTS = 80000;   // vertex budget at m=1.0
const LOD1_FALLOFF = 0.28;    // lod1 = m · LOD1_FALLOFF  (linear manifold z=xy)
const LOD2_FALLOFF = 0.07;    // lod2 = m · LOD2_FALLOFF² (asymmetric z=xy²)
const TEX_Q_MIN = 82;      // JPEG quality floor  (m=0)
const TEX_Q_MAX = 93;      // JPEG quality ceiling (m=1)

/**
 * Triple manifold: m = x · y · z
 *   x = visual importance  (cockpit=1, fighter=0.85, capital=0.7, bg=0.5)
 *   y = proximity factor   (cockpit=1, fighter=0.85, support=0.7, capital=0.6)
 *   z = complexity need    (cockpit=1, capital=0.9, fighter=0.75, bg=0.6)
 */
function manifold(x, y, z) {
  return Math.max(0, Math.min(1, x * y * z));
}

/**
 * Derive LOD vertex targets + texture quality from manifold value m.
 * lod0: m · BASE_VERTS
 * lod1: m · LOD1_FALLOFF · BASE_VERTS          (linear falloff)
 * lod2: m · LOD2_FALLOFF² · BASE_VERTS         (asymmetric escalation — drops fast)
 * texQ: TEX_Q_MIN + m · (TEX_Q_MAX - TEX_Q_MIN)
 */
function deriveLODs(m, lodCount = 3) {
  const texQ = Math.round(TEX_Q_MIN + m * (TEX_Q_MAX - TEX_Q_MIN));
  const lod0v = Math.round(m * BASE_VERTS);
  const lod1v = Math.round(m * LOD1_FALLOFF * BASE_VERTS);
  const lod2v = Math.round(m * LOD2_FALLOFF * LOD2_FALLOFF * BASE_VERTS);
  const levels = [
    { suffix: 'lod0', maxVerts: Math.max(lod0v, 8000) },
    { suffix: 'lod1', maxVerts: Math.max(lod1v, 1500) },
    { suffix: 'lod2', maxVerts: Math.max(lod2v, 400) },
  ].slice(0, lodCount);
  return { levels, texQ };
}

// ── Per-model manifold parameters ──────────────────────────────────
// Each entry: [x_importance, y_proximity, z_complexity, lodCount]
const MANIFOLD_PARAMS = {
  // Cockpit: always fills screen, maximum detail
  'firstPersonStarFighterCockpit.glb': [1.00, 1.00, 1.00, 1],  // m=1.00 → 80k verts, 1 LOD

  // Player/ally fighters: close combat, high silhouette importance
  'HumanFriendlStarFighter.glb': [0.90, 0.85, 0.80, 3],  // m=0.61
  'HumanSpaceBattleShip.glb': [0.80, 0.65, 0.85, 3],  // m=0.44

  // Enemy fighters: seen constantly in combat
  'AlienEnemyFighter.glb': [0.88, 0.85, 0.80, 3],  // m=0.60
  'AlienEnemyPreditorDrone.glb': [0.88, 0.85, 0.80, 3],  // m=0.60
  'Interceptor_Needle.glb': [0.85, 0.82, 0.78, 3],  // m=0.54

  // Bombers / sentinels: mid-range threats
  'Bomber_Leviathan Tick.glb': [0.80, 0.75, 0.80, 3],  // m=0.48
  'enemy_cruiser_hive_sentinel.glb': [0.75, 0.70, 0.80, 3],  // m=0.42

  // Support ships: seen close during docking
  'freindly_medical_frigate.glb': [0.70, 0.75, 0.72, 3],  // m=0.38
  'friendlyfueltanker.glb': [0.70, 0.75, 0.68, 3],  // m=0.36
  'Rescue Shuttle .glb': [0.60, 0.65, 0.68, 3],  // m=0.27

  // Capital ships: large, seen from mid-far range
  'AlienMotherShip.glb': [0.75, 0.60, 0.88, 3],  // m=0.40
  'HumanSpaceStationWithAritificalGravity.glb': [0.65, 0.55, 0.88, 3],  // m=0.31
  'Dreadnought_Hive Throne.glb': [0.78, 0.62, 0.88, 3],  // m=0.43

  // Background / environment
  'Earth.glb': [0.50, 0.40, 0.60, 3],  // m=0.12 (sphere, low geo needed)
  'moon.glb': [0.40, 0.35, 0.55, 2],  // m=0.08
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

  // Estimate surface area from sampled triangles (surface meshes need sqrt formula, not cbrt).
  // Sample every Nth triangle to keep this O(N/rate) instead of O(N).
  const sampleRate = Math.max(1, Math.floor(indices.length / 3 / 2000));
  let sampledArea = 0, sampledCount = 0;
  for (let i = 0; i < indices.length - 2; i += 3 * sampleRate) {
    const ai = indices[i] * 3, bi = indices[i + 1] * 3, ci = indices[i + 2] * 3;
    const ax = positions[ai] - positions[ci], ay = positions[ai + 1] - positions[ci + 1], az = positions[ai + 2] - positions[ci + 2];
    const bx = positions[bi] - positions[ci], by = positions[bi + 1] - positions[ci + 1], bz = positions[bi + 2] - positions[ci + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    sampledArea += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    sampledCount++;
  }
  const estSurfaceArea = (sampledCount > 0) ? sampledArea * (indices.length / 3) / (sampledCount * sampleRate) : 1;

  // Surface mesh cell size: area per cell = estSurfaceArea / targetCount → cellSize = sqrt(area/target)
  // Factor 1.3 gives slight over-target to leave margin after degenerate triangle removal.
  const cellSizeSurface = Math.sqrt(estSurfaceArea / targetCount) * 1.3;
  // Volume fallback (for when surface area estimate is 0 or very small)
  const volume = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
  const cellSizeVolume = Math.cbrt(volume / targetCount);
  const cellSize = Math.max(cellSizeSurface, cellSizeVolume * 0.12);

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

// stripTextures=true → geometry-only GLB (for lod1, lod2). Materials applied at runtime from lod0.
// compressedImages: Map(bufferViewIndex → Buffer) — pre-recompressed texture buffers.
function buildGLB(json, bin, meshData, origPositions, origNormals, origUVs, origIndices, stripTextures = false, compressedImages = null) {
  // Build new binary buffer with decimated mesh + original images
  const chunks = [];
  const newBufferViews = [];
  const newAccessors = [];
  let byteOffset = 0;

  // Position
  // Compute bounding box via loop (spread operator overflows stack for large meshes)
  let bbMinX = Infinity, bbMinY = Infinity, bbMinZ = Infinity;
  let bbMaxX = -Infinity, bbMaxY = -Infinity, bbMaxZ = -Infinity;
  for (let i = 0; i < meshData.positions.length; i += 3) {
    const px = meshData.positions[i], py = meshData.positions[i + 1], pz = meshData.positions[i + 2];
    if (px < bbMinX) bbMinX = px; if (px > bbMaxX) bbMaxX = px;
    if (py < bbMinY) bbMinY = py; if (py > bbMaxY) bbMaxY = py;
    if (pz < bbMinZ) bbMinZ = pz; if (pz > bbMaxZ) bbMaxZ = pz;
  }

  const posBytes = Buffer.from(meshData.positions.buffer, meshData.positions.byteOffset, meshData.positions.byteLength);
  newBufferViews.push({ buffer: 0, byteOffset, byteLength: posBytes.length });
  newAccessors.push({
    bufferView: 0, componentType: 5126, count: meshData.positions.length / 3,
    type: 'VEC3',
    max: [bbMaxX, bbMaxY, bbMaxZ],
    min: [bbMinX, bbMinY, bbMinZ]
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

  // Images — only embed in lod0. lod1/lod2 get geometry only; materials applied from lod0 at runtime.
  const imageBufferViewStart = newBufferViews.length;
  if (!stripTextures && json.images) {
    json.images.forEach((img, i) => {
      const origBv = json.bufferViews[img.bufferView];
      // Use pre-compressed buffer if available, otherwise fall through to original
      const imgData = (compressedImages && compressedImages.has(img.bufferView))
        ? compressedImages.get(img.bufferView)
        : bin.slice(origBv.byteOffset || 0, (origBv.byteOffset || 0) + origBv.byteLength);
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
  // material reference added below only when NOT stripping textures

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

  if (!stripTextures) {
    if (json.materials) newJson.materials = json.materials;
    if (json.textures) newJson.textures = json.textures;
    if (json.images) {
      newJson.images = json.images.map((img, i) => ({
        bufferView: imageBufferViewStart + i,
        mimeType: img.mimeType
      }));
    }
    if (json.samplers) newJson.samplers = json.samplers;
    if (prim.material !== undefined) newPrim.material = prim.material;
  }
  // When stripped, mesh has no material — Three.js will copy from lod0 at runtime

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

/**
 * Re-encode an embedded texture using jimp at the given JPEG quality.
 * Falls back to original bytes on any error (non-JPEG/PNG, corrupt data, etc.).
 * quality 0–100 (100 = lossless perceptually).
 */
async function recompressTexture(imgData, quality) {
  try {
    const img = await Jimp.fromBuffer(Buffer.from(imgData));
    return await img.getBuffer('image/jpeg', { quality });
  } catch (e) {
    return imgData;  // non-JPEG/unsupported format — keep original
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.glb'));

  let grandOrigTotal = 0, grandOptTotal = 0;

  for (const file of files) {
    const mParams = MANIFOLD_PARAMS[file];
    if (!mParams) { console.log(`Skipping ${file} (no manifold config)`); continue; }

    const [xi, yi, zi, lodCount] = mParams;
    const m = manifold(xi, yi, zi);
    const { levels, texQ } = deriveLODs(m, lodCount);

    console.log(`\n=== ${file} ===`);
    console.log(`  Manifold: x=${xi} y=${yi} z=${zi}  →  m=${m.toFixed(3)}  texQ=${texQ}`);

    const buf = fs.readFileSync(path.join(INPUT_DIR, file));
    grandOrigTotal += buf.length;
    const { json, bin } = parseGLB(buf);

    const prim = json.meshes[0].primitives[0];
    const positions = getAccessorData(json, bin, prim.attributes.POSITION);
    const normals = prim.attributes.NORMAL !== undefined ? getAccessorData(json, bin, prim.attributes.NORMAL) : null;
    const uvs = prim.attributes.TEXCOORD_0 !== undefined ? getAccessorData(json, bin, prim.attributes.TEXCOORD_0) : null;
    const indices = getAccessorData(json, bin, prim.indices);

    const origVerts = positions.length / 3;
    const origTris = indices.length / 3;
    console.log(`  Input: ${origVerts.toLocaleString()} verts, ${origTris.toLocaleString()} tris, ${(buf.length / 1048576).toFixed(1)} MB`);
    console.log(`  LOD targets: ${levels.map(l => `${l.suffix}(${l.maxVerts.toLocaleString()})`).join(', ')}`);

    // ── Recompress textures once (embedded in lod0 only) ─────────
    const compressedImages = new Map();
    if (json.images) {
      let texOrigBytes = 0, texCompBytes = 0;
      for (const img of json.images) {
        if (img.bufferView === undefined) continue;
        const bv = json.bufferViews[img.bufferView];
        const offset = bv.byteOffset || 0;
        const imgData = bin.slice(offset, offset + bv.byteLength);
        texOrigBytes += imgData.length;
        const compressed = await recompressTexture(imgData, texQ);
        compressedImages.set(img.bufferView, compressed);
        texCompBytes += compressed.length;
      }
      if (texOrigBytes > 0) {
        const texPct = Math.round((1 - texCompBytes / texOrigBytes) * 100);
        console.log(`  Textures: ${(texOrigBytes / 1048576).toFixed(1)} MB → ${(texCompBytes / 1048576).toFixed(1)} MB (-${texPct}%) @q${texQ}`);
      }
    }

    // ── Produce each LOD level ────────────────────────────────────
    for (const { suffix, maxVerts } of levels) {
      const stripTextures = suffix !== 'lod0';
      const meshData = simplifyMesh(positions, normals, uvs, indices, maxVerts);
      const glb = buildGLB(json, bin, meshData, positions, normals, uvs, indices, stripTextures, compressedImages);
      const baseName = file.replace('.glb', '');
      const outPath = path.join(OUTPUT_DIR, `${baseName}_${suffix}.glb`);
      fs.writeFileSync(outPath, glb);
      const pct = Math.round((1 - glb.length / buf.length) * 100);
      grandOptTotal += glb.length;
      console.log(`  ${suffix}: ${(meshData.positions.length / 3).toLocaleString()} verts | ${(glb.length / 1048576).toFixed(1)} MB (-${pct}%)`);
    }
  }

  console.log('\n╔══════════════════════════════════╗');
  console.log('║       Optimization Complete       ║');
  console.log('╚══════════════════════════════════╝');
  const totalPct = Math.round((1 - grandOptTotal / grandOrigTotal) * 100);
  console.log(`Total input:  ${(grandOrigTotal / 1048576).toFixed(1)} MB`);
  console.log(`Total output: ${(grandOptTotal / 1048576).toFixed(1)} MB (-${totalPct}%)`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
  console.log('Next: update 3d.js model paths to assets/models/optimized/<name>_lod0.glb');
  console.log('      and register _lod1/_lod2 with THREE.LOD for distance switching.');
}

main().catch(console.error);
