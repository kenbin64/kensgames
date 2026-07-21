'use strict';
/**
 * Unit test for server/presence.js — the online-players roster.
 * Run: node server/test_presence.js
 */
const assert = require('assert');
const { buildPresenceList, presenceSignature } = require('./presence.js');

function conns(arr) {
  const m = new Map();
  arr.forEach((c, i) => m.set(c.peer || ('p' + i), {
    user_id: c.user_id, user: c.user, session_x_id: c.session_x_id || null,
  }));
  return m;
}

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

check('lists connected players with identity fields', () => {
  const list = buildPresenceList(conns([
    { user_id: 'user_42', user: { username: 'Nova', avatar_id: '\u{1F98A}', is_guest: false, is_superuser: false } },
    { user_id: 'user_1', user: { username: 'Ken', avatar_id: '\u{1F451}', is_guest: false, is_superuser: true } },
  ]));
  assert.strictEqual(list.length, 2);
  const ken = list.find((e) => e.user_id === 'user_1');
  assert.strictEqual(ken.username, 'Ken');
  assert.strictEqual(ken.is_superuser, true);
  assert.strictEqual(ken.in_session, false);
});

check('dedupes multiple sockets of one user; in_session if any socket is', () => {
  const list = buildPresenceList(conns([
    { peer: 'a', user_id: 'user_42', user: { username: 'Nova', is_guest: false }, session_x_id: null },
    { peer: 'b', user_id: 'user_42', user: { username: 'Nova', is_guest: false }, session_x_id: 'sess-1' },
  ]));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].in_session, true);
});

check('skips connections with no identity', () => {
  const m = new Map();
  m.set('x', { user_id: null, user: null, session_x_id: null });
  m.set('y', { user_id: 'user_5', user: { username: 'A', is_guest: false } });
  assert.strictEqual(buildPresenceList(m).length, 1);
});

check('real accounts sort before guests, then alphabetically', () => {
  const list = buildPresenceList(conns([
    { user_id: 'g1', user: { username: 'zed', is_guest: true } },
    { user_id: 'user_9', user: { username: 'Bob', is_guest: false } },
    { user_id: 'user_8', user: { username: 'amy', is_guest: false } },
  ]));
  assert.strictEqual(list[0].username, 'amy');
  assert.strictEqual(list[1].username, 'Bob');
  assert.strictEqual(list[2].username, 'zed');
});

check('signature changes when session state changes', () => {
  const a = buildPresenceList(conns([{ user_id: 'u1', user: { username: 'A', is_guest: false } }]));
  const b = buildPresenceList(conns([{ user_id: 'u1', user: { username: 'A', is_guest: false }, session_x_id: 's' }]));
  assert.notStrictEqual(presenceSignature(a), presenceSignature(b));
});

check('empty connections -> empty list + empty signature', () => {
  assert.strictEqual(buildPresenceList(new Map()).length, 0);
  assert.strictEqual(presenceSignature([]), '');
});

console.log(`\npresence: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
