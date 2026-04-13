/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARFIGHTER MULTIPLAYER SERVER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WebSocket server for cooperative multiplayer Starfighter.
 * Handles: room creation, matchmaking, invite codes, game state sync,
 * individual scoring, 1-6 players per room.
 *
 * Port 8766 — nginx proxies wss://kensgames.com/sf-ws → here
 *
 * Protocol: JSON messages with { type, ... } structure
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const http = require('http');

const PORT = 8766;
const MAX_PLAYERS = 6;
const TICK_RATE = 20; // 20 Hz state broadcast
const TICK_MS = 1000 / TICK_RATE;

// ═══════════════════════════════════════════════════════════════════════════
// In-memory state
// ═══════════════════════════════════════════════════════════════════════════

const rooms = new Map();        // room_id → Room
const codeIndex = new Map();    // 6-char code → room_id
const connections = new Map();  // ws → Connection
const matchQueue = [];          // players waiting for matchmaking

// ═══════════════════════════════════════════════════════════════════════════
// Data structures
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Room {
 *   id, code, hostId, status: 'waiting'|'playing'|'finished',
 *   scenario: { waves, difficulty, friendlyFire },
 *   players: Map<playerId, Player>,
 *   entities: Map<entityId, EntityState>,
 *   wave, createdAt, lastActivity
 * }
 *
 * Player {
 *   id, callsign, ws, slot, score, kills, deaths, ready
 * }
 *
 * EntityState {
 *   id, type, ownerId, x, y, z, qx, qy, qz, qw, hull, shields, vx, vy, vz
 * }
 */

let nextEntityId = 1;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (codeIndex.has(code)) return generateCode();
  return code;
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(room, data, excludeWs) {
  for (const [, player] of room.players) {
    if (player.ws && player.ws !== excludeWs) {
      send(player.ws, data);
    }
  }
}

function roomSummary(room) {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    scenario: room.scenario,
    playerCount: room.players.size,
    maxPlayers: MAX_PLAYERS,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id, callsign: p.callsign, slot: p.slot,
      score: p.score, kills: p.kills, deaths: p.deaths, ready: p.ready
    }))
  };
}

function findRoomByPlayer(playerId) {
  for (const [, room] of rooms) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP health check + WebSocket server
// ═══════════════════════════════════════════════════════════════════════════

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      connections: connections.size,
      matchQueue: matchQueue.length
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server: httpServer });

// ═══════════════════════════════════════════════════════════════════════════
// Message handlers
// ═══════════════════════════════════════════════════════════════════════════

const handlers = {};

// ── Identity ──

handlers.join = (ws, data) => {
  const playerId = data.playerId || generateId();
  const callsign = (data.callsign || 'Pilot').substring(0, 20);

  connections.set(ws, { playerId, callsign });
  send(ws, { type: 'joined', playerId, callsign });
};

// ── Room Management ──

handlers.create_room = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not connected. Send join first.' });

  // Check if already in a room
  const existing = findRoomByPlayer(conn.playerId);
  if (existing) return send(ws, { type: 'error', message: 'Already in a room. Leave first.' });

  const roomId = generateId();
  const code = generateCode();
  const scenario = {
    waves: data.waves || 10,
    difficulty: data.difficulty || 'normal',
    friendlyFire: data.friendlyFire || false,
  };

  const room = {
    id: roomId,
    code,
    hostId: conn.playerId,
    status: 'waiting',
    scenario,
    players: new Map(),
    entities: new Map(),
    wave: 0,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  room.players.set(conn.playerId, {
    id: conn.playerId,
    callsign: conn.callsign,
    ws,
    slot: 1,
    score: 0,
    kills: 0,
    deaths: 0,
    ready: false,
  });

  rooms.set(roomId, room);
  codeIndex.set(code, roomId);

  send(ws, { type: 'room_created', room: roomSummary(room) });
};

