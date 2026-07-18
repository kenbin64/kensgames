/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * db.js — SQLite records layer for kensgames.com
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GOVERNING TENANT: Use geometry when the question is navigational.
 *                   Use records when the question is exact. Never substitute.
 *
 * This module owns ALL transactional/exact state:
 *   users, sessions, password-reset tokens, game scores, game session records.
 *
 * Navigational queries (matchmaking, game discovery, invite-code routing)
 * belong to the manifold layer (manifold-projection.js, js/manifold-*.js).
 *
 * The manifold_usage_log table records every query + which substrate handled
 * it + whether it succeeded, enabling proven-usage statistics.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const STATE_DIR = path.join(__dirname, '..', 'state');
const DB_PATH = path.join(STATE_DIR, 'kensgames.db');

let _db = null;

// ── Open / initialise ────────────────────────────────────────────────────────

function getDb() {
  if (_db) return _db;
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  _db = new Database(DB_PATH, { fileMustExist: false });
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');
  _createTables(_db);
  return _db;
}

// ── Schema ───────────────────────────────────────────────────────────────────

function _createTables(db) {
  db.exec(`
    -- ─────────────────────────────────────────────────────────────────────────
    -- RECORDS LAYER: exact state — never derived from the manifold
    --   Covers: identity, auth, scores, audit, tokens.
    --   Governing tenant: "Use records when the question is exact."
    -- ─────────────────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS users (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      username                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      email_lower              TEXT    UNIQUE,
      password_hash            TEXT,
      display_name             TEXT    NOT NULL,
      avatar_json              TEXT,
      status                   TEXT    NOT NULL DEFAULT 'active'
                                       CHECK(status IN ('active','pending','banned','suspended')),
      admin_level              INTEGER NOT NULL DEFAULT 0 CHECK(admin_level BETWEEN 0 AND 3),
      email_verified           INTEGER NOT NULL DEFAULT 0,
      verification_code_hash   TEXT,
      verification_code_expiry INTEGER,
      created_at               INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at               INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_login_at            INTEGER,
      last_password_change_at  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email_lower);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

    -- Password reset tokens: 15-minute TTL, single-use.
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email_lower TEXT    NOT NULL,
      token_hash  TEXT    NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      expires_at  INTEGER NOT NULL,
      used_at     INTEGER,
      attempts    INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_prt_email ON password_reset_tokens(email_lower);

    -- Game sessions: exact record of who played, when, outcome.
    CREATE TABLE IF NOT EXISTS game_sessions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_uuid   TEXT    NOT NULL UNIQUE,
      game_id        TEXT    NOT NULL,
      started_at     INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      ended_at       INTEGER,
      winner_user_id INTEGER REFERENCES users(id),
      player_count   INTEGER NOT NULL DEFAULT 1,
      outcome_json   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_gs_game    ON game_sessions(game_id);
    CREATE INDEX IF NOT EXISTS idx_gs_started ON game_sessions(started_at);

    -- Game scores: leaderboard data, tied to user + game + session.
    CREATE TABLE IF NOT EXISTS game_scores (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id      TEXT    NOT NULL,
      score        INTEGER NOT NULL DEFAULT 0,
      rank         INTEGER,
      session_uuid TEXT    REFERENCES game_sessions(session_uuid),
      recorded_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_scores_user        ON game_scores(user_id);
    CREATE INDEX IF NOT EXISTS idx_scores_game        ON game_scores(game_id);
    CREATE INDEX IF NOT EXISTS idx_scores_leaderboard ON game_scores(game_id, score DESC);

    -- ─────────────────────────────────────────────────────────────────────────
    -- EVIDENCE LAYER: proven-usage log
    --   Records which substrate (manifold vs records) handled each query,
    --   the query kind (navigational vs exact), and whether it succeeded.
    --   Query: SELECT * FROM v_usage_stats to get percentages.
    -- ─────────────────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS manifold_usage_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      substrate   TEXT    NOT NULL CHECK(substrate IN ('manifold','records')),
      query_kind  TEXT    NOT NULL CHECK(query_kind IN ('navigational','exact','hybrid')),
      description TEXT    NOT NULL,
      success     INTEGER NOT NULL DEFAULT 1 CHECK(success IN (0,1)),
      latency_ms  INTEGER,
      notes       TEXT,
      recorded_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_mul_substrate ON manifold_usage_log(substrate);
    CREATE INDEX IF NOT EXISTS idx_mul_kind      ON manifold_usage_log(query_kind);

    -- Proven-usage summary view — query this to generate documentation evidence.
    CREATE VIEW IF NOT EXISTS v_usage_stats AS
    SELECT
      substrate,
      query_kind,
      COUNT(*)                                         AS total_queries,
      SUM(success)                                     AS successful,
      ROUND(100.0 * SUM(success) / COUNT(*), 1)        AS success_pct,
      ROUND(AVG(latency_ms), 1)                        AS avg_latency_ms
    FROM manifold_usage_log
    GROUP BY substrate, query_kind;

    -- Per-description breakdown for fine-grained analysis.
    CREATE VIEW IF NOT EXISTS v_usage_by_op AS
    SELECT
      substrate,
      query_kind,
      description,
      COUNT(*)                                         AS total,
      SUM(success)                                     AS ok,
      ROUND(100.0 * SUM(success) / COUNT(*), 1)        AS pct,
      ROUND(AVG(latency_ms), 1)                        AS avg_ms
    FROM manifold_usage_log
    GROUP BY substrate, query_kind, description
    ORDER BY substrate, query_kind, description;
  `);
}

