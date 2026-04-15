/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENSGAMES UNIFIED GAME SERVER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WebSocket server for ALL games: FastTrack, BrickBreaker3D, Starfighter,
 * ConnectIV, SwartzDiamond, and future titles.
 *
 * Listens on port 8765 — nginx proxies wss://kensgames.com/ws here.
 *
 * Features:
 *   - Game-agnostic session management (game_id on every session)
 *   - Invite codes that resolve to the correct game automatically
 *   - Real-time state relay for action games (Starfighter, BrickBreaker)
 *   - Turn-based state relay for board games (FastTrack, ConnectIV)
 *   - Matchmaking by game type
 *   - Guest + authenticated auth
 *   - AI bot slots
 *   - Chat + guilds
 *
 * Protocol: JSON over WebSocket. Every message has { type: '...' }.
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const http = require('http');

const PORT = 8765;

// ═══════════════════════════════════════════════════════════════════════════
// In-memory state
// ═══════════════════════════════════════════════════════════════════════════

const users = new Map();       // oddddd oddddd user_id → { user_id, username, password_hash, ... }
const sessions = new Map();    // session_id → { session_id, session_code, host_id, players, ... }
const codeIndex = new Map();   // 6-char code → session_id
const connections = new Map(); // ws → { user_id, user }

let nextUserId = 1;
let nextSessionId = 1;

// AI name pool
const AI_NAMES = [
  'Bot Alpha', 'Bot Bravo', 'Bot Charlie', 'Bot Delta',
  'Bot Echo', 'Bot Sierra', 'Bot Tango', 'Bot Whiskey'
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (codeIndex.has(code)) return generateCode();
  return code;
}

// Call the auth API server (port 3000)
function authApiRequest(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Invalid JSON from auth API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Auth API timeout')); });
    req.write(payload);
    req.end();
  });
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(sessionId, data, excludeWs) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const [ws, conn] of connections) {
    if (ws === excludeWs) continue;
    if (session.players.some(p => p.user_id === conn.user_id)) {
      send(ws, data);
    }
  }
}

function broadcastAll(data) {
  for (const [ws] of connections) {
    send(ws, data);
  }
}

function getWsByUserId(userId) {
  for (const [ws, conn] of connections) {
    if (conn.user_id === userId) return ws;
  }
  return null;
}

// ── Registered game types ──
const GAME_REGISTRY = {
  fasttrack: { name: 'Fast Track', path: '/fasttrack/3d.html', maxPlayers: 6, type: 'turn' },
  brickbreaker: { name: 'BrickBreaker 3D', path: '/brickbreaker3d/index.html', maxPlayers: 4, type: 'realtime' },
  starfighter: { name: 'Starfighter', path: '/starfighter/index.html', maxPlayers: 6, type: 'realtime' },
  connectiv: { name: 'ConnectIV', path: '/connectiv/index.html', maxPlayers: 2, type: 'turn' },
  swartzdia: { name: 'Swartz Diamond', path: '/swartzdia/index.html', maxPlayers: 4, type: 'turn' },
  cubemarble: { name: 'Cube Marble', path: '/cubemarble/index.html', maxPlayers: 4, type: 'turn' },
  tictactoe: { name: 'Multi-D TicTacToe', path: '/tictactoe/index.html', maxPlayers: 2, type: 'turn' },
};

function getPublicSessions(gameId) {
  const result = [];
  for (const [, session] of sessions) {
    if (session.status !== 'waiting') continue;
    if (session.is_private) continue;
    if (gameId && session.game_id !== gameId) continue; // filter by game
    result.push(sanitizeSession(session));
  }
  return result;
}

function sanitizeSession(s) {
  return {
    session_id: s.session_id,
    session_code: s.session_code,
    game_id: s.game_id || 'fasttrack',
    game_name: (GAME_REGISTRY[s.game_id] || {}).name || s.game_id,
    host_id: s.host_id,
    host_username: s.host_username,
    is_private: s.is_private,
    max_players: s.max_players,
    player_count: s.players.length,
    players: s.players.map(p => ({
      user_id: p.user_id,
      username: p.username,
      avatar_id: p.avatar_id,
      is_host: p.is_host,
      is_ai: p.is_ai,
      slot: p.slot,
      ready: p.ready
    })),
    settings: s.settings,
    status: s.status
  };
}

