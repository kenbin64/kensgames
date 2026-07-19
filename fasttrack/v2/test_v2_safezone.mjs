// Safe-zone entry rules for the v2 engine. Entrance is outer-{p}-2; safe holes are
// safe-{p}-1..4; home-{p} sits 2 hops past the entrance (outer-3 -> home). A peg that
// TOUCHES its own entrance going clockwise has completed its circuit and MUST divert
// into the safe zone that same move — unless the safe zone is full, in which case the
// final peg continues to home and must land there exactly (never overshoot).
// Run: node fasttrack/v2/test_v2_safezone.mjs   (from fasttrack/)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from './engine/rules.js';
import { createState, pegByPlayerN } from './engine/state.js';
import { calculateValidMoves } from './engine/moves.js';
import { applyMove, crownPresent, checkWin } from './engine/apply.js';

const here = dirname(fileURLToPath(import.meta.url));
const R = loadRules(JSON.parse(readFileSync(join(here, '..', 'fasttrack.rules.json'), 'utf8')));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Player 0: `safeCount` pegs parked at the FRONT of the safe zone (safe-0-1..), the test
// peg on the loop at `loc`, everything else (incl. the starting home peg) tucked away in
// holding so home-0 is free and nothing blocks the landing hole.
function setup(safeCount, loc, circuited) {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  const pegs = [0, 1, 2, 3, 4].map((n) => pegByPlayerN(s, 0, n));
  for (const pg of pegs) pg.location = `hold-0-1`;                 // clear the board first
  for (let i = 0; i < safeCount; i++) pegs[i].location = `safe-0-${i + 1}`;
  pegs[4].location = loc; pegs[4].hasCircuited = !!circuited;
  return { s, peg: pegs[4].n };
}
const destsFor = (s, pegN, rank) => calculateValidMoves(s, R, { rank })
  .filter((m) => m.peg === pegN).map((m) => m.dest);
const only = (s, pegN, rank) => { const d = destsFor(s, pegN, rank); return d.length === 1 ? d[0] : JSON.stringify(d); };

console.log('\n== a peg COMPLETING its circuit this move (hasCircuited=false pre-move) must divert in ==');
// peg at outer-0-1, one hop before the entrance. rank 2 -> gate+safe-1; rank 3 -> gate+safe-1+safe-2.
{
  let { s, peg } = setup(0, 'outer-0-1', false);
  ok(only(s, peg, '2') === 'safe-0-1', 'not-yet-circuited peg, card 2 -> enters safe-0-1 (was sailing to home)');
  ({ s, peg } = setup(0, 'outer-0-1', false));
  ok(only(s, peg, '3') === 'safe-0-2', 'not-yet-circuited peg, card 3 -> enters safe-0-2');
  ({ s, peg } = setup(0, 'outer-0-1', false));
  ok(!destsFor(s, peg, '5').includes('home-0'), 'not-yet-circuited peg, card 5 -> does NOT reach home (would overshoot the safe zone)');
}

console.log('\n== an already-circuited peg still enters correctly (no regression) ==');
{
  let { s, peg } = setup(0, 'outer-0-1', true);
  ok(only(s, peg, '2') === 'safe-0-1', 'circuited peg, card 2 -> safe-0-1');
  ({ s, peg } = setup(2, 'outer-0-1', true));
  ok(only(s, peg, '4') === 'side-left-0-3', 'circuited peg, card 4 -> moves BACKWARD (side-left-0-3), never diverts');
}

console.log('\n== FULL safe zone: the final peg continues to home, exact landing only ==');
{
  let { s, peg } = setup(4, 'outer-0-1', true);
  ok(only(s, peg, '3') === 'home-0', 'full zone, card 3 from outer-0-1 -> home-0 (win hole)');
  ({ s, peg } = setup(4, 'outer-0-1', true));
  ok(destsFor(s, peg, '5').length === 0, 'full zone, card 5 -> no move (cannot overshoot home)');
  ({ s, peg } = setup(4, 'outer-0-2', true));           // sitting on the entrance
  ok(only(s, peg, '2') === 'home-0', 'full zone, card 2 from the entrance -> home-0');
  ({ s, peg } = setup(4, 'outer-0-2', true));
  ok(destsFor(s, peg, '3').length === 0, 'full zone, card 3 from the entrance -> no move (home is 2 away, no overshoot)');
  // never lands past home on the side-right holes
  for (const rank of ['A', '2', '3', '5', '6', '7']) {
    const { s: ss, peg: pp } = setup(4, 'outer-0-1', true);
    const bad = destsFor(ss, pp, rank).filter((d) => /^side-right-0-/.test(d));
    ok(bad.length === 0, `full zone, card ${rank} -> never overshoots onto ${bad.join(',') || 'side-right'}`);
  }
}

