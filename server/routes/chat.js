/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE: /api/chat
 * ═══════════════════════════════════════════════════════════════════════════
 * Guild-only chat is handled via WebSocket in lobby-server.js.
 * This REST route provides message history retrieval and rate-limiting state.
 *
 * Endpoints:
 *   GET  /api/chat/:guildId/history   — last 50 messages (guild members only)
 *   POST /api/chat/:guildId/send      — send a message (guild members only, not suspended)
 *
 * WebSocket chat is proxied through lobby-server.js (ws type: 'guild_chat').
 * Messages are stored in guildsData[guildId].chat (max 200 entries in memory).
 */

'use strict';

const express = require('express');
const router = express.Router();
const AuthHandler = require('../auth-handler');
const { manifoldData, guildsData } = require('../store');
const TetracubeClient = require('../tetracube-client');
const TETRACUBE_STRICT = typeof TetracubeClient.isStrict === 'function' && TetracubeClient.isStrict();

const authHandler = new AuthHandler();
const CHAT_HISTORY_LIMIT = 200;
const CHAT_DISPLAY_LIMIT = 50;
const MSG_MAX_LEN = 500;

function strictModuleUnavailable(res) {
  return res.status(503).json({
    success: false,
    error: 'Tetracube authoritative mode unavailable for chat writes',
    detail: 'chat module is not fully cut over to remote-authoritative transactions',
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

function isMemberSuspended(member) {
  if (!member.suspended) return false;
  if (member.suspendedUntil === Infinity) return true;
  return Date.now() < member.suspendedUntil;
}

function requireGuildMember(req, res, next) {
  const guild = guildsData[req.params.guildId];
  if (!guild) return res.status(404).json({ success: false, error: 'Guild not found' });

  const member = guild.members.find(m => m.userId === req.userId);
  if (!member) return res.status(403).json({ success: false, error: 'Guild members only' });

  req.guild = guild;
  req.member = member;
  next();
}

// ── GET /api/chat/:guildId/history ────────────────────────────────────────────
router.get('/:guildId/history', requireAuth, requireGuildMember, (req, res) => {
  const chat = req.guild.chat || [];
  const history = chat.slice(-CHAT_DISPLAY_LIMIT);
  return res.json({ success: true, messages: history });
});

// ── POST /api/chat/:guildId/send ──────────────────────────────────────────────
router.post('/:guildId/send', requireAuth, requireGuildMember, (req, res) => {
  if (TETRACUBE_STRICT) return strictModuleUnavailable(res);
  if (isMemberSuspended(req.member)) {
    return res.status(403).json({ success: false, error: 'Suspended members cannot chat' });
  }

  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Message cannot be empty' });
  }

  const user = getUserById(req.userId);
  const msg = {
    msgId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: req.userId,
    playername: user?.playername || user?.username || 'Unknown',
    avatarId: user?.avatarId || null,
    text: text.trim().slice(0, MSG_MAX_LEN),
    sentAt: Date.now(),
  };

  if (!req.guild.chat) req.guild.chat = [];
  req.guild.chat.push(msg);

  // Keep chat history trimmed
  if (req.guild.chat.length > CHAT_HISTORY_LIMIT) {
    req.guild.chat.splice(0, req.guild.chat.length - CHAT_HISTORY_LIMIT);
  }

  TetracubeClient.dualWriteChatMessage(req.guild.guildId, msg, {
    event: 'chat:message',
    actor: String(req.userId),
  }).catch((err) => {
    console.warn('[chat] tetracube dual-write failed:', err.message);
  });

  return res.json({ success: true, message: msg });
});

module.exports = router;
