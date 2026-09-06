#!/usr/bin/env node
/**
 * ============================================================
 * ADVANCING INSIDE THE SAFE ZONE
 *
 * Reported as: "I drew a 3 with one in the 1st safezone hole that would have
 * been a legal move to move the peg up but it did not give that as an option.
 * It moved my other peg 3 spaces."
 *
 * The safe zone is four holes, safe-{bp}-1 through safe-{bp}-4. A peg inside it
 * moves forward only, and must land exactly. From slot 1 a 3 lands on slot 4,
 * which is legal whenever slots 2, 3 and 4 are empty.
 *
 * The move generator scanned forward from the peg and stopped at the first
 * EMPTY hole, so it only ever considered a move of one hole. Any card larger
 * than the gap to the next empty hole produced no safe-zone option at all, and
 * the engine silently used a different peg instead. The stop condition was
 * inverted: an empty hole is what a peg moves THROUGH, an occupied one is what
 * blocks it.
 *
 * These cases are written from the geometry, so they say what the rule is
 * rather than what the code happened to do.
 *
 * Run: node fasttrack/test_safezone_advance.js
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

console.log('SAFE ZONE ADVANCE');
console.log('='.repeat(62));

const SAFE_SLOTS = 4;

// Build a table with player 0's pegs placed exactly where the case wants them.
// Everything else is cleared so nothing incidental can explain a result.
function table(placements, opts = {}) {
  const g = createEngine();
  g.initGame(opts.players || 2, { sessionSeed: opts.seed || 'safezone' });
  const list = g.state.players.get('list') || [];
  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let k = 1; k <= SAFE_SLOTS; k++) g.state.board.set(`safe-${p}-${k}`, null);
  g.state.board.set('bullseye', null);

  for (const pl of list) {
    for (const pg of pl.pegs) {
      pg.holeId = 'holding'; pg.holeType = 'holding';
      pg.onFasttrack = false; pg.eligibleForSafeZone = false; pg.lockedToSafeZone = false;
    }
  }
  placements.forEach((spec, i) => {
    const owner = spec.player == null ? 0 : spec.player;
    const peg = list[owner].pegs[i];
    peg.holeId = spec.hole;
    peg.holeType = g.getHoleType(spec.hole);
    peg.eligibleForSafeZone = true;
    if (spec.hole !== 'holding') g.state.board.set(spec.hole, { playerIdx: owner, pegId: peg.id });
  });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  return { g, list, bp: list[0].boardPosition };
}

function movesFor(ctx, value) {
  const card = Object.assign({}, ctx.g.CARDS[value], { value, display: value + 'S', suit: 'S' });
  ctx.g._drawCardCommit(card);
  return ctx.g.state.turn.get('validMoves') || [];
}

// Safe-zone moves for the peg sitting at `from`, as destination slot numbers.
function safeDests(moves, from) {
  return moves
    .filter(m => m.from === from && typeof m.dest === 'string' && m.dest.startsWith('safe-'))
    .map(m => Number(m.dest.split('-')[2]))
    .sort((a, b) => a - b);
}

// ───────────────────────────────────────────────────────────
section('1. The reported case: slot 1, a 3, an empty zone');
{
  const ctx = table([{ hole: 'PLACEHOLDER' }]);
  // Placed by hand so the board position is the real one for this seat.
  const from = `safe-${ctx.bp}-1`;
  ctx.list[0].pegs[0].holeId = from;
  ctx.list[0].pegs[0].holeType = ctx.g.getHoleType(from);
  ctx.g.state.board.set(from, { playerIdx: 0, pegId: ctx.list[0].pegs[0].id });

  const moves = movesFor(ctx, '3');
  const dests = safeDests(moves, from);
  ok(dests.includes(4),
    'a 3 from slot 1 offers slot 4', `offered ${JSON.stringify(dests)}`);
  ok(dests.length === 1,
    'and offers exactly that one, because landing must be exact',
    `offered ${JSON.stringify(dests)}`);
}

// ───────────────────────────────────────────────────────────
section('2. Every exact landing inside an empty zone is offered');
{
  // From slot k a card of n is legal when k + n <= 4, and nothing else is.
  for (let k = 1; k <= SAFE_SLOTS; k++) {
    for (const n of [2, 3]) {
      const ctx = table([]);
      const from = `safe-${ctx.bp}-${k}`;
      const peg = ctx.list[0].pegs[0];
      peg.holeId = from; peg.holeType = ctx.g.getHoleType(from);
      ctx.g.state.board.set(from, { playerIdx: 0, pegId: peg.id });

      const dests = safeDests(movesFor(ctx, String(n)), from);
      const shouldFit = (k + n) <= SAFE_SLOTS;
      if (shouldFit) {
        ok(dests.length === 1 && dests[0] === k + n,
          `slot ${k} with a ${n} lands on slot ${k + n}`, `offered ${JSON.stringify(dests)}`);
      } else {
        ok(dests.length === 0,
          `slot ${k} with a ${n} overshoots the zone and is not offered`,
          `offered ${JSON.stringify(dests)}`);
      }
    }
  }
}

// ───────────────────────────────────────────────────────────
section('3. Your own peg still blocks the path');
{
  // The rule the broken stop condition was reaching for, stated correctly: a
  // peg cannot pass THROUGH an occupied hole, and cannot land on one either.
  const ctx = table([]);
  const from = `safe-${ctx.bp}-1`;
  const blocker = `safe-${ctx.bp}-2`;
  const p0 = ctx.list[0].pegs[0];
  const p1 = ctx.list[0].pegs[1];
  p0.holeId = from; p0.holeType = ctx.g.getHoleType(from);
  p1.holeId = blocker; p1.holeType = ctx.g.getHoleType(blocker);
  ctx.g.state.board.set(from, { playerIdx: 0, pegId: p0.id });
  ctx.g.state.board.set(blocker, { playerIdx: 0, pegId: p1.id });

  const dests = safeDests(movesFor(ctx, '3'), from);
  ok(dests.length === 0,
    'a 3 from slot 1 is refused when slot 2 holds your own peg',
    `offered ${JSON.stringify(dests)}`);

}

{
  // Landing exactly on an occupied hole is refused too, not just passing it.
  const ctx = table([]);
  const from = `safe-${ctx.bp}-1`;
  const blocker = `safe-${ctx.bp}-3`;
  const p0 = ctx.list[0].pegs[0];
  const p1 = ctx.list[0].pegs[1];
  p0.holeId = from; p0.holeType = ctx.g.getHoleType(from);
  p1.holeId = blocker; p1.holeType = ctx.g.getHoleType(blocker);
  ctx.g.state.board.set(from, { playerIdx: 0, pegId: p0.id });
  ctx.g.state.board.set(blocker, { playerIdx: 0, pegId: p1.id });

  const dests = safeDests(movesFor(ctx, '2'), from);
  ok(dests.length === 0,
    'a 2 from slot 1 cannot land on slot 3 while your own peg sits there',
    `offered ${JSON.stringify(dests)}`);
}

// ───────────────────────────────────────────────────────────
section('4. A blocker further along still allows the holes before it');
{
  const ctx = table([]);
  const from = `safe-${ctx.bp}-1`;
  const blocker = `safe-${ctx.bp}-4`;
  const p0 = ctx.list[0].pegs[0];
  const p1 = ctx.list[0].pegs[1];
  p0.holeId = from; p0.holeType = ctx.g.getHoleType(from);
  p1.holeId = blocker; p1.holeType = ctx.g.getHoleType(blocker);
  ctx.g.state.board.set(from, { playerIdx: 0, pegId: p0.id });
  ctx.g.state.board.set(blocker, { playerIdx: 0, pegId: p1.id });

  ok(safeDests(movesFor(ctx, '2'), from).join() === '3',
    'a 2 from slot 1 still reaches slot 3, short of the blocker');
  ok(safeDests(movesFor(ctx, '3'), from).length === 0,
    'a 3 from slot 1 is refused, because slot 4 is taken');
}

// ───────────────────────────────────────────────────────────
section('5. The path is walked hole by hole, not jumped');
{
  const ctx = table([]);
  const from = `safe-${ctx.bp}-1`;
  const peg = ctx.list[0].pegs[0];
  peg.holeId = from; peg.holeType = ctx.g.getHoleType(from);
  ctx.g.state.board.set(from, { playerIdx: 0, pegId: peg.id });

  const move = movesFor(ctx, '3').find(m => m.from === from && String(m.dest).startsWith('safe-'));
  ok(!!move, 'the move exists');
  ok(move && Array.isArray(move.path) && move.path.length === 3,
    'it carries a three step path so the peg hops rather than teleports',
    move ? JSON.stringify(move.path) : 'no move');
  ok(move && move.path.join() === `safe-${ctx.bp}-2,safe-${ctx.bp}-3,safe-${ctx.bp}-4`,
    'and the path is each hole in order',
    move ? JSON.stringify(move.path) : 'no move');
  ok(move && move.steps === 3, 'and it reports the right number of steps',
    move ? String(move.steps) : 'no move');
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
