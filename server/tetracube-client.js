'use strict';

const crypto = require('crypto');

const ENABLED = String(process.env.TETRACUBE_ENABLED || '').toLowerCase() === 'true';
const STRICT = String(process.env.TETRACUBE_STRICT || '').toLowerCase() === 'true';
const BASE_URL = (process.env.TETRACUBE_URL || 'https://tetracubedb.com').replace(/\/$/, '');
const NAMESPACE = process.env.TETRACUBE_NS || 'kensgames';
const CLIENT_ID = process.env.TETRACUBE_CLIENT_ID || '';
const API_KEY = process.env.TETRACUBE_API_KEY || '';
const WRITE_TIMEOUT_MS = Math.max(500, parseInt(process.env.TETRACUBE_TIMEOUT_MS || '4000', 10));

const WRITE_ENDPOINTS = [
  process.env.TETRACUBE_WRITE_ENDPOINT,
  '/api/client/cells',
  '/api/v1/client/cells',
].filter(Boolean);

const SESSION_READ_ENDPOINT = process.env.TETRACUBE_SESSION_READ_ENDPOINT || '/api/client/sessions/:sessionId';
const RECORD_READ_ENDPOINT = process.env.TETRACUBE_RECORD_READ_ENDPOINT || '/api/client/cells/:table/:row/:col';

const shadowSessions = new Map();
const writeStatus = new Map();

function strictReject(reason) {
  return {
    ok: false,
    skipped: false,
    strict: true,
    reason,
    ts: Date.now(),
  };
}

function computeSessionDimensionalState(session) {
  const players = Array.isArray(session && session.players) ? session.players.length : 0;
  const bots = Math.max(0, Number(session && session.bots) || 0);
  const maxPlayers = Math.max(1, Number(session && session.maxPlayers) || players || 1);
  const level = session && session.status === 'active' ? 4 : 3;
  const x = Math.max(1, players);
  const y = Math.max(1, bots + 1);
  const zAxis = maxPlayers;
  const plane = x * y;
  const volume = plane * zAxis;
  const mass = volume;

  const fib = [0, 1, 1, 2, 3, 5, 8, 13];
  const fibScale = fib[level] || fib[fib.length - 1];

  return {
    level,
    x,
    y,
    z_axis: zAxis,
    plane,
    volume,
    mass,
    theta_deg: level * 90,
    fib_scale: fibScale,
  };
}

function canonicalSession(session) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    gameId: session.gameId,
    mode: session.mode,
    status: session.status,
    code: session.code,
    bots: Number(session.bots) || 0,
    maxPlayers: Number(session.maxPlayers) || 0,
    createdAt: session.createdAt || null,
    startedAt: session.startedAt || null,
    gameUrl: session.gameUrl || null,
    players: (session.players || []).map((p) => ({
      userId: p.userId || null,
      guestId: p.guestId || null,
      type: p.type || null,
      isCreator: !!p.isCreator,
      ready: !!p.ready,
      online: p.online !== false,
      playername: p.playername || null,
      avatarId: p.avatarId || null,
    })),
  };
}

function sessionDigest(session) {
  const body = JSON.stringify(canonicalSession(session) || {});
  return crypto.createHash('sha256').update(body).digest('hex');
}

function digestValue(value) {
  const body = JSON.stringify(value || {});
  return crypto.createHash('sha256').update(body).digest('hex');
}

function canonicalGuild(guild) {
  if (!guild) return null;
  return {
    guildId: guild.guildId,
    name: guild.name,
    tag: guild.tag,
    masterId: guild.masterId,
    public: guild.public !== false,
    createdAt: guild.createdAt || null,
    members: (guild.members || []).map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt || null,
      suspended: !!m.suspended,
      suspendedUntil: m.suspendedUntil || null,
      duration: m.duration || null,
    })),
    requests: (guild.requests || []).map((r) => ({
      userId: r.userId,
      sentAt: r.sentAt,
    })),
    appeals: (guild.appeals || []).map((a) => ({
      appealId: a.appealId,
      userId: a.userId,
      status: a.status,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt || null,
    })),
  };
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (CLIENT_ID) headers['x-client-id'] = CLIENT_ID;
  if (API_KEY) headers['x-api-key'] = API_KEY;
  return headers;
}

