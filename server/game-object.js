'use strict';
/**
 * KensGames — Game Object
 *
 * ONE Game object per session.  Every Player is injected into it.
 * The whole thing is broadcast as-is to every connected client after
 * any mutation.  The client never needs localStorage to know who is
 * in the game — it reads game_object.players.
 *
 * X-Dimensional model:
 *   X  = identity  (userId, name, avatar — stable per player)
 *   Y  = session   (game settings, phase, slot assignments)
 *   Z  = game_object broadcast (X × Y → what every client sees)
 */

const MAX_NAME_LEN = 24;
const MAX_AVATAR_LEN = 64;  // enough for any emoji sequence or word-id

/**
 * Sanitize a display name: trim, collapse whitespace, cap length.
 * Returns the fallback if the result is too short.
 */
function sanitizeName(raw, fallback) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LEN);
  return s.length >= 2 ? s : String(fallback || 'Player').slice(0, MAX_NAME_LEN);
}

/**
 * Sanitize an avatar value — accepts any emoji, word-id, or descriptor.
 * Only rejects empty / obviously bad values.
 */
function sanitizeAvatar(raw, fallback) {
  const s = String(raw || '').trim().slice(0, MAX_AVATAR_LEN);
  // Block anything that looks like a script injection
  if (!s || /<|>|script/i.test(s)) return String(fallback || '👤');
  return s;
}

// ── Player ────────────────────────────────────────────────────────────────────

class Player {
  constructor({ userId, name, avatar, isHost = false, isAI = false, slot = 0 }) {
    this.userId = String(userId || '');
    this.name = sanitizeName(name, `Player-${String(userId || '').slice(-4)}`);
    this.avatar = sanitizeAvatar(avatar, '👤');
    this.isHost = !!isHost;
    this.isAI = !!isAI;
    this.isReady = false;
    this.isConnected = true;
    this.slot = Number(slot) || 0;
  }

  update({ name, avatar, isReady, isConnected, isHost }) {
    if (name !== undefined) this.name = sanitizeName(name, this.name);
    if (avatar !== undefined) this.avatar = sanitizeAvatar(avatar, this.avatar);
    if (isReady !== undefined) this.isReady = !!isReady;
    if (isConnected !== undefined) this.isConnected = !!isConnected;
    if (isHost !== undefined) this.isHost = !!isHost;
  }

  toJSON() {
    return {
      userId: this.userId,
      name: this.name,
      avatar: this.avatar,
      isHost: this.isHost,
      isAI: this.isAI,
      isReady: this.isReady,
      isConnected: this.isConnected,
      slot: this.slot,
    };
  }
}

// ── Game ──────────────────────────────────────────────────────────────────────

class Game {
  constructor({ gameId, sessionCode, sessionId, isPrivate = false, maxPlayers = 6, settings = {} }) {
    this.gameId = String(gameId || '');
    this.sessionCode = String(sessionCode || '');
    this.sessionId = String(sessionId || '');
    this.isPrivate = !!isPrivate;
    this.maxPlayers = Number(maxPlayers) || 6;
    this.settings = { ...settings };
    this.phase = 'waiting';  // 'waiting' | 'playing' | 'ended'
    this.seq = 0;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    /** @type {Player[]} ordered by slot */
    this._players = [];
  }

  // ── Player management ───────────────────────────────────────────────────────

  getPlayer(userId) {
    return this._players.find(p => p.userId === userId) || null;
  }

  addPlayer(opts) {
    // Reject if full (AI slots don't count against human max)
    const humanCount = this._players.filter(p => !p.isAI).length;
    if (!opts.isAI && humanCount >= this.maxPlayers) return null;

    // Already present — update profile instead
    const existing = this.getPlayer(opts.userId);
    if (existing) {
      existing.update({ name: opts.name, avatar: opts.avatar });
      existing.isConnected = true;
      this._touch();
      return existing;
    }

    const slot = this._players.length;
    const isHost = this._players.filter(p => !p.isAI).length === 0 && !opts.isAI;
    const p = new Player({ ...opts, isHost, slot });
    this._players.push(p);
    this._touch();
    return p;
  }

