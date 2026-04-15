/**
 * 🜂 MANIFOLD NATIVE SUBSTRATE
 * z = xy²  —  platform as a dimension, not a branch
 *
 * Folds ManifoldNative platform capabilities into the SpaceManifold dim() system.
 * Game code calls dim('native.*') — the substrate resolves to the right value
 * for whatever platform (browser / electron / capacitor) is currently running.
 *
 * Instead of:   if (isElectron) { ... } else { ... }
 * Write:         dim('native.pointerLock.persistent')   → true / false
 *
 * This is the Manifold fold: x = game logic, y = platform matrix, z = behavior.
 * The game code doesn't branch — the substrate is the lens.
 */
(function () {
    // Wait for SpaceManifold + ManifoldNative to both be ready
    function _init() {
        const SM = window.SpaceManifold;
        const N = window.ManifoldNative;
        if (!SM || !N) {
            setTimeout(_init, 50);
            return;
        }

        const set = (k, v) => SM.setDim(k, v);
        const p = N.platform; // 'browser' | 'electron' | 'capacitor'

        // ── Platform identity ──
        set('native.platform',          p);
        set('native.isElectron',        N.isElectron);
        set('native.isCapacitor',       N.isCapacitor);
        set('native.isBrowser',         N.isBrowser);

        // ── Pointer lock ──
        // Electron: pointer lock is never forcibly broken by the OS/browser
        // Browser: ESC always breaks it — game must show a resume prompt
        // Capacitor: no pointer lock concept — touch controls only
        set('native.pointerLock.persistent',    N.isElectron);
        set('native.pointerLock.available',     !N.isCapacitor);
        set('native.pointerLock.escBreaks',     N.isBrowser);

        // ── Fullscreen ──
        // Electron: fullscreen at OS level, no browser chrome, no status bar
        // Browser: requestFullscreen API, user can exit with F11/ESC
        // Capacitor: fullscreen via StatusBar.hide(), truly native
        set('native.fullscreen.native',         !N.isBrowser);
        set('native.fullscreen.chromeless',     N.isElectron);

        // ── Input capabilities ──
        set('native.input.gamepad',     true);   // all platforms via Gamepad API
        set('native.input.mouse',       !N.isCapacitor);
        set('native.input.touch',       N.isCapacitor || ('ontouchstart' in window));
        set('native.input.keyboard',    !N.isCapacitor);

        // ── Store submission targets ──
        set('native.store.steam',       N.isElectron && !!(N.steam && N.steam.isAvailable));
        set('native.store.play',        N.isCapacitor && /android/i.test(navigator.userAgent));
        set('native.store.appstore',    N.isCapacitor && /iphone|ipad/i.test(navigator.userAgent));
        set('native.store.web',         N.isBrowser);

        // ── GPU / Performance tier ──
        // Electron: full GPU access via Chromium without sandbox restrictions
        // Browser: WebGL2 sandboxed, some extensions blocked
        // Capacitor: mobile GPU — conservative settings
        const gpuTier = N.isElectron ? 'high' : N.isCapacitor ? 'mobile' : 'web';
        set('native.gpu.tier',          gpuTier);
        set('native.gpu.shadowQuality', N.isElectron ? 2048 : N.isCapacitor ? 512 : 1024);
        set('native.gpu.drawDistance',  N.isElectron ? 18000 : N.isCapacitor ? 6000 : 12000);
        set('native.gpu.anisotropy',    N.isElectron ? 16 : N.isCapacitor ? 2 : 4);

        // ── UI behaviour ──
        // Browser shows resume overlay on ESC; Electron handles ESC natively
        set('native.ui.showResumeOverlay',  N.isBrowser);
        set('native.ui.showPauseMenu',      N.isElectron);
        set('native.ui.cursorNeedsLock',    !N.isCapacitor);

        // ── Haptics ──
        set('native.haptics.available',
            N.isCapacitor || (typeof navigator.vibrate === 'function'));

        console.log(`[ManifoldNative] substrate stamped — platform=${p} gpu.tier=${gpuTier} pointerLock.persistent=${N.isElectron}`);
    }

    _init();
})();
