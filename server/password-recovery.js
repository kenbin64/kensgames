/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PASSWORD RECOVERY - Manifold-Based Recovery Tokens
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manages password recovery tokens with 15-minute expiration
 * Tokens stored on temporary manifold coordinates with TTL
 */

const crypto = require('crypto');

class PasswordRecoveryManager {
  constructor(manifoldStorage) {
    this.manifold = manifoldStorage; // Mock manifold object
    this.tokenExpiryMinutes = 15;
    this.tokenExpiryMs = this.tokenExpiryMinutes * 60 * 1000;
  }

  /**
   * Generate recovery token and store on manifold
   * Returns token string
   */
  generateRecoveryToken(email, username) {
    try {
      // Generate 32-byte (256-bit) secure random token
      const token = crypto.randomBytes(32).toString('hex');

      // Create temporary manifold coordinate for recovery token
      const emailHash = crypto
        .createHash('sha256')
        .update(email.toLowerCase())
        .digest('hex');

      const coordinateKey = `recovery-${emailHash}`;
      const expiryTime = Date.now() + this.tokenExpiryMs;

      // Store on manifold
      this.manifold[coordinateKey] = {
        token: token,
        email: email,
        username: username,
        createdAt: Date.now(),
        expiresAt: expiryTime,
        used: false,
        attempts: 0
      };

      console.log(`🔐 Recovery token generated for ${email}, expires at ${new Date(expiryTime).toISOString()}`);

      return token;
    } catch (error) {
      throw new Error(`Recovery token generation failed: ${error.message}`);
    }
  }

