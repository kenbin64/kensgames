#!/usr/bin/env node
/**
 * ============================================================
 * MULTIPLAYER TURN-SYNC REGRESSION TEST  (host + peer)
 *
 * Bug (user report 2026-06-17): in a real multiplayer game,
 * "turns are not being done right. it skips some turns and
 * gives multiple turns to others when the card does not allow
 * a redraw."
 *
 * The local engine rotates correctly (see test_turn_advancement.js,
 * 34/0). This test exercises the part that was NEVER verified:
 * the host/non-host broadcast path (DESKTOP_AND_NETCODE.md flags
 * it "NOT YET PROVEN: needs a live 2-human session").
 *
 * It loads the engine TWICE — one host, one peer — and wires a
 * fake relay so each client's _broadcast() is delivered to the
 * other's applyRemoteAction(). It then plays a real alternating
 * game and asserts, after every turn, that BOTH clients agree on
 * whose turn it is. A divergence is exactly the skip/double.
 *
 * Run: node fasttrack/test_mp_turn_sync.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Browser stub (shared by both instances; we never assert on DOM) ──
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

// ─── Load the core as an isolated instance (own module state) ──────────
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrcRaw = fs.readFileSync(corePath, 'utf8');
function loadCore() {
  const src = coreSrcRaw.replace(/window\.FastTrackCore\s*=/, 'var __core =')
    + '\n;__core.buildCardMatrix = buildCardMatrix;'
    + '\nreturn __core;';
  // new Function gives each load its own lexical scope -> separate state, deck,
  // _mpClient, _applying, _turnSeq, CutsceneManager, etc.
  return (new Function(src))();
}

// ─── Harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

const H = loadCore();   // host
const P = loadCore();   // peer
const REDRAW = new Set(['A', '6', 'J', 'Q', 'K', 'JOKER']);

// ── Fake relay: a FIFO queue delivered explicitly (mimics async network
//    ordering rather than nested synchronous delivery). ──
const relay = [];
function send(targetCore, action, payload) { relay.push({ targetCore, action, payload }); }
function drain() {
  let guard = 0;
  while (relay.length) {
    if (++guard > 2000) throw new Error('relay drain runaway (turn never settled)');
    const { targetCore, action, payload } = relay.shift();
    targetCore.applyRemoteAction(action, payload);
  }
}

function mkClient(userId, isHost, getOther) {
  return {
    userId, isHost,
    // session.players is the source of truth _loneHuman()/_isHost() read.
    session: { players: [{ user_id: 'U_HOST', is_ai: false }, { user_id: 'U_PEER', is_ai: false }] },
    sendAction(action, payload) { send(getOther(), action, payload || {}); },
  };
}

const PEGS = H.PEGS_PER_PLAYER || 5;
function mkRoster() {
  const mk = (i, uid, name) => ({
    index: i, name, avatar: '🎮', userId: uid, color: '#abcdef', boardPosition: i, isBot: false,
    pegs: Array.from({ length: PEGS }, (_, p) => ({
      id: `p${i}-peg${p}`, holeId: 'holding', holeType: 'holding', nickname: 'Peg',
      onFasttrack: false, eligibleForSafeZone: false, lockedToSafeZone: false,
      completedCircuit: false, fasttrackEntryHole: null, mustExitFasttrack: false,
      personality: 'CHEERFUL', mood: 'EAGER', captureCount: 0, timesCaptured: 0, rivalPegId: null,
    })),
  });
  return [mk(0, 'U_HOST', 'Host'), mk(1, 'U_PEER', 'Peer')];
}

function setupCore(core, myUid, isHost, getOther) {
  core.buildCardMatrix();
  for (const h of core.CLOCKWISE_TRACK) core.state.board.set(h, null);
  core.state.meta.set('winner', null);
  core.state.meta.set('myUserId', myUid);
  const list = mkRoster();
  // one track peg per player at the start of a pocket (long runway, no FT/captures)
  const put = (player, hole) => {
    player.pegs[0].holeId = hole;
    player.pegs[0].holeType = core.getHoleType(hole);
    core.state.board.set(hole, { playerIdx: player.index, pegId: player.pegs[0].id });
  };
  put(list[0], 'side-left-0-4');
  put(list[1], 'side-left-2-4');
  core.state.players.set('list', list);
  core.state.players.set('current', 0);
  core.state.turn.set('phase', 'draw');
  core.state.turn.set('validMoves', []);
  core.state.deck.set('discard', []);
  core.state.deck.set('cards', []);
  core.CutsceneManager.queueCutscene = function () {};   // keep turn-advance synchronous
  core.setMultiplayerClient(mkClient(myUid, isHost, getOther));  // forces gameMode=multiplayer
}

setupCore(H, 'U_HOST', true, () => P);
setupCore(P, 'U_PEER', false, () => H);

// Active client for a seat: seat 0 = host, seat 1 = peer.
function activeFor(seat) { return seat === 0 ? H : P; }

// One full turn: the active client draws the chosen card and plays move 0,
// then the relay is drained so the host's authoritative turn_advance (if any)
// reaches the peer.
function playTurn(seat, cardValue) {
  const core = activeFor(seat);
  core.state.deck.set('cards', [{ id: `card-${cardValue}`, value: cardValue, display: `${cardValue}♠` }]);
  core.state.turn.set('phase', 'draw');
  core.drawCard();                                   // pops + commits + calc moves + broadcasts 'draw'
  const moves = (core.state.turn.get('validMoves') || []).length;
  if (moves > 0) core.executeMove(0);                // broadcasts 'move' + advances locally
  drain();
  return moves;
}

console.log('\n── Multiplayer turn sync: host + peer over a fake relay ──');

// host=seat0, peer=seat1. The peer's PASS turns are where the bug bites.
const sequence = [
  { card: '2' }, // host  pass  -> 1
  { card: '3' }, // peer  pass  -> 0   <-- peer's turn ending: the suspect
  { card: '2' }, // host  pass  -> 1
  { card: '2' }, // peer  pass  -> 0
  { card: 'A' }, // host  REDRAW -> stay 0
  { card: '3' }, // host  pass  -> 1
  { card: 'J' }, // peer  REDRAW -> stay 1
  { card: '2' }, // peer  pass  -> 0
];

let expected = 0;
for (const { card } of sequence) {
  const seat = expected;
  const hPre = H.state.players.get('current');
  const pPre = P.state.players.get('current');
  ok(hPre === seat && pPre === seat,
    `pre-turn sync: host=${hPre} peer=${pPre} both agree it is seat ${seat}'s turn (card ${card})`);

  const moves = playTurn(seat, card);
  ok(moves > 0, `card ${card}: seat ${seat} had a legal move (moves=${moves})`);

  const isRedraw = REDRAW.has(card);
  if (!isRedraw) expected = (expected + 1) % 2;

  const hc = H.state.players.get('current');
  const pc = P.state.players.get('current');
  ok(hc === expected && pc === expected,
    `card ${card} (${isRedraw ? 'REDRAW: stay' : 'PASS: +1'}) by seat ${seat}: host now ${hc}, peer now ${pc} (expected ${expected})`);
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
process.exit(fail ? 1 : 0);
