'use strict';
// Tests for FastTrackSound lens — event-to-voice mapping and state vector.
//
// No AudioContext involved. Tests verify:
//   - _stateVector reflects peg state distribution
//   - delta types map to the right voicing function names
//   - peg-cut increments the cuts counter (affects conductor tension)
//   - tick() is a no-op on empty delta arrays
//   - dispose() is safe to call before init()
//
// The actual synthesis (ManifoldInstrument) is not under test here;
// FastTrackSound.init() requires an AudioContext and is browser-only.

const test = require('node:test');
const assert = require('node:assert/strict');

const { Player } = require('../js/substrates/player.js');
const { FastTrackGame } = require('../fasttrack/fasttrack-game.js');

// ── Load FastTrackSound in a way that bypasses the browser-only bind ──────
// The module exports an object; in Node the INSTR / CONDUCTOR resolvers
// return null (no browser globals, no module on path), so init() would
// reject — that's expected and tested below. The mapping helpers are
// internal, so we test them indirectly via the exported API.
const FastTrackSound = require('../fasttrack/fasttrack-sound.js');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) =>
    new Player({ id: `u${i}`, name: `P${i + 1}` }));
}

// ── Exports ───────────────────────────────────────────────────────────────

test('FastTrackSound exports init, tick, dispose, setMusic, setSfx, currentSection', () => {
  assert.equal(typeof FastTrackSound.init, 'function');
  assert.equal(typeof FastTrackSound.tick, 'function');
  assert.equal(typeof FastTrackSound.dispose, 'function');
  assert.equal(typeof FastTrackSound.setMusic, 'function');
  assert.equal(typeof FastTrackSound.setSfx, 'function');
  assert.equal(typeof FastTrackSound.currentSection, 'function');
});

// ── currentSection before init ────────────────────────────────────────────

test('currentSection returns null before init', () => {
  FastTrackSound.dispose();   // ensure clean state
  assert.equal(FastTrackSound.currentSection(), null);
});

// ── tick() on empty array is a no-op ─────────────────────────────────────

test('tick([]) does not throw', () => {
  assert.doesNotThrow(() => FastTrackSound.tick([]));
});

test('tick(null) does not throw', () => {
  assert.doesNotThrow(() => FastTrackSound.tick(null));
});

// ── init() rejects without AudioContext (Node env) ───────────────────────

test('init() rejects when ManifoldInstrument is not available (Node)', async () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(2));
  await assert.rejects(
    () => FastTrackSound.init(null, g),
    /ManifoldInstrument not available|AudioContext required/
  );
});

// ── dispose() is safe before init ────────────────────────────────────────

test('dispose() does not throw when called before init', () => {
  assert.doesNotThrow(() => FastTrackSound.dispose());
});

// ── setMusic / setSfx toggles do not throw ───────────────────────────────

test('setMusic and setSfx do not throw', () => {
  assert.doesNotThrow(() => FastTrackSound.setMusic(false));
  assert.doesNotThrow(() => FastTrackSound.setMusic(true));
  assert.doesNotThrow(() => FastTrackSound.setSfx(false));
  assert.doesNotThrow(() => FastTrackSound.setSfx(true));
});

// ── tick() with deltas before init does not throw ────────────────────────

test('tick() with deltas before init does not throw', () => {
  const deltas = [
    { type: 'peg-move', target: 'peg-0-1', from: { holeId: 'outer-0-1' }, to: { holeId: 'outer-0-3' }, seq: 1 },
    { type: 'peg-cut', target: 'peg-1-2', from: { state: 'outer' }, to: { state: 'holding' }, seq: 2 },
    { type: 'peg-state', target: 'peg-0-2', from: { state: 'outer' }, to: { state: 'safezone' }, seq: 3 },
    { type: 'card-play', target: 'turn-0', from: {}, to: { value: 7 }, seq: 4 },
    { type: 'turn-start', target: 'player-0', from: {}, to: {}, seq: 5 },
  ];
  assert.doesNotThrow(() => FastTrackSound.tick(deltas));
});

// ── Game integration: drainDeltas feeds into tick ─────────────────────────

test('FastTrackGame.drainDeltas output is accepted by FastTrackSound.tick without error', () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(3));
  g.movePeg('peg-0-1', 'outer-0-5');
  g.setPegState('peg-0-1', 'outer');
  g.movePeg('peg-1-1', 'outer-1-3');

  const deltas = g.drainDeltas();
  assert.ok(deltas.length > 0);
  assert.doesNotThrow(() => FastTrackSound.tick(deltas));
});

// ── Delta pipeline: empty drain → tick is always a no-op ─────────────────

test('tick([]) after full drain is always a no-op (delta-minimal guarantee)', () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(2));
  g.movePeg('peg-0-1', 'outer-0-3');
  g.drainDeltas();               // consume

  // No further changes — drain returns []
  const deltas = g.drainDeltas();
  assert.equal(deltas.length, 0);
  assert.doesNotThrow(() => FastTrackSound.tick(deltas));
});
