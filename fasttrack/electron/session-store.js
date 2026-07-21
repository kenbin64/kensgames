'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DESKTOP SESSION STORE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Persists the login token at the Electron layer so it survives across launches.
 * The loopback server uses an ephemeral port, so per-origin localStorage is NOT
 * stable between runs; the durable copy lives here and is injected into pages.
 *
 * The token is encrypted with Electron `safeStorage` (OS keychain) when it is
 * available. On a platform without one, it falls back to plaintext in userData,
 * which still works and is logged as a warning by the caller. If an encrypted
 * token cannot be decrypted later (e.g. moved to another machine), load() simply
 * returns null and the user logs in again.
 *
 * Dependencies (safeStorage, filePath, fs) are INJECTED so this unit-tests with
 * no Electron present.
 */
const nodeFs = require('fs');

function createSessionStore({ safeStorage, filePath, fs = nodeFs } = {}) {
  if (!filePath) throw new Error('createSessionStore requires a filePath');

  const canEncrypt = () =>
    !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function'
       && safeStorage.isEncryptionAvailable());

  function encryptToken(token) {
    if (canEncrypt()) {
      return { enc: 'safeStorage', token: safeStorage.encryptString(token).toString('base64') };
    }
    return { enc: 'plain', token };
  }

  function decryptToken(rec) {
    if (!rec || !rec.token) return null;
    if (rec.enc === 'safeStorage') {
      if (!canEncrypt()) return null;
      try { return safeStorage.decryptString(Buffer.from(rec.token, 'base64')); }
      catch (_) { return null; }
    }
    return rec.token;
  }

  return {
    /** @returns {{token:string, user:object|null}|null} */
    load() {
      let raw;
      try { raw = fs.readFileSync(filePath, 'utf8'); } catch (_) { return null; }
      let data;
      try { data = JSON.parse(raw); } catch (_) { return null; }
      const token = decryptToken(data && data.session);
      if (!token) return null;
      return { token, user: (data && data.user) || null };
    },

    save(token, user) {
      if (!token || typeof token !== 'string') throw new Error('save requires a token string');
      const payload = { v: 1, session: encryptToken(token), user: user || null };
      fs.writeFileSync(filePath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
      return true;
    },

    clear() {
      try { fs.unlinkSync(filePath); } catch (_) { /* already gone */ }
      return true;
    },
  };
}

module.exports = { createSessionStore };
