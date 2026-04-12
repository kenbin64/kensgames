/**
 * FastTrack AI Manifold
 * 
 * Minimal Surface: AI decision making
 * All AI behavior derives from board state + simple heuristics
 * Replaces ~1500 lines of AI code
 */

const AIManifold = (function() {
    'use strict';
    
    // AI difficulty settings
    const DIFFICULTY = {
        easy: { randomness: 0.4, lookAhead: 0, aggression: 0.3 },
        medium: { randomness: 0.2, lookAhead: 1, aggression: 0.5 },
        hard: { randomness: 0.05, lookAhead: 2, aggression: 0.7 },
        expert: { randomness: 0, lookAhead: 3, aggression: 0.9 }
    };
    
    let currentDifficulty = 'medium';
    
    /**
     * Select best move for AI player
     */
    function selectMove(playerIndex, card, moves) {
        if (moves.length === 0) return null;
        if (moves.length === 1) return moves[0];
        
        const settings = DIFFICULTY[currentDifficulty];
        
        // Add randomness based on difficulty
        if (Math.random() < settings.randomness) {
            return moves[Math.floor(Math.random() * moves.length)];
        }
        
        // Score each move
        const scored = moves.map(move => ({
            move,
            score: evaluateMove(move, playerIndex, settings)
        }));
        
        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);
        
        // Return best move
        return scored[0].move;
    }
    
    /**
     * Evaluate a move's value
     */
    function evaluateMove(move, playerIndex, settings) {
        let score = 0;
        
        // Exit home bonus
        if (move.type === 'exit') {
            score += 50;
        }
        
        // Progress toward goal
        score += getProgressScore(move);
        
        // Cut opponent bonus
        if (move.cuts) {
            score += 100 * settings.aggression;
            
            // Extra points for cutting advanced opponent
            const cutPeg = PegSubstrate.getPeg(move.cuts);
            if (cutPeg) {
                score += getProgressValue(cutPeg) * 0.5;
            }
        }
        
        // Safe zone entry bonus
        if (move.to.startsWith('safe_')) {
            score += 80;
        }
        
        // Finishing bonus
        if (move.to === 'center') {
            score += 200;
        }
        
        // Avoid being cut (look at danger)
        score -= getDangerScore(move.to, playerIndex) * (1 - settings.aggression);
        
        // Swap evaluation
        if (move.type === 'swap') {
            score += evaluateSwap(move, playerIndex, settings);
        }
        
        return score;
    }
    
    /**
     * Calculate progress score for move
     */
    function getProgressScore(move) {
        // Forward moves are generally good
        if (move.distance > 0) {
            return move.distance * 5;
        }
        // Backward moves (4 card) can be strategic
        if (move.distance < 0) {
            return Math.abs(move.distance) * 2;
        }
        return 0;
    }
    
    /**
     * Get progress value of a peg (how far along it is)
     */
    function getProgressValue(peg) {
        if (peg.isHome) return 0;
        if (peg.isFinished) return 100;
        
        const hole = BoardSubstrate.getHole(peg.holeId);
        if (!hole) return 0;
        
        if (hole.type === 'safe') {
            return 80 + hole.safeIndex * 5;
        }
        
        // Track position relative to player's start
        const playerStart = peg.playerIndex * 20;
        const trackPos = hole.trackIndex || 0;
        const progress = (trackPos - playerStart + 80) % 80;
        
        return progress;
    }
    
    /**
     * Calculate danger of landing at position
     */
    function getDangerScore(holeId, playerIndex) {
        const hole = BoardSubstrate.getHole(holeId);
        if (!hole || hole.type !== 'outer') return 0;
        
        let danger = 0;
        
        // Check each opponent
        for (let p = 0; p < 4; p++) {
            if (p === playerIndex) continue;
            
            const opponentPegs = PegSubstrate.getMovablePegs(p);
            for (const peg of opponentPegs) {
                const oppHole = BoardSubstrate.getHole(peg.holeId);
                if (oppHole && oppHole.type === 'outer') {
                    const dist = getTrackDistance(oppHole.trackIndex, hole.trackIndex);
                    if (dist > 0 && dist <= 14) {
                        danger += (15 - dist) * 3;
                    }
                }
            }
        }
        
        return danger;
    }
    
    /**
     * Evaluate swap move
     */
    function evaluateSwap(move, playerIndex, settings) {
        const myPeg = PegSubstrate.getPeg(move.pegId);
        const theirPeg = PegSubstrate.getPeg(move.swapWith);
        
        if (!myPeg || !theirPeg) return 0;
        
        const myProgress = getProgressValue(myPeg);
        const theirProgress = getProgressValue(theirPeg);
        
        // Good swap if we gain progress
        return (theirProgress - myProgress) * 2;
    }
    
    /**
     * Get distance on track (forward)
     */
    function getTrackDistance(from, to) {
        return (to - from + 80) % 80;
    }
    
    /**
     * Set AI difficulty
     */
    function setDifficulty(level) {
        if (DIFFICULTY[level]) {
            currentDifficulty = level;
        }
    }
    
    /**
     * Simulate thinking delay
     */
    function think(callback, minMs = 500, maxMs = 2000) {
        const delay = minMs + Math.random() * (maxMs - minMs);
        setTimeout(callback, delay);
    }
    
    // Public API
    return {
        selectMove,
        evaluateMove,
        setDifficulty,
        think,
        DIFFICULTY,
        get difficulty() { return currentDifficulty; }
    };
})();

if (typeof module !== 'undefined') module.exports = AIManifold;

