'use strict';

/**
 * Smoke test: BrickBreaker 3D rules under solo and solo_vs_bot.
 * Run: node server/__tests__/brickbreaker3d.smoke.js
 */

const assert = require('assert');
const { GameMaster, channels, registerRules } = require('../game-kernel');
const BB3D = require('../game-kernel/games/brickbreaker3d.rules.js');
const { createBrickBreakerAI } = require('../game-kernel/games/brickbreaker3d.ai.js');

registerRules(BB3D);

// ─── 1. Solo run: hit some bricks, clear a level, then lose all lives ────────

(function testSolo() {
  const player = { id: 'human', name: 'Solo', isAI: false };
  const ch = channels.localChannel('human');

  const gm = new GameMaster({
    rules: BB3D,
    players: [player],
    channels: [ch],
    meta: { mode: 'solo', sessionId: 'solo-test' },
  });

  // initial broadcast
  let msgs = ch._drainOutbox();
  assert.strictEqual(msgs[0].type, 'state');
  const init = msgs[0].state;
  assert.strictEqual(init.mode, 'solo');
  assert.strictEqual(init.seats.human.lives, 5);  // from rules sheet
  assert.strictEqual(init.seats.human.score, 0);

  // 3 brick hits
  ch._inject({ type: 'brick_hit', payload: { layer: 0 } });
  ch._inject({ type: 'brick_hit', payload: { layer: 1 } });
  ch._inject({ type: 'brick_hit', payload: { layer: 3 } });
  ch._drainOutbox();

  let s = gm.getState();
  // 10 + 16 + 42 = 68 (10*1, 10*1.618≈16, 10*4.236≈42)
  assert.ok(s.seats.human.score >= 65 && s.seats.human.score <= 70, `score=${s.seats.human.score}`);

  // Clear level
  ch._inject({ type: 'level_clear' });
  s = gm.getState();
  assert.strictEqual(s.level, 2);
  // 500 + 100 * 5 = 1000 added
  assert.ok(s.seats.human.score >= 1065);

  // Lose all 5 lives
  for (let i = 0; i < 5; i++) ch._inject({ type: 'life_lost' });
  s = gm.getState();
  assert.strictEqual(s.phase, 'ended');
  assert.strictEqual(s.winner, null);  // solo: no winner declared
  assert.strictEqual(s.seats.human.lives, 0);

  // Further actions rejected
  ch._drainOutbox();
  ch._inject({ type: 'brick_hit', payload: { layer: 0 } });
  const after = ch._drainOutbox();
  assert.ok(after.some((m) => m.type === 'error'));

  gm.close();
  console.log('OK  brickbreaker3d solo: final score', s.seats.human.score);
})();

// ─── 2. Solo vs Bot: human channel + local AI controller ─────────────────────

(function testSoloVsBot() {
  return new Promise((resolve) => {
    const human = { id: 'p_human', name: 'Human', isAI: false };
    const bot = { id: 'p_bot', name: 'Bot', isAI: true };
    const humanCh = channels.localChannel('p_human');
    const botCh = channels.localChannel('p_bot');

    const gm = new GameMaster({
      rules: BB3D,
      players: [human, bot],
      channels: [humanCh, botCh],
      aiFactory: (p) => p.isAI ? createBrickBreakerAI({ difficulty: 'hard' }) : null,
      meta: { mode: 'solo_vs_bot', sessionId: 'svb-test' },
    });

    const init = humanCh._drainOutbox()[0].state;
    assert.strictEqual(init.mode, 'solo_vs_bot');
    assert.strictEqual(init.seats.p_human.lives, 4);  // max(2, 6-2)=4
    assert.strictEqual(init.seats.p_bot.lives, 4);
    botCh._drainOutbox();

    // Human loses all 4 lives → bot wins
    for (let i = 0; i < 4; i++) humanCh._inject({ type: 'life_lost' });

    // Give the AI a brief moment in case it queued anything (it shouldn't matter — human died).
    setTimeout(() => {
      const s = gm.getState();
      assert.strictEqual(s.phase, 'ended');
      assert.strictEqual(s.winner, 'p_bot');
      assert.strictEqual(s.seats.p_human.lives, 0);
      // Bot got 4 × opponent_life_lost_bonus (200 each) = 800 plus any brick hits
      assert.ok(s.seats.p_bot.score >= 800, `bot score=${s.seats.p_bot.score}`);

      gm.close();
      console.log('OK  brickbreaker3d solo_vs_bot: winner=' + s.winner +
        ' bot_score=' + s.seats.p_bot.score);
      resolve();
    }, 50);
  });
})().then(() => {
  console.log('All BrickBreaker3D rule tests passed.');
});
