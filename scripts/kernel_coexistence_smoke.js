#!/usr/bin/env node
'use strict';

/**
 * Lobby <-> Kernel coexistence smoke test.
 *
 * Verifies two contracts on a kernel-managed game session (4DTicTacToe):
 *
 *   1. LEGACY RELAY:  When a peer sends a plain `game_action` without a
 *      `kernel:` envelope, the lobby relays it verbatim to the other peer
 *      (existing 4DTicTacToe `KGSync.broadcast` path must keep working).
 *
 *   2. KERNEL OPT-IN: When a peer sends `game_action` with a `kernel:`
 *      envelope, the message is intercepted by the kernel router and
 *      validated by the GameMaster (an invalid action elicits a
 *      `kernel_state` envelope with `payload.type === 'error'`); the
 *      lobby does NOT relay it to other peers.
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
    ws, events, label,
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
            const seen = events.map((e) => e.type).join(', ');
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
  await c.waitFor((e) => e.type === 'auth_success');
}

(async () => {
  const host = mkClient('HOST'); await host.open();
  const guest = mkClient('GUEST'); await guest.open();
  await asGuest(host, 'Host');
  await asGuest(guest, 'Guest');

  // Open a 4DTicTacToe friend session (kernel-managed).
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

  // Drain start-up traffic before measuring the contract.
  host.events.length = 0;
  guest.events.length = 0;

  // ── 1. Legacy relay: plain game_action must reach the other peer ──
  // Mirrors 4DTicTacToe's KGSync.broadcast() shape.
  guest.send({ type: 'game_action', action: 'move', payload: { gx: 0, gy: 0, gz: 0, p: 2 } });
  const relayed = await host.waitFor(
    (e) => e.type === 'game_action' && e.action === 'move' && e.payload && e.payload.gx === 0,
    2000,
  );
  if (!relayed) throw new Error('legacy relay broken — host did not receive guest move');
  console.log('OK  legacy game_action relay still works on kernel-managed session');

  // Host should NOT have received any `kernel_state` for the legacy action.
  const leakedKernel = host.events.find((e) => e.type === 'kernel_state');
  if (leakedKernel) throw new Error('legacy action leaked into kernel: ' + JSON.stringify(leakedKernel));

  host.events.length = 0;
  guest.events.length = 0;

  // ── 2. Kernel opt-in: kernel envelope is intercepted, NOT relayed ──
  // Send a deliberately invalid drop (out-of-range column) to trigger an error.
  guest.send({
    type: 'game_action',
    kernel: { type: 'drop', payload: { col: 999, layer: 0 } },
  });
  // The guest (sender) gets an `error` envelope back.
  const err = await guest.waitFor(
    (e) => e.type === 'kernel_state' && e.payload && e.payload.type === 'error',
    2000,
  );
  if (!err) throw new Error('kernel did not respond to opt-in action');
  console.log('OK  kernel opt-in action validated (got error envelope as expected)');

  // The host MUST NOT have received the guest's kernel action as a `game_action` relay.
  await new Promise((r) => setTimeout(r, 200));
  const leakedRelay = host.events.find((e) => e.type === 'game_action');
  if (leakedRelay) throw new Error('kernel action leaked to peer relay: ' + JSON.stringify(leakedRelay));
  console.log('OK  kernel-opt-in action did NOT leak to legacy peer relay');

  host.close(); guest.close();
  console.log('\nKernel/legacy coexistence: all checks passed.');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
