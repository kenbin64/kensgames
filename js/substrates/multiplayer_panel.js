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
  // Wizard substeps inside LOBBY. One topic per screen, no scrolling required.
  //   share  — friend host: just the code/link to send out
  //   roster — players + bot controls
  //   launch — confirmation summary + Launch button
  //   wait   — guest waiting for host to launch
  const STEP = { SHARE: 'share', ROSTER: 'roster', LAUNCH: 'launch', WAIT: 'wait' };

  let _opts = null;
  let _root = null;
  let _mp = null;
  let _state = STATE.CHOOSE;
  let _step = null;
  let _mode = null;          // 'solo' | 'friend' | 'guest'
  let _myUserId = null;
  let _aiDifficulty = 'medium';
  let _error = null;
  let _copyTimer = null;
  let _pendingCode = null;
  let _launchingNow = false;
  let _profileNameDraft = '';
  let _profileAvatarDraft = null;

  // ── CSS (injected once) ─────────────────────────────────────────────
  // Canonical KensGames Tron palette: cyan (primary), green (go), purple (AI/accent).
  const CSS = `
.kg-mp{font-family:'Orbitron',monospace;color:#e8e8ff;max-width:min(980px,98vw);width:100%;margin:0 auto;}
.kg-mp.kg-mp-vh{max-height:calc(100vh - 24px);margin:12px auto;}
.kg-mp-card{background:rgba(4,4,20,0.94);border:2px solid #00FFFF;
  box-shadow:0 0 18px rgba(0,255,255,0.35),0 0 36px rgba(153,0,255,0.20);
  border-radius:10px;padding:24px 24px 20px;max-height:calc(100vh - 24px);overflow:auto;}
.kg-mp h2{font-size:15px;letter-spacing:3px;color:#00FFFF;
  text-shadow:0 0 12px rgba(0,255,255,0.6);margin:0 0 4px;text-transform:uppercase;text-align:center;}
.kg-mp .game-name{font-size:10px;color:#8aa;letter-spacing:2px;margin-bottom:18px;text-align:center;text-transform:uppercase;}
.kg-mp .step-title{font-family:'Orbitron',monospace;font-size:12px;letter-spacing:3px;
  color:#00FF41;text-shadow:0 0 8px rgba(0,255,65,0.5);text-transform:uppercase;
  text-align:center;margin:6px 0 18px;}
.kg-mp button{font-family:inherit;font-size:13px;letter-spacing:1px;cursor:pointer;
  padding:12px 18px;border-radius:4px;transition:all 160ms ease;text-transform:uppercase;}
.kg-mp .btn-primary{background:#00FF41;color:#04041a;border:none;
  box-shadow:0 0 14px rgba(0,255,65,0.55);font-weight:700;}
.kg-mp .btn-primary:hover:not([disabled]){background:#66ff7a;box-shadow:0 0 24px rgba(0,255,65,0.85);}
.kg-mp .btn-primary[disabled]{background:#333;color:#777;box-shadow:none;cursor:not-allowed;}
.kg-mp .btn-cyan{background:#00FFFF;color:#04041a;border:none;
  box-shadow:0 0 14px rgba(0,255,255,0.5);font-weight:700;}
.kg-mp .btn-cyan:hover:not([disabled]){background:#66ffff;box-shadow:0 0 22px rgba(0,255,255,0.8);}
.kg-mp .btn-cyan[disabled]{background:#333;color:#777;box-shadow:none;cursor:not-allowed;}
.kg-mp .btn-ghost{background:transparent;color:#00FFFF;border:1px solid #00FFFF;}
.kg-mp .btn-ghost:hover{background:rgba(0,255,255,0.12);}
.kg-mp .btn-purple{background:transparent;color:#c4a3ff;border:1px solid #9900FF;}
.kg-mp .btn-purple:hover:not([disabled]){background:rgba(153,0,255,0.18);box-shadow:0 0 12px rgba(153,0,255,0.45);}
.kg-mp .btn-purple[disabled]{opacity:.4;cursor:not-allowed;}
.kg-mp .progress{display:flex;justify-content:center;gap:10px;margin-bottom:10px;}
.kg-mp .progress .dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.12);
  border:1px solid rgba(0,255,255,0.25);transition:all 200ms ease;}
.kg-mp .progress .dot.done{background:#9900FF;border-color:#9900FF;box-shadow:0 0 6px rgba(153,0,255,0.6);}
.kg-mp .progress .dot.active{background:#00FF41;border-color:#00FF41;box-shadow:0 0 10px rgba(0,255,65,0.8);
  transform:scale(1.25);}
.kg-mp .step{animation:kgFade 240ms ease;}
@keyframes kgFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
.kg-mp .mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.kg-mp .mode-btn{background:rgba(0,0,0,0.4);border:1.5px solid rgba(0,255,255,0.4);
  color:#fff;padding:32px 14px;border-radius:8px;text-align:center;cursor:pointer;
  transition:all 200ms ease;font-family:inherit;}
.kg-mp .mode-btn:hover{border-color:#00FFFF;background:rgba(0,255,255,0.08);
  box-shadow:0 0 18px rgba(0,255,255,0.35);transform:translateY(-3px);}
.kg-mp .mode-btn[data-act="friend"]{border-color:rgba(153,0,255,0.45);}
.kg-mp .mode-btn[data-act="friend"]:hover{border-color:#9900FF;background:rgba(153,0,255,0.10);
  box-shadow:0 0 18px rgba(153,0,255,0.45);}
.kg-mp .mode-btn[data-act="friend"] .mode-label{color:#c4a3ff;}
.kg-mp .mode-btn .mode-icon{font-size:42px;display:block;margin-bottom:12px;
  filter:drop-shadow(0 0 6px currentColor);}
.kg-mp .mode-btn .mode-label{font-size:13px;letter-spacing:2px;color:#00FFFF;font-weight:700;}
.kg-mp .mode-btn .mode-sub{font-size:10px;color:#9aa;margin-top:8px;letter-spacing:1px;line-height:1.5;}
.kg-mp .share-box{background:rgba(0,0,0,0.55);border:1.5px dashed rgba(153,0,255,0.55);
  padding:22px 18px;border-radius:8px;margin-bottom:14px;text-align:center;
  box-shadow:inset 0 0 24px rgba(153,0,255,0.06);}
.kg-mp .share-code-big{font-family:'Orbitron',monospace;font-size:42px;font-weight:900;
  letter-spacing:10px;color:#00FFFF;text-shadow:0 0 14px rgba(0,255,255,0.7),0 0 28px rgba(0,255,255,0.4);
  user-select:all;cursor:pointer;padding:6px 0;}
.kg-mp .share-code-label{font-size:10px;letter-spacing:3px;color:#9aa;
  text-transform:uppercase;margin-bottom:6px;}
.kg-mp .share-link-row{display:flex;align-items:center;gap:8px;margin-top:14px;
  padding:10px;background:rgba(0,0,0,0.4);border-radius:4px;border:1px solid rgba(0,255,255,0.18);}
.kg-mp .share-link{flex:1;font-family:'Courier New',monospace;font-size:11px;color:#00FFFF;
  user-select:all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
.kg-mp .copy-btn{padding:7px 12px;font-size:10px;}
.kg-mp .copy-btn.copied{background:rgba(0,255,65,0.2);color:#00FF41;border-color:#00FF41;}
.kg-mp .joined-count{font-size:11px;color:#00FF41;letter-spacing:2px;text-transform:uppercase;
  margin-top:14px;text-shadow:0 0 6px rgba(0,255,65,0.5);}
.kg-mp .player-row{display:flex;align-items:center;gap:12px;padding:12px 14px;
  background:rgba(0,0,0,0.45);border:1px solid rgba(0,255,255,0.20);border-radius:6px;
  margin-bottom:8px;}
.kg-mp .roster-scroll{max-height:min(36vh,320px);overflow:auto;padding-right:2px;margin-bottom:6px;}
.kg-mp .player-row.is-host{border-color:rgba(0,255,65,0.5);box-shadow:0 0 8px rgba(0,255,65,0.15);}
.kg-mp .player-row.is-ai{border-color:rgba(153,0,255,0.5);border-style:dashed;
  background:rgba(153,0,255,0.05);}
.kg-mp .player-row.is-me{box-shadow:inset 0 0 12px rgba(0,255,255,0.25);}
.kg-mp .player-avatar{font-size:26px;width:34px;text-align:center;line-height:1;}
.kg-mp .player-name{flex:1;font-size:13px;color:#fff;}
.kg-mp .player-tag{font-size:9px;padding:2px 6px;border-radius:3px;
  letter-spacing:1px;text-transform:uppercase;margin-right:6px;}
.kg-mp .tag-host{background:rgba(0,255,65,0.2);color:#00FF41;}
.kg-mp .tag-ai{background:rgba(153,0,255,0.2);color:#c4a3ff;}
.kg-mp .tag-me{background:rgba(0,255,255,0.2);color:#00FFFF;}
.kg-mp .player-status{font-size:10px;letter-spacing:1px;text-transform:uppercase;}
.kg-mp .player-status.ready{color:#00FF41;text-shadow:0 0 6px rgba(0,255,65,0.6);}
.kg-mp .player-status.waiting{color:#888;}
.kg-mp .empty-slot{display:flex;align-items:center;justify-content:center;
  padding:14px;color:#666;font-size:11px;letter-spacing:1px;
  border:1px dashed rgba(0,255,255,0.15);border-radius:6px;margin-bottom:8px;}
.kg-mp .ai-controls{display:flex;align-items:center;gap:10px;
  margin:14px 0 6px;flex-wrap:wrap;justify-content:center;}
.kg-mp .ai-difficulty{display:inline-flex;gap:4px;}
.kg-mp .diff-btn{padding:6px 12px;font-size:11px;background:rgba(0,0,0,0.4);
  color:#9aa;border:1px solid rgba(153,0,255,0.3);border-radius:3px;
  cursor:pointer;letter-spacing:1px;font-family:inherit;text-transform:uppercase;}
.kg-mp .diff-btn.active{background:rgba(153,0,255,0.25);color:#c4a3ff;
  border-color:#9900FF;box-shadow:0 0 8px rgba(153,0,255,0.5);}
.kg-mp .summary{background:rgba(0,0,0,0.45);border:1px solid rgba(0,255,255,0.25);
  border-radius:8px;padding:18px;margin-bottom:14px;}
.kg-mp .invite-panel{background:rgba(0,0,0,0.52);border:1px solid rgba(0,255,255,0.25);
  border-radius:8px;padding:14px;margin-bottom:12px;text-align:center;}
.kg-mp .invite-title{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#00ffff;
  margin-bottom:6px;text-shadow:0 0 8px rgba(0,255,255,0.45);}
.kg-mp .invite-meta{font-size:10px;color:#9aa;letter-spacing:1px;margin-bottom:8px;}
.kg-mp .guest-welcome{text-align:center;padding:4px 0 10px;}
.kg-mp .welcome-emoji{font-size:54px;margin-bottom:8px;transition:all 120ms ease;}
.kg-mp .welcome-sub{font-size:11px;color:#9aa;letter-spacing:1px;margin-bottom:16px;line-height:1.6;}
.kg-mp .name-field{width:100%;background:rgba(0,0,0,0.5);border:1.5px solid rgba(0,255,255,0.35);
  color:#e8e8ff;font-family:'Orbitron',monospace;font-size:14px;padding:12px 14px;border-radius:4px;
  letter-spacing:1px;outline:none;box-sizing:border-box;margin-bottom:12px;}
.kg-mp .name-field:focus{border-color:#00FFFF;box-shadow:0 0 10px rgba(0,255,255,0.25);}
.kg-mp .avatar-quick{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-bottom:8px;}
.kg-mp .av-btn{font-size:24px;width:44px;height:44px;background:rgba(0,0,0,0.4);
  border:1.5px solid rgba(0,255,255,0.2);border-radius:6px;cursor:pointer;
  transition:all 140ms ease;display:flex;align-items:center;justify-content:center;padding:0;}
.kg-mp .av-btn:hover{border-color:#00FFFF;background:rgba(0,255,255,0.08);}
.kg-mp .av-btn.selected{border-color:#00FF41;background:rgba(0,255,65,0.15);
  box-shadow:0 0 10px rgba(0,255,65,0.45);}
.kg-mp .av-more{font-size:10px;color:#9aa;letter-spacing:1px;text-align:center;
  margin-bottom:14px;cursor:pointer;text-transform:uppercase;}
.kg-mp .av-more:hover{color:#00FFFF;}
.kg-mp .player-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));
  gap:12px;align-items:stretch;margin-bottom:14px;}
.kg-mp .player-card{background:rgba(0,0,0,0.55);border:1.5px solid rgba(0,255,255,0.28);
  border-radius:10px;padding:14px 10px;text-align:center;
  transition:box-shadow 220ms ease;}
.kg-mp .player-card.is-host{border-color:rgba(0,255,65,0.6);box-shadow:0 0 12px rgba(0,255,65,0.18);}
.kg-mp .player-card.is-ai{border-color:rgba(153,0,255,0.5);border-style:dashed;}
.kg-mp .player-card.is-me{box-shadow:inset 0 0 16px rgba(0,255,255,0.18);}
.kg-mp .player-card.is-ready{border-color:#00FF41;}
.kg-mp .player-card .pc-avatar{font-size:34px;margin-bottom:7px;}
.kg-mp .player-card .pc-name{font-size:11px;color:#fff;letter-spacing:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;}
.kg-mp .player-card .pc-tags{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin-bottom:5px;}
.kg-mp .player-card .pc-status{font-size:9px;letter-spacing:1px;text-transform:uppercase;
  padding:3px 6px;border-radius:3px;}
.kg-mp .player-card .pc-status.ready{color:#00FF41;background:rgba(0,255,65,0.1);}
.kg-mp .player-card .pc-status.waiting{color:#888;}
.kg-mp .player-card-empty{background:rgba(0,0,0,0.18);border:1.5px dashed rgba(0,255,255,0.12);
  border-radius:10px;padding:14px 10px;text-align:center;
  color:#444;font-size:11px;letter-spacing:1px;display:flex;align-items:center;justify-content:center;}
.kg-mp .lobby-footer{padding-top:12px;border-top:1px solid rgba(0,255,255,0.12);
  position:sticky;bottom:0;background:linear-gradient(to top, rgba(4,4,20,0.98), rgba(4,4,20,0.85));}
.kg-mp .summary-row{display:flex;justify-content:space-between;align-items:center;
  padding:6px 0;font-size:12px;}
.kg-mp .summary-row + .summary-row{border-top:1px solid rgba(0,255,255,0.1);}
.kg-mp .summary-label{color:#9aa;letter-spacing:1.5px;text-transform:uppercase;font-size:10px;}
.kg-mp .summary-val{color:#00FFFF;text-shadow:0 0 6px rgba(0,255,255,0.4);font-weight:700;}
.kg-mp .nav-row{display:flex;gap:10px;align-items:center;margin-top:18px;}
.kg-mp .nav-row .btn-back{flex:0 0 auto;}
.kg-mp .nav-row .btn-next{flex:1;padding:14px;font-size:13px;}
.kg-mp .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
.kg-mp .actions .btn-launch{flex:1;min-width:200px;padding:18px;font-size:15px;}
.kg-mp .err-msg{color:#ff4060;font-size:11px;margin-top:10px;letter-spacing:1px;
  padding:10px;background:rgba(255,64,96,0.08);border:1px solid rgba(255,64,96,0.3);border-radius:4px;}
.kg-mp .info-msg{color:#9aa;font-size:12px;margin-top:8px;letter-spacing:1px;text-align:center;line-height:1.6;}
.kg-mp .footer{display:flex;justify-content:space-between;align-items:center;margin-top:18px;
  padding-top:14px;border-top:1px solid rgba(0,255,255,0.15);}
.kg-mp .link-btn{background:none;border:none;color:#9aa;font-size:11px;
  cursor:pointer;letter-spacing:1px;padding:4px 8px;font-family:inherit;text-transform:uppercase;}
.kg-mp .link-btn:hover{color:#00FFFF;}
.kg-mp .spinner{display:inline-block;width:14px;height:14px;border:2px solid #00FFFF;
  border-top-color:transparent;border-radius:50%;animation:kgspin 0.7s linear infinite;
  vertical-align:middle;margin-right:8px;}
@keyframes kgspin{to{transform:rotate(360deg);}}
@media (max-width:560px){
  .kg-mp.kg-mp-vh{margin:6px auto;max-height:calc(100vh - 12px);}
  .kg-mp-card{padding:16px 14px;max-height:calc(100vh - 12px);}
  .kg-mp .mode-grid{grid-template-columns:1fr;}
  .kg-mp .player-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
  .kg-mp h2{font-size:16px;}
  .kg-mp .game-name{font-size:11px;}
  .kg-mp .step-title{font-size:13px;}
  .kg-mp button{font-size:14px;padding:13px 18px;}
  .kg-mp .share-code-big{font-size:32px;letter-spacing:7px;}
  .kg-mp .share-code-label{font-size:11px;}
  .kg-mp .share-link{font-size:12px;}
  .kg-mp .share-link-row{flex-direction:column;align-items:stretch;gap:8px;}
  .kg-mp .copy-btn{font-size:12px;padding:9px 14px;}
  .kg-mp .joined-count{font-size:12px;}
  .kg-mp .mode-btn{padding:24px 10px;}
  .kg-mp .mode-btn .mode-icon{font-size:34px;}
  .kg-mp .mode-btn .mode-label{font-size:14px;}
  .kg-mp .mode-btn .mode-sub{font-size:11px;}
  .kg-mp .player-name{font-size:14px;}
  .kg-mp .player-tag{font-size:10px;}
  .kg-mp .player-status{font-size:11px;}
  .kg-mp .empty-slot{font-size:12px;}
  .kg-mp .diff-btn{font-size:12px;padding:7px 13px;}
  .kg-mp .summary-row{font-size:13px;}
  .kg-mp .summary-label{font-size:11px;}
  .kg-mp .nav-row .btn-next{font-size:14px;padding:15px;}
  .kg-mp .nav-row{flex-wrap:wrap;}
  .kg-mp .nav-row .btn-back,.kg-mp .nav-row .btn-next{width:100%;}
  .kg-mp .actions .btn-launch{font-size:16px;padding:18px;}
  .kg-mp .err-msg{font-size:12px;}
  .kg-mp .info-msg{font-size:13px;}
  .kg-mp .link-btn{font-size:12px;}
}

@media (min-width:561px) and (max-width:920px){
  .kg-mp .player-cards{grid-template-columns:repeat(2,minmax(0,1fr));}
}
`;

  function injectCSS() {
    if (document.getElementById('kg-mp-styles')) return;
    const s = document.createElement('style');
    s.id = 'kg-mp-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function injectBootstrap() {
    if (document.getElementById('kg-mp-bootstrap')) return;
    const l = document.createElement('link');
    l.id = 'kg-mp-bootstrap';
    l.rel = 'stylesheet';
    l.href = '/lib/bootstrap/css/bootstrap.min.css';
    document.head.appendChild(l);
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
    const url = new URL('/join.html', location.origin);
    url.searchParams.set('code', String(code || '').toUpperCase());
    if (_opts && _opts.gameId) url.searchParams.set('game', _opts.gameId);
    return url.toString();
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

  // One readiness rule for both display and launch gating.
  function isPlayerReady(p) {
    return !!(p && (p.ready || p.is_ai || p.is_host));
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

  function renderShell(inner, opts) {
    opts = opts || {};
    let subtitle = '▼ Free play · No signup · Bots or friends';
    if (_mode === 'guest') {
      const hostName = _mp && _mp.session && _mp.session.host_username;
      subtitle = hostName
        ? `▼ Invited by ${esc(hostName)} to play ${esc(_opts.gameName || _opts.gameId)}`
        : '▼ Joining game';
    }
    const progress = opts.progress
      ? `<div class="progress">${opts.progress.map((s, i) =>
        `<div class="dot ${s}" data-step="${i}"></div>`).join('')}</div>` : '';
    const stepTitle = opts.stepTitle ? `<div class="step-title">${esc(opts.stepTitle)}</div>` : '';
    _root.innerHTML = `<div class="kg-mp kg-mp-vh"><div class="kg-mp-card">
      <h2>${esc(_opts.gameName || _opts.gameId)}</h2>
      <div class="game-name">${subtitle}</div>
      ${progress}
      ${stepTitle}
      <div class="step">${inner}</div>
    </div></div>`;
  }

  // Build a 3-dot progress array: 'done' | 'active' | '' (pending) per step.
  // Solo skips the share step, so it has 2 dots; friend/host has 3.
  function progressFor(currentStep) {
    const steps = (_mode === 'friend')
      ? [STEP.SHARE, STEP.ROSTER, STEP.LAUNCH]
      : [STEP.ROSTER, STEP.LAUNCH];
    const idx = steps.indexOf(currentStep);
    return steps.map((_, i) => i < idx ? 'done' : (i === idx ? 'active' : ''));
  }

  function renderModeChoice() {
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
    `, { stepTitle: 'Choose how to play' });
    _root.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
      const act = b.getAttribute('data-act');
      _mode = act;
      _step = (act === 'friend') ? STEP.SHARE : STEP.ROSTER;
      saveProfileDraft();
      connectAndCreate(act === 'friend');
    }));
  }

  function renderNameStep(opts) {
    const isGuest = !!(opts && opts.guest);
    const code = opts && opts.code;
    renderShell(`
      <div class="guest-welcome">
        <div class="welcome-emoji">${_profileAvatarDraft || '👤'}</div>
        <div class="welcome-sub">Choose your player name.</div>
      </div>
      <input class="name-field" id="kg-name-step" type="text" maxlength="18"
        placeholder="Your name..." value="${esc(_profileNameDraft || '')}" autocomplete="off" spellcheck="false">
      <div class="nav-row">
        ${isGuest ? '<button class="btn-ghost btn-back" data-act="cancel">← Cancel</button>' : ''}
        <button class="btn-cyan btn-next" id="kg-name-next" disabled>Next →</button>
      </div>
      <div class="info-msg">${isGuest ? `Invite code: ${esc(code || '...')}` : 'Step 1 of 3'}</div>
    `, { stepTitle: isGuest ? 'Invited Guest Wizard · Name' : 'Setup · Player Name' });

    const nameEl = _root.querySelector('#kg-name-step');
    const nextBtn = _root.querySelector('#kg-name-next');
    const sync = () => {
      _profileNameDraft = nameEl.value.trim();
      nextBtn.disabled = _profileNameDraft.length < 1;
    };
    nameEl.addEventListener('input', sync);
    sync();
    nextBtn.addEventListener('click', () => renderAvatarStep(opts));
    const cancel = _root.querySelector('[data-act="cancel"]');
    if (cancel) cancel.addEventListener('click', leaveAndReset);
  }

  function renderAvatarStep(opts) {
    const isGuest = !!(opts && opts.guest);
    const QUICK_AVS = ['😊', '😎', '🤩', '😈', '🤖', '👾', '🚀', '👽', '🦊', '🐯', '🥷', '🦸', '👑', '🎮', '🎯'];
    const buttons = QUICK_AVS.map(e =>
      `<button class="av-btn${_profileAvatarDraft === e ? ' selected' : ''}" data-av="${e}">${e}</button>`).join('');
    renderShell(`
      <div class="guest-welcome">
        <div class="welcome-emoji" id="kg-av-preview">${_profileAvatarDraft || '👤'}</div>
        <div class="welcome-sub">Choose your avatar.</div>
      </div>
      <div class="avatar-quick">${buttons}</div>
      <div class="av-more" id="kg-av-more">+ More avatars</div>
      <div class="nav-row">
        <button class="btn-ghost btn-back" data-act="back">← Back</button>
        <button class="btn-cyan btn-next" id="kg-av-next" ${_profileAvatarDraft ? '' : 'disabled'}>Next →</button>
      </div>
      <div class="info-msg">${isGuest ? 'Step 2 of 3' : 'Step 2 of 3'}</div>
    `, { stepTitle: isGuest ? 'Invited Guest Wizard · Avatar' : 'Setup · Avatar' });

    const preview = _root.querySelector('#kg-av-preview');
    const nextBtn = _root.querySelector('#kg-av-next');
    _root.querySelectorAll('.av-btn').forEach(b => {
      b.addEventListener('click', () => {
        _root.querySelectorAll('.av-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        _profileAvatarDraft = b.getAttribute('data-av');
        if (preview) preview.textContent = _profileAvatarDraft;
        nextBtn.disabled = !_profileAvatarDraft;
      });
    });
    _root.querySelector('#kg-av-more').addEventListener('click', () => {
      if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
        AvatarPicker.show(av => {
          _profileAvatarDraft = av.emoji;
          if (preview) preview.textContent = _profileAvatarDraft;
          _root.querySelectorAll('.av-btn').forEach(x =>
            x.classList.toggle('selected', x.getAttribute('data-av') === _profileAvatarDraft));
          nextBtn.disabled = !_profileAvatarDraft;
        });
      }
    });
    _root.querySelector('[data-act="back"]').addEventListener('click', () => renderNameStep(opts));
    nextBtn.addEventListener('click', () => {
      saveProfileDraft();
      if (isGuest) {
        clearUrlCode();
        connectAndJoin(_pendingCode);
      } else {
        renderModeChoice();
      }
    });
  }

  function renderChoose() {
    if (!_profileNameDraft) return renderNameStep({ guest: false });
    if (!_profileAvatarDraft) return renderAvatarStep({ guest: false });
    return renderModeChoice();
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

  // Wizard dispatcher: lobby is broken into substeps so each screen shows
  // only one focused topic at a time (no scrolling, no crowding).
  function renderLobby() {
    const session = _mp && _mp.session;
    if (!session) {
      return renderShell(
        `<div class="info-msg"><span class="spinner"></span>Connecting to lobby…</div>`);
    }
    const isHost = session.host_id === _myUserId;
    // Guest view: horizontal card lobby with waiting footer.
    if (!isHost) return renderLobbyCards(session, false);
    // Friend host: share step first, then horizontal card lobby with launch.
    if (_mode === 'friend' && _step === STEP.SHARE) return renderShare(session);
    if (_mode === 'friend') return renderLobbyCards(session, true);
    // Solo: original roster + launch confirmation flow.
    if (_step === STEP.LAUNCH) return renderLaunchStep(session);
    return renderRoster(session);
  }

  // Step 1 (friend host only): just the share code/link. Nothing else competes
  // for attention until the friend has the invite.
  function renderShare(session) {
    const code = session.session_code || '······';
    const link = session.session_code ? urlForCode(session.session_code) : '';
    const others = (session.players || []).filter(p => !p.is_ai && p.user_id !== _myUserId).length;
    renderShell(`
      <div class="share-box">
        <div class="share-code-label">Game Code</div>
        <div class="share-code-big" data-copy="${esc(code)}">${esc(code)}</div>
        <div class="share-link-row">
          <div class="share-link" data-copy="${esc(link)}">${esc(link)}</div>
          <button class="btn-ghost copy-btn" data-copy="${esc(link)}">Copy Link</button>
        </div>
        <div class="joined-count">
          ${others > 0 ? `${others} friend${others === 1 ? '' : 's'} joined` : 'Waiting for friends…'}
        </div>
      </div>
      <div class="info-msg">Send the code or link. You'll add bots and launch on the next screens.</div>
      <div class="nav-row">
        <button class="btn-ghost btn-back" data-act="cancel">← Leave</button>
        <button class="btn-cyan btn-next" data-act="to-roster">Add Players →</button>
      </div>
    `, { progress: progressFor(STEP.SHARE), stepTitle: 'Invite a Friend' });

    _root.querySelectorAll('[data-copy]').forEach(b =>
      b.addEventListener('click', () => copyToClipboard(b.getAttribute('data-copy'), b)));
    _root.querySelector('[data-act="to-roster"]').addEventListener('click', () => {
      _step = STEP.ROSTER; render();
    });
    _root.querySelector('[data-act="cancel"]').addEventListener('click', leaveAndReset);
  }

  // Step 2: roster + bot controls. No share box, no big launch button — just
  // the list of seats and the controls to fill them.
  function renderRoster(session) {
    const players = session.players || [];
    const isHost = session.host_id === _myUserId;
    const minP = _opts.minPlayers || 2;
    const maxP = session.max_players || _opts.maxPlayers || 4;
    const count = players.length;
    const canAddAi = isHost && count < maxP;
    const allReady = count >= minP && players.every(isPlayerReady);

    const playerRows = players.map(p => {
      const cls = ['player-row'];
      if (p.is_host) cls.push('is-host');
      if (p.is_ai) cls.push('is-ai');
      if (p.user_id === _myUserId) cls.push('is-me');
      const tags = [];
      if (p.is_host) tags.push('<span class="player-tag tag-host">Host</span>');
      if (p.is_ai) tags.push('<span class="player-tag tag-ai">AI</span>');
      if (p.user_id === _myUserId) tags.push('<span class="player-tag tag-me">You</span>');
      const status = isPlayerReady(p)
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

    const emptyTarget = (_mode === 'solo') ? Math.max(minP, count + (canAddAi ? 1 : 0)) : maxP;
    const emptySlots = Math.max(0, Math.min(maxP, emptyTarget) - count);
    const emptyRows = Array.from({ length: emptySlots }, (_, i) => {
      const need = (count + i + 1) <= minP;
      return `<div class="empty-slot">${need ? '○ Need 1 more' : '○ Open seat'}</div>`;
    }).join('');

    const aiControls = `
      <div class="ai-controls">
        <button class="btn-purple" data-act="add-ai" ${canAddAi ? '' : 'disabled'}>+ Add Bot</button>
        <div class="ai-difficulty">
          ${['easy', 'medium', 'hard'].map(d =>
      `<button class="diff-btn ${_aiDifficulty === d ? 'active' : ''}" data-diff="${d}">${d}</button>`).join('')}
        </div>
      </div>`;

    const backStep = (_mode === 'friend') ? STEP.SHARE : null;
    const backBtn = backStep
      ? `<button class="btn-ghost btn-back" data-act="back">← Back</button>`
      : `<button class="btn-ghost btn-back" data-act="cancel">← Leave</button>`;

    renderShell(`
      <div class="roster-scroll">
        ${playerRows}
        ${emptyRows}
      </div>
      ${aiControls}
      <div class="nav-row">
        ${backBtn}
        <button class="btn-cyan btn-next" data-act="to-launch" ${allReady ? '' : 'disabled'}>
          ${allReady ? 'Continue →' : `Need ${minP - count} more`}
        </button>
      </div>
    `, { progress: progressFor(STEP.ROSTER), stepTitle: `Players (${count} / ${maxP})` });

    _root.querySelectorAll('[data-diff]').forEach(b =>
      b.addEventListener('click', () => { _aiDifficulty = b.getAttribute('data-diff'); render(); }));
    const addAi = _root.querySelector('[data-act="add-ai"]');
    if (addAi) addAi.addEventListener('click', () => _mp.addBot(_aiDifficulty));
    _root.querySelectorAll('[data-remove-ai]').forEach(b =>
      b.addEventListener('click', () => _mp.removeBot(b.getAttribute('data-remove-ai'))));
    const next = _root.querySelector('[data-act="to-launch"]');
    if (next) next.addEventListener('click', () => { _step = STEP.LAUNCH; render(); });
    const back = _root.querySelector('[data-act="back"]');
    if (back) back.addEventListener('click', () => { _step = backStep; render(); });
    const cancel = _root.querySelector('[data-act="cancel"]');
    if (cancel) cancel.addEventListener('click', leaveAndReset);
  }

  // Step 3 (host): final confirmation. Summary of who's playing + Launch.
  // No share box, no roster controls — just confirm and go.
  function renderLaunchStep(session) {
    const players = session.players || [];
    const humans = players.filter(p => !p.is_ai);
    const bots = players.filter(p => p.is_ai);
    const minP = _opts.minPlayers || 2;
    const ready = players.length >= minP && players.every(isPlayerReady);

    const rows = [
      `<div class="summary-row"><span class="summary-label">Game</span>
        <span class="summary-val">${esc(_opts.gameName || _opts.gameId)}</span></div>`,
      `<div class="summary-row"><span class="summary-label">Humans</span>
        <span class="summary-val">${humans.length}</span></div>`,
      `<div class="summary-row"><span class="summary-label">Bots</span>
        <span class="summary-val">${bots.length}${bots.length ? ' · ' + esc(_aiDifficulty) : ''}</span></div>`,
      `<div class="summary-row"><span class="summary-label">Total</span>
        <span class="summary-val">${players.length} / ${session.max_players || _opts.maxPlayers || 4}</span></div>`,
    ].join('');

    renderShell(`
      <div class="summary">${rows}</div>
      <div class="info-msg">${ready
        ? 'All set. Launch when ready.'
        : `Need at least ${minP} players ready before launch.`}</div>
      <div class="nav-row">
        <button class="btn-ghost btn-back" data-act="back">← Back</button>
        <button class="btn-primary btn-next" data-act="launch" ${ready ? '' : 'disabled'}>
          ▶ Launch
        </button>
      </div>
    `, { progress: progressFor(STEP.LAUNCH), stepTitle: 'Ready to Launch' });

    _root.querySelector('[data-act="back"]').addEventListener('click', () => {
      _step = STEP.ROSTER; render();
    });
    const launchBtn = _root.querySelector('[data-act="launch"]');
    if (launchBtn) launchBtn.addEventListener('click', hostLaunch);
  }

  // Guest onboarding: welcome screen shown BEFORE joining. Name + avatar + Ready.
  function renderGuestWelcome(code) {
    renderNameStep({ guest: true, code });
  }

  // Shared horizontal card lobby: used for friend-mode host AND all guests.
  // isHost === true → show add-bot controls + Launch button.
  // isHost === false → show waiting footer.
  function renderLobbyCards(session, isHost) {
    const players = session.players || [];
    const minP = _opts.minPlayers || 2;
    const maxP = session.max_players || _opts.maxPlayers || 4;
    const count = players.length;
    const me = players.find(p => p.user_id === _myUserId);
    const meReady = isPlayerReady(me);
    const canLaunch = isHost && count >= minP && players.every(isPlayerReady);
    const canAddAi = isHost && count < maxP;

    const cards = players.map(p => {
      const cls = ['player-card'];
      if (p.is_host) cls.push('is-host');
      if (p.is_ai) cls.push('is-ai');
      if (p.user_id === _myUserId) cls.push('is-me');
      if (p.ready || p.is_ai || p.is_host) cls.push('is-ready');
      const tags = [];
      if (p.is_host) tags.push('<span class="player-tag tag-host">Host</span>');
      if (p.is_ai) tags.push('<span class="player-tag tag-ai">AI</span>');
      if (p.user_id === _myUserId) tags.push('<span class="player-tag tag-me">You</span>');
      const status = (p.ready || p.is_ai || p.is_host)
        ? '<span class="pc-status ready">✔ Ready</span>'
        : '<span class="pc-status waiting">○ Waiting</span>';
      return `<div class="${cls.join(' ')}">
        <div class="pc-avatar">${esc(avatarGlyph(p))}</div>
        <div class="pc-name">${esc(p.username || 'Player')}</div>
        <div class="pc-tags">${tags.join('')}</div>
        ${status}
      </div>`;
    }).join('');

    const empties = Array.from({ length: Math.max(0, maxP - count) }, () =>
      `<div class="player-card-empty">○ Open</div>`
    ).join('');

    const footer = isHost ? `
      <div class="ai-controls">
        <button class="btn-purple" data-act="add-ai" ${canAddAi ? '' : 'disabled'}>+ Add Bot</button>
        <div class="ai-difficulty">
          ${['easy', 'medium', 'hard'].map(d =>
      `<button class="diff-btn ${_aiDifficulty === d ? 'active' : ''}" data-diff="${d}">${d}</button>`
    ).join('')}
        </div>
      </div>
      <div class="lobby-footer">
        <div class="info-msg">${canLaunch
        ? 'All players ready. Launch when you are!'
        : `Waiting for players… (${count} / ${minP} minimum)`
      }</div>
        <div class="nav-row">
          <button class="btn-ghost btn-back" data-act="back-to-share">← Invite More</button>
          <button class="btn-primary btn-next" data-act="launch" ${canLaunch ? '' : 'disabled'}>▶ Launch</button>
        </div>
      </div>` : `
      <div class="lobby-footer">
        <div class="info-msg">${meReady ? 'Ready confirmed. Waiting for host to launch…' : 'Press Join to confirm your ready status.'}</div>
        <div class="nav-row">
          <button class="btn-cyan btn-next" data-act="guest-join" ${meReady ? 'disabled' : ''}>${meReady ? '✔ Joined' : 'Join'}</button>
          <button class="btn-ghost btn-back" data-act="cancel">← Leave</button>
        </div>
      </div>`;

    const hostName = (players.find(p => p.is_host) || {}).username || 'Host';
    const subtitle = isHost
      ? `▼ ${count} / ${maxP} players · Invite code: ${esc(session.session_code || '…')}`
      : `▼ Invited by ${esc(hostName)} · ${count} / ${maxP} players`;

    _root.innerHTML = `<div class="kg-mp kg-mp-vh"><div class="kg-mp-card">
      <h2>${esc(_opts.gameName || _opts.gameId)}</h2>
      <div class="game-name">${subtitle}</div>
      <div class="step-title">${isHost ? 'Game Lobby' : 'You\u2019re In!'}</div>
      <div class="step">
        <div class="player-cards">${cards}${empties}</div>
        ${footer}
      </div>
    </div></div>`;

    if (isHost) {
      _root.querySelectorAll('[data-diff]').forEach(b =>
        b.addEventListener('click', () => { _aiDifficulty = b.getAttribute('data-diff'); render(); }));
      const addAi = _root.querySelector('[data-act="add-ai"]');
      if (addAi) addAi.addEventListener('click', () => _mp.addBot(_aiDifficulty));
      const backToShare = _root.querySelector('[data-act="back-to-share"]');
      if (backToShare) backToShare.addEventListener('click', () => { _step = STEP.SHARE; render(); });
      const launchBtn = _root.querySelector('[data-act="launch"]');
      if (launchBtn) launchBtn.addEventListener('click', hostLaunch);
    } else {
      const joinBtn = _root.querySelector('[data-act="guest-join"]');
      if (joinBtn) {
        joinBtn.addEventListener('click', () => {
          if (_mp && _mp.session && _mp.userId) {
            const mine = _mp.session.players.find(p => p.user_id === _mp.userId);
            if (mine && !mine.ready) _mp.toggleReady();
          }
        });
      }
      const cancel = _root.querySelector('[data-act="cancel"]');
      if (cancel) cancel.addEventListener('click', leaveAndReset);
    }
  }

  // Guest view: nothing for them to configure. Show who's here, wait for host.
  function renderWait(session) {
    const players = session.players || [];
    const hostName = (players.find(p => p.is_host) || {}).username || 'Host';
    const code = session.session_code || '----';
    const link = session.session_code ? urlForCode(session.session_code) : '';
    const playerList = players.map(p => {
      const me = p.user_id === _myUserId ? ' (you)' : '';
      const tag = p.is_host ? ' · host' : (p.is_ai ? ' · bot' : '');
      return `<div class="player-row${p.user_id === _myUserId ? ' is-me' : ''}${p.is_host ? ' is-host' : ''}${p.is_ai ? ' is-ai' : ''}">
        <div class="player-avatar">${esc(avatarGlyph(p))}</div>
        <div class="player-name">${esc(p.username || 'Player')}${esc(tag)}${esc(me)}</div>
      </div>`;
    }).join('');

    renderShell(`
      <div class="invite-panel">
        <div class="invite-title">Invited Guest Panel</div>
        <div class="invite-meta">Host: ${esc(hostName)} · Session Code</div>
        <div class="share-code-big" data-copy="${esc(code)}">${esc(code)}</div>
        <div class="share-link-row">
          <div class="share-link" data-copy="${esc(link)}">${esc(link)}</div>
          <button class="btn-ghost copy-btn" data-copy="${esc(link)}">Copy Link</button>
        </div>
      </div>
      ${playerList}
      <div class="info-msg"><span class="spinner"></span>Waiting for ${esc(hostName)} to launch…</div>
      <div class="nav-row">
        <button class="btn-ghost btn-back" data-act="cancel">← Leave</button>
      </div>
    `, { stepTitle: 'You\u2019re In' });
    _root.querySelectorAll('[data-copy]').forEach(b =>
      b.addEventListener('click', () => copyToClipboard(b.getAttribute('data-copy'), b)));
    _root.querySelector('[data-act="cancel"]').addEventListener('click', leaveAndReset);
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

  function loadProfileDraft() {
    const p = getProfile();
    _profileNameDraft = (p.name || '').trim();
    _profileAvatarDraft = p.avatarEmoji || null;
  }

  function saveProfileDraft() {
    const name = String(_profileNameDraft || '').trim();
    if (!name || !_profileAvatarDraft) return;
    if (typeof KGPlayerProfile !== 'undefined' && KGPlayerProfile.setName) {
      KGPlayerProfile.setName(name);
    } else {
      localStorage.setItem('display_name', name);
      localStorage.setItem('username', name);
    }
    localStorage.setItem('kg_avatar', JSON.stringify({ id: _profileAvatarDraft, emoji: _profileAvatarDraft, name: _profileAvatarDraft }));
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
      _launchingNow = false;
      _state = STATE.LAUNCHING; render();
      const session = (data && data.session) || (_mp && _mp.session);
      const activeUserId = _myUserId || (_mp && _mp.userId) || null;
      const launchPayload = Object.assign({}, session, {
        my_user_id: activeUserId,
        is_host: session ? session.host_id === activeUserId : false,
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
    _state = STATE.LOBBY;
    if (!_step) _step = isPrivate ? STEP.SHARE : STEP.ROSTER;
    render();
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
    };
    if (mp.userId) join(); else mp.on('authenticated', join);
  }

  function hostLaunch() {
    if (!_mp || !_mp.session || _launchingNow) return;
    _launchingNow = true;

    const clearLaunchState = () => {
      _launchingNow = false;
      _mp && _mp.off('lobby_accepted', onAccepted);
      _mp && _mp.off('session_update', onSession);
      if (kickTimer) clearTimeout(kickTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      kickTimer = null;
      fallbackTimer = null;
    };

    const tryStart = () => {
      if (!_mp) return clearLaunchState();
      _mp.startGame();
      // If game_started never arrives, release lock and show state again.
      fallbackTimer = setTimeout(() => {
        if (_state !== STATE.LAUNCHING) {
          _launchingNow = false;
          render();
        }
      }, 2400);
      _mp.off('lobby_accepted', onAccepted);
      _mp.off('session_update', onSession);
      if (kickTimer) { clearTimeout(kickTimer); kickTimer = null; }
    };

    const onAccepted = () => tryStart();
    const onSession = () => {
      const accepted = !!(_mp && _mp.session && _mp.session.settings && _mp.session.settings.lobby_accepted);
      if (accepted) tryStart();
    };

    let kickTimer = null;
    let fallbackTimer = null;

    _mp.on('lobby_accepted', onAccepted);
    _mp.on('session_update', onSession);
    _mp.acceptLobby();

    // Fallback: if the explicit lobby_accepted event is delayed/lost, proceed
    // after the next tick; server still validates readiness and acceptance.
    kickTimer = setTimeout(() => {
      const accepted = !!(_mp && _mp.session && _mp.session.settings && _mp.session.settings.lobby_accepted);
      if (accepted) tryStart();
      else _mp && _mp.startGame();
    }, 320);
  }

  function leaveAndReset() {
    try { _mp && _mp.leave(); } catch { /* ignore */ }
    try { _mp && _mp.disconnect(); } catch { /* ignore */ }
    _mp = null; _myUserId = null; _mode = null; _step = null; _state = STATE.CHOOSE;
    _launchingNow = false;
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
      // Fresh mount must always start from a clean client/session so invite URLs
      // cannot inherit stale session_update events and jump/loop to old lobbies.
      try { _mp && _mp.leave(); } catch { /* ignore */ }
      try { _mp && _mp.disconnect(); } catch { /* ignore */ }
      _mp = null;
      _myUserId = null;
      _step = null;
      _pendingCode = null;

      injectBootstrap();
      injectCSS();
      loadProfileDraft();
      _state = STATE.CHOOSE; _mode = null; _error = null;
      _launchingNow = false;
      // Stale-launch-URL guard: if the URL carries an invite code matching a
      // session already cached in sessionStorage (i.e. this user launched and
      // then navigated back to the lobby), forward to the gameplay page so we
      // never re-mount as a guest of our own in-progress session.
      if (_opts.gamePath) {
        try {
          const urlCode = readUrlCode();
          const raw = root.sessionStorage && root.sessionStorage.getItem('kg_session');
          const cached = raw ? JSON.parse(raw) : null;
          const cachedCode = cached && cached.session_code ? String(cached.session_code).toUpperCase() : '';
          if (urlCode && cachedCode && urlCode === cachedCode &&
            (!cached.game_id || cached.game_id === _opts.gameId)) {
            const search = location.search || '';
            location.replace(_opts.gamePath + search);
            return KGMultiplayerPanel;
          }
        } catch (_) { /* ignore */ }
      }
      const explicitCode = (_opts && _opts.inviteCode) ? String(_opts.inviteCode).trim().toUpperCase() : null;
      const code = explicitCode || (_opts.autoCode ? readUrlCode() : null);
      const autoMode = _opts.autoMode || readUrlMode();
      if (code) {
        _mode = 'guest';
        _pendingCode = code;
        renderGuestWelcome(code);
      } else if (autoMode === 'solo' || autoMode === 'friend') {
        _mode = autoMode;
        clearUrlMode();
        saveProfileDraft();
        connectAndCreate(autoMode === 'friend');
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
