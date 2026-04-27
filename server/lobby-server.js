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
const WebSocket = require('ws');

const Field = require('../js/manifold-field.js');
const Proj = require('./manifold-projection.js');

const PORT = parseInt(process.env.LOBBY_PORT || '8765', 10);
const SEED_LOG = process.env.SEED_LOG || path.join(__dirname, '..', 'state', 'seeds.jsonl');
const REPO_ROOT = path.join(__dirname, '..');

// ── Boot: open seed log, bloom games from manifests ─────────────────────────
const log = Proj.load(SEED_LOG);

function bootGameCatalog() {
  // Portal manifest first (provides display names + dimensions).
  const portalPath = path.join(REPO_ROOT, 'manifold.portal.json');
  const games = [];
  try {
    const portal = JSON.parse(fs.readFileSync(portalPath, 'utf8'));
    (portal.games || []).forEach(g => games.push({
      id: g.id, name: g.name, dimension: g.dimension || null, manifest: g.manifest,
    }));
  } catch (e) { /* portal manifest optional */ }
  // Per-game manifests for dimension data.
  games.forEach(g => {
    if (g.dimension) return;
    try {
      const mp = path.join(REPO_ROOT, g.id, 'manifold.game.json');
      const mg = JSON.parse(fs.readFileSync(mp, 'utf8'));
      g.dimension = mg.dimension || { x: 1, y: 1, z: 1 };
      g.maxPlayers = mg.dimension && mg.dimension.x;
    } catch (e) { g.dimension = { x: 1, y: 1, z: 1 }; }
  });
  // Fallback minimal catalog for known games not in the manifest.
  const have = new Set(games.map(g => g.id));
  [['fasttrack', 'Fast Track', 6], ['starfighter', 'Starfighter', 6],
  ['brickbreaker3d', 'BrickBreaker 3D', 4], ['4dtictactoe', '4D Tic-Tac-Toe', 4],
  ['cubic3d', 'Cubic', 4]].forEach(([id, name, mp]) => {
    if (!have.has(id)) games.push({ id, name, dimension: { x: mp, y: 1, z: mp }, maxPlayers: mp });
  });
  games.forEach(g => Proj.ensureGame(log, g.id, g.dimension, g.name));
  return games;
}

const CATALOG = bootGameCatalog();
const CATALOG_BY_ID = Object.fromEntries(CATALOG.map(g => [g.id, g]));

// ── In-memory caches projected from the seed log ───────────────────────────
// These are CACHES of the log frontier, not authority. On restart they are
// rebuilt from the log in O(N) where N = active sessions.
const liveSessions = new Map();   // session_x_id → { x, players, settings, status, …ephemeral }
const connections = new Map();    // ws → { user_id, user, session_x_id }

function freshSession(sx, gameId, hostUser, isPrivate) {
  const game = CATALOG_BY_ID[gameId] || { name: gameId, maxPlayers: 6 };
  return {
    x: sx,
    session_id: sx.id,
    session_code: Proj.codeFromSeed(sx.seed),
    game_id: gameId,
    game_name: game.name,
    host_id: hostUser.user_id,
    host_username: hostUser.username,
    is_private: !!isPrivate,
    max_players: game.maxPlayers || 6,
    players: [],
    settings: { lobby_accepted: false },
    status: 'waiting',
    created_at: Date.now(),
  };
}

