/**
 * FastTrack Card Substrate
 * 
 * Minimal Surface: Card deck and rules
 * Card behavior derives from rank — no need to store complex logic
 */

const CardSubstrate = (function() {
    'use strict';
    
    // Card definitions (the generative basis)
    const CARD_RULES = {
        'A':  { moves: [1, 14], canExit: true, name: 'Ace' },
        '2':  { moves: [2], canExit: false, name: 'Two' },
        '3':  { moves: [3], canExit: false, name: 'Three' },
        '4':  { moves: [-4], canExit: false, name: 'Four', backward: true },
        '5':  { moves: [5], canExit: false, name: 'Five' },
        '6':  { moves: [6], canExit: true, name: 'Six' },
        '7':  { moves: [7], canExit: false, name: 'Seven', splittable: true },
        '8':  { moves: [8], canExit: false, name: 'Eight' },
        '9':  { moves: [9], canExit: false, name: 'Nine' },
        '10': { moves: [10], canExit: false, name: 'Ten' },
        'J':  { moves: [0], canExit: true, name: 'Jack', swap: true },
        'Q':  { moves: [12], canExit: true, name: 'Queen' },
        'K':  { moves: [13], canExit: true, name: 'King' },
        'JK': { moves: [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], canExit: true, name: 'Joker', wild: true }
    };
    
    const SUITS = ['♠', '♥', '♦', '♣'];
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    // Deck state
    let deck = [];
    let discardPile = [];
    
    /**
     * Create a fresh shuffled deck
     */
    function createDeck(includeJokers = true) {
        deck = [];
        
        // Standard 52 cards
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ rank, suit, id: `${rank}${suit}` });
            }
        }
        
        // Add jokers
        if (includeJokers) {
            deck.push({ rank: 'JK', suit: '🃏', id: 'JK1' });
            deck.push({ rank: 'JK', suit: '🃏', id: 'JK2' });
        }
        
        shuffle();
        return deck;
    }
    
    /**
     * Fisher-Yates shuffle
     */
    function shuffle() {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }
    
    /**
     * Draw a card
     */
    function draw() {
        if (deck.length === 0) {
            // Reshuffle discard pile
            deck = [...discardPile];
            discardPile = [];
            shuffle();
        }
        return deck.pop();
    }
    
    /**
     * Discard a card
     */
    function discard(card) {
        discardPile.push(card);
    }
    
    /**
     * Get card rules (derived from rank)
     */
    function getRules(card) {
        return CARD_RULES[card.rank] || CARD_RULES['2'];
    }
    
    /**
     * Get possible move distances for a card
     */
    function getMoveDistances(card) {
        const rules = getRules(card);
        return rules.moves;
    }
    
    /**
     * Can card exit a peg from home?
     */
    function canExitHome(card) {
        return getRules(card).canExit;
    }
    
    /**
     * Is card a 7 (splittable)?
     */
    function isSplittable(card) {
        return getRules(card).splittable === true;
    }
    
    /**
     * Is card a Jack (swap)?
     */
    function isSwap(card) {
        return getRules(card).swap === true;
    }
    
    /**
     * Is card backward moving?
     */
    function isBackward(card) {
        return getRules(card).backward === true;
    }
    
    /**
     * Is card a Joker (wild)?
     */
    function isWild(card) {
        return getRules(card).wild === true;
    }
    
    /**
     * Get card display value
     */
    function getDisplay(card) {
        return card.rank === 'JK' ? '🃏' : `${card.rank}${card.suit}`;
    }
    
    /**
     * Get card color (red or black)
     */
    function getColor(card) {
        return ['♥', '♦', '🃏'].includes(card.suit) ? 'red' : 'black';
    }
    
    /**
     * Get deck count
     */
    function remaining() {
        return deck.length;
    }
    
    // Public API
    return {
        CARD_RULES,
        SUITS,
        RANKS,
        
        createDeck,
        shuffle,
        draw,
        discard,
        getRules,
        getMoveDistances,
        canExitHome,
        isSplittable,
        isSwap,
        isBackward,
        isWild,
        getDisplay,
        getColor,
        remaining
    };
})();

if (typeof module !== 'undefined') module.exports = CardSubstrate;

