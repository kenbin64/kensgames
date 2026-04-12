/**
 * FastTrack Board Substrate
 * 
 * Minimal Surface Architecture: Board geometry and hole management
 * Extracted from 17,000 line monolith → ~150 lines
 */

const BoardSubstrate = (function() {
    'use strict';
    
    // Board constants (derived from geometry)
    const OUTER_RADIUS = 9;
    const INNER_RADIUS = 4;
    const HOLE_RADIUS = 0.35;
    const TRACK_LENGTH = 80;  // Total holes on main track
    
    // Player board positions (starting corners)
    const PLAYER_POSITIONS = [
        { angle: Math.PI / 6, color: 0xff4444, name: 'Red' },      // 0
        { angle: 5 * Math.PI / 6, color: 0x44ff44, name: 'Green' }, // 1
        { angle: 7 * Math.PI / 6, color: 0x4444ff, name: 'Blue' },  // 2
        { angle: 11 * Math.PI / 6, color: 0xffff44, name: 'Yellow'} // 3
    ];
    
    // Hole registry (manifold - all holes derive from this)
    const holes = new Map();
    
    /**
     * Create a hole (Level 1: Point)
     */
    function createHole(id, type, playerIndex, x, y, z, properties = {}) {
        const hole = {
            id,
            type,           // 'home' | 'start' | 'outer' | 'fast' | 'safe'
            playerIndex,    // Owner (-1 for neutral)
            position: { x, y, z },
            peg: null,      // Current peg on this hole
            ...properties
        };
        holes.set(id, hole);
        return hole;
    }
    
    /**
     * Generate board geometry (Level 6: Whole)
     * All 200+ holes derive from this single function
     */
    function generateBoard(playerCount = 4) {
        holes.clear();
        
        const holesPerSide = TRACK_LENGTH / 4; // 20 holes per side
        
        // Generate outer track (80 holes)
        for (let i = 0; i < TRACK_LENGTH; i++) {
            const angle = (i / TRACK_LENGTH) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * OUTER_RADIUS;
            const z = Math.sin(angle) * OUTER_RADIUS;
            
            createHole(`outer_${i}`, 'outer', -1, x, 0, z, { trackIndex: i });
        }
        
        // Generate player zones (home, start, safe, fast)
        for (let p = 0; p < playerCount; p++) {
            const baseAngle = PLAYER_POSITIONS[p].angle;
            
            // Home row (5 holes) - where pegs start
            for (let h = 0; h < 5; h++) {
                const angle = baseAngle + (h - 2) * 0.15;
                const x = Math.cos(angle) * (OUTER_RADIUS + 1.5);
                const z = Math.sin(angle) * (OUTER_RADIUS + 1.5);
                createHole(`home_${p}_${h}`, 'home', p, x, 0, z);
            }
            
            // Start hole (entry to track)
            const startX = Math.cos(baseAngle) * OUTER_RADIUS;
            const startZ = Math.sin(baseAngle) * OUTER_RADIUS;
            createHole(`start_${p}`, 'start', p, startX, 0, startZ);
            
            // Safe zone (4 holes leading to center)
            for (let s = 0; s < 4; s++) {
                const r = OUTER_RADIUS - (s + 1) * 1.2;
                const x = Math.cos(baseAngle) * r;
                const z = Math.sin(baseAngle) * r;
                createHole(`safe_${p}_${s}`, 'safe', p, x, 0, z, { safeIndex: s });
            }
            
            // Fast track entry (shortcut)
            const ftAngle = baseAngle + Math.PI / 12;
            const ftX = Math.cos(ftAngle) * INNER_RADIUS;
            const ftZ = Math.sin(ftAngle) * INNER_RADIUS;
            createHole(`fast_${p}`, 'fast', p, ftX, 0, ftZ);
        }
        
        // Center hole (final destination)
        createHole('center', 'center', -1, 0, 0.2, 0);
        
        return holes;
    }
    
    /**
     * Get hole by ID (O(1) lookup)
     */
    function getHole(id) {
        return holes.get(id);
    }
    
    /**
     * Get all holes of type
     */
    function getHolesByType(type) {
        return Array.from(holes.values()).filter(h => h.type === type);
    }
    
    /**
     * Get player's holes
     */
    function getPlayerHoles(playerIndex) {
        return Array.from(holes.values()).filter(h => h.playerIndex === playerIndex);
    }
    
    /**
     * Get next hole on track (main game logic)
     */
    function getNextHole(holeId, steps = 1, playerIndex = -1) {
        const hole = holes.get(holeId);
        if (!hole) return null;
        
        // Track movement logic
        if (hole.type === 'outer') {
            const nextIdx = (hole.trackIndex + steps) % TRACK_LENGTH;
            return holes.get(`outer_${nextIdx}`);
        }
        
        // Safe zone progression
        if (hole.type === 'safe') {
            const nextSafe = hole.safeIndex + steps;
            if (nextSafe >= 4) return holes.get('center');
            return holes.get(`safe_${hole.playerIndex}_${nextSafe}`);
        }
        
        return null;
    }
    
    /**
     * Calculate path between holes (for animation)
     */
    function getPath(fromId, toId) {
        const path = [];
        let current = fromId;
        let safety = 100;
        
        while (current !== toId && safety-- > 0) {
            path.push(holes.get(current));
            const next = getNextHole(current, 1);
            if (!next) break;
            current = next.id;
        }
        path.push(holes.get(toId));
        
        return path;
    }
    
    // Public API — the minimal surface
    return {
        PLAYER_POSITIONS,
        OUTER_RADIUS,
        INNER_RADIUS,
        HOLE_RADIUS,
        TRACK_LENGTH,
        
        generateBoard,
        createHole,
        getHole,
        getHolesByType,
        getPlayerHoles,
        getNextHole,
        getPath,
        
        get holes() { return holes; }
    };
})();

if (typeof module !== 'undefined') module.exports = BoardSubstrate;

