/**
 * ============================================================
 * FASTTRACK MOBILE UI
 * Light pillar indicators + action bar for mobile devices
 * Auto-move, card popup, cinematic-only camera
 * Smart auto-hide during animations for unobstructed viewing
 * ============================================================
 */

class MobileUI {
    constructor() {
        console.log('[MobileUI] Initializing...');
        
        this.actionBar = null;
        this.lightPillars = [];
        this.scene = null; // Will be set from board_3d
        this.currentMoves = [];
        this.onMoveSelected = null;
        this.currentCard = null;
        this.floatingCard = null;
        this.cardPopup = null;
        this.autoMoveEnabled = true; // Auto-execute single moves
        
        // Smart auto-hide system
        this.uiState = 'visible'; // 'visible', 'hidden', 'mini'
        this.isAnimating = false;
        this.autoHideTimeout = null;
        this.autoHideDelay = 3000; // Hide after 3 seconds of inactivity
        this.requiresUserInput = false; // True when waiting for move selection
        this.lastInteractionTime = Date.now();
        
        this.isMobile = this.detectMobile();
        console.log('[MobileUI] Mobile detected:', this.isMobile);
        
        // Force cinematic camera on mobile
        if (this.isMobile) {
            this.forceCinematicMode();
        }
        
        this.createActionBar();
        this.createMobileHeader();
        this.createFloatingCard();
        this.createCardPopup();
        this.createStatusPill();
        this.createTouchOverlay();
        this.setupAutoHideSystem();
    }
    
    detectMobile() {
        return window.innerWidth <= 768 || 
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // Force cinematic camera mode on mobile/tablet
    forceCinematicMode() {
        if (typeof window.cameraMode !== 'undefined') {
            window.cameraMode = 'cinematic';
            window.userOverrideCamera = false;
        }
        // Hide camera toggle button on mobile
        setTimeout(() => {
            const cameraBtn = document.getElementById('camera-toggle-btn');
            if (cameraBtn && this.isMobile) {
                cameraBtn.style.display = 'none';
            }
        }, 100);
    }
    
    setScene(scene) {
        this.scene = scene;
    }
    
    // ============================================================
    // MOBILE HEADER (Avatar, Name, Theme Hamburger)
    // ============================================================
    
    createMobileHeader() {
        // Mobile header and deck area removed per user request
        return;
    }
    
    applyMobileHeaderStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mobile-header {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 60px;
                background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 100%);
                z-index: 10001;
                padding: 8px 12px;
                align-items: center;
                gap: 10px;
                border-bottom: 2px solid rgba(255,215,0,0.3);
            }
            
            @media (max-width: 768px) {
                #mobile-header { display: flex; }
                #player-cube-container { display: none !important; }
                #ui { display: none !important; }
                #camera-toggle-btn { display: none !important; }
                #rules-toggle-btn { display: none !important; }
                #floating-reactions { display: none !important; }
            }
            
