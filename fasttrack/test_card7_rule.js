#!/usr/bin/env node
/**
 * ============================================================
 * CARD 7 — THE RULE
 *
 * Pins the classic rule as stated, so it cannot drift again:
 *
 *   "If there is only one playable peg then it must make 7 legal moves.
 *    If two or more pegs, two pegs can be split for a total combined
 *    of 7 legal moves."
 *
 * The 7 has been changed between split and wild several times, and each
 * change left some part of the codebase describing the previous rule. This
 * suite asserts the RULE rather than the implementation, so whichever way the
 * engine is refactored, a regression is caught here.
 *
 * Run: node fasttrack/test_card7_rule.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ─── Browser environment stubs ──────────────────────────────
class StubElement {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; }
  appendChild() {} setAttribute() {} addEventListener() {} removeChild() {} remove() {}
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null,
  createElement: () => new StubElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: new StubElement(),
  head: new StubElement(),
  addEventListener: () => {},
};
global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);

var _core = globalThis.__core;
var state = _core.state;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(label) { console.log(`\n── ${label} ──`); }

function reset() {
  for (const k of ['players','board','deck','turn','movement','safeZone','meta','cards','holes','pegs']) {
    state[k]._data.clear();
  }
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}

function makePlayer(idx, bp, specs) {
  const pegs = specs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole,
    holeType: s.hole === 'holding' ? 'holding'
      : s.hole.startsWith('home-') ? 'home'
      : s.hole.startsWith('ft-') ? 'fasttrack'
      : s.hole.startsWith('safe-') ? 'safezone'
      : s.hole.startsWith('side-left') ? 'side-left'
      : s.hole.startsWith('side-right') ? 'side-right'
      : s.hole.startsWith('outer-') ? 'outer'
      : s.hole === 'bullseye' ? 'bullseye' : 'holding',
    onFasttrack: !!s.onFasttrack,
    eligibleForSafeZone: !!s.eligibleForSafeZone,
    lockedToSafeZone: false, completedCircuit: false,
    fasttrackEntryHole: s.onFasttrack ? `ft-${(bp + 1) % 6}` : null,
    mustExitFasttrack: false,
    personality: 'NEUTRAL', mood: 'EAGER', captureCount: 0, timesCaptured: 0,
  }));
  return { index: idx, name: `P${idx}`, color: '#fff', boardPosition: bp, isBot: false, pegs };
}

function setup(p0Specs, card = '7') {
  reset();
  const players = [makePlayer(0, 0, p0Specs), makePlayer(1, 3, [{ hole: 'holding' }])];
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
  }
  state.players.set('list', players);
  state.players.set('count', 2);
  state.deck.set('currentCard', { ...state.cards.get(card), value: card, display: `${card}♠` });
  calculateValidMoves();
  return state.turn.get('validMoves') || [];
}

const OUTER = CLOCKWISE_TRACK.filter(h => h.startsWith('outer-'));

console.log('CARD 7 — THE RULE');
console.log('='.repeat(62));

// ───────────────────────────────────────────────────────────
section('The mode switch is classic, and code matches rules.json');

const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'fasttrack.rules.json'), 'utf8'));
const card7 = rulesJson.cards['7'];
ok(card7.mode === 'classic', `rules.json cards.7.mode is 'classic'`, `got ${card7.mode}`);
ok(card7.can_split === true, 'rules.json cards.7.can_split is true', `got ${card7.can_split}`);
ok(card7.wild_range === undefined, 'rules.json no longer declares a wild_range');
ok(/const SEVEN_MODE = 'classic'/.test(coreSrc),
   `engine SEVEN_MODE is 'classic' and matches rules.json`);
ok(card7.movement === 7, 'a 7 still moves 7', `got ${card7.movement}`);

// ───────────────────────────────────────────────────────────
section('One playable peg → it must make the full 7, and never a split');

{
  // A single peg on the open track, nothing else in play.
  const moves = setup([{ hole: OUTER[0] }, { hole: 'holding' }, { hole: 'holding' }]);
  const splits = moves.filter(m => m.type === 'split');
  const solos = moves.filter(m => m.type !== 'split');

  ok(splits.length === 0, 'one playable peg produces no split', `got ${splits.length}`);
  ok(solos.length >= 1, 'one playable peg still has a legal move', `got ${solos.length}`);
  ok(solos.every(m => m.steps === 7 || m.steps == null),
     'every solo move travels the full 7',
     `steps seen: ${[...new Set(solos.map(m => m.steps))].join(',')}`);
  // The wild rule would have produced distances 1..6 as well. This is the
  // assertion that fails loudest if wild is ever switched back on by accident.
  ok(!solos.some(m => m.steps != null && m.steps >= 1 && m.steps <= 6),
     'no partial-distance move is offered (this is what wild 1..7 would add)');
}

{
  // Pegs in holding are not "playable" on a 7: the 7 cannot release from
  // holding, so four pegs in holding plus one on the track is still one peg.
  const moves = setup([
    { hole: OUTER[2] }, { hole: 'holding' }, { hole: 'holding' },
    { hole: 'holding' }, { hole: 'holding' },
  ]);
  ok(moves.filter(m => m.type === 'split').length === 0,
     'pegs in holding do not count toward the two needed to split');
}

// ───────────────────────────────────────────────────────────
section('Two or more playable pegs → split across two, totalling 7');

{
  const moves = setup([{ hole: OUTER[0] }, { hole: OUTER[6] }]);
  const splits = moves.filter(m => m.type === 'split');

  ok(splits.length > 0, 'two playable pegs produce splits', `got ${splits.length}`);
  ok(splits.every(m => (m.steps || 0) + (m.steps2 || 0) === 7),
     'every split totals exactly 7',
     `bad sums: ${splits.filter(m => (m.steps||0)+(m.steps2||0) !== 7)
                       .map(m => `${m.steps}+${m.steps2}`).slice(0,4).join(' ')}`);
  ok(splits.every(m => m.pegIdx !== m.peg2Idx),
     'a split always uses two different pegs');
  ok(splits.every(m => m.steps >= 1 && m.steps2 >= 1),
     'neither half of a split is zero (that would be a solo 7 in disguise)');
  ok(splits.every(m => m.dest !== m.dest2),
     'the two halves never land on the same hole');

  // The solo 7 stays on offer alongside the split: "can be split", not "must".
  const solos = moves.filter(m => m.type !== 'split');
  ok(solos.length > 0, 'the solo 7 is still offered when a split is also legal',
     `got ${solos.length}`);
}

{
  // Both orderings of a pair should be reachable, so a+b and b+a are both
  // available to the player rather than one arbitrary half being dropped.
  const moves = setup([{ hole: OUTER[0] }, { hole: OUTER[6] }]);
  const splits = moves.filter(m => m.type === 'split');
  const sums = new Set(splits.map(m => `${m.steps}+${m.steps2}`));
  ok(sums.size >= 6, 'the full range of 7 partitions is offered (1+6 … 6+1)',
     `got ${sums.size}: ${[...sums].sort().join(' ')}`);
}

// ───────────────────────────────────────────────────────────
section('No legal way to make 7 → the turn yields no moves');

{
  // Two pegs deep in the safe zone: the most either can advance is 3 and 2,
  // so neither a solo 7 nor any split summing to 7 exists.
  const moves = setup([{ hole: 'safe-0-1' }, { hole: 'safe-0-2' }]);
  ok(moves.length === 0,
     'a 7 with no legal 7-total is correctly forfeited rather than fudged',
     `got ${moves.length} moves`);
}

// ───────────────────────────────────────────────────────────
section('The shared card object is never left corrupted');

{
  setup([{ hole: OUTER[0] }, { hole: OUTER[6] }]);
  const card = state.cards.get('7');
  ok(card.movement === 7,
     'CARDS[7].movement is still 7 after generating moves',
     `got ${card.movement}`);
  ok(card.moves === 7, 'CARDS[7].moves is still 7', `got ${card.moves}`);
}

console.log('\n══════════════════════');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('══════════════════════');
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
  process.exit(1);
}
process.exit(0);
