#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
}

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

const baselinePerfPath = arg('--baseline-perf');
const candidatePerfPath = arg('--candidate-perf');
const baselineAuditPath = arg('--baseline-audit');
const candidateAuditPath = arg('--candidate-audit');

if (!baselinePerfPath || !candidatePerfPath || !baselineAuditPath || !candidateAuditPath) {
  console.error('Usage: node proof_gate.js --baseline-perf <file> --candidate-perf <file> --baseline-audit <file> --candidate-audit <file>');
  process.exit(2);
}

const baselinePerf = readJSON(baselinePerfPath);
const candidatePerf = readJSON(candidatePerfPath);
const baselineAudit = readJSON(baselineAuditPath);
const candidateAudit = readJSON(candidateAuditPath);

function pickNum(obj, keys, fallback = 0) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

const baseFps = pickNum(baselinePerf, ['fpsAvg']);
const candFps = pickNum(candidatePerf, ['fpsAvg']);
const baseP95 = pickNum(baselinePerf, ['frameTimeP95Ms', 'frameP95Ms']);
const candP95 = pickNum(candidatePerf, ['frameTimeP95Ms', 'frameP95Ms']);
const baseHeap = baselinePerf && baselinePerf.memory ? pickNum(baselinePerf.memory, ['usedJSHeapSize']) : null;
const candHeap = candidatePerf && candidatePerf.memory ? pickNum(candidatePerf.memory, ['usedJSHeapSize']) : null;

const checks = [];
function check(name, pass, detail) { checks.push({ name, pass, detail }); }

// Performance non-regression (strict)
const fpsFloor = baseFps * 0.97; // max 3% drop
check(
  'FPS non-regression',
  candFps >= fpsFloor,
  `candidate ${candFps.toFixed(2)} vs floor ${fpsFloor.toFixed(2)} (baseline ${baseFps.toFixed(2)})`
);

const p95Ceil = baseP95 * 1.05; // max 5% worse
check(
  'Frame-time p95 non-regression',
  candP95 <= p95Ceil,
  `candidate ${candP95.toFixed(3)}ms vs ceil ${p95Ceil.toFixed(3)}ms (baseline ${baseP95.toFixed(3)}ms)`
);

if (baseHeap && candHeap) {
  const memCeil = baseHeap * 1.10; // max 10% increase
  check(
    'JS heap non-regression',
    candHeap <= memCeil,
    `candidate ${candHeap} vs ceil ${Math.round(memCeil)} (baseline ${baseHeap})`
  );
}

// Manifold-derivation improvement (must move forward)
const basePressure = baselineAudit.overall.manifoldPressureIndex;
const candPressure = candidateAudit.overall.manifoldPressureIndex;
const minPressure = Math.max(basePressure + 0.01, basePressure * 1.10); // +0.01 absolute or +10%
check(
  'Manifold pressure improvement',
  candPressure >= minPressure,
  `candidate ${candPressure.toFixed(3)} vs min ${minPressure.toFixed(3)} (baseline ${basePressure.toFixed(3)})`
);

const baseDensity = baselineAudit.overall.manifoldSignalDensityPct;
const candDensity = candidateAudit.overall.manifoldSignalDensityPct;
check(
  'Manifold signal density improvement',
  candDensity > baseDensity,
  `candidate ${candDensity.toFixed(2)}% vs baseline ${baseDensity.toFixed(2)}%`
);

const failed = checks.filter(c => !c.pass);
console.log('Proof Gate Report');
console.log('=================');
checks.forEach(c => {
  console.log(`${c.pass ? 'PASS' : 'FAIL'}: ${c.name}`);
  console.log(`  ${c.detail}`);
});

if (failed.length > 0) {
  console.log(`\nGate status: FAIL (${failed.length} checks failed)`);
  process.exit(1);
}

console.log('\nGate status: PASS (non-regression + manifold gain verified)');
