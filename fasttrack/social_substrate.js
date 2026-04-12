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
 * FASTTRACK SOCIAL SUBSTRATE
 * ButterflyFX Manifold Pattern - Guilds, Chat, Blocking, Tournaments
 * ============================================================
 */

// ============================================================
// GUILD SUBSTRATE
// ============================================================

const GuildSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Guild System',
    
    // Guild registry
    guilds: new Map(),
    
    // Blocking durations (milliseconds)
    blockDurations: {
        DAY: 24 * 60 * 60 * 1000,
        WEEK: 7 * 24 * 60 * 60 * 1000,
        MONTH: 30 * 24 * 60 * 60 * 1000,
        PERMANENT: Infinity
    },
    
    // Create a new guild
    create: function(adminId, guildName, options = {}) {
        const guild = {
            id: `guild_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: guildName,
            adminId: adminId, // Creator is always admin
            
            // Members
            members: new Set([adminId]),
            pendingInvites: new Set(),
            
            // Blocking
            blockedMembers: new Map(), // memberId -> { until: timestamp, reason: string }
            
            // Settings (admin configurable)
            settings: {
                chatEnabled: options.chatEnabled !== false, // Default true
                publicVisible: options.publicVisible !== false, // Can others see this guild
                inviteOnly: options.inviteOnly || false,
                maxMembers: options.maxMembers || 50
            },
            
            // Stats
            stats: {
                tournamentsWon: 0,
                gamesPlayed: 0,
                totalWins: 0
            },
            
            // Timestamps
            createdAt: Date.now()
        };
        
        this.guilds.set(guild.id, guild);
        console.log(`Guild created: ${guildName} by ${adminId}`);
        return guild;
    },
    
    // Get guild by ID
    get: function(guildId) {
        return this.guilds.get(guildId);
    },
    
    // Get guild by member
    getByMember: function(memberId) {
        for (const [id, guild] of this.guilds) {
            if (guild.members.has(memberId)) {
                return guild;
            }
        }
        return null;
    },
    
    // Invite player to guild (admin only)
    invite: function(guildId, adminId, targetId) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (guild.adminId !== adminId) return { success: false, reason: 'Only admin can invite' };
        if (guild.members.has(targetId)) return { success: false, reason: 'Already a member' };
        if (guild.members.size >= guild.settings.maxMembers) return { success: false, reason: 'Guild is full' };
        
        guild.pendingInvites.add(targetId);
        return { success: true, message: `Invite sent to ${targetId}` };
    },
    
    // Accept guild invite
    acceptInvite: function(guildId, playerId) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (!guild.pendingInvites.has(playerId)) return { success: false, reason: 'No pending invite' };
        
        // Check if blocked
        const blockInfo = guild.blockedMembers.get(playerId);
        if (blockInfo && (blockInfo.until === Infinity || blockInfo.until > Date.now())) {
            return { success: false, reason: 'You are blocked from this guild' };
        }
        
        guild.pendingInvites.delete(playerId);
        guild.members.add(playerId);
        return { success: true, guild: guild };
    },
    
    // Leave guild
    leave: function(guildId, playerId) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (playerId === guild.adminId) return { success: false, reason: 'Admin cannot leave. Transfer ownership or disband.' };
        
        guild.members.delete(playerId);
        return { success: true };
    },
    
    // Block member from guild (admin only)
    blockMember: function(guildId, adminId, targetId, duration) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (guild.adminId !== adminId) return { success: false, reason: 'Only admin can block' };
        if (targetId === adminId) return { success: false, reason: 'Cannot block yourself' };
        
        const durationMs = this.blockDurations[duration] || this.blockDurations.DAY;
        const until = durationMs === Infinity ? Infinity : Date.now() + durationMs;
        
        guild.blockedMembers.set(targetId, {
            until: until,
            blockedAt: Date.now(),
            duration: duration
        });
        
        // Remove from guild if member
        guild.members.delete(targetId);
        guild.pendingInvites.delete(targetId);
        
        return { success: true, until: until };
    },
    
    // Unblock member (admin only)
    unblockMember: function(guildId, adminId, targetId) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (guild.adminId !== adminId) return { success: false, reason: 'Only admin can unblock' };
        
        guild.blockedMembers.delete(targetId);
        return { success: true };
    },
    
    // Check if member can see guild
    canSeeGuild: function(guildId, playerId) {
        const guild = this.get(guildId);
        if (!guild) return false;
        
        // Members can always see their guild
        if (guild.members.has(playerId)) return true;
        
        // Check if blocked (silently hidden)
        const blockInfo = guild.blockedMembers.get(playerId);
        if (blockInfo && (blockInfo.until === Infinity || blockInfo.until > Date.now())) {
            return false; // Blocked users cannot see the guild
        }
        
        // Public visibility setting
        return guild.settings.publicVisible;
    },
    
    // Update guild settings (admin only)
    updateSettings: function(guildId, adminId, newSettings) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (guild.adminId !== adminId) return { success: false, reason: 'Only admin can update settings' };
        
        Object.assign(guild.settings, newSettings);
        return { success: true, settings: guild.settings };
    },
    
    // Transfer ownership (admin only)
    transferOwnership: function(guildId, currentAdminId, newAdminId) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (guild.adminId !== currentAdminId) return { success: false, reason: 'Only admin can transfer' };
        if (!guild.members.has(newAdminId)) return { success: false, reason: 'New admin must be a member' };
        
        guild.adminId = newAdminId;
        return { success: true };
    },
    
    // Disband guild (admin only)
    disband: function(guildId, adminId) {
        const guild = this.get(guildId);
        if (!guild) return { success: false, reason: 'Guild not found' };
        if (guild.adminId !== adminId) return { success: false, reason: 'Only admin can disband' };
        
        this.guilds.delete(guildId);
        return { success: true };
    },
    
    // Get public guilds list
    getPublicGuilds: function(playerId) {
        const results = [];
        this.guilds.forEach(guild => {
            if (this.canSeeGuild(guild.id, playerId)) {
                results.push({
                    id: guild.id,
                    name: guild.name,
                    memberCount: guild.members.size,
                    inviteOnly: guild.settings.inviteOnly
                });
            }
        });
        return results;
    }
};

// ============================================================
// CHAT SUBSTRATE
// ============================================================

const ChatSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Chat System',
    
    // Chat messages (in-memory for current session)
    messages: [],
    maxMessages: 100,
    
    // Chat rules
    rules: {
        // Chat only available during gameplay for guilded members
        GUILDED_GAMEPLAY_ONLY: true,
        // Maximum message length
        MAX_LENGTH: 200,
        // Cooldown between messages (ms)
        COOLDOWN: 1000
    },
    
    // Last message timestamps per user
    lastMessageTime: new Map(),
    
    // Check if player can chat
    canChat: function(playerId, isInGame) {
        // Must be in a game
        if (!isInGame) {
            return { allowed: false, reason: 'Chat only available during gameplay' };
        }
        
        // Must be in a guild
        const guild = GuildSubstrate.getByMember(playerId);
        if (!guild) {
            return { allowed: false, reason: 'Chat only available for guild members' };
        }
        
        // Guild must have chat enabled
        if (!guild.settings.chatEnabled) {
            return { allowed: false, reason: 'Chat is disabled for this guild' };
        }
        
        // Check cooldown
        const lastTime = this.lastMessageTime.get(playerId) || 0;
        if (Date.now() - lastTime < this.rules.COOLDOWN) {
            return { allowed: false, reason: 'Please wait before sending another message' };
        }
        
        return { allowed: true };
    },
    
    // Send a message
    send: function(playerId, message, gameId) {
        const canSend = this.canChat(playerId, !!gameId);
        if (!canSend.allowed) {
            return { success: false, reason: canSend.reason };
        }
        
        // Truncate if too long
        const text = message.substring(0, this.rules.MAX_LENGTH);
        
        const guild = GuildSubstrate.getByMember(playerId);
        
        const chatMessage = {
            id: `msg_${Date.now()}`,
            playerId: playerId,
            guildId: guild ? guild.id : null,
            gameId: gameId,
            text: text,
            timestamp: Date.now()
        };
        
        this.messages.push(chatMessage);
        this.lastMessageTime.set(playerId, Date.now());
        
        // Trim old messages
        while (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
        
        return { success: true, message: chatMessage };
    },
    
    // Get messages for a game (filtered by blocking)
    getMessages: function(gameId, requesterId) {
        const requesterProfile = window.PlayerProfileSubstrate ? 
            window._currentProfile : null;
        
        return this.messages.filter(msg => {
            if (msg.gameId !== gameId) return false;
            
            // Check if requester has blocked the sender
            if (requesterProfile && requesterProfile.blockedUsers.has(msg.playerId)) {
                return false;
            }
            
            return true;
        });
    },
    
    // Clear messages for a game
    clearGame: function(gameId) {
        this.messages = this.messages.filter(m => m.gameId !== gameId);
    }
};

// ============================================================
// TOURNAMENT SUBSTRATE
// ============================================================

const TournamentSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Tournament System',
    
    // Tournament registry
    tournaments: new Map(),
    
    // Tournament types
    types: {
        FREE: 'free',           // Open to anyone (non-guilded)
        GUILD: 'guild',         // Single guild tournament
        MULTI_GUILD: 'multi_guild'  // Multiple guilds compete
    },
    
    // Tournament status
    status: {
        PROPOSED: 'proposed',
        OPEN: 'open',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    },
    
    // Create a tournament
    create: function(creatorId, options = {}) {
        const tournament = {
            id: `tourn_${Date.now()}`,
            name: options.name || 'FastTrack Tournament',
            type: options.type || this.types.FREE,
            creatorId: creatorId,
            
            // Participating guilds (for guild/multi-guild)
            guildIds: options.guildIds || [],
            
            // Participants
            participants: new Set(),
            maxParticipants: options.maxParticipants || 32,
            minParticipants: options.minParticipants || 4,
            
            // Rules
            rules: {
                playersPerGame: options.playersPerGame || 4,
                gamesPerRound: options.gamesPerRound || 1,
                eliminationStyle: options.eliminationStyle || 'single', // single, double, round-robin
                timeLimit: options.timeLimit || 30, // minutes per game
                ...options.rules
            },
            
            // Status
            status: this.status.PROPOSED,
            
            // Bracket/results
            rounds: [],
            winner: null,
            
            // Timestamps
            createdAt: Date.now(),
            startAt: options.startAt || null,
            endedAt: null
        };
        
        this.tournaments.set(tournament.id, tournament);
        return tournament;
    },
    
    // Propose multi-guild tournament
    proposeMultiGuild: function(proposerGuildId, targetGuildIds, options = {}) {
        const proposerGuild = GuildSubstrate.get(proposerGuildId);
        if (!proposerGuild) return { success: false, reason: 'Proposer guild not found' };
        
        const allGuildIds = [proposerGuildId, ...targetGuildIds];
        
        // Verify all guilds exist
        for (const gId of targetGuildIds) {
            if (!GuildSubstrate.get(gId)) {
                return { success: false, reason: `Guild ${gId} not found` };
            }
        }
        
        const tournament = this.create(proposerGuild.adminId, {
            ...options,
            type: this.types.MULTI_GUILD,
            guildIds: allGuildIds,
            name: options.name || `${proposerGuild.name} Challenge`
        });
        
        // Pending acceptance from other guilds
        tournament.pendingAcceptance = new Set(targetGuildIds);
        tournament.acceptedGuilds = new Set([proposerGuildId]);
        
        return { success: true, tournament: tournament };
    },
    
    // Accept multi-guild tournament proposal
    acceptProposal: function(tournamentId, guildId, adminId) {
        const tournament = this.tournaments.get(tournamentId);
        if (!tournament) return { success: false, reason: 'Tournament not found' };
        
        const guild = GuildSubstrate.get(guildId);
        if (!guild || guild.adminId !== adminId) {
            return { success: false, reason: 'Only guild admin can accept' };
        }
        
        if (!tournament.pendingAcceptance.has(guildId)) {
            return { success: false, reason: 'No pending acceptance for this guild' };
        }
        
        tournament.pendingAcceptance.delete(guildId);
        tournament.acceptedGuilds.add(guildId);
        
        // If all accepted, open tournament
        if (tournament.pendingAcceptance.size === 0) {
            tournament.status = this.status.OPEN;
        }
        
        return { success: true, status: tournament.status };
    },
    
    // Join a tournament
    join: function(tournamentId, playerId) {
        const tournament = this.tournaments.get(tournamentId);
        if (!tournament) return { success: false, reason: 'Tournament not found' };
        if (tournament.status !== this.status.OPEN) {
            return { success: false, reason: 'Tournament is not accepting participants' };
        }
        if (tournament.participants.size >= tournament.maxParticipants) {
            return { success: false, reason: 'Tournament is full' };
        }
        
        // Check guild requirements
        if (tournament.type === this.types.GUILD || tournament.type === this.types.MULTI_GUILD) {
            const playerGuild = GuildSubstrate.getByMember(playerId);
            if (!playerGuild || !tournament.guildIds.includes(playerGuild.id)) {
                return { success: false, reason: 'Must be a member of a participating guild' };
            }
        }
        
        tournament.participants.add(playerId);
        return { success: true };
    },
    
    // Start tournament
    start: function(tournamentId, starterId) {
        const tournament = this.tournaments.get(tournamentId);
        if (!tournament) return { success: false, reason: 'Tournament not found' };
        if (tournament.creatorId !== starterId) {
            return { success: false, reason: 'Only creator can start' };
        }
        if (tournament.participants.size < tournament.minParticipants) {
            return { success: false, reason: 'Not enough participants' };
        }
        
        tournament.status = this.status.IN_PROGRESS;
        
        // Generate bracket
        this.generateBracket(tournament);
        
        return { success: true, tournament: tournament };
    },
    
    // Generate tournament bracket
    generateBracket: function(tournament) {
        const participants = Array.from(tournament.participants);
        
        // Shuffle participants
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }
        
        // Create first round
        const playersPerGame = tournament.rules.playersPerGame;
        const games = [];
        
        for (let i = 0; i < participants.length; i += playersPerGame) {
            const gamePlayers = participants.slice(i, i + playersPerGame);
            games.push({
                id: `game_${tournament.id}_r1_${games.length}`,
                players: gamePlayers,
                winner: null,
                completed: false
            });
        }
        
        tournament.rounds.push({
            roundNumber: 1,
            games: games
        });
    },
    
    // Record game result
    recordResult: function(tournamentId, gameId, winnerId) {
        const tournament = this.tournaments.get(tournamentId);
        if (!tournament) return { success: false, reason: 'Tournament not found' };
        
        // Find game
        for (const round of tournament.rounds) {
            const game = round.games.find(g => g.id === gameId);
            if (game) {
                game.winner = winnerId;
                game.completed = true;
                
                // Check if round complete
                this.checkRoundComplete(tournament, round);
                
                return { success: true };
            }
        }
        
        return { success: false, reason: 'Game not found' };
    },
    
    // Check if round is complete and advance
    checkRoundComplete: function(tournament, round) {
        const allComplete = round.games.every(g => g.completed);
        if (!allComplete) return;
        
        // Get winners
        const winners = round.games.map(g => g.winner).filter(w => w);
        
        // If only one winner, tournament is complete
        if (winners.length === 1) {
            tournament.winner = winners[0];
            tournament.status = this.status.COMPLETED;
            tournament.endedAt = Date.now();
            return;
        }
        
        // Generate next round
        const playersPerGame = tournament.rules.playersPerGame;
        const games = [];
        
        for (let i = 0; i < winners.length; i += playersPerGame) {
            const gamePlayers = winners.slice(i, i + playersPerGame);
            if (gamePlayers.length >= 2) { // Need at least 2 players
                games.push({
                    id: `game_${tournament.id}_r${tournament.rounds.length + 1}_${games.length}`,
                    players: gamePlayers,
                    winner: null,
                    completed: false
                });
            }
        }
        
        if (games.length > 0) {
            tournament.rounds.push({
                roundNumber: tournament.rounds.length + 1,
                games: games
            });
        }
    },
    
    // Get open tournaments
    getOpen: function(playerId) {
        const results = [];
        this.tournaments.forEach(t => {
            if (t.status === this.status.OPEN) {
                // Check if player can join
                if (t.type === this.types.FREE) {
                    results.push(t);
                } else {
                    const guild = GuildSubstrate.getByMember(playerId);
                    if (guild && t.guildIds.includes(guild.id)) {
                        results.push(t);
                    }
                }
            }
        });
        return results;
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.GuildSubstrate = GuildSubstrate;
    window.ChatSubstrate = ChatSubstrate;
    window.TournamentSubstrate = TournamentSubstrate;
    
    console.log('Social Substrate loaded: Guilds, Chat, Tournaments');
}
