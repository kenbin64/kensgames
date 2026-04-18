/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KENSGAMES — SHARED IN-MEMORY STORE
 * ═══════════════════════════════════════════════════════════════════════════
 * Single source of truth imported by index.js and all route modules.
 * In production this would be replaced with a persistent DB (Redis / Postgres).
 *
 * Maps:
 *   manifoldData   — user records (auth, profile, stats)
 *   guildsData     — guild records
 *   friendsData    — friendship graph & block lists
 *   leaderboardData— per-game high-score lists
 *   tournamentsData— tournament announcements + results
 *   notifQueue     — pending notifications (guild appeals, friend requests)
 *   sessionsData   — active game sessions (waiting room, invite codes, player ready state)
 */

const manifoldData = {};  // key: "user-<username>"  value: UserRecord
const guildsData = {};  // key: "guild-<id>"       value: GuildRecord
const friendsData = {};  // key: <userId>           value: FriendRecord
const leaderboardData = {};  // key: <gameId>           value: ScoreEntry[]
const tournamentsData = [];  // TournamentRecord[]
const notifQueue = {};  // key: <userId>           value: Notification[]
const sessionsData = {};  // key: <sessionId>       value: GameSession

module.exports = {
  manifoldData,
  guildsData,
  friendsData,
  leaderboardData,
  tournamentsData,
  notifQueue,
  sessionsData,
};
