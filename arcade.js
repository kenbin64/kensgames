/* ═══════════════════════════════════════════════════════════════
   KEN'S ARCADE — Main Lobby Logic
   z = player * session (the saddle invocation)
   ═══════════════════════════════════════════════════════════════ */

const LOBBY_WS = location.protocol === 'https:'
    ? `wss://${location.host}/ws`
    : `ws://${location.hostname}:8765`;

// Fallback game table — overwritten at runtime by loadRegistry()
const GAMES = {
    fasttrack: { title: 'FastTrack', url: '/fasttrack/lobby.html', multiplayer: true },
    brickbreaker3d: { title: 'BrickBreaker 3D', url: '/brickbreaker3d/index.html', multiplayer: true },
    starfighter: { title: 'StarFighter', url: '/starfighter/index.html', multiplayer: false },
    '4dtictactoe': { title: '4D TicTacToe', url: '/4DTicTacToe/index.html', multiplayer: true },
    cubic3d: { title: 'Cubic', url: '/cubic3d/index.html', multiplayer: false },
};

// ── MANIFOLD REGISTRY ─────────────────────────────────────────
// Fetches /js/manifold.registry.json (emitted by the Manifold Compiler)
// and merges live game data (dimension, version, status) into GAMES.
async function loadRegistry() {
    try {
        const res = await fetch('/js/manifold.registry.json', { cache: 'no-cache' });
        if (!res.ok) return;
        const reg = await res.json();
        (reg.games || []).forEach(g => {
            const url = '/' + g.path + (g.lobby || g.entry);
            GAMES[g.id] = {
                title: g.name,
                url,
                multiplayer: g.dimension && g.dimension.x > 1,
                version: g.version,
                dimension: g.dimension,
                status: g.status,
            };
        });
        window.__PORTAL_REGISTRY__ = reg;
    } catch (e) {
        console.warn('[Arcade] Registry load failed, using fallback GAMES table.', e);
    }
}

const AVATARS = [
    '🦊', '🐺', '🦁', '🐯', '🐻', '🐼', '🦄', '🐲',
    '🦅', '🐬', '🦋', '🎭', '🤖', '👾', '🧙', '🐉',
    '🦇', '🦈', '🐙', '🦎', '🔥', '⚡', '🌊', '💎'
];
const DEFAULT_AVATAR = '🦊';

let currentUser = null;   // { username, email, token, avatar }
let selectedGame = null;
let selectedAvatar = null;
let pendingAvatar = null;  // Used during avatar picker
let ws = null;

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Load manifold registry first, then restore session
    loadRegistry().then(() => {
        const saved = localStorage.getItem('arcade_user');
        if (saved) {
            try { currentUser = JSON.parse(saved); updateUI(); }
            catch (e) { localStorage.removeItem('arcade_user'); }
        }
        updateAuthButtons();
        populateAvatars();
        connectLobby();
    });
});

// ── AUTH ──────────────────────────────────────────────────────
function showAuth(mode) {
    document.getElementById('auth-modal').classList.remove('hidden');
    const isRegister = mode === 'register';
    document.getElementById('auth-title').textContent = isRegister ? 'REGISTER' : 'SIGN IN';
    document.getElementById('auth-email-row').classList.toggle('hidden', !isRegister);
    document.getElementById('auth-confirm-row').classList.toggle('hidden', !isRegister);
    document.getElementById('auth-submit').textContent = isRegister ? 'CREATE ACCOUNT' : 'START';
    document.getElementById('auth-toggle').innerHTML = isRegister
        ? 'Already have an account? <u>Sign In</u>'
        : 'New player? <u>Register Free</u>';
    document.getElementById('auth-toggle').onclick = () => showAuth(isRegister ? 'signin' : 'register');
    // Show "Forgot Password?" only on sign-in
    document.getElementById('auth-forgot').classList.toggle('hidden', isRegister);
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-form').dataset.mode = mode;
}

function hideAuth() { document.getElementById('auth-modal').classList.add('hidden'); }

