'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE-GAME INVITE RULES (pure)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Decides whether a host may invite a given player to a private game, and why
 * not. The relay handler does the I/O (find the target's sockets, route the
 * game_invite); this is the decision, so it unit-tests without a server.
 */

function canInvite({ session, hostUserId, targetUserId, targetOnline } = {}) {
  if (!session) return { ok: false, reason: 'That game no longer exists.' };
  if (!targetUserId) return { ok: false, reason: 'No player selected.' };
  if (session.host_id !== hostUserId) return { ok: false, reason: 'Only the host can invite players.' };
  if (session.status && session.status !== 'waiting') return { ok: false, reason: 'That game is no longer open.' };
  const players = session.players || [];
  if (players.some((p) => p.user_id === targetUserId)) {
    return { ok: false, already_in: true, reason: 'That player is already in the game.' };
  }
  if (players.length >= (session.max_players || 6)) return { ok: false, reason: 'The game is full.' };
  if (!targetOnline) return { ok: false, reason: 'That player is no longer online.' };
  return { ok: true };
}

module.exports = { canInvite };
