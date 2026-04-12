/**
 * FastTrack Peg Substrate
 * 
 * Minimal Surface: Peg creation and state management
 * All peg state derives from position on board manifold
 */

const PegSubstrate = (function() {
    'use strict';
    
    // Peg registry
    const pegs = new Map();
    
    // Peg mesh cache (for 3D)
    const meshes = new Map();
    
    /**
     * Create a peg (Level 1: Point entity)
     */
    function createPeg(id, playerIndex, holeId) {
        const peg = {
            id,
            playerIndex,
            holeId,         // Current position
            isHome: true,   // Derived: in home zone?
            isFinished: false,
            mesh: null      // 3D mesh reference
        };
        pegs.set(id, peg);
        
        // Update hole occupancy
        if (BoardSubstrate) {
            const hole = BoardSubstrate.getHole(holeId);
            if (hole) hole.peg = peg;
        }
        
        return peg;
    }
    
    /**
     * Create pegs for player (5 per player)
     */
    function createPlayerPegs(playerIndex) {
        const playerPegs = [];
        for (let i = 0; i < 5; i++) {
            const id = `peg_${playerIndex}_${i}`;
            const holeId = `home_${playerIndex}_${i}`;
            playerPegs.push(createPeg(id, playerIndex, holeId));
        }
        return playerPegs;
    }
    
    /**
     * Move peg to new hole
     */
    function movePeg(pegId, toHoleId) {
        const peg = pegs.get(pegId);
        if (!peg) return null;
        
        // Clear old hole
        if (BoardSubstrate) {
            const oldHole = BoardSubstrate.getHole(peg.holeId);
            if (oldHole) oldHole.peg = null;
            
            // Occupy new hole
            const newHole = BoardSubstrate.getHole(toHoleId);
            if (newHole) newHole.peg = peg;
        }
        
        peg.holeId = toHoleId;
        peg.isHome = toHoleId.startsWith('home_');
        peg.isFinished = toHoleId === 'center';
        
        return peg;
    }
    
    /**
     * Send peg home (when cut)
     */
    function sendHome(pegId) {
        const peg = pegs.get(pegId);
        if (!peg) return null;
        
        // Find empty home hole
        for (let i = 0; i < 5; i++) {
            const homeId = `home_${peg.playerIndex}_${i}`;
            const hole = BoardSubstrate.getHole(homeId);
            if (hole && !hole.peg) {
                return movePeg(pegId, homeId);
            }
        }
        return null;
    }
    
    /**
     * Get peg by ID
     */
    function getPeg(id) {
        return pegs.get(id);
    }
    
    /**
     * Get all pegs for player
     */
    function getPlayerPegs(playerIndex) {
        return Array.from(pegs.values()).filter(p => p.playerIndex === playerIndex);
    }
    
    /**
     * Get movable pegs (not in home, not finished)
     */
    function getMovablePegs(playerIndex) {
        return getPlayerPegs(playerIndex).filter(p => !p.isHome && !p.isFinished);
    }
    
    /**
     * Get pegs at home
     */
    function getHomePegs(playerIndex) {
        return getPlayerPegs(playerIndex).filter(p => p.isHome);
    }
    
    /**
     * Check if player has won
     */
    function hasPlayerWon(playerIndex) {
        return getPlayerPegs(playerIndex).every(p => p.isFinished);
    }
    
    /**
     * Get peg at specific hole
     */
    function getPegAtHole(holeId) {
        const hole = BoardSubstrate.getHole(holeId);
        return hole ? hole.peg : null;
    }
    
    /**
     * Clear all pegs
     */
    function clearAll() {
        pegs.forEach(peg => {
            if (peg.mesh) {
                peg.mesh.parent?.remove(peg.mesh);
            }
        });
        pegs.clear();
        meshes.clear();
    }
    
    /**
     * Create 3D mesh for peg
     */
    function createMesh(peg, color) {
        if (!window.THREE) return null;
        
        const geometry = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 16);
        const material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.3,
            roughness: 0.4
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.userData.pegId = peg.id;
        
        peg.mesh = mesh;
        meshes.set(peg.id, mesh);
        
        return mesh;
    }
    
    // Public API
    return {
        createPeg,
        createPlayerPegs,
        movePeg,
        sendHome,
        getPeg,
        getPlayerPegs,
        getMovablePegs,
        getHomePegs,
        hasPlayerWon,
        getPegAtHole,
        clearAll,
        createMesh,
        get pegs() { return pegs; }
    };
})();

if (typeof module !== 'undefined') module.exports = PegSubstrate;

