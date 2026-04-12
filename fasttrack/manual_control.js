/**
 * Manual Control Mode for Fast Track
 * Allows players to jump hole-to-hole until reaching final destination
 * Game enforces legal moves
 */

'use strict';

// Manual mode implementation functions
function startManualMove(move) {
    console.log('[Manual Mode] Starting manual move:', move);
    
    if (!move || !move.toHoleId) {
        console.error('[Manual Mode] Invalid move object');
        return;
    }
    
    // In manual mode, show all intermediate holes along the path
    manualMoveState.active = true;
    manualMoveState.pegId = move.pegId;
    manualMoveState.currentHole = move.fromHoleId;
    manualMoveState.targetHole = move.toHoleId;
    manualMoveState.remainingSteps = move.steps || calculateSteps(move.fromHoleId, move.toHoleId);
    manualMoveState.path = [move.fromHoleId];
    
    // Calculate all intermediate holes
    const intermediatePath = calculatePathToDestination(move.fromHoleId, move.toHoleId, manualMoveState.remainingSteps);
    
    // Highlight all holes in the path
    highlightManualPath(intermediatePath);
    
    // Show instruction
    showManualModeIndicator(`Click holes to jump (${manualMoveState.remainingSteps} steps remaining)`);
}

function handleManualModeClick(holeId) {
    console.log('[Manual Mode] Hole clicked:', holeId);
    
    if (!manualMoveState.active) {
        console.warn('[Manual Mode] Not in manual mode');
        return;
    }
    
    // Check if this is a valid next hole
    const isValidNextHole = isLegalNextHole(manualMoveState.currentHole, holeId);
    
    if (!isValidNextHole) {
        console.warn('[Manual Mode] Invalid hole - not on legal path');
        showManualModeIndicator(`Invalid move! Click a hole on the highlighted path`, 'error');
        return;
    }
    
    // Move peg to this hole
    const steps = calculateSteps(manualMoveState.currentHole, holeId);
    manualMoveState.remainingSteps -= steps;
    manualMoveState.currentHole = holeId;
    manualMoveState.path.push(holeId);
    
    // Animate peg to this hole
    animatePegToHole(manualMoveState.pegId, holeId);
    
    // Check if we've reached the final destination
    if (holeId === manualMoveState.targetHole || manualMoveState.remainingSteps <= 0) {
        // Complete the move
        completeManualMove();
    } else {
        // Update indicator
        showManualModeIndicator(`${manualMoveState.remainingSteps} steps remaining - click next hole or final destination`);
        
        // Re-highlight remaining path
        const remainingPath = calculatePathToDestination(holeId, manualMoveState.targetHole, manualMoveState.remainingSteps);
        highlightManualPath(remainingPath);
    }
}

function completeManualMove() {
    console.log('[Manual Mode] Move complete');
    
    // Build the final move object
    const finalMove = {
        pegId: manualMoveState.pegId,
        fromHoleId: manualMoveState.path[0],
        toHoleId: manualMoveState.targetHole,
        steps: manualMoveState.path.length - 1,
        path: manualMoveState.path
    };
    
    // Clear manual mode state
    manualMoveState.active = false;
    manualMoveState.pegId = null;
    manualMoveState.currentHole = null;
    manualMoveState.targetHole = null;
    manualMoveState.path = [];
    manualMoveState.remainingSteps = 0;
    
    // Clear highlights
    clearHighlights();
    hideManualModeIndicator();
    
    // Execute the move through the game engine
    if (typeof gameState !== 'undefined' && gameState.executeMove) {
        gameState.executeMove(finalMove);
    }
}

function calculatePathToDestination(fromHole, toHole, maxSteps) {
    // Calculate all holes between fromHole and toHole
    // This is a simplified version - you'll need to implement proper board traversal
    const path = [fromHole];
    
    // For now, just return the direct path
    // In a real implementation, this would traverse the board graph
    path.push(toHole);
    
    return path;
}

function isLegalNextHole(currentHole, nextHole) {
    // Check if nextHole is a legal move from currentHole
    // This should check the board topology and game rules
    
    // For now, accept any highlighted hole
    const hole = holeRegistry.get(nextHole);
    return hole && hole.isHighlighted;
}

function calculateSteps(fromHole, toHole) {
    // Calculate number of steps between two holes
    // This is a placeholder - implement proper distance calculation
    return 1;
}

function animatePegToHole(pegId, holeId) {
    // Animate the peg moving to the hole
    const peg = pegRegistry.get(pegId);
    const hole = holeRegistry.get(holeId);
    
    if (!peg || !hole) {
        console.error('[Manual Mode] Invalid peg or hole for animation');
        return;
    }
    
    // Use existing animation system
    if (typeof animatePegMove === 'function') {
        animatePegMove({ pegId, toHoleId: holeId }, () => {
            console.log('[Manual Mode] Intermediate animation complete');
        });
    }
}

function highlightManualPath(pathHoles) {
    // Highlight all holes in the path
    clearHighlights();
    
    pathHoles.forEach(holeId => {
        const hole = holeRegistry.get(holeId);
        if (hole && hole.mesh) {
            hole.isHighlighted = true;
            hole.mesh.material.emissive.setHex(0x00ff00);
            hole.mesh.material.emissiveIntensity = 0.5;
        }
    });
}

function showManualModeIndicator(message, type = 'info') {
    // Show indicator for manual mode
    const existing = document.getElementById('manual-mode-indicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.id = 'manual-mode-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${type === 'error' ? 'rgba(231, 76, 60, 0.95)' : 'rgba(52, 152, 219, 0.95)'};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        animation: fadeIn 0.3s ease-out;
    `;
    indicator.textContent = message;
    
    document.body.appendChild(indicator);
    
    // Auto-hide error messages
    if (type === 'error') {
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 2000);
    }
}

function hideManualModeIndicator() {
    const indicator = document.getElementById('manual-mode-indicator');
    if (indicator) indicator.remove();
}

// Initialize control mode from localStorage
window.addEventListener('DOMContentLoaded', () => {
    try {
        const savedMode = localStorage.getItem('fasttrack_control_mode');
        if (savedMode) {
            window.gameControlMode = savedMode;
            if (window.GameUIMinimal) {
                window.GameUIMinimal.controlMode = savedMode;
            }
            console.log('[Manual Control] Loaded control mode from localStorage:', savedMode);
        } else {
            // Default to automatic
            window.gameControlMode = 'automatic';
        }
    } catch (e) {
        console.warn('[Manual Control] Could not load control mode from localStorage');
        window.gameControlMode = 'automatic';
    }
});
