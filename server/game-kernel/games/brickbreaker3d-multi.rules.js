'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 BrickBreaker 3D — multiplayer real-time GameRules
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SCOPE (multiplayer slice, complementing brickbreaker3d.rules.js which
 * handles solo / solo_vs_bot turn-style scoring):
 *
 *   - 2–4 players on separate devices, real-time (no turns)
 *   - Each player owns ONE paddle on a circular arena
 *   - Paddles move freely along the rim (input intent → server simulates)
 *   - One ball per player (configurable). Server simulates ball physics.
 *   - Brick ring in the middle; bricks fall when struck.
 *   - Last paddle alive wins (player loses when ball passes their arc).
 *
 * 30 Hz authoritative tick. Same input/state contract as Starfighter so the
 * unified player-panel header can render a "live" badge for both.
 *
 * Wire actions:
 *   { type: 'input', payload: { paddle: -1..1 } }   // angular velocity intent
 *
 * State broadcast every tick:
 *   {
 *     phase, t, arena: { radius, paddleArc },
 *     paddles: { id: { angle, slot, lives, score, alive } },
 *     balls:   [ { id, x, y, vx, vy, owner } ],
 *     bricks:  [ { id, angle, ring, hits, alive } ],
 *     winner,
 *   }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const ARENA = { radius: 50 };
const PADDLE = {
  arcDefault: Math.PI / 3,   // 60° arc per paddle (4 players → 60° each, gaps between)
  angularSpeed: 2.5,         // rad / s at full input
  thickness: 1.2,
};
const BALL = {
  speed: 35,                 // initial speed
  radius: 0.8,
  speedupOnBrick: 1.04,      // multiplicative
  maxSpeed: 60,
};
const BRICK = {
  rings: 2,
  perRing: 12,
  hitsPerBrick: 1,
  innerRadius: 12,
  ringSpacing: 4,
};

let _idCounter = 0;
function nextId(prefix) { return prefix + (++_idCounter); }

