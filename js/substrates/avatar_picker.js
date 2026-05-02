/**
 * KensGames — Universal Avatar Picker
 * Include on any page: <script src="/js/substrates/avatar_picker.js"></script>
 *
 * API:
 *   AvatarPicker.show(onSelect, required)  — open picker modal
 *   AvatarPicker.get()                     — get saved avatar {id,emoji,name}
 *   AvatarPicker.has()                     — true if avatar saved
 *   AvatarPicker.requireBeforeGame(path)   — check avatar, redirect if missing
 *   AvatarPicker.renderBadge(el)           — render avatar badge into element
 */

const AvatarPicker = (() => {
    const KEY = 'kg_avatar';
    const RESERVED_BOT_AVATAR_TOKENS = new Set(['🤖', 'robot', 'scifi_robot', 'custom_🤖', 'faces_🤖']);

    const CATS = [
        {
            id: 'people', label: 'People', emojis: [
                // Skin-tone diversity — person (neutral gender), all 5 tones
                ['🧑🏻', 'Person Light'], ['🧑🏼', 'Person Med-Light'], ['🧑🏽', 'Person Medium'], ['🧑🏾', 'Person Med-Dark'], ['🧑🏿', 'Person Dark'],
                // Man, all 5 tones
                ['👨🏻', 'Man Light'], ['👨🏼', 'Man Med-Light'], ['👨🏽', 'Man Medium'], ['👨🏾', 'Man Med-Dark'], ['👨🏿', 'Man Dark'],
                // Woman, all 5 tones
                ['👩🏻', 'Woman Light'], ['👩🏼', 'Woman Med-Light'], ['👩🏽', 'Woman Medium'], ['👩🏾', 'Woman Med-Dark'], ['👩🏿', 'Woman Dark'],
                // Boy, 3 representative tones
                ['👦🏻', 'Boy Light'], ['👦🏽', 'Boy Medium'], ['👦🏿', 'Boy Dark'],
                // Girl, 3 representative tones
                ['👧🏻', 'Girl Light'], ['👧🏽', 'Girl Medium'], ['👧🏿', 'Girl Dark'],
                // Elder, 3 representative tones
                ['🧓🏻', 'Elder Light'], ['🧓🏽', 'Elder Medium'], ['🧓🏿', 'Elder Dark'],
                // Roles (tone-neutral)
                ['🧑‍💻', 'Coder'], ['🧑‍🎤', 'Rockstar'], ['🧑‍🎨', 'Artist'], ['🧑‍🚀', 'Astronaut'], ['🧑‍🏫', 'Teacher'],
            ]
        },
        {
            id: 'faces', label: 'Faces', emojis: [
                ['😊', 'Smiling'], ['😎', 'Cool'], ['🤩', 'Star'], ['🥳', 'Party'], ['😤', 'Determined'],
                ['🤔', 'Thinker'], ['🤓', 'Nerd'], ['😏', 'Slick'], ['😈', 'Villain'], ['👾', 'Alien Blob'],
                ['💀', 'Skull'], ['🎭', 'Drama'], ['👻', 'Ghost'], ['🎃', 'Jack-O'],
                ['🥸', 'Disguise'], ['🤠', 'Cowboy'], ['🥶', 'Frozen'], ['🤯', 'Mind Blown'], ['😤', 'Fierce'],
            ]
        },
        {
            id: 'animals', label: 'Animals', emojis: [
                ['🐺', 'Wolf'], ['🦊', 'Fox'], ['🐯', 'Tiger'], ['🦁', 'Lion'], ['🐲', 'Dragon'],
                ['🦅', 'Eagle'], ['🦉', 'Owl'], ['🦈', 'Shark'], ['🐬', 'Dolphin'], ['🦋', 'Butterfly'],
                ['🐸', 'Frog'], ['🦎', 'Lizard'], ['🐙', 'Octopus'], ['🦑', 'Squid'], ['🦂', 'Scorpion'],
                ['🐻', 'Bear'], ['🦊', 'Fox'], ['🐼', 'Panda'], ['🦜', 'Parrot'], ['🦖', 'Dino'],
            ]
        },
        {
            id: 'space', label: 'Space', emojis: [
                ['🚀', 'Rocket'], ['👽', 'Alien'], ['🛸', 'UFO'], ['⭐', 'Star'], ['🌙', 'Moon'],
                ['☄️', 'Comet'], ['🌌', 'Galaxy'], ['🛰️', 'Satellite'], ['🔭', 'Observer'], ['💫', 'Shooting Star'],
                ['🌠', 'Wish'], ['🪐', 'Planet'], ['🌑', 'Dark Moon'], ['⚡', 'Lightning'], ['🌟', 'Bright Star'],
            ]
        },
        {
            id: 'warriors', label: 'Warriors', emojis: [
                ['🧙', 'Wizard'], ['🧝', 'Elf'], ['🧛', 'Vampire'], ['🧟', 'Zombie'], ['🥷', 'Ninja'],
                ['🤺', 'Fencer'], ['🧜', 'Mermaid'], ['🦸', 'Hero'], ['🦹', 'Villain'], ['🧚', 'Fairy'],
                ['👑', 'Crown'], ['🎯', 'Archer'], ['⚔️', 'Swords'], ['🛡️', 'Shield'], ['🏹', 'Bow'],
            ]
        },
        {
            id: 'retro', label: 'Retro', emojis: [
                ['🎮', 'Controller'], ['🕹️', 'Joystick'], ['👾', 'Invader'], ['🎲', 'Dice'], ['🃏', 'Joker'],
                ['♟️', 'Chess'], ['🎯', 'Target'], ['🏆', 'Trophy'], ['🎰', 'Slots'], ['🎳', 'Bowling'],
                ['🎪', 'Carnival'], ['🎱', '8-Ball'], ['🎭', 'Masks'], ['🎨', 'Artist'], ['🧩', 'Puzzle'],
            ]
        },
    ];

    function findByIdOrName(id, name) {
        for (const cat of CATS) {
            for (const [emoji, label] of cat.emojis) {
                if (`${cat.id}_${emoji}` === id) return { id: `${cat.id}_${emoji}`, emoji, name: label };
                if (name && String(name).toLowerCase() === String(label).toLowerCase()) {
                    return { id: `${cat.id}_${emoji}`, emoji, name: label };
                }
            }
        }
        return null;
    }

    function get() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
        if (!raw || typeof raw !== 'object') return null;

        const id = raw.id ? String(raw.id) : '';
        const emoji = raw.emoji ? String(raw.emoji) : '';
        const name = raw.name ? String(raw.name) : '';

        if (RESERVED_BOT_AVATAR_TOKENS.has(id) || RESERVED_BOT_AVATAR_TOKENS.has(emoji)) {
            const fallback = { id: 'faces_😊', emoji: '😊', name: 'Smiling' };
            try { localStorage.setItem(KEY, JSON.stringify(fallback)); } catch { /* ignore */ }
            return fallback;
        }

        // A valid emoji avatar should not be plain alphabetic text.
        const looksLikeWord = emoji && /^[A-Za-z\s\-]+$/.test(emoji);
        if (!emoji || looksLikeWord) {
            const fixed = findByIdOrName(id, name || emoji);
            if (fixed) {
                try { localStorage.setItem(KEY, JSON.stringify(fixed)); } catch { /* ignore */ }
                return fixed;
            }
            return null;
        }

        return { id: id || `custom_${emoji}`, emoji, name: name || emoji };
    }
    function has() { return !!get(); }
    function save(avatar) { localStorage.setItem(KEY, JSON.stringify(avatar)); }

    function buildModal() {
        if (document.getElementById('av-modal')) return;
        const div = document.createElement('div');
        div.id = 'av-modal';
        div.innerHTML = `
<div id="av-overlay" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);align-items:center;justify-content:center;">
    <div style="background:rgba(4,4,20,.97);border:2px solid #00FFFF;box-shadow:0 0 24px #00FFFF,0 0 48px #00FFFF;border-radius:6px;padding:18px;width:100%;max-width:540px;height:min(96dvh,96vh);overflow:hidden;position:relative;display:flex;flex-direction:column;">
    <div style="font-family:'Orbitron',monospace;font-size:18px;color:#00FFFF;text-shadow:0 0 24px #00FFFF;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">&#127917; Choose Your Avatar</div>
    <div id="av-req-msg" style="font-size:12px;color:#FF00FF;margin-bottom:16px;display:none;">You must choose an avatar to enter the game.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;" id="av-cats"></div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px;" id="av-grid"></div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(0,255,255,.06);border:1px solid rgba(0,255,255,.2);border-radius:4px;margin-bottom:10px;">
            <span id="av-preview" style="font-size:30px;">?</span>
      <div>
        <div id="av-preview-name" style="font-family:'Orbitron',monospace;font-size:13px;color:#00FFFF;text-transform:uppercase;">No avatar selected</div>
        <div style="font-size:11px;color:#8888AA;">Click an avatar above to preview</div>
      </div>
    </div>
    <button id="av-confirm" onclick="AvatarPicker._confirm()" style="width:100%;padding:11px;font-family:'Orbitron',monospace;font-size:12px;letter-spacing:2px;background:#00FFFF;color:#04040C;border:none;border-radius:3px;cursor:pointer;text-transform:uppercase;font-weight:900;box-shadow:0 0 24px #00FFFF;" disabled>&#9654; CONFIRM AVATAR</button>
    <button id="av-close" onclick="AvatarPicker._close()" style="position:absolute;top:14px;right:18px;background:none;border:none;color:#8888AA;font-size:22px;cursor:pointer;">&#10005;</button>
  </div>
</div>`;
        document.body.appendChild(div);
        renderCats('faces');
    }

    function renderCats(activeId) {
        const el = document.getElementById('av-cats');
        el.innerHTML = CATS.map(c => `
            <button data-cat="${c.id}"
                style="font-family:'Orbitron',monospace;font-size:9px;letter-spacing:1px;padding:6px 12px;
                border:1px solid ${activeId === c.id ? '#00FFFF' : '#334466'};border-radius:2px;
                background:${activeId === c.id ? 'rgba(0,255,255,.15)' : 'transparent'};
                color:${activeId === c.id ? '#00FFFF' : '#8888AA'};cursor:pointer;text-transform:uppercase;">
                ${c.label}</button>`).join('');
        // Use event delegation — no inline onclick so category ids stay clean
        el.querySelectorAll('button[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => AvatarPicker._cat(btn.getAttribute('data-cat')));
        });
        renderGrid(activeId);
    }

    function renderGrid(catId) {
        const cat = CATS.find(c => c.id === catId);
        const el = document.getElementById('av-grid');
        // Emoji goes in DOM text content (not HTML attribute) to preserve
        // variation selectors (U+FE0F) and ZWJ sequences perfectly.
        el.innerHTML = cat.emojis.map((pair, i) => `
            <button data-idx="${i}" title="${pair[1]}"
                style="font-size:28px;padding:10px;background:rgba(0,255,255,.04);
                border:1px solid rgba(0,255,255,.15);border-radius:4px;cursor:pointer;
                transition:all .15s;"
                onmouseover="this.style.background='rgba(0,255,255,.15)';this.style.borderColor='#00FFFF'"
                onmouseout="this.style.background='rgba(0,255,255,.04)';this.style.borderColor='rgba(0,255,255,.15)'">${pair[0]}</button>`).join('');
        // Attach click handlers after render so emoji identity is read from the array, not the attribute
        el.querySelectorAll('button[data-idx]').forEach(btn => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            const [e, n] = cat.emojis[idx];
            btn.addEventListener('click', () => AvatarPicker._pick(catId, e, n));
        });
    }

    let _selected = null, _onSelect = null, _required = false;

    return {
        get, has, save,
        show(onSelect, required = false) {
            buildModal();
            _onSelect = onSelect; _required = required; _selected = null;
            document.getElementById('av-req-msg').style.display = required ? 'block' : 'none';
            document.getElementById('av-close').style.display = required ? 'none' : 'block';
            document.getElementById('av-preview').textContent = '?';
            document.getElementById('av-preview-name').textContent = 'No avatar selected';
            document.getElementById('av-confirm').disabled = true;
            const ov = document.getElementById('av-overlay');
            ov.style.display = 'flex';
        },
        _close() { document.getElementById('av-overlay').style.display = 'none'; },
        _cat(id) { renderCats(id); },
        _pick(cat, emoji, name) {
            _selected = { id: `${cat}_${emoji}`, emoji, name };
            document.getElementById('av-preview').textContent = emoji;
            document.getElementById('av-preview-name').textContent = name;
            document.getElementById('av-confirm').disabled = false;
        },
        _confirm() {
            if (!_selected) return;
            save(_selected);
            this._close();
            if (_onSelect) _onSelect(_selected);
        },
        requireBeforeGame(gamePath) {
            if (this.has()) {
                window.location.href = gamePath;
            } else {
                this.show((av) => { window.location.href = gamePath; }, true);
            }
        },
        renderBadge(containerEl) {
            const av = this.get();
            if (!containerEl) return;
            containerEl.innerHTML = av
                ? `<div class="arc-avatar" title="${av.name}" onclick="AvatarPicker.show(null,false)" style="font-size:26px">${av.emoji}</div>`
                : `<div class="arc-avatar" title="Choose Avatar" onclick="AvatarPicker.show(null,false)" style="font-size:18px;color:#FF00FF">?</div>`;
        }
    };
})();
