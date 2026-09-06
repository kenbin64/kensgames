#!/usr/bin/env node
/**
 * ============================================================
 * BOT STRATEGY
 *
 * Difficulty is the CUTTING axis:
 *   easy    only cuts when there is no other legal move
 *   normal  cuts when it is strategically worth it
 *   hard    hunts other pegs, humans first, out of its way if needed
 *   expert  hard, sharper
 *
 * Positional play, applied by weight rather than switched on:
 *   the four-back staging rule  park a not-yet-eligible peg 1 to 4 holes past
 *                               its own safe-zone entrance, so a Card 4 carries
 *                               it back across and makes it eligible
 *   bullseye risk vs reward     safer when few opponent pegs are on the board,
 *                               and worth more when this player is behind
 *
 * Before this existed, player.aiDifficulty was stored on every bot at init and
 * never read, so all four settings played exactly the same.
 *
 * Run: node fasttrack/test_bot_strategy.js
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

console.log('BOT STRATEGY');
console.log('='.repeat(62));

// ───────────────────────────────────────────────────────────
section('1. Difficulty profiles exist and are distinct');
{
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'profiles' });
  const S = g.sandbox;
  ok(typeof S._aiProfile === 'function', 'the profile selector is available');

  const easy = S._aiProfile({ aiDifficulty: 'easy' });
  const normal = S._aiProfile({ aiDifficulty: 'normal' });
  const hard = S._aiProfile({ aiDifficulty: 'hard' });
  const expert = S._aiProfile({ aiDifficulty: 'expert' });

  ok(easy.cutMode === 'last-resort', 'easy only cuts as a last resort', easy.cutMode);
  ok(normal.cutMode === 'strategic', 'normal cuts strategically', normal.cutMode);
  ok(hard.cutMode === 'aggressive', 'hard is aggressive', hard.cutMode);
  ok(hard.huntWeight > 0 && hard.humanPreference > 0,
     'hard hunts, and prefers humans');
  ok(normal.huntWeight === 0, 'normal does NOT go out of its way to hunt');
  ok(easy.stagingWeight === 0 && normal.stagingWeight > 0 && expert.stagingWeight > normal.stagingWeight,
     'positional staging scales with difficulty');
  ok(easy.bullseyeAppetite < normal.bullseyeAppetite
     && normal.bullseyeAppetite < hard.bullseyeAppetite,
     'appetite for the bullseye rises with difficulty');
  // An unknown or missing setting must not crash or silently disable the bot.
  ok(S._aiProfile({}).cutMode === 'strategic', 'a bot with no difficulty set plays as normal');
  ok(S._aiProfile({ aiDifficulty: 'nonsense' }).cutMode === 'strategic',
     'an unrecognised difficulty falls back to normal');
}

// ───────────────────────────────────────────────────────────
section('2. The four-back staging rule');
{
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'staging' });
  const S = g.sandbox;
  const bp = 0;
  const entrance = `outer-${bp}-2`;
  const t = g.CLOCKWISE_TRACK;
  const at = (n) => t[(t.indexOf(entrance) + n) % t.length];

  ok(S._isStagedForFour(at(1), bp), '1 hole past the entrance is staged');
  ok(S._isStagedForFour(at(4), bp), '4 holes past the entrance is staged');
  ok(!S._isStagedForFour(at(5), bp), '5 holes past is too far for a Card 4');
  ok(!S._isStagedForFour(entrance, bp), 'sitting ON the entrance is not "past" it');
  ok(!S._isStagedForFour('holding', bp), 'a peg in holding is not staged');
  ok(!S._isStagedForFour('bullseye', bp), 'the bullseye is not staged');
  ok(S._holesPastSafeEntry(at(3), bp) === 3, 'distance past the entrance is measured correctly');
}

// ───────────────────────────────────────────────────────────
section('3. Being behind is measured, for the bullseye decision');
{
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'behind' });
  const S = g.sandbox;
  const mk = (holeTypes) => ({ pegs: holeTypes.map(h => ({ holeType: h })) });

  const level = [mk(['outer', 'outer']), mk(['outer', 'outer'])];
  ok(S._behindFactor(level, 0) === 0, 'a level game reports nobody behind');

  const losing = [mk(['holding', 'holding']), mk(['home', 'safezone'])];
  ok(S._behindFactor(losing, 0) > 0.5, 'a badly trailing player reports well behind',
     String(S._behindFactor(losing, 0)));

  const winning = [mk(['home', 'safezone']), mk(['holding', 'holding'])];
  ok(S._behindFactor(winning, 0) === 0, 'the leader is not behind');
}

// ───────────────────────────────────────────────────────────
section('4. Cut detection');
{
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'cut' });
  const S = g.sandbox;
  const hole = 'outer-3-1';
  g.state.board.set(hole, { playerIdx: 1, pegId: 'p1-peg0' });
  ok(S._moveCutsSomeone({ dest: hole }, 0), 'landing on an opponent is a cut');
  ok(!S._moveCutsSomeone({ dest: hole }, 1), 'landing on your OWN peg is not a cut');
  ok(S._moveCutsSomeone({ type: 'split', dest: 'outer-3-0', dest2: hole }, 0),
     'either half of a split can be the cut');
  ok(!S._moveCutsSomeone({ dest: 'outer-5-0' }, 0), 'an empty hole is not a cut');
}

// ───────────────────────────────────────────────────────────
section('5. End to end: easy avoids the cut, hard takes it');

// Build a table where the bot has BOTH a cut and a harmless move available,
// then let the real botTurn choose.
function stageChoice(difficulty) {
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'choice' });
  const list = g.state.players.get('list') || [];
  const me = list[0];
  const foe = list[1];
  me.isBot = true;
  me.aiDifficulty = difficulty;
  foe.isBot = false;                       // a human, so hard should prefer them

  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  for (const pl of list) for (const pg of pl.pegs) {
    pg.holeId = 'holding'; pg.holeType = 'holding';
    pg.onFasttrack = false; pg.eligibleForSafeZone = false;
  }

  // Our peg, and an opponent peg exactly 5 clockwise ahead of it so a 5 cuts.
  const t = g.CLOCKWISE_TRACK;
  const start = 'outer-1-0';
  const prey = t[(t.indexOf(start) + 5) % t.length];

  me.pegs[0].holeId = start; me.pegs[0].holeType = g.getHoleType(start);
  g.state.board.set(start, { playerIdx: 0, pegId: me.pegs[0].id });

  // A second peg of ours elsewhere, so there is always a non-cut alternative.
  const alt = 'outer-4-0';
  me.pegs[1].holeId = alt; me.pegs[1].holeType = g.getHoleType(alt);
  g.state.board.set(alt, { playerIdx: 0, pegId: me.pegs[1].id });

  foe.pegs[0].holeId = prey; foe.pegs[0].holeType = g.getHoleType(prey);
  g.state.board.set(prey, { playerIdx: 1, pegId: foe.pegs[0].id });

  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  const five = Object.assign({}, g.CARDS['5'], { value: '5', display: '5S', suit: 'S' });
  g._drawCardCommit(five);
  return { g, me, foe, prey };
}

(async () => {
  const staged = stageChoice('normal');
  const vm = staged.g.state.turn.get('validMoves') || [];
  const cutAvailable = vm.some(m => m.dest === staged.prey);
  const altAvailable = vm.some(m => m.dest !== staged.prey);
  ok(cutAvailable && altAvailable,
     'the position offers BOTH a cut and a harmless alternative',
     `moves=${vm.length} cut=${cutAvailable} alt=${altAvailable}`);

  if (cutAvailable && altAvailable) {
    for (const [difficulty, shouldCut] of [['easy', false], ['hard', true]]) {
      const s = stageChoice(difficulty);
      s.g.botTurn();
      await wait(2200);                     // botTurn runs behind 500ms + 600ms timers
      // A cut sends the peg back to its own home hole (home-{bp}), not to
      // holding, so the reliable signal is simply that it no longer occupies
      // the hole it was standing on.
      const cutHappened = s.foe.pegs[0].holeId !== s.prey;
      ok(cutHappened === shouldCut,
         `${difficulty}: ${shouldCut ? 'takes' : 'avoids'} the cut when an alternative exists`,
         `opponent peg ended at ${s.foe.pegs[0].holeId}`);
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
