/**
 * Fast Track Lobby Client
 * WebSocket-based lobby management and game session handling
 */

// =============================================================================
// Configuration  
// =============================================================================

// Auto-detect WebSocket protocol based on page protocol
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.host;

const LOBBY_CONFIG = {
    // Use nginx proxy path in production, direct port in development
    wsUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `ws://${window.location.hostname}:8765`
        : `${wsProtocol}//${wsHost}/ws`,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
};

// =============================================================================
// State
// =============================================================================

const state = {
    socket: null,
    connected: false,
    reconnectAttempts: 0,
    user: null,
    currentSession: null,
    selectedAvatar: 'person_smile',
    tutorialStep: 0,
};

// =============================================================================
// WebSocket Connection
// =============================================================================

function connectToLobby() {
    try {
        state.socket = new WebSocket(LOBBY_CONFIG.wsUrl);
        
        state.socket.onopen = () => {
            console.log('[Lobby] Connected to server');
            state.connected = true;
            state.reconnectAttempts = 0;
            showToast('Connected to lobby', 'success');
        };
        
        state.socket.onclose = () => {
            console.log('[Lobby] Disconnected from server');
            state.connected = false;
            
            if (state.reconnectAttempts < LOBBY_CONFIG.maxReconnectAttempts) {
                state.reconnectAttempts++;
                setTimeout(connectToLobby, LOBBY_CONFIG.reconnectInterval);
            } else {
                showToast('Connection lost. Please refresh the page.', 'error');
            }
        };
        
        state.socket.onerror = (error) => {
            console.error('[Lobby] WebSocket error:', error);
        };
        
        state.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) {
                console.error('[Lobby] Error parsing message:', e);
            }
        };
    } catch (e) {
        console.error('[Lobby] Connection error:', e);
        showToast('Failed to connect to lobby server', 'error');
    }
}

function send(data) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify(data));
    } else {
        showToast('Not connected to server', 'error');
    }
}

// =============================================================================
// Message Handlers
// =============================================================================

function handleServerMessage(data) {
    console.log('[Lobby] Received:', data.type, data);
    
    const handlers = {
        'connected': onConnected,
        'auth_success': onAuthSuccess,
        'error': onError,
        'logged_out': onLoggedOut,
        'profile_updated': onProfileUpdated,
        'profile': onProfile,
        'session_created': onSessionCreated,
        'session_joined': onSessionJoined,
        'session_list': onSessionList,
        'player_joined': onPlayerJoined,
        'player_left': onPlayerLeft,
        'left_session': onLeftSession,
        'game_started': onGameStarted,
        'lobby_update': onLobbyUpdate,
        'guild_created': onGuildCreated,
        'guild_joined': onGuildJoined,
        'guild_left': onGuildLeft,
        'guild_search_results': onGuildSearchResults,
        'guild_details': onGuildDetails,
        'guild_members': onGuildMembers,
        'guild_tournaments': onGuildTournaments,
        'guild_disbanded': onGuildDisbanded,
        'guild_member_booted': onGuildMemberBooted,
        'guild_chat': onGuildChatMessage,
        'chat_update': onChatUpdate,
        'blocked_users': onBlockedUsersUpdate,
        'block_search_results': handleBlockUserSearchResults,
        'user_search_results': onUserSearchResults,
        'chat': onChatMessage,
        'prestige_awarded': onPrestigeAwarded,
        'pong': () => {},
    };
    
    const handler = handlers[data.type];
    if (handler) {
        handler(data);
    } else {
        console.warn('[Lobby] Unknown message type:', data.type);
    }
}

function onConnected(data) {
    console.log('[Lobby] Welcome message:', data.message);
    
    // Check for stored credentials
    const stored = localStorage.getItem('ft_user');
    if (stored) {
        try {
            const { username, password } = JSON.parse(stored);
            send({ type: 'login', username, password });
        } catch (e) {
            localStorage.removeItem('ft_user');
        }
    } else if (state.pendingAction) {
        // Auto-guest-login for private/join actions (no login required)
        send({
            type: 'guest_login',
            name: `Player_${Math.random().toString(36).slice(2, 6)}`,
            avatar_id: 'person_smile'
        });
    }
}

function onAuthSuccess(data) {
    state.user = data.user;

    // Persist credentials to localStorage only after confirmed auth success (login or register)
    if (!data.user.is_guest && data.action !== 'guest_login' && state.pendingCredentials) {
        localStorage.setItem('ft_user', JSON.stringify(state.pendingCredentials));
        state.pendingCredentials = null;
    }
    
    updateUserUI();
    showMainApp();
    refreshGames();
    
    showToast(`Welcome, ${data.user.username}!`, 'success');
    
    // Handle pending actions (from URL params or auth-screen buttons)
    if (state.pendingAction) {
        const action = state.pendingAction;
        const pendingCode = state.pendingCode;
        state.pendingAction = null;
        state.pendingCode = null;
        setTimeout(() => {
            if (action === 'private') {
                showCreatePrivateGame();
            } else if (action === 'join') {
                showJoinByCode();
            } else if (action === 'code' && pendingCode) {
                document.getElementById('join-code-input').value = pendingCode;
                showJoinByCode();
            }
        }, 300);
    }
}

function onError(data) {
    showToast(data.message, 'error');
}

function onLoggedOut() {
    state.user = null;
    localStorage.removeItem('ft_user');
    showAuthScreen();
    showToast('Logged out', 'success');
}

function onProfileUpdated(data) {
    state.user = data.user;
    state.selectedAvatar = data.user.avatar_id;
    updateUserUI();
    closeModal('avatar-modal');
    showToast('Profile updated!', 'success');
}

function onProfile(data) {
    // Update profile modal with user data
    const user = data.user;
    document.getElementById('profile-avatar-display').textContent = getAvatarEmoji(user.avatar_id);
    document.getElementById('profile-username').textContent = user.username;
    document.getElementById('profile-prestige').textContent = user.prestige_level.toUpperCase();
    document.getElementById('profile-prestige').className = `prestige-badge prestige-${user.prestige_level}`;
    document.getElementById('profile-points').textContent = `${user.prestige_points} pts`;
    document.getElementById('profile-games').textContent = user.games_played || 0;
    document.getElementById('profile-wins').textContent = user.games_won || 0;
}

function onSessionCreated(data) {
    state.currentSession = data.session;
    
    // If wizard is open, populate step 1 with room code
    const wizardModal = document.getElementById('private-wizard-modal');
    if (wizardModal && wizardModal.classList.contains('active')) {
        const code = data.share_code || data.session.session_code;
        let url = data.share_url || `${window.location.origin}${window.location.pathname.replace('lobby.html', 'join.html')}?code=${code}`;
        if (url.startsWith('/')) url = window.location.origin + url;
        document.getElementById('wizard-room-code').textContent = code;
        document.getElementById('wizard-share-url').value = url;
        state.wizardShareUrl = url;
        state.wizardShareCode = code;
    } else {
        // Fallback: non-wizard flow (public games etc.)
        showWaitingRoom(data.session, data.share_code, data.share_url);
    }
    showToast('Game created!', 'success');
}

function onSessionJoined(data) {
    state.currentSession = data.session;
    showWaitingRoom(data.session, data.session.session_code);
}

function onSessionList(data) {
    renderSessionList(data.sessions);
}

function onPlayerJoined(data) {
    state.currentSession.players = data.players;
    updateWaitingRoom();
    showToast(`${data.player.username} joined!`, 'success');
}

function onPlayerLeft(data) {
    state.currentSession.players = data.players;
    updateWaitingRoom();
    showToast(`${data.username} left`, 'info');
}

function onLeftSession() {
    state.currentSession = null;
    closeModal('waiting-room-modal');
    closeModal('private-wizard-modal');
}

function onGameStarted(data) {
    closeModal('waiting-room-modal');
    closeModal('private-wizard-modal');

    const session = data.session;

    // Avatar id → emoji map (must match 3d.html)
    const AVATAR_EMOJIS = {
        person_smile: '😊', person_cool: '😎', animal_lion: '🦁', animal_fox: '🦊',
        space_rocket: '🚀', fantasy_dragon: '🐲', scifi_robot: '🤖', sport_soccer: '⚽',
        robot: '🤖',
    };

    // Identify "me" in the session roster by user_id
    const myUserId = state.user?.user_id || state.user?.id || '';
    const me = session.players?.find(p => p.user_id === myUserId) || session.players?.[0];
    const myEmoji = AVATAR_EMOJIS[me?.avatar_id] || '👤';

    // Stash full session roster in sessionStorage so board can name every slot correctly
    // (avoiding URL length limits)
    const roster = (session.players || []).map(p => ({
        user_id:  p.user_id,
        username: p.username,
        avatar:   AVATAR_EMOJIS[p.avatar_id] || '👤',
        is_ai:    !!(p.is_ai || p.is_bot),
    }));
    try {
        sessionStorage.setItem('ft_session_players', JSON.stringify(roster));
        sessionStorage.setItem('ft_my_user_id', myUserId);
    } catch (e) { /* sessionStorage unavailable – board will fall back to URL name */ }

    // Redirect to game board with full player info in URL
    const params = new URLSearchParams({
        session:    session.session_id,
        multiplayer: 'true',
        wsUrl:      LOBBY_CONFIG.wsUrl,
        name:       me?.username || state.user?.username || 'Player',
        avatar:     myEmoji,
        players:    String(session.players?.length || 2),
    });

    window.location.href = `3d.html?${params.toString()}`;
}

