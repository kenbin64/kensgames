/**
 * ============================================================================
 * FASTTRACK HEADLESS ENGINE
 *
 * Loads fasttrack-game-core.js as a rules engine with no browser, so the exact
 * same rules that run in the player's tab can run inside a server room as the
 * single authority.
 *
 * Why this exists
 * ---------------
 * FastTrack multiplayer currently has three write paths into one game state:
 * the host's snapshots, each peer re-simulating broadcast actions locally, and
 * the server's own turn counter (which today only paints a status label). Three
 * opinions, no reconciliation, which is why players end up in separate games and
 * why turns get skipped. The fix is one authority. This module is what lets the
 * server BE that authority without forking the rules into a second codebase,
 * which would only recreate the same disagreement one level up.
 *
 * Why `vm` and not `require`
 * --------------------------
 * The core keeps its game state in module-level closures (`state`, the card
 * matrix, the turn guard). A plain require would give every concurrent table one
 * shared board. Each engine here gets its own V8 context, so two games running in
 * the same process cannot see or corrupt each other. That isolation is the whole
 * point on a server.
 *
 * The DOM shim
 * ------------
 * Measured, not guessed: of 109 top-level functions in the core, 86 touch no DOM
 * at all, and the rules surface the server needs is almost entirely clean.
 * `calculateValidMoves`, all 717 lines of it, has zero DOM references. Only three
 * rules functions touch the DOM at all, 11 references between them, and every one
 * is cosmetic (clear the hints panel, draw the card face, grab the draw button).
 * All are already guarded with null checks, so a shim that returns null for every
 * lookup is enough. Nothing in the rules depends on a render succeeding.
 *
 * Usage:
 *     const { createEngine } = require('./engine/headless');
 *     const g = createEngine();
 *     g.initGame(2);
 *     g.drawCard();
 *     g.executeMove(g.state.turn.get('validMoves')[0]);
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE_PATH = path.join(__dirname, '..', 'fasttrack-game-core.js');
const CODEC_PATH = path.join(__dirname, '..', '..', 'js', 'manifold-codec.js');

/** A DOM stand-in that is inert but never throws. */
function makeStubElement() {
  const el = {
    innerHTML: '', textContent: '', value: '', disabled: false, checked: false,
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, remove() {}, setAttribute() {},
    getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, blur() {}, click() {}, closest() { return null; },
    contains() { return false; }, insertBefore() {}, replaceChild() {},
    getElementsByClassName() { return []; }, getElementsByTagName() { return []; },
    hasAttribute() { return false; }, removeAttribute() {}, scrollIntoView() {},
    animate() { return { cancel() {}, finish() {} }; },
    children: [], childNodes: [], firstChild: null, parentNode: null,
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
  };
  return el;
}

/**
 * Build one isolated engine.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.captureLog=false] keep the core's log lines in engine.logLines
 * @returns {object} the FastTrackCore surface, plus `logLines` and `sandbox`
 */
function createEngine(opts = {}) {
  const captureLog = !!opts.captureLog;
  const logLines = [];

  // getElementById returns null so the core's `if (el)` guards short-circuit,
  // which is exactly the path the existing test suites already exercise.
  const documentStub = {
    getElementById: () => null,
    createElement: () => makeStubElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    body: makeStubElement(),
    head: makeStubElement(),
    documentElement: makeStubElement(),
    readyState: 'complete',
  };

  const sandbox = {
    console: captureLog
      ? { log: (...a) => logLines.push(a.join(' ')), warn() {}, error() {}, info() {}, debug() {} }
      : { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, WeakMap, WeakSet,
    Promise, Symbol, RegExp, Error, TypeError, RangeError, isNaN, isFinite,
    parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    performance: { now: () => Date.now() },
    document: documentStub,
    localStorage: {
      _d: new Map(),
      getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
      setItem(k, v) { this._d.set(k, String(v)); },
      removeItem(k) { this._d.delete(k); },
      clear() { this._d.clear(); },
    },
    navigator: { userAgent: 'fasttrack-headless' },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
  };

  // The core reads and writes `window.*` throughout, so window is the sandbox
  // itself. Self-referential the same way it is in a browser.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  // The core emits manifold telemetry through window.dispatchEvent. Server
  // side nobody is listening, but it must not throw.
  sandbox.dispatchEvent = () => true;
  sandbox.Event = class { constructor(t) { this.type = t; } };

  const context = vm.createContext(sandbox);

  // ManifoldCodec must exist BEFORE the core runs. shuffleDeck() uses
  // codec.seededShuffle to derive the deck from the shared session seed; if the
  // codec is missing it falls back to a private Math.random() shuffle, silently.
  // That fallback is the original "everyone gets a different board" bug, so a
  // server authority must never be allowed to reach it.
  try {
    const codecSrc = fs.readFileSync(CODEC_PATH, 'utf8');
    vm.runInContext(codecSrc, context, { filename: 'manifold-codec.js', timeout: 10000 });
  } catch (err) {
    throw new Error(`headless engine could not load ManifoldCodec (needed for deterministic decks): ${err && err.message}`);
  }
  if (!sandbox.ManifoldCodec || typeof sandbox.ManifoldCodec.seededShuffle !== 'function') {
    throw new Error('ManifoldCodec loaded but seededShuffle is missing; deck order would be nondeterministic');
  }

  const src = fs.readFileSync(CORE_PATH, 'utf8');

  try {
    vm.runInContext(src, context, { filename: 'fasttrack-game-core.js', timeout: 30000 });
  } catch (err) {
    throw new Error(`headless engine failed to load the core: ${err && err.message}`);
  }

  const core = sandbox.FastTrackCore || sandbox.window.FastTrackCore;
  if (!core) throw new Error('core loaded but never assigned window.FastTrackCore');

  // Top-level function declarations land on the sandbox, not on FastTrackCore,
  // so expose the few the room needs that the core does not export itself.
  const extras = {};
  for (const name of ['calculateValidMoves', 'buildCardMatrix', 'getCardDescription', 'isSevenCard']) {
    if (typeof sandbox[name] === 'function' && typeof core[name] !== 'function') {
      extras[name] = sandbox[name];
    }
  }

  return Object.assign(Object.create(null), core, extras, {
    logLines,
    sandbox,
    /** Structured snapshot suitable for shipping to clients. */
    snapshot() {
      return typeof core.getStateSnapshot === 'function' ? core.getStateSnapshot() : null;
    },
  });
}

module.exports = { createEngine, makeStubElement, CORE_PATH, CODEC_PATH };
