/**
 * 🃏 CARD RENDERER
 * Creates realistic playing card visuals with player-colored backs.
 * Cards have proper suits, face cards with illustrations, and decorative backs.
 */

const CardRenderer = {
    // Card dimensions (standard poker ratio 2.5:3.5)
    WIDTH: 120,
    HEIGHT: 168,
    CORNER_RADIUS: 8,
    
    // Suit symbols and colors
    SUITS: {
        hearts: { symbol: '♥', color: '#e63946', name: 'Hearts' },
        diamonds: { symbol: '♦', color: '#e63946', name: 'Diamonds' },
        clubs: { symbol: '♣', color: '#1d3557', name: 'Clubs' },
        spades: { symbol: '♠', color: '#1d3557', name: 'Spades' }
    },
    
    // Card values
    VALUES: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    
    // Face card emoji portraits
    FACE_PORTRAITS: {
        J: '🤴', // Prince/Jack
        Q: '👸', // Queen  
        K: '👑'  // King (crown represents king)
    },
    
    // Joker design
    JOKER_EMOJI: '🃏',
    
    /**
     * Create a card face element
     * @param {string} value - Card value (A, 2-10, J, Q, K, Joker)
     * @param {string} suit - Suit name (hearts, diamonds, clubs, spades) or null for Joker
     * @returns {HTMLElement} Card face element
     */
    createCardFace(value, suit) {
        const card = document.createElement('div');
        card.className = 'playing-card card-face';
        
        const isJoker = value === 'Joker' || !suit;
        const isFaceCard = ['J', 'Q', 'K'].includes(value);
        const suitData = this.SUITS[suit] || { symbol: '', color: '#333' };
        
        card.style.cssText = `
            width: ${this.WIDTH}px;
            height: ${this.HEIGHT}px;
            background: linear-gradient(145deg, #ffffff 0%, #f8f8f8 50%, #eeeeee 100%);
            border-radius: ${this.CORNER_RADIUS}px;
            border: 2px solid #ccc;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8);
            position: relative;
            font-family: 'Georgia', serif;
            color: ${suitData.color};
            overflow: hidden;
        `;
        
        if (isJoker) {
            card.innerHTML = this._renderJoker();
        } else if (isFaceCard) {
            card.innerHTML = this._renderFaceCard(value, suitData);
        } else {
            card.innerHTML = this._renderNumberCard(value, suitData);
        }
        
        return card;
    },
    
    /**
     * Create a card back element with player color
     * @param {string} playerColor - Hex color for the card back
     * @returns {HTMLElement} Card back element
     */
    createCardBack(playerColor = '#1a5f7a') {
        const card = document.createElement('div');
        card.className = 'playing-card card-back';
        
        // Create decorative pattern
        card.style.cssText = `
            width: ${this.WIDTH}px;
            height: ${this.HEIGHT}px;
            background: ${playerColor};
            border-radius: ${this.CORNER_RADIUS}px;
            border: 3px solid #fff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            position: relative;
            overflow: hidden;
        `;
        
        // Inner decorative frame
        card.innerHTML = `
            <div style="
                position: absolute;
                top: 6px; left: 6px; right: 6px; bottom: 6px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 4px;
            "></div>
            <div style="
                position: absolute;
                top: 12px; left: 12px; right: 12px; bottom: 12px;
                background: repeating-linear-gradient(
                    45deg,
                    transparent,
                    transparent 5px,
                    rgba(255,255,255,0.1) 5px,
                    rgba(255,255,255,0.1) 10px
                );
                border-radius: 2px;
            "></div>
            <div style="
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                font-size: 2.5rem;
                opacity: 0.4;
            ">⚡</div>
            <div style="
                position: absolute;
                bottom: 8px; right: 8px;
                font-size: 0.6rem;
                color: rgba(255,255,255,0.5);
                font-family: sans-serif;
            ">FAST TRACK</div>
        `;
        
        return card;
    },
    
    // Render joker card content
    _renderJoker() {
        return `
            <div style="position: absolute; top: 8px; left: 10px; font-size: 1rem; font-weight: bold; color: #9333ea;">JOKER</div>
            <div style="position: absolute; bottom: 8px; right: 10px; font-size: 1rem; font-weight: bold; color: #9333ea; transform: rotate(180deg);">JOKER</div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 4rem;">🃏</div>
            <div style="position: absolute; top: 30%; left: 50%; transform: translateX(-50%); font-size: 1.5rem;">✨</div>
            <div style="position: absolute; bottom: 30%; left: 50%; transform: translateX(-50%); font-size: 1.5rem;">✨</div>
        `;
    },
    
    // Render face card (J, Q, K)
    _renderFaceCard(value, suitData) {
        const portrait = this.FACE_PORTRAITS[value];
        return `
            <div style="position: absolute; top: 6px; left: 8px; font-size: 1.4rem; font-weight: bold; line-height: 1;">${value}<br><span style="font-size: 1.2rem;">${suitData.symbol}</span></div>
            <div style="position: absolute; bottom: 6px; right: 8px; font-size: 1.4rem; font-weight: bold; line-height: 1; transform: rotate(180deg);">${value}<br><span style="font-size: 1.2rem;">${suitData.symbol}</span></div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 4.5rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">${portrait}</div>
            <div style="position: absolute; top: 20%; left: 15%; font-size: 1.2rem;">${suitData.symbol}</div>
            <div style="position: absolute; bottom: 20%; right: 15%; font-size: 1.2rem;">${suitData.symbol}</div>
        `;
    },
    
    // Render number card (A, 2-10)
    _renderNumberCard(value, suitData) {
        const count = value === 'A' ? 1 : parseInt(value) || 1;
        const pips = this._generatePipLayout(count, suitData.symbol);
        return `
            <div style="position: absolute; top: 6px; left: 8px; font-size: 1.4rem; font-weight: bold; line-height: 1;">${value}<br><span style="font-size: 1.2rem;">${suitData.symbol}</span></div>
            <div style="position: absolute; bottom: 6px; right: 8px; font-size: 1.4rem; font-weight: bold; line-height: 1; transform: rotate(180deg);">${value}<br><span style="font-size: 1.2rem;">${suitData.symbol}</span></div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60%; height: 70%; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; align-content: space-around;">
                ${pips}
            </div>
        `;
    },

    // Generate pip layout for number cards
    _generatePipLayout(count, symbol) {
        const pipSize = count > 6 ? '1.3rem' : count > 3 ? '1.5rem' : '2rem';
        const pip = `<span style="font-size: ${pipSize}; margin: 2px;">${symbol}</span>`;

        // Ace is special - large center symbol
        if (count === 1) {
            return `<span style="font-size: 4rem;">${symbol}</span>`;
        }

        // Simple grid layout for 2-10
        return pip.repeat(count);
    },

    /**
     * Render a FastTrack game card (simplified - just value matters)
     * @param {number|string} value - Card value (1-13, or 'start')
     * @param {string} playerColor - Player's color for the back
     * @param {boolean} faceUp - Whether card is face up
     * @returns {HTMLElement} Card element
     */
    createGameCard(value, playerColor = '#1a5f7a', faceUp = true) {
        if (!faceUp) {
            return this.createCardBack(playerColor);
        }

        // Map game values to card display
        const gameValue = parseInt(value);
        let displayValue, suit;

        if (value === 'start' || value === 'sorry') {
            // Special start/sorry card
            return this._createSpecialCard('START', playerColor);
        } else if (gameValue === 1) {
            displayValue = 'A';
            suit = 'spades';
        } else if (gameValue === 11) {
            displayValue = 'J';
            suit = 'hearts';
        } else if (gameValue === 12) {
            displayValue = 'Q';
            suit = 'diamonds';
        } else if (gameValue === 13) {
            displayValue = 'K';
            suit = 'clubs';
        } else if (gameValue >= 2 && gameValue <= 10) {
            displayValue = String(gameValue);
            // Vary suits based on value for visual variety
            const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
            suit = suits[gameValue % 4];
        } else {
            // Unknown - render as joker
            displayValue = 'Joker';
            suit = null;
        }

        return this.createCardFace(displayValue, suit);
    },

    // Create special game cards (Start, Sorry)
    _createSpecialCard(type, playerColor) {
        const card = document.createElement('div');
        card.className = 'playing-card card-special';
        card.style.cssText = `
            width: ${this.WIDTH}px;
            height: ${this.HEIGHT}px;
            background: linear-gradient(135deg, ${playerColor} 0%, ${this._darkenColor(playerColor)} 100%);
            border-radius: ${this.CORNER_RADIUS}px;
            border: 3px solid #FFD700;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 0 20px rgba(255,255,255,0.2);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: #fff;
            font-family: 'Arial Black', sans-serif;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;
        card.innerHTML = `
            <div style="font-size: 2.5rem; margin-bottom: 10px;">🚀</div>
            <div style="font-size: 1.5rem; font-weight: bold;">${type}</div>
        `;
        return card;
    },

    // Darken a hex color
    _darkenColor(hex) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, (num >> 16) - 40);
        const g = Math.max(0, ((num >> 8) & 0x00FF) - 40);
        const b = Math.max(0, (num & 0x0000FF) - 40);
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
    }
};

// Export
window.CardRenderer = CardRenderer;
console.log('🃏 CardRenderer loaded');

