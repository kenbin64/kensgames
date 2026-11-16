#!/usr/bin/env node
/**
 * ============================================================
 * ONE REAL DECK PER PLAYER (Ken, 2026-11-08)
 *
 *   "technically everyone should have their own deck"
 *   "Decks of cards should not just be turning random cards but actual decks
 *    that get exhausted and reshuffle when all cards are dealt"
 *
 * Checks, playing real turns through the engine:
 *   1. Every player starts with their own full deck of 54 (52 and two jokers).
 *   2. No card is ever lost: after every turn, each player's cards (deck, discard
 *      pile and any card in hand) are still exactly one full deck. This covers
 *      cards played, cards with no legal move and passed turns.
 *   3. A deck runs down card by card and is reshuffled from its own discard pile
 *      only when it is empty.
 *   4. Each player draws from their own deck, not a shared one.
 *   5. Two screens with the same seed deal the same decks (online play depends on it).
 *
 * Run: node fasttrack/test_player_decks.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log('\n-- ' + label + ' --'); }

const FULL = (() => {             // what one full deck holds, by card
  const m = {};
  for (const s of ['♠', '♥', '♦', '♣']) for (const v of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) m[v + s] = 1;
  m['🃏'] = 2;
  return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]]));
})();

// Every card belonging to one seat, wherever it is right now.
function cardsOf(g, seat) {
  const d = g.state.deck;
  const decks = d.get('decks');
  const loaded = d.get('activeSeat') === seat;
  const pile = loaded ? [...(d.get('cards') || []), ...(d.get('discard') || [])]
    : [...(decks[seat].cards || []), ...(decks[seat].discard || [])];
  const inHand = loaded && d.get('currentCard') && !d.get('spent') ? [d.get('currentCard')] : [];
  return [...pile, ...inHand];
}
function tally(cards) {
  const m = {};
  for (const c of cards) m[c.display] = (m[c.display] || 0) + 1;
  return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]]));
}

// One turn: draw, play the first legal move if there is one, otherwise pass.
// Solo, so the turn rotates at once (no animations headless).
function playTurn(g) {
  const seat = g.state.players.get('current');
  g.drawCard();
  const card = g.state.deck.get('currentCard');
  const vm = g.state.turn.get('validMoves') || [];
  if (vm.length) g.executeMove(0);
  // Finish the turn the way the game does after the pegs land.
  if (typeof g.sandbox.passTurn === 'function' && g.state.players.get('current') === seat) g.sandbox.passTurn('test');
  return { seat, card };
}

section('1. Every player starts with their own full deck');
const g = createEngine();
g.initGame(3, { sessionSeed: 'deck-test-1' });
const decks = g.state.deck.get('decks');
ok(Array.isArray(decks) && decks.length === 3, 'three players, three decks', `got ${decks && decks.length}`);
ok([0, 1, 2].every(s => tally(cardsOf(g, s)) === FULL), 'each deck is a full 54: every card once and two jokers');
ok(JSON.stringify(cardsOf(g, 0).map(c => c.display)) !== JSON.stringify(cardsOf(g, 1).map(c => c.display)),
  'the decks are shuffled separately (different orders)');

section('2. No card is ever lost, turn after turn');
const draws = { 0: [], 1: [], 2: [] };
let lost = '', reshuffles = { 0: 0, 1: 0, 2: 0 }, emptiedFirst = true;
for (let t = 0; t < 420; t++) {
  const seat = g.state.players.get('current');
  const before = g.state.deck.get('activeSeat') === seat ? (g.state.deck.get('cards') || []).length : (g.state.deck.get('decks')[seat].cards || []).length;
  const shufflesBefore = g.state.deck.get('decks')[seat].shuffles;
  const r = playTurn(g);
  if (r.card) draws[r.seat].push(r.card.display);
  const shufflesAfter = g.state.deck.get('decks')[seat].shuffles;
  if (shufflesAfter > shufflesBefore) { reshuffles[seat]++; if (before !== 0) emptiedFirst = false; }
  for (const s of [0, 1, 2]) if (!lost && tally(cardsOf(g, s)) !== FULL) lost = `turn ${t}, seat ${s}: ${cardsOf(g, s).length} cards`;
  if (g.state.meta.get('winner') != null) break;
}
ok(!lost, 'after every turn each player still has exactly one full deck', lost);

section('3. A deck runs out, then its own discard pile is reshuffled');
ok([0, 1, 2].every(s => reshuffles[s] >= 1), `every deck was used up and reshuffled (${JSON.stringify(reshuffles)})`);
ok(emptiedFirst, 'a reshuffle happens only when that deck is empty');
ok([0, 1, 2].every(s => tally(draws[s].slice(0, 54).map(d => ({ display: d }))) === FULL),
  'the first 54 cards each player drew are exactly one full deck, no repeats');

section('4. Each player draws from their own deck');
const g2 = createEngine();
g2.initGame(3, { sessionSeed: 'deck-test-1' });
const order = s => [...(g2.state.deck.get('activeSeat') === s ? g2.state.deck.get('cards') : g2.state.deck.get('decks')[s].cards)].reverse().map(c => c.display);
const expected = { 0: order(0), 1: order(1), 2: order(2) };   // top of each deck is the end of the array
ok([0, 1, 2].every(s => JSON.stringify(draws[s].slice(0, 54)) === JSON.stringify(expected[s])),
  'each player drew their own deck top to bottom');

section('5. The same seed deals the same decks on every screen');
const g3 = createEngine();
g3.initGame(3, { sessionSeed: 'deck-test-1' });
const g4 = createEngine();
g4.initGame(3, { sessionSeed: 'deck-test-2' });
const all = e => JSON.stringify([0, 1, 2].map(s => (e.state.deck.get('activeSeat') === s ? e.state.deck.get('cards') : e.state.deck.get('decks')[s].cards).map(c => c.display)));
ok(all(g2) === all(g3), 'same seed: identical decks');
ok(all(g2) !== all(g4), 'different seed: different decks');

// Ken, 2026-11-15: "verify that every deck has all cards including aces and jokers", "no
// duplicates", "shuffled at beginning of game and when deck is depleted".
section('6. Every player count, every deck: all 54, the aces and jokers, no duplicates, shuffled');
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const factoryOrder = JSON.stringify(g.sandbox.createDeck().map(c => c.display));
const deckOf = (e, s) => (e.state.deck.get('activeSeat') === s ? e.state.deck.get('cards') : e.state.deck.get('decks')[s].cards) || [];
let countProblem = '', shuffleProblem = '';
for (let players = 2; players <= 6; players++) {
  const e = createEngine();
  e.initGame(players, { sessionSeed: `deck-count-${players}` });
  for (let s = 0; s < players; s++) {
    const cards = deckOf(e, s);
    const where = `${players} players, seat ${s}`;
    const aces = cards.filter(c => c.value === 'A');
    const jokers = cards.filter(c => c.value === 'JOKER');
    const suited = cards.filter(c => c.value !== 'JOKER').map(c => c.value + c.suit);
    const missing = [];
    for (const r of RANKS) for (const su of SUITS) if (!suited.includes(r + su)) missing.push(r + su);
    if (!countProblem && cards.length !== 54) countProblem = `${where}: ${cards.length} cards`;
    if (!countProblem && (aces.length !== 4 || new Set(aces.map(c => c.suit)).size !== 4)) countProblem = `${where}: ${aces.length} aces`;
    if (!countProblem && jokers.length !== 2) countProblem = `${where}: ${jokers.length} jokers`;
    if (!countProblem && missing.length) countProblem = `${where}: missing ${missing.join(' ')}`;
    if (!countProblem && new Set(suited).size !== 52) countProblem = `${where}: a duplicate card`;
    if (!shuffleProblem && JSON.stringify(cards.map(c => c.display)) === factoryOrder) shuffleProblem = `${where}: still in factory order`;
  }
}
ok(!countProblem, 'each deck has 54: all 13 ranks in all 4 suits, 4 aces, 2 jokers, no duplicates (2 to 6 players)', countProblem);
ok(!shuffleProblem, 'each deck is shuffled at the start, never left in factory order (2 to 6 players)', shuffleProblem);

section('7. A depleted deck is really reshuffled, not put back in the order it was played');
{
  const e = createEngine();
  e.initGame(2, { sessionSeed: 'deck-reshuffle-order' });
  const d = e.state.deck;
  const seat = d.get('activeSeat');
  const played = [...deckOf(e, seat)];       // pretend every card was drawn and discarded in this order
  d.set('cards', []);
  d.set('discard', played.slice());
  const refilled = e.sandbox._refillDeckIfEmpty();
  const after = d.get('cards') || [];
  ok(refilled === true && (d.get('discard') || []).length === 0, 'an empty deck takes its whole discard pile back');
  ok(tally(after) === FULL, 'the reshuffled deck is still exactly one full deck');
  const same = JSON.stringify(after.map(c => c.display)) === JSON.stringify(played.map(c => c.display));
  const reversed = JSON.stringify(after.map(c => c.display)) === JSON.stringify(played.slice().reverse().map(c => c.display));
  ok(!same && !reversed, 'and its order is new: not the discard order, not that order reversed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
