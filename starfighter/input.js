/**
 * Starfighter Input
 * Mouse (Virtual Joystick), Keyboard, Gamepad API
 */

const SFInput = (function () {
    let player = null;
    const keys = {};
    let launchTriggered = false;
    let spacebarJustPressed = false;
    let lastInputDevice = 'keyboard'; // auto-detect: 'keyboard', 'gamepad', 'touch'

    // ── Mobile / Touch state ──
    let isMobile = false;

    // Nav sphere state (center thumb control)
    let navActive = false;
    let navTouchId = null;
    let navOriginX = 0, navOriginY = 0;
    let navDx = 0, navDy = 0;           // -1..1 normalized
    let navThrust = false;               // center push = thrust
    const NAV_MAX_R = 55;               // max pixel radius for full deflection
    const NAV_DEAD = 8;                 // pixel dead zone (center = thrust zone)

    // Touch action button tracking
    const touchBtns = {};               // id → held state

    function init(p) {
        player = p;

        window.addEventListener('keydown', e => {
            // If a UI button is focused, let the browser handle Tab/Enter/Space natively
            const focused = document.activeElement;
            const btnFocused = focused && (focused.classList.contains('console-btn') || focused.classList.contains('mob-btn') || focused.id === 'mob-calibrate');

            if (btnFocused) {
                // Tab — cycle to next button naturally
                if (e.code === 'Tab') return; // let browser handle
                // Enter/Space — activate the focused button, don't fire weapons
                if (e.code === 'Enter' || e.code === 'Space') return; // browser fires onclick
                // Escape — blur the button and re-engage pointer lock
                if (e.code === 'Escape') {
                    focused.blur();
                    e.preventDefault();
                    return;
                }
            }

            keys[e.code] = true;
            // Resume audio on first user gesture
            if (window.SFAudio) SFAudio.resume();

            // Tab — exit pointer lock and focus first visible UI button
            if (e.code === 'Tab') {
                e.preventDefault();
                if (document.pointerLockElement) document.exitPointerLock();
                const btns = Array.from(document.querySelectorAll('#console-buttons .console-btn')).filter(b => b.offsetParent !== null && b.style.display !== 'none');
                if (btns.length) btns[0].focus();
                lastInputDevice = 'keyboard';
            }
        });
        window.addEventListener('keyup', e => {
            // Don't register key-up for keys that were never set (button-focused bypass)
            keys[e.code] = false;
        });

        // Pointer Lock API for precise FPS-style mouse steering
        document.addEventListener('mousedown', e => {
            // Resume audio on first user gesture
            if (window.SFAudio) SFAudio.resume();

            // Ignore UI buttons — don't let them trigger pointer lock or fire weapons
            if (e.target.closest('#console-buttons, #mobile-hud, #mission-panel, #tutorial-panel, #launch-btn, #skip-launch-btn, #mob-calibrate, #fs-resume, #fs-resume-overlay, #tutorial-prompt-overlay, #tutorial-overlay') ||
                (e.target.classList && (e.target.classList.contains('action-btn') || e.target.classList.contains('mob-btn') || e.target.classList.contains('console-btn') || e.target.classList.contains('avtn-btn') || e.target.classList.contains('avtn-select')))) return;

            if (document.pointerLockElement !== document.body) {
                enterImmersive();
            } else {
                if (e.button === 0) window.Starfighter.fireLaser();   // Left click — primary
                if (e.button === 2) window.Starfighter.fireTorpedo(); // Right click — torpedo (GDD §10.1)
                if (e.button === 1) window.Starfighter.fireTorpedo(); // Middle click — torpedo alt
            }
        });

        document.addEventListener('mousemove', e => {
            if (document.pointerLockElement === document.body) {
                // Guard against high-DPI / dropped-frame spikes that can inject huge
                // movement deltas and destabilize first-person cockpit motion.
                const mx = Math.max(-42, Math.min(42, e.movementX || 0));
                const my = Math.max(-42, Math.min(42, e.movementY || 0));
                player.yaw = Math.max(-3.0, Math.min(3.0, (player.yaw || 0) - mx * 0.005));
                player.pitch = Math.max(-3.0, Math.min(3.0, (player.pitch || 0) - my * 0.005));
                lastInputDevice = 'mouse';
            }
        });

        // Scroll wheel — throttle control for mouse-primary play
        document.addEventListener('wheel', e => {
            if (!player) return;
            if (document.pointerLockElement === document.body) {
                e.preventDefault();
                const step = e.deltaY > 0 ? -0.08 : 0.08;
                player.throttle = Math.min(1, Math.max(0, player.throttle + step));
                lastInputDevice = 'mouse';
            }
        }, { passive: false });

        // Prevent context menu
        document.addEventListener('contextmenu', e => e.preventDefault());

        // ── Fullscreen + Pointer Lock immersion system ──
        // When pointer lock is lost (ESC), show resume button, restore cursor
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                // Locked — hide cursor, hide resume btn + overlay
                document.body.classList.add('immersed');
                const btn = document.getElementById('fs-resume');
                const overlay = document.getElementById('fs-resume-overlay');
                if (btn) btn.style.display = 'none';
                if (overlay) overlay.style.display = 'none';
            } else {
                // Unlocked (ESC pressed) — show cursor + resume button in any game phase
                document.body.classList.remove('immersed');
                const phase = window.Starfighter && Starfighter.getPhase ? Starfighter.getPhase() : '';
                if (phase && phase !== 'loading') {
                    const btn = document.getElementById('fs-resume');
                    const overlay = document.getElementById('fs-resume-overlay');
                    if (btn) btn.style.display = 'block';
                    if (overlay) overlay.style.display = 'block';
                }
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                // Fullscreen exited — also lose pointer lock
                if (document.pointerLockElement) document.exitPointerLock();
            }
        });

        // ── Mobile detection & setup ──
        isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 1024);
        if (isMobile) {
            lastInputDevice = 'touch';
            _initMobileControls();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  MOBILE CONTROLS — nav sphere (pitch/yaw/thrust), tap-to-fire
    // ══════════════════════════════════════════════════════════════════
    function _initMobileControls() {
        // Show mobile HUD
        const mobileHud = document.getElementById('mobile-hud');
        if (mobileHud) mobileHud.style.display = 'block';
        // Show crosshair on mobile (tap it for torpedo)
        const ch = document.getElementById('crosshair');
        if (ch) { ch.style.display = 'block'; ch.style.pointerEvents = 'auto'; ch.style.zIndex = '22'; }

        // ── Nav Sphere (bottom-center) — pitch/yaw/thrust ──
        const navSphere = document.getElementById('mob-nav-sphere');
        if (navSphere) {
            navSphere.addEventListener('touchstart', _navStart, { passive: false });
            navSphere.addEventListener('touchmove', _navMove, { passive: false });
            navSphere.addEventListener('touchend', _navEnd, { passive: false });
            navSphere.addEventListener('touchcancel', _navEnd, { passive: false });
        }

        // ── Crosshair tap = torpedo ──
        if (ch) {
            ch.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.Starfighter) window.Starfighter.fireTorpedo();
            }, { passive: false });
        }

        // ── Tap empty space = lasers ──
        document.addEventListener('touchstart', (e) => {
            if (window.SFAudio) SFAudio.resume();
            // If launch prompt is showing, trigger launch
            const lp = document.getElementById('launch-prompt');
            if (lp && lp.style.display !== 'none' && lp.offsetParent !== null) {
                launchTriggered = true;
                return;
            }
            // Ignore touches on nav sphere, crosshair, buttons, panels
            if (e.target.closest('#mob-nav-sphere, #crosshair, #console-buttons, #mobile-hud .mob-btn, #mob-btn-group, #mission-panel, #tutorial-panel, #loading-screen')) return;
            // Tap anywhere else = fire lasers
            if (window.Starfighter) window.Starfighter.fireLaser();
        }, { passive: true });

        // ── Remaining action buttons (lock, boost, afterburner, RTB) ──
        _bindTouchBtn('mob-lock', () => { if (window.Starfighter) window.Starfighter.tryLockOnTarget(); });
        _bindTouchBtn('mob-boost', () => { if (player) player.activateBoost(); });
        _bindTouchHold('mob-afterburner', 'afterburnerHeld');
        _bindTouchBtn('mob-rtb', () => { if (window.Starfighter && Starfighter.emergencyRTB) Starfighter.emergencyRTB(); });
    }

    // ── Nav Sphere handlers ──
    function _navStart(e) {
        e.preventDefault();
        if (navActive) return;
        const t = e.changedTouches[0];
        navTouchId = t.identifier;
        navActive = true;
        const sphere = document.getElementById('mob-nav-sphere');
        const rect = sphere.getBoundingClientRect();
        navOriginX = rect.left + rect.width / 2;
        navOriginY = rect.top + rect.height / 2;
        navDx = 0; navDy = 0;
        navThrust = true; // touching sphere = thrust
        _navUpdateVisual(0, 0);
        sphere.classList.add('active');
    }
    function _navMove(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === navTouchId) {
                let dx = t.clientX - navOriginX;
                let dy = t.clientY - navOriginY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > NAV_MAX_R) { dx *= NAV_MAX_R / dist; dy *= NAV_MAX_R / dist; }
                // Dead zone in center = pure thrust, no steering
                if (dist < NAV_DEAD) {
                    navDx = 0; navDy = 0;
                    navThrust = true;
                } else {
                    navDx = dx / NAV_MAX_R; // -1..1
                    navDy = dy / NAV_MAX_R; // -1..1
                    navThrust = true; // still thrusting while dragging
                }
                _navUpdateVisual(dx, dy);
            }
        }
    }
    function _navEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === navTouchId) {
                navActive = false;
                navTouchId = null;
                navDx = 0; navDy = 0;
                navThrust = false; // release = throttle backs off
                _navUpdateVisual(0, 0);
                const sphere = document.getElementById('mob-nav-sphere');
                if (sphere) sphere.classList.remove('active');
            }
        }
    }
    function _navUpdateVisual(dx, dy) {
        const knob = document.getElementById('mob-nav-knob');
        if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // ── Touch button helpers ──
    function _bindTouchBtn(id, action) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', (e) => { e.preventDefault(); action(); }, { passive: false });
    }
    function _bindTouchHold(id, key) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', (e) => { e.preventDefault(); touchBtns[key] = true; el.classList.add('active'); }, { passive: false });
        el.addEventListener('touchend', (e) => { touchBtns[key] = false; el.classList.remove('active'); }, { passive: false });
        el.addEventListener('touchcancel', (e) => { touchBtns[key] = false; el.classList.remove('active'); }, { passive: false });
    }

    function update(dt) {
        if (!player) return;

        // Throttle (W/S)
        if (keys['KeyW']) { player.throttle = Math.min(1, player.throttle + dt * 0.5); lastInputDevice = 'keyboard'; }
        if (keys['KeyS']) { player.throttle = Math.max(0, player.throttle - dt * 0.5); lastInputDevice = 'keyboard'; }

        // GDD §4.1: Afterburner (Shift hold)
        player.afterburnerActive = keys['ShiftLeft'] || keys['ShiftRight'] || !!touchBtns['afterburnerHeld'];

        // Reset strafe each frame (set by keys below)
        player.strafeH = 0;
        player.strafeV = 0;

        // ── Mobile nav sphere input ──
        if (isMobile && navActive) {
            // Sphere drag = pitch/yaw steering
            if (Math.abs(navDx) > 0.05) player.yaw -= navDx * dt * 2.5;
            if (Math.abs(navDy) > 0.05) player.pitch -= navDy * dt * 2.5;
            lastInputDevice = 'touch';
        }
        if (isMobile) {
            // Thrust while touching sphere, backs off when released
            if (navThrust) {
                player.throttle = Math.min(1, player.throttle + dt * 0.6);
            } else {
                player.throttle = Math.max(0, player.throttle - dt * 0.4);
            }
        }

        // Roll (Q/E) — GDD §4.1: 120°/s
        if (keys['KeyQ']) player.roll += dt * 2.0;
        if (keys['KeyE']) player.roll -= dt * 2.0;

        // Strafe — GDD §4.1: Space (up) / Ctrl (down), A/D overloaded as bank + strafe
        if (keys['KeyA']) player.strafeH = -1;
        if (keys['KeyD']) player.strafeH = 1;
        if (keys['Space'] && !keys['ControlLeft']) {
            // Space fires lasers when not strafing
        }
        if (keys['ControlLeft'] || keys['ControlRight']) player.strafeV = -1;

        // Arrow keys alternative for pitch/yaw
        if (keys['ArrowUp']) player.pitch += dt * 2.0;
        if (keys['ArrowDown']) player.pitch -= dt * 2.0;
        if (keys['ArrowLeft']) player.yaw += dt * 2.0;
        if (keys['ArrowRight']) player.yaw -= dt * 2.0;

        // GDD §4.1: Boost (F tap) — was torpedo, now boost per GDD
        if (keys['KeyF']) {
            if (!this.fPressed) {
                player.activateBoost();
                this.fPressed = true;
            }
        } else {
            this.fPressed = false;
        }

        // GDD §4.1: Toggle Flight Assist (V key)
        if (keys['KeyV']) {
            if (!this.vPressed) {
                player.toggleFlightAssist();
                this.vPressed = true;
            }
        } else {
            this.vPressed = false;
        }

        // Fire primary — left mouse button handled in mousedown, Space fires lasers
        if (keys['Space']) window.Starfighter.fireLaser();

        // GDD §10.1: Torpedo — right mouse button handled in mousedown
        // Middle mouse also fires torpedo (legacy compat)

        // Target lock (T key)
        if (keys['KeyT']) {
            if (!this.tPressed) {
                window.Starfighter.tryLockOnTarget();
                this.tPressed = true;
            }
        } else {
            this.tPressed = false;
        }

        // Emergency RTB (R key) — panic button when organisms are aboard
        if (keys['KeyR']) {
            if (!this.rPressed) {
                if (window.Starfighter && window.Starfighter.emergencyRTB) {
                    window.Starfighter.emergencyRTB();
                }
                this.rPressed = true;
            }
        } else {
            this.rPressed = false;
        }

        // Gamepad API — GDD §12.4
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[0];
        if (pad) {
            // Auto-detect: if any axis/button is active, switch to gamepad
            const anyAxis = pad.axes.some(a => Math.abs(a) > 0.15);
            const anyBtn = Array.from(pad.buttons).some(b => b.pressed);
            if (anyAxis || anyBtn) lastInputDevice = 'gamepad';
            // Right stick: Pitch / Yaw (GDD §12.4)
            if (Math.abs(pad.axes[2]) > 0.1) player.yaw += -pad.axes[2] * dt * 2.0;
            if (Math.abs(pad.axes[3]) > 0.1) player.pitch += -pad.axes[3] * dt * 2.0;

            // Left stick: Throttle Y + Strafe X (GDD §12.4)
            if (Math.abs(pad.axes[1]) > 0.1) player.throttle = Math.min(1, Math.max(0, player.throttle - pad.axes[1] * dt * 0.5));
            if (Math.abs(pad.axes[0]) > 0.1) player.strafeH = pad.axes[0];

            // Bumpers: Roll (GDD §12.4: L1/R1)
            if (pad.buttons[4] && pad.buttons[4].pressed) player.roll += dt * 2.0; // LB
            if (pad.buttons[5] && pad.buttons[5].pressed) player.roll -= dt * 2.0; // RB

            // GDD §12.4: RT = fire primary (hold), LT = fire secondary (tap when locked)
            if (pad.buttons[7] && pad.buttons[7].pressed) window.Starfighter.fireLaser(); // RT
            if (pad.buttons[6] && pad.buttons[6].pressed) { // LT = torpedo
                if (!this.padLTPressed) {
                    window.Starfighter.fireTorpedo();
                    this.padLTPressed = true;
                }
            } else {
                this.padLTPressed = false;
            }

            // A = afterburner (hold), B = boost (tap), X = FA toggle, Y = target lock
            if (pad.buttons[0]) player.afterburnerActive = player.afterburnerActive || pad.buttons[0].pressed;
            if (pad.buttons[1] && pad.buttons[1].pressed) {
                if (!this.padBPressed) {
                    player.activateBoost();
                    this.padBPressed = true;
                }
            } else { this.padBPressed = false; }
            if (pad.buttons[2] && pad.buttons[2].pressed) {
                if (!this.padXPressed) {
                    player.toggleFlightAssist();
                    this.padXPressed = true;
                }
            } else { this.padXPressed = false; }
            if (pad.buttons[3] && pad.buttons[3].pressed) {
                if (!this.padYPressed) {
                    window.Starfighter.tryLockOnTarget();
                    this.padYPressed = true;
                }
            } else { this.padYPressed = false; }
        }
    }

    function getLaunchTriggered() {
        const triggered = launchTriggered;
        launchTriggered = false; // Reset after reading
        return triggered;
    }

    function checkLaunch(safeDt) {
        // Spacebar launch
        if (keys['Space']) {
            launchTriggered = true;
        }
        // Joystick forward (left stick Y axis) launch
        if (player) {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const pad = pads[0];
            if (pad && pad.axes[1] < -0.5) {
                launchTriggered = true;
            }
        }
        // Mobile nav sphere touch = launch
        if (isMobile && navThrust) {
            launchTriggered = true;
        }
    }

    function isKeyDown(code) { return !!keys[code]; }

    function updateLivePanel() {
        if (!player) return;
        const panel = document.getElementById('controls-panel');
        if (!panel || !panel.classList.contains('open')) return;

        const el = (id) => document.getElementById(id);
        const fmt = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);

        const spd = player.velocity ? player.velocity.length() : 0;
        if (el('live-throttle')) el('live-throttle').textContent = fmt(player.throttle || 0);
        if (el('live-pitch')) el('live-pitch').textContent = fmt(player.pitch || 0);
        if (el('live-yaw')) el('live-yaw').textContent = fmt(player.yaw || 0);
        if (el('live-roll')) el('live-roll').textContent = fmt(player.roll || 0);
        if (el('live-strafe-h')) el('live-strafe-h').textContent = fmt(player.strafeH || 0);
        if (el('live-strafe-v')) el('live-strafe-v').textContent = fmt(player.strafeV || 0);
        if (el('live-speed')) el('live-speed').textContent = Math.round(spd);
        if (el('live-afterburner')) {
            const ab = player.afterburnerActive;
            el('live-afterburner').textContent = ab ? 'ON' : 'OFF';
            el('live-afterburner').style.color = ab ? '#f00' : '#f80';
        }
        if (el('live-fa')) {
            const fa = player.flightAssist !== false;
            el('live-fa').textContent = fa ? 'ON' : 'OFF';
            el('live-fa').style.color = fa ? '#0ff' : '#f80';
        }

        // Device auto-detection
        const devEl = el('detected-device');
        if (devEl) {
            if (lastInputDevice === 'touch') {
                devEl.textContent = 'TOUCH + GYRO';
                devEl.style.color = '#0f8';
            } else {
                const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                const pad = pads[0];
                if (lastInputDevice === 'gamepad' && pad) {
                    const name = pad.id.length > 30 ? pad.id.substring(0, 30) + '…' : pad.id;
                    devEl.textContent = 'GAMEPAD: ' + name;
                    devEl.style.color = '#f80';
                } else {
                    devEl.textContent = 'KEYBOARD + MOUSE';
                    devEl.style.color = '#0ff';
                }
            }
        }
    }

    // ── Panel toggle (called from Tab key and auto-deploy) ──
    function togglePanel(forceOpen) {
        const panel = document.getElementById('controls-panel');
        const toggle = document.getElementById('controls-toggle');
        if (!panel || !toggle) return;
        if (forceOpen === true) {
            panel.classList.add('open');
        } else if (forceOpen === false) {
            panel.classList.remove('open');
        } else {
            panel.classList.toggle('open');
        }
        toggle.innerText = panel.classList.contains('open') ? '◀' : '▶';
    }

    // ── Immersive mode: fullscreen + pointer lock + cursor hidden ──
    function enterImmersive() {
        const el = document.documentElement;
        const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;

        const _lockPointer = () => {
            // Small delay — browsers need fullscreen to settle before pointer lock
            setTimeout(() => document.body.requestPointerLock(), 100);
        };

        if (!document.fullscreenElement && fsReq) {
            fsReq.call(el).then(_lockPointer).catch(_lockPointer);
        } else {
            // Already fullscreen or can't fullscreen — just lock pointer
            document.body.requestPointerLock();
        }
        document.body.classList.add('immersed');
        const btn = document.getElementById('fs-resume');
        const overlay = document.getElementById('fs-resume-overlay');
        if (btn) btn.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    return { init, update, getLaunchTriggered, checkLaunch, isKeyDown, updateLivePanel, togglePanel, enterImmersive, isMobile: () => isMobile };
})();

window.SFInput = SFInput;
