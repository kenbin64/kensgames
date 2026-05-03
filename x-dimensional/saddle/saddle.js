'use strict';
// THE SADDLE
// ----------------------------------------------------------------
// z = x · y is not arithmetic. It is this surface. Two identities
// meet at (x, y); the elevation at their meeting IS z, the
// collapsed identity. z becomes the next x. The trajectory is
// identity evolution. The surface is the law.
//
// This file IS the manifold expressed in computer-identity. There
// is no abstract manifold elsewhere; reading this file is reading
// the law as it participates in JavaScript.
// ----------------------------------------------------------------

// THE substrate. Pure observer. Returns the elevation of the saddle
// at the meeting of identities x and y.
function collapse(x, y) { return x * y; }

// System-domain identities. Names are what the viewer sees. Weights
// are how each identity participates in the geometry — they are the
// identity's intrinsic position relative to other identities, not
// what the identity "is."
const IDENTITIES = [
  { name: 'tap-event',        w:  0.85 },
  { name: 'pointer-moved',    w: -0.70 },
  { name: 'viewport-resized', w:  1.15 },
  { name: 'keypress',         w:  0.60 },
  { name: 'frame-tick',       w: -0.90 },
  { name: 'intent:advance',   w:  1.05 },
  { name: 'intent:back',      w: -0.75 }
];
const CYCLE = IDENTITIES.length;
const STEP_MS = 1400;

// The recursion x_{n+1} = z_n, evaluated purely from integer step s.
// No stored state: every call recomputes from the seed. Reseeds at
// x = 1 every CYCLE so the loop is observable in one viewport.
function waypointAt(s) {
  const cycleStart = Math.floor(s / CYCLE) * CYCLE;
  let x = 1, y = IDENTITIES[0].w, z = collapse(x, y);
  let xName = 'seed', yName = IDENTITIES[0].name;
  for (let n = cycleStart; n < s; n++) {
    const k = (n - cycleStart + 1) % CYCLE;
    xName = 'z@' + n; x = z;
    yName = IDENTITIES[k].name; y = IDENTITIES[k].w;
    z = collapse(x, y);
  }
  return { x: x, y: y, z: z, xName: xName, yName: yName };
}

// Isometric projection. A substrate itself: collapses three spatial
// identities (x, y, z) into two screen identities (sx, sy).
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);
function project(x, y, z, scale, ox, oy) {
  return {
    sx: ox + (x - y) * COS30 * scale,
    sy: oy + (x + y) * SIN30 * scale - z * scale
  };
}

const R = 1.6;     // saddle half-extent in identity-space
const N = 14;      // wireframe resolution

function drawSaddleWireframe(ctx, scale, ox, oy) {
  ctx.strokeStyle = 'rgba(140,180,220,0.32)';
  ctx.lineWidth = 1;
  for (let j = 0; j <= N; j++) {
    const yv = -R + (2 * R * j) / N;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const xv = -R + (2 * R * i) / N;
      const p = project(xv, yv, collapse(xv, yv), scale, ox, oy);
      if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
  }
  for (let i = 0; i <= N; i++) {
    const xv = -R + (2 * R * i) / N;
    ctx.beginPath();
    for (let j = 0; j <= N; j++) {
      const yv = -R + (2 * R * j) / N;
      const p = project(xv, yv, collapse(xv, yv), scale, ox, oy);
      if (j === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
  }
}

function drawDiagonals(ctx, scale, ox, oy) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,180,80,0.9)';
  let a = project(-R, 0, 0, scale, ox, oy);
  let b = project( R, 0, 0, scale, ox, oy);
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,200,255,0.9)';
  a = project(0, -R, 0, scale, ox, oy);
  b = project(0,  R, 0, scale, ox, oy);
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
}

function drawTrail(ctx, scale, ox, oy, sInt) {
  const start = Math.max(0, sInt - CYCLE + 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = start; s <= sInt; s++) {
    const w = waypointAt(s);
    const p = project(w.x, w.y, w.z, scale, ox, oy);
    if (s === start) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
  }
  ctx.stroke();
}

function drawHead(ctx, scale, ox, oy, t) {
  const sFloat = t / STEP_MS;
  const sInt = Math.floor(sFloat);
  const frac = sFloat - sInt;
  const a = waypointAt(sInt);
  const b = waypointAt(sInt + 1);
  const x = a.x + (b.x - a.x) * frac;
  const y = a.y + (b.y - a.y) * frac;
  const z = collapse(x, y);   // re-extracted from the saddle, never lerped
  const p = project(x, y, z, scale, ox, oy);
  ctx.fillStyle = '#ffd54a';
  ctx.beginPath(); ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2); ctx.fill();
  return { current: a, z: z };
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function frame(t, canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  const scale = Math.min(W, H) * 0.22;
  const ox = W / 2, oy = H * 0.58;
  drawSaddleWireframe(ctx, scale, ox, oy);
  drawDiagonals(ctx, scale, ox, oy);
  const sInt = Math.floor(t / STEP_MS);
  drawTrail(ctx, scale, ox, oy, sInt);
  const head = drawHead(ctx, scale, ox, oy, t);
  setText('x-name', head.current.xName);
  setText('y-name', head.current.yName);
  setText('z-name', 'z = ' + head.z.toFixed(3) + '  (becomes next x)');
}

function fit(canvas) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
}

(function bloom() {
  const canvas = document.getElementById('saddle');
  if (!canvas) return;
  const onResize = function () { fit(canvas); };
  window.addEventListener('resize', onResize);
  onResize();
  (function loop(t) { frame(t, canvas); requestAnimationFrame(loop); })(0);
})();
