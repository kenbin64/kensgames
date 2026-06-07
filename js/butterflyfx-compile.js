#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🦋 ButterflyFx — compile interface
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *     butterflyfx <root-folder>  →  manifold  →  artifact(s)
 *
 * The interface is exactly three moves:
 *   1. FIND ROOT     take any existing folder (your project, unchanged).
 *   2. COMPILE       ingest it into a content-addressed manifold: every file is
 *                    an identity (its path) with a content hash (its essence) and
 *                    ancestry (the tree). A single deterministic ROOT hash names
 *                    the whole thing. Same bytes in ⇒ same root out, on any
 *                    machine — reproducible and tamper-evident by construction.
 *   3. OUTPUT ARTIFACT  project the manifold through a lens. The artifact TYPE is
 *                    just which lens runs — a JSON manifest, an image, a bundle,
 *                    a database, a video are all projections of the one manifold
 *                    (directive §4.5, "invoke / manifest").
 *
 * This file ships two lenses to prove the shape — a `.bfx.json` manifest and a
 * generative `.bfx.svg` fingerprint (an image projected from the root, drawn on
 * the helix/wave motif). Any other artifact type is one more lens function over
 * the same manifold; the compile step does not change.
 *
 * Honest scope: "compile" here means content-address + project, not transpile
 * arbitrary source into a running app. It hands you a reproducible, auditable
 * manifold of any folder and the projection mechanism to manifest it.
 *
 * Usage:  node js/butterflyfx-compile.js <folder> [--out <dir>]
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['.git', 'node_modules', '.bfx', 'bfx-out', '.cache', 'dist', 'build']);

// ── content hashing (FNV-1a over raw bytes; reproducible everywhere) ──────────
function fnvBytes(buf) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function fnvStr(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── 2. COMPILE: folder → content-addressed manifold ──────────────────────────
function compile(root) {
  const files = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); // deterministic order
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        let buf; try { buf = fs.readFileSync(full); } catch (_) { continue; }
        files.push({ path: path.relative(root, full).split(path.sep).join('/'), hash: fnvBytes(buf), size: buf.length });
      }
    }
  })(path.resolve(root));
  // Merkle-style root: hash of the sorted "path:hash" lines — one name for the whole tree.
  const treeLine = files.map(f => `${f.path}:${f.hash}`).join('\n');
  const rootHash = fnvStr(treeLine);
  return { root: rootHash, fileCount: files.length, totalBytes: files.reduce((n, f) => n + f.size, 0), files };
}

// ── 3a. LENS → JSON manifest (the manifold serialized) ───────────────────────
function lensManifest(m, srcName) {
  return JSON.stringify({
    _kind: 'butterflyfx.manifold', _v: '0.1.0',
    source: srcName, root: m.root, fileCount: m.fileCount, totalBytes: m.totalBytes,
    files: m.files,
  }, null, 2);
}

// ── 3b. LENS → SVG fingerprint (an IMAGE projected from the manifold) ─────────
// Each file is a point on a helix (angle advances, radius from its hash); colour
// from its hash; the whole picture is a deterministic projection of the root.
function lensImage(m) {
  const W = 720, H = 720, cx = W / 2, cy = H / 2;
  const seed = parseInt(m.root.slice(0, 8), 16) >>> 0;
  let s = seed; const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0; return (s >>> 0) / 4294967296; };
  const turns = 5 + (seed % 4);
  const pts = m.files.map((f, i) => {
    const t = m.files.length > 1 ? i / (m.files.length - 1) : 0;
    const ang = t * Math.PI * 2 * turns + (parseInt(f.hash.slice(0, 4), 16) / 0xffff) * 0.6;
    const rad = 40 + t * 300 + (parseInt(f.hash.slice(4, 8), 16) / 0xffff) * 18;
    const hue = parseInt(f.hash.slice(2, 5), 16) % 360;
    return { x: (cx + rad * Math.cos(ang)).toFixed(1), y: (cy + rad * Math.sin(ang)).toFixed(1), r: (2 + (f.size % 5)).toFixed(1), hue };
  });
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="hsl(${p.hue} 80% 60%)" opacity="0.9"/>`).join('');
  // a faint guide helix behind the points (the wave/helix motif)
  let helix = ''; for (let k = 0; k < 360 * turns; k += 6) { const a = k * Math.PI / 180; const rr = 40 + (k / (360 * turns)) * 300; helix += `${k === 0 ? 'M' : 'L'}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)} `; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#0b0d12"/>` +
    `<path d="${helix}" fill="none" stroke="#243049" stroke-width="1"/>` + dots +
    `<text x="16" y="${H - 16}" fill="#7d86a0" font-family="monospace" font-size="14">butterflyfx root ${m.root} · ${m.fileCount} files</text>` +
    `</svg>`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main(argv) {
  const args = argv.slice(2).filter(a => a !== '--out' || true);
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : 'bfx-out';
  const folder = argv[2] && argv[2] !== '--out' ? argv[2] : '.';
  const srcName = path.basename(path.resolve(folder));

  const m = compile(folder);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (_) {}
  const base = path.join(outDir, srcName + '.bfx');
  fs.writeFileSync(base + '.json', lensManifest(m, srcName));
  fs.writeFileSync(base + '.svg', lensImage(m));

  console.log(`🦋 butterflyfx  ${path.resolve(folder)}`);
  console.log(`   root      ${m.root}   (reproducible: same bytes → same root)`);
  console.log(`   compiled  ${m.fileCount} files, ${m.totalBytes} bytes → one content-addressed manifold`);
  console.log(`   artifact  ${base}.json   (lens: manifest)`);
  console.log(`   artifact  ${base}.svg    (lens: image — manifold projected on the helix)`);
  console.log(`   → the artifact TYPE is the lens; app / db / video are one more projection over this same root.`);
  return m;
}

if (require.main === module) main(process.argv);
module.exports = { compile, lensManifest, lensImage };
