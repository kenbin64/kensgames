/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENSGAMES — GAME SESSIONS ROUTE
 * POST   /api/sessions/create          — create session (auth required except solo)
 * GET    /api/sessions/game/:gameId/public — list public joinable sessions
 * GET    /api/sessions/:sessionId      — get session state (auth OR guest token)
 * POST   /api/sessions/join            — join via invite code (guest or auth)
 * POST   /api/sessions/:sessionId/ready   — mark player ready
 * POST   /api/sessions/:sessionId/bots    — set bot count (creator only)
 * POST   /api/sessions/:sessionId/start   — start game (creator only)
 * DELETE /api/sessions/:sessionId      — cancel session (creator only)
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { sessionsData, manifoldData } = require('../store');
const { PlayerDB } = require('../db');
const TetracubeClient = require('../tetracube-client');
const AuthHandler = require('../auth-handler');
const auth = new AuthHandler();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TETRACUBE_STRICT = typeof TetracubeClient.isStrict === 'function' && TetracubeClient.isStrict();

// Game manifest — max players, lobby path, game launch path
const GAMES = {
  fasttrack: { name: 'FastTrack', maxPlayers: 4, minPlayers: 2, lobbyPath: '/fasttrack/lobby/', gamePath: '/fasttrack/game.html' },
  brickbreaker3d: { name: 'BrickBreaker 3D', maxPlayers: 4, minPlayers: 1, lobbyPath: '/brickbreaker3d/lobby/', gamePath: '/brickbreaker3d/game.html' },
  '4dtictactoe': { name: '4D Tic-Tac-Toe', maxPlayers: 2, minPlayers: 2, lobbyPath: '/4dtictactoe/lobby/', gamePath: '/4dtictactoe/game.html' },
  starfighter: { name: 'Starfighter', maxPlayers: 4, minPlayers: 1, lobbyPath: '/starfighter/lobby/', gamePath: '/starfighter/game.html' },
  assemble: { name: 'Assemble', maxPlayers: 4, minPlayers: 1, lobbyPath: '/assemble/lobby/', gamePath: '/assemble/game.html' },
};

// Session TTL: 2 hours if never started, auto-purge on access
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// ── helpers ──────────────────────────────────────────────────────────────────

function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F2C1"
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function purgeStaleSessions() {
  const now = Date.now();
  for (const id in sessionsData) {
    const s = sessionsData[id];
    if (s.status !== 'active' && now - s.createdAt > SESSION_TTL_MS) {
      mirrorSessionToTetracube({ ...s, status: 'expired' }, 'session:ttl-expired', 'system');
      delete sessionsData[id];
    }
  }
}

function mirrorSessionToTetracube(session, eventName, actorId) {
  return TetracubeClient.dualWriteSession(session, {
    event: eventName,
    actor: actorId || 'system',
  }).catch((err) => {
    console.warn('[sessions] tetracube dual-write failed:', err.message);
    return { ok: false, skipped: false, error: String(err.message || err), ts: Date.now() };
  });
}

function strictWriteFailed(status) {
  if (!TETRACUBE_STRICT) return false;
  return !status || status.ok !== true;
}

function strictUnavailable(res, detail) {
  return res.status(503).json({
    success: false,
    error: 'Tetracube authoritative mode unavailable',
    detail,
    strict: true,
  });
}

function syncSessionDimension(session, levelOverride) {
  if (!session || !session.sessionId) return;
  const players = Array.isArray(session.players) ? session.players.length : 0;
  const bots = Math.max(0, Number(session.bots) || 0);
  const maxPlayers = Math.max(1, Number(session.maxPlayers) || players || 1);
  const level = Number.isInteger(levelOverride)
    ? levelOverride
    : (session.status === 'active' ? 4 : 3);

  try {
    PlayerDB.upsertDimensionalNode('session', session.sessionId, {
      level,
      x: Math.max(1, players),
      y: Math.max(1, bots + 1),
      z: maxPlayers,
    });
  } catch (e) {
    console.warn('[sessions] failed to sync dimensional node:', e.message);
  }
}

/** Resolve userId from a bearer token. Returns null if invalid. */
function resolveUserId(req) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) return null;
  const token = hdr.slice(7);
  try {
    const d = jwt.verify(token, JWT_SECRET);
    return d.userId || null;
  } catch { return null; }
}

/** Find user record by userId */
function findUser(userId) {
  for (const key in manifoldData) {
    if (manifoldData[key].userId === userId) return manifoldData[key];
  }
  return null;
}

