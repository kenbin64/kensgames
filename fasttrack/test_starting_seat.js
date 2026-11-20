#!/usr/bin/env node
/**
 * ============================================================
 * STARTING-SEAT TEST
 *
 * Ken's rule (2026-11-20): on Play again the WINNER of the round just
 * played goes first. The winner is named in the address: ?first=<seat id>
 * at a table (sent through the table by the host, so every screen opens
 * on the same seat) or ?firstPos=<board position> in solo. Round 1 (or a
 * replay that names no winner) opens on a random seat from the table's
 * shared seed, moved one seat on per round. A winner's name left in
 * localStorage by an older version ('ft.rematchWinnerName') must be
 * ignored and cleared, so an older round's winner can never open.
 *
 * Run: node fasttrack/test_starting_seat.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// ─── Browser stub (+ localStorage / sessionStorage) ──────────
class StubEl {
  constructor() {
    this.innerHTML = ''; this.textContent = ''; this.style = {}; this.disabled = false;
    this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
  }
  appendChild() {} setAttribute() {} removeChild() {} remove() {}
  addEventListener() {} removeEventListener() {}
  querySelector() { return null; } querySelectorAll() { return []; }
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
}
const _els = new Map();
global.document = {
  getElementById: (id) => { if (!_els.has(id)) _els.set(id, new StubEl()); return _els.get(id); },
  createElement: () => new StubEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: new StubEl(), head: new StubEl(), addEventListener: () => {}, readyState: 'complete',
};
function mkStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}
global.localStorage = mkStore();
global.sessionStorage = mkStore();
global.window = {
  dispatchEvent: () => {}, addEventListener: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  localStorage: global.localStorage, sessionStorage: global.sessionStorage,
};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// ─── Load the seeded random source the page loads (js/manifold-codec.js), then the core ───
globalThis.ManifoldCodec = require(path.join(__dirname, '..', 'js', 'manifold-codec.js'));
global.window.ManifoldCodec = globalThis.ManifoldCodec;
const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8')
  .replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
const _core = globalThis.__core;
const state = _core.state;

// ─── Harness ─────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}
// initGame renders + schedules camera timers we don't care about here; the
// starting seat is committed synchronously well before any of that. Swallow any
// late render/DOM throw so we can assert on the seat that was already chosen.
function startGame(config) {
  try { _core.initGame((config.sessionPlayers || []).length || 2, config); } catch (_) { /* render/DOM noise */ }
  const list = state.players.get('list') || [];
  const cur = state.players.get('current') || 0;
  return { list, cur, name: list[cur] && list[cur].name, isBot: list[cur] && list[cur].isBot };
}
const humans = (username0, ...rest) => [
  { username: username0, is_ai: false, slot: 0 },
  ...rest.map((u, i) => ({ username: u, is_ai: false, slot: i + 1 })),
];

// ── 1. With no winner named, the opener still moves one seat each round, the same on every screen ──
console.log('\n── 1. no winner named: the opener moves one seat each round ──');
{
  for (const table of ['QX7KD', 'M3PAR', 'ZZ2NB']) {
    const seats = [0, 1, 2, 3, 4].map((round) => startGame({ sessionSeed: table + (round ? ':r' + round : ''), sessionPlayers: humans('Alice', 'Bob', 'Carol') }).cur);
    ok(seats.every((s, i) => i === 0 || s === (seats[i - 1] + 1) % 3), `1: table ${table}: rounds 1-5 open on seats ${seats.join(' -> ')}, one seat on each time`);
    const again = startGame({ sessionSeed: table + ':r2', sessionPlayers: humans('Alice', 'Bob', 'Carol') }).cur;
    ok(again === seats[2], `1: table ${table}: the same round always opens on the same seat (every screen agrees)`);
  }
}

