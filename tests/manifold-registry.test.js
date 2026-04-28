'use strict';
// The compiled registry (dist/manifold.registry.json) is what arcade.js
// fetches in production. It must agree with each game's source-of-truth
// manifold.game.json on identity (id, dimension) and satisfy z = x*y.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT, loadJSON, loadPortalGames } = require('./_helpers');

const REGISTRY_PATH = path.join(ROOT, 'dist', 'manifold.registry.json');

// Recompile if missing so tests are runnable from a clean checkout.
test('registry exists (compile if missing)', () => {
    if (!fs.existsSync(REGISTRY_PATH)) {
        execFileSync('python3', [path.join(ROOT, 'engine', 'manifold_compiler.py')],
            { cwd: ROOT, stdio: 'pipe' });
    }
    assert.ok(fs.existsSync(REGISTRY_PATH),
        'engine/manifold_compiler.py did not produce dist/manifold.registry.json');
});

const registry = loadJSON('dist/manifold.registry.json');
const portalGames = loadPortalGames();

test('registry schema: top-level fields present', () => {
    for (const k of ['_schema', '_compiled', 'portal', 'domain', 'dimensions', 'games']) {
        assert.ok(registry[k] !== undefined, `registry missing top-level '${k}'`);
    }
    assert.ok(Array.isArray(registry.games));
});

test(`registry contains every portal-listed game (${portalGames.length})`, () => {
    assert.equal(registry.games.length, portalGames.length,
        `expected ${portalGames.length} games in registry, got ${registry.games.length}`);
});

test('every registry game satisfies z = x * y', () => {
    for (const g of registry.games) {
        const { x, y, z } = g.dimension;
        assert.equal(z, x * y,
            `${g.id} registry axiom violated: z=${z} but x*y=${x * y}`);
    }
});

// For each registered game, the registry's dimension must equal the
// source manifest's dimension (compiler pass-through, no drift).
for (const { manifest } of portalGames) {
    const expectedId = typeof manifest.manifold === 'string'
        ? manifest.manifold : manifest.name;
    test(`registry dimension for '${expectedId}' matches source manifest`, () => {
        const reg = registry.games.find(g => g.id === expectedId
            || g.name === manifest.name);
        assert.ok(reg, `registry has no game with id '${expectedId}' / name '${manifest.name}'`);
        for (const k of ['x', 'y', 'z']) {
            assert.equal(reg.dimension[k], manifest.dimension[k],
                `${expectedId} dimension.${k} drift: registry=${reg.dimension[k]} manifest=${manifest.dimension[k]}`);
        }
    });
}

// Bridge advertised in the registry must match the manifest.
for (const { manifest } of portalGames) {
    const expectedId = typeof manifest.manifold === 'string'
        ? manifest.manifold : manifest.name;
    test(`registry bridge entry_var for '${expectedId}' matches source manifest`, () => {
        const reg = registry.games.find(g => g.id === expectedId
            || g.name === manifest.name);
        assert.ok(reg);
        assert.equal(reg.bridge, manifest.manifold_bridge.entry_var,
            `${expectedId} bridge drift: registry='${reg.bridge}' manifest='${manifest.manifold_bridge.entry_var}'`);
    });
}

// Substrate keys (not values) survive the compile so portal can list them.
for (const { manifest } of portalGames) {
    const expectedId = typeof manifest.manifold === 'string'
        ? manifest.manifold : manifest.name;
    test(`registry substrate keys for '${expectedId}' match source manifest`, () => {
        const reg = registry.games.find(g => g.id === expectedId
            || g.name === manifest.name);
        assert.ok(reg);
        const expectedKeys = Object.keys(manifest.substrates || {})
            .filter(k => k !== '_note').sort();
        const actualKeys = [...(reg.substrates || [])].sort()
            .filter(k => k !== '_note');
        assert.deepEqual(actualKeys, expectedKeys,
            `${expectedId} substrate-key drift: registry=${actualKeys.join(',')} manifest=${expectedKeys.join(',')}`);
    });
}
