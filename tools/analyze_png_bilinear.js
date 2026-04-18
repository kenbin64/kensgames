#!/usr/bin/env node
/*
  PNG "manifold" analysis: approximate an image as an adaptive quadtree of bilinear patches.

  Output is a compact JSON atlas (sidecar) that stores per-leaf patch bounds + 4 corner colors.
  This is intended for size/transfer experiments and error stats (not a production codec).

  Usage:
    node tools/analyze_png_bilinear.js <image.png> --dumpAtlas <out.json>
        [--maxError 10] [--minBlock 16] [--sampleStep 4] [--maxLeaves 0]

  Notes:
    - Colors are stored as base64-encoded 16 bytes per leaf (RGBA corners).
    - RMS error is measured on RGB over sampled points.
*/

'use strict';

const fs = require('fs');
const path = require('path');

function tryRequirePngjs() {
  try {
    // eslint-disable-next-line global-require
    return require('pngjs');
  } catch {
    // Fallback to the repo's starfighter node_modules (present in this workspace).
    const alt = path.join(process.cwd(), 'starfighter', 'node_modules', 'pngjs');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(alt);
  }
}

const { PNG } = tryRequirePngjs();

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node tools/analyze_png_bilinear.js <image.png> --dumpAtlas <out.json> [--maxError 10] [--minBlock 16] [--sampleStep 4] [--maxLeaves 0]');
  process.exit(2);
}

function readArgValue(args, flag, def = null) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  return args[i + 1] ?? def;
}

function asInt(v, def) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : def;
}

