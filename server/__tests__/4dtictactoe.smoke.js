'use strict';

/**
 * Smoke test: 4DTicTacToe rules — turn gating, settle handshake, win + draw.
 * Run: node server/__tests__/4dtictactoe.smoke.js
 */

const assert = require('assert');
const { GameMaster, channels, registerRules } = require('../game-kernel');
const T4 = require('../game-kernel/games/4dtictactoe.rules.js');

registerRules(T4);

// ─── 1. Turn gating + settle handshake on a 2-player game ────────────────────

(function testTurnAndSettle() {
  const players = [
    { id: 'p1', name: 'Red', isAI: false },
    { id: 'p2', name: 'Blue', isAI: false },
  ];
  const c1 = channels.localChannel('p1');
  const c2 = channels.localChannel('p2');
  const gm = new GameMaster({
    rules: T4, players, channels: [c1, c2],
    meta: { scenario: 'classic' },
  });

  // Initial: state + turn(p1, settled=true)
  let init1 = c1._drainOutbox();
  c2._drainOutbox();
  const turn0 = init1.find((m) => m.type === 'turn');
  assert.ok(turn0);
  assert.strictEqual(turn0.activePlayerId, 'p1');
  assert.strictEqual(turn0.settled, true);
  const init = init1.find((m) => m.type === 'state').state;
  assert.strictEqual(init.size, 4);                // 2 players → grid 4
  assert.strictEqual(init.winLen, 4);
  assert.strictEqual(init.scenario, 'classic');

  // p2 tries to drop → not your turn
  c2._inject({ type: 'drop', payload: { col: 0, layer: 0 } });
  const err = c2._drainOutbox().find((m) => m.type === 'error');
  assert.ok(err && err.reason === 'not-your-turn');

  // p1 drops → unsettled, turn stays p1 until both ack
  c1._inject({ type: 'drop', payload: { col: 0, layer: 0 } });
  const after = c1._drainOutbox();
  const turn1 = after.find((m) => m.type === 'turn');
  assert.ok(turn1);
  assert.strictEqual(turn1.activePlayerId, 'p1');
  assert.strictEqual(turn1.settled, false);
  let s = gm.getState();
  assert.strictEqual(s.board[0][0][0], 'p1');
  assert.strictEqual(s.unsettled, true);

  // p1 tries to drop again during cinematic → invalid
  c1._inject({ type: 'drop', payload: { col: 1, layer: 0 } });
  const err2 = c1._drainOutbox().find((m) => m.type === 'error');
  assert.ok(err2 && err2.reason === 'invalid-action');

  // p1 alone confirms → still unsettled
  c1._inject({ type: 'settle_complete' });
  c1._drainOutbox(); c2._drainOutbox();
  s = gm.getState();
  assert.strictEqual(s.unsettled, true);

  // p2 confirms → turn advances to p2
  c2._inject({ type: 'settle_complete' });
  const advanced = c2._drainOutbox().reverse().find((m) => m.type === 'turn');
  assert.ok(advanced);
  assert.strictEqual(advanced.activePlayerId, 'p2');
  assert.strictEqual(advanced.settled, true);

  gm.close();
  console.log('OK  4dtictactoe: turn gating + settle handshake');
})();

// ─── 2. Vertical 4-in-a-row win (single column, layer 0) ─────────────────────

(function testWin() {
  const players = [
    { id: 'p1', name: 'A', isAI: false },
    { id: 'p2', name: 'B', isAI: false },
  ];
  const c1 = channels.localChannel('p1');
  const c2 = channels.localChannel('p2');
  const gm = new GameMaster({ rules: T4, players, channels: [c1, c2], meta: { scenario: 'classic' } });
  c1._drainOutbox(); c2._drainOutbox();

  function move(ch, col, layer) {
    ch._inject({ type: 'drop', payload: { col, layer } });
    // both players settle to advance turn
    c1._inject({ type: 'settle_complete' });
    c2._inject({ type: 'settle_complete' });
    c1._drainOutbox(); c2._drainOutbox();
  }

  // Stack p1 in col 0/layer 0 four times; p2 fills col 1/layer 0 (won't win first).
  // Sequence: p1@(0,0), p2@(1,0), p1@(0,0), p2@(1,0), p1@(0,0), p2@(1,0), p1@(0,0)→win
  // The 4th p1 drop wins, so we stop calling settle for it.
  move(c1, 0, 0);
  move(c2, 1, 0);
  move(c1, 0, 0);
  move(c2, 1, 0);
  move(c1, 0, 0);
  move(c2, 1, 0);
  // Final winning move — no settle handshake (game ends immediately)
  c1._inject({ type: 'drop', payload: { col: 0, layer: 0 } });

  const s = gm.getState();
  assert.strictEqual(s.phase, 'ended');
  assert.strictEqual(s.winner, 'p1');
  assert.ok(Array.isArray(s.winLine) && s.winLine.length === 4);
  // All 4 cells in col 0 / layer 0 (rows 0..3)
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(s.board[0][i][0], 'p1');
  }
  gm.close();
  console.log('OK  4dtictactoe: vertical win detected, line length=' + s.winLine.length);
})();

console.log('All 4DTicTacToe rule tests passed.');
