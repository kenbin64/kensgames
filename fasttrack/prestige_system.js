/**
 * 🏅 PRESTIGE & MEDALLION SYSTEM
 * Tracks prestige points per game and persistent medallion status.
 * Only multiplayer games qualify for prestige/medallion progression.
 */

// NOTE: This extends/replaces the older prestige.js system
// with more detailed tracking for multiplayer games
const PrestigeSystemV2 = {
    // Medallion levels (order matters - higher index = higher rank)
    MEDALLION_LEVELS: [
        { name: 'Bronze', emoji: '🥉', minPoints: 0, color: '#CD7F32' },
        { name: 'Silver', emoji: '🥈', minPoints: 500, color: '#C0C0C0' },
        { name: 'Gold', emoji: '🥇', minPoints: 1500, color: '#FFD700' },
        { name: 'Platinum', emoji: '💎', minPoints: 3500, color: '#E5E4E2' },
        { name: 'Diamond', emoji: '💠', minPoints: 7000, color: '#B9F2FF' },
        { name: 'Crown', emoji: '👑', minPoints: 15000, color: '#9B59B6' }  // Top 10 only
    ],
    
    // Prestige point values (awarded during gameplay)
    POINTS: {
        // Positive actions
        WIN_GAME: 100,
        CUT_OPPONENT: 15,
        DOUBLE_CUT_ONE_TURN: 40,        // 2 cuts in one turn
        TRIPLE_CUT_ONE_TURN: 80,        // 3+ cuts (rare!)
        SEVEN_SPLIT_DOUBLE_CUT: 60,     // Using 7 to cut twice
        ENTER_FASTTRACK: 10,
        ENTER_BULLSEYE: 25,             // Risky play rewarded
        EXIT_BULLSEYE_CUT: 35,          // Left bullseye to cut someone
        FIRST_SAFE_ZONE: 30,            // First player to reach safe zone
        LEAVE_FT_FOR_CUT: 20,           // Left FastTrack early to pursue
        PEG_HOME: 50,                   // Got a peg to winner hole
        PERFECT_GAME: 150,              // Won without losing any pegs
        COMEBACK_WIN: 75,               // Won after being down 3+ pegs
        
        // Negative actions
        LOSS: -25,
        PASSIVE_PLAY: -10,              // Didn't cut when possible (no strategy)
        NO_RISK_PENALTY: -5,            // Avoided all risk opportunities
        BAD_SPORTSMANSHIP: -50,         // Reported/flagged behavior
        TIMEOUT_FORFEIT: -75,           // Timed out of game
        
        // Multipliers
        STREAK_BONUS: 1.5,              // Winning streak multiplier
        UNDERDOG_WIN: 2.0               // Beat higher medallion opponent
    },
    
    // Current game state
    currentGame: {
        playerId: null,
        isMultiplayer: false,
        prestigePoints: 0,
        cutsThisTurn: 0,
        risksTaken: 0,
        cutOpportunities: 0,
        cutsExecuted: 0
    },
    
    // Initialize for a new game
    startGame(playerId, isMultiplayer = false) {
        this.currentGame = {
            playerId,
            isMultiplayer,
            prestigePoints: 0,
            cutsThisTurn: 0,
            risksTaken: 0,
            cutOpportunities: 0,
            cutsExecuted: 0,
            enteredSafeZone: false,
            wasFirstToSafeZone: false,
            pegsLost: 0,
            pegsHome: 0
        };
        console.log(`🏅 Prestige tracking started for ${playerId} (MP: ${isMultiplayer})`);
    },
    
    // Award points for an action
    awardPoints(action, multiplier = 1) {
        if (!this.currentGame.isMultiplayer) return 0;
        
        const points = Math.floor((this.POINTS[action] || 0) * multiplier);
        this.currentGame.prestigePoints += points;
        
        if (points !== 0) {
            console.log(`🏅 ${points > 0 ? '+' : ''}${points} prestige (${action})`);
        }
        return points;
    },
    
    // Track a cut - awards bonus for multiple cuts per turn
    trackCut() {
        this.currentGame.cutsThisTurn++;
        this.currentGame.cutsExecuted++;
        
        if (this.currentGame.cutsThisTurn === 1) {
            this.awardPoints('CUT_OPPONENT');
        } else if (this.currentGame.cutsThisTurn === 2) {
            this.awardPoints('DOUBLE_CUT_ONE_TURN');
        } else if (this.currentGame.cutsThisTurn >= 3) {
            this.awardPoints('TRIPLE_CUT_ONE_TURN');
        }
    },
    
    // Reset turn-based tracking
    endTurn() {
        this.currentGame.cutsThisTurn = 0;
    },
    
    // Track cut opportunity (for passive play detection)
    trackCutOpportunity(wasExecuted) {
        this.currentGame.cutOpportunities++;
        if (!wasExecuted) {
            // Could have cut but didn't - might be passive play
            // Only penalize if they're avoiding cuts consistently
            const cutRate = this.currentGame.cutsExecuted / this.currentGame.cutOpportunities;
            if (cutRate < 0.3 && this.currentGame.cutOpportunities >= 5) {
                this.awardPoints('PASSIVE_PLAY');
            }
        }
    },
    
    // End game - finalize prestige and update medallion
    endGame(won, opponentMedallionLevel = 0) {
        if (!this.currentGame.isMultiplayer) {
            console.log('🏅 Single player game - no prestige awarded');
            return 0;
        }
        
        // Win/loss points
        if (won) {
            this.awardPoints('WIN_GAME');
            
            // Bonus for beating higher-ranked opponent
            const myLevel = this.getMedallionLevel(this.currentGame.playerId);
            if (opponentMedallionLevel > myLevel) {
                this.awardPoints('WIN_GAME', this.POINTS.UNDERDOG_WIN);
            }
            
            // Perfect game bonus
            if (this.currentGame.pegsLost === 0) {
                this.awardPoints('PERFECT_GAME');
            }
        } else {
            this.awardPoints('LOSS');
        }
        
        // Update persistent medallion points
        const finalPoints = this.currentGame.prestigePoints;
        this._updateMedallionPoints(this.currentGame.playerId, finalPoints);
        
        console.log(`🏅 Game ended. Prestige earned: ${finalPoints}`);
        return finalPoints;
    },
    
    // Get player's current medallion level
    getMedallionLevel(playerId) {
        const points = this._getStoredPoints(playerId);
        for (let i = this.MEDALLION_LEVELS.length - 1; i >= 0; i--) {
            if (points >= this.MEDALLION_LEVELS[i].minPoints) {
                return i;
            }
        }
        return 0;
    },
    
    // Get medallion info for display
    getMedallionInfo(playerId) {
        const level = this.getMedallionLevel(playerId);
        const points = this._getStoredPoints(playerId);
        const medallion = this.MEDALLION_LEVELS[level];
        const nextLevel = this.MEDALLION_LEVELS[level + 1];

        return {
            ...medallion,
            level,
            points,
            nextLevelPoints: nextLevel ? nextLevel.minPoints : null,
            progressToNext: nextLevel ? (points - medallion.minPoints) / (nextLevel.minPoints - medallion.minPoints) : 1
        };
    },

    // Create medallion badge HTML element
    createMedallionBadge(playerId, size = 'medium') {
        const info = this.getMedallionInfo(playerId);
        const sizes = { small: '1.5rem', medium: '2.5rem', large: '4rem' };
        const fontSize = sizes[size] || sizes.medium;

        const badge = document.createElement('div');
        badge.className = 'medallion-badge';
        badge.title = `${info.name} (${info.points} pts)`;
        badge.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: ${fontSize};
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        `;
        badge.textContent = info.emoji;

        return badge;
    },

    // Drop medallion level (for bans)
    dropMedallionLevel(playerId) {
        const currentLevel = this.getMedallionLevel(playerId);
        if (currentLevel > 0) {
            const newLevel = currentLevel - 1;
            const newPoints = this.MEDALLION_LEVELS[newLevel].minPoints;
            this._setStoredPoints(playerId, newPoints);
            console.log(`🏅 ${playerId} dropped to ${this.MEDALLION_LEVELS[newLevel].name}`);
        }
    },

    // ============================================================
    // STORAGE (localStorage for now, can be upgraded to server)
    // ============================================================

    _getStoredPoints(playerId) {
        try {
            const data = JSON.parse(localStorage.getItem('fasttrack_medallions') || '{}');
            return data[playerId] || 0;
        } catch (e) {
            return 0;
        }
    },

    _setStoredPoints(playerId, points) {
        try {
            const data = JSON.parse(localStorage.getItem('fasttrack_medallions') || '{}');
            data[playerId] = Math.max(0, points); // Can't go below 0
            localStorage.setItem('fasttrack_medallions', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save medallion points:', e);
        }
    },

    _updateMedallionPoints(playerId, delta) {
        const current = this._getStoredPoints(playerId);
        this._setStoredPoints(playerId, current + delta);
    },

    // Get top players (for Crown status)
    getTopPlayers(count = 10) {
        try {
            const data = JSON.parse(localStorage.getItem('fasttrack_medallions') || '{}');
            return Object.entries(data)
                .sort((a, b) => b[1] - a[1])
                .slice(0, count)
                .map(([id, points]) => ({ playerId: id, points, ...this.getMedallionInfo(id) }));
        } catch (e) {
            return [];
        }
    },

    // Check if player is in top 10 (Crown eligible)
    isCrownEligible(playerId) {
        const top = this.getTopPlayers(10);
        return top.some(p => p.playerId === playerId);
    }
};

// Export
window.PrestigeSystemV2 = PrestigeSystemV2;
console.log('🏅 PrestigeSystemV2 loaded');