function findSessionByPlayer(userId) {
  for (const [, session] of sessions) {
    if (session.players.some(p => p.user_id === userId)) {
      return session;
    }
  }
  return null;
}

function removePlayerFromSession(userId) {
  const session = findSessionByPlayer(userId);
  if (!session) return null;

  session.players = session.players.filter(p => p.user_id !== userId);

  // Re-index slots
  session.players.forEach((p, i) => { p.slot = i; });

  // If empty or host left, clean up
  if (session.players.length === 0 || (session.host_id === userId && session.players.filter(p => !p.is_ai).length === 0)) {
    sessions.delete(session.session_id);
    codeIndex.delete(session.session_code);
    broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: session.session_id });
    return session;
  }

  // Transfer host if needed
  if (session.host_id === userId) {
    const newHost = session.players.find(p => !p.is_ai);
    if (newHost) {
      session.host_id = newHost.user_id;
      session.host_username = newHost.username;
      newHost.is_host = true;
    }
  }

  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// Message handlers
// ═══════════════════════════════════════════════════════════════════════════

const handlers = {};

handlers.ping = (ws) => {
  send(ws, { type: 'pong' });
};

// --- Auth ---

handlers.guest_login = (ws, data) => {
  const userId = generateId('guest');
  const username = (data.name || `Guest_${Math.random().toString(36).slice(2, 6)}`).slice(0, 20);
  const avatarId = data.avatar_id || 'person_smile';

  const user = {
    user_id: userId,
    id: userId,
    username,
    avatar_id: avatarId,
    is_guest: true,
    prestige_level: 'bronze',
    prestige_points: 0,
    games_played: 0,
    games_won: 0,
    guild_id: null
  };

  connections.set(ws, { user_id: userId, user });

  send(ws, {
    type: 'auth_success',
    action: 'guest_login',
    user
  });
};

handlers.login = async (ws, data) => {
  const { username, password } = data;
  if (!username || !password) {
    send(ws, { type: 'error', message: 'Username and password required' });
    return;
  }

  try {
    const res = await authApiRequest('/api/auth/login', { username, password });
    if (res.body.success) {
      const userId = `user_${res.body.userId}`;
      const user = {
        user_id: userId,
        id: userId,
        username: res.body.username || username,
        avatar_id: 'person_smile',
        is_guest: false,
        prestige_level: 'bronze',
        prestige_points: 0,
        games_played: 0,
        games_won: 0,
        guild_id: null,
        auth_token: res.body.token
      };
      // Cache in local users map
      users.set(username, user);
      connections.set(ws, { user_id: userId, user });
      send(ws, {
        type: 'auth_success',
        action: 'login',
        user: { ...user, auth_token: undefined }
      });
    } else {
      send(ws, { type: 'error', message: res.body.error || 'Invalid credentials' });
    }
  } catch (e) {
    console.error('[Lobby] Auth API login error:', e.message);
    send(ws, { type: 'error', message: 'Login service unavailable. Try again.' });
  }
};

handlers.register = async (ws, data) => {
  const { username, password } = data;
  if (!username || !password) {
    send(ws, { type: 'error', message: 'Username and password required' });
    return;
  }
  if (username.length < 3) {
    send(ws, { type: 'error', message: 'Username must be at least 3 characters' });
    return;
  }
  if (password.length < 4) {
    send(ws, { type: 'error', message: 'Password must be at least 4 characters' });
    return;
  }

  try {
    const res = await authApiRequest('/api/auth/register', {
      username,
      password,
      email: data.email || null
    });
    if (res.body.success) {
      const userId = `user_${res.body.userId}`;
      const user = {
        user_id: userId,
        id: userId,
        username: res.body.username || username,
        avatar_id: 'person_smile',
        is_guest: false,
        prestige_level: 'bronze',
        prestige_points: 0,
        games_played: 0,
        games_won: 0,
        guild_id: null,
        auth_token: res.body.token
      };
      users.set(username, user);
      connections.set(ws, { user_id: userId, user });
      send(ws, {
        type: 'auth_success',
        action: 'register',
        user: { ...user, auth_token: undefined }
      });
    } else {
      send(ws, { type: 'error', message: res.body.error || 'Registration failed' });
    }
  } catch (e) {
    console.error('[Lobby] Auth API register error:', e.message);
    send(ws, { type: 'error', message: 'Registration service unavailable. Try again.' });
  }
};

