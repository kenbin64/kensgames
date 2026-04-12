/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK LOBBY & MATCHMAKING SUBSTRATE
 * ButterflyFX Manifold Pattern - P2P Lobby, Game Matching
 * ============================================================
 */

// ============================================================
// LOBBY SUBSTRATE - Peer-to-Peer Game Lobby
// ============================================================

const LobbySubstrate = {
    version: '2.0.0',
    name: 'FastTrack Lobby System',
    
    // Players in lobby
    players: new Map(), // playerId -> LobbyPlayer
    
    // Active games waiting for players
    pendingGames: new Map(), // gameId -> PendingGame
    
    // Active games in progress
    activeGames: new Map(),
    
    // Lobby callbacks
    onPlayerJoined: null,
    onPlayerLeft: null,
    onGameCreated: null,
    onGameStarted: null,
    onLobbyUpdated: null,
    
    // ============================================================
    // GAME MODE RULES
    // Solo: 3-4 players (1 human + 2-3 AI)
    // Random: 3-4 players (prefer 4), all human
    // Private: 2-6 players, invite-only
    // Guild: 2-6 players, guild members only
    // ============================================================
    GAME_MODES: {
        SOLO: { min: 3, max: 4, aiAllowed: true, aiRequired: true },
        RANDOM: { min: 3, max: 4, preferred: 4, aiAllowed: false },
        PRIVATE: { min: 2, max: 6, aiAllowed: true },
        GUILD: { min: 2, max: 6, aiAllowed: true }
    },
    
    // Timeout for finding 4th player before starting with 3
    MIN_PLAYER_TIMEOUT: 30000, // 30 seconds
    PREFERRED_PLAYERS: 4,
    MIN_PLAYERS: 3,
    MAX_PLAYERS: 6,
    
    // Join lobby
    join: function(profile) {
        // Check if user is blocked
        if (typeof AdminBlockSubstrate !== 'undefined') {
            const block = AdminBlockSubstrate.getUserBlock(profile.id);
            if (block) {
                return { success: false, error: 'Account suspended', block };
            }
        }
        
        const lobbyPlayer = {
            id: profile.id,
            displayName: profile.displayName,
            avatarId: profile.avatarId,
            medallion: window.MedallionSubstrate ? 
                MedallionSubstrate.getRankFromPoints(profile.stats?.totalPoints || 0) : 
                { id: 'bronze', tier: 1 },
            guildId: profile.guildId,
            guildName: profile.guildName,
            joinedAt: Date.now(),
            
            // Matchmaking preferences
            preferences: {
                preferredMedallionLevel: null, // null = any, or 'similar'
                preferAI: false,
                aiDifficulty: 'veteran'
            },
            
            // Status
            status: 'browsing', // browsing, searching, in_game
            currentGameId: null,
            lookingForGame: false
        };
        
        this.players.set(profile.id, lobbyPlayer);
        
        // Update online status
        if (typeof OnlineStatusSubstrate !== 'undefined') {
            OnlineStatusSubstrate.updateStatus(OnlineStatusSubstrate.STATUS.IN_LOBBY);
        }
        
        console.log(`Player joined lobby: ${profile.displayName}`);
        
        if (this.onPlayerJoined) {
            this.onPlayerJoined(lobbyPlayer);
        }
        if (this.onLobbyUpdated) {
            this.onLobbyUpdated();
        }
        
        return { success: true, player: lobbyPlayer };
    },
    
    // Leave lobby
    leave: function(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;
        
        this.players.delete(playerId);
        
        // Remove from any pending games
        this.pendingGames.forEach((game, gameId) => {
            if (game.players.some(p => p.id === playerId)) {
                game.players = game.players.filter(p => p.id !== playerId);
                if (game.players.length === 0) {
                    this.pendingGames.delete(gameId);
                }
            }
        });
        
        if (this.onPlayerLeft) {
            this.onPlayerLeft(player);
        }
    },
    
    // Create a new game (host)
    createGame: function(hostId, mode = 'random', options = {}) {
        const host = this.players.get(hostId);
        if (!host) return { success: false, error: 'Player not in lobby' };
        
        // Get mode rules
        const modeRules = this.GAME_MODES[mode.toUpperCase()] || this.GAME_MODES.RANDOM;
        
        // Validate 6-player limit
        const maxPlayers = options.maxPlayers || modeRules.max;
        if (maxPlayers > 4 && mode !== 'private' && mode !== 'guild') {
            return { success: false, error: '6 players only for private or guild games' };
        }
        
        // Guild mode requires guild membership
        if (mode === 'guild' && !host.guildId) {
            return { success: false, error: 'Must be in a guild for guild games' };
        }
        
        const game = {
            id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            hostId: hostId,
            mode: mode,
            
            // Players
            players: [host],
            maxPlayers: maxPlayers,
            minPlayers: options.minPlayers || modeRules.min,
            preferredPlayers: modeRules.preferred || null,
            
            // Settings
            settings: {
                private: mode === 'private',
                medallionFilter: options.medallionFilter || null, // null = any
                guildOnly: mode === 'guild',
                guildId: mode === 'guild' ? host.guildId : null,
                aiPlayers: [],
                aiDifficulty: options.aiDifficulty || 'veteran',
                aiAllowed: modeRules.aiAllowed,
                invitedPlayers: options.invitedPlayers || []
            },
            
            // Status
            status: 'waiting', // waiting, starting, in_progress
            createdAt: Date.now(),
            startTimeoutId: null
        };
        
        this.pendingGames.set(game.id, game);
        host.status = 'searching';
        host.currentGameId = game.id;
        host.lookingForGame = true;
        
        // Update online status
        if (typeof OnlineStatusSubstrate !== 'undefined') {
            OnlineStatusSubstrate.setLookingForGame(true);
        }
        
        if (this.onGameCreated) {
            this.onGameCreated(game);
        }
        if (this.onLobbyUpdated) {
            this.onLobbyUpdated();
        }
        
        return { success: true, game: game };
    },
    
    // Join an existing game
    joinGame: function(playerId, gameId) {
        const player = this.players.get(playerId);
        if (!player) return { success: false, error: 'Player not in lobby' };
        
        const game = this.pendingGames.get(gameId);
        if (!game) return { success: false, error: 'Game not found' };
        if (game.status !== 'waiting') return { success: false, error: 'Game already started' };
        if (game.players.length >= game.maxPlayers) return { success: false, error: 'Game is full' };
        
        // Check if already in a game
        if (player.currentGameId) {
            return { success: false, error: 'Already in a game' };
        }
        
        // Check blocking (member blocks)
        if (typeof MemberBlockSubstrate !== 'undefined') {
            const host = this.players.get(game.hostId);
            if (MemberBlockSubstrate.isBlocked(game.hostId, playerId) ||
                MemberBlockSubstrate.isBlocked(playerId, game.hostId)) {
                return { success: false, error: 'Cannot join this game' };
            }
        }
        
        // Check invite-only
        if (game.settings.private && !game.settings.invitedPlayers.includes(playerId)) {
            return { success: false, error: 'Invite required' };
        }
        
        // Check medallion filter
        if (game.settings.medallionFilter === 'similar' && typeof MedallionSubstrate !== 'undefined') {
            const hostMedallion = game.players[0].medallion;
            if (!MedallionSubstrate.areSimilar(player.medallion, hostMedallion)) {
                return { success: false, error: 'Medallion level too different' };
            }
        }
        
        // Check guild filter
        if (game.settings.guildOnly && player.guildId !== game.settings.guildId) {
            return { success: false, error: 'Guild-only game' };
        }
        
        game.players.push(player);
        player.status = 'searching';
        player.currentGameId = gameId;
        
        // Check if we should start
        this.checkGameStart(gameId);
        
        if (this.onLobbyUpdated) {
            this.onLobbyUpdated();
        }
        
        return { success: true, game: game };
    },
    
    // Quick match - find or create a game
    quickMatch: function(playerId) {
        const player = this.players.get(playerId);
        if (!player) return { success: false, reason: 'Player not in lobby' };
        
        // Look for suitable existing games
        for (const [gameId, game] of this.pendingGames) {
            if (game.status !== 'waiting') continue;
            if (game.players.length >= game.maxPlayers) continue;
            if (game.settings.private) continue;
            
            // Check medallion preference
            if (player.preferences.preferredMedallionLevel === 'similar') {
                const hostMedallion = game.players[0].medallion;
                if (!MedallionSubstrate.areSimilar(player.medallion, hostMedallion)) {
                    continue;
                }
            }
            
            // Check guild filter
            if (game.settings.guildOnly && player.guildId !== game.settings.guildId) {
                continue;
            }
            
            // Join this game
            return this.joinGame(playerId, gameId);
        }
        
        // No suitable game found, create one
        return this.createGame(playerId, {
            medallionFilter: player.preferences.preferredMedallionLevel
        });
    },
    
    // Check if game should start
    checkGameStart: function(gameId) {
        const game = this.pendingGames.get(gameId);
        if (!game || game.status !== 'waiting') return;
        
        const humanCount = game.players.length;
        const aiCount = game.settings.aiPlayers.length;
        const totalCount = humanCount + aiCount;
        
        // If we have max players, start immediately
        if (totalCount >= game.maxPlayers) {
            this.startGame(gameId);
            return;
        }
        
        // If we have min players, start timeout for more
        if (humanCount >= game.minPlayers && !game.startTimeoutId) {
            console.log(`Game ${gameId} has ${humanCount} players, waiting ${this.MIN_PLAYER_TIMEOUT/1000}s for more...`);
            
            game.startTimeoutId = setTimeout(() => {
                const currentGame = this.pendingGames.get(gameId);
                if (currentGame && currentGame.status === 'waiting') {
                    console.log(`Timeout reached, starting game with ${currentGame.players.length} players`);
                    this.startGame(gameId);
                }
            }, this.MIN_PLAYER_TIMEOUT);
        }
    },
    
    // Start a game
    startGame: function(gameId) {
        const game = this.pendingGames.get(gameId);
        if (!game) return { success: false, reason: 'Game not found' };
        
        // Clear any timeout
        if (game.startTimeoutId) {
            clearTimeout(game.startTimeoutId);
        }
        
        game.status = 'in_progress';
        game.startedAt = Date.now();
        
        // Move from pending to active
        this.pendingGames.delete(gameId);
        this.activeGames.set(gameId, game);
        
        // Update player statuses
        game.players.forEach(p => {
            p.status = 'in_game';
        });
        
        console.log(`Game ${gameId} started with ${game.players.length} players`);
        
        if (this.onGameStarted) {
            this.onGameStarted(game);
        }
        
        return { success: true, game: game };
    },
    
    // Add AI player to game
    addAI: function(gameId, hostId, difficulty = 'veteran') {
        const game = this.pendingGames.get(gameId);
        if (!game) return { success: false, reason: 'Game not found' };
        if (game.hostId !== hostId) return { success: false, reason: 'Only host can add AI' };
        
        const totalPlayers = game.players.length + game.settings.aiPlayers.length;
        if (totalPlayers >= game.maxPlayers) {
            return { success: false, reason: 'Game is full' };
        }
        
        const aiPlayer = AIPlayerSubstrate.create(difficulty);
        game.settings.aiPlayers.push(aiPlayer);
        
        this.checkGameStart(gameId);
        
        return { success: true, aiPlayer: aiPlayer };
    },
    
    // Get available games for a player
    getAvailableGames: function(playerId) {
        const player = this.players.get(playerId);
        const results = [];
        
        this.pendingGames.forEach((game, gameId) => {
            if (game.status !== 'waiting') return;
            if (game.settings.private) return;
            
            // Check filters
            if (game.settings.guildOnly && (!player || player.guildId !== game.settings.guildId)) {
                return;
            }
            
            results.push({
                id: game.id,
                host: game.players[0].displayName,
                playerCount: game.players.length,
                maxPlayers: game.maxPlayers,
                medallionFilter: game.settings.medallionFilter,
                guildOnly: game.settings.guildOnly
            });
        });
        
        return results;
    },
    
    // Get lobby stats
    getStats: function() {
        return {
            playersOnline: this.players.size,
            gamesWaiting: this.pendingGames.size,
            gamesInProgress: this.activeGames.size
        };
    },
    
    // Get online players visible to a specific user
    getVisiblePlayers: function(viewerId) {
        const viewer = this.players.get(viewerId);
        const results = [];
        
        this.players.forEach((player, playerId) => {
            if (playerId === viewerId) return;
            
            // Check if can see online status
            let canSee = false;
            let visibilityLevel = 'none';
            
            if (typeof OnlineStatusSubstrate !== 'undefined') {
                canSee = OnlineStatusSubstrate.canSeeOnlineStatus(viewerId, playerId);
                
                // Guild members can see full status
                if (viewer && player.guildId && viewer.guildId === player.guildId) {
                    visibilityLevel = 'full';
                }
                // Others can only see "looking for game"
                else if (player.lookingForGame) {
                    visibilityLevel = 'looking';
                    canSee = true;
                }
            }
            
            if (canSee) {
                results.push({
                    id: playerId,
                    displayName: player.displayName,
                    avatarId: player.avatarId,
                    medallion: player.medallion,
                    status: visibilityLevel === 'full' ? player.status : (player.lookingForGame ? 'looking' : 'online'),
                    guildName: player.guildName,
                    lookingForGame: player.lookingForGame,
                    visibilityLevel: visibilityLevel
                });
            }
        });
        
        return results;
    },
    
    // Get players looking for game (public visibility)
    getLookingForGamePlayers: function() {
        const results = [];
        
        this.players.forEach((player, playerId) => {
            if (player.lookingForGame) {
                results.push({
                    id: playerId,
                    displayName: player.displayName,
                    avatarId: player.avatarId,
                    medallion: player.medallion,
                    guildName: player.guildName
                });
            }
        });
        
        return results;
    },
    
    // Set looking for game status
    setLookingForGame: function(playerId, looking) {
        const player = this.players.get(playerId);
        if (!player) return { success: false, error: 'Not in lobby' };
        
        player.lookingForGame = looking;
        player.status = looking ? 'searching' : 'browsing';
        
        if (typeof OnlineStatusSubstrate !== 'undefined') {
            OnlineStatusSubstrate.setLookingForGame(looking);
        }
        
        if (this.onLobbyUpdated) {
            this.onLobbyUpdated();
        }
        
        return { success: true };
    },
    
    // Create solo game with AI
    createSoloGame: function(playerId, aiCount = 3, aiDifficulty = 'veteran') {
        // Use GameSessionManager if available
        if (typeof GameSessionManager !== 'undefined') {
            return GameSessionManager.createSoloGame(playerId, aiCount, aiDifficulty);
        }
        
        // Fallback to local implementation
        aiCount = Math.min(Math.max(aiCount, 2), 3);
        
        const result = this.createGame(playerId, 'solo', {
            maxPlayers: aiCount + 1,
            minPlayers: aiCount + 1,
            aiDifficulty: aiDifficulty
        });
        
        if (!result.success) return result;
        
        // Add AI players
        for (let i = 0; i < aiCount; i++) {
            this.addAI(result.game.id, playerId, aiDifficulty);
        }
        
        // Auto-start solo games
        return this.startGame(result.game.id);
    },
    
    // Invite player to game
    inviteToGame: function(gameId, inviterId, inviteeId) {
        const game = this.pendingGames.get(gameId);
        if (!game) return { success: false, error: 'Game not found' };
        if (game.hostId !== inviterId) return { success: false, error: 'Only host can invite' };
        
        // Check blocking
        if (typeof MemberBlockSubstrate !== 'undefined') {
            if (MemberBlockSubstrate.isBlocked(inviterId, inviteeId) ||
                MemberBlockSubstrate.isBlocked(inviteeId, inviterId)) {
                return { success: false, error: 'Cannot invite this player' };
            }
        }
        
        if (!game.settings.invitedPlayers.includes(inviteeId)) {
            game.settings.invitedPlayers.push(inviteeId);
        }
        
        // TODO: Send notification to invitee (would use WebSocket in production)
        console.log(`Player ${inviterId} invited ${inviteeId} to game ${gameId}`);
        
        return { success: true };
    }
};

