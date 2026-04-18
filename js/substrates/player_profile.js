/**
 * KensGames — Universal Player Profile (Name + Avatar)
 *
 * Uses localStorage:
 *   - display_name (preferred)
 *   - username (fallback/compat)
 *   - kg_avatar (via AvatarPicker)
 *
 * Include on any page:
 *   <script src="/js/substrates/avatar_picker.js" defer></script>
 *   <script src="/js/substrates/player_profile.js" defer></script>
 *
 * Optional:
 *   - Add an element with id="kg-player" to render the badge.
 *   - Add data-profile-required="true" to force profile selection.
 */

const KGPlayerProfile = (() => {
  const NAME_KEY = 'display_name';
  const USERNAME_KEY = 'username';

  function safeLocalStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeLocalStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }

  function getName() {
    const displayName = (safeLocalStorageGet(NAME_KEY) || '').trim();
    if (displayName) return displayName;
    const username = (safeLocalStorageGet(USERNAME_KEY) || '').trim();
    return username || null;
  }

  function setName(name) {
    const cleaned = String(name || '').trim().slice(0, 20);
    if (!cleaned) return;
    safeLocalStorageSet(NAME_KEY, cleaned);
    // Back-compat: many games look at `username`
    const existingUsername = (safeLocalStorageGet(USERNAME_KEY) || '').trim();
    if (!existingUsername) safeLocalStorageSet(USERNAME_KEY, cleaned);
  }

  function getAvatar() {
    if (typeof AvatarPicker === 'undefined' || !AvatarPicker.get) return null;
    return AvatarPicker.get();
  }

  function hasAvatar() {
    if (typeof AvatarPicker === 'undefined' || !AvatarPicker.has) return false;
    return AvatarPicker.has();
  }

  function hasName() {
    return !!getName();
  }

  function buildNameModal() {
    if (document.getElementById('kg-name-modal')) return;

    const div = document.createElement('div');
    div.id = 'kg-name-modal';
    div.innerHTML = `
<div id="kg-name-overlay" style="display:none;position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);align-items:center;justify-content:center;">
  <div style="background:rgba(4,4,20,.97);border:2px solid #00FFFF;box-shadow:0 0 24px #00FFFF,0 0 48px #00FFFF;border-radius:6px;padding:28px;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;position:relative;">
    <div style="font-family:'Orbitron',monospace;font-size:18px;color:#00FFFF;text-shadow:0 0 24px #00FFFF;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Player Profile</div>
    <div id="kg-name-req" style="font-size:12px;color:#FF00FF;margin-bottom:16px;display:none;">You must choose a player name to continue.</div>

    <label for="kg-player-name" style="display:block;font-family:'Orbitron',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8888AA;margin-bottom:6px;">Player Name</label>
    <input id="kg-player-name" type="text" maxlength="20" autocomplete="off"
      style="width:100%;padding:12px 12px;background:rgba(0,255,255,.06);border:1px solid rgba(0,255,255,.25);border-radius:4px;color:#E0E0FF;font-size:14px;letter-spacing:1px;outline:none;" />
    <div style="margin-top:10px;font-size:11px;color:#8888AA;">This name is used across KensGames and shared into games.</div>

    <div style="display:flex;gap:10px;margin-top:18px;">
      <button id="kg-name-confirm" style="flex:1;padding:12px;font-family:'Orbitron',monospace;font-size:12px;letter-spacing:2px;background:#00FFFF;color:#04040C;border:none;border-radius:3px;cursor:pointer;text-transform:uppercase;font-weight:900;box-shadow:0 0 18px #00FFFF;" disabled>Confirm Name</button>
      <button id="kg-name-avatar" style="padding:12px 14px;font-family:'Orbitron',monospace;font-size:12px;letter-spacing:2px;background:rgba(0,255,255,.08);color:#00FFFF;border:1px solid rgba(0,255,255,.25);border-radius:3px;cursor:pointer;text-transform:uppercase;font-weight:900;">Avatar</button>
    </div>

    <button id="kg-name-close" style="position:absolute;top:12px;right:16px;background:none;border:none;color:#8888AA;font-size:22px;cursor:pointer;">×</button>
  </div>
</div>`;

    document.body.appendChild(div);

    const input = document.getElementById('kg-player-name');
    const confirm = document.getElementById('kg-name-confirm');

    function update() {
      const v = (input.value || '').trim();
      confirm.disabled = v.length < 2;
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirm.disabled) {
        confirm.click();
      }
    });

    update();
  }

  function showNameModal(required, onDone) {
    buildNameModal();

    const overlay = document.getElementById('kg-name-overlay');
    const input = document.getElementById('kg-player-name');
    const req = document.getElementById('kg-name-req');
    const close = document.getElementById('kg-name-close');
    const confirm = document.getElementById('kg-name-confirm');
    const avatar = document.getElementById('kg-name-avatar');

    req.style.display = required ? 'block' : 'none';
    close.style.display = required ? 'none' : 'block';

    input.value = getName() || '';
    confirm.disabled = (input.value || '').trim().length < 2;

    function cleanup() {
      confirm.onclick = null;
      close.onclick = null;
      avatar.onclick = null;
    }

    close.onclick = () => {
      if (required) return;
      overlay.style.display = 'none';
      cleanup();
    };

    avatar.onclick = () => {
      if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
        AvatarPicker.show(() => {
          // no-op; caller will re-render
        }, false);
      }
    };

    confirm.onclick = () => {
      const v = (input.value || '').trim();
      if (v.length < 2) return;
      setName(v);
      overlay.style.display = 'none';
      cleanup();
      if (onDone) onDone(getName());
    };

    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
  }

  function ensure(required, onReady) {
    const needAvatar = !hasAvatar();
    const needName = !hasName();

    const done = () => {
      if (onReady) onReady({ name: getName(), avatar: getAvatar() });
    };

    // Avatar first (since existing portal already expects it), then name.
    if (needAvatar) {
      if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
        AvatarPicker.show(() => {
          if (needName || !hasName()) {
            showNameModal(required, () => done());
          } else {
            done();
          }
        }, required);
      } else {
        // If AvatarPicker isn't loaded, at least enforce name.
        if (needName) showNameModal(required, () => done());
        else done();
      }
      return;
    }

    if (needName) {
      showNameModal(required, () => done());
      return;
    }

    done();
  }

  function editName(onDone) {
    showNameModal(false, () => {
      if (onDone) onDone({ name: getName(), avatar: getAvatar() });
    });
  }

  function editAvatar(onDone) {
    if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
      AvatarPicker.show(() => {
        if (onDone) onDone({ name: getName(), avatar: getAvatar() });
      }, false);
    }
  }

  function renderBadge(containerEl, options) {
    if (!containerEl) return;
    const name = getName() || 'Player';
    const av = getAvatar();
    const emoji = av && av.emoji ? av.emoji : '🎮';

    const showLogout = !!(options && options.showLogout);

    containerEl.innerHTML = `
<div class="kg-player-pill" style="display:flex;align-items:center;gap:10px;">
  <span class="kg-player-avatar" style="font-size:22px;line-height:1;">${emoji}</span>
  <span class="kg-player-name" style="font-size:13px;font-weight:700;letter-spacing:0.5px;white-space:nowrap;">${escapeHtml(name)}</span>
</div>`;

    const pill = containerEl.querySelector('.kg-player-pill');
    if (pill) {
      pill.style.cursor = 'pointer';
      pill.title = 'Edit player profile';
      pill.addEventListener('click', () => {
        // Allow changing name without blocking.
        showNameModal(false, () => renderBadge(containerEl, options));
      });
      pill.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (typeof AvatarPicker !== 'undefined' && AvatarPicker.show) {
          AvatarPicker.show(() => renderBadge(containerEl, options), false);
        }
      });
    }

    if (showLogout) {
      // reserved for future; logout is handled by access_status.js
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function autoAttach() {
    const el = document.getElementById('kg-player');
    if (!el) return;

    const required = String(el.dataset.profileRequired || '').toLowerCase() === 'true';
    ensure(required, () => {
      renderBadge(el);
    });
  }

  return {
    getName,
    setName,
    hasName,
    getAvatar,
    hasAvatar,
    ensure,
    editName,
    editAvatar,
    renderBadge,
    autoAttach,
  };
})();

// Make available for inline scripts.
window.KGPlayerProfile = KGPlayerProfile;

document.addEventListener('DOMContentLoaded', () => {
  KGPlayerProfile.autoAttach();
});
