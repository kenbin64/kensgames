'use strict';
// Minimal browser-globals shim for loading shipped game modules under
// node:test. Two delivery modes:
//
//   1. requireBrowserModule(relPath)
//      For modules that already declare `if (typeof module !== 'undefined')
//      module.exports = ...`. Sets up a global `window` shim, then
//      delegates to require(). Returns module.exports.
//
//   2. loadInBrowserContext(relPath, extras)
//      For modules that only assign to `window.X` or declare top-level
//      `let`/`const` bindings. Uses `vm.createContext` so the script's
//      lexical scope persists between runInContext calls and can be
//      probed without modifying the source file.
//
// Both modes reset their state on each call so tests are independent.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

// ── Common browser globals every game touches ──────────────────────
function freshWindow(extras = {}) {
    const listeners = new Map();
    const window = {
        addEventListener: (name, fn) => {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(fn);
        },
        removeEventListener: (name, fn) => {
            const ls = listeners.get(name) || [];
            const i = ls.indexOf(fn);
            if (i >= 0) ls.splice(i, 1);
        },
        dispatchEvent: (ev) => {
            (listeners.get(ev.type) || []).forEach(fn => fn(ev));
            return true;
        },
        _listeners: listeners,
        innerWidth: 1920,
        innerHeight: 1080,
        location: { href: 'http://localhost/test', pathname: '/test' },
        requestAnimationFrame: (cb) => 1,
        cancelAnimationFrame: () => {},
    };
    Object.assign(window, extras.window || {});
    return window;
}

function freshDocument() {
    const elem = () => ({
        addEventListener: () => {},
        appendChild: () => {},
        setAttribute: () => {},
        removeAttribute: () => {},
        getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        innerHTML: '',
        querySelectorAll: () => [],
        children: [],
    });
    return {
        getElementById: () => elem(),
        querySelector: () => elem(),
        querySelectorAll: () => [],
        createElement: () => elem(),
        addEventListener: () => {},
        body: elem(),
        head: elem(),
        documentElement: elem(),
    };
}

// Mode 1 ── module.exports-friendly modules ────────────────────────
function requireBrowserModule(relPath) {
    // Reset window / document / etc. on each call so tests stay isolated.
    global.window = freshWindow();
    global.document = freshDocument();
    global.CustomEvent = class CustomEvent {
        constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    };
    const abs = path.resolve(ROOT, relPath);
    delete require.cache[abs];
    return require(abs);
}

// Mode 2 ── vm-context loading for top-level let/const modules ─────
//
// Returns { ctx, run } where:
//   ctx     is the vm context (also serves as the script's `globalThis`)
//   run(js) executes JS in the same lexical scope as the loaded file,
//           returning the expression value (so test code can probe
//           top-level let bindings like `PHI`).
function loadInBrowserContext(relPath, { fetchMap = {}, extras = {} } = {}) {
    const abs = path.resolve(ROOT, relPath);
    const src = fs.readFileSync(abs, 'utf8');
    const win = freshWindow(extras);
    const ctx = vm.createContext({
        window: win,
        document: freshDocument(),
        CustomEvent: class CustomEvent {
            constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
        },
        // Stub fetch — returns whatever is registered in fetchMap by url.
        fetch: async (url) => {
            const data = fetchMap[url] ?? fetchMap[path.basename(url)];
            if (data === undefined) {
                return { ok: false, status: 404, json: async () => ({}) };
            }
            return { ok: true, status: 200, json: async () => data };
        },
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        Map, Set, WeakMap, WeakSet, Promise,
        Math, JSON, Date, Number, String, Boolean, Array, Object, Error,
        Uint8Array, Uint8ClampedArray, Float32Array, Int32Array,
        ...extras.context || {},
    });
    // Make `window.foo` and bare `foo` interchangeable for top-level
    // assignments, the way browsers do.
    ctx.globalThis = ctx;
    // The script may reference THREE; provide an empty object so attribute
    // access doesn't ReferenceError. Individual tests can override via
    // extras.context.THREE to add specific stubs.
    if (!('THREE' in ctx)) ctx.THREE = {};
    vm.runInContext(src, ctx, { filename: relPath });
    return {
        ctx,
        win,
        run: (expr) => vm.runInContext(expr, ctx, { filename: `${relPath}#probe` }),
    };
}

module.exports = {
    ROOT,
    freshWindow, freshDocument,
    requireBrowserModule,
    loadInBrowserContext,
};
