/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 HIVE QUEEN MANIFOLD — BOSS W10+ DIMENSIONAL REPRESENTATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The Hive Queen is NOT stored as an object with properties.
 * She IS a manifold point. Every attribute — health state, weak-point
 * vulnerability, limb phase, glow intensity, aggression level, spawn rate —
 * is DERIVED from manifold geometry on demand.
 *
 * DIMENSIONAL LAYERS:
 *   Layer 1 — Spark:       seed (queenId, wave)
 *   Layer 2 — Mirror:      Schwarz Diamond field — symmetric structure
 *   Layer 3 — Relation:    z = x·y — threat coupling (health × proximity)
 *   Layer 4 — Form:        z = x·y² — weak-point vulnerability surface
 *   Layer 5 — Life:        time phase — limb oscillation, membrane pulse
 *   Layer 6 — Mind:        gradient ∇(z=xy) → aggression, target selection
 *   Layer 7 — Completion:  m = x·y·z — full queen consciousness scalar
 *
 * SCHWARZ DIAMOND ZERO-CROSSINGS = WEAK POINT LOCATIONS
 *   The 8 membrane sacs sit exactly where the Diamond field ≈ 0
 *   Damage multiplier is inverse of |field| — near-zero = critical hit zone
 *
 * USAGE:
 *   const queen = HiveQueenManifold.spawn(wave, position);
 *   HiveQueenManifold.update(queen, dt, playerPos);
 *   const lens = HiveQueenManifold.observe(queen);  // → all derived state
 *   HiveQueenManifold.applyDamage(queen, amount, hitPos);
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const HiveQueenManifold = (function () {

  // ── Manifold scale constant (matches SpaceManifold SCALE=2000) ──
  const SCALE = 2000;
  const K = (2 * Math.PI) / SCALE;

  // ── Queen dimensional archetype — manifold coordinates in phase-space ──
  // x = sovereign axis (size/power tier), y = hive axis (swarm complexity)
  // These are manifold coordinates, not world positions.
  const ARCHETYPE = { x: 4.8, y: 3.6, waveX: 0.09, waveY: 0.07 };

  // ── Base stats — all scaled via manifold derivation ──
  const BASE = {
    hull: 5000,   // hull units
    shields: 2500,   // shield units
    speed: 18,     // m/s — massive, slow
    spawnRate: 8.0,    // seconds between drone spawns
    weakPoints: 8,      // count — matches Schwarz Diamond 8-fold symmetry
    limbCount: 6,      // articulated limbs
    spireCount: 8,      // crown spires
    radius: 280,    // collision radius (3000m body, forced-scale = 280 units)
    scoreValue: 10000,  // score on kill
    waveHullScale: 300,    // hull added per wave beyond 10
    waveShieldScale: 150,    // shields added per wave beyond 10
  };

  // ── Schwarz Diamond surface ──
  function _diamond(x, y, z) {
    const u = x * K, v = y * K, w = z * K;
    return Math.cos(u) * Math.cos(v) * Math.cos(w)
      - Math.sin(u) * Math.sin(v) * Math.sin(w);
  }

  function _diamondGrad(x, y, z) {
    const u = x * K, v = y * K, w = z * K;
    const cu = Math.cos(u), su = Math.sin(u);
    const cv = Math.cos(v), sv = Math.sin(v);
    const cw = Math.cos(w), sw = Math.sin(w);
    return {
      x: (-su * cv * cw - cu * sv * sw) * K,
      y: (-cu * sv * cw - su * cv * sw) * K,
      z: (-cu * cv * sw - su * sv * cw) * K,
    };
  }

  // ── z = x·y — relation fold (threat coupling) ──
  function _zxy(x, y) { return x * y; }

  // ── z = x·y² — form surface (quadratic amplifier, weak-point shaping) ──
  function _zxy2(x, y) { return x * y * y; }

  // ── m = x·y·z — full consciousness scalar ──
  function _mxyz(x, y, z) { return x * y * z; }

  // ── Derive the 8 weak-point world positions from Schwarz Diamond symmetry ──
  // Weak points sit at the 8 octants where cos(u)cos(v)cos(w) = sin(u)sin(v)sin(w)
  // i.e. where tan(u) = tan(v) = tan(w) = ±1 → u,v,w = ±π/4
  // We map these to the queen's body surface at her current position/orientation.
  function _deriveWeakPoints(queenPos, bodyRadius) {
    const pts = [];
    const signs = [-1, 1];
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          // Diamond zero-crossing in manifold space: u=v=w=±π/4
          // Map to surface offset on queen body
          const nx = sx * 0.577; // normalized direction (1/√3)
          const ny = sy * 0.577;
          const nz = sz * 0.577;
          pts.push({
            wx: queenPos.x + nx * bodyRadius * 0.85,
            wy: queenPos.y + ny * bodyRadius * 0.5,  // flatten on Y (oblate body)
            wz: queenPos.z + nz * bodyRadius * 0.85,
            nx, ny, nz,   // surface normal (outward)
          });
        }
      }
    }
    return pts; // 8 points, one per octant
  }

  // ── Derive limb oscillation phase for each of the 6 limbs ──
  // Limb i oscillates at a phase offset derived from z=xy applied to
  // limb index and current time, modulated by the queen's aggression.
  function _limbPhase(limbIndex, t, aggressionZ) {
    const baseFreq = 0.4 + aggressionZ * 0.6;  // 0.4→1.0 Hz based on z=xy threat
    const offset = (limbIndex / 6) * 2 * Math.PI; // 60° apart
    return Math.sin(t * baseFreq * 2 * Math.PI + offset);
  }

  // ── Derive membrane sac pulse intensity from form surface z=xy² ──
  function _membranePulse(t, hullRatio, formZ) {
    const urgency = 1.0 - hullRatio;             // 0 (full health) → 1 (dying)
    const freq = 0.3 + urgency * 1.4 + formZ * 0.5;
    return 0.4 + 0.6 * Math.abs(Math.sin(t * freq * 2 * Math.PI));
  }

  // ── Derive emissive glow color from queen state ──
  // Idle: blue-green #00FFAA (z=xy baseline)
  // Enraged: red #FF2200 (when hull < 30%, gradient magnitude spikes)
  // Spawning: amber #FFAA00 (during drone spawn window)
  function _glowColor(hullRatio, isSpawning, gradMag) {
    if (hullRatio < 0.3 || gradMag > 2.5) return 0xFF2200;  // critical/enraged
    if (isSpawning) return 0xFFAA00;  // spawning amber
    return 0x00FFAA;                                           // idle blue-green
  }

  // ── Derive spawn rate — faster as hull drops (z=xy² curvature increases) ──
  function _spawnCooldown(hullRatio, formZ) {
    // formZ encodes form-layer curvature; near zero = high vulnerability
    // spawn rate accelerates as queen weakens
    const desperation = (1.0 - hullRatio) * (1.0 + Math.abs(formZ) * 0.3);
    return Math.max(2.0, BASE.spawnRate * (1.0 - desperation * 0.65));
  }

  // ── Derive damage multiplier at a hit position (weak-point system) ──
  // Uses Schwarz Diamond: near zero-crossings → high multiplier
  // Normal hits: 1.0x, Weak-point hits: up to 3.5x
  function _damageMultiplier(hitPos, queenPos) {
    const rx = (hitPos.x - queenPos.x);
    const ry = (hitPos.y - queenPos.y);
    const rz = (hitPos.z - queenPos.z);
    // Map relative position into manifold coords
    const fieldVal = _diamond(
      queenPos.x + rx * 0.01,
      queenPos.y + ry * 0.01,
      queenPos.z + rz * 0.01
    );
    // |field| near 0 = zero-crossing = membrane sac = weak point
    const proximity = 1.0 - Math.min(1.0, Math.abs(fieldVal) * 4.0);
    return 1.0 + proximity * 2.5;  // 1.0x → 3.5x
  }

  // ── Full derivation — called each frame, zero stored state beyond coords ──
  function _derive(queen, t, playerPos) {
    const w = queen.wave - 10;  // wave offset from queen's introduction
    const ax = ARCHETYPE.x + Math.max(0, w) * ARCHETYPE.waveX;
    const ay = ARCHETYPE.y + Math.max(0, w) * ARCHETYPE.waveY;

    // Layer 3: z = x·y — threat coupling
    const z = _zxy(ax, ay);

    // Layer 4: z = x·y² — form surface
    const formZ = _zxy2(ax, ay);

    // Schwarz Diamond field at manifold coordinates
    const field = _diamond(ax * 420, ay * 420, z * 420);
    const grad = _diamondGrad(ax * 420, ay * 420, z * 420);
    const gradMag = Math.sqrt(grad.x * grad.x + grad.y * grad.y + grad.z * grad.z);

    // Layer 7: m = x·y·z — consciousness scalar
    const m = _mxyz(ax, ay, z);

    const hullRatio = Math.max(0, queen.hull / queen.maxHull);
    const shieldRatio = Math.max(0, queen.shields / queen.maxShields);
    const isSpawning = queen._spawnTimer <= 0.5;

    // Proximity to player (drives aggression)
    const dx = playerPos.x - queen.position.x;
    const dy = playerPos.y - queen.position.y;
    const dz = playerPos.z - queen.position.z;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // proximity [0→1]: 1 = right on top of queen, 0 = far away
    const proximity = Math.max(0, 1.0 - distToPlayer / 6000);

    // Layer 6: Mind — aggression = gradient magnitude × proximity × damage taken
    const aggression = Math.min(1.0, gradMag * 0.4 * (1.0 + proximity) * (1.5 - hullRatio));

    return {
      // Manifold coordinates
      coords: { x: ax, y: ay, z, formZ, m, field, gradMag },

      // Derived stats
      hull: queen.hull,
      maxHull: queen.maxHull,
      shields: queen.shields,
      maxShields: queen.maxShields,
      hullRatio,
      shieldRatio,

      // Layer 5 — Life: animation
      limbPhases: Array.from({ length: BASE.limbCount }, (_, i) =>
        _limbPhase(i, t, z)
      ),
      membranePulse: _membranePulse(t, hullRatio, formZ),
      spireGlow: 0.3 + 0.7 * Math.abs(Math.sin(t * 0.8 + field)),

      // Layer 6 — Mind
      aggression,
      targetPlayerBias: 0.3 + aggression * 0.5,   // 0.3→0.8 (vs. baseship default 0.2)
      spawnCooldown: _spawnCooldown(hullRatio, formZ),

      // Visual
      glowColor: _glowColor(hullRatio, isSpawning, gradMag),
      isEnraged: hullRatio < 0.3,
      isSpawning,

      // Spatial
      weakPoints: _deriveWeakPoints(queen.position, BASE.radius),
      distToPlayer,
      proximity,

      // Phase derived from Diamond surface
      phase: Math.atan2(ay * K, ax * K),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a new Hive Queen entity at world position, scaled for wave.
   * Returns an entity-compatible object that plugs into core.js state.entities.
   */
  function spawn(wave, position) {
    const w = Math.max(0, wave - 10);
    const maxHull = BASE.hull + w * BASE.waveHullScale;
    const maxShields = BASE.shields + w * BASE.waveShieldScale;

    const queen = {
      // Entity-compatible fields (matches core.js Entity expectations)
      id: 'hive-queen-' + Date.now(),
      type: 'hive-queen',
      position: { x: position.x, y: position.y, z: position.z },
      velocity: { x: 0, y: 0, z: 0 },
      hull: maxHull,
      maxHull,
      shields: maxShields,
      maxShields,
      maxSpeed: BASE.speed,
      radius: BASE.radius,
      scoreValue: BASE.scoreValue,
      alive: true,
      wave,

      // Manifold-managed timers (minimal stored state)
      _spawnTimer: 0,        // counts down to next drone spawn
      _aggressionLatch: 0,   // time since last phase-shift
      _lastObserved: null,   // cached observe() result (invalidated each frame)
    };

    // Stamp onto SpaceManifold if available
    if (window.SpaceManifold) SpaceManifold.stamp(queen);

    return queen;
  }

  /**
   * Update queen state each frame.
   * dt: deltaTime seconds. playerPos: {x,y,z}
   * Returns the observation lens (same as observe()).
   */
  function update(queen, dt, playerPos) {
    if (!queen.alive) return null;

    const t = performance.now() * 0.001;
    const lens = _derive(queen, t, playerPos);
    queen._lastObserved = lens;

    // Tick spawn timer
    queen._spawnTimer -= dt;

    // Move slowly toward baseship (target is set externally)
    if (queen._target) {
      const tx = queen._target.x - queen.position.x;
      const ty = queen._target.y - queen.position.y;
      const tz = queen._target.z - queen.position.z;
      const td = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (td > 1) {
        const spd = BASE.speed * (1.0 + lens.aggression * 0.4);
        queen.velocity.x = (tx / td) * spd;
        queen.velocity.y = (ty / td) * spd;
        queen.velocity.z = (tz / td) * spd;
      }
    }
    queen.position.x += queen.velocity.x * dt;
    queen.position.y += queen.velocity.y * dt;
    queen.position.z += queen.velocity.z * dt;

    return lens;
  }

  /**
   * Observe — derive all queen properties from manifold. Zero mutation.
   * Call this to read state for rendering/HUD/AI without side effects.
   */
  function observe(queen) {
    if (!queen.alive) return null;
    if (queen._lastObserved) return queen._lastObserved;
    const t = performance.now() * 0.001;
    const pp = queen._lastPlayerPos || queen.position;
    return _derive(queen, t, pp);
  }

  /**
   * Apply damage to queen, accounting for weak-point multiplier.
   * hitPos: {x,y,z} world position of the hit (from projectile).
   * Returns { absorbed, penetrated, multiplier, weakPointHit }
   */
  function applyDamage(queen, rawDamage, hitPos) {
    if (!queen.alive) return null;

    const mult = hitPos ? _damageMultiplier(hitPos, queen.position) : 1.0;
    const effective = rawDamage * mult;
    const weakPointHit = mult > 2.0;

    let absorbed = 0, penetrated = 0;
    if (queen.shields > 0) {
      absorbed = Math.min(queen.shields, effective);
      queen.shields = Math.max(0, queen.shields - effective);
      penetrated = Math.max(0, effective - absorbed);
    } else {
      penetrated = effective;
    }
    queen.hull = Math.max(0, queen.hull - penetrated);
    if (queen.hull <= 0) queen.alive = false;

    return { absorbed, penetrated, multiplier: mult, weakPointHit, effective };
  }

  /**
   * Check if spawn timer has elapsed and reset it.
   * Returns true if queen should spawn a drone this frame.
   */
  function checkSpawn(queen) {
    if (!queen.alive || !queen._lastObserved) return false;
    if (queen._spawnTimer <= 0) {
      queen._spawnTimer = queen._lastObserved.spawnCooldown;
      return true;
    }
    return false;
  }

  /**
   * Derive the MANIFOLD_ARCHETYPES entry for core.js deriveCombatProfile.
   * Keeps queen stats in the same dimensional coordinate system as all
   * other enemy types — just at much higher x/y values.
   */
  function archetypeForWave(wave) {
    const w = Math.max(0, wave - 10);
    return {
      x: ARCHETYPE.x + w * ARCHETYPE.waveX,
      y: ARCHETYPE.y + w * ARCHETYPE.waveY,
      waveX: ARCHETYPE.waveX,
      waveY: ARCHETYPE.waveY,
      hullBase: BASE.hull,
      hullWave: BASE.waveHullScale,
      hullField: 120,
      speedBase: BASE.speed,
      speedWave: 0.5,
      speedField: 2,
      shieldsBase: BASE.shields,
      shieldsWave: BASE.waveShieldScale,
      shieldsField: 80,
    };
  }

  return { spawn, update, observe, applyDamage, checkSpawn, archetypeForWave };

})();

if (typeof module !== 'undefined') module.exports = HiveQueenManifold;
