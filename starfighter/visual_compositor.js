/**
 * Visual Compositor — Procedural Colour, Material & Geometry Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Zero hardcoded colours, hex values, material properties, or particle configs.
 * All visual properties are manifold coordinates.
 *
 * Architecture:
 *   Game state → SpectrumManifold (visual lens) → visual substrate
 *   → { color, emissive, roughness, metalness, particles, geometry }
 *   → applied to Three.js materials, shaders, and DOM CSS
 *
 * Spectral principle:
 *   Colour IS frequency.  Every hue maps to a wavelength on the EM spectrum.
 *   Urgency shifts hue toward red (high frequency / hot end).
 *   Morale shifts brightness.
 *   Game phase shifts saturation.
 *   The Schwartz Diamond field value drives iridescence / shimmer.
 *
 * Building blocks:
 *   • Spectral sRGB lookup    (380–700 nm → r,g,b via SPECTRUM_RGB table)
 *   • Affective HSL           (emotional state → hue+saturation+lightness)
 *   • Colour harmony engine   (chord intervals → palette → CSS variables)
 *   • Material descriptor     (roughness, metalness, emissive from manifold)
 *   • Particle archetype      (count, speed, spread, drag from manifold)
 *   • Procedural geometry     (Schwartz Diamond surface → BufferGeometry)
 *   • CSS variable injection  (live update :root vars from game state)
 *   • GLB material override   (apply manifold colours to loaded models)
 *
 * Injection:
 *   VisualCompositor.update(snap)          — drive everything from game state
 *   VisualCompositor.getMaterial(snap)     — pull material descriptor
 *   VisualCompositor.getPalette(snap)      — pull full colour palette
 *   VisualCompositor.applyToMesh(mesh, snap) — live-update a Three.js mesh
 *   VisualCompositor.applyToDOM(snap)      — inject CSS variables into :root
 *   VisualCompositor.buildGeometry(snap, res) — generate Schwartz Diamond mesh
 *   VisualCompositor.getParticles(snap)    — pull particle config
 */

