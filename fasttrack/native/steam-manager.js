/**
 * Fast Track - Steam Integration Manager
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 *                        BUTTERFLYFX SUBSTRATE MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Steam integration as dimensional manifold:
 * 
 * Level 0 (VOID):     Steam SDK not loaded — pure potential
 * Level 1 (POINT):    Steam AppID established — identity token
 * Level 2 (LINE):     Connection to Steam client — relation formed
 * Level 3 (WIDTH):    User profile loaded — dimension expands
 * Level 4 (PLANE):    Overlay active, achievements visible — INVOKE LEVEL
 * Level 5 (VOLUME):   Multiplicity — friends list, lobbies, leaderboards
 * Level 6 (WHOLE):    Meaning — community engagement, playtime, reviews
 * 
 * Each Steam operation is a TOKEN τ = (x, σ, π):
 *   x: Steam API call signature
 *   σ: Coordinates (user_id, lobby_id, achievement_id)
 *   π: Lazy payload (callback data, async results)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

let greenworks = null;
let steamInitialized = false;

// Achievement definitions mapped to ButterflyFX levels
const ACHIEVEMENTS = {
    // Level 1 - Point (Identity)
    FIRST_GAME: {
        id: 'ACH_FIRST_GAME',
        name: 'First Steps',
        description: 'Complete your first game of Fast Track',
        level: 1
    },
    // Level 2 - Line (Connection)
    PLAY_ONLINE: {
        id: 'ACH_PLAY_ONLINE',
        name: 'Connected',
        description: 'Play a multiplayer game online',
        level: 2
    },
    // Level 3 - Width (Expansion)
    WIN_10_GAMES: {
        id: 'ACH_WIN_10',
        name: 'Getting Good',
        description: 'Win 10 games',
        level: 3
    },
    // Level 4 - Plane (Manifestation)
    PERFECT_GAME: {
        id: 'ACH_PERFECT',
        name: 'Perfect Run',
        description: 'Win a game without losing any pegs',
        level: 4
    },
    // Level 5 - Volume (Multiplicity)
    GUILD_MASTER: {
        id: 'ACH_GUILD',
        name: 'Guild Master',
        description: 'Create or lead a guild with 10+ members',
        level: 5
    },
    // Level 6 - Whole (Completion)
    LEGENDARY: {
        id: 'ACH_LEGENDARY',
        name: 'Legendary Player',
        description: 'Reach maximum rank in competitive play',
        level: 6
    }
};

// Leaderboard definitions
const LEADERBOARDS = {
    WINS_TOTAL: 'fast_track_wins_total',
    WIN_STREAK: 'fast_track_win_streak',
    GAMES_PLAYED: 'fast_track_games_played',
    PEGS_CAPTURED: 'fast_track_pegs_captured',
    PERFECT_GAMES: 'fast_track_perfect_games'
};

/**
 * Initialize Steam SDK
 * Level 0 → Level 1 transition: VOID to POINT
 */
function initSteam() {
    try {
        // Load Greenworks native module
        greenworks = require('greenworks');
        
        if (greenworks.init()) {
            steamInitialized = true;
            console.log('Steam initialized successfully');
            console.log('Steam App ID:', greenworks.getAppId());
            console.log('Steam User:', getSteamUser());
            
            // Start callback pump
            setInterval(() => {
                greenworks.runCallbacks();
            }, 100);
            
            return true;
        } else {
            console.warn('Steam init returned false');
            return false;
        }
    } catch (error) {
        console.warn('Steam not available:', error.message);
        return false;
    }
}

/**
 * Get Steam user information
 * Level 3 operation: WIDTH expansion — user profile dimension
 */
function getSteamUser() {
    if (!steamInitialized) return null;
    
    try {
        return {
            steamId: greenworks.getSteamId().getRawSteamID(),
            displayName: greenworks.getSteamId().getPersonaName(),
            // Map to ButterflyFX token
            token: {
                x: 'steam_user',
                sigma: [greenworks.getSteamId().getRawSteamID()],
                pi: () => ({
                    avatar: getAvatarURL(),
                    level: greenworks.getPlayerSteamLevel()
                })
            }
        };
    } catch (error) {
        console.error('Failed to get Steam user:', error);
        return null;
    }
}

/**
 * Get user's Steam avatar URL
 */
function getAvatarURL() {
    if (!steamInitialized) return null;
    
    try {
        // Greenworks provides avatar handle
        const handle = greenworks.getLargeFriendAvatar(greenworks.getSteamId());
        // In real implementation, convert to image data
        return `steam://avatar/${handle}`;
    } catch (error) {
        return null;
    }
}

/**
 * Unlock an achievement
 * Level 4 operation: PLANE manifestation — achievement becomes visible
 */
function unlockAchievement(achievementKey) {
    if (!steamInitialized) {
        console.log('Steam not available, achievement queued:', achievementKey);
        return Promise.resolve(false);
    }
    
    const achievement = ACHIEVEMENTS[achievementKey];
    if (!achievement) {
        console.error('Unknown achievement:', achievementKey);
        return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
        greenworks.activateAchievement(
            achievement.id,
            () => {
                console.log('Achievement unlocked:', achievement.name);
                resolve(true);
            },
            (err) => {
                console.error('Achievement error:', err);
                resolve(false);
            }
        );
    });
}

/**
 * Get achievement status
 */
