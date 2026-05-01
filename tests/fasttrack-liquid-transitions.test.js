'use strict';
// Tests for FastTrackGame liquid-transition delta queue.
//
// Rules:
//   - pushDelta() enqueues a delta with a monotonic seq number
//   - drainDeltas() returns all pending deltas and clears the queue
//   - drainDeltas() returns [] when nothing changed (renderer skips)
//   - peekDeltas() reads without consuming
//   - duration defaults to 320 ms; easing defaults to 'ease-out'
//   - rebuilding the board (injectPlayers) clears the queue AND snapshot
//   - pushDelta auto-diffs against snapshot — only true changes are queued
//   - pushing the same value twice is a no-op (returns 0, nothing queued)
//   - callers may pass full state objects; only the diff is stored/sent
//   - movePeg() and setPegState() are typed helpers that auto-diff
//   - no-op typed helpers return 0 and produce no delta

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// ── Load classes under test ───────────────────────────────────────────────
const { Game } = require('../js/substrates/game.js');
const { Player } = require('../js/substrates/player.js');
const { FastTrackGame } = require('../fasttrack/fasttrack-game.js');

// ── Helpers ───────────────────────────────────────────────────────────────
function makePlayers(n) {
  return Array.from({ length: n }, (_, i) =>
    new Player({ id: `u${i}`, name: `Player ${i + 1}` }));
}

// ── Delta queue tests ─────────────────────────────────────────────────────

test('drainDeltas returns [] on a fresh game', () => {
  const g = new FastTrackGame();
  assert.deepEqual(g.drainDeltas(), []);
});

test('pushDelta assigns monotonic seq numbers', () => {
  const g = new FastTrackGame();
  const s1 = g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: { holeId: 'outer-0-1' }, to: { holeId: 'outer-0-3' } });
  const s2 = g.pushDelta({ type: 'peg-move', target: 'peg-1-1', from: { holeId: 'outer-1-1' }, to: { holeId: 'outer-1-4' } });
  assert.ok(s2 > s1, 'seq must be monotonically increasing');
  assert.equal(s1, 1);
  assert.equal(s2, 2);
});

test('pushDelta applies default duration and easing', () => {
  const g = new FastTrackGame();
  g.pushDelta({ type: 'peg-cut', target: 'peg-0-1', from: { state: 'outer' }, to: { state: 'holding' } });
  const [d] = g.drainDeltas();
  assert.equal(d.duration, 320);
  assert.equal(d.easing, 'ease-out');
});

test('pushDelta caller-supplied duration and easing override defaults', () => {
  const g = new FastTrackGame();
  g.pushDelta({
    type: 'peg-move', target: 'peg-0-2',
    from: { holeId: 'outer-0-1' }, to: { holeId: 'outer-0-4' },
    duration: 500, easing: 'ease-in-out',
  });
  const [d] = g.drainDeltas();
  assert.equal(d.duration, 500);
  assert.equal(d.easing, 'ease-in-out');
});

test('drainDeltas returns deltas in push order and clears queue', () => {
  const g = new FastTrackGame();
  g.pushDelta({ type: 'a', target: 't1', from: { x: 0 }, to: { x: 1 } });
  g.pushDelta({ type: 'b', target: 't2', from: { x: 0 }, to: { x: 2 } });
  g.pushDelta({ type: 'c', target: 't3', from: { x: 0 }, to: { x: 3 } });

  const batch = g.drainDeltas();
  assert.equal(batch.length, 3);
  assert.equal(batch[0].type, 'a');
  assert.equal(batch[1].type, 'b');
  assert.equal(batch[2].type, 'c');

  // Queue must be empty after drain
  assert.deepEqual(g.drainDeltas(), []);
});

test('drainDeltas returns [] when nothing changed (renderer no-ops)', () => {
  const g = new FastTrackGame();
  g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: {}, to: {} });
  g.drainDeltas();               // consume
  assert.deepEqual(g.drainDeltas(), []);   // second call — nothing to do
});

test('peekDeltas reads queue without consuming', () => {
  const g = new FastTrackGame();
  g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: { holeId: 'a' }, to: { holeId: 'b' } });
  const peeked = g.peekDeltas();
  assert.equal(peeked.length, 1);
  // Queue still intact
  const drained = g.drainDeltas();
  assert.equal(drained.length, 1);
});

