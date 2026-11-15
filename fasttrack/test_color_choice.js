#!/usr/bin/env node
/**
 * ============================================================
 * CHOSEN COLORS (Ken, 2026-11-15)
 *
 * Players may pick their color while they choose a name and avatar.
 *   - nobody picks: the board is laid out exactly as before
 *   - a picked color is that player's, and no one else can hold it
 *   - the rest fill in around the picks; with three players they sit one color apart
 *   - play still goes round the board, and seat 0 (the solo human) stays first
 *
 * Run: node fasttrack/test_color_choice.js
 * ============================================================
 */

const { createEngine } = require('./engine/headless');

let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const g = createEngine();
const assign = g.assignBoardPositions;
const order = g.seatsInBoardOrder;

console.log('CHOSEN COLORS');
console.log('='.repeat(62));

console.log('\n-- 1. Nobody picks: the layout is unchanged --');
for (let n = 2; n <= 6; n++) {
  const usual = Array.from({ length: n }, (_, i) => g.getBalancedBoardPosition(i, n));
  ok(same(assign(Array(n).fill(null), n), usual), `${n} players, no picks = ${usual.join(',')}`);
  ok(same(assign(null, n), usual), `${n} players, no choices list at all`);
}

console.log('\n-- 2. Three players: one pick, the others one color apart --');
for (let c = 0; c < 6; c++) {
  for (let seat = 0; seat < 3; seat++) {
    const picks = [null, null, null]; picks[seat] = c;
    const got = assign(picks, 3);
    const want = [c, (c + 2) % 6, (c + 4) % 6].sort((a, b) => a - b);
    ok(got[seat] === c && same(got.slice().sort((a, b) => a - b), want),
      `seat ${seat} picks ${c}: ${got.join(',')}`);
  }
}

console.log('\n-- 3. Picks that break the pattern still give everyone their own color --');
{
  const got = assign([0, 1, null], 3);
  ok(got[0] === 0 && got[1] === 1, 'both picks kept', got.join(','));
  ok(got[2] === 4, 'the third takes the spot farthest from both (4)', got.join(','));
}
{
  const got = assign([2, 2, null], 3);
  ok(got[0] === 2 && got[1] !== 2 && new Set(got).size === 3, 'a color held twice: the first seat keeps it', got.join(','));
}
{
  const got = assign([5, 9, 'x'], 3);
  ok(got[0] === 5 && new Set(got).size === 3 && got.every(bp => bp >= 0 && bp < 6), 'nonsense picks are ignored', got.join(','));
}

console.log('\n-- 4. Every count, every single pick: all different, pick honoured --');
let allGood = true, bad = '';
for (let n = 2; n <= 6; n++) for (let seat = 0; seat < n; seat++) for (let c = 0; c < 6; c++) {
  const picks = Array(n).fill(null); picks[seat] = c;
  const got = assign(picks, n);
  if (got[seat] !== c || new Set(got).size !== n || got.some(bp => !(bp >= 0 && bp < 6))) { allGood = false; bad = `${n}/${seat}/${c} -> ${got}`; }
}
ok(allGood, '150 cases', bad);
ok(same(assign([1, null], 2).slice().sort(), [1, 4]), 'two players stay opposite (pick 1 gives 1 and 4)');
ok(same(assign([0, 1, 2, 3, 4, 5], 6), [0, 1, 2, 3, 4, 5]) && same(assign([5, 4, 3, 2, 1, 0], 6), [5, 4, 3, 2, 1, 0]), 'six players, all picked');

console.log('\n-- 5. Turn order goes round the board, seat 0 first --');
ok(same(order([0, 2, 4]), [0, 1, 2]), 'usual layout: order unchanged');
ok(same(order([3, 5, 1]), [0, 1, 2]), '3,5,1: 3 then 5 then 1 (round the board)');
ok(same(order([3, 1, 5]), [0, 2, 1]), '3,1,5: seat 0 at 3, then seat 2 at 5, then seat 1 at 1');

console.log('\n-- 6. In a real game --');
{
  g.initGame(3, { sessionSeed: 'solo-color', humanName: 'Ken', humanColor: 1 });
  const list = g.state.players.get('list');
  ok(list[0].name === 'Ken' && list[0].boardPosition === 1 && list[0].color === '#0050B5', 'solo human picked Blue and is seat 0', `${list[0].name} bp ${list[0].boardPosition}`);
  ok(same(list.map(p => p.boardPosition), [1, 3, 5]), 'bots sit one color apart: 1,3,5', list.map(p => p.boardPosition).join(','));
  ok(list.every((p, i) => p.index === i && p.pegs[0].holeId === `home-${p.boardPosition}`), 'each player starts on their own home hole');
}
{
  g.initGame(4, { sessionSeed: 'solo-none', humanName: 'Ken' });
  const list = g.state.players.get('list');
  ok(same(list.map(p => p.boardPosition), [0, 1, 3, 4]) && list[0].name === 'Ken', 'solo, no pick: as before');
}
{
  const roster = [
    { user_id: 'p1', username: 'Ann', is_ai: false, slot: 0, color: null },
    { user_id: 'p2', username: 'Bob', is_ai: false, slot: 1, color: 0 },
    { user_id: 'p3', username: 'Cy', is_ai: false, slot: 2, color: 3 },
    { user_id: 'bot-1', username: 'Bot Ruby', is_ai: true, slot: 3, level: 'easy' },
  ];
  g.initGame(4, { sessionSeed: 'table-color', launchMode: 'private', myUserId: 'p1', sessionPlayers: roster });
  const list = g.state.players.get('list');
  const by = (id) => list.find(p => p.userId === id);
  ok(by('p2').boardPosition === 0 && by('p3').boardPosition === 3, 'table picks kept: Bob Yellow, Cy Purple');
  ok(new Set(list.map(p => p.boardPosition)).size === 4, 'four different colors');
  ok(list[0].userId === 'p1', 'the first seat is still first in the list');
  const bps = list.map(p => p.boardPosition), at = bps.indexOf(Math.min(...bps));
  const round = bps.slice(at).concat(bps.slice(0, at));
  ok(round.every((bp, i) => i === 0 || bp > round[i - 1]), 'play goes round the board', bps.join(','));
  ok(by('bot-1').isBot && by('bot-1').aiDifficulty === 'easy', 'the bot keeps its level');
}

console.log('\n' + '='.repeat(62));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
