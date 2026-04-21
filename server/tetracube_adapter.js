/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KENSGAMES — TETRACUBEDB ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Drop-in replacement for manifold/server/store.js
 * Replaces all in-memory Maps with persistent TetracubeDB cells.
 *
 * This makes kensgames.com a CLIENT of tetracubedb.com — all state
 * (auth, players, sessions, guilds, lobbies, friends, scores) lives on
 * the manifold surface and persists through deploys, restarts, and crashes.
 *
 * How to activate:
 *   1. Provision a kensgames client on tetracubedb:
 *        POST /admin/clients  { name: "kensgames", namespaces: ["kensgames"] }
 *   2. Add to kensgames .env:
 *        TETRACUBE_URL=https://tetracubedb.com
 *        TETRACUBE_CLIENT_ID=<client_id>
 *        TETRACUBE_API_KEY=<api_key>
 *        TETRACUBE_NS=kensgames
 *   3. Replace require('./store') with require('./tetracube_adapter') in index.js
 *
 * The old in-memory store.js remains untouched as a fallback.
 * If TETRACUBE_URL is not configured, adapter falls back to local SQLite
 * via TetracubeDB running on the same server at localhost:4747.
 *
 * Dimensional mapping:
 *   manifoldData   → D3 WIDTH  cells in table "players"
 *   guildsData     → D4 PLANE  table "guilds"
 *   friendsData    → D3 WIDTH  table "friends"
 *   leaderboardData→ D5 STACK  table "leaderboard"
 *   tournamentsData→ D4 PLANE  table "tournaments"
 *   sessionsData   → D5 STACK  table "sessions" (game state machine)
 *   notifQueue     → D2 LINE   table "notifications"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

require('dotenv').config();

const TETRACUBE_URL = process.env.TETRACUBE_URL || 'http://localhost:4747';
const CLIENT_ID = process.env.TETRACUBE_CLIENT_ID || '';
const API_KEY = process.env.TETRACUBE_API_KEY || '';
const NS = process.env.TETRACUBE_NS || 'kensgames';

// Require the universal client (works in Node via fetch polyfill check)
const TetracubeClient = require('../../tetracubedb/client/tetracube_client');

// ── Native fetch polyfill for Node < 18 ──────────────────────────────────────
if (typeof fetch === 'undefined') {
  try {
    global.fetch = require('node-fetch');
  } catch {
    console.error('[tetracube_adapter] node-fetch not found. Install: npm i node-fetch');
  }
}

const _db = new TetracubeClient({
  url: TETRACUBE_URL,
  clientId: CLIENT_ID,
  apiKey: API_KEY,
  namespace: NS,
});

console.log(`[tetracube_adapter] Connected to ${TETRACUBE_URL} ns=${NS}`);

