/**
 * KensGames — Cloudflare Access → KensGames user_token bridge
 *
 * Goal: if a visitor is already authenticated via Cloudflare Access,
 * mint (or restore) a KensGames JWT `user_token` so game pages don't
 * ask for a second sign-in.
 */

(function () {
  async function ensure(options) {
    const opts = options || {};

    let existing = null;
    try { existing = localStorage.getItem('user_token'); } catch { /* ignore */ }

    if (existing && !opts.force) {
      return { token: existing, source: 'localStorage' };
    }

    // If Cloudflare Access is not enabled for this environment/page,
    // this call will fail or return non-200.
    let res;
    try {
      res = await fetch('/api/auth/access-session', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
    } catch {
      return null;
    }

    if (!res || !res.ok) return null;

    let data;
    try { data = await res.json(); } catch { return null; }
    if (!data || !data.success || !data.token) return null;

    try {
      localStorage.setItem('user_token', data.token);
      if (data.username) localStorage.setItem('username', data.username);
      if (data.displayName) localStorage.setItem('display_name', data.displayName);
      if (data.userId != null) localStorage.setItem('user_id', String(data.userId));
    } catch { /* ignore */ }

    return {
      token: data.token,
      username: data.username,
      displayName: data.displayName,
      userId: data.userId,
      source: 'access-session'
    };
  }

  // Expose a tiny API for lobbies to use.
  if (typeof window !== 'undefined') {
    window.KGAccessSession = { ensure };
  }
})();
