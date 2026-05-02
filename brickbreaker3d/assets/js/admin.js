// BrickBreaker 3D - Admin Moderation Panel
// Manage users, ban/suspend, view stats

class AdminPanel {
    constructor() {
        this.adminPassword = 'admin123'; // Should be hashed in production
        this.isAdminLoggedIn = false;
    }

    checkAdminAuth(password) {
        if (password === this.adminPassword) {
            this.isAdminLoggedIn = true;
            return true;
        }
        return false;
    }

    showPanel() {
        if (!this.isAdminLoggedIn) {
            this.showAdminLogin();
            return;
        }

        const users = authSystem.users;
        const banned = authSystem.bannedUsers;

        let userListHTML = '<div style="max-height: 400px; overflow: hidden;">';

        Object.values(users).forEach(user => {
            const isBanned = authSystem.isBanned(user.id);
            const banInfo = banned.find(b => b.userId === user.id);

            userListHTML += `
                <div style="background: rgba(0,255,204,0.1); padding: 15px; margin-bottom: 10px;
                            border: 1px solid #00ffcc; border-radius: 5px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${user.avatar.emoji} ${user.username}</strong><br>
                            <span style="color: #aaa; font-size: 11px;">${user.email}</span><br>
                            <span style="color: #00ff88;">Wins: ${user.stats.gamesWon} | Score: ${user.stats.bestScore}</span>
                        </div>
                        <div style="display: flex; gap: 5px; flex-direction: column;">
                            ${isBanned ? `
                                <button onclick="adminPanel.unbanUserUI('${user.id}')"
                                        style="padding: 5px 10px; background: #00ff88; color: #000;
                                               border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">
                                    UNBAN
                                </button>
                                <span style="color: #ff6b6b; font-size: 10px;">
                                    ${banInfo.permanent ? 'PERMANENT' : `Expires: ${new Date(banInfo.expiresAt).toLocaleDateString()}`}
                                </span>
                            ` : `
                                <button onclick="adminPanel.showBanOptions('${user.id}', '${user.username}')"
                                        style="padding: 5px 10px; background: #ff6b6b; color: #fff;
                                               border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">
                                    BAN
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        });

        userListHTML += '</div>';

        const html = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        background: rgba(0,0,0,0.98); padding: 40px; border: 3px solid #8a2be2;
                        border-radius: 15px; z-index: 2000; font-family: Orbitron;
                        max-width: 700px; max-height: 90vh; overflow: hidden;">
                <h1 style="color: #8a2be2; margin-bottom: 20px; text-align: center;">
                    🛡️ ADMIN MODERATION PANEL
                </h1>

                <div style="background: rgba(138,43,226,0.2); padding: 15px; border-radius: 8px;
                            margin-bottom: 20px; border: 1px solid #8a2be2;">
                    <h3 style="color: #8a2be2; margin-bottom: 10px;">User Statistics</h3>
                    <div style="color: #00ffcc; font-size: 12px;">
                        <div>Total Users: <strong>${Object.keys(users).length}</strong></div>
                        <div>Banned Users: <strong>${banned.length}</strong></div>
                        <div>Active Users: <strong>${Object.keys(users).length - banned.length}</strong></div>
                    </div>
                </div>

                <h3 style="color: #00ffcc; margin-bottom: 15px;">User Management</h3>
                ${userListHTML}

                <button onclick="adminPanel.logout()"
                        style="width: 100%; padding: 12px; background: #8a2be2; color: #fff;
                               border: none; border-radius: 5px; cursor: pointer; font-weight: bold;
                               margin-top: 20px; font-family: Orbitron;">
                    LOGOUT
                </button>
            </div>
        `;

        document.body.innerHTML += html;
    }

    showAdminLogin() {
        const html = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        background: rgba(0,0,0,0.98); padding: 40px; border: 3px solid #8a2be2;
                        border-radius: 15px; z-index: 2000; font-family: Orbitron;
                        min-width: 300px;">
                <h2 style="color: #8a2be2; margin-bottom: 30px; text-align: center;">🛡️ ADMIN LOGIN</h2>

                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <input type="password" id="adminPass" placeholder="ADMIN PASSWORD"
                           style="padding: 12px; background: rgba(255,255,255,0.1); color: #8a2be2;
                                  border: 2px solid #8a2be2; border-radius: 5px; font-family: Orbitron;
                                  text-align: center;" />

                    <button onclick="adminPanel.handleAdminLogin()"
                            style="padding: 12px; background: #8a2be2; color: #fff; border: none;
                                   border-radius: 5px; font-weight: bold; cursor: pointer; font-family: Orbitron;">
                        LOGIN
                    </button>
                </div>

                <div id="adminError" style="color: #ff6b6b; margin-top: 15px; text-align: center;
                                            font-size: 12px;"></div>
            </div>
        `;

        document.body.innerHTML = html;
    }

    handleAdminLogin() {
        const password = document.getElementById('adminPass').value;

        if (this.checkAdminAuth(password)) {
            this.showPanel();
        } else {
            document.getElementById('adminError').textContent = 'Invalid admin password';
        }
    }

    showBanOptions(userId, username) {
        const html = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                        background: rgba(0,0,0,0.98); padding: 30px; border: 2px solid #ff6b6b;
                        border-radius: 15px; z-index: 2100; font-family: Orbitron;
                        text-align: center;">
                <h3 style="color: #ff6b6b; margin-bottom: 20px;">Ban ${username}?</h3>

                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                    <input type="text" id="banReason" placeholder="BAN REASON"
                           style="padding: 10px; background: rgba(255,255,255,0.1); color: #ff6b6b;
                                  border: 1px solid #ff6b6b; border-radius: 5px; font-family: Orbitron;
                                  text-align: center;" />

                    <div style="color: #00ffcc; font-size: 12px;">Ban Duration:</div>

                    <div style="display: flex; gap: 10px;">
                        <button onclick="adminPanel.banUserUI('${userId}', 1)"
                                style="flex: 1; padding: 10px; background: #ffaa00; color: #000;
                                       border: none; border-radius: 5px; cursor: pointer; font-size: 11px;">
                            1 HOUR
                        </button>
                        <button onclick="adminPanel.banUserUI('${userId}', 24)"
                                style="flex: 1; padding: 10px; background: #ff8800; color: #000;
                                       border: none; border-radius: 5px; cursor: pointer; font-size: 11px;">
                            1 DAY
                        </button>
                        <button onclick="adminPanel.banUserUI('${userId}', null)"
                                style="flex: 1; padding: 10px; background: #ff6b6b; color: #fff;
                                       border: none; border-radius: 5px; cursor: pointer; font-size: 11px;">
                            PERMANENT
                        </button>
                    </div>
                </div>

                <button onclick="adminPanel.showPanel()"
                        style="width: 100%; padding: 10px; background: rgba(100,100,100,0.5); color: #aaa;
                               border: none; border-radius: 5px; cursor: pointer; font-family: Orbitron;">
                    CANCEL
                </button>
            </div>
        `;

        document.body.innerHTML += html;
    }

    banUserUI(userId, durationHours) {
        const reason = document.getElementById('banReason').value || 'Violation of terms';
        authSystem.banUser(userId, reason, durationHours);
        this.showPanel();
    }

    unbanUserUI(userId) {
        authSystem.unbanUser(userId);
        this.showPanel();
    }

    logout() {
        this.isAdminLoggedIn = false;
        showAuthScreen();
    }
}

// Global admin panel instance
const adminPanel = new AdminPanel();

// Access admin panel with keycode (Ctrl+Shift+A)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
        adminPanel.showPanel();
    }
});