// ── Password Recovery ────────────────────────────────────────
function showRecover() {
    hideAuth();
    document.getElementById('recover-modal').classList.remove('hidden');
    document.getElementById('recover-step1').classList.remove('hidden');
    document.getElementById('recover-step2').classList.add('hidden');
    document.getElementById('recover-error').classList.add('hidden');
}
function hideRecover() { document.getElementById('recover-modal').classList.add('hidden'); }

function requestReset(e) {
    e.preventDefault();
    const identifier = document.getElementById('recover-email').value.trim();
    if (!identifier) return;
    sendWS({ type: 'request_reset', identifier });
}

function submitReset(e) {
    e.preventDefault();
    const code = document.getElementById('recover-code').value.trim().toUpperCase();
    const newPass = document.getElementById('recover-newpass').value;
    const confirm = document.getElementById('recover-confirm').value;
    const errEl = document.getElementById('recover-error');
    if (newPass !== confirm) {
        errEl.textContent = 'PASSWORDS DO NOT MATCH';
        errEl.classList.remove('hidden');
        return;
    }
    sendWS({ type: 'reset_password', code, new_password: newPass });
}

function handleAuth(e) {
    e.preventDefault();
    const mode = document.getElementById('auth-form').dataset.mode;
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');

    if (mode === 'register') {
        const email = document.getElementById('auth-email').value.trim();
        const confirm = document.getElementById('auth-confirm').value;
        if (password !== confirm) {
            errEl.textContent = 'PASSWORDS DO NOT MATCH';
            errEl.classList.remove('hidden');
            return;
        }
        sendWS({ type: 'register', username, email, password });
    } else {
        sendWS({ type: 'login', username, password });
    }
}

function signOut() {
    currentUser = null;
    localStorage.removeItem('arcade_user');
    updateAuthButtons();
    updateUI();
    sendWS({ type: 'logout' });
}

function updateAuthButtons() {
    const signedIn = !!currentUser;
    document.getElementById('btn-signin').classList.toggle('hidden', signedIn);
    document.getElementById('btn-register').classList.toggle('hidden', signedIn);
    document.getElementById('btn-profile').classList.toggle('hidden', !signedIn);
    document.getElementById('btn-signout').classList.toggle('hidden', !signedIn);
    // Admin button — only visible to admin/superuser
    const isAdmin = signedIn && (currentUser.role === 'admin' || currentUser.role === 'superuser');
    document.getElementById('btn-admin').classList.toggle('hidden', !isAdmin);
    document.getElementById('player-status').innerHTML = signedIn
        ? `<span style="color:var(--green)">▶ ${currentUser.username}</span>`
        : '<span class="blink">▶</span> INSERT COIN';
    // Lock/unlock multiplayer buttons
    document.querySelectorAll('.requires-auth').forEach(btn => {
        btn.classList.toggle('locked', !signedIn);
    });
}

function updateUI() { updateAuthButtons(); showCorrectPage(); }
function showProfile() { /* TODO: profile modal */ }

// ── PAGE NAVIGATION ──────────────────────────────────────────
function showCorrectPage() {
    const landing = document.getElementById('page-landing');
    const lobby = document.getElementById('page-lobby');
    const gameLobby = document.getElementById('page-game-lobby');
    if (!landing) return;
    // If signed in → main lobby. Else → landing page.
    if (currentUser && lobby) {
        landing.classList.add('hidden');
        lobby.classList.remove('hidden');
        if (gameLobby) gameLobby.classList.add('hidden');
        // Populate lobby with user data
        const nameEl = document.getElementById('lobby-username');
        if (nameEl) nameEl.textContent = currentUser.username;
        const avatarEl = document.getElementById('lobby-avatar');
        if (avatarEl) avatarEl.textContent = getUserAvatar();
    } else {
        landing.classList.remove('hidden');
        if (lobby) lobby.classList.add('hidden');
        if (gameLobby) gameLobby.classList.add('hidden');
    }
}

