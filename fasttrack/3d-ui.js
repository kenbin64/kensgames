// fasttrack/3d-ui.js — extracted from 3d.html
// Viewport chrome wiring: emoji reactions, settings panel, music/sfx
// volume, replay overlay, leave-game flow. All gameplay state lives in
// fasttrack-game-core.js; this file only renders the controls into the
// fixed rail (HR-6.2) and forwards user intent to the game core / audio
// substrate / multiplayer client.
const EMOJI_REACTIONS = [
  { id: 'happy', label: 'Happy', emoji: '🙂' },
  { id: 'excited', label: 'Excited', emoji: '🤩' },
  { id: 'thumbs_up', label: 'Thumbs Up', emoji: '👍' },
  { id: 'boo', label: 'Boo', emoji: '👎' },
  { id: 'clap', label: 'Clap', emoji: '👏' },
  { id: 'hurray', label: 'Hurray', emoji: '🙌' },
  { id: 'joyful', label: 'Joyful', emoji: '😄' },
  { id: 'mad', label: 'Mad', emoji: '😡' },
  { id: 'high_five', label: 'High Five', emoji: '🖐️' },
  { id: 'swearing_cloud', label: 'Swearing', emoji: '🤬' },
  { id: 'lightning', label: 'Lightning', emoji: '⚡' },
];

let reactionClient = null;
let reactionClientReady = false;
let reactionJoinedCode = null;
let reactionJoinTimer = null;

function isMobileViewport() {
  return window.matchMedia('(max-width: 600px)').matches;
}

function getCurrentName() {
  const n = localStorage.getItem('username') || localStorage.getItem('display_name') || 'Player';
  return String(n).trim() || 'Player';
}

function renderEmojiPanel() {
  const panel = document.getElementById('emoji-panel');
  if (!panel || panel.childElementCount) return;
  panel.innerHTML = EMOJI_REACTIONS.map((r) => `
        <button class="emoji-btn" onclick="sendEmojiReaction('${r.id}')" title="${r.label}">
          <span class="emoji-glyph">${r.emoji}</span>
          <span>${r.label}</span>
        </button>
      `).join('');
}

function toggleEmojiPanel(forceOpen) {
  const panel = document.getElementById('emoji-panel');
  if (!panel) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('open');
  panel.classList.toggle('open', shouldOpen);
}

function openEmojiFromSettings() {
  toggleEmojiPanel(true);
  if (!isMobileViewport()) return;
  toggleSettings();
}

function showEmojiReactionToast(payload) {
  const feed = document.getElementById('emoji-feed');
  if (!feed) return;
  const emoji = payload && payload.emoji ? payload.emoji : '🙂';
  const label = payload && payload.label ? payload.label : 'Reaction';
  const sender = payload && payload.sender ? payload.sender : 'Player';

  const node = document.createElement('div');
  node.className = 'emoji-toast';
  node.textContent = `${emoji} ${sender}: ${label}`;
  feed.prepend(node);

  while (feed.children.length > 5) {
    feed.removeChild(feed.lastElementChild);
  }

  setTimeout(() => node.classList.add('fade'), 3600);
  setTimeout(() => {
    if (node.parentNode) node.parentNode.removeChild(node);
  }, 3950);

  const balloon = document.createElement('div');
  balloon.className = 'emoji-balloon';
  balloon.innerHTML = `
        <div class="emoji-balloon-glyph">${emoji}</div>
        <div class="emoji-balloon-sender">${sender}</div>
      `;
  document.body.appendChild(balloon);

  setTimeout(() => {
    balloon.classList.add('pop');
  }, 1100);
  setTimeout(() => {
    if (balloon.parentNode) balloon.parentNode.removeChild(balloon);
  }, 1420);
}

function ensureReactionClient() {
  if (reactionClient || typeof KGMultiplayer === 'undefined') return;
  reactionClient = new KGMultiplayer('fasttrack');

  reactionClient.on('connected', () => {
    reactionClientReady = true;
    tryJoinReactionSession();
  });

  reactionClient.on('disconnected', () => {
    reactionClientReady = false;
  });

  reactionClient.on('chat', (data) => {
    if (!data || !data.emoji_reaction) return;
    const r = data.emoji_reaction;
    showEmojiReactionToast({
      emoji: r.emoji,
      label: r.label,
      sender: data.username || r.sender || 'Player',
    });
  });

  reactionClient.connect({ username: getCurrentName() });

  reactionJoinTimer = setInterval(() => {
    tryJoinReactionSession();
  }, 1500);

  window.addEventListener('beforeunload', () => {
    if (reactionJoinTimer) clearInterval(reactionJoinTimer);
    if (reactionClient) reactionClient.disconnect();
  });
}

