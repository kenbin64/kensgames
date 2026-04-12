/**
 * FastTrack Rules Manifold
 * 
 * Minimal Surface: All game rules derive from board + card + peg state
 * This replaces ~2000 lines of scattered rule logic
 */

const RulesManifold = (function() {
    'use strict';
    
    /**
     * Calculate all legal moves for a player given a card
     * This is THE core game logic - everything else derives from this
     */
    function getLegalMoves(playerIndex, card) {
        const moves = [];
        const pegs = PegSubstrate.getPlayerPegs(playerIndex);
        const distances = CardSubstrate.getMoveDistances(card);
        
        // Check each peg
        for (const peg of pegs) {
            if (peg.isFinished) continue;
            
            // Home exit moves
            if (peg.isHome && CardSubstrate.canExitHome(card)) {
                const startHole = BoardSubstrate.getHole(`start_${playerIndex}`);
                if (startHole && !startHole.peg) {
                    moves.push({
                        type: 'exit',
                        pegId: peg.id,
                        from: peg.holeId,
                        to: startHole.id,
                        distance: 0
                    });
                }
            }
            
            // Track moves
            if (!peg.isHome) {
                for (const dist of distances) {
                    const targetHole = calculateTarget(peg, dist, playerIndex);
                    if (targetHole && isValidMove(peg, targetHole, playerIndex)) {
                        moves.push({
                            type: dist < 0 ? 'backward' : 'forward',
                            pegId: peg.id,
                            from: peg.holeId,
                            to: targetHole.id,
                            distance: dist,
                            cuts: getCutTarget(targetHole, playerIndex)
                        });
                    }
                }
            }
        }
        
        // Jack swap logic
        if (CardSubstrate.isSwap(card)) {
            moves.push(...getSwapMoves(playerIndex));
        }
        
        return moves;
    }
    
    /**
     * Calculate target hole after moving distance
     */
    function calculateTarget(peg, distance, playerIndex) {
        const currentHole = BoardSubstrate.getHole(peg.holeId);
        if (!currentHole) return null;
        
        // Safe zone movement
        if (currentHole.type === 'safe') {
            const newSafe = currentHole.safeIndex + distance;
            if (newSafe >= 4) return BoardSubstrate.getHole('center');
            if (newSafe < 0) return null; // Can't go backward out of safe
            return BoardSubstrate.getHole(`safe_${playerIndex}_${newSafe}`);
        }
        
        // Track movement
        if (currentHole.type === 'outer' || currentHole.type === 'start') {
            const trackIndex = currentHole.trackIndex || getTrackIndex(currentHole.id);
            const newIndex = (trackIndex + distance + BoardSubstrate.TRACK_LENGTH) % BoardSubstrate.TRACK_LENGTH;
            
            // Check if passing/landing on safe zone entry
            const safeEntry = getSafeZoneEntry(playerIndex);
            if (passedSafeEntry(trackIndex, newIndex, safeEntry, distance)) {
                const overshoot = calculateOvershoot(trackIndex, newIndex, safeEntry, distance);
                if (overshoot <= 4) {
                    return BoardSubstrate.getHole(`safe_${playerIndex}_${overshoot - 1}`);
                }
            }
            
            return BoardSubstrate.getHole(`outer_${newIndex}`);
        }
        
        return null;
    }
    
    /**
     * Check if move is valid
     */
    function isValidMove(peg, targetHole, playerIndex) {
        if (!targetHole) return false;
        
        // Can't land on own peg
        if (targetHole.peg && targetHole.peg.playerIndex === playerIndex) {
            return false;
        }
        
        // Can't land on opponent in safe zone
        if (targetHole.type === 'safe' && targetHole.peg) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Get peg that would be cut by landing
     */
    function getCutTarget(targetHole, playerIndex) {
        if (targetHole.peg && targetHole.peg.playerIndex !== playerIndex) {
            return targetHole.peg.id;
        }
        return null;
    }
    
    /**
     * Get swap moves for Jack
     */
    function getSwapMoves(playerIndex) {
        const moves = [];
        const myPegs = PegSubstrate.getMovablePegs(playerIndex);
        
        // Find opponent pegs on track (not in home/safe/center)
        for (const [id, hole] of BoardSubstrate.holes) {
            if (hole.type === 'outer' && hole.peg && hole.peg.playerIndex !== playerIndex) {
                for (const myPeg of myPegs) {
                    moves.push({
                        type: 'swap',
                        pegId: myPeg.id,
                        from: myPeg.holeId,
                        to: hole.id,
                        swapWith: hole.peg.id,
                        distance: 0
                    });
                }
            }
        }
        return moves;
    }
    
    // Helper functions
    function getTrackIndex(holeId) {
        const match = holeId.match(/outer_(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }
    
    function getSafeZoneEntry(playerIndex) {
        // Each player's safe zone entry is 20 holes apart
        return (playerIndex * 20 + 19) % BoardSubstrate.TRACK_LENGTH;
    }
    
    function passedSafeEntry(from, to, entry, distance) {
        if (distance < 0) return false;
        // Check if we crossed the entry point
        if (from < entry && to >= entry) return true;
        if (from > to && (to >= entry || from < entry)) return true;
        return false;
    }
    
    function calculateOvershoot(from, to, entry, distance) {
        return Math.abs(distance) - Math.abs(entry - from);
    }
    
    // Public API
    return {
        getLegalMoves,
        calculateTarget,
        isValidMove,
        getCutTarget,
        getSwapMoves
    };
})();

if (typeof module !== 'undefined') module.exports = RulesManifold;

