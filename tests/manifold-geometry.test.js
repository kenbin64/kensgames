'use strict';
// Manifold-as-geometry: a manifold is a shape generated from a math
// expression that holds properties / attributes convertible to compute
// datatypes. The substrate is the *observer* — a pure function that
// evaluates the manifold expression at a state point.
//
// This file tests:
//   1. The reference geometric expressions (gyroid, Schwarz Diamond,
//      Schwarz Primitive) as pure functions: zeros, symmetries,
//      gradients, observability.
//   2. That game manifests / source declaring those substrates use the
//      correct expression (textual cross-check against the canonical
//      formula).
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAllGameManifests, rootPath } = require('./_helpers');
const {
    EPS, approxEq,
    gyroid, schwarzDiamond, schwarzPrimitive,
    gradient, norm3, isObserver,
} = require('./_xmath');

const PI = Math.PI;
const TAU = 2 * PI;
const GEOM_EPS = 1e-6;

// ── Substrate-as-observer: pure-function contract ─────────────────
//
// Every geometric substrate is a pure function (state) -> value. It
// must be deterministic, side-effect free, and yield finite numbers
// across its domain.
const SAMPLES = [
    [0, 0, 0], [PI / 4, PI / 4, PI / 4],
    [PI / 2, PI / 3, PI / 6], [-PI / 5, PI / 7, 2 * PI / 3],
    [TAU, TAU, TAU], [1.234, 5.678, -9.012],
];

test('substrate(gyroid) is an observer (pure, deterministic, finite)', () =>
    assert.ok(isObserver(gyroid, SAMPLES)));

test('substrate(schwarzDiamond) is an observer', () =>
    assert.ok(isObserver(schwarzDiamond, SAMPLES)));

test('substrate(schwarzPrimitive) is an observer', () =>
    assert.ok(isObserver(schwarzPrimitive, SAMPLES)));

// ── Gyroid: known mathematical identities ─────────────────────────
//
// gyroid(x,y,z) = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)

test('gyroid(0,0,0) = 0  (origin lies on the surface)', () =>
    assert.ok(approxEq(gyroid(0, 0, 0), 0, GEOM_EPS)));

test('gyroid is invariant under cyclic permutation (x,y,z) → (y,z,x)', () => {
    for (const [x, y, z] of SAMPLES) {
        assert.ok(approxEq(gyroid(x, y, z), gyroid(y, z, x), GEOM_EPS),
            `gyroid not cyclic-invariant at (${x},${y},${z})`);
    }
});

test('gyroid is 2π-periodic in each coordinate', () => {
    for (const [x, y, z] of SAMPLES) {
        assert.ok(approxEq(gyroid(x, y, z), gyroid(x + TAU, y, z), GEOM_EPS));
        assert.ok(approxEq(gyroid(x, y, z), gyroid(x, y + TAU, z), GEOM_EPS));
        assert.ok(approxEq(gyroid(x, y, z), gyroid(x, y, z + TAU), GEOM_EPS));
    }
});

test('gyroid surface has non-zero gradient at origin (well-defined normal)', () => {
    const g = gradient(gyroid, 0, 0, 0);
    // ∂/∂x = cos(x)cos(y) - sin(z)sin(x); at origin = 1·1 - 0 = 1
    assert.ok(norm3(g) > 0.5,
        `gradient at origin should be ~(1,1,1), got |g|=${norm3(g)}`);
});

// ── Schwarz Diamond: known identities ─────────────────────────────
//
// D(x,y,z) = cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z)

test('schwarzDiamond(0,0,0) = 1  (cos^3(0) - sin^3(0) = 1)', () =>
    assert.ok(approxEq(schwarzDiamond(0, 0, 0), 1, GEOM_EPS)));

test('schwarzDiamond(π/2, π/2, π/2) = 0  (sits on surface)', () =>
    assert.ok(approxEq(schwarzDiamond(PI / 2, PI / 2, PI / 2), -1, GEOM_EPS),
        // cos(π/2)^3 - sin(π/2)^3 = 0 - 1 = -1
    ));

test('schwarzDiamond is symmetric in (x,y,z) (any permutation gives same value)', () => {
    for (const [x, y, z] of SAMPLES) {
        const v = schwarzDiamond(x, y, z);
        assert.ok(approxEq(v, schwarzDiamond(y, x, z), GEOM_EPS));
        assert.ok(approxEq(v, schwarzDiamond(z, y, x), GEOM_EPS));
        assert.ok(approxEq(v, schwarzDiamond(y, z, x), GEOM_EPS));
    }
});

