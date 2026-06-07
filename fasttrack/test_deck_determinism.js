#!/usr/bin/env node
/**
 * ============================================================
 * SHARED-SEED DECK DETERMINISM (manifold-first, Phase 1)
 *
 * The never-resolved MP bug: every client shuffled the deck
 * with its own Math.random(), so each player got a different
 * board. Fix: the deck blooms from ONE shared seed via
 * ManifoldCodec.seededShuffle, so every client in a session
 * derives the IDENTICAL order.
 *
 * Asserts:
 *   1. ManifoldCodec.seededShuffle is pure + deterministic
 *      (same seed -> same order; different seed -> different;
 *      input array untouched).
 *   2. The real shuffleDeck() code path is deterministic from
 *      state.meta.seed and advances per reshuffle.
 *   3. Two independent "clients" sharing a session seed produce
 *      the same deck; a different seed diverges.
 *
 * Run: node fasttrack/test_deck_determinism.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

// Load the real codec (CommonJS export) and expose it as a global so the
// game core picks it up exactly as it would via window.ManifoldCodec.
const ManifoldCodec = require(path.join(__dirname, '..', 'js', 'manifold-codec.js'));
globalThis.ManifoldCodec = ManifoldCodec;

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
  ManifoldCodec,
};
global.CustomEvent = class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const corePath = path.join(__dirname, 'fasttrack-game-core.js');
const coreSrc = fs.readFileSync(corePath, 'utf8').replace(/window\.FastTrackCore\s*=/, 'globalThis.__core =');
eval(coreSrc);
const _core = globalThis.__core;
const state = _core.state;

let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(l) { console.log(`\n── ${l} ──`); }
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const DECK = Array.from({ length: 54 }, (_, i) => `card-${i}`);

// ── 1. Codec-level determinism ──────────────────────────────
section('ManifoldCodec.seededShuffle is pure + deterministic');
{
  const a1 = ManifoldCodec.seededShuffle(DECK, 'ROOM7');
  const a2 = ManifoldCodec.seededShuffle(DECK, 'ROOM7');
  const b = ManifoldCodec.seededShuffle(DECK, 'ROOM8');
  ok(eq(a1, a2), 'same seed -> identical order');
  ok(!eq(a1, b), 'different seed -> different order');
  ok(eq(DECK, Array.from({ length: 54 }, (_, i) => `card-${i}`)), 'input array left untouched');
  ok(a1.length === 54 && new Set(a1).size === 54, 'shuffle is a permutation (no loss/dupe)');
}

// ── 2. shuffleDeck() code path is seed-deterministic ────────
section('shuffleDeck() derives order from state.meta.seed');
function shuffleWith(seed, deck) {
  state.deck.set('cards', deck.slice());
  state.meta.set('seed', seed);
  state.meta.set('reshuffleCount', 0);
  shuffleDeck();                       // leaked top-level fn from the core
  return (state.deck.get('cards') || []).slice();
}
{
  const A1 = shuffleWith('SESSION-XYZ', DECK);
  const A2 = shuffleWith('SESSION-XYZ', DECK);
  const B = shuffleWith('SESSION-OTHER', DECK);
  ok(eq(A1, A2), 'same meta.seed -> identical deck');
  ok(!eq(A1, B), 'different meta.seed -> different deck');
  ok(state.meta.get('reshuffleCount') === 1, 'reshuffleCount advanced after a shuffle');
}

// ── 3. Reshuffle advances the stream (fresh but reproducible) ─
section('Each reshuffle of the same seed is a distinct, reproducible order');
{
  state.deck.set('cards', DECK.slice());
  state.meta.set('seed', 'R');
  state.meta.set('reshuffleCount', 0);
  shuffleDeck(); const first = (state.deck.get('cards') || []).slice();
  state.deck.set('cards', DECK.slice());
  shuffleDeck(); const second = (state.deck.get('cards') || []).slice();   // rc now 1
  ok(!eq(first, second), 'reshuffle (rc=1) differs from initial (rc=0)');
  // Reproducible: same (seed, rc) reproduces the same order.
  const repro = ManifoldCodec.seededShuffle(DECK, 'R:1');
  ok(eq(second, repro), 'reshuffle order is reproducible from (seed, rc)');
}

// ── 4. Two independent clients, one session seed -> one deck ─
section('Two clients sharing a session seed bloom the same deck');
{
  const clientA = ManifoldCodec.seededShuffle(DECK, 'INVITE-CODE-42:0');
  const clientB = ManifoldCodec.seededShuffle(DECK, 'INVITE-CODE-42:0');
  const stranger = ManifoldCodec.seededShuffle(DECK, 'INVITE-CODE-99:0');
  ok(eq(clientA, clientB), 'same session code -> same deck on both clients');
  ok(!eq(clientA, stranger), 'a different session -> a different deck');
}

console.log(`\n══════════════════════\n  ${pass} passed, ${fail} failed\n══════════════════════`);
process.exit(fail ? 1 : 0);
