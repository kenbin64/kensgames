'use strict';
// X-Dimensional Programming algebraic axiom family.
//
// Tests the full set of relations the framework allows:
//   z = xy        (universal access rule)
//   z = x/y       (rate / per-unit)
//   z = xy^2      (quadratic-in-y expression)
//   z = x/y^2     (inverse-square-in-y)
//   x = yz        (identity recovered from behavior+state)
//   x = y/z       ; y = xz ; y = x/z  (symmetric rearrangements)
//   m = xyz       (4-dim extension)
//
// For every shipped game's manifest, asserts the dimension tuple
// satisfies its declared / default relation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAllGameManifests, loadPortalGames } = require('./_helpers');
const { RELATIONS, invertZxy, approxEq } = require('./_xmath');

// ── Pure-relation tests (no manifest) ─────────────────────────────
//
// Verifies the math primitives themselves are consistent so manifest
// tests below can rely on them.

test('z=xy  satisfied by (x=2, y=12, z=24)', () =>
    assert.ok(RELATIONS['z=xy'](2, 12, 24)));

test('z=xy  rejects (x=2, y=12, z=25)', () =>
    assert.ok(!RELATIONS['z=xy'](2, 12, 25)));

test('z=x/y satisfied by (x=10, y=2, z=5)', () =>
    assert.ok(RELATIONS['z=x/y'](10, 2, 5)));

test('z=xy^2 satisfied by (x=3, y=4, z=48)', () =>
    assert.ok(RELATIONS['z=xy^2'](3, 4, 48)));

test('z=x/y^2 satisfied by (x=100, y=5, z=4)', () =>
    assert.ok(RELATIONS['z=x/y^2'](100, 5, 4)));

test('x=yz   satisfied by (x=24, y=2, z=12)', () =>
    assert.ok(RELATIONS['x=yz'](24, 2, 12)));

test('x=y/z  satisfied by (x=2, y=24, z=12)', () =>
    assert.ok(RELATIONS['x=y/z'](2, 24, 12)));

test('y=xz   satisfied by (x=2, y=24, z=12)', () =>
    assert.ok(RELATIONS['y=xz'](2, 24, 12)));

test('y=x/z  satisfied by (x=24, y=2, z=12)', () =>
    assert.ok(RELATIONS['y=x/z'](24, 2, 12)));

test('m=xyz  satisfied by (x=2, y=3, z=4, m=24)', () =>
    assert.ok(RELATIONS['m=xyz'](2, 3, 4, 24)));

// ── Inverse / consistency lemmas ──────────────────────────────────
test('z=xy  invertibility: x = z/y and y = z/x recover identities', () => {
    const [x, y] = [3, 7];
    const z = x * y;
    const inv = invertZxy(x, y, z);
    assert.ok(approxEq(inv.x_from_zy, x), `x = z/y should = ${x}, got ${inv.x_from_zy}`);
    assert.ok(approxEq(inv.y_from_zx, y), `y = z/x should = ${y}, got ${inv.y_from_zx}`);
});

test('z=xy  z=0 when x=0 OR y=0 (identity-or-behavior absent ⇒ no state)', () => {
    assert.ok(RELATIONS['z=xy'](0, 999, 0), 'x=0 ⇒ z=0');
    assert.ok(RELATIONS['z=xy'](999, 0, 0), 'y=0 ⇒ z=0');
});

test('Family cross-consistency: if z=xy then both x=z/y and y=z/x must hold', () => {
    for (const [x, y] of [[1, 1], [2, 12], [5, 7], [100, 0.25]]) {
        const z = x * y;
        assert.ok(RELATIONS['z=xy'](x, y, z));
        if (y !== 0) assert.ok(RELATIONS['z=x/y'](z, y, x),
            `z=${z}, y=${y} ⇒ x = z/y = ${x}`);
        if (x !== 0) assert.ok(RELATIONS['z=x/y'](z, x, y),
            `z=${z}, x=${x} ⇒ y = z/x = ${y}`);
    }
});

// ── Manifest-bound axiom enforcement ──────────────────────────────
//
// The portal declares z = x*y as the universal access rule. Every
// shipped game's dimension tuple must satisfy at least one declared
// relation. If the manifest sets `dimension.relation`, that one wins;
// otherwise we default to the universal `z=xy`.

const ALL = loadAllGameManifests();

for (const { dir, manifest } of ALL) {
    test(`${dir}: dimension tuple satisfies declared algebraic relation`, () => {
        const dim = manifest.dimension;
        const declared = dim.relation || 'z=xy';
        assert.ok(RELATIONS[declared],
            `${dir} declares unknown relation '${declared}'; allowed: ${Object.keys(RELATIONS).join(', ')}`);
        const ok = declared === 'm=xyz'
            ? RELATIONS[declared](dim.x, dim.y, dim.z, dim.m)
            : RELATIONS[declared](dim.x, dim.y, dim.z);
        assert.ok(ok,
            `${dir} dimension (x=${dim.x}, y=${dim.y}, z=${dim.z}${dim.m !== undefined ? `, m=${dim.m}` : ''}) violates declared relation '${declared}'`);
    });
}

// 4D-claiming games: if dimension declares an `m`, it must equal xyz.
for (const { dir, manifest } of ALL) {
    if (manifest.dimension.m === undefined) continue;
    test(`${dir}: 4D extension m = x*y*z`, () => {
        const { x, y, z, m } = manifest.dimension;
        assert.ok(RELATIONS['m=xyz'](x, y, z, m),
            `${dir} m=${m} but x*y*z=${x * y * z}`);
    });
}

// Portal-level x/y/z semantic declaration must be present.
const PORTAL_GAMES = loadPortalGames();
test('portal declares x = identity, y = behavior, z = expression', () => {
    const portal = require('./_helpers').loadPortal();
    const dims = portal.dimensions;
    assert.ok(dims, 'manifold.portal.json missing dimensions block');
    for (const k of ['x', 'y', 'z']) {
        assert.ok(typeof dims[k] === 'string' && dims[k].length > 0,
            `portal.dimensions.${k} must be a non-empty string identifier`);
    }
    // z must declare itself as an expression in x and y.
    assert.match(dims.z, /[xy*+\/\-]/,
        `portal.dimensions.z='${dims.z}' must reference x and/or y as an expression`);
});

test(`every portal-listed game (${PORTAL_GAMES.length}) satisfies z = x*y at the registry level`, () => {
    for (const { id, manifest } of PORTAL_GAMES) {
        const { x, y, z } = manifest.dimension;
        assert.ok(RELATIONS['z=xy'](x, y, z),
            `portal-listed game '${id}' violates universal access rule z=xy`);
    }
});
