#!/usr/bin/env node
/**
 * GLB Model Optimizer — gltf-transform core + meshoptimizer QEM simplification
 *
 * Uses proper Quadric Error Metric edge-collapse decimation (NOT grid clustering).
 * Preserves surface shape, normals, UVs. Multi-mesh GLBs handled correctly.
 * No sharp dependency — uses meshoptimizer WASM directly on raw buffers.
 */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = path.join(__dirname, 'assets/models');
const OUTPUT_DIR = path.join(__dirname, 'assets/models/optimized');

const TARGETS = {
  'AlienEnemyFighter.glb': [
    { suffix: 'lod0', ratio: 0.60, keepTextures: true },
    { suffix: 'lod1', ratio: 0.20, keepTextures: false },
    { suffix: 'lod2', ratio: 0.05, keepTextures: false },
  ],
  'HumanFriendlStarFighter.glb': [
    { suffix: 'lod0', ratio: 0.60, keepTextures: true },
    { suffix: 'lod1', ratio: 0.20, keepTextures: false },
    { suffix: 'lod2', ratio: 0.05, keepTextures: false },
  ],
  'AlienMotherShip.glb': [
    { suffix: 'lod1', ratio: 0.30, keepTextures: false },
    { suffix: 'lod2', ratio: 0.08, keepTextures: false },
  ],
  'HumanSpaceBattleShip.glb': [
    { suffix: 'lod1', ratio: 0.30, keepTextures: false },
    { suffix: 'lod2', ratio: 0.08, keepTextures: false },
  ],
  'HumanSpaceStationWithAritificalGravity.glb': [
    { suffix: 'lod1', ratio: 0.30, keepTextures: false },
    { suffix: 'lod2', ratio: 0.08, keepTextures: false },
  ],
  'Earth.glb': [
    { suffix: 'lod1', ratio: 0.25, keepTextures: false },
    { suffix: 'lod2', ratio: 0.08, keepTextures: false },
  ],
  'HiveQueen_BossW10.glb': [
    { suffix: 'lod0', ratio: 0.70, keepTextures: true },
    { suffix: 'lod1', ratio: 0.25, keepTextures: false },
    { suffix: 'lod2', ratio: 0.06, keepTextures: false },
  ],
};

function simplifyPrimitive(posAccessor, idxAccessor, ratio) {
  const positions = posAccessor.getArray();
  const indices = idxAccessor.getArray();
  const vertexCount = posAccessor.getCount();
  const indexCount = idxAccessor.getCount();

  // Skip non-triangle or trivially small meshes
  if (indexCount < 3 || indexCount % 3 !== 0) return new Uint32Array(indices);

  // Target must be divisible by 3
  let targetIndexCount = Math.floor(indexCount * ratio);
  targetIndexCount = Math.max(3, targetIndexCount - (targetIndexCount % 3));

  const indices32 = new Uint32Array(indices);

  // Validate: all indices must be < vertexCount
  let maxIdx = 0;
  for (let i = 0; i < indices32.length; i++) {
    if (indices32[i] > maxIdx) maxIdx = indices32[i];
  }
  if (maxIdx >= vertexCount) {
    console.log(`    WARN: max index ${maxIdx} >= vertexCount ${vertexCount}, skipping prim`);
    return indices32;
  }

  console.log(`    simplify: verts=${vertexCount} idxCount=${indexCount} target=${targetIndexCount} posLen=${positions.length}`);

  const result = MeshoptSimplifier.simplify(
    indices32,
    positions,
    3,
    targetIndexCount,
    0.02,
    ['LockBorder']
  );

  return result[0];
}

