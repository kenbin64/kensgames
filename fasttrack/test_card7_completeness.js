#!/usr/bin/env node
/**
 * ============================================================
 * CARD 7 SPLIT — COMPLETENESS & LEGALITY (2026-06-06)
 *
 * Locks the fixes for the user-reported "7 split is broken":
 *   1. Safe-zone pegs ARE split-eligible (forward-only, exact
 *      landing) — their split halves were previously dropped.
 *   2. Bullseye is offered in splits as a 1-hit jump from a
 *      FOREIGN ft-* hole (geometry, not the onFasttrack flag),
 *      and is NOT offered from own ft-{bp} or via multi-hop.
 *   3. Every generated split is structurally legal (sum 7, no
 *      self-collision, half==1 for any bullseye terminal).
 *
 * Geometry note: board position 0 → own ft is ft-0; ft-1..ft-5
 * are foreign ring holes for player 0.
 *
 * Run: node fasttrack/test_card7_completeness.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

class StubEl {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; }
  appendChild() {} setAttribute() {} addEventListener() {} removeChild() {} remove() {}
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null, createElement: () => new StubEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: new StubEl(), head: new StubEl(), addEventListener: () => {},
};
global.window = {
  dispatchEvent: () => {}, addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16), cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
var _core = globalThis.__core;
var state = _core.state;
var CARDS = _core.CARDS;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(l) { console.log(`\n── ${l} ──`); }

function reset() {
  ['players', 'board', 'deck', 'turn', 'movement', 'safeZone', 'meta', 'cards', 'holes', 'pegs']
    .forEach(k => state[k]._data.clear());
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}
function holeType(hole) {
  return hole === 'holding' ? 'holding'
    : hole.startsWith('home-') ? 'home'
      : hole.startsWith('ft-') ? 'fasttrack'
        : hole.startsWith('safe-') ? 'safezone'
          : hole.startsWith('side-') ? (hole.startsWith('side-left') ? 'side-left' : 'side-right')
            : hole.startsWith('outer-') ? 'outer'
              : hole === 'bullseye' ? 'bullseye' : 'holding';
}
function makePlayer(idx, bp, specs) {
  const pegs = specs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole, holeType: holeType(s.hole),
    onFasttrack: !!s.onFasttrack, eligibleForSafeZone: !!s.eligible,
    lockedToSafeZone: false, completedCircuit: false,
    fasttrackEntryHole: s.onFasttrack ? `ft-${(bp + 1) % 6}` : null,
    mustExitFasttrack: false, personality: 'NEUTRAL', mood: 'EAGER',
    captureCount: 0, timesCaptured: 0,
  }));
  return { index: idx, name: `P${idx}`, color: '#fff', boardPosition: bp, isBot: false, pegs };
}
function setup(p0Specs) {
  reset();
  const players = [makePlayer(0, 0, p0Specs), makePlayer(1, 3, [{ hole: 'holding' }])];
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
  }
  state.players.set('list', players);
  state.players.set('count', 2);
  state.deck.set('currentCard', { ...state.cards.get('7'), value: '7', display: '7♠' });
  return players;
}
function splits() {
  calculateValidMoves();
  return (state.turn.get('validMoves') || []).filter(m => m.type === 'split');
}
// Structural legality every split must satisfy.
function legalityErrors(s) {
  const e = [];
  if (s.pegIdx === s.peg2Idx) e.push('same peg');
  if (s.dest === s.dest2) e.push(`collision ${s.dest}`);
  if ((s.steps || 0) + (s.steps2 || 0) !== 7) e.push(`sum!=7 (${s.steps}+${s.steps2})`);
  // Any bullseye terminal must be reached via a foreign ft-* hole: either the
  // half is a 1-hit from an ft-* hole, or its path's penultimate hole is ft-*
  // (outer approach). Own ft-0 is never a valid launch.
  const bullOK = (path, from) => {
    if (!Array.isArray(path) || path[path.length - 1] !== 'bullseye') return false;
    if (path.length === 1) return typeof from === 'string' && from.startsWith('ft-') && from !== 'ft-0';
    const penult = path[path.length - 2];
    return typeof penult === 'string' && penult.startsWith('ft-') && penult !== 'ft-0';
  };
  if (s.dest === 'bullseye' && !bullOK(s.path, s.from)) e.push(`bad bullseye path1 ${(s.path || []).join('>')}`);
  if (s.dest2 === 'bullseye' && !bullOK(s.path2, s.from2)) e.push(`bad bullseye path2 ${(s.path2 || []).join('>')}`);
  return e;
}
function allLegal(ss, label) {
  let bad = 0;
  for (const s of ss) { const e = legalityErrors(s); if (e.length) { bad++; console.log(`     ⚠ ${e.join('; ')} [${s._splitKey}]`); } }
  ok(bad === 0, `${label}: all ${ss.length} splits structurally legal`);
}

// ── 1. SAFE-ZONE PEG IS SPLIT-ELIGIBLE ──────────────────────
section('Safe-zone peg participates in splits');
{
  // peg0 in safe-0-1 (can advance to safe-0-2/3/4 → halves 1,2,3),
  // peg1 on the outer rim provides the complementary half.
  setup([
    { hole: 'safe-0-1' },
    { hole: 'outer-2-0' },
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const ss = splits();
  ok(ss.length > 0, 'safezone: splits generated', `got ${ss.length}`);
  allLegal(ss, 'safezone');
  const movesSafePeg = ss.some(m =>
    (m.pegIdx === 0 && String(m.dest).startsWith('safe-0-')) ||
    (m.peg2Idx === 0 && String(m.dest2).startsWith('safe-0-')));
  ok(movesSafePeg, 'safezone: at least one split advances the safe-zone peg within its zone');
  // Exact landing: safe-zone half never overshoots past safe-0-4.
  const noOvershoot = ss.every(m => {
    const half = m.pegIdx === 0 ? (m.path || []) : m.peg2Idx === 0 ? (m.path2 || []) : [];
    return half.every(h => !h.startsWith('safe-') || /^safe-0-[1-4]$/.test(h));
  });
  ok(noOvershoot, 'safezone: no split overshoots the 4-hole safe zone');
}

// ── 2. BULLSEYE 1-HIT FROM FOREIGN ft-* IS OFFERED ──────────
section('Bullseye offered as a split half from a foreign ft hole');
{
  // peg0 on ft-1 (foreign for bp0), peg1 on ft-2 (foreign). Either may 1-hit
  // bullseye while the partner takes 6 on the ring. Bullseye is free.
  setup([
    { hole: 'ft-1', onFasttrack: true },
    { hole: 'ft-2', onFasttrack: true },
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const ss = splits();
  allLegal(ss, 'bull-foreign');
  const hasBull = ss.some(m => m.dest === 'bullseye' || m.dest2 === 'bullseye');
  ok(hasBull, 'bull-foreign: a split routes a foreign-ft peg to bullseye', `splits=${ss.length}`);
  // The bullseye terminal always pairs with a 1-step half.
  const bullSteps = ss.filter(m => m.dest === 'bullseye' || m.dest2 === 'bullseye')
    .every(m => (m.dest === 'bullseye' ? m.steps : m.steps2) === 1);
  ok(bullSteps, 'bull-foreign: every bullseye terminal is a 1-step jump');
}

// ── 3. OWN ft-{bp} GETS NO BULLSEYE ENTRY ───────────────────
section('Own ft-{bp} is outer-rim semantics — no bullseye');
{
  // peg0 on own ft-0, peg1 on foreign ft-2. Only peg1 may bullseye; peg0 must not.
  setup([
    { hole: 'ft-0', onFasttrack: true },
    { hole: 'ft-2', onFasttrack: true },
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const ss = splits();
  allLegal(ss, 'own-ft');
  const peg0Bull = ss.some(m =>
    (m.pegIdx === 0 && m.dest === 'bullseye') || (m.peg2Idx === 0 && m.dest2 === 'bullseye'));
  ok(!peg0Bull, 'own-ft: peg on own ft-0 never routes to bullseye');
}

// ── 4. OCCUPIED BULLSEYE BLOCKS THE VARIANT ─────────────────
section('Own peg on bullseye blocks bullseye splits');
{
  setup([
    { hole: 'ft-1', onFasttrack: true },
    { hole: 'ft-2', onFasttrack: true },
    { hole: 'bullseye' },
    { hole: 'holding' }, { hole: 'holding' },
  ]);
  const ss = splits();
  allLegal(ss, 'bull-occupied');
  const anyBull = ss.some(m => m.dest === 'bullseye' || m.dest2 === 'bullseye');
  ok(!anyBull, 'bull-occupied: no split targets the occupied bullseye');
}

// ── 5. OUTER-APPROACH BULLSEYE (route B, penultimate foreign ft) ─────
section('Bullseye via outer approach (penultimate hole is a foreign ft)');
{
  // peg0 at side-right-0-4: clockwise path is [ft-1, side-left-1-4, ...], so a
  // 2-hop half lands penultimate on the FOREIGN ft-1 then jumps to the center.
  // peg1 on the rim provides the complementary 5 hops.
  setup([
    { hole: 'side-right-0-4' },
    { hole: 'outer-2-0' },
    { hole: 'holding' }, { hole: 'holding' }, { hole: 'holding' },
  ]);
  const ss = splits();
  allLegal(ss, 'outer-bull');
  const routeB = ss.some(m =>
    (m.dest === 'bullseye' && (m.steps || 0) >= 2) ||
    (m.dest2 === 'bullseye' && (m.steps2 || 0) >= 2));
  ok(routeB, 'outer-bull: a multi-hop outer-approach split reaches bullseye', `splits=${ss.length}`);
  const penultFt = ss.filter(m => m.dest === 'bullseye' || m.dest2 === 'bullseye').every(m => {
    const p = m.dest === 'bullseye' ? m.path : m.path2;
    return p[p.length - 2] && p[p.length - 2].startsWith('ft-');
  });
  ok(penultFt, 'outer-bull: every bullseye terminal launches from an ft hole');
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
process.exit(fail ? 1 : 0);
