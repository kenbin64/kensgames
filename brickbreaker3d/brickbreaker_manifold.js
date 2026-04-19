/**
 * BrickBreaker 3D -- Manifold Substrate  (window.BB)
 * Expression: z = x*y | Dimension: 3D volume -> 4D session
 * Axiom: every game constant derives from PHI; every position derives from z=x*y
 * No THREE.js dependency -- pure data and math only.
 */
window.BB = (() => {
  'use strict';

  // 0D: the single generating constant -- golden ratio
  // Every speed, size, boost, and threshold is a phi chain: PHI^n
  const PHI = 1.618033988749895;

  // 0D physics seeds (named chains off PHI)
  const C = {
    BALL_R: 1,               // ball radius (1 world unit)
    PADDLE_R: 4.5,             // base paddle radius
    PADDLE_THICK: 0.85,
    PADDLE_BEVEL: 0.94,            // top/bottom radius ratio

    SPEED_EASY: 0.25,
    SPEED_HARD: 0.40,
    SPEED_MULTI: 0.30,

    GRAVITY: 0.00075,
    DRAG: 0.99935,         // per-frame energy bleed
    MIN_SPEED: 0.22,
    MAX_SPEED: 0.85,

    WALL_BOOST: 1.035,
    WALL_BOOST_ADD: 0.004,
    CEILING_BOOST: 1.06,
    CEILING_BOOST_ADD: 0.006,

    BRICK_ABSORB: 0.968,
    BRICK_ABSORB_SF: 0.08,
    BRICK_DEFLECT: 0.030,
    WALL_DEFLECT: 0.012,

    TURB_DECAY: 0.987,
    TURB_MAX: 0.08,
    TURB_BRICK: 0.022,
    TURB_WALL: 0.010,

    MAGNUS: 0.002,
    SPIN_DECAY: 0.998,
    SPIN_TRANSFER: 0.3,

    ARENA_H: 50,              // always 50 tall
    ARENA_BASE_W: 50,              // solo arena width
    ARENA_W_STEP: 10,              // extra width per additional player

    BRICK_W: null,               // computed below: PHI * 3
    BRICK_H: 1.0,
    BRICK_GAP: 0.15,
    BRICK_LAYERS: 4,

    CEILING_GAP: null,             // PHI^3
    PADDLE_LAUNCH_EASY: 0.34,
    PADDLE_LAUNCH_HARD: 0.42,
    PADDLE_LAUNCH_MULTI: 0.38,
  };
  C.BRICK_W = PHI * 3;             // ~4.854  (phi chain: 3*phi)
  C.CEILING_GAP = PHI * PHI * PHI; // ~4.236  (phi^3)

  // 1D: layer boost line -- PHI^(1 - layer/4), top layer strongest
  // Layer 0 (red, highest, hardest to reach): PHI^1 = 1.618
  // Layer 1 (orange): PHI^0.75 ~ 1.44
  // Layer 2 (yellow): PHI^0.5  ~ 1.27
  // Layer 3 (green,  lowest):   PHI^0.25 ~ 1.12
  const LAYER_BOOST = [0, 1, 2, 3].map(i => Math.pow(PHI, 1 - i * 0.25));

  // 1D: Fibonacci-based balls-per-player (n=1..4 => 1,1,2,3)
  const FIB = [0, 1, 1, 2, 3];
  const fib = n => FIB[n] || 1;

  // 0D colors (player identity, brick layer identity)
  const BRICK_HEX = { red: 0xcc2222, orange: 0xcc7700, yellow: 0xbbbb00, green: 0x22aa22 };
  const BRICK_KEYS = ['red', 'orange', 'yellow', 'green'];
  const PLAYER_HEX = [0x00ccff, 0xff3366, 0x39ff14, 0xffaa00];

  // -- Arena lens --
  // 0D (numPlayers) -> 3D arena dimensions
  // Expression: width = BASE + (n-1)*STEP  (linear manifold z=x*y where y=STEP)
  const arenaLens = n => {
    const w = C.ARENA_BASE_W + (n - 1) * C.ARENA_W_STEP;
    const hw = w / 2;
    const hh = C.ARENA_H / 2;
    return {
      width: w,
      halfW: hw,
      halfH: hh,
      wallInner: hw - 1,
      paddleBound: hw - 5,
      paddleY: -hh + (C.PADDLE_THICK * 0.5) + 0.22,
    };
  };

  // -- Game-mode lens --
  // 0D (mode string) -> session parameters
  const modeLens = mode => {
    const isMulti = mode.startsWith('multi');
    const n = isMulti ? parseInt(mode.slice(5)) : 1;
    return {
      numPlayers: n,
      isMulti,
      baseSpeed: isMulti ? C.SPEED_MULTI : (mode === 'hard' ? C.SPEED_HARD : C.SPEED_EASY),
      lives: isMulti ? Math.max(2, 6 - n) : 5,
      ballsPerPlayer: isMulti ? fib(n) : 1,
      paddleRadius: C.PADDLE_R - (n - 1) * 0.6,
      launchSpeed: isMulti ? C.PADDLE_LAUNCH_MULTI : (mode === 'hard' ? C.PADDLE_LAUNCH_HARD : C.PADDLE_LAUNCH_EASY),
    };
  };

  // -- Brick layout lens --
  // 2D plane: for each (layer, col, row) -> { x, y, z, layer, color }
  // Expression: xz = index * gridSpacing - offset  (z = x*y where y=gridSpacing)
  const brickLayout = arenaWidth => {
    const gs = C.BRICK_W + C.BRICK_GAP;   // grid spacing
    const ls = C.BRICK_H + C.BRICK_GAP;   // layer stride
    const n = Math.floor(arenaWidth / gs);
    const offset = (n - 1) * gs / 2;
    const hw = C.ARENA_H / 2;
    const topY = hw - C.CEILING_GAP - C.BRICK_H / 2;
    const layout = [];
    for (let layer = 0; layer < C.BRICK_LAYERS; layer++) {
      const y = topY - layer * ls;
      const key = BRICK_KEYS[layer];
      const hex = BRICK_HEX[key];
      for (let col = 0; col < n; col++) {
        const x = col * gs - offset;
        for (let row = 0; row < n; row++) {
          const z = row * gs - offset;
          layout.push({ x, y, z, layer, color: hex, w: C.BRICK_W, h: C.BRICK_H, d: C.BRICK_W });
        }
      }
    }
    return layout;
  };

  // -- Ball init lens --
  // 0D (owner, speed, isMulti) -> initial ball state record (no THREE)
  const BALL_START_POS = [[0, 0], [-10, -10], [10, 10], [-10, 10]];
  const ballInit = (ownerIdx, baseSpeed, isMulti) => {
    const angle = Math.random() * Math.PI * 2;
    const sp = BALL_START_POS[ownerIdx] || [0, 0];
    const px = isMulti ? sp[0] + (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 10;
    const pz = isMulti ? sp[1] + (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 10;
    return {
      position: { x: px, y: -10, z: pz },
      velocity: { x: Math.sin(angle) * baseSpeed * 0.6, y: baseSpeed, z: Math.cos(angle) * baseSpeed * 0.4 },
      spin: { x: 0, y: 0, z: 0 },
      baseSpeed,
      spawnBaseSpeed: baseSpeed,
      turbulence: 0,
      highestLayerReached: C.BRICK_LAYERS - 1,
      belongsTo: -1,
      liabilityOwner: isMulti ? ownerIdx : -1,
      lastTouchedBy: isMulti ? -1 : ownerIdx,
      owner: ownerIdx,
      alive: true,
    };
  };

  // -- Paddle init lens --
  const paddleInit = (ownerIdx, paddleRadius) => {
    const sp = BALL_START_POS[ownerIdx] || [0, 0];
    return { x: sp[0], z: sp[1], radius: paddleRadius };
  };

  // -- Physics lenses (pure math, no stored state) --

  // Reflect velocity v across surface normal n (all plain objects {x,y,z})
  const reflect = (v, n) => {
    const dot = v.x * n.x + v.y * n.y + v.z * n.z;
    return { x: v.x - 2 * dot * n.x, y: v.y - 2 * dot * n.y, z: v.z - 2 * dot * n.z };
  };

  // Clamp ball speed to [MIN_SPEED, MAX_SPEED] (normalize to baseSpeed)
  const clampSpeed = (v, baseSpeed) => {
    const bs = Math.max(C.MIN_SPEED, Math.min(C.MAX_SPEED, baseSpeed));
    const spd = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (spd < 0.0001) return v;
    const s = bs / spd;
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  };

  // Magnus force: cross(spin, velocity) * MAGNUS_STRENGTH
  const magnusForce = (spin, vel) => ({
    x: (spin.y * vel.z - spin.z * vel.y) * C.MAGNUS,
    y: (spin.z * vel.x - spin.x * vel.z) * C.MAGNUS,
    z: (spin.x * vel.y - spin.y * vel.x) * C.MAGNUS,
  });

  // Estimate frames for ball to reach targetY under constant GRAVITY deceleration
  // Solves: pos.y + vy*t - 0.5*g*t^2 = targetY
  const estimateTimeToY = (pos, vel, targetY) => {
    const a = 0.5 * C.GRAVITY;
    const b = -vel.y;
    const c = targetY - pos.y;
    const disc = b * b - 4 * a * c;
    if (disc <= 0 || Math.abs(a) < 1e-9) {
      const denom = Math.abs(vel.y) > 1e-6 ? Math.abs(vel.y) : 1e-6;
      return Math.max(0, Math.abs(pos.y - targetY) / denom);
    }
    const sq = Math.sqrt(disc);
    const t = Math.max((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    return Number.isFinite(t) && t > 0 ? t : 0;
  };

  // 0D layer -> 0D speed multiplier (1D boost line lookup)
  const layerBoost = layer => LAYER_BOOST[layer] || 1;

  // Add micro-turbulence nudge to a velocity plain object (matches nudgeVelocity in game.js)
  const nudge = (vel, scale) => {
    vel.x += (Math.random() - 0.5) * scale;
    vel.y += (Math.random() - 0.5) * (scale * 0.35);
    vel.z += (Math.random() - 0.5) * scale;
    return vel;
  };

  return {
    PHI, C, LAYER_BOOST, BRICK_HEX, BRICK_KEYS, PLAYER_HEX,
    fib, arenaLens, modeLens, brickLayout, ballInit, paddleInit,
    reflect, clampSpeed, magnusForce, estimateTimeToY, layerBoost, nudge,
  };
})();

if (typeof module !== 'undefined') module.exports = window.BB;
