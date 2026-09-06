#!/usr/bin/env node
/**
 * ============================================================
 * A TURN IS NOT OVER UNTIL THE PLAYER HAS FINISHED MOVING
 *
 * Reported as: "it is switching turns while the other player is still moving",
 * and "turns should not be relinquished until player has completed all moves
 * and any cut scenes have been completed".
 *
 * State changes the instant a move is applied, but the peg does not: it hops
 * across the board over the following second, and a cut or bullseye cutscene
 * plays after that. A turn machine that rotates when the move LANDS hands the
 * table to the next player while the previous one is still visibly moving.
 *
 * Measured in a real browser at four and six seats: every single mid-motion
 * turn change came through ONE line, the bot's no-legal-move forfeit, which
 * called endTurn directly and so was the only relinquish path that never
 * consulted the animation state. After routing it through resolveTurn the same
 * measurement reported zero, on both builds.
 *
 * The same line was also eating a rule: A, 6, J, Q, K and JOKER grant a redraw
 * EVERY time they are drawn, including when they produce no legal move. Humans
 * already got that redraw because their no-move path went through resolveTurn.
 * Bots rotated instead, so they silently lost it.
 *
 * Run: node fasttrack/test_turn_settle.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('TURN SETTLE');
console.log('='.repeat(62));

(async () => {

  // ───────────────────────────────────────────────────────────
  section('1. The rule holds back a turn while the table reports busy');
  {
    const g = createEngine();
    g.initGame(4, { sessionSeed: 'settle-1' });
    const S = g.sandbox;

    // Stand in for the renderer. This is the exact signal the 3D layer
    // publishes while pegs are hopping, so driving it by hand tests the real
    // gate rather than a copy of it.
    let moving = true;
    S.window.isPlayResolving = () => moving;

    ok(S.isTableBusy() === true, 'a moving peg makes the table report busy');

    const seatBefore = g.state.players.get('current');
    S.resolveTurn(S._getTurnEpoch());
    await sleep(300);
    ok(g.state.players.get('current') === seatBefore,
      'the turn does NOT rotate while a peg is still moving',
      `seat ${seatBefore} -> ${g.state.players.get('current')}`);

    // And it must not be a freeze: the moment motion stops, it goes.
    moving = false;
    ok(S.isTableBusy() === false, 'the table reports idle once motion stops');
    await sleep(500);
    ok(g.state.players.get('current') !== seatBefore,
      'the turn rotates on its own as soon as the peg lands',
      `still on seat ${g.state.players.get('current')}`);
  }

  // ───────────────────────────────────────────────────────────
  section('2. A cutscene holds the turn back too');
  {
    const g = createEngine();
    g.initGame(4, { sessionSeed: 'settle-2' });
    const S = g.sandbox;
    S.window.isPlayResolving = () => false;

    const CM = S.CutsceneManager;
    CM.isPlaying = true;
    ok(S.isTableBusy() === true, 'a playing cutscene makes the table report busy');

    const seatBefore = g.state.players.get('current');
    S.resolveTurn(S._getTurnEpoch());
    await sleep(300);
    ok(g.state.players.get('current') === seatBefore,
      'the turn waits for the cutscene to finish',
      `seat ${seatBefore} -> ${g.state.players.get('current')}`);

    CM.isPlaying = false;
    await sleep(500);
    ok(g.state.players.get('current') !== seatBefore,
      'and goes once the cutscene is done');
  }

  // ───────────────────────────────────────────────────────────
  section('3. A wedged animation can never freeze the table forever');
  {
    // The ceiling is the difference between "patient" and "hung". Verified by
    // reading the constant rather than by waiting 45 seconds for it.
    const src = fs.readFileSync(path.join(__dirname, 'fasttrack-game-core.js'), 'utf8');
    const m = src.match(/const TURN_SETTLE_CEILING_MS = (\d+);/);
    ok(!!m, 'there is a hard ceiling on how long a turn may wait');
    ok(m && Number(m[1]) > 0 && Number(m[1]) <= 60000,
      'the ceiling is a sane length', m && m[1]);
    ok(/settle ceiling reached/.test(src),
      'reaching the ceiling is logged loudly, because it means something is wedged');
  }

  // ───────────────────────────────────────────────────────────
  section('4. Every relinquish path goes through the gate');
  {
    const src = fs.readFileSync(path.join(__dirname, 'fasttrack-game-core.js'), 'utf8');

    // The bot forfeit was the one path that skipped it. In a four seat game it
    // is also the most common way a turn ends, which is why it accounted for
    // every violation that was measured.
    const at = src.indexOf('Bot has no valid moves');
    const forfeit = src.slice(at, at + 3200);
    ok(at > 0, 'the bot forfeit path is where the tests say it is');
    ok(/resolveTurn\(_botEpoch\)/.test(forfeit),
      'the bot no-move forfeit resolves the turn rather than rotating it directly');
    ok(!/endTurn\(_botEpoch\)/.test(forfeit),
      'it no longer calls endTurn, which bypassed the animation check');

    ok(/function resolveTurn\(epoch, waitedMs\)/.test(src),
      'resolveTurn is the place the waiting happens, so no caller can forget it');
    ok(/if \(_isTableBusy\(\)\) \{/.test(src),
      'and it actually consults the table before letting the turn go');
  }

  // ───────────────────────────────────────────────────────────
  section('5. The redraw rule now applies to bots as well as humans');
  {
    // "If a player draws an Ace, 6, Jack, Queen, King, Joker they get a redraw
    //  every time they draw one of those cards" and "yes if there is no legal
    //  move but one of those cards is drawn they still get a redraw."
    const g = createEngine();
    g.initGame(4, { sessionSeed: 'redraw-bot' });
    const S = g.sandbox;
    S.window.isPlayResolving = () => false;

    const REDRAW = ['A', '6', 'J', 'Q', 'K', 'JOKER'];
    for (const value of REDRAW) {
      const seat = g.state.players.get('current');
      g.state.deck.set('currentCard', { id: 'test-' + value, value, display: value });
      g.state.turn.set('validMoves', []);          // no legal move, deliberately
      S.resolveTurn(S._getTurnEpoch());
      await sleep(60);
      ok(g.state.players.get('current') === seat,
        `a ${value} with no legal move keeps the same seat for a redraw`,
        `seat moved ${seat} -> ${g.state.players.get('current')}`);
    }

    // A card that grants no redraw must still rotate, or the table would stop.
    const seat = g.state.players.get('current');
    const n = (g.state.players.get('list') || []).length;
    g.state.deck.set('currentCard', { id: 'test-3', value: '3', display: '3' });
    g.state.turn.set('validMoves', []);
    S.resolveTurn(S._getTurnEpoch());
    await sleep(60);
    ok(g.state.players.get('current') === (seat + 1) % n,
      'an ordinary card with no legal move still passes the turn on',
      `seat ${seat} -> ${g.state.players.get('current')}`);
  }

  console.log(NL + '='.repeat(62));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(62));
  if (fail) {
    console.log(NL + 'Failures:');
    failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
    process.exit(1);
  }
  process.exit(0);

})();
