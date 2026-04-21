/**
 * KensGames — SQLite Persistent Store
 * Uses better-sqlite3 (synchronous API — ideal for Express servers)
 *
 * Manifold coordinate system per player:
 *   x = normalized tenure   (days_since_join / 730)  — 0.0 → 1.0
 *   y = normalized activity (sessions / 1000)         — 0.0 → 1.0
 *   z = x * y  → composite rank surface (Relation Surface)
 *
 * PII policy:
 *   - email stored as SHA-256 hash (email_hash) for fast lookups
 *   - email also stored AES-256-GCM encrypted (email_enc) for superuser-only retrieval
 *   - passwords: bcrypt-hashed in manifold JSON (never in SQLite)
 *   - player_name is the only public identifier
 *   - game stats, avatar, manifold coords are non-PII and stored plaintext
 *   - admin notes stored encrypted in admins table
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'kensgames.db');
let _db = null;

const DIMENSION_MAX_LEVEL = 7;
const DIMENSION_FIB = [0, 1, 1, 2, 3, 5, 8, 13];

function fibAt(level) {
  const idx = Math.max(0, Math.min(DIMENSION_MAX_LEVEL, Number(level) || 0));
  return DIMENSION_FIB[idx] || 0;
}

function buildDimensionalState(level, length, width, height) {
  const l = Math.max(0, Math.min(DIMENSION_MAX_LEVEL, Number(level) || 0));
  const x = Math.max(0, Number.isFinite(Number(length)) ? Number(length) : fibAt(l));
  const y = Math.max(0, Number.isFinite(Number(width)) ? Number(width) : fibAt(Math.max(l - 1, 0)) || (l > 0 ? 1 : 0));
  const zAxis = Math.max(0, Number.isFinite(Number(height)) ? Number(height) : fibAt(Math.max(l - 2, 0)) || (l > 1 ? 1 : 0));

  const plane = x * y;     // D2: plane = x * y
  const volume = plane * zAxis; // D3: volume = x * y * z
  const mass = volume;     // D4+: atomic object count carried upward

  const thetaDeg = l * 90;
  const thetaRad = (thetaDeg * Math.PI) / 180;
  const radius = fibAt(l);
  const hx = radius * Math.cos(thetaRad);
  const hy = radius * Math.sin(thetaRad);
  const hz = hx * hy;      // Schwartz-style coupling: z = x * y in helix projection

  return {
    level: l,
    fib_scale: radius,
    x,
    y,
    z_axis: zAxis,
    plane,
    volume,
    mass,
    theta_deg: thetaDeg,
    helix_x: hx,
    helix_y: hy,
    helix_z: hz,
    updated_at: Math.floor(Date.now() / 1000),
  };
}

// ─── PII encryption (AES-256-GCM) ────────────────────────────────────────────
// ENCRYPTION_KEY must be exactly 64 hex chars (= 32 bytes) in .env
const _PII_KEY = (() => {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && hex.length === 64) return Buffer.from(hex, 'hex');
  console.warn('[db] ENCRYPTION_KEY missing or wrong length — PII encryption disabled');
  return null;
})();

const PiiCrypto = {
  /** Encrypt any string value; returns "base64iv.base64cipher.base64tag" or null */
  encrypt(val) {
    if (val === null || val === undefined || !_PII_KEY) return null;
    try {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', _PII_KEY, iv);
      let enc = c.update(String(val), 'utf8', 'base64');
      enc += c.final('base64');
      const tag = c.getAuthTag();
      return `${iv.toString('base64')}.${enc}.${tag.toString('base64')}`;
    } catch (e) {
      console.error('[PiiCrypto] encrypt error:', e.message);
      return null;
    }
  },
  /** Decrypt an encrypted string; returns original value or null */
  decrypt(enc) {
    if (!enc || !_PII_KEY) return null;
    try {
      const parts = enc.split('.');
      if (parts.length !== 3) return null;
      const iv = Buffer.from(parts[0], 'base64');
      const tag = Buffer.from(parts[2], 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', _PII_KEY, iv);
      d.setAuthTag(tag);
      let out = d.update(parts[1], 'base64', 'utf8');
      out += d.final('utf8');
      return out;
    } catch { return null; }
  }
};

