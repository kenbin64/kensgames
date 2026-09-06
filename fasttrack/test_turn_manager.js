#!/usr/bin/env node
/**
 * ============================================================
 * TURN MANAGER
 *
 * Whose turn it is has exactly ONE representation: the index
 * state.players.current. isTurn(i) is derived from it, so the two can never
 * disagree. That is deliberately not an isTurn boolean per player: an index
 * cannot represent two seats holding the turn at once, or none holding it,
 * whereas N booleans can, and a desync between them would be a new bug class.
 *
 * What was missing was ENFORCEMENT. Nothing checked that the turn actually
 * rotates by one, so a skipped seat left no evidence and could only be caught by
 * someone watching the screen. Every change now goes through set(), which
 * validates the transition, records it, and logs a violation with a stack trace.
 *
 * These tests prove the validator would ACTUALLY CATCH a skip, by forcing one.
 * A checker that never fires is worth nothing.
 *
 * Run: node fasttrack/test_turn_manager.js
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

console.log('TURN MANAGER');
console.log('='.repeat(62));

// ───────────────────────────────────────────────────────────
section('1. One owner of the turn, and isTurn derives from it');
{
  const g = createEngine();
  g.initGame(4, { sessionSeed: 'tm' });
  const TM = g.sandbox.FastTrackTurns;
  // Reached via the exposed handle, not the module-level const: top-level
  // const/let live in the script's lexical scope and never land on the global,
  // which is exactly why it is published as window.FastTrackTurns.
  ok(!!TM, 'the manager is reachable as FastTrackTurns');
  ok(typeof TM.set === 'function' && typeof TM.isTurn === 'function',
     'it exposes the operations a caller needs');

  const cur = TM.current();
  const flags = [0, 1, 2, 3].map(i => TM.isTurn(i));
  ok(flags.filter(Boolean).length === 1,
     'exactly ONE seat reports isTurn', `got ${flags.filter(Boolean).length}`);
  ok(flags[cur] === true, 'and it is the seat the index names');

  // The property that an isTurn boolean per player could not guarantee.
  g.state.players.set('current', 2);
  const after = [0, 1, 2, 3].map(i => TM.isTurn(i));
  ok(after.filter(Boolean).length === 1 && after[2],
     'moving the index moves isTurn with it; they cannot desync');
}

// ───────────────────────────────────────────────────────────
section('2. A legal rotation is accepted and recorded');
{
  const g = createEngine();
  g.initGame(4, { sessionSeed: 'tm2' });
  const TM = g.sandbox.FastTrackTurns;
  TM.reset();

  const start = TM.current();
  for (let i = 0; i < 8; i++) TM.set(TM.nextSeat(), 'advance');

  ok(TM._violations.length === 0, 'eight clean rotations raise no violation',
     JSON.stringify(TM._violations.slice(0, 2)));
  ok(TM.current() === (start + 8) % 4, 'the turn landed where round robin says',
     `at ${TM.current()}`);
  ok(TM._history.length === 8, 'every transition was recorded', `${TM._history.length}`);
}

// ───────────────────────────────────────────────────────────
section('3. A SKIP is caught, named, and blamed');
{
  const g = createEngine();
  g.initGame(4, { sessionSeed: 'tm3' });
  const TM = g.sandbox.FastTrackTurns;
  TM.reset();
  TM.set(0, 'init');

  // Force exactly the bug that was reported: jump from seat 0 to seat 2,
  // skipping seat 1.
  TM.set(2, 'advance');

  ok(TM._violations.length === 1, 'the skip was caught', `${TM._violations.length} violations`);
  const v = TM._violations[0];
  ok(!!v && /skipped seat\(s\) 1/.test(v.error || ''),
     'it names the seat that was skipped', v && v.error);
  ok(!!v && Array.isArray(v.skipped) && v.skipped.includes(1),
     'the skipped seat is machine readable, not just prose');
  ok(!!v && typeof v.stack === 'string' && v.stack.length > 20,
     'a stack trace is captured so the CALLER can be identified');

  // Skipping two seats must report both.
  TM.reset(); TM.set(0, 'init'); TM.set(3, 'advance');
  const v2 = TM._violations[0];
  ok(v2 && v2.skipped.join(',') === '1,2', 'skipping two seats reports both',
     v2 && v2.skipped.join(','));
}

// ───────────────────────────────────────────────────────────
section('4. It records but does not veto');
{
  // Refusing a bad write would FREEZE the game on a bad transition, which is
  // worse than a skipped seat. The manager is evidence, not a veto.
  const g = createEngine();
  g.initGame(4, { sessionSeed: 'tm4' });
  const TM = g.sandbox.FastTrackTurns;
  TM.reset(); TM.set(0, 'init');
  TM.set(2, 'advance');
  ok(TM.current() === 2, 'the game still moved on rather than wedging',
     `current=${TM.current()}`);
  ok(TM._violations.length === 1, 'and the violation was still recorded');
}

// ───────────────────────────────────────────────────────────
section('5. Real play produces no violations');
{
  const g = createEngine();
  g.initGame(4, { sessionSeed: 'tm5' });
  const TM = g.sandbox.FastTrackTurns;
  TM.reset();
  for (let i = 0; i < 40; i++) {
    if (!g.state.deck.get('currentCard')) g.drawCard();
    const vm = g.state.turn.get('validMoves') || [];
    if (vm.length) g.executeMove(0); else g.endTurn(g.sandbox._getTurnEpoch());
    if (g.state.meta.get('winner') != null) break;
  }
  ok(TM._violations.length === 0,
     '40 turns of real play, zero turn-order violations',
     JSON.stringify(TM._violations.slice(0, 3)));

  const rep = TM.report();
  ok(Array.isArray(rep.seats) && rep.seats.length === 4, 'report() lists the seats');
  ok(Array.isArray(rep.recent) && rep.recent.length > 0, 'report() shows recent transitions');
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
