// tests/netcode-determinism.test.js
// The foundation of stable peer multiplayer: the engine is a deterministic function of the seed
// plus the ordered move deltas. Same seed and same choices give byte-identical games (so two
// clients stay in lockstep), and replaying a recorded delta stream onto a fresh same-seed state
// reproduces the game exactly (so the delta log is also the netcode stream and the resync).
// Run: node tests/netcode-determinism.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../engine/rules.js';
import { createState } from '../engine/state.js';
import { drawCard, legalMoves, playMove, forfeit } from '../engine/turn.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const snapshot = (s) => JSON.stringify({ pegs: s.pegs, winner: s.winner, current: s.turn.current });

// Play a game with the deterministic first-move chooser, recording the delta stream.
function recordGame(seed) {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed }); s.turn.current = 0;
  const log = []; let steps = 0;
  while (steps < 800 && s.winner == null) {
    drawCard(s);
    const moves = legalMoves(s, R);
    const move = moves.length ? moves[0] : null;
    log.push({ rank: s.turn.card.rank, move });
    if (move) playMove(s, R, move); else forfeit(s, R);
    steps++;
  }
  return { snap: snapshot(s), log, steps, winner: s.winner };
}

// Replay a recorded delta stream onto a fresh same-seed state (what a joining/reconnecting peer does).
function replay(seed, log) {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed }); s.turn.current = 0;
  for (const entry of log) {
    drawCard(s);                                  // deterministic deck: draws the same card
    if (entry.move) playMove(s, R, entry.move); else forfeit(s, R);
  }
  return snapshot(s);
}

console.log('\n== determinism: same seed + same choices give identical games ==');
const a = recordGame(123);
const b = recordGame(123);
ok(a.snap === b.snap && a.steps === b.steps, `two runs from seed 123 are byte-identical (${a.steps} steps, winner ${a.winner})`);

console.log('\n== lockstep / resync: replaying the delta stream reproduces the game exactly ==');
ok(replay(123, a.log) === a.snap, 'a peer replaying the seed + delta stream reaches the identical state');

console.log('\n== a different seed gives a different game (the seed actually drives it) ==');
const c = recordGame(987);
ok(c.snap !== a.snap, 'seed 987 produces a different game than seed 123');

console.log('\n== holds across several seeds (no hidden nondeterminism) ==');
let allDet = true;
for (const seed of [1, 2, 42, 777, 31337]) { if (recordGame(seed).snap !== recordGame(seed).snap) allDet = false; }
ok(allDet, 'every tested seed replays identically twice');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
