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
      // Also drop the player-display fields that are FastTrack-exit-specific
      // and intentionally NOT in the shared runtime list (so a mid-session
      // game-over doesn't force re-entry of name + avatar).
      try { localStorage.removeItem('username'); } catch (_) { }
      try { localStorage.removeItem('display_name'); } catch (_) { }
      try { localStorage.removeItem('kg_avatar'); } catch (_) { }
      return;
    }
  } catch (_) { /* fall through to legacy path */ }
  try {
    const keys = [
      'fasttrack_player_name', 'fasttrack_player_avatar',
      'KG_Game', 'KG_Player', 'fasttrack-lobby',
      'username', 'display_name', 'kg_avatar',
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
