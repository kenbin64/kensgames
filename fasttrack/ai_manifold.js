/**
 * ============================================================
 * AI MANIFOLD
 * Dimensional manifold for AI decision making
 * Navigates dimensional space instead of tree traversal
 * Part of ButterflyFX Dimensional Computing Framework
 * ============================================================
 */

const AIManifold = {
    // Manifold metadata
    _meta: {
        name: 'AIManifold',
        dimension: 4,
        type: 'container',
        version: '1.0.0'
    },

    // Strategy dimension (3D)
    _strategies: {
        aggressive: {
            name: 'Aggressive',
            weights: { advance: 1.5, cut: 2.0, block: 0.5, safety: 0.3 },
            description: 'Prioritizes cutting opponents and rapid advancement'
        },
        defensive: {
            name: 'Defensive',
            weights: { advance: 0.8, cut: 0.5, block: 1.5, safety: 2.0 },
            description: 'Prioritizes safety and blocking opponents'
        },
        balanced: {
            name: 'Balanced',
            weights: { advance: 1.0, cut: 1.0, block: 1.0, safety: 1.0 },
            description: 'Balanced approach to all tactics'
        },
        opportunistic: {
            name: 'Opportunistic',
            weights: { advance: 1.2, cut: 1.8, block: 0.7, safety: 0.8 },
            description: 'Takes calculated risks for high rewards'
        }
    },

    // Tactic dimension (3D)
    _tactics: {
        cut: {
            name: 'Cut',
            evaluate: (move, gameState) => {
                // Check if move cuts an opponent
                const cutTarget = AIManifold._findCutTarget(move.toHoleId, gameState);
                return cutTarget ? 500 : 0;
            }
        },
        advance: {
            name: 'Advance',
            evaluate: (move, gameState) => {
                // Reward forward progress
                return (move.steps || 0) * 10;
            }
        },
        block: {
            name: 'Block',
            evaluate: (move, gameState) => {
                // Reward blocking opponent paths
                return AIManifold._evaluateBlockingPotential(move, gameState);
            }
        },
        safety: {
            name: 'Safety',
            evaluate: (move, gameState) => {
                // Reward safe moves (safe zone, winner hole)
                if (move.toHoleId?.includes('safe')) return 200;
                if (move.toHoleId?.includes('winner')) return 1000;
                return 0;
            }
        }
    },

    // ════════════════════════════════════════════════════════
    // DIMENSIONAL NAVIGATION
    // ════════════════════════════════════════════════════════

    /**
     * Navigate dimensional space to find best move
     * @param {Object} params - Navigation parameters
     * @returns {Object} Best move
     */
    navigate(params) {
        const {
            moves,
            strategy = 'balanced',
            difficulty = 'normal',
            gameState
        } = params;

        if (!moves || moves.length === 0) return null;

        console.log(`[AIManifold] Navigating with strategy: ${strategy}, difficulty: ${difficulty}`);

        // Get strategy weights
        const strategyWeights = this._strategies[strategy]?.weights || this._strategies.balanced.weights;

        // Score all moves using dimensional coordinates
        const scoredMoves = moves.map(move => {
            const score = this._scoreMove(move, strategyWeights, gameState);
            return { move, score };
        });

        // Sort by score (descending)
        scoredMoves.sort((a, b) => b.score - a.score);

        // Apply difficulty modulation
        const selectedMove = this._applyDifficultyModulation(scoredMoves, difficulty);

        console.log(`[AIManifold] Selected move with score: ${selectedMove.score}`);
        return selectedMove.move;
    },

    /**
     * Score a move using dimensional tactics
     */
    _scoreMove(move, strategyWeights, gameState) {
        let totalScore = 0;

        // Evaluate each tactic dimension
        for (const [tacticName, tactic] of Object.entries(this._tactics)) {
            const tacticScore = tactic.evaluate(move, gameState);
            const weight = strategyWeights[tacticName] || 1.0;
            totalScore += tacticScore * weight;
        }

        return totalScore;
    },

    /**
     * Apply difficulty-based selection modulation
     */
    _applyDifficultyModulation(scoredMoves, difficulty) {
        if (difficulty === 'easy') {
            // Easy: 30% chance to pick suboptimal move
            if (Math.random() < 0.3 && scoredMoves.length > 1) {
                const randomIndex = Math.floor(Math.random() * Math.min(3, scoredMoves.length));
                return scoredMoves[randomIndex];
            }
        } else if (difficulty === 'hard' || difficulty === 'expert' || difficulty === 'warpath') {
            // Hard+: Always pick best move
            return scoredMoves[0];
        }

        // Normal/intermediate: Pick best move
        return scoredMoves[0];
    },

    /**
     * Set AI strategy for a player
     */
    setStrategy(playerId, strategyName) {
        if (!this._strategies[strategyName]) {
            console.warn(`[AIManifold] Unknown strategy: ${strategyName}, using balanced`);
            strategyName = 'balanced';
        }

        console.log(`[AIManifold] Player ${playerId} strategy set to: ${strategyName}`);
        
        // Store strategy in dimensional state
        if (!this._playerStrategies) this._playerStrategies = {};
        this._playerStrategies[playerId] = strategyName;
    },

    /**
     * Get AI strategy for a player
     */
    getStrategy(playerId) {
        return this._playerStrategies?.[playerId] || 'balanced';
    },

    // ════════════════════════════════════════════════════════
    // HELPER FUNCTIONS (Lower dimensional points)
    // ════════════════════════════════════════════════════════

    _findCutTarget(holeId, gameState) {
        if (!gameState?.players) return null;

        for (const player of gameState.players) {
            for (const peg of player.peg || []) {
                if (peg.holeId === holeId) {
                    return { player, peg };
                }
            }
        }
        return null;
    },

    _evaluateBlockingPotential(move, gameState) {
        // Simple blocking evaluation
        // In production, this would analyze opponent paths
        return 0;
    },

    // ════════════════════════════════════════════════════════
    // MANIFOLD INTERFACE
    // ════════════════════════════════════════════════════════

    getStats() {
        return {
            strategies: Object.keys(this._strategies).length,
            tactics: Object.keys(this._tactics).length,
            activePlayers: Object.keys(this._playerStrategies || {}).length
        };
    },

    visualize() {
        const stats = this.getStats();
        let output = '\n🤖 AI Manifold Visualization\n';
        output += '═'.repeat(50) + '\n';
        output += `Strategies: ${stats.strategies}\n`;
        output += `Tactics: ${stats.tactics}\n`;
        output += `Active Players: ${stats.activePlayers}\n`;
        output += '─'.repeat(50) + '\n';
        
        output += '\nStrategy Dimension:\n';
        Object.entries(this._strategies).forEach(([name, strategy]) => {
            output += `  • ${name}: ${strategy.description}\n`;
        });
        
        output += '\nTactic Dimension:\n';
        Object.entries(this._tactics).forEach(([name, tactic]) => {
            output += `  • ${name}\n`;
        });
        
        return output;
    },

    getMetadata() {
        return this._meta;
    }
};

// Register with SubstrateManifold
if (typeof SubstrateManifold !== 'undefined') {
    SubstrateManifold.register('AI', AIManifold);
}

// Global export
window.AIManifold = AIManifold;
console.log('✅ AIManifold loaded - Dimensional AI decision making ready');
