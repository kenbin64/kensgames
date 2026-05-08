'use strict';

// Regression test for the FastTrack invite-link identity collision.
// Before the fix, fasttrack/join.html sent every guest the literal token
// 'guest-', so the lobby server's stableGuestId() hashed them all to one
// shared user_id and the second invitee was shown the first invitee's seat.
// The fix: each browser persists a unique 'guest-<random>' token. This test
// verifies that distinct tokens produce distinct seats, and the regression
// path (shared token) reproduces the old collision.

const path = require('path');
const os = require('os');
const fs = require('fs');
// Use socket.io-client to match the server's socket.io transport.
const { io: ioClient } = require('socket.io-client');

const tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-lobby-test-'));
process.env.SEED_LOG = path.join(tmpStateDir, 'seeds.jsonl');
process.env.LOBBY_PORT = '0';

const { httpServer, liveSessions } = require('../lobby-server');

let baseUrl = '';

beforeAll(done => {
  httpServer.listen(0, '127.0.0.1', () => {
    const { port } = httpServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

afterAll(done => {
  httpServer.close(() => done());
});

function openClient() {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      path: '/ws',
      transports: ['websocket'],
      forceNew: true,
      timeout: 5000,
    });
    const inbox = [];
    const waiters = [];

    socket.on('message', msg => {
      inbox.push(msg);
      waiters.splice(0).forEach(w => w(msg));
    });

    function waitFor(predicate, timeoutMs = 4000) {
      const found = inbox.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('timeout waiting for message')), timeoutMs);
        const handler = msg => {
          if (!predicate(msg)) { waiters.push(handler); return; }
          clearTimeout(timer);
          res(msg);
        };
        waiters.push(handler);
      });
    }

    socket.once('connect', () => resolve({ socket, inbox, waitFor }));
    socket.once('connect_error', err => reject(err));
  });
}

async function authAs(client, token, name) {
  client.socket.emit('message', {
    type: 'auth', token, username: name, guest_name: name, avatar_id: 'person_smile',
  });
  return client.waitFor(m => m.type === 'auth_success');
}

async function hostPrivateGame(client) {
  client.socket.emit('message', { type: 'create_session', game_id: 'fasttrack', private: true });
  const created = await client.waitFor(m => m.type === 'session_created');
  return created.session.session_code;
}

async function joinByCode(client, code) {
  client.socket.emit('message', { type: 'join_by_code', code });
  return client.waitFor(m => m.type === 'session_joined' || m.type === 'session_update' || m.type === 'error');
}

function closeAll(...clients) {
  for (const c of clients) { try { c.socket.disconnect(); } catch (_) { } }
}

describe('FastTrack guest invite identity isolation', () => {
  test('two invitees with distinct guest tokens get distinct seats', async () => {
    const host = await openClient();
    const inviteeB = await openClient();
    const inviteeC = await openClient();

    await authAs(host, 'guest-host-' + Date.now() + '-aaaa', 'Host');
    const code = await hostPrivateGame(host);
    expect(code).toMatch(/^[A-Z0-9]{4,}$/);

    await authAs(inviteeB, 'guest-bbbb-' + Date.now() + '-bbbb', 'Bob');
    await joinByCode(inviteeB, code);

    await authAs(inviteeC, 'guest-cccc-' + Date.now() + '-cccc', 'Charlie');
    await joinByCode(inviteeC, code);

    const session = Array.from(liveSessions.values()).find(s => s.session_code === code);
    expect(session).toBeDefined();

    const userIds = new Set(session.players.map(p => p.user_id));
    const usernames = session.players.map(p => p.username).sort();

    expect(session.players).toHaveLength(3);
    expect(userIds.size).toBe(3);
    expect(usernames).toEqual(['Bob', 'Charlie', 'Host']);

    closeAll(host, inviteeB, inviteeC);
  });

  test('regression: two invitees with the same guest token collide as one seat', async () => {
    const host = await openClient();
    const inviteeB = await openClient();
    const inviteeC = await openClient();

    await authAs(host, 'guest-host-shared-' + Date.now(), 'HostShared');
    const code = await hostPrivateGame(host);

    const sharedToken = 'guest-';
    await authAs(inviteeB, sharedToken, 'Bob2');
    await joinByCode(inviteeB, code);
    await authAs(inviteeC, sharedToken, 'Charlie2');
    await joinByCode(inviteeC, code).catch(() => { });

    const session = Array.from(liveSessions.values()).find(s => s.session_code === code);
    expect(session).toBeDefined();

    const guestPlayers = session.players.filter(p => !p.is_host);
    const guestUserIds = new Set(guestPlayers.map(p => p.user_id));
    expect(guestUserIds.size).toBe(1);
    expect(guestPlayers).toHaveLength(1);

    closeAll(host, inviteeB, inviteeC);
  });
});
