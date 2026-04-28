/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 SPACE COMBAT MANIFOLD — SCHWARZ DIAMOND HELIX
 * Lens on the unified Manifold — region "starfighter"
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SURFACE: Schwarz Diamond
 *   cos(x)cos(y)cos(z) − sin(x)sin(y)sin(z) = 0
 *
 * This is NO LONGER a standalone manifold. It delegates to the unified
 * Manifold (window.Manifold) using region "starfighter". Same API.
 * Games that loaded SpaceManifold directly still work — zero breakage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SpaceManifold = (function () {

  const REGION = 'starfighter';
  const SCALE = 2000;
  const K = (2 * Math.PI) / SCALE;

  // Ensure region exists on the unified manifold
  const M = window.Manifold;
  if (M) M.region(REGION, { cellSize: 1000 });

  // ════════════════════════════════════════════════════════════════════════════
  // SCHWARZ DIAMOND — game-specific surface math (kept for stamping)
  // ════════════════════════════════════════════════════════════════════════════

  function diamond(x, y, z) {
    const u = x * K, v = y * K, w = z * K;
    return Math.cos(u) * Math.cos(v) * Math.cos(w)
      - Math.sin(u) * Math.sin(v) * Math.sin(w);
  }

  function diamondGrad(x, y, z) {
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

  function helixPhase(x, y) {
    return Math.atan2(y * K, x * K);
  }

  function manifoldCoord(pos) {
    const mx = pos.x * K;
    const my = pos.y * K;
    return { u: mx, v: my, w: mx * my * my }; // z = xy²
  }

  function stamp(e) {
    const p = e.position;
    const u = p.x * K, v = p.y * K, wz = p.z * K;
    // z = xy² (quadratic projection), m = xyz (full coupling)
    const w = u * v * v;
    const m = u * v * wz;
    e._m = {
      u, v, w,
      m,                                             // manifold value: xyz
      field: Math.cos(u) * Math.cos(v) * Math.cos(wz)
        - Math.sin(u) * Math.sin(v) * Math.sin(wz), // Schwartz Diamond
      phase: Math.atan2(v, u),
    };
    return e._m;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DIMENSIONAL REGISTRY — all game constants as manifold dimensions
  //
  // Instead of hardcoded numbers scattered across substrates, every tunable
  // value lives here as a named dimension. Substrates read via dim(name).
  // Values can be overridden at runtime via setDim() or derived dynamically
  // via manifold lenses — enabling adaptive difficulty, dynamic balancing,
  // and hot-tuning without touching substrate code.
  //
  // Convention: dot-separated namespace (player.maxSpeed, weapon.laser.damage)
  // ════════════════════════════════════════════════════════════════════════════

  const _dims = {
    // ── Player Flight ──
    'player.maxSpeed': 250,    // base thrust m/s
    'player.afterburnerSpeed': 600,    // afterburner max m/s
    'player.boostSpeed': 800,    // boost max m/s
    'player.hyperdriveSpeed': 2500,  // hyperdrive max m/s
    'player.hyperdriveFuelCost': 40, // fuel units to engage
    'player.hyperdriveBurn': 12,     // fuel units/second while active
    'player.hyperdriveCooldown': 15, // seconds cooldown after disengage
    'player.hyperdriveSpoolTime': 2.0, // seconds to spool up
    'player.hull': 100,    // starting hull
    'player.shields': 100,    // starting shields
    'player.torpedoes': 8,      // torpedo magazine
    'player.fuel': 100,    // fuel capacity
    'player.boostDuration': 3.0,    // seconds
    'player.boostFuelCost': 25,     // fuel units per boost
    'player.boostCooldown': 8.0,    // seconds after boost expires
    'player.afterburnerBurn': 5,      // fuel units/second
    'player.fuelRegen': 2,      // fuel units/second when idle
    'player.strafeSpeed': 120,     // lateral m/s
    'player.faDamping': 2.0,    // FA-ON velocity→0 seconds
    'player.faLerp': 0.08,   // FA-ON smooth factor
    'player.pitchDamp': 0.9,    // per-frame pitch decay
    'player.yawDamp': 0.9,    // per-frame yaw decay
    'player.rollDamp': 0.9,    // per-frame roll decay
    'player.strafeHDamp': 0.8,    // per-frame horizontal strafe decay
    'player.strafeVDamp': 0.8,    // per-frame vertical strafe decay
    'player.radius': 8,     // collision radius (~F-16 class, 16m diameter)

    // ── Baseship ──
    'baseship.hull': 5000,
    'baseship.shields': 2000,
    'baseship.radius': 160,    // aircraft carrier class (~320m)
    'baseship.repairHull': 1000,   // hull restored between waves
    'baseship.repairShields': 500,    // shields restored between waves

    // ── Weapons ──
    'weapon.laser.speed': 1600,    // m/s projectile velocity
    'weapon.laser.damage': 15,     // per hit
    'weapon.laser.maxAge': 1.0,    // seconds (range = speed × age)
    'weapon.laser.fireRate': 6,      // rounds per second
    'weapon.laser.radius': 4,      // collision radius
    'weapon.laser.fuelCost': 0.3,    // fuel per shot
    'weapon.gun.speed': 1200,      // m/s — slower but more spread
    'weapon.gun.damage': 6,       // low damage per round
    'weapon.gun.maxAge': 1.8,     // shorter range than laser
    'weapon.gun.fireRate': 18,    // rounds per second (rapid)
    'weapon.gun.radius': 3,    // smaller projectile
    'weapon.gun.fuelCost': 0.15,  // fuel per round (cheap per shot, adds up)
    'weapon.gun.spread': 0.04,   // radians max spread per axis
    'weapon.pulse.speed': 0,      // no projectile — spherical burst
    'weapon.pulse.damage': 0,     // no damage — disables instead
    'weapon.pulse.range': 400,    // effective radius meters
    'weapon.pulse.stunDuration': 3.0,  // seconds target disabled
    'weapon.pulse.fireRate': 0.25,     // 1 shot per 4 seconds
    'weapon.pulse.fuelCost': 20,  // expensive — strategic use
    'weapon.torpedo.speed': 400,    // initial m/s
    'weapon.torpedo.damage': 80,     // per hit
    'weapon.torpedo.maxAge': 20,     // seconds
    'weapon.torpedo.accelTime': 1.5,    // seconds to reach max speed
    'weapon.torpedo.radius': 8,      // collision radius
    'weapon.torpedo.fuelCost': 5,    // fuel per torpedo launch

    // ── Entity Caps ──
    'cap.lasers': 60,
    'cap.machinegun': 80,
    'cap.plasma': 20,
    'cap.torpedoes': 12,

    // ── Entity Stats ── (alien ships 3× human — larger alien race)
    'entity.interceptor.radius': 24,    // 3× human fighter (~48m)
    'entity.bomber.radius': 60,         // 3× human bomber (~120m)
    'entity.alien-baseship.radius': 1050, // 3× human carrier (~2100m)
    'entity.predator.radius': 120,      // 3× large hunter (~240m)
    'entity.dreadnought.radius': 900,   // alien capital (~1800m)
    'entity.alien-base.radius': 5000,   // massive hive structure (~10km)
    'entity.tanker.hull': 5000,
    'entity.tanker.shields': 2000,
    'entity.tanker.maxSpeed': 120,
    'entity.tanker.radius': 40,         // support craft (~80m)
    'entity.tanker.fuelRepairRate': 30,
    'entity.tanker.hullRepairRate': 5,
    'entity.tanker.shieldRepairRate': 15,
    'entity.tanker.dockRange': 200,
    'entity.tanker.orbitDist': 5000,      // safe orbit distance from combat center
    'entity.tanker.dockDuration': 5,      // seconds to resupply
    'entity.medic.hull': 9999,
    'entity.medic.shields': 9999,
    'entity.medic.maxSpeed': 150,
    'entity.medic.radius': 45,          // medical frigate (~90m)
    'entity.medic.hullRepairRate': 12,
    'entity.medic.shieldRepairRate': 20,
    'entity.medic.dockRange': 220,
    'entity.medic.orbitDist': 5600,       // safe orbit distance from combat center
    'entity.medic.dockDuration': 6,       // seconds to repair

    // Support call eligibility thresholds
    'support.tanker.fuelThreshold': 25,   // fuel % below which tanker call is valid
    'support.tanker.hullThreshold': 60,   // hull % below which tanker call is valid
    'support.tanker.shieldThreshold': 30, // shield % — needs BOTH hull+shield low
    'support.medic.hullThreshold': 50,    // hull % below which medic call is valid
    'support.medic.shieldThreshold': 10,  // shields % below which medic call is valid (dire)
    'support.autopilotSpeed': 360,        // m/s cruise speed to support ship
    'support.returnSpeed': 300,           // m/s cruise speed back to combat

    // ── Target Lock ── (acquire-then-hold; enemy can shake via evasion)
    'targeting.acquireDot': 0.993,        // cos(~7°): fresh acquisition cone
    'targeting.refreshDot': 0.993,        // re-centering on target resets hold timer
    'targeting.breakDot': 0.866,          // cos(~30°): lock breaks if target leaves this cone
    'targeting.holdRange': 5000,          // m: lock breaks beyond this distance
    'targeting.holdTime': 5.0,            // s: max hold after acquisition without refresh
    'targeting.shakeRate': 8.0,           // s of timer added per unit angular slip (target evading)
    'entity.egg.radius': 18,    // 3× human scale
    'entity.egg.hull': 30,
    'entity.egg.hatchTime': 4,
    'entity.egg.hatchRandom': 3,
    'entity.youngling.radius': 12,  // 3× human scale
    'entity.youngling.hull': 15,
    'entity.youngling.maxSpeed': 400,
    'entity.youngling.boreRate': 0.15,
    'entity.youngling.damageRate': 3,

    // ── Enemy Cooldowns ──
    'enemy.fireCooldown': 1.5,    // seconds between shots
    'enemy.baseship.fireCooldown': 4.0, // alien baseship torpedo interval
    'enemy.predator.plasmaCooldown': 3.0,
    'enemy.bomber.bombInterval': 6.0,
    'enemy.dreadnought.turretInterval': 2.0,
    'enemy.dreadnought.beamCooldown': 15,

    // ── Enemy AI ──
    'enemy.turnRate': 2.0,         // base turn rate (rad/s)
    'enemy.fireRange': 1600,        // base fire range (meters)
    'enemy.heavyRange': 6000,      // dreadnought heavy torp range
    'enemy.heavyCooldown': 15,     // dreadnought heavy torp cooldown (s)

    // ── Score ──
    'score.enemy': 100,
    'score.interceptor': 250,
    'score.bomber': 300,
    'score.predator': 500,
    'score.dreadnought': 2500,
    'score.victory': 5000,
    'score.friendlyKill': -50,

    // ── Damage ──
    'damage.eggSplash': 20,
    'damage.collision': 50,                // legacy flat ram damage (fallback if mass missing)
    // Kinetic ramming: dmg_to_X = kineticK · mass(other) · |Δv|² , clamped & gated.
    // Calibrated so a player (mass 10) head-on with an interceptor (mass 10) at
    // 500 m/s closing speed ≈ 25 dmg each side; player (10) ramming a baseship
    // (mass 2000) at 400 m/s ≈ 320 dmg to the player (lethal), 1.6 dmg to the
    // baseship — i.e. you bounce off carriers, but a fighter trade is fair.
    'damage.kineticK': 1e-5,
    'damage.kineticMinDvSq': 5000,         // |Δv|² threshold (~70 m/s) below which scrapes do nothing
    'damage.kineticMaxPerHit': 500,        // hard cap so freak edge cases never one-shot capital ships

    // ── Mass (kg-ish, only ratios matter for kinetic damage) ──
    'mass.player': 10,
    'mass.wingman': 10,
    'mass.interceptor': 10,
    'mass.bomber': 30,
    'mass.predator': 80,
    'mass.dreadnought': 800,
    'mass.alien-baseship': 1500,
    'mass.baseship': 2000,
    'mass.mothership': 5000,
    'mass.alien-base': 3000,
    'mass.hive': 3000,
    'mass.tanker': 1500,
    'mass.medic': 800,
    'mass.rescue': 400,
    'mass.science-ship': 600,
    'mass.station': 4000,
    'mass.egg': 5,
    'mass.youngling': 8,
    'mass.pickup': 1,
    'mass.default': 20,

    // ── Timing ──
    'timing.launch': 8.0,    // launch sequence seconds
    'timing.landing': 5.0,    // landing sequence seconds
    'timing.comm': 8.0,    // random comm interval
    'timing.respawn': 7.0,    // respawn countdown
    'timing.entrySpeed': 200,    // speed exiting bay into combat

    // ── Radar ──
    'radar.range': 15000,   // detection range meters
    'radar.sweepPeriod': 4.0,    // seconds per full rotation
    'radar.beamWidth': 12,       // degrees — angular detection band
    'radar.persistence': 0.85,   // blip opacity retention over sweep period

    // ── Lives ──
    'lives.max': 3,

    // ── Arena ──
    'arena.radius': 25000,

    // ── Hive ──
    'hive.hull': 5000,

    // ── Deploy — manifold asset tiers ──
    // Tier 0: preload (visible at spawn), Tier 1: lazy (first encounter), Tier 2: deferred (late waves)
    'deploy.tier0.budget': 170000000,  // ~160MB budget for preloaded models
    'deploy.tier1.triggerWave': 1,     // wave at which tier 1 lazy-loads begin
    'deploy.tier2.triggerWave': 5,     // wave at which tier 2 deferred models stream
    'deploy.bundle.cacheSeconds': 86400, // 24h cache for JS bundle
    'deploy.gzip.level': 9,           // max compression for pre-gzip
  };

  // Runtime overrides layer — setDim writes here, dim reads overlay first
  const _overrides = {};

  /**
   * Read a dimension value. Checks overrides first, then defaults.
   * This is the ONLY way substrates should access game constants.
   */
  function dim(name) {
    if (name in _overrides) return _overrides[name];
    if (name in _dims) return _dims[name];
    return undefined;
  }

  /**
   * Override a dimension at runtime. Does not mutate defaults.
   * Use for adaptive difficulty, powerups, debug tuning, etc.
   */
  function setDim(name, value) {
    _overrides[name] = value;
    // Also register as a manifold lens for cross-system visibility
    if (M) M.lens('dim:' + name, () => value);
  }

  /**
   * Reset a dimension override back to its default.
   */
  function resetDim(name) {
    delete _overrides[name];
  }

  /**
   * Get all dimension names and current values (for debug/telemetry).
   */
  function allDims() {
    const result = {};
    for (const k in _dims) result[k] = dim(k);
    for (const k in _overrides) result[k] = _overrides[k];
    return result;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 🍴 DINING PHILOSOPHERS — delegated to unified Manifold
  //
  // The fork table lives in the unified Manifold (js/manifold.js) so every
  // app and game shares the same race condition eliminator. No duplication.
  // Fork grant/revoke/reap happen automatically in Manifold.place/remove/reap.
  // This is just a pass-through reference for game-side code.
  // ════════════════════════════════════════════════════════════════════════════

  const DiningPhilosophers = M ? M.DiningPhilosophers : null;

  // ════════════════════════════════════════════════════════════════════════════
  // DELEGATED API — all calls route through unified Manifold
  // ════════════════════════════════════════════════════════════════════════════

  function place(entity) {
    if (M) M.place(entity, REGION);
    // Stamp for game-side use (fork already granted by unified Manifold.place)
    stamp(entity);
  }

  function remove(id) {
    // Fork revoked automatically by unified Manifold.remove
    if (M) M.remove(id);
  }

  function evolve(dt) {
    if (M) M.evolve(dt, REGION);
  }

  function reap() {
    // Fork reaping happens automatically in unified Manifold.reap
    if (M) M.reap(REGION);
  }

  function observe(id) {
    return M ? M.observe(id) : null;
  }

  function observeAll() {
    return M ? M.observeAll(REGION) : [];
  }

  function observeByType(type) {
    return M ? M.observeByType(type, REGION) : [];
  }

  function observeRelative(observer, target) {
    const invQuat = observer.quaternion.clone().invert();
    return target.position.clone().sub(observer.position).applyQuaternion(invQuat);
  }

  function detectCollisions() {
    return M ? M.detectCollisions(REGION) : [];
  }

  function distance(a, b) {
    return M ? M.distance(a, b) : 0;
  }

  function distanceSq(a, b) {
    return M ? M.distanceSq(a, b) : 0;
  }

  return {
    place,
    remove,
    evolve,
    reap,
    observe,
    observeAll,
    observeByType,
    observeRelative,
    detectCollisions,
    distance,
    distanceSq,
    stamp,
    diamond,
    diamondGrad,
    helixPhase,
    manifoldCoord,
    dim,
    setDim,
    resetDim,
    allDims,
    DiningPhilosophers,
    SCALE,
    K,
  };

})();

window.SpaceManifold = SpaceManifold;

/**
 * ANPC System — Starfighter
 * ─────────────────────────────────────────────────────────────────
 * ButterflyFX™ ANPC Implementation
 * Two-surface manifold: z=xy (linear), z=xy² (asymmetric escalation)
 * OCEAN personality model, 8-state combat state machine, 3-tier phrase pools,
 * composite string assembly, morale with contagion, disposition tracking.
 *
 * Document #1: General ANPC Guideline
 * Document #2: Starfighter ANPC Guideline
 */

const SFANPC = (function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  // §1 — CONSTANTS & ENUMERATIONS
  // ══════════════════════════════════════════════════════════════════

  const COMBAT_STATES = {
    PATROL: 'patrol',
    ALERT: 'alert',
    ENGAGED: 'engaged',
    EVASIVE: 'evasive',
    DAMAGED: 'damaged',
    RETREATING: 'retreating',
    DISABLED: 'disabled',
    DESTROYED: 'destroyed',
  };

  const CHANNELS = {
    SQUADRON: 'ch-sqd',
    FLEET: 'ch-flt',
    PRIVATE: 'ch-pvt',
    ENEMY: 'ch-enm',
  };

  const ROE = {
    FREE: 'weapons-free',
    TIGHT: 'weapons-tight',
    HOLD: 'weapons-hold',
  };

  const DIFFICULTY = {
    EASY: 'easy',
    NORMAL: 'normal',
    HARD: 'hard',
    VETERAN: 'veteran',
  };

  // ══════════════════════════════════════════════════════════════════
  // §2 — SCENARIO VECTOR SYSTEM
  // ══════════════════════════════════════════════════════════════════

  // Scenario vector: [Threat, Opportunity, Ambiguity, SocialPressure, TimePressure]
  const MISSION_TEMPLATES = {
    patrol: [0.2, 0.3, 0.5, 0.2, 0.1],
    escort: [0.4, 0.2, 0.3, 0.6, 0.3],
    assault: [0.7, 0.6, 0.2, 0.4, 0.5],
    defense: [0.6, 0.2, 0.3, 0.7, 0.7],
    recon: [0.3, 0.5, 0.7, 0.1, 0.2],
    boss: [0.9, 0.4, 0.1, 0.5, 0.8],
  };

  // Dynamic event modifiers: [dT, dO, dA, dS, dTP]
  const EVENT_MODIFIERS = {
    new_contacts: [+0.1, 0, +0.2, 0, 0],
    contacts_hostile: [+0.3, 0, -0.2, +0.1, +0.2],
    ambush_detected: [+0.4, 0, -0.3, +0.1, +0.3],
    ally_destroyed: [+0.2, -0.1, 0, +0.2, +0.1],
    enemy_destroyed: [-0.1, +0.2, -0.1, 0, -0.05],
    hull_critical: [+0.1, -0.2, 0, +0.1, +0.3],
    base_critical: [+0.3, -0.1, 0, +0.4, +0.4],
    reinforcements: [-0.2, +0.3, -0.1, -0.1, -0.1],
    boss_spawn: [+0.4, +0.2, -0.2, +0.2, +0.3],
    objective_complete: [-0.3, +0.1, -0.2, -0.2, -0.3],
  };

  class ScenarioVector {
    constructor(template = 'patrol') {
      this.raw = [...(MISSION_TEMPLATES[template] || MISSION_TEMPLATES.patrol)];
      this.smoothed = [...this.raw];
      this.decay = 0.85; // EMA decay factor
      this.rateLimit = 0.4; // max change per second
      this._lastUpdate = 0;
    }

    applyEvent(eventName) {
      const mod = EVENT_MODIFIERS[eventName];
      if (!mod) return;
      for (let i = 0; i < 5; i++) {
        this.raw[i] = Math.max(0, Math.min(1, this.raw[i] + mod[i]));
      }
    }

    update(dt) {
      // EMA smoothing: smoothed = decay * smoothed + (1-decay) * raw
      for (let i = 0; i < 5; i++) {
        const target = this.raw[i];
        const diff = target - this.smoothed[i];
        const maxDelta = this.rateLimit * dt;
        const clamped = Math.abs(diff) > maxDelta ? Math.sign(diff) * maxDelta : diff;
        this.smoothed[i] += clamped * (1 - this.decay) + diff * (1 - this.decay);
        this.smoothed[i] = Math.max(0, Math.min(1, this.smoothed[i]));
      }
    }

    get threat() { return this.smoothed[0]; }
    get opportunity() { return this.smoothed[1]; }
    get ambiguity() { return this.smoothed[2]; }
    get socialPressure() { return this.smoothed[3]; }
    get timePressure() { return this.smoothed[4]; }

    reset(template = 'patrol') {
      this.raw = [...(MISSION_TEMPLATES[template] || MISSION_TEMPLATES.patrol)];
      this.smoothed = [...this.raw];
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §3 — MANIFOLD DECISION PIPELINE
  // ══════════════════════════════════════════════════════════════════

  /**
   * Linear manifold: z = x * y
   * Used for proportional response (communication, tactical decisions)
   */
  function manifoldLinear(x, y) {
    return Math.max(0, Math.min(1, x * y));
  }

  /**
   * Asymmetric manifold: z = x * y²
   * Used for escalation (aggression, weapon selection, panic)
   */
  function manifoldAsymmetric(x, y) {
    return Math.max(0, Math.min(1, x * y * y));
  }

  /**
   * Compute manifold inputs from personality + scenario
   * x = personality-driven base impulse
   * y = scenario-driven environmental intensity
   */
  function computeManifoldXY(anpc, scenario) {
    // x derives from personality: base aggression = 1.0 - Agreeableness
    // Modified by Extraversion (amplifies) and Conscientiousness (dampens impulse)
    const p = anpc.personality;
    if (!p) return { x: 0.5, y: 0.5 };
    const baseAggression = 1.0 - p.A;
    const extraversionBoost = (p.E - 0.5) * 0.2;
    const conscientiousnessControl = (p.C - 0.5) * -0.15;
    let x = baseAggression + extraversionBoost + conscientiousnessControl;

    // y derives from scenario: weighted combination of vector components
    // Threat and TimePressure drive urgency; Opportunity opens action space
    if (!scenario) return { x: Math.max(0, Math.min(1, x)), y: 0.5 };
    let y = (scenario.threat || 0) * 0.4 + (scenario.opportunity || 0) * 0.3 +
      (scenario.timePressure || 0) * 0.2 + (scenario.socialPressure || 0) * 0.1;

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  // ══════════════════════════════════════════════════════════════════
  // §4 — COMBAT STATE MACHINE
  // ══════════════════════════════════════════════════════════════════

  // Transition table: [fromState][condition] → toState
  const STATE_TRANSITIONS = {
    [COMBAT_STATES.PATROL]: {
      contacts_detected: COMBAT_STATES.ALERT,
      taking_fire: COMBAT_STATES.ENGAGED,
      heavy_damage: COMBAT_STATES.DAMAGED,
    },
    [COMBAT_STATES.ALERT]: {
      hostiles_confirmed: COMBAT_STATES.ENGAGED,
      contacts_cleared: COMBAT_STATES.PATROL,
      heavy_damage: COMBAT_STATES.DAMAGED,
    },
    [COMBAT_STATES.ENGAGED]: {
      taking_heavy_fire: COMBAT_STATES.EVASIVE,
      heavy_damage: COMBAT_STATES.DAMAGED,
      hostiles_cleared: COMBAT_STATES.PATROL,
      morale_broken: COMBAT_STATES.RETREATING,
    },
    [COMBAT_STATES.EVASIVE]: {
      threat_clear: COMBAT_STATES.ENGAGED,
      heavy_damage: COMBAT_STATES.DAMAGED,
      morale_broken: COMBAT_STATES.RETREATING,
    },
    [COMBAT_STATES.DAMAGED]: {
      stabilized: COMBAT_STATES.RETREATING,
      systems_failed: COMBAT_STATES.DISABLED,
      destroyed: COMBAT_STATES.DESTROYED,
    },
    [COMBAT_STATES.RETREATING]: {
      reached_safety: COMBAT_STATES.PATROL,
      intercepted: COMBAT_STATES.ENGAGED,
      heavy_damage: COMBAT_STATES.DISABLED,
    },
    [COMBAT_STATES.DISABLED]: {
      destroyed: COMBAT_STATES.DESTROYED,
    },
    [COMBAT_STATES.DESTROYED]: {},
  };

  // ══════════════════════════════════════════════════════════════════
  // §5 — MORALE SYSTEM
  // ══════════════════════════════════════════════════════════════════

  const MORALE_MODIFIERS = {
    kill_scored: +0.10,
    ally_kill: +0.05,
    ally_destroyed: -0.15,
    taking_fire: -0.02, // per second
    heavy_damage: -0.10,
    outnumbered: -0.05, // per second when outnumbered
    reinforcements: +0.15,
    leader_down: -0.25,
    player_saves: +0.15,
    order_received: +0.05,
    victory: +0.20,
  };

  // Contagion factor: how much one ANPC's morale affects nearby allies
  const MORALE_CONTAGION = 0.3;

  // ══════════════════════════════════════════════════════════════════
  // §6 — TONE VECTOR SYSTEM
  // ══════════════════════════════════════════════════════════════════

  /**
   * Tone vector: [Formality, Warmth, Humor, Aggression]
   * Derived from OCEAN personality × manifold surfaces.
   * z_linear modulates warmth/formality (proportional response).
   * z_asymmetric modulates aggression/humor (escalation response).
   * Personality sets the base; manifold amplifies or dampens.
   */
  function computeToneVector(anpc) {
    const p = anpc.personality;
    if (!p) return { formality: 0.5, warmth: 0.5, humor: 0.3, aggression: 0.3 };
    const moraleNorm = anpc.morale || 0.5;
    const m = anpc.getManifoldValues(_scenario);

    // Formality: high C + low E → formal; dampened by z_linear (high intensity → less formal)
    const formality = Math.max(0, Math.min(1,
      (p.C * 0.6 + (1 - p.E) * 0.4) * (1 - m.linear * 0.3)));

    // Warmth: high A + high E → warm; amplified by low z_asymmetric (calm = warmer)
    const warmth = Math.max(0, Math.min(1,
      (p.A * 0.5 + p.E * 0.3 + moraleNorm * 0.2) * (1 - m.asymmetric * 0.4)));

    // Humor: high O + high E + high morale; suppressed by z_asymmetric (escalation kills humor)
    const humor = Math.max(0, Math.min(1,
      (p.O * 0.3 + p.E * 0.3 + moraleNorm * 0.3) * (1 - m.asymmetric * 0.6)));

    // Aggression: low A + manifold escalation; z_asymmetric directly amplifies aggression
    const aggression = Math.max(0, Math.min(1,
      (1 - p.A) * 0.4 + m.asymmetric * 0.4 + (1 - moraleNorm) * 0.2));

    return { formality, warmth, humor, aggression };
  }

  /**
   * Compute urgency via manifold z-surfaces.
   * z_linear (z=xy) = proportional response intensity
   * z_asymmetric (z=xy²) = escalation/panic intensity
   * Urgency = weighted blend of both surfaces + combat state offset.
   *
   * This is THE core manifold decision: personality × scenario → intensity.
   */
  function computeUrgency(anpc, scenario) {
    const m = anpc.getManifoldValues(scenario);

    // Blend: 60% linear (proportional) + 40% asymmetric (escalation)
    let urgency = m.linear * 0.6 + m.asymmetric * 0.4;

    // Combat state adds manifold-weighted offset (not raw addition)
    // Higher z amplifies the state contribution — manifold modulates everything
    const stateWeight = {
      [COMBAT_STATES.PATROL]: 0,
      [COMBAT_STATES.ALERT]: 0.08,
      [COMBAT_STATES.ENGAGED]: 0.15,
      [COMBAT_STATES.EVASIVE]: 0.25,
      [COMBAT_STATES.DAMAGED]: 0.30,
      [COMBAT_STATES.RETREATING]: 0.20,
      [COMBAT_STATES.DISABLED]: 0.40,
      [COMBAT_STATES.DESTROYED]: 0,
    };
    urgency += (stateWeight[anpc.combatState] || 0) * (1 + m.asymmetric);

    // Hull crisis amplified by asymmetric surface (z=xy² → panic escalation)
    if (anpc.hull < 0.25) urgency += 0.15 * (1 + m.asymmetric);
    else if (anpc.hull < 0.5) urgency += 0.08 * (1 + m.linear);

    return Math.max(0, Math.min(1, urgency));
  }

  // ══════════════════════════════════════════════════════════════════
  // §7 — 3-TIER PHRASE POOL SYSTEM
  // ══════════════════════════════════════════════════════════════════

  // Universal Pool (Document #1 §8) — generic fallbacks
  const UNIVERSAL_POOL = {
    combat_engage: [
      { id: 'UNI-CE-001', template: 'Engaging {target}.', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-CE-002', template: 'Weapons free on {target}.', urgMin: 0.4, urgMax: 0.8 },
      { id: 'UNI-CE-003', template: 'In range. Firing.', urgMin: 0.3, urgMax: 0.6 },
      { id: 'UNI-CE-004', template: 'Fox {foxType}, {target}.', urgMin: 0.5, urgMax: 0.9 },
    ],
    kill_confirm: [
      { id: 'UNI-KC-001', template: 'Splash one {target}.', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-KC-002', template: '{target} destroyed.', urgMin: 0.2, urgMax: 0.6 },
      { id: 'UNI-KC-003', template: 'Good kill.', urgMin: 0.2, urgMax: 0.5 },
    ],
    damage_report: [
      { id: 'UNI-DR-001', template: 'Taking fire.', urgMin: 0.4, urgMax: 0.8 },
      { id: 'UNI-DR-002', template: 'Hit. Hull at {hullPct}%.', urgMin: 0.5, urgMax: 0.9 },
      { id: 'UNI-DR-003', template: 'Shields gone.', urgMin: 0.6, urgMax: 1.0 },
    ],
    tactical_coord: [
      { id: 'UNI-TC-001', template: 'Break {direction}!', urgMin: 0.6, urgMax: 1.0 },
      { id: 'UNI-TC-002', template: 'On your six.', urgMin: 0.5, urgMax: 0.9 },
      { id: 'UNI-TC-003', template: 'Form up.', urgMin: 0.2, urgMax: 0.5 },
      { id: 'UNI-TC-004', template: 'Covering your {direction}.', urgMin: 0.3, urgMax: 0.7 },
    ],
    morale_banter: [
      { id: 'UNI-MB-001', template: 'Good hunting.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-MB-002', template: 'Stay sharp.', urgMin: 0.1, urgMax: 0.4 },
      { id: 'UNI-MB-003', template: 'Watch your spacing.', urgMin: 0.1, urgMax: 0.4 },
    ],
    mission_comm: [
      { id: 'UNI-MC-001', template: 'Copy that.', urgMin: 0.0, urgMax: 0.5 },
      { id: 'UNI-MC-002', template: 'Acknowledged.', urgMin: 0.0, urgMax: 0.6 },
      { id: 'UNI-MC-003', template: 'Roger.', urgMin: 0.0, urgMax: 0.5 },
    ],
    emergency: [
      { id: 'UNI-EM-001', template: 'Mayday, mayday!', urgMin: 0.8, urgMax: 1.0 },
      { id: 'UNI-EM-002', template: 'Going down!', urgMin: 0.9, urgMax: 1.0 },
      { id: 'UNI-EM-003', template: 'Eject, eject!', urgMin: 0.9, urgMax: 1.0 },
    ],
    launch_prep: [
      { id: 'UNI-LP-001', template: 'All boards green. Wave {wave} standing by.', urgMin: 0.0, urgMax: 0.4 },
      { id: 'UNI-LP-002', template: 'Pre-flight complete. Ready to launch.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-LP-003', template: 'Launch checklist nominal. {callsign}, you are go.', urgMin: 0.0, urgMax: 0.4 },
    ],
    hazard_warning: [
      { id: 'UNI-HW-001', template: '{callsign}, {hazard}! Evasive action!', urgMin: 0.6, urgMax: 1.0 },
      { id: 'UNI-HW-002', template: '{hazard}. Take action immediately.', urgMin: 0.5, urgMax: 0.9 },
      { id: 'UNI-HW-003', template: 'Warning — {hazard}!', urgMin: 0.7, urgMax: 1.0 },
    ],
    status_update: [
      { id: 'UNI-SU-001', template: '{callsign}, {status}. Standing by.', urgMin: 0.0, urgMax: 0.4 },
      { id: 'UNI-SU-002', template: '{status}. All stations nominal.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-SU-003', template: 'Confirmed. {status}.', urgMin: 0.0, urgMax: 0.5 },
    ],
    support_ops: [
      { id: 'UNI-SO-001', template: '{supportShip} dispatched. {status}.', urgMin: 0.2, urgMax: 0.6 },
      { id: 'UNI-SO-002', template: 'Support authorized. {supportShip} en route.', urgMin: 0.2, urgMax: 0.5 },
      { id: 'UNI-SO-003', template: '{supportShip} returning to station. {status}.', urgMin: 0.1, urgMax: 0.4 },
      { id: 'UNI-SO-004', template: '{callsign}, {supportShip} request denied. Conditions not met.', urgMin: 0.3, urgMax: 0.6 },
    ],
    sector_clear: [
      { id: 'UNI-SC-001', template: 'Sector clear. {kills} kills. Return to base.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-SC-002', template: 'All hostiles neutralized. Well done.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-SC-003', template: 'Wave {wave} complete. {kills} confirmed kills. Rearming.', urgMin: 0.0, urgMax: 0.3 },
    ],
    launch_go: [
      { id: 'UNI-LG-001', template: 'Launch! Launch! Launch!', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-LG-002', template: 'All ahead — punch it!', urgMin: 0.3, urgMax: 0.7 },
      { id: 'UNI-LG-003', template: 'Clear the rail — full military!', urgMin: 0.3, urgMax: 0.7 },
    ],
    launch_sendoff: [
      { id: 'UNI-LS-001', template: 'Good hunting.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-LS-002', template: 'Bring them home.', urgMin: 0.0, urgMax: 0.3 },
      { id: 'UNI-LS-003', template: 'The Resolute is counting on you.', urgMin: 0.0, urgMax: 0.3 },
    ],
    threat_brief: [
      { id: 'UNI-TB-001', template: 'Threat assessment: {threats}. {watchPhrase}.', urgMin: 0.2, urgMax: 0.6 },
      { id: 'UNI-TB-002', template: 'Scope shows {threats}. Stay sharp.', urgMin: 0.2, urgMax: 0.5 },
      { id: 'UNI-TB-003', template: 'Intel reports {threats} in sector.', urgMin: 0.2, urgMax: 0.6 },
    ],
  };

  // Title Pool — role-specific phrases (§7.1)
  const TITLE_POOLS = {
    'SF-WING': { // Wingman
      combat_engage: [
        { id: 'SF-CE-001', template: 'Tally {count}! {target} at {bearing}.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CE-002', template: 'Bogey at {bearing}, {distance}m. {engaging}.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-CE-003', template: 'Guns, guns, guns!', urgMin: 0.5, urgMax: 0.9 },
        { id: 'SF-CE-004', template: 'Fox {foxType}!', urgMin: 0.5, urgMax: 0.9 },
        { id: 'SF-CE-005', template: '{callsign}, bogey at {clock} o\'clock {altitude}, {distance} meters, over.', urgMin: 0.3, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'SF-KC-001', template: 'Splash one! {remaining} remaining.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-KC-002', template: 'That\'s a kill. {remaining} left.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-KC-003', template: 'He\'s down. Next.', urgMin: 0.3, urgMax: 0.6 },
      ],
      damage_report: [
        { id: 'SF-DR-001', template: 'Hit! Hull {hullPct}%. Still in it.', urgMin: 0.4, urgMax: 0.8 },
        { id: 'SF-DR-002', template: 'Taking hits. Shields {shieldStatus}.', urgMin: 0.5, urgMax: 0.8 },
        { id: 'SF-DR-003', template: 'Heavy damage. Might need to break off.', urgMin: 0.7, urgMax: 1.0 },
      ],
      tactical_coord: [
        { id: 'SF-TC-001', template: 'I\'ve got your {position}. You\'re clear.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-TC-002', template: 'Break {direction}! I\'ll cover.', urgMin: 0.6, urgMax: 1.0 },
        { id: 'SF-TC-003', template: 'On your wing.', urgMin: 0.1, urgMax: 0.4 },
        { id: 'SF-TC-004', template: 'Forming on your {position}.', urgMin: 0.1, urgMax: 0.4 },
      ],
      morale_banter: [
        { id: 'SF-MB-001', template: 'Nice flying, {playerCallsign}.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-MB-002', template: 'That\'s how it\'s done.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-MB-003', template: 'Keep it up.', urgMin: 0.0, urgMax: 0.3 },
      ],
    },
    'SF-CMDOP': { // Command Base Operator
      combat_engage: [
        { id: 'SF-CO-CE-001', template: '{count} contacts bearing {bearing}, range {distance}.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'SF-CO-CE-002', template: 'New signatures on scope. {count} at bearing {bearing}.', urgMin: 0.2, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'SF-CO-KC-001', template: 'Confirm kill. {remaining} hostiles on scope.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-CO-KC-002', template: 'Signal lost. Well done. {remaining} remain.', urgMin: 0.2, urgMax: 0.5 },
      ],
      damage_report: [
        { id: 'SF-CO-DR-001', template: '{callsign}, telemetry shows hull at {hullPct}%. Recommend RTB.', urgMin: 0.5, urgMax: 0.9 },
        { id: 'SF-CO-DR-002', template: 'Warning — {callsign} hull integrity dropping. {hullPct}%.', urgMin: 0.6, urgMax: 1.0 },
      ],
      tactical_coord: [
        { id: 'SF-CO-TC-001', template: 'All ships, form {formation}. Acknowledge.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-CO-TC-002', template: '{callsign}, vector {bearing} for intercept.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CO-TC-003', template: 'Hostiles clear. Reform on flight leader.', urgMin: 0.1, urgMax: 0.4 },
      ],
      mission_comm: [
        { id: 'SF-CO-MC-001', template: 'All ships, {callsign} actual. {missionBrief}. {callsign} out.', urgMin: 0.1, urgMax: 0.4 },
        { id: 'SF-CO-MC-002', template: 'Intel update: {intel}. Adjust accordingly.', urgMin: 0.2, urgMax: 0.6 },
      ],
      emergency: [
        { id: 'SF-CO-EM-001', template: '{callsign}, get out of there! {reason}!', urgMin: 0.8, urgMax: 1.0 },
        { id: 'SF-CO-EM-002', template: 'Emergency — all ships break {direction}! {reason}!', urgMin: 0.9, urgMax: 1.0 },
      ],
      launch_prep: [
        { id: 'SF-CO-LP-001', template: 'Pilot {pilotSlot} of {maxLives}, wave {wave}. {missionBrief}', urgMin: 0.0, urgMax: 0.4 },
        { id: 'SF-CO-LP-002', template: 'Wave {wave}. {missionBrief} {callsign}, you are cleared hot.', urgMin: 0.1, urgMax: 0.5 },
      ],
      launch_go: [
        { id: 'SF-CO-LG-001', template: 'Launch! Launch! Launch!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CO-LG-002', template: 'All ahead — punch it!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'SF-CO-LG-003', template: 'Catapult engaged — godspeed!', urgMin: 0.3, urgMax: 0.7 },
      ],
      launch_sendoff: [
        { id: 'SF-CO-LS-001', template: 'Good hunting, {callsign}.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-CO-LS-002', template: 'Bring them home.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-CO-LS-003', template: 'The Resolute is counting on you.', urgMin: 0.0, urgMax: 0.3 },
      ],
      sector_clear: [
        { id: 'SF-CO-SC-001', template: 'Wave {wave} complete. {kills} confirmed. Outstanding work.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-CO-SC-002', template: 'All contacts neutralized. {kills} kills. Return to base.', urgMin: 0.0, urgMax: 0.3 },
      ],
      hazard_warning: [
        { id: 'SF-CO-HW-001', template: '{callsign}, {hazard}! All hands brace!', urgMin: 0.7, urgMax: 1.0 },
        { id: 'SF-CO-HW-002', template: 'CIC — {hazard}! {callsign}, take evasive action!', urgMin: 0.7, urgMax: 1.0 },
      ],
      support_ops: [
        { id: 'SF-CO-SO-001', template: '{supportShip} dispatched. {status}. Engaging autopilot.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-CO-SO-002', template: '{callsign}, support request denied. {reason}. Keep fighting.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-CO-SO-003', template: 'Support complete. Controls released. Good hunting.', urgMin: 0.1, urgMax: 0.4 },
      ],
      status_update: [
        { id: 'SF-CO-SU-001', template: '{callsign}, {status}. Standing by for orders.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'SF-CO-SU-002', template: 'Dock confirmed. {status}. Score {score}.', urgMin: 0.0, urgMax: 0.3 },
      ],
      threat_brief: [
        { id: 'SF-CO-TB-001', template: 'Threat intel: {threats}. {tacticalAdvice}. Stay sharp.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'SF-CO-TB-002', template: 'Scope shows {threats}. Recommend {tacticalAdvice}.', urgMin: 0.2, urgMax: 0.5 },
      ],
    },
    'SF-EACE': { // Enemy Ace
      combat_engage: [
        { id: 'SF-EA-CE-001', template: '...Interesting.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-EA-CE-002', template: 'Let\'s see what you\'re made of.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'SF-EA-CE-003', template: 'You fly well. It won\'t save you.', urgMin: 0.3, urgMax: 0.7 },
      ],
      kill_confirm: [
        { id: 'SF-EA-KC-001', template: 'One less.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'SF-EA-KC-002', template: 'They always break the same way.', urgMin: 0.2, urgMax: 0.5 },
      ],
      damage_report: [
        { id: 'SF-EA-DR-001', template: '...Not bad.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'SF-EA-DR-002', template: 'You\'re the first to land that.', urgMin: 0.5, urgMax: 0.8 },
      ],
      morale_banter: [
        { id: 'SF-EA-MB-001', template: 'You\'re better than the others.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'SF-EA-MB-002', template: 'Almost impressive.', urgMin: 0.0, urgMax: 0.4 },
      ],
      emergency: [
        { id: 'SF-EA-EM-001', template: '...You\'re the first. Well fought.', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
    'SF-SQLDR': { // Squadron Leader
      tactical_coord: [
        { id: 'SF-SL-TC-001', template: 'All wings, {formation} formation. Execute.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'SF-SL-TC-002', template: '{callsign}, break and engage. I\'ll coordinate.', urgMin: 0.4, urgMax: 0.8 },
        { id: 'SF-SL-TC-003', template: 'Hostiles cleared. Good work, everyone. Reform.', urgMin: 0.1, urgMax: 0.3 },
      ],
      combat_engage: [
        { id: 'SF-SL-CE-001', template: 'Weapons free. Engage at will.', urgMin: 0.4, urgMax: 0.8 },
        { id: 'SF-SL-CE-002', template: 'All ships — fight\'s on. Give them hell.', urgMin: 0.5, urgMax: 0.9 },
      ],
      morale_banter: [
        { id: 'SF-SL-MB-001', template: 'Outstanding work, {callsign}. Keep it up.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'SF-SL-MB-002', template: 'That\'s the spirit. Stay aggressive.', urgMin: 0.0, urgMax: 0.4 },
      ],
    },
  };

  // Character Pool — individual ANPC overrides (§7.2)
  const CHARACTER_POOLS = {
    'Hotshot': {
      combat_engage: [
        { id: 'HS-CE-001', template: 'Watch this!', urgMin: 0.4, urgMax: 0.9 },
        { id: 'HS-CE-002', template: 'Here I come!', urgMin: 0.4, urgMax: 0.8 },
        { id: 'HS-CE-003', template: 'Target locked — eat this!', urgMin: 0.5, urgMax: 0.9 },
      ],
      kill_confirm: [
        { id: 'HS-KC-001', template: 'Boom! That\'s how it\'s done! {killCount} and counting!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'HS-KC-002', template: 'Another one bites the dust! Add it to the board!', urgMin: 0.3, urgMax: 0.6 },
        { id: 'HS-KC-003', template: 'Too easy! Who\'s next?', urgMin: 0.2, urgMax: 0.5 },
      ],
      damage_report: [
        { id: 'HS-DR-001', template: 'Ow! That tickled. Hull {hullPct}%.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'HS-DR-002', template: 'Alright, that one hurt. Still in this.', urgMin: 0.5, urgMax: 0.8 },
        { id: 'HS-DR-003', template: 'They got lucky. Won\'t happen again.', urgMin: 0.4, urgMax: 0.7 },
      ],
      morale_banter: [
        { id: 'HS-MB-001', template: 'Ha! Who buys drinks tonight?', urgMin: 0.0, urgMax: 0.3 },
        { id: 'HS-MB-002', template: 'Is that all they\'ve got?', urgMin: 0.0, urgMax: 0.3 },
        { id: 'HS-MB-003', template: 'Keep up, {playerCallsign}! Don\'t let me show you up!', urgMin: 0.0, urgMax: 0.3 },
        { id: 'HS-MB-004', template: 'My sister would\'ve loved this fight.', urgMin: 0.0, urgMax: 0.2 },
      ],
      tactical_coord: [
        { id: 'HS-TC-001', template: 'On your left! I got you!', urgMin: 0.3, urgMax: 0.7 },
        { id: 'HS-TC-002', template: 'Break right — I\'ll handle this one!', urgMin: 0.5, urgMax: 0.9 },
      ],
      emergency: [
        { id: 'HS-EM-001', template: 'No no no — not today! Punching out!', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
    'Frostbite': {
      combat_engage: [
        { id: 'FB-CE-001', template: 'Engaging.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'FB-CE-002', template: 'Target acquired.', urgMin: 0.3, urgMax: 0.7 },
        { id: 'FB-CE-003', template: 'Firing.', urgMin: 0.4, urgMax: 0.8 },
      ],
      kill_confirm: [
        { id: 'FB-KC-001', template: 'Kill confirmed.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'FB-KC-002', template: 'Down.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'FB-KC-003', template: 'Next.', urgMin: 0.2, urgMax: 0.4 },
      ],
      damage_report: [
        { id: 'FB-DR-001', template: 'Shields gone.', urgMin: 0.5, urgMax: 0.8 },
        { id: 'FB-DR-002', template: 'Hull {hullPct}%. Functional.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'FB-DR-003', template: 'Damage sustained. Continuing.', urgMin: 0.4, urgMax: 0.7 },
      ],
      morale_banter: [
        { id: 'FB-MB-001', template: 'Adequate.', urgMin: 0.0, urgMax: 0.2 },
        { id: 'FB-MB-002', template: '...Noted.', urgMin: 0.0, urgMax: 0.2 },
      ],
      tactical_coord: [
        { id: 'FB-TC-001', template: 'Covering.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'FB-TC-002', template: 'Right side clear.', urgMin: 0.2, urgMax: 0.4 },
      ],
      emergency: [
        { id: 'FB-EM-001', template: 'Critical. Withdrawing.', urgMin: 0.8, urgMax: 1.0 },
      ],
    },
    'Lighthouse': {
      combat_engage: [
        { id: 'LH-CE-001', template: '{count} hostile contacts, bearing {bearing}, contact in {eta} seconds.', urgMin: 0.2, urgMax: 0.6 },
        { id: 'LH-CE-002', template: 'Lighthouse confirms — {count} hostiles, combat rating {rating}. No additional on long-range.', urgMin: 0.2, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'LH-KC-001', template: 'Signal confirmed lost. {remaining} on scope. Well done.', urgMin: 0.2, urgMax: 0.5 },
      ],
      tactical_coord: [
        { id: 'LH-TC-001', template: 'Recommend vector {bearing} for optimal engagement.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'LH-TC-002', template: 'All contacts neutralized. Sector clear. Return to base.', urgMin: 0.1, urgMax: 0.3 },
      ],
      mission_comm: [
        { id: 'LH-MC-001', template: 'All ships, this is Lighthouse. {missionBrief}. Lighthouse out.', urgMin: 0.1, urgMax: 0.4 },
        { id: 'LH-MC-002', template: 'Lighthouse to patrol group — {intel}. Good work. Lighthouse out.', urgMin: 0.1, urgMax: 0.3 },
      ],
      morale_banter: [
        { id: 'LH-MB-001', template: '{playerCallsign}, well flown. The squadron is lucky to have you.', urgMin: 0.0, urgMax: 0.2 },
      ],
      emergency: [
        { id: 'LH-EM-001', template: '{callsign}, get out NOW! {reason}!', urgMin: 0.9, urgMax: 1.0 },
      ],
      launch_prep: [
        { id: 'LH-LP-001', template: '{callsign}, all systems green. Launching wave {wave}. Lighthouse standing by.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'LH-LP-002', template: 'Catapult charged. {callsign}, you are cleared for launch.', urgMin: 0.0, urgMax: 0.3 },
      ],
      status_update: [
        { id: 'LH-SU-001', template: '{callsign}, {status}. Lighthouse monitors all bands. You\'re in good hands.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'LH-SU-002', template: 'Docking confirmed. {status}. Welcome home, {callsign}.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'LH-SU-003', template: 'Decontamination complete. {status}. All clear.', urgMin: 0.0, urgMax: 0.3 },
        { id: 'LH-SU-004', template: 'Wave {wave} standing by. {status}. Launch when ready, {callsign}.', urgMin: 0.0, urgMax: 0.3 },
      ],
      support_ops: [
        { id: 'LH-SO-001', template: '{supportShip} dispatched. {status}. Autopilot engaged.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'LH-SO-002', template: '{callsign}, {supportShip} request denied. {reason}. Keep fighting, you\'re doing well.', urgMin: 0.3, urgMax: 0.5 },
        { id: 'LH-SO-003', template: 'Support complete. Controls released. Good hunting, {callsign}.', urgMin: 0.1, urgMax: 0.3 },
      ],
      hazard_warning: [
        { id: 'LH-HW-001', template: '{callsign}, {hazard}! Lighthouse concurs — break off immediately!', urgMin: 0.7, urgMax: 1.0 },
      ],
    },
    'Nightshade': {
      combat_engage: [
        { id: 'NS-CE-001', template: '...Interesting.', urgMin: 0.2, urgMax: 0.5 },
        { id: 'NS-CE-002', template: 'Let\'s see what you\'re made of.', urgMin: 0.3, urgMax: 0.6 },
        { id: 'NS-CE-003', template: 'You have my attention. That\'s rarely a good thing.', urgMin: 0.3, urgMax: 0.6 },
      ],
      kill_confirm: [
        { id: 'NS-KC-001', template: 'Predictable.', urgMin: 0.2, urgMax: 0.4 },
        { id: 'NS-KC-002', template: 'They always break the same way.', urgMin: 0.2, urgMax: 0.4 },
      ],
      damage_report: [
        { id: 'NS-DR-001', template: '...Not bad.', urgMin: 0.4, urgMax: 0.7 },
        { id: 'NS-DR-002', template: 'You\'re the first to land that in a long time.', urgMin: 0.5, urgMax: 0.8 },
      ],
      morale_banter: [
        { id: 'NS-MB-001', template: 'You\'re better than the others. That makes this... interesting.', urgMin: 0.0, urgMax: 0.4 },
        { id: 'NS-MB-002', template: 'Keep flying like that. I\'d hate for this to be boring.', urgMin: 0.0, urgMax: 0.4 },
      ],
      emergency: [
        { id: 'NS-EM-001', template: '...You\'re the first. Well fought.', urgMin: 0.9, urgMax: 1.0 },
      ],
    },
  };

  // ══════════════════════════════════════════════════════════════════
  // §8 — COMPOSITE STRING ASSEMBLY
  // ══════════════════════════════════════════════════════════════════

  // Opener stems by urgency range
  const OPENERS = {
    low: ['', '', ''],  // low urgency: often no opener
    mid: ['{callsign}, ', 'Heads up — ', 'Be advised — ', ''],
    high: ['{callsign}! ', 'Warning! ', '', 'Break! '],
    crit: ['MAYDAY — ', '{callsign}! ', ''],
  };

  // Modifiers by tone
  const MODIFIERS = {
    formal: [' Over.', ' Acknowledge.', ' Copy?', ''],
    warm: [' Stay safe.', ' We\'ve got you.', ' You\'re doing great.', ''],
    humor: [' Easy money.', ' Almost too easy.', ''],
    aggro: [' No mercy.', ' Make them pay.', ' End them.', ''],
    neutral: ['', '', ''],
  };

  /**
   * Assemble a composite string from phrase template + context.
   * Structure: [Opener] + Core + [Modifier]
   * All selection driven by manifold z-surfaces:
   *   - Opener intensity: z_asymmetric (escalation surface)
   *   - Modifier tone: z_linear (proportional surface) × personality tone vector
   */
  function assemblePhrase(phrase, context, anpc, urgency) {
    // Get manifold values for this ANPC
    let zLinear = urgency, zAsymmetric = urgency;
    if (anpc) {
      const m = anpc.getManifoldValues(_scenario);
      zLinear = m.linear;
      zAsymmetric = m.asymmetric;
    }

    // Opener: driven by z_asymmetric (escalation surface = panic/urgency)
    let opener = '';
    if (zAsymmetric >= 0.6 || urgency >= 0.8) opener = _pick(OPENERS.crit);
    else if (zAsymmetric >= 0.35 || urgency >= 0.5) opener = _pick(OPENERS.high);
    else if (zAsymmetric >= 0.15 || urgency >= 0.25) opener = _pick(OPENERS.mid);
    else opener = _pick(OPENERS.low);

    // Core: fill template variables
    let core = phrase.template;
    core = _fillTemplate(core, context);

    // Modifier: driven by z_linear (proportional surface) × tone vector
    // Higher z_linear intensifies the dominant tone axis
    let modifier = '';
    if (anpc) {
      const tone = computeToneVector(anpc) || { formality: 0.5, warmth: 0.5, humor: 0.3, aggression: 0.3 };
      // Scale tone axes by z_linear — manifold modulates which tone dominates
      const scaledHumor = tone.humor * (1 + zLinear);
      const scaledWarmth = tone.warmth * (1 + zLinear * 0.5);
      const scaledAggro = tone.aggression * (1 + zLinear);
      const scaledFormal = tone.formality * (1 + zLinear * 0.3);

      // Only add modifier when z_asymmetric is low (not in escalation)
      if (zAsymmetric < 0.4) {
        if (scaledHumor > 0.8) modifier = _pick(MODIFIERS.humor);
        else if (scaledWarmth > 0.7) modifier = _pick(MODIFIERS.warm);
        else if (scaledAggro > 0.8) modifier = _pick(MODIFIERS.aggro);
        else if (scaledFormal > 0.7) modifier = _pick(MODIFIERS.formal);
        else modifier = _pick(MODIFIERS.neutral);
      }
    }

    // Substitute callsign in opener
    opener = opener.replace('{callsign}', context.playerCallsign || 'Pilot');

    return (opener + core + modifier).trim();
  }

  function _fillTemplate(template, ctx) {
    return template
      .replace(/{target}/g, ctx.target || 'hostile')
      .replace(/{count}/g, ctx.count || '?')
      .replace(/{bearing}/g, ctx.bearing || '000')
      .replace(/{distance}/g, ctx.distance || '?')
      .replace(/{hullPct}/g, ctx.hullPct || '?')
      .replace(/{shieldStatus}/g, ctx.shieldStatus || 'unknown')
      .replace(/{remaining}/g, ctx.remaining || '?')
      .replace(/{direction}/g, ctx.direction || 'left')
      .replace(/{position}/g, ctx.position || 'wing')
      .replace(/{callsign}/g, ctx.callsign || 'Flight')
      .replace(/{playerCallsign}/g, ctx.playerCallsign || 'Pilot')
      .replace(/{formation}/g, ctx.formation || 'V-Formation')
      .replace(/{clock}/g, ctx.clock || '12')
      .replace(/{altitude}/g, ctx.altitude || 'level')
      .replace(/{foxType}/g, ctx.foxType || '2')
      .replace(/{engaging}/g, ctx.engaging || 'Engaging')
      .replace(/{killCount}/g, ctx.killCount || '?')
      .replace(/{rating}/g, ctx.rating || 'unknown')
      .replace(/{eta}/g, ctx.eta || '?')
      .replace(/{missionBrief}/g, ctx.missionBrief || 'standard patrol')
      .replace(/{intel}/g, ctx.intel || 'no change')
      .replace(/{reason}/g, ctx.reason || 'danger');
  }

  // ══════════════════════════════════════════════════════════════════
  // §9 — ANPC ENTITY
  // ══════════════════════════════════════════════════════════════════

  class ANPC {
    constructor(schema) {
      // Base identity (Document #1 §3)
      this.id = schema.id;
      this.displayName = schema.displayName;
      this.callsign = schema.callsign;
      this.role = schema.role;
      this.voiceProfile = schema.voiceProfile || 'default';
      this.backstory = schema.backstory || '';

      // OCEAN personality vector (Document #1 §4)
      this.personality = {
        O: schema.personality[0], // Openness
        C: schema.personality[1], // Conscientiousness
        E: schema.personality[2], // Extraversion
        A: schema.personality[3], // Agreeableness
        N: schema.personality[4], // Neuroticism
      };

      // Starfighter extended fields (Doc #2 §3.1)
      this.shipClass = schema.shipClass || 'interceptor';
      this.squadronId = schema.squadronId || 'SQ-01';
      this.combatRating = schema.combatRating || 0.5;
      this.weaponLoadout = schema.weaponLoadout || ['WPN-LAS'];
      this.flightHours = schema.flightHours || 0;
      this.killCount = schema.killCount || 0;
      this.loyaltyScore = schema.loyaltyScore || null;
      this.damageThreshold = schema.damageThreshold || 0.35;
      this.preferredTactic = schema.preferredTactic || 'balanced';
      this.formationPosition = schema.formationPosition || 'free';

      // Manifold parameters
      this.adrenalineSpike = schema.adrenalineSpike || 0.15;
      this.fatigueResistance = schema.fatigueResistance || 0.5;
      this.moraleFloor = schema.moraleFloor || 0.15;

      // Runtime state
      this.combatState = COMBAT_STATES.PATROL;
      this.morale = 0.7; // baseline morale
      this.hull = 1.0;
      this.shields = 1.0;
      this.disposition = schema.disposition || 0.5; // toward player
      this.adrenaline = 0; // decays over time
      this.fatigue = 0;
      this.missionKills = 0;

      // Communication state
      this.lastCommTime = 0;
      this.commCooldown = 0;
      this.lastPhraseIds = []; // avoid immediate repeats

      // Alive/active
      this.active = true;
      this.faction = schema.faction || 'allied'; // allied | enemy
    }

    // ── State transitions ──
    transition(condition) {
      const transitions = STATE_TRANSITIONS[this.combatState];
      if (transitions && transitions[condition]) {
        const newState = transitions[condition];
        if (newState !== this.combatState) {
          const oldState = this.combatState;
          this.combatState = newState;
          return { from: oldState, to: newState };
        }
      }
      return null;
    }

    // ── Morale ──
    adjustMorale(delta) {
      this.morale = Math.max(this.moraleFloor, Math.min(1, this.morale + delta));
      if (this.morale <= this.moraleFloor + 0.05) {
        this.transition('morale_broken');
      }
    }

    // ── Manifold lookup ──
    getManifoldValues(scenario) {
      const { x, y } = computeManifoldXY(this, scenario);
      // Apply adrenaline spike to x
      const xBoosted = Math.min(1, x + this.adrenaline);
      return {
        x: xBoosted,
        y,
        linear: manifoldLinear(xBoosted, y),
        asymmetric: manifoldAsymmetric(xBoosted, y),
      };
    }

    // ── Weapon selection via manifold z-ranges (Doc #2 §5.3) ──
    selectWeapon(scenario) {
      const m = this.getManifoldValues(scenario);
      const z = m.asymmetric; // use escalation surface for weapon choice
      if (z < 0.15) return 'WPN-LAS'; // Lasers — probing
      if (z < 0.35) return 'WPN-LAS'; // Lasers — sustained
      if (z < 0.55) return 'WPN-SCT'; // Scatter Shot
      if (z < 0.75) return 'WPN-PTN'; // Proton Torpedoes
      return 'WPN-EMP'; // EMP Burst — maximum escalation
    }

    // ── Communication frequency (manifold-driven) ──
    // Doc #2 §6.3: comm frequency driven by manifold z, not raw thresholds
    canSpeak(now, urgency, scenario) {
      if (!this.active) return false;
      // Use manifold linear surface to modulate comm interval
      // High z = high personality×scenario product = more talkative
      const m = scenario ? this.getManifoldValues(scenario) : null;
      const zLinear = m ? m.linear : urgency; // fallback to urgency if no scenario
      // Extraversion directly modulates: high-E characters speak more often
      const extraversionMod = 1.0 - (this.personality.E - 0.5) * 0.4;
      // Base interval: inverse of z_linear. z=0 → 18s, z=1 → 1.5s
      const minInterval = Math.max(1.5, (1 - zLinear) * 18) * extraversionMod;
      return (now - this.lastCommTime) >= minInterval;
    }

    markSpoke(now, phraseId) {
      this.lastCommTime = now;
      this.lastPhraseIds.push(phraseId);
      if (this.lastPhraseIds.length > 5) this.lastPhraseIds.shift();
    }

    // ── Update per tick ──
    update(dt) {
      // Decay adrenaline
      if (this.adrenaline > 0) {
        this.adrenaline = Math.max(0, this.adrenaline - dt / 30); // 30s full decay
      }
      // Accumulate fatigue in combat
      if (this.combatState === COMBAT_STATES.ENGAGED ||
        this.combatState === COMBAT_STATES.EVASIVE) {
        this.fatigue = Math.min(1, this.fatigue + dt * (1 - this.fatigueResistance) * 0.01);
      }
    }

    // ── Reset for new mission ──
    resetMission() {
      this.combatState = COMBAT_STATES.PATROL;
      this.morale = 0.7;
      this.hull = 1.0;
      this.shields = 1.0;
      this.adrenaline = 0;
      this.fatigue = 0;
      this.missionKills = 0;
      this.lastCommTime = 0;
      this.lastPhraseIds = [];
      this.active = true;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §10 — PHRASE SELECTION ENGINE
  // ══════════════════════════════════════════════════════════════════

  /**
   * Select a phrase from the 3-tier system:
   * Character Pool → Title Pool → Universal Pool
   *
   * Filtering uses BOTH manifold surfaces:
   *   - z_linear gates phrase eligibility (urgency range matching)
   *   - z_asymmetric biases toward escalated phrases when escalation is high
   * This ensures personality × scenario → which phrases are reachable.
   */
  function selectPhrase(anpc, category, urgency) {
    // Manifold z-values for escalation bias
    const m = anpc.getManifoldValues(_scenario);
    const zEsc = m.asymmetric; // escalation surface

    // Tier 1: Character Pool
    const charPool = CHARACTER_POOLS[anpc.callsign];
    if (charPool && charPool[category]) {
      const match = _filterByManifold(charPool[category], urgency, zEsc, anpc.lastPhraseIds);
      if (match) return match;
    }

    // Tier 2: Title Pool (role-specific)
    const titlePool = TITLE_POOLS[anpc.role];
    if (titlePool && titlePool[category]) {
      const match = _filterByManifold(titlePool[category], urgency, zEsc, anpc.lastPhraseIds);
      if (match) return match;
    }

    // Tier 3: Universal Pool
    if (UNIVERSAL_POOL[category]) {
      const match = _filterByManifold(UNIVERSAL_POOL[category], urgency, zEsc, anpc.lastPhraseIds);
      if (match) return match;
    }

    return null;
  }

  /**
   * Filter phrases using manifold-derived values.
   * z_escalation biases selection toward higher-urgMax phrases
   * when the asymmetric surface is elevated — personality-driven escalation.
   */
  function _filterByManifold(phrases, urgency, zEscalation, recentIds) {
    // Primary: filter by urgency range, exclude recent
    const eligible = phrases.filter(p =>
      urgency >= p.urgMin && urgency <= p.urgMax &&
      !recentIds.includes(p.id)
    );

    if (eligible.length > 0) {
      // When escalation surface is high, bias toward higher-urgMax phrases
      // This makes aggressive personalities reach for more intense lines
      if (zEscalation > 0.3 && eligible.length > 1) {
        // Weight by proximity to urgMax × escalation
        const weighted = eligible.map(p => ({
          phrase: p,
          weight: 1 + (p.urgMax * zEscalation * 2),
        }));
        const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const w of weighted) {
          roll -= w.weight;
          if (roll <= 0) return w.phrase;
        }
        return weighted[weighted.length - 1].phrase;
      }
      return _pick(eligible);
    }

    // Fallback: include recent if nothing else matches
    const fallback = phrases.filter(p => urgency >= p.urgMin && urgency <= p.urgMax);
    return fallback.length > 0 ? _pick(fallback) : null;
  }

  // ══════════════════════════════════════════════════════════════════
  // §11 — ANPC REGISTRY & MANAGER
  // ══════════════════════════════════════════════════════════════════

  const _registry = new Map(); // id → ANPC
  let _scenario = new ScenarioVector('patrol');
  let _difficulty = DIFFICULTY.NORMAL;
  let _gameTime = 0;
  let _lastManifoldCalc = 0;
  const MANIFOLD_INTERVAL_COMBAT = 0.25; // seconds
  const MANIFOLD_INTERVAL_PATROL = 1.0;

  function register(schema) {
    const anpc = new ANPC(schema);
    _registry.set(anpc.id, anpc);
    return anpc;
  }

  function get(id) { return _registry.get(id); }

  function getByCallsign(callsign) {
    for (const anpc of _registry.values()) {
      if (anpc.callsign === callsign) return anpc;
    }
    return null;
  }

  function getByRole(role) {
    const result = [];
    for (const anpc of _registry.values()) {
      if (anpc.role === role && anpc.active) result.push(anpc);
    }
    return result;
  }

  function getAllied() {
    const result = [];
    for (const anpc of _registry.values()) {
      if (anpc.faction === 'allied' && anpc.active) result.push(anpc);
    }
    return result;
  }

  function getEnemies() {
    const result = [];
    for (const anpc of _registry.values()) {
      if (anpc.faction === 'enemy' && anpc.active) result.push(anpc);
    }
    return result;
  }

  function getAll() {
    return [..._registry.values()];
  }

  // ── Update all ANPCs (called from game loop) ──
  function update(dt) {
    _gameTime += dt;
    _scenario.update(dt);

    // Determine manifold calculation interval
    const anyInCombat = [..._registry.values()].some(a =>
      a.active && (a.combatState === COMBAT_STATES.ENGAGED ||
        a.combatState === COMBAT_STATES.EVASIVE));
    const interval = anyInCombat ? MANIFOLD_INTERVAL_COMBAT : MANIFOLD_INTERVAL_PATROL;

    const shouldCalcManifold = (_gameTime - _lastManifoldCalc) >= interval;
    if (shouldCalcManifold) _lastManifoldCalc = _gameTime;

    for (const anpc of _registry.values()) {
      if (!anpc.active) continue;
      anpc.update(dt);
    }
  }

  // ── Scenario vector control ──
  function applyEvent(eventName) {
    _scenario.applyEvent(eventName);
  }

  function getScenario() { return _scenario; }

  function resetScenario(template) {
    _scenario.reset(template || 'patrol');
  }

  // ── Morale contagion ──
  function propagateMorale(sourceAnpc, delta) {
    for (const anpc of _registry.values()) {
      if (anpc === sourceAnpc || !anpc.active) continue;
      if (anpc.faction === sourceAnpc.faction) {
        anpc.adjustMorale(delta * MORALE_CONTAGION);
      }
    }
  }

  // ── Disposition shifts ──
  const DISPOSITION_DELTAS = {
    player_saves: +0.15,
    cooperative_kill: +0.04,
    survived_together: +0.03,
    player_ignores_danger: -0.08,
    friendly_fire: -0.20,
    follows_order: +0.05,
    ignores_order: -0.10,
    reckless_play: -0.05,
    impressive_kill: +0.06,
  };

  function shiftDisposition(anpcId, reason) {
    const anpc = _registry.get(anpcId);
    if (!anpc) return;
    const delta = DISPOSITION_DELTAS[reason] || 0;
    anpc.disposition = Math.max(-1, Math.min(1, anpc.disposition + delta));
  }

  // ── Generate a line of dialog from an ANPC ──
  // Full manifold pipeline: personality × scenario → z-surfaces → urgency →
  // phrase selection (z-weighted) → composite assembly (z-modulated tone)
  function speak(anpcId, category, context) {
    const anpc = _registry.get(anpcId);
    if (!anpc || !anpc.active) return null;

    // Step 1: Manifold-derived urgency (z=xy + z=xy² blend)
    const urgency = computeUrgency(anpc, _scenario);

    // Step 2: Manifold-driven communication frequency check
    if (!anpc.canSpeak(_gameTime, urgency, _scenario)) return null;

    // Step 3: Manifold-weighted phrase selection (z_asymmetric biases intensity)
    const phrase = selectPhrase(anpc, category, urgency);
    if (!phrase) return null;

    // Step 4: Manifold-modulated composite assembly (z-surfaces drive opener/modifier)
    const assembled = assemblePhrase(phrase, context || {}, anpc, urgency);

    // Step 5: Record and return
    anpc.markSpoke(_gameTime, phrase.id);
    const m = anpc.getManifoldValues(_scenario);

    return {
      sender: anpc.callsign || anpc.displayName,
      text: assembled,
      channel: anpc.faction === 'enemy' ? CHANNELS.ENEMY : CHANNELS.SQUADRON,
      urgency,
      zLinear: m.linear,
      zAsymmetric: m.asymmetric,
      anpcId: anpc.id,
    };
  }

  // ── Force speak (bypass cooldown, for critical events) ──
  function forceSpeak(anpcId, category, context) {
    const anpc = _registry.get(anpcId);
    if (!anpc || !anpc.active) return null;

    const urgency = computeUrgency(anpc, _scenario);
    const phrase = selectPhrase(anpc, category, urgency);
    if (!phrase) return null;

    const assembled = assemblePhrase(phrase, context || {}, anpc, urgency);
    anpc.markSpoke(_gameTime, phrase.id);
    const m = anpc.getManifoldValues(_scenario);

    return {
      sender: anpc.callsign || anpc.displayName,
      text: assembled,
      channel: anpc.faction === 'enemy' ? CHANNELS.ENEMY : CHANNELS.SQUADRON,
      urgency,
      zLinear: m.linear,
      zAsymmetric: m.asymmetric,
      anpcId: anpc.id,
    };
  }

  // ── Difficulty scaling ──
  const DIFFICULTY_SCALES = {
    allied: {
      easy: { accuracy: 0.70, reaction: 0.3, evasion: 0.70, moraleSens: 0.7, damageThreshold: 0.25, aggrMult: 1.2, commFreq: 1.3 },
      normal: { accuracy: 0.60, reaction: 0.5, evasion: 0.50, moraleSens: 1.0, damageThreshold: 0.35, aggrMult: 1.0, commFreq: 1.0 },
      hard: { accuracy: 0.50, reaction: 0.7, evasion: 0.35, moraleSens: 1.3, damageThreshold: 0.45, aggrMult: 0.8, commFreq: 0.8 },
      veteran: { accuracy: 0.40, reaction: 1.0, evasion: 0.25, moraleSens: 1.6, damageThreshold: 0.55, aggrMult: 0.7, commFreq: 0.6 },
    },
    enemy: {
      easy: { accuracy: 0.30, reaction: 1.2, evasion: 0.20, moraleSens: 1.5, aggrMult: 0.7, formTight: 0.3 },
      normal: { accuracy: 0.50, reaction: 0.7, evasion: 0.40, moraleSens: 1.0, aggrMult: 1.0, formTight: 0.5 },
      hard: { accuracy: 0.70, reaction: 0.4, evasion: 0.60, moraleSens: 0.7, aggrMult: 1.3, formTight: 0.7 },
      veteran: { accuracy: 0.85, reaction: 0.2, evasion: 0.80, moraleSens: 0.5, aggrMult: 1.6, formTight: 0.9 },
    },
  };

  function setDifficulty(level) {
    _difficulty = level;
  }

  function getDifficultyScale(faction) {
    return DIFFICULTY_SCALES[faction]?.[_difficulty] || DIFFICULTY_SCALES[faction]?.normal;
  }

  // ── Compliance model (Doc #2 §9.1) ──
  function computeCompliance(anpc, orderDangerLevel) {
    return anpc.disposition * (1.0 - orderDangerLevel) * anpc.morale;
  }

  // ── Reset all for new mission ──
  function resetAll(missionTemplate) {
    for (const anpc of _registry.values()) {
      anpc.resetMission();
    }
    _scenario.reset(missionTemplate || 'patrol');
    _gameTime = 0;
    _lastManifoldCalc = 0;
  }

  // ── Utility ──
  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ══════════════════════════════════════════════════════════════════
  // §12 — CHARACTER DEFINITIONS
  // ══════════════════════════════════════════════════════════════════

  const CHARACTER_SCHEMAS = {
    hotshot: {
      id: 'ANPC-SF-0042',
      displayName: 'Marcus Chen',
      callsign: 'Hotshot',
      role: 'SF-WING',
      voiceProfile: 'young_male_energetic',
      backstory: 'Marcus Chen grew up on a frontier colony racing skimmers through canyons. Reckless skill caught military attention. Graduated mid-class academically but top of flight group. Lost his sister in an early campaign. Channels grief into aggressive prove-something energy.',
      personality: [0.55, 0.40, 0.85, 0.45, 0.35], // O, C, E, A, N
      shipClass: 'interceptor',
      squadronId: 'SQ-07',
      combatRating: 0.72,
      weaponLoadout: ['WPN-LAS', 'WPN-SCT', 'WPN-PTN'],
      flightHours: 1847,
      killCount: 38,
      damageThreshold: 0.35,
      preferredTactic: 'aggressive',
      formationPosition: 'wing_left',
      adrenalineSpike: 0.25,
      fatigueResistance: 0.7,
      moraleFloor: 0.20,
      disposition: 0.65,
      faction: 'allied',
    },
    frostbite: {
      id: 'ANPC-SF-0043',
      displayName: 'Viktor Kozlov',
      callsign: 'Frostbite',
      role: 'SF-WING',
      voiceProfile: 'mature_male_calm_precise',
      backstory: 'Former test pilot with 3000+ hours. Speaks in clipped military efficiency. Ice-cold focus under fire. Methodical where Hotshot is instinctive. Trusts data over gut.',
      personality: [0.40, 0.85, 0.25, 0.50, 0.15], // O, C, E, A, N
      shipClass: 'interceptor',
      squadronId: 'SQ-07',
      combatRating: 0.78,
      weaponLoadout: ['WPN-LAS', 'WPN-SCT', 'WPN-PTN'],
      flightHours: 3200,
      killCount: 52,
      damageThreshold: 0.45,
      preferredTactic: 'defensive',
      formationPosition: 'wing_right',
      adrenalineSpike: 0.10,
      fatigueResistance: 0.85,
      moraleFloor: 0.10,
      disposition: 0.45,
      faction: 'allied',
    },
    lighthouse: {
      id: 'ANPC-SF-0003',
      displayName: 'Dr. Amara Okafor',
      callsign: 'Lighthouse',
      role: 'SF-CMDOP',
      voiceProfile: 'mature_female_calm_authoritative',
      backstory: 'Stellar cartographer turned military intelligence. Reads sensor data and predicts enemy movements. Never fired a weapon but has guided more pilots home than any other operator. Takes every loss personally. Steady, guiding, a promise the shore is close.',
      personality: [0.75, 0.90, 0.40, 0.70, 0.10], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'support',
      formationPosition: null,
      adrenalineSpike: 0.05,
      fatigueResistance: 0.90,
      moraleFloor: 0.25,
      disposition: 0.70,
      faction: 'allied',
    },
    vasquez: {
      id: 'ANPC-SF-0001',
      displayName: 'Cdr. Elena Vasquez',
      callsign: 'Resolute Actual',
      role: 'SF-SQLDR',
      voiceProfile: 'mature_female_commanding',
      backstory: 'Twenty-year veteran who earned command of the Resolute through exemplary tactical leadership. Direct, unflinching, but deeply invested in her crews\' safety. Carries the weight of every decision.',
      personality: [0.50, 0.85, 0.55, 0.55, 0.20], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'balanced',
      formationPosition: null,
      adrenalineSpike: 0.10,
      fatigueResistance: 0.85,
      moraleFloor: 0.15,
      disposition: 0.60,
      faction: 'allied',
    },
    nightshade: {
      id: 'ANPC-SF-E-0001',
      displayName: 'Unknown',
      callsign: 'Nightshade',
      role: 'SF-EACE',
      voiceProfile: 'mature_male_calm_menacing',
      backstory: 'A ghost in enemy intelligence files. Appeared three years ago in a matte-black Heavy Fighter. 100+ confirmed kills. Operates outside standard chain of command. Rumored defector. Fights with surgical precision. Speaks only to pilots who impress him.',
      personality: [0.65, 0.85, 0.30, 0.15, 0.20], // O, C, E, A, N
      shipClass: 'heavy_fighter',
      squadronId: 'SQ-X',
      combatRating: 0.94,
      weaponLoadout: ['WPN-LAS', 'WPN-SCT', 'WPN-PTN', 'WPN-EMP'],
      flightHours: 12000,
      killCount: 100,
      damageThreshold: 0.15,
      preferredTactic: 'ambush',
      formationPosition: 'free_roam',
      adrenalineSpike: 0.05,
      fatigueResistance: 0.95,
      moraleFloor: 0.10,
      disposition: -0.60,
      faction: 'enemy',
    },
    tanaka: {
      id: 'ANPC-SF-0004',
      displayName: 'XO Yuki Tanaka',
      callsign: 'Resolute XO',
      role: 'SF-CMDOP',
      voiceProfile: 'young_female_precise',
      backstory: 'Brilliant tactical analyst who rose fast through the ranks. Excels at multitasking under pressure. Covers for Vasquez during split-second decisions. Cool and efficient.',
      personality: [0.60, 0.80, 0.50, 0.60, 0.25], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'support',
      formationPosition: null,
      adrenalineSpike: 0.10,
      fatigueResistance: 0.80,
      moraleFloor: 0.20,
      disposition: 0.55,
      faction: 'allied',
    },
    park: {
      id: 'ANPC-SF-0005',
      displayName: 'Ens. Ji-Yeon Park',
      callsign: 'Scope',
      role: 'SF-CMDOP',
      voiceProfile: 'young_female_alert',
      backstory: 'Youngest sensor operator on the Resolute. Exceptional pattern recognition and spatial awareness. Gets excited when she spots something first. Eager to prove herself.',
      personality: [0.70, 0.65, 0.60, 0.65, 0.40], // O, C, E, A, N
      shipClass: null,
      squadronId: 'CMD-01',
      combatRating: null,
      weaponLoadout: [],
      flightHours: 0,
      killCount: 0,
      damageThreshold: null,
      preferredTactic: 'support',
      formationPosition: null,
      adrenalineSpike: 0.20,
      fatigueResistance: 0.55,
      moraleFloor: 0.25,
      disposition: 0.60,
      faction: 'allied',
    },
  };

  // ── Initialize default characters ──
  function initCharacters() {
    for (const key in CHARACTER_SCHEMAS) {
      register(CHARACTER_SCHEMAS[key]);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // §13 — PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    // Constants
    COMBAT_STATES,
    CHANNELS,
    ROE,
    DIFFICULTY,

    // Registry
    register,
    get,
    getByCallsign,
    getByRole,
    getAllied,
    getEnemies,
    getAll,
    initCharacters,

    // Core systems
    update,
    speak,
    forceSpeak,
    applyEvent,
    getScenario,
    resetScenario,
    resetAll,

    // Manifold
    manifoldLinear,
    manifoldAsymmetric,
    computeManifoldXY,
    computeToneVector,
    computeUrgency,

    // Morale & Disposition
    propagateMorale,
    shiftDisposition,
    MORALE_MODIFIERS,

    // Phrase system
    selectPhrase,
    assemblePhrase,

    // Difficulty
    setDifficulty,
    getDifficultyScale,

    // Compliance
    computeCompliance,

    // Character schemas (for external reference)
    CHARACTER_SCHEMAS,
  };

})();

window.SFANPC = SFANPC;

/**
 * Autonomous Announcer System — Starfighter
 * ──────────────────────────────────────────
 * ANPC-driven dialog system. Every line is produced by the ButterflyFX™
 * ANPC manifold pipeline: personality vectors → scenario vectors →
 * manifold surfaces (z=xy, z=xy²) → 3-tier phrase pools → composite
 * string assembly.
 *
 * Each crew member is a full ANPC with:
 *   - OCEAN personality vector
 *   - Combat state machine (8 states)
 *   - Manifold-driven urgency/tone calculation
 *   - 3-tier phrase selection (Character → Title → Universal)
 *   - Morale with contagion
 *   - Disposition tracking toward player
 *
 * Backwards-compatible: all existing on*() event handlers preserved.
 */

const SFAnnouncer = (function () {

  let _state = null;
  let _addComm = null;
  let _snap = null;
  let _crew = null;
  let _cs = null;
  let _bearing = null;
  let _bearingOf = null;
  let _dim = null;
  let _countHostiles = null;
  let _anpcReady = false; // true once SFANPC system loaded

  // ── Observation memory — what the announcer has seen ──
  const _mem = {
    lastHostileCount: 0,
    lastWave: 0,
    lastPhase: '',
    lastHullPct: 100,
    lastShieldPct: 100,
    lastFuelPct: 100,
    lastBasePct: 100,
    lastKills: 0,
    knownTypes: new Set(),       // enemy types we've already called out
    recentTopics: [],            // last 5 topics announced (avoid repeats)
    phaseAnnounced: {},          // one-shot announcements per phase
    waveTypesAnnounced: new Set(), // enemy types announced this wave
  };

  // ── Cooldown timers per topic ──
  const _cooldowns = {};
  function _onCooldown(topic, duration) {
    if (_cooldowns[topic] && _cooldowns[topic] > 0) return true;
    _cooldowns[topic] = duration;
    return false;
  }
  function _tickCooldowns(dt) {
    for (const k in _cooldowns) {
      if (_cooldowns[k] > 0) _cooldowns[k] -= dt;
    }
  }

  // ── Vocabulary pools — word options, never fixed lines ──
  const V = {
    // Picking functions
    contact: ['contact', 'bogey', 'signature', 'return', 'blip'],
    contacts: ['contacts', 'bogeys', 'signatures', 'returns', 'hostiles'],
    detected: ['detected', 'on scope', 'confirmed', 'showing on radar', 'picked up'],
    engaging: ['engaging', 'moving to intercept', 'weapons hot', 'going in', 'on approach'],
    destroyed: ['destroyed', 'neutralized', 'eliminated', 'down', 'splashed', 'confirmed kill'],
    critical: ['critical', 'in the red', 'failing', 'compromised', 'at risk'],
    good: ['solid hit', 'good effect', 'direct hit', 'on target', 'nice shooting'],
    urgent: ['NOW', 'immediately', 'at once', 'this instant'],
    move: ['break off', 'disengage', 'evade', 'get clear', 'pull out'],
    watch: ['watch your six', 'check six', 'stay sharp', 'eyes open', 'heads up'],
    protect: ['cover the base', 'protect the Resolute', 'defend the carrier', 'keep them off her'],
    // Ship-type specific
    drone: ['drone', 'light fighter', 'enemy fighter'],
    interceptor: ['interceptor', 'fast mover', 'flanker'],
    bomber: ['bomber', 'attack ship', 'heavy bomber'],
    predator: ['Predator', 'Predator Drone', 'hunter'],
    dreadnought: ['Dreadnought', 'Hive Throne', 'capital ship'],
    baseship: ['mothership', 'capital ship', 'alien carrier', 'enemy capital'],
    hive: ['the hive', 'alien base', 'hive structure', 'enemy base'],
    // Tactical advice
    useTorps: ['use torpedoes', 'switch to torpedoes', 'torps are your best bet', 'heavy ordnance recommended'],
    targetWeak: ['target the underbelly', 'hit the weak point', 'aim for the vents', 'go for their underside'],
    clearEscorts: ['clear the escorts first', 'thin out their fighters', 'deal with the escorts', 'sweep the perimeter'],
    // Status
    hullStatus: (pct) => pct < 20 ? 'hull critical' : pct < 40 ? 'hull damaged' : pct < 60 ? 'hull holding' : pct < 80 ? 'hull stable' : 'hull strong',
    shieldStatus: (pct) => pct <= 0 ? 'shields down' : pct < 30 ? 'shields failing' : pct < 60 ? 'shields weakened' : 'shields holding',
    fuelStatus: (pct) => pct < 10 ? 'fuel critical' : pct < 25 ? 'fuel low' : pct < 50 ? 'fuel half' : 'fuel nominal',
    // Launch sequence
    launchReady: ['all systems green', 'boards are green', 'pre-flight nominal', 'launch checks complete', 'all stations report ready'],
    launchGo: ['Launch! Launch! Launch!', 'All ahead — punch it!', 'Light the fires — go go go!', 'Clear the rail — full military!', 'Catapult engaged — godspeed!'],
    launchGodspeed: ['Good hunting.', 'Bring them home.', 'Give them hell.', 'Stay frosty out there.', 'The Resolute is counting on you.'],
    threat: ['threat assessment', 'threat intel', 'tactical picture', 'battlefield report', 'combat intel'],
    sensorReading: ['reading', 'tracking', 'picking up', 'showing', 'registering'],
    combatReady: ['combat ready', 'weapons hot', 'armed and ready', 'standing by for combat', 'all systems nominal'],
  };

  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function _pickExcluding(arr, exclude) {
    const filtered = arr.filter(x => x !== exclude);
    return filtered.length ? _pick(filtered) : _pick(arr);
  }

  // ── Compose functions — build natural sentences from state + vocab ──

  function _composeNewContacts(snap, newCount, types) {
    const parts = [];
    if (types.includes('dreadnought')) parts.push(`${snap.dreadnoughts} ${_pick(V.dreadnought)}`);
    if (types.includes('predator')) parts.push(`${snap.predators} ${_pick(V.predator)}${snap.predators > 1 ? 's' : ''}`);
    if (types.includes('bomber')) parts.push(`${snap.bombers} ${_pick(V.bomber)}${snap.bombers > 1 ? 's' : ''}`);
    if (types.includes('interceptor')) parts.push(`${snap.interceptors} ${_pick(V.interceptor)}${snap.interceptors > 1 ? 's' : ''}`);
    if (types.includes('enemy')) parts.push(`${snap.enemies} ${_pick(V.drone)}${snap.enemies > 1 ? 's' : ''}`);
    if (types.includes('alien-baseship')) parts.push(`${_pick(V.baseship)}`);
    const manifest = parts.length ? parts.join(', ') : `${newCount} ${_pick(V.contacts)}`;
    return `${manifest} ${_pick(V.detected)}`;
  }

  function _composeKill(type, snap) {
    const left = snap.totalHostile;
    const verb = _pick(V.destroyed);
    const typeName = type === 'predator' ? _pick(V.predator)
      : type === 'interceptor' ? _pick(V.interceptor)
        : type === 'bomber' ? _pick(V.bomber)
          : type === 'dreadnought' ? _pick(V.dreadnought)
            : type === 'alien-baseship' ? _pick(V.baseship)
              : _pick(V.drone);
    if (left === 0) return `${typeName} ${verb}. Sector clear. ${_state.kills} kills this wave.`;
    const next = snap.priorityTarget ? ` Next at ${_bearingOf(snap.priorityTarget)}.` : '';
    return `${typeName} ${verb}. ${left} ${left === 1 ? 'hostile' : _pick(V.contacts)} remaining.${next}`;
  }

  function _composeWaveStart(snap) {
    const parts = [];
    if (snap.enemies > 0) parts.push(`${snap.enemies} ${_pick(V.drone)}${snap.enemies > 1 ? 's' : ''}`);
    if (snap.interceptors > 0) parts.push(`${snap.interceptors} ${_pick(V.interceptor)}${snap.interceptors > 1 ? 's' : ''}`);
    if (snap.bombers > 0) parts.push(`${snap.bombers} ${_pick(V.bomber)}${snap.bombers > 1 ? 's' : ''}`);
    if (snap.predators > 0) parts.push(`${snap.predators} ${_pick(V.predator)}${snap.predators > 1 ? 's' : ''}`);
    if (snap.dreadnoughts > 0) parts.push(`${snap.dreadnoughts} ${_pick(V.dreadnought)}`);
    if (snap.alienMothership) parts.push(`${_pick(V.baseship)}`);
    const manifest = parts.length ? parts.join(', ') : `${snap.totalHostile} ${_pick(V.contacts)}`;
    return `Wave ${_state.wave}. ${manifest} ${_pick(V.detected)}. Base ${V.hullStatus(snap.basePct)}.`;
  }

  function _composeLaunchClear(snap) {
    const count = snap.totalHostile;
    const close = snap.closestM < 3000 ? ` Nearest ${_pick(V.contact)} ${snap.closestM}m.` : '';
    return `Clear of bay. ${count} ${_pick(V.contacts)} on scope.${close} Weapons free.`;
  }

  function _composeDamageReport(snap, what) {
    if (what === 'hull') return `${_cs()}, ${V.hullStatus(snap.hullPct)} at ${snap.hullPct}%. ${_pick(V.watch)}.`;
    if (what === 'shields') return `${V.shieldStatus(snap.shieldPct)}. Hull ${snap.hullPct}%. ${_pick(V.move)}.`;
    if (what === 'base') return `Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. ${_pick(V.protect)}.`;
    return `${_cs()}, hull ${snap.hullPct}%, shields ${snap.shieldPct}%.`;
  }

  function _composePlayerStatus(snap) {
    const parts = [`Hull ${snap.hullPct}%`];
    if (snap.shieldPct < 100) parts.push(`shields ${snap.shieldPct}%`);
    if (snap.fuelPct < 50) parts.push(`fuel ${snap.fuelPct}%`);
    if (snap.torpCount > 0) parts.push(`${snap.torpCount} torpedoes`);
    return parts.join(', ');
  }

  function _composeTacticalAdvice(snap) {
    if (snap.dreadnoughts > 0 && snap.torpCount > 0) return `${_pick(V.dreadnought)} active. ${_pick(V.useTorps)}.`;
    if (snap.predators > 0) return `${_pick(V.predator)} on scope. ${_pick(V.targetWeak)}.`;
    if (snap.bombers > 0 && snap.basePct < 60) return `${_pick(V.bomber)}s heading for base. ${_pick(V.protect)}.`;
    if (snap.alienMothership && snap.totalHostile <= 4) return `Escorts thinned out. ${_pick(V.baseship)} exposed. Press the attack.`;
    if (snap.alienHive && snap.totalHostile <= 2) return `${_pick(V.hive)} exposed. Use this window.`;
    return null;
  }

  // ── Event handlers — called by core.js when things happen ──

  function onWaveStart() {
    const snap = _snap();
    _mem.lastWave = _state.wave;
    _mem.waveTypesAnnounced.clear();

    // Update scenario vector
    _updateScenario('contacts_hostile');
    _transitionWingmen('hostiles_confirmed');

    // Sensor officer reports what's on scope
    const anpcLine = _anpcSpeak('sensor', 'combat_engage', { count: snap.totalHostile });
    if (anpcLine) {
      _addComm(_crew('sensor'), anpcLine, 'warning');
    } else {
      _addComm(_crew('sensor'), _composeWaveStart(snap), 'warning');
    }

    // Tactical gives advice based on what's out there
    const advice = _composeTacticalAdvice(snap);
    if (advice) _addComm(_crew('tactical'), advice, 'base');

    // Wingman acknowledge
    const wingAck = _wingmanSpeak('mission_comm');
    if (wingAck) _addComm(wingAck.sender, wingAck.msg, wingAck.type);

    _mem.lastHostileCount = snap.totalHostile;
  }

  function onLaunchClear() {
    const snap = _snap();
    _addComm(_crew('deck'), `${_cs()}, ${_composeLaunchClear(snap)}`, 'base');

    // Wingman check-in — ANPC personality-driven
    if (_state.aiWingmen) {
      const wingLine = _wingmanSpeak('tactical_coord');
      if (wingLine) {
        _addComm(wingLine.sender, wingLine.msg, wingLine.type);
      } else {
        const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
        const close = snap.closestM < 5000 && snap.closestPos
          ? `Contact at ${_bearing(snap.closestPos)}. ${_pick(V.engaging)}.`
          : `${snap.totalHostile} ${_pick(V.contacts)}. Forming up.`;
        _addComm(callsign, close, 'ally');
      }
    }

    // Transition wingmen to alert
    _transitionWingmen('contacts_detected');
  }

  function onKill(type) {
    const snap = _snap();
    _updateScenario('enemy_destroyed');

    // Update wingmen morale on kill
    if (_anpcReady) {
      const wingmen = SFANPC.getByRole('SF-WING');
      for (const w of wingmen) {
        w.adjustMorale(SFANPC.MORALE_MODIFIERS.ally_kill);
      }
    }

    if (snap.totalHostile === 0) {
      // Sector clear — command announces
      _transitionWingmen('hostiles_cleared');
      const cmdLine = _anpcSpeak('command', 'tactical_coord', { remaining: 0 });
      _addComm(_crew('command'), cmdLine || _composeKill(type, snap), 'base');
      // Wingman celebration
      const wingCel = _wingmanSpeak('morale_banter');
      if (wingCel) _addComm(wingCel.sender, wingCel.msg, wingCel.type);
    } else if (type === 'dreadnought') {
      _addComm(_crew('command'), _composeKill(type, snap), 'base');
      const sensLine = _anpcSpeak('sensor', 'kill_confirm', { remaining: snap.totalHostile, target: _pick(V.dreadnought) });
      _addComm(_crew('sensor'), sensLine || `${_pick(V.dreadnought)} signal lost. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'base');
    } else {
      // Wingman gets kill confirm if ANPC available
      const wingKill = _wingmanSpeak('kill_confirm', { remaining: snap.totalHostile });
      if (wingKill && Math.random() < 0.4) {
        _addComm(wingKill.sender, wingKill.msg, wingKill.type);
      } else {
        _addComm(_crew('tactical'), _composeKill(type, snap), 'base');
      }
    }
  }

  function onVictory() {
    const snap = _snap();
    _updateScenario('objective_complete');

    // Boost all morale on victory
    if (_anpcReady) {
      for (const anpc of SFANPC.getAllied()) {
        anpc.adjustMorale(SFANPC.MORALE_MODIFIERS.victory);
      }
    }

    // Commander announces
    const cmdLine = _anpcSpeak('command', 'mission_comm', {
      intel: `all contacts neutralized. Score ${_state.score}. Mission complete`,
      missionBrief: `Hive destroyed. Score ${_state.score}. All ships return to base`
    });
    _addComm(_crew('command'), cmdLine || `${_pick(V.hive)} ${_pick(V.destroyed)}! Score ${_state.score}. Mission complete.`, 'base');

    // Wingman celebration
    const wingCel = _wingmanSpeak('morale_banter');
    if (wingCel) _addComm(wingCel.sender, wingCel.msg, wingCel.type);
  }

  function onMilitaryLost() {
    const snap = _snap();
    _updateScenario('ally_destroyed');
    const line = _anpcSpeak('command', 'emergency', { reason: `military ship lost, base ${V.hullStatus(snap.basePct)}` });
    _addComm(_crew('command'), line || `Military ship lost. Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. No resupply available.`, 'base');
  }

  function onCivilianLost() {
    _updateScenario('ally_destroyed');
    const line = _anpcSpeak('command', 'emergency', { reason: `civilian station destroyed, mission failed` });
    _addComm(_crew('command'), line || `Civilian station ${_pick(V.destroyed)}. ${_state.kills} kills, score ${_state.score}. Mission failed.`, 'base');
  }

  function onAllyDown() {
    const snap = _snap();
    _updateScenario('ally_destroyed');

    // Propagate morale loss
    if (_anpcReady) {
      const wingmen = SFANPC.getByRole('SF-WING');
      for (const w of wingmen) {
        w.adjustMorale(SFANPC.MORALE_MODIFIERS.ally_destroyed);
      }
      SFANPC.propagateMorale(wingmen[0], SFANPC.MORALE_MODIFIERS.ally_destroyed);
    }

    // Wingman emergency call
    const wingEmerg = _wingmanSpeak('emergency');
    if (wingEmerg) {
      _addComm(wingEmerg.sender, wingEmerg.msg, wingEmerg.type);
    } else {
      const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
      _addComm(callsign, `Going down! ${snap.totalHostile} ${_pick(V.contacts)} still active. ${_pick(V.protect)}!`, 'ally');
    }
  }

  function onPlayerDestroyed(reason, livesLeft, maxLives) {
    const snap = _snap();
    const hostiles = _countHostiles();
    _updateScenario('ally_destroyed');

    if (livesLeft <= 0) {
      _addComm(_crew('command'), `Final interceptor lost. ${hostiles} ${_pick(V.contacts)} still active.`, 'warning');
    } else {
      const slot = maxLives - livesLeft;
      _addComm(_crew('command'), `Pilot ${slot} of ${maxLives} lost. ${reason}. Replacement launching.`, 'warning');
      _addComm(_crew('sensor'), `${hostiles} ${_pick(V.contacts)} active. Wave ${_state.wave}. Base ${V.hullStatus(snap.basePct)}.`, 'base');
      // Wingman reacts to player death
      const wingReact = _wingmanSpeak('damage_report');
      if (wingReact) _addComm(wingReact.sender, wingReact.msg, wingReact.type);
    }
  }

  function onRespawnReady() {
    const snap = _snap();
    const hostiles = _countHostiles();
    const line = _anpcSpeak('deck', 'status_update', { status: `replacement on rail, ${hostiles} hostiles active, wave ${_state.wave}` });
    _addComm(_crew('deck'), line || `${_cs()}, replacement on rail. ${hostiles} ${_pick(V.contacts)} active. Wave ${_state.wave}.`, 'base');
  }

  function onWaveClear() {
    const snap = _snap();
    _updateScenario('objective_complete');
    const line = _anpcSpeak('tactical', 'sector_clear', { kills: _state.kills, wave: _state.wave });
    _addComm(_crew('tactical'), line || `${_cs()}, sector clear. ${_state.kills} kills. Return to base.`, 'base');
  }

  function onAutopilotEngage() {
    const snap = _snap();
    const dist = Math.floor(_state.player.position.distanceTo(_state.baseship.position));
    const line = _anpcSpeak('ops', 'status_update', { status: `autopilot engaged, ${dist}m to base` });
    _addComm(_crew('ops'), line || `${_cs()}, autopilot engaged. ${dist}m to base.`, 'base');
  }

  function onDock(who) {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: `docking confirmed, ${_state.kills} kills, score ${_state.score}, ${V.hullStatus(snap.hullPct)}`, score: _state.score });
    _addComm(_crew('deck'), line || `${_cs()}, docking confirmed. ${_state.kills} kills, score ${_state.score}. ${V.hullStatus(snap.hullPct)}.`, 'base');
  }

  function onTankerDeploy() {
    const snap = _snap();
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: 'tanker', status: `${V.fuelStatus(snap.fuelPct)}, ${V.hullStatus(snap.hullPct)}` });
    _addComm(_crew('ops'), line || `${_cs()}, tanker deployed. ${V.fuelStatus(snap.fuelPct)}, ${V.hullStatus(snap.hullPct)}.`, 'base');
  }

  function onTankerDock() {
    const snap = _snap();
    _addComm('Lifeline', `${_cs()}, docking. Fuel ${snap.fuelPct}%, hull ${snap.hullPct}%. Resupplying.`, 'ally');
  }

  function onTankerDone() {
    const snap = _snap();
    _addComm('Lifeline', `${_cs()}, resupply done. Fuel ${snap.fuelPct}%, hull ${snap.hullPct}%.`, 'ally');
  }

  function onMedicDeploy(callsign) {
    const snap = _snap();
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: `medical frigate '${callsign}'`, status: `${V.hullStatus(snap.hullPct)}, ${V.shieldStatus(snap.shieldPct)}` });
    _addComm(_crew('ops'), line || `${_cs()}, medical frigate '${callsign}' dispatched. ${V.hullStatus(snap.hullPct)}, ${V.shieldStatus(snap.shieldPct)}.`, 'base');
  }

  function onMedicDock(callsign) {
    const snap = _snap();
    _addComm(callsign, `${_cs()}, docking. Hull ${snap.hullPct}%, shields ${snap.shieldPct}%. Beginning repair.`, 'ally');
  }

  function onMedicProgress(callsign) {
    const snap = _snap();
    if (snap.hullPct < 100 || snap.shieldPct < 100) {
      _addComm(callsign, `Hull ${snap.hullPct}%, shields ${snap.shieldPct}%. Repair in progress.`, 'ally');
    }
  }

  function onMedicDone(callsign) {
    const snap = _snap();
    _addComm(callsign, `${_cs()}, repair complete. Hull ${snap.hullPct}%, shields ${snap.shieldPct}%. Returning to station.`, 'ally');
  }

  // ── Support Call System ──

  function onSupportDenied(type) {
    const ship = type === 'tanker' ? 'tanker' : 'medical frigate';
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: ship, reason: 'conditions not critical enough', status: 'request denied' });
    _addComm(_crew('ops'), line || `${_cs()}, ${ship} request denied. Conditions not critical enough. Keep fighting.`, 'base');
  }

  function onSupportAccepted(type, name) {
    const snap = _snap();
    if (type === 'tanker') {
      _addComm(name, `${_cs()}, copy. Fueling and rearm standing by. Engaging your autopilot. ${V.fuelStatus(snap.fuelPct)}.`, 'ally');
    } else {
      _addComm(name, `${_cs()}, acknowledged. Emergency repair authorized. Taking helm control. ${V.hullStatus(snap.hullPct)}.`, 'ally');
    }
  }

  function onSupportDock(type, name) {
    const snap = _snap();
    if (type === 'tanker') {
      _addComm(name, `${_cs()}, hard dock. Beginning fuel transfer and ordnance load. Hull ${snap.hullPct}%, fuel ${snap.fuelPct}%.`, 'ally');
    } else {
      _addComm(name, `${_cs()}, locked on. Hull repair underway. Hull ${snap.hullPct}%, shields ${snap.shieldPct}%.`, 'ally');
    }
  }

  function onSupportReturn(type) {
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: type, status: `${type === 'tanker' ? 'resupply' : 'repair'} complete, returning to combat zone` });
    _addComm(_crew('ops'), line || `${_cs()}, ${type === 'tanker' ? 'resupply' : 'repair'} complete. Autopilot returning you to combat zone.`, 'base');
  }

  function onSupportComplete() {
    const line = _anpcSpeak('ops', 'support_ops', { supportShip: 'support', status: 'controls released' });
    _addComm(_crew('ops'), line || `${_cs()}, controls released. You have the stick. Good hunting.`, 'base');
  }

  function onHeavyOrdnance() {
    const snap = _snap();
    _updateScenario('hull_critical');
    _addComm(_crew('sensor'), `${_cs()}, heavy ordnance incoming! ${_composePlayerStatus(snap)}. Brace!`, 'warning');
    // Wingman warns
    const wingWarn = _wingmanSpeak('tactical_coord', { direction: 'hard' });
    if (wingWarn) _addComm(wingWarn.sender, wingWarn.msg, wingWarn.type);
  }

  function onGoodHit() {
    const snap = _snap();
    // Disposition boost: impressive kill
    if (_anpcReady) SFANPC.shiftDisposition('ANPC-SF-0042', 'impressive_kill');
    _addComm(_crew('tactical'), `${_pick(V.good)}, ${_cs()}! Hull ${snap.hullPct}%.`, 'base');
  }

  function onPlasmaHit() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('sensor', 'hazard_warning', { hazard: `plasma impact, ${V.shieldStatus(snap.shieldPct)}` });
    _addComm(_crew('sensor'), line || `${_cs()}, plasma impact! ${V.shieldStatus(snap.shieldPct)}. ${_pick(V.move)}!`, 'warning');
  }

  function onDisabled() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('tactical', 'hazard_warning', { hazard: `systems disabled, hull ${snap.hullPct}%` });
    _addComm(_crew('tactical'), line || `${_cs()}, systems disabled! Hull ${snap.hullPct}%. Countermeasures deploying!`, 'warning');
  }

  function onSystemsRestore() {
    const snap = _snap();
    const line = _anpcSpeak('tactical', 'status_update', { status: `systems back online, ${_composePlayerStatus(snap)}` });
    _addComm(_crew('tactical'), line || `${_cs()}, systems back online! ${_composePlayerStatus(snap)}. ${_pick(V.move)}!`, 'base');
  }

  function onHullBreach() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const sLine = _anpcSpeak('sensor', 'hazard_warning', { hazard: `hull breach, organism attached, hull ${snap.hullPct}%` });
    _addComm(_crew('sensor'), sLine || `Hull breach! Organism attached! Hull ${snap.hullPct}%.`, 'warning');
    const tLine = _anpcSpeak('tactical', 'emergency', { reason: `organism on hull — afterburner or RTB` });
    _addComm(_crew('tactical'), tLine || `${_cs()}, afterburner ${_pick(V.urgent)}! Shake it off or RTB!`, 'warning');
  }

  function onOrganismClear() {
    const snap = _snap();
    const line = _anpcSpeak('tactical', 'status_update', { status: `organism clear, hull ${snap.hullPct}%` });
    _addComm(_crew('tactical'), line || `${_cs()}, organism clear! Hull ${snap.hullPct}%. Keep moving!`, 'base');
  }

  function onOrganismDeep() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('sensor', 'emergency', { reason: `organism too deep, hull ${snap.hullPct}% — RTB now` });
    _addComm(_crew('sensor'), line || `${_cs()}, too deep to dislodge! Hull ${snap.hullPct}%. RTB ${_pick(V.urgent)}!`, 'warning');
  }

  function onOrganismInside() {
    const snap = _snap();
    _updateScenario('hull_critical');
    const line = _anpcSpeak('sensor', 'emergency', { reason: `hull breached, organism inside the ship, hull ${snap.hullPct}%` });
    _addComm(_crew('sensor'), line || `Hull breached! Organism inside the ship! Hull ${snap.hullPct}%.`, 'warning');
  }

  function onOrganismProgress(pct) {
    _updateScenario('hull_critical');
    if (pct > 80) {
      const line = _anpcSpeak('tactical', 'emergency', { reason: `imminent breach — ${pct}%` });
      _addComm(_crew('tactical'), line || `Imminent breach — ${pct}%! Land ${_pick(V.urgent)}!`, 'warning');
    } else if (pct > 50) {
      const line = _anpcSpeak('sensor', 'hazard_warning', { hazard: `organism at ${pct}%, cockpit seal failing` });
      _addComm(_crew('sensor'), line || `Organism at ${pct}%. Cockpit seal failing.`, 'warning');
    } else {
      const line = _anpcSpeak('sensor', 'hazard_warning', { hazard: `organism in ventilation — ${pct}% to cockpit` });
      _addComm(_crew('sensor'), line || `Organism in ventilation — ${pct}% to cockpit.`, 'warning');
    }
  }

  function onEmergencyRTB() {
    _updateScenario('hull_critical');
    const line = _anpcSpeak('command', 'emergency', { reason: 'emergency RTB, all power to engines' });
    _addComm(_crew('command'), line || `Emergency RTB engaged! All power to engines!`, 'warning');
  }

  function onEMP(count, duration) {
    if (count > 0) {
      const line = _anpcSpeak('tactical', 'tactical_coord', { remaining: count, intel: `EMP — ${count} disabled for ${duration}s` });
      _addComm(_crew('tactical'), line || `EMP — ${count} ${count === 1 ? _pick(V.contact) : _pick(V.contacts)} disabled. ${duration}s.`, 'base');
    } else {
      const line = _anpcSpeak('tactical', 'status_update', { status: `EMP fired, no contacts in range` });
      _addComm(_crew('tactical'), line || `EMP fired — no ${_pick(V.contacts)} in range.`, 'base');
    }
  }

  function onWeaponSwitch(name) {
    const line = _anpcSpeak('tactical', 'status_update', { status: `weapon: ${name}` });
    _addComm(_crew('tactical'), line || `Weapon: ${name}`, 'base');
  }

  function onDockRequest() {
    const snap = _snap();
    const line = _anpcSpeak('ops', 'status_update', { status: `dock request approved, ${_composePlayerStatus(snap)}` });
    _addComm(_crew('ops'), line || `${_cs()}, dock request approved. Fly to base. ${_composePlayerStatus(snap)}.`, 'base');
  }

  function onPredatorConsume() {
    const snap = _snap();
    _updateScenario('ally_destroyed');
    const line = _anpcSpeak('sensor', 'emergency', { reason: `fighter consumed by Predator, pilot lost, ${snap.totalHostile} remain` });
    _addComm(_crew('sensor'), line || `Fighter consumed by ${_pick(V.predator)}. Pilot lost. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'warning');
  }

  function onPredatorMalfunction() {
    const snap = _snap();
    const line = _anpcSpeak('science', 'tactical_coord', { intel: `Predator turned on its own — hive control breakdown`, remaining: snap.totalHostile });
    _addComm(_crew('science'), line || `${_pick(V.predator)} turned on its own — hive control breakdown. ${snap.totalHostile} ${_pick(V.contacts)} remain.`, 'base');
  }

  function onHiveDiscovered(hive) {
    _updateScenario('boss_spawn');
    _transitionWingmen('hostiles_confirmed');
    _addComm(_crew('sensor'), `${_pick(V.hive)} ${_pick(V.detected)}! Bearing ${_bearingOf(hive)}.`, 'warning');
    _addComm(_crew('command'), `Primary objective located. ${_pick(V.clearEscorts)}.`, 'warning');
    // Wingman reacts to boss
    const wingReact = _wingmanSpeak('combat_engage');
    if (wingReact) _addComm(wingReact.sender, wingReact.msg, wingReact.type);
  }

  function onDecontamination() {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: `decontamination complete, hull ${snap.hullPct}%` });
    _addComm(_crew('deck'), line || `Decontamination complete. Hull ${snap.hullPct}%.`, 'base');
  }

  function onBayReady() {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: `wave ${_state.wave} standing by, ${_composePlayerStatus(snap)}`, wave: _state.wave });
    _addComm(_crew('deck'), line || `${_cs()}, wave ${_state.wave} standing by. ${_composePlayerStatus(snap)}. Launch when ready.`, 'base');
  }

  function onLaunchStart() {
    const wave = _state.wave;
    const snap = _snap();
    const basePct = snap.basePct;

    // ── Phase 1 (0s): Deck officer — launch commit (ANPC: Lighthouse) ──
    const deckLine = _anpcForceSpeak('deck', 'launch_prep', { wave, status: `launching wave ${wave}` });
    _addComm(_crew('deck'), deckLine || `${_cs()}, ${_pick(V.launchReady)}. Launching wave ${wave}.`, 'base');

    // ── Phase 2 (~1.5s): Command — mission context (ANPC: Resolute Actual) ──
    setTimeout(() => {
      const s = _snap();
      const pilotSlot = Math.max(1, _state.maxLives - _state.livesRemaining + 1);
      const baseNote = basePct < 50 ? ` Resolute hull at ${basePct}% — she needs cover.` : '';
      let brief;
      if (wave === 1) {
        brief = `First sortie — calibrate weapons on initial contacts.${baseNote}`;
      } else {
        const intensity = s.totalHostile > 10 ? 'Heavy resistance expected.' : s.totalHostile > 5 ? 'Moderate opposition.' : 'Manageable numbers.';
        brief = `${intensity}${baseNote}`;
      }
      const cmdLine = _anpcForceSpeak('command', 'launch_prep', { wave, pilotSlot, maxLives: _state.maxLives, missionBrief: brief });
      _addComm(_crew('command'), cmdLine || `Pilot ${pilotSlot} of ${_state.maxLives}, wave ${wave}. ${brief}`, 'base');
    }, 1500);

    // ── Phase 3 (~3.5s): Sensor — threat briefing (ANPC: Scope) ──
    setTimeout(() => {
      const s = _snap();
      let threats, watchLine;
      if (wave >= 2) {
        const tList = [];
        if (wave >= 6 && (wave === 6 || (wave - 6) % 5 === 0)) tList.push(_pick(V.dreadnought));
        if (wave >= 4) tList.push(`${_pick(V.predator)}s`);
        if (wave >= 3) tList.push(`${_pick(V.bomber)}s`);
        if (wave >= 2) tList.push(`${_pick(V.interceptor)}s`);
        tList.push(`${_pick(V.drone)}s`);
        threats = tList.join(', ');
        watchLine = _pick(V.watch);
      } else {
        threats = 'light contacts only';
        watchLine = 'training-weight targets';
      }
      const sensLine = _anpcForceSpeak('sensor', 'threat_brief', { threats, watchPhrase: watchLine });
      _addComm(_crew('sensor'), sensLine || `${_pick(V.threat)}: ${_pick(V.sensorReading)} ${threats}. ${watchLine}.`, wave >= 2 ? 'warning' : 'info');
    }, 3500);

    // ── Phase 4 (~5.5s): Tactical — advice (ANPC: XO Tanaka) ──
    setTimeout(() => {
      let advice;
      if (wave >= 6 && (wave === 6 || (wave - 6) % 5 === 0)) {
        advice = `${_pick(V.dreadnought)} intel on file. ${_pick(V.useTorps)}.`;
      } else if (wave >= 4) {
        advice = `${_pick(V.predator)} expected. ${_pick(V.targetWeak)}.`;
      } else if (wave >= 3) {
        advice = `${_pick(V.bomber)}s will target the Resolute. ${_pick(V.protect)}.`;
      } else if (wave >= 2) {
        advice = `${_pick(V.interceptor)}s inbound — they're fast. ${_pick(V.watch)}.`;
      } else {
        advice = `Weapons free on all targets.`;
      }
      const tacLine = _anpcForceSpeak('tactical', 'tactical_coord', {
        intel: advice, tacticalAdvice: advice, remaining: 0,
      });
      _addComm(_crew('tactical'), tacLine || `${advice} ${_pick(V.combatReady)}.`, wave >= 3 ? 'warning' : 'base');
    }, 5500);

    // ── Phase 5 (~7.5s): XO — launch call (ANPC: Resolute Actual) ──
    setTimeout(() => {
      const goLine = _anpcForceSpeak('command', 'launch_go', {});
      _addComm(_crew('command'), goLine || `${_pick(V.launchGo)}`, 'warning');
    }, 7500);

    // ── Phase 6 (~9s): Command — send-off (ANPC: Resolute Actual) ──
    setTimeout(() => {
      const sendLine = _anpcForceSpeak('command', 'launch_sendoff', {});
      _addComm(_crew('command'), sendLine || `${_pick(V.launchGodspeed)}`, 'base');
    }, 9000);
  }

  function onPracticeStart() {
    const snap = _snap();
    const line = _anpcSpeak('deck', 'status_update', { status: 'practice range active, targets deployed' });
    _addComm(_crew('deck'), line || `${_cs()}, practice range active. Targets deployed. Press Escape when ready.`, 'base');
  }

  function onPracticeEnd() {
    const line = _anpcSpeak('deck', 'status_update', { status: 'practice complete, preparing for launch' });
    _addComm(_crew('deck'), line || `${_cs()}, practice complete. Preparing for launch.`, 'base');
  }

  function onPause() { _addComm('SYSTEM', 'Game paused.', 'base'); }
  function onResume() { _addComm('SYSTEM', 'Game resumed.', 'base'); }

  function onSecured() {
    const line = _anpcSpeak('deck', 'status_update', { status: `fighter secured, wave ${_state.wave} standing by` });
    _addComm(_crew('deck'), line || `${_cs()}, fighter secured. Wave ${_state.wave} standing by.`, 'base');
  }

  function onWaveComplete(prevWave) {
    const snap = _snap();
    _updateScenario('objective_complete');
    const line = _anpcSpeak('command', 'sector_clear', { kills: _state.kills, wave: prevWave });
    _addComm(_crew('command'), line || `Wave ${prevWave} complete. ${_state.kills} kills. Rearming for wave ${_state.wave}.`, 'base');
  }

  function onNextWaveIntel() {
    const snap = _snap();
    const threats = [];
    if (_state.wave >= 6 && (_state.wave === 6 || (_state.wave - 6) % 5 === 0)) threats.push(_pick(V.dreadnought));
    if (_state.wave >= 4) threats.push(_pick(V.predator));
    if (_state.wave >= 3) threats.push(_pick(V.bomber));
    if (_state.wave >= 2) threats.push(_pick(V.baseship));
    const threatStr = threats.length ? threats.join(', ') : 'standard formation';
    const line = _anpcSpeak('sensor', 'threat_brief', { threats: threatStr, watchPhrase: `base ${V.hullStatus(snap.basePct)}` });
    if (line) {
      _addComm(_crew('sensor'), line, 'warning');
    } else {
      const intel = threats.length ? `${threats[0]} signature ${_pick(V.detected)}.` : `Standard formation expected.`;
      _addComm(_crew('sensor'), `Wave ${_state.wave} intel: ${intel} Base ${V.hullStatus(snap.basePct)}.`, 'warning');
    }
  }

  // ── Autonomous observation — runs every frame, watches for changes ──

  function observe(dt) {
    if (!_state || !_state.player || _state.player.markedForDeletion || _state.phase !== 'combat') return;
    _tickCooldowns(dt);

    // Update ANPC system
    if (_anpcReady) SFANPC.update(dt);

    const snap = _snap();

    // ── New enemy types appearing this wave ──
    _observeNewTypes(snap);

    // ── Player taking damage ──
    _observeDamage(snap);

    // ── Fuel warnings ──
    _observeFuel(snap);

    // ── Base under threat ──
    _observeBase(snap);

    // Update memory
    _mem.lastHostileCount = snap.totalHostile;
    _mem.lastHullPct = snap.hullPct;
    _mem.lastShieldPct = snap.shieldPct;
    _mem.lastFuelPct = snap.fuelPct;
    _mem.lastBasePct = snap.basePct;
    _mem.lastKills = _state.kills;
  }

  function _observeNewTypes(snap) {
    // Detect new enemy types that appeared since last check
    const types = [];
    if (snap.interceptors > 0 && !_mem.waveTypesAnnounced.has('interceptor')) { types.push('interceptor'); _mem.waveTypesAnnounced.add('interceptor'); }
    if (snap.bombers > 0 && !_mem.waveTypesAnnounced.has('bomber')) { types.push('bomber'); _mem.waveTypesAnnounced.add('bomber'); }
    if (snap.predators > 0 && !_mem.waveTypesAnnounced.has('predator')) { types.push('predator'); _mem.waveTypesAnnounced.add('predator'); }
    if (snap.dreadnoughts > 0 && !_mem.waveTypesAnnounced.has('dreadnought')) { types.push('dreadnought'); _mem.waveTypesAnnounced.add('dreadnought'); }
    if (snap.alienMothership && !_mem.waveTypesAnnounced.has('alien-baseship')) { types.push('alien-baseship'); _mem.waveTypesAnnounced.add('alien-baseship'); }

    if (types.length > 0 && !_onCooldown('newtype', 3.0)) {
      _updateScenario('new_contacts');

      // ANPC sensor operator reports
      const anpcLine = _anpcSpeak('sensor', 'combat_engage', {
        count: snap.totalHostile - _mem.lastHostileCount,
        target: types[0],
      });
      _addComm(_crew('sensor'), anpcLine || _composeNewContacts(snap, snap.totalHostile - _mem.lastHostileCount, types), 'warning');

      // Tactical advice for dangerous types
      if (types.includes('dreadnought') && snap.torpCount > 0) {
        _addComm(_crew('tactical'), `${_pick(V.dreadnought)} class. ${_pick(V.useTorps)}.`, 'warning');
      }
      if (types.includes('predator')) {
        _addComm(_crew('science'), `${_pick(V.predator)} — heavy armor. ${_pick(V.targetWeak)}.`, 'warning');
      }
      if (types.includes('bomber') && snap.basePct < 70) {
        _addComm(_crew('tactical'), `${_pick(V.bomber)}s heading for the Resolute. ${_pick(V.protect)}.`, 'warning');
      }
    }
  }

  function _observeDamage(snap) {
    // Hull took a big hit
    const hullDrop = _mem.lastHullPct - snap.hullPct;
    if (hullDrop >= 15 && !_onCooldown('hull_warn', 5.0)) {
      _updateScenario('hull_critical');
      const line = _anpcSpeak('ops', 'damage_report', { hullPct: snap.hullPct });
      _addComm(_crew('ops'), line || _composeDamageReport(snap, 'hull'), 'warning');
    }
    // Hull critical threshold
    if (snap.hullPct < 25 && _mem.lastHullPct >= 25 && !_onCooldown('hull_crit', 8.0)) {
      _updateScenario('hull_critical');
      const emergLine = _anpcSpeak('ops', 'emergency', { reason: `hull at ${snap.hullPct}%` });
      _addComm(_crew('ops'), emergLine || `${_cs()}, hull ${snap.hullPct}%! ${_pick(V.critical)}! RTB or seek medical frigate.`, 'warning');
    }
    // Shields just went down
    if (snap.shieldPct <= 0 && _mem.lastShieldPct > 0 && !_onCooldown('shields_down', 6.0)) {
      _updateScenario('hull_critical');
      const line = _anpcSpeak('ops', 'damage_report', { hullPct: snap.hullPct, shieldStatus: 'down' });
      _addComm(_crew('ops'), line || _composeDamageReport(snap, 'shields'), 'warning');
    }
  }

  function _observeFuel(snap) {
    if (snap.fuelPct < 15 && _mem.lastFuelPct >= 15 && !_onCooldown('fuel_warn', 10.0)) {
      const line = _anpcSpeak('ops', 'hazard_warning', { hazard: `fuel critical at ${snap.fuelPct}% — conserve afterburner` });
      _addComm(_crew('ops'), line || `${_cs()}, ${V.fuelStatus(snap.fuelPct)} at ${snap.fuelPct}%. Conserve afterburner.`, 'warning');
    }
  }

  function _observeBase(snap) {
    const baseDrop = _mem.lastBasePct - snap.basePct;
    if (baseDrop >= 10 && !_onCooldown('base_warn', 6.0)) {
      _updateScenario('base_critical');
      const line = _anpcSpeak('command', 'hazard_warning', { hazard: `base hull dropping, ${snap.basePct}%` });
      _addComm(_crew('command'), line || _composeDamageReport(snap, 'base'), 'warning');
    }
    if (snap.basePct < 15 && _mem.lastBasePct >= 15 && !_onCooldown('base_crit', 10.0)) {
      _updateScenario('base_critical');
      const emergLine = _anpcSpeak('command', 'emergency', { reason: 'base hull critical' });
      _addComm(_crew('command'), emergLine || `Base hull ${snap.basePct}%! ${_pick(V.critical)}! All fighters ${_pick(V.protect)} ${_pick(V.urgent)}!`, 'warning');
    }
  }

  // ── Periodic chatter — autonomous situational reports ──

  function generateChatter() {
    if (!_state || !_state.player || _state.phase !== 'combat') return null;
    const snap = _snap();
    const roll = Math.random();

    // Update ANPC system tick
    if (_anpcReady) SFANPC.update(0.1);

    if (roll < 0.3) {
      // Tactical chatter from CIC
      const anpcTac = _anpcSpeak('tactical', 'tactical_coord', { remaining: snap.totalHostile });
      if (anpcTac) return { sender: _crew('tactical'), msg: anpcTac, type: 'base' };
      return { sender: _crew('tactical'), msg: _composeTacticalChatter(snap), type: 'base' };
    } else if (roll < 0.6) {
      // Wingman combat chatter (ANPC personality-driven)
      const wingChat = _wingmanSpeak(Math.random() < 0.5 ? 'combat_engage' : 'morale_banter');
      if (wingChat) return wingChat;
      return _composeAllyChatter(snap);
    } else if (roll < 0.8) {
      // Sensor warnings
      return { sender: _crew('sensor'), msg: _composeWarningChatter(snap), type: 'warning' };
    } else {
      // Enemy ace intercepted comms (rare, only if active)
      const aceChat = _enemyAceSpeak('morale_banter');
      if (aceChat) return { sender: aceChat.sender, msg: aceChat.msg, type: 'warning' };
      // Fallback to ally chatter
      return _composeAllyChatter(snap);
    }
  }

  function _composeTacticalChatter(snap) {
    // Observe the battlefield and report what matters most
    if (snap.basePct < 15 && snap.bomberNearBase) return `Base ${V.hullStatus(snap.basePct)}! ${_pick(V.bomber)} at ${_bearingOf(snap.bomberNearBase)} heading for the Resolute. Intercept ${_pick(V.urgent)}.`;
    if (snap.basePct < 15) return `Base hull ${snap.basePct}%. ${_pick(V.protect)} ${_pick(V.urgent)}.`;
    if (snap.basePct < 35 && snap.bomberNearBase) return `Base ${snap.basePct}%. ${_pick(V.bomber)} at ${_bearingOf(snap.bomberNearBase)}. Stop it.`;
    if (snap.threatsNearBase >= 3 && snap.basePct < 60) return `${snap.threatsNearBase} ${_pick(V.contacts)} closing on the Resolute. Base ${snap.basePct}%. Fall back and ${_pick(V.protect)}.`;
    if (snap.threatsNearBase >= 4) return `Multiple ${_pick(V.contacts)} inside base perimeter. ${_pick(V.protect)}.`;
    if (snap.alienMothership && snap.totalHostile <= 3 && snap.basePct > 50) return `Escorts thinned out. ${_pick(V.baseship)} at ${_bearingOf(snap.alienMothership)}, hull ${snap.alienMothershipHullPct}%. Hit her now.`;
    if (snap.alienMothership && snap.alienMothershipHullPct < 30) return `${_pick(V.baseship)} at ${_bearingOf(snap.alienMothership)}, hull ${snap.alienMothershipHullPct}%. Almost done — pour it on!`;
    if (snap.dreadnoughts > 0 && snap.priorityTarget && snap.priorityType === 'dreadnought') return `${_pick(V.dreadnought)} at ${_bearingOf(snap.priorityTarget)}. ${_pick(V.useTorps)}.`;
    if (snap.predators > 0 && snap.closestType === 'predator' && snap.closestM < 600) return `${_pick(V.predator)} at ${_bearing(snap.closestPos)}. ${_pick(V.move)} — plasma range.`;
    if (snap.bombers > 1 && snap.bomberNearBase) return `${snap.bombers} ${_pick(V.bomber)}s active. Nearest to base at ${_bearingOf(snap.bomberNearBase)}.`;
    if (snap.totalHostile > 10 && snap.priorityTarget) return `${snap.totalHostile} ${_pick(V.contacts)}. Priority at ${_bearingOf(snap.priorityTarget)}.`;
    if (snap.totalHostile > 0 && snap.closestPos) return `${_pick(V.contact)} at ${_bearing(snap.closestPos)}. ${snap.totalHostile} remaining.`;
    // Hive attack window
    if (snap.alienHive) {
      if (snap.alienHiveHullPct < 25) return `${_pick(V.hive)} at ${snap.alienHiveHullPct}%. Finish it!`;
      if (snap.totalHostile <= 2) return `Window open. ${_pick(V.hive)} at ${_bearingOf(snap.alienHive)}. Hit it.`;
      return `${_pick(V.hive)} at ${_bearingOf(snap.alienHive)}, hull ${snap.alienHiveHullPct}%.`;
    }
    return `${snap.totalHostile} ${_pick(V.contacts)} remaining. ${_pick(V.watch)}.`;
  }

  function _composeAllyChatter(snap) {
    // Try ANPC wingman dialog first
    const wingChat = _wingmanSpeak(Math.random() < 0.6 ? 'combat_engage' : 'morale_banter');
    if (wingChat) return wingChat;

    // Legacy fallback
    const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
    const type = snap.closestType;
    const pos = snap.closestPos;
    if (type === 'interceptor' && snap.closestM < 400 && pos) return { sender: callsign, msg: `${_pick(V.interceptor)} at ${_bearing(pos)}! ${_pick(V.engaging)}.`, type: 'ally' };
    if (type === 'bomber' && snap.closestM < 800 && pos) return { sender: callsign, msg: `${_pick(V.bomber)} at ${_bearing(pos)} heading for base. ${_pick(V.engaging)}.`, type: 'ally' };
    if (type === 'predator' && pos) return { sender: callsign, msg: `${_pick(V.predator)} at ${_bearing(pos)}. Keeping distance.`, type: 'ally' };
    if (snap.totalHostile > 8 && snap.priorityTarget) return { sender: callsign, msg: `Heavy ${_pick(V.contacts)} — ${snap.totalHostile}. Priority at ${_bearingOf(snap.priorityTarget)}. Could use help.`, type: 'ally' };
    if (snap.totalHostile > 0 && pos) return { sender: callsign, msg: `${snap.totalHostile} on scope. ${_pick(V.engaging)}.`, type: 'ally' };
    return { sender: callsign, msg: `Sector quiet. Holding formation.`, type: 'ally' };
  }

  function _composeWarningChatter(snap) {
    if (snap.hullPct < 25) return `${_cs()}, hull ${snap.hullPct}%. Seek repair or RTB.`;
    if (snap.shieldPct <= 0 && snap.hullPct < 60) return `${_cs()}, ${V.shieldStatus(snap.shieldPct)}. Hull ${snap.hullPct}%. Avoid direct engagement.`;
    if (snap.fuelPct < 15) return `${_cs()}, ${V.fuelStatus(snap.fuelPct)} at ${snap.fuelPct}%.`;
    if (snap.torpCount === 0 && snap.dreadnoughts > 0) return `${_cs()}, no torpedoes. ${_pick(V.dreadnought)} still active — resupply needed.`;
    if (snap.basePct < 25) return `Base ${V.hullStatus(snap.basePct)} at ${snap.basePct}%. ${_pick(V.protect)}.`;
    if (snap.bombers > 0 && snap.basePct < 50 && snap.bomberNearBase) return `${_pick(V.bomber)} at ${_bearingOf(snap.bomberNearBase)} heading for base. Base ${snap.basePct}%.`;
    if (snap.predators > 0 && snap.priorityTarget && snap.priorityType === 'predator') return `${_pick(V.predator)} at ${_bearingOf(snap.priorityTarget)}. Avoid close range.`;
    if (snap.closestM < 300 && snap.closestType && snap.closestPos) return `Proximity: ${snap.closestType} at ${_bearing(snap.closestPos)}. ${_pick(V.watch)}.`;
    return `Status: ${snap.totalHostile} ${_pick(V.contacts)}, hull ${snap.hullPct}%, base ${snap.basePct}%.`;
  }

  // ── Init ──

  function init(deps) {
    _state = deps.state;
    _addComm = deps.addComm;
    _snap = deps.snap;
    _crew = deps.crew;
    _cs = deps.cs;
    _bearing = deps.bearing;
    _bearingOf = deps.bearingOf;
    _dim = deps.dim;
    _countHostiles = deps.countHostiles;

    // Initialize ANPC system if available
    if (window.SFANPC) {
      SFANPC.initCharacters();
      _anpcReady = true;
    }
  }

  function resetWave() {
    _mem.waveTypesAnnounced.clear();
    _mem.phaseAnnounced = {};
    if (_anpcReady) {
      // Reset scenario toward patrol between waves
      SFANPC.resetScenario('patrol');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ANPC-DRIVEN DIALOG LAYER
  // ══════════════════════════════════════════════════════════════════

  /**
   * Map crew role to ANPC character for personality-driven dialog.
   * Falls back to legacy compose system if ANPC unavailable.
   */
  const _roleToAnpc = {
    sensor: 'ANPC-SF-0005', // Ens. Park "Scope"
    command: 'ANPC-SF-0001', // Cdr. Vasquez "Resolute Actual"
    tactical: 'ANPC-SF-0004', // XO Tanaka
    ops: 'ANPC-SF-0003', // Dr. Okafor "Lighthouse"
    deck: 'ANPC-SF-0003', // Lighthouse (base ops)
    science: 'ANPC-SF-0005', // Ens. Park
  };

  /**
   * Try to generate ANPC-driven dialog for a given event category.
   * Returns assembled text or null (falls back to legacy compose).
   */
  function _anpcSpeak(role, category, extraContext) {
    if (!_anpcReady) return null;
    const anpcId = _roleToAnpc[role];
    if (!anpcId) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || 0,
      bearing: snap.closestPos ? _bearing(snap.closestPos) : '000',
      distance: snap.closestM || '?',
      hullPct: snap.hullPct,
      shieldStatus: V.shieldStatus(snap.shieldPct),
      remaining: snap.totalHostile,
      direction: Math.random() > 0.5 ? 'left' : 'right',
      position: 'wing',
      callsign: _cs(),
      formation: 'V-Formation',
      ...(extraContext || {}),
    };

    const result = SFANPC.speak(anpcId, category, context);
    return result ? result.text : null;
  }

  /**
   * Force ANPC dialog (bypass cooldown). For critical/timed events.
   * Returns assembled text or null.
   */
  function _anpcForceSpeak(role, category, extraContext) {
    if (!_anpcReady) return null;
    const anpcId = _roleToAnpc[role];
    if (!anpcId) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || 0,
      bearing: snap.closestPos ? _bearing(snap.closestPos) : '000',
      distance: snap.closestM || '?',
      hullPct: snap.hullPct,
      shieldStatus: V.shieldStatus(snap.shieldPct),
      remaining: snap.totalHostile,
      direction: Math.random() > 0.5 ? 'left' : 'right',
      position: 'wing',
      callsign: _cs(),
      formation: 'V-Formation',
      ...(extraContext || {}),
    };

    const result = SFANPC.forceSpeak(anpcId, category, context);
    return result ? result.text : null;
  }

  /**
   * Try wingman ANPC dialog (Hotshot or Frostbite).
   */
  function _wingmanSpeak(category, extraContext) {
    if (!_anpcReady) return null;
    // Alternate between wingmen
    const wingmenIds = ['ANPC-SF-0042', 'ANPC-SF-0043']; // Hotshot, Frostbite
    const pick = wingmenIds[Math.floor(Math.random() * wingmenIds.length)];
    const anpc = SFANPC.get(pick);
    if (!anpc || !anpc.active) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: snap.closestType || 'hostile',
      count: snap.totalHostile || 0,
      bearing: snap.closestPos ? _bearing(snap.closestPos) : '000',
      distance: snap.closestM || '?',
      hullPct: Math.round(anpc.hull * 100),
      shieldStatus: anpc.shields > 0 ? 'holding' : 'gone',
      remaining: snap.totalHostile,
      killCount: anpc.missionKills,
      ...(extraContext || {}),
    };

    const result = SFANPC.speak(pick, category, context);
    if (result) {
      return { sender: result.sender, msg: result.text, type: 'ally' };
    }
    return null;
  }

  /**
   * Enemy ace dialog (intercepted comms on CH-ENM).
   */
  function _enemyAceSpeak(category, extraContext) {
    if (!_anpcReady) return null;
    const nightshade = SFANPC.get('ANPC-SF-E-0001');
    if (!nightshade || !nightshade.active) return null;

    const snap = _snap();
    const context = {
      playerCallsign: _cs(),
      target: 'you',
      count: snap.totalHostile,
      hullPct: Math.round(nightshade.hull * 100),
      remaining: snap.totalHostile,
      ...(extraContext || {}),
    };

    const result = SFANPC.forceSpeak('ANPC-SF-E-0001', category, context);
    if (result) {
      return { sender: `[INTERCEPTED] ${result.sender}`, msg: result.text, type: 'enemy' };
    }
    return null;
  }

  /**
   * Update ANPC scenario vector based on game events.
   */
  function _updateScenario(eventName) {
    if (_anpcReady) SFANPC.applyEvent(eventName);
  }

  /**
   * Transition all active wingman ANPCs to a new combat state.
   */
  function _transitionWingmen(condition) {
    if (!_anpcReady) return;
    const wingmen = SFANPC.getByRole('SF-WING');
    for (const w of wingmen) {
      w.transition(condition);
    }
  }

  return {
    init, observe, generateChatter, resetWave,
    // Event signals — core.js calls these instead of hardcoding dialog
    onWaveStart, onLaunchClear, onKill, onVictory,
    onMilitaryLost, onCivilianLost, onAllyDown,
    onPlayerDestroyed, onRespawnReady, onWaveClear,
    onAutopilotEngage, onDock,
    onTankerDeploy, onTankerDock, onTankerDone,
    onMedicDeploy, onMedicDock, onMedicProgress, onMedicDone,
    onSupportDenied, onSupportAccepted, onSupportDock, onSupportReturn, onSupportComplete,
    onHeavyOrdnance, onGoodHit, onPlasmaHit,
    onDisabled, onSystemsRestore,
    onHullBreach, onOrganismClear, onOrganismDeep,
    onOrganismInside, onOrganismProgress, onEmergencyRTB,
    onEMP, onWeaponSwitch, onDockRequest,
    onPredatorConsume, onPredatorMalfunction,
    onHiveDiscovered, onDecontamination, onBayReady,
    onLaunchStart, onPracticeStart, onPracticeEnd,
    onPause, onResume, onSecured,
    onWaveComplete, onNextWaveIntel,
  };

})();

window.SFAnnouncer = SFAnnouncer;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARFIGHTER — PROGRESSION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Persistent career tracking: ranks, kill tallies, weapon/ship unlocks,
 * XP, credits, and between-wave upgrades.
 *
 * All state persists in localStorage so progress survives page reload.
 * Designed to reward longevity and give players reasons to come back.
 *
 * Rank Ladder:  Ensign → Lieutenant → Captain → Major → Colonel → Commander
 * Kill Tally:   Per-type alien silhouette icons (like fighter pilot nose art)
 * Unlock Tree:  Weapons, ship variants, and passive upgrades gated by rank/XP
 * Credits:      Earned per kill/wave — spent in between-wave shop
 */

const SFProgression = (function () {
  'use strict';

  const STORAGE_KEY = 'sf_pilot_career';

  // ═══════════════════════════════════════════════════════════════════════
  // RANK LADDER
  // ═══════════════════════════════════════════════════════════════════════
  const RANKS = [
    { id: 'ensign', name: 'Ensign', abbr: 'ENS', xp: 0, icon: '◇', pips: 1 },
    { id: 'ltjg', name: 'Lt. Junior', abbr: 'LTJG', xp: 500, icon: '◆', pips: 1 },
    { id: 'lieutenant', name: 'Lieutenant', abbr: 'LT', xp: 1500, icon: '◆', pips: 2 },
    { id: 'ltcmdr', name: 'Lt. Commander', abbr: 'LCDR', xp: 4000, icon: '★', pips: 2 },
    { id: 'captain', name: 'Captain', abbr: 'CAPT', xp: 8000, icon: '★', pips: 3 },
    { id: 'major', name: 'Major', abbr: 'MAJ', xp: 15000, icon: '★★', pips: 4 },
    { id: 'colonel', name: 'Colonel', abbr: 'COL', xp: 30000, icon: '★★', pips: 5 },
    { id: 'commander', name: 'Commander', abbr: 'CDR', xp: 60000, icon: '★★★', pips: 6 },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // XP AWARDS (per action)
  // ═══════════════════════════════════════════════════════════════════════
  const XP_AWARDS = {
    kill_enemy: 20, kill_interceptor: 50, kill_bomber: 60,
    kill_predator: 100, kill_dreadnought: 500,
    kill_alien_baseship: 300, kill_egg: 5, kill_youngling: 10,
    wave_complete: 100, wave_no_damage: 200,
    wingman_saved: 50, baseship_defended: 150,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // CREDIT AWARDS (currency for upgrade shop)
  // ═══════════════════════════════════════════════════════════════════════
  const CREDIT_AWARDS = {
    kill_enemy: 10, kill_interceptor: 25, kill_bomber: 30,
    kill_predator: 75, kill_dreadnought: 300,
    kill_alien_baseship: 200, wave_complete: 50,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // KILL TALLY — alien silhouette icons per enemy type
  // ═══════════════════════════════════════════════════════════════════════
  const TALLY_ICONS = {
    enemy: '👾', interceptor: '🛸',
    bomber: '💣', predator: '🐛',
    dreadnought: '☠️', 'alien-baseship': '🔴',
    egg: '🥚', youngling: '🪱',
  };

  // ═══════════════════════════════════════════════════════════════════════
  // UNLOCK TREE — gated by rank
  // ═══════════════════════════════════════════════════════════════════════
  const UNLOCKS = [
    // Weapons
    { id: 'laser', type: 'weapon', name: 'Laser Cannon', rank: 'ensign', desc: 'Standard twin laser — reliable, efficient.' },
    { id: 'machinegun', type: 'weapon', name: 'Gatling Gun', rank: 'ensign', desc: 'Rapid-fire kinetic rounds. Low damage, high volume.' },
    { id: 'torpedo', type: 'weapon', name: 'Homing Torpedo', rank: 'ensign', desc: 'Lock-on guided warhead. Limited ammo.' },
    { id: 'pulse', type: 'weapon', name: 'EMP Pulse', rank: 'lieutenant', desc: 'Electromagnetic burst. Disables enemies in radius.' },
    { id: 'plasma', type: 'weapon', name: 'Plasma Cannon', rank: 'ltcmdr', desc: 'Superheated plasma bolts. Slow, devastating.' },
    { id: 'beam', type: 'weapon', name: 'Mining Beam', rank: 'captain', desc: 'Continuous damage beam. Hold to fire.' },
    { id: 'cluster', type: 'weapon', name: 'Cluster Missiles', rank: 'major', desc: 'Salvo of 6 micro-missiles. Area denial.' },
    { id: 'nova', type: 'weapon', name: 'Nova Bomb', rank: 'colonel', desc: 'Massive AoE. One per sortie. Clears the field.' },

    // Ship variants
    { id: 'ship_fighter', type: 'ship', name: 'SF-01 Viper', rank: 'ensign', desc: 'Standard interceptor. Balanced speed and armor.' },
    { id: 'ship_heavy', type: 'ship', name: 'SF-02 Warhog', rank: 'captain', desc: 'Heavy fighter. +50% hull, −20% speed, +2 torpedoes.' },
    { id: 'ship_stealth', type: 'ship', name: 'SF-03 Phantom', rank: 'major', desc: 'Stealth fighter. Reduced radar signature, +30% speed.' },
    { id: 'ship_command', type: 'ship', name: 'SF-04 Sovereign', rank: 'commander', desc: 'Command ship. Issue squad orders, enhanced radar, all weapons.' },

    // Passive upgrades (purchased with credits between waves)
    { id: 'hull_plating', type: 'upgrade', name: 'Hull Plating I', rank: 'ensign', desc: '+20 max hull.', cost: 100, effect: { 'player.hull': 20 } },
    { id: 'hull_plating2', type: 'upgrade', name: 'Hull Plating II', rank: 'lieutenant', desc: '+30 max hull.', cost: 250, effect: { 'player.hull': 30 } },
    { id: 'shield_cap', type: 'upgrade', name: 'Shield Capacitor', rank: 'ensign', desc: '+25 max shields.', cost: 120, effect: { 'player.shields': 25 } },
    { id: 'fuel_cell', type: 'upgrade', name: 'Fuel Cell', rank: 'ensign', desc: '+20 fuel capacity.', cost: 80, effect: { 'player.fuel': 20 } },
    { id: 'torp_rack', type: 'upgrade', name: 'Torpedo Rack', rank: 'ltjg', desc: '+4 torpedo capacity.', cost: 200, effect: { 'player.torpedoes': 4 } },
    { id: 'afterburner2', type: 'upgrade', name: 'Afterburner Mk.II', rank: 'lieutenant', desc: '+100 afterburner speed.', cost: 300, effect: { 'player.afterburnerSpeed': 100 } },
    { id: 'laser_dmg', type: 'upgrade', name: 'Laser Amplifier', rank: 'ltcmdr', desc: '+5 laser damage.', cost: 350, effect: { 'weapon.laser.damage': 5 } },
    { id: 'torp_dmg', type: 'upgrade', name: 'Warhead Upgrade', rank: 'captain', desc: '+30 torpedo damage.', cost: 400, effect: { 'weapon.torpedo.damage': 30 } },
    { id: 'regen', type: 'upgrade', name: 'Shield Regen', rank: 'major', desc: 'Shields slowly regenerate in combat.', cost: 600, effect: { _special: 'shield_regen' } },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // DEFAULT CAREER PROFILE
  // ═══════════════════════════════════════════════════════════════════════
  function _defaultCareer() {
    return {
      xp: 0,
      credits: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalWaves: 0,
      totalFlightTime: 0,   // seconds
      bestWave: 0,
      bestScore: 0,
      gamesPlayed: 0,
      killTally: {},        // { enemy: 42, predator: 3, ... }
      purchasedUpgrades: [], // array of unlock ids
      selectedShip: 'ship_fighter',
      achievements: [],
      createdAt: Date.now(),
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PERSISTENCE — localStorage read/write
  // ═══════════════════════════════════════════════════════════════════════
  let _career = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _career = raw ? Object.assign(_defaultCareer(), JSON.parse(raw)) : _defaultCareer();
    } catch {
      _career = _defaultCareer();
    }
    return _career;
  }

  function save() {
    if (!_career) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_career)); } catch { /* quota */ }
  }

  function career() {
    if (!_career) load();
    return _career;
  }

  function reset() {
    _career = _defaultCareer();
    save();
    return _career;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RANK COMPUTATION
  // ═══════════════════════════════════════════════════════════════════════
  function getRank(xp) {
    if (xp === undefined) xp = career().xp;
    let rank = RANKS[0];
    for (const r of RANKS) {
      if (xp >= r.xp) rank = r;
      else break;
    }
    return rank;
  }

  function getNextRank(xp) {
    if (xp === undefined) xp = career().xp;
    for (const r of RANKS) {
      if (r.xp > xp) return r;
    }
    return null; // max rank
  }

  function getRankProgress() {
    const c = career();
    const current = getRank(c.xp);
    const next = getNextRank(c.xp);
    if (!next) return 1.0; // max rank
    const base = current.xp;
    const target = next.xp - base;
    return Math.min(1, (c.xp - base) / target);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // XP & CREDIT AWARDS
  // ═══════════════════════════════════════════════════════════════════════
  function awardKill(enemyType) {
    const c = career();
    const xpKey = 'kill_' + enemyType.replace('-', '_');
    const xp = XP_AWARDS[xpKey] || 10;
    const cr = CREDIT_AWARDS[xpKey] || 5;
    const oldRank = getRank(c.xp);

    c.xp += xp;
    c.credits += cr;
    c.totalKills++;
    c.killTally[enemyType] = (c.killTally[enemyType] || 0) + 1;

    const newRank = getRank(c.xp);
    save();

    const ranked = newRank.id !== oldRank.id;
    return { xp, credits: cr, ranked, newRank: ranked ? newRank : null };
  }

  function awardEvent(eventKey) {
    const c = career();
    const xp = XP_AWARDS[eventKey] || 0;
    const cr = CREDIT_AWARDS[eventKey] || 0;
    const oldRank = getRank(c.xp);
    c.xp += xp;
    c.credits += cr;
    const newRank = getRank(c.xp);
    save();
    return { xp, credits: cr, ranked: newRank.id !== oldRank.id, newRank: newRank.id !== oldRank.id ? newRank : null };
  }

  function endMission(stats) {
    const c = career();
    c.gamesPlayed++;
    c.totalDeaths += (stats.deaths || 0);
    c.totalWaves += (stats.waveReached || 0);
    c.totalFlightTime += (stats.flightTime || 0);
    if (stats.waveReached > c.bestWave) c.bestWave = stats.waveReached;
    if (stats.score > c.bestScore) c.bestScore = stats.score;
    save();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UNLOCK SYSTEM
  // ═══════════════════════════════════════════════════════════════════════
  function getAvailableUnlocks() {
    const c = career();
    const rank = getRank(c.xp);
    const rankIdx = RANKS.findIndex(r => r.id === rank.id);
    return UNLOCKS.filter(u => {
      const reqIdx = RANKS.findIndex(r => r.id === u.rank);
      return reqIdx <= rankIdx;
    });
  }

  function getLockedUnlocks() {
    const c = career();
    const rank = getRank(c.xp);
    const rankIdx = RANKS.findIndex(r => r.id === rank.id);
    return UNLOCKS.filter(u => {
      const reqIdx = RANKS.findIndex(r => r.id === u.rank);
      return reqIdx > rankIdx;
    });
  }

  function getPurchasableUpgrades() {
    const c = career();
    return getAvailableUnlocks().filter(u =>
      u.type === 'upgrade' && u.cost && !c.purchasedUpgrades.includes(u.id)
    );
  }

  function purchaseUpgrade(unlockId) {
    const c = career();
    const u = UNLOCKS.find(x => x.id === unlockId);
    if (!u || !u.cost) return { success: false, reason: 'Invalid upgrade' };
    if (c.purchasedUpgrades.includes(u.id)) return { success: false, reason: 'Already purchased' };
    if (c.credits < u.cost) return { success: false, reason: 'Not enough credits (' + c.credits + '/' + u.cost + ')' };

    const rank = getRank(c.xp);
    const rankIdx = RANKS.findIndex(r => r.id === rank.id);
    const reqIdx = RANKS.findIndex(r => r.id === u.rank);
    if (reqIdx > rankIdx) return { success: false, reason: 'Rank too low (need ' + RANKS[reqIdx].name + ')' };

    c.credits -= u.cost;
    c.purchasedUpgrades.push(u.id);
    save();
    return { success: true, upgrade: u };
  }

  function selectShip(shipId) {
    const c = career();
    const ship = UNLOCKS.find(u => u.id === shipId && u.type === 'ship');
    if (!ship) return false;
    const rank = getRank(c.xp);
    const rankIdx = RANKS.findIndex(r => r.id === rank.id);
    const reqIdx = RANKS.findIndex(r => r.id === ship.rank);
    if (reqIdx > rankIdx) return false;
    c.selectedShip = shipId;
    save();
    return true;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // APPLY UPGRADES — modify manifold dimensions at mission start
  // ═══════════════════════════════════════════════════════════════════════
  function applyUpgradesToPlayer(player, dimSetter) {
    const c = career();
    for (const uid of c.purchasedUpgrades) {
      const u = UNLOCKS.find(x => x.id === uid);
      if (!u || !u.effect) continue;
      for (const [key, val] of Object.entries(u.effect)) {
        if (key === '_special') {
          // Special effects handled by core.js
          player['_upgrade_' + val] = true;
        } else if (dimSetter) {
          dimSetter(key, val); // additive boost
        }
      }
    }

    // Ship variant stat modifiers
    const ship = UNLOCKS.find(u => u.id === c.selectedShip && u.type === 'ship');
    if (ship) {
      player._shipId = ship.id;
      player._shipName = ship.name;
      if (ship.id === 'ship_heavy') {
        player.hull = Math.round(player.hull * 1.5);
        player.maxSpeed = Math.round(player.maxSpeed * 0.8);
        player.torpedoes = (player.torpedoes || 0) + 2;
      } else if (ship.id === 'ship_stealth') {
        player.maxSpeed = Math.round(player.maxSpeed * 1.3);
        player._stealthFactor = 0.5; // used by enemy targeting
      } else if (ship.id === 'ship_command') {
        player._canCommand = true; // enables squad orders UI
        player.hull = Math.round(player.hull * 1.2);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACHIEVEMENTS — milestone badges that unlock on first occurrence
  // ═══════════════════════════════════════════════════════════════════════
  const ACHIEVEMENTS = [
    { id: 'first_blood', name: 'First Blood', desc: 'Score your first kill.', check: c => c.totalKills >= 1 },
    { id: 'ace', name: 'Ace', desc: 'Kill 5 enemies in one sortie.', check: null }, // checked by core.js per-mission
    { id: 'centurion', name: 'Centurion', desc: '100 career kills.', check: c => c.totalKills >= 100 },
    { id: 'predator_hunter', name: 'Predator Hunter', desc: 'Kill 10 Predator Drones.', check: c => (c.killTally.predator || 0) >= 10 },
    { id: 'dread_slayer', name: 'Dreadnought Slayer', desc: 'Destroy a Dreadnought.', check: c => (c.killTally.dreadnought || 0) >= 1 },
    { id: 'survivor', name: 'Survivor', desc: 'Reach Wave 10.', check: c => c.bestWave >= 10 },
    { id: 'veteran', name: 'Veteran', desc: 'Play 25 sorties.', check: c => c.gamesPlayed >= 25 },
    { id: 'commander', name: 'Fleet Commander', desc: 'Reach Commander rank.', check: c => getRank(c.xp).id === 'commander' },
    { id: 'wingman_savior', name: 'Wingman Savior', desc: 'Complete 3 waves with all wingmen alive.', check: null },
  ];

  function checkAchievements() {
    const c = career();
    const newlyEarned = [];
    for (const a of ACHIEVEMENTS) {
      if (c.achievements.includes(a.id)) continue;
      if (a.check && a.check(c)) {
        c.achievements.push(a.id);
        newlyEarned.push(a);
      }
    }
    if (newlyEarned.length) save();
    return newlyEarned;
  }

  function awardAchievement(id) {
    const c = career();
    if (c.achievements.includes(id)) return null;
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return null;
    c.achievements.push(id);
    save();
    return a;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // KILL TALLY RENDERER — generates HTML for alien silhouette icons
  // ═══════════════════════════════════════════════════════════════════════
  function renderKillTallyHTML() {
    const c = career();
    const tally = c.killTally;
    const typeOrder = ['enemy', 'interceptor', 'bomber', 'predator', 'dreadnought', 'alien-baseship', 'egg', 'youngling'];
    let html = '';
    for (const type of typeOrder) {
      const count = tally[type] || 0;
      if (count === 0) continue;
      const icon = TALLY_ICONS[type] || '?';
      // Show individual icons up to 5, then "×N" for more
      if (count <= 5) {
        html += '<span title="' + type + ' ×' + count + '" style="margin-right:2px;">';
        for (let i = 0; i < count; i++) html += icon;
        html += '</span>';
      } else {
        html += '<span title="' + type + ' ×' + count + '" style="margin-right:4px;">' + icon + '×' + count + '</span>';
      }
    }
    return html || '<span style="color:#556;">No kills yet</span>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    load, save, career, reset,
    RANKS, UNLOCKS, ACHIEVEMENTS, TALLY_ICONS,
    getRank, getNextRank, getRankProgress,
    awardKill, awardEvent, endMission,
    getAvailableUnlocks, getLockedUnlocks,
    getPurchasableUpgrades, purchaseUpgrade, selectShip,
    applyUpgradesToPlayer,
    checkAchievements, awardAchievement,
    renderKillTallyHTML,
  };
})();

window.SFProgression = SFProgression;

/**
 * Starfighter 3D Renderer
 * Three.js, First-Person Cockpit, Entity Meshes
 */

const SF3D = (function () {
  let scene, camera, renderer;
  const entityMeshes = new Map();
  let cockpitGroup;
  let cockpitModel; // GLB cockpit model
  let manifoldCockpitGroup;
  let manifoldCockpitShell;
  let manifoldCockpitDash;
  let manifoldCockpitMat;
  let manifoldCockpitShellMat;
  let cockpitLeftArm, cockpitRightArm; // separated arm meshes for animation
  let leftScreenMesh, rightScreenMesh; // 3D screen planes
  let telemetryCanvas, telemetryCtx, telemetryTexture;
  let radarTexture; // CanvasTexture from radar-canvas
  let cockpitLoaded = false;
  let cockpitLoadFailed = false;
  let cockpitVisible = true; // cockpit always visible — seamless through launch and combat
  let lastCockpitToggleAt = 0;
  let lastCockpitToggleValue = true;
  const MANIFOLD_COCKPIT_DEBUG = /(?:\?|&)manifoldCockpit=1(?:&|$)/.test(window.location.search);
  let targetLockMesh;
  let launchBayGroup;
  let cameraShakeIntensity = 0;
  const STRICT_MODEL_BASELINE = false;
  const _viewProj = new THREE.Matrix4();
  const _viewFrustum = new THREE.Frustum();
  const _tmpSphere = new THREE.Sphere();
  const _tmpVec = new THREE.Vector3();
  let _staticAnimFrame = 0;
  let _lastTelemetrySignature = '';
  const _activeIds = new Set();  // reused every frame — no allocation
  let _frameTime = 0;  // cached performance.now() per frame

  // ── GLB model cache: loaded once, cloned per entity ──
  const glbModels = {};    // { modelName: THREE.Group }
  // LOD levels: [{ path, distance }] — distance is the camera distance at which
  // Three.js switches FROM this level to the next (coarser) one.
  // Model paths — single LOD using full original GLBs
  // Preloaded entries point at the lightweight optimized LOD-tier so the
  // loading screen clears quickly. Combat-only entries keep the full mesh
  // since they lazy-load on first encounter once the game is already running.
  const GLB_LOD = {
    enemy: [
      { path: 'assets/models/AlienEnemyFighter.glb', distance: 0 },
    ],
    ally: [
      { path: 'assets/models/optimized/HumanFriendlStarFighter_lod2.glb', distance: 0 },
    ],
    'alien-baseship': [
      { path: 'assets/models/AlienMotherShip.glb', distance: 0 },
    ],
    predator: [
      { path: 'assets/models/AlienEnemyPreditorDrone.glb', distance: 0 },
    ],
    baseship: [
      { path: 'assets/models/optimized/HumanSpaceBattleShip_lod2.glb', distance: 0 },
    ],
    station: [
      { path: 'assets/models/optimized/HumanSpaceStationWithAritificalGravity_lod2.glb', distance: 0 },
    ],
    // New enemy types
    interceptor: [
      { path: 'assets/models/Interceptor_Needle.glb', distance: 0 },
    ],
    bomber: [
      { path: 'assets/models/Bomber_Leviathan%20Tick.glb', distance: 0 },
    ],
    dreadnought: [
      { path: 'assets/models/Dreadnought_Hive%20Throne.glb', distance: 0 },
    ],
    // Friendly support
    tanker: [
      { path: 'assets/models/friendlyfueltanker.glb', distance: 0 },
    ],
    medic: [
      { path: 'assets/models/freindly_medical_frigate.glb', distance: 0 },
    ],
    // Earth — small enough to keep full
    earth: [
      { path: 'assets/models/Earth.glb', distance: 0 },
    ],
    // Moon — small enough to keep full
    moon: [
      { path: 'assets/models/moon.glb', distance: 0 },
    ],
  };
  // Scale factors — proportional to real ship sizes, forced perspective for celestials
  // Player ~F-16 (16m), Baseship ~aircraft carrier (400m), Alien ships 3× human
  // Earth/Moon use forced perspective: sized for apparent angular size from player, not real scale
  const GLB_SCALES = {
    enemy: 50,             // alien fighter ~48m (3× human)
    predator: 200,         // predator drone ~240m — massive alien hunter
    interceptor: 50,       // interceptor ~48m — 3× human, fast
    bomber: 120,           // bomber ~120m — 3× heavy craft
    dreadnought: 1800,     // dreadnought ~1800m — alien capital
    'alien-baseship': 2100,// alien mothership ~2100m — 3× human carrier
    baseship: 400,         // human carrier ~400m — aircraft carrier class
    ally: 16,              // human fighter ~16m wingspan
    tanker: 60,            // fuel tanker ~80m — support craft
    medic: 80,             // medical frigate ~90m — larger support vessel
    station: 3000,         // space station ~massive, thousands of people
    earth: 18000,  // forced perspective — fills ~27° of sky at distance 60000
    moon: 4000,    // forced perspective — fills ~4.5° of sky at distance 80000 (1/4.5 Earth ratio)
  };

  // ── Dimensional LOD Manifold: z = xy ──
  // Visual detail (z) is the product of model fidelity (x) and camera distance (y)
  // Tier 0 (near): Full GLB model — Tier 1 (mid): Procedural mesh — Tier 2 (far): Glow sphere
  const PRELOAD_MODELS = STRICT_MODEL_BASELINE
    ? new Set(Object.keys(GLB_LOD))
    : new Set(['earth', 'moon', 'baseship', 'station', 'ally']);
  const LOD_GLOW_DIST = {
    enemy: 1800, predator: 2500, interceptor: 1800, bomber: 2200,
    dreadnought: 6000, 'alien-baseship': 8000, tanker: 1800, medic: 2000,
    ally: 1500, baseship: 12000, station: 25000, earth: 300000, moon: 200000,
  };
  const _lazyState = {};   // key → 'loading' | 'loaded' | 'error'

  // ── Distance-based dot rendering ──
  // Beyond DOT_DIST, entities render as simple glowing sprites instead of full models.
  // Beyond CULL_DIST, entities are not rendered at all (data-only).
  // RULE: 3D models should appear well before enemies are close enough to attack.
  // Combat range is ~500-1500 units, so 3D models must be visible by ~1500-2000.
  const DOT_DIST = {
    enemy: 800, predator: 1200, interceptor: 800, bomber: 1000,
    dreadnought: 3000, 'alien-baseship': 4000, tanker: 800, medic: 1000,
    ally: 700, baseship: 8000, station: 15000, earth: 200000, moon: 150000,
    laser: 600, machinegun: 400, torpedo: 800, plasma: 600,
    egg: 500, youngling: 400,
  };
  const CULL_DIST = 50000; // beyond this, skip entirely (except celestials)
  const _NO_CULL_TYPES = new Set(['earth', 'moon', 'baseship', 'station', 'alien-baseship']);
  const DOT_COLORS = {
    enemy: 0x22ff44, predator: 0x44ff00, interceptor: 0x00ffcc, bomber: 0xff6600,
    dreadnought: 0xff0044, 'alien-baseship': 0xff00ff, tanker: 0xffaa44, medic: 0xff4444,
    ally: 0x4488ff, baseship: 0x88ccff, station: 0xaaaaff, earth: 0x4488ff, moon: 0xcccccc,
    laser: 0x00ffaa, machinegun: 0xffcc00, torpedo: 0xff8800, plasma: 0x44ff00,
    egg: 0x99cc33, youngling: 0x332211,
  };
  const _dotSprites = new Map(); // entity id → sprite
  let _dotMaterialCache = {};

  function _getDotSprite(type) {
    const color = DOT_COLORS[type] || 0xffffff;
    if (!_dotMaterialCache[color]) {
      _dotMaterialCache[color] = new THREE.SpriteMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    const sprite = new THREE.Sprite(_dotMaterialCache[color]);
    sprite.scale.setScalar(8);
    scene.add(sprite);
    return sprite;
  }

  function _showAsDot(entityId, type, position) {
    let dot = _dotSprites.get(entityId);
    if (!dot) {
      dot = _getDotSprite(type);
      _dotSprites.set(entityId, dot);
    }
    dot.position.copy(position);
    dot.visible = true;
  }

  function _hideDot(entityId) {
    const dot = _dotSprites.get(entityId);
    if (dot) dot.visible = false;
  }

  function _cleanupDots(activeIds) {
    for (const [id, dot] of _dotSprites) {
      if (!activeIds.has(id)) {
        scene.remove(dot);
        _dotSprites.delete(id);
      }
    }
  }

  // ── Shared starfield vertex data (world-space positions, shared with radar) ──
  const STAR_COUNT = 6000;
  const STAR_RADIUS = 200000;
  let starfieldVerts = null; // Float32Array — filled once, read by radar

  // ═══════════════════════════════════════════════════════════════════════
  // PARTICLE ENGINE — 2026 quality: large softbody sprites, bloom fade
  // ═══════════════════════════════════════════════════════════════════════
  const MAX_PARTICLES = 2000;
  const particlePool = [];
  let activeParticles = 0;
  let particlePoints = null;
  let particlePositions, particleColors, particleSizes, particleAges, particleLifetimes;
  let particleVelocities;
  let particleInitSizes; // per-particle initial size (NOT a fixed 4px)
  let particleAlphas;    // per-particle initial alpha

  // Soft circular gradient texture — eliminates hard-edged square sprites
  function _createSoftCircleTexture() {
    const sz = 64;
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function _initParticleSystem() {
    particlePositions = new Float32Array(MAX_PARTICLES * 3);
    particleColors = new Float32Array(MAX_PARTICLES * 3);
    particleSizes = new Float32Array(MAX_PARTICLES);
    particleAges = new Float32Array(MAX_PARTICLES);
    particleLifetimes = new Float32Array(MAX_PARTICLES);
    particleVelocities = new Float32Array(MAX_PARTICLES * 3);
    particleInitSizes = new Float32Array(MAX_PARTICLES);
    particleAlphas = new Float32Array(MAX_PARTICLES);
    particleSizes.fill(0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
    const mat = new THREE.PointsMaterial({
      size: 32, vertexColors: true, transparent: true,
      opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
      map: _createSoftCircleTexture(),
      alphaTest: 0.001,
    });
    particlePoints = new THREE.Points(geo, mat);
    particlePoints.frustumCulled = false;
    scene.add(particlePoints);
    activeParticles = 0;
  }

  function _emitParticle(px, py, pz, vx, vy, vz, r, g, b, lifetime, size, alpha) {
    if (activeParticles >= MAX_PARTICLES) return;
    const i = activeParticles++;
    const i3 = i * 3;
    particlePositions[i3] = px;
    particlePositions[i3 + 1] = py;
    particlePositions[i3 + 2] = pz;
    particleVelocities[i3] = vx;
    particleVelocities[i3 + 1] = vy;
    particleVelocities[i3 + 2] = vz;
    particleColors[i3] = r;
    particleColors[i3 + 1] = g;
    particleColors[i3 + 2] = b;
    const sz = size || 30;
    particleSizes[i] = sz;
    particleInitSizes[i] = sz;
    particleAlphas[i] = alpha || 1.0;
    particleAges[i] = 0;
    particleLifetimes[i] = lifetime;
  }

  function _updateParticles(dt) {
    if (!particlePoints) return;
    // Decay muzzle flash lights
    for (let fi = 0; fi < _muzzleFlashPool.length; fi++) {
      const f = _muzzleFlashPool[fi];
      if (f.timer > 0) {
        f.timer -= dt;
        if (f.timer <= 0) f.light.intensity = 0;
        else f.light.intensity = f.baseIntensity * (f.timer / f.baseDuration);
      }
    }
    let write = 0;
    for (let read = 0; read < activeParticles; read++) {
      particleAges[read] += dt;
      if (particleAges[read] >= particleLifetimes[read]) continue;
      if (write !== read) {
        const r3 = read * 3, w3 = write * 3;
        particlePositions[w3] = particlePositions[r3];
        particlePositions[w3 + 1] = particlePositions[r3 + 1];
        particlePositions[w3 + 2] = particlePositions[r3 + 2];
        particleVelocities[w3] = particleVelocities[r3];
        particleVelocities[w3 + 1] = particleVelocities[r3 + 1];
        particleVelocities[w3 + 2] = particleVelocities[r3 + 2];
        particleColors[w3] = particleColors[r3];
        particleColors[w3 + 1] = particleColors[r3 + 1];
        particleColors[w3 + 2] = particleColors[r3 + 2];
        particleSizes[write] = particleSizes[read];
        particleInitSizes[write] = particleInitSizes[read];
        particleAlphas[write] = particleAlphas[read];
        particleAges[write] = particleAges[read];
        particleLifetimes[write] = particleLifetimes[read];
      }
      const w3 = write * 3;
      particlePositions[w3] += particleVelocities[w3] * dt;
      particlePositions[w3 + 1] += particleVelocities[w3 + 1] * dt;
      particlePositions[w3 + 2] += particleVelocities[w3 + 2] * dt;
      // Slight drag
      particleVelocities[w3] *= 0.985;
      particleVelocities[w3 + 1] *= 0.985;
      particleVelocities[w3 + 2] *= 0.985;
      // ── Bloom fade: bright burst → rapid dim → slow ember glow ──
      // Exponential curve: size peaks at 20% life then fades, color stays hot
      const t = particleAges[write] / particleLifetimes[write];
      const bloom = t < 0.15 ? (t / 0.15) : Math.pow(1 - (t - 0.15) / 0.85, 1.5);
      particleSizes[write] = particleInitSizes[write] * Math.max(0.08, bloom);
      // Color fade: stays bright then dims toward end (multiply RGB)
      const colorFade = t < 0.4 ? 1.0 : Math.pow(1 - (t - 0.4) / 0.6, 0.8);
      particleColors[w3] *= (0.97 + colorFade * 0.03);
      particleColors[w3 + 1] *= (0.95 + colorFade * 0.05);
      particleColors[w3 + 2] *= (0.93 + colorFade * 0.07);
      write++;
    }
    for (let i = write; i < activeParticles; i++) particleSizes[i] = 0;
    activeParticles = write;
    particlePoints.geometry.attributes.position.needsUpdate = true;
    particlePoints.geometry.attributes.color.needsUpdate = true;
    particlePoints.geometry.attributes.size.needsUpdate = true;
  }

  // ── Shared materials (created once, reused across all entities) ──
  let sharedMats = null;

  // ── Cached weapon billboard materials (created once) ──
  let _laserBillMat = null;
  let _torpBillMat = null;

  function _createBeamTexture(hexColor) {
    const W = 32, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const r = (hexColor >> 16) & 0xff;
    const g = (hexColor >> 8) & 0xff;
    const b = hexColor & 0xff;
    // Cross-beam gradient: transparent at edges, blazing white-hot center
    const xg = c.createLinearGradient(0, 0, W, 0);
    xg.addColorStop(0, `rgba(${r},${g},${b},0)`);
    xg.addColorStop(0.2, `rgba(${r},${g},${b},0.35)`);
    xg.addColorStop(0.5, `rgba(255,255,255,1)`);
    xg.addColorStop(0.8, `rgba(${r},${g},${b},0.35)`);
    xg.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = xg;
    c.fillRect(0, 0, W, H);
    // Along-beam mask: fade ends to transparent
    c.globalCompositeOperation = 'destination-in';
    const yg = c.createLinearGradient(0, 0, 0, H);
    yg.addColorStop(0, 'rgba(0,0,0,0)');
    yg.addColorStop(0.05, 'rgba(0,0,0,1)');
    yg.addColorStop(0.95, 'rgba(0,0,0,1)');
    yg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = yg;
    c.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  }

  function _getLaserBillMat() {
    if (_laserBillMat) return _laserBillMat;
    _laserBillMat = new THREE.MeshBasicMaterial({
      map: _createBeamTexture(0x00ffcc),
      transparent: true, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, depthWrite: false,
    });
    return _laserBillMat;
  }

  function _getTorpBillMat() {
    if (_torpBillMat) return _torpBillMat;
    _torpBillMat = new THREE.MeshBasicMaterial({
      map: _createBeamTexture(0xff6600),
      transparent: true, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, depthWrite: false,
    });
    return _torpBillMat;
  }

  let launchPhaseActive = false;

  function setLaunchPhase(active) {
    launchPhaseActive = active;
  }

  function init(state) {
    const container = document.getElementById('game-canvas');

    // Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.000008);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 300000);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Cockpit visor filter — sun in space is blinding; the canopy polarizes
    // light down to a level the human eye (and HUD) can tolerate
    renderer.toneMappingExposure = 0.55;
    container.appendChild(renderer.domElement);

    // ── Sun direction — all lighting derives from this ──
    const SUN_POS = new THREE.Vector3(200000, 100000, 80000);
    const EARTH_POS = new THREE.Vector3(-15000, -55000, -25000);

    // Ambient — very dim base so deep-shadow side isn't pitch black
    const ambient = new THREE.AmbientLight(0x060610, 0.08);
    scene.add(ambient);

    // Primary sun directional light — intense (space has no atmosphere to soften)
    // Cockpit visor filter (toneMappingExposure) tames this to a viewable level
    const sunLight = new THREE.DirectionalLight(0xfff5e0, 5.0);
    sunLight.position.copy(SUN_POS);
    scene.add(sunLight);

    // ── Earth-shine — blue reflected light from the Earth's day side ──
    const earthShineDir = EARTH_POS.clone().normalize();
    const earthShine = new THREE.DirectionalLight(0x4488cc, 0.6);
    earthShine.position.copy(earthShineDir.clone().multiplyScalar(-1)); // light FROM Earth toward scene
    scene.add(earthShine);

    // Very subtle fill from opposite sun (scattered starlight / nebula)
    const fillLight = new THREE.DirectionalLight(0x0a0a1a, 0.08);
    fillLight.position.set(-SUN_POS.x, -SUN_POS.y, -SUN_POS.z);
    scene.add(fillLight);

    // ── Visible Sun — pure corona expanding outward, no solid sphere ──
    // In space without atmosphere, the sun has no defined edge — just a
    // blindingly bright point with corona radiating outward indefinitely
    const sunGroup = new THREE.Group();
    sunGroup.name = 'sun-group';

    // Tiny blazing core — point-like, overwhelmingly bright
    const sunCoreGeo = new THREE.SphereGeometry(200, 16, 16);
    const sunCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
    sunGroup.add(new THREE.Mesh(sunCoreGeo, sunCoreMat));

    // Inner corona — intense white-yellow glow radiating from core
    const innerCoronaLayers = [
      { r: 600, color: 0xffffff, opacity: 0.8 },
      { r: 1200, color: 0xffffee, opacity: 0.5 },
      { r: 2500, color: 0xffeeaa, opacity: 0.25 },
      { r: 4000, color: 0xffdd66, opacity: 0.12 },
    ];
    innerCoronaLayers.forEach((layer, i) => {
      const geo = new THREE.SphereGeometry(layer.r, 24, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: layer.color, transparent: true, opacity: layer.opacity,
        blending: THREE.AdditiveBlending, side: THREE.BackSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'inner-corona-' + i;
      sunGroup.add(mesh);
    });

    // Outer corona — expands far outward, fading from orange to deep red
    const outerCoronaColors = [0xffaa22, 0xff7711, 0xff4400, 0xcc2200, 0x881100, 0x440800];
    for (let i = 0; i < outerCoronaColors.length; i++) {
      const r = 6000 + i * 3000;
      const coronaGeo = new THREE.SphereGeometry(r, 24, 24);
      const coronaMat = new THREE.MeshBasicMaterial({
        color: outerCoronaColors[i],
        transparent: true, opacity: 0.06 / (1 + i * 0.5),
        blending: THREE.AdditiveBlending, side: THREE.BackSide
      });
      const corona = new THREE.Mesh(coronaGeo, coronaMat);
      corona.name = 'corona-' + i;
      sunGroup.add(corona);
    }

    // Outermost halo — barely perceptible, extends very far
    const haloGeo = new THREE.SphereGeometry(30000, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true, opacity: 0.008,
      blending: THREE.AdditiveBlending, side: THREE.BackSide
    });
    sunGroup.add(new THREE.Mesh(haloGeo, haloMat));

    // Sun point light — the actual light source for nearby objects
    const sunPLight = new THREE.PointLight(0xfff5e0, 5, 400000);
    sunGroup.add(sunPLight);

    sunGroup.position.copy(SUN_POS);
    scene.add(sunGroup);

    // Particle system
    _initParticleSystem();

    // Starfield
    createStarfield();

    // Cockpit GLB
    createCockpit();

    // Cockpit interior lighting — slightly brighter to compensate for visor filter
    const cockpitLight = new THREE.PointLight(0xccddff, 2.0, 5);
    cockpitLight.position.set(0, 0.3, 0);
    camera.add(cockpitLight);
    const cockpitAmbient = new THREE.HemisphereLight(0x4466aa, 0x112233, 1.0);
    camera.add(cockpitAmbient);

    // Launch Bay
    createLaunchBay();

    // Preload all GLB models
    _preloadGLBModels();

    // Target Lock Reticle — modern bracket-style ring
    targetLockMesh = _createTargetReticle();
    targetLockMesh.visible = false;
    scene.add(targetLockMesh);

    window.addEventListener('resize', onWindowResize, false);
  }

  // ── Create modern targeting reticle (ring + corner brackets) ──
  function _createTargetReticle() {
    const group = new THREE.Group();
    // Outer ring
    const ringGeo = new THREE.RingGeometry(9, 10, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);
    // Inner ring (thinner, brighter)
    const innerRingGeo = new THREE.RingGeometry(6.5, 7, 32);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    group.add(new THREE.Mesh(innerRingGeo, innerRingMat));
    // Corner brackets (four L-shaped lines)
    const bracketMat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
    const bSize = 12, bLen = 4;
    const corners = [
      [[-bSize, bSize, 0], [-bSize + bLen, bSize, 0], [-bSize, bSize, 0], [-bSize, bSize - bLen, 0]],
      [[bSize, bSize, 0], [bSize - bLen, bSize, 0], [bSize, bSize, 0], [bSize, bSize - bLen, 0]],
      [[-bSize, -bSize, 0], [-bSize + bLen, -bSize, 0], [-bSize, -bSize, 0], [-bSize, -bSize + bLen, 0]],
      [[bSize, -bSize, 0], [bSize - bLen, -bSize, 0], [bSize, -bSize, 0], [bSize, -bSize + bLen, 0]],
    ];
    corners.forEach(pts => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
      group.add(new THREE.LineSegments(geo, bracketMat));
    });
    // Diamond center pip
    const dotGeo = new THREE.RingGeometry(0, 1.5, 4);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    group.add(new THREE.Mesh(dotGeo, dotMat));
    return group;
  }

  // ── Loading progress tracking ──
  let _totalModelsToLoad = 0;
  let _modelsLoaded = 0;
  let _allModelsReady = false;
  let _onReadyCallback = null;
  let _loadTimeoutId = null;
  const _LOAD_TIMEOUT_MS = 25000; // hard cap — never let the spinner hang

  function _markReady(reason) {
    if (_allModelsReady) return;
    _allModelsReady = true;
    if (_loadTimeoutId) { clearTimeout(_loadTimeoutId); _loadTimeoutId = null; }
    console.log('Models ready (' + reason + ') — clearing loading screen');
    const loadScreen = document.getElementById('loading-screen');
    if (loadScreen) loadScreen.style.display = 'none';
    if (_onReadyCallback) _onReadyCallback();
  }

  function _updateLoadingProgress(label) {
    _modelsLoaded++;
    const pct = Math.floor((_modelsLoaded / _totalModelsToLoad) * 100);
    const bar = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = label ? ('LOADING ' + label.toUpperCase() + '...') : ('LOADING ' + pct + '%');
    if (_modelsLoaded >= _totalModelsToLoad) _markReady('all-loaded');
  }

  function onAllModelsReady(cb) { _onReadyCallback = cb; if (_allModelsReady) cb(); }
  function isReady() { return _allModelsReady; }

  // ── Preload essential GLBs; lazy-load combat models on demand ──
  // Dimensional LOD: preloaded types get GLB + glow sphere immediately;
  // lazy types start as procedural fallback, GLB streams in during gameplay
  function _preloadGLBModels() {
    const loader = new THREE.GLTFLoader();

    // Only count preloaded models for loading screen (+ cockpit)
    _totalModelsToLoad = 1; // cockpit
    Object.entries(GLB_LOD).forEach(([key, levels]) => {
      if (PRELOAD_MODELS.has(key)) _totalModelsToLoad += levels.length;
    });

    // Hard timeout: if any preload stalls (slow CDN, dropped chunk, oversized
    // asset on a weak link), the spinner clears anyway and the procedural
    // fallbacks take over so the player can actually play.
    if (_loadTimeoutId) clearTimeout(_loadTimeoutId);
    _loadTimeoutId = setTimeout(function () {
      console.warn('Preload timeout (' + _modelsLoaded + '/' + _totalModelsToLoad + ') — releasing loading screen');
      _markReady('timeout');
    }, _LOAD_TIMEOUT_MS);

    Object.entries(GLB_LOD).forEach(([key, levels]) => {
      if (PRELOAD_MODELS.has(key)) {
        // ── Essential: load immediately, block loading screen ──
        _loadGLBType(loader, key, levels, true);
      } else {
        // ── Combat entity: empty template, lazy-loaded on first encounter ──
        glbModels[key] = new THREE.LOD(); // empty — triggers procedural fallback
      }
    });
  }

  // Shared GLB loading logic — used by both preload and lazy paths
  function _loadGLBType(loader, key, levels, countProgress) {
    const lod = new THREE.LOD();
    glbModels[key] = lod;
    let loaded = 0;
    const levelResults = new Array(levels.length);

    levels.forEach(({ path, distance }, idx) => {
      loader.load(path,
        function (gltf) {
          const model = gltf.scene;
          model.traverse(child => {
            if (child.isMesh && child.material && child.material.map)
              child.material.map.encoding = THREE.sRGBEncoding;
          });
          levelResults[idx] = { model, distance };
          loaded++;
          if (countProgress) _updateLoadingProgress(key);

          if (loaded === levels.length) {
            levelResults.sort((a, b) => a.distance - b.distance);

            const lod0Mats = [];
            levelResults[0].model.traverse(c => {
              if (c.isMesh) lod0Mats.push(c.material);
            });

            levelResults.forEach(({ model, distance }, i) => {
              if (i > 0) {
                let mi = 0;
                model.traverse(c => {
                  if (c.isMesh && lod0Mats[mi])
                    c.material = lod0Mats[mi++];
                });
              }
              if (!STRICT_MODEL_BASELINE && ALIEN_GLOW_COLORS[key]) _applyBioluminescence(model, key);
              lod.addLevel(model, distance);
            });

            // Add glow sphere as far-distance tier (disabled in strict model baseline)
            if (!STRICT_MODEL_BASELINE) {
              const glowDist = LOD_GLOW_DIST[key];
              if (glowDist) lod.addLevel(_createGlowSphere(key), glowDist);
            }

            console.log(`GLB LOD ready: ${key} (${levels.length} detail + glow)`);
            if (!countProgress) _lazyState[key] = 'loaded';
            if (key === 'earth') _placeEarth(lod);
            if (key === 'moon') _placeMoon(lod);
            if (key === 'station') _placeStation(lod);
          }
        },
        null,
        err => {
          console.error('Failed to load GLB:', path, err);
          if (countProgress) _updateLoadingProgress(key);
          if (!countProgress) _lazyState[key] = 'error';
        }
      );
    });
  }

  // ── Lazy loader: streams combat model GLBs on first encounter ──
  function _triggerLazyLoad(key) {
    if (_lazyState[key]) return; // already loading/loaded
    _lazyState[key] = 'loading';
    console.log(`Lazy-loading GLB: ${key}...`);
    const levels = GLB_LOD[key];
    if (!levels || !levels[0]) return;
    const loader = new THREE.GLTFLoader();
    _loadGLBType(loader, key, levels, false);
  }

  // ── Bioluminescent glow for alien species from Brown Giant ──
  // They glow like deep-sea creatures in the vacuum of space
  const ALIEN_GLOW_COLORS = {
    enemy: { emissive: 0x22ff44, intensity: 0.6, pointColor: 0x44ff66, pointIntensity: 2.5, pointDist: 300 },
    predator: { emissive: 0x44ff00, intensity: 0.8, pointColor: 0x66ff22, pointIntensity: 4.0, pointDist: 600 },
    interceptor: { emissive: 0x00ffcc, intensity: 0.7, pointColor: 0x22ffdd, pointIntensity: 3.0, pointDist: 300 },
    bomber: { emissive: 0xff6600, intensity: 0.6, pointColor: 0xff8800, pointIntensity: 3.5, pointDist: 500 },
    dreadnought: { emissive: 0xff0044, intensity: 0.7, pointColor: 0xff2266, pointIntensity: 8.0, pointDist: 3000 },
    'alien-baseship': { emissive: 0xff00ff, intensity: 0.5, pointColor: 0xff44ff, pointIntensity: 6.0, pointDist: 2000 },
  };

  // ── Glow Sphere: far-distance LOD tier — minimal geometry, maximum visibility ──
  function _createGlowSphere(key) {
    const group = new THREE.Group();
    const cfg = ALIEN_GLOW_COLORS[key];
    const color = cfg ? cfg.emissive :
      (key === 'tanker' ? 0x00ff88 :
        key === 'medic' ? 0xff4444 :
          key === 'ally' ? 0x4488ff :
            key === 'baseship' ? 0x4488ff :
              key === 'station' ? 0x4488ff : 0xffffff);

    // Core sphere — bright, visible at distance
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    ));
    // Additive halo — soft bloom effect
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 6, 6),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, side: THREE.BackSide
      })
    ));
    return group;
  }

  function _applyBioluminescence(model, key) {
    const cfg = ALIEN_GLOW_COLORS[key];
    if (!cfg) return;
    model.traverse(child => {
      if (child.isMesh && child.material) {
        // Clone material so shared instances don't bleed
        child.material = child.material.clone();
        child.material.emissive = new THREE.Color(cfg.emissive);
        child.material.emissiveIntensity = cfg.intensity;
        // Make slightly translucent for organic feel
        child.material.transparent = true;
        child.material.opacity = 0.92;
      }
    });
  }

  function _addGlowLight(mesh, key) {
    const cfg = ALIEN_GLOW_COLORS[key];
    if (!cfg) return;
    const light = new THREE.PointLight(cfg.pointColor, cfg.pointIntensity, cfg.pointDist);
    light.name = 'bioGlow';
    mesh.add(light);
  }

  // ── Clone a LOD model for a new entity ──
  function _cloneLOD(key) {
    const src = glbModels[key];
    if (!src) return null;
    const lod = new THREE.LOD();
    src.levels.forEach(({ object, distance }) => {
      lod.addLevel(object.clone(), distance);
    });
    return lod;
  }

  // ── Place Earth with atmosphere ──
  function _placeEarth(model) {
    const earthGroup = new THREE.Group();
    earthGroup.name = 'earth-scenery';

    // The GLB model is the planet surface (LOD clone)
    const earth = _cloneLOD('earth') || model.clone();
    earth.scale.setScalar(GLB_SCALES.earth);
    earthGroup.add(earth);

    // Compute the visual radius from the GLB scale
    // GLB models from Meshy are roughly unit-sized (±0.8), so scaled radius:
    const earthRadius = GLB_SCALES.earth * 0.8;

    // ── Atmosphere shell — soft blue glow around the limb ──
    const atmosGeo = new THREE.SphereGeometry(earthRadius * 1.02, 32, 32);
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x4488ff) },
        viewVector: { value: new THREE.Vector3() },
        sunDirection: { value: new THREE.Vector3(200000, 100000, 80000).normalize() }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vWorldPos;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 glowColor;',
        'uniform vec3 viewVector;',
        'uniform vec3 sunDirection;',
        'varying vec3 vNormal;',
        'varying vec3 vWorldPos;',
        'void main() {',
        '  float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);',
        '  float sunFacing = max(0.0, dot(normalize(vNormal), sunDirection));',
        '  float glow = intensity * (0.3 + 0.7 * sunFacing);',
        '  gl_FragColor = vec4(glowColor, glow * 0.6);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    earthGroup.add(atmosphere);

    // ── Thin bright limb ring — Fresnel edge highlight ──
    const limbGeo = new THREE.SphereGeometry(earthRadius * 1.01, 32, 32);
    const limbMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: new THREE.Vector3(200000, 100000, 80000).normalize() }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 sunDirection;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));',
        '  float sunFacing = max(0.0, dot(vNormal, sunDirection));',
        '  float intensity = pow(rim, 4.0) * sunFacing;',
        '  vec3 col = mix(vec3(0.3, 0.6, 1.0), vec3(0.7, 0.9, 1.0), rim);',
        '  gl_FragColor = vec4(col, intensity * 0.8);',
        '}'
      ].join('\n'),
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    earthGroup.add(new THREE.Mesh(limbGeo, limbMat));

    // ── Cloud layer — slightly larger, semi-transparent white sphere ──
    const cloudGeo = new THREE.SphereGeometry(earthRadius * 1.008, 48, 48);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      roughness: 1.0,
      metalness: 0.0,
      depthWrite: false
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    clouds.name = 'earth-clouds';
    earthGroup.add(clouds);

    // Position Earth — forced perspective backdrop below the combat area
    // At scale 18000 with radius ~14400, fills ~27° of sky from 60000 distance
    earthGroup.position.set(-15000, -55000, -25000);
    scene.add(earthGroup);
  }

  // ── Place Moon — real GLB model, oriented toward Earth, forced perspective ──
  function _placeMoon(model) {
    const moonGroup = new THREE.Group();
    moonGroup.name = 'moon-scenery';

    // Use the GLB model instead of a procedural sphere
    const moon = _cloneLOD('moon') || model.clone();
    moon.scale.setScalar(GLB_SCALES.moon);
    moonGroup.add(moon);

    const moonRadius = GLB_SCALES.moon * 0.8; // ~3200

    // Subtle Earth-shine glow on the Earth-facing hemisphere
    const EARTH_POS_LOCAL = new THREE.Vector3(-15000, -55000, -25000);
    const MOON_POS = new THREE.Vector3(35000, -25000, -85000);
    const earthDir = EARTH_POS_LOCAL.clone().sub(MOON_POS).normalize();

    const earthGlowGeo = new THREE.SphereGeometry(moonRadius * 1.005, 32, 32);
    const earthGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        earthDir: { value: earthDir }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 earthDir;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float facing = max(0.0, dot(vNormal, earthDir));',
        '  float intensity = pow(facing, 2.0) * 0.12;',
        '  gl_FragColor = vec4(0.3, 0.5, 0.8, intensity);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide
    });
    moonGroup.add(new THREE.Mesh(earthGlowGeo, earthGlowMat));

    // Position moon on opposite side from Earth — forced perspective
    // Earth at (-15000,-55000,-25000), Moon at (35000,-25000,-85000)
    // Station sits between them
    moonGroup.position.copy(MOON_POS);

    // Orient moon's near side toward Earth (tidal locking)
    moonGroup.lookAt(EARTH_POS_LOCAL);

    scene.add(moonGroup);
  }

  // ── Place Space Station as scenery ──
  function _placeStation(model) {
    const station = _cloneLOD('station') || model.clone();
    station.scale.setScalar(GLB_SCALES.station);
    // Civilian station between Earth and Moon — forced perspective corridor
    // Earth at (-15000,-55000,-25000), Moon at (35000,-25000,-85000)
    station.position.set(8000, -12000, -18000);
    station.name = 'station-scenery';
    scene.add(station);
  }

  function createLaunchBay() {
    launchBayGroup = new THREE.Group();

    const tubeLength = 600;
    const halfW = 25;   // half-width (total width 50)
    const halfH = 15;   // half-height (total height 30)
    const ribSpacing = 50;
    const ribDepth = 2.0;

    // ── Shared materials ──
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e, metalness: 0.8, roughness: 0.4, transparent: true
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f0f1a, metalness: 0.9, roughness: 0.3, transparent: true
    });
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e, metalness: 0.9, roughness: 0.2, transparent: true,
      emissive: new THREE.Color(0x111122), emissiveIntensity: 0.3
    });
    const stripCyanMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true
    });
    const stripGreenMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true
    });
    const warningMat = new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true
    });

    // ── Floor ──
    const floorGeo = new THREE.BoxGeometry(halfW * 2, 0.5, tubeLength);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -halfH, -tubeLength / 2);
    launchBayGroup.add(floor);

    // ── Ceiling ──
    const ceilGeo = new THREE.BoxGeometry(halfW * 2, 0.5, tubeLength);
    const ceil = new THREE.Mesh(ceilGeo, wallMat);
    ceil.position.set(0, halfH, -tubeLength / 2);
    launchBayGroup.add(ceil);

    // ── Left wall ──
    const wallGeo = new THREE.BoxGeometry(0.5, halfH * 2, tubeLength);
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-halfW, 0, -tubeLength / 2);
    launchBayGroup.add(leftWall);

    // ── Right wall ──
    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(halfW, 0, -tubeLength / 2);
    launchBayGroup.add(rightWall);

    // ── Structural ribs (cross-beams) ──
    const ribGeoH = new THREE.BoxGeometry(halfW * 2 + 2, ribDepth, ribDepth);
    const ribGeoV = new THREE.BoxGeometry(ribDepth, halfH * 2 + 2, ribDepth);
    for (let z = 0; z > -tubeLength; z -= ribSpacing) {
      // Top & bottom horizontal ribs
      const ribTop = new THREE.Mesh(ribGeoH, ribMat);
      ribTop.position.set(0, halfH + 0.5, z);
      launchBayGroup.add(ribTop);

      const ribBot = new THREE.Mesh(ribGeoH, ribMat);
      ribBot.position.set(0, -halfH - 0.5, z);
      launchBayGroup.add(ribBot);

      // Left & right vertical ribs
      const ribL = new THREE.Mesh(ribGeoV, ribMat);
      ribL.position.set(-halfW - 0.5, 0, z);
      launchBayGroup.add(ribL);

      const ribR = new THREE.Mesh(ribGeoV, ribMat);
      ribR.position.set(halfW + 0.5, 0, z);
      launchBayGroup.add(ribR);
    }

    // ── Light strips along ceiling edges (cyan left, green right) ──
    const stripGeo = new THREE.BoxGeometry(1.0, 0.3, tubeLength);
    const stripL = new THREE.Mesh(stripGeo, stripCyanMat);
    stripL.position.set(-halfW + 2, halfH - 0.5, -tubeLength / 2);
    launchBayGroup.add(stripL);

    const stripR = new THREE.Mesh(stripGeo, stripGreenMat);
    stripR.position.set(halfW - 2, halfH - 0.5, -tubeLength / 2);
    launchBayGroup.add(stripR);

    // ── Floor edge warning strips ──
    const warnGeo = new THREE.BoxGeometry(0.8, 0.15, tubeLength);
    const warnL = new THREE.Mesh(warnGeo, warningMat);
    warnL.position.set(-halfW + 1, -halfH + 0.2, -tubeLength / 2);
    launchBayGroup.add(warnL);

    const warnR = new THREE.Mesh(warnGeo, warningMat);
    warnR.position.set(halfW - 1, -halfH + 0.2, -tubeLength / 2);
    launchBayGroup.add(warnR);

    // ── Floor center guide line ──
    const guideGeo = new THREE.BoxGeometry(0.5, 0.1, tubeLength);
    const guideMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true });
    const guide = new THREE.Mesh(guideGeo, guideMat);
    guide.position.set(0, -halfH + 0.15, -tubeLength / 2);
    launchBayGroup.add(guide);

    // ── Point lights for illumination every 80 units (boosted for visor filter) ──
    for (let z = 0; z > -tubeLength; z -= 80) {
      const ceilingLight = new THREE.PointLight(0x4488ff, 3.0, 60);
      ceilingLight.position.set(0, halfH - 1, z);
      launchBayGroup.add(ceilingLight);
    }

    // ── End-of-tunnel exit glow ──
    const exitLight = new THREE.PointLight(0xffffff, 6, 100);
    exitLight.position.set(0, 0, -tubeLength + 10);
    launchBayGroup.add(exitLight);

    // Position launch bay at player start
    launchBayGroup.position.set(0, -32, 50);
    scene.add(launchBayGroup);
  }

  function removeLaunchBay() {
    // Just hide the bay instead of removing it, so it can be shown again for next wave
    if (launchBayGroup) {
      launchBayGroup.visible = false;
    }
  }

  function showLaunchBay() {
    // Show the launch bay for next launch
    if (launchBayGroup) {
      launchBayGroup.visible = true;
    }
  }

  function hideHangarBay() {
    // Find and hide the baseship hangar bay during launch
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.name === 'baseship-hangar' || obj.name === 'baseship-hangar-glow') {
        obj.visible = false;
      }
    });
  }

  function showHangarBay() {
    // Show the baseship hangar bay after launch
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.name === 'baseship-hangar' || obj.name === 'baseship-hangar-glow') {
        obj.visible = true;
      }
    });
  }

  function hideBaseship() {
    // Find and hide the baseship mesh
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.isBaseship) {
        obj.visible = false;
      }
    });
  }

  function showBaseship() {
    // Show the baseship mesh
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.isBaseship) {
        obj.visible = true;
      }
    });
  }

  function updateLaunchCinematic(progress) {
    if (!launchBayGroup) return;

    // Stage 1: Countdown phase (0 - 0.625) - Bay idle → engine spool-up
    if (progress < 0.625) {
      const countdownPhase = progress / 0.625;
      // Metallic rattle - subtle rotation oscillation
      const rattle = Math.sin(countdownPhase * 50) * 0.02;
      launchBayGroup.rotation.z = rattle;
      // Light strips pulse brighter during countdown
      launchBayGroup.children.forEach(child => {
        if (child.material) {
          child.material.opacity = 1.0;
          if (child.material.emissive) {
            child.material.emissiveIntensity = 0.3 + countdownPhase * 0.5;
          }
        }
      });
      // Only shake during engine rev-up (last 30% of countdown, ~70%+ progress)
      // Before that the ship is just sitting idle in the bay — no shake
      if (countdownPhase > 0.7) {
        const revPhase = (countdownPhase - 0.7) / 0.3; // 0→1 during rev-up
        cameraShakeIntensity = revPhase * 0.4;
      } else {
        cameraShakeIntensity = 0;
      }
      // Reset bay position
      launchBayGroup.position.set(0, -32, 50);
      launchBayGroup.visible = true;
    }
    // Stage 2: Launch acceleration (0.625 - 1.0) - Bay streaks past into open space
    else {
      const launchPhase = (progress - 0.625) / 0.375;
      // Move bay backward away from camera
      launchBayGroup.position.z = 50 + launchPhase * 2000;
      // Fade out opacity gradually
      const opacity = Math.max(0, 1.0 - launchPhase * 2);
      launchBayGroup.children.forEach(child => {
        if (child.material) {
          child.material.opacity = opacity;
          if (child.material.emissive) {
            child.material.emissiveIntensity = 0.8 + launchPhase * 1.2;
          }
        }
      });
      // Intense camera shake during acceleration
      cameraShakeIntensity = 0.5 + launchPhase * 1.5;
    }
  }


  function createStarfield() {
    // Stars live in WORLD SPACE — they move relative to the player as you fly.
    // The same vertex array is shared with the radar sphere for a mirrored miniature.
    starfieldVerts = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = STAR_RADIUS + Math.random() * 1000;
      const i3 = i * 3;
      starfieldVerts[i3] = r * Math.sin(phi) * Math.cos(theta);
      starfieldVerts[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starfieldVerts[i3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(starfieldVerts, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false });
    scene.add(new THREE.Points(geo, mat)); // world space, NOT camera.add
  }

  function createCockpit() {
    cockpitGroup = new THREE.Group();
    cockpitGroup.renderOrder = 100;
    cockpitGroup.frustumCulled = false;

    // Build manifold cockpit as a diagnostic/fallback lens.
    // Visual default remains the authored GLB cockpit.
    createManifoldCockpit();

    // Load GLB cockpit model
    const gltfLoader = new THREE.GLTFLoader();
    gltfLoader.load('assets/models/optimized/firstPersonStarFighterCockpit_lod0.glb',
      function (gltf) {
        cockpitModel = gltf.scene;

        // Model bounds are roughly -0.8 to 0.8 (unit cube).
        // Scale and position so the pilot view looks out through the cockpit.
        // We want the cockpit to fill the lower portion of the view.
        cockpitModel.scale.setScalar(1.8);
        cockpitModel.position.set(0, -0.6, -0.8);

        // Ensure cockpit renders on top of everything (depth-free overlay)
        cockpitModel.traverse(child => {
          if (child.isMesh) {
            child.renderOrder = 100;
            child.frustumCulled = false;
            child.material.side = THREE.DoubleSide;
            // Keep cockpit as a camera-overlay layer so nearby world geometry
            // (baseship hull / launch tunnel) cannot punch it out after launch.
            child.material.depthTest = false;
            child.material.depthWrite = false;
            child.material.toneMapped = true;
            // Keep the PBR look
            if (child.material.map) child.material.map.encoding = THREE.sRGBEncoding;
          }
        });

        // ── Separate arm geometry for procedural animation ──
        cockpitModel.traverse(child => {
          if (child.isMesh && child.geometry) {
            _extractArms(child);
          }
        });

        cockpitGroup.add(cockpitModel);
        cockpitModel.visible = cockpitVisible;
        cockpitLoaded = true;
        cockpitLoadFailed = false;
        if (manifoldCockpitGroup) manifoldCockpitGroup.visible = cockpitVisible && MANIFOLD_COCKPIT_DEBUG;
        _updateLoadingProgress('cockpit');

        console.log('Cockpit GLB loaded successfully');
      },
      function (progress) {
        if (progress.total > 0) {
          const pct = Math.floor(progress.loaded / progress.total * 100);
          const text = document.getElementById('loading-text');
          if (text) text.textContent = 'LOADING COCKPIT... ' + pct + '%';
        }
      },
      function (error) {
        console.error('Failed to load cockpit GLB:', error);
        cockpitLoadFailed = true;
        if (manifoldCockpitGroup) manifoldCockpitGroup.visible = cockpitVisible;
        _updateLoadingProgress('cockpit');
      }
    );

    // ── Telemetry canvas (still drawn to offscreen canvas for HUD) ──
    telemetryCanvas = document.createElement('canvas');
    telemetryCanvas.width = 256;
    telemetryCanvas.height = 256;
    telemetryCtx = telemetryCanvas.getContext('2d');
    telemetryTexture = new THREE.CanvasTexture(telemetryCanvas);
    telemetryTexture.minFilter = THREE.LinearFilter;

    // ── Radar texture from radar-canvas ──
    const radarCanvas = document.getElementById('radar-canvas');
    if (radarCanvas) {
      radarTexture = new THREE.CanvasTexture(radarCanvas);
      radarTexture.minFilter = THREE.LinearFilter;
    }

    camera.add(cockpitGroup);
    scene.add(camera);
  }

  function createManifoldCockpit() {
    manifoldCockpitGroup = new THREE.Group();
    manifoldCockpitGroup.position.set(0, -0.57, -0.75);
    manifoldCockpitGroup.renderOrder = 99;
    manifoldCockpitGroup.frustumCulled = false;
    manifoldCockpitGroup.visible = MANIFOLD_COCKPIT_DEBUG;

    const shellPositions = [];
    const shellColors = [];
    const manifold = window.SpaceManifold;
    const shellColor = new THREE.Color();

    for (let xi = -16; xi <= 16; xi++) {
      for (let yi = -12; yi <= 10; yi++) {
        const x = xi * 0.055;
        const y = yi * 0.055;
        const fold = x * y;
        const z = -0.18 - Math.abs(fold) * 2.15 - Math.pow(Math.abs(x), 1.45) * 0.32;
        const field = manifold && manifold.diamond ? manifold.diamond(x * 700, y * 700, z * 700) : 0;

        if (Math.abs(field) < 0.33 || Math.abs(fold) < 0.045) {
          shellPositions.push(
            x,
            y + field * 0.03,
            z - Math.abs(field) * 0.08
          );

          const intensity = 0.35 + (0.25 * (1 - Math.min(1, Math.abs(field))));
          shellColor.setRGB(0.08, 0.65 + intensity * 0.4, 0.9 + intensity * 0.1);
          shellColors.push(shellColor.r, shellColor.g, shellColor.b);
        }
      }
    }

    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellPositions, 3));
    shellGeo.setAttribute('color', new THREE.Float32BufferAttribute(shellColors, 3));
    manifoldCockpitShellMat = new THREE.PointsMaterial({
      size: 0.028,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
    });
    manifoldCockpitShell = new THREE.Points(shellGeo, manifoldCockpitShellMat);
    manifoldCockpitShell.renderOrder = 99;
    manifoldCockpitShell.frustumCulled = false;
    manifoldCockpitGroup.add(manifoldCockpitShell);

    const dashGeo = new THREE.BoxGeometry(1.55, 0.18, 0.88, 4, 1, 3);
    manifoldCockpitMat = new THREE.MeshStandardMaterial({
      color: 0x0b1322,
      emissive: 0x0f8fb0,
      emissiveIntensity: 0.28,
      roughness: 0.72,
      metalness: 0.55,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    manifoldCockpitDash = new THREE.Mesh(dashGeo, manifoldCockpitMat);
    manifoldCockpitDash.position.set(0, -0.17, -0.28);
    manifoldCockpitDash.rotation.x = -0.32;
    manifoldCockpitDash.renderOrder = 98;
    manifoldCockpitDash.frustumCulled = false;
    manifoldCockpitGroup.add(manifoldCockpitDash);

    const railMat = new THREE.LineBasicMaterial({
      color: 0x66eeff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthTest: false,
    });
    const railCurves = [-1, 1].map(sign => {
      const points = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const x = sign * (0.34 + 0.14 * (1 - t));
        const y = -0.28 + Math.sin(t * Math.PI) * 0.38;
        const z = -0.18 - t * 1.05 - Math.abs(x * y) * 0.55;
        points.push(new THREE.Vector3(x, y, z));
      }
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), railMat);
    });
    railCurves.forEach(line => {
      line.renderOrder = 99;
      line.frustumCulled = false;
      manifoldCockpitGroup.add(line);
    });

    cockpitGroup.add(manifoldCockpitGroup);
  }

  /**
   * Extract arm-like vertices from the cockpit mesh into separate sub-groups.
   * We identify "arm" regions by their local-space X position:
   *   Left arm: x < -0.35, y < 0.0 (lower-left quadrant)
   *   Right arm: x > 0.35, y < 0.0 (lower-right quadrant)
   * These get reparented as pivot groups that can rotate with steering input.
   */
  function _extractArms(mesh) {
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    // Just create pivot groups at arm positions for rotation
    // Since splitting a 1.3M vertex mesh is expensive, we use a lightweight approach:
    // Create invisible pivot points at arm positions that rotate the whole cockpit subtly
    cockpitLeftArm = new THREE.Group();
    cockpitLeftArm.position.set(-0.35, -0.25, -0.2); // left arm pivot
    cockpitGroup.add(cockpitLeftArm);

    cockpitRightArm = new THREE.Group();
    cockpitRightArm.position.set(0.35, -0.25, -0.2); // right arm pivot
    cockpitGroup.add(cockpitRightArm);
  }

  /**
   * Animate cockpit arms based on player flight controls.
   * Called each frame from render(). Rotates the whole cockpit model subtly
   * to simulate the pilot steering — arms move with the ship controls.
   */
  function _animateCockpitArms(player) {
    if (!cockpitModel || !cockpitLoaded) return;

    // The cockpit is attached to the camera (first-person), so it stays fixed
    // in view. To simulate the pilot actively steering, we apply subtle tilt
    // to the cockpit model based on pitch/yaw input.
    // This makes the hands appear to push the stick in the direction of travel.

    const yaw = THREE.MathUtils.clamp(player.yaw || 0, -1.6, 1.6);    // bounded steering intent
    const pitch = THREE.MathUtils.clamp(player.pitch || 0, -1.4, 1.4); // bounded steering intent
    const roll = player.roll || 0;

    // Smoothly tilt cockpit to follow stick input
    // Target rotation: stick-right → cockpit tilts right, stick-forward → tilts forward
    const targetRollZ = -yaw * 0.15;   // yaw input tilts cockpit left/right
    const targetPitchX = pitch * 0.12;  // pitch input tilts cockpit forward/back
    const targetYawY = yaw * 0.08;      // slight yaw follow

    // Smooth interpolation (lerp)
    cockpitModel.rotation.z += (targetRollZ - cockpitModel.rotation.z) * 0.12;
    cockpitModel.rotation.x += (targetPitchX - cockpitModel.rotation.x) * 0.12;
    cockpitModel.rotation.y += (targetYawY - cockpitModel.rotation.y) * 0.12;

    // Hard safety rails: keep cockpit in-frame even if input spikes slip through.
    cockpitModel.rotation.z = THREE.MathUtils.clamp(cockpitModel.rotation.z, -0.26, 0.26);
    cockpitModel.rotation.x = THREE.MathUtils.clamp(cockpitModel.rotation.x, -0.22, 0.22);
    cockpitModel.rotation.y = THREE.MathUtils.clamp(cockpitModel.rotation.y, -0.16, 0.16);
  }

  function _animateManifoldCockpit(player) {
    if (!manifoldCockpitGroup || !manifoldCockpitGroup.visible) return;

    const yaw = player.yaw || 0;
    const pitch = player.pitch || 0;
    const throttle = player.throttle || 0;
    const phase = window.SpaceManifold && window.SpaceManifold.helixPhase
      ? window.SpaceManifold.helixPhase(player.position.x, player.position.y)
      : performance.now() * 0.001;

    manifoldCockpitGroup.rotation.z += ((-yaw * 0.08) - manifoldCockpitGroup.rotation.z) * 0.08;
    manifoldCockpitGroup.rotation.x += ((pitch * 0.06) - manifoldCockpitGroup.rotation.x) * 0.08;

    const pulse = 0.55 + 0.25 * Math.sin(performance.now() * 0.002 + phase);
    const thrustGlow = 0.18 + Math.max(0, throttle) * 0.18;
    if (manifoldCockpitShellMat) manifoldCockpitShellMat.opacity = cockpitLoaded ? 0.24 + pulse * 0.08 : 0.72 + pulse * 0.12;
    if (manifoldCockpitMat) manifoldCockpitMat.emissiveIntensity = 0.22 + pulse * 0.2 + thrustGlow;
  }

  // Resize cockpit — GLB model scales naturally, no quad to rebuild
  function resizeCockpit() {
    // GLB cockpit is 3D and attached to camera — no resize needed
    // Aspect ratio changes are handled by the perspective projection
  }

  // Show/hide cockpit (called by core.js on launch complete)
  function showCockpit(visible) {
    cockpitVisible = visible;
    lastCockpitToggleAt = Date.now();
    lastCockpitToggleValue = !!visible;
    if (cockpitModel) cockpitModel.visible = visible;
    if (manifoldCockpitGroup) manifoldCockpitGroup.visible = visible && (MANIFOLD_COCKPIT_DEBUG || cockpitLoadFailed);
  }

  function getCockpitDebugState() {
    return {
      cockpitLoaded,
      cockpitVisible,
      hasCockpitModel: !!cockpitModel,
      hasManifoldCockpit: !!manifoldCockpitGroup,
      cockpitLoadFailed,
      manifoldCockpitDebugMode: MANIFOLD_COCKPIT_DEBUG,
      cockpitModelVisible: cockpitModel ? !!cockpitModel.visible : null,
      manifoldCockpitVisible: manifoldCockpitGroup ? !!manifoldCockpitGroup.visible : null,
      lastCockpitToggleAt,
      lastCockpitToggleValue,
    };
  }

  // Draw telemetry gauges onto the right-screen canvas
  function updateTelemetryScreen(data) {
    if (!telemetryCtx) return;

    // Delta-only telemetry: if values did not change, keep canvas as-is.
    const sig = [
      data.speed, data.maxSpeed, data.throttle, data.fuel,
      data.hull, data.shields, data.basePct,
      data.score, data.wave, data.torpedoes,
      data.kills, data.message || ''
    ].join('|');
    if (sig === _lastTelemetrySignature) return;
    _lastTelemetrySignature = sig;

    const c = telemetryCtx;
    const W = 256, H = 256;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,5,10,0.9)';
    c.fillRect(0, 0, W, H);

    const gauges = [
      { label: 'SPD', val: data.speed, max: data.maxSpeed, color: '#0ff' },
      { label: 'THR', val: data.throttle, max: 100, color: '#0ff' },
      { label: 'FUEL', val: data.fuel, max: 100, color: '#0f0' },
      { label: 'HULL', val: data.hull, max: 100, color: data.hull < 30 ? '#f00' : '#48f' },
      { label: 'SHLD', val: data.shields, max: 100, color: data.shields < 30 ? '#f80' : '#48f' },
      { label: 'BASE', val: data.basePct, max: 100, color: data.basePct < 20 ? '#f00' : '#f80' }
    ];

    const barX = 52, barW = 160, barH = 14, gap = 6;
    const startY = 18;

    c.font = '11px Courier New';
    c.textBaseline = 'middle';

    gauges.forEach((g, i) => {
      const y = startY + i * (barH + gap);
      const pct = Math.max(0, Math.min(1, g.val / g.max));

      // Label
      c.fillStyle = '#6cf';
      c.textAlign = 'right';
      c.fillText(g.label, barX - 6, y + barH / 2);

      // Track
      c.fillStyle = 'rgba(0,255,255,0.08)';
      c.fillRect(barX, y, barW, barH);
      c.strokeStyle = 'rgba(0,255,255,0.2)';
      c.strokeRect(barX, y, barW, barH);

      // Fill
      c.fillStyle = g.color;
      c.globalAlpha = 0.8;
      c.fillRect(barX, y, barW * pct, barH);
      c.globalAlpha = 1.0;

      // Value
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.fillText(Math.floor(g.val), barX + barW + 6, y + barH / 2);
    });

    // Score + Wave at bottom
    const scoreY = startY + gauges.length * (barH + gap) + 10;
    c.fillStyle = '#fff';
    c.font = 'bold 18px Courier New';
    c.textAlign = 'center';
    c.fillText(data.score, W / 2, scoreY);
    c.fillStyle = '#6cf';
    c.font = '11px Courier New';
    c.fillText('WAVE ' + data.wave, W / 2, scoreY + 20);

    // Weapons
    c.fillStyle = '#0f0';
    c.font = '10px Courier New';
    c.textAlign = 'left';
    c.fillText('● LASERS ONLINE', 20, scoreY + 42);
    c.fillStyle = '#0ff';
    c.fillText('● TORPEDOES: ' + data.torpedoes, 20, scoreY + 56);

    // Warning message
    if (data.message) {
      c.fillStyle = '#ff0';
      c.font = '10px Courier New';
      c.textAlign = 'center';
      c.fillText(data.message, W / 2, H - 12);
    }

    telemetryTexture.needsUpdate = true;
  }

  // Update radar texture from existing radar canvas
  function updateRadarTexture() {
    if (radarTexture) radarTexture.needsUpdate = true;
  }

  let hangarMesh = null;
  let sharedNoiseTexture = null;
  function getNoiseTexture() {
    if (sharedNoiseTexture) return sharedNoiseTexture;
    const size = 256; // 256 is plenty for bump noise (was 512)
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const v = Math.random() * 255;
      imgData.data[i] = v;
      imgData.data[i + 1] = v;
      imgData.data[i + 2] = v;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    sharedNoiseTexture = new THREE.CanvasTexture(canvas);
    sharedNoiseTexture.wrapS = THREE.RepeatWrapping;
    sharedNoiseTexture.wrapT = THREE.RepeatWrapping;
    return sharedNoiseTexture;
  }

  // ── Shared material cache (created once on first use) ──
  function _getSharedMats() {
    if (sharedMats) return sharedMats;
    const nt = getNoiseTexture();
    sharedMats = {
      // Enemy fighter
      alien: new THREE.MeshPhysicalMaterial({ color: 0x334433, metalness: 0.95, roughness: 0.25, clearcoat: 1.0, bumpMap: nt, bumpScale: 0.08 }),
      alienDark: new THREE.MeshPhysicalMaterial({ color: 0x112211, metalness: 1.0, roughness: 0.15, bumpMap: nt, bumpScale: 0.1 }),
      alienGlow: new THREE.MeshBasicMaterial({ color: 0x00ff44 }),
      alienSpike: new THREE.MeshPhysicalMaterial({ color: 0x556655, metalness: 1.0, roughness: 0.1, clearcoat: 1.0 }),
      alienDome: new THREE.MeshPhysicalMaterial({ color: 0x003300, metalness: 0.5, roughness: 0.1, clearcoat: 1.0, opacity: 0.7, transparent: true }),
      // Baseship
      hull: new THREE.MeshPhysicalMaterial({ color: 0x667788, metalness: 0.85, roughness: 0.2, bumpMap: nt, bumpScale: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
      detail: new THREE.MeshPhysicalMaterial({ color: 0x99aabb, metalness: 0.95, roughness: 0.1, clearcoat: 1.0 }),
      dark: new THREE.MeshPhysicalMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.3, bumpMap: nt, bumpScale: 0.1 }),
      glowBlue: new THREE.MeshBasicMaterial({ color: 0x44aaff }),
      glowCyan: new THREE.MeshBasicMaterial({ color: 0x00ffff }),
      window: new THREE.MeshBasicMaterial({ color: 0x88ccff }),
      hangarGlow: new THREE.MeshBasicMaterial({ color: 0x335577, transparent: true, opacity: 0.6 }),
      // Alien capital
      alienCap: new THREE.MeshPhysicalMaterial({ color: 0x221133, emissive: 0x110011, metalness: 1.0, roughness: 0.15, bumpMap: nt, bumpScale: 0.3, clearcoat: 1.0 }),
      alienArmor: new THREE.MeshPhysicalMaterial({ color: 0x332244, metalness: 0.95, roughness: 0.1, bumpMap: nt, bumpScale: 0.2 }),
      alienCapSpike: new THREE.MeshPhysicalMaterial({ color: 0x664488, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 }),
      alienCapGlow: new THREE.MeshBasicMaterial({ color: 0xff00ff }),
      alienShield: new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.08 }),
      // ── Laser — brilliant green-cyan beam with hot white core ──
      laserCore: new THREE.MeshBasicMaterial({ color: 0xccffee }),
      laserGlow: new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
      laserHalo: new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      laserTrail: new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }),
      // ── Torpedo — white-hot warhead, deep orange-red exhaust ──
      torpCore: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      torpInner: new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
      torpGlow: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
      torpTrail: new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }),
      torpHalo: new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.BackSide }),
    };
    return sharedMats;
  }

  function createEntityMesh(type, owner) {
    let mesh;

    // ── Map entity types to GLB model keys ──
    const glbKey = type === 'wingman' ? 'ally' : type;

    // ── Try GLB LOD clone first (only if model has finished loading levels) ──
    if (glbModels[glbKey] && glbModels[glbKey].levels && glbModels[glbKey].levels.length > 0) {
      mesh = _cloneLOD(glbKey);
      mesh.scale.setScalar(GLB_SCALES[glbKey] || 10);
      if (type === 'wingman') mesh.userData.isWingman = true;
      if (type === 'baseship') mesh.userData.isBaseship = true;
      if (type === 'tanker') mesh.userData.isTanker = true;
      if (type === 'medic') mesh.userData.isMedic = true;
      // Add bioluminescent point light to alien types
      if (ALIEN_GLOW_COLORS[glbKey]) {
        _addGlowLight(mesh, glbKey);
        mesh.userData.alienGlow = true;
      }
      scene.add(mesh);
      return mesh;
    }

    // ── Trigger lazy GLB load for combat types (streams in during gameplay) ──
    if (GLB_LOD[glbKey] && !_lazyState[glbKey]) _triggerLazyLoad(glbKey);

    // ── Fallback: simple procedural geometry while GLBs load ──
    mesh = new THREE.Group();
    const m = _getSharedMats();

    if (type === 'enemy') {
      // Fallback: bioluminescent organic form (glow worm from Brown Giant)
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.85 });
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(25, 1), bodyMat);
      mesh.add(body);
      // Inner glow core
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xaaffaa, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(16, 8, 8), coreMat));
      // Outer glow halo
      const haloMat = new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(40, 8, 8), haloMat));
      // Point light
      _addGlowLight(mesh, 'enemy');
      mesh.userData.alienGlow = true;
    } else if (type === 'baseship') {
      mesh.userData.isBaseship = true;
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(60, 30, 300), m.hull));
    } else if (type === 'alien-baseship') {
      mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(200, 1), m.alienCap));
    } else if (type === 'alien-base') {
      // Hive: massive glowing organic structure
      const hiveMat = new THREE.MeshBasicMaterial({ color: 0x880088, transparent: true, opacity: 0.8 });
      mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(400, 2), hiveMat));
      const hiveGlow = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.BackSide });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(600, 16, 16), hiveGlow));
      const hiveLight = new THREE.PointLight(0xff44ff, 8, 15000);
      mesh.add(hiveLight);
      mesh.userData.alienGlow = true;
    } else if (type === 'predator') {
      // Predator Drone fallback: intense bioluminescent hunter
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.9 });
      mesh.add(new THREE.Mesh(new THREE.DodecahedronGeometry(60, 0), bodyMat));
      // Blazing plasma core
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x88ff22, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(30, 8, 8), coreMat));
      // Outer glow halo
      const haloMat = new THREE.MeshBasicMaterial({ color: 0x66ff00, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.BackSide });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(80, 8, 8), haloMat));
      _addGlowLight(mesh, 'predator');
      mesh.userData.alienGlow = true;
    } else if (type === 'interceptor') {
      // Interceptor fallback: sleek cyan glowing form
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85 });
      mesh.add(new THREE.Mesh(new THREE.ConeGeometry(16, 50, 6), bodyMat));
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x88ffee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), coreMat));
      _addGlowLight(mesh, 'interceptor');
      mesh.userData.alienGlow = true;
    } else if (type === 'bomber') {
      // Bomber fallback: bulbous orange-glowing form
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 });
      const bodyGeo = new THREE.SphereGeometry(35, 8, 8);
      bodyGeo.scale(1.3, 0.8, 1.0);
      mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(20, 8, 8), coreMat));
      _addGlowLight(mesh, 'bomber');
      mesh.userData.alienGlow = true;
    } else if (type === 'dreadnought') {
      // Dreadnought fallback: massive red-glowing form
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.85 });
      mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(160, 1), bodyMat));
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xff4488, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(100, 8, 8), coreMat));
      _addGlowLight(mesh, 'dreadnought');
      mesh.userData.alienGlow = true;
    } else if (type === 'tanker') {
      // Tanker fallback: white-orange utility craft
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xccbbaa, metalness: 0.5, roughness: 0.5 });
      const bodyGeo = new THREE.BoxGeometry(40, 20, 60);
      mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
      const boomMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 35, 6), boomMat);
      boom.rotation.x = Math.PI / 2;
      boom.position.z = -30;
      mesh.add(boom);
      // Beacon light
      const beacon = new THREE.PointLight(0x00ff88, 2, 200);
      beacon.position.set(0, 14, -40);
      mesh.add(beacon);
    } else if (type === 'medic') {
      // Medical frigate fallback: white-red medical vessel
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 });
      const bodyGeo = new THREE.BoxGeometry(45, 24, 75);
      mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
      // Red cross markings (horizontal + vertical bars)
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(20, 0.8, 7), crossMat);
      crossH.position.set(0, 12.2, 8);
      mesh.add(crossH);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 20), crossMat);
      crossV.position.set(0, 12.2, 8);
      mesh.add(crossV);
      // Medical beacon
      const beacon = new THREE.PointLight(0xff4444, 2, 250);
      beacon.position.set(0, 16, 0);
      mesh.add(beacon);
    } else if (type === 'plasma') {
      // Toxic green plasma bolt
      const plasmaMat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.8 });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), plasmaMat));
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x88ff44, transparent: true, opacity: 0.3 });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(20, 6, 6), glowMat));
    } else if (type === 'egg') {
      // Organic egg — yellowish-green translucent ovoid
      const eggMat = new THREE.MeshBasicMaterial({ color: 0x99cc33, transparent: true, opacity: 0.75 });
      const eggGeo = new THREE.SphereGeometry(14, 8, 8);
      eggGeo.scale(1, 1.3, 1); // elongated
      mesh.add(new THREE.Mesh(eggGeo, eggMat));
      // Inner glow (something growing inside)
      const innerMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.4 });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(7, 6, 6), innerMat));
    } else if (type === 'youngling') {
      // Small spidery creature — dark with red eyes
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x332211, transparent: true, opacity: 0.9 });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(8, 6, 6), bodyMat));
      // Red eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const eye1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 4, 4), eyeMat);
      eye1.position.set(3, 1.2, -6);
      mesh.add(eye1);
      const eye2 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 4, 4), eyeMat);
      eye2.position.set(-3, 1.2, -6);
      mesh.add(eye2);
    } else if (type === 'laser') {
      // ═══════════════════════════════════════════════════════════════
      // ENERGY BOLT — ButterflyFX Weapon VFX Rendering Guide §2
      // Billboard quad with GLSL shader: white core + colored glow halo
      // + scrolling noise energy pulse.  Per spec: NOT a sphere, NOT a
      // cylinder — a camera-facing quad that always faces the camera.
      // Particle trail still emitted per-frame in render loop (§8).
      // ═══════════════════════════════════════════════════════════════
      return _createLaserBoltMesh(owner === 'player'); // early return — already scene.add'd
    } else if (type === 'machinegun') {
      // ═══════════════════════════════════════════════════════════════
      // TRACER ROUNDS — bright hot yellow-white dashes with streak
      // ═══════════════════════════════════════════════════════════════
      const tracerLen = 14;
      const coreGeo = new THREE.CylinderGeometry(0.2, 0.15, tracerLen, 4, 1);
      coreGeo.rotateX(Math.PI / 2);
      const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
      const streakGeo = new THREE.CylinderGeometry(0.8, 0.1, tracerLen + 4, 4, 1);
      streakGeo.rotateX(Math.PI / 2);
      const streakMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending });
      const haloGeo = new THREE.CylinderGeometry(2.0, 0.3, tracerLen + 2, 4, 1);
      haloGeo.rotateX(Math.PI / 2);
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending });
      mesh.add(new THREE.Mesh(coreGeo, tracerMat));
      mesh.add(new THREE.Mesh(streakGeo, streakMat));
      mesh.add(new THREE.Mesh(haloGeo, haloMat));
      // Bright tip
      const tipGeo = new THREE.SphereGeometry(0.6, 4, 4);
      tipGeo.translate(0, 0, -tracerLen / 2);
      mesh.add(new THREE.Mesh(tipGeo, tracerMat));
    } else if (type === 'torpedo') {
      // ═══════════════════════════════════════════════════════════════
      // PROTON TORPEDO — streamlined missile, world-class 2026 rendering
      // Travels nose-first in the -Z direction; engine exhaust at +Z rear
      // • Metallic body with nose cone + guidance ring + engine housing
      // • Glowing engine nozzle ring (TorusGeometry, smooth)
      // • Additive glow spheres at engine — animated in render loop
      // • Dynamic particle trail via spawnTorpedoTrail (world-space particles)
      // ═══════════════════════════════════════════════════════════════

      // Per-torpedo materials (instance-specific for independent animation)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb8ccd8, metalness: 0.85, roughness: 0.2 });
      const noseMat = new THREE.MeshStandardMaterial({ color: 0xddeeff, metalness: 0.95, roughness: 0.12, emissive: 0x223344, emissiveIntensity: 0.4 });
      const engineMat = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.98, roughness: 0.08 });

      // Nose cone — sleek pointed tip, travels in -Z direction
      const noseConeGeo = new THREE.ConeGeometry(1.8, 9, 16, 1);
      noseConeGeo.rotateX(Math.PI / 2);   // tip now at -Z
      noseConeGeo.translate(0, 0, -11.5); // tip at Z≈-16, base at Z≈-7
      mesh.add(new THREE.Mesh(noseConeGeo, noseMat));

      // Main body cylinder — smooth, silver-blue
      const bodyGeo = new THREE.CylinderGeometry(2.3, 2.3, 20, 16, 1);
      bodyGeo.rotateX(Math.PI / 2);
      bodyGeo.translate(0, 0, -1.5);
      mesh.add(new THREE.Mesh(bodyGeo, bodyMat));

      // Guidance ring — cyan-glowing ring at midpoint
      const guideRingMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
      const guideRingGeo = new THREE.TorusGeometry(2.8, 0.35, 8, 24);
      guideRingGeo.translate(0, 0, -3);
      mesh.add(new THREE.Mesh(guideRingGeo, guideRingMat));

      // Engine housing — slightly flared at rear
      const engineGeo = new THREE.CylinderGeometry(3.2, 2.4, 7, 16, 1);
      engineGeo.rotateX(Math.PI / 2);
      engineGeo.translate(0, 0, 9);
      mesh.add(new THREE.Mesh(engineGeo, engineMat));

      // Engine nozzle ring — glowing hot orange torus (smooth 24-seg)
      const nozzleRingMat = new THREE.MeshBasicMaterial({ color: 0xff7700, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending });
      const nozzleRingGeo = new THREE.TorusGeometry(2.8, 0.6, 8, 24);
      nozzleRingGeo.translate(0, 0, 13);
      mesh.add(new THREE.Mesh(nozzleRingGeo, nozzleRingMat));

      // Engine inner core — bright white-yellow point light center
      const engineCoreMat = new THREE.MeshBasicMaterial({ color: 0xffeecc, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
      const engineCoreGeo = new THREE.SphereGeometry(2.2, 12, 12);
      engineCoreGeo.translate(0, 0, 13);
      const engCoreMesh = new THREE.Mesh(engineCoreGeo, engineCoreMat);
      engCoreMesh.userData.torpGlowCore = true; // animated in render loop
      mesh.add(engCoreMesh);

      // Engine glow sphere — orange bloom around nozzle
      const engGlowMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
      const engGlowGeo = new THREE.SphereGeometry(5.5, 12, 12);
      engGlowGeo.translate(0, 0, 14);
      const engGlowMesh = new THREE.Mesh(engGlowGeo, engGlowMat);
      engGlowMesh.userData.torpGlowSphere = true; // animated in render loop
      mesh.add(engGlowMesh);

      // Outer exhaust halo — large soft bloom (back-face so it glows outward)
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, side: THREE.BackSide });
      const haloGeo = new THREE.SphereGeometry(11, 12, 12);
      haloGeo.translate(0, 0, 15);
      mesh.add(new THREE.Mesh(haloGeo, haloMat));

      // Exhaust billboard — cross-hatch plane for volumetric trail glow
      const torpBillMat = _getTorpBillMat();
      const torpBillW = 18, torpBillH = 28;
      const tbg1 = new THREE.PlaneGeometry(torpBillW, torpBillH);
      tbg1.rotateX(-Math.PI / 2); // in XZ plane, pointing +Z
      tbg1.translate(0, 0, 22);
      mesh.add(new THREE.Mesh(tbg1, torpBillMat));
      const tbg2 = new THREE.PlaneGeometry(torpBillW, torpBillH);
      tbg2.rotateX(-Math.PI / 2);
      tbg2.rotateZ(Math.PI / 2);
      tbg2.translate(0, 0, 22);
      mesh.add(new THREE.Mesh(tbg2, torpBillMat));

      mesh.userData.isTorpedo = true;
    } else {
      // Fallback: glowing point
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    }

    scene.add(mesh);
    return mesh;
  }

  // ── Helper: hex color → rgb floats ──
  function _hexRGB(hex) {
    return [(hex >> 16 & 0xff) / 255, (hex >> 8 & 0xff) / 255, (hex & 0xff) / 255];
  }

  function spawnExplosion(pos) {
    // ═══════════════════════════════════════════════════════════════
    // EXPLOSION — 2026 quality: multi-phase volumetric detonation
    // Phase 1: Brilliant white flash sphere (blinding burst)
    // Phase 2: Expanding shockwave ring (visible pressure wave)
    // Phase 3: Hot debris cloud (orange-white fragments)
    // Phase 4: Fast sparks (streaking metal shards)
    // ═══════════════════════════════════════════════════════════════

    // Dynamic point light — intense white flash
    const light = new THREE.PointLight(0xffffff, 30, 1500);
    light.position.copy(pos);
    scene.add(light);
    let flashTimer = 0;
    const flashInterval = setInterval(() => {
      flashTimer += 16;
      const t = flashTimer / 350;
      // Fast quadratic decay with orange shift
      light.intensity = 30 * Math.max(0, 1 - t * t);
      if (t > 0.3) light.color.setHex(0xff8844);
      if (t >= 1) { scene.remove(light); clearInterval(flashInterval); }
    }, 16);

    // Expanding flash sphere mesh (brief bright ball that grows and fades)
    const flashGeo = new THREE.SphereGeometry(1, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const flashSphere = new THREE.Mesh(flashGeo, flashMat);
    flashSphere.position.copy(pos);
    scene.add(flashSphere);
    let sphereTimer = 0;
    const sphereInterval = setInterval(() => {
      sphereTimer += 16;
      const t = sphereTimer / 250;
      const scale = 20 + t * 80;
      flashSphere.scale.setScalar(scale);
      flashMat.opacity = Math.max(0, 0.9 * (1 - t * t));
      if (t > 0.4) flashMat.color.setHex(0xffaa44);
      if (t >= 1) {
        scene.remove(flashSphere);
        flashGeo.dispose(); flashMat.dispose();
        clearInterval(sphereInterval);
      }
    }, 16);

    // Shockwave ring — expanding torus (visible pressure wave)
    const ringGeo = new THREE.TorusGeometry(1, 0.3, 6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(camera.position);
    scene.add(ring);
    let ringTimer = 0;
    const ringInterval = setInterval(() => {
      ringTimer += 16;
      const t = ringTimer / 500;
      ring.scale.setScalar(15 + t * 150);
      ringMat.opacity = Math.max(0, 0.5 * (1 - t));
      if (t >= 1) {
        scene.remove(ring);
        ringGeo.dispose(); ringMat.dispose();
        clearInterval(ringInterval);
      }
    }, 16);

    // Phase 1: Initial flash burst — large bright white-blue particles
    const flashColors = [[1, 1, 1], [0.8, 0.9, 1], [1, 0.97, 0.85], [1, 1, 0.9]];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const sp = 150 + Math.random() * 350;
      const c = flashColors[(Math.random() * 4) | 0];
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
        c[0], c[1], c[2], 0.25 + Math.random() * 0.2, 50 + Math.random() * 40);
    }

    // Phase 2: Hot debris cloud — orange-white expanding chunks
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const sp = 40 + Math.random() * 200;
      const heat = Math.random();
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
        0.8 + heat * 0.2, 0.4 + heat * 0.4, heat * 0.15,
        0.8 + Math.random() * 1.2, 20 + Math.random() * 35);
    }

    // Phase 3: Fast sparks — bright streaking metal fragments
    for (let i = 0; i < 25; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const sp = 400 + Math.random() * 800;
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
        1, 0.8 + Math.random() * 0.2, 0.3 + Math.random() * 0.3,
        0.3 + Math.random() * 0.4, 8 + Math.random() * 12);
    }

    // Phase 4: Secondary ember glow — slow dim particles that linger
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const sp = 20 + Math.random() * 60;
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
        1, 0.3, 0.05, 1.5 + Math.random() * 1.5, 35 + Math.random() * 25);
    }

    cameraShakeIntensity = Math.max(cameraShakeIntensity, 4.0);
  }

  function spawnImpactEffect(pos, color = 0xff00ff) {
    // ── Weapon impact (spec §7): flash sprite + point light glow + radial sparks ──
    const [r, g, b] = _hexRGB(color);

    // Flash sprite — expands and fades over 0.1s (spec §7 ImpactEffect)
    const flashMat = new THREE.SpriteMaterial({
      color: new THREE.Color(r + 0.4, g + 0.4, b + 0.4),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const flashSprite = new THREE.Sprite(flashMat);
    flashSprite.position.copy(pos);
    flashSprite.scale.set(4, 4, 1);
    flashSprite.renderOrder = 102;
    scene.add(flashSprite);

    // Point light glow — fades over 0.3s (spec §7)
    const impactLight = new THREE.PointLight(new THREE.Color(r, g, b), 5.0, 200);
    impactLight.position.copy(pos);
    scene.add(impactLight);

    let impactAge = 0;
    const impactInterval = setInterval(() => {
      impactAge += 0.016;
      const t = impactAge / 0.3;
      // Flash: scale up then hide
      if (t < 0.35) {
        const s = 4 + t * 30;
        flashSprite.scale.set(s, s, 1);
        flashMat.opacity = 1.0 - t / 0.35;
      } else {
        flashSprite.visible = false;
      }
      // Glow light fade
      impactLight.intensity = 5.0 * Math.max(0, 1.0 - t);
      if (t >= 1.0) {
        scene.remove(flashSprite);
        scene.remove(impactLight);
        flashMat.dispose();
        clearInterval(impactInterval);
      }
    }, 16);

    // Radial sparks
    _emitParticle(pos.x, pos.y, pos.z, 0, 0, 0, 1, 1, 1, 0.1, 40);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const sp = 100 + Math.random() * 250;
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.6, Math.sin(a) * Math.cos(el) * sp,
        r, g, b, 0.3 + Math.random() * 0.4, 12 + Math.random() * 18);
    }
    for (let i = 0; i < 6; i++) {
      const sp = 30 + Math.random() * 60;
      const a = Math.random() * Math.PI * 2;
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * sp, (Math.random() - 0.5) * sp, Math.sin(a) * sp,
        1, 1, 0.9, 0.15 + Math.random() * 0.1, 25 + Math.random() * 15);
    }
    cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.8);
  }

  // ── Muzzle flash point light pool ──
  const _muzzleFlashPool = [];
  let _muzzleFlashIdx = 0;
  function _getMuzzleFlash() {
    if (_muzzleFlashPool.length < 6) {
      const light = new THREE.PointLight(0x00ffaa, 8.0, 120);
      scene.add(light);
      _muzzleFlashPool.push({ light, timer: 0, baseIntensity: 8, baseDuration: 0.12 });
      return _muzzleFlashPool[_muzzleFlashPool.length - 1];
    }
    const flash = _muzzleFlashPool[_muzzleFlashIdx % 6];
    _muzzleFlashIdx++;
    return flash;
  }

  function spawnLaser(laserEntity) {
    const p = laserEntity.position;
    if (!p) return;

    // Beam color by owner (spec §2.5 — player=red, enemy=green)
    const isPlayer = laserEntity.owner === 'player';
    const flashHex = isPlayer ? 0xff4444 : 0x44ff44;
    const [fr, fg, fb] = isPlayer ? [1.0, 0.25, 0.25] : [0.25, 1.0, 0.25];

    // Muzzle flash sprite — expanding billboard quad (spec §2.4)
    const mfMat = new THREE.SpriteMaterial({
      color: new THREE.Color(fr + 0.3, fg + 0.3, fb + 0.3),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const mfSprite = new THREE.Sprite(mfMat);
    mfSprite.position.copy(p);
    mfSprite.scale.set(6, 6, 1);
    mfSprite.renderOrder = 101;
    scene.add(mfSprite);

    // Fade out muzzle sprite over 0.05s (spec §2.4)
    let mfAge = 0;
    const mfInterval = setInterval(() => {
      mfAge += 0.016;
      const t = mfAge / 0.07;
      mfMat.opacity = Math.max(0, 1.0 - t);
      if (t >= 1.0) { scene.remove(mfSprite); mfMat.dispose(); clearInterval(mfInterval); }
    }, 16);

    // Point light glow at muzzle
    const flash = _getMuzzleFlash();
    flash.light.position.copy(p);
    flash.light.color.setHex(flashHex);
    flash.light.intensity = 12.0;
    flash.baseIntensity = 12.0;
    flash.baseDuration = 0.09;
    flash.timer = 0.09;

    // Muzzle spark burst — tight forward cone
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 160;
      _emitParticle(
        p.x, p.y, p.z,
        Math.cos(a) * sp * 0.25, (Math.random() - 0.5) * sp * 0.2, -sp,
        fr, fg, fb, 0.08 + Math.random() * 0.06, 12 + Math.random() * 10
      );
    }
    // Central bright streak forward
    _emitParticle(p.x, p.y, p.z, 0, 0, -80, 1, 1, 1, 0.07, 40);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LASER BOLT — ButterflyFX Weapon VFX Rendering Guide §2
  // Billboard quad with custom GLSL shaders.
  // Per spec: NOT a cylinder, NOT a sphere — a camera-facing quad.
  // White-hot core + colored glow halo + scrolling noise + energy pulse.
  // Player = red(1,0.2,0.2)  Enemy = green(0.2,1,0.2)
  // ═══════════════════════════════════════════════════════════════════════

  const _LASER_VERT = [
    'uniform vec3 beamStart;',
    'uniform vec3 beamEnd;',
    'uniform float beamWidth;',
    'uniform float boltTime;',
    'attribute vec2 uv;',
    'varying vec2 vUv;',
    'varying float vAlpha;',
    'void main() {',
    '  vec3 beamDir = beamEnd - beamStart;',
    '  float beamLen = length(beamDir);',
    '  if (beamLen < 0.001) { gl_Position = vec4(0.0); return; }',
    '  vec3 beamDirN = beamDir / beamLen;',
    '  float t = position.y;',
    '  vec3 pt = beamStart + beamDir * t;',
    '  vec3 camToBeam = normalize(pt - cameraPosition);',
    '  vec3 rgt = normalize(cross(beamDirN, camToBeam));',
    '  float w = beamWidth * mix(1.0, 0.5, t);',
    '  float wobble = sin(t * 12.0 + boltTime * 8.0) * 0.02 * (1.0 - t);',
    '  vec3 worldPos = pt + rgt * (position.x * w * 0.5 + wobble);',
    '  vAlpha = 1.0 - t * 0.1;',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);',
    '}'
  ].join('\n');

  const _LASER_FRAG = [
    'uniform float boltTime;',
    'uniform vec3 beamColor;',
    'uniform sampler2D noiseTex;',
    'varying vec2 vUv;',
    'varying float vAlpha;',
    'void main() {',
    '  float d = abs(vUv.x - 0.5) * 2.0;',
    '  float core = 1.0 - smoothstep(0.0, 0.15, d);',
    '  float glow = pow(1.0 - smoothstep(0.0, 0.8, d), 2.0);',
    '  vec2 nuv = vec2(vUv.y * 3.0 - boltTime * 2.0, vUv.x);',
    '  float noise = texture2D(noiseTex, nuv).r;',
    '  float ep = 0.8 + 0.2 * noise;',
    '  float pulse = 0.9 + 0.1 * sin(boltTime * 15.0);',
    '  vec3 col = (vec3(1.0) * core + beamColor * glow) * ep * pulse;',
    '  float edge = 1.0 - smoothstep(0.6, 1.0, d);',
    '  float alpha = (core + glow * 0.6) * edge * vAlpha;',
    '  gl_FragColor = vec4(col * alpha, alpha);',
    '}'
  ].join('\n');

  // Pre-allocated reuse vectors — no allocations in hot bolt uniform update path
  const _boltFwd = new THREE.Vector3();
  const _boltStart = new THREE.Vector3();
  const _boltEnd = new THREE.Vector3();

  // Build a billboard quad mesh for a single energy bolt (spec §2.4)
  function _createLaserBoltMesh(isPlayer) {
    const positions = new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    const beamColor = isPlayer
      ? new THREE.Vector3(1.0, 0.2, 0.2)   // red  — player
      : new THREE.Vector3(0.2, 1.0, 0.2);  // green — enemy

    const mat = new THREE.ShaderMaterial({
      vertexShader: _LASER_VERT,
      fragmentShader: _LASER_FRAG,
      uniforms: {
        beamStart: { value: new THREE.Vector3() },
        beamEnd: { value: new THREE.Vector3() },
        beamWidth: { value: 6.0 },
        beamColor: { value: beamColor },
        boltTime: { value: 0 },
        noiseTex: { value: getNoiseTexture() },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 100;
    mesh.userData.isLaserBolt = true;
    mesh.userData.boltOwner = isPlayer ? 'player' : 'enemy';
    scene.add(mesh);
    return mesh;
  }

  // Update billboard bolt uniforms each frame — no allocations (uses pre-alloc vectors)
  function _updateLaserBoltUniforms(mesh, e, dt) {
    const u = mesh.material.uniforms;
    u.boltTime.value += dt;

    // Bolt forward direction: -Z local axis rotated by entity quaternion
    const q = e.quaternion;
    // -Z column of rotation matrix from quaternion
    _boltFwd.set(
      -2 * (q.x * q.z + q.y * q.w),
      -2 * (q.y * q.z - q.x * q.w),
      -(1 - 2 * (q.x * q.x + q.y * q.y))
    );
    // Center bolt at entity position; stretch 15 units each way
    const halfLen = 15;
    _boltStart.copy(e.position).addScaledVector(_boltFwd, -halfLen); // tail
    _boltEnd.copy(e.position).addScaledVector(_boltFwd, halfLen);   // nose
    u.beamStart.value.copy(_boltStart);
    u.beamEnd.value.copy(_boltEnd);
  }

  // ── Energy bolt trail — allocation-free per-frame particle stream ──
  // Uses inline quaternion math to avoid new THREE.Vector3() each frame.
  // Backward direction (+Z local) = trail spawn axis.
  function _emitBoltTrail(e) {
    const p = e.position, q = e.quaternion;
    if (!p || !q) return;
    // +Z local axis in world space (bolt flies in -Z, trail is behind at +Z)
    const wx = 2 * (q.x * q.z + q.y * q.w);
    const wy = 2 * (q.y * q.z - q.x * q.w);
    const wz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const isPlayer = (e.owner === 'player');
    const cr = isPlayer ? 1.0 : 0.15;
    const cg = isPlayer ? 0.12 : 0.9;
    const cb = isPlayer ? 0.0 : 0.1;
    for (let i = 0; i < 3; i++) {
      const d = 5 + i * 3.5;
      _emitParticle(
        p.x + wx * d + (Math.random() - 0.5) * 1.5,
        p.y + wy * d + (Math.random() - 0.5) * 1.5,
        p.z + wz * d + (Math.random() - 0.5) * 1.5,
        wx * 55 + (Math.random() - 0.5) * 20,
        wy * 55 + (Math.random() - 0.5) * 20,
        wz * 55 + (Math.random() - 0.5) * 20,
        cr, cg, cb,
        0.04 + Math.random() * 0.05,  // very short lifetime
        4 + Math.random() * 5          // small sprite
      );
    }
  }

  function spawnTorpedoTrail(torpEntity) {
    // ═══════════════════════════════════════════════════════════════
    // TORPEDO EXHAUST TRAIL — dense hot engine plume
    // Particles spawn at the engine (+Z rear) and drift behind as the
    // torpedo zooms forward in -Z.  They naturally form a persistent
    // streaming wake.  Three layers:
    //   • Core flame  — white → orange, tight spread
    //   • Spark spray  — fast, tiny, radial burst
    //   • Long ember   — slower, dim, fade over 0.8-1.2s
    // ═══════════════════════════════════════════════════════════════
    const p = torpEntity.position;
    if (!p) return;
    const q = torpEntity.quaternion;
    if (!q) return;

    // Exhaust direction = +Z local (rear of torpedo) in world space
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    // Engine nozzle offset: +13 units along +Z local
    const nozzleX = p.x + fwd.x * 13;
    const nozzleY = p.y + fwd.y * 13;
    const nozzleZ = p.z + fwd.z * 13;

    // ── Core flame plume — hot white-orange, tight cone ──
    for (let i = 0; i < 10; i++) {
      const heat = Math.random();
      const sp = 40 + Math.random() * 60;
      const spread = 12;
      _emitParticle(
        nozzleX + (Math.random() - 0.5) * 2,
        nozzleY + (Math.random() - 0.5) * 2,
        nozzleZ + (Math.random() - 0.5) * 2,
        fwd.x * sp + (Math.random() - 0.5) * spread,
        fwd.y * sp + (Math.random() - 0.5) * spread,
        fwd.z * sp + (Math.random() - 0.5) * spread,
        1.0, 0.55 + heat * 0.45, heat * 0.25,
        0.25 + Math.random() * 0.35, 20 + Math.random() * 20
      );
    }

    // ── Radial spark spray — fast tiny specks fanning outward ──
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 3;
      const vr = 40 + Math.random() * 80; // radial spread velocity
      _emitParticle(
        nozzleX + Math.cos(a) * r * 0.5,
        nozzleY + Math.sin(a) * r * 0.5,
        nozzleZ,
        fwd.x * 30 + Math.cos(a) * vr,
        fwd.y * 30 + Math.sin(a) * vr,
        fwd.z * 30 + (Math.random() - 0.5) * 30,
        1.0, 0.85, 0.35 + Math.random() * 0.3,
        0.12 + Math.random() * 0.18, 7 + Math.random() * 9
      );
    }

    // ── Long embers — slow dim particles that drift and fade ──
    if (Math.random() < 0.5) {
      _emitParticle(
        nozzleX + (Math.random() - 0.5) * 4,
        nozzleY + (Math.random() - 0.5) * 4,
        nozzleZ + (Math.random() - 0.5) * 4,
        fwd.x * 15 + (Math.random() - 0.5) * 18,
        fwd.y * 15 + (Math.random() - 0.5) * 18,
        fwd.z * 15 + (Math.random() - 0.5) * 18,
        0.6, 0.28, 0.08,
        0.8 + Math.random() * 0.7, 25 + Math.random() * 20
      );
    }
  }

  function render(state) {
    if (!scene) return;

    // Cockpit must stay visible during all player-flight phases.
    const phase = state && state.phase;
    const cockpitRequired = phase === 'bay-ready' || phase === 'launching' || phase === 'combat' ||
      phase === 'land-approach' || phase === 'landing' || phase === 'docking';
    if (cockpitRequired && !cockpitVisible) {
      cockpitVisible = true;
      lastCockpitToggleAt = Date.now();
      lastCockpitToggleValue = true;
    }

    if (cockpitGroup) cockpitGroup.visible = cockpitVisible;
    if (cockpitModel) cockpitModel.visible = cockpitVisible;
    if (manifoldCockpitGroup) manifoldCockpitGroup.visible = cockpitVisible && (MANIFOLD_COCKPIT_DEBUG || cockpitLoadFailed);

    // Build camera frustum once per frame for on-screen culling decisions.
    camera.updateMatrixWorld();
    _viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _viewFrustum.setFromProjectionMatrix(_viewProj);

    // Update pooled particle system
    _updateParticles(0.016);
    _frameTime = performance.now();  // cache once per frame

    // Update Camera to Player Position/Rotation
    if (state.player) {
      camera.position.copy(state.player.position);

      // Apply camera shake if active
      if (cameraShakeIntensity > 0) {
        camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
        camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
        camera.position.z += (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
        cameraShakeIntensity *= 0.92; // Decay shake faster
      }

      camera.quaternion.copy(state.player.quaternion);

      // Animate cockpit steering (arms follow stick input)
      _animateCockpitArms(state.player);
      _animateManifoldCockpit(state.player);
    }

    // Sync Entities — acquire dining philosopher forks before touching
    const DP = window.SpaceManifold && window.SpaceManifold.DiningPhilosophers;
    _activeIds.clear();

    for (let i = 0, len = state.entities.length; i < len; i++) {
      const e = state.entities[i];
      if (e.type === 'player') continue; // Handled by camera

      // 🍴 Acquire fork — skip entity if destroyed (fork revoked)
      if (DP && !DP.acquire(e.id, 'render')) continue;

      // Skip baseship during launch phase - don't even create or show it
      if (e.type === 'baseship' && launchPhaseActive) {
        continue;
      }

      _activeIds.add(e.id);

      if (!e.position || !e.quaternion) continue;

      // ── Distance-based rendering: dot / full model / cull ──
      _tmpVec.copy(e.position).sub(camera.position);
      const distSq = _tmpVec.lengthSq();
      const dotThresh = DOT_DIST[e.type] || 3000;
      const isFar = distSq > dotThresh * dotThresh;
      const isCulled = !_NO_CULL_TYPES.has(e.type) && distSq > CULL_DIST * CULL_DIST;

      // Beyond cull distance: entity is data-only, no rendering at all
      if (isCulled) {
        const mesh = entityMeshes.get(e.id);
        if (mesh) mesh.visible = false;
        _hideDot(e.id);
        continue;
      }

      // Far but not culled: render as a simple glowing dot
      if (isFar) {
        // Check frustum for the dot position
        _tmpSphere.center.copy(e.position);
        _tmpSphere.radius = 10;
        const dotOnScreen = _viewFrustum.intersectsSphere(_tmpSphere);
        if (dotOnScreen) {
          _showAsDot(e.id, e.type, e.position);
        } else {
          _hideDot(e.id);
        }
        // Hide full model
        const mesh = entityMeshes.get(e.id);
        if (mesh) mesh.visible = false;
        continue;
      }

      // Close enough for full model rendering
      _hideDot(e.id); // hide dot if transitioning from far to close

      let mesh = entityMeshes.get(e.id);
      if (!mesh) {
        mesh = createEntityMesh(e.type, e.owner);
        entityMeshes.set(e.id, mesh);
      }

      // Delta-only transform updates.
      const ud = mesh.userData;
      if (ud._px !== e.position.x || ud._py !== e.position.y || ud._pz !== e.position.z) {
        mesh.position.copy(e.position);
        ud._px = e.position.x; ud._py = e.position.y; ud._pz = e.position.z;
      }
      if (ud._qx !== e.quaternion.x || ud._qy !== e.quaternion.y || ud._qz !== e.quaternion.z || ud._qw !== e.quaternion.w) {
        mesh.quaternion.copy(e.quaternion);
        ud._qx = e.quaternion.x; ud._qy = e.quaternion.y; ud._qz = e.quaternion.z; ud._qw = e.quaternion.w;
      }

      // On-screen work only: if outside camera frustum, hide and skip expensive updates.
      const cullRadius = Math.max(8, (e.radius || 10) * 1.25);
      _tmpSphere.center.copy(mesh.position);
      _tmpSphere.radius = cullRadius;
      const onScreen = _viewFrustum.intersectsSphere(_tmpSphere);
      mesh.visible = onScreen;
      if (!onScreen) continue;

      // Update LOD level selection based on camera distance
      if (mesh.isLOD) mesh.update(camera);

      // Bioluminescent pulse — alien organisms glow rhythmically in space
      if (mesh.userData && mesh.userData.alienGlow) {
        const glow = mesh.getObjectByName('bioGlow');
        if (glow) {
          const pulse = 0.7 + 0.3 * Math.sin(_frameTime * 0.003 + e.id * 1.7);
          glow.intensity = glow.intensity * 0.9 + (pulse * (ALIEN_GLOW_COLORS[e.type] ? ALIEN_GLOW_COLORS[e.type].pointIntensity : 2.5)) * 0.1;
        }
      }

      // Torpedo: emit particle trail + animate engine glow
      if (e.type === 'torpedo' && mesh.userData && mesh.userData.isTorpedo) {
        spawnTorpedoTrail(e);
        // Pulse engine glow children — flicker like a real rocket exhaust
        const pulse = 0.8 + 0.2 * Math.sin(_frameTime * 0.018 + (e.id.charCodeAt(0) || 0) * 0.7);
        mesh.traverse(child => {
          if (child.userData.torpGlowCore) child.scale.setScalar(0.9 + 0.2 * pulse);
          if (child.userData.torpGlowSphere) child.scale.setScalar(0.85 + 0.3 * pulse);
        });
      }

      // Energy bolt: update billboard shader uniforms + emit particle trail (spec §2, §8)
      if (e.type === 'laser' && mesh.userData && mesh.userData.isLaserBolt) {
        _updateLaserBoltUniforms(mesh, e, 0.016);
        _emitBoltTrail(e);
      }
    }

    // Cleanup dots for entities no longer active
    _cleanupDots(_activeIds);

    // Target Lock Reticle — check fork before accessing locked target
    const lt = state.player && state.player.lockedTarget;
    if (lt && lt.position && (!DP || DP.acquire(lt.id, 'render'))) {
      targetLockMesh.visible = true;
      targetLockMesh.position.copy(lt.position);
      // Scale reticle to fit the target's radius
      const r = lt.radius * 2.5;
      targetLockMesh.scale.set(r / 20, r / 20, r / 20);
      // Face camera then spin slowly on local Z
      targetLockMesh.quaternion.copy(camera.quaternion);
      targetLockMesh.rotateZ(_frameTime * 0.001);
    } else {
      if (targetLockMesh) targetLockMesh.visible = false;
    }

    // Cleanup removed entities
    for (const [id, mesh] of entityMeshes) {
      if (!_activeIds.has(id)) {
        scene.remove(mesh);
        entityMeshes.delete(id);
      }
    }

    // 🍴 Release all render forks — philosophers put down their forks
    if (DP) DP.releaseAll('render');

    // Rotate Earth slowly, clouds slightly faster
    // Static scenery: animate only intermittently and only when potentially visible.
    _staticAnimFrame = (_staticAnimFrame + 1) % 3;

    const earth = scene.getObjectByName('earth-scenery');
    if (earth && _staticAnimFrame === 0) {
      earth.getWorldPosition(_tmpVec);
      _tmpSphere.center.copy(_tmpVec);
      _tmpSphere.radius = 22000;
      if (_viewFrustum.intersectsSphere(_tmpSphere)) {
        earth.rotation.y += 0.0003;
        const clouds = earth.getObjectByName('earth-clouds');
        if (clouds) clouds.rotation.y += 0.0005;
      }
    }

    // Rotate station slowly
    const station = scene.getObjectByName('station-scenery');
    if (station && _staticAnimFrame === 0) {
      station.getWorldPosition(_tmpVec);
      _tmpSphere.center.copy(_tmpVec);
      _tmpSphere.radius = 5000;
      if (_viewFrustum.intersectsSphere(_tmpSphere)) {
        station.rotation.y += 0.001;
        if (station.isLOD) station.update(camera);
      }
    }

    // Rotate moon very slowly (tidally locked in real life, slight drift here for visual)
    const moon = scene.getObjectByName('moon-scenery');
    if (moon && _staticAnimFrame === 0) {
      moon.getWorldPosition(_tmpVec);
      _tmpSphere.center.copy(_tmpVec);
      _tmpSphere.radius = 5000;
      if (_viewFrustum.intersectsSphere(_tmpSphere)) moon.rotation.y += 0.00008;
    }

    // Animate sun corona — subtle breathing pulse
    const sunGrp = scene.getObjectByName('sun-group');
    if (sunGrp && _staticAnimFrame === 0) {
      sunGrp.getWorldPosition(_tmpVec);
      _tmpSphere.center.copy(_tmpVec);
      _tmpSphere.radius = 35000;
      if (_viewFrustum.intersectsSphere(_tmpSphere)) {
        const t = _frameTime * 0.001;
        sunGrp.children.forEach(child => {
          if (child.name && child.name.startsWith('corona-')) {
            const idx = parseInt(child.name.split('-')[1]);
            const pulse = 1.0 + Math.sin(t * (0.5 + idx * 0.15) + idx) * 0.04;
            child.scale.setScalar(pulse);
          }
        });
      }
    }

    renderer.render(scene, camera);
  }

  function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeCockpit();
  }

  // ── Predator Drone plasma bolt — toxic green glowing projectile ──
  function spawnPlasma(plasmaEntity) {
    const p = plasmaEntity.position;
    // Green toxic muzzle flash
    const flash = _getMuzzleFlash();
    flash.light.position.copy(p);
    flash.light.color.setHex(0x44ff00);
    flash.light.intensity = 4.0;
    flash.timer = 0.15;
    // Spray of green plasma particles
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 60;
      _emitParticle(p.x, p.y, p.z,
        Math.cos(a) * sp * 0.4, (Math.random() - 0.5) * sp * 0.4, Math.sin(a) * sp * 0.4,
        0.2, 1, 0, 0.3 + Math.random() * 0.3);
    }
  }

  // ── Egg spawn — subtle organic pulse ──
  function spawnEgg(eggEntity) {
    const p = eggEntity.position;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 20;
      _emitParticle(p.x, p.y, p.z,
        Math.cos(a) * sp * 0.3, (Math.random() - 0.5) * sp * 0.3, Math.sin(a) * sp * 0.3,
        0.6, 0.8, 0.2, 0.4 + Math.random() * 0.3);
    }
  }

  // ── Egg hatch — burst of particles ──
  function spawnEggHatch(pos) {
    // Green/orange organic burst
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const sp = 30 + Math.random() * 50;
      const r = Math.random() > 0.5 ? 0.9 : 0.4;
      const g = Math.random() > 0.5 ? 0.8 : 0.3;
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp,
        Math.sin(el) * sp,
        Math.sin(a) * Math.cos(el) * sp,
        r, g, 0, 0.4 + Math.random() * 0.4);
    }
    // Flash
    const flash = _getMuzzleFlash();
    flash.light.position.copy(pos);
    flash.light.color.setHex(0xaaff00);
    flash.light.intensity = 2.0;
    flash.timer = 0.2;
  }

  // ── EMP Burst — expanding electromagnetic wave ring ──
  function spawnEMPBurst(pos, range) {
    // Create an expanding ring of purple-white energy
    const ringGeo = new THREE.RingGeometry(1, 3, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xcc44ff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    // Face the camera
    ring.lookAt(camera.position);
    scene.add(ring);

    // Second ring — offset for depth
    const ring2Geo = new THREE.RingGeometry(1, 5, 32);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x8822ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.position.copy(pos);
    ring2.lookAt(camera.position);
    scene.add(ring2);

    // Flash light
    const flash = new THREE.PointLight(0xcc44ff, 8, range * 1.5);
    flash.position.copy(pos);
    scene.add(flash);

    // Animate expansion
    const startTime = performance.now();
    const duration = 600; // ms
    const maxScale = range / 2;
    function animateEMP() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const scale = t * maxScale;
      const fade = 1 - t;
      ring.scale.setScalar(scale);
      ring.material.opacity = 0.8 * fade;
      ring2.scale.setScalar(scale * 0.7);
      ring2.material.opacity = 0.5 * fade;
      flash.intensity = 8 * fade * fade;
      if (t < 1) {
        requestAnimationFrame(animateEMP);
      } else {
        scene.remove(ring);
        scene.remove(ring2);
        scene.remove(flash);
        ring.geometry.dispose();
        ring.material.dispose();
        ring2.geometry.dispose();
        ring2.material.dispose();
      }
    }
    requestAnimationFrame(animateEMP);

    // Spark particles — scattered purple-white sparks
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI * 0.5;
      const sp = 100 + Math.random() * 200;
      _emitParticle(pos.x, pos.y, pos.z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.5, Math.sin(a) * Math.cos(el) * sp,
        0.8, 0.3, 1, 0.4 + Math.random() * 0.3);
    }

    cameraShakeIntensity = Math.max(cameraShakeIntensity, 1.5);
  }

  return { init, render, spawnExplosion, spawnLaser, spawnPlasma, spawnEgg, spawnEggHatch, spawnTorpedoTrail, spawnEMPBurst, removeLaunchBay, updateLaunchCinematic, hideHangarBay, showHangarBay, spawnImpactEffect, hideBaseship, showBaseship, showLaunchBay, setLaunchPhase, getStarfieldVerts: () => starfieldVerts, STAR_COUNT, STAR_RADIUS, showCockpit, getCockpitDebugState, updateTelemetryScreen, updateRadarTexture, onAllModelsReady, isReady };
})();

window.SF3D = SF3D;

/**
 * Starfighter Audio System — SFAudio
 * Procedural Web Audio API synthesis — zero external files
 * All sounds generated in real-time from oscillators, noise, and filters.
 */

const SFAudio = (function () {
  let ctx = null;
  let masterGain = null;
  let initialized = false;
  let _pausedByGame = false;

  // Persistent engine drones (looping)
  let engineDrone = null;
  let bayAmbience = null;
  let cockpitHum = null;

  // ── Cached speech voice (resolved async) ──
  let _cachedVoice = null;
  const _voiceCacheByModule = {};
  let _activeVoiceModule = 'au_female';

  const VOICE_MODULES = {
    au_female: {
      label: 'Australian Female PA',
      lang: 'en-AU',
      preferFemale: true,
      rate: 0.92,
      pitch: 1.05,
      volume: 1.0,
      selectors: [
        /Google.*Australian.*Female/i,
        /Microsoft.*Natasha.*Online/i,
        /Microsoft.*Annette.*Online/i,
      ]
    },
    au_command: {
      label: 'Australian Command',
      lang: 'en-AU',
      preferFemale: false,
      rate: 0.9,
      pitch: 0.98,
      volume: 1.0,
      selectors: [
        /Google.*Australian/i,
        /Microsoft.*Australia/i,
      ]
    },
    uk_female: {
      label: 'UK Female PA',
      lang: 'en-GB',
      preferFemale: true,
      rate: 0.93,
      pitch: 1.03,
      volume: 1.0,
      selectors: [
        /Google UK English Female/i,
        /Microsoft.*Libby.*Online/i,
        /Microsoft.*Sonia.*Online/i,
      ]
    },
    us_female: {
      label: 'US Female PA',
      lang: 'en-US',
      preferFemale: true,
      rate: 0.92,
      pitch: 1.02,
      volume: 1.0,
      selectors: [
        /Microsoft.*Aria.*Online/i,
        /Google US English/i,
      ]
    },
    // ── Crew-distinct voice modules ──
    uk_male: {
      label: 'UK Male Officer',
      lang: 'en-GB',
      preferFemale: false,
      rate: 0.88,
      pitch: 0.82,
      volume: 1.0,
      selectors: [
        /Google UK English Male/i,
        /Microsoft.*Ryan.*Online/i,
        /Microsoft.*George.*Online/i,
      ]
    },
    us_male: {
      label: 'US Male Officer',
      lang: 'en-US',
      preferFemale: false,
      rate: 0.90,
      pitch: 0.78,
      volume: 1.0,
      selectors: [
        /Google US English/i,
        /Microsoft.*Guy.*Online/i,
        /Microsoft.*Eric.*Online/i,
        /Microsoft.*Christopher.*Online/i,
      ]
    },
    us_male_deep: {
      label: 'US Male Deep',
      lang: 'en-US',
      preferFemale: false,
      rate: 0.85,
      pitch: 0.65,
      volume: 1.0,
      selectors: [
        /Microsoft.*Guy.*Online/i,
        /Microsoft.*Davis.*Online/i,
        /Google US English/i,
      ]
    },
    us_female_bright: {
      label: 'US Female Bright',
      lang: 'en-US',
      preferFemale: true,
      rate: 0.95,
      pitch: 1.15,
      volume: 1.0,
      selectors: [
        /Microsoft.*Jenny.*Online/i,
        /Microsoft.*Aria.*Online/i,
        /Google US English/i,
      ]
    },
    in_female: {
      label: 'Indian Female Officer',
      lang: 'en-IN',
      preferFemale: true,
      rate: 0.91,
      pitch: 1.08,
      volume: 1.0,
      selectors: [
        /Google.*India/i,
        /Microsoft.*Neerja.*Online/i,
        /Microsoft.*Prabhat/i,
      ]
    },
    za_male: {
      label: 'South African Male',
      lang: 'en-ZA',
      preferFemale: false,
      rate: 0.88,
      pitch: 0.85,
      volume: 1.0,
      selectors: [
        /Google.*South Africa/i,
        /Microsoft.*Luke/i,
      ]
    },

    // ── ANPC Character-Specific Voice Modules ──
    // Each ANPC gets a distinct voice identity. Generic bot voice forbidden.

    anpc_hotshot: {
      label: 'Hotshot — Marcus Chen (Brash, Energetic)',
      lang: 'en-US',
      preferFemale: false,
      rate: 1.18,       // fast — impulsive, eager, proves himself
      pitch: 1.28,      // higher than average male — young energy
      volume: 1.0,
      radioType: 'cockpit',
      selectors: [
        /Microsoft.*Eric.*Online/i,
        /Microsoft.*Guy.*Online/i,
        /Google US English/i,
      ]
    },
    anpc_frostbite: {
      label: 'Frostbite — Viktor Kozlov (Cold, Precise)',
      lang: 'en-GB',
      preferFemale: false,
      rate: 0.78,       // deliberate — methodical, every word measured
      pitch: 0.70,      // low — ice-cold authority
      volume: 1.0,
      radioType: 'cockpit',
      selectors: [
        /Google UK English Male/i,
        /Microsoft.*Ryan.*Online/i,
        /Microsoft.*George.*Online/i,
      ]
    },
    anpc_lighthouse: {
      label: 'Lighthouse — Dr. Amara Okafor (Calm, Authoritative)',
      lang: 'en-GB',
      preferFemale: true,
      rate: 0.87,       // measured, deliberate — never rushed
      pitch: 1.02,      // clear authoritative female — the anchor
      volume: 1.0,
      radioType: 'command',
      selectors: [
        /Google UK English Female/i,
        /Microsoft.*Libby.*Online/i,
        /Microsoft.*Sonia.*Online/i,
      ]
    },
    anpc_vasquez: {
      label: 'Cdr. Vasquez (Commanding)',
      lang: 'en-US',
      preferFemale: true,
      rate: 0.91,       // firm, unhurried command cadence
      pitch: 0.90,      // lower than standard female — commanding weight
      volume: 1.0,
      radioType: 'command',
      selectors: [
        /Microsoft.*Aria.*Online/i,
        /Microsoft.*Olivia.*Online/i,
        /Google US English/i,
      ]
    },
    anpc_nightshade: {
      label: 'Nightshade — Enemy Ace (Calm, Menacing)',
      lang: 'en-US',
      preferFemale: false,
      rate: 0.72,       // very slow — intimidating, surgical precision
      pitch: 0.58,      // lowest pitch — cold menace
      volume: 1.0,
      radioType: 'enemy',
      selectors: [
        /Microsoft.*Davis.*Online/i,
        /Microsoft.*Guy.*Online/i,
        /Google US English/i,
      ]
    },
    anpc_tanaka: {
      label: 'XO Tanaka (Precise, Efficient)',
      lang: 'en-GB',
      preferFemale: true,
      rate: 0.96,       // crisp efficiency
      pitch: 1.12,      // clear, focused
      volume: 1.0,
      radioType: 'command',
      selectors: [
        /Google UK English Female/i,
        /Microsoft.*Libby.*Online/i,
      ]
    },
    anpc_scope: {
      label: 'Scope — Ens. Ji-Yeon Park (Alert, Young)',
      lang: 'en-US',
      preferFemale: true,
      rate: 1.08,       // slightly faster — eager, excited about findings
      pitch: 1.20,      // higher — youngest crew member
      volume: 1.0,
      radioType: 'command',
      selectors: [
        /Microsoft.*Jenny.*Online/i,
        /Microsoft.*Aria.*Online/i,
        /Google US English/i,
      ]
    },
    anpc_chen: {
      label: 'Lt. Chen (US Female Tactical)',
      lang: 'en-US',
      preferFemale: true,
      rate: 0.94,
      pitch: 1.00,
      volume: 1.0,
      radioType: 'command',
      selectors: [/Microsoft.*Aria.*Online/i, /Google US English/i]
    },
    anpc_kozlov: {
      label: 'Sgt. Kozlov (US Male Gruff)',
      lang: 'en-US',
      preferFemale: false,
      rate: 0.86,
      pitch: 0.75,      // deep gruff sergeant
      volume: 1.0,
      radioType: 'command',
      selectors: [/Microsoft.*Eric.*Online/i, /Microsoft.*Christopher.*Online/i, /Google US English/i]
    },
    anpc_osei: {
      label: 'Ens. Osei (South African Male)',
      lang: 'en-ZA',
      preferFemale: false,
      rate: 0.90,
      pitch: 0.88,
      volume: 1.0,
      radioType: 'command',
      selectors: [/Google.*South Africa/i, /Microsoft.*Luke/i]
    },
    anpc_okafor: {
      label: 'CPO Okafor (AU Deck Chief)',
      lang: 'en-AU',
      preferFemale: false,
      rate: 0.88,
      pitch: 0.92,
      volume: 1.0,
      radioType: 'command',
      selectors: [/Google.*Australian/i, /Microsoft.*Australia/i]
    },
    anpc_ruiz: {
      label: 'PO2 Ruiz (AU Female Deck)',
      lang: 'en-AU',
      preferFemale: true,
      rate: 0.93,
      pitch: 1.05,
      volume: 1.0,
      radioType: 'command',
      selectors: [/Google.*Australian.*Female/i, /Microsoft.*Natasha.*Online/i, /Microsoft.*Annette.*Online/i]
    },
    anpc_cruz: {
      label: 'Lt. Cruz (Indian Female Ops)',
      lang: 'en-IN',
      preferFemale: true,
      rate: 0.92,
      pitch: 1.08,
      volume: 1.0,
      radioType: 'command',
      selectors: [/Google.*India/i, /Microsoft.*Neerja.*Online/i]
    },
    anpc_hollis: {
      label: 'Dr. Hollis (UK Female Science)',
      lang: 'en-GB',
      preferFemale: true,
      rate: 0.90,
      pitch: 1.06,
      volume: 1.0,
      radioType: 'command',
      selectors: [/Google UK English Female/i, /Microsoft.*Sonia.*Online/i]
    },
  };

  // ── Per-crew voice mapping: each character gets a unique voice module. Generic bot voice forbidden. ──
  const CREW_VOICE_MAP = {
    // CIC Crew — each officer has a distinct accent, pitch, and cadence
    'Cdr. Vasquez': 'anpc_vasquez',   // Commanding US female — mission authority
    'XO Tanaka': 'anpc_tanaka',    // UK female — precise, efficient
    'Lt. Chen': 'anpc_chen',      // US female — tactical
    'Sgt. Kozlov': 'anpc_kozlov',    // US male — gruff sergeant
    'Ens. Park': 'anpc_scope',     // US female bright — eager young ensign
    'Ens. Osei': 'anpc_osei',      // South African male
    'CPO Okafor': 'anpc_okafor',    // AU male — deck chief
    'PO2 Ruiz': 'anpc_ruiz',      // AU female — deck
    'Lt. Cruz': 'anpc_cruz',      // Indian female — ops
    'Dr. Hollis': 'anpc_hollis',    // UK female — science/sensor
    // ANPC Wingmen — fighter pilots in the cockpit
    'Hotshot': 'anpc_hotshot',    // Marcus Chen — brash, young, energetic
    'Frostbite': 'anpc_frostbite',  // Viktor Kozlov — cold, clipped, minimal
    // Command Operators
    'Lighthouse': 'anpc_lighthouse', // Dr. Amara Okafor — calm, authoritative anchor
    'Resolute Actual': 'anpc_vasquez',    // Cdr. Vasquez — commanding
    'Resolute XO': 'anpc_tanaka',     // XO Tanaka — precise
    'Scope': 'anpc_scope',      // Ens. Park — alert
    // Enemy — heavy radio processing, intercepted transmission
    'Nightshade': 'anpc_nightshade', // Enemy ace — ice-cold, surgical
    '[INTERCEPTED] Nightshade': 'anpc_nightshade', // Same with intercept effect
    // Support missions
    'Lifeline': 'anpc_ruiz',       // Tanker crew
    'Mercy': 'anpc_hollis',     // Medical frigate
  };

  // ── Engine thrust rumble system ──
  let thrustRumble = null;    // main forward/reverse burn nodes
  let _thrustLevel = 0;       // current smoothed thrust intensity 0..1
  let _strafeHissNodes = null; // lateral/vertical RCS hiss nodes

  // ── Sample-based audio (explosion shockwaves) ──
  const _sampleBuffers = {};   // name → AudioBuffer
  let shockwaveGain = null;    // dedicated gain node (muted by default)

  const SAMPLE_MANIFEST = [
    { name: 'shockwave_a', url: 'assets/sound/freesound_community-medium-explosion-40472.mp3' },
    { name: 'shockwave_b', url: 'assets/sound/soundreality-explosion-fx-343683.mp3' },
  ];

  function _loadSamples() {
    SAMPLE_MANIFEST.forEach(({ name, url }) => {
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => { _sampleBuffers[name] = decoded; })
        .catch(() => { });  // silent fail — procedural fallback still works
    });
  }

  function init() {
    if (initialized) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);

    // Shockwave channel — muted by default
    shockwaveGain = ctx.createGain();
    shockwaveGain.gain.value = 0;
    shockwaveGain.connect(masterGain);

    _loadSamples();
    _initVoiceCache();
    initialized = true;
  }

  // Resume AudioContext on user gesture (required by browsers)
  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function pauseAll() {
    if (!ctx) return;
    if (ctx.state === 'running') {
      _pausedByGame = true;
      ctx.suspend();
    }
  }

  function resumeAll() {
    if (!ctx) return;
    if (_pausedByGame && ctx.state === 'suspended') {
      _pausedByGame = false;
      ctx.resume();
    }
  }

  // ── Pre-cache all voice modules used by crew ──
  function _initVoiceCache() {
    if (!('speechSynthesis' in window)) return;
    // Resolve all modules up front
    _resolveAllVoices();
    // Chrome/Edge load voices async — listen for the event
    speechSynthesis.addEventListener('voiceschanged', _resolveAllVoices);
  }

  function _resolveAllVoices() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    Object.keys(VOICE_MODULES).forEach(id => _resolveVoice(id));
  }

  function _pickVoice(moduleId, voices) {
    const cfg = VOICE_MODULES[moduleId] || VOICE_MODULES.au_female;
    let best = null;
    let bestScore = -1e9;

    voices.forEach(v => {
      let score = 0;

      // Strong explicit selector matches first
      if (cfg.selectors.some(re => re.test(v.name))) score += 120;

      if (cfg.lang && v.lang === cfg.lang) score += 60;
      if (cfg.lang && v.lang && v.lang.startsWith(cfg.lang.split('-')[0])) score += 20;

      if (cfg.preferFemale) {
        if (/female|natasha|annette|libby|sonia|aria|olivia|samantha|karen/i.test(v.name)) score += 30;
      }

      // Prefer cloud/online neural voices when available
      if (!v.localService) score += 12;
      if (/online|neural|natural|enhanced/i.test(v.name)) score += 10;

      // Penalize generic sounding labels
      if (/generic|default|robot|espeak|festival/i.test(v.name)) score -= 100;

      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    });

    return best;
  }

  function _resolveVoice(moduleId = _activeVoiceModule) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const chosen = _pickVoice(moduleId, voices)
      || voices.find(v => v.lang && v.lang.startsWith('en'))
      || voices[0];

    _voiceCacheByModule[moduleId] = chosen || null;
    if (moduleId === _activeVoiceModule) _cachedVoice = _voiceCacheByModule[moduleId];

    if (chosen) console.log(`PA Voice selected [${moduleId}]:`, chosen.name, chosen.lang);
  }

  function setVoiceModule(moduleId) {
    if (!VOICE_MODULES[moduleId]) return false;
    _activeVoiceModule = moduleId;
    _resolveVoice(moduleId);
    _cachedVoice = _voiceCacheByModule[moduleId] || null;
    return true;
  }

  function getVoiceModule() {
    return _activeVoiceModule;
  }

  function listVoiceModules() {
    return Object.entries(VOICE_MODULES).map(([id, cfg]) => ({ id, label: cfg.label }));
  }

  // ── Utility: white noise buffer ──
  let _noiseBuffer = null;
  function _getNoiseBuffer() {
    if (_noiseBuffer) return _noiseBuffer;
    const len = ctx.sampleRate * 2;
    _noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return _noiseBuffer;
  }

  // ── Utility: connect chain of nodes ──
  function _chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[0];
  }

  // ══════════════════════════════════════
  // SOUND EFFECTS
  // ══════════════════════════════════════

  function playSound(name, params = {}) {
    if (!ctx) init();
    resume();
    const t = ctx.currentTime;
    switch (name) {
      case 'laser': return _playLaser(t);
      case 'torpedo': return _playTorpedo(t);
      case 'explosion': return _playExplosion(t);
      case 'warning': return _playWarning(t);
      case 'shield_hit': return _playShieldHit(t);
      case 'hull_hit': return _playHullHit(t);
      case 'lock_tone': return _playLockTone(t);
      case 'launch': return _playLaunch(t);
      case 'boost': return _playBoost(t);
      case 'comm_beep': return _playCommBeep(t);
      case 'klaxon': return _playKlaxon(t);
      case 'hud_power_up': return _playHudPowerUp(t);
      case 'clamp_release': return _playClampRelease(t);
      case 'turbine_whine': return _playTurbineWhine(t);
      case 'shockwave': return _playShockwave(t);
      case 'plasma_spit': return _playPlasmaSpit(t);
      case 'hull_alarm': return _playHullAlarm(t);
      case 'egg_hatch': return _playEggHatch(t);
    }
  }

  // GDD §10.1: Cinematic sci-fi laser — 3-layer SHEWWW with manifold modulation
  function _playLaser(t) {
    // ── Manifold modulation parameters ──
    // Query player position for z=xy curvature and Schwartz Diamond timing
    const SM = window.SpaceManifold;
    let curvMod = 1.0, latticeTick = 0;
    if (SM && SM.diamond) {
      const px = (Math.random() - 0.5) * 4000; // approximate spread
      const py = (Math.random() - 0.5) * 4000;
      const pz = px * py * 0.001; // z = xy projection
      const field = SM.diamond(px, py, pz);
      curvMod = 0.7 + Math.abs(field) * 0.6; // 0.7–1.3 range
      if (SM.diamondGrad) {
        const g = SM.diamondGrad(px, py, pz);
        latticeTick = Math.abs(g.x) + Math.abs(g.y); // |∂z/∂x| + |∂z/∂y|
      }
    }
    const rampSpeed = 0.012 * curvMod; // charge pitch ramp speed
    const dissDecay = 0.06 / Math.max(0.3, curvMod); // decay = 1/curvature

    // ── Stereo panner helper ──
    function pan(val) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, val));
      return p;
    }

    // ════════════════════════════════════════════
    // LAYER 1 — CHARGE (5–18 ms)     -12 dB
    // Sine + triangle 50/50, pitch 900→2600 Hz
    // ════════════════════════════════════════════
    const chargeDur = 0.005 + rampSpeed;
    const chargeVol = 0.06; // -12 dB relative to release

    // Sine half
    const chSineG = ctx.createGain();
    chSineG.gain.setValueAtTime(chargeVol, t);
    chSineG.gain.linearRampToValueAtTime(chargeVol * 0.2, t + 0.004);
    chSineG.gain.setValueAtTime(chargeVol * 0.2, t + chargeDur - 0.002);
    chSineG.gain.exponentialRampToValueAtTime(0.001, t + chargeDur + 0.01);

    const chSine = ctx.createOscillator();
    chSine.type = 'sine';
    chSine.frequency.setValueAtTime(900, t);
    chSine.frequency.exponentialRampToValueAtTime(2600, t + chargeDur);

    // Triangle half
    const chTriG = ctx.createGain();
    chTriG.gain.setValueAtTime(chargeVol, t);
    chTriG.gain.linearRampToValueAtTime(chargeVol * 0.2, t + 0.004);
    chTriG.gain.exponentialRampToValueAtTime(0.001, t + chargeDur + 0.01);

    const chTri = ctx.createOscillator();
    chTri.type = 'triangle';
    chTri.frequency.setValueAtTime(900, t);
    chTri.frequency.exponentialRampToValueAtTime(2600, t + chargeDur);

    // Band-pass 1.2 kHz Q=3
    const chBP = ctx.createBiquadFilter();
    chBP.type = 'bandpass';
    chBP.frequency.value = 1200;
    chBP.Q.value = 3;

    // Stereo: slight inward pan L→C→R over 10ms
    const chPan = ctx.createStereoPanner();
    chPan.pan.setValueAtTime(-0.4, t);
    chPan.pan.linearRampToValueAtTime(0.4, t + 0.01);

    chSine.connect(chBP);
    chTri.connect(chBP);
    chBP.connect(chSineG);
    chBP.connect(chTriG);
    chSineG.connect(chPan);
    chTriG.connect(chPan);
    chPan.connect(masterGain);

    chSine.start(t);
    chTri.start(t);
    chSine.stop(t + chargeDur + 0.015);
    chTri.stop(t + chargeDur + 0.015);

    // ════════════════════════════════════════════
    // LAYER 2 — RELEASE "SHEWWW" (120–240 ms)  0 dB
    // Triangle + bright noise 70/30
    // Pitch: fast 2.6kHz → 850Hz
    // Formant sweep: 3.2kHz → 1.1kHz
    // ════════════════════════════════════════════
    const relStart = t + chargeDur * 0.8; // slight overlap
    const relDur = 0.16 + curvMod * 0.06; // 120-240ms manifold-scaled
    const relVol = 0.18; // 0 dB (dominant)

    // 2ms onset click (filtered transient)
    const clickNoise = ctx.createBufferSource();
    clickNoise.buffer = _getNoiseBuffer();
    const clickBP = ctx.createBiquadFilter();
    clickBP.type = 'bandpass';
    clickBP.frequency.value = 2800;
    clickBP.Q.value = 8;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(relVol * 0.5, relStart);
    clickG.gain.exponentialRampToValueAtTime(0.001, relStart + 0.002);
    clickNoise.connect(clickBP);
    clickBP.connect(clickG);
    clickG.connect(masterGain);
    clickNoise.start(relStart);
    clickNoise.stop(relStart + 0.003);

    // Triangle oscillator (70% of release)
    const relTriG = ctx.createGain();
    relTriG.gain.setValueAtTime(relVol * 0.7, relStart);
    relTriG.gain.linearRampToValueAtTime(relVol * 0.6, relStart + 0.035);
    relTriG.gain.exponentialRampToValueAtTime(0.001, relStart + relDur);

    const relTri = ctx.createOscillator();
    relTri.type = 'triangle';
    relTri.frequency.setValueAtTime(2600, relStart);
    relTri.frequency.exponentialRampToValueAtTime(850, relStart + relDur * 0.7);

    // Bright noise (30% of release)
    const relNoiseG = ctx.createGain();
    relNoiseG.gain.setValueAtTime(relVol * 0.3, relStart);
    relNoiseG.gain.linearRampToValueAtTime(relVol * 0.2, relStart + 0.035);
    relNoiseG.gain.exponentialRampToValueAtTime(0.001, relStart + relDur * 0.9);

    const relNoise = ctx.createBufferSource();
    relNoise.buffer = _getNoiseBuffer();

    // Formant sweep: resonant band-pass 3.2kHz → 1.1kHz, Q=6
    const relBP = ctx.createBiquadFilter();
    relBP.type = 'bandpass';
    relBP.frequency.setValueAtTime(3200, relStart);
    relBP.frequency.exponentialRampToValueAtTime(1100, relStart + relDur * 0.8);
    relBP.Q.value = 6;

    // Secondary resonant band-pass 1.8kHz Q=6
    const relBP2 = ctx.createBiquadFilter();
    relBP2.type = 'bandpass';
    relBP2.frequency.value = 1800;
    relBP2.Q.value = 6;

    // Doppler-style stereo sweep L→R (or R→L based on manifold)
    const relPan = ctx.createStereoPanner();
    const panDir = latticeTick > 0.5 ? 1 : -1;
    relPan.pan.setValueAtTime(-0.5 * panDir, relStart);
    relPan.pan.linearRampToValueAtTime(0.5 * panDir, relStart + relDur);

    relTri.connect(relBP);
    relNoise.connect(relBP);
    relBP.connect(relBP2);
    relBP2.connect(relTriG);
    relBP2.connect(relNoiseG);
    relTriG.connect(relPan);
    relNoiseG.connect(relPan);
    relPan.connect(masterGain);

    relTri.start(relStart);
    relNoise.start(relStart);
    relTri.stop(relStart + relDur + 0.01);
    relNoise.stop(relStart + relDur + 0.01);

    // ════════════════════════════════════════════
    // LAYER 3 — DISSIPATION (50–110 ms)  -18 dB
    // High-passed noise + faint crackle
    // ════════════════════════════════════════════
    const dissStart = relStart + relDur * 0.6; // overlap tail
    const dissDur = 0.05 + dissDecay;
    const dissVol = 0.025; // -18 dB

    const dissNoise = ctx.createBufferSource();
    dissNoise.buffer = _getNoiseBuffer();

    const dissHP = ctx.createBiquadFilter();
    dissHP.type = 'highpass';
    dissHP.frequency.value = 3500;

    const dissG = ctx.createGain();
    dissG.gain.setValueAtTime(dissVol, dissStart);
    dissG.gain.linearRampToValueAtTime(dissVol * 0.8, dissStart + 0.02);
    dissG.gain.exponentialRampToValueAtTime(0.001, dissStart + dissDur);

    // Stereo: widen then fade to center
    const dissPan = ctx.createStereoPanner();
    dissPan.pan.setValueAtTime(0.6 * panDir, dissStart);
    dissPan.pan.linearRampToValueAtTime(0, dissStart + dissDur * 0.8);

    dissNoise.connect(dissHP);
    dissHP.connect(dissG);
    dissG.connect(dissPan);
    dissPan.connect(masterGain);
    dissNoise.start(dissStart);
    dissNoise.stop(dissStart + dissDur + 0.01);

    // Faint crackle — rapid micro-clicks at Diamond lattice intersections
    const crackleCount = 2 + Math.floor(latticeTick * 3);
    for (let c = 0; c < crackleCount; c++) {
      const cTime = dissStart + (c / crackleCount) * dissDur * 0.7;
      const crk = ctx.createOscillator();
      crk.type = 'square';
      crk.frequency.value = 6000 + Math.random() * 4000;
      const crkG = ctx.createGain();
      crkG.gain.setValueAtTime(dissVol * 0.3, cTime);
      crkG.gain.exponentialRampToValueAtTime(0.001, cTime + 0.003);
      crk.connect(crkG);
      crkG.connect(masterGain);
      crk.start(cTime);
      crk.stop(cTime + 0.004);
    }
  }

  // GDD §10.1: Lock tone (escalating beeps), launch whoosh
  function _playTorpedo(t) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    g.connect(masterGain);

    // Launch whoosh — filtered noise sweep
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.8);
    filter.Q.value = 3;
    noise.connect(filter);
    filter.connect(g);
    noise.start(t);
    noise.stop(t + 0.8);

    // Sub-bass thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.3, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.5);
  }

  // GDD §8.3: White flash → orange fireball, 1.5s decay
  function _playExplosion(t) {
    // Initial blast — broadband noise
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 1.5);

    // Sub-bass resonance
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(20, t + 1.2);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.4, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 1.2);

    // Metallic crunch
    const crunch = ctx.createOscillator();
    crunch.type = 'square';
    crunch.frequency.setValueAtTime(200, t);
    crunch.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const crunchG = ctx.createGain();
    crunchG.gain.setValueAtTime(0.15, t);
    crunchG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    crunch.connect(crunchG);
    crunchG.connect(masterGain);
    crunch.start(t);
    crunch.stop(t + 0.3);
  }

  // Nearby shockwave — sample-based, muted by default
  // Randomly picks one of two explosion recordings.
  // Control volume with setShockwaveVolume(0..1).
  function _playShockwave(t) {
    const keys = Object.keys(_sampleBuffers);
    if (keys.length === 0) return;           // samples not yet loaded
    const buf = _sampleBuffers[keys[Math.floor(Math.random() * keys.length)]];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(shockwaveGain);
    src.start(t);
  }

  // Predator Drone plasma spit — organic visceral spew, wet + crackling
  function _playPlasmaSpit(t) {
    // Low gurgling growl (organic source)
    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(60, t);
    growl.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const growlG = ctx.createGain();
    growlG.gain.setValueAtTime(0.15, t);
    growlG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const growlLP = ctx.createBiquadFilter();
    growlLP.type = 'lowpass';
    growlLP.frequency.value = 200;
    growl.connect(growlLP);
    growlLP.connect(growlG);
    growlG.connect(masterGain);
    growl.start(t);
    growl.stop(t + 0.5);

    // Wet splatter burst (noise through resonant bandpass)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    bp.Q.value = 4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.35);

    // Crackling electric discharge (the plasma energy)
    const crackle = ctx.createOscillator();
    crackle.type = 'square';
    crackle.frequency.setValueAtTime(800, t);
    crackle.frequency.setValueAtTime(200, t + 0.05);
    crackle.frequency.setValueAtTime(1200, t + 0.1);
    crackle.frequency.setValueAtTime(300, t + 0.15);
    crackle.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    const crG = ctx.createGain();
    crG.gain.setValueAtTime(0.08, t);
    crG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    crackle.connect(crG);
    crG.connect(masterGain);
    crackle.start(t);
    crackle.stop(t + 0.3);

    // Sub-bass thump (the spew impact leaving the creature)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(50, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.2);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.2, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.25);
  }

  // Hull breach alarm — urgent repeating klaxon-style alert, organic threat
  function _playHullAlarm(t) {
    // Sharp alternating tones — more urgent than standard warning
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, t);
    osc1.frequency.setValueAtTime(440, t + 0.1);
    osc1.frequency.setValueAtTime(880, t + 0.2);
    osc1.frequency.setValueAtTime(440, t + 0.3);
    osc1.frequency.setValueAtTime(880, t + 0.4);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.08, t);
    g1.gain.setValueAtTime(0.08, t + 0.45);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 3;
    osc1.connect(filter);
    filter.connect(g1);
    g1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.5);

    // Sub-bass throb for urgency
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.15, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.5);
  }

  // Egg hatch — wet organic cracking/splitting sound
  function _playEggHatch(t) {
    // Crackle noise burst (shell breaking)
    const bufLen = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * (Math.random() > 0.7 ? 1 : 0.2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = 2000;
    const nG = ctx.createGain();
    nG.gain.setValueAtTime(0.1, t);
    nG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(nFilter);
    nFilter.connect(nG);
    nG.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.3);

    // Wet squelch (organic membrane)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
    const oscG = ctx.createGain();
    oscG.gain.setValueAtTime(0.08, t);
    oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(oscG);
    oscG.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function _playWarning(t) {
    // Rising danger tone
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(660, t + 0.15);
    osc.frequency.setValueAtTime(440, t + 0.3);
    osc.frequency.setValueAtTime(660, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.setValueAtTime(0.12, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  // GDD §8.3: Blue shield ripple impact
  function _playShieldHit(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function _playHullHit(t) {
    // Metallic crunch
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.15);
  }

  // GDD §10.1: Lock tone — escalating beeps
  function _playLockTone(t) {
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 800 + i * 200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t + i * 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.1);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t + i * 0.2);
      osc.stop(t + i * 0.2 + 0.12);
    }
  }

  // GDD §3.3: Explosive acceleration sound, cockpit rattle, turbine at full scream
  function _playLaunch(t) {
    // Turbine ramp-up
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(2000, t + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.linearRampToValueAtTime(0.3, t + 2.0);
    g.gain.exponentialRampToValueAtTime(0.05, t + 3.5);
    osc.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 3.5);

    // Rattle — filtered noise bursts
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const rattleFilter = ctx.createBiquadFilter();
    rattleFilter.type = 'bandpass';
    rattleFilter.frequency.value = 300;
    rattleFilter.Q.value = 8;
    const rattleG = ctx.createGain();
    rattleG.gain.setValueAtTime(0.02, t);
    rattleG.gain.linearRampToValueAtTime(0.15, t + 1.5);
    rattleG.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
    noise.connect(rattleFilter);
    rattleFilter.connect(rattleG);
    rattleG.connect(masterGain);
    noise.start(t);
    noise.stop(t + 3.0);
  }

  // GDD §4.1: Sonic boom crack during boost
  function _playBoost(t) {
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.15);

    // Sub thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 40;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.3, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.3);
  }

  function _playCommBeep(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // GDD §3.1: Distant klaxons in launch bay
  function _playKlaxon(t) {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 520;
      const g = ctx.createGain();
      const start = t + i * 0.8;
      g.gain.setValueAtTime(0.08, start);
      g.gain.setValueAtTime(0.08, start + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  }

  // GDD §3.2: HUD powers up in sequence with flicker
  function _playHudPowerUp(t) {
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 600 + i * 100;
      const g = ctx.createGain();
      const start = t + i * 0.3;
      g.gain.setValueAtTime(0.04, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  // GDD §3.2: Electromagnetic clamp release
  function _playClampRelease(t) {
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 10;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    noise.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    noise.start(t);
    noise.stop(t + 0.25);

    // Metallic clank
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.12, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // GDD §3.2: Rising turbine whine during pre-launch
  function _playTurbineWhine(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 4.0);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(3000, t + 4.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.linearRampToValueAtTime(0.15, t + 3.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    osc.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 4.5);
  }

  // ══════════════════════════════════════
  // AMBIENT DRONES (persistent loops)
  // ══════════════════════════════════════

  // GDD §3.1: Starbase landing bay ambience — full din of a busy military station
  function startBayAmbience() {
    if (!ctx) init();
    resume();
    if (bayAmbience) return;

    const g = ctx.createGain();
    g.gain.value = 0.06;
    g.connect(masterGain);

    // Low-frequency bay hum (two detuned oscillators — reactor/power grid)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    osc1.connect(g);
    osc1.start();

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 57.5; // slight detune for beating
    osc2.connect(g);
    osc2.start();

    // Filtered noise floor (activity din — distant crews, loaders, comms chatter)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0.03;
    noise.connect(filter);
    filter.connect(noiseG);
    noiseG.connect(masterGain);
    noise.start();

    // ── Heavy machinery rumble (distant hydraulics / cargo lifts) ──
    const machineOsc = ctx.createOscillator();
    machineOsc.type = 'sawtooth';
    machineOsc.frequency.value = 32;  // deep industrial rumble
    const machineLPF = ctx.createBiquadFilter();
    machineLPF.type = 'lowpass';
    machineLPF.frequency.value = 80;
    machineLPF.Q.value = 3;
    const machineG = ctx.createGain();
    machineG.gain.value = 0.025;
    machineOsc.connect(machineLPF);
    machineLPF.connect(machineG);
    machineG.connect(masterGain);
    machineOsc.start();

    // ── Ventilation / air handling system hiss ──
    const ventNoise = ctx.createBufferSource();
    ventNoise.buffer = _getNoiseBuffer();
    ventNoise.loop = true;
    const ventBPF = ctx.createBiquadFilter();
    ventBPF.type = 'bandpass';
    ventBPF.frequency.value = 1200;
    ventBPF.Q.value = 0.5;
    const ventG = ctx.createGain();
    ventG.gain.value = 0.015;
    ventNoise.connect(ventBPF);
    ventBPF.connect(ventG);
    ventG.connect(masterGain);
    ventNoise.start();

    // ── Metallic resonance — large hangar reverberant tone ──
    const metalOsc1 = ctx.createOscillator();
    metalOsc1.type = 'triangle';
    metalOsc1.frequency.value = 110; // hangar structural resonance
    const metalOsc2 = ctx.createOscillator();
    metalOsc2.type = 'triangle';
    metalOsc2.frequency.value = 165; // harmonic
    const metalG = ctx.createGain();
    metalG.gain.value = 0.008;
    metalOsc1.connect(metalG);
    metalOsc2.connect(metalG);
    metalG.connect(masterGain);
    metalOsc1.start();
    metalOsc2.start();

    // ── Periodic clanks and hydraulic hisses (scheduled bursts) ──
    let bayEventInterval = null;
    function scheduleBayEvents() {
      bayEventInterval = setInterval(() => {
        if (!bayAmbience) { clearInterval(bayEventInterval); return; }
        const now = ctx.currentTime;
        const roll = Math.random();

        if (roll < 0.3) {
          // Metallic clank — tool drop or clamp engage
          const clank = ctx.createOscillator();
          clank.type = 'triangle';
          clank.frequency.setValueAtTime(800 + Math.random() * 600, now);
          clank.frequency.exponentialRampToValueAtTime(100, now + 0.08);
          const clankG = ctx.createGain();
          clankG.gain.setValueAtTime(0.04, now);
          clankG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          clank.connect(clankG);
          clankG.connect(masterGain);
          clank.start(now);
          clank.stop(now + 0.15);
        } else if (roll < 0.55) {
          // Hydraulic hiss — cargo arm or clamp release
          const hiss = ctx.createBufferSource();
          hiss.buffer = _getNoiseBuffer();
          const hissFilter = ctx.createBiquadFilter();
          hissFilter.type = 'bandpass';
          hissFilter.frequency.value = 2500 + Math.random() * 1500;
          hissFilter.Q.value = 1.5;
          const hissG = ctx.createGain();
          const dur = 0.3 + Math.random() * 0.4;
          hissG.gain.setValueAtTime(0.025, now);
          hissG.gain.exponentialRampToValueAtTime(0.001, now + dur);
          hiss.connect(hissFilter);
          hissFilter.connect(hissG);
          hissG.connect(masterGain);
          hiss.start(now);
          hiss.stop(now + dur + 0.05);
        } else if (roll < 0.7) {
          // Distant PA chime — two-tone station alert
          const chime1 = ctx.createOscillator();
          chime1.type = 'sine';
          chime1.frequency.value = 880;
          const chime2 = ctx.createOscillator();
          chime2.type = 'sine';
          chime2.frequency.value = 1100;
          const chimeG = ctx.createGain();
          chimeG.gain.setValueAtTime(0.02, now);
          chimeG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          chime1.connect(chimeG);
          chimeG.connect(masterGain);
          chime1.start(now);
          chime1.stop(now + 0.2);
          const chimeG2 = ctx.createGain();
          chimeG2.gain.setValueAtTime(0.02, now + 0.2);
          chimeG2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          chime2.connect(chimeG2);
          chimeG2.connect(masterGain);
          chime2.start(now + 0.2);
          chime2.stop(now + 0.5);
        }
      }, 2000 + Math.random() * 3000); // every 2-5 seconds
    }
    scheduleBayEvents();

    bayAmbience = { osc1, osc2, noise, g, noiseG, machineOsc, machineG, ventNoise, ventG, metalOsc1, metalOsc2, metalG, bayEventInterval };
  }

  function stopBayAmbience() {
    if (!bayAmbience) return;
    const t = ctx.currentTime;
    bayAmbience.g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    bayAmbience.noiseG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.machineG) bayAmbience.machineG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.ventG) bayAmbience.ventG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.metalG) bayAmbience.metalG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    if (bayAmbience.bayEventInterval) clearInterval(bayAmbience.bayEventInterval);
    const ba = bayAmbience;
    bayAmbience = null;
    setTimeout(() => {
      try {
        ba.osc1.stop(); ba.osc2.stop(); ba.noise.stop();
        if (ba.machineOsc) ba.machineOsc.stop();
        if (ba.ventNoise) ba.ventNoise.stop();
        if (ba.metalOsc1) ba.metalOsc1.stop();
        if (ba.metalOsc2) ba.metalOsc2.stop();
      } catch (e) { }
    }, 600);
  }

  // GDD §3.4: Sudden near-silence — vacuum. Only cockpit systems hum.
  function startCockpitHum() {
    if (!ctx) init();
    resume();
    if (cockpitHum) return;

    const g = ctx.createGain();
    g.gain.value = 0.03;
    g.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 120;
    osc.connect(g);
    osc.start();

    // Very faint ventilation noise
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0.015;
    noise.connect(filter);
    filter.connect(noiseG);
    noiseG.connect(masterGain);
    noise.start();

    cockpitHum = { osc, noise, g, noiseG };
  }

  function stopCockpitHum() {
    if (!cockpitHum) return;
    const t = ctx.currentTime;
    cockpitHum.g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    cockpitHum.noiseG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const ch = cockpitHum;
    cockpitHum = null;
    setTimeout(() => {
      try { ch.osc.stop(); ch.noise.stop(); } catch (e) { }
    }, 400);
  }

  // ══════════════════════════════════════
  // PA ANNOUNCER — Airport-style intercom voice
  // Routes speech through Web Audio PA processing chain:
  // bandpass filter → compressor → convolver reverb → slight overdrive
  // ══════════════════════════════════════

  let paDestination = null; // MediaStreamAudioDestination for capturing speech
  let paChain = null;       // PA processing nodes

  function initPAChain() {
    if (paChain || !ctx) return;

    // Bandpass filter — tinny intercom character (300–3400 Hz telephone band)
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1800;
    bandpass.Q.value = 0.7;

    // High-shelf cut — remove harsh sibilance
    const hiCut = ctx.createBiquadFilter();
    hiCut.type = 'highshelf';
    hiCut.frequency.value = 4000;
    hiCut.gain.value = -8;

    // Compressor — squash dynamics like a real PA system
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    // Slight warmth — low shelf boost for body
    const loBoost = ctx.createBiquadFilter();
    loBoost.type = 'lowshelf';
    loBoost.frequency.value = 400;
    loBoost.gain.value = 3;

    // Gain staging — PA volume
    const paGain = ctx.createGain();
    paGain.gain.value = 1.2;

    // Create reverb impulse — short slapback echo (airport terminal)
    const reverbLen = ctx.sampleRate * 0.6; // 600ms tail
    const reverbBuf = ctx.createBuffer(2, reverbLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = reverbBuf.getChannelData(ch);
      for (let i = 0; i < reverbLen; i++) {
        // Early reflections + exponential decay
        const t = i / ctx.sampleRate;
        let val = (Math.random() * 2 - 1) * Math.exp(-t * 6);
        // Add distinct early reflections at 30ms, 80ms, 150ms
        if (i === Math.floor(0.03 * ctx.sampleRate)) val += 0.3 * (Math.random() > 0.5 ? 1 : -1);
        if (i === Math.floor(0.08 * ctx.sampleRate)) val += 0.2 * (Math.random() > 0.5 ? 1 : -1);
        if (i === Math.floor(0.15 * ctx.sampleRate)) val += 0.1 * (Math.random() > 0.5 ? 1 : -1);
        data[i] = val;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbBuf;

    // Wet/dry mix for reverb
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.75;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.35;

    // Waveshaper for subtle intercom distortion
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x)); // soft clip
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    // Chain: input → bandpass → hiCut → compressor → shaper → loBoost → split(dry/wet) → merge → paGain → master
    const merger = ctx.createGain();

    paChain = { bandpass, hiCut, compressor, shaper, loBoost, convolver, dryGain, wetGain, merger, paGain };

    // Wire it up
    bandpass.connect(hiCut);
    hiCut.connect(compressor);
    compressor.connect(shaper);
    shaper.connect(loBoost);
    // Dry path
    loBoost.connect(dryGain);
    dryGain.connect(merger);
    // Wet path (reverb)
    loBoost.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(merger);
    // Output
    merger.connect(paGain);
    paGain.connect(masterGain);
  }

  function speak(text, opts = {}) {
    if (!('speechSynthesis' in window)) return;
    if (!ctx) init();
    initPAChain();

    const moduleId = opts.voiceModule && VOICE_MODULES[opts.voiceModule] ? opts.voiceModule : _activeVoiceModule;
    const voiceCfg = VOICE_MODULES[moduleId] || VOICE_MODULES.au_female;

    if (!_voiceCacheByModule[moduleId]) _resolveVoice(moduleId);
    const moduleVoice = _voiceCacheByModule[moduleId] || _cachedVoice;

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = (opts.rate !== undefined ? opts.rate : voiceCfg.rate);
    utter.pitch = (opts.pitch !== undefined ? opts.pitch : voiceCfg.pitch);
    utter.volume = (opts.volume !== undefined ? opts.volume : voiceCfg.volume);

    // Module-selected voice
    if (moduleVoice) {
      utter.voice = moduleVoice;
      _cachedVoice = moduleVoice;
    } else {
      // Voices may not have loaded yet — resolve and retry
      _resolveVoice(moduleId);
      const voices = speechSynthesis.getVoices();
      const preferred = _pickVoice(moduleId, voices)
        || voices.find(v => v.lang && v.lang.startsWith('en'))
        || voices[0];
      if (preferred) {
        utter.voice = preferred;
        _voiceCacheByModule[moduleId] = preferred;
        _cachedVoice = preferred;
      }
    }

    // Route speech through PA processing chain via MediaStreamDestination
    if (paChain && ctx.createMediaStreamSource) {
      try {
        // Create a destination that the SpeechSynthesis audio will play to
        const dest = ctx.createMediaStreamDestination();
        const source = ctx.createMediaStreamSource(dest.stream);
        source.connect(paChain.bandpass);

        // Use a hidden audio element to capture the speech output
        // Fallback: just play through normal synthesis (still sounds better with voice selection)
        utter.onend = opts.onEnd || null;
        speechSynthesis.speak(utter);
      } catch (e) {
        // Fallback to direct speech
        utter.onend = opts.onEnd || null;
        speechSynthesis.speak(utter);
      }
    } else {
      utter.onend = opts.onEnd || null;
      speechSynthesis.speak(utter);
    }

    // Add a subtle static burst before and after the PA message
    if (ctx && masterGain) {
      // Pre-transmission click/static
      const preStatic = ctx.createBufferSource();
      const preLen = Math.floor(ctx.sampleRate * 0.08);
      const preBuf = ctx.createBuffer(1, preLen, ctx.sampleRate);
      const preData = preBuf.getChannelData(0);
      for (let i = 0; i < preLen; i++) {
        preData[i] = (Math.random() * 2 - 1) * 0.15 * Math.exp(-i / (preLen * 0.3));
      }
      preStatic.buffer = preBuf;
      // Run static through the PA bandpass for authentic intercom crackle
      const staticFilter = ctx.createBiquadFilter();
      staticFilter.type = 'bandpass';
      staticFilter.frequency.value = 2000;
      staticFilter.Q.value = 1.5;
      const staticGain = ctx.createGain();
      staticGain.gain.value = 0.6;
      preStatic.connect(staticFilter);
      staticFilter.connect(staticGain);
      staticGain.connect(masterGain);
      preStatic.start(ctx.currentTime);

      // Post-transmission click (delayed estimate based on text length)
      const estimatedDuration = text.length * 0.065; // ~65ms per character at 0.92 rate
      const postStatic = ctx.createBufferSource();
      const postLen = Math.floor(ctx.sampleRate * 0.12);
      const postBuf = ctx.createBuffer(1, postLen, ctx.sampleRate);
      const postData = postBuf.getChannelData(0);
      for (let i = 0; i < postLen; i++) {
        const env = i < postLen * 0.2 ? (i / (postLen * 0.2)) : Math.exp(-(i - postLen * 0.2) / (postLen * 0.25));
        postData[i] = (Math.random() * 2 - 1) * 0.12 * env;
      }
      postStatic.buffer = postBuf;
      const postFilter = ctx.createBiquadFilter();
      postFilter.type = 'bandpass';
      postFilter.frequency.value = 2000;
      postFilter.Q.value = 1.5;
      const postGain = ctx.createGain();
      postGain.gain.value = 0.5;
      postStatic.connect(postFilter);
      postFilter.connect(postGain);
      postGain.connect(masterGain);
      postStatic.start(ctx.currentTime + estimatedDuration);
    }
  }

  // ── speakAs: speak with a specific crew member's voice ──
  function speakAs(crewName, text, opts = {}) {
    const voiceModule = CREW_VOICE_MAP[crewName] || _activeVoiceModule;
    speak(text, { ...opts, voiceModule });
  }

  // ══════════════════════════════════════════════════════════════════
  // ANPC VOICE DISPATCH — Character-specific tactical radio voices
  // Per ButterflyFX ANPC Guideline §7.2: Generic bot voice forbidden.
  // Each character gets distinct pitch, rate, voice selection, and radio profile.
  // Speech queue per §11.2: max 3 queued, oldest dropped on overflow (except Mayday).
  // ══════════════════════════════════════════════════════════════════

  const _anpcQueue = [];          // speech queue items: { callsign, text, priority }
  let _anpcSpeaking = false;      // true while an utterance is in progress
  const ANPC_QUEUE_MAX = 3;       // §11.2 max queued transmissions
  let _anpcLastSender = '';       // avoid same-sender back-to-back spam

  // ── Radio effect: pre-transmission click + optional alien intercept tone ──
  function _playRadioClick(radioType, phase) {
    if (!ctx || !masterGain) return;

    const isEnemy = radioType === 'enemy';
    const isCockpit = radioType === 'cockpit';
    const now = ctx.currentTime;

    if (isEnemy && phase === 'pre') {
      // Alien intercept tone — rising sawtooth sweep, filtered static burst
      const sweep = ctx.createOscillator();
      sweep.type = 'sawtooth';
      sweep.frequency.setValueAtTime(140, now);
      sweep.frequency.linearRampToValueAtTime(680, now + 0.10);
      const sweepGain = ctx.createGain();
      sweepGain.gain.setValueAtTime(0.18, now);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      const sweepBPF = ctx.createBiquadFilter();
      sweepBPF.type = 'bandpass';
      sweepBPF.frequency.value = 380;
      sweepBPF.Q.value = 4.0;
      sweep.connect(sweepBPF);
      sweepBPF.connect(sweepGain);
      sweepGain.connect(masterGain);
      sweep.start(now);
      sweep.stop(now + 0.14);

      // Simultaneous noise burst
      const noiseLen = Math.floor(ctx.sampleRate * 0.09);
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.4));
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const noiseHP = ctx.createBiquadFilter();
      noiseHP.type = 'highpass';
      noiseHP.frequency.value = 2000;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.35;
      noiseSrc.connect(noiseHP);
      noiseHP.connect(noiseGain);
      noiseGain.connect(masterGain);
      noiseSrc.start(now);
      return;
    }

    // Standard tactical radio click (cockpit = louder + wider static)
    const clickDuration = isCockpit ? 0.065 : 0.045;
    const clickVol = isCockpit ? 0.30 : 0.18;
    const bpFreq = isCockpit ? 1400 : 2800;
    const clickLen = Math.floor(ctx.sampleRate * clickDuration);
    const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) {
      const env = phase === 'pre'
        ? Math.exp(-i / (clickLen * 0.45))
        : (i < clickLen * 0.25 ? (i / (clickLen * 0.25)) : Math.exp(-(i - clickLen * 0.25) / (clickLen * 0.45)));
      cd[i] = (Math.random() * 2 - 1) * clickVol * env;
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    const clickBPF = ctx.createBiquadFilter();
    clickBPF.type = 'bandpass';
    clickBPF.frequency.value = bpFreq;
    clickBPF.Q.value = isCockpit ? 0.9 : 0.7;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.8;
    clickSrc.connect(clickBPF);
    clickBPF.connect(clickGain);
    clickGain.connect(masterGain);
    clickSrc.start(now);
  }

  // ── Process next item from ANPC speech queue ──
  function _drainAnpcQueue() {
    if (_anpcSpeaking || _anpcQueue.length === 0) return;
    const item = _anpcQueue.shift();
    _anpcSpeaking = true;
    _anpcLastSender = item.callsign;

    const moduleId = CREW_VOICE_MAP[item.callsign] || 'anpc_lighthouse';
    const voiceCfg = VOICE_MODULES[moduleId];
    const radioType = (voiceCfg && voiceCfg.radioType) ? voiceCfg.radioType : 'command';

    // Pre-click (enemy gets alien intercept tone)
    _playRadioClick(radioType, 'pre');

    // Brief silence before speech (enemy slightly longer — "intercepted" feel)
    const preDelay = radioType === 'enemy' ? 160 : 90;
    setTimeout(() => {
      // Estimate speech duration for post-click timing
      const rateAdj = (voiceCfg && voiceCfg.rate) ? voiceCfg.rate : 1.0;
      const estDuration = Math.max(800, (item.text.length * 62) / rateAdj);

      speak(item.text, {
        voiceModule: moduleId,
        onEnd: () => {
          // Post-transmission click after a brief pause
          setTimeout(() => {
            _playRadioClick(radioType, 'post');
            _anpcSpeaking = false;
            setTimeout(_drainAnpcQueue, 80); // chain to next queued item
          }, 60);
        },
      });

      // Fallback: if speak() onEnd never fires (unfocused tab, etc.), force drain after estimate
      setTimeout(() => {
        if (_anpcSpeaking && _anpcLastSender === item.callsign) {
          _playRadioClick(radioType, 'post');
          _anpcSpeaking = false;
          setTimeout(_drainAnpcQueue, 80);
        }
      }, estDuration + 1500);

    }, preDelay);
  }

  // ── speakAnpc: main entry point — voice every comm with the right character voice ──
  // Call from addComm() with the sender name string and message text.
  function speakAnpc(callsign, text) {
    if (!('speechSynthesis' in window)) return;
    if (!ctx) init();
    if (!text || !callsign) return;

    // Strip HUD markup, brackets, channel prefixes that shouldn't be spoken
    const cleanText = text
      .replace(/\[.*?\]/g, '')      // remove [CHANNEL] prefixes
      .replace(/\{.*?\}/g, '')      // remove unfilled template slots
      .replace(/[*_~`]/g, '')       // remove markdown
      .trim();
    if (!cleanText) return;

    // Classify priority: Mayday/eject calls bypass queue overflow
    const isMayday = /mayday|eject|punching out|going down/i.test(cleanText);

    // Queue management: max ANPC_QUEUE_MAX. Drop oldest non-emergency on overflow.
    if (_anpcQueue.length >= ANPC_QUEUE_MAX) {
      if (!isMayday) return;  // discard overflow non-emergency per §11.2
      _anpcQueue.shift();     // emergency: drops oldest to make room
    }

    _anpcQueue.push({ callsign, text: cleanText, priority: isMayday ? 1 : 0 });
    _drainAnpcQueue();
  }

  // Volume control
  function setMasterVolume(v) {
    if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  function setShockwaveVolume(v) {
    if (shockwaveGain) shockwaveGain.gain.value = Math.max(0, Math.min(1, v));
  }

  // ══════════════════════════════════════
  // ENGINE THRUST RUMBLE — continuous, volume/pitch tied to throttle
  // Low-frequency rumble representing reactor→thruster transmission through hull.
  // No sound in vacuum, but the hull vibrates and the pilot feels/hears it.
  // ══════════════════════════════════════

  function startThrustRumble() {
    if (!ctx) init();
    resume();
    if (thrustRumble) return;

    // Main rumble oscillator — low sawtooth for gritty engine growl
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleGain.connect(masterGain);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 42;   // deep bass rumble
    const osc1Gain = ctx.createGain();
    osc1Gain.gain.value = 0.12;

    // Low-pass filter to keep it subsonic/rumbly
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 120;
    lpf.Q.value = 2;

    osc1.connect(osc1Gain);
    osc1Gain.connect(lpf);
    lpf.connect(rumbleGain);
    osc1.start();

    // Second detuned oscillator for beating/texture
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 44.5;   // slight detune for beating effect
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.08;
    osc2.connect(osc2Gain);
    osc2Gain.connect(lpf);
    osc2.start();

    // Noise layer — filtered rumble texture (turbine rattle)
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;
    const noiseLPF = ctx.createBiquadFilter();
    noiseLPF.type = 'lowpass';
    noiseLPF.frequency.value = 200;
    noiseLPF.Q.value = 1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.06;
    noise.connect(noiseLPF);
    noiseLPF.connect(noiseGain);
    noiseGain.connect(rumbleGain);
    noise.start();

    thrustRumble = { osc1, osc2, noise, rumbleGain, lpf, noiseLPF };
  }

  function stopThrustRumble() {
    if (!thrustRumble) return;
    const t = ctx.currentTime;
    thrustRumble.rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const tr = thrustRumble;
    thrustRumble = null;
    setTimeout(() => {
      try { tr.osc1.stop(); tr.osc2.stop(); tr.noise.stop(); } catch (e) { }
    }, 400);
  }

  // Call every frame with current throttle (0..1) and afterburner/boost state
  function setThrustLevel(throttle, afterburner, boost) {
    if (!thrustRumble) return;

    // Effective intensity: higher throttle = louder + higher pitch
    let intensity = throttle;
    if (boost) intensity = Math.max(intensity, 0.95);
    else if (afterburner) intensity = Math.max(intensity, 0.7);

    // Smooth towards target (prevents pops)
    _thrustLevel += (intensity - _thrustLevel) * 0.08;

    const t = ctx.currentTime;
    // Volume: silent at 0, rumbling at full throttle
    const vol = _thrustLevel * 0.35;
    thrustRumble.rumbleGain.gain.setTargetAtTime(vol, t, 0.05);

    // Pitch rises with thrust (42Hz idle → 80Hz full burn)
    const freq = 42 + _thrustLevel * 38;
    thrustRumble.osc1.frequency.setTargetAtTime(freq, t, 0.1);
    thrustRumble.osc2.frequency.setTargetAtTime(freq * 1.06, t, 0.1);

    // Filter opens with thrust (more high-freq rattle at full power)
    thrustRumble.lpf.frequency.setTargetAtTime(120 + _thrustLevel * 280, t, 0.1);
    thrustRumble.noiseLPF.frequency.setTargetAtTime(200 + _thrustLevel * 400, t, 0.1);
  }

  // ══════════════════════════════════════
  // RCS STRAFE HISS — short burst when lateral/vertical thrusters fire
  // Small attitude jets — compressed gas hiss through hull
  // ══════════════════════════════════════

  function startStrafeHiss() {
    if (!ctx) init();
    resume();
    if (_strafeHissNodes) return;

    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hissGain.connect(masterGain);

    // White noise through bandpass = gas release hiss
    const noise = ctx.createBufferSource();
    noise.buffer = _getNoiseBuffer();
    noise.loop = true;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 3000;
    bpf.Q.value = 0.8;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 1500;

    noise.connect(bpf);
    bpf.connect(hpf);
    hpf.connect(hissGain);
    noise.start();

    _strafeHissNodes = { noise, hissGain, bpf };
  }

  function stopStrafeHiss() {
    if (!_strafeHissNodes) return;
    const t = ctx.currentTime;
    _strafeHissNodes.hissGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    const sn = _strafeHissNodes;
    _strafeHissNodes = null;
    setTimeout(() => { try { sn.noise.stop(); } catch (e) { } }, 200);
  }

  // Call every frame with strafe input magnitudes
  function setStrafeLevel(strafeH, strafeV) {
    if (!_strafeHissNodes) return;
    const intensity = Math.min(1, Math.abs(strafeH) + Math.abs(strafeV));
    const vol = intensity * 0.15;  // subtle hiss
    const t = ctx.currentTime;
    _strafeHissNodes.hissGain.gain.setTargetAtTime(vol, t, 0.02); // fast attack
  }

  return {
    init,
    resume,
    pauseAll,
    resumeAll,
    playSound,
    speak,
    speakAs,
    speakAnpc,
    startBayAmbience,
    stopBayAmbience,
    startCockpitHum,
    stopCockpitHum,
    setMasterVolume,
    setShockwaveVolume,
    startThrustRumble,
    stopThrustRumble,
    setThrustLevel,
    startStrafeHiss,
    stopStrafeHiss,
    setStrafeLevel,
    setVoiceModule,
    getVoiceModule,
    listVoiceModules,
    getCtx: () => ctx,
    getMasterGain: () => masterGain
  };
})();

window.SFAudio = SFAudio;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STARFIGHTER — MULTIPLAYER ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thin adapter over the unified KGMultiplayer client library.
 * Preserves the SFMultiplayer API that core.js already uses.
 * Connects to the unified lobby-server.js (port 8765, wss://kensgames.com/ws).
 */

const SFMultiplayer = (function () {
  'use strict';

  // The shared client instance
  let _mp = null;
  let _onEvent = null;

  function connect(playerCallsign, onEvent) {
    if (_mp) return;
    _onEvent = onEvent || null;
    _mp = new KGMultiplayer('starfighter');

    // Wire KGMultiplayer events → SFMultiplayer callback API
    _mp.on('authenticated', () => _emit('connected'));
    _mp.on('session_update', (s) => _emit('room_update', s));
    _mp.on('share_code', (c) => _emit('share_code', c));
    _mp.on('session_list', (list) => _emit('room_list', list));
    _mp.on('game_started', (d) => _emit('game_start', d));
    _mp.on('player_state', (d) => _emit('player_state', d));
    _mp.on('game_action', (d) => {
      if (d.action === 'fire') _emit('remote_fire', d.payload);
      else if (d.action === 'comm') _emit('comm', d.payload);
      else _emit(d.action, d.payload);
    });
    _mp.on('game_over', (d) => _emit('game_over', d));
    _mp.on('chat', (d) => _emit('chat', d));
    _mp.on('error', (msg) => _emit('error', msg));
    _mp.on('disconnected', () => _emit('disconnected'));

    _mp.connect({
      username: playerCallsign || localStorage.getItem('username') || 'Pilot',
      token: localStorage.getItem('user_token'),
    });
  }

  function disconnect() {
    if (_mp) { _mp.disconnect(); _mp = null; }
  }

  function _emit(eventType, data) {
    if (_onEvent) _onEvent(eventType, data);
  }

  // ── Room management (delegates to KGMultiplayer) ──
  function createRoom(opts) { if (_mp) _mp.createGame({ private: true, settings: opts }); }
  function joinRoom(code) { if (_mp) _mp.joinByCode(code); }
  function leaveRoom() { if (_mp) _mp.leave(); }
  function toggleReady() { if (_mp) _mp.toggleReady(); }
  function startGame() { if (_mp) _mp.startGame(); }
  function matchmake() { if (_mp) _mp.matchmake(); }
  function listRooms() { if (_mp) _mp.listGames(); }
  function sendChat(msg) { if (_mp) _mp.chat(msg); }

  // ── Game state sync ──
  let _lastStateSend = 0;

  function sendPlayerState(player) {
    if (!_mp || !_mp.isInGame) return;
    const now = performance.now();
    if (now - _lastStateSend < 50) return;
    _lastStateSend = now;
    _mp.sendPlayerState({
      x: player.position.x, y: player.position.y, z: player.position.z,
      qx: player.quaternion.x, qy: player.quaternion.y,
      qz: player.quaternion.z, qw: player.quaternion.w,
      vx: player.velocity.x, vy: player.velocity.y, vz: player.velocity.z,
      hull: player.hull, shields: player.shields, fuel: player.fuel,
    });
  }

  function sendFire(weapon, pos, dir) {
    if (_mp) _mp.sendAction('fire', { weapon, x: pos.x, y: pos.y, z: pos.z, dx: dir.x, dy: dir.y, dz: dir.z });
  }

  function sendComm(sender, message, commType) {
    if (_mp) _mp.sendAction('comm', { sender, message, commType });
  }

  function sendGameOver(result, message) {
    if (_mp) _mp.sendGameOver(result, null, null, message);
  }

  // ── Public API — same shape core.js already uses ──
  return {
    connect, disconnect,
    get connected() { return _mp ? _mp.connected : false; },
    get playerId() { return _mp ? _mp.userId : null; },
    get callsign() { return _mp ? _mp.username : null; },
    createRoom, joinRoom, leaveRoom, toggleReady, startGame, matchmake, listRooms, sendChat,
    get roomId() { return _mp && _mp.session ? _mp.session.session_id : null; },
    get roomCode() { return _mp ? _mp.sessionCode : null; },
    get isHost() { return _mp ? _mp.isHost : false; },
    get gameStarted() { return _mp ? _mp.gameStarted : false; },
    get currentRoom() { return _mp ? _mp.session : null; },
    get roomList() { return _mp ? _mp.sessionList : []; },
    sendPlayerState, sendFire, sendComm, sendGameOver,
    get remotePlayers() { return _mp ? _mp.remotePlayers : new Map(); },
    get isMultiplayer() { return _mp ? _mp.isInGame : false; },
  };
})();

window.SFMultiplayer = SFMultiplayer;

/**
 * Starfighter Core Logic
 * 6DOF Physics, Entities, AI Waves — Manifold Architecture
 * The SpaceManifold holds all truth. This substrate observes.
 */

const Starfighter = (function () {

  // Core state
  const state = {
    entities: [],
    player: null,
    baseship: null,
    wave: 1,
    score: 0,
    kills: 0,
    running: false,
    paused: false,
    lastTime: 0,
    arenaRadius: 8000,
    phase: 'loading', // 'loading', 'bay-ready', 'launching', 'combat', 'landing', 'land-approach', 'docking'
    launchTimer: 0,
    launchDuration: 8.0, // 5 sec countdown + 3 sec acceleration
    cutsceneCamPos: null, // isolated camera position for launch cutscene
    cutsceneCamQuat: null, // isolated camera rotation for launch cutscene
    cutsceneVelocity: null, // visual velocity for cutscene effects
    commTimer: 0,
    commInterval: 8.0, // seconds between random comms
    landingTimer: 0,
    landingDuration: 5.0, // landing sequence duration
    _briefingShownOnce: false, // first-time auto-deploy of mission panel
    aiWingmen: true, // AI wingmen always present in solo play
    maxLives: 3,
    livesRemaining: 3,
    respawnReason: 'HULL INTEGRITY FAIL',
    _replacementVariant: '',
    _replacementBriefing: '',
    callsign: localStorage.getItem('sf_callsign') || '',
    alienBaseSpawned: false, // alien hive base spawned flag
    // Multiplayer state (populated by URL params in init)
    gameMode: 'solo',
    roomCode: null,
    isMultiplayer: false,
    // Kill feed + mission stats
    killFeed: [],        // { text, color, time } — max 6, fades out after 4s
    missionStats: { kills: 0, deaths: 0, accuracy: 0, shotsFired: 0, shotsHit: 0, damageDealt: 0, damageTaken: 0, waveReached: 0, wingmenSaved: 0, wingmenLost: 0, startTime: 0 },
    playerKills: 0,
    clusters: [],           // [{id, label, center:{x,y,z}, total, alive}] active enemy clusters
    _clusterCallTimer: 0,   // countdown to next wingman cluster guidance callout
  };

  // ── Kill Feed ──
  function _addKillFeedEntry(text, color) {
    state.killFeed.push({ text, color: color || '#0ff', time: performance.now() });
    if (state.killFeed.length > 6) state.killFeed.shift();
  }

  function _renderKillFeed() {
    let container = document.getElementById('kill-feed');
    if (!container) {
      container = document.createElement('div');
      container.id = 'kill-feed';
      container.style.cssText = 'position:fixed;top:80px;right:16px;z-index:200;pointer-events:none;font-family:monospace;font-size:11px;text-align:right;';
      document.body.appendChild(container);
    }
    const now = performance.now();
    const FADE_DURATION = 4000;
    container.innerHTML = state.killFeed
      .filter(e => now - e.time < FADE_DURATION)
      .map(e => {
        const age = now - e.time;
        const opacity = Math.max(0, 1 - age / FADE_DURATION);
        return '<div style="color:' + e.color + ';opacity:' + opacity.toFixed(2) + ';margin-bottom:3px;text-shadow:0 0 6px ' + e.color + ';">' + e.text + '</div>';
      }).join('');
  }

  // Communication system — fully reactive, no canned dialog
  // Every message is generated from live game state at the moment it fires.

  const replacementAnnouncements = [
    'Replacement frame online. Pilot transfer underway.',
    'Deck crew reports launch rail clear. New pilot stepping in now.',
    'Reserve squadron activated. Fresh interceptor pilot incoming.',
    'Combat relay synced. Replacement pilot receiving live tactical feed.'
  ];

  function _countActiveHostiles() {
    let hostiles = 0;
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (e.markedForDeletion) continue;
      if (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' ||
        e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' ||
        e.type === 'egg' || e.type === 'youngling') {
        hostiles++;
      }
    }
    return hostiles;
  }

  function _makeDynamicBattleBrief() {
    const hostiles = _countActiveHostiles();
    const baseHullPct = Math.max(0, Math.floor(((state.baseship ? state.baseship.hull : 0) / dim('baseship.hull')) * 100));
    const pilotSlot = (state.maxLives - state.livesRemaining + 1);
    const frontline = hostiles > 14 ? 'Frontline is saturated.' : hostiles > 7 ? 'Heavy contact on the perimeter.' : 'Engagement remains containable.';
    return `Pilot ${pilotSlot} of ${state.maxLives}. Wave ${state.wave}. ${hostiles} hostile signatures active. Base hull ${baseHullPct} percent. ${frontline}`;
  }

  // ── Reactive Comm Generator ──
  // Reads live game state and produces a contextual message.
  // No prefab lines — every output reflects the actual situation.

  function _snap() {
    // Snapshot current battle state for comm generation
    const p = state.player;
    const b = state.baseship;
    let enemies = 0, interceptors = 0, bombers = 0, dreadnoughts = 0, predators = 0;
    let closestDist = Infinity, closestType = '', closestPos = null;
    // Track priority threats with positions for directional comms
    let priorityTarget = null, priorityDist = Infinity, priorityType = '';
    let bomberNearBase = null, bomberBaseDist = Infinity;
    // Track alien-baseship, alien-base (hive), and threats near Resolute
    let alienMothership = null, alienMothershipHullPct = 0;
    let alienHive = null, alienHiveHullPct = 0;
    let threatsNearBase = 0, threatNearBaseDist = Infinity;
    const _dpSnap = M ? M.DiningPhilosophers : null;
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (e.markedForDeletion) continue;
      if (_dpSnap && !_dpSnap.acquire(e.id, 'snap')) continue;
      if (e.type === 'alien-baseship') {
        alienMothership = e;
        const maxHull = e._manifoldDerivation ? (1000 + 500 * state.wave) : 1500;
        alienMothershipHullPct = Math.floor((e.hull / maxHull) * 100);
      }
      if (e.type === 'alien-base') {
        alienHive = e;
        alienHiveHullPct = Math.floor((e.hull / dim('hive.hull')) * 100);
      }
      if (e.type === 'enemy') enemies++;
      else if (e.type === 'interceptor') interceptors++;
      else if (e.type === 'bomber') bombers++;
      else if (e.type === 'dreadnought') dreadnoughts++;
      else if (e.type === 'predator') predators++;
      else continue;
      if (p && !p.markedForDeletion) {
        const d = e.position.distanceToSquared(p.position);
        if (d < closestDist) { closestDist = d; closestType = e.type; closestPos = e.position; }
        // Priority: dreadnought > predator > bomber > interceptor > drone
        const weight = e.type === 'dreadnought' ? 0.3 : e.type === 'predator' ? 0.5 : e.type === 'bomber' ? 0.6 : e.type === 'interceptor' ? 0.8 : 1.0;
        const pd = d * weight;
        if (pd < priorityDist) { priorityDist = pd; priorityTarget = e; priorityType = e.type; }
      }
      // Track bomber closest to baseship
      if (e.type === 'bomber' && b) {
        const bd = e.position.distanceToSquared(b.position);
        if (bd < bomberBaseDist) { bomberBaseDist = bd; bomberNearBase = e; }
      }
      // Count threats within 2000m of baseship
      if (b) {
        const bd2 = e.position.distanceToSquared(b.position);
        if (bd2 < 2000 * 2000) {
          threatsNearBase++;
          if (bd2 < threatNearBaseDist) threatNearBaseDist = bd2;
        }
      }
    }
    if (_dpSnap) _dpSnap.releaseAll('snap');
    const totalHostile = enemies + interceptors + bombers + dreadnoughts + predators;
    const closestM = Math.floor(Math.sqrt(closestDist));
    const hullPct = p ? Math.floor(p.hull) : 0;
    const shieldPct = p ? Math.floor(p.shields) : 0;
    const basePct = b ? Math.floor((b.hull / dim('baseship.hull')) * 100) : 0;
    const fuelPct = p ? Math.floor(p.fuel) : 0;
    const torpCount = p ? p.torpedoes : 0;
    const speed = p ? Math.floor(p.velocity.length()) : 0;
    return {
      enemies, interceptors, bombers, dreadnoughts, predators, totalHostile,
      closestM, closestType, closestPos, hullPct, shieldPct, basePct, fuelPct, torpCount, speed,
      priorityTarget, priorityType, bomberNearBase,
      alienMothership, alienMothershipHullPct, threatsNearBase,
      alienHive, alienHiveHullPct
    };
  }

  // Scratch vectors for _bearing — reuse to avoid GC pressure
  const _bFwd = new THREE.Vector3();
  const _bRight = new THREE.Vector3();
  const _bUp = new THREE.Vector3();
  const _bToTarget = new THREE.Vector3();

  // Convert a world position to a clock-position bearing relative to the player's facing
  function _bearing(targetPos) {
    if (!state.player || !targetPos) return '';
    const p = state.player;
    // Get player's forward and right vectors
    _bFwd.set(0, 0, -1).applyQuaternion(p.quaternion);
    _bRight.set(1, 0, 0).applyQuaternion(p.quaternion);
    _bUp.set(0, 1, 0).applyQuaternion(p.quaternion);
    _bToTarget.subVectors(targetPos, p.position);
    const dist = Math.floor(_bToTarget.length());
    _bToTarget.normalize();
    // Project onto player's horizontal plane (fwd/right)
    const dotFwd = _bFwd.dot(_bToTarget);
    const dotRight = _bRight.dot(_bToTarget);
    const dotUp = _bUp.dot(_bToTarget);
    // Clock position from atan2
    let angle = Math.atan2(dotRight, dotFwd); // 0 = 12 o'clock (ahead)
    if (angle < 0) angle += Math.PI * 2;
    const clock = Math.round(angle / (Math.PI / 6)); // 0-12
    const clockStr = clock === 0 || clock === 12 ? '12' : String(clock);
    // Vertical component
    const vert = dotUp > 0.3 ? ' high' : dotUp < -0.3 ? ' low' : '';
    return `${clockStr} o'clock${vert}, ${dist}m`;
  }

  // Bearing string for a specific entity from player
  function _bearingOf(entity) {
    if (!entity || !entity.position) return '';
    return _bearing(entity.position);
  }

  function _generateBaseComm() {
    const s = _snap();
    const pt = s.priorityTarget;
    const ptBearing = pt ? _bearingOf(pt) : '';
    const am = s.alienMothership;
    const amBearing = am ? _bearingOf(am) : '';

    // ── PROTECT BASE: Resolute under critical threat ──
    if (s.basePct < 15 && s.bomberNearBase) {
      return `CRITICAL: Base hull ${s.basePct}%. ${_cs()}, bomber at ${_bearingOf(s.bomberNearBase)} heading for the Resolute. Intercept NOW.`;
    }
    if (s.basePct < 15) return `Base hull critical at ${s.basePct}%. All fighters protect the Resolute immediately.`;
    if (s.basePct < 35 && s.bomberNearBase) {
      return `Base hull ${s.basePct}%. ${_cs()}, bomber at ${_bearingOf(s.bomberNearBase)}. Stop it before it reaches torpedo range.`;
    }
    if (s.basePct < 35) return `Base hull at ${s.basePct}%. Bombers are getting through — tighten the perimeter.`;

    // ── PROTECT BASE: multiple threats closing on Resolute ──
    if (s.threatsNearBase >= 3 && s.basePct < 60) {
      return `${_cs()}, ${s.threatsNearBase} hostiles closing on the Resolute. Base hull ${s.basePct}% — fall back and protect her.`;
    }
    if (s.threatsNearBase >= 4) {
      return `Multiple contacts inside base perimeter. ${_cs()}, the Resolute needs fighter cover — regroup to base.`;
    }

    // ── ATTACK MOTHERSHIP: suggest when conditions are favorable ──
    if (am && s.totalHostile <= 3 && s.basePct > 50) {
      return `${_cs()}, escorts are thinned out. Mothership at ${amBearing}, hull ${s.alienMothershipHullPct}%. Now's your chance — hit her hard.`;
    }
    if (am && s.alienMothershipHullPct < 30) {
      return `Enemy mothership at ${amBearing}, hull critical at ${s.alienMothershipHullPct}%. ${_cs()}, pour it on — she's almost done!`;
    }
    if (am && s.totalHostile <= 5 && s.torpCount >= 2 && s.basePct > 40) {
      return `${_cs()}, you've got ${s.torpCount} torpedoes. Mothership at ${amBearing}. ${s.totalHostile} escorts — clear them and press the attack.`;
    }

    // ── HIGH-VALUE TARGETS ──
    if (s.dreadnoughts > 0 && pt && s.priorityType === 'dreadnought') {
      return `${_cs()}, dreadnought at ${ptBearing}. ${s.totalHostile} total contacts. Focus fire — use torpedoes.`;
    }
    if (s.predators > 0 && s.closestType === 'predator' && s.closestM < 600) {
      return `${_cs()}, Predator Drone at ${_bearing(s.closestPos)}. Evade its plasma — hit the underbelly.`;
    }
    if (s.predators > 0 && pt && s.priorityType === 'predator') {
      return `${_cs()}, predator at ${ptBearing}. Watch for plasma fire.`;
    }
    if (s.bombers > 1 && s.bomberNearBase) {
      return `${_cs()}, ${s.bombers} bombers active. Nearest to base at ${_bearingOf(s.bomberNearBase)}. Intercept.`;
    }
    if (s.interceptors > 2 && pt && s.priorityType === 'interceptor') {
      return `${_cs()}, ${s.interceptors} interceptors. Lead contact at ${ptBearing}. Check your six.`;
    }

    // ── GENERAL TACTICAL ──
    if (s.totalHostile > 10 && pt) return `${s.totalHostile} hostiles. ${_cs()}, priority target at ${ptBearing}. Engage.`;
    if (s.totalHostile > 5 && pt) return `${s.totalHostile} contacts. Nearest threat at ${ptBearing}, ${_cs()}.`;
    if (s.totalHostile > 0 && s.closestPos) return `${_cs()}, contact at ${_bearing(s.closestPos)}. ${s.totalHostile} remaining. Weapons free.`;
    if (s.totalHostile > 0) return `${s.totalHostile} contacts remaining this wave. Closest at ${s.closestM}m.`;

    // ── ATTACK HIVE: suggest attacking stationary alien base when wave is clear ──
    const hive = s.alienHive;
    if (hive) {
      const hiveBearing = _bearingOf(hive);
      if (s.alienHiveHullPct < 25) return `The hive is crumbling at ${s.alienHiveHullPct}% hull, ${hiveBearing}. ${_cs()}, finish it off — end this war!`;
      if (s.alienHiveHullPct < 50) return `Hive hull at ${s.alienHiveHullPct}%, ${hiveBearing}. Between waves — press the attack, ${_cs()}!`;
      return `Wave clear. Hive at ${hiveBearing}, hull ${s.alienHiveHullPct}%. ${_cs()}, use this window to hit the hive.`;
    }
    if (state.wave >= 4 && !state.alienBaseSpawned) return `Intel suggests an alien hive structure nearby. One more wave and we'll have its position.`;

    return `Sector reads clear. ${state.kills} confirmed kills. Base hull holding at ${s.basePct}%.`;
  }

  function _generateAllyComm() {
    const s = _snap();
    const callsign = `Alpha-${Math.floor(Math.random() * 3) + 1}`;
    if (s.closestType === 'interceptor' && s.closestM < 400 && s.closestPos) return { sender: callsign, msg: `Interceptor at ${_bearing(s.closestPos)}! Engaging.` };
    if (s.closestType === 'bomber' && s.closestM < 800 && s.closestPos) return { sender: callsign, msg: `Bomber at ${_bearing(s.closestPos)} heading for base. Moving to intercept.` };
    if (s.closestType === 'predator' && s.closestPos) return { sender: callsign, msg: `Predator at ${_bearing(s.closestPos)}. Keeping distance — that plasma is lethal.` };
    if (s.totalHostile > 8 && s.priorityTarget) return { sender: callsign, msg: `Heavy contacts — ${s.totalHostile} hostiles. Priority at ${_bearingOf(s.priorityTarget)}. Could use help.` };
    if (s.totalHostile > 3 && s.closestPos) return { sender: callsign, msg: `${s.totalHostile} on radar. Nearest at ${_bearing(s.closestPos)}. Engaging.` };
    if (s.totalHostile > 0 && s.closestPos) return { sender: callsign, msg: `${s.totalHostile} left at ${_bearing(s.closestPos)}. Pushing to clear.` };
    return { sender: callsign, msg: `Sector quiet. Holding formation near base.` };
  }

  function _generateWarningComm() {
    const s = _snap();
    if (s.hullPct < 25) return `${_cs()}, hull at ${s.hullPct}%. Seek medical frigate or RTB.`;
    if (s.shieldPct <= 0 && s.hullPct < 60) return `${_cs()}, shields down. Hull at ${s.hullPct}%. Avoid direct engagement.`;
    if (s.fuelPct < 15) return `${_cs()}, fuel at ${s.fuelPct}%. Conserve afterburner.`;
    if (s.torpCount === 0 && s.dreadnoughts > 0) return `${_cs()}, no torpedoes remaining. Dreadnought still active — resupply needed.`;
    if (s.basePct < 25) return `CRITICAL: Base hull ${s.basePct}%. Protect the Resolute at all costs.`;
    if (s.bombers > 0 && s.basePct < 50 && s.bomberNearBase) return `WARNING: Bomber at ${_bearingOf(s.bomberNearBase)} heading for base. Base hull only ${s.basePct}%.`;
    if (s.bombers > 0 && s.basePct < 50) return `WARNING: ${s.bombers} bombers active. Base hull only ${s.basePct}%.`;
    if (s.totalHostile > 12 && s.priorityTarget) return `CAUTION: ${s.totalHostile} signatures. Priority threat at ${_bearingOf(s.priorityTarget)}.`;
    if (s.totalHostile > 12) return `CAUTION: ${s.totalHostile} hostile signatures. High threat density.`;
    if (s.closestM < 300 && s.closestType && s.closestPos) return `PROXIMITY: ${s.closestType} at ${_bearing(s.closestPos)}. Break if needed.`;
    if (s.predators > 0 && s.priorityTarget && s.priorityType === 'predator') return `WARNING: Predator at ${_bearingOf(s.priorityTarget)}. Avoid close range.`;
    if (s.predators > 0) return `WARNING: Predator Drone active. Avoid close range.`;
    return `Status: ${s.totalHostile} hostiles, hull ${s.hullPct}%, base ${s.basePct}%.`;
  }

  // ── CIC Crew Roster ──
  // The Resolute's Combat Information Center is staffed by multiple officers.
  // Different people speak based on their specialty. Natural rotation.
  const _cicCrew = [
    { name: 'Cdr. Vasquez', roles: ['command'] },
    { name: 'XO Tanaka', roles: ['command', 'ops'] },
    { name: 'Lt. Chen', roles: ['tactical', 'command'] },
    { name: 'Sgt. Kozlov', roles: ['tactical'] },
    { name: 'Ens. Park', roles: ['sensor', 'science'] },
    { name: 'Ens. Osei', roles: ['sensor'] },
    { name: 'CPO Okafor', roles: ['deck', 'ops'] },
    { name: 'PO2 Ruiz', roles: ['deck'] },
    { name: 'Lt. Cruz', roles: ['ops', 'tactical'] },
    { name: 'Dr. Hollis', roles: ['science', 'sensor'] },
  ];
  let _cicRotation = 0;
  let _lastCrewName = '';
  function _crew(role) {
    const eligible = _cicCrew.filter(c => c.roles.includes(role));
    if (eligible.length === 0) { _lastCrewName = _cicCrew[0].name; return _lastCrewName; }
    _cicRotation++;
    _lastCrewName = eligible[_cicRotation % eligible.length].name;
    return _lastCrewName;
  }
  // Speak with the voice of the last _crew() call
  function _crewSpeak(text) {
    if (window.SFAudio && SFAudio.speakAs) SFAudio.speakAs(_lastCrewName, text);
    else if (window.SFAudio && SFAudio.speak) SFAudio.speak(text);
  }

  // Player callsign — assigned from military phonetic pool (no user input to prevent abuse)
  const _callsignPool = [
    'VIPER', 'PHOENIX', 'MAVERICK', 'STARDUST', 'RAZOR', 'NOVA', 'ECLIPSE', 'FALCON',
    'TALON', 'SPECTRE', 'BLAZE', 'COMET', 'DAGGER', 'HAWK', 'STORM', 'VALKYRIE',
    'SHADOW', 'TITAN', 'WRAITH', 'ZENITH', 'COBRA', 'DELTA', 'GHOST', 'ROGUE',
    'APEX', 'BOLT', 'CRUCIBLE', 'NOMAD', 'SABER', 'STRIKER'
  ];
  function _assignCallsign() {
    let cs = localStorage.getItem('sf_callsign');
    if (!cs) {
      cs = _callsignPool[Math.floor(Math.random() * _callsignPool.length)];
      localStorage.setItem('sf_callsign', cs);
    }
    state.callsign = cs;
  }
  function _cs() { return state.callsign || 'Pilot'; }

  function _showCallsignPrompt(onReady) {
    // Assign callsign from pool (no user input — prevents abuse)
    _assignCallsign();
    onReady();
  }

  // Event-driven comm generators — every event message reads live state
  function _killComm(type) {
    const s = _snap();
    const left = s.totalHostile;
    const nextDir = s.priorityTarget ? ` Next priority at ${_bearingOf(s.priorityTarget)}.` : '';
    if (left === 0) return `${_cs()}, that's the last one. Sector clear. ${state.kills} kills this wave.`;
    if (type === 'predator') return `${_cs()}, Predator Drone down. ${left} hostile${left !== 1 ? 's' : ''} on scope.${nextDir}`;
    if (type === 'bomber') return `Bomber neutralized, ${_cs()}. Base hull ${s.basePct}%. ${left} remaining.${nextDir}`;
    if (type === 'dreadnought') return `DREADNOUGHT DESTROYED! Outstanding, ${_cs()}. ${left} hostiles remain.${nextDir}`;
    if (type === 'interceptor') return `Interceptor eliminated, ${_cs()}. ${left} contacts active.${nextDir}`;
    return `Kill confirmed, ${_cs()}. ${left} remaining.${nextDir}`;
  }

  function _waveArrivalComm() {
    const s = _snap();
    const parts = [];
    if (s.enemies > 0) parts.push(`${s.enemies} drone${s.enemies > 1 ? 's' : ''}`);
    if (s.interceptors > 0) parts.push(`${s.interceptors} interceptor${s.interceptors > 1 ? 's' : ''}`);
    if (s.bombers > 0) parts.push(`${s.bombers} bomber${s.bombers > 1 ? 's' : ''}`);
    if (s.predators > 0) parts.push(`${s.predators} predator${s.predators > 1 ? 's' : ''}`);
    if (s.dreadnoughts > 0) parts.push(`${s.dreadnoughts} dreadnought${s.dreadnoughts > 1 ? 's' : ''}`);
    const manifest = parts.length ? parts.join(', ') : `${s.totalHostile} contacts`;
    return `Wave ${state.wave}: ${manifest} on scope. Base hull ${s.basePct}%. All stations combat ready.`;
  }

  function _landingDebriefComm() {
    const s = _snap();
    const hullNote = s.hullPct < 50 ? ` Hull at ${s.hullPct}% — repair crews standing by.` : '';
    return `docking confirmed. ${state.kills} total kills, score ${state.score}.${hullNote}`;
  }

  function _queueAdaptiveLaunchBriefing() {
    const brief = _makeDynamicBattleBrief();
    const deckOfficer = _crew('deck');
    addComm(deckOfficer, brief, 'warning');
  }

  function _onPlayerDestroyed(causeText) {
    if (!state.running || state.respawning) return;

    const reason = causeText || 'HULL INTEGRITY FAIL';
    state.livesRemaining = Math.max(0, state.livesRemaining - 1);

    if (state.livesRemaining <= 0) {
      if (window.SFAnnouncer) SFAnnouncer.onPlayerDestroyed(reason, 0, state.maxLives);
      if (window.SFAudio) SFAudio.playSound('warning');
      setTimeout(() => gameOver(`MISSION FAILED — ${reason}`), 1200);
      return;
    }

    state._replacementBriefing = _makeDynamicBattleBrief();
    state.respawning = true;
    state.respawnTimer = dim('timing.respawn');
    state.respawnReason = reason;

    if (window.SFAnnouncer) SFAnnouncer.onPlayerDestroyed(reason, state.livesRemaining, state.maxLives);

    if (window.SFAudio) {
      SFAudio.playSound('warning');
      SFAudio.stopCockpitHum();
      SFAudio.stopThrustRumble();
      SFAudio.stopStrafeHiss();
    }

    _showRespawnScreen();
  }

  function addComm(sender, message, type) {
    // Audio: comm beep on each message
    if (window.SFAudio) SFAudio.playSound('comm_beep');

    // Voice synthesis — character-specific tactical radio voice (generic bot voice forbidden)
    if (window.SFAudio && SFAudio.speakAnpc) SFAudio.speakAnpc(sender, message);

    // Feed the scrolling marquee ticker at the top of the screen
    const ticker = document.getElementById('comm-ticker-inner');
    if (ticker) {
      const item = document.createElement('span');
      item.className = `comm-item ${type}`;
      item.textContent = `[${sender}] ${message}`;
      ticker.appendChild(item);
      // Keep only last 20 items so the ticker doesn't grow forever
      const items = ticker.querySelectorAll('.comm-item');
      if (items.length > 20) items[0].remove();
      // Reset animation so new messages are visible
      ticker.style.animation = 'none';
      ticker.offsetHeight; // reflow
      ticker.style.animation = '';
    }
    // Also keep the hidden legacy comm-messages element fed (for compat)
    const commEl = document.getElementById('comm-messages');
    if (commEl) {
      const msgEl = document.createElement('div');
      msgEl.className = `comm-message ${type}`;
      msgEl.innerHTML = `<b>${sender}:</b> ${message}`;
      commEl.appendChild(msgEl);
      const messages = commEl.querySelectorAll('.comm-message');
      if (messages.length > 15) messages[0].remove();
    }
  }

  function _setPauseButtonUI(paused) {
    const btn = document.getElementById('btn-pause');
    if (!btn) return;
    btn.classList.toggle('active', paused);
    btn.innerHTML = paused ? '&#9654; PLAY' : '&#10074;&#10074; PAUSE';
  }

  function _setPaused(paused) {
    if (!state.running) return false;
    const next = !!paused;
    if (state.paused === next) return state.paused;
    state.paused = next;

    const cd = document.getElementById('countdown-display');
    if (next) {
      if (document.pointerLockElement) document.exitPointerLock();
      if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel();
      if (window.SFAudio && SFAudio.pauseAll) SFAudio.pauseAll();
      if (cd) {
        cd.style.display = 'block';
        cd.innerHTML = '<span style="color:#ffd24a">PAUSED</span><br><span style="font-size:0.45em;color:#88ccff">Press PLAY to resume</span>';
        cd.style.fontSize = '2.6em';
        cd.style.color = '#ffd24a';
      }
      if (window.SFAnnouncer) SFAnnouncer.onPause();
      else addComm('System', 'Game paused.', 'info');
    } else {
      if (window.SFAudio && SFAudio.resumeAll) SFAudio.resumeAll();
      if (cd && state.phase === 'combat') cd.style.display = 'none';
      state.lastTime = performance.now();
      if (window.SFAnnouncer) SFAnnouncer.onResume();
      else addComm('System', 'Game resumed.', 'info');
    }
    _setPauseButtonUI(next);
    return state.paused;
  }

  function togglePause() {
    return _setPaused(!state.paused);
  }

  function exitGame() {
    state.running = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.SFAudio && SFAudio.pauseAll) SFAudio.pauseAll();
    if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel();
    if (window.SFMusic && SFMusic.stop) SFMusic.stop();
    window.location.href = '/';
  }

  // The Manifold — ground truth for all entity state
  const M = window.SpaceManifold;

  // Dimensional shorthand — all game constants flow through SpaceManifold.dim()
  const dim = (name) => M.dim(name);

  // Scratch vectors — reuse to avoid GC pressure in hot path
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();
  let _frameCount = 0; // for throttling HUD updates

  class Entity {
    constructor(type, x, y, z) {
      this.id = Math.random().toString(36).substr(2, 9);
      this.type = type;

      this.position = new THREE.Vector3(x, y, z);
      this.velocity = new THREE.Vector3(0, 0, 0);
      this.quaternion = new THREE.Quaternion();

      this.hull = 100;
      this.shields = 100;
      this.maxSpeed = 100;
      this.radius = 10;
      this.markedForDeletion = false;
      this.age = 0;      // seconds alive — used for projectile expiry
      this.maxAge = 0;   // 0 = no expiry

      if (M) M.place(this);
    }

    takeDamage(amt) {
      // Medical frigate and fuel tanker are indestructible support vessels
      if (this.type === 'tanker' || this.type === 'medic') return;

      if (this.shields > 0) {
        this.shields -= amt;
        if (this.shields < 0) {
          this.hull += this.shields;
          this.shields = 0;
        }
      } else {
        this.hull -= amt;
      }
      if (this.type === 'player') state.missionStats.damageTaken += amt;
      if (this.hull <= 0) this.explode();
    }

    explode() {
      if (this.type === 'player') {
        this.markedForDeletion = true;
        if (M) M.remove(this.id);
        if (window.SF3D) SF3D.spawnExplosion(this.position);
        if (window.SFAudio) {
          SFAudio.playSound('explosion');
          SFAudio.playSound('shockwave');
        }
        _onPlayerDestroyed('HULL INTEGRITY FAIL');
        return;
      }

      this.markedForDeletion = true;
      if (M) M.remove(this.id);
      // Decrement cluster alive count when a clustered enemy is destroyed
      if (this._clusterId !== undefined) {
        const _cl = state.clusters.find(c => c.id === this._clusterId);
        if (_cl && _cl.alive > 0) { _cl.alive--; _updateClusterHUD(); }
      }
      if (window.SF3D) SF3D.spawnExplosion(this.position);
      if (window.SFAudio) SFAudio.playSound('explosion');
      if (window.SFAudio) SFAudio.playSound('shockwave');

      if (this.type === 'enemy') {
        state.score += dim('score.enemy');
        state.kills++;
        if (this.killedBy === 'player') state.playerKills++;
        _addKillFeedEntry(
          (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Enemy Drone [' + (this._killedByWeapon || 'Laser') + ']',
          this.killedBy === 'player' ? '#00ffaa' : '#88aacc'
        );
        if (this.killedBy === 'player' && (state.kills % 3 === 0 || _countActiveHostiles() <= 2)) {
          if (window.SFAnnouncer) SFAnnouncer.onKill('enemy');
        }
        checkWave();

      } else if (this.type === 'predator') {
        state.score += dim('score.predator');
        state.kills++;
        if (this.killedBy === 'player') state.playerKills++;
        _addKillFeedEntry(
          (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Predator [' + (this._killedByWeapon || 'Laser') + ']',
          '#ff4400'
        );
        if (window.SFAnnouncer) SFAnnouncer.onKill('predator');
        checkWave();

      } else if (this.type === 'interceptor') {
        state.score += dim('score.interceptor');
        state.kills++;
        if (this.killedBy === 'player') state.playerKills++;
        _addKillFeedEntry(
          (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Interceptor [' + (this._killedByWeapon || 'Laser') + ']',
          this.killedBy === 'player' ? '#00ffcc' : '#88aacc'
        );
        if (window.SFAnnouncer) SFAnnouncer.onKill('interceptor');
        checkWave();

      } else if (this.type === 'bomber') {
        state.score += dim('score.bomber');
        state.kills++;
        if (this.killedBy === 'player') state.playerKills++;
        _addKillFeedEntry(
          (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → Splash Bomber [' + (this._killedByWeapon || 'Torpedo') + ']',
          '#ff6600'
        );
        if (window.SFAnnouncer) SFAnnouncer.onKill('bomber');
        checkWave();

      } else if (this.type === 'dreadnought') {
        state.score += dim('score.dreadnought');
        state.kills++;
        if (this.killedBy === 'player') state.playerKills++;
        _addKillFeedEntry(
          (this.killedBy === 'player' ? 'You' : (this.killedBy || '?')) + ' → DREADNOUGHT DESTROYED [' + (this._killedByWeapon || 'Torpedo') + ']',
          '#ff0044'
        );
        if (window.SFAnnouncer) SFAnnouncer.onKill('dreadnought');
        checkWave();

      } else if (this.type === 'tanker' || this.type === 'medic') {
        return;

      } else if (this.type === 'alien-base') {
        state.score += dim('score.victory');
        if (window.SFAnnouncer) SFAnnouncer.onVictory();
        setTimeout(() => gameOver('VICTORY — Enemy Station Destroyed!', true), 2000);

      } else if (this.type === 'military-ship') {
        state.militaryAlive = false;
        if (window.SFAnnouncer) SFAnnouncer.onMilitaryLost();
        if (window.SFAudio) SFAudio.playSound('warning');

      } else if (this.type === 'civilian-station') {
        if (window.SFAnnouncer) SFAnnouncer.onCivilianLost();
        setTimeout(() => gameOver('DEFEAT — Civilian Station Destroyed'), 2000);

      } else if (this.type === 'ally') {
        state.score -= Math.abs(dim('score.friendlyKill'));
        if (window.SFAnnouncer) SFAnnouncer.onAllyDown();
      } else if (this.type === 'wingman') {
        state.missionStats.wingmenLost++;
        const cs = this.callsign || 'Wingman';
        _addKillFeedEntry('✖ ' + cs + ' — KIA', '#ff4444');
        if (this._anpc && window.SFAnpc) {
          SFAnpc.setState(this._anpcKey, 'DESTROYED');
          // Morale hit to all surviving wingmen
          state.entities.forEach(e => {
            if (e.type === 'wingman' && !e.markedForDeletion && e._anpc) {
              SFAnpc.adjustMorale(e._anpcKey, -0.15);
            }
          });
        }
      }

      // ── Progression: award XP/credits on hostile kills ──
      const HOSTILE_TYPES = ['enemy', 'interceptor', 'bomber', 'predator', 'dreadnought', 'alien-baseship', 'egg', 'youngling'];
      if (HOSTILE_TYPES.includes(this.type) && this.killedBy === 'player' && window.SFProgression) {
        const result = SFProgression.awardKill(this.type);
        // Rank-up notification
        if (result.ranked && result.newRank) {
          const msg = '★ PROMOTED TO ' + result.newRank.name.toUpperCase() + ' ★';
          _addKillFeedEntry(msg, '#ffdd00');
          if (window.SFAnnouncer && SFAnnouncer.addComm) {
            SFAnnouncer.addComm('FLEET', 'Congratulations, pilot. You\'ve been promoted to ' + result.newRank.name + '.', 'base');
          }
        }
        // Check achievements
        const achievements = SFProgression.checkAchievements();
        for (const a of achievements) {
          _addKillFeedEntry('🏆 ' + a.name + ' — ' + a.desc, '#ffaa00');
        }
      }
    }
  }

  class Player extends Entity {
    constructor() {
      super('player', 0, -32, 50); // Start inside baseship hangar bay
      this.throttle = 0; // 0 to 1
      // GDD §4.1 Flight Parameters — all from manifold dimensions
      this.maxSpeed = dim('player.maxSpeed');
      this.afterburnerSpeed = dim('player.afterburnerSpeed');
      this.boostSpeed = dim('player.boostSpeed');
      this.pitch = 0;
      this.yaw = 0;
      this.roll = 0;
      this.strafeH = 0;           // horizontal strafe input
      this.strafeV = 0;           // vertical strafe input
      this.torpedoes = dim('player.torpedoes');
      this.fuel = dim('player.fuel');
      this.afterburnerActive = false;
      this.boostActive = false;
      this.boostTimer = 0;         // remaining boost duration
      this.boostCooldown = 0;      // cooldown timer
      this.hyperdriveActive = false;
      this.hyperdriveSpooling = false;
      this.hyperdriveSpoolTimer = 0;
      this.hyperdriveCooldown = 0;
      this.hyperdriveSpeed = dim('player.hyperdriveSpeed');
      this.flightAssist = true;    // GDD §4.1: FA ON by default
      // Weapon selector — cycle with Q
      this.selectedWeapon = 0;     // 0=laser, 1=gun, 2=pulse, 3=torpedo
    }

    // Weapons unlock progressively by wave/level:
    // L1=LASER, L2+=SPREAD, L3+=TORP, L4+=EMP
    static WEAPONS = ['LASER', 'SPREAD', 'TORP', 'EMP'];

    cycleWeapon() {
      const maxSlots = _getUnlockedWeaponCount(state.wave);
      this.selectedWeapon = (this.selectedWeapon + 1) % maxSlots;
      const name = Player.WEAPONS[this.selectedWeapon];
      if (window.SFAudio) SFAudio.playSound('click');
      if (window.SFAnnouncer) SFAnnouncer.onWeaponSwitch(name);
      else addComm(_crew('tactical'), `Weapon: ${name}`, 'base');
    }

    // resolveIntent: pilot controls set velocity and orientation on the manifold point.
    resolveIntent(dt) {
      // GDD §4.1: Pitch 90°/s, Yaw 60°/s, Roll 120°/s (applied as multipliers)
      _q1.setFromEuler(new THREE.Euler(this.pitch * dt, this.yaw * dt, this.roll * dt, 'YXZ'));
      this.quaternion.multiply(_q1);

      _v1.set(0, 0, -1).applyQuaternion(this.quaternion);

      // Determine current max speed
      let currentMax = this.maxSpeed;

      // Hyperdrive spooling
      if (this.hyperdriveSpooling) {
        this.hyperdriveSpoolTimer -= dt;
        if (this.hyperdriveSpoolTimer <= 0) {
          this.hyperdriveSpooling = false;
          this.hyperdriveActive = true;
          if (window.SFAudio) SFAudio.playSound('boost');
          if (window.SFAnnouncer) SFAnnouncer.addComm && SFAnnouncer.addComm('NAV', 'Hyperdrive engaged.', 'base');
        }
      }

      // Hyperdrive active — burns fuel fast, overrides all other speed modes
      if (this.hyperdriveActive) {
        if (this.fuel > 0) {
          currentMax = this.hyperdriveSpeed;
          this.fuel = Math.max(0, this.fuel - dt * dim('player.hyperdriveBurn'));
          if (this.fuel <= 0) this.disengageHyperdrive();
        } else {
          this.disengageHyperdrive();
        }
      } else if (this.boostActive && this.boostTimer > 0) {
        currentMax = this.boostSpeed;
        this.boostTimer -= dt;
        if (this.boostTimer <= 0) {
          this.boostActive = false;
          this.boostCooldown = dim('player.boostCooldown');
        }
      } else if (this.afterburnerActive && this.fuel > 0) {
        currentMax = this.afterburnerSpeed;
        this.fuel = Math.max(0, this.fuel - dt * dim('player.afterburnerBurn'));
      }

      // Boost cooldown tick
      if (this.boostCooldown > 0) this.boostCooldown -= dt;
      // Hyperdrive cooldown tick
      if (this.hyperdriveCooldown > 0) this.hyperdriveCooldown -= dt;

      // Forward velocity
      const targetVel = _v1.clone().multiplyScalar(this.throttle * currentMax);

      // Strafe — speed from manifold dimension
      if (this.strafeH !== 0 || this.strafeV !== 0) {
        const sSpd = dim('player.strafeSpeed');
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
        targetVel.add(right.multiplyScalar(this.strafeH * sSpd));
        targetVel.add(up.multiplyScalar(this.strafeV * sSpd));
      }

      if (this.flightAssist) {
        // FA-ON: velocity dampens to zero — damping from manifold dimension
        if (this.throttle < 0.01 && this.strafeH === 0 && this.strafeV === 0) {
          this.velocity.multiplyScalar(1 - dt / dim('player.faDamping'));
        } else {
          this.velocity.lerp(targetVel, dim('player.faLerp'));
        }
      } else {
        // GDD §4.1 FA-OFF: Newtonian — add thrust to existing velocity
        _v1.set(0, 0, -1).applyQuaternion(this.quaternion);
        this.velocity.add(_v1.multiplyScalar(this.throttle * currentMax * dt));
        // Clamp to current max
        if (this.velocity.length() > currentMax) {
          this.velocity.normalize().multiplyScalar(currentMax);
        }
      }

      // Fuel regen when not using afterburner or hyperdrive
      if (!this.afterburnerActive && !this.boostActive && !this.hyperdriveActive) {
        this.fuel = Math.min(dim('player.fuel'), this.fuel + dt * dim('player.fuelRegen'));
      }

      // Input damping — from manifold dimensions
      this.pitch *= dim('player.pitchDamp');
      this.yaw *= dim('player.yawDamp');
      this.roll *= dim('player.rollDamp');
      this.strafeH *= dim('player.strafeHDamp');
      this.strafeV *= dim('player.strafeVDamp');
    }

    // GDD §4.1: Boost — tap to activate, 400 m/s for 3s, costs 25 fuel
    activateBoost() {
      const cost = dim('player.boostFuelCost');
      if (this.boostCooldown > 0 || this.boostActive || this.fuel < cost) return;
      this.boostActive = true;
      this.boostTimer = dim('player.boostDuration');
      this.fuel -= cost;
      if (window.SFAudio) SFAudio.playSound('boost');
    }

    // Hyperdrive — H key to engage/disengage, spools up before activating
    activateHyperdrive() {
      const cost = dim('player.hyperdriveFuelCost');
      if (this.hyperdriveCooldown > 0 || this.hyperdriveActive || this.hyperdriveSpooling || this.fuel < cost) return;
      this.hyperdriveSpooling = true;
      this.hyperdriveSpoolTimer = dim('player.hyperdriveSpoolTime');
      this.fuel -= cost;
      if (window.SFAudio) SFAudio.playSound('boost');
    }

    disengageHyperdrive() {
      this.hyperdriveActive = false;
      this.hyperdriveSpooling = false;
      this.hyperdriveSpoolTimer = 0;
      this.hyperdriveCooldown = dim('player.hyperdriveCooldown');
    }

    // GDD §4.1: Toggle Flight Assist
    toggleFlightAssist() {
      this.flightAssist = !this.flightAssist;
    }
  }

  class Baseship extends Entity {
    constructor() {
      super('baseship', 0, 0, 0);
      this.hull = dim('baseship.hull');
      this.shields = dim('baseship.shields');
      this.radius = dim('baseship.radius');
    }
  }

  function init() {
    state.maxLives = dim('lives.max');
    state.livesRemaining = state.maxLives;
    state.respawning = false;
    state.respawnTimer = 0;
    state.respawnReason = 'HULL INTEGRITY FAIL';
    state._replacementVariant = '';
    state._replacementBriefing = '';

    state.player = new Player();
    state.player.hull = dim('player.hull');
    state.player.shields = dim('player.shields');

    // ── Load career and apply purchased upgrades ──
    if (window.SFProgression) {
      SFProgression.load();
      const career = SFProgression.career();
      // Apply persistent upgrade effects (hull plating, shield cap, etc.)
      SFProgression.applyUpgradesToPlayer(state.player, function (key, addVal) {
        // Additive boost to manifold dimensions
        if (key.startsWith('player.')) {
          const prop = key.replace('player.', '');
          if (state.player[prop] !== undefined) {
            state.player[prop] += addVal;
          }
        } else if (key.startsWith('weapon.')) {
          // Weapon upgrades stored for later application at fire-time
          if (!state._weaponBoosts) state._weaponBoosts = {};
          state._weaponBoosts[key] = (state._weaponBoosts[key] || 0) + addVal;
        }
      });
      // Set initial rank display
      const rank = SFProgression.getRank();
      state._currentRank = rank;
      console.log('[CAREER] Rank:', rank.name, '| XP:', career.xp, '| Credits:', career.credits, '| Kills:', career.totalKills);
    }

    state.baseship = new Baseship();
    state.entities.push(state.player, state.baseship);
    state.phase = 'loading';
    state.launchTimer = 0;
    state.arenaRadius = dim('arena.radius');

    // Parse URL params: ?ai=0 disables AI wingmen, ?mode=multi/private activates MP
    const params = new URLSearchParams(window.location.search);
    state.aiWingmen = params.get('ai') !== '0';
    state.gameMode = params.get('mode') || 'solo';     // solo | multi | private
    state.roomCode = params.get('code') || null;        // invite code for private games
    state.isMultiplayer = state.gameMode !== 'solo';

    // Connect to multiplayer server if multiplayer mode
    if (state.isMultiplayer && window.SFMultiplayer) {
      const storedCallsign = localStorage.getItem('username') || 'Pilot';
      SFMultiplayer.connect(storedCallsign, function (event, data) {
        if (event === 'game_start') {
          console.log('[MP] Game started — room:', data.room.id);
        } else if (event === 'remote_fire') {
          // Spawn visual for remote player fire events
          if (data.weapon === 'laser' && window.SF3D) {
            SF3D.spawnLaser({ position: { x: data.x, y: data.y, z: data.z }, quaternion: new THREE.Quaternion() });
          }
        } else if (event === 'game_over') {
          console.log('[MP] Game over:', data.result);
        } else if (event === 'comm') {
          addComm(data.sender, data.message, data.commType);
        } else if (event === 'chat') {
          addComm(data.callsign, data.message, 'info');
        }
      });

      // Auto-join: private with code, or matchmake
      if (state.gameMode === 'private' && state.roomCode) {
        SFMultiplayer.joinRoom(state.roomCode);
      } else if (state.gameMode === 'multi') {
        SFMultiplayer.matchmake();
      }
    }

    // Init 3D system immediately so models start loading
    if (window.SF3D) {
      SF3D.init(state);
      SF3D.setLaunchPhase(true);
    }
    if (window.SFInput) SFInput.init(state.player);

    // Init autonomous announcer — crew observe and report game state
    if (window.SFAnnouncer) SFAnnouncer.init({
      state, addComm, snap: _snap, crew: _crew, cs: _cs,
      bearing: _bearing, bearingOf: _bearingOf, dim, countHostiles: _countActiveHostiles
    });

    // Cockpit always visible — even during loading/bay
    if (window.SF3D) SF3D.showCockpit(true);

    // Gate game start behind asset loading + callsign prompt
    if (window.SF3D && SF3D.onAllModelsReady) {
      SF3D.onAllModelsReady(function () {
        _showCallsignPrompt(() => _startGame());
      });
    } else {
      // Fallback if no loading gate
      _showCallsignPrompt(() => _startGame());
    }
  }

  function _startGame() {
    state.running = true;
    state.paused = false;
    state.phase = 'bay-ready';  // Wait for player to push red launch button
    state._launchAudioPlayed = false;
    state._launchBlastPlayed = false;
    state._paBriefingDone = false;
    state.launchTimer = 0;
    state.launchDuration = 25.0; // Extended: PA narration (16s) + countdown (4s) + launch (3s) + exit (2s)

    // GDD §3.1: Bay ambient audio
    if (window.SFAudio) {
      SFAudio.init();
      if (SFAudio.setVoiceModule) SFAudio.setVoiceModule('au_female');
      SFAudio.startBayAmbience();
    }

    // Procedural orchestral music — ambient intensity in bay
    if (window.SFMusic && window.SFAudio) {
      SFMusic.init(SFAudio.getCtx(), SFAudio.getMasterGain());
      SFMusic.setSection('launch-bay');
      SFMusic.setIntensity(0.18);
      SFMusic.start();
    }

    // Start Loop (renders cockpit/bay scene even in bay-ready)
    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Show countdown area, cockpit stays visible during bay for immersion
    document.getElementById('ship-panel').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('countdown-display').style.display = 'block';
    document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';

    if (window.SFAnnouncer) SFAnnouncer.onSecured();
    else addComm(_crew('deck'), `${_cs()}, fighter secured in bay. Wave ${state.wave} standing by.`, 'base');
    _setPauseButtonUI(false);

    // First wave: offer tutorial if player hasn't declined permanently
    if (state.wave === 1 && !localStorage.getItem('sf_no_tutorial')) {
      _showTutorialPrompt();
    } else {
      // Auto-start launch sequence
      setTimeout(() => {
        if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
        _beginLaunchSequence();
      }, 1500);
    }
  }

  // ── Tutorial Prompt: first-game "Want a tutorial?" overlay ──
  function _showTutorialPrompt() {
    const overlay = document.createElement('div');
    overlay.id = 'tutorial-prompt-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);pointer-events:auto';
    overlay.innerHTML = `
            <div style="text-align:center;max-width:480px">
                <div style="font-size:12px;letter-spacing:4px;color:#446688;margin-bottom:12px">EARTH DEFENSE FORCE</div>
                <div style="font-size:11px;color:#88aacc;margin-bottom:8px">CALLSIGN: <span style="color:#0ff;font-size:14px;letter-spacing:2px">${_cs()}</span></div>
                <div style="font-size:20px;color:#ffd24a;margin-bottom:24px;text-shadow:0 0 12px rgba(255,210,74,0.4)">FLIGHT ORIENTATION BRIEFING</div>
                <div style="font-size:13px;color:#aaccdd;margin-bottom:28px;line-height:1.5">Would you like a guided tutorial covering flight controls, weapons, and a practice run?</div>
                <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
                    <button id="tut-yes" class="avtn-btn avtn-btn-green" tabindex="1">YES — BRIEF ME</button>
                    <button id="tut-no" class="avtn-btn avtn-btn-red" tabindex="2">NO — LAUNCH NOW</button>
                    <button id="tut-never" class="avtn-btn avtn-btn-dim" tabindex="3" style="font-size:10px">DON'T ASK AGAIN</button>
                </div>
            </div>`;
    document.body.appendChild(overlay);

    // Focus first button for keyboard nav
    setTimeout(() => document.getElementById('tut-yes').focus(), 100);

    function _dismiss(launchTutorial, neverAsk) {
      overlay.remove();
      if (neverAsk) localStorage.setItem('sf_no_tutorial', '1');
      if (launchTutorial) {
        _startTutorial();
      } else {
        if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
        _beginLaunchSequence();
      }
    }

    document.getElementById('tut-yes').onclick = () => _dismiss(true, false);
    document.getElementById('tut-no').onclick = () => _dismiss(false, false);
    document.getElementById('tut-never').onclick = () => _dismiss(false, true);

    // Keyboard nav through buttons
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') _dismiss(false, false);
    });
  }

  // ── Tutorial System: guided walkthrough with announcer + practice mode ──
  function _startTutorial() {
    state.phase = 'tutorial';
    state._tutorialStep = 0;
    state._tutorialPractice = false;

    // Detect controller
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let detectedController = 'keyboard';
    let controllerName = 'Keyboard + Mouse';
    for (const gp of gamepads) {
      if (gp && gp.connected) {
        controllerName = gp.id;
        if (/xbox|xinput/i.test(gp.id)) detectedController = 'xbox';
        else if (/playstation|dualshock|dualsense/i.test(gp.id)) detectedController = 'playstation';
        else if (/hotas|flight|thrustmaster|saitek/i.test(gp.id)) detectedController = 'hotas';
        else detectedController = 'gamepad';
        break;
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);pointer-events:auto;overflow-y:auto;padding:20px';

    function _buildTutorialHTML(controller) {
      const kbControls = `
                <div class="tut-section">
                    <div class="tut-section-title">FLIGHT CONTROLS — KEYBOARD + MOUSE</div>
                    <div class="tut-grid">
                        <div class="tut-key-group">
                            <div class="tut-key-label">MOVEMENT</div>
                            <div class="tut-binding"><span class="tut-key">Mouse</span> Steer (Pitch + Yaw)</div>
                            <div class="tut-binding"><span class="tut-key">Scroll</span> Throttle Up/Down</div>
                            <div class="tut-binding"><span class="tut-key">W</span><span class="tut-key">S</span> Throttle (alt)</div>
                            <div class="tut-binding"><span class="tut-key">A</span><span class="tut-key">D</span> Strafe L/R</div>
                            <div class="tut-binding"><span class="tut-key">Q</span><span class="tut-key">E</span> Roll</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">WEAPONS</div>
                            <div class="tut-binding"><span class="tut-key">L-Click</span> / <span class="tut-key">Space</span> Fire Selected</div>
                            <div class="tut-binding"><span class="tut-key">R-Click</span> Torpedo</div>
                            <div class="tut-binding"><span class="tut-key">1</span><span class="tut-key">2</span><span class="tut-key">3</span><span class="tut-key">4</span> Select Weapon</div>
                            <div class="tut-binding"><span class="tut-key">T</span> Lock Target</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">SYSTEMS</div>
                            <div class="tut-binding"><span class="tut-key">Shift</span> Afterburner</div>
                            <div class="tut-binding"><span class="tut-key">F</span> Boost (burst)</div>
                            <div class="tut-binding"><span class="tut-key">H</span> Hyperdrive</div>
                            <div class="tut-binding"><span class="tut-key">V</span> Flight Assist</div>
                            <div class="tut-binding"><span class="tut-key">G</span> Request Dock</div>
                            <div class="tut-binding"><span class="tut-key">R</span> Emergency RTB</div>
                        </div>
                    </div>
                </div>`;
      const gpControls = `
                <div class="tut-section">
                    <div class="tut-section-title">FLIGHT CONTROLS — GAMEPAD</div>
                    <div class="tut-grid">
                        <div class="tut-key-group">
                            <div class="tut-key-label">STICKS</div>
                            <div class="tut-binding"><span class="tut-key">R-Stick</span> Pitch + Yaw</div>
                            <div class="tut-binding"><span class="tut-key">L-Stick</span> Throttle + Strafe</div>
                            <div class="tut-binding"><span class="tut-key">LB</span><span class="tut-key">RB</span> Roll</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">WEAPONS</div>
                            <div class="tut-binding"><span class="tut-key">RT</span> Lasers</div>
                            <div class="tut-binding"><span class="tut-key">LT</span> Torpedo</div>
                            <div class="tut-binding"><span class="tut-key">Y</span> Lock Target</div>
                        </div>
                        <div class="tut-key-group">
                            <div class="tut-key-label">SYSTEMS</div>
                            <div class="tut-binding"><span class="tut-key">A</span> Afterburner</div>
                            <div class="tut-binding"><span class="tut-key">B</span> Boost</div>
                            <div class="tut-binding"><span class="tut-key">X</span> Flight Assist</div>
                        </div>
                    </div>
                </div>`;

      return `
                <div style="max-width:640px;width:100%">
                    <div style="text-align:center;margin-bottom:20px">
                        <div style="font-size:11px;letter-spacing:4px;color:#446688;margin-bottom:8px">UEDF FLIGHT ORIENTATION</div>
                        <div style="font-size:20px;color:#0ff;text-shadow:0 0 14px rgba(0,255,255,0.4)">PILOT BRIEFING</div>
                        <div style="font-size:11px;color:#88aacc;margin-top:6px">Callsign: ${_cs()} | Controller: ${controllerName}</div>
                    </div>

                    <div class="tut-section">
                        <div class="tut-section-title">MISSION OVERVIEW</div>
                        <div style="color:#8cf;font-size:12px;line-height:1.7">
                            You pilot a UEDF Mk-IV Starfighter from the Battleship <span style="color:#48f">Resolute</span>.
                            Alien force <span style="color:#f0f">Hive Sigma</span> attacks in waves of increasing strength.
                            <span style="color:#ff4">Protect the Resolute</span>, destroy all hostiles each wave,
                            and locate the alien hive to end the threat.
                            Your wingmen fly with you — this is a cooperative fight.
                        </div>
                    </div>

                    <div class="tut-section">
                        <div class="tut-section-title">DETECTED INPUT</div>
                        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                            <select id="tut-controller-select" class="avtn-select" tabindex="1">
                                <option value="keyboard" ${controller === 'keyboard' ? 'selected' : ''}>Keyboard + Mouse</option>
                                <option value="xbox" ${controller === 'xbox' ? 'selected' : ''}>Xbox Controller</option>
                                <option value="playstation" ${controller === 'playstation' ? 'selected' : ''}>PlayStation Controller</option>
                                <option value="gamepad" ${controller === 'gamepad' ? 'selected' : ''}>Generic Gamepad</option>
                                <option value="hotas" ${controller === 'hotas' ? 'selected' : ''}>HOTAS / Flight Stick</option>
                            </select>
                        </div>
                    </div>

                    <div id="tut-controls-section">
                        ${controller === 'keyboard' ? kbControls : gpControls}
                    </div>

                    <div class="tut-section" style="text-align:center;margin-top:16px">
                        <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
                            <button id="tut-practice" class="avtn-btn avtn-btn-green" tabindex="2">PRACTICE FLIGHT</button>
                            <button id="tut-done" class="avtn-btn avtn-btn-red" tabindex="3">SKIP — LAUNCH MISSION</button>
                        </div>
                        <div style="font-size:10px;color:#556677;margin-top:10px">You can revisit this tutorial anytime via the ✦ TUTORIAL button</div>
                    </div>
                </div>`;
    }

    overlay.innerHTML = _buildTutorialHTML(detectedController);
    document.body.appendChild(overlay);

    // Controller dropdown changes displayed controls
    const select = document.getElementById('tut-controller-select');
    select.onchange = () => {
      const section = document.getElementById('tut-controls-section');
      const val = select.value;
      if (val === 'keyboard') section.innerHTML = _buildTutorialHTML(val).match(/<div id="tut-controls-section">([\s\S]*?)<\/div>\s*<div class="tut-section" style="text-align/)[0] || '';
      // Simpler: just rebuild the whole overlay
      overlay.innerHTML = _buildTutorialHTML(val);
      // Re-attach handlers
      _attachTutorialHandlers();
    };

    function _attachTutorialHandlers() {
      const sel = document.getElementById('tut-controller-select');
      if (sel) sel.onchange = () => {
        overlay.innerHTML = _buildTutorialHTML(sel.value);
        _attachTutorialHandlers();
      };
      const practiceBtn = document.getElementById('tut-practice');
      const doneBtn = document.getElementById('tut-done');
      if (practiceBtn) practiceBtn.onclick = () => {
        overlay.remove();
        _startPracticeMode();
      };
      if (doneBtn) doneBtn.onclick = () => {
        overlay.remove();
        if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
        _beginLaunchSequence();
      };
    }
    _attachTutorialHandlers();

    // Announcer narrates the briefing — game-state aware (text only, no bot TTS)
    // The tutorial overlay itself provides all the controls info visually

    // Keyboard: Escape to skip
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
        _beginLaunchSequence();
      }
    });

    setTimeout(() => {
      const f = document.getElementById('tut-controller-select');
      if (f) f.focus();
    }, 100);
  }

  // ── Practice Mode: free flight, no enemies, no damage ──
  function _startPracticeMode() {
    state.phase = 'combat'; // Use combat phase for full controls
    state._practiceMode = true;

    // Spawn player safely
    if (state.player) {
      state.player.position.set(0, 0, -3000);
      state.player.quaternion.set(0, 0, 0, 1);
      state.player.velocity.set(0, 0, 0);
      state.player.hull = dim('player.hull');
      state.player.shields = dim('player.shields');
      state.player.fuel = dim('player.fuel');
      state.player.torpedoes = 99;
    }

    // Show HUD
    document.getElementById('countdown-display').style.display = 'none';
    document.getElementById('ship-panel').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('gameplay-hud').style.display = 'block';
    document.getElementById('radar-overlay').style.display = 'block';
    if (window.SF3D) {
      SF3D.setLaunchPhase(false);
      SF3D.showCockpit(true);
    }

    // Audio setup
    if (window.SFAudio) {
      SFAudio.stopBayAmbience();
      SFAudio.startCockpitHum();
      SFAudio.startThrustRumble();
    }
    if (window.SFMusic) {
      SFMusic.setSection('exploration');
      SFMusic.setIntensity(0.3);
    }

    // Enter immersive
    if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();

    // Spawn some target dummies far from base
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 / 3) * i;
      const r = 800;
      const dummy = new Entity('enemy', Math.cos(angle) * r, 0, -1500 + Math.sin(angle) * r);
      dummy.hull = 50;
      dummy.maxSpeed = 0; // stationary targets
      dummy.velocity.set(0, 0, 0);
      dummy._practiceTarget = true;
      state.entities.push(dummy);
    }

    {
      const s = _snap();
      const waveLine = state.wave > 1 ? ` Wave ${state.wave} is standing by — ${s.totalHostile > 0 ? s.totalHostile + ' contacts on scope' : 'sector quiet'}.` : '';
      if (window.SFAnnouncer) SFAnnouncer.onPracticeStart();
      else addComm(_crew('command'), `${_cs()}, practice range active. Targets deployed. Press Escape when ready.`, 'base');
    }

    // ── Practice Input Wireframe + Command Chart overlay ──
    _showPracticeInputOverlay();

    // Show exit-practice overlay instruction
    let exitHint = document.getElementById('practice-exit-hint');
    if (!exitHint) {
      exitHint = document.createElement('div');
      exitHint.id = 'practice-exit-hint';
      exitHint.style.cssText = 'position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:65;padding:8px 24px;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.7);color:#ffd24a;border:1px solid rgba(255,210,74,0.3);border-radius:4px;pointer-events:none;text-align:center';
      exitHint.innerHTML = 'PRACTICE MODE — Press <b>Escape</b> or <b>Pause</b> to end practice and launch mission';
      document.body.appendChild(exitHint);
    }
    exitHint.style.display = 'block';

    // Listen for Escape to exit practice
    function _onPracticeEscape(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', _onPracticeEscape);
        _endPracticeMode();
      }
    }
    document.addEventListener('keydown', _onPracticeEscape);
    state._practiceEscapeHandler = _onPracticeEscape;
  }

  // ── Practice Input Wireframe: live-highlighted mouse + keyboard ──
  function _showPracticeInputOverlay() {
    let el = document.getElementById('practice-input-overlay');
    if (el) { el.style.display = 'flex'; return; }

    el = document.createElement('div');
    el.id = 'practice-input-overlay';
    el.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:60;display:flex;gap:20px;pointer-events:none;opacity:0.85';

    // -- SVG wireframe with ID'd keys for highlighting --
    el.innerHTML = `
            <div style="background:rgba(0,8,16,0.75);border:1px solid rgba(0,200,255,0.2);border-radius:6px;padding:14px 18px">
                <div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#446688;text-align:center;margin-bottom:8px">INPUT ACTIVE</div>
                <svg width="280" height="160" viewBox="0 0 280 160" xmlns="http://www.w3.org/2000/svg" style="display:block">
                    <!-- Mouse body -->
                    <rect x="195" y="8" width="50" height="72" rx="14" fill="rgba(0,255,255,0.04)" stroke="rgba(0,255,255,0.4)" stroke-width="0.8"/>
                    <line x1="220" y1="8" x2="220" y2="38" stroke="rgba(0,255,255,0.3)" stroke-width="0.5"/>
                    <rect id="pk-lmb" x="196" y="9" width="23" height="28" rx="8" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <rect id="pk-rmb" x="221" y="9" width="23" height="28" rx="8" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <rect id="pk-scroll" x="215" y="38" width="10" height="14" rx="5" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="207" y="25" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">FIRE</text>
                    <text x="233" y="25" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">TORP</text>
                    <text x="220" y="48" font-family="monospace" font-size="5" fill="#0ff" text-anchor="middle">THR</text>
                    <text x="220" y="70" font-family="monospace" font-size="6" fill="#88aacc" text-anchor="middle">STEER</text>
                    <!-- Mouse move indicator -->
                    <circle id="pk-mouse-move" cx="220" cy="94" r="8" fill="none" stroke="rgba(0,255,255,0.25)" stroke-width="0.6"/>
                    <circle cx="220" cy="94" r="2" fill="rgba(0,255,255,0.3)"/>
                    <text x="220" y="112" font-family="monospace" font-size="5" fill="#556677" text-anchor="middle">MOVE TO AIM</text>

                    <!-- Keyboard section -->
                    <rect x="6" y="6" width="170" height="80" rx="5" fill="rgba(0,255,255,0.03)" stroke="rgba(0,255,255,0.3)" stroke-width="0.8"/>
                    <!-- WASD -->
                    <rect id="pk-w" x="42" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="53" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">W</text>
                    <rect id="pk-a" x="16" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="27" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">A</text>
                    <rect id="pk-s" x="42" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="53" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">S</text>
                    <rect id="pk-d" x="68" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="79" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">D</text>
                    <!-- QE -->
                    <rect id="pk-q" x="16" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="27" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">Q</text>
                    <rect id="pk-e" x="68" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="79" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">E</text>
                    <!-- Shift -->
                    <rect id="pk-shift" x="16" y="58" width="40" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="36" y="70" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">SHIFT</text>
                    <!-- Space -->
                    <rect id="pk-space" x="62" y="58" width="70" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="97" y="70" font-family="monospace" font-size="7" fill="#0ff" text-anchor="middle">SPACE</text>
                    <!-- F V T -->
                    <rect id="pk-f" x="96" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="107" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">F</text>
                    <rect id="pk-v" x="96" y="36" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="107" y="48" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">V</text>
                    <rect id="pk-t" x="122" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="133" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">T</text>
                    <!-- R -->
                    <rect id="pk-r" x="148" y="14" width="22" height="18" rx="3" fill="rgba(0,255,255,0.06)" stroke="rgba(0,255,255,0.4)" stroke-width="0.6"/>
                    <text x="159" y="26" font-family="monospace" font-size="9" fill="#0ff" text-anchor="middle">R</text>

                    <!-- Labels row -->
                    <text x="8" y="100" font-family="monospace" font-size="6" fill="#88aacc">W/S Throttle</text>
                    <text x="8" y="110" font-family="monospace" font-size="6" fill="#88aacc">A/D Strafe</text>
                    <text x="8" y="120" font-family="monospace" font-size="6" fill="#88aacc">Q/E Roll</text>
                    <text x="100" y="100" font-family="monospace" font-size="6" fill="#88aacc">SHIFT Afterburner</text>
                    <text x="100" y="110" font-family="monospace" font-size="6" fill="#88aacc">F Boost  V FlightAssist</text>
                    <text x="100" y="120" font-family="monospace" font-size="6" fill="#88aacc">T Lock Target  R RTB</text>
                    <text x="8" y="135" font-family="monospace" font-size="6" fill="#ffd24a">SCROLL = Throttle</text>
                    <text x="8" y="145" font-family="monospace" font-size="6" fill="#ffd24a">L-CLICK / SPACE = Lasers</text>
                    <text x="8" y="155" font-family="monospace" font-size="6" fill="#ffd24a">R-CLICK = Torpedo</text>
                </svg>
            </div>
            <div style="background:rgba(0,8,16,0.75);border:1px solid rgba(0,200,255,0.2);border-radius:6px;padding:14px 16px;min-width:160px">
                <div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:#446688;text-align:center;margin-bottom:10px">COMMANDS</div>
                <table style="font-family:monospace;font-size:10px;color:#99bbcc;border-collapse:collapse;width:100%">
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Mouse</td><td>Steer ship</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Scroll</td><td>Throttle ±</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">L-Click</td><td>Fire lasers</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">R-Click</td><td>Fire torpedo</td></tr>
                    <tr style="height:6px"><td></td><td></td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">W / S</td><td>Throttle up/down</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">A / D</td><td>Strafe left/right</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Q / E</td><td>Roll left/right</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Shift</td><td>Afterburner</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">F</td><td>Boost burst</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">V</td><td>Flight assist</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">T</td><td>Lock target</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">R</td><td>Return to base</td></tr>
                    <tr><td style="color:#0ff;padding:2px 8px 2px 0">Space</td><td>Fire lasers</td></tr>
                    <tr style="height:6px"><td></td><td></td></tr>
                    <tr><td style="color:#ffd24a;padding:2px 8px 2px 0">Esc</td><td style="color:#ffd24a">End practice</td></tr>
                </table>
            </div>`;
    document.body.appendChild(el);

    // ── Live key highlighting system ──
    const keyMap = {
      'KeyW': 'pk-w', 'KeyS': 'pk-s', 'KeyA': 'pk-a', 'KeyD': 'pk-d',
      'KeyQ': 'pk-q', 'KeyE': 'pk-e', 'KeyF': 'pk-f', 'KeyV': 'pk-v',
      'KeyT': 'pk-t', 'KeyR': 'pk-r',
      'ShiftLeft': 'pk-shift', 'ShiftRight': 'pk-shift',
      'Space': 'pk-space'
    };
    const activeColor = 'rgba(0,255,255,0.5)';
    const activeStroke = 'rgba(0,255,255,1)';
    const idleColor = 'rgba(0,255,255,0.06)';
    const idleStroke = 'rgba(0,255,255,0.4)';

    function _hlKey(e) {
      const id = keyMap[e.code];
      if (!id) return;
      const rect = document.getElementById(id);
      if (rect) { rect.setAttribute('fill', activeColor); rect.setAttribute('stroke', activeStroke); }
    }
    function _unhlKey(e) {
      const id = keyMap[e.code];
      if (!id) return;
      const rect = document.getElementById(id);
      if (rect) { rect.setAttribute('fill', idleColor); rect.setAttribute('stroke', idleStroke); }
    }
    function _hlMouse(e) {
      const id = e.button === 0 ? 'pk-lmb' : e.button === 2 ? 'pk-rmb' : null;
      if (!id) return;
      const rect = document.getElementById(id);
      if (rect) { rect.setAttribute('fill', activeColor); rect.setAttribute('stroke', activeStroke); }
    }
    function _unhlMouse(e) {
      const id = e.button === 0 ? 'pk-lmb' : e.button === 2 ? 'pk-rmb' : null;
      if (!id) return;
      const rect = document.getElementById(id);
      if (rect) { rect.setAttribute('fill', idleColor); rect.setAttribute('stroke', idleStroke); }
    }
    function _hlScroll() {
      const rect = document.getElementById('pk-scroll');
      if (rect) {
        rect.setAttribute('fill', activeColor);
        rect.setAttribute('stroke', activeStroke);
        clearTimeout(rect._scrollTimeout);
        rect._scrollTimeout = setTimeout(() => {
          rect.setAttribute('fill', idleColor);
          rect.setAttribute('stroke', idleStroke);
        }, 200);
      }
    }
    function _hlMouseMove() {
      const c = document.getElementById('pk-mouse-move');
      if (c) {
        c.setAttribute('stroke', 'rgba(0,255,255,0.8)');
        c.setAttribute('stroke-width', '1.5');
        clearTimeout(c._moveTimeout);
        c._moveTimeout = setTimeout(() => {
          c.setAttribute('stroke', 'rgba(0,255,255,0.25)');
          c.setAttribute('stroke-width', '0.6');
        }, 150);
      }
    }

    document.addEventListener('keydown', _hlKey);
    document.addEventListener('keyup', _unhlKey);
    document.addEventListener('mousedown', _hlMouse);
    document.addEventListener('mouseup', _unhlMouse);
    document.addEventListener('wheel', _hlScroll);
    document.addEventListener('mousemove', _hlMouseMove);

    // Store handlers for cleanup
    state._practiceInputHandlers = { _hlKey, _unhlKey, _hlMouse, _unhlMouse, _hlScroll, _hlMouseMove };
  }

  function _hidePracticeInputOverlay() {
    const el = document.getElementById('practice-input-overlay');
    if (el) el.style.display = 'none';
    if (state._practiceInputHandlers) {
      const h = state._practiceInputHandlers;
      document.removeEventListener('keydown', h._hlKey);
      document.removeEventListener('keyup', h._unhlKey);
      document.removeEventListener('mousedown', h._hlMouse);
      document.removeEventListener('mouseup', h._unhlMouse);
      document.removeEventListener('wheel', h._hlScroll);
      document.removeEventListener('mousemove', h._hlMouseMove);
      state._practiceInputHandlers = null;
    }
  }

  function _endPracticeMode() {
    state._practiceMode = false;
    _hidePracticeInputOverlay();
    const hint = document.getElementById('practice-exit-hint');
    if (hint) hint.style.display = 'none';
    if (state._practiceEscapeHandler) {
      document.removeEventListener('keydown', state._practiceEscapeHandler);
      state._practiceEscapeHandler = null;
    }
    // Remove practice targets
    state.entities = state.entities.filter(e => !e._practiceTarget);
    // Reset player to bay for proper launch
    state.phase = 'bay-ready';
    if (window.SF3D) SF3D.setLaunchPhase(true);
    document.getElementById('gameplay-hud').style.display = 'none';
    document.getElementById('radar-overlay').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('countdown-display').style.display = 'block';
    document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — PREPARING</span>';
    if (window.SFAudio) {
      SFAudio.stopCockpitHum && SFAudio.stopCockpitHum();
      SFAudio.stopThrustRumble && SFAudio.stopThrustRumble();
      SFAudio.startBayAmbience();
    }
    if (window.SFAnnouncer) SFAnnouncer.onPracticeEnd();
    else addComm(_crew('deck'), `${_cs()}, practice complete. Preparing for combat launch.`, 'base');
    setTimeout(() => {
      if (window.SFInput && SFInput.enterImmersive) SFInput.enterImmersive();
      _beginLaunchSequence();
    }, 2000);
  }

  // ── Re-open tutorial from button (any time) ──
  function openTutorial() {
    const wasPaused = state.paused;
    if (!wasPaused && state.running) _setPaused(true);
    _startTutorial();
    // Patch: when tutorial overlay dismissed, resume if we auto-paused
    const _origBeginLaunch = _beginLaunchSequence;
  }

  function _beginLaunchSequence() {
    const fullBriefing = !state._briefingShownOnce;

    state.phase = 'launching';
    state.launchTimer = 0;
    // Shorter launch — get to the action fast
    state.launchDuration = fullBriefing ? 11.0 : 8.0;

    // Klaxon on launch commit
    if (window.SFAudio) {
      SFAudio.playSound('klaxon');
    }

    // GDD §3: Fanfare on launch — triumphant brass + timpani
    if (window.SFMusic) {
      SFMusic.setSection('opening-theme');
      SFMusic.setIntensity(0.72);
      SFMusic.triggerFanfare();
    }

    // Auto-deploy mission briefing panel (first time only — with backstory)
    if (!state._briefingShownOnce) {
      state._briefingShownOnce = true;
    }

    // Show skip button
    let skipBtn = document.getElementById('skip-launch-btn');
    if (!skipBtn) {
      skipBtn = document.createElement('button');
      skipBtn.id = 'skip-launch-btn';
      skipBtn.innerText = 'SKIP \u25B6\u25B6';
      skipBtn.style.cssText = 'position:absolute;bottom:32px;right:32px;z-index:65;padding:8px 18px;font-family:monospace;font-size:13px;background:rgba(0,255,255,0.1);color:#0ff;border:1px solid rgba(0,255,255,0.3);border-radius:4px;cursor:pointer;pointer-events:auto;transition:background 0.2s';
      skipBtn.onmouseenter = () => skipBtn.style.background = 'rgba(0,255,255,0.25)';
      skipBtn.onmouseleave = () => skipBtn.style.background = 'rgba(0,255,255,0.1)';
      skipBtn.onclick = () => {
        state.launchTimer = state.launchDuration; // Jump to end
      };
      document.body.appendChild(skipBtn);
    }
    skipBtn.style.display = 'block';

    // Autonomous announcer — crew observe game state and report
    if (window.SFAnnouncer) SFAnnouncer.onLaunchStart();
    else addComm(_crew('deck'), `${_cs()}, launching. Wave ${state.wave}.`, 'base');

    // Adaptive briefing (text ticker only — no bot TTS)
    _queueAdaptiveLaunchBriefing();
  }

  function completeLaunch() {
    // ── Cutscene ends: hand off to combat as a separate entity ──
    state.phase = 'combat';
    if (!state.missionStats.startTime) state.missionStats.startTime = performance.now();
    state._replacementVariant = '';
    state._replacementBriefing = '';

    // Close any open console panels on launch
    const missionPanel = document.getElementById('mission-panel');
    const tutorialPanel = document.getElementById('tutorial-panel');
    if (missionPanel) missionPanel.classList.remove('open');
    if (tutorialPanel) tutorialPanel.classList.remove('open');
    const btnMission = document.getElementById('btn-mission');
    const btnTutorial = document.getElementById('btn-tutorial');
    if (btnMission) btnMission.classList.remove('active');
    if (btnTutorial) btnTutorial.classList.remove('active');

    // Auto-close old panel on launch
    if (window.SFInput) SFInput.togglePanel(false);

    // Audio transition: bay silence → vacuum cockpit hum + engine systems
    if (window.SFAudio) {
      SFAudio.stopBayAmbience();
      SFAudio.startCockpitHum();
      SFAudio.startThrustRumble();
      SFAudio.startStrafeHiss();
    }

    // Music: combat cruise intensity
    if (window.SFMusic) {
      SFMusic.setSection('heat-of-battle');
      SFMusic.setIntensity(0.58);
    }

    // Place player at combat starting position: safely outside baseship, facing away
    const launchDir = new THREE.Vector3(0, 0, -1); // default launch direction
    const combatStartPos = state.baseship.position.clone().add(launchDir.clone().multiplyScalar(800));
    state.player.position.copy(combatStartPos);
    state.player.quaternion.set(0, 0, 0, 1); // facing -Z (away from baseship)

    // Carry launch momentum into combat
    const entrySpeed = dim('timing.entrySpeed');
    state.player.throttle = 0.5;
    state.player.velocity.copy(launchDir.clone().multiplyScalar(entrySpeed));

    // Reset rotational inputs
    state.player.pitch = 0;
    state.player.yaw = 0;
    state.player.roll = 0;

    // Clear cutscene camera state
    state.cutsceneCamPos = null;
    state.cutsceneCamQuat = null;
    state.cutsceneVelocity = null;

    document.getElementById('countdown-display').style.display = 'none';
    document.getElementById('launch-prompt').style.display = 'none';
    document.getElementById('launch-overlay').style.display = 'none';
    document.getElementById('ship-panel').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('gameplay-hud').style.display = 'block';
    document.getElementById('radar-overlay').style.display = 'block';
    if (window.SF3D) {
      SF3D.setLaunchPhase(false); // End launch phase - show baseship
      SF3D.removeLaunchBay();
      SF3D.showCockpit(true); // Show 3D cockpit
    }

    // Spawn enemies BEFORE announcement so announcer sees them on scope
    spawnWave();

    if (window.SFAnnouncer) SFAnnouncer.onLaunchClear();
    else { const s = _snap(); addComm(_crew('deck'), `${_cs()}, clear of bay. ${s.totalHostile} contacts on scope.`, 'base'); }
  }

  function completeLanding() {
    state.phase = 'docking';
    const prevWave = state.wave;
    state.wave++;
    state.player.torpedoes = dim('player.torpedoes');

    // GDD §9.3: Shield restores, hull carries, fuel replenished
    state.player.shields = dim('player.shields');
    state.player.fuel = dim('player.fuel');
    state.player.boostCooldown = 0;
    state.player.boostActive = false;

    // ── Purge any attached organisms on landing (baseship decontamination) ──
    let purgedOrganisms = false;
    const ents = state.entities;
    for (let i = 0, len = ents.length; i < len; i++) {
      const e = ents[i];
      if (e.type === 'youngling' && e._attachTarget === state.player) {
        e.markedForDeletion = true;
        if (M) M.remove(e.id);
        purgedOrganisms = true;
      }
    }
    if (purgedOrganisms) {
      SFAnnouncer.onDecontamination();
      if (window.SFAudio) SFAudio.playSound('comm_beep');
    }
    state._emergencyRTB = false; // reset emergency state
    const rtbBtn = document.getElementById('btn-rtb');
    if (rtbBtn) rtbBtn.style.display = 'none';

    // Wave debrief display
    const countdownDisplay = document.getElementById('countdown-display');
    countdownDisplay.style.display = 'block';
    countdownDisplay.style.fontSize = '1.8em';
    countdownDisplay.style.color = '#00ff88';
    // ── Progression: award wave-complete XP ──
    if (window.SFProgression) {
      SFProgression.awardEvent('wave_complete');
      // Check for no-damage bonus
      if (state.missionStats.damageTaken === 0) SFProgression.awardEvent('wave_no_damage');
    }

    // Build upgrade shop HTML for between-wave screen
    let shopHTML = '';
    if (window.SFProgression) {
      const upgrades = SFProgression.getPurchasableUpgrades();
      const cr = SFProgression.career().credits;
      if (upgrades.length > 0) {
        shopHTML = '<div style="margin-top:8px;font-size:0.4em;color:#88ccee;letter-spacing:1px;">UPGRADE BAY</div>';
        shopHTML += '<div style="font-size:0.35em;color:#556;margin-bottom:6px;">Credits: ₡' + cr + '</div>';
        shopHTML += '<div id="upgrade-shop" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:600px;margin:0 auto;">';
        for (const u of upgrades.slice(0, 6)) { // max 6 shown
          const canAfford = cr >= u.cost;
          shopHTML += '<div onclick="window._sfBuyUpgrade && window._sfBuyUpgrade(\'' + u.id + '\')" '
            + 'style="cursor:' + (canAfford ? 'pointer' : 'not-allowed') + ';padding:6px 10px;background:rgba(0,20,40,' + (canAfford ? '0.85' : '0.5') + ');border:1px solid ' + (canAfford ? 'rgba(0,255,255,0.3)' : 'rgba(100,100,100,0.3)') + ';border-radius:4px;font-size:0.4em;text-align:left;min-width:120px;">'
            + '<div style="color:' + (canAfford ? '#0ff' : '#556') + ';font-weight:bold;">' + u.name + '</div>'
            + '<div style="color:#88aacc;font-size:0.9em;">' + u.desc + '</div>'
            + '<div style="color:' + (canAfford ? '#ffaa00' : '#664433') + ';margin-top:3px;">₡' + u.cost + '</div>'
            + '</div>';
        }
        shopHTML += '</div>';
      }
    }

    const _prevUnlocked = _getUnlockedWeaponCount(prevWave);
    const _newUnlocked = _getUnlockedWeaponCount(state.wave);
    const _wepNames = ['LASER CANNON', 'SPREAD SHOT', 'PROTON TORPEDO', 'EMP PULSE'];
    const _unlockBanner = _newUnlocked > _prevUnlocked
      ? `<div style="font-size:0.38em;color:#ffdd00;margin:6px 0 3px;text-shadow:0 0 10px #ff8800;">⬡ NEW WEAPON UNLOCKED: ${_wepNames[_newUnlocked - 1]} ⬡<br><span style="color:#aaccdd;font-size:0.9em;">Cycle weapons with [T]</span></div>`
      : '';
    countdownDisplay.innerHTML = `WAVE ${prevWave} COMPLETE<br>` +
      `<span style="font-size:0.5em;color:#88ccff">` +
      `Kills: ${state.kills} | Score: ${state.score}<br>` +
      `Hull: ${Math.floor(state.player.hull)}% | Base Hull: ${Math.floor((state.baseship.hull / dim('baseship.hull')) * 100)}%` +
      `</span><br>` +
      _unlockBanner +
      shopHTML +
      `<span style="font-size:0.45em;color:#ffaa00">Rearming... Wave ${state.wave} launching in 8s</span>`;

    // PA debrief
    SFAnnouncer.onWaveComplete(prevWave);

    // GDD §9.3: Music intensity drops to ambient, rebuilds next wave
    if (window.SFMusic) {
      SFMusic.setSection('closing-theme');
      SFMusic.setIntensity(0.1);
    }

    if (state.wave >= 2) {
      setTimeout(() => {
        SFAnnouncer.onNextWaveIntel();
      }, 3000);
    }

    // GDD §9.3: 8s docked, then show launch button for next wave
    setTimeout(() => {
      state.player.position.set(0, -32, 50);
      state.player.velocity.set(0, 0, 0);
      state.player.quaternion.set(0, 0, 0, 1);
      state.player.throttle = 0;
      state.player.pitch = 0;
      state.player.yaw = 0;
      state.player.roll = 0;
      state.phase = 'bay-ready';  // Wait for player to push launch button again
      if (window.SFMusic) SFMusic.setSection('launch-bay');
      state.launchTimer = 0;
      state._launchAudioPlayed = false;
      state._launchBlastPlayed = false;
      state._paBriefingDone = false;
      state.cutsceneCamPos = null;
      state.cutsceneCamQuat = null;
      state.cutsceneVelocity = null;
      state.player.hull = Math.min(dim('player.hull'), state.player.hull + 25); // partial hull repair

      // Resupply baseship if damaged
      state.baseship.hull = Math.min(dim('baseship.hull'), state.baseship.hull + dim('baseship.repairHull'));
      state.baseship.shields = Math.min(dim('baseship.shields'), state.baseship.shields + dim('baseship.repairShields'));

      // Audio transition back to bay
      if (window.SFAudio) {
        SFAudio.stopCockpitHum();
        SFAudio.stopThrustRumble();
        SFAudio.stopStrafeHiss();
        SFAudio.startBayAmbience();
      }

      // Setup for next launch
      if (window.SF3D) {
        SF3D.setLaunchPhase(true);
        SF3D.showLaunchBay();
      }

      // Show red launch button for next wave
      const launchBtn = document.getElementById('launch-btn');
      if (launchBtn) launchBtn.style.display = 'block';
      document.getElementById('countdown-display').style.display = 'block';
      document.getElementById('countdown-display').innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';

      SFAnnouncer.onBayReady();

      document.getElementById('ship-panel').style.display = 'none';
      document.getElementById('gameplay-hud').style.display = 'none';
      document.getElementById('crosshair').style.display = 'none';
    }, 8000);
  }

  const MANIFOLD_ARCHETYPES = {
    enemy: { x: 1.1, y: 1.25, waveX: 0.08, waveY: 0.14, hullBase: 30, hullWave: 5, hullField: 4, speedBase: 160, speedWave: 10, speedField: 10, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
    interceptor: { x: 1.45, y: 1.7, waveX: 0.1, waveY: 0.16, hullBase: 60, hullWave: 8, hullField: 6, speedBase: 320, speedWave: 15, speedField: 15, shieldsBase: 30, shieldsWave: 5, shieldsField: 5 },
    bomber: { x: 1.7, y: 1.2, waveX: 0.12, waveY: 0.11, hullBase: 80, hullWave: 10, hullField: 8, speedBase: 100, speedWave: 6, speedField: 6, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
    predator: { x: 2.2, y: 1.9, waveX: 0.1, waveY: 0.12, hullBase: 500, hullWave: 60, hullField: 20, speedBase: 280, speedWave: 10, speedField: 12, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
    dreadnought: { x: 3.6, y: 2.8, waveX: 0.08, waveY: 0.1, hullBase: 2000, hullWave: 200, hullField: 60, speedBase: 30, speedWave: 2, speedField: 3, shieldsBase: 1000, shieldsWave: 100, shieldsField: 40 },
    'alien-baseship': { x: 3.1, y: 2.4, waveX: 0.09, waveY: 0.11, hullBase: 1000, hullWave: 500, hullField: 80, speedBase: 40, speedWave: 3, speedField: 5, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
    wingman: { x: 1.05, y: 1.1, waveX: 0.06, waveY: 0.09, hullBase: 60, hullWave: 5, hullField: 3, speedBase: 180, speedWave: 6, speedField: 8, shieldsBase: 0, shieldsWave: 0, shieldsField: 0 },
  };

  function deriveCombatProfile(type, wave, opts) {
    const arch = MANIFOLD_ARCHETYPES[type] || MANIFOLD_ARCHETYPES.enemy;
    const o = opts || {};
    const x = arch.x + wave * arch.waveX;
    const y = arch.y + wave * arch.waveY;
    const z = x * y * y;  // z = xy² — manifold projection

    const fieldRaw = (M && M.diamond) ? M.diamond(x * 420, y * 420, z * 420) : Math.sin(z);
    const field = Math.min(1, Math.max(0, Math.abs(fieldRaw)));
    const gradRaw = (M && M.diamondGrad) ? M.diamondGrad(x * 420, y * 420, z * 420) : { x: y, y: x, z: 1 };
    const gradMag = Math.sqrt(gradRaw.x * gradRaw.x + gradRaw.y * gradRaw.y + gradRaw.z * gradRaw.z);

    const trainingScale = o.training ? 0.45 : 1.0;
    const hull = Math.max(1, Math.round((arch.hullBase + (wave * arch.hullWave) + (field * arch.hullField)) * trainingScale));
    const maxSpeed = Math.max(10, Math.round((arch.speedBase + (wave * arch.speedWave) + (Math.min(1.5, gradMag * 0.02) * arch.speedField)) * (o.speedScale || 1)));
    const shields = Math.max(0, Math.round((arch.shieldsBase + (wave * arch.shieldsWave) + (field * arch.shieldsField)) * trainingScale));

    return {
      hull,
      maxSpeed,
      shields,
      trace: {
        type,
        wave,
        lens: 'deriveCombatProfile',
        coords: { x, y, z },
        field,
        gradMag,
        training: !!o.training,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // LEVEL / WEAPON PROGRESSION HELPERS
  // ══════════════════════════════════════════════════════════════

  // Returns number of weapon slots unlocked at a given wave/level:
  //   Level 1 (wave 1): LASER only
  //   Level 2 (wave 2): + SPREAD SHOT
  //   Level 3 (wave 3): + PROTON TORPEDO (can now attack enemy base ships)
  //   Level 4 (wave 4+): + EMP PULSE
  function _getUnlockedWeaponCount(wave) {
    if (wave >= 4) return 4;  // All: LASER, SPREAD, TORP, EMP
    if (wave >= 3) return 3;  // LASER, SPREAD, TORP
    if (wave >= 2) return 2;  // LASER, SPREAD
    return 1;                 // LASER only
  }

  // Enemy base fire cooldown (seconds) — decreases each wave for escalating difficulty
  // Wave 1: very slow (3.5s) → Wave 6+: fast (0.75s)
  function _levelFireCooldown(wave) {
    return Math.max(0.75, 3.5 - (wave - 1) * 0.55);
  }

  // Spawn a tight cluster of enemies around a world-space center point.
  // Enemies share a clusterId so radar / wingman comms can reference them.
  function _spawnCluster(clusterId, clusterLabel, cx, cy, cz, enemyType, count, wave, opts) {
    state.clusters.push({ id: clusterId, label: clusterLabel, center: { x: cx, y: cy, z: cz }, total: count, alive: count });
    const spread = 350; // formation spread radius
    for (let i = 0; i < count; i++) {
      const ax = cx + (Math.random() - 0.5) * spread * 2;
      const ay = cy + (Math.random() - 0.5) * spread * 0.6;
      const az = cz + (Math.random() - 0.5) * spread * 2;
      const e = new Entity(enemyType, ax, ay, az);
      const profile = deriveCombatProfile(enemyType, wave, opts || {});
      e.hull = profile.hull;
      e.maxSpeed = profile.maxSpeed;
      e.shields = profile.shields || 0;
      e._manifoldDerivation = profile.trace;
      e._clusterId = clusterId;
      // Per-level fire rate (harder each wave)
      e._fireCooldownBase = _levelFireCooldown(wave);
      // Wave 2+: interceptors always spread-fire, drones 50% chance
      e._useSpread = wave >= 2 && (enemyType === 'interceptor' || Math.random() > 0.5);
      // Type-specific setup
      if (enemyType === 'interceptor') {
        e.radius = dim('entity.interceptor.radius');
      } else if (enemyType === 'bomber') {
        e.radius = dim('entity.bomber.radius');
        e._bombCooldown = 0;
        e._bombInterval = dim('enemy.bomber.bombInterval');
      }
      state.entities.push(e);
    }
  }

  // Enemy spread shot — 3-round fan fired by wave 2+ enemies alongside their laser
  function _fireEnemySpread(entity) {
    if (_countType('laser') + 3 >= dim('cap.lasers')) return;
    for (let s = 0; s < 3; s++) {
      const rx = (Math.random() - 0.5) * 0.18;
      const ry = (Math.random() - 0.5) * 0.18;
      _q1.setFromEuler(new THREE.Euler(rx, ry, 0));
      _v1.set(0, 0, -8).applyQuaternion(entity.quaternion);
      const l = new Entity('laser',
        entity.position.x + _v1.x,
        entity.position.y + _v1.y,
        entity.position.z + _v1.z);
      l.quaternion.copy(entity.quaternion).multiply(_q1);
      _v1.set(0, 0, -dim('weapon.laser.speed') * 0.85).applyQuaternion(l.quaternion);
      l.velocity.copy(_v1);
      l.owner = 'enemy';
      l.radius = dim('weapon.laser.radius');
      l.maxAge = dim('weapon.laser.maxAge') || 2;
      l._spawnTime = state.elapsed;
      l.damage = Math.round(dim('weapon.laser.damage') * 0.55); // reduced per-pellet, compensated by volume
      state.entities.push(l);
      if (window.SF3D) SF3D.spawnLaser(l);
    }
    if (window.SFAudio) SFAudio.playSound('laser');
  }

  // ── Wingman cluster bearing callout ──
  // Announces closest active cluster bearing, range, and bogey count.
  function _wingmanClusterComm() {
    if (!state.player || state.phase !== 'combat') return;
    const activeClusters = state.clusters.filter(cl => cl.alive > 0);
    if (activeClusters.length === 0) return;
    const p = state.player.position;
    let best = activeClusters[0];
    let bestDist = Infinity;
    for (const cl of activeClusters) {
      const d = Math.hypot(cl.center.x - p.x, cl.center.y - p.y, cl.center.z - p.z);
      if (d < bestDist) { bestDist = d; best = cl; }
    }
    const bearing = Math.round(((Math.atan2(best.center.x - p.x, -(best.center.z - p.z)) * 180 / Math.PI) + 360) % 360);
    const rangePretty = Math.round(bestDist / 100) * 100;
    const others = activeClusters.length - 1;
    const tail = others > 0 ? ` ${others} other cluster${others > 1 ? 's' : ''} active.` : ' Last cluster — finish them.';
    const wingmen = state.entities.filter(e => e.type === 'wingman' && !e.markedForDeletion);
    const caller = wingmen.length > 0 ? (wingmen[0].callsign || 'Alpha-2') : 'Alpha-2';
    addComm(caller, `Cluster ${best.label} — bearing ${bearing}°, range ${rangePretty}. ${best.alive} bogey${best.alive !== 1 ? 's' : ''}.${tail}`, 'info');
    _updateClusterHUD();
  }

  // Initial cluster announcement at wave start (fires after launch delay)
  function _clusterStartComm() {
    setTimeout(() => {
      if (state.clusters.length === 0) return;
      const names = state.clusters.map(cl => cl.label).join(', ');
      const total = state.clusters.reduce((s, cl) => s + cl.total, 0);
      addComm(_crew('tactical'), `${state.clusters.length} enemy cluster${state.clusters.length > 1 ? 's' : ''} on scope: ${names}. ${total} hostiles total. Engage at will.`, 'warning');
      _updateClusterHUD();
      // Immediately give first bearing call
      state._clusterCallTimer = 3;
    }, 4500);
  }

  // Render active cluster status below radar — shows label + remaining bogeys as dots
  function _updateClusterHUD() {
    let el = document.getElementById('cluster-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cluster-status';
      el.style.cssText = 'position:fixed;bottom:155px;right:14px;z-index:200;pointer-events:none;font-family:monospace;font-size:10px;text-align:right;line-height:1.5;';
      document.body.appendChild(el);
    }
    const active = state.clusters.filter(cl => cl.alive > 0);
    if (active.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="color:#556;letter-spacing:1px;margin-bottom:2px;">CLUSTERS</div>' +
      active.map(cl => {
        const alive = '●'.repeat(cl.alive);
        const dead = '<span style="color:#333">' + '○'.repeat(Math.max(0, cl.total - cl.alive)) + '</span>';
        return `<div style="color:#0ff;">${cl.label} <span style="letter-spacing:2px;">${alive}${dead}</span></div>`;
      }).join('');
  }

  // ══════════════════════════════════════════════════════════════
  // CLUSTER-BASED WAVE SPAWNER
  // GDD §9.2 — waves 1-6 explicit, 7+ procedural
  // Each enemy group spawns as a tight cluster 5500-9000 units out.
  // Player is NEVER surrounded at launch — clusters spread around the arena.
  // ══════════════════════════════════════════════════════════════

  function spawnWave() {
    state.clusters = []; // clear previous cluster tracking
    let _nextId = 0;
    const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
    let _nameIdx = 0;
    const nextLabel = () => ({ id: _nextId++, label: NAMES[_nameIdx++ % NAMES.length] });

    // Helper: compute a cluster center at radial distance r, evenly spread around arena
    const clusterPos = (r, thetaBase, phiOff) => {
      const theta = thetaBase + (Math.random() - 0.5) * 0.5;
      const phi = Math.PI / 2 + (phiOff || 0) + (Math.random() - 0.5) * 0.7;
      return { x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi) };
    };

    // Shared: spawn support ships and AI wingmen (called for all waves)
    const spawnSupportAndWingmen = () => {
      _despawnSupportShips();
      if (state.wave >= 3) _spawnTanker();
      if (state.wave >= 2) _spawnMedic();
      if (state.aiWingmen) {
        const ANPC = window.SFAnpc;
        const rosterKeys = state.wave >= 5
          ? ['hotshot', 'ice', 'motherhen', 'nightshade']
          : state.wave >= 3 ? ['hotshot', 'ice', 'motherhen'] : ['hotshot', 'ice'];
        for (let i = 0; i < rosterKeys.length; i++) {
          const offset = new THREE.Vector3(
            (i === 0 ? -150 : i === 1 ? 150 : i === 2 ? 0 : -200),
            (i === 2 ? 80 : i === 3 ? -40 : 0),
            200 + Math.random() * 100
          );
          const spawnPos = state.player.position.clone().add(offset);
          const w = new Entity('wingman', spawnPos.x, spawnPos.y, spawnPos.z);
          const profile = deriveCombatProfile('wingman', state.wave);
          w.hull = profile.hull;
          w.maxSpeed = profile.maxSpeed;
          w._manifoldDerivation = profile.trace;
          const key = rosterKeys[i];
          if (ANPC) {
            const npc = ANPC.spawn(key);
            w.callsign = npc.callsign;
            w._anpc = npc;
            w._anpcKey = key;
            const pers = npc.personality;
            w.maxSpeed = Math.round(w.maxSpeed * (0.85 + pers.E * 0.3));
            w.hull = Math.round(w.hull * (0.9 + pers.C * 0.2));
          } else {
            w.callsign = ['Alpha-2', 'Alpha-3', 'Alpha-4', 'Alpha-5'][i];
          }
          w.quaternion.copy(state.player.quaternion);
          state.entities.push(w);
        }
      }
    };

    // Helper: spawn alien-baseship as a roaming objective (wave 3+: torpedoes unlock)
    const spawnAlienBaseship = () => {
      const r = 8000 + Math.random() * 3000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const ab = new Entity('alien-baseship',
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi));
      const profile = deriveCombatProfile('alien-baseship', state.wave, { speedScale: 1.0 });
      ab.hull = profile.hull;
      ab.maxSpeed = profile.maxSpeed;
      ab._manifoldDerivation = profile.trace;
      ab.radius = dim('entity.alien-baseship.radius');
      state.entities.push(ab);
    };

    // ══════════════════════════════════════════════════════════════
    // MANIFOLD-DRIVEN WAVE COMPOSITION
    // Every wave produces a unique enemy layout using z=xy² manifold math.
    // Wave tier constraints (weapon unlocks) are preserved but composition
    // within each tier is fully randomised — no two waves are alike.
    //
    // x = wave intensity  (0.14 per wave, caps near 1.0)
    // y = chaos seed      (random 0.55–1.0, rolled fresh every wave)
    // z_linear  = x*y     → proportional scaling (cluster count / base size)
    // z_asymm   = x*y²    → escalation factor (harder unit ratios, predator count)
    // ══════════════════════════════════════════════════════════════
    {
      const w = state.wave;
      const _mx = Math.min(1.2, w * 0.14);               // wave intensity
      const _my = 0.55 + Math.random() * 0.45;           // chaos seed — different every wave
      const _mzL = _mx * _my;                             // linear manifold
      const _mzA = _mx * _my * _my;                       // asymmetric manifold (escalation)

      // ── Enemy budget: total enemies this wave ──
      // Wave 1: ~4–6 enemies. Wave 4: ~18–26. Wave 8+: 36+
      const budget = Math.round(2 + w * 3.5 + _mzA * w * 5);

      // ── Cluster count: grows with wave + chaos ──
      // Wave 1: 2. Wave 2–3: 2–3. Wave 4–5: 3–4. Wave 6+: up to 6.
      const rawClusters = 2 + Math.round(_mzL * (w * 0.7));
      const clusterCount = Math.max(2, Math.min(6, rawClusters));

      // ── Enemy type availability per weapon-unlock tier ──
      const canInterceptor = w >= 2;
      const canBomber = w >= 3;

      // Type weights — manifold asymmetric factor biases toward harder types at higher waves
      const typeWeights = {
        enemy: 1.0,
        interceptor: canInterceptor ? (0.25 + _mzL * 0.45) : 0,
        bomber: canBomber ? (0.15 + _mzA * 0.35) : 0,
      };
      const tierTypes = Object.keys(typeWeights).filter(t => typeWeights[t] > 0);
      const totalTW = tierTypes.reduce((s, t) => s + typeWeights[t], 0);

      // Distance band: scales with wave but always well away from the player
      const rBase = 5500 + w * 180;
      const rSpread = 1200 + w * 240;

      // Angular base — random each wave so clusters never come from the same direction
      const baseAngle = Math.random() * Math.PI * 2;

      // ── Build cluster list ──
      let remaining = budget;
      for (let c = 0; c < clusterCount; c++) {
        const isLast = c === clusterCount - 1;
        // Per-cluster enemy count: fair share with ±40% random variation
        const fairShare = Math.round(budget / clusterCount * (0.6 + Math.random() * 0.8));
        const count = Math.max(2, Math.min(5, isLast ? remaining : Math.min(remaining - (clusterCount - c - 1), fairShare)));
        remaining = Math.max(0, remaining - count);

        // Pick type by weighted random
        let roll = Math.random() * totalTW;
        let chosenType = 'enemy';
        for (const t of tierTypes) {
          roll -= typeWeights[t];
          if (roll <= 0) { chosenType = t; break; }
        }

        // Harder types spawn further out (flanking pressure)
        const rMod = chosenType === 'bomber' ? 1.35 : chosenType === 'interceptor' ? 1.12 : 1.0;
        const r = (rBase + Math.random() * rSpread) * rMod;
        const theta = baseAngle + (Math.PI * 2 / clusterCount) * c + (Math.random() - 0.5) * 0.45;
        const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.75;
        const pos = {
          x: r * Math.sin(phi) * Math.cos(theta),
          y: r * Math.sin(phi) * Math.sin(theta),
          z: r * Math.cos(phi),
        };

        const { id, label } = nextLabel();
        const opts = w === 1 ? { training: true, speedScale: 0.82 } : {};
        _spawnCluster(id, label, pos.x, pos.y, pos.z, chosenType, count, w, opts);
      }

      // ── Solo hunters (roaming, not in clusters) ──
      // Predators: wave 4+, count driven by asymmetric manifold
      if (w >= 4) {
        const predCount = Math.min(3, 1 + Math.floor(_mzA * (w - 3) * 1.8));
        for (let i = 0; i < predCount; i++) {
          const r = 7500 + Math.random() * 3000;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);
          const pred = new Entity('predator', r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
          const pp = deriveCombatProfile('predator', w);
          pred.hull = pp.hull; pred.shields = pp.shields; pred.maxSpeed = pp.maxSpeed;
          pred._manifoldDerivation = pp.trace; pred.radius = dim('entity.predator.radius');
          pred._turnRate = 0.4; pred._plasmaTimer = 0; pred._plasmaCooldown = dim('enemy.predator.plasmaCooldown');
          pred._consumeTarget = null; pred._consuming = false; pred._consumeTimer = 0; pred._eggTimer = 8 + Math.random() * 5;
          state.entities.push(pred);
        }
      }

      // ── Alien capital ships ──
      // Alien baseship (torpedo objective): wave 3+, probability scales with manifold
      if (w >= 3) {
        const baseChance = 0.55 + _mzL * 0.4;    // 55–95% depending on manifold
        if (Math.random() < baseChance) spawnAlienBaseship();
      }

      // Dreadnought boss: wave 6+, escalating frequency
      if (w >= 6 && (w === 6 || (w - 6) % Math.max(2, Math.round(5 - _mzA * 2)) === 0)) {
        const r = 9000 + Math.random() * 3000;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const dn = new Entity('dreadnought', r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
        const dp = deriveCombatProfile('dreadnought', w - 5);
        dn.hull = dp.hull; dn.shields = dp.shields; dn.maxSpeed = dp.maxSpeed;
        dn._manifoldDerivation = dp.trace; dn.radius = dim('entity.dreadnought.radius');
        dn._turretCooldown = 0; dn._turretInterval = dim('enemy.dreadnought.turretInterval');
        dn._beamCooldown = dim('enemy.dreadnought.beamCooldown'); dn._beamCharging = false;
        state.entities.push(dn);
      }

      // Alien Hive — spawns once at wave 5 (victory objective)
      if (w === 5 && !state.alienBaseSpawned) {
        const baseDir = state.baseship ? state.baseship.position.clone().negate().normalize() : new THREE.Vector3(1, 0, 0);
        const hivePos = baseDir.multiplyScalar(15000);
        const hive = new Entity('alien-base', hivePos.x, hivePos.y + 200, hivePos.z);
        hive.hull = dim('hive.hull'); hive.maxSpeed = 0;
        hive.radius = dim('entity.alien-base.radius');
        hive.velocity.set(0, 0, 0);
        state.entities.push(hive);
        state.alienBaseSpawned = true;
        SFAnnouncer.onHiveDiscovered(hive);
      }

      spawnSupportAndWingmen();
      SFAnnouncer.onWaveStart();
      _clusterStartComm();
    }
  }

  function checkWave() {
    const enemies = state.entities.filter(e => (e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' || e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' || e.type === 'egg' || e.type === 'youngling') && !e.markedForDeletion);
    if (enemies.length === 0 && state.phase === 'combat' && !state._supportPhase) {
      SFAnnouncer.onWaveClear();

      // GDD §9.3: Music intensity drops on wave clear
      if (window.SFMusic) {
        SFMusic.setSection('exploration');
        SFMusic.setIntensity(0.2);
      }

      // Auto-route post-sortie: optional medical waypoint, then landing autopilot via _clearSupport handoff
      const p = state.player;
      const damaged = p && !p.markedForDeletion && (p.hull < 90 || p.shields < 30);
      const medicAvail = _medicEntity && !_medicEntity.markedForDeletion;
      state._supportReturnPos = state.baseship
        ? state.baseship.position.clone().add(new THREE.Vector3(0, 0, 400))
        : (p ? p.position.clone() : null);
      state._postSupportAutoLand = true;

      if (damaged && medicAvail) {
        state._supportCall = 'medic';
        state._supportTarget = _medicEntity;
        state._supportPhase = 'approach';
        state._supportDockTimer = 0;
        SFAnnouncer.onSupportAccepted('medic', _medicEntity._callsign || 'Medic');
        if (window.SFAudio) SFAudio.playSound('comm_beep');
      } else {
        _clearSupport(); // fires the auto-land handoff immediately
      }
    }
  }

  function gameOver(reason, isVictory) {
    state.running = false;
    const deathScreen = document.getElementById('death-screen');
    deathScreen.style.display = 'flex';
    document.getElementById('death-reason').innerText = reason;
    document.getElementById('gameplay-hud').style.display = 'none';
    document.getElementById('radar-overlay').style.display = 'none';

    // ── After-Action Report ──
    const ms = state.missionStats;
    ms.waveReached = state.wave;
    const elapsed = Math.floor((performance.now() - ms.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    ms.accuracy = ms.shotsFired > 0 ? Math.round((ms.shotsHit / ms.shotsFired) * 100) : 0;

    // Count surviving wingmen
    const wingmenAlive = state.entities.filter(e => e.type === 'wingman' && !e.markedForDeletion).length;
    ms.wingmenSaved = wingmenAlive;

    let aar = document.getElementById('after-action-report');
    if (!aar) {
      aar = document.createElement('div');
      aar.id = 'after-action-report';
      aar.style.cssText = 'margin-top:24px;padding:16px 24px;background:rgba(0,20,40,0.85);border:1px solid rgba(0,255,255,0.2);border-radius:6px;font-family:monospace;font-size:12px;color:#88ccee;max-width:400px;text-align:left;';
      deathScreen.appendChild(aar);
    }
    aar.innerHTML =
      '<div style="font-size:14px;color:#0ff;margin-bottom:10px;letter-spacing:2px;text-transform:uppercase;">'
      + (isVictory ? '★ MISSION COMPLETE ★' : '▸ AFTER-ACTION REPORT') + '</div>'
      + '<table style="width:100%;border-collapse:collapse;">'
      + _aarRow('Waves Survived', ms.waveReached)
      + _aarRow('Total Kills', state.kills)
      + _aarRow('Player Kills', state.playerKills)
      + _aarRow('Score', state.score.toLocaleString())
      + _aarRow('Accuracy', ms.accuracy + '%')
      + _aarRow('Shots Fired', ms.shotsFired)
      + _aarRow('Damage Dealt', Math.round(ms.damageDealt))
      + _aarRow('Damage Taken', Math.round(ms.damageTaken))
      + _aarRow('Wingmen Saved', ms.wingmenSaved + '/' + (ms.wingmenSaved + ms.wingmenLost))
      + _aarRow('Flight Time', minutes + 'm ' + seconds + 's')
      + '</table>';

    // ── Persist career stats ──
    if (window.SFProgression) {
      SFProgression.endMission({
        deaths: 1,
        waveReached: ms.waveReached,
        flightTime: elapsed,
        score: state.score,
      });
      // Show career kill tally on death screen
      const tallyHtml = SFProgression.renderKillTallyHTML();
      const rank = SFProgression.getRank();
      aar.innerHTML += '<div style="margin-top:12px;border-top:1px solid rgba(0,255,255,0.15);padding-top:8px;">'
        + '<div style="color:#ffdd44;font-size:11px;">' + rank.icon + ' ' + rank.name + ' — Career Kills: ' + SFProgression.career().totalKills + '</div>'
        + '<div style="font-size:14px;margin-top:4px;">' + tallyHtml + '</div>'
        + '</div>';
    }
  }

  function _aarRow(label, value) {
    return '<tr><td style="padding:2px 0;color:#88aacc;">' + label + '</td>'
      + '<td style="padding:2px 0;color:#0ff;text-align:right;font-weight:bold;">' + value + '</td></tr>';
  }

  // ── Respawn system: countdown overlay, then reset player into bay ──
  function _showRespawnScreen() {
    const cdEl = document.getElementById('countdown-display');
    if (cdEl) {
      cdEl.style.display = 'block';
      cdEl.style.fontSize = '3em';
      cdEl.style.color = '#ff4444';
      cdEl.style.textShadow = '0 0 16px rgba(255, 40, 40, 0.75)';
    }
    // Hide gameplay HUD during respawn countdown
    const hud = document.getElementById('gameplay-hud');
    if (hud) hud.style.opacity = '0.3';
    const cross = document.getElementById('crosshair');
    if (cross) cross.style.display = 'none';
  }

  function _updateRespawn(dt) {
    if (!state.respawning) return false;
    state.respawnTimer -= dt;

    const cdEl = document.getElementById('countdown-display');
    if (cdEl) {
      const sec = Math.max(0, Math.ceil(state.respawnTimer));
      const currentLife = Math.max(1, state.maxLives - state.livesRemaining);
      const nextLife = Math.min(state.maxLives, currentLife + 1);
      const inBriefPhase = state.respawnTimer <= 3.8;

      if (!inBriefPhase) {
        cdEl.innerHTML = `<span style="color:#ff3030">${state.respawnReason || 'HULL INTEGRITY FAIL'}</span><br>` +
          `<span style="font-size:0.44em;color:#ffaa44">SHIP DESTROYED — LIFE ${currentLife}/${state.maxLives} LOST</span><br>` +
          `<span style="font-size:0.38em;color:#ffdd99">INITIATING PILOT ${nextLife}/${state.maxLives}...</span>`;
      } else {
        cdEl.innerHTML = `<span style="color:#ff8844">${state._replacementVariant || 'Replacement frame online.'}</span><br>` +
          `<span style="font-size:0.36em;color:#aee8ff">${state._replacementBriefing || _makeDynamicBattleBrief()}</span><br>` +
          `<span style="font-size:0.34em;color:#ffdd99">LAUNCH BAY SYNC IN ${sec}s</span>`;
      }
    }

    if (state.respawnTimer <= 0) {
      state.respawning = false;
      // Recreate player (Entity constructor already calls M.place)
      state.player = new Player();
      state.player.hull = dim('player.hull');
      state.player.shields = dim('player.shields');
      state.entities.push(state.player);
      if (window.SFInput) SFInput.init(state.player);

      // Reset to launch bay
      state.phase = 'bay-ready';
      state.launchTimer = 0;
      state._launchAudioPlayed = false;
      state._launchBlastPlayed = false;
      state._paBriefingDone = false;

      if (window.SF3D) {
        SF3D.setLaunchPhase(true);
        SF3D.showLaunchBay();
        SF3D.showCockpit(true);
      }
      if (window.SFAudio) {
        SFAudio.stopCockpitHum();
        SFAudio.stopThrustRumble();
        SFAudio.stopStrafeHiss();
        SFAudio.startBayAmbience();
      }

      // Restore UI
      const hud = document.getElementById('gameplay-hud');
      if (hud) hud.style.opacity = '1';
      const cdEl2 = document.getElementById('countdown-display');
      if (cdEl2) {
        cdEl2.style.display = 'block';
        cdEl2.innerHTML = '<span style="font-size:0.35em;color:#446688">LAUNCH BAY — STANDING BY</span>';
      }
      const launchBtn = document.getElementById('launch-btn');
      if (launchBtn) launchBtn.style.display = 'block';
      document.getElementById('ship-panel').style.display = 'none';

      SFAnnouncer.onRespawnReady();
    }
    return true; // signal: still in respawn phase, skip normal game logic
  }

  function gameLoop(time) {
    if (!state.running) return;
    requestAnimationFrame(gameLoop);

    const dt = (time - state.lastTime) / 1000;
    state.lastTime = time;

    // Cap dt to prevent physics explosions on lag
    const safeDt = Math.min(dt, 0.1);

    try {

      // ── Pause gate: freeze simulation updates, keep current frame rendered ──
      if (state.paused) {
        if (window.SF3D) SF3D.render(state);
        _frameCount++;
        return;
      }

      // ── Respawn phase — countdown, render scene, skip combat ──
      if (state.respawning) {
        _updateRespawn(safeDt);
        if (window.SF3D) SF3D.render(state);
        _frameCount++;
        return;
      }

      // ── Bay Ready Phase — player is in bay, waiting to push red LAUNCH button ──
      if (state.phase === 'bay-ready') {
        // Just render the bay scene, no launch timer advancement
        if (window.SF3D) SF3D.render(state);
        _frameCount++;
        return;
      }

      // ── Launch Cutscene Phase — GDD §3: Four-phase launch ──
      if (state.phase === 'launching') {
        state.launchTimer += safeDt;
        const progress = Math.min(state.launchTimer / state.launchDuration, 1.0);

        // Initialize cutscene camera on first frame (separate from player entity)
        if (!state.cutsceneCamPos) {
          state.cutsceneCamPos = new THREE.Vector3(0, -32, 50); // hangar bay start
          state.cutsceneCamQuat = new THREE.Quaternion(); // facing -Z
          state.cutsceneVelocity = new THREE.Vector3();
        }

        const cdEl = document.getElementById('countdown-display');

        // ── Phase 1: Dock (0-64% = ~16s) — static, dim, PA narration plays, briefing panel open ──
        if (progress < 0.64) {
          cdEl.style.display = 'block';
          cdEl.innerHTML = '<span style="font-size:0.35em;color:#446688">SYSTEMS INITIALIZING</span>';
        }
        // ── Phase 2: Pre-Launch Countdown (64-80% = ~4s) — amber lights, turbine, countdown ──
        else if (progress < 0.80) {
          const preProgress = (progress - 0.64) / 0.16;
          const secondsLeft = Math.ceil(4 * (1 - preProgress));
          cdEl.style.display = 'block';
          cdEl.innerText = secondsLeft;
          cdEl.style.fontSize = '5em';
          cdEl.style.color = '#ffff00';

          // GDD §3.2: Rising turbine whine + HUD power-up sequence
          if (!state._launchAudioPlayed && window.SFAudio) {
            SFAudio.playSound('turbine_whine');
            SFAudio.playSound('hud_power_up');
            state._launchAudioPlayed = true;
          }

          // Launch call — text comm only, no bot TTS
          if (!state._paBriefingDone && preProgress > 0.85) {
            addComm(_crew('deck'), `Launch! Launch! Launch!`, 'warning');
            state._paBriefingDone = true;
          }
        }
        // ── Phase 3: Launch (80-92% = ~3s) — tube walls streak, G-force ──
        else if (progress < 0.92) {
          cdEl.style.display = 'none';
          document.getElementById('launch-prompt').style.display = 'none';
          document.getElementById('launch-overlay').style.display = 'none';

          // GDD §3.3: Launch sound at acceleration start
          if (!state._launchBlastPlayed) {
            state._launchBlastPlayed = true;
            if (window.SFAudio) {
              SFAudio.playSound('launch');
              SFAudio.playSound('clamp_release');
            }
          }

          const accelProgress = (progress - 0.80) / 0.12;
          const launchSpeed = accelProgress * accelProgress * 2400;
          _v1.set(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
          state.cutsceneCamPos.addScaledVector(_v1, launchSpeed * safeDt);
          state.cutsceneVelocity.copy(_v1).multiplyScalar(launchSpeed);
        }
        // ── Phase 4: Bay Exit (92-100% = ~2s) — burst into space ──
        else {
          cdEl.style.display = 'block';
          cdEl.innerHTML = '<span style="color:#00ffff;font-size:0.6em">CLEAR OF BAY</span>';
          cdEl.style.fontSize = '3em';

          const exitProgress = (progress - 0.92) / 0.08;
          const exitSpeed = 2400 * (1.0 - exitProgress * 0.5);
          _v1.set(0, 0, -1).applyQuaternion(state.cutsceneCamQuat);
          state.cutsceneCamPos.addScaledVector(_v1, exitSpeed * safeDt);
          state.cutsceneVelocity.copy(_v1).multiplyScalar(exitSpeed);
        }

        // Feed cutscene camera position to player for rendering only
        state.player.position.copy(state.cutsceneCamPos);
        state.player.quaternion.copy(state.cutsceneCamQuat);
        state.player.velocity.copy(state.cutsceneVelocity);

        // Update cinematic launch effects
        if (window.SF3D) {
          SF3D.updateLaunchCinematic(progress);
          SF3D.render(state);
        }

        // Cutscene complete -> hand off to combat
        if (state.launchTimer >= state.launchDuration) {
          // Hide skip button
          const skipBtn = document.getElementById('skip-launch-btn');
          if (skipBtn) skipBtn.style.display = 'none';
          completeLaunch();
        }

        // No entity updates, no collisions, no physics - pure cutscene
        return;
      }

      // ── Landing Approach Phase — GDD §9.3: Auto-pilot return ──
      if (state.phase === 'land-approach') {
        // Initialize autopilot on first frame
        if (!state.autopilotActive) {
          state.autopilotActive = false;
          state.autopilotTimer = 0;
          // Show autopilot prompt
          const cdEl = document.getElementById('countdown-display');
          cdEl.style.display = 'block';
          cdEl.innerHTML = 'WAVE CLEAR!<br><span style="font-size:0.4em;color:#00ff88">Press <b>SPACE</b> to engage autopilot<br>or fly manually to base</span>';
          cdEl.style.fontSize = '2.5em';
          cdEl.style.color = '#00ffff';
          SFAnnouncer.onWaveClear();
        }

        // Check for autopilot activation
        if (!state.autopilotActive && window.SFInput && SFInput.isKeyDown('Space')) {
          state.autopilotActive = true;
          state.autopilotTimer = 0;
          SFAnnouncer.onAutopilotEngage();
          if (window.SFAudio) SFAudio.playSound('hud_power_up');
        }

        if (state.autopilotActive) {
          // GDD §9.3: 15s autopilot — smoothly fly back to baseship
          state.autopilotTimer += safeDt;
          const apProgress = Math.min(state.autopilotTimer / 12.0, 1.0); // 12s travel, 3s dock

          // Calculate direction and distance to baseship bay entrance
          _v1.copy(state.baseship.position).add(_v2.set(0, 0, 400));
          _v2.copy(_v1).sub(state.player.position);
          const distToBase = _v2.length();

          // Smoothly turn and fly toward base
          _v2.normalize();
          _q1.setFromUnitVectors(_v1.set(0, 0, -1), _v2);
          state.player.quaternion.slerp(_q1, safeDt * 2.0);

          // Speed profile: accelerate, cruise, decelerate
          let apSpeed;
          if (apProgress < 0.2) {
            apSpeed = apProgress / 0.2 * 300; // accelerate
          } else if (apProgress < 0.7) {
            apSpeed = 300; // cruise
          } else {
            apSpeed = 300 * (1.0 - (apProgress - 0.7) / 0.3); // decelerate
            apSpeed = Math.max(40, apSpeed);
          }

          _v1.set(0, 0, -1).applyQuaternion(state.player.quaternion);
          state.player.velocity.copy(_v1.multiplyScalar(apSpeed));

          // Show distance countdown
          const cdEl = document.getElementById('countdown-display');
          cdEl.style.display = 'block';
          cdEl.innerHTML = `AUTOPILOT<br><span style="font-size:0.35em;color:#88ccff">Distance: ${Math.floor(distToBase)}m</span>`;
          cdEl.style.fontSize = '2em';
          cdEl.style.color = '#00ff88';

          // Auto-dock when close enough or timer expires
          if (distToBase < 400 || state.autopilotTimer >= 15.0) {
            state.phase = 'landing';
            state.landingTimer = 0;
            state.autopilotActive = false;
            cdEl.style.display = 'none';
            SFAnnouncer.onDock();
            state.score += 500 * state.wave;
          }
        } else {
          // Manual approach — allow player input
          if (window.SFInput) SFInput.update(safeDt);

          // Hide hangar obstruction for safe landing approach
          if (window.SF3D) SF3D.hideHangarBay();

          const distToBaseship = state.player.position.distanceTo(state.baseship.position);
          const playerSpeed = state.player.velocity.length();

          // Manual dock when close and slow
          if (distToBaseship < 400 && playerSpeed < 80) {
            const landPrompt = document.getElementById('countdown-display');
            landPrompt.style.display = 'block';
            landPrompt.innerHTML = 'PRESS <b>SPACE</b> TO LAND';
            landPrompt.style.fontSize = '2em';
            landPrompt.style.color = '#00ff00';

            if (window.SFInput && SFInput.isKeyDown('Space')) {
              state.phase = 'landing';
              state.landingTimer = 0;
              landPrompt.style.display = 'none';
              SFAnnouncer.onDock();
              state.score += 500 * state.wave;
            }
          } else {
            const landPrompt = document.getElementById('countdown-display');
            landPrompt.style.display = 'block';
            landPrompt.innerHTML = `APPROACH BASE<br><span style="font-size:0.8em">Distance: ${Math.floor(distToBaseship)}m  Speed: ${Math.floor(playerSpeed)}m/s</span><br><span style="font-size:0.6em;color:#00ff88">Press SPACE for autopilot</span>`;
            landPrompt.style.fontSize = '1.2em';
          }
        }

        // Process combat updates in case more enemies appear
        for (let i = 0, len = state.entities.length; i < len; i++) {
          const e = state.entities[i];
          if (e.type === 'predator') updatePredatorAI(e, safeDt);
          else if (e.type === 'tanker') updateTankerAI(e, safeDt);
          else if (e.type === 'medic') updateMedicAI(e, safeDt);
          else if (AI_PROFILES[e.type]) {
            updateCombatAI(e, safeDt);
            if (e.type === 'wingman') _updateANPCState(e, safeDt);
          }
          // Torpedo acceleration: 200→350 m/s over 1.5s (GDD §10.1)
          else if (e.type === 'torpedo') {
            const age = (performance.now() / 1000) - (e.launchTime || 0);
            const spd = Math.min(350, 200 + (150 * Math.min(age / 1.5, 1)));
            if (e.target && !e.target.markedForDeletion) {
              _v1.copy(e.target.position).sub(e.position).normalize();
              _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
              e.quaternion.slerp(_q1, safeDt * 1.5);
            }
            _v1.set(0, 0, -1).applyQuaternion(e.quaternion);
            e.velocity.copy(_v1.multiplyScalar(spd));
          }
        }

        // Apply velocity → position (3D physics) during approach
        for (let i = 0, len = state.entities.length; i < len; i++) {
          const e = state.entities[i];
          if (e.markedForDeletion) continue;
          e.position.x += e.velocity.x * safeDt;
          e.position.y += e.velocity.y * safeDt;
          e.position.z += e.velocity.z * safeDt;
        }

        // Expiry for in-flight projectiles during approach phase
        for (let i = state.entities.length - 1; i >= 0; i--) {
          const e = state.entities[i];
          if (e.maxAge > 0) {
            e.age += safeDt;
            if (e.age >= e.maxAge) {
              e.markedForDeletion = true;
              if (M) M.remove(e.id);
            }
          }
        }
        // Cleanup marked entities
        for (let i = state.entities.length - 1; i >= 0; i--) {
          if (state.entities[i].markedForDeletion) {
            state.entities[i] = state.entities[state.entities.length - 1];
            state.entities.pop();
          }
        }

        checkWave();
        updateHUD();
        if (window.SF3D) SF3D.render(state);
        return;
      }

      // ── Landing Phase (cinematic return to bay) ──
      if (state.phase === 'landing') {
        state.landingTimer += safeDt;
        const t = state.landingTimer / state.landingDuration;
        const progress = Math.min(t, 1.0);

        // Move player toward baseship hangar
        _v1.copy(state.baseship.position).add(_v2.set(0, -32, 50));
        state.player.position.lerp(_v1, progress * 0.3);


        // Dock the player to baseship on completion
        if (progress >= 1.0) {
          completeLanding();
          return;
        }

        if (window.SF3D) SF3D.render(state);
        return;
      }

      // ── Docking Phase (post-mission briefing) ──
      if (state.phase === 'docking') {
        if (window.SF3D) SF3D.render(state);
        return;
      }

      // ── Combat Phase (normal gameplay) ──

      // Predator plasma disable check — blocks player input when disabled
      _updateDisabledState(safeDt);

      // Egg hatching + youngling bore/attach logic
      _updateEggs(safeDt);
      _updateYounglings(safeDt);

      if (window.SFInput && !state._playerDisabled && !_isPlayerInSupportAutopilot()) {
        SFInput.update(safeDt);
        SFInput.updateLivePanel();
      }

      if (state.player && state.player.lockedTarget && state.player.lockedTarget.markedForDeletion) {
        state.player.lockedTarget = null;
      }

      // Autonomous announcer — observe game state and generate chatter
      SFAnnouncer.observe(safeDt);
      // Wingman cluster guidance — bearing callout every 15-23s during combat
      state._clusterCallTimer -= safeDt;
      if (state._clusterCallTimer <= 0 && state.phase === 'combat') {
        _wingmanClusterComm();
        state._clusterCallTimer = 15 + Math.random() * 8;
      }
      state.commTimer += safeDt;
      if (state.commTimer >= state.commInterval) {
        state.commTimer = 0;
        const chat = SFAnnouncer.generateChatter();
        if (chat) addComm(chat.sender, chat.msg, chat.type);
        state.commInterval = 5 + Math.random() * 8;
      }

      // ── INTENT PHASE: entities declare what they want to do ──
      if (state.player && !state.player.markedForDeletion && !_isPlayerInSupportAutopilot()) {
        state.player.resolveIntent(safeDt);
      }

      // ── Multiplayer state sync (20 Hz) ──
      const MP = window.SFMultiplayer;
      if (MP && MP.isMultiplayer && state.player && !state.player.markedForDeletion) {
        MP.sendPlayerState(state.player);

        // Render remote players as wingman entities
        for (const [pid, rp] of MP.remotePlayers) {
          let remote = state.entities.find(e => e._remotePlayerId === pid);
          if (!remote) {
            remote = new Entity('wingman', rp.x, rp.y, rp.z);
            remote.callsign = rp.callsign || 'Remote';
            remote._remotePlayerId = pid;
            remote._isRemotePlayer = true;
            state.entities.push(remote);
          }
          // Interpolate to latest server position
          remote.position.set(rp.x, rp.y, rp.z);
          remote.quaternion.set(rp.qx, rp.qy, rp.qz, rp.qw);
          remote.velocity.set(rp.vx || 0, rp.vy || 0, rp.vz || 0);
          remote.hull = rp.hull || 100;
          remote.shields = rp.shields || 100;
        }

        // Remove stale remote players (disconnected)
        for (let i = state.entities.length - 1; i >= 0; i--) {
          const e = state.entities[i];
          if (e._isRemotePlayer && !MP.remotePlayers.has(e._remotePlayerId)) {
            e.markedForDeletion = true;
            if (M) M.remove(e.id);
          }
        }
      }

      // Feed engine audio with current thrust state
      if (window.SFAudio && state.player && !state.player.markedForDeletion) {
        SFAudio.setThrustLevel(
          state.player.throttle,
          state.player.afterburnerActive,
          state.player.boostActive
        );
        SFAudio.setStrafeLevel(state.player.strafeH, state.player.strafeV);
      }

      // Auto-targeting: crosshair tracks and locks enemies in range + cone
      updateCrosshairTargeting(safeDt);

      // AI sets intent (velocity) on enemies and torpedoes — for loop, no closure
      // 🍴 Fork-guarded: skip entities whose fork was revoked mid-frame
      const _DPe = M ? M.DiningPhilosophers : null;
      const ents = state.entities;
      for (let i = 0, len = ents.length; i < len; i++) {
        const e = ents[i];
        if (_DPe && !_DPe.acquire(e.id, 'ai')) continue;
        if (e.type === 'predator') updatePredatorAI(e, safeDt);
        else if (e.type === 'tanker') updateTankerAI(e, safeDt);
        else if (e.type === 'medic') updateMedicAI(e, safeDt);
        else if (AI_PROFILES[e.type]) {
          updateCombatAI(e, safeDt);
          if (e.type === 'wingman') _updateANPCState(e, safeDt);
        }
        // Torpedo acceleration: 200→350 m/s over 1.5s (GDD §10.1)
        else if (e.type === 'torpedo') {
          const age = (performance.now() / 1000) - (e.launchTime || 0);
          const spd = Math.min(350, 200 + (150 * Math.min(age / 1.5, 1)));
          if (e.target && !e.target.markedForDeletion) {
            _v1.copy(e.target.position).sub(e.position).normalize();
            _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
            e.quaternion.slerp(_q1, safeDt * 1.5);
          }
          _v1.set(0, 0, -1).applyQuaternion(e.quaternion);
          e.velocity.copy(_v1.multiplyScalar(spd));
        }
      }

      // ── EVOLVE PHASE: the manifold advances all points forward in time ──
      if (M) {
        M.evolve(safeDt);
      }
      if (_DPe) _DPe.releaseAll('ai');

      // Apply velocity → position for all entities (3D physics step)
      // The unified Manifold tracks 2D projections; this is the authoritative 3D update
      for (let i = 0, len = ents.length; i < len; i++) {
        const e = ents[i];
        if (e.markedForDeletion) continue;
        if (_DPe && !_DPe.acquire(e.id, 'physics')) continue;
        e.position.x += e.velocity.x * safeDt;
        e.position.y += e.velocity.y * safeDt;
        e.position.z += e.velocity.z * safeDt;
      }
      if (_DPe) _DPe.releaseAll('physics');

      // ── OBSERVE PHASE: read manifold state for game events ──

      // Age-based expiry for projectiles (replaces setTimeout)
      for (let i = 0, len = ents.length; i < len; i++) {
        const e = ents[i];
        if (_DPe && !_DPe.acquire(e.id, 'expiry')) continue;
        if (e.maxAge > 0) {
          e.age += safeDt;
          if (e.age >= e.maxAge) {
            e.markedForDeletion = true;
            if (M) M.remove(e.id);
            continue;
          }
        }
        // Projectile expiry: TTL (maxAge) + range-based
        if (e.type === 'laser' || e.type === 'machinegun' || e.type === 'torpedo') {
          // Time-based expiry: lasers 2s, machinegun 1.5s, torpedoes 6s
          if (!e._spawnTime) e._spawnTime = state.elapsed;
          const age = state.elapsed - e._spawnTime;
          const maxAge = e.maxAge || (e.type === 'torpedo' ? 6 : e.type === 'machinegun' ? 1.5 : 2);
          if (age > maxAge) {
            e.markedForDeletion = true;
            if (M) M.remove(e.id);
          }
          // Also range-based expiry from player
          if (!e.markedForDeletion && state.player && !state.player.markedForDeletion) {
            const dx = e.position.x - state.player.position.x;
            const dy = e.position.y - state.player.position.y;
            const dz = e.position.z - state.player.position.z;
            const rr = dim('radar.range');
            if (dx * dx + dy * dy + dz * dz > rr * rr) {
              e.markedForDeletion = true;
              if (M) M.remove(e.id);
            }
          }
        }
      }
      if (_DPe) _DPe.releaseAll('expiry');

      // Observe proximity events (collisions) from the manifold
      // 🍴 Dijkstra-ordered fork acquisition prevents stale-ref crashes
      const _DP = M ? M.DiningPhilosophers : null;
      const collisionPairs = M ? M.detectCollisions() : [];
      for (const [a, b] of collisionPairs) {
        if (!a || !b) continue; // guard null refs from manifold reconstruct
        if (a.markedForDeletion || b.markedForDeletion) continue;
        // Acquire forks for both entities — skip pair if either is revoked
        if (_DP && (!_DP.acquire(a.id, 'collision') || !_DP.acquire(b.id, 'collision'))) continue;

        // Skip player-baseship collision during launch phase
        // (shouldn't reach here since launch has early return, but safety net)
        if (state.phase === 'launching' &&
          ((a.type === 'player' && b.type === 'baseship') ||
            (a.type === 'baseship' && b.type === 'player'))) {
          continue;
        }

        // Skip collisions during landing approach (player is safe in landing corridor)
        const _isHostile = (t) => t === 'enemy' || t === 'interceptor' || t === 'bomber' || t === 'dreadnought' || t === 'alien-baseship' || t === 'predator';
        if (state.phase === 'land-approach' &&
          ((a.type === 'player' && _isHostile(b.type)) ||
            (_isHostile(a.type) && b.type === 'player'))) {
          continue;
        }

        // Skip player collisions during support autopilot (protected while docking)
        if (_isPlayerInSupportAutopilot() &&
          ((a.type === 'player' && _isHostile(b.type)) ||
            (_isHostile(a.type) && b.type === 'player'))) {
          continue;
        }

        // Skip player-baseship collision during landing
        if ((state.phase === 'land-approach' || state.phase === 'landing') &&
          ((a.type === 'player' && b.type === 'baseship') ||
            (a.type === 'baseship' && b.type === 'player'))) {
          continue;
        }

        const isAProj = a.type === 'laser' || a.type === 'machinegun' || a.type === 'torpedo';
        const isBProj = b.type === 'laser' || b.type === 'machinegun' || b.type === 'torpedo';

        if (isAProj && isBProj) continue;
        if ((isAProj && a.owner === b.type) || (isBProj && b.owner === a.type)) continue;

        // Friendly fire prevention — player/wingman projectiles skip friendly targets
        const _isFriendlyType = (t) => t === 'player' || t === 'wingman' || t === 'baseship' || t === 'tanker' || t === 'medic';
        const _isFriendlyOwner = (o) => o === 'player' || o === 'wingman';
        if (isAProj && _isFriendlyOwner(a.owner) && _isFriendlyType(b.type)) continue;
        if (isBProj && _isFriendlyOwner(b.owner) && _isFriendlyType(a.type)) continue;
        // Enemy projectiles skip other enemies
        if (isAProj && a.owner === 'enemy' && _isHostile(b.type)) continue;
        if (isBProj && b.owner === 'enemy' && _isHostile(a.type)) continue;

        // Use inline math so this works whether position is THREE.Vector3 or a plain {x,y,z}
        const _cx = a.position.x - b.position.x;
        const _cy = a.position.y - b.position.y;
        const _cz = (a.position.z || 0) - (b.position.z || 0);
        const distSq = _cx * _cx + _cy * _cy + _cz * _cz;
        const rSum = a.radius + b.radius;
        if (distSq < rSum * rSum) {
          handleCollision(a, b);
        }
      }

      // 🍴 Release collision forks — philosophers put down forks before cleanup
      if (_DP) _DP.releaseAll('collision');

      // Cleanup — inline filter with swap-remove for O(1) per deletion
      for (let i = state.entities.length - 1; i >= 0; i--) {
        if (state.entities[i].markedForDeletion) {
          state.entities[i] = state.entities[state.entities.length - 1];
          state.entities.pop();
        }
      }
      if (M) M.reap();

      // ── Support ship system: autopilot + dock + repair ──
      _updateSupportSystem(safeDt);
      _updateSupportButtons();

      // ── Dynamic music intensity — proximity & threat level ──
      if (window.SFMusic && state.player && !state.player.markedForDeletion) {
        let nearCount = 0;
        let closestDist = Infinity;
        let enemyCount = 0;
        const px = state.player.position.x, py = state.player.position.y, pz = state.player.position.z;
        for (let i = 0, len = state.entities.length; i < len; i++) {
          const e = state.entities[i];
          if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' && e.type !== 'dreadnought' && e.type !== 'alien-baseship' && e.type !== 'predator') continue;
          if (e.markedForDeletion) continue;
          enemyCount++;
          const dx = e.position.x - px, dy = e.position.y - py, dz = e.position.z - pz;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < 1500 * 1500) nearCount++; // within 1500m
          if (distSq < closestDist) closestDist = distSq;
        }
        // Intensity formula: base 0.3 in combat, +proximity, +crowd, +baseship danger
        let musicIntensity = 0.3;
        if (closestDist < 1600 * 1600) musicIntensity += 0.3; // fighter very close — urgency
        else if (closestDist < 1500 * 1500) musicIntensity += 0.15;
        if (nearCount > 3) musicIntensity += 0.15; // multiple threats — crescendo
        if (nearCount > 6) musicIntensity += 0.15; // major battle
        const basePct = state.baseship ? state.baseship.hull / dim('baseship.hull') : 1;
        if (basePct < 0.3) musicIntensity += 0.15; // baseship in danger
        SFMusic.setIntensity(Math.min(1, musicIntensity));

        // Dynamic section switching based on combat proximity
        if (state.phase === 'combat') {
          if (nearCount > 3 || closestDist < 1600 * 1600) {
            SFMusic.setSection('heat-of-battle');
          } else if (nearCount > 0 || closestDist < 1500 * 1500) {
            SFMusic.setSection('enemy-nearby');
          } else if (enemyCount > 0) {
            SFMusic.setSection('foreboding');
          } else {
            SFMusic.setSection('exploration');
          }
        }

        if (SFMusic.setManifoldState) {
          const pxn = px / 2000;
          const pyn = py / 2000;
          const pzn = pz / 2000;
          const waveNorm = Math.min(1, state.wave / 12);
          const threatNorm = Math.min(1, (nearCount / 8) + (enemyCount / 20));

          let field = Math.sin(pxn * pyn);
          let phase = Math.atan2(pyn, pxn);
          let gradient = Math.sqrt(pxn * pxn + pyn * pyn + pzn * pzn);
          if (M && M.diamond) field = M.diamond(px, py, pz);
          if (M && M.helixPhase) phase = M.helixPhase(px, py);
          if (M && M.diamondGrad) {
            const g = M.diamondGrad(px, py, pz);
            gradient = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
          }

          SFMusic.setManifoldState({
            x: pxn,
            y: pyn,
            z: pxn * pyn,
            phase,
            field,
            gradient,
            waveNorm,
            threatNorm,
          });
        }
      }

      // Throttle HUD/DOM updates to every 3rd frame (DOM is slow)
      _frameCount++;
      if (_frameCount % 3 === 0) updateHUD();
      if (window.SF3D) SF3D.render(state);

    } catch (err) {
      console.error('Starfighter gameLoop error (recovered):', err);
      // Show first error on-screen so silent freezes never hide bugs
      if (!state._errorShown) {
        state._errorShown = true;
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) {
          cdEl.style.display = 'block';
          cdEl.innerHTML = `<span style="color:#ff4444;font-size:0.4em">ERROR: ${err.message}</span>`;
        }
      }
      // Still render so screen doesn't freeze
      try { if (window.SF3D) SF3D.render(state); } catch (_) { }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // COMBAT AI MANIFOLD — Dimensional substrate: z = xy
  // Behavior (z) is the product of movement traits (x) and attack traits (y)
  // One engine, many personalities — compact as a Schwartz diamond surface
  // ══════════════════════════════════════════════════════════════

  // ── AI PROFILES — Derived from Schwartz Diamond stamp, not hardcoded ──
  // stamp(entity) → {u, v, w, m, field, phase}
  //   field: diamond surface value → behavioral regime
  //   phase: angular position → tactical preference (weapon/target mode)
  //   w: z = xy² → power multiplier (quadratic amplifier)
  //   m: xyz → overall intensity
  //
  // Minimal input (entity 3D position) → maximum multiplied output (full combat profile)
  // No state machines. Behavior emerges from position on the surface.

  const _TRAIT_SEEDS = {
    enemy: { baseTraits: ['evade_locked', 'avoid_predator'] },
    interceptor: { baseTraits: ['jink_close'] },
    bomber: { baseTraits: [] },
    dreadnought: { baseTraits: ['heavy_torpedo'] },
    wingman: { baseTraits: ['orbit_idle'] },
    'alien-baseship': { baseTraits: [] },
  };

  function _deriveAIProfile(entity) {
    const s = M.stamp(entity) || { u: 0, v: 0, w: 0, m: 0, field: 0, phase: 0 };
    const absField = Math.abs(s.field);
    const absM = Math.min(Math.abs(s.m), 500);
    const seeds = _TRAIT_SEEDS[entity.type] || { baseTraits: [] };

    // field > 0 → aggressive regime (attack player)
    // field < 0 → defensive regime (attack baseship/structure)
    // field ≈ 0 → transitional (mixed targeting)
    const aggression = (s.field + 1) * 0.5;   // 0..1
    const targetMode = aggression > 0.6 ? 'player'
      : aggression < 0.3 ? 'baseship'
        : entity.type === 'wingman' ? 'nearest_enemy' : 'mixed';

    // phase → weapon preference: 0..π = laser/turret, π..2π = torpedo
    const weaponPhase = (s.phase + Math.PI) / (2 * Math.PI);  // 0..1
    const weapon = entity.type === 'dreadnought' ? 'turret'
      : entity.type === 'bomber' ? 'torpedo'
        : entity.type === 'alien-baseship' ? 'torpedo'
          : weaponPhase > 0.7 ? 'torpedo' : 'laser';

    // w (z = xy²) → quadratic power multiplier: turnRate, fireRange, cooldown
    const wNorm = Math.min(Math.abs(s.w), 100) / 100;   // 0..1

    return {
      targetMode,
      turnRate: dim('enemy.turnRate') * (0.6 + absField * 2.0 + wNorm),
      weapon,
      fireRange: dim('enemy.fireRange') * (0.7 + absM * 0.002 + wNorm * 0.5),
      cooldownMul: 1.0 - absField * 0.3,           // more extreme field → faster firing
      traits: seeds.baseTraits,
      jinkDist: 200 + wNorm * 200,
      heavyRange: dim('enemy.heavyRange') || 6000,
      heavyCooldown: dim('enemy.heavyCooldown') || 15,
    };
  }

  // Compatibility shim — cache per-entity, refresh every 2s (stamp changes with position)
  function _getAIProfile(entity) {
    const now = performance.now();
    if (!entity._aiProfile || now - (entity._aiProfileTime || 0) > 2000) {
      entity._aiProfile = _deriveAIProfile(entity);
      entity._aiProfileTime = now;
    }
    return entity._aiProfile;
  }

  // Backward-compat: anything that reads AI_PROFILES[type] still works
  const AI_PROFILES = new Proxy({}, {
    get(_, type) { return _TRAIT_SEEDS[type] ? { traits: _TRAIT_SEEDS[type].baseTraits } : undefined; },
    has(_, type) { return type in _TRAIT_SEEDS; }
  });

  // ── Target acquisition dimension ──
  function _acquireTarget(entity, mode) {
    const _playerAlive = state.player && !state.player.markedForDeletion;
    if (mode === 'player') return _playerAlive ? state.player : state.baseship;
    if (mode === 'baseship') return state.baseship;
    if (mode === 'mixed') return (Math.random() > 0.3) ? state.baseship : (_playerAlive ? state.player : state.baseship);
    if (mode === 'nearest_enemy') {
      let best = null, bestD = Infinity;
      for (let i = 0, len = state.entities.length; i < len; i++) {
        const e = state.entities[i];
        if (e.markedForDeletion) continue;
        if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' &&
          e.type !== 'predator' && e.type !== 'alien-baseship' && e.type !== 'dreadnought') continue;
        const dx = e.position.x - entity.position.x;
        const dy = e.position.y - entity.position.y;
        const dz = e.position.z - entity.position.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }
    return _playerAlive ? state.player : state.baseship;
  }

  // ── Evasion dimension: break turn when player has target lock ──
  function _combatEvade(entity, dt) {
    // Guard: initialise evade state if missing or direction lost
    if (!entity._evading || !entity._evadeDir) {
      entity._evading = true;
      entity._evadeTimer = 0;
      const ex = (Math.random() - 0.5) * 2, ey = (Math.random() - 0.5) * 2, ez = (Math.random() - 0.5);
      const elen = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
      entity._evadeDir = new THREE.Vector3(ex / elen, ey / elen, ez / elen);
    }
    entity._evadeTimer += dt;
    if (entity._evadeTimer > 1.5) {
      entity._evadeTimer = 0;
      const ex = (Math.random() - 0.5) * 2, ey = (Math.random() - 0.5) * 2, ez = (Math.random() - 0.5);
      const elen = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
      entity._evadeDir.set(ex / elen, ey / elen, ez / elen);
    }
    // Only call setFromUnitVectors when direction is valid (non-zero)
    const edLen = entity._evadeDir.lengthSq();
    if (edLen > 0.001) {
      _q1.setFromUnitVectors(_v2.set(0, 0, -1), entity._evadeDir);
      entity.quaternion.slerp(_q1, dt * 4.0);
    }
    const fwd = _v1.set(0, 0, -1).applyQuaternion(entity.quaternion);
    entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 1.5);
    // Return fire while evading — guard against null player
    if (!entity._fireCooldown) entity._fireCooldown = 0;
    entity._fireCooldown -= dt;
    if (entity._fireCooldown <= 0 && state.player && !state.player.markedForDeletion) {
      const dx = entity.position.x - state.player.position.x;
      const dy = entity.position.y - state.player.position.y;
      const dz = entity.position.z - state.player.position.z;
      if (dx * dx + dy * dy + dz * dz < 640000) {
        fireLaser(entity, 'enemy');
        entity._fireCooldown = entity._fireCooldownBase || dim('enemy.fireCooldown');
      }
    }
  }

  // ── Predator avoidance dimension ──
  function _combatAvoidPredator(entity, dt) {
    for (let i = 0, len = state.entities.length; i < len; i++) {
      const pred = state.entities[i];
      if (pred.type !== 'predator' || pred.markedForDeletion) continue;
      const dx = pred.position.x - entity.position.x;
      const dy = pred.position.y - entity.position.y;
      const dz = pred.position.z - entity.position.z;
      if (dx * dx + dy * dy + dz * dz < 160000 && Math.random() > 0.3) {
        _v1.set(-dx, -dy, -dz).normalize();
        _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
        entity.quaternion.slerp(_q1, dt * 3.0);
        entity.velocity.copy(_v1).multiplyScalar(entity.maxSpeed * 1.3);
        return true;
      }
    }
    return false;
  }

  // ── Jink dimension: close-range evasive strafe ──
  function _combatJink(entity, dt, fwd) {
    if (!entity._jinxDir) {
      entity._jinxDir = new THREE.Vector3(
        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5)
      ).normalize();
      entity._jinxTimer = 0;
    }
    entity._jinxTimer += dt;
    if (entity._jinxTimer > 1.2) { entity._jinxDir = null; entity._jinxTimer = 0; }
    if (entity._jinxDir) {
      _q1.setFromUnitVectors(_v2.set(0, 0, -1), entity._jinxDir);
      entity.quaternion.slerp(_q1, dt * 4.0);
    }
    entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 1.3);
  }

  // ── Torpedo fire dimension ──
  function _combatFireTorpedo(entity, target) {
    if (_countType('torpedo') >= dim('cap.torpedoes')) return;
    _v1.set(0, -30, -60).applyQuaternion(entity.quaternion);
    const t = new Entity('torpedo',
      entity.position.x + _v1.x, entity.position.y + _v1.y, entity.position.z + _v1.z);
    t.quaternion.copy(entity.quaternion);
    _v1.set(0, 0, -dim('weapon.torpedo.speed')).applyQuaternion(t.quaternion);
    t.velocity.copy(_v1);
    t.owner = 'enemy';
    t.radius = dim('weapon.torpedo.radius');
    t.target = target;
    t.maxAge = dim('weapon.torpedo.maxAge');
    t.damage = entity.type === 'alien-baseship' ? dim('weapon.torpedo.damage') : 60;
    t.launchTime = performance.now() / 1000;
    state.entities.push(t);
    if (window.SFAudio) SFAudio.playSound('torpedo');
  }

  // ── Heavy torpedo dimension (dreadnought special) ──
  function _combatFireHeavyTorp(entity, target) {
    if (_countType('torpedo') >= dim('cap.torpedoes')) return;
    _v1.set(0, 0, -80).applyQuaternion(entity.quaternion);
    const t = new Entity('torpedo',
      entity.position.x + _v1.x, entity.position.y + _v1.y, entity.position.z + _v1.z);
    t.quaternion.copy(entity.quaternion);
    _v1.set(0, 0, -360).applyQuaternion(t.quaternion);
    t.velocity.copy(_v1);
    t.owner = 'enemy';
    t.radius = 18;
    t.target = target;
    t.maxAge = 25;
    t.damage = 150;
    t.launchTime = performance.now() / 1000;
    state.entities.push(t);
    if (window.SFAudio) SFAudio.playSound('torpedo');
    SFAnnouncer.onHeavyOrdnance();
  }

  // ── The unified combat AI engine: one function, all combat types ──
  function updateCombatAI(entity, dt) {
    const prof = _getAIProfile(entity);
    if (!prof) return;

    // Plasma stun check
    if (entity._plasmaStunned) {
      entity._plasmaStunTimer -= dt;
      entity.velocity.multiplyScalar(0.95);
      if (entity._plasmaStunTimer <= 0) entity._plasmaStunned = false;
      return;
    }

    // Target acquisition
    let target = _acquireTarget(entity, prof.targetMode);

    // No target — orbit baseship if trait active, else drift
    if (!target) {
      if (prof.traits.includes('orbit_idle') && state.baseship) {
        _v1.copy(state.baseship.position).sub(entity.position);
        if (_v1.lengthSq() > 640000) {
          _v1.normalize();
          _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
          entity.quaternion.slerp(_q1, dt * 1.5);
        }
        const fwd = _v2.set(0, 0, -1).applyQuaternion(entity.quaternion);
        entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed * 0.5);
      }
      return;
    }

    _v1.copy(target.position).sub(entity.position);
    const dist2 = _v1.lengthSq();
    _v1.normalize();

    // Trait: evade when player has lock
    if (prof.traits.includes('evade_locked') && state.player.lockedTarget === entity) {
      entity._evading = true;
      _combatEvade(entity, dt);
      return;
    }
    entity._evading = false;

    // Trait: avoid predator
    if (prof.traits.includes('avoid_predator') && _combatAvoidPredator(entity, dt)) return;

    // Pursuit: turn toward target
    _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
    entity.quaternion.slerp(_q1, dt * prof.turnRate);
    const fwd = _v2.set(0, 0, -1).applyQuaternion(entity.quaternion);

    // Trait: jink at close range
    if (prof.traits.includes('jink_close') && dist2 < (prof.jinkDist || 300) ** 2) {
      _combatJink(entity, dt, fwd);
    } else {
      entity.velocity.copy(fwd).multiplyScalar(entity.maxSpeed);
    }

    // Primary weapon
    if (!entity._fireCooldown) entity._fireCooldown = 0;
    entity._fireCooldown -= dt;
    if (entity._fireCooldown <= 0 && dist2 < prof.fireRange * prof.fireRange) {
      if (prof.weapon === 'laser') {
        fireLaser(entity, entity.type === 'wingman' ? 'wingman' : 'enemy');
        // Spread shot — wave 2+ enemies fire a burst alongside their laser
        if (entity._useSpread) setTimeout(() => { if (!entity.markedForDeletion) _fireEnemySpread(entity); }, 90);
        entity._fireCooldown = (entity._fireCooldownBase || dim('enemy.fireCooldown')) * prof.cooldownMul + Math.random() * 0.3;
      } else if (prof.weapon === 'torpedo') {
        _combatFireTorpedo(entity, target);
        entity._fireCooldown = entity._bombInterval || dim('enemy.baseship.fireCooldown');
      } else if (prof.weapon === 'turret') {
        for (let s = 0; s < 3; s++) {
          setTimeout(() => { if (!entity.markedForDeletion) fireLaser(entity, 'enemy'); }, s * 150);
        }
        entity._fireCooldown = entity._turretInterval || 2.0;
      }
    }

    // Trait: heavy torpedo (dreadnought secondary weapon)
    if (prof.traits.includes('heavy_torpedo')) {
      if (!entity._beamCooldown) entity._beamCooldown = prof.heavyCooldown || 15;
      entity._beamCooldown -= dt;
      if (entity._beamCooldown <= 0 && dist2 < (prof.heavyRange || 6000) ** 2) {
        _combatFireHeavyTorp(entity, target);
        entity._beamCooldown = prof.heavyCooldown || 15;
      }
    }
  }

  // ── ANPC Combat State Manager ──
  // Updates combat state, morale, and triggers personality-driven comms
  function _updateANPCState(entity, dt) {
    if (!entity._anpc || !window.SFAnpc) return;
    const ANPC = window.SFAnpc;
    const npc = entity._anpc;
    const hullMax = 100; // wingman baseline
    const hullPct = entity.hull / hullMax;

    // Update combat state based on hull and engagement
    if (entity.markedForDeletion) {
      ANPC.setState(entity._anpcKey, 'DESTROYED');
      return;
    }
    if (hullPct < 0.15) {
      ANPC.setState(entity._anpcKey, 'RETREATING');
    } else if (hullPct < 0.35) {
      if (npc.combatState !== 'DAMAGED' && npc.combatState !== 'RETREATING') {
        ANPC.setState(entity._anpcKey, 'DAMAGED');
        // Personality-driven comms: callout when damaged
        const line = ANPC.speak(entity._anpcKey, 'shields_down');
        if (line) SFAnnouncer.addComm && SFAnnouncer.addComm(npc.callsign, line, npc.voiceTag);
      }
    } else if (entity._evading) {
      ANPC.setState(entity._anpcKey, 'EVASIVE');
    } else if (entity._fireCooldown !== undefined && entity._fireCooldown > 0) {
      ANPC.setState(entity._anpcKey, 'ENGAGED');
    } else {
      ANPC.setState(entity._anpcKey, 'PATROL');
    }

    // Morale drift — proximity to enemies decreases morale, kills increase it
    const nearbyHostiles = state.entities.filter(e =>
      !e.markedForDeletion && (e.type === 'enemy' || e.type === 'predator' || e.type === 'dreadnought') &&
      e.position.distanceToSquared(entity.position) < 2000 * 2000
    ).length;
    const moraleDelta = (nearbyHostiles > 3 ? -0.02 : nearbyHostiles > 0 ? -0.005 : 0.01) * dt;
    ANPC.adjustMorale(entity._anpcKey, moraleDelta);

    // Disposition: if player is nearby and helping, disposition increases
    if (state.player && !state.player.markedForDeletion) {
      const playerDist = entity.position.distanceToSquared(state.player.position);
      if (playerDist < 800 * 800) {
        ANPC.adjustDisposition(entity._anpcKey, 0.002 * dt); // proximity bond
      }
    }
  }

  // Track wingman kills for ANPC splash comms
  function _onWingmanKill(entity, victim) {
    if (!entity._anpc || !window.SFAnpc) return;
    const ANPC = window.SFAnpc;
    const npc = entity._anpc;
    ANPC.adjustMorale(entity._anpcKey, 0.05);
    ANPC.adjustDisposition(entity._anpcKey, 0.01);
    const line = ANPC.speak(entity._anpcKey, 'splash', { target: victim.type });
    if (line) SFAnnouncer.addComm && SFAnnouncer.addComm(npc.callsign, line, npc.voiceTag);
  }

  function updatePredatorAI(pred, dt) {
    // If consuming a kill, stay still and heal
    if (pred._consuming) {
      pred._consumeTimer -= dt;
      pred.velocity.multiplyScalar(0.9); // slow to a stop
      // Heal while consuming (eats what it kills)
      pred.hull = Math.min(pred.hull + dt * 30, 500 + state.wave * 60);
      if (pred._consumeTimer <= 0) {
        pred._consuming = false;
        pred._consumeTarget = null;
      }
      return;
    }

    // Target selection: Predator is indiscriminate — attacks ANYTHING nearby
    // It doesn't know friend from foe. Only ignores baseship/station (too large to damage)
    let target = null;
    let bestDist = Infinity;
    const ents = state.entities;
    for (let i = 0, len = ents.length; i < len; i++) {
      const e = ents[i];
      if (e.markedForDeletion) continue;
      // Skip other predators, plasma, lasers, torpedoes, baseship, alien-baseship, eggs, younglings
      if (e.type === 'predator' || e.type === 'plasma' || e.type === 'laser' || e.type === 'torpedo') continue;
      if (e.type === 'baseship' || e.type === 'alien-baseship') continue; // too strong to damage
      if (e.type === 'egg' || e.type === 'youngling') continue; // own offspring
      const dx = e.position.x - pred.position.x;
      const dy = e.position.y - pred.position.y;
      const dz = e.position.z - pred.position.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) { bestDist = d; target = e; }
    }
    if (!target) { target = state.player; }
    if (!target) return;

    // Pursuit: fast but slow-turning (turnRate 0.4 vs enemy's 2.0)
    _v1.copy(target.position).sub(pred.position).normalize();
    _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
    pred.quaternion.slerp(_q1, dt * pred._turnRate);

    // Move forward at speed
    const fwd = _v2.set(0, 0, -1).applyQuaternion(pred.quaternion);
    pred.velocity.copy(fwd).multiplyScalar(pred.maxSpeed);

    // Plasma attack — fires when target is roughly ahead and in range (1000m)
    pred._plasmaTimer -= dt;
    if (pred._plasmaTimer <= 0) {
      const toTarget = _v1.copy(target.position).sub(pred.position);
      const dist = toTarget.length();
      if (dist < 1000) { // can spew plasma several hundred meters
        toTarget.normalize();
        const facingDot = fwd.dot(toTarget);
        if (facingDot > 0.7) { // roughly facing target (wider than lasers — it's a spray)
          _firePlasma(pred, target);
          pred._plasmaTimer = pred._plasmaCooldown;
        }
      }
    }

    // Egg laying — predators periodically drop eggs from underbelly
    pred._eggTimer -= dt;
    if (pred._eggTimer <= 0) {
      _layEgg(pred);
      pred._eggTimer = 12 + Math.random() * 8; // 12-20s between eggs
    }
  }

  // ── Plasma projectile: distance-based damage, disables on shield hit, consumes on hull breach ──
  function _firePlasma(source, target) {
    if (_countType('plasma') >= dim('cap.plasma')) return;
    // Plasma emits from the underbelly (-Y local) — that's where its vulnerable
    const spawnOffset = _v1.set(0, -45, -30).applyQuaternion(source.quaternion);
    const p = new Entity('plasma',
      source.position.x + spawnOffset.x,
      source.position.y + spawnOffset.y,
      source.position.z + spawnOffset.z);
    p.quaternion.copy(source.quaternion);

    // Aim toward target with slight spread
    const dir = _v2.copy(target.position).sub(p.position).normalize();
    p.velocity.copy(dir.multiplyScalar(500)); // plasma velocity — slower than lasers
    p.owner = 'predator';
    p.radius = 16;
    p.maxAge = 3.0;  // ~1500m max range at 500m/s
    p.damage = 60;   // base damage (reduced with distance)
    p._sourcePos = source.position.clone(); // track origin for falloff
    p._sourceEntity = source; // track which predator fired it
    state.entities.push(p);

    if (window.SF3D) SF3D.spawnPlasma(p);
    if (window.SFAudio) SFAudio.playSound('plasma_spit');
  }

  // ══════════════════════════════════════
  // SUPPORT SHIPS — tanker & medic frigate
  // Call-based system: ships orbit safely, player calls when in need,
  // autopilot flies player TO the ship, repairs/refuels, sends player back.
  // ══════════════════════════════════════

  let _tankerEntity = null;   // live tanker entity (null = not spawned)
  let _medicEntity = null;    // live medic entity (null = not spawned)

  // Support call state
  state._supportCall = null;      // 'tanker' | 'medic' | null
  state._supportTarget = null;    // the entity we're flying to
  state._supportPhase = null;     // 'approach' | 'docking' | 'return' | null
  state._supportDockTimer = 0;
  state._supportReturnPos = null; // THREE.Vector3 — where player was when called

  // ── SPAWN: deploy support ship into safe orbit ──

  function _spawnTanker() {
    if (_tankerEntity) return;
    if (!state.baseship) return;
    const orbitDist = dim('entity.tanker.orbitDist');
    const angle = Math.random() * Math.PI * 2;
    const spawnPos = state.baseship.position.clone().add(
      new THREE.Vector3(Math.cos(angle) * orbitDist, (Math.random() - 0.5) * 400, Math.sin(angle) * orbitDist)
    );
    const tk = new Entity('tanker', spawnPos.x, spawnPos.y, spawnPos.z);
    tk.hull = dim('entity.tanker.hull');
    tk.shields = dim('entity.tanker.shields');
    tk.maxSpeed = dim('entity.tanker.maxSpeed');
    tk.radius = dim('entity.tanker.radius');
    tk._orbitAngle = angle;
    tk._orbitTimer = 0;
    tk._evadeTimer = 0;
    tk._evadeDir = new THREE.Vector3(0, 0, 0);
    tk._called = false;
    state.entities.push(tk);
    _tankerEntity = tk;
    SFAnnouncer.onTankerDeploy();
  }

  function _spawnMedic() {
    if (_medicEntity) return;
    if (!state.baseship) return;
    const orbitDist = dim('entity.medic.orbitDist');
    const angle = Math.random() * Math.PI * 2 + Math.PI; // opposite side from tanker
    const spawnPos = state.baseship.position.clone().add(
      new THREE.Vector3(Math.cos(angle) * orbitDist, 80 + (Math.random() - 0.5) * 300, Math.sin(angle) * orbitDist)
    );
    const med = new Entity('medic', spawnPos.x, spawnPos.y, spawnPos.z);
    med.hull = dim('entity.medic.hull');
    med.shields = dim('entity.medic.shields');
    med.maxSpeed = dim('entity.medic.maxSpeed');
    med.radius = dim('entity.medic.radius');
    med._orbitAngle = angle;
    med._orbitTimer = 0;
    med._evadeTimer = 0;
    med._evadeDir = new THREE.Vector3(0, 0, 0);
    med._called = false;
    state.entities.push(med);
    _medicEntity = med;

    const callsigns = ['Mercy', 'Nightingale', 'Caduceus', 'Aegis'];
    med._callsign = callsigns[(state.wave + state.kills) % callsigns.length];

    SFAnnouncer.onMedicDeploy(med._callsign);
  }

  // ── ORBIT AI: evasive safe-zone orbit, stay clear of fighting ──

  function _updateSupportOrbit(ship, dt, orbitDistKey) {
    if (!state.baseship) return;

    // Evasive jinking every 2-4 seconds
    ship._evadeTimer -= dt;
    if (ship._evadeTimer <= 0) {
      ship._evadeTimer = 2.0 + Math.random() * 2.0;
      ship._evadeDir.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 2
      ).normalize();
    }

    // Orbit around baseship at safe distance
    const orbitDist = dim(orbitDistKey);
    ship._orbitAngle += dt * 0.08; // slow orbit
    const targetX = state.baseship.position.x + Math.cos(ship._orbitAngle) * orbitDist;
    const targetY = state.baseship.position.y + ship._evadeDir.y * 200;
    const targetZ = state.baseship.position.z + Math.sin(ship._orbitAngle) * orbitDist;

    _v1.set(targetX, targetY, targetZ).sub(ship.position);
    // Add evasive jink
    _v1.add(_v2.copy(ship._evadeDir).multiplyScalar(150));
    _v1.normalize();

    _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
    ship.quaternion.slerp(_q1, dt * 1.2);

    const fwd = _v2.set(0, 0, -1).applyQuaternion(ship.quaternion);
    ship.velocity.copy(fwd).multiplyScalar(ship.maxSpeed * 0.7);
  }

  function updateTankerAI(tk, dt) {
    if (!tk || tk.markedForDeletion) return;
    // If called and docking → stay alongside player (handled by support dock system)
    if (state._supportPhase === 'docking' && state._supportTarget === tk) {
      _v1.copy(state.player.position).add(_v2.set(40, 10, 30));
      tk.position.lerp(_v1, dt * 2.0);
      tk.velocity.set(0, 0, 0);
      return;
    }
    // Otherwise: evasive orbit
    _updateSupportOrbit(tk, dt, 'entity.tanker.orbitDist');
  }

  function updateMedicAI(med, dt) {
    if (!med || med.markedForDeletion) return;
    // If called and docking → stay alongside player (handled by support dock system)
    if (state._supportPhase === 'docking' && state._supportTarget === med) {
      _v1.copy(state.player.position).add(_v2.set(-45, 15, 25));
      med.position.lerp(_v1, dt * 2.0);
      med.velocity.set(0, 0, 0);
      return;
    }
    // Otherwise: evasive orbit
    _updateSupportOrbit(med, dt, 'entity.medic.orbitDist');
  }

  // ── ELIGIBILITY: dire conditions required to call support ──

  function _canCallTanker() {
    if (!_tankerEntity || _tankerEntity.markedForDeletion) return false;
    if (state._supportPhase) return false; // already in a support call
    if (state.phase !== 'combat') return false;
    if (!state.player || state.player.markedForDeletion) return false;
    const p = state.player;
    // Low fuel OR (low hull AND low shields) OR zero torpedoes with hull damage
    if (p.fuel < dim('support.tanker.fuelThreshold')) return true;
    if (p.hull < dim('support.tanker.hullThreshold') && p.shields < dim('support.tanker.shieldThreshold')) return true;
    if (p.torpedoes <= 0 && p.hull < 70) return true;
    return false;
  }

  function _canCallMedic() {
    if (!_medicEntity || _medicEntity.markedForDeletion) return false;
    if (state._supportPhase) return false; // already in a support call
    if (state.phase !== 'combat') return false;
    if (!state.player || state.player.markedForDeletion) return false;
    const p = state.player;
    // Hull critical OR shields gone
    if (p.hull < dim('support.medic.hullThreshold')) return true;
    if (p.shields <= dim('support.medic.shieldThreshold') && p.hull < 70) return true;
    return false;
  }

  // ── CALL: player initiates support request ──

  function _callSupport(type) {
    const canCall = type === 'tanker' ? _canCallTanker() : _canCallMedic();
    if (!canCall) {
      // Denied — not in enough danger
      SFAnnouncer.onSupportDenied(type);
      if (window.SFAudio) SFAudio.playSound('warning');
      return;
    }

    const target = type === 'tanker' ? _tankerEntity : _medicEntity;
    state._supportCall = type;
    state._supportTarget = target;
    state._supportPhase = 'approach';
    state._supportDockTimer = 0;
    state._supportReturnPos = state.player.position.clone();

    const name = type === 'tanker' ? 'Lifeline' : (target._callsign || 'Medic');
    SFAnnouncer.onSupportAccepted(type, name);
    if (window.SFAudio) SFAudio.playSound('comm_beep');

    // Show autopilot HUD
    const cdEl = document.getElementById('countdown-display');
    cdEl.style.display = 'block';
    cdEl.style.fontSize = '2em';
    cdEl.style.color = type === 'tanker' ? '#00ff88' : '#ff6666';
    cdEl.innerHTML = `AUTOPILOT ENGAGED<br><span style="font-size:0.35em;color:#88ccff">En route to ${type === 'tanker' ? 'FUEL TANKER' : 'MEDICAL FRIGATE'}</span>`;
  }

  // ── SUPPORT UPDATE: runs each frame during active support call ──

  function _updateSupportSystem(dt) {
    if (!state._supportPhase) return;
    if (!state.player || state.player.markedForDeletion) {
      _clearSupport();
      return;
    }
    if (!state._supportTarget || state._supportTarget.markedForDeletion) {
      _clearSupport();
      return;
    }

    const target = state._supportTarget;
    const cdEl = document.getElementById('countdown-display');

    // ── APPROACH: autopilot player toward support ship ──
    if (state._supportPhase === 'approach') {
      _v1.copy(target.position).sub(state.player.position);
      const dist = _v1.length();

      // Steer toward target
      _v1.normalize();
      _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
      state.player.quaternion.slerp(_q1, dt * 2.5);

      // Speed profile: accelerate then cruise
      const apSpeed = dim('support.autopilotSpeed');
      const fwd = _v2.set(0, 0, -1).applyQuaternion(state.player.quaternion);
      state.player.velocity.copy(fwd).multiplyScalar(Math.min(apSpeed, dist * 0.5 + 20));

      // HUD distance countdown
      cdEl.style.display = 'block';
      cdEl.innerHTML = `AUTOPILOT<br><span style="font-size:0.35em;color:#88ccff">Distance to ${state._supportCall === 'tanker' ? 'TANKER' : 'MEDIC'}: ${Math.floor(dist)}m</span>`;

      // Dock when in range
      const dockRange = state._supportCall === 'tanker'
        ? dim('entity.tanker.dockRange')
        : dim('entity.medic.dockRange');
      if (dist < dockRange) {
        state._supportPhase = 'docking';
        state._supportDockTimer = 0;
        const name = state._supportCall === 'tanker' ? 'Lifeline' : (target._callsign || 'Medic');
        SFAnnouncer.onSupportDock(state._supportCall, name);
        if (window.SFAudio) SFAudio.playSound('hud_power_up');
      }
      return;
    }

    // ── DOCKING: repair/refuel/rearm while parked alongside ──
    if (state._supportPhase === 'docking') {
      state._supportDockTimer += dt;

      // Player stays alongside support ship
      const offset = state._supportCall === 'tanker'
        ? _v2.set(-30, -5, 10)
        : _v2.set(30, -5, 10);
      _v1.copy(target.position).add(offset);
      state.player.position.lerp(_v1, dt * 3.0);
      state.player.velocity.set(0, 0, 0);

      const duration = state._supportCall === 'tanker'
        ? dim('entity.tanker.dockDuration')
        : dim('entity.medic.dockDuration');
      const progress = Math.min(state._supportDockTimer / duration, 1.0);

      // Apply repairs based on type
      if (state._supportCall === 'tanker') {
        // Tanker: fuel + hull + shields + rearm
        state.player.fuel = Math.min(100, state.player.fuel + dt * dim('entity.tanker.fuelRepairRate'));
        state.player.hull = Math.min(100, state.player.hull + dt * dim('entity.tanker.hullRepairRate'));
        state.player.shields = Math.min(100, state.player.shields + dt * dim('entity.tanker.shieldRepairRate'));
        // Rearm torpedoes gradually
        if (state._supportDockTimer > 1.0 && state.player.torpedoes < 2) {
          state.player.torpedoes = Math.min(2, state.player.torpedoes + 1);
        }
      } else {
        // Medic: hull + shields only — NO rearm, NO refuel
        state.player.hull = Math.min(100, state.player.hull + dt * dim('entity.medic.hullRepairRate'));
        state.player.shields = Math.min(100, state.player.shields + dt * dim('entity.medic.shieldRepairRate'));
      }

      // HUD progress
      cdEl.style.display = 'block';
      const op = state._supportCall === 'tanker' ? 'RESUPPLY' : 'REPAIR';
      cdEl.style.color = state._supportCall === 'tanker' ? '#00ff88' : '#ff6666';
      cdEl.innerHTML = `${op} IN PROGRESS<br>` +
        `<span style="font-size:0.35em;color:#88ccff">${Math.floor(progress * 100)}% — ` +
        `Hull: ${Math.floor(state.player.hull)}% | Shields: ${Math.floor(state.player.shields)}%` +
        (state._supportCall === 'tanker' ? ` | Fuel: ${Math.floor(state.player.fuel)}%` : '') +
        `</span>`;

      // Periodic status comms
      if (!state._supportLastComm) state._supportLastComm = 0;
      state._supportLastComm -= dt;
      if (state._supportLastComm <= 0) {
        state._supportLastComm = 2.5;
        if (state._supportCall === 'medic') {
          SFAnnouncer.onMedicProgress(target._callsign || 'Medic');
        }
      }

      // Complete
      if (state._supportDockTimer >= duration) {
        state._supportPhase = 'return';
        const name = state._supportCall === 'tanker' ? 'Lifeline' : (target._callsign || 'Medic');
        if (state._supportCall === 'tanker') {
          SFAnnouncer.onTankerDone();
        } else {
          SFAnnouncer.onMedicDone(target._callsign || 'Medic');
        }
        SFAnnouncer.onSupportReturn(state._supportCall);
      }
      return;
    }

    // ── RETURN: autopilot player back to combat zone ──
    if (state._supportPhase === 'return') {
      const returnTo = state._supportReturnPos || state.baseship.position;
      _v1.copy(returnTo).sub(state.player.position);
      const dist = _v1.length();

      _v1.normalize();
      _q1.setFromUnitVectors(_v2.set(0, 0, -1), _v1);
      state.player.quaternion.slerp(_q1, dt * 2.0);

      const retSpeed = dim('support.returnSpeed');
      const fwd = _v2.set(0, 0, -1).applyQuaternion(state.player.quaternion);
      state.player.velocity.copy(fwd).multiplyScalar(Math.min(retSpeed, dist * 0.5 + 20));

      cdEl.style.display = 'block';
      cdEl.style.color = '#00ffff';
      cdEl.innerHTML = `RETURNING TO COMBAT<br><span style="font-size:0.35em;color:#88ccff">Distance: ${Math.floor(dist)}m</span>`;

      // Return control when close or after max time
      if (dist < 300) {
        _clearSupport();
        SFAnnouncer.onSupportComplete();
        if (window.SFAudio) SFAudio.playSound('hud_power_up');
      }
      return;
    }
  }

  function _clearSupport() {
    const handoffToLanding = !!state._postSupportAutoLand;
    state._supportCall = null;
    state._supportTarget = null;
    state._supportPhase = null;
    state._supportDockTimer = 0;
    state._supportReturnPos = null;
    state._supportLastComm = 0;
    state._postSupportAutoLand = false;
    const cdEl = document.getElementById('countdown-display');
    if (cdEl) cdEl.style.display = 'none';

    // Post-sortie handoff: medical detour finished (or aborted) — engage landing autopilot
    if (handoffToLanding && state.phase === 'combat') {
      state.phase = 'land-approach';
      state.autopilotActive = true;
      state.autopilotTimer = 0;
      SFAnnouncer.onAutopilotEngage();
      if (window.SFAudio) SFAudio.playSound('hud_power_up');
    }

    // Update button visibility
    _updateSupportButtons();
  }

  function _isPlayerInSupportAutopilot() {
    return state._supportPhase === 'approach' || state._supportPhase === 'docking' || state._supportPhase === 'return';
  }

  // ── BUTTON VISIBILITY: show/hide based on eligibility ──

  function _updateSupportButtons() {
    const btnTanker = document.getElementById('btn-call-tanker');
    const btnMedic = document.getElementById('btn-call-medic');
    const mobTanker = document.getElementById('mob-call-tanker');
    const mobMedic = document.getElementById('mob-call-medic');
    if (btnTanker) {
      const canCall = _canCallTanker();
      btnTanker.style.display = (state.phase === 'combat' && _tankerEntity && !_tankerEntity.markedForDeletion) ? '' : 'none';
      btnTanker.disabled = !canCall;
      btnTanker.style.opacity = canCall ? '1' : '0.4';
      if (canCall) btnTanker.classList.add('pulse-alert');
      else btnTanker.classList.remove('pulse-alert');
    }
    if (btnMedic) {
      const canCall = _canCallMedic();
      btnMedic.style.display = (state.phase === 'combat' && _medicEntity && !_medicEntity.markedForDeletion) ? '' : 'none';
      btnMedic.disabled = !canCall;
      btnMedic.style.opacity = canCall ? '1' : '0.4';
      if (canCall) btnMedic.classList.add('pulse-alert');
      else btnMedic.classList.remove('pulse-alert');
    }
    // Mobile buttons
    if (mobTanker) {
      const canCall = _canCallTanker();
      mobTanker.style.display = (state.phase === 'combat' && _tankerEntity && !_tankerEntity.markedForDeletion) ? '' : 'none';
      mobTanker.disabled = !canCall;
      mobTanker.style.opacity = canCall ? '1' : '0.4';
    }
    if (mobMedic) {
      const canCall = _canCallMedic();
      mobMedic.style.display = (state.phase === 'combat' && _medicEntity && !_medicEntity.markedForDeletion) ? '' : 'none';
      mobMedic.disabled = !canCall;
      mobMedic.style.opacity = canCall ? '1' : '0.4';
    }
  }

  // ── CLEANUP: remove support ships between waves ──

  function _despawnSupportShips() {
    if (_tankerEntity && !_tankerEntity.markedForDeletion) {
      _tankerEntity.markedForDeletion = true;
      if (M) M.remove(_tankerEntity.id);
    }
    if (_medicEntity && !_medicEntity.markedForDeletion) {
      _medicEntity.markedForDeletion = true;
      if (M) M.remove(_medicEntity.id);
    }
    _tankerEntity = null;
    _medicEntity = null;
    _clearSupport();
  }

  // ══════════════════════════════════════
  // EGG & YOUNGLING SYSTEM — predators lay eggs that hatch into hull-boring younglings
  // ══════════════════════════════════════

  function _layEgg(predator) {
    // Egg drops from underbelly
    const offset = _v1.set(0, -20, 0).applyQuaternion(predator.quaternion);
    const egg = new Entity('egg',
      predator.position.x + offset.x,
      predator.position.y + offset.y,
      predator.position.z + offset.z);
    egg.velocity.set(0, 0, 0); // eggs float in space
    egg.radius = dim('entity.egg.radius');
    egg.hull = dim('entity.egg.hull');
    egg.shields = 0;
    egg._hatchTimer = dim('entity.egg.hatchTime') + Math.random() * dim('entity.egg.hatchRandom');
    egg._parentPredator = predator;
    state.entities.push(egg);
    if (window.SF3D) SF3D.spawnEgg(egg);
  }

  function _updateEggs(dt) {
    const ents = state.entities;
    for (let i = 0, len = ents.length; i < len; i++) {
      const e = ents[i];
      if (e.type !== 'egg' || e.markedForDeletion) continue;
      e._hatchTimer -= dt;
      if (e._hatchTimer <= 0) {
        // Hatch into youngling
        _spawnYoungling(e.position);
        e.markedForDeletion = true;
        if (M) M.remove(e.id);
        if (window.SF3D) SF3D.spawnEggHatch(e.position);
        if (window.SFAudio) SFAudio.playSound('egg_hatch');
      }
    }
  }

  function _spawnYoungling(pos) {
    const y = new Entity('youngling', pos.x, pos.y, pos.z);
    y.velocity.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
    y.radius = dim('entity.youngling.radius');
    y.hull = dim('entity.youngling.hull');
    y.shields = 0;
    y.maxSpeed = dim('entity.youngling.maxSpeed');
    y._attached = false;     // not yet attached to a ship
    y._attachTarget = null;  // which ship it's on
    y._boreProgress = 0;    // 0 = just attached, 1.0 = inside the ship
    y._cockpitProgress = 0; // 0 = hull breach started, 1.0 = reached cockpit
    y._insideShip = false;  // has breached the hull
    state.entities.push(y);
  }

  function _updateYounglings(dt) {
    const ents = state.entities;
    for (let i = 0, len = ents.length; i < len; i++) {
      const e = ents[i];
      if (e.type !== 'youngling' || e.markedForDeletion) continue;

      if (!e._attached) {
        // Seek nearest ship — younglings go for anything
        let target = state.player;
        let bestDist = Infinity;
        for (let j = 0, jlen = ents.length; j < jlen; j++) {
          const t = ents[j];
          if (t.type !== 'player' && t.type !== 'enemy' && t.type !== 'wingman') continue;
          if (t.markedForDeletion) continue;
          const d = t.position.distanceToSquared(e.position);
          if (d < bestDist) { bestDist = d; target = t; }
        }
        if (!target) continue;

        // Chase target
        _v1.copy(target.position).sub(e.position).normalize();
        e.velocity.copy(_v1).multiplyScalar(e.maxSpeed);

        // Check if close enough to attach (within 20m)
        if (bestDist < 400) { // 20²
          e._attached = true;
          e._attachTarget = target;
          e._boreProgress = 0;
          e.velocity.set(0, 0, 0);
          if (target.type === 'player') {
            SFAnnouncer.onHullBreach();
            if (window.SFAudio) SFAudio.playSound('hull_alarm');
            // Show emergency RTB button
            const rtbBtn = document.getElementById('btn-rtb');
            if (rtbBtn) rtbBtn.style.display = '';
          }
        }
      } else {
        // Attached to ship — bore into the hull
        const target = e._attachTarget;
        if (!target || target.markedForDeletion) {
          // Target destroyed — youngling detaches and seeks new target
          e._attached = false;
          e._attachTarget = null;
          e._boreProgress = 0;
          e._insideShip = false;
          e._cockpitProgress = 0;
          continue;
        }

        // Follow the ship (stay attached)
        e.position.copy(target.position);

        if (!e._insideShip) {
          // Boring through hull
          e._boreProgress += dt * dim('entity.youngling.boreRate');

          target.hull -= dt * dim('entity.youngling.damageRate');

          // Player can shake it off with thrust/afterburner
          if (target.type === 'player') {
            const isThrusting = state.player.afterburnerActive || state.player.boostActive || state.player.throttle > 0.8;
            if (isThrusting && e._boreProgress < 0.7) {
              // Shaking it off — harder the deeper it's bored
              const shakeChance = (1.0 - e._boreProgress) * dt * 1.5;
              if (Math.random() < shakeChance) {
                e._attached = false;
                e._attachTarget = null;
                e._boreProgress = 0;
                // Fling it away
                const fwd = _v1.set(0, 0, -1).applyQuaternion(state.player.quaternion);
                e.position.copy(state.player.position).add(fwd.multiplyScalar(-30));
                e.velocity.copy(fwd).multiplyScalar(-80);
                SFAnnouncer.onOrganismClear();
                if (window.SFAudio) SFAudio.playSound('comm_beep');
                // Hide RTB button if no more attached
                _checkHideRTBButton();
                continue;
              }
            } else if (e._boreProgress >= 0.7) {
              // Too deep — can't shake it off anymore
              if (!e._tooDeepWarned) {
                SFAnnouncer.onOrganismDeep();
                if (window.SFAudio) SFAudio.playSound('hull_alarm');
                e._tooDeepWarned = true;
              }
            }

            // Periodic alarm while attached
            if (!e._alarmTimer) e._alarmTimer = 0;
            e._alarmTimer -= dt;
            if (e._alarmTimer <= 0) {
              if (window.SFAudio) SFAudio.playSound('hull_alarm');
              e._alarmTimer = 3.0; // alarm every 3s
            }
          }

          // NPC ships — youngling just bores through and kills (simplified)
          if (target.type !== 'player' && e._boreProgress >= 1.0) {
            target.hull = 0;
            target.explode();
            e.markedForDeletion = true;
            if (M) M.remove(e.id);
            continue;
          }

          // Player — breach at 100%
          if (target.type === 'player' && e._boreProgress >= 1.0) {
            e._insideShip = true;
            e._cockpitProgress = 0;
            SFAnnouncer.onOrganismInside();
            if (window.SFAudio) SFAudio.playSound('hull_alarm');
          }
        } else {
          // Inside the ship — crawling toward cockpit
          e._cockpitProgress += dt * 0.12; // ~8s to reach cockpit

          // Periodic alarm escalates
          if (!e._cockpitAlarmTimer) e._cockpitAlarmTimer = 0;
          e._cockpitAlarmTimer -= dt;
          if (e._cockpitAlarmTimer <= 0) {
            if (window.SFAudio) SFAudio.playSound('hull_alarm');
            const pct = Math.floor(e._cockpitProgress * 100);
            SFAnnouncer.onOrganismProgress(pct);
            e._cockpitAlarmTimer = 2.0; // faster alerts as it gets closer
          }

          // Reached cockpit — game over
          if (e._cockpitProgress >= 1.0) {
            state.player.velocity.set(0, 0, 0);
            state.player.throttle = 0;
            e.markedForDeletion = true;
            if (M) M.remove(e.id);
            if (window.SFAudio) SFAudio.playSound('warning');
            state.player.markedForDeletion = true;
            if (M) M.remove(state.player.id);
            _onPlayerDestroyed('HULL INTEGRITY FAIL — COCKPIT BREACHED');
            return;
          }

          // If player lands at baseship, organism is purged
          // (handled in completeLanding)
        }
      }
    }
  }

  // ── Emergency RTB — panic button, auto-flies to base at max speed ──
  function _triggerEmergencyRTB() {
    if (state.phase !== 'combat') return;
    if (state._emergencyRTB) return; // already active

    state._emergencyRTB = true;
    state.phase = 'land-approach';
    state.autopilotActive = true;
    state.autopilotTimer = 0;
    SFAnnouncer.onEmergencyRTB();
    if (window.SFAudio) SFAudio.playSound('warning');
    if (window.SFMusic) SFMusic.setIntensity(0.9); // high tension

    // Show emergency HUD
    const cdEl = document.getElementById('countdown-display');
    cdEl.style.display = 'block';
    cdEl.innerHTML = '⚠ EMERGENCY RTB ⚠<br><span style="font-size:0.35em;color:#ff4444">ORGANISM ON BOARD — RACING TO BASE</span>';
    cdEl.style.fontSize = '2em';
    cdEl.style.color = '#ff0000';
  }

  // ── Request Dock — manual redock, player flies themselves ──
  function _requestDock() {
    if (state.phase !== 'combat') return;
    state.phase = 'land-approach';
    state.autopilotActive = false;
    state.autopilotTimer = 0;
    SFAnnouncer.onDockRequest();

    const cdEl = document.getElementById('countdown-display');
    cdEl.style.display = 'block';
    cdEl.innerHTML = 'DOCKING REQUESTED<br><span style="font-size:0.4em;color:#00ff88">Fly to base or press <b>SPACE</b> for autopilot</span>';
    cdEl.style.fontSize = '2em';
    cdEl.style.color = '#00ffff';
  }

  function _checkHideRTBButton() {
    // Hide RTB button if no younglings are attached to player
    const hasAttached = state.entities.some(e =>
      e.type === 'youngling' && !e.markedForDeletion && e._attached && e._attachTarget === state.player
    );
    if (!hasAttached) {
      const rtbBtn = document.getElementById('btn-rtb');
      if (rtbBtn) rtbBtn.style.display = 'none';
    }
  }

  // ── Predator directional armor: underbelly is vulnerable, rest is heavily armored ──
  function _predatorArmorDamage(baseDamage, projectile, predator) {
    // Get predator's local DOWN vector (underbelly = -Y in local space)
    const bellyDir = _v1.set(0, -1, 0).applyQuaternion(predator.quaternion).normalize();
    // Get direction projectile is traveling toward predator
    const hitDir = _v2.copy(predator.position).sub(projectile.position).normalize();
    // Dot product: 1.0 = hit from directly below (underbelly), -1.0 = from above (strongest armor)
    const bellyDot = bellyDir.dot(hitDir);

    if (bellyDot > 0.5) {
      // Underbelly hit — full damage (vulnerable spot)
      if (Math.random() < 0.3) { SFAnnouncer.onGoodHit(); }
      return baseDamage;
    } else if (bellyDot > 0.0) {
      // Glancing angle — 50% reduction
      return baseDamage * 0.5;
    } else {
      // Top/side armor — 75% reduction (very strong armor)
      return baseDamage * 0.25;
    }
  }

  // ── Handle plasma hit — special logic: disable, not kill ──
  function _handlePlasmaHit(plasma, victim) {
    // Distance-based damage falloff
    const travelDist = plasma.position.distanceTo(plasma._sourcePos);
    const falloff = Math.max(0.2, 1.0 - (travelDist / 750)); // 100% at source, 20% at max range
    const actualDamage = plasma.damage * falloff;

    if (victim.shields > 0) {
      // Shields absorb plasma but at heavy cost
      victim.shields -= actualDamage * 1.5; // plasma is extra draining on shields
      if (victim.shields < 0) {
        // Overflow damages hull
        const overflow = -victim.shields * 0.5; // shields absorbed some
        victim.shields = 0;
        victim.hull -= overflow;
      }
      // Shield held — ship has time to recover/escape
      if (victim.type === 'player' && victim.shields > 0) {
        SFAnnouncer.onPlasmaHit();
      }
    } else {
      // No shields — plasma hits hull directly
      victim.hull -= actualDamage;

      if (victim.hull <= 0) {
        // Hull breached — predator consumes the pilot (non-gory game over)
        if (victim.type === 'player') {
          // Disable the ship — controls go dead, screen fades
          state.player.velocity.set(0, 0, 0);
          state.player.throttle = 0;
          victim.markedForDeletion = true;
          if (M) M.remove(victim.id);
          SFAnnouncer.onPredatorConsume();
          if (window.SFAudio) SFAudio.playSound('warning');
          _onPlayerDestroyed('HULL INTEGRITY FAIL — PREDATOR BOARDING');
        } else {
          // NPC consumed — predator eats and heals (friend or foe — it doesn't care)
          victim.markedForDeletion = true;
          if (M) M.remove(victim.id);
          if (window.SF3D) SF3D.spawnExplosion(victim.position);
          // Flavor comms when predator attacks its own side
          if (victim.type === 'enemy' && Math.random() < 0.5) {
            SFAnnouncer.onPredatorMalfunction();
          }
          // Predator enters consume state
          if (plasma._sourceEntity && !plasma._sourceEntity.markedForDeletion) {
            plasma._sourceEntity._consuming = true;
            plasma._sourceEntity._consumeTimer = 4.0; // 4s eating animation
            plasma._sourceEntity._consumeTarget = victim;
          }
        }
        return;
      }

      // Hull damaged but not breached — disable ship temporarily
      if (victim.type === 'player' && !state._playerDisabled) {
        state._playerDisabled = true;
        state._disableTimer = 2.5; // 2.5s of no controls
        SFAnnouncer.onDisabled();
        if (window.SFAudio) SFAudio.playSound('warning');
      } else if (victim.type === 'enemy') {
        // Enemy ships also get stunned — velocity zeroed briefly
        victim.velocity.multiplyScalar(0.1);
        victim._plasmaStunned = true;
        victim._plasmaStunTimer = 2.0;
      }
    }

    plasma.markedForDeletion = true;
    if (M) M.remove(plasma.id);
    if (window.SF3D) SF3D.spawnImpactEffect(plasma.position, 0x44ff00); // green plasma splash
  }

  // ── Player disabled state — tick down in combat loop ──
  function _updateDisabledState(dt) {
    if (!state._playerDisabled) return;
    state._disableTimer -= dt;
    // Zero all controls while disabled
    state.player.throttle = 0;
    state.player.pitch = 0;
    state.player.yaw = 0;
    state.player.roll = 0;
    state.player.strafeH = 0;
    state.player.strafeV = 0;
    state.player.velocity.multiplyScalar(0.95); // drift to stop

    if (state._disableTimer <= 0) {
      state._playerDisabled = false;
      SFAnnouncer.onSystemsRestore();
      if (window.SFAudio) SFAudio.playSound('hud_power_up');
    }
  }

  function tryLockOnTarget(source) {
    let bestTarget = null;
    let bestScore = -Infinity;

    _v1.set(0, 0, -1).applyQuaternion(source.quaternion);

    const ents = state.entities;
    for (let i = 0, len = ents.length; i < len; i++) {
      const e = ents[i];
      if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' && e.type !== 'dreadnought' && e.type !== 'alien-baseship' && e.type !== 'predator') continue;
      if (e.markedForDeletion) continue;

      _v2.copy(e.position).sub(source.position);
      const dist = _v2.length();
      if (dist > 4000) continue;

      _v2.multiplyScalar(1 / dist); // normalize without creating new vector
      const dot = _v1.dot(_v2);
      if (dot > 0.8) {
        const score = dot * 10000 - dist;
        if (score > bestScore) { bestScore = score; bestTarget = e; }
      }
    }
    source.lockedTarget = bestTarget;
    if (bestTarget && window.SFAudio) SFAudio.playSound('lock_tone');
  }

  // ── Auto-targeting: acquire-then-hold lock; evasion erodes the timer ──
  // Crosshair establishes lock when an enemy enters the acquisition cone, then maintains
  // it through the wider break cone for up to holdTime seconds. Angular slip (target
  // drifting away from aim point — caused by evasive maneuvers) accelerates timer decay.
  let _crosshairLocked = false;
  let _crosshairTarget = null;
  let _lockHoldTimer = 0;
  let _lockPrevDot = 0;

  function _breakLock(crosshair) {
    _crosshairLocked = false;
    _crosshairTarget = null;
    _lockHoldTimer = 0;
    _lockPrevDot = 0;
    if (state.player) state.player.lockedTarget = null;
    if (crosshair) crosshair.classList.remove('locked');
  }

  function updateCrosshairTargeting(dt) {
    const p = state.player;
    const crosshair = document.getElementById('crosshair');
    if (!crosshair || !p) return;

    _v1.set(0, 0, -1).applyQuaternion(p.quaternion); // player forward

    // ── Hold phase: maintain existing lock through the break cone ──
    if (_crosshairLocked && _crosshairTarget && !_crosshairTarget.markedForDeletion) {
      _v2.copy(_crosshairTarget.position).sub(p.position);
      const dist = _v2.length();
      if (dist <= dim('targeting.holdRange')) {
        _v2.multiplyScalar(1 / dist);
        const dot = _v1.dot(_v2);
        if (dot >= dim('targeting.breakDot')) {
          // Angular slip = how fast target is escaping aim point (proxy for evasive maneuvers)
          const slip = Math.max(0, _lockPrevDot - dot);
          _lockHoldTimer += (dt || 0) + slip * dim('targeting.shakeRate');
          _lockPrevDot = dot;
          if (dot >= dim('targeting.refreshDot')) _lockHoldTimer = 0; // re-centering refreshes
          if (_lockHoldTimer < dim('targeting.holdTime')) {
            p.lockedTarget = _crosshairTarget;
            crosshair.classList.add('locked');
            crosshair.classList.remove('tracking');
            return;
          }
        }
      }
      _breakLock(crosshair);
    } else if (_crosshairLocked) {
      _breakLock(crosshair);
    }

    // ── Acquisition phase: scan for fresh target ──
    let bestTarget = null;
    let bestDot = -1;
    const ents = state.entities;
    for (let i = 0, len = ents.length; i < len; i++) {
      const e = ents[i];
      if (e.type !== 'enemy' && e.type !== 'interceptor' && e.type !== 'bomber' && e.type !== 'dreadnought' && e.type !== 'alien-baseship' && e.type !== 'predator') continue;
      if (e.markedForDeletion) continue;

      _v2.copy(e.position).sub(p.position);
      const dist = _v2.length();
      if (dist > 4000) continue; // weapon range

      _v2.multiplyScalar(1 / dist);
      const dot = _v1.dot(_v2);

      // ~15° cone for tracking awareness (cos(15°) ≈ 0.966)
      if (dot > 0.966 && dot > bestDot) {
        bestDot = dot;
        bestTarget = e;
      }
    }

    if (bestTarget && bestDot >= dim('targeting.acquireDot')) {
      _crosshairLocked = true;
      _crosshairTarget = bestTarget;
      _lockHoldTimer = 0;
      _lockPrevDot = bestDot;
      p.lockedTarget = bestTarget;
      crosshair.classList.add('locked');
      crosshair.classList.remove('tracking');
      if (window.SFAudio) SFAudio.playSound('lock_tone');
    } else if (bestTarget) {
      _crosshairTarget = bestTarget;
      crosshair.classList.remove('locked');
      crosshair.classList.add('tracking');
    } else {
      _crosshairTarget = null;
      crosshair.classList.remove('locked');
      crosshair.classList.remove('tracking');
    }
  }

  // GDD §10.1: Pulse cannon fire rate from manifold dimension
  let _lastFireTime = 0;

  function _countType(t) {
    let c = 0;
    for (let i = 0, len = state.entities.length; i < len; i++) {
      if (state.entities[i].type === t && !state.entities[i].markedForDeletion) c++;
    }
    return c;
  }

  function fireLaser(source, ownerType) {
    // Block player firing inside the bay / countdown / tutorial
    if (ownerType === 'player' && state.phase !== 'combat') return;
    const now = performance.now() / 1000;
    if (ownerType === 'player' && now - _lastFireTime < 1 / dim('weapon.laser.fireRate')) return;
    if (ownerType === 'player') {
      _lastFireTime = now;
      const cost = dim('weapon.laser.fuelCost');
      if (source.fuel < cost) return;
      source.fuel -= cost;
    }

    // Cap laser entities to prevent freeze
    if (_countType('laser') >= dim('cap.lasers')) return;

    // GDD §10.1: Dual linked pulse cannons — two bolts fired simultaneously
    _v1.set(0, 0, -10).applyQuaternion(source.quaternion);
    const l = new Entity('laser',
      source.position.x + _v1.x,
      source.position.y + _v1.y,
      source.position.z + _v1.z);
    l.quaternion.copy(source.quaternion);
    // Projectile speed from manifold dimension
    _v1.set(0, 0, -dim('weapon.laser.speed')).applyQuaternion(l.quaternion);
    l.velocity.copy(_v1);
    l.owner = ownerType;
    l._ownerCallsign = source.callsign || ownerType;
    l.radius = dim('weapon.laser.radius');
    l.maxAge = dim('weapon.laser.maxAge') || 2;
    l._spawnTime = state.elapsed;
    l.damage = dim('weapon.laser.damage');
    state.entities.push(l);
    if (ownerType === 'player') state.missionStats.shotsFired++;
    if (window.SF3D) SF3D.spawnLaser(l);
    if (window.SFAudio) SFAudio.playSound('laser');
  }

  function fireTorpedo(source, ownerType) {
    // Block player firing inside the bay / countdown / tutorial
    if (ownerType === 'player' && state.phase !== 'combat') return;
    if (source.torpedoes <= 0) return;
    // Cap torpedo entities to prevent freeze
    if (_countType('torpedo') >= dim('cap.torpedoes')) return;
    if (ownerType === 'player') {
      const cost = dim('weapon.torpedo.fuelCost');
      if (source.fuel < cost) return;
      source.fuel -= cost;
    }
    source.torpedoes--;

    _v1.set(0, -10, -20).applyQuaternion(source.quaternion);
    const t = new Entity('torpedo',
      source.position.x + _v1.x,
      source.position.y + _v1.y,
      source.position.z + _v1.z);
    t.quaternion.copy(source.quaternion);
    // Torpedo speed from manifold dimension
    _v1.set(0, 0, -dim('weapon.torpedo.speed')).applyQuaternion(t.quaternion);
    t.velocity.copy(_v1);
    t.owner = ownerType;
    t._ownerCallsign = source.callsign || ownerType;
    t.radius = dim('weapon.torpedo.radius');
    t.target = source.lockedTarget;
    t.maxAge = dim('weapon.torpedo.maxAge') || 6;
    t._spawnTime = state.elapsed;
    t.damage = dim('weapon.torpedo.damage');
    t.launchTime = performance.now() / 1000;
    state.entities.push(t);
    if (ownerType === 'player') state.missionStats.shotsFired++;
    if (window.SFAudio) SFAudio.playSound('torpedo');
  }

  // ── Machine Gun — rapid spread fire, low damage per round, high volume ──
  let _lastGunFireTime = 0;

  function fireMachineGun(source, ownerType) {
    if (ownerType === 'player' && state.phase !== 'combat') return;
    const now = performance.now() / 1000;
    if (ownerType === 'player' && now - _lastGunFireTime < 1 / dim('weapon.gun.fireRate')) return;
    if (ownerType === 'player') {
      _lastGunFireTime = now;
      const cost = dim('weapon.gun.fuelCost');
      if (source.fuel < cost) return;
      source.fuel -= cost;
    }
    if (_countType('machinegun') >= dim('cap.machinegun')) return;

    _v1.set(0, 0, -10).applyQuaternion(source.quaternion);
    const g = new Entity('machinegun',
      source.position.x + _v1.x,
      source.position.y + _v1.y,
      source.position.z + _v1.z);
    g.quaternion.copy(source.quaternion);
    // Random spread — cone of fire
    const spread = dim('weapon.gun.spread');
    const rx = (Math.random() - 0.5) * spread;
    const ry = (Math.random() - 0.5) * spread;
    _q1.setFromEuler(new THREE.Euler(rx, ry, 0));
    g.quaternion.multiply(_q1);
    _v1.set(0, 0, -dim('weapon.gun.speed')).applyQuaternion(g.quaternion);
    g.velocity.copy(_v1);
    g.owner = ownerType;
    g.radius = dim('weapon.gun.radius');
    g.maxAge = dim('weapon.gun.maxAge') || 1.5;
    g._spawnTime = state.elapsed;
    g.damage = dim('weapon.gun.damage');
    state.entities.push(g);
    if (window.SF3D) SF3D.spawnLaser(g); // reuse laser visual, tinted differently
    if (window.SFAudio) SFAudio.playSound('laser'); // TODO: distinct gun sound
  }

  // ── Pulse EMP — close-range spherical burst, disables enemies, no damage ──
  let _lastPulseFireTime = 0;

  function firePulseEMP(source, ownerType) {
    if (ownerType === 'player' && state.phase !== 'combat') return;
    const now = performance.now() / 1000;
    if (ownerType === 'player' && now - _lastPulseFireTime < 1 / dim('weapon.pulse.fireRate')) return;
    if (ownerType === 'player') {
      _lastPulseFireTime = now;
      const cost = dim('weapon.pulse.fuelCost');
      if (source.fuel < cost) return;
      source.fuel -= cost;
    }

    // Spherical EMP burst — stun all enemies within range
    const pulseRange = dim('weapon.pulse.range');
    const pulseRangeSq = pulseRange * pulseRange;
    const stunDur = dim('weapon.pulse.stunDuration');
    let stunCount = 0;
    for (let i = 0, len = state.entities.length; i < len; i++) {
      const e = state.entities[i];
      if (e === source || e.markedForDeletion) continue;
      if (e.type === 'laser' || e.type === 'machinegun' || e.type === 'torpedo' ||
        e.type === 'baseship' || e.type === 'tanker' || e.type === 'medic' ||
        e.type === 'wingman' || e.type === 'plasma') continue;
      const dx = e.position.x - source.position.x;
      const dy = e.position.y - source.position.y;
      const dz = e.position.z - source.position.z;
      if (dx * dx + dy * dy + dz * dz < pulseRangeSq) {
        e._plasmaStunned = true;
        e._plasmaStunTimer = stunDur;
        stunCount++;
      }
    }
    if (window.SF3D && SF3D.spawnEMPBurst) SF3D.spawnEMPBurst(source.position, pulseRange);
    if (window.SFAudio) SFAudio.playSound('emp');
    SFAnnouncer.onEMP(stunCount, stunDur);
  }

  // ── Fire primary — dispatches based on selected weapon ──
  function firePrimary() {
    const p = state.player;
    if (!p) return;
    // Weapon dispatch — slots unlock by level: 1=laser, 2+=spread, 3+=torp, 4+=EMP
    switch (p.selectedWeapon) {
      case 0: fireLaser(p, 'player'); break;
      case 1: fireMachineGun(p, 'player'); break;
      case 2: fireTorpedo(p, 'player'); break;
      case 3: firePulseEMP(p, 'player'); break;
    }
  }

  function handleCollision(a, b) {
    // ── Egg collision — ships hitting eggs take damage (egg's only defense) ──
    if (a.type === 'egg' && b.type !== 'laser' && b.type !== 'torpedo' && b.type !== 'plasma') {
      b.takeDamage(dim('damage.eggSplash'));
      a.markedForDeletion = true;
      if (M) M.remove(a.id);
      if (window.SF3D) SF3D.spawnImpactEffect(a.position, 0x88ff00);
      return;
    }
    if (b.type === 'egg' && a.type !== 'laser' && a.type !== 'torpedo' && a.type !== 'plasma') {
      a.takeDamage(dim('damage.eggSplash'));
      b.markedForDeletion = true;
      if (M) M.remove(b.id);
      if (window.SF3D) SF3D.spawnImpactEffect(b.position, 0x88ff00);
      return;
    }

    // ── Youngling — skip collisions (they attach via proximity in _updateYounglings) ──
    if (a.type === 'youngling' || b.type === 'youngling') {
      // Lasers/torpedoes can destroy them normally (handled below)
      if (a.type !== 'laser' && a.type !== 'torpedo' && b.type !== 'laser' && b.type !== 'torpedo') return;
    }

    // ── Plasma special handling — disable, don't kill directly ──
    if (a.type === 'plasma') {
      if (b.type === 'predator') return; // predators immune to own plasma
      if (b.type === 'baseship' || b.type === 'alien-baseship') return; // too strong for plasma
      if (b.type === 'egg' || b.type === 'youngling') return; // organic — immune to plasma
      _handlePlasmaHit(a, b);
      return;
    }
    if (b.type === 'plasma') {
      if (a.type === 'predator') return;
      if (a.type === 'baseship' || a.type === 'alien-baseship') return; // too strong for plasma
      if (a.type === 'egg' || a.type === 'youngling') return; // organic — immune to plasma
      _handlePlasmaHit(b, a);
      return;
    }

    if (a.type === 'laser' || a.type === 'machinegun' || a.type === 'torpedo') {
      const damage = a.damage || (a.type === 'torpedo' ? 80 : 15);
      const weaponLabel = a.type === 'torpedo' ? 'Torpedo' : a.type === 'machinegun' ? 'MG' : 'Laser';
      if (window.SF3D) {
        const color = a.type === 'torpedo' ? 0x4488ff : a.type === 'machinegun' ? 0xffcc00 : 0x00ffaa;
        SF3D.spawnImpactEffect(a.position, color);
      }
      if (!(b.type === 'player' && state.phase === 'launching')) {
        const effectiveDmg = b.type === 'predator' ? _predatorArmorDamage(damage, a, b) : damage;
        b._killedByWeapon = weaponLabel;
        if (a.owner === 'player') b.killedBy = 'player';
        else if (a.owner === 'wingman') b.killedBy = a._ownerCallsign || 'Wingman';
        else b.killedBy = a.owner || 'Enemy';
        b.takeDamage(effectiveDmg);
        state.missionStats.damageDealt += effectiveDmg;
        if (a.owner === 'player') state.missionStats.shotsHit++;
        // ANPC kill tracking: if a wingman's projectile killed an enemy
        if (b.markedForDeletion && a.owner === 'wingman') {
          const shooter = state.entities.find(e => e.type === 'wingman' && !e.markedForDeletion && e._anpc);
          if (shooter) _onWingmanKill(shooter, b);
        }
      }
      a.markedForDeletion = true;
    } else if (b.type === 'laser' || b.type === 'machinegun' || b.type === 'torpedo') {
      const damage = b.damage || (b.type === 'torpedo' ? 80 : 15);
      const weaponLabel = b.type === 'torpedo' ? 'Torpedo' : b.type === 'machinegun' ? 'MG' : 'Laser';
      if (window.SF3D) {
        const color = b.type === 'torpedo' ? 0x4488ff : b.type === 'machinegun' ? 0xffcc00 : 0x00ffaa;
        SF3D.spawnImpactEffect(b.position, color);
      }
      if (!(a.type === 'player' && state.phase === 'launching')) {
        const effectiveDmg = a.type === 'predator' ? _predatorArmorDamage(damage, b, a) : damage;
        a._killedByWeapon = weaponLabel;
        if (b.owner === 'player') a.killedBy = 'player';
        else if (b.owner === 'wingman') a.killedBy = b._ownerCallsign || 'Wingman';
        else a.killedBy = b.owner || 'Enemy';
        a.takeDamage(effectiveDmg);
        state.missionStats.damageDealt += effectiveDmg;
        if (b.owner === 'player') state.missionStats.shotsHit++;
        // ANPC kill tracking
        if (a.markedForDeletion && b.owner === 'wingman') {
          const shooter = state.entities.find(e => e.type === 'wingman' && !e.markedForDeletion && e._anpc);
          if (shooter) _onWingmanKill(shooter, a);
        }
      }
      b.markedForDeletion = true;
    } else {
      // Physical crash - skip if player during launch
      if (!(state.phase === 'launching' && (a.type === 'player' || b.type === 'player'))) {
        a.takeDamage(50);
        b.takeDamage(50);

        if (window.SF3D) {
          SF3D.spawnImpactEffect(a.position.clone().add(b.position).multiplyScalar(0.5), 0xff0088);
        }

        // Bounce
        const n = a.position.clone().sub(b.position).normalize();
        a.velocity.add(n.clone().multiplyScalar(50));
        b.velocity.sub(n.clone().multiplyScalar(50));
      }
    }
  }

  function updateHUD() {
    if (!state.player || state.player.markedForDeletion) return;
    // Kill feed overlay — render every frame for fade animation
    _renderKillFeed();
    const speed = Math.floor(state.player.velocity.length());
    const throttle = Math.floor(state.player.throttle * 100);
    const fuel = Math.floor(state.player.fuel);
    const hullPct = Math.floor((state.player.hull / dim('player.hull')) * 100);
    const shieldPct = Math.floor((state.player.shields / dim('player.shields')) * 100);
    const basePct = Math.floor((state.baseship.hull / dim('baseship.hull')) * 100);
    const maxSpd = state.player.hyperdriveActive ? state.player.hyperdriveSpeed
      : state.player.boostActive ? state.player.boostSpeed
        : state.player.afterburnerActive ? state.player.afterburnerSpeed
          : state.player.maxSpeed;

    const hudSignature = [
      speed, throttle, fuel, hullPct, shieldPct, basePct,
      maxSpd, state.wave, state.score, state.player.torpedoes, state.kills,
      state.player.boostActive ? 1 : 0,
      Math.ceil(state.player.boostCooldown || 0),
      state.player.flightAssist ? 1 : 0,
      state.player.afterburnerActive ? 1 : 0,
      state.player.hyperdriveActive ? 1 : 0,
      state.player.hyperdriveSpooling ? 1 : 0,
      Math.ceil(state.player.hyperdriveCooldown || 0)
    ].join('|');
    const hudChanged = hudSignature !== _lastHudSignature;
    if (hudChanged) _lastHudSignature = hudSignature;

    // Update HTML gauge elements (kept for compat)
    const ge = id => document.getElementById(id);
    const el = ge('hud-speed');
    if (el && hudChanged) {
      el.innerText = speed;
      ge('hud-throttle').innerText = throttle;
      ge('hud-fuel').innerText = fuel;
      ge('hud-hull').innerText = hullPct;
      ge('hud-shields').innerText = shieldPct;
      ge('hud-base-hull').innerText = basePct;
      ge('hud-wave').innerText = state.wave;
      ge('hud-score').innerText = state.score;
      ge('hud-torpedoes').innerText = state.player.torpedoes;
      ge('gauge-speed').style.width = Math.min(100, (speed / maxSpd) * 100) + '%';
      ge('gauge-throttle').style.width = throttle + '%';
      ge('gauge-fuel').style.width = fuel + '%';
      ge('gauge-hull').style.width = hullPct + '%';
      ge('gauge-shields').style.width = shieldPct + '%';
      ge('gauge-base').style.width = basePct + '%';
      ge('gauge-hull').className = 'gauge-fill ' + (hullPct < 30 ? 'red' : 'blue');
      ge('gauge-shields').className = 'gauge-fill ' + (shieldPct < 30 ? 'orange' : 'blue');
      ge('gauge-base').className = 'gauge-fill ' + (basePct < 20 ? 'red' : basePct < 50 ? 'orange' : 'orange');
    }

    // Flash warning if baseship critical
    let message = 'DEFEND THE BASESHIP';
    if (basePct < 20) {
      message = 'BASESHIP CRITICAL';
      const msg = ge('hud-message');
      if (msg) {
        msg.style.color = msg.style.color === '#ff0000' ? '#ffff00' : '#ff0000';
        msg.innerText = message;
      }
    }

    // ── Feed telemetry to 3D cockpit screens ──
    if (hudChanged && window.SF3D && SF3D.updateTelemetryScreen) {
      SF3D.updateTelemetryScreen({
        speed, maxSpeed: maxSpd, throttle, fuel,
        hull: hullPct, shields: shieldPct, basePct,
        score: state.score, wave: state.wave,
        torpedoes: state.player.torpedoes,
        kills: state.kills,
        message: basePct < 20 ? message : null
      });
    }

    // ── Feed gameplay HUD overlay ──
    const gh = id => document.getElementById(id);
    const gShield = gh('ghud-shield');
    if (gShield && hudChanged) {
      gShield.innerText = shieldPct;
      gShield.className = 'hud-val' + (shieldPct < 25 ? ' warn' : shieldPct < 50 ? ' caution' : '');
      gh('ghud-shield-bar').style.width = shieldPct + '%';
      gh('ghud-hull').innerText = hullPct;
      gh('ghud-hull').className = 'hud-val' + (hullPct < 25 ? ' warn' : hullPct < 50 ? ' caution' : '');
      gh('ghud-hull-bar').style.width = hullPct + '%';
      gh('ghud-fuel').innerText = fuel;
      gh('ghud-fuel').className = 'hud-val' + (fuel < 20 ? ' warn' : fuel < 40 ? ' caution' : '');
      gh('ghud-fuel-bar').style.width = fuel + '%';
      gh('ghud-torpedoes').innerText = state.player.torpedoes;
      gh('ghud-torpedoes').className = 'hud-val' + (state.player.torpedoes === 0 ? ' warn' : '');
      // Weapon selector indicator
      const wpnEl = gh('ghud-weapon');
      if (wpnEl) {
        const wpnNames = ['LASER', 'GUN', 'PULSE', 'TORP'];
        const wpnColors = ['#00ff88', '#ffcc00', '#cc44ff', '#00ccff'];
        const wi = state.player.selectedWeapon || 0;
        wpnEl.innerText = wpnNames[wi];
        wpnEl.style.color = wpnColors[wi];
      }
      gh('ghud-kills').innerText = state.kills;
      gh('ghud-score').innerText = state.score;
      gh('ghud-wave').innerText = state.wave;

      // GDD §11: Boost cooldown indicator
      const boostEl = gh('ghud-boost');
      const boostBar = gh('ghud-boost-bar');
      if (boostEl) {
        if (state.player.boostActive) {
          boostEl.innerText = 'ACTIVE';
          boostEl.style.color = '#ff8800';
          boostBar.style.width = ((state.player.boostTimer / 3.0) * 100) + '%';
          boostBar.style.background = 'linear-gradient(90deg, #ff8800, #ffcc00)';
        } else if (state.player.boostCooldown > 0) {
          const cdPct = Math.floor((state.player.boostCooldown / 8.0) * 100);
          boostEl.innerText = Math.ceil(state.player.boostCooldown) + 's';
          boostEl.style.color = '#ff4444';
          boostBar.style.width = cdPct + '%';
          boostBar.style.background = 'linear-gradient(90deg, #882200, #ff4444)';
        } else {
          boostEl.innerText = 'RDY';
          boostEl.style.color = '#00ff88';
          boostBar.style.width = '0%';
        }
      }

      // GDD §11: Flight Assist indicator
      const faEl = gh('ghud-fa');
      if (faEl) {
        faEl.innerText = state.player.flightAssist ? 'ON' : 'OFF';
        faEl.style.color = state.player.flightAssist ? '#00ff88' : '#ff4444';
      }

      // Speed mode indicator
      const modeEl = gh('ghud-speed-mode');
      if (modeEl) {
        if (state.player.hyperdriveActive) {
          modeEl.innerText = 'HYPERDRIVE';
          modeEl.style.color = '#ff00ff';
        } else if (state.player.hyperdriveSpooling) {
          modeEl.innerText = 'SPOOLING...';
          modeEl.style.color = '#cc44ff';
        } else if (state.player.boostActive) {
          modeEl.innerText = 'BOOST';
          modeEl.style.color = '#ff8800';
        } else if (state.player.afterburnerActive) {
          modeEl.innerText = 'AFTERBURN';
          modeEl.style.color = '#ffcc00';
        } else if (state.player.hyperdriveCooldown > 0) {
          modeEl.innerText = 'HYPER CD ' + Math.ceil(state.player.hyperdriveCooldown) + 's';
          modeEl.style.color = '#884488';
        } else {
          modeEl.innerText = 'CRUISE';
          modeEl.style.color = '#0ff';
        }
      }
    }

    // ── Rank insignia + kill tally display ──
    if (hudChanged && window.SFProgression) {
      let rankEl = gh('ghud-rank');
      if (!rankEl) {
        // Create rank + tally container dynamically (bottom-left of HUD)
        const container = document.createElement('div');
        container.id = 'ghud-rank-container';
        container.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:200;pointer-events:none;font-family:monospace;';
        container.innerHTML =
          '<div id="ghud-rank" style="font-size:11px;color:#ffdd44;text-shadow:0 0 6px #ff8800;margin-bottom:4px;"></div>' +
          '<div id="ghud-rank-bar" style="width:140px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-bottom:6px;"><div id="ghud-rank-fill" style="height:100%;border-radius:2px;background:linear-gradient(90deg,#ff8800,#ffdd44);width:0%;"></div></div>' +
          '<div id="ghud-credits" style="font-size:10px;color:#88ccee;margin-bottom:6px;"></div>' +
          '<div id="ghud-tally" style="font-size:13px;line-height:1.4;"></div>';
        document.body.appendChild(container);
        rankEl = gh('ghud-rank');
      }
      const rank = SFProgression.getRank();
      const nextRank = SFProgression.getNextRank();
      const progress = SFProgression.getRankProgress();
      const career = SFProgression.career();

      rankEl.innerHTML = rank.icon + ' ' + rank.name + (nextRank ? ' <span style="color:#556;font-size:9px;">→ ' + nextRank.name + '</span>' : ' <span style="color:#ffaa00;font-size:9px;">MAX RANK</span>');
      const fill = gh('ghud-rank-fill');
      if (fill) fill.style.width = (progress * 100) + '%';
      const creditsEl = gh('ghud-credits');
      if (creditsEl) creditsEl.innerText = '₡ ' + career.credits + '  |  XP: ' + career.xp;
      const tallyEl = gh('ghud-tally');
      if (tallyEl) tallyEl.innerHTML = SFProgression.renderKillTallyHTML();
    }

    // Radar delta updates: only when player moved/rotated, lock changed, or budget elapsed.
    const now = performance.now();
    const p = state.player.position;
    const q = state.player.quaternion;
    const lockId = state.player.lockedTarget ? state.player.lockedTarget.id : '';
    const posDeltaSq =
      (p.x - _lastRadarPx) * (p.x - _lastRadarPx) +
      (p.y - _lastRadarPy) * (p.y - _lastRadarPy) +
      (p.z - _lastRadarPz) * (p.z - _lastRadarPz);
    const quatDrift =
      Math.abs(q.x - _lastRadarQx) + Math.abs(q.y - _lastRadarQy) +
      Math.abs(q.z - _lastRadarQz) + Math.abs(q.w - _lastRadarQw);
    const shouldUpdateRadar =
      (now - _lastRadarPushMs) > 40 ||
      posDeltaSq > 9 ||
      quatDrift > 0.0004 ||
      lockId !== _lastRadarLockId;

    if (shouldUpdateRadar) {
      updateRadar();
      if (window.SF3D && SF3D.updateRadarTexture) {
        SF3D.updateRadarTexture();
      }
      _lastRadarPushMs = now;
      _lastRadarPx = p.x; _lastRadarPy = p.y; _lastRadarPz = p.z;
      _lastRadarQx = q.x; _lastRadarQy = q.y; _lastRadarQz = q.z; _lastRadarQw = q.w;
      _lastRadarLockId = lockId;
    }
  }

  // ── 3D Sphere Radar — GDD §7 ──
  // Player at dead center. Forward direction indicated. Entities shown as blips.
  // Elevation ticks show above/below. Base always marked. Targeted entity pulses.
  let radarScene, radarCamera, radarRenderer;
  let radarSphere, radarShipMarker, radarForwardMarker, radarBaseMarker;
  let radarElevRing;
  let radarLevelRing;      // baseship-orientation horizon
  let radarLevelUp;        // small "up" tick on level ring
  let radarFovCone;        // camera FOV wedge group
  let radarFovEdges;       // wireframe edges of FOV pyramid
  let radarFovFaces;       // semi-transparent faces of FOV pyramid
  let radarFovRangeTicks;  // range tick groups inside FOV cone
  let radarFovRangeLabels; // distance text labels inside FOV cone
  let radarVectorMeter;    // 3-axis orientation gizmo group
  let radarAxisFwd, radarAxisUp, radarAxisRight; // axis arrow meshes
  let radarCardinalLabels; // F/B/U/D/L/R orientation markers on sphere surface
  let radarOrientGroup;    // group that holds cardinal labels (rotates with inverse ship quat)
  let radarBlipPool = [];
  const RADAR_RANGE = dim('radar.range');
  const RADAR_SHIP_OFFSET = 0.35; // player dot offset toward rear (+Z) for depth perception
  let _lastHudSignature = '';
  let _lastRadarPushMs = 0;
  let _lastRadarPx = 0, _lastRadarPy = 0, _lastRadarPz = 0;
  let _lastRadarQx = 0, _lastRadarQy = 0, _lastRadarQz = 0, _lastRadarQw = 1;
  let _lastRadarLockId = '';
  let radarSweepGroup;          // rotating sweep beam group
  let radarRangeRings = [];     // equatorial range ring meshes
  const radarContacts = new Map(); // entity → {t, wx, wy, wz, type, dist}

  function initRadar() {
    const canvas = document.getElementById('radar-canvas');
    if (!canvas) return;

    radarScene = new THREE.Scene();

    // Camera angled from above-behind — tilted to show depth in sphere
    radarCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    radarCamera.position.set(0, 1.6, 2.4);
    radarCamera.lookAt(0, -0.1, 0);

    radarRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    radarRenderer.setSize(324, 324, false);
    radarRenderer.setClearColor(0x000000, 0.3);

    // Wireframe sphere shell (the radar globe)
    const sphereGeo = new THREE.SphereGeometry(1.0, 24, 24);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.06
    });
    radarSphere = new THREE.Mesh(sphereGeo, sphereMat);
    radarScene.add(radarSphere);

    // Elevation ring (equatorial disc) — shows horizon plane
    const ringGeo = new THREE.RingGeometry(0.98, 1.0, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide
    });
    radarElevRing = new THREE.Mesh(ringGeo, ringMat);
    radarElevRing.rotation.x = Math.PI / 2;
    radarScene.add(radarElevRing);

    // ── Player ship marker — offset toward rear (+Z) so forward has depth ──
    // Ship sits at 0.35 back from center, giving 0.65 units of forward depth
    const SHIP_OFFSET = 0.35;
    const shipGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const shipMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    radarShipMarker = new THREE.Mesh(shipGeo, shipMat);
    radarShipMarker.position.set(0, 0, SHIP_OFFSET);
    radarScene.add(radarShipMarker);

    // GDD §7: Forward direction indicator — small cone pointing where player faces
    const fwdGeo = new THREE.ConeGeometry(0.035, 0.10, 6);
    const fwdMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    radarForwardMarker = new THREE.Mesh(fwdGeo, fwdMat);
    radarScene.add(radarForwardMarker);

    // ── 3D FOV Pyramid — shows camera viewport as a clipped pyramid inside the sphere ──
    // Built from ship position toward forward (-Z), matching camera FOV
    // Clipped to the sphere surface so it reads as a 3D volume
    const camFOV = 75;
    const aspect = 16 / 9;
    const halfV = THREE.MathUtils.degToRad(camFOV / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const wedgeLen = 0.92; // distance from apex to sphere edge
    const farHalfW = Math.tan(halfH) * wedgeLen;
    const farHalfH = Math.tan(halfV) * wedgeLen;
    // Pyramid apex at origin of group (will be positioned at ship marker)
    const fz = -wedgeLen;
    const apex = new THREE.Vector3(0, 0, 0);
    const ftr = new THREE.Vector3(farHalfW, farHalfH, fz);
    const ftl = new THREE.Vector3(-farHalfW, farHalfH, fz);
    const fbl = new THREE.Vector3(-farHalfW, -farHalfH, fz);
    const fbr = new THREE.Vector3(farHalfW, -farHalfH, fz);

    // Clip far corners to sphere surface (radius 1.0 from world origin)
    // Since the group sits at shipOff, clamp so no corner exceeds sphere
    [ftr, ftl, fbl, fbr].forEach(v => {
      const worldPos = v.clone();
      worldPos.z += SHIP_OFFSET; // account for group position
      const len = worldPos.length();
      if (len > 0.98) {
        worldPos.multiplyScalar(0.98 / len);
        v.copy(worldPos);
        v.z -= SHIP_OFFSET;
      }
    });

    radarFovCone = new THREE.Group();
    radarFovCone.position.set(0, 0, SHIP_OFFSET);
    radarScene.add(radarFovCone);

    // Wireframe edges — bright green, clearly visible
    const wedgeEdgeGeo = new THREE.BufferGeometry().setFromPoints([
      apex, ftr, apex, ftl, apex, fbl, apex, fbr,  // 4 edges from apex
      ftr, ftl, ftl, fbl, fbl, fbr, fbr, ftr       // far rectangle
    ]);
    const wedgeEdgeMat = new THREE.LineBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.5
    });
    radarFovEdges = new THREE.LineSegments(wedgeEdgeGeo, wedgeEdgeMat);
    radarFovCone.add(radarFovEdges);

    // Semi-transparent pyramid faces — visible 3D volume
    const wedgeFaceGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      // top face
      apex.x, apex.y, apex.z, ftl.x, ftl.y, ftl.z, ftr.x, ftr.y, ftr.z,
      // bottom face
      apex.x, apex.y, apex.z, fbr.x, fbr.y, fbr.z, fbl.x, fbl.y, fbl.z,
      // left face
      apex.x, apex.y, apex.z, fbl.x, fbl.y, fbl.z, ftl.x, ftl.y, ftl.z,
      // right face
      apex.x, apex.y, apex.z, ftr.x, ftr.y, ftr.z, fbr.x, fbr.y, fbr.z,
      // far cap: two triangles
      ftr.x, ftr.y, ftr.z, ftl.x, ftl.y, ftl.z, fbl.x, fbl.y, fbl.z,
      ftr.x, ftr.y, ftr.z, fbl.x, fbl.y, fbl.z, fbr.x, fbr.y, fbr.z,
    ]);
    wedgeFaceGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    wedgeFaceGeo.computeVertexNormals();
    const wedgeFaceMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, depthWrite: false
    });
    radarFovFaces = new THREE.Mesh(wedgeFaceGeo, wedgeFaceMat);
    radarFovCone.add(radarFovFaces);

    // ── Range Ticks inside FOV Cone ──
    // Small perpendicular marks at 1/3 and 2/3 distance along each FOV edge
    // with distance labels (shows how far objects in your view are)
    radarFovRangeTicks = new THREE.Group();
    radarFovRangeLabels = [];
    {
      const apex = new THREE.Vector3(0, 0, SHIP_OFFSET);
      const halfH = Math.tan(THREE.MathUtils.degToRad(75 / 2));
      const halfW = halfH * 1.5;
      const corners = [
        new THREE.Vector3(-halfW, halfH, SHIP_OFFSET - 0.92),  // top-left
        new THREE.Vector3(halfW, halfH, SHIP_OFFSET - 0.92),   // top-right
        new THREE.Vector3(halfW, -halfH, SHIP_OFFSET - 0.92),  // bottom-right
        new THREE.Vector3(-halfW, -halfH, SHIP_OFFSET - 0.92), // bottom-left
      ];
      const tickMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5 });

      for (const frac of [0.33, 0.66]) {
        // Draw tick across each edge at this fraction
        const tickPts = [];
        for (const corner of corners) {
          const pt = apex.clone().lerp(corner, frac);
          tickPts.push(pt);
        }
        // Connect the 4 tick points to form a rectangle at this distance
        tickPts.push(tickPts[0].clone()); // close the loop
        const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
        const tickLine = new THREE.Line(tickGeo, tickMat);
        radarFovRangeTicks.add(tickLine);

        // Distance label — create a tiny canvas texture for text
        const rangeKm = Math.round(RADAR_RANGE * frac / 1000);
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 64;
        labelCanvas.height = 24;
        const lctx = labelCanvas.getContext('2d');
        lctx.fillStyle = '#00ffcc';
        lctx.font = 'bold 16px monospace';
        lctx.textAlign = 'center';
        lctx.fillText(rangeKm + 'km', 32, 16);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.7, depthTest: false });
        const labelSprite = new THREE.Sprite(labelMat);
        // Position at the bottom edge midpoint of this range ring
        const bottomMid = apex.clone().lerp(
          new THREE.Vector3(0, -halfH, SHIP_OFFSET - 0.92), frac
        );
        labelSprite.position.copy(bottomMid);
        labelSprite.position.y -= 0.04;
        labelSprite.scale.set(0.12, 0.05, 1);
        radarFovRangeTicks.add(labelSprite);
        radarFovRangeLabels.push(labelSprite);
      }
    }
    radarFovCone.add(radarFovRangeTicks);

    // ── Cardinal Orientation Labels (F/B/U/D/L/R) on Sphere Surface ──
    // These rotate with the INVERSE of the ship quaternion, so they show
    // world-space directions. Player always knows which way is "up" in the arena.
    radarOrientGroup = new THREE.Group();
    radarCardinalLabels = {};
    {
      const LABEL_R = 0.97; // just inside sphere surface
      const cardinals = [
        { key: 'F', text: 'FWD', color: '#00ff88', pos: [0, 0, -LABEL_R] },
        { key: 'B', text: 'AFT', color: '#ff4444', pos: [0, 0, LABEL_R] },
        { key: 'U', text: 'UP', color: '#00ccff', pos: [0, LABEL_R, 0] },
        { key: 'D', text: 'DWN', color: '#ff8800', pos: [0, -LABEL_R, 0] },
        { key: 'L', text: 'PRT', color: '#cc88ff', pos: [-LABEL_R, 0, 0] },
        { key: 'R', text: 'STB', color: '#ffcc44', pos: [LABEL_R, 0, 0] },
      ];
      for (const c of cardinals) {
        const cvs = document.createElement('canvas');
        cvs.width = 64;
        cvs.height = 32;
        const ctx = cvs.getContext('2d');
        // Background pill
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(2, 2, 60, 28, 6);
        ctx.fill();
        // Text
        ctx.fillStyle = c.color;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.text, 32, 17);
        const tex = new THREE.CanvasTexture(cvs);
        const mat = new THREE.SpriteMaterial({
          map: tex, transparent: true, opacity: 0.75,
          depthTest: false, sizeAttenuation: true
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(c.pos[0], c.pos[1], c.pos[2]);
        sprite.scale.set(0.16, 0.08, 1);
        radarOrientGroup.add(sprite);
        radarCardinalLabels[c.key] = sprite;
      }
    }
    radarScene.add(radarOrientGroup);

    // ── 3-Axis Vector Meter — shows ship orientation relative to world frame ──
    // Forward (green), Up (cyan), Right (red) arrows from ship marker
    radarVectorMeter = new THREE.Group();
    radarVectorMeter.position.set(0, 0, SHIP_OFFSET);
    radarScene.add(radarVectorMeter);

    function _makeAxisArrow(color, length) {
      const group = new THREE.Group();
      // Shaft
      const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, length, 6);
      const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.y = length / 2;
      group.add(shaft);
      // Arrowhead
      const headGeo = new THREE.ConeGeometry(0.03, 0.06, 6);
      const headMat = new THREE.MeshBasicMaterial({ color });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = length;
      group.add(head);
      return group;
    }

    // Forward axis — green — points where ship faces
    radarAxisFwd = _makeAxisArrow(0x00ff88, 0.28);
    radarVectorMeter.add(radarAxisFwd);

    // Up axis — cyan — points where ship's roof faces
    radarAxisUp = _makeAxisArrow(0x00ccff, 0.22);
    radarVectorMeter.add(radarAxisUp);

    // Right axis — red/orange — points to ship's starboard
    radarAxisRight = _makeAxisArrow(0xff6644, 0.18);
    radarVectorMeter.add(radarAxisRight);

    // GDD §7: Base marker — always visible, larger blue diamond
    const baseGeo = new THREE.OctahedronGeometry(0.08, 0);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    radarBaseMarker = new THREE.Mesh(baseGeo, baseMat);
    radarBaseMarker.visible = false;
    radarScene.add(radarBaseMarker);

    // Entity blip pool — larger blips for visibility
    for (let i = 0; i < 80; i++) {
      const geo = new THREE.SphereGeometry(0.055, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const blip = new THREE.Mesh(geo, mat);
      blip.visible = false;
      radarScene.add(blip);
      radarBlipPool.push(blip);
    }

    // ── Sweep beam — rotating great-circle meridian (3D radar scan line) ──
    radarSweepGroup = new THREE.Group();
    // Full great-circle arc on sphere surface (in YZ plane, rotates around Y)
    const sweepArcPts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      sweepArcPts.push(new THREE.Vector3(0, Math.sin(a) * 0.94, Math.cos(a) * 0.94));
    }
    radarSweepGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(sweepArcPts),
      new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.55 })
    ));
    // Sweep disc — transparent scanning plane for 3D depth
    const sweepDiscGeo = new THREE.CircleGeometry(0.94, 48);
    radarSweepGroup.add(new THREE.Mesh(sweepDiscGeo, new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.06,
      side: THREE.DoubleSide, depthWrite: false
    })));
    // Radial spoke — center to equatorial rim (clock hand)
    radarSweepGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.94, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 })
    ));
    radarScene.add(radarSweepGroup);

    // ── Range rings — equatorial circles at 1/3 and 2/3 radar range ──
    radarRangeRings = [];
    for (const frac of [0.33, 0.66]) {
      const r = frac * 0.92;
      const rrGeo = new THREE.RingGeometry(r - 0.004, r + 0.004, 48);
      const rrMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide
      });
      const rr = new THREE.Mesh(rrGeo, rrMat);
      rr.rotation.x = Math.PI / 2;
      radarScene.add(rr);
      radarRangeRings.push(rr);
    }

    // ── Level Ring — baseship's orientation horizon ──
    const lvlGeo = new THREE.RingGeometry(0.96, 0.98, 48);
    const lvlMat = new THREE.MeshBasicMaterial({
      color: 0xff8800, transparent: true, opacity: 0.25, side: THREE.DoubleSide
    });
    radarLevelRing = new THREE.Mesh(lvlGeo, lvlMat);
    radarScene.add(radarLevelRing);

    // Small "up" tick on level ring
    const tickGeo = new THREE.ConeGeometry(0.025, 0.08, 4);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    radarLevelUp = new THREE.Mesh(tickGeo, tickMat);
    radarScene.add(radarLevelUp);

    radarScene.add(new THREE.AmbientLight(0xffffff, 1));
  }

  function updateRadar() {
    if (!radarScene || !radarRenderer) {
      initRadar();
      if (!radarScene) return;
    }

    const pPos = state.player.position;
    const pQuat = state.player.quaternion;

    // Inverse quaternion — transforms world directions into ship-local space
    // Forward (-Z) is always "ahead" on the radar display
    const invQuat = pQuat.clone().invert();

    // Sphere wireframe doesn't rotate — fixed reference frame
    radarSphere.quaternion.set(0, 0, 0, 1);

    // Ship marker stays at fixed center offset
    const shipOff = new THREE.Vector3(0, 0, RADAR_SHIP_OFFSET);

    // Forward marker — fixed position (always points "ahead" in ship-local = -Z)
    const localFwd = new THREE.Vector3(0, 0, -1); // always -Z in ship frame
    radarForwardMarker.position.copy(localFwd).multiplyScalar(1.05);
    radarForwardMarker.lookAt(shipOff);
    radarForwardMarker.rotateX(Math.PI / 2);

    // FOV cone — fixed orientation (always points forward in ship-local space)
    if (radarFovCone) {
      radarFovCone.quaternion.set(0, 0, 0, 1); // identity — forward is -Z
    }

    // Cardinal orientation labels — rotate with INVERSE ship quaternion
    // so they show WORLD-SPACE directions on the sphere surface
    // Player can always see which way is "up" in the arena regardless of roll/pitch
    if (radarOrientGroup) {
      radarOrientGroup.quaternion.copy(invQuat);
    }

    // Vector Meter — show world axes in ship-local space
    if (radarVectorMeter) {
      // World up in ship-local frame
      const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
      const worldFwd = new THREE.Vector3(0, 0, -1); // always local forward
      const worldRight = new THREE.Vector3(1, 0, 0); // always local right

      const upRef = new THREE.Vector3(0, 1, 0);
      radarAxisFwd.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(upRef, worldFwd));
      radarAxisUp.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(upRef, worldUp));
      radarAxisRight.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(upRef, worldRight));
    }

    // Level Ring — baseship's horizon in ship-local space
    if (radarLevelRing && state.baseship) {
      const baseQuat = state.baseship.quaternion || new THREE.Quaternion();
      const baseUp = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuat).applyQuaternion(invQuat);
      const ringQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), baseUp
      );
      radarLevelRing.quaternion.copy(ringQuat);
      if (radarLevelUp) {
        radarLevelUp.position.copy(baseUp).multiplyScalar(0.97);
        radarLevelUp.lookAt(0, 0, 0);
        radarLevelUp.rotateX(Math.PI);
      }
    }

    // Base marker — transform world direction into ship-local space
    if (state.baseship) {
      const baseRel = state.baseship.position.clone().sub(pPos);
      const baseDist = baseRel.length();
      if (baseDist > 1) {
        // Transform to ship-local
        const baseLocal = baseRel.normalize().applyQuaternion(invQuat);
        const baseT = Math.min(baseDist / RADAR_RANGE, 1.0);
        radarBaseMarker.position.copy(baseLocal).multiplyScalar(baseT * 0.92).add(shipOff);
        radarBaseMarker.visible = true;
        radarBaseMarker.material.opacity = baseT > 0.9 ? 0.5 : 1.0;
        radarBaseMarker.material.transparent = true;
        if (state.phase === 'land-approach') {
          const pulse = 0.08 + Math.sin(performance.now() * 0.008) * 0.03;
          radarBaseMarker.scale.setScalar(pulse / 0.08);
        } else {
          radarBaseMarker.scale.setScalar(1.0);
        }
      } else {
        radarBaseMarker.visible = false;
      }
    }

    // Sweep beam — rotates in ship-local space
    const SWEEP_PERIOD = dim('radar.sweepPeriod');
    const BEAM_HALF = THREE.MathUtils.degToRad(dim('radar.beamWidth') / 2);
    const PERSISTENCE = dim('radar.persistence');
    const nowSec = performance.now() / 1000;
    const sweepAngle = ((nowSec / SWEEP_PERIOD) % 1.0) * Math.PI * 2;
    if (radarSweepGroup) radarSweepGroup.rotation.y = sweepAngle;

    // Sweep detection — check entity azimuth in ship-local space
    const TWO_PI = Math.PI * 2;
    state.entities.forEach(e => {
      if (e === state.player || e.type === 'laser' || e.type === 'machinegun' || e.type === 'baseship') return;
      const rx = e.position.x - pPos.x;
      const ry = e.position.y - pPos.y;
      const rz = e.position.z - pPos.z;
      const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (dist < 1 || dist > RADAR_RANGE * 1.2) return;

      // Transform to ship-local for azimuth check
      const localDir = new THREE.Vector3(rx, ry, rz).normalize().applyQuaternion(invQuat);
      let az = Math.atan2(localDir.x, -localDir.z); // -Z is forward
      if (az < 0) az += TWO_PI;
      let sw = sweepAngle % TWO_PI;
      if (sw < 0) sw += TWO_PI;
      let diff = Math.abs(az - sw);
      if (diff > Math.PI) diff = TWO_PI - diff;

      if (diff < BEAM_HALF) {
        radarContacts.set(e, {
          t: nowSec,
          // Store ship-local direction for rendering
          lx: localDir.x, ly: localDir.y, lz: localDir.z,
          type: e.type, dist: dist
        });
      }
    });

    // Render contacts as fading phosphor blips
    radarBlipPool.forEach(b => b.visible = false);
    let blipIdx = 0;
    const lockedTarget = state.player.lockedTarget;
    const _DPr = M ? M.DiningPhilosophers : null;

    // Locked target always tracked (real-time position, not sweep-gated)
    // 🍴 Fork check — skip if target entity was destroyed
    if (lockedTarget && lockedTarget.position && lockedTarget !== state.player &&
      lockedTarget.type !== 'laser' && lockedTarget.type !== 'baseship' &&
      (!_DPr || _DPr.acquire(lockedTarget.id, 'radar'))) {
      const lx = lockedTarget.position.x - pPos.x;
      const ly = lockedTarget.position.y - pPos.y;
      const lz = lockedTarget.position.z - pPos.z;
      const ld = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (ld > 1) {
        const localDir = new THREE.Vector3(lx, ly, lz).normalize().applyQuaternion(invQuat);
        const existing = radarContacts.get(lockedTarget);
        if (!existing || (nowSec - existing.t) > SWEEP_PERIOD * 0.5) {
          radarContacts.set(lockedTarget, {
            t: nowSec,
            lx: localDir.x, ly: localDir.y, lz: localDir.z,
            type: lockedTarget.type, dist: ld
          });
        }
      }
    }

    radarContacts.forEach((c, entity) => {
      const age = nowSec - c.t;
      if (age > SWEEP_PERIOD) { radarContacts.delete(entity); return; }
      if (blipIdx >= radarBlipPool.length) return;

      // Re-compute ship-local direction for live entities (smooth tracking)
      let nx = c.lx, ny = c.ly, nz = c.lz;
      if (entity.position && !entity.markedForDeletion) {
        const dx = entity.position.x - pPos.x;
        const dy = entity.position.y - pPos.y;
        const dz = entity.position.z - pPos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 1) {
          const live = new THREE.Vector3(dx, dy, dz).normalize().applyQuaternion(invQuat);
          nx = live.x; ny = live.y; nz = live.z;
          c.dist = d;
        }
      }

      const t = Math.min(c.dist / RADAR_RANGE, 1.0);
      const radarR = t * 0.92;

      const blip = radarBlipPool[blipIdx++];
      blip.position.set(
        nx * radarR + shipOff.x,
        ny * radarR + shipOff.y,
        nz * radarR + shipOff.z
      );
      blip.visible = true;

      // Phosphor fade
      const sweepFrac = age / SWEEP_PERIOD;
      const fadeAlpha = PERSISTENCE * (1.0 - sweepFrac);

      // IFF color coding (GDD §6)
      if (c.type === 'enemy') {
        blip.material.color.setHex(0xff2222);
        blip.scale.setScalar(1.0);
      } else if (c.type === 'interceptor') {
        blip.material.color.setHex(0xff4444);
        blip.scale.setScalar(0.8);
      } else if (c.type === 'bomber') {
        blip.material.color.setHex(0xff8800);
        blip.scale.setScalar(1.4);
      } else if (c.type === 'dreadnought') {
        blip.material.color.setHex(0xff0044);
        blip.scale.setScalar(2.5);
      } else if (c.type === 'alien-baseship') {
        blip.material.color.setHex(0xff00ff);
        blip.scale.setScalar(2.0);
      } else if (c.type === 'predator') {
        blip.material.color.setHex(0xcc0000);
        blip.scale.setScalar(1.3);
      } else if (c.type === 'torpedo') {
        blip.material.color.setHex(0x00ffff);
        blip.scale.setScalar(0.7);
      } else if (c.type === 'wingman') {
        blip.material.color.setHex(0x44ff44);
        blip.scale.setScalar(1.0);
      } else if (c.type === 'tanker') {
        blip.material.color.setHex(0x00ff88);
        blip.scale.setScalar(1.2);
      } else if (c.type === 'medic') {
        blip.material.color.setHex(0x44ffff);
        blip.scale.setScalar(1.3);
      } else {
        blip.material.color.setHex(0x4488ff);
        blip.scale.setScalar(1.0);
      }

      // Locked target — always visible, pulses yellow
      if (lockedTarget && entity === lockedTarget) {
        blip.material.color.setHex(0xffff00);
        const pulse = 1.0 + Math.sin(performance.now() * 0.01) * 0.5;
        blip.scale.multiplyScalar(pulse);
        blip.material.transparent = true;
        blip.material.opacity = Math.max(fadeAlpha, 0.7);
        return;
      }

      blip.material.transparent = true;
      blip.material.opacity = fadeAlpha;

      // FOV highlight — in ship-local space, forward is -Z, so dot = -nz
      const cosHalfFov = Math.cos(THREE.MathUtils.degToRad(75 / 2));
      if (-nz > cosHalfFov) {
        blip.material.opacity = Math.min(fadeAlpha + 0.3, 1.0);
        blip.scale.multiplyScalar(1.2);
      }
    });

    radarRenderer.render(radarScene, radarCamera);

    // 🍴 Release radar forks
    if (_DPr) _DPr.releaseAll('radar');
  }

  return {
    init,
    getState: () => state,
    getPhase: () => state.phase,
    firePrimary,
    fireLaser: () => fireLaser(state.player, 'player'),
    fireTorpedo: () => fireTorpedo(state.player, 'player'),
    fireMachineGun: () => fireMachineGun(state.player, 'player'),
    firePulseEMP: () => firePulseEMP(state.player, 'player'),
    cycleWeapon: () => state.player && state.player.cycleWeapon(),
    tryLockOnTarget: () => tryLockOnTarget(state.player),
    emergencyRTB: _triggerEmergencyRTB,
    requestDock: _requestDock,
    callTanker: () => _callSupport('tanker'),
    callMedic: () => _callSupport('medic'),
    togglePause,
    pause: () => _setPaused(true),
    resume: () => _setPaused(false),
    exitGame,
    openTutorial
  };

})();

window.Starfighter = Starfighter;

// Global upgrade purchase handler (called by between-wave shop onclick)
window._sfBuyUpgrade = function (id) {
  if (!window.SFProgression) return;
  const result = SFProgression.purchaseUpgrade(id);
  if (result.success) {
    if (window.SFAudio) SFAudio.playSound('click');
    // Refresh the shop display
    const shop = document.getElementById('upgrade-shop');
    if (shop) {
      const career = SFProgression.career();
      shop.querySelectorAll('div[onclick]').forEach(function (el) {
        const onclick = el.getAttribute('onclick');
        if (onclick && onclick.includes(id)) {
          el.style.borderColor = 'rgba(0,255,100,0.5)';
          el.innerHTML = '<div style="color:#00ff88;font-weight:bold;">' + result.upgrade.name + '</div><div style="color:#00ff88;">✓ Installed</div>';
        }
      });
      // Update credits display
      const creditsDiv = shop.previousElementSibling;
      if (creditsDiv) creditsDiv.textContent = 'Credits: ₡' + career.credits;
    }
  } else {
    if (window.SFAudio) SFAudio.playSound('warning');
  }
};

