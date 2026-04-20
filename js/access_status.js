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

  // Check our own kg_token instead of Cloudflare
  const token = localStorage.getItem('kg_token');
  if (token) {
    showLoggedIn({ name: localStorage.getItem('kg_display_name') || localStorage.getItem('kg_username') || 'Player' });
  } else {
    showLoggedOut();
  }
}

function ensureUserTokenFromAccess() {
  // No-op: CF Access bridge removed. Auth via /login or Google Sign In.
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
    <a href="#" onclick="(['kg_token','kg_username','kg_display_name','kg_user_id','kg_avatar','user_token','display_name','username'].forEach(k=>localStorage.removeItem(k)),window.location.href='/login/');return false;" class="${classes.logout}" style="text-decoration:none;display:inline-flex;align-items:center">LOG OUT</a>
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
    <a href="/login/" class="${classes.login}" style="text-decoration:none;display:inline-flex;align-items:center">LOG IN</a>
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
