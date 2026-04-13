/**
 * Manifold Native Bridge — Platform Abstraction Layer
 *
 * Detects runtime environment (Browser, Electron, Capacitor) and provides
 * unified APIs that work across all platforms. This is the "z = x * y"
 * dimensional fold: one codebase, three native surfaces.
 *
 *   Browser    (x) — web portal, kensgames.com
 *   Electron   (y) — Steam/Desktop native (Windows, Mac, Linux)
 *   Capacitor  (z) — Mobile native (Android via Google Play, iOS via App Store)
 *
 * The game code calls ManifoldNative.* — this bridge resolves to the right platform.
 */
const ManifoldNative = (function () {

  // ── Platform detection ──
  const isElectron = !!(window.NativeApp && window.NativeApp.isElectron);
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const isBrowser = !isElectron && !isCapacitor;

  const platform = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'browser';

  // ── Fullscreen ──
  function enterFullscreen() {
    if (isElectron) {
      // Electron: already fullscreen at launch, but can toggle
      if (window.NativeApp.toggleFullscreen) window.NativeApp.toggleFullscreen();
    } else if (isCapacitor) {
      // Capacitor: StatusBar hide + immersive mode via plugin
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
        window.Capacitor.Plugins.StatusBar.hide();
      }
    } else {
      // Browser: standard Fullscreen API
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) req.call(el);
    }
  }

  function exitFullscreen() {
    if (isBrowser) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  function isFullscreen() {
    if (isElectron) return true; // always fullscreen in Electron
    if (isCapacitor) return true; // always fullscreen in native mobile
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  // ── Haptics ──
  function vibrate(intensity, duration) {
    if (isElectron && window.NativeApp.vibrate) {
      window.NativeApp.vibrate(intensity, duration);
    } else if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      window.Capacitor.Plugins.Haptics.impact({ style: intensity > 0.5 ? 'heavy' : 'medium' });
    } else if (navigator.vibrate) {
      navigator.vibrate(duration || 50);
    }
  }

  // ── Steam integration (Electron only) ──
  const steam = {
    isAvailable: isElectron && window.NativeApp && window.NativeApp.steam && window.NativeApp.steam.isAvailable,
    getUsername: () => isElectron && window.NativeApp.steam ? window.NativeApp.steam.getUsername() : null,
    unlockAchievement: (id) => {
      if (isElectron && window.NativeApp.steam) window.NativeApp.steam.unlockAchievement(id);
    }
  };

  // ── Screen orientation (Capacitor/mobile) ──
  function lockLandscape() {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation) {
      window.Capacitor.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
    } else if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => { });
    }
  }

  // ── Pointer lock (browser-specific, native apps don't need it) ──
  function requestPointerLock() {
    if (isBrowser) {
      document.body.requestPointerLock();
    }
    // Electron + Capacitor: cursor is already hidden natively
  }

  function exitPointerLock() {
    if (isBrowser && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  function isPointerLocked() {
    if (isElectron || isCapacitor) return true;
    return document.pointerLockElement === document.body;
  }

  console.log(`ManifoldNative: platform=${platform}`);

  return {
    platform,
    isElectron,
    isCapacitor,
    isBrowser,
    enterFullscreen,
    exitFullscreen,
    isFullscreen,
    vibrate,
    steam,
    lockLandscape,
    requestPointerLock,
    exitPointerLock,
    isPointerLocked,
  };
})();

window.ManifoldNative = ManifoldNative;
