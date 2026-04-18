/**
 * guild_substrate.js
 * Client-side guild state manager.
 * Requires player_profile_substrate.js to be loaded first.
 * Exposes: window.KG_GUILD
 */
(function () {
  'use strict';

  const API = '/api';
  let _guildId = null;
  let _guildData = null;
  let _isGM = false;

  function ah() { return window.KG_PROFILE?.authHeader() || {}; }

  async function load(guildId) {
    _guildId = guildId;
    try {
      const r = await fetch(`${API}/guilds/${guildId}`, { headers: ah() });
      if (!r.ok) { _guildData = null; return null; }
      const d = await r.json();
      _guildData = d.guild;
      const myId = window.KG_PROFILE?.get()?.userId;
      _isGM = _guildData?.masterId === myId;
      return _guildData;
    } catch { return null; }
  }

  async function listAll() {
    const r = await fetch(`${API}/guilds`, { headers: ah() });
    return r.ok ? (await r.json()).guilds || [] : [];
  }

  async function create(name, tag) {
    const r = await fetch(`${API}/guilds/create`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ name, tag }),
    });
    return r.json();
  }

  async function requestJoin(guildId, note) {
    const r = await fetch(`${API}/guilds/${guildId}/join`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ note: note || '' }),
    });
    return r.json();
  }

  async function leave(guildId) {
    const r = await fetch(`${API}/guilds/${guildId || _guildId}/leave`, { method: 'POST', headers: ah() });
    _guildData = null; _isGM = false;
    return r.json();
  }

  // GM only
  async function accept(userId, accept) {
    const r = await fetch(`${API}/guilds/${_guildId}/accept`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ userId, accept }),
    });
    return r.json();
  }

  async function suspend(userId, duration, reason) {
    const r = await fetch(`${API}/guilds/${_guildId}/suspend`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ userId, duration, reason }),
    });
    return r.json();
  }

  async function reinstate(userId) {
    const r = await fetch(`${API}/guilds/${_guildId}/reinstate`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ userId }),
    });
    return r.json();
  }

  async function boot(userId) {
    const r = await fetch(`${API}/guilds/${_guildId}/boot`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ userId }),
    });
    return r.json();
  }

  async function appeal(text) {
    const r = await fetch(`${API}/guilds/${_guildId}/appeal`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ text }),
    });
    return r.json();
  }

  async function decideAppeal(appealId, approve) {
    const r = await fetch(`${API}/guilds/${_guildId}/appeal/${appealId}/decide`, {
      method: 'POST', headers: ah(), body: JSON.stringify({ approve }),
    });
    return r.json();
  }

  window.KG_GUILD = {
    load, listAll, create, requestJoin, leave,
    accept, suspend, reinstate, boot, appeal, decideAppeal,
    get: () => _guildData,
    getId: () => _guildId,
    isGM: () => _isGM,
  };
})();
