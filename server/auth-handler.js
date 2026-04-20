/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH HANDLER - Backend Authentication Utilities
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Handles password hashing, JWT generation, and token verification
 * for manifest-based authentication system
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class AuthHandler {
  constructor(sessionSecret = process.env.SESSION_SECRET || 'change-me-in-production') {
    this.sessionSecret = sessionSecret;
    this.jwtExpiry = process.env.JWT_EXPIRY || '24h';
    this.bcryptRounds = 12;
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }
    try {
      const hash = await bcrypt.hash(password, this.bcryptRounds);
      return hash;
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Compare plaintext password with bcrypt hash
   */
  async comparePassword(password, hash) {
    if (!password || !hash) {
      return false;
    }
    try {
      const match = await bcrypt.compare(password, hash);
      return match;
    } catch (error) {
      console.error('Password comparison error:', error);
      return false;
    }
  }

  /**
   * Generate JWT token for session
   */
  generateToken(userId, sessionId = null) {
    const payload = {
      userId: userId,
      sessionId: sessionId || `session-${Date.now()}`,
      iat: Math.floor(Date.now() / 1000)
    };

    try {
      const token = jwt.sign(payload, this.sessionSecret, {
        expiresIn: this.jwtExpiry
      });
      return token;
    } catch (error) {
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.sessionSecret);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { error: 'Token expired', code: 'EXPIRED' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { error: 'Invalid token', code: 'INVALID' };
      }
      return { error: 'Token verification failed', code: 'FAILED' };
    }
  }

  /**
   * Validate username format
   */
  validateUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username must be a non-empty string' };
    }

    // 3-24 chars, alphanumeric + underscore/dash
    const regex = /^[a-zA-Z0-9_-]{3,24}$/;
    if (!regex.test(username)) {
      return {
        valid: false,
        error: 'Username must be 3-24 chars, alphanumeric + underscore/dash'
      };
    }

    // Cannot contain email-like patterns or real names
    if (username.includes('@') || username.includes('.')) {
      return { valid: false, error: 'Username cannot contain @ or .' };
    }

    return { valid: true };
  }

  /**
   * Validate password strength (optional, for new registrations)
   */
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }
    if (password.length < 8) {
      return { valid: false, error: 'Password must be at least 8 characters' };
    }
    if (password.length > 128) {
      return { valid: false, error: 'Password too long (max 128 chars)' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one uppercase letter (A–Z)' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one digit (0–9)' };
    }
    if (!/[!#$_]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one special character (!  #  $  _)' };
    }
    return { valid: true };
  }

  /**
   * Extract userId and sessionId from token
   */
  extractTokenData(token) {
    const decoded = this.verifyToken(token);
    if (decoded.error) {
      return null;
    }
    return {
      userId: decoded.userId,
      sessionId: decoded.sessionId
    };
  }
}

module.exports = AuthHandler;
