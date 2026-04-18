#!/usr/bin/env node
// 🜂 MANIFOLD ICON PIPELINE — z = xy
// x = source logo (single truth)
// y = resize transform (platform multiplier)
// z = icon artifact per platform (point on the surface)
//
// Every platform icon is derived from one source, not separately authored.
// Usage: node make_icons.js
//
// Uses Jimp (pure JS, no native binaries) — already in starfighter/package.json

'use strict';

const path = require('path');
const fs = require('fs');

// Load Jimp from starfighter/node_modules (pure JS — no native CPU requirement)
let Jimp;
const jimpPaths = [
  path.resolve(__dirname, '..', 'node_modules', 'jimp'),
  path.resolve(__dirname, 'node_modules', 'jimp'),
];
for (const p of jimpPaths) {
  try { ({ Jimp } = require(p)); break; } catch { /* continue */ }
}
if (!Jimp) { try { ({ Jimp } = require('jimp')); } catch { /* not global */ } }
if (!Jimp) {
  console.error('jimp not found. Run: npm install jimp  (in starfighter/)');
  process.exit(1);
}

const SRC = path.resolve(__dirname, '..', 'assets', 'textures', 'starfighterlogo.png');
const OUT = path.resolve(__dirname, 'assets');

if (!fs.existsSync(SRC)) {
  console.error('Source not found:', SRC);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// ── Manifold: x = source, y = size, z = path ────────────────────────────────
const PNG_SIZES = [1024, 512, 256, 128, 64, 32, 16];

async function resizePng(img, size, outPath) {
  const clone = img.clone();
  clone.resize({ w: size, h: size });
  await clone.write(outPath);
}

// ── ICO (Windows) — electron-builder converts 256px PNG automatically ────────
async function makeIco(pngPath, icoPath) {
  try {
    const pngToIco = require(path.resolve(__dirname, '..', 'node_modules', 'png-to-ico'));
    const buf = await pngToIco([pngPath]);
    fs.writeFileSync(icoPath, buf);
    console.log('  ✓ icon.ico (png-to-ico)');
  } catch {
    // Fallback: electron-builder accepts a high-res PNG and converts internally
    fs.copyFileSync(pngPath, icoPath);
    console.log('  ✓ icon.ico (PNG fallback — electron-builder will convert)');
  }
}

// ── ICNS (macOS) — electron-builder handles on macOS runner ─────────────────
async function makeIcns(pngPath, icnsPath) {
  try {
    const { execSync } = require('child_process');
    execSync(`png2icns "${icnsPath}" "${pngPath}"`, { stdio: 'pipe' });
    console.log('  ✓ icon.icns (png2icns)');
  } catch {
    fs.copyFileSync(pngPath, icnsPath);
    console.log('  ✓ icon.icns (PNG fallback — electron-builder will convert on macOS runner)');
  }
}

async function run() {
  const K = (2 * Math.PI) / 2000;
  const diamond = (x, y, z) =>
    Math.cos(x * K) * Math.cos(y * K) * Math.cos(z * K) -
    Math.sin(x * K) * Math.sin(y * K) * Math.sin(z * K);

  console.log('\n🜂  Icon Pipeline — z = xy\n' + '─'.repeat(50));
  console.log('x (source): ' + SRC);
  console.log('y (sizes):  ' + PNG_SIZES.join(', '));

  // Load source once — manifold reads the point once, derives all sizes from it
  const img = await Jimp.read(SRC);

  for (const size of PNG_SIZES) {
    const outPng = path.join(OUT, `icon${size}.png`);
    await resizePng(img, size, outPng);
    const field = diamond(size, size, size);
    console.log(`  z=${size.toString().padStart(4)}  →  icon${size}.png  field=${field.toFixed(4)}`);
  }

  // Canonical icon.png (1024) — used by Linux builds and as default
  const icon1024 = path.join(OUT, 'icon1024.png');
  const iconPng = path.join(OUT, 'icon.png');
  fs.copyFileSync(icon1024, iconPng);
  console.log('  ✓ icon.png (1024, Linux canonical)');

  // Windows .ico
  await makeIco(path.join(OUT, 'icon256.png'), path.join(OUT, 'icon.ico'));

  // macOS .icns
  await makeIcns(icon1024, path.join(OUT, 'icon.icns'));

  console.log('\n' + '─'.repeat(50));
  console.log('🜂  Icon surface complete.\n');
}

run().catch(e => { console.error(e); process.exit(1); });
