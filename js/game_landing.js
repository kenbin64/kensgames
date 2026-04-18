/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KensGames — Game Landing Shared Logic
 * window.KG_LANDING
 *
 * Include on every game landing page (index.html).
 * Must be loaded after game_session_substrate.js.
 *
 * Usage:
 *   <script src="/js/substrates/game_session_substrate.js"></script>
 *   <script src="/js/game_landing.js"></script>
 *   <script> KG_LANDING.init('fasttrack', '/fasttrack/lobby.html'); </script>
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  const API = '/api';

  let _gameId = null;
  let _lobbyPath = null;

  // ── init ─────────────────────────────────────────────────────────────────

  async function init(gameId, lobbyPath) {
    _gameId = gameId;
    _lobbyPath = lobbyPath;

    const token = localStorage.getItem('kg_token');
    if (!token) return; // guest / not logged in — stay on landing page

    try {
      const r = await fetch(`${API}/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        // Logged-in user — send straight to lobby
        window.location.replace(lobbyPath);
      }
    } catch {
      // Network error — stay on landing page
    }
  }

  // ── solo play ────────────────────────────────────────────────────────────

  async function playSolo(btnEl) {
    if (!_gameId) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Starting…'; }
    try {
      const d = await KG_SESSION.create(_gameId, 'solo', 1);
      if (d.gameUrl) {
        window.location.href = d.gameUrl;
      } else {
        throw new Error('No game URL returned');
      }
    } catch (err) {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Play Solo (1 Bot)'; }
      _showError(err.message || 'Could not start solo game');
    }
  }

  // ── invite code join ─────────────────────────────────────────────────────

  function openInviteJoin(code) {
    if (!code || !code.trim()) { _showError('Enter an invite code'); return; }
    const game = _gameId || '';
    window.location.href = `/invite/?code=${encodeURIComponent(code.trim().toUpperCase())}&game=${encodeURIComponent(game)}`;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  function _showError(msg) {
    let el = document.getElementById('kg-landing-err');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kg-landing-err';
      el.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1a0005;border:1px solid #ff4d4d;border-radius:8px;padding:0.75rem 1.25rem;color:#ff4d4d;font-size:0.8rem;z-index:999;max-width:300px';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // ── expose ───────────────────────────────────────────────────────────────

  global.KG_LANDING = { init, playSolo, openInviteJoin };
})(window);
