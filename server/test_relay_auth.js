'use strict';
/**
 * Unit test for server/relay-auth.js — the relay-side login check.
 * Uses a REAL AuthHandler (so JWT signing/verifying is genuine) and a FAKE
 * account DB (so no SQLite fixture is needed). Proves the resolver trusts only
 * a valid token for an active account, and fails safe to null on everything else.
 *
 * Run: node server/test_relay_auth.js
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');
const AuthHandler = require('./auth-handler.js');
const { makeIdentityResolver } = require('./relay-auth.js');

const SECRET = 'test-secret-relay-auth';
const authHandler = new AuthHandler(SECRET);

// Fake account store: one active user, one banned.
const ACCOUNTS = {
  42: { id: 42, username: 'Nova',  displayName: 'Nova',  avatar: { id: 'fox', emoji: '🦊', name: 'Fox' }, status: 'active', adminLevel: 0 },
  7:  { id: 7,  username: 'Ghost', displayName: 'Ghost', avatar: null, status: 'banned', adminLevel: 0 },
  1:  { id: 1,  username: 'Ken',   displayName: 'Ken',   avatar: null, status: 'banned', adminLevel: 3 },
};
const db = { users: { findById: (id) => ACCOUNTS[id] || null } };

const resolve = makeIdentityResolver({ authHandler, db });

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

check('valid JWT resolves to the DB account (playername + avatar from the DB)', () => {
  const id = resolve(authHandler.generateToken(42));
  assert(id, 'expected an identity object');
  assert.strictEqual(id.account_id, 42);
  assert.strictEqual(id.username, 'Nova');
  assert.strictEqual(id.avatar.emoji, '🦊');
  assert.strictEqual(id.is_superuser, false);
});

check('inactive (banned) account is rejected', () => {
  assert.strictEqual(resolve(authHandler.generateToken(7)), null);
});

check('superuser is never locked out, even when marked banned', () => {
  const id = resolve(authHandler.generateToken(1));
  assert(id, 'superuser must resolve despite banned status');
  assert.strictEqual(id.username, 'Ken');
  assert.strictEqual(id.is_superuser, true);
});

check('valid signature but unknown account is rejected', () => {
  assert.strictEqual(resolve(authHandler.generateToken(999)), null);
});

check('garbage / non-JWT string is rejected', () => {
  assert.strictEqual(resolve('not-a-jwt'), null);
});

check('empty, null, undefined tokens are rejected', () => {
  assert.strictEqual(resolve(''), null);
  assert.strictEqual(resolve(null), null);
  assert.strictEqual(resolve(undefined), null);
});

check('token signed with a different secret is rejected (forgery)', () => {
  const forger = new AuthHandler('some-other-secret');
  assert.strictEqual(resolve(forger.generateToken(42)), null);
});

check('expired token is rejected', () => {
  const token = jwt.sign({ userId: 42, sessionId: 's' }, SECRET, { expiresIn: '-10s' });
  assert.strictEqual(resolve(token), null);
});

check('tampered token is rejected', () => {
  const token = authHandler.generateToken(42);
  const bad = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A');
  assert.strictEqual(resolve(bad), null);
});

check('non-string tokens do not throw (fail-safe)', () => {
  assert.strictEqual(resolve(12345), null);
  assert.strictEqual(resolve({}), null);
});

console.log(`\nrelay-auth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