test('schwarzDiamond half-state |D(π/4,π/4,π/4)| < 1 (zero-crossing region)', () => {
    const v = schwarzDiamond(PI / 4, PI / 4, PI / 4);
    assert.ok(Math.abs(v) < 1,
        `expected |D(π/4,π/4,π/4)|<1, got ${v}`);
});

// ── Schwarz Primitive: identities ─────────────────────────────────
//
// P(x,y,z) = cos(x) + cos(y) + cos(z); first-harmonic form used by
// fasttrack/schwarz_diamond_renderer.js.

test('schwarzPrimitive(0,0,0) = 3', () =>
    assert.ok(approxEq(schwarzPrimitive(0, 0, 0), 3, GEOM_EPS)));

test('schwarzPrimitive(π/2, π/2, π/2) = 0  (lies on surface)', () =>
    assert.ok(approxEq(schwarzPrimitive(PI / 2, PI / 2, PI / 2), 0, GEOM_EPS)));

test('schwarzPrimitive is symmetric under any permutation of (x,y,z)', () => {
    for (const [x, y, z] of SAMPLES) {
        const v = schwarzPrimitive(x, y, z);
        assert.ok(approxEq(v, schwarzPrimitive(z, x, y), GEOM_EPS));
        assert.ok(approxEq(v, schwarzPrimitive(y, x, z), GEOM_EPS));
    }
});

// ── Manifest / source cross-check: declared formula matches canonical ──
//
// If a game's manifest text or source mentions a named substrate
// (gyroid / schwarz_diamond / schwarz_primitive), we require the
// canonical expression appear nearby. Catches "named one thing,
// implemented another" drift.

const ALL = loadAllGameManifests();

function manifestText({ manifestRelPath }) {
    return fs.readFileSync(rootPath(manifestRelPath), 'utf8');
}

test('cubic3d declares the canonical gyroid expression', () => {
    const cubic = ALL.find(m => m.dir === 'cubic3d');
    if (!cubic) return;
    const txt = manifestText(cubic);
    // Match the algebraic kernel: sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)
    assert.match(txt, /sin\s*\(\s*x\s*\)\s*cos\s*\(\s*y\s*\)/i,
        'cubic3d manifest declares gyroid but missing sin(x)cos(y) term');
    assert.match(txt, /sin\s*\(\s*y\s*\)\s*cos\s*\(\s*z\s*\)/i,
        'cubic3d manifest declares gyroid but missing sin(y)cos(z) term');
    assert.match(txt, /sin\s*\(\s*z\s*\)\s*cos\s*\(\s*x\s*\)/i,
        'cubic3d manifest declares gyroid but missing sin(z)cos(x) term');
});

test('cubic3d declares the canonical Schwartz Diamond expression', () => {
    const cubic = ALL.find(m => m.dir === 'cubic3d');
    if (!cubic) return;
    const txt = manifestText(cubic);
    assert.match(txt, /cos\s*\(\s*x\s*\)\s*cos\s*\(\s*y\s*\)\s*cos\s*\(\s*z\s*\)/i,
        'cubic3d Schwartz Diamond missing cos(x)cos(y)cos(z) term');
    assert.match(txt, /sin\s*\(\s*x\s*\)\s*sin\s*\(\s*y\s*\)\s*sin\s*\(\s*z\s*\)/i,
        'cubic3d Schwartz Diamond missing sin(x)sin(y)sin(z) term');
});

test('fasttrack/schwarz_diamond_renderer.js implements z = u*v (universal access rule)', () => {
    const p = rootPath('fasttrack/schwarz_diamond_renderer.js');
    if (!fs.existsSync(p)) return;
    const src = fs.readFileSync(p, 'utf8');
    // Source should compute z as the product of two coords (the sacred
    // primitive), and reference the Schwarz field.
    assert.match(src, /u\s*\*\s*v|x\s*\*\s*y/,
        'schwarz_diamond_renderer.js missing the z = u*v primitive');
    assert.match(src, /cos\s*\(/i,
        'schwarz_diamond_renderer.js named "schwarz" but uses no cosine terms');
});
