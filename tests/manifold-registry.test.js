'use strict';
// The compiled registry (dist/manifold.registry.json) is what arcade.js
// fetches in production. Per HR-53 (docs/HARD_RULES.md §13) the public
// registry must expose only the public-safe contract — no per-game
// (x, y, z) triples, no substrate filenames, no axiom statement. The
// internal axiom is enforced at compile time on each source manifest by
// tests/manifold-axiom.test.js; this file asserts the shipped artifact
// honours the trade-secret boundary and still carries every portal-listed
// game with the fields arcade.js needs to render the grid.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT, loadPortalGames } = require('./_helpers');

const REGISTRY_PATH = path.join(ROOT, 'dist', 'manifold.registry.json');
const FALLBACK_PATH = path.join(ROOT, 'js', 'manifold.registry.json');

// Lazy registry loader. The compiled dist/ artifact is the canonical
// target; if it is missing we (a) try to compile it via the Python
// compiler, (b) fall back to the production-shipped copy at
// js/manifold.registry.json so the rest of the suite still runs on
// hosts without Python (e.g. local Windows). Module-top-level load
// would crash the whole file before any test could compile-on-demand.
let _registry = null;
let _usingFallback = false;
function getRegistry() {
    if (_registry) return _registry;
    if (!fs.existsSync(REGISTRY_PATH)) {
        try {
            execFileSync('python3', [path.join(ROOT, 'engine', 'manifold_compiler.py')],
                { cwd: ROOT, stdio: 'pipe' });
        } catch (_) { /* python unavailable; try fallback below */ }
    }
    let usePath;
    if (fs.existsSync(REGISTRY_PATH)) {
        usePath = REGISTRY_PATH;
    } else if (fs.existsSync(FALLBACK_PATH)) {
        usePath = FALLBACK_PATH;
        _usingFallback = true;
    } else {
        throw new Error('manifold.registry.json missing in dist/ and js/ — '
            + 'run `python3 engine/manifold_compiler.py` to generate it');
    }
    _registry = JSON.parse(fs.readFileSync(usePath, 'utf8'));
    return _registry;
}
// Parity/schema tests assert agreement with the current source-of-truth
// portal manifest. The shipped js/ copy can lag behind portal edits, so
// skip those checks when we fell back. The z=x*y axiom check still runs.
function skipIfFallback(t) {
    if (_usingFallback) {
        t.skip('skipping parity check: using stale js/manifold.registry.json '
            + '(dist/ artifact absent; recompile with engine/manifold_compiler.py)');
        return true;
    }
    return false;
}

// Recompile (or fall back) if missing so tests are runnable from a clean checkout.
test('registry exists (compile if missing, else fall back to js/manifold.registry.json)', () => {
    const r = getRegistry();
    assert.ok(r, 'registry could not be loaded from dist/ or js/');
    assert.ok(Array.isArray(r.games), 'registry.games must be an array');
});

const portalGames = loadPortalGames();

// Schema and HR-53 wiring-omission checks run unconditionally: they
// describe the public contract of whatever artifact is actually shipped,
// independent of whether dist/ is fresh.
test('registry schema: top-level fields present', () => {
    const registry = getRegistry();
    for (const k of ['_schema', '_compiled', 'portal', 'domain', 'games']) {
        assert.ok(registry[k] !== undefined, `registry missing top-level '${k}'`);
    }
    assert.ok(Array.isArray(registry.games));
});

// HR-53: the public artifact must not carry the wiring fields the
// compiler is responsible for stripping. Asserted both at the top level
// (no `dimensions` block) and per game (no `dimension`, no `substrates`).
test('registry omits trade-secret wiring fields (HR-53)', () => {
    const registry = getRegistry();
    assert.equal(registry.dimensions, undefined,
        'top-level `dimensions` must not appear in the public registry');
    for (const g of registry.games) {
        assert.equal(g.dimension, undefined,
            `${g.id}: registry must not expose per-game dimension triple`);
        assert.equal(g.substrates, undefined,
            `${g.id}: registry must not expose substrate filenames`);
    }
});

// Every shipped registry entry must satisfy the public-safe contract
// arcade.js depends on: stable id, display name, deploy path/entry,
// bridge symbol, and the derived multiplayer flag.
test('every registry entry satisfies the public-safe contract', () => {
    const registry = getRegistry();
    const required = ['id', 'name', 'path', 'entry', 'multiplayer', 'bridge'];
    for (const g of registry.games) {
        for (const k of required) {
            assert.ok(g[k] !== undefined,
                `${g.id || '(no id)'}: registry entry missing '${k}'`);
        }
        assert.equal(typeof g.multiplayer, 'boolean',
            `${g.id}: multiplayer must be boolean (got ${typeof g.multiplayer})`);
    }
});

// Portal parity is a freshness check: it only holds when the registry
// was compiled against the current portal config. Skip on fallback.
test(`registry contains every portal-listed game (${portalGames.length})`, (t) => {
    const registry = getRegistry();
    if (skipIfFallback(t)) return;
    assert.equal(registry.games.length, portalGames.length,
        `expected ${portalGames.length} games in registry, got ${registry.games.length}`);
});

// Bridge advertised in the registry must match the source manifest.
for (const { manifest } of portalGames) {
    const expectedId = typeof manifest.manifold === 'string'
        ? manifest.manifold : manifest.name;
    test(`registry bridge entry_var for '${expectedId}' matches source manifest`, (t) => {
        const registry = getRegistry();
        if (skipIfFallback(t)) return;
        const reg = registry.games.find(g => g.id === expectedId
            || g.name === manifest.name);
        assert.ok(reg, `registry has no game with id '${expectedId}' / name '${manifest.name}'`);
        assert.equal(reg.bridge, manifest.manifold_bridge.entry_var,
            `${expectedId} bridge drift: registry='${reg.bridge}' manifest='${manifest.manifold_bridge.entry_var}'`);
    });
}

// The derived `multiplayer` flag must match the source manifest's x>1.
for (const { manifest } of portalGames) {
    const expectedId = typeof manifest.manifold === 'string'
        ? manifest.manifold : manifest.name;
    test(`registry multiplayer flag for '${expectedId}' agrees with source`, (t) => {
        const registry = getRegistry();
        if (skipIfFallback(t)) return;
        const reg = registry.games.find(g => g.id === expectedId
            || g.name === manifest.name);
        assert.ok(reg);
        const x = manifest.dimension && manifest.dimension.x;
        const expected = Number.isInteger(x) && x > 1;
        assert.equal(reg.multiplayer, expected,
            `${expectedId} multiplayer drift: registry=${reg.multiplayer} expected=${expected}`);
    });
}
