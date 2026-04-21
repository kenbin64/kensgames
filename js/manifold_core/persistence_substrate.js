/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PERSISTENCE SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 */

class PersistenceSubstrate extends SubstrateBase {
  name() { return 'persistence'; }

  getSchema() {
    return { user: 'object', profile: 'object', stats: 'object', gameState: 'object', leaderboard: 'array' };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate) || {};
    return {
      user: raw.user || { id: null, username: null, avatar: null },
      profile: raw.profile || { avatar: null, displayName: null, createdAt: null },
      stats: raw.stats || { gamesPlayed: 0, gamesWon: 0, totalScore: 0, bestScore: 0 },
      gameState: raw.gameState || {},
      leaderboard: raw.leaderboard || []
    };
  }

  validate(data) {
    return data.user && data.profile && data.stats;
  }

  createUser(username, email, avatar) {
    return {
      id: `user-${Date.now()}`,
      username, email, avatar,
      createdAt: new Date().toISOString(),
      stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, bestScore: 0 }
    };
  }

  updateStats(userId, gameResult) {
    return {
      userId,
      gamesPlayed: gameResult.gamesPlayed || 1,
      gamesWon: gameResult.won ? 1 : 0,
      totalScore: gameResult.score || 0,
      bestScore: gameResult.score || 0,
      lastUpdated: Date.now()
    };
  }

  saveGameState(userId, gameState) {
    return {
      userId,
      gameState,
      savedAt: Date.now(),
      version: 1
    };
  }

  loadGameState(userId) {
    return { userId, gameState: {}, loadedAt: Date.now() };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PersistenceSubstrate;
}
if (typeof window !== 'undefined') {
  window.PersistenceSubstrate = PersistenceSubstrate;
}
