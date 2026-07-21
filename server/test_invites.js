'use strict';
/**
 * Unit test for server/invites.js — the private-game invite rules.
 * Run: node server/test_invites.js
 */
const assert = require('assert');
const { canInvite } = require('./invites.js');

function S(over) {
  return Object.assign(
    { host_id: 'user_h', status: 'waiting', max_players: 6, players: [{ user_id: 'user_h', is_host: true }] },
    over,
  );
}

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

check('host can invite an online player not already in the game', () => {
  assert.strictEqual(canInvite({ session: S(), hostUserId: 'user_h', targetUserId: 'user_x', targetOnline: true }).ok, true);
});

check('non-host cannot invite', () => {
  assert.strictEqual(canInvite({ session: S(), hostUserId: 'user_other', targetUserId: 'user_x', targetOnline: true }).ok, false);
});

check('cannot invite once the game has started', () => {
  assert.strictEqual(canInvite({ session: S({ status: 'playing' }), hostUserId: 'user_h', targetUserId: 'user_x', targetOnline: true }).ok, false);
});

check('already-in target is flagged already_in', () => {
  const v = canInvite({
    session: S({ players: [{ user_id: 'user_h' }, { user_id: 'user_x' }] }),
    hostUserId: 'user_h', targetUserId: 'user_x', targetOnline: true,
  });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.already_in, true);
});

check('cannot invite when full (6 players, private cap)', () => {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((u) => ({ user_id: u }));
  assert.strictEqual(canInvite({ session: S({ host_id: 'a', players }), hostUserId: 'a', targetUserId: 'g', targetOnline: true }).ok, false);
});

check('offline target is rejected', () => {
  assert.strictEqual(canInvite({ session: S(), hostUserId: 'user_h', targetUserId: 'user_x', targetOnline: false }).ok, false);
});

check('missing session or target is rejected', () => {
  assert.strictEqual(canInvite({ session: null, hostUserId: 'user_h', targetUserId: 'user_x', targetOnline: true }).ok, false);
  assert.strictEqual(canInvite({ session: S(), hostUserId: 'user_h', targetUserId: null, targetOnline: true }).ok, false);
});

console.log(`\ninvites: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