handlers.join_room = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not connected. Send join first.' });

  const existing = findRoomByPlayer(conn.playerId);
  if (existing) return send(ws, { type: 'error', message: 'Already in a room.' });

  // Join by code or room ID
  let room;
  if (data.code) {
    const roomId = codeIndex.get(data.code.toUpperCase());
    room = roomId ? rooms.get(roomId) : null;
  } else if (data.roomId) {
    room = rooms.get(data.roomId);
  }

  if (!room) return send(ws, { type: 'error', message: 'Room not found.' });
  if (room.status !== 'waiting') return send(ws, { type: 'error', message: 'Game already in progress.' });
  if (room.players.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'Room is full.' });

  // Find next available slot
  const usedSlots = new Set(Array.from(room.players.values()).map(p => p.slot));
  let slot = 1;
  while (usedSlots.has(slot)) slot++;

  room.players.set(conn.playerId, {
    id: conn.playerId,
    callsign: conn.callsign,
    ws,
    slot,
    score: 0,
    kills: 0,
    deaths: 0,
    ready: false,
  });
  room.lastActivity = Date.now();

  // Notify everyone
  broadcastRoom(room, { type: 'player_joined', room: roomSummary(room) });
};

handlers.leave_room = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;
  _removePlayerFromRoom(conn.playerId);
};

function _removePlayerFromRoom(playerId) {
  const room = findRoomByPlayer(playerId);
  if (!room) return;

  room.players.delete(playerId);
  room.lastActivity = Date.now();

  if (room.players.size === 0) {
    // Room empty — clean up
    codeIndex.delete(room.code);
    rooms.delete(room.id);
    return;
  }

  // Transfer host if needed
  if (room.hostId === playerId) {
    const newHost = room.players.values().next().value;
    room.hostId = newHost.id;
  }

  broadcastRoom(room, { type: 'player_left', playerId, room: roomSummary(room) });
}

handlers.toggle_ready = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.status !== 'waiting') return;

  const player = room.players.get(conn.playerId);
  player.ready = !player.ready;

  broadcastRoom(room, { type: 'ready_update', room: roomSummary(room) });
};

handlers.update_scenario = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId || room.status !== 'waiting') return;

  if (data.waves != null) room.scenario.waves = Math.max(1, Math.min(20, data.waves));
  if (data.difficulty != null) room.scenario.difficulty = ['easy', 'normal', 'hard'].includes(data.difficulty) ? data.difficulty : 'normal';
  if (data.friendlyFire != null) room.scenario.friendlyFire = !!data.friendlyFire;

  broadcastRoom(room, { type: 'scenario_update', room: roomSummary(room) });
};

// ── Matchmaking ──

handlers.matchmake = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return send(ws, { type: 'error', message: 'Not connected.' });

  const existing = findRoomByPlayer(conn.playerId);
  if (existing) return send(ws, { type: 'error', message: 'Already in a room.' });

  // Check if there's a waiting room with space
  for (const [, room] of rooms) {
    if (room.status === 'waiting' && room.players.size < MAX_PLAYERS) {
      // Join this room
      const usedSlots = new Set(Array.from(room.players.values()).map(p => p.slot));
      let slot = 1;
      while (usedSlots.has(slot)) slot++;

      room.players.set(conn.playerId, {
        id: conn.playerId,
        callsign: conn.callsign,
        ws,
        slot,
        score: 0,
        kills: 0,
        deaths: 0,
        ready: false,
      });
      room.lastActivity = Date.now();

      broadcastRoom(room, { type: 'player_joined', room: roomSummary(room) });
      return;
    }
  }

  // No room available — create one
  handlers.create_room(ws, {});
  send(ws, { type: 'matchmake_created' }); // Let client know it created a new room
};

// ── List rooms ──

handlers.list_rooms = (ws) => {
  const available = [];
  for (const [, room] of rooms) {
    if (room.status === 'waiting' && room.players.size < MAX_PLAYERS) {
      available.push(roomSummary(room));
    }
  }
  send(ws, { type: 'room_list', rooms: available });
};

// ── Game Start ──

