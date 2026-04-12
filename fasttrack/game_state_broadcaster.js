/**
 * ============================================================
 * FASTTRACK GAME STATE BROADCASTER
 * ButterflyFX Manifold Pattern - Real-time Game Sync
 * ============================================================
 * 
 * Handles broadcasting game state to all players:
 * - Current player turn
 * - Deck state
 * - Token positions
 * - Legal moves
 * - Card effects
 */

const GameStateBroadcaster = {
    version: '1.0.0',
    name: 'FastTrack Game Broadcaster',
    
    // Current game state
    state: null,
    
    // Subscribers (callbacks for state updates)
    subscribers: [],
    
    // ============================================================
    // STATE MANAGEMENT
    // ============================================================
    
    initState: function(players, gameDeck) {
        this.state = {
            // Game info
            gameId: `game_${Date.now()}`,
            startedAt: Date.now(),
            
            // Players
            players: players.map((p, idx) => ({
                id: p.id,
                displayName: p.displayName,
                avatarId: p.avatarId,
                isAI: p.isAI || false,
                color: this.getPlayerColor(idx),
                index: idx
            })),
            playerCount: players.length,
            
            // Turn management
            currentPlayerIndex: 0,
            turnNumber: 1,
            turnPhase: 'draw', // draw, move, split_move, complete
            
            // Deck state
            deck: {
                remaining: gameDeck.drawPile.length,
                currentCard: null,
                lastDrawnBy: null
            },
            
            // Current card being played
            activeCard: null,
            
            // Legal moves for current turn
            legalMoves: [],
            
            // Split move tracking (for 7 card)
            splitMoveState: {
                active: false,
                totalMoves: 0,
                usedMoves: 0,
                firstTokenId: null,
                firstTokenMoves: 0
            },
            
            // Replay tracking (for 2 and 9 cards)
            replayPending: false,
            
            // Token positions - Map of tokenId -> holeId
            tokenPositions: new Map(),
            
            // Animation queue
            pendingAnimations: [],
            
            // Game status
            status: 'playing', // playing, paused, finished
            winner: null,
            
            // Timestamp for sync
            lastUpdate: Date.now()
        };
        
        console.log('Game state initialized');
        return this.state;
    },
    
    getPlayerColor: function(index) {
        const colors = [
            0xff4444, // Red
            0x44ff44, // Green
            0x4444ff, // Blue
            0xffff44, // Yellow
            0xff44ff, // Magenta
            0x44ffff  // Cyan
        ];
        return colors[index % colors.length];
    },
    
    // ============================================================
    // STATE UPDATES
    // ============================================================
    
    updateState: function(updates) {
        if (!this.state) return;
        
        Object.assign(this.state, updates);
        this.state.lastUpdate = Date.now();
        
        // Broadcast to all subscribers
        this.broadcast();
    },
    
    setCurrentCard: function(card) {
        this.state.activeCard = card;
        this.state.deck.currentCard = card;
        this.state.turnPhase = 'move';
        this.state.lastUpdate = Date.now();
        this.broadcast();
    },
    
    setLegalMoves: function(moves) {
        this.state.legalMoves = moves;
        this.broadcast();
    },
    
    advanceTurn: function() {
        // Check replay first
        if (this.state.replayPending) {
            this.state.replayPending = false;
            this.state.turnPhase = 'draw';
            // Don't advance player - they draw again
            console.log(`Player ${this.state.currentPlayerIndex} draws again (replay)`);
        } else {
            // Normal turn end
            this.state.currentPlayerIndex = 
                (this.state.currentPlayerIndex + 1) % this.state.playerCount;
            this.state.turnNumber++;
            this.state.turnPhase = 'draw';
        }
        
        // Reset turn state
        this.state.activeCard = null;
        this.state.legalMoves = [];
        this.state.splitMoveState = {
            active: false,
            totalMoves: 0,
            usedMoves: 0,
            firstTokenId: null,
            firstTokenMoves: 0
        };
        
        this.state.lastUpdate = Date.now();
        this.broadcast();
    },
    
    setReplayPending: function(pending) {
        this.state.replayPending = pending;
    },
    
    // ============================================================
    // SPLIT MOVE (7 CARD)
    // ============================================================
    
    initSplitMove: function(totalMoves = 7) {
        this.state.splitMoveState = {
            active: true,
            totalMoves: totalMoves,
            usedMoves: 0,
            firstTokenId: null,
            firstTokenMoves: 0
        };
        this.state.turnPhase = 'split_move';
        this.broadcast();
    },
    
    recordSplitMove: function(tokenId, moveCount) {
        const split = this.state.splitMoveState;
        
        if (!split.firstTokenId) {
            // First token move
            split.firstTokenId = tokenId;
            split.firstTokenMoves = moveCount;
            split.usedMoves = moveCount;
        } else {
            // Second token move
            split.usedMoves += moveCount;
        }
        
        // Check if split is complete
        if (split.usedMoves >= split.totalMoves) {
            split.active = false;
            this.state.turnPhase = 'complete';
        }
        
        this.broadcast();
    },
    
    getRemainingMoves: function() {
        if (!this.state.splitMoveState.active) return 0;
        return this.state.splitMoveState.totalMoves - this.state.splitMoveState.usedMoves;
    },
    
    // ============================================================
    // TOKEN POSITIONS
    // ============================================================
    
    updateTokenPosition: function(tokenId, holeId) {
        this.state.tokenPositions.set(tokenId, holeId);
        this.broadcast();
    },
    
    getTokenPosition: function(tokenId) {
        return this.state.tokenPositions.get(tokenId);
    },
    
    // ============================================================
    // BROADCASTING
    // ============================================================
    
    subscribe: function(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    },
    
    broadcast: function() {
        const stateCopy = this.getStateCopy();
        
        this.subscribers.forEach(callback => {
            try {
                callback(stateCopy);
            } catch (e) {
                console.error('Broadcast subscriber error:', e);
            }
        });
        
        // For multiplayer - would send via WebSocket here
        if (typeof this.onBroadcast === 'function') {
            this.onBroadcast(stateCopy);
        }
    },
    
    getStateCopy: function() {
        // Create serializable copy
        return {
            ...this.state,
            tokenPositions: Object.fromEntries(this.state.tokenPositions)
        };
    },
    
    // ============================================================
    // CURRENT PLAYER INFO
    // ============================================================
    
    getCurrentPlayer: function() {
        if (!this.state) return null;
        return this.state.players[this.state.currentPlayerIndex];
    },
    
    isCurrentPlayer: function(playerId) {
        const current = this.getCurrentPlayer();
        return current && current.id === playerId;
    },
    
    // ============================================================
    // GAME END
    // ============================================================
    
    setWinner: function(playerId) {
        this.state.status = 'finished';
        this.state.winner = playerId;
        this.broadcast();
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.GameStateBroadcaster = GameStateBroadcaster;
    console.log('Game State Broadcaster loaded');
}
