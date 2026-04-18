#!/usr/bin/env node
/*
  Repo-wide manifold application pass:
  - Finds all .glb/.gltf and .png under the repo (skipping node_modules and tools/output)
  - For each GLB: generates a patch atlas JSON via tools/analyze_tpms_glb.js
  - Emits a summary report with size + gzip estimates

  Usage:
    node tools/apply_manifold_repo.js [--outDir tools/output/manifold] [--gridDivs 12]
                                    [--maxCells 200] [--maxCellsBig 400] [--bigGlbBytes 10000000]
                                    [--limit 0]

  Notes:
    - This does NOT rewrite your assets. It generates parallel "dictionary" atlases + a report.
*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const childProcess = require('child_process');

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node tools/apply_manifold_repo.js [--outDir tools/output/manifold] [--gridDivs N] [--maxCells N] [--maxCellsBig N] [--bigGlbBytes N]');
  console.error('                                  [--pngMaxError N] [--pngMinBlock N] [--pngSampleStep N] [--pngMaxLeaves N]');
  console.error('                                  [--limit N] [--force]');
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

function gzipBytes(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function safeOutPath(outDir, relPath, suffix) {
  // Preserve folder layout, but replace ':' etc just in case.
  const cleanRel = relPath.replace(/^[.][/]/, '').replace(/[^A-Za-z0-9_./-]/g, '_');
  const base = path.join(outDir, cleanRel);
  return base + suffix;
}

function walkRepo(rootDir) {
  const results = [];
  const exts = new Set(['.glb', '.gltf', '.png']);

  function walk(dirRel) {
    const dirAbs = path.join(rootDir, dirRel);
    let entries;
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      const rel = path.join(dirRel, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') continue;
        // Avoid recursively re-processing generated output.
        if (rel === 'tools/output' || rel.startsWith(path.join('tools', 'output'))) continue;
        walk(rel);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!exts.has(ext)) continue;
      results.push(rel);
    }
  }

  walk('.');
  return results;
}

function readPngSize(pngAbsPath) {
  // PNG spec: 8-byte signature, then IHDR chunk. Width/height are 4 bytes each big-endian.
  const fd = fs.openSync(pngAbsPath, 'r');
  try {
    const buf = Buffer.alloc(24);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (n < 24) return null;
    // Signature check
    const sig = buf.subarray(0, 8);
    const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!sig.equals(pngSig)) return null;
    // IHDR data starts at byte 16
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return { width: w, height: h };
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function runAtlas(glbAbsPath, atlasAbsPath, gridDivs, maxCells) {
  ensureDir(path.dirname(atlasAbsPath));
  const cmd = process.execPath; // node
  const script = path.join(process.cwd(), 'tools', 'analyze_tpms_glb.js');
  const args = [script, glbAbsPath, '--dumpAtlas', atlasAbsPath, '--gridDivs', String(gridDivs), '--maxCells', String(maxCells), '--atlasOnly'];

  const res = childProcess.spawnSync(cmd, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (res.status !== 0) {
    const err = (res.stderr || '').slice(0, 2000);
    throw new Error(`atlas generation failed (${res.status}) for ${glbAbsPath}: ${err}`);
  }
}

function runPngAtlas(pngAbsPath, atlasAbsPath, pngMaxError, pngMinBlock, pngSampleStep, pngMaxLeaves) {
  ensureDir(path.dirname(atlasAbsPath));
  const cmd = process.execPath; // node
  const script = path.join(process.cwd(), 'tools', 'analyze_png_bilinear.js');
  const args = [
    script,
    pngAbsPath,
    '--dumpAtlas',
    atlasAbsPath,
    '--maxError',
    String(pngMaxError),
    '--minBlock',
    String(pngMinBlock),
    '--sampleStep',
    String(pngSampleStep),
    '--maxLeaves',
    String(pngMaxLeaves),
  ];

  const res = childProcess.spawnSync(cmd, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (res.status !== 0) {
    const err = (res.stderr || '').slice(0, 2000);
    throw new Error(`png atlas generation failed (${res.status}) for ${pngAbsPath}: ${err}`);
  }
}

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) usageAndExit();

  const outDir = (readArgValue(args, '--outDir', 'tools/output/manifold') || '').trim();
  const gridDivs = Math.max(2, Math.min(40, asInt(readArgValue(args, '--gridDivs', '12'), 12)));
  const maxCells = Math.max(1, Math.min(5000, asInt(readArgValue(args, '--maxCells', '200'), 200)));
  const maxCellsBig = Math.max(1, Math.min(5000, asInt(readArgValue(args, '--maxCellsBig', '400'), 400)));
  const bigGlbBytes = Math.max(0, asInt(readArgValue(args, '--bigGlbBytes', '10000000'), 10_000_000));
  const pngMaxError = Math.max(0.1, Math.min(80, asFloat(readArgValue(args, '--pngMaxError', '10'), 10)));
  const pngMinBlock = Math.max(1, Math.min(512, asInt(readArgValue(args, '--pngMinBlock', '16'), 16)));
  const pngSampleStep = Math.max(1, Math.min(64, asInt(readArgValue(args, '--pngSampleStep', '4'), 4)));
  const pngMaxLeaves = Math.max(0, asInt(readArgValue(args, '--pngMaxLeaves', '0'), 0));
  const limit = Math.max(0, asInt(readArgValue(args, '--limit', '0'), 0));
  const force = args.includes('--force');

  ensureDir(outDir);

  const assets = walkRepo(process.cwd())
    .filter(p => ['.glb', '.gltf', '.png'].includes(path.extname(p).toLowerCase()))
    .sort();

  const glbs = assets.filter(p => ['.glb', '.gltf'].includes(path.extname(p).toLowerCase()));
  const pngs = assets.filter(p => path.extname(p).toLowerCase() === '.png');

  const selectedGlbs = limit > 0 ? glbs.slice(0, limit) : glbs;

  const report = {
    generatedAt: new Date().toISOString(),
    root: process.cwd(),
    settings: { outDir, gridDivs, maxCells, maxCellsBig, bigGlbBytes, pngMaxError, pngMinBlock, pngSampleStep, pngMaxLeaves, limit },
    counts: { assets: assets.length, glb: glbs.length, png: pngs.length },
    totals: {
      glbBytes: 0,
      glbGzipBytes: 0,
      atlasBytes: 0,
      atlasGzipBytes: 0,
      pngBytes: 0,
      pngAtlasBytes: 0,
      pngAtlasGzipBytes: 0,
    },
    png: [],
    glb: [],
  };

  // PNG inventory + optional PNG atlas generation
  let p = 0;
  for (const rel of pngs) {
    p++;
    const abs = path.join(process.cwd(), rel);
    const st = fs.statSync(abs);
    const dims = readPngSize(abs);
    report.totals.pngBytes += st.size;

    const outAtlasAbs = path.join(process.cwd(), safeOutPath(outDir, rel, '.imgatlas.json'));
    let ms = 0;
    if (!force && fs.existsSync(outAtlasAbs)) {
      ms = 0;
    } else {
      const started = Date.now();
      runPngAtlas(abs, outAtlasAbs, pngMaxError, pngMinBlock, pngSampleStep, pngMaxLeaves);
      ms = Date.now() - started;
    }

    const atlasBuf = fs.readFileSync(outAtlasAbs);
    const atlasGz = gzipBytes(atlasBuf);
    report.totals.pngAtlasBytes += atlasBuf.length;
    report.totals.pngAtlasGzipBytes += atlasGz;

    report.png.push({
      path: rel,
      bytes: st.size,
      width: dims ? dims.width : null,
      height: dims ? dims.height : null,
      atlasPath: path.relative(process.cwd(), outAtlasAbs),
      atlasBytes: atlasBuf.length,
      atlasGzipBytes: atlasGz,
      params: { pngMaxError, pngMinBlock, pngSampleStep, pngMaxLeaves },
      timingMs: ms,
    });

    if (p === 1 || p % 10 === 0 || p === pngs.length) {
      const tag = ms === 0 ? 'cached' : `${ms}ms`;
      console.log(`[png] ${p}/${pngs.length} atlased | last=${rel} | png=${fmtMB(st.size)}MB atlas=${fmtMB(atlasBuf.length)}MB (${tag})`);
    }
  }

  // Sort PNGs by biggest gz transfer reduction.
  report.png.sort((a, b) => (b.bytes - b.atlasBytes) - (a.bytes - a.atlasBytes));

  // GLB manifold atlas generation
  let i = 0;
  for (const rel of selectedGlbs) {
    i++;
    const abs = path.join(process.cwd(), rel);
    const st = fs.statSync(abs);
    const glbBuf = fs.readFileSync(abs);
    const glbGz = gzipBytes(glbBuf);

    const outAtlasAbs = path.join(process.cwd(), safeOutPath(outDir, rel, '.atlas.json'));
    const useMaxCells = st.size >= bigGlbBytes ? maxCellsBig : maxCells;

    let ms = 0;
    if (!force && fs.existsSync(outAtlasAbs)) {
      // Reuse existing atlas to support resume.
      ms = 0;
    } else {
      const started = Date.now();
      runAtlas(abs, outAtlasAbs, gridDivs, useMaxCells);
      ms = Date.now() - started;
    }

    const atlasBuf = fs.readFileSync(outAtlasAbs);
    const atlasGz = gzipBytes(atlasBuf);

    report.totals.glbBytes += st.size;
    report.totals.glbGzipBytes += glbGz;
    report.totals.atlasBytes += atlasBuf.length;
    report.totals.atlasGzipBytes += atlasGz;

    report.glb.push({
      path: rel,
      bytes: st.size,
      gzipBytes: glbGz,
      atlasPath: path.relative(process.cwd(), outAtlasAbs),
      atlasBytes: atlasBuf.length,
      atlasGzipBytes: atlasGz,
      params: { gridDivs, maxCells: useMaxCells },
      timingMs: ms,
    });

    // Lightweight progress log.
    if (i === 1 || i % 10 === 0 || i === selectedGlbs.length) {
      const tag = ms === 0 ? 'cached' : `${ms}ms`;
      console.log(`[manifold] ${i}/${selectedGlbs.length} atlased | last=${rel} | glb=${fmtMB(st.size)}MB atlas=${fmtMB(atlasBuf.length)}MB (${tag})`);
    }
  }

  // Sort GLBs by biggest gz transfer reduction.
  report.glb.sort((a, b) => (b.gzipBytes - b.atlasGzipBytes) - (a.gzipBytes - a.atlasGzipBytes));

  const reportJsonPath = path.join(outDir, 'manifold_repo_report.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));

  const md = [];
  md.push(`# Manifold Repo Pass\n`);
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Root: ${report.root}`);
  md.push('');
  md.push(`Assets: ${report.counts.assets} (GLB/GLTF: ${report.counts.glb}, PNG: ${report.counts.png})`);
  md.push('');
  md.push(`## Totals (raw)`);
  md.push(`- GLB bytes: ${report.totals.glbBytes} (${fmtMB(report.totals.glbBytes)} MB)`);
  md.push(`- Atlas bytes: ${report.totals.atlasBytes} (${fmtMB(report.totals.atlasBytes)} MB)`);
  md.push(`- PNG bytes: ${report.totals.pngBytes} (${fmtMB(report.totals.pngBytes)} MB)`);
  md.push(`- PNG atlas bytes: ${report.totals.pngAtlasBytes} (${fmtMB(report.totals.pngAtlasBytes)} MB)`);
  md.push('');
  md.push(`## Totals (gzip transfer estimate)`);
  md.push(`- GLB gzip: ${report.totals.glbGzipBytes} (${fmtMB(report.totals.glbGzipBytes)} MB)`);
  md.push(`- Atlas gzip: ${report.totals.atlasGzipBytes} (${fmtMB(report.totals.atlasGzipBytes)} MB)`);
  md.push(`- PNG atlas gzip: ${report.totals.pngAtlasGzipBytes} (${fmtMB(report.totals.pngAtlasGzipBytes)} MB)`);
  md.push('');
  md.push(`## Biggest transfer wins (GLB gzip - Atlas gzip)`);
  for (const row of report.glb.slice(0, 12)) {
    const win = row.gzipBytes - row.atlasGzipBytes;
    md.push(`- ${row.path}: ${(win / 1024).toFixed(1)} KB win | glb.gz ${(row.gzipBytes / 1024).toFixed(1)} KB → atlas.gz ${(row.atlasGzipBytes / 1024).toFixed(1)} KB`);
  }
  md.push('');
  md.push(`## Biggest transfer wins (PNG raw → PNG-atlas gzip)`);
  for (const row of report.png.slice(0, 12)) {
    const win = row.bytes - row.atlasGzipBytes;
    md.push(`- ${row.path}: ${(win / 1024).toFixed(1)} KB win | png ${(row.bytes / 1024).toFixed(1)} KB → atlas.gz ${(row.atlasGzipBytes / 1024).toFixed(1)} KB`);
  }
  md.push('');
  md.push(`Report JSON: ${path.relative(process.cwd(), reportJsonPath)}`);

  const reportMdPath = path.join(outDir, 'manifold_repo_report.md');
  fs.writeFileSync(reportMdPath, md.join('\n') + '\n');

  console.log('[manifold] done');
  console.log('[manifold] report:', path.relative(process.cwd(), reportJsonPath));
  console.log('[manifold] md:', path.relative(process.cwd(), reportMdPath));
}

main();
