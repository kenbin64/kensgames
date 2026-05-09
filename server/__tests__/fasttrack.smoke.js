'use strict';

/**
 * Smoke test: FastTrack rules — turn rotation, extra-turn cards, settle
 * handshake, peg-home win.
 * Run: node server/__tests__/fasttrack.smoke.js
 */

const assert = require('assert');
const { GameMaster, channels, registerRules } = require('../game-kernel');
const FT = require('../game-kernel/games/fasttrack.rules.js');

registerRules(FT);

function settleAll(chans) {
  for (const ch of chans) ch._inject({ type: 'settle_complete' });
  for (const ch of chans) ch._drainOutbox();
}

// ─── 1. Basic flow: draw → play (non-extra) → turn rotates ───────────────────

(function testBasicTurnRotation() {
  const players = [
    { id: 'p1', name: 'A', isAI: false },
    { id: 'p2', name: 'B', isAI: false },
  ];
  const c1 = channels.localChannel('p1');
  const c2 = channels.localChannel('p2');
  const gm = new GameMaster({
    rules: FT, players, channels: [c1, c2],
    meta: { deckSeed: 'deadbeef' },  // deterministic deck
  });
  const init = c1._drainOutbox();
  c2._drainOutbox();

  const turn0 = init.find((m) => m.type === 'turn');
  assert.strictEqual(turn0.activePlayerId, 'p1');
  assert.strictEqual(turn0.settled, true);
  const state0 = init.find((m) => m.type === 'state').state;
  assert.strictEqual(state0.phaseStep, 'draw');
  assert.strictEqual(state0.deckCount, 54);

  // p2 tries to draw → not your turn
  c2._inject({ type: 'draw' });
  assert.ok(c2._drainOutbox().find((m) => m.type === 'error' && m.reason === 'not-your-turn'));

  // p1 draws → hybrid mode: phaseStep moves straight to 'play', no settle gate
  c1._inject({ type: 'draw' });
  c1._drainOutbox();
  let s = gm.getState();
  assert.strictEqual(s.phaseStep, 'play');
  assert.strictEqual(s.unsettled, false);
  assert.ok(s.pendingCard);
  assert.strictEqual(s.deck.length, 53);

  // Settle ack from any client is accepted as a no-op (back-compat).
  settleAll([c1, c2]);
  s = gm.getState();
  assert.strictEqual(s.phaseStep, 'play');
  assert.strictEqual(s.order[s.turnIdx], 'p1');

  // Force a non-extra card by replacing pendingCard with a known plain card.
  // (We exploit the fact that applyAction re-reads pendingCard; here we set
  // one we know has extra_turn=false: the '5'.)
  s.pendingCard = { code: '5-clubs', rank: '5', suit: 'clubs', def: { extra_turn: false } };
  // p1 plays → phaseStep returns to 'draw' and turn advances to p2 immediately.
  c1._inject({ type: 'play', payload: { from: 'hold-0-1', to: 'outer-0-5', extraTurn: false } });
  c1._drainOutbox();
  s = gm.getState();
  assert.strictEqual(s.phaseStep, 'draw');
  assert.strictEqual(s.order[s.turnIdx], 'p2');

  gm.close();
  console.log('OK  fasttrack: basic draw → play → rotate');
})();

// ─── 2. Extra-turn card: turn does NOT relinquish ────────────────────────────

(function testExtraTurn() {
  const players = [
    { id: 'p1', name: 'A', isAI: false },
    { id: 'p2', name: 'B', isAI: false },
  ];
  const c1 = channels.localChannel('p1');
  const c2 = channels.localChannel('p2');
  const gm = new GameMaster({ rules: FT, players, channels: [c1, c2], meta: { deckSeed: '1234' } });
  c1._drainOutbox(); c2._drainOutbox();

  c1._inject({ type: 'draw' });
  c1._drainOutbox();
  // Hybrid mode: draw immediately advances to 'play'.

  // Force an Ace (extra_turn=true)
  let s = gm.getState();
  s.pendingCard = { code: 'A-hearts', rank: 'A', suit: 'hearts', def: { extra_turn: true } };

  c1._inject({ type: 'play', payload: { extraTurn: true } });
  c1._drainOutbox();
  s = gm.getState();
  // Turn stays with p1, phaseStep cycles back to 'draw' immediately
  assert.strictEqual(s.order[s.turnIdx], 'p1');
  assert.strictEqual(s.phaseStep, 'draw');
  assert.strictEqual(s.extraTurnPending, false);

  gm.close();
  console.log('OK  fasttrack: extra-turn card grants another draw');
})();

// ─── 3. Win by 5 pegs home ───────────────────────────────────────────────────

(function testWin() {
  const players = [
    { id: 'p1', name: 'A', isAI: false },
    { id: 'p2', name: 'B', isAI: false },
  ];
  const c1 = channels.localChannel('p1');
  const c2 = channels.localChannel('p2');
  const gm = new GameMaster({ rules: FT, players, channels: [c1, c2], meta: { deckSeed: 'cafe' } });
  c1._drainOutbox(); c2._drainOutbox();

  // peg_home is allowed from any client at any time (it's a cinematic landing).
  for (let i = 0; i < 5; i++) {
    c1._inject({ type: 'peg_home', payload: { playerId: 'p1' } });
  }
  const s = gm.getState();
  assert.strictEqual(s.phase, 'ended');
  assert.strictEqual(s.winner, 'p1');
  assert.strictEqual(s.pegsHome.p1, 5);

  // Any subsequent action rejected
  c1._inject({ type: 'draw' });
  assert.ok(c1._drainOutbox().some((m) => m.type === 'error'));

  gm.close();
  console.log('OK  fasttrack: 5-pegs-home win detected');
})();

console.log('All FastTrack rule tests passed.');