async function fetchJson(url, method, payload) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch_unavailable');
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS) : null;

  try {
    const res = await fetch(url, {
      method,
      headers: buildHeaders(),
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller ? controller.signal : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const err = new Error(`Tetracube HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }

    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function dualWriteSession(session, meta = {}) {
  if (!session || !session.sessionId) {
    return { ok: false, skipped: true, reason: 'missing_session' };
  }

  const snapshot = canonicalSession(session);
  const envelope = {
    namespace: NAMESPACE,
    table: 'sessions',
    row: String(session.sessionId),
    col: 'snapshot',
    value: snapshot,
    dim: computeSessionDimensionalState(session),
    actor: meta.actor || 'system',
    event: meta.event || 'session:update',
    ts: Date.now(),
  };

  shadowSessions.set(String(session.sessionId), envelope);

  if (!ENABLED) {
    if (STRICT) {
      const blocked = strictReject('strict_requires_tetracube_enabled');
      writeStatus.set(String(session.sessionId), blocked);
      return blocked;
    }
    const skipped = { ok: false, skipped: true, reason: 'tetracube_disabled', ts: Date.now() };
    writeStatus.set(String(session.sessionId), skipped);
    return skipped;
  }

  let lastError = null;
  for (const endpoint of WRITE_ENDPOINTS) {
    try {
      const data = await fetchJson(`${BASE_URL}${endpoint}`, 'POST', envelope);
      const status = { ok: true, skipped: false, endpoint, ts: Date.now(), data };
      writeStatus.set(String(session.sessionId), status);
      return status;
    } catch (err) {
      lastError = err;
    }
  }

  const failed = {
    ok: false,
    skipped: false,
    ts: Date.now(),
    error: lastError ? String(lastError.message || lastError) : 'unknown_error',
  };
  writeStatus.set(String(session.sessionId), failed);
  return failed;
}

async function dualWriteGuild(guild, meta = {}) {
  if (!guild || !guild.guildId) {
    return { ok: false, skipped: true, reason: 'missing_guild' };
  }

  const snapshot = canonicalGuild(guild);
  const envelope = {
    namespace: NAMESPACE,
    table: 'guilds',
    row: String(guild.guildId),
    col: 'snapshot',
    value: snapshot,
    dim: {
      level: 4,
      x: Math.max(1, (snapshot.members || []).length),
      y: 1,
      z_axis: 1,
      plane: Math.max(1, (snapshot.members || []).length),
      volume: Math.max(1, (snapshot.members || []).length),
      mass: Math.max(1, (snapshot.members || []).length),
      theta_deg: 360,
      fib_scale: 3,
    },
    actor: meta.actor || 'system',
    event: meta.event || 'guild:update',
    ts: Date.now(),
  };

  shadowSessions.set(`guild:${guild.guildId}`, envelope);

  if (!ENABLED) {
    if (STRICT) {
      const blocked = strictReject('strict_requires_tetracube_enabled');
      writeStatus.set(`guild:${guild.guildId}`, blocked);
      return blocked;
    }
    const skipped = { ok: false, skipped: true, reason: 'tetracube_disabled', ts: Date.now() };
    writeStatus.set(`guild:${guild.guildId}`, skipped);
    return skipped;
  }

  let lastError = null;
  for (const endpoint of WRITE_ENDPOINTS) {
    try {
      const data = await fetchJson(`${BASE_URL}${endpoint}`, 'POST', envelope);
      const status = { ok: true, skipped: false, endpoint, ts: Date.now(), data };
      writeStatus.set(`guild:${guild.guildId}`, status);
      return status;
    } catch (err) {
      lastError = err;
    }
  }

  const failed = {
    ok: false,
    skipped: false,
    ts: Date.now(),
    error: lastError ? String(lastError.message || lastError) : 'unknown_error',
  };
  writeStatus.set(`guild:${guild.guildId}`, failed);
  return failed;
}

async function dualWriteRecord({ table, row, col = 'snapshot', value, dim, key, meta = {} }) {
  if (!table || row === undefined || row === null) {
    return { ok: false, skipped: true, reason: 'missing_table_or_row' };
  }

  const envelope = {
    namespace: NAMESPACE,
    table: String(table),
    row: String(row),
    col: String(col),
    value,
    dim: dim || {
      level: 3,
      x: 1,
      y: 1,
      z_axis: 1,
      plane: 1,
      volume: 1,
      mass: 1,
      theta_deg: 270,
      fib_scale: 2,
    },
    actor: meta.actor || 'system',
    event: meta.event || `${table}:update`,
    ts: Date.now(),
  };

  const shadowKey = key || `${table}:${row}:${col}`;
  shadowSessions.set(shadowKey, envelope);

  if (!ENABLED) {
    if (STRICT) {
      const blocked = strictReject('strict_requires_tetracube_enabled');
      writeStatus.set(shadowKey, blocked);
      return blocked;
    }
    const skipped = { ok: false, skipped: true, reason: 'tetracube_disabled', ts: Date.now() };
    writeStatus.set(shadowKey, skipped);
    return skipped;
  }

  let lastError = null;
  for (const endpoint of WRITE_ENDPOINTS) {
    try {
      const data = await fetchJson(`${BASE_URL}${endpoint}`, 'POST', envelope);
      const status = { ok: true, skipped: false, endpoint, ts: Date.now(), data };
      writeStatus.set(shadowKey, status);
      return status;
    } catch (err) {
      lastError = err;
    }
  }

  const failed = {
    ok: false,
    skipped: false,
    ts: Date.now(),
    error: lastError ? String(lastError.message || lastError) : 'unknown_error',
  };
  writeStatus.set(shadowKey, failed);
  return failed;
}

function dualWriteFriendsRecord(userId, record, meta = {}) {
  const friendsCount = Array.isArray(record && record.friends) ? record.friends.length : 0;
  const blockedCount = Array.isArray(record && record.blocked) ? record.blocked.length : 0;
  return dualWriteRecord({
    table: 'friends',
    row: String(userId),
    col: 'snapshot',
    value: record,
    dim: {
      level: 3,
      x: Math.max(1, friendsCount),
      y: Math.max(1, blockedCount + 1),
      z_axis: 1,
      plane: Math.max(1, friendsCount * Math.max(1, blockedCount + 1)),
      volume: Math.max(1, friendsCount * Math.max(1, blockedCount + 1)),
      mass: Math.max(1, friendsCount * Math.max(1, blockedCount + 1)),
      theta_deg: 270,
      fib_scale: 2,
    },
    key: `friends:${userId}`,
    meta,
  });
}

function dualWriteLeaderboard(gameId, board, meta = {}) {
  const entries = Array.isArray(board) ? board.length : 0;
  return dualWriteRecord({
    table: 'leaderboards',
    row: String(gameId),
    col: 'snapshot',
    value: board,
    dim: {
      level: 5,
      x: Math.max(1, entries),
      y: 1,
      z_axis: 1,
      plane: Math.max(1, entries),
      volume: Math.max(1, entries),
      mass: Math.max(1, entries),
      theta_deg: 450,
      fib_scale: 5,
    },
    key: `leaderboards:${gameId}`,
    meta,
  });
}

function dualWritePlayerState(userId, playerState, meta = {}) {
  return dualWriteRecord({
    table: 'players',
    row: String(userId),
    col: 'snapshot',
    value: playerState,
    dim: {
      level: 3,
      x: 1,
      y: 1,
      z_axis: 1,
      plane: 1,
      volume: 1,
      mass: 1,
      theta_deg: 270,
      fib_scale: 2,
    },
    key: `players:${userId}`,
    meta,
  });
}

function dualWriteChatMessage(guildId, message, meta = {}) {
  const row = `${guildId}:${message && message.msgId ? message.msgId : Date.now()}`;
  return dualWriteRecord({
    table: 'chat',
    row,
    col: 'message',
    value: message,
    dim: {
      level: 4,
      x: 1,
      y: 1,
      z_axis: 1,
      plane: 1,
      volume: 1,
      mass: 1,
      theta_deg: 360,
      fib_scale: 3,
    },
    key: `chat:${row}`,
    meta,
  });
}

async function fetchRemoteSession(sessionId) {
  if (!ENABLED) {
    if (STRICT) throw new Error('strict_requires_tetracube_enabled');
    return null;
  }
  const path = SESSION_READ_ENDPOINT.replace(':sessionId', encodeURIComponent(String(sessionId)));
  return fetchJson(`${BASE_URL}${path}`, 'GET');
}

async function fetchRemoteRecord(table, row, col = 'snapshot') {
  if (!ENABLED) {
    if (STRICT) throw new Error('strict_requires_tetracube_enabled');
    return null;
  }
  const path = RECORD_READ_ENDPOINT
    .replace(':table', encodeURIComponent(String(table)))
    .replace(':row', encodeURIComponent(String(row)))
    .replace(':col', encodeURIComponent(String(col)));
  return fetchJson(`${BASE_URL}${path}`, 'GET');
}

function getShadowSession(sessionId) {
  return shadowSessions.get(String(sessionId)) || null;
}

function getWriteStatus(sessionId) {
  return writeStatus.get(String(sessionId)) || null;
}

function getShadowByKey(key) {
  return shadowSessions.get(String(key)) || null;
}

function listShadowByTable(table) {
  const rows = [];
  for (const envelope of shadowSessions.values()) {
    if (envelope && envelope.table === table) {
      rows.push(envelope);
    }
  }
  return rows;
}

module.exports = {
  isEnabled: () => ENABLED,
  isStrict: () => STRICT,
  dualWriteSession,
  dualWriteGuild,
  dualWriteRecord,
  dualWriteFriendsRecord,
  dualWriteLeaderboard,
  dualWritePlayerState,
  dualWriteChatMessage,
  fetchRemoteSession,
  fetchRemoteRecord,
  getShadowSession,
  getWriteStatus,
  getShadowByKey,
  listShadowByTable,
  canonicalSession,
  sessionDigest,
  digestValue,
};
