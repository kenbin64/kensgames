/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE: /api/tournaments
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints:
 *   GET  /api/tournaments                — list all tournaments
 *   GET  /api/tournaments/:id            — get tournament details + results
 *   POST /api/tournaments                — superuser: create tournament announcement
 *   PUT  /api/tournaments/:id            — superuser: update / post results
 *   DELETE /api/tournaments/:id          — superuser: remove
 *
 * GET endpoints are public (auth required for consistency).
 * Write endpoints require adminLevel >= 2 or isSuperuser.
 */

'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const AuthHandler = require('../auth-handler');
const { manifoldData, tournamentsData } = require('../store');

const authHandler = new AuthHandler();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  req.userId = decoded.userId;
  next();
}

function requireAdmin(req, res, next) {
  const user = getUserById(req.userId);
  if (!user || (!user.isAdmin && !user.isSuperuser)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

function getUserById(userId) {
  for (const k of Object.keys(manifoldData)) {
    if (manifoldData[k].userId === userId) return manifoldData[k];
  }
  return null;
}

// ── GET /api/tournaments ──────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  // Sort: live first, then upcoming, then completed
  const sorted = [...tournamentsData].sort((a, b) => {
    const order = { live: 0, upcoming: 1, completed: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.startDate - b.startDate;
  });
  return res.json({ success: true, tournaments: sorted });
});

// ── GET /api/tournaments/:id ──────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const t = tournamentsData.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Tournament not found' });
  return res.json({ success: true, tournament: t });
});

// ── POST /api/tournaments ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, gameId, description, startDate, endDate, prizeInfo, guildOnly } = req.body;

  if (!title || !gameId || !startDate) {
    return res.status(400).json({ success: false, error: 'title, gameId, and startDate are required' });
  }

  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : null;

  if (isNaN(start)) return res.status(400).json({ success: false, error: 'Invalid startDate' });

  const tournament = {
    id: `t-${now}-${crypto.randomBytes(3).toString('hex')}`,
    title: title.trim().slice(0, 100),
    gameId,
    description: (description || '').slice(0, 2000),
    startDate: start,
    endDate: end,
    prizeInfo: (prizeInfo || '').slice(0, 500),
    guildOnly: !!guildOnly,
    status: start > now ? 'upcoming' : 'live',
    results: [],   // [{ rank, playername, avatarId, score, guildName? }]
    createdBy: req.userId,
    createdAt: now,
    updatedAt: now,
  };

  tournamentsData.push(tournament);

  return res.status(201).json({ success: true, tournament });
});

// ── PUT /api/tournaments/:id ──────────────────────────────────────────────────
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const t = tournamentsData.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Tournament not found' });

  const allowed = ['title', 'description', 'startDate', 'endDate', 'prizeInfo', 'status', 'results', 'guildOnly'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'startDate' || key === 'endDate') {
        const ts = new Date(req.body[key]).getTime();
        if (!isNaN(ts)) t[key] = ts;
      } else {
        t[key] = req.body[key];
      }
    }
  }
  t.updatedAt = Date.now();

  return res.json({ success: true, tournament: t });
});

// ── DELETE /api/tournaments/:id ───────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const idx = tournamentsData.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Tournament not found' });
  tournamentsData.splice(idx, 1);
  return res.json({ success: true });
});

module.exports = router;
