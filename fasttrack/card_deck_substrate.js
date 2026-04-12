/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK CARD DECK SUBSTRATE
 * ButterflyFX Manifold Pattern - Playing Card System
 * ============================================================
 * 
 * SINGLE DRAW CARD RULES:
 * 
 * MOVEMENT CARDS:
 * - Joker, Jack, Queen, King, Ace: ALL are 1-move cards (clockwise)
 * - 2-10: Move their numeric value (clockwise)
 * - 4: Move 4 spaces BACKWARD (counter-clockwise)
 * 
 * ENTRY CARDS (can take token from holding to home hole):
 * - Ace, Joker, 6
 * - 6 does NOT get 6 moves when entering (just places on home)
 * 
 * PLAY AGAIN CARD:
 * - 6 is a play again card (draw again after move)
 * 
 * SPLIT CARD:
 * - 7 can split moves between 2 tokens (if 2+ tokens in play)
 * 
 * ROYAL CARDS (can exit center bullseye):
 * - Jack, Queen, King: Only way to leave center hole
 * - Token goes to player's fast track hole
 * 
 * RESTRICTIONS:
 * - Cannot overtake or land on your own token
 * - 4 cannot back into: fast track, center hole, or safe zone
 * - Cannot pass without legal move (no passing allowed)
 * - Must land EXACTLY on winner hole
 * ============================================================
 */

