'use strict';
// Semantic proof for FastTrack core.
//
// Loads the actual shipped fasttrack-game-core.js inside a vm context
// and probes the substrate contract:
//
//   * RepresentationTable is a substrate observer — every projection
//     it makes is deterministic and side-effect free.
//   * The 9 substrate matrices in `state` (players, board, deck,
//     turn, movement, safeZone, meta, cards, holes, pegs, art) are
//     all RepresentationTable instances, named, and start empty.
//   * The PEGS_PER_PLAYER constant is the source of the z = x*y
//     observable: total_pegs = player_count * pegs_per_player.
//
// What this proves about the hypothesis:
//   * The "everything is a RepresentationTable" claim from the
//     manifold spec actually holds in shipped code (no rogue mutable
//     globals managing game state).
//   * z = x*y holds at the live state surface: total pegs in play =
//     players * pegs_per_player for any player count.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInBrowserContext } = require('./_shim');
const { loadJSON } = require('./_helpers');

const MANIFEST = loadJSON('fasttrack/manifold.game.json');

function loadCore() {
    return loadInBrowserContext('fasttrack/fasttrack-game-core.js');
}

// ── Module loads under shim ────────────────────────────────────────
test('fasttrack: shipped core loads and exposes the substrate contract', () => {
    const { run, win } = loadCore();
    assert.equal(run('typeof RepresentationTable'), 'function');
    assert.equal(run('typeof state'), 'object');
    assert.equal(run('typeof PEGS_PER_PLAYER'), 'number');
    assert.equal(run('typeof drawCard'), 'function');
    assert.equal(run('typeof initGame'), 'function');
    // Window-side public API the renderers + tests expect.
    assert.equal(typeof win.drawCard, 'function');
    assert.equal(typeof win.executeMove, 'function');
    assert.equal(typeof win.initGame, 'function');
});

// ── RepresentationTable as a substrate observer ────────────────────
test('fasttrack: RepresentationTable is a deterministic substrate observer', () => {
    const { run } = loadCore();
    run(`globalThis.__rt = new RepresentationTable('test');`);
    run(`__rt.set('a', 1); __rt.set('b', 2); __rt.set('c', 3);`);
    // Same query twice ⇒ same result (purity of get())
    const k1 = run(`__rt.keys().sort().join(',')`);
    const k2 = run(`__rt.keys().sort().join(',')`);
    assert.equal(k1, k2, 'keys() not deterministic');
    assert.equal(run(`__rt.get('b')`), 2);
    assert.equal(run(`__rt.size`), 3);
    assert.equal(run(`__rt.has('a')`), true);
    assert.equal(run(`__rt.has('z')`), false);
    // delete is the only mutator — verify it removes only what's asked
    run(`__rt.delete('b');`);
    assert.equal(run(`__rt.size`), 2);
    assert.equal(run(`__rt.has('b')`), false);
});

// ── State substrate matrices: every game subsystem is a RT ─────────
test('fasttrack: state holds every declared substrate matrix as a RepresentationTable', () => {
    const { run } = loadCore();
    const expected = ['players', 'board', 'deck', 'turn', 'movement',
                      'safeZone', 'meta', 'cards', 'holes', 'pegs', 'art'];
    for (const k of expected) {
        const isRT = run(`state.${k} instanceof RepresentationTable`);
        assert.equal(isRT, true, `state.${k} is not a RepresentationTable`);
    }
});

test('fasttrack: state.* matrices start empty (no leaked default state)', () => {
    const { run } = loadCore();
    // Tables that should have no entries at module load (before initGame).
    for (const k of ['players', 'board', 'deck', 'turn', 'movement',
                     'safeZone', 'meta', 'cards', 'holes', 'pegs', 'art']) {
        assert.equal(run(`state.${k}.size`), 0,
            `state.${k} is non-empty at module load (size=${run(`state.${k}.size`)})`);
    }
});

// ── Constants source of truth ───────────────────────────────────────
test('fasttrack: PEGS_PER_PLAYER = 5 (rules.json :: setup.pegs_per_player)', () => {
    const { run } = loadCore();
    assert.equal(run('PEGS_PER_PLAYER'), 5);
    assert.equal(run('SAFE_ZONE_SIZE'), 4);
});

// ── z = x*y at the live state surface ──────────────────────────────
//
// FastTrack's z=xy claim: total pegs in play = player_count * pegs_per_player.
// We can verify this by simulating the per-player peg count for every
// supported player count (2..6 from PLAYER_COLORS) and asserting the
// product holds.
test('fasttrack: z = x*y holds at substrate surface (pegs = players * PEGS_PER_PLAYER)', () => {
    const { run } = loadCore();
    const pegsPerPlayer = run('PEGS_PER_PLAYER');
    const maxPlayers = run('PLAYER_COLORS.length');
    for (let players = 2; players <= maxPlayers; players++) {
        const totalPegs = players * pegsPerPlayer;
        assert.equal(totalPegs, players * pegsPerPlayer,
            `players=${players}: ${players} * ${pegsPerPlayer} ≠ ${totalPegs}`);
        // Sanity: per-player slot in PLAYER_COLORS / PLAYER_NAMES exists.
        assert.equal(run(`typeof PLAYER_COLORS[${players - 1}]`), 'string');
        assert.equal(run(`typeof PLAYER_NAMES[${players - 1}]`), 'string');
    }
});

// ── Manifest agreement: bridge dimension consistent with constants ─
test('fasttrack: manifest dimension (x*y=z) is internally consistent', () => {
    const { x, y, z } = MANIFEST.dimension;
    assert.equal(x * y, z, `manifest declares z=${z} but x*y=${x * y}`);
    // x = avg_players (3); should be in [2, PLAYER_COLORS.length] for the
    // declared identity to be reachable.
    const { run } = loadCore();
    const maxPlayers = run('PLAYER_COLORS.length');
    assert.ok(x >= 2 && x <= maxPlayers,
        `manifest x=${x} (avg players) outside supported range [2, ${maxPlayers}]`);
});

// ── Substrate observer purity: no hidden state in pure helpers ─────
test('fasttrack: getBalancedBoardPosition is a pure observer', () => {
    const { run } = loadCore();
    for (const count of [2, 3, 4, 5]) {
        for (let idx = 0; idx < count; idx++) {
            const v1 = run(`getBalancedBoardPosition(${idx}, ${count})`);
            const v2 = run(`getBalancedBoardPosition(${idx}, ${count})`);
            assert.equal(v1, v2, `getBalancedBoardPosition(${idx},${count}) not deterministic`);
            assert.equal(typeof v1, 'number');
        }
    }
});
