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
const { PlayerDB } = require('../db');

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
  // Check SQLite first (authoritative), fall back to in-memory
  const dbTaken = PlayerDB.isNameTaken(name, -1);
  if (dbTaken) return res.json({ available: false });
  const memTaken = Object.keys(manifoldData).some(
    k => manifoldData[k].playername?.toLowerCase() === name.toLowerCase()
  );
  return res.json({ available: !memTaken });
});

// ── GET /api/players/me ──────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Merge authoritative SQLite data when available
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  const guild = dbPlayer ? PlayerDB.getPlayerGuild(dbPlayer.id) : null;
  const prefs = dbPlayer ? PlayerDB.getPrefs(dbPlayer.id) : {};

  return res.json({
    success: true,
    userId: user.userId,
    username: user.username,
    email: user.email,
    playername: (dbPlayer && dbPlayer.player_name) || user.playername || null,
    avatar: user.avatar,
    avatarId: (dbPlayer && dbPlayer.avatar_id) || user.avatarId || null,
    profileSetup: (dbPlayer ? dbPlayer.profile_setup === 1 : false) || user.profileSetup || false,
    tosAgreed: (dbPlayer ? dbPlayer.tos_agreed === 1 : false) || user.tosAgreed || false,
    tosAgreedAt: (dbPlayer && dbPlayer.tos_agreed_at) || user.tosAgreedAt || null,
    isAdmin: (dbPlayer ? dbPlayer.is_admin === 1 : false) || user.isAdmin || false,
    isSuperuser: (dbPlayer ? dbPlayer.is_superuser === 1 : false) || user.isSuperuser || false,
    adminLevel: user.adminLevel || 0,
    adminTosAgreed: user.adminTosAgreed || false,
    stats: user.stats || {},
    guildId: (guild && guild.id) || user.guildId || null,
    guildRole: (guild && guild.role) || user.guildRole || null,
    prefs,
  });
});

// ── POST /api/players/tos/agree ─────────────────────────────────────────────
router.post('/tos/agree', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const { tosType, version } = req.body; // tosType: 'general' | 'guild' | 'admin'
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

  // Persist general TOS to SQLite
  if (tosType === 'general') {
    try { PlayerDB.agreeTOS(req.userId, version || '1.0'); } catch { }
  }

  return res.json({ success: true, message: `${tosType} TOS recorded` });
});

// ── POST /api/players/setup ─────────────────────────────────────────────────
// First-login: playername + avatar (requires tosAgreed). Playername is PERMANENT.
router.post('/setup', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (!user.tosAgreed) {
    // Also check DB in case TOS was agreed in a previous session
    const dbPlayer = PlayerDB.getByKgUserId(req.userId);
    if (!dbPlayer || dbPlayer.tos_agreed !== 1) {
      return res.status(403).json({ success: false, error: 'Must agree to TOS before setup' });
    }
  }

  if (user.profileSetup) {
    return res.status(400).json({ success: false, error: 'Profile already set up' });
  }

  // Username IS the playername — use body value or fall back to the user's username
  const { avatarId } = req.body;
  const playername = (req.body.playername || user.username || '').trim();

  if (!playername || !PLAYERNAME_RE.test(playername)) {
    return res.status(400).json({ success: false, error: 'Username must be 3-20 characters: letters, numbers, underscore only' });
  }

  // Check uniqueness — DB first, then in-memory
  if (PlayerDB.isNameTaken(playername, req.userId)) {
    return res.status(409).json({ success: false, error: 'Playername already taken' });
  }
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

  // Persist to SQLite (playername is locked forever)
  try { PlayerDB.setupProfile(req.userId, playername.trim(), avatarId); } catch { }

  return res.json({
    success: true,
    message: 'Profile setup complete!',
    playername: user.playername,
    avatarId: user.avatarId,
  });
});

// ── POST /api/players/profile ───────────────────────────────────────────────
// Update avatar only — playername is PERMANENT and cannot be changed.
router.post('/profile', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Block changes while user is in an active game session
  const { sessionsData } = require('../store');
  for (const sid of Object.keys(sessionsData)) {
    const sess = sessionsData[sid];
    if (sess.status === 'active' && sess.players && sess.players.some(p => p.userId === req.userId)) {
      return res.status(409).json({ success: false, error: 'Cannot change profile during an active game' });
    }
  }

  const { avatarId } = req.body;

  if (avatarId !== undefined) {
    user.avatarId = avatarId;
    try { PlayerDB.updateAvatar(req.userId, avatarId); } catch { }
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

// ── GET /api/players/preferences ─────────────────────────────────────────────
router.get('/preferences', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });
  const prefs = PlayerDB.getPrefs(dbPlayer.id);
  return res.json({ success: true, prefs });
});

