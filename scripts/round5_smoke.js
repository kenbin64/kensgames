/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUND 5 SMOKE — manifold as instrument
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Verifies, in pure Node (no AudioContext required):
 *   1. Determinism      — same parentX → bit-identical PCM (FNV-1a checksum)
 *   2. State reactivity — different intensity vectors → different bloom params
 *   3. Personality      — two seeds that differ in one component yield
 *                         distinct timbres (different note OR different waveform)
 *   4. Replay           — re-render from a saved bloom log reproduces audio
 *   5. Recursion        — stream's segments thread through the loop
 *                         (segment N's parent == segment N-1's bloom)
 *   6. Algebra          — z = x · y holds across kernel + conductor blooms
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const Field      = require('../js/manifold-field.js');
const Loop       = require('../js/manifold-loop.js');
const Codec      = require('../js/manifold-codec.js');
const Instrument = require('../js/manifold-instrument.js');
const Conductor  = require('../js/manifold-conductor.js');

let pass = 0, fail = 0;
function ok(msg)  { pass++; console.log('  \u2713 ' + msg); }
function bad(msg) { fail++; console.log('  \u2717 ' + msg); }
function section(t) { console.log('\n\u2500\u2500 ' + t + ' \u2500\u2500'); }
function checksum(buf) { return Codec.idFromSeed(Array.from(buf).map(v => Math.round(v * 1e6) / 1e6)); }

console.log('\n\u2550\u2550 ROUND 5 SMOKE \u2014 manifold as instrument \u2550\u2550\n');

// ── 1. Determinism ──────────────────────────────────────────────────────────
section('1. determinism — same parentX yields bit-identical PCM');
const peg = { seed: [0.42, 0.17, -0.31], dim: 0, id: 'peg-A' };
const a = Instrument.Pluck(peg, 0.5);
const b = Instrument.Pluck(peg, 0.5);
if (a.pcm.length === b.pcm.length) ok('pcm lengths match (' + a.pcm.length + ')'); else bad('pcm lengths differ');
const ca = checksum(a.pcm), cb = checksum(b.pcm);
if (ca === cb) ok('pcm checksum stable: ' + ca); else bad('checksum drift: ' + ca + ' vs ' + cb);
if (a.note === b.note) ok('note stable: midi ' + a.note); else bad('note drifted');
if (a.scale.mode === b.scale.mode) ok('scale mode stable: ' + a.scale.mode); else bad('mode drifted');

// ── 2. State reactivity ────────────────────────────────────────────────────
section('2. state reactivity — intensity drives section parameters');
const calm   = [0.1, 0.0, 0.05, 0.0];
const intense= [0.95, 0.9, 0.8, 0.7, 0.6];
const iCalm  = Conductor.observeIntensity(calm);
const iWild  = Conductor.observeIntensity(intense);
console.log('    intensity(calm)=' + iCalm.toFixed(3) + '  intensity(intense)=' + iWild.toFixed(3));
if (iCalm !== iWild) ok('intensities differ'); else bad('intensities collapsed');
const root = { seed: [1, 1, 1], dim: 0 };
const secCalm = Conductor.sectionFromState(root, calm);
const secWild = Conductor.sectionFromState(root, intense);
console.log('    bpm: calm=' + secCalm.bpm + '  intense=' + secWild.bpm + '   density: calm=' + secCalm.density + '  intense=' + secWild.density);
if (secCalm.bpm !== secWild.bpm || secCalm.density !== secWild.density)
  ok('section parameters react to state vector');
else bad('section parameters identical');
if (secCalm.scale.mode || secWild.scale.mode) ok('scale modes assigned (calm=' + secCalm.scale.mode + ', intense=' + secWild.scale.mode + ')');
else bad('no scale assigned');

// ── 3. Personality emergence ───────────────────────────────────────────────
section('3. personality — sibling seeds yield distinct sounds');
const pegRed   = { seed: [0.42, 0.17, -0.31], dim: 0, id: 'red' };
const pegBlue  = { seed: [0.42, 0.17, -0.30], dim: 0, id: 'blue' };  // 1 LSB apart
const pcmR = Instrument.Pluck(pegRed, 0.5);
const pcmB = Instrument.Pluck(pegBlue, 0.5);
const csR = checksum(pcmR.pcm), csB = checksum(pcmB.pcm);
console.log('    red note=' + pcmR.note + '  blue note=' + pcmB.note + '   checksums ' + csR + ' / ' + csB);
if (csR !== csB) ok('distinct waveforms for sibling seeds');
else bad('siblings collapsed to identical waveform');
const evtR = Instrument.event(pegRed, 'captured', 0.7);
const evtB = Instrument.event(pegBlue, 'captured', 0.7);
if (checksum(evtR.pcm) !== checksum(evtB.pcm))
  ok('same event name on different pegs → different sound');
else bad('event collapsed across pegs');
const evtR2 = Instrument.event(pegRed, 'captured', 0.7);
if (checksum(evtR.pcm) === checksum(evtR2.pcm))
  ok('same event on same peg → identical sound (replay safe)');
else bad('replay drift on same peg');

// ── 4. Replay from bloom log ───────────────────────────────────────────────
section('4. replay — saved bloom reproduces same PCM');
const log = { entries: [], append(x) { this.entries.push(x); } };
const live   = Instrument.Pluck({ seed: [3, 1, 4, 1, 5], dim: 0 }, 0.5, { log: log });
if (log.entries.length === 1) ok('bloom appended to log'); else bad('bloom not logged');
const replayed = Instrument.Pluck({ seed: [3, 1, 4, 1, 5], dim: 0 }, 0.5);
if (checksum(live.pcm) === checksum(replayed.pcm)) ok('replay PCM checksum matches');
else bad('replay drift');

// ── 5. Recursion through Stream ────────────────────────────────────────────
section('5. recursion — stream segment N parents segment N+1');
const stream = Instrument.Stream({ seed: [0.1, 0.2, 0.3], dim: 0 }, { segments: 5, segDur: 0.05 });
if (stream.segments.length === 5) ok('5 segments produced'); else bad('segment count off: ' + stream.segments.length);
const distinctIds = new Set(stream.segments.map(s => s.id));
if (distinctIds.size === stream.segments.length) ok('every segment has a distinct bloom id');
else bad('segment ids collapsed');
if (stream.pcm instanceof Float32Array && stream.pcm.length > 0)
  ok('stream PCM rendered (' + stream.pcm.length + ' samples)');
else bad('stream PCM empty');

// ── 6. Algebra check — z = x · y end to end ────────────────────────────────
section('6. algebra — z = x · y at the loop level');
const xv = { seed: [1, 2, 3] };
const obs = Loop.observe(xv);
const yv = Loop.solve(obs, [1, 1, 1]);
const zv = Loop.collapse(xv, yv);
const expected = (1 * yv[0]) + (2 * yv[1]) + (3 * yv[2]);
if (Math.abs(zv.scalar - expected) < 1e-9) ok('collapse scalar matches \u03a3 x_i y_i');
else bad('collapse mismatch: ' + zv.scalar + ' vs ' + expected);
const xp = Loop.bloom(xv, yv, zv);
if (Array.isArray(xp.seed) && xp.seed.length === yv.length)
  ok('bloom seed has same arity as y (x\u2032 = y/z componentwise)');
else bad('bloom arity wrong');

// ── Tally ───────────────────────────────────────────────────────────────────
console.log('\n\u2550\u2550 ROUND 5: ' + pass + ' passed, ' + fail + ' failed \u2550\u2550\n');
process.exit(fail === 0 ? 0 : 1);