const CardDeckSubstrate = {
    version: '2.0.0',
    name: 'FastTrack Card Deck',
    
    // Suits
    SUITS: ['hearts', 'diamonds', 'clubs', 'spades'],
    SUIT_SYMBOLS: {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠',
        joker: '🃏'
    },
    SUIT_COLORS: {
        hearts: '#e94560',
        diamonds: '#e94560',
        clubs: '#1a1a2e',
        spades: '#1a1a2e',
        joker: '#9333ea'
    },
    
    // Card values (including Joker)
    VALUES: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    
    // ============================================================
    // CARD DEFINITIONS - FastTrack Official Rules
    // ============================================================
    CARD_RULES: {
        'A': {
            value: 1,
            moves: 1,           // 1 space clockwise
            direction: 'clockwise',
            canEnter: true,     // Can bring token from holding to home hole
            replay: false,
            isRoyal: false,
            description: 'Move 1 space OR enter a token'
        },
        '2': {
            value: 2,
            moves: 2,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            description: 'Move 2 spaces'
        },
        '3': {
            value: 3,
            moves: 3,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            description: 'Move 3 spaces'
        },
        '4': {
            value: 4,
            moves: 4,
            direction: 'backward',  // Move BACKWARD
            canEnter: false,
            replay: false,
            cannotEnterFastTrack: true,
            cannotEnterCenter: true,
            cannotEnterSafeZone: true,
            cannotEnterWinner: true,
            description: 'Move 4 spaces BACKWARD'
        },
        '5': {
            value: 5,
            moves: 5,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            description: 'Move 5 spaces'
        },
        '6': {
            value: 6,
            moves: 6,
            direction: 'clockwise',
            canEnter: true,     // Can bring token from holding to home hole
            enterMoves: 0,      // NO moves when entering, just place on home
            replay: true,       // PLAY AGAIN - draw another card!
            description: 'Move 6 spaces OR enter a token, then PLAY AGAIN'
        },
        '7': {
            value: 7,
            moves: 7,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            split: true,        // Can split between 2 different tokens
            splitRequires: 2,   // Requires at least 2 tokens in play
            description: 'Move 7 spaces (can SPLIT between 2 tokens)'
        },
        '8': {
            value: 8,
            moves: 8,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            description: 'Move 8 spaces'
        },
        '9': {
            value: 9,
            moves: 9,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            description: 'Move 9 spaces'
        },
        '10': {
            value: 10,
            moves: 10,
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            description: 'Move 10 spaces'
        },
        'J': {
            value: 11,
            moves: 1,           // Only 1 move!
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            isRoyal: true,      // Can exit center bullseye
            canExitCenter: true,
            description: 'Move 1 space (ROYAL - can exit center)'
        },
        'Q': {
            value: 12,
            moves: 1,           // Only 1 move!
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            isRoyal: true,      // Can exit center bullseye
            canExitCenter: true,
            description: 'Move 1 space (ROYAL - can exit center)'
        },
        'K': {
            value: 13,
            moves: 1,           // Only 1 move!
            direction: 'clockwise',
            canEnter: false,
            replay: false,
            isRoyal: true,      // Can exit center bullseye
            canExitCenter: true,
            description: 'Move 1 space (ROYAL - can exit center)'
        },
        'JOKER': {
            value: 0,
            moves: 1,           // 1 move
            direction: 'clockwise',
            canEnter: true,     // Can bring token from holding to home hole
            replay: false,
            isWild: true,
            description: 'Move 1 space OR enter a token (WILD)'
        }
    },
    
    // ============================================================
    // DECK STATE
    // ============================================================
    
    // Full deck template (52 cards + 2 Jokers = 54 cards)
    createFullDeck: function() {
        const deck = [];
        
        // Add standard 52 cards
        for (const suit of this.SUITS) {
            for (const value of this.VALUES) {
                deck.push({
                    id: `${value}_${suit}`,
                    value: value,
                    suit: suit,
                    symbol: this.SUIT_SYMBOLS[suit],
                    color: this.SUIT_COLORS[suit],
                    rules: this.CARD_RULES[value]
                });
            }
        }
        
        // Add 2 Jokers
        for (let i = 1; i <= 2; i++) {
            deck.push({
                id: `JOKER_${i}`,
                value: 'JOKER',
                suit: 'joker',
                symbol: this.SUIT_SYMBOLS.joker,
                color: this.SUIT_COLORS.joker,
                rules: this.CARD_RULES['JOKER']
            });
        }
        
        console.log(`Deck created: ${deck.length} cards (52 + 2 Jokers)`);
        return deck;
    },
    
    // ============================================================
    // SHUFFLE ALGORITHM (Fisher-Yates)
    // ============================================================
    
    shuffle: function(deck) {
        const shuffled = [...deck];
        const len = shuffled.length;
        
        // Use crypto.getRandomValues for cryptographically secure random shuffle
        // This ensures every game has a unique deck order
        const cryptoArray = new Uint32Array(len);
        crypto.getRandomValues(cryptoArray);
        
        // Fisher-Yates shuffle with crypto-random values
        for (let i = len - 1; i > 0; i--) {
            const j = cryptoArray[i] % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        console.log('Deck shuffled with crypto random (unique game sequence)');
        return shuffled;
    },
    
    // Multiple shuffle passes for "real" shuffling feel
    shuffleMultiple: function(deck, passes = 7) {
        let result = deck;
        for (let p = 0; p < passes; p++) {
            result = this.shuffle(result);
        }
        return result;
    },
    
    // ============================================================
    // GAME DECK MANAGER
    // ============================================================
    
    createGameDeck: function() {
        return {
            drawPile: this.shuffleMultiple(this.createFullDeck()),
            discardPile: [],
            currentCard: null,
            lastDrawnBy: null,
            shuffleCount: 1
        };
    },
    
    drawCard: function(gameDeck, playerId) {
        // Check if deck needs reshuffling
        if (gameDeck.drawPile.length === 0) {
            if (gameDeck.discardPile.length === 0) {
                console.error('No cards available!');
                return null;
            }
            
            // Reshuffle discard pile into draw pile
            gameDeck.drawPile = this.shuffleMultiple(gameDeck.discardPile);
            gameDeck.discardPile = [];
            gameDeck.shuffleCount++;
            console.log(`Deck reshuffled (shuffle #${gameDeck.shuffleCount})`);
        }
        
        // Draw top card
        const card = gameDeck.drawPile.pop();
        
        // Move current card to discard if exists
        if (gameDeck.currentCard) {
            gameDeck.discardPile.push(gameDeck.currentCard);
        }
        
        gameDeck.currentCard = card;
        gameDeck.lastDrawnBy = playerId;
        
        console.log(`Drew card: ${card.value}${card.symbol}`);
        
        return card;
    },
    
    getCardsRemaining: function(gameDeck) {
        return gameDeck.drawPile.length;
    },
    
    getDeckState: function(gameDeck) {
        return {
            remaining: gameDeck.drawPile.length,
            discarded: gameDeck.discardPile.length,
            currentCard: gameDeck.currentCard,
            shuffleCount: gameDeck.shuffleCount
        };
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.CardDeckSubstrate = CardDeckSubstrate;
    console.log('Card Deck Substrate loaded');
}
