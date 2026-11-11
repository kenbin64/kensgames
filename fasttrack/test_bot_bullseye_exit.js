#!/usr/bin/env node
/**
 * ============================================================
 * BOTS LEAVE THE BULLSEYE ON A JACK, QUEEN OR KING
 *
 * Ken, 2026-11-11: "bots in both solo and multi player are not leaving the
 * bullseye when they draw a jack, queen, or king."
 *
 * Cause: the bot scored exitBullseye at -80, and a J, Q or K is also a
 * "move 1" card for every other peg, so some other move always won and the
 * bot sat in the bullseye for the rest of the game.
 *
 * Checked here with the real botTurn, every difficulty, every face card:
 *   1. with another peg free to move 1, the bot still leaves the bullseye,
 *      and goes to its OWN fast-track hole (the one that leads home)
 *   2. when another player's peg sits on a fast-track hole, the bot leaves
 *      onto it and sends it home: hard and expert always, easy never (it only
 *      cuts as a last resort), normal by the peg's personality
 *
 * Run: node fasttrack/test_bot_bullseye_exit.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

const NL = String.fromCharCode(10);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function section(label) { console.log(NL + '-- ' + label + ' --'); }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Put a peg on a hole, keeping the board and the peg in step.
function place(g, playerIdx, peg, hole) {
  peg.holeId = hole;
  peg.holeType = g.getHoleType(hole);
  g.state.board.set(hole, { playerIdx, pegId: peg.id });
}

// Bot (seat 0) has one peg in the bullseye and one on the outer track that a
// face card could move 1 instead. Optionally an opponent peg sits on a
// fast-track hole the bot could land on.
function stage(difficulty, face, preyHole) {
  const g = createEngine();
  g.initGame(2, { sessionSeed: `bull-${difficulty}-${face}-${preyHole || 'none'}` });
  const list = g.state.players.get('list') || [];
  const me = list[0], foe = list[1];
  me.isBot = true; me.aiDifficulty = difficulty;
  foe.isBot = false;

  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  g.state.board.set('bullseye', null);
  for (const pl of list) for (const pg of pl.pegs) {
    pg.holeId = 'holding'; pg.holeType = 'holding';
    pg.onFasttrack = false; pg.eligibleForSafeZone = false;
  }

  place(g, 0, me.pegs[0], 'bullseye');
  place(g, 0, me.pegs[1], 'outer-3-1');          // free to move 1 instead
  if (preyHole) place(g, 1, foe.pegs[0], preyHole);

  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  const card = Object.assign({}, g.CARDS[face], { value: face, display: face + 'S', suit: 'S' });
  g._drawCardCommit(card);
  return { g, me, foe };
}

(async () => {
  console.log('BOTS LEAVE THE BULLSEYE');
  console.log('='.repeat(62));

  section('1. A face card takes the peg out of the bullseye, to its own fast-track hole');
  for (const difficulty of ['easy', 'normal', 'hard', 'expert']) {
    for (const face of ['J', 'Q', 'K']) {
      const s = stage(difficulty, face, null);
      const offered = (s.g.state.turn.get('validMoves') || []).some(m => m.type === 'exitBullseye');
      s.g.botTurn();
      await wait(2200);                       // botTurn runs behind its think and decide timers
      const at = s.me.pegs[0].holeId;
      const own = `ft-${s.me.boardPosition}`;
      ok(offered && at === own, `${difficulty} ${face}: leaves the bullseye to ${own}`,
         `offered=${offered}, peg ended at ${at}`);
    }
  }

  section("2. Leaving onto another player's peg on a fast-track hole sends it home");
  // normal weighs the cut against heading home by the peg's personality, so
  // either choice is right for it (null); hard and expert hunt, easy avoids.
  for (const [difficulty, shouldCut] of [['easy', false], ['normal', null], ['hard', true], ['expert', true]]) {
    // Bot sits at board position 0; ft-3 is another player's fast-track hole.
    const s = stage(difficulty, 'K', 'ft-3');
    s.g.botTurn();
    await wait(2200);
    const left = s.me.pegs[0].holeId !== 'bullseye';
    const cut = s.foe.pegs[0].holeId !== 'ft-3';
    ok(left, `${difficulty}: leaves the bullseye`, `peg ended at ${s.me.pegs[0].holeId}`);
    if (shouldCut !== null) {
      ok(cut === shouldCut, `${difficulty}: ${shouldCut ? 'takes' : 'passes up'} the cut on ft-3`,
         `bot peg at ${s.me.pegs[0].holeId}, opponent peg at ${s.foe.pegs[0].holeId}`);
    }
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