handlers.start_game = (ws) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId) return send(ws, { type: 'error', message: 'Only host can start.' });
  if (room.status !== 'waiting') return send(ws, { type: 'error', message: 'Game already started.' });

  // All players must be ready (or just the host in solo)
  if (room.players.size > 1) {
    for (const [, p] of room.players) {
      if (p.id !== room.hostId && !p.ready) {
        return send(ws, { type: 'error', message: 'Not all players are ready.' });
      }
    }
  }

  room.status = 'playing';
  room.wave = 1;
  room.lastActivity = Date.now();

  // Assign player slots and spawn positions
  const spawnData = [];
  let slotIdx = 0;
  for (const [, player] of room.players) {
    const angle = (Math.PI * 2 / room.players.size) * slotIdx;
    spawnData.push({
      playerId: player.id,
      callsign: player.callsign,
      slot: player.slot,
      spawnX: Math.cos(angle) * 100,
      spawnY: 0,
      spawnZ: Math.sin(angle) * 100,
    });
    slotIdx++;
  }

  broadcastRoom(room, {
    type: 'game_start',
    room: roomSummary(room),
    spawnData,
    scenario: room.scenario,
  });
};

// ── In-Game State Sync ──

handlers.player_state = (ws, data) => {
  // Player sends their position/rotation/velocity each frame
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.status !== 'playing') return;

  // Relay to all other players
  broadcastRoom(room, {
    type: 'player_state',
    playerId: conn.playerId,
    x: data.x, y: data.y, z: data.z,
    qx: data.qx, qy: data.qy, qz: data.qz, qw: data.qw,
    vx: data.vx, vy: data.vy, vz: data.vz,
    hull: data.hull, shields: data.shields, fuel: data.fuel,
  }, ws);
};

handlers.entity_spawn = (ws, data) => {
  // Host spawns an entity (enemy, wingman, etc.) — broadcast to all
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId) return; // only host spawns

  const entityId = `e_${nextEntityId++}`;
  const entity = {
    id: entityId,
    type: data.entityType,
    ownerId: conn.playerId,
    x: data.x, y: data.y, z: data.z,
    hull: data.hull || 100,
  };
  room.entities.set(entityId, entity);

  broadcastRoom(room, {
    type: 'entity_spawn',
    entity,
  });
};

handlers.entity_state = (ws, data) => {
  // Host broadcasts entity position updates
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId) return;

  // Batch update — data.entities is an array of { id, x, y, z, qx, qy, qz, qw, hull }
  if (!Array.isArray(data.entities)) return;

  broadcastRoom(room, {
    type: 'entity_state',
    entities: data.entities,
  }, ws);
};

handlers.fire = (ws, data) => {
  // Player fires weapon — broadcast to all for visual
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.status !== 'playing') return;

  broadcastRoom(room, {
    type: 'fire',
    playerId: conn.playerId,
    weapon: data.weapon || 'laser', // 'laser' | 'torpedo'
    x: data.x, y: data.y, z: data.z,
    dx: data.dx, dy: data.dy, dz: data.dz,
  }, ws);
};

handlers.hit = (ws, data) => {
  // Host reports entity hit (damage + potential kill)
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId) return;

  broadcastRoom(room, {
    type: 'hit',
    entityId: data.entityId,
    damage: data.damage,
    killedBy: data.killedBy, // playerId who scored the kill
    destroyed: data.destroyed || false,
  });

  // Update scoring
  if (data.destroyed && data.killedBy) {
    const killer = room.players.get(data.killedBy);
    if (killer) {
      const points = { enemy: 100, interceptor: 250, bomber: 300, predator: 500, dreadnought: 2500, 'alien-baseship': 1000, 'alien-base': 5000 };
      killer.score += points[data.entityType] || 100;
      killer.kills++;

      broadcastRoom(room, {
        type: 'score_update',
        playerId: data.killedBy,
        callsign: killer.callsign,
        score: killer.score,
        kills: killer.kills,
        scoreboard: Array.from(room.players.values()).map(p => ({
          id: p.id, callsign: p.callsign, score: p.score, kills: p.kills, deaths: p.deaths
        }))
      });
    }
  }

  // Check victory condition
  if (data.destroyed && data.entityType === 'alien-base') {
    room.status = 'finished';
    broadcastRoom(room, {
      type: 'game_over',
      result: 'victory',
      message: 'VICTORY — Alien Hive Destroyed!',
      scoreboard: Array.from(room.players.values()).map(p => ({
        id: p.id, callsign: p.callsign, score: p.score, kills: p.kills, deaths: p.deaths
      }))
    });
  }
};

