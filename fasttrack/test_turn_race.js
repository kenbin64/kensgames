#!/usr/bin/env node
/**
 * ============================================================
 * TURN-ADVANCE RACE / EXACTLY-ONCE TEST
 *
 * Bug (Ken, 2026-07-15): "it does not divvy out turns
 * correctly. It skips players. Gives players turns when they
 * are not supposed to have them."
 *
 * Root cause: turn advancement had no exactly-once guard. The
 * advance is gated behind async callbacks (waitForAnimations →
 * CutsceneManager.whenDrained → advanceTurn), each a single
 * callback slot, PLUS a 15s animation safety timeout, PLUS a
 * 12s stuck-watchdog that calls passTurn. When two of those
 * fired for the SAME drawn card, the seat rotated twice = a
 * SKIP. When a callback was lost, it never rotated = a DOUBLE
 * TURN. On a redraw card a racing pass could also steal the
 * extra draw.
 *
 * Fix: one guard (_turnAdvanceCommitted). endTurn() is the
 * single rotation choke-point; advanceTurn's redraw/winner
 * branches mark resolved themselves; _drawCardCommit re-arms it
 * on every new draw. This test fires the racing paths on
 * purpose and asserts the seat moves EXACTLY once per card.
 *
 * Run: node fasttrack/test_turn_race.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Browser stub ────────────────────────────────────────────
class StubEl {
  constructor() {
    this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false;
    this._handlers = {};
    this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
  }
  appendChild() {} setAttribute() {} removeChild() {} remove() {}
  addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); }
  removeEventListener() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
}
const _els = new Map();
function _getEl(id) { if (!_els.has(id)) _els.set(id, new StubEl()); return _els.get(id); }
global.document = {
  getElementById: (id) => _getEl(id),
  createElement: () => new StubEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: new StubEl(), head: new StubEl(), addEventListener: () => {}, readyState: 'complete',
};
global.window = {
  dispatchEvent: () => {}, addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// ─── Load core ───────────────────────────────────────────────
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
const _core = globalThis.__core;
const state = _core.state;

// ─── Harness ─────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

const PEGS_PER_PLAYER = _core.PEGS_PER_PLAYER || 5;
function mkPeg(i, p) {
  return {
    id: `p${i}-peg${p}`, holeId: 'holding', holeType: 'holding',
    nickname: 'Peg', onFasttrack: false, eligibleForSafeZone: false,
    lockedToSafeZone: false, completedCircuit: false, fasttrackEntryHole: null,
    mustExitFasttrack: false, personality: 'CHEERFUL', mood: 'EAGER',
    captureCount: 0, timesCaptured: 0, rivalPegId: null,
  };
}
function mkPlayer(i) {
  return {
    index: i, name: `Human ${i}`, avatar: '🎮',
    userId: null, color: '#abcdef', boardPosition: i, isBot: false,
    pegs: Array.from({ length: PEGS_PER_PLAYER }, (_, p) => mkPeg(i, p)),
  };
}
function placeOnTrack(player, pegIdx, holeId) {
  const peg = player.pegs[pegIdx];
  peg.holeId = holeId;
  peg.holeType = _core.CLOCKWISE_TRACK ? holeId.replace(/-\d+(-\d+)?$/, '') : 'outer';
  if (typeof _core.getHoleType === 'function') peg.holeType = _core.getHoleType(holeId);
  state.board.set(holeId, { playerIdx: player.index, pegId: peg.id });
}

function setupGame(numPlayers) {
  buildCardMatrix();
  for (const h of (_core.CLOCKWISE_TRACK || [])) state.board.set(h, null);
  state.meta.set('winner', null);
  state.meta.set('gameMode', 'solo');
  state.meta.set('myUserId', null);
  const list = Array.from({ length: numPlayers }, (_, i) => mkPlayer(i));
  state.players.set('list', list);
  state.players.set('current', 0);
  placeOnTrack(list[0], 0, 'side-left-0-4');
  placeOnTrack(list[1], 0, 'side-left-2-4');
  if (numPlayers > 2) placeOnTrack(list[2], 0, 'side-left-4-4');
  state.turn.set('phase', 'move');
  state.turn.set('validMoves', []);
  state.deck.set('discard', []);
  // Cutscenes neutralized so the advance resolves synchronously in-line.
  _core.CutsceneManager.queueCutscene = function () {};
}

// One real draw + move (the same path the live game runs).
function drawAndMove(cardValue) {
  _core._drawCardCommit({ id: `card-${cardValue}`, value: cardValue, display: `${cardValue}♠` });
  const moves = (state.turn.get('validMoves') || []).length;
  if (moves > 0) _core.executeMove(0);
  return moves;
}
const cur = () => state.players.get('current');
const phase = () => state.turn.get('phase');

const N = 3;

// ── A. A late/duplicate endTurn cannot rotate a second time (SKIP guard) ──
console.log('\n── A. duplicate endTurn after a resolved move does NOT skip a seat ──');
setupGame(N);
{
  const before = cur();
  const moves = drawAndMove('2');                 // non-redraw: rotates +1
  ok(moves > 0, `A: a legal move existed (moves=${moves})`);
  ok(cur() === (before + 1) % N, `A: move rotated seat ${before} -> ${cur()} (expected ${(before + 1) % N})`);
  // Simulate the 15s animation safety timeout firing the advance AGAIN, and the
  // stuck-watchdog's passTurn racing it — both must be swallowed.
  _core.endTurn();
  _core.endTurn();
  if (typeof _core.passTurn === 'function') _core.passTurn('auto'); else if (window.passTurn) window.passTurn('auto');
  ok(cur() === (before + 1) % N, `A: after 2 stray endTurns + a stray pass, seat still ${cur()} (no skip)`);
}

// ── B. A stuck-watchdog pass after the move resolved is a no-op ──
console.log('\n── B. watchdog pass after the move resolved does NOT skip ──');
setupGame(N);
{
  const before = cur();
  drawAndMove('3');                               // rotates +1
  const afterMove = cur();
  ok(afterMove === (before + 1) % N, `B: move rotated seat ${before} -> ${afterMove}`);
  (window.passTurn || _core.passTurn)('auto');    // watchdog fires late
  ok(cur() === afterMove, `B: watchdog pass swallowed, seat still ${cur()} (no skip)`);
}

// ── C. A redraw is NOT stolen/rotated by a racing pass (extra-turn guard) ──
console.log('\n── C. redraw card keeps the same seat even if a pass races it ──');
setupGame(N);
{
  const before = cur();
  const moves = drawAndMove('A');                 // redraw: same seat, phase back to 'draw'
  ok(moves > 0, `C: a legal move existed for redraw card (moves=${moves})`);
  ok(cur() === before, `C: redraw kept seat ${before} -> ${cur()} (unchanged)`);
  ok(phase() === 'draw', `C: redraw reopened the draw phase (phase=${phase()})`);
  // A racing watchdog pass / stray endTurn must NOT rotate the redrawn player away.
  (window.passTurn || _core.passTurn)('auto');
  _core.endTurn();
  ok(cur() === before, `C: after racing pass+endTurn, redraw seat still ${cur()} (extra turn kept)`);
  ok(phase() === 'draw', `C: still the same player's draw (phase=${phase()})`);
}

// ── D. The guard RE-ARMS every draw (no permanent wedge) ──
console.log('\n── D. next draw re-arms the guard; play still advances ──');
setupGame(N);
{
  let seat = cur();
  // 6 straight non-redraw cards must advance 6 seats total (mod N), one each.
  for (let i = 0; i < 6; i++) {
    const before = cur();
    drawAndMove('2');
    // fire a stray duplicate each turn to prove per-turn idempotency holds up
    _core.endTurn();
    ok(cur() === (before + 1) % N, `D: turn ${i + 1}: ${before} -> ${cur()} (+1, stray endTurn ignored)`);
  }
}

// ── E. redraw THEN a real second draw advances correctly ──
console.log('\n── E. redraw, draw again, then a normal card rotates once ──');
setupGame(N);
{
  const before = cur();
  drawAndMove('J');                               // redraw: stay
  ok(cur() === before && phase() === 'draw', `E: redraw stayed on seat ${before}`);
  drawAndMove('2');                               // same player draws again, normal card: rotate +1
  ok(cur() === (before + 1) % N, `E: after the redraw, a normal card rotated ${before} -> ${cur()} (+1)`);
}

console.log('\n══════════════════════');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('══════════════════════\n');
process.exit(fail ? 1 : 0);
