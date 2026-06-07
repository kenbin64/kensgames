#!/usr/bin/env node
/**
 * ============================================================
 * NO-LEGAL-MOVE AUTO-RELINQUISH REGRESSION TEST
 *
 * Bug (user report 2026-06-06): "the system has trouble
 * understanding to relinquish a turn when there are no legal
 * moves" — a human with zero legal moves was left waiting on a
 * manual End-Turn hint or the 12 s stuck watchdog, so turns
 * appeared to hang / get skipped.
 *
 * Fix: when the active human draws a card and has no legal
 * moves, the turn auto-relinquishes after NO_MOVE_AUTO_PASS_MS
 * (mirrors the bot path + rules.json CARD_NO_LEGAL_MOVE). The
 * manual button stays as an instant-out.
 *
 * This test drives the REAL calculateValidMoves() →
 * showMoveHints() path (the post-draw chain) with a genuine
 * no-move board and asserts the current seat advances on its
 * own, and that it does NOT fire when a legal move exists.
 *
 * Run: node fasttrack/test_no_legal_move_relinquish.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Richer browser stub (getElementById returns a live StubEl per id) ──
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
function mkPlayer(i, isBot) {
  return {
    index: i, name: isBot ? `Bot ${i}` : `Human ${i}`, avatar: '🎮',
    userId: null, color: '#abcdef', boardPosition: i, isBot,
    pegs: Array.from({ length: PEGS_PER_PLAYER }, (_, p) => mkPeg(i, p)),
  };
}

// Build a turn where seat 0 (human) has all pegs in holding and the given
// card on the deck. Card '5' cannot enter from holding → zero legal moves.
// Card '6' can enter (home hole is free) → a legal move exists.
function setupTurn(cardValue) {
  buildCardMatrix();                       // populate CARDS rules
  for (const h of (_core.CLOCKWISE_TRACK || [])) state.board.set(h, null);
  state.meta.set('winner', null);
  state.meta.set('gameMode', 'solo');      // non-MP → active client may act
  state.meta.set('myUserId', null);
  state.players.set('list', [mkPlayer(0, false), mkPlayer(1, false)]);
  state.players.set('current', 0);
  state.turn.set('phase', 'move');
  state.turn.set('validMoves', []);
  state.deck.set('discard', []);
  state.deck.set('currentCard', { id: `card-${cardValue}`, value: cardValue, display: `${cardValue}♠` });
}

(async function run() {
  console.log('\n── No-legal-move auto-relinquish ──');

  // 1) Zero legal moves (card 5, all pegs holding) → turn auto-advances 0 → 1.
  setupTurn('5');
  _core.calculateValidMoves();             // real post-draw path → showMoveHints()
  ok((state.turn.get('validMoves') || []).length === 0, 'precondition: zero legal moves computed');
  ok(state.players.get('current') === 0, 'does NOT advance immediately (player sees the toast)');
  await wait(2400);                        // NO_MOVE_AUTO_PASS_MS (2000) + margin
  ok(state.players.get('current') === 1, 'auto-relinquished: current advanced 0 → 1');

  // 2) A legal move exists (card 6 can enter) → NEVER auto-advances.
  setupTurn('6');
  _core.calculateValidMoves();
  ok((state.turn.get('validMoves') || []).length > 0, 'precondition: at least one legal move');
  await wait(2400);
  ok(state.players.get('current') === 0, 'with a legal move present, turn is NOT relinquished');

  console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
  process.exit(fail ? 1 : 0);
})();
