/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE: /api/guilds
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints:
 *   GET  /api/guilds                  — list all guilds (public)
 *   POST /api/guilds/create           — create a guild (requires guildTosAgreed)
 *   POST /api/guilds/:guildId/join    — request to join
 *   GET  /api/guilds/:guildId         — guild info + members
 *   POST /api/guilds/:guildId/accept  — guildmaster: accept member request
 *   POST /api/guilds/:guildId/suspend — guildmaster: suspend member
 *   POST /api/guilds/:guildId/reinstate — guildmaster: reinstate member
 *   POST /api/guilds/:guildId/boot    — guildmaster: permanently remove member
 *   POST /api/guilds/:guildId/leave   — member leaves guild
 *   GET  /api/guilds/:guildId/appeals — guildmaster: view pending appeals
 *   POST /api/guilds/:guildId/appeal  — suspended member: file appeal
 *   POST /api/guilds/:guildId/appeal/:appealId/decide — guildmaster: approve/deny
 *
 * Suspension durations: '24h' | '7d' | '30d' | 'permanent'
 * Guild suspensions do NOT affect kensgames.com membership.
 * Only guildmaster can suspend/boot. guildmaster cannot be booted by anyone
 * except kbingh (superuser).
 */

'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodeCrypto = require('crypto');
const AuthHandler = require('../auth-handler');
const { manifoldData, guildsData, notifQueue } = require('../store');
const TetracubeClient = require('../tetracube-client');
const TETRACUBE_STRICT = typeof TetracubeClient.isStrict === 'function' && TetracubeClient.isStrict();

const authHandler = new AuthHandler();

const SUSPEND_DURATIONS_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'permanent': Infinity,
};

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  req.userId = decoded.userId;
  next();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getUserById(userId) {
  for (const k of Object.keys(manifoldData)) {
    if (manifoldData[k].userId === userId) return manifoldData[k];
  }
  return null;
}

