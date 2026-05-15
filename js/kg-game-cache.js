/* kg-game-cache.js
 *
 * Centralised purge of cached *game runtime* state (NOT player identity).
 *
 * Use this anywhere a game/session ends so the next launch starts from a
 * clean slate and never resurrects a dead session via stale localStorage /
 * sessionStorage:
 *
 *   - Host clicks "Cancel Game" in the lobby
 *   - Server broadcasts `session_cancelled`
 *   - A FastTrack game ends (winner declared)
 *   - A player leaves a room
 *   - A `game_over` is broadcast
 *
 * What this PURGES:
 *   - localStorage: KG_Game, KG_Player, kg_session_id, kg_session_code,
 *                   fasttrack-lobby, fasttrack_player_name, fasttrack_player_avatar
 *   - sessionStorage: kg_session, kg_fasttrack_runtime, ft_session_players,
 *                     ft_my_user_id
 *
 * What this KEEPS (player identity / preferences):
 *   - username, kg_avatar, display_name
 *   - kg_guest_id, kg_guest_token (so seat reclaim still works)
 *   - kg_session_started flag (per-tab purge marker — see session-identity.js)
 */
(function () {
  'use strict';

  var LOCAL_RUNTIME_KEYS = [
    'KG_Game',
    'KG_Player',
    'kg_session_id',
    'kg_session_code',
    'fasttrack-lobby',
    'fasttrack_player_name',
    'fasttrack_player_avatar',
  ];

  var SESSION_RUNTIME_KEYS = [
    'kg_session',
    'kg_fasttrack_runtime',
    'ft_session_players',
    'ft_my_user_id',
  ];

  function purgeRuntime(reason) {
    try {
      if (window.localStorage) {
        LOCAL_RUNTIME_KEYS.forEach(function (k) {
          try { localStorage.removeItem(k); } catch (_) { }
        });
      }
    } catch (_) { }
    try {
      if (window.sessionStorage) {
        SESSION_RUNTIME_KEYS.forEach(function (k) {
          try { sessionStorage.removeItem(k); } catch (_) { }
        });
      }
    } catch (_) { }
    try {
      if (window.KG_Game) window.KG_Game = null;
    } catch (_) { }
    try {
      // Best-effort console breadcrumb so post-mortem of a stuck session is
      // easier — never throws.
      if (window.console && console.info) {
        console.info('[kg-cache] runtime purged' + (reason ? ' (' + reason + ')' : ''));
      }
    } catch (_) { }
  }

  window.KGGameCache = {
    purgeRuntime: purgeRuntime,
    LOCAL_RUNTIME_KEYS: LOCAL_RUNTIME_KEYS.slice(),
    SESSION_RUNTIME_KEYS: SESSION_RUNTIME_KEYS.slice(),
  };
})();
