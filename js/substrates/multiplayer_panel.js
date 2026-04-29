/**
 * KensGames — Universal Multiplayer Panel
 *
 * One panel, every game. Two flows, no login required:
 *   1. Solo vs AI    — host adds AI players, starts immediately.
 *   2. Play a Friend — host gets a code/URL, guest joins via URL, launch.
 *
 * Manifold contract:
 *   z = x * y where x = host_intent, y = guest_actions, z = lobby_state.
 *   The server-authoritative session.players[] IS the x-manifold players
 *   object — REST-resolved server-side from a 6-char code. URLs never
 *   carry player payloads, only the opaque code.
 *
 * Usage in any game's index.html:
 *   <script src="/js/substrates/avatar_picker.js" defer></script>
 *   <script src="/js/substrates/player_profile.js" defer></script>
 *   <script src="/js/multiplayer-client.js" defer></script>
 *   <script src="/js/substrates/multiplayer_panel.js" defer></script>
 *
 *   <div id="mp"></div>
 *   <script>
 *     window.addEventListener('load', () => {
 *       KGMultiplayerPanel.mount('#mp', {
 *         gameId: '4dtictactoe', gameName: '4D TicTacToe',
 *         minPlayers: 2, maxPlayers: 4,
 *         onLaunch: (session) => { window.KGSession = session; startGame(); }
 *       });
 *     });
 *   </script>
 */
'use strict';