function paddleAngleFor(slot, n) { return (slot / n) * Math.PI * 2; }
function angleDist(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function spawnBall(ownerId, towardAngle) {
  const speed = BALL.speed;
  return {
    id: nextId('b'),
    owner: ownerId,
    x: 0, y: 0,
    vx: Math.cos(towardAngle) * speed,
    vy: Math.sin(towardAngle) * speed,
  };
}

function buildBricks() {
  const bricks = [];
  for (let r = 0; r < BRICK.rings; r++) {
    const radius = BRICK.innerRadius + r * BRICK.ringSpacing;
    for (let i = 0; i < BRICK.perRing; i++) {
      const angle = (i / BRICK.perRing) * Math.PI * 2;
      bricks.push({
        id: nextId('br'),
        angle, ring: r, radius,
        hits: BRICK.hitsPerBrick,
        alive: true,
      });
    }
  }
  return bricks;
}

const RULES = {
  id: 'brickbreaker3d_multi',
  tickHz: 30,

  createInitialState(players) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
      throw new Error('brickbreaker3d_multi: requires 2–4 players');
    }
    const n = players.length;
    const livesByCount = { 2: 4, 3: 3, 4: 2 };
    const startLives = livesByCount[n] || 2;
    const paddleArc = Math.min(PADDLE.arcDefault, (Math.PI * 2) / n * 0.6);

    const paddles = {};
    players.forEach((p, i) => {
      paddles[p.id] = {
        id: p.id,
        slot: i,
        angle: paddleAngleFor(i, n),
        input: 0,
        lives: startLives,
        score: 0,
        alive: true,
      };
    });

    // One ball per player, launched from center toward their paddle's opposite.
    const balls = players.map((p, i) => spawnBall(p.id, paddleAngleFor(i, n) + Math.PI));

    return {
      phase: 'playing',
      t: 0,
      arena: { radius: ARENA.radius, paddleArc },
      paddles,
      balls,
      bricks: buildBricks(),
      winner: null,
      n,
    };
  },

  validateAction(state, action) {
    if (state.phase !== 'playing') return false;
    if (!action || !action.playerId) return false;
    if (!state.paddles[action.playerId]) return false;
    return action.type === 'input';
  },

  applyAction(state, action) {
    const paddles = { ...state.paddles };
    const me = { ...paddles[action.playerId] };
    me.input = Math.max(-1, Math.min(1, Number((action.payload || {}).paddle) || 0));
    paddles[action.playerId] = me;
    return { ...state, paddles };
  },

  tick(state, dt) {
    if (state.phase !== 'playing') return state;
    if (!(dt > 0)) return state;
    if (dt > 0.1) dt = 0.1;

    const paddles = { ...state.paddles };
    const arc = state.arena.paddleArc;

    // 1) Move paddles
    for (const id of Object.keys(paddles)) {
      const p = { ...paddles[id] };
      if (!p.alive) { paddles[id] = p; continue; }
      p.angle = wrapAngle(p.angle + p.input * PADDLE.angularSpeed * dt);
      paddles[id] = p;
    }

    // 2) Advance balls + collisions
    const bricks = state.bricks.map((b) => ({ ...b }));
    const balls = [];
    let winner = state.winner;

    for (const ballOrig of state.balls) {
      const b = { ...ballOrig };
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const r = Math.hypot(b.x, b.y);

      // Brick collision (cheap radial check: ball's radius matches a brick ring)
      for (const br of bricks) {
        if (!br.alive) continue;
        const dx = b.x - Math.cos(br.angle) * br.radius;
        const dy = b.y - Math.sin(br.angle) * br.radius;
        if (dx * dx + dy * dy <= (BALL.radius + 1.5) ** 2) {
          br.hits -= 1;
          if (br.hits <= 0) br.alive = false;
          // Reflect: bounce away from brick center
          const nx = -Math.cos(br.angle), ny = -Math.sin(br.angle);
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
          // Speed up
          const sp = Math.hypot(b.vx, b.vy) * BALL.speedupOnBrick;
          const cap = Math.min(BALL.maxSpeed, sp);
          const sc = cap / Math.hypot(b.vx, b.vy);
          b.vx *= sc; b.vy *= sc;
          // Score the owner
          const ownerPaddle = paddles[b.owner];
          if (ownerPaddle) {
            const np = { ...ownerPaddle };
            np.score += 10;
            paddles[b.owner] = np;
          }
          break;
        }
      }

      // Wall (rim) check — find which paddle's arc this is over
      if (r >= ARENA.radius) {
        const ang = Math.atan2(b.y, b.x);
        // Did any paddle catch it?
        let caught = false;
        for (const id of Object.keys(paddles)) {
          const p = paddles[id];
          if (!p.alive) continue;
          if (angleDist(ang, p.angle) <= arc / 2) {
            caught = true;
            // Reflect inward
            const nx = -Math.cos(ang), ny = -Math.sin(ang);
            const dot = b.vx * nx + b.vy * ny;
            b.vx -= 2 * dot * nx;
            b.vy -= 2 * dot * ny;
            // Push back inside
            b.x = Math.cos(ang) * (ARENA.radius - 0.5);
            b.y = Math.sin(ang) * (ARENA.radius - 0.5);
            break;
          }
        }
        if (!caught) {
          // Find the nearest alive paddle to that angle → they lose a life
          let losserId = null, best = Infinity;
          for (const id of Object.keys(paddles)) {
            if (!paddles[id].alive) continue;
            const d = angleDist(ang, paddles[id].angle);
            if (d < best) { best = d; losserId = id; }
          }
          if (losserId) {
            const lp = { ...paddles[losserId] };
            lp.lives -= 1;
            if (lp.lives <= 0) lp.alive = false;
            paddles[losserId] = lp;
          }
          // Respawn ball from center toward a random direction
          const a = Math.random() * Math.PI * 2;
          b.x = 0; b.y = 0;
          b.vx = Math.cos(a) * BALL.speed;
          b.vy = Math.sin(a) * BALL.speed;
        }
      }

      balls.push(b);
    }

    // 3) Resolve winner: last alive paddle
    const aliveIds = Object.keys(paddles).filter((id) => paddles[id].alive);
    if (aliveIds.length === 1) winner = aliveIds[0];
    else if (aliveIds.length === 0) winner = 'draw';

    return {
      ...state,
      t: state.t + dt,
      paddles,
      balls,
      bricks,
      winner,
      phase: winner ? 'ended' : state.phase,
    };
  },

  isGameOver(state) { return state.phase === 'ended'; },
  getVisibleState(state) { return state; },
};

module.exports = RULES;
