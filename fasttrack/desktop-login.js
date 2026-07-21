'use strict';
/**
 * FastTrack desktop login screen.
 * Signs in / registers against the existing REST auth (__KG_API_BASE__), then
 * hands the verified token to the Electron layer via window.kgAuth.login(),
 * which persists it (encrypted) and navigates to the game. Register auto-signs
 * in (the response carries a token). No guest path: online play requires login.
 */
(function () {
  const API = (window.__KG_API_BASE__ || '').replace(/\/+$/, '');
  const $ = (id) => document.getElementById(id);
  const setMsg = (text, kind) => {
    const m = $('msg');
    m.textContent = text || '';
    m.className = 'msg' + (kind ? ' ' + kind : '');
  };

  if (!window.kgAuth) {
    setMsg('Please launch the FastTrack desktop app to sign in.', 'err');
  }

  function showTab(which) {
    $('tab-signin').classList.toggle('active', which === 'signin');
    $('tab-register').classList.toggle('active', which === 'register');
    $('form-signin').classList.toggle('hidden', which !== 'signin');
    $('form-register').classList.toggle('hidden', which !== 'register');
    setMsg('');
  }
  $('tab-signin').addEventListener('click', () => showTab('signin'));
  $('tab-register').addEventListener('click', () => showTab('register'));

  // Map the REST auth response to the user object the relay + panels expect.
  function userFromResponse(data) {
    return {
      id: data.userId,
      username: data.username,
      display_name: data.displayName || data.username,
      avatar: data.avatar ? { emoji: data.avatar, name: data.displayName || data.username } : null,
    };
  }

  async function finishLogin(data) {
    if (!window.kgAuth) { setMsg('Desktop bridge unavailable.', 'err'); return; }
    const res = await window.kgAuth.login(data.token, userFromResponse(data));
    if (!res || !res.ok) {
      setMsg((res && res.error) || 'Could not start your session.', 'err');
      return;
    }
    setMsg('Welcome, ' + (data.username || 'player') + '.', 'ok');
    // On success the main process navigates the window to the game.
  }

  async function postJson(pathname, payload) {
    const res = await fetch(`${API}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  $('form-signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('si-user').value.trim();
    const password = $('si-pass').value;
    if (!username || !password) { setMsg('Enter your player name and password.', 'err'); return; }
    setMsg('Signing in...');
    try {
      const { ok, data } = await postJson('/api/auth/login', { username, password });
      if (!ok || !data.token) { setMsg(data.error || data.message || 'Sign in failed.', 'err'); return; }
      await finishLogin(data);
    } catch (_) {
      setMsg('Network error. Check your connection and try again.', 'err');
    }
  });

  $('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('rg-user').value.trim();
    const email = $('rg-email').value.trim();
    const password = $('rg-pass').value;
    const confirm = $('rg-pass2').value;
    if (username.length < 3) { setMsg('Player name must be at least 3 characters.', 'err'); return; }
    if (!email) { setMsg('Enter an email.', 'err'); return; }
    if (password.length < 8) { setMsg('Password must be at least 8 characters.', 'err'); return; }
    if (password !== confirm) { setMsg('Passwords do not match.', 'err'); return; }
    setMsg('Creating your account...');
    try {
      const { ok, data } = await postJson('/api/auth/register', {
        username, displayName: username, email, password,
      });
      if (!ok) { setMsg(data.error || data.message || 'Could not create account.', 'err'); return; }
      // The register endpoint creates the account but does NOT return a token,
      // so sign in immediately with the same credentials to get one.
      setMsg('Account created. Signing you in...');
      const li = await postJson('/api/auth/login', { username, password });
      if (!li.ok || !li.data.token) {
        setMsg(li.data.error || 'Account created. Please sign in.', 'err');
        showTab('signin');
        return;
      }
      await finishLogin(li.data);
    } catch (_) {
      setMsg('Network error. Check your connection and try again.', 'err');
    }
  });
})();
