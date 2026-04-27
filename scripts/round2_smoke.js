/**
 * Round 2 smoke — boot the manifold lobby in-process, drive a full client
 * flow over a real WebSocket, and verify the seed log saw every bloom.
 */
'use strict';

const fs = require('fs');
const path = require('path');
// `ws` is declared as a server dependency, not a root one — resolve it from
// server/node_modules so this script works without a top-level package.json.
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', 'server')] }));

// Use an isolated seed log so smokes don't pollute production state.
const SMOKE_LOG = path.join(__dirname, '..', 'state', 'round2-smoke.jsonl');
if (fs.existsSync(SMOKE_LOG)) fs.unlinkSync(SMOKE_LOG);
process.env.SEED_LOG = SMOKE_LOG;
process.env.LOBBY_PORT = '8799';

const lobby = require('../server/lobby-server.js');

// The lobby only auto-listens when run as the main module. When required
// in-process we have to start the HTTP server ourselves.
function startLobby() {
  return new Promise((resolve, reject) => {
    if (lobby.httpServer.listening) return resolve();
    lobby.httpServer.once('error', reject);
    lobby.httpServer.listen(parseInt(process.env.LOBBY_PORT, 10), '127.0.0.1', resolve);
  });
}

function step(label) { console.log('\n── ' + label + ' '.padEnd(60, '─')); }
function expect(cond, msg) { if (!cond) { console.error('  ✗', msg); process.exitCode = 1; } else console.log('  ✓', msg); }

function client() {
  const ws = new WebSocket('ws://127.0.0.1:8799');
  const inbox = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw)));
  function waitFor(type, ms) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const i = inbox.findIndex(m => m.type === type);
        if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
        if (Date.now() - t0 > (ms || 1500)) return reject(new Error('timeout waiting for ' + type));
        setTimeout(tick, 10);
      };
      tick();
    });
  }
  function send(o) { ws.send(JSON.stringify(o)); }
  function open() { return new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }); }
  function close() { return new Promise((res) => { ws.once('close', res); ws.close(); }); }
  return { ws, send, open, close, waitFor, inbox };
}

(async function main() {
  await startLobby();

  step('Boot');
  expect(lobby.log.count() >= 1, 'seed log hydrated (portal root + games)');
  const games = lobby.CATALOG.map(g => g.id);
  expect(games.includes('fasttrack'), 'fasttrack in catalog');
  console.log('  catalog:', games.join(', '));

  step('Host: connect + guest_login');
  const host = client();
  await host.open();
  await host.waitFor('connected');
  host.send({ type: 'guest_login', token: 'guest-host-001', name: 'Alice' });
  const hostAuth = await host.waitFor('auth_success');
  expect(hostAuth.user.username === 'Alice', 'host auth');

  step('Host: create_session');
  host.send({ type: 'create_session', game_id: 'fasttrack', private: false, mode: 'public' });
  const created = await host.waitFor('session_created');
  expect(!!created.session.session_code, 'session_code present');
  expect(created.session.session_code.length === 6, 'code is 6 chars');
  expect(!!created.session.manifold && created.session.manifold.x_id, 'manifold provenance attached');
  const code = created.session.session_code;
  console.log('  session code:', code, '   x_id:', created.session.manifold.x_id);

  step('Guest: join_by_code');
  const guest = client();
  await guest.open();
  await guest.waitFor('connected');
  guest.send({ type: 'guest_login', token: 'guest-bob-001', name: 'Bob' });
  await guest.waitFor('auth_success');
  guest.send({ type: 'join_by_code', code });
  const joined = await guest.waitFor('session_joined');
  expect(joined.session.players.length === 2, 'two players in session');

  step('Both: toggle_ready');
  host.send({ type: 'toggle_ready' });
  guest.send({ type: 'toggle_ready' });
  await host.waitFor('ready_update'); await host.waitFor('ready_update');
  await guest.waitFor('ready_update'); await guest.waitFor('ready_update');

  step('Host: accept_lobby');
  host.send({ type: 'accept_lobby' });
  const accepted = await host.waitFor('lobby_accepted');
  expect(accepted.session.settings.lobby_accepted === true, 'lobby_accepted flag set');

  step('Host: start_game');
  host.send({ type: 'start_game' });
  const started = await host.waitFor('game_started');
  expect(started.session.status === 'playing', 'session is playing');

  step('Relay: chat round-trip');
  guest.send({ type: 'chat', message: 'gg' });
  const chat = await host.waitFor('chat');
  expect(chat.message === 'gg', 'chat relayed to host');

  step('Game over');
  host.send({ type: 'game_over', result: { winner: 'Alice' } });
  await host.waitFor('game_over');
  await guest.waitFor('game_over');

  step('Cleanup + log inspection');
  await host.close(); await guest.close();
  const lines = fs.readFileSync(SMOKE_LOG, 'utf8').trim().split('\n').filter(Boolean);
  const kinds = {};
  for (const l of lines) { const k = (JSON.parse(l).meta || {}).kind || '?'; kinds[k] = (kinds[k] || 0) + 1; }
  console.log('  seed log entries:', lines.length, '  by kind:', JSON.stringify(kinds));
  expect((kinds.session || 0) >= 1, 'session bloom logged');
  expect((kinds.player || 0) >= 1, 'player bloom logged');
  // Lifecycle events are logged under their specific kind, not a generic bucket.
  const lifecycle = (kinds.lobby_accepted || 0) + (kinds.game_started || 0) + (kinds.game_over || 0) + (kinds.event || 0);
  expect(lifecycle >= 2, `lifecycle events logged (accept + start + over) — got ${lifecycle}`);

  // Restart-replay sanity: the codeFromSeed of a logged session matches the live code.
  const Proj = require('../server/manifold-projection.js');
  const sessionLine = lines.map(l => JSON.parse(l)).find(e => e.meta && e.meta.kind === 'session');
  expect(Proj.codeFromSeed(sessionLine.seed) === code, 'replay-derived code matches live code (deterministic identity)');

  console.log('\n══ Round 2 smoke complete ══');
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})().catch(err => { console.error(err); process.exit(1); });
