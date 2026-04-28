'use strict';
// Substrate truthfulness: every file-shaped substrate ref in a game's
// manifest must point at a file that actually exists in that game's dir,
// and any "file.js:Symbol" ref must mention the symbol in the file.
// Mirrors the rules in engine/manifold_compiler.py:validate_substrates.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPortalGames, classifySubstrate, rootPath } = require('./_helpers');

const GAMES = loadPortalGames();

for (const { id, dirRelPath, manifest } of GAMES) {
    const subs = manifest.substrates || {};

    test(`${id}: every file-shaped substrate ref exists on disk`, () => {
        for (const [key, ref] of Object.entries(subs)) {
            const cls = classifySubstrate(key, ref);
            if (cls === 'skip' || cls === 'shared' || cls === 'prose') continue;
            const filePart = ref.split(':', 1)[0];
            const full = rootPath(dirRelPath, filePart);
            assert.ok(fs.existsSync(full),
                `${id} substrate '${key}' → ${ref} not found at ${full}`);
        }
    });

    test(`${id}: every file:symbol substrate has the symbol referenced in the file`, () => {
        for (const [key, ref] of Object.entries(subs)) {
            if (classifySubstrate(key, ref) !== 'file_symbol') continue;
            const [filePart, symbol] = ref.split(':', 2);
            const full = rootPath(dirRelPath, filePart);
            const src = fs.readFileSync(full, 'utf8');
            // Match the symbol as a whole word; tolerates `window.X = ...`,
            // `class X`, `function X`, `const X =`, `module.exports = { X }`.
            const re = new RegExp('\\b' + symbol.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\b');
            assert.ok(re.test(src),
                `${id} substrate '${key}' references symbol '${symbol}' but it is not present in ${filePart}`);
        }
    });
}

// Cross-check: anything in shared:* / prose / inline:* is allowed but should
// be the exception, not the rule. We surface a soft summary so drift is visible.
test('substrate ref classification summary (informational)', () => {
    const counts = { file: 0, file_symbol: 0, shared: 0, prose: 0, skip: 0 };
    for (const { manifest } of GAMES) {
        for (const [k, v] of Object.entries(manifest.substrates || {})) {
            counts[classifySubstrate(k, v)]++;
        }
    }
    // Just print, don't fail — useful in CI logs.
    console.log('  substrate classification:', JSON.stringify(counts));
    assert.ok(counts.file + counts.file_symbol > 0,
        'expected at least one real file-backed substrate across all games');
});
