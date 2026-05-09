#!/usr/bin/env node
'use strict';

/**
 * 4DTicTacToe ⇄ GameKernel — live integration smoke.
 *
 * Two ws clients connect, open a 4dtictactoe friend session, ready+launch.
 * Then drive the kernel directly (the same envelope the in-page KGSync.broadcast
 * now uses) and verify:
 *
 *   1. Initial `kernel_state` of type 'state' is broadcast on game start.
 *   2. The active player's `drop` is accepted and produces a new state with
 *      the piece committed at the lowest free row.
 *   3. The other player's `drop` is REJECTED (turn ownership) and they
 *      receive a `kernel_state` envelope with `payload.type === 'error'`.
 *   4. After both players send `settle_complete`, the turnIdx advances.
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
      ms = ms || 4000;
      return new Promise((res, rej) => {
        const t0 = Date.now();
        const tick = () => {
          const m = events.find(pred);
          if (m) return res(m);
          if (Date.now() - t0 > ms) {
            const seen = events.map((e) => e.type + (e.payload && e.payload.type ? '/' + e.payload.type : '')).join(', ');
            return rej(new Error(label + ': timeout (saw: ' + seen + ')'));
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

function lastState(c) {
  for (let i = c.events.length - 1; i >= 0; i--) {
    const e = c.events[i];
    if (e.type === 'kernel_state' && e.payload && e.payload.type === 'state') return e.payload.state;
  }
  return null;
}

(async () => {
  const host = mkClient('HOST'); await host.open();
  const guest = mkClient('GUEST'); await guest.open();
  await asGuest(host, 'Host');
  await asGuest(guest, 'Guest');

  host.send({ type: 'create_session', game_id: '4dtictactoe', private: true, max_players: 2 });
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

  // ── 1. Initial state broadcast ───────────────────────────────────────────
  await host.waitFor((e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state', 3000);
  await guest.waitFor((e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state', 3000);
  const initState = lastState(host);
  if (!initState || !Array.isArray(initState.order) || initState.order.length !== 2) {
    throw new Error('initial state malformed: ' + JSON.stringify(initState));
  }
  console.log('OK  initial kernel_state broadcast (size=' + initState.size + ', winLen=' + initState.winLen + ')');

  // Active player is order[turnIdx]. Map back to host vs guest.
  const activeId = initState.order[initState.turnIdx];
  const passiveId = initState.order[(initState.turnIdx + 1) % 2];
  const activeClient = (host.userId === activeId) ? host : guest;
  const passiveClient = (host.userId === activeId) ? guest : host;
  console.log('    active=' + activeClient.label + ' passive=' + passiveClient.label);

  // ── 2. Active player drops at (col=0, layer=0) ───────────────────────────
  host.events.length = 0;
  guest.events.length = 0;
  activeClient.send({
    type: 'game_action',
    kernel: { type: 'drop', payload: { col: 0, layer: 0 } },
  });
  // Both clients receive the new state with one piece placed.
  await host.waitFor((e) => {
    if (e.type !== 'kernel_state' || !e.payload || e.payload.type !== 'state') return false;
    const s = e.payload.state;
    return s && s.board && s.board[0] && s.board[0][0] && s.board[0][0][0] === activeClient.userId;
  }, 3000);
  await guest.waitFor((e) => {
    if (e.type !== 'kernel_state' || !e.payload || e.payload.type !== 'state') return false;
    const s = e.payload.state;
    return s && s.board && s.board[0] && s.board[0][0] && s.board[0][0][0] === activeClient.userId;
  }, 3000);
  const afterDrop = lastState(host);
  if (!afterDrop.unsettled) throw new Error('expected unsettled=true after drop');
  console.log('OK  drop accepted, piece placed at (col=0,row=0,layer=0), state=unsettled');

  // ── 3. Passive player attempts to drop → rejected with error envelope ───
  passiveClient.events.length = 0;
  passiveClient.send({
    type: 'game_action',
    kernel: { type: 'drop', payload: { col: 1, layer: 0 } },
  });
  const err = await passiveClient.waitFor(
    (e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'error',
    2000,
  );
  if (!err) throw new Error('expected error envelope on out-of-turn drop');
  console.log('OK  out-of-turn drop rejected with error envelope (reason=' + err.payload.reason + ')');

  // ── 4. Both players send settle_complete → turnIdx advances ──────────────
  host.events.length = 0;
  guest.events.length = 0;
  activeClient.send({ type: 'game_action', kernel: { type: 'settle_complete' } });
  passiveClient.send({ type: 'game_action', kernel: { type: 'settle_complete' } });
  await host.waitFor((e) => {
    if (e.type !== 'kernel_state' || !e.payload || e.payload.type !== 'state') return false;
    const s = e.payload.state;
    return s && s.unsettled === false && s.turnIdx !== initState.turnIdx;
  }, 3000);
  const after = lastState(host);
  if (after.turnIdx === initState.turnIdx) throw new Error('turn did not advance');
  console.log('OK  settle handshake complete, turnIdx ' + initState.turnIdx + ' → ' + after.turnIdx);

  host.close(); guest.close();
  console.log('\n4DTicTacToe ⇄ kernel: all checks passed.');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
