/**
 * manifold_corner.js
 *
 * Upper-left corner widget:  z = x · y  surface rotating on Y axis
 * Backdrop:  real-time pixel heatmap of the same z = x · y field
 *            — the backdrop IS the manifold that generates the geometry
 *
 * Math mirrors manifold.js:
 *   SURFACE_PERIOD = 2π   (natural period of gyroid / Schwartz Diamond)
 *   hue = (|m| mod 2π) × (360 / 2π)   where m = x · y · z
 *   Y-axis rotation: x' = x·cosθ − z·sinθ,  z' = x·sinθ + z·cosθ,  y' = y
 */
(function () {
  'use strict';

  // ── Canvas setup ─────────────────────────────────────────────────
  const canvas = document.getElementById('manifold-corner');
  if (!canvas) return;

  const W = 230, H = 230;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  const CX = W / 2;
  const CY = H / 2 + 14;   // shift centroid slightly down for label room above
  const SCALE = 54;
  const STEPS = 26;         // grid lines in each direction
  const RANGE = 1.55;       // coordinate domain  [−RANGE, RANGE]
  const SURF_PERIOD = 2 * Math.PI;

  // ── Offscreen low-res backdrop ────────────────────────────────────
  // 64×64 pixels, bilinear-scaled up to W×H — fast and smooth
  const BR = 64;
  const backCanvas = document.createElement('canvas');
  backCanvas.width = BR;
  backCanvas.height = BR;
  const backCtx = backCanvas.getContext('2d');
  const backImg = new ImageData(BR, BR);
  const backD = backImg.data;

  // Fast HSL→RGB (no division-heavy paths)
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function hslRgb(h01, s, l) {          // h01 in [0,1]
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      hue2rgb(p, q, h01 + 1 / 3) * 255 | 0,
      hue2rgb(p, q, h01) * 255 | 0,
      hue2rgb(p, q, h01 - 1 / 3) * 255 | 0,
    ];
  }

  // Backdrop: each pixel is the manifold value z = u·v evaluated at (u,v)
  // The rotation angle ang flows through so the field ripples in sync with
  // the wireframe — the background IS the function driving the animation.
  function updateBackdrop(ang) {
    const span = RANGE * 2.5;
    const invBR = 1 / (BR - 1);
    for (let py = 0; py < BR; py++) {
      for (let px = 0; px < BR; px++) {
        const u = (px * invBR - 0.5) * span;
        const v = (py * invBR - 0.5) * span;
        const z = u * v;                          // z = xy

        // Rotate z around Y by current angle — same transform as the wireframe
        const zr = u * Math.sin(ang) + z * Math.cos(ang);

        // Manifold value m = x·y·z; hue = (|m| mod 2π)·(360/2π)
        const m = Math.abs(u * v * zr);
        const h01 = (m % SURF_PERIOD) / SURF_PERIOD;  // [0,1]

        // Low brightness so wireframe is legible on top
        const bright = 0.06 + 0.13 * Math.abs(Math.sin(zr + ang * 0.7));

        const [r, g, b] = hslRgb(h01, 1.0, bright);
        const i = (py * BR + px) * 4;
        backD[i] = r;
        backD[i + 1] = g;
        backD[i + 2] = b;
        backD[i + 3] = 255;
      }
    }
    backCtx.putImageData(backImg, 0, 0);
    ctx.drawImage(backCanvas, 0, 0, W, H);   // smooth bilinear upscale
  }

  // ── 3D grid: z = x·y, rotated on Y axis ──────────────────────────
  // Pre-allocate grid array — avoids GC pressure per frame
  const ROWS = STEPS + 1;
  const grid = Array.from({ length: ROWS }, () => new Array(ROWS));

  function buildGrid(ang) {
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const step = (2 * RANGE) / STEPS;
    for (let i = 0; i < ROWS; i++) {
      const x = -RANGE + step * i;
      for (let j = 0; j < ROWS; j++) {
        const y = -RANGE + step * j;
        const z = x * y;                     // z = xy — the manifold primitive
        grid[i][j] = {
          rx: x * cosA - z * sinA,            // Y-axis rotation
          ry: y,                              // Y unchanged
          rz: x * sinA + z * cosA,
          x, y, z
        };
      }
    }
  }

  // Hue from the same formula as manifold.js _color()
  function wireHue(x, y, z) {
    return (Math.abs(x * y * z) % SURF_PERIOD) * (360 / SURF_PERIOD);
  }

  function drawWire(ang) {
    // Depth range for alpha mapping: rz ∈ [−RANGE²,  RANGE²] roughly
    const depthRange = RANGE * RANGE * 2;
    ctx.lineWidth = 0.65;

    // Row lines (vary across j)
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < STEPS; j++) {
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const depth = (a.rz + b.rz) * 0.5;
        const alpha = 0.35 + 0.58 * Math.max(0, (depth + depthRange) / (depthRange * 2));
        ctx.strokeStyle = `hsla(${wireHue(a.x, a.y, a.z).toFixed(0)},100%,62%,${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(CX + a.rx * SCALE, CY - a.ry * SCALE);
        ctx.lineTo(CX + b.rx * SCALE, CY - b.ry * SCALE);
        ctx.stroke();
      }
    }

    // Column lines (vary across i)
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < STEPS; i++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const depth = (a.rz + b.rz) * 0.5;
        const alpha = 0.35 + 0.58 * Math.max(0, (depth + depthRange) / (depthRange * 2));
        ctx.strokeStyle = `hsla(${wireHue(a.x, a.y, a.z).toFixed(0)},100%,62%,${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(CX + a.rx * SCALE, CY - a.ry * SCALE);
        ctx.lineTo(CX + b.rx * SCALE, CY - b.ry * SCALE);
        ctx.stroke();
      }
    }
  }

  // ── Animation loop ────────────────────────────────────────────────
  let angle = 0;
  let last = 0;

  function frame(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    angle += dt * 0.52;   // ~0.52 rad/s — one full rotation ≈ 12 s

    // 1 — Backdrop heatmap (manifold field, live)
    updateBackdrop(angle);

    // 2 — Dark overlay so the wireframe reads against the heatmap
    ctx.fillStyle = 'rgba(2,2,14,0.42)';
    ctx.fillRect(0, 0, W, H);

    // 3 — Wireframe surface
    buildGrid(angle);
    drawWire(angle);

    // 4 — Equation label  "z = x · y"
    ctx.textAlign = 'center';
    ctx.font = '700 11px "Courier New",monospace';
    ctx.fillStyle = 'rgba(2,2,16,0.7)';
    ctx.fillText('z\u2009=\u2009x\u00B7y', CX + 1, 15);   // shadow
    ctx.fillStyle = 'rgba(255,232,0,0.96)';
    ctx.fillText('z\u2009=\u2009x\u00B7y', CX, 14);

    // 5 — Live badge
    ctx.font = '700 8px "Courier New",monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,255,65,0.88)';
    ctx.fillText('\u25CF LIVE', W - 5, 14);

    // 6 — Subtle cyan rim glow
    const rim = ctx.createRadialGradient(CX, CY, W * 0.25, CX, CY, W * 0.72);
    rim.addColorStop(0, 'transparent');
    rim.addColorStop(1, 'rgba(0,255,255,0.09)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(frame);
  }

  // Kick off after first paint
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(frame); });
})();
