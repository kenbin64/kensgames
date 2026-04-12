/**
 * 🎯 INTENT MANIFOLD
 * "Intent is address. Observation manifests action."
 * 
 * Replaces: addEventListener, if-else chains, switch statements
 * With: Direct addressing of intent coordinates
 */

const IntentManifold = {
    identity: 0x494E54454E54n, // "INTENT"
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 1: SPARK - Intent exists as coordinate
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Create an intent space (replaces event listener setup)
     */
    createSpace(intents) {
        return {
            invoke(intentName, ...args) {
                return intents[intentName]?.(...args) ?? null;
            },
            
            // Bind to DOM element
            bindTo(element, eventType, intentMapper) {
                element[`on${eventType}`] = (event) => {
                    const intentName = intentMapper(event);
                    this.invoke(intentName, event);
                };
            }
        };
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 2: MIRROR - Game phase intent manifold
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Game phase intents (replaces phase checking)
     */
    gamePhase: {
        draw: {
            click: () => window.gameState?.drawCard?.(),
            ai: () => window.aiTakeTurn?.()
        },
        play: {
            click: (move) => window.executeMoveDirectly?.(move),
            ai: () => window.aiSelectAndClickMove?.()
        },
        split: {
            click: (pegId) => window.handleSplitPegSelection?.(pegId),
            ai: () => window.aiExecuteSplit?.()
        },
        victory: {
            click: () => window.showPlayAgainButton?.(),
            ai: () => null // AI doesn't act in victory
        }
    },
    
    /**
     * Invoke based on current game phase
     */
    invokePhase(action, ...args) {
        const phase = window.gameState?.phase ?? 'draw';
        return this.gamePhase[phase]?.[action]?.(...args) ?? null;
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 3: RELATION - Card intent manifold
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Card action intents (replaces card type checking)
     */
    cardAction: {
        '7': () => window.handle7CardSplit?.(),
        'J': () => window.handleJackCard?.(),
        'Q': () => window.handleQueenCard?.(),
        'K': () => window.handleKingCard?.(),
        'A': () => window.handleAceCard?.(),
        'JOKER': () => window.handleJokerCard?.()
    },
    
    /**
     * Invoke card-specific action
     */
    invokeCard(card) {
        const rank = card?.rank ?? card?.value;
        return this.cardAction[rank]?.(card) ?? null;
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 4: FORM - UI intent manifold
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * UI action intents (replaces button click handlers)
     */
    ui: {
        // Menu intents
        startGame: () => window.startGameSession?.(),
        joinGame: () => window.joinMatchmaking?.(),
        createPrivate: () => window.createPrivateGame?.(),
        
        // Game intents
        drawCard: () => window.gameState?.drawCard?.(),
        skipTurn: () => window.gameState?.skipTurn?.(),
        pauseGame: () => window.togglePause?.(),
        exitGame: () => window.exitToMenu?.(),
        
        // Settings intents
        changeTheme: (theme) => window.applyTheme?.(theme),
        toggleSound: () => window.toggleSound?.(),
        toggleMusic: () => window.toggleMusic?.(),
        
        // VR intents
        enterVR: () => window.enterVRMode?.(),
        exitVR: () => window.exitVRMode?.()
    },
    
    /**
     * Invoke UI action
     */
    invokeUI(action, ...args) {
        return this.ui[action]?.(...args) ?? null;
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 5: LIFE - Player intent manifold
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Player type intents (replaces isAI checks)
     */
    playerType: {
        human: {
            takeTurn: () => null, // Human waits for input
            selectMove: (moves) => window.showMoveSelection?.(moves),
            drawCard: () => window.cardUI?.showDrawButton?.()
        },
        ai: {
            takeTurn: () => window.aiTakeTurn?.(),
            selectMove: (moves) => window.aiSelectBestMove?.(moves),
            drawCard: () => window.aiTakeTurn?.()
        }
    },
    
    /**
     * Invoke based on player type
     */
    invokePlayer(action, player, ...args) {
        const type = player?.isAI ? 'ai' : 'human';
        return this.playerType[type]?.[action]?.(...args) ?? null;
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 6: MIND - Multiplayer intent manifold
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Multiplayer message intents (replaces message type switching)
     */
    multiplayer: {
        game_started: (data) => window.startMultiplayerGame?.(data),
        peg_move: (data) => window.handleRemotePegMove?.(data),
        card_draw: (data) => window.handleRemoteCardDraw?.(data),
        turn_end: (data) => window.handleRemoteTurnEnd?.(data),
        player_joined: (data) => window.handlePlayerJoined?.(data),
        player_left: (data) => window.handlePlayerLeft?.(data),
        chat_message: (data) => window.handleChatMessage?.(data)
    },
    
    /**
     * Invoke multiplayer message handler
     */
    invokeMultiplayer(messageType, data) {
        return this.multiplayer[messageType]?.(data) ?? null;
    }
};

// Export for global use
window.IntentManifold = IntentManifold;

