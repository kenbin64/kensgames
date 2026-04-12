/**
 * FastTrack Game Initializer
 * ==========================
 * Clean, unified game initialization system.
 * Handles player setup, AI configuration, and game state creation.
 * 
 * Usage:
 *   GameInit.start({ players: 4, humanName: 'Ken', humanAvatar: '🎮', difficulty: 'normal' });
 * 
 * Or via URL params (quickplay mode):
 *   GameInit.startFromURL();
 */

window.GameInit = (function() {
    'use strict';
    
    // ============================================================
    // CONSTANTS
    // ============================================================
    
    const DEFAULT_CONFIG = {
        minPlayers: 2,
        maxPlayers: 4,
        defaultPlayers: 3,
        defaultHumanName: 'You',
        defaultHumanAvatar: '🎮',
        defaultDifficulty: 'normal'
    };
    
    const AI_BOTS = (function() {
        // Primary: use BoardManifold tech/sci-fi/digital pool
        if (window.BoardManifold) {
            const bots = BoardManifold.pickBots(5);
            return bots.map(b => ({
                name: b.name,
                avatar: b.icon,
                personality: b.name.toLowerCase(),
                manifoldType: 'z=xy',  // default surface
                title: b.title
            }));
        }
        // Fallback: ManifoldAI archetypes
        if (window.ManifoldAI) {
            return window.ManifoldAI.ARCHETYPE_POOL.map(key => {
                const arch = window.ManifoldAI.ARCHETYPES[key];
                return {
                    name: arch.name,
                    avatar: arch.emoji,
                    personality: key,
                    manifoldType: arch.manifold,
                };
            });
        }
        // Last resort
        return [
            { name: 'Turing', avatar: '🖥️', personality: 'turing' },
            { name: 'Ada', avatar: '⌨️', personality: 'ada' },
            { name: 'Nexus', avatar: '🌐', personality: 'nexus' },
            { name: 'Cortex', avatar: '🧠', personality: 'cortex' },
            { name: 'Qubit', avatar: '⚛️', personality: 'qubit' }
        ];
    })();
    
    const PLAYER_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#27ae60', '#9b59b6', '#e67e22'];
    
    // ============================================================
    // STATE
    // ============================================================
    
    let isInitialized = false;
    let currentConfig = null;
    
    // ============================================================
    // HELPERS
    // ============================================================
    
    function log(message, ...args) {
        console.log(`[GameInit] ${message}`, ...args);
    }
    
    function error(message, ...args) {
        console.error(`[GameInit] ERROR: ${message}`, ...args);
    }
    
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    
    function parseURLParams() {
        const params = new URLSearchParams(window.location.search);
        const rawAvatar = params.get('avatar');
        const decodedAvatar = rawAvatar ? decodeURIComponent(rawAvatar) : DEFAULT_CONFIG.defaultHumanAvatar;
        
        log('RAW URL params:', {
            quickplay: params.get('quickplay'),
            players: params.get('players'),
            name: params.get('name'),
            avatar: rawAvatar,
            decodedAvatar: decodedAvatar,
            difficulty: params.get('difficulty')
        });
        
        return {
            quickplay: params.get('quickplay') === '1',
            players: parseInt(params.get('players')) || DEFAULT_CONFIG.defaultPlayers,
            name: params.get('name') || DEFAULT_CONFIG.defaultHumanName,
            avatar: decodedAvatar,
            difficulty: params.get('difficulty') || DEFAULT_CONFIG.defaultDifficulty
        };
    }
    
    // ============================================================
    // GAME STATE CREATION
    // ============================================================
    
    function createGameState(playerCount) {
        log(`Creating game state with ${playerCount} players`);
        
        // Cancel any pending timers from previous games
        if (window.pendingFirstTurnTimers) {
            window.pendingFirstTurnTimers.forEach(id => clearTimeout(id));
        }
        window.pendingFirstTurnTimers = [];
        
        // Update active player count
        window.activePlayerCount = playerCount;
        
        // Create pegs for active players only
        if (typeof window.createPegsAndPlace === 'function') {
            window.createPegsAndPlace(playerCount);
        }
        
        // Create new game state via engine
        if (!window.FastrackEngine || !window.FastrackEngine.GameState) {
            error('FastrackEngine.GameState not found!');
            return null;
        }
        
        const gameState = new window.FastrackEngine.GameState(playerCount);
        
        // Use setter if available (syncs local reference in 3d.html)
        if (typeof window.setGameState === 'function') {
            window.setGameState(gameState);
        } else {
            window.gameState = gameState;
        }
        
        // Determine first player (random)
        gameState.currentPlayerIndex = Math.floor(Math.random() * playerCount);
        log(`First player: ${gameState.currentPlayerIndex}`);
        
        // Initialize from board registry
        if (window.pegRegistry && typeof gameState.initializeFromBoard === 'function') {
            gameState.initializeFromBoard(window.pegRegistry);
        }
        
        // Link engine to substrate events
        if (window.FastrackEngine.linkEngineToSubstrate) {
            window.FastrackEngine.linkEngineToSubstrate(gameState);
        }
        
        return gameState;
    }
    
    // ============================================================
    // PLAYER CONFIGURATION
    // ============================================================
    
    function configureHumanPlayer(gameState, name, avatar) {
        log(`configureHumanPlayer called with name="${name}", avatar="${avatar}"`);
        
        const player = gameState.players[0];
        if (!player) {
            error('Cannot configure human player - player 0 does not exist');
            return false;
        }
        
        log(`Player 0 BEFORE config:`, JSON.stringify({
            name: player.name,
            avatar: player.avatar,
            isAI: player.isAI,
            isHuman: player.isHuman
        }));
        
        player.name = name;
        player.avatar = avatar;
        player.isHuman = true;
        player.isLocal = true;
        player.isAI = false;
        player.isBot = false;
        
        log(`Player 0 AFTER config:`, JSON.stringify({
            name: player.name,
            avatar: player.avatar,
            isAI: player.isAI,
            isHuman: player.isHuman
        }));
        
        log(`Human player configured: "${name}" ${avatar}`);
        return true;
    }
    
    function configureAIPlayers(gameState, difficulty) {
        const playerCount = gameState.players.length;
        const aiIndices = [];
        
        for (let i = 1; i < playerCount; i++) {
            const player = gameState.players[i];
            if (!player) {
                error(`Cannot configure AI player ${i} - does not exist`);
                continue;
            }
            
            const bot = AI_BOTS[(i - 1) % AI_BOTS.length];
            
            player.name = bot.name;
            player.avatar = bot.avatar;
            player.isAI = true;
            player.isBot = true;
            player.isHuman = false;
            player.isLocal = false;
            player.personality = bot.personality;
            player.difficulty = difficulty;
            // Store manifold type on the player object for UI display
            player.manifoldType = bot.manifoldType || null;
            
            aiIndices.push(i);
            log(`AI player ${i} configured: "${bot.name}" ${bot.avatar} (personality: ${bot.personality})`);
        }
        
        // Spawn ManifoldAI entities on their geometric surfaces
        if (window.ManifoldAI && aiIndices.length > 0) {
            log('Spawning ManifoldAI entities on z=xy / z=xy² surfaces...');
            window.ManifoldAI.spawnEntities(aiIndices, difficulty);
            
            // Log the truth tables for debugging
            log('z=xy truth table (AND gate):', JSON.stringify(window.ManifoldAI.truthTable('z=xy', 2)));
            log('z=xy² quadratic table:', JSON.stringify(window.ManifoldAI.truthTable('z=xy2', 2)));
            
            // Log each entity's manifold summary
            aiIndices.forEach(idx => {
                log(window.ManifoldAI.entitySummary(idx));
            });
        } else {
            log('ManifoldAI not available — using legacy AI weights');
        }
        
        return aiIndices;
    }
    
    function updateAIConfig(aiIndices, difficulty) {
        if (!window.AI_CONFIG) {
            window.AI_CONFIG = {};
        }
        
        window.AI_CONFIG.enabled = true;
        window.AI_CONFIG.players = aiIndices;
        window.AI_CONFIG.difficulty = difficulty;
        window.AI_CONFIG.useManifold = !!window.ManifoldAI;  // Enable manifold decision engine
        
        log(`AI_CONFIG updated: players=${JSON.stringify(aiIndices)}, difficulty=${difficulty}, manifold=${window.AI_CONFIG.useManifold}`);
    }
    
    // ============================================================
    // UI SYNCHRONIZATION
    // ============================================================
    
    function syncUI(gameState) {
        log('Syncing UI with game state...');
        log('Players to sync:', JSON.stringify(gameState.players.map(p => ({
            name: p.name,
            avatar: p.avatar,
            isAI: p.isAI,
            isHuman: p.isHuman
        }))));
        
        // Sync GameUIMinimal (hamburger menu + indicator bar)
        if (window.GameUIMinimal) {
            log('Syncing GameUIMinimal with currentPlayerIndex:', gameState.currentPlayerIndex);
            window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
            window.GameUIMinimal.setCurrentPlayer(
                gameState.currentPlayer,
                gameState.currentPlayerIndex
            );
            window.GameUIMinimal.setDeckCount(gameState.currentPlayer?.deck?.remaining || 54);
        }
        
        // Sync CardUI
        if (window.cardUI) {
            log('Syncing CardUI');
            window.cardUI.updateCurrentPlayer(gameState.currentPlayer);
        }
        
        // Show UI elements
        const panels = document.getElementById('player-panels');
        const cards = document.getElementById('card-container');
        if (panels) panels.style.display = 'flex';
        if (cards) cards.style.display = 'block';
        
        // Update phase display
        gameState.phase = 'draw';
        
        log('UI sync complete');
    }
    
    function hideSetupScreens() {
        const screens = ['start-game-screen', 'auth-container', 'lobby-container'];
        screens.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Show game controls
        const exitBtn = document.getElementById('exit-game-btn');
        const momBtn = document.getElementById('mom-help-btn');
        if (exitBtn) exitBtn.style.display = 'flex';
        if (momBtn) momBtn.style.display = 'flex';
    }
    
    // ============================================================
    // FIRST TURN HANDLING
    // ============================================================
    
    function startFirstTurn(gameState) {
        const playerIdx = gameState.currentPlayerIndex;
        const player = gameState.players[playerIdx];
        const isAI = player?.isAI;
        const playerName = player?.name || `Player ${playerIdx + 1}`;
        const playerAvatar = player?.avatar || '👤';
        
        log('==========================================');
        log('startFirstTurn() CALLED');
        log('==========================================');
        log(`Player ${playerIdx}: "${playerName}" ${playerAvatar} isAI=${isAI}`);
        
        // Set phase to draw
        gameState.phase = 'draw';
        log(`gameState.phase set to: ${gameState.phase}`);
        
        // Get player color
        const playerColor = PLAYER_COLORS[playerIdx % PLAYER_COLORS.length];
        
        // Show "X goes first" announcement
        if (typeof window.showFirstPlayerAnnouncement === 'function') {
            log('Showing first player announcement');
            window.showFirstPlayerAnnouncement(`${playerAvatar} ${playerName}`, playerColor, 'random');
        }
        
        // After announcement, show turn banner and enable draw
        setTimeout(() => {
            log(`First turn delay complete, isAI=${isAI}`);
            
            if (isAI) {
                // AI takes turn automatically
                log('AI player - calling aiTakeTurn()');
                if (typeof window.aiTakeTurn === 'function') {
                    window.aiTakeTurn();
                } else {
                    error('aiTakeTurn function not found!');
                }
            } else {
                // Human player - show turn banner and enable deck
                log('Human player - showing turn banner and enabling deck');
                
                // Ensure phase is draw
                gameState.phase = 'draw';
                log('gameState.phase confirmed as draw');
                
                // Show turn banner
                if (typeof window.showTurnBanner === 'function') {
                    log('Calling showTurnBanner()');
                    window.showTurnBanner(`${playerAvatar} ${playerName}`, playerColor, 'Please draw a card');
                } else {
                    log('showTurnBanner not found, trying showTurnBannerCompact');
                    if (typeof window.showTurnBannerCompact === 'function') {
                        window.showTurnBannerCompact(playerIdx);
                    }
                }
                
                // Enable card UI
                if (window.cardUI) {
                    log('Enabling cardUI deck');
                    window.cardUI.setDeckEnabled(true);
                    if (typeof window.cardUI.updateCurrentPlayer === 'function') {
                        window.cardUI.updateCurrentPlayer(player);
                    }
                    log('cardUI deck enabled');
                } else {
                    error('cardUI not found!');
                }
                
                // Enable mobile UI deck
                if (window.mobileUI && typeof window.mobileUI.setDeckDrawReady === 'function') {
                    log('Enabling mobileUI deck');
                    window.mobileUI.setDeckDrawReady(true);
                }
                
                // Update GameUIMinimal
                if (window.GameUIMinimal) {
                    window.GameUIMinimal.setCurrentPlayer(player, playerIdx);
                    // Enlarge deck when it's time to draw
                    if (typeof window.GameUIMinimal.setDeckDrawReady === 'function') {
                        log('Enlarging GameUIMinimal deck for draw phase');
                        window.GameUIMinimal.setDeckDrawReady(true);
                    }
                }
                
                log('==========================================');
                log('HUMAN PLAYER READY TO DRAW');
                log('Click the deck to draw a card!');
                log('==========================================');
            }
        }, 2000); // 2 second delay for announcement
    }

    // ============================================================
    // MAIN API
    // ============================================================
    
    /**
     * Start a new game with the given configuration
     * @param {Object} config - Game configuration
     * @param {number} config.players - Total number of players (2-4)
     * @param {string} config.humanName - Human player's name
     * @param {string} config.humanAvatar - Human player's avatar emoji
     * @param {string} config.difficulty - AI difficulty: 'easy', 'normal', 'hard'
     */
    function start(config = {}) {
        log('==========================================');
        log('START() CALLED');
        log('==========================================');
        log('Raw config received:', JSON.stringify(config));
        
        // Validate and normalize config
        const playerCount = clamp(
            config.players || DEFAULT_CONFIG.defaultPlayers,
            DEFAULT_CONFIG.minPlayers,
            DEFAULT_CONFIG.maxPlayers
        );
        const humanName = config.humanName || DEFAULT_CONFIG.defaultHumanName;
        const humanAvatar = config.humanAvatar || DEFAULT_CONFIG.defaultHumanAvatar;
        const difficulty = config.difficulty || DEFAULT_CONFIG.defaultDifficulty;
        
        log('After normalization:');
        log(`  playerCount: ${playerCount}`);
        log(`  humanName: "${humanName}"`);
        log(`  humanAvatar: "${humanAvatar}"`);
        log(`  difficulty: "${difficulty}"`);
        
        currentConfig = { playerCount, humanName, humanAvatar, difficulty };
        log('Stored currentConfig:', JSON.stringify(currentConfig));
        
        // Hide setup screens
        hideSetupScreens();
        
        // Use existing initGame() which creates gameState, cardUI, and all event handlers
        if (typeof window.initGame === 'function') {
            log('Calling window.initGame(' + playerCount + ')');
            window.initGame(playerCount);
        } else {
            error('window.initGame not found! Falling back to createGameState');
            const gs = createGameState(playerCount);
            if (!gs) {
                error('Failed to create game state');
                return false;
            }
        }
        
        // Get the gameState (either from initGame or createGameState)
        const gameState = window.gameState;
        if (!gameState) {
            error('gameState not available after init');
            return false;
        }
        log('gameState available with ' + gameState.players.length + ' players');
        
        // Configure players
        const humanOk = configureHumanPlayer(gameState, humanName, humanAvatar);
        if (!humanOk) {
            error('Failed to configure human player');
            return false;
        }
        
        const aiIndices = configureAIPlayers(gameState, difficulty);
        updateAIConfig(aiIndices, difficulty);
        
        // Log final player state
        log('Final player configuration:');
        gameState.players.forEach((p, i) => {
            log(`  Player ${i}: "${p.name}" ${p.avatar} | isAI=${p.isAI} isHuman=${p.isHuman}`);
        });
        
        // Sync UI with updated player info
        syncUI(gameState);
        
        // NOTE: initGame() already handles first turn - no need to call startFirstTurn()
        // initGame() shows announcement, enables deck for human, or calls aiTakeTurn() for AI
        log('First turn will be handled by initGame()');
        
        isInitialized = true;
        log('Game initialization complete!');
        
        return true;
    }
    
    /**
     * Start a game using URL parameters (quickplay mode)
     */
    function startFromURL() {
        log('==========================================');
        log('startFromURL() CALLED');
        log('==========================================');
        log('window.location.search:', window.location.search);
        
        const params = parseURLParams();
        log('Parsed URL params:', JSON.stringify(params));
        
        if (!params.quickplay) {
            log('Not in quickplay mode, skipping auto-start');
            return false;
        }
        
        log('QUICKPLAY MODE - calling start() with:');
        log(`  players: ${params.players}`);
        log(`  humanName: "${params.name}"`);
        log(`  humanAvatar: "${params.avatar}"`);
        log(`  difficulty: "${params.difficulty}"`);
        
        return start({
            players: params.players,
            humanName: params.name,
            humanAvatar: params.avatar,
            difficulty: params.difficulty
        });
    }
    
    /**
     * Check if game is ready to initialize
     */
    function isReady() {
        const checks = {
            FastrackEngine: typeof window.FastrackEngine !== 'undefined',
            GameState: typeof window.FastrackEngine?.GameState === 'function',
            GameUIMinimal: typeof window.GameUIMinimal === 'object',
            holeRegistry: window.holeRegistry?.size > 0,
            boardReady: window.boardReady === true
        };
        
        const ready = Object.values(checks).every(v => v);
        
        // Log every check attempt (for debugging)
        const failedChecks = Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k);
        if (!ready && failedChecks.length > 0) {
            // Only log occasionally to avoid spam
            if (Math.random() < 0.1) {
                log('Waiting for:', failedChecks.join(', '));
            }
        }
        
        return ready;
    }
    
    /**
     * Wait for game to be ready, then start from URL params
     */
    function waitAndStart(maxWaitMs = 10000) {
        const startTime = Date.now();
        const checkInterval = 100;
        
        log(`Waiting for game to be ready (max ${maxWaitMs}ms)...`);
        
        const check = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (isReady()) {
                clearInterval(check);
                log(`Game ready after ${elapsed}ms`);
                startFromURL();
            } else if (elapsed >= maxWaitMs) {
                clearInterval(check);
                error(`Timeout waiting for game (${elapsed}ms)`);
            }
        }, checkInterval);
    }
    
    // ============================================================
    // EXPOSE API
    // ============================================================
    
    return {
        start,
        startFromURL,
        isReady,
        waitAndStart,
        
        // Expose for debugging
        get config() { return currentConfig; },
        get initialized() { return isInitialized; },
        
        // Constants
        DEFAULT_CONFIG,
        AI_BOTS,
        PLAYER_COLORS
    };
    
})();

// Log when module loads
console.log('[GameInit] Module loaded');
