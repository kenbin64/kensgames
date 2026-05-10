/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 KENSGAMES UNIFIED LOBBY — manifold projection over WebSocket
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Round 2 of the paradigm reversal. The server is now a TRANSPORT; identity
 * lives in the seed log via server/manifold-projection.js. Every session,
 * player, and lifecycle event is a bloom on the four-function loop.
 *
 *   wire protocol:  unchanged (drop-in for FastTrack / Starfighter clients)
 *   authority:      seed log (state/seeds.jsonl) — the manifold's backup
 *   runtime:        TPMS field (js/manifold-field.js) — the manifold itself
 *
 * Listens on PORT (default 8765). nginx proxies wss://kensgames.com/ws here.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');


const Field = require('../js/manifold-field.js');
const Proj = require('./manifold-projection.js');

const PlayerManager = require('./player-manager.js');
const UserRegistry = require('./user-registry.js');
const GameObject = require('./game-object.js');
const KernelRouter = require('./game-kernel/lobby-router.js');

// ── Colyseus room factory (optional; degrades gracefully if not running) ─────
const COLYSEUS_PORT = parseInt(process.env.COLYSEUS_PORT || '2567', 10);
const COLYSEUS_BASE = `http://127.0.0.1:${COLYSEUS_PORT}`;

async function createColyseusRoom(gameId, options) {
  try {
    const fetch = globalThis.fetch || await import('node-fetch').then(m => m.default).catch(() => null);
    if (!fetch) return null;
    const res = await fetch(`${COLYSEUS_BASE}/matchmake/create/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
      signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.roomId ? data : null;
  } catch { return null; }
}

const PORT = parseInt(process.env.LOBBY_PORT || '8765', 10);
const SEED_LOG = process.env.SEED_LOG || path.join(__dirname, '..', 'state', 'seeds.jsonl');
const REPO_ROOT = path.join(__dirname, '..');
const STATE_DIR = path.join(REPO_ROOT, 'state');
const GM_LOG_FILE = process.env.GM_LOG || path.join(STATE_DIR, 'game-manager.log');
const GM_LOG_MAX_BYTES = 4 * 1024 * 1024;     // rotate >4MB
const GM_INGEST_MAX_BYTES = 16 * 1024;        // single POST cap

function appendGmLog(entry) {
  const line = JSON.stringify(entry) + '\n';
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    if (fs.existsSync(GM_LOG_FILE) && fs.statSync(GM_LOG_FILE).size > GM_LOG_MAX_BYTES) {
      try { fs.renameSync(GM_LOG_FILE, GM_LOG_FILE + '.1'); } catch (_) { }
    }
    fs.appendFileSync(GM_LOG_FILE, line, 'utf8');
  } catch (_) { /* best-effort; never crash the server */ }
}

function readGmLogTail(limit) {
  try {
    if (!fs.existsSync(GM_LOG_FILE)) return [];
    const raw = fs.readFileSync(GM_LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const n = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));
    return lines.slice(-n).map((ln) => { try { return JSON.parse(ln); } catch (_) { return { raw: ln }; } });
  } catch (_) { return []; }
}

// JSON body reader bounded by `maxBytes`. Resolves to a parsed object or rejects.
function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let buf = '';
    let aborted = false;
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > maxBytes) {
        aborted = true;
        reject(new Error('payload_too_large'));
        try { req.destroy(); } catch (_) { }
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve(JSON.parse(buf || '{}')); }
      catch (_) { reject(new Error('invalid_json')); }
    });
    req.on('error', () => { if (!aborted) reject(new Error('read_error')); });
  });
}

// Tiny in-memory rate limiter (n requests per windowMs per key).
const _rateBuckets = new Map();
function rateLimit(key, n, windowMs) {
  const now = Date.now();
  const bucket = _rateBuckets.get(key) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  if (fresh.length >= n) { _rateBuckets.set(key, fresh); return false; }
  fresh.push(now);
  _rateBuckets.set(key, fresh);
  return true;
}

// Optional SMTP recovery sender. Refuses if SMTP_HOST not set (caller returns 503).
function sendRecoveryEmail(to, secret) {
  if (!process.env.SMTP_HOST) return Promise.reject(new Error('recovery_disabled'));
  // Lazy require so plain server runs without nodemailer installed.
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (_) { return Promise.reject(new Error('recovery_disabled')); }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@kensgames.com',
    to,
    subject: 'Your KensGames secret username',
    text: `Your secret username is:\n\n  ${secret}\n\nKeep it private — anyone with it can sign in as you.`,
  });
}

// ── Boot: open seed log, bloom games from manifests ─────────────────────────
const log = Proj.load(SEED_LOG);

function bootGameCatalog() {
  // Portal manifest first (provides display names + dimensions).
  const portalPath = path.join(REPO_ROOT, 'manifold.portal.json');
  const games = [];
  try {
    const portal = JSON.parse(fs.readFileSync(portalPath, 'utf8'));
    (portal.games || []).forEach(g => games.push({
      id: g.id, name: g.name, dimension: g.dimension || null,
      // Portal manifest uses `manifold` (path to per-game json); accept either spelling.
      manifest: g.manifold || g.manifest || null,
      dirPath: g.path || null,
    }));
  } catch (e) { /* portal manifest optional */ }
  // Per-game manifests for dimension data.
  // Always re-read maxPlayers/recommendedPlayers from the manifest even if dimension was supplied
  // by the portal, because the portal manifest does not carry per-game cap fields.
  games.forEach(g => {
    try {
      // Prefer the explicit manifest path from the portal (handles dirs whose
      // case differs from the lowercase game id, e.g. 4DTicTacToe vs 4dtictactoe).
      const candidates = [
        g.manifest && path.join(REPO_ROOT, g.manifest),
        g.dirPath && path.join(REPO_ROOT, g.dirPath, 'manifold.game.json'),
        path.join(REPO_ROOT, g.id, 'manifold.game.json'),
      ].filter(Boolean);
      let mg = null;
      for (const c of candidates) {
        try { mg = JSON.parse(fs.readFileSync(c, 'utf8')); break; } catch (_) { /* try next */ }
      }
      if (!mg) throw new Error('no manifest found');
      if (!g.dimension) g.dimension = mg.dimension || { x: 1, y: 1, z: 1 };
      // maxPlayers is a gameplay cap and is authoritative from the manifest.
      const manifestMax = Number(mg.maxPlayers || mg.max_players || 0);
      if (Number.isFinite(manifestMax) && manifestMax >= 2) {
        g.maxPlayers = Math.floor(manifestMax);
      }
      const manifestRec = Number(mg.recommendedPlayers || mg.recommended_players || 0);
      if (Number.isFinite(manifestRec) && manifestRec >= 1) {
        g.recommendedPlayers = Math.floor(manifestRec);
      }
    } catch (e) { if (!g.dimension) g.dimension = { x: 1, y: 1, z: 1 }; }
  });
  // Fallback minimal catalog for known games not in the manifest.
  // Tuple shape: [id, name, maxPlayers, recommendedPlayers].
  const have = new Set(games.map(g => g.id));
  [['fasttrack', 'Fast Track', 6, 4], ['starfighter', 'Starfighter', 4, 4],
  ['brickbreaker3d', 'BrickBreaker 3D', 4, 2], ['4dtictactoe', '4D Tic-Tac-Toe', 4, 2],
  ['cubic3d', 'Cubic', 4, 2]].forEach(([id, name, mp, rp]) => {
    if (!have.has(id)) games.push({ id, name, dimension: { x: mp, y: 1, z: mp }, maxPlayers: mp, recommendedPlayers: rp });
  });
  games.forEach(g => Proj.ensureGame(log, g.id, g.dimension, g.name));
  return games;
}

const CATALOG = bootGameCatalog();
const CATALOG_BY_ID = Object.fromEntries(CATALOG.map(g => [g.id, g]));

const GAME_ROUTE_INDEX = {
  fasttrack: { path: '/fasttrack/3d.html', lobby: '/fasttrack/lobby.html' },
  starfighter: { path: '/starfighter/index.html', lobby: '/starfighter/lobby.html' },
  brickbreaker3d: { path: '/brickbreaker3d/play.html', lobby: '/brickbreaker3d/lobby.html' },
  brickbreaker: { path: '/brickbreaker3d/play.html', lobby: '/brickbreaker3d/lobby.html' },
  '4dtictactoe': { path: '/4DTicTacToe/', lobby: '/4DTicTacToe/' },
  tictactoe: { path: '/4DTicTacToe/', lobby: '/4DTicTacToe/' },
  cubic3d: { path: '/cubic3d/', lobby: '/cubic3d/' },
};

function gameRoutes(gameId) {
  const key = String(gameId || '').toLowerCase();
  return GAME_ROUTE_INDEX[key] || { path: '/', lobby: '/' };
}

// ── In-memory caches projected from the seed log ───────────────────────────
// These are CACHES of the log frontier, not authority. On restart they are
// rebuilt from the log in O(N) where N = active sessions.
const liveSessions = new Map();   // session_x_id → { x, players, settings, status, …ephemeral }
const connections = new Map();    // peer → { user_id, user, session_x_id }
const activePeers = new Set();    // connected peers (authenticated or not)

// ── Player Manager (single authority for all active sessions) ───────────────
const pm = new PlayerManager(connections, liveSessions, send, broadcastSession);

function freshSession(sx, gameId, hostUser, isPrivate) {
  const game = CATALOG_BY_ID[gameId] || { name: gameId, maxPlayers: 6, recommendedPlayers: 4 };
  return {
    x: sx,
    session_id: sx.id,
    session_code: Proj.codeFromSeed(sx.seed),
    game_uuid: crypto.randomUUID(),
    game_id: gameId,
    game_name: game.name,
    host_id: hostUser.user_id,
    host_username: hostUser.username,
    is_private: !!isPrivate,
    max_players: game.maxPlayers || 6,
    recommended_players: game.recommendedPlayers || game.maxPlayers || 4,
    players: [],
    settings: { lobby_accepted: false, allow_return: true },
    // Single authoritative runtime object for this session.
    authoritative: {
      instance_id: crypto.randomUUID(),
      rev: 0,
      state: null,
      updated_by: null,
      updated_at: null,
    },
    status: 'waiting',
    created_at: Date.now(),
  };
}

function sanitize(s) {
  return {
    session_id: s.session_id,
    session_code: s.session_code,
    colyseus_room_id: s.colyseus_room_id || null,
    game_uuid: s.game_uuid || null,
    game_id: s.game_id,
    game_name: s.game_name,
    host_id: s.host_id,
    host_username: s.host_username,
    is_private: s.is_private,
    max_players: s.max_players,
    recommended_players: s.recommended_players,
    player_count: s.players.length,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready,
    })),
    settings: s.settings,
    status: s.status,
    manifold: { x_id: s.x.id, dim: s.x.dim, parent: s.x.parent },
  };
}

function send(peer, data) {
  if (!peer || !peer.websocket || peer.websocket.readyState !== 1) return;
  try { peer.send(JSON.stringify(data)); } catch (_) { /* best effort */ }
}
function broadcastSession(s, data, exclude) {
  if (!s || !s.session_id) return;
  for (const [peer, conn] of connections.entries()) {
    if (!conn || conn.session_x_id !== s.session_id) continue;
    // Compare peer references directly. Avoid touching `peer.id`, which on the
    // crossws Node adapter lazily generates a UUID via the global `crypto`
    // object — that throws "crypto is not defined" under some Node 18 ESM
    // module-scope conditions and was the actual cause of "Server error" on
    // join_by_code (handler error → generic error sent to client).
    if (exclude && peer === exclude) continue;
    send(peer, data);
  }
}
function broadcastAll(data) {
  for (const peer of activePeers) send(peer, data);
}

function sessionByCode(code) {
  // First try the live cache (newest), then fall back to a pure observe of
  // the seed log frontier — proves the "code is observable, not stored" path.
  const code6 = String(code || '').toUpperCase();
  for (const s of liveSessions.values()) if (s.session_code === code6) return s;
  const sx = Proj.findSessionByCode(log, code6);
  return sx ? liveSessions.get(sx.id) || null : null;
}

function publicSessions(gameId) {
  const out = [];
  for (const s of liveSessions.values()) {
    if (s.status !== 'waiting' || s.is_private) continue;
    if (gameId && s.game_id !== gameId) continue;
    out.push(sanitize(s));
  }
  return out;
}

function serializePlayers(s) {
  return (s.players || []).map((p) => ({
    user_id: p.user_id,
    username: p.username,
    avatar_id: p.avatar_id,
    is_host: !!p.is_host,
    is_ai: !!p.is_ai,
    slot: p.slot,
    ready: !!p.ready,
  }));
}

function sendAuthoritativeState(ws, s) {
  if (!ws || !s || !s.authoritative || !s.authoritative.state) return;
  send(ws, {
    type: 'game_state',
    session_id: s.session_id,
    game_uuid: s.game_uuid,
    instance_id: s.authoritative.instance_id,
    seq: s.authoritative.rev,
    authoritative: true,
    from: s.authoritative.updated_by || s.host_id,
    state: s.authoritative.state,
    players: serializePlayers(s),
    updated_at: s.authoritative.updated_at,
  });
}

// Pending grace-period removals for sockets that closed while a session was
// in the 'waiting' state. Keyed by `${sessionId}|${userId}`. If the user
// reconnects (via guest_login resume) before the timer fires, the removal
// is cancelled so a brief disconnect does not destroy the lobby session.
const pendingLobbyDisconnects = new Map();
const LOBBY_DISCONNECT_GRACE_MS = 60 * 1000;

function pendingDisconnectKey(sessionId, userId) { return `${sessionId}|${userId}`; }

function cancelPendingLobbyDisconnect(sessionId, userId) {
  const key = pendingDisconnectKey(sessionId, userId);
  const entry = pendingLobbyDisconnects.get(key);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pendingLobbyDisconnects.delete(key);
  return true;
}

// Remove a player from a waiting session by user_id, without requiring a live
// websocket. Mirrors leaveCurrentSession's seat-removal logic for the deferred
// (post-disconnect) path.
function removePlayerFromWaitingSession(sessionId, userId, username) {
  const s = liveSessions.get(sessionId);
  if (!s) return null;
  // If the user reconnected onto a different session, do nothing.
  if (!s.players.some(p => p.user_id === userId)) return null;
  s.players = s.players.filter(p => p.user_id !== userId);
  s.players.forEach((p, i) => { p.slot = i; });
  if (s.players.length === 0 || (s.host_id === userId && s.players.filter(p => !p.is_ai).length === 0)) {
    liveSessions.delete(s.session_id);
    GameObject.remove(s.session_id);
    KernelRouter.stop(s.session_id);
    broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: s.session_id });
    return s;
  }
  if (s.host_id === userId) {
    const newHost = s.players.find(p => !p.is_ai);
    if (newHost) { s.host_id = newHost.user_id; s.host_username = newHost.username; newHost.is_host = true; }
  }
  syncGameObjectSession(s);
  broadcastSession(s, {
    type: 'player_left', username: username || 'Player',
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
  emitGameObject(s);
  return s;
}

function scheduleLobbyDisconnect(sessionId, userId, username) {
  const key = pendingDisconnectKey(sessionId, userId);
  if (pendingLobbyDisconnects.has(key)) return; // already scheduled
  const timer = setTimeout(() => {
    pendingLobbyDisconnects.delete(key);
    removePlayerFromWaitingSession(sessionId, userId, username);
  }, LOBBY_DISCONNECT_GRACE_MS);
  if (timer.unref) timer.unref();
  pendingLobbyDisconnects.set(key, { timer, sessionId, userId, username });
}

function leaveCurrentSession(ws, conn) {
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return null;
  KernelRouter.detachPeer(ws, conn);
  s.players = s.players.filter(p => p.user_id !== conn.user_id);
  s.players.forEach((p, i) => { p.slot = i; });
  ws.leave(s.session_id);
  conn.session_x_id = null;
  if (s.players.length === 0 || (s.host_id === conn.user_id && s.players.filter(p => !p.is_ai).length === 0)) {
    liveSessions.delete(s.session_id);
    GameObject.remove(s.session_id);
    KernelRouter.stop(s.session_id);
    broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: s.session_id });
    return s;
  }
  if (s.host_id === conn.user_id) {
    const newHost = s.players.find(p => !p.is_ai);
    if (newHost) { s.host_id = newHost.user_id; s.host_username = newHost.username; newHost.is_host = true; }
  }
  syncGameObjectSession(s);
  broadcastSession(s, {
    type: 'player_left', username: conn.user.username,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
  emitGameObject(s);
  return s;
}

// ── Handlers ────────────────────────────────────────────────────────────────
const handlers = {};

handlers.ping = (ws) => send(ws, { type: 'pong' });
handlers.cancel_join_request = () => { /* no-op */ };

function stableGuestId(token) {
  if (!token || typeof token !== 'string') return null;
  const normalized = String(token).trim();
  if (!normalized) return null;
  // Keep identity stable across lobby -> game navigation for any bearer token
  // (guest token or site auth token) so reconnect can rejoin the same room.
  return 'guest_' + crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

const TECH_BOT_NAMES = ['quantum', 'nexus', 'circuit', 'vector', 'axiom', 'cypher', 'ion', 'neon'];

function sanitizeUsername(raw, fallback) {
  const cleaned = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  if (cleaned.length >= 2) return cleaned;
  return String(fallback || 'Player').slice(0, 20);
}

function normalizeAvatarId(raw) {
  // Accept emoji and word-id avatars; only sanitize obviously invalid payloads.
  return GameObject.sanitizeAvatar(raw, '👤');
}

function hasRenderableProfile(conn) {
  if (!conn || !conn.user) return false;
  const nameOk = String(conn.user.username || '').trim().length >= 2;
  const avatarOk = !!normalizeAvatarId(conn.user.avatar_id);
  return nameOk && avatarOk;
}

function toSessionPlayersFromGame(gameJson) {
  return (gameJson.players || []).map((p) => ({
    user_id: p.userId,
    username: p.name,
    avatar_id: p.avatar,
    is_host: !!p.isHost,
    is_ai: !!p.isAI,
    slot: Number(p.slot) || 0,
    ready: !!p.isReady,
  }));
}

function syncGameObjectSession(session) {
  const g = GameObject.upsertFromSession(session);
  if (!g) return null;
  const gj = g.toJSON();
  session.players = toSessionPlayersFromGame(gj);
  session.host_id = gj.hostId || session.host_id;
  const host = session.players.find(p => p.user_id === session.host_id);
  if (host) session.host_username = host.username;
  session.max_players = gj.maxPlayers;
  session.settings = { ...(gj.settings || {}) };
  session.status = gj.phase || session.status;
  return gj;
}

function emitGameObject(session, options) {
  const gameObject = syncGameObjectSession(session);
  if (!gameObject) return;
  const payload = { type: 'game_object', game_object: gameObject, session_id: session.session_id };
  if (options && options.toSocket) {
    send(options.toSocket, payload);
    return;
  }
  broadcastSession(session, payload, options && options.excludeSocket);
}

function techBotName(seedName, aiCount) {
  const base = String(seedName || TECH_BOT_NAMES[aiCount % TECH_BOT_NAMES.length])
    .trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'nexus';
  return `${base}_bot`;
}

handlers.guest_login = (ws, data) => {
  const token = data && data.token ? String(data.token) : '';
  const userId = stableGuestId(token) || ('guest_' + crypto.randomBytes(6).toString('hex'));
  const rawName = String((data && (data.name || data.username || data.guest_name)) || '').trim();
  const username = sanitizeUsername(rawName, `Player-${userId.slice(-4)}`);
  const avatarId = normalizeAvatarId((data && (data.avatar_id || data.avatarId)) || 'person_smile');
  const user = {
    user_id: userId, id: userId, username, avatar_id: avatarId, is_guest: true,
    prestige_level: 'bronze', prestige_points: 0, games_played: 0, games_won: 0, guild_id: null
  };
  connections.set(ws, { user_id: userId, user, session_x_id: null });
  send(ws, { type: 'auth_success', action: 'guest_login', user, user_id: userId, username });
  for (const s of liveSessions.values()) {
    if (s.players.some(p => p.user_id === userId)) {
      // Cancel any pending lobby-disconnect grace timer for this user/session
      // so a quick reconnect (page navigation, network blip) does not later
      // remove them from a waiting lobby they have just rejoined.
      cancelPendingLobbyDisconnect(s.session_id, userId);
      connections.get(ws).session_x_id = s.session_id;
      ws.join(s.session_id);
      send(ws, { type: 'session_update', session: sanitize(s), action: 'resume' });
      emitGameObject(s, { toSocket: ws });
      if (s.status === 'playing') send(ws, { type: 'game_started', session: sanitize(s) });
      if (s.status === 'playing') {
        pm.registerConnection(userId, ws);
      }
      break;
    }
  }
};
handlers.auth = (ws, data) => handlers.guest_login(ws, {
  token: data && data.token, name: data && (data.username || data.guest_name),
  avatar_id: data && (data.avatar_id || data.avatarId),
});
handlers.login = (ws, data) => handlers.guest_login(ws, data);
handlers.register = (ws, data) => handlers.guest_login(ws, data);
handlers.logout = (ws) => {
  const conn = connections.get(ws);
  if (conn) { leaveCurrentSession(ws, conn); connections.delete(ws); }
  send(ws, { type: 'logged_out' });
};
handlers.get_profile = (ws) => {
  const conn = connections.get(ws); if (!conn) return;
  send(ws, { type: 'profile', user: conn.user });
};
handlers.update_profile = (ws, data) => {
  const conn = connections.get(ws); if (!conn) return;
  if (data && data.avatar_id) conn.user.avatar_id = normalizeAvatarId(data.avatar_id);
  if (data && data.username) {
    conn.user.username = sanitizeUsername(data.username, conn.user.username);
  }
  const s = liveSessions.get(conn.session_x_id);
  if (s) {
    const p = s.players.find(pp => pp.user_id === conn.user_id);
    if (p) {
      p.username = conn.user.username;
      p.avatar_id = conn.user.avatar_id;
    }
    emitGameObject(s);
    broadcastSession(s, { type: 'session_update', session: sanitize(s), action: 'profile_updated' });
  }
  send(ws, { type: 'profile_updated', user: conn.user });
};
handlers.update_player_info = handlers.update_profile;

handlers.create_session = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not authenticated' });
  if (!hasRenderableProfile(conn)) {
    return send(ws, { type: 'error', message: 'Player profile requires a name and renderable avatar before creating a game' });
  }
  if (conn.session_x_id) leaveCurrentSession(ws, conn);
  const gameId = (data && data.game_id) || 'fasttrack';
  if (!CATALOG_BY_ID[gameId]) return send(ws, { type: 'error', message: 'Unknown game: ' + gameId });
  const isPrivate = !!(data && data.private);
  const mode = (data && data.mode) || (isPrivate ? 'private' : 'public');
  const sx = Proj.bloomSession(log, gameId, mode, conn.user_id, { is_private: isPrivate });
  const s = freshSession(sx, gameId, conn.user, isPrivate);
  if (data && typeof data.max_players === 'number') {
    s.max_players = Math.min(Math.max(data.max_players, 2), s.max_players);
  }
  if (data && data.settings) Object.assign(s.settings, data.settings);
  s.players.push({
    user_id: conn.user_id, username: conn.user.username,
    avatar_id: normalizeAvatarId(conn.user.avatar_id), is_host: true, is_ai: false, slot: 0, ready: false
  });
  syncGameObjectSession(s);
  liveSessions.set(s.session_id, s);
  conn.session_x_id = s.session_id;
  ws.join(s.session_id);
  send(ws, { type: 'session_created', session: sanitize(s) });
  emitGameObject(s);
  if (!isPrivate) broadcastAll({ type: 'lobby_update', action: 'session_created', session_id: s.session_id });
};

handlers.list_sessions = (ws, data) => {
  send(ws, { type: 'session_list', sessions: publicSessions(data && data.game_id) });
};

function joinExisting(ws, conn, s) {
  const isReturningPlayer = !!(s && Array.isArray(s.players) && s.players.some(p => p.user_id === conn.user_id));
  if (isReturningPlayer) {
    console.log('[joinExisting] Returning player:', conn.user_id, 'to session', s.session_id);
    conn.session_x_id = s.session_id;
    ws.join(s.session_id);
    send(ws, { type: 'session_joined', session: sanitize(s), action: 'rejoined' });
    emitGameObject(s, { toSocket: ws });
    if (s.status === 'playing') {
      pm.registerConnection(conn.user_id, ws);
      sendAuthoritativeState(ws, s);
    }
    return;
  }
  // Reclaim-seat: if a bot is occupying the seat that previously belonged to
  // this returning user, swap the bot back out for the human (subject to host
  // setting allow_return).
  const botSeat = (s.players || []).find(p => p && p.is_ai && p.replaced_user_id === conn.user_id);
  if (botSeat) {
    if (s.settings && s.settings.allow_return === false) {
      return send(ws, { type: 'error', message: 'Host has disabled returning players for this game.' });
    }
    const idx = s.players.indexOf(botSeat);
    s.players[idx] = {
      user_id: conn.user_id,
      username: conn.user.username,
      avatar_id: normalizeAvatarId(conn.user.avatar_id),
      is_host: !!botSeat.is_host,
      is_ai: false,
      slot: botSeat.slot,
      ready: true,
    };
    syncGameObjectSession(s);
    conn.session_x_id = s.session_id;
    ws.join(s.session_id);
    send(ws, { type: 'session_joined', session: sanitize(s), action: 'reclaimed' });
    broadcastSession(s, {
      type: 'player_reclaimed_seat',
      session_id: s.session_id,
      user_id: conn.user_id,
      username: conn.user.username,
      removed_bot_id: botSeat.user_id,
      players: s.players,
      message: `${conn.user.username} returned and reclaimed their seat.`,
    });
    broadcastSession(s, { type: 'session_update', session: sanitize(s), action: 'reclaimed' });
    if (s.status === 'playing') {
      // Wire the human back into PlayerManager and re-send authoritative state.
      pm.registerConnection(conn.user_id, ws);
      sendAuthoritativeState(ws, s);
    }
    emitGameObject(s);
    return;
  }
  if (!hasRenderableProfile(conn)) {
    console.log('[joinExisting] ERROR: No renderable profile for user:', conn.user_id, 'user:', conn.user);
    return send(ws, { type: 'error', message: 'Player profile requires a name and renderable avatar before joining a game' });
  }
  if (s.status !== 'waiting') {
    console.log('[joinExisting] ERROR: Game not waiting, status:', s.status);
    return send(ws, { type: 'error', message: 'Game already started' });
  }
  if (s.players.length >= s.max_players) {
    console.log('[joinExisting] ERROR: Game is full');
    return send(ws, { type: 'error', message: 'Game is full' });
  }
  if (conn.session_x_id) leaveCurrentSession(ws, conn);
  console.log('[joinExisting] New player joining:', conn.user_id, 'to session', s.session_id);
  Proj.bloomPlayer(log, s.x, { user_id: conn.user_id, username: conn.user.username });
  s.players.push({
    user_id: conn.user_id, username: conn.user.username,
    avatar_id: normalizeAvatarId(conn.user.avatar_id), is_host: false, is_ai: false, slot: s.players.length, ready: false
  });
  s.settings.lobby_accepted = false;
  syncGameObjectSession(s);
  conn.session_x_id = s.session_id;
  ws.join(s.session_id);
  send(ws, { type: 'session_joined', session: sanitize(s) });
  broadcastSession(s, {
    type: 'player_joined', username: conn.user.username,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  }, ws);
  emitGameObject(s);
  broadcastSession(s, { type: 'session_update', session: sanitize(s), action: 'joined' });
}

handlers.join_session = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not authenticated' });
  const s = liveSessions.get(data && data.session_id);
  if (!s) return send(ws, { type: 'error', message: 'Game not found' });
  joinExisting(ws, conn, s);
};

handlers.join_by_code = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) {
    console.log('[join_by_code] ERROR: No connection for socket', data && data.code);
    return send(ws, { type: 'error', message: 'Not authenticated' });
  }
  const code = String(data && data.code || '').toUpperCase();
  const s = sessionByCode(code);
  if (!s) {
    console.log('[join_by_code] ERROR: Session not found for code:', code);
    return send(ws, { type: 'error', message: 'Invalid game code' });
  }
  console.log('[join_by_code] SUCCESS: Joining session', code, 'for user', conn.user_id);
  joinExisting(ws, conn, s);
};

// matchmake: industry-standard QuickJoin. Find the oldest waiting public
// session for game_id with at least one seat open and join it. If none
// exists, create a new public session so the player waits as host.
handlers.matchmake = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not authenticated' });
  if (!hasRenderableProfile(conn)) {
    return send(ws, { type: 'error', message: 'Player profile requires a name and renderable avatar before matchmaking' });
  }
  const gameId = (data && data.game_id) || 'fasttrack';
  if (!CATALOG_BY_ID[gameId]) return send(ws, { type: 'error', message: 'Unknown game: ' + gameId });
  const candidates = [];
  for (const s of liveSessions.values()) {
    if (s.status !== 'waiting' || s.is_private) continue;
    if (s.game_id !== gameId) continue;
    if (s.players.length >= s.max_players) continue;
    if (s.players.some(p => p.user_id === conn.user_id)) continue;
    candidates.push(s);
  }
  candidates.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  if (candidates.length > 0) {
    send(ws, { type: 'matchmake_result', action: 'joined', session_id: candidates[0].session_id });
    return joinExisting(ws, conn, candidates[0]);
  }
  // No open public session — create one and wait.
  const sx = Proj.bloomSession(log, gameId, 'public', conn.user_id, { is_private: false });
  const s = freshSession(sx, gameId, conn.user, false);
  s.players.push({
    user_id: conn.user_id, username: conn.user.username,
    avatar_id: normalizeAvatarId(conn.user.avatar_id), is_host: true, is_ai: false, slot: 0, ready: false
  });
  syncGameObjectSession(s);
  liveSessions.set(s.session_id, s);
  conn.session_x_id = s.session_id;
  ws.join(s.session_id);
  send(ws, { type: 'matchmake_result', action: 'created', session_id: s.session_id });
  send(ws, { type: 'session_created', session: sanitize(s) });
  emitGameObject(s);
  broadcastAll({ type: 'lobby_update', action: 'session_created', session_id: s.session_id });
};

handlers.resolve_code = (ws, data) => {
  const code = String((data && data.code) || '').toUpperCase();
  const s = sessionByCode(code);
  if (!s) return send(ws, { type: 'resolve_code_result', found: false, code });
  const game = CATALOG_BY_ID[s.game_id] || {};
  const routes = gameRoutes(s.game_id);
  send(ws, {
    type: 'resolve_code_result',
    found: true,
    code,
    game_id: s.game_id,
    game_name: game.name || s.game_name || s.game_id,
    game_path: routes.path,
    game_lobby_path: routes.lobby,
    session: sanitize(s),
  });
};

handlers.leave_session = (ws) => {
  const conn = connections.get(ws); if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (s && s.status === 'playing') {
    pm.replacePlayerWithBot(s.session_id, conn.user_id, 'player_left');
    conn.session_x_id = null;
    return send(ws, { type: 'left_session' });
  }
  leaveCurrentSession(ws, conn);
  send(ws, { type: 'left_session' });
};

// Host-only: tear down the session entirely. Notifies every connected player
// and removes the lobby/in-game room.
handlers.cancel_session = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not authenticated' });
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return send(ws, { type: 'error', message: 'Not in a game' });
  if (s.host_id !== conn.user_id) return send(ws, { type: 'error', message: 'Only the host can cancel the game' });
  const sessionId = s.session_id;
  // Tell everyone (including host) the room is gone, then tear it down.
  broadcastSession(s, {
    type: 'session_cancelled',
    session_id: sessionId,
    by: conn.user_id,
    message: 'Host cancelled the game.',
  });
  // Stop kernels / PM / colyseus rooms.
  try { KernelRouter.stop(sessionId); } catch (e) { }
  try { pm.cancelSession && pm.cancelSession(sessionId, 'host_cancelled'); } catch (e) { }
  // Drop every connection's session pointer and leave the ws room.
  for (const [peer, peerConn] of connections) {
    if (peerConn.session_x_id === sessionId) {
      try { peer.leave(sessionId); } catch (e) { }
      peerConn.session_x_id = null;
    }
  }
  liveSessions.delete(sessionId);
  GameObject.remove(sessionId);
  broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: sessionId });
  send(ws, { type: 'left_session' });
};

handlers.update_session_settings = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s || s.host_id !== conn.user_id) return;
  if (data && data.settings) Object.assign(s.settings, data.settings);
  if (data && typeof data.max_players === 'number') {
    const game = CATALOG_BY_ID[s.game_id] || {};
    const ceiling = Number.isFinite(game.maxPlayers) ? game.maxPlayers : 6;
    const requested = Math.max(2, Math.min(ceiling, data.max_players));
    // Never drop below current player count
    s.max_players = Math.max(requested, s.players.length);
  }
  s.settings.lobby_accepted = false;
  syncGameObjectSession(s);
  broadcastSession(s, { type: 'session_settings_updated', session: sanitize(s) });
  emitGameObject(s);
};

handlers.toggle_ready = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return;
  const player = s.players.find(p => p.user_id === conn.user_id);
  if (!player) return;
  player.ready = !player.ready;
  s.settings.lobby_accepted = false;
  syncGameObjectSession(s);
  const payload = sanitize(s);
  broadcastSession(s, { type: 'ready_update', session: payload, user_id: conn.user_id, ready: player.ready });
  send(ws, { type: 'ready_update', session: payload, user_id: conn.user_id, ready: player.ready });
  emitGameObject(s);
};

handlers.accept_lobby = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return;
  if (s.host_id !== conn.user_id) return send(ws, { type: 'error', message: 'Only the host can accept the group' });
  if (!s.players.every(p => p.is_ai || p.ready)) {
    return send(ws, { type: 'error', message: 'All players must be ready before accepting' });
  }
  s.settings.lobby_accepted = true;
  syncGameObjectSession(s);
  Proj.bloomEvent(log, s.x, [1, 1, 0, 0, 0, 0], { kind: 'lobby_accepted', session_id: s.session_id });
  broadcastSession(s, { type: 'lobby_accepted', session: sanitize(s) });
  send(ws, { type: 'lobby_accepted', session: sanitize(s) });
  emitGameObject(s);
};

handlers.add_ai_player = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s || s.host_id !== conn.user_id) return send(ws, { type: 'error', message: 'Only host can add bots' });
  if (s.players.length >= s.max_players) return send(ws, { type: 'error', message: 'Game is full' });
  const aiCount = s.players.filter(p => p.is_ai).length;
  if (aiCount >= 3) return send(ws, { type: 'error', message: 'Maximum 3 bots allowed' });
  const aiId = 'ai_' + crypto.randomBytes(4).toString('hex');
  const aiName = techBotName((data && data.name) || TECH_BOT_NAMES[aiCount % TECH_BOT_NAMES.length], aiCount);
  s.players.push({
    user_id: aiId, username: aiName, avatar_id: 'robot',
    is_host: false, is_ai: true, slot: s.players.length, ready: true
  });
  s.settings.lobby_accepted = false;
  syncGameObjectSession(s);
  broadcastSession(s, {
    type: 'player_joined', username: aiName,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
  emitGameObject(s);
  broadcastSession(s, { type: 'session_update', session: sanitize(s), action: 'ai_added' });
};

handlers.remove_ai_player = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s || s.host_id !== conn.user_id) return;
  const aiId = data && data.user_id;
  const idx = s.players.findIndex(p => p.is_ai && p.user_id === aiId);
  if (idx < 0) return;
  const removed = s.players.splice(idx, 1)[0];
  s.players.forEach((p, i) => { p.slot = i; });
  s.settings.lobby_accepted = false;
  syncGameObjectSession(s);
  broadcastSession(s, {
    type: 'player_left', username: removed.username,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
  emitGameObject(s);
  broadcastSession(s, { type: 'session_update', session: sanitize(s), action: 'ai_removed' });
};

handlers.start_game = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return send(ws, { type: 'error', message: 'Not in a game' });
  if (s.status === 'playing') return send(ws, { type: 'error', message: 'Game already launched for this session' });
  if (s.host_id !== conn.user_id) return send(ws, { type: 'error', message: 'Only the host can start the game' });
  // Minimum players: kernel-game minimum if specified, otherwise 2.
  const kernelMin = KernelRouter.isKernelGame(s.game_id) ? KernelRouter.minPlayers(s.game_id) : 2;
  const minNeeded = Math.max(2, kernelMin);
  if (s.players.length < minNeeded) return send(ws, { type: 'error', message: `Need at least ${minNeeded} player${minNeeded === 1 ? '' : 's'}` });
  if (!s.players.every(p => String(p.username || '').trim().length >= 2 && !!normalizeAvatarId(p.avatar_id))) {
    return send(ws, { type: 'error', message: 'Every player must have a name and renderable avatar before launch' });
  }
  // Host can start any time once 2+ players are seated — no ready/accept gating.
  s.settings.lobby_accepted = true;
  s.status = 'playing';
  syncGameObjectSession(s);
  emitGameObject(s);
  Proj.bloomEvent(log, s.x, [0, 0, 0, 0, 1, 1], { kind: 'game_started', session_id: s.session_id, game_id: s.game_id });
  if (!s.is_private) broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: s.session_id });

  // Game Kernel: opt-in per gameId. Attaches a GameMaster authoritative for
  // score/lives/level for the games registered in lobby-router.js.
  if (KernelRouter.isKernelGame(s.game_id)) {
    KernelRouter.start(s, {
      send,
      broadcastSession,
      connections,
      persistAction: (session, action) => {
        Proj.bloomEvent(log, session.x, [0, 0, 0, 0, 1, 0], {
          kind: 'kernel_action', session_id: session.session_id,
          game_id: session.game_id, action_type: action.type, by: action.playerId,
        });
      },
    });
  }

  // Create a Colyseus room for this session (delta-patch state sync engine).
  // Attach roomId to session so PlayerManager can include it in pm_game_ready.
  const colyseusOptions = {
    maxPlayers: s.max_players,
    sessionCode: s.session_code,
    lobbySessionId: s.session_id,
  };
  createColyseusRoom(s.game_id, colyseusOptions).then(room => {
    if (room && room.roomId) {
      s.colyseus_room_id = room.roomId;
      // Notify all players in the session of the Colyseus room endpoint
      broadcastSession(s, {
        type: 'colyseus_room',
        roomId: room.roomId,
        endpoint: `wss://kensgames.com/colyseus`,
        session_id: s.session_id,
      });
    }
    // Hand off to PlayerManager regardless of whether Colyseus is available
    pm.startSession(s.session_id);
  }).catch(() => pm.startSession(s.session_id));
};

