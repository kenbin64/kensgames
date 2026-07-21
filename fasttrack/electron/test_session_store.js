'use strict';
/**
 * Unit test for session-store.js — desktop token persistence.
 * Uses a fake, reversible safeStorage and a temp file; no Electron needed.
 * Run: node fasttrack/electron/test_session_store.js
 */
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createSessionStore } = require('./session-store.js');

function fakeSafeStorage(available) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (buf) => buf.toString('utf8').replace(/^ENC:/, ''),
  };
}

let passed = 0, failed = 0, seq = 0;
function check(name, fn) {
  const file = path.join(os.tmpdir(), `kg-sess-${process.pid}-${seq++}.json`);
  try { fn(file); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
  finally { try { fs.unlinkSync(file); } catch (_) { /* ignore */ } }
}

check('save then load round-trips token + user, encrypted on disk', (file) => {
  const store = createSessionStore({ safeStorage: fakeSafeStorage(true), filePath: file });
  store.save('tok-123', { username: 'Nova', id: 42 });
  const got = store.load();
  assert(got, 'expected a session');
  assert.strictEqual(got.token, 'tok-123');
  assert.strictEqual(got.user.username, 'Nova');
  assert(!fs.readFileSync(file, 'utf8').includes('tok-123'), 'token must not be plaintext on disk');
});

check('plaintext fallback when encryption is unavailable', (file) => {
  const store = createSessionStore({ safeStorage: fakeSafeStorage(false), filePath: file });
  store.save('tok-xyz', { username: 'Ghost' });
  assert.strictEqual(store.load().token, 'tok-xyz');
  assert(fs.readFileSync(file, 'utf8').includes('tok-xyz'), 'fallback stores token as-is');
});

check('load returns null when no file exists', (file) => {
  const store = createSessionStore({ safeStorage: fakeSafeStorage(true), filePath: file });
  assert.strictEqual(store.load(), null);
});

check('clear removes the session', (file) => {
  const store = createSessionStore({ safeStorage: fakeSafeStorage(true), filePath: file });
  store.save('tok', { username: 'X' });
  store.clear();
  assert.strictEqual(store.load(), null);
});

check('encrypted token is unreadable once encryption becomes unavailable', (file) => {
  createSessionStore({ safeStorage: fakeSafeStorage(true), filePath: file }).save('secret', { username: 'X' });
  const moved = createSessionStore({ safeStorage: fakeSafeStorage(false), filePath: file });
  assert.strictEqual(moved.load(), null);
});

check('corrupt file loads as null without throwing', (file) => {
  fs.writeFileSync(file, 'not json{');
  const store = createSessionStore({ safeStorage: fakeSafeStorage(true), filePath: file });
  assert.strictEqual(store.load(), null);
});

check('save rejects a non-string token', (file) => {
  const store = createSessionStore({ safeStorage: fakeSafeStorage(true), filePath: file });
  assert.throws(() => store.save(null), /token/);
});

console.log(`\nsession-store: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
