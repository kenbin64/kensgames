/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOGIN SUBSTRATE - Manifold Authentication
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manages user registration and authentication on manifold coordinates.
 * Single login system shared by ALL games (BrickBreaker3D, Space Combat, FastTrack)
 */

class LoginSubstrate extends SubstrateBase {
  constructor(manifoldSurface) {
    super('login-substrate', manifoldSurface);
    this.manifold = manifoldSurface;
  }

  /**
   * Extract login data from manifold coordinate
   */
  extract(coordinate) {
    const data = this.manifold.read(coordinate);
    if (!data) return null;

    return {
      id: data.id,
      username: data.username,
      passwordHash: data.passwordHash || null,
      status: data.status || 'active',
      createdAt: data.createdAt,
      lastLoginAt: data.lastLoginAt,
      displayName: data.displayName,
      avatar: data.avatar
    };
  }

  /**
   * Validate extracted data structure
   */
  validate(data) {
    if (!data) return { valid: false, error: 'No data' };
    if (!data.username || data.username.length < 3 || data.username.length > 24) {
      return { valid: false, error: 'Invalid username (3-24 chars)' };
    }
    if (data.status !== 'active' && data.status !== 'suspended' && data.status !== 'banned') {
      return { valid: false, error: 'Invalid status' };
    }
    return { valid: true };
  }

  /**
   * Register a new user
   * Writes to manifold coordinate [userId, authMethod, z]
   * authMethod: 0 = username only, 1 = username+password
   */
  register(username, password = null, displayName = null) {
    // Validate username
    if (!username || username.length < 3 || username.length > 24) {
      return { success: false, error: 'Username must be 3-24 characters' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return { success: false, error: 'Username can only contain letters, numbers, _, -' };
    }

    // Generate user ID
    const userId = this._generateUserId();
    const authMethod = password ? 1 : 0;
    const coordinate = [userId, authMethod, userId * authMethod];

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      if (password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
      }
      passwordHash = this._hashPassword(password);
    }

    // Create user object
    const userData = {
      id: userId.toString(),
      username: username.toLowerCase(),
      passwordHash: passwordHash,
      displayName: displayName || username,
      avatar: '🎮',
      status: 'active',
      createdAt: Date.now(),
      lastLoginAt: null,
      preferences: { theme: 'dark', language: 'en' },
      stats: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, bestScore: 0 }
    };

    // Write to manifold
    try {
      this.manifold.write(coordinate, userData);
      return {
        success: true,
        userId: userId.toString(),
        coordinate: coordinate,
        message: `User "${username}" registered successfully`
      };
    } catch (err) {
      return { success: false, error: `Registration failed: ${err.message}` };
    }
  }

  /**
   * Authenticate user with username and password
   * Returns user data if successful
   */
  login(username, password) {
    if (!username || !password) {
      return { success: false, error: 'Username and password required' };
    }

    username = username.toLowerCase();

    // Find user coordinate by searching manifold
    // In a real system, would have username->userId index
    // For now, we'll use a simple range search
    const userCoord = this._findUserByUsername(username);
    if (!userCoord) {
      return { success: false, error: 'User not found' };
    }

    // Read user data from manifold
    const userData = this.manifold.read(userCoord);
    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    // Check status
    if (userData.status === 'banned') {
      return { success: false, error: 'Account banned' };
    }
    if (userData.status === 'suspended') {
      return { success: false, error: 'Account suspended' };
    }

    // Verify password
    if (userData.passwordHash) {
      if (!this._comparePassword(password, userData.passwordHash)) {
        return { success: false, error: 'Invalid password' };
      }
    }

    // Update last login
    userData.lastLoginAt = Date.now();
    this.manifold.write(userCoord, userData);

    return {
      success: true,
      userId: userData.id,
      username: userData.username,
      displayName: userData.displayName,
      avatar: userData.avatar,
      coordinate: userCoord
    };
  }

  /**
   * Validate username and password
   * Returns true/false without side effects
   */
  validateCredentials(username, password) {
    if (!username || !password) return false;

    username = username.toLowerCase();
    const userCoord = this._findUserByUsername(username);
    if (!userCoord) return false;

    const userData = this.manifold.read(userCoord);
    if (!userData || userData.status !== 'active') return false;

    if (userData.passwordHash) {
      return this._comparePassword(password, userData.passwordHash);
    }

    return true;
  }

  /**
   * Change user password
   */
  changePassword(userId, oldPassword, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    const userCoord = this._findUserById(userId);
    if (!userCoord) {
      return { success: false, error: 'User not found' };
    }

    const userData = this.manifold.read(userCoord);
    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    // Verify old password
    if (userData.passwordHash && !this._comparePassword(oldPassword, userData.passwordHash)) {
      return { success: false, error: 'Current password incorrect' };
    }

    // Update with new password
    userData.passwordHash = this._hashPassword(newPassword);
    this.manifold.write(userCoord, userData);

    return { success: true, message: 'Password changed successfully' };
  }

  /**
   * Get user profile by username
   */
  getUserProfile(username) {
    username = username.toLowerCase();
    const userCoord = this._findUserByUsername(username);
    if (!userCoord) return null;

    const userData = this.manifold.read(userCoord);
    return {
      id: userData.id,
      username: userData.username,
      displayName: userData.displayName,
      avatar: userData.avatar,
      createdAt: userData.createdAt
    };
  }

  /**
   * Update user profile
   */
  updateProfile(userId, updates) {
    const userCoord = this._findUserById(userId);
    if (!userCoord) {
      return { success: false, error: 'User not found' };
    }

    const userData = this.manifold.read(userCoord);
    if (!userData) {
      return { success: false, error: 'User not found' };
    }

    // Update allowed fields
    if (updates.displayName && updates.displayName.length > 0) {
      userData.displayName = updates.displayName;
    }
    if (updates.avatar) {
      userData.avatar = updates.avatar;
    }
    if (updates.preferences) {
      userData.preferences = { ...userData.preferences, ...updates.preferences };
    }

    this.manifold.write(userCoord, userData);
    return { success: true, message: 'Profile updated' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _generateUserId() {
    return Math.floor(Math.random() * 100000) + 1;
  }

  _hashPassword(password) {
    // Simple hash for MVP - in production use bcrypt
    // For now, using btoa with salt
    const salt = 'kensgames_salt_2026';
    return btoa(salt + password + salt).substring(0, 50);
  }

  _comparePassword(password, hash) {
    // Simple comparison for MVP
    const salt = 'kensgames_salt_2026';
    const computed = btoa(salt + password + salt).substring(0, 50);
    return computed === hash;
  }

  _findUserByUsername(username) {
    // In a real system, would use a username index
    // For MVP, searches through a small range
    username = username.toLowerCase();

    // Search range: user IDs 1-100000
    for (let userId = 1; userId <= 100; userId++) {
      for (let authMethod = 0; authMethod <= 1; authMethod++) {
        const coord = [userId, authMethod, userId * authMethod];
        const data = this.manifold.read(coord);
        if (data && data.username === username) {
          return coord;
        }
      }
    }
    return null;
  }

  _findUserById(userId) {
    // Search for user by ID
    userId = parseInt(userId);

    for (let authMethod = 0; authMethod <= 1; authMethod++) {
      const coord = [userId, authMethod, userId * authMethod];
      const data = this.manifold.read(coord);
      if (data && data.id === userId.toString()) {
        return coord;
      }
    }
    return null;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoginSubstrate;
}
if (typeof window !== 'undefined') {
  window.LoginSubstrate = LoginSubstrate;
}
