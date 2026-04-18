/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KensGames — Game Session Substrate
 * window.KG_SESSION
 *
 * Manages game sessions client-side. Handles both auth users (token in
 * localStorage) and guest users (guestToken in sessionStorage).
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  const API = '/api';

  // ── token helpers ────────────────────────────────────────────────────────

  function getToken() {
    return localStorage.getItem('kg_token') || sessionStorage.getItem('kg_guest_token') || null;
  }

  function setGuestToken(token) {
    sessionStorage.setItem('kg_guest_token', token);
  }

  function clearGuestToken() {
    sessionStorage.removeItem('kg_guest_token');
  }

  function authHeaders() {
    const t = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  async function api(method, path, body) {
    const opts = { method, headers: authHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(`${API}${path}`, opts);
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  }

  // ── polling ──────────────────────────────────────────────────────────────

  let _pollTimer = null;
  let _pollCb = null;
  let _pollId = null;

  function startPolling(sessionId, onUpdate, intervalMs = 3000) {
    stopPolling();
    _pollId = sessionId;
    _pollCb = onUpdate;
    _pollTimer = setInterval(async () => {
      try {
        const d = await api('GET', `/sessions/${_pollId}`);
        if (_pollCb) _pollCb(null, d.session);
        if (d.session.status === 'active') stopPolling();
      } catch (err) {
        if (_pollCb) _pollCb(err, null);
      }
    }, intervalMs);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    _pollId = null;
    _pollCb = null;
  }

  // ── public API ───────────────────────────────────────────────────────────

  const KG_SESSION = {

    /**
     * Create a new game session.
     * mode: 'public' | 'private' | 'solo'
     * bots: 0–3  (for solo, forced to 1 server-side)
     * Returns session data + inviteUrl (private/public) or gameUrl (solo)
     */
    async create(gameId, mode = 'private', bots = 0, maxPlayers) {
      const d = await api('POST', '/sessions/create', { gameId, mode, bots, maxPlayers });
      if (d.guestToken) setGuestToken(d.guestToken);
      return d;
    },

    /**
     * Join a session via invite code.
     * If no auth token and no guest token, supply playername + avatarId.
     * On success for guests, stores the returned guestToken automatically.
     */
    async join(code, playername, avatarId) {
      const d = await api('POST', '/sessions/join', { code, playername, avatarId });
      if (d.guestToken) setGuestToken(d.guestToken);
      return d;
    },

    /**
     * Toggle ready state for the current player.
     */
    async ready(sessionId) {
      return api('POST', `/sessions/${sessionId}/ready`);
    },

    /**
     * Set bot count (creator only, auth users only).
     */
    async setBots(sessionId, bots) {
      return api('POST', `/sessions/${sessionId}/bots`, { bots });
    },

    /**
     * Start the game (creator only).
     * Returns { gameUrl, sessionId, session }
     */
    async start(sessionId) {
      return api('POST', `/sessions/${sessionId}/start`);
    },

    /**
     * Cancel a waiting session (creator only).
     */
    async cancel(sessionId) {
      return api('DELETE', `/sessions/${sessionId}`);
    },

    /**
     * Fetch session state once.
     */
    async get(sessionId) {
      return api('GET', `/sessions/${sessionId}`);
    },

    /**
     * List public joinable sessions for a game.
     */
    async listPublic(gameId) {
      const r = await fetch(`${API}/sessions/game/${encodeURIComponent(gameId)}/public`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
      return d.sessions;
    },

    /**
     * Poll a session every intervalMs, calling onUpdate(err, session).
     * Stops automatically when session.status === 'active'.
     */
    poll(sessionId, onUpdate, intervalMs = 3000) {
      startPolling(sessionId, onUpdate, intervalMs);
    },

    stopPolling,

    /** Store a guest token (e.g. after manual join flow) */
    setGuestToken,
    clearGuestToken,
    getToken,

    /**
     * True if the user has a valid auth token stored (not guest).
     * Does NOT validate with the server — quick local check only.
     */
    isLoggedIn() {
      return !!localStorage.getItem('kg_token');
    },
  };

  global.KG_SESSION = KG_SESSION;
})(window);