// ============================================================
// AI PLAYER SUBSTRATE
// ============================================================

const AIPlayerSubstrate = {
    version: '1.0.0',
    name: 'FastTrack AI Players',
    
    // AI difficulty levels
    difficulties: {
        EASY: {
            id: 'easy',
            name: 'Easy',
            description: 'Only sends tokens home when no other option',
            aggression: 0.1,
            strategy: 0.3
        },
        VETERAN: {
            id: 'veteran',
            name: 'Veteran',
            description: 'Makes strategic decisions',
            aggression: 0.5,
            strategy: 0.8
        },
        AGGRESSIVE: {
            id: 'aggressive',
            name: 'Aggressive',
            description: 'Prioritizes sending opponents home',
            aggression: 0.95,
            strategy: 0.6
        }
    },
    
    // AI name pools
    namePool: [
        'Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta',
        'CPU-1', 'CPU-2', 'CPU-3', 'CPU-4',
        'Robo', 'Chip', 'Byte', 'Pixel',
        'HAL', 'GLaDOS', 'WOPR', 'Skynet Jr',
        'Calculon', 'Data', 'Bishop', 'Roy'
    ],
    
    // AI count (for unique naming)
    aiCount: 0,
    
    // Create an AI player
    create: function(difficulty = 'veteran') {
        const diff = this.difficulties[difficulty.toUpperCase()] || this.difficulties.VETERAN;
        this.aiCount++;
        
        const aiPlayer = {
            id: `ai_${Date.now()}_${this.aiCount}`,
            displayName: this.namePool[this.aiCount % this.namePool.length],
            isAI: true,
            difficulty: diff,
            
            // Use robot avatar
            avatarId: 'p_robot',
            avatar: { emoji: '🤖', name: 'Bot' },
            
            // Mock profile data
            guildId: null,
            guildName: null,
            medallion: { id: 'ai', name: 'Bot', emoji: '🤖', tier: 0 },
            
            // Session stats (reset each game)
            sessionStats: {
                tokensInHolding: 4,
                tokensInSafeZone: 0,
                tokensSentHomeThisGame: 0,
                timesSentHomeThisGame: 0
            },
            
            mood: 'neutral'
        };
        
        return aiPlayer;
    },
    
    // AI decision making
    chooseMove: function(aiPlayer, legalMoves, gameState) {
        if (!legalMoves || legalMoves.length === 0) {
            return null; // No legal moves
        }
        
        if (legalMoves.length === 1) {
            return legalMoves[0]; // Only one option
        }
        
        const diff = aiPlayer.difficulty;
        
        // Categorize moves
        const cutMoves = legalMoves.filter(m => m.willCut);
        const enterMoves = legalMoves.filter(m => m.type === 'enter');
        const safeMoves = legalMoves.filter(m => m.toSafeZone);
        const regularMoves = legalMoves.filter(m => 
            !m.willCut && m.type !== 'enter' && !m.toSafeZone
        );
        
        // EASY: Avoid cutting unless no choice
        if (diff.id === 'easy') {
            // Prefer safe zone moves
            if (safeMoves.length > 0) return this.randomChoice(safeMoves);
            // Then enter moves
            if (enterMoves.length > 0) return this.randomChoice(enterMoves);
            // Then regular moves
            if (regularMoves.length > 0) return this.randomChoice(regularMoves);
            // Only cut if forced
            return this.randomChoice(cutMoves);
        }
        
        // AGGRESSIVE: Prioritize cutting
        if (diff.id === 'aggressive') {
            // Always cut if possible (95% chance)
            if (cutMoves.length > 0 && Math.random() < diff.aggression) {
                return this.chooseBestCut(cutMoves, gameState);
            }
            // Then safe zone
            if (safeMoves.length > 0) return this.randomChoice(safeMoves);
            // Then anything
            return this.randomChoice(legalMoves);
        }
        
        // VETERAN: Strategic decision
        return this.strategicChoice(legalMoves, gameState, diff);
    },
    
    // Strategic choice for veteran AI
    strategicChoice: function(moves, gameState, diff) {
        // Score each move
        const scoredMoves = moves.map(move => {
            let score = 0;
            
            // Safe zone moves are valuable
            if (move.toSafeZone) score += 50;
            
            // Entering is good
            if (move.type === 'enter') score += 30;
            
            // Cutting is valuable but risky
            if (move.willCut) score += 40 * diff.aggression;
            
            // Fast track is good
            if (move.toHoleId && move.toHoleId.startsWith('ft-')) score += 25;
            
            // Exiting bullseye is good
            if (move.type === 'bullseye_exit') score += 35;
            
            // Add some randomness
            score += Math.random() * 20;
            
            return { move, score };
        });
        
        // Sort by score and pick best
        scoredMoves.sort((a, b) => b.score - a.score);
        return scoredMoves[0].move;
    },
    
    // Choose best cut target
    chooseBestCut: function(cutMoves, gameState) {
        // Prefer cutting players who are ahead
        // For now, just random
        return this.randomChoice(cutMoves);
    },
    
    // Random choice helper
    randomChoice: function(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },
    
    // Update AI mood based on game events
    updateMood: function(aiPlayer, event) {
        switch (event) {
            case 'gotCut':
                aiPlayer.mood = 'frustration';
                break;
            case 'sentHome':
                aiPlayer.mood = aiPlayer.difficulty.id === 'aggressive' ? 'revenge' : 'smooth';
                break;
            case 'reachedSafe':
                aiPlayer.mood = 'happy';
                break;
            case 'won':
                aiPlayer.mood = 'celebration';
                break;
            default:
                // Decay back to neutral
                setTimeout(() => { aiPlayer.mood = 'neutral'; }, 3000);
        }
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.LobbySubstrate = LobbySubstrate;
    window.AIPlayerSubstrate = AIPlayerSubstrate;
    
    console.log('Lobby & AI Substrate loaded');
}