handlers.pm_sync_report = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const sessionId = (data && data.session_id) || conn.session_x_id;
  if (!sessionId) return;
  pm.recordSyncReport(sessionId, conn.user_id, data || {});
};

// In-play relay. Frame-rate messages — NOT logged. The seed log keeps
// identity history; the field re-derives runtime state on demand.
function relay(type, ws, data) {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return;
  broadcastSession(s, Object.assign({ type, from: conn.user_id }, data || {}), ws);
}
handlers.player_state = (ws, data) => relay('player_state', ws, data);

// game_action: PM assigns a seq, broadcasts with _pm_seq, tracks acks.
// Falls back to plain relay for sessions not (yet) PM-managed.
// Kernel-managed sessions short-circuit here: the GameMaster validates and
// reduces the action; the lobby's relay is bypassed for those games.
handlers.game_action = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const sessionId = conn.session_x_id;
  if (!sessionId) return;
  const s = liveSessions.get(sessionId);
  if (s && KernelRouter.handle(s, ws, data, conn)) return;
  const turnData = Object.assign({ type: 'game_action', from: conn.user_id }, data || {});
  const seq = pm.relayTurn(sessionId, conn.user_id, turnData);
  if (!seq) {
    // Session not PM-managed (e.g. spectator mode or pre-ready) — direct relay
    relay('game_action', ws, data);
  }
};

