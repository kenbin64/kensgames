#!/usr/bin/env node
/**
 * BOTS AND THE BULLSEYE FROM THEIR OWN FAST-TRACK HOLE (Ken, 2026-11-15)
 *
 * A one-step card can now take a fast-track peg into the bullseye from its own ft hole. From
 * there the peg is one step from its home stretch, so Ken calls it "a bone headed move ... but
 * if you need to take someone's peg out it can be strategic."
 *
 * Checked with the real botTurn (Ken, 2026-11-15: cut only to stop a win):
 *   1. bullseye empty: no difficulty takes it; the bot heads for its home stretch
 *   2. an opponent in the bullseye who is not about to win: every bot heads home instead
 *   3. an opponent in the bullseye whose safe zone is full: hard and expert take the cut; easy never (it only cuts
 *      as a last resort and the home-stretch move exists); normal goes by personality
 *
 * Run: node fasttrack/test_bot_bullseye_own_ft.js
 */
const { createEngine } = require('./engine/headless');

let pass = 0, fail = 0;
const ok = (condition, name, detail = '') => {
  if (condition) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function place(game, playerIdx, peg, hole) {
  peg.holeId = hole;
  peg.holeType = game.getHoleType(hole);
  game.state.board.set(hole, { playerIdx, pegId: peg.id });
}

// Bot (seat 0) has one peg with fast-track status on its own ft hole. Optionally an opponent
// peg sits in the bullseye, and optionally that opponent's safe zone is full (so the bullseye
// peg is their last one out and leaving the bullseye would take it home to win).
function stage(difficulty, face, opponentInBullseye, opponentAboutToWin = false) {
  const game = createEngine();
  game.initGame(2, { sessionSeed: `own-ft-${difficulty}-${face}-${opponentInBullseye}` });
  const list = game.state.players.get('list') || [];
  const me = list[0], foe = list[1];
  me.isBot = true; me.aiDifficulty = difficulty;
  foe.isBot = false;
  for (const h of game.CLOCKWISE_TRACK) game.state.board.set(h, null);
  game.state.board.set('bullseye', null);
  for (const pl of list) for (const pg of pl.pegs) {
    pg.holeId = 'holding'; pg.holeType = 'holding'; pg.onFasttrack = false; pg.eligibleForSafeZone = false;
  }
  const ownFt = `ft-${me.boardPosition}`;
  place(game, 0, me.pegs[0], ownFt);
  me.pegs[0].onFasttrack = true;
  me.pegs[0].fasttrackEntryHole = ownFt;
  if (opponentInBullseye) place(game, 1, foe.pegs[0], 'bullseye');
  if (opponentAboutToWin) {
    for (let h = 1; h <= 4; h++) place(game, 1, foe.pegs[h], `safe-${foe.boardPosition}-${h}`);
  }
  game.state.players.set('current', 0);
  game.state.turn.set('phase', 'move');
  const card = Object.assign({}, game.CARDS[face], { value: face, display: face + 'S', suit: 'S' });
  game._drawCardCommit(card);
  return { game, me, foe };
}

(async () => {
  console.log('\n-- 1. bullseye empty: no bot throws away its home stretch --');
  for (const difficulty of ['easy', 'normal', 'hard', 'expert']) {
    for (const face of ['A', 'K']) {
      const s = stage(difficulty, face, false);
      const offered = (s.game.state.turn.get('validMoves') || []).some(m => m.type === 'enterBullseye');
      s.game.botTurn();
      await wait(2200);                        // botTurn runs behind its think and decide timers
      ok(offered && s.me.pegs[0].holeId !== 'bullseye', `${difficulty} ${face}: offered the bullseye, did not take it`,
        `offered=${offered}, peg ended at ${s.me.pegs[0].holeId}`);
    }
  }

  console.log('\n-- 2. an opponent in the bullseye who is NOT about to win: head for the safe zone instead --');
  for (const difficulty of ['easy', 'normal', 'hard', 'expert']) {
    const s = stage(difficulty, 'K', true, false);
    s.game.botTurn();
    await wait(2200);
    ok(s.foe.pegs[0].holeId === 'bullseye' && s.me.pegs[0].holeId !== 'bullseye',
      `${difficulty}: skips the cut for its own sake and heads home`,
      `bot peg at ${s.me.pegs[0].holeId}, opponent peg at ${s.foe.pegs[0].holeId}`);
  }

  console.log('\n-- 3. an opponent in the bullseye with a full safe zone (leaving it would win): stop the win --');
  for (const [difficulty, shouldCut] of [['easy', false], ['normal', null], ['hard', true], ['expert', true]]) {
    const s = stage(difficulty, 'K', true, true);
    s.game.botTurn();
    await wait(2200);
    const cut = s.foe.pegs[0].holeId !== 'bullseye';
    if (shouldCut === null) ok(true, `${difficulty}: either choice is right (by personality), it ${cut ? 'cut' : 'went home'}`);
    else ok(cut === shouldCut, `${difficulty}: ${shouldCut ? 'takes' : 'passes up'} the cut in the bullseye`,
      `bot peg at ${s.me.pegs[0].holeId}, opponent peg at ${s.foe.pegs[0].holeId}`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
