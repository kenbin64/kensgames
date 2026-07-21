'use strict';
/**
 * Unit test for inject.js — the desktop page-injection snippet builder.
 * Run: node fasttrack/electron/test_inject.js
 */
const assert = require('assert');
const { buildInjectSnippet } = require('./inject.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

check('sets desktop globals from config and is a <script> block', () => {
  const s = buildInjectSnippet({ config: { __KG_WS_URL__: 'wss://x/ws', __KENSGAMES_PLATFORM__: 'desktop' } });
  assert(s.startsWith('<script>') && s.endsWith('</script>'));
  assert(s.includes('window.__KG_WS_URL__="wss://x/ws";'));
  assert(s.includes('window.__KENSGAMES_PLATFORM__="desktop";'));
});

check('seeds the localStorage identity when a token is present', () => {
  const s = buildInjectSnippet({
    token: 'tok-9',
    user: { id: 42, username: 'Nova', display_name: 'Nova', avatar: { emoji: '\u{1F98A}', name: 'Fox' } },
  });
  assert(s.includes('window.__KG_AUTH_TOKEN__="tok-9";'));
  assert(s.includes('localStorage.setItem'));
  assert(s.includes('"user_token":"tok-9"'));
  assert(s.includes('"username":"Nova"'));
  // kg_avatar carries the web-format JSON {emoji,name}.
  assert(s.includes('"kg_avatar"'));
  assert(s.includes('emoji'));
  assert(s.includes('\u{1F98A}'));
});

check('clears identity + guest keys when logged out', () => {
  const s = buildInjectSnippet({ token: null });
  assert(s.includes('window.__KG_AUTH_TOKEN__=null;'));
  assert(s.includes('removeItem'));
  assert(s.includes('user_token'));
  assert(s.includes('kg_guest_token'));
  assert(!s.includes('setItem'), 'logged-out snippet must not set identity');
});

check('forwards legacy 3d.html to the fixed v2 engine', () => {
  const s = buildInjectSnippet({});
  assert(s.includes("endsWith('/3d.html')"));
  assert(s.includes('3d-v2.html'));
});

check('undefined config values serialize as null, not "undefined"', () => {
  const s = buildInjectSnippet({ config: { __X__: undefined } });
  assert(s.includes('window.__X__=null;'));
});

console.log(`\ninject: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
