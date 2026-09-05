#!/usr/bin/env node
/**
 * ============================================================
 * HEADLESS ENGINE TEST
 *
 * Proves how much of FastTrack can already run as a SERVER AUTHORITY, and
 * measures the one part that cannot yet.
 *
 * Passing sections are the foundation for server-authoritative multiplayer:
 *   1. the core loads with no browser at all
 *   2. rules execute server-side (draw, validate, apply)
 *   3. two tables in one process are fully isolated
 *   4. the same session seed replays identically, so a table is auditable
 *   5. Card 7 keeps the classic rule server-side
 *
 * The final section REPORTS rather than asserts. It tracks the known blocker
 * (turn advancement is entangled with presentation) so the numbers stay visible.
 *
 * Run: node fasttrack/test_headless_engine.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`); }
}
function section(label) { console.log(`\n-- ${label} --`); }

console.log('HEADLESS ENGINE (server authority)');
console.log('='.repeat(62));

// ───────────────────────────────────────────────────────────
section('1. The core loads with no browser');

let g;
try {
  g = createEngine();
  ok(true, 'engine created with no DOM present');
} catch (e) {
  ok(false, 'engine created with no DOM present', String(e.message));
  console.log('\ncannot continue without an engine');
  process.exit(1);
}

ok(typeof g.initGame === 'function', 'initGame is available');
ok(typeof g.calculateValidMoves === 'function', 'calculateValidMoves is available');
ok(typeof g.executeMove === 'function', 'executeMove is available');
ok(typeof g.drawCard === 'function', 'drawCard is available');
ok(typeof g.state === 'object' && g.state !== null, 'state substrate is available');
ok(typeof document === 'undefined', 'the test process itself genuinely has no document');

// ───────────────────────────────────────────────────────────
section('2. Rules execute server-side');

g.initGame(4);
const players = g.state.players.get('list') || [];
ok(players.length === 4, 'four seats created', `got ${players.length}`);
ok(players.every(p => p.pegs && p.pegs.length === g.PEGS_PER_PLAYER),
   `every seat has ${g.PEGS_PER_PLAYER} pegs`);

// executeMove takes an INDEX into validMoves, not the move object. Passing the
// object silently hits `if (!move) return` and does nothing, which is a very
// easy way to write a harness that proves nothing.
let turnsResolved = 0, thrown = null;
const seatsSeen = new Set();
try {
  for (let i = 0; i < 40; i++) {
    if (g.state.meta.get('winner') != null) break;
    seatsSeen.add(g.state.players.get('current'));
    if (!g.state.deck.get('currentCard')) g.drawCard();
    const vm = g.state.turn.get('validMoves') || [];
    if (vm.length) g.executeMove(0); else g.endTurn();
    turnsResolved++;
  }
} catch (e) {
  thrown = String(e && e.stack || e);
}
ok(thrown === null, 'playing real turns throws nothing server-side',
   thrown ? thrown.slice(0, 200) : '');
ok(turnsResolved > 10, 'turns were played with no renderer present', `${turnsResolved} turns`);
ok(seatsSeen.size === 4, 'the turn reached all four seats server-side',
   `seats: ${[...seatsSeen].sort().join(',')}`);

// ───────────────────────────────────────────────────────────
section('3. Two tables in one process are isolated');

const a = createEngine();
const b = createEngine();
a.initGame(2);
b.initGame(2);

// A plain `require` would share module state here, and this is the assertion
// that would catch it. Isolation is what makes a multi-table server possible.
const aTrack = a.CLOCKWISE_TRACK.filter(h => h.startsWith('outer-'));
a.state.board.set(aTrack[0], { playerIdx: 0, pegId: 'table-a-marker' });

const aCell = a.state.board.get(aTrack[0]);
const bCell = b.state.board.get(aTrack[0]);
ok(aCell && aCell.pegId === 'table-a-marker', 'table A sees its own write');
ok(!bCell || bCell.pegId !== 'table-a-marker', 'table B does NOT see table A write',
   `table B had: ${JSON.stringify(bCell)}`);

a.state.players.set('current', 1);
b.state.players.set('current', 0);
ok(a.state.players.get('current') === 1 && b.state.players.get('current') === 0,
   'the two tables hold independent turn state');

// ───────────────────────────────────────────────────────────
section('4. The same seed replays identically (auditable tables)');

function fingerprintDeck(engine, seed) {
  engine.initGame(2, { sessionSeed: seed });
  const deck = engine.state.deck.get('cards') || [];
  return deck.map(c => (c && c.display) || '?').join('|');
}
const s1 = fingerprintDeck(createEngine(), 'audit-seed-001');
const s2 = fingerprintDeck(createEngine(), 'audit-seed-001');
const s3 = fingerprintDeck(createEngine(), 'audit-seed-002');

ok(s1.length > 0, 'a deck was produced', `${s1.split('|').length} cards`);
ok(s1 === s2, 'the same sessionSeed gives the same deck on two separate engines');
ok(s1 !== s3, 'a different sessionSeed gives a different deck');

// The silent fallback in shuffleDeck() is the original "everyone gets a
// different board" bug. The engine refuses to construct without the codec, so
// that path can never be reached server-side. This asserts the guard holds.
ok(typeof g.sandbox.ManifoldCodec === 'object'
   && typeof g.sandbox.ManifoldCodec.seededShuffle === 'function',
   'ManifoldCodec is loaded, so shuffleDeck cannot fall back to Math.random');

// ───────────────────────────────────────────────────────────
section('5. Card 7 keeps the classic rule server-side');

const c = createEngine();
c.initGame(2);
{
  const p0 = (c.state.players.get('list') || [])[0];
  const track = c.CLOCKWISE_TRACK.filter(h => h.startsWith('outer-'));
  for (const h of c.CLOCKWISE_TRACK) c.state.board.set(h, null);
  const spots = [track[0], track[6]];
  p0.pegs.forEach((peg, i) => {
    if (i < 2) {
      peg.holeId = spots[i]; peg.holeType = 'outer'; peg.onFasttrack = false;
      c.state.board.set(spots[i], { playerIdx: 0, pegId: peg.id });
    } else { peg.holeId = 'holding'; peg.holeType = 'holding'; }
  });
  c.state.players.set('current', 0);
  c.state.turn.set('phase', 'move');

  const seven = Object.assign({}, c.CARDS['7'], { value: '7', display: '7S', suit: 'S' });
  c._drawCardCommit(seven);

  const moves = c.state.turn.get('validMoves') || [];
  const splits = moves.filter(m => m.type === 'split');
  ok(splits.length > 0, 'two playable pegs produce splits on the server', `got ${splits.length}`);
  ok(splits.every(m => (m.steps || 0) + (m.steps2 || 0) === 7), 'every server-side split totals 7');
  ok((c.state.cards.get('7') || {}).movement === 7, 'the shared card object is not corrupted');
}

// ───────────────────────────────────────────────────────────
// Turn resolution, measured with the correct call convention.
//
// An earlier version of this file called executeMove(moveObject) instead of
// executeMove(index). Every move silently no-opped on the `if (!move) return`
// guard, which made the turn machine look like it stalled. It does not. With
// indices, turns resolve synchronously headless, because there is no
// waitForAnimations and no cutscene queue to wait on, so the deferred callbacks
// in executeMove run straight through.
//
// Replay cards (A, 6, J, Q, K, JOKER) correctly reopen the draw for the SAME
// seat rather than rotating, so a correct check has to allow for both outcomes.
(async () => {
  section('6. Turns resolve promptly server-side');

  const REPLAY = new Set(['A', '6', 'J', 'Q', 'K', 'JOKER']);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const t = createEngine();
  t.initGame(2, { sessionSeed: 'turn-resolution' });

  let resolved = 0, mismatched = 0, slowest = 0;
  for (let i = 0; i < 12; i++) {
    if (!t.state.deck.get('currentCard')) t.drawCard();
    const rank = String((t.state.deck.get('currentCard') || {}).value);
    const seat0 = t.state.players.get('current');
    const vm = t.state.turn.get('validMoves') || [];
    const t0 = Date.now();
    if (vm.length) t.executeMove(0); else t.endTurn();

    let w = 0, how = null;
    while (w < 8000 && !how) {
      if (t.state.players.get('current') !== seat0) how = 'advanced';
      else if (t.state.turn.get('phase') === 'draw' && t.state.deck.get('currentCard') == null) how = 'replay';
      else { await wait(20); w += 20; }
    }
    slowest = Math.max(slowest, Date.now() - t0);
    if (how) {
      resolved++;
      if (how !== (REPLAY.has(rank) ? 'replay' : 'advanced')) mismatched++;
    }
  }

  ok(resolved === 12, 'every turn resolved', `${resolved}/12`);
  ok(mismatched === 0, 'replay cards replayed and the rest advanced', `${mismatched} mismatches`);
  ok(slowest < 1000, 'turns resolve without waiting on a timer', `slowest ${slowest} ms`);

  console.log(NL + '='.repeat(62));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(62));
  if (fail) {
    console.log(NL + 'Failures:');
    failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
    process.exit(1);
  }
  process.exit(0);
})();