handlers.logout = (ws) => {
  const conn = connections.get(ws);
  if (conn) {
    removePlayerFromSession(conn.user_id);
  }
  connections.delete(ws);
  send(ws, { type: 'logged_out' });
};

handlers.get_profile = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  send(ws, { type: 'profile', user: { ...conn.user, password_hash: undefined } });
};

handlers.update_profile = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  if (data.avatar_id) {
    conn.user.avatar_id = data.avatar_id;
    if (!conn.user.is_guest && users.has(conn.user.username)) {
      users.get(conn.user.username).avatar_id = data.avatar_id;
    }
  }

  send(ws, { type: 'profile_updated', user: { ...conn.user, password_hash: undefined } });
};

// --- Sessions ---

handlers.create_session = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  // Only signed-in users can create private games
  if (conn.user.is_guest && data.private) {
    send(ws, { type: 'error', message: 'Sign in to create a private game' });
    return;
  }

  // Leave any existing session first
  const existing = findSessionByPlayer(conn.user_id);
  if (existing) {
    removePlayerFromSession(conn.user_id);
    broadcast(existing.session_id, {
      type: 'player_left',
      username: conn.user.username,
      players: existing.players.map(p => ({
        user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
        is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
      }))
    }, ws);
  }

  const sessionId = generateId('session');
  const code = generateCode();
  // Game ID: which game is this session for? Defaults to fasttrack for backward compat.
  const gameId = data.game_id || 'fasttrack';
  const gameInfo = GAME_REGISTRY[gameId] || {};
  const maxPlayers = Math.min(Math.max(data.max_players || gameInfo.maxPlayers || 4, 2), gameInfo.maxPlayers || 6);

  const session = {
    session_id: sessionId,
    session_code: code,
    game_id: gameId,
    host_id: conn.user_id,
    host_username: conn.user.username,
    is_private: !!data.private,
    max_players: maxPlayers,
    settings: data.settings || {},
    status: 'waiting',
    created_at: Date.now(),
    players: [{
      user_id: conn.user_id,
      username: conn.user.username,
      avatar_id: conn.user.avatar_id,
      is_host: true,
      is_ai: false,
      slot: 0,
      ready: true
    }]
  };

  sessions.set(sessionId, session);
  codeIndex.set(code, sessionId);

  // Game-agnostic share URL — portal join page resolves the game from the code
  const shareUrl = `/lobby/join.html?code=${code}`;

  send(ws, {
    type: 'session_created',
    session: sanitizeSession(session),
    share_code: code,
    share_url: shareUrl
  });

  broadcastAll({ type: 'lobby_update', action: 'session_created', session_id: sessionId });
};

handlers.list_sessions = (ws, data) => {
  const gameId = (data && data.game_id) || null; // optional filter
  send(ws, { type: 'session_list', sessions: getPublicSessions(gameId) });
};

// ── Quick Matchmaking ──
// Finds or creates a public game for the requested game_id
handlers.matchmake = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const gameId = data.game_id || 'fasttrack';
  const existing = findSessionByPlayer(conn.user_id);
  if (existing) removePlayerFromSession(conn.user_id);

  // Find a waiting public session for this game
  for (const [, session] of sessions) {
    if (session.game_id !== gameId) continue;
    if (session.status !== 'waiting') continue;
    if (session.is_private) continue;
    if (session.players.length >= session.max_players) continue;

    // Join this session
    const slot = session.players.length;
    session.players.push({
      user_id: conn.user_id,
      username: conn.user.username,
      avatar_id: conn.user.avatar_id,
      is_host: false,
      is_ai: false,
      slot,
      ready: false
    });
    broadcast(session.session_id, {
      type: 'player_joined',
      session: sanitizeSession(session),
      username: conn.user.username
    });
    return;
  }

  // No match found — create a new public session
  const gameInfo = GAME_REGISTRY[gameId] || {};
  const sessionId = generateId('session');
  const code = generateCode();
  const session = {
    session_id: sessionId,
    session_code: code,
    game_id: gameId,
    host_id: conn.user_id,
    host_username: conn.user.username,
    is_private: false,
    max_players: gameInfo.maxPlayers || 4,
    settings: {},
    status: 'waiting',
    created_at: Date.now(),
    players: [{
      user_id: conn.user_id,
      username: conn.user.username,
      avatar_id: conn.user.avatar_id,
      is_host: true,
      is_ai: false,
      slot: 0,
      ready: true
    }]
  };
  sessions.set(sessionId, session);
  codeIndex.set(code, sessionId);
  send(ws, { type: 'matchmake_result', action: 'created', session: sanitizeSession(session) });
  broadcastAll({ type: 'lobby_update', action: 'session_created', session_id: sessionId });
};