function onLobbyUpdate(data) {
    // Refresh session list on lobby updates
    if (data.action === 'session_created' || data.action === 'session_updated' || data.action === 'session_removed') {
        refreshGames();
    }
}

function onGuildCreated(data) {
    showToast('Guild created!', 'success');
    closeModal('create-guild-modal');
    state.user.guild_id = data.guild.guild_id;
    
    // Update guild state
    guildState.guild = data.guild;
    guildState.isGuildmaster = true;  // Creator is always guildmaster
    guildState.members = [{ 
        id: state.user.id, 
        name: state.user.username, 
        online: true, 
        isGuildmaster: true 
    }];
    
    renderMyGuild(data.guild);
}

function onGuildJoined(data) {
    showToast(`Joined ${data.guild.name}!`, 'success');
    state.user.guild_id = data.guild.guild_id;
    
    // Update guild state
    guildState.guild = data.guild;
    guildState.isGuildmaster = data.guild.guildmaster_id === state.user.id;
    
    renderMyGuild(data.guild);
}

function onGuildLeft() {
    showToast('Left guild', 'success');
    state.user.guild_id = null;
    
    // Reset guild state
    guildState.guild = null;
    guildState.isGuildmaster = false;
    guildState.members = [];
    guildState.tournaments = [];
    guildState.pendingInvites = [];
    
    updateGuildPanel();
}

function onGuildSearchResults(data) {
    // Check if this is a tournament guild search
    if (document.getElementById('create-tournament-modal').style.display !== 'none' || 
        document.getElementById('create-tournament-modal').classList.contains('active')) {
        handleGuildSearchResults(data.guilds);
    } else {
        renderGuildSearchResults(data.guilds);
    }
}

function onGuildDetails(data) {
    // Update guild state
    handleGuildUpdate({
        guild: data.guild,
        isGuildmaster: data.guild.guildmaster_id === state.user.id,
        members: data.members,
        tournaments: data.tournaments,
        pendingInvites: data.pendingInvites
    });
    
    renderMyGuild(data.guild, data.members);
}

function onGuildMembers(data) {
    guildState.members = data.members || [];
    guildState.onlineMembers = guildState.members.filter(m => m.online);
    
    // Update display if modal is open
    if (document.getElementById('guild-members-modal').classList.contains('active')) {
        renderGuildMembersList();
    }
    if (document.getElementById('manage-members-modal').classList.contains('active')) {
        renderManageMembersList();
    }
    
    // Update online count
    const onlineCountEl = document.getElementById('guild-online-count');
    if (onlineCountEl) {
        onlineCountEl.textContent = guildState.onlineMembers.length;
    }
}

function onGuildTournaments(data) {
    guildState.tournaments = data.tournaments || [];
    guildState.pendingInvites = data.pendingInvites || [];
    
    // Update display if modal is open
    if (document.getElementById('guild-tournaments-modal').classList.contains('active')) {
        renderTournamentsList();
    }
}

function onGuildDisbanded(data) {
    showToast(data.message || 'Your guild has been disbanded', 'info');
    
    // Reset guild state
    state.user.guild_id = null;
    guildState.guild = null;
    guildState.isGuildmaster = false;
    guildState.members = [];
    guildState.tournaments = [];
    guildState.pendingInvites = [];
    
    // Close any open guild modals
    closeModal('manage-members-modal');
    closeModal('guild-members-modal');
    closeModal('guild-tournaments-modal');
    closeModal('create-tournament-modal');
    closeModal('disband-guild-modal');
    
    updateGuildPanel();
}

function onGuildMemberBooted(data) {
    if (data.memberId === state.user.id) {
        // Current user was booted
        showToast('You have been removed from the guild', 'info');
        state.user.guild_id = null;
        guildState.guild = null;
        guildState.isGuildmaster = false;
        guildState.members = [];
        updateGuildPanel();
    } else {
        // Someone else was booted
        guildState.members = guildState.members.filter(m => m.id !== data.memberId);
        
        // Update displays
        if (document.getElementById('guild-members-modal').classList.contains('active')) {
            renderGuildMembersList();
        }
        if (document.getElementById('manage-members-modal').classList.contains('active')) {
            renderManageMembersList();
        }
    }
}

function onUserSearchResults(data) {
    renderPlayerSearchResults(data.users);
}

function onChatMessage(data) {
    addChatMessage(data);
}

function onPrestigeAwarded(data) {
    state.user.prestige_points = data.total_points;
    state.user.prestige_level = data.level;
    updateUserUI();
    showToast(`+${data.points} prestige for ${data.action.replace('_', ' ')}!`, 'success');
}

// =============================================================================
// Authentication
// =============================================================================

function createPrivateAsGuest() {
    state.pendingAction = 'private';
    if (state.connected) {
        send({
            type: 'guest_login',
            name: `Player_${Math.random().toString(36).slice(2, 6)}`,
            avatar_id: 'person_smile'
        });
    } else {
        showToast('Connecting to server...', 'error');
    }
}

function joinByCodeAsGuest() {
    state.pendingAction = 'join';
    if (state.connected) {
        send({
            type: 'guest_login',
            name: `Player_${Math.random().toString(36).slice(2, 6)}`,
            avatar_id: 'person_smile'
        });
    } else {
        showToast('Connecting to server...', 'error');
    }
}

function showAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.auth-tab:${tab === 'login' ? 'first-child' : 'last-child'}`).classList.add('active');
    
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    // Stash credentials temporarily; only persist to localStorage after auth_success
    state.pendingCredentials = { username, password };

    send({ type: 'login', username, password });
}

function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value.trim();
    
    send({ type: 'register', username, password, email });
    
    // Store for auto-login after registration
    localStorage.setItem('ft_user', JSON.stringify({ username, password }));
}

function logout() {
    send({ type: 'logout' });
    closeModal('profile-modal');
}

function showPrivateGameJoin() {
    showJoinByCode();
    document.getElementById('guest-name-group').style.display = 'block';
}

// =============================================================================
// UI Updates
// =============================================================================

function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
}

function updateUserUI() {
    if (!state.user) return;

    const avatar = getAvatarEmoji(state.user.avatar_id);
    const level = state.user.prestige_level || 'bronze';
    const points = state.user.prestige_points || 0;

    document.getElementById('header-username').textContent = state.user.username;
    document.getElementById('header-avatar').textContent = avatar;
    document.getElementById('header-prestige').textContent = level.toUpperCase();
    document.getElementById('header-prestige').className = `prestige-badge prestige-${level}`;
    document.getElementById('header-points').textContent = `${points} pts`;

    // Update profile modal too
    document.getElementById('profile-avatar-display').textContent = avatar;
    document.getElementById('profile-username').textContent = state.user.username;
    document.getElementById('profile-prestige').textContent = level.toUpperCase();
    document.getElementById('profile-prestige').className = `prestige-badge prestige-${level}`;
    document.getElementById('profile-points').textContent = `${points} pts`;
    document.getElementById('profile-games').textContent = state.user.games_played || 0;
    document.getElementById('profile-wins').textContent = state.user.games_won || 0;
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${tabId}`).classList.add('active');
}

// =============================================================================
// Session Management
// =============================================================================

function refreshGames() {
    send({ type: 'list_sessions' });
}

function renderSessionList(sessions) {
    const container = document.getElementById('session-list');
    const noGamesPanel = document.getElementById('no-games-panel');

    if (!sessions || sessions.length === 0) {
        container.innerHTML = '';
        noGamesPanel.style.display = 'block';
        return;
    }

    noGamesPanel.style.display = 'none';
    container.innerHTML = sessions.map(session => {
        const players = session.players || [];
        const avatarHtml = players.map(p =>
            `<span title="${escapeHtml(p.username)}" style="font-size:1.2rem;">${getAvatarEmoji(p.avatar_id)}</span>`
        ).join('');
        return `
        <div class="session-item">
            <div class="session-info">
                <div class="session-host-avatar">🎮</div>
                <div class="session-details">
                    <h4>${escapeHtml(session.host_username)}'s Game</h4>
                    <p>${session.is_private ? '🔒 Private' : '🌐 Public'} · ${session.player_count}/${session.max_players} players</p>
                    <div style="display:flex;gap:4px;margin-top:4px;">${avatarHtml}</div>
                </div>
            </div>
            <button class="btn btn-small btn-primary" onclick="joinSession('${session.session_id}')">Join</button>
        </div>
        `;
    }).join('');
}

function createPublicGame() {
    // Quick match - open modal or create directly
    openModal('create-public-modal');
}

function showCreatePrivateGame() {
    // Open wizard at step 1 and immediately create session to get room code
    state.wizardStep = 1;
    state.wizardAvatar = state.user?.avatar_id || 'person_smile';
    
    // Reset wizard UI
    document.getElementById('wizard-room-code').textContent = '------';
    document.getElementById('wizard-share-url').value = '';
    
    // Pre-fill username from logged-in user
    const usernameInput = document.getElementById('wizard-username');
    if (usernameInput) {
        usernameInput.value = state.user?.username || '';
    }
    document.getElementById('wizard-avatar-preview').textContent = getAvatarEmoji(state.wizardAvatar);
    
    // Reset settings
    document.getElementById('wiz-music').checked = true;
    document.getElementById('wiz-allow-ai').checked = true;
    document.getElementById('wiz-turn-timer').checked = false;
    document.getElementById('wiz-late-arrivals').checked = true;
    document.getElementById('wiz-max-players').value = '4';
    
    // Show wizard
    updateWizardSteps();
    openModal('private-wizard-modal');
    
    // Create session immediately to get a room code
    send({
        type: 'create_session',
        private: true,
        max_players: 4,
        settings: {
            initial_bots: 0,
            allow_bots: true,
            replace_with_bot: true,
            turn_timer: false,
            turn_timer_seconds: 0,
            warning_seconds: 60
        }
    });
}

