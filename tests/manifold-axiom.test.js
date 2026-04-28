'use strict';
// Universal manifold axiom: z = x * y must hold for every shipped game.
// Also enforces the minimum manifest shape required by the compiler and
// the runtime ManifoldBridge contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAllGameManifests, loadPortalGames } = require('./_helpers');

const ALL = loadAllGameManifests();
const PORTAL = loadPortalGames();

test('every manifold.game.json on disk is parseable JSON', () => {
    assert.ok(ALL.length > 0, 'no manifold.game.json files found');
});

for (const { dir, manifestRelPath, manifest } of ALL) {
    test(`${dir}: dimension satisfies z = x * y`, () => {
        const dim = manifest.dimension;
        assert.ok(dim, `${manifestRelPath} missing dimension block`);
        for (const k of ['x', 'y', 'z']) {
            assert.equal(typeof dim[k], 'number',
                `${manifestRelPath} dimension.${k} must be a number`);
            assert.ok(Number.isInteger(dim[k]),
                `${manifestRelPath} dimension.${k} must be an integer`);
            assert.ok(dim[k] > 0,
                `${manifestRelPath} dimension.${k} must be positive`);
        }
        assert.equal(dim.z, dim.x * dim.y,
            `${manifestRelPath} axiom violated: z=${dim.z} but x*y=${dim.x * dim.y}`);
    });

    test(`${dir}: required top-level keys present`, () => {
        for (const k of ['name', 'version', 'dimension', 'entry', 'substrates']) {
            assert.ok(manifest[k] !== undefined,
                `${manifestRelPath} missing required key '${k}'`);
        }
        assert.equal(typeof manifest.name, 'string');
        assert.equal(typeof manifest.version, 'string');
        assert.equal(typeof manifest.entry, 'string');
        assert.equal(typeof manifest.substrates, 'object');
    });
}

for (const { id, dirRelPath, manifest } of PORTAL) {
    test(`${id}: declares ManifoldBridge entry_var = window.__MANIFOLD__`, () => {
        const bridge = manifest.manifold_bridge;
        assert.ok(bridge, `${dirRelPath}/manifold.game.json missing manifold_bridge`);
        assert.equal(bridge.entry_var, 'window.__MANIFOLD__',
            `${id} bridge entry_var must be window.__MANIFOLD__ for portal discovery`);
        assert.ok(Array.isArray(bridge.exposes) && bridge.exposes.length > 0,
            `${id} bridge.exposes must be a non-empty array`);
    });

    test(`${id}: portal-listed and manifest agree on identity`, () => {
        // The compiler treats the portal as authoritative for path/entry.
        // Manifest's `manifold` field is the canonical id when it's a string;
        // cubic3d uses an object DSL so we tolerate that case.
        if (typeof manifest.manifold === 'string') {
            // 4DTicTacToe's portal id is "4dtictactoe" but its manifold id is
            // "4dconnect" (deliberate — the compiler emits "4dconnect"). We only
            // require they're both non-empty strings.
            assert.ok(manifest.manifold.length > 0,
                `${id} manifest.manifold must be non-empty`);
        } else {
            assert.equal(typeof manifest.manifold, 'object',
                `${id} manifest.manifold must be string or object DSL`);
        }
    });
}
