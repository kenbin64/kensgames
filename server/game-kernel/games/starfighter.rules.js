'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 Starfighter — server-authoritative real-time GameRules
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SCOPE (first slice — multiplayer dogfight):
 *   - 2–4 players, real-time (no turns)
 *   - Server runs 30 Hz authoritative simulation:
 *       * applies player input intents → ship velocity/orientation
 *       * advances ship + bullet positions
 *       * resolves bullet ↔ ship hits, awards kills, respawns
 *   - Single unified state broadcast on every tick (all ships, all bullets,
 *     all health). All clients see the same world.
 *   - First to KILL_TARGET kills wins.
 *
 * Ships use a simple 2D arena (x, y, heading) — easy to validate; the
 * client renders 3D over the same {x, y, heading} authority. The server
 * does NOT need 3D — the gameplay is determined by 2D positions/velocities.
 *
 * Wire actions:
 *   { type: 'input', payload: { thrust: -1..1, turn: -1..1, fire: bool } }
 *
 * State (broadcast every tick):
 *   {
 *     phase, t, arena: { w, h },
 *     ships:   { id: { x, y, heading, vx, vy, hp, kills, deaths, alive, respawnIn } },
 *     bullets: [ { id, owner, x, y, vx, vy, ttl } ],
 *     winner, killTarget,
 *   }
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const ARENA = { w: 200, h: 200 };
const SHIP = {
  thrustAccel: 60,    // units / s²
  turnRate: 3.0,      // rad / s
  maxSpeed: 50,
  drag: 0.6,          // per second
  hp: 100,
  radius: 2.0,
  fireCooldown: 0.25, // s between shots
  respawnDelay: 2.0,  // s
};
const BULLET = {
  speed: 80,          // units / s
  ttl: 2.0,           // s
  damage: 25,
  radius: 0.6,
};
const KILL_TARGET = 5;

let _bulletCounter = 0;
function nextBulletId() { return 'b' + (++_bulletCounter); }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wrap(v, max) {
  if (v < 0) return v + max;
  if (v >= max) return v - max;
  return v;
}

function spawnPos(slot) {
  // Distribute spawn corners
  const positions = [
    { x: 30, y: 30, heading: 0 },
    { x: ARENA.w - 30, y: ARENA.h - 30, heading: Math.PI },
    { x: 30, y: ARENA.h - 30, heading: -Math.PI / 2 },
    { x: ARENA.w - 30, y: 30, heading: Math.PI / 2 },
  ];
  return positions[slot % positions.length];
}

function newShip(playerId, slot) {
  const pos = spawnPos(slot);
  return {
    id: playerId,
    slot,
    x: pos.x, y: pos.y, heading: pos.heading,
    vx: 0, vy: 0,
    hp: SHIP.hp,
    kills: 0, deaths: 0,
    alive: true,
    respawnIn: 0,
    fireCd: 0,
    input: { thrust: 0, turn: 0, fire: false },
  };
}