function openGameLobby(gameId) {
    selectedGame = gameId;
    const game = GAMES[gameId];
    if (!game) return;
    document.getElementById('page-lobby').classList.add('hidden');
    document.getElementById('page-game-lobby').classList.remove('hidden');
    document.getElementById('gl-title').textContent = game.title;
}

function backToLobby() {
    document.getElementById('page-game-lobby').classList.add('hidden');
    document.getElementById('page-lobby').classList.remove('hidden');
}

// ── CONSOLE GAME LAUNCH ──────────────────────────────────────
// BrickBreaker 3D — free, no sign-in needed
function playBrickBreaker() {
    const game = GAMES['brickbreaker3d'];
    if (!game) return;
    window.location.href = game.url + '?mode=solo';
}

// Fast Track — always go to the billiard lobby
function playFastTrack() {
    window.location.href = '/fasttrack/lobby.html';
}

function hideFTGuest() {
    const el = document.getElementById('ft-guest-modal');
    if (el) el.classList.add('hidden');
}

function playFastTrackAI() {
    window.location.href = '/fasttrack/lobby.html';
}

// ── GAME LOBBY ACTIONS ───────────────────────────────────────
let preferredPlayers = 3;
let aiDifficulty = 'medium';
let aiCount = 1;

function setPreferred(n) {
    preferredPlayers = n;
    document.querySelectorAll('.gl-player-select .gl-num').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}
function setDifficulty(d) {
    aiDifficulty = d;
    // Toggle active in the difficulty row
    const btns = event.target.parentElement.querySelectorAll('.gl-num');
    btns.forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}
function setAICount(n) {
    aiCount = n;
    const btns = event.target.parentElement.querySelectorAll('.gl-num');
    btns.forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

function startMatchmaking() {
    sendWS({ type: 'matchmake', game: selectedGame, preferred_players: preferredPlayers });
    const status = document.getElementById('mm-status');
    if (status) status.classList.remove('hidden');
}

function createPrivateGame() {
    const code = generateInviteCode();
    sendWS({ type: 'create_session', game: selectedGame, is_private: true, code });
}

function joinWithCode() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) return;
    sendWS({ type: 'join_session', code });
}

function startAIGame() {
    if (!selectedGame) return;
    // Go directly to the 3D board — no lobby needed for AI
    window.location.href = `/fasttrack/3d.html?offline=true&ai_players=${aiCount}&ai_level=${aiDifficulty}`;
}

function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ── AVATAR SYSTEM ────────────────────────────────────────────
function getUserAvatar() {
    if (currentUser && currentUser.avatar) return currentUser.avatar;
    return DEFAULT_AVATAR;
}

function showAvatarPicker() {
    pendingAvatar = getUserAvatar();
    populateAvatarGrid('avatar-grid', pendingAvatar);
    document.getElementById('avatar-modal').classList.remove('hidden');
}

function hideAvatarPicker() {
    document.getElementById('avatar-modal').classList.add('hidden');
}

function confirmAvatar() {
    if (pendingAvatar) {
        selectedAvatar = pendingAvatar;
        localStorage.setItem('arcade_avatar', pendingAvatar);
        if (currentUser) {
            currentUser.avatar = pendingAvatar;
            localStorage.setItem('arcade_user', JSON.stringify(currentUser));
            sendWS({ type: 'update_avatar', avatar_id: pendingAvatar });
        }
        const el = document.getElementById('lobby-avatar');
        if (el) el.textContent = pendingAvatar;
    }
    hideAvatarPicker();
}

function populateAvatarGrid(gridId, currentSelection) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    AVATARS.forEach(a => {
        const div = document.createElement('div');
        div.className = 'avatar-pick' + (a === currentSelection ? ' selected' : '');
        div.textContent = a;
        div.onclick = () => {
            grid.querySelectorAll('.avatar-pick').forEach(p => p.classList.remove('selected'));
            div.classList.add('selected');
            pendingAvatar = a;
            selectedAvatar = a;
        };
        grid.appendChild(div);
    });
}

function populateAvatars() {
    populateAvatarGrid('avatar-grid', getUserAvatar());
    populateAvatarGrid('guest-avatars', null);
}

