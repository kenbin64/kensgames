'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RELAY-SIDE IDENTITY RESOLUTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The lobby relay (server/lobby-server.js) is a transport and, historically, ran
 * every connection as an anonymous guest. To make login REAL and playernames
 * TRUSTED, this turns a site JWT into the account it belongs to, keyed by the
 * verified userId in the token. The username and avatar come from the account
 * DB, never from the client, so a player cannot claim a name that is not theirs.
 *
 * Design:
 *   - Dependencies (authHandler, db) are INJECTED, so this unit-tests in
 *     isolation with a fake db and a real AuthHandler, no SQLite fixture needed.
 *   - FAIL-SAFE: any missing/invalid/expired/forged token, unknown or inactive
 *     account, or unexpected error returns null. The caller then falls back to a
 *     guest (or rejects, when login is required). It never throws.
 *
 * This module holds no secret and opens no database; it only wires the two
 * injected pieces together.
 */

/**
 * @param {object} deps
 * @param {{ verifyToken: (t:string)=>object }} deps.authHandler  server/auth-handler.js instance
 * @param {{ users: { findById: (id:number)=>object|null } }} deps.db  server/db.js
 * @returns {(token:string)=>({account_id:number, username:string, display_name:string, avatar:object|null, admin_level:number}|null)}
 */
function makeIdentityResolver({ authHandler, db } = {}) {
  if (!authHandler || typeof authHandler.verifyToken !== 'function') {
    throw new Error('makeIdentityResolver requires an authHandler with verifyToken()');
  }
  if (!db || !db.users || typeof db.users.findById !== 'function') {
    throw new Error('makeIdentityResolver requires db.users.findById()');
  }

  return function resolveIdentity(token) {
    if (!token || typeof token !== 'string') return null;

    let decoded;
    try { decoded = authHandler.verifyToken(token); } catch (_) { return null; }
    // verifyToken returns { error, code } on any failure (expired / invalid / forged).
    if (!decoded || decoded.error || !decoded.userId) return null;

    let user;
    try { user = db.users.findById(decoded.userId); } catch (_) { return null; }
    if (!user) return null;
    const isSuperuser = (user.adminLevel || 0) >= 3;
    // Only active accounts may play (banned / suspended / pending are rejected),
    // EXCEPT the superuser, who can never be locked out.
    if (!isSuperuser && user.status && user.status !== 'active') return null;

    return {
      account_id: user.id,
      username: user.username,                       // DB-authoritative, unique playername
      display_name: user.displayName || user.username,
      avatar: user.avatar || null,                   // { id, emoji, name } | null
      admin_level: user.adminLevel || 0,
      is_superuser: isSuperuser,
    };
  };
}

module.exports = { makeIdentityResolver };
