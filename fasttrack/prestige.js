/**
 * Fast Track Prestige System
 * Client-side prestige tracking and badge display
 */

const PrestigeSystem = {
    // Prestige level thresholds
    LEVELS: {
        bronze: { min: 0, color: '#cd7f32', icon: '🥉' },
        silver: { min: 500, color: '#c0c0c0', icon: '🥈' },
        gold: { min: 2000, color: '#ffd700', icon: '🥇' },
        diamond: { min: 5000, color: '#b9f2ff', icon: '💎' },
        platinum: { min: 15000, color: '#e5e4e2', icon: '👑' },
    },
    
    // Points for various actions
    POINTS: {
        game_win: 100,
        game_complete: 20,
        peg_home: 25,
        peg_vanquish: 15,
        fasttrack_use: 10,
        bullseye_land: 20,
        bold_move: 5,
        tournament_win: 500,
        guild_tournament_win: 1000,
    },
    
    // Local storage key
    STORAGE_KEY: 'ft_prestige',
    
    // Current prestige data
    data: {
        points: 0,
        level: 'bronze',
        history: [],
    },
    
    /**
     * Initialize prestige system
     */
    init() {
        this.load();
        console.log(`[Prestige] Initialized: ${this.data.points} pts (${this.data.level})`);
    },
    
    /**
     * Load prestige from local storage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                this.data = JSON.parse(stored);
            }
        } catch (e) {
            console.error('[Prestige] Error loading:', e);
        }
    },
    
    /**
     * Save prestige to local storage
     */
    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.error('[Prestige] Error saving:', e);
        }
    },
    
    /**
     * Award prestige points for an action
     * @param {string} action - Action type (from POINTS)
     * @param {number} multiplier - Optional multiplier
     * @returns {number} Points awarded
     */
    award(action, multiplier = 1) {
        const basePoints = this.POINTS[action] || 0;
        const points = Math.floor(basePoints * multiplier);
        
        if (points <= 0) return 0;
        
        this.data.points += points;
        this.data.history.push({
            action,
            points,
            timestamp: Date.now()
        });
        
        // Keep history limited
        if (this.data.history.length > 100) {
            this.data.history = this.data.history.slice(-100);
        }
        
        // Check for level up
        const newLevel = this.calculateLevel(this.data.points);
        const leveledUp = newLevel !== this.data.level;
        this.data.level = newLevel;
        
        this.save();
        
        // Emit event
        window.dispatchEvent(new CustomEvent('prestige-awarded', {
            detail: { action, points, total: this.data.points, level: this.data.level, leveledUp }
        }));
        
        if (leveledUp) {
            window.dispatchEvent(new CustomEvent('prestige-level-up', {
                detail: { level: newLevel, points: this.data.points }
            }));
        }
        
        console.log(`[Prestige] +${points} for ${action} (total: ${this.data.points})`);
        return points;
    },
    
    /**
     * Calculate prestige level from points
     * @param {number} points
     * @returns {string} Level name
     */
    calculateLevel(points) {
        let level = 'bronze';
        for (const [name, config] of Object.entries(this.LEVELS)) {
            if (points >= config.min) {
                level = name;
            }
        }
        return level;
    },
    
    /**
     * Get points needed for next level
     * @returns {number|null} Points needed, or null if max level
     */
    pointsToNextLevel() {
        const levels = Object.entries(this.LEVELS);
        const currentIdx = levels.findIndex(([name]) => name === this.data.level);
        
        if (currentIdx >= levels.length - 1) {
            return null; // Max level
        }
        
        const nextLevel = levels[currentIdx + 1];
        return nextLevel[1].min - this.data.points;
    },
    
    /**
     * Get current level info
     * @returns {Object}
     */
    getCurrentLevel() {
        return {
            name: this.data.level,
            ...this.LEVELS[this.data.level],
            points: this.data.points,
            toNext: this.pointsToNextLevel()
        };
    },
    
    /**
     * Create prestige badge HTML
     * @param {string} level - Optional level override
     * @param {number} points - Optional points override
     * @returns {string} HTML string
     */
    createBadgeHTML(level = null, points = null) {
        const l = level || this.data.level;
        const p = points !== null ? points : this.data.points;
        const config = this.LEVELS[l];
        
        return `
            <div class="prestige-badge" style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                border-radius: 4px;
                background: ${config.color};
                color: #000;
                font-size: 0.75rem;
                font-weight: 600;
                text-transform: uppercase;
            ">
                <span>${config.icon}</span>
                <span>${l}</span>
                <span style="opacity: 0.7;">${p}</span>
            </div>
        `;
    },
    
    /**
     * Create prestige display for player in-game
     * @param {Object} player - Player object with prestige info
     * @returns {string} HTML string
     */
    createPlayerBadge(player) {
        const level = player.prestige_level || 'bronze';
        const points = player.prestige_points || 0;
        const config = this.LEVELS[level];
        
        return `
            <div class="player-prestige" style="
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 20px;
                background: rgba(0,0,0,0.5);
                font-size: 0.8rem;
            ">
                <span style="font-size: 1.2rem;">${config.icon}</span>
                <span style="color: ${config.color}; font-weight: 600;">${level.toUpperCase()}</span>
                <span style="opacity: 0.7;">${points} pts</span>
            </div>
        `;
    },
    
    /**
     * Sync with server (for authenticated users)
     * @param {WebSocket} socket
     */
    syncWithServer(socket) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        
        // Send local history that hasn't been synced
        for (const entry of this.data.history) {
            if (!entry.synced) {
                socket.send(JSON.stringify({
                    type: 'prestige_action',
                    action: entry.action,
                    multiplier: entry.points / (this.POINTS[entry.action] || 1)
                }));
                entry.synced = true;
            }
        }
        this.save();
    },
    
    /**
     * Update from server data
     * @param {Object} serverData
     */
    updateFromServer(serverData) {
        if (serverData.prestige_points !== undefined) {
            this.data.points = serverData.prestige_points;
        }
        if (serverData.prestige_level) {
            this.data.level = serverData.prestige_level;
        }
        this.save();
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    PrestigeSystem.init();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrestigeSystem;
}