handlers.player_death = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.status !== 'playing') return;

  const player = room.players.get(conn.playerId);
  if (player) player.deaths++;

  broadcastRoom(room, {
    type: 'player_death',
    playerId: conn.playerId,
    callsign: player ? player.callsign : 'Unknown',
    livesRemaining: data.livesRemaining || 0,
  });

  // Check if all players are dead (team wipe)
  if (data.livesRemaining <= 0) {
    const allDead = Array.from(room.players.values()).every(p => {
      // We'd need to track lives server-side for accuracy, but this is broadcast-driven
      return true; // simplified — actual check happens client-side via sync
    });
  }
};

handlers.player_respawn = (ws, data) => {
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.status !== 'playing') return;

  broadcastRoom(room, {
    type: 'player_respawn',
    playerId: conn.playerId,
    x: data.x, y: data.y, z: data.z,
  }, ws);
};

handlers.wave_change = (ws, data) => {
  // Host broadcasts wave transitions
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId) return;

  room.wave = data.wave;
  broadcastRoom(room, {
    type: 'wave_change',
    wave: data.wave,
    phase: data.phase, // 'combat', 'land-approach', etc.
  });
};

handlers.game_over = (ws, data) => {
  // Host declares game over (defeat)
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.hostId !== conn.playerId) return;

  room.status = 'finished';
  broadcastRoom(room, {
    type: 'game_over',
    result: data.result || 'defeat',
    message: data.message || 'DEFEAT',
    scoreboard: Array.from(room.players.values()).map(p => ({
      id: p.id, callsign: p.callsign, score: p.score, kills: p.kills, deaths: p.deaths
    }))
  });
};

handlers.comm = (ws, data) => {
  // Relay comm messages (CIC chatter) to all players
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room || room.status !== 'playing') return;

  broadcastRoom(room, {
    type: 'comm',
    sender: data.sender,
    message: data.message,
    commType: data.commType, // 'base', 'ally', 'warning', 'info'
  }, ws);
};

handlers.chat = (ws, data) => {
  // Player-to-player chat during lobby or game
  const conn = connections.get(ws);
  if (!conn) return;

  const room = findRoomByPlayer(conn.playerId);
  if (!room) return;

  const message = (data.message || '').substring(0, 200);
  if (!message) return;

  broadcastRoom(room, {
    type: 'chat',
    playerId: conn.playerId,
    callsign: conn.callsign,
    message,
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// Connection handling
// ═══════════════════════════════════════════════════════════════════════════

wss.on('connection', (ws) => {
  console.log(`[SF] New connection (total: ${wss.clients.size})`);

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      send(ws, { type: 'error', message: 'Invalid message format' });
      return;
    }

    const handler = handlers[data.type];
    if (handler) {
      try {
        handler(ws, data);
      } catch (err) {
        console.error(`[SF] Handler error for ${data.type}:`, err);
        send(ws, { type: 'error', message: 'Server error' });
      }
    } else {
      console.warn(`[SF] Unknown message type: ${data.type}`);
    }
  });

  ws.on('close', () => {
    const conn = connections.get(ws);
    if (conn) {
      // Remove from matchQueue
      const qIdx = matchQueue.findIndex(q => q.ws === ws);
      if (qIdx >= 0) matchQueue.splice(qIdx, 1);

      // Remove from room
      _removePlayerFromRoom(conn.playerId);
      connections.delete(ws);
    }
    console.log(`[SF] Disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[SF] WebSocket error:', err.message);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup: stale rooms every 5 minutes
// ═══════════════════════════════════════════════════════════════════════════

setInterval(() => {
  const staleThreshold = Date.now() - (30 * 60 * 1000);
  for (const [id, room] of rooms) {
    if (room.lastActivity < staleThreshold) {
      codeIndex.delete(room.code);
      rooms.delete(id);
      console.log(`[SF] Cleaned up stale room ${id}`);
    }
  }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════════════════

httpServer.listen(PORT, () => {
  console.log(`═══════════════════════════════════════════════`);
  console.log(`  Starfighter Multiplayer Server`);
  console.log(`  HTTP health: http://0.0.0.0:${PORT}/health`);
  console.log(`  WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`  nginx proxies wss://kensgames.com/sf-ws → here`);
  console.log(`═══════════════════════════════════════════════`);
});