(function (root) {
  const STATE = { CHOOSE: 'choose', LOBBY: 'lobby', LAUNCHING: 'launching', ERROR: 'error' };

  let _opts = null;
  let _root = null;
  let _mp = null;
  let _state = STATE.CHOOSE;
  let _mode = null;          // 'solo' | 'friend' | 'guest'
  let _myUserId = null;
  let _aiDifficulty = 'medium';
  let _error = null;
  let _copyTimer = null;

  // ── CSS (injected once) ─────────────────────────────────────────────
  const CSS = `
.kg-mp{font-family:'Orbitron',monospace;color:#e8e8ff;max-width:560px;margin:0 auto;}
.kg-mp-card{background:rgba(4,4,20,0.94);border:2px solid #00FFFF;
  box-shadow:0 0 18px rgba(0,255,255,0.35),0 0 36px rgba(122,60,255,0.18);
  border-radius:8px;padding:24px;}
.kg-mp h2{font-size:16px;letter-spacing:2px;color:#00FFFF;
  text-shadow:0 0 12px rgba(0,255,255,0.6);margin:0 0 6px;text-transform:uppercase;}
.kg-mp .game-name{font-size:11px;color:#9aa;letter-spacing:2px;margin-bottom:18px;}
.kg-mp button{font-family:inherit;font-size:13px;letter-spacing:1px;cursor:pointer;
  padding:12px 18px;border-radius:4px;transition:all 160ms ease;text-transform:uppercase;}
.kg-mp .btn-primary{background:#00FFFF;color:#04041a;border:none;
  box-shadow:0 0 14px rgba(0,255,255,0.5);font-weight:700;}
.kg-mp .btn-primary:hover:not([disabled]){background:#66ffff;box-shadow:0 0 22px rgba(0,255,255,0.8);}
.kg-mp .btn-primary[disabled]{background:#333;color:#777;box-shadow:none;cursor:not-allowed;}
.kg-mp .btn-ghost{background:transparent;color:#00FFFF;border:1px solid #00FFFF;}
.kg-mp .btn-ghost:hover{background:rgba(0,255,255,0.12);}
.kg-mp .btn-magenta{background:transparent;color:#FF00FF;border:1px solid #FF00FF;}
.kg-mp .btn-magenta:hover{background:rgba(255,0,255,0.12);}
.kg-mp .mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.kg-mp .mode-btn{background:rgba(0,0,0,0.4);border:1.5px solid rgba(0,255,255,0.4);
  color:#fff;padding:28px 12px;border-radius:6px;text-align:center;cursor:pointer;
  transition:all 200ms ease;font-family:inherit;}
.kg-mp .mode-btn:hover{border-color:#00FFFF;background:rgba(0,255,255,0.08);
  box-shadow:0 0 18px rgba(0,255,255,0.3);}
.kg-mp .mode-btn .mode-icon{font-size:36px;display:block;margin-bottom:10px;}
.kg-mp .mode-btn .mode-label{font-size:13px;letter-spacing:2px;color:#00FFFF;}
.kg-mp .mode-btn .mode-sub{font-size:10px;color:#9aa;margin-top:6px;letter-spacing:1px;}
.kg-mp .share-box{background:rgba(0,0,0,0.5);border:1px dashed rgba(0,255,255,0.5);
  padding:14px;border-radius:6px;margin-bottom:16px;}
.kg-mp .share-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.kg-mp .share-row:last-child{margin-bottom:0;}
.kg-mp .share-label{font-size:9px;color:#9aa;min-width:38px;letter-spacing:1px;text-transform:uppercase;}
.kg-mp .share-val{flex:1;font-family:'Courier New',monospace;font-size:13px;color:#00FFFF;
  text-shadow:0 0 6px rgba(0,255,255,0.4);user-select:all;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kg-mp .share-code{font-size:24px;letter-spacing:6px;font-weight:700;}
.kg-mp .copy-btn{padding:6px 10px;font-size:10px;}
.kg-mp .copy-btn.copied{background:rgba(0,255,102,0.2);color:#00ff66;border-color:#00ff66;}
.kg-mp .players-section{margin:18px 0;}
.kg-mp .players-header{font-size:11px;color:#9aa;letter-spacing:2px;
  margin-bottom:8px;text-transform:uppercase;}
.kg-mp .player-row{display:flex;align-items:center;gap:12px;padding:10px 12px;
  background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.18);border-radius:4px;
  margin-bottom:6px;}
.kg-mp .player-row.is-host{border-color:rgba(255,232,0,0.5);}
.kg-mp .player-row.is-ai{border-color:rgba(122,60,255,0.5);border-style:dashed;}
.kg-mp .player-row.is-me{box-shadow:inset 0 0 12px rgba(0,255,255,0.2);}
.kg-mp .player-avatar{font-size:24px;width:32px;text-align:center;line-height:1;}
.kg-mp .player-name{flex:1;font-size:13px;color:#fff;}
.kg-mp .player-tag{font-size:9px;padding:2px 6px;border-radius:3px;
  letter-spacing:1px;text-transform:uppercase;margin-right:6px;}
.kg-mp .tag-host{background:rgba(255,232,0,0.2);color:#ffe800;}
.kg-mp .tag-ai{background:rgba(122,60,255,0.2);color:#c4a3ff;}
.kg-mp .tag-me{background:rgba(0,255,255,0.2);color:#00FFFF;}
.kg-mp .player-status{font-size:10px;letter-spacing:1px;text-transform:uppercase;}
.kg-mp .player-status.ready{color:#00ff66;text-shadow:0 0 6px rgba(0,255,102,0.6);}
.kg-mp .player-status.waiting{color:#888;}
.kg-mp .empty-slot{display:flex;align-items:center;justify-content:center;
  padding:14px;color:#666;font-size:11px;letter-spacing:1px;
  border:1px dashed rgba(0,255,255,0.15);border-radius:4px;margin-bottom:6px;}
.kg-mp .ai-controls{display:flex;align-items:center;gap:10px;
  margin:14px 0;flex-wrap:wrap;}
.kg-mp .ai-difficulty{display:inline-flex;gap:4px;}
.kg-mp .diff-btn{padding:6px 12px;font-size:11px;background:rgba(0,0,0,0.4);
  color:#9aa;border:1px solid rgba(122,60,255,0.3);border-radius:3px;
  cursor:pointer;letter-spacing:1px;font-family:inherit;text-transform:uppercase;}
.kg-mp .diff-btn.active{background:rgba(122,60,255,0.25);color:#c4a3ff;
  border-color:#7a3cff;box-shadow:0 0 8px rgba(122,60,255,0.4);}
.kg-mp .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
.kg-mp .actions .btn-launch{flex:1;min-width:200px;padding:16px;font-size:14px;}
.kg-mp .err-msg{color:#ff4060;font-size:11px;margin-top:10px;letter-spacing:1px;
  padding:10px;background:rgba(255,64,96,0.08);border:1px solid rgba(255,64,96,0.3);border-radius:4px;}
.kg-mp .info-msg{color:#9aa;font-size:11px;margin-top:8px;letter-spacing:1px;text-align:center;}
.kg-mp .footer{display:flex;justify-content:space-between;align-items:center;margin-top:18px;
  padding-top:14px;border-top:1px solid rgba(0,255,255,0.15);}
.kg-mp .link-btn{background:none;border:none;color:#9aa;font-size:11px;
  cursor:pointer;letter-spacing:1px;padding:4px 8px;font-family:inherit;text-transform:uppercase;}
.kg-mp .link-btn:hover{color:#00FFFF;}
.kg-mp .spinner{display:inline-block;width:12px;height:12px;border:2px solid #00FFFF;
  border-top-color:transparent;border-radius:50%;animation:kgspin 0.7s linear infinite;
  vertical-align:middle;margin-right:6px;}
@keyframes kgspin{to{transform:rotate(360deg);}}
`;

  function injectCSS() {
    if (document.getElementById('kg-mp-styles')) return;
    const s = document.createElement('style');
    s.id = 'kg-mp-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function avatarGlyph(p) {
    if (p.is_ai) return '🤖';
    if (!p.avatar_id) return '👤';
    // Newer clients send the emoji glyph directly. Older may send "cat_emoji".
    const i = p.avatar_id.indexOf('_');
    return i >= 0 ? p.avatar_id.slice(i + 1) : p.avatar_id;
  }

  function urlForCode(code) {
    const path = location.pathname.replace(/index\.html$/i, '');
    return location.origin + path + '?code=' + encodeURIComponent(code);
  }

  function readUrlCode() {
    try {
      const m = location.search.match(/[?&]code=([A-Za-z0-9]{4,12})/);
      return m ? m[1].toUpperCase() : null;
    } catch { return null; }
  }

  function clearUrlCode() {
    try {
      const u = new URL(location.href); u.searchParams.delete('code');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch { /* ignore */ }
  }

  function readUrlMode() {
    try {
      const m = location.search.match(/[?&]mode=(solo|friend)\b/i);
      return m ? m[1].toLowerCase() : null;
    } catch { return null; }
  }

  function clearUrlMode() {
    try {
      const u = new URL(location.href); u.searchParams.delete('mode');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch { /* ignore */ }
  }

  async function copyToClipboard(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ COPIED'; btn.classList.add('copied');
      clearTimeout(_copyTimer);
      _copyTimer = setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────
  function render() {
    if (!_root) return;
    if (_state === STATE.ERROR) return renderError();
    if (_state === STATE.LAUNCHING) return renderLaunching();
    if (_state === STATE.CHOOSE) return renderChoose();
    if (_state === STATE.LOBBY) return renderLobby();
  }

  function renderShell(inner) {
    let subtitle = '▼ Free play · No signup · Bots or friends';
    if (_mode === 'guest') {
      const hostName = _mp && _mp.session && _mp.session.host_username;
      subtitle = hostName
        ? `▼ Invited by ${esc(hostName)} to play ${esc(_opts.gameName || _opts.gameId)}`
        : '▼ Joining game';
    }
    _root.innerHTML = `<div class="kg-mp"><div class="kg-mp-card">
      <h2>${esc(_opts.gameName || _opts.gameId)} — Lobby</h2>
      <div class="game-name">${subtitle}</div>
      ${inner}
    </div></div>`;
  }

  function renderChoose() {
    renderShell(`
      <div class="mode-grid">
        <button class="mode-btn" data-act="solo">
          <span class="mode-icon">🤖</span>
          <span class="mode-label">Solo vs AI</span>
          <div class="mode-sub">Practice against bots</div>
        </button>
        <button class="mode-btn" data-act="friend">
          <span class="mode-icon">👥</span>
          <span class="mode-label">Play a Friend</span>
          <div class="mode-sub">Share a code or link</div>
        </button>
      </div>
      <div class="info-msg">A name + avatar is required before playing.</div>
    `);
    _root.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
      const act = b.getAttribute('data-act');
      _mode = act;
      requireProfileThen(() => connectAndCreate(act === 'friend'));
    }));
  }

  function renderError() {
    renderShell(`
      <div class="err-msg">${esc(_error || 'Connection error')}</div>
      <div class="actions"><button class="btn-primary btn-launch" data-act="retry">▶ Try Again</button></div>
    `);
    _root.querySelector('[data-act="retry"]').addEventListener('click', () => {
      _error = null; _state = STATE.CHOOSE; render();
      try { _mp && _mp.disconnect(); } catch { /* ignore */ }
      _mp = null;
    });
  }

  function renderLaunching() {
    renderShell(`<div class="info-msg"><span class="spinner"></span>Launching ${esc(_opts.gameName)}…</div>`);
  }

  function renderLobby() {
    const session = _mp && _mp.session;
    if (!session) {
      return renderShell(`<div class="info-msg"><span class="spinner"></span>Connecting to lobby…</div>`);
    }
    const players = session.players || [];
    const isHost = session.host_id === _myUserId;
    const minP = _opts.minPlayers || 2;
    const maxP = session.max_players || _opts.maxPlayers || 4;
    const count = players.length;
    const allReady = players.length >= minP && players.every(p => p.is_ai || p.ready);
    const canLaunch = isHost && allReady;
    const canAddAi = isHost && count < maxP;

    const shareBlock = (session.is_private && session.session_code) ? `
      <div class="share-box">
        <div class="share-row">
          <div class="share-label">Code</div>
          <div class="share-val share-code">${esc(session.session_code)}</div>
          <button class="btn-ghost copy-btn" data-copy="${esc(session.session_code)}">📋 Copy</button>
        </div>
        <div class="share-row">
          <div class="share-label">Link</div>
          <div class="share-val">${esc(urlForCode(session.session_code))}</div>
          <button class="btn-ghost copy-btn" data-copy="${esc(urlForCode(session.session_code))}">📋 Copy</button>
        </div>
      </div>` : '';

    const playerRows = players.map(p => {
      const cls = ['player-row'];
      if (p.is_host) cls.push('is-host');
      if (p.is_ai) cls.push('is-ai');
      if (p.user_id === _myUserId) cls.push('is-me');
      const tags = [];
      if (p.is_host) tags.push('<span class="player-tag tag-host">Host</span>');
      if (p.is_ai) tags.push('<span class="player-tag tag-ai">AI</span>');
      if (p.user_id === _myUserId) tags.push('<span class="player-tag tag-me">You</span>');
      const status = (p.is_ai || p.ready)
        ? '<span class="player-status ready">✔ Ready</span>'
        : '<span class="player-status waiting">○ Waiting</span>';
      const removeBtn = (isHost && p.is_ai)
        ? `<button class="link-btn" data-remove-ai="${esc(p.user_id)}" title="Remove">✕</button>` : '';
      return `<div class="${cls.join(' ')}">
        <div class="player-avatar">${esc(avatarGlyph(p))}</div>
        <div class="player-name">${esc(p.username || 'Player')}</div>
        ${tags.join('')}${status}${removeBtn}
      </div>`;
    }).join('');

    const emptyTarget = (_mode === 'solo') ? Math.max(minP, count) : maxP;
    const emptySlots = Math.max(0, emptyTarget - count);
    const emptyRows = Array.from({ length: emptySlots }, (_, i) => {
      const need = (count + i + 1) <= minP;
      return `<div class="empty-slot">${need ? '○ Waiting for player…' : '○ Open seat'}</div>`;
    }).join('');

    const aiControls = isHost ? `
      <div class="ai-controls">
        <button class="btn-magenta" data-act="add-ai" ${canAddAi ? '' : 'disabled'}>+ Add AI</button>
        <div class="ai-difficulty">
          ${['easy', 'medium', 'hard'].map(d =>
      `<button class="diff-btn ${_aiDifficulty === d ? 'active' : ''}" data-diff="${d}">${d}</button>`).join('')}
        </div>
      </div>` : '';

    const launchAction = isHost
      ? `<button class="btn-primary btn-launch" data-act="launch" ${canLaunch ? '' : 'disabled'}>▶ Launch Game</button>`
      : `<div class="info-msg" style="flex:1;">${allReady ? 'All ready — waiting for host to launch…' : 'Waiting for other players…'}</div>`;

    renderShell(`
      ${shareBlock}
      <div class="players-section">
        <div class="players-header">Players (${count} / ${maxP}${count < minP ? ` · need ${minP - count} more` : ''})</div>
        ${playerRows}
        ${emptyRows}
      </div>
      ${aiControls}
      <div class="actions">${launchAction}</div>
      <div class="footer">
        <button class="link-btn" data-act="cancel">← Leave</button>
        <span class="link-btn" style="cursor:default;">${esc(session.game_name || _opts.gameName)}</span>
      </div>
    `);

    _root.querySelectorAll('[data-copy]').forEach(b =>
      b.addEventListener('click', () => copyToClipboard(b.getAttribute('data-copy'), b)));
    _root.querySelectorAll('[data-diff]').forEach(b =>
      b.addEventListener('click', () => { _aiDifficulty = b.getAttribute('data-diff'); render(); }));
    const addAi = _root.querySelector('[data-act="add-ai"]');
    if (addAi) addAi.addEventListener('click', () => _mp.addBot(_aiDifficulty));
    _root.querySelectorAll('[data-remove-ai]').forEach(b =>
      b.addEventListener('click', () => _mp.removeBot(b.getAttribute('data-remove-ai'))));
    const launch = _root.querySelector('[data-act="launch"]');
    if (launch) launch.addEventListener('click', hostLaunch);
    const cancel = _root.querySelector('[data-act="cancel"]');
    if (cancel) cancel.addEventListener('click', leaveAndReset);
  }

  // ── Flow: profile gate → connect → create / join ────────────────────
  function requireProfileThen(cb) {
    if (typeof KGPlayerProfile === 'undefined' || !KGPlayerProfile.ensure) {
      console.warn('[KGMultiplayerPanel] KGPlayerProfile not loaded; proceeding without gate');
      return cb();
    }
    KGPlayerProfile.ensure(true, cb);
  }

  function getProfile() {
    const name = (typeof KGPlayerProfile !== 'undefined' && KGPlayerProfile.getName)
      ? KGPlayerProfile.getName() : (localStorage.getItem('display_name') || 'Guest');
    const av = (typeof AvatarPicker !== 'undefined' && AvatarPicker.get) ? AvatarPicker.get() : null;
    return { name: name || 'Guest', avatarEmoji: av ? av.emoji : null };
  }

  function ensureClient() {
    if (_mp) return _mp;
    if (typeof KGMultiplayer === 'undefined') {
      _error = 'Multiplayer client not loaded'; _state = STATE.ERROR; render(); return null;
    }
    const prof = getProfile();
    _mp = new KGMultiplayer(_opts.gameId, {});
    _mp.on('authenticated', (a) => { _myUserId = a.userId; });
    _mp.on('session_update', () => { if (_state !== STATE.LAUNCHING) { _state = STATE.LOBBY; render(); } });
    _mp.on('share_code', () => render());
    _mp.on('game_started', (data) => {
      _state = STATE.LAUNCHING; render();
      const session = (data && data.session) || (_mp && _mp.session);
      const launchPayload = Object.assign({}, session, {
        my_user_id: _myUserId,
        is_host: session ? session.host_id === _myUserId : false,
        client: _mp,
      });
      try { root.KGSession = launchPayload; } catch { /* ignore */ }
      try { _opts.onLaunch && _opts.onLaunch(launchPayload); }
      catch (e) { console.error('[KGMultiplayerPanel] onLaunch threw:', e); }
    });
    _mp.on('error', (msg) => { _error = msg || 'Server error'; _state = STATE.ERROR; render(); });
    _mp.on('disconnected', () => {
      if (_state === STATE.LAUNCHING) return; // game took over
      _error = 'Disconnected from server'; _state = STATE.ERROR; render();
    });
    _mp.connect({ username: prof.name });
    return _mp;
  }

  function connectAndCreate(isPrivate) {
    _state = STATE.LOBBY; render();
    const mp = ensureClient(); if (!mp) return;
    const create = () => {
      mp.createGame({ private: !!isPrivate, max_players: _opts.maxPlayers });
      const wantBots = (_mode === 'solo') ? Math.max(0, _opts.soloDefaultBots || 1) : 0;
      let botsAdded = 0;
      const onceReady = () => {
        if (mp.session && mp.userId) {
          const me = mp.session.players.find(p => p.user_id === mp.userId);
          if (me && !me.ready) mp.toggleReady();
          while (botsAdded < wantBots && mp.session.players.length < _opts.maxPlayers) {
            mp.addBot(_aiDifficulty); botsAdded++;
          }
          if (botsAdded >= wantBots) mp.off('session_update', onceReady);
        }
      };
      mp.on('session_update', onceReady);
    };
    if (mp.userId) create(); else mp.on('authenticated', create);
  }

  function connectAndJoin(code) {
    _state = STATE.LOBBY; render();
    const mp = ensureClient(); if (!mp) return;
    const join = () => {
      mp.joinByCode(code);
      // Guest auto-readies on join (per spec: hitting Join = ready)
      const onceJoined = () => {
        if (mp.session && mp.userId) {
          const me = mp.session.players.find(p => p.user_id === mp.userId);
          if (me && !me.ready) mp.toggleReady();
          mp.off('session_update', onceJoined);
        }
      };
      mp.on('session_update', onceJoined);
    };
    if (mp.userId) join(); else mp.on('authenticated', join);
  }

  function hostLaunch() {
    if (!_mp || !_mp.session) return;
    // Server requires accept_lobby before start_game; chain them.
    _mp.acceptLobby();
    setTimeout(() => _mp.startGame(), 80);
  }

  function leaveAndReset() {
    try { _mp && _mp.leave(); } catch { /* ignore */ }
    try { _mp && _mp.disconnect(); } catch { /* ignore */ }
    _mp = null; _myUserId = null; _mode = null; _state = STATE.CHOOSE;
    clearUrlCode();
    render();
  }

  // ── Public API ──────────────────────────────────────────────────────
  const KGMultiplayerPanel = {
    mount(target, opts) {
      _opts = Object.assign({ minPlayers: 2, maxPlayers: 4, autoCode: true, soloDefaultBots: 1 }, opts || {});
      if (!_opts.gameId) throw new Error('KGMultiplayerPanel.mount: opts.gameId is required');
      _root = (typeof target === 'string') ? document.querySelector(target) : target;
      if (!_root) throw new Error('KGMultiplayerPanel.mount: target not found');
      injectCSS();
      _state = STATE.CHOOSE; _mode = null; _error = null;
      const code = _opts.autoCode ? readUrlCode() : null;
      const autoMode = _opts.autoMode || readUrlMode();
      if (code) {
        _mode = 'guest';
        renderShell(`<div class="info-msg"><span class="spinner"></span>Loading invite ${esc(code)}…</div>`);
        requireProfileThen(() => connectAndJoin(code));
      } else if (autoMode === 'solo' || autoMode === 'friend') {
        _mode = autoMode;
        clearUrlMode();
        requireProfileThen(() => connectAndCreate(autoMode === 'friend'));
      } else {
        render();
      }
      return KGMultiplayerPanel;
    },
    unmount() {
      try { _mp && _mp.leave(); _mp && _mp.disconnect(); } catch { /* ignore */ }
      _mp = null; _myUserId = null;
      if (_root) _root.innerHTML = '';
      _root = null; _opts = null;
    },
    get session() { return _mp ? _mp.session : null; },
    get client() { return _mp; },
  };

  root.KGMultiplayerPanel = KGMultiplayerPanel;
})(window);
