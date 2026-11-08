#!/usr/bin/env node
/**
 * ============================================================
 * CARD 4 ONTO A FAST TRACK HOLE: NO RING NEXT TURN (companion to test_card4_backward.js)
 * Validates _ftRuleOK, collision guard, bullseye gating, and
 * FT-priority filtering on top of fasttrack-game-core.js.
 * Run: node fasttrack/test_card4_no_ring.js
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


// Ken, 2026-11-08: "if a peg has a 4 and backs up into a fasttrack hole they are not awarded
// fasttrack status. You must enter fasttrack going clockwise to be able to have fasttrack
// status and traverse only the fasttrack holes on the next turn. Same for the bullseye. You
// cannot back up into the bullseye when you draw a 4. You can also not back up into the safe
// zone when you draw a 4."
function card(v) { state.deck.set('currentCard', { ...state.cards.get(v), value: v, display: v + '♠' }); }
function movesNow() { calculateValidMoves(); return state.turn.get('validMoves') || []; }
function play(players, pred) {
  const vm = movesNow(); const i = vm.findIndex(pred);
  if (i < 0) return null;
  executeMove(i);
  state.players.set('current', 0); state.turn.set('phase', 'move');
  return vm[i];
}
const ALL_HOLDING = [{ hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }];

section('A 4 that backs onto a fast-track hole gives no fast-track status');
{
  const players = setupTwoPlayer([{ hole: 'side-left-1-1' }, { hole: 'outer-4-0' }, ...ALL_HOLDING]);
  card('4');
  const m = play(players, x => x.pegIdx === 0 && x.dest === 'ft-1');
  ok(!!m, 'the 4 backs peg 1 from side-left-1-1 onto ft-1', m ? m.path.join(',') : 'no such move');
  const peg = players[0].pegs[0];
  ok(peg.holeId === 'ft-1' && !peg.onFasttrack, 'it sits on ft-1 without fast-track status', `onFasttrack=${peg.onFasttrack}`);
  card('5');
  const vm = movesNow().filter(x => x.pegIdx === 0);
  const ring = vm.filter(x => [x.path, x.path2].some(p => Array.isArray(p) && p.some(h => /^ft-/.test(h) || h === 'bullseye')));
  ok(vm.length > 0 && ring.length === 0, 'next turn (a 5) it walks the outer track, not the fast-track ring',
    vm.map(x => `${x.type}>${x.dest} [${(x.path || []).join(',')}]`).join(' | '));
  ok(vm.some(x => x.dest === 'outer-1-0'), 'its 5 lands on outer-1-0, the outer-track hole 5 ahead');
}

section('Backed onto a fast-track hole: an Ace and a 7 split treat it as an outer-track peg');
{
  const players = setupTwoPlayer([{ hole: 'side-left-1-1' }, { hole: 'outer-4-0' }, ...ALL_HOLDING]);
  card('4');
  play(players, x => x.pegIdx === 0 && x.dest === 'ft-1');
  card('A');
  ok(!movesNow().some(x => x.type === 'enterBullseye'), 'an Ace does not hop it into the bullseye');
  card('7');
  const vm = movesNow().filter(x => x.pegIdx === 0 || x.peg2Idx === 0);
  const own = x => x.pegIdx === 0 ? [x.path, x.dest] : [x.path2, x.dest2];
  const ring = vm.filter(x => { const [p, d] = own(x); return d === 'bullseye' || (p || []).some(h => /^ft-/.test(h)); });
  ok(vm.some(x => x.type === 'split') && ring.length === 0, 'a 7 split moves it along the outer track only',
    ring.map(x => x._splitKey || x.dest).join(' | '));
  ok(vm.some(x => x.type === 'split' && x.pegIdx === 0 && x.steps === 2 && x.dest === 'side-left-1-3'),
    'for example 2 of the 7 to side-left-1-3, the other peg moving 5');
}

section('A 4 never backs into the bullseye or the safe zone');
{
  const starts = ['side-left-1-1', 'side-left-2-2', 'outer-0-3', 'home-0', 'side-right-0-1', 'side-right-5-4', 'outer-0-2'];
  let bad = [];
  for (const h of starts) {
    setupTwoPlayer([{ hole: h, eligibleForSafeZone: true }, { hole: 'holding' }, ...ALL_HOLDING]);
    card('4');
    for (const x of movesNow()) {
      const path = [...(x.path || []), x.dest];
      if (path.some(p => p === 'bullseye' || /^safe-/.test(p))) bad.push(`${h}: ${x.type}>${x.dest}`);
    }
  }
  ok(bad.length === 0, 'from every start tried, no 4 reaches the bullseye or a safe hole', bad.join(' | '));
  setupTwoPlayer([{ hole: 'safe-0-2' }, { hole: 'bullseye' }, ...ALL_HOLDING]);
  card('4');
  ok(movesNow().length === 0, 'a peg in the safe zone or on the bullseye cannot move on a 4');
}

section('Going clockwise onto a fast-track hole still gives status (unchanged)');
{
  const players = setupTwoPlayer([{ hole: 'side-right-0-2' }, { hole: 'outer-4-0' }, ...ALL_HOLDING]);
  card('3');
  const m = play(players, x => x.pegIdx === 0 && x.dest === 'ft-1');
  ok(!!m && players[0].pegs[0].onFasttrack, 'a 3 clockwise onto ft-1 gives fast-track status');
  card('2');
  ok(movesNow().some(x => x.pegIdx === 0 && x.dest === 'ft-3'), 'and next turn a 2 travels the ring to ft-3');
}

console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
