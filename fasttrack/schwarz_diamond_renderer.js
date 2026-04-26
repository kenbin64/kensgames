/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 SCHWARZ DIAMOND RENDERER  v1.0
 * Manifold surface visualised inside the FastTrack 3D billiard room.
 *
 * Geometry:  Schwarz Diamond nodal approximation (auxiliary lens — see docs/SUBSTRATES.md)
 *   cos(x) + cos(y) + cos(z) = 0  (first-harmonic form)
 * Value:     z_manifold = u · v   (the sacred primitive)
 * Visual:    Ring of THREE.Points around the board.
 *            Height, colour and pulse amplitude are all z = x · y.
 *
 * Loads after ft3d:ready is dispatched by fasttrack-3d.js.
 * Adds geometry to window.FT3DScene (exposed by fasttrack-3d.js).
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const U = 48;              // angular samples (around the ring)
  const V = 12;              // radial-layer samples
  const RING_R = 325;      // just outside BOARD_RADIUS = 300
  const H_SCALE = 38;       // max diamond-surface height offset
  const TABLE_Y = 90;       // table height in world units

  let _cloud, _posArr, _colArr, _pd = [];
  let _tick = 0, _tension = 0;

  // ── Build particle cloud on Schwarz Diamond surface ───────────────
  function build(scene) {
    const N = U * V;
    _posArr = new Float32Array(N * 3);
    _colArr = new Float32Array(N * 3);

    let i = 0;
    for (let ui = 0; ui < U; ui++) {
      for (let vi = 0; vi < V; vi++) {
        const u = ui / U;          // ∈ [0, 1)
        const v = vi / V;          // ∈ [0, 1)
        const mz = u * v;           // z = x · y  ← THE PRIMITIVE

        // Schwarz Diamond: cos(u·2π) + cos(v·2π) + cos(z) = 0
        // Solve for z: cos(z) = -(cos(u·2π) + cos(v·2π)) / 2
        const cosZ = Math.max(-1, Math.min(1,
          -(Math.cos(u * Math.PI * 2) + Math.cos(v * Math.PI * 2)) * 0.5
        ));
        const dz = Math.acos(cosZ);   // ∈ [0, π]

        // World position: annular ring around board
        const theta = u * Math.PI * 2;
        const r = RING_R + vi * 7;
        const px = Math.cos(theta) * r;
        const pz = Math.sin(theta) * r;
        const py = (dz - Math.PI * 0.5) * H_SCALE * 0.5 + TABLE_Y;

        _posArr[i * 3] = px; _posArr[i * 3 + 1] = py; _posArr[i * 3 + 2] = pz;

        // Colour: cyan (mz≈0) → amber-gold (mz≈1)
        _colArr[i * 3] = mz;
        _colArr[i * 3 + 1] = 0.6 + mz * 0.3;
        _colArr[i * 3 + 2] = 1 - mz;

        _pd.push({ baseY: py, phase: u * Math.PI * 2 + v * 1.5, amp: H_SCALE * 0.12 * mz, mz, u });
        i++;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(_colArr, 3));

    _cloud = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.2, vertexColors: true,
      transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true, depthWrite: false,
    }));
    scene.add(_cloud);
    console.log(`🜂 Schwarz Diamond: ${N} surface pts | ring r=${RING_R} | z=u·v`);
  }

  // ── Per-frame animation — tension from ManifoldBus drives motion ──
  function tick() {
    if (!_cloud) return;
    _tick += 0.007;

    // Smooth-interpolate toward current manifold tension
    const t = window.FastTrackManifoldSubstrate?.cache?.tension ?? 0;
    _tension += (t - _tension) * 0.025;

    const pos = _cloud.geometry.attributes.position;
    const col = _cloud.geometry.attributes.color;

    for (let i = 0; i < _pd.length; i++) {
      const d = _pd[i];
      // Height: base + diamond wave + tension-amplified bob
      const bob = Math.sin(_tick + d.phase) * d.amp * (1 + _tension * 3.5);
      pos.array[i * 3 + 1] = d.baseY + bob;

      // Colour intensity driven by manifold z AND live tension
      const bright = 0.12 + _tension * 0.55 + Math.sin(_tick * 1.8 + d.phase) * 0.08;
      col.array[i * 3] = Math.min(1, d.mz * bright * 3.2);
      col.array[i * 3 + 1] = Math.min(1, (1 - d.mz) * bright * 2.2 + 0.12);
      col.array[i * 3 + 2] = Math.min(1, (1 - d.mz) * bright * 4);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;

    // Ring itself rotates — rate = z·y at camera angle ≈ tick · (0.5 + tension)
    _cloud.rotation.y = _tick * 0.04 * (0.5 + _tension);
  }

  // ── Pulse surface at a board position when a game event fires ────
  function pulseAt(boardPos, strength) {
    if (!_pd.length) return;
    const u0 = (boardPos || 0) / 90;
    _pd.forEach(d => {
      const dist = Math.min(Math.abs(d.u - u0), 1 - Math.abs(d.u - u0));
      if (dist < 0.14) {
        const prev = d.amp;
        d.amp = Math.min(H_SCALE * 0.55, d.amp + strength * H_SCALE * 0.38);
        setTimeout(() => { d.amp = prev; }, 700);
      }
    });
  }

  // ── Init: wait for 3D scene then hook into animation loop ─────────
  function init() {
    const scene = window.FT3DScene;
    if (!scene || typeof THREE === 'undefined') {
      console.warn('🜂 SchwartzDiamondRenderer: FT3DScene not ready'); return;
    }
    build(scene);

    // Hook into existing animation tick if exposed, else own RAF
    if (typeof window._ft3dAnimateTick === 'function') {
      const prev = window._ft3dAnimateTick;
      window._ft3dAnimateTick = () => { prev(); tick(); };
    } else {
      (function raf() { requestAnimationFrame(raf); tick(); })();
    }

    // Subscribe to ManifoldBus for game-driven pulses
    const bus = window.FastTrackManifoldSubstrate?.bus;
    if (bus) {
      bus.on('hop', d => pulseAt(d.boardPos, 0.28));
      bus.on('enter', d => pulseAt(d.boardPos, 0.50));
      bus.on('cut', d => pulseAt(d.boardPos, 0.90));
      bus.on('fasttrack', d => pulseAt(d.boardPos, 0.70));
      bus.on('safezone', d => pulseAt(d.boardPos, 0.55));
      bus.on('bullseye', _ => _pd.forEach(d => {
        // Full ring pulse on bullseye — all z=x·y points light up
        d.amp = H_SCALE * 0.55 * d.mz;
        setTimeout(() => { d.amp = H_SCALE * 0.12 * d.mz; }, 900);
      }));
    }
  }

  window.addEventListener('ft3d:ready', init);
  window.SchwartzDiamondRenderer = { tick, pulseAt };
})();
