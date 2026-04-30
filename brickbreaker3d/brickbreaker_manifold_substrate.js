/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 BRICKBREAKER 3D MANIFOLD SUBSTRATE  v1.0
 * Five SubstrateLenses on the Gyroid surface — z = x · y
 *
 * Every output the game produces (ball speed, glow, audio power,
 * score weight, arena tension) is a LENS PROJECTION of two normalised
 * game dimensions onto the manifold primitive z = x · y.
 *
 * Lenses:
 *   GameStateLens  (level_progress  × brick_density)  → arena_tension
 *   PhysicsLens    (ball_speed      × arena_tension)  → velocity_weight
 *   GraphicsLens   (ball_advance    × threat_level)   → glow_intensity
 *   AudioLens      (event_impact    × arena_tension)  → sound_power
 *   ScoreLens      (combo_factor    × brick_value)    → score_bloom
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const MI = window.ManifoldIngestor;
  if (!MI) {
    console.warn('🜂 BrickBreaker substrate requires ManifoldIngestor — deferring');
    // Graceful no-op: game works without the substrate
    return;
  }

  // ── ManifoldBus — lightweight pub/sub ──────────────────────────────
  const _h = new Map();
  const ManifoldBus = {
    emit(name, data) {
      (_h.get(name) || []).forEach(fn => fn(data));
      (_h.get('*') || []).forEach(fn => fn({ name, ...data }));
    },
    on(name, fn) {
      _h.set(name, [...(_h.get(name) || []), fn]);
      return () => _h.set(name, (_h.get(name) || []).filter(f => f !== fn));
    }
  };

  // ── Live game-state cache (updated by each manifold:state-update) ──
  const Cache = {
    level: 1,           maxLevel: 10,
    bricksRemaining: 0, totalBricks: 40,
    ballSpeed: 0.25,    maxBallSpeed: 1.375,
    playerCount: 1,
    comboCount: 0,      maxCombo: 8,
    tension: 0,         // running z from GameStateLens — master scalar
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 1 — GameStateLens: level_progress × brick_density → tension
  // ════════════════════════════════════════════════════════════════
  const GameStateLens = {
    focus(cache) {
      return MI.ingest(cache, {
        x: d => Math.min(1, d.level / Math.max(1, d.maxLevel)),
        y: d => {
          const destroyed = d.totalBricks - d.bricksRemaining;
          return Math.min(1, destroyed / Math.max(1, d.totalBricks));
        },
        label: 'arena-tension',
        meta: { lens: 'GameStateLens' }
      });
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 2 — PhysicsLens: ball_speed × tension → velocity_weight
  // Controls dynamic speed modulation — ball feels "heavier" in
  // high-tension arenas without changing the base trajectory.
  // ════════════════════════════════════════════════════════════════
  const PhysicsLens = {
    focus(ballData, tension) {
      const entity = MI.ingest(
        { speed: ballData.speed || 0, tension },
        {
          x: d => Math.min(1, d.speed / Cache.maxBallSpeed),
          y: d => 0.2 + d.tension * 0.8,   // floor weight at low tension
          label: 'velocity-weight',
          meta: { lens: 'PhysicsLens', ballId: ballData.id }
        }
      );
      // Emit so game.js can read velocity weight without polling
      window.dispatchEvent(new CustomEvent('manifold:physics', {
        detail: { ballId: ballData.id, velocityWeight: entity.manifold.z }
      }));
      return entity.manifold.z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 3 — GraphicsLens: ball_advance × threat → glow_intensity
  // "Advance" = normalised y-position of ball (0 = paddle, 1 = ceiling)
  // "Threat"  = fraction of bricks remaining in top two rows
  // ════════════════════════════════════════════════════════════════
  const GraphicsLens = {
    ARENA_HEIGHT: 50,   // matches manifold.game.json params.arena_height
    focus(ballData) {
      const entity = MI.ingest({
        advance: Math.min(1, Math.max(0, (ballData.posY || 0) / this.ARENA_HEIGHT)),
        threat: Math.min(1, (ballData.threatCount || 0) / 8),
      }, {
        x: 'advance',
        y: d => 0.15 + d.threat * 0.85,  // floor glow at zero threat
        label: 'glow-intensity',
        meta: { lens: 'GraphicsLens', ballId: ballData.id }
      });
      window.dispatchEvent(new CustomEvent('manifold:glow', {
        detail: { ballId: ballData.id, intensity: entity.manifold.z }
      }));
      return entity.manifold.z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 4 — AudioLens: event_impact × tension → sound_power
  // impact weights map game events to emotional magnitude [0,1]
  // ════════════════════════════════════════════════════════════════
  const AUDIO_WEIGHTS = {
    paddle_hit: 0.3, wall_hit: 0.15, brick_hit: 0.5,
    brick_destroy: 0.7, ball_lost: 0.9, level_clear: 1.0,
    powerup: 0.6, game_over: 1.0, launch: 0.25, combo: 0.8
  };
  const AudioLens = {
    focus(eventType, tension) {
      const entity = MI.ingest(
        { impact: AUDIO_WEIGHTS[eventType] || 0.1, tension },
        { x: 'impact', y: 'tension', label: 'sound-power', meta: { lens: 'AudioLens' } }
      );
      // Drive ManifoldAudio master gain if available
      if (window.ManifoldAudio?.masterGain && window.ManifoldAudio?.ctx) {
        const vol = 0.15 + entity.manifold.z * 0.75;
        window.ManifoldAudio.masterGain.gain.linearRampToValueAtTime(
          vol, window.ManifoldAudio.ctx.currentTime + 0.06
        );
      }
      return entity.manifold.z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // LENS 5 — ScoreLens: combo_factor × brick_value → score_bloom
  // z blooms the raw score multiplicatively; score = base * z
  // ════════════════════════════════════════════════════════════════
  const BRICK_VALUES = { red: 1.0, orange: 0.75, yellow: 0.5, green: 0.25 };
  const ScoreLens = {
    focus(brickColor, comboCount) {
      const entity = MI.ingest(
        {
          combo: Math.min(1, (comboCount || 0) / Cache.maxCombo),
          value: BRICK_VALUES[brickColor] || 0.25,
        },
        {
          x: 'combo',
          y: d => 0.25 + d.value * 0.75,  // floor score at low brick value
          label: 'score-bloom',
          meta: { lens: 'ScoreLens', brick: brickColor }
        }
      );
      return entity.manifold.z;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // MANIFOLD STATE LISTENER — keep Cache in sync with the game
  // ════════════════════════════════════════════════════════════════
  window.addEventListener('manifold:state-update', (e) => {
    const d = e.detail || {};
    if (d.level !== undefined) Cache.level = d.level;
    if (d.bricksRemaining !== undefined) Cache.bricksRemaining = d.bricksRemaining;
    if (d.totalBricks !== undefined) Cache.totalBricks = d.totalBricks;
    if (d.ballSpeed !== undefined) Cache.ballSpeed = d.ballSpeed;
    if (d.playerCount !== undefined) Cache.playerCount = d.playerCount;
    if (d.comboCount !== undefined) Cache.comboCount = d.comboCount;

    // Re-derive tension every state update
    const result = GameStateLens.focus(Cache);
    if (result) Cache.tension = result.manifold?.z ?? 0;

    ManifoldBus.emit('state-updated', { ...Cache });
  });

  // ════════════════════════════════════════════════════════════════
  // PUBLIC API — consumed by game.js via window.BBManifoldSubstrate
  // ════════════════════════════════════════════════════════════════
  const BBManifoldSubstrate = {
    /** Derive arena tension from current cache. Returns z ∈ [0,1]. */
    tension() { return Cache.tension; },

    /** Derive velocity weight for a ball. ballData = { id, speed, posY, threatCount } */
    velocityWeight(ballData) { return PhysicsLens.focus(ballData, Cache.tension); },

    /** Derive glow intensity for a ball. ballData = { id, posY, threatCount } */
    glowIntensity(ballData) { return GraphicsLens.focus(ballData); },

    /** Derive audio power for a game event. */
    soundPower(eventType) { return AudioLens.focus(eventType, Cache.tension); },

    /** Derive score bloom multiplier. Returns z ∈ [0,1]. Apply: score = base * (1 + z). */
    scoreBloom(brickColor, comboCount) { return ScoreLens.focus(brickColor, comboCount); },

    /** Update the cache and re-derive tension. Call on every game tick or state change. */
    update(patch) {
      Object.assign(Cache, patch);
      const result = GameStateLens.focus(Cache);
      if (result) Cache.tension = result.manifold?.z ?? 0;
      return Cache.tension;
    },

    on: ManifoldBus.on.bind(ManifoldBus),
    emit: ManifoldBus.emit.bind(ManifoldBus),
    cache: Cache,
  };

  window.BBManifoldSubstrate = BBManifoldSubstrate;

  // Announce readiness to the game
  window.dispatchEvent(new CustomEvent('manifold:substrate-ready', {
    detail: { game: 'brickbreaker3d', lenses: 5 }
  }));

})();
