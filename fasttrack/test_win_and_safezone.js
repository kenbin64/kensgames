#!/usr/bin/env node
/**
 * ============================================================
 * WIN / SAFE-ZONE / HOME-STRETCH RULE TESTS
 *
 * Locks in the natural-flow rules (per the 2026-06-05 fixes):
 *   - own ft-{bp} → home stretch (no jump straight into safe)
 *   - perimeter peg diverts into the safe zone at outer-{bp}-2
 *   - safe zone full → exactly 2 more holes (outer-3, home) to win
 *   - WIN needs an EXACT count onto home-{bp}; overshoot = no move
 *   - undershoot is legal (peg may approach gradually)
 *   - the 4 safe holes must fill (first 4 pegs) before a peg may
 *     land on the winning home hole
 *
 * Run: node fasttrack/test_win_and_safezone.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

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
  requestAnimationFrame: (cb) => setTimeout(cb, 16), cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
var _core = globalThis.__core;
var state = _core.state;
var CARDS = _core.CARDS;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

let pass = 0, fail = 0; const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(l) { console.log(`\n── ${l} ──`); }

function reset() {
  ['players','board','deck','turn','movement','safeZone','meta','cards','holes','pegs'].forEach(k => state[k]._data.clear());
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}
function pegType(h) {
  return h === 'holding' ? 'holding' : h.startsWith('home-') ? 'home'
    : h.startsWith('ft-') ? 'fasttrack' : h.startsWith('safe-') ? 'safezone' : 'outer';
}
function makePlayer(idx, bp, specs) {
  return {
    id: `player${idx}`, name: `P${idx}`, boardPosition: bp,
    pegs: specs.map((s, pi) => ({
      id: `p${idx}-peg${pi}`, holeId: s.hole, holeType: pegType(s.hole),
      onFasttrack: !!s.onFasttrack, eligibleForSafeZone: s.elig !== false,
      lockedToSafeZone: !!s.locked, mustExitFasttrack: false,
      fasttrackEntryHole: s.onFasttrack ? s.hole : null,
    })),
  };
}
function place(players) {
  players.forEach((pl, pi) => pl.pegs.forEach(pg => {
    if (pg.holeType !== 'holding' && pg.holeType !== 'home') state.board.set(pg.holeId, { playerIdx: pi, pegId: pg.id });
  }));
  state.players.set('list', players);
}
// movement value → a card value that has it
reset();
const moveToCard = {};
for (let v = 1; v <= 14; v++) if (CARDS[v] && CARDS[v].movement != null && CARDS[v].direction === 'clockwise')
  if (!(CARDS[v].movement in moveToCard)) moveToCard[CARDS[v].movement] = v;
function cardForSteps(n) { return moveToCard[n]; }

function movesFor(bp, specs, steps) {
  reset();
  const p0 = makePlayer(0, bp, specs);
  const p1 = makePlayer(1, (bp + 3) % 6, [{ hole: `outer-${(bp + 3) % 6}-1` }]);
  place([p0, p1]);
  const cv = cardForSteps(steps);
  if (cv == null) return null;
  state.deck.set('currentCard', { value: cv, suit: 'spades' });
  calculateValidMoves();
  return state.turn.get('validMoves') || [];
}
function destsForPeg0(moves) { return (moves || []).filter(m => m.pegIdx === 0).map(m => m.dest); }
function allDests(moves) { return (moves || []).map(m => m.dest); }

// ─── 1. FT exit walks the home stretch (no jump into safe) ──
section('FT exit walks the home stretch — no jump straight into safe');
{
  // Peg on its own ft-0 (bp=0). A small card must land on a home-stretch hole
  // (side-left / outer), NEVER directly on safe-0-x.
  const moves = movesFor(0, [{ hole: 'ft-0', onFasttrack: true, elig: true }], 2);
  const dests = destsForPeg0(moves);
  ok(dests.length > 0, 'ft-0 peg has a 2-step move', `dests=${dests.join(',')}`);
  ok(dests.every(d => !d.startsWith('safe-')), 'no 2-step move lands directly in safe from ft-0', `dests=${dests.join(',')}`);
  ok(dests.includes('side-left-0-3'), 'ft-0 + 2 lands on side-left-0-3 (home stretch)', `dests=${dests.join(',')}`);
}

// ─── 2. Perimeter peg enters the safe zone at outer-{bp}-2 ──
section('Perimeter peg diverts into safe zone at the entrance (outer-bp-2)');
{
  // Eligible peg on outer-0-1, safe empty. 3 steps: outer-0-2(entrance) → safe-0-1 → safe-0-2.
  const moves = movesFor(0, [{ hole: 'outer-0-1', elig: true }], 3);
  const dests = destsForPeg0(moves);
  ok(dests.includes('safe-0-2'), 'outer-0-1 + 3 enters safe and lands safe-0-2', `dests=${dests.join(',')}`);
}

// ─── 3. Win requires EXACT count; overshoot dies; undershoot ok ──
section('Win = exact count to home-{bp}; overshoot dies; undershoot legal');
{
  // Safe zone FULL (4 pegs in safe-0-1..4) + 5th peg eligible on outer-0-1.
  // From outer-0-1 with safe full: outer-0-2 → outer-0-3 → home-0.
  const fullSafe = [
    { hole: 'safe-0-1' }, { hole: 'safe-0-2' }, { hole: 'safe-0-3' }, { hole: 'safe-0-4' },
    { hole: 'outer-0-1', elig: true },
  ];
  const exact = allDests(movesFor(0, fullSafe, 3));   // 3 → home-0 exactly (the 5th peg)
  ok(exact.includes('home-0'), 'safe full: 3 steps lands EXACTLY on home-0 (win)', `dests=${exact.join(',')}`);

  const under = allDests(movesFor(0, fullSafe, 2));    // 2 → outer-0-3 (undershoot, legal)
  ok(under.length > 0 && !under.includes('home-0'), 'safe full: 2 steps is legal undershoot, not a win', `dests=${under.join(',')}`);

  // 5 steps overshoots home (track only reaches home in 3) — clockwise card.
  const over = allDests(movesFor(0, fullSafe, 5));
  ok(!over.includes('home-0'), 'safe full: 5 steps cannot land on home-0 (overshoot — move dies)', `dests=${over.join(',')}`);
  ok(over.length === 0, 'safe full: overshooting peg has no legal move at all', `dests=${over.join(',')}`);
}

// ─── 4. The 4 safe holes fill before a peg may win on home ──
section('First 4 pegs fill the safe zone before the 5th may win');
{
  // Safe NOT full (only 3 in safe) + eligible peg approaching home.
  // Landing on home-0 must NOT be offered as a terminal/win — home is a normal
  // pass-through hole until the safe zone is full.
  const notFull = [
    { hole: 'safe-0-1' }, { hole: 'safe-0-2' }, { hole: 'safe-0-3' },
    { hole: 'outer-0-1', elig: true },
  ];
  // With safe not full, an eligible peg at outer-0-1 diverts into the (open) safe
  // zone at the entrance rather than continuing to home. So no move should end on home-0.
  for (const steps of [2, 3, 5, 6]) {
    const dests = allDests(movesFor(0, notFull, steps));
    ok(!dests.includes('home-0'), `safe not full: ${steps}-step move never ends on home-0`, `dests=${dests.join(',')}`);
  }
}

console.log(`\n══════════════════════`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`══════════════════════`);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)); process.exit(1); }
process.exit(0);   // stop the game-core watchdog timers from keeping node alive