const VisualCompositor = (function () {
  'use strict';

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _c01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ── Material Descriptor ───────────────────────────────────────────────────
  //
  // A material descriptor is a plain object with all properties needed to
  // configure a Three.js MeshStandardMaterial (or PBR-compatible shader).
  // Every value is a manifold coordinate — no hex literals, no named colours.

  /**
   * Return a complete material descriptor from game state snapshot.
   * @param {object} snap — game state
   * @returns {object}
   */
  function getMaterial(snap) {
    const full = SpectrumManifold.fromGameState(snap);
    const lc = SpectrumManifold.LENSES.visual(full, snap);
    return SpectrumManifold.SUBSTRATES.visual(lc, snap);
  }

  /**
   * Return a material descriptor from explicit (x, y, z) manifold coords.
   */
  function getMaterialAt(x, y, z) {
    const lc = SpectrumManifold.coords(x, y, z || 0);
    return SpectrumManifold.SUBSTRATES.visual(lc, {});
  }

  // ── Colour Palette Engine ─────────────────────────────────────────────────
  //
  // A palette is a set of colours derived from a chord (interval set) rooted
  // at the spectral hue of the current urgency.
  // Just as music uses chord intervals to build harmony, colours use the same
  // intervals mapped to the colour wheel (1 semitone = 30° of hue).

  /**
   * Return a full palette descriptor from game state.
   * @param {object} snap
   * @returns {object} {
   *   primary, secondary, accent, background, foreground, alert,
   *   palette: string[],  // array of CSS hsl() strings
   *   css: {}             // ready to inject as CSS variables
   * }
   */
  function getPalette(snap) {
    const full = SpectrumManifold.fromGameState(snap);
    const lc = SpectrumManifold.LENSES.visual(full, snap);
    const mat = SpectrumManifold.SUBSTRATES.visual(lc, snap);
    const ui = SpectrumManifold.SUBSTRATES.ui(SpectrumManifold.LENSES.ui(full, snap), snap);

    // Root hue: urgency shifts toward red (hue 0), calm toward blue (hue 220)
    const rootHue = Math.round((1 - full.x) * 220);
    // Chord index from manifold r layer (urgency × severity)
    const chordIdx = SpectrumManifold._addrN(full.r, SpectrumManifold.CHORD_INTERVALS.length);
    const palette = SpectrumManifold.chordToPalette(rootHue, chordIdx / SpectrumManifold.CHORD_INTERVALS.length);

    const hslFn = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
    const bg = hslFn(rootHue, Math.round(20 + full.y * 20), Math.round(8 + (1 - full.x) * 12));
    const fg = hslFn(rootHue, 20, Math.round(70 + full.z * 20));

    return {
      primary: ui.primary,
      secondary: ui.secondary,
      accent: palette[0] || ui.primary,
      background: bg,
      foreground: fg,
      alert: ui.alert,
      palette,
      // Pre-built CSS variable map — inject into :root for instant theming
      css: {
        '--sf-primary': ui.primary,
        '--sf-secondary': ui.secondary,
        '--sf-accent': palette[0] || ui.primary,
        '--sf-bg': bg,
        '--sf-fg': fg,
        '--sf-alert': ui.alert,
        '--sf-emissive': mat.emissive.css,
        '--sf-intensity': String(mat.emissiveIntensity.toFixed(3)),
        '--sf-roughness': String(mat.roughness.toFixed(3)),
        '--sf-metalness': String(mat.metalness.toFixed(3)),
      },
    };
  }

  // ── CSS Variable Injection ────────────────────────────────────────────────

  let _cssRoot = null;
  let _cssSubId = null;
  let _lastCssVars = {};

  /**
   * Inject manifold-derived CSS variables into :root.
   * Idempotent — only updates changed variables.
   */
  function applyToDOM(snap) {
    if (!document || !document.documentElement) return;
    _cssRoot = _cssRoot || document.documentElement;
    const p = getPalette(snap);
    Object.entries(p.css).forEach(([k, v]) => {
      if (_lastCssVars[k] !== v) {
        _cssRoot.style.setProperty(k, v);
        _lastCssVars[k] = v;
      }
    });
  }

  /**
   * Subscribe to SpectrumManifold and auto-update CSS on state change.
   * @param {number} [throttleMs=250]
   */
  function startDOMReactive(throttleMs) {
    if (_cssSubId) return;
    _cssSubId = SpectrumManifold.subscribe('visual', (_mat, _lc, _full, snap) => {
      applyToDOM(snap);
    }, throttleMs || 250);
  }

  function stopDOMReactive() {
    if (_cssSubId) { SpectrumManifold.unsubscribe(_cssSubId); _cssSubId = null; }
  }

  // ── Three.js Material Application ────────────────────────────────────────
  //
  // Apply manifold-derived properties to an existing Three.js material.
  // Works with MeshStandardMaterial, MeshPhysicalMaterial, etc.
  // No colour literals — all values come from the descriptor.

  /**
   * Apply manifold material to a Three.js Mesh or Group.
   * @param {THREE.Mesh|THREE.Group} mesh
   * @param {object} snap
   * @param {object} [opts] { emissiveOnly: bool, skipRoughness: bool }
   */
  function applyToMesh(mesh, snap, opts) {
    if (!mesh || !window.THREE) return;
    const desc = getMaterial(snap);
    const color = new THREE.Color(desc.color);
    const emissive = new THREE.Color(desc.emissive.css);

    function _applyMat(mat) {
      if (!mat) return;
      if (mat.color && !opts?.emissiveOnly) mat.color.set(color);
      if (mat.emissive) mat.emissive.set(emissive);
      if (mat.emissiveIntensity != null) mat.emissiveIntensity = desc.emissiveIntensity;
      if (mat.roughness != null && !opts?.skipRoughness) mat.roughness = desc.roughness;
      if (mat.metalness != null && !opts?.skipRoughness) mat.metalness = desc.metalness;
      if (mat.opacity != null) { mat.opacity = desc.opacity; mat.transparent = desc.opacity < 1; }
      mat.needsUpdate = true;
    }

    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach(_applyMat);
      else _applyMat(mesh.material);
    }
    if (mesh.children) mesh.children.forEach(child => applyToMesh(child, snap, opts));
  }

  /**
   * Apply material only to materials whose name matches a pattern.
   * Useful for selectively colouring parts of a GLB model.
   * @param {THREE.Group} group
   * @param {RegExp} namePattern
   * @param {object} snap
   */
  function applyToMeshWhere(group, namePattern, snap) {
    if (!group || !window.THREE) return;
    group.traverse(obj => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(mat => {
        if (namePattern.test(mat.name || '')) applyToMesh(obj, snap, {});
      });
    });
  }

  // ── Procedural Geometry ───────────────────────────────────────────────────
  //
  // The Schwartz Diamond minimal surface is both a mathematical object and
  // a visual form.  At urgency=0 it is a smooth saddle; near urgency=1 it
  // approaches an 8-point zero-crossing lattice — naturally representing
  // combat tension as geometry.
  //
  // buildGeometry() returns a THREE.BufferGeometry without any imported model.

  /**
   * Build a Schwartz Diamond surface mesh.
   * @param {object} snap — game state (drives the surface shape)
   * @param {number} [res=24] — grid resolution (res × res vertices)
   * @returns {THREE.BufferGeometry|null}
   */
  function buildGeometry(snap, res) {
    if (!window.THREE) return null;
    const r = res || 24;
    const full = SpectrumManifold.fromGameState(snap);
    // Phase from time for animation
    const phase = (Date.now() % 12000) / 12000;
    const verts = SpectrumManifold.surfaceGrid(r, full.z * 0.3 + phase * 0.2);
    const positions = new Float32Array(verts.length);
    // Scale the surface by urgency
    const scale = 1.0 + full.x * 0.5;
    for (let i = 0; i < verts.length; i++) positions[i] = verts[i] * scale;

    // Build index buffer for a grid mesh (two triangles per quad)
    const indices = [];
    for (let row = 0; row < r - 1; row++) {
      for (let col = 0; col < r - 1; col++) {
        const a = row * r + col;
        const b = a + 1;
        const c = (row + 1) * r + col;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Animate a Schwartz Diamond geometry over time.
   * Call each frame.  Updates vertex positions directly.
   * @param {THREE.BufferGeometry} geo
   * @param {object} snap
   * @param {number} t — time in seconds
   */
  function animateGeometry(geo, snap, t) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    const pos = geo.attributes.position;
    const full = SpectrumManifold.fromGameState(snap);
    const res = Math.round(Math.sqrt(pos.count));
    for (let i = 0; i < pos.count; i++) {
      const u = (i % res) / (res - 1);
      const v = Math.floor(i / res) / (res - 1);
      const phase = full.z * 0.3 + (t * 0.1) % 1;
      const pt = SpectrumManifold.surfacePoint(u, v, phase);
      const scale = 1.0 + full.x * 0.5;
      pos.setXYZ(i, pt.x * scale, pt.y * scale, pt.z * scale);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // ── Particle Configuration ────────────────────────────────────────────────

  /**
   * Return a complete particle system configuration from game state.
   * @param {object} snap
   * @returns {object} particle config
   */
  function getParticles(snap) {
    const full = SpectrumManifold.fromGameState(snap);
    const lc = SpectrumManifold.LENSES.particles(full, snap);
    return SpectrumManifold.SUBSTRATES.particles(lc, snap);
  }

  /**
   * Return particle config for a specific event type.
   * Event types map to (x,y,z) coords — same table as SFXCompositor.
   * @param {string} eventType
   * @param {number} [intensity=0.7]
   * @returns {object}
   */
  function getParticlesForEvent(eventType, intensity) {
    // Use the same event coord table as SFXCompositor for cross-domain consistency
    const xy = (window.SFXCompositor && SFXCompositor.EVENT_COORDS[eventType]) || [0.5, 0.5];
    const i = intensity != null ? intensity : 0.7;
    const c = SpectrumManifold.coords(xy[0], xy[1] * i, i);
    const lc = SpectrumManifold.LENSES.particles(c, {});
    return SpectrumManifold.SUBSTRATES.particles(lc, {});
  }

  // ── Shader chunk generator ────────────────────────────────────────────────
  //
  // Generate GLSL uniform declarations and value objects from game state.
  // These can be injected into custom Three.js shaders or ShaderMaterial.

  /**
   * Return an object of Three.js-compatible uniforms derived from manifold.
   * @param {object} snap
   * @returns {object} { uColor, uEmissive, uUrgency, uSeverity, uPhase, ... }
   */
  function getUniforms(snap) {
    if (!window.THREE) return {};
    const full = SpectrumManifold.fromGameState(snap);
    const mat = getMaterial(snap);
    const [r, g, b] = mat.rgb;
    return {
      uColor: { value: new THREE.Color(r / 255, g / 255, b / 255) },
      uEmissive: { value: new THREE.Color(mat.emissive.css) },
      uUrgency: { value: full.x },
      uSeverity: { value: full.y },
      uPhase: { value: full.z },
      uRelation: { value: full.r },
      uForm: { value: full.f },
      uConsciousness: { value: full.m },
      uDiamond: { value: full.d },
      uRoughness: { value: mat.roughness },
      uMetalness: { value: mat.metalness },
      uEmissiveInt: { value: mat.emissiveIntensity },
      uTime: { value: 0 },  // caller should update each frame
    };
  }

  /**
   * Update time-dependent uniforms each frame.
   * @param {object} uniforms — from getUniforms()
   * @param {number} t — elapsed time in seconds
   * @param {object} [snap] — if provided, also refreshes state-dependent uniforms
   */
  function tickUniforms(uniforms, t, snap) {
    if (!uniforms) return;
    if (uniforms.uTime) uniforms.uTime.value = t;
    if (snap) {
      const full = SpectrumManifold.fromGameState(snap);
      if (uniforms.uUrgency) uniforms.uUrgency.value = full.x;
      if (uniforms.uSeverity) uniforms.uSeverity.value = full.y;
      if (uniforms.uPhase) uniforms.uPhase.value = full.z;
      if (uniforms.uDiamond) uniforms.uDiamond.value = full.d;
    }
  }

  // ── Spectrum visualiser (canvas-based, no external deps) ──────────────────
  //
  // Draws a live spectrum stripe onto a <canvas> element using manifold coords.
  // Useful for HUD energy bars, shields display, waveform indicators.

  /**
   * Draw a spectral bar / waveform visualisation onto a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {object} snap
   * @param {object} [opts] { style: 'bar'|'wave'|'ring', alpha: 0-1 }
   */
  function drawSpectrum(canvas, snap, opts) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const style = (opts && opts.style) || 'bar';
    const alpha = (opts && opts.alpha != null) ? opts.alpha : 1.0;
    const full = SpectrumManifold.fromGameState(snap);
    ctx.clearRect(0, 0, W, H);

    if (style === 'bar') {
      // Each column is a frequency band — colour from spectrum, height from Schwartz Diamond
      const cols = Math.min(W, 64);
      for (let i = 0; i < cols; i++) {
        const nx = i / cols;
        const c = SpectrumManifold.coords(nx, full.y, full.z);
        const bandH = H * (0.2 + Math.abs(c.d) * 0.6 + full.x * 0.2);
        const [r, g, b] = SpectrumManifold.spectrumRGB(nx);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(i * (W / cols), H - bandH, (W / cols) - 1, bandH);
      }
    } else if (style === 'wave') {
      ctx.beginPath();
      ctx.strokeStyle = SpectrumManifold.affectiveColor(full).css;
      ctx.lineWidth = 2;
      for (let i = 0; i <= W; i++) {
        const nx = i / W;
        const c = SpectrumManifold.coords(nx, full.y, full.z + nx * 2);
        const y = H / 2 + c.d * (H * 0.35 * (0.3 + full.x * 0.7));
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
      }
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (style === 'ring') {
      const cx = W / 2, cy = H / 2;
      const baseR = Math.min(W, H) * 0.35;
      ctx.beginPath();
      for (let i = 0; i <= 128; i++) {
        const angle = (i / 128) * Math.PI * 2;
        const nx = i / 128;
        const c = SpectrumManifold.coords(nx, full.y, full.z + nx);
        const r = baseR + c.d * baseR * 0.3 * (0.5 + full.x);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const color = SpectrumManifold.affectiveColor(full);
      ctx.strokeStyle = color.css;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ── Master update ─────────────────────────────────────────────────────────

  let _subId = null;

  /**
   * Drive visual updates from game state.
   * Applies to DOM immediately; Three.js meshes must be registered separately.
   */
  function update(snap) {
    applyToDOM(snap);
  }

  /**
   * Subscribe to SpectrumManifold and auto-update on state change.
   */
  function startReactive(throttleMs) {
    if (_subId) return;
    _subId = SpectrumManifold.subscribe('visual', (_mat, _lc, _full, snap) => {
      applyToDOM(snap);
    }, throttleMs || 100);
  }

  function stopReactive() {
    if (_subId) { SpectrumManifold.unsubscribe(_subId); _subId = null; }
  }

  return {
    // Material
    getMaterial,
    getMaterialAt,
    // Palette + CSS
    getPalette,
    applyToDOM,
    startDOMReactive,
    stopDOMReactive,
    // Three.js
    applyToMesh,
    applyToMeshWhere,
    buildGeometry,
    animateGeometry,
    getUniforms,
    tickUniforms,
    // Particles
    getParticles,
    getParticlesForEvent,
    // Canvas
    drawSpectrum,
    // Master
    update,
    startReactive,
    stopReactive,
  };
})();

window.VisualCompositor = VisualCompositor;
