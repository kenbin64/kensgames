/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PASSWORD RECOVERY — SQLite-backed recovery tokens
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Recovery tokens are exact/transactional state.  They are persisted in
 * the SQLite records layer (db.resetTokens) — NOT in an in-memory object.
 *
 * Governing tenant: "Use records when the question is exact."
 *
 * index.js calls db.resetTokens directly.  This class remains as a thin
 * compatibility shim in case external callers depend on the old interface.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');

class PasswordRecoveryManager {
  constructor() {
    // No in-memory storage — all token state lives in SQLite (db.resetTokens).
    // The constructor accepts no arguments; legacy callers that passed a
    // manifoldStorage object are safe — the argument is silently ignored.
  }

  /** Generate a token, persist it to the records layer, return token string. */
  generateRecoveryToken(email, username) {
    const token = crypto.randomBytes(32).toString('hex');
    const { expiresAt } = db.resetTokens.create(email, token);
    console.log(`🔐 Recovery token generated for ${email}, expires at ${new Date(expiresAt).toISOString()}`);
    return token;
  }

  /** Validate. Returns { valid, error?, username? }. Delegates to db.resetTokens. */
  validateRecoveryToken(email, token) {
    return db.resetTokens.validate(email, token);
  }

  /** Mark token as used so it cannot be replayed. */
  consumeRecoveryToken(email, token) {
    db.resetTokens.consume(email, token);
    return true;
  }

  /** Kept for interface compatibility; SQLite TTL + used_at handles expiry. */
  deleteRecoveryToken(email) {
    // Tokens are invalidated by used_at; hard-delete is handled by cleanupExpiredTokens.
    return true;
  }

  /** Cleanup expired / used tokens from SQLite. Safe to call any time. */
  cleanupExpiredTokens() {
    try {
      const now = Date.now();
      const result = db.getDb()
        .prepare('DELETE FROM password_reset_tokens WHERE expires_at < ? OR used_at IS NOT NULL')
        .run(now);
      if (result.changes > 0) {
        console.log(`🧹 Cleaned up ${result.changes} expired recovery tokens`);
      }
      return result.changes;
    } catch (err) {
      console.error('Token cleanup error:', err);
      return 0;
    }
  }

  /** Start periodic cleanup — SQLite handles durability, this keeps the table small. */
  startAutoCleanup() {
    this.cleanupInterval = setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
    console.log('🔄 Recovery token auto-cleanup started (every 5 min, SQLite-backed)');
  }

  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      console.log('⏹️ Recovery token auto-cleanup stopped');
    }
  }
}

module.exports = PasswordRecoveryManager;
