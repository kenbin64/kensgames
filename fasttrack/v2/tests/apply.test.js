// tests/apply.test.js
// apply executes a chosen move and mutates state: enter, move, cut (with the holding/home
// fallback), circuit-eligibility, the card-4 fast-track strip, and the win.
// Run: node tests/apply.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../engine/rules.js';
import { createState, pegByPlayerN, pegsOf, occupantOf } from '../engine/state.js';
import { applyMove } from '../engine/apply.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
function game() { const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 4 }); s.turn.current = 0; return s; }
const withCard = (s, rank) => { s.turn.card = { rank }; return s; };

console.log('\n== enter places a holding peg on home ==');
let s = withCard(game(), 'A');
pegByPlayerN(s, 0, 4).location = 'outer-0-1';   // vacate home
applyMove(s, R, { type: 'enter', peg: 0, from: 'hold-0-1', dest: 'home-0', path: [] });
ok(pegByPlayerN(s, 0, 0).location === 'home-0', 'the entered peg sits on home-0');

console.log('\n== move cuts an opponent on the landing hole (to holding) ==');
s = withCard(game(), 'A');
pegByPlayerN(s, 1, 0).location = 'side-right-0-1';   // opponent on the loop (holding slot 1 now free)
applyMove(s, R, { type: 'move', peg: 4, from: 'home-0', dest: 'side-right-0-1', path: ['side-right-0-1'], steps: 1 });
ok(occupantOf(s, 'side-right-0-1').player === 0, 'our peg now holds the landing hole');
ok(pegByPlayerN(s, 1, 0).location.startsWith('hold-1-'), 'the cut opponent peg returned to its holding');

console.log('\n== cut falls back to the opponent home when holding is full ==');
s = withCard(game(), 'A');
pegByPlayerN(s, 1, 4).location = 'side-right-0-1';   // opponent 5th peg on the loop; its 4 others fill holding
applyMove(s, R, { type: 'move', peg: 4, from: 'home-0', dest: 'side-right-0-1', path: ['side-right-0-1'], steps: 1 });
ok(pegByPlayerN(s, 1, 4).location === 'home-1', 'with holding full, the cut peg falls back to its home hole');

console.log('\n== circuit-eligibility is set when the path crosses the entrance ==');
s = withCard(game(), '2');
pegByPlayerN(s, 0, 4).location = 'outer-0-1';
applyMove(s, R, { type: 'move', peg: 4, from: 'outer-0-1', dest: 'outer-0-3', path: ['outer-0-2', 'outer-0-3'], steps: 2 });
ok(pegByPlayerN(s, 0, 4).hasCircuited === true, 'passing outer-0-2 (the entrance) arms the peg for the safe zone');

console.log('\n== card 4 strips fast-track status from all of the player pegs ==');
s = withCard(game(), '4');
const ftPeg = pegByPlayerN(s, 0, 0); ftPeg.location = 'ft-0'; ftPeg.onFastTrack = true;
applyMove(s, R, { type: 'move', peg: 0, from: 'ft-0', dest: 'side-right-5-1', path: ['side-right-5-1'], steps: 4 });
ok(pegsOf(s, 0).every((pg) => pg.onFastTrack === false), 'drawing a 4 ends fast-track for every one of the player pegs');

console.log('\n== win: four in the safe zone and the fifth landing on home, circuited ==');
s = withCard(game(), 'A');
for (let h = 1; h <= 4; h++) pegByPlayerN(s, 0, h - 1).location = `safe-0-${h}`;
const winner = pegByPlayerN(s, 0, 4); winner.location = 'side-right-5-4'; winner.hasCircuited = true;
applyMove(s, R, { type: 'move', peg: 4, from: 'side-right-5-4', dest: 'home-0', path: ['home-0'], steps: 1 });
ok(s.winner === 0, 'the fifth peg landing on home with four in the safe zone wins the game');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