// game_state: update PM's lastGoodState snapshot, then relay normally.
handlers.game_state = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return;
  if (s.status !== 'playing') return;
  // One authoritative instance per session: host publishes canonical state.
  if (conn.user_id !== s.host_id) {
    return send(ws, { type: 'error', message: 'Only host can publish authoritative game state' });
  }
  if (!s.authoritative || !s.authoritative.instance_id) {
    s.authoritative = {
      instance_id: crypto.randomUUID(),
      rev: 0,
      state: null,
      updated_by: null,
      updated_at: null,
    };
  }

  s.authoritative.rev += 1;
  s.authoritative.state = (data && Object.prototype.hasOwnProperty.call(data, 'state')) ? data.state : data;
  s.authoritative.updated_by = conn.user_id;
  s.authoritative.updated_at = Date.now();

  const frame = {
    type: 'game_state',
    session_id: s.session_id,
    game_uuid: s.game_uuid,
    instance_id: s.authoritative.instance_id,
    seq: s.authoritative.rev,
    authoritative: true,
    from: conn.user_id,
    state: s.authoritative.state,
    players: serializePlayers(s),
    updated_at: s.authoritative.updated_at,
  };

  pm.updateGoodState(s.session_id, frame);
  // Broadcast to the whole game room (including sender) so everyone sees
  // the exact same canonical board snapshot.
  broadcastSession(s, frame);
};

