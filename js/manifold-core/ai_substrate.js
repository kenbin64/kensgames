/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 */

class AISubstrate extends SubstrateBase {
  name() { return 'ai'; }

  getSchema() {
    return { bots: 'array', difficulty: 'string', behavior: 'object', decision: 'object' };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate) || {};
    return {
      bots: raw.bots || [],
      difficulty: raw.difficulty || 'medium',
      behavior: raw.behavior || this._defaultBehavior(),
      decision: raw.decision || {}
    };
  }

  validate(data) {
    return Array.isArray(data.bots) && data.difficulty && data.behavior;
  }

  _defaultBehavior() {
    return {
      accuracy: 0.7,
      reaction: 300,
      aggression: 0.5,
      predictive: 0.6,
      speedBoost: 0.12
    };
  }

  createBot(botId, difficulty = 'medium') {
    const diffSettings = {
      easy: { accuracy: 0.5, reaction: 500, aggression: 0.3, predictive: 0.2, speedBoost: 0.08 },
      medium: { accuracy: 0.7, reaction: 300, aggression: 0.5, predictive: 0.6, speedBoost: 0.12 },
      hard: { accuracy: 0.85, reaction: 150, aggression: 0.8, predictive: 0.85, speedBoost: 0.15 },
      expert: { accuracy: 0.95, reaction: 80, aggression: 0.95, predictive: 0.95, speedBoost: 0.18 }
    };

    const settings = diffSettings[difficulty] || diffSettings.medium;
    return {
      id: botId,
      isBot: true,
      difficulty,
      ...settings,
      state: { position: { x: 0, y: 0, z: 0 }, target: null, lastDecision: 0 }
    };
  }

  makeDecision(bot, gameState, enemies) {
    const target = this._selectTarget(enemies, bot);
    const action = this._calculateAction(bot, target, gameState);

    return {
      botId: bot.id,
      action,
      target,
      confidence: Math.random() * bot.accuracy,
      timestamp: Date.now()
    };
  }

  _selectTarget(enemies, bot) {
    if (!enemies || enemies.length === 0) return null;
    const botPos = bot.state?.position || { x: 0, y: 0, z: 0 };
    return enemies.reduce((closest, enemy) => {
      const dist = Math.hypot(
        (enemy.position?.x || 0) - botPos.x,
        (enemy.position?.y || 0) - botPos.y
      );
      const prevDist = closest.distance;
      return dist < prevDist ? { enemy, distance: dist } : closest;
    }, { enemy: enemies[0], distance: Infinity }).enemy;
  }

  _calculateAction(bot, target, gameState) {
    if (!target) return 'idle';
    return Math.random() < bot.aggression ? 'attack' : 'evade';
  }

  updateBotState(bot, newPosition, newTarget) {
    return {
      ...bot,
      state: {
        position: newPosition,
        target: newTarget,
        lastDecision: Date.now()
      }
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AISubstrate;
}
if (typeof window !== 'undefined') {
  window.AISubstrate = AISubstrate;
}
