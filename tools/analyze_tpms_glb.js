#!/usr/bin/env node
/*
  Analyze a GLB and test whether its mesh lies near the Schwarz (Schwarz) Diamond TPMS field.

  Usage:
    node tools/analyze_tpms_glb.js /var/www/kensgames.com/4dtictactoe/assets/models/connect4.glb

  Output:
    - Mesh/primitives/vertex counts
    - Bounds
    - Best-fit (freq + phase offsets) for diamond field on normalized coords
    - Error stats: mean |D|, p50/p90/p99 |D|, %(|D|<eps)
    - Gradient magnitude stats ("bandwidth") on the same fit
*/

'use strict';

const fs = require('fs');
const path = require('path');

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node tools/analyze_tpms_glb.js <path/to/model.glb> [--dumpAtlas <out.json>] [--gridDivs N] [--maxCells N] [--atlasOnly]');
  process.exit(2);
}

function readU32LE(buf, offset) { return buf.readUInt32LE(offset); }

function parseGLB(glbBuf) {
  if (glbBuf.length < 12) throw new Error('File too small for GLB header');
  const magic = glbBuf.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error(`Not a GLB (magic=${magic})`);
  const version = readU32LE(glbBuf, 4);
  const length = readU32LE(glbBuf, 8);
  if (length !== glbBuf.length) {
    // Some exporters lie; tolerate if buffer is at least the claimed length.
    if (glbBuf.length < length) throw new Error(`GLB length mismatch header=${length} actual=${glbBuf.length}`);
  }

  let offset = 12;
  let json = null;
  let binChunk = null;

  while (offset + 8 <= glbBuf.length) {
    const chunkLength = readU32LE(glbBuf, offset);
    const chunkType = glbBuf.toString('ascii', offset + 4, offset + 8);
    offset += 8;
    const chunkData = glbBuf.slice(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === 'JSON') {
      const jsonText = chunkData.toString('utf8');
      json = JSON.parse(jsonText);
    } else if (chunkType === 'BIN\u0000') {
      binChunk = chunkData;
    }
  }

  if (!json) throw new Error('Missing JSON chunk');
  if (!binChunk) throw new Error('Missing BIN chunk');
  return { json, bin: binChunk };
}