// game_action_ack: client confirms it received a turn broadcast.
handlers.game_action_ack = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const sessionId = (data && data.session_id) || conn.session_x_id;
  const seq = data && typeof data.seq === 'number' ? data.seq : -1;
  const gameUuid = data && data.game_uuid ? String(data.game_uuid) : null;
  if (sessionId && seq >= 0) pm.acknowledgeTurn(sessionId, seq, conn.user_id, gameUuid);
};
handlers.chat = (ws, data) => relay('chat', ws, Object.assign({}, data, {
  username: (connections.get(ws) || {}).user && connections.get(ws).user.username,
}));

handlers.game_over = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return;
  s.status = 'ended';
  KernelRouter.stop(s.session_id);
  Proj.bloomEvent(log, s.x, [-1, 0, 0, 0, 1, 0], { kind: 'game_over', session_id: s.session_id, result: (data && data.result) || null });
  broadcastSession(s, { type: 'game_over', session: sanitize(s), result: (data && data.result) || null });
  liveSessions.delete(s.session_id);
  for (const [cws, cconn] of connections) {
    if (cconn.session_x_id === s.session_id) cconn.session_x_id = null;
  }
};

// Catalog endpoint — clients can ask the manifold for the registered games.
handlers.list_games = (ws) => send(ws, {
  type: 'game_catalog', games: CATALOG.map(g => ({
    id: g.id, name: g.name, dimension: g.dimension,
    max_players: g.maxPlayers, recommended_players: g.recommendedPlayers,
  }))
});