test('injectPlayers clears pending delta queue and snapshot', () => {
  const g = new FastTrackGame();
  g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: { holeId: 'a' }, to: { holeId: 'b' } });
  assert.equal(g.peekDeltas().length, 1);

  g.injectPlayers(makePlayers(2));   // rebuild — clears queue AND snapshot
  assert.deepEqual(g.drainDeltas(), []);

  // After snapshot reset, pushing the same target again is treated as new (first-seen)
  const seq = g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: { holeId: 'a' }, to: { holeId: 'b' } });
  assert.ok(seq > 0, 'post-rebuild push should produce a new delta');
});

test('pushDelta auto-diffs: full state object produces only changed keys in queue', () => {
  const g = new FastTrackGame();
  // Pass full state; state and color are identical in from and to — only holeId differs.
  // The class falls back to caller's `from` for keys not yet in the snapshot.
  g.pushDelta({
    type: 'peg-move', target: 'peg-0-1',
    from: { holeId: 'outer-0-1', state: 'outer', color: '#FFE000' },
    to: { holeId: 'outer-0-3', state: 'outer', color: '#FFE000' },
  });
  const [d] = g.drainDeltas();
  // Only holeId changed; state and color are the same — must not appear
  assert.ok('holeId' in d.to, 'holeId should be in delta.to');
  assert.ok(!('state' in d.to), 'unchanged state must not be in delta.to');
  assert.ok(!('color' in d.to), 'unchanged color must not be in delta.to');
  assert.equal(Object.keys(d.to).length, 1);
});

test('pushDelta returns 0 and queues nothing when value is unchanged', () => {
  const g = new FastTrackGame();
  // Establish snapshot
  g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: { holeId: 'a' }, to: { holeId: 'b' } });
  g.drainDeltas();

  // Push same value again — no-op
  const seq = g.pushDelta({ type: 'peg-move', target: 'peg-0-1', from: { holeId: 'b' }, to: { holeId: 'b' } });
  assert.equal(seq, 0, 'no-op push must return 0');
  assert.deepEqual(g.drainDeltas(), [], 'queue must remain empty after no-op push');
});

test('movePeg produces a peg-move delta with minimal diff', () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(2));

  const seq = g.movePeg('peg-0-1', 'outer-0-5');
  assert.ok(seq > 0);
  const [d] = g.drainDeltas();
  assert.equal(d.type, 'peg-move');
  assert.equal(d.target, 'peg-0-1');
  assert.equal(d.to.holeId, 'outer-0-5');
  assert.ok(Object.keys(d.to).length === 1, 'only holeId in delta.to');
});

test('movePeg is a no-op when peg is already at the destination', () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(2));

  g.movePeg('peg-0-1', 'outer-0-5');
  g.drainDeltas();

  const seq = g.movePeg('peg-0-1', 'outer-0-5');   // same destination
  assert.equal(seq, 0, 'redundant movePeg must return 0');
  assert.deepEqual(g.drainDeltas(), []);
});

test('setPegState produces a peg-state delta', () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(2));

  const seq = g.setPegState('peg-0-1', 'outer');
  assert.ok(seq > 0);
  const [d] = g.drainDeltas();
  assert.equal(d.type, 'peg-state');
  assert.equal(d.to.state, 'outer');
});

test('setPegState is a no-op when state is unchanged', () => {
  const g = new FastTrackGame();
  g.injectPlayers(makePlayers(2));

  g.setPegState('peg-0-1', 'outer');
  g.drainDeltas();

  const seq = g.setPegState('peg-0-1', 'outer');
  assert.equal(seq, 0);
  assert.deepEqual(g.drainDeltas(), []);
});

test('delta carries only changed keys (auto-diff enforced)', () => {
  const g = new FastTrackGame();
  g.pushDelta({
    type: 'peg-move',
    target: 'peg-0-1',
    from: { holeId: 'outer-0-1' },
    to: { holeId: 'outer-0-3' },
  });
  const [d] = g.drainDeltas();
  assert.deepEqual(Object.keys(d.from), ['holeId']);
  assert.deepEqual(Object.keys(d.to), ['holeId']);
});

test('theme declares liquidTransitions: true', () => {
  const g = new FastTrackGame();
  assert.equal(g.theme.liquidTransitions, true);
});

test('theme preserves pool hall environment identity', () => {
  const g = new FastTrackGame();
  assert.equal(g.theme.environment, 'pool-hall-3d');
  assert.equal(g.theme.board, 'hex-billiard');
  assert.equal(g.theme.allowEnhancements, true);
});