function getSessionCodeForReactions() {
  try {
    const runtime = JSON.parse(sessionStorage.getItem('kg_fasttrack_runtime') || 'null');
    const runtimeCode = runtime && runtime.game && runtime.game.code ? String(runtime.game.code).toUpperCase() : '';
    if (runtimeCode) return runtimeCode;
  } catch (_) { }

  try {
    const sess = JSON.parse(sessionStorage.getItem('kg_session') || 'null');
    const sessionCode = sess && sess.session_code ? String(sess.session_code).toUpperCase() : '';
    if (sessionCode) return sessionCode;
  } catch (_) { }

  return '';
}

function tryJoinReactionSession() {
  if (!reactionClient || !reactionClientReady) return;
  const code = getSessionCodeForReactions();
  if (!code || code === reactionJoinedCode) return;
  reactionClient.joinByCode(code);
  reactionJoinedCode = code;
  if (reactionJoinTimer) {
    clearInterval(reactionJoinTimer);
    reactionJoinTimer = null;
  }
}

function sendEmojiReaction(id) {
  const reaction = EMOJI_REACTIONS.find((r) => r.id === id);
  if (!reaction) return;

  const sender = getCurrentName();
  showEmojiReactionToast({
    emoji: reaction.emoji,
    label: reaction.label,
    sender,
  });

  const payload = {
    emoji_reaction: {
      id: reaction.id,
      label: reaction.label,
      emoji: reaction.emoji,
      sender,
      ts: Date.now(),
    },
    message: `${reaction.emoji} ${reaction.label}`,
  };

  if (reactionClient && reactionClientReady) {
    reactionClient.chat(payload);
  }

  toggleEmojiPanel(false);
}

function syncSettingsButtonGlyph() {
  const btn = document.getElementById('btn-settings');
  if (!btn) return;
  const mobile = isMobileViewport();
  btn.textContent = mobile ? '☰' : '⚙';
  btn.title = mobile ? 'Menu' : 'Settings';
  btn.setAttribute('aria-label', mobile ? 'Menu' : 'Settings');
}

// ── Settings panel wiring ──
function toggleMusic() {
  const btn = document.getElementById('btn-music-toggle');
  if (typeof GameSettings === 'undefined') return;
  const nowEnabled = !GameSettings.musicEnabled;
  GameSettings.musicEnabled = nowEnabled;
  GameSettings.save();
  if (window.ManifoldAudio) {
    if (!nowEnabled) {
      ManifoldAudio.stopMusic();
      ManifoldAudio.stopRagtimeAmbience && ManifoldAudio.stopRagtimeAmbience();
    } else {
      if (!ManifoldAudio.musicPlaying) ManifoldAudio.startMusic();
      ManifoldAudio.startRagtimeAmbience && ManifoldAudio.startRagtimeAmbience();
    }
  }
  btn.textContent = nowEnabled ? '🎵' : '🔇';
  btn.classList.toggle('muted', !nowEnabled);
  btn.title = nowEnabled ? 'Music On — click to mute' : 'Music Off — click to unmute';
  // Keep the settings slider in sync
  const slider = document.getElementById('vol-music');
  if (slider) slider.value = nowEnabled ? Math.max(10, Number(slider.value) || 50) : 0;
}

// Sync music toggle button state once game + audio are ready
window.addEventListener('ft3d:ready', () => {
  const btn = document.getElementById('btn-music-toggle');
  if (!btn || typeof GameSettings === 'undefined') return;
  const on = GameSettings.musicEnabled;
  btn.textContent = on ? '🎵' : '🔇';
  btn.classList.toggle('muted', !on);
  btn.title = on ? 'Music On — click to mute' : 'Music Off — click to unmute';
});

function toggleSettings() {
  document.getElementById('settings-overlay').classList.toggle('open');
}