// =============================================================================
// Private Game Wizard Navigation
// =============================================================================

function updateWizardSteps() {
    const step = state.wizardStep;
    
    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.toggle('active', s === step);
        el.classList.toggle('done', s < step);
    });
    
    // Update lines between steps
    const lines = document.querySelectorAll('.wizard-step-line');
    lines.forEach((line, i) => {
        line.classList.toggle('done', (i + 1) < step);
    });
    
    // Show/hide panels
    for (let i = 1; i <= 4; i++) {
        const panel = document.getElementById(`wizard-step-${i}`);
        if (panel) panel.classList.toggle('active', i === step);
    }
    
    // Update title
    const titles = {
        1: '🔒 Share Game Code',
        2: '👤 Your Identity',
        3: '⚙️ Game Settings',
        4: '⏳ Waiting Lobby'
    };
    document.getElementById('wizard-title').textContent = titles[step] || '';
    
    // Step-specific init
    if (step === 2) {
        wizardInitAvatarPicker();
        wizardCheckUsername();
    }
    if (step === 4) {
        wizardApplySettings();
        updateWaitingRoom();
    }
}

function wizardNext() {
    if (state.wizardStep >= 4) return;
    state.wizardStep++;
    updateWizardSteps();
}

function wizardBack() {
    if (state.wizardStep <= 1) return;
    state.wizardStep--;
    updateWizardSteps();
}

function closePrivateWizard() {
    if (state.currentSession && state.wizardStep < 4) {
        // Cancel the session if they close before the lobby
        send({ type: 'leave_session' });
        state.currentSession = null;
    } else if (state.currentSession) {
        send({ type: 'leave_session' });
        state.currentSession = null;
    }
    closeModal('private-wizard-modal');
}

function wizardCheckUsername() {
    const name = document.getElementById('wizard-username').value.trim();
    const nextBtn = document.getElementById('wizard-next-2');
    if (nextBtn) nextBtn.disabled = name.length === 0;
}

function wizardInitAvatarPicker() {
    const catsContainer = document.getElementById('wizard-avatar-cats');
    const cats = Object.entries(AVATAR_CATALOG);
    
    catsContainer.innerHTML = cats.map(([id, cat], idx) => `
        <button class="${idx === 0 ? 'active' : ''}" data-cat="${id}" onclick="wizardSelectCategory('${id}')">${cat.icon} ${cat.name}</button>
    `).join('');
    
    wizardRenderAvatarGrid(cats[0][0]);
}

function wizardSelectCategory(catId) {
    document.querySelectorAll('.wizard-avatar-cats button').forEach(b => b.classList.remove('active'));
    document.querySelector(`.wizard-avatar-cats button[data-cat="${catId}"]`).classList.add('active');
    wizardRenderAvatarGrid(catId);
}

function wizardRenderAvatarGrid(catId) {
    const cat = AVATAR_CATALOG[catId];
    const grid = document.getElementById('wizard-avatar-grid');
    
    grid.innerHTML = cat.avatars.map(a => `
        <div class="avatar-opt ${state.wizardAvatar === a.id ? 'selected' : ''}" 
             data-id="${a.id}" onclick="wizardPickAvatar('${a.id}')" title="${a.name}">
            ${a.emoji}
        </div>
    `).join('');
}

function wizardPickAvatar(avatarId) {
    state.wizardAvatar = avatarId;
    document.getElementById('wizard-avatar-preview').textContent = getAvatarEmoji(avatarId);
    
    document.querySelectorAll('.wizard-avatar-grid .avatar-opt').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === avatarId);
    });
}

function wizardApplySettings() {
    // Apply wizard step 2 + 3 settings to the session
    if (!state.currentSession) return;
    
    const username = document.getElementById('wizard-username').value.trim() || state.user?.username;
    const avatarId = state.wizardAvatar || 'person_smile';
    const allowAi = document.getElementById('wiz-allow-ai').checked;
    const turnTimer = document.getElementById('wiz-turn-timer').checked;
    const lateArrivals = document.getElementById('wiz-late-arrivals').checked;
    const maxPlayers = parseInt(document.getElementById('wiz-max-players').value);
    const music = document.getElementById('wiz-music').checked;
    
    // Update player name/avatar in session (works for guests and logged-in users)
    if (username || avatarId) {
        send({ type: 'update_player_info', username: username, avatar_id: avatarId });
        if (state.user) {
            if (username) state.user.username = username;
            if (avatarId) state.user.avatar_id = avatarId;
        }
    }
    
    // Send session settings update
    send({
        type: 'update_session_settings',
        settings: {
            allow_bots: allowAi,
            turn_timer: turnTimer,
            turn_timer_seconds: turnTimer ? 120 : 0,
            warning_seconds: 60,
            late_arrivals: lateArrivals,
            music: music
        },
        max_players: maxPlayers
    });
    
    // Store music pref locally
    state.musicEnabled = music;
}

// Sharing helpers for the wizard
function shareToWhatsApp() {
    const url = state.wizardShareUrl || document.getElementById('wizard-share-url').value;
    const code = state.wizardShareCode || document.getElementById('wizard-room-code').textContent;
    const text = encodeURIComponent(`Join my Fast Track game! Code: ${code}\n${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

function shareToTwitter() {
    const url = state.wizardShareUrl || document.getElementById('wizard-share-url').value;
    const code = state.wizardShareCode || document.getElementById('wizard-room-code').textContent;
    const text = encodeURIComponent(`Join my Fast Track game! Code: ${code}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, '_blank');
}

