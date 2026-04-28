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

    // Scuttle hold: 3-second Backspace press to self-destruct out of a sortie.
    // Tracked here (not in core.js) so the on-screen progress bar updates per
    // frame without round-tripping through the game module.
    const SCUTTLE_HOLD_SECS = 3.0;
    let scuttleHeld = 0;

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

            // Backspace would otherwise navigate the browser back when no
            // input is focused; we use it as the scuttle hold key, so swallow.
            if (e.code === 'Backspace') e.preventDefault();

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
            if (e.target.closest('#console-buttons, #mobile-hud, #mission-panel, #tutorial-panel, #launch-btn, #skip-launch-btn, #mob-calibrate, #fs-resume, #fs-resume-overlay, #tutorial-prompt-overlay, #tutorial-overlay, #rescue-bay-overlay, #bay-debrief, #respawn-overlay, #waveclear-overlay, #death-screen, #eliminated-overlay, #training-skip-btn, #training-control-overlay') ||
                (e.target.classList && (e.target.classList.contains('action-btn') || e.target.classList.contains('mob-btn') || e.target.classList.contains('console-btn') || e.target.classList.contains('avtn-btn') || e.target.classList.contains('avtn-select')))) return;

            if (document.pointerLockElement !== document.body) {
                enterImmersive();
            } else {
                if (e.button === 0) window.Starfighter.firePrimary();   // Left click — selected weapon
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

        // Scroll wheel — throttle control in-game; activate focused button on overlays
        document.addEventListener('wheel', e => {
            if (!player) return;
            if (document.pointerLockElement === document.body) {
                e.preventDefault();
                const step = e.deltaY > 0 ? -0.08 : 0.08;
                player.throttle = Math.min(1, Math.max(0, player.throttle + step));
                lastInputDevice = 'mouse';
            } else {
                // Not in pointer lock — an overlay is showing; scroll wheel activates focused button
                const focused = document.activeElement;
                if (focused && (focused.tagName === 'BUTTON' || focused.tagName === 'SELECT')) {
                    e.preventDefault();
                    focused.click();
                }
            }
        }, { passive: false });

        // Prevent context menu
        document.addEventListener('contextmenu', e => e.preventDefault());

        // ── Fullscreen + Pointer Lock immersion system ──
        // Electron: pointer lock is never forcibly broken by ESC — ESC is a pause key.
        // Browser: ESC exits pointer lock and shows a resume button.
        const _isElectron = !!(window.NativeApp && window.NativeApp.isElectron);

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                // Locked — hide cursor and the resume prompt
                document.body.classList.add('immersed');
                _setResumePromptVisible(false);
            } else {
                // Pointer lock lost — pause game, surface click-to-resume
                document.body.classList.remove('immersed');
                if (window.Starfighter && Starfighter.setPaused) Starfighter.setPaused(true);
                if (!_isElectron) _setResumePromptVisible(true);
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!_isElectron && !document.fullscreenElement) {
                // Browser only: fullscreen exited — also lose pointer lock
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
            // Tap anywhere else = fire selected weapon
            if (window.Starfighter) window.Starfighter.firePrimary();
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

        // Bank — A/D for yaw (left/right banking)
        if (keys['KeyA']) { player.yaw += dt * 2.0; lastInputDevice = 'keyboard'; }
        if (keys['KeyD']) { player.yaw -= dt * 2.0; lastInputDevice = 'keyboard'; }
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

        // Hyperdrive (H key) — toggle engage/disengage
        if (keys['KeyH']) {
            if (!this.hPressed) {
                if (player.hyperdriveActive || player.hyperdriveSpooling) {
                    player.disengageHyperdrive();
                } else {
                    player.activateHyperdrive();
                }
                this.hPressed = true;
            }
        } else {
            this.hPressed = false;
        }

        // Fire primary — left mouse button handled in mousedown, Space fires selected weapon
        if (keys['Space']) window.Starfighter.firePrimary();

        // GDD §10.1: Torpedo — right mouse button handled in mousedown
        // Middle mouse also fires torpedo (legacy compat)

        // Weapon select (1-4 keys) — direct select, no cycling
        if (keys['Digit1']) { if (window.Starfighter) { const s = window.Starfighter.getState(); if (s && s.player) s.player.selectedWeapon = 0; } }
        if (keys['Digit2']) { if (window.Starfighter) { const s = window.Starfighter.getState(); if (s && s.player) s.player.selectedWeapon = 1; } }
        if (keys['Digit3']) { if (window.Starfighter) { const s = window.Starfighter.getState(); if (s && s.player) s.player.selectedWeapon = 2; } }
        if (keys['Digit4']) { if (window.Starfighter) { const s = window.Starfighter.getState(); if (s && s.player) s.player.selectedWeapon = 3; } }
        // Mouse wheel click cycles weapons
        if (keys['WheelClick']) {
            if (!this.wheelClickPressed) {
                window.Starfighter.cycleWeapon();
                this.wheelClickPressed = true;
            }
        } else {
            this.wheelClickPressed = false;
        }

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

        // Request Dock (G key) — manual redock request
        if (keys['KeyG']) {
            if (!this.gPressed) {
                if (window.Starfighter && window.Starfighter.requestDock) {
                    window.Starfighter.requestDock();
                }
                this.gPressed = true;
            }
        } else {
            this.gPressed = false;
        }

        // Scuttle ship (Backspace hold, 3s) — voluntary sortie exit
        const scuttleEligible = window.Starfighter && Starfighter.getPhase &&
            Starfighter.getPhase() === 'combat';
        if (keys['Backspace'] && scuttleEligible) {
            scuttleHeld += dt;
            const ind = document.getElementById('scuttle-indicator');
            const fill = document.getElementById('scuttle-bar-fill');
            if (ind && !ind.classList.contains('active')) ind.classList.add('active');
            if (fill) fill.style.width = Math.min(100, (scuttleHeld / SCUTTLE_HOLD_SECS) * 100) + '%';
            if (scuttleHeld >= SCUTTLE_HOLD_SECS) {
                scuttleHeld = 0;
                if (fill) fill.style.width = '0%';
                if (ind) ind.classList.remove('active');
                if (Starfighter.scuttleShip) Starfighter.scuttleShip();
            }
        } else if (scuttleHeld > 0) {
            scuttleHeld = 0;
            const ind = document.getElementById('scuttle-indicator');
            const fill = document.getElementById('scuttle-bar-fill');
            if (fill) fill.style.width = '0%';
            if (ind) ind.classList.remove('active');
        }

        // Gamepad API — GDD §12.4
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[0];
        if (pad) {
            // ── Gamepad tuning ──
            // Goal: responsive at full deflection, precise for micro-aim near center.
            const _deadzoneLook = 0.055;
            const _deadzoneMove = 0.08;
            const _expoLook = 1.85;
            const _expoMove = 1.6;
            const _lookRate = 3.2; // comparable to mouse clamp range (±3)
            const _curveAxis = (v, dz, expo) => {
                const a = Math.abs(v || 0);
                if (a <= dz) return 0;
                const n = (a - dz) / (1 - dz);
                return Math.sign(v) * Math.pow(n, expo);
            };

            // Auto-detect: if any axis/button is active, switch to gamepad
            const anyAxis = pad.axes.some(a => Math.abs(a) > 0.15);
            let anyBtn = false;
            for (let bi = 0; bi < pad.buttons.length; bi++) { if (pad.buttons[bi].pressed) { anyBtn = true; break; } }
            if (anyAxis || anyBtn) lastInputDevice = 'gamepad';

            // Right stick: Pitch / Yaw (GDD §12.4)
            // Apply deadzone + curve so tiny stick movements still register, but gently.
            const rsx = _curveAxis(pad.axes[2], _deadzoneLook, _expoLook);
            const rsy = _curveAxis(pad.axes[3], _deadzoneLook, _expoLook);
            if (rsx !== 0) player.yaw = Math.max(-3.0, Math.min(3.0, (player.yaw || 0) + (-rsx) * dt * _lookRate));
            if (rsy !== 0) player.pitch = Math.max(-3.0, Math.min(3.0, (player.pitch || 0) + (-rsy) * dt * _lookRate));

            // Left stick: Throttle Y + Strafe X (GDD §12.4)
            const lsx = _curveAxis(pad.axes[0], _deadzoneMove, _expoMove);
            const lsy = _curveAxis(pad.axes[1], _deadzoneMove, _expoMove);
            if (lsy !== 0) player.throttle = Math.min(1, Math.max(0, player.throttle - lsy * dt * 0.55));
            player.strafeH = lsx; // ensure it returns to 0 when stick centers

            // Bumpers: Roll (GDD §12.4: L1/R1)
            if (pad.buttons[4] && pad.buttons[4].pressed) player.roll += dt * 2.0; // LB
            if (pad.buttons[5] && pad.buttons[5].pressed) player.roll -= dt * 2.0; // RB

            // GDD §12.4: RT = fire primary (hold), LT = fire secondary (tap when locked)
            if (pad.buttons[7] && pad.buttons[7].pressed) window.Starfighter.firePrimary(); // RT
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

    const _liveEls = {};
    let _liveElsCached = false;
    function _cacheLiveEls() {
        const ids = ['live-throttle', 'live-pitch', 'live-yaw', 'live-roll',
            'live-strafe-h', 'live-strafe-v', 'live-speed',
            'live-afterburner', 'live-fa', 'detected-device'];
        for (let i = 0; i < ids.length; i++) _liveEls[ids[i]] = document.getElementById(ids[i]);
        _liveElsCached = true;
    }

    function updateLivePanel() {
        if (!player) return;
        const panel = document.getElementById('controls-panel');
        if (!panel || !panel.classList.contains('open')) return;
        if (!_liveElsCached) _cacheLiveEls();

        const fmt = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);
        const spd = player.velocity ? player.velocity.length() : 0;
        const e = _liveEls;
        if (e['live-throttle']) e['live-throttle'].textContent = fmt(player.throttle || 0);
        if (e['live-pitch']) e['live-pitch'].textContent = fmt(player.pitch || 0);
        if (e['live-yaw']) e['live-yaw'].textContent = fmt(player.yaw || 0);
        if (e['live-roll']) e['live-roll'].textContent = fmt(player.roll || 0);
        if (e['live-strafe-h']) e['live-strafe-h'].textContent = fmt(player.strafeH || 0);
        if (e['live-strafe-v']) e['live-strafe-v'].textContent = fmt(player.strafeV || 0);
        if (e['live-speed']) e['live-speed'].textContent = Math.round(spd);
        if (e['live-afterburner']) {
            const ab = player.afterburnerActive;
            e['live-afterburner'].textContent = ab ? 'ON' : 'OFF';
            e['live-afterburner'].style.color = ab ? '#f00' : '#f80';
        }
        if (e['live-fa']) {
            const fa = player.flightAssist !== false;
            e['live-fa'].textContent = fa ? 'ON' : 'OFF';
            e['live-fa'].style.color = fa ? '#0ff' : '#f80';
        }

        // Device auto-detection
        const devEl = e['detected-device'];
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

    // ── Resume prompt visibility helper (browser only) ──
    function _setResumePromptVisible(visible) {
        const btn = document.getElementById('fs-resume');
        const dim = document.getElementById('fs-resume-overlay');
        if (btn) btn.style.display = visible ? 'block' : 'none';
        if (dim) dim.style.display = visible ? 'block' : 'none';
    }

    // ── Immersive mode: fullscreen + pointer lock + cursor hidden ──
    function enterImmersive() {
        const _isElectron = !!(window.NativeApp && window.NativeApp.isElectron);

        // Optimistically hide the resume prompt; pointerlockchange will re-show on failure.
        _setResumePromptVisible(false);

        if (_isElectron) {
            // Electron: window is already fullscreen and frameless — just grab pointer lock
            document.body.requestPointerLock();
        } else {
            const el = document.documentElement;
            const fsReq = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
            const _lockPointer = () => {
                // Small delay — browsers need fullscreen to settle before pointer lock
                setTimeout(() => document.body.requestPointerLock(), 100);
            };
            if (!document.fullscreenElement && fsReq) {
                fsReq.call(el).then(_lockPointer).catch(_lockPointer);
            } else {
                document.body.requestPointerLock();
            }
            // Pointer lock requires user activation. If a deferred caller (e.g. setTimeout)
            // invoked us, the request will be silently denied — surface the resume prompt
            // so the player has a clickable target to grab input.
            setTimeout(() => {
                if (document.pointerLockElement !== document.body) _setResumePromptVisible(true);
            }, 400);
        }
        document.body.classList.add('immersed');
        if (window.Starfighter && Starfighter.setPaused) Starfighter.setPaused(false);
    }

    return { init, update, getLaunchTriggered, checkLaunch, isKeyDown, updateLivePanel, togglePanel, enterImmersive, isMobile: () => isMobile };
})();

window.SFInput = SFInput;
