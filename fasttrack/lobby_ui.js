/**
 * ============================================================
 * FASTTRACK LOBBY UI
 * ButterflyFX Manifold Pattern - Lobby Interface
 * ============================================================
 */

const LobbyUI = {
    version: '1.0.0',
    name: 'FastTrack Lobby UI',
    
    // DOM Elements
    container: null,
    
    // Current user
    currentUser: null,
    
    // Update interval
    updateInterval: null,
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    init: function(containerId = 'lobby-container') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = containerId;
            document.body.appendChild(this.container);
        }
        
        this.render();
        
        // Start update loop
        this.updateInterval = setInterval(() => this.updateLobby(), 5000);
        
        // Register callbacks
        if (typeof LobbySubstrate !== 'undefined') {
            LobbySubstrate.onLobbyUpdated = () => this.updateLobby();
        }
        
        console.log('Lobby UI initialized');
    },
    
    destroy: function() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    },
    
    // ============================================================
    // RENDER
    // ============================================================
    
    render: function() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <style>
                .lobby-container {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 12px;
                    padding: 20px;
                    color: #fff;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                
                .lobby-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #0f3460;
                }
                
                .lobby-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #e94560;
                }
                
                .lobby-stats {
                    display: flex;
                    gap: 20px;
                }
                
                .lobby-stat {
                    background: rgba(14, 52, 96, 0.5);
                    padding: 8px 15px;
                    border-radius: 8px;
                    font-size: 14px;
                }
                
                .lobby-stat-value {
                    color: #00d9ff;
                    font-weight: bold;
                }
                
                .lobby-main {
                    display: grid;
                    grid-template-columns: 1fr 300px;
                    gap: 20px;
                }
                
                .lobby-games {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                    padding: 15px;
                }
                
                .lobby-section-title {
                    font-size: 18px;
                    margin-bottom: 15px;
                    color: #e94560;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .lobby-actions {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                
                .lobby-btn {
                    background: linear-gradient(135deg, #e94560 0%, #c93b55 100%);
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                
                .lobby-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(233, 69, 96, 0.4);
                }
                
                .lobby-btn-secondary {
                    background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
                    border: 1px solid #0f3460;
                }
                
                .lobby-btn-secondary:hover {
                    box-shadow: 0 4px 15px rgba(15, 52, 96, 0.4);
                }
                
                .lobby-btn-solo {
                    background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
                }
                
                .lobby-btn-solo:hover {
                    box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
                }
                
                .game-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                
                .game-card {
                    background: rgba(15, 52, 96, 0.5);
                    border-radius: 8px;
                    padding: 12px 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.2s;
                }
                
                .game-card:hover {
                    background: rgba(15, 52, 96, 0.8);
                    transform: translateX(5px);
                }
                
                .game-info {
                    flex: 1;
                }
                
                .game-host {
                    font-weight: 600;
                    color: #00d9ff;
                }
                
                .game-details {
                    font-size: 12px;
                    color: #aaa;
                    margin-top: 4px;
                }
                
                .game-players {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    color: #4ade80;
                }
                
                .game-join-btn {
                    background: #0f3460;
                    border: 1px solid #00d9ff;
                    color: #00d9ff;
                    padding: 6px 15px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                
                .game-join-btn:hover {
                    background: #00d9ff;
                    color: #1a1a2e;
                }
                
                .lobby-players {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                    padding: 15px;
                }
                
                .player-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    max-height: 500px;
                    overflow-y: auto;
                }
                
                .player-card {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 10px;
                    background: rgba(15, 52, 96, 0.3);
                    border-radius: 6px;
                }
                
                .player-avatar {
                    font-size: 24px;
                }
                
                .player-info {
                    flex: 1;
                }
                
                .player-name {
                    font-weight: 600;
                    font-size: 14px;
                }
                
                .player-status {
                    font-size: 11px;
                    color: #888;
                }
                
                .player-status.looking {
                    color: #4ade80;
                }
                
                .player-status.in-game {
                    color: #facc15;
                }
                
                .player-invite-btn {
                    background: none;
                    border: 1px solid #0f3460;
                    color: #00d9ff;
                    padding: 4px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                    transition: all 0.2s;
                }
                
                .player-invite-btn:hover {
                    background: #0f3460;
                }
                
                .empty-message {
                    text-align: center;
                    color: #666;
                    padding: 20px;
                    font-style: italic;
                }
                
                .mode-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    margin-left: 8px;
                }
                
                .mode-random { background: #0f3460; color: #00d9ff; }
                .mode-private { background: #5b21b6; color: #e9d5ff; }
                .mode-guild { background: #065f46; color: #6ee7b7; }
                .mode-solo { background: #4b5563; color: #d1d5db; }
                
                /* Modal */
                .lobby-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                
                .lobby-modal-content {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 12px;
                    padding: 25px;
                    min-width: 400px;
                    max-width: 500px;
                }
                
                .lobby-modal-title {
                    font-size: 20px;
                    font-weight: bold;
                    color: #e94560;
                    margin-bottom: 20px;
                }
                
                .lobby-form-group {
                    margin-bottom: 15px;
                }
                
                .lobby-form-label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 14px;
                    color: #aaa;
                }
                
                .lobby-form-select,
                .lobby-form-input {
                    width: 100%;
                    padding: 10px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid #0f3460;
                    border-radius: 6px;
                    color: #fff;
                    font-size: 14px;
                }
                
                .lobby-form-select option {
                    background: #1a1a2e;
                }
                
                .lobby-modal-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }
                
                /* =============================================
                   RESPONSIVE MOBILE STYLES
                   ============================================= */
                @media (max-width: 768px) {
                    .lobby-container {
                        padding: 12px;
                        border-radius: 0;
                        min-height: 100vh;
                    }
                    
                    .lobby-header {
                        flex-direction: column;
                        gap: 12px;
                        text-align: center;
                    }
                    
                    .lobby-title {
                        font-size: 20px;
                    }
                    
                    .lobby-stats {
                        flex-wrap: wrap;
                        justify-content: center;
                        gap: 8px;
                    }
                    
                    .lobby-stat {
                        padding: 6px 10px;
                        font-size: 12px;
                    }
                    
                    .lobby-main {
                        grid-template-columns: 1fr;
                        gap: 15px;
                    }
                    
                    .lobby-actions {
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .lobby-btn {
                        width: 100%;
                        padding: 14px 20px;
                        font-size: 15px;
                    }
                    
                    .game-list {
                        max-height: 250px;
                    }
                    
                    .game-card {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 10px;
                        padding: 12px;
                    }
                    
                    .game-join-btn {
                        width: 100%;
                        text-align: center;
                        padding: 10px;
                    }
                    
                    .player-list {
                        max-height: 200px;
                    }
                    
                    .lobby-modal-content {
                        min-width: auto;
                        max-width: 95vw;
                        width: 100%;
                        margin: 15px;
                        padding: 20px;
                    }
                    
                    .lobby-modal-title {
                        font-size: 18px;
                    }
                    
                    .lobby-modal-actions {
                        flex-direction: column;
                    }
                    
                    .lobby-modal-actions .lobby-btn {
                        width: 100%;
                    }
                }
                
                @media (max-width: 480px) {
                    .lobby-container {
                        padding: 8px;
                    }
                    
                    .lobby-header {
                        padding-bottom: 10px;
                        margin-bottom: 12px;
                    }
                    
                    .lobby-title {
                        font-size: 18px;
                    }
                    
                    .lobby-stats {
                        gap: 6px;
                    }
                    
                    .lobby-stat {
                        padding: 4px 8px;
                        font-size: 11px;
                    }
                    
                    .lobby-section-title {
                        font-size: 15px;
                    }
                    
                    .game-card {
                        padding: 10px;
                    }
                    
                    .game-host {
                        font-size: 14px;
                    }
                    
                    .game-details {
                        font-size: 11px;
                    }
                }
            </style>
            
            <div class="lobby-container">
                <div class="lobby-header">
                    <div class="lobby-title">🎮 FastTrack Lobby</div>
                    <div class="lobby-stats">
                        <div class="lobby-stat">
                            Players Online: <span class="lobby-stat-value" id="stat-online">0</span>
                        </div>
                        <div class="lobby-stat">
                            Games Waiting: <span class="lobby-stat-value" id="stat-waiting">0</span>
                        </div>
                        <div class="lobby-stat">
                            In Progress: <span class="lobby-stat-value" id="stat-progress">0</span>
                        </div>
                    </div>
                </div>
                
                <div class="lobby-actions">
                    <button class="lobby-btn lobby-btn-solo" onclick="LobbyUI.showSoloModal()">
                        🤖 Play Solo (with AI)
                    </button>
                    <button class="lobby-btn" onclick="LobbyUI.quickMatch()">
                        ⚡ Quick Match
                    </button>
                    <button class="lobby-btn lobby-btn-secondary" onclick="LobbyUI.showCreateGameModal()">
                        ➕ Create Game
                    </button>
                    <button class="lobby-btn lobby-btn-secondary" onclick="LobbyUI.toggleLookingForGame()">
                        👋 Toggle "Looking for Game"
                    </button>
                </div>
                
                <div class="lobby-main">
                    <div class="lobby-games">
                        <div class="lobby-section-title">🎯 Available Games</div>
                        <div class="game-list" id="game-list">
                            <div class="empty-message">No games available. Create one!</div>
                        </div>
                    </div>
                    
                    <div class="lobby-players">
                        <div class="lobby-section-title">👥 Online Players</div>
                        <div class="player-list" id="player-list">
                            <div class="empty-message">No players visible</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.updateLobby();
    },
    
    // ============================================================
    // UPDATE
    // ============================================================
    
    updateLobby: function() {
        this.updateStats();
        this.updateGameList();
        this.updatePlayerList();
    },
    
    updateStats: function() {
        const stats = LobbySubstrate?.getStats() || { playersOnline: 0, gamesWaiting: 0, gamesInProgress: 0 };
        
        const online = document.getElementById('stat-online');
        const waiting = document.getElementById('stat-waiting');
        const progress = document.getElementById('stat-progress');
        
        if (online) online.textContent = stats.playersOnline;
        if (waiting) waiting.textContent = stats.gamesWaiting;
        if (progress) progress.textContent = stats.gamesInProgress;
    },
    
    updateGameList: function() {
        const container = document.getElementById('game-list');
        if (!container) return;
        
        const userId = this.currentUser?.id;
        const games = LobbySubstrate?.getAvailableGames(userId) || [];
        
        if (games.length === 0) {
            container.innerHTML = '<div class="empty-message">No games available. Create one!</div>';
            return;
        }
        
        container.innerHTML = games.map(game => `
            <div class="game-card">
                <div class="game-info">
                    <div class="game-host">
                        ${this.escapeHtml(game.host)}
                        <span class="mode-badge mode-${game.mode || 'random'}">${(game.mode || 'random').toUpperCase()}</span>
                    </div>
                    <div class="game-details">
                        ${game.guildOnly ? '🛡️ Guild Only' : '🌐 Open'}
                        ${game.hasAI ? ' • 🤖 Has AI' : ''}
                    </div>
                </div>
                <div class="game-players">
                    👥 ${game.playerCount}/${game.maxPlayers}
                </div>
                <button class="game-join-btn" onclick="LobbyUI.joinGame('${game.id}')">Join</button>
            </div>
        `).join('');
    },
    
    updatePlayerList: function() {
        const container = document.getElementById('player-list');
        if (!container) return;
        
        const userId = this.currentUser?.id;
        let players = [];
        
        // Get visible players
        if (userId && typeof LobbySubstrate !== 'undefined') {
            players = LobbySubstrate.getVisiblePlayers(userId);
        } else {
            // Show looking for game players only
            players = LobbySubstrate?.getLookingForGamePlayers() || [];
        }
        
        if (players.length === 0) {
            container.innerHTML = '<div class="empty-message">No players visible</div>';
            return;
        }
        
        container.innerHTML = players.map(player => {
            const avatar = AvatarSubstrate?.getById(player.avatarId);
            const emoji = avatar?.emoji || '👤';
            
            let statusClass = '';
            let statusText = 'Online';
            if (player.lookingForGame || player.status === 'looking') {
                statusClass = 'looking';
                statusText = 'Looking for game';
            } else if (player.status === 'in_game') {
                statusClass = 'in-game';
                statusText = 'In Game';
            }
            
            return `
                <div class="player-card">
                    <div class="player-avatar">${emoji}</div>
                    <div class="player-info">
                        <div class="player-name">${this.escapeHtml(player.displayName)}</div>
                        <div class="player-status ${statusClass}">
                            ${statusText}
                            ${player.guildName ? ` • 🛡️ ${this.escapeHtml(player.guildName)}` : ''}
                        </div>
                    </div>
                    ${player.lookingForGame && userId ? 
                        `<button class="player-invite-btn" onclick="LobbyUI.invitePlayer('${player.id}')">Invite</button>` : 
                        ''
                    }
                </div>
            `;
        }).join('');
    },
    
    // ============================================================
    // ACTIONS
    // ============================================================
    
    setCurrentUser: function(user) {
        this.currentUser = user;
        this.updateLobby();
    },
    
    quickMatch: function() {
        if (!this.currentUser) {
            alert('Please log in first');
            return;
        }
        
        const result = LobbySubstrate?.quickMatch(this.currentUser.id);
        if (result?.success) {
            console.log('Matched to game:', result.game);
            // Would typically trigger game start UI here
        } else {
            console.log('Quick match failed:', result?.error);
        }
    },
    
    joinGame: function(gameId) {
        if (!this.currentUser) {
            alert('Please log in first');
            return;
        }
        
        const result = LobbySubstrate?.joinGame(this.currentUser.id, gameId);
        if (result?.success) {
            console.log('Joined game:', result.game);
            this.updateLobby();
        } else {
            alert(result?.error || 'Could not join game');
        }
    },
    
    invitePlayer: function(playerId) {
        // Get current game
        const player = LobbySubstrate?.players.get(this.currentUser?.id);
        if (!player?.currentGameId) {
            alert('Create a game first to invite players');
            return;
        }
        
        const result = LobbySubstrate?.inviteToGame(player.currentGameId, this.currentUser.id, playerId);
        if (result?.success) {
            alert('Invitation sent!');
        } else {
            alert(result?.error || 'Could not invite player');
        }
    },
    
    toggleLookingForGame: function() {
        if (!this.currentUser) {
            alert('Please log in first');
            return;
        }
        
        const player = LobbySubstrate?.players.get(this.currentUser.id);
        const newStatus = !player?.lookingForGame;
        
        LobbySubstrate?.setLookingForGame(this.currentUser.id, newStatus);
        this.updateLobby();
    },
    
    // ============================================================
    // MODALS
    // ============================================================
    
    showSoloModal: function() {
        const modal = document.createElement('div');
        modal.className = 'lobby-modal';
        modal.id = 'solo-modal';
        modal.innerHTML = `
            <div class="lobby-modal-content">
                <div class="lobby-modal-title">🤖 Solo Game Setup</div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label">Number of AI Opponents</label>
                    <select class="lobby-form-select" id="solo-ai-count">
                        <option value="2">2 AI Players (3 total)</option>
                        <option value="3" selected>3 AI Players (4 total)</option>
                    </select>
                </div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label">AI Difficulty</label>
                    <select class="lobby-form-select" id="solo-ai-difficulty">
                        <option value="easy">Easy - Avoids sending home</option>
                        <option value="veteran" selected>Veteran - Strategic play</option>
                        <option value="aggressive">Aggressive - Prioritizes cuts</option>
                    </select>
                </div>
                
                <div class="lobby-modal-actions">
                    <button class="lobby-btn lobby-btn-secondary" onclick="LobbyUI.closeModal('solo-modal')">Cancel</button>
                    <button class="lobby-btn lobby-btn-solo" onclick="LobbyUI.startSoloGame()">Start Game</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    startSoloGame: function() {
        if (!this.currentUser) {
            alert('Please log in first');
            this.closeModal('solo-modal');
            return;
        }
        
        const aiCount = parseInt(document.getElementById('solo-ai-count').value);
        const difficulty = document.getElementById('solo-ai-difficulty').value;
        
        const result = LobbySubstrate?.createSoloGame(this.currentUser.id, aiCount, difficulty);
        
        this.closeModal('solo-modal');
        
        if (result?.success) {
            console.log('Solo game started:', result.session || result.game);
            // Trigger game start
            if (typeof window.launchGame === 'function') {
                window.launchGame(result.session || result.game);
            }
        } else {
            alert(result?.error || 'Could not start solo game');
        }
    },
    
    showCreateGameModal: function() {
        const modal = document.createElement('div');
        modal.className = 'lobby-modal';
        modal.id = 'create-game-modal';
        modal.innerHTML = `
            <div class="lobby-modal-content">
                <div class="lobby-modal-title">➕ Create Game</div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label">Game Mode</label>
                    <select class="lobby-form-select" id="create-mode" onchange="LobbyUI.updateCreateGameForm()">
                        <option value="random">Random Matchmaking (3-4 players)</option>
                        <option value="private">Private Game (2-6 players)</option>
                        <option value="guild">Guild Game (2-6 players)</option>
                    </select>
                </div>
                
                <div class="lobby-form-group" id="create-max-players-group">
                    <label class="lobby-form-label">Max Players</label>
                    <select class="lobby-form-select" id="create-max-players">
                        <option value="3">3 Players</option>
                        <option value="4" selected>4 Players</option>
                    </select>
                </div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label">Medallion Filter</label>
                    <select class="lobby-form-select" id="create-medallion">
                        <option value="any">Any Skill Level</option>
                        <option value="similar">Similar Skill Level</option>
                    </select>
                </div>
                
                <div class="lobby-form-group" id="create-ai-group" style="display: none;">
                    <label class="lobby-form-label">
                        <input type="checkbox" id="create-allow-ai" checked> Allow AI Players
                    </label>
                </div>
                
                <div class="lobby-modal-actions">
                    <button class="lobby-btn lobby-btn-secondary" onclick="LobbyUI.closeModal('create-game-modal')">Cancel</button>
                    <button class="lobby-btn" onclick="LobbyUI.createGame()">Create Game</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    updateCreateGameForm: function() {
        const mode = document.getElementById('create-mode').value;
        const maxPlayersGroup = document.getElementById('create-max-players-group');
        const maxPlayersSelect = document.getElementById('create-max-players');
        const aiGroup = document.getElementById('create-ai-group');
        
        // Update max players options based on mode
        if (mode === 'random') {
            maxPlayersSelect.innerHTML = `
                <option value="3">3 Players</option>
                <option value="4" selected>4 Players (Preferred)</option>
            `;
            aiGroup.style.display = 'none';
        } else {
            maxPlayersSelect.innerHTML = `
                <option value="2">2 Players</option>
                <option value="3">3 Players</option>
                <option value="4" selected>4 Players</option>
                <option value="5">5 Players</option>
                <option value="6">6 Players</option>
            `;
            aiGroup.style.display = 'block';
        }
    },
    
    createGame: function() {
        if (!this.currentUser) {
            alert('Please log in first');
            this.closeModal('create-game-modal');
            return;
        }
        
        const mode = document.getElementById('create-mode').value;
        const maxPlayers = parseInt(document.getElementById('create-max-players').value);
        const medallionFilter = document.getElementById('create-medallion').value;
        const allowAI = document.getElementById('create-allow-ai')?.checked ?? true;
        
        const result = LobbySubstrate?.createGame(this.currentUser.id, mode, {
            maxPlayers,
            medallionFilter: medallionFilter === 'similar' ? 'similar' : null,
            allowAI
        });
        
        this.closeModal('create-game-modal');
        
        if (result?.success) {
            console.log('Game created:', result.game);
            this.updateLobby();
        } else {
            alert(result?.error || 'Could not create game');
        }
    },
    
    closeModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    },
    
    // ============================================================
    // UTILITIES
    // ============================================================
    
    escapeHtml: function(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.LobbyUI = LobbyUI;
    console.log('Lobby UI loaded');
}
