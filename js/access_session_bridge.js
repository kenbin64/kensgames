/**
 * KensGames — Cloudflare Access → KensGames user_token bridge
 *
 * Goal: if a visitor is already authenticated via Cloudflare Access,
 * mint (or restore) a KensGames JWT `user_token` so game pages don't
 * ask for a second sign-in.
 */

// CF Access bridge removed — auth is handled via /api/auth/login or /api/auth/google.
(function () {
  function ensure() {
    let existing = null;
    try { existing = localStorage.getItem('kg_token') || localStorage.getItem('user_token'); } catch { /* ignore */ }
    if (existing) return Promise.resolve({ token: existing, source: 'localStorage' });
    return Promise.resolve(null);
  }
  if (typeof window !== 'undefined') {
    window.KGAccessSession = { ensure };
  }
})();
