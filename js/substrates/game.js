/**
 * ═══════════════════════════════════════════════════════════════════════
 * GAME BASE CLASS — js/substrates/game.js
 * ═══════════════════════════════════════════════════════════════════════
 * Defines the universal Game substrate.
 *
 * Axiom: Manifold = Expression + Attributes + Substrate
 *        z = x·y  — x is the game identity/seed,
 *                   y is the live session/players modifier set,
 *                   z is the manifested game state.
 *
 * Player objects are EXTERNAL to Game. They are injected at runtime via
 * injectPlayers().  A Player instance can participate in multiple games
 * simultaneously; Game never owns a Player.
 * ═══════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  /**
   * Game — base class for all kensgames.com game implementations.
   *
   * Concrete games extend Game and:
   *   1. Call super(id, name) in their constructor.
   *   2. Declare game-specific rules in this.rules[].
   *   3. Implement _onPlayersInjected(players) for board/state setup.
   *   4. Implement _onStart() to begin the first turn.
   */
  class Game {
    /**
     * @param {string} id    — machine identifier, e.g. 'fasttrack'
     * @param {string} name  — display name, e.g. 'Fast Track'
     */
    constructor(id, name) {
      if (!id || typeof id !== 'string') throw new TypeError('Game: id must be a non-empty string');
      if (!name || typeof name !== 'string') throw new TypeError('Game: name must be a non-empty string');

      /** Manifold identity — x dimension.  Stable across sessions. */
      this.id = id;

      /** Human-readable display name. */
      this.name = name;

      /**
       * Live session object — y dimension modifier.
       * Set externally before injectPlayers() is called.
       * Shape: { session_id, session_code, players[], is_host, … }
       */
      this.session = null;

      /**
       * Rules array — ordered list of rule descriptors for this game.
       * Each entry: { id, category, description, value? }
       * Populated by the concrete subclass.
       */
      this.rules = [];

      /**
       * Current manifested state — z dimension.
       * Derived from x (id) × y (session). Never stored independently;
       * always recomputed via toManifold().
       */
      this._state = null;

      /** Injected Player instances.  Populated by injectPlayers(). */
      this._players = [];

      /** Whether the game has been started. */
      this._started = false;
    }

    // ── Player injection ─────────────────────────────────────────────

    /**
     * Inject an array of Player objects into the game.
     * This replaces any previously injected players and triggers
     * the concrete game's _onPlayersInjected() hook for board setup.
     *
     * @param {Player[]} players
     * @returns {Game}  — chainable
     */
    injectPlayers(players) {
      if (!Array.isArray(players)) throw new TypeError('Game.injectPlayers: expected an array');
      this._players = players.slice();          // defensive copy
      this._state = null;                       // invalidate cached state
      this._onPlayersInjected(this._players);
      return this;
    }

    /**
     * Add a single Player to an already-running game (late join).
     * @param {Player} player
     * @returns {Game}
     */
    addPlayer(player) {
      if (!player || typeof player !== 'object') throw new TypeError('Game.addPlayer: expected a Player object');
      this._players.push(player);
      this._state = null;
      this._onPlayerAdded(player);
      return this;
    }

    /**
     * Remove a Player from the game (disconnect / leave).
     * @param {string} playerId
     * @returns {Game}
     */
    removePlayer(playerId) {
      const idx = this._players.findIndex(p => p.id === playerId);
      if (idx === -1) return this;
      const [removed] = this._players.splice(idx, 1);
      this._state = null;
      this._onPlayerRemoved(removed);
      return this;
    }

    /** @returns {Player[]} — live snapshot of injected players */
    get players() { return this._players.slice(); }

    /** @returns {number} */
    get playerCount() { return this._players.length; }

    // ── Session ──────────────────────────────────────────────────────

    /**
     * Attach a session object (y modifier).
     * @param {object} session
     * @returns {Game}
     */
    setSession(session) {
      this.session = session || null;
      this._state = null;
      return this;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    /**
     * Start the game.  Throws if no players are injected.
     * @returns {Game}
     */
    start() {
      if (this._players.length === 0) throw new Error('Game.start: no players injected');
      if (this._started) return this;
      this._started = true;
      this._onStart();
      return this;
    }

    /** Whether the game has been started. */
    get started() { return this._started; }

    // ── Manifold projection ──────────────────────────────────────────

    /**
     * Project the game to a manifold entity (x/y/z).
     *
     * x = numeric seed derived from game id (character code sum)
     * y = player count — the primary session modifier
     * z = x * y  (universal access rule)
     *
     * @returns {{ x: number, y: number, z: number, id: string, name: string }}
     */
    toManifold() {
      const x = this._idToSeed(this.id);
      const y = this._players.length || (this.session && this.session.players ? this.session.players.length : 1);
      const z = x * y;
      return { x, y, z, id: this.id, name: this.name };
    }

    // ── Protected hooks (override in subclass) ───────────────────────

    /** Called after injectPlayers(). Override to set up board state. */
    _onPlayersInjected(_players) { /* no-op in base */ }

    /** Called when a single player is added (late join). */
    _onPlayerAdded(_player) { /* no-op in base */ }

    /** Called when a player is removed. */
    _onPlayerRemoved(_player) { /* no-op in base */ }

    /** Called by start(). Override to begin the first turn. */
    _onStart() { /* no-op in base */ }

    // ── Private helpers ──────────────────────────────────────────────

    _idToSeed(id) {
      let n = 0;
      for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
      return n || 1;
    }
  }

  // ── Export ───────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Game };
  } else {
    root.Game = Game;
  }

}(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this));
