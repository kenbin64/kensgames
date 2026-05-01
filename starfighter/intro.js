// ═══════════════════════════════════════════════════════════════════════════
// STARFIGHTER · CINEMATIC PROLOGUE
// 85-second text-driven opening in the BSG / LOTR / Star Wars tradition.
// Self-contained: no GLB or THREE dependency. Plays once on first launch
// (localStorage flag), replayable via ?intro=1.  Skippable with any key.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const STORAGE_KEY = 'sfenhance.intro.seen.play.v2';
    const FORCE_URL = (() => {
        try { return new URLSearchParams(location.search).get('intro') === '1'; }
        catch (_) { return false; }
    })();

    // ── Timeline (seconds). Each beat is a single typographic moment.  ──
    // act 1 — the pressure;  act 2 — the cooperation;  act 3 — the betrayal;
    // act 4 — the charge;  title — smash-cut card and hand-off.
    const T = [
        { at: 2.0, dur: 6.5, line: 'Three thousand light-years from Earth, a dying empire crossed our sky.', motif: 'void', mood: 'drone' },
        { at: 10.0, dur: 6.5, line: 'Their bioships fail without one catalyst: enzymes from Earth\'s bees.', motif: 'earth', mood: 'drone' },
        { at: 18.0, dur: 6.5, line: 'So we forged Aurora Prime together: one fortress-city, twenty-one thousand souls.', motif: 'baseship', mood: 'rise' },
        { at: 26.0, dur: 6.5, line: 'Humans kept the hives alive. Zorgon engineers kept the stations breathing.', motif: 'baseship', mood: 'rise' },
        { at: 34.0, dur: 5.5, line: 'For one generation, it was peace.', motif: 'baseship', mood: 'hold' },
        { at: 41.0, dur: 1.5, line: '', motif: 'void', mood: 'shift' },
        { at: 43.0, dur: 6.5, line: 'Then Earth\'s hives collapsed. The Hive Fleet turned toward Aurora.', motif: 'hive', mood: 'menace' },
        { at: 51.0, dur: 6.5, line: 'A new queen leads them now, and her warrior caste does not negotiate.', motif: 'hive', mood: 'menace' },
        { at: 58.5, dur: 6.5, line: 'They will not burn Aurora. They need it intact, with our people trapped inside.', motif: 'hiveReveal', mood: 'menace' },
        { at: 66.0, dur: 6.0, line: 'You fly for the Resolute. You fly for Aurora.', motif: 'cockpit', mood: 'charge' },
        { at: 72.5, dur: 5.0, line: 'Learn fast. Earn stronger weapons. The war begins with your first launch.', motif: 'cockpit', mood: 'charge' },
        { at: 78.0, dur: 7.5, line: 'The alien mothership is here. The Hive Queen is aboard.', motif: 'hiveReveal', mood: 'reveal' },
        { at: 86.0, dur: 7.0, line: 'If we fail, humanity becomes the labor force of their living hive.', motif: 'hiveReveal', mood: 'reveal' },
        { at: 93.5, dur: 1.2, line: '', motif: 'black', mood: 'hold' },
        { at: 95.0, dur: 5.0, line: '', motif: 'title', mood: 'swell' }
    ];
    const TOTAL = 101.0;

    // ── Public API ────────────────────────────────────────────────────────
    function hasSeen() { try { return !!localStorage.getItem(STORAGE_KEY); } catch (_) { return false; } }
    function markSeen() { try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) { /* ignore */ } }
    function shouldAutoplay() { return FORCE_URL || (isPlayPage() && !hasSeen()); }

    // ── Font loader (Cinzel: Trajan-like high-prestige serif) ─────────────
    function ensureFonts() {
        if (document.getElementById('sf-intro-fonts')) return;
        const l = document.createElement('link');
        l.id = 'sf-intro-fonts';
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;800&display=swap';
        document.head.appendChild(l);
    }

    // ── Overlay DOM (fullscreen, above everything) ────────────────────────
    function buildOverlay() {
        const root = document.createElement('div');
        root.id = 'sf-intro-root';
        root.innerHTML = [
            '<canvas id="sf-intro-stars"></canvas>',
            '<canvas id="sf-intro-motif"></canvas>',
            '<canvas id="sf-intro-3d"></canvas>',
            '<div id="sf-intro-vignette"></div>',
            '<div id="sf-intro-bar-top"></div>',
            '<div id="sf-intro-bar-bot"></div>',
            '<div id="sf-intro-text"><span></span></div>',
            '<div id="sf-intro-title"><div class="t">STARFIGHTER</div><div class="s">HOLD THE LINE</div></div>',
            '<button id="sf-intro-skip" type="button">SKIP INTO GAME &nbsp;\u203A</button>',
            '<div id="sf-intro-hint">press any key to skip</div>'
        ].join('');
        const s = document.createElement('style');
        s.textContent = STYLE;
        document.head.appendChild(s);
        document.body.appendChild(root);
        return root;
    }

    const STYLE = [
        '#sf-intro-root{position:fixed;inset:0;z-index:100000;background:#000;overflow:hidden;color:#e8e6df;font-family:"Cinzel",Georgia,serif;cursor:default;-webkit-user-select:none;user-select:none}',
        '#sf-intro-stars{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1}',
        '#sf-intro-motif{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2}',
        '#sf-intro-3d{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:3;opacity:0;transition:opacity 1.4s ease}',
        '#sf-intro-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.55) 78%, #000 100%);z-index:4}',
        '#sf-intro-bar-top,#sf-intro-bar-bot{position:absolute;left:0;right:0;height:0;background:#000;transition:height 1.4s cubic-bezier(.6,.0,.2,1);z-index:5}',
        '#sf-intro-bar-top{top:0}#sf-intro-bar-bot{bottom:0}',
        '#sf-intro-root.lb #sf-intro-bar-top,#sf-intro-root.lb #sf-intro-bar-bot{height:11vh}',
        '#sf-intro-text{position:absolute;left:8vw;right:8vw;top:50%;transform:translateY(-50%);text-align:center;font-size:clamp(18px,2.4vw,30px);font-weight:400;letter-spacing:0.06em;line-height:1.55;text-shadow:0 0 22px rgba(0,0,0,0.85),0 2px 6px rgba(0,0,0,0.9);opacity:0;transition:opacity 1.4s ease;z-index:6}',
        '#sf-intro-text.on{opacity:1}',
        '#sf-intro-text span{display:inline-block;border-bottom:0}',
        '#sf-intro-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transform:scale(0.94);transition:opacity 0.6s ease,transform 1.6s cubic-bezier(.2,.6,.2,1);z-index:7;text-align:center}',
        '#sf-intro-title.on{opacity:1;transform:scale(1)}',
        '#sf-intro-title .t{font-size:clamp(48px,9vw,140px);font-weight:800;letter-spacing:0.22em;color:#fff;text-shadow:0 0 40px rgba(255,210,120,0.55),0 0 12px rgba(255,255,255,0.35)}',
        '#sf-intro-title .s{margin-top:0.4em;font-size:clamp(14px,1.6vw,22px);font-weight:400;letter-spacing:0.5em;color:#c8b994;opacity:0.9}',
        '#sf-intro-skip{position:absolute;top:18px;right:18px;z-index:10;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.18);color:#cfd2d8;font-family:"Cinzel",serif;font-size:12px;letter-spacing:0.18em;padding:8px 14px;cursor:pointer;border-radius:2px;transition:all 0.2s}',
        '#sf-intro-skip:hover{background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.35)}',
        '#sf-intro-hint{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);z-index:10;font-family:"Cinzel",serif;font-size:11px;letter-spacing:0.4em;color:rgba(220,220,220,0.45);text-transform:uppercase}',
        '#sf-intro-root.fadeout{opacity:0;transition:opacity 0.9s ease}'
    ].join('');

    // ── Starfield: drifting points + occasional warp streaks. The drift
    //    speed is mood-driven (set by the sequencer via state.warp). ─────
    function startStarfield(canvas, state) {
        const ctx = canvas.getContext('2d');
        let stars = [];
        function resize() {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            stars = [];
            const n = Math.min(380, Math.floor(canvas.width * canvas.height / 5200));
            for (let i = 0; i < n; i++) {
                stars.push({
                    x: (Math.random() - 0.5) * canvas.width,
                    y: (Math.random() - 0.5) * canvas.height,
                    z: Math.random() * canvas.width,
                    s: 0.3 + Math.random() * 1.4
                });
            }
        }
        resize();
        window.addEventListener('resize', resize);
        let last = performance.now();
        function frame(now) {
            if (state.killed) return;
            const dt = Math.min(0.05, (now - last) / 1000); last = now;
            const cx = canvas.width / 2, cy = canvas.height / 2;
            ctx.fillStyle = 'rgba(0,0,0,' + (0.18 + state.warp * 0.12) + ')';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const warp = state.warp;
            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                s.z -= (40 + warp * 380) * dt;
                if (s.z <= 1) {
                    s.x = (Math.random() - 0.5) * canvas.width;
                    s.y = (Math.random() - 0.5) * canvas.height;
                    s.z = canvas.width;
                }
                const k = canvas.width / s.z;
                const px = cx + s.x * k, py = cy + s.y * k;
                if (px < 0 || px > canvas.width || py < 0 || py > canvas.height) continue;
                const r = s.s * k * 0.05;
                const a = Math.min(1, 0.25 + k * 0.5);
                if (warp > 0.4) {
                    const k2 = canvas.width / Math.max(1, s.z + (40 + warp * 380) * dt * 6);
                    const px2 = cx + s.x * k2, py2 = cy + s.y * k2;
                    ctx.strokeStyle = 'rgba(220,235,255,' + a + ')';
                    ctx.lineWidth = Math.max(0.5, r);
                    ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px, py); ctx.stroke();
                } else {
                    ctx.fillStyle = 'rgba(230,240,255,' + a + ')';
                    ctx.fillRect(px, py, Math.max(1, r), Math.max(1, r));
                }
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // ── Diegetic light source: distant sun + halo + flare spike.
    //    Used by every motif so nothing reads as pure void; whatever is in
    //    shadow at least has a star illuminating the scene from somewhere.
    function drawSun(ctx, w, h, x, y, r, color) {
        // outer corona
        const corona = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 9);
        corona.addColorStop(0, color.glow);
        corona.addColorStop(0.18, color.mid);
        corona.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = corona; ctx.fillRect(0, 0, w, h);
        // hot core
        const core = ctx.createRadialGradient(x, y, 0, x, y, r);
        core.addColorStop(0, color.core);
        core.addColorStop(0.7, color.mid);
        core.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        // anamorphic flare spike
        ctx.save();
        ctx.translate(x, y);
        const spike = ctx.createLinearGradient(-r * 14, 0, r * 14, 0);
        spike.addColorStop(0, 'rgba(0,0,0,0)');
        spike.addColorStop(0.5, color.spike);
        spike.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spike; ctx.fillRect(-r * 14, -r * 0.18, r * 28, r * 0.36);
        ctx.restore();
    }

    // Standard "white star" preset for reuse.
    const SUN_WHITE = { core: 'rgba(255,250,235,1)', mid: 'rgba(255,235,190,0.55)', glow: 'rgba(255,225,170,0.18)', spike: 'rgba(255,235,200,0.55)' };
    const SUN_RED = { core: 'rgba(255,180,120,1)', mid: 'rgba(255,110,60,0.55)', glow: 'rgba(220,60,30,0.18)', spike: 'rgba(255,140,80,0.5)' };
    const SUN_BLUE = { core: 'rgba(220,235,255,1)', mid: 'rgba(140,180,255,0.55)', glow: 'rgba(80,130,220,0.18)', spike: 'rgba(180,210,255,0.5)' };

    // ── Motif scenes: each draws a full canvas frame for its beat.
    //    Pure procedural \u2014 no images, no GLBs. Cross-fade is handled by
    //    the render loop (state.motif vs state.motifPrev with state.motifT). ──
    const MOTIFS = {
        // VOID \u2014 not pure black: a distant nebula and a faint star-cluster
        //    so the opening line has something to breathe in.
        void: function (ctx, w, h, age) {
            const neb = ctx.createRadialGradient(w * 0.7, h * 0.35, 0, w * 0.7, h * 0.35, Math.max(w, h) * 0.55);
            neb.addColorStop(0, 'rgba(80,60,140,0.18)');
            neb.addColorStop(0.45, 'rgba(40,30,90,0.10)');
            neb.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h);
            const neb2 = ctx.createRadialGradient(w * 0.18, h * 0.78, 0, w * 0.18, h * 0.78, Math.max(w, h) * 0.5);
            neb2.addColorStop(0, 'rgba(180,80,60,0.10)');
            neb2.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = neb2; ctx.fillRect(0, 0, w, h);
            // distant pinpoint star
            drawSun(ctx, w, h, w * 0.82, h * 0.22, Math.min(w, h) * 0.012, SUN_WHITE);
        },

        // EARTH \u2014 shaded sphere with continent patches and atmospheric halo.
        earth: function (ctx, w, h, age) {
            const cx = w * 0.5, cy = h * 0.62, R = Math.min(w, h) * 0.28;
            // atmospheric halo
            const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.45);
            halo.addColorStop(0, 'rgba(140,200,255,0.38)');
            halo.addColorStop(0.55, 'rgba(80,140,220,0.12)');
            halo.addColorStop(1, 'rgba(40,80,160,0)');
            ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2); ctx.fill();
            // ocean disc with terminator (lit from upper-left)
            const ocean = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.45, R * 0.1, cx, cy, R);
            ocean.addColorStop(0, '#3d7fc9');
            ocean.addColorStop(0.55, '#1f4f8f');
            ocean.addColorStop(0.85, '#0b2a55');
            ocean.addColorStop(1, '#04122a');
            ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
            // continent patches \u2014 deterministic from phi-spiral seeds, slow drift
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
            const PHI = 1.6180339887;
            for (let i = 0; i < 18; i++) {
                const ang = i * Math.PI * 2 / PHI + age * 0.03;
                const rr = Math.sqrt((i + 0.5) / 18) * R * 0.9;
                const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr * 0.9;
                const sz = R * (0.08 + ((i * 13) % 7) * 0.018);
                const tone = ctx.createRadialGradient(px, py, 0, px, py, sz);
                tone.addColorStop(0, 'rgba(96,128,72,0.85)');
                tone.addColorStop(0.7, 'rgba(76,98,52,0.55)');
                tone.addColorStop(1, 'rgba(40,60,40,0)');
                ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
            }
            // terminator shadow
            const term = ctx.createRadialGradient(cx + R * 0.35, cy + R * 0.35, R * 0.2, cx + R * 0.6, cy + R * 0.5, R * 1.1);
            term.addColorStop(0, 'rgba(0,0,0,0)');
            term.addColorStop(0.65, 'rgba(0,0,0,0.55)');
            term.addColorStop(1, 'rgba(0,0,0,0.85)');
            ctx.fillStyle = term; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
            ctx.restore();
            // distant moon-glint mark on the limb
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.beginPath(); ctx.arc(cx - R * 0.78, cy - R * 0.55, R * 0.04, 0, Math.PI * 2); ctx.fill();
        },

        // BASESHIP \u2014 fortress-city battle-station: long armored hull with
        //    flanking towers, hangar slots, and a single escort fighter
        //    tracing a slow figure-eight overhead. Acts as the 2D backdrop
        //    until the GLB hero layer fades in.
        baseship: function (ctx, w, h, age) {
            const cx = w * 0.5, cy = h * 0.55;
            const L = Math.min(w, h) * 0.62, H = Math.min(w, h) * 0.16;
            // distant local sun, upper-left, gives the scene a directional source
            drawSun(ctx, w, h, w * 0.18, h * 0.22, Math.min(w, h) * 0.022, SUN_WHITE);
            // soft underglow
            const glow = ctx.createRadialGradient(cx, cy, L * 0.10, cx, cy, L * 0.95);
            glow.addColorStop(0, 'rgba(180,210,255,0.18)');
            glow.addColorStop(0.6, 'rgba(120,160,220,0.06)');
            glow.addColorStop(1, 'rgba(80,110,170,0)');
            ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
            ctx.save(); ctx.translate(cx, cy);
            // main hull \u2014 elongated wedge
            ctx.beginPath();
            ctx.moveTo(-L * 0.50, H * 0.10);
            ctx.lineTo(-L * 0.42, -H * 0.45);
            ctx.lineTo(L * 0.20, -H * 0.55);
            ctx.lineTo(L * 0.50, -H * 0.05);
            ctx.lineTo(L * 0.45, H * 0.30);
            ctx.lineTo(-L * 0.30, H * 0.45);
            ctx.closePath();
            const hull = ctx.createLinearGradient(0, -H * 0.55, 0, H * 0.45);
            hull.addColorStop(0, 'rgba(200,215,240,0.95)');
            hull.addColorStop(0.6, 'rgba(110,130,165,0.95)');
            hull.addColorStop(1, 'rgba(40,55,80,0.95)');
            ctx.fillStyle = hull; ctx.fill();
            // top rim catch-light
            ctx.lineWidth = 2.0; ctx.strokeStyle = 'rgba(220,235,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(-L * 0.42, -H * 0.45); ctx.lineTo(L * 0.20, -H * 0.55); ctx.lineTo(L * 0.50, -H * 0.05);
            ctx.stroke();
            // flanking command towers
            ctx.fillStyle = 'rgba(150,170,205,0.95)';
            [-0.25, 0.05, 0.30].forEach(function (t) {
                ctx.fillRect(t * L - H * 0.06, -H * 0.85, H * 0.12, H * 0.45);
            });
            // hangar slots / window lights along the spine
            const blink = 0.65 + 0.35 * Math.sin(age * 2.4);
            ctx.fillStyle = 'rgba(255,235,180,' + (0.65 * blink) + ')';
            for (let i = 0; i < 22; i++) ctx.fillRect(-L * 0.46 + i * L * 0.044, -H * 0.05, 2.4, 2.4);
            // engine wash on the stern
            const wash = ctx.createRadialGradient(-L * 0.50, 0, 2, -L * 0.50, 0, L * 0.18);
            wash.addColorStop(0, 'rgba(120,200,255,0.85)');
            wash.addColorStop(1, 'rgba(40,80,160,0)');
            ctx.fillStyle = wash; ctx.beginPath(); ctx.arc(-L * 0.50, 0, L * 0.18, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // escort fighter \u2014 single bright dot tracing a slow figure-eight
            const fx = cx + Math.sin(age * 0.6) * L * 0.55;
            const fy = cy - H * 1.6 + Math.sin(age * 1.2) * H * 0.35;
            ctx.fillStyle = 'rgba(120,255,160,0.95)';
            ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(120,255,160,0.35)';
            ctx.beginPath(); ctx.arc(fx, fy, 5.5, 0, Math.PI * 2); ctx.fill();
        },

        // HIVE \u2014 hex-cell field lit by the Zorgon star (red); cells facing
        //    the sun catch its light, the far side falls into deep shadow.
        hive: function (ctx, w, h, age) {
            const cell = Math.min(w, h) * 0.06;
            const drift = (age * cell * 0.28) % (cell * 1.732);
            const cols = Math.ceil(w / (cell * 1.5)) + 2;
            const rows = Math.ceil(h / (cell * 1.732)) + 4;
            const sx = w * 0.5, sy = h * 0.42;
            // backdrop wash so the field never goes pure black
            const wash = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h));
            wash.addColorStop(0, 'rgba(80,30,20,0.55)');
            wash.addColorStop(0.6, 'rgba(30,10,8,0.25)');
            wash.addColorStop(1, 'rgba(8,4,4,0.0)');
            ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
            ctx.save();
            ctx.translate(0, -drift);
            ctx.lineWidth = 1;
            for (let r = -2; r < rows; r++) {
                for (let c = -1; c < cols; c++) {
                    const x = c * cell * 1.5;
                    const y = r * cell * 1.732 + (c & 1 ? cell * 0.866 : 0);
                    const dx = x - sx, dy = (y - drift) - sy;
                    const d = Math.sqrt(dx * dx + dy * dy) / Math.min(w, h);
                    const heat = Math.max(0, 1 - d * 1.6);
                    // lit-side bias: cells whose centre is above-left of sun get rim
                    const lit = Math.max(0, -((dx * -1 + dy * -1) / (Math.min(w, h) * 0.5)));
                    ctx.beginPath();
                    for (let k = 0; k < 6; k++) {
                        const a = Math.PI / 3 * k + Math.PI / 6;
                        const px = x + Math.cos(a) * cell * 0.95, py = y + Math.sin(a) * cell * 0.95;
                        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(' + (40 + heat * 200) + ',' + (10 + heat * 30) + ',' + (8 + heat * 20) + ',' + (0.12 + heat * 0.55) + ')';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(' + (200 + lit * 55) + ',' + (90 + lit * 60) + ',40,' + (0.18 + heat * 0.4 + lit * 0.2) + ')';
                    ctx.stroke();
                }
            }
            ctx.restore();
            // the Zorgon star itself
            drawSun(ctx, w, h, sx, sy, Math.min(w, h) * 0.045, SUN_RED);
        },

        // SIEGE \u2014 battlestation silhouette backlit by a dying red sun, fires
        //    along the hull, embers drifting upward. Power is out but the
        //    star is still there \u2014 the fortress reads as a rim-lit wedge.
        siege: function (ctx, w, h, age) {
            const cx = w * 0.5, cy = h * 0.55;
            const L = Math.min(w, h) * 0.62, H = Math.min(w, h) * 0.16;
            // backlight sun, upper-right behind the fortress
            const sunX = w * 0.72, sunY = h * 0.30;
            drawSun(ctx, w, h, sunX, sunY, Math.min(w, h) * 0.05, SUN_RED);
            // dark battlestation silhouette (power is out)
            ctx.save(); ctx.translate(cx, cy);
            ctx.beginPath();
            ctx.moveTo(-L * 0.50, H * 0.10);
            ctx.lineTo(-L * 0.42, -H * 0.45);
            ctx.lineTo(L * 0.20, -H * 0.55);
            ctx.lineTo(L * 0.50, -H * 0.05);
            ctx.lineTo(L * 0.45, H * 0.30);
            ctx.lineTo(-L * 0.30, H * 0.45);
            ctx.closePath();
            ctx.fillStyle = 'rgba(20,12,10,0.98)'; ctx.fill();
            // rim catch-light on the side facing the sun
            ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(255,140,80,0.78)';
            ctx.beginPath();
            ctx.moveTo(L * 0.20, -H * 0.55); ctx.lineTo(L * 0.50, -H * 0.05); ctx.lineTo(L * 0.45, H * 0.30);
            ctx.stroke();
            // dim flanking towers
            ctx.fillStyle = 'rgba(30,18,14,1)';
            [-0.25, 0.05, 0.30].forEach(function (t) {
                ctx.fillRect(t * L - H * 0.06, -H * 0.85, H * 0.12, H * 0.45);
            });
            ctx.restore();
            // fires along the hull \u2014 a few persistent hotspots
            const fires = [
                { dx: -0.30, dy: -0.30, scale: 1.0 }, { dx: -0.05, dy: 0.10, scale: 0.7 },
                { dx: 0.18, dy: -0.05, scale: 1.2 }, { dx: 0.38, dy: 0.20, scale: 0.6 }
            ];
            fires.forEach((f, idx) => {
                const fx = cx + f.dx * L;
                const fy = cy + f.dy * H;
                const flick = 0.7 + 0.3 * Math.sin(age * 6 + idx * 2.1);
                const sz = H * 0.45 * f.scale * flick;
                const fire = ctx.createRadialGradient(fx, fy, 0, fx, fy, sz);
                fire.addColorStop(0, 'rgba(255,230,160,0.95)');
                fire.addColorStop(0.4, 'rgba(255,140,60,0.75)');
                fire.addColorStop(1, 'rgba(180,40,20,0)');
                ctx.fillStyle = fire; ctx.beginPath(); ctx.arc(fx, fy, sz, 0, Math.PI * 2); ctx.fill();
            });
            // embers drifting upward \u2014 deterministic phi spiral so they look organic but cost nothing
            const PHI = 1.6180339887;
            for (let i = 0; i < 80; i++) {
                const seed = i * 0.11;
                const a = i * Math.PI * 2 / PHI;
                const baseY = h - ((age * 60 + i * 23) % h);
                const x = w * 0.5 + Math.sin(age * 0.8 + seed) * w * 0.35 + Math.cos(a) * 6;
                const y = baseY;
                const t = 1 - baseY / h;
                ctx.fillStyle = 'rgba(255,' + (130 + Math.floor(80 * (1 - t))) + ',60,' + (0.25 + 0.45 * t) + ')';
                ctx.fillRect(x, y, 2, 2);
            }
        },

        // COCKPIT / LAUNCH TUBE — perspective interior with structural ribs,
        //    armored wall panels, and guidance lights rushing by toward the
        //    pilot to sell acceleration before the first combat launch.
        cockpit: function (ctx, w, h, age) {
            const cx = w * 0.5;
            const vpY = h * 0.36;
            const ringCount = 17;

            // Base steel-blue tunnel fog.
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, 'rgba(8,12,20,0.98)');
            bg.addColorStop(0.55, 'rgba(10,16,28,0.95)');
            bg.addColorStop(1, 'rgba(3,6,12,1)');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            // Deep launch aperture at the vanishing point.
            const aperture = ctx.createRadialGradient(cx, vpY, 0, cx, vpY, Math.min(w, h) * 0.4);
            aperture.addColorStop(0, 'rgba(40,90,150,0.28)');
            aperture.addColorStop(0.45, 'rgba(16,30,48,0.20)');
            aperture.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = aperture;
            ctx.fillRect(0, 0, w, h);

            // Tube shell and ribs. Rings slide toward camera to mimic speed.
            for (let i = 0; i < ringCount; i++) {
                const t = ((i / ringCount) + age * 0.42) % 1;
                const e = Math.pow(t, 1.9);
                const y = vpY + e * (h * 0.68);
                const halfW = w * (0.05 + e * 0.47);
                const halfH = h * (0.03 + e * 0.20);
                const a = 0.08 + e * 0.32;
                ctx.strokeStyle = 'rgba(125,170,220,' + a.toFixed(3) + ')';
                ctx.lineWidth = 1 + e * 2.4;
                ctx.beginPath();
                ctx.moveTo(cx - halfW, y - halfH);
                ctx.lineTo(cx + halfW, y - halfH);
                ctx.lineTo(cx + halfW * 0.92, y + halfH);
                ctx.lineTo(cx - halfW * 0.92, y + halfH);
                ctx.closePath();
                ctx.stroke();
            }

            // Side armor planes to make the tunnel feel enclosed and metallic.
            const leftWall = ctx.createLinearGradient(0, 0, w * 0.26, 0);
            leftWall.addColorStop(0, 'rgba(24,34,52,0.95)');
            leftWall.addColorStop(1, 'rgba(10,16,28,0.05)');
            ctx.fillStyle = leftWall;
            ctx.beginPath();
            ctx.moveTo(0, h * 0.14);
            ctx.lineTo(w * 0.24, h * 0.28);
            ctx.lineTo(w * 0.24, h * 0.96);
            ctx.lineTo(0, h);
            ctx.closePath();
            ctx.fill();
            const rightWall = ctx.createLinearGradient(w, 0, w * 0.74, 0);
            rightWall.addColorStop(0, 'rgba(24,34,52,0.95)');
            rightWall.addColorStop(1, 'rgba(10,16,28,0.05)');
            ctx.fillStyle = rightWall;
            ctx.beginPath();
            ctx.moveTo(w, h * 0.14);
            ctx.lineTo(w * 0.76, h * 0.28);
            ctx.lineTo(w * 0.76, h * 0.96);
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();

            // Guidance strips rushing by on both sides.
            const laneCount = 24;
            for (let i = 0; i < laneCount; i++) {
                const t = ((i / laneCount) + age * 1.5) % 1;
                const e = Math.pow(t, 1.7);
                const y = vpY + e * (h * 0.67);
                const side = w * (0.07 + e * 0.40);
                const segW = 6 + e * 30;
                const segH = 1.5 + e * 4.2;
                const glowA = 0.08 + e * 0.62;
                ctx.fillStyle = 'rgba(110,220,255,' + glowA.toFixed(3) + ')';
                ctx.fillRect(cx - side - segW, y, segW, segH);
                ctx.fillRect(cx + side, y, segW, segH);
                ctx.fillStyle = 'rgba(160,245,255,' + (glowA * 0.45).toFixed(3) + ')';
                ctx.fillRect(cx - side - segW, y - segH * 1.3, segW, segH * 0.55);
                ctx.fillRect(cx + side, y - segH * 1.3, segW, segH * 0.55);
            }

            // Ceiling centerline nav lights.
            const navCount = 12;
            for (let i = 0; i < navCount; i++) {
                const t = ((i / navCount) + age * 1.1) % 1;
                const e = Math.pow(t, 1.55);
                const y = vpY + e * (h * 0.46);
                const ww = 2 + e * 9;
                const aa = 0.12 + e * 0.5;
                ctx.fillStyle = 'rgba(255,190,96,' + aa.toFixed(3) + ')';
                ctx.fillRect(cx - ww * 0.5, y, ww, 2 + e * 2.8);
            }

            // Cockpit frame in foreground for parallax depth.
            ctx.strokeStyle = 'rgba(120,190,220,0.70)';
            ctx.lineWidth = Math.max(2, h * 0.006);
            ctx.beginPath();
            ctx.moveTo(w * 0.05, h * 0.10); ctx.lineTo(w * 0.08, h * 0.86); ctx.lineTo(w * 0.40, h * 0.98);
            ctx.moveTo(w * 0.95, h * 0.10); ctx.lineTo(w * 0.92, h * 0.86); ctx.lineTo(w * 0.60, h * 0.98);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(56,126,150,0.65)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(w * 0.08, h * 0.28); ctx.lineTo(cx, vpY); ctx.lineTo(w * 0.92, h * 0.28);
            ctx.stroke();

            // HUD reticle stays but is subtler during launch acceleration.
            const R = Math.min(w, h) * 0.09;
            const pulse = 0.5 + 0.5 * Math.sin(age * 8.0);
            ctx.strokeStyle = 'rgba(20,245,215,' + (0.55 + pulse * 0.25).toFixed(3) + ')';
            ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.arc(cx, h * 0.54, R, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - R * 1.35, h * 0.54); ctx.lineTo(cx - R * 0.95, h * 0.54);
            ctx.moveTo(cx + R * 0.95, h * 0.54); ctx.lineTo(cx + R * 1.35, h * 0.54);
            ctx.moveTo(cx, h * 0.54 - R * 1.35); ctx.lineTo(cx, h * 0.54 - R * 0.95);
            ctx.moveTo(cx, h * 0.54 + R * 0.95); ctx.lineTo(cx, h * 0.54 + R * 1.35);
            ctx.stroke();

            // Forward-thrust bar at the console edge.
            const thrust = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(age * 6.0 + 0.8));
            const barW = w * 0.24;
            const barX = cx - barW * 0.5;
            const barY = h * 0.93;
            ctx.fillStyle = 'rgba(20,40,52,0.82)';
            ctx.fillRect(barX, barY, barW, 4);
            ctx.fillStyle = 'rgba(70,255,220,0.78)';
            ctx.fillRect(barX, barY, barW * thrust, 4);
        },

        // HIVE REVEAL \u2014 the hive ship rises from below, bathed in its own
        //    ominous red light; a Dreadnought drifts in the foreground as a
        //    dark angular silhouette, rim-lit by the hive behind it.
        //    Embers stream upward. They are coming.
        hiveReveal: function (ctx, w, h, age) {
            // Sky wash \u2014 deep red-violet, fading to ember red at the horizon.
            const sky = ctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, 'rgba(18,4,10,1)');
            sky.addColorStop(0.55, 'rgba(60,12,22,1)');
            sky.addColorStop(1, 'rgba(130,30,30,1)');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
            // Hive rises slowly over the first ~5s of the beat.
            const rise = Math.min(1, age * 0.18);
            const hiveR = Math.min(w, h) * 0.55;
            const hiveCX = w * 0.55;
            const hiveCY = h * 1.05 - rise * h * 0.55;
            // Volumetric god-ray bath \u2014 the hive's own glow.
            const bath = ctx.createRadialGradient(hiveCX, hiveCY - hiveR * 0.35, hiveR * 0.10, hiveCX, hiveCY, hiveR * 2.2);
            bath.addColorStop(0, 'rgba(255,150,90,0.85)');
            bath.addColorStop(0.25, 'rgba(220,70,40,0.55)');
            bath.addColorStop(0.6, 'rgba(120,20,30,0.30)');
            bath.addColorStop(1, 'rgba(20,4,8,0)');
            ctx.fillStyle = bath; ctx.fillRect(0, 0, w, h);
            // Hive body \u2014 honeycomb dome with cells that pulse out of phase.
            ctx.save();
            ctx.beginPath(); ctx.arc(hiveCX, hiveCY, hiveR, 0, Math.PI * 2); ctx.clip();
            const body = ctx.createRadialGradient(hiveCX, hiveCY - hiveR * 0.4, hiveR * 0.05, hiveCX, hiveCY, hiveR);
            body.addColorStop(0, 'rgba(255,180,100,0.95)');
            body.addColorStop(0.4, 'rgba(180,50,40,0.95)');
            body.addColorStop(1, 'rgba(40,8,12,1)');
            ctx.fillStyle = body; ctx.fillRect(hiveCX - hiveR, hiveCY - hiveR, hiveR * 2, hiveR * 2);
            const cell = hiveR * 0.06;
            const cols = Math.ceil(hiveR * 2 / (cell * 1.5)) + 2;
            const rows = Math.ceil(hiveR * 2 / (cell * 1.732)) + 2;
            ctx.lineWidth = 1.1;
            for (let r = -2; r < rows; r++) {
                for (let c = -1; c < cols; c++) {
                    const x = hiveCX - hiveR + c * cell * 1.5;
                    const y = hiveCY - hiveR + r * cell * 1.732 + (c & 1 ? cell * 0.866 : 0);
                    const dx = x - hiveCX, dy = y - hiveCY;
                    const d = Math.sqrt(dx * dx + dy * dy) / hiveR;
                    if (d > 0.96) continue;
                    const pulse = 0.55 + 0.45 * Math.sin(age * 1.7 + (c + r) * 0.8);
                    ctx.beginPath();
                    for (let k = 0; k < 6; k++) {
                        const a = Math.PI / 3 * k + Math.PI / 6;
                        const px = x + Math.cos(a) * cell * 0.92, py = y + Math.sin(a) * cell * 0.92;
                        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    const cellHeat = pulse * (1 - d * 0.5);
                    ctx.fillStyle = 'rgba(' + (220 + cellHeat * 35) + ',' + (60 + cellHeat * 130) + ',' + (30 + cellHeat * 40) + ',' + (0.35 + cellHeat * 0.45) + ')';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(20,4,8,0.55)'; ctx.stroke();
                }
            }
            ctx.restore();
            // Dreadnought \u2014 angular wedge silhouette in the foreground,
            //    rim-lit on top by the hive's glow. Power lights along the spine.
            const dnW = w * 0.46, dnH = h * 0.18;
            const dnCX = w * 0.50, dnCY = h * 0.66;
            ctx.save();
            ctx.translate(dnCX, dnCY);
            ctx.beginPath();
            ctx.moveTo(-dnW * 0.50, dnH * 0.25);
            ctx.lineTo(-dnW * 0.35, -dnH * 0.45);
            ctx.lineTo(dnW * 0.10, -dnH * 0.50);
            ctx.lineTo(dnW * 0.50, -dnH * 0.10);
            ctx.lineTo(dnW * 0.45, dnH * 0.30);
            ctx.lineTo(dnW * 0.10, dnH * 0.50);
            ctx.lineTo(-dnW * 0.30, dnH * 0.45);
            ctx.closePath();
            ctx.fillStyle = 'rgba(8,4,6,0.98)'; ctx.fill();
            // Top rim catch-light from the hive behind.
            ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,150,80,0.92)';
            ctx.beginPath();
            ctx.moveTo(-dnW * 0.35, -dnH * 0.45);
            ctx.lineTo(dnW * 0.10, -dnH * 0.50);
            ctx.lineTo(dnW * 0.50, -dnH * 0.10);
            ctx.stroke();
            // Bow rim
            ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,110,60,0.55)';
            ctx.beginPath();
            ctx.moveTo(dnW * 0.50, -dnH * 0.10); ctx.lineTo(dnW * 0.45, dnH * 0.30); ctx.stroke();
            // Turret bumps and a row of running lights along the spine.
            ctx.fillStyle = 'rgba(20,8,10,1)';
            [-0.20, 0.05, 0.28].forEach(function (t) {
                ctx.beginPath(); ctx.arc(t * dnW, -dnH * 0.30, dnH * 0.10, 0, Math.PI, true); ctx.fill();
            });
            const blink = 0.5 + 0.5 * Math.sin(age * 3.2);
            ctx.fillStyle = 'rgba(255,180,80,' + (0.55 + blink * 0.35) + ')';
            for (let i = 0; i < 14; i++) ctx.fillRect(-dnW * 0.42 + i * dnW * 0.065, -dnH * 0.04, 2, 2);
            ctx.restore();
            // Embers drifting upward \u2014 phi spiral so they look organic but cost nothing.
            const PHI = 1.6180339887;
            for (let i = 0; i < 110; i++) {
                const seed = i * 0.13;
                const a = i * Math.PI * 2 / PHI;
                const baseY = h - ((age * 55 + i * 19) % h);
                const x = w * 0.5 + Math.sin(age * 0.7 + seed) * w * 0.45 + Math.cos(a) * 8;
                const y = baseY;
                const t = 1 - baseY / h;
                ctx.fillStyle = 'rgba(255,' + (140 + Math.floor(60 * (1 - t))) + ',60,' + (0.20 + 0.5 * t) + ')';
                ctx.fillRect(x, y, 2, 2);
            }
        },

        // TITLE \u2014 radial vignette darken to make the serif title pop.
        title: function (ctx, w, h) {
            const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
            g.addColorStop(0, 'rgba(20,14,8,0.0)');
            g.addColorStop(0.65, 'rgba(0,0,0,0.55)');
            g.addColorStop(1, 'rgba(0,0,0,0.95)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        },

        black: function (ctx, w, h) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
    };

    // Cross-fading motif renderer. Reads state.motif (current) and
    // state.motifPrev (outgoing); state.motifT eases 0\u21921 over 1.6s on each
    // change. Age (in seconds) drives per-motif animation.
    function startMotifs(canvas, state) {
        const ctx = canvas.getContext('2d');
        function resize() { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }
        resize();
        window.addEventListener('resize', resize);
        const t0 = performance.now();
        let last = t0;
        function frame(now) {
            if (state.killed) return;
            const dt = Math.min(0.05, (now - last) / 1000); last = now;
            const age = (now - t0) / 1000;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // advance cross-fade
            if (state.motifT < 1) state.motifT = Math.min(1, state.motifT + dt / 1.6);
            const w = canvas.width, h = canvas.height;
            // When a 3D scene is loaded for the active motif, dim the 2D
            // hero overlay so the GLB reads cleanly while the sky / sun /
            // ember layers underneath still come through.
            const dim3D = state.scene3dActive ? 0.35 : 1;
            if (state.motifPrev && state.motifT < 1 && MOTIFS[state.motifPrev]) {
                ctx.globalAlpha = (1 - state.motifT) * dim3D;
                MOTIFS[state.motifPrev](ctx, w, h, age);
            }
            if (state.motif && MOTIFS[state.motif]) {
                ctx.globalAlpha = state.motifT * dim3D;
                MOTIFS[state.motif](ctx, w, h, age);
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    // ── 3D hero layer: real GLB models for wheel / hive / hiveReveal.
    //    Lazy-loads in parallel from intro start. Bails gracefully if
    //    THREE or GLTFLoader are not on window (e.g. bundle not yet
    //    loaded), in which case the 2D motifs play full-strength alone. ──
    function start3D(canvas, state) {
        const T = (typeof window !== 'undefined') ? window.THREE : null;
        if (!T || !T.GLTFLoader || !T.WebGLRenderer) return null;
        let renderer;
        try {
            renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        } catch (_) { return null; }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        function resize() {
            const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
            renderer.setSize(w, h, false);
            cam.aspect = w / h; cam.updateProjectionMatrix();
        }
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(38, 1, 0.1, 20000);
        cam.position.set(0, 0, 6);
        scene.add(new T.AmbientLight(0x222233, 0.6));
        const sun = new T.DirectionalLight(0xfff1cc, 0.9);
        sun.position.set(40, 30, 30); scene.add(sun);
        const rim = new T.DirectionalLight(0xff3344, 1.4); // ominous red rim
        rim.position.set(-20, -8, -25); scene.add(rim);
        const cool = new T.DirectionalLight(0x6688aa, 0.4);
        cool.position.set(-30, 20, 10); scene.add(cool);
        resize();
        window.addEventListener('resize', resize);

        const groups = {
            baseship: new T.Group(),
            resolute: new T.Group(),
            fighter: new T.Group(),
            enemies: new T.Group(),
            hive: new T.Group(),
            queen: new T.Group(),
            warrior: new T.Group()
        };
        Object.keys(groups).forEach(k => { groups[k].visible = false; scene.add(groups[k]); });
        // Enemy swarm: cloned fighters with per-instance phase offsets.
        const ENEMY_COUNT = 6;
        groups.enemies.userData.units = [];

        function fitInto(obj, target) {
            const box = new T.Box3().setFromObject(obj);
            const size = new T.Vector3(); box.getSize(size);
            const center = new T.Vector3(); box.getCenter(center);
            obj.position.sub(center);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            obj.scale.setScalar(target / maxDim);
        }
        function loadGLB(url, group, target) {
            try {
                new T.GLTFLoader().load(url, function (g) {
                    if (state.killed) return;
                    const m = g.scene || (g.scenes && g.scenes[0]);
                    if (!m) return;
                    m.traverse(function (o) {
                        if (o.isMesh && o.material) {
                            o.frustumCulled = false;
                            // Soften any pure-black materials so rim lighting reads
                            if (o.material.color && o.material.color.r + o.material.color.g + o.material.color.b < 0.1) {
                                o.material.color.setRGB(0.18, 0.18, 0.22);
                            }
                        }
                    });
                    fitInto(m, target);
                    group.add(m);
                    group.userData.loaded = true;
                }, undefined, function (_e) { /* silent */ });
            } catch (_) { /* silent */ }
        }
        // Procedural high-poly cladding for the artificial-gravity wheel.
        // The base GLB silhouette stays unchanged; this adds a dense rim
        // torus, a tessellated hub, and a ring of radial spoke struts so
        // the wheel reads as engineered hardware rather than a low-poly
        // donut. Spin axis is Y (matches groups.baseship.rotation.y).
        function addWheelDetail(group, target) {
            const R = target * 0.5;          // wheel radius in scene units
            const tube = R * 0.085;          // rim cross-section
            const mat = new T.MeshStandardMaterial({
                color: 0x9aa3b2, metalness: 0.55, roughness: 0.42,
                emissive: 0x101822, emissiveIntensity: 0.35
            });
            const trim = new T.MeshStandardMaterial({
                color: 0xffc35a, metalness: 0.2, roughness: 0.6,
                emissive: 0xff8800, emissiveIntensity: 0.6
            });
            // High-segment torus rim — 256 tubular × 48 radial ≈ 24k triangles
            const rim = new T.Mesh(new T.TorusGeometry(R, tube, 48, 256), mat);
            rim.rotation.x = Math.PI / 2;
            group.add(rim);
            // Inner safety rail — half-thick torus inset, picks up rim light
            const rail = new T.Mesh(new T.TorusGeometry(R * 0.92, tube * 0.35, 24, 192), trim);
            rail.rotation.x = Math.PI / 2;
            group.add(rail);
            // Hub: tessellated sphere
            const hub = new T.Mesh(new T.SphereGeometry(R * 0.16, 64, 48), mat);
            group.add(hub);
            // Hub collar
            const collar = new T.Mesh(new T.TorusGeometry(R * 0.18, tube * 0.4, 24, 96), trim);
            collar.rotation.x = Math.PI / 2;
            group.add(collar);
            // Spoke struts — 6 phi-spaced cylinders bridging hub to rim
            const spokeLen = R * 0.84;
            const spokeGeo = new T.CylinderGeometry(tube * 0.45, tube * 0.6, spokeLen, 24, 8);
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                const sp = new T.Mesh(spokeGeo, mat);
                sp.position.set(Math.cos(a) * spokeLen * 0.5, 0, Math.sin(a) * spokeLen * 0.5);
                sp.rotation.set(0, -a, Math.PI / 2);
                group.add(sp);
            }
            // Rim greebles — small bumps every ~5° around the rim for
            // surface-detail polygon density without breaking silhouette.
            const greebleGeo = new T.BoxGeometry(tube * 0.7, tube * 0.45, tube * 0.7, 4, 4, 4);
            const N = 72;
            for (let k = 0; k < N; k++) {
                const a = (k / N) * Math.PI * 2;
                const g0 = new T.Mesh(greebleGeo, mat);
                g0.position.set(Math.cos(a) * (R + tube * 0.55), 0, Math.sin(a) * (R + tube * 0.55));
                g0.rotation.y = -a;
                group.add(g0);
            }
            group.userData.loaded = true;     // unblock baseship pose even if GLB is slow
        }

        function loadGLBSwarm(url, group, target, count) {
            try {
                new T.GLTFLoader().load(url, function (g) {
                    if (state.killed) return;
                    const m = g.scene || (g.scenes && g.scenes[0]);
                    if (!m) return;
                    m.traverse(function (o) {
                        if (o.isMesh && o.material) {
                            o.frustumCulled = false;
                            if (o.material.color && o.material.color.r + o.material.color.g + o.material.color.b < 0.1) {
                                o.material.color.setRGB(0.18, 0.18, 0.22);
                            }
                        }
                    });
                    fitInto(m, target);
                    for (let i = 0; i < count; i++) {
                        const inst = (i === 0) ? m : m.clone(true);
                        const wrap = new T.Group();
                        wrap.add(inst);
                        group.add(wrap);
                        group.userData.units.push({ wrap: wrap, phase: i / count });
                    }
                    group.userData.loaded = true;
                }, undefined, function (_e) { /* silent */ });
            } catch (_) { /* silent */ }
        }
        loadGLB('assets/models/HumanSpaceStationWithAritificalGravity.glb', groups.baseship, 5.2);
        addWheelDetail(groups.baseship, 5.2);
        loadGLB('assets/models/HumanSpaceBattleShip.glb', groups.resolute, 2.8);
        loadGLB('assets/models/HumanFriendlStarFighter.glb', groups.fighter, 0.9);
        loadGLBSwarm('assets/models/AlienEnemyFighter.glb', groups.enemies, 0.7, ENEMY_COUNT);
        // Procedural hive ship — no GLB needed, derived from geometry seed
        (function buildHiveShip(group) {
            const amber = new T.Color(0.9, 0.55, 0.0);
            const dark = new T.Color(0.06, 0.04, 0.02);
            const pulse = new T.Color(0.3, 0.8, 0.1);

            const hullMat = new T.MeshStandardMaterial({
                color: new T.Color(0.08, 0.06, 0.04),
                emissive: amber, emissiveIntensity: 0.18,
                roughness: 0.85, metalness: 0.35
            });
            const cellMat = new T.MeshStandardMaterial({
                color: new T.Color(0.18, 0.10, 0.02),
                emissive: amber, emissiveIntensity: 0.55,
                roughness: 0.7, metalness: 0.2
            });
            const coreMat = new T.MeshStandardMaterial({
                color: dark, emissive: pulse, emissiveIntensity: 1.4,
                roughness: 0.3, metalness: 0.8
            });

            // Central body — oblate sphere
            const body = new T.Mesh(new T.SphereGeometry(1.0, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.72), hullMat);
            body.scale.set(1.6, 1.0, 1.3);
            body.frustumCulled = false;
            group.add(body);

            // Pulsing reactor core
            const core = new T.Mesh(new T.SphereGeometry(0.22, 16, 16), coreMat);
            core.frustumCulled = false;
            group.add(core);
            group.userData.core = core;   // referenced in animation

            // Hexagonal cell patches on the surface (two rings + top cap)
            const HEX = 6;
            function addHexRing(radius, y, count, scale) {
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2;
                    const cx = Math.cos(angle) * radius * 1.55;
                    const cz = Math.sin(angle) * radius * 1.25;
                    const hex = new T.Mesh(
                        new T.CylinderGeometry(scale, scale * 0.85, scale * 0.35, HEX, 1),
                        cellMat
                    );
                    hex.frustumCulled = false;
                    hex.position.set(cx, y, cz);
                    // Face outward from hull centre
                    hex.lookAt(cx * 2, y, cz * 2);
                    hex.rotateX(Math.PI * 0.5);
                    group.add(hex);
                }
            }
            addHexRing(0.82, 0.38, 10, 0.26);
            addHexRing(0.72, -0.18, 12, 0.22);
            addHexRing(0.40, 0.78, 6, 0.20);

            // Thick thorax ridges
            for (let r = 0; r < 5; r++) {
                const angle = (r / 5) * Math.PI * 2;
                const ridge = new T.Mesh(
                    new T.TorusGeometry(0.28, 0.055, 6, 14, Math.PI * 0.7),
                    hullMat
                );
                ridge.frustumCulled = false;
                ridge.position.set(Math.cos(angle) * 1.1, -0.15, Math.sin(angle) * 0.85);
                ridge.rotation.set(Math.PI * 0.5, 0, angle);
                group.add(ridge);
            }

            // Underbelly stalactite spires
            const spireGeo = new T.ConeGeometry(0.07, 0.55, 6, 1);
            for (let s = 0; s < 8; s++) {
                const a = (s / 8) * Math.PI * 2;
                const spire = new T.Mesh(spireGeo, hullMat);
                spire.frustumCulled = false;
                spire.position.set(Math.cos(a) * 0.65, -0.72, Math.sin(a) * 0.50);
                spire.rotation.z = Math.PI;
                group.add(spire);
            }
            // Centre spire
            const cSpire = new T.Mesh(new T.ConeGeometry(0.10, 0.80, 6, 1), hullMat);
            cSpire.frustumCulled = false;
            cSpire.position.set(0, -0.88, 0);
            cSpire.rotation.z = Math.PI;
            group.add(cSpire);

            // Outer sensor antenna ring
            const antGeo = new T.CylinderGeometry(0.012, 0.012, 0.55, 4);
            for (let a = 0; a < 6; a++) {
                const ang = (a / 6) * Math.PI * 2;
                const ant = new T.Mesh(antGeo, coreMat);
                ant.frustumCulled = false;
                ant.position.set(Math.cos(ang) * 1.62, 0.18, Math.sin(ang) * 1.24);
                ant.rotation.set(Math.cos(ang) * 0.3, 0, -Math.sin(ang) * 0.3);
                group.add(ant);
            }

            // Scale to match target size of ~5.0 units
            group.scale.setScalar(1.0);
            group.userData.loaded = true;
        })(groups.hive);
        loadGLB('assets/models/HiveQueen_BossW10.glb', groups.queen, 2.9);
        loadGLB(encodeURI('assets/models/zorgonWarrior'), groups.warrior, 2.0);

        const t0 = state._t0 || performance.now();
        let last = performance.now(), fade = 0;
        // Position the swarm in a sweeping arc across the camera frustum,
        // anchored around the hive at the origin. `intensity` 0..1 fades
        // motion radius — used to ramp the swarm in over the beat.
        function poseEnemies(age, intensity) {
            const units = groups.enemies.userData.units || [];
            if (!units.length) return;
            groups.enemies.visible = true;
            const r = 3.4 + intensity * 1.2;
            for (let i = 0; i < units.length; i++) {
                const u = units[i];
                const t = age * 0.55 + u.phase * Math.PI * 2;
                const x = Math.cos(t) * r + Math.sin(t * 0.7 + u.phase) * 0.6;
                const y = Math.sin(t * 0.9 + u.phase * 1.3) * 0.9;
                const z = Math.sin(t) * (r * 0.55) + Math.cos(t * 0.5) * 0.4;
                u.wrap.position.set(x, y, z);
                u.wrap.rotation.set(
                    Math.sin(t * 0.8) * 0.25,
                    -t + Math.PI * 0.5,
                    Math.cos(t) * 0.35
                );
            }
        }
        function poseFor(name, age) {
            // Reset visibility
            groups.baseship.visible = false; groups.resolute.visible = false;
            groups.fighter.visible = false; groups.enemies.visible = false;
            groups.hive.visible = false; groups.queen.visible = false; groups.warrior.visible = false;
            if (name === 'baseship') {
                if (!groups.baseship.userData.loaded) return false;
                groups.baseship.visible = true;
                groups.baseship.position.set(-0.6, -0.3, 0);
                // Visible spin-gravity rotation around the station's long axis.
                groups.baseship.rotation.set(0.18, age * 0.18, 0.04);
                // Resolute on station-keeping off to starboard, slow drift.
                if (groups.resolute.userData.loaded) {
                    groups.resolute.visible = true;
                    const rx = 4.2 + Math.sin(age * 0.18) * 0.18;
                    const ry = 0.4 + Math.sin(age * 0.22) * 0.10;
                    const rz = -1.6 + Math.cos(age * 0.18) * 0.20;
                    groups.resolute.position.set(rx, ry, rz);
                    groups.resolute.rotation.set(0.06, -0.45 + Math.sin(age * 0.10) * 0.04, 0.02);
                }
                // Escort fighter traces a slow figure-eight overhead.
                if (groups.fighter.userData.loaded) {
                    groups.fighter.visible = true;
                    const fx = Math.sin(age * 0.6) * 3.2;
                    const fy = 1.6 + Math.sin(age * 1.2) * 0.5;
                    const fz = Math.cos(age * 0.6) * 1.6;
                    groups.fighter.position.set(fx, fy, fz);
                    // Bank toward direction of travel
                    groups.fighter.rotation.set(0.0, -age * 0.6 + Math.PI * 0.5, Math.sin(age * 0.6) * 0.35);
                }
                cam.position.set(0, 0.9, 10.6);
                cam.lookAt(0.3, 0, 0);
                sun.intensity = 1.1; rim.intensity = 0.6; cool.intensity = 0.7;
                return true;
            }
            if (name === 'hive') {
                if (!groups.hive.userData.loaded) return false;
                groups.hive.visible = true;
                groups.hive.position.set(0, -0.2, 0);
                groups.hive.rotation.set(0.05, age * 0.06, 0);
                // Pulse reactor core brightness
                if (groups.hive.userData.core) {
                    const p = 0.8 + 0.6 * Math.abs(Math.sin(age * 1.8));
                    groups.hive.userData.core.material.emissiveIntensity = p;
                    const s = 1.0 + 0.15 * Math.abs(Math.sin(age * 1.8));
                    groups.hive.userData.core.scale.setScalar(s);
                }
                if (groups.warrior.userData.loaded) {
                    groups.warrior.visible = true;
                    groups.warrior.position.set(-1.8, -0.9, 1.5);
                    groups.warrior.rotation.set(0.1, -0.4 + Math.sin(age * 0.32) * 0.08, 0.02);
                }
                // Enemy fighters swarm around the mothership.
                if (groups.enemies.userData.loaded) {
                    const since = age - (state.scene3dStartAge || 0);
                    const intensity = Math.min(1, since / 2.5);
                    poseEnemies(age, intensity);
                }
                cam.position.set(0, 0.2, 9.0);
                cam.lookAt(0, 0, 0);
                sun.intensity = 0.4; rim.intensity = 1.6; cool.intensity = 0.3;
                return true;
            }
            if (name === 'hiveReveal') {
                if (!groups.hive.userData.loaded && !groups.queen.userData.loaded) return false;
                // Hive rises from below over ~7s, then sits ominously.
                const rev = Math.min(1, (age - (state.scene3dStartAge || 0)) / 7.0);
                const y = -3.5 + rev * 3.0;
                if (groups.hive.userData.loaded) {
                    groups.hive.visible = true;
                    groups.hive.position.set(0.4, y, -1.2);
                    groups.hive.rotation.set(0.02, 0.4 + age * 0.02, 0);
                    if (groups.hive.userData.core) {
                        const p = 0.8 + 0.6 * Math.abs(Math.sin(age * 1.8));
                        groups.hive.userData.core.material.emissiveIntensity = p;
                        const s = 1.0 + 0.15 * Math.abs(Math.sin(age * 1.8));
                        groups.hive.userData.core.scale.setScalar(s);
                    }
                }
                if (groups.queen.userData.loaded) {
                    groups.queen.visible = true;
                    groups.queen.position.set(-1.0, -0.25, 2.25);
                    groups.queen.rotation.set(0.03, -0.55 + Math.sin(age * 0.16) * 0.08, 0.01);
                }
                if (groups.warrior.userData.loaded) {
                    groups.warrior.visible = true;
                    groups.warrior.position.set(1.9, -0.8, 2.4);
                    groups.warrior.rotation.set(0.06, 0.52 + Math.sin(age * 0.34) * 0.12, 0.02);
                }
                // Persistent swarm escorting the reveal at full intensity.
                if (groups.enemies.userData.loaded) poseEnemies(age, 1.0);
                cam.position.set(0, 0.5, 8.5);
                cam.lookAt(0.2, -0.2, 0);
                sun.intensity = 0.18; rim.intensity = 2.2; cool.intensity = 0.2;
                return true;
            }
            return false;
        }
        function frame(now) {
            if (state.killed) {
                try { renderer.dispose(); } catch (_) { }
                return;
            }
            const dt = Math.min(0.05, (now - last) / 1000); last = now;
            const age = (now - t0) / 1000;
            const want = poseFor(state.scene3d, age);
            state.scene3dActive = want;
            const targetFade = want ? 1 : 0;
            fade += (targetFade - fade) * Math.min(1, dt / 0.6);
            canvas.style.opacity = fade.toFixed(3);
            if (fade > 0.01) renderer.render(scene, cam);
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        return { scene, cam, renderer, groups };
    }

    //    Single AudioContext, gain envelopes per beat. The score is the
    //    synth — every voice is a manifold projection, no sample hook.  ──
    function startAudio(state) {
        let AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return { kill: () => { }, mood: () => { }, swell: () => { } };
        const ctx = new AC();
        const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
        master.gain.setTargetAtTime(0.62, ctx.currentTime, 0.4);

        // Cheap chamber reverb \u2014 single feedback delay, high-passed so the
        // tail stays out of the sub band where the drone lives.
        const verbDelay = ctx.createDelay(0.5);
        verbDelay.delayTime.value = 0.21;
        const verbFB = ctx.createGain(); verbFB.gain.value = 0.42;
        const verbHP = ctx.createBiquadFilter(); verbHP.type = 'highpass'; verbHP.frequency.value = 260;
        verbDelay.connect(verbHP).connect(verbFB).connect(verbDelay).connect(master);
        function send(node) { try { node.connect(verbDelay); } catch (_) { } }

        // Sub drone \u2014 two detuned saws + octave through a low-pass.
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.7;
        const droneGain = ctx.createGain(); droneGain.gain.value = 0;
        lp.connect(droneGain).connect(master);
        function osc(freq, det) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det; o.connect(lp); o.start(); return o; }
        const o1 = osc(55, -7), o2 = osc(55, +7), o3 = osc(82.5, 0);
        droneGain.gain.setTargetAtTime(0.18, ctx.currentTime + 0.5, 1.5);

        // String pad \u2014 8 detuned sawtooths in D minor, slow vibrato via LFO.
        const stringFilter = ctx.createBiquadFilter();
        stringFilter.type = 'lowpass'; stringFilter.frequency.value = 1100; stringFilter.Q.value = 0.5;
        const stringGain = ctx.createGain(); stringGain.gain.value = 0;
        stringFilter.connect(stringGain).connect(master); send(stringGain);
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 4.3;
        const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 4;
        lfo.connect(lfoDepth); lfo.start();
        const stringOsc = [];
        function str(freq, det) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
            o.connect(stringFilter); o.start(); lfoDepth.connect(o.detune); stringOsc.push(o); return o;
        }
        str(146.83, -8); str(146.83, +8);   // D3
        str(174.61, -4); str(174.61, +4);   // F3 (minor third)
        str(220.00, -6); str(220.00, +6);   // A3
        str(261.63, -10); str(261.63, +10); // C4

        // Brass \u2014 square waves through a bandpass for that horn rasp.
        const brassFilter = ctx.createBiquadFilter();
        brassFilter.type = 'bandpass'; brassFilter.frequency.value = 900; brassFilter.Q.value = 1.4;
        const brassGain = ctx.createGain(); brassGain.gain.value = 0;
        brassFilter.connect(brassGain).connect(master); send(brassGain);
        function brass(freq) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq; o.connect(brassFilter); o.start(); return o; }
        const br1 = brass(73.42), br2 = brass(110.00), br3 = brass(146.83);

        // Choir \u2014 stacked sines at fifths/octaves give a wordless ah.
        const choirGain = ctx.createGain(); choirGain.gain.value = 0;
        choirGain.connect(master); send(choirGain);
        function choir(freq) {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
            const v = ctx.createGain(); v.gain.value = 0.18;
            o.connect(v).connect(choirGain); o.start(); return o;
        }
        const c1 = choir(220), c2 = choir(330), c3 = choir(440), c4 = choir(587.33);

        // Percussion \u2014 sine kick, noise hit, low-resonant timpani.
        const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
        function kick(t, fStart, fEnd, amp) {
            fStart = fStart || 95; fEnd = fEnd || 40; amp = amp || 0.7;
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(fStart, t);
            o.frequency.exponentialRampToValueAtTime(fEnd, t + 0.18);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
            o.connect(g).connect(master); o.start(t); o.stop(t + 0.6);
        }
        function timpani(t, freq) {
            const src = ctx.createBufferSource(); src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 8;
            const g = ctx.createGain(); g.gain.value = 0.55;
            src.connect(f).connect(g).connect(master); src.start(t);
            kick(t, freq * 1.6, freq, 0.55);
        }
        function hit(t) {
            const src = ctx.createBufferSource(); src.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
            const g = ctx.createGain(); g.gain.value = 0.32;
            src.connect(f).connect(g).connect(master); src.start(t);
        }
        function brassStab(t, freqs, dur) {
            for (let i = 0; i < freqs.length; i++) {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                const f = ctx.createBiquadFilter(); f.type = 'lowpass';
                f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(600, t + dur);
                o.type = 'square'; o.frequency.value = freqs[i];
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
                g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
            }
        }
        function chord(t, freqs, dur) {
            for (let i = 0; i < freqs.length; i++) {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.type = 'sawtooth'; o.frequency.value = freqs[i];
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.6);
                g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
            }
        }

        // Fibonacci tone modulator \u2014 at each Fibonacci-second mark from
        //    audio start, the synth bed steps to the next note of a D minor
        //    pentatonic scale (D F G A C). String/brass filters sweep to
        //    track the new fundamental so the timbre shifts with the pitch.
        //    The MP3 score remains the harmonic anchor; this rides under it
        //    on a phi-spaced cadence so the music never sits still.
        const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
        const PENT = [0, 3, 5, 7, 10]; // D minor pentatonic in semitones
        const tAudio0 = ctx.currentTime;
        FIB.forEach(function (sec, idx) {
            const t = tAudio0 + sec;
            const semis = PENT[idx % PENT.length];
            const cents = semis * 100;
            // Soft pitch shift on the sub drone (preserves base detune).
            try { o1.detune.setTargetAtTime(cents - 7, t, 0.7); } catch (_) { }
            try { o2.detune.setTargetAtTime(cents + 7, t, 0.7); } catch (_) { }
            try { o3.detune.setTargetAtTime(cents, t, 0.7); } catch (_) { }
            // Filter sweeps track the new fundamental.
            try { lp.frequency.setTargetAtTime(180 + semis * 24, t, 0.9); } catch (_) { }
            try { stringFilter.frequency.setTargetAtTime(900 + semis * 90, t, 1.1); } catch (_) { }
            try { brassFilter.frequency.setTargetAtTime(700 + semis * 60, t, 0.9); } catch (_) { }
            // Heartbeat hit on every Fibonacci tick so the cadence reads.
            try { kick(t, 95 + semis * 2, 38 + semis, 0.18); } catch (_) { }
        });

        return {
            kill() {
                try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.4); } catch (_) { }
                setTimeout(() => {
                    try {
                        o1.stop(); o2.stop(); o3.stop();
                        stringOsc.forEach(o => { try { o.stop(); } catch (_) { } });
                        br1.stop(); br2.stop(); br3.stop();
                        c1.stop(); c2.stop(); c3.stop(); c4.stop();
                        lfo.stop(); ctx.close();
                    } catch (_) { }
                }, 800);
            },
            mood(name) {
                const t = ctx.currentTime;
                if (name === 'drone') {
                    droneGain.gain.setTargetAtTime(0.18, t, 1.0); lp.frequency.setTargetAtTime(220, t, 1.0);
                    stringGain.gain.setTargetAtTime(0.07, t, 2.0); stringFilter.frequency.setTargetAtTime(900, t, 2.0);
                    choirGain.gain.setTargetAtTime(0.05, t, 2.5);
                    brassGain.gain.setTargetAtTime(0.0, t, 1.0);
                }
                else if (name === 'rise') {
                    droneGain.gain.setTargetAtTime(0.22, t, 1.5); lp.frequency.setTargetAtTime(420, t, 1.5);
                    stringGain.gain.setTargetAtTime(0.20, t, 2.5); stringFilter.frequency.setTargetAtTime(2200, t, 3.0);
                    choirGain.gain.setTargetAtTime(0.12, t, 3.0);
                    brassGain.gain.setTargetAtTime(0.06, t, 2.0);
                }
                else if (name === 'hold') {
                    droneGain.gain.setTargetAtTime(0.16, t, 1.0);
                    stringGain.gain.setTargetAtTime(0.16, t, 1.5);
                    choirGain.gain.setTargetAtTime(0.10, t, 1.5);
                }
                else if (name === 'shift') {
                    kick(t + 0.05); kick(t + 0.55);
                    stringGain.gain.setTargetAtTime(0.04, t, 0.4);
                    choirGain.gain.setTargetAtTime(0.02, t, 0.4);
                }
                else if (name === 'menace') {
                    droneGain.gain.setTargetAtTime(0.30, t, 0.8); lp.frequency.setTargetAtTime(180, t, 0.8);
                    stringGain.gain.setTargetAtTime(0.22, t, 1.0); stringFilter.frequency.setTargetAtTime(900, t, 1.0);
                    brassGain.gain.setTargetAtTime(0.16, t, 0.6);
                    choirGain.gain.setTargetAtTime(0.14, t, 1.0);
                    timpani(t + 0.10, 55); hit(t + 0.6); timpani(t + 1.4, 49); hit(t + 2.2);
                    brassStab(t + 0.30, [73.42, 110, 146.83], 1.8);
                }
                else if (name === 'charge') {
                    droneGain.gain.setTargetAtTime(0.30, t, 0.4); lp.frequency.setTargetAtTime(900, t, 0.6);
                    stringGain.gain.setTargetAtTime(0.28, t, 0.8); stringFilter.frequency.setTargetAtTime(2800, t, 1.0);
                    brassGain.gain.setTargetAtTime(0.20, t, 0.4);
                    choirGain.gain.setTargetAtTime(0.18, t, 1.0);
                    timpani(t + 0.05, 65); timpani(t + 0.6, 65); timpani(t + 1.2, 73); timpani(t + 1.8, 87);
                    brassStab(t + 0.05, [110, 146.83, 220], 0.8);
                    brassStab(t + 1.2, [146.83, 220, 293.66], 1.0);
                }
                else if (name === 'reveal') {
                    // Hive reveal \u2014 ominous slow build, low choir, sub timpani heartbeat.
                    droneGain.gain.setTargetAtTime(0.36, t, 0.8); lp.frequency.setTargetAtTime(140, t, 1.2);
                    stringGain.gain.setTargetAtTime(0.26, t, 2.0); stringFilter.frequency.setTargetAtTime(700, t, 2.0);
                    brassGain.gain.setTargetAtTime(0.24, t, 1.5);
                    choirGain.gain.setTargetAtTime(0.30, t, 2.5);
                    for (let i = 0; i < 6; i++) timpani(t + 0.5 + i * 1.1, 41);
                    brassStab(t + 0.4, [55, 73.42, 87.31], 4.0);
                }
            },
            swell() {
                const t = ctx.currentTime;
                timpani(t, 49); kick(t, 95, 35, 0.85); hit(t + 0.05);
                chord(t + 0.1, [110, 165, 220, 277, 330], 4.0);
                chord(t + 0.1, [55, 82.5], 4.2);
                brassStab(t + 0.15, [220, 293.66, 369.99, 440], 3.0);
                timpani(t + 1.4, 49); timpani(t + 2.6, 55);
            }
        };
    }

    // ── Sequencer: walk the timeline, fire mood/text/motif transitions
    //    at the right beat, resolve when the title-card hand-off lands. ──
    function play(opts) {
        opts = opts || {};
        if (!opts.force && !shouldAutoplay()) {
            if (opts.onComplete) opts.onComplete();
            return Promise.resolve('skipped-noplay');
        }
        return new Promise((resolve) => {
            ensureFonts();
            const root = buildOverlay();
            const stars = root.querySelector('#sf-intro-stars');
            const motif = root.querySelector('#sf-intro-motif');
            const canvas3d = root.querySelector('#sf-intro-3d');
            const text = root.querySelector('#sf-intro-text');
            const title = root.querySelector('#sf-intro-title');
            const skip = root.querySelector('#sf-intro-skip');

            const state = {
                warp: 0.05, killed: false,
                motif: 'void', motifPrev: null, motifT: 1,
                scene3d: null, scene3dActive: false, scene3dStartAge: 0,
                _t0: performance.now()
            };
            startStarfield(stars, state);
            startMotifs(motif, state);
            const scene3D = start3D(canvas3d, state);
            const audio = startAudio(state);

            // Show letterbox bars after a tiny beat
            setTimeout(() => root.classList.add('lb'), 80);

            let cancelled = false;
            const startedAt = performance.now();
            const timers = [];
            function later(ms, fn) { const id = setTimeout(fn, ms); timers.push(id); return id; }

            function setMotif(name) {
                if (state.motif === name) return;
                state.motifPrev = state.motif;
                state.motif = name || 'void';
                state.motifT = 0;
                // Mirror the active motif into the 3D layer for hero
                // models. Anything not in this set leaves the 3D layer
                // dark and lets the 2D motif play full-strength.
                const want3D = (name === 'baseship' || name === 'hive' || name === 'hiveReveal') ? name : null;
                if (state.scene3d !== want3D) {
                    state.scene3d = want3D;
                    state.scene3dStartAge = (performance.now() - (state._t0 || performance.now())) / 1000;
                }
            }
            function setLine(s) {
                text.classList.remove('on');
                later(420, () => {
                    text.querySelector('span').textContent = s;
                    if (s) text.classList.add('on');
                });
            }
            function moodFor(name) {
                if (name === 'rise' || name === 'charge') state.warp = 0.45;
                else if (name === 'menace') state.warp = 0.25;
                else if (name === 'swell') state.warp = 0.85;
                else if (name === 'reveal') state.warp = 0.04;
                else state.warp = 0.08;
                audio.mood(name);
            }

            // Schedule each timeline beat
            T.forEach((b) => {
                later(b.at * 1000, () => {
                    if (cancelled) return;
                    moodFor(b.mood);
                    setMotif(b.motif);
                    if (b.line) setLine(b.line); else setLine('');
                });
                // hide line near the end of each beat to keep transitions clean
                later((b.at + b.dur) * 1000, () => {
                    if (cancelled) return;
                    if (b.line) text.classList.remove('on');
                });
            });

            // Title card swell \u2014 fires at the start of the title beat.
            later(95.0 * 1000, () => {
                if (cancelled) return;
                setMotif('void');
                title.classList.add('on');
                audio.swell();
            });

            // Hand-off: fade everything to black, dismiss
            later(TOTAL * 1000, () => finish('complete'));

            function finish(reason) {
                if (cancelled) return;
                cancelled = true;
                state.killed = true;
                timers.forEach(clearTimeout);
                root.classList.add('fadeout');
                audio.kill();
                markSeen();
                setTimeout(() => {
                    try { root.remove(); } catch (_) { }
                    document.removeEventListener('keydown', onKey, true);
                    if (opts.onComplete) try { opts.onComplete(reason); } catch (_) { }
                    resolve(reason);
                }, 950);
            }

            function onKey(e) {
                // any key skips; keep Enter/Space from also activating UI underneath
                e.preventDefault(); e.stopPropagation();
                finish('skipped-key');
            }
            document.addEventListener('keydown', onKey, true);
            skip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); finish('skipped-button'); });
        });
    }

    // ── Public surface ────────────────────────────────────────────────────
    window.SFIntro = { play, hasSeen, markSeen, shouldAutoplay, TOTAL };

    // ── Auto-bootstrap on first launch.  Plays the prologue *during*
    //    asset preload so the player isn't staring at a spinner: we hide
    //    the loading screen for the duration of the intro and only put it
    //    back if SF3D hasn't finished loading by the time the prologue
    //    ends (or is skipped).  If everything is ready, the game starts
    //    immediately when the intro fades out. ──────────────────────────
    function assetsReady() {
        try { return !!(window.SF3D && window.SF3D.isReady && window.SF3D.isReady()); }
        catch (_) { return false; }
    }
    // Mirrors the boot guard in index.html: only the play page (mode/code/
    // session) calls Starfighter.init(). On the landing page SF3D never
    // initializes, so restoring the spinner would hang it forever.
    function isPlayPage() {
        try {
            const qp = new URLSearchParams(location.search);
            return qp.has('mode') || qp.has('code') || qp.has('session');
        } catch (_) { return false; }
    }
    function autoBoot() {
        if (!shouldAutoplay()) return;
        const ls = document.getElementById('loading-screen');
        const lsDisplay = ls ? ls.style.display : null;
        if (ls) ls.style.display = 'none';
        // Defer one frame so other DOMContentLoaded handlers (incl. the
        // bundle's preload kickoff) can run first — the prologue then
        // plays in parallel with the GLB downloads.
        requestAnimationFrame(() => {
            play({ force: FORCE_URL }).then(() => {
                if (!ls) return;
                if (!isPlayPage()) {
                    // Landing page: no game is loading, leave spinner hidden
                    // so the underlying landing UI stays interactive.
                    ls.style.display = 'none';
                    return;
                }
                if (assetsReady()) {
                    // Game is fully loaded — leave the spinner hidden so
                    // the player drops straight into the bay.
                    ls.style.display = 'none';
                    return;
                }
                // Still loading: restore the spinner so the bundle's
                // existing progress UI (loading-bar / loading-pct /
                // loading-text) takes over until SF3D fires its ready
                // callback and removes it.
                ls.style.display = lsDisplay || 'flex';
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoBoot);
    } else {
        autoBoot();
    }
})();
