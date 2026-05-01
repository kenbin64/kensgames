/**
 * =========================================
 * 🏆 LEADERBOARD SUBSTRATE
 * Per-Game Rankings & Score Tracking
 * =========================================
 *
 * MVP: File-based JSON leaderboards
 * - Per-game leaderboards
 * - Time-based filtering (all-time, this week, today)
 * - Score submission and ranking
 */

const LeaderboardSubstrate = (() => {
    // Storage key prefix
    const STORAGE_KEY_PREFIX = 'leaderboard_';
    const USER_SCORES_KEY = 'user_personal_scores';

    // Time filters
    const TIME_FILTERS = {
        ALL_TIME: 'all_time',
        THIS_WEEK: 'this_week',
        TODAY: 'today'
    };

    // =========================================
    // LEADERBOARD DATA STRUCTURE
    // =========================================
    /**
     * Per-game leaderboard:
     * {
     *   gameId: "fasttrack-v2",
     *   entries: [
     *     { rank: 1, playerName: "Champion", score: 5000, timestamp: 1712700000, avatar: "🏆" },
     *     { rank: 2, playerName: "Challenger", score: 4800, timestamp: 1712699000, avatar: "⚡" }
     *   ]
     * }
     */

    // =========================================
    // INITIALIZE LEADERBOARDS
    // =========================================
    const initializeLeaderboards = () => {
        const games = [
            'fasttrack-v2',
            'fasttrack-5card',
            'brickbreaker-solo',
            'brickbreaker-multi'
        ];

        games.forEach(gameId => {
            const key = STORAGE_KEY_PREFIX + gameId;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, JSON.stringify({
                    gameId: gameId,
                    entries: []
                }));
            }
        });

        // Initialize user personal scores
        if (!localStorage.getItem(USER_SCORES_KEY)) {
            localStorage.setItem(USER_SCORES_KEY, JSON.stringify({}));
        }
    };

    // =========================================
    // SUBMIT GAME SCORE
    // =========================================
    const submitScore = (gameId, playerName, score, metadata = {}) => {
        const key = STORAGE_KEY_PREFIX + gameId;
        const leaderboard = JSON.parse(localStorage.getItem(key) || '{"entries":[]}');

        const entry = {
            playerName: playerName,
            score: score,
            timestamp: Date.now(),
            avatar: metadata.avatar || '🎮',
            playerId: metadata.playerId || Math.random().toString(36).substring(7),
            gameTime: metadata.gameTime || 0, // seconds
            metadata: metadata
        };

        // Add to leaderboard
        leaderboard.entries.push(entry);

        // Sort by score (descending)
        leaderboard.entries.sort((a, b) => b.score - a.score);

        // Keep only top 100
        if (leaderboard.entries.length > 100) {
            leaderboard.entries = leaderboard.entries.slice(0, 100);
        }

        // Add ranks
        leaderboard.entries.forEach((e, i) => e.rank = i + 1);

        localStorage.setItem(key, JSON.stringify(leaderboard));

        // Track personal score
        const personalScores = JSON.parse(localStorage.getItem(USER_SCORES_KEY) || '{}');
        if (!personalScores[gameId]) {
            personalScores[gameId] = [];
        }
        personalScores[gameId].push(entry);
        localStorage.setItem(USER_SCORES_KEY, JSON.stringify(personalScores));

        return entry.rank;
    };

    // =========================================
    // GET LEADERBOARD
    // =========================================
    const getLeaderboard = (gameId, limit = 10, timeFilter = TIME_FILTERS.ALL_TIME) => {
        const key = STORAGE_KEY_PREFIX + gameId;
        const leaderboard = JSON.parse(localStorage.getItem(key) || '{"entries":[]}');

        let entries = leaderboard.entries || [];

        // Apply time filter
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;
        const weekInMs = 7 * dayInMs;

        switch (timeFilter) {
            case TIME_FILTERS.TODAY:
                entries = entries.filter(e => (now - e.timestamp) < dayInMs);
                break;
            case TIME_FILTERS.THIS_WEEK:
                entries = entries.filter(e => (now - e.timestamp) < weekInMs);
                break;
            case TIME_FILTERS.ALL_TIME:
            default:
                // All entries
                break;
        }

        // Sort by score (should already be sorted, but ensure it)
        entries.sort((a, b) => b.score - a.score);

        // Add ranks
        entries.forEach((e, i) => e.rank = i + 1);

        // Return limited results
        return entries.slice(0, limit);
    };

    // =========================================
    // GET PLAYER RANK
    // =========================================
    const getPlayerRank = (gameId, playerName, timeFilter = TIME_FILTERS.ALL_TIME) => {
        const leaderboard = getLeaderboard(gameId, 1000, timeFilter);
        const entry = leaderboard.find(e => e.playerName.toLowerCase() === playerName.toLowerCase());
        return entry ? entry.rank : null;
    };

    // =========================================
    // GET PLAYER HIGH SCORE
    // =========================================
    const getPlayerHighScore = (gameId, playerName) => {
        const key = STORAGE_KEY_PREFIX + gameId;
        const leaderboard = JSON.parse(localStorage.getItem(key) || '{"entries":[]}');

        const playerScores = leaderboard.entries
            .filter(e => e.playerName.toLowerCase() === playerName.toLowerCase())
            .sort((a, b) => b.score - a.score);

        return playerScores.length > 0 ? playerScores[0] : null;
    };

    // =========================================
    // GET PERSONAL SCORES
    // =========================================
    const getPersonalScores = (gameId) => {
        const personalScores = JSON.parse(localStorage.getItem(USER_SCORES_KEY) || '{}');
        return personalScores[gameId] || [];
    };

    // =========================================
    // FORMAT FOR DISPLAY
    // =========================================
    const formatLeaderboardHTML = (gameId, limit = 10, timeFilter = TIME_FILTERS.ALL_TIME) => {
        const leaderboard = getLeaderboard(gameId, limit, timeFilter);

        if (leaderboard.length === 0) {
            return '<p style="color: #94a3b8; text-align: center;">No scores yet. Be the first to play!</p>';
        }

        let html = '<table style="width: 100%; border-collapse: collapse;">';
        html += '<thead><tr style="border-bottom: 2px solid #00b4ff;">';
        html += '<th style="text-align: left; padding: 12px; color: #00b4ff;">Rank</th>';
        html += '<th style="text-align: left; padding: 12px; color: #00b4ff;">Player</th>';
        html += '<th style="text-align: center; padding: 12px; color: #00b4ff;">Score</th>';
        html += '<th style="text-align: center; padding: 12px; color: #00b4ff;">Time</th>';
        html += '</tr></thead><tbody>';

        leaderboard.forEach((entry, i) => {
            const bgColor = i === 0 ? 'rgba(255, 215, 0, 0.1)' : (i === 1 ? 'rgba(192, 192, 192, 0.1)' : (i === 2 ? 'rgba(205, 127, 50, 0.1)' : 'transparent'));
            html += `<tr style="background: ${bgColor}; border-bottom: 1px solid rgba(0, 180, 255, 0.2);">`;
            html += `<td style="padding: 12px; color: #e2e8f0;">${i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : entry.rank))}</td>`;
            html += `<td style="padding: 12px; color: #e2e8f0;"><span style="font-size: 18px; margin-right: 8px;">${entry.avatar}</span>${entry.playerName}</td>`;
            html += `<td style="padding: 12px; color: #00b4ff; text-align: center; font-weight: 700;">${entry.score.toLocaleString()}</td>`;
            html += `<td style="padding: 12px; color: #94a3b8; text-align: center; font-size: 13px;">${formatTimeAgo(entry.timestamp)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        return html;
    };

    // =========================================
    // UTILITY: Format time ago
    // =========================================
    const formatTimeAgo = (timestamp) => {
        const now = Date.now();
        const diff = now - timestamp;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        const date = new Date(timestamp);
        return date.toLocaleDateString();
    };

    // =========================================
    // DEMO: Populate with sample data
    // =========================================
    const populateSampleData = () => {
        const samplePlayers = [
            { name: 'ShadowRunner', avatar: '⚡' },
            { name: 'PhantomWolf', avatar: '🐺' },
            { name: 'EchoKnight', avatar: '⚔️' },
            { name: 'VortexMaster', avatar: '🌀' },
            { name: 'NeonGhost', avatar: '👻' },
            { name: 'IceBreaker', avatar: '❄️' },
            { name: 'SolarFlare', avatar: '☀️' },
            { name: 'NightShade', avatar: '🌙' },
            { name: 'CrimsonFury', avatar: '🔥' },
            { name: 'StormCaller', avatar: '⛈️' }
        ];

        const games = ['fasttrack-v2', 'fasttrack-5card', 'brickbreaker-solo', 'brickbreaker-multi'];

        games.forEach(gameId => {
            samplePlayers.forEach((player, i) => {
                const baseScore = Math.random() * 5000 + 1000;
                const variance = Math.floor(Math.random() * 1000);
                const score = Math.floor(baseScore + variance - (i * 200));

                submitScore(gameId, player.name, Math.max(score, 100), {
                    avatar: player.avatar,
                    gameTime: Math.floor(Math.random() * 3600)
                });
            });
        });

        console.log('Sample leaderboard data populated');
    };

    // =========================================
    // PUBLIC API
    // =========================================
    return {
        initialize: initializeLeaderboards,
        submitScore: submitScore,
        getLeaderboard: getLeaderboard,
        getPlayerRank: getPlayerRank,
        getPlayerHighScore: getPlayerHighScore,
        getPersonalScores: getPersonalScores,
        formatLeaderboardHTML: formatLeaderboardHTML,
        populateSampleData: populateSampleData,
        TIME_FILTERS: TIME_FILTERS,
        formatTimeAgo: formatTimeAgo
    };
})();

// Browser + Node dual export
if (typeof window !== 'undefined') window.LeaderboardSubstrate = LeaderboardSubstrate;
if (typeof module !== 'undefined') module.exports = LeaderboardSubstrate;

// Auto-initialize on load (browser only)
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => LeaderboardSubstrate.initialize());
    } else {
        LeaderboardSubstrate.initialize();
    }
}
