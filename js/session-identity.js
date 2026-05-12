/* session-identity.js
 *
 * Per-tab-session identity purge for kensgames.com.
 *
 * Behavior:
 *   - On the FIRST script execution of a new tab session (browser open / reload
 *     after close), wipe every cached identity key from localStorage, drop the
 *     Cache Storage API entries, and unregister any service workers. This forces
 *     each game to re-prompt for player name + avatar instead of inheriting a
 *     stale identity (e.g. "Ted") from a prior visit.
 *   - The purge is gated by a sessionStorage flag so it runs ONCE per tab
 *     session. Within the same session (game-to-game navigation, replays) the
 *     identity that the user just entered persists naturally.
 *
 * IMPORTANT: load this BEFORE any other script that reads identity. Place it as
 * the first <script> tag in <head>.
 */
(function () {
  'use strict';
  try {
    var FLAG = 'kg_session_started';
    if (window.sessionStorage && sessionStorage.getItem(FLAG) === '1') {
      // Same tab session — leave everything alone.
      return;
    }

    // Identity keys to purge. Add new keys here as games introduce them.
    var IDENTITY_KEYS = [
      'username',
      'display_name',
      'kg_avatar',
      'kg_guest_id',
      'kg_guest_token',
      'kg_session_id',
      'kg_session_code',
      'KG_Game',
      'KG_Player',
      'kg_session',
      'kg_fasttrack_runtime',
      'fasttrack_player_name',
      'fasttrack_player_avatar',
      'fasttrack-lobby'
    ];

    if (window.localStorage) {
      for (var i = 0; i < IDENTITY_KEYS.length; i++) {
        try { localStorage.removeItem(IDENTITY_KEYS[i]); } catch (_) { }
      }
    }

    // Drop browser Cache Storage API entries (PWA / fetch caches).
    if (window.caches && caches.keys) {
      caches.keys().then(function (names) {
        names.forEach(function (n) {
          try { caches.delete(n); } catch (_) { }
        });
      }).catch(function () { });
    }

    // Unregister any service workers so a fresh launch never serves stale code.
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) {
          try { r.unregister(); } catch (_) { }
        });
      }).catch(function () { });
    }

    if (window.sessionStorage) {
      try { sessionStorage.setItem(FLAG, '1'); } catch (_) { }
    }
  } catch (_) {
    // Never block page load on identity purge.
  }
})();
