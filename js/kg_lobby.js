/**
 * KGLobby — Universal WebSocket Game Lobby Substrate
 * Sprint 6 — KG-DIRECTIVE-2026-001
 *
 * Connects every game lobby to lobby-server.js (port 8765, nginx /ws proxy).
 *
 * Launch modes
 * ─────────────
 *   solo(bots)         → REST /api/sessions/create → navigate to game immediately
 *   createPublic(opts) → WS create_session (public)   → waiting room → game_started
 *   createPrivate(opts)→ WS create_session (private)  → share code/URL → game_started
 *   matchmake()        → WS matchmake                 → auto-join/create → game_started
 *   joinByCode(code)   → WS join_by_code              → waiting room → game_started
 *   joinSession(id)    → WS join_session               → waiting room → game_started
 *
 * Host controls (waiting room)
 * ─────────────────────────────
 *   addBot(level)      → WS add_bot
 *   removeBot()        → WS remove_ai
 *   startGame()        → WS start_game  (host only; non-AI humans must be ready)
 *   acceptJoin(uid)    → WS accept_join_request
 *   rejectJoin(uid)    → WS reject_join_request
 *
 * Player controls
 * ────────────────
 *   toggleReady()      → WS toggle_ready
 *   leave()            → WS leave_session
 *
 * Callbacks (all optional, set in cfg passed to KGLobby.init)
 * ─────────────────────────────────────────────────────────────
 *   onConnected()
 *   onAuthSuccess(user)
 *   onError(message)
 *   onSessionCreated(session, shareCode, shareUrl)
 *   onSessionJoined(session)
 *   onSessionUpdate(session, action)
 *   onPlayerJoined(player, players, session)
 *   onPlayerLeft(username, players, session)
 *   onGameStarted(session, wsUrl)         ← default navigates to gamePath
 *   onSessionList(sessions)
 *   onMatchmakeResult(action, session)
 *   onLeftSession()
 *   onJoinRequest(player, sessionId)
 *
 * Usage
 * ──────
 *   const lobby = KGLobby.init({
 *     gameId:   'brickbreaker3d',
 *     gamePath: '/brickbreaker3d/play.html',
 *     onAuthSuccess: function(user) { ... },
 *     onSessionCreated: function(session, code, url) { ... },
 *     onGameStarted: function(session, wsUrl) { ... },
 *   });
 *
 *   // Solo — no sign-in required
 *   lobby.solo(2);  // launch with 2 bots
 *
 *   // Multiplayer
 *   lobby.createPrivate();  // host creates private session
 *   lobby.joinByCode('A1B2C3');
 *   lobby.matchmake();
 */
