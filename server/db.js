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

    -- ── Auth users (persistent login identity) ───────────────────────────
    CREATE TABLE IF NOT EXISTS auth_users (
      kg_user_id                INTEGER PRIMARY KEY,
      username                  TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      email                     TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      password_hash             TEXT,
      display_name              TEXT,
      avatar                    TEXT    NOT NULL DEFAULT '🎮',
      auth_method               INTEGER NOT NULL DEFAULT 1,
      status                    TEXT    NOT NULL DEFAULT 'active',
      email_verified            INTEGER NOT NULL DEFAULT 1,
      verification_code_hash    TEXT,
      verification_code_expiry  INTEGER,
      sessions_json             TEXT    NOT NULL DEFAULT '[]',
      last_password_change_at   INTEGER,
      created_at                INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login_at             INTEGER,
      FOREIGN KEY (kg_user_id) REFERENCES players(kg_user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_auth_users_email    ON auth_users(email COLLATE NOCASE);

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

    -- ── Beta Codes (promotional codes for beta testers) ────────────────────
    CREATE TABLE IF NOT EXISTS beta_codes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      code_type       TEXT    NOT NULL DEFAULT 'beta',
      created_by      INTEGER NOT NULL REFERENCES players(id),
      claimed_by      INTEGER REFERENCES players(id),
      status          TEXT    NOT NULL DEFAULT 'active',
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      claimed_at      INTEGER,
      expires_at      INTEGER,
      benefits        TEXT    NOT NULL DEFAULT 'free_play_lifetime'
    );
    CREATE INDEX IF NOT EXISTS idx_beta_codes_code ON beta_codes(code);
    CREATE INDEX IF NOT EXISTS idx_beta_codes_claimed_by ON beta_codes(claimed_by);

    -- ── Bug Reports (submitted by beta testers) ────────────────────────────
    CREATE TABLE IF NOT EXISTS bug_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      game_id         TEXT,
      title           TEXT    NOT NULL,
      description     TEXT    NOT NULL,
      priority        TEXT    NOT NULL DEFAULT 'medium',
      status          TEXT    NOT NULL DEFAULT 'open',
      steps_to_repro  TEXT,
      screenshot_url  TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at     INTEGER,
      resolved_by     INTEGER REFERENCES players(id),
      resolution_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter ON bug_reports(reporter_id);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_priority ON bug_reports(priority);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);

    -- ── User Reviews (5-star reviews, superuser-only visibility) ──────────
    CREATE TABLE IF NOT EXISTS user_reviews (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      rating          INTEGER NOT NULL,
      comment         TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON user_reviews(reviewer_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_rating ON user_reviews(rating);
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

const AuthDB = {
  _nextKgUserId() {
    const row = db().prepare('SELECT COALESCE(MAX(kg_user_id), 0) + 1 AS next_id FROM players').get();
    return row && row.next_id ? row.next_id : 1;
  },

  _mergeRow(row) {
    if (!row) return null;
    let sessions = [];
    try { sessions = JSON.parse(row.sessions_json || '[]'); } catch { sessions = []; }
    return {
      userId: row.kg_user_id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      displayName: row.display_name || row.username,
      avatar: row.avatar || '🎮',
      authMethod: row.auth_method || 1,
      status: row.status || 'active',
      emailVerified: row.email_verified === 1,
      verificationCodeHash: row.verification_code_hash || null,
      verificationCodeExpiry: row.verification_code_expiry || null,
      sessions,
      lastPasswordChangeAt: row.last_password_change_at || null,
      createdAt: row.created_at ? row.created_at * 1000 : Date.now(),
      lastLoginAt: row.last_login_at ? row.last_login_at * 1000 : null,
      profileSetup: row.profile_setup === 1,
      playername: row.player_name || null,
      avatarId: row.avatar_id || null,
      isAdmin: row.is_admin === 1,
      isSuperuser: row.is_superuser === 1,
      adminLevel: row.is_superuser === 1 ? 3 : 0,
    };
  },

  _selectBy(whereClause, value) {
    const row = db().prepare(`
      SELECT a.*, p.player_name, p.avatar_id, p.profile_setup, p.is_admin, p.is_superuser
      FROM auth_users a
      JOIN players p ON p.kg_user_id = a.kg_user_id
      WHERE ${whereClause}
      LIMIT 1
    `).get(value);
    return AuthDB._mergeRow(row);
  },

  listUsers() {
    const rows = db().prepare(`
      SELECT a.*, p.player_name, p.avatar_id, p.profile_setup, p.is_admin, p.is_superuser
      FROM auth_users a
      JOIN players p ON p.kg_user_id = a.kg_user_id
      ORDER BY a.kg_user_id ASC
    `).all();
    return rows.map(AuthDB._mergeRow);
  },

  getByUsername(username) {
    return AuthDB._selectBy('a.username = ? COLLATE NOCASE', username);
  },

  getByEmail(email) {
    return AuthDB._selectBy('a.email = ? COLLATE NOCASE', String(email || '').toLowerCase());
  },

  getByKgUserId(kgUserId) {
    return AuthDB._selectBy('a.kg_user_id = ?', kgUserId);
  },

  createUser({
    username,
    email,
    passwordHash,
    displayName,
    avatar,
    authMethod,
    status,
    emailVerified,
    verificationCodeHash,
    verificationCodeExpiry,
    isAdmin,
    isSuperuser,
    sessions,
  }) {
    const d = db();
    const uname = String(username || '').trim();
    const em = String(email || '').trim().toLowerCase();
    if (!uname || !em) throw new Error('username and email required');

    const tx = d.transaction(() => {
      const kgUserId = AuthDB._nextKgUserId();
      const emailEnc = PiiCrypto.encrypt(em);
      d.prepare(
        `INSERT INTO players (kg_user_id, email_hash, email_enc, status, is_admin, is_superuser)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        kgUserId,
        hashEmail(em),
        emailEnc,
        status || 'active',
        isAdmin ? 1 : 0,
        isSuperuser ? 1 : 0,
      );

      d.prepare(
        `INSERT INTO auth_users (
          kg_user_id, username, email, password_hash, display_name, avatar,
          auth_method, status, email_verified, verification_code_hash,
          verification_code_expiry, sessions_json, created_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)`
      ).run(
        kgUserId,
        uname,
        em,
        passwordHash || null,
        displayName || uname,
        avatar || '🎮',
        Number(authMethod) || 1,
        status || 'active',
        emailVerified === false ? 0 : 1,
        verificationCodeHash || null,
        verificationCodeExpiry || null,
        JSON.stringify(Array.isArray(sessions) ? sessions : []),
        null,
      );

      return kgUserId;
    });

    const id = tx();
    return AuthDB.getByKgUserId(id);
  },

  updateByUsername(username, patch) {
    const current = AuthDB.getByUsername(username);
    if (!current) return null;
    return AuthDB.updateByKgUserId(current.userId, patch);
  },

  updateByKgUserId(kgUserId, patch) {
    const current = AuthDB.getByKgUserId(kgUserId);
    if (!current) return null;
    const next = { ...current, ...(patch || {}) };

    db().prepare(
      `UPDATE auth_users SET
        username=?,
        email=?,
        password_hash=?,
        display_name=?,
        avatar=?,
        auth_method=?,
        status=?,
        email_verified=?,
        verification_code_hash=?,
        verification_code_expiry=?,
        sessions_json=?,
        last_password_change_at=?,
        last_login_at=?
      WHERE kg_user_id=?`
    ).run(
      next.username,
      String(next.email || '').toLowerCase(),
      next.passwordHash || null,
      next.displayName || next.username,
      next.avatar || '🎮',
      Number(next.authMethod) || 1,
      next.status || 'active',
      next.emailVerified === false ? 0 : 1,
      next.verificationCodeHash || null,
      next.verificationCodeExpiry || null,
      JSON.stringify(Array.isArray(next.sessions) ? next.sessions : []),
      next.lastPasswordChangeAt ? Math.floor(Number(next.lastPasswordChangeAt) / 1000) : null,
      next.lastLoginAt ? Math.floor(Number(next.lastLoginAt) / 1000) : null,
      kgUserId,
    );

    db().prepare(
      'UPDATE players SET email_hash=?, email_enc=?, status=?, is_admin=?, is_superuser=? WHERE kg_user_id=?'
    ).run(
      hashEmail(next.email || ''),
      PiiCrypto.encrypt(next.email || ''),
      next.status || 'active',
      next.isAdmin ? 1 : 0,
      next.isSuperuser ? 1 : 0,
      kgUserId,
    );

    return AuthDB.getByKgUserId(kgUserId);
  },

  // ── Admin role management ──────────────────────────────────────────────

  isSuperuser(kgUserId) {
    const d = db();
    const row = d.prepare('SELECT is_superuser FROM admins WHERE player_id = (SELECT id FROM players WHERE kg_user_id = ?) AND active = 1').get(kgUserId);
    return row ? row.is_superuser === 1 : false;
  },

  isAdmin(kgUserId) {
    const d = db();
    const row = d.prepare('SELECT is_superuser FROM admins WHERE player_id = (SELECT id FROM players WHERE kg_user_id = ?) AND active = 1').get(kgUserId);
    return row ? true : false;
  },

  elevateToSuperuser(targetKgUserId, elevatedByKgUserId) {
    const d = db();
    // Check that elevator is already superuser
    if (!AuthDB.isSuperuser(elevatedByKgUserId)) {
      throw new Error('Only superuser can elevate to superuser');
    }
    // Get player IDs
    const targetPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(targetKgUserId);
    const elevatedByPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(elevatedByKgUserId);
    if (!targetPlayer || !elevatedByPlayer) throw new Error('Player not found');

    // Deactivate any existing superuser
    d.prepare('UPDATE admins SET active = 0, revoked_at = unixepoch(), revoked_by = ? WHERE is_superuser = 1 AND active = 1').run(elevatedByPlayer.id);

    // Insert or update new superuser
    const existing = d.prepare('SELECT id FROM admins WHERE player_id = ?').get(targetPlayer.id);
    if (existing) {
      d.prepare('UPDATE admins SET is_superuser = 1, active = 1, granted_by = ?, granted_at = unixepoch() WHERE player_id = ?').run(elevatedByPlayer.id, targetPlayer.id);
    } else {
      d.prepare('INSERT INTO admins (player_id, is_superuser, granted_by, granted_at, active) VALUES (?, 1, ?, unixepoch(), 1)').run(targetPlayer.id, elevatedByPlayer.id);
    }
    return AuthDB.getByKgUserId(targetKgUserId);
  },

  createAdmin(targetKgUserId, createdByKgUserId, reason) {
    const d = db();
    // Check that creator is superuser
    if (!AuthDB.isSuperuser(createdByKgUserId)) {
      throw new Error('Only superuser can create admins');
    }
    const targetPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(targetKgUserId);
    const createdByPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(createdByKgUserId);
    if (!targetPlayer || !createdByPlayer) throw new Error('Player not found');

    // Insert admin record (not superuser)
    const existing = d.prepare('SELECT id FROM admins WHERE player_id = ?').get(targetPlayer.id);
    if (existing) throw new Error('User is already an admin');

    d.prepare('INSERT INTO admins (player_id, is_superuser, granted_by, granted_at, active, notes_enc) VALUES (?, 0, ?, unixepoch(), 1, ?)').run(targetPlayer.id, createdByPlayer.id, reason || '');
    return AuthDB.getByKgUserId(targetKgUserId);
  },

  revokeAdmin(targetKgUserId, revokedByKgUserId, reason) {
    const d = db();
    // Check that revoker is superuser
    if (!AuthDB.isSuperuser(revokedByKgUserId)) {
      throw new Error('Only superuser can revoke admins');
    }
    // Superuser cannot be revoked
    if (AuthDB.isSuperuser(targetKgUserId)) {
      throw new Error('Cannot revoke superuser status this way');
    }

    const targetPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(targetKgUserId);
    const revokedByPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(revokedByKgUserId);
    if (!targetPlayer || !revokedByPlayer) throw new Error('Player not found');

    d.prepare('UPDATE admins SET active = 0, revoked_at = unixepoch(), revoked_by = ?, notes_enc = ? WHERE player_id = ?').run(revokedByPlayer.id, reason || '', targetPlayer.id);
    return AuthDB.getByKgUserId(targetKgUserId);
  },

  // ── Beta code management ───────────────────────────────────────────────

  generateBetaCodes(count, generatedByKgUserId, expiresInDays) {
    const d = db();
    const adminPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(generatedByKgUserId);
    if (!adminPlayer) throw new Error('Admin not found');

    const codes = [];
    const expiresAt = expiresInDays ? Math.floor(Date.now() / 1000) + (expiresInDays * 86400) : null;

    const stmt = d.prepare(`
      INSERT INTO beta_codes (code, code_type, created_by, status, expires_at, benefits)
      VALUES (?, 'beta', ?, 'active', ?, 'free_play_lifetime')
    `);

    const tx = d.transaction(() => {
      for (let i = 0; i < count; i++) {
        // Generate unique code: BETA-XXXXX-XXXXX format
        const code = 'BETA-' + Math.random().toString(36).substr(2, 5).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
        stmt.run(code, adminPlayer.id, expiresAt);
        codes.push(code);
      }
    });

    tx();
    return codes;
  },

  claimBetaCode(code, claimerKgUserId) {
    const d = db();
    const betaRow = d.prepare('SELECT id, claimed_by FROM beta_codes WHERE code = ? COLLATE NOCASE').get(code);
    if (!betaRow) throw new Error('Invalid beta code');
    if (betaRow.claimed_by) throw new Error('Code already claimed');

    const claimerPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(claimerKgUserId);
    if (!claimerPlayer) throw new Error('Claimer not found');

    d.prepare('UPDATE beta_codes SET claimed_by = ?, claimed_at = unixepoch(), status = \'claimed\' WHERE id = ?').run(claimerPlayer.id, betaRow.id);
    return betaRow;
  },

  getBetaCodesStatus(generatedByKgUserId) {
    const d = db();
    const adminPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(generatedByKgUserId);
    if (!adminPlayer) throw new Error('Admin not found');

    return d.prepare(`
      SELECT
        code, status, claimed_by, created_at, claimed_at, expires_at,
        (SELECT player_name FROM players WHERE id = claimed_by) as claimed_by_name
      FROM beta_codes
      WHERE created_by = ?
      ORDER BY created_at DESC
    `).all(adminPlayer.id);
  },

  // ── Bug reporting ──────────────────────────────────────────────────────

  submitBugReport(reporterKgUserId, gameId, title, description, priority, stepsToRepro) {
    const d = db();
    const reporter = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(reporterKgUserId);
    if (!reporter) throw new Error('Reporter not found');

    const validPriorities = ['minor', 'moderate', 'major', 'critical', 'show_stopper'];
    const pri = validPriorities.includes(priority) ? priority : 'moderate';

    d.prepare(`
      INSERT INTO bug_reports (reporter_id, game_id, title, description, priority, steps_to_repro, status)
      VALUES (?, ?, ?, ?, ?, ?, 'open')
    `).run(reporter.id, gameId || null, title, description, pri, stepsToRepro || null);

    return d.prepare('SELECT * FROM bug_reports WHERE id = last_insert_rowid()').get();
  },

  getBugReports(filterBy = 'all', superuserKgUserId) {
    const d = db();
    // Verify caller is superuser
    if (!AuthDB.isSuperuser(superuserKgUserId)) {
      throw new Error('Only superuser can view bug reports');
    }

    let query = `
      SELECT
        b.*,
        (SELECT player_name FROM players WHERE id = b.reporter_id) as reporter_name,
        (SELECT player_name FROM players WHERE id = b.resolved_by) as resolved_by_name
      FROM bug_reports b
    `;

    if (filterBy === 'open') {
      query += ' WHERE b.status = \'open\'';
    } else if (filterBy === 'critical') {
      query += ' WHERE b.priority IN (\'critical\', \'show_stopper\')';
    }

    query += ' ORDER BY b.created_at DESC LIMIT 100';

    return d.prepare(query).all();
  },

  updateBugReportStatus(bugReportId, newStatus, resolvedByKgUserId, resolutionNote) {
    const d = db();
    const resolvedByPlayer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(resolvedByKgUserId);

    d.prepare(`
      UPDATE bug_reports
      SET status = ?, resolved_by = ?, resolved_at = unixepoch(), resolution_note = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(newStatus, resolvedByPlayer?.id || null, resolutionNote || null, bugReportId);

    return d.prepare('SELECT * FROM bug_reports WHERE id = ?').get(bugReportId);
  },

  // ── User reviews ───────────────────────────────────────────────────────

  submitReview(reviewerKgUserId, rating, comment) {
    const d = db();
    const reviewer = d.prepare('SELECT id FROM players WHERE kg_user_id = ?').get(reviewerKgUserId);
    if (!reviewer) throw new Error('Reviewer not found');

    const validRating = Math.min(5, Math.max(1, parseInt(rating) || 3));

    d.prepare(`
      INSERT INTO user_reviews (reviewer_id, rating, comment)
      VALUES (?, ?, ?)
    `).run(reviewer.id, validRating, comment || null);

    return d.prepare('SELECT * FROM user_reviews WHERE id = last_insert_rowid()').get();
  },

  getReviews(superuserKgUserId) {
    const d = db();
    // Verify caller is superuser
    if (!AuthDB.isSuperuser(superuserKgUserId)) {
      throw new Error('Only superuser can view reviews');
    }

    return d.prepare(`
      SELECT
        r.*,
        (SELECT player_name FROM players WHERE id = r.reviewer_id) as reviewer_name,
        (SELECT avatar FROM players WHERE id = r.reviewer_id) as reviewer_avatar
      FROM user_reviews r
      ORDER BY r.created_at DESC
    `).all();
  },

  getReviewStats(superuserKgUserId) {
    const d = db();
    if (!AuthDB.isSuperuser(superuserKgUserId)) {
      throw new Error('Only superuser can view review stats');
    }

    return d.prepare(`
      SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_count,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_count,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_count,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_count
      FROM user_reviews
    `).get();
  },
};

module.exports = { db, PlayerDB, AdminDB, AuthDB, PiiCrypto, hashEmail, xpToLevel, MEDALLION_LEVELS, MEDALLION_MIN_XP };