const COMPONENT_TYPE_BYTES = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function getAccessorData(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Missing bufferView ${accessor.bufferView} for accessor ${accessorIndex}`);
  if ((bufferView.buffer ?? 0) !== 0) throw new Error('Only single-buffer GLB supported');

  const componentBytes = COMPONENT_TYPE_BYTES[accessor.componentType];
  if (!componentBytes) throw new Error(`Unsupported componentType ${accessor.componentType}`);
  const numComponents = TYPE_COMPONENTS[accessor.type];
  if (!numComponents) throw new Error(`Unsupported accessor type ${accessor.type}`);

  const count = accessor.count;
  const accessorByteOffset = accessor.byteOffset ?? 0;
  const viewByteOffset = bufferView.byteOffset ?? 0;
  const baseOffset = viewByteOffset + accessorByteOffset;
  const byteStride = bufferView.byteStride ?? (componentBytes * numComponents);

  const totalBytesNeeded = baseOffset + (count - 1) * byteStride + componentBytes * numComponents;
  if (totalBytesNeeded > bin.length) throw new Error('Accessor reads past BIN chunk');

  return { accessor, bufferView, baseOffset, count, byteStride, componentBytes, numComponents };
}

function readAccessorToFloatArray(gltf, bin, accessorIndex) {
  const info = getAccessorData(gltf, bin, accessorIndex);
  const { accessor, baseOffset, count, byteStride, componentBytes, numComponents } = info;

  if (accessor.componentType !== 5126) {
    throw new Error(`Expected FLOAT (5126) accessor for positions; got ${accessor.componentType}`);
  }

  const out = new Float32Array(count * numComponents);
  for (let i = 0; i < count; i++) {
    const off = baseOffset + i * byteStride;
    for (let c = 0; c < numComponents; c++) {
      out[i * numComponents + c] = bin.readFloatLE(off + c * componentBytes);
    }
  }
  return out;
}

function readIndicesToUintArray(gltf, bin, accessorIndex) {
  const info = getAccessorData(gltf, bin, accessorIndex);
  const { accessor, baseOffset, count, byteStride, componentBytes } = info;

  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const off = baseOffset + i * byteStride;
    let v;
    switch (accessor.componentType) {
      case 5121: v = bin.readUInt8(off); break;
      case 5123: v = bin.readUInt16LE(off); break;
      case 5125: v = bin.readUInt32LE(off); break;
      default: throw new Error(`Unsupported indices componentType ${accessor.componentType}`);
    }
    out[i] = v;
  }
  return out;
}

function boundsOfPositions(pos) {
  const b = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i + 0], y = pos[i + 1], z = pos[i + 2];
    if (x < b.min.x) b.min.x = x;
    if (y < b.min.y) b.min.y = y;
    if (z < b.min.z) b.min.z = z;
    if (x > b.max.x) b.max.x = x;
    if (y > b.max.y) b.max.y = y;
    if (z > b.max.z) b.max.z = z;
  }
  return b;
}

// ─────────────────────────────────────────────────────────────────────────────
// TPMS field library
//
// Note: There are multiple "Diamond" approximations in the wild.
// We test several common implicit fields and pick the best fit.
// All fields below use x,y,z in *radians*.
//
// We pass lattice coords (px,py,pz; period=1) and multiply by 2π.
// Gradients returned are w.r.t lattice coords (so we include the 2π factor).
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = {
  // The "diamond" field used in Starfighter manifold code.
  diamond_star: {
    name: 'diamond_star (coscoscos - sinsinsin)',
    value(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      return Math.cos(x) * Math.cos(y) * Math.cos(z) - Math.sin(x) * Math.sin(y) * Math.sin(z);
    },
    grad(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      const cx = Math.cos(x), sx = Math.sin(x);
      const cy = Math.cos(y), sy = Math.sin(y);
      const cz = Math.cos(z), sz = Math.sin(z);
      return {
        x: TWO_PI * (-sx * cy * cz - cx * sy * sz),
        y: TWO_PI * (-cx * sy * cz - sx * cy * sz),
        z: TWO_PI * (-cx * cy * sz - sx * sy * cz),
      };
    },
  },

  // Common "Diamond" approximation (one of the standard TPMS formulas used in practice).
  // D = sinx siny sinz + sinx cosy cosz + cosx siny cosz + cosx cosy sinz
  diamond_std: {
    name: 'diamond_std (sin-sum form)',
    value(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      const sx = Math.sin(x), cx = Math.cos(x);
      const sy = Math.sin(y), cy = Math.cos(y);
      const sz = Math.sin(z), cz = Math.cos(z);
      return (sx * sy * sz) + (sx * cy * cz) + (cx * sy * cz) + (cx * cy * sz);
    },
    grad(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      const sx = Math.sin(x), cx = Math.cos(x);
      const sy = Math.sin(y), cy = Math.cos(y);
      const sz = Math.sin(z), cz = Math.cos(z);
      // d/dx
      const dx = (cx * sy * sz) + (cx * cy * cz) + (-sx * sy * cz) + (-sx * cy * sz);
      // d/dy
      const dy = (sx * cy * sz) + (sx * -sy * cz) + (cx * cy * cz) + (cx * -sy * sz);
      // d/dz
      const dz = (sx * sy * cz) + (sx * cy * -sz) + (cx * sy * -sz) + (cx * cy * cz);
      return { x: TWO_PI * dx, y: TWO_PI * dy, z: TWO_PI * dz };
    },
  },

  // Schwarz P minimal surface approximation.
  schwarz_p: {
    name: 'schwarz_p (cosx + cosy + cosz)',
    value(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      return Math.cos(x) + Math.cos(y) + Math.cos(z);
    },
    grad(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      return {
        x: TWO_PI * (-Math.sin(x)),
        y: TWO_PI * (-Math.sin(y)),
        z: TWO_PI * (-Math.sin(z)),
      };
    },
  },

  // Gyroid minimal surface.
  gyroid: {
    name: 'gyroid (sinx cosy + siny cosz + sinz cosx)',
    value(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      return Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
    },
    grad(px, py, pz) {
      const TWO_PI = Math.PI * 2;
      const x = px * TWO_PI;
      const y = py * TWO_PI;
      const z = pz * TWO_PI;
      const sx = Math.sin(x), cx = Math.cos(x);
      const sy = Math.sin(y), cy = Math.cos(y);
      const sz = Math.sin(z), cz = Math.cos(z);
      const dx = (cx * cy) + (sz * -sx);
      const dy = (sx * -sy) + (cy * cz);
      const dz = (sy * -sz) + (cz * cx);
      return { x: TWO_PI * dx, y: TWO_PI * dy, z: TWO_PI * dz };
    },
  },
};

function quantiles(sorted, qs) {
  const n = sorted.length;
  const out = {};
  for (const q of qs) {
    const idx = Math.max(0, Math.min(n - 1, Math.round(q * (n - 1))));
    out[q] = sorted[idx];
  }
  return out;
}

function stats(values) {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / (values.length || 1);
  const sorted = Array.from(values).sort((a, b) => a - b);
  const q = quantiles(sorted, [0.5, 0.9, 0.99]);
  return { min, max, mean, p50: q[0.5], p90: q[0.9], p99: q[0.99] };
}

function evaluateFit(pos, bounds, fit, fieldKey = 'diamond_star') {
  const sizeX = (bounds.max.x - bounds.min.x) || 1;
  const sizeY = (bounds.max.y - bounds.min.y) || 1;
  const sizeZ = (bounds.max.z - bounds.min.z) || 1;

  const field = FIELDS[fieldKey];
  if (!field) throw new Error(`Unknown fieldKey: ${fieldKey}`);

  const absD = new Float32Array(pos.length / 3);
  const signedD = new Float32Array(pos.length / 3);
  const gradMag = new Float32Array(pos.length / 3);

  const eps = [0.02, 0.05, 0.1, 0.2];
  const epsCount = new Uint32Array(eps.length);

  for (let i = 0, vi = 0; i < pos.length; i += 3, vi++) {
    const x = pos[i + 0];
    const y = pos[i + 1];
    const z = pos[i + 2];

    const nx = ((x - bounds.min.x) / sizeX) * fit.freq + fit.phaseX;
    const ny = ((y - bounds.min.y) / sizeY) * fit.freq + fit.phaseY;
    const nz = ((z - bounds.min.z) / sizeZ) * fit.freq + fit.phaseZ;

    const D = field.value(nx, ny, nz);
    const aD = Math.abs(D);
    absD[vi] = aD;
    signedD[vi] = D;
    for (let ei = 0; ei < eps.length; ei++) {
      if (aD < eps[ei]) epsCount[ei]++;
    }

    const g = field.grad(nx, ny, nz);
    gradMag[vi] = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
  }

  return {
    absD,
    signedD,
    gradMag,
    within: eps.map((e, i) => ({ eps: e, frac: epsCount[i] / (absD.length || 1) })),
  };
}

function subsampleNormalized(pos, bounds, targetCount) {
  const sizeX = (bounds.max.x - bounds.min.x) || 1;
  const sizeY = (bounds.max.y - bounds.min.y) || 1;
  const sizeZ = (bounds.max.z - bounds.min.z) || 1;
  const vertCount = Math.floor(pos.length / 3);
  const count = Math.min(Math.max(1, targetCount | 0), vertCount);

  // Deterministic stride sampling (stable across runs).
  const stride = Math.max(1, Math.floor(vertCount / count));
  const out = new Float32Array(count * 3);
  let w = 0;
  for (let i = 0, picked = 0; i < vertCount && picked < count; i += stride, picked++) {
    const o = i * 3;
    out[w++] = (pos[o + 0] - bounds.min.x) / sizeX;
    out[w++] = (pos[o + 1] - bounds.min.y) / sizeY;
    out[w++] = (pos[o + 2] - bounds.min.z) / sizeZ;
  }

  // If stride math under-filled due to rounding, pad from tail.
  while (w < out.length) {
    const i = vertCount - 1 - Math.floor((out.length - w) / 3);
    const o = Math.max(0, i) * 3;
    out[w++] = (pos[o + 0] - bounds.min.x) / sizeX;
    out[w++] = (pos[o + 1] - bounds.min.y) / sizeY;
    out[w++] = (pos[o + 2] - bounds.min.z) / sizeZ;
  }
  return out;
}

function evaluateFitOnNormalized(normalizedXYZ, fit, fieldKey = 'diamond_star') {
  const field = FIELDS[fieldKey];
  if (!field) throw new Error(`Unknown fieldKey: ${fieldKey}`);

  const absD = new Float32Array(normalizedXYZ.length / 3);
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0, vi = 0; i < normalizedXYZ.length; i += 3, vi++) {
    const nx = normalizedXYZ[i + 0] * fit.freq + fit.phaseX;
    const ny = normalizedXYZ[i + 1] * fit.freq + fit.phaseY;
    const nz = normalizedXYZ[i + 2] * fit.freq + fit.phaseZ;
    const aD = Math.abs(field.value(nx, ny, nz));
    absD[vi] = aD;
    sum += aD;
    if (aD < min) min = aD;
    if (aD > max) max = aD;
  }

  const mean = sum / (absD.length || 1);
  // For scoring we only need the mean. Quantiles are computed for the best fit later.
  return { absD, mean, min, max };
}

function findBestFieldFit(pos, bounds, fieldKey, opts = {}) {
  // Try a discrete search over (freq, phase offsets) to see if the mesh
  // aligns to the diamond level set within the unit cube.
  const freqCandidates = opts.freqCandidates ?? [1, 2, 3, 4, 5, 6, 8];
  const phaseCandidates = opts.phaseCandidates ?? [0.0, 0.25, 0.5, 0.75];
  const sampleCount = opts.sampleCount ?? 50000;

  const normalizedSample = subsampleNormalized(pos, bounds, sampleCount);

  let best = null;
  for (const freq of freqCandidates) {
    for (const phaseX of phaseCandidates) {
      for (const phaseY of phaseCandidates) {
        for (const phaseZ of phaseCandidates) {
          const fit = { freq, phaseX, phaseY, phaseZ };
          const ev = evaluateFitOnNormalized(normalizedSample, fit, fieldKey);
          const score = ev.mean;
          if (!best || score < best.score) {
            best = { fit, score, sampleMeanAbsD: ev.mean };
          }
        }
      }
    }
  }

  // Compute richer stats for the best fit using the sample set.
  const bestEval = evaluateFitOnNormalized(normalizedSample, best.fit, fieldKey);
  best.st = stats(bestEval.absD);
  best.sampleCount = Math.floor(normalizedSample.length / 3);
  best.fieldKey = fieldKey;
  return best;
}

function summarizeGLTF(gltf) {
  const scenes = gltf.scenes?.length ?? 0;
  const nodes = gltf.nodes?.length ?? 0;
  const meshes = gltf.meshes?.length ?? 0;
  const materials = gltf.materials?.length ?? 0;
  const accessors = gltf.accessors?.length ?? 0;
  const bufferViews = gltf.bufferViews?.length ?? 0;
  const images = gltf.images?.length ?? 0;
  const textures = gltf.textures?.length ?? 0;
  return { scenes, nodes, meshes, materials, accessors, bufferViews, images, textures };
}

// ─────────────────────────────────────────────────────────────────────────────
// Piecewise saddle analysis (local z=xy patches)
//
// Goal: detect whether the mesh is assembled from many rotated hyperbolic
// paraboloid pieces (Blender "z=xy" surface primitive approach).
//
// We grid-segment space, do a lightweight PCA per occupied cell to get a local
// coordinate frame (u,v,w), then least-squares fit:
//   w = a*(u*v) + b*u + c*v + d
// and report residual stats across patches.
//
// This is intentionally tolerant: even if the mesh is thickened walls, many
// local neighborhoods should still be well-approximated by a saddle heightfield.
// ─────────────────────────────────────────────────────────────────────────────

function mulMat3Vec3(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function norm3(a) { return Math.sqrt(dot3(a, a)); }
function normalize3(a) {
  const n = norm3(a) || 1;
  return { x: a.x / n, y: a.y / n, z: a.z / n };
}
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function covariance3(points) {
  // points: array of {x,y,z} in local cell
  let cx = 0, cy = 0, cz = 0;
  const n = points.length || 1;
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= n; cy /= n; cz /= n;

  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) {
    const x = p.x - cx;
    const y = p.y - cy;
    const z = p.z - cz;
    xx += x * x;
    xy += x * y;
    xz += x * z;
    yy += y * y;
    yz += y * z;
    zz += z * z;
  }
  const inv = 1 / n;
  return {
    mean: { x: cx, y: cy, z: cz },
    C: [
      xx * inv, xy * inv, xz * inv,
      xy * inv, yy * inv, yz * inv,
      xz * inv, yz * inv, zz * inv,
    ],
  };
}

function powerIter3(C, iters = 18) {
  // C is 3x3 row-major
  let v = normalize3({ x: 0.577, y: 0.577, z: 0.577 });
  for (let i = 0; i < iters; i++) {
    const w = mulMat3Vec3(C, v);
    v = normalize3(w);
  }
  const Cv = mulMat3Vec3(C, v);
  const lambda = dot3(v, Cv);
  return { v, lambda };
}

function deflate3(C, v, lambda) {
  // C' = C - lambda * v v^T
  const vx = v.x, vy = v.y, vz = v.z;
  const vvT = [
    vx * vx, vx * vy, vx * vz,
    vy * vx, vy * vy, vy * vz,
    vz * vx, vz * vy, vz * vz,
  ];
  const out = new Array(9);
  for (let i = 0; i < 9; i++) out[i] = C[i] - lambda * vvT[i];
  return out;
}

function pcaFrame(points) {
  // Returns orthonormal basis e1,e2,e3 where e1 is largest-variance direction,
  // e3 is smallest-variance (normal-ish) direction.
  const { mean, C } = covariance3(points);
  const e1 = powerIter3(C);
  const C2 = deflate3(C, e1.v, e1.lambda);
  const e2 = powerIter3(C2);
  let v3 = cross3(e1.v, e2.v);
  v3 = normalize3(v3);

  // Ensure right-handed and stable.
  const e3 = v3;
  const e2o = normalize3(cross3(e3, e1.v));
  return { mean, e1: e1.v, e2: e2o, e3 };
}

function solve4(A, b) {
  // Gaussian elimination for 4x4.
  const M = [
    [A[0][0], A[0][1], A[0][2], A[0][3], b[0]],
    [A[1][0], A[1][1], A[1][2], A[1][3], b[1]],
    [A[2][0], A[2][1], A[2][2], A[2][3], b[2]],
    [A[3][0], A[3][1], A[3][2], A[3][3], b[3]],
  ];

  for (let col = 0; col < 4; col++) {
    // pivot
    let pivot = col;
    for (let r = col + 1; r < 4; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    const div = M[col][col];
    for (let c = col; c < 5; c++) M[col][c] /= div;
    for (let r = 0; r < 4; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c < 5; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return [M[0][4], M[1][4], M[2][4], M[3][4]];
}

function solveN(AN, bN) {
  // Generic Gaussian elimination for NxN.
  const n = bN.length;
  const M = new Array(n);
  for (let r = 0; r < n; r++) {
    M[r] = new Array(n + 1);
    for (let c = 0; c < n; c++) M[r][c] = AN[r][c];
    M[r][n] = bN[r];
  }

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    const div = M[col][col];
    for (let c = col; c < n + 1; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c < n + 1; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = M[i][n];
  return out;
}

function fitSaddleHeightfield(points, frame) {
  // points: array of {x,y,z}
  // frame: {mean,e1,e2,e3}
  // Returns coefficients [a,b,c,d] for w=a*u*v+b*u+c*v+d in the local frame.
  // Least squares on design matrix columns: [u*v, u, v, 1]

  let s00 = 0, s01 = 0, s02 = 0, s03 = 0;
  let s11 = 0, s12 = 0, s13 = 0;
  let s22 = 0, s23 = 0;
  let s33 = 0;
  let t0 = 0, t1 = 0, t2 = 0, t3 = 0;

  let wMin = Infinity, wMax = -Infinity;

  for (const p of points) {
    const q = { x: p.x - frame.mean.x, y: p.y - frame.mean.y, z: p.z - frame.mean.z };
    const u = dot3(q, frame.e1);
    const v = dot3(q, frame.e2);
    const w = dot3(q, frame.e3);
    const x0 = u * v;
    const x1 = u;
    const x2 = v;
    const x3 = 1;

    s00 += x0 * x0;
    s01 += x0 * x1;
    s02 += x0 * x2;
    s03 += x0 * x3;
    s11 += x1 * x1;
    s12 += x1 * x2;
    s13 += x1 * x3;
    s22 += x2 * x2;
    s23 += x2 * x3;
    s33 += x3 * x3;

    t0 += x0 * w;
    t1 += x1 * w;
    t2 += x2 * w;
    t3 += x3 * w;

    if (w < wMin) wMin = w;
    if (w > wMax) wMax = w;
  }

  const A = [
    [s00, s01, s02, s03],
    [s01, s11, s12, s13],
    [s02, s12, s22, s23],
    [s03, s13, s23, s33],
  ];
  const b = [t0, t1, t2, t3];
  const coeffs = solve4(A, b);
  if (!coeffs) return null;
  return { coeffs, wRange: (wMax - wMin) || 1e-9 };
}

function fitQuadraticHeightfield(points, frame) {
  // w = A*(u*v) + B*u^2 + C*v^2 + D*u + E*v + F
  // basis: [u*v, u^2, v^2, u, v, 1]
  let S = Array.from({ length: 6 }, () => new Array(6).fill(0));
  let t = new Array(6).fill(0);

  let wMin = Infinity, wMax = -Infinity;

  for (const p of points) {
    const q = { x: p.x - frame.mean.x, y: p.y - frame.mean.y, z: p.z - frame.mean.z };
    const u = dot3(q, frame.e1);
    const v = dot3(q, frame.e2);
    const w = dot3(q, frame.e3);
    const x = [u * v, u * u, v * v, u, v, 1];

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) S[i][j] += x[i] * x[j];
      t[i] += x[i] * w;
    }

    if (w < wMin) wMin = w;
    if (w > wMax) wMax = w;
  }

  const coeffs = solveN(S, t);
  if (!coeffs) return null;
  return { coeffs, wRange: (wMax - wMin) || 1e-9 };
}

function saddleResidualStats(points, frame, coeffs) {
  const [a, b, c, d] = coeffs;
  const absErr = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = { x: p.x - frame.mean.x, y: p.y - frame.mean.y, z: p.z - frame.mean.z };
    const u = dot3(q, frame.e1);
    const v = dot3(q, frame.e2);
    const w = dot3(q, frame.e3);
    const wHat = a * (u * v) + b * u + c * v + d;
    absErr[i] = Math.abs(wHat - w);
  }
  return stats(absErr);
}

function quadResidualStats(points, frame, coeffs) {
  const [A, B, C, D, E, F] = coeffs;
  const absErr = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = { x: p.x - frame.mean.x, y: p.y - frame.mean.y, z: p.z - frame.mean.z };
    const u = dot3(q, frame.e1);
    const v = dot3(q, frame.e2);
    const w = dot3(q, frame.e3);
    const wHat = A * (u * v) + B * (u * u) + C * (v * v) + D * u + E * v + F;
    absErr[i] = Math.abs(wHat - w);
  }
  return stats(absErr);
}

function piecewiseSaddleAnalysis(pos, bounds, opts = {}) {
  const vertCount = Math.floor(pos.length / 3);
  const patchTarget = opts.patchTarget ?? 6000;
  const minPoints = opts.minPoints ?? 400;
  const maxPoints = opts.maxPoints ?? 2500;
  const maxCells = opts.maxCells ?? 250;
  const collect = !!opts.collect;

  const gridDivs = opts.gridDivs ?? Math.max(4, Math.min(18, Math.ceil(Math.cbrt(vertCount / patchTarget))));
  const sizeX = (bounds.max.x - bounds.min.x) || 1;
  const sizeY = (bounds.max.y - bounds.min.y) || 1;
  const sizeZ = (bounds.max.z - bounds.min.z) || 1;
  const cellDx = sizeX / gridDivs;
  const cellDy = sizeY / gridDivs;
  const cellDz = sizeZ / gridDivs;

  const cells = new Map();
  for (let i = 0; i < vertCount; i++) {
    const o = i * 3;
    const nx = (pos[o + 0] - bounds.min.x) / sizeX;
    const ny = (pos[o + 1] - bounds.min.y) / sizeY;
    const nz = (pos[o + 2] - bounds.min.z) / sizeZ;
    const cx = Math.max(0, Math.min(gridDivs - 1, Math.floor(nx * gridDivs)));
    const cy = Math.max(0, Math.min(gridDivs - 1, Math.floor(ny * gridDivs)));
    const cz = Math.max(0, Math.min(gridDivs - 1, Math.floor(nz * gridDivs)));
    const key = `${cx},${cy},${cz}`;
    let arr = cells.get(key);
    if (!arr) { arr = []; cells.set(key, arr); }
    arr.push({ x: pos[o + 0], y: pos[o + 1], z: pos[o + 2] });
  }

  const saddlePatchErr = [];
  const saddlePatchErrNorm = [];
  const quadPatchErr = [];
  const quadPatchErrNorm = [];
  const saddleA = [];
  const quadUV = [];
  const patches = collect ? [] : null;
  let analyzed = 0;
  let skipped = 0;

  // Analyze densest cells first (they tend to represent continuous sheets).
  const cellList = Array.from(cells.entries())
    .map(([key, pts]) => ({ key, pts }))
    .sort((a, b) => b.pts.length - a.pts.length);

  for (let ci = 0; ci < cellList.length && analyzed < maxCells; ci++) {
    const { key, pts } = cellList[ci];
    if (pts.length < minPoints) { skipped++; continue; }
    // Deterministic downsample per patch.
    const stride = Math.max(1, Math.floor(pts.length / maxPoints));
    const sampled = [];
    for (let i = 0; i < pts.length && sampled.length < maxPoints; i += stride) sampled.push(pts[i]);
    if (sampled.length < minPoints) { skipped++; continue; }

    const frame = pcaFrame(sampled);
    const fitS = fitSaddleHeightfield(sampled, frame);
    const fitQ = fitQuadraticHeightfield(sampled, frame);
    if (!fitS || !fitQ) { skipped++; continue; }

    const stS = saddleResidualStats(sampled, frame, fitS.coeffs);
    saddlePatchErr.push(stS.mean);
    saddlePatchErrNorm.push(stS.mean / fitS.wRange);
    saddleA.push(fitS.coeffs[0]);

    const stQ = quadResidualStats(sampled, frame, fitQ.coeffs);
    quadPatchErr.push(stQ.mean);
    quadPatchErrNorm.push(stQ.mean / fitQ.wRange);
    quadUV.push(fitQ.coeffs[0]);

    if (patches) {
      const parts = key.split(',');
      const cx = parseInt(parts[0], 10);
      const cy = parseInt(parts[1], 10);
      const cz = parseInt(parts[2], 10);
      const cellMin = { x: bounds.min.x + cx * cellDx, y: bounds.min.y + cy * cellDy, z: bounds.min.z + cz * cellDz };
      const cellMax = { x: cellMin.x + cellDx, y: cellMin.y + cellDy, z: cellMin.z + cellDz };
      const cellCenter = { x: (cellMin.x + cellMax.x) / 2, y: (cellMin.y + cellMax.y) / 2, z: (cellMin.z + cellMax.z) / 2 };
      patches.push({
        cell: { key, cx, cy, cz, min: cellMin, max: cellMax, center: cellCenter },
        sampleCount: sampled.length,
        frame: {
          mean: frame.mean,
          e1: frame.e1,
          e2: frame.e2,
          e3: frame.e3,
        },
        saddle: {
          coeffs: { a: fitS.coeffs[0], b: fitS.coeffs[1], c: fitS.coeffs[2], d: fitS.coeffs[3] },
          wRange: fitS.wRange,
          meanAbsErr: stS.mean,
          meanAbsErrNorm: stS.mean / fitS.wRange,
        },
        quad: {
          coeffs: { A: fitQ.coeffs[0], B: fitQ.coeffs[1], C: fitQ.coeffs[2], D: fitQ.coeffs[3], E: fitQ.coeffs[4], F: fitQ.coeffs[5] },
          wRange: fitQ.wRange,
          meanAbsErr: stQ.mean,
          meanAbsErrNorm: stQ.mean / fitQ.wRange,
        },
      });
    }
    analyzed++;
  }

  return {
    gridDivs,
    totalCells: cells.size,
    analyzed,
    skipped,
    maxCells,
    saddleMeanAbsErr: stats(saddlePatchErr),
    saddleMeanAbsErrNorm: stats(saddlePatchErrNorm),
    saddle_aCoeff: stats(saddleA),
    quadMeanAbsErr: stats(quadPatchErr),
    quadMeanAbsErrNorm: stats(quadPatchErrNorm),
    quad_uvCoeff: stats(quadUV),
    patches,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) usageAndExit();

  const flagsWithValues = new Set(['--dumpAtlas', '--gridDivs', '--maxCells']);
  const skipIndex = new Set();
  for (let i = 0; i < args.length; i++) {
    if (flagsWithValues.has(args[i])) skipIndex.add(i + 1);
  }
  const glbPath = args.find((a, i) => !a.startsWith('--') && !skipIndex.has(i));
  if (!glbPath) usageAndExit();

  function readArgValue(flag, def = null) {
    const i = args.indexOf(flag);
    if (i === -1) return def;
    return args[i + 1] ?? def;
  }

  const dumpAtlasPath = readArgValue('--dumpAtlas', null);
  const gridDivsArg = readArgValue('--gridDivs', null);
  const maxCellsArg = readArgValue('--maxCells', null);
  const gridDivs = gridDivsArg ? Math.max(2, Math.min(40, parseInt(gridDivsArg, 10) || 12)) : 12;
  const maxCells = maxCellsArg ? Math.max(1, Math.min(5000, parseInt(maxCellsArg, 10) || 250)) : 250;
  const atlasOnly = args.includes('--atlasOnly');
  const abs = path.resolve(glbPath);
  if (!fs.existsSync(abs)) usageAndExit(`File not found: ${abs}`);

  const glbBuf = fs.readFileSync(abs);
  const { json: gltf, bin } = parseGLB(glbBuf);

  if (!atlasOnly) {
    console.log('--- GLB Summary ---');
    console.log('file:', abs);
    console.log('bytes:', glbBuf.length);
    console.log('gltf:', summarizeGLTF(gltf));
  }

  let totalVerts = 0;
  let totalTris = 0;
  const primitiveSummaries = [];

  const meshes = gltf.meshes ?? [];
  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi];
    const prims = mesh.primitives ?? [];
    for (let pi = 0; pi < prims.length; pi++) {
      const prim = prims[pi];
      const posAcc = prim.attributes?.POSITION;
      if (posAcc === undefined) continue;
      const positions = readAccessorToFloatArray(gltf, bin, posAcc);
      totalVerts += positions.length / 3;

      let tris = 0;
      if (prim.indices !== undefined) {
        const indices = readIndicesToUintArray(gltf, bin, prim.indices);
        tris = Math.floor(indices.length / 3);
      } else {
        tris = Math.floor((positions.length / 3) / 3);
      }
      totalTris += tris;

      primitiveSummaries.push({ mesh: mi, prim: pi, mode: prim.mode ?? 4, verts: positions.length / 3, tris });
    }
  }

  if (!atlasOnly) {
    console.log('primitives:', primitiveSummaries.length);
    if (primitiveSummaries.length <= 12) console.log('primitive list:', primitiveSummaries);
    console.log('total verts:', totalVerts);
    console.log('total tris:', totalTris);
  }

  // For the TPMS test, gather all POSITION accessors across all primitives and concatenate.
  const allPositions = [];
  for (const ps of primitiveSummaries) {
    const prim = gltf.meshes[ps.mesh].primitives[ps.prim];
    const posAcc = prim.attributes.POSITION;
    const positions = readAccessorToFloatArray(gltf, bin, posAcc);
    allPositions.push(positions);
  }

  const mergedLen = allPositions.reduce((n, a) => n + a.length, 0);
  const merged = new Float32Array(mergedLen);
  let w = 0;
  for (const a of allPositions) { merged.set(a, w); w += a.length; }

  const b = boundsOfPositions(merged);
  if (!atlasOnly) console.log('bounds:', b);

  let best = null;
  let errStats = null;
  if (!atlasOnly) {
    console.log('--- TPMS Fit (coarse search over several fields) ---');
    const fits = [];
    for (const fieldKey of Object.keys(FIELDS)) {
      const bestFit = findBestFieldFit(merged, b, fieldKey, { sampleCount: 30000 });
      fits.push(bestFit);
    }
    fits.sort((a, b) => a.score - b.score);
    best = fits[0];
    console.log('field ranking (lower mean|D| is better):');
    for (const f of fits) {
      const name = FIELDS[f.fieldKey]?.name ?? f.fieldKey;
      console.log(`- ${f.fieldKey}: mean|D|=${f.score.toFixed(6)} (freq=${f.fit.freq}, phase=[${f.fit.phaseX},${f.fit.phaseY},${f.fit.phaseZ}]) :: ${name}`);
    }
    console.log('best overall:', {
      fieldKey: best.fieldKey,
      fieldName: FIELDS[best.fieldKey]?.name,
      ...best.fit,
      scoreMeanAbsD: best.score,
      sampleCount: best.sampleCount,
      ...best.st,
    });

    console.log('--- Field Error + Bandwidth (on best fit, full mesh) ---');
    const evalBest = evaluateFit(merged, b, best.fit, best.fieldKey);
    errStats = stats(evalBest.absD);
    const signedStats = stats(evalBest.signedD);
    const gradStats = stats(evalBest.gradMag);

    console.log('abs(D) stats:', errStats);
    console.log('signed D stats:', signedStats);
    console.log('grad|∇D| stats:', gradStats);
    console.log('within eps:', evalBest.within);

    // Quick interpretation message
    const fracNear = evalBest.within.find(w => w.eps === 0.1)?.frac ?? 0;
    if (fracNear > 0.7) {
      console.log('interpretation: STRONG alignment to D(x,y,z)≈0 (mesh likely is a Schwarz Diamond wall surface).');
    } else if (fracNear > 0.35) {
      console.log('interpretation: MODERATE alignment (mesh may be a thickened/offset surface or a stylized diamond lattice).');
    } else {
      console.log('interpretation: WEAK alignment (mesh likely not directly the D=0 surface, or needs finer fit search).');
    }
  }

  if (!atlasOnly) console.log('--- Piecewise Saddle (z≈u·v) Patch Fit ---');
  const saddle = piecewiseSaddleAnalysis(merged, b, {
    gridDivs,
    patchTarget: 1500,
    minPoints: 250,
    maxPoints: 1500,
    maxCells,
    collect: !!dumpAtlasPath,
  });
  if (!atlasOnly) {
    console.log('saddle fit summary:', saddle);
    console.log('interpretation guide: low meanAbsErrNorm (e.g. <0.05) indicates local patches behave like rotated z=xy primitives.');
  }

  if (dumpAtlasPath) {
    const out = {
      source: abs,
      glbBytes: glbBuf.length,
      bounds: b,
      bestTpmsFit: (!atlasOnly && best && errStats) ? {
        fieldKey: best.fieldKey,
        fieldName: FIELDS[best.fieldKey]?.name,
        fit: best.fit,
        meanAbsD: errStats.mean,
      } : null,
      patchAtlas: {
        gridDivs: saddle.gridDivs,
        totalCells: saddle.totalCells,
        analyzed: saddle.analyzed,
        maxCells: saddle.maxCells,
        quadMeanAbsErrNorm: saddle.quadMeanAbsErrNorm,
        saddleMeanAbsErrNorm: saddle.saddleMeanAbsErrNorm,
        patches: saddle.patches ?? [],
      },
    };
    fs.writeFileSync(dumpAtlasPath, JSON.stringify(out, null, 2));
    if (!atlasOnly) console.log('atlas written:', dumpAtlasPath);
  }
}

try {
  main();
} catch (err) {
  console.error('ERROR:', err && err.stack ? err.stack : err);
  process.exit(1);
}
