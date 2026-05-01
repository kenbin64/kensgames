/**
 * ═══════════════════════════════════════════════════════════════════════
 * PLAYER CLASS — js/substrates/player.js
 * ═══════════════════════════════════════════════════════════════════════
 * Universal Player substrate.
 *
 * A Player is NOT owned by any single Game.  One Player instance can
 * be injected into many games.  The Game receives a reference; it never
 * copies or clones the Player.
 *
 * Axiom alignment:
 *   x = player identity (id/seed)
 *   y = avatar / session modifiers  (extracted from manifold, not assumed)
 *   z = x * y  (manifested player presence in a game)
 * ═══════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  /**
   * Player — universal player object for all kensgames.com games.
   *
   * @param {object} spec
   * @param {string}  spec.id      — stable user identifier (user_id or generated)
   * @param {string}  spec.name    — display name
   * @param {object}  [spec.avatar]— Avatar descriptor (from AvatarPicker or profile)
   * @param {boolean} [spec.isAI]  — true for bot players
   * @param {string}  [spec.color] — optional colour hint for board rendering
   */
  class Player {
    constructor(spec = {}) {
      const s = typeof spec === 'string' ? { name: spec } : spec;

      /** Stable identifier — x dimension seed. */
      this.id = String(s.id || s.user_id || _generateId());

      /** Display name shown in UI and game boards. */
      this.name = String(s.name || s.display_name || 'Player').trim().slice(0, 32) || 'Player';

      /**
       * Avatar descriptor — y dimension modifier.
       * Shape is opaque to Player; it is whatever AvatarPicker / profile returns.
       * May be null until the player completes wizard setup.
       */
      this.avatar = s.avatar || null;

      /** True when this slot is controlled by AI. */
      this.isAI = Boolean(s.isAI || s.is_ai);

      /**
       * Optional colour hint. Games use this for peg/token rendering
       * when they don't derive colour from the board manifold.
       */
      this.color = s.color || null;

      /**
       * Internal registry of games this player is currently injected into.
       * Map<gameId, Game>.
       * Maintained automatically by inject() / leave().
       */
      this._games = new Map();
    }

    // ── Game membership ──────────────────────────────────────────────

    /**
     * Inject this player into a game.
     * Delegates to game.addPlayer(this) so the Game controls board state.
     *
     * @param {Game} game
     * @returns {Player}  — chainable
     */
    inject(game) {
      if (!game || typeof game.addPlayer !== 'function') {
        throw new TypeError('Player.inject: argument must be a Game instance');
      }
      if (!this._games.has(game.id)) {
        this._games.set(game.id, game);
        game.addPlayer(this);
      }
      return this;
    }

    /**
     * Remove this player from a game.
     * Delegates to game.removePlayer(this.id).
     *
     * @param {Game} game
     * @returns {Player}
     */
    leave(game) {
      if (!game || typeof game.removePlayer !== 'function') {
        throw new TypeError('Player.leave: argument must be a Game instance');
      }
      if (this._games.has(game.id)) {
        this._games.delete(game.id);
        game.removePlayer(this.id);
      }
      return this;
    }

    /** Whether this player is currently injected into the given game. */
    isIn(game) {
      return game && this._games.has(game.id);
    }

    /** IDs of all games this player is currently in. */
    get gameIds() { return Array.from(this._games.keys()); }

    // ── Manifold projection ──────────────────────────────────────────

    /**
     * Project player to a manifold entity.
     * x = numeric seed from id, y = avatar weight (1 if no avatar), z = x * y.
     *
     * @returns {{ x: number, y: number, z: number, id: string, name: string }}
     */
    toManifold() {
      const x = this._idToSeed(this.id);
      const y = this.avatar && typeof this.avatar.weight === 'number' ? this.avatar.weight : 1;
      const z = x * y;
      return { x, y, z, id: this.id, name: this.name };
    }

    // ── Serialisation ────────────────────────────────────────────────

    /**
     * Plain-object snapshot suitable for JSON / sessionStorage.
     * Does NOT include _games (to avoid circular refs).
     */
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        avatar: this.avatar,
        isAI: this.isAI,
        color: this.color,
      };
    }

    /**
     * Reconstruct a Player from a plain-object snapshot.
     * @param {object} obj
     * @returns {Player}
     */
    static fromJSON(obj) {
      return new Player(obj);
    }

    // ── Private ──────────────────────────────────────────────────────

    _idToSeed(id) {
      let n = 0;
      for (let i = 0; i < String(id).length; i++) n += String(id).charCodeAt(i);
      return n || 1;
    }
  }

  function _generateId() {
    // Crypto-quality ID when available; deterministic fallback for test envs.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // ── Export ───────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player };
  } else {
    root.Player = Player;
  }

}(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this));
