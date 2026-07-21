// tests/bullseye.test.js
// Bullseye ENTRY, ported from the proven core to close the one gameplay gap the first v2
// engine had. The center is reached two ways (rules.json bullseye_entry): a one-step card
// (A/J/Q/K/Joker) jump straight in from a peg already on a FOREIGN ft hole, or a forward move
// of two-or-more whose penultimate hole is a foreign ft, pivoting in as the final step. Entry
// is single-occupancy (an opponent at the center is cut), never from the own ft-{p}, never
// backward, and it does NOT cost the player's other fast-track pegs their status.
// Run: node tests/bullseye.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../logic/rules.js';
import { createState, pegByPlayerN, occupantOf, pegsOf } from '../logic/state.js';
import { calculateValidMoves } from '../logic/moves.js';
import { applyMove } from '../logic/apply.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const fresh = () => createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
const movesOf = (s, rank) => calculateValidMoves(s, R, { rank });
const bulls = (s, rank) => movesOf(s, rank).filter((m) => m.type === 'enterBullseye');

console.log('\n== one-step jump from a FOREIGN ft (A, J, Q, K, Joker) ==');
let s = fresh();
let ftPeg = pegByPlayerN(s, 0, 0); ftPeg.location = 'ft-2'; ftPeg.onFastTrack = true;   // foreign ft, in FT mode
for (const rank of ['A', 'J', 'Q', 'K', 'JOKER']) {
  const b = bulls(s, rank);
  ok(b.length === 1 && b[0].dest === 'center' && b[0].from === 'ft-2', `${rank} jumps ft-2 straight into the center`);
}
ok(bulls(s, '3').length === 0, 'a 3 (multi-step) offers no one-step jump from ft-2');
ok(bulls(s, '4').length === 0, 'card 4 (backward) never enters the center');

console.log('\n== the one-step jump is gated exactly like the proven core ==');
s = fresh();
let own = pegByPlayerN(s, 0, 0); own.location = 'ft-0'; own.onFastTrack = true;          // own ft-{p}
ok(bulls(s, 'A').length === 0, 'no jump from the own ft-0 (treated as backward)');
s = fresh();
let notMode = pegByPlayerN(s, 0, 0); notMode.location = 'ft-2'; notMode.onFastTrack = false; // on ft but not in FT mode
ok(bulls(s, 'A').length === 0, 'no jump from a foreign ft when the peg is not in fast-track mode');
s = fresh();
ftPeg = pegByPlayerN(s, 0, 0); ftPeg.location = 'ft-2'; ftPeg.onFastTrack = true;
pegByPlayerN(s, 0, 1).location = 'center';                                                  // own peg already at center
ok(bulls(s, 'A').length === 0, 'no jump onto an own peg already at the center (single-occupancy)');
s = fresh();
ftPeg = pegByPlayerN(s, 0, 0); ftPeg.location = 'ft-2'; ftPeg.onFastTrack = true;
pegByPlayerN(s, 1, 0).location = 'center';                                                  // opponent at center
ok(bulls(s, 'A').length === 1, 'an opponent at the center does not block entry (it will be cut)');

console.log('\n== multi-step divert: penultimate hole is a foreign ft ==');
s = fresh();
// side-right-0-4 is the last hole of wedge 0; one step clockwise is ft-1 (foreign), two is side-left-1-4.
let pp = pegByPlayerN(s, 0, 0); pp.location = 'side-right-0-4';
const two = movesOf(s, '2');
ok(two.some((m) => m.type === 'move' && m.from === 'side-right-0-4' && m.dest === 'side-left-1-4'),
  'the regular 2-step continuation to side-left-1-4 is offered');
ok(two.some((m) => m.type === 'enterBullseye' && m.from === 'side-right-0-4' && m.dest === 'center'
  && m.path[m.path.length - 1] === 'center' && m.path[0] === 'ft-1'),
  'the same 2 also offers a divert into the center via the penultimate ft-1');
// own peg sitting on the penultimate ft blocks the divert (but the regular move may still stand)
s = fresh();
pp = pegByPlayerN(s, 0, 0); pp.location = 'side-right-0-4';
pegByPlayerN(s, 0, 1).location = 'ft-1';
ok(bulls(s, '2').length === 0, 'an own peg on the penultimate ft-1 blocks the center divert');

console.log('\n== apply: entering the center places the peg, cuts an opponent, keeps other FT pegs ==');
s = fresh();
let mover = pegByPlayerN(s, 0, 0); mover.location = 'ft-2'; mover.onFastTrack = true;
let mate = pegByPlayerN(s, 0, 1); mate.location = 'ft-4'; mate.onFastTrack = true;          // a second FT peg
let victim = pegByPlayerN(s, 1, 0); victim.location = 'center';                               // opponent to be cut
s.turn.current = 0; s.turn.card = { rank: 'A' };
const jump = bulls(s, 'A')[0];
applyMove(s, R, jump);
ok(mover.location === 'center', 'the mover lands on the center');
ok(mover.onFastTrack === false, 'the mover is no longer in fast-track mode once at the center');
ok(mate.onFastTrack === true, 'the player\'s OTHER fast-track peg keeps its status (entry is FT-preserving)');
ok(victim.location.startsWith('hold-1-'), 'the opponent resident is cut back to its holding');

console.log('\n== exit still works: only J, Q, K leave the center ==');
s = fresh();
pegByPlayerN(s, 0, 1).location = 'center';
ok(movesOf(s, 'J').some((m) => m.type === 'exitBullseye' && m.dest === 'ft-0'), 'a J exits the center to ft-0');
ok(movesOf(s, 'A').filter((m) => m.type === 'exitBullseye').length === 0, 'an Ace does not exit the center');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
