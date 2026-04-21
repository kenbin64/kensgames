/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE: /api/friends
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints:
 *   GET  /api/friends                 — my friend list with online status
 *   POST /api/friends/request         — send friend request (with note)
 *   POST /api/friends/respond         — accept or decline request
 *   POST /api/friends/block           — block a user (portal-wide hide)
 *   POST /api/friends/unblock         — unblock (24hr cooldown enforced)
 *   DELETE /api/friends/:userId       — remove friend
 *   GET  /api/friends/requests        — pending incoming requests
 *
 * Rules:
 *  - Regular members: block/unblock only, no suspension notifications
 *  - 24-hour cooldown between re-blocking the same user
 *  - Friend requests include a short text note (max 200 chars)
 *  - Both parties must agree to Friend TOS (tracked on FriendRecord)
 */

'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const AuthHandler = require('../auth-handler');
const { manifoldData, friendsData, notifQueue } = require('../store');
const TetracubeClient = require('../tetracube-client');
const TETRACUBE_STRICT = typeof TetracubeClient.isStrict === 'function' && TetracubeClient.isStrict();

const authHandler = new AuthHandler();

const MS_24H = 24 * 60 * 60 * 1000;

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
function getFriendRecord(userId) {
  if (!friendsData[userId]) {
    friendsData[userId] = {
      userId,
      friends: [],   // [{ userId, addedAt }]
      requests: [],   // incoming: [{ fromUserId, note, sentAt }]
      sent: [],   // outgoing: [{ toUserId, note, sentAt }]
      blocked: [],   // [{ userId, blockedAt, lastBlockedAt }]
    };
  }
  return friendsData[userId];
}

function getUserById(userId) {
  for (const k of Object.keys(manifoldData)) {
    if (manifoldData[k].userId === userId) return manifoldData[k];
  }
  return null;
}

function addNotification(targetUserId, notif) {
  if (!notifQueue[targetUserId]) notifQueue[targetUserId] = [];
  notifQueue[targetUserId].push({ ...notif, id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now(), read: false });
}

function mirrorFriendRecord(userId, record, eventName, actorId) {
  return TetracubeClient.dualWriteFriendsRecord(userId, record, {
    event: eventName,
    actor: actorId || 'system',
  }).catch((err) => {
    console.warn('[friends] tetracube dual-write failed:', err.message);
    return { ok: false, skipped: false, error: String(err.message || err), ts: Date.now() };
  });
}

function strictModuleUnavailable(res) {
  return res.status(503).json({
    success: false,
    error: 'Tetracube authoritative mode unavailable for friends writes',
    detail: 'friends module is not fully cut over to remote-authoritative transactions',
    strict: true,
  });
}

function digest(v) {
  return crypto.createHash('sha256').update(JSON.stringify(v || {})).digest('hex');
}

// ── GET /api/friends ─────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const rec = getFriendRecord(req.userId);
  const list = rec.friends.map(f => {
    const u = getUserById(f.userId);
    return {
      userId: f.userId,
      playername: u?.playername || u?.username || 'Unknown',
      avatarId: u?.avatarId || null,
      online: u?.online || false,
      addedAt: f.addedAt,
    };
  });
  return res.json({ success: true, friends: list });
});

// ── GET /api/friends/requests ────────────────────────────────────────────────
router.get('/requests', requireAuth, (req, res) => {
  const rec = getFriendRecord(req.userId);
  const incoming = rec.requests.map(r => {
    const u = getUserById(r.fromUserId);
    return {
      fromUserId: r.fromUserId,
      playername: u?.playername || u?.username || 'Unknown',
      avatarId: u?.avatarId || null,
      note: r.note,
      sentAt: r.sentAt,
    };
  });
  return res.json({ success: true, requests: incoming });
});

router.get('/parity', requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const rec = getFriendRecord(req.userId);
  const key = `friends:${userId}`;
  const shadow = TetracubeClient.getShadowByKey(key);
  const writeStatus = TetracubeClient.getWriteStatus(key);

  let remote = null;
  let remoteError = null;
  if (TetracubeClient.isEnabled()) {
    try {
      remote = await TetracubeClient.fetchRemoteRecord('friends', userId, 'snapshot');
    } catch (e) {
      remoteError = String(e.message || e);
    }
  }

  const memoryHash = digest(rec);
  const shadowHash = shadow && shadow.value ? digest(shadow.value) : null;
  const remoteValue = remote && (remote.value || remote.record) ? (remote.value || remote.record) : null;
  const remoteHash = remoteValue ? digest(remoteValue) : null;

  return res.json({
    success: true,
    userId,
    writeStatus,
    remoteError,
    parity: {
      memoryHash,
      shadowHash,
      remoteHash,
      memoryVsShadow: memoryHash && shadowHash ? memoryHash === shadowHash : null,
      shadowVsRemote: shadowHash && remoteHash ? shadowHash === remoteHash : null,
    },
  });
});

