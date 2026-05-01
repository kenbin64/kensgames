/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLAYER MANAGER  —  server/player-manager.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Central authority for every active game session.  The server is ONE shared
 * game object + ONE player roster; broadcasts propagate the same state to all
 * participants simultaneously.  This module enforces that invariant.
 *
 * Responsibilities:
 *  1. Player inventory — verify manifest matches board before first turn.
 *  2. Connection verification — retry 3× before cancelling.
 *  3. Turn relay with acknowledgement tracking — every human must confirm
 *     receipt; if any fail within ACK_TIMEOUT_MS a heal attempt is made.
 *  4. Heal / restore — resend lastGoodState on first failure, cancel on second.
 *  5. Bot management — manage AI slots, generate bot moves on cue.
 *  6. Game disable — auto-disable after 3 consecutive failures; admin can re-enable.
 *  7. Error logging — append-only log in state/player-manager.log.
 *
 * Axiom: z = x·y — game state is derived from identity × session; nothing is
 * stored independently, everything is recomputed or resynced from lastGoodState.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── Constants (overridable via constructor opts for testing) ─────────────────
const DEFAULTS = {
  connectRetryDelay: 500,   // ms between connection-verification retries
  connectMaxRetries: 3,     // cancel after this many failed attempts
  ackTimeout: 5000,  // ms for all humans to ack a turn broadcast
  healTimeout: 8000,  // ms to wait during heal before cancelling
  autoDisableAfter: 3,     // consecutive cancel-per-game count before auto-disable
  recentWindowMs: 5 * 60 * 1000,  // window for "recent" cancel counting
};

const LOG_DIR = path.join(__dirname, '..', 'state');
const LOG_FILE = path.join(LOG_DIR, 'player-manager.log');

// ── Append-only structured log ───────────────────────────────────────────────
function writeLog(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (_) { /* best-effort; never crash the server */ }
  const prefix = entry.level === 'error' ? '[PM ERROR]'
    : entry.level === 'warn' ? '[PM WARN ]'
      : '[PM      ]';
  console.error(`${prefix} ${String(entry.event || '').padEnd(22)} `
    + `session=${String(entry.sessionId || '-').slice(0, 12).padEnd(12)} `
    + (entry.message || ''));
}

// ── Managed-session factory ──────────────────────────────────────────────────
function makeManagedSession(session) {
  const humanPlayers = (session.players || []).filter(p => !p.is_ai);
  const bots = (session.players || []).filter(p => p.is_ai);
  return {
    sessionId: session.session_id,
    gameId: session.game_id,
    gameUuid: session.game_uuid || null,
    players: [...(session.players || [])],
    humanPlayers,
    bots,
    connectionMap: new Map(),   // userId → WebSocket
    declaredGameByUser: new Map(), // userId -> game_uuid observed from that client instance
    botSnapshots: new Map(), // botUserId -> last known state for that bot seat
    status: 'setup',    // 'setup'|'verifying'|'active'|'healing'|'cancelled'|'disabled'
    connectRetries: 0,
    lastGoodState: null,        // snapshot of last confirmed broadcast
    turnSeq: 0,           // monotonic counter
    pendingAcks: new Map(),   // seq → { envelope, required: Set<userId>, acked: Set<userId> }
    ackTimers: new Map(),   // seq → Timeout
    errorLog: [],          // { ts, event, detail } — last-N errors for the session
    cancelledAt: null,
  };
}