// ── Resolve Code → Game ──
// Client sends a code, server responds with which game it belongs to + session info
handlers.resolve_code = (ws, data) => {
  const code = (data.code || '').toUpperCase().trim();
  const sessionId = codeIndex.get(code);
  if (!sessionId) {
    send(ws, { type: 'resolve_code_result', found: false, code });
    return;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    send(ws, { type: 'resolve_code_result', found: false, code });
    return;
  }
  const gameInfo = GAME_REGISTRY[session.game_id] || {};
  send(ws, {
    type: 'resolve_code_result',
    found: true,
    code,
    game_id: session.game_id,
    game_name: gameInfo.name || session.game_id,
    game_path: gameInfo.path || '/',
    session: sanitizeSession(session),
  });
};

handlers.join_session = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const session = sessions.get(data.session_id);
  if (!session) {
    send(ws, { type: 'error', message: 'Game not found' });
    return;
  }
  if (session.status !== 'waiting') {
    send(ws, { type: 'error', message: 'Game already started' });
    return;
  }
  if (session.players.length >= session.max_players) {
    send(ws, { type: 'error', message: 'Game is full' });
    return;
  }
  if (session.players.some(p => p.user_id === conn.user_id)) {
    send(ws, { type: 'error', message: 'Already in this game' });
    return;
  }

  // Leave existing session
  const existing = findSessionByPlayer(conn.user_id);
  if (existing) removePlayerFromSession(conn.user_id);

  const player = {
    user_id: conn.user_id,
    username: conn.user.username,
    avatar_id: conn.user.avatar_id,
    is_host: false,
    is_ai: false,
    slot: session.players.length,
    ready: false
  };
  session.players.push(player);

  // Notify joiner
  send(ws, { type: 'session_joined', session: sanitizeSession(session) });

  // Notify others in session
  broadcast(session.session_id, {
    type: 'player_joined',
    player: {
      user_id: player.user_id,
      username: player.username,
      avatar_id: player.avatar_id,
      is_host: false,
      is_ai: false,
      slot: player.slot
    },
    players: session.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
    }))
  }, ws);
};

handlers.join_by_code = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const code = (data.code || '').toUpperCase().trim();
  const sessionId = codeIndex.get(code);
  if (!sessionId) {
    send(ws, { type: 'error', message: 'Invalid game code' });
    return;
  }

  // Delegate to join_session
  handlers.join_session(ws, { session_id: sessionId });
};

handlers.leave_session = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const session = findSessionByPlayer(conn.user_id);
  if (!session) return;

  const sessionId = session.session_id;
  removePlayerFromSession(conn.user_id);

  send(ws, { type: 'left_session' });

  // Notify remaining
  if (sessions.has(sessionId)) {
    broadcast(sessionId, {
      type: 'player_left',
      username: conn.user.username,
      players: session.players.map(p => ({
        user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
        is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
      }))
    });
  }
};

handlers.update_player_info = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  if (data.username) {
    conn.user.username = data.username.slice(0, 20);
  }
  if (data.avatar_id) {
    conn.user.avatar_id = data.avatar_id;
  }

  // Update in session too
  const session = findSessionByPlayer(conn.user_id);
  if (session) {
    const player = session.players.find(p => p.user_id === conn.user_id);
    if (player) {
      if (data.username) player.username = conn.user.username;
      if (data.avatar_id) player.avatar_id = conn.user.avatar_id;
    }
    if (session.host_id === conn.user_id && data.username) {
      session.host_username = conn.user.username;
    }
  }
};

handlers.update_session_settings = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.host_id !== conn.user_id) return;

  if (data.settings) {
    session.settings = { ...session.settings, ...data.settings };
  }
  if (data.max_players) {
    session.max_players = Math.min(Math.max(data.max_players, 2), 6);
  }
};

