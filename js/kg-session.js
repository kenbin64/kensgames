/**
 * kg-session.js — Shared KensGames session module
 *
 * Include on every authenticated portal/game page:
 *   <script src="/js/kg-session.js"></script>
 *
 * What it does:
 *   1. Reads kg_token from localStorage
 *   2. If missing, tries Cloudflare Access bridge (access-session)
 *   3. If still no token, redirects to /login (unless body has data-kg-public="true")
 *   4. Loads /api/players/me → if profileSetup is missing → /player/setup.html
 *   5. Injects player chip into any element with id="kg-player-slot" or .header-nav
 *   6. Fires onReady callbacks
 *   7. Exposes window.KGSession
 *
 * Music/sound override:
 *   If a game organizer sets music_override=false (stored in sessionStorage),
 *   KGSession.musicEnabled will be false regardless of player prefs.
 *   All game pages should read KGSession.musicEnabled / KGSession.soundEnabled.
 */
(function () {
  'use strict';

  // ── Avatar catalogue ──────────────────────────────────────────────
  const AVATAR_CATEGORIES = [
    {
      id: 'people', label: '👥 People', avatars: [
        { id: 'p_f_light', e: '👩🏻' }, { id: 'p_m_light', e: '👨🏻' }, { id: 'p_f_med', e: '👩🏽' }, { id: 'p_m_med', e: '👨🏽' },
        { id: 'p_f_dark', e: '👩🏿' }, { id: 'p_m_dark', e: '👨🏿' }, { id: 'p_f_tan', e: '👩🏾' }, { id: 'p_m_tan', e: '👨🏾' },
        { id: 'p_blonde_f', e: '👱‍♀️' }, { id: 'p_blonde_m', e: '👱‍♂️' }, { id: 'p_red_f', e: '👩‍🦰' }, { id: 'p_red_m', e: '👨‍🦰' },
        { id: 'p_curly_f', e: '👩‍🦱' }, { id: 'p_curly_m', e: '👨‍🦱' }, { id: 'p_silver_f', e: '👩‍🦳' }, { id: 'p_silver_m', e: '👨‍🦳' },
        { id: 'p_bald', e: '🧑‍🦲' }, { id: 'p_beard', e: '🧔' }, { id: 'ninja', e: '🥷' }, { id: 'cowboy', e: '🤠' },
        { id: 'p_mech_f', e: '👩‍🔧' }, { id: 'p_mech_m', e: '👨‍🔧' }, { id: 'p_art_f', e: '👩‍🎨' }, { id: 'p_art_m', e: '👨‍🎨' },
      ]
    },
    {
      id: 'science', label: '🔬 Science', avatars: [
        { id: 'sci_f', e: '👩‍🔬' }, { id: 'sci_m', e: '👨‍🔬' }, { id: 'robot', e: '🤖' }, { id: 'alien', e: '👽' }, { id: 'alien_px', e: '👾' },
        { id: 'dna', e: '🧬' }, { id: 'micro', e: '🔬' }, { id: 'brain', e: '🧠' }, { id: 'atom', e: '⚛️' }, { id: 'flask', e: '⚗️' }, { id: 'nerd', e: '🤓' }, { id: 'cyborg', e: '🦾' },
      ]
    },
    {
      id: 'fantasy', label: '🦄 Fantasy', avatars: [
        { id: 'wizard_f', e: '🧙‍♀️' }, { id: 'wizard_m', e: '🧙‍♂️' }, { id: 'elf_f', e: '🧝‍♀️' }, { id: 'elf_m', e: '🧝‍♂️' },
        { id: 'vampire_m', e: '🧛‍♂️' }, { id: 'vampire_f', e: '🧛‍♀️' }, { id: 'mermaid', e: '🧜‍♀️' }, { id: 'fairy', e: '🧚‍♀️' },
        { id: 'hero_f', e: '🦸‍♀️' }, { id: 'hero_m', e: '🦸‍♂️' }, { id: 'villain_f', e: '🦹‍♀️' }, { id: 'villain_m', e: '🦹‍♂️' },
        { id: 'dragon', e: '🐉' }, { id: 'unicorn', e: '🦄' }, { id: 'ghost', e: '👻' }, { id: 'skull', e: '💀' }, { id: 'crown', e: '👑' }, { id: 'crystal', e: '🔮' },
      ]
    },
    {
      id: 'sports', label: '⚽ Sports', avatars: [
        { id: 'sp_soccer', e: '⚽' }, { id: 'sp_bball', e: '🏀' }, { id: 'sp_football', e: '🏈' }, { id: 'sp_baseball', e: '⚾' },
        { id: 'sp_tennis', e: '🎾' }, { id: 'sp_hockey', e: '🏒' }, { id: 'sp_race', e: '🏎️' }, { id: 'sp_martial', e: '🥋' },
        { id: 'sp_swim', e: '🏊' }, { id: 'sp_climb', e: '🧗' }, { id: 'sp_run_f', e: '🏃‍♀️' }, { id: 'sp_run_m', e: '🏃‍♂️' },
      ]
    },
    {
      id: 'animals', label: '🦁 Animals', avatars: [
        { id: 'lion', e: '🦁' }, { id: 'tiger', e: '🐯' }, { id: 'bear', e: '🐻' }, { id: 'fox', e: '🦊' }, { id: 'wolf', e: '🐺' }, { id: 'cat', e: '😼' },
        { id: 'eagle', e: '🦅' }, { id: 'owl', e: '🦉' }, { id: 'dolphin', e: '🐬' }, { id: 'shark', e: '🦈' }, { id: 'butterfly', e: '🦋' }, { id: 'penguin', e: '🐧' },
        { id: 'panda', e: '🐼' }, { id: 'octopus', e: '🐙' }, { id: 'rabbit', e: '🐰' }, { id: 'snake', e: '🐍' },
      ]
    },
    {
      id: 'toys', label: '🎮 Toys', avatars: [
        { id: 'toy_stick', e: '🕹️' }, { id: 'toy_dice', e: '🎲' }, { id: 'toy_chess', e: '♟️' }, { id: 'toy_puzzle', e: '🧩' },
        { id: 'toy_darts', e: '🎯' }, { id: 'toy_yoyo', e: '🪀' }, { id: 'toy_teddy', e: '🧸' }, { id: 'toy_kite', e: '🪁' },
        { id: 'toy_boom', e: '🪃' }, { id: 'toy_balloon', e: '🎈' }, { id: 'toy_magic', e: '🪄' }, { id: 'toy_blocks', e: '🧱' },
      ]
    },
    {
      id: 'space', label: '🚀 Space', avatars: [
        { id: 'rocket', e: '🚀' }, { id: 'ufo', e: '🛸' }, { id: 'astro_f', e: '👩‍🚀' }, { id: 'astro_m', e: '👨‍🚀' },
        { id: 'planet', e: '🪐' }, { id: 'star', e: '⭐' }, { id: 'comet', e: '☄️' }, { id: 'moon', e: '🌙' },
        { id: 'galaxy', e: '🌌' }, { id: 'satellite', e: '🛰️' }, { id: 'telescope', e: '🔭' }, { id: 'blackhole', e: '🕳️' },
      ]
    },
    {
      id: 'hobbies', label: '🎨 Hobbies', avatars: [
        { id: 'hb_guitar', e: '🎸' }, { id: 'hb_palette', e: '🎨' }, { id: 'hb_camera', e: '📷' }, { id: 'hb_book', e: '📚' },
        { id: 'hb_gym', e: '🏋️' }, { id: 'hb_chef', e: '👨‍🍳' }, { id: 'hb_music', e: '🎵' }, { id: 'hb_drum', e: '🥁' },
        { id: 'hb_gamepad', e: '🎮' }, { id: 'hb_bike', e: '🚴' }, { id: 'hb_surf', e: '🏄' }, { id: 'hb_dart', e: '🎯' },
      ]
    },
  ];

  const AVATARS_MAP = {};
  AVATAR_CATEGORIES.forEach(cat => cat.avatars.forEach(a => { AVATARS_MAP[a.id] = a.e; }));
  // Also expose for any page that didn't load setup.html
  window.KG_AVATARS = AVATARS_MAP;

  // ── Medallion constants ───────────────────────────────────────────
  const MEDALLION_COLORS = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
    diamond: '#B9F2FF',
  };

  // ── Internal state ────────────────────────────────────────────────
  const API = '/api';
  let _readyCallbacks = [];
  let _token = null;
  let _player = null;
  let _isReady = false;

  // ── Public API ────────────────────────────────────────────────────
  const KGSession = {
    get player() { return _player; },
    get token() { return _token; },
    get isReady() { return _isReady; },

    /** Register a callback to run once player data is loaded */
    onReady(fn) {
      if (_isReady) { try { fn(_player); } catch { } }
      else { _readyCallbacks.push(fn); }
    },

    getAvatarEmoji(id) { return AVATARS_MAP[id] || '🎮'; },

    MEDALLION_COLORS,

    /** True if music is enabled for this player AND not overridden by organizer */
    get musicEnabled() {
      const override = sessionStorage.getItem('kg_music_override');
      if (override === 'false') return false;
      const pref = _player?.prefs?.music_enabled;
      return pref === undefined || pref !== 'false';
    },

    /** True if sound effects are enabled for this player */
    get soundEnabled() {
      const pref = _player?.prefs?.sound_enabled;
      return pref === undefined || pref !== 'false';
    },

    /**
     * Called by game organizers to disable/enable music for all players in a session.
     * Stores in sessionStorage so it survives page reloads within the same tab.
     */
    setMusicOverride(enabled) {
      sessionStorage.setItem('kg_music_override', enabled ? 'true' : 'false');
    },

    logout() {
      localStorage.removeItem('kg_token');
      localStorage.removeItem('kg_username');
      localStorage.removeItem('kg_userId');
      localStorage.removeItem('kg_displayName');
      sessionStorage.removeItem('kg_music_override');
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      window.location.href = isLocal ? '/login/' : 'https://kensgames.com/cdn-cgi/access/logout?returnTo=https://kensgames.com/';
    },
  };

  window.KGSession = KGSession;

  // ── Chip injection ────────────────────────────────────────────────
  function _injectChip(player) {
    // Look for explicit slot first, then fallback to .header-nav
    const slot = document.getElementById('kg-player-slot')
      || document.querySelector('.header-nav');
    if (!slot) return;

    // Avoid double-injection (either a kg-chip OR portal's own #player-chip)
    if (slot.querySelector('.kg-chip, #player-chip')) return;

    const chip = document.createElement('a');
    chip.className = 'kg-chip player-chip';
    chip.href = '/player/';
    chip.style.cssText = 'display:flex;align-items:center;gap:0.5rem;text-decoration:none;cursor:pointer;padding:0.3rem 0.75rem;border:1px solid rgba(255,255,255,0.15);border-radius:20px;transition:border-color 0.2s;';
    chip.title = 'My Profile';
    chip.onmouseenter = () => chip.style.borderColor = 'var(--c1, #0ff)';
    chip.onmouseleave = () => chip.style.borderColor = 'rgba(255,255,255,0.15)';

    const emojiSpan = document.createElement('span');
    emojiSpan.id = 'kg-chip-avatar';
    emojiSpan.style.fontSize = '1.2rem';
    emojiSpan.textContent = KGSession.getAvatarEmoji(player.avatarId);

    const nameSpan = document.createElement('span');
    nameSpan.id = 'kg-chip-name';
    nameSpan.style.cssText = 'font-size:0.78rem;color:var(--text,#fff);';
    nameSpan.textContent = player.playername || player.username;

    chip.appendChild(emojiSpan);
    chip.appendChild(nameSpan);
    slot.appendChild(chip);
  }

  // ── Main init flow ────────────────────────────────────────────────
  async function _init() {
    const isPublicPage = document.body.dataset.kgPublic === 'true';

    // 1. Try localStorage token
    _token = localStorage.getItem('kg_token');

    // 2. If no token, try Cloudflare Access bridge
    if (!_token) {
      try {
        const br = await fetch(`${API}/auth/access-session`, { credentials: 'include' });
        if (br.ok) {
          const bd = await br.json();
          if (bd.success && bd.token) {
            _token = bd.token;
            localStorage.setItem('kg_token', _token);
            if (bd.username) localStorage.setItem('kg_username', bd.username);
            if (bd.userId) localStorage.setItem('kg_userId', bd.userId);
            if (bd.displayName) localStorage.setItem('kg_displayName', bd.displayName);
          }
        }
      } catch { }
    }

    // 3. Still no token → redirect to login (unless public page)
    if (!_token) {
      if (isPublicPage) return;
      const dest = location.pathname + location.search;
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      window.location.href = isLocal
        ? `/login/?redirect=${encodeURIComponent(dest)}`
        : `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(dest)}`;
      return;
    }

    // 4. Validate token
    try {
      const vr = await fetch(`${API}/auth/validate`, { headers: { Authorization: `Bearer ${_token}` } });
      if (!vr.ok) {
        localStorage.removeItem('kg_token');
        if (!isPublicPage) { window.location.href = '/login/'; }
        return;
      }
    } catch { return; }

    // 5. Load player profile
    try {
      const pr = await fetch(`${API}/players/me`, { headers: { Authorization: `Bearer ${_token}` } });
      if (!pr.ok) return;
      _player = await pr.json();
    } catch { return; }

    // 6. If profile not set up, redirect to setup (unless already there)
    if (_player && !_player.profileSetup && !location.pathname.startsWith('/player/setup')) {
      window.location.href = '/player/setup.html';
      return;
    }

    // 7. Inject chip + fire callbacks
    if (_player) {
      _injectChip(_player);
      _isReady = true;
      _readyCallbacks.forEach(fn => { try { fn(_player); } catch { } });
      _readyCallbacks = [];
    }
  }

  // Run after DOM is ready — skip if page manages its own auth (e.g. portal.html)
  if (document.body && document.body.dataset.kgNoInit === 'true') {
    // Page handles auth/chip itself; KGSession + KG_AVATARS are still available
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body.dataset.kgNoInit !== 'true') _init();
    });
  } else {
    _init();
  }
})();