function getAchievements() {
    if (!steamInitialized) return {};
    
    const status = {};
    for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
        try {
            status[key] = {
                ...achievement,
                unlocked: greenworks.isAchievementActivated(achievement.id)
            };
        } catch (error) {
            status[key] = { ...achievement, unlocked: false };
        }
    }
    return status;
}

/**
 * Submit score to leaderboard
 * Level 5 operation: VOLUME multiplicity — score enters global context
 */
function submitScore(leaderboardId, score) {
    if (!steamInitialized) {
        console.log('Steam not available, score queued:', leaderboardId, score);
        return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
        greenworks.findOrCreateLeaderboard(
            leaderboardId,
            greenworks.UGCMatchingType.Numbers,
            greenworks.UGCMatchingType.Descending,
            (leaderboard) => {
                greenworks.uploadLeaderboardScore(
                    leaderboard,
                    score,
                    greenworks.LeaderboardScoreMethod.KeepBest,
                    () => {
                        console.log('Score submitted:', leaderboardId, score);
                        resolve(true);
                    },
                    (err) => {
                        console.error('Score submission error:', err);
                        resolve(false);
                    }
                );
            },
            (err) => {
                console.error('Leaderboard error:', err);
                resolve(false);
            }
        );
    });
}

/**
 * Get leaderboard entries
 */
function getLeaderboard(leaderboardId, start = 0, count = 10) {
    if (!steamInitialized) return Promise.resolve([]);
    
    return new Promise((resolve) => {
        greenworks.findLeaderboard(
            leaderboardId,
            (leaderboard) => {
                greenworks.downloadLeaderboardEntries(
                    leaderboard,
                    greenworks.LeaderboardDataRequest.Global,
                    start,
                    start + count,
                    (entries) => {
                        resolve(entries.map(e => ({
                            rank: e.globalRank,
                            score: e.score,
                            steamId: e.steamId,
                            // ButterflyFX token
                            token: {
                                x: 'leaderboard_entry',
                                sigma: [e.steamId, e.globalRank],
                                pi: () => e
                            }
                        })));
                    },
                    (err) => {
                        console.error('Download entries error:', err);
                        resolve([]);
                    }
                );
            },
            (err) => {
                console.error('Find leaderboard error:', err);
                resolve([]);
            }
        );
    });
}

/**
 * Create Steam lobby
 * Level 5 operation: VOLUME — multiple players in shared space
 */
function createLobby(maxPlayers = 6) {
    if (!steamInitialized) return Promise.resolve(null);
    
    return new Promise((resolve) => {
        greenworks.createLobby(
            greenworks.LobbyType.Public,
            maxPlayers,
            (lobbyId) => {
                console.log('Lobby created:', lobbyId);
                resolve({
                    lobbyId,
                    // ButterflyFX token
                    token: {
                        x: 'steam_lobby',
                        sigma: [lobbyId],
                        pi: () => ({ maxPlayers, created: Date.now() })
                    }
                });
            },
            (err) => {
                console.error('Create lobby error:', err);
                resolve(null);
            }
        );
    });
}

/**
 * Join Steam lobby
 */
function joinLobby(lobbyId) {
    if (!steamInitialized) return Promise.resolve(false);
    
    return new Promise((resolve) => {
        greenworks.joinLobby(
            lobbyId,
            () => {
                console.log('Joined lobby:', lobbyId);
                resolve(true);
            },
            (err) => {
                console.error('Join lobby error:', err);
                resolve(false);
            }
        );
    });
}

/**
 * Get list of lobbies
 */
function getLobbies() {
    if (!steamInitialized) return Promise.resolve([]);
    
    return new Promise((resolve) => {
        greenworks.requestLobbyList(
            (lobbies) => {
                resolve(lobbies.map(l => ({
                    lobbyId: l.lobbyId,
                    memberCount: l.numMembers,
                    maxMembers: l.maxMembers,
                    token: {
                        x: 'steam_lobby_listing',
                        sigma: [l.lobbyId],
                        pi: () => l
                    }
                })));
            },
            (err) => {
                console.error('Request lobbies error:', err);
                resolve([]);
            }
        );
    });
}

/**
 * Activate Steam overlay
 * Level 4 INVOKE: manifests Steam UI on top of game
 */
function activateOverlay(dialog = '') {
    if (!steamInitialized) return;
    
    if (dialog) {
        greenworks.activateGameOverlayToWebPage(dialog);
    } else {
        greenworks.activateGameOverlay('Friends');
    }
}

/**
 * Rich Presence - show current game state
 * Level 6 operation: WHOLE — game meaning visible to Steam community
 */
function setRichPresence(key, value) {
    if (!steamInitialized) return;
    
    try {
        greenworks.setRichPresence(key, value);
    } catch (error) {
        console.warn('Rich presence error:', error);
    }
}

/**
 * Update game status for Steam
 */
function updateGameStatus(status) {
    if (!steamInitialized) return;
    
    const statusMap = {
        'menu': 'In Main Menu',
        'lobby': 'In Lobby',
        'playing': 'Playing Fast Track',
        'spectating': 'Spectating a Game'
    };
    
    setRichPresence('steam_display', '#StatusWithScore');
    setRichPresence('status', statusMap[status] || status);
}

// Export for IPC
module.exports = {
    initSteam,
    getSteamUser,
    unlockAchievement,
    getAchievements,
    submitScore,
    getLeaderboard,
    createLobby,
    joinLobby,
    getLobbies,
    activateOverlay,
    setRichPresence,
    updateGameStatus,
    ACHIEVEMENTS,
    LEADERBOARDS,
    get isInitialized() { return steamInitialized; }
};
