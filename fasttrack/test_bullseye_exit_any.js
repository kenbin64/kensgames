#!/usr/bin/env node
/**
 * ============================================================
 * LEAVING THE BULLSEYE: ANY FAST TRACK HOLE
 * Validates _ftRuleOK, collision guard, bullseye gating, and
 * FT-priority filtering on top of fasttrack-game-core.js.
 * Run: node fasttrack/test_bullseye_exit_any.js
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


// Ken, 2026-11-08: "a player does not have to land on their own fast track when leaving the
// bullseye. They can actually land on any fast track hole. This can be strategic to take out a
// player's peg who is on another fast track hole when leaving the bullseye."
function card(v) { state.deck.set('currentCard', { ...state.cards.get(v), value: v, display: v + '♠' }); }
function exits() { calculateValidMoves(); return (state.turn.get('validMoves') || []).filter(m => m.type === 'exitBullseye'); }

section('A J, Q or K offers every fast-track hole');
for (const v of ['J', 'Q', 'K']) {
  setupTwoPlayer([{ hole: 'bullseye' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]);
  card(v);
  const d = exits().map(m => m.dest).sort();
  ok(d.join() === 'ft-0,ft-1,ft-2,ft-3,ft-4,ft-5', `${v}: all six ft holes (${d.join(' ')})`);
}

section('Only a hole holding your own peg is closed');
{
  setupTwoPlayer([{ hole: 'bullseye' }, { hole: 'ft-2' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]);
  card('K');
  const d = exits().map(m => m.dest);
  ok(!d.includes('ft-2') && d.length === 5, 'own peg on ft-2: the other five are offered', d.join(' '));
}

section("Leaving onto another player's peg sends it home");
{
  const players = setupTwoPlayer([{ hole: 'bullseye' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }],
    [{ hole: 'ft-4' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]);
  card('Q');
  calculateValidMoves();
  const vm = state.turn.get('validMoves') || [];
  const i = vm.findIndex(m => m.type === 'exitBullseye' && m.dest === 'ft-4');
  ok(i >= 0, 'ft-4, where the other player sits, is offered');
  if (i >= 0) executeMove(i);
  ok(players[0].pegs[0].holeId === 'ft-4', 'the peg leaves the bullseye to ft-4');
  ok(players[1].pegs[0].holeId !== 'ft-4', `the other player's peg is sent off ft-4 (now ${players[1].pegs[0].holeId})`);
}

console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