function compactPrimitive(prim, doc) {
  const idxAcc = prim.getIndices();
  if (!idxAcc) return;
  const indices = idxAcc.getArray();
  const posAcc = prim.getAttribute('POSITION');
  if (!posAcc) return;

  const vertexCount = posAcc.getCount();
  const usedSet = new Set();
  for (let i = 0; i < indices.length; i++) usedSet.add(indices[i]);
  const usedVerts = Array.from(usedSet).sort((a, b) => a - b);

  if (usedVerts.length === vertexCount) return;

  const remap = new Int32Array(vertexCount).fill(-1);
  usedVerts.forEach((oldIdx, newIdx) => { remap[oldIdx] = newIdx; });

  const newIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    newIndices[i] = remap[indices[i]];
  }

  const semantics = prim.listSemantics();
  for (const sem of semantics) {
    const acc = prim.getAttribute(sem);
    if (!acc) continue;
    const arr = acc.getArray();
    const elSize = acc.getElementSize();
    const TypedArr = arr.constructor;
    const newArr = new TypedArr(usedVerts.length * elSize);
    for (let i = 0; i < usedVerts.length; i++) {
      const oldIdx = usedVerts[i];
      for (let c = 0; c < elSize; c++) {
        newArr[i * elSize + c] = arr[oldIdx * elSize + c];
      }
    }
    const newAcc = doc.createAccessor()
      .setType(acc.getType())
      .setArray(newArr);
    if (acc.getNormalized()) newAcc.setNormalized(true);
    prim.setAttribute(sem, newAcc);
  }

  const finalIndices = usedVerts.length <= 65535
    ? new Uint16Array(newIndices)
    : newIndices;
  const newIdxAcc = doc.createAccessor()
    .setType('SCALAR')
    .setArray(finalIndices);
  prim.setIndices(newIdxAcc);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  await MeshoptSimplifier.ready;
  console.log('meshoptimizer WASM ready\n');

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.glb'));

  for (const file of files) {
    const lodLevels = TARGETS[file];
    if (!lodLevels) {
      console.log(`Skipping ${file} (no target config)`);
      continue;
    }

    const inputPath = path.join(INPUT_DIR, file);
    const inputSize = fs.statSync(inputPath).size;
    console.log(`\n=== ${file} (${(inputSize / 1024 / 1024).toFixed(1)} MB) — ${lodLevels.length} LOD level(s) ===`);

    for (const { suffix, ratio, keepTextures } of lodLevels) {
      try {
        const document = await io.read(inputPath);
        const root = document.getRoot();

        let origTris = 0;
        for (const mesh of root.listMeshes()) {
          for (const prim of mesh.listPrimitives()) {
            const ia = prim.getIndices();
            if (ia) origTris += ia.getCount() / 3;
          }
        }

        let newTris = 0;
        for (const mesh of root.listMeshes()) {
          for (const prim of mesh.listPrimitives()) {
            const posAcc = prim.getAttribute('POSITION');
            const idxAcc = prim.getIndices();
            if (!posAcc || !idxAcc) continue;

            const newIndices = simplifyPrimitive(posAcc, idxAcc, ratio);

            const newIdxAcc = document.createAccessor()
              .setType('SCALAR')
              .setArray(newIndices);
            prim.setIndices(newIdxAcc);

            compactPrimitive(prim, document);

            const finalIdx = prim.getIndices();
            if (finalIdx) newTris += finalIdx.getCount() / 3;
          }
        }

        if (!keepTextures) {
          for (const texture of root.listTextures()) {
            texture.dispose();
          }
          for (const material of root.listMaterials()) {
            material.setBaseColorTexture(null);
            material.setNormalTexture(null);
            material.setOcclusionTexture(null);
            material.setEmissiveTexture(null);
            material.setMetallicRoughnessTexture(null);
          }
        }

        // Prune orphaned accessors, buffers, etc (critical for file size)
        await document.transform(
          (doc) => { doc.getRoot().listAccessors().forEach(a => { if (a.listParents().length <= 1) a.dispose(); }); },
          (doc) => { doc.getRoot().listBuffers().forEach(b => { if (b.listParents().length <= 1) b.dispose(); }); },
        );

        const baseName = file.replace('.glb', '');
        const outPath = path.join(OUTPUT_DIR, `${baseName}_${suffix}.glb`);
        await io.write(outPath, document);

        const outSize = fs.statSync(outPath).size;
        const pct = Math.round((1 - outSize / inputSize) * 100);
        const triPct = Math.round(newTris / origTris * 100);
        console.log(`  ${suffix}: ${origTris.toLocaleString()} -> ${newTris.toLocaleString()} tris (${triPct}%) | ${(outSize / 1024 / 1024).toFixed(1)} MB (-${pct}%)`);
      } catch (err) {
        console.error(`  ERROR on ${suffix}:`, err.message);
        console.error(err.stack);
      }
    }
  }

  console.log('\n=== Done! ===');
  const optFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.glb'));
  let optTotal = 0;
  optFiles.forEach(f => {
    const size = fs.statSync(path.join(OUTPUT_DIR, f)).size;
    optTotal += size;
    console.log(`  ${f}: ${(size / 1024 / 1024).toFixed(1)} MB`);
  });
  console.log(`\nTotal optimized: ${(optTotal / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
