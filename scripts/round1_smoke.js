// Round 1 smoke test: observe → solve → collapse → bloom + seed log.
// Runs a chain, then re-opens the file with a fresh handle and verifies
// the on-disk replay reproduces the in-memory frontier exactly.

'use strict';
const fs = require('fs');
const path = require('path');

const Field = require('../js/manifold-field.js');
const Loop  = require('../js/manifold-loop.js');
const SLog  = require('../js/manifold-seedlog.js');
const M     = require('../js/manifold.js');

const LOG_PATH = path.join(__dirname, '..', 'state', 'round1-smoke.jsonl');

function clean() {
  try { fs.unlinkSync(LOG_PATH); } catch (e) {}
}

function eqSeed(a, b, eps) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > (eps || 1e-12)) return false;
  return true;
}

function main() {
  console.log('--- Manifold exposure ---');
  console.log('Manifold.field   present?', !!M.field,   ' same?', M.field   === Field);
  console.log('Manifold.loop    present?', !!M.loop,    ' same?', M.loop    === Loop);
  console.log('Manifold.seedLog present?', !!M.seedLog, ' same?', M.seedLog === SLog);

  clean();
  const log = SLog.file(LOG_PATH);
  console.log('\n--- Open file log ---');
  console.log('kind=', log.kind, ' path=', log.path, ' starting count=', log.count());

  // Genesis seed: a 3-vector identity at dim 0.
  const x0 = { id: 'genesis', dim: 0, parent: null, seed: [1, 2, 3] };
  log.append(x0);
  console.log('\n--- Genesis ---');
  console.log('x0 =', x0);

  // 5-step bloom chain. Intent rotates each step so y is non-trivial.
  let cur = x0;
  const chain = [x0];
  console.log('\n--- 5-step chain ---');
  for (let step = 1; step <= 5; step++) {
    const intent = [Math.cos(step), Math.sin(step), Math.cos(step * 0.5)];
    const r = Loop.cycle(cur, intent, log);
    console.log(
      'step', step,
      ' value=', r.obs.value.toFixed(4),
      ' z.scalar=', r.z.scalar.toFixed(4),
      ' x\'.id=', r.x.id,
      ' x\'.dim=', r.x.dim,
      ' x\'.seed=', r.x.seed.map(function (v) { return v.toFixed(3); }).join(',')
    );
    chain.push(r.x);
    cur = r.x;
  }

  console.log('\n--- In-memory frontier ---');
  console.log('log.count()=', log.count(), ' (expect 6: genesis + 5 blooms)');
  const snap = log.snapshot();
  console.log('snapshot.length=', snap.length, ' latest.id=', log.latest().id);

  // Now re-open the file with a fresh handle: the bloom chain must replay
  // bit-identical from disk.
  console.log('\n--- Replay from disk ---');
  const log2 = SLog.file(LOG_PATH);
  console.log('reopened count=', log2.count());
  if (log2.count() !== log.count()) {
    console.error('FAIL: replay count mismatch');
    process.exit(1);
  }

  let allMatch = true;
  log.replay(function (seed, i) {
    const seed2 = log2.snapshot()[i] || null;
    // snapshot() dedupes by id; for a strict replay use the raw line order.
    // Build raw lines from disk for a true bit-equality check.
  });

  const raw = fs.readFileSync(LOG_PATH, 'utf8').split(/\n/).filter(function (s) { return !!s; });
  for (let i = 0; i < chain.length; i++) {
    const onDisk = JSON.parse(raw[i]);
    if (onDisk.id !== chain[i].id) { allMatch = false; console.error('FAIL id at', i, onDisk.id, '!=', chain[i].id); }
    if (!eqSeed(onDisk.seed, chain[i].seed, 1e-12)) { allMatch = false; console.error('FAIL seed at', i); }
    if (onDisk.dim !== chain[i].dim) { allMatch = false; console.error('FAIL dim at', i); }
  }
  console.log('replay bit-identical?', allMatch);

  // Determinism: same x + same intent → same bloom (no log writes).
  console.log('\n--- Determinism ---');
  const a = Loop.cycle(x0, [1, 0, 0]);
  const b = Loop.cycle(x0, [1, 0, 0]);
  const det = a.x.id === b.x.id && eqSeed(a.x.seed, b.x.seed);
  console.log('two runs of same (x, intent) →', det ? 'IDENTICAL' : 'DIVERGED');

  // Edge case: zero intent → y is zero → z is zero → bloom safe-divides to 0.
  console.log('\n--- Edge: zero intent ---');
  const zr = Loop.cycle(x0, [0, 0, 0]);
  console.log('y=', zr.y, ' z.scalar=', zr.z.scalar, ' x\'.seed=', zr.x.seed);

  if (!allMatch || !det) {
    console.error('\nROUND 1 SMOKE: FAIL');
    process.exit(1);
  }
  console.log('\nROUND 1 SMOKE: PASS');
}

main();
