/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROFILE GATE SUBSTRATE — KensGames
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralised auth + profile-setup enforcement.
 *
 * Rules:
 *   1. Google / Cloudflare / classic login all produce a `kg_token` in
 *      localStorage.  No password needed for OAuth users — token IS identity.
 *   2. After any login, players MUST have a playername + avatar (profileSetup)
 *      before entering any game lounge or game page.
 *   3. Guests arriving via an invite URL+code (sessionStorage kg_guest_token)
 *      are exempt — they pick a temp name/avatar inside invite/index.html.
 *   4. Playernames are unique (enforced server-side).
 *   5. Profile changes are blocked while a session is active (server-side).
 *
 * Usage:
 *   <script src="/js/substrates/profile_gate.js"></script>
 *   <script>
 *     KG_GATE.require().then(profile => { ... page init ... });
 *     // or with options:
 *     KG_GATE.require({ loginRedirect: '/login/', setupRedirect: '/player/setup.html' });
 *   </script>
 *
 * Returns the validated profile object: { userId, playername, avatarId, ... }
 * Rejects / redirects automatically for any failure.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  const API = '/api';

  // Avatar emoji map (keep in sync with invite/index.html + player/setup.html)
  const AVATARS = {
    wizard: '🧙', knight: '🛡️', robot: '🤖', alien: '👾',
    ninja: '🥷', astronaut: '👨‍🚀', dragon: '🐉', phoenix: '🦅',
    fox: '🦊', wolf: '🐺', cat: '😼', ghost: '👻',
    skull: '💀', fire: '🔥', lightning: '⚡', star: '⭐',
    diamond: '💎', crown: '👑',
  };

  // ── Internal helpers ───────────────────────────────────────────────────────

  function getAuthToken() {
    return localStorage.getItem('kg_token') || null;
  }

  function getGuestToken() {
    return sessionStorage.getItem('kg_guest_token') || null;
  }

  function isGuest() {
    return !!getGuestToken() && !getAuthToken();
  }

  function currentPath() {
    return window.location.pathname + window.location.search;
  }

  function goLogin(loginRedirect) {
    const target = loginRedirect || '/login/';
    const back = encodeURIComponent(currentPath());
    window.location.replace(`${target}?redirect=${back}`);
  }

  function goSetup(setupRedirect) {
    const target = setupRedirect || '/player/setup.html';
    const back = encodeURIComponent(currentPath());
    window.location.replace(`${target}?redirect=${back}`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Require a fully set-up authenticated user.
   * Guests (invite code players) pass through without profileSetup check.
   *
   * @param {object} [opts]
   *   opts.allowGuest    {boolean} default true  — allow sessionStorage guest tokens
   *   opts.loginRedirect {string}  default '/login/'
   *   opts.setupRedirect {string}  default '/player/setup.html'
   *   opts.onProfile     {function(profile)} — called when profile is ready (alt to .then())
   * @returns {Promise<object>} resolved profile, or never resolves (redirecting)
   */
  function require(opts) {
    opts = opts || {};
    const allowGuest = opts.allowGuest !== false;
    const loginRedirect = opts.loginRedirect || '/login/';
    const setupRedirect = opts.setupRedirect || '/player/setup.html';

    return new Promise(function (resolve) {
      // ── Guest path: sessionStorage token, no profileSetup required ──────
      if (allowGuest && isGuest()) {
        const guestToken = getGuestToken();
        // Minimal guest profile from sessionStorage
        const profile = {
          isGuest: true,
          guestToken: guestToken,
          playername: sessionStorage.getItem('kg_guest_name') || 'Guest',
          avatarId: sessionStorage.getItem('kg_guest_avatar') || 'robot',
          get avatarEmoji() { return AVATARS[this.avatarId] || '🤖'; },
        };
        if (opts.onProfile) opts.onProfile(profile);
        return resolve(profile);
      }

      // ── Auth path: must have kg_token ────────────────────────────────────
      const token = getAuthToken();
      if (!token) {
        return goLogin(loginRedirect);
      }

      fetch(`${API}/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(function (r) {
          if (!r.ok) {
            localStorage.removeItem('kg_token');
            return goLogin(loginRedirect);
          }
          return r.json();
        })
        .then(function (d) {
          if (!d || !d.valid) {
            localStorage.removeItem('kg_token');
            return goLogin(loginRedirect);
          }

          // Must have completed setup (playername + avatar + TOS)
          if (!d.profileSetup) {
            return goSetup(setupRedirect);
          }

          const profile = {
            isGuest: false,
            userId: d.userId,
            playername: d.playername,
            avatarId: d.avatarId,
            get avatarEmoji() { return AVATARS[this.avatarId] || '🎮'; },
            token: token,
          };

          if (opts.onProfile) opts.onProfile(profile);
          resolve(profile);
        })
        .catch(function () {
          // Network error — don't kill the page, but can't validate
          goLogin(loginRedirect);
        });
    });
  }

  /**
   * Soft check — returns profile or null without redirecting.
   * Useful for pages that show different UI for logged-in vs guest users.
   */
  function check() {
    const token = getAuthToken();
    if (!token) return Promise.resolve(null);
    return fetch(`${API}/auth/validate`, { headers: { Authorization: `Bearer ${token}` } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.valid) return null;
        return {
          isGuest: false,
          userId: d.userId,
          playername: d.playername,
          avatarId: d.avatarId,
          profileSetup: d.profileSetup,
          token: token,
        };
      })
      .catch(function () { return null; });
  }

  /**
   * Sign out: clear kg_token, then route through Cloudflare Access logout
   * so the CF Access session cookie is also cleared.
   * CF will redirect back to `redirect` (or /login/) after clearing the cookie.
   */
  function signOut(redirect) {
    localStorage.removeItem('kg_token');
    localStorage.removeItem('kg_user_id');
    localStorage.removeItem('kg_username');
    localStorage.removeItem('kg_display_name');
    localStorage.removeItem('kg_avatar');
    sessionStorage.removeItem('kg_guest_token');
    sessionStorage.removeItem('kg_guest_name');
    sessionStorage.removeItem('kg_guest_avatar');
    var dest = encodeURIComponent(redirect || '/login/');
    window.location.href = '/cdn-cgi/access/logout?redirect=' + dest;
  }

  // Expose avatar map for pages that need it
  root.KG_GATE = { require: require, check: check, signOut: signOut, AVATARS: AVATARS };

}(window));
