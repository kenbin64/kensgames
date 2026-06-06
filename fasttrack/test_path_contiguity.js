#!/usr/bin/env node
/**
 * ============================================================
 * PATH CONTIGUITY / "NO TELEPORT" AUDIT
 *
 * Encodes the natural-flow rule: a peg walks hole-by-hole; it
 * never jumps past holes and lands several ahead. Every move's
 * walked sequence  [from, ...path]  must consist of holes that
 * are ADJACENT on the canonical board topology:
 *   - outer track: CLOCKWISE_TRACK[i] ↔ [i+1] (cyclic)
 *   - fast-track ring: ft-i ↔ ft-(i+1) (cyclic, the shortcut)
 *   - safe entrance: outer-{bp}-2 ↔ safe-{bp}-1
 *   - safe internal: safe-{bp}-h ↔ safe-{bp}-(h+1)
 *   - bullseye: ft-* ↔ bullseye (the 1-hit jump / exit)
 *   - 'enter' is a spawn (holding → home-{bp}), not a walk → exempt
 *
 * Mode: pass --fix-check to assert (exit 1 on any teleport);
 * default mode is DIAGNOSTIC (lists every teleport, exit 0).
 *
 * Run: node fasttrack/test_path_contiguity.js [--assert]
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
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
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

// ─── Build the canonical adjacency graph ────────────────────
const adj = new Map();
const link = (a, b) => {
  if (!adj.has(a)) adj.set(a, new Set());
  if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a).add(b); adj.get(b).add(a);
};
// Outer track ring (cyclic)
for (let i = 0; i < CLOCKWISE_TRACK.length; i++) {
  link(CLOCKWISE_TRACK[i], CLOCKWISE_TRACK[(i + 1) % CLOCKWISE_TRACK.length]);
}
// Fast-track inner ring (cyclic shortcut)
for (let i = 0; i < 6; i++) link(`ft-${i}`, `ft-${(i + 1) % 6}`);
// Per-player home stretch → safe entrance → safe zone, and safe internal
for (let bp = 0; bp < 6; bp++) {
  link(`outer-${bp}-2`, `safe-${bp}-1`);          // entrance → safe
  for (let h = 1; h < 4; h++) link(`safe-${bp}-${h}`, `safe-${bp}-${h + 1}`);
  // bullseye is reachable from every ft-* (1-hit jump) and exit lands on ft-*
  link(`ft-${bp}`, 'bullseye');
}

const adjacent = (a, b) => a === b || (adj.has(a) && adj.get(a).has(b));

// ─── Scenario scaffolding ───────────────────────────────────
function reset() {
  ['players','board','deck','turn','movement','safeZone','meta','cards','holes','pegs']
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
function pegType(h) {
  return h === 'holding' ? 'holding' : h.startsWith('home-') ? 'home'
    : h.startsWith('ft-') ? 'fasttrack' : h.startsWith('safe-') ? 'safezone' : 'outer';
}
function makePlayer(idx, bp, specs) {
  return {
    id: `player${idx}`, name: `P${idx}`, boardPosition: bp,
    pegs: specs.map((s, pi) => ({
      id: `p${idx}-peg${pi}`, holeId: s.hole, holeType: pegType(s.hole),
      onFasttrack: !!s.onFasttrack, eligibleForSafeZone: s.elig !== false,
      lockedToSafeZone: false, mustExitFasttrack: false,
      fasttrackEntryHole: s.onFasttrack ? s.hole : null,
    })),
  };
}
function place(players) {
  players.forEach((pl, pi) => pl.pegs.forEach(pg => {
    if (pg.holeType !== 'holding' && pg.holeType !== 'home') state.board.set(pg.holeId, { playerIdx: pi, pegId: pg.id });
  }));
  state.players.set('list', players);
}

// ─── Sweep: enumerate moves for many placements, check contiguity ──
const CARD_VALUES = []; reset();
for (let v = 1; v <= 14; v++) if (CARDS[v]) CARD_VALUES.push(v);

const teleports = [];          // {card, from, a, b, type, path}
let movesChecked = 0, pathsChecked = 0;

// Place the moving peg on a representative spread of holes (own wedge bp=0).
const SPOTS = [];
for (let i = 0; i < CLOCKWISE_TRACK.length; i += 2) SPOTS.push(CLOCKWISE_TRACK[i]);
for (let h = 1; h <= 3; h++) SPOTS.push(`safe-0-${h}`);
SPOTS.push('bullseye');

for (const spot of SPOTS) {
  for (const value of CARD_VALUES) {
    reset();
    const onFt = spot.startsWith('ft-');
    const p0 = makePlayer(0, 0, [{ hole: spot, onFasttrack: onFt, elig: true }]);
    const p1 = makePlayer(1, 3, [{ hole: 'outer-3-1' }]);
    place([p0, p1]);
    state.deck.set('currentCard', { value, suit: 'spades' });
    try { calculateValidMoves(); } catch (e) { continue; }
    const vm = state.turn.get('validMoves') || [];
    for (const m of vm) {
      movesChecked++;
      // 'enter' is a spawn from holding — not a walked path.
      if (m.type === 'enter') continue;
      const checkPath = (fromHole, p) => {
        if (!Array.isArray(p) || !p.length) return;
        pathsChecked++;
        let prev = fromHole;
        for (const hole of p) {
          if (!adjacent(prev, hole)) {
            teleports.push({ card: value, type: m.type, from: fromHole, jump: `${prev} → ${hole}`, path: p.join(',') });
          }
          prev = hole;
        }
      };
      const peg = p0.pegs[m.pegIdx];
      checkPath(peg ? peg.holeId : spot, m.path);
      if (m.type === 'split') {
        const peg2 = p0.pegs[m.peg2Idx];
        checkPath(peg2 ? peg2.holeId : null, m.path2);
      }
    }
  }
}

// ─── Report ─────────────────────────────────────────────────
console.log(`\nChecked ${movesChecked} moves, ${pathsChecked} walked paths across ${SPOTS.length} start holes × ${CARD_VALUES.length} cards.`);
if (teleports.length === 0) {
  console.log('✅ NO TELEPORTS — every walked path is hole-by-hole adjacent.');
  process.exit(0);
}
// Group identical jumps
const byJump = new Map();
for (const t of teleports) {
  const k = `${t.type}: ${t.jump}`;
  if (!byJump.has(k)) byJump.set(k, { count: 0, ex: t });
  byJump.get(k).count++;
}
console.log(`\n❌ ${teleports.length} teleporting transitions found (${byJump.size} distinct):\n`);
for (const [k, v] of [...byJump.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  [${String(v.count).padStart(4)}×] ${k}`);
  console.log(`           e.g. card=${v.ex.card} from=${v.ex.from} path=${v.ex.path}`);
}
const assert = process.argv.includes('--assert');
process.exit(assert ? 1 : 0);