handlers.add_ai_player = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.host_id !== conn.user_id) {
    send(ws, { type: 'error', message: 'Only host can add bots' });
    return;
  }
  if (session.players.length >= session.max_players) {
    send(ws, { type: 'error', message: 'Game is full' });
    return;
  }

  const aiCount = session.players.filter(p => p.is_ai).length;
  if (aiCount >= 3) {
    send(ws, { type: 'error', message: 'Maximum 3 bots allowed' });
    return;
  }

  const aiId = generateId('ai');
  const aiName = AI_NAMES[aiCount] || `Bot ${aiCount + 1}`;
  const aiAvatars = ['scifi_robot', 'robot', 'space_rocket'];

  const bot = {
    user_id: aiId,
    username: aiName,
    avatar_id: aiAvatars[aiCount % aiAvatars.length],
    is_host: false,
    is_ai: true,
    is_bot: true,
    slot: session.players.length,
    ready: true,
    ai_level: data.level || 'medium'
  };
  session.players.push(bot);

  // Notify all in session
  broadcast(session.session_id, {
    type: 'player_joined',
    player: {
      user_id: bot.user_id,
      username: bot.username,
      avatar_id: bot.avatar_id,
      is_host: false,
      is_ai: true,
      slot: bot.slot
    },
    players: session.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
    }))
  });

  // Also send to the host who added the bot
  send(ws, {
    type: 'player_joined',
    player: {
      user_id: bot.user_id,
      username: bot.username,
      avatar_id: bot.avatar_id,
      is_host: false,
      is_ai: true,
      slot: bot.slot
    },
    players: session.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
    }))
  });
};

handlers.remove_ai_player = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.host_id !== conn.user_id) return;

  let removed = false;
  if (data.player_id) {
    const idx = session.players.findIndex(p => p.user_id === data.player_id && p.is_ai);
    if (idx !== -1) {
      session.players.splice(idx, 1);
      removed = true;
    }
  } else {
    // Remove last AI
    for (let i = session.players.length - 1; i >= 0; i--) {
      if (session.players[i].is_ai) {
        session.players.splice(i, 1);
        removed = true;
        break;
      }
    }
  }

  if (removed) {
    // Re-slot
    session.players.forEach((p, i) => { p.slot = i; });

    const playersPayload = session.players.map(p => ({
      user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
      is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
    }));

    // Notify everyone in session including the sender
    broadcast(session.session_id, {
      type: 'player_left',
      username: 'Bot',
      players: playersPayload
    });
    send(ws, {
      type: 'player_left',
      username: 'Bot',
      players: playersPayload
    });
  }
};

handlers.start_game = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const session = findSessionByPlayer(conn.user_id);
  if (!session) {
    send(ws, { type: 'error', message: 'Not in a game' });
    return;
  }
  if (session.host_id !== conn.user_id) {
    send(ws, { type: 'error', message: 'Only the host can start the game' });
    return;
  }
  if (session.players.length < 2) {
    send(ws, { type: 'error', message: 'Need at least 2 players' });
    return;
  }

  session.status = 'playing';

  const payload = {
    type: 'game_started',
    session: sanitizeSession(session)
  };

  // Notify all players including host
  for (const [clientWs, clientConn] of connections) {
    if (session.players.some(p => p.user_id === clientConn.user_id)) {
      send(clientWs, payload);
    }
  }

  broadcastAll({ type: 'lobby_update', action: 'session_removed', session_id: session.session_id });
};

// --- Real-Time Game State Relay ---
// These handlers support both real-time (Starfighter, BrickBreaker)
// and turn-based (FastTrack, ConnectIV, TicTacToe) games.
// The server is a RELAY — it doesn't understand game logic, just forwards state.

// Player state — high-frequency position/velocity updates (action games, ~20 Hz)
handlers.player_state = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.status !== 'playing') return;

  // Relay to all other players in the session
  const payload = {
    type: 'player_state',
    user_id: conn.user_id,
    username: conn.user.username,
    ...data // x, y, z, qx, qy, qz, qw, vx, vy, vz, hull, shields, etc.
  };
  delete payload.type; // re-add clean
  const msg = JSON.stringify({ type: 'player_state', ...payload });
  for (const [clientWs, clientConn] of connections) {
    if (clientConn.user_id === conn.user_id) continue;
    if (session.players.some(p => p.user_id === clientConn.user_id)) {
      if (clientWs.readyState === 1) clientWs.send(msg);
    }
  }
};

