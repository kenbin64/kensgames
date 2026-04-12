    // ============================================================
    // GAME INTEGRATION
    // ============================================================
    
    // Expose game state globally for multiplayer integration
    window.gameState = null;
    let gameState = null; // Local reference
    // cardUI stub — all methods are no-ops; showMessage delegates to showMsg toast
    const cardUI = new Proxy({}, {
        get(_, prop) {
            if (prop === 'showMessage') return (msg, dur) => showMsg(msg, dur);
            return () => {};
        }
    });
    window.cardUI = cardUI;
    // CardUI constructor stub — needed by GameInit.isReady() check
    window.CardUI = function CardUI() { return cardUI; };
    
    // Setter function so GameInit can update the local gameState reference
    window.setGameState = function(gs) {
        gameState = gs;
        window.gameState = gs;
        console.log('[setGameState] Local and window gameState synced:', !!gameState);
    };
    let legalMoves = [];
    let highlightedHoles = [];
    let highlightsActive = false;  // True while flashing destination holes are shown — blocks camera yanks
    
    // Expose legalMoves to external modules (ask_mom.js)
    // Uses a getter so window.legalMoves always reflects the local variable
    Object.defineProperty(window, 'legalMoves', {
        get() { return legalMoves; },
        set(v) { legalMoves = v; },
        configurable: true
    });
    
    // Track last winner for "winner goes first" on replay
    let lastWinnerIndex = null;
    let isReplayGame = false;
    
    // AI Player Configuration (must be defined before setupPlayerPanels)
    const AI_CONFIG = {
        enabled: true,
        players: [1, 2],  // AI controls players 1 and 2 (0 is human)
        thinkingDelay: 800,  // ms delay before AI makes move (overridden per-entity by ManifoldAI)
        drawDelay: 500,      // ms delay before AI draws card (overridden per-entity by ManifoldAI)
        useManifold: true    // Use ManifoldAI geometric decision engine
    };
    
    // AI Reaction Configuration - reactions AI can send based on turn outcomes
    // Philosophy: ALL bots love the human players. It's just fun and games!
    // They want the game to be exciting and competitive, but it's all in good spirit.
    const AI_REACTIONS = {
        enabled: true,
        probability: 0.75,  // 75% chance AI reacts to events
        // Reactions for positive outcomes (AI did something good)
        positive: [
            { emoji: '🎉', name: 'celebrate' },
            { emoji: '🔥', name: 'fire' },
            { emoji: '💃', name: 'dance' },
            { emoji: '🥳', name: 'party' }
        ],
        // Reactions when AI cuts an opponent — playful, not mean!
        cut: [
            { emoji: '😜', name: 'playful' },
            { emoji: '😏', name: 'smirk' },
            { emoji: '🤭', name: 'oopsie' },
            { emoji: '💅', name: 'sassy' },
            { emoji: '😘', name: 'kiss' }
        ],
        // Reactions for special moves (fasttrack, bullseye)
        special: [
            { emoji: '🔥', name: 'fire' },
            { emoji: '🎉', name: 'celebrate' },
            { emoji: '👏', name: 'clap' },
            { emoji: '⚡', name: 'lightning' },
            { emoji: '🚀', name: 'rocket' }
        ],
        // Reactions when AI gets cut (negative) — good-spirited
        negative: [
            { emoji: '😱', name: 'shock' },
            { emoji: '😤', name: 'determined' },
            { emoji: '🫣', name: 'peekaboo' },
            { emoji: '😅', name: 'sweat' },
            { emoji: '💪', name: 'comeback' }
        ],
        // Reactions for close games / frustration — competitive but fun
        frustration: [
            { emoji: '😤', name: 'determined' },
            { emoji: '😅', name: 'sweat' },
            { emoji: '🥴', name: 'dizzy' },
            { emoji: '🤯', name: 'mindblown' }
        ],
        // NEW: Encouragement — when human makes a great move, bots cheer!
        encouragement: [
            { emoji: '👏', name: 'clap' },
            { emoji: '🔥', name: 'fire' },
            { emoji: '💪', name: 'strong' },
            { emoji: '👀', name: 'watchout' },
            { emoji: '😮', name: 'wow' },
            { emoji: '🫡', name: 'salute' }
        ],
        // NEW: Sportsmanship — when game ends (win or lose)
        sportsmanship: [
            { emoji: '🤝', name: 'handshake' },
            { emoji: '👏', name: 'clap' },
            { emoji: '🎉', name: 'celebrate' },
            { emoji: '💙', name: 'love' },
            { emoji: '🫶', name: 'heart_hands' }
        ],
        // NEW: Game start — friendly welcome
        welcome: [
            { emoji: '👋', name: 'wave' },
            { emoji: '🤗', name: 'hug' },
            { emoji: '😊', name: 'smile' },
            { emoji: '🎮', name: 'gamepad' },
            { emoji: '🎲', name: 'dice' }
        ],
        // NEW: Warpath-specific — intense but still fun/playful
        warpathCut: [
            { emoji: '😈', name: 'revenge' },
            { emoji: '👹', name: 'ogre' },
            { emoji: '🔥', name: 'fire' },
            { emoji: '⚔️', name: 'swords' },
            { emoji: '💀', name: 'dead' },
            { emoji: '😏', name: 'smirk' }
        ]
    };

    // AI Chat Messages — bots express personality with words too!
    // Short, fun, friendly messages bots send as floating text bubbles.
    const AI_CHAT_MESSAGES = {
        // When bot cuts the human
        cut: [
            "Sorry, not sorry! 😜",
            "Oops! My bad! 🤭",
            "Nothing personal! 💕",
            "It's part of the game! 😘",
            "Had to do it! 😅",
            "I still love you tho! 💙",
            "Gotcha! Good sport? 🤗",
            "Tag, you're it! 😝"
        ],
        // When human makes a great move
        encouragement: [
            "Nice move! 👏",
            "Wow, impressive! 🔥",
            "You're on fire! ⚡",
            "Watch out for this one! 👀",
            "Great play! 💪",
            "Ooh, smart move! 🧠",
            "That was slick! 😎"
        ],
        // When human cuts a bot
        gotCut: [
            "Nooo! Well played! 😅",
            "I'll be back! 💪",
            "You got me! Good one! 👏",
            "Ouch! But respect! 🫡",
            "Fair play, fair play! 🤝",
            "Revenge will be sweet! 😤",
            "Okay okay, nice one! 😂"
        ],
        // Game start greetings
        welcome: [
            "Let's have fun! 🎮",
            "May the best player win! 🏆",
            "Good luck everyone! 🍀",
            "Let's gooo! 🚀",
            "Ready to play! 🎲",
            "This is gonna be great! 😊"
        ],
        // When human wins (sportsmanship)
        humanWins: [
            "GG! You earned it! 🏆",
            "Well played! Great game! 👏",
            "You're too good! 🙌",
            "Champion! Rematch? 😄",
            "Amazing game! You win! 🎉",
            "Respect! Great playing! 🫡"
        ],
        // When bot wins (humble)
        botWins: [
            "GG! That was close! 🤝",
            "Fun game! Rematch? 😊",
            "Great game everyone! 🎉",
            "That was exciting! 🔥",
            "Good game! You almost had me! 💪"
        ],
        // Warpath-specific cut messages — intense but fun
        warpathCut: [
            "COMING FOR YOU! 😈🔥",
            "No mercy! Just kidding... kinda! 👹",
            "You knew this was coming! ⚔️",
            "Warpath activated! 💥",
            "Run! Just kidding, love you! 😘💀"
        ],
        // Warpath got cut — dramatic but fun
        warpathGotCut: [
            "You dare?! ...respect tho 💪",
            "I'LL REMEMBER THIS! 😤🔥",
            "The hunter becomes the hunted! 😱",
            "Okay that was actually good 👏",
            "This isn't over! 😈"
        ],
        // When bot enters safe zone or scores
        selfCelebrate: [
            "Safe! Finally! 😅",
            "Made it! 🎉",
            "One step closer! 💪",
            "Catch me if you can! 😜"
        ]
    };
    
    // Game Configuration for Human Players
    const GAME_CONFIG = {
        difficulty: 'easy',       // 'easy', 'normal', 'hard', 'expert', 'warpath'
        autoMoveForHumans: true,  // Auto-execute when only one legal move (no choice needed)
        autoMoveDelay: 500,       // ms delay before auto-executing single move
        showHighlights: true,     // Show legal move highlights
        showMoveAids: true,       // Show move helper popups
        hintMode: 'blink',        // 'blink' = blinking holes, 'dropdown' = suggestion list, 'voice' = audio hints, 'all' = all modes, 'none' = no hints
        // Whether to auto-show the Mom introduction modal at game start.
        // Default: false — helpers are off by default; players can open Ask Mom with the Help button.
        showMomIntro: false,
        ftAutoTraverse: false,    // FastTrack auto-traverse: true = auto-move FT pegs around ring, false = manual choice each turn
        suggestionsDisabled: false // When true, move suggestion popups are suppressed — player uses blinking holes only
    };
    
    // Difficulty presets - AI strategy scaling
    // Maps to setup page values: easy, normal, hard, expert, warpath
    const DIFFICULTY_PRESETS = {
        easy: {
            autoMoveForHumans: true,
            showHighlights: true,
            showMoveAids: true,
            // AI Strategy Multipliers (higher = more aggressive/smart)
            aiCutPriority: 0.0,           // NEVER targets opponents — only cuts when it's the ONLY legal move
            aiBullseyeCutPriority: 0.0,   // Never steals bullseye intentionally
            aiDefensiveAwareness: 0.3,    // Doesn't avoid vulnerable spots well
            aiOffensiveAwareness: 0.0,    // Doesn't set up attacks
            ai4CardStrategy: 0.3,         // Basic backward positioning
            aiFastTrackPriority: 0.7,     // Uses FastTrack but not aggressively
            aiFTLeaveToCut: false,        // NEVER leaves FT to cut
            aiRandomFactor: 0.3,          // Some randomness - makes mistakes
            aiDescription: 'Lenient AI - learning mode'
        },
        normal: {
            autoMoveForHumans: false,
            showHighlights: true,
            showMoveAids: true,
            // Fair but firm — cuts when strategic
            aiCutPriority: 1.0,           // Normal cutting - strategic only
            aiBullseyeCutPriority: 1.0,   // Takes bullseye opportunities
            aiDefensiveAwareness: 1.0,    // Avoids vulnerable positions
            aiOffensiveAwareness: 1.0,    // Sets up attack positions
            ai4CardStrategy: 1.0,         // Good backward positioning
            aiFastTrackPriority: 1.0,     // Strategic FastTrack use
            aiFTLeaveToCut: true,         // Will leave FT to cut IF strategically beneficial
            aiRandomFactor: 0.1,          // Slight randomness
            aiDescription: 'Fair but firm AI - cuts when strategic'
        },
        hard: {
            autoMoveForHumans: false,
            showHighlights: true,
            showMoveAids: true,
            // Aggressive — targets opponents when opportunity presents
            aiCutPriority: 2.0,           // Aggressively hunts cuts
            aiBullseyeCutPriority: 2.0,   // Prioritizes bullseye theft
            aiDefensiveAwareness: 1.5,    // Avoids vulnerable positions well
            aiOffensiveAwareness: 1.5,    // Sets up attack positions actively
            ai4CardStrategy: 1.5,         // Expert backward positioning
            aiFastTrackPriority: 1.2,     // Optimal FastTrack decisions
            aiFTLeaveToCut: true,         // Will leave FT to cut opponents
            aiRandomFactor: 0.05,         // Minimal randomness
            aiDescription: 'Aggressive AI - targets opponents when possible'
        },
        expert: {
            autoMoveForHumans: false,
            showHighlights: false,
            showMoveAids: false,
            // Ruthless — optimal play + aggressive targeting
            aiCutPriority: 3.0,           // Actively hunts all cut opportunities
            aiBullseyeCutPriority: 3.0,   // Prioritizes bullseye theft strongly
            aiDefensiveAwareness: 2.0,    // Never lands in vulnerable spots
            aiOffensiveAwareness: 2.0,    // Always sets up attacks
            ai4CardStrategy: 2.0,         // Expert backward positioning
            aiFastTrackPriority: 1.5,     // Optimal FastTrack decisions
            aiFTLeaveToCut: true,         // Will leave FT to cut opponents
            aiRandomFactor: 0.0,          // No mistakes - pure optimization
            aiDescription: 'Expert AI - ruthless and optimal'
        },
        warpath: {
            autoMoveForHumans: false,
            showHighlights: false,
            showMoveAids: false,
            // WARPATH — cutting opponents is the #1 goal, even at own expense
            aiCutPriority: 5.0,           // OBSESSED with cutting — main goal
            aiBullseyeCutPriority: 5.0,   // Bullseye theft is top priority
            aiDefensiveAwareness: 0.5,    // Ignores own safety — offense only
            aiOffensiveAwareness: 3.0,    // Always positioning to attack
            ai4CardStrategy: 2.0,         // Uses 4-card aggressively
            aiFastTrackPriority: 0.5,     // Will EXIT FT to chase opponents
            aiFTLeaveToCut: true,         // Always leaves FT if cut is available
            aiRandomFactor: 0.0,          // No mistakes - pure aggression
            aiDescription: 'WARPATH AI - hunting you down at all costs'
        }
    };
    
    // Backward compatibility: map old names
    DIFFICULTY_PRESETS.intermediate = DIFFICULTY_PRESETS.normal;
    
    // Apply difficulty settings
    function applyDifficultySettings(difficulty) {
        const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.easy;
        GAME_CONFIG.difficulty = difficulty;
        GAME_CONFIG.autoMoveForHumans = preset.autoMoveForHumans;
        GAME_CONFIG.showHighlights = preset.showHighlights;
        GAME_CONFIG.showMoveAids = preset.showMoveAids;
        console.log(`🎮 Applied difficulty: ${difficulty}`, GAME_CONFIG);
    }
    
    // Select difficulty (called from start screen)
    window.selectDifficulty = function(difficulty) {
        // Update UI
        document.querySelectorAll('.difficulty-option').forEach(el => {
            el.classList.remove('selected');
        });
        const selected = document.querySelector(`.difficulty-option[data-difficulty="${difficulty}"]`);
        if (selected) {
            selected.classList.add('selected');
        }
        // Apply settings
        applyDifficultySettings(difficulty);
    };
    
    // Get current difficulty preset
    function getDifficultyPreset() {
        return DIFFICULTY_PRESETS[GAME_CONFIG.difficulty] || DIFFICULTY_PRESETS.easy;
    }
    
    // ============================================================
    // PRIVATE GAME & LOBBY SYSTEM
    // WebSocket connection to lobby server for private games
    // ============================================================
    
    let lobbyWebSocket = null;
    let currentGameMode = 'solo';
    let privateSessionData = null;
    let isLobbyHost = false;
    let myUsername = 'Player';
    let myUserId = null;
    
    // Player avatars for slots
    const slotAvatars = ['🦊', '🐢', '🦄', '🐻'];
    
    // Lightweight toast message (standalone, no CardUI dependency)
    function showMsg(msg, duration) {
        console.log('[Message]', msg);
        const toast = document.createElement('div');
        
        // Special styling for "No legal moves" message - make it more prominent
        const isNoLegalMoves = msg.toLowerCase().includes('no legal moves');
        const bgColor = isNoLegalMoves ? 'rgba(220, 38, 38, 0.95)' : 'rgba(0,0,0,0.88)';
        const borderColor = isNoLegalMoves ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255,255,255,0.2)';
        const fontSize = isNoLegalMoves ? '22px' : '16px';
        const padding = isNoLegalMoves ? '20px 40px' : '12px 28px';
        const boxShadow = isNoLegalMoves ? '0 0 30px rgba(220, 38, 38, 0.6), 0 4px 20px rgba(0,0,0,0.5)' : 'none';
        
        toast.style.cssText = `
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            background:${bgColor}; color:#fff; padding:${padding};
            border-radius:12px; font-size:${fontSize}; font-weight:700;
            z-index:20000; pointer-events:none; text-align:center;
            border:2px solid ${borderColor};
            box-shadow:${boxShadow};
            animation: toastFade ${duration || 2500}ms ease-in-out forwards;
            font-family: 'Press Start 2P', monospace;
            letter-spacing: 1px;
        `;
        
        // Add icon for no legal moves
        if (isNoLegalMoves) {
            toast.innerHTML = `<div style="font-size:32px; margin-bottom:10px;">🚫</div>${msg}`;
        } else {
            toast.textContent = msg;
        }
        
        // Inject animation if not present
        if (!document.getElementById('toast-anim-css')) {
            const s = document.createElement('style');
            s.id = 'toast-anim-css';
            s.textContent = '@keyframes toastFade{0%{opacity:0;transform:translate(-50%,-50%) scale(0.8)}10%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}15%{transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(0.9)}}';
            document.head.appendChild(s);
        }
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration || 2500);
    }
    
    // Connect to lobby server
    function connectToLobby() {
        if (lobbyWebSocket && lobbyWebSocket.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname;
            const port = host === 'localhost' || host === '127.0.0.1' ? ':8765' : '';
            const wsUrl = `${protocol}//${host}${port}/ws`;
            
            console.log('[Lobby] Connecting to:', wsUrl);
            lobbyWebSocket = new WebSocket(wsUrl);
            
            lobbyWebSocket.onopen = () => {
                console.log('[Lobby] Connected');
                // Auto-login as guest
                myUsername = 'Player' + Math.floor(Math.random() * 9999);
                myUserId = 'guest_' + Date.now();
                lobbyWebSocket.send(JSON.stringify({
                    type: 'guest_login',
                    name: myUsername
                }));
                resolve();
            };
            
            lobbyWebSocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleLobbyMessage(data);
                } catch (e) {
                    console.error('[Lobby] Parse error:', e);
                }
            };
            
            lobbyWebSocket.onclose = () => {
                console.log('[Lobby] Disconnected');
                lobbyWebSocket = null;
            };
            
            lobbyWebSocket.onerror = (err) => {
                console.error('[Lobby] WebSocket error:', err);
                reject(err);
            };
            
            // Timeout
            setTimeout(() => {
                if (lobbyWebSocket && lobbyWebSocket.readyState !== WebSocket.OPEN) {
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
        });
    }
    
    // 🌊 DIMENSIONAL: Lobby message intent manifold (replaces switch statement)
    const LobbyMessageIntents = {
        connected: (data) => {
            myUserId = data.user?.user_id ?? data.user_id;
            myUsername = data.user?.username ?? data.username;
            console.log('[Lobby] Authenticated as:', myUsername, myUserId);
        },
        welcome: (data) => LobbyMessageIntents.connected(data),
        guest_joined: (data) => LobbyMessageIntents.connected(data),
        auth_success: (data) => LobbyMessageIntents.connected(data),

        session_created: (data) => {
            privateSessionData = data.session;
            isLobbyHost = true;
            showPrivateLobby(data.session, data.share_code, data.share_url);
        },

        session_joined: (data) => {
            privateSessionData = data.session;
            isLobbyHost = data.session.host_id === myUserId;
            showPrivateLobby(data.session, data.session.session_code,
                `https://kensgames.com/fasttrack/join.html?code=${data.session.session_code}`);
        },

        join_request: (data) => {
            isLobbyHost && addPendingRequest(data.player);
            isLobbyHost && addSystemChat(`${data.player.username} is requesting to join...`);
        },

        join_request_cancelled: (data) => {
            removePendingRequest(data.user_id);
            addSystemChat(`${data.username} withdrew their request.`);
        },

        player_joined: (data) => {
            privateSessionData && (privateSessionData.players = data.players ?? privateSessionData.players);
            privateSessionData && updatePlayersWaiting();
            const name = data.player?.username ?? data.username ?? 'Someone';
            privateSessionData && addSystemChat(`${name} joined the game!`);
        },

        player_left: (data) => {
            privateSessionData && (privateSessionData.players = data.players ?? privateSessionData.players);
            privateSessionData && updatePlayersWaiting();
            privateSessionData && addSystemChat(`${data.username} left the game.`);
        },

        player_ready_changed: (data) => {
            privateSessionData && (privateSessionData.players = data.players ?? privateSessionData.players);
            privateSessionData && updatePlayersWaiting();
            privateSessionData && updateMyReadyButton();
            const status = data.ready ? '✅ ready' : '⬜ not ready';
            privateSessionData && addSystemChat(`${data.username} is now ${status}`);
        },

        player_kicked: (data) => {
            privateSessionData && (privateSessionData.players = data.players ?? privateSessionData.players);
            privateSessionData && updatePlayersWaiting();
            privateSessionData && addSystemChat(`${data.username} was removed by the host.`);
        },

        kicked: (data) => {
            hidePrivateLobby();
            privateSessionData = null;
            isLobbyHost = false;
            const startScreen = document.getElementById('start-game-screen');
            startScreen && (startScreen.style.display = 'flex');
            showMsg(data.reason ?? 'You were removed from the game.', 4000);
        },

        session_settings_updated: (data) => {
            privateSessionData && (privateSessionData.settings = data.settings);
            privateSessionData && (privateSessionData.max_players = data.max_players);
            privateSessionData && data.session && (privateSessionData = data.session);
            privateSessionData && updatePlayersWaiting();
            privateSessionData && updateHostSettingsUI();
            // Apply music setting
            (data.settings.music_enabled === false && typeof MusicSubstrate !== 'undefined') &&
                MusicSubstrate.pause?.();
            privateSessionData && addSystemChat('Host updated game settings.');
        },

        chat: (data) => addChatMessage(data.username, data.message, data.timestamp),

        game_starting: (data) => {
            addSystemChat('Game is starting!');
            ObservationSubstrate.after(() => {
                hidePrivateLobby();
                startMultiplayerGame(data.session ?? privateSessionData);
            }, 1000);
        },
        game_started: (data) => LobbyMessageIntents.game_starting(data),

        late_join_request: (data) => {
            (isLobbyHost || gameSessionSettings.isOrganizer) &&
                addJoinRequest(data.player.user_id, data.player.username, data.player.avatar_id ?? '👤');
        },

        late_player_joined: (data) => {
            data.session && (privateSessionData = data.session);
            data.session && (multiplayerSession = data.session);

            (gameState && data.player) && (() => {
                const p = data.player;
                const slot = data.assigned_slot;
                const slotType = data.slot_type;
                const avatarEmojis = { person_smile:'😊', person_cool:'😎', animal_lion:'🦁', animal_fox:'🦊', space_rocket:'🚀', fantasy_dragon:'🐲', scifi_robot:'🤖', sport_soccer:'⚽' };
                const playerColors = ['#ff2020', '#2196ff', '#4caf50', '#ffeb3b', '#ff9800', '#9c27b0'];

                (slotType === 'replace-bot' && gameState.players[slot]) ? (() => {
                    gameState.players[slot].isAI = false;
                    gameState.players[slot].name = p.username;
                    gameState.players[slot].avatar = avatarEmojis[p.avatar_id] ?? '👤';
                    gameState.players[slot].userId = p.user_id;
                })() : (() => {
                    const newPlayer = {
                        name: p.username,
                        avatar: avatarEmojis[p.avatar_id] ?? '👤',
                        userId: p.user_id,
                        colorHex: playerColors[slot % playerColors.length],
                        isAI: false,
                        pegs: [],
                        pegsInHolding: 4,
                        pegsInSafeZone: 0,
                        pegsInBullseye: 0
                    };
                    (slot < gameState.players.length) ?
                        (gameState.players[slot] = newPlayer) :
                        gameState.players.push(newPlayer);
                    (typeof initializePegsForPlayer === 'function') && initializePegsForPlayer(slot);
                    activePlayerCount = gameState.players.length;
                })();

                window.GameUIMinimal?.setPlayers?.(gameState.players, gameState.currentPlayerIndex);
                showBotAlert(`${p.username} Joined!`, 'A new player has entered the game');
                updateOrganizerPlayerList();
            })();
        },

        game_state_sync: (data) => {
            (data.game_state && typeof applyRemoteGameState === 'function') &&
                applyRemoteGameState(data.game_state);
        },

        error: (data) => {
            showMsg(data.message ?? 'Error occurred', 3000);
            console.error('[Lobby] Error:', data.message);
        }
    };

    // 🌊 DIMENSIONAL: Invoke intent directly (replaces switch statement)
    function handleLobbyMessage(data) {
        console.log('[Lobby] Received:', data.type, data);
        LobbyMessageIntents[data.type]?.(data);
    }
    
    // Game mode selection
    window.selectGameMode = function(mode) {
        // Solo → redirect to ai_setup.html (dedicated setup wizard)
        if (mode === 'solo') {
            window.location.href = 'ai_setup.html';
            return;
        }
        
        currentGameMode = mode;
        
        // Update UI
        document.querySelectorAll('.game-mode-btn').forEach(el => {
            el.classList.remove('selected');
        });
        const selected = document.querySelector(`.game-mode-btn[data-mode="${mode}"]`);
        if (selected) selected.classList.add('selected');
        
        // Show/hide relevant sections
        const privateSection = document.getElementById('private-game-section');
        const matchmakingStatus = document.getElementById('matchmaking-status');
        
        if (privateSection) privateSection.style.display = mode === 'private' ? 'block' : 'none';
        if (matchmakingStatus) matchmakingStatus.style.display = 'none';
        
        // Update start button
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            if (mode === 'quickmatch') {
                startBtn.textContent = '🔍 FIND MATCH';
                startBtn.style.display = 'block';
                startBtn.onclick = () => joinMatchmaking();
            } else if (mode === 'private') {
                startBtn.style.display = 'none';
            }
        }
    };
    
    // Generate a random 6-character game code
    function generateGameCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I/L
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // Create private game
    window.createPrivateGame = async function() {
        // Generate code immediately for quickplay/offline mode
        const localCode = generateGameCode();
        
        // Show loading state
        const createBtn = document.querySelector('.private-btn.create');
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';
        }
        
        try {
            // Try connecting to server for online multiplayer
            await connectToLobby();
            
            // Read host settings
            const maxPlayersEl = document.getElementById('private-max-players');
            const allowBotsEl = document.getElementById('private-allow-bots');
            const musicEnabledEl = document.getElementById('private-music-enabled');
            const allowLateJoinEl = document.getElementById('private-allow-late-join');
            const maxPlayers = maxPlayersEl ? parseInt(maxPlayersEl.value) : 4;
            const allowBots = allowBotsEl ? allowBotsEl.checked : true;
            const musicEnabled = musicEnabledEl ? musicEnabledEl.checked : true;
            const allowLateJoin = allowLateJoinEl ? allowLateJoinEl.checked : true;
            
            lobbyWebSocket.send(JSON.stringify({
                type: 'create_session',
                private: true,
                max_players: maxPlayers,
                settings: {
                    difficulty: GAME_CONFIG.difficulty,
                    allow_bots: allowBots,
                    music_enabled: musicEnabled,
                    allow_late_join: allowLateJoin
                }
            }));
            
            // Reset button (will be hidden when lobby shows anyway)
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = 'Create New Game';
            }
            
        } catch (err) {
            console.error('[Private] Server unavailable, using local code:', localCode);
            
            // Reset button
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = 'Create New Game';
            }
            
            // Show the join URL with locally-generated code
            const joinUrl = `/fasttrack/join.html?code=${localCode}`;
            const fullUrl = window.location.origin + joinUrl;
            
            // Create local session data
            const localSession = {
                session_id: 'local_' + Date.now(),
                session_code: localCode,
                host_id: myUserId || 'local_host',
                players: [{
                    user_id: myUserId || 'local_host',
                    username: myUsername || 'Host',
                    is_host: true
                }],
                max_players: 4,
                isLocal: true
            };
            
            privateSessionData = localSession;
            isLobbyHost = true;
            
            // Show the private lobby with the code
            showPrivateLobby(localSession, localCode, fullUrl);
            
            showMsg('Game created! Share code: ' + localCode, 4000);
        }
    };
    
    // Join private game by code
    window.joinPrivateGame = async function() {
        const codeInput = document.getElementById('join-code-input');
        const code = (codeInput?.value || '').toUpperCase().trim();
        
        if (!code || code.length < 4) {
            cardUI?.showMessage('Please enter a valid code', 2000);
            return;
        }
        
        try {
            await connectToLobby();
            
            lobbyWebSocket.send(JSON.stringify({
                type: 'join_by_code',
                code: code
            }));
            
        } catch (err) {
            console.error('[Private] Failed to join:', err);
            cardUI?.showMessage('Failed to connect to server', 3000);
        }
    };
    
    // Show private lobby interface
    function showPrivateLobby(session, code, url) {
        const lobby = document.getElementById('private-lobby');
        const startScreen = document.getElementById('start-game-screen');
        
        if (startScreen) startScreen.style.display = 'none';
        if (lobby) lobby.classList.add('visible');
        
        // Update code display
        const codeDisplay = document.getElementById('private-share-code');
        if (codeDisplay) codeDisplay.textContent = code || '------';
        
        // Update URL — ensure absolute
        let fullUrl = url || `/fasttrack/join.html?code=${code}`;
        if (fullUrl.startsWith('/')) fullUrl = window.location.origin + fullUrl;
        const urlInput = document.getElementById('private-share-url');
        if (urlInput) urlInput.value = fullUrl;
        
        // Show/hide host-only UI
        const hostSettings = document.getElementById('lobby-host-settings');
        const pendingSection = document.getElementById('pending-requests-section');
        if (hostSettings) hostSettings.style.display = isLobbyHost ? 'block' : 'none';
        if (pendingSection) pendingSection.style.display = isLobbyHost ? 'none' : 'none'; // shown when requests arrive
        
        // Update players
        privateSessionData = session;
        updatePlayersWaiting();
        updateMyReadyButton();
        updateHostSettingsUI();
        updateStartButton();
    }
    
    function hidePrivateLobby() {
        const lobby = document.getElementById('private-lobby');
        if (lobby) lobby.classList.remove('visible');
    }
    
    // Update host settings UI to reflect current state
    function updateHostSettingsUI() {
        if (!privateSessionData) return;
        const settings = privateSessionData.settings || {};
        const musicBtn = document.getElementById('toggle-music-all-btn');
        if (musicBtn) {
            const on = settings.music_enabled !== false;
            musicBtn.textContent = on ? '🎵 Music: ON' : '🔇 Music: OFF';
            musicBtn.style.background = on ? '#7c3aed' : '#555';
        }
        const maxCountEl = document.getElementById('max-player-count');
        if (maxCountEl) maxCountEl.textContent = privateSessionData.max_players || 4;
        
        // Hide add AI if bots not allowed
        const addAiBtn = document.getElementById('add-ai-btn');
        if (addAiBtn) {
            addAiBtn.style.display = settings.allow_bots === false ? 'none' : 'inline-block';
        }
    }
    
    // Update players waiting display
    function updatePlayersWaiting() {
        if (!privateSessionData) return;
        
        const players = privateSessionData.players || [];
        const maxPlayers = privateSessionData.max_players || 4;
        const container = document.getElementById('players-waiting');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Render filled slots
        players.forEach((player, idx) => {
            const isMe = player.user_id === myUserId;
            const readyState = player.is_ai ? true : player.ready;
            const readyIcon = readyState ? '✅' : '⬜';
            const readyText = player.is_ai ? 'Bot' : (readyState ? 'Ready' : 'Not Ready');
            const readyColor = readyState ? '#4ade80' : '#f59e0b';
            
            let kickHtml = '';
            if (isLobbyHost && !player.is_host && !player.is_ai) {
                kickHtml = `<button onclick="kickPlayer('${player.user_id}')" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;margin-left:auto;">Boot</button>`;
            } else if (isLobbyHost && player.is_ai) {
                kickHtml = `<button onclick="kickPlayer('${player.user_id}')" style="background:#666;color:#fff;border:none;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;margin-left:auto;">Remove</button>`;
            }
            
            const slot = document.createElement('div');
            slot.className = `waiting-player-slot filled ${player.is_host ? 'host' : ''}`;
            slot.innerHTML = `
                <div class="slot-avatar">${player.is_ai ? '🤖' : (slotAvatars[idx] || '👤')}</div>
                <div style="flex:1;">
                    <div class="slot-name">${escapeHtml(player.username)}${player.is_host ? ' (Host)' : ''}${isMe ? ' (You)' : ''}</div>
                    <div class="slot-status" style="color:${readyColor};font-size:12px;">${readyIcon} ${readyText}</div>
                </div>
                ${kickHtml}
            `;
            container.appendChild(slot);
        });
        
        // Render empty slots
        for (let i = players.length; i < maxPlayers; i++) {
            const slot = document.createElement('div');
            slot.className = 'waiting-player-slot empty';
            slot.innerHTML = `
                <div class="slot-avatar">⏳</div>
                <div style="flex:1;">
                    <div class="slot-name">Waiting...</div>
                    <div class="slot-status" style="font-size:12px;"></div>
                </div>
            `;
            container.appendChild(slot);
        }
        
        // Update player count
        const countEl = document.getElementById('player-count');
        if (countEl) countEl.textContent = players.length;
        const maxCountEl = document.getElementById('max-player-count');
        if (maxCountEl) maxCountEl.textContent = maxPlayers;
        
        updateStartButton();
    }
    
    function updateStartButton() {
        const btn = document.getElementById('start-private-game-btn');
        if (!btn) return;
        
        const players = privateSessionData?.players || [];
        const playerCount = players.length;
        const allReady = players.every(p => p.is_ai || p.ready);
        const canStart = isLobbyHost && playerCount >= 2 && allReady;
        
        btn.disabled = !canStart;
        if (playerCount < 2) {
            btn.textContent = `Start Game (Need ${Math.max(0, 2 - playerCount)} more)`;
        } else if (!allReady) {
            const notReady = players.filter(p => !p.is_ai && !p.ready).map(p => p.username);
            btn.textContent = `Waiting for: ${notReady.join(', ')}`;
        } else if (!isLobbyHost) {
            btn.textContent = 'Waiting for host to start...';
        } else {
            btn.textContent = '🎮 Start Game!';
        }
    }
    
    // Ready toggle
    let myReady = false;
    window.toggleMyReady = function() {
        if (!lobbyWebSocket || !privateSessionData) return;
        lobbyWebSocket.send(JSON.stringify({ type: 'toggle_ready' }));
    };
    
    function updateMyReadyButton() {
        const btn = document.getElementById('my-ready-btn');
        if (!btn || !privateSessionData) return;
        const me = privateSessionData.players?.find(p => p.user_id === myUserId);
        if (!me) return;
        myReady = me.ready;
        if (myReady) {
            btn.textContent = '✅ Ready!';
            btn.style.background = 'rgba(74, 222, 128, 0.3)';
            btn.style.borderColor = '#4ade80';
            btn.style.color = '#4ade80';
        } else {
            btn.textContent = '⬜ Not Ready';
            btn.style.background = 'rgba(100,100,100,0.3)';
            btn.style.borderColor = '#666';
            btn.style.color = '#aaa';
        }
    }
    
    // Pending request management (host only)
    let pendingPlayers = [];
    
    function addPendingRequest(player) {
        pendingPlayers.push(player);
        renderPendingRequests();
    }
    
    function removePendingRequest(userId) {
        pendingPlayers = pendingPlayers.filter(p => p.user_id !== userId);
        renderPendingRequests();
    }
    
    function renderPendingRequests() {
        const section = document.getElementById('pending-requests-section');
        const list = document.getElementById('pending-requests-list');
        if (!section || !list) return;
        
        if (pendingPlayers.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'block';
        
        list.innerHTML = pendingPlayers.map(p => `
            <div style="display:flex;align-items:center;gap:10px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:10px 14px;">
                <span style="font-size:24px;">👤</span>
                <div style="flex:1;">
                    <div style="font-weight:bold;color:#fff;">${escapeHtml(p.username)}</div>
                    <div style="font-size:12px;color:#f59e0b;">Wants to join</div>
                </div>
                <button onclick="approvePlayer('${p.user_id}')" style="background:#22c55e;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:13px;font-weight:bold;cursor:pointer;">✓ Accept</button>
                <button onclick="rejectPlayer('${p.user_id}')" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;">✗ Deny</button>
            </div>
        `).join('');
    }
    
    window.approvePlayer = function(userId) {
        if (!lobbyWebSocket) return;
        lobbyWebSocket.send(JSON.stringify({ type: 'approve_player', user_id: userId }));
        removePendingRequest(userId);
    };
    
    window.rejectPlayer = function(userId) {
        if (!lobbyWebSocket) return;
        lobbyWebSocket.send(JSON.stringify({ type: 'reject_player', user_id: userId }));
        removePendingRequest(userId);
    };
    
    window.kickPlayer = function(userId) {
        if (!lobbyWebSocket || !isLobbyHost) return;
        lobbyWebSocket.send(JSON.stringify({ type: 'kick_player', user_id: userId }));
    };
    
    // Add AI player (host only)
    window.addAIPlayer = function() {
        if (!lobbyWebSocket || !isLobbyHost) return;
        lobbyWebSocket.send(JSON.stringify({ type: 'add_ai_player', level: 'medium' }));
    };
    
    // Toggle music for all (host only)
    window.toggleMusicForAll = function() {
        if (!lobbyWebSocket || !isLobbyHost || !privateSessionData) return;
        const current = privateSessionData.settings?.music_enabled !== false;
        lobbyWebSocket.send(JSON.stringify({
            type: 'update_session_settings',
            settings: { music_enabled: !current }
        }));
    };
    
    // Copy share URL
    window.copyShareUrl = function() {
        const urlInput = document.getElementById('private-share-url');
        if (!urlInput) return;
        
        navigator.clipboard.writeText(urlInput.value).then(() => {
            const btn = document.getElementById('copy-url-btn');
            if (btn) {
                btn.textContent = '✓ Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = '📋 Copy';
                    btn.classList.remove('copied');
                }, 2000);
            }
            cardUI?.showMessage('Link copied!', 1500);
        }).catch(err => {
            console.error('Copy failed:', err);
            // Fallback
            urlInput.select();
            document.execCommand('copy');
            cardUI?.showMessage('Link copied!', 1500);
        });
    };
    
    // Social share functions
    window.shareVia = function(platform) {
        const code = document.getElementById('private-share-code')?.textContent || '';
        const url = document.getElementById('private-share-url')?.value || '';
        const message = `Join my Fast Track game! 🎯\n\nCode: ${code}\n\n${url}`;
        const encodedMsg = encodeURIComponent(message);
        const encodedUrl = encodeURIComponent(url);
        
        let shareUrl = '';
        
        switch (platform) {
            case 'whatsapp':
                shareUrl = `https://wa.me/?text=${encodedMsg}`;
                break;
            case 'telegram':
                shareUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(`Join my Fast Track game! Code: ${code}`)}`;
                break;
            case 'messenger':
                shareUrl = `fb-messenger://share/?link=${encodedUrl}`;
                // Fallback for web
                if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                    shareUrl = `https://www.facebook.com/dialog/send?link=${encodedUrl}&app_id=YOUR_APP_ID&redirect_uri=${encodedUrl}`;
                }
                break;
            case 'sms':
                shareUrl = `sms:?body=${encodedMsg}`;
                break;
            case 'email':
                shareUrl = `mailto:?subject=${encodeURIComponent('Join my Fast Track game!')}&body=${encodedMsg}`;
                break;
        }
        
        if (shareUrl) {
            window.open(shareUrl, '_blank');
        }
    };
    
    // Chat functions
    window.sendPrivateChat = function() {
        const input = document.getElementById('private-chat-input');
        const message = (input?.value || '').trim();
        
        if (!message || !lobbyWebSocket) return;
        
        lobbyWebSocket.send(JSON.stringify({
            type: 'chat',
            message: message
        }));
        
        input.value = '';
    };
    
    function addChatMessage(author, message, timestamp) {
        const container = document.getElementById('private-chat-messages');
        if (!container) return;
        
        const time = timestamp ? new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        msgEl.innerHTML = `
            <span class="msg-time">${time}</span>
            <span class="msg-author">${author}:</span>
            <span class="msg-text">${escapeHtml(message)}</span>
        `;
        
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    }
    
    function addSystemChat(message) {
        const container = document.getElementById('private-chat-messages');
        if (!container) return;
        
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message system';
        msgEl.textContent = message;
        
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Leave private lobby
    window.leavePrivateLobby = function() {
        if (lobbyWebSocket && privateSessionData) {
            lobbyWebSocket.send(JSON.stringify({
                type: 'leave_session'
            }));
        }
        
        hidePrivateLobby();
        privateSessionData = null;
        isLobbyHost = false;
        
        // Show start screen again
        const startScreen = document.getElementById('start-game-screen');
        if (startScreen) startScreen.style.display = 'flex';
        
        // Reset chat
        const chatContainer = document.getElementById('private-chat-messages');
        if (chatContainer) {
            chatContainer.innerHTML = '<div class="chat-message system">Welcome to the private lobby! Chat with your friends here.</div>';
        }
    };
    
    // Start private game (host only)
    window.startPrivateGame = function() {
        if (!isLobbyHost || !lobbyWebSocket || !privateSessionData) return;
        
        lobbyWebSocket.send(JSON.stringify({
            type: 'start_game',
            session_id: privateSessionData.session_id
        }));
    };
    
    // Start multiplayer game with session data
    function startMultiplayerGame(session) {
        console.log('[Multiplayer] Starting game with session:', session);
        
        // Set up players from session
        const players = session.players || [];
        activePlayerCount = Math.max(2, Math.min(4, players.length));
        
        // Start game with multiplayer flag
        isMultiplayerGame = true;
        multiplayerSession = session;
        
        // Initialize session settings for organizer controls
        initSessionSettings({
            isOrganizer: isLobbyHost,
            organizerId: session.host_id,
            isPrivate: session.is_private,
            replaceWithBot: true,
            noBots: !(session.settings?.allow_bots !== false),
            allowLateJoin: session.settings?.allow_late_join !== false
        });
        
        startGameSession();
    }
    
    let isMultiplayerGame = false;
    let multiplayerSession = null;
    
    // =========================================================================
    // GameStateBroadcaster — broadcasts game state deltas to all players via WS
    // (Extend existing if loaded from game_state_broadcaster.js)
    // =========================================================================
    const GameStateBroadcaster_MP = {
        _throttleTimer: null,
        _pendingState: null,
        
        /** Send a full game state snapshot to all players (host only) */
        syncFullState() {
            if (!isMultiplayerGame || !isLobbyHost) return;
            if (!lobbyWebSocket || lobbyWebSocket.readyState !== WebSocket.OPEN) return;
            if (!gameState) return;
            
            const snapshot = this._buildSnapshot();
            lobbyWebSocket.send(JSON.stringify({
                type: 'game_state_sync',
                game_state: snapshot
            }));
        },
        
        /** Merge a delta into pending state and broadcast (throttled to ~100ms) */
        updateState(delta) {
            if (!isMultiplayerGame) return;
            if (!isLobbyHost) return; // Only the host broadcasts state
            
            this._pendingState = { ...(this._pendingState || {}), ...delta };
            
            if (!this._throttleTimer) {
                this._throttleTimer = setTimeout(() => {
                    this._flushState();
                    this._throttleTimer = null;
                }, 100);
            }
        },
        
        /** Send a discrete game action (any player can send) */
        sendAction(action) {
            if (!isMultiplayerGame) return;
            if (!lobbyWebSocket || lobbyWebSocket.readyState !== WebSocket.OPEN) return;
            
            lobbyWebSocket.send(JSON.stringify({
                type: 'game_action',
                action: action
            }));
        },
        
        _flushState() {
            if (!this._pendingState) return;
            if (!lobbyWebSocket || lobbyWebSocket.readyState !== WebSocket.OPEN) return;
            
            const snapshot = this._buildSnapshot();
            // Merge any pending delta fields
            Object.assign(snapshot, this._pendingState);
            this._pendingState = null;
            
            lobbyWebSocket.send(JSON.stringify({
                type: 'game_state_sync',
                game_state: snapshot
            }));
        },
        
        _buildSnapshot() {
            if (!gameState) return {};
            return {
                currentPlayerIndex: gameState.currentPlayerIndex,
                players: gameState.players?.map(p => ({
                    name: p.name,
                    avatar: p.avatar,
                    colorHex: p.colorHex,
                    isAI: p.isAI,
                    userId: p.userId,
                    pegsInHolding: p.pegsInHolding,
                    pegsInSafeZone: p.pegsInSafeZone,
                    pegsInBullseye: p.pegsInBullseye
                })),
                timestamp: Date.now()
            };
        }
    };
    // Merge multiplayer broadcaster methods into existing GameStateBroadcaster
    Object.assign(GameStateBroadcaster, GameStateBroadcaster_MP);
    window.GameStateBroadcaster = GameStateBroadcaster;
    
    // Apply remote game state received from host
    function applyRemoteGameState(remoteState) {
        if (!gameState || isLobbyHost) return; // Host doesn't apply remote state
        if (remoteState.currentPlayerIndex !== undefined) {
            gameState.currentPlayerIndex = remoteState.currentPlayerIndex;
        }
        if (remoteState.players && Array.isArray(remoteState.players)) {
            // Merge player metadata (don't overwrite full player objects — keep local peg positions)
            remoteState.players.forEach((rp, i) => {
                if (gameState.players[i]) {
                    if (rp.name) gameState.players[i].name = rp.name;
                    if (rp.isAI !== undefined) gameState.players[i].isAI = rp.isAI;
                    if (rp.pegsInHolding !== undefined) gameState.players[i].pegsInHolding = rp.pegsInHolding;
                    if (rp.pegsInSafeZone !== undefined) gameState.players[i].pegsInSafeZone = rp.pegsInSafeZone;
                    if (rp.pegsInBullseye !== undefined) gameState.players[i].pegsInBullseye = rp.pegsInBullseye;
                }
            });
        }
        // Update UI panels
        if (window.GameUIMinimal) {
            window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
        }
        console.log('[Sync] Applied remote game state');
    }
    window.applyRemoteGameState = applyRemoteGameState;
    
    // Quick match / matchmaking
    window.joinMatchmaking = async function() {
        try {
            await connectToLobby();
            
            const matchStatus = document.getElementById('matchmaking-status');
            if (matchStatus) matchStatus.style.display = 'block';
            
            lobbyWebSocket.send(JSON.stringify({
                type: 'join_matchmaking',
                player_count_preference: 4
            }));
            
        } catch (err) {
            console.error('[Match] Failed to join:', err);
            cardUI?.showMessage('Failed to connect to server', 3000);
        }
    };
    
    window.cancelMatchmaking = function() {
        if (lobbyWebSocket) {
            lobbyWebSocket.send(JSON.stringify({
                type: 'leave_matchmaking'
            }));
        }
        
        const matchStatus = document.getElementById('matchmaking-status');
        if (matchStatus) matchStatus.style.display = 'none';
    };
    
    // Tutorial functions
    window.showTutorial = function() {
        const modal = document.getElementById('tutorial-modal');
        if (modal) modal.classList.add('visible');
    };
    
    window.hideTutorial = function() {
        const modal = document.getElementById('tutorial-modal');
        if (modal) modal.classList.remove('visible');
    };
    
    window.scrollToRules = function() {
        const rules = document.getElementById('start-rules');
        if (rules) rules.scrollIntoView({ behavior: 'smooth' });
    };
    
    // ============================================================
    // MOM HELPER SYSTEM
    // Mom is your game guide - helps explain moves and options
    // ============================================================
    
    let momIntroShown = false;
    
    // Show Mom's introduction at game start
    function showMomIntro() {
        // Don't show in Hard mode - no aids!
        if (GAME_CONFIG.difficulty === 'hard') {
            momIntroShown = true;
            return;
        }
        
        const modal = document.getElementById('mom-intro-modal');
        if (modal && !momIntroShown) {
            modal.classList.add('visible');
            momIntroShown = true;
        }
    }
    
    function closeMomIntro() {
        const modal = document.getElementById('mom-intro-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }
    window.closeMomIntro = closeMomIntro;
    
    // Open camera panel (delegates to GameUIMinimal)
    function openCameraPanel() {
        if (window.GameUIMinimal) {
            window.GameUIMinimal.toggleMenu();
            window.GameUIMinimal.drillDown('camera');
        }
    }
    window.openCameraPanel = openCameraPanel;

    // Open theme panel (delegates to GameUIMinimal)
    function openThemePanel() {
        if (window.GameUIMinimal) {
            window.GameUIMinimal.toggleMenu();
            window.GameUIMinimal.drillDown('theme');
        }
    }
    window.openThemePanel = openThemePanel;

    // Toggle Mom Daemon (persistent game helper)
    function toggleMomDaemon() {
        if (window.MomDaemon) {
            window.MomDaemon.toggle();
        }
    }
    window.toggleMomDaemon = toggleMomDaemon;
    
    // Show Mom's contextual help based on current game state (legacy - now uses daemon)
    function showMomHelp() {
        // Delegate to AskMomAdvisor if available (enhanced advisor with auto-execute)
        if (window.AskMomAdvisor && typeof window.AskMomAdvisor.showAdvice === 'function') {
            window.AskMomAdvisor.showAdvice();
            return;
        }

        // Fallback to legacy Mom Help
        const panel = document.getElementById('mom-help-panel');
        const messageEl = document.getElementById('mom-message-text');
        const optionsEl = document.getElementById('mom-options');
        
        if (!panel || !messageEl || !optionsEl) return;
        
        // Clear previous options
        optionsEl.innerHTML = '';
        
        // Get context-aware help
        const help = getMomContextHelp();
        
        messageEl.textContent = help.message;
        
        // Add option buttons
        help.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'mom-option';
            btn.textContent = opt.text;
            btn.onclick = () => {
                if (opt.action) opt.action();
                if (opt.closePanel !== false) hideMomHelp();
            };
            optionsEl.appendChild(btn);
        });
        
        panel.classList.add('visible');
    }
    window.showMomHelp = showMomHelp;
    
    function hideMomHelp() {
        const panel = document.getElementById('mom-help-panel');
        if (panel) {
            panel.classList.remove('visible');
        }
        // Run cleanup synchronously when hide is invoked directly
        try { _postHideMomCleanup(); } catch (e) { /* ignore if not ready */ }
    }
    window.hideMomHelp = hideMomHelp;
    
    // Ensure hiding Mom help unblocks UI and clears any temporary selection state
    function _postHideMomCleanup() {
        try {
            // Clear any visual highlights left by advice
            if (typeof clearHighlights === 'function') clearHighlights();

            // Ensure card/deck UI is enabled for the human player
            if (window.cardUI && typeof window.cardUI.setDeckEnabled === 'function') {
                window.cardUI.setDeckEnabled(true);
            }

            // Hide move selection modal if present
            if (window.moveSelectionModal && typeof window.moveSelectionModal.hide === 'function') {
                window.moveSelectionModal.hide();
            }

            // Clear any pending banner-selection move so game logic isn't left waiting
            if (typeof pendingMoveSelection !== 'undefined' && pendingMoveSelection !== null) {
                pendingMoveSelection = null;
            }
        } catch (e) {
            console.warn('[Mom] cleanup after hide failed', e);
        }
    }

    // Attach global listener to ensure cleanup when panel is closed via outside clicks
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('mom-help-panel');
        if (panel && !panel.classList.contains('visible')) return; // only when visible
        if (panel && panel.classList.contains('visible') && !panel.contains(e.target)) {
            // Let existing handler hide the panel, then run cleanup shortly after
            setTimeout(_postHideMomCleanup, 50);
        }
    });
    
    // Get contextual help based on current game state
    function getMomContextHelp() {
        if (!gameState) {
            return {
                message: "The game hasn't started yet. Click START GAME when you're ready!",
                options: [{ text: "Got it!", action: null }]
            };
        }
        
        const phase = gameState.phase;
        const player = gameState.currentPlayer;
        const isMyTurn = !isAIPlayer(gameState.currentPlayerIndex);
        const card = gameState.currentCard;
        
        // Not your turn
        if (!isMyTurn) {
            return {
                message: "It's not your turn right now. Watch what the AI does - you might learn some good strategies!",
                options: [{ text: "Okay, I'll watch", action: null }]
            };
        }
        
        // Draw phase
        if (phase === 'draw') {
            return {
                message: "It's your turn! Click on the deck to draw a card. The card will tell you how many spaces you can move.",
                options: [
                    { text: "Where's the deck?", action: () => highlightDeck() },
                    { text: "Thanks, Mom!", action: null }
                ]
            };
        }
        
        // Play phase - have legal moves
        if (phase === 'play' && legalMoves && legalMoves.length > 0) {
            const cardInfo = card ? getCardExplanation(card) : '';
            const moveCount = legalMoves.length;
            
            // Check for special situations
            const hasCutMoves = legalMoves.some(m => findCutTargetAtHole(m.toHoleId));
            const hasSafeZoneMoves = legalMoves.some(m => m.toHoleId.includes('safe-'));
            const hasFastTrackMoves = legalMoves.some(m => m.isFastTrackEntry);
            const hasEnterMoves = legalMoves.some(m => m.type === 'enter');
            
            // Get unique peg numbers that can move
            const uniquePegIds = [...new Set(legalMoves.map(m => m.pegId).filter(Boolean))];
            const pegNumbers = uniquePegIds.map(id => `#${getPegNumber(id)}`);
            const multipleTokens = uniquePegIds.length > 1;
            
            let advice = `You drew a ${card?.value || 'card'}. ${cardInfo} `;
            
            // Show which pegs can move when multiple have options
            if (multipleTokens) {
                advice += `Pegs ${pegNumbers.join(', ')} can move. `;
            }
            
            if (hasEnterMoves) {
                advice += "You can bring a new peg onto the board! ";
            }
            if (hasSafeZoneMoves) {
                advice += "You can move into your safe zone - that's great progress! ";
            }
            if (hasFastTrackMoves) {
                advice += "You can enter the FastTrack for a shortcut! ";
            }
            if (hasCutMoves) {
                advice += "You can cut an opponent and send them home! ";
            }
            
            advice += `You have ${moveCount} possible move${moveCount > 1 ? 's' : ''}.`;
            
            const options = [];
            if (GAME_CONFIG.showHighlights) {
                options.push({ text: "Show me the green/red highlights", action: null });
            }
            options.push({ text: "What does this card do?", action: () => showCardHelp(card), closePanel: false });
            options.push({ text: "Thanks, Mom!", action: null });
            
            return { message: advice, options };
        }
        
        // Play phase - no legal moves
        if (phase === 'play' && (!legalMoves || legalMoves.length === 0)) {
            return {
                message: "Oh no! You don't have any legal moves with this card. Your turn will be skipped. It happens sometimes - don't worry!",
                options: [{ text: "That's okay, next time!", action: null }]
            };
        }
        
        // Default
        return {
            message: "I'm here if you need help! Just ask anytime.",
            options: [{ text: "Thanks, Mom!", action: null }]
        };
    }
    
    // Get explanation for a card
    function getCardExplanation(card) {
        if (!card) return '';
        const v = card.value;
        
        if (v === 'A' || v === '1') return "Ace lets you enter a peg from holding OR move 1 space. You get another turn!";
        if (v === '6') return "Six lets you enter a peg from holding OR move 6 spaces. You get another turn!";
        if (v === 'JOKER') return "Joker lets you enter from holding OR move 1 space. You get another turn!";
        if (v === 'J' || v === 'Q' || v === 'K') return "Royal card — move 1 space, get another turn, AND can exit the bullseye to your FastTrack corner!";
        if (v === '4') return "Four moves BACKWARDS 4 spaces. You cannot back into FastTrack, bullseye, or safe zone — but reaching your safe zone entry backwards DOES complete your circuit!";
        if (v === '7') return "Seven is a WILD CARD - move any single token 1-7 spaces. Can enter safe zone, fast track, and center hole.";
        
        return `Move ${v} spaces clockwise.`;
    }
    
    // Show detailed card help
    function showCardHelp(card) {
        const messageEl = document.getElementById('mom-message-text');
        if (messageEl && card) {
            messageEl.textContent = getCardExplanation(card);
        }
    }
    
    // Highlight the deck for new players
    function highlightDeck() {
        // Flash the deck area if CardUI exists
        if (window.cardUI && typeof window.cardUI.flashDeck === 'function') {
            window.cardUI.flashDeck();
        }
    }
    
    // 7 Card Split Move State - Interactive Mode
    let splitMoveState = {
        active: false,
        phase: 'idle',        // 'idle', 'select_first_peg', 'select_first_dest', 'select_second_peg', 'select_second_dest'
        totalMoves: 7,
        usedMoves: 0,
        remainingMoves: 7,
        firstMovePeg: null,
        selectedPeg: null,    // Currently selected peg waiting for destination click
        selectablePegs: [],   // Pegs that can be clicked in current phase
        aiPlannedSecondMove: null  // AI stores its planned second move here
    };
    
    function resetSplitMoveState() {
        // Clear any peg highlights
        clearSplitPegHighlights();
        
        splitMoveState = {
            active: false,
            phase: 'idle',
            totalMoves: 7,
            usedMoves: 0,
            remainingMoves: 7,
            firstMovePeg: null,
            selectedPeg: null,
            selectablePegs: [],
            aiPlannedSecondMove: null
        };
        
        // Remove split indicator
        const indicator = document.querySelector('.split-move-indicator');
        if (indicator) indicator.remove();
    }
    
    function clearSplitPegHighlights() {
        // Remove visual highlights from pegs
        for (const [pegId, pegData] of pegRegistry) {
            if (pegData.isSplitSelectable) {
                pegData.isSplitSelectable = false;
                // Restore original material if saved
                if (pegData.originalBodyMaterial && pegData.bodyMesh) {
                    pegData.bodyMesh.material = pegData.originalBodyMaterial;
                }
            }
        }
    }
    
    function highlightSelectablePegsForSplit(pegIds) {
        console.log('[Split] highlightSelectablePegsForSplit called with', pegIds.length, 'peg IDs:', pegIds);
        splitMoveState.selectablePegs = pegIds;
        
        let highlightedCount = 0;
        for (const pegId of pegIds) {
            const pegData = pegRegistry.get(pegId);
            console.log(`[Split] Checking pegRegistry for ${pegId}:`, pegData ? 'found' : 'NOT FOUND', 
                        pegData ? `bodyMesh=${!!pegData.bodyMesh}` : '');
            
            if (pegData && pegData.bodyMesh) {
                pegData.isSplitSelectable = true;
                // Save original material and apply glowing highlight
                if (!pegData.originalBodyMaterial) {
                    pegData.originalBodyMaterial = pegData.bodyMesh.material;
                }
                // Create pulsing highlight material
                const highlightMat = pegData.bodyMesh.material.clone();
                highlightMat.emissive = new THREE.Color(0x00ff00);
                highlightMat.emissiveIntensity = 0.5;
                pegData.bodyMesh.material = highlightMat;
                highlightedCount++;
                console.log(`[Split] Peg ${pegId} highlighted GREEN (isSplitSelectable=true)`);
            } else {
                console.error(`[Split] FAILED to highlight peg ${pegId}: pegData=${!!pegData}, bodyMesh=${pegData?.bodyMesh ? 'yes' : 'no'}`);
            }
        }
        console.log(`[Split] Highlighted ${highlightedCount}/${pegIds.length} pegs`);
    }
    
    function showSplitMoveIndicator(message, remaining) {
        // Remove existing
        const existing = document.querySelector('.split-move-indicator');
        if (existing) existing.remove();
        
        const indicator = document.createElement('div');
        indicator.className = 'split-move-indicator';
        // Compact, non-blocking format at top of screen
        indicator.innerHTML = `
            <span>✂️ 7 Split: ${message}</span>
            <span style="color: #ffd700; margin-left: 10px;">${remaining} left</span>
        `;
        document.body.appendChild(indicator);
    }
    
    function hideSplitMoveIndicator() {
        const existing = document.querySelector('.split-move-indicator');
        if (existing) existing.remove();
    }
    
    // Start split move mode when 7 is drawn
    function startSplitMoveMode() {
        const player = gameState.currentPlayer;
        
        console.log('[Split] startSplitMoveMode called for player:', player?.name || player?.index);
        console.log('[Split] Player has', player?.peg?.length || 0, 'pegs in state');
        
        if (!player || !player.peg) {
            console.error('[Split] ERROR: No player or player.peg is undefined!');
            cardUI.showMessage('Error: No player data', 2000);
            setTimeout(() => gameState.skipTurn(), 2000);
            return;
        }
        
        // Find all active pegs (not in holding, not completed, not in bullseye)
        const activePegs = [];
        for (const peg of player.peg) {
            console.log(`[Split] Checking peg ${peg.id}: holeType=${peg.holeType}, holeId=${peg.holeId}, completed=${peg.completedCircuit}, inBullseye=${peg.inBullseye}`);
            
            // Skip holding pegs
            if (peg.holeType === 'holding') {
                console.log(`[Split]   -> Skipped (in holding)`);
                continue;
            }
            
            // Skip completed pegs
            if (peg.completedCircuit) {
                console.log(`[Split]   -> Skipped (completed circuit)`);
                continue;
            }
            
            // Skip bullseye pegs (they can't participate in split moves)
            if (peg.inBullseye || peg.holeType === 'bullseye' || peg.holeId === 'center') {
                console.log(`[Split]   -> Skipped (in bullseye)`);
                continue;
            }
            
            // Must have a valid holeId
            if (!peg.holeId) {
                console.log(`[Split]   -> Skipped (no holeId)`);
                continue;
            }
            
            // Peg is valid for split
            console.log(`[Split]   -> ACTIVE for split`);
            activePegs.push(peg.id);
        }
        
        console.log('[Split] Active pegs for split:', activePegs, '(total:', activePegs.length, ')');
        
        if (activePegs.length === 0) {
            cardUI.showMessage('No active pegs to move!', 2000);
            setTimeout(() => gameState.skipTurn(), 2000);
            return;
        }
        
        // If only ONE active peg — normal 7-space move (no split, no wild card)
        if (activePegs.length === 1) {
            console.log('[Split] Only one active peg - normal 7-space move');
            const peg = player.peg.find(p => p.id === activePegs[0]);
            if (peg) {
                const possibleMoves = calculateMovesForPegRange(peg, 7, 7);
                if (possibleMoves.length > 0) {
                    legalMoves = possibleMoves;
                    highlightLegalMoves(legalMoves);
                    showPegNumbers(activePegs);
                } else {
                    cardUI.showMessage('Peg blocked — no valid moves!', 2000);
                    setTimeout(() => gameState.skipTurn(), 2000);
                }
            }
            return;
        }
        
        // Enter split mode for 2+ pegs
        splitMoveState.active = true;
        splitMoveState.phase = 'select_first_peg';
        splitMoveState.remainingMoves = 7;
        
        // Clear any existing highlights first
        clearHighlights();
        
        // Highlight selectable pegs and show their numbers
        highlightSelectablePegsForSplit(activePegs);
        showPegNumbers(activePegs);
        
        // Re-add click listener (clearHighlights removes it)
        addHoleClickListeners();
        
        // Build peg list for message
        const pegList = activePegs.map(id => `#${getPegNumber(id)}`).join(', ');
        
        // Show instruction with peg numbers
        showSplitMoveIndicator(`Tap peg (${pegList})`, 7);
        cardUI.showMessage(`7 Card: Tap a peg to start split`, 3000);
    }
    
    // Handle peg click in split mode
    function handleSplitPegClick(pegId) {
        const pegData = pegRegistry.get(pegId);
        if (!pegData) return false;
        
        const player = gameState.currentPlayer;
        const peg = player.peg.find(p => p.id === pegId);
        if (!peg) return false;
        
        if (splitMoveState.phase === 'select_first_peg') {
            // First peg selected - show all possible destinations (1-7 moves)
            // If they use all 7, no second peg needed. If they use 1-6, second peg gets remainder.
            splitMoveState.selectedPeg = pegId;
            splitMoveState.phase = 'select_first_dest';
            
            const pegNum = getPegNumber(pegId);
            
            // Clear peg highlights
            clearSplitPegHighlights();
            hidePegNumbers();
            
            // Calculate ALL possible moves from 1-7 for this peg (player can choose any)
            const possibleMoves = calculateMovesForPegRange(peg, 1, 7);
            
            console.log('[Split] Possible moves for first peg:', possibleMoves.length);
            
            if (possibleMoves.length === 0) {
                // This peg has no valid moves, let user pick another
                cardUI.showMessage(`Peg #${pegNum} has no moves, pick another`, 1500);
                splitMoveState.phase = 'select_first_peg';
                splitMoveState.selectedPeg = null;
                highlightSelectablePegsForSplit(splitMoveState.selectablePegs);
                showPegNumbers(splitMoveState.selectablePegs);
                addHoleClickListeners(); // Re-add click listener
                return true;
            }
            
            // Store moves and highlight them
            legalMoves = possibleMoves;
            highlightLegalMoves(legalMoves);
            showSplitMoveIndicator(`Peg #${pegNum}: Choose steps (1-7)`, 7);
            
            return true;
        }
        
        if (splitMoveState.phase === 'select_second_peg') {
            // Can't select the same peg that moved first
            if (pegId === splitMoveState.firstMovePeg) {
                const pegNum = getPegNumber(pegId);
                cardUI.showMessage(`Peg #${pegNum} already moved, pick another!`, 1000);
                return true;
            }
            
            splitMoveState.selectedPeg = pegId;
            splitMoveState.phase = 'select_second_dest';
            
            const pegNum = getPegNumber(pegId);
            
            // Clear peg highlights
            clearSplitPegHighlights();
            hidePegNumbers();
            
            // Calculate moves for exactly remainingMoves distance
            const possibleMoves = calculateMovesForPegRange(peg, splitMoveState.remainingMoves, splitMoveState.remainingMoves);
            
            if (possibleMoves.length === 0) {
                // This peg can't move the required distance, pick another
                cardUI.showMessage(`Peg #${pegNum} can't move ${splitMoveState.remainingMoves}, pick another`, 1500);
                splitMoveState.phase = 'select_second_peg';
                splitMoveState.selectedPeg = null;
                
                // Re-highlight other pegs
                const otherPegs = splitMoveState.selectablePegs.filter(id => id !== splitMoveState.firstMovePeg);
                highlightSelectablePegsForSplit(otherPegs);
                showPegNumbers(otherPegs);
                addHoleClickListeners(); // Re-add click listener
                return true;
            }
            
            // Highlight moves
            legalMoves = possibleMoves;
            highlightLegalMoves(legalMoves);
            showSplitMoveIndicator(`Peg #${pegNum}: Tap destination`, splitMoveState.remainingMoves);
            
            return true;
        }
        
        return false;
    }
    
    // Calculate possible moves for a peg within a step range
    function calculateMovesForPegRange(peg, minSteps, maxSteps) {
        const moves = [];
        const player = gameState.currentPlayer;
        
        console.log(`[Split] Calculating moves for peg ${peg.id} at ${peg.holeId}, steps ${minSteps}-${maxSteps}`);
        
        for (let steps = minSteps; steps <= maxSteps; steps++) {
            // Create a temporary card with this movement value
            const tempCard = { 
                movement: steps, 
                direction: 'clockwise',
                canSplit: false  // Prevent recursion
            };
            
            // Use game engine to calculate destinations
            let destinations = null;
            
            try {
                if (typeof gameState.calculateDestinationsForPeg === 'function') {
                    destinations = gameState.calculateDestinationsForPeg(peg, steps);
                    console.log(`[Split] calculateDestinationsForPeg for ${steps} steps:`, destinations);
                } else if (typeof gameState.calculateDestinations === 'function') {
                    destinations = gameState.calculateDestinations(peg, tempCard, player);
                    console.log(`[Split] calculateDestinations for ${steps} steps:`, destinations);
                } else {
                    console.warn('[Split] No destination calculation method available!');
                    continue;
                }
            } catch (err) {
                console.error('[Split] Error calculating destinations:', err);
                continue;
            }
            
            if (destinations && destinations.length > 0) {
                for (const dest of destinations) {
                    const holeId = typeof dest === 'string' ? dest : dest.holeId;
                    if (!holeId) continue;
                    
                    // Check opponent blocking — can we cut if opponent is there?
                    let canMakeMove = true;
                    if (gameState.players) {
                        for (const opponent of gameState.players) {
                            if (opponent.index === player.index) continue;
                            const opponentPeg = (opponent.peg || []).find(p => p.holeId === holeId);
                            if (opponentPeg) {
                                if (typeof gameState.canReceiveCutPeg === 'function' &&
                                    !gameState.canReceiveCutPeg(opponent)) {
                                    canMakeMove = false;
                                    console.log(`[Split] Blocked move to ${holeId} — opponent ${opponent.name} cannot receive cut`);
                                }
                                break;
                            }
                        }
                    }
                    
                    if (canMakeMove) {
                        moves.push({
                            type: 'split',
                            pegId: peg.id,
                            fromHoleId: peg.holeId,
                            toHoleId: holeId,
                            steps: steps,
                            path: (dest && typeof dest === 'object' && dest.path) || [peg.holeId, holeId],
                            isFastTrackEntry: (dest && typeof dest === 'object' && dest.isFastTrackEntry) || false
                        });
                    }
                }
            }
        }
        
        console.log(`[Split] Total moves calculated:`, moves.length, moves);
        return moves;
    }

    // Validate whether a 7-card split is possible:
    // At least 2 different pegs must be able to make moves that sum to exactly 7.
    // Returns { valid: boolean, combinations: [{pegA, pegB, stepsA, stepsB, movesA, movesB}] }
    function canSplitSeven() {
        const player = gameState.currentPlayer;
        if (!player || !player.peg) return { valid: false, combinations: [] };

        // Find all active pegs (not holding, not completed, not bullseye)
        const activePegs = player.peg.filter(p =>
            p.holeType !== 'holding' &&
            !p.completedCircuit &&
            !p.inBullseye && p.holeType !== 'bullseye' && p.holeId !== 'center' &&
            p.holeId
        );

        console.log(`[Split7] Checking split validity: ${activePegs.length} active pegs`);

        // Rule: a single peg just moves exactly 7 spaces — no wild-card range.
        // Collect all normal 7-step moves across every active peg.
        const singlePegMoves = [];
        for (const peg of activePegs) {
            const moves = calculateMovesForPegRange(peg, 7, 7);
            for (const m of moves) singlePegMoves.push(m);
        }
        const anyPegCanMove = singlePegMoves.length > 0;

        // Fewer than 2 active pegs → single-peg move is the only option
        if (activePegs.length < 2) {
            console.log(`[Split7] Only ${activePegs.length} active peg(s) — single-peg mode. Can move: ${anyPegCanMove}`);
            return { valid: anyPegCanMove, combinations: [], singlePegOnly: true, singlePegMoves };
        }

        // Cache moves per peg per step count (1-6 for split combinations)
        const pegMoves = {};
        for (const peg of activePegs) {
            pegMoves[peg.id] = {};
            for (let steps = 1; steps <= 6; steps++) {
                const moves = calculateMovesForPegRange(peg, steps, steps);
                pegMoves[peg.id][steps] = moves;
            }
        }

        // Find all valid combinations: pegA moves X, pegB moves 7-X (X=1..6)
        const combinations = [];
        for (let i = 0; i < activePegs.length; i++) {
            for (let j = 0; j < activePegs.length; j++) {
                if (i === j) continue;
                const pegA = activePegs[i];
                const pegB = activePegs[j];

                for (let stepsA = 1; stepsA <= 6; stepsA++) {
                    const stepsB = 7 - stepsA;
                    if (stepsB < 1 || stepsB > 6) continue;

                    const movesA = pegMoves[pegA.id][stepsA];
                    const movesB = pegMoves[pegB.id][stepsB];

                    if (movesA.length > 0 && movesB.length > 0) {
                        combinations.push({
                            pegA: pegA.id, pegB: pegB.id,
                            stepsA, stepsB,
                            movesA, movesB
                        });
                    }
                }
            }
        }

        console.log(`[Split7] Found ${combinations.length} valid split combinations, anyPegCanMove: ${anyPegCanMove}`);
        // Valid if split combinations exist OR any single peg can move (split is never mandatory)
        return { valid: combinations.length > 0 || anyPegCanMove, combinations, singlePegMoves };
    }
    
    // AI: Auto-execute the best split combination for 7-card
    function aiExecuteSplit() {
        const splitCheck = canSplitSeven();
        if (!splitCheck.valid) {
            console.log('🤖 [AI Split] No valid split — skipping turn');
            gameState.skipTurn();
            return;
        }
        
        // Score each combination using simple heuristics
        let bestCombo = null;
        let bestScore = -Infinity;
        
        for (const combo of splitCheck.combinations) {
            // Pick best move for each peg
            const bestA = combo.movesA[0]; // First move is fine — they're all same step count
            const bestB = combo.movesB[0];
            
            let score = 0;
            
            // Prefer cuts
            if (bestA.isCut) score += 50;
            if (bestB.isCut) score += 50;
            
            // Prefer FT entry
            if (bestA.isFastTrackEntry) score += 30;
            if (bestB.isFastTrackEntry) score += 30;
            
            // Prefer center
            if (bestA.toHoleId === 'center') score += 25;
            if (bestB.toHoleId === 'center') score += 25;
            
            // Prefer larger first move (more progress)
            score += combo.stepsA + combo.stepsB; // Always 7, but tiebreaker
            
            // Prefer even splits (3+4, 4+3) over extreme (1+6, 6+1)
            score += 6 - Math.abs(combo.stepsA - combo.stepsB);
            
            if (score > bestScore) {
                bestScore = score;
                bestCombo = combo;
            }
        }
        
        if (!bestCombo) {
            console.error('🤖 [AI Split] No best combo found despite valid combinations');
            gameState.skipTurn();
            return;
        }
        
        const moveA = bestCombo.movesA[0];
        const moveB = bestCombo.movesB[0];
        
        console.log(`🤖 [AI Split] Best split: ${moveA.pegId}→${moveA.toHoleId} (${bestCombo.stepsA}) + ${moveB.pegId}→${moveB.toHoleId} (${bestCombo.stepsB})`);
        
        // Set up split state manually for AI
        splitMoveState.active = true;
        splitMoveState.phase = 'select_first_dest';
        splitMoveState.selectedPeg = moveA.pegId;
        splitMoveState.remainingMoves = 7;
        splitMoveState.aiPlannedSecondMove = moveB;
        legalMoves = [moveA];
        
        // Execute first move
        clearHighlights();
        executeMoveDirectly(moveA);
        
        // After first move animates + executes, the transitionToSecondPegSelection 
        // will fire and auto-select for AI (existing code at line ~9774)
    }

    // Track pending first-turn timers to cancel on reinit
    let pendingFirstTurnTimers = [];
    let gameInitCount = 0;

    function initGame(playerCount = 4) {
        // Cancel any pending first-turn timers from previous init calls
        gameInitCount++;
        const thisInitId = gameInitCount;
        console.log(`[initGame] Starting initialization #${thisInitId} with ${playerCount} players`);
        
        pendingFirstTurnTimers.forEach(timerId => clearTimeout(timerId));
        pendingFirstTurnTimers = [];
        
        // Update active player count and recreate pegs for only active players
        activePlayerCount = playerCount;
        createPegsAndPlace(playerCount);
        
        // Create game state and expose globally for multiplayer
        gameState = new FastrackEngine.GameState(playerCount);
        window.gameState = gameState;
        
        // Determine first player: winner goes first on replay, otherwise random
        let firstPlayerIndex;
        let firstPlayerReason;
        if (isReplayGame && lastWinnerIndex !== null && lastWinnerIndex < playerCount) {
            firstPlayerIndex = lastWinnerIndex;
            firstPlayerReason = 'winner';
        } else {
            firstPlayerIndex = Math.floor(Math.random() * playerCount);
            firstPlayerReason = 'random';
        }
        gameState.currentPlayerIndex = firstPlayerIndex;
        isReplayGame = false; // Reset for next time
        
        // Initialize from board registry
        gameState.initializeFromBoard(pegRegistry);
        
        // Link engine to substrate events (from rules_substrate.js)
        if (FastrackEngine.linkEngineToSubstrate) {
            FastrackEngine.linkEngineToSubstrate(gameState);
        }
        
        // Register substrate event listeners for theme integration
        if (typeof GameEventSubstrate !== 'undefined') {
            GameEventSubstrate.on(GameEventSubstrate.types.FAST_TRACK_USED, (data) => {
                console.log('[Substrate] Fast track used:', data);
                // Analytics: fast track shortcut
                if (window.FTAnalytics) FTAnalytics.fastTrackUsed(data.player?.name || 'Player');
                // Stadium integration
                if (typeof StadiumController !== 'undefined') {
                    StadiumController.fastTrackEntry(data.player?.name || 'Player');
                }
            });
            GameEventSubstrate.on(GameEventSubstrate.types.PEG_CUT, (data) => {
                console.log('[Substrate] Peg cut:', data);
                // Analytics: peg capture
                if (window.FTAnalytics) FTAnalytics.pegCapture(data.cutter?.name || 'Bot', data.victim?.name || 'Peg');
                // Stadium integration - capture event
                if (typeof StadiumController !== 'undefined') {
                    const hunterName = data.cutter?.name || 'Bot';
                    const victimName = data.victim?.name || 'Peg';
                    // Check if epic capture (multiple, or dramatic)
                    const isEpic = Math.random() > 0.7; // 30% epic
                    StadiumController.capture(hunterName, victimName, isEpic);
                }
            });
            GameEventSubstrate.on(GameEventSubstrate.types.GAME_OVER, (data) => {
                console.log('[Substrate] Game over:', data);
                // Stadium integration - victory
                if (typeof StadiumController !== 'undefined') {
                    const winnerName = data.winner?.name || 'Winner';
                    StadiumController.victory(winnerName);
                }
            });
            
            // Additional stadium events
            if (typeof GameEventSubstrate.types.PEG_ENTERED !== 'undefined') {
                GameEventSubstrate.on(GameEventSubstrate.types.PEG_ENTERED, (data) => {
                    console.log('[Substrate] Peg entered:', data);
                });
            }
            
            // Game start event
            if (typeof GameEventSubstrate.types.GAME_START !== 'undefined') {
                GameEventSubstrate.on(GameEventSubstrate.types.GAME_START, (data) => {
                    console.log('[Substrate] Game started:', data);
                    if (typeof StadiumController !== 'undefined') {
                        StadiumController.gameStart();
                    }
                });
            }
            
            // Bullseye entered
            if (typeof GameEventSubstrate.types.BULLSEYE_ENTERED !== 'undefined') {
                GameEventSubstrate.on(GameEventSubstrate.types.BULLSEYE_ENTERED, (data) => {
                    console.log('[Substrate] Bullseye entered:', data);
                    if (typeof StadiumController !== 'undefined') {
                        StadiumController.bullseyeEntry(data.player?.name || 'Player');
                    }
                });
            }
            
            // Safe zone entered
            if (typeof GameEventSubstrate.types.SAFE_ZONE_ENTERED !== 'undefined') {
                GameEventSubstrate.on(GameEventSubstrate.types.SAFE_ZONE_ENTERED, (data) => {
                    console.log('[Substrate] Safe zone entered:', data);
                    if (typeof StadiumController !== 'undefined') {
                        StadiumController.safeZoneEntry(data.player?.name || 'Player');
                    }
                });
            }
            
            // Peg home (finished)
            if (typeof GameEventSubstrate.types.PEG_HOME !== 'undefined') {
                GameEventSubstrate.on(GameEventSubstrate.types.PEG_HOME, (data) => {
                    console.log('[Substrate] Peg home:', data);
                    if (typeof StadiumController !== 'undefined') {
                        StadiumController.pegFinished(data.player?.name || 'Player');
                    }
                    
                    // PRESTIGE: Award points for getting a peg home
                    const playerIndex = data.player?.index ?? gameState?.currentPlayerIndex;
                    if (!isAIPlayer(playerIndex) && window.PrestigeTracker) {
                        PrestigeTracker.award('peg_home');
                    }
                });
            }
        }
        
        // Initialize Stadium Controller with game events
        if (typeof StadiumController !== 'undefined') {
            console.log('🏟️ Stadium Controller detected - integrating audio systems');
            
            // Make stadium activation happen on first game interaction
            document.addEventListener('click', function activateStadium() {
                StadiumController.activate();
                document.removeEventListener('click', activateStadium);
            }, { once: true });
        }
        
        // Initialize player panels
        console.log('Initializing player panels...');
        console.log('initPlayerPanels type:', typeof window.initPlayerPanels);
        console.log('PlayerPanelUI type:', typeof window.PlayerPanelUI);
        
        // Clear and prepare container BEFORE creating panels
        const panelsContainer = document.getElementById('player-panels');
        if (panelsContainer) {
            panelsContainer.innerHTML = '';  // Clear any placeholder text
            panelsContainer.style.display = 'flex';
            console.log('Player panels container cleared and set to flex');
        }
        
        // DISABLED: Old panel systems - using PlayerPanelsV2 instead
        /*
        if (typeof window.initPlayerPanels === 'function') {
            window.initPlayerPanels();
        } else {
            console.error('initPlayerPanels not found! Creating manually...');
            if (typeof window.PlayerPanelUI === 'function') {
                window.playerPanelUI = new window.PlayerPanelUI();
            } else {
                console.error('PlayerPanelUI class not found!');
            }
        }
        console.log('playerPanelUI after init:', window.playerPanelUI);
        setupPlayerPanels(playerCount);
        console.log('Player panels setup complete');
        
        // Create Player Cube UI (desktop - replaces panels visually)
        if (typeof window.PlayerCubeUI === 'function') {
            window.playerCubeUI = new window.PlayerCubeUI();
            window.playerCubeUI.setPlayers(gameState.players);
            window.playerCubeUI.setActivePlayer(0);
            console.log('PlayerCubeUI created successfully');
        } else {
            console.error('PlayerCubeUI class not found! Check player_cube.js is loaded.');
        }
        
        // Initialize new player cube with game data
        if (window.updatePlayerCube) {
            console.log('[board_3d] Calling updatePlayerCube with gameState.players:', gameState.players);
            console.log('[board_3d] Player count:', gameState.players.length);
            console.log('[board_3d] Player 0 data:', JSON.stringify(gameState.players[0], (key, val) => key === 'deck' ? '[Deck]' : val));
            const currentCards = gameState.players.map(p => '-');
            window.updatePlayerCube(gameState.players, gameState.currentPlayerIndex, currentCards);
        } else {
            console.error('[board_3d] window.updatePlayerCube is not defined!');
        }
        
        // Initialize NEW player panels system (v1.0)
        if (window.initPlayerPanels) {
            console.log('[board_3d] Initializing new player panels...');
            window.initPlayerPanels(gameState.players, gameState.currentPlayerIndex, 0);
        }
        */
        console.log('[board_3d] Old panel systems disabled - using GameUIMinimal');
        
        // Initialize GameUIMinimal (clean, minimal UI - current player only)
        if (window.GameUIMinimal) {
            console.log('[board_3d] Initializing GameUIMinimal...');
            // Disable old panels
            window.GameUIMinimal.disableOldPanels();
            
            // Set current player
            window.GameUIMinimal.setCurrentPlayer(
                gameState.currentPlayer, 
                gameState.currentPlayerIndex
            );
            window.GameUIMinimal.setDeckCount(gameState.currentPlayer?.deck?.remaining || 54);
            
            // Set all players for menu
            window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
            
            // Connect draw card handler
            window.drawCard = function() {
                console.log('[GameUIMinimal.drawCard] Draw triggered', {
                    currentPlayer: gameState?.currentPlayerIndex,
                    phase: gameState?.phase
                });
                
                if (!gameState) {
                    console.error('[GameUIMinimal.drawCard] gameState not initialized!');
                    return;
                }
                
                if (gameState.phase !== 'draw') {
                    console.log('[GameUIMinimal.drawCard] Not in draw phase:', gameState.phase);
                    return;
                }
                
                handleDrawCard(false);  // false = not called by AI
            };
            
            console.log('[board_3d] GameUIMinimal initialized successfully');
        } else {
            console.error('[board_3d] GameUIMinimal not loaded!');
        }
        
        // Create Mobile UI (light pillars + action bar)
        if (typeof window.MobileUI === 'function') {
            window.mobileUI = new window.MobileUI();
            window.mobileUI.setScene(scene);
            window.mobileUI.onDeckClick = handleDrawCard;
            window.mobileUI.onMoveSelected = (move) => {
                console.log('[MobileUI] Move selected:', move);
                // Hide action bar and card popup immediately
                window.mobileUI.hideMoves();
                window.mobileUI.hideCardPopup();
                
                // Execute the move via hole click
                executeHoleClick(move.toHoleId);
            };
            window.mobileUI.updatePlayerInfo(
                gameState.currentPlayer.name,
                gameState.currentPlayer.avatar || '👤',
                gameState.currentPlayer.deck?.remaining || 54,
                gameState.currentPlayer.colorHex
            );
            console.log('MobileUI created');
        }
        
        // CardUI removed — using compact GameUIMinimal panel instead
        
        gameState.onCardDrawn = (card) => {
            console.log('[onCardDrawn] Card drawn:', card);
            
            // CRITICAL: Reset split state at every turn boundary to prevent stale state
            // A leftover splitMoveState.active=true will hijack executeMoveDirectly
            resetSplitMoveState();
            
            // Dispatch event for Mom Daemon
            document.dispatchEvent(new CustomEvent('cardDrawn', { detail: { card } }));
            
            // Defensive check - if card is null or invalid, skip turn
            if (!card || (!card.rank && !card.name)) {
                console.error('[onCardDrawn] Invalid card received!', card);
                cardUI.showMessage('Draw error - skipping turn', 2000);
                setTimeout(() => {
                    gameState.skipTurn();
                }, 2000);
                return;
            }
            
            cardUI.showCard(card);
            cardUI.updateDeckCount(gameState.deck.remaining);
            
            // Get player info for banner
            const playerIdx = gameState.currentPlayerIndex;
            const playerName = gameState.players[playerIdx].name || `Player ${playerIdx + 1}`;
            const playerColor = '#' + getThemedPlayerColor(playerIdx).toString(16).padStart(6, '0');
            const cardValue = card.name || card.value || card.movement;
            
            // Joker display helper — use emoji instead of the word "JOKER"
            const _cardRankDisplay = ((card.rank || card.value || '?').toString().toUpperCase() === 'JOKER')
                ? '🃏' : (card.rank || card.value || '?');

            // Update side panel to show drawn card
            if (window.updatePlayerCube) {
                const currentCards = gameState.players.map((p, i) => {
                    if (i === playerIdx) {
                        const suitSym = getSuitSymbol(card.suit);
                        return `${_cardRankDisplay}${suitSym}`;
                    }
                    return '-';
                });
                window.updatePlayerCube(gameState.players, gameState.currentPlayerIndex, currentCards);
            }

            // Update NEW player panels with card
            if (window.setPlayerCard) {
                const suitSym = getSuitSymbol(card.suit);
                const cardStr = `${_cardRankDisplay}${suitSym}`;
                window.setPlayerCard(playerIdx, cardStr);
            }

            // Update GameUIMinimal with drawn card
            if (window.GameUIMinimal) {
                const suitSym = getSuitSymbol(card.suit);
                window.GameUIMinimal.setDrawnCard({
                    value: _cardRankDisplay,
                    suit: suitSym,
                    isRed: card.suit === 'hearts' || card.suit === 'diamonds'
                });
                // Update deck count
                window.GameUIMinimal.setDeckCount(gameState.currentPlayer?.deck?.remaining || 54);
                // Minimize deck after draw to maximize playing area
                if (typeof window.GameUIMinimal.setDeckDrawReady === 'function') {
                    window.GameUIMinimal.setDeckDrawReady(false);
                }
            }

            // Mobile: retract panel and show floating card
            if (window.mobileRetractPanel) {
                const suitSymbol = getSuitSymbol(card.suit);
                const cardText = `${_cardRankDisplay}${suitSymbol}`;
                window.mobileRetractPanel(cardText);
            }

            // Mobile: show floating card in corner
            const isMobile = window.innerWidth <= 768;
            if (isMobile && window.mobileUI) {
                const suitSymbol = getSuitSymbol(card.suit);
                const cardText = `${_cardRankDisplay}${suitSymbol}`;
                const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                window.mobileUI.showFloatingCard(cardText, isRed);
            }
            
            // Calculate and highlight legal moves
            legalMoves = gameState.calculateLegalMoves();
            
            // Manual mode uses standard legal moves - no expansion needed
            
            // BoardManifold: validate every move against sealed rules
            if (window.BoardManifold && legalMoves.length > 0) {
                const beforeCount = legalMoves.length;
                legalMoves = BoardManifold.filterLegalMoves(legalMoves, gameState);
                if (legalMoves.length !== beforeCount) {
                    console.log(`[BoardManifold] Filtered ${beforeCount} → ${legalMoves.length} legal moves`);
                }
            }
            // 7 card — split if 2+ pegs on field, otherwise a normal 7-space move
            if (card.rank === '7') {
                const splitCheck = canSplitSeven();

                if (!splitCheck.valid) {
                    // No valid moves at all — skip turn
                    console.log('[onCardDrawn] 7 Card — no valid moves possible, skipping turn');
                    legalMoves = [];
                    // Fall through to the legalMoves.length === 0 handler below
                } else if (splitCheck.singlePegOnly) {
                    // Only 1 peg on field — treat as a normal 7-space move (no split)
                    console.log('[onCardDrawn] 7 Card — single peg on field, treating as normal 7-space move');
                    legalMoves = splitCheck.singlePegMoves;
                    // Only show big card popup for AI players — human sees card on player panel
                    if (isAIPlayer(playerIdx)) {
                        showCardRulePopup(card, 0);
                        showCardDrawnBanner(playerName, playerColor, '7', false);
                    }
                    // Fall through to normal move highlighting below
                } else {
                    // 2+ pegs on field — interactive split mode
                    // Only show big card popup for AI players — human sees card on player panel
                    if (isAIPlayer(playerIdx)) {
                        showCardRulePopup(card, splitCheck.combinations.length);
                        showCardDrawnBanner(playerName, playerColor, '7 - SPLIT ✂️', false);
                    }

                    if (!isAIPlayer(playerIdx)) {
                        // HUMAN: Interactive split mode
                        console.log(`[onCardDrawn] 7 Card SPLIT for human`);
                        showContextPopup('✂️', 'Split the 7',
                            'Pick a peg, move it 1-6 spaces. The leftover goes to a second peg.<br>Total must equal <b>7</b>. Tap a peg to begin.',
                            5000);
                        startSplitMoveMode();
                    } else {
                        // AI: Auto-execute best split
                        console.log(`[onCardDrawn] 7 Card SPLIT for AI`);
                        let thinkDelay = AI_CONFIG.thinkingDelay || 1000;
                        if (window.ManifoldAI) {
                            const entity = ManifoldAI.getEntity(playerIdx);
                            if (entity) thinkDelay = entity.thinkingDelay;
                        }
                        setTimeout(() => aiExecuteSplit(), thinkDelay);
                    }
                    return; // Split mode handles everything
                }
            }
            
            if (legalMoves.length === 0) {
                // BoardManifold: assert no legal moves before showing message
                if (window.BoardManifold) {
                    const assertion = BoardManifold.assertNoLegalMoves(legalMoves, gameState);
                    console.log(`[BoardManifold] No legal moves assertion: ${assertion.reason}`);
                }
                hideTurnBanner();
                
                // Track consecutive stuck-in-holding turns ("jail" tracker)
                if (!window._jailTracker) window._jailTracker = {};
                const jt = window._jailTracker;
                if (!jt[playerIdx]) jt[playerIdx] = 0;
                const player = gameState.players[playerIdx];
                const allInHolding = player && player.peg && player.peg.every(p => 
                    p.holeType === 'holding' || p.holeType === 'home'
                );
                if (allInHolding) {
                    jt[playerIdx]++;
                    console.log(`⛓️ Player ${playerIdx} stuck in jail: ${jt[playerIdx]} consecutive turns`);
                } else {
                    jt[playerIdx] = 0;
                }
                const isInJail = allInHolding && jt[playerIdx] >= 4;
                
                if (!isAIPlayer(playerIdx)) {
                    // HUMAN: Show modal popup — player clicks OK to skip
                    showNoLegalMovesPopup(card, () => {
                        gameState.skipTurn();
                        cardUI.clearCard();
                        clearHighlights();
                        if (window.mobileUI) window.mobileUI.hideFloatingCard();
                    }, isInJail);
                } else {
                    // AI: auto-skip after brief delay
                    showCardRulePopup(card, 0);
                    cardUI.showMessage(isInJail ? '⛓️ Still in jail!' : 'No legal moves!', 2000);
                    
                    // ManifoldAI: frustration adaptation shifts entity on surface
                    if (window.ManifoldAI) {
                        ManifoldAI.adaptEntity(playerIdx, 'no_legal_moves');
                    }
                    
                    // AI reacts with frustration
                    if (AI_REACTIONS.enabled) {
                        const reaction = AI_REACTIONS.frustration[Math.floor(Math.random() * AI_REACTIONS.frustration.length)];
                        setTimeout(() => {
                            sendDesktopReaction(reaction.emoji, reaction.name);
                        }, 500);
                    }
                    
                    setTimeout(() => {
                        gameState.skipTurn();
                        cardUI.clearCard();
                        clearHighlights();
                        if (window.mobileUI) window.mobileUI.hideFloatingCard();
                    }, 2000);
                }
            } else {
                // Mobile: show card popup with move value before showing choices
                if (isMobile && window.mobileUI && !isAIPlayer(playerIdx)) {
                    const moveCount = card.movement || card.value || 1;
                    const suitSym = getSuitSymbol(card.suit);
                    const cardDisplay = `${card.rank || card.value || '?'}${suitSym}`;
                    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                    
                    window.mobileUI.showCardPopup(cardDisplay, moveCount, isRed, () => {
                        // After popup closes, show move selection if multiple choices
                        if (legalMoves.length > 1) {
                            highlightLegalMoves(legalMoves);
                        } else {
                            // Single move - auto-execute (handled by mobileUI.showMoves)
                            highlightLegalMoves(legalMoves);
                        }
                    });
                    return; // Wait for popup to finish
                }
                
                // Determine if current player is human or AI
                const isAI = isAIPlayer(playerIdx);
                console.log(`🎲 [onCardDrawn] Player ${playerIdx} (${playerName}), isAI: ${isAI}, legalMoves: ${legalMoves.length}`);
                
                // Show all legal moves - HUMAN player must click on a destination
                if (!isAI) {
                    console.log(`👤 [HUMAN] Showing ${legalMoves.length} legal moves for player ${playerIdx}`);
                    // Pre-position camera on the active peg BEFORE highlights appear
                    // so the action is already in frame when the player clicks
                    preCinematicCamera(playerIdx, legalMoves);
                    // Big card popup removed for human — card info shown on player panel
                    // showCardRulePopup(card, legalMoves.length);
                    // showCardDrawnBanner(playerName, playerColor, cardValue, legalMoves.length > 1);

                    // ── Contextual popups for special cards ──
                    const rank = (card.rank || card.value || '').toString().toUpperCase();
                    const hasEnter = legalMoves.some(m => m.type === 'enter');
                    const hasNormal = legalMoves.some(m => m.type !== 'enter');
                    const hasFTpeg = legalMoves.some(m => {
                        const p = gameState.currentPlayer?.peg?.find(pp => pp.id === m.pegId);
                        return p && p.onFasttrack;
                    });

                    // 6 / Ace / Joker — deploy or move
                    if ((rank === 'A' || rank === '6' || rank === 'JOKER') && hasEnter && hasNormal) {
                        const label = rank === 'A' ? 'Ace' : rank === '6' ? 'Six' : 'Joker';
                        showContextPopup('🚀', `${label} — Deploy or Advance`,
                            'Bring a peg out of holding <b>or</b> move one already on the board. Your call, commander.',
                            4500);
                    }

                    // FastTrack commitment warning
                    if (hasFTpeg) {
                        showContextPopup('⚡', 'On the Express Lane',
                            'You\'re riding FastTrack — commit to the ring or bail to the main track. No U-turns.',
                            4500);
                    }

                    highlightLegalMoves(legalMoves);
                } else {
                    // AI auto-selects after delay - NO highlights shown for AI
                    // Use entity-specific thinking delay from ManifoldAI
                    let thinkDelay = AI_CONFIG.thinkingDelay || 1000;
                    if (window.ManifoldAI) {
                        const entity = ManifoldAI.getEntity(playerIdx);
                        if (entity) thinkDelay = entity.thinkingDelay;
                    }
                    console.log(`🤖 [AI] Player ${playerIdx} has ${legalMoves.length} legal moves, scheduling selection in ${thinkDelay}ms`);
                    setTimeout(() => {
                        console.log(`🤖 [AI] Executing aiSelectAndClickMove for player ${gameState.currentPlayerIndex}`);
                        aiSelectAndClickMove();
                    }, thinkDelay);
                }
            }
        };
        
        gameState.onTurnEnd = (player, wasExtraTurn) => {
            console.log('[onTurnEnd] Called!', {
                player: player?.name,
                wasExtraTurn,
                currentPlayerIndex: gameState.currentPlayerIndex,
                phase: gameState.phase
            });

            // ── Analytics: count turns ──
            if (window.FTAnalytics) FTAnalytics.turn();
            
            cardUI.updateCurrentPlayer(player);
            cardUI.updateTurnCount(gameState.turnCount);
            cardUI.setActivePlayer(gameState.currentPlayerIndex); // Update active deck with ? indicator
            cardUI.updateAllDeckCounts(gameState.players); // Update all deck counts
            cardUI.setDeckEnabled(false); // Disable until camera is ready
            hideTurnBanner(); // Hide any previous banner
            
            // Turn timer management — DEFERRED until all fanfare/animation is complete.
            // Timer will start inside proceedToNextTurn() below, not here.
            stopTurnTimer();
            
            // Exit decision mode - restore mobile UI panels after move is complete
            exitDecisionMode();
            
            // Update player panels
            if (window.playerPanelUI) {
                window.playerPanelUI.setActivePlayer(`player_${gameState.currentPlayerIndex}`);
                updatePlayerPanelStats();
            }
            
            // Update player cube (desktop)
            if (window.playerCubeUI) {
                window.playerCubeUI.setActivePlayer(gameState.currentPlayerIndex);
                // Update deck count for all players
                gameState.players.forEach((p, i) => {
                    window.playerCubeUI.updateDeckCount(i, p.deck?.remaining || 0);
                    window.playerCubeUI.updatePlayerStats(i, {
                        pegsInHolding: p.pegsInHolding,
                        pegsInSafe: p.pegsInSafeZone
                    });
                });
            }
            
            // Update GameUIMinimal (clean minimal UI)
            if (window.GameUIMinimal) {
                window.GameUIMinimal.setCurrentPlayer(
                    gameState.currentPlayer, 
                    gameState.currentPlayerIndex
                );
                window.GameUIMinimal.setDrawnCard(null);
                window.GameUIMinimal.setDeckCount(gameState.currentPlayer?.deck?.remaining || 54);
                window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
            }
            
            // Large deck removed - using scaled player panel instead
            
            // Update new player cube with game data
            if (window.updatePlayerCube) {
                const currentCards = gameState.players.map(p => {
                    const card = p.currentCard;
                    return card ? `${card.value}${card.suit}` : '-';
                });
                window.updatePlayerCube(gameState.players, gameState.currentPlayerIndex, currentCards);
            }
            
            // Mobile: expand panel for next turn
            if (window.mobileExpandPanel) {
                window.mobileExpandPanel();
            }
            
            // Broadcast player info to all players
            if (typeof GameStateBroadcaster !== 'undefined') {
                const playerInfo = gameState.players.map((p, i) => ({
                    index: i,
                    name: p.name,
                    pegsInHolding: p.pegsInHolding,
                    pegsInSafe: p.pegsInSafeZone,
                    deckRemaining: p.deck?.remaining ?? 54,
                    avatar: p.avatar || '👤'
                }));
                GameStateBroadcaster.updateState({
                    currentPlayerIndex: gameState.currentPlayerIndex,
                    turnNumber: gameState.turnCount,
                    playerInfo: playerInfo
                });
            }
            
            // MULTIPLAYER: Sync turn end to other players
            if (window.multiplayerClient && typeof multiplayerClient.isConnected === "function" && multiplayerClient.isConnected()) {
                multiplayerClient.sendTurnEnd(gameState.currentPlayerIndex);
            }
            
            // Update mobile UI
            if (window.mobileUI) {
                const currentPlayer = gameState.currentPlayer;
                window.mobileUI.updatePlayerInfo(
                    currentPlayer.name || `Player ${currentPlayer.index + 1}`,
                    '👤',
                    currentPlayer.deck?.remaining || 0,
                    currentPlayer.colorHex
                );
            }
            
            // Shorter delay for extra turns, normal delay otherwise
            // +1000ms pause so peg visually "settles" before next turn begins
            const delay = wasExtraTurn ? 1500 : 3000;
            
            // Show "Board ready for [Player]" announcement
            const upcomingPlayerIdx = gameState.currentPlayerIndex;
            const upcomingPlayer = gameState.players[upcomingPlayerIdx];
            const upcomingPlayerName = upcomingPlayer.name || `Player ${upcomingPlayerIdx + 1}`;
            const upcomingPlayerAvatar = upcomingPlayer.avatar || '👤';
            const isBot = upcomingPlayer.isAI || upcomingPlayer.isBot || /[🤖🔧⚙️🎮💻]/.test(upcomingPlayerName);
            
            // Show transition announcement
            if (wasExtraTurn && !isBot) {
                // Immediately tell the human player they get another draw
                showDrawAgainPopup();
            } else if (!wasExtraTurn) {
                const readyMessage = isBot 
                    ? `🤖 ${upcomingPlayerAvatar} ${upcomingPlayerName}'s turn` 
                    : `${upcomingPlayerAvatar} Board ready for ${upcomingPlayerName}`;
                if (cardUI) cardUI.showMessage(readyMessage, 1500);
            }
            
            setTimeout(() => {
                // If a cut scene is playing, wait for it to finish before starting next turn
                function proceedToNextTurn() {
                    const playerIdx = gameState.currentPlayerIndex;
                    const player = gameState.players[playerIdx];
                    const playerColor = '#' + getThemedPlayerColor(playerIdx).toString(16).padStart(6, '0');

                    function afterCameraReady() {
                        // Turn timer starts NOW — after all fanfare/animation/cut scenes are done
                        const hasMultipleHumans = gameState.players.filter(p => !isAIPlayer(p.index)).length > 1;
                        if (!isAIPlayer(playerIdx) && gameSessionSettings.turnTimer && hasMultipleHumans) {
                            startTurnTimer();
                        }

                        if (isAIPlayer(playerIdx)) {
                            // AI path — enable deck and take turn immediately
                            cardUI.setDeckEnabled(true);
                            aiTakeTurn();
                        } else {
                            // Human path — show prominent centered deck overlay
                            // (deck panel stays DISABLED until the overlay handles the draw)
                            cardUI.setDeckEnabled(false);
                            showCenteredDeck(playerIdx, wasExtraTurn);
                        }
                    }

                    if (wasExtraTurn) {
                        // EXTRA TURN — same player. Keep camera where the last peg landed.
                        afterCameraReady();
                    } else {
                        // NEW PLAYER — reset override and focus on their pegs
                        resetCameraOverride();
                        focusOnPlayerPeg(playerIdx, afterCameraReady);
                    }
                }

                if (window._cutSceneActive) {
                    // Poll every 100ms until the cut scene (arch + victory dance) finishes
                    const _cutWait = setInterval(() => {
                        if (!window._cutSceneActive) {
                            clearInterval(_cutWait);
                            proceedToNextTurn();
                        }
                    }, 100);
                } else {
                    proceedToNextTurn();
                }
            }, delay); // Use calculated delay (shorter for extra turns)
        };
        
        gameState.onMoveExecuted = (move, cutPeg, entryFlags = {}) => {
            // Reset jail tracker for this player — they made a move!
            if (window._jailTracker && gameState.currentPlayerIndex !== undefined) {
                window._jailTracker[gameState.currentPlayerIndex] = 0;
            }
            
            // DEBUG: Log all move execution details
            console.log('📍 onMoveExecuted called:', {
                moveToHoleId: move.toHoleId,
                isFastTrackEntry: move.isFastTrackEntry,
                entryFlags: entryFlags,
                hasFastTrackThemes: !!window.FastTrackThemes
            });
            
            // Get current player color from current theme palette
            const playerColor = getThemedPlayerColor(gameState.currentPlayer.index);
            const playerName = gameState.currentPlayer.name || `Player ${gameState.currentPlayer.index + 1}`;
            
            // ============================================================
            // SOUND EFFECTS - Play appropriate sounds for game events
            // ============================================================
            if (window.GameSFX) {
                // Always play arrival sound when peg reaches destination
                GameSFX.playArrive();
                
                // Check for special entry events
                if (entryFlags.exitedBullseye) {
                    // Royal exit from bullseye
                    GameSFX.playRoyalExit();
                } else if (entryFlags.enteredFasttrack) {
                    // FastTrack entry - exciting!
                    GameSFX.playFasttrack();
                } else if (entryFlags.enteredBullseye) {
                    // Bullseye entry
                    GameSFX.playBullseye();
                } else if (move.toHoleId && move.toHoleId.startsWith('safe-')) {
                    // Safe zone entry — play sound then do a little dance!
                    GameSFX.playSafezone();
                    setTimeout(() => performSafeZoneDance(move), 120);
                }
                
                // Boot/cut opponent
                if (cutPeg) {
                    // Small delay so boot sound follows arrive
                    setTimeout(() => GameSFX.playBoot(), 150);
                }
                
                // Peg entering board from holding
                if (entryFlags.fromHolding) {
                    GameSFX.playPegEntry();
                }
            }
            
            // Check for game events and trigger theme reactions
            if (window.FastTrackThemes) {
                // Exiting bullseye with a royal card - show royal banner (overrides fasttrack)
                if (entryFlags.exitedBullseye) {
                    console.log('👑 GOT A ROYAL! Exiting bullseye, triggering reaction...');
                    triggerThemeSwirl();
                    FastTrackThemes.triggerGameEvent('royal', { 
                        playerColor: playerColor,
                        playerName: playerName 
                    });
                }
                // Only trigger FastTrack banner when ENTERING (not traversing, not exiting bullseye)
                else if (entryFlags.enteredFasttrack) {
                    console.log('🚀 FAST TRACK ENTRY! Triggering reaction...');
                    // Trigger dramatic swirl effect
                    triggerThemeSwirl();
                    FastTrackThemes.triggerGameEvent('fasttrack', { 
                        playerColor: playerColor,
                        playerName: playerName 
                    });
                    
                    // PRESTIGE: Award points for using FastTrack (bold move!)
                    if (!isAIPlayer(gameState.currentPlayerIndex) && window.PrestigeTracker) {
                        PrestigeTracker.award('fasttrack_use');
                    }
                    
                    // ════════════════════════════════════════════════════════
                    // FASTTRACK AUTO/MANUAL CHOICE — Show prompt for human players
                    // Offer the choice: traverse automatically or manually each turn
                    // ════════════════════════════════════════════════════════
                    if (!isAIPlayer(gameState.currentPlayerIndex)) {
                        setTimeout(() => showFTTraversalChoiceDialog(), 2000);
                    }
                }
                
                // Check if sent someone home (cut)
                if (cutPeg) {
                    console.log('🏠 SEND HOME! Triggering reaction...');
                    FastTrackThemes.triggerGameEvent('sendHome', { 
                        playerColor: playerColor,
                        victimPlayer: cutPeg.player 
                    });
                    
                    // PRESTIGE: Award points for vanquishing (only for human player)
                    if (!isAIPlayer(gameState.currentPlayerIndex) && window.PrestigeTracker) {
                        PrestigeTracker.award('peg_vanquish');
                    }
                }
                
                // Only trigger Bullseye banner when ENTERING (not already in center)
                if (entryFlags.enteredBullseye) {
                    console.log('🎯 BULLSEYE ENTRY! Triggering reaction...');
                    triggerThemeSwirl();
                    FastTrackThemes.triggerGameEvent('bullseye', { 
                        playerColor: playerColor,
                        playerName: playerName 
                    });
                    
                    // PRESTIGE: Award points for landing on bullseye
                    if (!isAIPlayer(gameState.currentPlayerIndex) && window.PrestigeTracker) {
                        PrestigeTracker.award('bullseye_land');
                    }
                }
            }
            
            // Update player panel stats
            if (window.playerPanelUI) {
                updatePlayerPanelStats();
                
                // Update golden crowns — check all players for safe zone fill
                if (window.updateGoldenCrown && gameState.players) {
                    for (const player of gameState.players) {
                        const safeCount = player.peg ? player.peg.filter(p => p.holeType === 'safezone').length : 0;
                        window.updateGoldenCrown(player.boardPosition, safeCount);
                    }
                }
                
                // Update mood based on action
                if (cutPeg) {
                    // Cutter feels smooth/revenge
                    window.playerPanelUI.setMood(`player_${gameState.currentPlayer.index}`, 'revenge');
                    // Victim feels dismay
                    window.playerPanelUI.setMood(`player_${cutPeg.player.index}`, 'dismay');
                    
                    // Track stats
                    gameState.currentPlayer.tokensSent = (gameState.currentPlayer.tokensSent || 0) + 1;
                    cutPeg.player.timesLost = (cutPeg.player.timesLost || 0) + 1;
                    
                    // Track in side panel
                    if (window.trackSentHome) {
                        window.trackSentHome(gameState.currentPlayer.index);
                    }
                }
            }
            
            // Handle cut animation if there was a cut (move animation already happened)
            if (cutPeg) {
                window._cutSceneActive = true;
                animateCut(cutPeg, move, () => {
                    window._cutSceneActive = false;
                });
            }
            
            // Note: Extra turn logic is handled by game engine's endTurn() 
            // which fires onTurnEnd callback with wasExtraTurn flag
            
            // Broadcast state after move
            if (typeof GameStateBroadcaster !== 'undefined') {
                GameStateBroadcaster.updateState({
                    currentPlayerIndex: gameState.currentPlayerIndex,
                    turnNumber: gameState.turnCount,
                    turnPhase: gameState.phase,
                    lastMove: move
                });
            }
            
            // MULTIPLAYER: Sync move to other players
            if (window.multiplayerClient && typeof multiplayerClient.isConnected === "function" && multiplayerClient.isConnected()) {
                multiplayerClient.sendPegMove(
                    move.pegId,
                    move.fromHoleId,
                    move.toHoleId,
                    move.steps || 0,
                    cutPeg ? { pegId: cutPeg.id, playerId: cutPeg.player?.index } : null
                );
            }
            
            // AI Reactions - let AI express emotions about turn outcomes
            aiSendReaction(move, cutPeg, entryFlags);
        };
        
        gameState.onGameOver = (winner) => {
            const playerColor = getThemedPlayerColor(winner.index);
            const avatar = winner.avatar || '👤';

            // ── Analytics: Track game completion ──
            if (window.FTAnalytics) {
                FTAnalytics.gameEnd(
                    winner.name || 'Player',
                    isAIPlayer(winner.index),
                    gameState.turnCount || 0
                );
            }
            
            // Play victory fanfare sound effect!
            if (window.GameSFX) {
                GameSFX.playVictory();
            }
            
            if (window.FastTrackThemes) {
                FastTrackThemes.triggerGameEvent('win', { 
                    playerColor: playerColor,
                    playerName: winner.name,
                    avatar: avatar
                });
            }
            
            // PRESTIGE: Award points for winning (only for human player)
            if (!isAIPlayer(winner.index) && window.PrestigeTracker) {
                PrestigeTracker.award('game_win');
                PrestigeTracker.syncWithServer();
            }
            
            // MULTIPLAYER: Notify game over
            if (window.multiplayerClient && typeof multiplayerClient.isConnected === "function" && multiplayerClient.isConnected()) {
                multiplayerClient.syncGameState(gameState, true); // final sync
            }
            
            // AI sportsmanship reactions — win or lose, bots love the game!
            if (AI_REACTIONS.enabled) {
                const pick = arr => arr[Math.floor(Math.random() * arr.length)];
                const getBotName = (idx) => {
                    const p = gameState.players?.[idx];
                    return p?.name?.replace(/^[^\w\s]+\s*/, '').trim() || 'Bot';
                };
                
                setTimeout(() => {
                    if (isAIPlayer(winner.index)) {
                        // AI won — celebrate but with sportsmanship!
                        // First: a couple celebration emojis
                        for (let i = 0; i < 2; i++) {
                            setTimeout(() => {
                                const reaction = pick(AI_REACTIONS.positive);
                                sendDesktopReaction(reaction.emoji, reaction.name);
                            }, i * 400);
                        }
                        // Then: a sportsmanship emoji from another bot
                        setTimeout(() => {
                            const reaction = pick(AI_REACTIONS.sportsmanship);
                            sendDesktopReaction(reaction.emoji, reaction.name);
                        }, 900);
                        // Chat: humble winner message
                        setTimeout(() => {
                            const msg = pick(AI_CHAT_MESSAGES.botWins);
                            aiSendChatBubble(msg, getBotName(winner.index));
                        }, 1200);
                    } else {
                        // Human won — bots CHEER and congratulate! They love humans!
                        AI_CONFIG.players.forEach((aiIdx, i) => {
                            setTimeout(() => {
                                const reaction = pick(AI_REACTIONS.sportsmanship);
                                sendDesktopReaction(reaction.emoji, reaction.name);
                            }, i * 350);
                        });
                        // Chat: congratulatory message from a random bot
                        setTimeout(() => {
                            const randomBot = AI_CONFIG.players[Math.floor(Math.random() * AI_CONFIG.players.length)];
                            const msg = pick(AI_CHAT_MESSAGES.humanWins);
                            aiSendChatBubble(msg, getBotName(randomBot));
                        }, 1000);
                        // Second bot chimes in too (if multiple bots)
                        if (AI_CONFIG.players.length > 1) {
                            setTimeout(() => {
                                const secondBot = AI_CONFIG.players[AI_CONFIG.players.length - 1];
                                const msg = pick(AI_CHAT_MESSAGES.humanWins);
                                aiSendChatBubble(msg, getBotName(secondBot));
                            }, 2000);
                        }
                    }
                }, 500);
            }
            
            // Save winner for "winner goes first" on replay
            lastWinnerIndex = winner.index;
            
            // Update player panel for winner
            if (window.playerPanelUI) {
                window.playerPanelUI.setWinner(`player_${winner.index}`);
                window.playerPanelUI.setMood(`player_${winner.index}`, 'celebration');
            }
            
            // ── VICTORY CEREMONY CUTSCENE ──
            // Crown envelops peg → rises → giant peg with crown → bow → applause → confetti → replay
            const homeHole = holeRegistry.get(`home-${winner.boardPosition}`);
            const homePos = homeHole ? new THREE.Vector3(homeHole.position.x, homeHole.position.y, homeHole.position.z) : new THREE.Vector3(0, 0, 0);
            
            if (window.VictoryCeremony) {
                // Stop turn timer during ceremony
                if (typeof stopTurnTimer === 'function') stopTurnTimer();
                
                VictoryCeremony.start(winner, homePos, playerColor, () => {
                    // Ceremony complete → show replay button
                    showPlayAgainButton(winner);
                });
            } else {
                // Fallback: no ceremony, just show message and button
                cardUI.showMessage(`${avatar} ${winner.name} WINS!`, 5000);
                setTimeout(() => {
                    showPlayAgainButton(winner);
                }, 3000);
            }
        };
        
        // Start game
        gameState.start();
        cardUI.updateCurrentPlayer(gameState.currentPlayer);
        cardUI.updateTurnCount(gameState.turnCount);
        cardUI.updateAllDeckCounts(gameState.players); // Update all player deck counts
        
        // Enable deck immediately for first player if human
        if (!isAIPlayer(gameState.currentPlayerIndex)) {
            cardUI.setDeckEnabled(true);
            if (window.mobileUI) {
                window.mobileUI.setDeckDrawReady(true);
            }
        }
        
        // Set active player panel
        if (window.playerPanelUI) {
            window.playerPanelUI.setActivePlayer(`player_${gameState.currentPlayerIndex}`);
        }
        
        // Show first player announcement, then turn banner
        console.log('[initGame] Setting up first turn, firstPlayerIndex:', gameState.currentPlayerIndex, 'initId:', thisInitId);
        const timer1 = setTimeout(() => {
            // Guard: only proceed if this is still the active init
            if (thisInitId !== gameInitCount) {
                console.log('[initGame] First timeout cancelled - newer init exists');
                return;
            }
            
            console.log('[initGame] First timeout fired, showing announcement');
            const playerIdx = gameState.currentPlayerIndex;
            const player = gameState.players[playerIdx];
            const playerName = player.name || `Player ${playerIdx + 1}`;
            const playerAvatar = player.avatar || '👤';
            const playerColor = '#' + getThemedPlayerColor(playerIdx).toString(16).padStart(6, '0');
            
            // Show who goes first (with avatar)
            showFirstPlayerAnnouncement(`${playerAvatar} ${playerName}`, playerColor, firstPlayerReason);
            
            // ═══════════════════════════════════════════════════════
            // BOT WELCOME MESSAGES — bots greet at game start!
            // They love the human and want a fun, competitive game.
            // ═══════════════════════════════════════════════════════
            if (AI_REACTIONS.enabled && AI_CONFIG.enabled && AI_CONFIG.players.length > 0) {
                const pick = arr => arr[Math.floor(Math.random() * arr.length)];
                const getBotName = (idx) => {
                    const p = gameState.players?.[idx];
                    return p?.name?.replace(/^[^\w\s]+\s*/, '').trim() || 'Bot';
                };
                
                // First bot waves hello (emoji)
                setTimeout(() => {
                    if (thisInitId !== gameInitCount) return;
                    const reaction = pick(AI_REACTIONS.welcome);
                    sendDesktopReaction(reaction.emoji, reaction.name);
                }, 800);
                
                // First bot sends welcome chat
                setTimeout(() => {
                    if (thisInitId !== gameInitCount) return;
                    const botIdx = AI_CONFIG.players[0];
                    const msg = pick(AI_CHAT_MESSAGES.welcome);
                    aiSendChatBubble(msg, getBotName(botIdx));
                }, 1500);
                
                // Second bot chimes in (if multiple bots)
                if (AI_CONFIG.players.length > 1) {
                    setTimeout(() => {
                        if (thisInitId !== gameInitCount) return;
                        const reaction = pick(AI_REACTIONS.welcome);
                        sendDesktopReaction(reaction.emoji, reaction.name);
                    }, 2200);
                }
            }
            
            // Show turn banner after announcement fades
            const timer2 = setTimeout(() => {
                // Guard: only proceed if this is still the active init
                if (thisInitId !== gameInitCount) {
                    console.log('[initGame] Second timeout cancelled - newer init exists');
                    return;
                }
                
                console.log('[initGame] Second timeout fired, playerIdx:', playerIdx, 'isAI:', isAIPlayer(playerIdx));
                if (!isAIPlayer(playerIdx)) {
                    console.log('[initGame] Human player - showing turn banner');
                    showTurnBanner(`${playerAvatar} ${playerName}`, playerColor, 'Please draw a card');
                    
                    // Enable deck for human player to draw
                    if (cardUI) {
                        cardUI.setDeckEnabled(true);
                        console.log('[initGame] Deck enabled for human player');
                    }
                    
                    // Pulse the mobile deck to signal "draw now!"
                    if (window.mobileUI) {
                        window.mobileUI.setDeckDrawReady(true);
                    }
                } else {
                    // If AI goes first, let them take their turn
                    console.log('[initGame] AI player - calling aiTakeTurn()');
                    aiTakeTurn();
                }
            }, 3500);
            pendingFirstTurnTimers.push(timer2);
        }, 500);
        pendingFirstTurnTimers.push(timer1);
        
        console.log('Fastrack! game initialized with', playerCount, 'players');
        
        // MULTIPLAYER: Initialize connection if session info present
        initMultiplayerFromSession();
    }
    
    // Initialize multiplayer client from session parameters
    function initMultiplayerFromSession() {
        const params = new URLSearchParams(window.location.search);
        const sessionCode = params.get('session');
        const playerId = params.get('playerId');
        
        if (sessionCode && window.MultiplayerClient) {
            console.log('[Multiplayer] Session detected:', sessionCode);
            
            // Auto-detect WebSocket URL (supports local dev and production SSL)
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const wsUrl = isLocal 
                ? `ws://${window.location.hostname}:8765`
                : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
            
            // Create multiplayer client
            window.multiplayerClient = new MultiplayerClient(
                wsUrl,
                sessionCode
            );
            
            // Set up event handlers for remote player actions (check if methods exist)
            if (typeof multiplayerClient.on === 'function') {
                multiplayerClient.on('peg_move', handleRemotePegMove);
                multiplayerClient.on('card_draw', handleRemoteCardDraw);
                multiplayerClient.on('turn_end', handleRemoteTurnEnd);
                multiplayerClient.on('game_state', handleRemoteGameState);
            } else {
                console.warn('[Multiplayer] multiplayerClient.on is not a function - skipping event handlers');
            }
            
            // Connect to lobby server (check if method exists)
            if (typeof multiplayerClient.connect === 'function') {
                multiplayerClient.connect().then(() => {
                console.log('[Multiplayer] Connected to lobby server');
                if (cardUI) {
                    cardUI.showMessage('Connected to multiplayer session!', 2000);
                }
            }).catch(err => {
                console.error('[Multiplayer] Connection failed:', err);
                if (cardUI) {
                    cardUI.showMessage('Could not connect to multiplayer', 2000);
                }
            });
            } else {
                console.warn('[Multiplayer] multiplayerClient.connect is not a function - skipping connection');
            }
        }
    }
    
    // Handle remote peg move from another player
    function handleRemotePegMove(data) {
        console.log('[Multiplayer] Remote peg move:', data);
        // Find the peg and animate the move
        const move = {
            pegId: data.pegId,
            fromHoleId: data.fromHole,
            toHoleId: data.toHole,
            steps: data.steps
        };
        
        // Animate the move without executing locally (already done on server)
        if (typeof animatePegMove === 'function') {
            animatePegMove(move, () => {
                // Handle vanquish if present
                if (data.vanquished && typeof animateCut === 'function') {
                    const cutPeg = { id: data.vanquished.pegId };
                    animateCut(cutPeg);
                }
            });
        }
    }
    
    // Handle remote card draw notification
    function handleRemoteCardDraw(data) {
        console.log('[Multiplayer] Remote card draw:', data);
        // Show visual feedback that opponent drew a card
        if (cardUI && data.playerIndex !== gameState.currentPlayerIndex) {
            cardUI.flashDeck(data.playerIndex);
        }
    }
    
    // Handle remote turn end
    function handleRemoteTurnEnd(data) {
        const nextIdx = data.nextPlayer ?? data.next_player;
        console.log('[Multiplayer] Remote turn end, next player:', nextIdx);
        if (gameState && nextIdx !== undefined) {
            gameState.currentPlayerIndex = nextIdx;
            const nextPlayer = gameState.players[nextIdx];

            // Update card UI
            if (cardUI) {
                cardUI.updateCurrentPlayer(nextPlayer);
                cardUI.setActivePlayer(nextIdx);
                cardUI.updateAllDeckCounts(gameState.players);
            }

            // Update player panels
            if (window.playerPanelUI) {
                window.playerPanelUI.setActivePlayer(`player_${nextIdx}`);
                updatePlayerPanelStats();
            }

            // Update player cube
            if (window.playerCubeUI) {
                window.playerCubeUI.setActivePlayer(nextIdx);
            }

            // Update GameUIMinimal
            if (window.GameUIMinimal) {
                window.GameUIMinimal.setCurrentPlayer(nextPlayer, nextIdx);
                window.GameUIMinimal.setDrawnCard(null);
                window.GameUIMinimal.setDeckCount(nextPlayer?.deck?.remaining || 54);
                window.GameUIMinimal.setPlayers(gameState.players, nextIdx);
            }
        }
    }
    
    // Handle full game state sync from host
    function handleRemoteGameState(data) {
        console.log('[Multiplayer] Game state sync received');
        // TODO: Full state sync for reconnection/late join
    }
    
    // Expose initGame to global scope for multiplayer integration
    window.initGame = initGame;
    // Expose aiTakeTurn for demo/promo spectator mode
    window.aiTakeTurn = aiTakeTurn;
    
    // Set up player panels for all players
    function setupPlayerPanels(playerCount) {
        const panelUI = window.playerPanelUI;
        if (!panelUI) {
            console.error('playerPanelUI not found!');
            return;
        }
        
        panelUI.clear();
        
        // Get themed player colors by board position (convert from hex number to CSS string)
        const getThemedColorCSS = (boardPos) => {
            const hexNum = getColorByBoardPosition(boardPos);
            return '#' + hexNum.toString(16).padStart(6, '0');
        };
        // Bot identities — derived from ManifoldAI geometric archetypes
        let botNames;
        if (window.BoardManifold) {
            botNames = BoardManifold.pickBots(6);
        } else if (window.ManifoldAI) {
            botNames = window.ManifoldAI.ARCHETYPE_POOL.map(key => {
                const arch = window.ManifoldAI.ARCHETYPES[key];
                return { name: arch.name, icon: arch.emoji };
            });
        } else {
            botNames = [
                { name: 'Turing', icon: '🖥️' },
                { name: 'Ada', icon: '⌨️' },
                { name: 'Nexus', icon: '🌐' },
                { name: 'Cortex', icon: '🧠' },
                { name: 'Qubit', icon: '⚛️' },
                { name: 'Cipher', icon: '🔐' }
            ];
        }
        
        for (let i = 0; i < playerCount; i++) {
            // Get balanced board position for this player (for color matching)
            const boardPos = getBalancedBoardPosition(i, playerCount);
            
            // Check if this is an AI player
            const isAI = typeof AI_CONFIG !== 'undefined' && AI_CONFIG.enabled && AI_CONFIG.players.includes(i);
            
            // Try to load saved profile for player 0 (local player)
            let profile = null;
            if (i === 0 && typeof AvatarPersistence !== 'undefined') {
                profile = AvatarPersistence.load();
            }
            
            // Determine display name
            let displayName;
            if (i === 0) {
                displayName = profile?.displayName || 'You';
            } else if (isAI) {
                // Use AI_CONFIG order: players[0]=1, players[1]=2, etc.
                const botIndex = AI_CONFIG.players.indexOf(i);
                const bot = botNames[botIndex >= 0 ? botIndex : 0];
                displayName = `${bot.icon} ${bot.name}`;
            } else {
                displayName = `Player ${i + 1}`;
            }
            
            // Create player data
            const playerData = {
                id: `player_${i}`,
                displayName: displayName,
                avatarId: profile?.avatarId || (typeof AvatarSubstrate !== 'undefined' ? AvatarSubstrate.getRandom().id : null),
                colorHex: getThemedColorCSS(boardPos),  // Use themed colors matching peg/area colors
                guildId: profile?.guildId || null,
                guildName: profile?.guildName || null,
                isAI: isAI,
                isLocal: i === 0,
                stats: profile?.stats || { totalPoints: 0 },
                sessionStats: {
                    tokensInHolding: 4,
                    tokensInSafeZone: 0,
                    tokensSentHomeThisGame: 0,
                    timesSentHomeThisGame: 0
                },
                mood: 'neutral'
            };
            
            panelUI.addPlayer(playerData);
        }
        
        // Add click handlers to panel decks for drawing cards
        for (let i = 0; i < playerCount; i++) {
            const deckEl = document.getElementById(`deck-player_${i}`);
            if (deckEl) {
                deckEl.addEventListener('click', () => {
                    // Only allow drawing from current player's deck
                    if (gameState && gameState.currentPlayerIndex === i && gameState.phase === 'draw') {
                        handleDrawCard();
                    }
                });
            }
        }
    }
    
    // Update player panel stats from game state
    function updatePlayerPanelStats() {
        const panelUI = window.playerPanelUI;
        if (!panelUI || !gameState) return;
        
        gameState.players.forEach((player, index) => {
            const playerId = `player_${index}`;
            
            // Count pegs in different locations
            const holding = player.peg.filter(p => p.holeType === 'holding').length;
            const safeZone = player.peg.filter(p => p.holeType === 'safezone').length;
            
            panelUI.updatePanel(playerId, {
                sessionStats: {
                    tokensInHolding: holding,
                    tokensInSafeZone: safeZone,
                    tokensSentHomeThisGame: player.tokensSent || 0,
                    timesSentHomeThisGame: player.timesLost || 0
                }
            });
            
            // Update deck count
            if (player.deck) {
                panelUI.updateDeckCount(playerId, player.deck.cards.length);
            }
        });
    }
    
    function handleDrawCard(calledByAI = false) {
        console.log('[handleDrawCard] Called, calledByAI:', calledByAI, 'phase:', gameState?.phase, 'currentPlayerIndex:', gameState?.currentPlayerIndex);
        
        if (!gameState) {
            console.error('[handleDrawCard] gameState is not defined!');
            return;
        }
        
        if (gameState.phase !== 'draw') {
            console.log('[handleDrawCard] Not in draw phase, current phase:', gameState.phase);
            return;
        }
        
        // Stop turn timer when player acts (card draw)
        if (typeof stopTurnTimer === 'function') {
            stopTurnTimer();
        }
        
        // Check if this is a valid draw request
        const currentIdx = gameState.currentPlayerIndex;
        const isCurrentAI = isAIPlayer(currentIdx);
        console.log('[handleDrawCard] currentIdx:', currentIdx, 'isCurrentAI:', isCurrentAI);
        
        // If it's an AI's turn, only allow drawing if called by AI logic
        if (isCurrentAI && !calledByAI) {
            console.log('[handleDrawCard] Blocked human click during AI turn');
            return;
        }
        
        // If it's the human's turn, they should be the one clicking
        if (!isCurrentAI && calledByAI) {
            console.log('[handleDrawCard] AI tried to draw during human turn - blocked');
            return;
        }
        
        console.log('[handleDrawCard] Valid draw for player', currentIdx, '- calling gameState.drawCard()');
        
        // Large deck removed - using scaled player panel instead
        
        if (cardUI) {
            cardUI.setDeckEnabled(false);
            // Flash the current player's deck to show they drew
            cardUI.flashDeck(currentIdx);
        }
        
        const drawnCard = gameState.drawCard();
        console.log('[handleDrawCard] gameState.drawCard() returned:', drawnCard);

        // Reveal drawn card in the centered deck overlay (flip face → rank)
        if (window._centeredDeckActive && drawnCard) {
            updateCenteredDeckRank(drawnCard);
        }

        // Auto-start music on first card draw by any player
        autoStartMusicOnFirstDraw();
        
        // Play draw card sound effect
        if (window.GameSFX && drawnCard) {
            GameSFX.playDrawCard();
            
            // Check for 6 card (extra turn) - play extra turn sound
            if (drawnCard.rank === '6' || drawnCard.value === '6') {
                setTimeout(() => GameSFX.playExtraTurn(), 200);
            }
        }
        
        // Stop the mobile deck pulse
        if (window.mobileUI) {
            window.mobileUI.setDeckDrawReady(false);
        }
        
        // Update deck count in player panel
        if (window.playerPanelUI) {
            const playerId = `player_${gameState.currentPlayerIndex}`;
            const player = gameState.players[gameState.currentPlayerIndex];
            if (player && player.deck) {
                window.playerPanelUI.updateDeckCount(playerId, player.deck.cards.length);
            }
        }
        
        // Update CardUI deck count immediately after draw (so AI deck visually decreases)
        if (cardUI) {
            cardUI.updateDeckCount(gameState.currentPlayer.deck?.remaining || 0);
            cardUI.updateAllDeckCounts(gameState.players);
        }
        
        // Update player cube with new card
        if (window.updatePlayerCube) {
            // Note: gameState.currentCard holds the drawn card, not individual player cards
            const drawnCard = gameState.currentCard;
            const currentCards = gameState.players.map((p, i) => {
                if (i === gameState.currentPlayerIndex && drawnCard) {
                    const suitSym = getSuitSymbol(drawnCard.suit);
                    return `${drawnCard.rank || drawnCard.value || '?'}${suitSym}`;
                }
                return '-';
            });
            window.updatePlayerCube(gameState.players, gameState.currentPlayerIndex, currentCards);
        }
        
        // Broadcast state to all players
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.updateState({
                currentPlayerIndex: gameState.currentPlayerIndex,
                turnNumber: gameState.turnCount,
                turnPhase: gameState.phase,
                activeCard: gameState.currentCard
            });
        }
        
        // MULTIPLAYER: Notify other players of card draw
        if (window.multiplayerClient && typeof multiplayerClient.isConnected === "function" && multiplayerClient.isConnected() && drawnCard) {
            multiplayerClient.sendCardDraw(
                drawnCard.rank || drawnCard.value,
                drawnCard.suit,
                gameState.currentPlayerIndex
            );
        }
    }
    
    // Track cut target pegs that are flashing
    let flashingCutTargets = [];
    // Track pegs with legal moves that should blink
    let blinkingMovablePegs = [];
    let highlightAnimationId = null;
    
    // Make pegs with legal moves blink to show player which can be moved
    function blinkMovablePegs(moves) {
        // Clear any existing blinking pegs
        clearBlinkingPegs();
        
        if (!moves || moves.length === 0) return;
        
        // Get unique peg IDs that have legal moves
        const movablePegIds = new Set();
        moves.forEach(move => {
            if (move.pegId) {
                movablePegIds.add(move.pegId);
            }
        });
        
        // Find and set up blinking for each movable peg
        movablePegIds.forEach(pegId => {
            const pegData = pegRegistry.get(pegId);
            if (pegData && pegData.bodyMesh) {
                if (!pegData.originalBlinkColor) {
                    pegData.originalBlinkColor = pegData.bodyMesh.material.color.getHex();
                }
                pegData.isBlinking = true;
                blinkingMovablePegs.push(pegData);
            }
        });
        
        console.log(`[blinkMovablePegs] ${blinkingMovablePegs.length} pegs can move`);
    }
    
    function clearBlinkingPegs() {
        blinkingMovablePegs.forEach(peg => {
            if (peg.originalBlinkColor && peg.bodyMesh) {
                peg.bodyMesh.material.color.setHex(peg.originalBlinkColor);
                if (peg.discMesh) peg.discMesh.material.color.setHex(peg.originalBlinkColor);
                // Reset emissive
                if (peg.bodyMesh.material.emissive) {
                    peg.bodyMesh.material.emissive.setHex(0x000000);
                    peg.bodyMesh.material.emissiveIntensity = 0;
                }
            }
            peg.isBlinking = false;
            delete peg.originalBlinkColor;
        });
        blinkingMovablePegs = [];
    }
    
    // Track path-highlighted holes (separate from destination highlights)
    let highlightedPathHoles = [];
    
    // Determine if moves require modal (complex choice)
    function hasComplexChoice(moves) {
        if (!moves || moves.length <= 1) return false;
        
        // Multiple pegs can move - always use modal
        const pegIds = new Set(moves.map(m => m.pegId));
        if (pegIds.size > 1) return true;
        
        // Single peg but multiple strategic options
        const hasCuts = moves.some(m => {
            if (!gameState || !gameState.players) return false;
            const currentPlayerIdx = gameState.currentPlayerIndex;
            for (const player of gameState.players) {
                if (player.index === currentPlayerIdx) continue;
                for (const peg of player.peg || []) {
                    if (peg.holeId === m.toHoleId) return true;
                }
            }
            return false;
        });
        
        const hasFTChoice = moves.some(m => m.isFastTrackEntry);
        const hasBullseyeChoice = moves.some(m => m.toHoleId === 'center');
        const hasSafeZone = moves.some(m => m.toHoleId && m.toHoleId.includes('safe'));
        
        // Use modal if there are strategic choices
        return hasCuts || hasFTChoice || hasBullseyeChoice || hasSafeZone;
    }

    function highlightLegalMoves(moves) {
        clearHighlights();
        
        console.log('[highlightLegalMoves] Highlighting', moves.length, 'moves, difficulty:', GAME_CONFIG.difficulty, 'showHighlights:', GAME_CONFIG.showHighlights);
        
        // HARD MODE: No highlights, user must count their own moves
        if (GAME_CONFIG.difficulty === 'hard') {
            console.log('🔥 [HARD MODE] No move highlights - user must count moves manually');
            // Just enable click handling but don't show any visual aids
            addHardModeClickListeners();
            return;
        }
        
        // AUTO-MOVE FOR HUMANS: If only one legal move and auto-move is enabled, execute it automatically
        // BUT NOT during split mode - user must choose their split amounts manually
        const playerIdx = gameState?.currentPlayerIndex;
        const isHumanPlayer = !isAIPlayer(playerIdx);
        const inSplitMode = splitMoveState && splitMoveState.active;
        
        console.log('[highlightLegalMoves] isHumanPlayer:', isHumanPlayer, 'autoMoveForHumans:', GAME_CONFIG.autoMoveForHumans, 'inSplitMode:', inSplitMode);
        
        if (isHumanPlayer && moves.length === 1 && GAME_CONFIG.autoMoveForHumans && !inSplitMode) {
            console.log('\u26a1 Auto-executing single move for human player:', moves[0].toHoleId);
            // Show brief notification
            showAutoMoveBanner();
            setTimeout(() => {
                executeMoveDirectly(moves[0]);
            }, GAME_CONFIG.autoMoveDelay);
            return; // Don't show move selection UI
        }
        
        // ════════════════════════════════════════════════════════
        // FASTTRACK AUTO-TRAVERSE: If enabled, auto-select the FT traverse move
        // when a human player has an FT peg and the FT traverse option is available.
        // This skips the manual choice and keeps the peg moving around the ring.
        // ════════════════════════════════════════════════════════
        if (isHumanPlayer && GAME_CONFIG.ftAutoTraverse && !inSplitMode) {
            const ftTraverseMove = moves.find(m => 
                m.toHoleId && m.toHoleId.startsWith('ft-') && 
                !m.isLeaveFastTrack && !m.isCenterOption &&
                // Must be from an FT peg (peg currently on FT)
                gameState.currentPlayer.peg.find(p => p.id === m.pegId && p.onFasttrack)
            );
            if (ftTraverseMove) {
                console.log(`🚀 [FT Auto-Traverse] Auto-executing FT move: ${ftTraverseMove.fromHoleId} → ${ftTraverseMove.toHoleId}`);
                if (cardUI) {
                    cardUI.showActionBanner('🚀 Auto-traversing FastTrack...', 'default');
                    setTimeout(() => { if (cardUI) cardUI.hideActionBanner(); }, 800);
                }
                setTimeout(() => {
                    executeMoveDirectly(ftTraverseMove);
                }, GAME_CONFIG.autoMoveDelay);
                return; // Don't show move selection UI
            }
        }
        
        // MOVE SELECTION MODAL removed — destination holes glow on the board instead.
        // On mobile the suggestion panel buttons (below) serve as the tap target.
        
        // Make pegs with legal moves blink (unless highlights are disabled)
        if (GAME_CONFIG.showHighlights) {
            console.log('✨ [highlightLegalMoves] Enabling peg blinking for', moves.length, 'moves');
            
            // LOG ALL LEGAL MOVES - EXHAUSTIVE LIST
            console.log('📋 [EXHAUSTIVE LEGAL MOVES] Total:', moves.length);
            moves.forEach((move, idx) => {
                console.log(`   ${idx + 1}. Peg ${move.pegId}: ${move.fromHoleId} → ${move.toHoleId} (${move.steps} steps)${move.isFastTrackEntry ? ' [FT Entry]' : ''}${move.isLeaveFastTrack ? ' [Leave FT]' : ''}${move.type === 'enter' ? ' [ENTER]' : ''}`);
            });
            
            blinkMovablePegs(moves);

            // Always show peg numbers during move selection (not just for multiple pegs)
            const uniquePegIds = new Set(moves.map(m => m.pegId).filter(Boolean));
            showPegNumbers([...uniquePegIds]);
        } else {
            console.log('⚠️ [highlightLegalMoves] showHighlights is FALSE - no visual aids');
        }
        
        // Voice hints - announce available moves
        if (GAME_CONFIG.hintMode === 'voice' || GAME_CONFIG.hintMode === 'all') {
            speakLegalMoves(moves);
        }
        
        // Dropdown suggestion list
        if ((GAME_CONFIG.hintMode === 'dropdown' || GAME_CONFIG.hintMode === 'all') && !GAME_CONFIG.suggestionsDisabled) {
            showMoveDropdown(moves);
        }
        
        // Camera: move TOWARD the choices, not away
        highlightsActive = true;
        focusOnChoices(moves);
        
        // ── Assign per-peg color indices and peg numbers ─────────────────────────
        const _pegColorMap = {};
        let _colorCounter = 0;
        moves.forEach(move => {
            if (move.pegId && _pegColorMap[move.pegId] === undefined) {
                _pegColorMap[move.pegId] = _colorCounter % MOVE_COLORS.length;
                _colorCounter++;
            }
            move._colorIdx   = _pegColorMap[move.pegId] ?? 0;
            move._pegNumber  = move.pegId ? (getPegNumber(move.pegId) || 1) : 1;
        });

        // Show move suggestion panel on touch/mobile only — on desktop the lit holes
        // are large enough to click directly (Fitts' Law).  Mobile needs buttons because
        // the 3D holes are tiny targets on a small screen.
        const _isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
            || document.body.classList.contains('device-mobile');
        if (_isTouchDevice) {
            showMoveSuggestionPanel(moves);
        }

        // Only highlight holes if showHighlights is enabled
        if (GAME_CONFIG.showHighlights) {
            // ============================================================
            // FULL PATH HIGHLIGHTING — Every hole along each traversal
            // path lights up with a gradient (dim near start, bright at end).
            // Destination holes get the biggest glow + ring (Fitts' Law).
            // ============================================================
            const destinationSet = new Set();  // Track destination holeIds to avoid double-highlighting
            const pathSet = new Set();         // Track path holeIds (non-destination)

            moves.forEach(move => {
                const path = move.path || [];
                const destHoleId = move.toHoleId;
                destinationSet.add(destHoleId);

                // Highlight PATH holes (skip index 0 = start, skip last = destination)
                for (let i = 1; i < path.length - 1; i++) {
                    const holeId = path[i];
                    if (destinationSet.has(holeId)) continue; // Don't dim a destination
                    if (pathSet.has(holeId)) continue;        // Already highlighted
                    pathSet.add(holeId);

                    const hole = holeRegistry.get(holeId);
                    if (!hole || !hole.mesh) continue;

                    // Store original material
                    if (!hole.originalMaterial) {
                        hole.originalMaterial = hole.mesh.material.clone();
                    }

                    // Gradient: progress 0 = dim (near peg), 1 = bright (near destination)
                    const progress = path.length > 2 ? (i - 1) / (path.length - 2) : 0.5;
                    const baseOpacity = 0.25 + progress * 0.35;  // 0.25 → 0.60
                    const emissiveStr = 0.2 + progress * 0.4;    // 0.2 → 0.6

                    const pathColor = MOVE_COLORS[move._colorIdx ?? 0].three;  // Per-move color
                    const pathMat = new THREE.MeshStandardMaterial({
                        color: pathColor,
                        emissive: pathColor,
                        emissiveIntensity: emissiveStr,
                        transparent: true,
                        opacity: baseOpacity
                    });
                    hole.mesh.material = pathMat;
                    hole.isPathHighlighted = true;
                    hole.pathProgress = progress;
                    hole.highlightTime = Math.random() * Math.PI * 2;
                    highlightedPathHoles.push(hole);

                    // Bright path ring — visible glow along the trail
                    const pathRingGroup = new THREE.Group();
                    pathRingGroup.position.copy(hole.mesh.position);
                    pathRingGroup.position.y += 0.3;
                    pathRingGroup.rotation.x = -Math.PI / 2;

                    // Inner solid ring
                    const innerGeom = new THREE.RingGeometry(2.5, 4, 24);
                    const innerMat = new THREE.MeshBasicMaterial({
                        color: pathColor, transparent: true, opacity: baseOpacity * 0.9, side: THREE.DoubleSide
                    });
                    pathRingGroup.add(new THREE.Mesh(innerGeom, innerMat));

                    // Outer glow ring
                    const outerGeom = new THREE.RingGeometry(4, 6, 24);
                    const outerMat = new THREE.MeshBasicMaterial({
                        color: pathColor, transparent: true, opacity: baseOpacity * 0.45, side: THREE.DoubleSide
                    });
                    pathRingGroup.add(new THREE.Mesh(outerGeom, outerMat));

                    boardGroup.add(pathRingGroup);
                    hole.pathRing = pathRingGroup;
                }
            });

            // Now highlight DESTINATION holes (bright, large glow ring)
            // MUST highlight ALL legal moves - this is EXHAUSTIVE
            console.log(`🎯 [DESTINATION HIGHLIGHTING] Processing ${moves.length} destination holes...`);
            let highlightedCount = 0;
            let missingCount = 0;
            
            moves.forEach((move, idx) => {
                const hole = holeRegistry.get(move.toHoleId);
                
                if (!hole) {
                    console.error(`❌ [highlightLegalMoves] HOLE NOT FOUND: ${move.toHoleId}`);
                    missingCount++;
                    return;
                }
                if (!hole.mesh) {
                    console.error(`❌ [highlightLegalMoves] HOLE HAS NO MESH: ${move.toHoleId}`);
                    missingCount++;
                    return;
                }
                
                // Store original material
                if (!hole.originalMaterial) {
                    hole.originalMaterial = hole.mesh.material.clone();
                }
                
                // Check if this move would cut an opponent
                const cutTarget = findCutTargetAtHole(move.toHoleId);
                const hasCutTarget = cutTarget !== null;
                
                // Create blinking highlight material with glow (use move's color; cuts shown by ⚔️ icon in panel)
                const moveColor = MOVE_COLORS[move._colorIdx ?? 0].three;
                const baseColor = hasCutTarget ? 0xff4444 : moveColor;  // Red for cuts, move-color for normal
                const highlightMat = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    emissive: baseColor,
                    emissiveIntensity: 0.8,
                    transparent: true,
                    opacity: 0.9
                });
                hole.mesh.material = highlightMat;
                hole.isHighlighted = true;
                hole.hasCutTarget = hasCutTarget;
                hole.highlightTime = Math.random() * Math.PI * 2; // Random start phase for varied blinking
                highlightedHoles.push(hole);
                highlightedCount++;

                // Create bullseye wireframe target around the destination hole
                createBullseyeTarget(hole, baseColor);
                
                // Flash the opponent token if it can be cut
                if (cutTarget) {
                    flashCutTarget(cutTarget);
                }
            });
            
            console.log(`✅ [DESTINATION HIGHLIGHTING] Highlighted ${highlightedCount}/${moves.length} holes (${missingCount} missing)`);
            if (missingCount > 0) {
                console.warn(`⚠️ ${missingCount} destination holes were NOT highlighted due to missing registry entries!`);
            }
            
            // Start pulsing/blinking animation (includes path pulse)
            startHighlightAnimation();
        }

        // Choice popup removed — players click/tap the glowing destination holes directly.
        // On mobile the suggestion-panel buttons above serve the same purpose.

        // Add click handlers for highlighted holes
        addHoleClickListeners();
    }

    // ============================================================
    // MOVE CHOICE MODAL — Replaces small dropdown with a clear,
    // centered popup (Nielsen #1 Visibility, #6 Recognition over recall)
    // ============================================================
    function showMoveChoiceModal(moves, pegGroups) {
        const modal = document.getElementById('move-choice-modal');
        const titleEl = document.getElementById('choice-modal-title');
        const subtitleEl = document.getElementById('choice-modal-subtitle');
        const itemsEl = document.getElementById('choice-modal-items');
        if (!modal || !itemsEl) return;

        const card = gameState.currentCard;
        const cardName = card ? (card.rank || card.value || '?') : '?';

        titleEl.textContent = `Choose Your Move`;
        subtitleEl.textContent = `Card: ${cardName} — ${moves.length} option${moves.length !== 1 ? 's' : ''}`;
        itemsEl.innerHTML = '';

        moves.forEach((move, idx) => {
            const item = document.createElement('div');
            item.className = 'choice-item';

            let icon = '📍';
            let name = move.toHoleId;
            let desc = `${move.steps || '?'} step${(move.steps || 0) !== 1 ? 's' : ''}`;
            let cls = '';

            // Check if there's also a center option for this peg (penultimate ft-* scenario)
            const hasCenterOptionForPeg = moves.some(m => m.pegId === move.pegId && (m.isCenterOption || m.toHoleId === 'center'));
            const isAlternativeToCenter = hasCenterOptionForPeg && !move.isCenterOption && move.toHoleId !== 'center';

            // Determine styling based on move type
            const friendly = friendlyHoleName(move.toHoleId);
            const cutTarget = findCutTargetAtHole(move.toHoleId);
            if (cutTarget) {
                icon = '⚔️'; name = `Cut at ${friendly}`; cls = 'cut-choice';
                desc = `Capture ${cutTarget.player.name}'s peg`;
            } else if (move.isCenterOption || move.toHoleId === 'center') {
                icon = '🎯'; name = 'Enter the Bullseye'; cls = 'ft-choice';
                desc = 'Safe spot — exit with J, Q, or K';
            } else if (isAlternativeToCenter) {
                icon = '➡️'; name = `Skip Bullseye`; cls = '';
                desc = `Continue to ${friendly}`;
            } else if (move.isFastTrackEntry) {
                icon = '⚡'; name = 'Take the FastTrack shortcut'; cls = 'ft-choice';
                desc = 'Speed across the inner ring';
            } else if (move.isLeaveFastTrack) {
                icon = '🔄'; name = 'Exit FastTrack'; cls = '';
                desc = `Back to ${friendly}`;
            } else if (move.toHoleId.startsWith('safe-')) {
                icon = '🛡️'; name = friendly; cls = 'safe-choice';
                desc = 'Protected — cannot be cut!';
            } else if (move.toHoleId.startsWith('ft-')) {
                icon = '⭐'; name = friendly;
                desc = `${move.steps} step${move.steps !== 1 ? 's' : ''} on inner ring`;
            } else if (move.type === 'enter') {
                icon = '🚀'; name = 'Enter the board';
                desc = 'Bring a peg out of holding';
            } else if (move.toHoleId.startsWith('home-')) {
                icon = '💎'; name = friendly;
                desc = move.steps === 1 ? 'Land on the home hole' : `${move.steps} steps to home`;
            } else {
                name = `Move to ${friendly}`;
                desc = `${move.steps || '?'} step${(move.steps || 0) !== 1 ? 's' : ''} forward`;
            }

            // Show which peg
            const pegLabel = move.pegId ? move.pegId.replace('peg-', 'P').replace('-', '') : '';

            if (cls) item.classList.add(cls);
            item.innerHTML = `
                <span class="choice-icon">${icon}</span>
                <div class="choice-details">
                    <div class="choice-name">${name}</div>
                    <div class="choice-desc">${desc}</div>
                </div>
                <span class="choice-path-badge">${pegLabel} · ${move.steps || '?'}↷</span>
            `;

            item.addEventListener('click', () => {
                hideMoveChoiceModal();
                executeMoveDirectly(move);
            });
            itemsEl.appendChild(item);
        });

        modal.classList.add('visible');
    }

    function hideMoveChoiceModal() {
        const modal = document.getElementById('move-choice-modal');
        if (modal) modal.classList.remove('visible');
    }
    window.hideMoveChoiceModal = hideMoveChoiceModal;

    // Close choice modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideMoveChoiceModal();
        }
    });
    
    // ============================================================
    // BULLSEYE TARGET — concentric wireframe rings with pulsing glow
    // + MOBILE TOUCH ZONE — large invisible hitbox for easier tapping
    // ============================================================
    function createBullseyeTarget(hole, color) {
        if (!hole.mesh) return;

        const group = new THREE.Group();
        group.position.copy(hole.mesh.position);
        group.position.y += 6; // Float above the board surface

        // Store hole reference for raycasting
        group.userData.holeId = hole.id;
        group.userData.isDestinationTarget = true;

        // 3D concentric sphere orb layers
        // idx=0 is the innermost golden orb; outer layers use player color with falloff
        const baseColor = new THREE.Color(color);
        const goldenColor = new THREE.Color(0xffd700);
        const layers = [
            { radius: 3.2,  opacity: 0.95, layerColor: goldenColor },  // 0: Center golden orb
            { radius: 5.5,  opacity: 0.55, layerColor: baseColor   },  // 1: Inner player ring
            { radius: 8.0,  opacity: 0.35, layerColor: baseColor   },  // 2: Mid player ring
            { radius: 11.0, opacity: 0.20, layerColor: baseColor   },  // 3: Outer player ring
            { radius: 14.5, opacity: 0.10, layerColor: baseColor   },  // 4: Wide aura ring
        ];

        const meshes = [];
        layers.forEach(({ radius, opacity, layerColor }, idx) => {
            const geom = new THREE.SphereGeometry(radius, 16, 12);
            const mat = new THREE.MeshBasicMaterial({
                color: layerColor.clone(),
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                depthWrite: false,   // prevent z-fighting between transparent layers
            });
            const mesh = new THREE.Mesh(geom, mat);
            group.add(mesh);
            meshes.push({ mesh, baseOpacity: opacity, idx, isGolden: idx === 0 });
        });

        // MOBILE TOUCH ZONE — large invisible sphere for easier tapping on small screens
        // Radius 25 gives a ~50px diameter touch target (meets WCAG touch target guidelines)
        const isMobile = window.innerWidth <= 768;
        const touchRadius = isMobile ? 28 : 20; // Larger on mobile
        const touchGeo = new THREE.SphereGeometry(touchRadius, 12, 8);
        const touchMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            colorWrite: false,  // Invisible but raycastable
            depthWrite: false,
            transparent: true,
            opacity: 0
        });
        const touchMesh = new THREE.Mesh(touchGeo, touchMat);
        touchMesh.name = 'destination-touch-zone';
        touchMesh.userData.holeId = hole.id;
        touchMesh.userData.isDestinationTarget = true;
        group.add(touchMesh);
        hole.touchMesh = touchMesh;

        boardGroup.add(group);
        hole.glowRing = group;          // keep same property name for clearHighlights compat
        hole.bullseyeRings = meshes;    // per-ring data for animation
    }

    // Remove bullseye target from hole
    function removeHoleGlowRing(hole) {
        if (hole.glowRing) {
            hole.glowRing.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            boardGroup.remove(hole.glowRing);
            delete hole.glowRing;
            delete hole.bullseyeRings;
            delete hole.touchMesh; // Clean up touch mesh reference
        }
    }
    
    function findCutTargetAtHole(holeId) {
        const currentPlayerIdx = gameState.currentPlayerIndex;
        
        for (const player of gameState.players) {
            if (player.index === currentPlayerIdx) continue;
            
            for (const peg of player.peg) {
                if (peg.holeId === holeId && peg.holeType !== 'holding') {
                    return { player, peg, pegId: peg.id };
                }
            }
        }
        return null;
    }
    
    // Calculate track distance between two holes (clockwise direction)
    // Returns how many steps from 'fromHoleId' to 'toHoleId' going clockwise
    function getTrackDistance(fromHoleId, toHoleId) {
        if (!fromHoleId || !toHoleId || fromHoleId === toHoleId) return 0;

        // Skip special holes
        if (fromHoleId === 'center' || toHoleId === 'center') return -1;
        if (fromHoleId.includes('safe') || toHoleId.includes('safe')) return -1;
        if (fromHoleId.includes('winner') || toHoleId.includes('winner')) return -1;

        // Build the clockwise track order (PARALLEL LAYOUT):
        // ft-p → outer-p-0 → outer-p-1 → outer-p-2 → outer-p-3 → home-p → ft-(p+1)
        // Each player section = 6 holes: 1 FT + 4 outer + 1 home
        const clockwiseTrack = [];
        for (let p = 0; p < 6; p++) {
            clockwiseTrack.push(`ft-${p}`);  // FastTrack pentagon hole
            // Outer track: 4 holes (0 to 3)
            for (let h = 0; h < 4; h++) {
                clockwiseTrack.push(`outer-${p}-${h}`);
            }
            // Home hole
            clockwiseTrack.push(`home-${p}`);
        }

        const fromIdx = clockwiseTrack.indexOf(fromHoleId);
        const toIdx = clockwiseTrack.indexOf(toHoleId);

        if (fromIdx === -1 || toIdx === -1) return -1;

        // Clockwise distance (how many steps FROM fromIdx TO toIdx going forward)
        const trackLen = clockwiseTrack.length;
        return (toIdx - fromIdx + trackLen) % trackLen;
    }
    
    function flashCutTarget(cutTarget) {
        const peg = pegRegistry.get(cutTarget.pegId);
        if (!peg || !peg.bodyMesh) return;
        
        // Store original color (use bodyMesh which has the material)
        if (!peg.originalColor) {
            peg.originalColor = peg.bodyMesh.material.color.getHex();
        }
        
        peg.isFlashing = true;
        flashingCutTargets.push(peg);
    }
    
    function startHighlightAnimation() {
        // Clear any existing animation
        if (highlightAnimationId) {
            cancelAnimationFrame(highlightAnimationId);
        }
        
        const animate = () => {
            const time = Date.now() * 0.004;
            
            // ---- Animate PATH holes (subtle wave traveling toward destination) ----
            highlightedPathHoles.forEach(hole => {
                if (hole.mesh && hole.mesh.material && hole.isPathHighlighted) {
                    const offsetTime = time + (hole.highlightTime || 0);
                    const progress = hole.pathProgress || 0.5;
                    // Traveling wave: brighter pulse moves from start → end
                    const wave = (Math.sin(offsetTime * 3 - progress * 4) + 1) / 2;
                    const baseOp = 0.2 + progress * 0.3;
                    const opacity = baseOp + wave * 0.2;
                    const emInt = 0.15 + progress * 0.3 + wave * 0.2;

                    hole.mesh.material.opacity = opacity;
                    hole.mesh.material.emissiveIntensity = emInt;

                    if (hole.pathRing) {
                        // pathRing is a Group; animate children
                        hole.pathRing.children.forEach(child => {
                            if (child.material) child.material.opacity = opacity * 0.7;
                        });
                        const s = 1.0 + wave * 0.15;
                        hole.pathRing.scale.set(s, s, 1);
                    }
                }
            });

            // ---- Animate DESTINATION holes (bright pulsing glow) ----
            highlightedHoles.forEach(hole => {
                if (hole.mesh && hole.mesh.material) {
                    // Use offset time for each hole to vary blinking
                    const offsetTime = time + (hole.highlightTime || 0);
                    
                    // Create blinking effect (on/off with smooth transition)
                    const blinkCycle = (Math.sin(offsetTime * 6) + 1) / 2; // 0 to 1
                    const opacity = 0.4 + blinkCycle * 0.6;
                    const emissiveIntensity = 0.3 + blinkCycle * 0.7;
                    
                    // Color cycling between bright colors
                    const baseHue = hole.hasCutTarget ? 0 : 0.35; // Red for cuts, green-cyan for safe
                    const hueShift = Math.sin(offsetTime * 2) * 0.1;
                    const color = new THREE.Color().setHSL(baseHue + hueShift, 1.0, 0.5 + blinkCycle * 0.2);
                    
                    hole.mesh.material.color.copy(color);
                    hole.mesh.material.emissive.copy(color);
                    hole.mesh.material.opacity = opacity;
                    hole.mesh.material.emissiveIntensity = emissiveIntensity;
                    
                    // Animate bullseye orb layers — cascade sparkle blink inward→outward
                    if (hole.bullseyeRings) {
                        hole.bullseyeRings.forEach(r => {
                            // Each layer offset in phase → cascading sparkle ripple
                            const phase = offsetTime * 5 - r.idx * 1.4;
                            const wave = (Math.sin(phase) + 1) / 2;
                            const opacity = r.baseOpacity * (0.4 + wave * 0.6);
                            if (r.mesh.material) {
                                r.mesh.material.opacity = opacity;
                                // Keep center (idx=0) always golden; animate outer layers
                                if (!r.isGolden) r.mesh.material.color.copy(color);
                            }
                        });
                        // Gentle 3D scale pulse for the whole orb group
                        const scalePulse = 1.0 + blinkCycle * 0.10;
                        hole.glowRing.scale.set(scalePulse, scalePulse, scalePulse);
                    }
                }
            });
            
            // Flash cut target pegs (red flash for opponent that will be cut)
            flashingCutTargets.forEach(peg => {
                if (peg.bodyMesh && peg.isFlashing) {
                    const flash = Math.sin(time * 10) > 0;
                    const flashColor = flash ? 0xff0000 : peg.originalColor;
                    peg.bodyMesh.material.color.setHex(flashColor);
                    if (peg.discMesh) peg.discMesh.material.color.setHex(flashColor);
                }
            });
            
            // Blink movable pegs (gold/bright pulsing for player's pegs that can move)
            blinkingMovablePegs.forEach(peg => {
                if (peg.bodyMesh && peg.isBlinking) {
                    // Pulse between original color and bright gold
                    const pulse = (Math.sin(time * 5) + 1) / 2;  // 0 to 1
                    const originalColor = new THREE.Color(peg.originalBlinkColor);
                    const highlightColor = new THREE.Color(0xffd700);  // Gold
                    const blendedColor = originalColor.clone().lerp(highlightColor, pulse * 0.6);
                    peg.bodyMesh.material.color.copy(blendedColor);
                    if (peg.discMesh) peg.discMesh.material.color.copy(blendedColor);
                    
                    // Also animate emissive for glow effect
                    if (peg.bodyMesh.material.emissive) {
                        peg.bodyMesh.material.emissive.setHex(0xffd700);
                        peg.bodyMesh.material.emissiveIntensity = pulse * 0.5;
                    }
                }
            });

            // Animate peg destination highlight rings (pulse and subtle opacity shift)
            if (pegDestHighlightObjects && pegDestHighlightObjects.length > 0) {
                pegDestHighlightObjects.forEach(r => {
                    try {
                        const ps = (r.userData && r.userData.pulseSpeed) ? r.userData.pulseSpeed : 2.0;
                        const base = (r.userData && r.userData.baseScale) ? r.userData.baseScale : 1.0;
                        const s = base + Math.sin(time * ps) * 0.08;
                        r.scale.set(s, s, s);
                        if (r.material) {
                            r.material.opacity = 0.6 + (Math.sin(time * ps) + 1) * 0.15;
                        }
                    } catch (e) {
                        // ignore animation errors for ad-hoc rings
                    }
                });
            }
            
            if (highlightedHoles.length > 0 || highlightedPathHoles.length > 0 || flashingCutTargets.length > 0 || blinkingMovablePegs.length > 0) {
                highlightAnimationId = requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
    
    function clearHighlights() {
        // Unlock camera — player has chosen, normal transitions can resume
        highlightsActive = false;

        // Hide peg move dropdown if visible
        hidePegMoveDropdown();

        // Hide move choice modal if visible
        hideMoveChoiceModal();
        
        // Hide move suggestion dropdown (hint mode)
        hideMoveDropdown();
        
        // Hide peg number labels
        hidePegNumbers();
        
        // Exit decision mode - restore UI panels (safe to call multiple times)
        exitDecisionMode();
        
        // Stop animation
        if (highlightAnimationId) {
            cancelAnimationFrame(highlightAnimationId);
            highlightAnimationId = null;
        }

        // Hide old confirm bar + new msb bar + suggestion panel
        hideConfirmBar();
        hideMsbBar();
        hideMoveSuggestionPanel();

        // Clear mobile UI action bar (no light pillars anymore)
        if (window.mobileUI) {
            window.mobileUI.hideMoves();
        }

        // Restore PATH hole materials and remove path rings
        highlightedPathHoles.forEach(hole => {
            if (hole.originalMaterial) {
                hole.mesh.material = hole.originalMaterial;
            }
            hole.isPathHighlighted = false;
            delete hole.pathProgress;
            delete hole.highlightTime;
            if (hole.pathRing) {
                hole.pathRing.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
                boardGroup.remove(hole.pathRing);
                delete hole.pathRing;
            }
        });
        highlightedPathHoles = [];
        
        // Restore DESTINATION hole materials and remove glow rings
        highlightedHoles.forEach(hole => {
            if (hole.originalMaterial) {
                hole.mesh.material = hole.originalMaterial;
            }
            hole.isHighlighted = false;
            hole.hasCutTarget = false;
            delete hole.highlightTime;
            
            // Remove glow ring
            removeHoleGlowRing(hole);
        });
        highlightedHoles = [];
        // Clear CameraDirector legal-move positions
        if (CameraDirector) CameraDirector._legalMovePositions = [];

        // Restore flashing peg colors (cut targets)
        flashingCutTargets.forEach(peg => {
            if (peg.originalColor && peg.bodyMesh) {
                peg.bodyMesh.material.color.setHex(peg.originalColor);
                if (peg.discMesh) peg.discMesh.material.color.setHex(peg.originalColor);
            }
            peg.isFlashing = false;
        });
        flashingCutTargets = [];
        
        // Restore blinking movable pegs
        clearBlinkingPegs();
        
        // Clear peg-specific destination highlights
        clearPegDestinationHighlights();
        
        // Clear hard mode selection
        clearHardModeSelection();
        
        removeHoleClickListeners();
    }
    
    function addHoleClickListeners() {
        window.addEventListener('click', handleHoleClick);
    }
    
    function removeHoleClickListeners() {
        window.removeEventListener('click', handleHoleClick);
        window.removeEventListener('click', handleHardModeClick);
    }
    
    // ============================================================
    // HARD MODE - Manual move validation
    // Player must click peg, then click destination hole (count yourself!)
    // ============================================================
    
    let hardModeSelectedPeg = null;
    
    function addHardModeClickListeners() {
        window.addEventListener('click', handleHardModeClick);
    }
    
    function handleHardModeClick(event) {
        if (gameState.phase !== 'play' || legalMoves.length === 0) return;
        if (isAIPlayer(gameState.currentPlayerIndex)) return;
        
        // Raycast to find clicked object
        const mouse = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObjects(boardGroup.children, true);
        
        for (const intersect of intersects) {
            // Check if a peg was clicked (to select it OR as a destination for cutting)
            for (const [pegId, pegData] of pegRegistry) {
                if (pegData.bodyMesh === intersect.object || 
                    pegData.discMesh === intersect.object ||
                    pegData.mesh === intersect.object) {
                    
                    // Check if this peg belongs to current player and has moves (to SELECT it)
                    const pegMoves = legalMoves.filter(m => m.pegId === pegId);
                    if (pegMoves.length > 0) {
                        // Select this peg
                        hardModeSelectedPeg = pegId;
                        showHardModePegSelected(pegData);
                        console.log('🔥 [HARD MODE] Selected peg:', pegId, 'with', pegMoves.length, 'possible moves');
                        return;
                    }
                    
                    // If peg already selected, check if clicked peg is at a valid destination (for cutting)
                    if (hardModeSelectedPeg) {
                        const pegHoleId = pegData.currentHole || pegData.holeId;
                        if (pegHoleId) {
                            const validMove = legalMoves.find(m => 
                                m.pegId === hardModeSelectedPeg && m.toHoleId === pegHoleId
                            );
                            
                            if (validMove) {
                                console.log('✅ [HARD MODE] Valid move (via peg click):', hardModeSelectedPeg, '→', pegHoleId);
                                clearHardModeSelection();
                                executeMoveDirectly(validMove);
                                return;
                            }
                        }
                    }
                }
            }
            
            // Check if a hole was clicked (to attempt move)
            for (const [holeId, hole] of holeRegistry) {
                if (hole.mesh === intersect.object) {
                    // If no peg selected, prompt to select one first
                    if (!hardModeSelectedPeg) {
                        showIllegalMovePopup('Select a peg first by clicking on it!');
                        return;
                    }
                    
                    // Check if this destination is valid for the selected peg
                    const validMove = legalMoves.find(m => 
                        m.pegId === hardModeSelectedPeg && m.toHoleId === holeId
                    );
                    
                    if (validMove) {
                        // Valid move! Execute it
                        console.log('✅ [HARD MODE] Valid move:', hardModeSelectedPeg, '→', holeId);
                        clearHardModeSelection();
                        executeMoveDirectly(validMove);
                    } else {
                        // Invalid move - provide detailed reason
                        console.log('❌ [HARD MODE] Invalid move:', hardModeSelectedPeg, '→', holeId);
                        const reason = getIllegalMoveReason(hardModeSelectedPeg, holeId);
                        showIllegalMovePopup(reason);
                    }
                    return;
                }
            }
        }
    }
    
    function showHardModePegSelected(pegData) {
        // Clear any previous selection
        clearHardModeSelection();
        
        // Highlight the selected peg
        if (pegData.bodyMesh && pegData.bodyMesh.material) {
            pegData._hardModeOriginalEmissive = pegData.bodyMesh.material.emissiveIntensity;
            pegData.bodyMesh.material.emissive = new THREE.Color(0xffffff);
            pegData.bodyMesh.material.emissiveIntensity = 0.5;
        }
        pegData._hardModeSelected = true;
    }
    
    function clearHardModeSelection() {
        hardModeSelectedPeg = null;
        // Reset any highlighted pegs
        pegRegistry.forEach(pegData => {
            if (pegData._hardModeSelected && pegData.bodyMesh && pegData.bodyMesh.material) {
                pegData.bodyMesh.material.emissiveIntensity = pegData._hardModeOriginalEmissive || 0;
                delete pegData._hardModeSelected;
                delete pegData._hardModeOriginalEmissive;
            }
        });
    }
    
    function formatHoleId(holeId) {
        const parts = holeId.split('-');
        if (parts[0] === 'outer') return `Outer track position ${parts[2]}`;
        if (parts[0] === 'side') return `Side track`;
        if (parts[0] === 'ft') return `FastTrack ${parts[1]}`;
        if (parts[0] === 'safe') return `Safe zone ${parts[2]}`;
        if (parts[0] === 'home') return `Home`;
        if (parts[0] === 'center') return `Bullseye`;
        return holeId;
    }
    
    // ================================================================
    // GET DETAILED ILLEGAL MOVE REASON
    // Explains WHY a move is not legal for better player understanding
    // ================================================================
    function getIllegalMoveReason(pegId, targetHoleId) {
        if (!gameState || !gameState.currentCard || !gameState.currentPlayer) {
            return 'No active card or player.';
        }
        
        const card = gameState.currentCard;
        const player = gameState.currentPlayer;
        const peg = player.peg.find(p => p.id === pegId);
        if (!peg) return 'Selected peg not found.';
        
        const cardRank = card.rank || card.value || '?';
        const hops = card.movement;
        const target = formatHoleId(targetHoleId);
        
        // Check specific reasons
        if (card.direction === 'backward') {
            if (targetHoleId.startsWith('ft-')) {
                return `The ${cardRank} moves backward — you cannot back into FastTrack holes.`;
            }
            if (targetHoleId.startsWith('safe-')) {
                return `The ${cardRank} moves backward — you cannot back into the Safe Zone.`;
            }
            if (targetHoleId === 'center') {
                return `The ${cardRank} moves backward — you cannot back into the Bullseye.`;
            }
        }
        
        if (peg.lockedToSafeZone && !targetHoleId.startsWith('safe-') && !targetHoleId.startsWith('home-') && card.direction !== 'backward') {
            return `This peg is locked to the Safe Zone — it can only move into safe zone holes or home.`;
        }
        
        if (peg.onFasttrack && peg.mustExitFasttrack) {
            if (targetHoleId.startsWith('ft-')) {
                return `A 4 was drawn — this peg must EXIT FastTrack to the outer track, not continue on the ring.`;
            }
        }
        
        // Check if own peg is blocking
        const ownPegBlocking = player.peg.find(p => p.holeId === targetHoleId && p.id !== pegId && !p.inBullseye);
        if (ownPegBlocking) {
            return `Your own peg is on ${target} — you cannot land on or pass through your own pegs.`;
        }
        
        // Distance check
        return `${target} is not exactly ${hops} ${hops === 1 ? 'hole' : 'holes'} away with the ${cardRank} card. Count carefully!`;
    }
    
    // Wrapper to use the full popup for hard mode illegal move reporting
    // (The styled popup is defined above with showIllegalMovePopup)
    
    function hideIllegalMovePopup() {
        const popup = document.getElementById('illegal-move-popup');
        if (popup) popup.remove();
    }
    window.hideIllegalMovePopup = hideIllegalMovePopup;
    
    // Track currently selected peg for dropdown
    let selectedPegForDropdown = null;
    
    // Track peg-selected state for destination-click workflow
    let selectedPegId = null;
    let selectedPegMoves = null;
    let selectedMoveToConfirm = null; // move object waiting for player confirmation
    let pegDestHighlightedHoles = [];   // holes highlighted for a specific peg's destinations
    let pegDestHighlightObjects = [];   // THREE.js objects (rings, labels) to clean up

    // ── Highlight all destination holes (and path) for a specific peg's moves ──
    function highlightPegDestinations(moves) {
        if (!moves || moves.length === 0) return;
        const destColors = {
            normal:    0x00ff88,
            fasttrack: 0xffcc00,
            bullseye:  0xff4488,
            safezone:  0x44aaff,
            cut:       0xff2222
        };

        moves.forEach(move => {
            const path = move.path || [];
            const destHoleId = move.toHoleId;

            // Highlight PATH holes (dim cyan trail)
            for (let i = 1; i < path.length - 1; i++) {
                const hole = holeRegistry.get(path[i]);
                if (!hole || !hole.mesh) continue;
                if (hole._pegDestSaved) continue; // already saved
                hole._pegDestSaved = hole.mesh.material;
                const progress = path.length > 2 ? (i - 1) / (path.length - 2) : 0.5;
                hole.mesh.material = new THREE.MeshStandardMaterial({
                    color: 0x00ccff,
                    emissive: 0x00ccff,
                    emissiveIntensity: 0.15 + progress * 0.35,
                    transparent: true,
                    opacity: 0.25 + progress * 0.3
                });
                pegDestHighlightedHoles.push(hole);
                // store pulse index for forward-traveling pulse animation
                hole.userData = hole.userData || {};
                hole.userData.pulseIndex = i;
            }

            // Highlight DESTINATION hole (bright glow + ring)
            const destHole = holeRegistry.get(destHoleId);
            if (!destHole || !destHole.mesh) return;
            let color = destColors.normal;
            if (move.isFastTrackEntry) color = destColors.fasttrack;
            else if (move.isLeaveFastTrack) color = 0x00ccff;  // Cyan for leave-FT
            else if (destHoleId === 'center') color = destColors.bullseye;
            else if (destHoleId.startsWith('safe-')) color = destColors.safezone;
            else if (findCutTargetAtHole(destHoleId)) color = destColors.cut;

            if (!destHole._pegDestSaved) {
                destHole._pegDestSaved = destHole.mesh.material;
                destHole.mesh.material = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.7,
                    transparent: true,
                    opacity: 0.85
                });
                pegDestHighlightedHoles.push(destHole);
                destHole.userData = destHole.userData || {};
                destHole.userData.pulseIndex = path.length; // destination pulses last in sequence
            }

            // Add a bright ring around destination
            // Larger ring for easier clicking; scale up on mobile
            const isMobile = window.innerWidth <= 768;
            const innerR = isMobile ? 12 : 6;
            const outerR = isMobile ? 28 : 9;
            const ringGeom = new THREE.RingGeometry(innerR, outerR, 48);
            const ringMat = new THREE.MeshBasicMaterial({
                color: color, transparent: true, opacity: 0.9, side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.position.copy(destHole.mesh.position);
            ring.position.y += 0.4;
            ring.rotation.x = -Math.PI / 2;
            // Add subtle pulsing metadata so animate loop can pulse the ring
            ring.userData = ring.userData || {};
            ring.userData.pulseSpeed = 2 + Math.random() * 1.5;
            ring.userData.baseScale = 1;
            boardGroup.add(ring);
            pegDestHighlightObjects.push(ring);

            // Attach pulse metadata to ring for coordinated animation
            ring.userData.moveId = move.id || `${move.pegId}-${move.toHoleId}`;
            ring.userData.pathLength = path.length;
            // Save reference to pulse-info on move for later (used for confirmation UI)
            move._pulse = move._pulse || {};
            move._pulse.ring = ring;
            move._pulse.path = path.slice();
        });
    }

    function clearPegDestinationHighlights() {
        pegDestHighlightedHoles.forEach(hole => {
            if (hole._pegDestSaved) {
                hole.mesh.material = hole._pegDestSaved;
                delete hole._pegDestSaved;
            }
        });
        pegDestHighlightedHoles = [];
        pegDestHighlightObjects.forEach(obj => {
            if (obj.parent) obj.parent.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        pegDestHighlightObjects = [];
        selectedPegId = null;
        selectedPegMoves = null;
        selectedMoveToConfirm = null;
    }
    
    function handleHoleClick(event) {
        console.log('[handleHoleClick] Click detected, splitMoveState.active:', splitMoveState?.active, 'phase:', splitMoveState?.phase);
        
        // SPLIT MODE: Special handling for 7 card split
        if (splitMoveState.active && (splitMoveState.phase === 'select_first_peg' || splitMoveState.phase === 'select_second_peg')) {
            console.log('[Split Click] In peg selection phase:', splitMoveState.phase);
            
            // In peg selection phase - check if a selectable peg was clicked
            const mouse = new THREE.Vector2(
                (event.clientX / window.innerWidth) * 2 - 1,
                -(event.clientY / window.innerHeight) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            // Pegs are added to scene, not boardGroup - check both
            const intersects = raycaster.intersectObjects(scene.children, true);
            
            console.log('[Split Click] Raycast found', intersects.length, 'intersections');
            
            // Log which pegs are selectable
            let selectablePegs = [];
            for (const [pegId, pegData] of pegRegistry) {
                if (pegData.isSplitSelectable) {
                    selectablePegs.push(pegId);
                }
            }
            console.log('[Split Click] Selectable pegs in registry:', selectablePegs);
            
            for (const intersect of intersects) {
                console.log('[Split Click] Checking intersect object:', intersect.object.type, intersect.object.name || '(unnamed)');
                
                for (const [pegId, pegData] of pegRegistry) {
                    if (pegData.isSplitSelectable && 
                        (pegData.bodyMesh === intersect.object || 
                         pegData.discMesh === intersect.object ||
                         pegData.touchMesh === intersect.object ||
                         pegData.mesh === intersect.object)) {
                        console.log('[Split Click] ✅ Peg clicked:', pegId);
                        if (handleSplitPegClick(pegId)) {
                            return;
                        }
                    }
                }
            }
            console.log('[Split Click] No selectable peg was clicked');
            return; // In peg selection phase, only accept peg clicks
        }
        
        // SPLIT MODE DEST SELECTION: Allow clicks during destination selection
        const inSplitDestPhase = splitMoveState.active && 
            (splitMoveState.phase === 'select_first_dest' || splitMoveState.phase === 'select_second_dest');
        
        if (!inSplitDestPhase && (gameState.phase !== 'play' || legalMoves.length === 0)) return;
        
        // Check if clicking outside dropdown to close it
        const dropdown = document.getElementById('peg-move-dropdown');
        if (dropdown.classList.contains('visible')) {
            if (!dropdown.contains(event.target)) {
                hidePegMoveDropdown();
            }
            return;
        }
        
        // Raycast to find clicked object
        const mouse = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObjects(boardGroup.children, true);
        
        for (const intersect of intersects) {
            // First check if a blinking peg was clicked (player's own peg with moves)
            for (const [pegId, pegData] of pegRegistry) {
                if (pegData.isBlinking && 
                    (pegData.bodyMesh === intersect.object || 
                     pegData.discMesh === intersect.object ||
                     pegData.touchMesh === intersect.object ||
                     pegData.mesh === intersect.object)) {
                    // Find all moves for this peg
                    const pegMoves = legalMoves.filter(m => m.pegId === pegId);
                    if (pegMoves.length >= 1) {
                        // Phase 1 — preview the first move for this peg (or the only move)
                        // The suggestion panel is already visible with buttons; tapping the peg
                        // previews move 0 for this peg (camera focus + confirm bar).
                        console.log('[Click] Peg clicked — entering Phase 1 preview', pegMoves.length, 'moves');
                        dismissCardRulePopup();
                        // Find the panel button for this peg's first move and highlight it
                        const firstMove = pegMoves[0];
                        const allMoves  = legalMoves;
                        const moveIdx   = allMoves.indexOf(firstMove);
                        const btnEl     = document.querySelector(`.msb-btn[data-move-idx="${moveIdx}"]`);
                        previewMove(firstMove, btnEl, MOVE_COLORS[firstMove._colorIdx ?? 0].hex);
                        return;
                    }
                }
            }
            
            // Check if ANY peg was clicked - might be at a legal destination (for cutting)
            for (const [pegId, pegData] of pegRegistry) {
                if (pegData.bodyMesh === intersect.object || 
                    pegData.discMesh === intersect.object ||
                    pegData.touchMesh === intersect.object ||
                    pegData.mesh === intersect.object) {
                    // Get the hole this peg is on
                    const pegHoleId = pegData.currentHole || pegData.holeId;
                    if (pegHoleId) {
                        // Check if this hole is a legal destination (via highlight OR legalMoves array)
                        const hole = holeRegistry.get(pegHoleId);
                        const isHighlighted = hole && hole.isHighlighted;
                        const isLegalDest = legalMoves.some(m => m.toHoleId === pegHoleId);
                        
                        if (isHighlighted || isLegalDest) {
                            console.log('[handleHoleClick] Clicked peg at legal destination:', pegHoleId, 'highlighted:', isHighlighted, 'inLegalMoves:', isLegalDest);
                            executeHoleClick(pegHoleId);
                            return;
                        }
                    }
                }
            }
            
            // Check if destination touch zone was clicked (MOBILE-FRIENDLY large hit area)
            if (intersect.object.userData && intersect.object.userData.isDestinationTarget) {
                const holeId = intersect.object.userData.holeId;
                if (holeId) {
                    console.log('[Click] Destination touch zone clicked:', holeId);
                    const hole = holeRegistry.get(holeId);
                    if (hole && hole.isHighlighted) {
                        executeHoleClick(holeId);
                        return;
                    }
                }
            }

            // Then check if a highlighted hole was clicked
            for (const [holeId, hole] of holeRegistry) {
                // Check both the hole mesh AND the touch mesh
                const isHoleMesh = hole.mesh === intersect.object;
                const isTouchMesh = hole.touchMesh === intersect.object;

                if (isHoleMesh || isTouchMesh) {
                    // If a peg was pre-selected and this hole is one of its destinations
                    if (selectedPegId && selectedPegMoves) {
                        const matchingMoves = selectedPegMoves.filter(m => m.toHoleId === holeId);
                        if (matchingMoves.length === 1) {
                            console.log('[Click] Glowing hole clicked with single move - executing');
                            clearPegDestinationHighlights();
                            hidePegMoveDropdown();
                            dismissCardRulePopup();
                            executeMoveDirectly(matchingMoves[0]);
                            return;
                        } else if (matchingMoves.length > 1) {
                            // Multiple moves to same hole (e.g. FT entry vs perimeter)
                            showHoleMoveDropdown(matchingMoves, event.clientX, event.clientY);
                            return;
                        }
                    }
                    // Accept click if highlighted OR if it's in the legalMoves destinations
                    const isLegalDest = legalMoves.some(m => m.toHoleId === holeId);
                    if (hole.isHighlighted || isLegalDest) {
                        // Find all moves for this hole (could be FT entry vs perimeter)
                        const movesForHole = legalMoves.filter(m => m.toHoleId === holeId);
                        if (movesForHole.length === 1) {
                            console.log('[Click] Glowing hole clicked - single move for hole, executing');
                            clearPegDestinationHighlights();
                            dismissCardRulePopup();
                            executeMoveDirectly(movesForHole[0]);
                        } else if (movesForHole.length > 1) {
                            // Ambiguous — require confirmation/choice
                            console.log('[Click] Glowing hole clicked - multiple moves for hole, showing choice');
                            showHoleMoveDropdown(movesForHole, event.clientX, event.clientY);
                        }
                        return;
                    }
                }
            }
        }
    }
    
    // Manual control mode - allow hole-to-hole jumping OR direct jump
    let manualMoveState = {
        active: false,
        pegId: null,
        startHole: null,
        currentHole: null,
        targetHole: null,
        path: [],
        totalSteps: 0,
        stepsTaken: 0,
        allValidMoves: [] // All possible destinations (1 to card value)
    };
    
    function isManualControlMode() {
        return window.gameControlMode === 'manual';
    }
    
    function startManualMoveSequence(moves) {
        if (!moves || moves.length === 0) return;
        
        // All moves should be for the same peg
        const pegId = moves[0].pegId;
        const startHole = moves[0].fromHoleId;
        
        // Find the maximum distance move (final destination)
        const maxMove = moves.reduce((max, m) => m.steps > max.steps ? m : max, moves[0]);
        
        manualMoveState.active = true;
        manualMoveState.pegId = pegId;
        manualMoveState.startHole = startHole;
        manualMoveState.currentHole = startHole;
        manualMoveState.targetHole = maxMove.toHoleId;
        manualMoveState.path = [startHole];
        manualMoveState.totalSteps = maxMove.steps;
        manualMoveState.stepsTaken = 0;
        manualMoveState.allValidMoves = moves;
        
        console.log('[Manual] Started manual sequence:', {
            pegId,
            from: startHole,
            to: maxMove.toHoleId,
            totalSteps: maxMove.steps,
            validMoves: moves.length
        });
    }
    
    function handleManualHoleClick(holeId) {
        if (!manualMoveState.active) return false;
        
        // Find if this hole is a valid destination
        const moveToHole = manualMoveState.allValidMoves.find(m => m.toHoleId === holeId);
        if (!moveToHole) {
            console.warn('[Manual] Clicked hole is not a valid destination:', holeId);
            return false;
        }
        
        console.log('[Manual] Executing move to:', holeId, 'steps:', moveToHole.steps);
        
        // Reset manual state
        manualMoveState.active = false;
        manualMoveState.pegId = null;
        manualMoveState.currentHole = null;
        manualMoveState.targetHole = null;
        manualMoveState.path = [];
        manualMoveState.totalSteps = 0;
        manualMoveState.stepsTaken = 0;
        manualMoveState.allValidMoves = [];
        
        // Execute the move through the game engine (it handles animation)
        executeMoveDirectly(moveToHole);
        return true;
    }
    
    function showPegMoveDropdown(pegId, moves, x, y) {
        selectedPegForDropdown = pegId;
        const dropdown = document.getElementById('peg-move-dropdown');
        const itemsContainer = document.getElementById('dropdown-items');
        
        // Update header with peg number
        const pegNum = getPegNumber(pegId);
        const headerTitle = dropdown.querySelector('.dropdown-title');
        if (headerTitle) {
            headerTitle.textContent = `Peg #${pegNum} - Choose Move`;
        }
        
        // Clear previous items
        itemsContainer.innerHTML = '';
        
        // Generate dropdown items for each move
        moves.forEach((move, index) => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            
            // Determine move type and styling
            let icon = '📍';
            let moveName = move.toHoleId;
            let moveSteps = `${move.steps} step${move.steps !== 1 ? 's' : ''}`;
            
            // Friendly name for destination
            const friendly = friendlyHoleName(move.toHoleId);
            
            // Check if this is a cut move
            const cutTarget = findCutTargetAtHole(move.toHoleId);
            if (cutTarget) {
                item.classList.add('cut-move');
                icon = '⚔️';
                moveName = `Cut at ${friendly}`;
                moveSteps = `Capture ${cutTarget.player.name}'s peg`;
            }
            // Check if FastTrack entry
            else if (move.isFastTrackEntry) {
                item.classList.add('fasttrack-move');
                icon = '⚡';
                moveName = 'Take the FastTrack shortcut';
            }
            // Check if leaving FastTrack to perimeter
            else if (move.isLeaveFastTrack) {
                if (move.isForcedFTExit) {
                    icon = '⚠️';
                    moveName = 'Blocked — Exit FastTrack';
                } else {
                    icon = '🔄';
                    moveName = `Exit FastTrack to ${friendly}`;
                }
            }
            // Check if bullseye/center
            else if (move.toHoleId === 'center') {
                item.classList.add('fasttrack-move');
                icon = '🎯';
                moveName = 'Enter the Bullseye';
                moveSteps = 'Safe spot — exit with J, Q, or K';
            }
            // Check if safe zone
            else if (move.toHoleId.startsWith('safe-')) {
                item.classList.add('safe-move');
                icon = '🛡️';
                moveName = friendly;
                moveSteps = 'Protected — cannot be cut!';
            }
            // Check if winner hole
            else if (move.toHoleId.includes('winner')) {
                item.classList.add('safe-move');
                icon = '🏆';
                moveName = 'Winner Hole!';
            }
            // Enter from holding
            else if (move.type === 'enter') {
                icon = '🚀';
                moveName = 'Enter the board';
                moveSteps = 'Bring a peg into play';
            }
            // Home hole
            else if (move.toHoleId.startsWith('home-')) {
                icon = '💎';
                moveName = friendly;
            }
            // FastTrack corner (traversing)
            else if (move.toHoleId.startsWith('ft-')) {
                icon = '⭐';
                moveName = friendly;
            }
            // Regular perimeter hole
            else {
                moveName = `Move to ${friendly}`;
            }
            
            item.innerHTML = `
                <span class="move-icon">${icon}</span>
                <div class="move-details">
                    <div class="move-name">${moveName}</div>
                    <div class="move-steps">${moveSteps}</div>
                </div>
            `;
            
            // Add click handler - pass full move object, not just holeId
            // This is important for FastTrack entry where two moves have same holeId
            item.addEventListener('click', () => {
                console.log('📍 Dropdown click - executing move:', move, 'isFastTrackEntry:', move.isFastTrackEntry);
                hidePegMoveDropdown();
                executeMoveDirectly(move);
            });
            
            itemsContainer.appendChild(item);
        });
        
        // Position dropdown near the click point; on mobile place at bottom center to avoid covering board
        if (window.innerWidth <= 768) {
            dropdown.style.left = '50%';
            dropdown.style.transform = 'translateX(-50%)';
            dropdown.style.bottom = '12px';
            dropdown.style.top = 'auto';
            dropdown.style.maxHeight = '40vh';
            dropdown.style.overflowY = 'auto';
        } else {
            dropdown.style.left = `${Math.min(x, window.innerWidth - 260)}px`;
            dropdown.style.top = `${Math.min(y, window.innerHeight - 300)}px`;
            dropdown.style.transform = '';
            dropdown.style.bottom = 'auto';
            dropdown.style.maxHeight = '';
            dropdown.style.overflowY = '';
        }
        dropdown.classList.add('visible');
    }
    
    function hidePegMoveDropdown() {
        const dropdown = document.getElementById('peg-move-dropdown');
        dropdown.classList.remove('visible');
        selectedPegForDropdown = null;
    }

    // ===================== Confirm Bar =====================
    function ensureConfirmBarExists() {
        if (document.getElementById('confirm-move-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'confirm-move-bar';
        bar.innerHTML = `<div class="confirm-inner">
            <button id="confirm-move-btn" class="btn primary">Confirm Move</button>
            <button id="cancel-move-btn" class="btn">Cancel</button>
        </div>`;
        document.body.appendChild(bar);
        document.getElementById('confirm-move-btn').addEventListener('click', () => {
            if (selectedMoveToConfirm) {
                console.log('[Confirm] Executing confirmed move:', selectedMoveToConfirm);
                hideConfirmBar();
                const mv = selectedMoveToConfirm;
                selectedMoveToConfirm = null;
                clearPegDestinationHighlights();
                dismissCardRulePopup();
                executeMoveDirectly(mv);
            }
        });
        document.getElementById('cancel-move-btn').addEventListener('click', () => {
            hideConfirmBar();
            clearPegDestinationHighlights();
        });
    }

    function showConfirmBar() {
        ensureConfirmBarExists();
        const bar = document.getElementById('confirm-move-bar');
        bar.classList.add('visible');
        // On mobile, ensure bar is bottom-anchored; on desktop place near center-bottom
        return bar;
    }

    function hideConfirmBar() {
        const bar = document.getElementById('confirm-move-bar');
        if (bar) bar.classList.remove('visible');
    }
    
    // Expose to global scope for onclick
    window.hidePegMoveDropdown = hidePegMoveDropdown;
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('peg-move-dropdown');
        if (dropdown && dropdown.classList.contains('visible')) {
            // Check if click is outside dropdown
            if (!dropdown.contains(e.target)) {
                hidePegMoveDropdown();
            }
        }
        
        // Global panel dismiss: close info panels when tapping outside
        // Mom Help Panel
        const momHelp = document.getElementById('mom-help-panel');
        if (momHelp && momHelp.classList.contains('visible') && !momHelp.contains(e.target)) {
            hideMomHelp();
        }
        
        // Rules Modal
        const rulesModal = document.getElementById('rules-modal');
        if (rulesModal && rulesModal.classList.contains('visible')) {
            const rulesContent = rulesModal.firstElementChild;
            if (rulesContent && !rulesContent.contains(e.target)) {
                toggleRulesModal();
            }
        }
        
        // Illegal Move Popup - auto-dismiss on outside tap
        const illegalPopup = document.getElementById('illegal-move-popup');
        if (illegalPopup && illegalPopup.style.display !== 'none' && !illegalPopup.contains(e.target)) {
            hideIllegalMovePopup();
        }
    });
    
    // Close dropdown with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const dropdown = document.getElementById('peg-move-dropdown');
            if (dropdown && dropdown.classList.contains('visible')) {
                hidePegMoveDropdown();
                e.preventDefault();
            }
        }
    });
    
    // Execute a move by clicking on a hole (called by handleHoleClick or AI)
    function executeHoleClick(holeId) {
        // Allow split mode to proceed even in different game phases
        const inSplitDestPhase = splitMoveState.active && 
            (splitMoveState.phase === 'select_first_dest' || splitMoveState.phase === 'select_second_dest');
        
        if (!inSplitDestPhase && (gameState.phase !== 'play' || legalMoves.length === 0)) return;
        
        // Find ALL moves to this hole (there may be multiple, e.g., FastTrack entry vs regular)
        const movesToHole = legalMoves.filter(m => m.toHoleId === holeId);
        if (movesToHole.length === 0) {
            console.warn('No legal move to hole:', holeId);
            return;
        }
        
        // If multiple moves to same hole, show dropdown to let player choose
        if (movesToHole.length > 1) {
            console.log('📍 Multiple moves to same hole, showing choice dropdown:', movesToHole);
            // Show dropdown near center of screen
            showHoleMoveDropdown(movesToHole, window.innerWidth / 2, window.innerHeight / 2);
            return;
        }
        
        // Single move - execute directly
        executeMoveDirectly(movesToHole[0]);
    }
    
    // Show dropdown when multiple moves go to same destination (e.g., FastTrack entry options)
    function showHoleMoveDropdown(moves, x, y) {
        const dropdown = document.getElementById('peg-move-dropdown');
        if (!dropdown) return;
        
        const header = dropdown.querySelector('.dropdown-header');
        const itemsContainer = document.getElementById('dropdown-items');
        
        if (!itemsContainer) {
            console.error('dropdown-items container not found!');
            return;
        }
        
        const titleEl = dropdown.querySelector('.dropdown-title');
        if (titleEl) titleEl.textContent = '🎯 Choose Move Type';
        itemsContainer.innerHTML = '';
        
        moves.forEach((move) => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            
            let icon = '📍';
            let moveName = move.toHoleId;
            let moveDesc = '';
            
            if (move.isFastTrackEntry) {
                icon = '⚡';
                moveName = 'Enter FastTrack';
                moveDesc = 'Traverse inner ring';
                item.classList.add('fasttrack-move');
            } else if (move.isLeaveFastTrack && move.isForcedFTExit) {
                icon = '⚠️';
                moveName = 'Blocked — Exit FastTrack';
                moveDesc = 'Own peg blocking FT ring';
            } else if (move.isLeaveFastTrack) {
                icon = '🔄';
                moveName = 'Leave FastTrack';
                moveDesc = 'Continue on outer perimeter';
            } else if (move.isCenterOption) {
                icon = '🎯';
                moveName = 'Enter Bullseye';
                moveDesc = 'Center hole';
                item.classList.add('fasttrack-move');
            } else if (move.toHoleId.startsWith('ft-')) {
                icon = '⏭️';
                moveName = 'Continue on Track';
                moveDesc = 'Stay on perimeter';
            } else {
                moveName = move.toHoleId;
                moveDesc = `${move.steps} steps`;
            }
            
            item.innerHTML = `
                <span class="move-icon">${icon}</span>
                <div class="move-details">
                    <div class="move-name">${moveName}</div>
                    <div class="move-steps">${moveDesc}</div>
                </div>
            `;
            
            item.addEventListener('click', () => {
                console.log('📍 Hole dropdown click - executing move:', move, 'isFastTrackEntry:', move.isFastTrackEntry);
                hidePegMoveDropdown();
                executeMoveDirectly(move);
            });
            
            itemsContainer.appendChild(item);
        });
        
        dropdown.style.left = `${Math.min(x - 100, window.innerWidth - 220)}px`;
        dropdown.style.top = `${Math.min(y - 50, window.innerHeight - 300)}px`;
        dropdown.classList.add('visible');
    }
    
    // Execute a move directly (called by dropdown or executeHoleClick)
    // This ensures the correct move object is used, including isFastTrackEntry flag
    function executeMoveDirectly(move) {
        if (!move) {
            console.error('📍 executeMoveDirectly: No move provided!');
            return;
        }

        console.log('📍 executeMoveDirectly called:', move.toHoleId, 'type:', move.type, 'isFastTrackEntry:', move.isFastTrackEntry, 'splitPhase:', splitMoveState?.phase);

        // SPLIT MODE: Handle first destination click BEFORE phase check
        // (Split mode continues in 'play' phase but we want to be lenient)
        if (splitMoveState && splitMoveState.active && splitMoveState.phase === 'select_first_dest') {
            executeSplitMoveFirst(move);
            return;
        }

        // SPLIT MODE: Handle second destination click
        if (splitMoveState && splitMoveState.active && splitMoveState.phase === 'select_second_dest') {
            executeSplitMoveSecond(move);
            return;
        }

        // Phase check for non-split moves
        if (gameState.phase !== 'play') {
            console.error('📍 executeMoveDirectly: Wrong phase!', gameState.phase, 'expected: play');
            // PHASE RECOVERY: If stuck in 'animating' for too long, force back to 'play' and retry
            if (gameState.phase === 'animating') {
                console.warn('⚠️ PHASE RECOVERY: Forcing phase from animating → play');
                gameState.phase = 'play';
                // Retry the move after recovery
                setTimeout(() => executeMoveDirectly(move), 100);
                return;
            }
            // If phase is 'draw', the move came too late — skip this call
            if (gameState.phase === 'draw') {
                console.warn('⚠️ executeMoveDirectly called during draw phase — ignoring stale move');
                return;
            }
            return;
        }

        // Safe to dismiss card overlay — move WILL execute (all guards passed)
        hideCenteredDeck();

        // Execute the move immediately when clicking a highlighted hole
        hideTurnBanner();
        clearHighlights();
        
        // SPECIAL: Joker backward move - show jack-in-the-box celebration!
        if (move.type === 'joker_backward') {
            console.log('🃏 [Joker Backward] Triggering special effects!');
            showJokerBackwardCelebration(move, () => {
                console.log('[executeMoveDirectly] Starting animation for Joker backward move:', move.toHoleId);
                animatePegMove(move, () => {
                    console.log('[executeMoveDirectly] Animation complete, calling gameState.executeMove');
                    gameState.executeMove(move);
                    console.log('[executeMoveDirectly] gameState.executeMove returned, phase is now:', gameState.phase);
                    
                    // BoardManifold: validate landing
                    if (window.BoardManifold && move.pegId) {
                        const peg = (gameState.currentPlayer?.peg || []).find(p => p.id === move.pegId);
                        const actualHole = peg ? peg.holeId : move.toHoleId;
                        const landingResult = BoardManifold.validateLanding(move.pegId, actualHole, move.toHoleId, gameState.currentCard?.rank);
                        if (!landingResult.valid) {
                            console.error(`[BoardManifold] LANDING VIOLATION: ${landingResult.reason}`);
                        } else {
                            console.log(`[BoardManifold] Landing validated: ${move.pegId} → ${actualHole}`);
                        }
                    }
                    cardUI.clearCard();
                    if (window.mobileUI) window.mobileUI.hideFloatingCard();
                });
            });
        } else {
            // Normal move execution
            console.log('[executeMoveDirectly] Starting animation for move:', move.toHoleId);
            animatePegMove(move, () => {
                console.log('[executeMoveDirectly] Animation complete, calling gameState.executeMove');
                
                // Dispatch event for Mom Daemon
                document.dispatchEvent(new CustomEvent('moveMade', { detail: { move } }));
                
                gameState.executeMove(move);
                console.log('[executeMoveDirectly] gameState.executeMove returned, phase is now:', gameState.phase);
                
                // BoardManifold: validate landing — guarantee peg is in the correct hole
                if (window.BoardManifold && move.pegId) {
                    const peg = (gameState.currentPlayer?.peg || []).find(p => p.id === move.pegId);
                    const actualHole = peg ? peg.holeId : move.toHoleId;
                    const landingResult = BoardManifold.validateLanding(move.pegId, actualHole, move.toHoleId, gameState.currentCard?.rank);
                    if (!landingResult.valid) {
                        console.error(`[BoardManifold] LANDING VIOLATION: ${landingResult.reason}`);
                    } else {
                        console.log(`[BoardManifold] Landing validated: ${move.pegId} → ${actualHole}`);
                    }
                }
                cardUI.clearCard();
                if (window.mobileUI) window.mobileUI.hideFloatingCard();
            });
        }
    }
    // Expose executeMoveDirectly and executeHoleClick for external modules (ask_mom.js)
    window.executeMoveDirectly = executeMoveDirectly;
    window.executeHoleClick = executeHoleClick;
    window.clearHighlights = clearHighlights;
    window.getPegNumber = getPegNumber;
    window.getTrackDistance = getTrackDistance;
    
    function executeSplitMoveFirst(move) {
        console.log('[Split] First move:', move, 'Steps used:', move.steps);
        
        // Update split state
        splitMoveState.usedMoves = move.steps;
        splitMoveState.remainingMoves = 7 - move.steps;
        splitMoveState.firstMovePeg = move.pegId;
        
        // Track whether the first sub-move was an FT traversal
        const peg = gameState.currentPlayer.peg.find(p => p.id === move.pegId);
        const firstMoveIsFT = (peg && peg.onFasttrack) || move.isFastTrackEntry === true;
        splitMoveState.firstMoveWasFT = firstMoveIsFT;
        
        // Clear highlights and indicators
        hideTurnBanner();
        clearHighlights();
        hideSplitMoveIndicator();
        
        // Execute the move without ending turn
        const cutPeg = gameState.executeMoveWithoutEndingTurn ? 
            gameState.executeMoveWithoutEndingTurn(move) : 
            null;
        
        // If all 7 moves used on first peg, end turn after animation
        if (splitMoveState.remainingMoves === 0) {
            console.log('[Split] All 7 moves used on first peg - ending turn');

            animatePegMove(move, () => {
                function doEndTurn() {
                    resetSplitMoveState();
                    cardUI.clearCard();
                    if (window.mobileUI) window.mobileUI.hideFloatingCard();
                    gameState.endTurn();
                }
                if (cutPeg) {
                    window._cutSceneActive = true;
                    animateCut(cutPeg, null, () => {
                        window._cutSceneActive = false;
                        doEndTurn();
                    });
                } else {
                    doEndTurn();
                }
            });
            return;
        }

        // Animate the first move, then transition to second peg selection
        animatePegMove(move, () => {
            if (cutPeg) {
                window._cutSceneActive = true;
                animateCut(cutPeg, null, () => { window._cutSceneActive = false; });
            }
            // Transition to second peg selection
            transitionToSecondPegSelection();
        });
    }
    
    function transitionToSecondPegSelection() {
        const player = gameState.currentPlayer;
        const remaining = splitMoveState.remainingMoves;
        
        console.log('[Split] Transitioning to second peg selection. Remaining moves:', remaining);
        
        // Find all active pegs that can be selected for second move (not the first peg)
        const selectablePegs = [];
        
        for (const peg of player.peg) {
            console.log('[Split] Checking peg', peg.id, 'at', peg.holeId, 'holeType:', peg.holeType);
            
            // Skip holding pegs
            if (peg.holeType === 'holding') {
                console.log('[Split] Skipping peg', peg.id, '- in holding');
                continue;
            }
            
            // Can't move same peg twice in a split
            if (peg.id === splitMoveState.firstMovePeg) {
                console.log('[Split] Skipping peg', peg.id, '- already moved in first part of split');
                continue;
            }
            
            // Skip completed circuit pegs
            if (peg.completedCircuit) {
                console.log('[Split] Skipping peg', peg.id, '- completed circuit');
                continue;
            }
            
            // Skip bullseye pegs
            if (peg.inBullseye || peg.holeType === 'bullseye') {
                console.log('[Split] Skipping peg', peg.id, '- in bullseye');
                continue;
            }
            
            // Check if this peg has valid moves with remaining steps
            console.log('[Split] Calculating moves for peg', peg.id, 'with', remaining, 'steps');
            const testMoves = calculateMovesForPegRange(peg, remaining, remaining);
            console.log('[Split] Peg', peg.id, 'has', testMoves.length, 'valid moves for', remaining, 'steps');
            if (testMoves.length > 0) {
                selectablePegs.push(peg.id);
            }
        }
        
        if (selectablePegs.length === 0) {
            // No second moves available - end split and turn
            console.log('[Split] No pegs can move remaining ' + remaining + ' spaces - ending turn');
            cardUI.showMessage('No peg can move ' + remaining + ' spaces', 2000);
            setTimeout(() => {
                resetSplitMoveState();
                cardUI.clearCard();
                if (window.mobileUI) window.mobileUI.hideFloatingCard();
                gameState.endTurn();
            }, 2000);
            return;
        }
        
        console.log('[Split] Found ' + selectablePegs.length + ' pegs that can move ' + remaining + ' spaces:', selectablePegs);
        
        // Enter second peg selection phase
        splitMoveState.phase = 'select_second_peg';
        splitMoveState.selectablePegs = selectablePegs;
        
        // Highlight selectable pegs and show their numbers
        highlightSelectablePegsForSplit(selectablePegs);
        showPegNumbers(selectablePegs);
        
        // Re-add click listener (may have been removed by previous operations)
        addHoleClickListeners();
        
        // Build peg list for message
        const pegList = selectablePegs.map(id => `#${getPegNumber(id)}`).join(', ');
        
        // Show instruction with peg numbers
        showSplitMoveIndicator(`Tap peg (${pegList}) for ${remaining}`, remaining);
        
        // For AI, auto-select using planned second move or best available
        if (isAIPlayer(gameState.currentPlayerIndex)) {
            setTimeout(() => {
                const planned = splitMoveState.aiPlannedSecondMove;
                if (planned && selectablePegs.includes(planned.pegId)) {
                    // Use the pre-planned second move
                    console.log(`🤖 [AI Split] Using planned 2nd move: ${planned.pegId}→${planned.toHoleId}`);
                    splitMoveState.selectedPeg = planned.pegId;
                    splitMoveState.phase = 'select_second_dest';
                    clearSplitPegHighlights();
                    hidePegNumbers();
                    legalMoves = [planned];
                    clearHighlights();
                    executeMoveDirectly(planned);
                } else {
                    // Fallback: pick first available peg
                    handleSplitPegClick(selectablePegs[0]);
                }
            }, AI_CONFIG.thinkingDelay || 500);
        }
    }
    
    function executeSplitMoveSecond(move) {
        console.log('[Split] Second move:', move);
        
        // Clear all states and indicators
        hideTurnBanner();
        clearHighlights();
        clearSplitPegHighlights();
        hideSplitMoveIndicator();
        hidePegNumbers();
        
        // Execute the move without ending turn (to handle cuts properly)
        const cutPeg = gameState.executeMoveWithoutEndingTurn ? 
            gameState.executeMoveWithoutEndingTurn(move) : 
            null;
        
        // Animate and execute second move
        animatePegMove(move, () => {
            function doEndTurn() {
                resetSplitMoveState();
                cardUI.clearCard();
                if (window.mobileUI) window.mobileUI.hideFloatingCard();
                gameState.endTurn();
            }
            if (cutPeg) {
                window._cutSceneActive = true;
                animateCut(cutPeg, null, () => {
                    window._cutSceneActive = false;
                    doEndTurn();
                });
            } else {
                doEndTurn();
            }
        });
    }

    // Phase recovery watchdog — detects stuck animations and forces completion
    let _animationWatchdogTimer = null;
    function startAnimationWatchdog(onComplete, move) {
        clearAnimationWatchdog();
        _animationWatchdogTimer = setTimeout(() => {
            _animationWatchdogTimer = null;
            // If phase is still 'play' and no highlights visible, the animation callback never fired
            if (gameState && gameState.phase === 'play' && legalMoves.length === 0) {
                console.error('⏰ WATCHDOG: Animation callback never fired! Forcing completion for move:', move?.toHoleId);
                if (onComplete) {
                    try { onComplete(); } catch(e) { console.error('⏰ WATCHDOG onComplete error:', e); }
                }
            }
            // If stuck in 'animating' phase (executeMove started but endTurn never completed)
            if (gameState && gameState.phase === 'animating') {
                console.error('⏰ WATCHDOG: Stuck in animating phase! Forcing endTurn');
                resetSplitMoveState();
                gameState.phase = 'play';
                gameState.endTurn();
            }
        }, 15000); // 15 second safety net
    }
    function clearAnimationWatchdog() {
        if (_animationWatchdogTimer) {
            clearTimeout(_animationWatchdogTimer);
            _animationWatchdogTimer = null;
        }
    }

    function animatePegMove(move, onComplete) {
        // Dismiss card rule popup when move begins
        dismissCardRulePopup();
        
        // Turn timer removed
        
        // Dispatch animation start event for mobile UI auto-hide
        if (typeof MobileUI !== 'undefined' && MobileUI.dispatchAnimationStart) {
            MobileUI.dispatchAnimationStart();
        }
        
        // Start watchdog timer — if animation callback doesn't fire within 15s, force it
        const wrappedComplete = () => {
            _pegMoveInProgress = false;
            // Clear moving-peg tracking in CameraDirector & restore damping
            if (CameraDirector._movingPegPos) {
                CameraDirector._movingPegPos = null;
                if (CameraDirector._preMoveD !== undefined) {
                    CameraDirector._damping = CameraDirector._preMoveD;
                    delete CameraDirector._preMoveD;
                }
            }
            clearAnimationWatchdog();
            // Dispatch animation end event for mobile UI
            if (typeof MobileUI !== 'undefined' && MobileUI.dispatchAnimationEnd) {
                MobileUI.dispatchAnimationEnd();
            }
            if (onComplete) onComplete();
        };
        startAnimationWatchdog(onComplete, move);
        
        // Hide mobile UI elements during animation
        if (window.mobileUI) {
            window.mobileUI.hideMoves();
            window.mobileUI.hideCardPopup();
            // Keep floating card visible but will hide after move completes
        }
        
        // Show move announcement for all players
        const player = gameState.currentPlayer;
        const playerName = player.name || `Player ${gameState.currentPlayerIndex + 1}`;
        const card = gameState.currentCard;
        const spaces = move.steps || (card ? card.movement : '?');
        const direction = card ? card.direction : null;
        showMoveAnnouncement(playerName, spaces, direction);
        
        // Find the peg mesh
        const pegData = player.peg.find(p => p.id === move.pegId);
        const peg = pegRegistry.get(move.pegId);
        
        if (!peg || !peg.mesh) {
            console.warn('Peg mesh not found for:', move.pegId);
            clearAnimationWatchdog();
            if (onComplete) onComplete();
            return;
        }
        
        // Get the path to traverse (array of hole IDs)
        const path = move.path || [move.fromHoleId, move.toHoleId];
        console.log(`🛤️ Path traversal: ${path.join(' → ')}`);
        
        // ── CAMERA FOCUS FIRST ──
        // Focus camera on the peg's starting position before any movement begins.
        // Once the camera arrives, THEN start the hop animation.
        const pegStartX = peg.mesh.position.x;
        const pegStartZ = peg.mesh.position.z;
        
        function beginHopsAfterFocus() {
            _pegMoveInProgress = true;
            
            // If path only has starting position or just 1-2 holes, do direct animation
            if (path.length <= 2) {
                animatePegDirect(peg, move, wrappedComplete);
                return;
            }
            
            // Animate through each hole in the path (skip first which is starting position)
            let currentHopIndex = 1;
            const hopDuration = 350; // ms per hop - slower for better visual tracking
            const pegHeight = 10; // Consistent peg height above holes
            const hopArc = 12; // Arc height during hop
            const totalHops = path.length - 1;  // Total steps for sound progressions
            
            function animateNextHop() {
                if (currentHopIndex >= path.length) {
                    // Animation complete - ensure final position
                    const finalHole = holeRegistry.get(move.toHoleId);
                    if (finalHole) {
                        const fx = finalHole.position ? finalHole.position.x : finalHole.x;
                        const fz = finalHole.position ? finalHole.position.z : finalHole.z;
                        peg.mesh.position.set(fx, pegHeight, fz);
                    }
                    peg.currentHole = move.toHoleId;
                    hideAIThinking();
                    if (wrappedComplete) wrappedComplete();
                    return;
                }
                
                const targetHoleId = path[currentHopIndex];
                const targetHole = holeRegistry.get(targetHoleId);
                
                if (!targetHole) {
                    console.warn('Hop target hole not found:', targetHoleId);
                    currentHopIndex++;
                    animateNextHop();
                    return;
                }
                
                const targetX = targetHole.position ? targetHole.position.x : targetHole.x;
                const targetZ = targetHole.position ? targetHole.position.z : targetHole.z;
                
                // Capture start position for this hop
                const startX = peg.mesh.position.x;
                const startZ = peg.mesh.position.z;
                const hopStartTime = Date.now();
                
                // Simple bouncy hop animation
                function animateHop() {
                    const elapsed = Date.now() - hopStartTime;
                    const progress = Math.min(elapsed / hopDuration, 1);
                    
                    if (progress >= 1) {
                        // Land at target hole
                        peg.mesh.position.set(targetX, pegHeight, targetZ);
                        
                        // Play step sound when landing on each hole!
                        if (window.GameSFX) {
                            GameSFX.playStep(currentHopIndex - 1, totalHops);
                        }
                        
                        currentHopIndex++;
                        // Immediately start next hop
                        animateNextHop();
                        return;
                    }
                    
                    // Linear interpolation for X/Z movement
                    const t = progress;
                    const x = startX + (targetX - startX) * t;
                    const z = startZ + (targetZ - startZ) * t;
                    
                    // Parabolic arc for Y (hop up and down)
                    const hopProgress = Math.sin(progress * Math.PI);
                    const y = pegHeight + hopProgress * hopArc;
                    
                    peg.mesh.position.set(x, y, z);
                    
                    // Camera follows peg every frame during movement
                    updateCameraForPegMove(x, z);
                    
                    requestAnimationFrame(animateHop);
                }
                
                animateHop();
            }
            
            animateNextHop();
        }
        
        // Focus camera on moving peg before hops — respects the 3 camera modes:
        //   • Auto / Temp-explore (_tempManualOverride): ALWAYS follow the action.
        //     Temp explore is per-turn; the user still needs to see peg moves.
        //   • Explicit lock (fixedViewsActive / straight-down / angled):
        //     User chose this deliberately — camera never moves, even for peg animation.
        if (fixedViewsActive) {
            // Explicit lock: start hops immediately without moving camera
            // (legacy _allowCameraWrite removed — CameraDirector handles camera)
            beginHopsAfterFocus();
        } else {
            // Auto or temp-explore: snap camera to peg (highest priority)
            userIsInteracting = false; // clear touch/click interaction block
            if (userInteractionTimeout) {
                clearTimeout(userInteractionTimeout);
                userInteractionTimeout = null;
            }
            // (legacy _allowCameraWrite removed — CameraDirector handles camera)

            const camHeight = 250;
            const camOffset = 120;
            smoothCameraTransition(
                { x: pegStartX * 0.6, y: camHeight, z: pegStartZ * 0.6 + camOffset },
                { x: pegStartX, y: 0, z: pegStartZ },
                500, // Fast snap: 500 ms
                beginHopsAfterFocus,
                { force: true } // bypass remaining guards
            );
        }
    }
    
    // Direct animation (no path traversal - for enter moves etc)
    function animatePegDirect(peg, move, onComplete) {
        console.log('[animatePegDirect] Starting direct animation for:', move.toHoleId);
        const destHole = holeRegistry.get(move.toHoleId);
        if (!destHole) {
            console.warn('[animatePegDirect] Destination hole not found:', move.toHoleId);
            if (onComplete) onComplete();
            return;
        }
        
        // Get destination coordinates
        const destX = destHole.position ? destHole.position.x : destHole.x;
        const destZ = destHole.position ? destHole.position.z : destHole.z;
        const pegHeight = 10;
        const hopArc = 20; // Slightly higher arc for direct moves
        
        // Capture start position
        const startX = peg.mesh.position.x;
        const startZ = peg.mesh.position.z;
        
        const duration = 400; // Quick direct hop
        const startTime = Date.now();
        
        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress >= 1) {
                console.log('[animatePegDirect] Animation complete, calling onComplete');
                peg.mesh.position.set(destX, pegHeight, destZ);
                peg.currentHole = move.toHoleId;
                
                // Update camera (never in manual mode)
                if (!userOverrideCamera && currentCameraView !== 'manual') {
                    controls.target.set(destX, 0, destZ);
                    camera.lookAt(controls.target);
                }
                
                hideAIThinking();
                if (onComplete) {
                    console.log('[animatePegDirect] Calling onComplete callback NOW');
                    onComplete();
                } else {
                    console.warn('[animatePegDirect] No onComplete callback provided!');
                }
                return;
            }
            
            // Linear interpolation for X/Z
            const t = progress;
            const x = startX + (destX - startX) * t;
            const z = startZ + (destZ - startZ) * t;
            
            // Parabolic arc for Y
            const hopProgress = Math.sin(progress * Math.PI);
            const y = pegHeight + hopProgress * hopArc;
            
            peg.mesh.position.set(x, y, z);
            
            // Update camera for ground/chase modes
            if (typeof updateCameraForPegMove === 'function') {
                updateCameraForPegMove(x, z);
            }
            
            requestAnimationFrame(animate);
        }
        
        animate();
    }
    
    // Helper function to instantly update peg position (for analyzer corrections)
    function updatePegPosition(pegId, toHoleId) {
        const peg = pegRegistry.get(pegId);
        const targetHole = holeRegistry.get(toHoleId);
        
        if (!peg || !peg.mesh || !targetHole) {
            console.warn('🔧 updatePegPosition: Could not find peg or hole', pegId, toHoleId);
            return false;
        }
        
        const x = targetHole.position ? targetHole.position.x : targetHole.x;
        const z = targetHole.position ? targetHole.position.z : targetHole.z;
        const y = LINE_HEIGHT + 10;  // Standard peg height
        
        peg.mesh.position.set(x, y, z);
        peg.currentHole = toHoleId;
        
        console.log(`🔧 updatePegPosition: Moved ${pegId} to ${toHoleId} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        return true;
    }
    
    // Expose updatePegPosition globally for analyzer corrections
    window.updatePegPosition = updatePegPosition;
    
    function animateCut(cutPegInfo, moveInfo, onComplete) {
        // ============================================================
        // CINEMATIC VANQUISH SEQUENCE
        // 1. Camera smoothly focuses on vanquished peg
        // 2. Sad wail plays as peg slowly arcs to holding area
        // 3. Camera follows the peg all the way to holding
        // 4. Pause at landing so player sees the peg arrive home
        // 5. Camera smoothly pans back to the triumphant attacker peg
        // 6. Attacker peg does a victory dance with jingle
        // ============================================================
        console.log('🎬 Cinematic vanquish for:', cutPegInfo);
        
        if (!cutPegInfo || !cutPegInfo.peg || !cutPegInfo.player) {
            console.warn('Invalid cut peg info');
            return;
        }
        
        const victimPlayer = cutPegInfo.player;
        const victimPeg = cutPegInfo.peg;
        const pegMesh = pegRegistry.get(victimPeg.id);
        
        if (!pegMesh || !pegMesh.mesh) {
            console.warn('Cut peg mesh not found:', victimPeg.id);
            return;
        }
        
        // Game engine already set victimPeg.holeId to the target holding hole
        const targetHoleId = victimPeg.holeId;
        const targetHole = holeRegistry.get(targetHoleId);
        
        if (!targetHole) {
            console.error('Target hole not found for cut peg animation:', targetHoleId);
            return;
        }
        
        // Get target position
        const targetX = targetHole.position ? targetHole.position.x : targetHole.x;
        const targetZ = targetHole.position ? targetHole.position.z : targetHole.z;
        
        // === PHASE 1: Focus camera on victim, then arc to holding ===
        const startPos = pegMesh.mesh.position.clone();
        const endPos = new THREE.Vector3(targetX, LINE_HEIGHT + 10, targetZ);
        
        // Calculate distance for proportional arc height
        const dist = startPos.distanceTo(endPos);
        const maxArcHeight = Math.max(LINE_HEIGHT + 80, dist * 0.6);
        
        const isManual = currentCameraView === 'manual';
        
        // Play the sad vanquish sound
        if (window.GameSFX) {
            GameSFX.playVanquishSad();
        }
        
        // First: smooth camera pan to victim peg, THEN start the arc
        if (!isManual && !userIsInteracting) {
            const camOffset = 80;
            smoothCameraTransition(
                { x: startPos.x + camOffset * 0.5, y: maxArcHeight + 60, z: startPos.z + camOffset },
                { x: startPos.x, y: LINE_HEIGHT + 10, z: startPos.z },
                1200,
                beginCinematicArc
            );
        } else {
            beginCinematicArc();
        }
        
        function beginCinematicArc() {
            const arcDuration = 2800; // Slow dramatic arc
            const arcStartTime = Date.now();
            
            function animateCinematicArc() {
                const elapsed = Date.now() - arcStartTime;
                const progress = Math.min(elapsed / arcDuration, 1);
                
                // Ultra-smooth ease-in-out (slow start, slow finish, dramatic middle)
                const t = -(Math.cos(Math.PI * progress) - 1) / 2;
                
                // Horizontal interpolation
                const x = startPos.x + (endPos.x - startPos.x) * t;
                const z = startPos.z + (endPos.z - startPos.z) * t;
                
                // Dramatic parabolic arc - high peak in the middle
                const arcT = Math.sin(progress * Math.PI);
                const baseY = startPos.y + (endPos.y - startPos.y) * t;
                const y = baseY + arcT * maxArcHeight;
                
                pegMesh.mesh.position.set(x, y, z);
                
                // Slow mournful spin
                pegMesh.mesh.rotation.y += 0.04;
                
                // Slight wobble for drama
                pegMesh.mesh.rotation.x = Math.sin(progress * Math.PI * 3) * 0.15;
                pegMesh.mesh.rotation.z = Math.cos(progress * Math.PI * 2) * 0.1;
                
                // Camera smoothly follows the arcing peg all the way to holding
                if (!isManual && !userIsInteracting) {
                    controls.target.x += (x - controls.target.x) * 0.025;
                    controls.target.y += (y - controls.target.y) * 0.025;
                    controls.target.z += (z - controls.target.z) * 0.025;
                    
                    // Gently drift camera position to keep a good viewing angle
                    const desiredCamX = x + 80 * 0.5;
                    const desiredCamY = Math.max(y + 60, maxArcHeight + 60);
                    const desiredCamZ = z + 80;
                    camera.position.x += (desiredCamX - camera.position.x) * 0.015;
                    camera.position.y += (desiredCamY - camera.position.y) * 0.015;
                    camera.position.z += (desiredCamZ - camera.position.z) * 0.015;
                    
                    camera.lookAt(controls.target);
                }
                
                if (progress < 1) {
                    requestAnimationFrame(animateCinematicArc);
                } else {
                    // === PHASE 2: Landing impact ===
                    pegMesh.mesh.rotation.set(0, 0, 0);
                    pegMesh.mesh.position.copy(endPos);
                    
                    // Landing thump
                    if (window.GameSFX) {
                        GameSFX._playImpact(GameSFX.audioContext.currentTime, 0.4);
                    }
                    
                    console.log(`😢 Peg ${victimPeg.id} vanquished to ${targetHoleId}`);
                    
                    // === PHASE 3: Pause at landing so player sees peg in holding ===
                    // Focus camera on the landing spot for a beat
                    if (!isManual && !userIsInteracting) {
                        smoothCameraTransition(
                            { x: endPos.x + 40, y: LINE_HEIGHT + 100, z: endPos.z + 60 },
                            { x: endPos.x, y: LINE_HEIGHT + 10, z: endPos.z },
                            1200
                        );
                    }
                    
                    // Hold for 1.2s so the player sees the peg in holding, then transition
                    setTimeout(() => {
                        performVictoryDance(moveInfo);
                    }, 1200);
                }
            }
            
            animateCinematicArc();
        }
        
        // === VICTORY DANCE SUB-FUNCTION ===
        function performVictoryDance(moveInfo) {
            // Find the attacker peg
            let attackerPegMesh = null;
            let attackerPegPos = null;
            
            // Try to find via moveInfo first
            if (moveInfo && moveInfo.pegId) {
                const reg = pegRegistry.get(moveInfo.pegId);
                if (reg && reg.mesh) {
                    attackerPegMesh = reg.mesh;
                    attackerPegPos = reg.mesh.position.clone();
                }
            }
            
            // Fallback: find via gameState.currentPlayer — pick peg closest to where victim was
            if (!attackerPegMesh && gameState && gameState.currentPlayer) {
                const pegs = gameState.currentPlayer.peg || [];
                let bestDist = Infinity;
                for (const p of pegs) {
                    const reg = pegRegistry.get(p.id);
                    if (reg && reg.mesh) {
                        const d = reg.mesh.position.distanceTo(startPos);
                        if (d < bestDist) {
                            bestDist = d;
                            attackerPegMesh = reg.mesh;
                            attackerPegPos = reg.mesh.position.clone();
                        }
                    }
                }
            }
            
            if (!attackerPegMesh) {
                console.log('No attacker peg found for victory dance');
                return;
            }
            
            // === PHASE 4: Smooth pan to attacker peg ===
            if (!isManual) {
                smoothCameraTransition(
                    { x: attackerPegPos.x + 50, y: LINE_HEIGHT + 80, z: attackerPegPos.z + 60 },
                    { x: attackerPegPos.x, y: LINE_HEIGHT + 10, z: attackerPegPos.z },
                    1800,
                    startDance
                );
            } else {
                startDance();
            }
            
            function startDance() {
                // Play victory jingle
                if (window.GameSFX) {
                    GameSFX.playVanquishDance();
                }
                
                // === PHASE 5: Victory dance animation ===
                const danceStart = Date.now();
                const danceDuration = 1200;
                const bounceBaseY = attackerPegPos.y;
                const bounceHeight = 15;
                const numBounces = 4;
                
                function animateDance() {
                    const elapsed = Date.now() - danceStart;
                    const progress = Math.min(elapsed / danceDuration, 1);
                    
                    // Bouncing
                    const bouncePhase = progress * numBounces * Math.PI * 2;
                    const bounceDecay = 1 - progress; // Bounces get smaller
                    const yOffset = Math.abs(Math.sin(bouncePhase)) * bounceHeight * bounceDecay;
                    attackerPegMesh.position.y = bounceBaseY + yOffset;
                    
                    // Spin celebration
                    attackerPegMesh.rotation.y += 0.15 * bounceDecay;
                    
                    // Slight scale pulse for flair
                    const scalePulse = 1 + Math.sin(bouncePhase) * 0.08 * bounceDecay;
                    attackerPegMesh.scale.set(scalePulse, scalePulse, scalePulse);
                    
                    if (progress < 1) {
                        requestAnimationFrame(animateDance);
                    } else {
                        // Reset to normal
                        attackerPegMesh.rotation.y = 0;
                        attackerPegMesh.position.y = bounceBaseY;
                        attackerPegMesh.scale.set(1, 1, 1);
                        console.log('💃 Victory dance complete!');
                        // Signal cut scene is fully finished
                        if (typeof onComplete === 'function') onComplete();
                    }
                }

                animateDance();
            }
        }
    }

    // ============================================================
    // SAFE ZONE ENTRY DANCE
    // Called when a peg lands on any safe-* hole. Plays a quick
    // bounce-spin celebration and pans the camera to the peg.
    // ============================================================
    function performSafeZoneDance(move) {
        if (!move || !move.pegId) return;

        const reg = pegRegistry.get(move.pegId);
        if (!reg || !reg.mesh) return;

        const pegMesh = reg.mesh;
        const basePos = pegMesh.position.clone();
        const baseY = basePos.y;
        const isManualCam = currentCameraView === 'manual' || fixedViewsActive;

        // Smooth camera pan to safe-zone peg (only in auto mode)
        if (!isManualCam && !userIsInteracting) {
            smoothCameraTransition(
                { x: basePos.x + 40, y: LINE_HEIGHT + 85, z: basePos.z + 55 },
                { x: basePos.x, y: LINE_HEIGHT + 10, z: basePos.z },
                900
            );
        }

        // Brief happy dance: 3 bounces with a quick spin
        const danceStart = Date.now();
        const danceDuration = 850;
        const bounceHeight = 14;
        const numBounces = 3;

        function animateSafeDance() {
            const elapsed = Date.now() - danceStart;
            const progress = Math.min(elapsed / danceDuration, 1);

            const bouncePhase = progress * numBounces * Math.PI * 2;
            const decay = 1 - progress;

            // Upward bounce
            const yOffset = Math.abs(Math.sin(bouncePhase)) * bounceHeight * decay;
            pegMesh.position.y = baseY + yOffset;

            // Happy spin (faster than vanquish — it's a joyful move)
            pegMesh.rotation.y += 0.18 * decay;

            // Cheerful scale pulse
            const scalePulse = 1 + Math.sin(bouncePhase) * 0.12 * decay;
            pegMesh.scale.set(scalePulse, scalePulse, scalePulse);

            if (progress < 1) {
                requestAnimationFrame(animateSafeDance);
            } else {
                // Restore peg to normal state
                pegMesh.position.y = baseY;
                pegMesh.rotation.y = 0;
                pegMesh.scale.set(1, 1, 1);
                console.log('🎊 Safe zone dance complete!');
            }
        }

        animateSafeDance();
    }

    // ============================================================
    // LAUNCH GAME HANDLER
    // Called when a game session is ready to start
    // ============================================================
    
    window.launchGame = function(session) {
        console.log('Launching game:', session);
        
        // Hide auth and lobby
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('lobby-container').style.display = 'none';
        
        // Start game with player count
        const playerCount = session.playerOrder ? session.playerOrder.length : 4;
        initGame(playerCount);
        
        // Update player panels with session players
        if (session.playerOrder && typeof updatePlayerPanelsFromSession === 'function') {
            updatePlayerPanelsFromSession(session);
        }
    };
    
    // ============================================================
    // INITIALIZATION FLOW - DEV MODE: Skip auth, play with AI
    // ============================================================
    
    // AI_CONFIG is defined at the top of this script block
    
    function isAIPlayer(playerIndex) {
        // First check gameState for explicit isAI setting (from session/multiplayer)
        // This takes priority over AI_CONFIG defaults
        if (gameState && gameState.players[playerIndex]) {
            const player = gameState.players[playerIndex];
            // If isAI is explicitly set (true or false), use that value
            if (typeof player.isAI === 'boolean') {
                return player.isAI;
            }
            // If isHuman is explicitly true, they're not AI
            if (player.isHuman === true || player.isLocal === true) {
                return false;
            }
        }
        // Fall back to AI_CONFIG for initial AI players (solo play mode)
        if (AI_CONFIG.enabled && AI_CONFIG.players.includes(playerIndex)) {
            return true;
        }
        return false;
    }
    window.isAIPlayer = isAIPlayer;
    
    // Show Joker backward move celebration - jack-in-the-box joker pops out!
    function showJokerBackwardCelebration(move, onComplete) {
        console.log('🃏 [Joker Celebration] Starting jack-in-the-box animation!');
        
        // Play the special Joker backward sound effect
        if (window.GameSFX) {
            GameSFX.playJokerBackward();
        }
        
        // Create the celebration overlay
        const overlay = document.createElement('div');
        overlay.id = 'joker-celebration-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
        `;
        
        // Jack-in-the-box container
        const jackBox = document.createElement('div');
        jackBox.style.cssText = `
            font-size: 120px;
            animation: popOut 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            transform-origin: bottom center;
        `;
        jackBox.textContent = '🃏';
        
        // Fanfare text
        const fanfare = document.createElement('div');
        fanfare.style.cssText = `
            font-size: 48px;
            font-weight: bold;
            color: #FFD700;
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.5);
            margin-top: 20px;
            animation: bounce 0.6s ease-in-out infinite alternate;
        `;
        fanfare.textContent = '🎪 JOKER SURPRISE! 🎪';
        
        // Subtitle
        const subtitle = document.createElement('div');
        subtitle.style.cssText = `
            font-size: 24px;
            color: #FFF;
            margin-top: 10px;
            text-align: center;
        `;
        subtitle.textContent = 'Backward Cut - Opponent Sent Home!';
        
        overlay.appendChild(jackBox);
        overlay.appendChild(fanfare);
        overlay.appendChild(subtitle);
        document.body.appendChild(overlay);
        
        // Add CSS animations
        if (!document.getElementById('joker-celebration-styles')) {
            const style = document.createElement('style');
            style.id = 'joker-celebration-styles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes popOut {
                    0% { transform: scale(0) translateY(100px); opacity: 0; }
                    50% { transform: scale(1.2) translateY(-20px); }
                    100% { transform: scale(1) translateY(0); opacity: 1; }
                }
                @keyframes bounce {
                    from { transform: translateY(0); }
                    to { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove overlay after 2 seconds and proceed
        setTimeout(() => {
            overlay.style.animation = 'fadeIn 0.3s ease-out reverse';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                if (onComplete) onComplete();
            }, 300);
        }, 2000);
    }
    
    function showMoveAnnouncement(playerName, spaces, direction) {
        const indicator = document.getElementById('ai-thinking');
        const nameEl = document.getElementById('ai-name');
        const infoEl = document.getElementById('move-info');
        if (indicator && nameEl && infoEl) {
            nameEl.textContent = playerName || 'Player';
            if (direction === 'backward') {
                infoEl.textContent = `moving ${spaces} back`;
            } else {
                infoEl.textContent = `moving ${spaces} space${spaces !== 1 ? 's' : ''}`;
            }
            indicator.classList.add('active');
        }
    }
    
    function showAIThinking(playerName) {
        showMoveAnnouncement(playerName, '?', null);
    }
    
    function hideAIThinking() {
        const indicator = document.getElementById('ai-thinking');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }
    
    // ============================================================
    // TURN ACTION BANNER SYSTEM
    // ============================================================
    
    let pendingMoveSelection = null;
    
    // Show turn banner using CardUI's integrated action banner
    function showTurnBanner(playerName, playerColor, message) {
        if (cardUI) {
            cardUI.showActionBanner(`${playerName}: ${message}`, 'default');
        }
    }
    
    // ── "DRAW AGAIN!" popup — shown immediately when a peg lands on an extra-turn card ──
    function showDrawAgainPopup() {
        // Block popups while pegs are moving
        if (_pegMoveInProgress || window._cutSceneActive) return;
        // Remove any existing popup
        const old = document.getElementById('draw-again-popup');
        if (old) old.remove();
        
        const el = document.createElement('div');
        el.id = 'draw-again-popup';
        el.innerHTML = '🃏 DRAW AGAIN!';
        Object.assign(el.style, {
            position: 'fixed',
            top: '32%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(0.6)',
            zIndex: '20002',
            pointerEvents: 'none',
            fontSize: '38px',
            fontWeight: '900',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            color: '#fff',
            textShadow: '0 0 20px rgba(255,215,0,0.9), 0 2px 8px rgba(0,0,0,0.7)',
            background: 'linear-gradient(135deg, rgba(255,180,0,0.92), rgba(255,120,0,0.92))',
            padding: '14px 36px',
            borderRadius: '16px',
            border: '3px solid rgba(255,255,255,0.5)',
            boxShadow: '0 8px 40px rgba(255,165,0,0.5), 0 0 0 6px rgba(255,200,0,0.25)',
            opacity: '0',
            transition: 'none'
        });
        document.body.appendChild(el);
        
        // Animate in
        requestAnimationFrame(() => {
            el.style.transition = 'transform 0.35s cubic-bezier(0.18,1.2,0.4,1), opacity 0.2s ease-out';
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        
        // Fade out after 2.5s
        setTimeout(() => {
            el.style.transition = 'opacity 0.6s ease-in, transform 0.6s ease-in';
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%, -60%) scale(0.9)';
            setTimeout(() => el.remove(), 700);
        }, 2500);
    }
    
    function showCardDrawnBanner(playerName, playerColor, cardValue, hasMultipleMoves) {
        if (cardUI && hasMultipleMoves) {
            cardUI.showActionBanner(`Select a flashing hole to move to`, 'select');
        }
    }

    // ============================================================
    // CARD RULE POPUP — shows card + brief rule on draw
    // ============================================================

    const CARD_RULES = {
        'A':     { icon: '🅰️', rule: 'Enter a peg OR hop 1. Draw again.' },
        'JOKER': { icon: '🃏', rule: 'Enter a peg OR hop 1. Draw again.' },
        '2':     { icon: '2️⃣',  rule: 'Hop 2 forward.' },
        '3':     { icon: '3️⃣',  rule: 'Hop 3 forward.' },
        '4':     { icon: '4️⃣',  rule: 'Hop 4 BACKWARD. FT pegs must exit.' },
        '5':     { icon: '5️⃣',  rule: 'Hop 5 forward.' },
        '6':     { icon: '6️⃣',  rule: 'Enter a peg OR hop 6. Draw again.' },
        '7':     { icon: '7️⃣',  rule: 'Move 7 — or split between 2 pegs.' },
        '8':     { icon: '8️⃣',  rule: 'Hop 8 forward.' },
        '9':     { icon: '9️⃣',  rule: 'Hop 9 forward.' },
        '10':    { icon: '🔟', rule: 'Hop 10 forward.' },
        'J':     { icon: '🤴', rule: 'Hop 1 + draw again + exit bullseye.' },
        'Q':     { icon: '👸', rule: 'Hop 1 + draw again + exit bullseye.' },
        'K':     { icon: '👑', rule: 'Hop 1 + draw again + exit bullseye.' },
    };

    // Inject popup CSS once
    (function injectCardPopupCSS() {
        if (document.getElementById('card-rule-popup-css')) return;
        const s = document.createElement('style');
        s.id = 'card-rule-popup-css';
        s.textContent = `
            @keyframes cardPopIn {
                0%   { opacity:0; transform:translate(-50%,-50%) scale(0.7); }
                15%  { opacity:1; transform:translate(-50%,-50%) scale(1.05); }
                25%  { transform:translate(-50%,-50%) scale(1); }
                80%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
                100% { opacity:0; transform:translate(-50%,-50%) scale(0.95); }
            }
            #card-rule-popup {
                position: fixed;
                top: 38%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 20001;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                animation: cardPopIn 3s ease-in-out forwards;
            }
            #card-rule-popup .crp-card {
                width: 80px; height: 112px;
                background: #fff;
                border-radius: 10px;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                font-size: 32px; font-weight: 800;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 3px rgba(255,255,255,0.15);
                position: relative;
                color: #222;
            }
            #card-rule-popup .crp-card.red { color: #d32f2f; }
            #card-rule-popup .crp-card .crp-suit {
                font-size: 16px; margin-top: 2px;
            }
            #card-rule-popup .crp-rule {
                background: rgba(0,0,0,0.88);
                color: #fff;
                font-size: 15px; font-weight: 600;
                padding: 8px 18px;
                border-radius: 8px;
                text-align: center;
                max-width: 300px;
                line-height: 1.3;
                border: 1px solid rgba(255,255,255,0.15);
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
            #card-rule-popup .crp-hint {
                font-size: 12px;
                color: rgba(255,255,255,0.6);
                font-weight: 400;
            }
            /* ── Joker special card face ── */
            #card-rule-popup .crp-card.joker {
                background: linear-gradient(135deg, #1a0035 0%, #6b00cc 55%, #b0008a 100%);
                color: #ffd700;
                border: 2px solid rgba(255,215,0,0.7);
                box-shadow: 0 8px 32px rgba(0,0,0,0.7),
                            0 0 30px rgba(150,0,255,0.55),
                            0 0 60px rgba(150,0,200,0.25);
                animation: jokerCardShimmer 1.8s ease-in-out infinite alternate;
            }
            @keyframes jokerCardShimmer {
                0%   { box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 28px rgba(150,0,255,0.55), 0 0 55px rgba(150,0,200,0.25); }
                100% { box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 42px rgba(200,0,255,0.75), 0 0 80px rgba(200,0,220,0.4);  }
            }
            #card-rule-popup .crp-joker-face {
                font-size: 44px;
                line-height: 1;
                filter: drop-shadow(0 0 8px rgba(255,215,0,0.8));
            }
            #card-rule-popup .crp-joker-label {
                font-size: 10px;
                font-weight: 900;
                letter-spacing: 3px;
                color: #ffd700;
                text-shadow: 0 0 10px rgba(255,215,0,0.9), 0 1px 3px rgba(0,0,0,0.8);
                text-transform: uppercase;
                margin-top: 2px;
            }
            @media (max-width: 768px) {
                #card-rule-popup .crp-card { width: 64px; height: 90px; font-size: 26px; }
                #card-rule-popup .crp-joker-face { font-size: 34px; }
                #card-rule-popup .crp-rule { font-size: 13px; padding: 6px 14px; max-width: 260px; }
            }
        `;
        document.head.appendChild(s);
    })();

    // ── No Legal Moves Popup (human players only) ──
    (function injectNoMovesCSS() {
        if (document.getElementById('no-moves-popup-css')) return;
        const s = document.createElement('style');
        s.id = 'no-moves-popup-css';
        s.textContent = `
            @keyframes noMovesIn {
                0%   { opacity:0; transform:translate(-50%,-50%) scale(0.8); }
                100% { opacity:1; transform:translate(-50%,-50%) scale(1); }
            }
            @keyframes noMovesOut {
                0%   { opacity:1; transform:translate(-50%,-50%) scale(1); }
                100% { opacity:0; transform:translate(-50%,-50%) scale(0.9); }
            }
            #no-moves-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.55);
                z-index: 25000;
            }
            #no-moves-popup {
                position: fixed;
                top: 42%; left: 50%;
                transform: translate(-50%,-50%);
                z-index: 25001;
                display: flex; flex-direction: column;
                align-items: center; gap: 12px;
                animation: noMovesIn 0.3s ease-out forwards;
            }
            #no-moves-popup.closing {
                animation: noMovesOut 0.25s ease-in forwards;
            }
            #no-moves-popup .nmp-card {
                width: 90px; height: 126px;
                background: #fff;
                border-radius: 12px;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                font-size: 36px; font-weight: 800;
                box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 3px rgba(255,255,255,0.2);
                color: #222;
                position: relative;
            }
            #no-moves-popup .nmp-card.red { color: #d32f2f; }
            #no-moves-popup .nmp-card .nmp-suit { font-size: 18px; margin-top: 2px; }
            #no-moves-popup .nmp-body {
                background: rgba(20,20,30,0.95);
                border-radius: 12px;
                padding: 16px 28px;
                text-align: center;
                max-width: 320px;
                border: 1px solid rgba(255,255,255,0.12);
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            }
            #no-moves-popup .nmp-title {
                font-size: 18px; font-weight: 700;
                color: #ff6b6b;
                margin-bottom: 6px;
            }
            #no-moves-popup .nmp-msg {
                font-size: 14px; color: rgba(255,255,255,0.75);
                line-height: 1.4; margin-bottom: 14px;
            }
            #no-moves-popup .nmp-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                border: none; border-radius: 8px;
                padding: 10px 32px;
                font-size: 15px; font-weight: 600;
                cursor: pointer;
                transition: transform 0.15s, box-shadow 0.15s;
                box-shadow: 0 4px 16px rgba(102,126,234,0.4);
            }
            #no-moves-popup .nmp-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 20px rgba(102,126,234,0.6);
            }
            @media (max-width: 768px) {
                #no-moves-popup .nmp-card { width: 72px; height: 100px; font-size: 28px; }
                #no-moves-popup .nmp-body { padding: 12px 20px; max-width: 280px; }
                #no-moves-popup .nmp-title { font-size: 16px; }
                #no-moves-popup .nmp-msg { font-size: 13px; }
            }
        `;
        document.head.appendChild(s);
    })();

    function showNoLegalMovesPopup(card, onDismiss, isInJail) {
        // Block popups while pegs are moving
        if (_pegMoveInProgress || window._cutSceneActive) {
            // Defer until movement is done
            const _waitForIdle = setInterval(() => {
                if (!_pegMoveInProgress && !window._cutSceneActive) {
                    clearInterval(_waitForIdle);
                    showNoLegalMovesPopup(card, onDismiss, isInJail);
                }
            }, 100);
            return;
        }
        // Remove existing
        const oldOverlay = document.getElementById('no-moves-overlay');
        const oldPopup = document.getElementById('no-moves-popup');
        if (oldOverlay) oldOverlay.remove();
        if (oldPopup) oldPopup.remove();

        const rank = (card.rank || card.value || '?').toString().toUpperCase();
        const suitSym = getSuitSymbol(card.suit);
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        const info = CARD_RULES[rank] || { rule: 'Hop ' + (card.movement || '?') + ' forward.' };

        const isJokerCard = rank === 'JOKER';
        const cardIcon = isJokerCard ? '🃏' : (rank === 'A' ? '🅰️' : (rank === 'J' ? '🤴' : (rank === 'Q' ? '👸' : (rank === 'K' ? '👑' : rank))));
        const jokerFaceHTML = `<span style="font-size:36px;filter:drop-shadow(0 0 8px rgba(255,215,0,0.8))">🃏</span><span style="font-size:9px;font-weight:900;letter-spacing:2px;color:#ffd700;text-shadow:0 0 8px rgba(255,215,0,0.9)">JOKER</span>`;
        const cardInnerHTML = isJokerCard ? jokerFaceHTML : `<span>${cardIcon}</span><span class="nmp-suit">${suitSym}</span>`;

        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'no-moves-overlay';

        // Popup
        const popup = document.createElement('div');
        popup.id = 'no-moves-popup';
        
        if (isInJail) {
            // Jail version — prisoner with ball and chain
            popup.innerHTML = `
                <div style="font-size:64px; margin-bottom:8px; animation: jailShake 0.5s ease-in-out infinite alternate;">⛓️</div>
                <div class="nmp-body">
                    <div class="nmp-title" style="color:#ff9944;">Still in jail!</div>
                    <div style="font-size:40px; margin:8px 0;">👮‍♂️🔒</div>
                    <div class="nmp-msg" style="color:#ffcc88;">You need an Ace or a Face card (J, Q, K) to break out!<br>Hang in there — freedom is just a card away.</div>
                    <div class="nmp-card ${isJokerCard ? 'joker' : (isRed ? 'red' : '')}" style="margin:12px auto 0; width:fit-content; ${isJokerCard ? 'background:linear-gradient(135deg,#1a0035,#6b00cc,#b0008a);border-color:rgba(255,215,0,0.7);' : ''}">
                        ${cardInnerHTML}
                    </div>
                    <button class="nmp-btn" style="margin-top:14px;">OK</button>
                </div>
                <style>
                    @keyframes jailShake {
                        from { transform: rotate(-5deg); }
                        to { transform: rotate(5deg); }
                    }
                </style>
            `;
        } else {
            popup.innerHTML = `
                <div class="nmp-card ${isJokerCard ? 'joker' : (isRed ? 'red' : '')}" style="${isJokerCard ? 'background:linear-gradient(135deg,#1a0035,#6b00cc,#b0008a);border:2px solid rgba(255,215,0,0.7);box-shadow:0 0 30px rgba(150,0,255,0.5);' : ''}">
                    ${cardInnerHTML}
                </div>
                <div class="nmp-body">
                    <div class="nmp-title">No Legal Moves</div>
                    <div class="nmp-msg">${info.rule}<br>All pegs are blocked — turn will be skipped.</div>
                    <button class="nmp-btn">OK</button>
                </div>
            `;
        }

        document.body.appendChild(overlay);
        document.body.appendChild(popup);

        function dismiss() {
            popup.classList.add('closing');
            overlay.style.transition = 'opacity 0.25s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
                popup.remove();
                if (onDismiss) onDismiss();
            }, 260);
        }

        popup.querySelector('.nmp-btn').addEventListener('click', dismiss);
        overlay.addEventListener('click', dismiss);

        // Auto-dismiss after 6s in case user doesn't click
        setTimeout(() => {
            if (document.getElementById('no-moves-popup')) {
                dismiss();
            }
        }, 6000);
    }

    function showCardRulePopup(card, movesCount) {
        // Block popups while pegs are moving
        if (_pegMoveInProgress || window._cutSceneActive) return;
        // Remove existing popup
        const old = document.getElementById('card-rule-popup');
        if (old) old.remove();

        const rank = (card.rank || card.value || '?').toString().toUpperCase();
        const suitSym = getSuitSymbol(card.suit);
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        const info = CARD_RULES[rank] || { icon: '🂠', rule: 'Hop ' + (card.movement || '?') + ' forward.' };

        // Build hint line
        let hint = '';
        if (movesCount === 0) {
            hint = 'No legal moves — turn skipped';
        } else if (movesCount === 1) {
            hint = 'Tap the flashing hole to move';
        } else if (movesCount > 1) {
            hint = 'Choose a flashing hole';
        }

        const isJoker = rank === 'JOKER';
        const cardFaceHTML = isJoker
            ? `<span class="crp-joker-face">🃏</span><span class="crp-joker-label">JOKER</span>`
            : `<span>${rank === 'A' ? '🅰️' : (rank === 'J' ? '🤴' : (rank === 'Q' ? '👸' : (rank === 'K' ? '👑' : rank)))}</span>
               <span class="crp-suit">${suitSym}</span>`;

        const popup = document.createElement('div');
        popup.id = 'card-rule-popup';
        popup.innerHTML = `
            <div class="crp-card ${isJoker ? 'joker' : (isRed ? 'red' : '')}">
                ${cardFaceHTML}
            </div>
            <div class="crp-rule">
                ${info.rule}
                ${hint ? '<div class="crp-hint">' + hint + '</div>' : ''}
            </div>
        `;
        document.body.appendChild(popup);

        // Auto-remove
        setTimeout(() => {
            const el = document.getElementById('card-rule-popup');
            if (el) el.remove();
        }, 3100);
    }

    // Dismiss card rule popup (called when player clicks a move)
    function dismissCardRulePopup() {
        const el = document.getElementById('card-rule-popup');
        if (el) el.remove();
    }
    window.dismissCardRulePopup = dismissCardRulePopup;

    // ── Context Popup ─────────────────────────────────────────
    // Reusable pithy info popup that appears top-center and auto-dismisses.
    // icon: emoji string, title: bold heading, body: explanatory text, durationMs: auto-close
    function showContextPopup(icon, title, body, durationMs) {
        // Block popups while pegs are moving
        if (_pegMoveInProgress || window._cutSceneActive) return;
        durationMs = durationMs || 4000;
        const old = document.getElementById('ctx-popup');
        if (old) old.remove();

        const div = document.createElement('div');
        div.id = 'ctx-popup';
        div.style.cssText = `
            position:fixed; top:12%; left:50%; transform:translateX(-50%);
            background:linear-gradient(135deg,rgba(15,20,40,0.96),rgba(10,14,30,0.98));
            border:1.5px solid rgba(255,215,0,0.5); border-radius:14px;
            padding:14px 22px; max-width:420px; width:88%; z-index:9500;
            box-shadow:0 6px 28px rgba(0,0,0,0.7),0 0 30px rgba(255,215,0,0.15);
            text-align:center; font-family:sans-serif;
            animation:ctxPopIn 0.35s ease-out;
        `;
        div.innerHTML = `
            <style>
                @keyframes ctxPopIn {
                    0%   { opacity:0; transform:translateX(-50%) translateY(-18px) scale(0.92); }
                    100% { opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
                }
                @keyframes ctxPopOut {
                    0%   { opacity:1; transform:translateX(-50%) scale(1); }
                    100% { opacity:0; transform:translateX(-50%) scale(0.92); }
                }
            </style>
            <div style="font-size:1.8rem;margin-bottom:4px;">${icon}</div>
            <div style="font-size:1.05rem;font-weight:700;color:#ffd700;margin-bottom:6px;">${title}</div>
            <div style="font-size:0.88rem;color:#ccc;line-height:1.5;">${body}</div>
        `;
        // Tap to dismiss
        div.addEventListener('click', () => div.remove());
        document.body.appendChild(div);

        setTimeout(() => {
            const el = document.getElementById('ctx-popup');
            if (el) {
                el.style.animation = 'ctxPopOut 0.3s ease-in forwards';
                setTimeout(() => el.remove(), 300);
            }
        }, durationMs);
    }

    // Show detailed explanation for 7 card split process
    function show7CardExplanationModal() {
        // Remove existing modal
        const old = document.getElementById('seven-card-modal');
        if (old) old.remove();
        
        const modal = document.createElement('div');
        modal.id = 'seven-card-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid #ffd700;
            border-radius: 16px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            z-index: 10000;
            box-shadow: 0 8px 32px rgba(0,0,0,0.8), 0 0 40px rgba(255,215,0,0.3);
            animation: modalFadeIn 0.3s ease-out;
        `;
        
        modal.innerHTML = `
            <style>
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: translate(-50%, -45%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
            </style>
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 3rem; margin-bottom: 8px;">✨</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #ffd700; margin-bottom: 8px;">Card 7 - Wild Card</div>
                <div style="font-size: 0.9rem; color: #aaa;">Move any token 1-7 spaces</div>
            </div>
            
            <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-weight: bold; color: #4ade80; margin-bottom: 12px; font-size: 1.1rem;">📋 How It Works:</div>
                <div style="line-height: 1.8; color: #ddd;">
                    <div style="margin-bottom: 8px;">1️⃣ <strong>Click a peg</strong> to select it</div>
                    <div style="margin-bottom: 8px;">2️⃣ <strong>Click a glowing hole</strong> to move (1-7 spaces)</div>
                    <div style="margin-bottom: 8px;">3️⃣ If you used 1-6 spaces, <strong>click another peg</strong></div>
                    <div style="margin-bottom: 8px;">4️⃣ That peg moves the <strong>remaining spaces</strong></div>
                </div>
            </div>
            
            <div style="background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="font-size: 0.85rem; color: #ffd700;">
                    💡 <strong>Examples:</strong><br>
                    • Move peg #1 three spaces, then peg #2 four spaces<br>
                    • Move peg #1 all seven spaces (no second peg needed)<br>
                    • Both moves are clockwise only
                </div>
            </div>
            
            <button onclick="document.getElementById('seven-card-modal').remove()" style="
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #4ade80, #22c55e);
                border: none;
                border-radius: 8px;
                color: white;
                font-weight: bold;
                font-size: 1rem;
                cursor: pointer;
                transition: all 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(74,222,128,0.4)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
                Got It! Let's Play
            </button>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            const el = document.getElementById('seven-card-modal');
            if (el) el.remove();
        }, 8000);
    }
    
    function enableMakeMoveButton() {
        // Not needed with integrated banner
        return;
    }
    
    function hideTurnBanner() {
        if (cardUI) {
            cardUI.hideActionBanner();
        }
    }
    
    // ============================================================
    // CENTERED DECK UI  — golden-ratio card, flip animation, fly-to-panel
    // ============================================================

    (function injectCenteredDeckCSS() {
        if (document.getElementById('centered-deck-css')) return;
        const s = document.createElement('style');
        s.id = 'centered-deck-css';
        // Golden ratio: height = width × 1.618  →  185 × 299
        s.textContent = `
            /* Card deck positioned on RIGHT SIDE - away from game board */
            #centered-deck-overlay {
                position: fixed;
                top: 50%; right: 20px;
                transform: translateY(-50%);
                z-index: 20010;
                background: linear-gradient(270deg, rgba(0,0,0,0.7) 0%, transparent 100%);
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                padding: 20px;
                border-radius: 16px 0 0 16px;
                gap: 0;
                animation: cdkSlideIn 0.45s ease-out both;
            }
            @keyframes cdkSlideIn  { from { opacity:0; transform: translateY(-50%) translateX(100px); } to { opacity:1; transform: translateY(-50%) translateX(0); } }
            @keyframes cdkFadeIn  { from { opacity:0 } to { opacity:1 } }
            @keyframes cdkFadeOut { from { opacity:1 } to { opacity:0 } }

            #centered-deck-banner {
                font-size: clamp(16px, 3vw, 24px);
                font-weight: 900;
                letter-spacing: 0.05em;
                margin-bottom: 16px;
                text-align: center;
                text-shadow: 0 2px 18px rgba(0,0,0,0.85);
                animation: cdkBannerPulse 2s ease-in-out infinite;
            }
            @keyframes cdkBannerPulse {
                0%,100% { transform:scale(1);   opacity:1;    }
                50%      { transform:scale(1.04); opacity:0.82; }
            }

            /* Wrapper handles perspective + bounce - COMPACT for side placement */
            #centered-deck-wrapper {
                position: relative;
                width: clamp(90px, 15vw, 120px);
                height: clamp(145px, 24vw, 194px);
                perspective: 900px;
                animation: cdkBounce 2.2s ease-in-out infinite;
                cursor: pointer;
            }
            @keyframes cdkBounce {
                0%,100% { transform: translateY(0);    }
                45%      { transform: translateY(-15px); }
            }

            /* Ghost stack cards behind the real one */
            #centered-deck-wrapper::before,
            #centered-deck-wrapper::after {
                content: '';
                position: absolute; inset: 0;
                border-radius: 14px;
                background: linear-gradient(145deg, #3a1a78 0%, #1e0b55 100%);
                border: 3px solid rgba(255,255,255,0.2);
                pointer-events: none;
            }
            #centered-deck-wrapper::before {
                transform: translateY(7px) translateX(5px) rotate(3deg);
                z-index: -1; opacity: 0.55;
            }
            #centered-deck-wrapper::after {
                transform: translateY(14px) translateX(10px) rotate(6deg);
                z-index: -2; opacity: 0.30;
            }

            /* The actual card — rotates on Y for flip */
            #centered-deck-card {
                width: 100%; height: 100%;
                transform-style: preserve-3d;
                transition: transform 0.30s ease-in;
                border-radius: 14px;
                filter: drop-shadow(0 14px 36px rgba(0,0,0,0.75));
            }

            .cdk-face {
                position: absolute; inset: 0;
                border-radius: 14px;
                border: 4px solid rgba(255,255,255,0.88);
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                backface-visibility: hidden;
                overflow: hidden;
            }
            .cdk-face.back {
                background: linear-gradient(145deg, #5a1aaa 0%, #2d0b7e 55%, #7b2dcf 100%);
            }
            .cdk-face.back::before {
                content: '';
                position: absolute; inset: 10px;
                border: 2px solid rgba(255,255,255,0.18);
                border-radius: 8px;
                background: repeating-linear-gradient(
                    45deg,
                    rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 2px,
                    transparent 2px, transparent 10px
                );
                pointer-events: none;
            }
            .cdk-back-icon {
                font-size: clamp(52px, 10vw, 76px);
                z-index: 1;
                animation: cdkIconGlow 2s ease-in-out infinite;
            }
            @keyframes cdkIconGlow {
                0%,100% { filter: drop-shadow(0 0 8px  rgba(255,215,0,0.7)); }
                50%      { filter: drop-shadow(0 0 22px rgba(255,215,0,1.0)); }
            }

            .cdk-face.front {
                background: #fff;
                gap: 4px;
            }
            .cdk-rank {
                font-size: clamp(56px, 14vw, 96px);
                font-weight: 900;
                font-family: "Georgia", "Times New Roman", serif;
                line-height: 1;
                transform: scale(0.5);
                transition: transform 0.32s cubic-bezier(0.18,1.2,0.4,1);
            }
            .cdk-rank.popped { transform: scale(1); }
            .cdk-suit { font-size: clamp(28px, 6vw, 44px); }

            #centered-deck-instruction {
                margin-top: 26px;
                font-size: clamp(15px, 3vw, 20px);
                color: rgba(255,255,255,0.88);
                text-shadow: 0 2px 10px rgba(0,0,0,0.7);
                letter-spacing: 0.07em;
                animation: cdkBannerPulse 2s ease-in-out infinite;
                pointer-events: none;
            }
        `;
        document.head.appendChild(s);
    })();

    function showCenteredDeck(playerIdx, isExtraTurn) {
        hideCenteredDeck();
        if (!gameState) return;
        const player = gameState.players[playerIdx];
        if (!player) return;

        const playerName  = player.name  || `Player ${playerIdx + 1}`;
        const playerColor = '#' + getThemedPlayerColor(playerIdx).toString(16).padStart(6, '0');
        const playerAvatar = player.avatar || '👤';

        const overlay = document.createElement('div');
        overlay.id = 'centered-deck-overlay';

        const banner = document.createElement('div');
        banner.id = 'centered-deck-banner';
        banner.style.color = playerColor;
        banner.textContent = isExtraTurn
            ? `${playerAvatar} EXTRA TURN — ${playerName}`
            : `${playerAvatar} ${playerName}'s Turn`;

        const wrapper = document.createElement('div');
        wrapper.id = 'centered-deck-wrapper';

        const deckCard = document.createElement('div');
        deckCard.id = 'centered-deck-card';

        const face = document.createElement('div');
        face.className = 'cdk-face back';
        face.innerHTML = `<div class="cdk-back-icon">🎴</div>`;
        deckCard.appendChild(face);
        wrapper.appendChild(deckCard);

        const instruction = document.createElement('div');
        instruction.id = 'centered-deck-instruction';
        instruction.textContent = 'Tap to draw your card';

        overlay.appendChild(banner);
        overlay.appendChild(wrapper);
        overlay.appendChild(instruction);
        document.body.appendChild(overlay);

        // ── Flip & draw handler ──
        let _drawing = false;
        function onDeckTap() {
            if (_drawing) return;
            _drawing = true;
            wrapper.style.animation = 'none';
            instruction.style.opacity = '0';

            // Phase 1 — rotate to edge (90°)
            deckCard.style.transition = 'transform 0.28s ease-in';
            deckCard.style.transform = 'rotateY(90deg)';

            setTimeout(() => {
                // Swap to face-up placeholder
                face.className = 'cdk-face front';
                face.innerHTML = `<div class="cdk-rank" id="cdk-rank-val" style="color:#333">?</div>`;
                // Phase 2 — rotate back to 0°
                deckCard.style.transition = 'transform 0.28s ease-out';
                deckCard.style.transform = 'rotateY(0deg)';
                // Draw the card — handleDrawCard calls updateCenteredDeckRank()
                handleDrawCard(false);
            }, 280);
        }
        wrapper.addEventListener('click', onDeckTap);
        wrapper.addEventListener('touchend', (e) => { e.preventDefault(); onDeckTap(); }, { passive: false });
        window._centeredDeckActive = true;
    }

    function hideCenteredDeck() {
        const overlay = document.getElementById('centered-deck-overlay');
        if (!overlay) return;
        overlay.style.animation = 'cdkFadeOut 0.4s ease-in both';
        setTimeout(() => { overlay.remove(); }, 420);
        window._centeredDeckActive = false;
    }

    function updateCenteredDeckRank(card) {
        if (!card) return;
        const rankEl = document.getElementById('cdk-rank-val');
        if (!rankEl) return;

        const rank = card.rank || card.value || '?';
        const isRed = ['hearts', 'diamonds', 'red'].includes(card.suit);
        const color = isRed ? '#dc2626' : '#1a1a2e';
        const suits = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
        const isJoker = rank.toString().toUpperCase() === 'JOKER';

        if (isJoker) {
            rankEl.style.color = '#7b2dcf';
            rankEl.textContent = '🃏';
            rankEl.style.fontSize = 'clamp(64px, 16vw, 110px)';
        } else {
            rankEl.style.color = color;
            rankEl.textContent = rank;
        }

        // Suit symbol below rank (skip for Joker)
        const suitEl = document.createElement('div');
        suitEl.className = 'cdk-suit';
        suitEl.style.color = color;
        suitEl.textContent = isJoker ? '' : (suits[card.suit] || '');
        if (rankEl.parentElement) rankEl.parentElement.appendChild(suitEl);

        // Spring pop-in
        requestAnimationFrame(() => { rankEl.classList.add('popped'); });

        // Immediately pass board clicks through while the card animation plays
        const overlayEl = document.getElementById('centered-deck-overlay');
        if (overlayEl) overlayEl.style.pointerEvents = 'none';

        // After 0.6 s: fly card to top-left player panel, then hide overlay
        // (was 1800ms — cut to 600ms so the board appears immediately after rank shows)
        setTimeout(() => {
            const wrapper = document.getElementById('centered-deck-wrapper');
            if (wrapper) {
                const wRect = wrapper.getBoundingClientRect();
                // Target: top-left corner (player panel area)
                const tx = -(wRect.left - 10);
                const ty = -(wRect.top - 10);
                wrapper.style.transition = 'transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.45s ease';
                wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(0.18)`;
                wrapper.style.opacity = '0';
            }
            setTimeout(hideCenteredDeck, 480);
            // Re-enable the panel deck as fallback after animation
            if (cardUI) cardUI.setDeckEnabled(true);
        }, 600);
    }
    
    // ================================================================
    // MOVE SUGGESTION PANEL — numbered, color-coded buttons, 2-phase UX
    // ================================================================

    let _msbPreviewing = null;   // currently previewed move

    function showMoveSuggestionPanel(moves) {
        hideMoveSuggestionPanel();
        if (!moves || !moves.length) return;

        const panel = document.createElement('div');
        panel.id = 'move-suggestion-panel';

        moves.forEach((move, i) => {
            const colorHex = MOVE_COLORS[move._colorIdx ?? 0].hex;
            const pegNum   = move._pegNumber ?? (i + 1);

            // Determine icon & label
            let icon  = '➡️';
            let label = `Move ${pegNum}`;
            if (move.type === 'enter')   { icon = '🚀'; label = `Enter (Peg ${pegNum})`; }
            else if (move.type === 'cut')   { icon = '⚔️'; label = `Cut! (Peg ${pegNum})`; }
            else if (move.type === 'safezone' || move.isSafezone) { icon = '🛡️'; label = `Safe zone (Peg ${pegNum})`; }
            else if (move.spaces)           { label = `+${move.spaces} (Peg ${pegNum})`; }

            const btn = document.createElement('button');
            btn.className = 'msb-btn';
            btn.dataset.moveIdx = i;
            btn.style.borderColor = colorHex;
            btn.style.color = colorHex;
            btn.title = label;
            btn.innerHTML = `
                <span class="msb-num" style="background:${colorHex};color:#000">${pegNum}</span>
                <span class="msb-label">${label}</span>
                <span class="msb-icon">${icon}</span>
            `;

            btn.addEventListener('click', () => previewMove(move, btn, colorHex));
            btn.addEventListener('touchend', (e) => { e.preventDefault(); previewMove(move, btn, colorHex); }, { passive: false });
            panel.appendChild(btn);
        });

        document.body.appendChild(panel);
    }

    function hideMoveSuggestionPanel() {
        const panel = document.getElementById('move-suggestion-panel');
        if (panel) panel.remove();
        hideMsbBar();
        _msbPreviewing = null;
    }

    function previewMove(move, btnEl, colorHex) {
        // Mark previously-previewed button as normal
        document.querySelectorAll('.msb-btn.previewed').forEach(b => b.classList.remove('previewed'));
        if (btnEl) btnEl.classList.add('previewed');
        _msbPreviewing = move;

        // Camera: focus on the moving peg
        if (move.pegId) {
            const reg = pegRegistry.get(move.pegId);
            if (reg && reg.mesh) {
                const pos = reg.mesh.position;
                if (cameraMode !== 'manual' && !fixedViewsActive) {
                    smoothCameraTransition(
                        { x: pos.x + 40, y: LINE_HEIGHT + 70, z: pos.z + 55 },
                        { x: pos.x, y: LINE_HEIGHT + 5, z: pos.z },
                        600
                    );
                }
            }
        }

        // Show move-suggestion confirm bar (distinct from the old confirm-move-bar)
        showMsbBar(move, colorHex);
    }

    function showMsbBar(move, colorHex) {
        hideMsbBar();

        const bar = document.createElement('div');
        bar.id = 'move-confirm-bar';

        const info = document.createElement('div');
        info.className = 'mcb-info';
        let label = 'Confirm move?';
        if (move.type === 'cut')        label = '⚔️ Confirm cut?';
        else if (move.type === 'enter')  label = '🚀 Confirm entry?';
        else if (move.spaces)            label = `Move +${move.spaces} spaces?`;
        info.textContent = label;

        const goBtn = document.createElement('button');
        goBtn.className = 'mcb-go';
        goBtn.style.background = colorHex;
        goBtn.style.color = '#000';
        goBtn.textContent = '✓ Go!';
        goBtn.addEventListener('click', () => {
            hideMoveSuggestionPanel();
            executeMoveDirectly(move);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'mcb-cancel';
        cancelBtn.textContent = '✕';
        cancelBtn.addEventListener('click', () => {
            document.querySelectorAll('.msb-btn.previewed').forEach(b => b.classList.remove('previewed'));
            _msbPreviewing = null;
            hideMsbBar();
        });

        bar.appendChild(cancelBtn);
        bar.appendChild(info);
        bar.appendChild(goBtn);
        document.body.appendChild(bar);
    }

    function hideMsbBar() {
        const bar = document.getElementById('move-confirm-bar');
        if (bar) bar.remove();
    }

    // Show auto-move notification for human players
    // ================================================================
    // FASTTRACK AUTO/MANUAL TRAVERSAL CHOICE DIALOG
    // Shows when a human player enters FastTrack, offering them the
    // choice to traverse automatically or manually each turn.
    // ================================================================
    function showFTTraversalChoiceDialog() {
        // Don't show if dialog already exists
        if (document.getElementById('ft-traversal-dialog')) return;
        
        const dialog = document.createElement('div');
        dialog.id = 'ft-traversal-dialog';
        Object.assign(dialog.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(10,0,40,0.97), rgba(30,10,60,0.98))',
            border: '2px solid #9966ff',
            borderRadius: '18px',
            padding: '30px 40px',
            zIndex: '10000',
            textAlign: 'center',
            color: '#fff',
            fontFamily: "'Segoe UI', sans-serif",
            boxShadow: '0 0 40px rgba(153,102,255,0.5), 0 0 80px rgba(100,50,200,0.3)',
            maxWidth: '420px',
            animation: 'ftDialogFadeIn 0.4s ease-out'
        });
        
        dialog.innerHTML = `
            <style>
                @keyframes ftDialogFadeIn {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                .ft-choice-btn {
                    display: block;
                    width: 100%;
                    padding: 14px 20px;
                    margin: 8px 0;
                    border: none;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: transform 0.15s, box-shadow 0.15s;
                }
                .ft-choice-btn:hover {
                    transform: scale(1.03);
                    box-shadow: 0 4px 20px rgba(255,255,255,0.2);
                }
                .ft-auto-btn {
                    background: linear-gradient(135deg, #6633cc, #9966ff);
                    color: #fff;
                }
                .ft-manual-btn {
                    background: linear-gradient(135deg, #1a5276, #2e86c1);
                    color: #fff;
                }
            </style>
            <div style="font-size: 28px; margin-bottom: 8px;">⚡ FastTrack Entered!</div>
            <div style="font-size: 14px; color: #ccc; margin-bottom: 20px;">
                How do you want to traverse the inner ring?
            </div>
            <button class="ft-choice-btn ft-auto-btn" onclick="window._ftChooseMode('auto')">
                🚀 Auto Traverse
                <div style="font-size:12px;font-weight:normal;margin-top:4px;opacity:0.8;">
                    Automatically move around the ring each turn
                </div>
            </button>
            <button class="ft-choice-btn ft-manual-btn" onclick="window._ftChooseMode('manual')">
                🎯 Manual Control
                <div style="font-size:12px;font-weight:normal;margin-top:4px;opacity:0.8;">
                    Choose your move each turn (continue, exit, or bullseye)
                </div>
            </button>
        `;
        
        document.body.appendChild(dialog);
    }
    
    // Handle FT traversal mode choice
    window._ftChooseMode = function(mode) {
        GAME_CONFIG.ftAutoTraverse = (mode === 'auto');
        console.log(`⚡ [FT Choice] Player chose ${mode} FastTrack traversal (ftAutoTraverse=${GAME_CONFIG.ftAutoTraverse})`);
        
        const dialog = document.getElementById('ft-traversal-dialog');
        if (dialog) {
            dialog.style.transition = 'opacity 0.3s, transform 0.3s';
            dialog.style.opacity = '0';
            dialog.style.transform = 'translate(-50%, -50%) scale(0.85)';
            setTimeout(() => dialog.remove(), 300);
        }
        
        // Show confirmation banner
        if (cardUI) {
            const msg = mode === 'auto' 
                ? '🚀 Auto-traversing FastTrack ring' 
                : '🎯 Manual FastTrack mode — choose each move';
            cardUI.showActionBanner(msg, 'default');
            setTimeout(() => { if (cardUI) cardUI.hideActionBanner(); }, 2000);
        }
    };
    
    // ================================================================
    // ILLEGAL MOVE POPUP — Shows when player clicks an illegal hole
    // Used in hard mode or when manually selecting moves
    // ================================================================
    function showIllegalMovePopup(reason) {
        // Remove any existing popup
        const existing = document.getElementById('illegal-move-popup');
        if (existing) existing.remove();
        
        const popup = document.createElement('div');
        popup.id = 'illegal-move-popup';
        Object.assign(popup.style, {
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(120,10,10,0.96), rgba(80,0,0,0.98))',
            border: '2px solid #ff4444',
            borderRadius: '14px',
            padding: '24px 36px',
            zIndex: '10001',
            textAlign: 'center',
            color: '#fff',
            fontFamily: "'Segoe UI', sans-serif",
            boxShadow: '0 0 30px rgba(255, 50, 50, 0.5)',
            maxWidth: '380px',
            animation: 'illegalMoveShake 0.5s ease-out'
        });
        
        popup.innerHTML = `
            <style>
                @keyframes illegalMoveShake {
                    0%,100% { transform: translate(-50%, -50%); }
                    10%,30%,50%,70%,90% { transform: translate(-50%, -50%) translateX(-5px); }
                    20%,40%,60%,80% { transform: translate(-50%, -50%) translateX(5px); }
                }
            </style>
            <div style="font-size: 26px; margin-bottom: 8px;">🚫 Illegal Move</div>
            <div style="font-size: 14px; color: #ffcccc; line-height: 1.5;">
                ${reason}
            </div>
            <div style="font-size: 12px; color: #ff9999; margin-top: 12px; opacity: 0.7;">
                Peg returned to original position
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // Play error sound
        if (window.gameSFX && window.gameSFX.playError) {
            window.gameSFX.playError();
        }
        
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            if (popup.parentNode) {
                popup.style.transition = 'opacity 0.4s';
                popup.style.opacity = '0';
                setTimeout(() => popup.remove(), 400);
            }
        }, 3000);
    }

    function showAutoMoveBanner() {
        if (cardUI) {
            cardUI.showActionBanner('⚡ Auto-moving (only one choice)', 'default');
            // Auto-hide after a short delay
            setTimeout(() => {
                if (cardUI) cardUI.hideActionBanner();
            }, 800);
        }
    }

    function handleBannerAction() {
        // Execute the pending move if one is selected
        if (pendingMoveSelection) {
            hideTurnBanner();
            
            const move = pendingMoveSelection;
            pendingMoveSelection = null;
            
            console.log('Executing selected move from banner:', move);
            clearHighlights();
            animatePegMove(move, () => {
                gameState.executeMove(move);
                cardUI.clearCard();
            });
        }
    }
    
    // Expose to global scope for onclick
    window.handleBannerAction = handleBannerAction;
    
    // ============================================================
    // PLAY AGAIN & FIRST PLAYER ANNOUNCEMENT
    // ============================================================
    
    // Track game session type for replay rules
    let gameSessionType = 'solo'; // 'solo', 'private', 'public'
    let replayAgreements = {}; // { playerId: boolean }
    let totalHumanPlayers = 1;
    
    function showPlayAgainButton(winner) {
        // Remove any existing play again overlay
        let existing = document.getElementById('play-again-overlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'play-again-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(20,30,50,0.95), rgba(10,15,30,0.98))',
            padding: '40px 60px',
            borderRadius: '20px',
            border: '2px solid rgba(255,215,0,0.5)',
            boxShadow: '0 0 60px rgba(255,215,0,0.3), inset 0 0 30px rgba(255,215,0,0.05)',
            zIndex: '50000',
            textAlign: 'center',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            maxWidth: '500px',
            width: '90%'
        });
        
        // Winner announcement
        const winnerAvatar = winner.avatar || '👤';
        const winnerColor = winner.colorHex || '#ffd700';
        
        const winnerText = document.createElement('div');
        Object.assign(winnerText.style, {
            fontSize: '28px',
            color: '#fff',
            marginBottom: '8px'
        });
        winnerText.innerHTML = `<span style="font-size: 42px; margin-right: 10px;">${winnerAvatar}</span><span style="color: ${winnerColor}; font-weight: bold;">${winner.name}</span>`;
        overlay.appendChild(winnerText);
        
        // "WINS!" title
        const winsTitle = document.createElement('div');
        Object.assign(winsTitle.style, {
            fontSize: '40px',
            fontWeight: '900',
            color: '#ffd700',
            textShadow: '0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,180,0,0.4)',
            marginBottom: '25px',
            letterSpacing: '4px'
        });
        winsTitle.textContent = '👑 WINS! 👑';
        overlay.appendChild(winsTitle);
        
        // Medallion points (only for public lobby games)
        if (gameSessionType === 'public') {
            const pointsDiv = document.createElement('div');
            Object.assign(pointsDiv.style, {
                background: 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,180,0,0.1))',
                border: '1px solid rgba(255,215,0,0.4)',
                borderRadius: '10px',
                padding: '15px',
                marginBottom: '20px'
            });
            pointsDiv.innerHTML = `
                <div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 5px;">🏅 Medallion Points Awarded</div>
                <div style="font-size: 20px; color: #ffd700; font-weight: bold;">Winner: +100 pts</div>
                <div style="font-size: 14px; color: rgba(255,255,255,0.5); margin-top: 5px;">Participants: +25 pts</div>
            `;
            overlay.appendChild(pointsDiv);
        }
        
        // ── ButterflyFX Growth: Victory Share Panel ─────────────
        if (window.GrowthSubstrate) {
            GrowthSubstrate.injectVictoryShare(overlay, winner, {
                turns: gameState.turnCount || 0,
                theme: currentThemeName || 'spaceace',
                players: activePlayerCount || 4,
                isAI: (currentGameMode === 'solo')
            });
        }

        // Button container
        const btnContainer = document.createElement('div');
        Object.assign(btnContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '20px'
        });
        
        // Shared button styles
        const primaryBtnStyle = {
            padding: '15px 40px',
            fontSize: '18px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, rgba(100,200,255,0.7), rgba(60,150,255,0.7))',
            border: '2px solid rgba(150,220,255,0.5)',
            borderRadius: '30px',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 0 25px rgba(100,200,255,0.5)',
            textShadow: '0 0 10px rgba(255,255,255,0.5)',
            transition: 'all 0.3s'
        };
        const secondaryBtnStyle = {
            padding: '12px 30px',
            fontSize: '15px',
            fontWeight: 'bold',
            background: 'rgba(100,100,100,0.3)',
            border: '1px solid rgba(150,150,150,0.3)',
            borderRadius: '25px',
            color: 'rgba(255,255,255,0.8)',
            cursor: 'pointer',
            transition: 'all 0.3s'
        };
        
        const makePrimaryBtn = (text, onClick) => {
            const btn = document.createElement('button');
            Object.assign(btn.style, primaryBtnStyle);
            btn.innerHTML = text;
            btn.onmouseover = () => btn.style.transform = 'scale(1.03)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';
            btn.onclick = onClick;
            return btn;
        };
        const makeSecondaryBtn = (text, onClick) => {
            const btn = document.createElement('button');
            Object.assign(btn.style, secondaryBtnStyle);
            btn.innerHTML = text;
            btn.onmouseover = () => { btn.style.transform = 'scale(1.02)'; btn.style.background = 'rgba(130,130,130,0.4)'; };
            btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.background = 'rgba(100,100,100,0.3)'; };
            btn.onclick = onClick;
            return btn;
        };
        
        // ── Buttons depend on game type ──
        if (gameSessionType === 'public') {
            // MATCH GAME → Rematch (back to lobby)
            btnContainer.appendChild(makePrimaryBtn('🔄 Rematch', () => {
                requestReplay(true, overlay, winner);
            }));
            btnContainer.appendChild(makeSecondaryBtn('🏠 Play Again', () => {
                overlay.remove();
                window.location.href = '3d.html';
            }));
        } else if (gameSessionType === 'private') {
            // PRIVATE GAME → Replay + Leave Game
            btnContainer.appendChild(makePrimaryBtn(`🔄 Replay`, () => {
                overlay.remove();
                isReplayGame = true;
                initGame(activePlayerCount);
            }));
            btnContainer.appendChild(makeSecondaryBtn('🚪 Leave Game', () => {
                overlay.remove();
                window.location.href = window.location.pathname.includes('board_3d') ? '.' : 'index.html';
            }));
        } else {
            // SOLO / AI → Replay (back to landing page)
            btnContainer.appendChild(makePrimaryBtn(`🔄 Play Again`, () => {
                overlay.remove();
                isReplayGame = true;
                initGame(activePlayerCount);
            }));
            btnContainer.appendChild(makeSecondaryBtn('🏠 Back to Menu', () => {
                overlay.remove();
                window.location.href = window.location.pathname.includes('board_3d') ? '.' : 'index.html';
            }));
        }
        
        overlay.appendChild(btnContainer);
        document.body.appendChild(overlay);
    }
    
    function requestReplay(wantsReplay, overlay, winner) {
        // For multiplayer public games, broadcast replay request
        if (window.multiplayerClient && typeof multiplayerClient.isConnected === "function" && multiplayerClient.isConnected()) {
            multiplayerClient.sendReplayVote(wantsReplay);
            
            // Update button to show waiting state
            const waitingDiv = document.createElement('div');
            Object.assign(waitingDiv.style, {
                marginTop: '15px',
                padding: '15px',
                background: 'rgba(100,200,255,0.1)',
                borderRadius: '10px',
                border: '1px solid rgba(100,200,255,0.3)'
            });
            waitingDiv.id = 'replay-waiting';
            waitingDiv.innerHTML = `
                <div style="color: #7dd3fc; margin-bottom: 10px;">⏳ Waiting for all players...</div>
                <div id="replay-votes" style="font-size: 14px; color: rgba(255,255,255,0.7);"></div>
            `;
            overlay.appendChild(waitingDiv);
        } else {
            // Solo/private immediate replay
            overlay.remove();
            isReplayGame = true;
            initGame(activePlayerCount);
        }
    }
    
    function updateReplayVotes(votes) {
        const votesDiv = document.getElementById('replay-votes');
        if (!votesDiv) return;
        
        const votesList = Object.entries(votes).map(([name, agreed]) => 
            `${agreed ? '✅' : '❓'} ${name}`
        ).join(' | ');
        votesDiv.textContent = votesList;
        
        // Check if all agreed
        const allAgreed = Object.values(votes).every(v => v === true);
        const anyDeclined = Object.values(votes).some(v => v === false);
        
        if (allAgreed && Object.keys(votes).length >= totalHumanPlayers) {
            // All agreed - start replay
            const overlay = document.getElementById('play-again-overlay');
            if (overlay) overlay.remove();
            isReplayGame = true;
            initGame(activePlayerCount);
        } else if (anyDeclined) {
            // Someone declined - show message
            const waitingDiv = document.getElementById('replay-waiting');
            if (waitingDiv) {
                waitingDiv.innerHTML = `
                    <div style="color: #ff6b6b; margin-bottom: 10px;">❌ Replay declined</div>
                    <div style="font-size: 14px; color: rgba(255,255,255,0.7);">Starting new game with random first player...</div>
                `;
                setTimeout(() => {
                    const overlay = document.getElementById('play-again-overlay');
                    if (overlay) overlay.remove();
                    isReplayGame = false;
                    lastWinnerIndex = null;
                    initGame(activePlayerCount);
                }, 2000);
            }
        }
    }
    
    function showFirstPlayerAnnouncement(playerName, playerColor, reason) {
        // Remove any existing announcement
        let existing = document.getElementById('first-player-announcement');
        if (existing) existing.remove();
        
        const announcement = document.createElement('div');
        announcement.id = 'first-player-announcement';
        Object.assign(announcement.style, {
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(0.8)',
            background: 'linear-gradient(135deg, rgba(20,30,50,0.85), rgba(10,15,30,0.9))',
            padding: '30px 50px',
            borderRadius: '15px',
            border: '2px solid rgba(100,200,255,0.4)',
            boxShadow: '0 0 50px rgba(100,180,255,0.3)',
            zIndex: '40000',
            textAlign: 'center',
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            opacity: '0',
            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
        });
        
        const text = document.createElement('div');
        Object.assign(text.style, {
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '0 0 15px rgba(100,200,255,0.5)'
        });
        
        if (reason === 'winner') {
            text.innerHTML = `🏆 <span style="color: ${playerColor}">${playerName}</span> goes first!`;
        } else {
            text.innerHTML = `🎲 <span style="color: ${playerColor}">${playerName}</span> goes first!`;
        }
        announcement.appendChild(text);
        
        const subtext = document.createElement('div');
        Object.assign(subtext.style, {
            fontSize: '14px',
            color: 'rgba(200,230,255,0.6)',
            marginTop: '10px'
        });
        subtext.textContent = reason === 'winner' ? 'Winner of last game' : 'Randomly selected';
        announcement.appendChild(subtext);
        
        document.body.appendChild(announcement);
        
        // Animate in
        requestAnimationFrame(() => {
            announcement.style.opacity = '1';
            announcement.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        
        // Fade out and remove
        setTimeout(() => {
            announcement.style.opacity = '0';
            announcement.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => announcement.remove(), 500);
        }, 3000);
    }

    // ============================================================
    // TURN TIMER SYSTEM — stubs overridden by full implementation below
    // ============================================================
    
    // ============================================================
    // BOT REPLACEMENT SYSTEM
    // ============================================================
    
    function replacePlayerWithBot(playerIndex) {
        const player = gameState.players[playerIndex];
        const oldName = player.name;
        
        // Mark as AI player
        if (!AI_CONFIG.players.includes(playerIndex)) {
            AI_CONFIG.players.push(playerIndex);
        }
        
        // Update player name to indicate bot
        player.name = `🤖 ${oldName} (Bot)`;
        player.isBot = true;
        
        // Update player panel
        if (window.playerPanelUI) {
            window.playerPanelUI.updatePanel(`player_${playerIndex}`, {
                name: player.name,
                mood: 'neutral'
            });
        }
        
        // Alert all players
        showBotAlert(oldName, `${oldName} has been replaced with a bot due to inactivity`, true);
        
        // Let the bot take over immediately
        setTimeout(() => {
            aiTakeTurn();
        }, 2000);
    }
    
    function showBotAlert(playerName, message, isReplacement) {
        const alert = document.getElementById('bot-alert');
        const titleEl = document.getElementById('bot-alert-title');
        const msgEl = document.getElementById('bot-alert-message');
        
        if (alert && titleEl && msgEl) {
            titleEl.textContent = isReplacement ? 'Player Replaced' : '⚠️ Warning';
            msgEl.textContent = message;
            alert.classList.add('visible');
            
            setTimeout(() => {
                alert.classList.remove('visible');
            }, 4000);
        }
    }
    
    // ============================================================
    // PAUSE SYSTEM
    // ============================================================
    
    let gamePaused = false;
    let pauseTimerInterval = null;
    let pauseTimeRemaining = 300; // 5 minutes
    const PAUSE_TIME_LIMIT = 300; // 5 minutes in seconds
    
    function togglePause() {
        if (gamePaused) {
            resumeGame();
        } else {
            pauseGame();
        }
    }
    
    function pauseGame() {
        if (gamePaused) return;
        gamePaused = true;
        pauseTimeRemaining = PAUSE_TIME_LIMIT;
        
        const overlay = document.getElementById('pause-overlay');
        if (overlay) {
            overlay.classList.add('visible');
            updatePauseTimer();
        }
        
        pauseTimerInterval = setInterval(() => {
            pauseTimeRemaining--;
            updatePauseTimer();
            
            if (pauseTimeRemaining <= 0) {
                resumeGame();
            }
        }, 1000);
        
        // Broadcast pause state
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.updateState({ paused: true });
        }
    }
    
    function resumeGame() {
        gamePaused = false;
        
        if (pauseTimerInterval) {
            clearInterval(pauseTimerInterval);
            pauseTimerInterval = null;
        }
        
        const overlay = document.getElementById('pause-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
        }
        
        // Broadcast resume state
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.updateState({ paused: false });
        }
    }
    
    function updatePauseTimer() {
        const timerEl = document.getElementById('pause-timer');
        if (timerEl) {
            const mins = Math.floor(pauseTimeRemaining / 60);
            const secs = pauseTimeRemaining % 60;
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    // Expose to global scope
    window.togglePause = togglePause;
    window.resumeGame = resumeGame;
    
    // Toggle auto-move setting for human players
    function toggleAutoMove(enabled) {
        GAME_CONFIG.autoMoveForHumans = enabled;
        const label = document.getElementById('auto-move-label');
        if (label) {
            label.textContent = enabled ? 'ON' : 'OFF';
        }
        
        // Sync settings panel buttons
        const autoBtn = document.getElementById('btn-move-auto');
        const manualBtn = document.getElementById('btn-move-manual');
        if (autoBtn) {
            autoBtn.style.background = enabled ? '#4a4a6e' : '#2a2a3e';
            autoBtn.style.borderColor = enabled ? '#888' : '#555';
        }
        if (manualBtn) {
            manualBtn.style.background = enabled ? '#2a2a3e' : '#4a4a6e';
            manualBtn.style.borderColor = enabled ? '#555' : '#888';
        }
        
        console.log(`⚡ Auto-move for humans: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
    window.toggleAutoMove = toggleAutoMove;

    // ============================================================
    // GAME SESSION MANAGEMENT - Leave, Return, Boot, Turn Timer
    // ============================================================
    
    // Session state
    let gameSessionSettings = {
        isOrganizer: false,
        organizerId: null,
        replaceWithBot: true,
        noReturns: false,
        turnTimer: true,
        turnTimerWaitSeconds: 120,   // 2 minutes silent wait
        turnTimerClockSeconds: 60,   // 1 minute visible countdown
        turnTimerSeconds: 180,       // total (wait + clock)
        warningSeconds: 60,
        noBots: false
    };
    
    let playerLeftState = {
        hasLeft: false,
        originalPlayerId: null,
        botReplacementId: null,
        canReturn: true
    };
    
    let turnTimerState = {
        active: false,
        intervalId: null,
        waitTimeoutId: null,
        secondsRemaining: 0,
        clockSeconds: 60,
        phase: null,        // 'wait' or 'clock'
        isWarning: false
    };
    
    // Initialize session settings from URL params or server data
    function initSessionSettings(settings = {}) {
        gameSessionSettings = {
            ...gameSessionSettings,
            ...settings
        };
        
        // Show/hide organizer button
        const orgBtn = document.getElementById('organizer-menu-btn');
        if (orgBtn) {
            orgBtn.style.display = gameSessionSettings.isOrganizer ? 'inline-flex' : 'none';
        }
        
        // Start turn timer if enabled
        if (gameSessionSettings.turnTimer) {
            console.log('[Session] Turn timer enabled:', gameSessionSettings.turnTimerSeconds, 'seconds');
        }
    }
    
    // Leave Game Functions
    function showLeaveGameModal() {
        const modal = document.getElementById('leave-game-modal');
        const message = document.getElementById('leave-game-message');
        
        if (message) {
            if (gameSessionSettings.noBots || !gameSessionSettings.replaceWithBot) {
                message.textContent = 'You will be removed from the game. Your pegs will be taken off the board.';
            } else if (gameSessionSettings.noReturns) {
                message.textContent = 'A bot will replace you. You will NOT be able to return to this game.';
            } else {
                message.textContent = 'A bot will play for you while you\'re away. You can return anytime.';
            }
        }
        
        if (modal) {
            modal.classList.add('visible');
            modal.style.display = 'flex';
        }
    }
    
    function closeLeaveGameModal() {
        const modal = document.getElementById('leave-game-modal');
        if (modal) {
            modal.classList.remove('visible');
            modal.style.display = 'none';
        }
    }
    
    function confirmLeaveGame() {
        closeLeaveGameModal();
        
        const myPlayerIndex = getMyPlayerIndex();
        if (myPlayerIndex < 0) return;
        
        if (gameSessionSettings.noBots || !gameSessionSettings.replaceWithBot) {
            // Remove player completely
            removePlayerFromGame(myPlayerIndex);
        } else {
            // Replace with bot
            replacePlayerWithBot(myPlayerIndex);
            playerLeftState.hasLeft = true;
            playerLeftState.canReturn = !gameSessionSettings.noReturns;
            
            // Show return banner if allowed
            if (playerLeftState.canReturn) {
                showReturnBanner();
            }
        }
        
        // Notify server
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.sendAction({
                type: 'player_left',
                playerIndex: myPlayerIndex,
                replaceWithBot: gameSessionSettings.replaceWithBot && !gameSessionSettings.noBots
            });
        }
        
        // In solo mode (no multiplayer), navigate back to menu
        // since no human is left to watch the game
        const remainingHumans = gameState ? 
            gameState.players.filter(p => !p.isAI).length : 0;
        if (!isMultiplayer || remainingHumans === 0) {
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        }
    }
    
    function replacePlayerWithBot(playerIndex) {
        if (!gameState || !gameState.players[playerIndex]) return;
        
        const player = gameState.players[playerIndex];
        playerLeftState.originalPlayerId = player.id;
        
        // Mark player as AI
        player.isAI = true;
        player.wasHuman = true; // Track that this was a human
        player.name = `🤖 ${player.name} (Bot)`;
        
        // Update UI
        if (window.GameUIMinimal) {
            window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
        }
        
        // Show bot alert
        showBotAlert(`${player.name.replace(' (Bot)', '')} left`, 'A bot is now playing for them');
        
        // If it's this player's turn, AI takes over
        if (gameState.currentPlayerIndex === playerIndex) {
            setTimeout(() => aiTakeTurn(), 1000);
        }
        
        console.log(`[Session] Player ${playerIndex} replaced with bot`);
    }
    
    function removePlayerFromGame(playerIndex) {
        if (!gameState || !gameState.players[playerIndex]) return;
        
        const player = gameState.players[playerIndex];
        const playerName = player.name;
        
        // Remove all pegs from the board — both game state and 3D scene
        if (player.pegs) {
            player.pegs.forEach(peg => {
                // Remove 3D mesh from scene
                if (peg.mesh) {
                    if (peg.mesh.parent) peg.mesh.parent.remove(peg.mesh);
                    peg.mesh.visible = false;
                    // Dispose geometry and materials
                    peg.mesh.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    });
                }
                // Remove from pegRegistry
                if (typeof pegRegistry !== 'undefined') {
                    pegRegistry.forEach((regPeg, id) => {
                        if (regPeg.playerIndex === playerIndex) {
                            pegRegistry.delete(id);
                        }
                    });
                }
                // Clear peg state
                peg.position = -1;
                peg.state = 'removed';
            });
        }
        
        // Mark player as eliminated
        player.eliminated = true;
        player.active = false;
        
        // Hide their player panel
        if (window.playerPanelUI) {
            const panelEl = document.getElementById(`player_${playerIndex}`);
            if (panelEl) {
                panelEl.style.transition = 'opacity 0.5s, transform 0.5s';
                panelEl.style.opacity = '0';
                panelEl.style.transform = 'scale(0.8)';
                setTimeout(() => { panelEl.style.display = 'none'; }, 600);
            }
        }
        
        // Update UI
        if (window.GameUIMinimal) {
            window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
        }
        
        // If it was this player's turn, advance to next
        if (gameState.currentPlayerIndex === playerIndex) {
            gameState.advanceTurn();
        }
        
        console.log(`[Session] Player ${playerIndex} (${playerName}) fully removed from game`);
    }
    
    function showReturnBanner() {
        const banner = document.getElementById('return-game-banner');
        if (banner) {
            banner.style.display = 'block';
        }
    }
    
    function hideReturnBanner() {
        const banner = document.getElementById('return-game-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }
    
    function returnToGame() {
        if (!playerLeftState.hasLeft || !playerLeftState.canReturn) return;
        
        const myPlayerIndex = getMyPlayerIndex();
        if (myPlayerIndex < 0) return;
        
        const player = gameState.players[myPlayerIndex];
        if (player) {
            player.isAI = false;
            player.name = player.name.replace('🤖 ', '').replace(' (Bot)', '');
            
            // Update UI
            if (window.GameUIMinimal) {
                window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
            }
        }
        
        playerLeftState.hasLeft = false;
        hideReturnBanner();
        
        // Notify server
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.sendAction({
                type: 'player_returned',
                playerIndex: myPlayerIndex
            });
        }
        
        showBotAlert('Welcome Back!', 'You are now playing again');
        console.log(`[Session] Player ${myPlayerIndex} returned to game`);
    }
    
    function getMyPlayerIndex() {
        // In multiplayer, this comes from session
        // For now, return human player index (first non-AI)
        if (!gameState) return -1;
        for (let i = 0; i < gameState.players.length; i++) {
            if (!gameState.players[i].isAI && !gameState.players[i].wasHuman) {
                return i;
            }
        }
        return 0; // Default to first player in solo mode
    }
    
    // Organizer Controls
    function toggleOrganizerMenu() {
        const menu = document.getElementById('organizer-menu');
        if (!menu) return;
        
        if (menu.style.display === 'none' || !menu.style.display) {
            updateOrganizerPlayerList();
            menu.style.display = 'block';
        } else {
            menu.style.display = 'none';
        }
    }
    
    function closeOrganizerMenu() {
        const menu = document.getElementById('organizer-menu');
        if (menu) menu.style.display = 'none';
    }
    
    function updateOrganizerPlayerList() {
        const container = document.getElementById('organizer-player-list');
        if (!container || !gameState) return;
        
        const myIndex = getMyPlayerIndex();
        
        container.innerHTML = gameState.players.map((p, idx) => {
            const isOrganizer = idx === 0; // Organizer is usually player 0
            const isAI = p.isAI;
            const isMe = idx === myIndex;
            
            return `
                <div class="org-player-item ${isAI ? 'is-ai' : ''} ${isOrganizer ? 'is-host' : ''}">
                    <div class="player-info">
                        <span class="player-avatar">${p.avatar || '👤'}</span>
                        <span class="player-name" style="color: ${p.colorHex || '#fff'}">${p.name}${isMe ? ' (You)' : ''}</span>
                    </div>
                    ${!isOrganizer && !isMe ? `<button class="boot-btn" onclick="bootPlayer(${idx})">Boot</button>` : ''}
                </div>
            `;
        }).join('');
    }
    
    function bootPlayer(playerIndex) {
        if (!gameSessionSettings.isOrganizer) return;
        if (!gameState || !gameState.players[playerIndex]) return;
        
        const player = gameState.players[playerIndex];
        const playerName = player.name;
        
        // Replace with bot or remove based on settings
        if (gameSessionSettings.noBots || !gameSessionSettings.replaceWithBot) {
            removePlayerFromGame(playerIndex);
        } else {
            replacePlayerWithBot(playerIndex);
        }
        
        // Close and refresh menu
        updateOrganizerPlayerList();
        
        // Notify server
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.sendAction({
                type: 'player_booted',
                playerIndex: playerIndex,
                bootedBy: getMyPlayerIndex()
            });
        }
        
        console.log(`[Session] Organizer booted player ${playerIndex}: ${playerName}`);
    }
    
    // ============================================================
    // MID-GAME JOIN REQUESTS (Invited players can join after start)
    // ============================================================
    
    let pendingJoinRequests = []; // Array of { id, name, avatar, timestamp }
    let currentJoinRequest = null; // For the notification popup
    
    function addJoinRequest(playerId, playerName, playerAvatar = '👤') {
        // Only organizer handles join requests
        if (!gameSessionSettings.isOrganizer) return;
        
        const request = {
            id: playerId,
            name: playerName,
            avatar: playerAvatar,
            timestamp: Date.now()
        };
        
        pendingJoinRequests.push(request);
        updateJoinRequestUI();
        
        // Show notification popup for the newest request
        showJoinRequestNotification(request);
        
        console.log(`[Session] Join request received from ${playerName} (${playerId})`);
    }
    
    function updateJoinRequestUI() {
        // Update badge count
        const badge = document.getElementById('join-request-badge');
        if (badge) {
            if (pendingJoinRequests.length > 0) {
                badge.textContent = pendingJoinRequests.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
        
        // Update join requests section in organizer menu
        const section = document.getElementById('join-requests-section');
        const list = document.getElementById('join-requests-list');
        
        if (section && list) {
            if (pendingJoinRequests.length > 0) {
                section.style.display = 'block';
                list.innerHTML = pendingJoinRequests.map(req => `
                    <div class="join-request-item" data-request-id="${req.id}">
                        <div class="request-info">
                            <span class="request-avatar">${req.avatar}</span>
                            <span class="request-name">${req.name}</span>
                        </div>
                        <div class="request-actions">
                            <button class="approve-btn" onclick="approveJoinRequestById('${req.id}')">✓ Approve</button>
                            <button class="deny-btn" onclick="denyJoinRequestById('${req.id}')">✗</button>
                        </div>
                    </div>
                `).join('');
            } else {
                section.style.display = 'none';
            }
        }
    }
    
    function showJoinRequestNotification(request) {
        currentJoinRequest = request;
        
        const notification = document.getElementById('join-request-notification');
        const avatarEl = document.getElementById('join-notify-avatar');
        const nameEl = document.getElementById('join-notify-name');
        const slotOptions = document.getElementById('join-slot-options');
        const slotInfo = document.getElementById('join-slot-info');
        const replaceBotOption = document.getElementById('join-replace-bot-option');
        const newSlotOption = document.getElementById('join-new-slot-option');
        
        if (notification && avatarEl && nameEl) {
            avatarEl.textContent = request.avatar;
            nameEl.textContent = request.name;
            
            // Check available slots
            const availableSlots = getAvailableSlotInfo();
            
            // Show appropriate options based on what's available
            if (slotOptions && slotInfo) {
                if (availableSlots.hasBotSlot && availableSlots.hasEmptySlot) {
                    // Both options available - show radio buttons
                    slotOptions.style.display = 'block';
                    slotInfo.style.display = 'none';
                    if (replaceBotOption) replaceBotOption.style.display = 'flex';
                    if (newSlotOption) newSlotOption.style.display = 'flex';
                } else if (availableSlots.hasBotSlot) {
                    // Only bot replacement available
                    slotOptions.style.display = 'none';
                    slotInfo.style.display = 'block';
                    slotInfo.innerHTML = '🤖 Will replace a bot player';
                } else if (availableSlots.hasEmptySlot) {
                    // Only new slot available
                    slotOptions.style.display = 'none';
                    slotInfo.style.display = 'block';
                    slotInfo.innerHTML = '➕ Will start with fresh pegs in slot ' + (availableSlots.emptySlotIndex + 1);
                } else {
                    // No slots - shouldn't happen but handle it
                    slotOptions.style.display = 'none';
                    slotInfo.style.display = 'block';
                    slotInfo.innerHTML = '⚠️ No available slots';
                }
            }
            
            notification.style.display = 'block';
            
            // Play notification sound if available
            if (window.GameSFX && window.GameSFX.playNotification) {
                window.GameSFX.playNotification();
            }
        }
    }
    
    function getAvailableSlotInfo() {
        if (!gameState) return { hasBotSlot: false, hasEmptySlot: false };
        
        const currentPlayerCount = gameState.players.length;
        const isPrivateGame = gameSessionSettings.isPrivate !== false;
        const hasAnyBot = gameState.players.some(p => p.isAI);
        
        // Calculate max allowed players
        let maxPlayers = 6;
        if (!isPrivateGame) {
            maxPlayers = 4; // Public games max 4
        } else if (hasAnyBot) {
            maxPlayers = 4; // Private games with bots max 4
        }
        
        // Check for bot slots
        let botSlotIndex = -1;
        for (let i = 0; i < gameState.players.length; i++) {
            if (gameState.players[i].isAI) {
                botSlotIndex = i;
                break;
            }
        }
        
        // Check for empty slots
        let emptySlotIndex = -1;
        if (currentPlayerCount < maxPlayers) {
            emptySlotIndex = currentPlayerCount; // Next available slot
        }
        
        return {
            hasBotSlot: botSlotIndex !== -1,
            botSlotIndex: botSlotIndex,
            hasEmptySlot: emptySlotIndex !== -1,
            emptySlotIndex: emptySlotIndex,
            maxPlayers: maxPlayers,
            currentCount: currentPlayerCount
        };
    }
    
    function hideJoinRequestNotification() {
        const notification = document.getElementById('join-request-notification');
        if (notification) {
            notification.style.display = 'none';
        }
        currentJoinRequest = null;
    }
    
    function approveJoinRequest() {
        if (!currentJoinRequest) return;
        
        // Get selected slot type from radio buttons
        const slotTypeRadio = document.querySelector('input[name="join-slot-type"]:checked');
        const slotType = slotTypeRadio ? slotTypeRadio.value : 'replace-bot';
        
        approveJoinRequestWithSlot(currentJoinRequest.id, slotType);
        hideJoinRequestNotification();
    }
    
    function denyJoinRequest() {
        if (!currentJoinRequest) return;
        denyJoinRequestById(currentJoinRequest.id);
        hideJoinRequestNotification();
    }
    
    function approveJoinRequestById(requestId) {
        // Default to replace-bot when called from list
        approveJoinRequestWithSlot(requestId, 'replace-bot');
    }
    
    function approveJoinRequestWithSlot(requestId, slotType) {
        const requestIndex = pendingJoinRequests.findIndex(r => r.id === requestId);
        if (requestIndex === -1) return;
        
        const request = pendingJoinRequests[requestIndex];
        pendingJoinRequests.splice(requestIndex, 1);
        
        // Send approval to lobby server (server will broadcast late_player_joined)
        if (lobbyWebSocket && lobbyWebSocket.readyState === WebSocket.OPEN) {
            lobbyWebSocket.send(JSON.stringify({
                type: 'approve_late_join',
                user_id: requestId,
                slot_type: slotType
            }));
            console.log(`[Session] Sent approve_late_join for ${request.name} (slot_type=${slotType})`);
        } else {
            // Fallback: apply locally only (offline / no server)
            const availableSlots = getAvailableSlotInfo();
            let assignedSlot = -1;
            
            if (slotType === 'new-slot' && availableSlots.hasEmptySlot) {
                assignedSlot = createNewPlayerSlot(request);
            } else if (availableSlots.hasBotSlot) {
                assignedSlot = availableSlots.botSlotIndex;
                const player = gameState.players[assignedSlot];
                player.isAI = false;
                player.name = request.name;
                player.avatar = request.avatar;
                player.userId = request.id;
                player.wasHuman = false;
                if (window.GameUIMinimal) {
                    window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
                }
            } else if (availableSlots.hasEmptySlot) {
                assignedSlot = createNewPlayerSlot(request);
            }
            
            if (assignedSlot !== -1) {
                showBotAlert(`${request.name} Joined!`, 'A new player has entered the game');
            } else {
                showBotAlert('Game Full', `Cannot add ${request.name} - no available slots`);
            }
        }
        
        updateJoinRequestUI();
        updateOrganizerPlayerList();
        
        // Show next notification if there are more requests
        if (pendingJoinRequests.length > 0) {
            showJoinRequestNotification(pendingJoinRequests[0]);
        }
    }
    
    function createNewPlayerSlot(request) {
        if (!gameState) return -1;
        
        const newSlotIndex = gameState.players.length;
        const availableSlots = getAvailableSlotInfo();
        
        if (!availableSlots.hasEmptySlot) return -1;
        
        // Create new player with fresh start
        const playerColors = ['#ff2020', '#2196ff', '#4caf50', '#ffeb3b', '#ff9800', '#9c27b0'];
        const newPlayer = {
            name: request.name,
            avatar: request.avatar,
            userId: request.id,
            colorHex: playerColors[newSlotIndex % playerColors.length],
            isAI: false,
            pegs: [],
            deck: null, // Will need to create deck
            pegsInHolding: 4,
            pegsInSafeZone: 0,
            pegsInBullseye: 0
        };
        
        // Add to game state
        gameState.players.push(newPlayer);
        
        // Initialize pegs at start position
        if (typeof initializePegsForPlayer === 'function') {
            initializePegsForPlayer(newSlotIndex);
        }
        
        // Update UI
        if (window.GameUIMinimal) {
            window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
        }
        
        return newSlotIndex;
    }
    
    function denyJoinRequestById(requestId) {
        const requestIndex = pendingJoinRequests.findIndex(r => r.id === requestId);
        if (requestIndex === -1) return;
        
        const request = pendingJoinRequests[requestIndex];
        pendingJoinRequests.splice(requestIndex, 1);
        
        // Notify lobby server
        if (lobbyWebSocket && lobbyWebSocket.readyState === WebSocket.OPEN) {
            lobbyWebSocket.send(JSON.stringify({
                type: 'reject_late_join',
                user_id: requestId
            }));
        }
        
        console.log(`[Session] Denied join request from ${request.name}`);
        
        updateJoinRequestUI();
        
        // Show next notification if there are more requests
        if (pendingJoinRequests.length > 0) {
            showJoinRequestNotification(pendingJoinRequests[0]);
        }
    }
    
    function findAvailableBotSlot() {
        if (!gameState) return -1;
        
        // First, look for AI players (bots)
        for (let i = 0; i < gameState.players.length; i++) {
            if (gameState.players[i].isAI) {
                return i;
            }
        }
        
        // Then, look for eliminated players
        for (let i = 0; i < gameState.players.length; i++) {
            if (gameState.players[i].eliminated) {
                return i;
            }
        }
        
        return -1; // No available slots
    }
    
    // Expose join request functions globally
    window.addJoinRequest = addJoinRequest;
    window.approveJoinRequest = approveJoinRequest;
    window.denyJoinRequest = denyJoinRequest;
    window.approveJoinRequestById = approveJoinRequestById;
    window.approveJoinRequestWithSlot = approveJoinRequestWithSlot;
    window.denyJoinRequestById = denyJoinRequestById;
    window.getAvailableSlotInfo = getAvailableSlotInfo;
    window.createNewPlayerSlot = createNewPlayerSlot;
    
    // Handle incoming join request from server (WebSocket message)
    function handleServerJoinRequest(data) {
        if (!gameSessionSettings.isOrganizer) return;
        
        addJoinRequest(
            data.playerId || data.user_id,
            data.playerName || data.username,
            data.avatar || data.avatar_id || '👤'
        );
    }
    window.handleServerJoinRequest = handleServerJoinRequest;

    // ============================================================
    // TURN TIMER SYSTEM — 2 minute wait + 1 minute visible clock
    // ============================================================
    // Phase 1: 2 minutes silent wait (timer display hidden)
    // Phase 2: 1 minute visible countdown clock
    // On expire: replace with bot (or remove if organizer set no-bots)
    
    function startTurnTimer() {
        if (!gameSessionSettings.turnTimer) return;
        
        // Only use turn timer in multiplayer games with 2+ human players.
        // Solo play against bots doesn't need a timer.
        if (gameState && gameState.players) {
            const humanCount = gameState.players.filter(p => p && !p.isAI && !p.isBot).length;
            if (humanCount <= 1) return;
        }
        
        stopTurnTimer();
        
        const waitSeconds = gameSessionSettings.turnTimerWaitSeconds || 120;
        const clockSeconds = gameSessionSettings.turnTimerClockSeconds || 60;
        
        turnTimerState.active = true;
        turnTimerState.phase = 'wait';  // 'wait' then 'clock'
        turnTimerState.secondsRemaining = waitSeconds;
        turnTimerState.clockSeconds = clockSeconds;
        turnTimerState.isWarning = false;
        
        // Hide timer display during silent wait phase
        const timerDisplay = document.getElementById('turn-timer-display');
        const countdown = document.getElementById('turn-timer-countdown');
        const warning = document.getElementById('turn-timer-warning');
        const label = document.getElementById('turn-timer-label');
        
        if (timerDisplay) timerDisplay.style.display = 'none';
        if (warning) warning.style.display = 'none';
        if (countdown) countdown.classList.remove('warning', 'critical');
        
        turnTimerState.intervalId = setInterval(() => {
            turnTimerState.secondsRemaining--;
            
            if (turnTimerState.phase === 'wait') {
                // Silent phase — no visible UI
                if (turnTimerState.secondsRemaining <= 0) {
                    // Transition to visible clock phase
                    turnTimerState.phase = 'clock';
                    turnTimerState.secondsRemaining = turnTimerState.clockSeconds;
                    turnTimerState.isWarning = true;
                    
                    // Show the countdown clock
                    if (timerDisplay) timerDisplay.style.display = 'block';
                    if (label) label.textContent = 'Time Remaining';
                    if (warning) {
                        warning.textContent = '⚠️ Make your move!';
                        warning.style.display = 'block';
                    }
                    if (countdown) countdown.classList.add('warning');
                    updateTurnTimerDisplay();
                }
            } else {
                // Visible clock phase
                updateTurnTimerDisplay();
                
                // Critical phase (last 15 seconds) — pulse red
                if (turnTimerState.secondsRemaining <= 15) {
                    if (countdown) countdown.classList.add('critical');
                    if (warning) warning.textContent = '⏰ Hurry up!';
                }
                
                // Time fully expired
                if (turnTimerState.secondsRemaining <= 0) {
                    handleTurnTimerExpired();
                }
            }
        }, 1000);
    }
    
    function stopTurnTimer() {
        if (turnTimerState.intervalId) {
            clearInterval(turnTimerState.intervalId);
            turnTimerState.intervalId = null;
        }
        if (turnTimerState.waitTimeoutId) {
            clearTimeout(turnTimerState.waitTimeoutId);
            turnTimerState.waitTimeoutId = null;
        }
        turnTimerState.active = false;
        turnTimerState.phase = null;
        
        const timerDisplay = document.getElementById('turn-timer-display');
        if (timerDisplay) timerDisplay.style.display = 'none';
    }
    
    function updateTurnTimerDisplay() {
        const countdown = document.getElementById('turn-timer-countdown');
        if (!countdown) return;
        
        const mins = Math.floor(turnTimerState.secondsRemaining / 60);
        const secs = turnTimerState.secondsRemaining % 60;
        countdown.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    function handleTurnTimerExpired() {
        stopTurnTimer();
        
        const currentIdx = gameState?.currentPlayerIndex;
        if (currentIdx === undefined) return;
        
        const player = gameState.players[currentIdx];
        if (!player || player.isAI) return;
        
        // Check organizer setting: bots allowed?
        if (gameSessionSettings.noBots) {
            // === NO BOTS MODE: Remove player entirely ===
            showBotAlert(
                `${player.name} Timed Out`,
                `${player.name} ran out of time and has been removed from the game. Their pegs have been cleared.`
            );
            removePlayerFromGame(currentIdx);
            console.log(`[TurnTimer] Player ${currentIdx} removed (no-bots mode)`);
        } else {
            // === BOTS ALLOWED: Replace with bot ===
            showBotAlert(
                'Time\'s Up!',
                `${player.name} ran out of time and has been replaced by a bot.`
            );
            replacePlayerWithBot(currentIdx);
            
            // Let the bot take over
            setTimeout(() => aiTakeTurn(), 1000);
            console.log(`[TurnTimer] Player ${currentIdx} replaced with bot`);
        }
    }
    
    function showBotAlert(title, message) {
        const alert = document.getElementById('bot-alert');
        const titleEl = document.getElementById('bot-alert-title');
        const msgEl = document.getElementById('bot-alert-message');
        
        if (alert && titleEl && msgEl) {
            titleEl.textContent = title;
            msgEl.textContent = message;
            alert.classList.add('visible');
            
            setTimeout(() => {
                alert.classList.remove('visible');
            }, 3000);
        }
    }
    
    // Expose functions globally
    window.showLeaveGameModal = showLeaveGameModal;
    window.closeLeaveGameModal = closeLeaveGameModal;
    window.confirmLeaveGame = confirmLeaveGame;
    window.returnToGame = returnToGame;
    window.toggleOrganizerMenu = toggleOrganizerMenu;
    window.closeOrganizerMenu = closeOrganizerMenu;
    window.bootPlayer = bootPlayer;
    window.initSessionSettings = initSessionSettings;
    window.startTurnTimer = startTurnTimer;
    window.stopTurnTimer = stopTurnTimer;

    // =================================================================
    // Game Chat System (Tournament/Guild Games)
    // =================================================================
    
    let gameChatState = {
        enabled: false,         // Chat available for this game type
        visible: true,          // Chat panel open
        optedOut: false,        // User opted out
        messages: [],           // Chat history
        unreadCount: 0,         // Unread messages when minimized
        blockedUsers: [],       // Blocked user IDs
        blockedByUsers: [],     // Users who blocked current user
        unblockCooldowns: {}    // Cooldown tracking
    };
    
    function initGameChat(gameType) {
        // Chat only for tournament and guild games
        gameChatState.enabled = (gameType === 'tournament' || gameType === 'guild');
        
        if (!gameChatState.enabled) {
            const panel = document.getElementById('game-chat-panel');
            const toggle = document.getElementById('game-chat-toggle');
            if (panel) panel.style.display = 'none';
            if (toggle) toggle.style.display = 'none';
            return;
        }
        
        // Load preferences
        gameChatState.optedOut = localStorage.getItem('ft_game_chat_opted_out') === 'true';
        
        // Load block cooldowns
        try {
            const stored = localStorage.getItem('ft_block_cooldowns');
            if (stored) {
                gameChatState.unblockCooldowns = JSON.parse(stored);
            }
        } catch(e) {}
        
        // Show chat panel
        updateGameChatUI();
    }
    
    function updateGameChatUI() {
        const panel = document.getElementById('game-chat-panel');
        const toggle = document.getElementById('game-chat-toggle');
        const active = document.getElementById('game-chat-active');
        const disabled = document.getElementById('game-chat-disabled');
        const optedOut = document.getElementById('game-chat-opted-out');
        
        if (!gameChatState.enabled) {
            if (panel) panel.style.display = 'none';
            if (toggle) toggle.style.display = 'none';
            return;
        }
        
        if (gameChatState.visible) {
            if (panel) panel.classList.add('visible');
            if (toggle) toggle.style.display = 'none';
            gameChatState.unreadCount = 0;
            updateChatUnreadBadge();
        } else {
            if (panel) panel.classList.remove('visible');
            if (toggle) toggle.style.display = 'flex';
        }
        
        // Show appropriate content
        if (active) active.style.display = gameChatState.optedOut ? 'none' : 'block';
        if (optedOut) optedOut.style.display = gameChatState.optedOut ? 'block' : 'none';
        if (disabled) disabled.style.display = 'none';
        
        // Update opt button
        const optBtn = document.getElementById('game-chat-opt-btn');
        if (optBtn) {
            optBtn.textContent = gameChatState.optedOut ? '🔔 Opt In' : '🔇 Opt Out';
        }
    }
    
    function toggleGameChat() {
        gameChatState.visible = true;
        gameChatState.unreadCount = 0;
        updateGameChatUI();
    }
    
    function minimizeGameChat() {
        gameChatState.visible = false;
        updateGameChatUI();
    }
    
    function toggleGameChatOptOut() {
        gameChatState.optedOut = !gameChatState.optedOut;
        localStorage.setItem('ft_game_chat_opted_out', gameChatState.optedOut ? 'true' : 'false');
        updateGameChatUI();
    }
    
    function showGameChatSettings() {
        const modal = document.getElementById('game-chat-settings-modal');
        if (modal) modal.style.display = 'flex';
    }
    
    function hideGameChatSettings() {
        const modal = document.getElementById('game-chat-settings-modal');
        if (modal) modal.style.display = 'none';
    }
    
    function showGameBlockedUsers() {
        hideGameChatSettings();
        // For now, show a simple alert - could expand to full modal
        alert('Blocked users management. Use the lobby to manage blocked users.');
    }
    
    function sendGameChatMessage() {
        if (!gameChatState.enabled || gameChatState.optedOut) return;
        
        const input = document.getElementById('game-chat-input');
        const message = input?.value?.trim();
        if (!message) return;
        
        // Send to server
        if (typeof GameStateBroadcaster !== 'undefined') {
            GameStateBroadcaster.sendAction({
                type: 'game_chat',
                message: message
            });
        }
        
        // Also call WebSocket send if available
        if (typeof window.sendToServer === 'function') {
            window.sendToServer({
                type: 'game_chat',
                message: message
            });
        }
        
        input.value = '';
    }
    
    function receiveGameChatMessage(data) {
        if (!gameChatState.enabled || gameChatState.optedOut) return;
        
        // Check if sender is blocked
        if (gameChatState.blockedUsers.includes(data.senderId)) return;
        if (gameChatState.blockedByUsers.includes(data.senderId)) return;
        
        const container = document.getElementById('game-chat-messages');
        if (!container) return;
        
        // Clear placeholder
        const placeholder = container.querySelector('div[style*="text-align: center"]');
        if (placeholder) placeholder.remove();
        
        const time = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const msgEl = document.createElement('div');
        msgEl.className = 'game-chat-msg';
        msgEl.dataset.senderId = data.senderId;
        msgEl.innerHTML = `
            <span class="game-chat-sender ${data.isGuildmaster ? 'guildmaster' : ''}">
                ${escapeHtmlChat(data.senderName)}${data.isGuildmaster ? ' 👑' : ''}:
            </span>
            <span class="game-chat-text">${escapeHtmlChat(data.message)}</span>
            <span class="game-chat-time">${time}</span>
        `;
        
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
        
        // Track unread if minimized
        if (!gameChatState.visible) {
            gameChatState.unreadCount++;
            updateChatUnreadBadge();
        }
        
        gameChatState.messages.push(data);
    }
    
    function updateChatUnreadBadge() {
        const badge = document.getElementById('chat-unread-badge');
        if (badge) {
            if (gameChatState.unreadCount > 0) {
                badge.textContent = gameChatState.unreadCount;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    
    function blockUserInGame(userId, userName) {
        // Check cooldown
        const cooldownEnd = gameChatState.unblockCooldowns[userId];
        if (cooldownEnd && Date.now() < cooldownEnd) {
            const hours = Math.ceil((cooldownEnd - Date.now()) / (1000 * 60 * 60));
            alert(`Must wait ${hours} hours to block this user again`);
            return;
        }
        
        gameChatState.blockedUsers.push(userId);
        
        // Remove their messages from view
        const messages = document.querySelectorAll(`.game-chat-msg[data-sender-id="${userId}"]`);
        messages.forEach(el => el.remove());
        
        // Send to server
        if (typeof window.sendToServer === 'function') {
            window.sendToServer({
                type: 'block_user',
                userId: userId
            });
        }
        
        console.log(`[Chat] Blocked user ${userName}`);
    }
    
    function escapeHtmlChat(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Expose game chat functions
    window.initGameChat = initGameChat;
    window.toggleGameChat = toggleGameChat;
    window.minimizeGameChat = minimizeGameChat;
    window.toggleGameChatOptOut = toggleGameChatOptOut;
    window.showGameChatSettings = showGameChatSettings;
    window.hideGameChatSettings = hideGameChatSettings;
    window.showGameBlockedUsers = showGameBlockedUsers;
    window.sendGameChatMessage = sendGameChatMessage;
    window.receiveGameChatMessage = receiveGameChatMessage;
    window.blockUserInGame = blockUserInGame;

    function aiTakeTurn() {
        console.log('[aiTakeTurn] Called, gameState:', !!gameState, 'winner:', gameState?.winner);
        if (!gameState || gameState.winner) return;
        
        const currentIdx = gameState.currentPlayerIndex;
        console.log('[aiTakeTurn] currentIdx:', currentIdx, 'isAI:', isAIPlayer(currentIdx));
        if (!isAIPlayer(currentIdx)) return;
        
        const playerName = gameState.players[currentIdx].name;
        console.log(`[aiTakeTurn] ${playerName} taking turn, phase:`, gameState.phase);
        
        // Show AI thinking
        showAIThinking(playerName);
        
        // Get entity-specific draw delay from ManifoldAI (or fall back to AI_CONFIG)
        let drawDelay = AI_CONFIG.drawDelay;
        if (window.ManifoldAI) {
            const entity = ManifoldAI.getEntity(currentIdx);
            if (entity) {
                drawDelay = entity.drawDelay;
                console.log(`[aiTakeTurn] ${entity.emoji} ${entity.archetype} drawDelay: ${drawDelay}ms`);
            }
        }
        
        // AI draws card - the onCardDrawn handler will highlight moves
        // and then aiSelectAndClickMove will be called after delay
        setTimeout(() => {
            console.log('[aiTakeTurn] After delay, phase:', gameState.phase, 'drawDelay was:', drawDelay);
            if (gameState.phase === 'draw') {
                console.log('[aiTakeTurn] Calling handleDrawCard(true)');
                handleDrawCard(true);  // true = called by AI
                // Note: The rest is handled by onCardDrawn which calls aiSelectAndClickMove
            } else {
                console.error('[aiTakeTurn] NOT in draw phase! Cannot draw. Phase is:', gameState.phase);
            }
        }, drawDelay);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // AI DECISION ENGINE - Helix-style rule-based scoring system
    // Uses priority-weighted evaluation following ButterflyFX kernel pattern
    // ═══════════════════════════════════════════════════════════════════════════════
    
    /**
     * AI Move Evaluation Rules - Truth Table Style
     * Each rule returns a score contribution. Higher total score = better move.
     * 
     * Rule Priority (Fibonacci-aligned weights):
     * - Level 6 (Weight 89): Win condition (winner hole)
     * - Level 5 (Weight 55): Safe zone progress  
     * - Level 4 (Weight 34): Cut opponent
     * - Level 3 (Weight 21): FastTrack/Bullseye entry
     * - Level 2 (Weight 13): Enter from holding
     * - Level 1 (Weight 8):  Position advantage
     * - Level 0 (Weight 5):  Random tiebreaker
     */
    const AI_MOVE_RULES = {
        // WIN CONDITION - Highest priority
        isWinnerHole: {
            weight: 89,
            evaluate: (move, context) => {
                return move.toHoleId.includes('winner') ? 1 : 0;
            }
        },
        
        // SAFE ZONE PROGRESS - Very high priority
        isSafeZoneMove: {
            weight: 55,
            evaluate: (move, context) => {
                if (!move.toHoleId.includes('safe')) return 0;
                // Higher safe zone number = closer to winning
                const parts = move.toHoleId.split('-');
                const safeNum = parseInt(parts[2]) || 1;
                return safeNum / 4; // 0.25 to 1.0
            }
        },
        
        // CUT OPPONENT - High priority
        isCutMove: {
            weight: 34,
            evaluate: (move, context) => {
                const cutTarget = findCutTargetAtHole(move.toHoleId);
                if (!cutTarget) return 0;
                // Extra value for cutting opponent close to their safe zone
                const victimPegsOnBoard = cutTarget.player.peg.filter(p => p.holeType !== 'holding').length;
                return 0.5 + (victimPegsOnBoard > 3 ? 0.5 : victimPegsOnBoard * 0.1);
            }
        },
        
        // BULLSEYE CUT - Very high priority for royal cards
        // Strategy: Use royal card to enter bullseye and cut opponent sitting there
        isBullseyeCut: {
            weight: 40,  // Higher than regular cut - bullseye is valuable position
            evaluate: (move, context) => {
                // Only applies to bullseye/center moves
                if (move.toHoleId !== 'center' && !move.isCenterOption) return 0;
                
                // Check if opponent is in bullseye
                const cutTarget = findCutTargetAtHole('center');
                if (!cutTarget) return 0;
                
                // High value: you get bullseye AND cut opponent
                // Even higher value if opponent was close to exiting
                const victimPeg = cutTarget.peg;
                if (victimPeg && victimPeg.eligibleForSafeZone) {
                    return 1.0;  // Max value - opponent was about to finish
                }
                return 0.8;  // Still great - took bullseye and cut
            }
        },
        
        // FASTTRACK ENTRY - High priority (bypasses most of the board)
        isFastTrackEntry: {
            weight: 25,  // Increased to ensure AI prioritizes FastTrack entry
            evaluate: (move, context) => {
                // FastTrack (not bullseye) is generally safe and valuable
                if (move.isFastTrackEntry === true) {
                    console.log(`🤖 [AI FT] FastTrack ENTRY option detected: ${move.toHoleId}, returning score 1.0`);
                    return 1.0;
                }
                // Penalize NON-entry when landing on ft-* (incentivize choosing FastTrack entry)
                if (move.toHoleId.startsWith('ft-') && !move.isFastTrackEntry && !context.peg?.onFasttrack) {
                    console.log(`🤖 [AI FT] FastTrack PASS-THROUGH option (not entering): ${move.toHoleId}, returning score -0.3`);
                    return -0.3;  // Slight penalty for NOT entering FastTrack when on ft-* hole
                }
                return 0;
            }
        },
        
        // FASTTRACK TRAVERSAL - Default preference is to stay on FT
        // BUT bots can choose to leave FT for strategic reasons:
        //   - To cut an opponent (difficulty-dependent)
        //   - To enter bullseye/center
        //   - When forced by 4-card (mustExitFasttrack)
        // Easy bots: NEVER leave FT voluntarily
        // Normal+: Leave FT to cut if strategic
        // Warpath: Will always leave if there's a cut available
        isFastTrackTraversal: {
            weight: 60,  // Higher than safe zone (55) for default FT preference
            evaluate: (move, context) => {
                // Only applies to pegs already ON FastTrack
                if (!context.peg?.onFasttrack) return 0;
                
                // Continuing on FastTrack ring (ft-* to ft-*)
                if (move.toHoleId.startsWith('ft-') && !move.isLeaveFastTrack) {
                    return 1.0;
                }
                
                // Leaving FastTrack — check if there's a strategic reason
                if (move.isLeaveFastTrack) {
                    const diffPreset = getDifficultyPreset();
                    
                    // Check if leaving FT lands on an opponent (cut opportunity)
                    const cutAtDest = typeof findCutTargetAtHole === 'function' 
                        ? findCutTargetAtHole(move.toHoleId) : null;
                    
                    if (cutAtDest && diffPreset.aiFTLeaveToCut) {
                        // Strategic reason to leave FT: CUT!
                        // Return positive score — the isCutMove rule will add MORE on top
                        console.log(`🤖 [AI FT] Leave FT FOR CUT at ${move.toHoleId} — allowing (difficulty: ${GAME_CONFIG.difficulty})`);
                        return 0.3;  // Slight positive — let isCutMove weight decide final priority
                    }
                    
                    // Entering bullseye from FT — check if cutting opponent there
                    if (move.toHoleId === 'center' || move.isCenterOption) {
                        const centerCut = typeof findCutTargetAtHole === 'function'
                            ? findCutTargetAtHole('center') : null;
                        if (centerCut) {
                            console.log(`🤖 [AI FT] Leave FT to CUT in BULLSEYE — high priority!`);
                            return 1.0;  // Must beat FT continue (1.0) — isBullseyeCut adds more
                        }
                        return 0.5;  // Empty bullseye is still a strong strategic position
                    }
                    
                    // ════════════════════════════════════════════════════
                    // WARPATH: Leave FT to POSITION against opponents
                    // even without an immediate cut. If any human opponent
                    // has a peg in home stretch, center, or FT — warpath
                    // bot exits FT to get on the outer track and hunt them.
                    // ════════════════════════════════════════════════════
                    if (GAME_CONFIG.difficulty === 'warpath' && gameState && gameState.players) {
                        let hasHuntTarget = false;
                        for (const opp of gameState.players) {
                            if (opp.index === context.player.index) continue;
                            if (isAIPlayer(opp.index)) continue;  // Only hunt humans
                            for (const op of opp.peg) {
                                if (op.holeType === 'holding') continue;
                                if (op.inHomeStretch || op.lockedToSafeZone || op.eligibleForSafeZone ||
                                    op.inBullseye || op.holeId === 'center' ||
                                    (op.onFasttrack && op.holeId?.startsWith('ft-'))) {
                                    hasHuntTarget = true;
                                    break;
                                }
                            }
                            if (hasHuntTarget) break;
                        }
                        if (hasHuntTarget) {
                            // Check if the leave-FT destination is closer to a target
                            const destHole = move.toHoleId;
                            let positionScore = 0;
                            for (const opp of gameState.players) {
                                if (opp.index === context.player.index || isAIPlayer(opp.index)) continue;
                                for (const op of opp.peg) {
                                    if (op.holeType === 'holding' || op.inBullseye) continue;
                                    if (op.inHomeStretch || op.lockedToSafeZone || op.eligibleForSafeZone) {
                                        const dist = getTrackDistance(destHole, op.holeId);
                                        if (dist !== null && dist >= 1 && dist <= 12) {
                                            positionScore = Math.max(positionScore, 0.6);
                                        }
                                    }
                                    if (op.onFasttrack && op.holeId?.startsWith('ft-')) {
                                        positionScore = Math.max(positionScore, 0.4);
                                    }
                                }
                            }
                            if (positionScore > 0) {
                                console.log(`🔥 [WARPATH FT] Leaving FT to HUNT — positioning at ${move.toHoleId} (score: ${positionScore})`);
                                return positionScore;
                            }
                        }
                    }
                    
                    // No strategic reason — penalize leaving
                    console.log(`🤖 [AI FT] Leave FT with no cut target — penalized`);
                    return -0.5;
                }
                
                return 0;
            }
        },
        
        // BULLSEYE ENTRY - Risk/reward based on board state
        // Risky with many opponents out, safer with few
        isBullseyeEntry: {
            weight: 18,  // Slightly lower than FastTrack
            evaluate: (move, context) => {
                // Only applies to bullseye moves (not cutting - that's handled separately)
                if (move.toHoleId !== 'center' && !move.isCenterOption) return 0;
                
                // If cutting someone in bullseye, use isBullseyeCut rule instead
                const cutTarget = findCutTargetAtHole('center');
                if (cutTarget) return 0;  // Let isBullseyeCut handle this
                
                if (!gameState || !gameState.players) return 0.5;
                
                // Count total opponent pegs on the board (not in holding)
                let opponentPegsOnBoard = 0;
                for (const player of gameState.players) {
                    if (player.index === context.player.index) continue;
                    opponentPegsOnBoard += player.peg.filter(p => 
                        p.holeType !== 'holding' && !p.completedCircuit
                    ).length;
                }
                
                // Risk assessment:
                // 0-3 opponent pegs: Safe to enter (low chance of royal card hit)
                // 4-6 opponent pegs: Moderate risk
                // 7+ opponent pegs: High risk (someone likely to get royal)
                
                if (opponentPegsOnBoard <= 3) {
                    return 1.0;  // Go for it - few opponents can threaten
                } else if (opponentPegsOnBoard <= 6) {
                    return 0.5;  // Moderate value - some risk
                } else {
                    return 0.2;  // Low value - very risky with full board
                }
            }
        },
        
        // ENTER FROM HOLDING - Medium priority
        isEnterMove: {
            weight: 13,
            evaluate: (move, context) => {
                if (move.type !== 'enter') return 0;
                // Value having pegs on board
                const pegsOnBoard = context.player.peg.filter(p => p.holeType !== 'holding').length;
                return pegsOnBoard < 2 ? 1.0 : 0.5; // More valuable when few pegs deployed
            }
        },
        
        // STRATEGIC BACKWARD POSITIONING (for 4-card)
        // Key strategy: Position near home hole so next forward move enters safe zone
        isStrategicBackward: {
            weight: 15,  // Increased - backward positioning is important
            evaluate: (move, context) => {
                if (!context.isBackwardCard) return 0;
                const peg = context.player.peg.find(p => p.id === move.pegId);
                if (!peg) return 0;
                
                const boardPos = context.playerBoardPos;
                const destHoleId = move.toHoleId;
                
                // IDEAL POSITIONS after 4-card backward move:
                // 1. side-right-{boardPos}-* : Just past your home, moving forward will approach home
                // 2. outer-{boardPos}-* : On your section's outer track, close to home
                // 3. side-left-{boardPos}-* : Approaching home from the correct direction
                
                // Best: side-right holes on YOUR section (1-4 steps past home)
                // Moving forward from here approaches home from CLOCKWISE = safe zone eligible
                const sideRightMatch = destHoleId.match(/^side-right-(\d+)-(\d+)$/);
                if (sideRightMatch) {
                    const holePlayer = parseInt(sideRightMatch[1]);
                    const holeNum = parseInt(sideRightMatch[2]);
                    if (holePlayer === boardPos) {
                        // Perfect! side-right-{boardPos}-1 is best (closest to home)
                        return 1.0 - (holeNum - 1) * 0.1; // 1.0, 0.9, 0.8, 0.7
                    }
                }
                
                // Good: outer track on YOUR section
                const outerMatch = destHoleId.match(/^outer-(\d+)-(\d+)$/);
                if (outerMatch) {
                    const holePlayer = parseInt(outerMatch[1]);
                    const holeNum = parseInt(outerMatch[2]);
                    if (holePlayer === boardPos) {
                        // outer-{boardPos}-3 is closest to home
                        return 0.5 + (holeNum / 10); // 0.5, 0.6, 0.7, 0.8
                    }
                }
                
                // Okay: side-left on YOUR section (still approaching home)
                const sideLeftMatch = destHoleId.match(/^side-left-(\d+)-(\d+)$/);
                if (sideLeftMatch) {
                    const holePlayer = parseInt(sideLeftMatch[1]);
                    if (holePlayer === boardPos) {
                        return 0.4;
                    }
                }
                
                // Not on your section - less valuable
                return 0.1;
            }
        },
        
        // DEFENSIVE POSITIONING - Avoid vulnerable spots
        // Penalty for landing RIGHT IN FRONT of an opponent (they can cut you next turn)
        defensivePositioning: {
            weight: -20,  // Negative weight = penalty
            evaluate: (move, context) => {
                if (!gameState || !gameState.players) return 0;
                
                const destHoleId = move.toHoleId;
                // Skip safe zones, home holes, center - these are protected or special
                if (destHoleId.includes('safe') || destHoleId.includes('home') || 
                    destHoleId === 'center' || destHoleId.includes('winner')) return 0;
                
                let dangerScore = 0;
                
                // Check each opponent
                for (const opponent of gameState.players) {
                    if (opponent.index === context.player.index) continue;
                    
                    for (const oppPeg of opponent.peg) {
                        if (oppPeg.holeType === 'holding' || oppPeg.inBullseye) continue;
                        
                        // Get distance from opponent peg to our destination
                        const distance = getTrackDistance(oppPeg.holeId, destHoleId);
                        
                        // VERY DANGEROUS: 1-3 holes in front of opponent (easy cut)
                        if (distance >= 1 && distance <= 3) {
                            dangerScore = Math.max(dangerScore, 1.0);  // Max penalty
                        }
                        // DANGEROUS: 4-6 holes in front (one turn cut range)
                        else if (distance >= 4 && distance <= 6) {
                            dangerScore = Math.max(dangerScore, 0.6);
                        }
                        // MODERATE: 7-10 holes (still at risk with high cards)
                        else if (distance >= 7 && distance <= 10) {
                            dangerScore = Math.max(dangerScore, 0.3);
                        }
                    }
                }
                
                return dangerScore;
            }
        },
        
        // AVOID 4-CARD VULNERABILITY
        // Penalty for being exactly 4 holes BEHIND an opponent (they draw 4, you're cut)
        avoid4CardTrap: {
            weight: -15,
            evaluate: (move, context) => {
                if (!gameState || !gameState.players) return 0;
                
                const destHoleId = move.toHoleId;
                if (destHoleId.includes('safe') || destHoleId.includes('home') || 
                    destHoleId === 'center') return 0;
                
                let trapScore = 0;
                
                for (const opponent of gameState.players) {
                    if (opponent.index === context.player.index) continue;
                    
                    for (const oppPeg of opponent.peg) {
                        if (oppPeg.holeType === 'holding' || oppPeg.inBullseye) continue;
                        
                        // Distance from US to THEM (we are behind them)
                        const distance = getTrackDistance(destHoleId, oppPeg.holeId);
                        
                        // Exactly 4 holes behind = 4 card trap
                        if (distance === 4) {
                            trapScore = Math.max(trapScore, 1.0);
                        }
                        // 3 or 5 holes behind = slight risk
                        else if (distance === 3 || distance === 5) {
                            trapScore = Math.max(trapScore, 0.3);
                        }
                    }
                }
                
                return trapScore;
            }
        },
        
        // OFFENSIVE POSITIONING - Land just behind an opponent
        // Good spot: You might cut them on your next turn
        offensivePositioning: {
            weight: 8,
            evaluate: (move, context) => {
                if (!gameState || !gameState.players) return 0;
                
                const destHoleId = move.toHoleId;
                if (destHoleId.includes('safe') || destHoleId === 'center') return 0;
                
                let offenseScore = 0;
                
                for (const opponent of gameState.players) {
                    if (opponent.index === context.player.index) continue;
                    
                    for (const oppPeg of opponent.peg) {
                        if (oppPeg.holeType === 'holding' || oppPeg.inBullseye) continue;
                        
                        // Distance from us to them (we are behind)
                        const distance = getTrackDistance(destHoleId, oppPeg.holeId);
                        
                        // 1-3 holes behind = great position to cut with low card
                        if (distance >= 1 && distance <= 3) {
                            offenseScore = Math.max(offenseScore, 0.8);
                        }
                        // 4-7 holes behind = good position
                        else if (distance >= 4 && distance <= 7) {
                            offenseScore = Math.max(offenseScore, 0.5);
                        }
                    }
                }
                
                return offenseScore;
            }
        },
        
        // ════════════════════════════════════════════════════════════════
        // WARPATH HUNTING — Dedicated warpath-only targeting AI
        // Every move is evaluated for how well it positions the bot
        // to TARGET opponent pegs, with priority on:
        //   1. Opponents in home stretch (about to win — must intercept)
        //   2. Opponents in center/bullseye (high-value position to steal)
        //   3. Opponents on FastTrack circuit (moving fast — disrupt them)
        //   4. Any opponent peg within striking range
        // This rule ONLY activates for warpath difficulty.
        // ════════════════════════════════════════════════════════════════
        warpathHunting: {
            weight: 70,  // Higher than FT traversal (60) — hunting overrides FT loyalty
            evaluate: (move, context) => {
                // ONLY active for warpath difficulty
                if (GAME_CONFIG.difficulty !== 'warpath') return 0;
                if (!gameState || !gameState.players) return 0;
                
                const destHoleId = move.toHoleId;
                // Can't target pegs in safe zone (protected)
                if (destHoleId.includes('safe') || destHoleId.includes('winner')) return 0;
                
                let huntScore = 0;
                
                for (const opponent of gameState.players) {
                    if (opponent.index === context.player.index) continue;
                    // Only hunt human players (skip fellow AI bots)
                    if (isAIPlayer(opponent.index)) continue;
                    
                    for (const oppPeg of opponent.peg) {
                        if (oppPeg.holeType === 'holding') continue;
                        
                        // ── PRIORITY 1: Opponent in HOME STRETCH ──
                        // Pegs in home stretch are about to win. Any move that
                        // positions us to intercept them is top priority.
                        const oppInHomeStretch = oppPeg.inHomeStretch || oppPeg.lockedToSafeZone || oppPeg.eligibleForSafeZone;
                        
                        // ── PRIORITY 2: Opponent in BULLSEYE/CENTER ──
                        const oppInCenter = oppPeg.inBullseye || oppPeg.holeId === 'center';
                        
                        // ── PRIORITY 3: Opponent on FASTTRACK ──
                        const oppOnFT = oppPeg.onFasttrack && oppPeg.holeId?.startsWith('ft-');
                        
                        // Direct CUT — landing exactly on opponent
                        if (oppPeg.holeId === destHoleId) {
                            if (oppInHomeStretch) {
                                huntScore = Math.max(huntScore, 1.0);  // Maximum — derail their win
                                console.log(`🔥 [WARPATH] DIRECT CUT on home-stretch peg at ${destHoleId}!`);
                            } else if (oppInCenter) {
                                huntScore = Math.max(huntScore, 0.95);
                                console.log(`🔥 [WARPATH] DIRECT CUT on bullseye peg!`);
                            } else if (oppOnFT) {
                                huntScore = Math.max(huntScore, 0.9);
                                console.log(`🔥 [WARPATH] DIRECT CUT on FT peg at ${destHoleId}!`);
                            } else {
                                huntScore = Math.max(huntScore, 0.8);
                            }
                            continue;
                        }
                        
                        // POSITIONING — how close does this move put us to the target?
                        // Skip center/FT pegs for distance calc (different track)
                        if (oppInCenter) {
                            // If we're moving to an ft-* hole, we can reach center with 1-hop
                            if (destHoleId.startsWith('ft-')) {
                                huntScore = Math.max(huntScore, 0.7);
                            }
                            continue;
                        }
                        
                        if (oppOnFT) {
                            // Positioning on an ft-* hole is good to target FT opponents
                            if (destHoleId.startsWith('ft-')) {
                                huntScore = Math.max(huntScore, 0.6);
                            }
                            continue;
                        }
                        
                        // Perimeter opponent — calculate approach distance
                        const distance = getTrackDistance(destHoleId, oppPeg.holeId);
                        if (distance === null || distance === undefined || distance < 0) continue;
                        
                        if (oppInHomeStretch) {
                            // Home stretch targets get HUGE bonus for positioning
                            if (distance >= 1 && distance <= 3) {
                                huntScore = Math.max(huntScore, 0.9);  // Kill range
                            } else if (distance >= 4 && distance <= 7) {
                                huntScore = Math.max(huntScore, 0.7);  // One-turn range
                            } else if (distance >= 8 && distance <= 12) {
                                huntScore = Math.max(huntScore, 0.5);  // Two-turn approach
                            }
                        } else {
                            // Regular opponents — standard tracking
                            if (distance >= 1 && distance <= 3) {
                                huntScore = Math.max(huntScore, 0.6);
                            } else if (distance >= 4 && distance <= 7) {
                                huntScore = Math.max(huntScore, 0.4);
                            }
                        }
                    }
                }
                
                return huntScore;
            }
        },
        
        // ════════════════════════════════════════════════════════════════
        // 7 WILD CARD STRATEGIC DECISION SYSTEM
        // When card 7 is drawn, AI must decide optimal move distance (1-7)
        // and which peg to move. This rule provides strategic guidance.
        // ════════════════════════════════════════════════════════════════
        sevenCardStrategy: {
            weight: 30,  // High priority for 7 card decisions
            evaluate: (move, context) => {
                // Only applies to 7 wild card
                if (!context.currentCard || context.currentCard.rank !== '7') return 0;
                
                const peg = context.player.peg.find(p => p.id === move.pegId);
                if (!peg) return 0;
                
                let strategyScore = 0;
                const moveDistance = move.steps || 1;
                
                // ── PRIORITY 1: FastTrack Entry (distance matters) ──
                // If peg can enter FastTrack, prefer the exact distance needed
                if (move.isFastTrackEntry) {
                    // Entering FastTrack is always good with 7 card
                    strategyScore += 0.9;
                    console.log(`🎲 [7-Card] FastTrack entry at distance ${moveDistance}: +0.9`);
                }
                
                // ── PRIORITY 2: Safe Zone Entry (distance precision) ──
                // If peg is eligible for safe zone, prefer distance that enters it
                if (peg.eligibleForSafeZone && move.toHoleId.includes('safe')) {
                    strategyScore += 0.95;
                    console.log(`🎲 [7-Card] Safe zone entry at distance ${moveDistance}: +0.95`);
                }
                
                // ── PRIORITY 3: Cutting Opponents (any distance works) ──
                const cutTarget = findCutTargetAtHole(move.toHoleId);
                if (cutTarget) {
                    // Cutting is valuable - distance doesn't matter much
                    strategyScore += 0.8;
                    console.log(`🎲 [7-Card] Cut opportunity at distance ${moveDistance}: +0.8`);
                }
                
                // ── PRIORITY 4: Center/Bullseye Entry ──
                if (move.toHoleId === 'center' || move.isCenterOption) {
                    // Check if opponent is there (handled by isBullseyeCut)
                    const centerCut = findCutTargetAtHole('center');
                    if (!centerCut) {
                        // Empty bullseye - moderate value
                        strategyScore += 0.6;
                        console.log(`🎲 [7-Card] Bullseye entry at distance ${moveDistance}: +0.6`);
                    }
                }
                
                // ── PRIORITY 5: Exit FastTrack to Safe Zone ──
                if (peg.onFasttrack && move.toHoleId.includes('safe')) {
                    // Exiting FT directly to safe zone is excellent
                    strategyScore += 0.85;
                    console.log(`🎲 [7-Card] FT exit to safe zone at distance ${moveDistance}: +0.85`);
                }
                
                // ── PRIORITY 6: Stay on FastTrack (prefer longer distances) ──
                if (peg.onFasttrack && move.toHoleId.startsWith('ft-') && !move.isLeaveFastTrack) {
                    // Longer moves on FT are better (cover more ground)
                    const ftBonus = moveDistance / 7 * 0.5;  // 0.07 to 0.5
                    strategyScore += ftBonus;
                    console.log(`🎲 [7-Card] FT traversal distance ${moveDistance}: +${ftBonus.toFixed(2)}`);
                }
                
                // ── PRIORITY 7: Avoid Wasting Movement ──
                // Penalize very short moves (1-2) unless there's a strategic reason
                if (moveDistance <= 2 && !cutTarget && !move.isFastTrackEntry && 
                    !move.toHoleId.includes('safe') && move.toHoleId !== 'center') {
                    strategyScore -= 0.3;
                    console.log(`🎲 [7-Card] Short move (${moveDistance}) with no strategy: -0.3`);
                }
                
                // ── PRIORITY 8: Maximize Distance (when no special targets) ──
                // If no strategic reason, prefer longer moves (cover more ground)
                if (strategyScore === 0) {
                    const distanceBonus = moveDistance / 7 * 0.4;  // 0.06 to 0.4
                    strategyScore += distanceBonus;
                    console.log(`🎲 [7-Card] Distance bonus (${moveDistance}): +${distanceBonus.toFixed(2)}`);
                }
                
                // ── PRIORITY 9: Peg Selection (which peg to move) ──
                // Prefer moving pegs that are:
                // - Closest to safe zone (about to finish)
                // - On FastTrack (maximize FT advantage)
                // - In vulnerable positions (escape danger)
                
                if (peg.eligibleForSafeZone) {
                    strategyScore += 0.2;  // Prioritize finishing pegs
                }
                
                if (peg.onFasttrack) {
                    strategyScore += 0.15;  // Keep FT pegs moving
                }
                
                // Check if peg is in danger (opponent nearby)
                if (gameState && gameState.players) {
                    for (const opponent of gameState.players) {
                        if (opponent.index === context.player.index) continue;
                        for (const oppPeg of opponent.peg) {
                            if (oppPeg.holeType === 'holding') continue;
                            const distance = getTrackDistance(oppPeg.holeId, peg.holeId);
                            if (distance >= 1 && distance <= 6) {
                                // Peg is in danger - prioritize moving it
                                strategyScore += 0.25;
                                console.log(`🎲 [7-Card] Peg in danger, moving to escape: +0.25`);
                                break;
                            }
                        }
                    }
                }
                
                return strategyScore;
            }
        },
        
        // FORWARD PROGRESS - Base priority
        forwardProgress: {
            weight: 5,
            evaluate: (move, context) => {
                if (context.isBackwardCard) return 0;
                // More steps = generally better
                return Math.min((move.steps || 1) / 10, 1);
            }
        },
        
        // RANDOM TIEBREAKER - Fibonacci(3)
        randomTiebreaker: {
            weight: 2,
            evaluate: (move, context) => {
                return Math.random() * 0.1; // Small random factor
            }
        }
    };
    
    /**
     * AI Reaction System - AI sends emoji reactions based on turn outcomes
     * Called after each move to let AI express emotions
     */
    function aiSendReaction(move, cutPeg, entryFlags) {
        if (!AI_REACTIONS.enabled) return;
        if (!gameState) return;
        
        // Get the player who just made the move
        const movingPlayer = gameState.currentPlayer;
        const movingPlayerIdx = movingPlayer.index;
        const isMovingPlayerAI = isAIPlayer(movingPlayerIdx);
        const isMovingPlayerHuman = !isMovingPlayerAI;
        const difficulty = GAME_CONFIG.difficulty || 'easy';
        const isWarpath = difficulty === 'warpath';
        
        // Helper: pick random from array
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        
        // Helper: get bot name for chat bubbles
        const getBotName = (playerIdx) => {
            const player = gameState.players?.[playerIdx];
            if (player?.name) {
                // Strip emoji prefix for cleaner chat (icon is in name like "🖥️ Turing")
                return player.name.replace(/^[^\w\s]+\s*/, '').trim() || player.name;
            }
            return 'Bot';
        };
        
        // ── ManifoldAI Adaptation: shift entity's position on the surface ──
        if (window.ManifoldAI) {
            if (isMovingPlayerAI) {
                if (cutPeg) ManifoldAI.adaptEntity(movingPlayerIdx, 'made_cut');
                if (entryFlags.enteredFasttrack) ManifoldAI.adaptEntity(movingPlayerIdx, 'entered_fasttrack');
                if (move.toHoleId?.includes('safe-')) ManifoldAI.adaptEntity(movingPlayerIdx, 'entered_safe');
            }
            // Victim adaptation: AI player that got cut shifts toward survivor mode
            if (cutPeg && isAIPlayer(cutPeg.player?.index)) {
                ManifoldAI.adaptEntity(cutPeg.player.index, 'was_cut');
            }
        }
        
        // Random chance to react (don't react every time — but chat bubbles have own probability)
        const shouldReact = Math.random() <= AI_REACTIONS.probability;
        const shouldChat = Math.random() <= 0.45; // 45% chance of chat bubble (less frequent than emoji)
        
        if (!shouldReact && !shouldChat) return;
        
        // Small delay so reaction feels more natural
        const reactionDelay = 300 + Math.random() * 500;
        const chatDelay = reactionDelay + 400 + Math.random() * 600; // Chat comes slightly after emoji
        
        setTimeout(() => {
            let reactionList = null;
            let chatList = null;
            let chatBotIdx = null; // Which bot should "say" the message
            
            // ═══════════════════════════════════════════════════════
            // AI MADE THE MOVE — check what happened
            // ═══════════════════════════════════════════════════════
            if (isMovingPlayerAI) {
                if (cutPeg && !isAIPlayer(cutPeg.player?.index)) {
                    // AI cut a HUMAN — playful/sportsmanlike reaction
                    reactionList = isWarpath ? AI_REACTIONS.warpathCut : AI_REACTIONS.cut;
                    chatList = isWarpath ? AI_CHAT_MESSAGES.warpathCut : AI_CHAT_MESSAGES.cut;
                    chatBotIdx = movingPlayerIdx;
                    console.log(`🤖 AI Player ${movingPlayerIdx} playfully reacting to cutting human!`);
                } else if (cutPeg && isAIPlayer(cutPeg.player?.index)) {
                    // AI cut another AI — just a small celebration, no chat needed
                    reactionList = AI_REACTIONS.positive;
                    console.log(`🤖 AI Player ${movingPlayerIdx} cut fellow AI — small celebration`);
                } else if (entryFlags.enteredFasttrack || entryFlags.enteredBullseye) {
                    // AI entered special area
                    reactionList = AI_REACTIONS.special;
                    chatList = AI_CHAT_MESSAGES.selfCelebrate;
                    chatBotIdx = movingPlayerIdx;
                    console.log(`🤖 AI Player ${movingPlayerIdx} reacting to special move!`);
                } else if (move.toHoleId?.includes('safe-') || move.toHoleId?.includes('winner')) {
                    // AI reached safe zone or winner
                    reactionList = AI_REACTIONS.positive;
                    chatList = AI_CHAT_MESSAGES.selfCelebrate;
                    chatBotIdx = movingPlayerIdx;
                    console.log(`🤖 AI Player ${movingPlayerIdx} celebrating safe/winner!`);
                }
            }
            
            // ═══════════════════════════════════════════════════════
            // HUMAN MADE THE MOVE — bots react with encouragement!
            // This is the heart of the warmth: bots cheer for humans
            // ═══════════════════════════════════════════════════════
            if (isMovingPlayerHuman) {
                if (cutPeg && isAIPlayer(cutPeg.player?.index)) {
                    // Human cut a bot — bot reacts with good sportsmanship
                    const victimIdx = cutPeg.player.index;
                    reactionList = AI_REACTIONS.negative;
                    chatList = isWarpath ? AI_CHAT_MESSAGES.warpathGotCut : AI_CHAT_MESSAGES.gotCut;
                    chatBotIdx = victimIdx;
                    console.log(`🤖 AI Player ${victimIdx} reacting to being cut by human — good sport!`);
                } else if (entryFlags.enteredFasttrack || entryFlags.enteredBullseye) {
                    // Human entered FT or bullseye — bots are impressed!
                    reactionList = AI_REACTIONS.encouragement;
                    chatList = AI_CHAT_MESSAGES.encouragement;
                    // Random AI reacts
                    chatBotIdx = AI_CONFIG.players[Math.floor(Math.random() * AI_CONFIG.players.length)];
                    console.log(`🤖 AI cheering human's FT/bullseye entry!`);
                } else if (move.toHoleId?.includes('safe-')) {
                    // Human reached safe zone — bots acknowledge
                    if (Math.random() < 0.5) { // Only sometimes — don't overdo it
                        reactionList = AI_REACTIONS.encouragement;
                        chatList = AI_CHAT_MESSAGES.encouragement;
                        chatBotIdx = AI_CONFIG.players[Math.floor(Math.random() * AI_CONFIG.players.length)];
                        console.log(`🤖 AI acknowledging human's safe zone entry`);
                    }
                } else if (move.toHoleId?.includes('winner')) {
                    // Human scored a peg — bots cheer/impressed
                    reactionList = AI_REACTIONS.encouragement;
                    chatList = AI_CHAT_MESSAGES.encouragement;
                    chatBotIdx = AI_CONFIG.players[Math.floor(Math.random() * AI_CONFIG.players.length)];
                    console.log(`🤖 AI cheering human's winning peg!`);
                }
            }
            
            // Send emoji reaction
            if (shouldReact && reactionList && reactionList.length > 0) {
                const reaction = pick(reactionList);
                console.log(`🤖 AI sending reaction: ${reaction.emoji} (${reaction.name})`);
                sendDesktopReaction(reaction.emoji, reaction.name);
            }
            
            // Send chat bubble (with its own delay for natural feel)
            if (shouldChat && chatList && chatList.length > 0 && chatBotIdx !== null) {
                setTimeout(() => {
                    const msg = pick(chatList);
                    const name = getBotName(chatBotIdx);
                    console.log(`💬 AI Chat: [${name}] "${msg}"`);
                    aiSendChatBubble(msg, name);
                }, chatDelay - reactionDelay);
            }
        }, reactionDelay);
    }
    
    /**
     * Evaluate all moves and return sorted by score (best first)
     */
    function evaluateMoves(moves, player, currentCard) {
        if (!moves || moves.length === 0) return [];
        
        const playerBoardPos = player.boardPosition;
        const isBackwardCard = currentCard && currentCard.direction === 'backward';
        const difficultyPreset = getDifficultyPreset();
        
        const scoredMoves = moves.map(move => {
            const peg = player.peg.find(p => p.id === move.pegId);
            const context = {
                player,
                peg,
                currentCard,
                playerBoardPos,
                isBackwardCard
            };
            
            // Apply all rules and sum weighted scores
            // Adjust weights based on difficulty
            let totalScore = 0;
            const ruleScores = {};
            
            for (const [ruleName, rule] of Object.entries(AI_MOVE_RULES)) {
                const rawScore = rule.evaluate(move, context);
                let weight = rule.weight;
                
                // DIFFICULTY SCALING: Apply strategy multipliers based on difficulty
                switch (ruleName) {
                    case 'isCutMove':
                        weight = rule.weight * difficultyPreset.aiCutPriority;
                        
                        // SPECIAL: Joker backward move uses same metrics as regular cuts
                        const isJokerBackward = move.type === 'joker_backward';
                        
                        // ═══════════════════════════════════════════════════
                        // EASY: NEVER target opponents. Only cut when it is
                        // the SOLE legal move available.
                        // ═══════════════════════════════════════════════════
                        if (GAME_CONFIG.difficulty === 'easy' && rawScore > 0) {
                            const hasNonCutMoves = moves.some(m => !findCutTargetAtHole(m.toHoleId) && m.type !== 'joker_backward');
                            if (hasNonCutMoves) {
                                weight = -100;  // Strongly avoid — only land on opponent if no other choice
                            } else {
                                weight = 1;  // Sole option — reluctantly accept
                            }
                            // Apply same penalty to Joker backward
                            if (isJokerBackward && hasNonCutMoves) {
                                weight = -100;
                            }
                        }
                        
                        // ═══════════════════════════════════════════════════
                        // NORMAL: Cut when strategic (beneficial to progress).
                        // Default weight (1.0x) — balanced decision.
                        // ═══════════════════════════════════════════════════
                        // (No special logic — just uses aiCutPriority: 1.0)
                        
                        // ═══════════════════════════════════════════════════
                        // HARD: Target opponents whenever it's an option.
                        // ═══════════════════════════════════════════════════
                        if (GAME_CONFIG.difficulty === 'hard' && rawScore > 0) {
                            weight = rule.weight * 3.0;
                            const cutTarget = findCutTargetAtHole(move.toHoleId);
                            if (cutTarget) {
                                const victimPegsInSafe = cutTarget.player.peg.filter(p => 
                                    p.holeId && p.holeId.includes('safe')
                                ).length;
                                if (victimPegsInSafe > 0) weight += 20;
                            }
                            // Joker backward gets EXTRA bonus for being sneaky
                            if (isJokerBackward) {
                                weight += 15;  // Bonus for the surprise factor!
                            }
                        }
                        
                        // ═══════════════════════════════════════════════════
                        // EXPERT: Actively hunts cuts + optimal positioning.
                        // ═══════════════════════════════════════════════════
                        if (GAME_CONFIG.difficulty === 'expert' && rawScore > 0) {
                            weight = rule.weight * 4.0;
                            const cutTarget = findCutTargetAtHole(move.toHoleId);
                            if (cutTarget) {
                                const victimPegsInSafe = cutTarget.player.peg.filter(p => 
                                    p.holeId && p.holeId.includes('safe')
                                ).length;
                                if (victimPegsInSafe > 0) weight += 30;
                            }
                            // Joker backward gets EXTRA bonus for tactical brilliance
                            if (isJokerBackward) {
                                weight += 25;  // Expert loves the tactical surprise!
                            }
                        }
                        
                        // ═══════════════════════════════════════════════════
                        // WARPATH: Cutting is the #1 GOAL. Will sacrifice
                        // own progress to send opponents home. The main
                        // objective is to land on opponents, even if it's
                        // not in the bot's own strategic interest.
                        // Still must be a LEGAL move.
                        // ═══════════════════════════════════════════════════
                        if (GAME_CONFIG.difficulty === 'warpath' && rawScore > 0) {
                            weight = 100;  // Higher than almost everything except winner hole (89)
                            const cutTarget = findCutTargetAtHole(move.toHoleId);
                            if (cutTarget) {
                                const victimPegsInSafe = cutTarget.player.peg.filter(p => 
                                    p.holeId && p.holeId.includes('safe')
                                ).length;
                                // Extra obsession points for cutting leaders
                                weight += victimPegsInSafe * 15;
                            }
                            // Joker backward is WARPATH'S DREAM - ultimate aggression
                            if (isJokerBackward) {
                                weight += 50;  // MASSIVE bonus - this is peak warpath!
                            }
                        }
                        break;
                    case 'isBullseyeCut':
                        weight = rule.weight * difficultyPreset.aiBullseyeCutPriority;
                        break;
                    case 'defensivePositioning':
                    case 'avoid4CardTrap':
                        weight = rule.weight * difficultyPreset.aiDefensiveAwareness;
                        break;
                    case 'offensivePositioning':
                        weight = rule.weight * difficultyPreset.aiOffensiveAwareness;
                        break;
                    case 'warpathHunting':
                        // Only applies to warpath — weight is already 0 for other difficulties
                        // via the evaluate() returning 0
                        break;
                    case 'isStrategicBackward':
                        weight = rule.weight * difficultyPreset.ai4CardStrategy;
                        break;
                    case 'isFastTrackEntry':
                    case 'isBullseyeEntry':
                        weight = rule.weight * difficultyPreset.aiFastTrackPriority;
                        break;
                    case 'isFastTrackTraversal':
                        // FT traversal preference scaled by difficulty
                        // Easy/Normal: Stay on FT (high weight)
                        // Hard+: Will leave FT to cut (lower FT loyalty)
                        // Warpath: FT is secondary to hunting (low weight)
                        weight = rule.weight * difficultyPreset.aiFastTrackPriority;
                        // Ensure minimum weight so FT is still generally preferred
                        if (weight < 20) weight = 20;
                        break;
                    case 'randomTiebreaker':
                        weight = rule.weight + (difficultyPreset.aiRandomFactor * 10);
                        break;
                }
                
                const weightedScore = rawScore * weight;
                ruleScores[ruleName] = { raw: rawScore, weighted: weightedScore };
                totalScore += weightedScore;
            }
            
            return {
                move,
                score: totalScore,
                ruleScores
            };
        });
        
        // Sort by score descending
        scoredMoves.sort((a, b) => b.score - a.score);
        
        // Log decision tree for debugging
        console.log(`🤖 [AI Decision Tree] Difficulty=${GAME_CONFIG.difficulty}, cutPriority=${difficultyPreset.aiCutPriority}`);
        scoredMoves.slice(0, 5).forEach((sm, i) => {
            const topRules = Object.entries(sm.ruleScores)
                .filter(([_, v]) => v.weighted > 0)
                .sort((a, b) => b[1].weighted - a[1].weighted)
                .slice(0, 3)
                .map(([name, v]) => `${name}:${v.weighted.toFixed(1)}`)
                .join(', ');
            console.log(`  ${i+1}. ${sm.move.toHoleId} (score: ${sm.score.toFixed(1)}) [${topRules}]`);
        });
        
        return scoredMoves;
    }
    
    /**
     * Select best move using evaluation system
     */
    /**
     * Build rule-evaluator map from AI_MOVE_RULES.
     * This extracts just the evaluate() functions so ManifoldAI can apply
     * its own manifold-derived weights instead of the hardcoded Fibonacci weights.
     */
    function getManifoldRuleEvaluators() {
        const evaluators = {};
        for (const [ruleName, rule] of Object.entries(AI_MOVE_RULES)) {
            evaluators[ruleName] = rule.evaluate;
        }
        return evaluators;
    }

    /**
     * Build game-helper functions map for ManifoldAI
     */
    function getManifoldGameHelpers() {
        return {
            findCutTargetAtHole,
            getTrackDistance,
            calculateMovesForPegRange,
            getPegTrackProgress,
            getPegNumber: typeof getPegNumber === 'function' ? getPegNumber : (id) => id,
            gameState: gameState,
        };
    }

    function aiSelectBestMove() {
        if (!gameState || gameState.winner) return null;
        if (legalMoves.length === 0) return null;
        
        const player = gameState.currentPlayer;
        const currentCard = gameState.currentCard;
        const playerIdx = gameState.currentPlayerIndex;
        
        // ── ManifoldAI Path: Use geometric surface for decision-making ──
        if (window.ManifoldAI && AI_CONFIG.useManifold) {
            const entity = ManifoldAI.getEntity(playerIdx);
            if (entity) {
                try {
                    const ruleEvaluators = getManifoldRuleEvaluators();
                    const gameHelpers = getManifoldGameHelpers();
                    const bestMove = ManifoldAI.selectBestMove(
                        entity, legalMoves, player, currentCard,
                        ruleEvaluators, gameHelpers
                    );
                    if (bestMove) return bestMove;
                    console.warn(`${entity.emoji} ManifoldAI returned null — falling back to legacy`);
                } catch (err) {
                    console.error(`${entity.emoji} ManifoldAI error:`, err);
                }
            }
        }
        
        // ── Legacy Path: Original weighted evaluation ──
        try {
            const scoredMoves = evaluateMoves(legalMoves, player, currentCard);
            
            if (scoredMoves.length === 0) {
                console.warn('🤖 evaluateMoves returned empty array');
                return null;
            }
            
            // Return the highest scored move
            return scoredMoves[0].move;
        } catch (error) {
            console.error('🤖 Error in AI move evaluation:', error);
            return null; // Fallback will be used in aiSelectAndClickMove
        }
    }
    
    function aiSelectMove() {
        if (!gameState || gameState.winner) return;
        if (!isAIPlayer(gameState.currentPlayerIndex)) return;
        
        // Hide thinking indicator
        hideAIThinking();
        
        if (legalMoves.length === 0) return;
        
        // Use evaluation system to pick best move
        const selectedMove = aiSelectBestMove();
        
        // Execute the selected move
        if (selectedMove) {
            console.log('🤖 AI executing best move:', selectedMove.toHoleId, selectedMove);
            clearHighlights();
            
            // 7 card is now WILD - AI uses normal move execution
            // No special split logic needed
            animatePegMove(selectedMove, () => {
                gameState.executeMove(selectedMove);
            });
        }
    }
    
    // AI selects a move and simulates clicking on the destination hole
    function aiSelectAndClickMove() {
        console.log('🤖 aiSelectAndClickMove called, legalMoves:', legalMoves.length);
        
        if (!gameState || gameState.winner) {
            console.log('🤖 aiSelectAndClickMove: Game over or no state');
            return;
        }
        if (!isAIPlayer(gameState.currentPlayerIndex)) {
            console.log('🤖 aiSelectAndClickMove: Not AI player turn');
            return;
        }
        
        // CRITICAL: AI never uses split mode — ensure it's reset
        if (splitMoveState && splitMoveState.active) {
            console.warn('🤖 AI found stale splitMoveState.active=true — resetting');
            resetSplitMoveState();
        }
        
        hideAIThinking();
        
        if (legalMoves.length === 0) {
            console.log('🤖 aiSelectAndClickMove: No legal moves - skipping turn');
            gameState.skipTurn();
            return;
        }
        
        // Safety timeout: if AI hasn't executed within 5s, force a move
        const safetyTimer = setTimeout(() => {
            console.error('🤖 AI SAFETY TIMEOUT: Forcing move after 5s');
            if (gameState && gameState.phase === 'play' && legalMoves.length > 0) {
                clearHighlights();
                executeMoveDirectly(legalMoves[0]);
            } else if (gameState && gameState.phase === 'play') {
                gameState.skipTurn();
            }
        }, 5000);
        
        // Use the unified evaluation system to select best move
        let selectedMove = null;
        try {
            selectedMove = aiSelectBestMove();
        } catch (err) {
            console.error('🤖 AI evaluation CRASHED:', err);
        }
        
        // FALLBACK: If AI evaluation failed, pick the best available move intelligently
        if (!selectedMove && legalMoves.length > 0) {
            console.warn('🤖 AI evaluation returned null - using smart fallback');
            const card = gameState.currentCard;
            
            // 7-card is split-only (handled by aiExecuteSplit), should never reach here
            selectedMove = legalMoves[0];
        }
        
        // Execute the move
        clearTimeout(safetyTimer);
        if (selectedMove) {
            console.log('🤖 AI clicking on hole:', selectedMove.toHoleId, 'with flags:', {
                isFastTrackEntry: selectedMove.isFastTrackEntry,
                isCenterOption: selectedMove.isCenterOption,
                isLeaveFastTrack: selectedMove.isLeaveFastTrack,
                steps: selectedMove.steps
            });
            
            clearHighlights();
            executeMoveDirectly(selectedMove);
        } else {
            console.error('🤖 AI has no valid move despite legalMoves existing - forcing skip');
            gameState.skipTurn();
        }
    }
    
    /**
     * AI 7-Card Split Decision System
     * Evaluates all possible split combinations to find the optimal split.
     * 
     * A 7 card can be split between 2 pegs: 1+6, 2+5, 3+4, 4+3, 5+2, 6+1
     * The AI evaluates each combination and picks the one with highest combined score.
     * 
     * Difficulty affects split decisions:
     * - Easy: Prefers simple splits, avoids cuts unless forced
     * - Intermediate: Balanced strategy, cuts when beneficial
     * - Hard: Actively seeks cut opportunities in splits
     */
    function aiEvaluate7CardSplit(player) {
        const difficultyPreset = getDifficultyPreset();
        console.log(`🤖 [AI 7-Split] Evaluating split options, difficulty=${GAME_CONFIG.difficulty}`);
        
        // Find all active pegs (not in holding, not completed)
        const activePegs = player.peg.filter(p => 
            p.holeType !== 'holding' && !p.completedCircuit && p.holeId
        );
        
        if (activePegs.length === 0) {
            console.log('🤖 [AI 7-Split] No active pegs for split');
            return null;
        }
        
        if (activePegs.length === 1) {
            // Only one peg - must use all 7 on it
            console.log('🤖 [AI 7-Split] Only one peg - doing full 7 move');
            return null; // Use normal flow
        }
        
        // Generate all valid split combinations
        const splitCombinations = [];
        const splitRanges = [[1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]];
        
        // Create mock card for move evaluation
        const mockCard7 = { movement: 7, direction: 'clockwise', canSplit: true };
        
        for (const peg1 of activePegs) {
            for (const peg2 of activePegs) {
                if (peg1.id === peg2.id) continue; // Must use 2 different pegs
                
                for (const [steps1, steps2] of splitRanges) {
                    // Calculate destinations for each peg
                    const dests1 = calculateMovesForPegRange(peg1, steps1, steps1);
                    const dests2 = calculateMovesForPegRange(peg2, steps2, steps2);
                    
                    if (dests1.length === 0 || dests2.length === 0) continue;
                    
                    // Evaluate each combination of destinations
                    for (const move1 of dests1) {
                        for (const move2 of dests2) {
                            // Score each move using AI rules
                            const context1 = { player, peg: peg1, currentCard: mockCard7, playerBoardPos: player.boardPosition, isBackwardCard: false };
                            const context2 = { player, peg: peg2, currentCard: mockCard7, playerBoardPos: player.boardPosition, isBackwardCard: false };
                            
                            let score1 = 0, score2 = 0;
                            
                            // Apply all AI_MOVE_RULES
                            for (const [ruleName, rule] of Object.entries(AI_MOVE_RULES)) {
                                let weight = rule.weight;
                                
                                // Apply difficulty scaling for cuts
                                if (ruleName === 'isCutMove') {
                                    weight = rule.weight * difficultyPreset.aiCutPriority;
                                    
                                    // Hard mode: Always aggressively seeks cuts even if suboptimal
                                    if (GAME_CONFIG.difficulty === 'hard') {
                                        const hasCut1 = findCutTargetAtHole(move1.toHoleId);
                                        const hasCut2 = findCutTargetAtHole(move2.toHoleId);
                                        if (hasCut1 || hasCut2) {
                                            // Hard mode actively hunts for splits that enable cuts
                                            weight = rule.weight * 3.0;
                                        }
                                    }
                                    
                                    // Intermediate mode: Cut only when strategic (opponent near winning)
                                    if (GAME_CONFIG.difficulty === 'intermediate') {
                                        const cutTarget1 = findCutTargetAtHole(move1.toHoleId);
                                        const cutTarget2 = findCutTargetAtHole(move2.toHoleId);
                                        if (cutTarget1 || cutTarget2) {
                                            // Check if target is in safe zone or near winning
                                            const targetPeg1 = cutTarget1 ? cutTarget1.peg : null;
                                            const targetPeg2 = cutTarget2 ? cutTarget2.peg : null;
                                            const isStrategicCut = (targetPeg1 && getPegTrackProgress(targetPeg1) >= 300) ||
                                                                   (targetPeg2 && getPegTrackProgress(targetPeg2) >= 300);
                                            if (isStrategicCut) {
                                                // Target is on fast track or beyond - strategic cut
                                                weight = rule.weight * 2.0;
                                            } else {
                                                // Not strategic - normal weight
                                                weight = rule.weight * 1.0;
                                            }
                                        }
                                    }
                                    
                                    // Easy mode: discourage cuts unless no other option
                                    if (GAME_CONFIG.difficulty === 'easy') {
                                        weight = rule.weight * 0.1;
                                    }
                                }
                                
                                score1 += rule.evaluate(move1, context1) * weight;
                                score2 += rule.evaluate(move2, context2) * weight;
                            }
                            
                            const combinedScore = score1 + score2;
                            
                            splitCombinations.push({
                                peg1: peg1,
                                peg2: peg2,
                                move1: move1,
                                move2: move2,
                                steps1: steps1,
                                steps2: steps2,
                                score1: score1,
                                score2: score2,
                                combinedScore: combinedScore,
                                hasCut: findCutTargetAtHole(move1.toHoleId) || findCutTargetAtHole(move2.toHoleId)
                            });
                        }
                    }
                }
            }
        }
        
        if (splitCombinations.length === 0) {
            console.log('🤖 [AI 7-Split] No valid split combinations found');
            return null;
        }
        
        // Sort by combined score (highest first)
        splitCombinations.sort((a, b) => b.combinedScore - a.combinedScore);
        
        // Log top 3 options
        console.log(`🤖 [AI 7-Split] Found ${splitCombinations.length} combinations. Top 3:`);
        splitCombinations.slice(0, 3).forEach((combo, i) => {
            const peg1Num = getPegNumber(combo.peg1.id);
            const peg2Num = getPegNumber(combo.peg2.id);
            console.log(`  ${i+1}. Peg#${peg1Num}(${combo.steps1}) + Peg#${peg2Num}(${combo.steps2}) = ${combo.combinedScore.toFixed(1)} ${combo.hasCut ? '✂️CUT!' : ''}`);
        });
        
        return splitCombinations[0];
    }
    
    /**
     * Execute AI 7-card split move
     * Handles the complete split sequence: first move, then second move
     */
    function aiExecute7CardSplit() {
        const player = gameState.currentPlayer;
        const playerIdx = gameState.currentPlayerIndex;
        let bestSplit = null;

        // ── ManifoldAI Path: Use geometric surface for split evaluation ──
        if (window.ManifoldAI && AI_CONFIG.useManifold) {
            const entity = ManifoldAI.getEntity(playerIdx);
            if (entity) {
                try {
                    const ruleEvaluators = getManifoldRuleEvaluators();
                    const gameHelpers = getManifoldGameHelpers();
                    bestSplit = ManifoldAI.evaluate7CardSplit(entity, player, ruleEvaluators, gameHelpers);
                } catch (err) {
                    console.error(`${entity.emoji} ManifoldAI 7-split error:`, err);
                }
            }
        }

        // Fallback to legacy evaluation
        if (!bestSplit) {
            bestSplit = aiEvaluate7CardSplit(player);
        }
        
        if (!bestSplit) {
            // No split found or only one peg - use normal full move
            console.log('🤖 [AI 7-Split] No split possible, using full move');
            return false;
        }
        
        console.log(`🤖 [AI 7-Split] Executing split: Peg#${getPegNumber(bestSplit.peg1.id)} moves ${bestSplit.steps1}, Peg#${getPegNumber(bestSplit.peg2.id)} moves ${bestSplit.steps2}`);
        
        // Execute first move using proper game state method (handles cuts, FastTrack, etc.)
        clearHighlights();
        
        const cutPeg1 = gameState.executeMoveWithoutEndingTurn ? 
            gameState.executeMoveWithoutEndingTurn(bestSplit.move1) : null;
        
        animatePegMove(bestSplit.move1, () => {
            // Animate cut if one occurred
            if (cutPeg1) {
                animateCut(cutPeg1);
            }
            
            // Small delay then execute second move
            setTimeout(() => {
                console.log(`🤖 [AI 7-Split] Executing second move...`);
                
                // RECALCULATE move2 from updated board state — peg1 has moved,
                // so peg2's path/destination may need updating.
                const peg2Live = player.peg.find(p => p.id === bestSplit.peg2.id);
                let move2 = bestSplit.move2;
                if (peg2Live) {
                    const freshDests = calculateMovesForPegRange(peg2Live, bestSplit.steps2, bestSplit.steps2);
                    if (freshDests.length > 0) {
                        // Prefer same destination if still valid, else best available
                        const sameDest = freshDests.find(m => m.toHoleId === bestSplit.move2.toHoleId);
                        move2 = sameDest || freshDests[0];
                        console.log(`🤖 [AI 7-Split] Recalculated move2: ${move2.toHoleId} (was ${bestSplit.move2.toHoleId})`);
                    } else {
                        console.warn(`🤖 [AI 7-Split] No valid move2 after recalculation! Ending split.`);
                        cardUI.clearCard();
                        if (window.mobileUI) window.mobileUI.hideFloatingCard();
                        gameState.endTurn();
                        return;
                    }
                }
                
                const cutPeg2 = gameState.executeMoveWithoutEndingTurn ? 
                    gameState.executeMoveWithoutEndingTurn(move2) : null;
                
                animatePegMove(move2, () => {
                    // Animate cut if one occurred
                    if (cutPeg2) {
                        animateCut(cutPeg2);
                    }
                    
                    // 7 card doesn't give extra turn - advance to next player
                    setTimeout(() => {
                        cardUI.clearCard();
                        if (window.mobileUI) window.mobileUI.hideFloatingCard();
                        gameState.endTurn();
                    }, 500);
                });
            }, 600);
        });
        
        return true;
    }
    
    // ============================================================
    // GAME SESSION MANAGEMENT
    // ============================================================
    
    let boardReady = false;
    
    function updateLoadingStatus(message, isReady = false) {
        const statusEl = document.getElementById('loading-status');
        const startBtn = document.getElementById('start-btn');
        if (statusEl) {
            statusEl.textContent = message;
            if (isReady) {
                statusEl.classList.add('ready');
            }
        }
        if (startBtn) {
            startBtn.disabled = !isReady;
            startBtn.style.opacity = isReady ? '1' : '0.5';
            startBtn.style.cursor = isReady ? 'pointer' : 'not-allowed';
        }
    }
    
    function startGameSession() {
        if (!boardReady) {
            console.log('Board not ready yet');
            return;
        }
        
        console.log('Starting game session...');
        console.log('Available globals:', {
            GameUIMinimal: typeof window.GameUIMinimal,
            CardUI: typeof window.CardUI,
            FastrackEngine: typeof window.FastrackEngine
        });
        
        // Hide start screen IMMEDIATELY
        const startScreen = document.getElementById('start-game-screen');
        if (startScreen) {
            console.log('Hiding start screen...');
            startScreen.style.display = 'none';
            startScreen.remove(); // Also remove from DOM entirely
            console.log('Start screen removed from DOM');
        }
        
        // Show leave game button (always visible during game)
        const leaveBtn = document.getElementById('leave-game-btn');
        if (leaveBtn) {
            leaveBtn.style.display = 'flex';
        }
        
        // Hide auth/lobby containers
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('lobby-container').style.display = 'none';
        
        // Read player count from URL params (from ai_setup.html or lobby redirect)
        const sessionParams = new URLSearchParams(window.location.search);

        // Auto-detect multiplayer from URL params (lobby redirect sets multiplayer=true)
        if (!isMultiplayerGame && sessionParams.get('multiplayer') === 'true') {
            isMultiplayerGame = true;
            console.log('[startGameSession] Set isMultiplayerGame=true from URL param');
        }

        // Multiplayer: derive player count from the session roster stored by lobby_client.js
        let _earlyRoster = null;
        if (isMultiplayerGame) {
            try { _earlyRoster = JSON.parse(sessionStorage.getItem('ft_session_players') || 'null'); } catch(e) {}
        }
        const requestedPlayers = (_earlyRoster && _earlyRoster.length >= 2)
            ? _earlyRoster.length
            : (parseInt(sessionParams.get('players')) || 3);
        const playerCount = Math.max(2, Math.min(4, requestedPlayers)); // Clamp 2-4
        const playerName = sessionParams.get('name') || 'You';
        // Decode avatar (it's URL encoded like %F0%9F%8E%AE)
        const playerAvatar = decodeURIComponent(sessionParams.get('avatar') || '🎮');
        const difficulty = sessionParams.get('difficulty') || 'normal';

        // Apply sound & camera preferences from localStorage (set in ai_setup.html)
        const musicPref = localStorage.getItem('fasttrack_music') || 'on';
        const sfxPref   = localStorage.getItem('fasttrack_sfx')   || 'on';
        const cameraPref = localStorage.getItem('fasttrack_camera') || 'auto';

        // Music: if set to off, mark as already auto-started so it won't play automatically
        if (musicPref === 'off') {
            musicAutoStarted = true; // suppress autoStartMusicOnFirstDraw()
            // Ensure music button shows OFF state
            const musicBtn = document.getElementById('music-toggle-btn');
            if (musicBtn) { musicBtn.textContent = '🔇'; musicBtn.title = 'Music: OFF'; musicBtn.classList.remove('music-on'); }
        } else {
            // Start music automatically when game begins
            if (typeof autoStartMusicOnFirstDraw === 'function') {
                setTimeout(() => autoStartMusicOnFirstDraw(), 1500);
            }
        }

        // SFX: disable globally if turned off in setup
        if (sfxPref === 'off' && window.GameSFX) {
            GameSFX.enabled = false;
        }

        // Camera: if manual, set temp manual override so auto-follow doesn't kick in
        if (cameraPref === 'manual') {
            _tempManualOverride = true;
        }

        console.log(`[startGameSession] URL params: players=${requestedPlayers}, name=${playerName}, avatar=${playerAvatar}, difficulty=${difficulty}`);
        console.log(`[startGameSession] Final playerCount after clamping: ${playerCount}`);
        console.log(`[startGameSession] gameState.players before config:`, gameState?.players?.map(p => p.name));
        
        // Initialize game with requested player count
        console.log(`[startGameSession] Calling initGame(${playerCount})...`);
        initGame(playerCount);

        // ── Analytics: Track game start ──
        if (window.FTAnalytics) {
            FTAnalytics.gameStart(currentGameMode, playerCount, difficulty);
        }
        console.log('[startGameSession] initGame complete, gameState:', !!gameState, 'currentPlayerIndex:', gameState?.currentPlayerIndex);
        console.log('[startGameSession] gameState.players.length:', gameState?.players?.length);
        console.log('[startGameSession] cardUI:', !!cardUI);
        
        // AI bot identities — pick from BoardManifold tech/sci-fi pool
        let botPool;
        if (window.BoardManifold) {
            const bots = BoardManifold.pickBots(5);
            botPool = bots.map(b => ({ name: b.name, avatar: b.icon, personality: b.name.toLowerCase() }));
            console.log('[startGameSession] Bot pool from BoardManifold:', botPool.map(b => b.name));
        } else if (window.ManifoldAI) {
            botPool = window.ManifoldAI.ARCHETYPE_POOL.map(key => {
                const arch = window.ManifoldAI.ARCHETYPES[key];
                return { name: arch.name, avatar: arch.emoji, personality: key };
            });
        } else {
            botPool = [
                { name: 'Turing', avatar: '🖥️', personality: 'turing' },
                { name: 'Nexus', avatar: '🌐', personality: 'nexus' },
                { name: 'Cortex', avatar: '🧠', personality: 'cortex' },
            ];
        }
        
        // Configure players
        if (gameState) {
            console.log(`[startGameSession] Configuring ${playerCount} players...`);
            console.log(`[startGameSession] gameState.players.length = ${gameState.players.length}`);
            
            try {
                // Player 0 is always human - explicitly set all flags
                if (!gameState.players[0]) {
                    console.error('[startGameSession] ERROR: gameState.players[0] does not exist!');
                } else {
                    gameState.players[0].name = playerName;
                    gameState.players[0].avatar = playerAvatar;  // Store avatar separately
                    gameState.players[0].isHuman = true;
                    gameState.players[0].isLocal = true;
                    gameState.players[0].isAI = false;  // Explicitly NOT an AI
                    console.log(`[startGameSession] Player 0 configured: name="${playerName}", avatar="${playerAvatar}", isAI=false, isHuman=true`);
                }
            } catch (e) {
                console.error('[startGameSession] Error configuring player 0:', e);
            }
            
            // Configure players 1+
            // In multiplayer: use the real session roster stored by lobby_client.js
            // In solo/quickplay: fall back to AI bot pool
            const aiIndices = [];

            let _mpRoster = null;
            if (isMultiplayerGame) {
                try { _mpRoster = JSON.parse(sessionStorage.getItem('ft_session_players') || 'null'); } catch(e) {
                    console.error('[startGameSession] Failed to parse ft_session_players from sessionStorage:', e);
                }
            }
            const _mpMyId = isMultiplayerGame ? (sessionStorage.getItem('ft_my_user_id') || '') : '';

            // SAFETY: Ensure host is never AI in multiplayer
            if (isMultiplayerGame && gameState.players[0]) {
                gameState.players[0].isAI = false;
                gameState.players[0].isHuman = true;
                gameState.players[0].isLocal = true;
                console.log('[startGameSession] SAFETY: Ensured player 0 (host) is human in multiplayer mode');
            }

            if (isMultiplayerGame && _mpRoster && _mpRoster.length > 0) {
                // Re-order roster so the local player is always index 0
                const myIdx = _mpRoster.findIndex(p => p.user_id === _mpMyId);
                const ordered = (myIdx > 0)
                    ? [_mpRoster[myIdx], ..._mpRoster.filter((_, i) => i !== myIdx)]
                    : _mpRoster;

                // CRITICAL: Verify roster has enough players to avoid fallback to bot assignment
                if (ordered.length !== playerCount) {
                    console.warn(`[startGameSession] ROSTER MISMATCH: ordered.length=${ordered.length} but playerCount=${playerCount}. This may cause human players to be marked as bots!`);
                }

                for (let i = 1; i < ordered.length; i++) {
                    if (!gameState.players[i]) continue;
                    const sp = ordered[i];
                    gameState.players[i].name     = sp.username;
                    gameState.players[i].avatar    = sp.avatar;
                    gameState.players[i].isAI      = !!sp.is_ai;
                    gameState.players[i].isHuman   = !sp.is_ai;
                    gameState.players[i].isLocal   = false;
                    gameState.players[i].userId    = sp.user_id;
                    if (sp.is_ai) {
                        aiIndices.push(i);
                        gameState.players[i].personality = 'default';
                    }
                    console.log(`[startGameSession] MP slot ${i}: "${sp.username}", isAI=${sp.is_ai}`);
                }

                // CRITICAL FIX: Don't leave uninitialized human players for non-multiplayer fallback
                // Mark ANY slots that weren't configured from roster to prevent bot pool assignment
                for (let i = ordered.length; i < playerCount; i++) {
                    if (gameState.players[i] && !gameState.players[i].isAI) {
                        console.warn(`[startGameSession] Leaving slot ${i} uninitialized - may be covered by session player`);
                    }
                }

                console.log('[startGameSession] Multiplayer players configured from session roster:', ordered.map(p => p.username));
            } else if (isMultiplayerGame && (!_mpRoster || _mpRoster.length === 0)) {
                // ERROR: Multiplayer game but no roster data! This is the bug!
                console.error('[startGameSession] ERROR: Multiplayer game but _mpRoster is missing or empty!');
                console.error('[startGameSession] _mpRoster:', _mpRoster);
                console.error('[startGameSession] sessionStorage ft_session_players:', sessionStorage.getItem('ft_session_players'));
                console.error('[startGameSession] Falling back to bot assignment (WRONG - will mark humans as bots!)');

                // Try to recover by using session.players if available
                if (multiplayerSession && multiplayerSession.players) {
                    console.warn('[startGameSession] ATTEMPTING RECOVERY: Using multiplayerSession.players directly');
                    for (let i = 1; i < multiplayerSession.players.length && i < playerCount; i++) {
                        if (gameState.players[i]) {
                            const sp = multiplayerSession.players[i];
                            gameState.players[i].name     = sp.username || `Player ${i+1}`;
                            gameState.players[i].isAI      = !!sp.is_ai;
                            gameState.players[i].isHuman   = !sp.is_ai;
                            gameState.players[i].userId    = sp.user_id;
                            if (sp.is_ai) aiIndices.push(i);
                            console.log(`[startGameSession] RECOVERED slot ${i}: "${sp.username}", isAI=${sp.is_ai}`);
                        }
                    }
                } else {
                    // Last resort: assign bots only if this is actually solo mode
                    console.warn('[startGameSession] No recovery possible - assigning bots as fallback');
                    for (let i = 1; i < playerCount; i++) {
                        if (gameState.players[i]) {
                            const bot = botPool[(i - 1) % botPool.length];
                            gameState.players[i].name = bot.name;
                            gameState.players[i].avatar = bot.avatar;
                            gameState.players[i].isAI = true;
                            gameState.players[i].isHuman = false;
                            gameState.players[i].personality = bot.personality;
                            aiIndices.push(i);
                        }
                    }
                }
            } else {
                // Solo / quickplay — assign AI bot identities from the manifold pool
                for (let i = 1; i < playerCount; i++) {
                    if (gameState.players[i]) {
                        const bot = botPool[(i - 1) % botPool.length];
                        gameState.players[i].name = bot.name;
                        gameState.players[i].avatar = bot.avatar;
                        gameState.players[i].isAI = true;
                        gameState.players[i].isHuman = false;
                        gameState.players[i].isLocal = false;
                        gameState.players[i].personality = bot.personality;
                        aiIndices.push(i);
                        console.log(`[startGameSession] Player ${i} configured: name="${gameState.players[i].name}", isAI=true, personality=${bot.personality}`);
                    } else {
                        console.warn(`[startGameSession] Player ${i} does not exist in gameState.players!`);
                    }
                }
            }
            
            // Store difficulty in AI config AND update AI player list
            if (window.AI_CONFIG) {
                window.AI_CONFIG.difficulty = difficulty;
                window.AI_CONFIG.players = aiIndices;
                window.AI_CONFIG.enabled = true;
                window.AI_CONFIG.useManifold = !!window.ManifoldAI;
                console.log(`[startGameSession] Updated AI_CONFIG.players to:`, window.AI_CONFIG.players);
            }
            
            // Spawn ManifoldAI entities on z=xy / z=xy² geometric surfaces
            if (window.ManifoldAI && aiIndices.length > 0) {
                console.log('[startGameSession] Spawning ManifoldAI geometric entities...');
                window.ManifoldAI.spawnEntities(aiIndices, difficulty);
                aiIndices.forEach(idx => {
                    console.log(window.ManifoldAI.entitySummary(idx));
                });
            }
            
            console.log(`[startGameSession] Configured ${playerCount} players:`, 
                gameState.players.map(p => ({ name: p.name, isAI: p.isAI, isHuman: p.isHuman })));
            
            // Update card UI
            if (cardUI) {
                cardUI.updateCurrentPlayer(gameState.currentPlayer);
            }
            
            // IMPORTANT: Re-sync GameUIMinimal with updated player data
            if (window.GameUIMinimal) {
                console.log('[startGameSession] Re-syncing GameUIMinimal with updated player data');
                console.log('[startGameSession] Players to set:', JSON.stringify(gameState.players.map(p => ({
                    name: p.name, avatar: p.avatar, isAI: p.isAI, isHuman: p.isHuman
                }))));
                window.GameUIMinimal.setPlayers(gameState.players, gameState.currentPlayerIndex);
                window.GameUIMinimal.setCurrentPlayer(
                    gameState.currentPlayer, 
                    gameState.currentPlayerIndex
                );
                window.GameUIMinimal.setDeckCount(gameState.currentPlayer?.deck?.remaining || 54);
            }
            
            // Update player panels with names
            setTimeout(() => {
                const panels = document.querySelectorAll('.player-panel');
                panels.forEach((panel, idx) => {
                    const nameEl = panel.querySelector('.player-name');
                    if (nameEl && gameState.players[idx]) {
                        nameEl.textContent = gameState.players[idx].name;
                    }
                });
            }, 100);
            
            // Show Mom's introduction (if enabled and not hard mode)
            setTimeout(() => {
                try {
                    if (GAME_CONFIG.showMomIntro) {
                        showMomIntro();
                    }
                } catch (e) {
                    console.warn('[startGameSession] showMomIntro skipped due to error', e);
                }
            }, 500);
            
            console.log(`Game started! You are ${playerAvatar} ${playerName} (Player 1). Click the deck to draw.`);
        }
    }
    
    // Expose startGameSession globally for multiplayer integration
    window.startGameSession = startGameSession;
    
    // Toggle rules modal visibility
    function toggleRulesModal() {
        const modal = document.getElementById('rules-modal');
        if (modal) {
            modal.classList.toggle('visible');
        }
    }
    window.toggleRulesModal = toggleRulesModal;
    
    // ============================================================
    // EXIT GAME FUNCTIONALITY
    // ============================================================
    
    // Show exit confirmation modal
    function showExitConfirm() {
        const modal = document.getElementById('exit-confirm-modal');
        if (modal) {
            modal.classList.add('visible');
        }
    }
    window.showExitConfirm = showExitConfirm;
    
    // Hide exit confirmation modal
    function hideExitConfirm() {
        const modal = document.getElementById('exit-confirm-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }
    window.hideExitConfirm = hideExitConfirm;
    
    // Exit to lobby (disconnect from session and go to lobby)
    function exitToLobby() {
        hideExitConfirm();
        
        // Disconnect from multiplayer session if connected
        if (window.multiplayerClient && typeof multiplayerClient.isConnected === "function" && multiplayerClient.isConnected()) {
            multiplayerClient.disconnect();
        }
        
        // Sync prestige points before leaving
        if (window.PrestigeTracker) {
            PrestigeTracker.syncWithServer();
        }
        
        // Navigate back to start screen
        window.location.href = '3d.html';
    }
    window.exitToLobby = exitToLobby;
    
    // Convert current player to AI and exit game
    function confirmExitGame() {
        hideExitConfirm();
        
        if (!gameState) {
            // No game in progress, just go back
            window.location.href = 'index.html';
            return;
        }
        
        // Find the human player (player 0 in single player, or identified multiplayer)
        const humanPlayerIdx = isMultiplayer ? 
            gameState.players.findIndex(p => p.id === myPlayerId) : 
            0; // In single player, human is always player 0
        
        if (humanPlayerIdx >= 0) {
            const player = gameState.players[humanPlayerIdx];
            console.log(`[ExitGame] Converting player ${humanPlayerIdx} (${player.name}) to AI`);
            
            // Mark this player as AI
            player.isAI = true;
            player.wasHuman = true; // Track that they were originally human
            player.name = player.name + ' (AI)';
            
            // Update player panels to show AI badge
            if (window.playerPanelUI) {
                const panelId = `player_${humanPlayerIdx}`;
                const panel = document.getElementById(panelId);
                if (panel) {
                    const nameEl = panel.querySelector('.player-name');
                    if (nameEl && !nameEl.textContent.includes('(AI)')) {
                        nameEl.textContent = player.name;
                    }
                }
            }
            
            // Show notification
            showExitNotification(player.name);
            
            // Count remaining human players
            const remainingHumans = gameState.players.filter(p => !p.isAI).length;
            console.log(`[ExitGame] Remaining human players: ${remainingHumans}`);
            
            if (remainingHumans === 0 || !isMultiplayer) {
                // All players are now AI OR single player exited - go back to menu
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                // 🌊 DIMENSIONAL: Manifest AI action based on phase (no if-else needed)
                const isHumanTurn = gameState.currentPlayerIndex === humanPlayerIdx;
                isHumanTurn && ObservationSubstrate.after(
                    () => IntentManifold.invokePhase('ai'),
                    1000
                );
            }
        } else {
            // No player found, just go back
            window.location.href = 'index.html';
        }
    }
    window.confirmExitGame = confirmExitGame;
    
    // Show notification that player left
    function showExitNotification(playerName) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(100,100,100,0.95), rgba(60,60,60,0.95));
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 20px;
            padding: 30px 50px;
            text-align: center;
            z-index: 30000;
            animation: fadeInOut 3s ease-in-out forwards;
        `;
        notification.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 10px;">🚪</div>
            <div style="font-size: 1.3em; color: #fff; font-weight: bold;">${playerName} left the game</div>
            <div style="font-size: 0.9em; color: #aaa; margin-top: 8px;">AI is now playing</div>
        `;
        
        // Add animation keyframes
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                85% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
            style.remove();
        }, 3000);
    }
    
    // Show leave game button when game is active
    function showExitButton() {
        const btn = document.getElementById('leave-game-btn');
        if (btn) btn.style.display = 'flex';
    }
    window.showExitButton = showExitButton;

    // Hide leave game button
    function hideExitButton() {
        const btn = document.getElementById('leave-game-btn');
        if (btn) btn.style.display = 'none';
    }
    window.hideExitButton = hideExitButton;

    // 🌊 DIMENSIONAL: Observe board manifestation (replaces polling loop)
    // 🐛 TEMPORARY: Using setTimeout for debugging
    setTimeout(() => updateLoadingStatus('Initializing board...'), 100);

    // 🐛 TEMPORARY: Using setInterval for debugging
    const boardReadyCheck = setInterval(() => {
        const hr = window.holeRegistry || holeRegistry;
        if (hr && hr.size > 0) {
            clearInterval(boardReadyCheck);
            boardReady = true;
            window.boardReady = true;
            updateLoadingStatus('✓ Board ready! Click START GAME', true);
            console.log('Board initialized with', hr.size, 'holes');

            // Seal every hole onto the z=xy / z=xy² manifold surface
            window.BoardManifold?.sealBoard?.(hr);
            window.BoardManifold && console.log('[BoardManifold] Hole truth table:',
                JSON.stringify(BoardManifold.holeTruthTable()));

            // Auto-start game in debug mode; offline/AI mode shows setup modal first
            const _urlP = new URLSearchParams(window.location.search);
            if (_urlP.has('debug')) {
                console.log('🎮 Debug mode — auto-starting game session...');
                setTimeout(() => startGameSession(), 200);
            } else if (_urlP.has('offline')) {
                console.log('🎮 Offline/AI mode — showing setup modal...');
                setTimeout(() => {
                    if (typeof window.openAISetupModal === 'function') {
                        window.openAISetupModal();
                    } else {
                        // Fallback: auto-start with defaults if modal not available
                        startGameSession();
                    }
                }, 200);
            }
        }
    }, 100);

    // Observe timeout condition
    setTimeout(() => {
        if (!boardReady) {
            updateLoadingStatus('⚠ Board loading taking long... please wait');
        }
    }, 10000);

    // 🌊 DIMENSIONAL: Observe script loading (replaces setTimeout debug)
    ObservationSubstrate.after(() => {
        console.log('=== SCRIPT LOAD CHECK ===');
        console.log('GameUIMinimal:', typeof window.GameUIMinimal);
        console.log('CardUI:', typeof window.CardUI);
        console.log('FastrackEngine:', typeof window.FastrackEngine);
        console.log('AvatarSubstrate:', typeof window.AvatarSubstrate);
        console.log('MoodSubstrate:', typeof window.MoodSubstrate);
        console.log('FastTrackThemes:', typeof window.FastTrackThemes);
        console.log('=========================');
    }, 1000);
    
    // ============================================================
    // RESPONSIVE & MOBILE ENHANCEMENTS
    // Touch controls, device adaptation, and 3D camera helpers
    // ============================================================
    
    (function() {
        'use strict';
        
        // Device detection
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const isTablet = /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const hasGyroscope = 'DeviceOrientationEvent' in window;
        
        // Add device classes to body
        document.body.classList.add(isMobile ? 'device-mobile' : 'device-desktop');
        if (isTablet) document.body.classList.add('device-tablet');
        if (hasTouch) document.body.classList.add('touch-device');
        
        // Responsive camera adjustments
        function updateCameraForDevice() {
            if (!camera || !controls) return;
            
            const width = window.innerWidth;
            const height = window.innerHeight;
            const aspect = width / height;
            
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
            
            if (renderer) {
                renderer.setSize(width, height);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            }
            
            // Adjust camera position for device type
            if (isMobile && !isTablet) {
                // Mobile: Higher, more top-down for board visibility, still 30°-ish
                if (controls.target) {
                    camera.position.set(0, 350, 500);
                    controls.maxDistance = 800;
                    controls.minDistance = 200;
                }
            } else if (isTablet) {
                // Tablet: 30° angle
                camera.position.set(0, 320, 554);
                controls.maxDistance = 900;
                controls.minDistance = 250;
            }
            // Desktop uses default 30° settings
        }
        
        // Touch gesture enhancements for OrbitControls
        function enhanceTouchControls() {
            if (!controls || !hasTouch) return;
            
            // Enable touch rotation and zoom
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
            
            // Touch-friendly settings
            controls.rotateSpeed = 0.5;
            controls.zoomSpeed = 0.8;
            controls.panSpeed = 0.5;
            
            // Damping for smooth movement
            controls.enableDamping = true;
            controls.dampingFactor = 0.1;
            
            // Limit angles for better UX
            controls.maxPolarAngle = Math.PI / 2.2; // Don't go below board
            controls.minPolarAngle = 0.2; // Don't go fully top-down
        }
        
        // Create mobile touch control buttons
        function createTouchControls() {
            if (!hasTouch) return;
            
            const touchControls = document.createElement('div');
            touchControls.className = 'touch-controls';
            touchControls.innerHTML = `
                <button class="touch-btn" id="btn-zoom-in" aria-label="Zoom In">🔍+</button>
                <button class="touch-btn" id="btn-zoom-out" aria-label="Zoom Out">🔍−</button>
                <button class="touch-btn" id="btn-reset-view" aria-label="Reset View">🎯</button>
            `;
            document.body.appendChild(touchControls);
            
            // Zoom in
            document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
                if (camera) {
                    const direction = new THREE.Vector3();
                    camera.getWorldDirection(direction);
                    camera.position.addScaledVector(direction, 50);
                }
            });
            
            // Zoom out
            document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
                if (camera) {
                    const direction = new THREE.Vector3();
                    camera.getWorldDirection(direction);
                    camera.position.addScaledVector(direction, -50);
                }
            });
            
            // Reset view
            document.getElementById('btn-reset-view')?.addEventListener('click', () => {
                setCameraView('angle');
            });
        }
        
        // Double-tap to zoom (mobile)
        function enableDoubleTapZoom() {
            if (!hasTouch) return;
            
            let lastTap = 0;
            const container = document.getElementById('container');
            
            container?.addEventListener('touchend', (e) => {
                const now = Date.now();
                if (now - lastTap < 300) {
                    // Double tap detected
                    e.preventDefault();
                    
                    // Toggle between close and default view
                    if (camera && camera.position.y < 400) {
                        setCameraView('angle');
                    } else {
                        // Zoom to tap location
                        const touch = e.changedTouches[0];
                        // Simple zoom in
                        if (camera) {
                            const direction = new THREE.Vector3();
                            camera.getWorldDirection(direction);
                            camera.position.addScaledVector(direction, 100);
                        }
                    }
                }
                lastTap = now;
            }, { passive: false });
        }
        
        // Gyroscope subtle parallax effect
        function enableGyroscopeParallax() {
            if (!hasGyroscope || !isMobile) return;
            
            // Request permission on iOS 13+
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                // Will be triggered on first touch
                document.body.addEventListener('touchstart', function requestGyro() {
                    DeviceOrientationEvent.requestPermission()
                        .then(permission => {
                            if (permission === 'granted') {
                                addGyroListener();
                            }
                        })
                        .catch(console.warn);
                    document.body.removeEventListener('touchstart', requestGyro);
                }, { once: true });
            } else {
                addGyroListener();
            }
            
            function addGyroListener() {
                let lastGamma = 0, lastBeta = 0;
                
                window.addEventListener('deviceorientation', (e) => {
                    if (!camera || !controls) return;
                    
                    // Subtle camera adjustment based on device tilt
                    const gamma = e.gamma || 0; // Left/right tilt (-90 to 90)
                    const beta = e.beta || 0;   // Front/back tilt (-180 to 180)
                    
                    // Apply smooth interpolation
                    lastGamma += (gamma - lastGamma) * 0.05;
                    lastBeta += (beta - lastBeta) * 0.05;
                    
                    // Very subtle rotation effect (disabled during active touch)
                    if (!controls.enabled) return;
                    
                    // This creates a subtle "looking around" effect
                    // Uncomment to enable:
                    // controls.target.x = lastGamma * 0.5;
                    // controls.target.z = (lastBeta - 45) * 0.3;
                }, { passive: true });
            }
        }
        
        // Handle orientation changes
        function handleOrientationChange() {
            window.addEventListener('orientationchange', () => {
                setTimeout(updateCameraForDevice, 100);
            });
            
            // Also handle resize for desktop browsers
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(updateCameraForDevice, 100);
            });
        }
        
        // Prevent pull-to-refresh on mobile
        function preventPullToRefresh() {
            document.body.addEventListener('touchmove', (e) => {
                if (e.target.closest('#container')) {
                    // Allow if it's the game canvas
                    return;
                }
                // Prevent default if at top of page
                if (window.scrollY === 0 && e.touches[0].clientY > 0) {
                    e.preventDefault();
                }
            }, { passive: false });
        }
        
        // Initialize all mobile enhancements
        function initMobileEnhancements() {
            updateCameraForDevice();
            enhanceTouchControls();
            createTouchControls();
            enableDoubleTapZoom();
            enableGyroscopeParallax();
            handleOrientationChange();
            preventPullToRefresh();
            
            console.log('📱 Mobile enhancements initialized:', {
                isMobile,
                isTablet,
                hasTouch,
                hasGyroscope
            });
        }
        
        // Wait for Three.js to be ready
        if (typeof THREE !== 'undefined') {
            // Scene might not be ready yet, wait for it
            const checkReady = setInterval(() => {
                if (typeof camera !== 'undefined' && typeof controls !== 'undefined') {
                    clearInterval(checkReady);
                    initMobileEnhancements();
                }
            }, 100);
            
            // Timeout after 5 seconds
            setTimeout(() => clearInterval(checkReady), 5000);
        }
    })();
