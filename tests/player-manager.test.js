'use strict';
/**
 * Tests for server/player-manager.js
 *
 * Uses Node.js built-in test runner (node:test).
 * Timers are injected via constructor opts so tests run synchronously / with
 * minimal real waits.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PlayerManager = require(path.join(__dirname, '..', 'server', 'player-manager.js'));

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Build a fake WebSocket object */
function fakeWs(userId) {
  return { _userId: userId, _sent: [], send(d) { this._sent.push(JSON.parse(d)); } };
}

/** Build a minimal session object like lobby-server creates */
function fakeSession(overrides) {
  const base = {
    session_id: 'sess-001',
    session_code: 'ABC123',
    game_id: 'fasttrack',
    host_id: 'u1',
    max_players: 4,
    status: 'playing',
    players: [
      { user_id: 'u1', username: 'Alice', is_ai: false, is_host: true, slot: 0, ready: true },
      { user_id: 'u2', username: 'Bob', is_ai: false, is_host: false, slot: 1, ready: true },
      { user_id: 'ai1', username: 'Bot 1', is_ai: true, is_host: false, slot: 2, ready: true },
    ],
    created_at: Date.now(),
  };
  return Object.assign({}, base, overrides || {});
}

/**
 * Build a connected PM instance.
 * Returns { pm, connections, liveSessions, broadcasts, sends }
 * where `broadcasts` accumulates everything sent via broadcastSession and
 * `sends` accumulates everything sent via sendFn.
 */
function buildPM(session, wsMap, opts) {
  const connections = new Map();
  const liveSessions = new Map();
  const broadcasts = [];
  const sends = [];

  liveSessions.set(session.session_id, session);

  // Register each provided ws as a connection in the session
  for (const [userId, ws] of Object.entries(wsMap || {})) {
    connections.set(ws, { user_id: userId, session_x_id: session.session_id });
  }

  const sendFn = (ws, data) => { sends.push({ ws, data }); if (ws._sent) ws._sent.push(data); };
  const broadcastFn = (sess, data) => { broadcasts.push({ session: sess, data }); };

  const pm = new PlayerManager(connections, liveSessions, sendFn, broadcastFn, opts);
  return { pm, connections, liveSessions, broadcasts, sends };
}

// ── Construction ─────────────────────────────────────────────────────────────

test('PlayerManager: instantiates without error', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  assert.ok(pm instanceof PlayerManager);
});

test('PlayerManager: isGameDisabled returns false for unknown game', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  assert.equal(pm.isGameDisabled('fasttrack'), false);
});

test('PlayerManager: disabledGamesInfo is empty on init', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  assert.deepEqual(pm.disabledGamesInfo(), {});
});

// ── startSession: happy path ──────────────────────────────────────────────────

test('PlayerManager: startSession broadcasts pm_game_ready when all players connected', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1');
  const ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 10,
    connectMaxRetries: 3,
    ackTimeout: 200,
    healTimeout: 200,
  });

  pm.startSession('sess-001');

  // After a short tick the verify loop runs synchronously (all connected)
  setImmediate(() => {
    const ready = broadcasts.find(b => b.data.type === 'pm_game_ready');
    assert.ok(ready, 'pm_game_ready should have been broadcast');
    assert.equal(ready.data.human_count, 2);
    assert.equal(ready.data.bot_count, 1);
    const ms = pm.getSessionInfo('sess-001');
    assert.equal(ms.status, 'active');
    done();
  });
});

// ── startSession: retry then cancel ──────────────────────────────────────────

test('PlayerManager: startSession cancels after maxRetries if players missing', (t, done) => {
  // No ws connections registered → all humans "missing"
  const session = fakeSession();
  const { pm, broadcasts } = buildPM(session, {}, {
    connectRetryDelay: 10,
    connectMaxRetries: 3,
    ackTimeout: 200,
    healTimeout: 200,
  });

  pm.startSession('sess-001');

  // Wait for 3 × 10 ms retries + margin
  setTimeout(() => {
    const cancelled = broadcasts.find(b => b.data.type === 'pm_cancelled');
    assert.ok(cancelled, 'pm_cancelled should have been broadcast');
    assert.match(cancelled.data.message, /cancelled/i);
    done();
  }, 80);
});

// ── startSession: disabled game ───────────────────────────────────────────────

test('PlayerManager: startSession broadcasts pm_cancelled if game is disabled', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 10,
  });

  pm.enableGame('fasttrack'); // ensure clean state
  pm._disabledGames.set('fasttrack', { disabled: true, reason: 'manual test', disabledAt: Date.now() });
  pm.startSession('sess-001');

  setImmediate(() => {
    const cancelled = broadcasts.find(b => b.data.type === 'pm_cancelled');
    assert.ok(cancelled, 'should cancel when game is disabled');
    assert.match(cancelled.data.message, /disabled/i);
    done();
  });
});

// ── relayTurn ────────────────────────────────────────────────────────────────