function sanitize(s) {
  return {
    session_id: s.session_id,
    session_code: s.session_code,
    game_id: s.game_id,
    game_name: s.game_name,
    host_id: s.host_id,
    host_username: s.host_username,
    is_private: s.is_private,
    max_players: s.max_players,
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

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcastSession(s, data, exclude) {
  for (const [ws, conn] of connections) {
    if (ws === exclude) continue;
    if (conn.session_x_id === s.session_id) send(ws, data);
  }
}
function broadcastAll(data) { for (const [ws] of connections) send(ws, data); }

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

function leaveCurrentSession(ws, conn) {
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return null;
  s.players = s.players.filter(p => p.user_id !== conn.user_id);
  s.players.forEach((p, i) => { p.slot = i; });
  conn.session_x_id = null;
  if (s.players.length === 0 || (s.host_id === conn.user_id && s.players.filter(p => !p.is_ai).length === 0)) {
    liveSessions.delete(s.session_id);
    broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: s.session_id });
    return s;
  }
  if (s.host_id === conn.user_id) {
    const newHost = s.players.find(p => !p.is_ai);
    if (newHost) { s.host_id = newHost.user_id; s.host_username = newHost.username; newHost.is_host = true; }
  }
  broadcastSession(s, {
    type: 'player_left', username: conn.user.username,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
  return s;
}

// ── Handlers ────────────────────────────────────────────────────────────────
const handlers = {};

handlers.ping = (ws) => send(ws, { type: 'pong' });
handlers.cancel_join_request = () => { /* no-op */ };

function stableGuestId(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('guest-')) return null;
  return 'guest_' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

handlers.guest_login = (ws, data) => {
  const token = data && data.token ? String(data.token) : '';
  const userId = stableGuestId(token) || ('guest_' + crypto.randomBytes(6).toString('hex'));
  const username = String((data && (data.name || data.username || data.guest_name)) || 'Guest').slice(0, 20);
  const avatarId = (data && (data.avatar_id || data.avatarId)) || 'person_smile';
  const user = {
    user_id: userId, id: userId, username, avatar_id: avatarId, is_guest: true,
    prestige_level: 'bronze', prestige_points: 0, games_played: 0, games_won: 0, guild_id: null
  };
  connections.set(ws, { user_id: userId, user, session_x_id: null });
  send(ws, { type: 'auth_success', action: 'guest_login', user, user_id: userId, username });
  for (const s of liveSessions.values()) {
    if (s.players.some(p => p.user_id === userId)) {
      connections.get(ws).session_x_id = s.session_id;
      send(ws, { type: 'session_update', session: sanitize(s), action: 'resume' });
      if (s.status === 'playing') send(ws, { type: 'game_started', session: sanitize(s) });
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
  if (data && data.avatar_id) conn.user.avatar_id = data.avatar_id;
  if (data && data.username) conn.user.username = String(data.username).slice(0, 20);
  send(ws, { type: 'profile_updated', user: conn.user });
};
handlers.update_player_info = handlers.update_profile;

handlers.create_session = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not authenticated' });
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
    avatar_id: conn.user.avatar_id, is_host: true, is_ai: false, slot: 0, ready: false
  });
  liveSessions.set(s.session_id, s);
  conn.session_x_id = s.session_id;
  send(ws, { type: 'session_created', session: sanitize(s) });
  if (!isPrivate) broadcastAll({ type: 'lobby_update', action: 'session_created', session_id: s.session_id });
};

handlers.list_sessions = (ws, data) => {
  send(ws, { type: 'session_list', sessions: publicSessions(data && data.game_id) });
};

function joinExisting(ws, conn, s) {
  if (s.status !== 'waiting') return send(ws, { type: 'error', message: 'Game already started' });
  if (s.players.length >= s.max_players) return send(ws, { type: 'error', message: 'Game is full' });
  if (s.players.some(p => p.user_id === conn.user_id)) {
    conn.session_x_id = s.session_id;
    return send(ws, { type: 'session_joined', session: sanitize(s), action: 'rejoined' });
  }
  if (conn.session_x_id) leaveCurrentSession(ws, conn);
  Proj.bloomPlayer(log, s.x, { user_id: conn.user_id, username: conn.user.username });
  s.players.push({
    user_id: conn.user_id, username: conn.user.username,
    avatar_id: conn.user.avatar_id, is_host: false, is_ai: false, slot: s.players.length, ready: false
  });
  s.settings.lobby_accepted = false;
  conn.session_x_id = s.session_id;
  send(ws, { type: 'session_joined', session: sanitize(s) });
  broadcastSession(s, {
    type: 'player_joined', username: conn.user.username,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  }, ws);
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
  if (!conn) return send(ws, { type: 'error', message: 'Not authenticated' });
  const s = sessionByCode(data && data.code);
  if (!s) return send(ws, { type: 'error', message: 'Invalid game code' });
  joinExisting(ws, conn, s);
};

handlers.resolve_code = (ws, data) => {
  const code = String((data && data.code) || '').toUpperCase();
  const s = sessionByCode(code);
  if (!s) return send(ws, { type: 'resolve_code_result', found: false, code });
  send(ws, { type: 'resolve_code_result', found: true, code, session: sanitize(s) });
};

handlers.leave_session = (ws) => {
  const conn = connections.get(ws); if (!conn) return;
  leaveCurrentSession(ws, conn);
  send(ws, { type: 'left_session' });
};

handlers.update_session_settings = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s || s.host_id !== conn.user_id) return;
  if (data && data.settings) Object.assign(s.settings, data.settings);
  s.settings.lobby_accepted = false;
  broadcastSession(s, { type: 'session_settings_updated', session: sanitize(s) });
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
  const payload = sanitize(s);
  broadcastSession(s, { type: 'ready_update', session: payload, user_id: conn.user_id, ready: player.ready });
  send(ws, { type: 'ready_update', session: payload, user_id: conn.user_id, ready: player.ready });
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
  Proj.bloomEvent(log, s.x, [1, 1, 0, 0, 0, 0], { kind: 'lobby_accepted', session_id: s.session_id });
  broadcastSession(s, { type: 'lobby_accepted', session: sanitize(s) });
  send(ws, { type: 'lobby_accepted', session: sanitize(s) });
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
  const aiName = (data && data.name) || ('Bot ' + (aiCount + 1));
  s.players.push({
    user_id: aiId, username: aiName, avatar_id: 'robot',
    is_host: false, is_ai: true, slot: s.players.length, ready: true
  });
  s.settings.lobby_accepted = false;
  broadcastSession(s, {
    type: 'player_joined', username: aiName,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
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
  broadcastSession(s, {
    type: 'player_left', username: removed.username,
    players: s.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot, ready: p.ready
    }))
  });
  broadcastSession(s, { type: 'session_update', session: sanitize(s), action: 'ai_removed' });
};