// ── Utility ──────────────────────────────────────────────────────────────────

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// ── Evidence helper ──────────────────────────────────────────────────────────
// Call this whenever the manifold or records layer handles a query.

function logUsage({ substrate, queryKind, description, success = true, latencyMs = null, notes = null }) {
  try {
    getDb().prepare(`
      INSERT INTO manifold_usage_log (substrate, query_kind, description, success, latency_ms, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(substrate, queryKind, description, success ? 1 : 0, latencyMs, notes);
  } catch (_) { /* never crash the server over logging */ }
}

function getUsageStats() {
  return getDb().prepare('SELECT * FROM v_usage_stats').all();
}

function getUsageByOp() {
  return getDb().prepare('SELECT * FROM v_usage_by_op').all();
}

// ── User row deserialiser ────────────────────────────────────────────────────

function _row(row) {
  if (!row) return null;
  return {
    userId: row.id,
    id: row.id,
    username: row.username,
    email: row.email_lower || null,
    passwordHash: row.password_hash || null,
    displayName: row.display_name,
    avatar: row.avatar_json ? _safeJson(row.avatar_json) : null,
    status: row.status,
    adminLevel: row.admin_level,
    isSuperuser: row.admin_level >= 3,
    isAdmin: row.admin_level >= 2,
    emailVerified: !!row.email_verified,
    verificationCodeHash: row.verification_code_hash || null,
    verificationCodeExpiry: row.verification_code_expiry || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    lastPasswordChangeAt: row.last_password_change_at,
  };
}

function _safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return s; }
}

// ── users ────────────────────────────────────────────────────────────────────

const users = {

  create(u) {
    const db = getDb();
    const info = db.prepare(`
      INSERT INTO users
        (username, email_lower, password_hash, display_name, avatar_json,
         status, admin_level, email_verified,
         verification_code_hash, verification_code_expiry)
      VALUES
        (@username, @email_lower, @password_hash, @display_name, @avatar_json,
         @status, @admin_level, @email_verified,
         @verification_code_hash, @verification_code_expiry)
    `).run({
      username: u.username,
      email_lower: u.email ? u.email.toLowerCase() : null,
      password_hash: u.passwordHash || null,
      display_name: u.displayName || u.username,
      avatar_json: u.avatar != null ? JSON.stringify(u.avatar) : null,
      status: u.status || 'active',
      admin_level: u.adminLevel || 0,
      email_verified: u.emailVerified ? 1 : 0,
      verification_code_hash: u.verificationCodeHash || null,
      verification_code_expiry: u.verificationCodeExpiry || null,
    });
    logUsage({ substrate: 'records', queryKind: 'exact', description: 'users.create', success: true });
    return info.lastInsertRowid;
  },

  findByUsername(username) {
    const t0 = Date.now();
    const row = getDb()
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(username);
    logUsage({
      substrate: 'records', queryKind: 'exact', description: 'users.findByUsername',
      success: !!row, latencyMs: Date.now() - t0
    });
    return _row(row);
  },

  findByEmail(email) {
    const t0 = Date.now();
    const row = getDb()
      .prepare('SELECT * FROM users WHERE email_lower = ?')
      .get((email || '').toLowerCase());
    logUsage({
      substrate: 'records', queryKind: 'exact', description: 'users.findByEmail',
      success: !!row, latencyMs: Date.now() - t0
    });
    return _row(row);
  },

  findById(id) {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
    return _row(row);
  },

  usernameExists(username) {
    return !!getDb()
      .prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE')
      .get(username);
  },

  emailExists(email) {
    return !!getDb()
      .prepare('SELECT 1 FROM users WHERE email_lower = ?')
      .get((email || '').toLowerCase());
  },

  /** patch is an object with DB column names (snake_case) OR the camelCase aliases below. */
  update(username, patch) {
    const db = getDb();
    // camelCase → snake_case aliases accepted for convenience
    const ALIASES = {
      passwordHash: 'password_hash',
      displayName: 'display_name',
      avatar: 'avatar_json',        // accept {avatar} from PUT /api/profile so avatar stays changeable
      avatarJson: 'avatar_json',
      emailVerified: 'email_verified',
      verificationCodeHash: 'verification_code_hash',
      verificationCodeExpiry: 'verification_code_expiry',
      adminLevel: 'admin_level',
      lastLoginAt: 'last_login_at',
      lastPasswordChangeAt: 'last_password_change_at',
    };
    const ALLOWED = new Set([
      'password_hash', 'display_name', 'avatar_json', 'status', 'admin_level',
      'email_verified', 'verification_code_hash', 'verification_code_expiry',
      'last_login_at', 'last_password_change_at',
    ]);

    const fields = [];
    const values = [];

    for (const [k, v] of Object.entries(patch)) {
      const col = ALIASES[k] || k;
      if (!ALLOWED.has(col)) continue;
      // Coerce booleans for INTEGER columns
      if (col === 'email_verified') {
        fields.push(`${col} = ?`); values.push(v ? 1 : 0);
      } else if (col === 'avatar_json' && v !== null && typeof v === 'object') {
        fields.push(`${col} = ?`); values.push(JSON.stringify(v));
      } else {
        fields.push(`${col} = ?`); values.push(v);
      }
    }

    if (!fields.length) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(username);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE username = ? COLLATE NOCASE`).run(...values);
  },

  all() {
    return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(_row);
  },

  countByStatus() {
    return getDb().prepare(`
      SELECT status, COUNT(*) AS n FROM users GROUP BY status
    `).all();
  },
};

