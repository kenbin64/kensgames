// ═══════════════════════════════════════════════════════════════════════
// STARFIGHTER — combat enhancer (additive, no source edits)
// ═══════════════════════════════════════════════════════════════════════
// 1. Bright cylindrical lasers — green for friendly, red for enemy.
// 2. Spawn band 1200–2400 m + 6 s re-clamp window so AI doesn't drift hostiles back out.
// 3. Density boost via _currentMission.diffScale (swarm).
// 4. Constellation overlay on top of the 6000-point starfield.
// 5. Decorative asteroid drift field (InstancedMesh, ~250 rocks).
// 6. Per-mission setting backdrop: earth-orbit / saturn / jupiter / deep-space / belt.
// 7. Radar φ-scaled via CSS transform on #radar-overlay (2.0 × 0.618 ≈ 1.236).
// 8. Dynamic music intensity from z = x·y² (hostile pressure × proximity).
// 9. Periodic diagnostics → console (3 s).
// 10. Force ?glb=1 so hero ships render their full GLB models, not block proxies.
// 11. Ambient + hemisphere fill so back-lit angles aren't pitch black.
//
// All knobs at the top. Loaded after starfighter.bundle.js + codex.js.

// ── Strip any forced GLB flag ───────────────────────────────────────────
// Rendering is manifold-procedural by default. GLBs proved the structure;
// the actual graphics come from manifold expressions in three.js + css.
// If `?glb=1` is present in the URL, remove it so 3d.js takes the
// procedural path (see `_USE_GLB_HERO_ASSETS` in 3d.js).
(function _stripGLBFlag() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('glb')) {
      u.searchParams.delete('glb');
      history.replaceState(null, '', u.toString());
    }
  } catch (_) { /* noop */ }
})();

