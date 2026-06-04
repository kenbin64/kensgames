/* auth-gate.js
 * Shared server-verified auth gate for Манifold AI + Манifold IDE.
 *
 * Assumes existing login flow stores:
 *   localStorage.user_token
 *
 * Uses existing backend endpoint:
 *   POST/GET /api/auth/validate (this repo uses GET /api/auth/validate)
 * with:
 *   Authorization: Bearer <token>
 *
 * If unauthenticated/invalid:
 *   redirect to /login/?redirect=<current_url>
 */

(function () {
  'use strict';

  const AUTH_VALIDATE_URL = '/api/auth/validate';
  const LOGIN_URL = '/login/';

  function setAuthed(token) {
    window.__kgAuthed = true;
    window.__kgToken = token || null;
    window.dispatchEvent(new Event('kg:authed'));
  }

  // Redirects are disabled: auth-gate should not force navigation to login.
  // If the app needs auth, it should handle 401/403 gracefully.
  function redirectToLogin() {
    return;
  }

  async function validateToken(token) {
    const res = await fetch(AUTH_VALIDATE_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'same-origin',
    });

    if (!res.ok) return { valid: false };

    const data = await res.json().catch(() => ({}));
    return { valid: !!data.valid, raw: data };
  }

  async function ensureAuthed() {
    // Already validated in this tab session.
    if (window.__kgAuthed) return true;

    const token = (window.localStorage && localStorage.getItem('user_token')) || '';

    // If no token, allow app to boot unauthenticated.
    if (!token) {
      setAuthed(null);
      return true;
    }

    // Validate with server.
    try {
      const out = await validateToken(token);
      if (out.valid) {
        setAuthed(token);
        return true;
      }
    } catch (_) {
      // fall through to unauthenticated mode
    }

    try {
      localStorage.removeItem('user_token');
    } catch (_) { /* ignore */ }

    setAuthed(null);
    return true;
  }

  // Expose globally for module scripts.
  window.kgAuth = { ensureAuthed };
})();
