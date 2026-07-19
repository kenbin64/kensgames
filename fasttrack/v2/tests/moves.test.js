// tests/moves.test.js
// The first ported move types, verified against the proven rules: enter from holding,
// exit bullseye, and safe-zone advance. Each is a delta event.
// Run: node tests/moves.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../engine/rules.js';
import { createState, pegByPlayerN } from '../engine/state.js';
import { calculateValidMoves } from '../engine/moves.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const fresh = () => createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
const movesOf = (s, rank) => calculateValidMoves(s, R, { rank });

console.log('\n== enter from holding (A, 6, JOKER) ==');
let s = fresh();
ok(movesOf(s, 'A').filter((m) => m.type === 'enter').length === 0, 'no enter while the home hole is occupied by the own starting peg');
s = fresh();
pegByPlayerN(s, 0, 4).location = 'outer-0-1';   // vacate the home hole (peg 4 is the one that starts on home)
const enters = movesOf(s, 'A').filter((m) => m.type === 'enter');
ok(enters.length === 4 && enters.every((m) => m.dest === 'home-0'), 'with home free, each of the 4 holding pegs can enter onto home-0');
ok(movesOf(s, '2').filter((m) => m.type === 'enter').length === 0, 'a non-entry card (2) yields no enter moves');

console.log('\n== exit bullseye (J, Q, K only) ==');
s = fresh();
pegByPlayerN(s, 0, 1).location = 'center';
const jExit = movesOf(s, 'J').filter((m) => m.type === 'exitBullseye');
ok(jExit.length === 1 && jExit[0].dest === 'ft-0', 'a J exits the center to the own ft hole (ft-0)');
ok(movesOf(s, 'A').filter((m) => m.type === 'exitBullseye').length === 0, 'an Ace does not exit the center (only J, Q, K do)');

console.log('\n== safe-zone advance (forward only, exact landing, no jumping) ==');
s = fresh();
pegByPlayerN(s, 0, 1).location = 'safe-0-1';
const safe2 = movesOf(s, '2').filter((m) => m.from === 'safe-0-1');
ok(safe2.length === 1 && safe2[0].dest === 'safe-0-3', 'a 2 advances safe-0-1 to safe-0-3, exact landing');
ok(movesOf(s, '3').filter((m) => m.from === 'safe-0-1' && m.dest === 'safe-0-4').length === 1, 'a 3 advances safe-0-1 to safe-0-4');
ok(movesOf(s, '5').filter((m) => m.from === 'safe-0-1').length === 0, 'a 5 overshoots the safe zone, so no move');
pegByPlayerN(s, 0, 2).location = 'safe-0-3';   // block the path
ok(movesOf(s, '2').filter((m) => m.from === 'safe-0-1').length === 0, 'a peg occupying safe-0-3 blocks the 2-step landing (no jumping)');

console.log('\n== perimeter step (forward, exact landing, no land/pass own) ==');
s = fresh();   // peg 4 starts on home-0, on the loop
ok(movesOf(s, '3').some((m) => m.from === 'home-0' && m.dest === 'side-right-0-3'), 'a 3 from home-0 lands on side-right-0-3 (3 holes clockwise)');
ok(movesOf(s, '2').some((m) => m.from === 'home-0' && m.dest === 'side-right-0-2'), 'a 2 from home-0 lands on side-right-0-2');
s = fresh(); pegByPlayerN(s, 0, 0).location = 'side-right-0-3';
ok(movesOf(s, '3').filter((m) => m.from === 'home-0').length === 0, 'cannot land on an own peg (side-right-0-3 occupied)');
s = fresh(); pegByPlayerN(s, 0, 0).location = 'side-right-0-2';
ok(movesOf(s, '3').filter((m) => m.from === 'home-0').length === 0, 'cannot pass an own peg in the path (side-right-0-2 occupied)');

