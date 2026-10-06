#!/usr/bin/env node
/**
 * ============================================================
 * UNDO (grace window)
 *
 * Testers: making a move is clunky, and a mis-tap costs the turn.
 *
 * A human's move now plays at once, and when the pegs have landed an Undo
 * button stays up for a few seconds. Untouched, the turn passes by itself.
 *
 * What must hold, and is checked here against the real engine:
 *   1. The turn is held while the offer is open, then passes on its own.
 *   2. Undo puts the game back EXACTLY as it was: pegs, card, discard pile and
 *      the same legal moves, on the same seat.
 *   3. An undone move can never end the turn later (its resolve is stale).
 *   4. "Keep" ends the wait at once.
 *   5. Undo never crosses a card draw: once the window closes it is gone.
 *   6. Bots get no window, and with no screen to show a button there is none.
 *
 * Run: node fasttrack/test_undo_move.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A game where every seat is human, with a stand-in for the screen's Undo
// button so the engine opens the window. Returns the offer's visible state too.
function newGame(seed, { withScreen = true, bots = false } = {}) {
  const g = createEngine();
  g.initGame(3, { sessionSeed: seed });
  const S = g.sandbox;
  S.window.isPlayResolving = () => false;
  const players = g.state.players.get('list');
  players.forEach((p) => { p.isBot = bots; });
  g.state.players.set('list', players);
  const screen = { shown: 0, hidden: 0, open: false };
  if (withScreen) {
    S.window.showUndoOffer = () => { screen.shown++; screen.open = true; };
    S.window.hideUndoOffer = () => { screen.hidden++; screen.open = false; };
  }
  return { g, S, screen };
}

// Draw until the current seat holds a card with at least one legal move.
// Seats with no move pass on their own; give that time to happen.
async function drawUntilMove(g) {
  for (let tries = 0; tries < 80; tries++) {
    if (g.state.turn.get('phase') === 'draw') g.drawCard();
    const vm = g.state.turn.get('validMoves') || [];
    if (g.state.turn.get('phase') === 'move' && vm.length > 0) return vm;
    await sleep(150);
  }
  throw new Error('never reached a card with a legal move');
}

// The offer opens when the pegs have landed AND any cutscene has finished, so
// how long that takes depends on the move. Wait for it instead of guessing.
async function untilOffered(S) {
  for (let waited = 0; waited < 30000; waited += 100) {
    if (S.canUndoMove()) return true;
    await sleep(100);
  }
  return false;
}

// Everything undo promises to restore, as one comparable string.
function picture(g) {
  const players = g.state.players.get('list').map((p) => p.pegs.map((q) =>
    [q.holeId, !!q.onFasttrack, !!q.eligibleForSafeZone, !!q.lockedToSafeZone, !!q.mustExitFasttrack]));
  const card = g.state.deck.get('currentCard');
  return JSON.stringify({
    seat: g.state.players.get('current'),
    phase: g.state.turn.get('phase'),
    card: card && card.display,
    discard: (g.state.deck.get('discard') || []).length,
    moves: (g.state.turn.get('validMoves') || []).map((m) => [m.type, m.pegIdx, m.dest]),
    players,
  });
}

(async () => {
  console.log('UNDO MOVE');
  console.log('='.repeat(62));

  section('1. The turn is held while the offer is open, then passes by itself');
  {
    const { g, S, screen } = newGame('undo-1');
    await drawUntilMove(g);
    const seat = g.state.players.get('current');
    const epoch = S._getTurnEpoch();
    g.executeMove(0);
    await untilOffered(S);
    ok(screen.open === true, 'the Undo offer is shown once the move has landed');
    ok(S.canUndoMove() === true, 'the engine says the move can be taken back');
    ok(g.state.players.get('current') === seat && S._getTurnEpoch() === epoch,
      'the turn is still this seat\'s while the offer is open');
    await sleep(4300);
    ok(screen.open === false, 'the offer closes when the time runs out');
    ok(S._getTurnEpoch() !== epoch, 'and the turn moves on with nobody pressing anything');
    ok(S.canUndoMove() === false, 'after that the move can no longer be taken back');
    ok(S.undoMove() === false, 'a late undo does nothing');
  }

  section('2. Undo puts everything back exactly');
  {
    const { g, S, screen } = newGame('undo-2');
    await drawUntilMove(g);
    const before = picture(g);
    g.executeMove(0);
    ok(picture(g) !== before, 'the move really changed the game');
    for (let w = 0; w < 30000 && S.isTableBusy(); w += 100) await sleep(100);
    await sleep(300);
    ok(S.undoMove() === true, 'undo is accepted after the pegs have landed');
    ok(picture(g) === before, 'pegs, card, discard pile, legal moves and seat are all as before',
      NL + '    before ' + before + NL + '    after  ' + picture(g));
    ok(screen.open === false, 'the offer is gone after undoing');

    section('3. An undone move can never end the turn later');
    const seat = g.state.players.get('current');
    await sleep(4600);
    ok(g.state.players.get('current') === seat && g.state.turn.get('phase') === 'move',
      'well past the window, it is still this seat\'s move with the same card');

    // And the player can now make a move again, with a fresh window.
    g.executeMove(0);
    ok(await untilOffered(S), 'the replacement move gets its own undo window');
  }

  section('3b. Undo pressed while the peg is still travelling');
  {
    const { g, S, screen } = newGame('undo-2');   // this seed's first move enters the fast track (a cutscene)
    let moving = false;
    S.window.isPlayResolving = () => moving;
    // Stand in for the renderer: it calls back only when the pegs have landed.
    S.window.waitForAnimations = (cb) => { const t = setInterval(() => { if (!moving) { clearInterval(t); cb(); } }, 20); };
    let scenesPlayed = 0;
    const realPlayNext = S.CutsceneManager.playNext;
    S.CutsceneManager.playNext = function () { if (this.queue.length) scenesPlayed++; return realPlayNext.call(this); };
    await drawUntilMove(g);
    const before = picture(g);
    const seat = g.state.players.get('current');
    moving = true;
    g.executeMove(0);
    ok(screen.open === true, 'the Undo button is up the moment the move starts');
    ok(S.undoMove() === true, 'undo is accepted mid-move');
    ok(picture(g) !== before, 'but nothing is restored under a moving peg');
    ok(S.undoMove() === false, 'a second press does nothing more');
    await sleep(600);
    ok(picture(g) !== before, 'still waiting while the peg travels');
    moving = false;
    await sleep(600);
    ok(picture(g) === before, 'the moment the peg lands, everything is back as it was');
    ok(scenesPlayed === 0, 'the fast track cutscene for the undone move never plays',
      `${scenesPlayed} played`);
    ok(screen.open === false, 'the button is gone');
    await sleep(4600);
    ok(g.state.players.get('current') === seat && g.state.turn.get('phase') === 'move',
      "and the turn is still this seat's, with the card back in hand");
  }

  section('4. Keep ends the wait at once');
  {
    const { g, S, screen } = newGame('undo-4');
    await drawUntilMove(g);
    const epoch = S._getTurnEpoch();
    g.executeMove(0);
    await untilOffered(S);
    ok(S.keepMove() === true, 'keep is accepted while the offer is open');
    await sleep(400);
    ok(S._getTurnEpoch() !== epoch, 'the turn moves on straight away');
    ok(screen.open === false, 'and the offer closes');
  }

  section('5. Undo never crosses a card draw');
  {
    const { g, S } = newGame('undo-5');
    await drawUntilMove(g);
    g.executeMove(0);
    await untilOffered(S);
    S.keepMove();
    await sleep(400);
    await drawUntilMove(g);          // some seat has now drawn a new card
    ok(S.canUndoMove() === false, 'with a new card on the table, the earlier move is locked');
    ok(S.undoMove() === false, 'undo is refused');
  }

  section('6. No window for bots, or when there is no screen');
  {
    const a = newGame('undo-6a', { withScreen: false });
    await drawUntilMove(a.g);
    const epochA = a.S._getTurnEpoch();
    a.g.executeMove(0);
    ok(a.S.canUndoMove() === false, 'no screen: no undo is armed');
    for (let w = 0; w < 30000 && a.S.isTableBusy(); w += 100) await sleep(100);
    await sleep(500);
    ok(a.S._getTurnEpoch() !== epochA, 'and the turn passes as soon as the table is quiet, with no added wait');

    const b = newGame('undo-6b', { bots: true });
    // Bots play by themselves; just confirm none of their moves ever opened an offer.
    await sleep(3000);
    ok(b.screen.shown === 0, 'bots never get an undo window', `shown ${b.screen.shown} times`);
  }

  console.log(NL + '='.repeat(62));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(62));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