const SFEnhance = (function () {
  'use strict';

  // ── Tunables ──────────────────────────────────────────────────────────
  const COLOR_FRIENDLY = 0x33ff66;
  const COLOR_ENEMY = 0xff3344;
  const BEAM_LENGTH = 80;
  const BEAM_RADIUS = 0.32;          // each of the two beams (slightly thinner — paired)
  const GLOW_RADIUS = 1.6;           // halo per beam
  const BEAM_SEPARATION = 1.6;       // half-distance between the two parallel beams (wing spread)
  const BEAM_CONVERGENCE = 180;      // metres ahead at which the two beams cross (crosshair distance)
  const AMBIENT_BOOST = 0.22;        // additive ambient (avoids pitch-black back angles)
  const HEMI_SKY = 0x6688aa;
  const HEMI_GROUND = 0x221a14;
  const HEMI_INTENSITY = 0.35;
  const SPAWN_NEAR = 1200;
  const SPAWN_FAR = 2400;
  const RECLAMP_WINDOW_S = 6;
  const DIFF_BOOST = 6.0;
  // Hostile proximity at which the hull-resonance buzz starts to bite.
  const HULL_RES_RANGE = 1800;
  const CONSTELLATION_N = 140;
  const ASTEROID_INITIAL = 180;     // big rocks placed at mission start
  const ASTEROID_MAX = 600;         // total slots — leaves room for fragmentation
  const ASTEROID_SIZE_MIN = 40;     // tier-0 minimum radius
  const ASTEROID_SIZE_MAX = 160;    // tier-0 maximum radius
  const ASTEROID_VAPORIZE = 12;     // below this radius, hits vaporize instead of split
  const ASTEROID_SPLIT_FACTOR = 0.55;
  const ASTEROID_SPLIT_COUNT = 3;
  const ASTEROID_RING_R = 4500;
  const ASTEROID_RING_W = 1800;
  const ASTEROID_STRIDE = 14;        // floats per slot (see _asteroidDrift comment)
  const ASTEROID_BURST_SPEED = 90;   // m/s outward velocity given to shatter fragments
  const ASTEROID_BURST_DECAY = 0.6;  // per-second exponential decay of fragment velocity
  const ASTEROID_RING_H = 600;
  const ASTEROID_ORBIT_OMEGA = 0.015; // rad/s belt sweep speed
  const ASTEROID_IMPACT_MIN_SPEED = 18;
  const ASTEROID_IMPACT_COOLDOWN_S = 0.28;
  const ASTEROID_IMPACT_BLAST_K = 0.38;
  const ASTEROID_SHIP_DMG_SIZE_K = 0.34;
  const ASTEROID_SHIP_DMG_SPEED_K = 0.22;
  const ASTEROID_SHIP_DMG_MIN = 8;
  const ASTEROID_SHIP_DMG_MAX = 220;
  const THREAT_ALARM_INTERVAL_S = 1.15;
  const COUNTERMEASURE_RADIUS = 900;
  const COUNTERMEASURE_COOLDOWN_S = 6.0;
  const COUNTERMEASURE_FUEL_COST = 8;
  const POWERUP_MAX = 8;
  const POWERUP_PICKUP_R = 52;
  const POWERUP_LIFETIME_S = 28;
  const POWERUP_SPAWN_MIN_S = 5.5;
  const POWERUP_SPAWN_MAX_S = 9.0;
  const POWERUP_TYPES = ['shield', 'hull', 'fuel', 'torpedo'];
  const RADAR_SCALE = 2.0 * 0.618;
  const DIAG_INTERVAL_S = 3;

  // ── Scoring ───────────────────────────────────────────────────────────
  const SCORE_ASTEROID = { 0: 5, 1: 8, 2: 12 };  // by tier
  const SCORE_KILL = {
    enemy: 100, interceptor: 150, bomber: 200, predator: 400,
    dreadnought: 1500, 'alien-baseship': 1500, 'hive-queen': 3000,
  };
  const CAREER_KEY = 'sfenhance.career.v1';

  // ── Internal state ────────────────────────────────────────────────────
  let _scene = null;
  const _bolts = new Map();           // entity.id → bolt group record
  const _seenAt = new Map();          // entity.id → first-sight timestamp (s)
  const _missionsBoosted = new WeakSet();
  const _settingsApplied = new WeakSet();
  let _asteroidMesh = null;
  // 14 floats per slot: px,py,pz, rx,ry,rz, avx,avy,avz, lvx,lvy,lvz, scale, tier
  // (avx/avy/avz = angular tumble velocity; lvx/lvy/lvz = linear burst velocity)
  let _asteroidDrift = null;
  let _asteroidTexture = null;        // shared procedural rock map
  let _asteroidActive = 0;            // count of live (scale>0) slots, for diag
  let _constellationsAdded = false;
  let _backdropGroup = null;
  let _planetMoons = [];
  const _shipRockCooldown = new Map(); // `${shipId}:${slot}` -> gameTime seconds
  const _powerups = [];                // floating collectible boosts
  let _powerupSpawnTimer = 0;
  let _radarScaled = false;
  let _radarScene = null;             // captured from radar WebGLRenderer.render() call
  let _renderer = null;               // main WebGLRenderer (needed for PMREMGenerator)
  let _envApplied = false;            // scene.environment installed
  let _radarFovCone = null;           // green pyramid Group inside radarScene
  let _radarFovEdges = null;          // LineSegments child
  let _radarFovFaces = null;          // Mesh child (semi-transparent volume)
  let _radarFovApexZ = 0.35;          // SHIP_OFFSET in radar-local space
  let _radarFovWedgeLen = 0.92;       // far cap distance from apex (sphere radius ≈ 1.0)
  let _radarFovLastAspect = 0;        // rebuild trigger when window aspect changes
  let _lastDiag = 0;
  let _gameTimeS = 0;
  let _settingName = 'earth-orbit';
  let _hudEl = null;
  let _hostileLastFrame = new Map();  // id → { type, lastDist } from previous tick (for kill detection)
  let _friendlyShotLastPos = new Map(); // projectile id -> last world position for swept asteroid hits
  let _asteroidPairTtl = new Map(); // "low:high" -> seconds remaining for pair collision cooldown
  let _assistInputBound = false;
  let _assistTargetIdx = -1;
  let _assistRetargetTimer = 0;
  let _assistTuningLevel = '';
  let _assistCurrentWave = 1;
  let _assistCurrentState = null;
  let _threatHud = null;
  let _threatSoundCd = 0;
  let _countermeasureCd = 0;
  let _emergencyBtn = null;
  let _medicBayBanner = null;
  let _sortie = null;                 // { startTimeS, score, kills, asteroids, missionRef }
  let _career = { sorties: 0, bestSurvivalSec: 0, lifetimeScore: 0 };

  // ── Scene capture ─────────────────────────────────────────────────────
  // First Scene.add() call after install captures the active scene.
  function _captureScene() {
    if (!window.THREE || !THREE.Scene) return;
    const origAdd = THREE.Scene.prototype.add;
    THREE.Scene.prototype.add = function (...args) {
      if (!_scene) _scene = this;
      return origAdd.apply(this, args);
    };
  }

  // ── Radar scene capture ───────────────────────────────────────────────
  // The radar is rendered by a separate WebGLRenderer attached to the
  // <canvas id="radar-canvas"> element; that scene is closed inside
  // core.js's IIFE. Hook WebGLRenderer.prototype.render once, recognize
  // the radar render call by its canvas id, capture (scene, camera), then
  // self-uninstall so we don't pay the dispatch cost on every frame.
  function _captureRadarScene() {
    if (!window.THREE || !THREE.WebGLRenderer || !THREE.WebGLRenderer.prototype) return;
    const proto = THREE.WebGLRenderer.prototype;
    const orig = proto.render;
    proto.render = function (scene, camera) {
      if (!_radarScene && this.domElement && this.domElement.id === 'radar-canvas') {
        _radarScene = scene;
      } else if (this.domElement && this.domElement.id !== 'radar-canvas') {
        if (!_renderer) _renderer = this;
        if (!_scene && scene) _scene = scene;
      }
      if (_radarScene && _renderer) proto.render = orig; // unhook once both captured
      return orig.apply(this, arguments);
    };
  }

  // ── Beam geometry: dual parallel beams toed inward to converge on crosshair ──
  // Forward axis is -Z (laserEntity quaternion's forward). Beams are offset on
  // local X by ±BEAM_SEPARATION and rotated by a small angle on local Y so they
  // cross at distance BEAM_CONVERGENCE ahead of the muzzle.
  function _makeOneBeam(color, sideSign) {
    const grp = new THREE.Group();
    const coreGeo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_LENGTH, 6, 1, true);
    coreGeo.translate(0, BEAM_LENGTH * 0.5, 0);
    coreGeo.rotateX(Math.PI * 0.5);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.renderOrder = 110;
    grp.add(core);

    const glowGeo = new THREE.CylinderGeometry(GLOW_RADIUS, GLOW_RADIUS, BEAM_LENGTH, 8, 1, true);
    glowGeo.translate(0, BEAM_LENGTH * 0.5, 0);
    glowGeo.rotateX(Math.PI * 0.5);
    const glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.renderOrder = 109;
    grp.add(glow);

    grp.position.x = sideSign * BEAM_SEPARATION;
    // toe-in: rotate around local Y so the beam aims slightly inward
    grp.rotation.y = -sideSign * Math.atan2(BEAM_SEPARATION, BEAM_CONVERGENCE);
    return { group: grp, core, glow };
  }

  function _makeBeamMesh(color /*, isFriendly */) {
    const grp = new THREE.Group();
    const left = _makeOneBeam(color, -1);
    const right = _makeOneBeam(color, +1);
    grp.add(left.group);
    grp.add(right.group);
    return {
      group: grp,
      core: left.core, glow: left.glow,         // primary refs (used by tick pulse)
      core2: right.core, glow2: right.glow,
    };
  }

  // ── spawnLaser override ───────────────────────────────────────────────
  function _installLaserOverride() {
    if (!window.SF3D || typeof SF3D.spawnLaser !== 'function') return;
    SF3D.spawnLaser = function (laserEntity) {
      if (!_scene || !laserEntity || !laserEntity.position) return;
      const isFriendly = laserEntity.owner === 'player' || laserEntity.owner === 'wingman';
      const color = isFriendly ? COLOR_FRIENDLY : COLOR_ENEMY;

      const { group, core, glow } = _makeBeamMesh(color, isFriendly);
      // Orient mesh quaternion to laser's quaternion (its forward = -Z is the beam axis)
      group.position.copy(laserEntity.position);
      if (laserEntity.quaternion) group.quaternion.copy(laserEntity.quaternion);
      _scene.add(group);
      _bolts.set(laserEntity.id, { group, core, glow, color, age: 0 });

      // Muzzle point light (kept brief — the existing render pipeline does not have one for these)
      const flash = new THREE.PointLight(color, 14, 140);
      flash.position.copy(laserEntity.position);
      _scene.add(flash);
      setTimeout(() => { _scene.remove(flash); flash.dispose && flash.dispose(); }, 90);
    };
  }

  // ── Per-frame: follow entities, retire dead bolts, pull in spawns ─────
  const HOSTILE = { enemy: 1, interceptor: 1, bomber: 1, predator: 1, dreadnought: 1, 'alien-baseship': 1, 'hive-queen': 1 };
  let _lastTickMs = 0;
  let _quatResetWarned = false;

  function _tick(nowMs) {
    requestAnimationFrame(_tick);
    try { _tickBody(nowMs); }
    catch (err) {
      if (!_tick._warned) { console.error('[SFEnhance] tick error', err); _tick._warned = true; }
    }
  }

  function _tickBody(nowMs) {
    const dt = _lastTickMs ? Math.min(0.1, (nowMs - _lastTickMs) / 1000) : 1 / 60;
    _lastTickMs = nowMs;
    _gameTimeS += dt;

    _animateAsteroids(dt);
    _animateMoons(dt);
    _animateHulks(dt);
    _enforceSceneryVisibility();
    _updateRadarFovCone();
    if (!_envApplied) _applyEnvironmentMap();

    const SF = window.Starfighter;
    if (!SF || !SF.getState) return;
    const state = SF.getState();
    if (!state || !state.entities) return;
    _assistCurrentState = state;
    _assistCurrentWave = state.wave || 1;

    // ── Camera-stability guard ──────────────────────────────────────────
    // The bundle's flight code at core.js multiplies player.quaternion
    // every frame without normalizing. Float drift (or any NaN spike from
    // autopilot slerp / divide-by-zero) leaves |q|² ≠ 1, which Three.js
    // then bakes into camera.matrixWorld via copy(). A non-unit camera
    // quaternion produces a rotation matrix with a phantom scale factor;
    // at certain orientations the projection × view product collapses and
    // the entire scene (cockpit included) renders as nothing. Re-normalize
    // every tick and snap back to identity on NaN.
    if (state.player && state.player.quaternion) {
      const q = state.player.quaternion;
      if (!isFinite(q.x) || !isFinite(q.y) || !isFinite(q.z) || !isFinite(q.w)) {
        q.set(0, 0, 0, 1);
        if (!_quatResetWarned) { console.warn('[SFEnhance] player.quaternion NaN — reset to identity'); _quatResetWarned = true; }
      } else {
        const n2 = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
        if (n2 < 0.0001) { q.set(0, 0, 0, 1); }
        else if (Math.abs(n2 - 1) > 1e-6) {
          const n = 1 / Math.sqrt(n2);
          q.x *= n; q.y *= n; q.z *= n; q.w *= n;
        }
      }
    }

    // Boost diffScale once per mission (next spawnWave will use it)
    const m = state._currentMission;
    if (m && !_missionsBoosted.has(m)) {
      m.diffScale = Math.max(m.diffScale || 1, 1) * DIFF_BOOST;
      _missionsBoosted.add(m);
      _applyMissionSetting(m);
    }
    _applyCombatAssistTuning(state);
    _trackSortie(m);

    // Walk entities: clamp spawns within band, follow laser bolts, gather hostile metrics
    const liveIds = new Set();
    const hostilesThisFrame = new Map();
    const friendlyShots = [];
    const player = state.player;
    let hostileCount = 0;
    let nearestHostile = Infinity;
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (!e) continue;
      liveIds.add(e.id);

      // Bundle bug guard: the formation medic/tanker spawned alongside the
      // baseship at mission start (core.js:3955/3964) skip the support-orbit
      // field init that the *callable* spawn path performs (core.js:5795-5800).
      // updateEntityAI routes both kinds through _updateSupportOrbit, which
      // dereferences ship._evadeDir.y and crashes every frame. Patch any
      // support vessel missing those fields before the bundle's AI runs.
      if (e.type === 'medic' || e.type === 'tanker' || e.type === 'rescue' || e.type === 'science-ship') {
        if (!e._evadeDir) e._evadeDir = new THREE.Vector3(0, 0, 0);
        if (typeof e._evadeTimer !== 'number') e._evadeTimer = 0;
        if (typeof e._orbitAngle !== 'number') e._orbitAngle = Math.random() * Math.PI * 2;
      }

      const projectileRadius = (e.type === 'laser') ? 18
        : (e.type === 'machinegun') ? 10
          : (e.type === 'plasma') ? 14
            : (e.type === 'torpedo') ? 24
              : 0;
      if (projectileRadius > 0) {
        const b = _bolts.get(e.id);
        if (b) {
          b.group.position.copy(e.position);
          if (e.quaternion) b.group.quaternion.copy(e.quaternion);
        }
        const friendly = (e.owner === 'player' || e.owner === 'wingman' || e.team === 'player' || e.faction === 'human');
        if (friendly && e.position) {
          const prev = _friendlyShotLastPos.get(e.id);
          const x1 = e.position.x, y1 = e.position.y, z1 = e.position.z;
          const x0 = prev ? prev.x : x1;
          const y0 = prev ? prev.y : y1;
          const z0 = prev ? prev.z : z1;
          friendlyShots.push({ x0, y0, z0, x1, y1, z1, r: projectileRadius });
          _friendlyShotLastPos.set(e.id, { x: x1, y: y1, z: z1 });
        }
        continue;
      }

      if (!player || !player.position || !HOSTILE[e.type]) continue;
      hostileCount++;
      const dx = e.position.x - player.position.x;
      const dy = e.position.y - player.position.y;
      const dz = e.position.z - player.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < nearestHostile) nearestHostile = d;
      hostilesThisFrame.set(e.id, { type: e.type, dist: d });

      // First-sight + re-clamp window: pull hostiles into [SPAWN_NEAR, SPAWN_FAR]
      const seen = _seenAt.get(e.id);
      if (seen === undefined) {
        _seenAt.set(e.id, _gameTimeS);
        _clampInBand(e, player, dx, dy, dz, d);
      } else if (_gameTimeS - seen < RECLAMP_WINDOW_S && d > SPAWN_FAR * 1.4) {
        _clampInBand(e, player, dx, dy, dz, d);
      }
    }

    // Hostile-kill detection: anything in last frame that's gone now and was within
    // engagement range (≤ SPAWN_FAR * 1.5) counts as a kill credit for the player.
    if (_sortie) {
      _hostileLastFrame.forEach((rec, id) => {
        if (!hostilesThisFrame.has(id) && rec.dist <= SPAWN_FAR * 1.5) {
          const pts = SCORE_KILL[rec.type] || 50;
          _sortie.score += pts;
          _sortie.kills += 1;
        }
      });
    }
    _hostileLastFrame = hostilesThisFrame;

    if (_scene && !_asteroidMesh) _spawnAsteroidField();

    // Friendly fire (laser/gun/plasma/torpedo) can shatter asteroid cover.
    if (_asteroidMesh && friendlyShots.length) _processAsteroidHits(friendlyShots);

    // Physical asteroid interactions: rock-vs-rock and rock-vs-ship.
    if (_asteroidMesh && state.phase !== 'launching') {
      _processAsteroidAsteroidCollisions(state, dt);
      _processShipAsteroidCollisions(state, dt);
    }

    _assistRetargetTimer += dt;
    _threatSoundCd = Math.max(0, _threatSoundCd - dt);
    _countermeasureCd = Math.max(0, _countermeasureCd - dt);
    _assistAutoLock(state, dt);
    _assistTorpedoGuidance(state, dt);
    _assistEaseEnemyEvasion(state);
    _updateThreatAndEmergencySystems(state, dt);

    // Floating collectible boosts
    _updatePowerups(dt, state);

    // Retire bolts whose entity is gone or marked for deletion
    _bolts.forEach((b, id) => {
      if (!liveIds.has(id)) {
        _scene.remove(b.group);
        b.core.geometry.dispose(); b.core.material.dispose();
        b.glow.geometry.dispose(); b.glow.material.dispose();
        if (b.core2) { b.core2.geometry.dispose(); b.core2.material.dispose(); }
        if (b.glow2) { b.glow2.geometry.dispose(); b.glow2.material.dispose(); }
        _bolts.delete(id);
      } else {
        b.age += dt;
        const k = 0.85 + 0.15 * Math.sin(b.age * 30);
        b.glow.material.opacity = 0.55 * k;
        if (b.glow2) b.glow2.material.opacity = 0.55 * k;
      }
    });

    // Garbage-collect _seenAt for despawned entities
    if (_seenAt.size > liveIds.size + 64) {
      _seenAt.forEach((_, id) => { if (!liveIds.has(id)) _seenAt.delete(id); });
    }
    if (_friendlyShotLastPos.size > liveIds.size + 64) {
      _friendlyShotLastPos.forEach((_, id) => { if (!liveIds.has(id)) _friendlyShotLastPos.delete(id); });
    }

    _updateMusicIntensity(hostileCount, nearestHostile);
    _updateHullResonance(hostileCount, nearestHostile);
    _updateHUD();

    if (_gameTimeS - _lastDiag >= DIAG_INTERVAL_S) {
      _lastDiag = _gameTimeS;
      _logDiagnostics(state, hostileCount, nearestHostile);
    }
  }

  function _isHostileEntity(e) {
    if (!e || e.markedForDeletion) return false;
    return e.type === 'enemy' || e.type === 'interceptor' || e.type === 'bomber' ||
      e.type === 'dreadnought' || e.type === 'alien-baseship' || e.type === 'predator' ||
      e.type === 'youngling';
  }

  function _collectHostiles(state) {
    const out = [];
    if (!state || !state.entities) return out;
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (_isHostileEntity(e)) out.push(e);
    }
    return out;
  }

  function _enemyDistanceSq(player, target) {
    const dx = target.position.x - player.position.x;
    const dy = target.position.y - player.position.y;
    const dz = target.position.z - player.position.z;
    return dx * dx + dy * dy + dz * dz;
  }

  function _findBestTargetInView(state, minDot, maxRange) {
    if (!state || !state.player || !state.player.position || !state.player.quaternion) return null;
    const hostiles = _collectHostiles(state);
    if (!hostiles.length) return null;
    const p = state.player;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < hostiles.length; i++) {
      const e = hostiles[i];
      const to = new THREE.Vector3().copy(e.position).sub(p.position);
      const dist = to.length();
      if (dist > maxRange || dist < 1) continue;
      to.multiplyScalar(1 / dist);
      const dot = fwd.dot(to);
      if (dot < minDot) continue;
      const score = dot * 10000 - dist;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  function _findNearestTarget(state, maxRange) {
    if (!state || !state.player || !state.player.position) return null;
    const hostiles = _collectHostiles(state);
    if (!hostiles.length) return null;
    const p = state.player;
    const max2 = maxRange * maxRange;
    let best = null;
    let bestD2 = max2;
    for (let i = 0; i < hostiles.length; i++) {
      const e = hostiles[i];
      const d2 = _enemyDistanceSq(p, e);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  function _setPlayerLockTarget(state, target) {
    if (!state || !state.player) return;
    state.player.lockedTarget = target || null;
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      if (target) {
        crosshair.classList.add('locked');
        crosshair.classList.remove('tracking');
      } else {
        crosshair.classList.remove('locked');
      }
    }
    if (target && window.SFAudio && SFAudio.playSound) SFAudio.playSound('lock_tone');
  }

  function _cycleLockTarget(state, dir) {
    const hostiles = _collectHostiles(state);
    if (!hostiles.length) {
      _setPlayerLockTarget(state, null);
      return;
    }
    const p = state.player;
    hostiles.sort(function (a, b) {
      return _enemyDistanceSq(p, a) - _enemyDistanceSq(p, b);
    });
    if (_assistTargetIdx < 0 || _assistTargetIdx >= hostiles.length) _assistTargetIdx = 0;
    else _assistTargetIdx = (_assistTargetIdx + dir + hostiles.length) % hostiles.length;
    _setPlayerLockTarget(state, hostiles[_assistTargetIdx]);
  }

  function _bindTargetAssistInput() {
    if (_assistInputBound || typeof document === 'undefined') return;
    _assistInputBound = true;
    document.addEventListener('keydown', function (ev) {
      const st = _assistCurrentState;
      if (!st || !st.player || st.phase !== 'combat') return;
      const key = (ev.key || '').toLowerCase();
      if (key === 'tab') {
        ev.preventDefault();
        _cycleLockTarget(st, 1);
        return;
      }
      if (key === 'q') {
        ev.preventDefault();
        _cycleLockTarget(st, -1);
        return;
      }
      if (key === 'e') {
        ev.preventDefault();
        _cycleLockTarget(st, 1);
        return;
      }
      if (key === 'g') {
        ev.preventDefault();
        _setPlayerLockTarget(st, _findNearestTarget(st, 8500));
        return;
      }
      if (key === 'f') {
        ev.preventDefault();
        _setPlayerLockTarget(st, _findBestTargetInView(st, 0.90, 8500));
        return;
      }
      if (key === '`' || key === 'escape') {
        _setPlayerLockTarget(st, null);
        return;
      }
      if (key === 'c') {
        ev.preventDefault();
        const incoming = [];
        for (let i = 0; i < st.entities.length; i++) {
          const e = st.entities[i];
          if (!_isHostileProjectile(e) || !e.position) continue;
          const dx = st.player.position.x - e.position.x;
          const dy = st.player.position.y - e.position.y;
          const dz = st.player.position.z - e.position.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          incoming.push({ entity: e, dist: d });
        }
        _fireCountermeasures(st, incoming);
        return;
      }
      if (key === 'h') {
        ev.preventDefault();
        const medic = document.getElementById('btn-call-medic') || document.getElementById('mob-call-medic');
        if (medic && !medic.disabled) medic.click();
      }
    }, true);
    document.addEventListener('mousedown', function (ev) {
      const st = _assistCurrentState;
      if (!st || !st.player || st.phase !== 'combat') return;
      if (ev.button === 1) {
        ev.preventDefault();
        _setPlayerLockTarget(st, _findBestTargetInView(st, 0.88, 8500));
      }
    }, true);
  }

  function _assistAutoLock(state, dt) {
    if (!state || !state.player || state.phase !== 'combat') return;
    const p = state.player;
    if (p.lockedTarget && !p.lockedTarget.markedForDeletion) return;
    if (_assistRetargetTimer < 0.16) return;
    _assistRetargetTimer = 0;
    const wave = state.wave || 1;
    const dot = wave <= 3 ? 0.88 : wave <= 6 ? 0.92 : 0.95;
    const range = wave <= 3 ? 9000 : 7000;
    const target = _findBestTargetInView(state, dot, range) || _findNearestTarget(state, range);
    if (target) _setPlayerLockTarget(state, target);
  }

  function _assistTorpedoGuidance(state, dt) {
    if (!state || !state.entities || !state.player) return;
    const wave = state.wave || 1;
    const steer = wave <= 3 ? 5.6 : wave <= 6 ? 4.3 : 3.1;
    for (let i = 0; i < state.entities.length; i++) {
      const t = state.entities[i];
      if (!t || t.markedForDeletion || t.type !== 'torpedo') continue;
      const friendly = t.owner === 'player' || t.owner === 'wingman';
      if (!friendly) continue;
      if (!t.target || t.target.markedForDeletion || !_isHostileEntity(t.target)) {
        t.target = state.player.lockedTarget && !state.player.lockedTarget.markedForDeletion
          ? state.player.lockedTarget
          : _findBestTargetInView(state, 0.72, 12000) || _findNearestTarget(state, 12000);
      }
      if (!t.target || t.target.markedForDeletion) continue;
      const to = new THREE.Vector3().copy(t.target.position).sub(t.position);
      const dist = to.length();
      if (dist < 1) continue;
      to.multiplyScalar(1 / dist);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), to);
      t.quaternion.slerp(q, Math.min(1, dt * steer));
      // Increase friendly torpedo hit envelope without making it guaranteed.
      t.radius = Math.max(t.radius || 8, wave <= 3 ? 16 : 12);
    }
  }

  function _assistEaseEnemyEvasion(state) {
    if (!state || !state.entities) return;
    const wave = state.wave || 1;
    if (wave > 6) return;
    const turnScale = wave <= 3 ? 0.72 : 0.84;
    const jinkScale = wave <= 3 ? 0.52 : 0.72;
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (!e || e.markedForDeletion || !_isHostileEntity(e)) continue;
      const prof = e._aiProfile;
      if (!prof) continue;
      if (typeof prof.turnRate === 'number') prof.turnRate *= turnScale;
      if (typeof prof.jinkDist === 'number') prof.jinkDist *= jinkScale;
      if (Array.isArray(prof.traits) && wave <= 3) {
        // Keep some movement, but remove hard lock-break behavior in low missions.
        prof.traits = prof.traits.filter(function (t) { return t !== 'evade_locked'; });
      }
    }
  }

  function _assistSetDim(name, value) {
    try {
      if (window.SpaceManifold && typeof window.SpaceManifold.setDim === 'function') {
        window.SpaceManifold.setDim(name, value);
      }
    } catch (_) { /* ignore */ }
  }

  function _applyCombatAssistTuning(state) {
    if (!state) return;
    const wave = state.wave || 1;
    let level = 'high';
    if (wave <= 3) level = 'low';
    else if (wave <= 6) level = 'mid';
    if (_assistTuningLevel === level) return;
    _assistTuningLevel = level;

    if (level === 'low') {
      _assistSetDim('lives.max', 3);
      _assistSetDim('targeting.acquireDot', 0.962);
      _assistSetDim('targeting.refreshDot', 0.945);
      _assistSetDim('targeting.breakDot', 0.70);
      _assistSetDim('targeting.holdRange', 7600);
      _assistSetDim('targeting.holdTime', 11.0);
      _assistSetDim('targeting.shakeRate', 2.4);
      _assistSetDim('weapon.laser.damage', 24);
      _assistSetDim('weapon.laser.radius', 7);
      _assistSetDim('weapon.torpedo.radius', 16);
      _assistSetDim('weapon.torpedo.speed', 520);
      _assistSetDim('weapon.torpedo.maxAge', 26);
      _assistSetDim('enemy.turnRate', 1.4);
      return;
    }
    if (level === 'mid') {
      _assistSetDim('lives.max', 3);
      _assistSetDim('targeting.acquireDot', 0.974);
      _assistSetDim('targeting.refreshDot', 0.962);
      _assistSetDim('targeting.breakDot', 0.78);
      _assistSetDim('targeting.holdRange', 6500);
      _assistSetDim('targeting.holdTime', 8.0);
      _assistSetDim('targeting.shakeRate', 3.8);
      _assistSetDim('weapon.laser.damage', 20);
      _assistSetDim('weapon.laser.radius', 6);
      _assistSetDim('weapon.torpedo.radius', 12);
      _assistSetDim('weapon.torpedo.speed', 470);
      _assistSetDim('weapon.torpedo.maxAge', 23);
      _assistSetDim('enemy.turnRate', 1.7);
      return;
    }
    _assistSetDim('lives.max', 3);
    _assistSetDim('targeting.acquireDot', 0.986);
    _assistSetDim('targeting.refreshDot', 0.978);
    _assistSetDim('targeting.breakDot', 0.84);
    _assistSetDim('targeting.holdRange', 5600);
    _assistSetDim('targeting.holdTime', 6.0);
    _assistSetDim('targeting.shakeRate', 5.8);
    _assistSetDim('weapon.laser.damage', 17);
    _assistSetDim('weapon.laser.radius', 5);
    _assistSetDim('weapon.torpedo.radius', 10);
    _assistSetDim('weapon.torpedo.speed', 430);
    _assistSetDim('weapon.torpedo.maxAge', 21);
    _assistSetDim('enemy.turnRate', 1.95);
  }

  function _ensureThreatUi() {
    if (typeof document === 'undefined') return;
    if (!_threatHud) {
      const el = document.createElement('div');
      el.id = 'sfenhance-threat-hud';
      el.style.cssText = [
        'position:fixed', 'top:72px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:9998', 'padding:8px 16px', 'border:1px solid rgba(255,90,90,0.75)',
        'background:rgba(28,0,0,0.74)', 'color:#ffd3d3', 'font:12px/1.2 monospace',
        'letter-spacing:1.2px', 'text-transform:uppercase', 'display:none',
        'text-shadow:0 0 8px rgba(255,70,70,0.65)', 'pointer-events:none'
      ].join(';');
      document.body.appendChild(el);
      _threatHud = el;
    }
    if (!_emergencyBtn) {
      const btn = document.createElement('button');
      btn.id = 'sfenhance-emergency-frigate';
      btn.type = 'button';
      btn.textContent = 'EMERGENCY FRIGATE';
      btn.style.cssText = [
        'position:fixed', 'right:18px', 'top:84px', 'z-index:9998',
        'padding:8px 12px', 'font:11px/1 monospace', 'letter-spacing:1.2px',
        'background:rgba(28,0,0,0.78)', 'color:#ffc9c9',
        'border:1px solid rgba(255,90,90,0.7)', 'border-radius:3px',
        'display:none', 'cursor:pointer'
      ].join(';');
      btn.addEventListener('click', function () {
        const medic = document.getElementById('btn-call-medic') || document.getElementById('mob-call-medic');
        if (medic && !medic.disabled) {
          medic.click();
          if (window.SFAudio && SFAudio.playSound) SFAudio.playSound('comm_beep');
        } else if (window.SFAudio && SFAudio.playSound) {
          SFAudio.playSound('warning');
        }
      });
      document.body.appendChild(btn);
      _emergencyBtn = btn;
    }
    if (!_medicBayBanner) {
      const bay = document.createElement('div');
      bay.id = 'sfenhance-medic-bay';
      bay.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:108px', 'transform:translateX(-50%)',
        'z-index:9998', 'padding:10px 16px', 'border:1px solid rgba(120,255,210,0.6)',
        'background:rgba(0,24,26,0.76)', 'color:#ccfff4', 'font:12px/1.3 monospace',
        'letter-spacing:1px', 'text-align:center', 'display:none',
        'text-shadow:0 0 8px rgba(100,255,220,0.6)', 'pointer-events:none'
      ].join(';');
      bay.innerHTML = 'MEDICAL FRIGATE LAUNCH BAY<br><span style="font-size:10px;color:#8fffdc">REPAIR + PROVISIONING IN PROGRESS</span>';
      document.body.appendChild(bay);
      _medicBayBanner = bay;
    }
  }

  function _isHostileProjectile(e) {
    if (!e || e.markedForDeletion) return false;
    if (e.type !== 'laser' && e.type !== 'machinegun' && e.type !== 'torpedo' && e.type !== 'plasma') return false;
    if (e.owner === 'player' || e.owner === 'wingman') return false;
    if (e.team === 'player' || e.faction === 'human') return false;
    return true;
  }

  function _fireCountermeasures(state, incomingList) {
    if (!state || !state.player || _countermeasureCd > 0) return;
    const p = state.player;
    if (typeof p.fuel === 'number' && p.fuel < COUNTERMEASURE_FUEL_COST) return;
    let neutralized = 0;
    for (let i = 0; i < incomingList.length; i++) {
      const e = incomingList[i];
      if (!e || e.markedForDeletion) continue;
      if (e.dist > COUNTERMEASURE_RADIUS) continue;
      e.markedForDeletion = true;
      if (window.SpaceManifold && typeof window.SpaceManifold.remove === 'function') {
        try { window.SpaceManifold.remove(e.id); } catch (_) { }
      }
      neutralized++;
      if (window.SF3D && SF3D.spawnImpactEffect) SF3D.spawnImpactEffect(e.position, 0x88d0ff);
    }
    if (!neutralized) return;
    if (typeof p.fuel === 'number') p.fuel = Math.max(0, p.fuel - COUNTERMEASURE_FUEL_COST);
    _countermeasureCd = COUNTERMEASURE_COOLDOWN_S;
    if (window.SFAudio && SFAudio.playSound) SFAudio.playSound('emp');
  }

  function _boostMedicDockProvisioning(state, dt) {
    if (!state || !state.player) return;
    if (state._supportCall !== 'medic' || state._supportPhase !== 'docking') {
      if (_medicBayBanner) _medicBayBanner.style.display = 'none';
      return;
    }
    if (_medicBayBanner) _medicBayBanner.style.display = 'block';
    // Ensure medical-bay cutscene keeps player alive and leaves ship provisioned.
    state.player.hull = Math.min(100, Math.max(state.player.hull, 14) + dt * 18);
    state.player.shields = Math.min(100, state.player.shields + dt * 26);
    if (typeof state.player.fuel === 'number') state.player.fuel = Math.min(100, state.player.fuel + dt * 20);
    if (typeof state.player.torpedoes === 'number' && state.player.torpedoes < 4) {
      state.player.torpedoes = Math.min(4, state.player.torpedoes + dt * 0.9);
    }
  }

  function _updateThreatAndEmergencySystems(state, dt) {
    if (!state || !state.player || !state.entities) return;
    state.maxLives = 3;
    if (typeof state.livesRemaining === 'number') state.livesRemaining = Math.min(3, state.livesRemaining);
    _ensureThreatUi();
    const combat = state.phase === 'combat';
    if (!combat) {
      if (_threatHud) _threatHud.style.display = 'none';
      if (_emergencyBtn) _emergencyBtn.style.display = 'none';
      if (_medicBayBanner) _medicBayBanner.style.display = 'none';
      return;
    }

    const p = state.player;
    const incoming = [];
    let targeted = false;
    let nearestIncoming = Infinity;

    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (!e || e.markedForDeletion || !e.position) continue;
      if (_isHostileEntity(e) && (e.lockedTarget === p || e.target === p)) targeted = true;
      if (!_isHostileProjectile(e)) continue;

      const dx = p.position.x - e.position.x;
      const dy = p.position.y - e.position.y;
      const dz = p.position.z - e.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!isFinite(dist) || dist > 2600) continue;
      const v = e.velocity || { x: 0, y: 0, z: 0 };
      const closing = (v.x * dx + v.y * dy + v.z * dz) / Math.max(1, dist);
      if (closing <= 20) continue;
      incoming.push({ entity: e, dist: dist });
      if (dist < nearestIncoming) nearestIncoming = dist;
    }

    const severe = nearestIncoming < 700 || incoming.length >= 2;
    const threatened = targeted || incoming.length > 0;
    if (_threatHud) {
      if (threatened) {
        _threatHud.style.display = 'block';
        _threatHud.style.borderColor = severe ? 'rgba(255,70,70,0.95)' : 'rgba(255,130,90,0.85)';
        _threatHud.style.background = severe ? 'rgba(36,0,0,0.80)' : 'rgba(28,14,0,0.76)';
        _threatHud.textContent = severe
          ? 'MISSILE LOCK / INCOMING FIRE - EVADE + COUNTERMEASURE'
          : 'TARGETED - TAKE EVASIVE ACTION';
      } else {
        _threatHud.style.display = 'none';
      }
    }

    if (threatened && _threatSoundCd <= 0 && window.SFAudio && SFAudio.playSound) {
      SFAudio.playSound(severe ? 'hull_alarm' : 'warning');
      _threatSoundCd = THREAT_ALARM_INTERVAL_S;
    }

    if (severe && _countermeasureCd <= 0) _fireCountermeasures(state, incoming);

    const shieldsDown = (typeof p.shields === 'number' && p.shields <= 12);
    const hullLow = (typeof p.hull === 'number' && p.hull <= 55);
    if (_emergencyBtn) {
      const canShow = shieldsDown || hullLow;
      _emergencyBtn.style.display = canShow ? 'block' : 'none';
      if (canShow) {
        const pulse = 0.55 + 0.45 * Math.sin(_gameTimeS * 7.5);
        _emergencyBtn.style.opacity = String(0.5 + pulse * 0.5);
        _emergencyBtn.style.boxShadow = '0 0 ' + Math.floor(8 + pulse * 16) + 'px rgba(255,70,70,0.65)';
      }
    }

    _boostMedicDockProvisioning(state, dt);
  }

  function _clampInBand(e, player, dx, dy, dz, d) {
    if (d <= SPAWN_FAR && d >= SPAWN_NEAR) return;
    const target = SPAWN_NEAR + Math.random() * (SPAWN_FAR - SPAWN_NEAR);
    const k = d > 1e-3 ? target / d : 1;
    e.position.set(player.position.x + dx * k, player.position.y + dy * k, player.position.z + dz * k);
  }

  // ── Constellation overlay ─────────────────────────────────────────────
  function _addConstellations() {
    if (!_scene || _constellationsAdded) return;
    const positions = new Float32Array(CONSTELLATION_N * 3);
    const colors = new Float32Array(CONSTELLATION_N * 3);
    const R = 18000; // well beyond combat band, on the celestial sphere
    for (let i = 0; i < CONSTELLATION_N; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3 + 0] = R * s * Math.cos(t);
      positions[i * 3 + 1] = R * s * Math.sin(t);
      positions[i * 3 + 2] = R * u;
      const tint = 0.7 + Math.random() * 0.3;
      const warm = Math.random() < 0.3;
      colors[i * 3 + 0] = warm ? tint : tint * 0.85;
      colors[i * 3 + 1] = tint * 0.95;
      colors[i * 3 + 2] = warm ? tint * 0.7 : tint;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 28, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const stars = new THREE.Points(geo, mat);
    stars.renderOrder = -10;
    stars.frustumCulled = false;
    _scene.add(stars);
    _constellationsAdded = true;
  }

  // ── Asteroid drift field ──────────────────────────────────────────────
  // Cluster placement: pick CLUSTER_COUNT centres on a phi-spiral around the
  // belt, perturb each by the local manifold value, then scatter rocks around
  // each centre with deterministic phi-spiral offsets. Same manifold, same
  // clusters, every session — no Math.random in the placement.
  // Densest clusters get a derelict ship hulk for cover.
  const ASTEROID_CLUSTER_COUNT = 22;
  const ASTEROID_CLUSTER_SPREAD = 380;       // m \u2014 rocks within this radius of centre
  const ASTEROID_PER_CLUSTER_MAX = 14;
  const PHI = 1.6180339887498949;
  const _asteroidClusters = [];              // [{ x, y, z, density, hasDebris }]

  function _spawnAsteroidField() {
    if (!_scene || _asteroidMesh) return;
    // Detail level 1 → 80 triangles per rock (vs 20 at level 0). Combined with
    // the procedural rock texture below, fragments read as carved stone rather
    // than untextured low-poly facets while remaining cheap to instance ×600.
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const tex = _getAsteroidTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0x9b8d7d,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, ASTEROID_MAX);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    _asteroidDrift = new Float32Array(ASTEROID_MAX * ASTEROID_STRIDE);
    for (let i = 0; i < ASTEROID_MAX; i++) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    const SM = window.SpaceManifold;
    const sizeRange = ASTEROID_SIZE_MAX - ASTEROID_SIZE_MIN;
    let placed = 0;
    _asteroidClusters.length = 0;

    // 1) Build cluster centres on a phi spiral around the belt.
    for (let ci = 0; ci < ASTEROID_CLUSTER_COUNT; ci++) {
      const t = (ci + 0.5) / ASTEROID_CLUSTER_COUNT;
      const theta = ci * Math.PI * 2 / PHI;
      // radial wobble derived from manifold so every belt slice is distinct
      const wobbleSeed = SM && SM.diamond ? SM.diamond(Math.cos(theta) * 100, ci * 13, Math.sin(theta) * 100) : 0;
      const r = ASTEROID_RING_R + (wobbleSeed * 1.2) * ASTEROID_RING_W;
      const h = (Math.sin(ci * 2.7) * 0.7 + (wobbleSeed * 0.6)) * ASTEROID_RING_H;
      const cx = Math.cos(theta) * r, cz = Math.sin(theta) * r;
      const f = SM && SM.diamond ? SM.diamond(cx, h, cz) : -0.5;
      // density 0..1 \u2014 deeper into the lobe = denser cluster
      const density = Math.max(0.25, Math.min(1, -f + 0.4));
      _asteroidClusters.push({ x: cx, y: h, z: cz, density, hasDebris: false });
    }

    // 2) Sort clusters by density and tag the top 4 as derelict-bearing.
    const ranked = _asteroidClusters.slice().sort((a, b) => b.density - a.density);
    for (let i = 0; i < Math.min(4, ranked.length); i++) ranked[i].hasDebris = true;

    // 3) Scatter rocks around each centre. Offsets are a deterministic phi
    //    spiral in the local tangent frame; size tracks distance from centre.
    for (let ci = 0; ci < _asteroidClusters.length && placed < ASTEROID_INITIAL; ci++) {
      const c = _asteroidClusters[ci];
      const count = Math.max(4, Math.floor(c.density * ASTEROID_PER_CLUSTER_MAX));
      for (let k = 0; k < count && placed < ASTEROID_INITIAL; k++) {
        const u = (k + 0.5) / count;
        const ang = k * Math.PI * 2 / PHI;
        const rr = Math.sqrt(u) * ASTEROID_CLUSTER_SPREAD;
        // tilt the ring slightly so clusters aren't pancakes
        const px = c.x + Math.cos(ang) * rr;
        const py = c.y + Math.sin(ang * 1.3) * rr * 0.4;
        const pz = c.z + Math.sin(ang) * rr;
        // size: largest at centre, smaller toward edge (cover-friendly)
        const sScale = ASTEROID_SIZE_MIN + (1 - u) * sizeRange * c.density;
        _writeAsteroid(placed++, px, py, pz, sScale, 0, mesh, dummy);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    _scene.add(mesh);
    _asteroidMesh = mesh;
    _asteroidActive = placed;

    // 4) Drop derelict ship hulks at the densest cluster centres.
    _spawnDerelictHulks();
  }

  // Derelict ship debris \u2014 dark, broken silhouettes that give enemies cover
  // and read as battlefield wreckage. Built procedurally from THREE primitives.
  let _hulkGroup = null;
  function _spawnDerelictHulks() {
    if (!_scene || _hulkGroup) return;
    _hulkGroup = new THREE.Group();
    _hulkGroup.name = 'sf-derelict-hulks';
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.92, metalness: 0.55, flatShading: true });
    const charMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1.0, metalness: 0.2 });
    _asteroidClusters.forEach((c, idx) => {
      if (!c.hasDebris) return;
      const hulk = new THREE.Group();
      hulk.position.set(c.x, c.y, c.z);
      // broken spine
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(28, 22, 360, 8, 1), hullMat);
      spine.rotation.z = Math.PI / 2;
      spine.rotation.y = idx * 0.7;
      hulk.add(spine);
      // torn forward section
      const bow = new THREE.Mesh(new THREE.ConeGeometry(34, 120, 7), charMat);
      bow.position.set(180, 0, 0); bow.rotation.z = -Math.PI / 2;
      hulk.add(bow);
      // ruptured engine block
      const eng = new THREE.Mesh(new THREE.BoxGeometry(120, 90, 90), hullMat);
      eng.position.set(-150, -10, 0);
      hulk.add(eng);
      // jagged plating sticking out
      for (let p = 0; p < 5; p++) {
        const a = p * Math.PI * 2 / PHI;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 30 + p * 6), charMat);
        plate.position.set(Math.cos(a) * 90, Math.sin(a) * 50, Math.sin(a * 1.7) * 60);
        plate.rotation.set(a, a * 0.6, 0);
        hulk.add(plate);
      }
      // very slow tumble
      hulk.userData.tumble = { x: 0.0007 * (1 + idx * 0.1), y: 0.0011, z: 0.0004 };
      _hulkGroup.add(hulk);
    });
    _scene.add(_hulkGroup);
  }

  function _animateHulks(dt) {
    if (!_hulkGroup) return;
    _hulkGroup.children.forEach(h => {
      const t = h.userData.tumble;
      if (!t) return;
      h.rotation.x += t.x; h.rotation.y += t.y; h.rotation.z += t.z;
    });
  }

  // Nearest asteroid cluster centre to a world position, or null. Used by
  // core.js to bias enemy spawn clusters into asteroid cover.
  function nearestAsteroidCluster(x, y, z, maxDist) {
    if (!_asteroidClusters.length) return null;
    let best = null, bestD2 = (maxDist || Infinity) * (maxDist || Infinity);
    for (let i = 0; i < _asteroidClusters.length; i++) {
      const c = _asteroidClusters[i];
      const dx = c.x - x, dy = c.y - y, dz = c.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = c; }
    }
    return best;
  }
  function asteroidClusters() { return _asteroidClusters.slice(); }

  // Rotation phases and tumble velocities derive from the local gradient.
  // No RNG — the rock's spin is the surface's slope at its position.
  function _writeAsteroid(slot, px, py, pz, scale, tier, mesh, dummy, lvx, lvy, lvz) {
    const o = slot * ASTEROID_STRIDE;
    const drift = _asteroidDrift;
    const SM = window.SpaceManifold;
    const g = (SM && SM.diamondGrad) ? SM.diamondGrad(px, py, pz) : { x: 1, y: 0, z: 0 };
    const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1e-9;
    const nx = g.x / gMag, ny = g.y / gMag, nz = g.z / gMag;
    drift[o + 0] = px; drift[o + 1] = py; drift[o + 2] = pz;
    drift[o + 3] = Math.atan2(ny, nx) + Math.PI;
    drift[o + 4] = Math.atan2(nz, nx) + Math.PI;
    drift[o + 5] = Math.atan2(nz, ny) + Math.PI;
    drift[o + 6] = nx * 0.3;
    drift[o + 7] = ny * 0.3;
    drift[o + 8] = nz * 0.3;
    drift[o + 9] = lvx || 0;          // linear velocity (shatter burst)
    drift[o + 10] = lvy || 0;
    drift[o + 11] = lvz || 0;
    drift[o + 12] = scale;
    drift[o + 13] = tier;
    dummy.position.set(px, py, pz);
    dummy.rotation.set(drift[o + 3], drift[o + 4], drift[o + 5]);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
  }

  function _findFreeAsteroidSlot() {
    if (!_asteroidDrift) return -1;
    for (let i = 0; i < ASTEROID_MAX; i++) {
      if (_asteroidDrift[i * ASTEROID_STRIDE + 12] <= 0) return i;
    }
    return -1;
  }

  function _animateAsteroids(dt) {
    if (!_asteroidMesh || !_asteroidDrift) return;
    const dummy = new THREE.Object3D();
    const drift = _asteroidDrift;
    const orbit = 0.015 * dt;
    const cosO = Math.cos(orbit), sinO = Math.sin(orbit);
    // Per-frame velocity decay so shatter fragments coast outward then settle
    // back into the field's overall orbital drift.
    const burstDecay = Math.exp(-ASTEROID_BURST_DECAY * dt);
    let active = 0;
    for (let i = 0; i < ASTEROID_MAX; i++) {
      const o = i * ASTEROID_STRIDE;
      const s = drift[o + 12];
      if (s <= 0) continue;
      active++;
      // Burst translation — only matters for shattered children with non-zero lv
      drift[o] += drift[o + 9] * dt;
      drift[o + 1] += drift[o + 10] * dt;
      drift[o + 2] += drift[o + 11] * dt;
      drift[o + 9] *= burstDecay;
      drift[o + 10] *= burstDecay;
      drift[o + 11] *= burstDecay;
      // Orbital sweep around the y-axis (field-wide)
      const x = drift[o], z = drift[o + 2];
      drift[o] = x * cosO - z * sinO;
      drift[o + 2] = x * sinO + z * cosO;
      drift[o + 3] += drift[o + 6] * dt;
      drift[o + 4] += drift[o + 7] * dt;
      drift[o + 5] += drift[o + 8] * dt;
      dummy.position.set(drift[o], drift[o + 1], drift[o + 2]);
      dummy.rotation.set(drift[o + 3], drift[o + 4], drift[o + 5]);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      _asteroidMesh.setMatrixAt(i, dummy.matrix);
    }
    _asteroidActive = active;
    _asteroidMesh.instanceMatrix.needsUpdate = true;
  }

  // ── Procedural rock texture (mottled grey/brown noise + craters) ──────
  // Built once and shared across every InstancedMesh slot. The icosahedron
  // UVs are seam-prone so we keep contrast modest and let flatShading carry
  // most of the silhouette read.
  function _getAsteroidTexture() {
    if (_asteroidTexture) return _asteroidTexture;
    const W = 256, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#7a6d5e';
    ctx.fillRect(0, 0, W, H);
    // Mottled noise pass: many small varying-tone discs blend into rock grain
    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = 1 + Math.random() * 4;
      const v = 70 + ((Math.random() * 70) | 0);
      const a = 0.18 + Math.random() * 0.18;
      ctx.fillStyle = 'rgba(' + v + ',' + (v - 6) + ',' + (v - 14) + ',' + a + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Crater highlights — bright rim + dark interior gradient
    for (let i = 0; i < 18; i++) {
      const cx = Math.random() * W, cy = Math.random() * H;
      const r = 6 + Math.random() * 18;
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      g.addColorStop(0, 'rgba(20,18,14,0.55)');
      g.addColorStop(0.85, 'rgba(180,168,150,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    _asteroidTexture = tex;
    return tex;
  }

  // ── Procedural planet texture (canvas-based bands + spots) ────────────
  function _makePlanetTexture(palette, opts) {
    opts = opts || {};
    const W = 512, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    // Vertical band gradient — palette stops are [{at:0..1, color:'#rrggbb'}, ...]
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    palette.forEach(s => grad.addColorStop(s.at, s.color));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Add wavy band striations
    for (let i = 0; i < (opts.bands || 14); i++) {
      const y = (i + 0.5) * (H / (opts.bands || 14));
      const a = 0.05 + Math.random() * 0.18;
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,' + a + ')' : 'rgba(20,10,0,' + a + ')';
      ctx.lineWidth = 1 + Math.random() * 4;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const yy = y + Math.sin(x * 0.04 + i) * (1 + Math.random() * 4);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Optional vortex spot (Great Red Spot for Jupiter)
    if (opts.spot) {
      const sx = W * (opts.spot.x || 0.7), sy = H * (opts.spot.y || 0.6);
      const r = opts.spot.r || 28;
      const sg = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
      sg.addColorStop(0, opts.spot.color || '#a02418');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.4, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function _addMoon(planetPos, opts) {
    const geo = new THREE.IcosahedronGeometry(opts.size, 1);
    const mat = new THREE.MeshStandardMaterial({ color: opts.color || 0xb8b3ad, roughness: 0.92, metalness: 0.04, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    _backdropGroup.add(mesh);
    _planetMoons.push({
      mesh, base: planetPos.clone(),
      radius: opts.radius, speed: opts.speed,
      angle: Math.random() * Math.PI * 2,
      tilt: opts.tilt || 0,
    });
  }

  function _setSceneryVisible(name, visible) {
    if (!_scene) return;
    const o = _scene.getObjectByName(name);
    if (o) o.visible = visible;
  }

  // Bundle loads earth-scenery / moon-scenery GLBs asynchronously and re-shows
  // them after our mission setting was already chosen. Re-assert each frame.
  function _enforceSceneryVisibility() {
    if (!_scene) return;
    const showEarth = (_settingName === 'earth-orbit');
    _setSceneryVisible('earth-scenery', showEarth);
    _setSceneryVisible('moon-scenery', showEarth);
  }

  // ── Radar FOV cone: rebuild to match the live camera viewport ─────────
  // The bundle builds the cone once at radar-init using a hardcoded 16:9
  // aspect, so the green pyramid no longer matches the actual on-screen
  // frustum (and contacts visible on screen drift outside the wedge). The
  // radar lives in ship-local space, so the cone naturally tracks ship
  // facing — we only need to size the wedge to the true camera FOV/aspect.
  function _findRadarFovCone() {
    if (!_radarScene) return null;
    // Identify the FOV cone by structure: Group at z ≈ SHIP_OFFSET (0.35)
    // whose first two children are LineSegments + Mesh, both with the
    // signature green color 0x00ff88 (the bundle's FOV-cone tint).
    const kids = _radarScene.children;
    for (let i = 0; i < kids.length; i++) {
      const o = kids[i];
      if (!o || !o.isGroup) continue;
      if (Math.abs((o.position && o.position.z) - 0.35) > 0.001) continue;
      let edges = null, faces = null;
      for (let j = 0; j < o.children.length; j++) {
        const c = o.children[j];
        if (c.isLineSegments && c.material && c.material.color &&
          c.material.color.getHex() === 0x00ff88) edges = c;
        else if (c.isMesh && c.material && c.material.color &&
          c.material.color.getHex() === 0x00ff88) faces = c;
      }
      if (edges && faces) {
        _radarFovApexZ = o.position.z;
        return { group: o, edges, faces };
      }
    }
    return null;
  }

  function _updateRadarFovCone() {
    if (!_radarFovCone) {
      const found = _findRadarFovCone();
      if (!found) return;
      _radarFovCone = found.group;
      _radarFovEdges = found.edges;
      _radarFovFaces = found.faces;
    }
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (Math.abs(aspect - _radarFovLastAspect) < 0.005) return; // no change
    _radarFovLastAspect = aspect;

    // Camera vertical FOV matches 3d.js (75°). Cone is built in cone-local
    // space (group origin = apex). Side faces run apex→far-corner; the
    // angular spread on each face equals atan(fhW/wedgeLen) horizontally
    // and atan(fhH/wedgeLen) vertically — i.e. exactly the camera FOV
    // half-angles. We deliberately do NOT clamp far corners back onto the
    // radar sphere: clamping pulls corners toward the apex inversely with
    // depth, which narrows the side-face angles below the camera FOV and
    // pushes viewport-visible blips outside the wedge. Letting the cone
    // poke slightly past the sphere shell (opacity 0.06) is acceptable.
    const halfV = Math.PI * (75 / 360); // 37.5° in radians
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const wedgeLen = _radarFovWedgeLen;
    const fz = -wedgeLen;
    const fhW = Math.tan(halfH) * wedgeLen;
    const fhH = Math.tan(halfV) * wedgeLen;
    const ftr = { x: fhW, y: fhH, z: fz };
    const ftl = { x: -fhW, y: fhH, z: fz };
    const fbl = { x: -fhW, y: -fhH, z: fz };
    const fbr = { x: fhW, y: -fhH, z: fz };
    const ax = 0, ay = 0, az = 0; // apex at group origin

    // Rebuild the 16-vertex LineSegments edge list (4 apex→corner + 4 around far rect).
    const edgeArr = new Float32Array([
      ax, ay, az, ftr.x, ftr.y, ftr.z,
      ax, ay, az, ftl.x, ftl.y, ftl.z,
      ax, ay, az, fbl.x, fbl.y, fbl.z,
      ax, ay, az, fbr.x, fbr.y, fbr.z,
      ftr.x, ftr.y, ftr.z, ftl.x, ftl.y, ftl.z,
      ftl.x, ftl.y, ftl.z, fbl.x, fbl.y, fbl.z,
      fbl.x, fbl.y, fbl.z, fbr.x, fbr.y, fbr.z,
      fbr.x, fbr.y, fbr.z, ftr.x, ftr.y, ftr.z,
    ]);
    const eGeo = _radarFovEdges.geometry;
    eGeo.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3));
    eGeo.attributes.position.needsUpdate = true;
    eGeo.computeBoundingSphere();

    // Rebuild the 6-face (18 verts) pyramid mesh: 4 side triangles + 2 far-cap triangles.
    const faceArr = new Float32Array([
      ax, ay, az, ftl.x, ftl.y, ftl.z, ftr.x, ftr.y, ftr.z, // top
      ax, ay, az, fbr.x, fbr.y, fbr.z, fbl.x, fbl.y, fbl.z, // bottom
      ax, ay, az, fbl.x, fbl.y, fbl.z, ftl.x, ftl.y, ftl.z, // left
      ax, ay, az, ftr.x, ftr.y, ftr.z, fbr.x, fbr.y, fbr.z, // right
      ftr.x, ftr.y, ftr.z, ftl.x, ftl.y, ftl.z, fbl.x, fbl.y, fbl.z, // far cap 1
      ftr.x, ftr.y, ftr.z, fbl.x, fbl.y, fbl.z, fbr.x, fbr.y, fbr.z, // far cap 2
    ]);
    const fGeo = _radarFovFaces.geometry;
    fGeo.setAttribute('position', new THREE.BufferAttribute(faceArr, 3));
    fGeo.attributes.position.needsUpdate = true;
    fGeo.computeVertexNormals();
    fGeo.computeBoundingSphere();
  }

  // ── Per-mission backdrop: one planet + its moons (or none) ────────────
  function _applyMissionSetting(mission) {
    if (_settingsApplied.has(mission) || !_scene) return;
    _settingsApplied.add(mission);
    const choices = ['earth-orbit', 'saturn', 'jupiter', 'deep-space', 'belt'];
    _settingName = choices[Math.floor(Math.random() * choices.length)];

    // Tear down previous backdrop + its moons
    if (_backdropGroup) {
      _backdropGroup.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      _scene.remove(_backdropGroup);
      _backdropGroup = null;
    }
    _planetMoons = [];

    // Bundle's Earth/Moon scenery: only show in earth-orbit setting
    const showEarth = (_settingName === 'earth-orbit');
    _setSceneryVisible('earth-scenery', showEarth);
    _setSceneryVisible('moon-scenery', showEarth);

    if (_settingName === 'earth-orbit' || _settingName === 'belt') return; // no extra backdrop

    _backdropGroup = new THREE.Group();
    _backdropGroup.renderOrder = -5;
    _backdropGroup.frustumCulled = false;

    if (_settingName === 'saturn') {
      const pos = new THREE.Vector3(-9000, 1200, -14000);
      const tex = _makePlanetTexture([
        { at: 0.0, color: '#b9925d' }, { at: 0.4, color: '#e8cf95' },
        { at: 0.7, color: '#caa468' }, { at: 1.0, color: '#8a6a3c' },
      ], { bands: 10 });
      const planet = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 32),
        new THREE.MeshBasicMaterial({ map: tex }));
      planet.position.copy(pos);
      _backdropGroup.add(planet);
      // Ring system — three concentric bands, tilted
      const ringTilt = Math.PI * 0.42;
      [[2900, 3500, 0.55, 0xc9a76a], [3550, 3900, 0.35, 0xa78a55], [3950, 4400, 0.45, 0xd4b577]].forEach(b => {
        const r = new THREE.Mesh(new THREE.RingGeometry(b[0], b[1], 96),
          new THREE.MeshBasicMaterial({ color: b[3], side: THREE.DoubleSide, transparent: true, opacity: b[2], depthWrite: false }));
        r.rotation.x = ringTilt; r.position.copy(pos);
        _backdropGroup.add(r);
      });
      _addMoon(pos, { size: 130, radius: 5200, speed: 0.05, tilt: 0.15, color: 0xd0c8b8 }); // Titan-ish
      _addMoon(pos, { size: 60, radius: 6400, speed: 0.08, tilt: -0.2, color: 0xe8e4dc }); // Enceladus-ish
    } else if (_settingName === 'jupiter') {
      const pos = new THREE.Vector3(-24000, -3200, -52000);
      const tex = _makePlanetTexture([
        { at: 0.0, color: '#c4a07a' }, { at: 0.25, color: '#e8d2a8' },
        { at: 0.5, color: '#b08858' }, { at: 0.75, color: '#d8b890' },
        { at: 1.0, color: '#8e6b40' },
      ], { bands: 16, spot: { x: 0.62, y: 0.65, r: 36, color: '#a02418' } });
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1800, 56, 36),
        new THREE.MeshBasicMaterial({ map: tex }));
      planet.position.copy(pos);
      _backdropGroup.add(planet);
      // Galilean moons (radii scaled to new planet size)
      _addMoon(pos, { size: 50, radius: 2900, speed: 0.12, tilt: 0.05, color: 0xd9c98a }); // Io
      _addMoon(pos, { size: 62, radius: 3400, speed: 0.08, tilt: -0.1, color: 0xe6dcc3 }); // Europa
      _addMoon(pos, { size: 78, radius: 4200, speed: 0.06, tilt: 0.18, color: 0xb8a78b }); // Ganymede
      _addMoon(pos, { size: 56, radius: 5000, speed: 0.045, tilt: -0.25, color: 0x8a7860 }); // Callisto
    } else if (_settingName === 'deep-space') {
      const neb = new THREE.Mesh(new THREE.SphereGeometry(15000, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x331a55, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false }));
      _backdropGroup.add(neb);
    }

    if (_backdropGroup.children.length) _scene.add(_backdropGroup);
  }

  function _animateMoons(dt) {
    for (let i = 0; i < _planetMoons.length; i++) {
      const m = _planetMoons[i];
      m.angle += m.speed * dt;
      const cosT = Math.cos(m.tilt), sinT = Math.sin(m.tilt);
      const x = Math.cos(m.angle) * m.radius;
      const z = Math.sin(m.angle) * m.radius;
      m.mesh.position.set(
        m.base.x + x,
        m.base.y + z * sinT,
        m.base.z + z * cosT
      );
      m.mesh.rotation.y += dt * 0.05;
    }
  }

  // ── Radar HUD scaling ─────────────────────────────────────────────────
  function _scaleRadar() {
    if (_radarScaled) return;
    const tryScale = () => {
      const el = document.querySelector('#radar, #radar-overlay, .radar, [data-hud="radar"]');
      if (!el) return false;
      el.style.transformOrigin = 'bottom right';
      el.style.transform = 'scale(' + RADAR_SCALE + ')';
      _radarScaled = true;
      return true;
    };
    if (!tryScale()) setTimeout(_scaleRadar, 1500);
  }

  // ── Lighting boost: prevent pitch-black back angles ──────────────────
  // Bundle defaults: AmbientLight 0x060610 @ 0.08 (basically black). Add a
  // soft white ambient + sky/ground hemisphere so the unlit hemisphere of
  // ships/stations isn't a void. Sun direction is preserved — this only
  // raises the floor.
  let _lightingApplied = false;
  function _applyLightingBoost() {
    if (_lightingApplied || !_scene) return;
    const amb = new THREE.AmbientLight(0xffffff, AMBIENT_BOOST);
    amb.name = 'sfenhance-ambient';
    _scene.add(amb);
    const hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY);
    hemi.name = 'sfenhance-hemi';
    _scene.add(hemi);
    _lightingApplied = true;
  }

  // ── Environment map: prevent metallic surfaces from rendering as black voids ──
  // Most ship/station materials in 3d.js are MeshPhysicalMaterial with high
  // metalness (0.85–1.0) and low roughness (0.05–0.3). Metals sample only the
  // environment for diffuse — with no envMap they reflect nothing, so the hull
  // appears pure black except where a direct light's specular highlight grazes
  // the view vector. Panning sweeps that highlight across the surface, leaving
  // the rest looking like a void. Installing scene.environment via PMREMGenerator
  // gives every PBR material in the scene something to reflect (image-based
  // lighting) — no per-material assignment required.
  function _applyEnvironmentMap() {
    if (_envApplied || !_scene || !_renderer || !THREE.PMREMGenerator) return;
    const pmrem = new THREE.PMREMGenerator(_renderer);
    try { pmrem.compileEquirectangularShader(); } catch (e) { /* older builds lack this */ }

    // Tiny synthetic environment that mirrors the bundle's sun + earth geometry.
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x05060c); // deep-space charcoal

    // Bright sun disk — matches DirectionalLight(0xfff5e0, 5.0) placement.
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff5e0 })
    );
    const sunDir = new THREE.Vector3(200000, 100000, 80000).normalize().multiplyScalar(450);
    sun.position.copy(sunDir);
    envScene.add(sun);

    // Earth-shine fill — matches the bundle's blue 0x4488cc earthshine source.
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(110, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x2a4a78 })
    );
    const earthDir = new THREE.Vector3(-15000, -55000, -25000).normalize().multiplyScalar(380);
    earth.position.copy(earthDir);
    envScene.add(earth);

    // Warm rim from opposite side so the perma-shadow hemisphere isn't a void.
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(220, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x1a1018 })
    );
    rim.position.copy(sunDir.clone().multiplyScalar(-1));
    envScene.add(rim);

    const rt = pmrem.fromScene(envScene, 0.04);
    _scene.environment = rt.texture;
    pmrem.dispose();
    // Dispose the synthetic scene's transient resources.
    envScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    _envApplied = true;
    console.log('[SFEnhance] scene.environment installed (PMREM)');
  }

  // ── Hull resonance buzz: alien drives induce eddy currents in our plating.
  // Level rises with proximity (and a small bump for swarm pressure) so a
  // single fighter at 1500m hums faintly, a pack at 300m roars.
  function _updateHullResonance(hostileCount, nearestHostile) {
    if (!window.SFAudio || typeof SFAudio.setHullResonanceLevel !== 'function') return;
    if (!isFinite(nearestHostile)) { SFAudio.setHullResonanceLevel(0); return; }
    const prox = Math.max(0, 1 - nearestHostile / HULL_RES_RANGE);
    const swarm = Math.min(0.35, hostileCount * 0.04);
    SFAudio.setHullResonanceLevel(Math.min(1, prox * 0.85 + swarm));
  }

  // ── Music intensity from manifold z = x·y² ────────────────────────────
  function _updateMusicIntensity(hostileCount, nearestHostile) {
    if (!window.SFMusic || typeof SFMusic.setIntensity !== 'function') return;
    const x = Math.min(1, hostileCount / 10);                                  // pressure
    const prox = isFinite(nearestHostile) ? Math.max(0, 1 - nearestHostile / SPAWN_FAR) : 0;
    const y = prox;
    const z = x * y * y;                                                       // z = x·y²
    SFMusic.setIntensity(0.25 + 0.75 * z);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────
  function _logDiagnostics(state, hostileCount, nearestHostile) {
    const ds = (state._currentMission && state._currentMission.diffScale) || 1;
    console.log('[SFEnhance] setting=' + _settingName + ' wave=' + state.wave + ' hostiles=' + hostileCount +
      ' nearest=' + (isFinite(nearestHostile) ? Math.round(nearestHostile) + 'm' : '—') +
      ' diffScale=' + ds.toFixed(2) + ' bolts=' + _bolts.size + ' rocks=' + _asteroidActive +
      (_sortie ? ' score=' + _sortie.score + ' kills=' + _sortie.kills + ' rocks-busted=' + _sortie.asteroids : ''));
  }

  // ── Career persistence ────────────────────────────────────────────────
  function _loadCareer() {
    try {
      const raw = localStorage.getItem(CAREER_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && typeof c === 'object') _career = Object.assign(_career, c);
      }
    } catch (_) { /* ignore */ }
  }
  function _saveCareer() {
    try { localStorage.setItem(CAREER_KEY, JSON.stringify(_career)); } catch (_) { /* ignore */ }
  }

  // ── Sortie tracking ───────────────────────────────────────────────────
  // A sortie spans one mission. Commit results to career on mission swap.
  function _trackSortie(mission) {
    const st = window.Starfighter && window.Starfighter.getState ? window.Starfighter.getState() : null;
    if (st && st._trainingSortieActive) return;
    if (!mission) return;
    if (!_sortie || _sortie.missionRef !== mission) {
      if (_sortie) {
        _career.sorties += 1;
        _career.lifetimeScore += _sortie.score;
        const survived = Math.max(0, _gameTimeS - _sortie.startTimeS);
        if (survived > _career.bestSurvivalSec) _career.bestSurvivalSec = survived;
        _saveCareer();
      }
      _sortie = { startTimeS: _gameTimeS, score: 0, kills: 0, asteroids: 0, missionRef: mission };
    }
  }

  // ── Asteroid hits from friendly projectiles ───────────────────────────
  // Uses swept segment-vs-sphere checks so fast shots do not tunnel.
  function _processAsteroidHits(shotSegments) {
    const drift = _asteroidDrift;
    const dummy = new THREE.Object3D();
    let dirty = false;
    for (let bi = 0; bi < shotSegments.length; bi++) {
      const seg = shotSegments[bi];
      const vx = seg.x1 - seg.x0;
      const vy = seg.y1 - seg.y0;
      const vz = seg.z1 - seg.z0;
      const vv = vx * vx + vy * vy + vz * vz;
      for (let i = 0; i < ASTEROID_MAX; i++) {
        const o = i * ASTEROID_STRIDE;
        const s = drift[o + 12];
        if (s <= 0) continue;
        const r = s + (seg.r || 18);
        const cx = drift[o], cy = drift[o + 1], cz = drift[o + 2];

        let d2;
        if (vv <= 1e-9) {
          const dx0 = cx - seg.x1, dy0 = cy - seg.y1, dz0 = cz - seg.z1;
          d2 = dx0 * dx0 + dy0 * dy0 + dz0 * dz0;
        } else {
          const wx = cx - seg.x0, wy = cy - seg.y0, wz = cz - seg.z0;
          const t = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / vv));
          const qx = seg.x0 + vx * t, qy = seg.y0 + vy * t, qz = seg.z0 + vz * t;
          const dx1 = cx - qx, dy1 = cy - qy, dz1 = cz - qz;
          d2 = dx1 * dx1 + dy1 * dy1 + dz1 * dz1;
        }
        if (d2 > r * r) continue;
        const tier = drift[o + 13] | 0;
        if (_sortie) {
          _sortie.score += SCORE_ASTEROID[tier] || 5;
          _sortie.asteroids += 1;
        }
        _shatterAsteroid(i, dummy);
        dirty = true;
        break;
      }
    }
    if (dirty) _asteroidMesh.instanceMatrix.needsUpdate = true;
  }

  // Mark the slot dead. If big enough, spawn ASTEROID_SPLIT_COUNT smaller
  // children at higher tier reusing free slots.
  function _shatterAsteroid(slot, dummy) {
    const drift = _asteroidDrift;
    const o = slot * ASTEROID_STRIDE;
    const s = drift[o + 12];
    const tier = drift[o + 13] | 0;
    const px = drift[o], py = drift[o + 1], pz = drift[o + 2];
    drift[o + 12] = 0;
    drift[o + 9] = 0; drift[o + 10] = 0; drift[o + 11] = 0;
    dummy.scale.setScalar(0);
    dummy.position.set(0, 0, 0);
    dummy.updateMatrix();
    _asteroidMesh.setMatrixAt(slot, dummy.matrix);
    _disruptCoverAt(px, py, pz, s);
    if (s <= ASTEROID_VAPORIZE || tier >= 2) return;
    const childScale = Math.max(ASTEROID_VAPORIZE, s * ASTEROID_SPLIT_FACTOR);

    // Crack pattern follows the surface: children scatter in the plane
    // perpendicular to the gradient at the parent's position. The shape of
    // the manifold is literally legible in how a rock breaks.
    const SM = window.SpaceManifold;
    const g = (SM && SM.diamondGrad) ? SM.diamondGrad(px, py, pz) : { x: 1, y: 0, z: 0 };
    const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1e-9;
    const nx = g.x / gMag, ny = g.y / gMag, nz = g.z / gMag;
    const tx = Math.abs(nx) < 0.9 ? 1 : 0, ty = Math.abs(nx) < 0.9 ? 0 : 1, tz = 0;
    let ax = ny * tz - nz * ty, ay = nz * tx - nx * tz, az = nx * ty - ny * tx;
    const aMag = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-9;
    ax /= aMag; ay /= aMag; az /= aMag;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    const radius = s * 0.55;
    // Burst speed scales with parent size so big-rock blasts spread wider
    // than chips. Velocity is purely tangent to the gradient (no inward
    // component) so children visibly fly apart along the crack plane.
    const burst = ASTEROID_BURST_SPEED * (0.6 + Math.min(1.4, s / 80));
    for (let k = 0; k < ASTEROID_SPLIT_COUNT; k++) {
      const idx = _findFreeAsteroidSlot();
      if (idx < 0) return;
      const angle = (k / ASTEROID_SPLIT_COUNT) * Math.PI * 2;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const dirX = ax * ca + bx * sa;
      const dirY = ay * ca + by * sa;
      const dirZ = az * ca + bz * sa;
      const jx = px + dirX * radius;
      const jy = py + dirY * radius;
      const jz = pz + dirZ * radius;
      _writeAsteroid(idx, jx, jy, jz, childScale, tier + 1, _asteroidMesh, dummy,
        dirX * burst, dirY * burst, dirZ * burst);
    }
  }

  // Public surface for AI cover queries. Brute-force scan over ≤600 slots
  // is cheap enough that no spatial index is warranted.
  function nearestCoverAsteroid(pos, maxR) {
    if (!_asteroidDrift || !pos) return null;
    const drift = _asteroidDrift;
    const r2Max = maxR * maxR;
    let bestSlot = -1, bestD2 = r2Max;
    for (let i = 0; i < ASTEROID_MAX; i++) {
      const o = i * ASTEROID_STRIDE;
      const s = drift[o + 12];
      if (s < ASTEROID_VAPORIZE) continue;       // need a rock big enough to hide behind
      const dx = drift[o] - pos.x, dy = drift[o + 1] - pos.y, dz = drift[o + 2] - pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; bestSlot = i; }
    }
    if (bestSlot < 0) return null;
    const o = bestSlot * ASTEROID_STRIDE;
    return {
      position: new THREE.Vector3(drift[o], drift[o + 1], drift[o + 2]),
      radius: drift[o + 12],
    };
  }

  // When cover is destroyed, force any nearby combat AI to re-stamp on the
  // next frame so they re-evaluate exposure (the symbolic field hasn't
  // changed but their access to negative-field cover has).
  function _disruptCoverAt(px, py, pz, rockScale) {
    const SF = window.Starfighter;
    const st = SF && SF.getState && SF.getState();
    if (!st || !st.entities) return;
    const radius = Math.max(400, rockScale * 4);
    const r2 = radius * radius;
    for (let i = 0; i < st.entities.length; i++) {
      const e = st.entities[i];
      if (!e || !e.position || !e._aiProfile) continue;
      const dx = e.position.x - px, dy = e.position.y - py, dz = e.position.z - pz;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      e._aiProfileTime = 0;
    }
  }

  // ── Ship ↔ asteroid collision damage ─────────────────────────────────
  // Applies to player and active ships so asteroids are physically meaningful.
  function _processShipAsteroidCollisions(state, dt) {
    if (!state || !state.entities || !_asteroidDrift) return;
    const drift = _asteroidDrift;
    const dummy = new THREE.Object3D();
    let dirty = false;
    for (let si = 0; si < state.entities.length; si++) {
      const ship = state.entities[si];
      if (!ship || ship.markedForDeletion || !ship.position) continue;
      const t = ship.type;
      if (t !== 'player' && t !== 'wingman' && t !== 'ally' && t !== 'enemy' && t !== 'interceptor' && t !== 'bomber' && t !== 'predator' && t !== 'dreadnought') continue;

      const pp = ship.position;
      const pr = (typeof ship.radius === 'number' ? ship.radius : 10);
      const vel = ship.velocity;
      const p1x = pp.x, p1y = pp.y, p1z = pp.z;
      const p0x = vel ? p1x - (vel.x || 0) * dt : p1x;
      const p0y = vel ? p1y - (vel.y || 0) * dt : p1y;
      const p0z = vel ? p1z - (vel.z || 0) * dt : p1z;

      for (let i = 0; i < ASTEROID_MAX; i++) {
        const o = i * ASTEROID_STRIDE;
        const s = drift[o + 12];
        if (s <= 0) continue;

        const cdKey = ship.id + ':' + i;
        const until = _shipRockCooldown.get(cdKey) || 0;
        if (until > _gameTimeS) continue;

        const sx = drift[o], sy = drift[o + 1], sz = drift[o + 2];
        const dx = sx - p1x, dy = sy - p1y, dz = sz - p1z;
        const rNow = s + pr;
        const nowHit = (dx * dx + dy * dy + dz * dz) <= (rNow * rNow);

        let hit = nowHit;
        if (!hit) {
          // Simple swept-sphere fallback to reduce tunneling.
          const vx = p1x - p0x, vy = p1y - p0y, vz = p1z - p0z;
          const wx = sx - p0x, wy = sy - p0y, wz = sz - p0z;
          const vv = vx * vx + vy * vy + vz * vz;
          if (vv > 1e-6) {
            const tProj = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / vv));
            const qx = p0x + vx * tProj, qy = p0y + vy * tProj, qz = p0z + vz * tProj;
            const ex = sx - qx, ey = sy - qy, ez = sz - qz;
            hit = (ex * ex + ey * ey + ez * ez) <= (rNow * rNow);
          }
        }
        if (!hit) continue;

        const svx = ship.velocity ? (ship.velocity.x || 0) : 0;
        const svy = ship.velocity ? (ship.velocity.y || 0) : 0;
        const svz = ship.velocity ? (ship.velocity.z || 0) : 0;
        const av = _asteroidVelocity(drift, o);
        const rvx = svx - av.x;
        const rvy = svy - av.y;
        const rvz = svz - av.z;
        const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
        const dmg = _impactDamageFromSizeAndSpeed(s, relSpeed);
        _applyDamageToShip(ship, dmg);

        const mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        if (ship.velocity) {
          ship.velocity.x += (dx / mag) * -35;
          ship.velocity.y += (dy / mag) * -35;
          ship.velocity.z += (dz / mag) * -35;
        }

        _shatterAsteroid(i, dummy);
        _shipRockCooldown.set(cdKey, _gameTimeS + 0.45);
        dirty = true;
      }
    }
    if (dirty) _asteroidMesh.instanceMatrix.needsUpdate = true;
  }

  // ── Asteroid ↔ asteroid collision damage ─────────────────────────────
  // Big rocks do more damage; high closing speed increases shatter chance.
  function _processAsteroidAsteroidCollisions(state, dt) {
    if (!_asteroidDrift) return;
    _decayAsteroidPairCooldowns(dt);
    const drift = _asteroidDrift;
    const dummy = new THREE.Object3D();
    const active = [];
    for (let i = 0; i < ASTEROID_MAX; i++) {
      const o = i * ASTEROID_STRIDE;
      if (drift[o + 12] > 0) active.push(i);
    }
    if (active.length < 2) return;

    let dirty = false;
    for (let ai = 0; ai < active.length - 1; ai++) {
      const i = active[ai];
      const oi = i * ASTEROID_STRIDE;
      const si = drift[oi + 12];
      if (si <= 0) continue;
      const aix = drift[oi], aiy = drift[oi + 1], aiz = drift[oi + 2];
      for (let bi = ai + 1; bi < active.length; bi++) {
        const j = active[bi];
        const oj = j * ASTEROID_STRIDE;
        const sj = drift[oj + 12];
        if (sj <= 0) continue;

        const key = (i < j) ? (i + ':' + j) : (j + ':' + i);
        if ((_asteroidPairTtl.get(key) || 0) > 0) continue;

        const dx = drift[oj] - aix;
        const dy = drift[oj + 1] - aiy;
        const dz = drift[oj + 2] - aiz;
        const rr = si + sj;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > rr * rr) continue;

        const va = _asteroidVelocity(drift, oi);
        const vb = _asteroidVelocity(drift, oj);
        const rvx = va.x - vb.x;
        const rvy = va.y - vb.y;
        const rvz = va.z - vb.z;
        const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
        if (relSpeed < ASTEROID_IMPACT_MIN_SPEED) {
          _asteroidPairTtl.set(key, ASTEROID_IMPACT_COOLDOWN_S * 0.5);
          continue;
        }

        const sizeMean = (si + sj) * 0.5;
        const impact = _impactDamageFromSizeAndSpeed(sizeMean, relSpeed);
        const blastR = Math.max(80, rr * 0.95);
        _applyAsteroidImpactBlastToShips(state, (aix + drift[oj]) * 0.5, (aiy + drift[oj + 1]) * 0.5, (aiz + drift[oj + 2]) * 0.5, blastR, impact * ASTEROID_IMPACT_BLAST_K);

        // Resolve rock damage by shattering smaller first, then larger on hard impacts.
        if (si <= sj || relSpeed > 46) {
          _shatterAsteroid(i, dummy);
          dirty = true;
        }
        if (sj < si || relSpeed > 62) {
          _shatterAsteroid(j, dummy);
          dirty = true;
        }
        _asteroidPairTtl.set(key, ASTEROID_IMPACT_COOLDOWN_S);
      }
    }
    if (dirty) _asteroidMesh.instanceMatrix.needsUpdate = true;
  }

  function _decayAsteroidPairCooldowns(dt) {
    if (!_asteroidPairTtl.size) return;
    _asteroidPairTtl.forEach(function (ttl, key) {
      ttl -= dt;
      if (ttl <= 0) _asteroidPairTtl.delete(key);
      else _asteroidPairTtl.set(key, ttl);
    });
  }

  function _asteroidVelocity(drift, o) {
    // Velocity = fragment burst linear component + orbital tangential sweep.
    const x = drift[o], z = drift[o + 2];
    return {
      x: (drift[o + 9] || 0) - ASTEROID_ORBIT_OMEGA * z,
      y: (drift[o + 10] || 0),
      z: (drift[o + 11] || 0) + ASTEROID_ORBIT_OMEGA * x,
    };
  }

  function _impactDamageFromSizeAndSpeed(size, relSpeed) {
    const d = size * ASTEROID_SHIP_DMG_SIZE_K + relSpeed * ASTEROID_SHIP_DMG_SPEED_K;
    return Math.max(ASTEROID_SHIP_DMG_MIN, Math.min(ASTEROID_SHIP_DMG_MAX, d));
  }

  function _applyDamageToShip(ship, dmg) {
    if (!ship || dmg <= 0 || ship.markedForDeletion) return;
    if (ship.type === 'player') {
      _applyShieldFirstDamage(ship, dmg);
      return;
    }
    if (typeof ship.takeDamage === 'function') {
      ship.takeDamage(dmg);
      return;
    }
    let remaining = dmg;
    if (typeof ship.shields === 'number' && ship.shields > 0) {
      const absorbed = Math.min(ship.shields, remaining);
      ship.shields -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0 && typeof ship.hull === 'number') {
      ship.hull = Math.max(0, ship.hull - remaining);
    }
  }

  function _applyAsteroidImpactBlastToShips(state, x, y, z, radius, damage) {
    if (!state || !state.entities || damage <= 0) return;
    const r2 = radius * radius;
    for (let i = 0; i < state.entities.length; i++) {
      const ship = state.entities[i];
      if (!ship || ship.markedForDeletion || !ship.position) continue;
      const t = ship.type;
      if (t !== 'player' && t !== 'wingman' && t !== 'ally' && t !== 'enemy' && t !== 'interceptor' && t !== 'bomber' && t !== 'predator' && t !== 'dreadnought' && t !== 'alien-baseship' && t !== 'baseship') continue;
      const dx = ship.position.x - x;
      const dy = ship.position.y - y;
      const dz = ship.position.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const falloff = 1 - Math.sqrt(d2) / radius;
      const applied = damage * falloff;
      _applyDamageToShip(ship, applied);
    }
  }

  // Shield-first damage model: shields drain to 0 before hull takes a single
  // point. Mirrors the bundle's takeDamage() conventions but bypasses any
  // type guards (asteroids aren't entities the engine tracks).
  function _applyShieldFirstDamage(player, dmg) {
    if (!player || dmg <= 0) return;
    if (player.hull !== undefined && player.hull <= 0) return;
    let remaining = dmg;
    if (typeof player.shields === 'number' && player.shields > 0) {
      const absorbed = Math.min(player.shields, remaining);
      player.shields -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0 && typeof player.hull === 'number') {
      player.hull = Math.max(0, player.hull - remaining);
    }
  }

  function _createPowerupMesh(type) {
    const g = new THREE.Group();
    const color = type === 'shield' ? 0x33ccff : type === 'hull' ? 0xff7733 : type === 'fuel' ? 0x44ff88 : 0xffdd33;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(18, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(24, 2.5, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = Math.PI * 0.5;
    g.add(core);
    g.add(ring);
    return g;
  }

  function _spawnPowerupNearPlayer(state) {
    if (!_scene || !state || !state.player || !state.player.position) return;
    if (_powerups.length >= POWERUP_MAX) return;
    const p = state.player.position;
    const ang = Math.random() * Math.PI * 2;
    const r = 550 + Math.random() * 1300;
    const y = p.y + (Math.random() - 0.5) * 350;
    const type = POWERUP_TYPES[(Math.random() * POWERUP_TYPES.length) | 0];
    const mesh = _createPowerupMesh(type);
    mesh.position.set(p.x + Math.cos(ang) * r, y, p.z + Math.sin(ang) * r);
    _scene.add(mesh);
    _powerups.push({ type, mesh, age: 0, phase: Math.random() * Math.PI * 2, spin: 0.7 + Math.random() * 1.1, baseY: y });
  }

  function _applyPowerup(ship, type) {
    if (!ship) return;
    const getMax = (k, fb) => {
      try {
        return (window.SpaceManifold && window.SpaceManifold.dim && window.SpaceManifold.dim(k)) || fb;
      } catch (_) {
        return fb;
      }
    };
    if (type === 'shield' && typeof ship.shields === 'number') {
      const maxSh = getMax('player.shields', 100);
      ship.shields = Math.min(maxSh, ship.shields + 35);
    } else if (type === 'hull' && typeof ship.hull === 'number') {
      const maxHull = getMax('player.hull', 100);
      ship.hull = Math.min(maxHull, ship.hull + 24);
    } else if (type === 'fuel' && typeof ship.fuel === 'number') {
      const maxFuel = getMax('player.fuel', 100);
      ship.fuel = Math.min(maxFuel, ship.fuel + 30);
    } else if (type === 'torpedo' && typeof ship.torpedoes === 'number') {
      ship.torpedoes = Math.min(12, ship.torpedoes + 1);
    }
  }

  function _updatePowerups(dt, state) {
    if (!_scene || !state || state.phase !== 'combat') return;

    _powerupSpawnTimer -= dt;
    if (_powerupSpawnTimer <= 0 && _powerups.length < POWERUP_MAX) {
      _spawnPowerupNearPlayer(state);
      _powerupSpawnTimer = POWERUP_SPAWN_MIN_S + Math.random() * (POWERUP_SPAWN_MAX_S - POWERUP_SPAWN_MIN_S);
    }

    const pickupShips = [];
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i];
      if (!e || e.markedForDeletion || !e.position) continue;
      if (e.type === 'player' || e.type === 'wingman' || e.type === 'ally') pickupShips.push(e);
    }

    for (let i = _powerups.length - 1; i >= 0; i--) {
      const p = _powerups[i];
      p.age += dt;
      p.phase += dt;
      p.mesh.rotation.y += dt * p.spin;
      p.mesh.rotation.x += dt * 0.35;
      p.mesh.position.y = p.baseY + Math.sin(p.phase * 1.8) * 14;

      let collected = false;
      for (let si = 0; si < pickupShips.length; si++) {
        const s = pickupShips[si];
        const sr = (typeof s.radius === 'number' ? s.radius : 12);
        const dx = p.mesh.position.x - s.position.x;
        const dy = p.mesh.position.y - s.position.y;
        const dz = p.mesh.position.z - s.position.z;
        const rr = POWERUP_PICKUP_R + sr;
        if ((dx * dx + dy * dy + dz * dz) > rr * rr) continue;
        _applyPowerup(s, p.type);
        if (window.SF3D && SF3D.spawnImpactEffect) SF3D.spawnImpactEffect(p.mesh.position, 0x88ffcc);
        if (window.SFAudio && SFAudio.playSound) SFAudio.playSound('hud_power_up');
        collected = true;
        break;
      }

      if (collected || p.age > POWERUP_LIFETIME_S) {
        _scene.remove(p.mesh);
        p.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
        _powerups.splice(i, 1);
      }
    }
  }

  // ── HUD overlay (top-left): Score · Kills · Rocks · Time · Sortie ─────
  function _ensureHUD() {
    if (_hudEl || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'sfenhance-hud';
    el.style.cssText = [
      'position:fixed', 'top:8px', 'left:8px', 'z-index:9999',
      'font:11px/1.4 monospace', 'color:#9ef7b7',
      'background:rgba(0,12,6,0.55)', 'padding:6px 9px',
      'border:1px solid rgba(80,255,140,0.35)', 'border-radius:4px',
      'pointer-events:none', 'min-width:170px', 'text-shadow:0 0 4px #0f0',
    ].join(';');
    document.body.appendChild(el);
    _hudEl = el;
  }
  function _updateHUD() {
    _ensureHUD();
    if (!_hudEl) return;
    const s = _sortie;
    const t = s ? Math.max(0, _gameTimeS - s.startTimeS) : 0;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const SF = window.Starfighter;
    const st = SF && SF.getState && SF.getState();
    const p = st && st.player;
    const dim = window.dim;
    const hullMax = (dim && dim('player.hull')) || 100;
    const shldMax = (dim && dim('player.shields')) || 100;
    const hull = p ? Math.max(0, Math.round((p.hull / hullMax) * 100)) : 0;
    const shld = p ? Math.max(0, Math.round((p.shields / shldMax) * 100)) : 0;
    _hudEl.innerHTML =
      'SCORE  ' + (s ? s.score : 0) + '<br>' +
      'KILLS  ' + (s ? s.kills : 0) + '<br>' +
      'ROCKS  ' + (s ? s.asteroids : 0) + '<br>' +
      'TIME   ' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss + '<br>' +
      'SHLD   ' + shld + '%   HULL ' + hull + '%<br>' +
      'SORTIE ' + (_career.sorties + (s ? 1 : 0)) +
      '   LIFE ' + (_career.lifetimeScore + (s ? s.score : 0));
  }

  function init() {
    if (!window.THREE) { console.warn('[SFEnhance] THREE missing'); return; }
    _loadCareer();
    _captureScene();
    _captureRadarScene();
    _bindTargetAssistInput();
    _installLaserOverride();
    _scaleRadar();
    // Defer scene-attached features one tick so _scene is captured.
    setTimeout(() => {
      _applyLightingBoost();
      _applyEnvironmentMap();
      _addConstellations();
      _spawnAsteroidField();
    }, 1500);
    requestAnimationFrame(_tick);
    console.log('[SFEnhance] active — dual-beam · spawn ' + SPAWN_NEAR + '–' + SPAWN_FAR + 'm · diff×' + DIFF_BOOST + ' · radar×' + RADAR_SCALE.toFixed(3) + ' · render=manifold');
  }

  return { init, nearestCoverAsteroid, nearestAsteroidCluster, asteroidClusters };
})();

