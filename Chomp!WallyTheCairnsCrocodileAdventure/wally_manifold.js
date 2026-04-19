/**
 * wally_manifold.js — Manifold substrate for Chomp! Wally the Cairns Crocodile Adventure
 *
 * Manifold = Expression + Attributes + Substrate
 * z = x * y  (portal law: 1 player × 8 levels = 8)
 *
 * Dimensional map:
 *   0D — scalar constants (speed, bite force, health)
 *   1D — Wally's swim path, prey spawn sequences
 *   2D — level layout plane (estuary grid, collision map)
 *   3D — world volume (Three.js scene space)
 *   4D — temporal: animation timeline, AI state machines
 *   5D — narrative: story arcs, level unlock graph
 */

'use strict';

const WALLY = (() => {

  /* ── Phi / Fibonacci scaling ───────────────────────────── */
  const PHI = 1.6180339887;
  const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

  /** Scale a value by phi^tier */
  function phiScale(base, tier) {
    return base * Math.pow(PHI, tier);
  }

  /* ══════════════════════════════════════════════════════════
     CONSTANTS — 0D scalars (single values, no extent)
     ══════════════════════════════════════════════════════════ */
  const C = Object.freeze({
    // Wally body
    WALLY_LENGTH: 4.7,      // metres — real Wally's documented length
    WALLY_WIDTH: 0.9,
    WALLY_HEIGHT: 0.5,
    TAIL_SEGMENTS: 12,

    // Movement
    SWIM_SPEED_BASE: 8,
    SWIM_SPEED_MAX: 28,
    SPRINT_MULT: PHI,      // sprint = base * phi
    TURN_SPEED: 2.2,      // rad/s
    DIVE_SPEED: 5,
    SURFACE_SNAP: 0.3,

    // Chomp
    CHOMP_RANGE: 3.5,
    CHOMP_ARC_DEG: 55,
    CHOMP_COOLDOWN_MS: 600,
    TAIL_SWEEP_RADIUS: 2.8,
    DEATH_ROLL_SPEED: 4.0,

    // Health & scoring
    HEALTH_MAX: 100,
    HUNGER_DECAY_RATE: 0.8,      // per second
    SCORE_PER_FISH: 10,
    SCORE_PER_BIRD: 25,
    SCORE_PER_TOURIST: 50,
    SCORE_COMBO_MULT: PHI,      // combo multiplier grows by phi

    // World
    WATER_LEVEL: 0,
    TIDE_AMPLITUDE: 1.2,
    TIDE_PERIOD_SEC: 60,
    MUD_DRAG: 0.55,
    WATER_DRAG: 0.12,

    // Camera
    CAM_DISTANCE: 18,
    CAM_HEIGHT: 8,
    CAM_LAG: 0.08,

    // Colours (Three.js hex)
    COLOR_WATER: 0x1a6b8a,
    COLOR_WATER_DEEP: 0x0d3d52,
    COLOR_WALLY_BODY: 0x4a7c3f,
    COLOR_WALLY_BELLY: 0xe8d8a0,
    COLOR_WALLY_EYE: 0xf0c040,
    COLOR_MUD: 0x8b6914,
    COLOR_MANGROVE: 0x2e5c25,
    COLOR_SAND: 0xd4b870,
    COLOR_FOAM: 0xddeedd,
    COLOR_TOURIST: 0xff7070,
  });

  /* ══════════════════════════════════════════════════════════
     LEVEL DEFINITIONS — 2D plane manifolds
     ══════════════════════════════════════════════════════════ */
  const LEVELS = [
    {
      id: 1, name: 'Esplanade Lagoon', biome: 'estuary',
      size: [120, 80],
      waterDepth: 3.5,
      preyTypes: ['barramundi', 'mullet', 'tilapia'],
      hazards: ['fishing_line', 'boat_prop'],
      ambientColor: 0x1a6b8a,
      fogColor: 0x0d3d52,
      fogNear: 60, fogFar: 180,
      sunAngle: 0.6,
      targetScore: 500,
      preyCount: 20,
      description: 'Home territory. Lazy tourists. Plenty of fish.',
    },
    {
      id: 2, name: 'Mangrove Maze', biome: 'mangrove',
      size: [100, 100],
      waterDepth: 2.0,
      preyTypes: ['mud_crab', 'catfish', 'rat'],
      hazards: ['mangrove_root', 'net'],
      ambientColor: 0x1a4a2a,
      fogColor: 0x0a2a14,
      fogNear: 20, fogFar: 80,
      sunAngle: 0.3,
      targetScore: 800,
      preyCount: 25,
      description: 'Tight channels. High roots. Ambush paradise.',
    },
    {
      id: 3, name: 'Mudflat Midnight', biome: 'mudflat',
      size: [160, 60],
      waterDepth: 0.8,
      preyTypes: ['ibis', 'magpie_goose', 'mud_skipper'],
      hazards: ['deep_mud_hole', 'ranger_spotlight'],
      ambientColor: 0x151530,
      fogColor: 0x050515,
      fogNear: 30, fogFar: 100,
      sunAngle: -0.2,
      targetScore: 1100,
      preyCount: 18,
      description: 'Night hunt on the mudflats. Stealth is key.',
    },
    {
      id: 4, name: 'Tidal River Rush', biome: 'river',
      size: [200, 50],
      waterDepth: 6.0,
      preyTypes: ['barramundi', 'water_buffalo_calf', 'turtle'],
      hazards: ['current', 'submerged_log', 'boat'],
      ambientColor: 0x2a6a80,
      fogColor: 0x0d3d52,
      fogNear: 80, fogFar: 250,
      sunAngle: 0.8,
      targetScore: 1500,
      preyCount: 22,
      description: 'River in flood. Ride the current and strike fast.',
    },
    {
      id: 5, name: 'Reef Shallows', biome: 'reef',
      size: [140, 90],
      waterDepth: 4.0,
      preyTypes: ['reef_fish', 'dugong_calf', 'seabird'],
      hazards: ['coral_spike', 'jellyfish', 'shark'],
      ambientColor: 0x0090c0,
      fogColor: 0x005070,
      fogNear: 40, fogFar: 120,
      sunAngle: 1.0,
      targetScore: 2000,
      preyCount: 30,
      description: 'Saltie territory. Coral maze. Beware the shark.',
    },
    {
      id: 6, name: 'Boardwalk Rumble', biome: 'boardwalk',
      size: [180, 70],
      waterDepth: 2.5,
      preyTypes: ['tourist', 'dog', 'pelican'],
      hazards: ['ranger', 'tranq_dart', 'helicopter'],
      ambientColor: 0x4a6a3a,
      fogColor: 0x1a2a14,
      fogNear: 50, fogFar: 150,
      sunAngle: 0.7,
      targetScore: 2800,
      preyCount: 24,
      description: 'Tourism season. Peak chaos. Avoid the rangers.',
    },
    {
      id: 7, name: 'Storm Drain Depths', biome: 'drain',
      size: [90, 90],
      waterDepth: 5.0,
      preyTypes: ['possum', 'rat', 'feral_cat'],
      hazards: ['concrete_wall', 'storm_surge', 'toxic_runoff'],
      ambientColor: 0x202030,
      fogColor: 0x080810,
      fogNear: 15, fogFar: 60,
      sunAngle: 0,
      targetScore: 3500,
      preyCount: 20,
      description: 'Urban darkness. Limited visibility. High danger.',
    },
    {
      id: 8, name: 'Open Sea Boss', biome: 'sea',
      size: [300, 300],
      waterDepth: 30.0,
      preyTypes: ['shark', 'whale_calf', 'giant_squid'],
      hazards: ['deep_pressure', 'tiger_shark_boss', 'naval_sonar'],
      ambientColor: 0x002040,
      fogColor: 0x001020,
      fogNear: 20, fogFar: 80,
      sunAngle: 0.4,
      targetScore: 6000,
      preyCount: 15,
      description: 'Wally vs the ocean. The ultimate chomp.',
    },
  ];

  /* ══════════════════════════════════════════════════════════
     WALLY SUBSTRATE — player state manifold (3D volume)
     ══════════════════════════════════════════════════════════ */
  function createWally() {
    return {
      // Position (3D)
      x: 0, y: 0, z: 0,
      // Rotation
      rotY: 0, pitch: 0,
      // Velocity
      vx: 0, vy: 0, vz: 0,
      // State
      health: C.HEALTH_MAX,
      hunger: 100,
      score: 0,
      chompStreak: 0,
      lastChompTime: 0,
      isSubmerged: false,
      isSprinting: false,
      isChomping: false,
      chompAnimT: 0,
      tailPhase: 0,
      tier: 1,          // upgrade tier (1-5), scales by phi
      // Stats derived from tier
      get swimSpeed() { return phiScale(C.SWIM_SPEED_BASE, this.tier - 1); },
      get chompForce() { return phiScale(20, this.tier - 1); },
      get tailRadius() { return phiScale(C.TAIL_SWEEP_RADIUS, this.tier - 1); },
    };
  }

  /* ══════════════════════════════════════════════════════════
     PREY SUBSTRATE — 1D sequence of prey agents
     ══════════════════════════════════════════════════════════ */
  const PREY_DEFS = {
    barramundi: { size: 0.6, speed: 5, score: C.SCORE_PER_FISH, color: 0x88aacc, swim: true },
    mullet: { size: 0.35, speed: 7, score: 8, color: 0x99bbdd, swim: true },
    tilapia: { size: 0.3, speed: 4, score: 6, color: 0xaa8866, swim: true },
    mud_crab: { size: 0.45, speed: 2, score: 15, color: 0x8b6914, swim: false },
    catfish: { size: 0.5, speed: 3, score: 12, color: 0x556677, swim: true },
    rat: { size: 0.25, speed: 6, score: 20, color: 0x887766, swim: false },
    ibis: { size: 0.7, speed: 4, score: 25, color: 0xffffff, swim: false },
    magpie_goose: { size: 0.65, speed: 5, score: 25, color: 0x334455, swim: false },
    mud_skipper: { size: 0.2, speed: 8, score: 5, color: 0x558844, swim: false },
    water_buffalo_calf: { size: 1.5, speed: 3.5, score: 80, color: 0x887755, swim: false },
    turtle: { size: 0.8, speed: 2, score: 40, color: 0x4a7040, swim: true },
    reef_fish: { size: 0.3, speed: 8, score: 8, color: 0xffaa44, swim: true },
    dugong_calf: { size: 1.8, speed: 3, score: 120, color: 0xaabbcc, swim: true },
    seabird: { size: 0.5, speed: 10, score: 20, color: 0xeeeeff, swim: false },
    tourist: { size: 1.8, speed: 2, score: C.SCORE_PER_TOURIST, color: C.COLOR_TOURIST, swim: false },
    dog: { size: 0.8, speed: 7, score: 30, color: 0xddaa77, swim: false },
    pelican: { size: 0.9, speed: 5, score: 35, color: 0xeeddcc, swim: false },
    possum: { size: 0.55, speed: 5, score: 18, color: 0x998877, swim: false },
    feral_cat: { size: 0.45, speed: 9, score: 22, color: 0x888899, swim: false },
    shark: { size: 2.5, speed: 14, score: 200, color: 0x5566aa, swim: true },
    whale_calf: { size: 4.0, speed: 5, score: 400, color: 0x334466, swim: true },
    giant_squid: { size: 3.5, speed: 7, score: 350, color: 0x8833aa, swim: true },
  };

  function spawnPrey(level, count) {
    const [lw, lh] = level.size;
    const types = level.preyTypes;
    const prey = [];
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      const def = PREY_DEFS[type] || PREY_DEFS.barramundi;
      prey.push({
        id: i,
        type,
        def,
        x: (Math.random() - 0.5) * lw * 0.8,
        y: def.swim ? -(1 + Math.random() * level.waterDepth * 0.5) : C.WATER_LEVEL + 0.1,
        z: (Math.random() - 0.5) * lh * 0.8,
        vx: 0, vz: 0,
        rotY: Math.random() * Math.PI * 2,
        alive: true,
        fleeTimer: 0,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: 0,
      });
    }
    return prey;
  }

  /* ══════════════════════════════════════════════════════════
     PREY AI — 4D temporal behaviour substrate
     Iterate within dimension (within the prey array).
     Cross-dimension (Wally→prey interaction) is a separate lens.
     ══════════════════════════════════════════════════════════ */
  function updatePreyAI(preyList, wallyX, wallyZ, dt) {
    const FLEE_DIST = 12;
    const WANDER_INT = 2;
    const PREY_SPEED = 1;

    preyList.forEach(p => {
      if (!p.alive) return;
      const def = p.def;
      const dx = wallyX - p.x;
      const dz = wallyZ - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < FLEE_DIST) {
        // Flee: run directly away
        p.fleeTimer = 1.5;
        const ang = Math.atan2(dz, dx) + Math.PI;
        p.vx = Math.cos(ang) * def.speed * 1.4;
        p.vz = Math.sin(ang) * def.speed * 1.4;
        p.rotY = ang;
      } else {
        // Wander
        p.wanderTimer -= dt;
        if (p.wanderTimer <= 0) {
          p.wanderAngle += (Math.random() - 0.5) * 1.2;
          p.wanderTimer = WANDER_INT + Math.random();
        }
        p.vx = Math.cos(p.wanderAngle) * def.speed * 0.4;
        p.vz = Math.sin(p.wanderAngle) * def.speed * 0.4;
        p.rotY = p.wanderAngle;
      }

      // Integrate
      p.x += p.vx * dt;
      p.z += p.vz * dt;

      // Swim bob
      if (def.swim) {
        p.y = -(1 + Math.sin(Date.now() * 0.001 * def.speed + p.id) * 0.3);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     CHOMP LENS — cross-dimension interaction
     Wally (3D position) × Prey (3D position) → score event (0D)
     z = x*y: chomp output = player position × prey position
     ══════════════════════════════════════════════════════════ */
  function tryChomp(wally, preyList, now) {
    if (now - wally.lastChompTime < C.CHOMP_COOLDOWN_MS) return null;
    if (!wally.isChomping) return null;

    const chompArcRad = (C.CHOMP_ARC_DEG * Math.PI) / 180;
    let best = null, bestDist = Infinity;

    preyList.forEach(p => {
      if (!p.alive) return;
      const dx = p.x - wally.x;
      const dz = p.z - wally.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > C.CHOMP_RANGE) return;

      // Angular check: prey must be within chomp arc in front of Wally
      const angleToP = Math.atan2(dz, dx);
      let diff = angleToP - wally.rotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > chompArcRad) return;

      if (dist < bestDist) { bestDist = dist; best = p; }
    });

    if (!best) return null;

    best.alive = false;
    wally.lastChompTime = now;
    wally.chompStreak++;
    wally.hunger = Math.min(100, wally.hunger + 20);

    // Score: base × phi^combo (bounded at 5 stacks)
    const comboTier = Math.min(wally.chompStreak - 1, 5);
    const scoreGain = Math.round(best.def.score * Math.pow(C.SCORE_COMBO_MULT, comboTier));
    wally.score += scoreGain;

    return { prey: best, score: scoreGain, combo: wally.chompStreak };
  }

  /* Tail-sweep stun — hits all prey within radius behind Wally */
  function tryTailSweep(wally, preyList) {
    const r = wally.tailRadius;
    const stunned = [];
    preyList.forEach(p => {
      if (!p.alive) return;
      const dx = p.x - wally.x;
      const dz = p.z - wally.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > r) return;
      // Must be behind Wally (angle > 120° from facing)
      const ang = Math.atan2(dz, dx);
      let diff = ang - wally.rotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < Math.PI * 0.67) return;
      // Stun: fling away
      const outAng = ang;
      p.vx = Math.cos(outAng) * 12;
      p.vz = Math.sin(outAng) * 12;
      p.fleeTimer = 3;
      stunned.push(p);
    });
    return stunned;
  }

  /* ══════════════════════════════════════════════════════════
     SCORING SUBSTRATE
     ══════════════════════════════════════════════════════════ */
  const Scoring = {
    getGrade(score, target) {
      const r = score / target;
      if (r >= 1.5) return 'S';
      if (r >= 1.0) return 'A';
      if (r >= 0.75) return 'B';
      if (r >= 0.5) return 'C';
      return 'D';
    },
    comboLabel(streak) {
      if (streak >= 10) return 'DEATH ROLL!';
      if (streak >= 7) return 'APEX PREDATOR!';
      if (streak >= 5) return 'FEEDING FRENZY!';
      if (streak >= 3) return 'CHOMP STREAK!';
      return '';
    },
  };

  /* ══════════════════════════════════════════════════════════
     TIDE SIMULATION — 1D time lens
     ══════════════════════════════════════════════════════════ */
  function getTideLevel(t) {
    return C.WATER_LEVEL + Math.sin(t * (Math.PI * 2) / C.TIDE_PERIOD_SEC) * C.TIDE_AMPLITUDE;
  }

  /* ══════════════════════════════════════════════════════════
     MANIFOLD BRIDGE — exposes state to portal
     ══════════════════════════════════════════════════════════ */
  function buildBridge(wallyRef, levelRef) {
    return {
      get score() { return wallyRef.score; },
      get health() { return wallyRef.health; },
      get chomp_streak() { return wallyRef.chompStreak; },
      get wallyPosition() { return { x: wallyRef.x, y: wallyRef.y, z: wallyRef.z }; },
      get level() { return levelRef ? levelRef.id : 0; },
    };
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    C, PHI, FIB, LEVELS, PREY_DEFS,
    phiScale,
    createWally,
    spawnPrey,
    updatePreyAI,
    tryChomp,
    tryTailSweep,
    getTideLevel,
    Scoring,
    buildBridge,
  };

})();

// Register in portal bridge slot
if (typeof window !== 'undefined') {
  window.__MANIFOLD__ = window.__MANIFOLD__ || {};
  window.__MANIFOLD__.wally = WALLY;
}
