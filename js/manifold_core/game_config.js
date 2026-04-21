/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GAME CONFIGURATION & COORDINATE MAPPING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Translates game parameters into manifold coordinates.
 * Also loads game-specific data (substrates needed, dimension ranges, etc.)
 *
 * Example:
 *   const config = GameConfig.load('brickbreaker3d-multiplayer');
 *   const coordinate = config.createCoordinate({
 *     playerCount: 3,
 *     difficulty: 'hard',
 *     skillLevel: 0.75
 *   });
 *   // Returns: [3, 25, 75, 0.75, 'hard']
 */

const GameConfig = (() => {
  const _gameConfigs = new Map();
  const _dimensionDefinitions = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME DEFINITIONS (Pre-registered games)
  // ═══════════════════════════════════════════════════════════════════════════

  const DEFAULT_GAMES = {
    'brickbreaker3d-solo': {
      title: 'BrickBreaker 3D - Single Player',
      description: 'Classic brick breaker arcade action',
      baseDimensions: ['playerCount', 'playtime'],
      additionalDimensions: ['skillLevel'],
      substrates: ['graphics', 'physics', 'audio', 'gamelogic', 'ui', 'persistence'],
      defaultCoordinate: [1, 20, 20, 0.3],
      features: {
        hasMultiplayer: false,
        hasAI: true,
        requiresLogin: false
      }
    },

    'brickbreaker3d-multiplayer': {
      title: 'BrickBreaker 3D - Multiplayer',
      description: 'Multi-player brick breaker competition',
      baseDimensions: ['playerCount', 'playtime'],
      additionalDimensions: ['difficulty', 'skillLevel'],
      substrates: ['graphics', 'physics', 'audio', 'gamelogic', 'ui', 'persistence', 'multiplayer'],
      defaultCoordinate: [3, 25, 75, 0, 0.5],
      features: {
        hasMultiplayer: true,
        hasAI: true,
        requiresLogin: true,
        maxPlayers: 4
      }
    },

    'space-combat-solo': {
      title: 'Space Combat - Solo Campaign',
      description: 'First-person space combat defending starbase (single player)',
      baseDimensions: ['playerCount', 'playtime'],
      additionalDimensions: ['skillLevel'],
      substrates: ['graphics', 'physics', 'audio', 'gamelogic', 'controlmapping', 'ui', 'ai', 'persistence'],
      defaultCoordinate: [1, 30, 30, 0.5],
      features: {
        hasMultiplayer: false,
        hasAI: true,
        requiresLogin: false,
        gameType: 'firstperson'
      }
    },

    'space-combat-multiplayer': {
      title: 'Space Combat - Starbase Defense',
      description: 'First-person space combat co-op mission (1-4 players)',
      baseDimensions: ['playerCount', 'playtime'],
      additionalDimensions: ['skillLevel'],
      substrates: ['graphics', 'physics', 'audio', 'gamelogic', 'controlmapping', 'ui', 'multiplayer', 'ai', 'persistence'],
      defaultCoordinate: [4, 30, 120, 0.6],
      features: {
        hasMultiplayer: true,
        hasAI: true,
        requiresLogin: true,
        minPlayers: 1,
        maxPlayers: 4,
        gameType: 'firstperson'
      }
    },

    'space-combat': {
      title: 'Space Combat - Viper Wars',
      description: 'First-person space combat with dynamic flight simulator controls',
      baseDimensions: ['playerCount', 'matchDuration'],
      additionalDimensions: ['difficulty', 'skillLevel', 'aiAggression'],
      substrates: ['graphics', 'physics', 'audio', 'gamelogic', 'ui', 'persistence', 'multiplayer', 'ai', 'controlmapping'],
      defaultCoordinate: [4, 30, 120, 1, 0.6, 0.7],
      features: {
        hasMultiplayer: true,
        hasAI: true,
        requiresLogin: true,
        minPlayers: 1,
        maxPlayers: 6,
        gameType: 'firstperson'
      }
    },

    'fasttrack-solo': {
      title: 'FastTrack v2.1.0 - Solo',
      description: 'Strategic board game vs AI',
      baseDimensions: ['playerCount', 'playtime'],
      additionalDimensions: ['skillLevel'],
      substrates: ['gamelogic', 'ui', 'persistence', 'ai'],
      defaultCoordinate: [1, 45, 45, 0.5],
      features: {
        hasMultiplayer: false,
        hasAI: true,
        requiresLogin: false,
        maxPlayers: 2
      }
    },

    'fasttrack-multiplayer': {
      title: 'FastTrack v2.1.0',
      description: 'Strategic board game with 1-4 players',
      baseDimensions: ['playerCount', 'playtime'],
      additionalDimensions: ['skillLevel'],
      substrates: ['gamelogic', 'ui', 'persistence', 'multiplayer', 'ai'],
      defaultCoordinate: [2, 45, 90, 0.5],
      features: {
        hasMultiplayer: true,
        hasAI: true,
        requiresLogin: false,
        maxPlayers: 4
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DIMENSION DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const DIMENSIONS = {
    playerCount: {
      name: 'playerCount',
      type: 'number',
      min: 1,
      max: 6,
      description: 'Number of players in game'
    },
    playtime: {
      name: 'playtime',
      type: 'number',
      min: 5,
      max: 180,
      unit: 'minutes',
      description: 'Expected play duration'
    },
    matchDuration: {
      name: 'matchDuration',
      type: 'number',
      min: 5,
      max: 180,
      unit: 'minutes',
      description: 'Match duration target'
    },
    difficulty: {
      name: 'difficulty',
      type: 'enum',
      values: ['easy', 'medium', 'hard', 'expert'],
      description: 'Difficulty level'
    },
    skillLevel: {
      name: 'skillLevel',
      type: 'number',
      min: 0,
      max: 1,
      description: 'Player skill (0=beginner, 1=expert)'
    },
    aiAggression: {
      name: 'aiAggression',
      type: 'number',
      min: 0,
      max: 1,
      description: 'AI aggression factor'
    }
  };

  const api = {
    /**
     * Register a new game configuration
     * @param {string} gameId
     * @param {Object} config
     */
    registerGame(gameId, config) {
      _gameConfigs.set(gameId, {
        ...config,
        gameId,
        registered: new Date()
      });
    },

    /**
     * Load game configuration
     * @param {string} gameId
     * @returns {Object}
     */
    load(gameId) {
      if (!_gameConfigs.has(gameId)) {
        throw new Error(`Game '${gameId}' not found in config`);
      }

      const config = _gameConfigs.get(gameId);
      return {
        ...config,

        /**
         * Create a manifold coordinate from game parameters
         * @param {Object} params - Game parameters
         * @returns {Array}
         */
        createCoordinate(params) {
          const coord = [];

          // Handle base dimensions (x, y for manifold)
          const baseDims = config.baseDimensions || [];
          const baseDimValues = [];

          for (const dimName of baseDims) {
            const dim = DIMENSIONS[dimName];
            if (!dim) throw new Error(`Unknown dimension: ${dimName}`);

            const value = params[dimName];

            if (dim.type === 'number') {
              const normalized = Math.max(dim.min, Math.min(dim.max, value || 0));
              coord.push(normalized);
              baseDimValues.push(normalized);
            } else {
              coord.push(value);
              baseDimValues.push(value);
            }
          }

          // Calculate Z from base dimensions (z = x * y)
          if (baseDimValues.length === 2) {
            coord.push(baseDimValues[0] * baseDimValues[1]);
          }

          // Handle additional dimensions
          const additionalDims = config.additionalDimensions || [];
          for (const dimName of additionalDims) {
            const dim = DIMENSIONS[dimName];
            if (!dim) throw new Error(`Unknown dimension: ${dimName}`);

            const value = params[dimName];

            if (dim.type === 'enum') {
              const index = dim.values.indexOf(value);
              coord.push(index >= 0 ? index : 0);
            } else if (dim.type === 'number') {
              coord.push(Math.max(dim.min, Math.min(dim.max, value || 0)));
            } else {
              coord.push(value);
            }
          }

          return coord;
        },

        /**
         * Create coordinate from defaults
         * @returns {Array}
         */
        getDefaultCoordinate() {
          return config.defaultCoordinate;
        },

        /**
         * Get all substrates this game uses
         * @returns {Array}
         */
        getSubstrates() {
          return config.substrates;
        },

        /**
         * Check if this game supports a feature
         * @param {string} feature
         * @returns {boolean}
         */
        hasFeature(feature) {
          return config.features[feature] === true;
        },

        /**
         * Get dimension definitions for this game
         * @returns {Array}
         */
        getDimensions() {
          const baseDims = (config.baseDimensions || []).map(d => DIMENSIONS[d]);
          const additionalDims = (config.additionalDimensions || []).map(d => DIMENSIONS[d]);
          return [...baseDims, ...additionalDims];
        }
      };
    },

    /**
     * List all registered games
     * @returns {Array}
     */
    listGames() {
      return Array.from(_gameConfigs.keys());
    },

    /**
     * Get dimension definition
     * @param {string} dimensionName
     * @returns {Object}
     */
    getDimension(dimensionName) {
      return DIMENSIONS[dimensionName];
    },

    /**
     * Get all dimensions
     * @returns {Object}
     */
    getAllDimensions() {
      return { ...DIMENSIONS };
    },

    /**
     * Register a new dimension (for extensibility)
     * @param {string} name
     * @param {Object} definition
     */
    registerDimension(name, definition) {
      DIMENSIONS[name] = {
        name,
        ...definition
      };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE WITH DEFAULT GAMES
  // ═══════════════════════════════════════════════════════════════════════════

  for (const [gameId, config] of Object.entries(DEFAULT_GAMES)) {
    api.registerGame(gameId, config);
  }

  return api;
})();

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameConfig;
}

// Expose globally in browser
if (typeof window !== 'undefined') {
  window.GameConfig = GameConfig;
}
