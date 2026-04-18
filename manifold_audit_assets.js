#!/usr/bin/env node
/**
 * Repo-wide Manifold Asset/Source Audit
 *
 * Purpose:
 * - Identify where the runtime references binary assets (GLB/images/video)
 * - Identify where manifold substrates are referenced/used
 *
 * This does NOT judge correctness; it produces an evidence report.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);

const INCLUDE_DIRS = [
  '.',
  'starfighter',
  'fasttrack',
  'assemble',
  'brickbreaker3d',
  'js',
  'lobby',
];

const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'starfighter/node_modules',
  'downloads',
  'starfighter/downloads',
  'server',
  'api',
  'lib', // third-party libs (three, jquery, etc.)
]);

const INCLUDE_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.md']);

const SIGNALS = {
  // Manifold/runtime substrate signals
  manifoldCore: /\b(?:M\.|SpaceManifold\.|window\.Manifold|ManifoldSurface|ManifoldIngestor|SubstrateRegistry)\b/g,
  manifoldGeometry: /\b(?:SFManifoldGeometry\.|manifold_geometry_substrate)\b/g,
  manifoldAudio: /\b(?:SFManifoldAudio|manifold_audio_substrate)\b/g,

  // Binary asset references
  glbRef: /\.glb\b/g,
  gltfRef: /\.gltf\b/g,
  gltfLoaderUse: /\b(?:new\s+THREE\.GLTFLoader\s*\(|GLTFLoader\s*\(|THREE\.GLTFLoader\b)\b/g,
  textureRef: /\.(?:png|jpg|jpeg|webp|gif|svg)\b/g,
  videoRef: /\.(?:mp4|webm)\b/g,
  audioRef: /\.(?:mp3|wav|ogg)\b/g,

  // HTML-only (still useful)
  imgTag: /<img\b/gi,
  pictureTag: /<picture\b/gi,
  sourceTag: /<source\b/gi,
};

function shouldExcludeDir(rel) {
  const norm = rel.replace(/\\/g, '/');
  for (const ex of EXCLUDE_DIRS) {
    if (norm === ex || norm.startsWith(ex + '/')) return true;
  }
  return false;
}

function* walk(dirAbs, dirRel) {
  const items = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const it of items) {
    const childAbs = path.join(dirAbs, it.name);
    const childRel = dirRel ? path.posix.join(dirRel, it.name) : it.name;

    if (it.isDirectory()) {
      if (shouldExcludeDir(childRel)) continue;
      yield* walk(childAbs, childRel);
    } else if (it.isFile()) {
      const ext = path.extname(it.name).toLowerCase();
      if (!INCLUDE_EXT.has(ext)) continue;
      yield { abs: childAbs, rel: childRel };
    }
  }
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function addCounts(into, text) {
  for (const [k, re] of Object.entries(SIGNALS)) {
    into[k] = (into[k] || 0) + countMatches(text, re);
  }
}

function main() {
  const files = [];
  for (const d of INCLUDE_DIRS) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) {
      files.push({ abs, rel: d });
      continue;
    }
    for (const f of walk(abs, d === '.' ? '' : d)) files.push(f);
  }

  const byFile = {};
  const totals = {};

  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f.abs, 'utf8');
    } catch {
      continue;
    }

    const row = { lines: text.split('\n').length };
    addCounts(row, text);
    byFile[f.rel || path.basename(f.abs)] = row;
    addCounts(totals, text);
    totals.lines = (totals.lines || 0) + row.lines;
  }

  // Simple derived indicators
  const manifoldSignals = (totals.manifoldCore || 0) + (totals.manifoldGeometry || 0) + (totals.manifoldAudio || 0);
  const binarySignals = (totals.glbRef || 0) + (totals.gltfRef || 0) + (totals.textureRef || 0) + (totals.videoRef || 0) + (totals.audioRef || 0);

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      includeDirs: INCLUDE_DIRS,
      excludeDirs: Array.from(EXCLUDE_DIRS),
      includeExt: Array.from(INCLUDE_EXT),
      fileCount: files.length,
    },
    totals: {
      ...totals,
      manifoldSignals,
      binarySignals,
      manifoldToBinaryRatio: binarySignals ? Number((manifoldSignals / binarySignals).toFixed(3)) : null,
    },
    byFile,
  };

  const json = process.argv.includes('--json') || process.argv.includes('-j');
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2));
  } else {
    console.log('Manifold Asset/Source Audit');
    console.log('===========================');
    console.log('Scope:', report.scope);
    console.log('\nTotals:', report.totals);

    const top = Object.entries(byFile)
      .map(([file, row]) => ({ file, ...row }))
      .sort((a, b) => (b.glbRef || 0) - (a.glbRef || 0) || (b.textureRef || 0) - (a.textureRef || 0))
      .slice(0, 15);

    console.log('\nTop binary-reference files (heuristic):');
    for (const r of top) {
      console.log(`- ${r.file}: glb=${r.glbRef || 0} gltfLoader=${r.gltfLoaderUse || 0} textures=${r.textureRef || 0} <img>=${r.imgTag || 0} manifoldCore=${r.manifoldCore || 0} manifoldGeom=${r.manifoldGeometry || 0}`);
    }

    console.log('\nNote: This is a text-signal audit, not a runtime trace.');
  }
}

main();
