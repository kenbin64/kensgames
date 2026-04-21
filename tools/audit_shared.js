#!/usr/bin/env node
/**
 * Protocol 3.6 — Shared Layer Module Usage Audit
 * ButterflyFX™ / KensGames.com
 *
 * Reads substrates.json to identify the shared substrate and all game substrates.
 * For each shared module, counts how many distinct game substrates reference it.
 * Flags shared modules used by fewer than MIN_GAMES games (default: 3).
 *
 * A "reference" is any of:
 *   import '...module_name...'
 *   require('...module_name...')
 *   src="...module_name..."       (HTML script tags)
 *   <filename stem> appearing as an identifier in JS source
 *
 * Usage:
 *   node tools/audit_shared.js
 *   node tools/audit_shared.js --min=2           (change threshold)
 *   node tools/audit_shared.js --json            (machine-readable)
 *   node tools/audit_shared.js --fail-on-orphan  (exit 1 if any module used by 0 games)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUBSTRATES_JSON = path.join(ROOT, 'substrates.json');

// ─── CLI args ──────────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const JSON_MODE = ARGS.includes('--json');
const FAIL_ORPHAN = ARGS.includes('--fail-on-orphan');
const MIN_GAMES = (() => {
  const a = ARGS.find(a => a.startsWith('--min='));
  return a ? parseInt(a.split('=')[1], 10) : 3;
})();

// ─── Collect files for a substrate glob list ──────────────────────────────────
function filesForSubstrate(substrate) {
  const files = [];
  for (const globPattern of substrate.paths) {
    const dir = path.join(ROOT, path.dirname(globPattern));
    const ext = path.extname(globPattern) || '.js';
    if (!fs.existsSync(dir)) continue;
    fs.readdirSync(dir)
      .filter(f => f.endsWith(ext))
      .forEach(f => files.push(path.join(dir, f)));
  }
  return files;
}

// ─── Build a search token for a module file ───────────────────────────────────
// Returns the stem (filename without extension) which is the canonical
// identifier other files use when referencing a shared module.
function stemOf(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

// ─── Check if a file references a given module stem ──────────────────────────
function fileReferences(src, stem) {
  // Match: import/require with the stem, script src with the stem,
  // or the stem appearing as a word boundary token in the source.
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:import|require|src)[^'"]*['"]([^'"]*${escaped}[^'"]*)['"]` +
    `|\\b${escaped}\\b`,
    'i'
  );
  return pattern.test(src);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SUBSTRATES_JSON)) {
    console.error('[audit_shared] FATAL: substrates.json not found');
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(SUBSTRATES_JSON, 'utf8'));

  const sharedSubstrate = manifest.substrates.find(s => s.name === 'shared');
  if (!sharedSubstrate) {
    console.error('[audit_shared] No "shared" substrate found in substrates.json');
    process.exit(2);
  }

  const gameSubstrates = manifest.substrates.filter(s => s.name !== 'shared');

  // Collect shared module files and their stems
  const sharedFiles = filesForSubstrate(sharedSubstrate);
  if (sharedFiles.length === 0) {
    console.warn('[audit_shared] No shared module files found — check substrates.json paths');
    process.exit(0);
  }

  // Collect game substrate source — each game as a single concatenated string
  const gameCorpora = gameSubstrates.map(sub => {
    const files = filesForSubstrate(sub);
    const src = files
      .filter(f => fs.existsSync(f))
      .map(f => fs.readFileSync(f, 'utf8'))
      .join('\n');
    return { name: sub.name, src, fileCount: files.length };
  });

  // Count references per shared module
  const results = sharedFiles.map(modFile => {
    const stem = stemOf(modFile);
    const usedBy = gameCorpora
      .filter(g => fileReferences(g.src, stem))
      .map(g => g.name);
    return {
      module: stem,
      file: path.relative(ROOT, modFile),
      used_by: usedBy,
      usage_count: usedBy.length
    };
  });

  // Sort: fewest usages first
  results.sort((a, b) => a.usage_count - b.usage_count);

  const underused = results.filter(r => r.usage_count < MIN_GAMES);
  const orphans = results.filter(r => r.usage_count === 0);
  const wellUsed = results.filter(r => r.usage_count >= MIN_GAMES);
  const totalGames = gameSubstrates.length;

  // ─── Output ──────────────────────────────────────────────────────────────────
  if (JSON_MODE) {
    console.log(JSON.stringify({
      total_shared_modules: results.length,
      total_game_substrates: totalGames,
      min_threshold: MIN_GAMES,
      well_used: wellUsed.length,
      underused: underused.length,
      orphans: orphans.length,
      modules: results
    }, null, 2));
  } else {
    console.log('\n[audit_shared] Protocol 3.6 — Shared Layer Module Usage Audit');
    console.log(`Shared modules : ${results.length}`);
    console.log(`Game substrates: ${totalGames}  (${gameSubstrates.map(s => s.name).join(', ')})`);
    console.log(`Min threshold  : ${MIN_GAMES} games\n`);

    console.log(`Well-used (>= ${MIN_GAMES} games): ${wellUsed.length}`);
    console.log(`Underused (<  ${MIN_GAMES} games): ${underused.length}`);
    console.log(`Orphans   (0  games)       : ${orphans.length}\n`);

    if (orphans.length > 0) {
      console.log('ORPHANED modules (used by zero game substrates):');
      for (const r of orphans) {
        console.log(`  [ORPHAN] ${r.module}  (${r.file})`);
      }
      console.log('');
    }

    if (underused.length > orphans.length) {
      console.log(`Underused modules (used by 1-${MIN_GAMES - 1} games):`);
      for (const r of underused.filter(r => r.usage_count > 0)) {
        console.log(`  [${r.usage_count}/${totalGames}] ${r.module}  used by: ${r.used_by.join(', ')}`);
      }
      console.log('');
    }

    if (wellUsed.length > 0 && wellUsed.length <= 20) {
      console.log(`Well-used modules:`);
      for (const r of wellUsed) {
        console.log(`  [${r.usage_count}/${totalGames}] ${r.module}`);
      }
      console.log('');
    } else if (wellUsed.length > 20) {
      console.log(`Well-used modules: ${wellUsed.length} (all >= ${MIN_GAMES} game uses — omitted for brevity)\n`);
    }

    if (orphans.length === 0 && underused.length === 0) {
      console.log('Status: PASS — all shared modules meet the usage threshold.\n');
    } else if (orphans.length > 0) {
      console.log(`Status: WARN — ${orphans.length} orphaned module(s) should be removed or migrated.\n`);
    } else {
      console.log(`Status: WARN — ${underused.length} underused module(s). Review for consolidation.\n`);
    }
  }

  if (FAIL_ORPHAN && orphans.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main();