function addNotification(targetUserId, notif) {
  if (!notifQueue[targetUserId]) notifQueue[targetUserId] = [];
  notifQueue[targetUserId].push({
    ...notif,
    id: `notif-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    createdAt: Date.now(),
    read: false,
  });
}

function isMemberSuspended(member) {
  if (!member.suspended) return false;
  if (member.suspendedUntil === Infinity) return true;
  return Date.now() < member.suspendedUntil;
}

function mirrorGuildToTetracube(guild, eventName, actorId) {
  return TetracubeClient.dualWriteGuild(guild, {
    event: eventName,
    actor: actorId || 'system',
  }).catch((err) => {
    console.warn('[guilds] tetracube dual-write failed:', err.message);
    return { ok: false, skipped: false, error: String(err.message || err), ts: Date.now() };
  });
}

function strictModuleUnavailable(res) {
  return res.status(503).json({
    success: false,
    error: 'Tetracube authoritative mode unavailable for guild writes',
    detail: 'guilds module is not fully cut over to remote-authoritative transactions',
    strict: true,
  });
}

function digest(v) {
  return nodeCrypto.createHash('sha256').update(JSON.stringify(v || {})).digest('hex');
}

function guildParity(memoryGuild, shadowEnvelope, remotePayload) {
  const memoryHash = memoryGuild ? digest(memoryGuild) : null;
  const shadowValue = shadowEnvelope && shadowEnvelope.value ? shadowEnvelope.value : null;
  const shadowHash = shadowValue ? digest(shadowValue) : null;
  const remoteValue = remotePayload && (remotePayload.value || remotePayload.guild) ? (remotePayload.value || remotePayload.guild) : null;
  const remoteHash = remoteValue ? digest(remoteValue) : null;

  return {
    memoryHash,
    shadowHash,
    remoteHash,
    memoryVsShadow: memoryHash && shadowHash ? memoryHash === shadowHash : null,
    shadowVsRemote: shadowHash && remoteHash ? shadowHash === remoteHash : null,
  };
}

// ── GET /api/guilds ──────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const list = Object.values(guildsData).map(g => ({
    guildId: g.guildId,
    name: g.name,
    tag: g.tag,
    masterId: g.masterId,
    memberCount: g.members.filter(m => !isMemberSuspended(m)).length,
    createdAt: g.createdAt,
    public: g.public,
  }));
  return res.json({ success: true, guilds: list });
});

router.get('/parity', requireAuth, async (req, res) => {
  const reports = [];
  for (const guild of Object.values(guildsData)) {
    const key = `guild:${guild.guildId}`;
    const shadow = TetracubeClient.getShadowByKey(key);
    const writeStatus = TetracubeClient.getWriteStatus(key);

    let remote = null;
    let remoteError = null;
    if (TetracubeClient.isEnabled()) {
      try {
        remote = await TetracubeClient.fetchRemoteRecord('guilds', guild.guildId, 'snapshot');
      } catch (e) {
        remoteError = String(e.message || e);
      }
    }

    reports.push({
      guildId: guild.guildId,
      writeStatus,
      remoteError,
      parity: guildParity(guild, shadow, remote),
    });
  }

  return res.json({
    success: true,
    tetracubeEnabled: TetracubeClient.isEnabled(),
    count: reports.length,
    reports,
  });
});

router.get('/:guildId/parity', requireAuth, async (req, res) => {
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });

  const key = `guild:${guild.guildId}`;
  const shadow = TetracubeClient.getShadowByKey(key);
  const writeStatus = TetracubeClient.getWriteStatus(key);

  let remote = null;
  let remoteError = null;
  if (TetracubeClient.isEnabled()) {
    try {
      remote = await TetracubeClient.fetchRemoteRecord('guilds', guild.guildId, 'snapshot');
    } catch (e) {
      remoteError = String(e.message || e);
    }
  }

  return res.json({
    success: true,
    guildId: guild.guildId,
    writeStatus,
    remoteError,
    parity: guildParity(guild, shadow, remote),
  });
});

// ── POST /api/guilds/create ──────────────────────────────────────────────────
router.post('/create', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (!user.guildTosAgreed) {
    return res.status(403).json({ success: false, error: 'Must agree to Guild TOS before creating a guild' });
  }
  if (user.guildId) {
    return res.status(409).json({ success: false, error: 'You are already in a guild. Leave it first.' });
  }

  const { name, tag } = req.body;
  if (!name || name.trim().length < 3 || name.trim().length > 40) {
    return res.status(400).json({ success: false, error: 'Guild name must be 3-40 characters' });
  }
  if (!tag || !/^[A-Za-z0-9]{2,5}$/.test(tag)) {
    return res.status(400).json({ success: false, error: 'Guild tag must be 2-5 alphanumeric characters' });
  }

  // Name + tag uniqueness
  for (const g of Object.values(guildsData)) {
    if (g.name.toLowerCase() === name.trim().toLowerCase()) {
      return res.status(409).json({ success: false, error: 'Guild name already taken' });
    }
    if (g.tag.toUpperCase() === tag.toUpperCase()) {
      return res.status(409).json({ success: false, error: 'Guild tag already taken' });
    }
  }

  const guildId = `guild-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  guildsData[guildId] = {
    guildId,
    name: name.trim(),
    tag: tag.toUpperCase(),
    masterId: req.userId,
    members: [{ userId: req.userId, role: 'guildmaster', joinedAt: Date.now(), suspended: false }],
    requests: [], // join requests [{ userId, note, sentAt }]
    appeals: [], // suspension appeals
    chat: [], // recent messages (max 200)
    public: true,
    createdAt: Date.now(),
  };

  user.guildId = guildId;
  user.guildRole = 'guildmaster';
  mirrorGuildToTetracube(guildsData[guildId], 'guild:create', String(req.userId));

  return res.status(201).json({ success: true, guildId, name: guildsData[guildId].name });
});

// ── GET /api/guilds/:guildId ─────────────────────────────────────────────────
router.get('/:guildId', requireAuth, (req, res) => {
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });

  const members = guild.members.map(m => {
    const u = getUserById(m.userId);
    return {
      userId: m.userId,
      playername: u?.playername || u?.username || 'Unknown',
      avatarId: u?.avatarId || null,
      role: m.role,
      online: u?.online || false,
      suspended: isMemberSuspended(m),
      suspendedUntil: m.suspendedUntil || null,
      joinedAt: m.joinedAt,
    };
  });

  const isMember = guild.members.some(m => m.userId === req.userId);

  return res.json({
    success: true,
    guild: {
      guildId: guild.guildId,
      name: guild.name,
      tag: guild.tag,
      masterId: guild.masterId,
      members,
      public: guild.public,
      createdAt: guild.createdAt,
      // only expose requests + appeals to guildmaster
      requests: guild.masterId === req.userId ? guild.requests : undefined,
      appeals: guild.masterId === req.userId ? guild.appeals : undefined,
      isMember,
    },
  });
});