/** Verify a guest token (issued by join-invite). Returns guest payload or null. */
function resolveGuest(req) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) return null;
  const token = hdr.slice(7);
  try {
    const d = jwt.verify(token, JWT_SECRET);
    if (d.type === 'guest') return d;
    return null;
  } catch { return null; }
}

/** Resolve caller as auth user OR guest. Returns { isGuest, userId/guestId, playername, avatarId } */
function resolvePlayer(req) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) return null;
  const token = hdr.slice(7);
  try {
    const d = jwt.verify(token, JWT_SECRET);
    if (d.type === 'guest') {
      return { isGuest: true, guestId: d.guestId, playername: d.playername, avatarId: d.avatarId, sessionId: d.sessionId };
    }
    const user = findUser(d.userId);
    if (!user) return null;
    return { isGuest: false, userId: d.userId, playername: user.playername || user.username, avatarId: user.avatarId || 'robot' };
  } catch { return null; }
}

function requireAuthOrGuest(req, res, next) {
  const player = resolvePlayer(req);
  if (!player) return res.status(401).json({ success: false, error: 'Authentication required' });
  req.player = player;
  next();
}

function requireAuth(req, res, next) {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
  req.userId = userId;
  next();
}

/** Sanitize session for API response — hide internals */
function publicSession(s, callerId, callerIsGuest) {
  const mySlot = callerIsGuest
    ? s.players.find(p => p.guestId === callerId)
    : s.players.find(p => p.userId === callerId);
  return {
    sessionId: s.sessionId,
    gameId: s.gameId,
    gameName: GAMES[s.gameId]?.name || s.gameId,
    mode: s.mode,
    status: s.status,
    code: mySlot ? s.code : undefined, // only show code to participants
    players: s.players.map(p => ({
      playername: p.playername,
      avatarId: p.avatarId,
      type: p.type,
      isCreator: p.isCreator,
      ready: p.ready,
      online: p.online,
    })),
    bots: s.bots,
    maxPlayers: s.maxPlayers,
    createdAt: s.createdAt,
    startedAt: s.startedAt,
    gameUrl: s.gameUrl,
  };
}

function parityResult(memorySession, shadowEnvelope, remotePayload) {
  const memHash = memorySession ? TetracubeClient.sessionDigest(memorySession) : null;
  const shadowSession = shadowEnvelope && shadowEnvelope.value ? shadowEnvelope.value : null;
  const shadowHash = shadowSession ? TetracubeClient.sessionDigest(shadowSession) : null;

  let remoteSession = null;
  if (remotePayload && typeof remotePayload === 'object') {
    remoteSession = remotePayload.value || remotePayload.session || null;
  }
  const remoteHash = remoteSession ? TetracubeClient.sessionDigest(remoteSession) : null;

  return {
    memoryHash: memHash,
    shadowHash,
    remoteHash,
    memoryVsShadow: memHash && shadowHash ? memHash === shadowHash : null,
    shadowVsRemote: shadowHash && remoteHash ? shadowHash === remoteHash : null,
  };
}

function extractRemoteSession(remotePayload) {
  if (!remotePayload || typeof remotePayload !== 'object') return null;
  return remotePayload.value || remotePayload.session || null;
}

function normalizeSession(remoteSession, fallbackSessionId) {
  if (!remoteSession) return null;
  return {
    sessionId: remoteSession.sessionId || fallbackSessionId,
    gameId: remoteSession.gameId,
    mode: remoteSession.mode,
    status: remoteSession.status,
    code: remoteSession.code,
    players: Array.isArray(remoteSession.players) ? remoteSession.players : [],
    bots: Number(remoteSession.bots) || 0,
    maxPlayers: Number(remoteSession.maxPlayers) || 0,
    createdAt: remoteSession.createdAt || null,
    startedAt: remoteSession.startedAt || null,
    gameUrl: remoteSession.gameUrl || null,
  };
}

async function resolveSessionForRead(sessionId) {
  const sid = String(sessionId);
  if (TetracubeClient.isEnabled()) {
    try {
      const remote = await TetracubeClient.fetchRemoteSession(sid);
      const remoteSession = extractRemoteSession(remote);
      const normalized = normalizeSession(remoteSession, sid);
      if (normalized) return normalized;
    } catch {
      if (TETRACUBE_STRICT) return null;
      // remote unavailable; fall through to shadow/memory
    }
  }

  if (TETRACUBE_STRICT) return null;

  const shadow = TetracubeClient.getShadowSession(sid);
  if (shadow && shadow.value) {
    const normalized = normalizeSession(shadow.value, sid);
    if (normalized) return normalized;
  }

  return sessionsData[sid] || null;
}

