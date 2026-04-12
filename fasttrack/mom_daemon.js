/**
 * Mom Daemon — Persistent Game Helper
 * =====================================
 * Event-driven assistant that monitors game state and provides
 * contextual tips and suggestions throughout gameplay.
 * 
 * Unlike the modal-based Ask Mom, this daemon:
 * - Runs continuously when activated
 * - Monitors game events (card drawn, move made, turn changed)
 * - Provides proactive tips and warnings
 * - Shows subtle notifications without blocking gameplay
 * 
 * Copyright (c) 2024-2026 Kenneth Bingham — ButterflyFX
 * Licensed under CC BY 4.0
 */

'use strict';

window.MomDaemon = (function() {
    
    let isActive = false;
    let notificationTimeout = null;
    let lastTipTime = 0;
    const TIP_COOLDOWN = 15000; // 15 seconds between tips
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    function init() {
        console.log('[MomDaemon] Initializing...');
        createNotificationElement();
        attachEventListeners();
        console.log('[MomDaemon] Ready (inactive)');
    }
    
    function createNotificationElement() {
        if (document.getElementById('mom-daemon-notification')) return;
        
        const notif = document.createElement('div');
        notif.id = 'mom-daemon-notification';
        notif.className = 'mom-daemon-notification';
        notif.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            max-width: 320px;
            background: linear-gradient(135deg, rgba(236, 72, 153, 0.95), rgba(219, 39, 119, 0.95));
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 16px;
            padding: 16px 20px;
            color: white;
            font-size: 14px;
            line-height: 1.5;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            opacity: 0;
            transform: translateX(400px);
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            z-index: 9998;
            backdrop-filter: blur(10px);
        `;
        notif.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 28px;">👩‍👧</span>
                <div id="mom-daemon-message" style="flex: 1;"></div>
            </div>
        `;
        document.body.appendChild(notif);
        
        // Inject styles for active state
        const style = document.createElement('style');
        style.textContent = `
            .mom-daemon-notification.visible {
                opacity: 1 !important;
                transform: translateX(0) !important;
                pointer-events: auto !important;
            }
            
            #mom-help-btn.daemon-active {
                background: linear-gradient(135deg, #ec4899, #db2777) !important;
                box-shadow: 0 0 20px rgba(236, 72, 153, 0.6) !important;
                animation: momPulse 2s ease-in-out infinite !important;
            }
            
            @keyframes momPulse {
                0%, 100% { box-shadow: 0 0 20px rgba(236, 72, 153, 0.6); }
                50% { box-shadow: 0 0 30px rgba(236, 72, 153, 0.9); }
            }
        `;
        document.head.appendChild(style);
    }
    
    function attachEventListeners() {
        // Listen for game events
        document.addEventListener('cardDrawn', onCardDrawn);
        document.addEventListener('moveMade', onMoveMade);
        document.addEventListener('turnChanged', onTurnChanged);
        document.addEventListener('pegCut', onPegCut);
    }
    
    // ============================================================
    // TOGGLE DAEMON
    // ============================================================
    
    function toggle() {
        isActive = !isActive;
        const btn = document.getElementById('mom-help-btn');
        
        if (isActive) {
            console.log('[MomDaemon] Activated');
            if (btn) btn.classList.add('daemon-active');
            showNotification("👋 Hi! I'm here to help. I'll give you tips as you play!", 3000);
        } else {
            console.log('[MomDaemon] Deactivated');
            if (btn) btn.classList.remove('daemon-active');
            hideNotification();
            showNotification("💤 Mom Helper paused. Click again to reactivate!", 2000);
        }
    }
    
    // ============================================================
    // EVENT HANDLERS
    // ============================================================
    
    function onCardDrawn(event) {
        if (!isActive) return;
        if (!shouldShowTip()) return;
        
        const card = event.detail?.card || window.gameState?.currentCard;
        if (!card) return;
        
        const rank = card.rank || card.value;
        const tip = getCardTip(rank);
        if (tip) {
            showNotification(tip, 5000);
        }
    }
    
    function onMoveMade(event) {
        if (!isActive) return;
        if (!shouldShowTip()) return;
        
        const move = event.detail?.move;
        const gs = window.gameState;
        if (!move || !gs) return;
        
        const humanIdx = getHumanPlayerIndex();
        const player = gs.players[humanIdx];
        if (!player) return;
        
        // Check for strategic opportunities
        if (move.toHoleId && move.toHoleId.includes('safe')) {
            showNotification("🛡️ Safe zone! Protected from cuts.", 3000);
        } else if (move.isFastTrackEntry) {
            showNotification("🚀 FastTrack entered! Huge shortcut.", 3000);
        } else if (move.toHoleId === 'center') {
            // Risk assessment for bullseye
            const opponentCount = gs.players.filter((p, i) => i !== humanIdx && !p.isAI).length;
            const opponentPegsOnBoard = gs.players
                .filter((p, i) => i !== humanIdx)
                .reduce((sum, p) => sum + p.peg.filter(peg => peg.holeType !== 'holding').length, 0);
            
            if (opponentPegsOnBoard > 8) {
                showNotification("⚠️ Bullseye! High risk - many opponent pegs. Need J/Q/K to exit.", 5000);
            } else {
                showNotification("🎯 Bullseye! Safe haven. Need J/Q/K to exit.", 4000);
            }
        } else if (move.fromHoleId && move.fromHoleId.startsWith('home-')) {
            // Moving off home hole
            showNotification("✅ Home cleared! Ready for new tokens.", 3000);
        }
        
        // Check if safe zone is getting full
        const safeZonePegs = player.peg.filter(p => p.holeType === 'safezone').length;
        if (safeZonePegs >= 3 && move.toHoleId && move.toHoleId.includes('safe')) {
            showNotification("🏠 Safe zone filling up! Plan your final moves.", 4000);
        }
    }
    
    function onTurnChanged(event) {
        if (!isActive) return;
        
        const gs = window.gameState;
        if (!gs) return;
        
        const humanIdx = getHumanPlayerIndex();
        const isMyTurn = gs.currentPlayerIndex === humanIdx;
        
        if (isMyTurn && shouldShowTip()) {
            const player = gs.players[humanIdx];
            if (!player) return;
            
            // Check player status and give contextual advice
            const pegsInHolding = player.peg.filter(p => p.holeType === 'holding').length;
            const pegsInSafe = player.peg.filter(p => p.holeType === 'safezone').length;
            const pegOnHome = player.peg.find(p => p.holeId && p.holeId.startsWith('home-'));
            
            // Priority tips
            if (pegsInSafe === 4) {
                showNotification("🏆 4 in safe zone! Land 5th peg exactly on winner hole.", 5000);
            } else if (pegOnHome && pegsInHolding > 0) {
                showNotification("🏠 Home blocked! Clear it to bring tokens out.", 4000);
            } else if (pegsInSafe >= 2 && pegsInSafe < 4) {
                showNotification("🧹 Tidy safe zone! Make room for more tokens.", 4000);
            } else if (pegsInHolding >= 3) {
                showNotification("💡 Get pegs out! Need Ace, 6, or Joker.", 4000);
            }
            
            // Check for cutting opportunities
            const cuttableOpponents = findCuttableOpponents(gs, humanIdx);
            if (cuttableOpponents.length > 0 && shouldShowTip()) {
                const names = cuttableOpponents.map(p => p.name).join(', ');
                showNotification(`✂️ You can cut: ${names}`, 4000);
            }
        }
    }
    
    function onPegCut(event) {
        if (!isActive) return;
        
        const detail = event.detail;
        if (!detail) return;
        
        const humanIdx = getHumanPlayerIndex();
        if (detail.cuttingPlayer === humanIdx) {
            showNotification("✂️ Cut! Sent them back to holding.", 3000);
        } else if (detail.cutPlayer === humanIdx) {
            showNotification("😔 Cut! Back to holding. Regroup!", 3000);
        }
    }
    
    // Find opponents that can be cut
    function findCuttableOpponents(gs, humanIdx) {
        const cuttable = [];
        const player = gs.players[humanIdx];
        if (!player) return cuttable;
        
        // Get all opponent pegs on board (not in safe zones or bullseye)
        for (let i = 0; i < gs.players.length; i++) {
            if (i === humanIdx) continue;
            
            const opponent = gs.players[i];
            const vulnerablePegs = opponent.peg.filter(p => 
                p.holeType !== 'holding' && 
                p.holeType !== 'safezone' && 
                p.holeType !== 'bullseye' &&
                !p.holeId?.includes('safe')
            );
            
            if (vulnerablePegs.length > 0) {
                cuttable.push(opponent);
            }
        }
        
        return cuttable;
    }
    
    // ============================================================
    // CARD-SPECIFIC TIPS
    // ============================================================
    
    function getCardTip(rank) {
        const gs = window.gameState;
        const humanIdx = getHumanPlayerIndex();
        const player = gs?.players[humanIdx];
        
        // Check for Joker backward cutting opportunity
        if (rank === 'JOKER' && player) {
            const hasBackwardCut = checkJokerBackwardOpportunity(player, gs);
            if (hasBackwardCut) {
                return "🃏 Joker! Move back 1 to cut opponent behind you!";
            }
        }
        
        const tips = {
            'A': "🅰️ Ace! Enter peg OR move 1. +Turn.",
            '4': "⬅️ Four! Back 4 spaces. Position for safe zone.",
            '6': "6️⃣ Six! Enter peg OR move 6. +Turn.",
            '7': "7️⃣ Wild! Move any token 1-7 spaces.",
            'J': "🤴 Jack! Move 1, +Turn, exit bullseye.",
            'Q': "👸 Queen! Move 1, +Turn, exit bullseye.",
            'K': "👑 King! Move 1, +Turn, exit bullseye.",
            'JOKER': "🃏 Joker! Enter peg OR move 1. +Turn."
        };
        return tips[rank] || null;
    }
    
    // Check if Joker can cut opponent by moving backward
    function checkJokerBackwardOpportunity(player, gs) {
        if (!player || !gs) return false;
        
        for (const peg of player.peg) {
            // Skip holding, bullseye, completed
            if (peg.holeType === 'holding' || peg.holeType === 'bullseye' || peg.completedCircuit) continue;
            
            // Skip restricted holes (FastTrack, safe zone, home, center)
            if (peg.holeType === 'fasttrack' || peg.holeType === 'safezone' || 
                peg.holeType === 'home' || peg.holeType === 'center') continue;
            
            // Check if opponent is directly behind
            const backwardHole = getBackwardHoleId(peg, player, gs);
            if (!backwardHole) continue;
            
            // Check for opponent at backward position
            for (const opponent of gs.players) {
                if (opponent.index === player.index) continue;
                const oppPeg = opponent.peg.find(p => p.holeId === backwardHole);
                if (oppPeg) {
                    return true; // Found cutting opportunity
                }
            }
        }
        
        return false;
    }
    
    // Get backward hole ID (simplified version)
    function getBackwardHoleId(peg, player, gs) {
        // This is a simplified check - actual implementation would use game engine's getBackwardHole
        // For now, just return null as we don't have full track sequence here
        return null;
    }
    
    // ============================================================
    // NOTIFICATION DISPLAY
    // ============================================================
    
    function showNotification(message, duration = 4000) {
        const notif = document.getElementById('mom-daemon-notification');
        const messageEl = document.getElementById('mom-daemon-message');
        if (!notif || !messageEl) return;
        
        // Clear existing timeout
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }
        
        // Update message and show
        messageEl.textContent = message;
        notif.classList.add('visible');
        
        // Auto-hide after duration
        notificationTimeout = setTimeout(() => {
            hideNotification();
        }, duration);
        
        lastTipTime = Date.now();
    }
    
    function hideNotification() {
        const notif = document.getElementById('mom-daemon-notification');
        if (notif) {
            notif.classList.remove('visible');
        }
    }
    
    // ============================================================
    // HELPERS
    // ============================================================
    
    function shouldShowTip() {
        const now = Date.now();
        return (now - lastTipTime) >= TIP_COOLDOWN;
    }
    
    function getHumanPlayerIndex() {
        const gs = window.gameState;
        if (!gs || !gs.players) return 0;
        
        for (let i = 0; i < gs.players.length; i++) {
            const p = gs.players[i];
            if (!p.isAI && !p.isBot) return i;
        }
        return 0;
    }
    
    // ============================================================
    // PUBLIC API
    // ============================================================
    
    return {
        init,
        toggle,
        isActive: () => isActive,
        showTip: showNotification
    };
    
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.MomDaemon.init());
} else {
    window.MomDaemon.init();
}