// Admin: re-enable a game that was auto-disabled.
handlers.pm_enable_game = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const gameId = data && data.game_id;
  if (!gameId) return send(ws, { type: 'error', message: 'pm_enable_game: missing game_id' });
  pm.enableGame(gameId);
  send(ws, { type: 'pm_game_enabled', game_id: gameId, ok: true });
};

// Stubs: client-expected message shapes for features not yet manifold-backed.
const STUBS = {
  search_users: { type: 'user_search_results', users: [] },
  search_users_to_block: { type: 'block_search_results', users: [] },
  block_user: { type: 'blocked_users', blockedUsers: [], blockedByUsers: [] },
  unblock_user: { type: 'blocked_users', blockedUsers: [], blockedByUsers: [] },
  get_blocked_users: { type: 'blocked_users', blockedUsers: [], blockedByUsers: [] },
  update_chat_preference: { type: 'chat_preference_updated' },
  approve_chat_user: { type: 'chat_user_approved' },
  deny_chat_user: { type: 'chat_user_denied' },
  search_guilds: { type: 'guild_search_results', guilds: [] },
  create_guild: { type: 'error', message: 'Guilds coming soon' },
  join_guild: { type: 'error', message: 'Guilds coming soon' },
  leave_guild: { type: 'guild_left' },
  disband_guild: { type: 'guild_disbanded', message: 'Guilds coming soon' },
  get_guild_details: { type: 'guild_details', guild: null, members: [], tournaments: [], pendingInvites: [] },
  get_guild_members: { type: 'guild_members', members: [] },
  get_guild_tournaments: { type: 'guild_tournaments', tournaments: [], pendingInvites: [] },
  invite_guild_member: { type: 'error', message: 'Guilds coming soon' },
  boot_guild_member: { type: 'error', message: 'Guilds coming soon' },
  toggle_guild_chat: { type: 'guild_chat_toggled' },
  guild_chat_message: { type: 'guild_chat_message_ack' },
  create_guild_game: { type: 'error', message: 'Guild games coming soon' },
  create_guild_tournament: { type: 'error', message: 'Tournaments coming soon' },
  respond_tournament_invite: { type: 'tournament_invite_response_ack' },
};
Object.keys(STUBS).forEach(k => { handlers[k] = (ws) => send(ws, STUBS[k]); });