async function resolveSessionsForListing() {
  if (TETRACUBE_STRICT) {
    // Strict mode forbids listing from shadow or memory authorities.
    return null;
  }
  if (TetracubeClient.isEnabled()) {
    const shadows = TetracubeClient.listShadowByTable('sessions');
    if (Array.isArray(shadows) && shadows.length > 0) {
      return shadows
        .map((s) => normalizeSession(s.value, s.row))
        .filter(Boolean);
    }
  }
  return Object.values(sessionsData);
}

// ── routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/sessions/create
 * Body: { gameId, mode: 'public'|'private'|'solo', bots: 0-3, maxPlayers? }
 * mode=solo: auth not required (1 bot, 1 human, no code)
 */
router.post('/create', async (req, res) => {
  purgeStaleSessions();

  const { gameId, mode = 'private', maxPlayers: reqMax } = req.body;
  let bots = Math.max(0, Math.min(parseInt(req.body.bots || 0), 3));

  if (!GAMES[gameId]) return res.status(400).json({ success: false, error: 'Unknown game' });
  const gameDef = GAMES[gameId];

  // Solo mode: no auth needed, player chooses 0-3 bots
  if (mode === 'solo') {
    // bots already clamped to 0-3 above; default to 1 if not specified
    if (isNaN(bots) || req.body.bots === undefined) bots = 1;
    const maxPlayers = 1 + bots;
    const sessionId = generateId('sess');
    const code = generateCode();
    sessionsData[sessionId] = {
      sessionId, gameId, mode: 'solo',
      status: 'active', // solo starts immediately
      code, players: [], bots,
      maxPlayers, createdAt: Date.now(), startedAt: Date.now(),
      gameUrl: `${gameDef.gamePath}?session=${sessionId}&bots=${bots}&mode=solo`,
    };
    syncSessionDimension(sessionsData[sessionId], 4);
    const writeStatus = await mirrorSessionToTetracube(sessionsData[sessionId], 'session:create:solo', 'system');
    if (strictWriteFailed(writeStatus)) {
      delete sessionsData[sessionId];
      return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
    }
    return res.json({ success: true, sessionId, gameUrl: sessionsData[sessionId].gameUrl });
  }

  // All other modes require auth
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Sign in to create a multiplayer game' });

  const user = findUser(userId);
  if (!user || !user.profileSetup) return res.status(403).json({ success: false, error: 'Complete profile setup first' });

  const maxPlayers = Math.min(reqMax || gameDef.maxPlayers, gameDef.maxPlayers);
  const sessionId = generateId('sess');
  const code = generateCode();

  const creatorSlot = {
    userId, type: 'auth', isCreator: true, ready: false, online: true,
    playername: user.playername || user.username,
    avatarId: user.avatarId || 'robot',
  };

  sessionsData[sessionId] = {
    sessionId, gameId, mode, status: 'waiting',
    code, players: [creatorSlot], bots,
    maxPlayers, createdAt: Date.now(), startedAt: null, gameUrl: null,
  };
  syncSessionDimension(sessionsData[sessionId], 3);
  const writeStatus = await mirrorSessionToTetracube(sessionsData[sessionId], 'session:create:multiplayer', String(userId));
  if (strictWriteFailed(writeStatus)) {
    delete sessionsData[sessionId];
    return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
  }

  const inviteUrl = `${process.env.BASE_URL || 'https://kensgames.com'}/invite/?code=${code}&game=${gameId}`;
  return res.json({ success: true, sessionId, code, inviteUrl, session: publicSession(sessionsData[sessionId], userId, false) });
});

/**
 * GET /api/sessions/game/:gameId/public
 * Returns list of open public sessions for a game
 */
router.get('/game/:gameId/public', async (req, res) => {
  purgeStaleSessions();
  const { gameId } = req.params;
  const source = await resolveSessionsForListing();
  if (TETRACUBE_STRICT && !source) {
    return strictUnavailable(res, 'strict_mode_requires_remote_listing_endpoint');
  }
  const sessions = source
    .filter(s => s.gameId === gameId && s.mode === 'public' && s.status === 'waiting' && s.players.length < s.maxPlayers)
    .map(s => ({
      sessionId: s.sessionId,
      gameName: GAMES[s.gameId]?.name,
      players: s.players.length,
      maxPlayers: s.maxPlayers,
      bots: s.bots,
      createdAt: s.createdAt,
    }));
  return res.json({ success: true, sessions });
});