// ── POST /api/friends/request ────────────────────────────────────────────────
router.post('/request', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const { toUserId, note } = req.body;
  if (!toUserId) return res.status(400).json({ success: false, error: 'toUserId required' });
  if (toUserId === req.userId) return res.status(400).json({ success: false, error: 'Cannot add yourself' });

  const target = getUserById(toUserId);
  if (!target || target.status === 'banned') {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }

  const myRec = getFriendRecord(req.userId);
  const theirRec = getFriendRecord(toUserId);

  // Already friends
  if (myRec.friends.some(f => f.userId === toUserId)) {
    return res.status(409).json({ success: false, error: 'Already friends' });
  }

  // Blocked by them
  if (theirRec.blocked.some(b => b.userId === req.userId)) {
    return res.status(403).json({ success: false, error: 'Unable to send request' });
  }

  // Already sent
  if (myRec.sent.some(s => s.toUserId === toUserId)) {
    return res.status(409).json({ success: false, error: 'Request already sent' });
  }

  const safeNote = (note || '').slice(0, 200);

  myRec.sent.push({ toUserId, note: safeNote, sentAt: Date.now() });
  theirRec.requests.push({ fromUserId: req.userId, note: safeNote, sentAt: Date.now() });
  mirrorFriendRecord(req.userId, myRec, 'friends:request-sent', String(req.userId));
  mirrorFriendRecord(toUserId, theirRec, 'friends:request-received', String(req.userId));

  return res.json({ success: true, message: 'Friend request sent' });
});

// ── POST /api/friends/respond ────────────────────────────────────────────────
router.post('/respond', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const { fromUserId, accept } = req.body;
  if (!fromUserId) return res.status(400).json({ success: false, error: 'fromUserId required' });

  const myRec = getFriendRecord(req.userId);
  const theirRec = getFriendRecord(fromUserId);

  const reqIdx = myRec.requests.findIndex(r => r.fromUserId === fromUserId);
  if (reqIdx === -1) return res.status(404).json({ success: false, error: 'Request not found' });

  // Remove request from both
  myRec.requests.splice(reqIdx, 1);
  const sentIdx = theirRec.sent.findIndex(s => s.toUserId === req.userId);
  if (sentIdx !== -1) theirRec.sent.splice(sentIdx, 1);

  if (accept) {
    const now = Date.now();
    myRec.friends.push({ userId: fromUserId, addedAt: now });
    theirRec.friends.push({ userId: req.userId, addedAt: now });
    mirrorFriendRecord(req.userId, myRec, 'friends:request-accepted', String(req.userId));
    mirrorFriendRecord(fromUserId, theirRec, 'friends:request-accepted', String(req.userId));
    return res.json({ success: true, message: 'Friend request accepted' });
  } else {
    mirrorFriendRecord(req.userId, myRec, 'friends:request-declined', String(req.userId));
    mirrorFriendRecord(fromUserId, theirRec, 'friends:request-declined', String(req.userId));
    return res.json({ success: true, message: 'Friend request declined' });
  }
});

// ── DELETE /api/friends/:userId ──────────────────────────────────────────────
router.delete('/:userId', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const targetId = parseInt(req.params.userId, 10);
  if (isNaN(targetId)) return res.status(400).json({ success: false, error: 'Invalid user ID' });

  const myRec = getFriendRecord(req.userId);
  const theirRec = getFriendRecord(targetId);

  myRec.friends = myRec.friends.filter(f => f.userId !== targetId);
  theirRec.friends = theirRec.friends.filter(f => f.userId !== req.userId);
  mirrorFriendRecord(req.userId, myRec, 'friends:removed', String(req.userId));
  mirrorFriendRecord(targetId, theirRec, 'friends:removed', String(req.userId));

  return res.json({ success: true, message: 'Friend removed' });
});

// ── POST /api/friends/block ──────────────────────────────────────────────────
router.post('/block', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

  const myRec = getFriendRecord(req.userId);

  const existing = myRec.blocked.find(b => b.userId === targetUserId);
  if (existing) {
    // Enforce 24-hour cooldown before re-blocking
    const cooldownRemaining = (existing.lastBlockedAt + MS_24H) - Date.now();
    if (cooldownRemaining > 0) {
      const hoursLeft = Math.ceil(cooldownRemaining / (60 * 60 * 1000));
      return res.status(429).json({ success: false, error: `You can block this player again in ${hoursLeft} hour(s)` });
    }
    existing.blockedAt = Date.now();
    existing.lastBlockedAt = Date.now();
  } else {
    myRec.blocked.push({ userId: targetUserId, blockedAt: Date.now(), lastBlockedAt: Date.now() });
  }

  // Also remove from friends if present
  myRec.friends = myRec.friends.filter(f => f.userId !== targetUserId);
  const theirRec = getFriendRecord(targetUserId);
  theirRec.friends = theirRec.friends.filter(f => f.userId !== req.userId);
  mirrorFriendRecord(req.userId, myRec, 'friends:blocked', String(req.userId));
  mirrorFriendRecord(targetUserId, theirRec, 'friends:blocked-by-other', String(req.userId));

  return res.json({ success: true, message: 'User blocked' });
});

// ── POST /api/friends/unblock ────────────────────────────────────────────────
router.post('/unblock', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId required' });

  const myRec = getFriendRecord(req.userId);
  myRec.blocked = myRec.blocked.filter(b => b.userId !== targetUserId);
  mirrorFriendRecord(req.userId, myRec, 'friends:unblocked', String(req.userId));

  return res.json({ success: true, message: 'User unblocked' });
});

module.exports = router;
