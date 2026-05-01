'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInBrowserContext } = require('./_shim');
const { approxEq, RELATIONS } = require('./_xmath');

function makeStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
  };
}

test('meaning check: z=xy^2 and inverses are consistent', () => {
  const x = 3;
  const y = 4;
  const z = x * y * y;

  assert.ok(RELATIONS['z=xy^2'](x, y, z));
  assert.ok(approxEq(x, z / (y * y)), 'x should recover as z/(y^2)');
  assert.ok(approxEq(Math.abs(y), Math.sqrt(z / x)), 'y magnitude should recover as sqrt(z/x)');
});

test('meaning check: z=x/y^2 and inverses are consistent', () => {
  const x = 100;
  const y = 5;
  const z = x / (y * y);

  assert.ok(RELATIONS['z=x/y^2'](x, y, z));
  assert.ok(approxEq(x, z * y * y), 'x should recover as z*(y^2)');
  assert.ok(approxEq(Math.abs(y), Math.sqrt(x / z)), 'y magnitude should recover as sqrt(x/z)');
});

test('meaning check: m=xyz supports extraction of each axis', () => {
  const x = 2;
  const y = 3;
  const z = 4;
  const m = x * y * z;

  assert.ok(RELATIONS['m=xyz'](x, y, z, m));
  assert.ok(approxEq(x, m / (y * z)), 'x should recover as m/(y*z)');
  assert.ok(approxEq(y, m / (x * z)), 'y should recover as m/(x*z)');
  assert.ok(approxEq(z, m / (x * y)), 'z should recover as m/(x*y)');
});

test('ManifoldBridge algebra operators match declared equations', () => {
  const { run } = loadInBrowserContext('js/manifold_bridge.js');

  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.zFromXY(6, 7)'), 42));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.zExplodeFromXY(42, 7)'), 6));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.xFromZY(42, 7)'), 6));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.yFromZX(42, 6)'), 7));

  const bloom = run(`globalThis.ManifoldBridge.algebra.seedToBloom(2, [
        { id: 'a', value: 3 },
        { id: 'b', value: 5 }
    ], 'combine').z`);
  assert.ok(approxEq(bloom, 30), 'seed-to-bloom combine should multiply modifiers');

  // Denominator defaults to 1 for divide operations (never divide by zero).
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.zExplodeFromXY(42, 0)'), 42));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.xFromZY(42, 0)'), 42));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.xSeparateFromYZ(7, 0)'), 7));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.yFromZX(42, 0)'), 42));
  assert.ok(approxEq(run('globalThis.ManifoldBridge.algebra.ySeparateFromXZ(7, 0)'), 7));
});

test('DIMENSIONAL_SESSION derives y from manifold/session modifiers', () => {
  const storage = makeStorage();
  const calls = [];

  const bridgeStub = {
    composeEntity(spec) {
      calls.push(spec);
      const z = (spec.y || []).reduce((acc, item) => acc * Number(item.value || 1), Number(spec.xScalar || 1));
      return {
        x: { ref: spec.xRef, scalar: Number(spec.xScalar || 1) },
        y: spec.y,
        z,
        attrs: spec.attrs || {},
        whole: { id: spec.xRef, z },
      };
    },
  };

  const { run } = loadInBrowserContext('js/dimensional-session-bridge.js', {
    extras: {
      window: {
        sessionStorage: storage,
        localStorage: storage,
        ManifoldBridge: bridgeStub,
      },
    },
  });

  run(`window.KENSGAMES_SESSION = {
        _x: 'sess-1',
        _schema: '1.0-dimensional',
        game: {
            _x: 'fasttrack',
            name: 'FastTrack',
            x: 2,
            y: 30,
            z: 60,
            players: { count: 2, mode: 'multiplayer', difficulty: 'hard' },
            board: {}
        },
        modifiers: { inviteCode: 'ABCD', channel: 'direct' }
    };`);

  const extracted = run('window.DIMENSIONAL_SESSION.extract()');
  assert.ok(extracted && extracted.dimensionalWhole, 'extract should include dimensional whole');
  assert.equal(calls.length > 0, true, 'composeEntity should be called');

  const yIds = calls[0].y.map(item => item.id);
  assert.ok(yIds.includes('mode'), 'y should include mode modifier');
  assert.ok(yIds.includes('difficulty'), 'y should include difficulty modifier');
  assert.ok(yIds.includes('playerCount'), 'y should include playerCount modifier');
  assert.ok(yIds.includes('inviteCode'), 'y should include inviteCode modifier');
  assert.ok(yIds.includes('channel'), 'y should include channel modifier');
});
