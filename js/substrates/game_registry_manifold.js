/**
 * Game Registry Manifold
 * ═══════════════════════════════════════════════════════════════════════════
 * Central registry for all games on the portal
 * Maps games to dimensional coordinates for discovery
 */

const GameRegistryManifold = (() => {
  // Registry of all games (local copy, synced from backend)
  const _games = new Map();
  const _listeners = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // Launch Game Catalog (4 initial games)
  // ═══════════════════════════════════════════════════════════════════════════

  const LAUNCH_GAMES = [
    {
      id: 'fasttrack-v2.1.0',
      title: 'FastTrack',
      subtitle: 'v2.1.0 - Official',
      description: 'A strategic billiards-inspired board game for 1-4 players. Move your pegs around the track, capture opponents, and race to victory.',
      genre: ['board', 'strategy', 'multiplayer'],
      author: 'Ken\'s Games Team',
      version: '2.1.0',
      entryPoint: '/fasttrack/lobby.html',
      icon: '/fasttrack/assets/images/ftLogo.png',
      thumbnail: '/fasttrack/assets/images/billiard_theme.png',

      // Dimensional positioning
      manifold: {
        x: 2,              // playerCount: 1-4 = high multiplayer factor
        y: 45,             // playtime: ~45 minutes
        z: 90              // z = x * y (discovery score)
      },

      // Game modes
      modes: {
        singlePlayer: {
          enabled: true,
          aiOptions: [0, 1, 2, 3],
          description: 'Play against AI opponents'
        },
        multiplayer: {
          enabled: true,
          minPlayers: 2,
          maxPlayers: 4,
          requiresLogin: true,
          description: 'Play with friends online'
        }
      },

      // Metadata
      requiresLogin: false,  // Single-player doesn't require login
      isOfficial: true,
      releaseDate: '2026-02-26',
      rating: 4.8,
      plays: 12450,
      reviews: 342
    },

    {
      id: 'fasttrack-5card-draw',
      title: 'FastTrack 5 Card Draw',
      subtitle: 'Fast-Paced Variant',
      description: 'Faster version of FastTrack with 5-card draws and simplified rules. Perfect for quick games (~15 minutes).',
      genre: ['board', 'card', 'multiplayer'],
      author: 'Ken\'s Games Team',
      version: '1.0.0',
      entryPoint: '/fasttrack/lobby.html?mode=5card',
      icon: '/fasttrack/assets/images/ftLogo.png',
      thumbnail: '/fasttrack/assets/images/cosmic_theme.png',

      manifold: {
        x: 2,              // playerCount
        y: 15,             // playtime: ~15 minutes (faster)
        z: 30              // z = x * y
      },

      modes: {
        singlePlayer: { enabled: true, aiOptions: [0, 1, 2, 3] },
        multiplayer: { enabled: true, minPlayers: 2, maxPlayers: 4, requiresLogin: true }
      },

      requiresLogin: false,
      isOfficial: true,
      releaseDate: '2026-04-10',
      rating: 4.9,
      plays: 890,
      reviews: 45
    },

    {
      id: 'brickbreaker3d-solo',
      title: 'BrickBreaker 3D',
      subtitle: 'Single Player',
      description: 'Classic brick-breaker arcade action. Break all bricks with your paddle and ball. 5 starting balls per game.',
      genre: ['arcade', 'action'],
      author: 'Ken\'s Games Team (Zenxy Edition)',
      version: '1.0.0',
      entryPoint: '/brickbreaker3d/play.html?mode=solo',
      icon: '/assets/masterImageFile/logo_thumbnail.svg',
      thumbnail: '/brickbreaker3d/assets/images/arcade.png',

      manifold: {
        x: 1,              // playerCount: 1 only
        y: 20,             // playtime: ~20 minutes avg
        z: 20              // z = x * y
      },

      modes: {
        singlePlayer: {
          enabled: true,
          aiOptions: [],
          description: 'Solo arcade gameplay'
        },
        multiplayer: { enabled: false }
      },

      requiresLogin: false,
      isOfficial: true,
      releaseDate: '2026-04-10',
      rating: 4.7,
      plays: 450,
      reviews: 32
    },

    {
      id: 'brickbreaker3d-multi',
      title: 'BrickBreaker 3D',
      subtitle: 'Multiplayer',
      description: '1-4 player cooperative/competitive brick-breaker. All paddles interact with all balls. Any paddle hitting any ball scores points!',
      genre: ['arcade', 'action', 'multiplayer'],
      author: 'Ken\'s Games Team (Zenxy Edition)',
      version: '1.0.0',
      entryPoint: '/brickbreaker3d/play.html?mode=multi',
      icon: '/assets/masterImageFile/logo_thumbnail.svg',
      thumbnail: '/brickbreaker3d/assets/images/multiplayer.png',

      manifold: {
        x: 3,              // playerCount: 1-4 (high multiplayer factor)
        y: 25,             // playtime: ~25 minutes
        z: 75              // z = x * y
      },

      modes: {
        singlePlayer: { enabled: false },
        multiplayer: {
          enabled: true,
          minPlayers: 1,
          maxPlayers: 4,
          requiresLogin: true,
          description: 'Competitive multiplayer with scaling arena'
        }
      },

      requiresLogin: true,  // Multiplayer only
      isOfficial: true,
      releaseDate: '2026-04-10',
      rating: 4.6,
      plays: 380,
      reviews: 28
    }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // Registry Operations
  // ═══════════════════════════════════════════════════════════════════════════

  const initializeGames = () => {
    LAUNCH_GAMES.forEach(game => {
      _games.set(game.id, {
        ...game,
        manifestation: {
          // Dimensional representation
          coordinate: [game.manifold.x, game.manifold.y, game.manifold.z],
          layer: Math.floor(Math.log2(game.manifold.z)) || 1,
          position: calculateManifoldPosition(game.manifold.x, game.manifold.y)
        }
      });
    });
    emit('initialized', { count: _games.size });
  };

  const getGame = (gameId) => _games.get(gameId);

  const getAllGames = () => Array.from(_games.values());

  const getGamesByGenre = (genre) => {
    return Array.from(_games.values()).filter(game =>
      game.genre.includes(genre)
    );
  };

  const getGamesByType = (type) => {
    // 'singlePlayer' or 'multiplayer'
    return Array.from(_games.values()).filter(game => {
      if (type === 'singlePlayer') return game.modes.singlePlayer?.enabled;
      if (type === 'multiplayer') return game.modes.multiplayer?.enabled;
      return true;
    });
  };

  const getAccessibleGames = (isLoggedIn) => {
    // Filter games based on login status
    return Array.from(_games.values()).filter(game => {
      if (isLoggedIn) return true;  // Can access all if logged in
      return !game.requiresLogin;   // Otherwise only non-login games
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Manifold Mathematics
  // ═══════════════════════════════════════════════════════════════════════════

  const calculateManifoldPosition = (x, y) => {
    // z = x * y is the primary surface
    const z = x * y;

    // 3D position for visualization
    return {
      x: Math.cos((x * Math.PI) / 10) * 100,
      y: z / 10,
      z: Math.sin((y * Math.PI) / 10) * 100
    };
  };

  const calculateDistance = (game1Id, game2Id) => {
    const g1 = getGame(game1Id);
    const g2 = getGame(game2Id);

    if (!g1 || !g2) return Infinity;

    const pos1 = g1.manifestation.position;
    const pos2 = g2.manifestation.position;

    // Euclidean distance in 3D manifold space
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  const getRecommendations = (playedGameIds, limit = 5) => {
    // Find games nearest to the user's play history
    const unplayed = Array.from(_games.values()).filter(
      game => !playedGameIds.includes(game.id)
    );

    // Calculate average distance to played games
    const recommendations = unplayed.map(game => {
      const distances = playedGameIds
        .map(playedId => calculateDistance(game.id, playedId))
        .filter(d => d !== Infinity);

      const avgDistance = distances.length > 0
        ? distances.reduce((a, b) => a + b) / distances.length
        : 1000;

      return { game, similarity: 1 / (1 + avgDistance) };
    });

    // Sort by similarity and return top N
    return recommendations
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(r => r.game);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Leaderboard Integration
  // ═══════════════════════════════════════════════════════════════════════════

  const registerLeaderBoard = (gameId) => {
    // Initialize leaderboard tracking for game
    const game = getGame(gameId);
    if (!game) return false;

    game.leaderboard = {
      topScores: [],
      userBest: {},
      rankings: {}
    };

    emit('leaderboardRegistered', { gameId });
    return true;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Event System
  // ═══════════════════════════════════════════════════════════════════════════

  const on = (event, callback) => {
    if (!_listeners.has(event)) {
      _listeners.set(event, []);
    }
    const id = Math.random().toString(36);
    _listeners.get(event).push({ id, callback });
    return id;
  };

  const off = (id) => {
    for (const [event, handlers] of _listeners) {
      _listeners.set(event, handlers.filter(h => h.id !== id));
    }
  };

  const emit = (event, data) => {
    if (_listeners.has(event)) {
      _listeners.get(event).forEach(({ callback }) => callback(data));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Initialization
    initializeGames,
    registerLeaderBoard,

    // Lookups
    getGame,
    getAllGames,
    getGamesByGenre,
    getGamesByType,
    getAccessibleGames,

    // Manifold Math
    calculateDistance,
    getRecommendations,

    // Events
    on,
    off,
    emit
  };
})();

// Initialize on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GameRegistryManifold.initializeGames());
  } else {
    GameRegistryManifold.initializeGames();
  }
}

// Browser + Node dual export
if (typeof window !== 'undefined') window.GameRegistryManifold = GameRegistryManifold;
if (typeof module !== 'undefined') module.exports = GameRegistryManifold;
