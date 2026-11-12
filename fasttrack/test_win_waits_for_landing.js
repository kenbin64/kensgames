#!/usr/bin/env node
/**
 * ============================================================
 * THE WIN WAITS FOR THE WINNING PEG TO LAND
 *
 * Ken, 2026-11-11: "the winning fanfare should wait till the winning peg enters
 * the final winning hole then the winning hole wins the crown and a cut scene
 * gives the name of the player win, where all players can see, with confetti
 * and balloons." And: "while the winning fanfare is still running, put Play
 * again or Leave game, but only for the host player. Other players just get
 * Leave game. Better luck next time for all losing players."
 *
 * Cause of the early fanfare: resolveTurn checked for a winner BEFORE waiting
 * for the table to go still, and the move's first resolveTurn prompt comes while
 * the peg is still hopping, so the game was declared over mid-hop.
 *
 *   1. while the winning peg is still hopping: no celebration, no game-over prompt
 *   2. once it lands: the crown goes on the peg, then the celebration, with the
 *      winner's name; the old replay prompt never appears on top of it
 *   3. the celebration knows who is looking: the person who won is told so;
 *      when a bot wins, the person at the screen lost
 *
 * Run: node fasttrack/test_win_waits_for_landing.js
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

// Seat 0 has four pegs in its safe zone and the fifth, already round, one hole
// before the entrance; a 3 takes it exactly into the winning hole.
function stageWin(seat0IsBot) {
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'win-' + seat0IsBot });
  const w = g.sandbox;
  const seen = { celebration: [], replayPrompt: 0, crown: 0, held: [] };
  let hopping = true;
  w.isPlayResolving = () => hopping;                         // the 3D renderer says a peg is mid-hop
  w.waitForAnimations = (cb) => { seen.held.push(cb); };     // ... and holds the "landed" callback
  w.showWinCelebration = (o) => seen.celebration.push(o);
  w.showReplayPrompt = () => { seen.replayPrompt++; };
  w.triggerWinCrown = () => { seen.crown++; seen.crownBeforeCelebration = seen.celebration.length === 0; };

  const list = g.state.players.get('list');
  const me = list[0], foe = list[1];
  me.isBot = seat0IsBot; foe.isBot = !seat0IsBot;
  const bp = me.boardPosition;
  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  for (let s = 1; s <= 4; s++) g.state.board.set(`safe-${bp}-${s}`, null);
  for (const pl of list) for (const pg of pl.pegs) {
    pg.holeId = 'holding'; pg.holeType = 'holding'; pg.onFasttrack = false;
    pg.eligibleForSafeZone = false; pg.lockedToSafeZone = false;
  }
  const t = g.CLOCKWISE_TRACK;
  const start = t[(t.indexOf(`outer-${bp}-2`) - 1 + t.length) % t.length];
  const holes = [start, `safe-${bp}-1`, `safe-${bp}-2`, `safe-${bp}-3`, `safe-${bp}-4`];
  holes.forEach((hole, i) => {
    const pg = me.pegs[i];
    pg.holeId = hole; pg.holeType = g.getHoleType(hole);
    pg.eligibleForSafeZone = true; pg.lockedToSafeZone = pg.holeType === 'safezone';
    g.state.board.set(hole, { playerIdx: 0, pegId: pg.id });
  });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  g._drawCardCommit(Object.assign({}, g.CARDS['3'], { value: '3', display: '3S', suit: 'S' }));
  const moves = g.state.turn.get('validMoves') || [];
  const idx = moves.findIndex(m => m.pegIdx === 0 && m.dest === `home-${bp}`);
  return { g, seen, idx, land() { hopping = false; seen.held.splice(0).forEach(cb => cb()); } };
}

(async () => {
  console.log('THE WIN WAITS FOR THE WINNING PEG TO LAND');
  console.log('='.repeat(62));

  section('1. The person wins: nothing is announced while the peg is still hopping');
  const s = stageWin(false);
  ok(s.idx >= 0, 'a 3 can take the fifth peg into the winning hole');
  if (s.idx >= 0) {
    s.g.executeMove(s.idx);
    await wait(1500);
    ok(s.g.state.meta.get('winner') === 0, 'the move is a win');
    ok(s.seen.celebration.length === 0, 'no celebration while the peg is hopping', `${s.seen.celebration.length} shown`);
    ok(s.seen.replayPrompt === 0, 'no game-over prompt while the peg is hopping');
    ok(s.seen.crown === 0, 'no crown while the peg is hopping');

    section('2. Once it lands: crown, then the celebration with the name');
    s.land();
    await wait(1500);
    ok(s.seen.crown === 1, 'the crown goes on the winning peg');
    ok(s.seen.crownBeforeCelebration === true, 'the crown comes before the celebration');
    const c = s.seen.celebration[0] || {};
    ok(s.seen.celebration.length === 1, 'the celebration shows once');
    ok(c.winnerName === s.g.state.players.get('list')[0].name, `it names the winner (${c.winnerName})`);
    ok(c.localWon === true, 'the person who won is told they won (no "better luck")');
    ok(c.isHost === true, 'solo: the person is the host, so Play again is offered');
    await wait(5000);                                       // the scene finishes and the game is resolved
    ok(s.seen.replayPrompt === 0, 'the old replay prompt never opens on top of the celebration');
  }

  section('3. A bot wins: the person at the screen lost');
  const b = stageWin(true);
  if (b.idx >= 0) {
    b.g.executeMove(b.idx);
    await wait(300);
    b.land();
    await wait(1500);
    const c = b.seen.celebration[0] || {};
    ok(b.seen.celebration.length === 1 && c.localWon === false, 'the celebration says "Better luck next time"',
       JSON.stringify(c.localWon));
  } else ok(false, 'the bot can make the winning move');

  console.log(NL + '='.repeat(62));
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(62));
  if (fail) {
    console.log(NL + 'Failures:');
    failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
  }
  process.exit(fail ? 1 : 0);
})();
