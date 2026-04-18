/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENSGAMES UNIFIED MULTIPLAYER CLIENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single client library used by ALL games: FastTrack, BrickBreaker3D,
 * Starfighter, ConnectIV, SwartzDiamond, CubeMarble, TicTacToe.
 *
 * Connects to the unified lobby-server.js on wss://kensgames.com/ws.
 *
 * Industry-standard game flow:
 *   Quick Match → matchmake → auto-join → ready → play
 *   Private     → create_session → share code → friends join → play
 *   Browse      → list_sessions → click to join → ready → play
 *   Invite Link → resolve_code → auto-redirect to correct game → join
 *
 * Usage:
 *   const mp = new KGMultiplayer('starfighter');
 *   mp.connect({ username: 'Ace', token: '...' });
 *   mp.on('session_update', (session) => { ... });
 *   mp.on('game_action', (data) => { ... });
 *   mp.createGame({ private: true, max_players: 4 });
 *   mp.sendAction('fire', { x: 1, y: 2 });
 */

class KGMultiplayer {
  constructor(gameId, options) {
    this.gameId = gameId;
    this.options = options || {};
    this.ws = null;
    this.connected = false;
    this.userId = null;
    this.username = null;
    this.session = null;    // current session data
    this.sessionCode = null;
    this.isHost = false;
    this.gameStarted = false;
    this.remotePlayers = new Map(); // userId → latest state
    this.sessionList = [];
    this._listeners = {};
    this._reconnectTimer = null;
    this._seq = 0;
    this._stateInterval = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════
  wsUrl() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8765';
    return 'wss://' + h + '/ws';
  }