function setMusicVolume(val) {
  const v = val / 100;
  if (typeof GameSettings !== 'undefined') {
    GameSettings.musicEnabled = v > 0;
    GameSettings.save();
  }
  if (window.ManifoldAudio) {
    if (v === 0) {
      ManifoldAudio.stopMusic();
    } else {
      if (!ManifoldAudio.musicPlaying) ManifoldAudio.startMusic();
    }
    // Scale the ragtime ambient gain
    if (ManifoldAudio._rtGain) {
      ManifoldAudio._rtGain.gain.setTargetAtTime(v * 0.12, ManifoldAudio.ctx.currentTime, 0.1);
    }
    // Scale master gain proportionally for music
    if (ManifoldAudio.masterGain) {
      ManifoldAudio._musicVol = v;
    }
  }
  if (window.AudioSubstrate) {
    AudioSubstrate.setVolume('music', v);
  }
}

function setSfxVolume(val) {
  const v = val / 100;
  if (typeof GameSettings !== 'undefined') {
    GameSettings.soundEnabled = v > 0;
    GameSettings.save();
  }
  if (window.ManifoldAudio && ManifoldAudio.masterGain) {
    ManifoldAudio.masterGain.gain.setTargetAtTime(Math.max(v, 0.01), ManifoldAudio.ctx.currentTime, 0.1);
  }
  if (window.AudioSubstrate) {
    AudioSubstrate.setVolume('sfx', v);
    AudioSubstrate.setVolume('commentary', v);
    AudioSubstrate.setVolume('crowd', v);
  }
}

function exitGame() {
  // Skip confirm if game is already over (replay overlay already shown)
  const replayOpen = document.getElementById('replay-overlay').classList.contains('open');
  if (replayOpen || confirm('Leave this game?')) {
    clearTransientIdentity();
    window.location.href = '/lobby/?game=fasttrack';
  }
}

function leaveFromReplay() {
  clearTransientIdentity();
  window.location.href = '/lobby/?game=fasttrack';
}

// Per-session identity is cleared on every exit so the next game forces
// fresh name + avatar entry. Persistent guest tokens (kg_guest_*) and
// user preferences are preserved.
function clearTransientIdentity() {
  // Prefer the centralised purge helper so every game/lobby clears the
  // same set of runtime keys. Fall back to inline cleanup for older pages
  // that haven't been rebuilt with /js/kg-game-cache.js yet.
  try {
    if (window.KGGameCache && typeof KGGameCache.purgeRuntime === 'function') {
      KGGameCache.purgeRuntime('fasttrack_exit');
      // Identity (username / display_name / kg_avatar) is preserved by design
      // — see /js/kg-game-cache.js header. Wiping it here forced the portal
      // and game lobbies to re-prompt the user on every exit/replay.
      return;
    }
  } catch (_) { /* fall through to legacy path */ }
  try {
    // Identity keys (username, display_name, kg_avatar) are intentionally
    // omitted — they persist across exits as a user preference.
    const keys = [
      'fasttrack_player_name', 'fasttrack_player_avatar',
      'KG_Game', 'KG_Player', 'fasttrack-lobby',
      'kg_session_id', 'kg_session_code',
    ];
    keys.forEach(k => { try { localStorage.removeItem(k); } catch (_) { } });
    try { sessionStorage.removeItem('kg_session'); } catch (_) { }
    try { sessionStorage.removeItem('kg_fasttrack_runtime'); } catch (_) { }
    try { sessionStorage.removeItem('ft_session_players'); } catch (_) { }
    try { sessionStorage.removeItem('ft_my_user_id'); } catch (_) { }
  } catch (_) { /* ignore */ }
}

