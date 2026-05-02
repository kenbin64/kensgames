/* Smoke test: simulate a host creating a fasttrack session, adding a bot, and starting. */
const WebSocket = require('ws');
const URL = 'ws://127.0.0.1:8765';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const ws = new WebSocket(URL);
  const msgs = [];
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    msgs.push(m);
    console.log('<-', m.type, JSON.stringify({
      session_id: m.session && m.session.session_id,
      session_code: m.session && m.session.session_code,
      players: m.session && (m.session.players || []).map(p => ({ id: p.user_id, name: p.username, ai: !!p.is_ai, host: !!p.is_host })),
      message: m.message,
    }));
  });
  ws.on('error', (e) => console.error('ws err', e.message));
  await new Promise((res) => ws.on('open', res));
  const send = (o) => { console.log('->', o.type); ws.send(JSON.stringify(o)); };
  send({ type: 'guest_login', token: 'smoke-test-host-' + Date.now(), username: 'SmokeHost', name: 'SmokeHost', avatar_id: 'person_smile' });
  await sleep(300);
  send({ type: 'create_session', game_id: 'fasttrack', private: false, max_players: 4, settings: {} });
  await sleep(400);
  send({ type: 'toggle_ready' });
  await sleep(200);
  send({ type: 'add_ai_player', level: 'medium' });
  await sleep(300);
  send({ type: 'add_ai_player', level: 'medium' });
  await sleep(300);
  send({ type: 'accept_lobby' });
  await sleep(300);
  send({ type: 'start_game' });
  await sleep(600);
  console.log('--- summary ---');
  const types = msgs.map(m => m.type);
  console.log('events:', types.join(','));
  ws.close();
  setTimeout(() => process.exit(0), 200);
})();