/**
 * GET /api/sessions/parity
 * Returns parity for all in-memory sessions against tetracube shadow/remote
 */
router.get('/parity', requireAuth, async (req, res) => {
  purgeStaleSessions();
  const reports = [];

  for (const session of Object.values(sessionsData)) {
    const shadow = TetracubeClient.getShadowSession(session.sessionId);
    const writeStatus = TetracubeClient.getWriteStatus(session.sessionId);

    let remote = null;
    let remoteError = null;
    if (TetracubeClient.isEnabled()) {
      try {
        remote = await TetracubeClient.fetchRemoteSession(session.sessionId);
      } catch (e) {
        remoteError = String(e.message || e);
      }
    }

    reports.push({
      sessionId: session.sessionId,
      status: session.status,
      writeStatus,
      remoteError,
      parity: parityResult(session, shadow, remote),
    });
  }

  return res.json({
    success: true,
    tetracubeEnabled: TetracubeClient.isEnabled(),
    count: reports.length,
    reports,
  });
});

/**
 * GET /api/sessions/:sessionId/parity
 * Returns parity for one session
 */
router.get('/:sessionId/parity', requireAuth, async (req, res) => {
  const session = sessionsData[req.params.sessionId] || null;
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const shadow = TetracubeClient.getShadowSession(req.params.sessionId);
  const writeStatus = TetracubeClient.getWriteStatus(req.params.sessionId);

  let remote = null;
  let remoteError = null;
  if (TetracubeClient.isEnabled()) {
    try {
      remote = await TetracubeClient.fetchRemoteSession(req.params.sessionId);
    } catch (e) {
      remoteError = String(e.message || e);
    }
  }

  return res.json({
    success: true,
    sessionId: req.params.sessionId,
    tetracubeEnabled: TetracubeClient.isEnabled(),
    writeStatus,
    remoteError,
    parity: parityResult(session, shadow, remote),
  });
});

/**
 * GET /api/sessions/:sessionId
 * Returns session state. Auth or guest token required (must be in session).
 */
router.get('/:sessionId', requireAuthOrGuest, async (req, res) => {
  const session = await resolveSessionForRead(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  const p = req.player;
  const id = p.isGuest ? p.guestId : p.userId;
  return res.json({ success: true, session: publicSession(session, id, p.isGuest) });
});

/**
 * POST /api/sessions/join
 * Body: { code }
 * Multiplayer persistence is authoritative and requires signed-in identity.
 */
router.post('/join', async (req, res) => {
  purgeStaleSessions();
  const { code } = req.body;

  if (!code) return res.status(400).json({ success: false, error: 'Invite code required' });

  const session = Object.values(sessionsData).find(s => s.code === code.toUpperCase());
  if (!session) return res.status(404).json({ success: false, error: 'Invalid or expired invite code' });
  if (session.status !== 'waiting') return res.status(409).json({ success: false, error: 'Game already started' });
  if (session.players.length >= session.maxPlayers) return res.status(409).json({ success: false, error: 'Game is full' });

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Sign in to join multiplayer sessions' });
  }

  if (session.players.find(p => p.userId === userId)) {
    return res.status(409).json({ success: false, error: 'Already in this session' });
  }

  const user = findUser(userId);
  if (!user || !user.profileSetup) {
    return res.status(403).json({ success: false, error: 'Complete profile setup before joining multiplayer' });
  }

  const slot = {
    userId, type: 'auth', isCreator: false, ready: false, online: true,
    playername: user.playername || user.username || 'Player',
    avatarId: user.avatarId || 'robot',
  };

  session.players.push(slot);
  syncSessionDimension(session, 3);
  const callerId = userId || slot.guestId;
  const writeStatus = await mirrorSessionToTetracube(session, 'session:join', String(callerId || 'guest'));
  if (strictWriteFailed(writeStatus)) {
    session.players = session.players.filter((pl) => {
      if (slot.userId) return pl.userId !== slot.userId;
      if (slot.guestId) return pl.guestId !== slot.guestId;
      return true;
    });
    return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
  }
  return res.json({
    success: true,
    guestToken: null,
    sessionId: session.sessionId,
    session: publicSession(session, callerId, false),
  });
});

/**
 * POST /api/sessions/:sessionId/ready
 * Toggle ready state for the calling player
 */
