/**
 * 🐛 BOARD RENDER DEBUGGER
 * Inject this script to diagnose why the board isn't rendering
 */

(function() {
    console.log('🐛 === BOARD RENDER DEBUGGER STARTED ===');
    
    // Wait for DOM ready
    const checkInterval = setInterval(() => {
        console.log('🔍 Checking board state...');
        
        // Check container
        const container = document.getElementById('container');
        console.log('📦 Container:', container ? '✅ EXISTS' : '❌ MISSING');
        if (container) {
            console.log('   - Display:', window.getComputedStyle(container).display);
            console.log('   - Visibility:', window.getComputedStyle(container).visibility);
            console.log('   - Width:', container.offsetWidth);
            console.log('   - Height:', container.offsetHeight);
            console.log('   - Children:', container.children.length);
            if (container.children.length > 0) {
                console.log('   - First child:', container.children[0].tagName);
            }
        }
        
        // Check THREE.js
        console.log('🎨 THREE.js:', typeof THREE !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        
        // Check scene, camera, renderer
        console.log('🎬 Scene:', window.scene ? '✅ EXISTS' : '❌ MISSING');
        console.log('📷 Camera:', window.camera ? '✅ EXISTS' : '❌ MISSING');
        console.log('🖼️  Renderer:', window.renderer ? '✅ EXISTS' : '❌ MISSING');
        
        if (window.renderer) {
            console.log('   - Renderer size:', window.renderer.domElement.width, 'x', window.renderer.domElement.height);
            console.log('   - Renderer parent:', window.renderer.domElement.parentElement?.id || 'NO PARENT');
        }
        
        // Check board elements
        console.log('🎲 Board Group:', window.boardGroup ? '✅ EXISTS' : '❌ MISSING');
        if (window.boardGroup) {
            console.log('   - Children:', window.boardGroup.children.length);
        }
        
        console.log('🎯 Peg Group:', window.pegGroup ? '✅ EXISTS' : '❌ MISSING');
        
        // Check hole registry
        console.log('🕳️  Hole Registry:', window.holeRegistry ? '✅ EXISTS' : '❌ MISSING');
        if (window.holeRegistry) {
            console.log('   - Size:', window.holeRegistry.size);
        }
        
        // Check board ready
        console.log('✅ Board Ready:', window.boardReady ? '✅ TRUE' : '❌ FALSE');
        
        // Check dimensional substrates
        console.log('🌊 ObservationSubstrate:', typeof ObservationSubstrate !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        console.log('🌊 IntentManifold:', typeof IntentManifold !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        console.log('🌊 PotentialSubstrate:', typeof PotentialSubstrate !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        
        // Check VR
        console.log('🥽 VR ESP:', typeof VRLens !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        console.log('🥽 VR Entangled:', typeof window.VREntangledSubstrate !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        
        // Check if init() was called
        console.log('🔄 Init called:', window.scene ? '✅ YES (scene exists)' : '❌ NO (scene missing)');
        
        // Check jQuery
        console.log('💎 jQuery:', typeof $ !== 'undefined' ? '✅ LOADED' : '❌ MISSING');
        
        // Check game state
        console.log('🎮 Game State:', window.gameState ? '✅ EXISTS' : '❌ MISSING');
        
        console.log('🐛 === END DIAGNOSTIC ===\n');
        
        // Stop after 10 seconds
        if (Date.now() - startTime > 10000) {
            clearInterval(checkInterval);
            console.log('🐛 Debugger stopped after 10 seconds');
            
            // Final summary
            if (!window.scene) {
                console.error('❌ PROBLEM: init() was never called! Scene does not exist.');
                console.log('💡 SOLUTION: Check if jQuery $(function() {...}) is firing');
            } else if (!window.renderer) {
                console.error('❌ PROBLEM: Renderer was not created!');
            } else if (!window.renderer.domElement.parentElement) {
                console.error('❌ PROBLEM: Renderer canvas not attached to DOM!');
            } else if (window.renderer.domElement.width === 0) {
                console.error('❌ PROBLEM: Renderer has zero size!');
            } else if (!window.holeRegistry || window.holeRegistry.size === 0) {
                console.error('❌ PROBLEM: Hole registry is empty! Board geometry not created.');
            } else {
                console.log('✅ Everything looks good! Board should be rendering.');
                console.log('💡 If you still see a black screen, check:');
                console.log('   1. Camera position (might be inside the board)');
                console.log('   2. Lighting (might be too dark)');
                console.log('   3. VR mode (might be active)');
                console.log('   4. CSS z-index (container might be behind other elements)');
            }
        }
    }, 1000);
    
    const startTime = Date.now();
})();

