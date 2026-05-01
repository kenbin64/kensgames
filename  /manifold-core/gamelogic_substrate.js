/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GAMELOGIC SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 */

class GameLogicSubstrate extends SubstrateBase {
  name() { return 'gamelogic'; }

  getSchema() {
    return {
      rules: 'object', scoring: 'object', gameState: 'object',
      winConditions: 'array', lossConditions: 'array', events: 'array'
    };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate) || {};
    return {
      rules: raw.rules || {}, scoring: raw.scoring || {},
      gameState: raw.gameState || { isActive: false, isPaused: false, isGameOver: false },
      winConditions: raw.winConditions || [],
      lossConditions: raw.lossConditions || [],
      events: raw.events || []
    };
  }

  validate(data) {
    return data.rules && data.gameState && Array.isArray(data.events);
  }

  checkWinCondition(gameState) {
    return gameState.score >= gameState.targetScore;
  }

  checkLossCondition(gameState) {
    return gameState.lives <= 0;
  }

  applyScore(currentScore, points) {
    return currentScore + points;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameLogicSubstrate;
}
if (typeof window !== 'undefined') {
  window.GameLogicSubstrate = GameLogicSubstrate;
}
