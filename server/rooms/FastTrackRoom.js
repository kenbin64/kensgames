'use strict';

/**
 * FastTrackRoom — Colyseus 0.15 authoritative game room
 *
 * X-Dimensional model:
 *   X  = current turn owner (their userId is the identity / source of truth for this turn)
 *   Y  = game_action payload  (the manifold modifier sent by X)
 *   Z  = mutated Schema state (the bloom — only changed fields are sent as a binary patch)
 *   Z  → next X (turn advances, new identity becomes the authority)
 *
 * Colyseus Schema auto-diffs state on every mutation and sends ONLY the changed
 * bytes (the delta) to every connected client — nobody receives stale or
 * redundant data.  For a board game "viewport" = turn context (what changed
 * this round).  For spatial games the same pattern filters by frustum.
 *
 * Wire protocol (messages → server):
 *   { type: 'game_action', action: <string>, payload: <object> }
 *   { type: 'request_full_state' }   -- forces a full re-sync (reconnect)
 *   { type: 'chat', text: <string> }
 *
 * Wire protocol (server → clients):
 *   Colyseus Schema patch  — automatic, no explicit emit needed
 *   { type: 'turn_change', x: userId }
 *   { type: 'game_over',   result: <object> }
 *   { type: 'error',       message: <string> }
 *   { type: 'chat',        from: userId, text: <string> }
 */

const { Room } = require('colyseus');
const { Schema, MapSchema, defineTypes } = require('@colyseus/schema');
const crypto = require('crypto');

// ── Schema definitions (plain-JS, no decorators needed) ─────────────────────

/**
 * Each FastTrack game table (players, board, deck, turn, movement, safeZone, meta)
 * is stored as a MapSchema<string> so arbitrary keys can be set/deleted and
 * Colyseus will diff at the key level — only changed keys are transmitted.
 * Complex objects are JSON-serialised so the value stays a single string.
 */
class TableState extends Schema { }
defineTypes(TableState, {
  data: { map: 'string' },   // key → JSON string or primitive string
});

class FastTrackState extends Schema { }
defineTypes(FastTrackState, {
  // Turn-tracking  (these are top-level primitives — cheapest delta)
  currentTurnUserId: 'string',   // X: the identity that owns this turn
  turnNumber: 'int32',
  phase: 'string',   // 'waiting' | 'playing' | 'ended'
  seq: 'int32',    // monotonically increasing state revision
  instanceId: 'string',   // game instance UUID (survives reconnect)

  // Game tables — one MapSchema per table; keys match fasttrack-game-core.js
  players: { map: 'string' },
  board: { map: 'string' },
  deck: { map: 'string' },
  turn: { map: 'string' },
  movement: { map: 'string' },
  safeZone: { map: 'string' },
  meta: { map: 'string' },
});

