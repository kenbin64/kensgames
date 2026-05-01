'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireBrowserModule } = require('./_shim');
const { loadInBrowserContext } = require('./_shim');
const { approxEq } = require('./_xmath');

const Manifold = requireBrowserModule('js/manifold.js');

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function normalizeCoord(y) {
  // Deterministic map from observed y -> [0,1]
  return clamp01(0.5 + 0.5 * Math.tanh(Number(y) || 0));
}

function rgbFromCoord(c) {
  // Simple spectrum-like gradient using manifold coordinate only.
  const r = Math.round(255 * c);
  const g = Math.round(255 * (1 - Math.abs(2 * c - 1)));
  const b = Math.round(255 * (1 - c));
  return { r, g, b };
}

function htmlFromRgb(rgb) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function observeColorLens(xSeed, opts = {}) {
  const obs = Manifold.loop.observe({ seed: xSeed }, { t: opts.t == null ? 0.5 : opts.t });
  const intent = Array.isArray(opts.intent) ? opts.intent : [1, 1, 1, 1];

  // y is manifold-revealed via observe->solve, not supplied by candidates.
  const yVector = Manifold.loop.solve(obs, intent);
  const yObserved = yVector[0] || 0;

  const coordinate = normalizeCoord(yObserved);
  const wavelength = 380 + coordinate * 370; // nm in visible-ish range
  const frequency = 299792458 / (wavelength * 1e-9); // Hz
  const rgb = rgbFromCoord(coordinate);
  const html = htmlFromRgb(rgb);

  return {
    x: xSeed,
    yObserved,
    color: {
      coordinate,
      html,
      rgb,
      wavelength,
      frequency,
    },
    obs,
  };
}

test('color lens uses manifold observation to derive y', () => {
  const xSeed = [0.42, -1.25, 0.77];
  const out = observeColorLens(xSeed);

  const yFromSolve = Manifold.loop.solve(out.obs, [1, 1, 1, 1])[0];
  assert.ok(approxEq(out.yObserved, yFromSolve), 'y must come from manifold solve() result');

  // Prove y is sensitive to observed manifold gradient/value.
  const warpedObs = {
    ...out.obs,
    grad: {
      x: out.obs.grad.x + 0.5,
      y: out.obs.grad.y,
      z: out.obs.grad.z,
    },
  };
  const yWarped = Manifold.loop.solve(warpedObs, [1, 1, 1, 1])[0];
  assert.ok(!approxEq(out.yObserved, yWarped), 'changing observed field should change y');
});

test('color object fields are all derived from observed coordinate', () => {
  const out = observeColorLens([1.1, 0.2, -0.6]);
  const c = out.color.coordinate;

  assert.ok(c >= 0 && c <= 1, 'coordinate should be normalized to [0,1]');
  assert.ok(out.color.wavelength >= 380 && out.color.wavelength <= 750,
    'wavelength should map to visible range bounds');

  const expectedRgb = rgbFromCoord(c);
  assert.deepEqual(out.color.rgb, expectedRgb, 'rgb must be derived from coordinate');
  assert.equal(out.color.html, htmlFromRgb(expectedRgb), 'html must be derived from rgb');

  const expectedFrequency = 299792458 / (out.color.wavelength * 1e-9);
  assert.ok(approxEq(out.color.frequency, expectedFrequency, 1e-3),
    'frequency must be derived from wavelength');
});

test('candidate attributes do not override manifold-observed y', () => {
  const xSeed = [0.3, 0.8, -0.2];

  const baseline = observeColorLens(xSeed);
  const withCandidates = observeColorLens(xSeed, {
    candidates: {
      coordinate: 0.99,
      html: '#ffffff',
      rgb: { r: 255, g: 255, b: 255 },
      wavelength: 700,
      frequency: 4.3e14,
      y: 12345,
    },
  });

  // Function intentionally ignores candidates for y selection.
  assert.ok(approxEq(withCandidates.yObserved, baseline.yObserved),
    'y should be manifold-observed, not candidate-driven');
  assert.ok(approxEq(withCandidates.color.coordinate, baseline.color.coordinate),
    'coordinate should stay tied to observed y');
});

test('pixel lens: x is pixel identity and y is observed pixel coordinate/color attributes', () => {
  const xSeed = [0.25, -0.8, 1.3];
  const observed = observeColorLens(xSeed);
  const { run } = loadInBrowserContext('js/manifold_bridge.js');

  run(`globalThis.__pixel = globalThis.ManifoldBridge.composePixelLens({
      pixel: { id: 'px-42', index: 42 },
      yObserved: ${observed.yObserved}
    });`);

  const pixel = run('globalThis.__pixel');
  assert.equal(pixel.type, 'pixel');
  assert.equal(pixel.x.ref.id, 'px-42', 'x should preserve pixel identity');

  const expectedCoord = normalizeCoord(observed.yObserved);
  assert.ok(approxEq(pixel.pixel.coordinate, expectedCoord),
    'pixel.coordinate should be derived from manifold-observed y');
  assert.ok(Array.isArray(pixel.y) && pixel.y.length >= 4,
    'y should include pixel coordinate and shader-related attributes');

  const yIds = pixel.y.map((m) => m.id);
  assert.ok(yIds.includes('pixel.coordinate'));
  assert.ok(yIds.includes('pixel.alpha'));
  assert.ok(yIds.includes('pixel.intensity'));
  assert.ok(yIds.includes('pixel.brightness'));
});

test('pixel lens: shader and color fields are derived from observed coordinate', () => {
  const { run } = loadInBrowserContext('js/manifold_bridge.js');
  run(`globalThis.__pixelB = globalThis.ManifoldBridge.composePixelLens({
      pixel: { id: 'px-7' },
      yObserved: 0.6,
      shader: { model: 'spectrum' }
    });`);

  const pixel = run('globalThis.__pixelB');
  const c = pixel.pixel.coordinate;
  const expectedRgb = rgbFromCoord(c);

  assert.equal(pixel.pixel.color.rgb.r, expectedRgb.r,
    'pixel rgb.r should come from observed coordinate');
  assert.equal(pixel.pixel.color.rgb.g, expectedRgb.g,
    'pixel rgb.g should come from observed coordinate');
  assert.equal(pixel.pixel.color.rgb.b, expectedRgb.b,
    'pixel rgb.b should come from observed coordinate');
  assert.equal(pixel.pixel.color.html, htmlFromRgb(expectedRgb),
    'pixel html should come from rgb derived from coordinate');
  assert.equal(pixel.pixel.shader.model, 'spectrum');
  assert.ok(pixel.pixel.alpha >= 0 && pixel.pixel.alpha <= 1);
  assert.ok(pixel.pixel.intensity >= 0 && pixel.pixel.intensity <= 1);
  assert.ok(pixel.pixel.brightness >= 0 && pixel.pixel.brightness <= 1);
});
