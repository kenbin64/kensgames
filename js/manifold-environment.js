/*
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🜂 MANIFOLD ENVIRONMENT — PMREM lighting derived from the field
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Builds a tiny procedural cubemap whose six faces are sampled directly from
 * ManifoldField at six axial directions around a seed-derived origin. The
 * resulting equirect-equivalent goes through THREE.PMREMGenerator so any
 * MeshStandardMaterial in the scene picks it up via `scene.environment`.
 *
 * No HDR files. No textures on disk. Pure z = x*y projected onto reflection.
 *
 * Public:
 *   ManifoldEnvironment.bind(renderer, scene, opts)
 *     opts = { seed, intensity, palette: 'space'|'room'|'arena', size }
 *     returns the generated PMREM texture (already assigned to scene.environment)
 *
 *   ManifoldEnvironment.dispose() — frees the last PMREM target.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';
  if (typeof root.THREE === 'undefined') return;
  const THREE = root.THREE;
  const Field = root.ManifoldField;

  // Palette presets — each is a {sky, horizon, ground, accent} tuple in linear RGB.
  // The field value at the sampled direction biases between sky and ground;
  // the gradient magnitude blends in the accent so reflections shimmer where
  // the manifold curvature is highest.
  const PALETTES = {
    space:  { sky: [0.02, 0.04, 0.10], horizon: [0.08, 0.10, 0.22], ground: [0.01, 0.01, 0.03], accent: [0.55, 0.70, 1.00] },
    room:   { sky: [1.00, 0.92, 0.78], horizon: [0.45, 0.30, 0.18], ground: [0.05, 0.04, 0.03], accent: [1.00, 0.78, 0.45] },
    arena:  { sky: [0.20, 0.30, 0.45], horizon: [0.10, 0.15, 0.28], ground: [0.04, 0.06, 0.10], accent: [0.40, 0.95, 1.00] },
    void:   { sky: [0.00, 0.00, 0.00], horizon: [0.04, 0.04, 0.08], ground: [0.00, 0.00, 0.00], accent: [0.30, 0.50, 0.90] },
  };

  let _lastTarget = null;

  function _seedToVec(seed) {
    if (Field && typeof Field.seedToPoint === 'function') {
      const p = Field.seedToPoint(seed);
      return [p.x, p.y, p.z];
    }
    // Fallback if field not loaded — deterministic golden-ratio mix
    const s = Array.isArray(seed) ? seed : [seed];
    const PHI = (1 + Math.sqrt(5)) / 2;
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < s.length; i++) {
      const v = +s[i] || 0;
      a += v * Math.cos(i * PHI);
      b += v * Math.sin(i * PHI);
      c += v * Math.cos(i / PHI);
    }
    const TAU = Math.PI * 2;
    return [a % TAU, b % TAU, c % TAU];
  }

  function _fieldValue(x, y, z) {
    if (Field && typeof Field.value === 'function') return Field.value(x, y, z, 0.5);
    return Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
  }

  function _fieldGrad(x, y, z) {
    if (Field && typeof Field.grad === 'function') {
      const g = Field.grad(x, y, z, 0.5);
      return Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    }
    const e = 0.01;
    const dx = (_fieldValue(x + e, y, z) - _fieldValue(x - e, y, z)) / (2 * e);
    const dy = (_fieldValue(x, y + e, z) - _fieldValue(x, y - e, z)) / (2 * e);
    const dz = (_fieldValue(x, y, z + e) - _fieldValue(x, y, z - e)) / (2 * e);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Sample the field at direction (dx, dy, dz) offset from origin and turn
  // it into a linear-space color biased by the palette.
  function _sampleColor(origin, dir, dist, palette) {
    const x = origin[0] + dir[0] * dist;
    const y = origin[1] + dir[1] * dist;
    const z = origin[2] + dir[2] * dist;
    const v = _fieldValue(x, y, z);              // [-3, 3] roughly
    const g = _fieldGrad(x, y, z);               // gradient magnitude
    const t = (v + 3) / 6;                       // → [0, 1]
    const elev = (dir[1] + 1) * 0.5;             // up = 1, down = 0
    const skyMix = elev * 0.7 + t * 0.3;
    const r = palette.ground[0] * (1 - skyMix) + palette.sky[0] * skyMix + palette.accent[0] * g * 0.05;
    const gg = palette.ground[1] * (1 - skyMix) + palette.sky[1] * skyMix + palette.accent[1] * g * 0.05;
    const b = palette.ground[2] * (1 - skyMix) + palette.sky[2] * skyMix + palette.accent[2] * g * 0.05;
    // Horizon band — narrow near elev=0.5
    const horizonBand = Math.exp(-Math.pow((elev - 0.5) * 6, 2));
    return [
      r * (1 - horizonBand * 0.4) + palette.horizon[0] * horizonBand,
      gg * (1 - horizonBand * 0.4) + palette.horizon[1] * horizonBand,
      b * (1 - horizonBand * 0.4) + palette.horizon[2] * horizonBand,
    ];
  }

  // Build a single cubemap face (size×size) by sampling the field along the
  // outgoing direction for each pixel. Returns a DataTexture-ready Uint8 buffer.
  function _buildFace(origin, axis, palette, size) {
    const data = new Uint8Array(size * size * 4);
    let p = 0;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const u = (i + 0.5) / size * 2 - 1;
        const v = (j + 0.5) / size * 2 - 1;
        const dir = axis(u, v);
        const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
        const nd = [dir[0] / len, dir[1] / len, dir[2] / len];
        const c = _sampleColor(origin, nd, 1.5, palette);
        data[p++] = Math.max(0, Math.min(255, Math.round(Math.pow(c[0], 1 / 2.2) * 255)));
        data[p++] = Math.max(0, Math.min(255, Math.round(Math.pow(c[1], 1 / 2.2) * 255)));
        data[p++] = Math.max(0, Math.min(255, Math.round(Math.pow(c[2], 1 / 2.2) * 255)));
        data[p++] = 255;
      }
    }
    return data;
  }

  function bind(renderer, scene, opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : 'default';
    const palette = PALETTES[opts.palette] || PALETTES.room;
    const size = opts.size || 64;
    const intensity = opts.intensity != null ? opts.intensity : 1.0;
    const origin = _seedToVec(Array.isArray(seed) ? seed : [seed.toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0)]);

    // Six cubemap faces in THREE order: +X, -X, +Y, -Y, +Z, -Z
    const axes = [
      (u, v) => [ 1, -v, -u],
      (u, v) => [-1, -v,  u],
      (u, v) => [ u,  1,  v],
      (u, v) => [ u, -1, -v],
      (u, v) => [ u, -v,  1],
      (u, v) => [-u, -v, -1],
    ];
    const faces = axes.map(ax => {
      const data = _buildFace(origin, ax, palette, size);
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.needsUpdate = true;
      return tex.image;
    });
    const cube = new THREE.CubeTexture(faces);
    cube.format = THREE.RGBAFormat;
    cube.type = THREE.UnsignedByteType;
    cube.encoding = THREE.sRGBEncoding;
    cube.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();
    const target = pmrem.fromCubemap(cube);
    pmrem.dispose();
    cube.dispose();

    if (_lastTarget && _lastTarget.dispose) _lastTarget.dispose();
    _lastTarget = target;

    scene.environment = target.texture;
    if (intensity !== 1.0) scene.environmentIntensity = intensity; // r152+; harmless if ignored
    return target.texture;
  }

  function dispose() {
    if (_lastTarget && _lastTarget.dispose) _lastTarget.dispose();
    _lastTarget = null;
  }

  root.ManifoldEnvironment = { bind, dispose, PALETTES };
})(typeof window !== 'undefined' ? window : globalThis);
