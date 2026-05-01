/**
 * ═══════════════════════════════════════════════════════════════════════
 * FASTTRACK GAME — fasttrack/fasttrack-game.js
 * ═══════════════════════════════════════════════════════════════════════
 * Concrete Game implementation for Fast Track.
 *
 * Inherits:   Game  (js/substrates/game.js)
 * Players:    Injected externally via injectPlayers() — Player instances
 *             are NOT owned by FastTrackGame.
 *
 * Axiom:  z = x·y
 *   x  = game identity seed (derived from id 'fasttrack')
 *   y  = player count modifier (live session)
 *   z  = manifested board state
 *
 * Board setup runs inside _onPlayersInjected().  The board is never
 * initialised until players are present, because hole assignment,
 * peg colour, and safe-zone layout all depend on Player objects.
 * ═══════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  // ── Dependency resolution ─────────────────────────────────────────────
  // When loaded as a Node module (tests), Game must be required explicitly.
  // In the browser Game is on the global already.
  const Game = (typeof module !== 'undefined' && module.exports)
    ? require('../js/substrates/game.js').Game
    : root.Game;

  // ─── FastTrack constants ─────────────────────────────────────────────
  const FT_ID = 'fasttrack';
  const FT_NAME = 'Fast Track';

  const PEGS_PER_PLAYER = 5;
  const SAFE_ZONE_SIZE = 4;
  const OUTER_TRACK_HOLES = 84;   // 6 wedges × 14 holes

  /**
   * Default player colours — billiard ball palette, matching fasttrack-3d.js RAINBOW_COLORS.
   * Source: `const RAINBOW_COLORS = [0xFFE000, 0x0050B5, 0xEE0000, 0x4B0082, 0xFF5500, 0x006400]`
   * These are the base identity colours.  The renderer may enhance them with
   * emissive glow, metalness, or bloom — the hue identity should be preserved.
   * The data layer (peg objects) uses these CSS strings; the renderer reads RAINBOW_COLORS directly.
   */
  const DEFAULT_COLORS = ['#FFE000', '#0050B5', '#EE0000', '#4B0082', '#FF5500', '#006400'];
  const DEFAULT_COLOR_NAMES = ['Yellow', 'Blue', 'Red', 'Purple', 'Orange', 'Green'];

  // ─── Rules catalogue ────────────────────────────────────────────────
  //
  // Rules are plain descriptors, NOT imperative code.
  // The rules engine (fasttrack-game-core.js) executes them.
  // This catalogue is the single declaration of what the rules ARE.
  //
  // Each rule:  { id, category, description, value? }
  // Mirrors the axes in fasttrack.rules.json (x=category, y=index).
  //
  const FASTTRACK_RULES = [
    // ── Setup ─────────────────────────────────────────────────────
    { id: 'setup-pegs-per-player', category: 'setup', description: 'Each player starts with 5 pegs.', value: PEGS_PER_PLAYER },
    { id: 'setup-min-players', category: 'setup', description: 'Minimum 2 players required.', value: 2 },
    { id: 'setup-max-players', category: 'setup', description: 'Maximum 6 players allowed.', value: 6 },
    { id: 'setup-peg-start-hold', category: 'setup', description: '4 pegs start in holding.', value: 4 },
    { id: 'setup-peg-start-home', category: 'setup', description: '1 peg starts at home position.', value: 1 },

    // ── Card play ─────────────────────────────────────────────────
    { id: 'card-hand-size', category: 'card', description: 'Each player holds 5 cards.', value: 5 },
    { id: 'card-7-split', category: 'card', description: 'A 7 can be split between two pegs.' },
    { id: 'card-jack-cut', category: 'card', description: 'A Jack cuts an opponent peg back to holding.' },
    { id: 'card-king-release', category: 'card', description: 'A King releases a peg from holding to home.' },
    { id: 'card-ace-release', category: 'card', description: 'An Ace releases a peg from holding to home.' },
    { id: 'card-joker-any', category: 'card', description: 'A Joker acts as any card.' },

    // ── Movement ──────────────────────────────────────────────────
    { id: 'move-exact-safe-zone', category: 'movement', description: 'Exact count required to enter safe zone.' },
    { id: 'move-exact-bullseye', category: 'movement', description: 'Exact count required to enter bullseye.' },
    { id: 'move-clockwise', category: 'movement', description: 'Outer track traversal is clockwise.' },
    { id: 'move-no-reverse', category: 'movement', description: 'Pegs may not move backwards on the outer track.' },

    // ── Fast Track ring ───────────────────────────────────────────
    { id: 'ft-ring-exit', category: 'fasttrack', description: 'A peg must exit the FT ring at its own FT hole.' },
    { id: 'ft-ring-skip', category: 'fasttrack', description: 'The FT ring skips outer-track traversal.' },

    // ── Safe zone ─────────────────────────────────────────────────
    { id: 'safe-zone-size', category: 'safezone', description: 'Safe zone has 4 holes per player.', value: SAFE_ZONE_SIZE },
    { id: 'safe-no-cut', category: 'safezone', description: 'Pegs in the safe zone cannot be cut.' },
    { id: 'safe-owner-only', category: 'safezone', description: 'Only the owning player may enter their safe zone.' },

    // ── Bullseye ──────────────────────────────────────────────────
    { id: 'bullseye-one-peg', category: 'bullseye_entry', description: 'Only one peg may occupy the bullseye.' },
    { id: 'bullseye-no-cut', category: 'bullseye_entry', description: 'A peg in the bullseye cannot be cut.' },

    // ── Win condition ─────────────────────────────────────────────
    { id: 'win-all-in-safe', category: 'win', description: 'First player to advance all 5 pegs to safe-zone wins.' },
  ];

  // ─── FastTrackGame ───────────────────────────────────────────────────

  class FastTrackGame extends Game {
    constructor() {
      super(FT_ID, FT_NAME);

      // Populate rules catalogue on construction.
      this.rules = FASTTRACK_RULES.slice();

      // ── Board state (populated by _onPlayersInjected) ────────────
      /**
       * holes — Map<holeId, { id, type, player?, peg? }>
       * Lazily built when players are injected.
       */
      this.holes = new Map();

      /**
       * pegs — Map<pegId, { id, playerId, color, holeId, state }>
       * state: 'holding' | 'home' | 'outer' | 'safezone' | 'bullseye' | 'winner'
       */
      this.pegs = new Map();

      /**
       * playerSlots — ordered array of { player, color, index, pegIds[] }
       * Built during _onPlayersInjected.
       */
      this.playerSlots = [];

      /**
       * theme — identity contract for the renderer.
       *
       * The 3D pool hall environment MUST be preserved:
       *   • Hexagonal board on a billiard table (createHexBilliardTable)
       *   • Pool hall room with baize felt, cue rack, art (createBilliardRoom)
       *   • Billiard-ball peg colours as the base palette
       *
       * Enhancements ARE welcome — richer lighting, improved felt texture,
       * emissive glow on pegs, bloom post-processing, ambient occlusion, etc.
       * The constraint is identity, not fidelity ceiling.
       *
       * liquidTransitions — every state change is expressed as a from→to delta
       * with duration and easing so the renderer always interpolates between
       * frames rather than snapping.  Only changed properties are included in
       * each delta (delta-minimal); unchanged state is never re-sent.
       */
      this.theme = {
        environment: 'pool-hall-3d',  // createBilliardRoom() in fasttrack-3d.js
        board: 'hex-billiard',  // createHexBilliardTable() in fasttrack-3d.js
        allowEnhancements: true,            // colours, lighting, shaders may be improved
        liquidTransitions: true,            // renderer must lerp — never snap — between deltas
      };

      /**
       * _deltaQueue — ordered list of pending state deltas.
       *
       * Each delta describes only what changed:
       *   {
       *     type:     string,   // 'peg-move' | 'peg-cut' | 'peg-enter-safe' | …
       *     target:   string,   // id of the affected peg, hole, or player
       *     from:     object,   // previous observable state snapshot (only changed keys)
       *     to:       object,   // next observable state snapshot   (only changed keys)
       *     duration: number,   // interpolation time in ms  (default: 320)
       *     easing:   string,   // 'ease-out' | 'ease-in-out' | 'linear'  (default: 'ease-out')
       *     seq:      number,   // monotonic sequence counter — renderer skips if already consumed
       *   }
       *
       * Game logic writes via pushDelta().
       * Renderer reads via drainDeltas() once per frame — each call removes
       * and returns only the deltas added since the last drain.
       * Unchanged board state is NEVER included; the renderer keeps its own
       * scene graph and only mutates what a delta targets.
       */
      this._deltaQueue = [];
      this._deltaSeq = 0;

      /**
       * _snapshot — last-known observable state per target id.
       * Map<targetId, object>
       *
       * pushDelta() diffs the incoming `to` object against the snapshot
       * and silently drops the push when nothing actually changed.
       * This is what saves memory and computation:
       *   - no allocation for no-op frames
       *   - renderer drainDeltas() returns [] → zero scene-graph work
       *   - callers can pass full state objects; only the diff is stored
       */
      this._snapshot = new Map();
    }

    // ── Game identity helpers ────────────────────────────────────────

    /** Convenience: look up a rule by id. */
    getRule(ruleId) {
      return this.rules.find(r => r.id === ruleId) || null;
    }

    /** Convenience: look up a rule value (returns undefined if not found or no value). */
    getRuleValue(ruleId) {
      const r = this.getRule(ruleId);
      return r ? r.value : undefined;
    }

    // ── Board initialisation (runs on player injection) ──────────────

    /**
     * Called by Game.injectPlayers() after the player array is set.
     * Builds holes, assigns player slots, distributes pegs.
     *
     * @param {Player[]} players
     */
    _onPlayersInjected(players) {
      this.holes.clear();
      this.pegs.clear();
      this.playerSlots = [];
      this._deltaQueue = [];   // clear pending deltas — board is being rebuilt
      this._snapshot.clear();  // clear snapshot — full re-sync on next push

      // ── Build hole map ───────────────────────────────────────────
      // Outer track: outer-{wedge}-{n}  (wedge 0-5, n 1-14)
      for (let w = 0; w < 6; w++) {
        for (let n = 1; n <= 14; n++) {
          const id = `outer-${w}-${n}`;
          this.holes.set(id, { id, type: 'outer', wedge: w, index: n });
        }
      }
      // FastTrack ring: ft-{w}  (dual-role with outer-{w}-1)
      for (let w = 0; w < 6; w++) {
        const id = `ft-${w}`;
        this.holes.set(id, { id, type: 'fasttrack', wedge: w });
      }
      // Bullseye
      this.holes.set('center', { id: 'center', type: 'bullseye' });

      // ── Assign player slots ──────────────────────────────────────
      players.forEach((player, idx) => {
        const color = player.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
        const pegIds = [];

        // Holding: hold-{idx}-{1..4}
        for (let h = 1; h <= 4; h++) {
          const holeId = `hold-${idx}-${h}`;
          this.holes.set(holeId, { id: holeId, type: 'holding', player: idx });
          const pegId = `peg-${idx}-${h}`;
          this.pegs.set(pegId, { id: pegId, playerId: player.id, color, holeId, state: 'holding' });
          pegIds.push(pegId);
        }

        // Safe zone: safe-{idx}-{1..4}
        for (let s = 1; s <= SAFE_ZONE_SIZE; s++) {
          const holeId = `safe-${idx}-${s}`;
          this.holes.set(holeId, { id: holeId, type: 'safezone', player: idx });
        }

        // Home (winner hole): home-{idx}
        this.holes.set(`home-${idx}`, { id: `home-${idx}`, type: 'home', player: idx });

        // 5th peg starts at home position
        const peg5Id = `peg-${idx}-5`;
        this.pegs.set(peg5Id, { id: peg5Id, playerId: player.id, color, holeId: `home-${idx}`, state: 'home' });
        pegIds.push(peg5Id);

        this.playerSlots.push({ player, color, index: idx, pegIds });
      });
    }

    /** Called by Game.addPlayer() when a player joins after initial setup. */
    _onPlayerAdded(player) {
      // Re-run full board setup with the updated player list.
      this._onPlayersInjected(this._players);
    }

    /** Called by Game.removePlayer() when a player leaves. */
    _onPlayerRemoved(_player) {
      this._onPlayersInjected(this._players);
    }

    /** Called by Game.start() — no-op here; rendering side kicks off the first turn. */
    _onStart() { /* renderer handles first-turn flow */ }

    // ── Liquid delta queue ───────────────────────────────────────────

    /**
     * Push a state-change delta onto the queue.
     *
     * `to` may be a full state object — pushDelta auto-diffs it against
     * the last-known snapshot for `target` and keeps only changed keys.
     * If nothing changed the push is silently dropped (returns 0).
     * This guarantees the queue is always delta-minimal regardless of
     * how callers construct the `to` object.
     *
     * @param {object} delta
     * @param {string}  delta.type     — e.g. 'peg-move', 'peg-cut', 'card-play'
     * @param {string}  delta.target   — id of the affected object
     * @param {object}  delta.from     — previous state (full or partial)
     * @param {object}  delta.to       — next state (full or partial)
     * @param {number}  [delta.duration=320]  — ms
     * @param {string}  [delta.easing='ease-out']
     * @returns {number} seq assigned, or 0 if the push was a no-op
     */
    pushDelta(delta) {
      const snap = this._snapshot.get(delta.target) || {};
      const fromFull = Object.assign({}, delta.from);
      const toFull = Object.assign({}, delta.to);

      // Compute minimal diff — only keys whose value actually changed.
      // Previous value priority: snapshot (authoritative) → caller's `from` (first-push fallback).
      // This lets callers pass full state objects on first push: keys where from===to are dropped.
      const changedFrom = {};
      const changedTo = {};
      let hasChange = false;
      for (const key of Object.keys(toFull)) {
        const prevVal = key in snap ? snap[key] : fromFull[key];
        if (prevVal !== toFull[key]) {
          changedFrom[key] = prevVal;
          changedTo[key] = toFull[key];
          hasChange = true;
        }
      }

      // Drop no-op push — renderer would have nothing to interpolate
      if (!hasChange) return 0;

      // Advance snapshot to new state (only changed keys written)
      const next = Object.assign({}, snap, changedTo);
      this._snapshot.set(delta.target, next);

      const seq = ++this._deltaSeq;
      this._deltaQueue.push(Object.assign({
        duration: 320,
        easing: 'ease-out',
      }, delta, {
        from: changedFrom,
        to: changedTo,
        seq,
      }));
      return seq;
    }

    // ── Typed helpers — callers never build diffs manually ───────────

    /**
     * Move a peg to a new hole.  Auto-diffs; no-ops if already there.
     * @param {string} pegId
     * @param {string} toHoleId
     * @param {object} [opts]  — duration, easing overrides
     * @returns {number} seq or 0
     */
    movePeg(pegId, toHoleId, opts = {}) {
      const peg = this.pegs.get(pegId);
      if (!peg) return 0;
      const prevHole = peg.holeId;
      peg.holeId = toHoleId;
      return this.pushDelta(Object.assign({
        type: 'peg-move',
        target: pegId,
        from: { holeId: prevHole },
        to: { holeId: toHoleId },
      }, opts));
    }

    /**
     * Change a peg's lifecycle state.  Auto-diffs; no-ops if unchanged.
     * @param {string} pegId
     * @param {string} toState  — 'holding'|'home'|'outer'|'safezone'|'bullseye'|'winner'
     * @param {object} [opts]   — duration, easing overrides
     * @returns {number} seq or 0
     */
    setPegState(pegId, toState, opts = {}) {
      const peg = this.pegs.get(pegId);
      if (!peg) return 0;
      const prevState = peg.state;
      peg.state = toState;
      return this.pushDelta(Object.assign({
        type: 'peg-state',
        target: pegId,
        from: { state: prevState },
        to: { state: toState },
      }, opts));
    }

    /**
     * Drain and return all pending deltas since the last call.
     * The renderer calls this once per animation frame.
     * Returns an empty array when nothing changed — renderer does nothing.
     *
     * @returns {object[]} deltas in push order
     */
    drainDeltas() {
      if (this._deltaQueue.length === 0) return [];
      const batch = this._deltaQueue.slice();
      this._deltaQueue = [];
      return batch;
    }

    /**
     * Inspect pending deltas without consuming them.
     * Useful for testing or preview logic.
     *
     * @returns {object[]}
     */
    peekDeltas() {
      return this._deltaQueue.slice();
    }

    // ── Board queries ────────────────────────────────────────────────

    /** @returns {{ player, color, index, pegIds[] }|null} */
    slotForPlayer(playerId) {
      return this.playerSlots.find(s => s.player.id === playerId) || null;
    }

    /** @returns {Array<{ id, playerId, color, holeId, state }>} pegs owned by player */
    pegsForPlayer(playerId) {
      return Array.from(this.pegs.values()).filter(p => p.playerId === playerId);
    }

    // ── Manifold projection (FastTrack-specific z = x·y²) ────────────
    // FastTrack uses z = x·y² because the board complexity scales with
    // the square of the player count (interaction pairs grow quadratically).

    toManifold() {
      const base = super.toManifold();
      const y = base.y;
      return Object.assign({}, base, {
        z: base.x * y * y,           // z = x·y²
        equation: 'z=xy^2',
        holeCount: this.holes.size,
        pegCount: this.pegs.size,
      });
    }
  }

  // ── Expose catalogue for external consumers ──────────────────────────
  FastTrackGame.RULES = FASTTRACK_RULES;
  // COLORS / COLOR_NAMES mirror fasttrack-3d.js RAINBOW_COLORS / COLOR_NAMES exactly.
  // Renderer reads its own constants; these are for data-layer consumers only.
  FastTrackGame.COLORS = DEFAULT_COLORS;
  FastTrackGame.COLOR_NAMES = DEFAULT_COLOR_NAMES;
  FastTrackGame.ID = FT_ID;
  FastTrackGame.NAME = FT_NAME;

  // ── Export ───────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FastTrackGame };
  } else {
    root.FastTrackGame = FastTrackGame;
  }

}(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this));
