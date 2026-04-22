/**
 * KensGames - Game Landing Shared Logic
 * window.KG_LANDING
 *
 * Include on every game landing page (index.html).
 * Must be loaded after game_session_substrate.js.
 *
 * Usage:
 *   <script src="/js/substrates/game_session_substrate.js"></script>
 *   <script src="/js/game_landing.js"></script>
 *   <script> KG_LANDING.init('fasttrack', '/fasttrack/lobby/'); </script>
 */
(function (global) {
  'use strict';

  const API = '/api';

  let _gameId = null;
  let _lobbyPath = null;

  // -- init ------------------------------------------------------------------

  async function init(gameId, lobbyPath) {
    _gameId = gameId;
    _lobbyPath = lobbyPath;

    const token = localStorage.getItem('kg_token');
    if (!token) {
      _showGuestCTAs();
      return;
    }

    try {
      const r = await fetch(`${API}/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        _showAuthCTAs();
      } else {
        localStorage.removeItem('kg_token');
        _showGuestCTAs();
      }
    } catch {
      _showGuestCTAs();
    }
  }

  // -- CTA injection ---------------------------------------------------------
  // Replaces .hero-ctas / #hero-ctas content based on auth state.

  function _showAuthCTAs() {
    const container = document.getElementById('hero-ctas') || document.querySelector('.hero-ctas');
    if (!container) return;
    container.innerHTML = `
      <button class="cta-primary" id="solo-btn" onclick="KG_LANDING.playSolo(this)">\u25b6 PLAY SOLO</button>
      <button class="cta-secondary" onclick="KG_LANDING.playWithBots(3, this)">\ud83e\udd16 VS 3 BOTS</button>
      <button class="cta-secondary" onclick="KG_LANDING.createPrivate(this)">\ud83d\udd17 PRIVATE GAME</button>
      <button class="cta-secondary" onclick="KG_LANDING.createPublic(this)">\ud83c\udf10 PUBLIC GAME</button>
    `;
  }

  function _showGuestCTAs() {
    const container = document.getElementById('hero-ctas') || document.querySelector('.hero-ctas');
    if (!container) return;
    container.innerHTML = `
      <button class="cta-primary" id="solo-btn" onclick="KG_LANDING.playSolo(this)">\u25b6 PLAY SOLO</button>
      <a href="/login/index.html" class="cta-secondary">SIGN IN FOR MULTIPLAYER</a>
    `;
  }

  // -- solo (1 bot) ----------------------------------------------------------

  async function playSolo(btnEl) {
    if (!_gameId) return;
    _setBusy(btnEl, 'Starting\u2026');
    try {
      const d = await KG_SESSION.create(_gameId, 'solo', 1);
      if (d.gameUrl) { window.location.href = d.gameUrl; return; }
      throw new Error('No game URL returned');
    } catch (err) {
      _clearBusy(btnEl, '\u25b6 PLAY SOLO');
      _showError(err.message || 'Could not start game');
    }
  }

  // -- solo with N bots ------------------------------------------------------

  async function playWithBots(bots, btnEl) {
    if (!_gameId) return;
    if (!KG_SESSION.isLoggedIn()) { window.location.href = '/login/index.html'; return; }
    const label = `\ud83e\udd16 VS ${bots} BOTS`;
    _setBusy(btnEl, 'Starting\u2026');
    try {
      const d = await KG_SESSION.create(_gameId, 'solo', bots);
      if (d.gameUrl) { window.location.href = d.gameUrl; return; }
      throw new Error('No game URL returned');
    } catch (err) {
      _clearBusy(btnEl, label);
      _showError(err.message || 'Could not start game');
    }
  }

  // -- create private game (generates invite code -> lobby) ------------------

  async function createPrivate(btnEl) {
    if (!_gameId) return;
    if (!KG_SESSION.isLoggedIn()) { window.location.href = '/login/index.html'; return; }
    _setBusy(btnEl, 'Creating\u2026');
    try {
      const d = await KG_SESSION.create(_gameId, 'private', 0);
      if (d.sessionId) {
        window.location.href = `${_lobbyPath}?session=${encodeURIComponent(d.sessionId)}`;
      } else if (d.inviteUrl) {
        window.location.href = d.inviteUrl;
      } else {
        throw new Error('No session returned');
      }
    } catch (err) {
      _clearBusy(btnEl, '\ud83d\udd17 PRIVATE GAME');
      _showError(err.message || 'Could not create game');
    }
  }

  // -- create public game ----------------------------------------------------

  async function createPublic(btnEl) {
    if (!_gameId) return;
    if (!KG_SESSION.isLoggedIn()) { window.location.href = '/login/index.html'; return; }
    _setBusy(btnEl, 'Creating\u2026');
    try {
      const d = await KG_SESSION.create(_gameId, 'public', 0);
      if (d.sessionId) {
        window.location.href = `${_lobbyPath}?session=${encodeURIComponent(d.sessionId)}`;
      } else if (d.inviteUrl) {
        window.location.href = d.inviteUrl;
      } else {
        throw new Error('No session returned');
      }
    } catch (err) {
      _clearBusy(btnEl, '\ud83c\udf10 PUBLIC GAME');
      _showError(err.message || 'Could not create game');
    }
  }

  // -- join via invite code --------------------------------------------------

  function openInviteJoin(code) {
    if (!code || !code.trim()) { _showError('Enter an invite code'); return; }
    const game = _gameId || '';
    window.location.href = `/invite/?code=${encodeURIComponent(code.trim().toUpperCase())}&game=${encodeURIComponent(game)}`;
  }

  // -- helpers ---------------------------------------------------------------

  function _setBusy(btn, text) {
    if (!btn) return;
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.textContent = text;
  }

  function _clearBusy(btn, fallback) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn._origText || fallback || 'RETRY';
  }

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
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  // -- expose ----------------------------------------------------------------

  global.KG_LANDING = { init, playSolo, playWithBots, createPrivate, createPublic, openInviteJoin };
})(window);