handlers.start_game = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return send(ws, { type: 'error', message: 'Not in a game' });
  if (s.host_id !== conn.user_id) return send(ws, { type: 'error', message: 'Only the host can start the game' });
  if (s.players.length < 2) return send(ws, { type: 'error', message: 'Need at least 2 players' });
  if (!s.players.every(p => p.is_ai || p.ready)) return send(ws, { type: 'error', message: 'All players must be ready' });
  if (!s.settings.lobby_accepted) return send(ws, { type: 'error', message: 'Host must accept the group before launch' });
  s.status = 'playing';
  Proj.bloomEvent(log, s.x, [0, 0, 0, 0, 1, 1], { kind: 'game_started', session_id: s.session_id, game_id: s.game_id });
  broadcastSession(s, { type: 'game_started', session: sanitize(s) });
  if (!s.is_private) broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: s.session_id });
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
handlers.game_action = (ws, data) => relay('game_action', ws, data);
handlers.game_state = (ws, data) => relay('game_state', ws, data);
handlers.chat = (ws, data) => relay('chat', ws, Object.assign({}, data, {
  username: (connections.get(ws) || {}).user && connections.get(ws).user.username,
}));

handlers.game_over = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const s = liveSessions.get(conn.session_x_id);
  if (!s) return;
  s.status = 'ended';
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
    id: g.id, name: g.name, dimension: g.dimension, max_players: g.maxPlayers,
  }))
});

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
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: connections.size,
      live_sessions: liveSessions.size,
      seed_log_entries: log.count(),
      catalog: CATALOG.map(g => g.id),
    }));
    return;
  }
  if (req.url === '/manifold/frontier') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      games: Proj.frontier(log, 'game').map(s => ({ id: s.id, meta: s.meta })),
      sessions: Proj.frontier(log, 'session').map(s => ({ id: s.id, meta: s.meta, code: Proj.codeFromSeed(s.seed) })),
      players: Proj.frontier(log, 'player').length,
    }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found', hint: 'Use /health, /manifold/frontier, or WebSocket upgrade' }));
});

const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log(`[Lobby] New connection (total: ${wss.clients.size})`);
  send(ws, { type: 'connected', message: 'Welcome to Kensgames Lobby (manifold projection)' });

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw); }
    catch { return send(ws, { type: 'error', message: 'Invalid message format' }); }
    const handler = handlers[data.type];
    if (!handler) {
      console.warn(`[Lobby] Unknown message type: ${data.type}`);
      return;
    }
    try { await handler(ws, data); }
    catch (err) {
      console.error(`[Lobby] Handler error for ${data.type}:`, err);
      send(ws, { type: 'error', message: 'Server error' });
    }
  });

  ws.on('close', () => {
    const conn = connections.get(ws);
    if (conn) { leaveCurrentSession(ws, conn); connections.delete(ws); }
    console.log(`[Lobby] Disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => console.error('[Lobby] WebSocket error:', err.message));
});

// Cleanup stale waiting sessions every 5 minutes (30-min idle threshold).
setInterval(() => {
  const stale = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of liveSessions) {
    if (s.created_at < stale && s.status === 'waiting') {
      liveSessions.delete(id);
      broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: id });
      console.log(`[Lobby] Cleaned up stale session ${id}`);
    }
  }
}, 5 * 60 * 1000);

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  Kensgames Unified Lobby — manifold projection');
    console.log(`  HTTP health:  http://0.0.0.0:${PORT}/health`);
    console.log(`  WebSocket:    ws://0.0.0.0:${PORT}`);
    console.log(`  Seed log:     ${SEED_LOG} (${log.count()} entries)`);
    console.log(`  Catalog:      ${CATALOG.map(g => g.id).join(', ')}`);
    console.log('═══════════════════════════════════════════════');
  });
}

module.exports = { httpServer, wss, handlers, liveSessions, connections, log, CATALOG };
