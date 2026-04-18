#!/usr/bin/env node
/*
  Bulk PNG → WebP conversion (experiment) to quantify storage/transfer impact.
  - Does NOT modify originals.
  - Writes parallel .webp files under --outDir, preserving relative paths.

  Requires: sharp (npm)
    If not installed in repo root, you can install anywhere and run with NODE_PATH,
    e.g. from repo root:
      NODE_PATH=starfighter/node_modules node tools/optimize_pngs_to_webp.js

  Usage:
    node tools/optimize_pngs_to_webp.js [--outDir tools/output/images_webp] [--quality 80]
                                      [--lossless 1|0] [--limit 0] [--force]
*/

'use strict';

const fs = require('fs');
const path = require('path');

let sharp;
try {
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (e) {
  console.error('ERROR: sharp is not available.');
  console.error('Install it (e.g. npm i sharp) or run with NODE_PATH pointing to an existing node_modules.');
  process.exit(1);
}

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node tools/optimize_pngs_to_webp.js [--outDir tools/output/images_webp] [--quality 80] [--lossless 1|0] [--limit 0] [--force]');
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

function asBool01(v, def) {
  if (v === null || v === undefined) return def;
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return false;
  return def;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function walkPngs(rootDir) {
  const results = [];
  function walk(relDir) {
    const absDir = path.join(rootDir, relDir);
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const rel = path.join(relDir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') continue;
        if (rel === 'tools/output' || rel.startsWith(path.join('tools', 'output'))) continue;
        walk(rel);
        continue;
      }
      if (!ent.isFile()) continue;
      if (path.extname(ent.name).toLowerCase() === '.png') results.push(rel);
    }
  }
  walk('.');
  return results.sort();
}

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) usageAndExit();

  const outDir = (readArgValue(args, '--outDir', 'tools/output/images_webp') || '').trim();
  const quality = Math.max(1, Math.min(100, asInt(readArgValue(args, '--quality', '80'), 80)));
  const lossless = asBool01(readArgValue(args, '--lossless', '1'), true);
  const limit = Math.max(0, asInt(readArgValue(args, '--limit', '0'), 0));
  const force = args.includes('--force');

  ensureDir(outDir);

  const root = process.cwd();
  const pngs = walkPngs(root);
  const selected = limit > 0 ? pngs.slice(0, limit) : pngs;

  const report = {
    generatedAt: new Date().toISOString(),
    root,
    settings: { outDir, quality, lossless, limit, force },
    counts: { png: pngs.length, processed: selected.length },
    totals: { pngBytes: 0, webpBytes: 0 },
    files: [],
  };

  let idx = 0;
  for (const rel of selected) {
    idx++;
    const abs = path.join(root, rel);
    const st = fs.statSync(abs);
    report.totals.pngBytes += st.size;

    const outAbs = path.join(root, outDir, rel.replace(/^[.][/]/, '')).replace(/\.png$/i, '.webp');
    ensureDir(path.dirname(outAbs));

    if (!force && fs.existsSync(outAbs)) {
      const outSt = fs.statSync(outAbs);
      report.totals.webpBytes += outSt.size;
      report.files.push({ path: rel, pngBytes: st.size, webpPath: path.relative(root, outAbs), webpBytes: outSt.size, cached: true });
      if (idx === 1 || idx % 10 === 0 || idx === selected.length) {
        console.log(`[webp] ${idx}/${selected.length} cached | last=${rel} | png=${fmtMB(st.size)}MB webp=${fmtMB(outSt.size)}MB`);
      }
      continue;
    }

    const img = sharp(abs, { failOn: 'none' });
    const meta = await img.metadata();

    // For UI art and textures, default to lossless to avoid surprising artifacts.
    // If lossless is false, quality is used.
    const webpOpts = lossless ? { lossless: true } : { quality };

    await img
      .webp(webpOpts)
      .toFile(outAbs);

    const outSt = fs.statSync(outAbs);
    report.totals.webpBytes += outSt.size;

    report.files.push({
      path: rel,
      width: meta.width ?? null,
      height: meta.height ?? null,
      pngBytes: st.size,
      webpPath: path.relative(root, outAbs),
      webpBytes: outSt.size,
      cached: false,
    });

    if (idx === 1 || idx % 10 === 0 || idx === selected.length) {
      console.log(`[webp] ${idx}/${selected.length} encoded | last=${rel} | png=${fmtMB(st.size)}MB webp=${fmtMB(outSt.size)}MB`);
    }
  }

  // sort biggest savings first
  report.files.sort((a, b) => ((b.pngBytes - b.webpBytes) - (a.pngBytes - a.webpBytes)));

  const reportPath = path.join(root, outDir, 'png_to_webp_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('[webp] done');
  console.log('[webp] png total:', report.totals.pngBytes, `(${fmtMB(report.totals.pngBytes)} MB)`);
  console.log('[webp] webp total:', report.totals.webpBytes, `(${fmtMB(report.totals.webpBytes)} MB)`);
  console.log('[webp] report:', path.relative(root, reportPath));
}

main().catch((e) => {
  console.error('ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
});