// Game action — any discrete game event (fire weapon, play card, move piece)
handlers.game_action = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.status !== 'playing') return;

  const payload = JSON.stringify({
    type: 'game_action',
    user_id: conn.user_id,
    username: conn.user.username,
    action: data.action,    // e.g. 'fire', 'move_piece', 'play_card'
    payload: data.payload,  // game-specific data
    seq: data.seq || 0,     // sequence number for ordering
    timestamp: Date.now(),
  });
  for (const [clientWs, clientConn] of connections) {
    if (clientConn.user_id === conn.user_id) continue;
    if (session.players.some(p => p.user_id === clientConn.user_id)) {
      if (clientWs.readyState === 1) clientWs.send(payload);
    }
  }
};

// Game state — authoritative state snapshot from host (periodic or on key events)
handlers.game_state = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.status !== 'playing') return;
  // Only host can broadcast authoritative state
  if (session.host_id !== conn.user_id) return;

  const payload = JSON.stringify({
    type: 'game_state',
    state: data.state,      // game-specific state blob
    seq: data.seq || 0,
    timestamp: Date.now(),
  });
  for (const [clientWs, clientConn] of connections) {
    if (clientConn.user_id === conn.user_id) continue;
    if (session.players.some(p => p.user_id === clientConn.user_id)) {
      if (clientWs.readyState === 1) clientWs.send(payload);
    }
  }
};

// Game over — any player can signal, but only host's is authoritative
handlers.game_over = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const session = findSessionByPlayer(conn.user_id);
  if (!session || session.status !== 'playing') return;

  session.status = 'finished';

  const payload = JSON.stringify({
    type: 'game_over',
    result: data.result,    // 'win', 'loss', 'draw', etc.
    winner: data.winner,    // user_id or null
    scores: data.scores,    // { user_id: score, ... }
    message: data.message,
  });
  for (const [clientWs, clientConn] of connections) {
    if (session.players.some(p => p.user_id === clientConn.user_id)) {
      if (clientWs.readyState === 1) clientWs.send(payload);
    }
  }

  // Clean up session after 30 seconds
  setTimeout(() => {
    sessions.delete(session.session_id);
    codeIndex.delete(session.session_code);
  }, 30000);
};

// --- Chat ---

handlers.chat = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const message = (data.message || '').slice(0, 500);
  if (!message) return;

  broadcastAll({
    type: 'chat',
    username: conn.user.username,
    avatar_id: conn.user.avatar_id,
    message,
    timestamp: Date.now()
  });
};

// --- Search ---

handlers.search_users = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const query = (data.query || '').toLowerCase();
  const results = [];
  for (const [, u] of users) {
    if (u.username.toLowerCase().includes(query)) {
      results.push({
        user_id: u.user_id,
        username: u.username,
        avatar_id: u.avatar_id,
        prestige_level: u.prestige_level,
        prestige_points: u.prestige_points,
        games_played: u.games_played,
        games_won: u.games_won
      });
    }
    if (results.length >= 20) break;
  }
  send(ws, { type: 'user_search_results', users: results });
};

// --- Guilds (stubs — return empty to avoid client errors) ---

handlers.create_guild = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const guildId = generateId('guild');
  const guild = {
    guild_id: guildId,
    id: guildId,
    name: (data.name || 'Guild').slice(0, 30),
    tag: (data.tag || 'TAG').slice(0, 4).toUpperCase(),
    guildmaster_id: conn.user_id,
    members: [{ user_id: conn.user_id, username: conn.user.username, online: true }],
    total_prestige: 0
  };
  conn.user.guild_id = guildId;
  send(ws, { type: 'guild_created', guild });
};

handlers.search_guilds = (ws) => {
  send(ws, { type: 'guild_search_results', guilds: [] });
};

handlers.join_guild = (ws) => {
  send(ws, { type: 'error', message: 'Guild not found' });
};

handlers.leave_guild = (ws) => {
  send(ws, { type: 'guild_left' });
};

handlers.get_guild_details = (ws) => {
  send(ws, { type: 'guild_details', guild: null, members: [], tournaments: [], pendingInvites: [] });
};

handlers.get_guild_members = (ws) => {
  send(ws, { type: 'guild_members', members: [] });
};

