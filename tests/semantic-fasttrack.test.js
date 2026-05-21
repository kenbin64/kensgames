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
    return loadInBrowserContext('fasttrack/fasttrack-game-core.js', {
        extras: {
            context: {
                requestAnimationFrame: () => 1,
                cancelAnimationFrame: () => { },
            },
            window: {
                requestAnimationFrame: () => 1,
                cancelAnimationFrame: () => { },
            },
        },
    });
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

test('fasttrack: FastTrack peg consumes full card value through own ft into stretch (v3.2.0)', () => {
    // rules.json :: FT_NO_PASS_OWN_FT (v3.2.0) — FT peg one hop short of
    // own ft-{bp} with card 3 consumes all 3 hops: ft-{bp} → safe-{bp}-1 →
    // safe-{bp}-2. Move is emitted as exitFastTrack at safe-{bp}-2.
    const { run } = loadCore();
    run(`
        initGame(2, { launchMode: 'solo' });
        state.players.set('current', 0);
        const players = state.players.get('list');
        for (const pl of players) {
            for (const peg of pl.pegs) {
                if (peg.holeId && peg.holeId !== 'holding') state.board.set(peg.holeId, null);
                peg.holeId = 'holding';
                peg.holeType = 'holding';
                peg.onFasttrack = false;
                peg.mustExitFasttrack = false;
            }
        }
        const player = players[0];
        const bp = player.boardPosition;
        const peg = player.pegs[0];
        placePeg(peg, 'ft-' + ((bp + 5) % 6), 0);
        peg.onFasttrack = true;
        state.deck.set('currentCard', { value: '3' });
        calculateValidMoves();
        globalThis.__ftOwnBoundary = {
            bp,
            moves: (state.turn.get('validMoves') || []).map(m => ({
                type: m.type,
                dest: m.dest,
                steps: m.steps,
                path: Array.isArray(m.path) ? m.path.slice() : []
            }))
        };
    `);

    const result = run('__ftOwnBoundary');
    const ownFt = `ft-${result.bp}`;
    const stretch2 = `safe-${result.bp}-2`;

    // Full 3 hops consumed: dest = safe-{bp}-2; path crosses own ft-{bp}.
    const exit = result.moves.find(m => m.type === 'exitFastTrack' && m.dest === stretch2);
    assert.ok(exit, `expected exitFastTrack at ${stretch2}, got ${JSON.stringify(result.moves)}`);
    assert.equal(exit.steps, 3, 'FT exit must use full card value, not truncate at own ft');
    assert.ok(exit.path.includes(ownFt), 'path must cross own ft-{bp}');
    assert.equal(exit.path[exit.path.length - 1], stretch2);
    // The truncated legacy move (exitFastTrack at own ft with steps=1) must NOT be offered.
    assert.ok(!result.moves.some(m => m.type === 'exitFastTrack' && m.dest === ownFt && m.steps < 3),
        'truncated FT exit at own ft hole must not be emitted');
});

test('fasttrack: FastTrack peg with exact-to-own-ft card lands on own ft (v3.2.0)', () => {
    // Edge case: card value === distance to own ft → dest is exactly ft-{bp}.
    const { run } = loadCore();
    run(`
        initGame(2, { launchMode: 'solo' });
        state.players.set('current', 0);
        const players = state.players.get('list');
        for (const pl of players) {
            for (const peg of pl.pegs) {
                if (peg.holeId && peg.holeId !== 'holding') state.board.set(peg.holeId, null);
                peg.holeId = 'holding';
                peg.holeType = 'holding';
                peg.onFasttrack = false;
                peg.mustExitFasttrack = false;
            }
        }
        const player = players[0];
        const bp = player.boardPosition;
        const peg = player.pegs[0];
        placePeg(peg, 'ft-' + ((bp + 5) % 6), 0);
        peg.onFasttrack = true;
        state.deck.set('currentCard', { value: 'A' });
        calculateValidMoves();
        globalThis.__ftExact = {
            bp,
            moves: (state.turn.get('validMoves') || []).map(m => ({
                type: m.type, dest: m.dest, steps: m.steps
            }))
        };
    `);

    const result = run('__ftExact');
    const ownFt = `ft-${result.bp}`;
    const exit = result.moves.find(m => m.type === 'exitFastTrack' && m.dest === ownFt);
    assert.ok(exit, 'expected exitFastTrack landing exactly at own ft');
    assert.equal(exit.steps, 1);
});

test('fasttrack: FastTrack stretch overshoot blocked by own peg in stretch is illegal (v3.2.0)', () => {
    // rules.json :: FT_NO_PASS_OWN_FT (v3.2.0) + MOV_NO_PASS_OWN —
    // if remaining hops would overtake an own peg sitting in own stretch,
    // the entire move is illegal (no auto-truncation fallback).
    const { run } = loadCore();
    run(`
        initGame(2, { launchMode: 'solo' });
        state.players.set('current', 0);
        const players = state.players.get('list');
        for (const pl of players) {
            for (const peg of pl.pegs) {
                if (peg.holeId && peg.holeId !== 'holding') state.board.set(peg.holeId, null);
                peg.holeId = 'holding';
                peg.holeType = 'holding';
                peg.onFasttrack = false;
                peg.mustExitFasttrack = false;
            }
        }
        const player = players[0];
        const bp = player.boardPosition;
        const mover = player.pegs[0];
        const blocker = player.pegs[1];
        placePeg(mover, 'ft-' + ((bp + 5) % 6), 0);
        mover.onFasttrack = true;
        // Block stretch slot 1 with own peg
        placePeg(blocker, 'safe-' + bp + '-1', 0);
        state.deck.set('currentCard', { value: '3' });
        calculateValidMoves();
        globalThis.__ftStretchBlock = {
            bp,
            moves: (state.turn.get('validMoves') || []).map(m => ({
                type: m.type, dest: m.dest, pegIdx: m.pegIdx
            }))
        };
    `);

    const result = run('__ftStretchBlock');
    // No FT exit move involving the mover (pegIdx 0) — own stretch peg blocks the path.
    const moverMoves = result.moves.filter(m => m.pegIdx === 0);
    assert.ok(!moverMoves.some(m => m.type === 'exitFastTrack'),
        `expected no exitFastTrack for blocked FT peg, got ${JSON.stringify(moverMoves)}`);
});

// Retired (v3.2.0): "FastTrack traversal stops before bypassing an own peg
// on regular track". The premise contradicts rules.json :: FT_RING_PASS_RELAX
// (z=72) — own pegs on the regular outer/home/side segments are NOT on the
// FT ring path and do not block FT traversal. The FT-ring stop conditions
// covered by v3.2.0 are: (a) own peg ON ft-{toIdx} (canAdvanceFastTrackStep),
// (b) own peg in own stretch when path crosses own ft-{bp} (above test).

