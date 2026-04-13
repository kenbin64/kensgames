/**
 * Starfighter Input
 * Mouse (Virtual Joystick), Keyboard, Gamepad API
 */

const SFInput = (function () {
    let player = null;
    const keys = {};
    let launchTriggered = false;
    let spacebarJustPressed = false;
    let lastInputDevice = 'keyboard'; // auto-detect: 'keyboard', 'gamepad'

    function init(p) {
        player = p;

        window.addEventListener('keydown', e => {
            keys[e.code] = true;
            // Resume audio on first user gesture
            if (window.SFAudio) SFAudio.resume();
            // Tab key toggles controls panel
            if (e.code === 'Tab') {
                e.preventDefault();
                const panel = document.getElementById('controls-panel');
                const toggle = document.getElementById('controls-toggle');
                if (panel && toggle) {
                    panel.classList.toggle('open');
                    toggle.innerText = panel.classList.contains('open') ? '◀' : '▶';
                }
                lastInputDevice = 'keyboard';
            }
        });
        window.addEventListener('keyup', e => { keys[e.code] = false; });

        // Pointer Lock API for precise FPS-style mouse steering
        document.addEventListener('mousedown', e => {
            // Resume audio on first user gesture
            if (window.SFAudio) SFAudio.resume();

            // Ignore touch UI buttons
            if (e.target.classList && e.target.classList.contains('action-btn')) return;

            if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            } else {
                if (e.button === 0) window.Starfighter.fireLaser();   // Left click — primary
                if (e.button === 2) window.Starfighter.fireTorpedo(); // Right click — torpedo (GDD §10.1)
                if (e.button === 1) window.Starfighter.fireTorpedo(); // Middle click — torpedo alt
            }
        });

        document.addEventListener('mousemove', e => {
            if (document.pointerLockElement === document.body) {
                player.yaw -= e.movementX * 0.003;
                player.pitch -= e.movementY * 0.003;
            }
        });

        // Prevent context menu
        document.addEventListener('contextmenu', e => e.preventDefault());

        // Simple touch buttons (only if elements exist)
        const btnUp = document.getElementById('btn-throttle-up');
        const btnDown = document.getElementById('btn-throttle-down');
        const btnFire = document.getElementById('btn-fire');
        if (btnUp) { btnUp.addEventListener('pointerdown', () => keys['KeyW'] = true); btnUp.addEventListener('pointerup', () => keys['KeyW'] = false); }
        if (btnDown) { btnDown.addEventListener('pointerdown', () => keys['KeyS'] = true); btnDown.addEventListener('pointerup', () => keys['KeyS'] = false); }
        if (btnFire) { btnFire.addEventListener('pointerdown', () => window.Starfighter.fireLaser()); }
    }

    function update(dt) {
        if (!player) return;

        // Throttle (W/S)
        if (keys['KeyW']) { player.throttle = Math.min(1, player.throttle + dt * 0.5); lastInputDevice = 'keyboard'; }
        if (keys['KeyS']) { player.throttle = Math.max(0, player.throttle - dt * 0.5); lastInputDevice = 'keyboard'; }

        // GDD §4.1: Afterburner (Shift hold)
        player.afterburnerActive = keys['ShiftLeft'] || keys['ShiftRight'];

        // Reset strafe each frame (set by keys below)
        player.strafeH = 0;
        player.strafeV = 0;

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
            if (pad && pad.axes[1] < -0.5) { // Left stick pushed forward (negative Y)
                launchTriggered = true;
            }
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

    return { init, update, getLaunchTriggered, checkLaunch, isKeyDown, updateLivePanel, togglePanel };
})();

window.SFInput = SFInput;
