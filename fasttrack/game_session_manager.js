/**
 * ============================================================
 * FASTTRACK GAME SESSION MANAGER
 * ButterflyFX Manifold Pattern - Game Creation, Sessions, Launching
 * ============================================================
 */

const GameSessionManager = {
    version: '1.0.0',
    name: 'FastTrack Game Session Manager',
    
    // Active game sessions
    sessions: new Map(),
    
    // Game modes
    MODES: {
        SOLO: 'solo',           // Solo with AI (3-4 players)
        RANDOM: 'random',       // Random matchmaking (3-4 players)
        PRIVATE: 'private',     // Private game (2-6 players)
        GUILD: 'guild'          // Guild game (2-6 players)
    },
    
    // Player limits by mode
    LIMITS: {
        solo: { min: 3, max: 4 },
        random: { min: 3, max: 4, preferred: 4 },
        private: { min: 2, max: 6 },
        guild: { min: 2, max: 6 }
    },
    
    // Session status
    STATUS: {
        WAITING: 'waiting',
        STARTING: 'starting',
        IN_PROGRESS: 'in_progress',
        PAUSED: 'paused',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    },
    
    // Callbacks
    onSessionCreated: null,
    onSessionStarted: null,
    onSessionEnded: null,
    onPlayerJoined: null,
    onPlayerLeft: null,
    
    // ============================================================
    // SESSION CREATION
    // ============================================================
    
    createSession: function(hostId, mode, options = {}) {
        const host = AuthSubstrate.getUserById(hostId);
        if (!host) {
            return { success: false, error: 'Host not found' };
        }
        
        // Validate mode limits
        const limits = this.LIMITS[mode];
        if (!limits) {
            return { success: false, error: 'Invalid game mode' };
        }
        
        // Check guild requirements for guild mode
        if (mode === this.MODES.GUILD && !host.guildId) {
            return { success: false, error: 'Must be in a guild for guild games' };
        }
        
        // Check 6-player limit
        const maxPlayers = options.maxPlayers || limits.max;
        if (maxPlayers > 4 && mode !== this.MODES.PRIVATE && mode !== this.MODES.GUILD) {
            return { success: false, error: '6 players only available for private or guild games' };
        }
        
        const sessionId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        
        const session = {
            id: sessionId,
            mode: mode,
            hostId: hostId,
            
            // Players
            humanPlayers: [{
                id: hostId,
                username: host.username,
                displayName: host.displayName,
                avatarId: host.avatarId,
                isHost: true,
                isReady: true,
                joinedAt: Date.now()
            }],
            aiPlayers: [],
            
            // Limits
            minPlayers: options.minPlayers || limits.min,
            maxPlayers: maxPlayers,
            
            // Settings
            settings: {
                private: mode === this.MODES.PRIVATE,
                guildOnly: mode === this.MODES.GUILD,
                guildId: mode === this.MODES.GUILD ? host.guildId : null,
                inviteOnly: options.inviteOnly || false,
                allowAI: options.allowAI !== false,
                aiDifficulty: options.aiDifficulty || 'veteran',
                invitedPlayers: options.invitedPlayers || []
            },
            
            // Status
            status: this.STATUS.WAITING,
            
            // Timestamps
            createdAt: Date.now(),
            startedAt: null,
            endedAt: null,
            
            // Game state (once started)
            gameState: null,
            
            // Results
            results: null
        };
        
        this.sessions.set(sessionId, session);
        
        // Update online status
        if (typeof OnlineStatusSubstrate !== 'undefined') {
            OnlineStatusSubstrate.updateStatus(OnlineStatusSubstrate.STATUS.LOOKING_FOR_GAME);
        }
        
        console.log(`Game session created: ${sessionId} (${mode})`);
        
        if (this.onSessionCreated) {
            this.onSessionCreated(session);
        }
        
        return { success: true, session };
    },
    
    // ============================================================
    // SOLO PLAY (with AI)
    // ============================================================
    
    createSoloGame: function(playerId, aiCount = 3, aiDifficulty = 'veteran') {
        // Validate AI count (min 2, max 3 AI for solo)
        aiCount = Math.min(Math.max(aiCount, 2), 3);
        
        const result = this.createSession(playerId, this.MODES.SOLO, {
            maxPlayers: aiCount + 1,
            minPlayers: aiCount + 1,
            allowAI: true,
            aiDifficulty: aiDifficulty
        });
        
        if (!result.success) return result;
        
        // Add AI players
        for (let i = 0; i < aiCount; i++) {
            this.addAIPlayer(result.session.id, aiDifficulty);
        }
        
        // Auto-start solo games
        return this.startSession(result.session.id);
    },
    
    // ============================================================
    // PLAYER MANAGEMENT
    // ============================================================
    
    joinSession: function(sessionId, playerId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        if (session.status !== this.STATUS.WAITING) {
            return { success: false, error: 'Game already started' };
        }
        
        const player = AuthSubstrate.getUserById(playerId);
        if (!player) {
            return { success: false, error: 'Player not found' };
        }
        
        // Check if already in game
        if (session.humanPlayers.some(p => p.id === playerId)) {
            return { success: false, error: 'Already in this game' };
        }
        
        // Check capacity
        const totalPlayers = session.humanPlayers.length + session.aiPlayers.length;
        if (totalPlayers >= session.maxPlayers) {
            return { success: false, error: 'Game is full' };
        }
        
        // Check guild restriction
        if (session.settings.guildOnly && player.guildId !== session.settings.guildId) {
            return { success: false, error: 'Guild members only' };
        }
        
        // Check invite restriction
        if (session.settings.inviteOnly && !session.settings.invitedPlayers.includes(playerId)) {
            return { success: false, error: 'Invite only game' };
        }
        
        // Check blocking
        const host = AuthSubstrate.getUserById(session.hostId);
        if (host && host.blockedUsers && host.blockedUsers.includes(playerId)) {
            return { success: false, error: 'Cannot join this game' };
        }
        if (player.blockedUsers && player.blockedUsers.includes(session.hostId)) {
            return { success: false, error: 'Cannot join this game' };
        }
        
        // Add player
        session.humanPlayers.push({
            id: playerId,
            username: player.username,
            displayName: player.displayName,
            avatarId: player.avatarId,
            isHost: false,
            isReady: false,
            joinedAt: Date.now()
        });
        
        console.log(`Player ${player.username} joined game ${sessionId}`);
        
        if (this.onPlayerJoined) {
            this.onPlayerJoined(session, player);
        }
        
        return { success: true, session };
    },
    
    leaveSession: function(sessionId, playerId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        const playerIndex = session.humanPlayers.findIndex(p => p.id === playerId);
        if (playerIndex === -1) {
            return { success: false, error: 'Not in this game' };
        }
        
        const player = session.humanPlayers[playerIndex];
        session.humanPlayers.splice(playerIndex, 1);
        
        // If host left, transfer host or cancel
        if (player.isHost) {
            if (session.humanPlayers.length > 0) {
                session.humanPlayers[0].isHost = true;
                session.hostId = session.humanPlayers[0].id;
                console.log(`Host transferred to ${session.humanPlayers[0].username}`);
            } else {
                // No players left, cancel session
                session.status = this.STATUS.CANCELLED;
                console.log(`Game ${sessionId} cancelled - no players`);
            }
        }
        
        if (this.onPlayerLeft) {
            this.onPlayerLeft(session, player);
        }
        
        return { success: true };
    },
    
    setPlayerReady: function(sessionId, playerId, ready = true) {
        const session = this.sessions.get(sessionId);
        if (!session) return { success: false, error: 'Game not found' };
        
        const player = session.humanPlayers.find(p => p.id === playerId);
        if (!player) return { success: false, error: 'Not in this game' };
        
        player.isReady = ready;
        
        return { success: true };
    },
    
    // ============================================================
    // AI PLAYERS
    // ============================================================
    
    addAIPlayer: function(sessionId, difficulty = 'veteran') {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        if (!session.settings.allowAI) {
            return { success: false, error: 'Bot players not allowed in this game' };
        }
        
        const totalPlayers = session.humanPlayers.length + session.aiPlayers.length;
        if (totalPlayers >= session.maxPlayers) {
            return { success: false, error: 'Game is full' };
        }
        
        const aiPlayer = AIPlayerSubstrate.create(difficulty);
        session.aiPlayers.push(aiPlayer);
        
        console.log(`AI player ${aiPlayer.displayName} added to game ${sessionId}`);
        
        return { success: true, aiPlayer };
    },
    
    removeAIPlayer: function(sessionId, aiPlayerId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        const index = session.aiPlayers.findIndex(ai => ai.id === aiPlayerId);
        if (index === -1) {
            return { success: false, error: 'Bot player not found' };
        }
        
        session.aiPlayers.splice(index, 1);
        
        return { success: true };
    },
    
    // ============================================================
    // INVITATIONS
    // ============================================================
    
    invitePlayer: function(sessionId, inviterId, inviteeId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        if (session.hostId !== inviterId) {
            return { success: false, error: 'Only host can invite' };
        }
        
        const invitee = AuthSubstrate.getUserById(inviteeId);
        if (!invitee) {
            return { success: false, error: 'Player not found' };
        }
        
        // Check blocking
        const host = AuthSubstrate.getUserById(session.hostId);
        if (host.blockedUsers && host.blockedUsers.includes(inviteeId)) {
            return { success: false, error: 'Cannot invite blocked player' };
        }
        if (invitee.blockedUsers && invitee.blockedUsers.includes(session.hostId)) {
            return { success: false, error: 'Player has blocked you' };
        }
        
        if (!session.settings.invitedPlayers.includes(inviteeId)) {
            session.settings.invitedPlayers.push(inviteeId);
        }
        
        // Send invitation notification (would use WebSocket in production)
        console.log(`Invitation sent to ${invitee.username} for game ${sessionId}`);
        
        return { success: true };
    },
    
    // ============================================================
    // GAME LIFECYCLE
    // ============================================================
    
    canStart: function(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return { canStart: false, reason: 'Game not found' };
        
        const totalPlayers = session.humanPlayers.length + session.aiPlayers.length;
        
        if (totalPlayers < session.minPlayers) {
            return { canStart: false, reason: `Need at least ${session.minPlayers} players` };
        }
        
        // Check if all human players are ready
        const allReady = session.humanPlayers.every(p => p.isReady);
        if (!allReady) {
            return { canStart: false, reason: 'Not all players are ready' };
        }
        
        return { canStart: true };
    },
    
    startSession: function(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        const check = this.canStart(sessionId);
        if (!check.canStart) {
            return { success: false, error: check.reason };
        }
        
        session.status = this.STATUS.STARTING;
        session.startedAt = Date.now();
        
        // Combine all players for game
        const allPlayers = [
            ...session.humanPlayers,
            ...session.aiPlayers
        ];
        
        // Shuffle player order
        for (let i = allPlayers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
        }
        
        session.playerOrder = allPlayers;
        session.status = this.STATUS.IN_PROGRESS;
        
        // Update online status for all human players
        session.humanPlayers.forEach(p => {
            if (typeof OnlineStatusSubstrate !== 'undefined') {
                const userData = OnlineStatusSubstrate.onlineUsers.get(p.id);
                if (userData) {
                    userData.status = OnlineStatusSubstrate.STATUS.IN_GAME;
                    userData.lookingForGame = false;
                }
            }
        });
        
        console.log(`Game ${sessionId} started with ${allPlayers.length} players`);
        
        if (this.onSessionStarted) {
            this.onSessionStarted(session);
        }
        
        return { success: true, session };
    },
    
    endSession: function(sessionId, results = null) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Game not found' };
        }
        
        session.status = this.STATUS.COMPLETED;
        session.endedAt = Date.now();
        session.results = results;
        
        // Update player stats
        if (results && results.winner) {
            const winner = AuthSubstrate.getUserById(results.winner);
            if (winner) {
                winner.stats.gamesWon++;
                winner.stats.totalPoints += 50;
            }
        }
        
        session.humanPlayers.forEach(p => {
            const user = AuthSubstrate.getUserById(p.id);
            if (user) {
                user.stats.gamesPlayed++;
                
                // Update online status
                if (typeof OnlineStatusSubstrate !== 'undefined') {
                    OnlineStatusSubstrate.updateStatus(OnlineStatusSubstrate.STATUS.ONLINE);
                }
            }
        });
        
        AuthSubstrate.saveToStorage();
        
        console.log(`Game ${sessionId} ended`);
        
        if (this.onSessionEnded) {
            this.onSessionEnded(session);
        }
        
        return { success: true };
    },
    
    // ============================================================
    // QUERIES
    // ============================================================
    
    getSession: function(sessionId) {
        return this.sessions.get(sessionId);
    },
    
    getWaitingSessions: function(playerId, filters = {}) {
        const results = [];
        const player = playerId ? AuthSubstrate.getUserById(playerId) : null;
        
        this.sessions.forEach(session => {
            if (session.status !== this.STATUS.WAITING) return;
            
            // Skip private games unless invited
            if (session.settings.private || session.settings.inviteOnly) {
                if (!session.settings.invitedPlayers.includes(playerId)) {
                    return;
                }
            }
            
            // Check guild restriction
            if (session.settings.guildOnly) {
                if (!player || player.guildId !== session.settings.guildId) {
                    return;
                }
            }
            
            // Check blocking
            const host = AuthSubstrate.getUserById(session.hostId);
            if (player && host) {
                if (host.blockedUsers?.includes(playerId)) return;
                if (player.blockedUsers?.includes(session.hostId)) return;
            }
            
            results.push({
                id: session.id,
                mode: session.mode,
                host: host ? host.displayName : 'Unknown',
                playerCount: session.humanPlayers.length + session.aiPlayers.length,
                maxPlayers: session.maxPlayers,
                hasAI: session.aiPlayers.length > 0,
                guildOnly: session.settings.guildOnly
            });
        });
        
        return results;
    },
    
    getPlayerSession: function(playerId) {
        for (const [id, session] of this.sessions) {
            if (session.humanPlayers.some(p => p.id === playerId)) {
                return session;
            }
        }
        return null;
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.GameSessionManager = GameSessionManager;
    console.log('Game Session Manager loaded');
}