            .mobile-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255,255,255,0.1);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                border: 2px solid rgba(255,215,0,0.5);
            }
            
            .mobile-player-name {
                flex: 1;
                color: #ffd700;
                font-weight: bold;
                font-size: 16px;
            }
            
            .mobile-deck-area {
                display: flex;
                align-items: center;
            }
            
            .mobile-deck {
                background: linear-gradient(135deg, #1e3a8a, #1e40af);
                border: 2px solid rgba(100,200,255,0.4);
                border-radius: 10px;
                padding: 6px 14px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s;
                min-width: 72px;
                justify-content: center;
            }
            
            .mobile-deck:hover, .mobile-deck:active {
                transform: scale(1.08);
                border-color: #ffd700;
                box-shadow: 0 0 15px rgba(255,215,0,0.4);
            }
            
            .mobile-deck.draw-ready {
                border-color: #ffd700;
                animation: deckPulse 1.2s ease-in-out infinite;
                box-shadow: 0 0 20px rgba(255,215,0,0.5);
            }
            
            @keyframes deckPulse {
                0%, 100% { 
                    box-shadow: 0 0 10px rgba(255,215,0,0.3);
                    transform: scale(1);
                }
                50% { 
                    box-shadow: 0 0 25px rgba(255,215,0,0.7);
                    transform: scale(1.06);
                }
            }
            
            .deck-icon { font-size: 22px; }
            .deck-count { color: #fff; font-weight: bold; font-size: 15px; }
            
            .mobile-menu-btn {
                width: 40px;
                height: 40px;
                background: rgba(255,255,255,0.1);
                border: none;
                border-radius: 8px;
                color: #fff;
                font-size: 24px;
                cursor: pointer;
            }
            
            /* Mobile Menu Overlay */
            #mobile-menu-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.9);
                z-index: 10002;
                flex-direction: column;
                padding: 20px;
            }
            
            #mobile-menu-overlay.visible { display: flex; }
            
            .mobile-menu-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .mobile-menu-close {
                width: 40px;
                height: 40px;
                background: rgba(255,0,0,0.3);
                border: none;
                border-radius: 50%;
                color: #fff;
                font-size: 24px;
                cursor: pointer;
            }
            
            .mobile-menu-item {
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                padding: 15px 20px;
                margin-bottom: 10px;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 15px;
                cursor: pointer;
            }
            
            .mobile-menu-item:hover { background: rgba(255,255,255,0.2); }
            .mobile-menu-icon { font-size: 24px; }
            .mobile-menu-label { font-size: 16px; }
            
            /* Menu sections */
            .mobile-menu-section {
                margin-bottom: 15px;
                padding: 12px;
                background: rgba(255,255,255,0.05);
                border-radius: 12px;
            }
            .mobile-menu-section-title {
                font-size: 12px;
                color: #888;
                text-transform: uppercase;
                margin-bottom: 10px;
                letter-spacing: 1px;
            }
            .mobile-menu-btn-row {
                display: flex;
                gap: 8px;
            }
            .mobile-menu-btn-small {
                flex: 1;
                padding: 10px;
                background: rgba(52, 152, 219, 0.8);
                border: none;
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
            }
            .mobile-menu-btn-small:active { transform: scale(0.95); }
            
            /* Theme grid */
            .mobile-theme-grid {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            .mobile-theme-btn {
                width: 50px;
                height: 50px;
                font-size: 28px;
                background: rgba(255,255,255,0.1);
                border: 2px solid transparent;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .mobile-theme-btn:active { 
                transform: scale(0.9); 
                border-color: #ffd700;
            }
            
            /* Floating Reaction Bar */
            #reaction-bar {
                display: none;
                position: fixed;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(0,0,0,0.85);
                border-radius: 30px;
                padding: 8px;
                z-index: 9999;
                flex-direction: column;
                gap: 6px;
                border: 2px solid rgba(255,215,0,0.3);
            }
            @media (max-width: 768px) {
                #reaction-bar { display: flex; }
            }
            .reaction-btn {
                width: 44px;
                height: 44px;
                font-size: 24px;
                background: rgba(255,255,255,0.1);
                border: none;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .reaction-btn:active { 
                transform: scale(1.2); 
                background: rgba(255,215,0,0.3);
            }
            
            /* Floating reaction animation */
            .floating-reaction {
                position: fixed;
                font-size: 80px;
                pointer-events: none;
                z-index: 10002;
                animation: floatUp 3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
                text-shadow: 0 6px 20px rgba(0,0,0,0.6);
                filter: drop-shadow(0 0 15px rgba(255,255,255,0.3));
            }
            @keyframes floatUp {
                0% { 
                    opacity: 1; 
                    transform: translateY(0) scale(1) rotate(0deg); 
                }
                15% { 
                    opacity: 1; 
                    transform: translateY(-40px) scale(1.1) rotate(-8deg); 
                }
                30% { 
                    opacity: 1;
                    transform: translateY(-100px) scale(1) rotate(8deg); 
                }
                50% { 
                    opacity: 1;
                    transform: translateY(-160px) scale(1.1) rotate(-5deg); 
                }
                70% { 
                    opacity: 1;
                    transform: translateY(-220px) scale(1.3) rotate(3deg); 
                }
                85% { 
                    opacity: 1;
                    transform: translateY(-260px) scale(2) rotate(0deg); 
                }
                100% { 
                    opacity: 0; 
                    transform: translateY(-300px) scale(2.5) rotate(0deg); 
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    setupMobileMenu() {
        // Create menu overlay
        const overlay = document.createElement('div');
        overlay.id = 'mobile-menu-overlay';
        overlay.innerHTML = `
            <div class="mobile-menu-header">
                <h2 style="color: #fff; margin: 0;">Menu</h2>
                <button class="mobile-menu-close" onclick="window.mobileUI.closeMenu()">✕</button>
            </div>
            
            <!-- Camera Views Section -->
            <div class="mobile-menu-section">
                <div class="mobile-menu-section-title">📷 Camera View</div>
                <div class="mobile-menu-btn-row">
                    <button class="mobile-menu-btn-small" onclick="setCameraView('top'); window.mobileUI.closeMenu();">Top</button>
                    <button class="mobile-menu-btn-small" onclick="setCameraView('angle'); window.mobileUI.closeMenu();">3D</button>
                    <button class="mobile-menu-btn-small" onclick="setCameraView('side'); window.mobileUI.closeMenu();">Side</button>
                </div>
            </div>
            
            <!-- Theme Section -->
            <div class="mobile-menu-section">
                <div class="mobile-menu-section-title">🎨 Theme</div>
                <div class="mobile-theme-grid">
                    <button class="mobile-theme-btn" onclick="setTheme('cosmic'); window.mobileUI.closeMenu();">🌌</button>
                    <button class="mobile-theme-btn" onclick="setTheme('colosseum'); window.mobileUI.closeMenu();">🏛️</button>
                    <button class="mobile-theme-btn" onclick="setTheme('spaceace'); window.mobileUI.closeMenu();">🚀</button>
                    <button class="mobile-theme-btn" onclick="setTheme('undersea'); window.mobileUI.closeMenu();">🐠</button>
                    <button class="mobile-theme-btn" onclick="setTheme('highcontrast'); window.mobileUI.closeMenu();">👁️</button>
                </div>
            </div>
            
            <!-- Rules -->
            <div class="mobile-menu-item" onclick="window.mobileUI.showRules()">
                <span class="mobile-menu-icon">📜</span>
                <span class="mobile-menu-label">Game Rules</span>
            </div>
            
            <!-- Settings -->
            <div class="mobile-menu-item" onclick="window.mobileUI.toggleSound()">
                <span class="mobile-menu-icon">🔊</span>
                <span class="mobile-menu-label">Sound Settings</span>
            </div>
            <div class="mobile-menu-item" onclick="window.mobileUI.showHelp()">
                <span class="mobile-menu-icon">❓</span>
                <span class="mobile-menu-label">How to Play</span>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Create floating reaction bar
        this.createReactionBar();
        
        // Menu button handler
        const menuBtn = document.getElementById('mobile-menu-btn');
        if (menuBtn) {
            menuBtn.onclick = () => this.openMenu();
        }
        
        // Deck click handler
        const deck = document.getElementById('mobile-deck');
        if (deck) {
            deck.onclick = () => {
                if (this.onDeckClick) this.onDeckClick();
            };
        }
    }
    
    openMenu() {
        const overlay = document.getElementById('mobile-menu-overlay');
        if (overlay) overlay.classList.add('visible');
    }
    
    closeMenu() {
        const overlay = document.getElementById('mobile-menu-overlay');
        if (overlay) overlay.classList.remove('visible');
    }
    
    showThemeSelector() {
        this.closeMenu();
        // Trigger theme dropdown
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            // Create mobile-friendly theme selector
            this.showMobileThemeSelector();
        }
    }
    
    showMobileThemeSelector() {
        const themes = [
            { id: 'cosmic', name: '🌌 Cosmic Space' },
            { id: 'colosseum', name: '🏛️ Roman Colosseum' },
            { id: 'spaceace', name: '🚀 Space Ace' },
            { id: 'undersea', name: '🐠 Under the Sea' },
            { id: 'highcontrast', name: '👁️ High Contrast' }
        ];
        
        let html = '<h2 style="color: #fff; margin-bottom: 20px;">Select Theme</h2>';
        themes.forEach(t => {
            html += `<div class="mobile-menu-item" onclick="setTheme('${t.id}'); window.mobileUI.closeMenu();">
                <span class="mobile-menu-label">${t.name}</span>
            </div>`;
        });
        
        const overlay = document.getElementById('mobile-menu-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="mobile-menu-header">
                    <h2 style="color: #fff; margin: 0;">Theme</h2>
                    <button class="mobile-menu-close" onclick="window.mobileUI.closeMenu()">✕</button>
                </div>
                ${html}
            `;
            overlay.classList.add('visible');
        }
    }
    
    toggleSound() {
        this.closeMenu();
        // TODO: Implement sound toggle
        alert('Sound settings coming soon!');
    }
    
    showHelp() {
        this.closeMenu();
        this.showHelpOverlay();
    }
    
    showRules() {
        this.closeMenu();
        this.showRulesOverlay();
    }
    
    showRulesOverlay() {
        const rulesHtml = `
            <div style="max-height: 70vh; overflow-y: auto;">
                <h2 style="color: #ffd700; margin-bottom: 15px;">📜 Game Rules</h2>
                <div style="color: #fff; line-height: 1.8;">
                    <p style="margin-bottom: 12px;"><strong>🎯 Objective:</strong> Move all 5 pegs around the board into your safe zone, then get the 5th peg to the winner hole.</p>
                    
                    <p style="margin-bottom: 8px;"><strong>Card Powers:</strong></p>
                    <ul style="margin-left: 20px; margin-bottom: 12px;">
                        <li>🃏 Ace, Joker, 6 = Enter from holding + extra turn</li>
                        <li>👑 J, Q, K = Move 1 + extra turn + exit bullseye (only these 3!)</li>
                        <li>⬅️ 4 = Move 4 backwards (can't enter FT, bullseye, or safe zone)</li>
                        <li>✂️ 7 = Split between 2 pegs (both clockwise)</li>
                    </ul>
                    
                    <p style="margin-bottom: 8px;"><strong>Special Zones:</strong></p>
                    <ul style="margin-left: 20px; margin-bottom: 12px;">
                        <li>⚡ FastTrack = Shortcut loop if you land exactly</li>
                        <li>🎱 Bullseye = Enter from FT with 1-step card; exit only J/Q/K</li>
                        <li>🛡️ Safe Zone = Cannot be cut, forward only</li>
                        <li>🔥 FT pegs lose status if you move a non-FT peg!</li>
                    </ul>
                    
                    <p style="margin-bottom: 12px;"><strong>💥 Cutting:</strong> Land on opponent = Send them back to holding!</p>
                </div>
            </div>
        `;
        this.showMobileOverlay('Rules', rulesHtml);
    }
    
    showHelpOverlay() {
        const helpHtml = `
            <div style="max-height: 70vh; overflow-y: auto;">
                <h2 style="color: #ffd700; margin-bottom: 15px;">❓ How to Play</h2>
                <div style="color: #fff; line-height: 1.8;">
                    <p style="margin-bottom: 12px;"><strong>1. Draw a Card:</strong> Tap the deck at the top of the screen.</p>
                    <p style="margin-bottom: 12px;"><strong>2. Choose a Move:</strong> If you have multiple options, select from the buttons at the bottom.</p>
                    <p style="margin-bottom: 12px;"><strong>3. Auto-Move:</strong> If there's only one legal move, it happens automatically!</p>
                    <p style="margin-bottom: 12px;"><strong>4. Watch the Action:</strong> The camera follows your peg as it moves.</p>
                    <p style="margin-bottom: 12px;"><strong>5. Win:</strong> Fill your safe zone with 4 pegs, then get the 5th to the winner hole!</p>
                </div>
            </div>
        `;
        this.showMobileOverlay('Help', helpHtml);
    }
    
    showMobileOverlay(title, contentHtml) {
        // Remove existing overlay
        let existing = document.getElementById('mobile-info-overlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'mobile-info-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.95);
            z-index: 20001;
            display: flex;
            flex-direction: column;
            padding: 20px;
        `;
        
        overlay.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="color: #fff; margin: 0;">${title}</h2>
                <button onclick="this.closest('#mobile-info-overlay').remove()" style="
                    width: 40px; height: 40px;
                    background: rgba(255,0,0,0.3);
                    border: none; border-radius: 50%;
                    color: #fff; font-size: 24px;
                    cursor: pointer;
                ">✕</button>
            </div>
            ${contentHtml}
        `;
        
        document.body.appendChild(overlay);
    }

    // ============================================================
    // FLOATING CARD (Always visible corner card)
    // ============================================================
    
    createFloatingCard() {
        const card = document.createElement('div');
        card.id = 'mobile-floating-card';
        card.innerHTML = `
            <div class="floating-card-inner" id="floating-card-inner">
                <div class="card-value" id="floating-card-value">?</div>
            </div>
        `;
        document.body.appendChild(card);
        this.floatingCard = card;
        this.applyFloatingCardStyles();
    }
    
    applyFloatingCardStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mobile-floating-card {
                display: none;
                position: fixed;
                bottom: 140px;
                left: 10px;
                z-index: 10000;
            }
            
            @media (max-width: 768px) {
                #mobile-floating-card.visible { display: block; }
            }
            
            .floating-card-inner {
                width: 60px;
                height: 85px;
                background: linear-gradient(145deg, #fff, #f0f0f5);
                border-radius: 8px;
                border: 3px solid rgba(100,200,255,0.7);
                box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 15px rgba(100,200,255,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                animation: cardGlow 2s ease-in-out infinite;
            }
            
            @keyframes cardGlow {
                0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 15px rgba(100,200,255,0.3); }
                50% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 25px rgba(100,200,255,0.6); }
            }
            
            .card-value {
                font-size: 22px;
                font-weight: bold;
                color: #1a1a2e;
            }
            
            .card-value.red { color: #dc2626; }
        `;
        document.head.appendChild(style);
    }
    
    showFloatingCard(cardText, isRed = false) {
        const valueEl = document.getElementById('floating-card-value');
        if (valueEl) {
            valueEl.textContent = cardText;
            valueEl.className = 'card-value' + (isRed ? ' red' : '');
        }
        if (this.floatingCard) {
            this.floatingCard.classList.add('visible');
        }
        this.currentCard = cardText;
    }
    
    hideFloatingCard() {
        if (this.floatingCard) {
            this.floatingCard.classList.remove('visible');
        }
        this.currentCard = null;
    }
    
    // ============================================================
    // CARD POPUP (Shows move value before executing)
    // ============================================================
    
    createCardPopup() {
        const popup = document.createElement('div');
        popup.id = 'card-move-popup';
        popup.innerHTML = `
            <div class="popup-card" id="popup-card">
                <div class="popup-card-value" id="popup-card-value">7</div>
            </div>
            <div class="popup-info">
                <div class="popup-title" id="popup-title">Move 7 spaces</div>
                <div class="popup-subtitle" id="popup-subtitle">Click OK or wait...</div>
            </div>
            <button class="popup-ok-btn" id="popup-ok-btn">OK</button>
        `;
        document.body.appendChild(popup);
        this.cardPopup = popup;
        this.applyCardPopupStyles();
    }
    
    applyCardPopupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #card-move-popup {
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                background: linear-gradient(145deg, rgba(20,30,50,0.95), rgba(10,15,30,0.98));
                border: 3px solid rgba(255,215,0,0.6);
                border-radius: 20px;
                padding: 25px 35px;
                z-index: 20000;
                text-align: center;
                box-shadow: 0 0 50px rgba(255,215,0,0.3), 0 10px 40px rgba(0,0,0,0.5);
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            #card-move-popup.visible {
                display: block;
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            
            .popup-card {
                width: 80px;
                height: 110px;
                background: linear-gradient(145deg, #fff, #f0f0f5);
                border-radius: 10px;
                border: 3px solid rgba(100,200,255,0.5);
                margin: 0 auto 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            }
            
            .popup-card-value {
                font-size: 32px;
                font-weight: bold;
                color: #1a1a2e;
            }
            
            .popup-card-value.red { color: #dc2626; }
            
            .popup-title {
                font-size: 20px;
                font-weight: bold;
                color: #ffd700;
                margin-bottom: 5px;
            }
            
            .popup-subtitle {
                font-size: 14px;
                color: rgba(255,255,255,0.6);
                margin-bottom: 15px;
            }
            
            .popup-ok-btn {
                background: linear-gradient(135deg, #4ade80, #22c55e);
                border: none;
                border-radius: 25px;
                padding: 12px 40px;
                font-size: 18px;
                font-weight: bold;
                color: #000;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(74,222,128,0.4);
                transition: all 0.2s;
            }
            
            .popup-ok-btn:active {
                transform: scale(0.95);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Show card popup with move info, auto-dismiss after delay
    showCardPopup(cardText, moveCount, isRed = false, onConfirm = null) {
        const popup = document.getElementById('card-move-popup');
        const cardValue = document.getElementById('popup-card-value');
        const title = document.getElementById('popup-title');
        const okBtn = document.getElementById('popup-ok-btn');
        
        // If popup doesn't exist, still call the callback
        if (!popup) {
            console.warn('[MobileUI] Card popup not found, calling callback directly');
            if (onConfirm) setTimeout(onConfirm, 100);
            return;
        }
        
        // Set card value
        if (cardValue) {
            cardValue.textContent = cardText;
            cardValue.className = 'popup-card-value' + (isRed ? ' red' : '');
        }
        
        // Set move description with card rules
        if (title) {
            const rank = (cardText || '').replace(/[^\dAJQKjqk]/gi, '').toUpperCase();
            const rules = {
                'A':     'Enter a peg OR hop 1. Draw again.',
                '2':     'Hop 2 forward.',
                '3':     'Hop 3 forward.',
                '4':     'Hop 4 BACKWARD. FT pegs must exit.',
                '5':     'Hop 5 forward.',
                '6':     'Enter a peg OR hop 6. Draw again.',
                '7':     'Hop 7 — or split between 2 pegs.',
                '8':     'Hop 8 forward.',
                '9':     'Hop 9 forward.',
                '10':    'Hop 10 forward.',
                'J':     'Hop 1. Can exit bullseye → FT. Draw again.',
                'Q':     'Hop 1. Can exit bullseye → FT. Draw again.',
                'K':     'Hop 1. Can exit bullseye → FT. Draw again.',
            };
            title.textContent = rules[rank] || ('Move ' + moveCount + ' spaces');
        }
        
        popup.classList.add('visible');
        
        // OK button handler
        const confirmAndClose = () => {
            popup.classList.remove('visible');
            if (onConfirm) onConfirm();
        };
        
        if (okBtn) {
            okBtn.onclick = confirmAndClose;
        }
        
        // Auto close after 2 seconds if not clicked
        this.popupTimeout = setTimeout(() => {
            confirmAndClose();
        }, 2000);
    }
    
    hideCardPopup() {
        const popup = document.getElementById('card-move-popup');
        if (popup) {
            popup.classList.remove('visible');
        }
        if (this.popupTimeout) {
            clearTimeout(this.popupTimeout);
        }
    }

    // ============================================================
    // SMART AUTO-HIDE SYSTEM
    // Controls disappear during animations, reveal on demand
    // ============================================================
    
    createStatusPill() {
        if (!this.isMobile) return;
        
        const pill = document.createElement('div');
        pill.id = 'mobile-status-pill';
        pill.innerHTML = `
            <div class="pill-content">
                <span class="pill-icon" id="pill-icon">🎴</span>
                <span class="pill-text" id="pill-text">Tap to show controls</span>
            </div>
        `;
        document.body.appendChild(pill);
        this.statusPill = pill;
        this.applyStatusPillStyles();
    }
    
    applyStatusPillStyles() {
        const style = document.createElement('style');
        style.id = 'status-pill-styles';
        style.textContent = `
            #mobile-status-pill {
                display: none;
                position: fixed;
                bottom: calc(env(safe-area-inset-bottom, 0) + 16px);
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: rgba(20, 20, 40, 0.9);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 215, 0, 0.4);
                border-radius: 50px;
                padding: 10px 20px;
                z-index: 10002;
                opacity: 0;
                transition: all 0.3s ease-out;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            }
            
            #mobile-status-pill.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            
            @media (max-width: 768px) {
                #mobile-status-pill { display: block; }
            }
            
            .pill-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .pill-icon {
                font-size: 18px;
            }
            
            .pill-text {
                font-size: 13px;
                color: rgba(255, 255, 255, 0.8);
                white-space: nowrap;
            }
            
            #mobile-status-pill.pulse {
                animation: pillPulse 1.5s ease-in-out infinite;
            }
            
            @keyframes pillPulse {
                0%, 100% { 
                    border-color: rgba(255, 215, 0, 0.4);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                }
                50% { 
                    border-color: rgba(255, 215, 0, 0.8);
                    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3);
                }
            }
            
            /* Auto-hide state for header and action bar */
            #mobile-header.auto-hidden,
            #mobile-action-bar.auto-hidden,
            #mobile-floating-card.auto-hidden,
            #reaction-bar.auto-hidden {
                opacity: 0 !important;
                pointer-events: none !important;
                transform: translateY(20px);
                transition: all 0.3s ease-out;
            }
            
            #mobile-header.auto-hidden {
                transform: translateY(-100%);
            }
            
            /* Mini mode - just shows essential info */
            #mobile-header.mini-mode {
                height: 36px;
                padding: 4px 12px;
                background: rgba(0,0,0,0.6);
            }
            
            #mobile-header.mini-mode .mobile-avatar,
            #mobile-header.mini-mode .mobile-menu-btn {
                width: 28px;
                height: 28px;
                font-size: 16px;
            }
            
            #mobile-header.mini-mode .mobile-player-name {
                font-size: 12px;
            }
            
            #mobile-header.mini-mode .mobile-deck {
                padding: 4px 10px;
                min-width: 50px;
            }
        `;
        document.head.appendChild(style);
    }
    
    createTouchOverlay() {
        if (!this.isMobile) return;
        
        // Create invisible overlay that captures swipe gestures
        const overlay = document.createElement('div');
        overlay.id = 'mobile-gesture-overlay';
        overlay.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 80px;
            z-index: 9999;
            pointer-events: auto;
        `;
        document.body.appendChild(overlay);
        
        this.gestureOverlay = overlay;
        this.setupGestureHandlers(overlay);
    }
    
    setupGestureHandlers(overlay) {
        let touchStartY = 0;
        let touchStartTime = 0;
        
        overlay.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });
        
        overlay.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            const deltaY = touchStartY - touchEndY;
            const deltaTime = Date.now() - touchStartTime;
            
            // Swipe up detection (minimum 50px, maximum 300ms)
            if (deltaY > 50 && deltaTime < 300) {
                this.showControls();
            }
            // Quick tap detection (less than 200ms, minimal movement)
            else if (deltaTime < 200 && Math.abs(deltaY) < 10) {
                this.toggleControls();
            }
            
            this.recordInteraction();
        }, { passive: true });
        
        // Status pill tap handler
        if (this.statusPill) {
            this.statusPill.addEventListener('click', () => {
                this.showControls();
                this.recordInteraction();
            });
        }
    }
    
    setupAutoHideSystem() {
        if (!this.isMobile) return;
        
        // Listen for animation events
        window.addEventListener('mobileui:animation-start', () => this.onAnimationStart());
        window.addEventListener('mobileui:animation-end', () => this.onAnimationEnd());
        window.addEventListener('mobileui:require-input', () => this.onRequireInput());
        window.addEventListener('mobileui:input-complete', () => this.onInputComplete());
        
        // Touch anywhere on screen records interaction
        document.addEventListener('touchstart', () => this.recordInteraction(), { passive: true });
        
        // Start auto-hide timer
        this.resetAutoHideTimer();
    }
    
    recordInteraction() {
        this.lastInteractionTime = Date.now();
        this.resetAutoHideTimer();
    }
    
    resetAutoHideTimer() {
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
        }
        
        // Don't auto-hide if user input is required
        if (this.requiresUserInput) return;
        
        this.autoHideTimeout = setTimeout(() => {
            if (!this.requiresUserInput && !this.isAnimating) {
                this.hideControls();
            }
        }, this.autoHideDelay);
    }
    
    // Called when pegs start moving or events fire
    onAnimationStart() {
        console.log('[MobileUI] Animation started - hiding controls');
        this.isAnimating = true;
        if (!this.requiresUserInput) {
            this.hideControls();
        }
    }
    
    // Called when animations complete
    onAnimationEnd() {
        console.log('[MobileUI] Animation ended');
        this.isAnimating = false;
        
        // If user input is required, show controls
        if (this.requiresUserInput) {
            this.showControls();
        } else {
            // Auto-hide timer handles showing controls when needed
            this.resetAutoHideTimer();
        }
    }
    
    // Called when user must make a choice (multiple moves available)
    onRequireInput() {
        console.log('[MobileUI] User input required - showing controls');
        this.requiresUserInput = true;
        this.showControls();
        // Cancel auto-hide while input is needed
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
        }
    }
    
    // Called when user has made their choice
    onInputComplete() {
        console.log('[MobileUI] User input complete');
        this.requiresUserInput = false;
        this.resetAutoHideTimer();
    }
    
    showControls() {
        this.uiState = 'visible';
        const header = document.getElementById('mobile-header');
        const actionBar = this.actionBar;
        const floatingCard = this.floatingCard;
        const reactionBar = document.getElementById('reaction-bar');
        
        [header, actionBar, floatingCard, reactionBar].forEach(el => {
            if (el) {
                el.classList.remove('auto-hidden', 'mini-mode');
                try { el.style.zIndex = '30010'; } catch(e) {}
            }
        });
        
        // Update body class for CSS targeting
        document.body.classList.remove('controls-hidden');
        
        // Hide status pill
        if (this.statusPill) {
            this.statusPill.classList.remove('visible', 'pulse');
        }
        
        this.resetAutoHideTimer();
    }
    
    hideControls() {
        // Don't hide if user input is required
        if (this.requiresUserInput) return;
        
        this.uiState = 'hidden';
        const header = document.getElementById('mobile-header');
        const actionBar = this.actionBar;
        const floatingCard = this.floatingCard;
        const reactionBar = document.getElementById('reaction-bar');
        
        [header, actionBar, floatingCard, reactionBar].forEach(el => {
            if (el) {
                el.classList.add('auto-hidden');
                try { el.style.zIndex = ''; } catch(e) {}
            }
        });
        
        // Update body class for CSS targeting
        document.body.classList.add('controls-hidden');
        
        // Show status pill
        this.showStatusPill();
    }
    
    toggleControls() {
        if (this.uiState === 'hidden') {
            this.showControls();
        } else {
            this.hideControls();
        }
    }
    
    showStatusPill(text = null) {
        if (!this.statusPill) return;
        
        const pillText = document.getElementById('pill-text');
        const pillIcon = document.getElementById('pill-icon');
        
        if (pillText && text) {
            pillText.textContent = text;
        }
        
        // Update icon based on current state
        if (pillIcon) {
            if (this.currentCard) {
                pillIcon.textContent = this.currentCard;
            } else if (this.requiresUserInput) {
                pillIcon.textContent = '👆';
            } else {
                pillIcon.textContent = '🎴';
            }
        }
        
        this.statusPill.classList.add('visible');
        
        // Pulse if action required
        if (this.requiresUserInput) {
            this.statusPill.classList.add('pulse');
        } else {
            this.statusPill.classList.remove('pulse');
        }
    }
    
    hideStatusPill() {
        if (this.statusPill) {
            this.statusPill.classList.remove('visible', 'pulse');
        }
    }
    
    // Utility: Dispatch animation events from game code
    static dispatchAnimationStart() {
        window.dispatchEvent(new Event('mobileui:animation-start'));
    }
    
    static dispatchAnimationEnd() {
        window.dispatchEvent(new Event('mobileui:animation-end'));
    }
    
    static dispatchRequireInput() {
        window.dispatchEvent(new Event('mobileui:require-input'));
    }
    
    static dispatchInputComplete() {
        window.dispatchEvent(new Event('mobileui:input-complete'));
    }

    // ============================================================
    // PLAYER REACTIONS (Emoji emoticons)
    // ============================================================
    
    createReactionBar() {
        const reactions = [
            { emoji: '😱', name: 'shock' },      // Dismay/shock
            { emoji: '👏', name: 'clap' },       // Well played
            { emoji: '😬', name: 'ouch' },       // That's gotta hurt
            { emoji: '😈', name: 'revenge' },    // Revenge is sweet
            { emoji: '🔥', name: 'fire' },       // Hot play/on fire
            { emoji: '😭', name: 'cry' },        // Crying/devastated
            { emoji: '🎉', name: 'celebrate' },  // Celebration
            { emoji: '💀', name: 'dead' },       // Got destroyed
            { emoji: '👻', name: 'boo' }         // Boo!
        ];
        
        const bar = document.createElement('div');
        bar.id = 'reaction-bar';
        bar.innerHTML = reactions.map(r => 
            `<button class="reaction-btn" data-reaction="${r.name}" title="${r.name}">${r.emoji}</button>`
        ).join('');
        
        document.body.appendChild(bar);
        
        // Click handlers
        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('.reaction-btn');
            if (btn) {
                const reaction = btn.dataset.reaction;
                const emoji = btn.textContent;
                this.sendReaction(emoji, reaction);
            }
        });
    }
    
    sendReaction(emoji, reactionName) {
        console.log('[MobileUI] Sending reaction:', reactionName);
        
        // Play reaction sound effect
        if (window.MusicSubstrate && window.MusicSubstrate.playReactionSound) {
            window.MusicSubstrate.playReactionSound(reactionName);
        }
        
        // Create floating animation
        this.showFloatingReaction(emoji);
        
        // Emit reaction event for multiplayer sync
        if (window.gameStateBroadcaster) {
            window.gameStateBroadcaster.broadcastReaction({
                emoji: emoji,
                name: reactionName,
                playerId: window.gameState?.currentPlayerId || 'local',
                timestamp: Date.now()
            });
        }
        
        // Also trigger local callback if set
        if (this.onReactionSent) {
            this.onReactionSent(emoji, reactionName);
        }
    }
    
    showFloatingReaction(emoji) {
        const el = document.createElement('div');
        el.className = 'floating-reaction';
        el.textContent = emoji;
        
        // Random position across the screen
        const x = 30 + Math.random() * (window.innerWidth - 120);
        const y = window.innerHeight * 0.5 + Math.random() * (window.innerHeight * 0.35);
        
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        
        document.body.appendChild(el);
        
        // Remove after animation completes (3 seconds)
        setTimeout(() => el.remove(), 3000);
    }
    
    // Receive reaction from another player (multiplayer)
    receiveReaction(data) {
        console.log('[MobileUI] Received reaction:', data);
        this.showFloatingReaction(data.emoji);
    }

    // ============================================================
    // ACTION BAR (Bottom move buttons)
    // ============================================================
    
    createActionBar() {
        this.actionBar = document.createElement('div');
        this.actionBar.id = 'mobile-action-bar';
        this.actionBar.style.cssText = `
            display: none;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 100%);
            z-index: 10001;
            padding: 10px;
            border-top: 2px solid rgba(255,215,0,0.3);
            max-height: 120px;
            overflow-x: auto;
            overflow-y: hidden;
        `;
        document.body.appendChild(this.actionBar);
        this.applyActionBarStyles();
    }
    
    applyActionBarStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mobile-action-bar {
                display: none;
                flex-direction: row;
                gap: 10px;
                white-space: nowrap;
            }
            
            @media (max-width: 768px) {
                #mobile-action-bar.has-moves { display: flex; }
            }
            
            .action-button {
                flex: 0 0 auto;
                background: linear-gradient(135deg, #2a2a4e, #1a1a3e);
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 12px;
                padding: 12px 20px;
                color: #fff;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-width: 100px;
            }
            
            .action-button:active {
                transform: scale(0.95);
                background: linear-gradient(135deg, #3a3a5e, #2a2a4e);
            }
            
            .action-button.recommended {
                border-color: #ffd700;
                box-shadow: 0 0 10px rgba(255,215,0,0.3);
            }
            
            .action-type {
                font-size: 24px;
                margin-bottom: 4px;
            }
            
            .action-label {
                font-size: 14px;
                opacity: 0.9;
                font-weight: 500;
            }
            
            .action-peg {
                font-size: 10px;
                opacity: 0.6;
                margin-top: 2px;
            }
        `;
        document.head.appendChild(style);
    }
    
    showMoves(moves, cardInfo = null) {
        this.currentMoves = moves;
        this.actionBar.innerHTML = '';
        
        if (!moves || moves.length === 0) {
            this.actionBar.classList.remove('has-moves');
            // No moves available - signal input complete
            MobileUI.dispatchInputComplete();
            return;
        }
        
        // AUTO-MOVE: If only one legal move on mobile, execute automatically
        if (this.isMobile && this.autoMoveEnabled && moves.length === 1) {
            console.log('[MobileUI] Auto-executing single move');
            // Signal animation is about to start (auto-move)
            MobileUI.dispatchAnimationStart();
            // Slight delay to let card popup show first
            setTimeout(() => {
                if (this.onMoveSelected) {
                    this.onMoveSelected(moves[0]);
                }
            }, 500);
            return; // Don't show action bar for auto-moves
        }
        
        // Multiple moves: user input required
        // Signal that we need user input - show controls
        MobileUI.dispatchRequireInput();
        this.showControls(); // Ensure controls are visible
        
        // Multiple moves: show selection buttons
        moves.forEach((move, index) => {
            const btn = document.createElement('button');
            btn.className = 'action-button';
            if (index === 0) btn.classList.add('recommended');
            
            const icon = this.getMoveIcon(move);
            const label = this.getMoveLabel(move);
            const pegLabel = this.getPegLabel(move);
            
            btn.innerHTML = `
                <span class="action-type">${icon}</span>
                <span class="action-label">${label}</span>
                ${pegLabel ? `<span class="action-peg">${pegLabel}</span>` : ''}
            `;
            
            btn.onclick = () => {
                // Signal input complete and animation starting
                MobileUI.dispatchInputComplete();
                MobileUI.dispatchAnimationStart();
                
                if (this.onMoveSelected) {
                    this.onMoveSelected(move);
                }
            };
            
            this.actionBar.appendChild(btn);
        });
        
        this.actionBar.classList.add('has-moves');
    }
    
    getMoveIcon(move) {
        const type = move.type;
        // Check if move cuts an opponent
        if (move.hasCutTarget || move.cuts) {
            return '⚔️';
        }
        const icons = {
            'enter': '🏠',
            'move': '➡️',
            'bullseye': '🎯',
            'bullseye_exit': '🚀',
            'fasttrack': '⚡',
            'safe': '🛡️',
            'cut': '⚔️'
        };
        // Check destination for special icons
        if (move.toHoleId?.startsWith('safe-')) return '🛡️';
        if (move.toHoleId?.startsWith('ft-')) return '⚡';
        if (move.toHoleId?.startsWith('winner')) return '🏆';
        if (move.toHoleId === 'center') return '🎯';
        
        return icons[type] || '➡️';
    }
    
    getMoveLabel(move) {
        if (move.type === 'enter') return 'Enter Board';
        if (move.type === 'bullseye') return 'To Bullseye';
        if (move.type === 'bullseye_exit') return 'Exit Bullseye';
        if (move.toHoleId?.startsWith('safe-')) return 'Safe Zone';
        if (move.toHoleId?.startsWith('ft-')) return 'FastTrack';
        if (move.toHoleId?.startsWith('winner')) return 'WIN! 🎉';
        if (move.toHoleId === 'center') return 'Bullseye';
        if (move.hasCutTarget || move.cuts) return 'Cut Opponent!';
        return `Move ${move.steps || Math.abs(move.distance) || ''}`;
    }
    
    getPegLabel(move) {
        // Show which peg if multiple pegs have moves
        if (move.pegIndex !== undefined) {
            return `Peg ${move.pegIndex + 1}`;
        }
        return null;
    }
    
    hideMoves() {
        this.currentMoves = [];
        this.actionBar.classList.remove('has-moves');
        this.actionBar.innerHTML = '';
    }
    
    // ============================================================
    // LIGHT PILLARS (3D visual indicators)
    // ============================================================
    
    showLightPillars(moves, scene, playerColor) {
        if (!scene) {
            console.warn('[MobileUI] No scene provided for light pillars');
            return;
        }
        
        this.clearLightPillars();
        this.scene = scene;
        
        const colorHex = typeof playerColor === 'string' 
            ? parseInt(playerColor.replace('#', ''), 16) 
            : playerColor;
        
        moves.forEach(move => {
            const holeId = move.toHoleId;
            if (!holeId) return;
            
            const hole = window.holeRegistry?.get(holeId);
            if (!hole || !hole.mesh) return;
            
            const pillar = this.createLightPillar(hole.mesh.position, colorHex);
            this.lightPillars.push(pillar);
            scene.add(pillar);
        });
    }
    
    createLightPillar(position, color = 0xffd700) {
        // Create a group for the pillar
        const group = new THREE.Group();
        group.position.copy(position);
        
        // Main beam (cylinder)
        const beamGeometry = new THREE.CylinderGeometry(8, 12, 150, 16);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.y = 75;
        group.add(beam);
        
        // Inner glow (smaller, brighter cylinder)
        const glowGeometry = new THREE.CylinderGeometry(4, 6, 150, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = 75;
        group.add(glow);
        
        // Particle ring at base
        const ringGeometry = new THREE.RingGeometry(15, 20, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 2;
        group.add(ring);
        
        // Add animation data
        group.userData = {
            isLightPillar: true,
            animTime: 0,
            baseOpacity: 0.4
        };
        
        return group;
    }
    
    animateLightPillars() {
        const time = Date.now() * 0.003;
        
        this.lightPillars.forEach(pillar => {
            if (pillar.userData.isLightPillar) {
                // Pulse opacity
                const pulse = 0.3 + Math.sin(time) * 0.2;
                pillar.children.forEach(child => {
                    if (child.material) {
                        child.material.opacity = child.material.userData?.baseOpacity || pulse;
                    }
                });
                
                // Rotate ring
                const ring = pillar.children[2];
                if (ring) {
                    ring.rotation.z = time * 0.5;
                }
            }
        });
    }
    
    clearLightPillars() {
        this.lightPillars.forEach(pillar => {
            if (this.scene) {
                this.scene.remove(pillar);
            }
            pillar.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        this.lightPillars = [];
    }
    
    // ============================================================
    // UPDATE METHODS
    // ============================================================
    
    updatePlayerInfo(playerName, avatar, deckCount, colorHex) {
        const nameEl = document.getElementById('mobile-player-name');
        const avatarEl = document.getElementById('mobile-avatar');
        const deckCountEl = document.getElementById('mobile-deck-count');
        
        if (nameEl) nameEl.textContent = playerName || 'Your Turn';
        if (avatarEl) avatarEl.textContent = avatar || '👤';
        if (deckCountEl) deckCountEl.textContent = deckCount || '?';
        
        if (colorHex && avatarEl) {
            avatarEl.style.borderColor = colorHex;
        }
    }
    
    // Pulse the deck to signal it's time to draw
    setDeckDrawReady(ready) {
        const deck = document.getElementById('mobile-deck');
        if (!deck) return;
        if (ready) {
            deck.classList.add('draw-ready');
        } else {
            deck.classList.remove('draw-ready');
        }
    }
    
    // Callbacks
    onDeckClick = null;
}

// Export
if (typeof window !== 'undefined') {
    window.MobileUI = MobileUI;
}
