/**
 * ============================================================
 * GAME ENGINE MANIFOLD
 * Meta-substrate that orchestrates all game logic substrates
 * Dimensional architecture for FastTrack game engine
 * Part of ButterflyFX Dimensional Computing Framework
 * ============================================================
 */

const GameEngineManifold = {
    // Manifold metadata
    _meta: {
        name: 'GameEngineManifold',
        dimension: 4,
        type: 'meta-substrate',
        version: '1.0.0'
    },

    // Registered substrates (3D points on 4D manifold)
    _substrates: {},

    // Game state (lazy manifestation)
    _gameState: null,

    // ════════════════════════════════════════════════════════
    // SUBSTRATE REGISTRATION
    // ════════════════════════════════════════════════════════

    /**
     * Register a substrate as a point on the manifold
     */
    registerSubstrate(name, substrate) {
        console.log(`[GameEngineManifold] Registering substrate: ${name}`);
        this._substrates[name] = substrate;
        return this;
    },

    /**
     * Initialize the manifold with all substrates
     */
    initialize() {
        console.log('[GameEngineManifold] Initializing dimensional game engine...');

        // Register core substrates
        if (window.MoveGenerationSubstrate) {
            this.registerSubstrate('MoveGeneration', window.MoveGenerationSubstrate);
        }
        if (window.CardLogicSubstrate) {
            this.registerSubstrate('CardLogic', window.CardLogicSubstrate);
        }
        if (window.ValidationSubstrate) {
            this.registerSubstrate('Validation', window.ValidationSubstrate);
        }
        if (window.EventSubstrate) {
            this.registerSubstrate('Event', window.EventSubstrate);
        }
        if (window.StateSubstrate) {
            this.registerSubstrate('State', window.StateSubstrate);
        }
        if (window.ArraySubstrate) {
            this.registerSubstrate('Array', window.ArraySubstrate);
        }
        if (window.AIManifold) {
            this.registerSubstrate('AI', window.AIManifold);
        }

        console.log(`[GameEngineManifold] Initialized with ${Object.keys(this._substrates).length} substrates`);
        return this;
    },

    // ════════════════════════════════════════════════════════
    // DIMENSIONAL GAME OPERATIONS
    // ════════════════════════════════════════════════════════

    /**
     * Calculate legal moves (routes through MoveGeneration substrate)
     */
    calculateLegalMoves(player, card, gameState) {
        const substrate = this._substrates.MoveGeneration;
        if (!substrate) {
            console.error('[GameEngineManifold] MoveGeneration substrate not found');
            return [];
        }

        return substrate.calculateLegalMoves(player, card, gameState);
    },

    /**
     * Process a card play (routes through CardLogic substrate)
     */
    processCard(card, player, gameState) {
        const substrate = this._substrates.CardLogic;
        if (!substrate) {
            console.error('[GameEngineManifold] CardLogic substrate not found');
            return { success: false, error: 'CardLogic substrate not available' };
        }

        return substrate.processCard(card, player, gameState);
    },

    /**
     * Validate a move (routes through Validation substrate)
     */
    validateMove(move, gameState) {
        const substrate = this._substrates.Validation;
        if (!substrate) {
            console.error('[GameEngineManifold] Validation substrate not found');
            return { valid: false, reason: 'Validation substrate not available' };
        }

        // Use game-specific move validation
        return substrate.game.validateMove(move);
    },

    /**
     * Get AI decision (routes through AI manifold)
     */
    getAIDecision(params) {
        const substrate = this._substrates.AI;
        if (!substrate) {
            console.error('[GameEngineManifold] AI substrate not found');
            return null;
        }

        return substrate.navigate(params);
    },

    /**
     * Emit game event (routes through Event substrate)
     */
    emit(eventName, data) {
        const substrate = this._substrates.Event;
        if (!substrate) {
            console.warn('[GameEngineManifold] Event substrate not found');
            return;
        }

        substrate.emit(eventName, data);
    },

    /**
     * Subscribe to game event (routes through Event substrate)
     */
    on(eventName, handler) {
        const substrate = this._substrates.Event;
        if (!substrate) {
            console.warn('[GameEngineManifold] Event substrate not found');
            return;
        }

        substrate.on(eventName, handler);
    },

    /**
     * Get/set game state (routes through State substrate)
     */
    state(key, value) {
        const substrate = this._substrates.State;
        if (!substrate) {
            console.warn('[GameEngineManifold] State substrate not found');
            return value === undefined ? null : undefined;
        }

        if (value === undefined) {
            return substrate.get(key);
        } else {
            substrate.set(key, value);
        }
    },

    // ════════════════════════════════════════════════════════
    // GEOMETRIC COMPOSITION (z = x · y)
    // ════════════════════════════════════════════════════════

    /**
     * Compose two substrates geometrically
     * Creates a pipeline where output of x feeds into y
     */
    compose(substrate1Name, substrate2Name) {
        const x = this._substrates[substrate1Name];
        const y = this._substrates[substrate2Name];

        if (!x || !y) {
            console.error('[GameEngineManifold] Cannot compose - substrate not found');
            return null;
        }

        console.log(`[GameEngineManifold] Composing ${substrate1Name} · ${substrate2Name}`);

        // Return composed function
        return (input) => {
            const intermediateResult = x.invoke ? x.invoke(input) : x;
            return y.invoke ? y.invoke(intermediateResult) : y;
        };
    },

    /**
     * Create a processing pipeline from multiple substrates
     */
    pipeline(...substrateNames) {
        console.log(`[GameEngineManifold] Creating pipeline: ${substrateNames.join(' → ')}`);

        return (input) => {
            let result = input;
            for (const name of substrateNames) {
                const substrate = this._substrates[name];
                if (substrate && substrate.invoke) {
                    result = substrate.invoke(result);
                }
            }
            return result;
        };
    },

    // ════════════════════════════════════════════════════════
    // MANIFOLD INTERFACE
    // ════════════════════════════════════════════════════════

    getStats() {
        const substrates = Object.keys(this._substrates);
        return {
            totalSubstrates: substrates.length,
            substrates: substrates,
            dimension: this._meta.dimension,
            type: this._meta.type
        };
    },

    visualize() {
        const stats = this.getStats();
        let output = '\n🎮 Game Engine Manifold Visualization\n';
        output += '═'.repeat(50) + '\n';
        output += `Dimension: ${stats.dimension}D (Meta-substrate)\n`;
        output += `Total Substrates: ${stats.totalSubstrates}\n`;
        output += '─'.repeat(50) + '\n';
        
        Object.entries(this._substrates).forEach(([name, substrate]) => {
            const meta = substrate.getMetadata ? substrate.getMetadata() : { dimension: '?' };
            output += `  • ${name} (${meta.dimension}D)\n`;
        });
        
        output += '─'.repeat(50) + '\n';
        output += 'Geometric Composition: z = x · y\n';
        output += 'Direct Coordinate Access: O(1)\n';
        output += 'Lazy Manifestation: Active\n';
        
        return output;
    },

    getMetadata() {
        return this._meta;
    }
};

// Auto-initialize when all substrates are loaded
if (typeof window !== 'undefined') {
    window.GameEngineManifold = GameEngineManifold;
    
    // Initialize after a short delay to ensure all substrates are loaded
    setTimeout(() => {
        GameEngineManifold.initialize();
        console.log('✅ GameEngineManifold loaded and initialized');
        console.log(GameEngineManifold.visualize());
    }, 100);
}
