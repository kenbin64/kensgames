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
  const STATE = { CHOOSE: 'choose', BROWSE: 'browse', LOBBY: 'lobby', LAUNCHING: 'launching', ERROR: 'error' };
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
  let _localEditPlayerId = null;
  let _soloBotsWanted = null;
  let _lastStageKey = '';
  let _modePage = 0;
  let _browseSessions = [];
  let _browseTimer = null;
  let _browseRequested = false;

  // ── CSS (injected once) ─────────────────────────────────────────────
  // Canonical KensGames Tron palette: cyan (primary), green (go), purple (AI/accent).
  const CSS = `
/* HR-6.2: when the wizard rail is mounted, carve the rail's reserved
   height out of the body via border-box padding-bottom so the fixed-bottom
   rail never overlaps the panel. Container + button visuals live in
   /lib/control-rail.css (auto-injected by injectRailMount). */
body.kg-mp-rail-on{padding-bottom:var(--kg-rail-h,48px) !important;box-sizing:border-box;}
.kg-mp{font-family:'Orbitron',monospace;color:#e8e8ff;max-width:min(980px,98vw);width:100%;margin:0 auto;height:100%;max-height:100%;overflow:hidden;}
.kg-mp.kg-mp-vh{height:100%;max-height:100%;margin:0 auto;overflow:hidden;}
/* Flex column so any number of header rows (h2, subtitle, optional progress
   dots, optional step-title) sit at intrinsic height and the .step row
   absorbs the remaining space — without clipping its tail when extra
   header rows are present. .step scrolls internally if it overflows. */
.kg-mp-card{background:rgba(4,4,20,0.94);border:2px solid #00FFFF;
  box-shadow:0 0 18px rgba(0,255,255,0.35),0 0 36px rgba(153,0,255,0.20);
  border-radius:10px;padding:18px 20px 14px;height:100%;display:flex;
  flex-direction:column;min-height:0;overflow:hidden;}
.kg-mp-card > .step{flex:1 1 auto;min-height:0;overflow:auto;}
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
.kg-mp .step{animation:kgFade 240ms ease;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
@keyframes kgFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
/* Single-row mode chooser (HR-6.1): all play-mode cards stay on one line at
   desktop/tablet so nothing gets pushed below the fold. Cards shrink to fit. */
.kg-mp .mode-grid{display:flex;flex-wrap:nowrap;gap:8px;align-items:stretch;}
.kg-mp .mode-grid > .mode-btn{flex:1 1 0;min-width:0;}
.kg-mp .mode-btn{background:rgba(0,0,0,0.4);border:1.5px solid rgba(0,255,255,0.4);
  color:#fff;padding:12px 10px;border-radius:8px;text-align:center;cursor:pointer;
  transition:all 200ms ease;font-family:inherit;}
.kg-mp .mode-btn:hover{border-color:#00FFFF;background:rgba(0,255,255,0.08);
  box-shadow:0 0 18px rgba(0,255,255,0.35);transform:translateY(-3px);}
.kg-mp .mode-btn[disabled]{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
.kg-mp .mode-btn[data-act="friend"]{border-color:rgba(153,0,255,0.45);}
.kg-mp .mode-btn[data-act="friend"]:hover{border-color:#9900FF;background:rgba(153,0,255,0.10);
  box-shadow:0 0 18px rgba(153,0,255,0.45);}
.kg-mp .mode-btn[data-act="friend"] .mode-label{color:#c4a3ff;}
.kg-mp .mode-btn .mode-icon{font-size:42px;display:block;margin-bottom:12px;
  filter:drop-shadow(0 0 6px currentColor);font-size:22px;margin-bottom:5px;}
.kg-mp .mode-btn .mode-label{font-size:11px;letter-spacing:1.5px;color:#00FFFF;font-weight:700;}
.kg-mp .mode-btn .mode-sub{font-size:9px;color:#9aa;margin-top:4px;letter-spacing:0.5px;line-height:1.4;}
.kg-mp .share-box{background:rgba(0,0,0,0.55);border:1.5px dashed rgba(153,0,255,0.55);
  padding:14px 14px;border-radius:8px;margin-bottom:10px;text-align:center;
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
.kg-mp .browse-list{display:flex;flex-direction:column;gap:8px;
  flex:1;min-height:0;overflow:auto;padding-right:4px;}
.kg-mp .browse-row{display:grid;grid-template-columns:1fr auto auto auto;
  align-items:center;gap:12px;padding:12px 14px;background:rgba(0,0,0,0.45);
  border:1px solid rgba(0,255,255,0.30);border-radius:6px;color:#fff;
  font-family:inherit;text-align:left;cursor:pointer;transition:all 180ms ease;}
.kg-mp .browse-row:hover:not([disabled]){border-color:#00FFFF;
  background:rgba(0,255,255,0.08);box-shadow:0 0 14px rgba(0,255,255,0.30);
  transform:translateY(-1px);}
.kg-mp .browse-row.is-disabled,.kg-mp .browse-row[disabled]{
  opacity:.55;cursor:not-allowed;border-color:rgba(255,255,255,0.18);}
.kg-mp .browse-row-name{font-size:13px;font-weight:700;color:#00FFFF;letter-spacing:1px;}
.kg-mp .browse-row-host{font-size:11px;color:#c4a3ff;}
.kg-mp .browse-row-count{font-size:11px;color:#00FF41;letter-spacing:1px;
  font-family:'Orbitron',monospace;}
.kg-mp .browse-row-wait{font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;}
.kg-mp .player-row{display:flex;align-items:center;gap:12px;padding:12px 14px;
  background:rgba(0,0,0,0.45);border:1px solid rgba(0,255,255,0.20);border-radius:6px;
  margin-bottom:8px;}
.kg-mp .roster-scroll{flex:1;min-height:0;overflow:hidden;padding-right:0;margin-bottom:6px;}
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
.kg-mp .avatar-quick{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-bottom:8px;
  overflow:hidden;max-height:min(22dvh,22vh);padding-right:0;}
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
  gap:8px;align-items:stretch;margin-bottom:8px;flex:1;min-height:0;overflow:hidden;padding-right:0;}
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
/* HR-6.2: action rows live in the fixed control rail (#kg-rail), not in the
   panel. Any .nav-row/.actions/.lobby-footer that slips through is hidden. */
.kg-mp .nav-row,.kg-mp .actions,.kg-mp .lobby-footer,.kg-mp .footer{display:none !important;}
.kg-mp .summary-row{display:flex;justify-content:space-between;align-items:center;
  padding:6px 0;font-size:12px;}
.kg-mp .summary-row + .summary-row{border-top:1px solid rgba(0,255,255,0.1);}
.kg-mp .summary-label{color:#9aa;letter-spacing:1.5px;text-transform:uppercase;font-size:10px;}
.kg-mp .summary-val{color:#00FFFF;text-shadow:0 0 6px rgba(0,255,255,0.4);font-weight:700;}
/* Status-text color variants for the rail (control-rail.css ships the
   neutral .kg-rail-status look; these add wizard-state coloring). */
#kg-rail .kg-rail-status.ready{color:#00FF41;text-shadow:0 0 6px rgba(0,255,65,0.5);}
#kg-rail .kg-rail-status.error{color:#ff4060;}
.kg-mp .err-msg{color:#ff4060;font-size:11px;margin-top:10px;letter-spacing:1px;
  padding:10px;background:rgba(255,64,96,0.08);border:1px solid rgba(255,64,96,0.3);border-radius:4px;}
.kg-mp .info-msg{color:#9aa;font-size:12px;margin-top:8px;letter-spacing:1px;text-align:center;line-height:1.6;}
.kg-mp .policy-box{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(0,255,255,0.28);border-radius:8px;
  background:linear-gradient(180deg,rgba(0,255,255,0.05),rgba(0,0,0,0.18));}
.kg-mp .policy-title{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00ffff;margin-bottom:6px;}
/* policy-title kept for back-compat; primary heading now uses <summary> */
.kg-mp .policy-line{font-size:11px;color:#b7d7df;line-height:1.5;}
.kg-mp .policy-box summary{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00ffff;
  cursor:pointer;list-style:none;padding:0;}
.kg-mp .policy-box summary::before{content:'▶ ';font-size:8px;}
.kg-mp .policy-box[open] summary::before{content:'▼ ';}
.kg-mp .footer{order:-1;display:flex;justify-content:space-between;align-items:center;
  margin:0 0 14px;padding:0 0 10px;border-bottom:1px solid rgba(0,255,255,0.15);}
.kg-mp .link-btn{background:none;border:none;color:#9aa;font-size:11px;
  cursor:pointer;letter-spacing:1px;padding:4px 8px;font-family:inherit;text-transform:uppercase;}
.kg-mp .link-btn:hover{color:#00FFFF;}
.kg-mp .spinner{display:inline-block;width:14px;height:14px;border:2px solid #00FFFF;
  border-top-color:transparent;border-radius:50%;animation:kgspin 0.7s linear infinite;
  vertical-align:middle;margin-right:8px;}
@keyframes kgspin{to{transform:rotate(360deg);}}
@media (max-width:560px){
  .kg-mp{height:100%;max-height:100%;}
  .kg-mp.kg-mp-vh{margin:0 auto;height:100%;max-height:100%;}
  .kg-mp-card{padding:10px 10px 8px;border-radius:8px;}
  /* Phone: drop the single-row constraint and let mode cards wrap into a
     compact 2-column grid (or 1-column if the panel is very narrow). */
  .kg-mp .mode-grid{display:grid;flex-wrap:initial;
    grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}
  .kg-mp .mode-grid > .mode-btn{flex:initial;}
  .kg-mp .player-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
  .kg-mp h2{font-size:14px;}
  .kg-mp .game-name{font-size:10px;margin-bottom:8px;}
  .kg-mp .step-title{font-size:11px;margin:2px 0 8px;}
  .kg-mp button{font-size:13px;padding:10px 12px;}
  .kg-mp .share-code-big{font-size:24px;letter-spacing:5px;}
  .kg-mp .share-code-label{font-size:11px;}
  .kg-mp .share-link{font-size:12px;}
  .kg-mp .share-link-row{flex-direction:column;align-items:stretch;gap:8px;}
  .kg-mp .copy-btn{font-size:12px;padding:9px 14px;}
  .kg-mp .joined-count{font-size:12px;}
  .kg-mp .mode-btn{padding:16px 8px;}
  .kg-mp .mode-btn .mode-icon{font-size:26px;margin-bottom:8px;}
  .kg-mp .mode-btn .mode-label{font-size:12px;}
  .kg-mp .mode-btn .mode-sub{font-size:11px;}
  .kg-mp .player-name{font-size:12px;}
  .kg-mp .player-tag{font-size:10px;}
  .kg-mp .player-status{font-size:11px;}
  .kg-mp .empty-slot{font-size:12px;}
  .kg-mp .diff-btn{font-size:12px;padding:7px 13px;}
  .kg-mp .summary-row{font-size:12px;padding:4px 0;}
  .kg-mp .summary-label{font-size:11px;}
  .kg-mp .nav-row .btn-next{font-size:13px;padding:12px;}
  .kg-mp .nav-row{flex-wrap:wrap;}
  .kg-mp .nav-row .btn-back,.kg-mp .nav-row .btn-next{width:100%;}
  .kg-mp .actions .btn-launch{font-size:13px;padding:10px;}
  .kg-mp .err-msg{font-size:12px;}
  .kg-mp .info-msg{font-size:13px;}
  .kg-mp .link-btn{font-size:12px;}
  .kg-mp .avatar-quick{max-height:min(18dvh,18vh);}
}

@media (min-width:561px) and (max-width:920px){
  .kg-mp .player-cards{grid-template-columns:repeat(2,minmax(0,1fr));}
}

  @media (max-height:740px){
    .kg-mp{height:100%;max-height:100%;}
    .kg-mp.kg-mp-vh{margin:0 auto;height:100%;max-height:100%;}
    .kg-mp-card{padding:10px 10px 8px;}
    .kg-mp h2{font-size:13px;margin-bottom:2px;}
    .kg-mp .game-name{font-size:9px;margin-bottom:6px;}
    .kg-mp .step-title{font-size:10px;margin:2px 0 6px;}
    .kg-mp .player-row{padding:8px 10px;margin-bottom:6px;}
    .kg-mp .player-avatar{font-size:21px;width:26px;}
    .kg-mp .player-name{font-size:11px;}
    .kg-mp .summary{padding:10px;margin-bottom:8px;}
    .kg-mp .summary-row{padding:3px 0;}
    .kg-mp .actions{margin-top:10px;}
    .kg-mp .actions .btn-launch{padding:9px;font-size:12px;}
    .kg-mp .nav-row{padding-top:8px;}
    .kg-mp .nav-row .btn-next{padding:10px;font-size:12px;}
    .kg-mp .avatar-quick{max-height:min(15dvh,15vh);}
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

  // HR-6.2: ensure the fixed control rail mount + stylesheet exist so wizard
  // navigation can be emitted outside the panel (and outside any game canvas).
  function injectRailMount() {
    if (!document.getElementById('kg-control-rail-css')) {
      const l = document.createElement('link');
      l.id = 'kg-control-rail-css';
      l.rel = 'stylesheet';
      l.href = '/lib/control-rail.css';
      document.head.appendChild(l);
    }
    let rail = document.getElementById('kg-rail');
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'kg-rail';
      rail.setAttribute('role', 'toolbar');
      rail.setAttribute('aria-label', 'Wizard controls');
      document.body.appendChild(rail);
    }
    document.body.classList.add('kg-mp-rail-on');
    return rail;
  }

  // Render a single row of wizard controls into the fixed rail. `html` is the
  // inner HTML for the .kg-rail-row container; `handlers` maps data-act keys
  // → click handlers. Calling with html=null clears the rail.
  function setRail(html, handlers) {
    const rail = injectRailMount();
    if (html == null) {
      rail.innerHTML = '';
      return rail;
    }
    rail.innerHTML = html;
    if (handlers) {
      Object.keys(handlers).forEach(key => {
        rail.querySelectorAll('[data-act="' + key + '"]').forEach(el => {
          el.addEventListener('click', (e) => handlers[key](e, el));
        });
      });
    }
    return rail;
  }

  function clearRail() {
    const rail = document.getElementById('kg-rail');
    if (rail) rail.innerHTML = '';
    document.body.classList.remove('kg-mp-rail-on');
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const AVATAR_GLYPH_BY_ID = {
    person_smile: '😊',
    person_cool: '😎',
    person_star: '🤩',
    person_devil: '😈',
    person_ninja: '🥷',
    scifi_robot: '🤖',
    robot: '🤖',
    invader: '👾',
    animal_fox: '🦊',
    animal_tiger: '🐯',
    hero: '🦸',
    crown: '👑',
    space_rocket: '🚀',
    alien: '👽',
    person_generic: '👤',
  };

  function isReservedBotAvatar(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    return raw === '🤖' || raw === 'robot' || raw === 'scifi_robot' || raw === 'custom_🤖' || raw === 'faces_🤖';
  }

  function isLikelyEmoji(text) {
    if (!text) return false;
    // Basic emoji-range check; avoids rendering leaked raw words like "cool".
    return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(text));
  }

  const LOCAL_HUMAN_AVATARS = ['🎮', '🧩', '🚀', '🦊', '🐯', '🦸', '👑', '🎲', '⚡', '🌟'];

  function nextLocalHumanAvatar(players) {
    const used = new Set((players || []).map(p => String((p && p.avatar_id) || '')));
    for (const av of LOCAL_HUMAN_AVATARS) {
      if (!used.has(av)) return av;
    }
    return '🎮';
  }

  function sanitizeLocalPlayerName(raw, fallback) {
    const cleaned = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    if (cleaned.length >= 1) return cleaned;
    return String(fallback || 'Player').slice(0, 18);
  }

  function normalizeLocalHumanAvatar(value, players, playerId) {
    const raw = String(value || '').trim();
    if (!raw || isReservedBotAvatar(raw)) {
      const others = (players || []).filter(p => p && p.user_id !== playerId);
      return nextLocalHumanAvatar(others);
    }
    return raw;
  }

  function editLocalHuman(playerId) {
    if (_mode !== 'same-screen' || !_mp || !_mp.session) return;
    _localEditPlayerId = playerId;
    render();
  }

  function avatarGlyph(p) {
    if (p.is_ai) return '🤖';
    if (!p.avatar_id) return '👤';
    const raw = String(p.avatar_id || '').trim();
    if (!raw) return '👤';
    if (isReservedBotAvatar(raw)) return '👤';
    if (isLikelyEmoji(raw)) return raw;
    if (AVATAR_GLYPH_BY_ID[raw]) return AVATAR_GLYPH_BY_ID[raw];
    // Back-compat: some old payloads encode as "category_emoji".
    const i = raw.indexOf('_');
    if (i >= 0) {
      const tail = raw.slice(i + 1);
      if (isLikelyEmoji(tail)) return tail;
      if (AVATAR_GLYPH_BY_ID[tail]) return AVATAR_GLYPH_BY_ID[tail];
    }
    return '👤';
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

  function rosterSignature(players) {
    return (players || [])
      .map(p => {
        const id = String((p && p.user_id) || '');
        const slot = Number.isFinite(p && p.slot) ? p.slot : 999;
        const host = p && p.is_host ? 'H' : 'P';
        const ai = p && p.is_ai ? 'A' : 'U';
        return `${slot}:${id}:${host}:${ai}`;
      })
      .sort()
      .join('|');
  }

  function cloneLaunchSession(session, activeUserId) {
    const src = session || {};
    const players = Array.isArray(src.players)
      ? src.players.map(p => ({
        user_id: p && p.user_id,
        username: p && p.username,
        avatar_id: p && p.avatar_id,
        is_host: !!(p && p.is_host),
        is_ai: !!(p && p.is_ai),
        slot: Number.isFinite(p && p.slot) ? p.slot : null,
        ready: !!(p && p.ready),
      }))
      : [];
    return {
      session_id: src.session_id || null,
      session_code: src.session_code || null,
      game_id: src.game_id || null,
      game_uuid: src.game_uuid || null,
      host_id: src.host_id || null,
      my_user_id: activeUserId || null,
      is_host: !!(src.host_id && activeUserId && src.host_id === activeUserId),
      settings: src.settings && typeof src.settings === 'object' ? Object.assign({}, src.settings) : {},
      players,
      roster_signature: rosterSignature(players),
      client: _mp,
    };
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
    emitStageChange();
    if (_state === STATE.ERROR) return renderError();
    if (_state === STATE.LAUNCHING) return renderLaunching();
    if (_state === STATE.CHOOSE) return renderChoose();
    if (_state === STATE.BROWSE) return renderBrowse();
    if (_state === STATE.LOBBY) return renderLobby();
  }

  function currentStageInfo() {
    const stage = (_state === STATE.LOBBY)
      ? (String(_step || 'lobby'))
      : String(_state || 'unknown');
    return {
      state: _state,
      stage,
      mode: _mode || null,
      gameId: _opts && _opts.gameId ? _opts.gameId : null,
      timestamp: Date.now(),
    };
  }

  function emitStageChange() {
    if (!_opts || typeof _opts.onStageChange !== 'function') return;
    const info = currentStageInfo();
    const key = [info.state, info.stage, info.mode || '', info.gameId || ''].join('|');
    if (key === _lastStageKey) return;
    _lastStageKey = key;
    try { _opts.onStageChange(info); } catch (_) { }
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

  function modeTokenToAct(token) {
    const t = String(token || '').toLowerCase();
    if (t === 'host-invite') return 'friend';
    if (t === 'private-invite') return 'private';
    return t;
  }

  function resolveModeSets() {
    const allowedRaw = (_opts && Array.isArray(_opts.allowedModes)) ? _opts.allowedModes : null;
    const authRaw = (_opts && Array.isArray(_opts.authRequiredModes)) ? _opts.authRequiredModes : null;
    const allowed = allowedRaw ? new Set(allowedRaw.map(modeTokenToAct)) : null;
    const auth = authRaw ? new Set(authRaw.map(modeTokenToAct)) : new Set();
    return { allowed, auth };
  }

  function isAllowedMode(act, allowedSet) {
    if (!allowedSet) return true;
    return allowedSet.has(String(act || ''));
  }

  function renderModeChoice() {
    const modeSets = resolveModeSets();
    const allowed = modeSets.allowed;
    const auth = modeSets.auth;

    const sameScreenEnabled = !!(_opts && _opts.supportsSameScreen) && isAllowedMode('same-screen', allowed);
    const sameScreenButton = (_opts && _opts.supportsSameScreen) ? `
        <button class="mode-btn" data-act="same-screen">
          <span class="mode-icon">🎮</span>
          <span class="mode-label">Multiplayer Same Screen</span>
          <div class="mode-sub">Local co-op on one device</div>
        </button>
      ` : '';

    const matchmakerEnabled = !(_opts && _opts.supportsMatchmaker === false) && isAllowedMode('matchmaker', allowed);
    const browseEnabled = !(_opts && _opts.supportsOpenGames === false) && isAllowedMode('browse', allowed);

    const mustSignIn = (act) => auth.has(String(act || ''));
    const signInTag = (act) => mustSignIn(act) ? 'Sign-in required' : '';
    const policy = (_opts && _opts.modePolicy && typeof _opts.modePolicy === 'object') ? _opts.modePolicy : null;
    const policyModes = policy && Array.isArray(policy.modes) ? policy.modes : [];
    const enabledModeNames = policyModes
      .filter(function (m) { return m && m.panelMode && isAllowedMode(m.panelMode, allowed); })
      .map(function (m) { return m.label || m.id; });
    const signupMethods = (_opts && _opts.signupMethods && typeof _opts.signupMethods === 'object') ? _opts.signupMethods : null;
    const policyBox = (policy || signupMethods) ? `
      <details class="policy-box">
        <summary>Mode Policy</summary>
        <div class="policy-line">Enabled: ${esc(enabledModeNames.length ? enabledModeNames.join(' · ') : 'Solo')}</div>
        ${signupMethods ? `<div class="policy-line">Create: ${esc((signupMethods.createMethods || []).join(', ') || 'quick-create')}</div>` : ''}
        ${signupMethods ? `<div class="policy-line">Join: ${esc((signupMethods.joinMethods || []).join(', ') || 'url-code')}</div>` : ''}
      </details>
    ` : '';

    const modeCards = [];
    if (isAllowedMode('solo', allowed)) modeCards.push(`
      <button class="mode-btn" data-act="solo">
        <span class="mode-icon">🤖</span>
        <span class="mode-label">Solo</span>
        <div class="mode-sub">Single-player run</div>
      </button>
    `);
    if (isAllowedMode('solo-bots', allowed)) modeCards.push(`
      <button class="mode-btn" data-act="solo-bots">
        <span class="mode-icon">🧠</span>
        <span class="mode-label">Solo + Bots</span>
        <div class="mode-sub">Train against AI roster</div>
      </button>
    `);
    if (isAllowedMode('friend', allowed)) modeCards.push(`
      <button class="mode-btn" data-act="friend">
        <span class="mode-icon">🔗</span>
        <span class="mode-label">Host + Invite URL/Code</span>
        <div class="mode-sub">Share link or code to join</div>
      </button>
    `);
    if (isAllowedMode('private', allowed)) modeCards.push(`
      <button class="mode-btn" data-act="private">
        <span class="mode-icon">🛡️</span>
        <span class="mode-label">Create Signed-In Game</span>
        <div class="mode-sub">Private lobby for invited friends${signInTag('private') ? ' · ' + signInTag('private') : ''}</div>
      </button>
    `);
    modeCards.push(`
      <button class="mode-btn" data-act="matchmaker" ${matchmakerEnabled ? '' : 'disabled'}>
        <span class="mode-icon">🏁</span>
        <span class="mode-label">Skill Matchmaker</span>
        <div class="mode-sub">${matchmakerEnabled ? ('Queue by skill bracket' + (signInTag('matchmaker') ? ' · ' + signInTag('matchmaker') : '')) : 'Not enabled for this game'}</div>
      </button>
    `);
    modeCards.push(`
      <button class="mode-btn" data-act="browse" ${browseEnabled ? '' : 'disabled'}>
        <span class="mode-icon">📡</span>
        <span class="mode-label">Join Available Games</span>
        <div class="mode-sub">${browseEnabled ? ('Browse active sessions' + (signInTag('browse') ? ' · ' + signInTag('browse') : '')) : 'Use invite code/link for now'}</div>
      </button>
    `);
    if (sameScreenEnabled) modeCards.push(sameScreenButton);

    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(modeCards.length / pageSize));
    if (_modePage >= totalPages) _modePage = 0;
    if (_modePage < 0) _modePage = 0;
    const start = _modePage * pageSize;
    const visibleModeCards = modeCards.slice(start, start + pageSize).join('');

    renderShell(`
      ${policyBox}
      <div class="mode-grid">
        ${visibleModeCards}
      </div>
    `, { stepTitle: 'Choose how to play' });

    if (totalPages > 1) {
      setRail(`
        <button class="btn-ghost" data-act="mode-prev" ${_modePage === 0 ? 'disabled' : ''}>← Previous</button>
        <span class="kg-rail-status">Mode page ${_modePage + 1} of ${totalPages}</span>
        <button class="btn-ghost" data-act="mode-next" ${_modePage >= totalPages - 1 ? 'disabled' : ''}>More →</button>
      `, {
        'mode-prev': () => { _modePage = Math.max(0, _modePage - 1); renderModeChoice(); },
        'mode-next': () => { _modePage = Math.min(totalPages - 1, _modePage + 1); renderModeChoice(); },
      });
    } else {
      setRail(`<span class="kg-rail-status">▼ Pick a mode above to begin</span>`);
    }

    _root.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      const act = b.getAttribute('data-act');
      if (!isAllowedMode(act, allowed)) return;
      if (mustSignIn(act) && _opts && typeof _opts.onSignInRequired === 'function') {
        const proceed = _opts.onSignInRequired({ mode: act, gameId: _opts.gameId });
        if (proceed === false) return;
      }
      _soloBotsWanted = null;
      if (act === 'solo-bots') {
        _mode = 'solo';
        _soloBotsWanted = 2;
      } else if (act === 'private') {
        _mode = 'friend';
      } else if (act === 'matchmaker') {
        // Current backend path: friend queue endpoint is used as provisional matchmaker transport.
        _mode = 'friend';
      } else if (act === 'browse') {
        // In-panel public lobby browser. Connect, list, click-to-join.
        _mode = 'browse';
        if (!_profileNameDraft) { renderNameStep({ guest: false }); return; }
        if (!_profileAvatarDraft) { renderAvatarStep({ guest: false }); return; }
        saveProfileDraft();
        startBrowse();
        return;
      } else {
        _mode = act;
      }

      _step = (_mode === 'friend') ? STEP.SHARE : STEP.ROSTER;
      // Collect name/avatar now if not yet set — deferred until user actually plays
      if (!_profileNameDraft) {
        renderNameStep({ guest: false });
      } else if (!_profileAvatarDraft) {
        renderAvatarStep({ guest: false });
      } else {
        saveProfileDraft();
        // Same-screen mode: build roster locally without server
        if (act === 'same-screen') {
          buildLocalLobby();
        } else {
          connectAndCreate(act === 'friend');
        }
      }
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
      <div class="info-msg">${isGuest ? `Invite code: ${esc(code || '...')}` : 'Step 1 of 3'}</div>
    `, { stepTitle: isGuest ? 'Invited Player Wizard · Name' : 'Setup · Player Name' });

    const goNext = () => renderAvatarStep(opts);
    setRail(`
      ${isGuest
        ? '<button class="btn-ghost" data-act="cancel">← Cancel</button>'
        : '<button class="btn-ghost" data-act="back">← Back</button>'}
      <span class="kg-rail-status">${isGuest ? `Invite ${esc(code || '...')}` : 'Step 1 of 3'}</span>
      <button class="btn-cyan btn-grow" data-act="next" disabled>Next →</button>
    `, {
      back: () => renderModeChoice(),
      cancel: leaveAndReset,
      next: goNext,
    });

    const nameEl = _root.querySelector('#kg-name-step');
    const railNext = document.querySelector('#kg-rail [data-act="next"]');
    const sync = () => {
      _profileNameDraft = nameEl.value.trim();
      if (railNext) railNext.disabled = _profileNameDraft.length < 1;
    };
    nameEl.addEventListener('input', sync);
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && _profileNameDraft.length >= 1) goNext();
    });
    sync();
  }

  function renderAvatarStep(opts) {
    const isGuest = !!(opts && opts.guest);
    // People with diverse skin tones first, then popular non-human picks
    const QUICK_AVS = ['🧑🏻', '🧑🏼', '🧑🏽', '🧑🏾', '🧑🏿', '👩🏾', '👨🏼', '👩🏿', '👨🏾', '😊', '😎', '🤩', '😈', '🥷', '👾', '🦊', '🐯', '🦸', '👑'];
    const buttons = QUICK_AVS.map(e =>
      `<button class="av-btn${_profileAvatarDraft === e ? ' selected' : ''}" data-av="${e}">${e}</button>`).join('');
    renderShell(`
      <div class="guest-welcome">
        <div class="welcome-emoji" id="kg-av-preview">${_profileAvatarDraft || '👤'}</div>
        <div class="welcome-sub">Choose your avatar.</div>
      </div>
      <div class="avatar-quick">${buttons}</div>
      <div class="av-more" id="kg-av-more">+ More avatars</div>
      <div class="info-msg">Step 2 of 3</div>
    `, { stepTitle: isGuest ? 'Invited Player Wizard · Avatar' : 'Setup · Avatar' });

    const advance = () => {
      saveProfileDraft();
      if (isGuest) {
        clearUrlCode();
        connectAndJoin(_pendingCode);
      } else if (_mode === 'same-screen') {
        buildLocalLobby();
      } else if (_mode === 'browse') {
        startBrowse();
      } else if (_mode) {
        connectAndCreate(_mode === 'friend');
      } else {
        renderModeChoice();
      }
    };
    setRail(`
      <button class="btn-ghost" data-act="back">← Back</button>
      <span class="kg-rail-status">Step 2 of 3</span>
      <button class="btn-cyan btn-grow" data-act="next" ${_profileAvatarDraft ? '' : 'disabled'}>Next →</button>
    `, {
      back: () => renderNameStep(opts),
      next: advance,
    });

    const preview = _root.querySelector('#kg-av-preview');
    const railNext = document.querySelector('#kg-rail [data-act="next"]');
    _root.querySelectorAll('.av-btn').forEach(b => {
      b.addEventListener('click', () => {
        _root.querySelectorAll('.av-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        _profileAvatarDraft = b.getAttribute('data-av');
        if (preview) preview.textContent = _profileAvatarDraft;
        if (railNext) railNext.disabled = !_profileAvatarDraft;
      });
    });
    _root.querySelector('#kg-av-more').addEventListener('click', () => {
      if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
        AvatarPicker.show(av => {
          _profileAvatarDraft = av.emoji;
          if (preview) preview.textContent = _profileAvatarDraft;
          _root.querySelectorAll('.av-btn').forEach(x =>
            x.classList.toggle('selected', x.getAttribute('data-av') === _profileAvatarDraft));
          if (railNext) railNext.disabled = !_profileAvatarDraft;
        });
      }
    });
  }

  function renderChoose() {
    // Always show mode cards first — name/avatar wizard runs only when the
    // user actively picks a mode, so the landing screen has no form gates.
    return renderModeChoice();
  }

  // ── Browse: in-panel public lobby browser ──────────────────────────
  function startBrowse() {
    _state = STATE.BROWSE;
    _browseSessions = [];
    _browseRequested = false;
    render();
    const mp = ensureClient(); if (!mp) return;
    const requestList = () => { try { mp.listGames(_opts.gameId); } catch { /* ignore */ } };
    const onList = (sessions) => {
      _browseSessions = Array.isArray(sessions) ? sessions : [];
      _browseRequested = true;
      if (_state === STATE.BROWSE) render();
    };
    mp.on('session_list', onList);
    if (mp.userId) requestList(); else mp.on('authenticated', requestList);
    if (_browseTimer) clearInterval(_browseTimer);
    _browseTimer = setInterval(() => {
      if (_state !== STATE.BROWSE) { clearInterval(_browseTimer); _browseTimer = null; return; }
      requestList();
    }, 4000);
  }

  function stopBrowse() {
    if (_browseTimer) { clearInterval(_browseTimer); _browseTimer = null; }
  }

  function formatWaitTime(createdAt) {
    if (!createdAt) return '';
    const secs = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
    if (secs < 60) return secs + 's';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h';
  }

  function renderBrowse() {
    const game = (_opts && _opts.gameName) || (_opts && _opts.gameId) || 'this game';
    let body = '';
    if (!_browseRequested) {
      body = `<div class="info-msg"><span class="spinner"></span>Looking for open games…</div>`;
    } else if (!_browseSessions.length) {
      body = `
        <div class="info-msg">No public games waiting for ${esc(game)}.</div>
        <div class="info-msg" style="opacity:.7;font-size:.9em;">
          Refreshes every few seconds. Or host your own from the previous screen.
        </div>`;
    } else {
      const rows = _browseSessions.map(s => {
        const filled = Number(s.player_count || (s.players ? s.players.length : 0)) || 0;
        const cap = Number(s.max_players) || 0;
        const host = s.host_username || (s.players && s.players[0] && s.players[0].username) || 'host';
        const name = s.game_name || s.game_id || game;
        const wait = formatWaitTime(s.created_at);
        const status = s.status || 'waiting';
        const full = cap > 0 && filled >= cap;
        const disabled = full || status !== 'waiting';
        return `
          <button class="browse-row${disabled ? ' is-disabled' : ''}"
                  data-act="join" data-code="${esc(s.session_code || '')}" ${disabled ? 'disabled' : ''}>
            <span class="browse-row-name">${esc(name)}</span>
            <span class="browse-row-host">host: ${esc(host)}</span>
            <span class="browse-row-count">${filled}/${cap || '?'}${full ? ' · full' : ''}</span>
            <span class="browse-row-wait">${wait ? 'waiting ' + esc(wait) : ''}</span>
          </button>`;
      }).join('');
      body = `<div class="browse-list">${rows}</div>`;
    }
    renderShell(body, { stepTitle: `Browse · ${esc(game)}` });
    setRail(`
      <button class="btn-ghost" data-act="back">← Back</button>
      <span class="kg-rail-status">${_browseSessions.length} open game${_browseSessions.length === 1 ? '' : 's'}</span>
      <button class="btn-cyan" data-act="refresh">↻ Refresh</button>
    `, {
      back: () => { stopBrowse(); leaveAndReset(); },
      refresh: () => { try { _mp && _mp.listGames(_opts.gameId); } catch { /* ignore */ } },
    });
    _root.querySelectorAll('.browse-row[data-act="join"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        if (!code) return;
        stopBrowse();
        _mode = 'guest';
        _pendingCode = code;
        connectAndJoin(code);
      });
    });
  }

  function renderError() {
    renderShell(`
      <div class="err-msg">${esc(_error || 'Connection error')}</div>
    `, { stepTitle: 'Connection Error' });
    setRail(`
      <button class="btn-ghost" data-act="back">← Back</button>
      <span class="kg-rail-status">${esc(_error || 'Connection error')}</span>
      <button class="btn-primary btn-grow" data-act="retry">▶ Try Again</button>
    `, {
      back: leaveAndReset,
      retry: () => {
        _error = null; _state = STATE.CHOOSE; render();
        try { _mp && _mp.disconnect(); } catch { /* ignore */ }
        _mp = null;
      },
    });
  }

  function renderLaunching() {
    renderShell(`<div class="info-msg"><span class="spinner"></span>Launching ${esc(_opts.gameName)}…</div>`);
    setRail(`<span class="kg-rail-status">Launching ${esc(_opts.gameName)}…</span>`);
  }

  // Wizard dispatcher: lobby is broken into substeps so each screen shows
  // only one focused topic at a time (no scrolling, no crowding).
  function renderLobby() {
    const session = _mp && _mp.session;
    if (!session) {
      return renderShell(
        `<div class="info-msg"><span class="spinner"></span>Connecting to lobby…</div>`);
    }
    if (_mode === 'same-screen' && _localEditPlayerId) {
      return renderLocalPlayerEditor(session, _localEditPlayerId);
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

  function renderLocalPlayerEditor(session, playerId) {
    const players = Array.isArray(session && session.players) ? session.players : [];
    const player = players.find(p => p && p.user_id === playerId && !p.is_ai);
    if (!player) {
      _localEditPlayerId = null;
      return renderRoster(session);
    }

    const currentName = String(player.username || '').trim() || 'Player';
    const currentAvatar = normalizeLocalHumanAvatar(player.avatar_id || player.avatar, players, player.user_id);
    const quickAvatars = LOCAL_HUMAN_AVATARS.filter(av => !isReservedBotAvatar(av));
    const avatarButtons = quickAvatars.map(e =>
      `<button class="av-btn${currentAvatar === e ? ' selected' : ''}" data-av="${e}">${e}</button>`).join('');

    renderShell(`
      <div class="guest-welcome">
        <div class="welcome-emoji" id="kg-local-av-preview">${esc(currentAvatar)}</div>
        <div class="welcome-sub">Customize this local player.</div>
      </div>
      <input class="name-field" id="kg-local-name" type="text" maxlength="18"
        placeholder="Player name..." value="${esc(currentName)}" autocomplete="off" spellcheck="false">
      <div class="avatar-quick">${avatarButtons}</div>
      <div class="av-more" id="kg-local-av-more">+ More avatars</div>
    `, { stepTitle: 'Edit Local Player' });

    const nameEl = _root.querySelector('#kg-local-name');
    const preview = _root.querySelector('#kg-local-av-preview');
    let selectedAvatar = currentAvatar;

    setRail(`
      <button class="btn-ghost" data-act="cancel-edit">← Back</button>
      <span class="kg-rail-status">Edit local player</span>
      <button class="btn-cyan btn-grow" data-act="save">Save Player</button>
    `, {
      'cancel-edit': () => { _localEditPlayerId = null; render(); },
      save: () => {
        player.username = sanitizeLocalPlayerName(nameEl && nameEl.value, currentName);
        const avatar = normalizeLocalHumanAvatar(selectedAvatar, players, player.user_id);
        player.avatar = avatar;
        player.avatar_id = avatar;
        _localEditPlayerId = null;
        render();
      },
    });

    _root.querySelectorAll('.av-btn').forEach(b => {
      b.addEventListener('click', () => {
        _root.querySelectorAll('.av-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        selectedAvatar = b.getAttribute('data-av') || selectedAvatar;
        if (preview) preview.textContent = selectedAvatar;
      });
    });

    const moreBtn = _root.querySelector('#kg-local-av-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
          AvatarPicker.show(av => {
            const chosen = av && av.emoji ? av.emoji : selectedAvatar;
            selectedAvatar = normalizeLocalHumanAvatar(chosen, players, player.user_id);
            if (preview) preview.textContent = selectedAvatar;
            _root.querySelectorAll('.av-btn').forEach(x =>
              x.classList.toggle('selected', x.getAttribute('data-av') === selectedAvatar));
          }, false);
        }
      });
    }
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
    `, { progress: progressFor(STEP.SHARE), stepTitle: 'Invite a Friend' });

    setRail(`
      <button class="btn-ghost" data-act="cancel">← Leave</button>
      <span class="kg-rail-status">${others > 0 ? `${others} friend${others === 1 ? '' : 's'} joined` : 'Waiting for friends…'}</span>
      <button class="btn-cyan btn-grow" data-act="to-roster">Add Players →</button>
    `, {
      cancel: leaveAndReset,
      'to-roster': () => { _step = STEP.ROSTER; render(); },
    });

    _root.querySelectorAll('[data-copy]').forEach(b =>
      b.addEventListener('click', () => copyToClipboard(b.getAttribute('data-copy'), b)));
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
    const canAddLocalHuman = isHost && _mode === 'same-screen' && count < maxP;
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
      const canRemoveAi = isHost && p.is_ai;
      const canEditLocalHuman = isHost && _mode === 'same-screen' && !p.is_ai;
      const canRemoveLocalHuman = isHost && _mode === 'same-screen' && !p.is_ai && !p.is_host;
      const editBtn = canEditLocalHuman
        ? `<button class="link-btn" data-edit-player="${esc(p.user_id)}" title="Edit name/avatar">Edit</button>` : '';
      const removeBtn = (canRemoveAi || canRemoveLocalHuman)
        ? `<button class="link-btn" data-remove-player="${esc(p.user_id)}" title="Remove">✕</button>` : '';
      return `<div class="${cls.join(' ')}">
        <div class="player-avatar">${esc(avatarGlyph(p))}</div>
        <div class="player-name">${esc(p.username || 'Player')}</div>
        ${tags.join('')}${status}${editBtn}${removeBtn}
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
        ${_mode === 'same-screen'
        ? `<button class="btn-cyan" data-act="add-local-human" ${canAddLocalHuman ? '' : 'disabled'}>+ Add Local Player</button>`
        : ''}
        <button class="btn-purple" data-act="add-ai" ${canAddAi ? '' : 'disabled'}>+ Add Bot</button>
        <div class="ai-difficulty">
          ${['easy', 'medium', 'hard'].map(d =>
          `<button class="diff-btn ${_aiDifficulty === d ? 'active' : ''}" data-diff="${d}">${d}</button>`).join('')}
        </div>
      </div>`;

    const backStep = (_mode === 'friend') ? STEP.SHARE : null;

    renderShell(`
      <div class="roster-scroll">
        ${playerRows}
        ${emptyRows}
      </div>
      ${aiControls}
    `, { progress: progressFor(STEP.ROSTER), stepTitle: `Players (${count} / ${maxP})` });

    setRail(`
      ${backStep
        ? '<button class="btn-ghost" data-act="back">← Back</button>'
        : '<button class="btn-ghost" data-act="cancel">← Leave</button>'}
      <span class="kg-rail-status">${count} / ${maxP} · ${allReady ? 'all ready' : `need ${Math.max(0, minP - count)} more`}</span>
      <button class="btn-cyan btn-grow" data-act="to-launch" ${allReady ? '' : 'disabled'}>
        ${allReady ? 'Continue →' : `Need ${Math.max(0, minP - count)} more`}
      </button>
    `, {
      back: () => { _step = backStep; render(); },
      cancel: leaveAndReset,
      'to-launch': () => { _step = STEP.LAUNCH; render(); },
    });

    _root.querySelectorAll('[data-diff]').forEach(b =>
      b.addEventListener('click', () => { _aiDifficulty = b.getAttribute('data-diff'); render(); }));
    const addLocalHuman = _root.querySelector('[data-act="add-local-human"]');
    if (addLocalHuman) addLocalHuman.addEventListener('click', () => {
      if (!_mp.addLocalPlayer) return;
      const playerId = _mp.addLocalPlayer();
      if (playerId) editLocalHuman(playerId);
    });
    const addAi = _root.querySelector('[data-act="add-ai"]');
    if (addAi) addAi.addEventListener('click', () => _mp.addBot(_aiDifficulty));
    _root.querySelectorAll('[data-edit-player]').forEach(b =>
      b.addEventListener('click', () => editLocalHuman(b.getAttribute('data-edit-player'))));
    _root.querySelectorAll('[data-remove-player]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-remove-player');
        if (_mp.removePlayer) _mp.removePlayer(id);
        else if (_mp.removeBot) _mp.removeBot(id);
      }));
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
    `, { progress: progressFor(STEP.LAUNCH), stepTitle: 'Ready to Launch' });

    setRail(`
      <button class="btn-ghost" data-act="back">← Back</button>
      <span class="kg-rail-status">${ready ? 'All set · launch when ready' : `Need ${minP} ready`}</span>
      <button class="btn-primary btn-grow" data-act="launch" ${ready ? '' : 'disabled'}>▶ Launch</button>
    `, {
      back: () => { _step = STEP.ROSTER; render(); },
      launch: hostLaunch,
    });
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

    const limitOptions = [2, 3, 4, 5, 6].map(n =>
      `<option value="${n}" ${maxP === n ? 'selected' : ''}>${n}</option>`).join('');

    const contentBody = isHost ? `
      <div class="ai-controls">
        <button class="btn-purple" data-act="add-ai" ${canAddAi ? '' : 'disabled'}>+ Add Bot</button>
        <div class="ai-difficulty">
          ${['easy', 'medium', 'hard'].map(d =>
      `<button class="diff-btn ${_aiDifficulty === d ? 'active' : ''}" data-diff="${d}">${d}</button>`
    ).join('')}
        </div>
        <div class="limit-row" style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:#9aa;">
          <span>Max players:</span>
          <select class="limit-select" data-act="set-limit" style="background:#1a1a2e;color:#cff;border:1px solid rgba(0,255,255,0.3);border-radius:4px;padding:3px 8px;font-size:13px;">
            ${limitOptions}
          </select>
        </div>
      </div>` : '';

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
        ${contentBody}
      </div>
    </div></div>`;

    if (isHost) {
      const railStatus = canLaunch
        ? 'All players ready · launch when you are'
        : `Waiting for players… (${count} / ${minP} minimum)`;
      setRail(`
        <button class="btn-ghost" data-act="back-to-share">← Invite More</button>
        <span class="kg-rail-status">${railStatus}</span>
        <button class="btn-primary btn-grow" data-act="launch" ${canLaunch ? '' : 'disabled'}>▶ Launch</button>
      `, {
        'back-to-share': () => { _step = STEP.SHARE; render(); },
        launch: hostLaunch,
      });

      _root.querySelectorAll('[data-diff]').forEach(b =>
        b.addEventListener('click', () => { _aiDifficulty = b.getAttribute('data-diff'); render(); }));
      const addAi = _root.querySelector('[data-act="add-ai"]');
      if (addAi) addAi.addEventListener('click', () => _mp.addBot(_aiDifficulty));
      const limitSel = _root.querySelector('[data-act="set-limit"]');
      if (limitSel) limitSel.addEventListener('change', () => _mp.setMaxPlayers(parseInt(limitSel.value, 10)));
    } else {
      const railStatus = meReady
        ? 'Ready confirmed · waiting for host to launch…'
        : 'Press Join to confirm your ready status';
      setRail(`
        <button class="btn-ghost" data-act="cancel">← Leave</button>
        <span class="kg-rail-status">${railStatus}</span>
        <button class="btn-cyan btn-grow" data-act="guest-join" ${meReady ? 'disabled' : ''}>${meReady ? '✔ Joined' : 'Join'}</button>
      `, {
        cancel: leaveAndReset,
        'guest-join': () => {
          if (_mp && _mp.session && _mp.userId) {
            const mine = _mp.session.players.find(p => p.user_id === _mp.userId);
            if (mine && !mine.ready) _mp.toggleReady();
          }
        },
      });
    }
  }

  // ── Flow: profile → connect → create / join ───────────────────────
  function getProfile() {
    const name = (typeof KGPlayerProfile !== 'undefined' && KGPlayerProfile.getName)
      ? KGPlayerProfile.getName() : (localStorage.getItem('display_name') || '');
    const av = (typeof AvatarPicker !== 'undefined' && AvatarPicker.get) ? AvatarPicker.get() : null;
    return { name: name || '', avatarEmoji: av ? av.emoji : null };
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
    const connectName = String(_profileNameDraft || prof.name || '').trim();
    const connectAvatar = String(_profileAvatarDraft || prof.avatarEmoji || '').trim();
    _mp = new KGMultiplayer(_opts.gameId, {});
    _mp.on('authenticated', (a) => { _myUserId = a.userId; });
    _mp.on('session_update', () => { if (_state !== STATE.LAUNCHING) { _state = STATE.LOBBY; render(); } });
    _mp.on('share_code', () => render());
    _mp.on('game_started', (data) => {
      _launchingNow = false;
      _state = STATE.LAUNCHING; render();
      const session = (data && data.session) || (_mp && _mp.session);
      const activeUserId = _myUserId || (_mp && _mp.userId) || null;
      const launchPayload = cloneLaunchSession(session, activeUserId);
      const launchFailSafe = setTimeout(() => {
        if (_state === STATE.LAUNCHING) {
          _error = 'Launch handoff did not complete. Please try Launch again.';
          _state = STATE.LOBBY;
          render();
        }
      }, 4500);
      try { root.KGSession = launchPayload; } catch { /* ignore */ }
      try {
        const launchResult = _opts.onLaunch && _opts.onLaunch(launchPayload);
        if (launchResult && typeof launchResult.then === 'function') {
          launchResult.catch((e) => {
            if (_state === STATE.LAUNCHING) {
              _error = 'Launch failed. Please try again.';
              _state = STATE.LOBBY;
              render();
            }
            console.error('[KGMultiplayerPanel] onLaunch rejected:', e);
          });
        }
      }
      catch (e) {
        if (_state === STATE.LAUNCHING) {
          _error = 'Launch failed. Please try again.';
          _state = STATE.LOBBY;
          render();
        }
        console.error('[KGMultiplayerPanel] onLaunch threw:', e);
      }
      finally {
        if (_state !== STATE.LAUNCHING) clearTimeout(launchFailSafe);
      }
    });
    _mp.on('error', (msg) => { _error = msg || 'Server error'; _state = STATE.ERROR; render(); });
    _mp.on('disconnected', () => {
      if (_state === STATE.LAUNCHING) return; // game took over
      _error = 'Disconnected from server'; _state = STATE.ERROR; render();
    });
    _mp.connect({
      username: connectName,
      avatar_id: connectAvatar || undefined,
      // Invite flow should not reuse a browser-stable guest identity.
      freshGuestIdentity: _mode === 'guest',
    });
    return _mp;
  }

  function connectAndCreate(isPrivate) {
    _state = STATE.LOBBY;
    if (!_step) _step = isPrivate ? STEP.SHARE : STEP.ROSTER;
    render();
    const mp = ensureClient(); if (!mp) return;
    const create = () => {
      mp.createGame({ private: !!isPrivate, max_players: _opts.maxPlayers });
      const wantBots = (_mode === 'solo') ? Math.max(0, _soloBotsWanted != null ? _soloBotsWanted : (_opts.soloDefaultBots || 1)) : 0;
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
    const prof = getProfile();
    const desiredName = String(_profileNameDraft || prof.name || '').trim();
    const desiredAvatar = String(_profileAvatarDraft || prof.avatarEmoji || '').trim();
    const join = () => {
      if (desiredName || desiredAvatar) {
        mp.updateProfile({ username: desiredName, avatar_id: desiredAvatar });
      }
      mp.joinByCode(code);
    };
    if (mp.userId) join(); else mp.on('authenticated', join);
  }

  function buildLocalLobby() {
    // Same-screen mode: create a local session for the roster builder
    // Users can add 1-4 players (mix of humans and AI bots)
    _state = STATE.LOBBY;
    const prof = getProfile();
    const humanUserId = 'local-human-' + Date.now();
    const hostAvatar = prof.avatarEmoji || '🎮';

    // Initialize _mp as a local mock object with session
    _mp = {
      session: {
        session_id: 'local-session-' + Date.now(),
        game_id: _opts.gameId,
        host_id: humanUserId,
        max_players: _opts.maxPlayers || 4,
        players: [
          {
            user_id: humanUserId,
            username: prof.name || 'Player',
            avatar: hostAvatar,
            avatar_id: hostAvatar,
            is_ai: false,
            is_host: true,
            slot: 0,
            ready: false,
          }
        ],
        status: 'waiting',
        settings: { lobby_accepted: true }
      },
      userId: humanUserId,
      addBot: (difficulty) => {
        if (!_mp.session) return;
        const botCount = _mp.session.players.filter(p => p.is_ai).length;
        if (_mp.session.players.length < _mp.session.max_players) {
          _mp.session.players.push({
            user_id: `local-ai-bot-${botCount}`,
            username: `Bot ${botCount + 1}`,
            avatar: '🤖',
            avatar_id: '🤖',
            is_ai: true,
            is_host: false,
            slot: _mp.session.players.length,
            ready: true,
          });
          render();
        }
      },
      addLocalPlayer: () => {
        if (!_mp.session) return;
        if (_mp.session.players.length >= _mp.session.max_players) return null;
        const humans = _mp.session.players.filter(p => !p.is_ai);
        const nextNum = humans.length + 1;
        const playerId = `local-human-${Date.now()}-${nextNum}`;
        const avatar = nextLocalHumanAvatar(_mp.session.players);
        _mp.session.players.push({
          user_id: playerId,
          username: `Player ${nextNum}`,
          avatar,
          avatar_id: avatar,
          is_ai: false,
          is_host: false,
          slot: _mp.session.players.length,
          ready: true,
        });
        render();
        return playerId;
      },
      removePlayer: (userId) => {
        if (!_mp.session) return;
        const idx = _mp.session.players.findIndex(p => p.user_id === userId);
        if (idx <= 0) return;
        _mp.session.players.splice(idx, 1);
        render();
      },
      removeBot: (userId) => {
        if (_mp && _mp.removePlayer) _mp.removePlayer(userId);
      },
      on: () => { },
      off: () => { },
      startGame: () => {
        launchSameScreen();
      }
    };
    _myUserId = humanUserId;
    _state = STATE.LOBBY;
    _step = STEP.ROSTER;
    render();
  }

  function launchSameScreen() {
    // Launch same-screen game without server
    if (!_mp || !_mp.session) return;
    _state = STATE.LAUNCHING;
    render();

    const players = _mp.session.players || [];
    const humanUserId = _mp.userId;

    const launchPayload = {
      session_id: _mp.session.session_id,
      session_code: null,
      game_id: _opts.gameId,
      host_id: humanUserId,
      my_user_id: humanUserId,
      is_host: true,
      players: players,
      mode: 'same-screen',
      hasRemoteHumans: false,
      playerCount: players.length,
      launchMode: 'same-screen',
    };

    try { root.KGSession = launchPayload; } catch { /* ignore */ }

    // Watchdog: if onLaunch doesn't navigate within 3s, force it
    const navGuard = setTimeout(() => {
      if (_state === STATE.LAUNCHING) {
        console.warn('[KGMultiplayerPanel] navGuard firing – forcing navigation');
        window.location.href = _opts.gamePath || '/fasttrack/3d.html';
      }
    }, 3000);

    try {
      _opts.onLaunch && _opts.onLaunch(launchPayload);
      clearTimeout(navGuard);
      // onLaunch should navigate; if still here after a tick, force it
      setTimeout(() => {
        if (_state === STATE.LAUNCHING) {
          window.location.href = _opts.gamePath || '/fasttrack/3d.html';
        }
      }, 100);
    } catch (e) {
      clearTimeout(navGuard);
      console.error('[KGMultiplayerPanel] launchSameScreen threw:', e);
      window.location.href = _opts.gamePath || '/fasttrack/3d.html';
    }
  }

  function hostLaunch() {
    if (!_mp || !_mp.session || _launchingNow) return;
    _launchingNow = true;

    // Same-device/local mode has no server handshake.
    if (_mode === 'same-screen' || typeof _mp.acceptLobby !== 'function') {
      try { _mp.startGame && _mp.startGame(); }
      finally { _launchingNow = false; }
      return;
    }

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
        if (_state === STATE.LAUNCHING) {
          _launchingNow = false;
          _state = STATE.LOBBY;
          _error = 'Launch timed out. Please try again.';
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
      else tryStart();
    }, 320);
  }

  function leaveAndReset() {
    if (_browseTimer) { clearInterval(_browseTimer); _browseTimer = null; }
    _browseSessions = [];
    _browseRequested = false;
    try { _mp && _mp.leave(); } catch { /* ignore */ }
    try { _mp && _mp.disconnect(); } catch { /* ignore */ }
    _mp = null; _myUserId = null; _mode = null; _step = null; _state = STATE.CHOOSE;
    _localEditPlayerId = null;
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
      _localEditPlayerId = null;

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
        // Guest must enter their own name — never inherit the host's localStorage name.
        _profileNameDraft = '';
        _profileAvatarDraft = null;
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
      _mp = null; _myUserId = null; _localEditPlayerId = null;
      if (_root) _root.innerHTML = '';
      _root = null; _opts = null;
      clearRail();
    },
    get session() { return _mp ? _mp.session : null; },
    get client() { return _mp; },
  };

  root.KGMultiplayerPanel = KGMultiplayerPanel;
})(window);