// ── Password reset tokens ────────────────────────────────────────────────────

const resetTokens = {

  create(email, token) {
    const db = getDb();
    const emailLower = email.toLowerCase();
    const tokenHash = sha256(token);
    const expiresAt = Date.now() + 15 * 60 * 1000;
    // Invalidate any previous unexpired token for this email
    db.prepare('DELETE FROM password_reset_tokens WHERE email_lower = ?').run(emailLower);
    db.prepare(`
      INSERT INTO password_reset_tokens (email_lower, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(emailLower, tokenHash, expiresAt);
    return { expiresAt };
  },

  validate(email, token) {
    const db = getDb();
    const emailLower = email.toLowerCase();
    const tokenHash = sha256(token);
    const row = db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE email_lower = ? AND token_hash = ? AND used_at IS NULL
    `).get(emailLower, tokenHash);

    if (!row) return { valid: false, error: 'Invalid recovery token' };
    if (row.attempts >= 5) return { valid: false, error: 'Too many attempts' };
    if (Date.now() > row.expires_at) return { valid: false, error: 'Recovery token expired' };

    // Increment attempt counter
    db.prepare('UPDATE password_reset_tokens SET attempts = attempts + 1 WHERE id = ?').run(row.id);

    const user = users.findByEmail(email);
    return { valid: true, username: user ? user.username : null };
  },

  consume(email, token) {
    const emailLower = email.toLowerCase();
    const tokenHash = sha256(token);
    getDb().prepare(`
      UPDATE password_reset_tokens SET used_at = ?
      WHERE email_lower = ? AND token_hash = ?
    `).run(Date.now(), emailLower, tokenHash);
  },
};

// ── Game scores ──────────────────────────────────────────────────────────────

const scores = {

  record(userId, gameId, score, sessionUuid, rank) {
    getDb().prepare(`
      INSERT INTO game_scores (user_id, game_id, score, rank, session_uuid)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, gameId, score, rank ?? null, sessionUuid ?? null);
    logUsage({ substrate: 'records', queryKind: 'exact', description: 'scores.record', success: true });
  },

  topForGame(gameId, limit = 10) {
    const t0 = Date.now();
    const rows = getDb().prepare(`
      SELECT gs.score, gs.rank, gs.recorded_at, u.username, u.display_name
      FROM game_scores gs
      JOIN users u ON u.id = gs.user_id
      WHERE gs.game_id = ?
      ORDER BY gs.score DESC
      LIMIT ?
    `).all(gameId, limit);
    logUsage({
      substrate: 'records', queryKind: 'exact', description: 'scores.topForGame',
      success: true, latencyMs: Date.now() - t0
    });
    return rows;
  },

  forUser(userId, gameId) {
    return getDb().prepare(`
      SELECT * FROM game_scores WHERE user_id = ? AND game_id = ?
      ORDER BY recorded_at DESC
    `).all(userId, gameId);
  },

  bestForUser(userId, gameId) {
    return getDb().prepare(
      'SELECT MAX(score) AS best FROM game_scores WHERE user_id = ? AND game_id = ?'
    ).get(userId, gameId);
  },
};

// ── Game sessions ────────────────────────────────────────────────────────────

const gameSessions = {

  create(sessionUuid, gameId, playerCount) {
    getDb().prepare(`
      INSERT OR IGNORE INTO game_sessions (session_uuid, game_id, player_count)
      VALUES (?, ?, ?)
    `).run(sessionUuid, gameId, playerCount || 1);
  },

  end(sessionUuid, winnerUserId, outcomeJson) {
    getDb().prepare(`
      UPDATE game_sessions
      SET ended_at = ?, winner_user_id = ?, outcome_json = ?
      WHERE session_uuid = ?
    `).run(Date.now(), winnerUserId ?? null,
      outcomeJson ? JSON.stringify(outcomeJson) : null,
      sessionUuid);
  },
};

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getDb,
  sha256,
  logUsage,
  getUsageStats,
  getUsageByOp,
  users,
  resetTokens,
  scores,
  gameSessions,
};