(function (global) {
  'use strict';

  // ── WS URL detection ─────────────────────────────────────────────────────
  function detectWsUrl() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var host = location.host;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'ws://' + location.hostname + ':8765';
    }
    return proto + '//' + host + '/ws';
  }

  // ── localStorage helpers ─────────────────────────────────────────────────
  function getToken() {
    try {
      var token = localStorage.getItem('kg_token') || null;
      if (token) return token;
      var legacy = localStorage.getItem('user_token') || null;
      if (legacy) {
        localStorage.setItem('kg_token', legacy);
        localStorage.removeItem('user_token');
        return legacy;
      }
      return null;
    } catch (e) { return null; }
  }

  function getUsername() {
    try {
      return localStorage.getItem('username') ||
        localStorage.getItem('display_name') ||
        null;
    } catch (e) { return null; }
  }

  function getAvatarId() {
    try {
      var raw = localStorage.getItem('kg_avatar');
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && obj.id) return obj.id;
      }
      return localStorage.getItem('kg_avatar_id') || null;
    } catch (e) { return null; }
  }

  // ── Core factory ─────────────────────────────────────────────────────────
  function create(cfg) {
    var GAME_ID = cfg.gameId;
    var GAME_PATH = cfg.gamePath;
    var WS_URL = detectWsUrl();

    var ws = null;
    var reconnectTimer = null;
    var reconnectCount = 0;
    var MAX_RECONNECT = 8;
    var authSent = false;
    var pendingAfterAuth = null; // function to call once auth_success fires

    // Public instance
    var self = {
      session: null,
      user: null,
      connected: false,
      wsUrl: WS_URL,
    };

    // ── callback dispatch ────────────────────────────────────────────────
    var cb = {
      onConnected: cfg.onConnected || null,
      onAuthSuccess: cfg.onAuthSuccess || null,
      onError: cfg.onError || null,
      onSessionCreated: cfg.onSessionCreated || null,
      onSessionJoined: cfg.onSessionJoined || null,
      onSessionUpdate: cfg.onSessionUpdate || null,
      onPlayerJoined: cfg.onPlayerJoined || null,
      onPlayerLeft: cfg.onPlayerLeft || null,
      onGameStarted: cfg.onGameStarted || null,
      onSessionList: cfg.onSessionList || null,
      onMatchmakeResult: cfg.onMatchmakeResult || null,
      onLeftSession: cfg.onLeftSession || null,
      onJoinRequest: cfg.onJoinRequest || null,
    };

    function fire(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (cb[name]) cb[name].apply(null, args);
    }

    // ── send ─────────────────────────────────────────────────────────────
    function send(data) {
      if (ws && ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify(data));
        return true;
      }
      return false;
    }

    // ── auth ─────────────────────────────────────────────────────────────
    function doAuth() {
      if (authSent) return;
      authSent = true;
      var token = getToken();
      var username = getUsername() || ('Player_' + Math.random().toString(36).slice(2, 6));
      var avatarId = getAvatarId() || 'robot';
      send({
        type: 'auth',
        token: token || '',
        username: username,
        guest_name: username,
        avatar_id: avatarId,
      });
    }

    // ── connect / reconnect ───────────────────────────────────────────────
    function connect() {
      authSent = false;
      try {
        ws = new WebSocket(WS_URL);
      } catch (e) {
        scheduleReconnect();
        return;
      }

      ws.onopen = function () {
        self.connected = true;
        reconnectCount = 0;
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        fire('onConnected');
        doAuth();
      };

      ws.onclose = function () {
        self.connected = false;
        authSent = false;
        if (reconnectCount < MAX_RECONNECT) scheduleReconnect();
      };

      ws.onerror = function () { /* close fires next */ };

      ws.onmessage = function (evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch (e) { return; }
        dispatch(msg);
      };
    }

    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectCount++;
      var delay = Math.min(reconnectCount * 1000, 8000);
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    // ── message dispatcher ────────────────────────────────────────────────
    function dispatch(msg) {
      switch (msg.type) {

        case 'connected':
          doAuth();
          break;

        case 'auth_success':
          self.user = msg.user;
          fire('onAuthSuccess', msg.user);
          if (pendingAfterAuth) {
            var fn = pendingAfterAuth;
            pendingAfterAuth = null;
            fn();
          }
          break;

        case 'error':
          fire('onError', msg.message || 'Unknown error');
          break;

        case 'session_created':
          self.session = msg.session;
          fire('onSessionCreated', msg.session, msg.share_code, msg.share_url);
          break;

        case 'session_joined':
          self.session = msg.session;
          fire('onSessionJoined', msg.session);
          break;

        case 'session_update':
        case 'session_settings_updated':
        case 'lobby_accepted':
        case 'ready_update':
          if (msg.session) self.session = msg.session;
          fire('onSessionUpdate', self.session, msg.action || msg.type);
          break;

        case 'player_joined':
          if (msg.session) self.session = msg.session;
          fire('onPlayerJoined', msg.player, msg.players, self.session);
          break;

        case 'player_left':
          if (msg.session) self.session = msg.session;
          fire('onPlayerLeft', msg.username, msg.players, self.session);
          break;

        case 'game_started':
          self.session = msg.session;
          handleGameStarted(msg.session);
          break;

        case 'matchmake_result':
          self.session = msg.session;
          fire('onMatchmakeResult', msg.action, msg.session);
          break;

        case 'session_list':
          fire('onSessionList', msg.sessions);
          break;

        case 'left_session':
          self.session = null;
          fire('onLeftSession');
          break;

        case 'join_request':
          fire('onJoinRequest', msg.player, msg.session_id);
          break;

        case 'resolve_code_result':
          if (msg._resolveCallback) msg._resolveCallback(msg);
          break;

        // silently ignore unhandled types
      }
    }

    // ── default game_started handler ─────────────────────────────────────
    function handleGameStarted(session) {
      // If the caller provides their own onGameStarted, let them drive navigation.
      if (cb.onGameStarted) {
        cb.onGameStarted(session, WS_URL);
        return;
      }

      // Default: stash session in sessionStorage then navigate to game page.
      try {
        sessionStorage.setItem('kg_session_id', session.session_id);
        sessionStorage.setItem('kg_session_code', session.session_code || '');
        sessionStorage.setItem('kg_session_players', JSON.stringify(session.players || []));
        sessionStorage.setItem('kg_my_user_id', self.user ? (self.user.user_id || '') : '');
        sessionStorage.setItem('kg_ws_url', WS_URL);
        sessionStorage.setItem('kg_game_id', session.game_id || GAME_ID);
      } catch (e) { /* sessionStorage may be unavailable */ }

      var params = new URLSearchParams({
        session: session.session_id,
        code: session.session_code || '',
        mode: 'multi',
        wsUrl: WS_URL,
        players: String((session.players || []).length),
        gameId: session.game_id || GAME_ID,
      });

      window.location.href = GAME_PATH + '?' + params.toString();
    }

    // ── public API ────────────────────────────────────────────────────────

    /**
     * Launch a solo game with optional bots. Uses REST — no WS session needed.
     * @param {number} bots  0–3
     */
    self.solo = function (bots) {
      var numBots = Math.max(0, Math.min(parseInt(bots, 10) || 0, 3));
      var token = getToken() || '';
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      return fetch('/api/sessions/create', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ gameId: GAME_ID, mode: 'solo', bots: numBots }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.success) throw new Error(d.error || 'Failed to create solo session');
          var url = d.gameUrl ||
            (GAME_PATH + '?session=' + encodeURIComponent(d.sessionId) +
              '&bots=' + numBots + '&mode=solo');
          window.location.href = url;
        });
    };

    /** Create a public (open to anyone) multiplayer session. */
    self.createPublic = function (opts) {
      opts = opts || {};
      send({
        type: 'create_session',
        game_id: GAME_ID,
        private: false,
        max_players: opts.maxPlayers || 4,
        settings: opts.settings || {},
      });
    };

    /** Create a private (invite-code only) session. */
    self.createPrivate = function (opts) {
      opts = opts || {};
      send({
        type: 'create_session',
        game_id: GAME_ID,
        private: true,
        max_players: opts.maxPlayers || 4,
        settings: opts.settings || {},
      });
    };

    /** Quick matchmaking — finds or creates a public game for this game_id. */
    self.matchmake = function () {
      send({ type: 'matchmake', game_id: GAME_ID });
    };

    /** Request current list of public sessions for this game. */
    self.browseGames = function () {
      send({ type: 'list_sessions', game_id: GAME_ID });
    };

    /** Join a specific session by its session_id. */
    self.joinSession = function (sessionId) {
      send({ type: 'join_session', session_id: sessionId });
    };

    /** Join via 6-character invite code. */
    self.joinByCode = function (code) {
      send({ type: 'join_by_code', code: String(code).toUpperCase().trim() });
    };

    /** Add an AI bot to the current session (host only). */
    self.addBot = function (level) {
      send({ type: 'add_bot', level: level || 'medium' });
    };

    /** Remove the last AI bot from the current session (host only). */
    self.removeBot = function () {
      send({ type: 'remove_ai' });
    };

    /**
     * Start the game (host only).
     * All non-AI non-host players must have marked themselves ready first.
     */
    self.startGame = function () {
      send({ type: 'start_game' });
    };

    /** Toggle the calling player's ready state. */
    self.toggleReady = function () {
      send({ type: 'toggle_ready' });
    };

    /** Leave the current session. */
    self.leave = function () {
      send({ type: 'leave_session' });
    };

    /** Accept a pending join request (host only). */
    self.acceptJoin = function (userId) {
      send({ type: 'accept_join_request', user_id: userId });
    };

    /** Reject a pending join request (host only). */
    self.rejectJoin = function (userId) {
      send({ type: 'reject_join_request', user_id: userId });
    };

    /** Update a callback after init. */
    self.on = function (name, fn) {
      if (name in cb) cb[name] = fn;
    };

    /** Queue an action to run immediately after auth_success. */
    self.afterAuth = function (fn) {
      if (self.user) { fn(); }
      else { pendingAfterAuth = fn; }
    };

    // Start WS connection immediately
    connect();

    return self;
  }

  // ── module export ─────────────────────────────────────────────────────────
  global.KGLobby = {
    /**
     * Create and return a lobby instance.
     * @param {Object} cfg  { gameId, gamePath, on* callbacks... }
     */
    init: function (cfg) {
      return create(cfg);
    },

    /** Return the WS URL that would be used in the current browser context. */
    wsUrl: function () {
      return detectWsUrl();
    },
  };

})(window);