function db() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _initSchema(_db);
  }
  return _db;
}

function _initSchema(d) {
  d.exec(`
    -- ── Players ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS players (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      kg_user_id      INTEGER UNIQUE NOT NULL,
      email_hash      TEXT    UNIQUE NOT NULL,
      player_name     TEXT    UNIQUE COLLATE NOCASE,
      avatar_id       TEXT    NOT NULL DEFAULT 'p_f_med',
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen       INTEGER NOT NULL DEFAULT (unixepoch()),
      tos_agreed      INTEGER NOT NULL DEFAULT 0,
      tos_agreed_at   INTEGER,
      tos_version     TEXT    NOT NULL DEFAULT '1.0',
      profile_setup   INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'active',
      suspended_until INTEGER,
      ban_reason      TEXT,
      favorite_game   TEXT,
      is_admin        INTEGER NOT NULL DEFAULT 0,
      is_superuser    INTEGER NOT NULL DEFAULT 0,
      manifold_x      REAL    NOT NULL DEFAULT 0.0,
      manifold_y      REAL    NOT NULL DEFAULT 0.0
    );
    CREATE INDEX IF NOT EXISTS idx_players_name   ON players(player_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
    CREATE INDEX IF NOT EXISTS idx_players_uid    ON players(kg_user_id);

    -- ── Guilds ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS guilds (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_code          TEXT    UNIQUE NOT NULL,
      name                TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      tag                 TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      description         TEXT,
      master_id           INTEGER NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
      min_medallion       TEXT    NOT NULL DEFAULT 'none',
      is_public           INTEGER NOT NULL DEFAULT 1,
      is_dissolved        INTEGER NOT NULL DEFAULT 0,
      dissolved_at        INTEGER,
      guild_tos_agreed_at INTEGER NOT NULL DEFAULT 0
    );

    -- ── Guild members ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS guild_members (
      guild_id        INTEGER NOT NULL REFERENCES guilds(id)  ON DELETE CASCADE,
      player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      role            TEXT    NOT NULL DEFAULT 'member',
      joined_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      status          TEXT    NOT NULL DEFAULT 'active',
      suspended_until INTEGER,
      PRIMARY KEY (guild_id, player_id)
    );

    -- ── Guild audit log ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS guild_actions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   INTEGER NOT NULL REFERENCES guilds(id)  ON DELETE CASCADE,
      actor_id   INTEGER NOT NULL REFERENCES players(id),
      target_id  INTEGER NOT NULL REFERENCES players(id),
      action     TEXT    NOT NULL,
      reason     TEXT,
      duration   TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Guild suspension appeals ───────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS guild_appeals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      INTEGER NOT NULL REFERENCES guilds(id)  ON DELETE CASCADE,
      player_id     INTEGER NOT NULL REFERENCES players(id),
      message       TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      decided_at    INTEGER,
      decision_note TEXT
    );

    -- ── Friends (two rows per pair for fast bidirectional lookup) ──────────
    CREATE TABLE IF NOT EXISTS friends (
      player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      friend_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (player_id, friend_id)
    );

    -- ── Blocks (one-sided; 24h cooldown before re-ban) ────────────────────
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      blocked_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      unban_after INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    -- ── Medallions (per player per game — ranked matches only) ────────────
    CREATE TABLE IF NOT EXISTS medallions (
      player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      game_id      TEXT    NOT NULL,
      level        TEXT    NOT NULL DEFAULT 'bronze',
      xp           INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won    INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (player_id, game_id)
    );
    CREATE INDEX IF NOT EXISTS idx_med_game ON medallions(game_id, level DESC);

    -- ── Favorite games ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS favorites (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      game_id   TEXT    NOT NULL,
      added_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (player_id, game_id)
    );

    -- ── Player preferences (sound, music, display, etc.) ──────────────────
    CREATE TABLE IF NOT EXISTS preferences (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      key       TEXT    NOT NULL,
      value     TEXT,
      PRIMARY KEY (player_id, key)
    );

    -- ── Portal & game logs ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS portal_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  INTEGER REFERENCES players(id),
      game_id    TEXT,
      level      TEXT    NOT NULL DEFAULT 'info',
      message    TEXT    NOT NULL,
      detail     TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_logs_recent ON portal_logs(created_at DESC);

    -- ── System-wide admin actions ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS admin_actions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_player_id  INTEGER REFERENCES players(id),
      target_player_id INTEGER NOT NULL REFERENCES players(id),
      action           TEXT    NOT NULL,
      reason           TEXT,
      expires_at       INTEGER,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Admin roster ───────────────────────────────────────────────────────
    -- is_superuser=1 is a protected hidden field; only 1 active superuser allowed.
    -- Partial unique index enforces the single-superuser constraint at the DB level.
    CREATE TABLE IF NOT EXISTS admins (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id      INTEGER UNIQUE NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      is_superuser   INTEGER NOT NULL DEFAULT 0,
      granted_by     INTEGER REFERENCES players(id),
      granted_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      notes_enc      TEXT,
      last_action_at INTEGER,
      revoked_at     INTEGER,
      revoked_by     INTEGER REFERENCES players(id),
      active         INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_superuser
      ON admins(is_superuser) WHERE is_superuser=1 AND active=1;
    CREATE INDEX IF NOT EXISTS idx_admins_player ON admins(player_id);

    -- ── Canonical dimensional model (void -> 7 levels) ───────────────────
    CREATE TABLE IF NOT EXISTS dimension_levels (
      level       INTEGER PRIMARY KEY,
      label       TEXT    NOT NULL,
      fib_scale   INTEGER NOT NULL,
      turn_deg    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dimensional_nodes (
      owner_type  TEXT    NOT NULL,
      owner_ref   TEXT    NOT NULL,
      level       INTEGER NOT NULL,
      fib_scale   INTEGER NOT NULL,
      x           REAL    NOT NULL,
      y           REAL    NOT NULL,
      z_axis      REAL    NOT NULL,
      plane       REAL    NOT NULL,
      volume      REAL    NOT NULL,
      mass        REAL    NOT NULL,
      theta_deg   INTEGER NOT NULL,
      helix_x     REAL    NOT NULL,
      helix_y     REAL    NOT NULL,
      helix_z     REAL    NOT NULL,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (owner_type, owner_ref)
    );
    CREATE INDEX IF NOT EXISTS idx_dimensional_nodes_level ON dimensional_nodes(level);
  `);

  // ── Safe schema migrations ─────────────────────────────────────────────
  // Add email_enc column if upgrading from an older schema
  try { d.exec('ALTER TABLE players ADD COLUMN email_enc TEXT'); } catch { }

  // Seed the canonical 0..7 dimensional ladder once.
  const insertLevel = d.prepare(`
    INSERT OR IGNORE INTO dimension_levels (level, label, fib_scale, turn_deg)
    VALUES (?, ?, ?, ?)
  `);
  const labels = ['void', 'length', 'width', 'plane', 'volume', 'mass', 'dimension6', 'dimension7'];
  for (let i = 0; i <= DIMENSION_MAX_LEVEL; i += 1) {
    insertLevel.run(i, labels[i], fibAt(i), i * 90);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

function xpToLevel(xp) {
  if (xp >= 5000) return 'diamond';
  if (xp >= 2000) return 'platinum';
  if (xp >= 750) return 'gold';
  if (xp >= 200) return 'silver';
  return 'bronze';
}

const MEDALLION_LEVELS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
const MEDALLION_MIN_XP = { bronze: 0, silver: 200, gold: 750, platinum: 2000, diamond: 5000 };

// ─── PlayerDB — all player-related DB operations ──────────────────────────────

const PlayerDB = {

  // ── Core ─────────────────────────────────────────────────────────────────

  /** Called on every successful login — upserts record, touches last_seen.
   *  Pass emailEnc (AES-256-GCM encrypted email) so it's stored/updated. */
  ensurePlayer(kgUserId, email, emailEnc) {
    const d = db();
    const hash = hashEmail(email || '');
    const enc = emailEnc || PiiCrypto.encrypt(email || '') || null;
    const existing = d.prepare('SELECT * FROM players WHERE kg_user_id = ?').get(kgUserId);
    if (existing) {
      // Update last_seen and backfill email_enc if not already set
      if (enc && !existing.email_enc) {
        d.prepare('UPDATE players SET last_seen=unixepoch(), email_enc=? WHERE id=?').run(enc, existing.id);
      } else {
        d.prepare('UPDATE players SET last_seen=unixepoch() WHERE id=?').run(existing.id);
      }
      PlayerDB.upsertDimensionalNode('player', String(kgUserId), { level: 0 });
      return d.prepare('SELECT * FROM players WHERE id=?').get(existing.id);
    }
    const info = d.prepare(
      'INSERT INTO players (kg_user_id, email_hash, email_enc) VALUES (?,?,?)'
    ).run(kgUserId, hash, enc);
    PlayerDB.upsertDimensionalNode('player', String(kgUserId), { level: 0 });
    return d.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
  },

  upsertDimensionalNode(ownerType, ownerRef, { level = 0, x, y, z } = {}) {
    const state = buildDimensionalState(level, x, y, z);
    db().prepare(`
      INSERT INTO dimensional_nodes (
        owner_type, owner_ref, level, fib_scale,
        x, y, z_axis, plane, volume, mass,
        theta_deg, helix_x, helix_y, helix_z, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_type, owner_ref) DO UPDATE SET
        level=excluded.level,
        fib_scale=excluded.fib_scale,
        x=excluded.x,
        y=excluded.y,
        z_axis=excluded.z_axis,
        plane=excluded.plane,
        volume=excluded.volume,
        mass=excluded.mass,
        theta_deg=excluded.theta_deg,
        helix_x=excluded.helix_x,
        helix_y=excluded.helix_y,
        helix_z=excluded.helix_z,
        updated_at=excluded.updated_at
    `).run(
      String(ownerType),
      String(ownerRef),
      state.level,
      state.fib_scale,
      state.x,
      state.y,
      state.z_axis,
      state.plane,
      state.volume,
      state.mass,
      state.theta_deg,
      state.helix_x,
      state.helix_y,
      state.helix_z,
      state.updated_at,
    );
    return state;
  },

  getDimensionalNode(ownerType, ownerRef) {
    return db().prepare(
      'SELECT * FROM dimensional_nodes WHERE owner_type=? AND owner_ref=?'
    ).get(String(ownerType), String(ownerRef));
  },

  listDimensionLevels() {
    return db().prepare(
      'SELECT level, label, fib_scale, turn_deg FROM dimension_levels ORDER BY level ASC'
    ).all();
  },

  getByKgUserId(kgUserId) {
    return db().prepare('SELECT * FROM players WHERE kg_user_id = ?').get(kgUserId);
  },

  getById(id) {
    return db().prepare('SELECT * FROM players WHERE id = ?').get(id);
  },

  getByPlayerName(name) {
    return db().prepare('SELECT * FROM players WHERE player_name = ? COLLATE NOCASE').get(name);
  },

  isNameTaken(name, excludeKgUserId) {
    const row = db().prepare('SELECT kg_user_id FROM players WHERE player_name = ? COLLATE NOCASE').get(name);
    if (!row) return false;
    return row.kg_user_id !== excludeKgUserId;
  },

  agreeTOS(kgUserId, version) {
    db().prepare(
      'UPDATE players SET tos_agreed=1, tos_agreed_at=unixepoch(), tos_version=? WHERE kg_user_id=?'
    ).run(version || '1.0', kgUserId);
  },

  setupProfile(kgUserId, playerName, avatarId) {
    db().prepare(
      'UPDATE players SET player_name=?, avatar_id=?, profile_setup=1 WHERE kg_user_id=?'
    ).run(playerName, avatarId, kgUserId);
    return db().prepare('SELECT * FROM players WHERE kg_user_id=?').get(kgUserId);
  },

  updateAvatar(kgUserId, avatarId) {
    db().prepare('UPDATE players SET avatar_id=? WHERE kg_user_id=?').run(avatarId, kgUserId);
  },

  setStatus(kgUserId, status, reason, suspendUntil) {
    db().prepare(
      'UPDATE players SET status=?, ban_reason=?, suspended_until=? WHERE kg_user_id=?'
    ).run(status, reason || null, suspendUntil || null, kgUserId);
  },

  /** Admin-safe search: returns player_name + avatar only, no email */
  search(query, limit) {
    return db().prepare(
      'SELECT id, player_name, avatar_id, status FROM players WHERE player_name LIKE ? AND profile_setup=1 LIMIT ?'
    ).all(`%${query}%`, limit || 20);
  },

  updateManifold(id, x, y) {
    db().prepare('UPDATE players SET manifold_x=?, manifold_y=? WHERE id=?').run(x, y, id);
  },

  // ── Preferences ───────────────────────────────────────────────────────────

  getPrefs(playerId) {
    const rows = db().prepare('SELECT key, value FROM preferences WHERE player_id=?').all(playerId);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },

  setPref(playerId, key, value) {
    db().prepare(
      'INSERT INTO preferences (player_id, key, value) VALUES (?,?,?) ON CONFLICT(player_id,key) DO UPDATE SET value=excluded.value'
    ).run(playerId, key, value === null || value === undefined ? null : String(value));
  },

  // ── Medallions ────────────────────────────────────────────────────────────

  getMedallions(playerId) {
    return db().prepare('SELECT * FROM medallions WHERE player_id=?').all(playerId);
  },

  getMedallion(playerId, gameId) {
    return db().prepare('SELECT * FROM medallions WHERE player_id=? AND game_id=?').get(playerId, gameId);
  },

  /** Award XP for a ranked match result — invite/solo/bot matches do NOT call this */
  recordGameResult(playerId, gameId, xpEarned, won) {
    const existing = db().prepare('SELECT * FROM medallions WHERE player_id=? AND game_id=?').get(playerId, gameId);
    if (!existing) {
      const level = xpToLevel(xpEarned);
      db().prepare(
        'INSERT INTO medallions (player_id,game_id,xp,games_played,games_won,level) VALUES (?,?,?,1,?,?)'
      ).run(playerId, gameId, xpEarned, won ? 1 : 0, level);
    } else {
      const newXp = existing.xp + xpEarned;
      db().prepare(
        'UPDATE medallions SET xp=?,games_played=games_played+1,games_won=games_won+?,level=?,updated_at=unixepoch() WHERE player_id=? AND game_id=?'
      ).run(newXp, won ? 1 : 0, xpToLevel(newXp), playerId, gameId);
    }
  },

  // ── Favorites ─────────────────────────────────────────────────────────────

  getFavorites(playerId) {
    return db().prepare('SELECT game_id, added_at FROM favorites WHERE player_id=?').all(playerId);
  },

  toggleFavorite(playerId, gameId) {
    const existing = db().prepare('SELECT 1 FROM favorites WHERE player_id=? AND game_id=?').get(playerId, gameId);
    if (existing) {
      db().prepare('DELETE FROM favorites WHERE player_id=? AND game_id=?').run(playerId, gameId);
      return false; // removed
    }
    db().prepare('INSERT INTO favorites (player_id, game_id) VALUES (?,?)').run(playerId, gameId);
    return true; // added
  },

  // ── Friends ───────────────────────────────────────────────────────────────

  getFriends(playerId) {
    return db().prepare(`
      SELECT p.id, p.player_name, p.avatar_id, p.status, p.last_seen
      FROM friends f
      JOIN players p ON p.id = f.friend_id
      WHERE f.player_id = ?
    `).all(playerId);
  },

  addFriend(playerId, friendId) {
    const t = db().transaction(() => {
      try { db().prepare('INSERT INTO friends (player_id, friend_id) VALUES (?,?)').run(playerId, friendId); } catch { }
      try { db().prepare('INSERT INTO friends (player_id, friend_id) VALUES (?,?)').run(friendId, playerId); } catch { }
    });
    t();
  },

  removeFriend(playerId, friendId) {
    const t = db().transaction(() => {
      db().prepare('DELETE FROM friends WHERE player_id=? AND friend_id=?').run(playerId, friendId);
      db().prepare('DELETE FROM friends WHERE player_id=? AND friend_id=?').run(friendId, playerId);
    });
    t();
  },

  areFriends(aId, bId) {
    return !!db().prepare('SELECT 1 FROM friends WHERE player_id=? AND friend_id=?').get(aId, bId);
  },

  // ── Blocks ────────────────────────────────────────────────────────────────

  isBlocked(blockerId, targetId) {
    return !!db().prepare('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?').get(blockerId, targetId);
  },

  addBlock(blockerId, blockedId) {
    // Always remove mutual friendship first
    db().prepare(
      'DELETE FROM friends WHERE (player_id=? AND friend_id=?) OR (player_id=? AND friend_id=?)'
    ).run(blockerId, blockedId, blockedId, blockerId);
    const unbanAfter = Math.floor(Date.now() / 1000) + 86400; // 24h cooldown
    db().prepare(
      'INSERT INTO blocks (blocker_id, blocked_id, unban_after) VALUES (?,?,?) ON CONFLICT(blocker_id,blocked_id) DO UPDATE SET unban_after=excluded.unban_after, created_at=unixepoch()'
    ).run(blockerId, blockedId, unbanAfter);
  },

  removeBlock(blockerId, blockedId) {
    const row = db().prepare('SELECT unban_after FROM blocks WHERE blocker_id=? AND blocked_id=?').get(blockerId, blockedId);
    if (row && row.unban_after > Math.floor(Date.now() / 1000)) {
      const waitSec = row.unban_after - Math.floor(Date.now() / 1000);
      throw new Error(`Must wait ${Math.ceil(waitSec / 3600)} more hour(s) before unblocking`);
    }
    db().prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(blockerId, blockedId);
  },

  // ── Logging ───────────────────────────────────────────────────────────────

  log(playerId, gameId, level, message, detail) {
    db().prepare(
      'INSERT INTO portal_logs (player_id, game_id, level, message, detail) VALUES (?,?,?,?,?)'
    ).run(playerId || null, gameId || null, level || 'info', message, detail ? JSON.stringify(detail) : null);
  },

  getLogs({ playerId, gameId, level, limit } = {}) {
    let sql = 'SELECT * FROM portal_logs WHERE 1=1';
    const params = [];
    if (playerId) { sql += ' AND player_id=?'; params.push(playerId); }
    if (gameId) { sql += ' AND game_id=?'; params.push(gameId); }
    if (level) { sql += ' AND level=?'; params.push(level); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit || 100);
    return db().prepare(sql).all(...params);
  },

  // ── Admin actions ─────────────────────────────────────────────────────────

  recordAdminAction(adminId, targetId, action, reason, expiresAt) {
    db().prepare(
      'INSERT INTO admin_actions (admin_player_id, target_player_id, action, reason, expires_at) VALUES (?,?,?,?,?)'
    ).run(adminId || null, targetId, action, reason || null, expiresAt || null);
  },

  getAdminActions(targetId) {
    return db().prepare(
      'SELECT * FROM admin_actions WHERE target_player_id=? ORDER BY created_at DESC LIMIT 50'
    ).all(targetId);
  },

  // ── Guilds — read helpers (write ops live in routes/guilds.js) ────────────

  getGuild(id) { return db().prepare('SELECT * FROM guilds WHERE id=?').get(id); },
  getGuildByCode(code) { return db().prepare('SELECT * FROM guilds WHERE guild_code=?').get(code); },

  listPublicGuilds() {
    return db().prepare(`
      SELECT g.*, p.player_name AS master_name,
        (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id=g.id AND gm.status='active') AS member_count
      FROM guilds g JOIN players p ON p.id = g.master_id
      WHERE g.is_dissolved=0 AND g.is_public=1
      ORDER BY g.created_at DESC
    `).all();
  },

  getGuildMembers(guildId) {
    return db().prepare(`
      SELECT gm.*, p.player_name, p.avatar_id
      FROM guild_members gm JOIN players p ON p.id = gm.player_id
      WHERE gm.guild_id=?
    `).all(guildId);
  },

  getPlayerGuild(playerId) {
    return db().prepare(`
      SELECT g.*, gm.role, gm.status AS member_status
      FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
      WHERE gm.player_id=? AND gm.status='active' AND g.is_dissolved=0
      LIMIT 1
    `).get(playerId);
  },

  // ── Admin queries (no PII — email never returned) ─────────────────────────

  /** List all set-up players with aggregate stats. No email returned. */
  adminList(query, limit, offset) {
    const q = query ? `%${query}%` : '%';
    return db().prepare(`
      SELECT p.id, p.player_name, p.avatar_id, p.status, p.created_at, p.last_seen,
             p.is_admin, p.is_superuser, p.manifold_x, p.manifold_y,
             COALESCE(SUM(m.games_played), 0) AS total_games,
             COALESCE(SUM(m.games_won),   0) AS total_wins
      FROM players p
      LEFT JOIN medallions m ON m.player_id = p.id
      WHERE p.profile_setup = 1 AND p.player_name LIKE ?
      GROUP BY p.id
      ORDER BY p.last_seen DESC
      LIMIT ? OFFSET ?
    `).all(q, Math.min(limit || 50, 200), offset || 0);
  },

  /** Aggregate counts for admin dashboard header. */
  adminStats() {
    return db().prepare(`
      SELECT
        COUNT(*)                                                              AS total,
        SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END)               AS active,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)               AS suspended,
        SUM(CASE WHEN status = 'banned'    THEN 1 ELSE 0 END)               AS banned,
        SUM(profile_setup)                                                    AS setup_complete,
        SUM(CASE WHEN last_seen > unixepoch() - 86400 THEN 1 ELSE 0 END)    AS seen_today,
        SUM(CASE WHEN is_admin=1 OR is_superuser=1 THEN 1 ELSE 0 END)       AS admins
      FROM players
    `).get();
  },
};

// ─── AdminDB — admin roster + permission operations ───────────────────────────
const AdminDB = {

  /** Fetch active admin record for a player (null if not an admin) */
  getAdminRecord(playerId) {
    return db().prepare('SELECT * FROM admins WHERE player_id=? AND active=1').get(playerId);
  },

  isAdmin(playerId) {
    return !!db().prepare('SELECT 1 FROM admins WHERE player_id=? AND active=1').get(playerId);
  },

  isSuperuser(playerId) {
    return !!db().prepare('SELECT 1 FROM admins WHERE player_id=? AND is_superuser=1 AND active=1').get(playerId);
  },

  /** Get the single active superuser's full record (null if none) */
  getSuperuser() {
    return db().prepare(`
      SELECT a.*, p.player_name, p.avatar_id
      FROM admins a JOIN players p ON p.id=a.player_id
      WHERE a.is_superuser=1 AND a.active=1
    `).get();
  },

  /** List all active admins ordered: superuser first */
  listAdmins() {
    return db().prepare(`
      SELECT a.*, p.player_name, p.avatar_id,
             g.player_name AS granted_by_name
      FROM admins a
      JOIN players p ON p.id=a.player_id
      LEFT JOIN players g ON g.id=a.granted_by
      WHERE a.active=1
      ORDER BY a.is_superuser DESC, a.granted_at ASC
    `).all();
  },

  /**
   * Grant admin (or superuser) status.
   * isSuperuser=true is protected: will throw if a superuser already exists.
   * grantedBy = player_id of actor (null for system/bootstrap).
   */
  promoteAdmin(playerId, grantedBy, isSuperuser, notes) {
    if (isSuperuser) {
      const existing = db().prepare('SELECT 1 FROM admins WHERE is_superuser=1 AND active=1').get();
      if (existing) throw new Error('A superuser already exists. Use transferSuperuser() instead.');
    }
    const notesEnc = notes ? PiiCrypto.encrypt(notes) : null;
    const existing = db().prepare('SELECT id FROM admins WHERE player_id=?').get(playerId);
    if (existing) {
      // Re-activate (was previously revoked)
      db().prepare(
        'UPDATE admins SET active=1, is_superuser=?, granted_by=?, granted_at=unixepoch(), revoked_at=NULL, revoked_by=NULL, notes_enc=? WHERE player_id=?'
      ).run(isSuperuser ? 1 : 0, grantedBy || null, notesEnc, playerId);
    } else {
      db().prepare(
        'INSERT INTO admins (player_id, is_superuser, granted_by, notes_enc) VALUES (?,?,?,?)'
      ).run(playerId, isSuperuser ? 1 : 0, grantedBy || null, notesEnc);
    }
    // Keep denormalized columns in sync
    db().prepare('UPDATE players SET is_admin=1, is_superuser=? WHERE id=?')
      .run(isSuperuser ? 1 : 0, playerId);
  },

  /**
   * Revoke admin status. Protected: cannot revoke an active superuser via this method.
   * revokedBy = player_id of actor.
   */
  revokeAdmin(playerId, revokedBy) {
    const rec = db().prepare('SELECT * FROM admins WHERE player_id=? AND active=1').get(playerId);
    if (!rec) return; // not an admin — no-op
    if (rec.is_superuser) throw new Error('Cannot revoke superuser via revokeAdmin. Use transferSuperuser() instead.');
    db().prepare(
      'UPDATE admins SET active=0, revoked_at=unixepoch(), revoked_by=? WHERE player_id=?'
    ).run(revokedBy || null, playerId);
    db().prepare('UPDATE players SET is_admin=0, is_superuser=0 WHERE id=?').run(playerId);
  },

  /**
   * Transfer superuser role from one player to another atomically.
   * The former superuser is demoted to regular admin (not revoked).
   */
  transferSuperuser(fromPlayerId, toPlayerId) {
    const t = db().transaction(() => {
      // Demote current superuser → regular admin
      db().prepare('UPDATE admins SET is_superuser=0 WHERE player_id=? AND active=1').run(fromPlayerId);
      db().prepare('UPDATE players SET is_superuser=0 WHERE id=?').run(fromPlayerId);
      // Promote new player to superuser (create or update)
      const existing = db().prepare('SELECT id FROM admins WHERE player_id=? AND active=1').get(toPlayerId);
      if (existing) {
        db().prepare('UPDATE admins SET is_superuser=1 WHERE player_id=?').run(toPlayerId);
      } else {
        db().prepare(
          'INSERT INTO admins (player_id, is_superuser, granted_by) VALUES (?,1,?)'
        ).run(toPlayerId, fromPlayerId);
      }
      db().prepare('UPDATE players SET is_admin=1, is_superuser=1 WHERE id=?').run(toPlayerId);
    });
    t();
  },

  /** Touch last_action_at timestamp for an admin */
  updateLastAction(playerId) {
    db().prepare('UPDATE admins SET last_action_at=unixepoch() WHERE player_id=?').run(playerId);
  },

  /** List suspended players for superuser review (most recent first) */
  listSuspended() {
    return db().prepare(`
      SELECT p.id, p.player_name, p.avatar_id, p.status, p.suspended_until,
             p.ban_reason, p.is_admin,
             a.action AS last_action_type, a.reason AS last_action_reason,
             a.created_at AS action_at,
             actor.player_name AS action_by
      FROM players p
      LEFT JOIN admin_actions a ON a.id = (
        SELECT id FROM admin_actions WHERE target_player_id=p.id ORDER BY created_at DESC LIMIT 1
      )
      LEFT JOIN players actor ON actor.id = a.admin_player_id
      WHERE p.status = 'suspended'
      ORDER BY a.created_at DESC
    `).all();
  },

  /** List banned players */
  listBanned() {
    return db().prepare(`
      SELECT p.id, p.player_name, p.avatar_id, p.status,
             p.ban_reason, p.is_admin,
             a.action AS last_action_type, a.created_at AS action_at,
             actor.player_name AS action_by
      FROM players p
      LEFT JOIN admin_actions a ON a.id = (
        SELECT id FROM admin_actions WHERE target_player_id=p.id AND action='ban' ORDER BY created_at DESC LIMIT 1
      )
      LEFT JOIN players actor ON actor.id = a.admin_player_id
      WHERE p.status = 'banned'
      ORDER BY a.created_at DESC
    `).all();
  },
};

module.exports = { db, PlayerDB, AdminDB, PiiCrypto, hashEmail, xpToLevel, MEDALLION_LEVELS, MEDALLION_MIN_XP };
