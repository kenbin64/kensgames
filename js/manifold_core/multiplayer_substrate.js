/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTIPLAYER SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 */

class MultiplayerSubstrate extends SubstrateBase {
  name() { return 'multiplayer'; }

  getSchema() {
    return { players: 'array', matchState: 'object', spectators: 'array', synchronization: 'object' };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate) || {};
    return {
      players: raw.players || [],
      matchState: raw.matchState || { isActive: false, startTime: 0, endTime: 0 },
      spectators: raw.spectators || [],
      synchronization: raw.synchronization || { tickRate: 60, latency: 0 }
    };
  }

  validate(data) {
    return Array.isArray(data.players) && data.matchState && data.synchronization;
  }

  addPlayer(playerId, playerData) {
    return { playerId, ...playerData, joinedAt: Date.now(), isActive: true };
  }

  removePlayer(playerId) {
    return { playerId, isActive: false, leftAt: Date.now() };
  }

  syncState(gameState) {
    return { ...gameState, synced: true, syncTime: Date.now() };
  }

  handlePlayerDisconnect(playerId) {
    return { playerId, disconnected: true, timestamp: Date.now() };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MultiplayerSubstrate;
}
if (typeof window !== 'undefined') {
  window.MultiplayerSubstrate = MultiplayerSubstrate;
}
