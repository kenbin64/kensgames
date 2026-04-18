/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE: /api/players
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints:
 *   GET  /api/players/me              — current user's full profile
 *   POST /api/players/setup           — first-login: set playername + avatar
 *   POST /api/players/profile         — update playername or avatar
 *   GET  /api/players/search?q=       — search by username or playername
 *   GET  /api/players/:userId/profile — public profile of any user
 *   GET  /api/players/online          — list of online users (friends/guild only)
 *   POST /api/players/tos/agree       — record TOS agreement
 */

'use strict';

const express = require('express');
const router = express.Router();
const AuthHandler = require('../auth-handler');
const { manifoldData } = require('../store');

const authHandler = new AuthHandler();

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  req.userId = decoded.userId;
  req.sessionId = decoded.sessionId;
  next();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getUserById(userId) {
  for (const key of Object.keys(manifoldData)) {
    if (manifoldData[key].userId === userId) return manifoldData[key];
  }
  return null;
}

function sanitizePublicProfile(u) {
  return {
    userId: u.userId,
    username: u.username,
    playername: u.playername || null,
    avatar: u.avatar,
    avatarId: u.avatarId || null,
    online: u.online || false,
    stats: u.stats || {},
    guildId: u.guildId || null,
    joinedAt: u.createdAt,
  };
}

const PLAYERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

// ── GET /api/players/check-playername?name= ─────────────────────────────────
// Unauthenticated check — returns { available: bool }
router.get('/check-playername', (req, res) => {
  const name = (req.query.name || '').trim();
  if (!PLAYERNAME_RE.test(name)) {
    return res.json({ available: false, error: 'Invalid format' });
  }
  const taken = Object.keys(manifoldData).some(
    k => manifoldData[k].playername?.toLowerCase() === name.toLowerCase()
  );
  return res.json({ available: !taken });
});

// ── GET /api/players/me ──────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  return res.json({
    success: true,
    userId: user.userId,
    username: user.username,
    email: user.email,
    playername: user.playername || null,
    avatar: user.avatar,
    avatarId: user.avatarId || null,
    profileSetup: user.profileSetup || false,
    tosAgreed: user.tosAgreed || false,
    tosAgreedAt: user.tosAgreedAt || null,
    isAdmin: user.isAdmin || false,
    isSuperuser: user.isSuperuser || false,
    adminLevel: user.adminLevel || 0,
    adminTosAgreed: user.adminTosAgreed || false,
    stats: user.stats || {},
    guildId: user.guildId || null,
    guildRole: user.guildRole || null,
  });
});

// ── POST /api/players/tos/agree ─────────────────────────────────────────────
router.post('/tos/agree', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const { tosType } = req.body; // 'general' | 'guild' | 'admin'
  const allowed = ['general', 'guild', 'admin'];
  if (!allowed.includes(tosType)) {
    return res.status(400).json({ success: false, error: 'Invalid TOS type' });
  }

  const updateKey = tosType === 'general' ? 'tosAgreed'
    : tosType === 'guild' ? 'guildTosAgreed'
      : 'adminTosAgreed';
  const updateTsKey = updateKey + 'At';

  user[updateKey] = true;
  user[updateTsKey] = Date.now();
  user.lastModified = Date.now();

  return res.json({ success: true, message: `${tosType} TOS recorded` });
});

// ── POST /api/players/setup ─────────────────────────────────────────────────
// First-login: playername + avatar (requires tosAgreed)
router.post('/setup', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (!user.tosAgreed) {
    return res.status(403).json({ success: false, error: 'Must agree to TOS before setup' });
  }

  if (user.profileSetup) {
    return res.status(400).json({ success: false, error: 'Profile already set up' });
  }

  const { playername, avatarId } = req.body;

  if (!playername || !PLAYERNAME_RE.test(playername)) {
    return res.status(400).json({ success: false, error: 'Playername must be 3-20 characters: letters, numbers, underscore only' });
  }

  // Check playername uniqueness
  for (const key of Object.keys(manifoldData)) {
    if (manifoldData[key].playername?.toLowerCase() === playername.toLowerCase() &&
      manifoldData[key].userId !== req.userId) {
      return res.status(409).json({ success: false, error: 'Playername already taken' });
    }
  }

  if (!avatarId) {
    return res.status(400).json({ success: false, error: 'Avatar selection required' });
  }

  user.playername = playername.trim();
  user.avatarId = avatarId;
  user.profileSetup = true;
  user.lastModified = Date.now();

  return res.json({
    success: true,
    message: 'Profile setup complete!',
    playername: user.playername,
    avatarId: user.avatarId,
  });
});

// ── POST /api/players/profile ───────────────────────────────────────────────
// Update playername or avatar after initial setup — blocked mid-game
router.post('/profile', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Block changes while user is in an active session
  const { sessionsData } = require('../store');
  for (const sid of Object.keys(sessionsData)) {
    const sess = sessionsData[sid];
    if (sess.status === 'active' && sess.players && sess.players.some(p => p.userId === req.userId)) {
      return res.status(409).json({ success: false, error: 'Cannot change profile during an active game' });
    }
  }

  const { playername, avatarId } = req.body;

  if (playername !== undefined) {
    if (!PLAYERNAME_RE.test(playername)) {
      return res.status(400).json({ success: false, error: 'Playername must be 3-20 characters: letters, numbers, underscore only' });
    }
    for (const key of Object.keys(manifoldData)) {
      if (manifoldData[key].playername?.toLowerCase() === playername.toLowerCase() &&
        manifoldData[key].userId !== req.userId) {
        return res.status(409).json({ success: false, error: 'Playername already taken' });
      }
    }
    user.playername = playername.trim();
  }

  if (avatarId !== undefined) {
    user.avatarId = avatarId;
  }

  user.lastModified = Date.now();

  return res.json({ success: true, playername: user.playername, avatarId: user.avatarId });
});

// ── GET /api/players/search?q= ──────────────────────────────────────────────
router.get('/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
  }

  const results = [];
  for (const key of Object.keys(manifoldData)) {
    const u = manifoldData[key];
    if (!u.profileSetup) continue;
    if (u.status === 'banned') continue;
    if (u.username?.toLowerCase().includes(q) || u.playername?.toLowerCase().includes(q)) {
      results.push(sanitizePublicProfile(u));
    }
    if (results.length >= 20) break;
  }

  return res.json({ success: true, results });
});

// ── GET /api/players/:userId/profile ────────────────────────────────────────
router.get('/:userId/profile', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  if (isNaN(targetId)) return res.status(400).json({ success: false, error: 'Invalid user ID' });

  const user = getUserById(targetId);
  if (!user || user.status === 'banned') {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }

  return res.json({ success: true, profile: sanitizePublicProfile(user) });
});

// ── GET /api/players/online ──────────────────────────────────────────────────
// Returns IDs of users currently marked online (from WS heartbeat)
router.get('/online', requireAuth, (req, res) => {
  const online = [];
  for (const key of Object.keys(manifoldData)) {
    const u = manifoldData[key];
    if (u.online && u.profileSetup) {
      online.push({ userId: u.userId, playername: u.playername, avatarId: u.avatarId });
    }
  }
  return res.json({ success: true, online });
});

module.exports = router;