  removePlayer(userId) {
    const idx = this._players.findIndex(p => p.userId === userId);
    if (idx === -1) return false;
    const wasHost = this._players[idx].isHost;
    this._players.splice(idx, 1);
    // Re-number slots
    this._players.forEach((p, i) => { p.slot = i; });
    // Promote next human to host
    if (wasHost) {
      const nextHuman = this._players.find(p => !p.isAI);
      if (nextHuman) nextHuman.isHost = true;
    }
    this._touch();
    return true;
  }

  markDisconnected(userId) {
    const p = this.getPlayer(userId);
    if (p) { p.isConnected = false; this._touch(); }
  }

  markConnected(userId) {
    const p = this.getPlayer(userId);
    if (p) { p.isConnected = true; this._touch(); }
  }

  setReady(userId, ready) {
    const p = this.getPlayer(userId);
    if (p) { p.isReady = !!ready; this._touch(); }
  }

  setPhase(phase) {
    this.phase = String(phase);
    this._touch();
  }

  get hostId() {
    const h = this._players.find(p => p.isHost);
    return h ? h.userId : null;
  }

  get players() { return this._players.map(p => p.toJSON()); }

  _touch() {
    this.seq++;
    this.updatedAt = Date.now();
  }

  // ── Serialisation ───────────────────────────────────────────────────────────

  toJSON() {
    return {
      gameId: this.gameId,
      sessionCode: this.sessionCode,
      sessionId: this.sessionId,
      isPrivate: this.isPrivate,
      maxPlayers: this.maxPlayers,
      settings: this.settings,
      phase: this.phase,
      seq: this.seq,
      hostId: this.hostId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      players: this.players,
    };
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

/** sessionId → Game */
const _registry = new Map();

function create(sessionId, opts) {
  const g = new Game({ ...opts, sessionId });
  _registry.set(sessionId, g);
  return g;
}

function get(sessionId) {
  return _registry.get(sessionId) || null;
}

function remove(sessionId) {
  _registry.delete(sessionId);
}

function getByCode(code) {
  const c = String(code || '').toUpperCase();
  for (const g of _registry.values()) {
    if (g.sessionCode === c) return g;
  }
  return null;
}

/**
 * Upsert a Game object from a lobby session snapshot.
 * This keeps one canonical x (game) with y[] (players) and emits z via toJSON().
 */
function upsertFromSession(session) {
  if (!session || !session.session_id) return null;
  const sessionId = String(session.session_id);
  let g = get(sessionId);
  if (!g) {
    g = create(sessionId, {
      gameId: session.game_id,
      sessionCode: session.session_code,
      isPrivate: !!session.is_private,
      maxPlayers: Number(session.max_players) || 6,
      settings: session.settings || {},
    });
  }

  g.gameId = String(session.game_id || g.gameId || '');
  g.sessionCode = String(session.session_code || g.sessionCode || '');
  g.isPrivate = !!session.is_private;
  g.maxPlayers = Number(session.max_players) || g.maxPlayers || 6;
  g.settings = { ...(session.settings || {}) };
  g.phase = String(session.status || g.phase || 'waiting');

  const incoming = Array.isArray(session.players) ? session.players : [];
  const incomingIds = new Set(incoming.map(p => String(p.user_id || '')));

  // Remove players no longer present in session snapshot.
  for (const p of g.players) {
    if (!incomingIds.has(String(p.userId || ''))) {
      g.removePlayer(p.userId);
    }
  }

  // Upsert players from the session snapshot.
  incoming.forEach((p, idx) => {
    const userId = String(p.user_id || '');
    if (!userId) return;
    g.addPlayer({
      userId,
      name: p.username,
      avatar: p.avatar_id,
      isAI: !!p.is_ai,
      slot: Number.isFinite(p.slot) ? p.slot : idx,
    });
    const gp = g.getPlayer(userId);
    if (!gp) return;
    gp.update({
      name: p.username,
      avatar: p.avatar_id,
      isReady: !!p.ready,
      isConnected: true,
      isHost: !!p.is_host,
    });
    gp.slot = Number.isFinite(p.slot) ? p.slot : idx;
  });

  g._touch();
  return g;
}

module.exports = { Game, Player, create, get, remove, getByCode, upsertFromSession, sanitizeName, sanitizeAvatar };
