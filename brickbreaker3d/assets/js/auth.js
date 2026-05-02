// BrickBreaker 3D - Authentication & User Management System
// Handles login, registration, profiles, avatars, and admin moderation

const AVATARS = [
    { id: 1, emoji: '👾', name: 'Ghost' },
    { id: 2, emoji: '🎮', name: 'Gamer' },
    { id: 3, emoji: '⚡', name: 'Bolt' },
    { id: 4, emoji: '🌟', name: 'Star' },
    { id: 5, emoji: '🔥', name: 'Fire' },
    { id: 6, emoji: '🎯', name: 'Target' },
    { id: 7, emoji: '🚀', name: 'Rocket' },
    { id: 8, emoji: '💎', name: 'Diamond' },
    { id: 9, emoji: '🏆', name: 'Trophy' },
    { id: 10, emoji: '⭐', name: 'Comet' },
    { id: 11, emoji: '🎪', name: 'Carnival' },
    { id: 12, emoji: '🎭', name: 'Drama' }
];

class AuthSystem {
    constructor() {
        this.currentUser = this.loadSession();
        this.users = this.loadUsers();
        this.bannedUsers = this.loadBannedUsers();
    }

    loadSession() {
        const session = localStorage.getItem('bb3d_session');
        return session ? JSON.parse(session) : null;
    }

    saveSession(user) {
        localStorage.setItem('bb3d_session', JSON.stringify(user));
        this.currentUser = user;
    }

    clearSession() {
        localStorage.removeItem('bb3d_session');
        this.currentUser = null;
    }

    loadUsers() {
        const users = localStorage.getItem('bb3d_users');
        return users ? JSON.parse(users) : {};
    }

    saveUsers() {
        localStorage.setItem('bb3d_users', JSON.stringify(this.users));
    }

    loadBannedUsers() {
        const banned = localStorage.getItem('bb3d_banned');
        return banned ? JSON.parse(banned) : [];
    }

    saveBannedUsers() {
        localStorage.setItem('bb3d_banned', JSON.stringify(this.bannedUsers));
    }

    register(email, password, username, avatarId) {
        // Validate inputs
        if (!email || !password || !username || !avatarId) {
            return { success: false, error: 'All fields required' };
        }

        if (username.length < 3 || username.length > 20) {
            return { success: false, error: 'Username must be 3-20 characters' };
        }

        if (password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        if (Object.values(this.users).some(u => u.username === username)) {
            return { success: false, error: 'Username already taken' };
        }

        if (Object.values(this.users).some(u => u.email === email)) {
            return { success: false, error: 'Email already registered' };
        }

        // Create user
        const userId = Date.now().toString();
        const user = {
            id: userId,
            email: email,
            password: btoa(password), // Basic encoding (NOT FOR PRODUCTION)
            username: username,
            avatarId: avatarId,
            avatar: AVATARS[avatarId - 1],
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            stats: {
                gamesPlayed: 0,
                gamesWon: 0,
                totalScore: 0,
                bestScore: 0
            }
        };

        this.users[userId] = user;
        this.saveUsers();
        this.saveSession(user);

        return { success: true, user: user };
    }

    login(email, password) {
        const user = Object.values(this.users).find(u => u.email === email);

        if (!user) {
            return { success: false, error: 'Email not found' };
        }

        if (user.password !== btoa(password)) {
            return { success: false, error: 'Incorrect password' };
        }

        // Check if user is banned
        if (this.isBanned(user.id)) {
            return { success: false, error: 'Account has been suspended' };
        }

        user.lastLogin = new Date().toISOString();
        this.users[user.id] = user;
        this.saveUsers();
        this.saveSession(user);

        return { success: true, user: user };
    }

    isBanned(userId) {
        const banned = this.bannedUsers.find(b => b.userId === userId);
        if (!banned) return false;

        // Check if suspension has expired
        if (banned.expiresAt && new Date(banned.expiresAt) < new Date()) {
            this.bannedUsers = this.bannedUsers.filter(b => b.userId !== userId);
            this.saveBannedUsers();
            return false;
        }

        return true;
    }

    logout() {
        this.clearSession();
    }

    updateStats(userId, gameResult) {
        const user = this.users[userId];
        if (!user) return;

        user.stats.gamesPlayed++;
        if (gameResult.won) user.stats.gamesWon++;
        user.stats.totalScore += gameResult.score;
        if (gameResult.score > user.stats.bestScore) {
            user.stats.bestScore = gameResult.score;
        }

        this.users[userId] = user;
        this.saveUsers();

        // Update session if it's the current user
        if (this.currentUser && this.currentUser.id === userId) {
            this.currentUser.stats = user.stats;
            this.saveSession(this.currentUser);
        }
    }

    banUser(userId, reason, durationHours = null) {
        const expiresAt = durationHours ?
            new Date(Date.now() + durationHours * 60 * 60 * 1000) :
            null;

        this.bannedUsers.push({
            userId: userId,
            reason: reason,
            bannedAt: new Date().toISOString(),
            expiresAt: expiresAt,
            permanent: !durationHours
        });

        this.saveBannedUsers();
    }

    unbanUser(userId) {
        this.bannedUsers = this.bannedUsers.filter(b => b.userId !== userId);
        this.saveBannedUsers();
    }

    getUser(userId) {
        return this.users[userId];
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }
}

// Global auth instance
const authSystem = new AuthSystem();

// UI Functions
function showAuthScreen() {
    if (authSystem.isLoggedIn()) {
        showGameMenu();
    } else {
        showLoginRegisterChoice();
    }
}

function showLoginRegisterChoice() {
    const html = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.98); padding: 50px; border: 3px solid #00ffcc;
                    border-radius: 15px; text-align: center; z-index: 1100; font-family: Orbitron;">
            <h1 style="color: #00ffcc; margin-bottom: 10px; text-shadow: 0 0 30px rgba(0,255,204,0.8);
                      font-size: 48px; letter-spacing: 3px;">BRICKBREAKER 3D</h1>
            <p style="color: #00ff88; margin-bottom: 40px; font-size: 16px;">
                MULTIPLAYER EDITION
            </p>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                <button onclick="showLoginScreen()"
                        style="padding: 15px 40px; font-size: 18px; background: linear-gradient(90deg, #00ffcc, #00ff88);
                               color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;
                               letter-spacing: 2px; font-family: Orbitron;">
                    🔓 LOGIN
                </button>

