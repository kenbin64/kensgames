/**
 * ============================================================
 * FASTTRACK AUTH UI
 * ButterflyFX Manifold Pattern - Login/Register Interface
 * ============================================================
 */

const AuthUI = {
    version: '1.0.0',
    name: 'FastTrack Auth UI',
    
    // DOM Elements
    container: null,
    
    // Callbacks
    onLoginSuccess: null,
    onLogoutSuccess: null,
    
    // Current state
    currentView: 'login', // login, register, profile
    currentUser: null,
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    init: function(containerId = 'auth-container') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = containerId;
            document.body.appendChild(this.container);
        }
        
        // Check for existing session
        const session = AuthSubstrate?.checkSession();
        if (session?.valid) {
            this.currentUser = AuthSubstrate.getUserById(session.userId);
            this.currentView = 'profile';
        }
        
        this.render();
        
        console.log('Auth UI initialized');
    },
    
    destroy: function() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    },
    
    // ============================================================
    // RENDER
    // ============================================================
    
    render: function() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <style>
                .auth-container {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    max-width: 400px;
                    margin: 0 auto;
                }
                
                .auth-card {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 12px;
                    padding: 30px;
                    color: #fff;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                }
                
                .auth-header {
                    text-align: center;
                    margin-bottom: 25px;
                }
                
                .auth-logo {
                    font-size: 48px;
                    margin-bottom: 10px;
                }
                
                .auth-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #e94560;
                }
                
                .auth-subtitle {
                    font-size: 14px;
                    color: #888;
                    margin-top: 5px;
                }
                
                .auth-form {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                
                .auth-form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                
                .auth-label {
                    font-size: 14px;
                    color: #aaa;
                }
                
                .auth-input {
                    padding: 12px 15px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid #0f3460;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .auth-input:focus {
                    outline: none;
                    border-color: #e94560;
                    box-shadow: 0 0 10px rgba(233, 69, 96, 0.2);
                }
                
                .auth-input::placeholder {
                    color: #555;
                }
                
                .auth-btn {
                    background: linear-gradient(135deg, #e94560 0%, #c93b55 100%);
                    border: none;
                    color: white;
                    padding: 14px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: all 0.2s;
                    margin-top: 10px;
                }
                
                .auth-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(233, 69, 96, 0.4);
                }
                
                .auth-btn:disabled {
                    background: #444;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .auth-btn-secondary {
                    background: transparent;
                    border: 1px solid #0f3460;
                    color: #aaa;
                }
                
                .auth-btn-secondary:hover {
                    background: rgba(15, 52, 96, 0.3);
                    border-color: #e94560;
                    color: #fff;
                    box-shadow: none;
                }
                
                .auth-error {
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid #ef4444;
                    color: #fca5a5;
                    padding: 10px 15px;
                    border-radius: 6px;
                    font-size: 13px;
                    display: none;
                }
                
                .auth-error.visible {
                    display: block;
                }
                
                .auth-success {
                    background: rgba(34, 197, 94, 0.2);
                    border: 1px solid #22c55e;
                    color: #86efac;
                    padding: 10px 15px;
                    border-radius: 6px;
                    font-size: 13px;
                    display: none;
                }
                
                .auth-success.visible {
                    display: block;
                }
                
                .auth-switch {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 14px;
                    color: #888;
                }
                
                .auth-switch-link {
                    color: #00d9ff;
                    cursor: pointer;
                    text-decoration: underline;
                }
                
                .auth-switch-link:hover {
                    color: #e94560;
                }
                
                /* Profile view */
                .profile-header {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin-bottom: 25px;
                }
                
                .profile-avatar {
                    font-size: 64px;
                    width: 80px;
                    height: 80px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 50%;
                }
                
                .profile-info h2 {
                    font-size: 20px;
                    color: #e94560;
                    margin: 0;
                }
                
                .profile-username {
                    color: #888;
                    font-size: 14px;
                }
                
                .profile-stats {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin-bottom: 20px;
                }
                
                .profile-stat {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                }
                
                .profile-stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #00d9ff;
                }
                
                .profile-stat-label {
                    font-size: 11px;
                    color: #888;
                    margin-top: 4px;
                }
                
                .profile-section {
                    margin-bottom: 15px;
                }
                
                .profile-section-title {
                    font-size: 14px;
                    color: #aaa;
                    margin-bottom: 8px;
                }
                
                .profile-guild {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px;
                    background: rgba(15, 52, 96, 0.3);
                    border-radius: 6px;
                }
                
                .profile-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 20px;
                }
                
                /* Blocked notice */
                .auth-blocked {
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid #ef4444;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .auth-blocked-title {
                    color: #fca5a5;
                    font-weight: bold;
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                
                .auth-blocked-reason {
                    color: #f87171;
                    font-size: 14px;
                    margin-bottom: 10px;
                }
                
                .auth-blocked-expires {
                    color: #888;
                    font-size: 12px;
                }
                
                .auth-appeal-btn {
                    background: #ef4444;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    margin-top: 10px;
                }
                
                /* =============================================
                   RESPONSIVE MOBILE STYLES
                   ============================================= */
                @media (max-width: 768px) {
                    .auth-container {
                        max-width: 100%;
                        padding: 15px;
                    }
                    
                    .auth-card {
                        padding: 20px;
                        border-radius: 8px;
                    }
                    
                    .auth-logo {
                        font-size: 42px;
                    }
                    
                    .auth-title {
                        font-size: 20px;
                    }
                    
                    .auth-input {
                        padding: 14px;
                        font-size: 16px; /* Prevent zoom on mobile */
                    }
                    
                    .auth-btn {
                        padding: 16px 20px;
                        font-size: 16px;
                    }
                    
                    .profile-header {
                        flex-direction: column;
                        text-align: center;
                        gap: 15px;
                    }
                    
                    .profile-avatar {
                        font-size: 56px;
                        width: 70px;
                        height: 70px;
                    }
                    
                    .profile-stats {
                        grid-template-columns: repeat(3, 1fr);
                        gap: 8px;
                    }
                    
                    .profile-stat {
                        padding: 12px 8px;
                    }
                    
                    .profile-stat-value {
                        font-size: 20px;
                    }
                    
                    .profile-stat-label {
                        font-size: 10px;
                    }
                }
                
                @media (max-width: 480px) {
                    .auth-container {
                        padding: 10px;
                    }
                    
                    .auth-card {
                        padding: 15px;
                    }
                    
                    .auth-header {
                        margin-bottom: 20px;
                    }
                    
                    .auth-logo {
                        font-size: 36px;
                    }
                    
                    .auth-title {
                        font-size: 18px;
                    }
                    
                    .auth-subtitle {
                        font-size: 12px;
                    }
                    
                    .auth-form {
                        gap: 12px;
                    }
                    
                    .auth-label {
                        font-size: 13px;
                    }
                    
                    .profile-stats {
                        grid-template-columns: repeat(3, 1fr);
                        gap: 6px;
                    }
                    
                    .profile-stat {
                        padding: 10px 6px;
                    }
                    
                    .profile-stat-value {
                        font-size: 18px;
                    }
                }
            </style>
            
            <div class="auth-container">
                <div class="auth-card" id="auth-content">
                    ${this.renderContent()}
                </div>
            </div>
        `;
    },
    
    renderContent: function() {
        switch (this.currentView) {
            case 'login':
                return this.renderLogin();
            case 'register':
                return this.renderRegister();
            case 'profile':
                return this.renderProfile();
            default:
                return this.renderLogin();
        }
    },
    
    renderLogin: function() {
        return `
            <div class="auth-header">
                <div class="auth-logo">🎲</div>
                <div class="auth-title">Welcome Back!</div>
                <div class="auth-subtitle">Sign in to FastTrack</div>
            </div>
            
            <div class="auth-error" id="login-error"></div>
            
            <form class="auth-form" onsubmit="AuthUI.handleLogin(event)">
                <div class="auth-form-group">
                    <label class="auth-label">Username or Email</label>
                    <input type="text" class="auth-input" id="login-username" 
                           placeholder="Enter username or email" required autocomplete="username">
                </div>
                
                <div class="auth-form-group">
                    <label class="auth-label">Password</label>
                    <input type="password" class="auth-input" id="login-password" 
                           placeholder="Enter password" required autocomplete="current-password">
                </div>
                
                <button type="submit" class="auth-btn">Sign In</button>
            </form>
            
            <div class="auth-switch">
                Don't have an account? 
                <span class="auth-switch-link" onclick="AuthUI.showRegister()">Sign Up</span>
            </div>
        `;
    },
    
    renderRegister: function() {
        return `
            <div class="auth-header">
                <div class="auth-logo">🎮</div>
                <div class="auth-title">Join FastTrack</div>
                <div class="auth-subtitle">Create your account</div>
            </div>
            
            <div class="auth-error" id="register-error"></div>
            <div class="auth-success" id="register-success"></div>
            
            <form class="auth-form" onsubmit="AuthUI.handleRegister(event)">
                <div class="auth-form-group">
                    <label class="auth-label">Username</label>
                    <input type="text" class="auth-input" id="register-username" 
                           placeholder="Choose a username" required minlength="3" maxlength="20" 
                           autocomplete="username">
                </div>
                
                <div class="auth-form-group">
                    <label class="auth-label">Display Name</label>
                    <input type="text" class="auth-input" id="register-displayname" 
                           placeholder="Your display name" required minlength="2" maxlength="30">
                </div>
                
                <div class="auth-form-group">
                    <label class="auth-label">Email</label>
                    <input type="email" class="auth-input" id="register-email" 
                           placeholder="your@email.com" required autocomplete="email">
                </div>
                
                <div class="auth-form-group">
                    <label class="auth-label">Password</label>
                    <input type="password" class="auth-input" id="register-password" 
                           placeholder="Choose a password (6+ chars)" required minlength="6"
                           autocomplete="new-password">
                </div>
                
                <div class="auth-form-group">
                    <label class="auth-label">Confirm Password</label>
                    <input type="password" class="auth-input" id="register-confirm" 
                           placeholder="Confirm your password" required minlength="6"
                           autocomplete="new-password">
                </div>
                
                <button type="submit" class="auth-btn">Create Account</button>
            </form>
            
            <div class="auth-switch">
                Already have an account? 
                <span class="auth-switch-link" onclick="AuthUI.showLogin()">Sign In</span>
            </div>
        `;
    },
    
    renderProfile: function() {
        if (!this.currentUser) {
            return this.renderLogin();
        }
        
        const user = this.currentUser;
        const avatar = AvatarSubstrate?.getById(user.avatarId);
        const emoji = avatar?.emoji || '👤';
        const stats = user.stats || { gamesPlayed: 0, gamesWon: 0, totalPoints: 0 };
        const winRate = stats.gamesPlayed > 0 ? 
            Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
        
        // Check for blocks
        let blockHtml = '';
        if (typeof AdminBlockSubstrate !== 'undefined') {
            const block = AdminBlockSubstrate.getUserBlock(user.id);
            if (block) {
                const expiresText = block.expiresAt ? 
                    new Date(block.expiresAt).toLocaleString() : 
                    'Permanent';
                blockHtml = `
                    <div class="auth-blocked">
                        <div class="auth-blocked-title">⚠️ Account Suspended</div>
                        <div class="auth-blocked-reason">${this.escapeHtml(block.reason)}</div>
                        <div class="auth-blocked-expires">Expires: ${expiresText}</div>
                        ${block.canAppeal ? 
                            '<button class="auth-appeal-btn" onclick="AuthUI.showAppealModal()">Submit Appeal</button>' : 
                            ''
                        }
                    </div>
                `;
            }
        }
        
        return `
            ${blockHtml}
            
            <div class="profile-header">
                <div class="profile-avatar">${emoji}</div>
                <div class="profile-info">
                    <h2>${this.escapeHtml(user.displayName)}</h2>
                    <div class="profile-username">@${this.escapeHtml(user.username)}</div>
                </div>
            </div>
            
            <div class="profile-stats">
                <div class="profile-stat">
                    <div class="profile-stat-value">${stats.gamesPlayed}</div>
                    <div class="profile-stat-label">GAMES PLAYED</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">${stats.gamesWon}</div>
                    <div class="profile-stat-label">WINS</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">${winRate}%</div>
                    <div class="profile-stat-label">WIN RATE</div>
                </div>
            </div>
            
            <div class="profile-section">
                <div class="profile-section-title">Points</div>
                <div class="profile-stat" style="text-align: left;">
                    <span class="profile-stat-value">${stats.totalPoints}</span>
                    <span style="color: #888; font-size: 12px;">total points</span>
                </div>
            </div>
            
            ${user.guildId ? `
                <div class="profile-section">
                    <div class="profile-section-title">Guild</div>
                    <div class="profile-guild">
                        🛡️ <span>${this.escapeHtml(user.guildName || 'Unknown Guild')}</span>
                    </div>
                </div>
            ` : ''}
            
            <div class="profile-actions">
                <button class="auth-btn" onclick="AuthUI.goToLobby()">Enter Lobby</button>
                <button class="auth-btn auth-btn-secondary" onclick="AuthUI.showEditProfile()">Edit Profile</button>
                <button class="auth-btn auth-btn-secondary" onclick="AuthUI.handleLogout()">Sign Out</button>
            </div>
        `;
    },
    
    // ============================================================
    // HANDLERS
    // ============================================================
    
    handleLogin: function(event) {
        event.preventDefault();
        
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        const result = AuthSubstrate?.login(username, password);
        
        if (result?.success) {
            this.currentUser = AuthSubstrate.getUserById(result.userId);
            
            // Check if password change required
            if (result.requirePasswordChange) {
                this.showPasswordChangeModal(result.userId);
                return;
            }
            
            this.currentView = 'profile';
            this.render();
            
            if (this.onLoginSuccess) {
                this.onLoginSuccess(this.currentUser);
            }
        } else {
            this.showError('login-error', result?.error || 'Login failed');
        }
    },
    
    showPasswordChangeModal: function(userId) {
        const modal = document.createElement('div');
        modal.className = 'lobby-modal';
        modal.id = 'password-change-modal';
        modal.innerHTML = `
            <div class="lobby-modal-content" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                <div class="lobby-modal-title" style="color: #e94560;">🔐 Password Change Required</div>
                
                <p style="color: #fca5a5; font-size: 14px; margin-bottom: 15px; background: rgba(239,68,68,0.2); padding: 10px; border-radius: 6px;">
                    You are using a temporary password. Please set a new password to continue.
                </p>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label" style="color: #aaa;">New Password</label>
                    <input type="password" class="lobby-form-input" id="new-password" 
                           placeholder="Enter new password (6+ characters)"
                           style="background: rgba(0,0,0,0.3); border-color: #0f3460; color: #fff;">
                </div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label" style="color: #aaa;">Confirm New Password</label>
                    <input type="password" class="lobby-form-input" id="confirm-new-password" 
                           placeholder="Confirm new password"
                           style="background: rgba(0,0,0,0.3); border-color: #0f3460; color: #fff;">
                </div>
                
                <div id="password-change-error" style="color: #fca5a5; font-size: 13px; margin-bottom: 10px; display: none;"></div>
                
                <div class="lobby-modal-actions" style="margin-top: 20px;">
                    <button class="auth-btn" onclick="AuthUI.submitPasswordChange('${userId}')">Set New Password</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.getElementById('new-password').focus();
    },
    
    submitPasswordChange: function(userId) {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;
        const errorEl = document.getElementById('password-change-error');
        
        if (newPassword.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            errorEl.style.display = 'block';
            return;
        }
        
        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match';
            errorEl.style.display = 'block';
            return;
        }
        
        // Change password
        const result = AuthSubstrate?.changePassword(userId, null, newPassword, true);
        
        if (result?.success) {
            // Clear the requirement flag
            const user = AuthSubstrate.getUserById(userId);
            if (user) {
                user.requirePasswordChange = false;
                user.tempPassword = false;
                AuthSubstrate.saveToStorage();
            }
            
            this.closeModal('password-change-modal');
            this.currentUser = AuthSubstrate.getUserById(userId);
            this.currentView = 'profile';
            this.render();
            
            if (this.onLoginSuccess) {
                this.onLoginSuccess(this.currentUser);
            }
        } else {
            errorEl.textContent = result?.error || 'Failed to change password';
            errorEl.style.display = 'block';
        }
    },
    
    handleRegister: function(event) {
        event.preventDefault();
        
        const username = document.getElementById('register-username').value.trim();
        const displayName = document.getElementById('register-displayname').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        
        // Validate
        if (password !== confirm) {
            this.showError('register-error', 'Passwords do not match');
            return;
        }
        
        const result = AuthSubstrate?.register(username, email, password, displayName);
        
        if (result?.success) {
            this.showSuccess('register-success', 'Account created! Please sign in.');
            setTimeout(() => this.showLogin(), 1500);
        } else {
            this.showError('register-error', result?.error || 'Registration failed');
        }
    },
    
    handleLogout: function() {
        if (this.currentUser) {
            AuthSubstrate?.logout(this.currentUser.id);
        }
        
        this.currentUser = null;
        this.currentView = 'login';
        this.render();
        
        if (this.onLogoutSuccess) {
            this.onLogoutSuccess();
        }
    },
    
    // ============================================================
    // NAVIGATION
    // ============================================================
    
    showLogin: function() {
        this.currentView = 'login';
        this.render();
    },
    
    showRegister: function() {
        this.currentView = 'register';
        this.render();
    },
    
    showProfile: function() {
        this.currentView = 'profile';
        this.render();
    },
    
    goToLobby: function() {
        if (!this.currentUser) {
            alert('Please sign in first');
            return;
        }
        
        // Join lobby
        if (typeof LobbySubstrate !== 'undefined') {
            LobbySubstrate.join(this.currentUser);
        }
        
        // Initialize lobby UI
        if (typeof LobbyUI !== 'undefined') {
            LobbyUI.setCurrentUser(this.currentUser);
        }
        
        // Hide auth, show lobby
        if (this.container) {
            this.container.style.display = 'none';
        }
        
        const lobbyContainer = document.getElementById('lobby-container');
        if (lobbyContainer) {
            lobbyContainer.style.display = 'block';
        }
    },
    
    showEditProfile: function() {
        // Simple modal for profile editing
        const modal = document.createElement('div');
        modal.className = 'lobby-modal';
        modal.id = 'edit-profile-modal';
        modal.innerHTML = `
            <div class="lobby-modal-content" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                <div class="lobby-modal-title" style="color: #e94560;">Edit Profile</div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label" style="color: #aaa;">Display Name</label>
                    <input type="text" class="lobby-form-input" id="edit-displayname" 
                           value="${this.escapeHtml(this.currentUser?.displayName || '')}"
                           style="background: rgba(0,0,0,0.3); border-color: #0f3460; color: #fff;">
                </div>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label" style="color: #aaa;">Avatar</label>
                    <button class="auth-btn auth-btn-secondary" onclick="AuthUI.showAvatarPicker()"
                            style="width: 100%;">
                        Choose Avatar
                    </button>
                </div>
                
                <div class="lobby-modal-actions" style="margin-top: 20px;">
                    <button class="auth-btn auth-btn-secondary" onclick="AuthUI.closeModal('edit-profile-modal')">Cancel</button>
                    <button class="auth-btn" onclick="AuthUI.saveProfile()">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    saveProfile: function() {
        const displayName = document.getElementById('edit-displayname')?.value.trim();
        
        if (displayName && this.currentUser) {
            AuthSubstrate?.updateProfile(this.currentUser.id, { displayName });
            this.currentUser = AuthSubstrate.getUserById(this.currentUser.id);
            this.render();
        }
        
        this.closeModal('edit-profile-modal');
    },
    
    showAvatarPicker: function() {
        if (typeof PlayerPanelUI !== 'undefined' && typeof PlayerPanelUI.showAvatarPicker === 'function') {
            PlayerPanelUI.showAvatarPicker(0, (avatarId) => {
                if (this.currentUser) {
                    AuthSubstrate?.updateProfile(this.currentUser.id, { avatarId });
                    this.currentUser = AuthSubstrate.getUserById(this.currentUser.id);
                    this.render();
                }
            });
        }
    },
    
    showAppealModal: function() {
        const block = AdminBlockSubstrate?.getUserBlock(this.currentUser?.id);
        if (!block) return;
        
        const modal = document.createElement('div');
        modal.className = 'lobby-modal';
        modal.id = 'appeal-modal';
        modal.innerHTML = `
            <div class="lobby-modal-content" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                <div class="lobby-modal-title" style="color: #e94560;">Submit Appeal</div>
                
                <p style="color: #aaa; font-size: 14px; margin-bottom: 15px;">
                    You may appeal this suspension. Please explain why you believe the suspension should be lifted.
                </p>
                
                <div class="lobby-form-group">
                    <label class="lobby-form-label" style="color: #aaa;">Your Appeal</label>
                    <textarea id="appeal-text" rows="5" 
                              style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid #0f3460; 
                                     border-radius: 6px; color: #fff; padding: 10px; resize: vertical;"
                              placeholder="Explain why your suspension should be lifted..."></textarea>
                </div>
                
                <div class="lobby-modal-actions" style="margin-top: 20px;">
                    <button class="auth-btn auth-btn-secondary" onclick="AuthUI.closeModal('appeal-modal')">Cancel</button>
                    <button class="auth-btn" onclick="AuthUI.submitAppeal('${block.id}')">Submit Appeal</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    submitAppeal: function(blockId) {
        const appealText = document.getElementById('appeal-text')?.value.trim();
        
        if (!appealText) {
            alert('Please enter your appeal');
            return;
        }
        
        const result = AdminBlockSubstrate?.submitAppeal(this.currentUser.id, blockId, appealText);
        
        this.closeModal('appeal-modal');
        
        if (result?.success) {
            alert('Appeal submitted. You will be notified when it is reviewed.');
        } else {
            alert(result?.error || 'Could not submit appeal');
        }
    },
    
    // ============================================================
    // UTILITIES
    // ============================================================
    
    showError: function(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.classList.add('visible');
        }
    },
    
    showSuccess: function(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.classList.add('visible');
        }
        
        // Hide error
        const errorEl = document.getElementById(elementId.replace('success', 'error'));
        if (errorEl) {
            errorEl.classList.remove('visible');
        }
    },
    
    closeModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    },
    
    escapeHtml: function(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.AuthUI = AuthUI;
    console.log('Auth UI loaded');
}
