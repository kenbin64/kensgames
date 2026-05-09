'use strict';

/**
 * colyseus-server.js
 *
 * Colyseus game server — runs on port 2567 (default).
 * The lobby (lobby-server.js, port 8765, raw WebSocket via crossws) handles
 * auth + matchmaking. When a game starts, it creates a Colyseus room and
 * hands the roomId back to the game page, which then connects here for live
 * delta-patched state sync.
 *
 * nginx proxy:
 *   wss://kensgames.com/colyseus → ws://127.0.0.1:2567
 */

const http = require('http');
const { Server } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const express = require('express');

const { FastTrackRoom } = require('./rooms/FastTrackRoom');

const PORT = parseInt(process.env.COLYSEUS_PORT || '2567', 10);

const app = express();

// ── Colyseus monitor (optional — install @colyseus/monitor to enable) ───────
try {
  const { monitor } = require('@colyseus/monitor');
  if (process.env.NODE_ENV !== 'production') {
    app.use('/monitor', monitor());
  }
} catch { /* not installed, skip */ }

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, port: PORT, ts: Date.now() }));

// ── HTTP server + Colyseus transport ─────────────────────────────────────────
const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

// ── Room registry ─────────────────────────────────────────────────────────────
gameServer.define('fasttrack', FastTrackRoom, {
  // options available at room create-time
});

// Future rooms:
// gameServer.define('starfighter', StarfighterRoom);
// gameServer.define('brickbreaker3d', BrickBreakerRoom);

// ── Listen ────────────────────────────────────────────────────────────────────
gameServer.listen(PORT).then(() => {
  console.log(`[Colyseus] fasttrack room registered on port ${PORT}`);
  console.log(`[Colyseus] ws://127.0.0.1:${PORT}`);
}).catch((err) => {
  console.error('[Colyseus] Failed to start:', err);
  process.exit(1);
});

module.exports = { gameServer };
