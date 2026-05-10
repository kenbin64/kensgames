/**
 * ═══════════════════════════════════════════════════════════════════
 * 🜂 FASTTRACK X-CODE HUD
 *
 * Additive 2D overlay above the Three.js scene. Manifold-derived,
 * never stored: each frame we read the canonical state (validMoves,
 * pending entry, peg/hole world positions), project to screen, and
 * paint additive blooms. The 3D scene stays canonical; this layer
 * adds the manifold flavour.
 *
 * Three feature families:
 *   destination-flares : radial bloom on each landable hole
 *   pending-trail      : phi-spaced fluid bead-stream from peg → dest
 *                        for the currently staged confirm entry
 *   commit-burst       : transient ttl-bounded fluid path drawn on
 *                        commit ("x-code transition")
 *
 * Performance: half-resolution backing store + additive composite.
 * <2ms/frame target on a 1080p viewport.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STATE = {
    canvas: null,
    ctx: null,
    camera: null,
    rw: 0, rh: 0,        // backing store size
    vw: 0, vh: 0,        // viewport (CSS) size
    scale: 0.6,          // backing-store scale; CSS scales up
    holeReg: null,
    pegReg: null,
    activeColor: '#00c8ff',
    bursts: [],          // [{ holePath, rgb, t0, ttl }]
  };

  // ── helpers ──────────────────────────────────────────────────────
  function hexRgb(hex) {
    if (!hex) return '0,200,255';
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return '0,200,255';
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff}`;
  }

  function projectWorld(v3) {
    if (!STATE.camera || !window.THREE) return null;
    const p = new window.THREE.Vector3(v3.x, v3.y, v3.z);
    p.project(STATE.camera);
    if (p.z < -1 || p.z > 1) return null;
    return {
      sx: (p.x * 0.5 + 0.5) * STATE.rw,
      sy: (-p.y * 0.5 + 0.5) * STATE.rh,
    };
  }

  function holeScreen(holeId) {
    if (!STATE.holeReg) return null;
    const h = STATE.holeReg.get(holeId);
    if (!h || !h.mesh) return null;
    return projectWorld(h.mesh.getWorldPosition(new window.THREE.Vector3()));
  }

  // ── canvas lifecycle ─────────────────────────────────────────────
  function ensureCanvas() {
    if (STATE.canvas) return;
    const c = document.createElement('canvas');
    c.id = 'ft-xcode-hud';
    Object.assign(c.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '5',
      mixBlendMode: 'screen',
    });
    document.body.appendChild(c);
    STATE.canvas = c;
    STATE.ctx = c.getContext('2d');
  }

  function syncSize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === STATE.vw && h === STATE.vh) return;
    STATE.vw = w; STATE.vh = h;
    STATE.rw = Math.max(2, Math.floor(w * STATE.scale));
    STATE.rh = Math.max(2, Math.floor(h * STATE.scale));
    STATE.canvas.width = STATE.rw;
    STATE.canvas.height = STATE.rh;
  }

  // ── derive ───────────────────────────────────────────────────────
  function getCurrentPlayer() {
    const core = window.FastTrackCore;
    if (!core) return null;
    const players = core.state.players.get('list') || [];
    const ci = core.state.players.get('current') || 0;
    return players[ci] || null;
  }

  function deriveFlareTargets() {
    const core = window.FastTrackCore;
    if (!core) return [];
    const vm = core.state.turn.get('validMoves') || [];
    const seen = new Set();
    const out = [];
    for (const m of vm) {
      const targets = [];
      if (m.dest) targets.push(m.dest);
      if (m.dest2) targets.push(m.dest2);
      for (const id of targets) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const s = holeScreen(id);
        if (s) out.push(s);
      }
    }
    return out;
  }

  function derivePendingTrail() {
    const entry = window._ftPendingEntry;
    if (!entry) return null;
    const core = window.FastTrackCore;
    const me = getCurrentPlayer();
    if (!me) return null;
    let fromHoleId = null, destHoleId = null;
    const vm = core.state.turn.get('validMoves') || [];
    if (entry.kind === 'move' || entry.kind === 'split-second') {
      const mv = vm[entry.moveIdx];
      if (mv) {
        const peg = me.pegs[mv.pegIdx];
        fromHoleId = peg ? peg.holeId : null;
        destHoleId = mv.dest;
      }
    } else if (entry.kind === 'split-first') {
      const peg = me.pegs[entry.pegIdx];
      fromHoleId = peg ? peg.holeId : null;
      const mv = vm.find(m => m.type === 'split' && m.pegIdx === entry.pegIdx && m.steps === entry.steps);
      destHoleId = mv && mv.dest;
    } else if (entry.kind === 'split-first-peg') {
      const peg = me.pegs[entry.pegIdx];
      fromHoleId = peg ? peg.holeId : null;
    }
    if (!fromHoleId || !destHoleId) return null;
    const a = holeScreen(fromHoleId);
    const b = holeScreen(destHoleId);
    if (!a || !b) return null;
    return { from: a, to: b };
  }

  // ── paint ────────────────────────────────────────────────────────
  function paintFlares(ctx, targets, rgb) {
    if (!targets.length) return;
    const t = performance.now() * 0.0025;
    ctx.globalCompositeOperation = 'lighter';
    const baseR = Math.max(18, STATE.rw * 0.022);
    for (const s of targets) {
      const pulse = 0.78 + 0.22 * Math.sin(t * 1.6 + (s.sx + s.sy) * 0.01);
      const r = baseR * pulse;
      const g = ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, r);
      g.addColorStop(0, `rgba(${rgb},${0.55 * pulse})`);
      g.addColorStop(0.45, `rgba(${rgb},${0.22 * pulse})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paintPendingTrail(ctx, trail, rgb) {
    if (!trail) return;
    const PHI = 1.6180339887;
    const t = performance.now() * 0.001;
    const N = 18;
    const dx = trail.to.sx - trail.from.sx;
    const dy = trail.to.sy - trail.from.sy;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const baseR = Math.max(4, STATE.rw * 0.006);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const u = ((i / N) + (t * 0.18) + i * (1 / PHI / N)) % 1;
      const sx = trail.from.sx + u * dx;
      const sy = trail.from.sy + u * dy;
      const phase = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * PHI + t * 2);
      const a = 0.18 + 0.45 * phase * (1 - Math.abs(u - 0.5) * 1.2);
      const r = baseR * (0.7 + 0.6 * phase);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(0.5, `rgba(${rgb},${a * 0.45})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paintBursts(ctx) {
    if (!STATE.bursts.length) return;
    const now = performance.now();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = STATE.bursts.length - 1; i >= 0; i--) {
      const b = STATE.bursts[i];
      const age = (now - b.t0) / b.ttl;
      if (age >= 1) { STATE.bursts.splice(i, 1); continue; }
      const fade = 1 - age;
      const pts = b.holePath.map(holeScreen).filter(Boolean);
      if (pts.length < 2) continue;
      const segLens = [];
      let total = 0;
      for (let s = 0; s < pts.length - 1; s++) {
        const L = Math.hypot(pts[s + 1].sx - pts[s].sx, pts[s + 1].sy - pts[s].sy);
        segLens.push(L); total += L;
      }
      if (total < 4) continue;
      const N = 28;
      const baseR = Math.max(6, STATE.rw * 0.012) * fade + 4;
      for (let k = 0; k < N; k++) {
        const u = (k / N + age * 1.6) % 1;
        let target = u * total, accumulated = 0, seg = 0;
        while (seg < segLens.length - 1 && accumulated + segLens[seg] < target) {
          accumulated += segLens[seg]; seg++;
        }
        const segU = segLens[seg] > 0 ? (target - accumulated) / segLens[seg] : 0;
        const sx = pts[seg].sx + (pts[seg + 1].sx - pts[seg].sx) * segU;
        const sy = pts[seg].sy + (pts[seg + 1].sy - pts[seg].sy) * segU;
        const phase = 0.5 + 0.5 * Math.sin(k * 0.6 + age * 18);
        const a = (0.35 + 0.5 * phase) * fade;
        const r = baseR * (0.6 + 0.6 * phase);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(${b.rgb},${a})`);
        g.addColorStop(0.5, `rgba(${b.rgb},${a * 0.45})`);
        g.addColorStop(1, `rgba(${b.rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── render loop ──────────────────────────────────────────────────
  function loop() {
    syncSize();
    const ctx = STATE.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, STATE.rw, STATE.rh);

    // Lazy-resolve from globals exposed by fasttrack-3d.js
    if (!STATE.camera) {
      if (window.CameraDirector && window.CameraDirector._camera) STATE.camera = window.CameraDirector._camera;
      else if (window.ftCamera) STATE.camera = window.ftCamera;
    }
    if (!STATE.holeReg && window.holeRegistry) STATE.holeReg = window.holeRegistry;
    if (!STATE.pegReg && window.pegRegistry) STATE.pegReg = window.pegRegistry;

    if (STATE.camera && STATE.holeReg) {
      const me = getCurrentPlayer();
      STATE.activeColor = (me && me.color) || '#00c8ff';
      const rgb = hexRgb(STATE.activeColor);

      const flares = deriveFlareTargets();
      paintFlares(ctx, flares, rgb);

      const pending = derivePendingTrail();
      paintPendingTrail(ctx, pending, rgb);

      paintBursts(ctx);
    }

    requestAnimationFrame(loop);
  }

  // ── public hooks (called from fasttrack-3d.js) ────────────────────
  function emitCommitBurst(holePath /* [fromId, ...viaIds, toId] */) {
    if (!holePath || holePath.length < 2) return;
    const me = getCurrentPlayer();
    const rgb = hexRgb(me && me.color);
    STATE.bursts.push({ holePath: holePath.slice(), rgb, t0: performance.now(), ttl: 750 });
  }

  function setPendingEntry(entry) {
    window._ftPendingEntry = entry || null;
  }

  function init() {
    if (!window.THREE) {
      setTimeout(init, 200);
      return;
    }
    ensureCanvas();
    syncSize();
    requestAnimationFrame(loop);
  }

  window.FastTrackXcodeHUD = {
    init,
    emitCommitBurst,
    setPendingEntry,
    _state: STATE,
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 50);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  }
})();
