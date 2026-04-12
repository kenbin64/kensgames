/**
 * Starfighter Input
 * Mouse (Virtual Joystick), Keyboard, Gamepad API
 */

const SFInput = (function () {
    let player = null;
    const keys = {};
    let launchTriggered = false;
    let spacebarJustPressed = false;

    function init(p) {
        player = p;

        window.addEventListener('keydown', e => {
            keys[e.code] = true;
            // H key toggles controls panel
            if (e.code === 'KeyH') {
                const panel = document.getElementById('controls-panel');
                const toggle = document.getElementById('controls-toggle');
                if (panel && toggle) {
                    panel.classList.toggle('open');
                    toggle.innerText = panel.classList.contains('open') ? '◀' : '▶';
                }
            }
        });
        window.addEventListener('keyup', e => { keys[e.code] = false; });

        // Pointer Lock API for precise FPS-style mouse steering
        document.addEventListener('mousedown', e => {
            // Ignore touch UI buttons
            if (e.target.classList && e.target.classList.contains('action-btn')) return;

            if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            } else {
                if (e.button === 0 || e.button === 2) window.Starfighter.fireLaser(); // Left/Right click
                if (e.button === 1) window.Starfighter.fireTorpedo(); // Middle click
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
        if (keys['KeyW']) player.throttle = Math.min(1, player.throttle + dt * 0.5);
        if (keys['KeyS']) player.throttle = Math.max(0, player.throttle - dt * 0.5);

        // Turbo Thrust
        player.turboActive = keys['ShiftLeft'] || keys['ShiftRight'];

        // Roll (Q/E)
        if (keys['KeyQ']) player.roll += dt * 2.0;
        if (keys['KeyE']) player.roll -= dt * 2.0;

        // Arrow keys alternative
        if (keys['ArrowUp']) player.pitch += dt * 2.0;
        if (keys['ArrowDown']) player.pitch -= dt * 2.0;
        if (keys['ArrowLeft']) player.yaw += dt * 2.0;
        if (keys['ArrowRight']) player.yaw -= dt * 2.0;

        if (keys['Space']) window.Starfighter.fireLaser();

        // Let's use a flag to only fire one torpedo per keypress to prevent rapid firing
        if (keys['KeyF']) {
            if (!this.fPressed) {
                window.Starfighter.fireTorpedo();
                this.fPressed = true;
            }
        } else {
            this.fPressed = false;
        }

        if (keys['KeyT']) {
            if (!this.tPressed) {
                window.Starfighter.tryLockOnTarget();
                this.tPressed = true;
            }
        } else {
            this.tPressed = false;
        }

        // Gamepad API
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[0];
        if (pad) {
            // Left stick: Pitch / Yaw
            if (Math.abs(pad.axes[1]) > 0.1) player.pitch += -pad.axes[1] * dt * 2.0; // Invert Y
            if (Math.abs(pad.axes[0]) > 0.1) player.yaw += -pad.axes[0] * dt * 2.0;

            // Right stick X / Bumpers: Roll
            if (Math.abs(pad.axes[2]) > 0.1) player.roll += -pad.axes[2] * dt * 2.0;

            // Triggers / Buttons for throttle
            if (pad.buttons[7].pressed) player.throttle = Math.min(1, player.throttle + dt * 0.5); // RT
            if (pad.buttons[6].pressed) player.throttle = Math.max(0, player.throttle - dt * 0.5); // LT

            // Turbo
            if (pad.buttons[4] && pad.buttons[4].pressed) player.turboActive = true; // LB

            // Fire
            if (pad.buttons[0].pressed) window.Starfighter.fireLaser(); // A
            if (pad.buttons[2] && pad.buttons[2].pressed) { // X button
                if (!this.padXPressed) {
                    window.Starfighter.fireTorpedo();
                    this.padXPressed = true;
                }
            } else {
                this.padXPressed = false;
            }

            // Target Lock
            if (pad.buttons[3] && pad.buttons[3].pressed) { // Y button
                if (!this.padYPressed) {
                    window.Starfighter.tryLockOnTarget();
                    this.padYPressed = true;
                }
            } else {
                this.padYPressed = false;
            }
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

    return { init, update, getLaunchTriggered, checkLaunch, isKeyDown };
})();

window.SFInput = SFInput;
