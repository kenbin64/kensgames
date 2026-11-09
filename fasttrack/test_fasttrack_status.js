#!/usr/bin/env node
/**
 * ============================================================
 * FAST-TRACK STATUS: KEPT ON THE RING UNTIL ITS OWN HOLE
 * Validates _ftRuleOK, collision guard, bullseye gating, and
 * FT-priority filtering on top of fasttrack-game-core.js.
 * Run: node fasttrack/test_fasttrack_status.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ─── Browser environment stubs ──────────────────────────────
class StubElement {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; }
  appendChild() { } setAttribute() { } addEventListener() { } removeChild() { } remove() { }
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null,
  createElement: () => new StubElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: new StubElement(),
  head: new StubElement(),
  addEventListener: () => { },
};
global.window = {
  dispatchEvent: () => { },
  addEventListener: () => { },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// ─── Load game core into this scope ─────────────────────────
// Direct eval of `const state = …` doesn't leak the binding; instead we
// rewrite the trailing `window.FastTrackCore = {…}` to expose symbols on
// `globalThis.__core` so tests can read them.
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
// In non-strict eval, top-level function declarations leak to the surrounding
// scope, so `calculateValidMoves`, `getTrackSequence`, `buildCardMatrix` etc.
// are already visible here. Top-level `const`s (state, CARDS, CLOCKWISE_TRACK)
// do NOT leak — read those off `globalThis.__core`. Use `var` to avoid TDZ /
// re-declaration conflicts with the leaked function names.
var _core = globalThis.__core;
var state = _core.state;
var CARDS = _core.CARDS;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

// ─── Test harness ───────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(label) { console.log(`\n── ${label} ──`); }

// ─── Scenario builder ───────────────────────────────────────
function reset() {
  state.players._data.clear();
  state.board._data.clear();
  state.deck._data.clear();
  state.turn._data.clear();
  state.movement._data.clear();
  state.safeZone._data.clear();
  state.meta._data.clear();
  state.cards._data.clear();
  state.holes._data.clear();
  state.pegs._data.clear();
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}
function makePlayer(idx, bp, pegSpecs) {
  // pegSpecs: [{ hole, onFasttrack?, eligibleForSafeZone? }, ...]
  const pegs = pegSpecs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole,
    holeType: s.hole === 'holding' ? 'holding'
      : s.hole.startsWith('home-') ? 'home'
        : s.hole.startsWith('ft-') ? 'fasttrack'
          : s.hole.startsWith('safe-') ? 'safezone'
            : s.hole.startsWith('side-') ? (s.hole.startsWith('side-left') ? 'side-left' : 'side-right')
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
function setupTwoPlayer(p0Specs, p1Specs = [{ hole: 'holding' }]) {
  reset();
  const players = [makePlayer(0, 0, p0Specs), makePlayer(1, 3, p1Specs)];
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
  }
  state.players.set('list', players);
  state.players.set('count', 2);
  state.deck.set('currentCard', { ...state.cards.get('7'), value: '7', display: '7♠' });
  return players;
}
function getSplits() {
  calculateValidMoves();
  return (state.turn.get('validMoves') || []).filter(m => m.type === 'split');
}


// Ken, 2026-11-08: "pegs should be able to stay on the fast track until completion which means
// they reach their own fast track hole. In fact if they do not and make another move they lose
// their fast track." Reported: a peg hopped one hole along the ring on a royal, then a 5 did not
// offer the ring. The hop was filed as an exit, which dropped the status.
function card(v) { state.deck.set('currentCard', { ...state.cards.get(v), value: v, display: v + 'S' }); }
function movesNow() { calculateValidMoves(); return state.turn.get('validMoves') || []; }
function play(pred) {
  const vm = movesNow(); const i = vm.findIndex(pred);
  if (i < 0) return null;
  executeMove(i);
  state.players.set('current', 0); state.turn.set('phase', 'move');
  return vm[i];
}
const REST = [{ hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }];
const ringHops = (m) => (m.path || []).filter(h => /^ft-/.test(h)).length;

section('A royal hop along the ring keeps fast-track status');
for (const v of ['K', 'Q', 'J', 'A']) {
  const players = setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, ...REST]);
  card(v);
  const m = play(x => x.pegIdx === 0 && x.dest === 'ft-2');
  ok(!!m && m.type === 'move', `${v}: ft-1 to ft-2 is a move on the fast track, not an exit`, m ? m.type : 'not offered');
  ok(players[0].pegs[0].onFasttrack === true, `${v}: the peg still has fast-track status on ft-2`);
}

section('Then a 5 travels the ring');
{
  const players = setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, ...REST]);
  card('K'); play(x => x.pegIdx === 0 && x.dest === 'ft-2');
  card('5');
  const vm = movesNow().filter(x => x.pegIdx === 0);
  ok(vm.some(x => ringHops(x) >= 3), 'the 5 offers the ring (ft-3, ft-4, ...)', vm.map(x => x.dest).join(' '));
  ok(vm.some(x => (x.path || []).includes('ft-0')), 'including all the way round to its own ft-0 and on into its home stretch');
}

section('Reaching its own ft hole completes the fast track');
{
  const players = setupTwoPlayer([{ hole: 'ft-5', onFasttrack: true }, ...REST]);
  card('A');
  const m = play(x => x.pegIdx === 0 && x.dest === 'ft-0');
  const peg = players[0].pegs[0];
  ok(!!m, 'an Ace hops ft-5 to its own ft-0');
  ok(peg.onFasttrack === false && peg.eligibleForSafeZone === true, 'the fast track is complete: status ends and the peg may go home');
}

section('Leaving the ring early ends the status');
{
  const players = setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, ...REST]);
  card('3');
  state.turn.set('leaveFastTrack', true);           // the player pressed "Leave fast track"
  const m = play(x => x.pegIdx === 0 && (x.path || []).length && !/^ft-/.test(x.dest));
  ok(!!m && m.type === 'exitFastTrack' && players[0].pegs[0].onFasttrack === false, 'stepping off the ring loses fast-track status');
}

// Ken, 2026-11-08: "Default is to stay and traverse and that is all the options ... have a button
// that says leave fast track ... If they hit that button then options for all other pegs including
// ducking out early or even playing another peg but once the move is complete ... they lose fast track.
// That too can be undone or detoggled."
section('By default the only options keep going on the fast track');
{
  setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]);
  state.turn.set('leaveFastTrack', false);
  card('3');
  const vm = movesNow();
  ok(vm.length > 0 && vm.every(x => x.pegIdx === 0 && (x.path || []).every(h => /^ft-/.test(h))),
    'a 3: only peg 1 along the ring (no early exit, no other peg)', vm.map(x => `p${x.pegIdx}>${x.dest}`).join(' '));
  ok(state.turn.get('canLeaveFastTrack') === true, 'and the Leave fast track button is offered, since other moves exist');
}

section('"Leave fast track" offers everything else, and can be turned back off');
{
  const players = setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]);
  card('3');
  setLeaveFastTrack(true);
  const all = state.turn.get('validMoves') || [];
  ok(all.some(x => x.pegIdx === 1), 'the other peg can be played');
  ok(all.some(x => x.pegIdx === 0 && !/^ft-/.test(x.dest)), 'peg 1 can duck out of the fast track early');
  setLeaveFastTrack(false);
  const back = state.turn.get('validMoves') || [];
  ok(back.every(x => x.pegIdx === 0 && (x.path || []).every(h => /^ft-/.test(h))), 'pressed again: back to the fast track only');
  setLeaveFastTrack(true);
  const i = (state.turn.get('validMoves') || []).findIndex(x => x.pegIdx === 1);
  executeMove(i);
  ok(players[0].pegs[0].onFasttrack === false, 'playing the other peg, once made, loses the fast track');
}

section('A new card starts by staying');
{
  setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]);
  state.turn.set('leaveFastTrack', true);
  _drawCardCommit({ ...state.cards.get('3'), value: '3', display: '3S' });
  ok(state.turn.get('leaveFastTrack') === false && (state.turn.get('validMoves') || []).every(x => x.pegIdx === 0),
    'the draw resets the choice to staying on the fast track');
}

section('No status: an ft hole is just a hole on the outer track');
{
  setupTwoPlayer([{ hole: 'ft-1', onFasttrack: false }, ...REST]);
  card('5');
  const vm = movesNow().filter(x => x.pegIdx === 0);
  ok(vm.length > 0 && vm.every(x => ringHops(x) === 0), 'a 5 walks the outer track only', vm.map(x => x.dest).join(' '));
  card('K');
  ok(!movesNow().some(x => x.type === 'enterBullseye'), 'and a royal does not hop it into the bullseye');
}

// Tester report, 2026-11-09: "It didn't activate my fast track when I landed on it. But it activated the
// fast track when the bot landed on it." A half of a 7 that landed on an ft hole gave no status.
section('A 7 split that lands on an ft hole enters the fast track');
{
  const players = setupTwoPlayer([{ hole: 'outer-0-3' }, { hole: 'outer-2-0' }, ...REST.slice(0, 3)]);
  card('7');
  const m = play(x => x.type === 'split' && x.pegIdx === 0 && x.dest === 'ft-1');
  ok(!!m, 'a split puts peg 1 on ft-1', m ? `${m.dest} + ${m.dest2}` : 'not offered');
  ok(players[0].pegs[0].onFasttrack === true, 'and peg 1 has fast-track status');
}
{
  const players = setupTwoPlayer([{ hole: 'ft-3', onFasttrack: true }, { hole: 'outer-0-3' }, ...REST.slice(0, 3)]);
  card('7');
  const m = play(x => x.type === 'split' && x.pegIdx === 0 && (x.path || []).every(h => /^ft-/.test(h))
    && x.peg2Idx === 1 && x.dest2 === 'ft-1');
  ok(!!m, 'riding peg stays on the ring while the other half lands on ft-1', m ? `${m.dest} + ${m.dest2}` : 'not offered');
  ok(!!m && players[0].pegs[0].onFasttrack === true && players[0].pegs[1].onFasttrack === true,
    'both pegs have fast-track status afterwards');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
