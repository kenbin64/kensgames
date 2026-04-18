/**
 * player_profile_substrate.js
 * Client-side player profile state manager.
 * Include on any page that needs auth-gated profile state.
 * Exposes: window.KG_PROFILE, window.KG_AVATARS, window.KG_requireProfile()
 */
(function () {
  'use strict';

  const API = '/api';

  // 18 avatar options
  const AVATARS = [
    { id: 'wizard', emoji: '🧙' },
    { id: 'knight', emoji: '🛡️' },
    { id: 'robot', emoji: '🤖' },
    { id: 'alien', emoji: '👽' },
    { id: 'ninja', emoji: '🥷' },
    { id: 'astronaut', emoji: '👨‍🚀' },
    { id: 'dragon', emoji: '🐉' },
    { id: 'phoenix', emoji: '🦅' },
    { id: 'fox', emoji: '🦊' },
    { id: 'wolf', emoji: '🐺' },
    { id: 'cat', emoji: '🐱' },
    { id: 'ghost', emoji: '👻' },
    { id: 'skull', emoji: '💀' },
    { id: 'fire', emoji: '🔥' },
    { id: 'lightning', emoji: '⚡' },
    { id: 'star', emoji: '⭐' },
    { id: 'diamond', emoji: '💎' },
    { id: 'crown', emoji: '👑' },
  ];

  // Build id→emoji map
  const avatarMap = {};
  AVATARS.forEach(a => { avatarMap[a.id] = a.emoji; });

  window.KG_AVATARS = avatarMap;
  window.KG_AVATAR_LIST = AVATARS;

  let _profile = null;
  let _loaded = false;
  let _callbacks = [];

  function getToken() { return localStorage.getItem('kg_token'); }

  function authHeader() {
    return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
  }

  /**
   * Load or return cached profile.
   * Returns Promise<profile|null>
   */
  async function loadProfile(force) {
    if (_loaded && !force) return _profile;
    const token = getToken();
    if (!token) return null;
    try {
      const r = await fetch(`${API}/players/me`, { headers: authHeader() });
      if (!r.ok) return null;
      _profile = await r.json();
      _loaded = true;
      _callbacks.forEach(cb => cb(_profile));
      _callbacks = [];
      return _profile;
    } catch { return null; }
  }

  /**
   * Enforce full profile setup. Call from any authenticated page.
   * Redirects to /login or /player/setup.html as needed.
   * Returns profile on success, never returns on redirect.
   */
  async function requireProfile() {
    const token = getToken();
    if (!token) { window.location.href = '/login/index.html'; return null; }

    // Validate token
    try {
      const vr = await fetch(`${API}/auth/validate`, { headers: authHeader() });
      if (!vr.ok) { localStorage.removeItem('kg_token'); window.location.href = '/login/index.html'; return null; }
    } catch { window.location.href = '/login/index.html'; return null; }

    const profile = await loadProfile(true);
    if (!profile) { window.location.href = '/login/index.html'; return null; }

    if (!profile.tosAgreed || !profile.profileSetup) {
      window.location.href = '/player/setup.html';
      return null;
    }
    return profile;
  }

  /**
   * Get avatar emoji for an avatarId.
   */
  function getAvatar(avatarId) {
    return avatarMap[avatarId] || '🎮';
  }

  /**
   * Render a player chip: avatar + playername.
   * Usage: document.getElementById('player-tag').innerHTML = KG_PROFILE.chip();
   */
  function chip() {
    if (!_profile) return '';
    const emoji = getAvatar(_profile.avatarId);
    return `${emoji} ${_profile.playername || _profile.username}`;
  }

  /**
   * Subscribe to profile load.
   */
  function onLoad(cb) {
    if (_loaded) { cb(_profile); } else { _callbacks.push(cb); }
  }

  window.KG_PROFILE = {
    load: loadProfile,
    require: requireProfile,
    get: () => _profile,
    getAvatar,
    chip,
    onLoad,
    authHeader,
    getToken,
  };
})();
