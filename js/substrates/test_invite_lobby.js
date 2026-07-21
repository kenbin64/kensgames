'use strict';
/**
 * Unit test for invite_lobby.js buildLobbyView (pure view-model).
 * Run: node js/substrates/test_invite_lobby.js
 */
const assert = require('assert');
const { buildLobbyView } = require('./invite_lobby.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

check('no session: online non-guests (not me) are invitable; not hosting', () => {
  const v = buildLobbyView({ users: [{ user_id: 'me' }, { user_id: 'a' }, { user_id: 'g', is_guest: true }], session: null, selfId: 'me' });
  assert.strictEqual(v.hosting, false);
  assert.strictEqual(v.inSession, false);
  assert.deepStrictEqual(v.invitable.map((u) => u.user_id), ['a']);
  assert.strictEqual(v.canStart, false);
});

check('hosting alone: cannot start (need 2)', () => {
  const session = { host_id: 'me', status: 'waiting', players: [{ user_id: 'me', is_host: true }] };
  const v = buildLobbyView({ users: [{ user_id: 'a' }], session, selfId: 'me' });
  assert.strictEqual(v.hosting, true);
  assert.strictEqual(v.inSession, true);
  assert.strictEqual(v.canStart, false);
  assert.deepStrictEqual(v.invitable.map((u) => u.user_id), ['a']);
});

check('hosting with a not-ready invitee: cannot start', () => {
  const session = { host_id: 'me', status: 'waiting', players: [{ user_id: 'me', is_host: true }, { user_id: 'a', ready: false }] };
  assert.strictEqual(buildLobbyView({ users: [], session, selfId: 'me' }).canStart, false);
});

check('hosting with all invitees ready (2 players): can start', () => {
  const session = { host_id: 'me', status: 'waiting', players: [{ user_id: 'me', is_host: true }, { user_id: 'a', ready: true }] };
  assert.strictEqual(buildLobbyView({ users: [], session, selfId: 'me' }).canStart, true);
});

check('cannot start once the game is playing', () => {
  const session = { host_id: 'me', status: 'playing', players: [{ user_id: 'me', is_host: true }, { user_id: 'a', ready: true }] };
  assert.strictEqual(buildLobbyView({ users: [], session, selfId: 'me' }).canStart, false);
});

check('invitee (not host) in session: not hosting, in session', () => {
  const session = { host_id: 'h', status: 'waiting', players: [{ user_id: 'h', is_host: true }, { user_id: 'me', ready: false }] };
  const v = buildLobbyView({ users: [], session, selfId: 'me' });
  assert.strictEqual(v.hosting, false);
  assert.strictEqual(v.inSession, true);
});

check('players already in the session are not invitable', () => {
  const session = { host_id: 'me', status: 'waiting', players: [{ user_id: 'me', is_host: true }, { user_id: 'a', ready: true }] };
  const v = buildLobbyView({ users: [{ user_id: 'a' }, { user_id: 'b' }], session, selfId: 'me' });
  assert.deepStrictEqual(v.invitable.map((u) => u.user_id), ['b']);
});

check('bots do not block start (only non-host humans must be ready)', () => {
  const session = { host_id: 'me', status: 'waiting', players: [{ user_id: 'me', is_host: true }, { user_id: 'bot1', is_ai: true }] };
  assert.strictEqual(buildLobbyView({ users: [], session, selfId: 'me' }).canStart, true);
});

console.log(`\ninvite-lobby: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