if (typeof window !== 'undefined') {
  window.SFEnhance = SFEnhance;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SFEnhance.init());
  } else {
    SFEnhance.init();
  }
}

// ── Replay-prologue floating button ─────────────────────────────────────
// Single fixed-position button that surfaces in any non-combat moment
// (bay debrief, wave-clear cinematic, respawn screen, victory screen,
// rescue-bay launch interface). Pauses the relevant auto-launch
// countdowns while the prologue plays, resumes when it resolves.
(function _wireReplayPrologueButton() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    const btn = document.createElement('button');
    btn.id = 'sf-replay-prologue';
    btn.type = 'button';
    btn.innerHTML = '\u25B6 REPLAY PROLOGUE';
    btn.style.cssText = [
      'position:fixed', 'right:18px', 'bottom:18px', 'z-index:9990',
      'background:rgba(0,12,24,0.78)', 'color:#0ff',
      'border:1px solid rgba(0,255,255,0.45)',
      'padding:7px 18px', 'font-family:monospace', 'font-size:11px',
      'letter-spacing:3px', 'cursor:pointer', 'text-transform:uppercase',
      'pointer-events:auto', 'display:none',
      'box-shadow:0 0 12px rgba(0,255,255,0.18)'
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(0,40,60,0.88)';
      btn.style.boxShadow = '0 0 18px rgba(0,255,255,0.35)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(0,12,24,0.78)';
      btn.style.boxShadow = '0 0 12px rgba(0,255,255,0.18)';
    });
    document.body.appendChild(btn);

    let _playing = false;
    btn.addEventListener('click', function () {
      if (_playing || !window.SFIntro) return;
      _playing = true;
      window._bdrPaused = true;
      window._wcPaused = true;
      btn.disabled = true;
      btn.style.opacity = '0.45';
      const release = () => {
        _playing = false;
        window._bdrPaused = false;
        window._wcPaused = false;
        btn.disabled = false;
        btn.style.opacity = '1';
      };
      try {
        const p = window.SFIntro.play({ force: true });
        if (p && typeof p.then === 'function') p.then(release, release);
        else release();
      } catch (_) { release(); }
    });

    // ── Visibility poll ─────────────────────────────────────────────────
    // The prologue overlay itself sits above everything (z-index ~10000),
    // so while it is up we hide our own button.
    function isVisible(el) {
      if (!el) return false;
      if (el.style && el.style.display === 'none') return false;
      const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
      return el.offsetParent !== null || (cs && cs.position === 'fixed');
    }
    function shouldShow() {
      if (_playing) return false;
      if (document.getElementById('sf-intro-root')) return false;
      const ids = [
        'bay-debrief',         // post-wave debrief
        'waveclear-overlay',   // wave-cleared cinematic
        'respawn-overlay',     // fighter-lost screen
        'victory-screen',      // game-won screen
        'rescue-bay-overlay'   // first-launch / rescue interface
      ];
      for (let i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el && isVisible(el)) return true;
      }
      return false;
    }
    setInterval(function () {
      const want = shouldShow();
      const showing = btn.style.display !== 'none';
      if (want && !showing) btn.style.display = 'inline-block';
      else if (!want && showing) btn.style.display = 'none';
    }, 400);
  });
})();
