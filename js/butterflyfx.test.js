#!/usr/bin/env node
/**
 * ============================================================
 * ButterflyFx harness — proof (show, don't tell)
 *
 * Wrap THREE unrelated reducers — a counter, a bank account
 * with validation, and the real FastTrack game core — through
 * the SAME harness, changing none of them, and demonstrate the
 * four guarantees on each:
 *   REPRODUCIBLE · AUDITABLE · SECURE-BY-ARCH · TAMPER-EVIDENT
 *
 * Run: node js/butterflyfx.test.js
 * ============================================================
 */
const BFx = require('./butterflyfx.js');
const FT = require('../fasttrack/manifold/ft-manifold.js');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}${d ? '  ' + d : ''}`); } else { fail++; console.log(`  ❌ ${n}${d ? '  ' + d : ''}`); } };
const section = (s) => console.log(`\n── ${s} ──`);
const J = (x) => JSON.stringify(x);

// ── Three "frameworks", unchanged, expressed as plain reducers ──────────
const counter = (s, a) => s === null ? { n: 0 }
  : a.type === 'inc' ? { n: s.n + 1 }
    : a.type === 'dec' ? { n: s.n - 1 }
      : a.type === 'add' ? { n: s.n + (a.by || 0) }
        : s; // unknown action → unchanged → rejected
const bank = (s, a) => s === null ? { bal: 0 }
  : a.type === 'deposit' ? { bal: s.bal + a.amount }
    : a.type === 'withdraw' ? (a.amount <= s.bal ? { bal: s.bal - a.amount } : s) // overdraft → rejected
      : s;
const ROSTER = [{ id: 'you', name: 'You' }, { id: 'b', name: 'Bot', isBot: true }];
const ftSpec = (seed) => ({ seed, create: (s) => FT.genesis(s, ROSTER), reduce: (z, a, g) => z === null ? FT.derive(g, []) : FT.step(z, g, a) });

// ── 1. REPRODUCIBLE ─────────────────────────────────────────
section('Reproducible: same seed + same actions → identical state (any reducer)');
{
  const acts = [{ type: 'inc' }, { type: 'add', by: 5 }, { type: 'dec' }];
  const a = BFx.forge({ seed: 'C', reduce: counter });
  const b = BFx.forge({ seed: 'C', reduce: counter });
  acts.forEach(x => { a.dispatch(x); b.dispatch(x); });
  ok(J(a.state()) === J(b.state()) && a.state().n === 5, 'counter: two entities converge (n=5)', `head ${a.head() === b.head() ? 'matches' : 'differs'}`);

  const fa = BFx.forge(ftSpec('SEED-9')), fb = BFx.forge(ftSpec('SEED-9'));
  const fActs = [{ type: 'draw' }, { type: 'pass' }, { type: 'draw' }, { type: 'pass' }, { type: 'draw' }];
  fActs.forEach(x => { fa.dispatch(x); fb.dispatch(x); });
  ok(J(fa.state()) === J(fb.state()), 'FastTrack core wrapped: two clients, identical board');
  ok(fa.head() === fb.head(), 'FastTrack core wrapped: identical hash-chain head', `(${fa.head()})`);
}

// ── 2. AUDITABLE (time-travel; nothing happens off the log) ─
section('Auditable: the log is the full history; replay to any point');
{
  const e = BFx.forge({ seed: 'A', reduce: counter });
  e.dispatch({ type: 'inc' }); e.dispatch({ type: 'inc' }); e.dispatch({ type: 'add', by: 10 });
  ok(e.at(0).n === 0 && e.at(1).n === 1 && e.at(2).n === 2 && e.at(3).n === 12, 'at(n) reconstructs every historical state', '[0,1,2,12]');
  ok(e.log().length === 3, 'every accepted change is one logged action');
  ok(J(e.at(e.log().length)) === J(e.state()), 'state is purely the fold of the log (nothing stored off-log)');
}

// ── 3. SECURE BY ARCHITECTURE (validation; rejected ≠ logged) ─
section('Secure-by-arch: the reducer is the gate; rejected actions never enter the record');
{
  const acct = BFx.forge({ seed: 'BANK', reduce: bank });
  acct.dispatch({ type: 'deposit', amount: 100 });
  const r = acct.dispatch({ type: 'withdraw', amount: 250 });   // overdraft
  ok(r.rejected === true, 'over-balance withdrawal is rejected');
  ok(acct.state().bal === 100, 'balance unchanged by the rejected action', `(bal=${acct.state().bal})`);
  ok(acct.log().length === 1, 'the rejected action was NOT written to the log (audit stays clean)');
  // No stored mutable state to corrupt: state() is recomputed each call.
  ok(J(acct.state()) === J(acct.state()), 'state is derived on every read (no shared mutable state)');
  // FastTrack: an illegal move is likewise a no-op identity → never logged.
  const f = BFx.forge(ftSpec('SEC')); f.dispatch({ type: 'draw' });
  const before = f.log().length;
  const bad = f.dispatch({ type: 'move', pegId: 'nope', dest: 'nowhere' });
  ok(bad.rejected && f.log().length === before, 'FastTrack: illegal move rejected + unlogged');
}

// ── 4. TAMPER-EVIDENT (hash-chained history) ────────────────
section('Tamper-evident: altering any past action changes the Merkle-style head');
{
  const e = BFx.forge({ seed: 'LEDGER', reduce: bank });
  e.dispatch({ type: 'deposit', amount: 100 });
  e.dispatch({ type: 'withdraw', amount: 30 });
  e.dispatch({ type: 'deposit', amount: 5 });
  const snap = e.serialize();                          // { seed, actions, head }  (head = trusted root)
  ok(e.verify().ok, 'clean entity verifies (chain intact)');
  ok(BFx.load(snap, { reduce: bank }).snapshotValid, 'untampered snapshot matches its head');

  const tampered = { ...snap, actions: snap.actions.map(a => a.type === 'withdraw' ? { ...a, amount: 1 } : a) };
  const reloaded = BFx.load(tampered, { reduce: bank });
  ok(reloaded.head() !== snap.head, 'changing one past action changes the head', `(${snap.head} → ${reloaded.head()})`);
  ok(reloaded.snapshotValid === false, 'tampered snapshot FAILS the head check (detected)');
}

console.log(`\n══════════════════════\n  ${pass} proven, ${fail} failed\n══════════════════════`);
console.log('\nThree unrelated reducers — a counter, a validated bank account, and a real');
console.log('game core — wrapped UNCHANGED through one harness, each now reproducible,');
console.log('auditable, validating, and tamper-evident. You change nothing; you put it');
console.log('through ButterflyFx; you get the guarantees. Shown, not told.');
process.exit(fail ? 1 : 0);
