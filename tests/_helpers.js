'use strict';
// Shared helpers for the manifold test suite.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadJSON(relPath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function loadPortal() {
    return loadJSON('manifold.portal.json');
}

// Returns [{ id, dirRelPath, manifestRelPath, manifest }] for every game
// declared in manifold.portal.json. The portal is the source of truth for
// what is actually shipped.
function loadPortalGames() {
    const portal = loadPortal();
    return portal.games.map(g => {
        const manifestRel = g.manifold;
        const dirRel = g.path.replace(/\/$/, '');
        return {
            id: g.id,
            portalEntry: g,
            dirRelPath: dirRel,
            manifestRelPath: manifestRel,
            manifest: loadJSON(manifestRel),
        };
    });
}

// Loads every manifold.game.json on disk (depth 2), even if the game is not
// declared in the portal. Used by the axiom test to catch drift in WIP games.
function loadAllGameManifests() {
    const out = [];
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(ROOT, entry.name, 'manifold.game.json');
        if (fs.existsSync(candidate)) {
            out.push({
                dir: entry.name,
                manifestRelPath: path.join(entry.name, 'manifold.game.json'),
                manifest: JSON.parse(fs.readFileSync(candidate, 'utf8')),
            });
        }
    }
    return out;
}

// Substrate-value classifier matching engine/manifold_compiler.py:validate_substrates.
// Returns one of: 'skip' | 'shared' | 'file' | 'file_symbol' | 'prose'.
const SUBSTRATE_FILE_RE = /^[A-Za-z0-9_./-]+\.js(?::[A-Za-z_$][A-Za-z0-9_$]*)?$/;
function classifySubstrate(key, ref) {
    if (key === '_note') return 'skip';
    if (typeof ref !== 'string') return 'skip';
    if (ref.startsWith('shared:')) return 'shared';
    if (ref.startsWith('inline:')) return 'skip';
    if (!SUBSTRATE_FILE_RE.test(ref)) return 'prose';
    return ref.includes(':') ? 'file_symbol' : 'file';
}

function rootPath(...parts) { return path.join(ROOT, ...parts); }

module.exports = {
    ROOT,
    loadJSON,
    loadPortal,
    loadPortalGames,
    loadAllGameManifests,
    classifySubstrate,
    rootPath,
};
