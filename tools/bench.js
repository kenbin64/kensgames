#!/usr/bin/env node
/**
 * bfx-ingest benchmark — real, reproducible numbers on real codebases.
 *
 *   node bench.js <dir> [<dir> ...]
 *
 * For each target it reports what is EXACT (files, characters, duplicate files
 * and the bytes they cost) and what is ESTIMATED (tokens, dollars). The dedup
 * percentage is tokenizer-independent: it removes whole identical files, so the
 * reduction holds no matter how you count tokens. Dollar figures are labelled
 * estimates at typical posted input pricing, with the math shown.
 *
 * No deps, no network. Run it yourself and check every number.
 */
'use strict';
const path = require('path');
const { ingest } = require('./bfx-ingest.js');

// Typical posted input pricing, in dollars per 1,000,000 input tokens.
// Illustrative bands, not a quote for any one vendor; change and re-run.
const PRICE = { 'budget ($0.50/M)': 0.5, 'frontier ($3/M)': 3, 'premium ($15/M)': 15 };
const estTokens = (chars) => Math.ceil(chars / 4); // standard heuristic

function measure(dir) {
  const m = ingest(dir, { maxKb: 256 });
  const all = m.files;
  const dupFiles = all.filter((f) => f.dupOf);
  const totalChars = all.reduce((n, f) => n + f.text.length, 0);
  const uniqueChars = all.filter((f) => !f.dupOf).reduce((n, f) => n + f.text.length, 0);
  const dedupChars = totalChars - uniqueChars;
  const tokensFull = estTokens(totalChars);
  const tokensDedup = estTokens(uniqueChars);
  const tokensSaved = tokensFull - tokensDedup;
  const pct = totalChars ? (dedupChars / totalChars) * 100 : 0;
  return {
    src: path.basename(path.resolve(dir)) || dir,
    root: m.root,
    files: all.length,
    dupFiles: dupFiles.length,
    totalChars,
    uniqueChars,
    dedupChars,
    tokensFull,
    tokensDedup,
    tokensSaved,
    pct,
  };
}

function dollars(tokens) {
  return Object.entries(PRICE)
    .map(([label, perM]) => `${label}: $${((tokens / 1e6) * perM).toFixed(4)}`)
    .join('  ·  ');
}

function fmt(n) {
  return n.toLocaleString();
}

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('usage: node bench.js <dir> [<dir> ...]');
  process.exit(2);
}

let aggFull = 0, aggSaved = 0;
for (const dir of dirs) {
  let r;
  try { r = measure(dir); } catch (e) { console.error(`skip ${dir}: ${e.message}`); continue; }
  aggFull += r.tokensFull; aggSaved += r.tokensSaved;
  console.log(`\n■ ${r.src}   (root ${r.root})`);
  console.log(`  files:                 ${fmt(r.files)}  (${fmt(r.dupFiles)} exact duplicates)`);
  console.log(`  characters:            ${fmt(r.totalChars)} total  →  ${fmt(r.uniqueChars)} after dedup`);
  console.log(`  EXACT bytes removed:   ${fmt(r.dedupChars)}  (${r.pct.toFixed(1)}% of the codebase, tokenizer-independent)`);
  console.log(`  est. tokens:           ${fmt(r.tokensFull)}  →  ${fmt(r.tokensDedup)}   (saved ~${fmt(r.tokensSaved)})`);
  console.log(`  est. cost per ingest:  ${dollars(r.tokensFull)}`);
  console.log(`  est. saved per ingest: ${dollars(r.tokensSaved)}`);
}

console.log(`\n──────── totals across ${dirs.length} target(s) ────────`);
console.log(`  est. tokens, full:     ${fmt(aggFull)}`);
console.log(`  est. tokens saved:     ${fmt(aggSaved)}  (${aggFull ? ((aggSaved / aggFull) * 100).toFixed(1) : 0}%)`);
console.log(`  est. $ saved / ingest: ${dollars(aggSaved)}`);
console.log(`\nNote: character/byte/duplicate counts are EXACT. Token and dollar figures`);
console.log(`are estimates (chars/4 heuristic at posted pricing). The dedup % is exact`);
console.log(`and holds for any tokenizer. Re-run on your own repos to verify.`);
