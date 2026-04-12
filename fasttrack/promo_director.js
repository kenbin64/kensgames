// ============================================================
// FAST TRACK — 60-SECOND CINEMATIC PROMOTIONAL VIDEO DIRECTOR
// ============================================================
// Loads via ?promo=1 URL parameter on 3d.html
//
// Full cinematic with:
//   - ACTUAL scripted gameplay (multi-hop peg movements)
//   - Dramatic camera pans following the action
//   - Movie-trailer style voiceover (Web Speech API)
//   - Theme montage showcasing all worlds
//   - Dramatic crescendo ending
//
// Records Three.js canvas → WebM via MediaRecorder.
// Convert: ffmpeg -i promo.webm -c:v libx264 -preset slow -crf 18 promo.mp4
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CFG = {
        duration: 62000,
        fps: 60,
        width: 1920,
        height: 1080,
        autoRecord: false,
        showControls: true,
    };

    // ============================================================
    // BOARD LAYOUT HELPERS — Know the track for scripted moves
    // ============================================================
    // Clockwise track per section (14 holes):
    //   side-left-{p}-1..4, outer-{p}-0..3, home-{p}, side-right-{p}-4..1, ft-{next}
    //   Total: 84 holes around the board

    function buildTrack() {
        const t = [];
        for (let p = 0; p < 6; p++) {
            for (let h = 1; h <= 4; h++) t.push(`side-left-${p}-${h}`);
            for (let h = 0; h < 4; h++) t.push(`outer-${p}-${h}`);
            t.push(`home-${p}`);
            for (let h = 4; h >= 1; h--) t.push(`side-right-${p}-${h}`);
            t.push(`ft-${(p + 1) % 6}`);
        }
        return t;
    }

    const TRACK = buildTrack();

    function trackIndexOf(holeId) {
        return TRACK.indexOf(holeId);
    }

    // Get a slice of hole IDs from startHole forward by N steps
    function getPathForward(startHoleId, steps) {
        const idx = trackIndexOf(startHoleId);
        if (idx === -1) return [startHoleId];
        const path = [];
        for (let i = 1; i <= steps; i++) {
            path.push(TRACK[(idx + i) % TRACK.length]);
        }
        return path;
    }

    // ============================================================
    // OVERLAY SYSTEM — Cinematic text overlays
    // ============================================================
    let overlayContainer = null;

    function createOverlay() {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'promo-overlay';
        overlayContainer.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none; z-index: 99999;
            font-family: 'Segoe UI', Arial, sans-serif;
            overflow: hidden;
        `;
        document.body.appendChild(overlayContainer);
    }

    function showTitle(text, opts = {}) {
        const {
            size = 72, color = '#FFD700', shadow = true,
            y = 'center',
            enterDuration = 600, holdDuration = 2000, exitDuration = 400,
            enterAnim = 'scaleUp', subText = null, subSize = 32, subColor = '#ffffff',
            letterSpacing = '0.15em', fontWeight = 900,
            bg = null, italic = false,
        } = opts;

        return new Promise(resolve => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                position: absolute; width: 100%;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                ${y === 'center' ? 'top: 50%; transform: translateY(-50%);' : ''}
                ${y === 'top' ? 'top: 6%;' : ''}
                ${y === 'bottom' ? 'bottom: 10%;' : ''}
                opacity: 0;
                transition: opacity ${enterDuration}ms ease-out, transform ${enterDuration}ms ease-out;
                ${bg ? `background: ${bg}; padding: 30px 0;` : ''}
            `;

            const titleEl = document.createElement('div');
            titleEl.textContent = text;
            titleEl.style.cssText = `
                font-size: ${size}px; font-weight: ${fontWeight}; color: ${color};
                letter-spacing: ${letterSpacing}; text-transform: uppercase;
                ${italic ? 'font-style: italic;' : ''}
                ${shadow ? `text-shadow: 0 0 40px ${color}88, 0 4px 20px rgba(0,0,0,0.8), 0 0 80px ${color}44;` : ''}
            `;

            if (enterAnim === 'scaleUp') {
                titleEl.style.transform = 'scale(0.5)';
                titleEl.style.transition = `transform ${enterDuration}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${enterDuration}ms ease-out`;
            } else if (enterAnim === 'slideRight') {
                titleEl.style.transform = 'translateX(-120px)';
                titleEl.style.transition = `transform ${enterDuration}ms ease-out, opacity ${enterDuration}ms ease-out`;
            } else if (enterAnim === 'slideUp') {
                titleEl.style.transform = 'translateY(60px)';
                titleEl.style.transition = `transform ${enterDuration}ms ease-out, opacity ${enterDuration}ms ease-out`;
            } else if (enterAnim === 'slideLeft') {
                titleEl.style.transform = 'translateX(120px)';
                titleEl.style.transition = `transform ${enterDuration}ms ease-out, opacity ${enterDuration}ms ease-out`;
            }

            wrapper.appendChild(titleEl);

            if (subText) {
                const subEl = document.createElement('div');
                subEl.textContent = subText;
                subEl.style.cssText = `
                    font-size: ${subSize}px; color: ${subColor}; margin-top: 14px;
                    letter-spacing: 0.25em; text-transform: uppercase; font-weight: 300;
                    opacity: 0; transition: opacity ${enterDuration + 300}ms ease-out;
                `;
                wrapper.appendChild(subEl);
                setTimeout(() => { subEl.style.opacity = '1'; }, 300);
            }

            overlayContainer.appendChild(wrapper);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    wrapper.style.opacity = '1';
                    titleEl.style.transform = 'scale(1) translateX(0) translateY(0)';
                });
            });

            setTimeout(() => {
                wrapper.style.transition = `opacity ${exitDuration}ms ease-in`;
                wrapper.style.opacity = '0';
                setTimeout(() => { wrapper.remove(); resolve(); }, exitDuration);
            }, enterDuration + holdDuration);
        });
    }

    function fadeBlack(duration = 500) {
        return new Promise(resolve => {
            const fade = document.createElement('div');
            fade.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: black; z-index: 99998;
                opacity: 0; transition: opacity ${duration}ms ease-in-out;
            `;
            document.body.appendChild(fade);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => { fade.style.opacity = '1'; });
            });
            setTimeout(() => resolve(fade), duration);
        });
    }

    function fadeIn(fadeEl, duration = 500) {
        return new Promise(resolve => {
            if (!fadeEl) { resolve(); return; }
            fadeEl.style.transition = `opacity ${duration}ms ease-in-out`;
            fadeEl.style.opacity = '0';
            setTimeout(() => { fadeEl.remove(); resolve(); }, duration);
        });
    }

    function showLetterbox(h = 54) {
        ['top', 'bot'].forEach(pos => {
            const bar = document.createElement('div');
            bar.id = `promo-letterbox-${pos}`;
            bar.style.cssText = `
                position: fixed; left: 0; width: 100%; height: ${h}px; background: black;
                z-index: 99997; transition: height 0.8s ease;
                ${pos === 'top' ? 'top: 0;' : 'bottom: 0;'}
            `;
            document.body.appendChild(bar);
        });
    }

    function hideLetterbox() {
        ['top', 'bot'].forEach(pos => {
            const el = document.getElementById(`promo-letterbox-${pos}`);
            if (el) { el.style.height = '0'; setTimeout(() => el.remove(), 800); }
        });
    }

    function flashImpact(color = '#FFD700', duration = 150) {
        const f = document.createElement('div');
        f.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: ${color}; z-index: 99998; opacity: 0.6;
            transition: opacity ${duration}ms ease-out;
        `;
        document.body.appendChild(f);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { f.style.opacity = '0'; });
        });
        setTimeout(() => f.remove(), duration + 50);
    }

    // Vignette for cinematic mood
    function showVignette() {
        const v = document.createElement('div');
        v.id = 'promo-vignette';
        v.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%);
            z-index: 99996; pointer-events: none;
        `;
        document.body.appendChild(v);
    }

    function hideVignette() {
        const v = document.getElementById('promo-vignette');
        if (v) v.remove();
    }

    // ============================================================
    // VOICEOVER — Web Speech API trailer-style narration
    // ============================================================

    let voiceReady = false;
    let preferredVoice = null;

    function initVoice() {
        return new Promise(resolve => {
            const synth = window.speechSynthesis;
            if (!synth) { resolve(); return; }

            function pickVoice() {
                const voices = synth.getVoices();
                // Prefer a deep English male voice
                const prefs = [
                    v => v.name.includes('Daniel') && v.lang.startsWith('en'),
                    v => v.name.includes('David') && v.lang.startsWith('en'),
                    v => v.name.includes('James') && v.lang.startsWith('en'),
                    v => v.name.includes('Google UK English Male'),
                    v => v.name.includes('Male') && v.lang.startsWith('en'),
                    v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('male'),
                    v => v.lang.startsWith('en'),
                ];
                for (const pred of prefs) {
                    const match = voices.find(pred);
                    if (match) { preferredVoice = match; break; }
                }
                if (!preferredVoice && voices.length > 0) {
                    preferredVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
                }
                voiceReady = true;
                resolve();
            }

            if (synth.getVoices().length > 0) {
                pickVoice();
            } else {
                synth.onvoiceschanged = pickVoice;
                setTimeout(resolve, 2000);
            }
        });
    }

    function speak(text, rate = 0.85, pitch = 0.7) {
        return new Promise(resolve => {
            const synth = window.speechSynthesis;
            if (!synth || !voiceReady) { resolve(); return; }
            synth.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            if (preferredVoice) utter.voice = preferredVoice;
            utter.rate = rate;
            utter.pitch = pitch;
            utter.volume = 1.0;
            utter.onend = resolve;
            utter.onerror = resolve;
            synth.speak(utter);
        });
    }

    // Fire-and-forget (don't await completion)
    function speakAsync(text, rate = 0.85, pitch = 0.7) {
        speak(text, rate, pitch);
    }

    // ============================================================
    // CAMERA HELPERS
    // ============================================================

    function camMove(pos, lookAt, duration = 2500) {
        return new Promise(resolve => {
            if (typeof window.resetCameraOverride === 'function') window.resetCameraOverride();
            if (typeof window.smoothCameraTransition === 'function') {
                window.smoothCameraTransition(pos, lookAt, duration, resolve);
            } else {
                setTimeout(resolve, duration);
            }
        });
    }

    function camSet(pos, lookAt) {
        return camMove(pos, lookAt, 50);
    }

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ============================================================
    // PEG ANIMATION — Scripted multi-hop movement
    // ============================================================

    // Move a peg one hop (hole to hole) with arc animation
    function hop(pegId, toHoleId, duration = 300) {
        return new Promise(resolve => {
            const peg = window.pegRegistry?.get(pegId);
            const toHole = window.holeRegistry?.get(toHoleId);
            if (!peg || !peg.mesh || !toHole) { resolve(); return; }

            const sx = peg.mesh.position.x, sz = peg.mesh.position.z;
            const ey = peg.mesh.position.y;
            const ex = toHole.position.x, ez = toHole.position.z;
            const arc = 30;
            const t0 = performance.now();

            function anim(now) {
                const t = Math.min((now - t0) / duration, 1);
                const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                peg.mesh.position.x = sx + (ex - sx) * e;
                peg.mesh.position.z = sz + (ez - sz) * e;
                peg.mesh.position.y = ey + arc * Math.sin(e * Math.PI);
                if (t < 1) requestAnimationFrame(anim);
                else { peg.mesh.position.set(ex, ey, ez); peg.currentHole = toHoleId; resolve(); }
            }
            requestAnimationFrame(anim);
        });
    }

    // Multi-hop through a list of holes
    async function multiHop(pegId, holeIds, hopTime = 200) {
        for (const holeId of holeIds) {
            await hop(pegId, holeId, hopTime);
        }
    }

    // Move peg along the outer track from a hole by N steps
    async function moveForward(pegId, fromHoleId, steps, hopTime = 200) {
        const path = getPathForward(fromHoleId, steps);
        await multiHop(pegId, path, hopTime);
        return path[path.length - 1];
    }

    // Send a peg "home" with dramatic float + travel animation
    async function sendPegHome(pegId, holdingHoleId) {
        const peg = window.pegRegistry?.get(pegId);
        if (!peg || !peg.mesh) return;

        // Rise up dramatically
        const startY = peg.mesh.position.y;
        const t0 = performance.now();
        await new Promise(resolve => {
            function anim(now) {
                const t = Math.min((now - t0) / 400, 1);
                peg.mesh.position.y = startY + 60 * t;
                if (t < 1) requestAnimationFrame(anim); else resolve();
            }
            requestAnimationFrame(anim);
        });

        // Quick travel to holding
        await hop(pegId, holdingHoleId, 500);
    }

    // Winning celebration — peg rises and spins
    async function winCelebration(pegId) {
        const peg = window.pegRegistry?.get(pegId);
        if (!peg || !peg.mesh) return;

        const startY = peg.mesh.position.y;
        const t0 = performance.now();
        await new Promise(resolve => {
            function anim(now) {
                const t = Math.min((now - t0) / 2000, 1);
                peg.mesh.position.y = startY + 80 * Math.sin(t * Math.PI);
                peg.mesh.rotation.y += 0.15;
                if (t < 1) requestAnimationFrame(anim);
                else { peg.mesh.position.y = startY; resolve(); }
            }
            requestAnimationFrame(anim);
        });
    }

    // Get hole world position
    function holePos(holeId) {
        const h = window.holeRegistry?.get(holeId);
        if (!h) return { x: 0, y: 0, z: 0 };
        return h.position || { x: 0, y: 0, z: 0 };
    }

    // ============================================================
    // RECORDING SYSTEM
    // ============================================================
    let mediaRecorder = null;
    let recordedChunks = [];
    let compositeCanvas = null;
    let compositeCtx = null;
    let isRecording = false;

    function setupRecording() {
        compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = CFG.width;
        compositeCanvas.height = CFG.height;
        compositeCtx = compositeCanvas.getContext('2d');

        const glCanvas = document.querySelector('#container canvas');
        if (!glCanvas) { console.error('[Promo] No WebGL canvas'); return false; }

        function compositeFrame() {
            if (!isRecording) return;
            compositeCtx.drawImage(glCanvas, 0, 0, CFG.width, CFG.height);
            requestAnimationFrame(compositeFrame);
        }

        const stream = compositeCanvas.captureStream(CFG.fps);

        try {
            if (window.MusicSubstrate && MusicSubstrate.audioContext) {
                const dest = MusicSubstrate.audioContext.createMediaStreamDestination();
                MusicSubstrate.masterGain.connect(dest);
                stream.addTrack(dest.stream.getAudioTracks()[0]);
            }
        } catch(e) {}

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 10000000
        });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'fasttrack_promo_60s.webm'; a.click();
            console.log('[Promo] Saved!', (blob.size/1048576).toFixed(1), 'MB');
            showComplete(url);
        };

        isRecording = true;
        compositeFrame();
        mediaRecorder.start();
        return true;
    }

    function stopRecording() {
        isRecording = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    }

    function showComplete(url) {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:rgba(0,0,0,0.95);color:white;padding:40px;border-radius:16px;
            z-index:100000;text-align:center;font-family:sans-serif;border:2px solid #FFD700;`;
        d.innerHTML = `
            <h2 style="color:#FFD700;margin:0 0 16px">🎬 Promo Complete!</h2>
            <p>WebM downloaded. Convert:</p>
            <code style="display:block;background:#222;padding:12px;border-radius:8px;margin:12px 0;color:#0f0;font-size:13px;">
                ffmpeg -i fasttrack_promo_60s.webm -c:v libx264 -preset slow -crf 18 -c:a aac fasttrack_promo.mp4
            </code>
            <button onclick="this.parentElement.remove()" style="background:#FFD700;color:black;border:none;
                padding:12px 32px;border-radius:8px;font-size:16px;cursor:pointer;font-weight:bold;">Close</button>`;
        document.body.appendChild(d);
    }

    // ============================================================
    // HIDE GAME UI
    // ============================================================

    function hideGameUI() {
        const ids = [
            'start-game-screen', 'hamburger-menu', 'player-panels',
            'mobile-action-bar', 'settings-panel', 'camera-panel',
            'card-draw-area', 'mom-intro-modal', 'debug-panel',
            'turn-banner', 'card-rule-popup',
        ];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        document.querySelectorAll('.hamburger-btn, .menu-btn, .settings-btn, .card-container, .move-announcement').forEach(el => {
            el.style.display = 'none';
        });
    }

    function showGameUI() {
        const s = document.getElementById('start-game-screen');
        if (s) s.style.display = '';
    }

    // ============================================================
    // CONTROL BAR
    // ============================================================

    function createControlBar() {
        const bar = document.createElement('div');
        bar.id = 'promo-controls';
        bar.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,0.9);padding:14px 28px;border-radius:12px;z-index:100001;
            display:flex;gap:14px;align-items:center;border:1px solid #FFD700;font-family:sans-serif;`;
        const bs = `background:#FFD700;color:black;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;`;
        bar.innerHTML = `
            <span style="color:#FFD700;font-weight:bold;margin-right:8px">🎬 PROMO DIRECTOR</span>
            <button style="${bs}" onclick="window.PromoDirector.run()">▶ Preview</button>
            <button style="${bs}" onclick="window.PromoDirector.runAndRecord()">⏺ Record</button>
            <span id="promo-timer" style="color:white;font-size:14px;min-width:60px">00:00</span>`;
        document.body.appendChild(bar);
    }

    // ============================================================
    // ===  THE 60-SECOND CINEMATIC SEQUENCE  =====================
    // ============================================================
    //
    // ACT I   (0-10s)  : THE HOOK — Logo, board reveal, opening line
    // ACT II  (10-20s) : THE WORLDS — Quick-cut theme showcase
    // ACT III (20-42s) : THE GAMEPLAY — Enter board, advance, FastTrack, capture
    // ACT IV  (42-52s) : THE CRESCENDO — Safe zone race, victory
    // ACT V   (52-60s) : THE SPLASH — Call to action, grand finale
    //
    // ============================================================

    async function runPromo(withRecording = false) {
        console.log('[Promo] Starting 60s cinematic sequence...');

        // Init voice
        await initVoice();

        // Manual camera
        if (typeof window.setCameraViewMode === 'function') window.setCameraViewMode('manual');

        hideGameUI();
        if (!overlayContainer) createOverlay();
        overlayContainer.innerHTML = '';
        showLetterbox(54);
        showVignette();

        // Init 4-player game
        if (typeof window.initGame === 'function') window.initGame(4);
        await wait(600);
        hideGameUI();

        // Start music
        try {
            if (window.MusicSubstrate) { MusicSubstrate.activate(); MusicSubstrate.play('cosmic'); }
        } catch(e) {}

        // Start recording after first render
        if (withRecording) { await wait(100); setupRecording(); }

        // Timer
        const timerEl = document.getElementById('promo-timer');
        const ctrlBar = document.getElementById('promo-controls');
        if (ctrlBar) ctrlBar.style.display = 'none';
        const startMs = Date.now();
        const timerInterval = setInterval(() => {
            if (timerEl) {
                const s = Math.floor((Date.now() - startMs) / 1000);
                timerEl.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
            }
        }, 250);

        // ========= Player board positions (4 players: 0,1,3,4) =========
        const bp = [0, 1, 3, 4]; // board positions for players 0-3

        // Peg ID helpers — peg-{boardPos}-4 starts on home, peg-{boardPos}-0..3 in holding
        const homePeg = (pi) => `peg-${bp[pi]}-4`;
        const holdPeg = (pi, n) => `peg-${bp[pi]}-${n}`;

        // ================================================================
        // ACT I — THE HOOK (0–10s)
        // ================================================================

        // 0s: Black screen
        const black1 = await fadeBlack(50);
        if (typeof window.setTheme === 'function') window.setTheme('cosmic');
        await wait(400);

        // 0.5s: Title card
        showTitle('FAST TRACK', {
            size: 100, color: '#FFD700', y: 'center',
            enterDuration: 1000, holdDuration: 2800, exitDuration: 600,
            enterAnim: 'scaleUp', letterSpacing: '0.35em',
            subText: '♠  ♥  ♦  ♣', subSize: 48, subColor: '#ffffff',
        });
        speakAsync("Every family game night needs a champion.", 0.82, 0.6);
        await wait(3800);

        // 4.3s: Reveal the board — epic sweep from above
        await fadeIn(black1, 1200);
        await camSet({ x: 0, y: 900, z: 10 }, { x: 0, y: 0, z: 0 });

        // Descending sweep
        camMove(
            { x: 180, y: 280, z: 380 },
            { x: 0, y: 0, z: 0 },
            4000
        );
        await wait(1200);
        speakAsync("This is Fast Track.", 0.8, 0.6);
        await wait(2800);

        // 8.3s: Slow orbit, set the stage
        showTitle('Strategy  •  Speed  •  Sabotage', {
            size: 36, color: '#FFD700', y: 'bottom',
            enterDuration: 500, holdDuration: 2000, exitDuration: 400,
            enterAnim: 'slideUp', letterSpacing: '0.3em',
        });
        await camMove(
            { x: -200, y: 250, z: 360 },
            { x: 0, y: 0, z: 0 },
            2500
        );

        // ================================================================
        // ACT II — THE WORLDS (10–20s)
        // ================================================================

        speakAsync("Seven worlds. Infinite strategy.", 0.85, 0.6);
        await wait(500);

        const themes = [
            { name: 'colosseum', label: 'COLOSSEUM',  color: '#CD853F', angle: 0 },
            { name: 'spaceace',  label: 'SPACE ACE',   color: '#00CCFF', angle: Math.PI * 0.5 },
            { name: 'undersea',  label: 'DEEP SEA',    color: '#00CED1', angle: Math.PI },
            { name: 'fibonacci', label: 'FIBONACCI',   color: '#FFD700', angle: Math.PI * 1.5 },
            { name: 'cosmic',    label: 'COSMIC',      color: '#9B59B6', angle: Math.PI * 0.25 },
        ];

        for (let i = 0; i < themes.length; i++) {
            const th = themes[i];
            flashImpact(th.color, 200);
            if (typeof window.setTheme === 'function') window.setTheme(th.name);

            showTitle(th.label, {
                size: 54, color: th.color, y: 'center',
                enterDuration: 200, holdDuration: 1100, exitDuration: 200,
                enterAnim: i % 2 === 0 ? 'slideRight' : 'slideLeft',
                letterSpacing: '0.2em',
            });

            const r = 340;
            await camMove(
                { x: Math.sin(th.angle) * r, y: 220 + (i % 2) * 80, z: Math.cos(th.angle) * r },
                { x: 0, y: 0, z: 0 },
                1300
            );
            await wait(300);
        }

        // Reset to cosmic for gameplay
        if (typeof window.setTheme === 'function') window.setTheme('cosmic');
        await wait(200);

        // ================================================================
        // ACT III — THE GAMEPLAY (20–42s)
        // ================================================================

        // ---- SCENE 1: ENTERING THE BOARD (20–25s) ----

        speakAsync("Draw a card. Enter the board. The race begins.", 0.82, 0.6);

        // Focus on Player 0's home area
        const hp0 = holePos(`home-${bp[0]}`);
        await camMove(
            { x: hp0.x * 0.5 + 30, y: 170, z: hp0.z * 0.5 + 100 },
            { x: hp0.x, y: 0, z: hp0.z },
            1800
        );

        // Move a peg from holding to home
        const p0peg = holdPeg(0, 0);
        await hop(p0peg, `home-${bp[0]}`, 600);
        await wait(300);

        // Advance 7 steps along the outer track — camera follows
        let p0current = `home-${bp[0]}`;
        const path1 = getPathForward(p0current, 7);
        const midDest = holePos(path1[3]);
        camMove(
            { x: midDest.x * 0.5, y: 180, z: midDest.z * 0.5 + 90 },
            { x: midDest.x, y: 0, z: midDest.z },
            2000
        );
        await multiHop(p0peg, path1, 180);
        p0current = path1[path1.length - 1];
        await wait(400);

        // ---- SCENE 2: OPPONENT ENTERS (25–29s) ----

        speakAsync("But watch your back.", 0.82, 0.6);

        // Player 1 enters and advances
        const hp1 = holePos(`home-${bp[1]}`);
        await camMove(
            { x: hp1.x * 0.5 + 30, y: 180, z: hp1.z * 0.5 + 100 },
            { x: hp1.x, y: 0, z: hp1.z },
            1200
        );

        const p1peg = holdPeg(1, 0);
        await hop(p1peg, `home-${bp[1]}`, 500);
        await wait(200);

        // Player 1 advances 5 steps
        const path2 = getPathForward(`home-${bp[1]}`, 5);
        const midDest2 = holePos(path2[2]);
        camMove(
            { x: midDest2.x * 0.5, y: 180, z: midDest2.z * 0.5 + 80 },
            { x: midDest2.x, y: 0, z: midDest2.z },
            1500
        );
        await multiHop(p1peg, path2, 180);
        let p1current = path2[path2.length - 1];
        await wait(200);

        // Player 2 enters too — brief
        const p2peg = holdPeg(2, 0);
        await hop(p2peg, `home-${bp[2]}`, 400);
        const path3 = getPathForward(`home-${bp[2]}`, 3);
        await multiHop(p2peg, path3, 160);
        await wait(400);

        // ---- SCENE 3: FAST TRACK! (29–35s) ----

        speakAsync("Take the Fast Track. Blaze across the board and leave everyone behind.", 0.82, 0.55);

        // Swing camera to the center of the board
        await camMove(
            { x: 0, y: 350, z: 180 },
            { x: 0, y: 0, z: 0 },
            1500
        );

        showTitle('FAST TRACK', {
            size: 64, color: '#FF6600', y: 'center',
            enterDuration: 300, holdDuration: 3000, exitDuration: 400,
            enterAnim: 'scaleUp', letterSpacing: '0.25em',
            subText: 'Shortcut Through the Center', subSize: 24, subColor: '#FFD700',
        });

        flashImpact('#FF6600', 250);
        if (typeof window.testFastTrack === 'function') window.testFastTrack();

        // Move Player 0 peg to its FT entry
        const ftEntry = `ft-${bp[0]}`;
        await hop(p0peg, ftEntry, 400);
        await wait(200);

        // Traverse FT holes dramatically (hopping through pentagon ring)
        const ftPath = [];
        for (let i = 1; i <= 3; i++) ftPath.push(`ft-${(bp[0] + i) % 6}`);

        // Camera tracks across the center
        const ftMid = holePos(ftPath[1]);
        camMove(
            { x: ftMid.x * 0.4, y: 200, z: ftMid.z * 0.4 + 80 },
            { x: ftMid.x, y: 0, z: ftMid.z },
            2200
        );
        await multiHop(p0peg, ftPath, 350);
        p0current = ftPath[ftPath.length - 1];
        await wait(400);

        // Exit FT onto the outer track ahead — skip forward dramatically
        const exitPath = getPathForward(p0current, 4);
        await multiHop(p0peg, exitPath, 200);
        p0current = exitPath[exitPath.length - 1];
        await wait(400);

        // ---- SCENE 4: THE CAPTURE (35–42s) ----

        // Move Player 0 to where Player 1 is sitting
        speakAsync("Land on your opponent. Send them home.", 0.8, 0.55);

        // Camera focuses on the victim
        const victimPos = holePos(p1current);
        await camMove(
            { x: victimPos.x * 0.5 + 40, y: 140, z: victimPos.z * 0.5 + 70 },
            { x: victimPos.x, y: 0, z: victimPos.z },
            1500
        );

        await wait(500);

        showTitle('SEND THEM HOME!', {
            size: 60, color: '#FF4444', y: 'center',
            enterDuration: 250, holdDuration: 3000, exitDuration: 400,
            enterAnim: 'scaleUp', letterSpacing: '0.2em',
        });

        // Attacker lands on victim
        await hop(p0peg, p1current, 400);
        p0current = p1current;
        await wait(200);

        // Impact!
        flashImpact('#FF0000', 300);
        if (typeof window.testSendHome === 'function') window.testSendHome();

        // Victim gets sent back
        await sendPegHome(p1peg, `hold-${bp[1]}-0`);
        await wait(800);

        speakAsync("No mercy.", 0.78, 0.5);
        await wait(1800);

        // ================================================================
        // ACT IV — THE CRESCENDO (42–52s)
        // ================================================================

        // Switch to colosseum for epic crescendo
        flashImpact('#FFD700', 200);
        if (typeof window.setTheme === 'function') window.setTheme('colosseum');
        await wait(300);

        speakAsync("Push through the safe zone. The finish line is calling.", 0.82, 0.5);

        // ---- SCENE 5: SAFE ZONE RACE ----

        const safePlayer = bp[0];
        const safePeg = homePeg(0); // Use the home peg for safe zone

        // Position peg at safe zone entry (scripted placement)
        await hop(safePeg, `safe-${safePlayer}-0`, 400);

        const szEntry = holePos(`safe-${safePlayer}-0`);
        await camMove(
            { x: szEntry.x * 0.5, y: 160, z: szEntry.z * 0.5 + 80 },
            { x: szEntry.x, y: 0, z: szEntry.z },
            1500
        );

        showTitle('THE FINAL STRETCH', {
            size: 50, color: '#FFD700', y: 'bottom',
            enterDuration: 400, holdDuration: 3800, exitDuration: 400,
            enterAnim: 'slideUp', letterSpacing: '0.2em',
        });

        // Dramatic safe zone traverse — one by one with suspense
        for (let s = 1; s <= 3; s++) {
            await hop(safePeg, `safe-${safePlayer}-${s}`, 400);
            await wait(250);
        }

        // Camera closes in
        const safeEnd = holePos(`safe-${safePlayer}-3`);
        await camMove(
            { x: safeEnd.x * 0.6, y: 120, z: safeEnd.z * 0.6 + 50 },
            { x: safeEnd.x, y: 0, z: safeEnd.z },
            1500
        );

        // Suspense pause
        speakAsync("One. More. Move.", 0.7, 0.5);
        await wait(2500);

        // ---- SCENE 6: VICTORY! ----

        // Last safe zone hole
        await hop(safePeg, `safe-${safePlayer}-4`, 500);
        await wait(300);

        // Winner hole!
        const winnerHoleId = `winner-${safePlayer}`;
        if (window.holeRegistry?.get(winnerHoleId)) {
            await hop(safePeg, winnerHoleId, 600);
        }

        // IMPACT!
        flashImpact('#FFD700', 400);
        await wait(100);
        flashImpact('#FFFFFF', 200);

        showTitle('VICTORY!', {
            size: 96, color: '#FFD700', y: 'center',
            enterDuration: 500, holdDuration: 4000, exitDuration: 600,
            enterAnim: 'scaleUp', letterSpacing: '0.3em',
            subText: '👑  CHAMPION  👑', subSize: 36, subColor: '#ffffff',
        });

        if (typeof window.testWinner === 'function') window.testWinner();
        try { if (window.FastTrackThemes) FastTrackThemes.triggerCrowdReaction('roaring'); } catch(e) {}

        speakAsync("VICTORY!", 0.7, 0.45);

        // Winner celebration + epic pull-out
        winCelebration(safePeg);
        await camMove(
            { x: 250, y: 500, z: 400 },
            { x: 0, y: 0, z: 0 },
            3500
        );
        await wait(1500);

        // ================================================================
        // ACT V — THE SPLASH (52–60s)
        // ================================================================

        // Quick theme energy burst
        const quickThemes = ['spaceace', 'cosmic', 'colosseum'];
        for (const t of quickThemes) {
            flashImpact('#FFD700', 100);
            if (typeof window.setTheme === 'function') window.setTheme(t);
            await wait(350);
        }

        speakAsync("Gather your family. Gather your friends. This is your game.", 0.82, 0.55);

        // Grand wide shot
        await camMove(
            { x: 0, y: 350, z: 450 },
            { x: 0, y: 0, z: 0 },
            2500
        );
        await wait(1500);

        // ---- FINAL SPLASH ----

        const splashFade = await fadeBlack(600);
        await wait(400);

        showTitle('PLAY FREE NOW', {
            size: 96, color: '#FFD700', y: 'center',
            enterDuration: 800, holdDuration: 4500, exitDuration: 1000,
            enterAnim: 'scaleUp', letterSpacing: '0.3em', fontWeight: 900,
            subText: 'kensgames.com/fasttrack', subSize: 40, subColor: '#ffffff',
        });

        speakAsync("Play free. Right now.", 0.72, 0.45);
        await wait(5500);

        // Logo end card
        overlayContainer.innerHTML = '';
        showTitle('FAST TRACK', {
            size: 56, color: '#FFD700', y: 'center',
            enterDuration: 600, holdDuration: 2200, exitDuration: 600,
            enterAnim: 'scaleUp', letterSpacing: '0.2em',
            subText: "by Ken's Games", subSize: 24, subColor: '#888',
        });

        await wait(3000);

        // ================================================================
        // CLEANUP
        // ================================================================

        clearInterval(timerInterval);
        hideLetterbox();
        hideVignette();

        if (withRecording) stopRecording();

        const ctrl = document.getElementById('promo-controls');
        if (ctrl) ctrl.style.display = 'flex';

        setTimeout(() => {
            if (overlayContainer) overlayContainer.innerHTML = '';
            if (splashFade) splashFade.remove();
            showGameUI();
        }, 1000);

        console.log('[Promo] Sequence complete!');
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    window.PromoDirector = {
        run: () => runPromo(false),
        runAndRecord: () => runPromo(true),
        stop: stopRecording,
        config: CFG,
    };

    // ============================================================
    // INIT
    // ============================================================

    function initPromo() {
        console.log('[Promo] Initializing...');
        createOverlay();
        if (CFG.showControls) createControlBar();
        console.log('[Promo] Ready! Click "Preview" or "Record"');
    }

    function waitForBoard() {
        if (window.boardReady || document.querySelector('#container canvas')) {
            setTimeout(initPromo, 500);
        } else {
            setTimeout(waitForBoard, 200);
        }
    }

    if (document.readyState === 'complete') waitForBoard();
    else window.addEventListener('load', waitForBoard);

})();
