#!/usr/bin/env node
/**
 * ============================================================
 * NO OVERTAKING YOUR OWN PEG (Ken, 2026-11-07)
 *
 * The rule as stated:
 *
 *   No peg may land on or pass a peg of its own colour, anywhere, fast track
 *   included. Fast-track holes are ordinary outer-track holes: each one is the
 *   first hole of a colour area. A fast-track hop jumps that whole colour area,
 *   so it overtakes every peg in it. If a peg on the fast track would pass its
 *   own peg, it must leave at an earlier fast-track hole and walk the outer
 *   track. The bullseye (hole 0, dead centre) is the only exception.
 *   A 4 backward cannot pass its own peg either, even though backing past the
 *   safe-zone hole counts as a traversal.
 *
 * rules.json: MOV_NO_PASS_OWN, FT_RING_PASS_RELAX (now the ring no-overtake rule).
 *
 * Run: node fasttrack/test_no_overtake_own.js
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

// A table with player 0's pegs exactly where the test puts them; everyone else in holding.
function table(placements) {
  const g = createEngine();
  g.initGame(2, { sessionSeed: 'no-overtake' });
  const list = g.state.players.get('list') || [];
  for (const h of g.CLOCKWISE_TRACK) g.state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let k = 1; k <= 4; k++) g.state.board.set(`safe-${p}-${k}`, null);
  g.state.board.set('bullseye', null);
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
    if (spec.hole !== 'holding') g.state.board.set(spec.hole, { playerIdx: 0, pegId: peg.id });
  });
  g.state.players.set('current', 0);
  g.state.turn.set('phase', 'move');
  return g;
}

function movesFor(g, value) {
  g._drawCardCommit(Object.assign({}, g.CARDS[value], { value, display: value + 'S', suit: 'S' }));
  return g.state.turn.get('validMoves') || [];
}

const pegMoves = (moves, pegIdx) => moves.filter(m => m && m.pegIdx === pegIdx && m.type !== 'split');
const passes = (m, hole) => (m.path || []).slice(0, -1).includes(hole) || m.dest === hole;
const at = (g, hole, n) => { const t = g.CLOCKWISE_TRACK; return t[(t.indexOf(hole) + n + t.length) % t.length]; };
const bpOf = (g) => g.state.players.get('list')[0].boardPosition;

// ───────────────────────────────────────────────────────────
section('Case 1: walking the outer track past an own peg on a fast-track hole');
{
  const probe = table([]);
  const ft = `ft-${(bpOf(probe) + 2) % 6}`;
  const start = at(probe, ft, -2);
  const g = table([{ hole: start }, { hole: ft }]);
  const blocked = pegMoves(movesFor(g, '5'), 0).filter(m => passes(m, ft));
  ok(blocked.length === 0, `a 5 from ${start} cannot pass its own peg on ${ft}`, `${blocked.length} move(s) pass it`);
  const g2 = table([{ hole: start }, { hole: at(probe, ft, 6) }]);
  const free = pegMoves(movesFor(g2, '5'), 0).filter(m => passes(m, ft));
  ok(free.length > 0, `control: with ${ft} empty the same 5 walks through it`);
}

// ───────────────────────────────────────────────────────────
section('Case 2: a fast-track hop cannot jump an own peg in the colour area it skips');
{
  const probe = table([]);
  const x = (bpOf(probe) + 1) % 6;
  const area = at(probe, `ft-${x}`, 6);                       // a hole inside the colour area that starts at ft-x
  const g = table([{ hole: `ft-${x}`, ft: true }, { hole: area }]);
  const moves = pegMoves(movesFor(g, '5'), 0);
  const ringHops = moves.filter(m => (m.path || []).includes(`ft-${(x + 1) % 6}`));
  ok(ringHops.length === 0, `peg on ft-${x} cannot hop to ft-${(x + 1) % 6} over its own peg on ${area}`, moves.map(m => m.dest).join(','));
  ok(moves.length > 0 && moves.every(m => !passes(m, area)), 'it leaves the ring at an earlier hole and stops short of its own peg',
    moves.map(m => m.dest).join(','));
  const g2 = table([{ hole: `ft-${x}`, ft: true }, { hole: at(probe, `ft-${x}`, -3) }]);
  const free = pegMoves(movesFor(g2, '5'), 0).filter(m => (m.path || []).includes(`ft-${(x + 1) % 6}`));
  ok(free.length > 0, 'control: with the colour area empty the hop is offered');
}

// ───────────────────────────────────────────────────────────
section('Case 3: an own peg on a fast-track hole ahead on the ring');
{
  const probe = table([]);
  const x = (bpOf(probe) + 1) % 6;
  const ahead = `ft-${(x + 2) % 6}`;
  const g = table([{ hole: `ft-${x}`, ft: true }, { hole: ahead, ft: true }]);
  const moves = pegMoves(movesFor(g, '5'), 0);
  const past = moves.filter(m => passes(m, ahead) || (m.path || []).includes(`ft-${(x + 3) % 6}`));
  ok(past.length === 0, `peg on ft-${x} never reaches or passes ${ahead}`, past.map(m => m.dest).join(','));
}

// ───────────────────────────────────────────────────────────
section('7 split halves follow the same rule');
{
  const probe = table([]);
  const ft = `ft-${(bpOf(probe) + 2) % 6}`;
  const start = at(probe, ft, -2);
  const g = table([{ hole: start }, { hole: ft }]);
  const splits = movesFor(g, '7').filter(m => m && m.type === 'split');
  // The two parts are played in order (Ken, 2026-11-08). Moving first, peg 0 must not pass its
  // own peg on the ft hole. Moving second, the other peg has already left that hole, so passing
  // it is fine; what peg 0 must not reach or pass is where the other peg LANDED.
  const bad = splits.filter(m => (m.pegIdx === 0 && passes(m, ft))
    || (m.peg2Idx === 0 && (m.path2 || []).includes(m.dest)));
  ok(splits.length > 0, 'the split is offered at all');
  ok(bad.length === 0, `no split half from ${start} passes its own peg (on ${ft}, or where it landed)`, `${bad.length} bad`);
}

// ───────────────────────────────────────────────────────────
section('A 4 backward cannot pass its own peg');
{
  const probe = table([]);
  const ft = `ft-${(bpOf(probe) + 2) % 6}`;
  const start = at(probe, ft, 2);
  const g = table([{ hole: start }, { hole: ft }]);
  const back = pegMoves(movesFor(g, '4'), 0);
  ok(back.every(m => !passes(m, ft)), `a 4 back from ${start} cannot pass its own peg on ${ft}`, back.map(m => m.dest).join(','));
  const safeEntry = `outer-${bpOf(probe)}-2`;
  const startB = at(probe, safeEntry, 2);
  const g2 = table([{ hole: startB }, { hole: at(probe, safeEntry, -1) }]);
  const back2 = pegMoves(movesFor(g2, '4'), 0);
  ok(back2.length === 0, `a 4 back past the safe-zone hole is still blocked by its own peg (${at(probe, safeEntry, -1)})`, back2.map(m => m.dest).join(','));
  const g3 = table([{ hole: startB }, { hole: at(probe, safeEntry, -4) }]);
  const back3 = pegMoves(movesFor(g3, '4'), 0);
  ok(back3.length > 0, 'control: with the way clear, the 4 back past the safe-zone hole is offered');
}

// ───────────────────────────────────────────────────────────
section('The bullseye never blocks');
{
  const probe = table([]);
  const x = (bpOf(probe) + 1) % 6;
  const g = table([{ hole: `ft-${x}`, ft: true }, { hole: 'bullseye' }]);
  const hops = pegMoves(movesFor(g, '3'), 0).filter(m => (m.path || []).includes(`ft-${(x + 1) % 6}`));
  ok(hops.length > 0, 'an own peg on the bullseye does not stop a fast-track hop');
}

console.log(NL + `${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