// ── PlayerManager ────────────────────────────────────────────────────────────
class PlayerManager {
  /**
   * @param {Map}      connections     shared Map<ws, conn> from lobby-server
   * @param {Map}      liveSessions    shared Map<sessionId, session>
   * @param {Function} sendFn          send(ws, data)
   * @param {Function} broadcastFn     broadcastSession(session, data)
   * @param {object}   [opts]          timing overrides (for tests)
   */
  constructor(connections, liveSessions, sendFn, broadcastFn, opts) {
    this._connections = connections;
    this._liveSessions = liveSessions;
    this._send = sendFn;
    this._broadcast = broadcastFn;
    this._cfg = Object.assign({}, DEFAULTS, opts || {});

    /** Map<sessionId, ManagedSession> */
    this._managed = new Map();

    /** Map<gameId, { disabled, reason, disabledAt, cancelCount }> */
    this._disabledGames = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Called by lobby-server immediately after `start_game` is accepted.
   * Builds the managed session, verifies all human player sockets are live,
   * takes player inventory, then broadcasts `pm_game_ready` — or cancels.
   */
  startSession(sessionId) {
    const session = this._liveSessions.get(sessionId);
    if (!session) return;

    if (this.isGameDisabled(session.game_id)) {
      const info = this._disabledGames.get(session.game_id);
      this._cancelAndBroadcast(sessionId,
        `'${session.game_id}' is temporarily disabled: ${(info || {}).reason || ''}`);
      return;
    }

    const ms = makeManagedSession(session);
    this._managed.set(sessionId, ms);
    ms.status = 'verifying';

    writeLog({
      event: 'session_start',
      sessionId,
      gameId: session.game_id,
      players: ms.players.map(p => ({ id: p.user_id, name: p.username, isAI: p.is_ai })),
    });

    this._verifyConnections(sessionId, 0);
  }

  /**
   * Called when a human player reconnects (from guest_login resume path).
   * Updates the connection map for any managed session they belong to.
   */
  registerConnection(userId, ws) {
    for (const ms of this._managed.values()) {
      if (ms.status === 'cancelled' || ms.status === 'disabled') continue;
      if (ms.humanPlayers.some(p => p.user_id === userId)) {
        ms.connectionMap.set(userId, ws);
        writeLog({ event: 'player_reconnect', sessionId: ms.sessionId, userId });

        // If we were healing and this was the blocking player, resume
        if (ms.status === 'healing') {
          const allBack = ms.humanPlayers.every(p => ms.connectionMap.has(p.user_id));
          if (allBack) {
            ms.status = 'active';
            writeLog({ event: 'heal_success_reconnect', sessionId: ms.sessionId });
            // Re-broadcast last good state so the reconnected player catches up
            const session = this._liveSessions.get(ms.sessionId);
            if (session && ms.lastGoodState) {
              this._broadcast(session, Object.assign({}, ms.lastGoodState, { type: 'pm_resync' }));
            }
          }
        }
      }
    }
  }

  /**
   * Relay a game_action through the PM.  Adds `_pm_seq` so clients can ack.
   * Returns the assigned seq number (> 0), or 0 if the session is not PM-managed.
   *
   * @param {string} sessionId
   * @param {string} actingUserId
   * @param {object} turnData  — already has `type` and `from` set by lobby-server
   * @returns {number}
   */
  relayTurn(sessionId, actingUserId, turnData) {
    const ms = this._managed.get(sessionId);
    if (!ms || ms.status !== 'active') return 0;

    const session = this._liveSessions.get(sessionId);
    if (!session) return 0;

    ms.turnSeq++;
    const seq = ms.turnSeq;

    const envelope = Object.assign({}, turnData, {
      _pm_seq: seq,
      _pm_session: sessionId,
      _pm_game_uuid: ms.gameUuid,
      from: actingUserId,
    });

    // Every human must ack within ACK_TIMEOUT_MS
    const required = new Set(ms.humanPlayers.map(p => p.user_id));
    ms.pendingAcks.set(seq, {
      envelope,
      required,
      acked: new Set(),
      deadline: Date.now() + this._cfg.ackTimeout,
    });

    this._broadcast(session, envelope);

    // Snapshot as "last good" optimistically; game_state messages will refine this
    ms.lastGoodState = envelope;
    this._syncBotsFromState(sessionId, envelope, 'turn_delta');

    const timer = setTimeout(
      () => this._onAckTimeout(sessionId, seq),
      this._cfg.ackTimeout,
    );
    if (timer.unref) timer.unref();
    ms.ackTimers.set(seq, timer);

    return seq;
  }

  /**
   * Record a turn acknowledgement from a human player.
   * Called by `handlers.game_action_ack` in lobby-server.
   */
  acknowledgeTurn(sessionId, seq, userId, gameUuid) {
    const ms = this._managed.get(sessionId);
    if (!ms) return;

    if (gameUuid) {
      ms.declaredGameByUser.set(userId, String(gameUuid));
      if (ms.gameUuid && String(gameUuid) !== String(ms.gameUuid)) {
        writeLog({
          level: 'error',
          event: 'game_uuid_mismatch',
          sessionId,
          userId,
          message: `client=${String(gameUuid)} expected=${String(ms.gameUuid)}`,
        });
        this.replacePlayerWithBot(sessionId, userId, 'game_uuid_mismatch');
        return;
      }
    }

    const pending = ms.pendingAcks.get(seq);
    if (!pending) return;

    pending.acked.add(userId);

    if (this._allAcked(pending)) {
      clearTimeout(ms.ackTimers.get(seq));
      ms.ackTimers.delete(seq);
      ms.pendingAcks.delete(seq);
    }
  }

  /**
   * Update the last-known-good state snapshot.
   * Called when lobby-server receives an authoritative `game_state` message.
   */
  updateGoodState(sessionId, stateData) {
    const ms = this._managed.get(sessionId);
    if (ms) {
      ms.lastGoodState = stateData;
      this._syncBotsFromState(sessionId, stateData, 'authoritative_state');
    }
  }

  /**
   * Called on WebSocket close for a player who was in a managed session.
   */
  onPlayerDisconnect(userId, sessionId) {
    const ms = this._managed.get(sessionId);
    if (!ms) return;

    ms.connectionMap.delete(userId);
    writeLog({ level: 'warn', event: 'player_disconnect', sessionId, userId });

    if (ms.status !== 'active') return false;

    // Remove disconnected player from all pending ack requirements
    // (they left the game; we can't wait for them)
    for (const [seq, pending] of ms.pendingAcks) {
      if (pending.required.has(userId)) {
        pending.required.delete(userId);
        if (this._allAcked(pending)) {
          clearTimeout(ms.ackTimers.get(seq));
          ms.ackTimers.delete(seq);
          ms.pendingAcks.delete(seq);
        }
      }
    }

    // During active play, a missing human is replaced by a bot immediately.
    return this.replacePlayerWithBot(sessionId, userId, 'connection_lost');
  }

  /**
   * Replace a missing/leaving human with a bot that inherits their seat/state.
   * Broadcasts the replacement to every player.
   */
  replacePlayerWithBot(sessionId, userId, reason) {
    const ms = this._managed.get(sessionId);
    const session = this._liveSessions.get(sessionId);
    if (!ms || !session) return false;

    const idx = ms.players.findIndex(p => p && !p.is_ai && p.user_id === userId);
    if (idx < 0) return false;

    const oldPlayer = ms.players[idx];
    const bot = this._buildReplacementBot(oldPlayer, reason);
    bot.slot = oldPlayer.slot;

    ms.players[idx] = bot;
    ms.humanPlayers = ms.players.filter(p => !p.is_ai);
    ms.bots = ms.players.filter(p => p.is_ai);
    ms.connectionMap.delete(userId);
    ms.declaredGameByUser.delete(userId);

    // Reflect replacement in live session cache.
    session.players = ms.players;

    // Keep pending acks consistent (bot does not ack).
    for (const pending of ms.pendingAcks.values()) {
      pending.required.delete(userId);
      pending.acked.delete(userId);
    }

    if (ms.lastGoodState) {
      ms.botSnapshots.set(bot.user_id, ms.lastGoodState);
    }

    writeLog({
      level: 'warn',
      event: 'player_replaced_with_bot',
      sessionId,
      userId,
      botId: bot.user_id,
      message: `${oldPlayer.username} -> ${bot.username} (${reason})`,
    });

    this._broadcast(session, {
      type: 'player_replaced_with_bot',
      session_id: sessionId,
      reason,
      replaced_user_id: userId,
      replaced_username: oldPlayer.username,
      bot,
      players: session.players,
      message: `${oldPlayer.username} disconnected and was replaced by ${bot.username}.`,
    });
    this._broadcast(session, { type: 'session_update', session: session, action: 'player_replaced_with_bot' });

    if (ms.humanPlayers.length === 0) {
      this._cancelAndBroadcast(sessionId,
        'No human players remain connected. Technical glitch logged; game cancelled.');
      return true;
    }
    return true;
  }

  /** True if the game type is globally disabled. */
  isGameDisabled(gameId) {
    const entry = this._disabledGames.get(String(gameId));
    return !!(entry && entry.disabled);
  }

  /** Re-enable a disabled game (admin action). */
  enableGame(gameId) {
    this._disabledGames.delete(String(gameId));
    writeLog({ event: 'game_enabled', gameId });
    // Notify all connected clients
    for (const [ws] of this._connections) {
      this._send(ws, { type: 'pm_game_enabled', game_id: gameId });
    }
  }

  /** Summary of all disabled games (for admin endpoint). */
  disabledGamesInfo() {
    const out = {};
    for (const [id, info] of this._disabledGames) {
      if (info.disabled) out[id] = { reason: info.reason, disabledAt: info.disabledAt };
    }
    return out;
  }

  /** Managed session info snapshot (for admin / health endpoint). */
  getSessionInfo(sessionId) {
    const ms = this._managed.get(sessionId);
    if (!ms) return null;
    return {
      sessionId: ms.sessionId,
      gameId: ms.gameId,
      status: ms.status,
      humanCount: ms.humanPlayers.length,
      botCount: ms.bots.length,
      connected: ms.connectionMap.size,
      turnSeq: ms.turnSeq,
      pendingAcks: ms.pendingAcks.size,
      errorLog: ms.errorLog.slice(-10),
    };
  }

  /** Summary of all managed sessions (for health endpoint). */
  allSessionsInfo() {
    const out = {};
    for (const id of this._managed.keys()) out[id] = this.getSessionInfo(id);
    return out;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: connection verification
  // ═══════════════════════════════════════════════════════════════════════════

  _verifyConnections(sessionId, attempt) {
    const ms = this._managed.get(sessionId);
    if (!ms || ms.status === 'cancelled') return;

    const session = this._liveSessions.get(sessionId);
    if (!session) return;

    // Rebuild connection map from current live connections
    ms.connectionMap.clear();
    for (const [ws, conn] of this._connections) {
      if (conn.session_x_id === sessionId && ms.humanPlayers.some(p => p.user_id === conn.user_id)) {
        ms.connectionMap.set(conn.user_id, ws);
      }
    }

    const missing = ms.humanPlayers.filter(p => !ms.connectionMap.has(p.user_id));

    if (missing.length === 0) {
      // All human players connected — take inventory
      const inventoryOk = this._takeInventory(ms, session);
      if (!inventoryOk) {
        writeLog({
          level: 'error',
          event: 'inventory_failed',
          sessionId,
          message: 'Player manifest does not match board requirements after corrections',
        });
        this._cancelAndBroadcast(sessionId,
          'Player roster mismatch — could not set up board. Game cancelled.');
        return;
      }

      ms.status = 'active';
      writeLog({
        event: 'session_verified',
        sessionId,
        humanCount: ms.humanPlayers.length,
        botCount: ms.bots.length,
      });

      this._broadcast(session, {
        type: 'pm_game_ready',
        session_id: sessionId,
        game_uuid: ms.gameUuid,
        players: ms.players,
        human_count: ms.humanPlayers.length,
        bot_count: ms.bots.length,
        message: 'All players connected. Game is ready.',
      });
      return;
    }

    if (attempt >= this._cfg.connectMaxRetries - 1) {
      const names = missing.map(p => p.username).join(', ');
      writeLog({
        level: 'error',
        event: 'connect_failed',
        sessionId,
        message: `Players not connected after ${this._cfg.connectMaxRetries} attempts: ${names}`,
      });
      this._cancelAndBroadcast(sessionId,
        `Could not connect all players after ${this._cfg.connectMaxRetries} attempts. `
        + `Missing: ${names}`);
      return;
    }

    writeLog({
      level: 'warn',
      event: 'connect_retry',
      sessionId,
      attempt,
      missing: missing.map(p => p.user_id),
    });

    const timer = setTimeout(
      () => this._verifyConnections(sessionId, attempt + 1),
      this._cfg.connectRetryDelay,
    );
    if (timer.unref) timer.unref();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: player inventory
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verify the player roster against board requirements.
   * Makes safe corrections (slot renumbering, trimming excess bots).
   * Returns false only if the session is unplayable.
   */
  _takeInventory(ms, session) {
    const minPlayers = 2;
    const maxPlayers = session.max_players || 6;
    const actual = ms.players.length;

    writeLog({
      event: 'inventory_start',
      sessionId: ms.sessionId,
      actual,
      min: minPlayers,
      max: maxPlayers,
    });

    if (actual < minPlayers) {
      writeLog({
        level: 'error',
        event: 'inventory_too_few',
        sessionId: ms.sessionId,
        actual,
        required: minPlayers,
      });
      return false;
    }

    if (actual > maxPlayers) {
      // Trim: remove excess AI players first, then last-joined humans
      writeLog({
        level: 'warn',
        event: 'inventory_trim',
        sessionId: ms.sessionId,
        actual,
        max: maxPlayers,
      });
      let excess = actual - maxPlayers;
      // Remove bots from the end
      for (let i = ms.players.length - 1; i >= 0 && excess > 0; i--) {
        if (ms.players[i].is_ai) {
          ms.players.splice(i, 1);
          excess--;
        }
      }
      // If still over, remove last-joined humans
      while (ms.players.length > maxPlayers) ms.players.pop();
      ms.humanPlayers = ms.players.filter(p => !p.is_ai);
      ms.bots = ms.players.filter(p => p.is_ai);
    }

    // Renumber slots sequentially
    ms.players.forEach((p, i) => { p.slot = i; });

    writeLog({
      event: 'inventory_ok',
      sessionId: ms.sessionId,
      players: ms.players.map(p => ({ id: p.user_id, name: p.username, isAI: p.is_ai, slot: p.slot })),
    });
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: ack tracking
  // ═══════════════════════════════════════════════════════════════════════════

  _allAcked(pending) {
    for (const uid of pending.required) {
      if (!pending.acked.has(uid)) return false;
    }
    return true;
  }

  _onAckTimeout(sessionId, seq) {
    const ms = this._managed.get(sessionId);
    if (!ms) return;
    const pending = ms.pendingAcks.get(seq);
    if (!pending) return;

    const missing = [...pending.required].filter(uid => !pending.acked.has(uid));

    writeLog({ level: 'warn', event: 'ack_timeout', sessionId, seq, missing });
    ms.errorLog.push({ ts: Date.now(), event: 'ack_timeout', seq, missing });

    ms.pendingAcks.delete(seq);
    ms.ackTimers.delete(seq);

    if (ms.status !== 'active') return;

    this._attemptHeal(sessionId, missing);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: healing
  // ═══════════════════════════════════════════════════════════════════════════

  _attemptHeal(sessionId, affectedUsers) {
    const ms = this._managed.get(sessionId);
    const session = this._liveSessions.get(sessionId);
    if (!ms || !session) return;

    if (ms.status === 'healing') {
      // Second failure — cannot heal
      writeLog({
        level: 'error',
        event: 'heal_failed',
        sessionId,
        message: 'Second heal attempt failed — cancelling game',
      });
      ms.errorLog.push({ ts: Date.now(), event: 'heal_failed' });
      this._cancelAndBroadcast(sessionId,
        'Could not synchronize game state for all players. '
        + 'Technical glitch logged. Game cancelled.');
      return;
    }

    ms.status = 'healing';
    writeLog({ event: 'heal_start', sessionId, affectedUsers });

    // Broadcast the last good state to everyone so they can resync
    this._broadcast(session, {
      type: 'pm_resync',
      session_id: sessionId,
      last_good_state: ms.lastGoodState,
      affected_users: affectedUsers,
      message: 'Resyncing game state — please wait…',
    });

    const timer = setTimeout(() => {
      const stillMs = this._managed.get(sessionId);
      if (!stillMs || stillMs.status !== 'healing') return;

      const stillMissing = affectedUsers.filter(uid => !stillMs.connectionMap.has(uid));
      if (stillMissing.length === 0) {
        stillMs.status = 'active';
        writeLog({ event: 'heal_success', sessionId });
        this._broadcast(session, {
          type: 'pm_heal_ok',
          session_id: sessionId,
          message: 'Connection restored. Continuing game.',
        });
      } else {
        writeLog({ level: 'warn', event: 'heal_timeout_replace', sessionId, stillMissing });
        // Requirement: if one player is affected, replace with a bot.
        let replaced = 0;
        for (const uid of stillMissing) {
          if (this.replacePlayerWithBot(sessionId, uid, 'heal_timeout')) replaced++;
        }
        if (!replaced) {
          this._cancelAndBroadcast(sessionId,
            `Players could not reconnect: ${stillMissing.join(', ')}`);
        } else {
          stillMs.status = 'active';
          this._broadcast(session, {
            type: 'pm_heal_ok',
            session_id: sessionId,
            message: 'Connection repaired by bot substitution. Continuing game.',
          });
        }
      }
    }, this._cfg.healTimeout);
    if (timer.unref) timer.unref();
  }

  _buildReplacementBot(oldPlayer, reason) {
    const base = String((oldPlayer && oldPlayer.username) || 'tech').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'tech';
    const botName = `${base}_bot`;
    return {
      user_id: 'ai_' + Date.now().toString(36) + '_' + Math.random().toString(16).slice(2, 6),
      username: botName,
      avatar_id: 'robot',
      is_host: false,
      is_ai: true,
      ready: true,
      replaced_user_id: oldPlayer && oldPlayer.user_id,
      replacement_reason: reason,
    };
  }

  _syncBotsFromState(sessionId, payload, source) {
    const ms = this._managed.get(sessionId);
    if (!ms) return;
    const snapshot = { source, at: Date.now(), payload };
    for (const bot of ms.bots) {
      if (!bot || !bot.user_id) continue;
      ms.botSnapshots.set(bot.user_id, snapshot);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private: cancel / disable
  // ═══════════════════════════════════════════════════════════════════════════

  _cancelAndBroadcast(sessionId, reason) {
    const ms = this._managed.get(sessionId);
    const session = this._liveSessions.get(sessionId);

    writeLog({ level: 'error', event: 'session_cancelled', sessionId, reason });

    if (ms) {
      ms.status = 'cancelled';
      ms.cancelledAt = Date.now();
      for (const t of ms.ackTimers.values()) clearTimeout(t);
      ms.ackTimers.clear();
      ms.pendingAcks.clear();
    }

    if (session) {
      session.status = 'cancelled';
      this._broadcast(session, {
        type: 'pm_cancelled',
        session_id: sessionId,
        reason,
        message: `Game cancelled. ${reason}`,
      });
    }

    // Auto-disable game if too many recent failures
    if (ms) this._checkAutoDisable(ms.gameId);

    // Clean up managed record after 30 s (allow broadcast delivery)
    const t = setTimeout(() => this._managed.delete(sessionId), 30_000);
    if (t.unref) t.unref();
  }

  _checkAutoDisable(gameId) {
    const entry = this._disabledGames.get(gameId) || { disabled: false, cancelCount: 0, cancelHistory: [] };
    entry.cancelHistory = (entry.cancelHistory || []).filter(ts => Date.now() - ts < this._cfg.recentWindowMs);
    entry.cancelHistory.push(Date.now());
    entry.cancelCount = entry.cancelHistory.length;
    this._disabledGames.set(gameId, entry);

    if (entry.cancelCount >= this._cfg.autoDisableAfter && !entry.disabled) {
      this._disableGame(gameId,
        `Auto-disabled after ${entry.cancelCount} consecutive failures within 5 min`);
    }
  }

  _disableGame(gameId, reason) {
    const existing = this._disabledGames.get(gameId) || {};
    this._disabledGames.set(gameId, {
      ...existing,
      disabled: true,
      reason,
      disabledAt: Date.now(),
    });
    writeLog({ level: 'error', event: 'game_disabled', gameId, reason });

    // Broadcast to every connected client
    for (const [ws] of this._connections) {
      this._send(ws, {
        type: 'pm_game_disabled',
        game_id: gameId,
        reason,
        message: `${gameId} is temporarily unavailable. `
          + 'Our team has been notified. Please try again later.',
      });
    }
  }
}

module.exports = PlayerManager;
