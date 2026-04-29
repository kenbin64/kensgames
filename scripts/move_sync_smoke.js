// Smoke test: verifies the lobby server's `game_action` relay carries the
// 4DTicTacToe move payload from host to guest and back. Mirrors what
// 4DTicTacToe/game.js KGSync does in the browser. Requires the lobby server
// running on ws://localhost:8765.
const WebSocket = require('../server/node_modules/ws');
const URL = 'ws://localhost:8765';
function mkClient(label) {
  const ws = new WebSocket(URL);
  const events = [];
  ws.on('message', (raw) => { try { events.push(JSON.parse(raw)); } catch (_) { } });
  return {
    ws, events, label,
    send(o) { ws.send(JSON.stringify(o)); },
    open() { return new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }); },
    waitFor(type, ms) {
      ms = ms || 4000;
      return new Promise((res, rej) => {
        const t0 = Date.now();
        const tick = () => {
          const m = events.find(e => e.type === type);
          if (m) return res(m);
          if (Date.now() - t0 > ms) return rej(new Error(label + ': timeout waiting for ' + type));
          setTimeout(tick, 30);
        };
        tick();
      });
    },
    close() { try { ws.close(); } catch (_) { } },
  };
}
async function asGuest(c, name) {
  c.send({ type: 'guest_login', token: 'guest-' + name + '-' + Date.now(), name: name, avatar_id: 'person_smile' });
  await c.waitFor('auth_success');
}
(async () => {
  const host = mkClient('HOST'); await host.open();
  const guest = mkClient('GUEST'); await guest.open();
  await asGuest(host, 'HostUser');
  await asGuest(guest, 'GuestUser');
  host.send({ type: 'create_session', game_id: '4dtictactoe', private: true, max_players: 4 });
  const created = await host.waitFor('session_created');
  const code = created.session.session_code;
  console.log('HOST created session, code=', code);
  host.send({ type: 'toggle_ready' });
  guest.send({ type: 'join_by_code', code });
  await guest.waitFor('session_joined');
  guest.send({ type: 'toggle_ready' });
  await new Promise(r => setTimeout(r, 200));
  host.send({ type: 'accept_lobby' });
  await host.waitFor('lobby_accepted');
  host.send({ type: 'start_game' });
  await guest.waitFor('game_started');
  console.log('Both clients reached game_started');
  const move = { gx: 2, gy: 0, gz: 1, p: 1 };
  host.send({ type: 'game_action', action: 'move', payload: move, seq: 1 });
  const recv = await guest.waitFor('game_action', 3000);
  console.log('GUEST received game_action:', JSON.stringify(recv));
  const ok = recv.action === 'move' && recv.payload &&
    recv.payload.gx === 2 && recv.payload.gz === 1 && recv.payload.p === 1;
  console.log(ok ? 'PASS: host->guest move relay works' : 'FAIL: payload mismatch');
  guest.send({ type: 'game_action', action: 'move', payload: { gx: 0, gy: 0, gz: 0, p: 2 }, seq: 1 });
  const back = await host.waitFor('game_action', 3000);
  console.log('HOST received reply move:', JSON.stringify(back));
  const ok2 = back.action === 'move' && back.payload && back.payload.gx === 0 && back.payload.p === 2;
  console.log(ok2 ? 'PASS: guest->host move relay works' : 'FAIL: reply payload mismatch');
  host.close(); guest.close();
  process.exit((ok && ok2) ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(2); });