function shareToEmail() {
    const url = state.wizardShareUrl || document.getElementById('wizard-share-url').value;
    const code = state.wizardShareCode || document.getElementById('wizard-room-code').textContent;
    const subject = encodeURIComponent('Join my Fast Track game!');
    const body = encodeURIComponent(`Hey! Join my Fast Track board game.\n\nGame Code: ${code}\nDirect Link: ${url}\n\nSee you at the board!`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
}

function createPrivateGame(event) {
    // Legacy — no longer used, wizard handles everything
    if (event) event.preventDefault();
}

function createPublicGameWithSettings(event) {
    event.preventDefault();
    
    const playerCount = parseInt(document.getElementById('public-player-count').value);
    
    // Validate public game limits (3-4 players only)
    if (playerCount < 3 || playerCount > 4) {
        showToast('Public games must have 3-4 players', 'error');
        return;
    }
    
    closeModal('create-public-modal');
    
    send({
        type: 'create_session',
        private: false,
        max_players: playerCount,
        settings: {
            // Public game rules: no bots at start, only as replacements
            no_bots_at_start: true,
            replace_with_bot: true, // Bots replace leaving players
            medallion_eligible: true,
            turn_timer: true, // Always on for public games
            turn_timer_seconds: 120, // 2 minutes idle before warning
            warning_seconds: 60, // 1 minute warning
            auto_replace_timeout: 60, // 1 minute after warning to replace
            min_players: 3,
            max_players: 4
        }
    });
}

function updatePrivateGameOptions() {
    // Legacy — no longer used, wizard handles settings in step 3
}

function joinSession(sessionId) {
    send({ type: 'join_session', session_id: sessionId });
}

function showJoinByCode() {
    document.getElementById('join-code-input').value = '';
    document.getElementById('guest-name-group').style.display = state.user ? 'none' : 'block';
    openModal('join-code-modal');
}

function joinByCode(event) {
    event.preventDefault();
    
    const code = document.getElementById('join-code-input').value.toUpperCase().trim();
    const guestName = document.getElementById('guest-name-input').value.trim();
    
    if (!code) {
        showToast('Please enter a game code', 'error');
        return;
    }
    
    // If not logged in, do guest login first
    if (!state.user) {
        send({
            type: 'guest_login',
            name: guestName || `Guest_${Math.random().toString(36).slice(2, 6)}`,
            avatar_id: 'person_smile'
        });
        
        // Wait for auth then join
        const origHandler = onAuthSuccess;
        onAuthSuccess = (data) => {
            origHandler(data);
            send({ type: 'join_by_code', code });
            onAuthSuccess = origHandler;
        };
    } else {
        send({ type: 'join_by_code', code });
    }
    
    closeModal('join-code-modal');
}

function showWaitingRoom(session, code, shareUrl) {
    // Check if wizard is open — if so, jump to step 4
    const wizardModal = document.getElementById('private-wizard-modal');
    if (wizardModal && wizardModal.classList.contains('active')) {
        state.wizardStep = 4;
        updateWizardSteps();
        return;
    }
    
    // Legacy waiting room for non-wizard flows (public games, join-by-code)
    document.getElementById('waiting-room-code').textContent = code;
    
    let url = shareUrl || `${window.location.origin}${window.location.pathname.replace('lobby.html', 'join.html')}?code=${code}`;
    if (url.startsWith('/')) url = window.location.origin + url;
    document.getElementById('share-url').value = url;
    
    updateWaitingRoom();
    openModal('waiting-room-modal');
}

function updateWaitingRoom() {
    if (!state.currentSession) return;
    
    const session = state.currentSession;
    const isHost = session.host_id === state.user?.user_id;
    const aiCount = session.players.filter(p => p.is_ai).length;
    const humanCount = session.players.filter(p => !p.is_ai).length;
    const totalPlayers = session.players.length;
    
    // Build player slot HTML
    const slots = [];
    for (let i = 0; i < session.max_players; i++) {
        const player = session.players.find(p => p.slot === i);
        if (player) {
            slots.push(`
                <div class="waiting-player ${player.is_host ? 'host' : ''}">
                    <div class="waiting-player-avatar">${getAvatarEmoji(player.avatar_id)}</div>
                    <div class="waiting-player-name">${player.username}</div>
                    ${player.is_host ? '<div style="font-size: 0.7rem;">👑 Host</div>' : ''}
                    ${player.is_ai ? '<div style="font-size: 0.7rem;">🤖 AI</div>' : ''}
                </div>
            `);
        } else {
            slots.push(`
                <div class="waiting-player waiting-player-slot">
                    <div class="waiting-player-avatar">❓</div>
                    <div class="waiting-player-name">Empty</div>
                </div>
            `);
        }
    }
    
    // Update wizard step 4 (if it exists)
    const wizardPlayers = document.getElementById('wizard-waiting-players');
    if (wizardPlayers) {
        wizardPlayers.innerHTML = slots.join('');
    }
    
    // Wizard bot controls
    const allowAi = session.settings?.allow_bots !== false;
    const gameIsFull = totalPlayers >= session.max_players;
    const maxBotsReached = aiCount >= 3;
    const canAddBots = isHost && allowAi && !gameIsFull && !maxBotsReached;
    
    const wizAddAi = document.getElementById('wizard-add-ai');
    const wizRemoveAi = document.getElementById('wizard-remove-ai');
    const wizBotControls = document.getElementById('wizard-bot-controls');
    const wizBotInfo = document.getElementById('wizard-bot-info');
    
    if (wizBotControls) {
        wizBotControls.style.display = (isHost && allowAi) ? 'flex' : 'none';
    }
    if (wizAddAi) {
        wizAddAi.style.display = canAddBots ? 'inline-flex' : 'none';
    }
    if (wizRemoveAi) {
        wizRemoveAi.style.display = (isHost && aiCount > 0) ? 'inline-flex' : 'none';
    }
    if (wizBotInfo) {
        wizBotInfo.textContent = aiCount > 0 ? `🤖 ${aiCount} bot${aiCount > 1 ? 's' : ''} in game` : '';
    }
    
    // Start button — require 2+ total players (human + bots)
    const wizStartBtn = document.getElementById('wizard-start-btn');
    const wizStartNote = document.getElementById('wizard-start-note');
    if (wizStartBtn) {
        const canStart = isHost && totalPlayers >= 2;
        wizStartBtn.disabled = !canStart;
        if (wizStartNote) {
            if (!isHost) {
                wizStartNote.textContent = 'Waiting for host to start the game...';
            } else if (totalPlayers < 2) {
                wizStartNote.textContent = 'Add at least 1 bot or invite a friend to start';
            } else {
                wizStartNote.textContent = `${totalPlayers} player${totalPlayers > 1 ? 's' : ''} ready — let\'s go!`;
            }
        }
    }
    
    // Also update legacy waiting room elements (for public games / join-by-code)
    const legacyContainer = document.getElementById('waiting-players');
    if (legacyContainer) {
        legacyContainer.innerHTML = slots.join('');
    }
    
    const addAiBtn = document.getElementById('add-ai-btn');
    const removeAiBtn = document.getElementById('remove-ai-btn');
    const botCountInfo = document.getElementById('bot-count-info');
    const botLimitWarning = document.getElementById('bot-limit-warning');
    const gameSetupOptions = document.getElementById('game-setup-options');
    
    if (gameSetupOptions) {
        gameSetupOptions.style.display = isHost ? 'block' : 'none';
    }
    if (addAiBtn) {
        addAiBtn.style.display = canAddBots ? 'inline-flex' : 'none';
    }
    if (removeAiBtn) {
        removeAiBtn.style.display = (isHost && aiCount > 0) ? 'inline-flex' : 'none';
    }
    if (botCountInfo) {
        botCountInfo.textContent = aiCount > 0 ? `🤖 ${aiCount} bot${aiCount > 1 ? 's' : ''} in game` : '';
    }
    if (botLimitWarning) {
        botLimitWarning.style.display = 'none';
    }
    
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
        startBtn.disabled = !isHost || session.players.length < 2;
    }
}

function addAIPlayer() {
    if (!state.currentSession) return;
    
    const session = state.currentSession;
    const aiCount = session.players.filter(p => p.is_ai).length;
    const humanCount = session.players.filter(p => !p.is_ai).length;
    const totalPlayers = session.players.length;
    
    // Check limits
    if (totalPlayers >= session.max_players) {
        showToast('Game is full', 'error');
        return;
    }
    
    // Check bot limits for private games
    if (session.is_private && aiCount >= 3) {
        showToast('Maximum 3 bots allowed', 'error');
        return;
    }
    
    // Private games with bots limited to 4 players total
    if (session.is_private && (totalPlayers + 1) > 4) {
        showToast('Games with bots limited to 4 total players', 'error');
        return;
    }
    
    // Public games check no_bots setting
    if (!session.is_private && session.settings?.no_bots) {
        showToast('This game is set to no bots', 'error');
        return;
    }
    
    send({ type: 'add_ai_player', level: 'medium' });
}

function removeAIPlayer() {
    if (!state.currentSession) return;
    
    // Find the last AI player to remove
    const aiPlayers = state.currentSession.players.filter(p => p.is_ai);
    if (aiPlayers.length === 0) {
        showToast('No bots to remove', 'error');
        return;
    }
    
    // Remove the last added AI
    const lastAI = aiPlayers[aiPlayers.length - 1];
    send({ type: 'remove_ai_player', player_id: lastAI.user_id });
}

function startGame() {
    send({ type: 'start_game' });
}

function leaveWaitingRoom() {
    send({ type: 'leave_session' });
    closeModal('waiting-room-modal');
    closeModal('private-wizard-modal');
}

function copyShareUrl() {
    const url = document.getElementById('wizard-share-url')?.value || document.getElementById('share-url')?.value || state.wizardShareUrl;
    if (url) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link copied!', 'success');
        });
    }
}

