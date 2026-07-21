// tests/turn-sync.test.js
// Targets the exact turn bug that plagued multiplayer: AI seats getting extra turns on
// non-redraw cards, and turns being skipped for AI or humans. The v2 turn engine makes both
// impossible: extra turns come only from the redraw card set, and rotation is one uniform rule
// for AI and humans with no animation coupling. This proves it across a multi-seat game with AI.
// Run: node tests/turn-sync.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../logic/rules.js';
import { createState } from '../logic/state.js';
import { drawCard, legalMoves, playMove, forfeit, step } from '../logic/turn.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const REDRAW = ['A', '6', 'J', 'Q', 'K', 'JOKER'];
const NONREDRAW = ['2', '3', '4', '5', '7', '8', '9', '10'];

console.log('\n== a non-redraw card NEVER grants an extra turn (the AI-multiple-turns bug) ==');
let bad = [];
for (const rank of NONREDRAW) {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B', isAI: true }], seed: 5 }); s.turn.current = 0;
  s.turn.card = { rank };
  const r = forfeit(s, R);
  if (r.extraTurn !== false || s.turn.current !== 1) bad.push(rank);
}
ok(bad.length === 0, 'every non-redraw card (2,3,4,5,7,8,9,10) ends the turn and rotates, no extra turn');

console.log('\n== a redraw card ALWAYS grants an extra turn, same seat ==');
bad = [];
for (const rank of REDRAW) {
  const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B', isAI: true }], seed: 5 }); s.turn.current = 0;
  s.turn.card = { rank };
  const r = forfeit(s, R);
  if (r.extraTurn !== true || s.turn.current !== 0) bad.push(rank);
}
ok(bad.length === 0, 'every redraw card (A,6,J,Q,K,JOKER) keeps the same seat for another turn');

console.log('\n== full 4-seat game with AI: rotation is exact every step (no skip, no double) ==');
const s = createState({ rules: R, players: [{ name: 'P0' }, { name: 'AI1', isAI: true }, { name: 'P2' }, { name: 'AI3', isAI: true }], seed: 21 });
s.turn.current = 0;
const N = s.players.length;
let steps = 0, violations = 0, winner = null;
const acted = new Set();
const seq = [];
while (steps < 1200 && s.winner == null) {
  const p = s.turn.current;
  acted.add(p);
  drawCard(s);
  const rank = s.turn.card.rank;
  seq.push({ seat: p, redraw: REDRAW.includes(rank) });
  const moves = legalMoves(s, R);
  const res = moves.length ? playMove(s, R, moves[0]) : forfeit(s, R);
  steps++;
  if (res && res.winner != null) { winner = res.winner; break; }
  const expected = REDRAW.includes(rank) ? p : (p + 1) % N;
  if (s.turn.current !== expected) violations++;
}
ok(violations === 0, `over ${steps} steps, the acting seat was correct every time (redraw stays, else next), 0 violations`);
ok(acted.size === N || winner != null, `every seat took turns (acted: ${[...acted].sort().join(',')})`);

// Local-play failure modes, by name.
let illegalMulti = 0, skips = 0;
for (let i = 1; i < seq.length; i++) {
  const prev = seq[i - 1], cur = seq[i];
  if (cur.seat === prev.seat) { if (!prev.redraw) illegalMulti++; }      // a second turn in a row only after a redraw
  else if (cur.seat !== (prev.seat + 1) % N) skips++;                    // a seat change must land on the very next seat
}
ok(illegalMulti === 0, 'no seat ever takes a second turn in a row except after a redraw (no illegal multi-turns)');
ok(skips === 0, 'when the seat changes it always advances to the very next seat (no skipped seats)');
console.log('  INFO ' + steps + ' steps, ' + (winner != null ? 'seat ' + winner + ' won' : 'no winner within cap') + '; AI seats followed the same rule as humans');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