  async connect(auth) {
    if (this.ws && this.ws.readyState <= 1) return;
    this.username = (auth && auth.username) || localStorage.getItem('username') || 'Guest';
    let token = (auth && auth.token) || localStorage.getItem('user_token') || null;

    const isGuestToken = (t) => !t || String(t).startsWith('guest-');

    // If the visitor is already authenticated via Cloudflare Access, mint a real
    // KensGames JWT token so games don't require a second login.
    if (isGuestToken(token)) {
      try {
        const res = await fetch('/api/auth/access-session', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.success && data.token) {
            token = data.token;
            // Prefer Access-issued identity fields
            if (data.username) this.username = data.username;
            try {
              localStorage.setItem('user_token', data.token);
              if (data.username) localStorage.setItem('username', data.username);
              if (data.displayName) localStorage.setItem('display_name', data.displayName);
              if (data.userId != null) localStorage.setItem('user_id', String(data.userId));
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }

    // Ensure guests get a stable token so the server can derive a stable guest id.
    // (JWT tokens for signed-in users are preserved as-is.)
    if (!token) {
      token = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try { localStorage.setItem('user_token', token); } catch { /* ignore */ }
    }

    // Best-effort avatar_id (shared AvatarPicker stores under kg_avatar)
    let avatarId = null;
    try {
      const av = JSON.parse(localStorage.getItem('kg_avatar'));
      avatarId = av && av.id ? av.id : null;
    } catch { /* ignore */ }

    this.ws = new WebSocket(this.wsUrl());

    this.ws.onopen = () => {
      this.connected = true;
      // Authenticate with the unified server
      this._send({
        type: 'auth',
        token: token,
        username: this.username,
        guest_name: this.username,
        avatar_id: avatarId,
      });
      this._emit('connected');
    };

    this.ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      this._handleMessage(data);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.gameStarted = false;
      this._emit('disconnected');
      // Auto-reconnect if was in a game
      if (this.session) {
        this._reconnectTimer = setTimeout(() => this.connect(auth), 3000);
      }
    };

    this.ws.onerror = () => {
      console.error('[KGMultiplayer] WebSocket error');
    };
  }

  disconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this._stateInterval) clearInterval(this._stateInterval);
    this._reconnectTimer = null;
    this._stateInterval = null;
    this.session = null;
    this.sessionCode = null;
    this.isHost = false;
    this.gameStarted = false;
    this.remotePlayers.clear();
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT SYSTEM
  // ═══════════════════════════════════════════════════════════════════════
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this; // chainable
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  _emit(event, data) {
    const fns = this._listeners[event];
    if (fns) fns.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
  }

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ROOM / SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /** Create a new game session (host) */
  createGame(opts) {
    this._send({
      type: 'create_session',
      game_id: this.gameId,
      private: (opts && opts.private) || false,
      max_players: (opts && (opts.max_players || opts.maxPlayers)) || undefined,
      settings: (opts && opts.settings) || {},
    });
  }

  /** Join by 6-char invite code */
  joinByCode(code) {
    this._send({ type: 'join_by_code', code: code.toUpperCase().trim() });
  }

  /** Join by session ID */
  joinById(sessionId) {
    this._send({ type: 'join_session', session_id: sessionId });
  }

  /** Quick matchmaking — finds or creates a public game */
  matchmake() {
    this._send({ type: 'matchmake', game_id: this.gameId });
  }

  /** Request the list of public sessions (optionally filtered by game) */
  listGames(gameId) {
    this._send({ type: 'list_sessions', game_id: gameId || this.gameId });
  }

  /** List ALL games across all types (for the portal browser) */
  listAllGames() {
    this._send({ type: 'list_sessions' }); // no game_id filter
  }

  /** Resolve a code to find which game it belongs to */
  resolveCode(code) {
    this._send({ type: 'resolve_code', code: code.toUpperCase().trim() });
  }

  /** Leave current session */
  leave() {
    this._send({ type: 'leave_session' });
    this.session = null;
    this.sessionCode = null;
    this.isHost = false;
    this.gameStarted = false;
    this.remotePlayers.clear();
  }

  /** Toggle ready state */
  toggleReady() { this._send({ type: 'toggle_ready' }); }

  /** Host accepts the group once everyone is ready */
  acceptLobby() { this._send({ type: 'accept_lobby' }); }

  /** Start the game (host only) */
  startGame() { this._send({ type: 'start_game' }); }

  /** Add an AI bot to the session (host only) */
  addBot(difficulty) {
    // Server supports both add_ai and add_ai_player
    this._send({ type: 'add_ai_player', level: difficulty || 'medium' });
  }

  /** Remove an AI bot (host only) */
  removeBot(playerId) {
    // Server supports both remove_ai and remove_ai_player
    this._send({ type: 'remove_ai_player', player_id: playerId });
  }

  /** Send a chat message */
  chat(message) { this._send({ type: 'chat', message }); }

  // ═══════════════════════════════════════════════════════════════════════
  // GAME STATE SYNC
  // ═══════════════════════════════════════════════════════════════════════

  /** Send player state (position, velocity, etc.) — for real-time games */
  sendPlayerState(state) {
    if (!this.gameStarted || !this.connected) return;
    this._send({ type: 'player_state', ...state });
  }

  /** Start auto-sending player state at a fixed rate */
  startStateSync(getStateFn, hz) {
    if (this._stateInterval) clearInterval(this._stateInterval);
    const interval = 1000 / (hz || 20);
    this._stateInterval = setInterval(() => {
      if (this.gameStarted && this.connected) {
        const state = getStateFn();
        if (state) this.sendPlayerState(state);
      }
    }, interval);
  }

  stopStateSync() {
    if (this._stateInterval) clearInterval(this._stateInterval);
    this._stateInterval = null;
  }

  /** Send a discrete game action (fire, move piece, play card) */
  sendAction(action, payload) {
    if (!this.connected) return;
    this._send({
      type: 'game_action',
      action,
      payload: payload || {},
      seq: ++this._seq,
    });
  }

  /** Send authoritative game state snapshot (host only) */
  sendGameState(state) {
    if (!this.connected || !this.isHost) return;
    this._send({
      type: 'game_state',
      state,
      seq: ++this._seq,
    });
  }

  /** Signal game over */
  sendGameOver(result, winner, scores, message) {
    if (!this.connected) return;
    this._send({
      type: 'game_over',
      result, winner, scores, message,
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════════════════
  _handleMessage(data) {
    switch (data.type) {
      case 'auth_success':
        this.userId = (data.user && data.user.user_id) ? data.user.user_id : data.user_id;
        this.username = (data.user && data.user.username) ? data.user.username : data.username;
        this._emit('authenticated', { userId: this.userId, username: this.username });
        break;

      case 'session_created':
      case 'session_update':
      case 'session_joined':
      case 'player_joined':
      case 'player_left':
      case 'ready_update':
      case 'matchmake_result':
      case 'session_settings_updated':
        this.session = data.session;
        this.sessionCode = data.session.session_code;
        this.isHost = data.session.host_id === this.userId;
        this._emit('session_update', data.session);
        if (data.share_code) this._emit('share_code', data.share_code);
        break;

      case 'session_list':
        this.sessionList = data.sessions || [];
        this._emit('session_list', this.sessionList);
        break;

      case 'resolve_code_result':
        this._emit('code_resolved', data);
        break;

      case 'game_started':
        this.gameStarted = true;
        this._emit('game_started', data);
        break;

      case 'player_state':
        if (data.user_id !== this.userId) {
          this.remotePlayers.set(data.user_id, {
            userId: data.user_id,
            username: data.username,
            ...data,
            lastUpdate: performance.now(),
          });
          this._emit('player_state', data);
        }
        break;

      case 'game_action':
        this._emit('game_action', data);
        break;

      case 'game_state':
        this._emit('game_state', data);
        break;

      case 'game_over':
        this.gameStarted = false;
        this._emit('game_over', data);
        break;

      case 'chat':
        this._emit('chat', data);
        break;

      case 'lobby_update':
        this._emit('lobby_update', data);
        break;

      case 'error':
        console.warn('[KGMultiplayer] Server error:', data.message);
        this._emit('error', data.message);
        break;

      default:
        // Forward any unhandled message types for game-specific handling
        this._emit(data.type, data);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONVENIENCE GETTERS
  // ═══════════════════════════════════════════════════════════════════════
  get playerCount() {
    return this.session ? this.session.player_count || this.session.players.length : 0;
  }

  get maxPlayers() {
    return this.session ? this.session.max_players : 0;
  }

  get players() {
    return this.session ? this.session.players : [];
  }

  get code() {
    return this.sessionCode;
  }

  get isInGame() {
    return this.gameStarted && this.connected;
  }
}

// Export for both module and script-tag usage
if (typeof window !== 'undefined') window.KGMultiplayer = KGMultiplayer;
if (typeof module !== 'undefined') module.exports = KGMultiplayer;
