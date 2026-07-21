'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRESENCE ROSTER  ·  "who is online right now"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A self-contained lobby widget: connects to the relay, requests the presence
 * roster (server message `presence`), and renders the list of logged-in players,
 * refreshing live as people arrive and leave. It reuses a client the host page
 * already made if one is passed, otherwise it opens its own; either way the
 * relay authenticates it with the injected login token, so it appears as the
 * real account. Rendering is a pure function so it unit-tests without a DOM.
 *
 * Usage (browser):  KGPresenceRoster.mount('#some-container', { gameId: 'fasttrack' })
 *                   KGPresenceRoster.mount()   // creates its own fixed panel
 */
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Show an actual emoji glyph; ignore word-ids like 'person_smile' and digits.
  function avatarGlyph(a) {
    if (!a) return '\u{1F642}';
    const m = String(a).match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/u);
    return m ? m[0] : '\u{1F642}';
  }

  /** Pure: render the roster to an HTML string. */
  function renderPresenceHTML(users, selfId) {
    const list = Array.isArray(users) ? users : [];
    const online = list.filter((u) => !u.is_guest).length;
    const rows = list.map((u) => {
      const you = u.user_id === selfId;
      const badges = [];
      if (you) badges.push('<span class="pr-badge pr-you">you</span>');
      if (u.is_superuser) badges.push('<span class="pr-badge pr-super" title="Superuser">\u{1F451}</span>');
      if (u.in_session) badges.push('<span class="pr-badge pr-ingame">in game</span>');
      if (u.is_guest) badges.push('<span class="pr-badge pr-guest">guest</span>');
      return (
        '<li class="pr-row' + (you ? ' pr-self' : '') + '" data-user-id="' + esc(u.user_id) + '">' +
        '<span class="pr-av">' + esc(avatarGlyph(u.avatar_id)) + '</span>' +
        '<span class="pr-name">' + esc(u.username) + '</span>' +
        '<span class="pr-badges">' + badges.join('') + '</span>' +
        '</li>'
      );
    }).join('');
    return (
      '<div class="pr-head"><span>Players online</span><span class="pr-count">' + online + '</span></div>' +
      (list.length
        ? '<ul class="pr-list">' + rows + '</ul>'
        : '<div class="pr-empty">No one else is here yet.</div>')
    );
  }

  const CSS = `
  .pr-root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#eef3ef;}
  .pr-fixed{position:fixed;top:14px;right:14px;width:236px;max-height:70vh;z-index:9000;
    background:rgba(12,26,20,.94);border:1px solid #2c4a3c;border-radius:12px;overflow:hidden;
    box-shadow:0 16px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;}
  .pr-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 13px;
    font-size:13px;font-weight:700;letter-spacing:.3px;color:#e8b04b;cursor:default;
    background:linear-gradient(180deg,rgba(28,58,46,.6),transparent);}
  .pr-count{background:#1c3a2e;color:#eef3ef;border-radius:10px;padding:1px 8px;font-size:12px;}
  .pr-list{list-style:none;margin:0;padding:6px;overflow-y:auto;display:grid;gap:3px;}
  .pr-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:13px;}
  .pr-row:hover{background:rgba(255,255,255,.04);}
  .pr-self{background:rgba(232,176,75,.10);}
  .pr-av{font-size:16px;width:20px;text-align:center;}
  .pr-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pr-badges{display:flex;gap:4px;align-items:center;}
  .pr-badge{font-size:10px;border-radius:6px;padding:1px 6px;font-weight:700;}
  .pr-you{background:#e8b04b;color:#241a06;}
  .pr-super{background:transparent;padding:0;font-size:13px;}
  .pr-ingame{background:#33506d;color:#dbe8f5;}
  .pr-guest{background:#3a3a3a;color:#c7c7c7;}
  .pr-empty{padding:14px 13px;color:#93a89b;font-size:12.5px;}
  .pr-collapsed .pr-list,.pr-collapsed .pr-empty{display:none;}
  .pr-toggle{cursor:pointer;background:none;border:0;color:#93a89b;font-size:13px;padding:0 2px;}
  `;

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('pr-style')) return;
    const st = document.createElement('style');
    st.id = 'pr-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function mount(target, opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return null;
    injectStyle();

    let el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) {
      el = document.createElement('aside');
      el.className = 'pr-fixed';
      document.body.appendChild(el);
    }
    el.classList.add('pr-root');
    el.innerHTML = '<div class="pr-empty">Connecting...</div>';

    const Client = root.KGMultiplayer;
    if (!Client) { el.innerHTML = '<div class="pr-empty">Multiplayer unavailable.</div>'; return null; }

    const mp = opts.client || new Client(opts.gameId || 'fasttrack');
    const paint = () => { el.innerHTML = renderPresenceHTML(mp.presence || [], mp.userId); wireToggle(); };

    function wireToggle() {
      const head = el.querySelector('.pr-head');
      if (head && !head.dataset.wired) {
        head.dataset.wired = '1';
        head.addEventListener('click', () => el.classList.toggle('pr-collapsed'));
      }
    }

    mp.on('authenticated', () => { try { mp.listPresence(); } catch (_) { /* ignore */ } });
    mp.on('presence', paint);

    if (opts.client) {
      if (mp.connected) { try { mp.listPresence(); } catch (_) { /* ignore */ } }
    } else {
      try { mp.connect({}); } catch (_) { /* ignore */ }
    }

    return { el, client: mp, refresh: () => { try { mp.listPresence(); } catch (_) { /* ignore */ } } };
  }

  const api = { mount, renderPresenceHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KGPresenceRoster = api;
})(typeof window !== 'undefined' ? window : globalThis);