// ── HTTP + WebSocket transport ──────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  // nginx proxies https://kensgames.com/ws/* → us. Strip the prefix so the
  // same handler matches under both `/ws/api/...` and `/api/...` paths.
  const rawUrl = req.url && req.url.startsWith('/ws/') ? req.url.slice(3) : req.url;
  const reqUrl = new URL(rawUrl, `http://${req.headers.host || `localhost:${PORT}`}`);
  const origin = req.headers.origin || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-KG-Guest-Id',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Identity-First: derive the requester's stable user_id from either an
  // X-KG-Secret (registered user) or X-KG-Guest-Id (anonymous guest).
  const secretFromRequest = (request) => {
    const hdr = request.headers['x-kg-secret'];
    if (typeof hdr === 'string' && hdr) return hdr;
    const auth = request.headers['authorization'];
    if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    return null;
  };
  const playerIdFromRequest = (request) => {
    const secret = secretFromRequest(request);
    if (secret) {
      const uid = UserRegistry.userIdFromSecret(secret);
      if (uid) return uid;
    }
    const hdr = request.headers['x-kg-guest-id'];
    if (!hdr || typeof hdr !== 'string') return null;
    return stableGuestId(hdr);
  };
  const meId = playerIdFromRequest(req);

  // Find the player object inside a session that matches the caller's identity.
  const meIn = (session) => {
    if (!meId || !session || !Array.isArray(session.players)) return null;
    const p = session.players.find(pp => pp && pp.user_id === meId);
    if (!p) return null;
    return {
      player_id: p.user_id, name: p.username, avatar_id: p.avatar_id,
      is_host: !!p.is_host, is_ai: !!p.is_ai, ready: !!p.ready, slot: p.slot,
    };
  };

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      status: 'ok',
      connections: connections.size,
      live_sessions: liveSessions.size,
      seed_log_entries: log.count(),
      catalog: CATALOG.map(g => g.id),
    }));
    return;
  }
  if (reqUrl.pathname === '/api/session/bootstrap') {
    const code = String(reqUrl.searchParams.get('code') || '').trim().toUpperCase();
    const gameHint = String(reqUrl.searchParams.get('game') || '').trim().toLowerCase();
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
      res.end(JSON.stringify({ error: 'Missing code' }));
      return;
    }

    let found = null;
    for (const s of liveSessions.values()) {
      if (String(s.session_code || '').toUpperCase() !== code) continue;
      if (gameHint && String(s.game_id || '').toLowerCase() !== gameHint) continue;
      found = s;
      break;
    }

    if (!found) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
      res.end(JSON.stringify({ found: false, code }));
      return;
    }

    const routes = gameRoutes(found.game_id);
    const sessionPayload = sanitize(found);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      found: true,
      code,
      session: sessionPayload,
      me: meIn(sessionPayload),
      game_path: routes.path,
      game_lobby_path: routes.lobby,
    }));
    return;
  }
  if (reqUrl.pathname === '/api/players/me') {
    let active = null;
    if (meId) {
      for (const s of liveSessions.values()) {
        if (s.players.some(p => p && p.user_id === meId)) { active = s; break; }
      }
    }
    const player = active ? meIn(sanitize(active)) : null;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      player_id: meId,
      signed_in: false,
      name: player ? player.name : null,
      avatar_id: player ? player.avatar_id : null,
      active_session_code: active ? active.session_code : null,
      active_game_id: active ? active.game_id : null,
    }));
    return;
  }
  // ── User registry (passwordless, secret-as-bearer) ────────────────────────
  const sendJson = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify(obj));
  };
  if (reqUrl.pathname === '/api/users' && req.method === 'POST') {
    readJsonBody(req, 32 * 1024).then((body) => {
      const out = UserRegistry.createUser(body || {});
      if (!out.ok) return sendJson(400, { error: out.error, detail: out.detail || null });
      // The secret is shown ONCE; client must persist it.
      sendJson(201, { secret_username: out.secret_username, user_id: out.user_id, profile: out.profile });
    }).catch((e) => sendJson(e.message === 'payload_too_large' ? 413 : 400, { error: e.message }));
    return;
  }
  if (reqUrl.pathname === '/api/users/me' && req.method === 'GET') {
    const secret = secretFromRequest(req);
    if (!secret) return sendJson(401, { error: 'missing_secret' });
    const out = UserRegistry.lookupBySecret(secret);
    if (!out.ok) return sendJson(out.error === 'not_found' || out.error === 'verify_failed' ? 401 : 400, { error: out.error });
    sendJson(200, { user_id: out.user_id, profile: out.profile });
    return;
  }
  if (reqUrl.pathname === '/api/users/me' && req.method === 'PATCH') {
    const secret = secretFromRequest(req);
    if (!secret) return sendJson(401, { error: 'missing_secret' });
    readJsonBody(req, 8 * 1024).then((body) => {
      const out = UserRegistry.updateProfile(secret, body || {});
      if (!out.ok) return sendJson(out.error === 'verify_failed' || out.error === 'not_found' ? 401 : 400, { error: out.error });
      sendJson(200, { user_id: out.user_id, profile: out.profile });
    }).catch((e) => sendJson(e.message === 'payload_too_large' ? 413 : 400, { error: e.message }));
    return;
  }
  if (reqUrl.pathname === '/api/users/me/avatar' && req.method === 'POST') {
    const secret = secretFromRequest(req);
    if (!secret) return sendJson(401, { error: 'missing_secret' });
    readJsonBody(req, 24 * 1024).then((body) => {
      // Accept either a full avatar object or a flat {mime, b64}.
      const av = (body && body.type) ? body : { type: 'upload', mime: body && body.mime, b64: body && body.b64 };
      const out = UserRegistry.setAvatar(secret, av);
      if (!out.ok) return sendJson(out.error === 'verify_failed' || out.error === 'not_found' ? 401 : 400, { error: out.error, detail: out.detail || null });
      sendJson(200, { user_id: out.user_id, profile: out.profile });
    }).catch((e) => sendJson(e.message === 'payload_too_large' ? 413 : 400, { error: e.message }));
    return;
  }
  if (reqUrl.pathname === '/api/users/me/avatar' && req.method === 'GET') {
    const secret = secretFromRequest(req);
    if (!secret) return sendJson(401, { error: 'missing_secret' });
    const out = UserRegistry.getAvatarData(secret);
    if (!out.ok) return sendJson(out.error === 'verify_failed' ? 401 : 404, { error: out.error });
    sendJson(200, { mime: out.mime, w: out.w, h: out.h, b64: out.b64 });
    return;
  }
  if (reqUrl.pathname === '/api/users/recover' && req.method === 'POST') {
    const ip = (req.socket && req.socket.remoteAddress) || 'unknown';
    if (!rateLimit('recover:' + ip, 5, 60 * 1000)) return sendJson(429, { error: 'rate_limited' });
    readJsonBody(req, 4 * 1024).then((body) => {
      const email = body && body.email;
      if (!process.env.SMTP_HOST) return sendJson(503, { error: 'recovery_disabled' });
      // Always 204 to prevent email enumeration; do the work asynchronously.
      res.writeHead(204, corsHeaders); res.end();
      const found = UserRegistry.findByEmail(email);
      if (!found) return;
      // We don't have the secret on disk; can't send it. Recovery requires a
      // separate flow (rotate-secret) that we'll add later. For now, log only.
      appendGmLog({
        ts: new Date().toISOString(), level: 'warn', code: 'recovery_requested',
        userId: found.user_id, message: 'Recovery requested but rotate-secret flow not yet implemented.',
      });
    }).catch((e) => sendJson(e.message === 'payload_too_large' ? 413 : 400, { error: e.message }));
    return;
  }
  if (reqUrl.pathname === '/api/users/me/export' && req.method === 'GET') {
    const secret = secretFromRequest(req);
    if (!secret) return sendJson(401, { error: 'missing_secret' });
    const lookup = UserRegistry.lookupBySecret(secret);
    if (!lookup.ok) return sendJson(401, { error: lookup.error });
    const bundle = { user_id: lookup.user_id, profile: lookup.profile, secret_username: secret };
    const av = UserRegistry.getAvatarData(secret);
    if (av.ok) bundle.avatar_b64 = av.b64;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kensgames-identity-${lookup.user_id}.json"`,
      ...corsHeaders,
    });
    res.end(JSON.stringify(bundle, null, 2));
    return;
  }
  if (reqUrl.pathname === '/api/pm/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      sessions: pm.allSessionsInfo(),
      disabled_games: pm.disabledGamesInfo(),
    }));
    return;
  }
  if (reqUrl.pathname.startsWith('/api/pm/enable/') && req.method === 'POST') {
    const gameId = reqUrl.pathname.slice('/api/pm/enable/'.length).trim();
    if (!gameId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
      res.end(JSON.stringify({ error: 'Missing gameId' }));
      return;
    }
    pm.enableGame(gameId);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({ ok: true, game_id: gameId }));
    return;
  }
  // GameManager health log: clients POST issues here; AI / admin GETs the tail.
  if (reqUrl.pathname === '/api/gm/log' && req.method === 'POST') {
    let buf = '';
    let aborted = false;
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > GM_INGEST_MAX_BYTES) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
        res.end(JSON.stringify({ error: 'payload too large' }));
        try { req.destroy(); } catch (_) { }
      }
    });
    req.on('end', () => {
      if (aborted) return;
      let entry = null;
      try { entry = JSON.parse(buf || '{}'); } catch (_) { entry = null; }
      if (!entry || typeof entry !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
        res.end(JSON.stringify({ error: 'invalid json' }));
        return;
      }
      const rec = {
        ts: entry.ts || new Date().toISOString(),
        level: String(entry.level || 'info').slice(0, 16),
        code: entry.code ? String(entry.code).slice(0, 64) : null,
        gameId: entry.gameId ? String(entry.gameId).toLowerCase().slice(0, 32) : null,
        sessionId: entry.sessionId ? String(entry.sessionId).slice(0, 64) : null,
        userId: entry.userId ? String(entry.userId).slice(0, 64) : null,
        message: entry.message ? String(entry.message).slice(0, 1000) : '',
        details: (entry.details && typeof entry.details === 'object') ? entry.details : null,
        page: entry.page ? String(entry.page).slice(0, 256) : null,
        ua: entry.ua ? String(entry.ua).slice(0, 256) : null,
        client_id: meId || null,
        remote_ip: req.socket && req.socket.remoteAddress || null,
      };
      appendGmLog(rec);
      res.writeHead(204, corsHeaders);
      res.end();
    });
    req.on('error', () => {
      if (!aborted) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
        res.end(JSON.stringify({ error: 'read error' }));
      }
    });
    return;
  }
  if (reqUrl.pathname === '/api/gm/log' && req.method === 'GET') {
    const limit = reqUrl.searchParams.get('limit');
    const tail = readGmLogTail(limit);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      log_file: GM_LOG_FILE,
      count: tail.length,
      entries: tail,
    }));
    return;
  }
  if (req.url === '/manifold/frontier') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
    res.end(JSON.stringify({
      games: Proj.frontier(log, 'game').map(s => ({ id: s.id, meta: s.meta })),
      sessions: Proj.frontier(log, 'session').map(s => ({ id: s.id, meta: s.meta, code: Proj.codeFromSeed(s.seed) })),
      players: Proj.frontier(log, 'player').length,
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders });
  res.end(JSON.stringify({ error: 'Not found', hint: 'Use /health, /manifold/frontier, /api/session/bootstrap, /api/players/me, /api/pm/status, /api/gm/log, or WebSocket upgrade' }));
});

