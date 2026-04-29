// Smoke test for the universal landing -> lobby -> launch flow.
// Drives the same WebSocket protocol the in-browser KGMultiplayerPanel does
// when the user lands on a game lobby URL with ?mode=solo or ?mode=friend
// after coming from the portal modal.
//
// Requires the lobby server running on ws://localhost:8765.
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
    waitFor(pred, ms) {
      ms = ms || 4000;
      return new Promise((res, rej) => {
        const t0 = Date.now();
        const tick = () => {
          const m = events.find(pred);
          if (m) return res(m);
          if (Date.now() - t0 > ms) {
            const seen = events.map(e => e.type + (e.message ? '(' + e.message + ')' : '')).join(', ');
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
  await c.waitFor(e => e.type === 'auth_success');
}

async function soloFlow(gameId, gameName) {
  const c = mkClient('SOLO/' + gameId); await c.open();
  await asGuest(c, 'SoloPlayer');
  // mirrors connectAndCreate(false) + auto-add-bot from panel
  c.send({ type: 'create_session', game_id: gameId, private: false, max_players: 4 });
  await c.waitFor(e => e.type === 'session_created' || e.type === 'session_update');
  c.send({ type: 'toggle_ready' });
  c.send({ type: 'add_ai_player' });
  await c.waitFor(e => (e.type === 'session_update' || e.type === 'roster_update')
    && e.session && e.session.players.some(p => p.is_ai));
  c.send({ type: 'accept_lobby' });
  c.send({ type: 'start_game' });
  const started = await c.waitFor(e => e.type === 'game_started');
  c.close();
  if (!started.session || started.session.players.length !== 2) throw new Error('solo: expected 2 players (host+1 bot)');
  if (!started.session.players.some(p => p.is_ai)) throw new Error('solo: no AI in session');
  console.log('PASS solo ' + gameName + ' (host+bot launched)');
}

async function friendFlow(gameId, gameName) {
  const host = mkClient('HOST/' + gameId); await host.open();
  const guest = mkClient('GUEST/' + gameId); await guest.open();
  await asGuest(host, 'Host'); await asGuest(guest, 'Guest');
  // host: connectAndCreate(true) -> private session -> share_code
  host.send({ type: 'create_session', game_id: gameId, private: true, max_players: 4 });
  const sc = await host.waitFor(e => e.type === 'share_code' || (e.type === 'session_created' && e.session && e.session.session_code));
  const code = sc.code || (sc.session && sc.session.session_code);
  if (!code) throw new Error('friend: no code received');
  host.send({ type: 'toggle_ready' });
  // guest: ?code=XXX -> connectAndJoin -> auto-ready
  guest.send({ type: 'join_by_code', code: code });
  await guest.waitFor(e => e.type === 'session_joined' || e.type === 'session_update' || e.type === 'roster_update');
  guest.send({ type: 'toggle_ready' });
  // Track ready state across ready_update events (server doesn't always re-broadcast session_update)
  const readyByUser = {};
  await host.waitFor(e => {
    if (e.type === 'ready_update' && e.user_id) readyByUser[e.user_id] = !!e.ready;
    if (e.type === 'session_update' && e.session && Array.isArray(e.session.players)) {
      e.session.players.forEach(p => { if (p.user_id) readyByUser[p.user_id] = !!p.ready; });
    }
    const ids = Object.keys(readyByUser);
    return ids.length >= 2 && ids.every(id => readyByUser[id]);
  });
  // host launches
  host.send({ type: 'accept_lobby' });
  host.send({ type: 'start_game' });
  const startedH = await host.waitFor(e => e.type === 'game_started');
  const startedG = await guest.waitFor(e => e.type === 'game_started');
  // guest panel uses session.host_username for greeting
  if (!startedG.session.host_username) throw new Error('friend: guest has no host_username for greeting');
  host.close(); guest.close();
  console.log('PASS friend ' + gameName + ' (host+guest launched, host_username=' + startedG.session.host_username + ')');
}

(async () => {
  const games = [
    ['fasttrack', 'FastTrack'],
    ['4dtictactoe', '4D TicTacToe'],
    ['starfighter', 'Alien Space Attack'],
    ['brickbreaker3d', 'BrickBreaker 3D'],
  ];
  for (const [id, name] of games) {
    await soloFlow(id, name);
    await friendFlow(id, name);
  }
  console.log('\nAll universal-flow smoke tests passed.');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(2); });
