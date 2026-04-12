/**
 * ============================================================
 * MOVE GENERATION SUBSTRATE
 * Dimensional substrate for all move calculation logic
 * Part of ButterflyFX Dimensional Computing Framework
 * ============================================================
 */

const MoveGenerationSubstrate = {
    // Substrate metadata
    _meta: {
        name: 'MoveGenerationSubstrate',
        dimension: 3,
        type: 'functional',
        version: '1.0.0'
    },

    // ════════════════════════════════════════════════════════
    // DIMENSIONAL POINTS (Methods manifest on invocation)
    // ════════════════════════════════════════════════════════

    /**
     * Calculate all legal moves for a player with a card
     * @param {Object} player - Player object
     * @param {Object} card - Card object
     * @param {Object} gameState - Current game state
     * @returns {Array} Legal moves
     */
    calculateLegalMoves(player, card, gameState) {
        const legalMoves = [];
        const pegResults = {};

        console.log(`[MoveGen] Calculating moves for ${player.name} with card ${card.rank}`);

        // Iterate through player's pegs
        for (const peg of player.peg) {
            const pegId = peg.id;
            pegResults[pegId] = { holeId: peg.holeId, destinationsCount: 0, movesAdded: 0, blockedMoves: 0, skipped: false };

            // Skip pegs in winner hole
            if (peg.holeType === 'winner') {
                pegResults[pegId].skipped = true;
                pegResults[pegId].skipReason = 'in winner hole';
                continue;
            }

            // Skip pegs that completed circuit (in safe zone)
            if (peg.completedCircuit) {
                pegResults[pegId].skipped = true;
                pegResults[pegId].skipReason = 'completed circuit';
                continue;
            }

            // Calculate destinations for this peg
            const destinations = this.calculateDestinations(peg, card, player, gameState);
            pegResults[pegId].destinationsCount = destinations.length;

            // Convert destinations to move objects
            for (const dest of destinations) {
                const move = {
                    type: 'move',
                    pegId: peg.id,
                    fromHoleId: peg.holeId,
                    toHoleId: dest.holeId,
                    steps: card.movement || 0,
                    card: card.rank,
                    ...dest
                };

                legalMoves.push(move);
                pegResults[pegId].movesAdded++;
            }
        }

        // Handle 7-card split logic
        if (card.canSplit) {
            const splitEligible = this._getSplitEligiblePegs(player, gameState);
            
            if (splitEligible.length >= 2) {
                legalMoves.length = 0;
                legalMoves.push({
                    type: 'split_mode',
                    eligiblePegs: splitEligible.map(p => p.id),
                    description: '7 Card Split: Select 2 pegs to move (total 7 steps)'
                });
            } else {
                console.log(`[MoveGen] Only ${splitEligible.length} peg(s) eligible for split - using normal 7-space moves (${legalMoves.length} moves)`);
            }
        }

        console.log(`[MoveGen] Generated ${legalMoves.length} legal moves`);
        return legalMoves;
    },

    /**
     * Calculate possible destinations for a peg with a card
     * @param {Object} peg - Peg object
     * @param {Object} card - Card object
     * @param {Object} player - Player object
     * @param {Object} gameState - Game state
     * @returns {Array} Destination objects
     */
    calculateDestinations(peg, card, player, gameState) {
        // Delegate to smart peg system if available
        if (window.gameManager?.adjacency) {
            try {
                return window.gameManager.calculateDestinations(peg, card, player);
            } catch (e) {
                console.error('[MoveGen] Smart peg error, using fallback:', e);
            }
        }

        // Fallback: basic destination calculation
        return this._calculateDestinationsBasic(peg, card, player, gameState);
    },

    /**
     * Validate if a move is legal
     * @param {Object} move - Move to validate
     * @param {Object} gameState - Current game state
     * @returns {Object} { valid: boolean, reason: string }
     */
    validateMove(move, gameState) {
        if (!move) return { valid: false, reason: 'No move provided' };

        const player = gameState.players.find(p => p.peg.some(peg => peg.id === move.pegId));
        if (!player) return { valid: false, reason: 'Player not found' };

        const peg = player.peg.find(p => p.id === move.pegId);
        if (!peg) return { valid: false, reason: 'Peg not found' };

        // Validate peg is at expected starting position
        if (peg.holeId !== move.fromHoleId) {
            return { valid: false, reason: `Peg not at expected position (at ${peg.holeId}, expected ${move.fromHoleId})` };
        }

        // Validate destination exists
        if (!move.toHoleId) {
            return { valid: false, reason: 'No destination specified' };
        }

        return { valid: true };
    },

    // ════════════════════════════════════════════════════════
    // PRIVATE DIMENSIONAL POINTS (Lower dimension helpers)
    // ════════════════════════════════════════════════════════

    _getSplitEligiblePegs(player, gameState) {
        const playerFtHole = `ft-${player.boardPosition}`;
        const ftPegsOnRing = player.peg.filter(p =>
            p.onFasttrack && p.holeId?.startsWith('ft-') &&
            !p.completedCircuit && !p.inBullseye
        );
        const multipleFTPegs = ftPegsOnRing.length >= 2;

        return player.peg.filter(p => {
            if (p.holeType === 'holding') return false;
            if (p.inBullseye || p.holeType === 'bullseye') return false;
            if (p.completedCircuit) return false;

            const isOnFastTrack = p.holeId?.startsWith('ft-');
            if (isOnFastTrack) {
                const hasCompletedFastTrack = p.holeId === playerFtHole;
                if (!hasCompletedFastTrack && !multipleFTPegs) return false;
            }

            return true;
        });
    },

    _calculateDestinationsBasic(peg, card, player, gameState) {
        // Basic fallback implementation
        // In production, this would contain the full destination logic
        console.warn('[MoveGen] Using basic destination calculation - smart peg system unavailable');
        return [];
    },

    // ════════════════════════════════════════════════════════
    // SUBSTRATE INTERFACE
    // ════════════════════════════════════════════════════════

    invoke(method, ...args) {
        if (typeof this[method] === 'function') {
            return this[method](...args);
        }
        throw new Error(`Method ${method} not found on MoveGenerationSubstrate`);
    },

    getMetadata() {
        return this._meta;
    }
};

// Register with SubstrateManifold if available
if (typeof SubstrateManifold !== 'undefined') {
    SubstrateManifold.register('MoveGeneration', MoveGenerationSubstrate);
}

// Global export
window.MoveGenerationSubstrate = MoveGenerationSubstrate;
console.log('✅ MoveGenerationSubstrate loaded - Dimensional move calculation ready');
