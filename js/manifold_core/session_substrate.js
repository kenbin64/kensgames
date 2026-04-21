/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SESSION SUBSTRATE - Manifold Session Management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manages user sessions and JWT tokens on manifold coordinates.
 * Validates session tokens across all games (BrickBreaker3D, Space Combat, FastTrack)
 */

class SessionSubstrate extends SubstrateBase {
  constructor(manifoldSurface) {
    super('session-substrate', manifoldSurface);
    this.manifold = manifoldSurface;
    this.SESSION_EXPIRY_HOURS = 24;
    this.JWT_SECRET = 'manifold-session-secret-change-in-production'; // TODO: move to .env
  }

  /**
   * Extract session data from manifold coordinate
   */
  extract(coordinate) {
    const data = this.manifold.read(coordinate);
    if (!data || !data.sessions) return { sessions: [], lastLoginAt: null };

    return {
      sessions: data.sessions || [],
      lastLoginAt: data.lastLoginAt,
      status: data.status
    };
  }

  /**
   * Validate extracted session data structure
   */
  validate(data) {
    if (!data) return { valid: false, error: 'No session data' };
    if (!Array.isArray(data.sessions)) {
      return { valid: false, error: 'Sessions must be array' };
    }
    return { valid: true };
  }

  /**
   * Create a new session for a user
   * Returns JWT token and session metadata
   */
  createSession(userCoord, userId) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = Date.now() + (this.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

    // Create JWT token
    const token = this._generateToken(userId, sessionId, expiresAt);

    // Read current sessions from manifold
    const userData = this.manifold.read(userCoord);
    const sessions = userData?.sessions || [];

    // Add new session
    const newSession = {
      id: sessionId,
      token: token,
      createdAt: Date.now(),
      expiresAt: expiresAt,
      lastActivityAt: Date.now()
    };
    sessions.push(newSession);

    // Clean expired sessions
    const activeSessions = this._filterExpiredSessions(sessions);
    activeSessions.push(newSession);

    // Write back to manifold
    const updatedData = {
      ...userData,
      sessions: activeSessions,
      lastLoginAt: Date.now()
    };
    this.manifold.write(userCoord, updatedData);

    return {
      token: token,
      sessionId: sessionId,
      expiresAt: expiresAt,
      expiresIn: this.SESSION_EXPIRY_HOURS * 60 * 60 // seconds
    };
  }

  /**
   * Validate a session token
   * Returns { valid: boolean, userId?: string, sessionId?: string, expiresIn?: number, error?: string }
   */
  validateSession(token) {
    try {
      // Decode and verify token
      const decoded = this._verifyToken(token);
      if (!decoded) {
        return { valid: false, error: 'Invalid token' };
      }

      const { userId, sessionId, expiresAt } = decoded;

      // Check expiration
      if (expiresAt < Date.now()) {
        return { valid: false, error: 'Token expired' };
      }

      // Calculate remaining time in seconds
      const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);

      return {
        valid: true,
        userId: userId,
        sessionId: sessionId,
        expiresAt: expiresAt,
        expiresIn: expiresIn
      };
    } catch (error) {
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Revoke a specific session
   */
  revokeSession(userCoord, sessionId) {
    const userData = this.manifold.read(userCoord);
    if (!userData) return { success: false, error: 'User not found' };

    const sessions = userData.sessions || [];
    const filteredSessions = sessions.filter(s => s.id !== sessionId);

    if (filteredSessions.length === sessions.length) {
      return { success: false, error: 'Session not found' };
    }

    const updatedData = {
      ...userData,
      sessions: filteredSessions
    };
    this.manifold.write(userCoord, updatedData);

    return { success: true, message: 'Session revoked' };
  }

  /**
   * Revoke all sessions for a user (logout everywhere)
   */
  revokeAllSessions(userCoord) {
    const userData = this.manifold.read(userCoord);
    if (!userData) return { success: false, error: 'User not found' };

    const updatedData = {
      ...userData,
      sessions: []
    };
    this.manifold.write(userCoord, updatedData);

    return { success: true, message: 'All sessions revoked' };
  }

  /**
   * Update last activity timestamp for a session (keep-alive)
   */
  updateSessionActivity(userCoord, sessionId) {
    const userData = this.manifold.read(userCoord);
    if (!userData) return { success: false };

    const sessions = userData.sessions || [];
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);

    if (sessionIndex === -1) {
      return { success: false, error: 'Session not found' };
    }

    sessions[sessionIndex].lastActivityAt = Date.now();

    const updatedData = {
      ...userData,
      sessions: sessions
    };
    this.manifold.write(userCoord, updatedData);

    return { success: true };
  }

  /**
   * Get all active sessions for a user
   */
  getActiveSessions(userCoord) {
    const userData = this.manifold.read(userCoord);
    if (!userData) return [];

    const sessions = userData.sessions || [];
    return this._filterExpiredSessions(sessions);
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * PRIVATE HELPER METHODS
   * ───────────────────────────────────────────────────────────────────────────
   */

  /**
   * Generate a JWT token (simplified version, use jsonwebtoken in production)
   */
  _generateToken(userId, sessionId, expiresAt) {
    // MVP: Simple base64 encoding of JSON payload
    // TODO: Replace with proper JWT using jsonwebtoken library when Express backend is ready
    const payload = {
      userId: userId,
      sessionId: sessionId,
      expiresAt: expiresAt,
      iat: Date.now()
    };

    return btoa(JSON.stringify(payload));
  }

  /**
   * Verify and decode a JWT token (simplified version)
   */
  _verifyToken(token) {
    try {
      // MVP: Simple base64 decoding
      // TODO: Replace with proper JWT verification when Express backend is ready
      const decoded = JSON.parse(atob(token));

      if (!decoded.userId || !decoded.sessionId || !decoded.expiresAt) {
        return null;
      }

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Filter out expired sessions from array
   */
  _filterExpiredSessions(sessions) {
    return sessions.filter(session => {
      return session.expiresAt > Date.now();
    });
  }
}

// Export for node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionSubstrate;
}
