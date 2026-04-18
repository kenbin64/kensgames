/**
 * friends_substrate.js
 * Client-side friends state manager.
 * Requires player_profile_substrate.js to be loaded first.
 * Exposes: window.KG_FRIENDS
 */
(function () {
  'use strict';

  const API = '/api';
  let _friendIds = new Set();
  let _blockedIds = new Set();
  let _loaded = false;

  function ah() { return window.KG_PROFILE?.authHeader() || {}; }

  async function load(force) {
    if (_loaded && !force) return;
    try {
      const r = await fetch(`${API}/friends`, { headers: ah() });
      if (!r.ok) return;
      const d = await r.json();
      _friendIds = new Set((d.friends || []).map(f => f.userId));
      _blockedIds = new Set((d.blocked || []).map(b => b.userId));
      _loaded = true;
    } catch { }
  }

  function isFriend(userId) { return _friendIds.has(userId); }
  function isBlocked(userId) { return _blockedIds.has(userId); }

  async function sendRequest(toUserId, note) {
    const r = await fetch(`${API}/friends/request`, {
      method: 'POST', headers: ah(),
      body: JSON.stringify({ toUserId, note: note || '' }),
    });
    return r.json();
  }

  async function respond(fromUserId, accept) {
    const r = await fetch(`${API}/friends/respond`, {
      method: 'POST', headers: ah(),
      body: JSON.stringify({ fromUserId, accept }),
    });
    await load(true);
    return r.json();
  }

  async function remove(userId) {
    await fetch(`${API}/friends/${userId}`, { method: 'DELETE', headers: ah() });
    _friendIds.delete(userId);
  }

  async function block(userId) {
    const r = await fetch(`${API}/friends/block`, {
      method: 'POST', headers: ah(),
      body: JSON.stringify({ targetUserId: userId }),
    });
    await load(true);
    return r.json();
  }

  async function unblock(userId) {
    await fetch(`${API}/friends/unblock`, {
      method: 'POST', headers: ah(),
      body: JSON.stringify({ targetUserId: userId }),
    });
    _blockedIds.delete(userId);
  }

  async function getRequests() {
    const r = await fetch(`${API}/friends/requests`, { headers: ah() });
    return r.ok ? (await r.json()).requests || [] : [];
  }

  window.KG_FRIENDS = { load, isFriend, isBlocked, sendRequest, respond, remove, block, unblock, getRequests };
})();
