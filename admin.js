/* ═══════════════════════════════════════════════════════════════
   KEN'S ARCADE — Admin Panel
   Only accessible to superuser and admins
   ═══════════════════════════════════════════════════════════════ */

const LOBBY_WS = location.protocol === 'https:'
    ? `wss://${location.host}/ws`
    : `ws://${location.hostname}:8765`;

// Superuser identity — immutable, no admin action may target this account
const SUPERUSER_USERNAME = 'kbingh';

// ── LOGOUT ───────────────────────────────────────────────────
function adminLogout() {
  localStorage.removeItem('kg_token');
  localStorage.removeItem('kg_user_id');
  localStorage.removeItem('kg_username');
  localStorage.removeItem('kg_display_name');
  localStorage.removeItem('kg_avatar');
  // Clear Cloudflare Access session cookie, redirect to login
  window.location.href = '/cdn-cgi/access/logout?redirect=' + encodeURIComponent('/login/');
}

let ws = null;
let currentUser = null;
let allUsers = [];
let kickTargetId = null;

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Use the canonical KG token; fall back to legacy arcade_user for back-compat
    const token = localStorage.getItem('kg_token');
    const savedLegacy = localStorage.getItem('arcade_user');
    if (!token && !savedLegacy) { showNoAccess(); return; }
    if (token) {
        // Validate token then init
        fetch('/api/auth/validate', { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (!d || !d.valid) { localStorage.removeItem('kg_token'); showNoAccess(); return; }
                currentUser = { username: d.userId, token: token };
                document.getElementById('admin-user').innerHTML = `<span style="color:var(--green)">▶ ${d.playername || d.userId}</span>`;
                connectAdmin();
            })
            .catch(() => showNoAccess());
        return;
    }
    // Legacy path
    try { currentUser = JSON.parse(savedLegacy); } catch (e) { showNoAccess(); return; }
    document.getElementById('admin-user').innerHTML = `<span style="color:var(--green)">▶ ${currentUser.username}</span>`;
    connectAdmin();
});

function showNoAccess() {
    document.getElementById('no-access').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
}

function showPanel(role) {
    document.getElementById('no-access').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    const badge = document.getElementById('my-role');
    badge.textContent = role.toUpperCase();
    badge.className = `role-badge ${role}`;
}

// ── WEBSOCKET ────────────────────────────────────────────────
function connectAdmin() {
    ws = new WebSocket(LOBBY_WS);
    ws.onopen = () => {
        // Login first
        send({ type: 'login', username: currentUser.username, password: '' });
        // Use token-based auth if available
        if (currentUser.token) {
            send({ type: 'auth', token: currentUser.token });
        }
    };
    ws.onmessage = (e) => {
        try { handleMsg(JSON.parse(e.data)); } catch (err) { console.warn(err); }
    };
    ws.onclose = () => setTimeout(connectAdmin, 3000);
}

function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handleMsg(msg) {
    switch (msg.type) {
        case 'auth_success':
            const role = msg.user?.role || 'member';
            if (role === 'superuser' || role === 'admin') {
                showPanel(role);
                send({ type: 'admin_get_stats' });
                send({ type: 'admin_list_users' });
            } else {
                showNoAccess();
            }
            break;

        case 'admin_stats':
            document.getElementById('stat-users').textContent = msg.total_users;
            document.getElementById('stat-online').textContent = msg.online_players;
            document.getElementById('stat-sessions').textContent = msg.active_sessions;
            document.getElementById('stat-guilds').textContent = msg.total_guilds;
            break;

        case 'admin_user_list':
            allUsers = msg.users;
            renderUsers(allUsers);
            break;

        case 'admin_promote_success':
        case 'admin_demote_success':
            send({ type: 'admin_list_users' }); // Refresh
            break;

        case 'admin_kick_success':
            hideKickModal();
            send({ type: 'admin_list_users' });
            send({ type: 'admin_get_stats' });
            break;

        case 'error':
            alert(msg.message || 'Error');
            break;
    }
}

// ── RENDER USERS ─────────────────────────────────────────────
function renderUsers(users) {
    const tbody = document.getElementById('user-tbody');
    const isSuperuser = currentUser && allUsers.find(u => u.username === currentUser.username)?.role === 'superuser';

    tbody.innerHTML = users.map(u => {
        const isSU = u.username === SUPERUSER_USERNAME || u.role === 'superuser';
        const online = u.online ? '<span class="online-dot on"></span>' : '<span class="online-dot off"></span>';
        const roleBadge = `<span class="role-badge ${u.role}">${u.role.toUpperCase()}${isSU ? ' 🛡' : ''}</span>`;
        const winRate = u.games_played > 0 ? `${u.games_won}/${u.games_played - u.games_won}` : '0/0';
        const joined = u.created_at ? u.created_at.split('T')[0] : '-';

        let actions = '';
        // No action may be taken against the superuser account
        if (!isSU) {
            if (isSuperuser) {
                if (u.role === 'member') {
                    actions += `<button class="action-btn promote" onclick="promoteUser('${u.user_id}','${u.username}')">PROMOTE</button>`;
                } else if (u.role === 'admin') {
                    actions += `<button class="action-btn demote" onclick="demoteUser('${u.user_id}')">DEMOTE</button>`;
                }
            }
            // Kick button — superuser can kick anyone, admin can kick members
            const canKick = isSuperuser || (u.role === 'member');
            if (canKick) {
                actions += `<button class="action-btn kick" onclick="kickUser('${u.user_id}','${u.username}')">KICK</button>`;
            }
        }

        return `<tr>
            <td>${online}</td>
            <td>${u.username}</td>
            <td>${roleBadge}</td>
            <td>${u.games_played}</td>
            <td>${winRate}</td>
            <td>${joined}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

function filterUsers() {
    const q = document.getElementById('user-search').value.toLowerCase();
    const filtered = q ? allUsers.filter(u => u.username.toLowerCase().includes(q)) : allUsers;
    renderUsers(filtered);
}

// ── ACTIONS ──────────────────────────────────────────────────
function promoteUser(userId, username) {
    // Admin TOS acknowledgement required before promotion
    if (!confirm(`Promoting ${username} to Admin.\n\nBy clicking OK you confirm that this user has agreed to the Admin Charter (/tos/admin.html) and understands their responsibilities.`)) return;
    send({ type: 'admin_promote', user_id: userId });
}

function demoteUser(userId) { send({ type: 'admin_demote', user_id: userId }); }

function kickUser(userId, username) {
    // Guard: never allow kicking the superuser via the UI
    if (username === SUPERUSER_USERNAME) { alert('The superuser account cannot be removed.'); return; }
    kickTargetId = userId;
    document.getElementById('kick-username').textContent = username;
    document.getElementById('kick-reason').value = '';
    document.getElementById('kick-modal').classList.remove('hidden');
}
function hideKickModal() { document.getElementById('kick-modal').classList.add('hidden'); kickTargetId = null; }
function confirmKick() {
    if (!kickTargetId) return;
    const reason = document.getElementById('kick-reason').value.trim() || 'Kicked by admin';
    send({ type: 'admin_kick_user', user_id: kickTargetId, reason });
}
