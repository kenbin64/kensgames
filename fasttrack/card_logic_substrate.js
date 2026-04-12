/**
 * ============================================================
 * CARD LOGIC SUBSTRATE
 * Dimensional substrate for all card processing logic
 * Part of ButterflyFX Dimensional Computing Framework
 * ============================================================
 */

const CardLogicSubstrate = {
    // Substrate metadata
    _meta: {
        name: 'CardLogicSubstrate',
        dimension: 3,
        type: 'functional',
        version: '1.0.0'
    },

    // Card definitions (0D potential - manifest on access)
    _cardDefinitions: null,

    // ════════════════════════════════════════════════════════
    // DIMENSIONAL POINTS (Methods)
    // ════════════════════════════════════════════════════════

    /**
     * Get card definition by rank
     * Lazy manifestation - definitions load only when first accessed
     */
    getCardDefinition(rank) {
        if (!this._cardDefinitions) {
            this._manifestCardDefinitions();
        }
        return this._cardDefinitions[rank];
    },

    /**
     * Process a card play
     * @param {Object} card - Card being played
     * @param {Object} player - Player playing the card
     * @param {Object} gameState - Current game state
     * @returns {Object} Processing result
     */
    processCard(card, player, gameState) {
        const definition = this.getCardDefinition(card.rank);
        
        if (!definition) {
            return { success: false, error: `Unknown card: ${card.rank}` };
        }

        console.log(`[CardLogic] Processing ${card.rank} for ${player.name}`);

        // Check if card grants extra turn
        const grantsExtraTurn = definition.extraTurn || false;

        // Check special card behaviors
        const isSpecial = this.isSpecialCard(card.rank);
        const specialBehavior = isSpecial ? this.getSpecialBehavior(card.rank) : null;

        return {
            success: true,
            card: card,
            definition: definition,
            grantsExtraTurn: grantsExtraTurn,
            isSpecial: isSpecial,
            specialBehavior: specialBehavior,
            movement: definition.movement
        };
    },

    /**
     * Check if card is special (has unique behavior)
     */
    isSpecialCard(rank) {
        const specialCards = ['A', '4', '7', 'J', 'Q', 'K', 'JOKER'];
        return specialCards.includes(rank);
    },

    /**
     * Get special behavior for a card
     */
    getSpecialBehavior(rank) {
        const behaviors = {
            'A': { type: 'enter_or_move', canEnter: true, canExitBullseye: false },
            '4': { type: 'backward', direction: 'backward', restrictions: ['no_fasttrack', 'no_bullseye', 'no_safe', 'no_home'] },
            '7': { type: 'split', canSplit: true, splitRequires: 2 },
            'J': { type: 'royal', canEnter: true, canExitBullseye: true },
            'Q': { type: 'royal', canEnter: true, canExitBullseye: true },
            'K': { type: 'royal', canEnter: true, canExitBullseye: true },
            'JOKER': { type: 'wildcard', canEnter: true, canExitBullseye: true, movement: 'any' }
        };
        return behaviors[rank] || null;
    },

    /**
     * Check if card grants extra turn
     */
    grantsExtraTurn(rank) {
        const extraTurnCards = ['A', '6', 'J', 'Q', 'K', 'JOKER'];
        return extraTurnCards.includes(rank);
    },

    /**
     * Validate card can be played
     */
    canPlayCard(card, player, gameState) {
        // Basic validation
        if (!card) return { valid: false, reason: 'No card provided' };
        if (!player) return { valid: false, reason: 'No player provided' };

        // Check if player has any legal moves with this card
        const legalMoves = window.MoveGenerationSubstrate?.calculateLegalMoves(player, card, gameState) || [];
        
        if (legalMoves.length === 0) {
            return { valid: false, reason: 'No legal moves available' };
        }

        return { valid: true, legalMoves: legalMoves };
    },

    // ════════════════════════════════════════════════════════
    // LAZY MANIFESTATION - Card Definitions
    // ════════════════════════════════════════════════════════

    _manifestCardDefinitions() {
        console.log('[CardLogic] Manifesting card definitions...');
        
        this._cardDefinitions = {
            'A': {
                rank: 'A',
                movement: 1,
                canEnter: true,
                extraTurn: true,
                canExitBullseye: false,
                description: 'Move 1 space OR enter a peg from holding. Extra turn.'
            },
            '2': {
                rank: '2',
                movement: 2,
                canEnter: false,
                extraTurn: false,
                description: 'Move 2 spaces forward.'
            },
            '3': {
                rank: '3',
                movement: 3,
                canEnter: false,
                extraTurn: false,
                description: 'Move 3 spaces forward.'
            },
            '4': {
                rank: '4',
                movement: 4,
                direction: 'backward',
                canEnter: false,
                extraTurn: false,
                restrictions: ['no_fasttrack', 'no_bullseye', 'no_safe', 'no_home'],
                description: 'Move 4 spaces BACKWARD. Cannot enter FastTrack, Bullseye, Safe Zone, or Home.'
            },
            '5': {
                rank: '5',
                movement: 5,
                canEnter: false,
                extraTurn: false,
                description: 'Move 5 spaces forward.'
            },
            '6': {
                rank: '6',
                movement: 6,
                canEnter: false,
                extraTurn: true,
                description: 'Move 6 spaces forward. Extra turn.'
            },
            '7': {
                rank: '7',
                movement: 7,
                canEnter: false,
                extraTurn: false,
                canSplit: true,
                splitRequires: 2,
                description: 'Move 7 spaces OR split between 2 pegs (must use all 7).'
            },
            '8': {
                rank: '8',
                movement: 8,
                canEnter: false,
                extraTurn: false,
                description: 'Move 8 spaces forward.'
            },
            '9': {
                rank: '9',
                movement: 9,
                canEnter: false,
                extraTurn: false,
                description: 'Move 9 spaces forward.'
            },
            '10': {
                rank: '10',
                movement: 10,
                canEnter: false,
                extraTurn: false,
                description: 'Move 10 spaces forward.'
            },
            'J': {
                rank: 'J',
                movement: 11,
                canEnter: true,
                extraTurn: true,
                canExitBullseye: true,
                description: 'Move 11 spaces, enter from holding, OR exit Bullseye to FastTrack. Extra turn.'
            },
            'Q': {
                rank: 'Q',
                movement: 12,
                canEnter: true,
                extraTurn: true,
                canExitBullseye: true,
                description: 'Move 12 spaces, enter from holding, OR exit Bullseye to FastTrack. Extra turn.'
            },
            'K': {
                rank: 'K',
                movement: 13,
                canEnter: true,
                extraTurn: true,
                canExitBullseye: true,
                description: 'Move 13 spaces, enter from holding, OR exit Bullseye to FastTrack. Extra turn.'
            },
            'JOKER': {
                rank: 'JOKER',
                movement: 'any',
                canEnter: true,
                extraTurn: true,
                canExitBullseye: true,
                wildcard: true,
                description: 'Wild card - move any distance, enter, or exit Bullseye. Extra turn.'
            }
        };
    },

    // ════════════════════════════════════════════════════════
    // SUBSTRATE INTERFACE
    // ════════════════════════════════════════════════════════

    invoke(method, ...args) {
        if (typeof this[method] === 'function') {
            return this[method](...args);
        }
        throw new Error(`Method ${method} not found on CardLogicSubstrate`);
    },

    getMetadata() {
        return this._meta;
    }
};

// Register with SubstrateManifold
if (typeof SubstrateManifold !== 'undefined') {
    SubstrateManifold.register('CardLogic', CardLogicSubstrate);
}

// Global export
window.CardLogicSubstrate = CardLogicSubstrate;
console.log('✅ CardLogicSubstrate loaded - Dimensional card processing ready');