function asFloat(v, def) {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : def;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function idxOf(x, y, w) {
  return (y * w + x) * 4;
}

function getRGBA(data, w, h, x, y) {
  const xx = Math.max(0, Math.min(w - 1, x));
  const yy = Math.max(0, Math.min(h - 1, y));
  const i = idxOf(xx, yy, w);
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function bilerp(c00, c10, c01, c11, tx, ty) {
  // channel-wise bilinear interpolation in [0,255]
  const out = new Array(4);
  for (let k = 0; k < 4; k++) {
    const a = c00[k] * (1 - tx) + c10[k] * tx;
    const b = c01[k] * (1 - tx) + c11[k] * tx;
    out[k] = a * (1 - ty) + b * ty;
  }
  return out;
}

function rmsErrorRGB(data, w, h, x0, y0, ww, hh, c00, c10, c01, c11, sampleStep) {
  const sx = Math.max(1, sampleStep);
  const sy = Math.max(1, sampleStep);
  let sum = 0;
  let n = 0;

  // Ensure we sample edges too.
  const x1 = x0 + ww - 1;
  const y1 = y0 + hh - 1;

  for (let y = y0; y <= y1; y += sy) {
    const ty = hh <= 1 ? 0 : (y - y0) / (hh - 1);
    for (let x = x0; x <= x1; x += sx) {
      const tx = ww <= 1 ? 0 : (x - x0) / (ww - 1);
      const pred = bilerp(c00, c10, c01, c11, tx, ty);
      const i = idxOf(x, y, w);
      const dr = data[i] - pred[0];
      const dg = data[i + 1] - pred[1];
      const db = data[i + 2] - pred[2];
      sum += dr * dr + dg * dg + db * db;
      n += 3;
    }
  }

  // corners
  const corners = [
    [x0, y0, 0, 0],
    [x1, y0, 1, 0],
    [x0, y1, 0, 1],
    [x1, y1, 1, 1],
  ];
  for (const [x, y, tx, ty] of corners) {
    const pred = bilerp(c00, c10, c01, c11, tx, ty);
    const i = idxOf(x, y, w);
    const dr = data[i] - pred[0];
    const dg = data[i + 1] - pred[1];
    const db = data[i + 2] - pred[2];
    sum += dr * dr + dg * dg + db * db;
    n += 3;
  }

  return Math.sqrt(sum / Math.max(1, n));
}

function encodeCornersBase64(c00, c10, c01, c11) {
  const buf = Buffer.allocUnsafe(16);
  const corners = [c00, c10, c01, c11];
  let o = 0;
  for (const c of corners) {
    buf[o++] = c[0] & 255;
    buf[o++] = c[1] & 255;
    buf[o++] = c[2] & 255;
    buf[o++] = c[3] & 255;
  }
  return buf.toString('base64');
}

function encodeCornersIntoBuf(buf, offset, c00, c10, c01, c11) {
  const corners = [c00, c10, c01, c11];
  let o = offset;
  for (const c of corners) {
    buf[o++] = c[0] & 255;
    buf[o++] = c[1] & 255;
    buf[o++] = c[2] & 255;
    buf[o++] = c[3] & 255;
  }
}

function quadSplit(x0, y0, ww, hh) {
  const w2 = Math.floor(ww / 2);
  const h2 = Math.floor(hh / 2);
  const wA = Math.max(1, w2);
  const wB = Math.max(1, ww - wA);
  const hA = Math.max(1, h2);
  const hB = Math.max(1, hh - hA);
  return [
    { x: x0, y: y0, w: wA, h: hA },
    { x: x0 + wA, y: y0, w: wB, h: hA },
    { x: x0, y: y0 + hA, w: wA, h: hB },
    { x: x0 + wA, y: y0 + hA, w: wB, h: hB },
  ];
}

function splitRespectingMinBlock(node, minBlock) {
  // If we split, ensure no child dimension drops below minBlock.
  const canSplitW = node.w >= minBlock * 2;
  const canSplitH = node.h >= minBlock * 2;

  if (canSplitW && canSplitH) {
    return quadSplit(node.x, node.y, node.w, node.h);
  }
  if (canSplitW) {
    const wA = Math.floor(node.w / 2);
    const w0 = Math.max(minBlock, wA);
    const w1 = Math.max(minBlock, node.w - w0);
    return [
      { x: node.x, y: node.y, w: w0, h: node.h },
      { x: node.x + w0, y: node.y, w: w1, h: node.h },
    ];
  }
  if (canSplitH) {
    const hA = Math.floor(node.h / 2);
    const h0 = Math.max(minBlock, hA);
    const h1 = Math.max(minBlock, node.h - h0);
    return [
      { x: node.x, y: node.y, w: node.w, h: h0 },
      { x: node.x, y: node.y + h0, w: node.w, h: h1 },
    ];
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) usageAndExit();

  const pngPath = args[0];
  if (!pngPath || pngPath.startsWith('-')) usageAndExit('ERROR: missing <image.png>');

  const dumpAtlas = readArgValue(args, '--dumpAtlas', null);
  if (!dumpAtlas) usageAndExit('ERROR: --dumpAtlas <out.json> is required');

  const maxError = Math.max(0.1, asFloat(readArgValue(args, '--maxError', '10'), 10));
  const minBlock = Math.max(1, asInt(readArgValue(args, '--minBlock', '16'), 16));
  const sampleStep = Math.max(1, asInt(readArgValue(args, '--sampleStep', '4'), 4));
  const maxLeaves = Math.max(0, asInt(readArgValue(args, '--maxLeaves', '0'), 0));

  const pngAbs = path.isAbsolute(pngPath) ? pngPath : path.join(process.cwd(), pngPath);
  const buf = fs.readFileSync(pngAbs);
  const img = PNG.sync.read(buf);

  const w = img.width;
  const h = img.height;
  const data = img.data; // RGBA

  const leaves = [];
  const cornersPacked = [];
  const leafXYWH = []; // flat [x,y,w,h,...] as numbers for later packing
  let area = 0;
  let weighted = 0;
  const stack = [{ x: 0, y: 0, w, h }];

  while (stack.length) {
    const node = stack.pop();

    const c00 = getRGBA(data, w, h, node.x, node.y);
    const c10 = getRGBA(data, w, h, node.x + node.w - 1, node.y);
    const c01 = getRGBA(data, w, h, node.x, node.y + node.h - 1);
    const c11 = getRGBA(data, w, h, node.x + node.w - 1, node.y + node.h - 1);

    const rms = rmsErrorRGB(data, w, h, node.x, node.y, node.w, node.h, c00, c10, c01, c11, sampleStep);

    const kids = rms > maxError ? splitRespectingMinBlock(node, minBlock) : null;
    const shouldSplit = !!kids;

    if (!shouldSplit || (maxLeaves > 0 && leaves.length >= maxLeaves)) {
      // Pack corners once; client can decode a single base64 blob.
      const packed = Buffer.allocUnsafe(16);
      encodeCornersIntoBuf(packed, 0, c00, c10, c01, c11);
      cornersPacked.push(packed);
      // Compact leaves: [x, y, w, h]
      // (Per-leaf rms is omitted to keep JSON small; stats is computed incrementally.)
      leaves.push([node.x, node.y, node.w, node.h]);
      leafXYWH.push(node.x, node.y, node.w, node.h);
      const a = node.w * node.h;
      area += a;
      weighted += a * rms;
      continue;
    }

    for (const k of kids) {
      if (k.w <= 0 || k.h <= 0) continue;
      // avoid pathological splits
      if (k.w === node.w && k.h === node.h) continue;
      stack.push(k);
    }
  }

  // Pack leaf rectangles as Uint16LE x,y,w,h to minimize JSON size.
  // Assumes atlas dimensions fit in 16-bit (true for these thumbnails).
  const leafBuf = Buffer.allocUnsafe(leafXYWH.length * 2);
  for (let i = 0; i < leafXYWH.length; i++) {
    const v = leafXYWH[i] | 0;
    leafBuf.writeUInt16LE(Math.max(0, Math.min(65535, v)), i * 2);
  }

  const atlas = {
    type: 'png-bilinear-quadtree-atlas',
    version: 3,
    generatedAt: new Date().toISOString(),
    source: path.relative(process.cwd(), pngAbs),
    width: w,
    height: h,
    settings: { maxError, minBlock, sampleStep, maxLeaves },
    stats: {
      leaves: leaves.length,
      avgLeafArea: leaves.length ? area / leaves.length : 0,
      weightedRms: area ? weighted / area : 0,
    },
    // Packed RGBA corners for all leaves, concatenated (16 bytes/leaf), base64.
    // Client should prefer this over per-leaf base64 strings for speed.
    cornersB64: Buffer.concat(cornersPacked).toString('base64'),
    // Packed leaf rectangles: Uint16LE sequence of x,y,w,h for each leaf.
    leavesB64: leafBuf.toString('base64'),
  };

  ensureDir(path.dirname(dumpAtlas));
  fs.writeFileSync(dumpAtlas, JSON.stringify(atlas));

  // lightweight stdout for callers
  console.log(`[png-atlas] ${atlas.source} -> ${path.relative(process.cwd(), dumpAtlas)} | leaves=${leaves.length} weightedRms=${atlas.stats.weightedRms.toFixed(3)}`);
}

main().catch((e) => {
  console.error('ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
});