                <button onclick="showRegisterScreen()"
                        style="padding: 15px 40px; font-size: 18px; background: linear-gradient(90deg, #00ff88, #8a2be2);
                               color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;
                               letter-spacing: 2px; font-family: Orbitron;">
                    ✨ CREATE ACCOUNT
                </button>

                <button onclick="playAsSinglePlayer()"
                        style="padding: 15px 40px; font-size: 16px; background: rgba(100,100,100,0.8);
                               color: #ccc; border: 1px solid #666; border-radius: 8px; cursor: pointer;
                               letter-spacing: 2px; font-family: Orbitron;">
                    🎮 SINGLE PLAYER (NO ACCOUNT)
                </button>
            </div>

            <p style="color: #666; font-size: 11px; margin-top: 30px;">
                Multiplayer requires login to track stats and prevent abuse
            </p>
        </div>
    `;
    document.body.innerHTML = html;
}

function showLoginScreen() {
    const html = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.98); padding: 40px; border: 2px solid #00ffcc;
                    border-radius: 15px; z-index: 1100; font-family: Orbitron;
                    min-width: 350px;">
            <h2 style="color: #00ffcc; margin-bottom: 30px; text-align: center;">LOGIN</h2>

            <div style="display: flex; flex-direction: column; gap: 15px;">
                <input type="email" id="loginEmail" placeholder="EMAIL ADDRESS"
                       style="padding: 12px; background: rgba(255,255,255,0.1); color: #00ffcc;
                              border: 1px solid #00ffcc; border-radius: 5px; font-family: Orbitron;
                              text-align: center;" />

                <input type="password" id="loginPassword" placeholder="PASSWORD"
                       style="padding: 12px; background: rgba(255,255,255,0.1); color: #00ffcc;
                              border: 1px solid #00ffcc; border-radius: 5px; font-family: Orbitron;
                              text-align: center;" />

                <button onclick="handleLogin()"
                        style="padding: 12px; background: #00ffcc; color: #000; border: none;
                               border-radius: 5px; font-weight: bold; cursor: pointer; font-family: Orbitron;">
                    SIGNIN
                </button>

                <button onclick="showLoginRegisterChoice()"
                        style="padding: 12px; background: rgba(100,100,100,0.5); color: #aaa;
                               border: none; border-radius: 5px; cursor: pointer; font-family: Orbitron;">
                    BACK
                </button>
            </div>

            <div id="loginError" style="color: #ff6b6b; margin-top: 15px; text-align: center;
                                        font-size: 12px;"></div>
        </div>
    `;
    document.body.innerHTML = html;
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const result = authSystem.login(email, password);