console.log('\n== traversal: TOUCHING the entrance hole (either direction) completes the circuit ==');
// Backward: a card 4 from home-0 walks back THROUGH the entrance (outer-0-2). Ken\'s rule —
// touching the entrance either way is a traversal, a quick way around the loop like the fast
// track. It flags the circuit but does NOT enter the safe zone (that needs a forward move).
{
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  const peg = pegByPlayerN(s, 0, 4);                                   // starts on home-0
  const m = calculateValidMoves(s, R, { rank: '4' }).find((mm) => mm.peg === 4 && mm.from === 'home-0');
  ok(m && m.path.includes('outer-0-2'), 'card 4 from home-0 walks backward through the entrance (outer-0-2)');
  ok(m && !String(m.dest).startsWith('safe-'), 'the backward-4 lands back on the track, it does NOT enter the safe zone');
  if (m) applyMove(s, R, m);
  ok(peg.hasCircuited === true, 'after the backward-4 the peg has TRAVERSED — circuit complete, may now enter the safe zone');
}
// Forward: reaching the entrance forward is also a traversal AND diverts in.
{
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  const peg = pegByPlayerN(s, 0, 4); peg.location = 'outer-0-1';       // not yet flagged
  const m = calculateValidMoves(s, R, { rank: '2' }).find((mm) => mm.peg === 4 && mm.dest === 'safe-0-1');
  ok(!!m, 'forward 2 from outer-0-1 diverts into safe-0-1');
  if (m) applyMove(s, R, m);
  ok(peg.hasCircuited === true, 'the forward divert also flags the traversal');
}

console.log('\n== crown: all 4 safe holes filled + final peg on the home stretch, and it gates the win ==');
function crownSetup(safeCount, fifthLoc, circuited) {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  const pegs = [0, 1, 2, 3, 4].map((n) => pegByPlayerN(s, 0, n));
  for (const pg of pegs) pg.location = 'hold-0-1';
  for (let i = 0; i < safeCount; i++) pegs[i].location = `safe-0-${i + 1}`;
  pegs[4].location = fifthLoc; pegs[4].hasCircuited = !!circuited;
  return s;
}
ok(crownPresent(crownSetup(4, 'ft-0', true), 0), 'crown ON: 4 in the safe zone + final peg enters the stretch at its own ft-0');
ok(crownPresent(crownSetup(4, 'outer-0-2', true), 0), 'crown ON: final peg sitting on the entrance hole');
ok(crownPresent(crownSetup(4, 'home-0', true), 0), 'crown ON: final peg on the home hole');
ok(!crownPresent(crownSetup(3, 'ft-0', true), 0), 'crown OFF: only 3 safe holes filled (not all 4)');
ok(!crownPresent(crownSetup(4, 'hold-0-1', false), 0), 'crown OFF: final peg was cut back to holding');
ok(!crownPresent(crownSetup(4, 'side-right-0-2', true), 0), 'crown OFF: final peg on the exit side (side-right), not the run-in');
ok(!crownPresent(crownSetup(4, 'outer-2-1', true), 0), 'crown OFF: final peg still way out on the far track');
ok(checkWin(crownSetup(4, 'home-0', true), 0) === 0, 'WIN awarded: 4 in the safe zone + final peg home + crown present');
ok(checkWin(crownSetup(3, 'home-0', true), 0) == null, 'NO win: final peg on home but only 3 in the safe zone (no crown)');

console.log('\n== final approach: crown STAYS past the entrance to the win hole; no peg goes beyond it ==');
// Going past the safe-zone entrance toward the win hole is NOT "leaving the stretch" — the crown
// holds until the peg lands home exactly. And no peg may ever pass the win hole: a card that would
// overshoot yields no move (the turn is over if that is the only peg that could move).
ok(crownPresent(crownSetup(4, 'outer-0-3', true), 0), 'crown STAYS: final peg on outer-0-3, past the entrance on the run to home');
{
  const s = crownSetup(4, 'outer-0-3', true);
  const to = calculateValidMoves(s, R, { rank: 'A' }).filter((m) => m.peg === 4).map((m) => m.dest);
  ok(to.length === 1 && to[0] === 'home-0', 'exact landing: from outer-0-3 a 1 lands precisely on the win hole');
}
{
  const s = crownSetup(4, 'outer-0-3', true);
  ok(calculateValidMoves(s, R, { rank: '2' }).filter((m) => m.peg === 4).length === 0, 'no overshoot: from outer-0-3 a 2 has NO legal move — cannot pass the win hole, turn is over');
}
{
  const s = crownSetup(4, 'outer-0-3', true);
  const m = calculateValidMoves(s, R, { rank: 'A' }).find((mm) => mm.peg === 4 && mm.dest === 'home-0');
  if (m) applyMove(s, R, m);
  ok(crownPresent(s, 0) && s.winner === 0, 'crown still present at the instant the final peg lands home, and the win is awarded');
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail ? 1 : 0);
