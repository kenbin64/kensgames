/**
 * Fast Track Multiplayer Client
 * Handles real-time game synchronization over WebSocket
 */

// Auto-detect WebSocket URL
function getDefaultWsUrl() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
        return `ws://${window.location.hostname}:8765`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
}

class MultiplayerClient {
    constructor(options = {}) {
        this.wsUrl = options.wsUrl || getDefaultWsUrl();
        this.sessionId = options.sessionId || null;
        this.socket = null;
        this.connected = false;
        this.playerId = options.playerId || null;
        this.isHost = options.isHost || false;
        
        // Callbacks
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});
        this.onError = options.onError || (() => {});
        this.onGameAction = options.onGameAction || (() => {});
        this.onGameStateSync = options.onGameStateSync || (() => {});
        this.onPlayerJoin = options.onPlayerJoin || (() => {});
        this.onPlayerLeave = options.onPlayerLeave || (() => {});
        this.onChat = options.onChat || (() => {});
        this.onPrestige = options.onPrestige || (() => {});
        
        // Action queue for offline resilience
        this.actionQueue = [];
        this.syncInterval = null;
        
        // Reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;
    }
    
    /**
     * Connect to the game server
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log('[MP] Connecting to:', this.wsUrl);
                this.socket = new WebSocket(this.wsUrl);
                
                this.socket.onopen = () => {
                    console.log('[MP] Connected');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.onConnect();
                    this.startSync();
                    resolve();
                };
                
                this.socket.onclose = (event) => {
                    console.log('[MP] Disconnected:', event.code, event.reason);
                    this.connected = false;
                    this.stopSync();
                    this.onDisconnect();
                    
                    // Auto-reconnect
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`[MP] Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                        setTimeout(() => this.connect(), this.reconnectDelay);
                    }
                };
                
                this.socket.onerror = (error) => {
                    console.error('[MP] WebSocket error:', error);
                    this.onError(error);
                    reject(error);
                };
                
                this.socket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
                
            } catch (error) {
                console.error('[MP] Connection error:', error);
                reject(error);
            }
        });
    }
    
    /**
     * Disconnect from server
     */
    disconnect() {
        this.stopSync();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
    }
    
    /**
     * Send a message to the server
     * SecuritySubstrate: validates type whitelist + rate limit + sanitizes strings
     */
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                // SecuritySubstrate: validate outgoing message type + size
                if (typeof SecuritySubstrate !== 'undefined') {
                    if (!SecuritySubstrate.validateOutgoingMessage(data)) {
                        console.warn('[MP] SecuritySubstrate blocked outgoing message');
                        return false;
                    }
                    // Rate limit check per action type
                    if (!SecuritySubstrate.isActionAllowed(data.type || 'default')) {
                        console.warn('[MP] SecuritySubstrate rate limit:', data.type);
                        return false;
                    }
                    // Sanitize string fields (except password)
                    data = SecuritySubstrate.sanitizeOutgoingMessage(data);
                }
                this.socket.send(JSON.stringify(data));
                return true;
            } catch (e) {
                console.error('[MP] Send error:', e);
                return false;
            }
        }
        return false;
    }
    
    /**
     * Handle incoming messages
     * SecuritySubstrate: sanitizes incoming string data before dispatching
     */
    handleMessage(rawData) {
        try {
            // SecuritySubstrate: enforce max incoming message size
            if (typeof SecuritySubstrate !== 'undefined' && rawData.length > 65536) {
                console.warn('[MP] SecuritySubstrate blocked oversized incoming message');
                return;
            }
            
            const data = JSON.parse(rawData);
            console.log('[MP] Received:', data.type);
            
            // SecuritySubstrate: sanitize all incoming string values
            if (typeof SecuritySubstrate !== 'undefined') {
                for (const key of Object.keys(data)) {
                    if (typeof data[key] === 'string' && key !== 'type' && key !== 'game_state') {
                        data[key] = SecuritySubstrate.sanitizeString(data[key], 1000);
                    }
                }
            }
            
            switch (data.type) {
                case 'game_action':
                    this.onGameAction(data.action);
                    break;
                    
                case 'game_state_sync':
                    this.onGameStateSync(data.game_state);
                    break;
                    
                case 'player_joined':
                    this.onPlayerJoin(data.player, data.players);
                    break;
                    
                case 'player_left':
                    this.onPlayerLeave(data.user_id, data.players);
                    break;
                    
                case 'chat':
                    // SecuritySubstrate: sanitize chat content specifically
                    if (typeof SecuritySubstrate !== 'undefined' && data.message) {
                        data.message = SecuritySubstrate.sanitizeChatMessage(data.message);
                    }
                    this.onChat(data);
                    break;
                    
                case 'prestige_awarded':
                    this.onPrestige(data);
                    break;
                    
                case 'error':
                    console.error('[MP] Server error:', data.message);
                    this.onError(new Error(data.message));
                    break;
                    
                case 'pong':
                    // Connection alive
                    break;
            }
        } catch (e) {
            console.error('[MP] Error parsing message:', e);
        }
    }
    
    // =========================================================================
    // Game Actions
    // =========================================================================
    
    /**
     * Send a dice roll action
     * @param {number[]} dice - Dice values
     */
    sendDiceRoll(dice) {
        this.sendGameAction({
            action_type: 'dice_roll',
            dice: dice,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send a peg move action
     * @param {string} pegId - The peg that moved
     * @param {string} fromHole - Starting position
     * @param {string} toHole - Ending position
     * @param {string} diceUsed - Which dice value was used
     */
    sendPegMove(pegId, fromHole, toHole, diceUsed) {
        this.sendGameAction({
            action_type: 'peg_move',
            peg_id: pegId,
            from_hole: fromHole,
            to_hole: toHole,
            dice_used: diceUsed,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send turn end action
     * @param {number} nextPlayerIndex - Next player's index
     */
    sendTurnEnd(nextPlayerIndex) {
        this.sendGameAction({
            action_type: 'turn_end',
            next_player: nextPlayerIndex,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send a vanquish (send opponent home) action
     * @param {string} vanquishedPegId
     * @param {string} byPegId
     */
    sendVanquish(vanquishedPegId, byPegId) {
        this.sendGameAction({
            action_type: 'vanquish',
            vanquished_peg: vanquishedPegId,
            by_peg: byPegId,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send a peg reaching safe zone
     * @param {string} pegId
     */
    sendPegHome(pegId) {
        this.sendGameAction({
            action_type: 'peg_home',
            peg_id: pegId,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send game won action
     * @param {number} winnerIndex
     */
    sendGameWon(winnerIndex) {
        this.sendGameAction({
            action_type: 'game_won',
            winner_index: winnerIndex,
            timestamp: Date.now()
        });
    }
    
    /**
     * Generic game action sender
     */
    sendGameAction(action) {
        const sent = this.send({
            type: 'game_action',
            action: action
        });
        
        if (!sent) {
            // Queue for later sync
            this.actionQueue.push(action);
        }
    }
    
    // =========================================================================
    // State Sync (Host Only)
    // =========================================================================
    
    /**
     * Sync full game state (host only)
     * @param {Object} gameState
     */
    syncGameState(gameState) {
        if (!this.isHost) return;
        
        this.send({
            type: 'game_state_sync',
            game_state: gameState
        });
    }
    
    /**
     * Start periodic state sync
     */
    startSync() {
        // Ping to keep connection alive
        this.syncInterval = setInterval(() => {
            if (!this.connected) return;
            this.send({ type: 'ping' });
            
            // Flush action queue (send directly to avoid re-queueing)
            const toFlush = this.actionQueue.splice(0, this.actionQueue.length);
            for (const action of toFlush) {
                const sent = this.send({ type: 'game_action', action });
                if (!sent) {
                    this.actionQueue.push(action);
                    break; // Stop flushing if connection dropped
                }
            }
        }, 30000);
    }
    
    /**
     * Stop periodic sync
     */
    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    
    // =========================================================================
    // Chat
    // =========================================================================
    
    /**
     * Send a chat message
     * @param {string} message
     */
    sendChat(message) {
        this.send({
            type: 'chat',
            message: message
        });
    }
    
    // =========================================================================
    // Prestige
    // =========================================================================
    
    /**
     * Report a prestige-earning action
     * @param {string} action
     * @param {number} multiplier
     */
    reportPrestigeAction(action, multiplier = 1) {
        this.send({
            type: 'prestige_action',
            action: action,
            multiplier: multiplier
        });
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultiplayerClient;
}

// Also make globally available
if (typeof window !== 'undefined') {
    window.MultiplayerClient = MultiplayerClient;
}