handlers.get_guild_tournaments = (ws) => {
  send(ws, { type: 'guild_tournaments', tournaments: [], pendingInvites: [] });
};

handlers.disband_guild = (ws) => {
  send(ws, { type: 'guild_disbanded', message: 'Guild has been disbanded' });
};

handlers.boot_guild_member = (ws) => {
  // No-op
};

handlers.create_guild_game = (ws) => {
  send(ws, { type: 'error', message: 'Guild games coming soon' });
};

handlers.invite_guild_member = (ws) => {
  // No-op stub
};

handlers.create_guild_tournament = (ws) => {
  send(ws, { type: 'error', message: 'Tournaments coming soon' });
};

handlers.respond_tournament_invite = (ws) => {
  // No-op
};

// --- Chat stubs ---

handlers.guild_chat_message = () => { };
handlers.toggle_guild_chat = () => { };
handlers.update_chat_preference = () => { };
handlers.approve_chat_user = () => { };
handlers.deny_chat_user = () => { };
handlers.get_blocked_users = (ws) => {
  send(ws, { type: 'blocked_users', blockedUsers: [], blockedByUsers: [] });
};
handlers.block_user = () => { };
handlers.unblock_user = () => { };
handlers.search_users_to_block = (ws) => {
  send(ws, { type: 'block_search_results', users: [] });
};
handlers.toggle_ready = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  const session = findSessionByPlayer(conn.user_id);
  if (!session) return;
  const player = session.players.find(p => p.user_id === conn.user_id);
  if (player) {
    player.ready = !player.ready;
    broadcast(session.session_id, {
      type: 'player_ready_changed',
      user_id: conn.user_id,
      ready: player.ready
    });
    send(ws, {
      type: 'player_ready_changed',
      user_id: conn.user_id,
      ready: player.ready
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HTTP + WebSocket Server (same port)
// ═══════════════════════════════════════════════════════════════════════════

const httpServer = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/' || url === '/health' || url === '/status') {
    const body = {
      service: 'fasttrack-lobby',
      status: 'ok',
      transport: 'websocket',
      wsEndpoint: '/ws',
      connections: connections.size,
      waitingSessions: getPublicSessions().length,
      ts: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found', hint: 'Use /health or WebSocket upgrade on /ws' }));
});

const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log(`[Lobby] New connection (total: ${wss.clients.size})`);

  // Send welcome
  send(ws, {
    type: 'connected',
    message: 'Welcome to Fast Track Lobby!'
  });

  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      send(ws, { type: 'error', message: 'Invalid message format' });
      return;
    }

    const handler = handlers[data.type];
    if (handler) {
      try {
        await handler(ws, data);
      } catch (err) {
        console.error(`[Lobby] Handler error for ${data.type}:`, err);
        send(ws, { type: 'error', message: 'Server error' });
      }
    } else {
      console.warn(`[Lobby] Unknown message type: ${data.type}`);
    }
  });

  ws.on('close', () => {
    const conn = connections.get(ws);
    if (conn) {
      // Remove from any session
      const session = findSessionByPlayer(conn.user_id);
      if (session) {
        const sessionId = session.session_id;
        removePlayerFromSession(conn.user_id);
        if (sessions.has(sessionId)) {
          broadcast(sessionId, {
            type: 'player_left',
            username: conn.user.username,
            players: session.players.map(p => ({
              user_id: p.user_id, username: p.username, avatar_id: p.avatar_id,
              is_host: p.is_host, is_ai: p.is_ai, slot: p.slot
            }))
          });
        }
      }
      connections.delete(ws);
    }
    console.log(`[Lobby] Disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[Lobby] WebSocket error:', err.message);
  });
});

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const staleThreshold = Date.now() - (30 * 60 * 1000); // 30 minutes
  for (const [id, session] of sessions) {
    if (session.created_at < staleThreshold && session.status === 'waiting') {
      codeIndex.delete(session.session_code);
      sessions.delete(id);
      console.log(`[Lobby] Cleaned up stale session ${id}`);
    }
  }
}, 5 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`═══════════════════════════════════════════════`);
  console.log(`  Fast Track Lobby Server`);
  console.log(`  HTTP health: http://0.0.0.0:${PORT}/health`);
  console.log(`  WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`  nginx proxies wss://kensgames.com/ws → here`);
  console.log(`═══════════════════════════════════════════════`);
});