// ── GUEST JOIN (invite code players) ─────────────────────────
function showGuestJoin() {
    document.getElementById('guest-modal').classList.remove('hidden');
}
function hideGuest() { document.getElementById('guest-modal').classList.add('hidden'); }

function handleGuestJoin(e) {
    e.preventDefault();
    const code = document.getElementById('guest-code').value.trim().toUpperCase();
    const username = document.getElementById('guest-username').value.trim();
    if (!code || !username || !selectedAvatar) return;
    sendWS({ type: 'join_game', code, username, avatar: selectedAvatar, guest: true });
}

// ── WEBSOCKET ────────────────────────────────────────────────
function connectLobby() {
    try {
        ws = new WebSocket(LOBBY_WS);
        ws.onopen = () => {
            console.log('[Arcade] Lobby connected');
            if (currentUser) sendWS({ type: 'auth', token: currentUser.token });
        };
        ws.onmessage = (e) => {
            try { handleMessage(JSON.parse(e.data)); } catch (err) { console.warn('[Arcade] Parse error', err); }
        };
        ws.onclose = () => { console.log('[Arcade] Lobby disconnected, reconnecting...'); setTimeout(connectLobby, 3000); };
        ws.onerror = () => { };
    } catch (e) { setTimeout(connectLobby, 5000); }
}

function sendWS(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'auth_success':
        case 'register_success':
            currentUser = {
                username: msg.user?.username || msg.username,
                role: msg.user?.role || 'member',
                token: msg.token || msg.session_id,
                user_id: msg.user?.user_id,
                avatar: msg.user?.avatar_id || localStorage.getItem('arcade_avatar') || DEFAULT_AVATAR
            };
            selectedAvatar = currentUser.avatar;
            localStorage.setItem('arcade_user', JSON.stringify(currentUser));
            updateUI();
            hideAuth();
            // If first time (no avatar chosen yet), prompt avatar picker
            if (!msg.user?.avatar_id && !localStorage.getItem('arcade_avatar')) {
                setTimeout(() => showAvatarPicker(), 400);
            }
            break;

        case 'error':
        case 'auth_error':
        case 'register_error':
            // Show error on whichever modal is open
            const authErr = document.getElementById('auth-error');
            const recErr = document.getElementById('recover-error');
            if (recErr && !document.getElementById('recover-modal').classList.contains('hidden')) {
                recErr.textContent = msg.message || 'ERROR';
                recErr.classList.remove('hidden');
            } else if (authErr) {
                authErr.textContent = msg.message || 'ERROR';
                authErr.classList.remove('hidden');
            }
            break;

        case 'reset_code_sent':
            document.getElementById('recover-step1').classList.add('hidden');
            document.getElementById('recover-step2').classList.remove('hidden');
            document.getElementById('recover-error').classList.add('hidden');
            break;

        case 'reset_success':
            hideRecover();
            alert('Password reset! You can now sign in with your new password.');
            showAuth('signin');
            break;

        case 'player_count':
            document.getElementById('online-count').textContent = msg.count || 0;
            break;

        case 'match_found':
            const game = GAMES[msg.game];
            if (game) {
                const params = new URLSearchParams({ mode: 'matchmake', user: currentUser.username, session: msg.session_id });
                window.location.href = `${game.url}?${params}`;
            }
            break;

        case 'game_joined':
            // Guest joined via invite code
            const g = GAMES[msg.game];
            if (g) {
                const params = new URLSearchParams({ mode: 'invite', code: msg.code, user: msg.username, avatar: selectedAvatar });
                hideGuest();
                window.location.href = `${g.url}?${params}`;
            }
            break;

        case 'post_game_signup':
            // After game ends, prompt non-registered guests to sign up
            showAuth('register');
            break;
    }
}

// ── CHECK URL FOR INVITE CODE ────────────────────────────────
(function checkInviteLink() {
    const params = new URLSearchParams(location.search);
    if (params.has('join')) {
        document.getElementById('guest-code').value = params.get('join');
        showGuestJoin();
    }
})();
