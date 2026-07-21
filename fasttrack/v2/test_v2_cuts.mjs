// Cutting rules for the v2 engine. Ken's rule: ONLY the 4 safe-zone holes are safe.
// Every other hole a peg can sit on — outer track, fast-track ring, the bullseye, and the
// home/winner hole — is fair game: landing a peg there sends the resident rival back to holding.
// Run: node fasttrack/v2/test_v2_cuts.mjs   (from fasttrack/)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from './logic/rules.js';
import { createState, pegByPlayerN } from './logic/state.js';
import { calculateValidMoves } from './logic/moves.js';
import { applyMove } from './logic/apply.js';

const here = dirname(fileURLToPath(import.meta.url));
const R = loadRules(JSON.parse(readFileSync(join(here, '..', 'fasttrack.rules.json'), 'utf8')));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// A clean board with P1 to move. Spare pegs are parked in each player's OWN safe zone (off the
// track, and — crucially — not in holding) so holding has room: a cut then returns the victim to
// holding, the normal outcome. (With holding full the rules send a cut peg to its home hole instead,
// which is a separate fallback we are not exercising here.)
function clean() {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  for (const pg of s.pegs) pg.location = `safe-${pg.player}-${(pg.n % 4) + 1}`;
  s.turn.current = 1;
  return s;
}
const cut = (s) => pegByPlayerN(s, 0, 0);      // the rival (P0) victim
const mover = (s) => pegByPlayerN(s, 1, 0);    // the P1 attacker
function land(s, rank, dest, pred) {
  s.turn.card = { rank };
  const m = calculateValidMoves(s, R, { rank }).find(pred || ((mm) => mm.dest === dest));
  if (m) applyMove(s, R, m);
  return m;
}
const wentHome = (pg) => pg.location.startsWith('hold-');

console.log('\n== every non-safe hole is fair game for a cut ==');
{
  const s = clean(); cut(s).location = 'outer-2-3'; cut(s).hasCircuited = true; mover(s).location = 'outer-2-2';
  const m = land(s, 'A', 'outer-2-3');
  ok(!!m, 'OUTER TRACK: an opponent can land on a rival-occupied track hole');
  ok(m && wentHome(cut(s)), 'OUTER TRACK: the rival peg is cut back to holding');
}
{
  const s = clean(); cut(s).location = 'ft-2'; cut(s).onFastTrack = true; cut(s).hasCircuited = true; mover(s).location = 'side-right-1-4';
  const m = land(s, 'A', 'ft-2');
  ok(!!m, 'FAST TRACK: an opponent can land on a rival-occupied fast-track hole');
  ok(m && wentHome(cut(s)), 'FAST TRACK: the rival peg is cut back to holding');
}
{
  const s = clean(); cut(s).location = 'center'; cut(s).hasCircuited = true; mover(s).location = 'ft-0'; mover(s).onFastTrack = true;
  const m = land(s, 'A', 'center', (mm) => mm.type === 'enterBullseye');
  ok(!!m, 'BULLSEYE: an opponent can jump into the bullseye a rival occupies');
  ok(m && wentHome(cut(s)), 'BULLSEYE: the rival peg is cut back to holding');
}
{
  const s = clean(); cut(s).location = 'home-0'; cut(s).hasCircuited = true; mover(s).location = 'outer-0-3';
  const m = land(s, 'A', 'home-0');
  ok(!!m, 'HOME HOLE: an opponent can land on a rival home/winner hole');
  ok(m && wentHome(cut(s)), 'HOME HOLE: the rival peg is cut back to holding');
}

console.log('\n== the safe zone is the ONLY sanctuary — no opponent can ever reach it ==');
{
  const s = clean(); cut(s).location = 'safe-0-2'; mover(s).location = 'outer-0-1'; mover(s).hasCircuited = true;
  let reachable = false;
  for (const rank of ['A', '2', '3', '4', '5', '6', '7']) {
    if (calculateValidMoves(s, R, { rank }).some((mm) => String(mm.dest).startsWith('safe-0-'))) reachable = true;
  }
  ok(!reachable, 'SAFE ZONE: an opponent can NEVER land on your safe holes (cut-proof, owner-only)');
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════\n`);
process.exit(fail ? 1 : 0);
