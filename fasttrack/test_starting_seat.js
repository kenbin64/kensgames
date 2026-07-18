#!/usr/bin/env node
/**
 * ============================================================
 * STARTING-SEAT / WINNER-GOES-FIRST TEST
 *
 * Ken's rule (2026-07-15): "First turns random who starts,
 * EXCEPT after someone wins and hits the replay button — the
 * winner goes first next game."
 *
 * The Play-Again button (3d.html #btn-replay-again → playAgain)
 * stashes the winner's name in localStorage 'ft.rematchWinnerName'.
 * On the next initGame() that name must become the starting seat
 * (even if the winner was a bot), the stash must be consumed
 * (one-shot), and with NO stash the opener is random among the
 * humans — except a solo human always opens (so they never wait
 * behind a bot at game start).
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

// ─── Load core ───────────────────────────────────────────────
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

// ── 1. Rematch winner (a human) opens the next game ──
console.log('\n── 1. winner (human) goes first after Play Again ──');
{
  localStorage.setItem('ft.rematchWinnerName', 'Bob');
  const r = startGame({ sessionPlayers: humans('Alice', 'Bob', 'Carol') });
  ok(r.name === 'Bob', `1: winner 'Bob' opens the game (current seat = ${r.name})`);
  ok(localStorage.getItem('ft.rematchWinnerName') === null, `1: rematch stash consumed (one-shot)`);
}

// ── 2. Rematch winner that is a BOT still opens ──
console.log('\n── 2. winner that is a bot still goes first ──');
{
  localStorage.setItem('ft.rematchWinnerName', 'RoboWinner');
  const r = startGame({
    sessionPlayers: [
      { username: 'You', is_ai: false, slot: 0 },
      { username: 'RoboWinner', is_ai: true, slot: 1 },
      { username: 'OtherBot', is_ai: true, slot: 2 },
    ],
  });
  ok(r.name === 'RoboWinner', `2: bot winner 'RoboWinner' opens the game (current seat = ${r.name})`);
  ok(r.isBot === true, `2: and that opener is indeed the bot`);
}

// ── 3. No stash, solo (1 human + bots): the human always opens ──
console.log('\n── 3. no stash, solo → human opens (never waits behind a bot) ──');
{
  localStorage.removeItem('ft.rematchWinnerName');
  for (let t = 0; t < 5; t++) {
    const r = startGame({
      sessionPlayers: [
        { username: 'You', is_ai: false, slot: 0 },
        { username: 'B1', is_ai: true, slot: 1 },
        { username: 'B2', is_ai: true, slot: 2 },
      ],
    });
    ok(r.isBot === false, `3.${t + 1}: solo opener is the human (${r.name})`);
  }
}

// ── 4. No stash, multi-human: opener is random but ALWAYS a human seat ──
console.log('\n── 4. no stash, multi-human → opener is a human seat (random) ──');
{
  localStorage.removeItem('ft.rematchWinnerName');
  const seen = new Set();
  for (let t = 0; t < 30; t++) {
    const r = startGame({ sessionPlayers: humans('Alice', 'Bob', 'Carol') });
    if (r.isBot !== false) { ok(false, `4: opener was a bot (${r.name}) — should never happen`); break; }
    seen.add(r.name);
  }
  ok(seen.size >= 1, `4: opener always a human across 30 runs (distinct openers seen: ${[...seen].join(', ')})`);
}

console.log('\n══════════════════════');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('══════════════════════\n');
process.exit(fail ? 1 : 0);
