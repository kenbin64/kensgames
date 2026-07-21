// tests/turn.test.js
// The render-decoupled turn engine: draw, extra-turn-by-card-membership, rotate, forfeit, and a
// full game loop that runs end to end with no animation gating (the turn fix as architecture):
// it never hangs, never skips, the player index stays valid, and the 54-card deck is conserved.
// Run: node tests/turn.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../logic/rules.js';
import { createState, pegByPlayerN } from '../logic/state.js';
import { drawCard, playMove, forfeit, step } from '../logic/turn.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const game = () => { const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }], seed: 9 }); s.turn.current = 0; return s; };
const deckTotal = (s) => s.deck.drawPile.length + s.deck.discardPile.length + (s.turn.card ? 1 : 0);

console.log('\n== draw takes one card from the deck ==');
let s = game();
const before = s.deck.drawPile.length;
drawCard(s);
ok(s.turn.card && s.deck.drawPile.length === before - 1 && s.turn.phase === 'play', 'drawing pulls one card and enters the play phase');

console.log('\n== a redraw card keeps the turn, a plain card passes it ==');
s = game(); s.turn.card = { rank: 'A' };
let r = playMove(s, R, { type: 'move', peg: 4, from: 'home-0', dest: 'side-right-0-1', path: ['side-right-0-1'], steps: 1 });
ok(r.extraTurn === true && s.turn.current === 0, 'an Ace grants an extra turn for the same player');
s = game(); s.turn.card = { rank: '2' };
r = playMove(s, R, { type: 'move', peg: 4, from: 'home-0', dest: 'side-right-0-2', path: ['side-right-0-1', 'side-right-0-2'], steps: 2 });
ok(r.extraTurn === false && s.turn.current === 1, 'a 2 ends the turn and rotates to the next player');

console.log('\n== forfeit (no legal move) still grants the redraw for redraw cards ==');
s = game(); s.turn.card = { rank: '2' };
ok(forfeit(s, R).extraTurn === false && s.turn.current === 1, 'forfeiting a 2 ends the turn');
s = game(); s.turn.card = { rank: 'K' };
ok(forfeit(s, R).extraTurn === true && s.turn.current === 0, 'forfeiting a K still grants the extra turn');

console.log('\n== a full game loop runs with no hang, no skip, valid rotation, deck conserved ==');
s = game();
let steps = 0, threw = false, badIndex = false, badDeck = false, winner = null, rotated = false;
try {
  while (steps < 600) {
    const res = step(s, R);
    steps++;
    if (s.turn.current !== 0 && s.turn.current !== 1) badIndex = true;
    if (deckTotal(s) !== 54) badDeck = true;
    if (s.turn.current === 1) rotated = true;
    if (res && res.winner != null) { winner = res.winner; break; }
  }
} catch (e) { threw = true; console.log('  threw: ' + e.message); }
ok(!threw, 'the loop runs end to end without throwing');
ok(!badIndex, 'the current player index stays valid every step (no skip into nowhere)');
ok(!badDeck, 'the 54-card deck is conserved at every step (draw + discard + hand)');
ok(rotated, 'play rotated to the other player at least once');
console.log('  INFO ran ' + steps + ' steps' + (winner != null ? ', player ' + winner + ' won' : ', no winner within the cap (fine for first-move AI)'));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
