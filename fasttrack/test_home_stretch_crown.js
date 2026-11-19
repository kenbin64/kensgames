#!/usr/bin/env node
/**
 * ============================================================
 * HOME-STRETCH CROWN (Ken, 2026-11-18)
 *
 * The crown shows above the winning hole ONLY when all four safe holes are filled and the last peg
 * is on the home stretch: it has reached or passed its own fast-track hole going clockwise, or
 * landed on the safe-zone entrance going back on a 4. It stays on all the way to the winning hole,
 * and comes off if that peg is cut. Reported bug: the crown appeared when the last peg ENTERED the
 * board (it comes out on home-{bp}, the winning hole itself) and never came off.
 *
 * Run: node fasttrack/test_home_stretch_crown.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Browser environment stubs (as in test_fasttrack_status.js) ─────
class StubElement {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; }
  appendChild() { } setAttribute() { } addEventListener() { } removeChild() { } remove() { }
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null, createElement: () => new StubElement(),
  querySelector: () => null, querySelectorAll: () => [],
  body: new StubElement(), head: new StubElement(), addEventListener: () => { },
};
global.window = {
  dispatchEvent: () => { }, addEventListener: () => { },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16), cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const corePath = path.join(__dirname, 'fasttrack-game-core.js');
eval(fs.readFileSync(corePath, 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core ='));
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

// ─── Scenario builder ───────────────────────────────────────
function reset() {
  for (const t of ['players', 'board', 'deck', 'turn', 'movement', 'safeZone', 'meta', 'cards', 'holes', 'pegs']) state[t]._data.clear();
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
  state.meta.set('crowns', []);
}
function holeType(h) {
  return h === 'holding' ? 'holding' : h.startsWith('home-') ? 'home' : h.startsWith('ft-') ? 'fasttrack'
    : h.startsWith('safe-') ? 'safezone' : h.startsWith('side-left') ? 'side-left' : h.startsWith('side-right') ? 'side-right'
      : h.startsWith('outer-') ? 'outer' : h === 'bullseye' ? 'bullseye' : 'holding';
}
function makePlayer(idx, bp, specs) {
  const pegs = specs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole, holeType: holeType(s.hole),
    onFasttrack: !!s.onFasttrack, eligibleForSafeZone: !!s.elig, lockedToSafeZone: false, completedCircuit: false,
    fasttrackEntryHole: s.onFasttrack ? s.hole : null, mustExitFasttrack: false,
    personality: 'NEUTRAL', mood: 'EAGER', captureCount: 0, timesCaptured: 0,
  }));
  return { index: idx, name: `P${idx}`, color: '#fff', boardPosition: bp, isBot: false, pegs };
}
// Player 0 sits at board position 0; player 1 at position 3.
function setup(p0Specs, p1Specs = [{ hole: 'holding' }]) {
  reset();
  const players = [makePlayer(0, 0, p0Specs), makePlayer(1, 3, p1Specs)];
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
  }
  state.players.set('list', players);
  state.players.set('count', 2);
  refreshCrowns();
  return players;
}
function card(v) { state.deck.set('currentCard', { ...state.cards.get(v), value: v, display: v + 'S' }); }
function play(who, pred) {
  state.players.set('current', who); state.turn.set('phase', 'move');
  calculateValidMoves();
  const vm = state.turn.get('validMoves') || [];
  const i = vm.findIndex(pred);
  if (i < 0) return null;
  executeMove(i);
  return vm[i];
}
const crownOn = () => !!(state.meta.get('crowns') || [])[0];
const pegAt = (hole) => (state.players.get('list')[0].pegs.find(p => p.holeId === hole) || null);
const SAFE4 = [{ hole: 'safe-0-1' }, { hole: 'safe-0-2' }, { hole: 'safe-0-3' }, { hole: 'safe-0-4' }];

// ─── 1. The reported bug ──────────────────────────────────────
section('1. The last peg entering the board does NOT bring the crown');
{
  setup([...SAFE4, { hole: 'home-0', elig: false }]);
  ok(!crownOn(), 'last peg sitting on home-0 straight out of holding: no crown');
  for (const v of ['A', '6', 'K', 'Q', 'J']) {
    setup([...SAFE4, { hole: 'holding' }]);
    card(v);
    const m = play(0, mv => mv.dest === 'home-0' || (mv.type || '').toLowerCase().includes('enter'));
    if (!m) continue;
    ok(!crownOn(), `entering the board with ${v}: no crown`, `landed ${m.dest}`);
    break;
  }
}

// ─── 2. When it shows ─────────────────────────────────────────
section('2. It shows once the last peg is on the home stretch');
{
  setup([...SAFE4, { hole: 'side-right-5-4' }]);     // the hole just before ft-0, going clockwise
  ok(!crownOn(), 'before reaching its own fast-track hole: no crown');
  card('2');
  const m = play(0, mv => mv.pegIdx === 4);
  ok(m && crownOn(), 'passing ft-0 going clockwise: crown on', `landed ${m && m.dest}`);

  for (const hole of ['ft-0', 'side-left-0-4', 'side-left-0-1', 'outer-0-0', 'outer-0-2', 'outer-0-3']) {
    setup([...SAFE4, { hole, elig: true }]);
    ok(crownOn(), `last peg (come round) on ${hole}: crown on`);
  }

  // Ken, 2026-11-18: the safe-zone entrance (outer-0-2) is on the main track, the hole leading up to the
  // safe zone. A backward 4 that lands on it or passes it counts as the circuit, so the last peg is on the
  // home stretch and the crown shows. Going back past the winning hole is not an overshoot.
  setup([...SAFE4, { hole: 'side-right-0-2' }]);
  ok(!crownOn(), 'last peg just past home, not come round: no crown');
  card('4');
  const back = play(0, mv => mv.pegIdx === 4);
  ok(back && back.dest === 'outer-0-2', 'safe zone full: backing up 4 from side-right-0-2 lands on the entrance', `landed ${back && back.dest}`);
  ok(crownOn(), 'landing on the entrance going backward: crown on');

  setup([...SAFE4, { hole: 'side-right-0-1' }]);
  card('4');
  const past = play(0, mv => mv.pegIdx === 4);
  ok(past && past.dest === 'outer-0-1', 'safe zone full: backing up 4 from side-right-0-1 goes past the entrance', `landed ${past && past.dest}`);
  ok(crownOn(), 'passing the entrance going backward: crown on');
}

// ─── 2b. Backing out of the home stretch ──────────────────────
section('2b. Backward 4s take the crown away only once the peg is past its own fast-track hole');
{
  setup([...SAFE4, { hole: 'outer-0-0', elig: true }]);
  card('4');
  const inside = play(0, mv => mv.pegIdx === 4);
  ok(inside && inside.dest === 'side-left-0-4' && crownOn(), 'back 4 to side-left-0-4, still on the stretch: crown stays', `landed ${inside && inside.dest}`);
  card('4');
  const out = play(0, mv => mv.pegIdx === 4);
  ok(out && !homeStretchHoles(0).includes(out.dest), 'the next back 4 goes past ft-0 counter-clockwise', `landed ${out && out.dest}`);
  ok(!crownOn(), 'past its own fast-track hole going counter-clockwise: crown removed');
}

// ─── 3. It stays on to the winning hole ───────────────────────
section('3. It stays on as the peg crosses the safe zone to the winning hole');
{
  setup([...SAFE4, { hole: 'outer-0-1', elig: true }]);
  ok(crownOn(), 'on outer-0-1: crown on');
  card('A');
  const step = play(0, mv => mv.pegIdx === 4 && mv.dest === 'outer-0-2');
  ok(step && crownOn(), 'onto the safe-zone entrance (safe zone full, so it carries on): still on');
  card('A');
  const step2 = play(0, mv => mv.pegIdx === 4 && mv.dest === 'outer-0-3');
  ok(step2 && crownOn(), 'past the entrance toward the winning hole: still on');
}

// ─── 4. When it does not show ─────────────────────────────────
section('4. No crown without a full safe zone, off the stretch, or on the wrong side');
{
  setup([{ hole: 'safe-0-1' }, { hole: 'safe-0-2' }, { hole: 'safe-0-3' }, { hole: 'holding' }, { hole: 'ft-0', elig: true }]);
  ok(!crownOn(), 'only three in the safe zone: no crown, even on the home stretch');
  setup([...SAFE4, { hole: 'ft-2', onFasttrack: true, elig: true }]);
  ok(!crownOn(), 'last peg on another fast-track hole: no crown');
  setup([...SAFE4, { hole: 'side-right-0-1', elig: true }]);
  ok(!crownOn(), 'last peg on the exit side just after home: no crown');
  setup([...SAFE4, { hole: 'side-left-0-2', elig: false }]);
  ok(!crownOn(), 'a peg on the stretch that never came round: no crown');
}

// ─── 5. A cut takes it away ───────────────────────────────────
section('5. Cutting the last peg off the home stretch removes the crown');
{
  // Player 1's peg sits 2 holes behind player 0's last peg on side-left-0-2 and lands on it with a 2.
  const target = CLOCKWISE_TRACK.indexOf('side-left-0-2');
  const from = CLOCKWISE_TRACK[target - 2];
  setup([...SAFE4, { hole: 'side-left-0-2', elig: true }], [{ hole: from }]);
  ok(crownOn(), 'last peg on the home stretch: crown on');
  card('2');
  const cut = play(1, mv => mv.dest === 'side-left-0-2');
  ok(cut && !pegAt('side-left-0-2'), 'the other player lands on it and cuts it', `cut move ${cut && cut.dest}`);
  ok(!crownOn(), 'crown removed after the cut');
}

// ─── 6. Undo and network snapshots follow the board ───────────
section('6. A restored board (undo, or a snapshot from the host) recomputes the crown');
{
  setup([...SAFE4, { hole: 'side-left-0-2', elig: true }]);
  const snap = getStateSnapshot();
  state.meta.set('crowns', []);                    // a stale value, as if left from before
  if (snap) {
    applyStateSnapshot(snap);
    ok(crownOn(), 'after applying a snapshot with the last peg on the stretch: crown on');
  } else {
    ok(true, 'no snapshot function to test (skipped)');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
process.exit(fail ? 1 : 0);   // the engine's timers would otherwise keep Node running