function shareViaMessenger() {
    const url = document.getElementById('wizard-share-url')?.value || document.getElementById('share-url')?.value || state.wizardShareUrl;
    const code = state.wizardShareCode || document.getElementById('waiting-room-code')?.textContent || '';
    const text = `Join my Fast Track game! Code: ${code}\n${url}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Fast Track Game',
            text: text,
            url: url
        });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Share link copied!', 'success');
        });
    }
}

// =============================================================================
// Offline / AI Play
// =============================================================================

function playOfflineWithAI() {
    // Go directly to game board with AI opponent
    const params = new URLSearchParams({
        offline: 'true',
        ai_players: '1',
        ai_level: 'medium'
    });
    
    window.location.href = `3d.html?${params.toString()}`;
}

// =============================================================================
// Avatar Picker
// =============================================================================

function showProfileModal() {
    send({ type: 'get_profile' });
    openModal('profile-modal');
}

function showAvatarPicker() {
    closeModal('profile-modal');
    
    state.selectedAvatar = state.user?.avatar_id || 'person_smile';
    
    // Render categories
    const categoriesContainer = document.getElementById('avatar-categories');
    categoriesContainer.innerHTML = Object.entries(AVATAR_CATALOG).map(([id, cat], idx) => `
        <button class="avatar-category ${idx === 0 ? 'active' : ''}" data-category="${id}" onclick="selectAvatarCategory('${id}')">
            ${cat.icon} ${cat.name}
        </button>
    `).join('');
    
    // Render first category
    const firstCategory = Object.keys(AVATAR_CATALOG)[0];
    renderAvatarGrid(firstCategory);
    
    openModal('avatar-modal');
}

function selectAvatarCategory(categoryId) {
    document.querySelectorAll('.avatar-category').forEach(c => c.classList.remove('active'));
    document.querySelector(`.avatar-category[data-category="${categoryId}"]`).classList.add('active');
    renderAvatarGrid(categoryId);
}

function renderAvatarGrid(categoryId) {
    const category = AVATAR_CATALOG[categoryId];
    const container = document.getElementById('avatar-grid');
    
    container.innerHTML = category.avatars.map(avatar => `
        <div class="avatar-option ${state.selectedAvatar === avatar.id ? 'selected' : ''}" 
             data-avatar="${avatar.id}" 
             onclick="selectAvatar('${avatar.id}')"
             title="${avatar.name}">
            ${avatar.emoji}
        </div>
    `).join('');
}

function selectAvatar(avatarId) {
    state.selectedAvatar = avatarId;
    
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.avatar === avatarId);
    });
}

function saveAvatar() {
    send({ type: 'update_profile', avatar_id: state.selectedAvatar });
}

// =============================================================================
// Guilds
// =============================================================================

function showCreateGuild() {
    openModal('create-guild-modal');
}

function createGuild(event) {
    event.preventDefault();
    
    const name = document.getElementById('guild-name').value.trim();
    const tag = document.getElementById('guild-tag').value.trim().toUpperCase();
    
    send({ type: 'create_guild', name, tag });
}

function searchGuilds() {
    const query = document.getElementById('guild-search').value.trim();
    if (query.length >= 2) {
        send({ type: 'search_guilds', query });
    }
}

function renderGuildSearchResults(guilds) {
    const container = document.getElementById('guild-search-results');
    
    if (guilds.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No guilds found</p>';
        return;
    }
    
    container.innerHTML = guilds.map(guild => `
        <div class="session-item" onclick="joinGuild('${guild.guild_id}')">
            <div class="session-info">
                <div class="session-host-avatar">⚔️</div>
                <div class="session-details">
                    <h4>[${guild.tag}] ${guild.name}</h4>
                    <p>${guild.members.length} members</p>
                </div>
            </div>
            <button class="btn btn-small btn-primary">Join</button>
        </div>
    `).join('');
}

function joinGuild(guildId) {
    send({ type: 'join_guild', guild_id: guildId });
}

function renderMyGuild(guild, members) {
    const container = document.getElementById('my-guild-info');
    const createGuildBtn = document.getElementById('create-guild-btn');
    const guildControls = document.getElementById('guild-controls');
    const guildmasterControls = document.getElementById('guildmaster-controls');
    const leaveGuildSection = document.getElementById('leave-guild-section');
    const membersOnlineCard = document.getElementById('guild-members-online-card');
    const guildGamesCard = document.getElementById('guild-games-card');
    const tournamentBtn = document.getElementById('guild-tournament-btn');
    
    // Determine if current user is guildmaster
    const isGuildmaster = guild.guildmaster_id === state.user.id;
    guildState.isGuildmaster = isGuildmaster;
    
    // Show guild info
    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
            <div style="font-size: 3rem;">⚔️</div>
            <div>
                <h3 style="color: var(--text-primary);">[${escapeHtml(guild.tag)}] ${escapeHtml(guild.name)}</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">
                    ${guild.members?.length || members?.length || 1} members • ${guild.total_prestige || 0} total prestige
                    ${isGuildmaster ? '<span style="color: #ffd700; margin-left: 0.5rem;">👑 Guildmaster</span>' : ''}
                </p>
            </div>
        </div>
    `;
    
    // Hide create guild button, show controls
    if (createGuildBtn) createGuildBtn.style.display = 'none';
    if (guildControls) guildControls.style.display = 'block';
    
    // Show/hide guildmaster-specific controls
    if (guildmasterControls) {
        guildmasterControls.style.display = isGuildmaster ? 'block' : 'none';
    }
    if (leaveGuildSection) {
        leaveGuildSection.style.display = isGuildmaster ? 'none' : 'block';
    }
    
    // Show tournament button (guildmasters can create, everyone can view)
    if (tournamentBtn) {
        tournamentBtn.style.display = 'inline-block';
    }
    
    // Show guild cards
    if (membersOnlineCard) membersOnlineCard.style.display = 'block';
    if (guildGamesCard) guildGamesCard.style.display = 'block';
    
    // Show guild chat card and update chat UI
    const chatCard = document.getElementById('guild-chat-card');
    if (chatCard) chatCard.style.display = 'block';
    updateGuildChatUI();
    
    // Update guild state members
    if (members) {
        guildState.members = members.map(m => ({
            id: m.user_id || m.id,
            name: m.username || m.name,
            online: m.online || false,
            isGuildmaster: (m.user_id || m.id) === guild.guildmaster_id,
            prestige_points: m.prestige_points || 0,
            avatar_id: m.avatar_id
        }));
        guildState.onlineMembers = guildState.members.filter(m => m.online);
        
        // Update online members list
        renderGuildOnlineMembers();
    }
    
    // Update online count
    const onlineCountEl = document.getElementById('guild-online-count');
    if (onlineCountEl) {
        onlineCountEl.textContent = guildState.onlineMembers.length + ' online';
    }
}

function renderGuildOnlineMembers() {
    const container = document.getElementById('guild-online-list');
    if (!container) return;
    
    const onlineMembers = guildState.onlineMembers;
    
    if (onlineMembers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No members online</p>';
        return;
    }
    
    container.innerHTML = onlineMembers.map(member => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 0.25rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: #4ade80;"></div>
                <span style="font-size: 0.9rem; color: var(--text-primary);">
                    ${escapeHtml(member.name)}
                    ${member.isGuildmaster ? '<span style="color: #ffd700; font-size: 0.75rem;">👑</span>' : ''}
                </span>
            </div>
            ${member.id !== state.user.id ? `
                <button class="btn btn-small btn-secondary" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;" onclick="inviteGuildMemberToGame('${member.id}')">
                    Invite
                </button>
            ` : ''}
        </div>
    `).join('');
}

// =============================================================================
// Players
// =============================================================================

function searchPlayers() {
    const query = document.getElementById('player-search').value.trim();
    if (query.length >= 2) {
        send({ type: 'search_users', query });
    }
}

function renderPlayerSearchResults(users) {
    const container = document.getElementById('player-search-results');
    
    if (users.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No players found</p>';
        return;
    }
    
    container.innerHTML = users.map(user => `
        <div class="session-item">
            <div class="session-info">
                <div class="session-host-avatar">${getAvatarEmoji(user.avatar_id)}</div>
                <div class="session-details">
                    <h4>${user.username}</h4>
                    <p>
                        <span class="prestige-badge prestige-${user.prestige_level}">${user.prestige_level.toUpperCase()}</span>
                        ${user.prestige_points} pts • ${user.games_won}/${user.games_played} wins
                    </p>
                </div>
            </div>
        </div>
    `).join('');
}

// =============================================================================
// Tutorial
// =============================================================================

function goToTutorialStep(step) {
    state.tutorialStep = step;
    
    document.querySelectorAll('.tutorial-step').forEach((s, i) => {
        s.classList.toggle('active', i === step);
    });
    
    document.querySelectorAll('.tutorial-dot').forEach((d, i) => {
        d.classList.toggle('active', i === step);
    });
}

function nextTutorialStep() {
    const maxStep = document.querySelectorAll('.tutorial-step').length - 1;
    if (state.tutorialStep < maxStep) {
        goToTutorialStep(state.tutorialStep + 1);
    }
}

function prevTutorialStep() {
    if (state.tutorialStep > 0) {
        goToTutorialStep(state.tutorialStep - 1);
    }
}

// =============================================================================
// Chat
// =============================================================================

function sendChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (message) {
        send({ type: 'chat', message });
        input.value = '';
    }
}

function handleChatKeydown(event) {
    if (event.key === 'Enter') {
        sendChat();
    }
}

function addChatMessage(data) {
    const container = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `
        <span class="chat-message-user">${getAvatarEmoji(data.avatar_id)} ${data.username}:</span>
        ${escapeHtml(data.message)}
    `;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
}

// =============================================================================
// Modal Helpers
// =============================================================================

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// =============================================================================
// Toast Notifications
// =============================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =============================================================================
// Guild System
// =============================================================================

// Guild state
let guildState = {
    guild: null,           // Current user's guild if any
    isGuildmaster: false,  // Is current user the guildmaster
    members: [],           // Guild members with online status
    onlineMembers: [],     // Members currently online
    tournaments: [],       // Active tournaments
    pendingInvites: [],    // Tournament invites awaiting approval
    tournamentGuildsToInvite: [] // Selected guilds for new tournament
};

// Chat state
let chatState = {
    enabled: true,              // Guild chat enabled (guildmaster control)
    optedOut: false,            // User has opted out of chat
    approved: false,            // User is approved for chat
    pendingApproval: false,     // Waiting for guildmaster approval
    messages: [],               // Chat messages
    blockedUsers: [],           // Users blocked by current user
    blockedByUsers: [],         // Users who have blocked current user (for filtering)
    pendingApprovals: [],       // Users waiting for chat approval (guildmaster view)
    unblockCooldowns: {}        // Map of userId -> timestamp when they can be blocked again
};

function showCreateGuildGame() {
    showModal('create-guild-game-modal');
}

function createGuildGame(e) {
    e.preventDefault();
    
    const playerCount = parseInt(document.getElementById('guild-game-player-count').value);
    
    // Create guild game - all human, guild members only
    send({
        type: 'create_guild_game',
        guildId: guildState.guild.id,
        players: playerCount,
        settings: {
            guildOnly: true,
            noBots: true,
            requireApproval: false // Any guild member can join
        }
    });
    
    closeModal('create-guild-game-modal');
    showToast('Creating guild game...', 'info');
}

function showGuildMembers() {
    showModal('guild-members-modal');
    loadGuildMembers();
}

function loadGuildMembers() {
    // Request member list from server
    send({ type: 'get_guild_members', guildId: guildState.guild.id });
    
    // Display members from current state
    renderGuildMembersList();
}

function renderGuildMembersList() {
    const container = document.getElementById('guild-members-list');
    
    if (!guildState.members || guildState.members.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No members found</p>';
        return;
    }
    
    container.innerHTML = guildState.members.map(member => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${member.online ? '#4ade80' : '#666'};"></div>
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">
                        ${escapeHtml(member.name)}
                        ${member.isGuildmaster ? '<span style="color: #ffd700; margin-left: 0.5rem;">👑</span>' : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${member.online ? 'Online' : 'Offline'}</div>
                </div>
            </div>
            ${member.online && !member.isGuildmaster && member.id !== state.playerId ? `
                <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;" onclick="inviteGuildMemberToGame('${member.id}')">
                    Invite
                </button>
            ` : ''}
        </div>
    `).join('');
}

