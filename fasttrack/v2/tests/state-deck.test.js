// tests/state-deck.test.js
// Phase 1 foundation: the deck builds and shuffles deterministically and conserves
// all 54 cards across draws and reshuffles; the state lays out players and pegs
// exactly as the rules document specifies. Headless, pure.
// Run: node tests/state-deck.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../logic/rules.js';
import { buildOrderedDeck, shuffleWith, createDeck, draw, discard, totalInDeck } from '../logic/deck.js';
import { createState, pegsOf, occupantOf } from '../logic/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n== deck: built from the source of truth ==');
const ordered = buildOrderedDeck(R);
ok(ordered.length === 54, 'deck has 54 cards (52 + 2 jokers)');
ok(ordered.filter((c) => c.rank === 'JOKER').length === 2, 'exactly 2 jokers');
ok(['hearts', 'diamonds', 'clubs', 'spades'].every((s) => ordered.filter((c) => c.suit === s).length === 13), 'each suit has 13 cards');

console.log('\n== deck: deterministic shuffle ==');
ok(JSON.stringify(shuffleWith(ordered, 42)) === JSON.stringify(shuffleWith(ordered, 42)), 'same seed gives the same order');
ok(JSON.stringify(shuffleWith(ordered, 42)) !== JSON.stringify(shuffleWith(ordered, 43)), 'different seed gives a different order');

console.log('\n== deck: conservation across draws and reshuffle ==');
const deck = createDeck(R, 7);
ok(deck.drawPile.length === 54 && deck.discardPile.length === 0, 'fresh deck: 54 to draw, 0 discarded');
const drawnIds = new Set();
for (let i = 0; i < 54; i++) { const c = draw(deck); drawnIds.add(c.id); discard(deck, c); }
ok(drawnIds.size === 54, 'drawing 54 yields all 54 distinct cards (no loss, no duplicate)');
ok(deck.drawPile.length === 0 && deck.discardPile.length === 54, 'after 54 draws: draw pile empty, 54 discarded');
const c55 = draw(deck);
ok(c55 != null && deck.reshuffles === 1, 'drawing past exhaustion reshuffles the discard pile deterministically');
ok(totalInDeck(deck) === 53 && deck.discardPile.length === 0, 'after reshuffle: 53 in draw pile, 1 in hand, 0 discarded');

console.log('\n== state: starting layout matches the rules ==');
const s = createState({ rules: R, players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isAI: true }, { name: 'D' }], seed: 5 });
ok(s.pegs.length === 20, '4 players x 5 pegs = 20 pegs');
const p0 = pegsOf(s, 0);
ok(p0.length === 5, 'player 0 has 5 pegs');
ok(p0.filter((pg) => pg.location.startsWith('hold-0-')).length === 4, 'player 0 has 4 pegs in holding');
ok(p0.filter((pg) => pg.location === 'home-0').length === 1, 'player 0 has 1 peg on the home hole (the 5th-peg start)');
ok(occupantOf(s, 'hold-0-1') != null && occupantOf(s, 'home-0') != null, 'occupancy resolves holding and home holes');
ok(occupantOf(s, 'outer-0-1') === null, 'no peg starts on the outer track');
ok(s.deck.drawPile.length === 54, 'state seeds a full 54-card deck');
ok(s.turn.current === 0 && s.turn.phase === 'draw' && s.winner === null, 'turn starts at player 0, phase draw, no winner');

console.log('\n== state: player-count bounds ==');
let tooFew = false, tooMany = false;
try { createState({ rules: R, players: [{ name: 'solo' }] }); } catch (_) { tooFew = true; }
try { createState({ rules: R, players: Array.from({ length: 7 }, (_, i) => ({ name: 'p' + i })) }); } catch (_) { tooMany = true; }
ok(tooFew, '1 player is rejected (min 2)');
ok(tooMany, '7 players is rejected (max 6)');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
