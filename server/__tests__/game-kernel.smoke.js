'use strict';

/**
 * Smoke test for the game kernel — no sockets, no filesystem.
 * Run: node server/__tests__/game-kernel.smoke.js
 */

const assert = require('assert');
const {
  registerRules,
  getRules,
  listRules,
  GameMaster,
  channels,
} = require('../game-kernel');

// ── Trivial rules: counter game. Each player can submit { type: 'inc' }.
//    First to reach target wins.
const COUNTER_RULES = {
  id: 'counter',
  createInitialState(players) {
    const counts = {};
    for (const p of players) counts[p.id] = 0;
    return { counts, target: 3, winner: null };
  },
  validateAction(state, action) {
    if (state.winner) return false;
    if (action.type !== 'inc') return false;
    return Object.prototype.hasOwnProperty.call(state.counts, action.playerId);
  },
  applyAction(state, action) {
    const counts = { ...state.counts, [action.playerId]: state.counts[action.playerId] + 1 };
    const winner = counts[action.playerId] >= state.target ? action.playerId : null;
    return { ...state, counts, winner };
  },
  isGameOver(state) { return state.winner !== null; },
  getVisibleState(state /*, playerId */) { return state; },
};

registerRules(COUNTER_RULES);
assert.deepStrictEqual(listRules(), ['counter']);
assert.strictEqual(getRules('counter'), COUNTER_RULES);

// ── Players + channels
const players = [
  { id: 'alice', name: 'Alice', isAI: false },
  { id: 'bob', name: 'Bob', isAI: false },
];
const aliceCh = channels.localChannel('alice');
const bobCh = channels.localChannel('bob');

const persisted = [];
const gm = new GameMaster({
  rules: COUNTER_RULES,
  players,
  channels: [aliceCh, bobCh],
  persist: (action) => persisted.push(action),
  meta: { sessionId: 'test-1' },
});

// Initial broadcast happened in constructor
const aliceInit = aliceCh._drainOutbox();
const bobInit = bobCh._drainOutbox();
assert.strictEqual(aliceInit.length, 1);
assert.strictEqual(aliceInit[0].type, 'state');
assert.strictEqual(bobInit.length, 1);

// Alice sends invalid action
aliceCh._inject({ type: 'noop' });
const errBatch = aliceCh._drainOutbox();
assert.strictEqual(errBatch[0].type, 'error');

// Run a game: alice inc 3x → wins
aliceCh._inject({ type: 'inc' });
aliceCh._inject({ type: 'inc' });
aliceCh._inject({ type: 'inc' });

assert.strictEqual(gm.getState().winner, 'alice');
assert.strictEqual(gm.isOver(), true);
assert.strictEqual(persisted.length, 3);

// Both channels saw state updates + a game_over
const aliceTail = aliceCh._drainOutbox();
const bobTail = bobCh._drainOutbox();
assert.ok(aliceTail.some((m) => m.type === 'game_over'));
assert.ok(bobTail.some((m) => m.type === 'game_over'));

// Action log captured
assert.strictEqual(gm.getActionLog().length, 3);
assert.strictEqual(gm.getActionLog()[0].playerId, 'alice');

gm.close();
console.log('OK  game-kernel smoke test passed');
console.log('    actions logged:', persisted.length);
console.log('    final winner  :', gm.getState().winner);
