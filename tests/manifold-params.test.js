'use strict';
// Manifold-driven constants contract: every key declared under
// manifest.params must be referenced in at least one of the game's JS
// source files. Catches "declared-but-never-consumed" drift, which would
// silently make the manifest non-authoritative.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPortalGames, rootPath } = require('./_helpers');

const GAMES = loadPortalGames();

// All .js files immediately under a game's dir (depth 1) are considered
// candidate consumers. We deliberately don't recurse into subdirs to keep
// the check fast and focused on shipped game code.
function gameSources(dirRel) {
    const dir = rootPath(dirRel);
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
        .join('\n/* --- */\n');
}

// Walk a params object and yield every leaf key path (skips _note keys).
function* paramKeyPaths(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj || {})) {
        if (k === '_note' || k.startsWith('_')) continue;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            yield* paramKeyPaths(v, prefix ? `${prefix}.${k}` : k);
        } else {
            yield prefix ? `${prefix}.${k}` : k;
        }
    }
}

for (const { id, dirRelPath, manifest } of GAMES) {
    if (!manifest.params) continue;

    test(`${id}: every params.* key is consumed by game JS`, () => {
        const src = gameSources(dirRelPath);
        const missing = [];
        for (const keyPath of paramKeyPaths(manifest.params)) {
            const leaf = keyPath.split('.').pop();
            // Match the leaf as a whole word OR as a JS property access.
            // Permissive on purpose: a key like 'lives_solo' may appear as
            //   p.lives_solo, params.lives_solo, m.params.lives_solo, or
            //   destructured `const { lives_solo } = ...`.
            const re = new RegExp('\\b' + leaf.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\b');
            if (!re.test(src)) missing.push(keyPath);
        }
        assert.deepEqual(missing, [],
            `${id} declares params keys that no JS source consumes: ${missing.join(', ')}`);
    });

    test(`${id}: game JS fetches its own manifold.game.json at runtime`, () => {
        const src = gameSources(dirRelPath);
        // Browser-side load pattern: fetch('./manifold.game.json') or
        // fetch('manifold.game.json').
        assert.match(src, /fetch\(\s*['"](?:\.\/)?manifold\.game\.json['"]/,
            `${id} declares a params block but no JS source fetches manifold.game.json`);
    });
}

// Bridge call must advertise dimensions that match the manifest. This is
// the runtime contract that arcade.js / portal discovery relies on.
const BRIDGE_INIT_RE = /ManifoldBridge\.init\(\s*\{([\s\S]*?)\}\s*\)/;
const BRIDGE_X_RE = /\bx\s*:\s*([0-9]+)/;
const BRIDGE_Y_RE = /\by\s*:\s*([0-9]+)/;

for (const { id, dirRelPath, manifest } of GAMES) {
    test(`${id}: ManifoldBridge.init dimensions match manifest (or yield from it)`, () => {
        const src = gameSources(dirRelPath);
        const m = src.match(BRIDGE_INIT_RE);
        if (!m) return; // game has no bridge call yet; not all games wire it
        const body = m[1];
        const xLit = body.match(BRIDGE_X_RE);
        const yLit = body.match(BRIDGE_Y_RE);
        const { x: mx, y: my } = manifest.dimension;
        // Two acceptable shapes: a literal that matches the manifest, OR a
        // dynamic read like `x: m.dimension?.x ?? <fallback>`. The dynamic
        // form omits a bare integer literal, so missing literal == OK.
        if (xLit) {
            assert.equal(Number(xLit[1]), mx,
                `${id} ManifoldBridge.init x=${xLit[1]} but manifest says x=${mx}`);
        }
        if (yLit) {
            assert.equal(Number(yLit[1]), my,
                `${id} ManifoldBridge.init y=${yLit[1]} but manifest says y=${my}`);
        }
    });
}