console.log('\n== perimeter: reaching your own entrance diverts into the safe zone (circuit completes) ==');
// A peg only ever reaches outer-0-1 (index 6) after travelling ~81 of the 84 loop holes from
// home, so arriving at its own entrance ALWAYS completes the circuit and MUST divert. It may
// not sail past onto the main track (Ken's safe-zone bug). Note hasCircuited is left false here
// on purpose: the flag is set only AFTER a move whose path includes the entrance, so gating the
// divert on it would be one move too late.
s = fresh(); pegByPlayerN(s, 0, 0).location = 'outer-2-1';   // mid-board, far from player 0's OWN entrance
ok(movesOf(s, '2').some((m) => m.from === 'outer-2-1' && m.dest === 'outer-2-3'), 'mid-board: a 2 stays on the track (outer-2-3) — no divert at another wedge\'s entrance');
s = fresh(); pegByPlayerN(s, 0, 4).location = 'outer-0-1';   // one hop before player 0's own entrance (outer-0-2)
ok(movesOf(s, '2').some((m) => m.from === 'outer-0-1' && m.dest === 'safe-0-1'), 'reaching your own entrance: a 2 diverts into safe-0-1 (completing the circuit this move)');
ok(!movesOf(s, '2').some((m) => m.from === 'outer-0-1' && m.dest === 'outer-0-3'), 'reaching your own entrance: it may NOT sail past onto outer-0-3');

console.log('\n== card 4 goes backward ==');
s = fresh();
ok(movesOf(s, '4').some((m) => m.from === 'home-0' && m.dest === 'outer-0-0'), 'a 4 from home-0 moves backward four to outer-0-0');

console.log('\n== fast-track leave-at-k exit ==');
s = fresh(); pegByPlayerN(s, 0, 0).location = 'ft-0';   // own ft (ring distance D=0)
let ftm = movesOf(s, '3').filter((m) => m.type === 'exitFastTrack' && m.from === 'ft-0');
ok(ftm.length === 1 && ftm[0].dest === 'side-left-0-2', 'from own ft-0 a 3 walks the home stretch to side-left-0-2 (single option)');
s = fresh(); pegByPlayerN(s, 0, 0).location = 'ft-2';   // foreign ft (D=4)
ftm = movesOf(s, '3').filter((m) => m.type === 'exitFastTrack' && m.from === 'ft-2');
ok(ftm.length === 4, 'from foreign ft-2 a 3 gives four leave-at-k options (k=0..3)');
ok(ftm.some((m) => m.dest === 'ft-5'), 'one option stays on the ring all three hops (dest ft-5)');
ok(ftm.some((m) => m.dest === 'side-left-2-2'), 'one option leaves the ring immediately (dest side-left-2-2)');
s = fresh(); pegByPlayerN(s, 0, 0).location = 'ft-2'; pegByPlayerN(s, 0, 1).location = 'ft-3';   // own peg blocks the ring
ftm = movesOf(s, '3').filter((m) => m.type === 'exitFastTrack' && m.from === 'ft-2');
ok(ftm.length === 1 && ftm[0].dest === 'side-left-2-2', 'an own peg on ft-3 blocks the ring, leaving only the immediate-leave option');

console.log('\n== card 4 on a fast-track peg goes backward on the rim, not the ring ==');
s = fresh(); pegByPlayerN(s, 0, 0).location = 'ft-0';
ok(movesOf(s, '4').filter((m) => m.type === 'exitFastTrack').length === 0, 'card 4 emits no fast-track exit');
ok(movesOf(s, '4').some((m) => m.type === 'move' && m.from === 'ft-0' && m.dest === 'side-right-5-1'), 'card 4 from ft-0 walks backward to side-right-5-1');

console.log('\n== card 7: single-peg-7 and a+b=7 splits ==');
// Park both pegs mid-board in EMPTY wedges (2 and 3 have no pegs in a 2-player game) so the
// split mechanics are tested without a safe-zone divert or a home-hole cut skewing the paths.
s = fresh();
pegByPlayerN(s, 0, 0).location = 'outer-2-1';
pegByPlayerN(s, 0, 1).location = 'outer-3-1';
pegByPlayerN(s, 0, 4).location = 'safe-0-1';   // move the home peg off the loop so it does not block
const m7 = movesOf(s, '7');
ok(m7.some((m) => m.type !== 'split' && m.from === 'outer-2-1' && m.steps === 7), 'one peg can take all 7 (outer-2-1 moves 7)');
ok(m7.some((m) => m.type === 'split'), 'card 7 emits split moves');
ok(m7.some((m) => m.type === 'split' && m.from === 'outer-2-1' && m.a === 3 && m.from2 === 'outer-3-1' && m.b === 4), 'a 3+4 split across outer-2-1 and outer-3-1 exists');
ok(!m7.some((m) => (m.from && m.from.startsWith('hold-')) || (m.from2 && m.from2.startsWith('hold-'))), 'holding pegs never participate in a 7');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
