/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE: /api/leaderboards
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints:
 *   GET  /api/leaderboards/:gameId    — top 100 scores for a game ('global' for all)
 *   POST /api/leaderboards/:gameId    — record a score (game server use, requires auth)
 *   GET  /api/leaderboards/:gameId/me — current user's rank + score
 */

'use strict';

const express = require('express');
const router = express.Router();
const AuthHandler = require('../auth-handler');
const { manifoldData, leaderboardData } = require('../store');
const TetracubeClient = require('../tetracube-client');
const TETRACUBE_STRICT = typeof TetracubeClient.isStrict === 'function' && TetracubeClient.isStrict();

const authHandler = new AuthHandler();

const VALID_GAMES = ['fasttrack', 'brickbreaker3d', '4dtictactoe', 'starfighter', 'assemble', 'global'];
const MAX_ENTRIES = 100;

function strictModuleUnavailable(res) {
  return res.status(503).json({
    success: false,
    error: 'Tetracube authoritative mode unavailable for leaderboard writes',
    detail: 'leaderboards module is not fully cut over to remote-authoritative transactions',
    strict: true,
  });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  req.userId = decoded.userId;
  next();
}

function getUserById(userId) {
  for (const k of Object.keys(manifoldData)) {
    if (manifoldData[k].userId === userId) return manifoldData[k];
  }
  return null;
}

function getBoard(gameId) {
  if (!leaderboardData[gameId]) leaderboardData[gameId] = [];
  return leaderboardData[gameId];
}

// ── GET /api/leaderboards/:gameId ─────────────────────────────────────────────
router.get('/:gameId', requireAuth, (req, res) => {
  const gameId = req.params.gameId.toLowerCase();
  if (!VALID_GAMES.includes(gameId)) {
    return res.status(400).json({ success: false, error: `Unknown game. Valid: ${VALID_GAMES.join(', ')}` });
  }

  let entries;
  if (gameId === 'global') {
    // Merge all game boards, keep top 100 by score
    const all = VALID_GAMES
      .filter(g => g !== 'global')
      .flatMap(g => (leaderboardData[g] || []).map(e => ({ ...e, game: g })));
    all.sort((a, b) => b.score - a.score);
    entries = all.slice(0, MAX_ENTRIES);
  } else {
    entries = [...getBoard(gameId)].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
  }

  const ranked = entries.map((e, i) => ({
    rank: i + 1,
    userId: e.userId,
    playername: e.playername,
    avatarId: e.avatarId || null,
    score: e.score,
    recordedAt: e.recordedAt,
    game: e.game || gameId,
  }));

  return res.json({ success: true, gameId, leaderboard: ranked });
});

// ── GET /api/leaderboards/:gameId/me ─────────────────────────────────────────
router.get('/:gameId/me', requireAuth, (req, res) => {
  const gameId = req.params.gameId.toLowerCase();
  if (!VALID_GAMES.includes(gameId) || gameId === 'global') {
    return res.status(400).json({ success: false, error: 'Invalid gameId for personal rank' });
  }

  const board = [...getBoard(gameId)].sort((a, b) => b.score - a.score);
  const myEntry = board.find(e => e.userId === req.userId);
  const myRank = myEntry ? board.indexOf(myEntry) + 1 : null;

  return res.json({ success: true, gameId, rank: myRank, entry: myEntry || null });
});

// ── POST /api/leaderboards/:gameId ────────────────────────────────────────────
// Called by game servers to record scores
router.post('/:gameId', requireAuth, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  const gameId = req.params.gameId.toLowerCase();
  if (!VALID_GAMES.includes(gameId) || gameId === 'global') {
    return res.status(400).json({ success: false, error: 'Invalid gameId' });
  }

  const { score } = req.body;
  if (typeof score !== 'number' || !isFinite(score) || score < 0) {
    return res.status(400).json({ success: false, error: 'score must be a non-negative number' });
  }

  const user = getUserById(req.userId);
  if (!user || !user.profileSetup) {
    return res.status(403).json({ success: false, error: 'Profile setup required to record scores' });
  }

  const board = getBoard(gameId);
  const existing = board.find(e => e.userId === req.userId);

  if (existing) {
    if (score > existing.score) {
      existing.score = score;
      existing.recordedAt = Date.now();
    }
  } else {
    board.push({
      userId: req.userId,
      playername: user.playername,
      avatarId: user.avatarId || null,
      score,
      recordedAt: Date.now(),
    });
  }

  // Keep board trimmed to top 500 per game
  board.sort((a, b) => b.score - a.score);
  if (board.length > 500) board.splice(500);

  // Update user stats
  if (!user.stats) user.stats = {};
  user.stats.gamesPlayed = (user.stats.gamesPlayed || 0) + 1;
  if (!user.stats.scores) user.stats.scores = {};
  if (!user.stats.scores[gameId] || score > user.stats.scores[gameId]) {
    user.stats.scores[gameId] = score;
  }

  TetracubeClient.dualWriteLeaderboard(gameId, board, {
    event: 'leaderboard:score-recorded',
    actor: String(req.userId),
  }).catch((err) => {
    console.warn('[leaderboards] tetracube dual-write failed:', err.message);
  });

  return res.json({ success: true, recorded: true });
});

module.exports = router;
