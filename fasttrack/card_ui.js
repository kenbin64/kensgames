/**
 * Fastrack! Card UI Component
 * Displays cards and provides draw/discard interactions
 */

class CardUI {
    constructor(containerId = 'card-container') {
        console.log('[CardUI] Constructor called');
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.log('[CardUI] Container not found, creating...');
            this.createContainer();
        }
        this.currentCard = null;
        this.onDrawClick = null;
        this.playerCount = 4; // Default, will be updated
        this.activePlayerIndex = 0;
        this.playerColors = [];
        this.init();
        console.log('[CardUI] Initialization complete');
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'card-container';
        this.container.className = 'card-ui-container';
        document.body.appendChild(this.container);
    }

    // Set up player decks with colors
    setPlayers(players) {
        this.playerCount = players.length;
        this.playerColors = players.map(p => '#' + p.color.toString(16).padStart(6, '0'));
        this.playerNames = players.map((p, i) => p.name || ['Red', 'Teal', 'Violet', 'Gold', 'Azure', 'Pink'][i] || 'P' + (i+1));
        this.playerDeckCounts = players.map(p => p.deck?.remaining || 54);
        this.renderDecks();
    }

    // Render a unified deck area - single deck position for all players
    // Each player has their own independent deck, but they all draw from the same screen position
    renderDecks() {
        const deckContainer = document.getElementById('player-decks-container');
        if (!deckContainer) return;
        
        deckContainer.innerHTML = '';
        
        // Get current player's color and info
        const color = this.playerColors[this.activePlayerIndex] || '#ffd700';
        const playerName = this.playerNames?.[this.activePlayerIndex] || 'Player ' + (this.activePlayerIndex + 1);
        const deckCount = this.playerDeckCounts?.[this.activePlayerIndex] || 54;
        
        // Single unified deck - shows current player's deck with card back pattern
        const dark = this.darkenColor(color, 0.3);
        const cardBackPattern = `
            background: linear-gradient(135deg, ${dark}, ${color});
            background-image:
                repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.08) 5px, rgba(255,255,255,0.08) 10px),
                repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.1) 10px);
        `;
        const deckHtml = `
            <div class="unified-deck-wrapper">
                <div class="deck-stack unified-deck" id="unified-deck-stack" 
                     style="--deck-color: ${color};">
                    <div class="card card-back-player" style="${cardBackPattern}"></div>
                    <div class="card card-back-player" style="${cardBackPattern} top: 2px; left: 2px;"></div>
                    <div class="card card-back-player" style="${cardBackPattern} top: 4px; left: 4px;">
                        <div class="card-back-diamond" style="border-color: ${color};"></div>
                    </div>
                    <div class="draw-indicator">?</div>
                </div>
                <div class="deck-count" id="unified-deck-count">${deckCount}</div>
            </div>
        `;
        deckContainer.insertAdjacentHTML('beforeend', deckHtml);
        
        // Add click handler to unified deck
        const deckEl = document.getElementById('unified-deck-stack');
        if (deckEl) {
            deckEl.addEventListener('click', () => {
                if (this.onDrawClick) {
                    this.onDrawClick();
                }
            });
        }
    }

    // Helper to darken a color
    darkenColor(hex, factor) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
    }

    init() {
        this.container.innerHTML = `
            <div class="card-ui">
                <div class="action-banner" id="action-banner" style="display: none;">
                    <span class="action-text" id="action-text">Your turn!</span>
                </div>
                <div class="player-decks-container" id="player-decks-container">
                    <!-- Player decks will be rendered here -->
                </div>
                <div class="drawn-card-area" id="drawn-card-area">
                    <div class="card card-placeholder">
                        <span>Click your deck (?) to draw</span>
                    </div>
                </div>
                <div class="game-info">
                    <div class="turn-indicator" id="turn-indicator">
                        <span class="player-color" id="current-player-color"></span>
                        <span id="current-player-name">Player 1</span>'s turn
                    </div>
                    <div class="turn-count" id="turn-count">Turn 1</div>
                </div>
            </div>
        `;

        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('card-ui-styles')) return;

        const style = document.createElement('style');
        style.id = 'card-ui-styles';
        style.textContent = `
            .card-ui-container {
                display: none !important;
            }

            .card-ui {
                display: flex;
                align-items: center;
                gap: 30px;
                background: rgba(0, 0, 0, 0.8);
                padding: 20px 30px;
                border-radius: 15px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                flex-wrap: wrap;
                justify-content: center;
            }

            .action-banner {
                width: 100%;
                text-align: center;
                padding: 10px 20px;
                margin-bottom: 10px;
                border-radius: 10px;
                background: linear-gradient(135deg, rgba(74, 222, 128, 0.3), rgba(34, 197, 94, 0.3));
                border: 2px solid #4ade80;
                animation: bannerPulse 1.5s ease-in-out infinite;
            }

            .action-banner.warning {
                background: linear-gradient(135deg, rgba(255, 170, 0, 0.3), rgba(255, 136, 0, 0.3));
                border-color: #ffaa00;
            }

            .action-banner.select {
                background: linear-gradient(135deg, rgba(147, 51, 234, 0.3), rgba(168, 85, 247, 0.3));
                border-color: #9333ea;
            }

            @keyframes bannerPulse {
                0%, 100% { opacity: 0.9; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.02); }
            }

            .action-text {
                color: #fff;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 0 0 10px currentColor;
            }

            .deck-area {
                position: relative;
                cursor: pointer;
            }

            .player-decks-container {
                display: flex;
                gap: 15px;
                align-items: flex-end;
                justify-content: center;
            }

            .unified-deck-wrapper {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
            }

            .unified-deck-label {
                display: none;
            }

            .unified-deck {
                width: 120px;
                height: 180px;
            }

            .unified-deck .card {
                width: 120px;
                height: 180px;
            }

            .player-deck-wrapper {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
            }

            .player-deck-label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
            }

            .deck-stack {
                position: relative;
                width: 120px;
                height: 180px;
                cursor: pointer;
                transition: transform 0.2s, opacity 0.2s;
            }

            .player-deck {
                width: 60px;
                height: 90px;
            }

            .player-deck .card {
                width: 60px;
                height: 90px;
            }

            .deck-stack:hover {
                transform: scale(1.08);
            }

            .deck-stack:hover .card {
                box-shadow: 0 0 30px rgba(255, 215, 0, 0.7);
            }

            .draw-indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 56px;
                font-weight: bold;
                color: white;
                text-shadow: 0 0 15px black, 0 0 25px black, 0 0 40px var(--deck-color, gold);
                animation: pulseIndicator 1s ease-in-out infinite;
                pointer-events: none;
                z-index: 10;
            }

            @keyframes pulseIndicator {
                0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
                50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            }

            .deck-count {
                position: absolute;
                bottom: -25px;
                left: 50%;
                transform: translateX(-50%);
                color: #888;
                font-size: 12px;
            }

            .card {
                position: absolute;
                width: 120px;
                height: 180px;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
                transition: all 0.3s ease;
            }

            .card-back {
                background: linear-gradient(135deg, #1a1a6e, #4a0080);
                border: 2px solid #ffd700;
            }

            .card-back-player {
                border: 2px solid rgba(255, 255, 255, 0.8);
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(255, 255, 255, 0.2);
            }

            .card-back-diamond {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 45px;
                height: 45px;
                transform: translate(-50%, -50%) rotate(45deg);
                border: 3px solid rgba(255, 255, 255, 0.6);
                border-radius: 4px;
                pointer-events: none;
            }

            .card-back-diamond::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 21px;
                height: 21px;
                transform: translate(-50%, -50%);
                border: 2px solid rgba(255, 255, 255, 0.4);
                border-radius: 3px;
            }

            .card-back:nth-child(1), .card-back-player:nth-child(1) { top: 0; left: 0; }
            .card-back:nth-child(2), .card-back-player:nth-child(2) { top: 2px; left: 2px; }
            .card-back:nth-child(3), .card-back-player:nth-child(3) { top: 4px; left: 4px; }

            .drawn-card-area {
                min-width: 100px;
                min-height: 140px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .card-placeholder {
                background: rgba(255, 255, 255, 0.1);
                border: 2px dashed rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #666;
                font-size: 12px;
                text-align: center;
                padding: 10px;
            }

            .card-face {
                background: white;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 8px;
                box-sizing: border-box;
            }

            .card-corner {
                display: flex;
                flex-direction: column;
                align-items: center;
                line-height: 1;
            }

            .card-corner.bottom {
                align-self: flex-end;
                transform: rotate(180deg);
            }

            .card-rank {
                font-size: 18px;
                font-weight: bold;
            }

            .card-suit {
                font-size: 14px;
            }

            .card-center {
                font-size: 40px;
                text-align: center;
            }

            .suit-hearts, .suit-diamonds {
                color: #d00;
            }

            .suit-clubs, .suit-spades {
                color: #000;
            }

            .card-joker {
                background: linear-gradient(135deg, #ffd700, #ff6b6b, #4ecdc4, #45b7d1);
                color: #000;
                font-weight: bold;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }

            .game-info {
                display: flex;
                flex-direction: column;
                gap: 5px;
                color: white;
                min-width: 150px;
            }

            .turn-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 16px;
            }

            .player-color {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid white;
            }

            .turn-count {
                color: #888;
                font-size: 12px;
            }

            .card-highlight {
                animation: cardGlow 1s ease-in-out infinite alternate;
            }

            @keyframes cardGlow {
                from { box-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
                to { box-shadow: 0 0 30px rgba(255, 215, 0, 1); }
            }

            .extra-turn-badge {
                position: absolute;
                top: -10px;
                right: -10px;
                background: #ffd700;
                color: #000;
                font-size: 10px;
                font-weight: bold;
                padding: 3px 8px;
                border-radius: 10px;
                animation: pulse 0.5s ease-in-out infinite alternate;
            }

            @keyframes pulse {
                from { transform: scale(1); }
                to { transform: scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }

    // Show drawn card
    showCard(card) {
        this.currentCard = card;
        const area = document.getElementById('drawn-card-area');
        
        // Map card ranks to icons
        const cardIcons = {
            'JOKER': '🃏',
            'A': '🅰️',
            'J': '🤴',
            'Q': '👸',
            'K': '👑'
        };
        
        const displayRank = cardIcons[card.rank] || card.rank;
        
        if (card.rank === 'JOKER') {
            area.innerHTML = `
                <div class="card card-face card-joker card-highlight">
                    <div>${cardIcons['JOKER']}</div>
                    <div>JOKER</div>
                    ${card.extraTurn ? '<div class="extra-turn-badge">+1 TURN</div>' : ''}
                </div>
            `;
        } else {
            const suitSymbols = {
                hearts: '♥',
                diamonds: '♦',
                clubs: '♣',
                spades: '♠'
            };
            const suitClass = `suit-${card.suit}`;
            
            area.innerHTML = `
                <div class="card card-face card-highlight" style="position: relative;">
                    <div class="card-corner ${suitClass}">
                        <span class="card-rank">${displayRank}</span>
                        <span class="card-suit">${suitSymbols[card.suit]}</span>
                    </div>
                    <div class="card-center ${suitClass}">${suitSymbols[card.suit]}</div>
                    <div class="card-corner bottom ${suitClass}">
                        <span class="card-rank">${displayRank}</span>
                        <span class="card-suit">${suitSymbols[card.suit]}</span>
                    </div>
                    ${card.extraTurn ? '<div class="extra-turn-badge">+1 TURN</div>' : ''}
                </div>
            `;
        }
    }

    // Clear drawn card
    clearCard() {
        this.currentCard = null;
        const area = document.getElementById('drawn-card-area');
        area.innerHTML = `
            <div class="card card-placeholder">
                <span>Click your deck (?) to draw</span>
            </div>
        `;
    }

    // Update deck count for a specific player or current active player
    updateDeckCount(count, playerIndex = null) {
        const idx = playerIndex !== null ? playerIndex : this.activePlayerIndex;
        // Update internal tracking
        if (this.playerDeckCounts && idx >= 0 && idx < this.playerDeckCounts.length) {
            this.playerDeckCounts[idx] = count;
        }
        // Update unified deck display if this is the active player
        if (idx === this.activePlayerIndex) {
            const el = document.getElementById('unified-deck-count');
            if (el) {
                el.textContent = count;
            }
        }
    }

    // Update all player deck counts
    updateAllDeckCounts(players) {
        // Update internal tracking
        this.playerDeckCounts = players.map(p => p.deck?.remaining || 0);
        // Update unified deck display for current player
        const el = document.getElementById('unified-deck-count');
        if (el && players[this.activePlayerIndex]?.deck) {
            el.textContent = players[this.activePlayerIndex].deck.remaining;
        }
    }

    // Set active player - update unified deck to show their color/info
    setActivePlayer(playerIndex) {
        this.activePlayerIndex = playerIndex;
        // Re-render to update the unified deck's appearance
        this.renderDecks();
    }

    // Update current player
    updateCurrentPlayer(player) {
        const nameEl = document.getElementById('current-player-name');
        const colorEl = document.getElementById('current-player-color');
        if (nameEl) nameEl.textContent = player.name;
        if (colorEl) colorEl.style.backgroundColor = '#' + player.color.toString(16).padStart(6, '0');
    }

    // Update turn count
    updateTurnCount(turn) {
        const turnEl = document.getElementById('turn-count');
        if (turnEl) turnEl.textContent = `Turn ${turn}`;
    }

    // Show message
    showMessage(message, duration = 2000) {
        const msg = document.createElement('div');
        msg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
            z-index: 2000;
            animation: fadeInOut ${duration}ms ease-in-out;
        `;
        msg.textContent = message;
        document.body.appendChild(msg);
        
        setTimeout(() => msg.remove(), duration);
    }

    // Disable/enable deck clicking for active player
    setDeckEnabled(enabled) {
        const deck = document.getElementById('unified-deck-stack');
        if (deck) {
            deck.style.pointerEvents = enabled ? 'auto' : 'none';
            deck.style.opacity = enabled ? '1' : '0.6';
            
            // Update question mark visibility
            const indicator = deck.querySelector('.draw-indicator');
            if (indicator) {
                indicator.style.display = enabled ? 'block' : 'none';
            }
        }
    }

    // Show action banner with message
    showActionBanner(message, type = 'default') {
        const banner = document.getElementById('action-banner');
        const text = document.getElementById('action-text');
        if (banner && text) {
            text.textContent = message;
            banner.className = 'action-banner';
            if (type === 'warning') banner.classList.add('warning');
            if (type === 'select') banner.classList.add('select');
            banner.style.display = 'block';
        }
    }

    // Hide action banner
    hideActionBanner() {
        const banner = document.getElementById('action-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }
    
    // Flash the unified deck to show a card was drawn
    flashDeck(playerIndex = null) {
        const deck = document.getElementById('unified-deck-stack');
        if (deck) {
            deck.style.transition = 'transform 0.15s ease-out, box-shadow 0.15s ease-out';
            deck.style.transform = 'scale(1.15)';
            deck.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.8)';
            setTimeout(() => {
                deck.style.transform = 'scale(1)';
                deck.style.boxShadow = '';
            }, 300);
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.CardUI = CardUI;
}