// Replay button. In single-player just reloads. In multiplayer the host
// asks the server to recycle the session; guests wait for the server
// broadcast and reload to pick up the fresh game state.
function playAgain() {
  // user_directive_2026-05-18: winner of this game opens the next one.
  // Stash the winner's display name; fasttrack-game-core.initGame()
  // reads (and clears) this key when seeding state.players.current.
  try {
    const core = window.FastTrackCore;
    if (core && core.state) {
      const winnerIdx = core.state.meta.get('winner');
      const list = core.state.players.get('list') || [];
      if (Number.isInteger(winnerIdx) && list[winnerIdx] && list[winnerIdx].name) {
        localStorage.setItem('ft.rematchWinnerName', list[winnerIdx].name);
      }
    }
  } catch (e) { console.warn('rematch winner stash failed', e); }

  const mp = window.__FT_MP__ || null;
  const isMp = !!(mp && mp.connected && mp.session);
  const isHost = !!(isMp && mp.isHost);
  if (!isMp) {
    window.location.reload();
    return;
  }
  if (!isHost) {
    // Should not happen — guest button is hidden — but guard anyway.
    return;
  }
  const btn = document.getElementById('btn-replay-again');
  if (btn) { btn.disabled = true; btn.textContent = 'Restarting…'; }
  try { mp.sendReplayRequest(); } catch (e) { console.warn('replay send failed', e); }
}

function showReplayPrompt(winnerName) {
  const overlay = document.getElementById('replay-overlay');
  if (!overlay) return;
  const label = document.getElementById('replay-winner');
  if (label) {
    label.textContent = winnerName
      ? `${winnerName} wins! Play again or return to the lobby.`
      : 'Play again or return to the lobby.';
  }
  // Host-only Replay button. Guests see "Waiting for host…".
  const mp = window.__FT_MP__ || null;
  const isMp = !!(mp && mp.connected && mp.session);
  const isHost = !isMp || (mp && mp.isHost); // single-player counts as host
  const btnAgain = document.getElementById('btn-replay-again');
  const waitMsg = document.getElementById('replay-wait');
  if (btnAgain) {
    btnAgain.disabled = false;
    btnAgain.textContent = '↻ Play Again';
    btnAgain.style.display = isHost ? '' : 'none';
  }
  if (waitMsg) waitMsg.style.display = isHost ? 'none' : 'block';
  overlay.classList.add('open');
}

function hideReplayPrompt() {
  const overlay = document.getElementById('replay-overlay');
  if (overlay) overlay.classList.remove('open');
}

// Listen for server fork denials (double-click protection) and replay
// broadcasts. Re-armed every time the page wires up multiplayer.
function bindReplayServerEvents() {
  const mp = window.__FT_MP__ || null;
  if (!mp || mp.__replayBound) return;
  mp.__replayBound = true;
  mp.on('fork_denied', (data) => {
    if (!data) return;
    if (data.fork === 'replay') {
      const btn = document.getElementById('btn-replay-again');
      if (btn) { btn.disabled = false; btn.textContent = '↻ Play Again'; }
    }
    if (data.fork === 'create' || data.fork === 'replay') {
      showFlash(data.message || `Another ${data.fork} request is in flight.`);
    }
  });
  mp.on('replay_started', () => {
    // Server has reset the session in place. Reload so all clients pick
    // up the fresh game state with the same seats.
    hideReplayPrompt();
    window._replayPromptShown = false;
    setTimeout(() => window.location.reload(), 200);
  });
}
function showFlash(msg) {
  let el = document.getElementById('kg-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kg-flash';
    el.style.cssText = 'position:fixed;top:8%;left:50%;transform:translateX(-50%);background:rgba(20,30,50,0.92);color:#ffd76b;padding:.6rem 1rem;border:1px solid #ffd76b;border-radius:6px;z-index:99999;font:600 14px system-ui;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2400);
}
// Try to bind on every animation frame until __FT_MP__ exists.
(function pollForMp() {
  if (window.__FT_MP__) bindReplayServerEvents();
  else setTimeout(pollForMp, 500);
})();

window.showReplayPrompt = showReplayPrompt;
window.hideReplayPrompt = hideReplayPrompt;

// Wire intent manifold functions
window.toggleSound = function () { const el = document.getElementById('vol-sfx'); el.value = el.value > 0 ? 0 : 70; setSfxVolume(el.value); };
window.toggleMusic = function () { const el = document.getElementById('vol-music'); el.value = el.value > 0 ? 0 : 50; setMusicVolume(el.value); };
window.exitToMenu = exitGame;

// Init slider values from saved settings on load
document.addEventListener('DOMContentLoaded', () => {
  renderEmojiPanel();
  syncSettingsButtonGlyph();
  ensureReactionClient();
  tryJoinReactionSession();

  if (typeof GameSettings !== 'undefined') {
    GameSettings.load();
    document.getElementById('vol-music').value = GameSettings.musicEnabled ? 50 : 0;
    document.getElementById('vol-sfx').value = GameSettings.soundEnabled ? 70 : 0;
  }

  document.addEventListener('click', (ev) => {
    const panel = document.getElementById('emoji-panel');
    const ui = document.getElementById('emoji-ui');
    if (!panel || !ui || !panel.classList.contains('open')) return;
    if (!ui.contains(ev.target)) panel.classList.remove('open');
  });
});

window.addEventListener('resize', () => {
  syncSettingsButtonGlyph();
  tryJoinReactionSession();
});

// Dev-only: reveal the manifold-metrics panel when ?dev is in the URL.
// Folded in from the inline one-liner that previously sat in 3d.html.
if (location.search.includes('dev')) {
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('panel-metrics');
    if (panel) panel.style.display = '';
  });
}

