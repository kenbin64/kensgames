/* KensGames — Require Auth Guard
   Used by gameplay pages to enforce: public promo pages, but sign-in required to play.
*/

(function () {
  'use strict';

  const TOKEN_KEY = 'kg_token';
  const LEGACY_TOKEN_KEY = 'user_token';

  function getToken() {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) return token;
      const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
      if (legacy) {
        localStorage.setItem(TOKEN_KEY, legacy);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        return legacy;
      }
    } catch { }
    return null;
  }

  function isGuestToken(token) {
    if (!token) return true;
    return String(token).startsWith('guest-');
  }

  function hasSignedInToken(token) {
    return !!token && !isGuestToken(token);
  }

  function ensureTokenFromAccess() {
    // CF Access bridge removed. Returns existing localStorage token or null.
    return Promise.resolve(getToken());
  }

  function redirectToAccessLogin() {
    const target = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace('/login/?redirect=' + encodeURIComponent(target));
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
        return { allowed: true, token: getToken() };
      }
    } catch (e) {
      // ignore allowIf errors; proceed with normal gating
    }

    let token = null;
    token = getToken();

    if (!hasSignedInToken(token)) token = await ensureTokenFromAccess();

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
