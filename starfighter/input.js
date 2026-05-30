/**
 * Starfighter Input
 * Mouse (primary) · Gamepad / Joystick · WebXR · Touch (mobile) · Keyboard (backup)
 */

const SFInput = (function () {
    let player = null;
    const keys = {};
    let launchTriggered = false;
    let spacebarJustPressed = false;
    // Default to 'mouse' on desktop; keyboard is a backup hint only.
    // Switches to 'gamepad'/'touch'/'xr' as soon as those substrates report activity.
    let lastInputDevice = 'mouse';
    let mouseLookActive = false;

    // ── Mobile / Touch state ──
    let isMobile = false;
    let gyroEnabled = false;
    let gyroSupported = false;
    let gyroZeroBeta = 0;
    let gyroZeroGamma = 0;
    let gyroPitch = 0;
    let gyroYaw = 0;
    let gyroPitchSmoothed = 0;
    let gyroYawSmoothed = 0;
    let gyroNeedsZero = false;
    let gyroAutoPrompted = false;

    // Nav sphere state (center thumb control)
    let navActive = false;
    let navTouchId = null;
    let navOriginX = 0, navOriginY = 0;
    let navDx = 0, navDy = 0;           // -1..1 normalized
    let navThrust = false;               // center push = thrust
    const NAV_MAX_R = 55;               // max pixel radius for full deflection
    const NAV_DEAD = 8;                 // pixel dead zone (center = thrust zone)

    // Global touch drag/tap controls (outside nav sphere/buttons)
    let dragSteerActive = false;
    let dragSteerTouchId = null;
    let dragSteerLastX = 0;
    let dragSteerLastY = 0;
    let dragSteerStartX = 0;
    let dragSteerStartY = 0;
    let dragSteerMovedPx = 0;
    let dragSteerStartMs = 0;
    let dragSteerAccumX = 0;
    let dragSteerAccumY = 0;
    let singleTapTimer = null;
    let TAP_MOVE_MAX_PX = 16;
    let TAP_TIME_MAX_MS = 260;
    let DOUBLE_TAP_WINDOW_MS = 320;
    let DRAG_STEER_GAIN = 0.0048;
    let DRAG_THROTTLE_GAIN = 0.0024;
    const GYRO_SMOOTH_ALPHA = 0.24;

    let modeBadgeEl = null;
    let mobilePhase = 'loading';

    // Touch action button tracking
    const touchBtns = {};               // id → held state

    // Scuttle hold: 3-second Backspace press to self-destruct out of a sortie.
    // Tracked here (not in core.js) so the on-screen progress bar updates per
    // frame without round-tripping through the game module.
    const SCUTTLE_HOLD_SECS = 3.0;
    let scuttleHeld = 0;

    function init(p) {
        player = p;
        mouseLookActive = false;

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

            if (e.code === 'Escape') mouseLookActive = false;

            // ── Hotkey dispatcher: any visible button with [data-hotkey="<KeyCode>"]
            //    can be activated by its key. Lets every on-screen button be
            //    pressed without the mouse. Skip when typing in a text field.
            const tag = (e.target && e.target.tagName) || '';
            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target && e.target.isContentEditable)) {
                const hkBtn = document.querySelector('button[data-hotkey="' + e.code + '"]');
                if (hkBtn && hkBtn.offsetParent !== null && !hkBtn.disabled) {
                    e.preventDefault();
                    if (document.pointerLockElement) document.exitPointerLock();
                    hkBtn.click();
                    lastInputDevice = 'keyboard';
                }
            }
        });
        window.addEventListener('keyup', e => {
            // Don't register key-up for keys that were never set (button-focused bypass)
            keys[e.code] = false;
        });

        // ── Gamepad UI navigator: SELECT (8) cycles focus through visible
        //    buttons, START (9) activates the focused one. Lets every on-screen
        //    button be reached without a mouse. Polled in update() loop below.

        // Pointer Lock API for precise FPS-style mouse steering
        document.addEventListener('mousedown', e => {
            // Resume audio on first user gesture
            if (window.SFAudio) SFAudio.resume();

            // Ignore UI buttons — don't let them trigger pointer lock or fire weapons
            if (e.target.closest('#console-buttons, #mobile-hud, #mission-panel, #tutorial-panel, #launch-btn, #skip-launch-btn, #launch-bay-briefing, #mob-calibrate, #fs-resume, #fs-resume-overlay, #tutorial-prompt-overlay, #tutorial-overlay, #rescue-bay-overlay, #bay-debrief, #respawn-overlay, #waveclear-overlay, #death-screen, #eliminated-overlay, #training-skip-btn, #training-control-overlay, #ctrl-hamburger, #sf-mobile-delta, #sf-controls-hint, #rescue-btn, #cm-deploy-btn, #cm-gauge-container, #sf-frigate-btn') ||
                (e.target.classList && (e.target.classList.contains('action-btn') || e.target.classList.contains('mob-btn') || e.target.classList.contains('console-btn') || e.target.classList.contains('avtn-btn') || e.target.classList.contains('avtn-select')))) return;

            if (document.pointerLockElement !== document.body) {
                enterImmersive();
            } else {
                if (e.button === 0) window.Starfighter.fireLaser();
                if (e.button === 2) window.Starfighter.fireTorpedo();
                if (e.button === 1) window.Starfighter.firePrimary();
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
                mouseLookActive = true;
            }
        });

        // Scroll wheel — Quick Thrust / Reverse Thrust (in-game) or overlay activation
        // deltaY > 0 = wheel down = decelerate/reverse
        // deltaY < 0 = wheel up   = accelerate/thrust forward
        // Shift+wheel = fine step (0.02), plain wheel = normal step (0.08)
        document.addEventListener('wheel', e => {
            if (!player) return;
            if (document.pointerLockElement === document.body) {
                e.preventDefault();
                const step = e.shiftKey ? 0.02 : 0.08;
                const delta = e.deltaY > 0 ? -step : step;
                player.throttle = Math.min(1, Math.max(-1, player.throttle + delta));
                lastInputDevice = 'mouse';
                // Notify HUD speed indicator of thrust direction change
                _lastWheelDir = delta > 0 ? 1 : -1;
                clearTimeout(_wheelDirTimer);
                _wheelDirTimer = setTimeout(() => { _lastWheelDir = 0; }, 600);
            } else {
                // Overlay visible — scroll wheel activates focused button
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
                mouseLookActive = true;
            } else {
                // Pointer lock lost — pause game, surface click-to-resume
                document.body.classList.remove('immersed');
                if (window.Starfighter && Starfighter.setPaused) Starfighter.setPaused(true);
                if (!_isElectron) _setResumePromptVisible(true);
                mouseLookActive = false;
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!_isElectron && !document.fullscreenElement) {
                // Browser only: fullscreen exited — also lose pointer lock
                if (document.pointerLockElement) document.exitPointerLock();
            }
        });

        // ── Mobile detection & setup ──
        // Coarse-pointer / no-hover devices are mobile regardless of screen width
        // (covers landscape iPads, foldables, large Android phones, Chrome OS touch).
        const ua = navigator.userAgent || '';
        const coarse = (typeof window.matchMedia === 'function')
            && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        const uaTouch = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
        const multiTouch = ('ontouchstart' in window) && (navigator.maxTouchPoints || 0) > 1;
        isMobile = uaTouch || coarse || multiTouch;
        if (isMobile) {
            lastInputDevice = 'touch';
            _initMobileControls();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  MOBILE CONTROLS — nav sphere (pitch/yaw/thrust), tap-to-fire
    // ══════════════════════════════════════════════════════════════════
    function _initMobileControls() {
        // Slightly adapt touch thresholds for high-DPI phones.
        const dpr = Math.max(1, Math.min(1.8, (window.devicePixelRatio || 1)));
        TAP_MOVE_MAX_PX = Math.round(14 * dpr);
        TAP_TIME_MAX_MS = 260;
        DOUBLE_TAP_WINDOW_MS = 320;
        DRAG_STEER_GAIN = 0.0046;
        DRAG_THROTTLE_GAIN = 0.0024;

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

        // ── Global touch parsing: drag steer + tap fire + double-tap torpedo ──
        document.addEventListener('touchstart', _combatTouchStart, { passive: false });
        document.addEventListener('touchmove', _combatTouchMove, { passive: false });
        document.addEventListener('touchend', _combatTouchEnd, { passive: false });
        document.addEventListener('touchcancel', _combatTouchEnd, { passive: false });

        _ensureMobileModeBadge();
        _setMobileModeBadge(false);

        // ── Cockpit action grid (FIRE · SEC · LOCK · BOOST · ABILITY · RTB) ──
        // UI Contract phase 1: AB merged into BOOST (tap = burst via
        // activateBoost; hold = sustained afterburner via afterburnerHeld).
        // TILT relocated to hamburger menu (phase 2) — _bindGyroButton
        // early-returns harmlessly if #mob-tilt is absent. SEC / ABILITY
        // hooks call into Starfighter.* methods that phase 5 will define;
        // optional-chained so they no-op safely until the inventory lands.
        _bindTouchHold('mob-fire', 'fireHeld');
        _bindGyroButton();
        _bindTouchBtn('mob-lock', () => { if (window.Starfighter) window.Starfighter.tryLockOnTarget(); });
        _bindTouchBtn('mob-boost', () => { if (player) player.activateBoost(); });
        _bindTouchHold('mob-boost', 'afterburnerHeld');
        _bindTouchBtn('mob-sec', () => { if (window.Starfighter && Starfighter.fireSecondary) Starfighter.fireSecondary(); });
        _bindTouchBtn('mob-ability', () => { if (window.Starfighter && Starfighter.activateAbility) Starfighter.activateAbility(); });
        _bindTouchBtn('mob-rtb', () => { if (window.Starfighter && Starfighter.emergencyRTB) Starfighter.emergencyRTB(); });

        // ── Cockpit D-pad (▲ THR · ▼ BRK · ◀ ▶ yaw) — gyro-fallback steering ──
        // Drives the same nav* state used by the legacy thumb-stick path, so
        // applyInputToPlayer needs no changes. Pitch stays gyro-only.
        _bindDpad();

        // Sync touch HUD visibility with current game phase as soon as controls mount.
        setMobilePhase(mobilePhase);

        // First-touch overlay: provides the iOS user-gesture needed for
        // DeviceOrientationEvent.requestPermission() and DeviceMotionEvent.requestPermission().
        // Also visible on Android to confirm the touch substrate is alive pre-combat.
        _ensureMotionPromptOverlay();
    }

    function setMobilePhase(phase) {
        mobilePhase = phase || '';
        if (!isMobile) return;

        const inCombat = mobilePhase === 'combat';
        const btnGroup = document.getElementById('mob-btn-group');
        const navSphere = document.getElementById('mob-nav-sphere');

        if (btnGroup) btnGroup.style.display = inCombat ? 'grid' : 'none';
        if (navSphere) navSphere.style.display = inCombat ? 'block' : 'none';

        if (!inCombat) {
            navActive = false;
            navTouchId = null;
            navDx = 0;
            navDy = 0;
            navThrust = false;
            _navUpdateVisual(0, 0);

            if (player) {
                player.afterburnerActive = false;
            }
            touchBtns.fireHeld = false;
            touchBtns.afterburnerHeld = false;
        }
    }

    function _bindGyroButton() {
        const btn = document.getElementById('mob-tilt');
        if (!btn) return;
        const imuSupported = (typeof window !== 'undefined') && (typeof DeviceOrientationEvent !== 'undefined');
        if (!imuSupported) {
            btn.classList.remove('active');
            btn.textContent = 'TOUCH';
            btn.disabled = true;
            btn.title = 'IMU not available. Using touch controls.';
            btn.style.opacity = '0.65';
            _setMobileModeBadge(false);
            return;
        }
        _syncGyroButtonVisual();
        btn.addEventListener('touchstart', async (e) => {
            e.preventDefault();
            await _toggleGyro();
            _syncGyroButtonVisual();
        }, { passive: false });
    }

    function _syncGyroButtonVisual() {
        const btn = document.getElementById('mob-tilt');
        if (btn) {
            btn.classList.toggle('active', !!gyroEnabled);
            btn.textContent = gyroEnabled ? 'TILT ON' : 'TILT';
        }
        // Body class drives D-pad yaw-arrow opacity (see SF-MOBILE-OVERHAUL CSS).
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('sf-gyro-on', !!gyroEnabled);
        }
        _setMobileModeBadge(!!gyroEnabled);
    }

    // ── D-pad (cockpit-seated 6-button fallback) ──────────────────────────
    // Tracks per-arrow hold state; each change recomputes navActive/navDx/
    // navDy/navThrust so applyInputToPlayer consumes them through the same
    // path the legacy thumb-stick used. Pitch corner buttons (↗ pitchUp,
    // ↘ pitchDn) drive navDy with the sphere's existing sign convention:
    // applyInputToPlayer does `player.pitch -= navDy * dt * 2.5`, so
    // navDy = -1 climbs (nose up) and navDy = +1 dives (nose down).
    const _dpadHeld = {
        up: false, down: false, left: false, right: false,
        pitchUp: false, pitchDn: false,
    };
    function _dpadApply() {
        const yaw   = (_dpadHeld.right   ? 1 : 0) - (_dpadHeld.left    ? 1 : 0);
        const pitch = (_dpadHeld.pitchDn ? 1 : 0) - (_dpadHeld.pitchUp ? 1 : 0);
        navDx = yaw;
        navDy = pitch;
        navActive = (yaw !== 0) || (pitch !== 0);
        navThrust = _dpadHeld.up;
        // _dpadHeld.down currently maps to "release thrust" (passive decel
        // already handled in applyInputToPlayer when navThrust=false).
    }
    function _bindDpad() {
        const map = [
            ['sf-dpad-up',      'up'],
            ['sf-dpad-down',    'down'],
            ['sf-dpad-left',    'left'],
            ['sf-dpad-right',   'right'],
            ['sf-dpad-pitchup', 'pitchUp'],
            ['sf-dpad-pitchdn', 'pitchDn'],
        ];
        for (let i = 0; i < map.length; i++) {
            const id = map[i][0];
            const key = map[i][1];
            const el = document.getElementById(id);
            if (!el) continue;
            const press = (e) => {
                if (e && e.preventDefault) e.preventDefault();
                _dpadHeld[key] = true;
                el.classList.add('held');
                _dpadApply();
                lastInputDevice = 'touch';
            };
            const release = (e) => {
                if (e && e.preventDefault) e.preventDefault();
                _dpadHeld[key] = false;
                el.classList.remove('held');
                _dpadApply();
            };
            el.addEventListener('touchstart',  press,   { passive: false });
            el.addEventListener('touchend',    release, { passive: false });
            el.addEventListener('touchcancel', release, { passive: false });
            // Mouse fallback for desktop QA / Chrome devtools mobile emulator
            el.addEventListener('mousedown',   press);
            el.addEventListener('mouseup',     release);
            el.addEventListener('mouseleave',  release);
        }
    }

    function _onDeviceOrientation(ev) {
        if (!gyroEnabled) return;
        if (typeof ev.beta !== 'number' || typeof ev.gamma !== 'number') return;
        if (gyroNeedsZero) {
            gyroZeroBeta = ev.beta;
            gyroZeroGamma = ev.gamma;
            gyroNeedsZero = false;
        }
        const relPitch = (ev.beta - gyroZeroBeta);
        const relYaw = (ev.gamma - gyroZeroGamma);
        const pitchNorm = Math.max(-1, Math.min(1, relPitch / 24));
        const yawNorm = Math.max(-1, Math.min(1, relYaw / 22));
        gyroPitchSmoothed += (pitchNorm - gyroPitchSmoothed) * GYRO_SMOOTH_ALPHA;
        gyroYawSmoothed += (yawNorm - gyroYawSmoothed) * GYRO_SMOOTH_ALPHA;
        gyroPitch = gyroPitchSmoothed;
        gyroYaw = gyroYawSmoothed;
    }

    function _ensureMobileModeBadge() {
        if (typeof document === 'undefined') return;
        if (modeBadgeEl && modeBadgeEl.isConnected) return;
        const host = document.getElementById('mobile-hud') || document.body;
        const el = document.createElement('div');
        el.id = 'mob-input-mode';
        el.style.cssText = [
            'position:fixed',
            'left:12px',
            'bottom:116px',
            'z-index:24',
            'padding:6px 10px',
            'border-radius:8px',
            'border:1px solid rgba(90,245,220,0.55)',
            'background:rgba(8,16,28,0.78)',
            'color:#a6fff0',
            'font:700 11px system-ui,sans-serif',
            'letter-spacing:.06em'
        ].join(';');
        host.appendChild(el);
        modeBadgeEl = el;
    }

    function _setMobileModeBadge(imuOn) {
        if (!isMobile) return;
        _ensureMobileModeBadge();
        if (!modeBadgeEl) return;
        modeBadgeEl.textContent = imuOn ? 'IMU ACTIVE' : 'TOUCH MODE';
        modeBadgeEl.style.borderColor = imuOn ? 'rgba(132,255,210,0.85)' : 'rgba(90,245,220,0.55)';
        modeBadgeEl.style.color = imuOn ? '#ccffe8' : '#a6fff0';
    }

    async function _toggleGyro() {
        try {
            if (typeof DeviceOrientationEvent === 'undefined') {
                gyroSupported = false;
                gyroEnabled = false;
                _setMobileModeBadge(false);
                return false;
            }
            if (!gyroEnabled) {
                if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    const perm = await DeviceOrientationEvent.requestPermission();
                    if (perm !== 'granted') return false;
                }
                window.addEventListener('deviceorientation', _onDeviceOrientation, true);
                gyroSupported = true;
                gyroEnabled = true;
                gyroNeedsZero = true;
                gyroPitch = 0;
                gyroYaw = 0;
                gyroPitchSmoothed = 0;
                gyroYawSmoothed = 0;
                _setMobileModeBadge(true);
                return true;
            }
            gyroEnabled = false;
            window.removeEventListener('deviceorientation', _onDeviceOrientation, true);
            gyroPitch = 0;
            gyroYaw = 0;
            gyroPitchSmoothed = 0;
            gyroYawSmoothed = 0;
            gyroNeedsZero = false;
            _setMobileModeBadge(false);
            return false;
        } catch (err) {
            console.warn('[SFInput] Gyro unavailable', err);
            gyroSupported = false;
            gyroEnabled = false;
            _setMobileModeBadge(false);
            return false;
        }
    }

    // ── DeviceMotionEvent (acceleration / shake) ─────────────────────────
    // Wired separately from deviceorientation because iOS gates each behind
    // its own requestPermission() call. Shake = countermeasure (or boost as
    // fallback if no countermeasure substrate exists on the game module).
    let _motionEnabled = false;
    let _accelMag = 0;
    let _accelMagPrev = 0;
    let _lastShakeMs = 0;
    const SHAKE_THRESHOLD = 22;       // m/s² delta — sharp wrist-flick territory
    const SHAKE_COOLDOWN_MS = 600;    // anti-double-fire window

    async function _requestMotionPermission() {
        try {
            if (typeof DeviceMotionEvent === 'undefined') return false;
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                const perm = await DeviceMotionEvent.requestPermission();
                if (perm !== 'granted') return false;
            }
            window.addEventListener('devicemotion', _onDeviceMotion, true);
            _motionEnabled = true;
            return true;
        } catch (err) {
            console.warn('[SFInput] DeviceMotion unavailable', err);
            return false;
        }
    }

    function _onDeviceMotion(ev) {
        const a = ev.accelerationIncludingGravity || ev.acceleration;
        if (!a) return;
        const m = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
        _accelMagPrev = _accelMag;
        _accelMag = m;
        const delta = Math.abs(m - _accelMagPrev);
        const now = performance.now();
        if (delta > SHAKE_THRESHOLD && (now - _lastShakeMs) > SHAKE_COOLDOWN_MS && mobilePhase === 'combat') {
            _lastShakeMs = now;
            lastInputDevice = 'touch';
            const SF = window.Starfighter;
            if (SF && typeof SF.deployCountermeasure === 'function') SF.deployCountermeasure();
            else if (SF && typeof SF.fireTorpedo === 'function') SF.fireTorpedo();
            else if (player && typeof player.activateBoost === 'function') player.activateBoost();
        }
    }

    // ── First-touch motion-controls overlay ──────────────────────────────
    // Exists so iOS can grant orientation/motion permission from a real user
    // gesture (a button press inside the overlay), and so Android users see
    // proof that the touch substrate is alive before they reach combat.
    function _ensureMotionPromptOverlay() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('mob-motion-prompt')) return;
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem('sf_motion_prompted') === '1') return;
        } catch (_) { /* private mode */ }

        const overlay = document.createElement('div');
        overlay.id = 'mob-motion-prompt';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:1000',
            'background:radial-gradient(ellipse at center, rgba(8,18,30,0.96), rgba(2,4,8,0.98))',
            'display:flex', 'align-items:center', 'justify-content:center',
            'font:600 15px/1.4 system-ui,sans-serif', 'color:#cdfff0',
            'padding:24px', 'box-sizing:border-box', '-webkit-tap-highlight-color:transparent'
        ].join(';');
        overlay.innerHTML = ''
            + '<div style="max-width:420px;text-align:center;border:1px solid rgba(90,245,220,0.55);'
            + 'border-radius:14px;padding:24px 22px;background:rgba(8,16,28,0.85);'
            + 'box-shadow:0 0 60px rgba(90,245,220,0.18) inset">'
            + '<div style="font:800 18px/1.2 system-ui,sans-serif;color:#a6fff0;letter-spacing:.05em;margin-bottom:10px">MOTION CONTROLS</div>'
            + '<div style="margin:0 0 16px 0;color:#9fd6cf">Tilt to fly · Tap to fire · Shake for countermeasure</div>'
            + '<button id="mob-motion-enable" style="display:block;width:100%;margin:0 0 10px 0;padding:14px 18px;'
            + 'border:1px solid rgba(132,255,210,0.85);border-radius:10px;background:rgba(20,80,70,0.55);'
            + 'color:#ccffe8;font:700 15px system-ui,sans-serif;letter-spacing:.04em">Enable Motion</button>'
            + '<button id="mob-motion-skip" style="display:block;width:100%;padding:12px 18px;'
            + 'border:1px solid rgba(90,245,220,0.35);border-radius:10px;background:transparent;'
            + 'color:#7fbfb5;font:600 13px system-ui,sans-serif;letter-spacing:.04em">Touch Only</button>'
            + '</div>';
        document.body.appendChild(overlay);

        const _persist = () => { try { localStorage.setItem('sf_motion_prompted', '1'); } catch (_) { } };
        const _close = () => { _persist(); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
        const _enable = async (e) => {
            if (e) e.preventDefault();
            // Order matters on iOS: orientation first, then motion. Both are
            // user-gesture-gated and called from within this touch handler.
            await _toggleGyro();
            await _requestMotionPermission();
            _syncGyroButtonVisual();
            _close();
        };
        const enableBtn = document.getElementById('mob-motion-enable');
        const skipBtn = document.getElementById('mob-motion-skip');
        if (enableBtn) {
            enableBtn.addEventListener('touchstart', _enable, { passive: false });
            enableBtn.addEventListener('click', _enable);
        }
        if (skipBtn) {
            skipBtn.addEventListener('touchstart', (e) => { e.preventDefault(); _close(); }, { passive: false });
            skipBtn.addEventListener('click', _close);
        }
    }



    function _isGameplayTouchTarget(target) {
        if (!target || !target.closest) return true;
        return !target.closest(
            '#mob-nav-sphere, #crosshair, #console-buttons, #mobile-hud .mob-btn, #mob-btn-group, #mission-panel, #tutorial-panel, #loading-screen, #launch-btn, #skip-launch-btn, #launch-bay-briefing, #launch-prompt, #tutorial-overlay, #tutorial-prompt-overlay, #rescue-bay-overlay, #bay-debrief, #respawn-overlay, #waveclear-overlay, #death-screen, #eliminated-overlay, #training-control-overlay, #training-skip-btn, #ctrl-hamburger, #sf-mobile-delta, #sf-controls-hint, #rescue-btn, #cm-deploy-btn, #cm-gauge-container, #sf-frigate-btn'
        );
    }

    function _combatTouchStart(e) {
        if (!isMobile) return;
        if (window.SFAudio) SFAudio.resume();

        const lp = document.getElementById('launch-prompt');
        if (lp && lp.style.display !== 'none' && lp.offsetParent !== null) {
            launchTriggered = true;
            return;
        }

        if (mobilePhase !== 'combat') return;
        if (!_isGameplayTouchTarget(e.target)) return;
        if (dragSteerActive || !e.changedTouches || !e.changedTouches.length) return;

        if (!gyroAutoPrompted && !gyroEnabled) {
            gyroAutoPrompted = true;
            _toggleGyro().then(() => _syncGyroButtonVisual()).catch(() => _syncGyroButtonVisual());
        }

        const t = e.changedTouches[0];
        dragSteerActive = true;
        dragSteerTouchId = t.identifier;
        dragSteerLastX = t.clientX;
        dragSteerLastY = t.clientY;
        dragSteerStartX = t.clientX;
        dragSteerStartY = t.clientY;
        dragSteerMovedPx = 0;
        dragSteerStartMs = performance.now();
        lastInputDevice = 'touch';
        e.preventDefault();
    }

    function _combatTouchMove(e) {
        if (!isMobile || !dragSteerActive) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier !== dragSteerTouchId) continue;

            const dx = t.clientX - dragSteerLastX;
            const dy = t.clientY - dragSteerLastY;
            dragSteerLastX = t.clientX;
            dragSteerLastY = t.clientY;

            dragSteerAccumX += dx;
            dragSteerAccumY += dy;

            const totalDx = t.clientX - dragSteerStartX;
            const totalDy = t.clientY - dragSteerStartY;
            dragSteerMovedPx = Math.max(dragSteerMovedPx, Math.hypot(totalDx, totalDy));
            lastInputDevice = 'touch';
            e.preventDefault();
            break;
        }
    }

    function _combatTouchEnd(e) {
        if (!isMobile || !dragSteerActive) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier !== dragSteerTouchId) continue;

            const touchMs = performance.now() - dragSteerStartMs;
            const isTap = dragSteerMovedPx <= TAP_MOVE_MAX_PX && touchMs <= TAP_TIME_MAX_MS;

            dragSteerActive = false;
            dragSteerTouchId = null;
            dragSteerMovedPx = 0;
            dragSteerStartMs = 0;

            if (isTap) {
                if (singleTapTimer) {
                    clearTimeout(singleTapTimer);
                    singleTapTimer = null;
                    if (window.Starfighter) window.Starfighter.fireTorpedo();
                } else {
                    singleTapTimer = setTimeout(() => {
                        singleTapTimer = null;
                        if (window.Starfighter) window.Starfighter.firePrimary();
                    }, DOUBLE_TAP_WINDOW_MS);
                }
            }

            e.preventDefault();
            break;
        }
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
        if (keys['KeyS']) { player.throttle = Math.max(-1, player.throttle - dt * 0.5); lastInputDevice = 'keyboard'; }

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
        if (isMobile && (dragSteerAccumX !== 0 || dragSteerAccumY !== 0)) {
            const dragX = Math.max(-42, Math.min(42, dragSteerAccumX));
            const dragY = Math.max(-42, Math.min(42, dragSteerAccumY));
            // One-finger gesture flight model:
            //   X drag => yaw (left/right steering)
            //   Y drag => throttle (forward swipe accelerates, back swipe decelerates)
            player.yaw = Math.max(-3.0, Math.min(3.0, (player.yaw || 0) - dragX * DRAG_STEER_GAIN));
            player.throttle = Math.max(0, Math.min(1, (player.throttle || 0) - dragY * DRAG_THROTTLE_GAIN));
            dragSteerAccumX = 0;
            dragSteerAccumY = 0;
            lastInputDevice = 'touch';
        }
        if (isMobile && gyroEnabled && !navActive && !dragSteerActive) {
            if (Math.abs(gyroYaw) > 0.03) player.yaw -= gyroYaw * dt * 2.7;
            if (Math.abs(gyroPitch) > 0.03) player.pitch -= gyroPitch * dt * 2.7;
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
        if (touchBtns['fireHeld']) {
            window.Starfighter.firePrimary();
            lastInputDevice = 'touch';
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

        // Arrow keys alternative for pitch/yaw when mouse-look is inactive
        if (!mouseLookActive) {
            if (keys['ArrowUp']) player.pitch += dt * 2.0;
            if (keys['ArrowDown']) player.pitch -= dt * 2.0;
            if (keys['ArrowLeft']) player.yaw += dt * 2.0;
            if (keys['ArrowRight']) player.yaw -= dt * 2.0;
        }

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
            if (lsy !== 0) player.throttle = Math.min(1, Math.max(-1, player.throttle - lsy * dt * 0.55));
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

        // Device auto-detection — primary hint shown in priority order:
        //   touch (mobile) → xr → gamepad/joystick → mouse → keyboard (backup)
        const devEl = e['detected-device'];
        if (devEl) {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const pad = pads[0];
            if (lastInputDevice === 'touch') {
                devEl.textContent = _motionEnabled || gyroEnabled ? 'TOUCH + MOTION' : 'TOUCH';
                devEl.style.color = '#0f8';
            } else if (lastInputDevice === 'xr' || _xrSession) {
                devEl.textContent = 'VR / WEBXR';
                devEl.style.color = '#a8f';
            } else if (lastInputDevice === 'gamepad' && pad) {
                const name = pad.id.length > 30 ? pad.id.substring(0, 30) + '…' : pad.id;
                const looksJoystick = /joystick|stick|t\.16|hotas|throttle/i.test(pad.id || '');
                devEl.textContent = (looksJoystick ? 'JOYSTICK: ' : 'GAMEPAD: ') + name;
                devEl.style.color = '#f80';
            } else if (lastInputDevice === 'keyboard') {
                devEl.textContent = 'KEYBOARD (backup) · MOUSE';
                devEl.style.color = '#5cf';
            } else {
                devEl.textContent = 'MOUSE · keyboard backup';
                devEl.style.color = '#0ff';
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

    // ── Wheel thrust direction — read by hud.js speed indicator ──────────
    let _lastWheelDir = 0;
    let _wheelDirTimer = null;
    function getWheelDir() { return _lastWheelDir; }

    // ── Joystick / HOTAS axis mapping ────────────────────────────────────
    // Standard HOTAS layout (Thrustmaster, CH, Logitech X52, etc.):
    //   axes[0] = stick X (roll/yaw)  axes[1] = stick Y (pitch)
    //   axes[2] = twist / rudder      axes[3] = hat X or secondary
    //   axes[4] = throttle slider     axes[5] = hat Y
    // Detected when pad.axes.length >= 6 (SFHud shows '🕹 JOYSTICK').
    function _applyJoystickAxes(pad, dt) {
        if (!pad || pad.axes.length < 6) return;
        const dead = 0.05;
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        const dz = v => Math.abs(v) < dead ? 0 : v;

        // Stick pitch / yaw
        const jx = dz(pad.axes[0] || 0);
        const jy = dz(pad.axes[1] || 0);
        if (jx !== 0) player.yaw = clamp((player.yaw || 0) + jx * dt * 3.0, -3, 3);
        if (jy !== 0) player.pitch = clamp((player.pitch || 0) + jy * dt * 3.0, -3, 3);

        // Twist / rudder → roll
        const twist = dz(pad.axes[2] || 0);
        if (twist !== 0) player.roll = clamp((player.roll || 0) + twist * dt * 2.0, -3, 3);

        // Throttle slider (axis 4 on HOTAS) — axis value is -1 (full back) to +1 (full fwd)
        const thr = pad.axes[4];
        if (thr !== undefined) {
            // Map from [-1,+1] (hardware) → [0,1] (game throttle)
            const mapped = ((-thr) + 1) / 2;   // full-back = 0, full-fwd = 1
            player.throttle = clamp(mapped, -1, 1);
        }
    }

    // ── WebXR / VR controller input ──────────────────────────────────────
    // Called every frame when an XR session is active.
    // XR controller mappings (Oculus/Meta Quest, Index, etc.):
    //   Primary (right) hand:  buttons[0]=trigger, [1]=squeeze, [4]=A, [5]=B
    //   Secondary (left) hand: buttons[0]=trigger, [1]=squeeze, [4]=X, [5]=Y
    //   axes[2] = thumbstick X,  axes[3] = thumbstick Y
    let _xrSession = null;
    let _xrRefSpace = null;

    function _applyXRControllers() {
        if (!_xrSession) return;
        const inputSources = _xrSession.inputSources;
        if (!inputSources) return;

        for (const src of inputSources) {
            const gp = src.gamepad;
            if (!gp) continue;
            const hand = src.handedness; // 'right' | 'left'

            const trigger = gp.buttons[0] ? gp.buttons[0].value : 0;
            const squeeze = gp.buttons[1] ? gp.buttons[1].pressed : false;
            const btnA = gp.buttons[4] ? gp.buttons[4].pressed : false;  // A / X
            const btnB = gp.buttons[5] ? gp.buttons[5].pressed : false;  // B / Y
            const stickX = gp.axes[2] || 0;
            const stickY = gp.axes[3] || 0;

            if (hand === 'right') {
                // Right trigger → fire laser (hold)
                if (trigger > 0.5 && window.Starfighter) window.Starfighter.firePrimary();
                // Right squeeze → lock on
                if (squeeze && !this._xrRSqueeze && window.Starfighter) window.Starfighter.tryLockOnTarget();
                this._xrRSqueeze = squeeze;
                // A → fire torpedo
                if (btnA && !this._xrA && window.Starfighter) window.Starfighter.fireTorpedo();
                this._xrA = btnA;
                // Right thumbstick Y → pitch
                if (Math.abs(stickY) > 0.08) player.pitch = Math.max(-3, Math.min(3, (player.pitch || 0) + stickY * 0.05));
                // Right thumbstick X → yaw
                if (Math.abs(stickX) > 0.08) player.yaw = Math.max(-3, Math.min(3, (player.yaw || 0) - stickX * 0.05));
            } else if (hand === 'left') {
                // Left trigger → afterburner
                player.afterburnerActive = trigger > 0.5;
                // Left thumbstick Y → throttle
                if (Math.abs(stickY) > 0.08) player.throttle = Math.min(1, Math.max(-1, (player.throttle || 0) - stickY * 0.04));
                // Left thumbstick X → roll
                if (Math.abs(stickX) > 0.08) player.roll = Math.max(-3, Math.min(3, (player.roll || 0) + stickX * 0.05));
                // X → cycle weapon
                if (btnA && !this._xrX && window.Starfighter) window.Starfighter.cycleWeapon();
                this._xrX = btnA;
                // Y → toggle flight assist
                if (btnB && !this._xrY && player) player.toggleFlightAssist && player.toggleFlightAssist();
                this._xrY = btnB;
            }
        }
    }

    // Initialise a WebXR immersive-vr session and hand it to Three.js renderer.
    function enterXR() {
        if (!navigator.xr) { console.warn('[SFInput] WebXR not supported'); return; }
        navigator.xr.requestSession('immersive-vr', {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['bounded-floor', 'hand-tracking'],
        }).then(session => {
            _xrSession = session;
            lastInputDevice = 'vr';
            session.addEventListener('end', () => {
                _xrSession = null;
                _xrRefSpace = null;
                lastInputDevice = 'keyboard';
                if (window.SFHud) SFHud.init && SFHud.init();
            });
            // Hand the session to Three.js renderer if available
            if (window.SF3D && SF3D.renderer) {
                SF3D.renderer.xr.enabled = true;
                SF3D.renderer.xr.setSession(session).catch(err => console.warn('[SFInput] XR setSession:', err));
            }
            session.requestReferenceSpace('local-floor')
                .then(rs => { _xrRefSpace = rs; })
                .catch(() => session.requestReferenceSpace('local').then(rs => { _xrRefSpace = rs; }));
        }).catch(err => console.warn('[SFInput] enterXR failed:', err));
    }

    // Patch update() to also call joystick + XR handlers each frame
    const _origUpdate = update;
    update = function (dt) {
        _origUpdate.call(this, dt);
        if (player) {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const pad = pads[0];
            if (pad && pad.axes.length >= 6) {
                // Joystick/HOTAS takes precedence when enough axes present
                _applyJoystickAxes(pad, dt);
            }
            _applyXRControllers.call(this);
        }
    };

    // Public gyro toggle for hamburger drawer (UI Contract phase 2).
    // Returns a Promise resolving to the new gyroEnabled state; the drawer
    // uses this to refresh its aria-pressed + label without reading globals.
    async function toggleGyro() {
        await _toggleGyro();
        _syncGyroButtonVisual();
        return gyroEnabled;
    }

    return {
        init, update, getLaunchTriggered, checkLaunch, isKeyDown,
        updateLivePanel, togglePanel, enterImmersive, enterXR,
        getWheelDir, setMobilePhase, isMobile: () => isMobile,
        toggleGyro
    };
})();

window.SFInput = SFInput;
