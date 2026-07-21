'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRESENCE ROSTER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The list of currently-connected players, derived from the relay's live
 * `connections` map. This is the foundation the invite / public / matchmaker
 * lobby draws from: "who is online right now."
 *
 * Pure + testable. Dedupes by user_id (a player may hold more than one socket
 * across tabs / reconnects); a player is `in_session` if ANY of their sockets is
 * in a session. Real accounts sort before guests, then alphabetically.
 */

function buildPresenceList(connections) {
  const byUser = new Map();
  for (const conn of connections.values()) {
    if (!conn || !conn.user || !conn.user_id) continue;
    const u = conn.user;
    const entry = byUser.get(conn.user_id) || {
      user_id: conn.user_id,
      username: u.username || 'Player',
      avatar_id: u.avatar_id || null,
      is_guest: !!u.is_guest,
      is_superuser: !!u.is_superuser,
      in_session: false,
    };
    if (conn.session_x_id) entry.in_session = true;
    byUser.set(conn.user_id, entry);
  }
  return Array.from(byUser.values()).sort((a, b) => {
    if (a.is_guest !== b.is_guest) return a.is_guest ? 1 : -1;
    return String(a.username).toLowerCase().localeCompare(String(b.username).toLowerCase());
  });
}

/** Cheap signature so the relay can skip broadcasting an unchanged roster. */
function presenceSignature(list) {
  return list.map((e) => `${e.user_id}:${e.in_session ? 1 : 0}`).join('|');
}

module.exports = { buildPresenceList, presenceSignature };