    if (result.success) {
        showGameMenu();
    } else {
        document.getElementById('loginError').textContent = result.error;
    }
}

function showRegisterScreen() {
    const html = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.98); padding: 40px; border: 2px solid #00ffcc;
                    border-radius: 15px; z-index: 1100; font-family: Orbitron;
                    max-height: 90vh; overflow: hidden; min-width: 350px;">
            <h2 style="color: #00ffcc; margin-bottom: 20px; text-align: center;">CREATE ACCOUNT</h2>

            <div style="display: flex; flex-direction: column; gap: 12px;">
                <input type="email" id="regEmail" placeholder="EMAIL ADDRESS"
                       style="padding: 10px; background: rgba(255,255,255,0.1); color: #00ffcc;
                              border: 1px solid #00ffcc; border-radius: 5px; font-family: Orbitron;
                              text-align: center; font-size: 12px;" />

                <input type="password" id="regPassword" placeholder="PASSWORD (6+ chars)"
                       style="padding: 10px; background: rgba(255,255,255,0.1); color: #00ffcc;
                              border: 1px solid #00ffcc; border-radius: 5px; font-family: Orbitron;
                              text-align: center; font-size: 12px;" />

                <input type="text" id="regUsername" placeholder="USERNAME (3-20 chars)"
                       style="padding: 10px; background: rgba(255,255,255,0.1); color: #00ffcc;
                              border: 1px solid #00ffcc; border-radius: 5px; font-family: Orbitron;
                              text-align: center; font-size: 12px;" />

                <div style="color: #00ff88; font-size: 12px; text-align: center; margin-top: 10px;">
                    SELECT AVATAR:
                </div>

                <div id="avatarGrid" style="display: grid; grid-template-columns: repeat(4, 1fr);
                                           gap: 8px; margin-bottom: 15px;">
                </div>

                <button onclick="handleRegister()"
                        style="padding: 12px; background: #00ffcc; color: #000; border: none;
                               border-radius: 5px; font-weight: bold; cursor: pointer; font-family: Orbitron;">
                    CREATE ACCOUNT
                </button>

                <button onclick="showLoginRegisterChoice()"
                        style="padding: 12px; background: rgba(100,100,100,0.5); color: #aaa;
                               border: none; border-radius: 5px; cursor: pointer; font-family: Orbitron;">
                    BACK
                </button>
            </div>

            <div id="regError" style="color: #ff6b6b; margin-top: 15px; text-align: center;
                                      font-size: 12px;"></div>
        </div>
    `;

    document.body.innerHTML = html;

    // Populate avatar grid
    const grid = document.getElementById('avatarGrid');
    AVATARS.forEach(avatar => {
        const btn = document.createElement('button');
        btn.innerHTML = avatar.emoji;
        btn.style.cssText = `
            padding: 12px; font-size: 24px; background: rgba(0,255,204,0.2);
            border: 2px solid #00ffcc; border-radius: 5px; cursor: pointer;
            transition: all 0.2s;
        `;
        btn.onclick = () => {
            document.querySelectorAll('#avatarGrid button').forEach(b => {
                b.style.borderColor = '#00ffcc';
                b.style.background = 'rgba(0,255,204,0.2)';
            });
            btn.style.borderColor = '#00ff88';
            btn.style.background = 'rgba(0,255,136,0.5)';
            document.getElementById('selectedAvatar').value = avatar.id;
        };
        grid.appendChild(btn);
    });

    grid.innerHTML += `<input type="hidden" id="selectedAvatar" value="1" />`;
}

function handleRegister() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const username = document.getElementById('regUsername').value;
    const avatarId = parseInt(document.getElementById('selectedAvatar').value);

    const result = authSystem.register(email, password, username, avatarId);

    if (result.success) {
        showGameMenu();
    } else {
        document.getElementById('regError').textContent = result.error;
    }
}

function playAsSinglePlayer() {
    // Create temporary single player session
    document.body.innerHTML = '';
    startGame('singleplayer', 1);
}

// Initialize the auth screen on load
window.addEventListener('load', () => {
    showAuthScreen();
});
