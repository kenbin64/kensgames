#!/usr/bin/env node
'use strict';

/**
 * FastTrack ⇄ GameKernel — live integration smoke (hybrid mode).
 *
 * In hybrid mode the host client still owns the deck and broadcasts the
 * popped card to peers via the legacy `game_action` relay. The kernel
 * runs alongside as the server-side turn validator. This test verifies:
 *
 *   1. Initial `kernel_state` of type 'state' is broadcast on game start
 *      with phaseStep='draw' and the host as the active player.
 *   2. Active player's `draw` envelope is accepted; phaseStep flips to 'play'.
 *   3. Passive player's `draw` is rejected (not-your-turn).
 *   4. Active player's `play` envelope (with extraTurn=false) advances turnIdx.
 *   5. After rotation the previously passive player can now draw.
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

  host.send({ type: 'create_session', game_id: 'fasttrack', private: true, max_players: 2 });
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
  await host.waitFor((e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state', 3000);
  await guest.waitFor((e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'state', 3000);
  const init = lastState(host);
  if (!init || init.phaseStep !== 'draw') throw new Error('expected initial phaseStep=draw, got ' + (init && init.phaseStep));
  if (!Array.isArray(init.order) || init.order.length !== 2) throw new Error('order missing in initial state');
  console.log('OK  initial kernel_state (phaseStep=draw, order.length=2)');

  const activeId = init.order[init.turnIdx];
  const activeClient = (host.userId === activeId) ? host : guest;
  const passiveClient = (host.userId === activeId) ? guest : host;
  console.log('    active=' + activeClient.label + ' passive=' + passiveClient.label);

  // ── 2. Active player draws → phaseStep flips to 'play' ───────────────────
  host.events.length = 0; guest.events.length = 0;
  activeClient.send({ type: 'game_action', kernel: { type: 'draw' } });
  await host.waitFor((e) => {
    if (e.type !== 'kernel_state' || !e.payload || e.payload.type !== 'state') return false;
    return e.payload.state && e.payload.state.phaseStep === 'play' && e.payload.state.pendingCard;
  }, 3000);
  console.log('OK  active player draw accepted (phaseStep=play, pendingCard set)');

  // ── 3. Passive player attempts draw → rejected ───────────────────────────
  passiveClient.events.length = 0;
  passiveClient.send({ type: 'game_action', kernel: { type: 'draw' } });
  // Should also be rejected because phaseStep is 'play' now, but more
  // importantly because they aren't the active player.
  const err = await passiveClient.waitFor(
    (e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'error',
    2000,
  );
  if (!err) throw new Error('passive draw should have been rejected');
  console.log('OK  passive draw rejected (reason=' + err.payload.reason + ')');

  // ── 4. Active player plays (extraTurn=false) → turnIdx advances ──────────
  host.events.length = 0; guest.events.length = 0;
  activeClient.send({
    type: 'game_action',
    kernel: { type: 'play', payload: { extraTurn: false, move: { from: 'x', to: 'y' } } },
  });
  await host.waitFor((e) => {
    if (e.type !== 'kernel_state' || !e.payload || e.payload.type !== 'state') return false;
    const s = e.payload.state;
    return s && s.phaseStep === 'draw' && s.turnIdx !== init.turnIdx;
  }, 3000);
  const after = lastState(host);
  if (after.order[after.turnIdx] !== passiveClient.userId) {
    throw new Error('expected turn to advance to passive client');
  }
  console.log('OK  play accepted, turnIdx ' + init.turnIdx + ' → ' + after.turnIdx + ' (now active=' + passiveClient.label + ')');

  // ── 5. Previously-passive player can now draw ────────────────────────────
  passiveClient.events.length = 0;
  passiveClient.send({ type: 'game_action', kernel: { type: 'draw' } });
  await passiveClient.waitFor((e) => {
    if (e.type !== 'kernel_state' || !e.payload || e.payload.type !== 'state') return false;
    const s = e.payload.state;
    return s && s.phaseStep === 'play' && s.order[s.turnIdx] === passiveClient.userId;
  }, 3000);
  console.log('OK  rotated active player can now draw');

  host.close(); guest.close();
  console.log('\nFastTrack ⇄ kernel: all checks passed.');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
