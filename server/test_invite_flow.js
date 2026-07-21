'use strict';
/**
 * END-TO-END PLUMBING TEST for the private-invite flow.
 *
 * Spawns the REAL relay as a child process on a test port and drives TWO live
 * socket clients through the whole chain the desktop lobby uses:
 *   login -> presence -> create private -> invite -> (rule: non-host cannot
 *   invite) -> accept/join -> ready -> host start -> both notified of play.
 * Asserts on the actual socket messages the clients receive. Guests are used
 * (no DB / JWT needed): the invite/join/ready/start plumbing is identity-agnostic.
 *
 * Run: node server/test_invite_flow.js
 */
const path = require('path');
const os = require('os');
const assert = require('assert');
const { spawn } = require('child_process');

const PORT = process.env.LOBBY_PORT || '8799';
const URL = `ws://127.0.0.1:${PORT}/ws`;

const child = spawn(process.execPath, [path.join(__dirname, 'lobby-server.js')], {
  env: {
    ...process.env,
    LOBBY_PORT: PORT,
    SEED_LOG: path.join(os.tmpdir(), `kg-test-seeds-${process.pid}.jsonl`),
    GM_LOG: path.join(os.tmpdir(), `kg-test-gm-${process.pid}.log`),
    KG_REQUIRE_LOGIN: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let childOut = '';
child.stdout.on('data', (d) => { childOut += d; });
child.stderr.on('data', (d) => { childOut += d; });

function cleanup() { try { child.kill(); } catch (_) {} }
process.on('exit', cleanup);
const hardTimeout = setTimeout(() => { console.error('OVERALL TIMEOUT'); cleanup(); process.exit(1); }, 20000);
hardTimeout.unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitListening() {
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((res) => {
      let s;
      try { s = new WebSocket(URL); } catch (_) { return res(false); }
      const done = (v) => { try { s.close(); } catch (_) {} res(v); };
      s.onopen = () => done(true);
      s.onerror = () => done(false);
      setTimeout(() => done(false), 200);
    });
    if (ok) return;
    await sleep(150);
  }
  throw new Error('relay did not start listening. Child output:\n' + childOut);
}

function client(name) {
  const ws = new WebSocket(URL);
  const inbox = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  };
  return {
    name, ws, inbox,
    send: (o) => ws.send(JSON.stringify(o)),
    open: () => new Promise((res, rej) => {
      if (ws.readyState === 1) return res();
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error(`socket ${name} failed to open`));
    }),
    waitFor: (pred, label, timeout = 4000) => new Promise((res, rej) => {
      const hit = inbox.find(pred);
      if (hit) return res(hit);
      const w = { pred, resolve: res };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) { waiters.splice(i, 1); rej(new Error(`timeout waiting for ${label || 'message'} [${name}]`)); }
      }, timeout);
    }),
    close: () => { try { ws.close(); } catch (_) {} },
  };
}

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

(async () => {
  await waitListening();
  const A = client('A');
  const B = client('B');
  await A.open();
  await B.open();

  let aId, bId, sid;

  await step('both players authenticate on the relay', async () => {
    A.send({ type: 'guest_login', token: 'tok-alice', name: 'Alice' });
    const a = await A.waitFor((m) => m.type === 'auth_success', 'A auth_success');
    B.send({ type: 'guest_login', token: 'tok-bob', name: 'Bob' });
    const b = await B.waitFor((m) => m.type === 'auth_success', 'B auth_success');
    aId = a.user_id; bId = b.user_id;
    assert(aId && bId && aId !== bId, 'distinct user ids');
  });

  await step('presence roster broadcasts both players', async () => {
    const p = await A.waitFor((m) => m.type === 'presence' && (m.users || []).length >= 2, 'A presence>=2');
    assert(p.users.some((u) => u.user_id === bId), 'roster includes Bob');
  });

  await step('host creates a private game (host seated, waiting)', async () => {
    A.send({ type: 'create_session', game_id: 'fasttrack', private: true, max_players: 6 });
    const m = await A.waitFor((x) => x.type === 'session_created', 'session_created');
    sid = m.session.session_id;
    assert(sid, 'has a session id');
    assert.strictEqual(m.session.host_id, aId);
    assert.strictEqual(m.session.players.length, 1);
  });

  await step('host invites Bob -> Bob gets game_invite, host gets invite_sent', async () => {
    A.send({ type: 'invite_player', target_user_id: bId, session_id: sid });
    const inv = await B.waitFor((m) => m.type === 'game_invite', 'B game_invite');
    assert.strictEqual(inv.session_id, sid);
    assert.strictEqual(inv.from.username, 'Alice');
    await A.waitFor((m) => m.type === 'invite_sent', 'A invite_sent');
  });

  await step('rule enforced: a non-host cannot invite', async () => {
    B.send({ type: 'invite_player', target_user_id: aId, session_id: sid });
    const err = await B.waitFor((m) => m.type === 'error', 'B invite rejected');
    assert(/host/i.test(err.message || ''), 'error should mention host-only');
  });

  await step('Bob accepts (joins) -> session now has 2 players', async () => {
    B.send({ type: 'join_session', session_id: sid });
    const j = await B.waitFor((m) => m.type === 'session_joined', 'B session_joined');
    assert.strictEqual(j.session.players.length, 2);
    assert(j.session.players.some((p) => p.user_id === bId), 'Bob is in the roster');
  });

  await step('Bob readies up -> ready_update reflects it', async () => {
    B.send({ type: 'toggle_ready' });
    const ru = await B.waitFor((m) => m.type === 'ready_update' && m.user_id === bId, 'B ready_update');
    assert.strictEqual(ru.ready, true);
  });

  await step('host starts -> BOTH clients are notified of play', async () => {
    A.inbox.length = 0; B.inbox.length = 0; // only count post-start broadcasts
    A.send({ type: 'start_game' });
    const isPlay = (m) => m.type === 'game_started'
      || (m.type === 'game_object' && m.game_object && String(m.game_object.phase) === 'playing');
    await A.waitFor(isPlay, 'A play signal');
    await B.waitFor(isPlay, 'B play signal');
    assert(!A.inbox.some((m) => m.type === 'error'), 'host got no error on start');
  });

  A.close();
  B.close();
  cleanup();
  console.log(`\ninvite-flow: ${passed} passed, ${failed} failed`);
  setTimeout(() => process.exit(failed ? 1 : 0), 150);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); cleanup(); process.exit(1); });