// ── POST /api/guilds/:guildId/join ───────────────────────────────────────────
router.post('/:guildId/join', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const user = getUserById(req.userId);
  const guild = guildsData[req.params.guildId];

  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (!user.guildTosAgreed) {
    return res.status(403).json({ success: false, error: 'Must agree to Guild TOS before joining' });
  }
  if (user.guildId) {
    return res.status(409).json({ success: false, error: 'Already in a guild' });
  }
  if (guild.members.some(m => m.userId === req.userId)) {
    return res.status(409).json({ success: false, error: 'Already a member' });
  }
  if (guild.requests.some(r => r.userId === req.userId)) {
    return res.status(409).json({ success: false, error: 'Request already pending' });
  }

  const note = (req.body.note || '').slice(0, 200);
  guild.requests.push({ userId: req.userId, note, sentAt: Date.now() });
  mirrorGuildToTetracube(guild, 'guild:join-request', String(req.userId));

  // Notify guildmaster
  addNotification(guild.masterId, { type: 'guild_join_request', guildId: guild.guildId, fromUserId: req.userId });

  return res.json({ success: true, message: 'Join request sent to guildmaster' });
});

// ── POST /api/guilds/:guildId/accept ─────────────────────────────────────────
router.post('/:guildId/accept', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId !== req.userId) return res.status(403).json({ success: false, error: 'Guildmaster only' });

  const { userId, accept } = req.body;
  const reqIdx = guild.requests.findIndex(r => r.userId === userId);
  if (reqIdx === -1) return res.status(404).json({ success: false, error: 'Request not found' });

  guild.requests.splice(reqIdx, 1);

  if (accept) {
    const user = getUserById(userId);
    if (user) {
      user.guildId = guild.guildId;
      user.guildRole = 'member';
    }
    guild.members.push({ userId, role: 'member', joinedAt: Date.now(), suspended: false });
    addNotification(userId, { type: 'guild_accepted', guildId: guild.guildId, guildName: guild.name });
  } else {
    addNotification(userId, { type: 'guild_declined', guildId: guild.guildId, guildName: guild.name });
  }

  mirrorGuildToTetracube(guild, accept ? 'guild:join-accepted' : 'guild:join-declined', String(req.userId));

  return res.json({ success: true });
});

// ── POST /api/guilds/:guildId/suspend ─────────────────────────────────────────
router.post('/:guildId/suspend', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId !== req.userId) return res.status(403).json({ success: false, error: 'Guildmaster only' });

  const { userId, duration, reason } = req.body;
  const durationMs = SUSPEND_DURATIONS_MS[duration];
  if (!durationMs) {
    return res.status(400).json({ success: false, error: 'Duration must be: 24h | 7d | 30d | permanent' });
  }

  // Cannot suspend yourself
  if (userId === req.userId) return res.status(400).json({ success: false, error: 'Cannot suspend yourself' });

  const member = guild.members.find(m => m.userId === userId);
  if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
  if (member.role === 'guildmaster') return res.status(403).json({ success: false, error: 'Cannot suspend guildmaster' });

  const now = Date.now();
  member.suspended = true;
  member.suspendedAt = now;
  member.suspendedUntil = duration === 'permanent' ? Infinity : now + durationMs;
  member.suspendReason = (reason || '').slice(0, 500);
  member.duration = duration;
  member.appealable = true;
  member.appealId = null;

  // Notify member — they can appeal
  addNotification(userId, {
    type: 'guild_suspended',
    guildId: guild.guildId,
    guildName: guild.name,
    duration,
    reason: member.suspendReason,
    appealable: true,
  });

  mirrorGuildToTetracube(guild, 'guild:member-suspended', String(req.userId));

  return res.json({ success: true, message: `Member suspended (${duration})` });
});

// ── POST /api/guilds/:guildId/reinstate ──────────────────────────────────────
router.post('/:guildId/reinstate', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId !== req.userId) return res.status(403).json({ success: false, error: 'Guildmaster only' });

  const { userId } = req.body;
  const member = guild.members.find(m => m.userId === userId);
  if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

  member.suspended = false;
  member.suspendedUntil = null;
  member.suspendReason = null;
  member.duration = null;
  member.appealable = false;

  addNotification(userId, { type: 'guild_reinstated', guildId: guild.guildId, guildName: guild.name });
  mirrorGuildToTetracube(guild, 'guild:member-reinstated', String(req.userId));

  return res.json({ success: true, message: 'Member reinstated' });
});