let wsAdapter = null;
let wsInitPromise = null;

function initWsAdapter() {
  if (wsInitPromise) return wsInitPromise;
  wsInitPromise = (async () => {
    const crosswsModule = await import('crossws/adapters/node');
    const crossws = crosswsModule && (crosswsModule.default || crosswsModule);
    wsAdapter = crossws({
      hooks: {
        open(peer) {
          activePeers.add(peer);
          // Keep legacy method names used throughout handlers.
          peer.join = (topic) => peer.subscribe(topic);
          peer.leave = (topic) => peer.unsubscribe(topic);
          console.log(`[Lobby] New connection (total: ${activePeers.size})`);
          send(peer, { type: 'connected', message: 'Welcome to Kensgames Lobby (manifold projection)' });
        },

        async message(peer, message) {
          let data;
          try {
            const raw = typeof message.text === 'function' ? message.text() : null;
            data = raw && typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch (_) {
            return send(peer, { type: 'error', message: 'Invalid message format' });
          }
          if (!data || typeof data !== 'object') {
            return send(peer, { type: 'error', message: 'Invalid message format' });
          }
          const handler = handlers[data.type];
          if (!handler) {
            console.warn(`[Lobby] Unknown message type: ${data.type}`);
            return;
          }
          try { await handler(peer, data); }
          catch (err) {
            console.error(`[Lobby] Handler error for ${data.type}:`, err);
            send(peer, { type: 'error', message: 'Server error' });
          }
        },

        close(peer) {
          const conn = connections.get(peer);
          if (conn) {
            const s = liveSessions.get(conn.session_x_id);
            if (conn.session_x_id) {
              const replaced = pm.onPlayerDisconnect(conn.user_id, conn.session_x_id);
              // If PlayerManager replaced this live player with a bot, do not remove
              // the seat from the session by running leaveCurrentSession().
              if (!replaced || !s || s.status !== 'playing') {
                if (s && s.status === 'waiting') {
                  // Lobby grace period: allow brief reconnects (page nav, mobile
                  // network blips) before tearing down a waiting session. The
                  // host losing the socket would otherwise immediately destroy
                  // the lobby and invalidate any outstanding invite codes.
                  const sessionId = conn.session_x_id;
                  const userId = conn.user_id;
                  const username = conn.user && conn.user.username;
                  try { KernelRouter.detachPeer(peer, conn); } catch (_) { /* ignore */ }
                  try { peer.leave(sessionId); } catch (_) { /* ignore */ }
                  conn.session_x_id = null;
                  scheduleLobbyDisconnect(sessionId, userId, username);
                } else {
                  leaveCurrentSession(peer, conn);
                }
              }
            } else {
              leaveCurrentSession(peer, conn);
            }
            connections.delete(peer);
          }
          activePeers.delete(peer);
          console.log(`[Lobby] Disconnected (total: ${activePeers.size})`);
        },

        error(peer, err) {
          console.error('[Lobby] WebSocket error:', err && err.message ? err.message : err);
          if (peer) {
            activePeers.delete(peer);
            connections.delete(peer);
          }
        },
      },
    });

    httpServer.on('upgrade', (req, socket, head) => {
      if (!req.url || !req.url.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      if (req.headers.upgrade !== 'websocket') {
        socket.destroy();
        return;
      }
      wsAdapter.handleUpgrade(req, socket, head);
    });
    return wsAdapter;
  })();
  return wsInitPromise;
}

// Cleanup stale waiting sessions every 5 minutes (30-min idle threshold).
setInterval(() => {
  const stale = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of liveSessions) {
    if (s.created_at < stale && s.status === 'waiting') {
      liveSessions.delete(id);
      GameObject.remove(id);
      broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: id });
      console.log(`[Lobby] Cleaned up stale session ${id}`);
    }
  }
}, 5 * 60 * 1000);

if (require.main === module) {
  initWsAdapter()
    .then(() => {
      httpServer.listen(PORT, () => {
        console.log('═══════════════════════════════════════════════');
        console.log('  Kensgames Unified Lobby — manifold projection');
        console.log(`  HTTP health:  http://0.0.0.0:${PORT}/health`);
        console.log(`  WebSocket:    ws://0.0.0.0:${PORT}`);
        console.log(`  Seed log:     ${SEED_LOG} (${log.count()} entries)`);
        console.log(`  GM log:       ${GM_LOG_FILE}`);
        console.log(`  Catalog:      ${CATALOG.map(g => g.id).join(', ')}`);
        console.log('═══════════════════════════════════════════════');
      });
    })
    .catch((err) => {
      console.error('[Lobby] Failed to initialize crossws adapter:', err);
      process.exit(1);
    });
}

module.exports = { httpServer, io: wsAdapter, wsAdapter, handlers, liveSessions, connections, log, CATALOG, pm };
