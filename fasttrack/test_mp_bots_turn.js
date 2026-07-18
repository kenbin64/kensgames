#!/usr/bin/env node
/**
 * ============================================================
 * MULTIPLAYER + BOTS TURN-ROTATION REGRESSION TEST
 *
 * Bug (user report, desktop build): the desktop build attaches the
 * multiplayer relay even for a solo-plus-bots game. In MP mode "a
 * bot's turn would not relinquish, gives others multiple illegal
 * turns, and skips others."
 *
 * The two existing turn tests never covered this exact path:
 *   - test_turn_advancement.js : SOLO (no relay) bot rotation, 34/0.
 *   - test_mp_turn_sync.js     : relay attached but TWO HUMANS, no bots, 24/0.
 *
 * The gap is MULTIPLAYER MODE (relay attached) WITH BOTS. This test
 * fills it. It loads the core (one instance for the lone-human +
 * bots case; two instances for the host + peer + bot case), attaches
 * a fake _mpClient so _isMpMode() is true, and drives a real game
 * letting the ENGINE'S OWN bot path run end to end:
 *     botTurn -> drawCard -> executeMove -> advanceTurn -> endTurn
 *     -> _applyTurnAdvance -> enableTurn -> botTurn (next bot).
 * Bots AUTO-CHAIN: when the turn advances to a bot seat, enableTurn()
 * launches that bot itself, so a single human turn-end can cascade
 * through every following bot before settling on the next human. The
 * relay is modelled faithfully INCLUDING optional self-echo (the
 * live socket fans a sender's own action back to it; the transport
 * in fasttrack-3d.js drops those by msg.from). Both echo modes run.
 *
 * THE BUG, precisely: with 2+ humans plus a bot, the host drives the
 * bot's turn, but the active seat's userId is the BOT's, so the old
 * `!_isMyTurn()` guard in drawCard()/executeMove() returned false for
 * the host and BOTH the bot draw and bot move bailed out. botTurn()
 * then saw an empty validMoves and called endTurn(), rotating PAST the
 * bot without it ever playing -> the bot's turn was SILENTLY SKIPPED.
 * (The lone-human case masked it because _loneHuman() makes _isMyTurn
 * true for every seat.) Fix: a host may also act for a BOT seat.
 *
 * Because botTurn() calls the engine-INTERNAL drawCard/executeMove
 * (lexical scope), wrapping the exported functions does NOT observe
 * bot turns. So this test asserts on OBSERVABLE end-state facts that
 * a skip/double/no-relinquish would each violate:
 *   - turn rotates by exactly +1 per non-redraw, stays on a redraw,
 *   - over a full round EVERY seat consumes exactly one card from the
 *     deck (a skipped seat consumes none; a doubled seat consumes two),
 *   - over a full round EVERY seat's lead peg actually advances (a
 *     skipped bot's peg never moves),
 *   - host and peer agree on the current seat at every settle point,
 *   - host and peer boards stay byte-for-byte identical.
 *
 * Run: node fasttrack/test_mp_bots_turn.js  (fake clock; no real
 * timers; exits cleanly via process.exit).
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Controllable fake clock ──────────────────────────────────────────────
// botTurn() schedules its work through setTimeout in nested stages. Replace
// setTimeout with a virtual-time queue so the REAL bot path runs determinist-
// ically with no wall-clock waits; runClock() fires due callbacks in time order
// until the queue drains.
let _now = 0, _seq = 0;
const _timers = [];
function fakeSetTimeout(fn, delay) {
  const id = ++_seq;
  _timers.push({ at: _now + (delay || 0), seq: id, fn, id, cleared: false });
  return id;
}
function fakeClearTimeout(id) { const t = _timers.find(t => t.id === id); if (t) t.cleared = true; }
function runClock() {
  let guard = 0;
  for (;;) {
    if (++guard > 100000) throw new Error('runClock runaway (a timer kept rescheduling)');
    const live = _timers.filter(t => !t.cleared);
    if (!live.length) break;
    live.sort((a, b) => (a.at - b.at) || (a.seq - b.seq));
    const t = live[0];
    const idx = _timers.indexOf(t);
    if (idx >= 0) _timers.splice(idx, 1);
    _now = Math.max(_now, t.at);
    try { t.fn(); } catch (err) { console.error('[clock] timer threw:', err); }
  }
}

// ─── Browser stub ──────────────────────────────────────────────────────────
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
  readyState: 'complete',
};
global.window = {
  dispatchEvent: () => {}, addEventListener: () => {},
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => fakeSetTimeout(cb, 0),
  cancelAnimationFrame: (id) => fakeClearTimeout(id),
};
global.setTimeout = fakeSetTimeout;
global.clearTimeout = fakeClearTimeout;
global.setInterval = () => 0;
global.clearInterval = () => {};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// ─── Load the core as an isolated instance (own module state) ──────────────
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrcRaw = fs.readFileSync(corePath, 'utf8');
function loadCore() {
  const src = coreSrcRaw.replace(/window\.FastTrackCore\s*=/, 'var __core =')
    + '\n;__core.buildCardMatrix = buildCardMatrix;'
    + '\nreturn __core;';
  return (new Function(src))();
}

// ─── Harness ────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}
const REDRAW = new Set(['A', '6', 'J', 'Q', 'K', 'JOKER']);

// ── Fake relay ──────────────────────────────────────────────────────────────
// FIFO queue of {targets, from, action, payload}. With selfEcho ON the sender is
// included (a server that fans out to ALL peers including the sender) and the
// receiving transport must drop msg.from === its own id (exactly like the
// fasttrack-3d.js game_action handler). With selfEcho OFF the sender is excluded
// at the relay.
function makeRelay(selfEcho) {
  const queue = [];
  const reg = new Map(); // core -> userId
  function register(core, userId) { reg.set(core, String(userId)); }
  function send(fromCore, action, payload) {
    const fromId = reg.get(fromCore) || null;
    const targets = [...reg.keys()].filter(c => selfEcho ? true : c !== fromCore);
    queue.push({ targets, from: fromId, action, payload: payload || {} });
  }
  function drain() {
    let guard = 0;
    while (queue.length) {
      if (++guard > 5000) throw new Error('relay drain runaway (turn never settled)');
      const msg = queue.shift();
      for (const core of msg.targets) {
        const myId = reg.get(core) || null;
        if (msg.from && myId && String(msg.from) === String(myId)) continue; // self-echo filter
        core.applyRemoteAction(msg.action, msg.payload);
      }
    }
  }
  return { register, send, drain };
}

// ── Roster builders ──────────────────────────────────────────────────────────
function mkPegs(i, PEGS) {
  return Array.from({ length: PEGS }, (_, p) => ({
    id: `p${i}-peg${p}`, holeId: 'holding', holeType: 'holding', nickname: 'Peg',
    onFasttrack: false, eligibleForSafeZone: false, lockedToSafeZone: false,
    completedCircuit: false, fasttrackEntryHole: null, mustExitFasttrack: false,
    personality: 'CHEERFUL', mood: 'EAGER', captureCount: 0, timesCaptured: 0, rivalPegId: null,
  }));
}
function mkSeat(i, uid, name, isBot, PEGS) {
  return {
    index: i, name, avatar: '🎮', userId: uid, color: '#abcdef',
    boardPosition: i, isBot: !!isBot, pegs: mkPegs(i, PEGS),
  };
}

// Place each seat's lead peg at the start of a left-side pocket so a small
// forward move always exists (mirrors the runway in the existing turn tests).
const RUNWAY = ['side-left-0-4', 'side-left-2-4', 'side-left-4-4', 'side-left-1-4'];

// Pre-stack the deck so every draw pops a known small forward card (2..5, all
// non-redraw) -> pure round-robin with a legal move always available. deck.pop()
// takes the LAST element. Specific redraw cards are injected per-turn when used.
function stackDeck(core, n) {
  const floor = [];
  for (let i = 0; i < n; i++) {
    const v = String(2 + (i % 4)); // 2,3,4,5,2,3,4,5,...
    floor.push({ id: `floor-${i}`, value: v, display: `${v}♠` });
  }
  core.state.deck.set('cards', floor);
}

function setupCore(core, roster, myUid, mpClient) {
  core.buildCardMatrix();
  for (const h of core.CLOCKWISE_TRACK) core.state.board.set(h, null);
  core.state.meta.set('winner', null);
  core.state.meta.set('myUserId', myUid);
  roster.forEach((seat, i) => {
    const hole = RUNWAY[i % RUNWAY.length];
    seat.pegs[0].holeId = hole;
    seat.pegs[0].holeType = core.getHoleType(hole);
    core.state.board.set(hole, { playerIdx: seat.index, pegId: seat.pegs[0].id });
  });
  core.state.players.set('list', roster.map(s => ({ ...s, pegs: s.pegs.map(p => ({ ...p })) })));
  core.state.players.set('current', 0);
  core.state.turn.set('phase', 'draw');
  core.state.turn.set('validMoves', []);
  core.state.deck.set('discard', []);
  core.CutsceneManager.queueCutscene = function () {};  // keep advance synchronous
  core.setMultiplayerClient(mpClient);
}

const deckLen = (core) => (core.state.deck.get('cards') || []).length;
const leadHoles = (core) =>
  (core.state.players.get('list') || []).map(s => s.pegs[0].holeId);
function boardSig(core) {
  // Stable signature of the full game position for cross-client equality checks.
  // The board table only exposes get/set, so we read the authoritative roster:
  // every seat's every peg holeId, in seat/peg order, plus whose turn it is.
  const list = core.state.players.get('list') || [];
  const parts = [`cur=${core.state.players.get('current') || 0}`];
  list.forEach((s, si) => {
    s.pegs.forEach((p, pi) => parts.push(`${si}.${pi}=${p.holeId}`));
  });
  return parts.join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE 1: lone human (host) + 2 bots, relay attached. One human turn cascades
// through both bots back to the human. Over each full round, all three seats
// must consume exactly one card and advance their lead peg; the seat must return
// to the human (no skip, no double, bots relinquish).
// ─────────────────────────────────────────────────────────────────────────────
function runLoneHumanCase(selfEcho) {
  console.log(`\n── CASE 1: lone human + 2 bots, relay attached (selfEcho=${selfEcho}) ──`);
  _now = 0; _timers.length = 0;
  const core = loadCore();
  const PEGS = core.PEGS_PER_PLAYER || 5;
  const N = 3;
  const roster = [
    mkSeat(0, 'U_HOST', 'Host', false, PEGS),
    mkSeat(1, 'U_BOT1', 'Bot 1', true, PEGS),
    mkSeat(2, 'U_BOT2', 'Bot 2', true, PEGS),
  ];
  const relay = makeRelay(selfEcho);
  const mpClient = {
    userId: 'U_HOST', isHost: true,
    session: { players: [
      { user_id: 'U_HOST', is_ai: false },
      { user_id: 'U_BOT1', is_ai: true },
      { user_id: 'U_BOT2', is_ai: true },
    ] },
    sendAction(action, payload) { relay.send(core, action, payload); },
  };
  setupCore(core, roster, 'U_HOST', mpClient);
  relay.register(core, 'U_HOST');
  stackDeck(core, 400);

  const ROUNDS = 4;
  for (let r = 0; r < ROUNDS; r++) {
    const cur = core.state.players.get('current');
    ok(cur === 0, `round ${r}: control is on the human (seat ${cur})`);

    const deckBefore = deckLen(core);
    const holesBefore = leadHoles(core);

    // Human draws a small forward card and plays move 0; the bot cascade follows.
    core.state.turn.set('phase', 'draw');
    core.drawCard();
    const moves = (core.state.turn.get('validMoves') || []).length;
    ok(moves > 0, `round ${r}: human had a legal move (moves=${moves})`);
    if (moves > 0) core.executeMove(0);
    runClock(); relay.drain(); runClock(); relay.drain();

    // Exactly N cards consumed this round = one per seat (no skip, no double).
    const consumed = deckBefore - deckLen(core);
    ok(consumed === N,
      `round ${r}: exactly ${N} cards consumed (one per seat), got ${consumed}`);

    // Every seat's lead peg advanced (a skipped bot's peg would be unchanged).
    const holesAfter = leadHoles(core);
    let movedAll = true, stuck = -1;
    for (let s = 0; s < N; s++) {
      if (holesAfter[s] === holesBefore[s]) { movedAll = false; stuck = s; }
    }
    ok(movedAll,
      `round ${r}: every seat's lead peg advanced` +
      (movedAll ? '' : `: seat ${stuck} (${roster[stuck].name}) DID NOT MOVE (skipped)`));

    // Turn returned to the human (full round, no off-by-one).
    ok(core.state.players.get('current') === 0,
      `round ${r}: turn returned to the human after the bot cascade`);
  }

  // A redraw on the human keeps the seat (redraw still works under MP+bots).
  core.state.deck.set('cards', [{ id: 'rd', value: '6', display: '6♠' }]);
  core.state.turn.set('phase', 'draw');
  const seatBefore = core.state.players.get('current');
  core.drawCard();
  if ((core.state.turn.get('validMoves') || []).length > 0) core.executeMove(0);
  runClock(); relay.drain(); runClock(); relay.drain();
  ok(core.state.players.get('current') === seatBefore,
    `redraw card (6) on the human keeps the same seat (${seatBefore})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE 2: host (human) + peer (human) + 1 bot, two wired core instances. THIS is
// the case the bug-fix targets: the host drives the bot (seat 2). Over each
// round (host turn, then peer turn that cascades through the bot back to host),
// assert host/peer agree on the seat at every settle point, the bot actually
// plays (its peg advances + a card is consumed), and the two boards are identical.
// ─────────────────────────────────────────────────────────────────────────────
function runHostPeerBotCase(selfEcho) {
  console.log(`\n── CASE 2: host + peer + 1 bot, relay attached (selfEcho=${selfEcho}) ──`);
  _now = 0; _timers.length = 0;
  const H = loadCore();
  const P = loadCore();
  const PEGS = H.PEGS_PER_PLAYER || 5;
  const sessionPlayers = [
    { user_id: 'U_HOST', is_ai: false },
    { user_id: 'U_PEER', is_ai: false },
    { user_id: 'U_BOT', is_ai: true },
  ];
  const mkRoster = () => [
    mkSeat(0, 'U_HOST', 'Host', false, PEGS),
    mkSeat(1, 'U_PEER', 'Peer', false, PEGS),
    mkSeat(2, 'U_BOT', 'Bot', true, PEGS),
  ];
  const relay = makeRelay(selfEcho);
  const hClient = {
    userId: 'U_HOST', isHost: true, session: { players: sessionPlayers },
    sendAction(action, payload) { relay.send(H, action, payload); },
  };
  const pClient = {
    userId: 'U_PEER', isHost: false, session: { players: sessionPlayers },
    sendAction(action, payload) { relay.send(P, action, payload); },
  };
  setupCore(H, mkRoster(), 'U_HOST', hClient);
  setupCore(P, mkRoster(), 'U_PEER', pClient);
  relay.register(H, 'U_HOST');
  relay.register(P, 'U_PEER');
  stackDeck(H, 400);
  stackDeck(P, 400);

  const settled = () => {
    const hc = H.state.players.get('current');
    const pc = P.state.players.get('current');
    return { hc, pc, agree: hc === pc };
  };

  const ROUNDS = 4;
  for (let r = 0; r < ROUNDS; r++) {
    // ── Host turn (seat 0) ──
    {
      const s = settled();
      ok(s.hc === 0 && s.pc === 0, `round ${r}: pre-host both agree seat 0 (host=${s.hc} peer=${s.pc})`);
      H.state.turn.set('phase', 'draw');
      H.drawCard();
      const moves = (H.state.turn.get('validMoves') || []).length;
      ok(moves > 0, `round ${r}: host had a legal move (moves=${moves})`);
      if (moves > 0) H.executeMove(0);
      runClock(); relay.drain(); runClock(); relay.drain();
    }
    {
      const s = settled();
      ok(s.hc === 1 && s.pc === 1, `round ${r}: after host, both agree seat 1 (host=${s.hc} peer=${s.pc})`);
    }

    // ── Peer turn (seat 1) cascades through the bot (seat 2) back to host (0) ──
    const botHoleBeforeH = H.state.players.get('list')[2].pegs[0].holeId;
    const botHoleBeforeP = P.state.players.get('list')[2].pegs[0].holeId;
    const deckBeforeH = deckLen(H);
    {
      P.state.turn.set('phase', 'draw');
      P.drawCard();
      const moves = (P.state.turn.get('validMoves') || []).length;
      ok(moves > 0, `round ${r}: peer had a legal move (moves=${moves})`);
      if (moves > 0) P.executeMove(0);
      runClock(); relay.drain(); runClock(); relay.drain();
    }
    {
      const s = settled();
      ok(s.hc === 0 && s.pc === 0,
        `round ${r}: after peer+bot cascade, both agree seat 0 (host=${s.hc} peer=${s.pc})`);
    }
    // The bot (seat 2) must have actually played: a card consumed for it (peer +
    // bot = 2 cards this stretch) and its peg advanced on BOTH clients.
    const consumed = deckBeforeH - deckLen(H);
    ok(consumed === 2,
      `round ${r}: peer + bot each consumed a card (expected 2), got ${consumed} (a skipped bot would give 1)`);
    const botHoleAfterH = H.state.players.get('list')[2].pegs[0].holeId;
    const botHoleAfterP = P.state.players.get('list')[2].pegs[0].holeId;
    ok(botHoleAfterH !== botHoleBeforeH,
      `round ${r}: the bot's peg advanced on the HOST (${botHoleBeforeH} -> ${botHoleAfterH})`);
    ok(botHoleAfterP !== botHoleBeforeP,
      `round ${r}: the bot's peg advanced on the PEER (${botHoleBeforeP} -> ${botHoleAfterP})`);

    // Boards identical across clients.
    ok(boardSig(H) === boardSig(P), `round ${r}: host and peer boards are identical`);
  }
}

// ─── Run all four variants ────────────────────────────────────────────────────
runLoneHumanCase(false);
runLoneHumanCase(true);
runHostPeerBotCase(false);
runHostPeerBotCase(true);

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
process.exit(fail ? 1 : 0);