test('PlayerManager: relayTurn returns 0 for unmanaged session', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  assert.equal(pm.relayTurn('no-session', 'u1', { type: 'game_action' }), 0);
});

test('PlayerManager: relayTurn returns seq > 0 and broadcasts envelope', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 500,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const ms = pm.getSessionInfo('sess-001');
    assert.equal(ms.status, 'active');

    const seq = pm.relayTurn('sess-001', 'u1', { type: 'game_action', action: 'move', peg: 3 });
    assert.ok(seq > 0, 'seq should be positive');

    const turn = broadcasts.find(b => b.data._pm_seq === seq);
    assert.ok(turn, 'turn envelope should have been broadcast');
    assert.equal(turn.data._pm_seq, seq);
    assert.equal(turn.data.from, 'u1');
    assert.equal(turn.data.action, 'move');
    done();
  });
});

// ── acknowledgeTurn ───────────────────────────────────────────────────────────

test('PlayerManager: acknowledgeTurn clears pending ack when all humans ack', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 2000,  // long — we don't want it to fire
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const seq = pm.relayTurn('sess-001', 'u1', { type: 'game_action' });
    const msBeforeAck = pm.getSessionInfo('sess-001');
    assert.equal(msBeforeAck.pendingAcks, 1);

    pm.acknowledgeTurn('sess-001', seq, 'u1');
    pm.acknowledgeTurn('sess-001', seq, 'u2');

    const msAfterAck = pm.getSessionInfo('sess-001');
    assert.equal(msAfterAck.pendingAcks, 0, 'pending acks should be cleared after all ack');
    done();
  });
});

test('PlayerManager: duplicate ack for same seq is ignored', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 2000,
  });

  pm.startSession('sess-001');
  setImmediate(() => {
    const seq = pm.relayTurn('sess-001', 'u1', { type: 'game_action' });
    pm.acknowledgeTurn('sess-001', seq, 'u1');
    pm.acknowledgeTurn('sess-001', seq, 'u1'); // duplicate — should not throw
    const ms = pm.getSessionInfo('sess-001');
    assert.equal(ms.pendingAcks, 1, 'still waiting for u2');
    done();
  });
});

// ── ack timeout → heal → cancel ──────────────────────────────────────────────

test('PlayerManager: ack timeout triggers pm_resync broadcast', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 30,   // fast for test
    healTimeout: 500,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    pm.relayTurn('sess-001', 'u1', { type: 'game_action' });
    // Only u1 acks — u2 does not
    pm.acknowledgeTurn('sess-001', 1, 'u1');

    setTimeout(() => {
      const resync = broadcasts.find(b => b.data.type === 'pm_resync');
      assert.ok(resync, 'pm_resync should fire after ack timeout');
      done();
    }, 80);
  });
});

test('PlayerManager: heal timeout replaces missing player with bot', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 30,   // u2 must ack within 30 ms
    healTimeout: 60,   // heal window: 60 ms
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    pm.relayTurn('sess-001', 'u1', { type: 'game_action' });
    pm.acknowledgeTurn('sess-001', 1, 'u1');
    // u2 does NOT ack → ack_timeout fires at ~30 ms → heal starts
    // Simulate u2 dropping connection during the heal window (at ~50 ms)
    setTimeout(() => {
      pm.onPlayerDisconnect('u2', 'sess-001');
    }, 50);
    // Heal timeout fires at ~30+60=90 ms → u2 still missing → replaced with bot
    setTimeout(() => {
      const replaced = broadcasts.find(b => b.data.type === 'player_replaced_with_bot');
      assert.ok(replaced, 'missing human should be replaced with a bot after heal timeout');
      assert.equal(replaced.data.replaced_user_id, 'u2');
      assert.match(replaced.data.bot.username, /_bot$/);
      done();
    }, 200);
  });
});

test('PlayerManager: game_uuid mismatch replaces human with bot', (t, done) => {
  const session = fakeSession({ game_uuid: 'g-123' });
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 2000,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const seq = pm.relayTurn('sess-001', 'u1', { type: 'game_action' });
    pm.acknowledgeTurn('sess-001', seq, 'u1', 'g-123');
    pm.acknowledgeTurn('sess-001', seq, 'u2', 'WRONG-UUID');

    const replaced = broadcasts.find(b => b.data.type === 'player_replaced_with_bot');
    assert.ok(replaced, 'uuid mismatch should replace user with bot');
    assert.equal(replaced.data.replaced_user_id, 'u2');
    done();
  });
});

// ── updateGoodState ───────────────────────────────────────────────────────────

test('PlayerManager: updateGoodState is a no-op for unmanaged session', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  assert.doesNotThrow(() => pm.updateGoodState('no-session', { board: [] }));
});

// ── onPlayerDisconnect ────────────────────────────────────────────────────────

