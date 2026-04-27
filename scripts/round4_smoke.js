/**
 * Round 4 smoke — point FastTrack at the unified manifold via the lens layer.
 *
 *   1. Lens loads in Node, exposes field/loop/seedLog/codec
 *   2. observeField returns identical points for identical seeds (determinism)
 *   3. Mode intents (solo/private/join/auto) drive distinct blooms
 *   4. The lens-derived session code matches server/manifold-projection's code
 *      for the same seed — proves cross-process identity parity
 *   5. The lens wraps a plain IIFE substrate without rewriting it
 *   6. appendBloom hooks into a memory log; logged blooms re-derive identically
 */
'use strict';

const path = require('path');
const fs = require('fs');

const Lens = require('../fasttrack/manifold_lens.js');
const Proj = require('../server/manifold-projection.js');
const SLog = require('../js/manifold-seedlog.js');

let pass = 0, fail = 0;
function section(t) { console.log('\n── ' + t + ' '.padEnd(74 - t.length, '─')); }
function ok(c, m) { if (c) { console.log('  ✓ ' + m); pass++; } else { console.log('  ✗ ' + m); fail++; } }

// ── 1. wire-up ─────────────────────────────────────────────────────────────
section('lens wire-up');
ok(Lens.ready === true,                       'Lens.ready === true');
ok(typeof Lens.Field.seedToPoint === 'function', 'Lens.Field.seedToPoint present');
ok(typeof Lens.Loop.cycle === 'function',     'Lens.Loop.cycle present');
ok(typeof Lens.Codec.codeFromSeed === 'function', 'Lens.Codec.codeFromSeed present');
ok(typeof Lens.observeField === 'function',   'Lens.observeField present');
ok(typeof Lens.observe === 'function',        'Lens.observe present');

// ── 2. observeField determinism ────────────────────────────────────────────
section('observeField — deterministic across calls');
const seedA = [3, 1, 4, 1, 5, 9];
const v1 = Lens.observeField(seedA);
const v2 = Lens.observeField(seedA);
ok(v1.point.x === v2.point.x && v1.point.y === v2.point.y && v1.point.z === v2.point.z,
   `same seed → same point (${v1.point.x.toFixed(3)}, ${v1.point.y.toFixed(3)}, ${v1.point.z.toFixed(3)})`);
ok(v1.value === v2.value,                     `same seed → same value (${v1.value.toFixed(3)})`);
ok(typeof v1.gradient.x === 'number' && typeof v1.gradient.y === 'number',
   'gradient present and numeric');

// ── 3. mode intents drive distinct blooms ──────────────────────────────────
section('mode intents — solo / private / join / auto produce distinct blooms');
const parent = { id: 'parent', parent: null, dim: 0, seed: seedA, t: 0, meta: { kind: 'test' } };
const blooms = {};
for (const mode of ['solo', 'private', 'join', 'auto']) {
  const r = Lens.observe(parent, Lens.intentFor(mode));
  blooms[mode] = r.x;
  ok(Array.isArray(r.x.seed) && r.x.seed.length === seedA.length,
     `${mode} → bloom seed length matches parent (${r.x.seed.length})`);
}
const codes = new Set(Object.values(blooms).map(x => Lens.deriveCode(x.seed)));
ok(codes.size === 4, `4 modes ⇒ 4 distinct codes (got ${codes.size}: ${[...codes].join(', ')})`);

// ── 4. cross-process identity parity with server projection ────────────────
section('cross-process parity — Lens.deriveCode === Proj.codeFromSeed');
const probeSeeds = [
  [1, 1, 1, 1, 1, 1],
  [3.14, 1.41, 1.73, 2.71, 0.57, 1.61],
  seedA,
  blooms.solo.seed,
  blooms.private.seed,
];
let parityCount = 0;
for (const s of probeSeeds) {
  const lensCode = Lens.deriveCode(s);
  const servCode = Proj.codeFromSeed(s);
  const match = lensCode === servCode;
  if (match) parityCount++;
  ok(match, `seed=${JSON.stringify(s).slice(0, 40)}…  lens=${lensCode} server=${servCode}`);
}
ok(parityCount === probeSeeds.length, `${parityCount}/${probeSeeds.length} seeds match server projection`);

// ── 5. wrap an existing IIFE-style FastTrack substrate ─────────────────────
section('wrap — retrofit an IIFE substrate without rewriting it');
const FakePegSubstrate = (function () {
  const pegs = new Map();
  return {
    name: 'PegSubstrate',
    create(id, color) { pegs.set(id, { id, color, hops: 0 }); return pegs.get(id); },
    move(id, n) { const p = pegs.get(id); if (p) p.hops += n; return p; },
    all() { return [...pegs.values()]; },
  };
})();
ok(typeof FakePegSubstrate.observeField === 'undefined', 'pre-wrap: no observeField');
Lens.wrap('peg', FakePegSubstrate);
ok(typeof FakePegSubstrate.observeField === 'function', 'post-wrap: observeField present');
ok(typeof FakePegSubstrate.observe === 'function',      'post-wrap: observe present');
ok(typeof FakePegSubstrate.deriveCode === 'function',   'post-wrap: deriveCode present');
ok(FakePegSubstrate._lensName === 'peg',                'post-wrap: _lensName tagged');
ok(typeof FakePegSubstrate.create === 'function',       'original methods preserved (create)');
const wrappedView = FakePegSubstrate.observeField([7, 7, 7]);
ok(typeof wrappedView.value === 'number',               `wrapped lens reads field (value=${wrappedView.value.toFixed(3)})`);

// ── 6. appendBloom routes through opt-in seed log ──────────────────────────
section('appendBloom — opt-in seed log records lens activity');
const memLog = SLog.memory();
Lens.bindLog(memLog);
const before = memLog.count();
const x1 = Lens.appendBloom(parent, Lens.intentFor('move'),    { kind: 'event', action: 'move',    peg_id: 'red-1' });
const x2 = Lens.appendBloom(x1,     Lens.intentFor('capture'), { kind: 'event', action: 'capture', target: 'blue-2' });
const x3 = Lens.appendBloom(x2,     Lens.intentFor('finish_peg'), { kind: 'event', action: 'finish_peg', peg_id: 'red-1' });
const after = memLog.count();
ok(after === before + 3, `seed log grew by 3 (was ${before}, now ${after})`);
ok(x2.parent === x1.id && x3.parent === x2.id, 'bloom chain links parents correctly');
ok(memLog.latest().id === x3.id, 'latest() returns the last appendBloom');

// ── 7. determinism through replay ──────────────────────────────────────────
section('replay — re-driving same intents reproduces identity');
const memLog2 = SLog.memory();
Lens.bindLog(memLog2);
const y1 = Lens.appendBloom(parent, Lens.intentFor('move'), { kind: 'event', action: 'move', peg_id: 'red-1' });
ok(Lens.deriveCode(y1.seed) === Lens.deriveCode(x1.seed),
   `replay y1 (${Lens.deriveCode(y1.seed)}) === original x1 (${Lens.deriveCode(x1.seed)})`);

// ── summary ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(74));
console.log(`  ROUND 4: ${pass} passed, ${fail} failed`);
console.log('═'.repeat(74));
process.exit(fail === 0 ? 0 : 1);
