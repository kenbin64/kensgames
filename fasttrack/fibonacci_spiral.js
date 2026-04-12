/**
 * ButterflyFX — Fibonacci Spiral Loading Canvas
 * ==============================================
 * Schwarz Diamond law: the part contains the whole.
 * Each of the 7 creation squares inherits the previous two plus itself.
 * At L7 (square = 21 units) the whole spiral collapses to a single seed point.
 * That point pulses once — then the game loads.
 *
 * Genesis 1 mapping:
 *   L1  1  SPARK      — "Let there be light"        (the first axis)
 *   L2  1  MIRROR     — "Divide light from dark"    (the paired axis)
 *   L3  2  RELATION   — "Gather the waters"         (z = x·y, the surface)
 *   L4  3  FORM       — "Land and plants"           (structure appears)
 *   L5  5  LIFE       — "Sun, moon, stars"          (systems activate)
 *   L6  8  MIND       — "Birds and fish"            (coherence, movement)
 *   L7 13  COMPLETION — "Land animals and man"      (21 units total → 1 seed)
 *   REST   VOID-SEED  — "He rested"                 (collapse → next turn)
 */

'use strict';

window.FibonacciSpiral = (() => {
    const PHI    = 1.618033988749895;
    const LAYERS = [
        { n: 1,  name: 'SPARK',      label: 'L1 · Light',         color: '#f8fafc' },
        { n: 1,  name: 'MIRROR',     label: 'L2 · Division',      color: '#bfdbfe' },
        { n: 2,  name: 'RELATION',   label: 'L3 · Surface z=x·y', color: '#a78bfa' },
        { n: 3,  name: 'FORM',       label: 'L4 · Form',          color: '#4ade80' },
        { n: 5,  name: 'LIFE',       label: 'L5 · Life',          color: '#fbbf24' },
        { n: 8,  name: 'MIND',       label: 'L6 · Mind',          color: '#f472b6' },
        { n: 13, name: 'COMPLETION', label: 'L7 · 21 → Seed',     color: '#818cf8' },
    ];

    let canvas, ctx, animId;
    let phase   = 'spiral';   // 'spiral' | 'collapse' | 'done'
    let tick    = 0;
    let onDone  = null;

    // ── Geometry: build Fibonacci squares in the canonical spiral layout ──────
    // Each square side = unit × fib[n].  We use a unit that fills the canvas.
    function buildSquares(W, H) {
        const unit = Math.min(W, H) / 22;   // 22 = 21 + 1 margin
        // Classic Fibonacci tiling: place squares in rotating directions
        const dirs  = [[1,0],[0,1],[-1,0],[0,-1]];   // right, down, left, up
        const squares = [];
        let cx = W / 2, cy = H / 2;
        let dx = 0, dy = 0;

        LAYERS.forEach((layer, i) => {
            const side = layer.n * unit;
            const dir  = dirs[i % 4];
            // Offset so each new square adjoins the previous
            const offsets = [
                [0,           -side],         // right
                [0,            0   ],         // down
                [-side,        0   ],         // left
                [-side,       -side],         // up
            ];
            const [ox, oy] = offsets[i % 4];
            squares.push({ x: cx + ox, y: cy + oy, side, ...layer });
            cx += dir[0] * side;
            cy += dir[1] * side;
        });
        return squares;
    }

    // ── Arc path for the golden spiral through each square ───────────────────
    function drawSpiral(squares, progress) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth   = 2;
        const total = squares.length;
        let drawn = 0;
        squares.forEach((sq, i) => {
            const frac = Math.min(1, Math.max(0, progress * total - i));
            if (frac <= 0) return;
            const startAngle = (i % 4) * (Math.PI / 2);
            const sweep      = frac * (Math.PI / 2);
            // Corner of arc depends on quadrant
            const corners = [
                [sq.x,           sq.y + sq.side],  // right → SW corner
                [sq.x,           sq.y           ],  // down  → NW corner
                [sq.x + sq.side, sq.y           ],  // left  → NE corner
                [sq.x + sq.side, sq.y + sq.side],   // up    → SE corner
            ];
            const [ax, ay] = corners[i % 4];
            if (drawn === 0) ctx.moveTo(ax + sq.side * Math.cos(startAngle),
                                        ay + sq.side * Math.sin(startAngle));
            ctx.arc(ax, ay, sq.side, startAngle, startAngle + sweep);
            drawn++;
        });
        ctx.stroke();
    }

    // ── Main render loop ──────────────────────────────────────────────────────
    function render(squares) {
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);

        const SPIRAL_TICKS   = 120;
        const COLLAPSE_TICKS = 60;
        const cx = W / 2, cy = H / 2;

        if (phase === 'spiral') {
            const progress = Math.min(tick / SPIRAL_TICKS, 1);
            // Draw squares fading in one by one
            squares.forEach((sq, i) => {
                const t = Math.min(1, Math.max(0, progress * squares.length - i));
                if (t <= 0) return;
                ctx.globalAlpha = t * 0.35;
                ctx.fillStyle   = sq.color;
                ctx.fillRect(sq.x, sq.y, sq.side, sq.side);
                ctx.globalAlpha = t;
                ctx.strokeStyle = sq.color;
                ctx.lineWidth   = 1;
                ctx.strokeRect(sq.x, sq.y, sq.side, sq.side);
                // Label
                if (t > 0.7) {
                    ctx.fillStyle   = sq.color;
                    ctx.font        = `${Math.max(9, sq.side * 0.18)}px monospace`;
                    ctx.textAlign   = 'center';
                    ctx.fillText(sq.label, sq.x + sq.side/2, sq.y + sq.side/2);
                }
            });
            ctx.globalAlpha = 1;
            drawSpiral(squares, progress);

            if (tick >= SPIRAL_TICKS + 20) { phase = 'collapse'; tick = 0; }
        }

        if (phase === 'collapse') {
            const t = tick / COLLAPSE_TICKS;
            // All squares scale toward center point
            squares.forEach(sq => {
                const scale  = 1 - t;
                const sx     = cx + (sq.x + sq.side/2 - cx) * scale - (sq.side * scale)/2;
                const sy     = cy + (sq.y + sq.side/2 - cy) * scale - (sq.side * scale)/2;
                ctx.globalAlpha = (1 - t) * 0.5;
                ctx.fillStyle   = sq.color;
                ctx.fillRect(sx, sy, sq.side * scale, sq.side * scale);
            });
            ctx.globalAlpha = 1;
            // The seed point emerges at center
            const r = t * 12;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.font = '13px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,' + t + ')';
            ctx.fillText('Day 7 · Void-Seed · Next turn begins', cx, cy + 28);

            if (tick >= COLLAPSE_TICKS) { phase = 'done'; }
        }

        if (phase === 'done') {
            cancelAnimationFrame(animId);
            setTimeout(() => {
                canvas.style.transition = 'opacity 0.6s';
                canvas.style.opacity    = '0';
                setTimeout(() => {
                    canvas.remove();
                    if (typeof onDone === 'function') onDone();
                }, 700);
            }, 400);
            return;
        }

        tick++;
        animId = requestAnimationFrame(() => render(squares));
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function boot(opts = {}) {
        onDone = opts.onDone || null;
        canvas = document.createElement('canvas');
        canvas.id = 'bfx-spiral';
        Object.assign(canvas.style, {
            position: 'fixed', inset: '0', zIndex: '9999',
            width: '100%', height: '100%', background: '#0f172a',
        });
        document.body.appendChild(canvas);
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx     = canvas.getContext('2d');
        phase   = 'spiral';
        tick    = 0;
        const squares = buildSquares(canvas.width, canvas.height);
        render(squares);
    }

    return { boot };
})();