function filterGuildMembers() {
    const search = document.getElementById('guild-member-search').value.toLowerCase();
    const container = document.getElementById('guild-members-list');
    
    const filtered = guildState.members.filter(m => 
        m.name.toLowerCase().includes(search)
    );
    
    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No matching members</p>';
        return;
    }
    
    // Re-render with filtered list
    container.innerHTML = filtered.map(member => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${member.online ? '#4ade80' : '#666'};"></div>
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">
                        ${escapeHtml(member.name)}
                        ${member.isGuildmaster ? '<span style="color: #ffd700; margin-left: 0.5rem;">👑</span>' : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${member.online ? 'Online' : 'Offline'}</div>
                </div>
            </div>
            ${member.online && !member.isGuildmaster && member.id !== state.playerId ? `
                <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;" onclick="inviteGuildMemberToGame('${member.id}')">
                    Invite
                </button>
            ` : ''}
        </div>
    `).join('');
}

function inviteGuildMemberToGame(memberId) {
    const member = guildState.members.find(m => m.id === memberId);
    if (!member) return;
    
    send({
        type: 'invite_guild_member',
        memberId: memberId,
        guildId: guildState.guild.id
    });
    
    showToast(`Invited ${member.name} to game`, 'success');
}

function showManageMembers() {
    if (!guildState.isGuildmaster) {
        showToast('Only the Guildmaster can manage members', 'error');
        return;
    }
    
    showModal('manage-members-modal');
    renderManageMembersList();
}

function renderManageMembersList() {
    const container = document.getElementById('manage-members-list');
    
    // Filter out the guildmaster - can't boot yourself
    const bootableMembers = guildState.members.filter(m => !m.isGuildmaster);
    
    if (bootableMembers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No other members in guild</p>';
        return;
    }
    
    container.innerHTML = bootableMembers.map(member => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${member.online ? '#4ade80' : '#666'};"></div>
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">${escapeHtml(member.name)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${member.online ? 'Online' : 'Offline'}</div>
                </div>
            </div>
            <button class="btn" style="font-size: 0.8rem; padding: 0.4rem 0.75rem; background: #ef4444; color: #fff;" onclick="bootGuildMember('${member.id}', '${escapeHtml(member.name)}')">
                Boot
            </button>
        </div>
    `).join('');
}

function bootGuildMember(memberId, memberName) {
    if (!guildState.isGuildmaster) return;
    
    if (!confirm(`Remove ${memberName} from the guild?`)) return;
    
    send({
        type: 'boot_guild_member',
        memberId: memberId,
        guildId: guildState.guild.id
    });
    
    // Remove from local state immediately
    guildState.members = guildState.members.filter(m => m.id !== memberId);
    renderManageMembersList();
    
    showToast(`${memberName} has been removed from the guild`, 'success');
}

function showGuildTournaments() {
    showModal('guild-tournaments-modal');
    loadGuildTournaments();
}

function loadGuildTournaments() {
    send({ type: 'get_guild_tournaments', guildId: guildState.guild.id });
    renderTournamentsList();
}

function renderTournamentsList() {
    const container = document.getElementById('active-tournaments-list');
    const pendingSection = document.getElementById('pending-tournament-invites-section');
    const pendingContainer = document.getElementById('pending-tournament-invites-list');
    
    // Render active tournaments
    if (!guildState.tournaments || guildState.tournaments.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No active tournaments</p>';
    } else {
        container.innerHTML = guildState.tournaments.map(tournament => `
            <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div style="font-weight: 600; color: var(--text-primary);">🏆 ${escapeHtml(tournament.name)}</div>
                    <div style="font-size: 0.75rem; color: ${tournament.status === 'active' ? '#4ade80' : '#ffd700'};">
                        ${tournament.status === 'active' ? 'In Progress' : 'Pending'}
                    </div>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    Guilds: ${tournament.guilds.map(g => g.tag).join(' vs ')}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">
                    ${tournament.matchesPlayed || 0}/${tournament.totalMatches || 0} matches played
                </div>
            </div>
        `).join('');
    }
    
    // Render pending invites (only for guildmaster)
    if (guildState.isGuildmaster && guildState.pendingInvites && guildState.pendingInvites.length > 0) {
        pendingSection.style.display = 'block';
        pendingContainer.innerHTML = guildState.pendingInvites.map(invite => `
            <div style="background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.3); border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">
                    🏆 ${escapeHtml(invite.tournamentName)}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    From: [${escapeHtml(invite.hostGuildTag)}] ${escapeHtml(invite.hostGuildName)}
                </div>
                <div style="display: flex; gap: 0.75rem;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 0.85rem;" onclick="acceptTournamentInvite('${invite.id}')">Accept</button>
                    <button class="btn btn-secondary" style="flex: 1; font-size: 0.85rem;" onclick="declineTournamentInvite('${invite.id}')">Decline</button>
                </div>
            </div>
        `).join('');
    } else {
        pendingSection.style.display = 'none';
    }
}

function acceptTournamentInvite(inviteId) {
    send({
        type: 'respond_tournament_invite',
        inviteId: inviteId,
        response: 'accept'
    });
    
    showToast('Tournament invite accepted', 'success');
    guildState.pendingInvites = guildState.pendingInvites.filter(i => i.id !== inviteId);
    renderTournamentsList();
}

function declineTournamentInvite(inviteId) {
    send({
        type: 'respond_tournament_invite',
        inviteId: inviteId,
        response: 'decline'
    });
    
    showToast('Tournament invite declined', 'info');
    guildState.pendingInvites = guildState.pendingInvites.filter(i => i.id !== inviteId);
    renderTournamentsList();
}

function showCreateTournament() {
    if (!guildState.isGuildmaster) {
        showToast('Only the Guildmaster can create tournaments', 'error');
        return;
    }
    
    guildState.tournamentGuildsToInvite = [];
    document.getElementById('tournament-guild-results').innerHTML = '';
    document.getElementById('invited-guilds-list').style.display = 'none';
    document.getElementById('invited-guilds-tags').innerHTML = '';
    
    showModal('create-tournament-modal');
}

function searchGuildsForTournament() {
    const query = document.getElementById('tournament-guild-search').value.trim();
    if (query.length < 2) {
        document.getElementById('tournament-guild-results').innerHTML = '';
        return;
    }
    
    send({ type: 'search_guilds', query: query });
}

