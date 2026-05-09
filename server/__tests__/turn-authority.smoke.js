'use strict';

/**
 * Turn-authority smoke test.
 * Run: node server/__tests__/turn-authority.smoke.js
 *
 * Trivial turn-based "ping" game:
 *   - 3 players in a fixed rotation (a → b → c → a …)
 *   - Action `ping` increments a counter and marks the board "unsettled"
 *     (simulating a cinematic playing). Turn does NOT advance yet.
 *   - Any player sends `settle_complete` to confirm cinematic done; once
 *     ALL players have confirmed, the board becomes settled and the turn
 *     advances. Mirrors FastTrack / 4D-tic-tac-toe relinquish semantics.
 *   - First counter to reach 3 wins.
 */

const assert = require('assert');
const { GameMaster, channels } = require('../game-kernel');

const RULES = {
  id: 'ping-rotation',
  createInitialState(players) {
    return {
      order: players.map((p) => p.id),       // rotation
      turnIdx: 0,                            // index into order
      counts: Object.fromEntries(players.map((p) => [p.id, 0])),
      target: 3,
      winner: null,
      // Settle handshake: when unsettled, turn cannot advance until every
      // player has acknowledged via settle_complete.
      unsettled: false,
      acks: {},                              // playerId → bool
    };
  },
  validateAction(state, action) {
    if (state.winner) return false;
    if (action.type === 'settle_complete') return state.unsettled;
    if (action.type === 'ping') {
      // Only meaningful when settled (no double-ping mid-cinematic).
      return !state.unsettled;
    }
    return false;
  },
  applyAction(state, action) {
    if (action.type === 'ping') {
      const counts = { ...state.counts, [action.playerId]: state.counts[action.playerId] + 1 };
      const winner = counts[action.playerId] >= state.target ? action.playerId : null;
      return { ...state, counts, winner, unsettled: !winner, acks: {} };
    }
    if (action.type === 'settle_complete') {
      const acks = { ...state.acks, [action.playerId]: true };
      const everyone = state.order.every((id) => acks[id]);
      if (!everyone) return { ...state, acks };
      // All confirmed → settle, advance turn, clear acks.
      return {
        ...state,
        acks: {},
        unsettled: false,
        turnIdx: (state.turnIdx + 1) % state.order.length,
      };
    }
    return state;
  },
  isGameOver(state) { return !!state.winner; },
  getVisibleState(state) { return state; },
  // Optional turn-control:
  getCurrentTurn(state) { return state.order[state.turnIdx]; },
  isSettled(state) { return !state.unsettled; },
};

const players = [
  { id: 'a', name: 'Alpha', isAI: false },
  { id: 'b', name: 'Beta', isAI: false },
  { id: 'c', name: 'Gamma', isAI: false },
];
const cha = channels.localChannel('a');
const chb = channels.localChannel('b');
const chc = channels.localChannel('c');

const gm = new GameMaster({
  rules: RULES,
  players,
  channels: [cha, chb, chc],
});

// 1) Initial broadcasts: state + turn(a, settled=true)
const initA = cha._drainOutbox();
chb._drainOutbox(); chc._drainOutbox();
assert.ok(initA.find((m) => m.type === 'state'), 'initial state');
const turn0 = initA.find((m) => m.type === 'turn');
assert.ok(turn0, 'initial turn message');
assert.strictEqual(turn0.activePlayerId, 'a');
assert.strictEqual(turn0.settled, true);

// 2) Wrong player tries to act → rejected with not-your-turn
chb._inject({ type: 'ping' });
const errBatch = chb._drainOutbox();
const err = errBatch.find((m) => m.type === 'error');
assert.ok(err, 'expected error');
assert.strictEqual(err.reason, 'not-your-turn');
assert.strictEqual(err.activePlayerId, 'a');

// 3) Active player pings → state updates, unsettled, turn DOES NOT advance
cha._inject({ type: 'ping' });
const afterPing = cha._drainOutbox();
const turn1 = afterPing.find((m) => m.type === 'turn');
assert.ok(turn1, 'turn broadcast after settle change');
assert.strictEqual(turn1.activePlayerId, 'a', 'turn stays with a while unsettled');
assert.strictEqual(turn1.settled, false);
assert.strictEqual(gm.getState().counts.a, 1);

// 4) Active player tries to ping again → rejected (unsettled)
cha._drainOutbox();
cha._inject({ type: 'ping' });
const ping2 = cha._drainOutbox();
const err2 = ping2.find((m) => m.type === 'error');
assert.ok(err2 && err2.reason === 'invalid-action', 'ping during cinematic rejected');

// 5) Partial settle: only a + b confirm → still unsettled, turn unchanged
chb._drainOutbox(); chc._drainOutbox();
cha._inject({ type: 'settle_complete' });
chb._inject({ type: 'settle_complete' });
chc._drainOutbox();
let st = gm.getState();
assert.strictEqual(st.unsettled, true);
assert.strictEqual(st.turnIdx, 0);

// 6) Final ack from c → settle, turn advances to b
chc._inject({ type: 'settle_complete' });
const advancedAll = chc._drainOutbox();
const turn2 = advancedAll.reverse().find((m) => m.type === 'turn');
assert.ok(turn2);
assert.strictEqual(turn2.activePlayerId, 'b');
assert.strictEqual(turn2.settled, true);

// 7) Quick run-through to win: each player pings + everyone settles
function fullPingRound(activeId) {
  const chans = { a: cha, b: chb, c: chc };
  chans[activeId]._inject({ type: 'ping' });
  cha._inject({ type: 'settle_complete' });
  chb._inject({ type: 'settle_complete' });
  chc._inject({ type: 'settle_complete' });
  cha._drainOutbox(); chb._drainOutbox(); chc._drainOutbox();
}
// Currently b's turn. We need a to reach 3 (already at 1).
fullPingRound('b');  // b=1, turn → c
fullPingRound('c');  // c=1, turn → a
fullPingRound('a');  // a=2, turn → b
fullPingRound('b');  // b=2, turn → c
fullPingRound('c');  // c=2, turn → a
// One more ping by a → a=3 wins (no settle needed once won)
cha._inject({ type: 'ping' });

st = gm.getState();
assert.strictEqual(st.winner, 'a', `expected a to win, got ${st.winner}`);
assert.strictEqual(gm.isOver(), true);

gm.close();
console.log('OK  turn-authority: gating, settle handshake, win all verified');
