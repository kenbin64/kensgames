#!/usr/bin/env node
/**
 * CARD 7 CRASH PROBE
 * Drives a 7 through move generation AND execution across many board states,
 * catching anything that throws. Diagnostic only, not part of the suite.
 * Run: node fasttrack/probe_card7_crash.js
 */

const fs = require('fs');
const path = require('path');

class StubElement {
  constructor() { this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false; this.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } }; }
  appendChild() {} setAttribute() {} addEventListener() {} removeChild() {} remove() {}
  querySelector() { return null; } querySelectorAll() { return []; }
}
global.document = {
  getElementById: () => null,
  createElement: () => new StubElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: new StubElement(),
  head: new StubElement(),
  addEventListener: () => {},
};
global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);

var _core = globalThis.__core;
var state = _core.state;
var CLOCKWISE_TRACK = _core.CLOCKWISE_TRACK;

function reset() {
  for (const k of ['players','board','deck','turn','movement','safeZone','meta','cards','holes','pegs']) {
    state[k]._data.clear();
  }
  buildCardMatrix();
  for (const h of CLOCKWISE_TRACK) state.board.set(h, null);
  for (let p = 0; p < 6; p++) for (let h = 1; h <= 4; h++) state.board.set(`safe-${p}-${h}`, null);
  state.board.set('bullseye', null);
  state.safeZone.set('log', []);
  state.players.set('current', 0);
  state.deck.set('discard', []);
  state.turn.set('phase', 'move');
}

function makePlayer(idx, bp, specs) {
  const pegs = specs.map((s, pi) => ({
    id: `p${idx}-peg${pi}`, holeId: s.hole,
    holeType: s.hole === 'holding' ? 'holding'
      : s.hole.startsWith('home-') ? 'home'
      : s.hole.startsWith('ft-') ? 'fasttrack'
      : s.hole.startsWith('safe-') ? 'safezone'
      : s.hole.startsWith('side-left') ? 'side-left'
      : s.hole.startsWith('side-right') ? 'side-right'
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

function setup(p0Specs, p1Specs = [{ hole: 'holding' }], card = '7') {
  reset();
  const players = [makePlayer(0, 0, p0Specs), makePlayer(1, 3, p1Specs)];
  for (const pl of players) for (const pg of pl.pegs) {
    if (pg.holeId !== 'holding') state.board.set(pg.holeId, { playerIdx: pl.index, pegId: pg.id });
  }
  state.players.set('list', players);
  state.players.set('count', 2);
  state.deck.set('currentCard', { ...state.cards.get(card), value: card, display: `${card}♠` });
  return players;
}

// A spread of board states a 7 can legitimately be drawn into.
const OUTER = CLOCKWISE_TRACK.filter(h => h.startsWith('outer-'));
const SIDES = CLOCKWISE_TRACK.filter(h => h.startsWith('side-'));
const FTS   = CLOCKWISE_TRACK.filter(h => h.startsWith('ft-'));

const SCENARIOS = [
  ['all holding',            [{ hole: 'holding' }, { hole: 'holding' }]],
  ['one on outer-0',         [{ hole: OUTER[0] }, { hole: 'holding' }]],
  ['two on outer',           [{ hole: OUTER[0] }, { hole: OUTER[5] }]],
  ['three spread',           [{ hole: OUTER[0] }, { hole: OUTER[9] }, { hole: SIDES[0] || OUTER[15] }]],
  ['one on own ft',          [{ hole: 'ft-0', onFasttrack: true }, { hole: OUTER[4] }]],
  ['two on ft',              [{ hole: 'ft-0', onFasttrack: true }, { hole: 'ft-1', onFasttrack: true }]],
  ['ft + safezone',          [{ hole: 'ft-0', onFasttrack: true }, { hole: 'safe-0-1' }]],
  ['safezone only',          [{ hole: 'safe-0-1' }, { hole: 'safe-0-2' }]],
  ['safezone deep',          [{ hole: 'safe-0-4' }, { hole: OUTER[3] }]],
  ['bullseye + outer',       [{ hole: 'bullseye' }, { hole: OUTER[7] }]],
  ['near safe entry',        [{ hole: OUTER[OUTER.length - 1], eligibleForSafeZone: true }, { hole: OUTER[2] }]],
  ['eligible + ft',          [{ hole: OUTER[1], eligibleForSafeZone: true }, { hole: 'ft-2', onFasttrack: true }]],
  ['five pegs',              [{ hole: OUTER[0] }, { hole: OUTER[3] }, { hole: OUTER[6] }, { hole: OUTER[9] }, { hole: 'holding' }]],
  ['crowded own',            [{ hole: OUTER[0] }, { hole: OUTER[1] }, { hole: OUTER[2] }, { hole: OUTER[3] }]],
];

let genFail = 0, execFail = 0, totalMoves = 0, scenariosRun = 0;
const problems = [];

console.log('CARD 7 CRASH PROBE');
console.log('='.repeat(70));

for (const [label, specs] of SCENARIOS) {
  scenariosRun++;
  let moves = [];

  // --- generation ---
  try {
    setup(specs);
    calculateValidMoves();
    moves = state.turn.get('validMoves') || [];
  } catch (e) {
    genFail++;
    problems.push({ phase: 'generate', label, err: e });
    console.log(`\n❌ GENERATE THREW · ${label}`);
    console.log(`   ${e && e.constructor ? e.constructor.name : '?'}: ${e && e.message}`);
    console.log(String(e && e.stack || '').split('\n').slice(1, 5).map(l => '   ' + l.trim()).join('\n'));
    continue;
  }

  totalMoves += moves.length;
  const kinds = {};
  for (const m of moves) kinds[m.type] = (kinds[m.type] || 0) + 1;
  console.log(`\n✅ ${label}: ${moves.length} moves  ${JSON.stringify(kinds)}`);

  // --- rules.movement must be restored to 7 after generation ---
  const rulesNow = (typeof rules !== 'undefined' && rules) ? rules.movement : undefined;
  if (rulesNow !== undefined && rulesNow !== 7) {
    problems.push({ phase: 'rules-leak', label, err: new Error(`rules.movement left at ${rulesNow}`) });
    console.log(`   ⚠️  rules.movement left at ${rulesNow} after generation (expected 7)`);
  }

  // --- execution: every generated move must execute without throwing ---
  for (let i = 0; i < moves.length; i++) {
    try {
      setup(specs);
      calculateValidMoves();
      const fresh = state.turn.get('validMoves') || [];
      if (!fresh[i]) continue;
      executeMove(fresh[i]);
    } catch (e) {
      execFail++;
      const m = moves[i];
      problems.push({ phase: 'execute', label, move: m, err: e });
      console.log(`   ❌ EXECUTE THREW on move[${i}] type=${m.type} dest=${m.dest}`);
      console.log(`      ${e && e.constructor ? e.constructor.name : '?'}: ${e && e.message}`);
      console.log(String(e && e.stack || '').split('\n').slice(1, 4).map(l => '      ' + l.trim()).join('\n'));
    }
  }
}

console.log('\n' + '='.repeat(70));
console.log(`scenarios ${scenariosRun} · moves generated ${totalMoves} · generate-throws ${genFail} · execute-throws ${execFail}`);
if (!problems.length) console.log('No exceptions from generation or execution.');
process.exit(problems.length ? 1 : 0);
