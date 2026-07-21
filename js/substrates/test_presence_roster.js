'use strict';
/**
 * Unit test for presence_roster.js renderPresenceHTML (pure render).
 * Run: node js/substrates/test_presence_roster.js
 */
const assert = require('assert');
const { renderPresenceHTML } = require('./presence_roster.js');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('FAIL   ' + name + '  ->  ' + e.message); }
}

check('renders a row per player with the online (non-guest) count', () => {
  const html = renderPresenceHTML([
    { user_id: 'user_1', username: 'Ken', avatar_id: '\u{1F451}', is_superuser: true },
    { user_id: 'user_2', username: 'Nova', avatar_id: 'person_smile' },
  ], 'user_2');
  assert(html.includes('Players online'));
  assert(html.includes('>2<'));              // count badge
  assert(html.includes('Ken'));
  assert(html.includes('Nova'));
  assert(html.includes('pr-super'));         // superuser crown badge
  assert(html.includes('pr-self'));          // self row highlighted
  assert(html.includes('pr-you'));           // "you" badge on self
});

check('marks in-game and guest players', () => {
  const html = renderPresenceHTML([
    { user_id: 'u1', username: 'Busy', in_session: true },
    { user_id: 'g1', username: 'Visitor', is_guest: true },
  ], 'someone-else');
  assert(html.includes('in game'));
  assert(html.includes('pr-guest'));
  assert(html.includes('>1<'));              // only 1 non-guest online
});

check('escapes hostile usernames (no HTML injection)', () => {
  const html = renderPresenceHTML([
    { user_id: 'x', username: '<img src=x onerror=alert(1)>' },
  ], 'x');
  assert(!html.includes('<img'), 'raw tag must be escaped');
  assert(html.includes('&lt;img'));
});

check('empty roster shows an empty state, count 0', () => {
  const html = renderPresenceHTML([], null);
  assert(html.includes('No one else is here yet.'));
  assert(html.includes('>0<'));
});

check('non-array input does not throw', () => {
  assert.doesNotThrow(() => renderPresenceHTML(null, null));
  assert.doesNotThrow(() => renderPresenceHTML(undefined, null));
});

console.log(`\npresence-roster: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