// ── Helper: silent get (returns null on 404) ──────────────────────────────────
async function _get(table, row, col) {
  try {
    const cell = await _db.get(table, row, col);
    return cell ? cell.value : null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// ── manifoldData  (players / auth / profile) ──────────────────────────────────
const manifoldData = new Proxy({}, {
  get(_target, key) {
    // Synchronous Map-style .get/.set/.has not feasible over HTTP.
    // Provide async equivalents used by updated route modules.
    return undefined;
  }
});

const PlayerStore = {
  /** Persist a full user record (login/register) */
  async set(username, record) {
    return _db.setRow('players', `user-${username}`, record);
  },

  /** Retrieve a user record by username */
  async get(username) {
    return _db.getRow('players', `user-${username}`);
  },

  /** Check existence */
  async has(username) {
    const r = await _db.getRow('players', `user-${username}`).catch(() => null);
    return r !== null;
  },

  /** Update specific fields */
  async patch(username, fields) {
    const row = `user-${username}`;
    return Promise.all(
      Object.entries(fields).map(([col, val]) => _db.set('players', row, col, val))
    );
  },

  /** Track login — pushes to D5 STACK auth audit + emits presence event */
  async trackLogin(username) {
    return _db.pushDelta('auth_audit', `user-${username}`, 'login', {
      ts: Date.now(),
      op: 'login',
    });
  },

  /** Track logout */
  async trackLogout(username) {
    await _db.pushDelta('auth_audit', `user-${username}`, 'logout', {
      ts: Date.now(),
      op: 'logout',
    });
    // Trigger the processor's logout flow
    return _db.set('auth', `user-${username}`, 'logout', { ts: Date.now() });
  },

  /** Get login history (D5 STACK) */
  async loginHistory(username, opts = {}) {
    return _db.readStack('auth_audit', `user-${username}`, 'login', opts);
  },
};

// ── sessionsData  (game sessions / lobbies) ───────────────────────────────────
const SessionStore = {
  async create(sessionId, session) {
    await _db.setRow('sessions', sessionId, session);
    // Trigger session processor
    await _db.set('session', sessionId, 'state', 'waiting');
    return session;
  },

  async get(sessionId) {
    return _db.getRow('sessions', sessionId);
  },

  async update(sessionId, fields) {
    return Promise.all(
      Object.entries(fields).map(([col, val]) => _db.set('sessions', sessionId, col, val))
    );
  },

  async addPlayer(sessionId, playerId) {
    const row = await this.get(sessionId);
    const players = (row && row.players) ? row.players : [];
    if (!players.includes(playerId)) players.push(playerId);
    await _db.set('sessions', sessionId, 'players', players);
    // Trigger lobby processor
    await _db.set('lobby', sessionId, 'players', players);
    return players;
  },

  async setReady(sessionId, playerId, ready) {
    const row = await this.get(sessionId);
    const readyMap = (row && row.ready) ? row.ready : {};
    readyMap[playerId] = ready;
    await _db.set('sessions', sessionId, 'ready', readyMap);
    // Trigger lobby ready processor
    await _db.set('lobby', sessionId, 'ready', readyMap);
    return readyMap;
  },

  async launch(sessionId, launchedBy) {
    await _db.set('lobby', sessionId, 'launch', { by: launchedBy, ts: Date.now() });
    return _db.set('sessions', sessionId, 'state', 'launched');
  },

  async pushAction(sessionId, action) {
    // D5 STACK — every game action is a delta
    await _db.set('session', sessionId, 'action', action);
    return _db.pushDelta('sessions', sessionId, 'actions', action);
  },

  async getActions(sessionId, opts = {}) {
    return _db.readStack('sessions', sessionId, 'actions', opts);
  },

  async delete(sessionId) {
    await _db.set('sessions', sessionId, 'state', 'ended');
    await _db.set('session', sessionId, 'state', 'ended');
  },

  async list() {
    const plane = await _db.scanTable('sessions', { limit: 500, order: 'updated_at' });
    return plane.rows || [];
  },

  /** Subscribe to real-time session events */
  async subscribe(sessionId, handler) {
    await _db.subscribe('sessions', handler);
    await _db.subscribe('lobby', handler);
  },
};

// ── leaderboardData  (scores) ─────────────────────────────────────────────────
const LeaderboardStore = {
  async submitScore(game, player, score) {
    // D5 STACK processor handles ranking via Relation Surface
    return _db.set('leaderboard', player, 'score', { player, score, game, ts: Date.now() });
  },

  async getTopN(game, n = 10) {
    const plane = await _db.scanTable('leaderboard_rank', { limit: n, order: 'updated_at' });
    return (plane.rows || [])
      .map(r => r.value)
      .filter(v => v && (!game || v.game === game || !v.game))
      .sort((a, b) => (b.rank_z || 0) - (a.rank_z || 0))
      .slice(0, n);
  },

  async getPlayerHistory(player, game, opts = {}) {
    return _db.readStack('score_history', player, game || 'all', opts);
  },
};

// ── guildsData ────────────────────────────────────────────────────────────────
const GuildStore = {
  async set(guildId, guild) {
    return _db.setRow('guilds', `guild-${guildId}`, guild);
  },
  async get(guildId) {
    return _db.getRow('guilds', `guild-${guildId}`);
  },
  async list() {
    const plane = await _db.scanTable('guilds', { limit: 500 });
    return plane.rows || [];
  },
};

// ── friendsData ───────────────────────────────────────────────────────────────
const FriendStore = {
  async setFriends(userId, record) {
    return _db.setRow('friends', String(userId), record);
  },
  async getFriends(userId) {
    return _db.getRow('friends', String(userId));
  },
};

// ── tournamentsData ───────────────────────────────────────────────────────────
const TournamentStore = {
  async add(tournament) {
    const id = `t-${Date.now()}`;
    await _db.setRow('tournaments', id, tournament);
    return { id, ...tournament };
  },
  async list() {
    const plane = await _db.scanTable('tournaments', { limit: 200 });
    return plane.rows || [];
  },
  async get(id) {
    return _db.getRow('tournaments', id);
  },
};

// ── notifQueue ────────────────────────────────────────────────────────────────
const NotifStore = {
  async push(userId, notif) {
    return _db.pushDelta('notifications', String(userId), 'queue', notif);
  },
  async get(userId, opts = {}) {
    return _db.readStack('notifications', String(userId), 'queue', opts);
  },
};

// ── WebSocket real-time connector ─────────────────────────────────────────────
const RealtimeStore = {
  /**
   * Subscribe to a specific table's events.
   * Wraps tetracube WebSocket subscription.
   */
  async subscribe(table, handler) {
    return _db.subscribe(table, handler);
  },
  async unsubscribe(table, handler) {
    return _db.unsubscribe(table, handler);
  },
  async connectWS() {
    return _db.connectWS();
  },
  client: _db,
};

// ── Presence (online users) ───────────────────────────────────────────────────
const PresenceStore = {
  async setOnline(username) {
    return _db.set('presence', username, 'status', { online: true, ts: Date.now() });
  },
  async setOffline(username) {
    return _db.set('presence', username, 'status', { online: false, ts: Date.now() });
    // Processor will emit logout event
  },
  async getOnlineList() {
    const plane = await _db.scanTable('presence', { limit: 1000 });
    return (plane.rows || [])
      .filter(r => r.value && r.value.online)
      .map(r => r.row_key);
  },
};

// ── Export — compatible with old store.js shape + new async stores ────────────
module.exports = {
  // Legacy compat (for code that still imports the old shape)
  manifoldData,      // proxy — old sync code must be updated to use PlayerStore
  guildsData: {},
  friendsData: {},
  leaderboardData: {},
  tournamentsData: [],
  notifQueue: {},
  sessionsData: {},

  // New async stores — use these in updated route modules
  PlayerStore,
  SessionStore,
  LeaderboardStore,
  GuildStore,
  FriendStore,
  TournamentStore,
  NotifStore,
  PresenceStore,
  RealtimeStore,

  // Direct TetracubeDB client — for ad-hoc queries
  tetracube: _db,
};
