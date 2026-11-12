#!/usr/bin/env node
/**
 * ============================================================
 * NO PEG PASSES ITS OWN SAFE-ZONE ENTRANCE CLOCKWISE (except the final peg)
 *
 * Ken, 2026-11-11: "a red peg went beyond the safe zone entrance instead of
 * inside the safe zone. The only peg that can ever go beyond the safe zone
 * entrance is the final peg after the safe zone is full." And: "pegs can go
 * past the safe zone entrance going counterclockwise just not clockwise."
 *
 * Cause: passing its own ft-{bp} completes a peg's circuit, but the flag was
 * only set after the move. A card that carried a peg past ft-{bp} AND the
 * entrance in one move (7 holes apart) walked past the entrance:
 * 1 before ft-{bp} with a 9 landed on outer-{bp}-3, with a 10 on home-{bp}.
 *
 *   1. 1 to 3 holes before ft-{bp}, cards 7 to 10: every clockwise move stops
 *      at or before the entrance, or goes INTO the safe zone
 *   2. a 4 (counterclockwise) may still carry a peg back past the entrance
 *   3. the final peg, safe zone full, still reaches the winning hole
 *
 * Run: node fasttrack/test_safe_entry_no_overshoot.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }

const g = createEngine();
g.initGame(2, { sessionSeed: 'safe-entry' });
const list = g.state.players.get('list');
const me = list[0];
const bp = me.boardPosition;
const t = g.CLOCKWISE_TRACK;
const ftIdx = t.indexOf(`ft-${bp}`);
const entrance = `outer-${bp}-2`;
const holeAt = (i) => t[(i + t.length) % t.length];

// Clear the table, then put the given pegs of seat 0 on the given holes.
function stage(holes, cardValue, flags = {}) {
  for (const h of t) g.state.board.set(h, null);
  for (let s = 1; s <= 4; s++) g.state.board.set(`safe-${bp}-${s}`, null);
  for (const pl of list) for (const pg of pl.pegs) {
    pg.holeId = 'holding'; pg.holeType = 'holding';
    pg.onFasttrack = false; pg.eligibleForSafeZone = false; pg.lockedToSafeZone = false;
  }
  holes.forEach((hole, i) => {
    const pg = me.pegs[i];
    pg.holeId = hole; pg.holeType = g.getHoleType(hole);
    if (pg.holeType === 'safezone') pg.lockedToSafeZone = true;
    Object.assign(pg, flags[i] || {});
    g.state.board.set(hole, { playerIdx: 0, pegId: pg.id });
  });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  g._drawCardCommit(Object.assign({}, g.CARDS[cardValue], { value: cardValue, display: cardValue + 'S', suit: 'S' }));
  return (g.state.turn.get('validMoves') || []).filter(m => m.pegIdx === 0 && m.type !== 'split');
}

// The holes clockwise from ft-{bp} up to and including the entrance.
const upToEntrance = [];
for (let i = ftIdx; ; i++) { upToEntrance.push(holeAt(i)); if (holeAt(i) === entrance) break; }
const allowed = (dest) => dest.startsWith(`safe-${bp}-`) || upToEntrance.includes(dest);

section('1. A big card past ft-' + bp + ' stops at the entrance or goes in, never past it');
for (const back of [1, 2, 3]) {
  for (const v of ['7', '8', '9', '10']) {
    const start = holeAt(ftIdx - back);
    const dests = stage([start], v).map(m => m.dest);
    ok(dests.length > 0 && dests.every(allowed),
       `${back} before ft-${bp}, card ${v}: ${dests.join(', ') || '(no move)'}`);
  }
}
{
  const d9 = stage([holeAt(ftIdx - 1)], '9').map(m => m.dest);
  const d10 = stage([holeAt(ftIdx - 1)], '10').map(m => m.dest);
  ok(d9.includes(`safe-${bp}-1`), `1 before, a 9 goes to safe-${bp}-1`, d9.join(', '));
  ok(d10.includes(`safe-${bp}-2`), `1 before, a 10 goes to safe-${bp}-2`, d10.join(', '));
}

section('2. Counterclockwise (a 4) may still pass the entrance');
{
  const start = `outer-${bp}-3`;
  const dests = stage([start], '4', { 0: { eligibleForSafeZone: true } }).map(m => m.dest);
  const behind = holeAt(t.indexOf(start) - 4);
  ok(dests.includes(behind), `a 4 from ${start} backs past the entrance to ${behind}`, dests.join(', '));
}

section('3. The final peg, safe zone full, still reaches the winning hole');
{
  // Four pegs fill the safe zone; the fifth is 1 before the entrance, already round.
  const start = holeAt(t.indexOf(entrance) - 1);
  const dests = stage([start, `safe-${bp}-1`, `safe-${bp}-2`, `safe-${bp}-3`, `safe-${bp}-4`], '3',
    { 0: { eligibleForSafeZone: true } }).map(m => m.dest);
  ok(dests.includes(`home-${bp}`), `from ${start}, a 3 lands on home-${bp}`, dests.join(', ') || '(no move)');
}

console.log(NL + '='.repeat(62));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(62));
if (fail) {
  console.log(NL + 'Failures:');
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
}
process.exit(fail ? 1 : 0);
