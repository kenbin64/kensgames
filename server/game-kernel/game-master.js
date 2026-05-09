'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 GAME KERNEL — GameMaster (per-match orchestrator)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * One GameMaster instance per active match. Owns:
 *   - the GameRules implementation (pure)
 *   - the current derived state    (z = applyAction reduction over the action log)
 *   - the player descriptors       (x identities)
 *   - the channels                 (transport for x ↔ z)
 *   - optional AI controllers      (just another player whose channel is local)
 *   - optional persistence sink    (e.g. seed log appender) — kept abstract
 *
 * The action log is the source of truth. State is derived. This keeps the
 * GameMaster compatible with HARD_RULES (z is never the authority).
 *
 *   apply :: (state, action) → state'      (pure, from rules)
 *   log   :: action → void                 (side-effect, via persist())
 *
 * No network, no filesystem, no ws import lives here.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { makeAction } = require('./rules.js');

class GameMaster {
  /**
   * @param {object} opts
   * @param {object} opts.rules        GameRules implementation
   * @param {Array}  opts.players      PlayerDescriptor[]
   * @param {Array}  opts.channels     PlayerChannel[] (must include one per player; use nullChannel for AI w/o local channel)
   * @param {Function} [opts.aiFactory]   (player) → AIController | null
   * @param {Function} [opts.persist]     (action, prevState, nextState) → void   (e.g. seed-log appender)
   * @param {object} [opts.meta]          arbitrary session metadata (sessionId, code)
   */
  constructor({ rules, players, channels, aiFactory, persist, meta }) {
    if (!rules) throw new TypeError('GameMaster: rules required');
    if (!Array.isArray(players) || players.length === 0) {
      throw new TypeError('GameMaster: players must be a non-empty array');
    }
    if (!Array.isArray(channels)) {
      throw new TypeError('GameMaster: channels must be an array');
    }

    this.rules = rules;
    this.meta = meta || {};
    this._persist = typeof persist === 'function' ? persist : null;
    this._aiFactory = typeof aiFactory === 'function' ? aiFactory : null;

    this._players = new Map();   // playerId → descriptor
    this._channels = new Map();  // playerId → channel
    this._ais = new Map();       // playerId → AIController
    this._actionLog = [];        // append-only
    this._closed = false;

    for (const p of players) this._players.set(String(p.id), p);
    for (const ch of channels) this._channels.set(String(ch.id), ch);

    // Verify every player has a channel (nullChannel ok)
    for (const id of this._players.keys()) {
      if (!this._channels.has(id)) {
        throw new Error(`GameMaster: player ${id} has no channel`);
      }
    }

    this.state = rules.createInitialState(players, this.meta);
    this._lastTurn = this._readCurrentTurn();
    this._lastSettled = this._readSettled();
    this._dirty = false;

    this._bindChannels();
    if (this._aiFactory) this._startAIs();
    this._broadcastState();
    this._maybeBroadcastTurn(true);

    // Real-time tick loop. Rules opt in by exposing tick(state, dt) and
    // (optionally) tickHz. While ticking, applyAction does NOT broadcast on
    // every action; the tick loop is the single broadcaster (one unified
    // state per tick, all players, all deltas at once).
    this._tickHz = Number(rules.tickHz) || 0;
    this._tickTimer = null;
    if (typeof rules.tick === 'function' && this._tickHz > 0) {
      const intervalMs = Math.max(1, Math.round(1000 / this._tickHz));
      this._tickIntervalMs = intervalMs;
      this._lastTickAt = Date.now();
      this._tickTimer = setInterval(() => this._tick(), intervalMs);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Inject an action as if it came from playerId's channel. */
  submit(playerId, msg) {
    return this._handleIncoming(String(playerId), msg);
  }

  getState() { return this.state; }
  getActionLog() { return this._actionLog.slice(); }
  isOver() { return this.rules.isGameOver(this.state); }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    for (const ch of this._channels.values()) {
      try { ch.close(); } catch (_) { }
    }
    for (const ai of this._ais.values()) {
      try { ai.stop && ai.stop(); } catch (_) { }
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _bindChannels() {
    for (const [pid, ch] of this._channels) {
      ch.onMessage((msg) => this._handleIncoming(pid, msg));
      ch.onClose(() => this._handleDisconnect(pid));
    }
  }

  _handleIncoming(playerId, msg) {
    if (this._closed) return false;
    if (!this._players.has(playerId)) return false;

    const action = makeAction(playerId, msg);

    // Turn-authority gating (turn-based games only). Real-time games omit
    // getCurrentTurn() and skip this check entirely.
    if (typeof this.rules.getCurrentTurn === 'function') {
      const activeId = this.rules.getCurrentTurn(this.state);
      // settle_complete may come from any seated player (clients confirm
      // their cinematic finished). Everything else must come from the
      // current turn-holder.
      if (action.type !== 'settle_complete' && activeId && activeId !== playerId) {
        const ch = this._channels.get(playerId);
        if (ch) ch.send({
          type: 'error', reason: 'not-your-turn',
          action: action.type, activePlayerId: activeId,
        });
        return false;
      }
    }

    if (!this.rules.validateAction(this.state, action)) {
      const ch = this._channels.get(playerId);
      if (ch) ch.send({ type: 'error', reason: 'invalid-action', action: action.type });
      return false;
    }

    const prev = this.state;
    const next = this.rules.applyAction(prev, action);
    this.state = next;
    this._actionLog.push(action);

    if (this._persist) {
      try { this._persist(action, prev, next); } catch (_) { /* never crash on log */ }
    }

    if (this._tickTimer) {
      // Tick mode: defer broadcast until the next tick. Multiple inputs
      // collapse into one unified state delta per frame.
      this._dirty = true;
    } else {
      this._broadcastState();
      this._maybeBroadcastTurn(false);
    }

    if (this.rules.isGameOver(this.state)) {
      this._broadcast({ type: 'game_over' });
      if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    }
    return true;
  }

  _tick() {
    if (this._closed) return;
    const now = Date.now();
    const dt = (now - this._lastTickAt) / 1000;
    this._lastTickAt = now;
    try {
      const next = this.rules.tick(this.state, dt);
      if (next && next !== this.state) {
        this.state = next;
        this._dirty = true;
      }
    } catch (_) { /* never crash the loop */ }
    if (this._dirty) {
      this._broadcastState();
      this._dirty = false;
    }
    if (this.rules.isGameOver(this.state)) {
      this._broadcast({ type: 'game_over' });
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  _handleDisconnect(playerId) {
    const p = this._players.get(playerId);
    if (!p) return;
    // Default policy: mark descriptor disconnected; rules decide what to do.
    p.isConnected = false;
    this._broadcast({ type: 'player_disconnect', playerId });
  }

  _broadcastState() {
    for (const [pid, ch] of this._channels) {
      const visible = this.rules.getVisibleState(this.state, pid);
      ch.send({ type: 'state', state: visible });
    }
  }

  _broadcast(msg) {
    for (const ch of this._channels.values()) ch.send(msg);
  }

  // ── Turn-authority helpers ────────────────────────────────────────────────

  _readCurrentTurn() {
    if (typeof this.rules.getCurrentTurn !== 'function') return null;
    try { return this.rules.getCurrentTurn(this.state); } catch (_) { return null; }
  }

  _readSettled() {
    if (typeof this.rules.isSettled !== 'function') return true; // default: settled
    try { return !!this.rules.isSettled(this.state); } catch (_) { return true; }
  }

  /**
   * Broadcast a `turn` message when the active player or settled state
   * actually changes (or on first call when force=true). Includes the
   * settled flag so clients can show "resolving…" UI between actions.
   */
  _maybeBroadcastTurn(force) {
    if (typeof this.rules.getCurrentTurn !== 'function') return;
    const active = this._readCurrentTurn();
    const settled = this._readSettled();
    if (!force && active === this._lastTurn && settled === this._lastSettled) return;
    this._lastTurn = active;
    this._lastSettled = settled;
    this._broadcast({
      type: 'turn',
      activePlayerId: active,
      settled,
    });
  }

  _startAIs() {
    for (const [pid, p] of this._players) {
      if (!p.isAI) continue;
      const ai = this._aiFactory(p);
      if (!ai || typeof ai.startLoop !== 'function') continue;
      this._ais.set(pid, ai);
      ai.startLoop(
        (action) => this._handleIncoming(pid, action),
        () => this.rules.getVisibleState(this.state, pid),
      );
    }
  }
}

module.exports = { GameMaster };
