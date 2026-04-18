/**
 * chat_substrate.js
 * Guild chat REST client.
 * Requires player_profile_substrate.js to be loaded first.
 * Exposes: window.KG_CHAT
 */
(function () {
  'use strict';

  const API = '/api';
  const POLL_MS = 6000; // poll interval for new messages
  let _guildId = null;
  let _pollTimer = null;
  let _lastCount = 0;
  let _onMessage = null;

  function ah() { return window.KG_PROFILE?.authHeader() || {}; }

  async function history(guildId) {
    const r = await fetch(`${API}/chat/${guildId}/history`, { headers: ah() });
    return r.ok ? (await r.json()).messages || [] : [];
  }

  async function send(guildId, text) {
    if (!text?.trim()) return { success: false, error: 'Empty message' };
    const r = await fetch(`${API}/chat/${guildId}/send`, {
      method: 'POST', headers: ah(),
      body: JSON.stringify({ text: text.trim() }),
    });
    return r.json();
  }

  /**
   * Start polling for new messages.
   * onMessage(messages[]) is called whenever the message count changes.
   */
  function startPolling(guildId, onMessage) {
    stopPolling();
    _guildId = guildId;
    _onMessage = onMessage;

    async function poll() {
      try {
        const msgs = await history(guildId);
        if (msgs.length !== _lastCount) {
          _lastCount = msgs.length;
          if (_onMessage) _onMessage(msgs);
        }
      } catch { }
      _pollTimer = setTimeout(poll, POLL_MS);
    }
    poll();
  }

  function stopPolling() {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  }

  window.KG_CHAT = { history, send, startPolling, stopPolling };
})();
