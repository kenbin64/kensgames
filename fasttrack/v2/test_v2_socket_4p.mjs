// COMPREHENSIVE 4-player socket test: four separate WebSocket clients, the real lobby-server relay,
// and four independent v2 engines kept in lockstep by draw/move/pass deltas over the wire. Proves
// that a move made on ANY socket updates the game state identically on ALL four in real time.
//
// It spawns the actual server (server/lobby-server.js on :8765), opens 4 real KGMultiplayer sockets
// (distinct guest identities), creates + joins one session, starts the game, then plays it out — each
// seat's owner drives its turn locally and relays the delta; every client applies what it receives.
// After play settles it asserts all four engines are byte-identical (pegs, turn pointer, deck, winner).
//
// Run: node fasttrack/v2/test_v2_socket_4p.mjs   (from the repo root or fasttrack/v2)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from './engine/rules.js';
import { createState } from './engine/state.js';
import { drawCard, legalMoves, playMove, forfeit } from './engine/turn.js';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');                       // kensgames/kensgames
const WebSocket = require(join(ROOT, 'server', 'node_modules', 'ws'));
const R = loadRules(JSON.parse(readFileSync(join(here, '..', 'fasttrack.rules.json'), 'utf8')));
const SEED = 4242;                                          // shared seed → identical engines
const N = 4;

// ── browser globals KGMultiplayer expects, in Node ──
const mkStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
global.WebSocket = WebSocket;
global.window = { __KG_WS_URL__: 'ws://127.0.0.1:8765/ws' };
global.location = { hostname: '127.0.0.1', protocol: 'http:', host: '127.0.0.1:8765' };
global.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }), body: { appendChild() {} } };
global.localStorage = mkStore();
global.sessionStorage = mkStore();
const KGMultiplayer = require(join(ROOT, 'js', 'multiplayer-client.js'));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms, label) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (pred()) return true; await sleep(40); }
  throw new Error('timeout: ' + label);
}
const snap = (e) => JSON.stringify({
  pegs: e.pegs.map((p) => `${p.player}.${p.n}@${p.location}${p.hasCircuited ? 'c' : ''}${p.onFastTrack ? 'f' : ''}`),
  current: e.turn.current, phase: e.turn.phase, winner: e.winner,
  draw: e.deck.drawPile.length, discard: e.deck.discardPile ? e.deck.discardPile.length : 0,
});

// ── the four clients ──
const clients = [];
let activity = Date.now();
function applyDelta(c, action, payload) {
  if (!c.engine || c.engine.winner != null) return;
  activity = Date.now();
  if (action === 'draw') drawCard(c.engine);
  else if (action === 'move') playMove(c.engine, R, payload.move);
  else if (action === 'pass') forfeit(c.engine, R);
  drive(c);                       // applying a delta may hand the turn to me
}
// Drive my own seat(s): draw, relay, then play the first legal move (or pass) and relay. Loops so a
// redraw card (same seat again) keeps driving. Only the seat's owner ever enters the body.
function drive(c) {
  while (c.engine && c.engine.winner == null) {
    const seat = c.engine.turn.current;
    if (c.seatUserIds[seat] !== c.userId) return;        // not my seat — wait for its owner's deltas
    if (c.engine.turn.phase !== 'draw') return;
    activity = Date.now();
    drawCard(c.engine); c.mp.sendAction('draw', {});
    const moves = legalMoves(c.engine, R);
    if (moves.length) { const m = moves[0]; playMove(c.engine, R, m); c.mp.sendAction('move', { move: m }); }
    else { forfeit(c.engine, R); c.mp.sendAction('pass', {}); }
  }
}

