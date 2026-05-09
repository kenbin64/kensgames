'use strict';

/**
 * Smoke test: real-time tick mode (Starfighter + BrickBreaker3D-multi).
 * Run: node server/__tests__/realtime.smoke.js
 */

const assert = require('assert');
const { GameMaster, channels, registerRules } = require('../game-kernel');
const SF = require('../game-kernel/games/starfighter.rules.js');
const BBM = require('../game-kernel/games/brickbreaker3d-multi.rules.js');

registerRules(SF);
registerRules(BBM);

// ─── 1. Starfighter: ticks happen, ship moves under input, bullets spawn ─────

(function testStarfighter(done) {
  const players = [
    { id: 'a', name: 'A', isAI: false },
    { id: 'b', name: 'B', isAI: false },
  ];
  const ca = channels.localChannel('a');
  const cb = channels.localChannel('b');
  const gm = new GameMaster({ rules: SF, players, channels: [ca, cb] });

  // Initial broadcast
  const init = ca._drainOutbox().find((m) => m.type === 'state').state;
  cb._drainOutbox();
  assert.strictEqual(init.phase, 'playing');
  assert.strictEqual(Object.keys(init.ships).length, 2);
  const ax0 = init.ships.a.x, ay0 = init.ships.a.y;

  // a thrusts forward + fires
  ca._inject({ type: 'input', payload: { thrust: 1, turn: 0, fire: true } });

  setTimeout(() => {
    // After ~150ms (≈4-5 ticks @ 30Hz) the ship should have moved.
    const broadcasts = ca._drainOutbox().filter((m) => m.type === 'state');
    assert.ok(broadcasts.length >= 2, `expected ≥2 ticks, got ${broadcasts.length}`);
    const last = broadcasts[broadcasts.length - 1].state;
    const moved = Math.hypot(last.ships.a.x - ax0, last.ships.a.y - ay0);
    assert.ok(moved > 0.1, `ship should have moved, delta=${moved}`);
    assert.ok(last.bullets.length >= 1, 'expected at least one bullet');

    // Both clients receive the same state object structure
    const lastB = cb._drainOutbox().filter((m) => m.type === 'state').pop().state;
    assert.strictEqual(lastB.ships.a.x, last.ships.a.x);
    assert.strictEqual(lastB.bullets.length, last.bullets.length);

    gm.close();
    console.log('OK  starfighter: tick loop, input→movement, bullet spawn, unified broadcast');
    done();
  }, 200);
})(() => {

  // ─── 2. BrickBreaker3D-multi: ticks; ball moves; valid input accepted ─────

  (function testBBMulti(done) {
    const players = [
      { id: 'p1', name: 'A', isAI: false },
      { id: 'p2', name: 'B', isAI: false },
    ];
    const c1 = channels.localChannel('p1');
    const c2 = channels.localChannel('p2');
    const gm = new GameMaster({ rules: BBM, players, channels: [c1, c2] });

    const init = c1._drainOutbox().find((m) => m.type === 'state').state;
    c2._drainOutbox();
    assert.strictEqual(init.phase, 'playing');
    assert.strictEqual(init.balls.length, 2);
    assert.strictEqual(Object.keys(init.paddles).length, 2);
    const angle0 = init.paddles.p1.angle;
    const ballX0 = init.balls[0].x, ballY0 = init.balls[0].y;

    c1._inject({ type: 'input', payload: { paddle: 1 } });

    setTimeout(() => {
      const last = c1._drainOutbox().filter((m) => m.type === 'state').pop().state;
      // Paddle should have rotated
      assert.notStrictEqual(last.paddles.p1.angle, angle0);
      // Ball should have moved (might collide with rim & respawn, but pos changes)
      const moved = Math.hypot(last.balls[0].x - ballX0, last.balls[0].y - ballY0);
      assert.ok(moved > 0.01 || last.balls[0].x !== ballX0, 'ball should advance');

      gm.close();
      console.log('OK  brickbreaker3d_multi: tick loop, paddle rotates, ball moves');
      done();
    }, 200);
  })(() => {
    console.log('All real-time tick tests passed.');
  });
});