const TABLE_NAMES = ['players', 'board', 'deck', 'turn', 'movement', 'safeZone', 'meta'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeTable(schemaMap, obj) {
  if (!obj || typeof obj !== 'object') return;
  // Remove keys no longer present
  for (const k of Array.from(schemaMap.keys())) {
    if (!(k in obj)) schemaMap.delete(k);
  }
  // Set/update keys that exist
  for (const [k, v] of Object.entries(obj)) {
    const encoded = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
    if (schemaMap.get(k) !== encoded) schemaMap.set(k, encoded);
  }
}

function readTable(schemaMap) {
  const out = {};
  for (const [k, v] of schemaMap.entries()) {
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}

// ── Room ─────────────────────────────────────────────────────────────────────

class FastTrackRoom extends Room {

  // Called when a game session is created (once per session).
  onCreate(options) {
    this.maxClients = options.maxPlayers || 6;
    this.sessionCode = options.sessionCode || null;
    this.lobbySessionId = options.lobbySessionId || null;

    const st = new FastTrackState();
    st.currentTurnUserId = '';
    st.turnNumber = 0;
    st.phase = 'waiting';
    st.seq = 0;
    st.instanceId = crypto.randomUUID();

    // Initialise each table as an empty MapSchema
    TABLE_NAMES.forEach(name => {
      st[name] = new MapSchema();
    });

    this.setState(st);

    // Player slot registry: clientSessionId → { userId, username, slot, isAI }
    this._players = new Map();   // clientSessionId → playerInfo
    this._userToClient = new Map();  // userId → clientSessionId (latest)
    this._turnOrder = [];        // ordered userId array for turn rotation
    this._prevSnapshots = {};    // table → prev plain object (for delta guard)

    // ── Message handlers ────────────────────────────────────────────────────

    /**
     * game_action: relay to all other clients immediately.
     * FastTrack game logic is client-authoritative — the server does NOT
     * enforce turn order or game rules.  It just relays the action so all
     * peers see the same events and can replay them locally.
     * X (the sender) is the authority for this action; peers are Y observers;
     * the resulting board state is Z, derived on each client independently.
     */
    this.onMessage('game_action', (client, msg) => {
      const info = this._players.get(client.sessionId);
      if (!info) return;

      const action = String((msg && msg.action) || '').trim();
      if (!action) return;

      this.state.seq += 1;

      // Relay to all OTHER clients — sender already applied it locally
      this.broadcast('game_action', {
        action,
        payload: (msg && msg.payload) || {},
        from: info.userId,
        seq: this.state.seq,
      }, { except: client });
    });

    /**
     * push_state: host pushes a full table snapshot.
     * Server writes it into Schema so Colyseus can diff and send only
     * changed keys to each subscriber.  Accepted from any connected client
     * (host authority is enforced client-side by FastTrack game core).
     */
    this.onMessage('push_state', (client, msg) => {
      const info = this._players.get(client.sessionId);
      if (!info) return;

      const snapshot = msg && msg.state;
      if (!snapshot || typeof snapshot !== 'object') return;

      this._writeSnapshot(snapshot);
      this.state.seq += 1;
    });

    /**
     * start_game: accepted for compatibility but the room is already active.
     * Phase tracking is omitted — game logic runs client-side.
     */
    this.onMessage('start_game', (client, msg) => {
      const info = this._players.get(client.sessionId);
      if (!info) return;

      const snapshot = msg && msg.initialState;
      if (snapshot) this._writeSnapshot(snapshot);

      this.state.phase = 'playing';
      this.state.seq += 1;

      this._buildTurnOrder();

      // First X = slot 0
      if (this._turnOrder.length > 0) {
        this.state.currentTurnUserId = this._turnOrder[0];
      }

      this.broadcast('turn_change', { x: this.state.currentTurnUserId, turnNumber: this.state.turnNumber });
    });

    /**
     * request_full_state: a reconnecting client requests a full re-sync.
     * We send the current Colyseus state — Colyseus handles this automatically
     * but this message lets the client signal readiness.
     */
    this.onMessage('request_full_state', (client) => {
      // Colyseus will send the full current state to this client on next tick
      // Just acknowledge so the client knows the room is alive
      client.send('full_state_ack', {
        seq: this.state.seq,
        instanceId: this.state.instanceId,
        phase: this.state.phase,
        currentTurnUserId: this.state.currentTurnUserId,
      });
    });

    /**
     * game_over: the turn owner (X) reports the game has ended.
     */
    this.onMessage('game_over', (client, msg) => {
      const info = this._players.get(client.sessionId);
      if (!info) return;
      if (this.state.phase === 'ended') return;
      this.state.phase = 'ended';
      this.state.seq += 1;
      this.broadcast('game_over', { result: (msg && msg.result) || null, from: info.userId });
      this.disconnect();
    });

    this.onMessage('chat', (client, msg) => {
      const info = this._players.get(client.sessionId);
      const text = String((msg && msg.text) || '').slice(0, 200);
      if (!text || !info) return;
      this.broadcast('chat', { from: info.userId, username: info.username, text });
    });
  }

  // Called when a client connects to this room.
  onJoin(client, options) {
    const userId = String((options && options.userId) || client.sessionId);
    const username = String((options && options.username) || 'Player').slice(0, 20);
    const avatarId = String((options && options.avatarId) || 'generic_shape');
    const slot = Number.isFinite(options && options.slot) ? options.slot : this._players.size;
    const isHost = !!(options && options.isHost);
    const isAI = !!(options && options.isAI);

    const info = { userId, username, avatarId, slot, isHost, isAI, clientSessionId: client.sessionId };
    this._players.set(client.sessionId, info);
    this._userToClient.set(userId, client.sessionId);

    // Immediately sync turn info to the joining client
    client.send('joined', {
      userId,
      instanceId: this.state.instanceId,
      seq: this.state.seq,
      phase: this.state.phase,
      currentTurnUserId: this.state.currentTurnUserId,
      turnNumber: this.state.turnNumber,
    });
  }

  // Called when a client disconnects.
  onLeave(client, consented) {
    const info = this._players.get(client.sessionId);
    if (!info) return;

    if (consented || this.state.phase !== 'playing') {
      this._players.delete(client.sessionId);
      this._userToClient.delete(info.userId);
      // Remove from turn order
      this._turnOrder = this._turnOrder.filter(uid => uid !== info.userId);
      // If it was their turn, advance
      if (this.state.currentTurnUserId === info.userId && this._turnOrder.length > 0) {
        this._advanceTurn();
      }
    }
    // If not consented and playing, keep the slot for reconnect (allowReconnection)
  }

  onDispose() {
    this._players.clear();
    this._userToClient.clear();
    this._turnOrder = [];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _err(client, code) {
    client.send('error', { message: code });
  }

  /**
   * Write a full snapshot (from game core's getStateSnapshot) into the
   * Colyseus MapSchema tables.  Schema will auto-diff vs previous state and
   * emit only the changed keys as a binary patch to each subscriber.
   */
  _writeSnapshot(snapshot) {
    for (const name of TABLE_NAMES) {
      if (snapshot[name] && typeof snapshot[name] === 'object') {
        writeTable(this.state[name], snapshot[name]);
      }
    }
  }

  /**
   * Apply an action from the turn owner (X + Y → Z).
   * For FastTrack, game logic runs on the host client — the host sends
   * a push_state after each action.  The room validates authorship and
   * advances the turn, ensuring Z becomes the next X.
   *
   * Extensible: add action-specific server-side logic here as needed.
   */
  _applyAction(client, info, action, payload) {
    // Legacy path — kept for any direct callers.
    // Game logic is client-authoritative; server just relays.
    this.state.seq += 1;
    this.broadcast('game_action', {
      action,
      payload,
      from: info.userId,
      seq: this.state.seq,
    }, { except: client });
    if (action === 'end_turn') {
      this._advanceTurn();
    }
  }

  /**
   * Build turn order from slot numbers (ascending).
   */
  _buildTurnOrder() {
    const sorted = Array.from(this._players.values())
      .filter(p => !p.isAI || true)   // include AI (host drives them)
      .sort((a, b) => a.slot - b.slot)
      .map(p => p.userId);
    this._turnOrder = sorted;
  }

  /**
   * Advance X to the next player in turn order.
   * Z (current state) becomes the seed — the new X observes it fresh.
   */
  _advanceTurn() {
    if (this._turnOrder.length === 0) return;

    const currentIdx = this._turnOrder.indexOf(this.state.currentTurnUserId);
    const nextIdx = (currentIdx + 1) % this._turnOrder.length;
    const nextUserId = this._turnOrder[nextIdx];

    this.state.currentTurnUserId = nextUserId;
    this.state.turnNumber += 1;
    this.state.seq += 1;

    // Broadcast turn change — the new X identity
    this.broadcast('turn_change', {
      x: nextUserId,
      turnNumber: this.state.turnNumber,
      seq: this.state.seq,
    });
  }
}

module.exports = { FastTrackRoom, FastTrackState };
