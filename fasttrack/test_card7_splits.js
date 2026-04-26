#!/usr/bin/env node
/**
 * ============================================================
 * CARD 7 SPLIT MOVE TEST SUITE
 * Validates _ftRuleOK, collision guard, bullseye gating, and
 * FT-priority filtering on top of fasttrack-game-core.js.
 * Run: node fasttrack/test_card7_splits.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ─── Browser environment stubs ──────────────────────────────
class StubElement {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; }
  appendChild() { } setAttribute() { } addEventListener() { } removeChild() { } remove() { }
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null,
  createElement: () => new StubElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: new StubElement(),
  head: new StubElement(),
  addEventListener: () => { },
};
global.window = {
  dispatchEvent: () => { },
  addEventListener: () => { },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// ─── Load game core into this scope ─────────────────────────
// Direct eval of `const state = …` doesn't leak the binding; instead we
// rewrite the trailing `window.FastTrackCore = {…}` to expose symbols on
// `globalThis.__core` so tests can read them.
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
// In non-strict eval, top-level function declarations leak to the surrounding
// scope, so `calculateValidMoves`, `getTrackSequence`, `buildCardMatrix` etc.
// are already visible here. Top-level `const`s (state, CARDS, CLOCKWISE_TRACK)
// do NOT leak — read those off `globalThis.__core`. Use `var` to avoid TDZ /
// re-declaration conflicts with the leaked function names.
var _core = globalThis.__core;
var state = _core.state;
var CARDS = _core.CARDS;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

// ─── Test harness ───────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(label) { console.log(`\n── ${label} ──`); }

// ─── Scenario builder ───────────────────────────────────────
function reset() {
  state.players._data.clear();
  state.board._data.clear();
  state.deck._data.clear();
  state.turn._data.clear();
  state.movement._data.clear();
  state.safeZone._data.clear();
  state.meta._data.clear();
  state.cards._data.clear();
  state.holes._data.clear();
  state.pegs._data.clear();
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}
function makePlayer(idx, bp, pegSpecs) {
  // pegSpecs: [{ hole, onFasttrack?, eligibleForSafeZone? }, ...]
  const pegs = pegSpecs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole,
    holeType: s.hole === 'holding' ? 'holding'
      : s.hole.startsWith('home-') ? 'home'
        : s.hole.startsWith('ft-') ? 'fasttrack'
          : s.hole.startsWith('safe-') ? 'safezone'
            : s.hole.startsWith('side-') ? (s.hole.startsWith('side-left') ? 'side-left' : 'side-right')
              : s.hole.startsWith('outer-') ? 'outer'
                : s.hole === 'bullseye' ? 'bullseye' : 'holding',
    onFasttrack: !!s.onFasttrack,
    eligibleForSafeZone: !!s.eligibleForSafeZone,
    lockedToSafeZone: false, completedCircuit: false,
    fasttrackEntryHole: s.onFasttrack ? `ft-${(bp + 1) % 6}` : null,
    mustExitFasttrack: false,
    personality: 'NEUTRAL', mood: 'EAGER', captureCount: 0, timesCaptured: 0,
  }));
  return { index: idx, name: `P${idx}`, color: '#fff', boardPosition: bp, isBot: false, pegs };
}
function setupTwoPlayer(p0Specs, p1Specs = [{ hole: 'holding' }]) {
  reset();
  const players = [makePlayer(0, 0, p0Specs), makePlayer(1, 3, p1Specs)];
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
  }
  state.players.set('list', players);
  state.players.set('count', 2);
  state.deck.set('currentCard', { ...state.cards.get('7'), value: '7', display: '7♠' });
  return players;
}
function getSplits() {
  calculateValidMoves();
  return (state.turn.get('validMoves') || []).filter(m => m.type === 'split');
}

// ─── Independent rule validator (re-implementation for cross-check) ──
function validateSplitAgainstRule(move, player) {
  const errors = [];
  if (move.type !== 'split') return errors;
  const peg1 = player.pegs[move.pegIdx];
  const peg2 = player.pegs[move.peg2Idx];
  if (!peg1 || !peg2) errors.push('missing peg');
  if (move.pegIdx === move.peg2Idx) errors.push('same peg both halves');
  if (move.dest === move.dest2) errors.push(`collision dest=${move.dest}`);
  if ((move.steps || 0) + (move.steps2 || 0) !== 7) errors.push(`steps sum != 7 (${move.steps}+${move.steps2})`);
  const ftCount = player.pegs.filter(p => p.onFasttrack).length;
  if (ftCount > 0) {
    const ftInSplit = (peg1.onFasttrack ? 1 : 0) + (peg2.onFasttrack ? 1 : 0);
    if (ftInSplit < Math.min(ftCount, 2)) errors.push(`ftInSplit=${ftInSplit}<min(${ftCount},2)`);
    const allFT = (path) => Array.isArray(path) && path.every(h => typeof h === 'string' && h.startsWith('ft-'));
    if (peg1.onFasttrack && !allFT(move.path)) errors.push(`peg1 path leaves FT: ${(move.path || []).join(',')}`);
    if (peg2.onFasttrack && !allFT(move.path2)) errors.push(`peg2 path leaves FT: ${(move.path2 || []).join(',')}`);
  }
  return errors;
}
function checkAllSplits(splits, player, label) {
  let bad = 0;
  for (const m of splits) {
    const errs = validateSplitAgainstRule(m, player);
    if (errs.length) { bad++; console.log(`     ⚠ ${label}: ${errs.join('; ')}  [${m._splitKey}]`); }
  }
  ok(bad === 0, `${label}: all ${splits.length} generated splits satisfy the rule`);
}

// ─── SCENARIO 1: No FT pegs, two rim pegs ───────────────────
section('Scenario 1: no FT pegs (baseline)');
{
  const players = setupTwoPlayer([
    { hole: 'outer-2-0' },
    { hole: 'outer-3-0' },
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const splits = getSplits();
  ok(splits.length > 0, 'baseline: at least one split generated', `got ${splits.length}`);
  checkAllSplits(splits, players[0], 'baseline');
  // Each ordered (pi1, pi2) pair × (a from 1..6) — only 2 active pegs → 2 ordered pairs × 6 a-values = 12
  ok(splits.length === 12, 'baseline: 12 splits (2 ordered peg pairs × 6 a-values)', `got ${splits.length}`);
}

// ─── SCENARIO 2: One FT peg + two non-FT pegs ───────────────
section('Scenario 2: 1 FT peg + 2 non-FT pegs');
{
  const players = setupTwoPlayer([
    { hole: 'ft-3', onFasttrack: true },     // dist=3 to own ft-0 ⇒ all-FT for a∈{1,2,3}
    { hole: 'outer-2-0' },
    { hole: 'outer-3-0' },
    { hole: 'holding' }, { hole: 'holding' },
  ]);
  const splits = getSplits();
  ok(splits.length > 0, '1FT: at least one split generated', `got ${splits.length}`);
  checkAllSplits(splits, players[0], '1FT');
  // Every split MUST include peg0 (the only FT peg)
  const allIncludeFT = splits.every(m => m.pegIdx === 0 || m.peg2Idx === 0);
  ok(allIncludeFT, '1FT: every split includes the FT peg (peg0)');
  // FT peg's path must be all-FT
  const ftPathOK = splits.every(m => {
    const ftSide = m.pegIdx === 0 ? m.path : m.path2;
    return ftSide.every(h => h.startsWith('ft-'));
  });
  ok(ftPathOK, '1FT: FT peg path is entirely on the ring');
  // Non-FT peg can land anywhere (not constrained)
  const hasNonFTLanding = splits.some(m => {
    const otherSide = m.pegIdx === 0 ? m.path2 : m.path;
    return otherSide.some(h => !h.startsWith('ft-'));
  });
  ok(hasNonFTLanding, '1FT: non-FT peg can move off-FT (other half unconstrained)');
}

// ─── SCENARIO 3: Two FT pegs — splits ENABLED under FT-passing relax ──
// Option A (user_directive_2026-04-25): own pegs may PASS each other on the
// `ft-*` ring; only landing on a same-color peg is forbidden. With peg0 at
// ft-3 and peg1 at ft-1 (own ft = ft-0), the relax unlocks several splits.
section('Scenario 3: 2 FT pegs — splits enabled by FT-ring passing relax');
{
  const players = setupTwoPlayer([
    { hole: 'ft-3', onFasttrack: true },
    { hole: 'ft-1', onFasttrack: true },
    { hole: 'outer-2-0' },
    { hole: 'holding' }, { hole: 'holding' },
  ]);
  const splits = getSplits();
  checkAllSplits(splits, players[0], '2FT');
  ok(splits.length > 0, '2FT: at least one split generated under relaxed passing', `got ${splits.length}`);
  // Every split must include ONLY FT pegs (peg0 and peg1) — peg2 is non-FT.
  const ftOnly = splits.every(m => m.pegIdx <= 1 && m.peg2Idx <= 1);
  ok(ftOnly, '2FT: every split uses only FT pegs (rim peg2 excluded)');
  // Both halves' paths must be entirely on FT.
  const allFTPaths = splits.every(m =>
    m.path.every(h => h.startsWith('ft-')) &&
    m.path2.every(h => h.startsWith('ft-')));
  ok(allFTPaths, '2FT: every split has all-FT paths for both halves');
  // FT-priority preserved.
  const ftStillSet = players[0].pegs.filter(p => p.onFasttrack).length;
  ok(ftStillSet === 2, '2FT: FT status preserved', `onFT=${ftStillSet}`);
  const allMoves = state.turn.get('validMoves') || [];
  const bullMoves = allMoves.filter(m => m.type === 'enterBullseye');
  ok(bullMoves.length >= 1, '2FT: enterBullseye available for at least one FT peg', `got ${bullMoves.length}`);
}

// ─── SCENARIO 4: 3 FT pegs (one on own ft) + own peg on bullseye ──
// peg0 at own ft-0 has full-ring all-FT seq [ft-1..ft-5, ft-0] → 1..5-step
// all-FT moves available. Combined with peg1/peg2 (also on ring), generates
// multiple splits. peg0 + peg1 and peg0 + peg2 contribute; peg1 + peg2 cannot
// fit a 7-step split entirely on FT without colliding.
section('Scenario 4: 3 FT pegs (peg0 on own ft) + bullseye blocked');
{
  const players = setupTwoPlayer([
    { hole: 'ft-0', onFasttrack: true },     // peg0 — on own ft, can loop the ring
    { hole: 'ft-1', onFasttrack: true },     // peg1
    { hole: 'ft-2', onFasttrack: true },     // peg2
    { hole: 'bullseye' },                    // peg3 on bullseye → blocks bullseye variants
    { hole: 'holding' },
  ]);
  const splits = getSplits();
  checkAllSplits(splits, players[0], '3FT-on-ft0');
  ok(splits.length > 0, '3FT-on-ft0: splits generated under FT-passing relax', `got ${splits.length}`);
  // No bullseye-variant splits (own peg occupies bullseye).
  const bullVariants = splits.filter(m => m._splitKey && m._splitKey.includes('B'));
  ok(bullVariants.length === 0, '3FT-on-ft0: no bullseye-variant splits (bullseye blocked)');
  // Splits must use peg0 (which has the longest all-FT reach via own-ft loop)
  // OR be a peg1+peg2 combination (analytically impossible here → must include peg0).
  const allIncludePeg0 = splits.every(m => m.pegIdx === 0 || m.peg2Idx === 0);
  ok(allIncludePeg0, '3FT-on-ft0: every split includes peg0 (peg1+peg2 collide)');
}

// ─── SCENARIO 5: Three FT pegs evenly spaced → still 0 valid splits ──
// peg0=ft-3, peg1=ft-1, peg2=ft-5 (all 2-apart). Even with the FT-passing
// relax, every two-peg pairing either lands a peg on another own peg or
// requires a path that exits FT (failing the all-FT rule). This documents
// a true edge case where Card 7 has no legal split.
section('Scenario 5: 3 FT pegs evenly spaced — no legal split (collisions/FT-exit)');
{
  const players = setupTwoPlayer([
    { hole: 'ft-3', onFasttrack: true },
    { hole: 'ft-1', onFasttrack: true },
    { hole: 'ft-5', onFasttrack: true },
    { hole: 'outer-2-0' },
    { hole: 'holding' },
  ]);
  const splits = getSplits();
  checkAllSplits(splits, players[0], '3FT-spread');
  ok(splits.length === 0, '3FT-spread: 0 valid splits (every pairing collides or exits FT)', `got ${splits.length}`);
  const noRim = splits.every(m => m.pegIdx !== 3 && m.peg2Idx !== 3);
  ok(noRim, '3FT-spread: rim peg never appears in any split');
  const ftStillSet = players[0].pegs.filter(p => p.onFasttrack).length;
  ok(ftStillSet === 3, '3FT-spread: all FT pegs retain status', `onFT=${ftStillSet}`);
}

// ─── SCENARIO 6: Bullseye occupancy gates bullseye variants ──
section('Scenario 6: own peg on bullseye blocks bullseye-variant splits');
{
  // Two non-FT pegs near FT so penultimate-FT path exists; bullseye occupied by own peg.
  const players = setupTwoPlayer([
    { hole: 'side-left-0-2' },               // 3 steps to ft-1 going CW? Actually approaches own ft via outer
    { hole: 'side-left-3-2' },               // approaches ft-4 — penultimate-FT eligible
    { hole: 'bullseye' },                    // own peg on bullseye
    { hole: 'holding' }, { hole: 'holding' },
  ]);
  const splits = getSplits();
  // Bullseye-variant splits are encoded with 'B' suffix in _splitKey.
  const bullVariants = splits.filter(m => m._splitKey && m._splitKey.includes('B'));
  ok(bullVariants.length === 0, 'bullseye-blocked: no bullseye-variant splits', `got ${bullVariants.length}`);
  // Standard splits should still be present
  ok(splits.length > 0, 'bullseye-blocked: standard rim splits still generated', `got ${splits.length}`);
  checkAllSplits(splits, players[0], 'bullseye-blocked');
}

// ─── SCENARIO 7: Same-destination collision filter ──────────
section('Scenario 7: split combinations landing on same hole are filtered');
{
  // Two pegs equidistant such that some (a,b) ordering would collide on the same dest.
  const players = setupTwoPlayer([
    { hole: 'outer-1-0' },
    { hole: 'outer-1-3' },                   // 4 holes ahead of peg0 along CW
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const splits = getSplits();
  ok(splits.length > 0, 'collision-test: some splits generated', `got ${splits.length}`);
  // No split should have dest === dest2
  const collisions = splits.filter(m => m.dest === m.dest2);
  ok(collisions.length === 0, 'collision-test: no split has dest === dest2', `found ${collisions.length}`);
  checkAllSplits(splits, players[0], 'collision-test');
}

// ─── SCENARIO 8: Only one peg has a legal move ──────────────
section('Scenario 8: only one peg active → no splits, single 7-step move');
{
  const players = setupTwoPlayer([
    { hole: 'outer-2-0' },
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const splits = getSplits();
  ok(splits.length === 0, 'single-peg: no splits generated (need ≥ 2 active pegs)', `got ${splits.length}`);
  const allMoves = state.turn.get('validMoves') || [];
  const sevenMoves = allMoves.filter(m => m.type === 'move' && m.steps === 7);
  ok(sevenMoves.length >= 1, 'single-peg: 7-step single move exists', `got ${sevenMoves.length}`);
}

// ─── SCENARIO 9: Single-peg FT-passing relax (non-Card-7) ──
// Verify that on a non-7 card, an FT peg may PASS over an own FT peg on the
// ring (Option A relax), with the destination still required to be free.
section('Scenario 9: single-peg FT-passing relax — pegs may pass own pegs on the ring');
{
  const players = setupTwoPlayer([
    { hole: 'ft-1', onFasttrack: true },     // peg0 — about to pass through peg1
    { hole: 'ft-3', onFasttrack: true },     // peg1 — sits on the ring in peg0's path
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  // Use Card 5: peg0 at ft-1 + 5 = ft-0 (own = completion). Path:
  // [ft-2, ft-3 (peg1 own — pass through allowed), ft-4, ft-5, ft-0].
  state.deck.set('currentCard', { ...state.cards.get('5'), value: '5', display: '5♣' });
  calculateValidMoves();
  const allMoves = state.turn.get('validMoves') || [];
  // peg0 should have a 5-step move ending at ft-0 — passing through ft-3 (peg1).
  const peg0FullMove = allMoves.find(m =>
    m.type === 'move' && m.pegIdx === 0 && m.steps === 5 && m.dest === 'ft-0');
  ok(!!peg0FullMove, 'pass-relax: peg0 5-step move to ft-0 generated (passes through peg1)',
    `got moves=${allMoves.filter(m => m.pegIdx === 0).map(m => `${m.type}:${m.dest}/${m.steps}`).join(',') || '(none)'}`);
  if (peg0FullMove) {
    ok(peg0FullMove.path.includes('ft-3'),
      'pass-relax: path passes through ft-3 (peg1\'s position)',
      `path=${peg0FullMove.path.join(',')}`);
  }
  // Negative: if peg0's destination IS peg1's hole, it must be blocked.
  // Card 2: peg0 at ft-1 + 2 = ft-3 (peg1 own → blocked landing).
  state.deck.set('currentCard', { ...state.cards.get('2'), value: '2', display: '2♠' });
  calculateValidMoves();
  const movesAfter = state.turn.get('validMoves') || [];
  const wouldLand = movesAfter.find(m =>
    m.type === 'move' && m.pegIdx === 0 && m.dest === 'ft-3');
  ok(!wouldLand, 'pass-relax: peg0 cannot LAND on peg1 (destination collision still blocked)');
}

// ─── SCENARIO 10: Comprehensive cross-validator over all scenarios ──
section('Scenario 10: cross-validator (every generated split obeys rule independently)');
{
  // Re-run each scenario quickly and feed every split through the independent validator.
  // Any discrepancy here means generation logic and rule interpretation diverged.
  const setups = [
    () => setupTwoPlayer([{ hole: 'outer-2-0' }, { hole: 'outer-3-0' }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]),
    () => setupTwoPlayer([{ hole: 'ft-3', onFasttrack: true }, { hole: 'outer-2-0' }, { hole: 'outer-3-0' }, { hole: 'holding' }, { hole: 'holding' }]),
    () => setupTwoPlayer([{ hole: 'ft-3', onFasttrack: true }, { hole: 'ft-1', onFasttrack: true }, { hole: 'outer-2-0' }, { hole: 'holding' }, { hole: 'holding' }]),
    () => setupTwoPlayer([{ hole: 'ft-0', onFasttrack: true }, { hole: 'ft-5', onFasttrack: true }, { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' }]),
    () => setupTwoPlayer([{ hole: 'ft-2', onFasttrack: true }, { hole: 'ft-4', onFasttrack: true }, { hole: 'ft-3', onFasttrack: true }, { hole: 'outer-2-0' }, { hole: 'holding' }]),
  ];
  let totalSplits = 0, totalErrors = 0;
  for (let i = 0; i < setups.length; i++) {
    const players = setups[i]();
    const splits = getSplits();
    totalSplits += splits.length;
    for (const m of splits) {
      const errs = validateSplitAgainstRule(m, players[0]);
      if (errs.length) {
        totalErrors++;
        console.log(`     ⚠ setup #${i}: ${errs.join('; ')}  [${m._splitKey}]`);
      }
    }
  }
  ok(totalErrors === 0, `cross-validator: 0 rule violations across ${totalSplits} generated splits`, `errors=${totalErrors}`);
}

// ─── SCENARIO 11: rules.json ↔ code synchronization ───────────────
// Single source of truth: fasttrack.rules.json. Drift becomes a test failure.
// Verifies (a) every card matrix row matches cards.{rank}, (b) PEGS_PER_PLAYER
// === setup.pegs_per_player, (c) SAFE_ZONE_SIZE === geometry.safe_zone.holes_per_player,
// (d) every rule has a unique (x,y,z) tuple with z = x*y.
section('Scenario 11: rules.json ↔ code synchronization (z = x·y axiom)');
{
  const rulesPath = path.join(__dirname, 'fasttrack.rules.json');
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

  // (a) Card matrix sync — code's CARDS proxy vs rules.json :: cards.{rank}.
  const FIELD_MAP = {
    movement: 'movement',
    direction: 'direction',
    extraTurn: 'extra_turn',
    canEnter: 'can_enter_from_holding',
    canExitBullseye: 'can_exit_bullseye',
  };
  // direction in rules.json uses 'counter_clockwise'; code uses 'backward' for Card 4.
  const DIRECTION_ALIASES = { counter_clockwise: 'backward', clockwise: 'clockwise' };
  let cardMismatches = 0;
  for (const rank of Object.keys(rules.cards)) {
    const r = rules.cards[rank];
    const c = CARDS[rank];
    if (!c) { cardMismatches++; console.log(`     ⚠ ${rank}: missing in code CARDS`); continue; }
    for (const [codeField, jsonField] of Object.entries(FIELD_MAP)) {
      let expected = r[jsonField];
      if (codeField === 'direction') expected = DIRECTION_ALIASES[expected] ?? expected;
      const actual = c[codeField];
      if (actual !== expected) {
        cardMismatches++;
        console.log(`     ⚠ ${rank}.${codeField}: code=${actual} vs rules.${jsonField}=${expected}`);
      }
    }
    // z-axiom: z must equal x*y for every card definition.
    if (r.z !== r.x * r.y) {
      cardMismatches++;
      console.log(`     ⚠ ${rank}: z=${r.z} but x·y=${r.x * r.y}`);
    }
  }
  ok(cardMismatches === 0, `card matrix matches rules.json (z = x·y for all cards)`,
    `mismatches=${cardMismatches}`);

  // (b) Setup constants — code consts must equal rules.json values exactly.
  const PPP = _core.PEGS_PER_PLAYER;
  const SZS = _core.SAFE_ZONE_SIZE;
  ok(PPP === rules.setup.pegs_per_player,
    `code PEGS_PER_PLAYER (${PPP}) === rules.json setup.pegs_per_player (${rules.setup.pegs_per_player})`);
  ok(SZS === rules.board.safe_zone.holes_per_player,
    `code SAFE_ZONE_SIZE (${SZS}) === rules.json board.safe_zone.holes_per_player (${rules.board.safe_zone.holes_per_player})`);

  // (c) Every rule satisfies z = x*y AND every (x,y) tuple is unique.
  let zViolations = 0, dupeViolations = 0;
  const seen = new Map();
  for (const rule of rules.rules) {
    if (rule.z !== rule.x * rule.y) {
      zViolations++;
      console.log(`     ⚠ ${rule.id}: z=${rule.z} but x·y=${rule.x * rule.y}`);
    }
    const key = `${rule.x},${rule.y}`;
    if (seen.has(key)) {
      dupeViolations++;
      console.log(`     ⚠ ${rule.id} collides with ${seen.get(key)} at (x=${rule.x}, y=${rule.y})`);
    } else {
      seen.set(key, rule.id);
    }
  }
  ok(zViolations === 0, `every rule satisfies z = x·y axiom`, `violations=${zViolations}`);
  ok(dupeViolations === 0, `every (x,y) tuple is unique across rules`, `dupes=${dupeViolations}`);
}

// ─── Final summary ──────────────────────────────────────────
console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);
