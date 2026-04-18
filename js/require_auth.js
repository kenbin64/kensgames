/* KensGames — Require Auth Guard
   Used by gameplay pages to enforce: public promo pages, but sign-in required to play.
   Supports Cloudflare Access → KensGames JWT hydration via /api/auth/access-session.
*/

(function () {
  'use strict';

  const TOKEN_KEY = 'user_token';

  function isGuestToken(token) {
    if (!token) return true;
    return String(token).startsWith('guest-');
  }

  function hasSignedInToken(token) {
    return !!token && !isGuestToken(token);
  }

  async function ensureTokenFromAccess() {
    try {
      const res = await fetch('/api/auth/access-session', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });

      const ct = (res && res.headers && res.headers.get('content-type')) || '';
      if (!res || !res.ok) return null;
      if (!ct.includes('application/json')) return null;

      const data = await res.json().catch(() => null);
      const token = data && data.token;
      if (!token) return null;

      try {
        localStorage.setItem(TOKEN_KEY, token);
        if (data.username) localStorage.setItem('username', data.username);
        if (data.displayName) localStorage.setItem('display_name', data.displayName);
        if (data.user_id) localStorage.setItem('user_id', data.user_id);
      } catch (e) {
        // ignore
      }

      return token;
    } catch (e) {
      return null;
    }
  }

  function redirectToAccessLogin() {
    const target = window.location.pathname + window.location.search + window.location.hash;
    const h = window.location.hostname;
    const isLocal = (h === 'localhost' || h === '127.0.0.1');
    if (isLocal) {
      window.location.replace('/login?redirect=' + encodeURIComponent(target));
      return;
    }
    window.location.replace('/cdn-cgi/access/login?redirect_url=' + encodeURIComponent(target));
  }

  /**
   * Guard a page that requires sign-in.
   *
   * Options:
   * - allowGuest: boolean (default false) — allow guest tokens (invite flows)
   * - allowIf: () => boolean — extra condition to allow without sign-in
   */
  async function guard(options) {
    const allowGuest = !!(options && options.allowGuest);
    const allowIf = options && typeof options.allowIf === 'function' ? options.allowIf : null;

    try {
      if (allowIf && allowIf()) {
        return { allowed: true, token: localStorage.getItem(TOKEN_KEY) || null };
      }
    } catch (e) {
      // ignore allowIf errors; proceed with normal gating
    }

    let token = null;
    try { token = localStorage.getItem(TOKEN_KEY) || null; } catch (e) { token = null; }

    if (!token) token = await ensureTokenFromAccess();

    if (hasSignedInToken(token)) return { allowed: true, token: token };

    if (allowGuest) return { allowed: true, token: token };

    redirectToAccessLogin();
    return { allowed: false, redirected: true };
  }

  window.KGRequireAuth = {
    TOKEN_KEY,
    isGuestToken,
    hasSignedInToken,
    ensureTokenFromAccess,
    guard,
    redirectToAccessLogin,
  };
})();
