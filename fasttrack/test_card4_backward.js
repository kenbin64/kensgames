#!/usr/bin/env node
/**
 * ============================================================
 * CARD 4 — BACKWARD RULES
 *
 * The rule as stated:
 *
 *   A 4 moves 4 legal moves BACKWARD, counter-clockwise, down the outer track.
 *   It cannot back into the bullseye.
 *   It cannot back into the safe zone.
 *   A peg CAN land on a FastTrack hole going backward, but doing so does NOT
 *   confer FastTrack status.
 *   Drawing a 4 ALWAYS costs the player FastTrack status, because the backward
 *   traversal is a non-FastTrack traversal, and any non-FT traversal forfeits
 *   FT for that player's pegs.
 *
 * rules.json already carries all of this (CARD_4_BACKWARD, FT_NO_BACKWARD_ENTRY,
 * FT_LOSS_ON_4, BULL_NO_BACKWARD, SAFE_FORWARD_ONLY, CIR_BACKWARD_4). This suite
 * checks the ENGINE against it, because a rule that is only written down is a
 * comment.
 *
 * Run: node fasttrack/test_card4_backward.js
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

console.log('CARD 4 — BACKWARD RULES');
console.log('='.repeat(62));

const FOUR = (g) => Object.assign({}, g.CARDS['4'], { value: '4', display: '4S', suit: 'S' });

// Build a table with player 0's pegs placed exactly where we want them.
function table(placements, opts = {}) {
  const g = createEngine();
  g.initGame(opts.players || 2, { sessionSeed: opts.seed || 'card4' });
  const list = g.state.players.get('list') || [];
  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let k = 1; k <= 4; k++) g.state.board.set(`safe-${p}-${k}`, null);
  g.state.board.set('bullseye', null);

  // Park everyone in holding first, then place what the test asked for.
  for (const pl of list) {
    for (const pg of pl.pegs) {
      pg.holeId = 'holding'; pg.holeType = 'holding';
      pg.onFasttrack = false; pg.eligibleForSafeZone = false; pg.lockedToSafeZone = false;
    }
  }
  placements.forEach((spec, i) => {
    const peg = list[0].pegs[i];
    peg.holeId = spec.hole;
    peg.holeType = g.getHoleType(spec.hole);
    peg.onFasttrack = !!spec.ft;
    peg.eligibleForSafeZone = !!spec.eligible;
    if (spec.hole !== 'holding') g.state.board.set(spec.hole, { playerIdx: 0, pegId: peg.id });
  });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  return { g, list };
}

function movesForFour(ctx) {
  ctx.g._drawCardCommit(FOUR(ctx.g));
  return ctx.g.state.turn.get('validMoves') || [];
}

// Track helpers so placements can be expressed as "4 clockwise-ahead of X".
function trackIdx(g, hole) { return g.CLOCKWISE_TRACK.indexOf(hole); }
function aheadOf(g, hole, n) {
  const i = trackIdx(g, hole);
  if (i < 0) return null;
  const t = g.CLOCKWISE_TRACK;
  return t[(i + n) % t.length];
}

// ───────────────────────────────────────────────────────────
section('The card itself');
{
  const { g } = table([{ hole: 'outer-1-0' }]);
  const c = g.state.cards.get('4');
  ok(c.direction === 'backward' || c.direction === 'counter_clockwise',
     'the 4 is a backward / counter-clockwise card', `direction=${c.direction}`);
  ok(c.moves === 4, 'the 4 moves 4', `moves=${c.moves}`);
  ok(c.extraTurn === false, 'the 4 does not grant a redraw');
  ok(c.release === false, 'the 4 cannot release a peg from holding');
}

// ───────────────────────────────────────────────────────────
section('It cannot back into the bullseye');
{
  // Put a peg 4 clockwise-ahead of the bullseye's approach and confirm no
  // generated 4 ever terminates on the centre.
  const { g } = table([{ hole: 'outer-1-0' }, { hole: 'ft-2', ft: true }]);
  const moves = movesForFour({ g });
  const toBull = moves.filter(m => m.dest === 'bullseye' || m.type === 'enterBullseye');
  ok(toBull.length === 0, 'no backward-4 move lands on the bullseye',
     `${toBull.length} such move(s)`);
}

// ───────────────────────────────────────────────────────────
section('It cannot back into the safe zone');
{
  // A peg that has already completed its circuit sits just past its own safe
  // entrance. Going backward must not drop it into the safe zone.
  const { g } = table([{ hole: 'outer-0-3', eligible: true }]);
  const moves = movesForFour({ g });
  const intoSafe = moves.filter(m => g.getHoleType(m.dest) === 'safezone');
  ok(intoSafe.length === 0, 'no backward-4 move enters the safe zone',
     intoSafe.map(m => m.dest).join(','));
}

// ───────────────────────────────────────────────────────────
section('Landing on a FastTrack hole backward does NOT confer FT status');
{
  // Place the peg exactly 4 clockwise-ahead of an FT hole, so a backward 4
  // lands squarely on it.
  const probe = createEngine();
  probe.initGame(2, { sessionSeed: 'probe' });
  const target = 'ft-3';
  const start = aheadOf(probe, target, 4);

  if (!start) {
    ok(false, 'could position a peg 4 ahead of an FT hole', 'track lookup failed');
  } else {
    const { g, list } = table([{ hole: start }]);
    const moves = movesForFour({ g });
    const onto = moves.filter(m => m.dest === target);
    ok(onto.length > 0, `a backward 4 can land on ${target} (the hole itself is legal)`,
       `start=${start} dests=${moves.map(m => m.dest).join(',')}`);
    if (onto.length) {
      const idx = moves.indexOf(onto[0]);
      g.executeMove(idx);
      const peg = list[0].pegs[0];
      ok(peg.holeId === target, `the peg actually landed on ${target}`, `at ${peg.holeId}`);
      ok(peg.onFasttrack === false,
         'landing there backward does NOT confer FastTrack status',
         `onFasttrack=${peg.onFasttrack}`);
    }
  }
}

// ───────────────────────────────────────────────────────────
section('Drawing a 4 always costs FastTrack status');
{
  // Two pegs on the FT ring plus one on the outer rim. Whichever peg is moved,
  // every FT peg for this player must come off FastTrack.
  const { g, list } = table([
    { hole: 'ft-1', ft: true },
    { hole: 'ft-2', ft: true },
    { hole: 'outer-4-1' },
  ]);
  const before = list[0].pegs.filter(p => p.onFasttrack).length;
  ok(before === 2, 'two pegs start on FastTrack', `got ${before}`);

  const moves = movesForFour({ g });
  ok(moves.length > 0, 'a 4 produces at least one legal move', `${moves.length}`);
  if (moves.length) {
    g.executeMove(0);
    const after = list[0].pegs.filter(p => p.onFasttrack).length;
    ok(after === 0,
       'after playing the 4, NO peg of that player is still on FastTrack',
       `${after} still on FT`);
  }
}

// ───────────────────────────────────────────────────────────
section('Backward 4 across the safe entrance completes the circuit');
{
  // This is what makes the four-back staging play work: crossing your own
  // entrance backward makes the peg eligible for the safe zone.
  const entrance = 'outer-0-2';
  // One hole past the entrance, so a backward 4 crosses it. Computed positions
  // can land on `home-0`, the winner hole, which is not a sane place for a peg
  // to be standing, so this is pinned to a plain outer hole instead.
  const start = 'outer-0-3';

  const { g, list } = table([{ hole: start }]);
  const peg = list[0].pegs[0];
  ok(peg.eligibleForSafeZone === false, 'the peg starts NOT yet eligible');

  const moves = movesForFour({ g });
  const crossing = moves.find(m => (m.path || []).includes(entrance) || m.dest === entrance);
  ok(!!crossing, `a backward 4 from ${start} crosses ${entrance}`,
     `dests=${moves.map(m => m.dest).join(',')}`);
  if (crossing) {
    g.executeMove(moves.indexOf(crossing));
    ok(peg.eligibleForSafeZone === true,
       'crossing the entrance backward makes the peg safe-zone eligible',
       `eligible=${peg.eligibleForSafeZone}`);
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
