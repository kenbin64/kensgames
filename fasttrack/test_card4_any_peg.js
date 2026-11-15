#!/usr/bin/env node
/**
 * ============================================================
 * A 4 WITH A PEG ON THE FAST TRACK: ANY PEG MAY BACK UP
 * Validates _ftRuleOK, collision guard, bullseye gating, and
 * FT-priority filtering on top of fasttrack-game-core.js.
 * Run: node fasttrack/test_card4_any_peg.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// â”€â”€â”€ Browser environment stubs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Load game core into this scope â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Direct eval of `const state = â€¦` doesn't leak the binding; instead we
// rewrite the trailing `window.FastTrackCore = {â€¦}` to expose symbols on
// `globalThis.__core` so tests can read them.
const corePath = process.env.FT_CORE || path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
// In non-strict eval, top-level function declarations leak to the surrounding
// scope, so `calculateValidMoves`, `getTrackSequence`, `buildCardMatrix` etc.
// are already visible here. Top-level `const`s (state, CARDS, CLOCKWISE_TRACK)
// do NOT leak â€” read those off `globalThis.__core`. Use `var` to avoid TDZ /
// re-declaration conflicts with the leaked function names.
var _core = globalThis.__core;
var state = _core.state;
var CARDS = _core.CARDS;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

// â”€â”€â”€ Test harness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  âœ… ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  âŒ ${name}${detail ? ` â€” ${detail}` : ''}`); }
}
function section(label) { console.log(`\nâ”€â”€ ${label} â”€â”€`); }

// â”€â”€â”€ Scenario builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  state.deck.set('currentCard', { ...state.cards.get('7'), value: '7', display: '7â™ ' });
  return players;
}
function getSplits() {
  calculateValidMoves();
  return (state.turn.get('validMoves') || []).filter(m => m.type === 'split');
}


function card(v) { state.deck.set('currentCard', { ...state.cards.get(v), value: v, display: v + 'S' }); }
function movesNow() { calculateValidMoves(); return state.turn.get('validMoves') || []; }
const OTHERS = [{ hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }];

section('A 4 offers every peg that can back up 4, not only the fast-track peg');
{
  setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, ...OTHERS]);
  state.turn.set('leaveFastTrack', false);
  card('4');
  const vm = movesNow();
  ok(vm.some(x => x.pegIdx === 0), 'the fast-track peg can back up 4', vm.map(x => `p${x.pegIdx}>${x.dest}`).join(' '));
  ok(vm.some(x => x.pegIdx === 1), 'the other board peg can back up 4 too', vm.map(x => `p${x.pegIdx}>${x.dest}`).join(' '));
}

section('Backing up the other peg loses the fast track');
{
  const players = setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, ...OTHERS]);
  card('4');
  const vm = movesNow();
  const i = vm.findIndex(x => x.pegIdx === 1);
  ok(i >= 0, 'peg 2 has a 4 backward');
  if (i >= 0) executeMove(i);
  ok(players[0].pegs[0].onFasttrack === false, 'peg 1 lost fast-track status');
  ok(players[0].pegs[0].holeId === 'ft-1', 'and peg 1 did not move');
}

section('Backing up the fast-track peg loses the fast track');
{
  const players = setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, ...OTHERS]);
  card('4');
  const vm = movesNow();
  const i = vm.findIndex(x => x.pegIdx === 0);
  if (i >= 0) executeMove(i);
  ok(i >= 0 && players[0].pegs[0].onFasttrack === false, 'peg 1 backed up and lost fast-track status');
}

section('Other cards still stay on the fast track by default');
{
  setupTwoPlayer([{ hole: 'ft-1', onFasttrack: true }, { hole: 'outer-4-0' }, ...OTHERS]);
  state.turn.set('leaveFastTrack', false);
  card('3');
  const vm = movesNow();
  ok(vm.length > 0 && vm.every(x => x.pegIdx === 0), 'a 3: only the fast-track peg, along the ring', vm.map(x => `p${x.pegIdx}>${x.dest}`).join(' '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);