  /**
   * Validate recovery token
   * Returns { valid: boolean, error?: string, username?: string }
   */
  validateRecoveryToken(email, token) {
    try {
      const emailHash = crypto
        .createHash('sha256')
        .update(email.toLowerCase())
        .digest('hex');

      const coordinateKey = `recovery-${emailHash}`;
      const tokenData = this.manifold[coordinateKey];

      // Token not found
      if (!tokenData) {
        return { valid: false, error: 'Invalid recovery token' };
      }

      // Token already used
      if (tokenData.used) {
        return { valid: false, error: 'Recovery token already used' };
      }

      // Token expired
      if (Date.now() > tokenData.expiresAt) {
        return { valid: false, error: 'Recovery token expired' };
      }

      // Email mismatch
      if (tokenData.email.toLowerCase() !== email.toLowerCase()) {
        return { valid: false, error: 'Email mismatch' };
      }

      // Token mismatch (constant-time comparison)
      try {
        const tokenMatch = crypto.timingSafeEqual(
          Buffer.from(token, 'hex'),
          Buffer.from(tokenData.token, 'hex')
        );

        if (!tokenMatch) {
          // Increment failed attempts
          tokenData.attempts = (tokenData.attempts || 0) + 1;

          // Invalidate token after 5 failed attempts
          if (tokenData.attempts >= 5) {
            console.warn(`⚠️ Token for ${email} invalidated after ${tokenData.attempts} failed attempts`);
            this.consumeRecoveryToken(email, token);
          }

          return { valid: false, error: 'Invalid recovery token' };
        }
      } catch (e) {
        return { valid: false, error: 'Invalid recovery token' };
      }

      return { valid: true, username: tokenData.username };
    } catch (error) {
      console.error('Recovery token validation error:', error);
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Generate 6-digit OTP code for password reset
   */
  generateOTPCode(email) {
    const code = String(crypto.randomInt(100000, 999999));
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
    const key = `otp-${emailHash}`;
    this.manifold[key] = {
      code,
      email: email.toLowerCase(),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.tokenExpiryMs,
      used: false,
      attempts: 0
    };
    console.log(`🔢 OTP generated for ${email}, expires in ${this.tokenExpiryMinutes}m`);
    return code;
  }

  /**
   * Validate OTP code
   */
  validateOTPCode(email, code) {
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
    const key = `otp-${emailHash}`;
    const data = this.manifold[key];
    if (!data) return { valid: false, error: 'Code not found or expired. Request a new code.' };
    if (data.used) return { valid: false, error: 'Code already used. Request a new one.' };
    if (Date.now() > data.expiresAt) {
      delete this.manifold[key];
      return { valid: false, error: 'Code expired. Request a new one.' };
    }
    data.attempts = (data.attempts || 0) + 1;
    if (data.attempts > 5) {
      data.used = true;
      return { valid: false, error: 'Too many attempts. Request a new code.' };
    }
    if (data.code !== String(code).trim()) {
      return { valid: false, error: `Incorrect code. ${5 - data.attempts} attempt${5 - data.attempts === 1 ? '' : 's'} remaining.` };
    }
    return { valid: true, email: data.email };
  }

  /**
   * Consume (mark used) an OTP code after successful reset
   */
  consumeOTPCode(email) {
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
    const key = `otp-${emailHash}`;
    if (this.manifold[key]) { this.manifold[key].used = true; }
  }

  /**
   * Mark recovery token as used (consumed)
   * Prevents token reuse
   */
  consumeRecoveryToken(email, token) {
    try {
      const emailHash = crypto
        .createHash('sha256')
        .update(email.toLowerCase())
        .digest('hex');

      const coordinateKey = `recovery-${emailHash}`;
      const tokenData = this.manifold[coordinateKey];

      if (tokenData) {
        tokenData.used = true;
        tokenData.usedAt = Date.now();
        console.log(`✓ Recovery token consumed for ${email}`);
      }

      return true;
    } catch (error) {
      console.error('Token consumption error:', error);
      return false;
    }
  }

  /**
   * Delete recovery token from manifold
   * Called after successful password reset
   */
  deleteRecoveryToken(email) {
    try {
      const emailHash = crypto
        .createHash('sha256')
        .update(email.toLowerCase())
        .digest('hex');

      const coordinateKey = `recovery-${emailHash}`;

      if (this.manifold[coordinateKey]) {
        delete this.manifold[coordinateKey];
        console.log(`🗑️ Recovery token deleted for ${email}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token deletion error:', error);
      return false;
    }
  }

  /**
   * Get recovery token info (for verification)
   */
  getRecoveryTokenInfo(email) {
    try {
      const emailHash = crypto
        .createHash('sha256')
        .update(email.toLowerCase())
        .digest('hex');

      const coordinateKey = `recovery-${emailHash}`;
      const tokenData = this.manifold[coordinateKey];

      if (!tokenData) {
        return null;
      }

      // Don't return the actual token, just metadata
      return {
        email: tokenData.email,
        username: tokenData.username,
        createdAt: tokenData.createdAt,
        expiresAt: tokenData.expiresAt,
        expiresIn: Math.max(0, Math.floor((tokenData.expiresAt - Date.now()) / 1000)),
        used: tokenData.used,
        attempts: tokenData.attempts || 0,
        minutesRemaining: Math.max(0, Math.ceil((tokenData.expiresAt - Date.now()) / 60000))
      };
    } catch (error) {
      console.error('Token info retrieval error:', error);
      return null;
    }
  }

  /**
   * Cleanup expired tokens from manifold
   * Runs periodically to remove stale data
   */
  cleanupExpiredTokens() {
    try {
      let cleanedCount = 0;
      const now = Date.now();

      for (const key in this.manifold) {
        if (key.startsWith('recovery-')) {
          const tokenData = this.manifold[key];
          if (tokenData.expiresAt < now || tokenData.used) {
            delete this.manifold[key];
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired recovery tokens`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Token cleanup error:', error);
      return 0;
    }
  }

  /**
   * Start automatic cleanup interval
   * Runs every 5 minutes to clean expired tokens
   */
  startAutoCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('🔄 Recovery token auto-cleanup started (every 5 minutes)');
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      console.log('⏹️ Recovery token auto-cleanup stopped');
    }
  }
}

module.exports = PasswordRecoveryManager;
