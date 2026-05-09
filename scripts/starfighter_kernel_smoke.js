#!/usr/bin/env node
'use strict';

/**
 * Starfighter ⇄ GameKernel — live integration smoke (slice 4).
 *
 * Verifies the server-side authoritative real-time sim:
 *   1. Two players join a starfighter session and launch.
 *   2. The kernel broadcasts an initial 'state' envelope with both ships.
 *   3. The kernel broadcasts periodic 'tick' updates at >= 10 Hz.
 *   4. A player's `input` envelope (thrust=1) measurably moves their ship
 *      (vx² + vy² grows over the next ~0.5 s of ticks).
 *
 * Requires the lobby-server running on :8765.
 */

const WebSocket = require('../server/node_modules/ws');
const URL = process.env.LOBBY_WS_URL || 'ws://localhost:8765/ws';

function mkClient(label) {
  const ws = new WebSocket(URL);
  const events = [];
  ws.on('message', (raw) => { try { events.push(JSON.parse(raw)); } catch (_) { } });
  return {
    ws, events, label, userId: null,
    send(o) { ws.send(JSON.stringify(o)); },
    open() { return new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }); },
    waitFor(pred, ms) {
      ms = ms || 5000;
      return new Promise((res, rej) => {
        const t0 = Date.now();
        const tick = () => {
          const m = events.find(pred);
          if (m) return res(m);
          if (Date.now() - t0 > ms) {
            const tail = events.slice(-6).map((e) => e.type + (e.payload && e.payload.type ? '/' + e.payload.type : ''));
            return rej(new Error(label + ': timeout (last: ' + tail.join(', ') + ')'));
          }
          setTimeout(tick, 30);
        };
        tick();
      });
    },
    close() { try { ws.close(); } catch (_) { } },
  };
}

async function asGuest(c, name) {
  c.send({ type: 'guest_login', token: 'guest-' + name + '-' + Date.now(), name, avatar_id: 'person_smile' });
  const auth = await c.waitFor((e) => e.type === 'auth_success');
  c.userId = auth.user_id != null ? String(auth.user_id) : null;
}

(async () => {
  const host = mkClient('HOST'); await host.open();
  const guest = mkClient('GUEST'); await guest.open();
  await asGuest(host, 'PilotA');
  await asGuest(guest, 'PilotB');

  host.send({ type: 'create_session', game_id: 'starfighter', private: true, max_players: 2 });
  const sc = await host.waitFor((e) => e.type === 'share_code'
    || (e.type === 'session_created' && e.session && e.session.session_code));
  const code = sc.code || (sc.session && sc.session.session_code);
  if (!code) throw new Error('no share code');

  host.send({ type: 'toggle_ready' });
  guest.send({ type: 'join_by_code', code });
  await guest.waitFor((e) => e.type === 'session_joined' || e.type === 'session_update');
  guest.send({ type: 'toggle_ready' });

  const readyByUser = {};
  await host.waitFor((e) => {
    if (e.type === 'ready_update' && e.user_id) readyByUser[e.user_id] = !!e.ready;
    if (e.type === 'session_update' && e.session && Array.isArray(e.session.players)) {
      e.session.players.forEach((p) => { if (p.user_id) readyByUser[p.user_id] = !!p.ready; });
    }
    const ids = Object.keys(readyByUser);
    return ids.length >= 2 && ids.every((id) => readyByUser[id]);
  });

  host.send({ type: 'accept_lobby' });
  host.send({ type: 'start_game' });
  await host.waitFor((e) => e.type === 'game_started');
  await guest.waitFor((e) => e.type === 'game_started');

  // ── 1. Initial kernel_state ──────────────────────────────────────────────
  const init = await host.waitFor(
    (e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state' && e.payload.state && e.payload.state.ships,
    3000,
  );
  const initShips = init.payload.state.ships;
  if (!initShips || Object.keys(initShips).length !== 2) {
    throw new Error('expected 2 ships in initial state, got ' + Object.keys(initShips || {}).length);
  }
  console.log('OK  initial kernel_state with 2 ships');

  // ── 2. Tick stream at >= 10 Hz ───────────────────────────────────────────
  // GameMaster broadcasts ticks as {type:'state'} envelopes (the unified
  // delta path). We measure tick rate by counting state envelopes per second.
  host.events.length = 0;
  await new Promise((r) => setTimeout(r, 600));
  const ticks = host.events.filter((e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state');
  if (ticks.length < 6) throw new Error('expected >=6 state ticks in 600 ms, got ' + ticks.length);
  console.log('OK  kernel ticks streaming (' + ticks.length + ' state envelopes / 600 ms)');

  // ── 3. Input envelope moves the ship ─────────────────────────────────────
  const myShipId = host.userId;
  const baselineVx = ticks[ticks.length - 1].payload.state.ships[myShipId].vx;
  const baselineVy = ticks[ticks.length - 1].payload.state.ships[myShipId].vy;
  const baselineSpeed2 = baselineVx * baselineVx + baselineVy * baselineVy;

  // Send sustained thrust=1 for ~600 ms.
  host.events.length = 0;
  const inputTimer = setInterval(() => {
    host.send({ type: 'game_action', kernel: { type: 'input', payload: { thrust: 1, turn: 0, fire: false } } });
  }, 50);
  await new Promise((r) => setTimeout(r, 700));
  clearInterval(inputTimer);

  const after = host.events.filter((e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state');
  if (after.length === 0) throw new Error('no ticks during input phase');
  const lastShip = after[after.length - 1].payload.state.ships[myShipId];
  const speed2 = lastShip.vx * lastShip.vx + lastShip.vy * lastShip.vy;
  if (speed2 <= baselineSpeed2 + 1) {
    throw new Error('thrust did not accelerate ship: baseline=' + baselineSpeed2.toFixed(2) + ' after=' + speed2.toFixed(2));
  }
  console.log('OK  thrust input accelerated ship (|v|² ' + baselineSpeed2.toFixed(2) + ' → ' + speed2.toFixed(2) + ')');

  host.close(); guest.close();
  console.log('\nStarfighter ⇄ kernel: all checks passed.');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