// Called when search results come back
function handleGuildSearchResults(guilds) {
    const container = document.getElementById('tournament-guild-results');
    
    // Filter out own guild and already invited guilds
    const available = guilds.filter(g => 
        g.id !== guildState.guild.id && 
        !guildState.tournamentGuildsToInvite.find(invited => invited.id === g.id)
    );
    
    if (available.length === 0) {
        container.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-secondary);">No matching guilds found</p>';
        return;
    }
    
    container.innerHTML = available.map(guild => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.5rem;">
            <div>
                <span style="font-weight: 600; color: #64d8ff;">[${escapeHtml(guild.tag)}]</span>
                <span style="color: var(--text-primary);">${escapeHtml(guild.name)}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary);">(${guild.memberCount} members)</span>
            </div>
            <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;" onclick="addGuildToTournament('${guild.id}', '${escapeHtml(guild.tag)}', '${escapeHtml(guild.name)}')">
                + Add
            </button>
        </div>
    `).join('');
}

function addGuildToTournament(guildId, tag, name) {
    if (guildState.tournamentGuildsToInvite.find(g => g.id === guildId)) return;
    
    guildState.tournamentGuildsToInvite.push({ id: guildId, tag, name });
    updateInvitedGuildsList();
    
    // Clear search
    document.getElementById('tournament-guild-search').value = '';
    document.getElementById('tournament-guild-results').innerHTML = '';
}

function removeGuildFromTournament(guildId) {
    guildState.tournamentGuildsToInvite = guildState.tournamentGuildsToInvite.filter(g => g.id !== guildId);
    updateInvitedGuildsList();
}

function updateInvitedGuildsList() {
    const container = document.getElementById('invited-guilds-list');
    const tagsContainer = document.getElementById('invited-guilds-tags');
    
    if (guildState.tournamentGuildsToInvite.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    tagsContainer.innerHTML = guildState.tournamentGuildsToInvite.map(guild => `
        <span style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(100,216,255,0.2); color: #64d8ff; padding: 0.3rem 0.6rem; border-radius: 5px; margin-right: 0.5rem; margin-bottom: 0.5rem; font-size: 0.85rem;">
            [${escapeHtml(guild.tag)}] ${escapeHtml(guild.name)}
            <span style="cursor: pointer; opacity: 0.7;" onclick="removeGuildFromTournament('${guild.id}')">×</span>
        </span>
    `).join('');
}

function createGuildTournament(e) {
    e.preventDefault();
    
    const name = document.getElementById('tournament-name').value.trim();
    
    if (guildState.tournamentGuildsToInvite.length === 0) {
        showToast('Please invite at least one guild', 'error');
        return;
    }
    
    send({
        type: 'create_guild_tournament',
        name: name,
        hostGuildId: guildState.guild.id,
        invitedGuildIds: guildState.tournamentGuildsToInvite.map(g => g.id)
    });
    
    closeModal('create-tournament-modal');
    showToast('Tournament invitations sent!', 'success');
}

function showLeaveGuildConfirm() {
    if (guildState.isGuildmaster) {
        showToast('Guildmasters cannot leave. Use "Disband Guild" instead.', 'error');
        return;
    }
    
    document.getElementById('leave-guild-name').textContent = guildState.guild?.name || 'this guild';
    showModal('leave-guild-modal');
}

function leaveGuild() {
    if (guildState.isGuildmaster) return;
    
    send({
        type: 'leave_guild',
        guildId: guildState.guild.id
    });
    
    closeModal('leave-guild-modal');
    showToast('You have left the guild', 'info');
    
    // Reset guild state
    guildState.guild = null;
    guildState.isGuildmaster = false;
    guildState.members = [];
    
    // Update UI to show "No Guild" state
    updateGuildPanel();
}

function showDisbandGuildConfirm() {
    if (!guildState.isGuildmaster) {
        showToast('Only the Guildmaster can disband the guild', 'error');
        return;
    }
    
    showModal('disband-guild-modal');
}

function disbandGuild() {
    if (!guildState.isGuildmaster) return;
    
    send({
        type: 'disband_guild',
        guildId: guildState.guild.id
    });
    
    closeModal('disband-guild-modal');
    showToast('Guild has been disbanded', 'info');
    
    // Reset guild state
    guildState.guild = null;
    guildState.isGuildmaster = false;
    guildState.members = [];
    
    // Update UI
    updateGuildPanel();
}

function updateGuildPanel() {
    // This function updates the guild panel to reflect current state
    const myGuildInfo = document.getElementById('my-guild-info');
    const createGuildBtn = document.getElementById('create-guild-btn');
    const guildControls = document.getElementById('guild-controls');
    const guildmasterControls = document.getElementById('guildmaster-controls');
    const leaveGuildSection = document.getElementById('leave-guild-section');
    const membersOnlineCard = document.getElementById('guild-members-online-card');
    const guildGamesCard = document.getElementById('guild-games-card');
    const guildChatCard = document.getElementById('guild-chat-card');
    const onlineCountEl = document.getElementById('guild-online-count');
    const onlineListEl = document.getElementById('guild-online-list');
    
    if (!guildState.guild) {
        // No guild - reset to default state
        if (myGuildInfo) {
            myGuildInfo.innerHTML = '<p style="color: var(--text-secondary);">You\'re not in a guild yet.</p>';
        }
        if (createGuildBtn) createGuildBtn.style.display = 'inline-block';
        if (guildControls) guildControls.style.display = 'none';
        if (guildmasterControls) guildmasterControls.style.display = 'none';
        if (leaveGuildSection) leaveGuildSection.style.display = 'none';
        if (membersOnlineCard) membersOnlineCard.style.display = 'none';
        if (guildGamesCard) guildGamesCard.style.display = 'none';
        if (guildChatCard) guildChatCard.style.display = 'none';
        if (onlineCountEl) onlineCountEl.textContent = '0 online';
        if (onlineListEl) onlineListEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No members online</p>';
    } else {
        // Has guild - request fresh guild details from server
        send({ type: 'get_guild_details', guild_id: guildState.guild.guild_id || guildState.guild.id });
    }
}

// Handle incoming guild data from server
function handleGuildUpdate(data) {
    if (data.guild) {
        guildState.guild = data.guild;
        guildState.isGuildmaster = data.isGuildmaster || false;
        guildState.members = data.members || [];
        guildState.onlineMembers = guildState.members.filter(m => m.online);
        guildState.tournaments = data.tournaments || [];
        guildState.pendingInvites = data.pendingInvites || [];
        
        // Update online count display
        const onlineCountEl = document.getElementById('guild-online-count');
        if (onlineCountEl) {
            onlineCountEl.textContent = guildState.onlineMembers.length;
        }
        
        // Show/hide guildmaster controls
        const gmControls = document.getElementById('guildmaster-controls');
        const leaveSection = document.getElementById('leave-guild-section');
        if (gmControls) {
            gmControls.style.display = guildState.isGuildmaster ? 'block' : 'none';
        }
        if (leaveSection) {
            leaveSection.style.display = guildState.isGuildmaster ? 'none' : 'block';
        }
        
        // Update chat state from guild data
        if (data.chatEnabled !== undefined) {
            chatState.enabled = data.chatEnabled;
        }
        if (data.chatApproved !== undefined) {
            chatState.approved = data.chatApproved;
            chatState.pendingApproval = !data.chatApproved && !guildState.isGuildmaster;
        }
        if (data.pendingChatApprovals) {
            chatState.pendingApprovals = data.pendingChatApprovals;
            updatePendingApprovalsBadge();
        }
        
        // Show guild chat card
        updateGuildChatUI();
    }
}

// =============================================================================
// Chat System
// =============================================================================

function updateGuildChatUI() {
    const chatCard = document.getElementById('guild-chat-card');
    const chatArea = document.getElementById('guild-chat-area');
    const disabledNotice = document.getElementById('chat-disabled-notice');
    const optedOutNotice = document.getElementById('chat-opted-out-notice');
    const notApprovedNotice = document.getElementById('chat-not-approved-notice');
    const gmChatControls = document.getElementById('guildmaster-chat-controls');
    const toggleBtn = document.getElementById('toggle-guild-chat-text');
    
    if (!guildState.guild) {
        if (chatCard) chatCard.style.display = 'none';
        return;
    }
    
    // Show chat card when in guild
    if (chatCard) chatCard.style.display = 'block';
    
    // Hide all states first
    if (chatArea) chatArea.style.display = 'none';
    if (disabledNotice) disabledNotice.style.display = 'none';
    if (optedOutNotice) optedOutNotice.style.display = 'none';
    if (notApprovedNotice) notApprovedNotice.style.display = 'none';
    
    // Show appropriate state
    if (!chatState.enabled) {
        if (disabledNotice) disabledNotice.style.display = 'block';
    } else if (chatState.optedOut) {
        if (optedOutNotice) optedOutNotice.style.display = 'block';
    } else if (!chatState.approved && !guildState.isGuildmaster) {
        if (notApprovedNotice) notApprovedNotice.style.display = 'block';
    } else {
        if (chatArea) chatArea.style.display = 'block';
    }
    
    // Show guildmaster chat controls
    if (gmChatControls) {
        gmChatControls.style.display = guildState.isGuildmaster ? 'block' : 'none';
    }
    
    // Update toggle button text
    if (toggleBtn) {
        toggleBtn.textContent = chatState.enabled ? 'Disable Chat' : 'Enable Chat';
    }
}

function showChatSettings() {
    const optOutToggle = document.getElementById('chat-opt-out-toggle');
    if (optOutToggle) {
        optOutToggle.checked = chatState.optedOut;
    }
    showModal('chat-settings-modal');
}

function toggleChatOptOut() {
    chatState.optedOut = !chatState.optedOut;
    
    // Save preference locally
    localStorage.setItem('ft_chat_opted_out', chatState.optedOut ? 'true' : 'false');
    
    // Save preference to server
    send({
        type: 'update_chat_preference',
        optedOut: chatState.optedOut
    });
    
    // Update UI
    updateGuildChatUI();
    
    const optToggle = document.getElementById('chat-opt-toggle');
    if (optToggle) {
        optToggle.textContent = chatState.optedOut ? '🔔' : '🔇';
        optToggle.title = chatState.optedOut ? 'Opt back into chat' : 'Opt out of chat';
    }
    
    // Update checkbox in settings modal
    const optOutToggle = document.getElementById('chat-opt-out-toggle');
    if (optOutToggle) {
        optOutToggle.checked = chatState.optedOut;
    }
    
    showToast(chatState.optedOut ? 'You have opted out of chat' : 'Chat enabled', 'info');
}

function toggleGuildChat() {
    if (!guildState.isGuildmaster) return;
    
    chatState.enabled = !chatState.enabled;
    
    send({
        type: 'toggle_guild_chat',
        guildId: guildState.guild.id || guildState.guild.guild_id,
        enabled: chatState.enabled
    });
    
    updateGuildChatUI();
    showToast(chatState.enabled ? 'Guild chat enabled' : 'Guild chat disabled', 'info');
}

function handleGuildChatKeypress(event) {
    if (event.key === 'Enter') {
        sendGuildChatMessage();
    }
}

function sendGuildChatMessage() {
    const input = document.getElementById('guild-chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    if (!guildState.guild) return;
    if (chatState.optedOut || !chatState.enabled) return;
    if (!chatState.approved && !guildState.isGuildmaster) return;
    
    send({
        type: 'guild_chat_message',
        guildId: guildState.guild.id || guildState.guild.guild_id,
        message: message
    });
    
    input.value = '';
}

function addGuildChatMessage(data) {
    // Check if sender is blocked
    if (chatState.blockedUsers.find(u => u.id === data.senderId)) {
        return; // Don't show messages from blocked users
    }
    
    // Check if we're blocked by sender (server should filter, but double-check)
    if (chatState.blockedByUsers.includes(data.senderId)) {
        return;
    }
    
    const container = document.getElementById('guild-chat-messages');
    if (!container) return;
    
    // Remove "no messages" placeholder
    const placeholder = container.querySelector('p');
    if (placeholder && placeholder.textContent.includes('No messages')) {
        placeholder.remove();
    }
    
    const time = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.dataset.senderId = data.senderId;
    messageEl.innerHTML = `
        <div class="chat-message-header">
            <span class="chat-message-sender">
                ${escapeHtml(data.senderName)}
                ${data.isGuildmaster ? '<span style="color: #ffd700; font-size: 0.75rem;">👑</span>' : ''}
            </span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="chat-message-time">${time}</span>
                ${data.senderId !== state.user.id ? `
                    <button class="chat-message-actions btn btn-small btn-secondary" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;" onclick="blockUserFromChat('${data.senderId}', '${escapeHtml(data.senderName)}')">
                        Block
                    </button>
                ` : ''}
            </div>
        </div>
        <div class="chat-message-text">${escapeHtml(data.message)}</div>
    `;
    
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
    
    // Store message
    chatState.messages.push(data);
}

// Chat Approval System
function showChatApprovals() {
    if (!guildState.isGuildmaster) return;
    
    renderChatApprovalsList();
    showModal('chat-approvals-modal');
}

function renderChatApprovalsList() {
    const container = document.getElementById('chat-approval-list');
    if (!container) return;
    
    if (!chatState.pendingApprovals || chatState.pendingApprovals.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No pending approvals</p>';
        return;
    }
    
    container.innerHTML = chatState.pendingApprovals.map(user => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.5rem;">
            <div>
                <div style="font-weight: 500; color: var(--text-primary);">${escapeHtml(user.name)}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Requested chat access</div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-small btn-primary" onclick="approveChatUser('${user.id}')">Approve</button>
                <button class="btn btn-small" style="background: #ef4444; color: #fff;" onclick="denyChatUser('${user.id}')">Deny</button>
            </div>
        </div>
    `).join('');
}