// ── 1b. Winner goes first: Play again names the round's winner (Ken, 2026-11-20) ──
console.log('\n── 1b. the named winner opens the next round ──');
{
  const seated = () => [
    { user_id: 'p1', username: 'Alice', is_ai: false, slot: 0 },
    { user_id: 'p2', username: 'Bob', is_ai: false, slot: 1 },
    { user_id: 'bot-1', username: 'Bot Ruby', is_ai: true, slot: 2 },
  ];
  for (const [id, name] of [['p1', 'Alice'], ['p2', 'Bob'], ['bot-1', 'Bot Ruby']]) {
    const r = startGame({ sessionSeed: 'QX7KD:r3', startingUserId: id, sessionPlayers: seated() });
    ok(r.name === name, `1b: table winner ${id} opens the next round (current = ${r.name})`);
  }
  const lost = startGame({ sessionSeed: 'QX7KD:r3', startingUserId: 'nobody', sessionPlayers: seated() });
  ok(Number.isInteger(lost.cur) && lost.cur >= 0 && lost.cur < 3, `1b: an unknown winner id falls back to a valid seat (${lost.name})`);
  // Solo: named by board position (the same seats come back in the same positions).
  const solo = startGame({ sessionPlayers: [] });
  const bps = (state.players.get('list') || []).map((p) => p.boardPosition);
  for (const bp of bps) {
    const r = startGame({ startingBoardPosition: bp });
    ok(r.list[r.cur].boardPosition === bp, `1b: solo winner at board position ${bp} opens the next game (${r.name})`);
  }
  void solo;
}

// ── 2. An old winner stash in the browser is ignored and cleared ──
console.log('\n── 2. an old winner stash is ignored ──');
{
  const plain = startGame({ sessionSeed: 'QX7KD:r1', sessionPlayers: humans('Alice', 'Bob', 'Carol') }).cur;
  const list = humans('Alice', 'Bob', 'Carol');
  const notOpener = list[(plain + 1) % 3].username;
  localStorage.setItem('ft.rematchWinnerName', notOpener);
  const r = startGame({ sessionSeed: 'QX7KD:r1', sessionPlayers: humans('Alice', 'Bob', 'Carol') });
  ok(r.cur === plain && r.name !== notOpener, `2: a stashed winner '${notOpener}' does not open; the rotation's seat does (${r.name})`);
  ok(localStorage.getItem('ft.rematchWinnerName') === null, `2: the old stash is cleared`);
}

// ── 3. No stash (FIRST game of session): opener is a uniformly RANDOM seat
//      among ALL players (user_directive_2026-07-18d — no seat is privileged) ──
console.log('\n── 3. no stash, first game → random seat among ALL players ──');
{
  localStorage.removeItem('ft.rematchWinnerName');
  const seats = new Set();
  let outOfRange = false;
  for (let t = 0; t < 60; t++) {
    const r = startGame({ sessionPlayers: humans('Alice', 'Bob', 'Carol') });
    if (typeof r.cur !== 'number' || r.cur < 0 || r.cur >= 3) { outOfRange = true; break; }
    seats.add(r.cur);
  }
  ok(!outOfRange, `3: opener is always a valid seat 0..N-1`);
  ok(seats.size === 3, `3: over 60 runs every seat can open (seen seats: ${[...seats].sort().join(',')})`);
}

// ── 4. First game may open on a BOT too (random over ALL seats, not just humans) ──
console.log('\n── 4. first game randomiser includes bot seats ──');
{
  localStorage.removeItem('ft.rematchWinnerName');
  let sawBotOpener = false, sawHumanOpener = false;
  for (let t = 0; t < 80; t++) {
    const r = startGame({
      sessionPlayers: [
        { username: 'You', is_ai: false, slot: 0 },
        { username: 'B1', is_ai: true, slot: 1 },
        { username: 'B2', is_ai: true, slot: 2 },
        { username: 'B3', is_ai: true, slot: 3 },
      ],
    });
    if (r.isBot) sawBotOpener = true; else sawHumanOpener = true;
    if (sawBotOpener && sawHumanOpener) break;
  }
  ok(sawHumanOpener, `4: the human can open the first game`);
  ok(sawBotOpener, `4: a bot can also open the first game (pure random over all seats)`);
}

console.log('\n══════════════════════');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('══════════════════════\n');
process.exit(fail ? 1 : 0);