const RULES = {
  id: 'starfighter',
  tickHz: 30,

  createInitialState(players) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
      throw new Error('starfighter: requires 2–4 players');
    }
    const ships = {};
    players.forEach((p, i) => { ships[p.id] = newShip(p.id, i); });
    return {
      phase: 'playing',
      t: 0,
      arena: ARENA,
      ships,
      bullets: [],
      winner: null,
      killTarget: KILL_TARGET,
    };
  },

  validateAction(state, action) {
    if (state.phase !== 'playing') return false;
    if (!action || !action.playerId) return false;
    if (!state.ships[action.playerId]) return false;
    return action.type === 'input';
  },

  applyAction(state, action) {
    // Inputs are stored on the ship; the tick loop is what advances the world.
    const p = action.payload || {};
    const ships = { ...state.ships };
    const me = { ...ships[action.playerId] };
    me.input = {
      thrust: clamp(Number(p.thrust) || 0, -1, 1),
      turn: clamp(Number(p.turn) || 0, -1, 1),
      fire: !!p.fire,
    };
    ships[action.playerId] = me;
    return { ...state, ships };
  },

  tick(state, dt) {
    if (state.phase !== 'playing') return state;
    if (!(dt > 0)) return state;
    if (dt > 0.1) dt = 0.1; // clamp giant pauses

    const ships = { ...state.ships };
    let bullets = state.bullets.slice();

    // 1) Advance ships
    for (const id of Object.keys(ships)) {
      const s = { ...ships[id] };

      if (!s.alive) {
        s.respawnIn = Math.max(0, s.respawnIn - dt);
        if (s.respawnIn === 0) {
          const pos = spawnPos(s.slot);
          s.x = pos.x; s.y = pos.y; s.heading = pos.heading;
          s.vx = 0; s.vy = 0; s.hp = SHIP.hp; s.alive = true; s.fireCd = 0;
        }
        ships[id] = s;
        continue;
      }

      // Apply input
      s.heading += s.input.turn * SHIP.turnRate * dt;
      const ax = Math.cos(s.heading) * s.input.thrust * SHIP.thrustAccel;
      const ay = Math.sin(s.heading) * s.input.thrust * SHIP.thrustAccel;
      s.vx += ax * dt;
      s.vy += ay * dt;
      // Drag
      const dragK = Math.exp(-SHIP.drag * dt);
      s.vx *= dragK; s.vy *= dragK;
      // Speed cap
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > SHIP.maxSpeed) {
        s.vx = s.vx / sp * SHIP.maxSpeed;
        s.vy = s.vy / sp * SHIP.maxSpeed;
      }
      // Move (wrap arena)
      s.x = wrap(s.x + s.vx * dt, ARENA.w);
      s.y = wrap(s.y + s.vy * dt, ARENA.h);

      // Fire
      s.fireCd = Math.max(0, s.fireCd - dt);
      if (s.input.fire && s.fireCd === 0) {
        bullets.push({
          id: nextBulletId(),
          owner: id,
          x: s.x + Math.cos(s.heading) * (SHIP.radius + 0.5),
          y: s.y + Math.sin(s.heading) * (SHIP.radius + 0.5),
          vx: s.vx + Math.cos(s.heading) * BULLET.speed,
          vy: s.vy + Math.sin(s.heading) * BULLET.speed,
          ttl: BULLET.ttl,
        });
        s.fireCd = SHIP.fireCooldown;
      }

      ships[id] = s;
    }

    // 2) Advance bullets
    const aliveBullets = [];
    for (const b of bullets) {
      const nb = { ...b };
      nb.ttl -= dt;
      if (nb.ttl <= 0) continue;
      nb.x = wrap(nb.x + nb.vx * dt, ARENA.w);
      nb.y = wrap(nb.y + nb.vy * dt, ARENA.h);
      aliveBullets.push(nb);
    }
    bullets = aliveBullets;

    // 3) Bullet ↔ ship collision
    let winner = state.winner;
    const surviving = [];
    for (const b of bullets) {
      let hit = false;
      for (const id of Object.keys(ships)) {
        if (id === b.owner) continue;
        const s = ships[id];
        if (!s.alive) continue;
        const dx = s.x - b.x, dy = s.y - b.y;
        if (dx * dx + dy * dy <= (SHIP.radius + BULLET.radius) ** 2) {
          // Hit
          const victim = { ...s };
          victim.hp -= BULLET.damage;
          if (victim.hp <= 0) {
            victim.hp = 0;
            victim.alive = false;
            victim.deaths += 1;
            victim.respawnIn = SHIP.respawnDelay;
            const killer = { ...ships[b.owner] };
            killer.kills += 1;
            ships[b.owner] = killer;
            if (killer.kills >= KILL_TARGET) winner = b.owner;
          }
          ships[id] = victim;
          hit = true;
          break;
        }
      }
      if (!hit) surviving.push(b);
    }

    return {
      ...state,
      t: state.t + dt,
      ships,
      bullets: surviving,
      winner,
      phase: winner ? 'ended' : state.phase,
    };
  },

  isGameOver(state) { return state.phase === 'ended'; },

  // Everyone sees everything in a dogfight.
  getVisibleState(state /*, playerId */) {
    return state;
  },
};

module.exports = RULES;
