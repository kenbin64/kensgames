'use strict';

/**
 * Simple AI controller for BrickBreaker 3D 'solo_vs_bot' mode.
 *
 * The AI does not simulate physics — it emits scoring events at a cadence
 * determined by difficulty. Higher difficulty = faster brick hits and lower
 * life-loss rate. Stops automatically when the game ends.
 *
 * Contract (matches GameMaster expectation):
 *   startLoop(submit, getVisibleState)
 *   stop()
 */

const DIFFICULTY = {
  normal: { brickEveryMs: 1400, lifeLossChance: 0.10, lifeCheckMs: 5000 },
  hard: { brickEveryMs: 900, lifeLossChance: 0.05, lifeCheckMs: 6000 },
};

function createBrickBreakerAI({ difficulty = 'normal' } = {}) {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  let brickTimer = null;
  let lifeTimer = null;
  let stopped = false;

  return {
    startLoop(submit, getVisibleState) {
      const tickBrick = () => {
        if (stopped) return;
        const s = getVisibleState();
        if (!s || s.phase !== 'playing') { this.stop(); return; }
        const layer = Math.floor(Math.random() * 4);
        submit({ type: 'brick_hit', payload: { layer } });
      };
      const tickLife = () => {
        if (stopped) return;
        const s = getVisibleState();
        if (!s || s.phase !== 'playing') { this.stop(); return; }
        if (Math.random() < cfg.lifeLossChance) {
          submit({ type: 'life_lost' });
        }
      };
      brickTimer = setInterval(tickBrick, cfg.brickEveryMs);
      lifeTimer = setInterval(tickLife, cfg.lifeCheckMs);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (brickTimer) clearInterval(brickTimer);
      if (lifeTimer) clearInterval(lifeTimer);
      brickTimer = null;
      lifeTimer = null;
    },
  };
}

module.exports = { createBrickBreakerAI, DIFFICULTY };
