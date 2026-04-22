/**
 * KensGames — Universal Game Access Gate  v1.0
 *
 * Enforces the layered access model:
 *   PUBLIC  — landing, gallery, tos, register, login (no gate needed)
 *   GUEST   — solo games, invite-by-code flows (kg_gate.protect({ allowGuest: true }))
 *   PLAYER  — all lobbies / multiplayer (must be signed-in, ToS accepted, profile set up)
 *   ADMIN   — admin panel only
 *
 * Usage:
 *   <script src="/js/kg_gate.js"></script>
 *   <script>
 *     KGGate.protect().then(({ allowed, player }) => {
 *       if (!allowed) return; // gate redirected
 *       // page is clear to run
 *     });
 *   </script>
 *
 * Options for protect():
 *   allowGuest    {boolean}  default false — let guest-* tokens through (solo/invite)
 *   requireToS    {boolean}  default true  — redirect to /tos/ if not accepted
 *   requireProfile{boolean}  default true  — redirect to /player/setup.html if not set up
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'kg_token';
  const LEGACY_TOKEN_KEY = 'user_token';
  const GUEST_PREFIX = 'guest-';

  // ── Helpers ────────────────────────────────────────────────────────────

  function getToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return legacy;
    }
    return null;
  }

  function isGuest(token) {
    return !token || String(token).startsWith(GUEST_PREFIX);
  }

  function clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    ['kg_username', 'kg_display_name', 'kg_user_id', 'kg_avatar',
      'display_name', 'username'].forEach(k => localStorage.removeItem(k));
  }

  function encodedHere() {
    return encodeURIComponent(window.location.href);
  }

  function redirectToLogin() {
    window.location.replace('/login/?redirect=' + encodedHere());
  }

  function redirectToTos() {
    window.location.replace('/tos/?next=' + encodedHere());
  }

  function redirectToSetup() {
    window.location.replace('/player/setup.html?redirect=' + encodedHere());
  }

  // ── Player state from API ──────────────────────────────────────────────

  async function fetchPlayerState(token) {
    try {
      const r = await fetch('/api/players/me', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data && data.success ? data : null;
    } catch {
      return null;
    }
  }

  // ── Main gate ─────────────────────────────────────────────────────────

  /**
   * Protect a page. Returns a Promise<{ allowed, guest, token, player }>.
   * Redirects automatically if access is denied.
   */
  async function protect(opts) {
    opts = opts || {};
    const allowGuest = !!(opts.allowGuest);
    const requireTos = opts.requireToS !== false;
    const requireProfile = opts.requireProfile !== false;

    const token = getToken();

    // No token
    if (!token) {
      if (allowGuest) return { allowed: true, guest: true };
      redirectToLogin();
      return { allowed: false, redirected: true };
    }

    // Guest token
    if (isGuest(token)) {
      if (allowGuest) return { allowed: true, guest: true, token };
      redirectToLogin();
      return { allowed: false, redirected: true };
    }

    // Signed-in — no further checks needed?
    if (!requireTos && !requireProfile) {
      return { allowed: true, guest: false, token };
    }

    // Validate and fetch profile
    const player = await fetchPlayerState(token);

    if (!player) {
      // Token invalid / expired
      clearTokens();
      redirectToLogin();
      return { allowed: false, redirected: true };
    }

    // Status gate
    if (player.status === 'banned') {
      window.location.replace('/?banned=1');
      return { allowed: false, redirected: true };
    }

    // ToS gate
    if (requireTos && !player.tosAgreed) {
      redirectToTos();
      return { allowed: false, redirected: true };
    }

    // Profile gate
    if (requireProfile && !player.profileSetup) {
      redirectToSetup();
      return { allowed: false, redirected: true };
    }

    return { allowed: true, guest: false, token, player };
  }

  /**
   * Non-blocking check — returns current state without redirecting.
   * Useful for optional UI elements that adapt to login state.
   */
  async function softCheck() {
    const token = getToken();
    if (!token) return { loggedIn: false, guest: false };
    if (isGuest(token)) return { loggedIn: false, guest: true, token };

    const player = await fetchPlayerState(token);
    if (!player) return { loggedIn: false, guest: false };

    return {
      loggedIn: true,
      guest: false,
      token,
      player,
      tosAgreed: !!player.tosAgreed,
      profileSetup: !!player.profileSetup,
    };
  }

  window.KGGate = { protect, softCheck, getToken, isGuest, clearTokens };
})();
