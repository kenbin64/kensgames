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
    'player.maxSpeed': 380,    // base thrust m/s
    'player.afterburnerSpeed': 900,    // afterburner max m/s
    'player.boostSpeed': 1200,   // boost max m/s
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
    'player.strafeSpeed': 200,     // lateral m/s
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