function approveChatUser(userId) {
    send({
        type: 'approve_chat_user',
        guildId: guildState.guild.id || guildState.guild.guild_id,
        userId: userId
    });
    
    // Remove from pending
    chatState.pendingApprovals = chatState.pendingApprovals.filter(u => u.id !== userId);
    renderChatApprovalsList();
    updatePendingApprovalsBadge();
    
    showToast('User approved for chat', 'success');
}

function denyChatUser(userId) {
    send({
        type: 'deny_chat_user',
        guildId: guildState.guild.id || guildState.guild.guild_id,
        userId: userId
    });
    
    // Remove from pending
    chatState.pendingApprovals = chatState.pendingApprovals.filter(u => u.id !== userId);
    renderChatApprovalsList();
    updatePendingApprovalsBadge();
    
    showToast('User denied chat access', 'info');
}

function updatePendingApprovalsBadge() {
    const badge = document.getElementById('pending-approvals-badge');
    if (!badge) return;
    
    const count = chatState.pendingApprovals?.length || 0;
    badge.style.display = count > 0 ? 'inline' : 'none';
    badge.textContent = count;
}

// Blocking System
function showBlockedUsers() {
    loadBlockedUsers();
    showModal('blocked-users-modal');
}

function loadBlockedUsers() {
    send({ type: 'get_blocked_users' });
    renderBlockedUsersList();
}

function renderBlockedUsersList() {
    const container = document.getElementById('blocked-users-list');
    if (!container) return;
    
    if (!chatState.blockedUsers || chatState.blockedUsers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No blocked users</p>';
        return;
    }
    
    const now = Date.now();
    
    container.innerHTML = chatState.blockedUsers.map(user => {
        const cooldownEnd = chatState.unblockCooldowns[user.id];
        const canBlock = !cooldownEnd || now >= cooldownEnd;
        const cooldownRemaining = cooldownEnd ? Math.max(0, Math.ceil((cooldownEnd - now) / (1000 * 60 * 60))) : 0;
        
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 0.5rem;">
                <div>
                    <div style="font-weight: 500; color: var(--text-primary);">${escapeHtml(user.name)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">Blocked ${user.blockedAt ? new Date(user.blockedAt).toLocaleDateString() : 'recently'}</div>
                </div>
                <button class="btn btn-small btn-secondary" onclick="unblockUser('${user.id}', '${escapeHtml(user.name)}')">
                    Unblock
                </button>
            </div>
        `;
    }).join('');
}

function searchUsersToBlock() {
    const query = document.getElementById('block-user-search').value.trim();
    if (query.length < 2) {
        document.getElementById('block-user-results').innerHTML = '';
        return;
    }
    
    send({ type: 'search_users_to_block', query: query });
}

function handleBlockUserSearchResults(users) {
    const container = document.getElementById('block-user-results');
    if (!container) return;
    
    // Filter out already blocked users and self
    const available = users.filter(u => 
        u.id !== state.user.id && 
        !chatState.blockedUsers.find(b => b.id === u.id)
    );
    
    if (available.length === 0) {
        container.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-secondary);">No matching users</p>';
        return;
    }
    
    // Check for cooldowns
    const now = Date.now();
    
    container.innerHTML = available.map(user => {
        const cooldownEnd = chatState.unblockCooldowns[user.id];
        const canBlock = !cooldownEnd || now >= cooldownEnd;
        const cooldownHours = cooldownEnd ? Math.max(0, Math.ceil((cooldownEnd - now) / (1000 * 60 * 60))) : 0;
        
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 0.25rem;">
                <span style="font-size: 0.9rem; color: var(--text-primary);">${escapeHtml(user.name)}</span>
                ${canBlock ? `
                    <button class="btn btn-small" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; background: #ef4444; color: #fff;" onclick="blockUser('${user.id}', '${escapeHtml(user.name)}')">
                        Block
                    </button>
                ` : `
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">${cooldownHours}h cooldown</span>
                `}
            </div>
        `;
    }).join('');
}

function blockUser(userId, userName) {
    // Check cooldown
    const cooldownEnd = chatState.unblockCooldowns[userId];
    if (cooldownEnd && Date.now() < cooldownEnd) {
        const hours = Math.ceil((cooldownEnd - Date.now()) / (1000 * 60 * 60));
        showToast(`Must wait ${hours} hours before blocking this user again`, 'error');
        return;
    }
    
    send({
        type: 'block_user',
        userId: userId
    });
    
    // Add to local blocked list
    chatState.blockedUsers.push({ id: userId, name: userName, blockedAt: Date.now() });
    
    // Clear search
    document.getElementById('block-user-search').value = '';
    document.getElementById('block-user-results').innerHTML = '';
    
    renderBlockedUsersList();
    showToast('User blocked', 'info');
    
    // Remove their messages from chat
    removeBlockedUserMessages(userId);
}

function blockUserFromChat(userId, userName) {
    if (confirm(`Block ${userName}? This is silent and they won't know.`)) {
        blockUser(userId, userName);
    }
}

function unblockUser(userId, userName) {
    send({
        type: 'unblock_user',
        userId: userId
    });
    
    // Remove from blocked list
    chatState.blockedUsers = chatState.blockedUsers.filter(u => u.id !== userId);
    
    // Set 24-hour cooldown before can block again
    chatState.unblockCooldowns[userId] = Date.now() + (24 * 60 * 60 * 1000);
    
    // Save cooldowns to localStorage
    localStorage.setItem('ft_block_cooldowns', JSON.stringify(chatState.unblockCooldowns));
    
    renderBlockedUsersList();
    showToast(`${userName} unblocked. Must wait 24h to block again.`, 'info');
}

function removeBlockedUserMessages(userId) {
    // Remove from DOM
    const messages = document.querySelectorAll(`.chat-message[data-sender-id="${userId}"]`);
    messages.forEach(el => el.remove());
    
    // Remove from state
    chatState.messages = chatState.messages.filter(m => m.senderId !== userId);
}

function loadBlockCooldowns() {
    try {
        const stored = localStorage.getItem('ft_block_cooldowns');
        if (stored) {
            chatState.unblockCooldowns = JSON.parse(stored);
            
            // Clean up expired cooldowns
            const now = Date.now();
            Object.keys(chatState.unblockCooldowns).forEach(userId => {
                if (chatState.unblockCooldowns[userId] < now) {
                    delete chatState.unblockCooldowns[userId];
                }
            });
        }
    } catch (e) {
        console.error('Error loading block cooldowns:', e);
    }
}

// Handle chat-related server messages
function onChatUpdate(data) {
    if (data.enabled !== undefined) {
        chatState.enabled = data.enabled;
    }
    if (data.approved !== undefined) {
        chatState.approved = data.approved;
    }
    if (data.pendingApprovals) {
        chatState.pendingApprovals = data.pendingApprovals;
        updatePendingApprovalsBadge();
    }
    
    updateGuildChatUI();
}

function onBlockedUsersUpdate(data) {
    chatState.blockedUsers = data.blockedUsers || [];
    chatState.blockedByUsers = data.blockedByUsers || [];
    renderBlockedUsersList();
}

function onGuildChatMessage(data) {
    addGuildChatMessage(data);
}

// =============================================================================
// Utilities
// =============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
    // Check URL for join code
    // Check URL for actions that should auto-login as guest
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const action = params.get('action');
    
    if (code) {
        state.pendingAction = 'code';
        state.pendingCode = code;
    } else if (action === 'private') {
        state.pendingAction = 'private';
    } else if (action === 'join') {
        state.pendingAction = 'join';
    }
    
    // Load block cooldowns from localStorage
    loadBlockCooldowns();
    
    // Load chat opt-out preference
    const chatOptedOut = localStorage.getItem('ft_chat_opted_out');
    if (chatOptedOut === 'true') {
        chatState.optedOut = true;
    }
    
    // Connect to lobby
    connectToLobby();
    
    // Ping every 30 seconds to keep connection alive
    setInterval(() => {
        if (state.connected) {
            send({ type: 'ping' });
        }
    }, 30000);
}

// Start
document.addEventListener('DOMContentLoaded', init);
