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

let movesExecuted = 0, thrown = null;
try {
  g.drawCard();
  for (let i = 0; i < 25; i++) {
    const vm = g.state.turn.get('validMoves') || [];
    if (!vm.length) break;
    g.executeMove(vm[0]);
    movesExecuted++;
    g.calculateValidMoves();
  }
} catch (e) {
  thrown = String(e && e.stack || e);
}
ok(thrown === null, 'drawing and applying moves throws nothing server-side',
   thrown ? thrown.slice(0, 200) : '');
ok(movesExecuted > 0, 'moves executed with no renderer present', `${movesExecuted} moves`);

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
// MEASURED GAP: turn advancement is not yet server-safe.
//
// This section reports rather than asserts, because it tracks known work rather
// than a regression. It keeps the numbers visible, and the day the turn machine
// is decoupled from presentation it should start showing 3/3 on its own.
//
// Measured 2026-09-05, headless, across four configurations (solo, same-screen,
// private, and 4-player): the first turn advances and then the machine stalls.
// Turns that did advance took between 1.1 and 5.9 seconds. That latency is the
// tell. executeMove ends with:
//
//     CutsceneManager.whenDrained(() => resolveTurn(_moveEpoch));
//     setTimeout(() => resolveTurn(_moveEpoch), 6000);
//
// so a turn advances when animations and cutscenes report finished, with a six
// second wall-clock fallback behind them. That is a timing race, not a rule, and
// the epoch guard exists to suppress the duplicate fires the race produces. Over
// a socket every client runs that race against its own clock, which is where the
// skipped turns come from.
//
// For server authority the turn must advance synchronously as part of applying
// the move, with animation demoted to presentation that can never gate
// authoritative state.
// ───────────────────────────────────────────────────────────
(async () => {
  section('MEASURED GAP: turn advancement (reported, not asserted)');

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const t = createEngine();
  t.initGame(2, { sessionSeed: 'gap-check' });
  const results = [];
  for (let i = 0; i < 3; i++) {
    const seat = t.state.players.get('current');
    if (!t.state.deck.get('currentCard')) t.drawCard();
    const vm = t.state.turn.get('validMoves') || [];
    const t0 = Date.now();
    if (vm.length) t.executeMove(vm[0]); else t.endTurn();
    let w = 0;
    while (t.state.players.get('current') === seat && w < 7000) { await wait(25); w += 25; }
    results.push({ moved: t.state.players.get('current') !== seat, ms: Date.now() - t0 });
  }
  const adv = results.filter(r => r.moved).length;
  console.log(`  MEASURED  ${adv}/${results.length} turns advanced; ms: ${results.map(r => r.ms).join(', ')}`);
  console.log('  NOTE      turn advance is timer-driven and stalls after the first turn.');
  console.log('            This is the blocker for server-authoritative multiplayer.');

  console.log('\n' + '='.repeat(62));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(62));
  if (fail) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
    process.exit(1);
  }
  process.exit(0);
})();
