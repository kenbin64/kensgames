/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENCRYPTION UTILITIES - Manifold Security Layer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides AES-256-GCM encryption for manifold coordinates and
 * HMAC-SHA256 signing for substrate integrity verification
 */

const crypto = require('crypto');

class EncryptionService {
  constructor(encryptionKey = process.env.ENCRYPTION_KEY) {
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }
    // Use hex-encoded 256-bit key
    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 256 bits (64 hex characters)');
    }
  }

  /**
   * Encrypt a coordinate [userId, authMethod, z] with AES-256-GCM
   * Returns base64-encoded string: iv:ciphertext:authTag
   */
  encryptCoordinate(coordinate) {
    try {
      // Generate random IV for this encryption
      const iv = crypto.randomBytes(12); // 96-bit IV for GCM

      // Create cipher
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

      // Coordinate as JSON string
      const coordinateStr = JSON.stringify(coordinate);

      // Encrypt
      let encrypted = cipher.update(coordinateStr, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return as base64: iv:ciphertext:authTag
      const result = `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
      return result;
    } catch (error) {
      throw new Error(`Coordinate encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a coordinate encrypted with encryptCoordinate()
   * Input format: base64(iv):hex(ciphertext):base64(authTag)
   */
  decryptCoordinate(encryptedStr) {
    try {
      const parts = encryptedStr.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted coordinate format');
      }

      const iv = Buffer.from(parts[0], 'base64');
      const ciphertext = parts[1];
      const authTag = Buffer.from(parts[2], 'base64');

      if (iv.length !== 12) {
        throw new Error('Invalid IV length');
      }

      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Parse JSON back to coordinate array
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Coordinate decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate coordinate hash for storage
   * This creates a deterministic hash of the encrypted coordinate
   * Allows coordinate lookup without exposing the coordinate itself
   */
  getCoordinateHash(encryptedCoordinate) {
    return crypto
      .createHmac('sha256', this.encryptionKey)
      .update(encryptedCoordinate)
      .digest('hex');
  }

  /**
   * Sign substrate data with HMAC-SHA256
   * Returns signature that can be verified to prevent tampering
   */
  signSubstrate(data, substrateKey = process.env.SUBSTRATE_KEY || this.encryptionKey) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      const signature = crypto
        .createHmac('sha256', substrateKey)
        .update(dataStr)
        .digest('hex');
      return signature;
    } catch (error) {
      throw new Error(`Substrate signing failed: ${error.message}`);
    }
  }

  /**
   * Verify substrate signature
   * Returns true if signature is valid, false otherwise
   */
  verifySubstrate(data, signature, substrateKey = process.env.SUBSTRATE_KEY || this.encryptionKey) {
    try {
      const expectedSignature = this.signSubstrate(data, substrateKey);
      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Substrate verification error:', error);
      return false;
    }
  }

  /**
   * Generate a cryptographically secure random token
   * Used for password recovery, email verification, etc.
   * Returns 32-byte hex string (256-bit security)
   */
  generateSecureToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Hash email for safe storage (deterministic)
   * Used for recovery token lookups
   */
  hashEmail(email) {
    return crypto
      .createHash('sha256')
      .update(email.toLowerCase())
      .digest('hex');
  }

  /**
   * Encrypt sensitive data with AES-256-GCM
   * Generic method for any data (not just coordinates)
   */
  encryptData(data) {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

      let encrypted = cipher.update(dataStr, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
    } catch (error) {
      throw new Error(`Data encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data encrypted with encryptData()
   */
  decryptData(encryptedStr) {
    try {
      const parts = encryptedStr.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'base64');
      const ciphertext = parts[1];
      const authTag = Buffer.from(parts[2], 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Data decryption failed: ${error.message}`);
    }
  }
}

module.exports = EncryptionService;