test('PlayerManager: onPlayerDisconnect removes player from pending required set', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 2000,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const seq = pm.relayTurn('sess-001', 'u1', { type: 'game_action' });
    assert.equal(pm.getSessionInfo('sess-001').pendingAcks, 1);

    // u2 disconnects mid-turn — should no longer block the ack
    pm.onPlayerDisconnect('u2', 'sess-001');
    // u1 acks
    pm.acknowledgeTurn('sess-001', seq, 'u1');

    assert.equal(pm.getSessionInfo('sess-001').pendingAcks, 0, 'ack cleared after disconnect + ack');
    done();
  });
});

// ── inventory ─────────────────────────────────────────────────────────────────

test('PlayerManager: inventory fails if fewer than 2 players', (t, done) => {
  const session = fakeSession({
    players: [
      { user_id: 'u1', username: 'Alice', is_ai: false, is_host: true, slot: 0, ready: true },
    ],
  });
  const ws1 = fakeWs('u1');
  const { pm, broadcasts } = buildPM(session, { u1: ws1 }, {
    connectRetryDelay: 5,
    ackTimeout: 200,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const cancelled = broadcasts.find(b => b.data.type === 'pm_cancelled');
    assert.ok(cancelled, 'should cancel with only 1 player');
    done();
  });
});

test('PlayerManager: inventory trims excess players above max_players', (t, done) => {
  const session = fakeSession({
    max_players: 2,
    players: [
      { user_id: 'u1', username: 'Alice', is_ai: false, is_host: true, slot: 0, ready: true },
      { user_id: 'u2', username: 'Bob', is_ai: false, is_host: false, slot: 1, ready: true },
      { user_id: 'ai1', username: 'Bot', is_ai: true, is_host: false, slot: 2, ready: true },
    ],
  });
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, broadcasts } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 200,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const ready = broadcasts.find(b => b.data.type === 'pm_game_ready');
    assert.ok(ready, 'pm_game_ready should fire after trim');
    // Bot should have been trimmed first
    assert.equal(ready.data.bot_count, 0, 'bot should be trimmed to reach max_players=2');
    assert.equal(ready.data.human_count, 2);
    done();
  });
});

// ── enable / disable game ─────────────────────────────────────────────────────

test('PlayerManager: enableGame clears disabled status', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  pm._disabledGames.set('fasttrack', { disabled: true, reason: 'test', disabledAt: Date.now() });
  assert.equal(pm.isGameDisabled('fasttrack'), true);
  pm.enableGame('fasttrack');
  assert.equal(pm.isGameDisabled('fasttrack'), false);
});

test('PlayerManager: auto-disable triggers after autoDisableAfter consecutive cancels', (t, done) => {
  const session = fakeSession();
  // No connections → immediate cancel on each startSession
  const { pm } = buildPM(session, {}, {
    connectRetryDelay: 5,
    connectMaxRetries: 1,   // cancel on first try to make test fast
    ackTimeout: 200,
    healTimeout: 200,
    autoDisableAfter: 2,
    recentWindowMs: 60_000,
  });

  // startSession three times on the same game — each will cancel immediately
  ['sess-001', 'sess-002', 'sess-003'].forEach(id => {
    const s = Object.assign({}, session, { session_id: id });
    pm._liveSessions.set(id, s);
    pm.startSession(id);
  });

  // pm_game_disabled is sent via sendFn (per-connection) not broadcastFn.
  // With no connections in this test we just assert the disabled flag itself.
  setTimeout(() => {
    assert.equal(pm.isGameDisabled('fasttrack'), true,
      'fasttrack should be auto-disabled after consecutive failures');
    const info = pm.disabledGamesInfo();
    assert.ok(info.fasttrack, 'disabledGamesInfo should contain fasttrack');
    done();
  }, 60);
});

// ── registerConnection ────────────────────────────────────────────────────────

test('PlayerManager: registerConnection updates connectionMap for active session', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm, connections } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 200,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    // Simulate u2 reconnecting with a new ws
    const ws2new = fakeWs('u2');
    connections.set(ws2new, { user_id: 'u2', session_x_id: 'sess-001' });
    pm.registerConnection('u2', ws2new);
    // No assertions on the ws itself — just verify it doesn't throw
    assert.equal(pm.getSessionInfo('sess-001').status, 'active');
    done();
  });
});

// ── allSessionsInfo / getSessionInfo ─────────────────────────────────────────

test('PlayerManager: getSessionInfo returns null for unknown session', () => {
  const pm = new PlayerManager(new Map(), new Map(), () => { }, () => { });
  assert.equal(pm.getSessionInfo('no-session'), null);
});

test('PlayerManager: allSessionsInfo returns an object keyed by sessionId', (t, done) => {
  const session = fakeSession();
  const ws1 = fakeWs('u1'), ws2 = fakeWs('u2');
  const { pm } = buildPM(session, { u1: ws1, u2: ws2 }, {
    connectRetryDelay: 5,
    ackTimeout: 200,
  });

  pm.startSession('sess-001');

  setImmediate(() => {
    const info = pm.allSessionsInfo();
    assert.ok(info['sess-001'], 'should have entry for sess-001');
    assert.equal(info['sess-001'].gameId, 'fasttrack');
    done();
  });
});
