#!/usr/bin/env node
/**
 * Protocol 3.4 — Zero-Coupling Enforcement Scanner
 * ButterflyFX™ / KensGames.com
 *
 * Scans all game substrate source files for event bus patterns.
 * Exits non-zero if violations are found — use as a CI build gate.
 *
 * Usage:
 *   node tools/scan_coupling.js
 *   node tools/scan_coupling.js --warn-only   (report but do not fail)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUBSTRATES_JSON = path.join(ROOT, 'substrates.json');
const WARN_ONLY = process.argv.includes('--warn-only');

// ─── Violation Pattern Definitions ───────────────────────────────────────────
//
// VIOLATION: Patterns that constitute an event bus per Protocol 3.4.
// PERMITTED: DOM events on actual DOM elements (click, keydown, etc.) are
//            whitelisted — they are not cross-module communication.

const VIOLATION_PATTERNS = [
  {
    // Object implementing subscribe(topic, callback) + publish/emit
    regex: /\.subscribe\s*\(/g,
    label: 'pub/sub subscribe()',
    whitelistCheck: null
  },
  {
    regex: /\.emit\s*\(/g,
    label: 'pub/sub emit()',
    // Allow .emit() only if it's clearly a Node EventEmitter on a local object
    // Full violations are global/shared emitters — flag all and let audit decide
    whitelistCheck: null
  },
  {
    regex: /new\s+EventEmitter\s*\(/g,
    label: 'EventEmitter instantiation',
    whitelistCheck: null
  },
  {
    regex: /\bEventEmitter\b/g,
    label: 'EventEmitter reference',
    whitelistCheck: null
  },
  {
    // CustomEvent dispatched on document or window — cross-module communication
    regex: /(?:document|window)\s*\.\s*dispatchEvent\s*\(/g,
    label: 'CustomEvent on document/window',
    whitelistCheck: null
  },
  {
    regex: /new\s+CustomEvent\s*\(/g,
    label: 'CustomEvent instantiation',
    whitelistCheck: null
  },
  {
    // addEventListener on document or window for custom named events
    // (not whitelisted DOM interaction events)
    regex: /(?:document|window)\s*\.\s*addEventListener\s*\(\s*['"`](?!DOMContentLoaded|load|unload|beforeunload|resize|scroll|visibilitychange|focus|blur|online|offline|error|message|storage|hashchange|popstate|pagehide|pageshow|click|keydown|keyup|keypress|touchstart|touchend|touchmove|mousedown|mouseup|mousemove|mouseover|mouseout|contextmenu|wheel|pointerdown|pointerup|pointermove)([^'"`]+)['"`]/g,
    label: 'Custom event listener on document/window',
    whitelistCheck: null
  }
];

// ─── File paths to scan (game substrates only — not lib/, not shared itself) ──
function getSubstratePaths(manifest) {
  const gamePaths = [];
  for (const substrate of manifest.substrates) {
    if (substrate.name === 'shared') continue; // shared layer is allowed to define patterns
    for (const globPattern of substrate.paths) {
      const dir = path.join(ROOT, path.dirname(globPattern));
      const ext = path.extname(globPattern) || '.js';
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
          .filter(f => f.endsWith(ext) && !f.startsWith('_'))
          .map(f => path.join(dir, f));
        gamePaths.push(...files.map(f => ({ file: f, substrate: substrate.name })));
      }
    }
  }
  return gamePaths;
}

// ─── Scan a single file ───────────────────────────────────────────────────────
function scanFile(filePath, substrateName) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const violations = [];

  for (const pattern of VIOLATION_PATTERNS) {
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      // Reset regex state
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        violations.push({
          file: path.relative(ROOT, filePath),
          substrate: substrateName,
          line: lineNum + 1,
          col: line.search(pattern.regex) + 1,
          label: pattern.label,
          source: line.trim()
        });
      }
    }
  }

  return violations;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SUBSTRATES_JSON)) {
    console.error('[scan_coupling] FATAL: substrates.json not found at', SUBSTRATES_JSON);
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(SUBSTRATES_JSON, 'utf8'));
  const targets = getSubstratePaths(manifest);

  console.log(`\n[scan_coupling] Protocol 3.4 — Zero-Coupling Enforcement`);
  console.log(`[scan_coupling] Scanning ${targets.length} game substrate files...\n`);

  const allViolations = [];
  const scannedSubstrates = {};

  for (const { file, substrate } of targets) {
    const violations = scanFile(file, substrate);
    allViolations.push(...violations);
    scannedSubstrates[substrate] = (scannedSubstrates[substrate] || 0) + 1;
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  console.log('Substrates scanned:');
  for (const [sub, count] of Object.entries(scannedSubstrates)) {
    console.log(`  ${sub}: ${count} files`);
  }
  console.log('');

  if (allViolations.length === 0) {
    console.log('[scan_coupling] CLEAN — zero event bus patterns detected.\n');
    process.exit(0);
  }

  // Group by substrate
  const bySubstrate = {};
  for (const v of allViolations) {
    if (!bySubstrate[v.substrate]) bySubstrate[v.substrate] = [];
    bySubstrate[v.substrate].push(v);
  }

  console.log(`[scan_coupling] ${WARN_ONLY ? 'WARNING' : 'VIOLATION'} — ${allViolations.length} event bus pattern(s) found:\n`);
  for (const [sub, violations] of Object.entries(bySubstrate)) {
    console.log(`  Substrate: ${sub} (${violations.length} hit(s))`);
    for (const v of violations) {
      console.log(`    ${v.file}:${v.line} — ${v.label}`);
      console.log(`      > ${v.source}`);
    }
    console.log('');
  }

  console.log('[scan_coupling] Action required: replace event bus patterns with');
  console.log('  Coordinate-Mediated Communication (CMC). See Protocol 3.4.\n');

  if (WARN_ONLY) {
    console.log('[scan_coupling] --warn-only mode: build not blocked.\n');
    process.exit(0);
  }

  process.exit(1);
}

main();
