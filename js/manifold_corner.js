/**
 * manifold_corner.js  —  Double Helix Banner
 *
 * Full-width strip below the nav bar.
 *
 * BACKDROP
 *   Every pixel is the manifold value at that coordinate.
 *   z = x·y  →  m = (xy)²
 *   Hue = (|m| mod 2π) · (360/2π)   — identical to manifold.js _color()
 *   Brightness spikes at level-set crossings → visible contour lines of z=xy
 *
 * ANIMATION
 *   Two z=xy saddle surfaces at 90° (Surface B: z=−xy), both rotating on X
 *   axis. The two sheets wind around each other: double helix.
 *   Every edge coloured by manifold value at that vertex — same formula.
 *
 * SOUND
 *   Cursor over canvas plays the harmonic frequency at that coordinate:
 *     freq = 220 · 2^( (|m| mod 2π) / 2π )
 *   One octave = one surface period (2π).
 *
 * All math mirrors manifold.js. No extra constants.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('manifold-corner');
  if (!canvas) return;

  const H            = 170;
  const SURF_PERIOD  = 2 * Math.PI;
  const BASE_FREQ    = 220;   // A3

  let W            = 1;
  let backdropDirty = true;
  const ctx = canvas.getContext('2d', { alpha: false });

  // ── Resize ────────────────────────────────────────────────────────
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = (canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth) || 1;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    backdropDirty = true;
  }
  resize();
  if (window.ResizeObserver && canvas.parentElement) {
    new ResizeObserver(resize).observe(canvas.parentElement);
  }
  window.addEventListener('resize', resize);

  // ── Coordinate mapping ────────────────────────────────────────────
  function pixToCoord(px, py) {
    return {
      u: (px / W  - 0.5) * (2 * Math.PI),
      v: (py / H  - 0.5) * Math.PI,
    };
  }

  function manifoldAt(u, v) {
    const z    = u * v;
    const m    = u * v * z;             // (uv)²
    const absm = Math.abs(m) % SURF_PERIOD;
    const hue  = absm * (360 / SURF_PERIOD);
    const freq = BASE_FREQ * Math.pow(2, absm / SURF_PERIOD);
    return { z, m, hue, freq };
  }

  // ── Backdrop — manifold contour field ─────────────────────────────
  const BW = 128, BH = 20;
  const backCanvas = document.createElement('canvas');
  backCanvas.width = BW; backCanvas.height = BH;
  const backCtx = backCanvas.getContext('2d');
  const backImg = new ImageData(BW, BH);
  const bd = backImg.data;

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q-p)*6*t;
    if (t < 0.5) return q;
    if (t < 2/3) return p + (q-p)*(2/3-t)*6;
    return p;
  }
  function hslRgb(h01, s, l) {
    const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
    return [
      hue2rgb(p,q,h01+1/3)*255|0,
      hue2rgb(p,q,h01    )*255|0,
      hue2rgb(p,q,h01-1/3)*255|0,
    ];
  }

  function buildBackdrop() {
    for (let py = 0; py < BH; py++) {
      for (let px = 0; px < BW; px++) {
        const { u, v }   = pixToCoord((px/BW)*W, (py/BH)*H);
        const { m, hue } = manifoldAt(u, v);
        const phase   = (Math.abs(m) % SURF_PERIOD) / SURF_PERIOD;  // 0..1
        // Contour lines: bright spike where phase ≈ 0 (level-set boundary)
        const edge    = Math.min(phase, 1 - phase);
        const contour = Math.exp(-edge * edge * 320);
        const bright  = 0.025 + 0.24 * contour;
        const [r,g,b] = hslRgb(hue/360, 1.0, bright);
        const i = (py*BW+px)*4;
        bd[i]=r; bd[i+1]=g; bd[i+2]=b; bd[i+3]=255;
      }
    }
    backCtx.putImageData(backImg, 0, 0);
  }

  // ── Double helix wireframe ─────────────────────────────────────────
  const STEPS = 30, ROWS = STEPS+1, RANGE = 2.4;
  const gridA = Array.from({length:ROWS}, ()=>new Array(ROWS));
  const gridB = Array.from({length:ROWS}, ()=>new Array(ROWS));

  function buildGrids(ang) {
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const step = (2*RANGE)/STEPS;
    const CX = W/2, CY = H/2;
    const SX = W/(RANGE*4.4), SY = H/(RANGE*2.8);

    for (let i = 0; i < ROWS; i++) {
      const x = -RANGE + step*i;
      for (let j = 0; j < ROWS; j++) {
        const y = -RANGE + step*j;

        // Surface A: z = x·y
        const zA = x*y;
        gridA[i][j] = {
          sx: CX + x*SX,
          sy: CY - (y*cosA - zA*sinA)*SY,
          rz: y*sinA + zA*cosA,
          ox:x, oy:y, oz:zA,
        };

        // Surface B: 90° pre-rotation around Z: (x,y)→(−y,x) → z=−xy
        const xB=-y, yB=x, zB=xB*yB;
        gridB[i][j] = {
          sx: CX + xB*SX,
          sy: CY - (yB*cosA - zB*sinA)*SY,
          rz: yB*sinA + zB*cosA,
          ox:xB, oy:yB, oz:zB,
        };
      }
    }
  }

  function wireHue(x,y,z) {
    return (Math.abs(x*y*z) % SURF_PERIOD) * (360/SURF_PERIOD);
  }

  function drawSurface(grid, alphaBase) {
    ctx.lineWidth = 0.75;
    const DR = RANGE*RANGE*2;
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < STEPS; j++) {
        const a=grid[i][j], b=grid[i][j+1];
        const d=(a.rz+b.rz)*0.5;
        const al = alphaBase*(0.28+0.68*Math.max(0,(d+DR)/(DR*2)));
        ctx.strokeStyle=`hsla(${wireHue(a.ox,a.oy,a.oz)|0},100%,65%,${al.toFixed(2)})`;
        ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.stroke();
      }
    }
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < STEPS; i++) {
        const a=grid[i][j], b=grid[i+1][j];
        const d=(a.rz+b.rz)*0.5;
        const al = alphaBase*(0.28+0.68*Math.max(0,(d+DR)/(DR*2)));
        ctx.strokeStyle=`hsla(${wireHue(a.ox,a.oy,a.oz)|0},100%,65%,${al.toFixed(2)})`;
        ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.stroke();
      }
    }
  }

  // ── Web Audio ─────────────────────────────────────────────────────
  let audioCtx=null, curGain=null, lastFreq=0;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if (audioCtx.state==='suspended') audioCtx.resume();
  }

  function playTone(freq) {
    ensureAudio();
    if (Math.abs(freq-lastFreq)<0.5) return;
    lastFreq=freq;
    if (curGain) curGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.025);
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.type='sine';
    osc.frequency.value=freq;
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.setTargetAtTime(0.07, audioCtx.currentTime, 0.018);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    curGain=gain;
  }

  function stopTone() {
    if (!curGain) return;
    curGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.035);
    curGain=null; lastFreq=0;
  }

  // ── Cursor ────────────────────────────────────────────────────────
  let cursor=null;

  canvas.addEventListener('mousemove', e => {
    const r=canvas.getBoundingClientRect();
    const px=(e.clientX-r.left)*(W/r.width);
    const py=(e.clientY-r.top )*(H/r.height);
    const {u,v}=pixToCoord(px,py);
    const {z,hue,freq}=manifoldAt(u,v);
    cursor={px,py,u,v,z,hue,freq};
    playTone(freq);
  });
  canvas.addEventListener('mouseleave', ()=>{ cursor=null; stopTone(); });

  function drawCursor() {
    if (!cursor) return;
    const {px,py,u,v,z,hue,freq}=cursor;
    ctx.strokeStyle=`hsl(${hue|0},100%,72%)`;
    ctx.lineWidth=1.5;
    const R=10;
    ctx.beginPath(); ctx.arc(px,py,R,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px-R-5,py); ctx.lineTo(px+R+5,py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px,py-R-5); ctx.lineTo(px,py+R+5); ctx.stroke();

    const label=`x=${u.toFixed(2)}  y=${v.toFixed(2)}  z=${z.toFixed(3)}  \u266A ${freq.toFixed(1)} Hz`;
    ctx.font='bold 10px "Courier New",monospace';
    const tw=ctx.measureText(label).width;
    let lx=px+16; if(lx+tw+10>W) lx=px-tw-20;
    const ly=Math.max(16,Math.min(py-8,H-10));
    ctx.fillStyle='rgba(2,2,14,0.82)';
    ctx.fillRect(lx-4,ly-13,tw+8,17);
    ctx.fillStyle=`hsl(${hue|0},100%,74%)`;
    ctx.fillText(label,lx,ly);
  }

  function drawLabels() {
    ctx.textAlign='left';
    ctx.font='bold 11px "Courier New",monospace';
    ctx.fillStyle='rgba(2,2,14,0.7)';
    ctx.fillText('z\u2009=\u2009x\u00B7y  [\u00D7\u00B2 \u22A5 90\u00B0]',10,H-7);
    ctx.fillStyle='rgba(255,232,0,0.92)';
    ctx.fillText('z\u2009=\u2009x\u00B7y  [\u00D7\u00B2 \u22A5 90\u00B0]',9,H-8);
    ctx.textAlign='right';
    ctx.font='bold 9px "Courier New",monospace';
    ctx.fillStyle='rgba(0,255,65,0.85)';
    ctx.fillText('\u25CF DOUBLE HELIX  \u2014  MOVE CURSOR FOR HARMONIC TONE',W-8,H-8);
  }

  // ── Loop ──────────────────────────────────────────────────────────
  let angle=0, last=0;

  function frame(ts) {
    const dt=Math.min((ts-last)/1000,0.05);
    last=ts; angle+=dt*0.44;

    if (backdropDirty) { buildBackdrop(); backdropDirty=false; }
    ctx.drawImage(backCanvas,0,0,W,H);

    ctx.fillStyle='rgba(2,4,16,0.52)';
    ctx.fillRect(0,0,W,H);

    buildGrids(angle);
    drawSurface(gridA, 0.95);
    drawSurface(gridB, 0.72);

    drawLabels();
    drawCursor();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(ts=>{ last=ts; requestAnimationFrame(frame); });
})();
