// tests/engine.test.js
// Phase 1 foundation: the rules loader reads fasttrack.rules.json correctly, and the board
// topology matches the proven semantic track (ft, 4 side-left, 4 outer, home, 4 side-right).
// Run: node tests/engine.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../logic/rules.js';
import { buildBoard, orderedTrack, wedgeSegment, holeRole, ftRingNext } from '../logic/board.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } };

console.log('\n== rules loader (reads fasttrack.rules.json) ==');
const R = loadRules(doc);
ok([...R.redrawSet].sort().join(',') === '6,A,J,JOKER,K,Q', 'redraw set is exactly A,6,J,Q,K,JOKER');
ok(R.canEnterFromHolding('A') && R.canEnterFromHolding('6') && R.canEnterFromHolding('JOKER') && !R.canEnterFromHolding('2'),
  'enter-from-holding is exactly A,6,JOKER');
ok(R.canExitBullseye('J') && R.canExitBullseye('Q') && R.canExitBullseye('K') && !R.canExitBullseye('A') && !R.canExitBullseye('JOKER'),
  'bullseye exit is exactly J,Q,K (not Ace, not Joker)');
ok([...R.oneStepSet].sort().join(',') === 'A,J,JOKER,K,Q', 'one-step cards are A,J,Q,K,JOKER');
ok(R.card('4').direction === 'counter_clockwise' && R.card('4').is_backward === true, 'card 4 moves backward (counter-clockwise)');
ok(R.card('7').can_split === true, 'card 7 can split');
ok(R.rule('WIN_NO_OVERSHOOT') != null && R.rule('FT_EXIT_ANY_HOLE') != null, 'rules are indexed by id');

console.log('\n== board topology (proven semantic track) ==');
const track = orderedTrack();
ok(track.length === 84, 'perimeter loop has 84 holes');
const seg0 = wedgeSegment(0);
const expectedSeg = ['ft-0', 'side-left-0-4', 'side-left-0-3', 'side-left-0-2', 'side-left-0-1', 'outer-0-0', 'outer-0-1', 'outer-0-2', 'outer-0-3', 'home-0', 'side-right-0-1', 'side-right-0-2', 'side-right-0-3', 'side-right-0-4'];
ok(seg0.join(',') === expectedSeg.join(','), 'a wedge is ft, 4 side-left, 4 outer, home, 4 side-right (clockwise)');
ok(track[0] === 'ft-0' && track[83] === 'side-right-5-4', 'the loop starts at ft-0 and ends at side-right-5-4');

const B = buildBoard();
const kinds = (k) => [...B.holes.values()].filter((h) => h.kind === k).length;
ok(kinds('fasttrack') === 6, '6 fast-track holes (one per wedge, on the loop)');
ok(kinds('side-left') === 24 && kinds('side-right') === 24, '24 side-left and 24 side-right holes');
ok(kinds('outer') === 24, '24 outer holes (4 per wedge)');
ok(kinds('home') === 6, '6 home/winner holes (on the loop)');
ok(kinds('safezone') === 24 && kinds('holding') === 24, '24 safe and 24 holding holes');
ok(kinds('bullseye') === 1 && B.holes.has('center'), 'one center (bullseye)');
ok(holeRole('ft-0') === 'fasttrack' && holeRole('outer-0-2') === 'outer' && holeRole('home-0') === 'home', 'roles classify by id');
ok(ftRingNext(5) === 0, 'the fast-track ring wraps: ft-5 -> ft-0');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