// ── POST /api/guilds/:guildId/boot ───────────────────────────────────────────
router.post('/:guildId/boot', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId !== req.userId) return res.status(403).json({ success: false, error: 'Guildmaster only' });

  const { userId } = req.body;
  if (userId === req.userId) return res.status(400).json({ success: false, error: 'Cannot boot yourself' });

  const idx = guild.members.findIndex(m => m.userId === userId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Member not found' });
  if (guild.members[idx].role === 'guildmaster') return res.status(403).json({ success: false, error: 'Cannot boot guildmaster' });

  guild.members.splice(idx, 1);

  const user = getUserById(userId);
  if (user && user.guildId === guild.guildId) {
    user.guildId = null;
    user.guildRole = null;
  }

  mirrorGuildToTetracube(guild, 'guild:member-booted', String(req.userId));

  // No notification per spec — silent boot
  return res.json({ success: true, message: 'Member removed from guild' });
});

// ── POST /api/guilds/:guildId/leave ─────────────────────────────────────────
router.post('/:guildId/leave', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId === req.userId) {
    return res.status(400).json({ success: false, error: 'Guildmaster cannot leave. Transfer ownership or disband first.' });
  }

  const idx = guild.members.findIndex(m => m.userId === req.userId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Not a member' });

  guild.members.splice(idx, 1);

  const user = getUserById(req.userId);
  if (user) { user.guildId = null; user.guildRole = null; }
  mirrorGuildToTetracube(guild, 'guild:member-left', String(req.userId));

  return res.json({ success: true, message: 'Left guild' });
});

// ── POST /api/guilds/:guildId/appeal ─────────────────────────────────────────
// Suspended member files an appeal
router.post('/:guildId/appeal', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });

  const member = guild.members.find(m => m.userId === req.userId);
  if (!member) return res.status(404).json({ success: false, error: 'Not a guild member' });
  if (!isMemberSuspended(member)) return res.status(400).json({ success: false, error: 'Not currently suspended' });
  if (!member.appealable) return res.status(403).json({ success: false, error: 'Appeal not permitted for this suspension' });
  if (member.appealId) return res.status(409).json({ success: false, error: 'Appeal already submitted' });

  const { text } = req.body;
  if (!text || text.trim().length < 10) {
    return res.status(400).json({ success: false, error: 'Appeal text must be at least 10 characters' });
  }

  const appealId = `appeal-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const appeal = {
    appealId,
    userId: req.userId,
    text: text.trim().slice(0, 1000),
    status: 'pending', // pending | approved | denied
    createdAt: Date.now(),
  };

  guild.appeals.push(appeal);
  member.appealId = appealId;
  mirrorGuildToTetracube(guild, 'guild:appeal-created', String(req.userId));

  // Notify guildmaster
  addNotification(guild.masterId, {
    type: 'guild_appeal',
    guildId: guild.guildId,
    guildName: guild.name,
    fromUserId: req.userId,
    appealId,
  });

  return res.json({ success: true, message: 'Appeal submitted' });
});

// ── GET /api/guilds/:guildId/appeals ─────────────────────────────────────────
router.get('/:guildId/appeals', requireAuth, (req, res) => {
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId !== req.userId) return res.status(403).json({ success: false, error: 'Guildmaster only' });

  return res.json({ success: true, appeals: guild.appeals.filter(a => a.status === 'pending') });
});

// ── POST /api/guilds/:guildId/appeal/:appealId/decide ────────────────────────
router.post('/:guildId/appeal/:appealId/decide', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });
  if (guild.masterId !== req.userId) return res.status(403).json({ success: false, error: 'Guildmaster only' });

  const { approve } = req.body;
  const appeal = guild.appeals.find(a => a.appealId === req.params.appealId);
  if (!appeal) return res.status(404).json({ success: false, error: 'Appeal not found' });
  if (appeal.status !== 'pending') return res.status(409).json({ success: false, error: 'Appeal already decided' });

  appeal.status = approve ? 'approved' : 'denied';
  appeal.decidedAt = Date.now();

  const member = guild.members.find(m => m.userId === appeal.userId);

  if (approve && member) {
    // Reinstate
    member.suspended = false;
    member.suspendedUntil = null;
    member.suspendReason = null;
    member.duration = null;
    member.appealable = false;
    member.appealId = null;

    addNotification(appeal.userId, {
      type: 'guild_appeal_approved',
      guildId: guild.guildId,
      guildName: guild.name,
    });
  } else {
    // Denied — suspension remains, no further appeals
    if (member) {
      member.appealable = false;
      member.appealId = null;
    }
    addNotification(appeal.userId, {
      type: 'guild_appeal_denied',
      guildId: guild.guildId,
      guildName: guild.name,
      duration: member?.duration || 'unknown',
    });
  }

  mirrorGuildToTetracube(guild, approve ? 'guild:appeal-approved' : 'guild:appeal-denied', String(req.userId));

  return res.json({ success: true, decision: appeal.status });
});

module.exports = router;
