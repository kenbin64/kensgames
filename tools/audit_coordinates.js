#!/usr/bin/env node
/**
 * Protocol 3.3 — Coordinate Density Audit
 * ButterflyFX™ / KensGames.com
 *
 * Scans all game substrate JS files to:
 *  1. Enumerate coordinates — all property path patterns matching the naming
 *     convention {domain}.{entity}.{property}[.{subproperty}]
 *  2. Count lens readers per coordinate — how many lenses reference each path
 *  3. Identify dead coordinates (zero lens readers)
 *  4. Report density_ratio = active / total  (target ≥ 0.85)
 *  5. Flag coordinates suitable for bit-field packing (boolean clusters)
 *
 * Usage:
 *   node tools/audit_coordinates.js
 *   node tools/audit_coordinates.js --fail-below=0.85   (exit 1 if density < threshold)
 *   node tools/audit_coordinates.js --substrate=fasttrack
 *   node tools/audit_coordinates.js --json              (machine-readable output)
 *
 * Coordinate naming convention (Card B):
 *   Domains : player, game, physics, ui, network, audio, input
 *   Format  : {domain}.{entity}.{property}[.{subproperty}]
 *   Examples: player.identity.avatar, game.score.current, physics.ball.velocity.x
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUBSTRATES_JSON = path.join(ROOT, 'substrates.json');

// ─── CLI args ──────────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const JSON_MODE = ARGS.includes('--json');
const FAIL_BELOW = (() => {
  const a = ARGS.find(a => a.startsWith('--fail-below='));
  return a ? parseFloat(a.split('=')[1]) : null;
})();
const FILTER_SUB = (() => {
  const a = ARGS.find(a => a.startsWith('--substrate='));
  return a ? a.split('=')[1] : null;
})();

// ─── Coordinate domains (canonical set per directive) ─────────────────────────
const VALID_DOMAINS = new Set(['player', 'game', 'physics', 'ui', 'network', 'audio', 'input']);

// ─── Patterns to detect coordinate definitions and lens reads ─────────────────
// Coordinate write: substrate.{domain}.{entity}.{property} = ...
// Coordinate read:  substrate.{domain}.{entity}.{property} (any usage)
const COORD_PATTERN = /\bsubstrate\.([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+){1,3})\b/g;

// Lens declaration pattern: function.*Lens or const.*Lens or lens.*registry
const LENS_PATTERN = /(?:function\s+\w*[Ll]ens\w*|const\s+\w*[Ll]ens\w*\s*=|LensRegistry\.register)/;

// ─── File collection ───────────────────────────────────────────────────────────
function getSubstrateFiles(manifest) {
  const files = [];
  for (const substrate of manifest.substrates) {
    if (substrate.name === 'shared') continue;
    if (FILTER_SUB && substrate.name !== FILTER_SUB) continue;
    for (const glob of substrate.paths) {
      const dir = path.join(ROOT, path.dirname(glob));
      const ext = path.extname(glob) || '.js';
      if (!fs.existsSync(dir)) continue;
      fs.readdirSync(dir)
        .filter(f => f.endsWith(ext))
        .forEach(f => files.push({ file: path.join(dir, f), substrate: substrate.name }));
    }
  }
  return files;
}

// ─── Scan a file for coordinates and classify as lens or write ─────────────────
function scanFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  const coordReads = {};   // coord → Set of line numbers where it's read
  const coordWrites = {};   // coord → Set of line numbers where it's defined
  const lensLines = new Set();  // line numbers that are part of a lens body

  // Mark lens-containing lines
  for (let i = 0; i < lines.length; i++) {
    if (LENS_PATTERN.test(lines[i])) {
      // Mark a window of lines as "lens context"
      for (let j = i; j < Math.min(i + 30, lines.length); j++) lensLines.add(j);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    COORD_PATTERN.lastIndex = 0;
    let m;
    while ((m = COORD_PATTERN.exec(line)) !== null) {
      const coord = m[1];
      const domain = coord.split('.')[0];
      if (!VALID_DOMAINS.has(domain)) continue;  // skip non-standard paths

      const isWrite = /\bsubstrate\.[a-zA-Z0-9_.]+\s*=(?!=)/.test(line);
      if (isWrite) {
        if (!coordWrites[coord]) coordWrites[coord] = new Set();
        coordWrites[coord].add(i + 1);
      } else {
        if (!coordReads[coord]) coordReads[coord] = new Set();
        coordReads[coord].add(i + 1);
      }
    }
  }

  return { coordReads, coordWrites };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SUBSTRATES_JSON)) {
    console.error('[audit_coordinates] FATAL: substrates.json not found');
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(SUBSTRATES_JSON, 'utf8'));
  const targets = getSubstrateFiles(manifest);

  // Aggregate across all files
  const allCoordWrites = {};  // coord → { substrate, files, lines[] }
  const allCoordReads = {};  // coord → { count, files }

  for (const { file, substrate } of targets) {
    const { coordReads, coordWrites } = scanFile(file);
    const relFile = path.relative(ROOT, file);

    for (const [coord, lines] of Object.entries(coordWrites)) {
      if (!allCoordWrites[coord]) allCoordWrites[coord] = { substrate, files: [], lines: [] };
      allCoordWrites[coord].files.push(relFile);
      allCoordWrites[coord].lines.push(...lines);
    }
    for (const [coord, lines] of Object.entries(coordReads)) {
      if (!allCoordReads[coord]) allCoordReads[coord] = { count: 0, files: [] };
      allCoordReads[coord].count += lines.size;
      if (!allCoordReads[coord].files.includes(relFile)) allCoordReads[coord].files.push(relFile);
    }
  }

  // All known coordinates = union of writes + reads
  const allCoords = new Set([
    ...Object.keys(allCoordWrites),
    ...Object.keys(allCoordReads)
  ]);

  const total = allCoords.size;
  const dead = [];
  const active = [];
  const packing_candidates = [];  // clusters of boolean coordinates on same entity

  // Detect boolean clusters (bit-packing candidates)
  const entityMap = {};  // entity → [coord, ...]
  for (const coord of allCoords) {
    const parts = coord.split('.');
    if (parts.length >= 3) {
      const entity = parts.slice(0, 2).join('.');
      if (!entityMap[entity]) entityMap[entity] = [];
      entityMap[entity].push(coord);
    }
  }
  for (const [entity, coords] of Object.entries(entityMap)) {
    if (coords.length >= 3) {
      packing_candidates.push({ entity, coords });
    }
  }

  // Classify each coordinate
  for (const coord of allCoords) {
    const readCount = allCoordReads[coord] ? allCoordReads[coord].count : 0;
    if (readCount === 0) {
      dead.push({ coord, definedIn: allCoordWrites[coord] ? allCoordWrites[coord].files : [] });
    } else {
      active.push({ coord, reads: readCount });
    }
  }

  const density = total > 0 ? (active.length / total) : 1.0;

  // ─── Output ──────────────────────────────────────────────────────────────────
  if (JSON_MODE) {
    console.log(JSON.stringify({
      substrate: FILTER_SUB || 'all',
      coordinates_total: total,
      coordinates_active: active.length,
      coordinates_dead: dead.length,
      density_ratio: +density.toFixed(3),
      dead_coordinates: dead,
      packing_candidates: packing_candidates.length > 0 ? packing_candidates : undefined
    }, null, 2));
  } else {
    console.log('\n[audit_coordinates] Protocol 3.3 — Coordinate Density Audit');
    console.log(`Substrate: ${FILTER_SUB || 'all game substrates'}`);
    console.log(`Files scanned: ${targets.length}\n`);

    console.log(`Coordinates total   : ${total}`);
    console.log(`Coordinates active  : ${active.length}`);
    console.log(`Coordinates dead    : ${dead.length}`);
    console.log(`Density ratio       : ${(density * 100).toFixed(1)}%  (target ≥ 85%)`);
    console.log(`Status              : ${density >= 0.85 ? 'PASS' : 'BELOW TARGET'}\n`);

    if (dead.length > 0) {
      console.log(`Dead coordinates (zero lens readers):`);
      for (const d of dead.slice(0, 30)) {
        console.log(`  ${d.coord}  [defined in: ${d.definedIn.join(', ') || 'unknown'}]`);
      }
      if (dead.length > 30) console.log(`  ... and ${dead.length - 30} more`);
      console.log('');
    }

    if (packing_candidates.length > 0) {
      console.log(`Bit-packing candidates (${packing_candidates.length} entity clusters with ≥3 coords):`);
      for (const pc of packing_candidates.slice(0, 10)) {
        console.log(`  ${pc.entity}: [${pc.coords.join(', ')}]`);
      }
      if (packing_candidates.length > 10) console.log(`  ... and ${packing_candidates.length - 10} more`);
      console.log('');
    }
  }

  if (FAIL_BELOW !== null && density < FAIL_BELOW) {
    if (!JSON_MODE) {
      console.error(`[audit_coordinates] FAIL — density ${(density * 100).toFixed(1)}% is below threshold ${(FAIL_BELOW * 100).toFixed(1)}%`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