router.post('/:sessionId/ready', requireAuthOrGuest, async (req, res) => {
  const session = sessionsData[req.params.sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.status !== 'waiting') return res.status(409).json({ success: false, error: 'Session not in waiting state' });

  const p = req.player;
  const slot = p.isGuest
    ? session.players.find(pl => pl.guestId === p.guestId)
    : session.players.find(pl => pl.userId === p.userId);

  if (!slot) return res.status(403).json({ success: false, error: 'You are not in this session' });

  slot.ready = !slot.ready;
  syncSessionDimension(session, 3);
  const writeStatus = await mirrorSessionToTetracube(session, 'session:ready-toggle', String(p.isGuest ? p.guestId : p.userId));
  if (strictWriteFailed(writeStatus)) {
    slot.ready = !slot.ready;
    return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
  }
  const id = p.isGuest ? p.guestId : p.userId;
  return res.json({ success: true, ready: slot.ready, session: publicSession(session, id, p.isGuest) });
});

/**
 * POST /api/sessions/:sessionId/bots
 * Body: { bots: 0-3 }
 * Creator only — set number of bot fill slots
 */
router.post('/:sessionId/bots', requireAuth, async (req, res) => {
  const session = sessionsData[req.params.sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const creator = session.players.find(p => p.userId === req.userId && p.isCreator);
  if (!creator) return res.status(403).json({ success: false, error: 'Only the game creator can set bots' });

  const prevBots = session.bots;
  const bots = Math.max(0, Math.min(parseInt(req.body.bots || 0), session.maxPlayers - 1));
  session.bots = bots;
  syncSessionDimension(session, 3);
  const writeStatus = await mirrorSessionToTetracube(session, 'session:bots-update', String(req.userId));
  if (strictWriteFailed(writeStatus)) {
    session.bots = prevBots;
    return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
  }
  return res.json({ success: true, bots, session: publicSession(session, req.userId, false) });
});

/**
 * POST /api/sessions/:sessionId/start
 * Creator only — all human players must be ready (or creator can override)
 * Returns the game URL for all players to navigate to
 */
router.post('/:sessionId/start', requireAuth, async (req, res) => {
  const session = sessionsData[req.params.sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.status !== 'waiting') return res.status(409).json({ success: false, error: 'Session already started' });

  const creator = session.players.find(p => p.userId === req.userId && p.isCreator);
  if (!creator) return res.status(403).json({ success: false, error: 'Only the game creator can start the game' });

  const gameDef = GAMES[session.gameId];
  if (!gameDef) return res.status(400).json({ success: false, error: 'Unknown game' });

  const totalSlots = session.players.length + session.bots;
  if (totalSlots < gameDef.minPlayers) {
    return res.status(400).json({ success: false, error: `Need at least ${gameDef.minPlayers} players (including bots) to start` });
  }

  const prevStatus = session.status;
  const prevStartedAt = session.startedAt;
  const prevGameUrl = session.gameUrl;
  session.status = 'active';
  session.startedAt = Date.now();
  session.gameUrl = `${gameDef.gamePath}?session=${session.sessionId}&bots=${session.bots}`;
  syncSessionDimension(session, 4);
  const writeStatus = await mirrorSessionToTetracube(session, 'session:start', String(req.userId));
  if (strictWriteFailed(writeStatus)) {
    session.status = prevStatus;
    session.startedAt = prevStartedAt;
    session.gameUrl = prevGameUrl;
    return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
  }

  return res.json({ success: true, gameUrl: session.gameUrl, sessionId: session.sessionId, session: publicSession(session, req.userId, false) });
});

/**
 * DELETE /api/sessions/:sessionId
 * Creator only — cancel a waiting session
 */
router.delete('/:sessionId', requireAuth, async (req, res) => {
  const session = sessionsData[req.params.sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.status !== 'waiting') return res.status(409).json({ success: false, error: 'Cannot cancel a session that has started' });

  const creator = session.players.find(p => p.userId === req.userId && p.isCreator);
  if (!creator) return res.status(403).json({ success: false, error: 'Only the creator can cancel this session' });

  syncSessionDimension(session, 0);
  const writeStatus = await mirrorSessionToTetracube({ ...session, status: 'ended' }, 'session:delete', String(req.userId));
  if (strictWriteFailed(writeStatus)) {
    return strictUnavailable(res, writeStatus && (writeStatus.reason || writeStatus.error || 'write_failed'));
  }
  delete sessionsData[req.params.sessionId];
  return res.json({ success: true });
});

module.exports = router;
