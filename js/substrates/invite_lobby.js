'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE INVITE LOBBY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The desktop "play with friends" panel. Reuses the presence roster to show who
 * is online, lets a host create a private game and invite players from that
 * list, and lets an invitee accept, ready up, and start. It drives the relay
 * with the existing session / ready / start machinery (createGame, invitePlayer,
 * joinById, toggleReady, startGame), so nothing new is needed server-side beyond
 * the invite message. The view-model (buildLobbyView) is pure and unit-tested.
 *
 * On game start it hands off through the same URL contract the lobby uses
 * (/fasttrack/3d.html?launch=1), persisting KG_Game / KG_Player / roster; each
 * client reconnects on the game page and the relay resumes its session.
 */
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function glyph(a) {
    if (!a) return '\u{1F642}';
    const m = String(a).match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/u);
    return m ? m[0] : '\u{1F642}';
  }

  /**
   * Pure view-model for the lobby, given the online users, the current session,
   * and my user id. Decides who is invitable, whether I host, and whether I can
   * start (host + 2..6 players + every non-host human ready).
   */
  function buildLobbyView({ users, session, selfId } = {}) {
    const list = Array.isArray(users) ? users : [];
    const players = (session && session.players) || [];
    const inIds = new Set(players.map((p) => p.user_id));
    const hosting = !!(session && session.host_id === selfId);
    const inSession = inIds.has(selfId);
    const invitable = list.filter((u) => u.user_id !== selfId && !inIds.has(u.user_id) && !u.is_guest);
    const others = players.filter((p) => !p.is_host && !p.is_ai);
    const allReady = others.every((p) => p.ready);
    const waiting = !session || !session.status || session.status === 'waiting';
    const canStart = hosting && waiting && players.length >= 2 && players.length <= 6 && allReady;
    return { hosting, inSession, players, invitable, canStart, status: session ? session.status : null };
  }

  const CSS = `
  .il-fixed{position:fixed;top:14px;right:14px;width:260px;max-height:82vh;z-index:9000;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#eef3ef;
    background:rgba(12,26,20,.95);border:1px solid #2c4a3c;border-radius:12px;overflow:hidden;
    box-shadow:0 16px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;}
  .il-head{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;font-size:13px;
    font-weight:700;color:#e8b04b;background:linear-gradient(180deg,rgba(28,58,46,.6),transparent);}
  .il-body{padding:8px;overflow-y:auto;display:grid;gap:8px;}
  .il-sect{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#93a89b;margin:2px 2px -2px;}
  .il-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:13px;background:rgba(255,255,255,.02);}
  .il-av{font-size:16px;width:20px;text-align:center;}
  .il-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .il-tag{font-size:10px;background:#e8b04b;color:#241a06;border-radius:5px;padding:0 5px;font-weight:700;}
  .il-state{font-size:10px;border-radius:6px;padding:1px 7px;font-weight:700;}
  .il-ready{background:#2e7d5b;color:#eafff3;} .il-wait{background:#3a3a3a;color:#c7c7c7;} .il-host{background:#33506d;color:#dbe8f5;}
  .il-btn{border:0;border-radius:8px;padding:7px 10px;font-weight:700;font-size:12.5px;cursor:pointer;}
  .il-primary{background:linear-gradient(180deg,#e8b04b,#c8912f);color:#241a06;width:100%;}
  .il-mini{background:#1c3a2e;color:#eef3ef;padding:4px 10px;}
  .il-mini[disabled]{opacity:.5;cursor:default;}
  .il-ghost{background:transparent;border:1px solid #2c4a3c;color:#c7d6cd;width:100%;}
  .il-msg{font-size:12px;color:#93a89b;padding:2px 4px;min-height:15px;}
  .il-prompt{background:rgba(232,176,75,.12);border:1px solid #c8912f;border-radius:10px;padding:10px;display:grid;gap:8px;}
  .il-prompt b{color:#fff;} .il-prow{display:flex;gap:8px;}
  .il-empty{color:#93a89b;font-size:12.5px;padding:8px 6px;}
  `;

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('il-style')) return;
    const st = document.createElement('style');
    st.id = 'il-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  function mount(target, opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return null;
    injectStyle();

    let el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) { el = document.createElement('aside'); el.className = 'il-fixed'; document.body.appendChild(el); }

    const Client = root.KGMultiplayer;
    if (!Client) { el.innerHTML = '<div class="il-empty">Multiplayer unavailable.</div>'; return null; }
    const mp = opts.client || new Client(opts.gameId || 'fasttrack');

    let users = [];
    let pendingInvite = null;   // an incoming game_invite awaiting my answer
    let message = '';

    function playerRow(p, selfId) {
      const you = p.user_id === selfId;
      const state = p.is_host ? '<span class="il-state il-host">host</span>'
        : p.is_ai ? '<span class="il-state il-host">bot</span>'
        : (p.ready ? '<span class="il-state il-ready">ready</span>' : '<span class="il-state il-wait">waiting</span>');
      return `<div class="il-row"><span class="il-av">${esc(glyph(p.avatar_id || p.avatar))}</span>`
        + `<span class="il-name">${esc(p.username || p.name)}${you ? ' <span class="il-tag">you</span>' : ''}</span>${state}</div>`;
    }
    function invitableRow(u) {
      return `<div class="il-row"><span class="il-av">${esc(glyph(u.avatar_id))}</span>`
        + `<span class="il-name">${esc(u.username)}</span>`
        + `<button class="il-btn il-mini" data-action="invite" data-user-id="${esc(u.user_id)}">Invite</button></div>`;
    }

    function render() {
      const v = buildLobbyView({ users, session: mp.session, selfId: mp.userId });
      let html = '<div class="il-head"><span>Play with friends</span></div><div class="il-body">';

      if (pendingInvite && !v.inSession) {
        const from = (pendingInvite.from && pendingInvite.from.username) || 'A player';
        html += `<div class="il-prompt"><div><b>${esc(from)}</b> invited you to FastTrack.</div>`
          + '<div class="il-prow"><button class="il-btn il-primary" data-action="accept">Accept</button>'
          + '<button class="il-btn il-ghost" data-action="decline">Decline</button></div></div>';
      }

      if (!mp.session) {
        html += `<div class="il-msg">${esc(message || 'Create a game, then invite people below.')}</div>`;
        html += '<button class="il-btn il-primary" data-action="create">Create private game</button>';
        html += '<div class="il-sect">Players online</div>';
        html += users.length
          ? users.map((u) => `<div class="il-row"><span class="il-av">${esc(glyph(u.avatar_id))}</span><span class="il-name">${esc(u.username)}${u.user_id === mp.userId ? ' <span class="il-tag">you</span>' : ''}</span>${u.in_session ? '<span class="il-state il-host">in game</span>' : ''}</div>`).join('')
          : '<div class="il-empty">No one else is online yet.</div>';
      } else {
        html += '<div class="il-sect">In this game</div>';
        html += v.players.map((p) => playerRow(p, mp.userId)).join('');
        if (message) html += `<div class="il-msg">${esc(message)}</div>`;
        if (v.hosting) {
          html += `<button class="il-btn il-primary" data-action="start"${v.canStart ? '' : ' disabled'}>Start game</button>`;
          html += '<div class="il-sect">Invite (online)</div>';
          html += v.invitable.length ? v.invitable.map(invitableRow).join('') : '<div class="il-empty">No one else online to invite.</div>';
        } else {
          const me = v.players.find((p) => p.user_id === mp.userId);
          const ready = me && me.ready;
          html += `<button class="il-btn il-primary" data-action="ready">${ready ? 'Not ready' : 'Ready'}</button>`;
        }
        html += '<button class="il-btn il-ghost" data-action="leave">Leave</button>';
      }
      html += '</div>';
      el.innerHTML = html;
    }

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-action');
      try {
        if (act === 'create') { message = ''; mp.createGame({ private: true, max_players: 6 }); }
        else if (act === 'invite') { mp.invitePlayer(btn.getAttribute('data-user-id')); btn.textContent = 'Invited'; btn.disabled = true; }
        else if (act === 'ready') { mp.toggleReady(); }
        else if (act === 'start') { mp.startGame(); }
        else if (act === 'leave') { mp.leave(); message = ''; render(); }
        else if (act === 'accept') { if (pendingInvite) { mp.joinById(pendingInvite.session_id); pendingInvite = null; } }
        else if (act === 'decline') { if (pendingInvite) { mp.declineInvite(pendingInvite.session_id); pendingInvite = null; render(); } }
      } catch (_) { /* ignore */ }
    });

    mp.on('authenticated', () => { try { mp.listPresence(); } catch (_) { /* ignore */ } });
    mp.on('presence', (u) => { users = u || []; render(); });
    mp.on('session_update', () => { message = ''; render(); });
    mp.on('game_invite', (inv) => { pendingInvite = inv; render(); });
    mp.on('invite_sent', (d) => { message = d && d.already_in ? 'Already in the game.' : 'Invite sent.'; render(); });
    mp.on('invite_declined', (d) => { message = ((d && d.from && d.from.username) || 'They') + ' declined.'; render(); });
    mp.on('error', (d) => { message = (d && d.message) || 'Something went wrong.'; render(); });
    // Launch when the session goes to play. The relay signals start with a
    // game_object of phase 'playing' (not a game_started message), so gate on
    // that; keep game_started too for the reconnect/resume path.
    let launched = false;
    const maybeLaunch = () => { if (!launched) { launched = true; launch(mp); } };
    mp.on('game_started', maybeLaunch);
    mp.on('game_object', (go) => { if (go && String(go.phase) === 'playing') maybeLaunch(); });

    render();
    if (!opts.client) { try { mp.connect({}); } catch (_) { /* ignore */ } }
    else if (mp.connected) { try { mp.listPresence(); } catch (_) { /* ignore */ } }

    return { el, client: mp, render };
  }

  // Hand off to the game page using the same contract the lobby uses. Each client
  // reconnects there and the relay resumes its session.
  function launch(mp) {
    try {
      const s = mp.session || {};
      const players = s.players || [];
      const me = players.find((p) => p.user_id === mp.userId) || {};
      localStorage.setItem('KG_Game', JSON.stringify({
        x: 'fasttrack:' + (s.session_id || ''),
        mode: 'private',
        code: s.session_code || null,
        playerCount: Math.max(2, players.length || 2),
        aiDifficulty: 'normal',
      }));
      localStorage.setItem('KG_Player', JSON.stringify({
        x: me.user_id || mp.userId || '',
        name: me.username || mp.username || 'Player',
        avatar: me.avatar_id || me.avatar || '\u{1F3AE}',
      }));
      sessionStorage.setItem('ft_session_players', JSON.stringify(players.map((p) => ({
        user_id: p.user_id, username: p.username || p.name,
        avatar: p.avatar_id || p.avatar || '\u{1F464}', is_ai: !!p.is_ai, is_host: !!p.is_host,
      }))));
    } catch (_) { /* ignore */ }
    if (typeof location !== 'undefined') location.href = '/fasttrack/3d.html?launch=1';
  }

  const api = { mount, buildLobbyView };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KGInviteLobby = api;
})(typeof window !== 'undefined' ? window : globalThis);
