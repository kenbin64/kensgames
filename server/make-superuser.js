'use strict';
/**
 * Make a single account THE sole superuser (admin_level 3).
 *
 * Ken's rule: one superuser, and no one can ban or lock them out. The relay
 * already grants that immunity to admin_level >= 3 (server/relay-auth.js); this
 * script sets the flag on the account and guarantees it is the ONLY one, by
 * demoting any other superuser to a regular admin (level 2).
 *
 * One-time, run after the account has been registered:
 *   node server/make-superuser.js <playername>
 */
const db = require('./db.js');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node server/make-superuser.js <playername>');
  process.exit(1);
}

const dbh = db.getDb();
const user = dbh
  .prepare('SELECT id, username, admin_level FROM users WHERE username = ? COLLATE NOCASE')
  .get(username);

if (!user) {
  console.error(`No account named "${username}". Register it in the app first, then re-run this.`);
  process.exit(1);
}

const promote = dbh.transaction((targetId) => {
  // Keep the invariant: exactly one superuser. Demote any other level-3 account
  // to a plain admin (level 2), then promote the target.
  dbh.prepare('UPDATE users SET admin_level = 2, updated_at = CURRENT_TIMESTAMP WHERE admin_level >= 3 AND id <> ?').run(targetId);
  dbh.prepare('UPDATE users SET admin_level = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetId);
});
promote(user.id);

const after = dbh.prepare('SELECT username, admin_level FROM users WHERE id = ?').get(user.id);
const others = dbh.prepare('SELECT COUNT(*) AS n FROM users WHERE admin_level >= 3 AND id <> ?').get(user.id);
console.log(`${after.username} is now the superuser (admin_level ${after.admin_level}). Other superusers: ${others.n}.`);
