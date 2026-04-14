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
    'player.maxSpeed': 120,    // base thrust m/s
    'player.afterburnerSpeed': 280,    // afterburner max m/s
    'player.boostSpeed': 400,    // boost max m/s
    'player.hull': 100,    // starting hull
    'player.shields': 100,    // starting shields
    'player.torpedoes': 8,      // torpedo magazine
    'player.fuel': 100,    // fuel capacity
    'player.boostDuration': 3.0,    // seconds
    'player.boostFuelCost': 25,     // fuel units per boost
    'player.boostCooldown': 8.0,    // seconds after boost expires
    'player.afterburnerBurn': 5,      // fuel units/second
    'player.fuelRegen': 2,      // fuel units/second when idle
    'player.strafeSpeed': 60,     // lateral m/s
    'player.faDamping': 2.0,    // FA-ON velocity→0 seconds
    'player.faLerp': 0.08,   // FA-ON smooth factor
    'player.pitchDamp': 0.9,    // per-frame pitch decay
    'player.yawDamp': 0.9,    // per-frame yaw decay
    'player.rollDamp': 0.9,    // per-frame roll decay
    'player.strafeHDamp': 0.8,    // per-frame horizontal strafe decay
    'player.strafeVDamp': 0.8,    // per-frame vertical strafe decay
    'player.radius': 10,     // collision radius

    // ── Baseship ──
    'baseship.hull': 5000,
    'baseship.shields': 2000,
    'baseship.radius': 500,
    'baseship.repairHull': 1000,   // hull restored between waves
    'baseship.repairShields': 500,    // shields restored between waves

    // ── Weapons ──
    'weapon.laser.speed': 800,    // m/s projectile velocity
    'weapon.laser.damage': 15,     // per hit
    'weapon.laser.maxAge': 2.5,    // seconds (range = speed × age)
    'weapon.laser.fireRate': 6,      // rounds per second
    'weapon.laser.radius': 2,      // collision radius
    'weapon.laser.fuelCost': 0.3,    // fuel per shot
    'weapon.gun.speed': 600,      // m/s — slower but more spread
    'weapon.gun.damage': 6,       // low damage per round
    'weapon.gun.maxAge': 1.8,     // shorter range than laser
    'weapon.gun.fireRate': 18,    // rounds per second (rapid)
    'weapon.gun.radius': 1.5,    // smaller projectile
    'weapon.gun.fuelCost': 0.15,  // fuel per round (cheap per shot, adds up)
    'weapon.gun.spread': 0.04,   // radians max spread per axis
    'weapon.pulse.speed': 0,      // no projectile — spherical burst
    'weapon.pulse.damage': 0,     // no damage — disables instead
    'weapon.pulse.range': 200,    // effective radius meters
    'weapon.pulse.stunDuration': 3.0,  // seconds target disabled
    'weapon.pulse.fireRate': 0.25,     // 1 shot per 4 seconds
    'weapon.pulse.fuelCost': 20,  // expensive — strategic use
    'weapon.torpedo.speed': 200,    // initial m/s
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

    // ── Entity Stats ──
    'entity.interceptor.radius': 8,
    'entity.bomber.radius': 20,
    'entity.alien-baseship.radius': 350,
    'entity.predator.radius': 40,
    'entity.dreadnought.radius': 300,
    'entity.alien-base.radius': 500,
    'entity.tanker.hull': 5000,
    'entity.tanker.shields': 2000,
    'entity.tanker.maxSpeed': 60,
    'entity.tanker.radius': 30,
    'entity.tanker.fuelRepairRate': 30,
    'entity.tanker.hullRepairRate': 5,
    'entity.tanker.shieldRepairRate': 15,
    'entity.tanker.dockRange': 100,
    'entity.tanker.orbitDist': 2500,      // safe orbit distance from combat center
    'entity.tanker.dockDuration': 5,      // seconds to resupply
    'entity.medic.hull': 9999,
    'entity.medic.shields': 9999,
    'entity.medic.maxSpeed': 75,
    'entity.medic.radius': 35,
    'entity.medic.hullRepairRate': 12,
    'entity.medic.shieldRepairRate': 20,
    'entity.medic.dockRange': 110,
    'entity.medic.orbitDist': 2800,       // safe orbit distance from combat center
    'entity.medic.dockDuration': 6,       // seconds to repair

    // Support call eligibility thresholds
    'support.tanker.fuelThreshold': 25,   // fuel % below which tanker call is valid
    'support.tanker.hullThreshold': 60,   // hull % below which tanker call is valid
    'support.tanker.shieldThreshold': 30, // shield % — needs BOTH hull+shield low
    'support.medic.hullThreshold': 50,    // hull % below which medic call is valid
    'support.medic.shieldThreshold': 10,  // shields % below which medic call is valid (dire)
    'support.autopilotSpeed': 180,        // m/s cruise speed to support ship
    'support.returnSpeed': 150,           // m/s cruise speed back to combat
    'entity.egg.radius': 6,
    'entity.egg.hull': 30,
    'entity.egg.hatchTime': 4,
    'entity.egg.hatchRandom': 3,
    'entity.youngling.radius': 4,
    'entity.youngling.hull': 15,
    'entity.youngling.maxSpeed': 200,
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
    'enemy.fireRange': 800,        // base fire range (meters)
    'enemy.heavyRange': 3000,      // dreadnought heavy torp range
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
    'damage.collision': 50,

    // ── Timing ──
    'timing.launch': 8.0,    // launch sequence seconds
    'timing.landing': 5.0,    // landing sequence seconds
    'timing.comm': 8.0,    // random comm interval
    'timing.respawn': 7.0,    // respawn countdown
    'timing.entrySpeed': 100,    // speed exiting bay into combat

    // ── Radar ──
    'radar.range': 5000,   // detection range meters
    'radar.sweepPeriod': 4.0,    // seconds per full rotation
    'radar.beamWidth': 12,       // degrees — angular detection band
    'radar.persistence': 0.85,   // blip opacity retention over sweep period

    // ── Lives ──
    'lives.max': 3,

    // ── Arena ──
    'arena.radius': 8000,

    // ── Hive ──
    'hive.hull': 5000,
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