// ── POST /api/players/preferences ────────────────────────────────────────────
// Body: { key: string, value: string } or { prefs: { key: value, ... } }
router.post('/preferences', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });

  const ALLOWED_KEYS = new Set([
    'music_enabled', 'sound_enabled', 'chat_visible',
    'theme', 'lang', 'show_online_status', 'notifications_enabled',
  ]);

  const updates = req.body.prefs || (req.body.key ? { [req.body.key]: req.body.value } : {});
  const changed = {};
  for (const [k, v] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    PlayerDB.setPref(dbPlayer.id, k, v);
    changed[k] = v;
  }
  return res.json({ success: true, changed });
});

// ── GET /api/players/medallions ───────────────────────────────────────────────
router.get('/medallions', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });
  const medallions = PlayerDB.getMedallions(dbPlayer.id);
  return res.json({ success: true, medallions });
});

// ── GET /api/players/favorites ────────────────────────────────────────────────
router.get('/favorites', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });
  const favorites = PlayerDB.getFavorites(dbPlayer.id);
  return res.json({ success: true, favorites });
});

// ── POST /api/players/favorites/toggle ───────────────────────────────────────
// Body: { gameId: string }  — toggles favorite on/off, returns new state
router.post('/favorites/toggle', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });
  const { gameId } = req.body;
  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ success: false, error: 'gameId required' });
  }
  const added = PlayerDB.toggleFavorite(dbPlayer.id, gameId.slice(0, 64));
  return res.json({ success: true, gameId, favorited: added });
});

// ── GET /api/players/friends ──────────────────────────────────────────────────
router.get('/friends', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });
  const friends = PlayerDB.getFriends(dbPlayer.id);
  return res.json({ success: true, friends });
});

// ── POST /api/players/friends/add ─────────────────────────────────────────────
// Body: { playerName: string }  — adds mutual friendship
router.post('/friends/add', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });

  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ success: false, error: 'playerName required' });

  const target = PlayerDB.getByPlayerName(playerName);
  if (!target) return res.status(404).json({ success: false, error: 'Player not found' });
  if (target.id === dbPlayer.id) return res.status(400).json({ success: false, error: 'Cannot add yourself' });
  if (PlayerDB.isBlocked(target.id, dbPlayer.id)) {
    return res.status(403).json({ success: false, error: 'Cannot add this player' });
  }
  PlayerDB.addFriend(dbPlayer.id, target.id);
  return res.json({ success: true, message: `${target.player_name} added as friend` });
});

// ── POST /api/players/friends/remove ──────────────────────────────────────────
// Body: { playerName: string }
router.post('/friends/remove', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });

  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ success: false, error: 'playerName required' });

  const target = PlayerDB.getByPlayerName(playerName);
  if (!target) return res.status(404).json({ success: false, error: 'Player not found' });
  PlayerDB.removeFriend(dbPlayer.id, target.id);
  return res.json({ success: true });
});

// ── POST /api/players/blocks/add ──────────────────────────────────────────────
// Body: { playerName: string } — also removes mutual friendship
router.post('/blocks/add', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });

  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ success: false, error: 'playerName required' });

  const target = PlayerDB.getByPlayerName(playerName);
  if (!target) return res.status(404).json({ success: false, error: 'Player not found' });
  if (target.id === dbPlayer.id) return res.status(400).json({ success: false, error: 'Cannot block yourself' });

  PlayerDB.addBlock(dbPlayer.id, target.id);
  return res.json({ success: true, message: `${target.player_name} blocked` });
});

// ── POST /api/players/blocks/remove ───────────────────────────────────────────
// Body: { playerName: string } — 24h cooldown enforced
router.post('/blocks/remove', requireAuth, (req, res) => {
  const dbPlayer = PlayerDB.getByKgUserId(req.userId);
  if (!dbPlayer) return res.status(404).json({ success: false, error: 'Player not found' });

  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ success: false, error: 'playerName required' });

  const target = PlayerDB.getByPlayerName(playerName);
  if (!target) return res.status(404).json({ success: false, error: 'Player not found' });

  try {
    PlayerDB.removeBlock(dbPlayer.id, target.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