// ────────────────────────────────────────────────────────────────
// PEG CONTROL BAR — non-text gameplay input.
// 5 horizontal peg buttons (each labeled with its peg nickname) +
// a single Confirm button. Replaces the text-based instruction
// banner / confirm bar / move-hints panel.
//
// Wiring:
//   - Reads current player + pegs from FastTrackCore.state.
//   - Reads the engine's move-cycle from window.FastTrack3D.getMoveCycle().
//   - A peg button is "active" iff that peg has at least one entry
//     in the current move-cycle (i.e. a legal move with this card).
//   - Click a peg → cycle through that peg's move-cycle entries,
//     staging each via FastTrack3D.stagePendingEntry() so the board
//     lights up exactly as it did from the (now hidden) prev/next
//     button path.
//   - Click Confirm → FastTrack3D.commitPendingEntry().
// All state is derived; this file owns no gameplay state of its own.
// ────────────────────────────────────────────────────────────────
(function initPegControlBar() {
  const PEG_COUNT = 5;
  // Per-peg cycle index — which of this peg's legal moves is currently staged.
  const pegCycleIdx = new Array(PEG_COUNT).fill(-1);
  let lastSignature = '';
  // Tracks only the *shape* of the move-cycle (peg/cycle-content, NOT pending).
  // We reset pegCycleIdx only when the shape changes; reseting on every
  // pending-change broke the "click same peg to toggle to next choice" loop.
  let lastShapeSignature = '';
  let lastSelectedPegIdx = -1;

  function getCore() { return window.FastTrackCore || null; }
  function getBridge() { return window.FastTrack3D || null; }

  function getCurrentPlayer() {
    const core = getCore();
    if (!core || !core.state) return null;
    const list = core.state.players.get('list') || [];
    const ci = core.state.players.get('current') || 0;
    return list[ci] || null;
  }

  function isHumanTurn() {
    const p = getCurrentPlayer();
    return !!(p && !p.isBot);
  }

  // ── Location → icon mapping (user_directive_2026-05-18) ─────────────
  // Each peg button shows a glyph that reflects WHERE that peg currently
  // sits on the board, so the player can read the whole roster at a
  // glance. Matches getHoleType() in fasttrack-game-core.js.
  //   holding   → 📦  (in the holding/staging area)
  //   home-*    → 🏠  (winner/home hole, has not entered play)
  //   bullseye  → 🎯  (centre target)
  //   safezone  → 🛡️  (private safe lane)
  //   ft-*      → ⚡  (fast-track loop)
  //   else      → ●   (on the open rim)
  function pegLocationIcon(peg) {
    if (!peg) return '●';
    const id = peg.holeId || '';
    if (peg.holeType === 'holding' || (!id)) return '📦';
    if (id === 'bullseye') return '🎯';
    if (id.startsWith('safe-')) return '🛡️';
    if (id.startsWith('ft-')) return '⚡';
    if (id.startsWith('home-')) return '🏠';
    return '●';
  }

  // Pick black or white text for legibility against the peg's color.
  // Uses W3C relative-luminance approximation on a #RRGGBB hex string.
  function complementaryTextColor(hex) {
    if (!hex || typeof hex !== 'string') return '#fff';
    let h = hex.trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return '#fff';
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.55 ? '#111' : '#fff';
  }

  // Return entries from the move-cycle that originate from the given pegIdx.
  // Covers regular moves, 7-split first-peg picks, and split-first leg picks.
  function entriesForPeg(cycle, pegIdx) {
    if (!Array.isArray(cycle)) return [];
    const core = getCore();
    const validMoves = (core && core.state)
      ? core.state.turn.get('validMoves') || [] : [];
    const out = [];
    for (const e of cycle) {
      if (!e) continue;
      // Direct pegIdx tag (split-first-peg, split-first).
      if (e.pegIdx === pegIdx) { out.push(e); continue; }
      // Regular moves carry moveIdx → look up the underlying move.
      if (e.kind === 'move' && Number.isFinite(e.moveIdx)) {
        const m = validMoves[e.moveIdx];
        if (m && (m.pegIdx === pegIdx || m.peg2Idx === pegIdx)) {
          out.push(e);
        }
      } else if (e.kind === 'split-second' && Number.isFinite(e.moveIdx)) {
        const m = validMoves[e.moveIdx];
        if (m && (m.pegIdx === pegIdx || m.peg2Idx === pegIdx)) {
          out.push(e);
        }
      }
    }
    return out;
  }

  // Help-pill visibility helper — hidden during bot turns and once the
  // player has dismissed it (localStorage key below).
  const HELP_DISMISS_KEY = 'ft.pegHelp.dismissed.v1';
  function _setHelpVisible(visible) {
    const pill = document.getElementById('ft-peg-help');
    if (!pill) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(HELP_DISMISS_KEY) === '1'; } catch (_) { /* private mode */ }
    pill.hidden = !visible || dismissed;
  }

  function refreshPegBar() {
    const bar = document.getElementById('ft-peg-bar');
    if (!bar) return;
    const bridge = getBridge();
    const player = getCurrentPlayer();
    const humanTurn = isHumanTurn();
    // Skip ALL work during bot turns (was the main source of perceived
    // clunkiness — 6 Hz DOM thrash with no input possible).
    if (!humanTurn) {
      _setHelpVisible(false);
      if (lastSignature !== '0') {
        lastSignature = '0';
        lastShapeSignature = '';
        for (let i = 0; i < PEG_COUNT; i++) {
          const btn = document.getElementById('peg-btn-' + i);
          if (!btn) continue;
          btn.disabled = true;
          btn.classList.remove('active', 'selected');
          pegCycleIdx[i] = -1;
        }
        const cbtn = document.getElementById('ft-peg-confirm');
        if (cbtn) cbtn.disabled = true;
      }
      return;
    }
    _setHelpVisible(true);
    const cycle = bridge ? bridge.getMoveCycle() : [];
    const pending = bridge ? bridge.getPendingEntry() : null;
    const confirmBtn = document.getElementById('ft-peg-confirm');

    // Shape signature — covers everything that affects WHICH pegs are active
    // and the contents of their cycle entries. Excludes `pending`.
    let shapeSig = '1';
    if (player && Array.isArray(player.pegs)) {
      for (let i = 0; i < PEG_COUNT; i++) {
        const peg = player.pegs[i];
        shapeSig += '|' + (peg ? (peg.nickname || 'Peg ' + (i + 1)) : '-')
          + ':' + (peg ? (peg.holeId || 'holding') : '-');
      }
    }
    shapeSig += '|cycle=' + cycle.length;
    // Include a per-entry tag so cycle-content changes (different cards, split
    // stage changes) reset the per-peg index even when the length matches.
    for (let i = 0; i < cycle.length; i++) {
      const e = cycle[i];
      shapeSig += '#' + (e ? (e.kind + ':' + (e.moveIdx ?? '') + ':' + (e.pegIdx ?? '') + ':' + (e.steps ?? '')) : '_');
    }
    shapeSig += '|color=' + (player ? (player.color || '') : '');

    const pendingSig = pending
      ? (pending.kind + ':' + (pending.pegIdx ?? '') + ':' + (pending.moveIdx ?? '') + ':' + (pending.steps ?? ''))
      : '';
    const sig = shapeSig + '||pending=' + pendingSig;
    if (sig === lastSignature) return;
    lastSignature = sig;

    // Reset per-peg cycle indices ONLY when the cycle shape has changed.
    // (Previously this ran on every pending change, which broke per-peg
    // toggling: each stage→refresh wiped the index back to -1 so clicking
    // the same peg again always re-staged option 0.)
    if (shapeSig !== lastShapeSignature) {
      lastShapeSignature = shapeSig;
      for (let i = 0; i < PEG_COUNT; i++) pegCycleIdx[i] = -1;
    }

    // Which peg (if any) does the staged entry belong to?
    let selectedPegIdx = -1;
    if (pending) {
      for (let i = 0; i < PEG_COUNT; i++) {
        const ents = entriesForPeg(cycle, i);
        if (ents.some(e => e === pending)) { selectedPegIdx = i; break; }
      }
    }
    lastSelectedPegIdx = selectedPegIdx;

    for (let i = 0; i < PEG_COUNT; i++) {
      const btn = document.getElementById('peg-btn-' + i);
      if (!btn) continue;
      const peg = player && Array.isArray(player.pegs) ? player.pegs[i] : null;
      const nick = peg ? (peg.nickname || ('Peg ' + (i + 1))) : ('Peg ' + (i + 1));
      const nickEl = btn.querySelector('.peg-nickname');
      if (nickEl) nickEl.textContent = nick;
      const color = (player && player.color) ? player.color : '#88a';
      btn.style.setProperty('--peg-color', color);

      // user_directive_2026-05-18 — button background = peg owner's color,
      // text in a complementary shade, and the glyph reflects the peg's
      // current board location.
      const textColor = complementaryTextColor(color);
      btn.style.backgroundColor = color;
      btn.style.color = textColor;
      const glyphEl = btn.querySelector('.peg-glyph');
      if (glyphEl) {
        glyphEl.textContent = pegLocationIcon(peg);
        glyphEl.style.color = textColor;
      }
      // Nickname is a floating dark pill above the button (its own bg);
      // leave its color alone so the white-on-dark readout is preserved.

      const ents = humanTurn ? entriesForPeg(cycle, i) : [];
      const active = ents.length > 0;
      btn.disabled = !active;
      btn.classList.toggle('active', active);
      btn.classList.toggle('selected', active && i === selectedPegIdx);
    }

    if (confirmBtn) {
      confirmBtn.disabled = !pending;
    }
  }

  // user_directive_2026-05-18 — short (≤3 word) strategic tag for the
  // currently-staged choice. Surfaced via the center toast whenever the
  // player toggles peg choices, so they understand the flavor of each
  // candidate without reading hint text. Kept terse on purpose.
  function entryTag(entry, player) {
    if (!entry || !entry.type) return '';
    const t = entry.type;
    const core = window.FastTrackCore;
    const board = core && core.state && core.state.board;
    const ci = core && core.state && core.state.players && core.state.players.get('current');
    // Detect capture: a 'move' (or 'split' half) whose destination holds an opponent peg.
    function destHasOpponent(dest) {
      if (!dest || !board || ci == null) return false;
      const occ = board.get(dest);
      return !!(occ && occ.playerIdx !== ci);
    }
    switch (t) {
      case 'enter': return 'Enter board';
      case 'enterFastTrack': return 'Hit fast track';
      case 'enterBullseye': return 'Bullseye!';
      case 'exitFastTrack': return destHasOpponent(entry.dest) ? 'Cut + exit FT' : 'Exit fast track';
      case 'exitBullseye': return 'Leave bullseye';
      case 'move': {
        if (destHasOpponent(entry.dest)) return 'Cut peg!';
        const dest = entry.dest || '';
        if (dest.startsWith('safe-')) return 'Enter safe zone';
        if (dest === 'bullseye') return 'Bullseye!';
        if (dest.startsWith('ft-')) return 'Hit fast track';
        return '';
      }
      case 'split': {
        // Card-7 split half — pick whichever flavor is most salient.
        if (destHasOpponent(entry.dest)) return 'Cut + split';
        const dest = entry.dest || '';
        if (dest.startsWith('safe-')) return 'Split → safe';
        if (dest === 'bullseye') return 'Split → bull';
        if (dest.startsWith('ft-')) return 'Split → FT';
        return 'Split move';
      }
      default: return '';
    }
  }

  function handlePegClick(pegIdx) {
    const bridge = getBridge();
    if (!bridge || !isHumanTurn()) return;
    const cycle = bridge.getMoveCycle();
    const ents = entriesForPeg(cycle, pegIdx);
    if (!ents.length) return;
    // If a different peg was selected, start this peg fresh; otherwise advance.
    let idx;
    if (lastSelectedPegIdx !== pegIdx) {
      idx = 0;
    } else {
      const prev = pegCycleIdx[pegIdx];
      idx = (prev < 0) ? 0 : (prev + 1) % ents.length;
    }
    pegCycleIdx[pegIdx] = idx;
    bridge.stagePendingEntry(ents[idx]);
    // Flash a 3-word strategic tag so the player understands the staged
    // choice at a glance. Uses the same center-toast surface as the
    // turn/redraw/no-legal-move alerts (pointer-events:none, top of view).
    try {
      const core = window.FastTrackCore;
      const player = core && core.state && core.state.players &&
        (core.state.players.get('list') || [])[core.state.players.get('current')];
      const tag = entryTag(ents[idx], player);
      if (tag && typeof window.showCenterToast === 'function') {
        const accent = (player && player.color) || '#ffd633';
        window.showCenterToast(tag, accent, 1100);
      }
    } catch (_) { /* ignore */ }
    // Force a re-render so the selected styling updates immediately.
    lastSignature = '';
    refreshPegBar();
  }

  function handleConfirmClick() {
    const bridge = getBridge();
    if (!bridge) return;
    const pending = bridge.getPendingEntry();
    if (!pending) return;
    bridge.commitPendingEntry();
    for (let i = 0; i < PEG_COUNT; i++) pegCycleIdx[i] = -1;
    lastSignature = '';
    refreshPegBar();
  }

  function wirePegBar() {
    for (let i = 0; i < PEG_COUNT; i++) {
      const btn = document.getElementById('peg-btn-' + i);
      if (btn && !btn._pegWired) {
        btn._pegWired = true;
        btn.addEventListener('click', () => handlePegClick(i));
      }
    }
    const confirmBtn = document.getElementById('ft-peg-confirm');
    if (confirmBtn && !confirmBtn._pegWired) {
      confirmBtn._pegWired = true;
      confirmBtn.addEventListener('click', handleConfirmClick);
    }
  }

  function wireHelpPill() {
    const closeBtn = document.getElementById('ft-peg-help-close');
    if (!closeBtn || closeBtn.dataset.wired === '1') return;
    closeBtn.dataset.wired = '1';
    closeBtn.addEventListener('click', () => {
      try { localStorage.setItem(HELP_DISMISS_KEY, '1'); } catch (_) { /* ignore */ }
      const pill = document.getElementById('ft-peg-help');
      if (pill) pill.hidden = true;
    });
  }

  function bootPegBar() {
    wirePegBar();
    wireHelpPill();
    refreshPegBar();
    // Poll at 6 Hz — cheap, fires only when signature changes.
    setInterval(refreshPegBar, 160);
    window.addEventListener('ft3d:ready', refreshPegBar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPegBar);
  } else {
    bootPegBar();
  }
})();

// ─── Hamburger Break/Resume sync ─────────────────────────────────────
// Mirrors the engine-managed #btn-break (label, hidden state) onto the
// hamburger menu's #hm-break item so the menu always reflects the
// current option (Break vs Resume) and hides when neither applies.
(function syncHamburgerBreak() {
  const apply = () => {
    const src = document.getElementById('btn-break');
    const dst = document.getElementById('hm-break');
    if (!src || !dst) return;
    const hidden = src.classList.contains('hidden') || src.disabled;
    dst.style.display = hidden ? 'none' : '';
    const txt = (src.textContent || '').trim();
    const isResume = /resume/i.test(txt);
    const icon = dst.querySelector('.hm-icon');
    const label = dst.querySelector('.hm-label');
    if (icon) icon.textContent = isResume ? '▶' : '☕';
    if (label) label.textContent = isResume ? 'Resume' : 'Break';
    dst.title = src.title || (isResume ? 'Resume' : 'Take a break');
  };
  apply();
  setInterval(apply, 320);
  window.addEventListener('ft3d:ready', apply);
})();
