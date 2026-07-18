#!/usr/bin/env node
/**
 * ============================================================
 * TURN-ADVANCEMENT REGRESSION TEST
 *
 * Bug (user report 2026-06-17): "turns are not being done
 * right. it skips some turns and gives multiple turns to
 * others when the card does not allow a redraw."
 *
 * Rule (Ken's spec): only A, 6, J, Q, K, JOKER grant another
 * turn (a "redraw"). EVERY other card (2,3,4,5,7,8,9,10) ends
 * the turn and passes play exactly ONE seat clockwise.
 *
 * This test plays a REAL move each turn through executeMove()
 * (cutscenes neutralized so the turn advances synchronously)
 * and asserts, per card:
 *   - redraw card    -> current seat is UNCHANGED (same player goes again)
 *   - non-redraw card -> current seat advances by EXACTLY +1 (mod N)
 * A +2 jump is the "skips a turn"; a redraw that advances is
 * "loses their extra turn"; a non-redraw that stays is "gives
 * multiple turns". All three are caught here.
 *
 * Run: node fasttrack/test_turn_advancement.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Browser stub (same shape as the relinquish regression test) ──
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
  body: new StubEl(), head: new StubEl(), addEventListener: () => {},
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

// ─── Load core ──────────────────────────────────────────────
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
const _core = globalThis.__core;
const state = _core.state;

// ─── Harness ────────────────────────────────────────────────
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
// Put one peg of player `pi` onto a real track hole so a simple forward
// move always exists, mirroring placePeg()'s board representation.
function placeOnTrack(player, pegIdx, holeId) {
  const peg = player.pegs[pegIdx];
  peg.holeId = holeId;
  peg.holeType = _core.CLOCKWISE_TRACK ? holeId.replace(/-\d+(-\d+)?$/, '') : 'outer';
  // exact holeType via the engine's own classifier if exposed; fallback above
  if (typeof _core.getHoleType === 'function') peg.holeType = _core.getHoleType(holeId);
  state.board.set(holeId, { playerIdx: player.index, pegId: peg.id });
}

function setupGame(numPlayers) {
  buildCardMatrix();
  for (const h of (_core.CLOCKWISE_TRACK || [])) state.board.set(h, null);
  state.meta.set('winner', null);
  state.meta.set('gameMode', 'solo');     // non-MP: active client may act locally
  state.meta.set('myUserId', null);
  const list = Array.from({ length: numPlayers }, (_, i) => mkPlayer(i));
  state.players.set('list', list);
  state.players.set('current', 0);
  // one track peg per player, placed at the START of a pocket (right after the
  // fast-track hole) so there is a long runway of empty holes before the peg
  // reaches its own home/safe-zone approach — keeps a legal forward move
  // available for every small card across the whole sequence.
  placeOnTrack(list[0], 0, 'side-left-0-4');
  placeOnTrack(list[1], 0, 'side-left-2-4');
  if (numPlayers > 2) placeOnTrack(list[2], 0, 'side-left-4-4');
  state.turn.set('phase', 'move');
  state.turn.set('validMoves', []);
  state.deck.set('discard', []);
  // Cutscenes neutralized so whenDrained() drains synchronously and the turn
  // advances in-line with executeMove (no camera/animation deps in headless).
  _core.CutsceneManager.queueCutscene = function () {};
}

// Play one turn with the given card; return { before, after, moves }.
function playCard(cardValue) {
  // Simulate a REAL draw through _drawCardCommit — the same path the live game
  // uses. It sets the card, flips to 'move', RE-ARMS the exactly-once turn guard,
  // and computes valid moves. (Poking currentCard/phase directly would skip the
  // guard reset and wrongly wedge every turn after the first — which is exactly
  // what a real draw must not do.)
  _core._drawCardCommit({ id: `card-${cardValue}`, value: cardValue, display: `${cardValue}♠` });
  const moves = (state.turn.get('validMoves') || []).length;
  const before = state.players.get('current');
  if (moves > 0) _core.executeMove(0);
  const after = state.players.get('current');
  return { before, after, moves };
}

console.log('\n── Turn advancement: redraw vs. pass (3 players) ──');
setupGame(3);
const N = 3;
const REDRAW = new Set(['A', '6', 'J', 'Q', 'K', 'JOKER']);

// A mixed sequence interleaving pass and redraw cards, kept to small forward
// values (1-6) so a legal move always exists for the runway placement above.
// Expected seat is computed purely from the redraw rule, independent of the
// engine, so any skip (+2) or double (stays on a pass card) shows up as a mismatch.
const sequence = ['2', '5', '3', 'A', '2', '6', '5', 'J', '3', 'Q'];
for (const card of sequence) {
  const isRedraw = REDRAW.has(card);
  const r = playCard(card);
  const expAfter = isRedraw ? r.before : (r.before + 1) % N;
  ok(r.moves > 0, `card ${card}: a legal move existed (moves=${r.moves})`);
  ok(
    r.after === expAfter,
    `card ${card} (${isRedraw ? 'REDRAW: stay' : 'PASS: +1'}): seat ${r.before} -> ${r.after} (expected ${expAfter})`
  );
}

// Direct rule-table check: the redraw set is exactly Ken's spec, nothing else.
console.log('\n── Redraw flag table matches spec exactly ──');
const ALL = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER'];
for (const v of ALL) {
  const rules = _core.CARDS[v];
  const got = !!(rules && rules.extraTurn);
  const want = REDRAW.has(v);
  ok(got === want, `card ${v}: extraTurn=${got} (spec: ${want})`);
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
process.exit(fail ? 1 : 0);
