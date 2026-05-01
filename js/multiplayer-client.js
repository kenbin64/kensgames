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
    this.gameUuid = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════
  wsUrl() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'ws://' + h + ':8765';
    return 'wss://' + h + '/ws';
  }

  connect(auth) {
    if (this.ws && this.ws.readyState <= 1) return;
    this.username = (auth && auth.username) || localStorage.getItem('username') || localStorage.getItem('display_name') || 'Player';

    // Stable per-browser guest id, persisted in localStorage so the same browser
    // keeps the same identity across reloads/games (no accounts).
    let guestId = null;
    try { guestId = localStorage.getItem('kg_guest_id'); } catch { /* ignore */ }
    if (!guestId) {
      guestId = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try { localStorage.setItem('kg_guest_id', guestId); } catch { /* ignore */ }
    }

    let avatarId = null;
    try {
      const av = JSON.parse(localStorage.getItem('kg_avatar'));
      avatarId = av && av.id ? av.id : null;
    } catch { /* ignore */ }

    this.ws = new WebSocket(this.wsUrl());

    this.ws.onopen = () => {
      this.connected = true;
      this._hideReconnectOverlay();
      this._send({
        type: 'guest_login',
        token: guestId,
        username: this.username,
        guest_name: this.username,
        name: this.username,
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
      this._showReconnectOverlay('Connection lost. Reconnecting...');
      this._emit('disconnected');
      // Auto-reconnect if was in a game
      if (this.session) {
        this._reconnectTimer = setTimeout(() => this.connect(auth), 3000);
      }
    };

    this.ws.onerror = () => {
      console.error('[KGMultiplayer] WebSocket error');
      this._showReconnectOverlay('Connection unstable. Reconnecting...');
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

  _showReconnectOverlay(message) {
    if (typeof document === 'undefined') return;
    let overlay = document.getElementById('kgmp-reconnect-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'kgmp-reconnect-overlay';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99996',
        'background:rgba(6,10,20,0.65)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'pointer-events:none',
      ].join(';');
      overlay.innerHTML = [
        '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:#dce5ff;">',
        '<div style="width:36px;height:36px;border:4px solid rgba(220,229,255,0.2);border-top-color:#8ac4ff;border-radius:50%;animation:kgmpSpin 0.85s linear infinite"></div>',
        '<div id="kgmp-reconnect-text" style="font-family:sans-serif;font-size:clamp(14px,3.6vw,18px);font-weight:600;text-align:center;"></div>',
        '</div>'
      ].join('');
      const style = document.createElement('style');
      style.id = 'kgmp-reconnect-style';
      style.textContent = '@keyframes kgmpSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }
    const txt = document.getElementById('kgmp-reconnect-text');
    if (txt) txt.textContent = message || 'Reconnecting...';
    overlay.style.display = 'flex';
  }

  _hideReconnectOverlay() {
    if (typeof document === 'undefined') return;
    const overlay = document.getElementById('kgmp-reconnect-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  _ackPmFrame(data) {
    if (!data || typeof data._pm_seq !== 'number') return;
    this._send({
      type: 'game_action_ack',
      session_id: (this.session && this.session.session_id) || data._pm_session,
      seq: data._pm_seq,
      game_uuid: this.gameUuid || (this.session && this.session.game_uuid) || null,
    });
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

  /** Update session settings (host only) */
  updateSettings(settings) {
    this._send({ type: 'update_session_settings', settings });
  }

  /** Set max player limit for this session (host only, 2-6) */
  setMaxPlayers(n) {
    const clamped = Math.max(2, Math.min(6, parseInt(n, 10) || 6));
    this._send({ type: 'update_session_settings', settings: {}, max_players: clamped });
  }

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

  /**
   * Send a chat payload.
   * - chat('hello') keeps legacy behavior.
   * - chat({ message: 'hello', emoji_reaction: {...} }) allows rich metadata.
   */
  chat(messageOrPayload) {
    if (messageOrPayload && typeof messageOrPayload === 'object') {
      this._send(Object.assign({ type: 'chat' }, messageOrPayload));
      return;
    }
    this._send({ type: 'chat', message: messageOrPayload });
  }

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
        if (data.session) {
          this.session = data.session;
          this.sessionCode = data.session.session_code || this.sessionCode;
          this.isHost = data.session.host_id === this.userId;
          this._emit('session_update', data.session);
        } else if (this.session) {
          // Some legacy server events may omit a full session payload.
          // Keep current session cache and still notify listeners to refresh.
          this._emit('session_update', this.session);
        }
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
        this.gameUuid = data && data.session && data.session.game_uuid ? data.session.game_uuid : this.gameUuid;
        this._emit('game_started', data);
        break;

      case 'player_state':
        this._ackPmFrame(data);
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
        this._ackPmFrame(data);
        this._emit('game_action', data);
        break;

      case 'game_state':
        this._ackPmFrame(data);
        this._emit('game_state', data);
        break;

      case 'pm_game_ready':
        this.gameUuid = data.game_uuid || this.gameUuid;
        this._hideReconnectOverlay();
        this._emit('pm_game_ready', data);
        break;

      case 'pm_resync':
        this._showReconnectOverlay('Resyncing game state...');
        this._emit('pm_resync', data);
        break;

      case 'pm_heal_ok':
        this._hideReconnectOverlay();
        this._emit('pm_heal_ok', data);
        break;

      case 'player_replaced_with_bot':
        if (data.players && this.session) {
          this.session.players = data.players;
          this.session.player_count = data.players.length;
        }
        this._emit('player_replaced_with_bot', data);
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
