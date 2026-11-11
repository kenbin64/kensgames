#!/usr/bin/env node
/**
 * ============================================================
 * ONLINE PLAY: A GUEST'S DECK RESHUFFLES ONCE AND STAYS FULL (Ken, 2026-11-10)
 *
 *   "fast track fix cards not reshuffling when it hits zero ... in multiplay"
 *   "it keeps showing the very last same card every time"
 *
 * The bug this guards: when a GUEST's deck ran out, the guest's screen
 * reshuffled its discard pile and drew, but the host's screen, replaying that
 * draw, never reshuffled its copy of the guest's deck. The host then published
 * its state (it does after every draw), and the guest took the host's EMPTY deck
 * back. Every later draw found an empty deck again and reshuffled the same
 * discard pile with the same seed, so the same card came up every time.
 *
 * Checks, with two players and the host publishing state after every change:
 *   1. The guest's deck reshuffles exactly once when it runs out, not on every draw.
 *   2. After that, the guest draws different cards, not the same one again.
 *   3. Both screens agree on the guest's deck size after every turn.
 *   4. No card is lost: the guest's cards are still exactly one full deck.
 *
 * Run: node fasttrack/test_mp_deck_reshuffle.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}

const GUEST = 1;

// ── Two screens and a relay, wired the way fasttrack-3d.js wires them ──────
function buildSession() {
  const ids = ['user-0', 'user-1'];
  const sessionPlayers = ids.map((id, i) => ({ user_id: id, username: `P${i}`, is_ai: false, is_host: i === 0, slot: i }));
  const queue = [];
  const seats = ids.map((id, i) => {
    const engine = createEngine();
    const client = { connected: true, isHost: i === 0, userId: id, session: { players: sessionPlayers }, sendGameState() {} };
    return { id, index: i, engine, client, isHost: i === 0 };
  });
  for (const seat of seats) {
    seat.client.sendAction = (action, payload) => queue.push({ kind: 'action', from: seat, action, payload });
    seat.engine.initGame(2, { sessionSeed: 'reshuffle-seed', launchMode: 'private', myUserId: seat.id, sessionPlayers });
    seat.engine.setMyUserId(seat.id);
    if (typeof seat.engine.updateSessionRoster === 'function') seat.engine.updateSessionRoster(sessionPlayers);
    seat.engine.setMultiplayerClient(seat.client);
  }
  // The host publishes its whole state after every draw, move and turn change.
  seats[0].engine.setStateCommittedHandler(() => queue.push({ kind: 'snapshot', from: seats[0], snap: seats[0].engine.getStateSnapshot() }));
  return { seats, queue };
}

function drain(seats, queue) {
  for (let guard = 0; queue.length && guard < 500; guard++) {
    const msg = queue.shift();
    for (const other of seats) {
      if (other === msg.from) continue;
      if (msg.kind === 'action') other.engine.applyRemoteAction(msg.action, msg.payload);
      else other.engine.applyStateSnapshot(msg.snap);
    }
  }
}

// A seat's deck as that screen holds it right now.
function deckOf(engine, seat) {
  const s = engine.state;
  if (s.deck.get('activeSeat') === seat) return { cards: s.deck.get('cards') || [], discard: s.deck.get('discard') || [] };
  const d = (s.deck.get('decks') || [])[seat] || {};
  return { cards: d.cards || [], discard: d.discard || [] };
}

// Run the guest's deck down to 2 cards on BOTH screens (the same change on each,
// so they still agree), so the test reaches the reshuffle in a few turns.
function runGuestDeckDown(seats) {
  for (const { engine } of seats) {
    const s = engine.state, current = s.players.get('current') || 0;
    engine.loadDeckFor(GUEST);
    const cards = s.deck.get('cards'), discard = s.deck.get('discard');
    discard.push(...cards.splice(0, cards.length - 2));
    s.deck.set('cards', cards); s.deck.set('discard', discard);
    engine.loadDeckFor(current);
  }
}

// ── Play ───────────────────────────────────────────────────────────────────
const { seats, queue } = buildSession();
runGuestDeckDown(seats);

const guestDraws = [];          // { card, left } as the guest's own screen saw each draw
let sizesAgree = true, sizeDetail = '';
let reshuffles = 0;
const origLog = console.log;

for (let turn = 0; turn < 40 && guestDraws.length < 10; turn++) {
  const s0 = seats[0].engine.state;
  const ci = s0.players.get('current') || 0;
  const actor = seats[ci];
  const s = actor.engine.state;

  console.log = () => {};       // keep the engine's own logging quiet
  try {
    // Only a turn that starts with no card in hand draws; a turn still finishing
    // its last card does not, and must not be counted as a second draw.
    const drew = !s.deck.get('currentCard');
    const before = ci === GUEST ? deckOf(actor.engine, GUEST).cards.length : 0;
    if (drew) actor.engine.drawCard();
    if (drew && ci === GUEST) {
      const c = s.deck.get('currentCard');
      const left = deckOf(actor.engine, GUEST).cards.length;
      if (left > before) reshuffles++;   // the pile grew back: that draw reshuffled
      guestDraws.push({ card: c && c.display, left });
    }
    const vm = s.turn.get('validMoves') || [];
    if (vm.length) actor.engine.executeMove(0); else actor.engine.endTurn();
    drain(seats, queue);
  } finally { console.log = origLog; }

  const a = deckOf(seats[0].engine, GUEST), b = deckOf(seats[1].engine, GUEST);
  if (sizesAgree && (a.cards.length !== b.cards.length || a.discard.length !== b.discard.length)) {
    sizesAgree = false;
    sizeDetail = `turn ${turn + 1}: host sees ${a.cards.length} left / ${a.discard.length} discarded, guest sees ${b.cards.length} / ${b.discard.length}`;
  }
}

console.log('ONLINE PLAY: GUEST DECK RESHUFFLE');
console.log('='.repeat(64));
console.log('  guest draws: ' + guestDraws.map(d => `${d.card}(${d.left} left)`).join(', '));

ok(guestDraws.length >= 6, 'the guest drew at least 6 cards', `drew ${guestDraws.length}`);
ok(reshuffles === 1, 'the guest\'s deck reshuffled exactly once', `reshuffled ${reshuffles} times`);

const afterRefill = guestDraws.slice(2);
const lefts = afterRefill.map(d => d.left);
ok(lefts.every((n, i) => i === 0 || n === lefts[i - 1] - 1), 'after the reshuffle the deck counts down one card per draw', `cards left: ${lefts.join(', ')}`);

const cardsAfter = afterRefill.map(d => d.card);
const repeats = cardsAfter.length - new Set(cardsAfter).size;
ok(repeats === 0, 'after the reshuffle the guest draws a different card every time', `cards: ${cardsAfter.join(', ')}`);

ok(sizesAgree, 'both screens agree on the guest\'s deck after every turn', sizeDetail);

for (const seat of seats) {
  const d = deckOf(seat.engine, GUEST);
  const s = seat.engine.state;
  const hand = s.deck.get('activeSeat') === GUEST && !s.deck.get('spent') && s.deck.get('currentCard') ? 1 : 0;
  const total = d.cards.length + d.discard.length + hand;
  ok(total === 54, `${seat.isHost ? 'host' : 'guest'} screen: the guest still has one full deck of 54`, `has ${total}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
