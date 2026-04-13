#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const FILES = ['core.js', '3d.js', 'input.js', 'audio.js', 'music.js'];
const JSON_MODE = process.argv.includes('--json');

const SIGNALS = {
  manifoldCalls: /\b(?:M\.|SpaceManifold\.|window\.Manifold|ManifoldIngestor)\b/g,
  directEntityWrites: /state\.entities\.(?:push|splice|filter)|new\s+Entity\(/g,
  directStateWrites: /state\.[a-zA-Z0-9_]+\s*=|state\.[a-zA-Z0-9_]+\+\+|state\.[a-zA-Z0-9_]+\-\-/g,
  directPhysicsOps: /\.position\.|\.velocity\.|\.quaternion\.|\.throttle\s*=|\.yaw\s*=|\.pitch\s*=|\.roll\s*=/g,
};

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function pct(a, b) {
  if (!b) return '0.00';
  return ((a / b) * 100).toFixed(2);
}

let totals = {
  lines: 0,
  manifoldCalls: 0,
  directEntityWrites: 0,
  directStateWrites: 0,
  directPhysicsOps: 0,
};

const byFile = {};

if (!JSON_MODE) {
  console.log('Starfighter Manifold Audit');
  console.log('=========================');
}

for (const file of FILES) {
  const full = path.join(ROOT, file);
  const text = fs.readFileSync(full, 'utf8');
  const lines = text.split('\n').length;

  const row = {
    lines,
    manifoldCalls: countMatches(text, SIGNALS.manifoldCalls),
    directEntityWrites: countMatches(text, SIGNALS.directEntityWrites),
    directStateWrites: countMatches(text, SIGNALS.directStateWrites),
    directPhysicsOps: countMatches(text, SIGNALS.directPhysicsOps),
  };

  totals.lines += row.lines;
  totals.manifoldCalls += row.manifoldCalls;
  totals.directEntityWrites += row.directEntityWrites;
  totals.directStateWrites += row.directStateWrites;
  totals.directPhysicsOps += row.directPhysicsOps;

  const directTotal = row.directEntityWrites + row.directStateWrites + row.directPhysicsOps;
  const manifoldBias = row.manifoldCalls - directTotal;
  const manifoldSignalDensityPct = Number(pct(row.manifoldCalls, row.lines));

  byFile[file] = {
    ...row,
    directTotal,
    manifoldBias,
    manifoldSignalDensityPct,
  };

  if (!JSON_MODE) {
    console.log(`\n${file}`);
    console.log(`  lines: ${row.lines}`);
    console.log(`  manifold calls: ${row.manifoldCalls}`);
    console.log(`  direct entity writes: ${row.directEntityWrites}`);
    console.log(`  direct state writes: ${row.directStateWrites}`);
    console.log(`  direct physics ops: ${row.directPhysicsOps}`);
    console.log(`  manifold signal density: ${pct(row.manifoldCalls, row.lines)}%`);
    console.log(`  manifold bias (calls - direct): ${manifoldBias}`);
  }
}

const totalDirect = totals.directEntityWrites + totals.directStateWrites + totals.directPhysicsOps;
const manifoldPressure = totalDirect > 0 ? (totals.manifoldCalls / totalDirect) : 0;
const report = {
  generatedAt: new Date().toISOString(),
  files: byFile,
  overall: {
    ...totals,
    directTotal: totalDirect,
    manifoldSignalDensityPct: Number(pct(totals.manifoldCalls, totals.lines)),
    manifoldPressureIndex: Number(manifoldPressure.toFixed(3)),
  },
};

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('\nOverall');
console.log('-------');
console.log(`files lines: ${totals.lines}`);
console.log(`manifold calls: ${totals.manifoldCalls}`);
console.log(`direct entity writes: ${totals.directEntityWrites}`);
console.log(`direct state writes: ${totals.directStateWrites}`);
console.log(`direct physics ops: ${totals.directPhysicsOps}`);
console.log(`manifold signal density: ${pct(totals.manifoldCalls, totals.lines)}%`);
console.log(`manifold pressure index (manifold/direct): ${manifoldPressure.toFixed(3)}`);

console.log('\nInterpretation');
console.log('--------------');
console.log('- 1.000 = parity: manifold calls roughly equal direct mutation/physics signals.');
console.log('- < 1.000 means direct imperative logic still dominates.');
console.log('- > 1.000 means manifold-first extraction is dominant.');
