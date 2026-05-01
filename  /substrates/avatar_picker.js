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

    const CATS = [
        { id:'faces',  label:'Faces',   emojis:[
            ['😊','Smiling'],['😎','Cool'],['🤩','Star'],['🥳','Party'],['😤','Determined'],
            ['🤔','Thinker'],['🤓','Nerd'],['😏','Slick'],['😈','Villain'],['👾','Alien Blob'],
            ['🤖','Robot'],['💀','Skull'],['🎭','Drama'],['👻','Ghost'],['🎃','Jack-O'],
        ]},
        { id:'animals', label:'Animals', emojis:[
            ['🐺','Wolf'],['🦊','Fox'],['🐯','Tiger'],['🦁','Lion'],['🐲','Dragon'],
            ['🦅','Eagle'],['🦉','Owl'],['🦈','Shark'],['🐬','Dolphin'],['🦋','Butterfly'],
            ['🐸','Frog'],['🦎','Lizard'],['🐙','Octopus'],['🦑','Squid'],['🦂','Scorpion'],
        ]},
        { id:'space',   label:'Space',   emojis:[
            ['🚀','Rocket'],['👽','Alien'],['🛸','UFO'],['⭐','Star'],['🌙','Moon'],
            ['☄️','Comet'],['🌌','Galaxy'],['🛰️','Satellite'],['🔭','Observer'],['💫','Shooting Star'],
            ['🌠','Wish'],['🪐','Planet'],['🌑','Dark Moon'],['⚡','Lightning'],['🌟','Bright Star'],
        ]},
        { id:'warriors',label:'Warriors',emojis:[
            ['🧙','Wizard'],['🧝','Elf'],['🧛','Vampire'],['🧟','Zombie'],['🥷','Ninja'],
            ['🤺','Fencer'],['🧜','Mermaid'],['🦸','Hero'],['🦹','Villain'],['🧚','Fairy'],
            ['👑','King'],['🎯','Archer'],['⚔️','Swords'],['🛡️','Shield'],['🏹','Bow'],
        ]},
        { id:'retro',   label:'Retro',   emojis:[
            ['🎮','Controller'],['🕹️','Joystick'],['👾','Invader'],['🎲','Dice'],['🃏','Joker'],
            ['♟️','Chess'],['🎯','Target'],['🏆','Trophy'],['🎰','Slots'],['🎳','Bowling'],
            ['🎪','Carnival'],['🃏','Wild Card'],['🎱','8-Ball'],['🎭','Masks'],['🎨','Artist'],
        ]},
    ];

    function get() {
        try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
    }
    function has() { return !!get(); }
    function save(avatar) { localStorage.setItem(KEY, JSON.stringify(avatar)); }

    function buildModal() {
        if (document.getElementById('av-modal')) return;
        const div = document.createElement('div');
        div.id = 'av-modal';
        div.innerHTML = `
<div id="av-overlay" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.9);backdrop-filter:blur(8px);align-items:center;justify-content:center;">
  <div style="background:rgba(4,4,20,.97);border:2px solid #00FFFF;box-shadow:0 0 24px #00FFFF,0 0 48px #00FFFF;border-radius:6px;padding:36px;width:100%;max-width:540px;max-height:88vh;overflow-y:auto;position:relative;">
    <div style="font-family:'Orbitron',monospace;font-size:18px;color:#00FFFF;text-shadow:0 0 24px #00FFFF;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">&#127917; Choose Your Avatar</div>
    <div id="av-req-msg" style="font-size:12px;color:#FF00FF;margin-bottom:16px;display:none;">You must choose an avatar to enter the game.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;" id="av-cats"></div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px;" id="av-grid"></div>
    <div style="display:flex;align-items:center;gap:14px;padding:14px;background:rgba(0,255,255,.06);border:1px solid rgba(0,255,255,.2);border-radius:4px;margin-bottom:16px;">
      <span id="av-preview" style="font-size:40px;">?</span>
      <div>
        <div id="av-preview-name" style="font-family:'Orbitron',monospace;font-size:13px;color:#00FFFF;text-transform:uppercase;">No avatar selected</div>
        <div style="font-size:11px;color:#8888AA;">Click an avatar above to preview</div>
      </div>
    </div>
    <button id="av-confirm" onclick="AvatarPicker._confirm()" style="width:100%;padding:14px;font-family:'Orbitron',monospace;font-size:13px;letter-spacing:2px;background:#00FFFF;color:#04040C;border:none;border-radius:3px;cursor:pointer;text-transform:uppercase;font-weight:900;box-shadow:0 0 24px #00FFFF;" disabled>&#9654; CONFIRM AVATAR</button>
    <button id="av-close" onclick="AvatarPicker._close()" style="position:absolute;top:14px;right:18px;background:none;border:none;color:#8888AA;font-size:22px;cursor:pointer;">&#10005;</button>
  </div>
</div>`;
        document.body.appendChild(div);
        renderCats('faces');
    }

    function renderCats(activeId) {
        const el = document.getElementById('av-cats');
        el.innerHTML = CATS.map(c => `
            <button onclick="AvatarPicker._cat('${c.id}')"
                style="font-family:'Orbitron',monospace;font-size:9px;letter-spacing:1px;padding:6px 12px;
                border:1px solid ${activeId===c.id?'#00FFFF':'#334466'};border-radius:2px;
                background:${activeId===c.id?'rgba(0,255,255,.15)':'transparent'};
                color:${activeId===c.id?'#00FFFF':'#8888AA'};cursor:pointer;text-transform:uppercase;">
                ${c.label}</button>`).join('');
        renderGrid(activeId);
    }

    function renderGrid(catId) {
        const cat = CATS.find(c => c.id === catId);
        const el = document.getElementById('av-grid');
        el.innerHTML = cat.emojis.map(([e, n]) => `
            <button onclick="AvatarPicker._pick('${catId}','${e}','${n}')"
                title="${n}"
                style="font-size:28px;padding:10px;background:rgba(0,255,255,.04);
                border:1px solid rgba(0,255,255,.15);border-radius:4px;cursor:pointer;
                transition:all .15s;"
                onmouseover="this.style.background='rgba(0,255,255,.15)';this.style.borderColor='#00FFFF'"
                onmouseout="this.style.background='rgba(0,255,255,.04)';this.style.borderColor='rgba(0,255,255,.15)'">
                ${e}</button>`).join('');
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