(async () => {
  // 1. start the real lobby server
  console.log('\n[1] starting lobby server on :8765 …');
  const server = spawn('node', ['lobby-server.js'], { cwd: join(ROOT, 'server'), stdio: ['ignore', 'pipe', 'pipe'] });
  let serverUp = false;
  server.stdout.on('data', (b) => { if (/WebSocket:/.test(String(b))) serverUp = true; });
  server.stderr.on('data', () => {});
  try {
    await until(() => serverUp, 10000, 'server start');
    await sleep(300);

    // 2. connect four sockets with distinct guest identities
    console.log('[2] connecting 4 sockets …');
    for (let i = 0; i < N; i++) {
      const mp = new KGMultiplayer('fasttrack');
      const c = { i, mp, userId: null, session: null, engine: null, seatUserIds: [] };
      mp.on('authenticated', (d) => { c.userId = String(d.userId); });
      mp.on('session_update', (s) => { c.session = s; });
      mp.on('game_action', (msg) => { if (String(msg.from) !== c.userId) applyDelta(c, msg.action, msg.payload); });
      mp.connect({ guestToken: `ft-sock-p${i}`, username: `P${i}` });
      clients.push(c);
    }
    await until(() => clients.every((c) => c.userId), 8000, 'all authenticated');
    ok(true, `4 sockets authenticated (ids: ${clients.map((c) => c.userId.slice(0, 6)).join(', ')})`);

    // 3. host creates a session, others join by code
    console.log('[3] creating + joining one session …');
    clients[0].mp.createGame({ max_players: N, private: false });
    await until(() => clients[0].session && (clients[0].session.code || clients[0].session.session_code), 8000, 'session created');
    const code = clients[0].session.code || clients[0].session.session_code;
    for (let i = 1; i < N; i++) clients[i].mp.joinByCode(code);
    await until(() => clients.every((c) => c.session && (c.session.players || []).length >= N), 10000, 'all joined');
    ok(true, `all 4 in session ${code} (roster size ${clients[0].session.players.length})`);

    // 4. host starts the game
    console.log('[4] starting the game …');
    clients[0].mp.startGame();
    await until(() => clients.every((c) => c.session && c.session.status === 'playing'), 8000, 'game started');
    ok(true, 'session status → playing on all four clients');

    // 5. every client builds the SAME engine from the shared roster + seed
    const roster = clients[0].session.players.slice().sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
    const seatUserIds = roster.map((p) => String(p.user_id));
    for (const c of clients) {
      c.seatUserIds = seatUserIds;
      c.engine = createState({ rules: R, players: roster.map((p) => ({ name: p.username || p.user_id })), seed: SEED, firstPlayer: 0 });
    }
    ok(clients.every((c) => snap(c.engine) === snap(clients[0].engine)), 'all four engines start byte-identical');

    // 6. kick off — only seat 0's owner drives first — then play until a winner or the cap
    console.log('[5] playing … (each socket drives its own seat, relays deltas)');
    for (const c of clients) drive(c);
    const started = Date.now();
    await until(() => clients[0].engine.winner != null || (Date.now() - activity > 1500 && Date.now() - started > 1000), 60000, 'play settles');
    await sleep(800);   // let the last relayed deltas land everywhere

    // 7. verify real-time lockstep: all four engines identical
    console.log('[6] verifying all four sockets hold identical state …');
    const snaps = clients.map((c) => snap(c.engine));
    const allMatch = snaps.every((s) => s === snaps[0]);
    ok(allMatch, `all 4 engines byte-identical after play (current seat ${clients[0].engine.turn.current}, winner ${clients[0].engine.winner})`);
    if (!allMatch) clients.forEach((c, i) => console.log(`   client ${i}: ${snaps[i].slice(0, 160)}`));
    const anyProgress = clients[0].engine.pegs.some((p) => !p.location.startsWith('hold-'));
    ok(anyProgress, 'pegs actually moved on the board (real gameplay relayed across sockets)');
    const winner = clients[0].engine.winner;
    ok(winner == null || clients.every((c) => c.engine.winner === winner), `if there is a winner, all sockets agree on it (winner=${winner})`);
  } catch (e) {
    fail++; console.log('  FAIL ' + (e && e.message || e));
  } finally {
    for (const c of clients) { try { c.mp.disconnect(); } catch (_) {} }
    try { server.kill(); } catch (_) {}
  }

  console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
  process.exit(fail ? 1 : 0);
})();
