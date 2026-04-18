function getAccessContainer() {
  return document.getElementById('access-status');
}

function getMode(container) {
  const mode = (container?.dataset?.accessMode || '').trim().toLowerCase();
  return mode === 'compact' ? 'compact' : 'full';
}

function pickButtonClasses() {
  const hasKensPortalButtons = !!document.querySelector('.btn-ghost, .btn-login');
  if (hasKensPortalButtons) {
    return {
      login: 'btn-login kg-access-link',
      logout: 'btn-ghost kg-access-link',
    };
  }

  const hasFastTrackButtons = !!document.querySelector('.btn.btn-primary, .btn.btn-secondary, .btn');
  if (hasFastTrackButtons) {
    return {
      login: 'btn btn-primary kg-access-link',
      logout: 'btn btn-secondary kg-access-link',
    };
  }

  return {
    login: 'kg-access-link',
    logout: 'kg-access-link',
  };
}

async function checkAccessStatus() {
  const container = getAccessContainer();
  if (!container) return;

  try {
    const response = await fetch('/cdn-cgi/access/get-identity', {
      credentials: 'include'
    });

    if (response.ok) {
      const identity = await response.json();
      showLoggedIn(identity);
    } else {
      showLoggedOut();
    }
  } catch (e) {
    showLoggedOut();
  }
}

async function ensureUserTokenFromAccess() {
  // If we already have a non-guest token, keep it.
  try {
    const existing = localStorage.getItem('user_token');
    if (existing && !String(existing).startsWith('guest-')) return;
  } catch { /* ignore */ }

  try {
    const res = await fetch('/api/auth/access-session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.success || !data.token) return;
    try {
      localStorage.setItem('user_token', data.token);
      if (data.username) localStorage.setItem('username', data.username);
      if (data.displayName) localStorage.setItem('display_name', data.displayName);
      if (data.userId != null) localStorage.setItem('user_id', String(data.userId));
    } catch { /* ignore */ }
  } catch {
    // ignore
  }
}

function showLoggedIn(identity) {
  const container = getAccessContainer();
  if (!container) return;

  const mode = getMode(container);
  const classes = pickButtonClasses();

  const label = identity?.name || identity?.email || 'Player';

  const welcomeHtml = mode === 'compact'
    ? ''
    : `<span class="access-welcome">WELCOME, ${escapeHtml(label)}</span>`;

  container.innerHTML = `
    ${welcomeHtml}
    <a href="https://kensgames.com/cdn-cgi/access/logout?redirectUrl=https://kensgames.com/" class="${classes.logout}" style="text-decoration:none;display:inline-flex;align-items:center">LOG OUT</a>
  `;

  // Best-effort: unify Access login with the site's own JWT token.
  // This prevents “double login” prompts across games.
  ensureUserTokenFromAccess();
}

function showLoggedOut() {
  const container = getAccessContainer();
  if (!container) return;

  const mode = getMode(container);
  const classes = pickButtonClasses();

  // Do not link directly to the Cloudflare Access team-domain login URL.
  // Linking to a protected page is the most reliable way to trigger Access.
  container.innerHTML = `
    <a href="/lobby/" class="${classes.login}" style="text-decoration:none;display:inline-flex;align-items:center">LOG IN</a>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

document.addEventListener('DOMContentLoaded', checkAccessStatus);
