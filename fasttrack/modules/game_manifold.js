/**
 * FastTrack Game Manifold
 * 
 * Minimal Surface: Game state machine and turn flow
 * This is the central orchestrator - coordinates all substrates
 */

const GameManifold = (function() {
    'use strict';
    
    // Game state (minimal - everything else derives)
    const state = {
        phase: 'setup',     // 'setup' | 'playing' | 'ended'
        playerCount: 4,
        currentPlayer: 0,
        currentCard: null,
        legalMoves: [],
        turnCount: 0,
        winner: null,
        players: [],        // { name, isAI, color }
        settings: {}
    };
    
    // Event callbacks
    const events = {
        onTurnStart: [],
        onCardDrawn: [],
        onMoveExecuted: [],
        onPegCut: [],
        onTurnEnd: [],
        onGameEnd: []
    };
    
    /**
     * Initialize new game
     */
    function init(options = {}) {
        state.playerCount = options.playerCount || 4;
        state.settings = options.settings || {};
        state.phase = 'setup';
        state.currentPlayer = 0;
        state.turnCount = 0;
        state.winner = null;
        
        // Setup players
        state.players = [];
        for (let i = 0; i < state.playerCount; i++) {
            state.players.push({
                index: i,
                name: options.playerNames?.[i] || `Player ${i + 1}`,
                isAI: options.aiPlayers?.includes(i) ?? (i > 0),
                color: BoardSubstrate.PLAYER_POSITIONS[i].color
            });
        }
        
        // Initialize substrates
        BoardSubstrate.generateBoard(state.playerCount);
        CardSubstrate.createDeck();
        
        // Create pegs for each player
        for (let i = 0; i < state.playerCount; i++) {
            PegSubstrate.createPlayerPegs(i);
        }
        
        state.phase = 'playing';
        return state;
    }
    
    /**
     * Start a turn
     */
    function startTurn() {
        state.currentCard = null;
        state.legalMoves = [];
        emit('onTurnStart', { player: state.currentPlayer });
    }
    
    /**
     * Draw a card for current player
     */
    function drawCard() {
        state.currentCard = CardSubstrate.draw();
        state.legalMoves = RulesManifold.getLegalMoves(state.currentPlayer, state.currentCard);
        
        emit('onCardDrawn', {
            player: state.currentPlayer,
            card: state.currentCard,
            moves: state.legalMoves
        });
        
        return { card: state.currentCard, moves: state.legalMoves };
    }
    
    /**
     * Execute a move
     */
    function executeMove(move) {
        if (!move) return null;
        
        const result = { move, cuts: null };
        
        // Handle cut first
        if (move.cuts) {
            PegSubstrate.sendHome(move.cuts);
            result.cuts = move.cuts;
            emit('onPegCut', { peg: move.cuts, by: move.pegId });
        }
        
        // Handle swap
        if (move.type === 'swap') {
            const myPeg = PegSubstrate.getPeg(move.pegId);
            const theirPeg = PegSubstrate.getPeg(move.swapWith);
            const myOldHole = myPeg.holeId;
            const theirOldHole = theirPeg.holeId;
            
            PegSubstrate.movePeg(move.pegId, theirOldHole);
            PegSubstrate.movePeg(move.swapWith, myOldHole);
        } else {
            // Normal move
            PegSubstrate.movePeg(move.pegId, move.to);
        }
        
        emit('onMoveExecuted', result);
        
        // Check for winner
        if (PegSubstrate.hasPlayerWon(state.currentPlayer)) {
            endGame(state.currentPlayer);
        }
        
        return result;
    }
    
    /**
     * End current turn
     */
    function endTurn() {
        if (state.currentCard) {
            CardSubstrate.discard(state.currentCard);
        }
        
        state.currentCard = null;
        state.legalMoves = [];
        state.turnCount++;
        
        // Next player
        state.currentPlayer = (state.currentPlayer + 1) % state.playerCount;
        
        emit('onTurnEnd', { nextPlayer: state.currentPlayer });
    }
    
    /**
     * AI takes turn
     */
    async function aiTakeTurn() {
        const player = state.players[state.currentPlayer];
        if (!player.isAI) return;
        
        startTurn();
        
        // Simulate thinking
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        
        const { card, moves } = drawCard();
        
        // Select and execute move
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
        
        if (moves.length > 0) {
            const move = AIManifold.selectMove(state.currentPlayer, card, moves);
            executeMove(move);
        }
        
        endTurn();
    }
    
    /**
     * End game
     */
    function endGame(winnerIndex) {
        state.phase = 'ended';
        state.winner = winnerIndex;
        emit('onGameEnd', { winner: winnerIndex });
    }
    
    /**
     * Event system
     */
    function on(event, callback) {
        if (events[event]) {
            events[event].push(callback);
        }
    }
    
    function emit(event, data) {
        if (events[event]) {
            events[event].forEach(cb => cb(data));
        }
    }
    
    // Public API
    return {
        init,
        startTurn,
        drawCard,
        executeMove,
        endTurn,
        aiTakeTurn,
        endGame,
        on,
        
        get state() { return state; },
        get currentPlayer() { return state.currentPlayer; },
        get currentCard() { return state.currentCard; },
        get legalMoves() { return state.legalMoves; },
        get isPlaying() { return state.phase === 'playing'; }
    };
})();

if (typeof module !== 'undefined') module.exports = GameManifold;

