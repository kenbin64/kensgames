#!/usr/bin/env node
/**
 * ============================================================
 * calculateValidMoves() DECOMPOSITION REGRESSION TEST
 *
 * Guards the 2026-06-05 refactor that split the ~630-line
 * calculateValidMoves() monolith into:
 *     collectPegMoves(pi)         — per-peg move collection
 *     collectSevenSplitMoves()    — the Card-7 split pass
 * driven in the original order.
 *
 * This is a GREEN forward-signal suite (the legacy
 * test_card7_splits.js is an older fingerprint that is
 * intentionally left as-is). It asserts:
 *   1. the extracted collectors exist and are wired,
 *   2. calculateValidMoves never throws across a wide spread
 *      of card values and peg placements,
 *   3. it is deterministic (same state → same moves),
 *   4. every emitted move is structurally well-formed.
 *
 * Run: node fasttrack/test_calculate_valid_moves.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Browser stubs (mirrors test_card7_splits.js) ───────────
class StubEl {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; }
  appendChild() {} setAttribute() {} addEventListener() {} removeChild() {} remove() {}
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null, createElement: () => new StubEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: new StubEl(), head: new StubEl(), addEventListener: () => {},
};
global.window = {
  dispatchEvent: () => {}, addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// ─── Load core ──────────────────────────────────────────────
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
var _core = globalThis.__core;
var state = _core.state;
var CARDS = _core.CARDS;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

// ─── Harness ────────────────────────────────────────────────
let pass = 0, fail = 0; const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(l) { console.log(`\n── ${l} ──`); }

function reset() {
  ['players','board','deck','turn','movement','safeZone','meta','cards','holes','pegs']
    .forEach(k => state[k]._data.clear());
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}
function pegType(hole) {
  return hole === 'holding' ? 'holding'
    : hole.startsWith('home-') ? 'home'
    : hole.startsWith('ft-') ? 'fasttrack'
    : hole.startsWith('safe-') ? 'safezone' : 'outer';
}
function makePlayer(idx, bp, specs) {
  const pegs = specs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole, holeType: pegType(s.hole),
    onFasttrack: !!s.onFasttrack, eligibleForSafeZone: !!s.eligibleForSafeZone,
    lockedToSafeZone: false, mustExitFasttrack: false,
    fasttrackEntryHole: s.onFasttrack ? s.hole : null,
  }));
  return { id: `player${idx}`, name: `P${idx}`, boardPosition: bp, pegs };
}
function place(players) {
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeType !== 'holding' && pg.holeType !== 'home') {
      const pi = players.indexOf(pl);
      state.board.set(pg.holeId, { playerIdx: pi, pegId: pg.id });
    }
  }
  state.players.set('list', players);
}
function setCard(value) { state.deck.set('currentCard', { value, suit: 'spades' }); }

// ─── 1. Decomposition is present and wired ──────────────────
section('Decomposition present and wired');
ok(/function collectPegMoves\s*\(/.test(coreSrc), 'collectPegMoves(pi) is defined');
ok(/function collectSevenSplitMoves\s*\(/.test(coreSrc), 'collectSevenSplitMoves() is defined');
ok(/for \(let pi = 0; pi < player\.pegs\.length; pi\+\+\) collectPegMoves\(pi\)/.test(coreSrc),
   'per-peg driver calls collectPegMoves for every peg');
ok(/\bcollectSevenSplitMoves\(\)\s*;/.test(coreSrc), 'driver invokes collectSevenSplitMoves()');

// ─── 2. Never throws across a wide spread ───────────────────
section('calculateValidMoves never throws across card × placement spread');
const HOLES = ['holding', 'home-0', 'ft-0', 'ft-3', 'outer-0-1', 'outer-3-5',
  'side-left-2-3', 'safe-0-1', 'safe-0-3', 'bullseye'];
let threw = 0, runs = 0, nonArray = 0;
// Prime the card matrix, then collect only real (non-null) card values —
// CARDS is the authoritative deck-value matrix, populated by buildCardMatrix().
reset();
const CARD_VALUES = [];
for (let v = 1; v <= 14; v++) if (CARDS[v]) CARD_VALUES.push(v);
for (const k of Object.keys(CARDS)) if (CARDS[k] && !CARD_VALUES.includes(+k)) CARD_VALUES.push(+k);
ok(CARD_VALUES.length > 0, `CARDS matrix has ${CARD_VALUES.length} real card values`);
for (const value of CARD_VALUES) {
  for (let h1 = 0; h1 < HOLES.length; h1++) {
    for (let h2 = 0; h2 < HOLES.length; h2++) {
      reset();
      const onFt1 = HOLES[h1].startsWith('ft-');
      const onFt2 = HOLES[h2].startsWith('ft-');
      const p0 = makePlayer(0, 0, [
        { hole: HOLES[h1], onFasttrack: onFt1, eligibleForSafeZone: true },
        { hole: HOLES[h2], onFasttrack: onFt2, eligibleForSafeZone: true },
      ]);
      const p1 = makePlayer(1, 3, [{ hole: 'outer-3-1' }]);
      place([p0, p1]);
      setCard(value);
      runs++;
      try {
        calculateValidMoves();
        const mv = state.turn.get('validMoves');
        if (!Array.isArray(mv)) nonArray++;
      } catch (e) { threw++; if (threw <= 3) console.log(`     threw: card=${value} ${HOLES[h1]}/${HOLES[h2]} :: ${e.message}`); }
    }
  }
}
ok(threw === 0, `no exceptions across ${runs} scenarios`, threw ? `${threw} threw` : '');
ok(nonArray === 0, 'validMoves is always an array', nonArray ? `${nonArray} non-array` : '');

// ─── 3. Deterministic ───────────────────────────────────────
section('Deterministic (same state → same moves)');
function snapshotMoves(value, specs0) {
  reset();
  const p0 = makePlayer(0, 0, specs0);
  const p1 = makePlayer(1, 3, [{ hole: 'outer-3-1' }]);
  place([p0, p1]); setCard(value);
  calculateValidMoves();
  return JSON.stringify(state.turn.get('validMoves'));
}
const specsA = [{ hole: 'ft-0', onFasttrack: true, eligibleForSafeZone: true }, { hole: 'outer-0-5' }];
const run1 = snapshotMoves(7, specsA);
const run2 = snapshotMoves(7, specsA);
ok(run1 === run2, 'identical moves on repeat (Card 7, FT peg)');
const specsB = [{ hole: 'outer-0-3' }, { hole: 'safe-0-2' }];
ok(snapshotMoves(5, specsB) === snapshotMoves(5, specsB), 'identical moves on repeat (Card 5)');

// ─── 4. Every move is well-formed ───────────────────────────
section('Emitted moves are structurally well-formed');
reset();
const fp0 = makePlayer(0, 0, [
  { hole: 'outer-0-3' }, { hole: 'ft-0', onFasttrack: true, eligibleForSafeZone: true },
]);
place([fp0, makePlayer(1, 3, [{ hole: 'outer-3-1' }])]);
setCard(7);
calculateValidMoves();
const allMoves = state.turn.get('validMoves') || [];
let malformed = 0;
for (const m of allMoves) {
  if (typeof m.type !== 'string') { malformed++; continue; }
  if (typeof m.pegIdx !== 'number') { malformed++; continue; }
  if (m.type === 'split' && typeof m.peg2Idx !== 'number') { malformed++; continue; }
  if (!('dest' in m)) { malformed++; continue; }
}
ok(allMoves.length > 0, `Card 7 with an FT peg produced moves`, `got ${allMoves.length}`);
ok(malformed === 0, 'all moves have type + pegIdx + dest (splits have peg2Idx)',
   malformed ? `${malformed} malformed` : '');

// ─── Summary ────────────────────────────────────────────────
console.log(`\n══════════════════════`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`══════════════════════`);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)); process.exit(1); }
// Exit explicitly: the suite passed, but a lingering timer from the game core
// keeps the event loop alive and CI would hang on a green run.
process.exit(0);
