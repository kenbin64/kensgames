/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KensGames — User Registry (passwordless, secret-as-bearer)
 *
 *  Identity model:
 *    secret_username   — high-entropy bearer credential (server-minted)
 *    user_id           — HMAC(lookup_pepper, secret_username) → 16 hex
 *    Per-user folder   — state/users/<user_id>/
 *      profile.json    — { display_name, email?, avatar:{type,id|mime,w,h} }
 *      avatar.b64      — only if avatar.type==='upload'
 *      secret.hmac     — HMAC(verify_pepper, secret_username), hex
 *
 *  Two independent peppers ensure that disclosure of either disk contents
 *  or one pepper alone does not yield secrets.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_USERS_DIR = path.join(__dirname, '..', 'state', 'users');
const PROFILE_FILE = 'profile.json';
const AVATAR_FILE = 'avatar.b64';
const SECRET_HMAC_FILE = 'secret.hmac';

const MAX_DISPLAY_NAME = 24;
const MAX_EMAIL = 254;
const MAX_AVATAR_BYTES = 12 * 1024;     // ~12 KB upper bound for 80x80 PNG/JPEG
const MAX_AVATAR_DIM = 80;
const SECRET_PREFIX = 'kg-';

function _peppers() {
  return {
    lookup: process.env.KG_USER_PEPPER_LOOKUP || 'kg-lookup-default-DEV-only-change-me',
    verify: process.env.KG_USER_PEPPER_VERIFY || 'kg-verify-default-DEV-only-change-me',
  };
}

function _hmac(pepper, value) {
  return crypto.createHmac('sha256', String(pepper)).update(String(value)).digest('hex');
}

function userIdFromSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  return 'user_' + _hmac(_peppers().lookup, secret).slice(0, 16);
}

function _verifyHmac(secret) {
  return _hmac(_peppers().verify, secret);
}

function _mintSecret() {
  // 4 groups × 6 hex chars = 24 hex chars (96 bits) plus prefix.
  const bytes = crypto.randomBytes(12).toString('hex');
  return SECRET_PREFIX + bytes.match(/.{1,6}/g).join('-');
}

function _userDir(usersDir, userId) {
  return path.join(usersDir, userId);
}

function _ensureDir(dir, mode) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: mode || 0o700 });
}

function _writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), { mode: 0o600 });
}

function _readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function _sanitizeDisplayName(name) {
  const s = String(name || '').trim().replace(/[\u0000-\u001F\u007F]/g, '');
  return s.slice(0, MAX_DISPLAY_NAME);
}

function _sanitizeEmail(email) {
  if (email == null || email === '') return null;
  const s = String(email).trim().slice(0, MAX_EMAIL);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
}

// Image validation: parse magic bytes + dimensions. Never trust client claims.
function _validateImage(b64, declaredMime) {
  if (!b64 || typeof b64 !== 'string') return { ok: false, error: 'missing_image' };
  if (b64.length > MAX_AVATAR_BYTES * 2) return { ok: false, error: 'too_large' };
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (_) { return { ok: false, error: 'bad_base64' }; }
  if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) return { ok: false, error: 'too_large' };

  // PNG: 8-byte sig 89 50 4E 47 0D 0A 1A 0A; IHDR at offset 16; w/h are 4-byte BE ints.
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w === 0 || h === 0 || w > MAX_AVATAR_DIM || h > MAX_AVATAR_DIM) return { ok: false, error: 'bad_dimensions', w, h };
    return { ok: true, mime: 'image/png', w, h };
  }
  // JPEG: FF D8 FF; scan for SOF0/SOF2 marker (FF C0 / FF C2).
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        const h = buf.readUInt16BE(i + 5);
        const w = buf.readUInt16BE(i + 7);
        if (w === 0 || h === 0 || w > MAX_AVATAR_DIM || h > MAX_AVATAR_DIM) return { ok: false, error: 'bad_dimensions', w, h };
        return { ok: true, mime: 'image/jpeg', w, h };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
    return { ok: false, error: 'jpeg_no_sof' };
  }
  return { ok: false, error: 'unsupported_format' };
}

function _normalizeAvatar(avatar) {
  if (!avatar || typeof avatar !== 'object') return null;
  const type = String(avatar.type || '').toLowerCase();
  if (type === 'picker') {
    const id = String(avatar.id || '').slice(0, 64);
    if (!id) return null;
    return { type: 'picker', id, emoji: String(avatar.emoji || '').slice(0, 8), name: String(avatar.name || '').slice(0, 64) };
  }
  if (type === 'upload') {
    const v = _validateImage(avatar.b64, avatar.mime);
    if (!v.ok) return { _error: v };
    return { type: 'upload', mime: v.mime, w: v.w, h: v.h, b64: String(avatar.b64) };
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

function createUser(opts, usersDir) {
  const dir = usersDir || DEFAULT_USERS_DIR;
  _ensureDir(dir);
  const displayName = _sanitizeDisplayName(opts && opts.display_name);
  if (!displayName) return { ok: false, error: 'invalid_display_name' };
  const email = _sanitizeEmail(opts && opts.email);
  if (opts && opts.email && !email) return { ok: false, error: 'invalid_email' };
  let avatar = null;
  if (opts && opts.avatar) {
    avatar = _normalizeAvatar(opts.avatar);
    if (!avatar) return { ok: false, error: 'invalid_avatar' };
    if (avatar._error) return { ok: false, error: 'invalid_avatar', detail: avatar._error };
  }

  // Mint a non-colliding secret (extremely unlikely collision but check anyway).
  let secret, userId, attempts = 0;
  do {
    secret = _mintSecret();
    userId = userIdFromSecret(secret);
    attempts++;
    if (attempts > 5) return { ok: false, error: 'mint_collision' };
  } while (fs.existsSync(_userDir(dir, userId)));

  const userDir = _userDir(dir, userId);
  _ensureDir(userDir);

  const now = new Date().toISOString();
  const profile = {
    user_id: userId,
    display_name: displayName,
    email: email || null,
    avatar: avatar
      ? (avatar.type === 'upload'
        ? { type: 'upload', mime: avatar.mime, w: avatar.w, h: avatar.h }
        : { type: 'picker', id: avatar.id, emoji: avatar.emoji, name: avatar.name })
      : null,
    created_at: now,
    updated_at: now,
  };
  _writeJson(path.join(userDir, PROFILE_FILE), profile);
  fs.writeFileSync(path.join(userDir, SECRET_HMAC_FILE), _verifyHmac(secret), { mode: 0o600 });
  if (avatar && avatar.type === 'upload') {
    fs.writeFileSync(path.join(userDir, AVATAR_FILE), avatar.b64, { mode: 0o600 });
  }
  return { ok: true, secret_username: secret, user_id: userId, profile };
}

function _verifyAndDir(secret, usersDir) {
  const dir = usersDir || DEFAULT_USERS_DIR;
  const userId = userIdFromSecret(secret);
  if (!userId) return { ok: false, error: 'invalid_secret' };
  const userDir = _userDir(dir, userId);
  if (!fs.existsSync(userDir)) return { ok: false, error: 'not_found' };
  const stored = (() => { try { return fs.readFileSync(path.join(userDir, SECRET_HMAC_FILE), 'utf8').trim(); } catch (_) { return ''; } })();
  const expected = _verifyHmac(secret);
  // Constant-time comparison.
  if (stored.length !== expected.length) return { ok: false, error: 'verify_failed' };
  if (!crypto.timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(expected, 'hex'))) {
    return { ok: false, error: 'verify_failed' };
  }
  return { ok: true, userId, userDir };
}

function lookupBySecret(secret, usersDir) {
  const v = _verifyAndDir(secret, usersDir);
  if (!v.ok) return v;
  const profile = _readJson(path.join(v.userDir, PROFILE_FILE));
  if (!profile) return { ok: false, error: 'profile_missing' };
  return { ok: true, user_id: v.userId, profile };
}

function getAvatarData(secret, usersDir) {
  const v = _verifyAndDir(secret, usersDir);
  if (!v.ok) return v;
  const profile = _readJson(path.join(v.userDir, PROFILE_FILE));
  if (!profile || !profile.avatar || profile.avatar.type !== 'upload') {
    return { ok: false, error: 'no_upload' };
  }
  let b64;
  try { b64 = fs.readFileSync(path.join(v.userDir, AVATAR_FILE), 'utf8'); }
  catch (_) { return { ok: false, error: 'avatar_missing' }; }
  return { ok: true, mime: profile.avatar.mime, w: profile.avatar.w, h: profile.avatar.h, b64 };
}

function updateProfile(secret, patch, usersDir) {
  const v = _verifyAndDir(secret, usersDir);
  if (!v.ok) return v;
  const profile = _readJson(path.join(v.userDir, PROFILE_FILE));
  if (!profile) return { ok: false, error: 'profile_missing' };
  if (patch && patch.display_name !== undefined) {
    const dn = _sanitizeDisplayName(patch.display_name);
    if (!dn) return { ok: false, error: 'invalid_display_name' };
    profile.display_name = dn;
  }
  if (patch && patch.email !== undefined) {
    if (patch.email === null || patch.email === '') profile.email = null;
    else {
      const em = _sanitizeEmail(patch.email);
      if (!em) return { ok: false, error: 'invalid_email' };
      profile.email = em;
    }
  }
  profile.updated_at = new Date().toISOString();
  _writeJson(path.join(v.userDir, PROFILE_FILE), profile);
  return { ok: true, user_id: v.userId, profile };
}

function setAvatar(secret, avatarInput, usersDir) {
  const v = _verifyAndDir(secret, usersDir);
  if (!v.ok) return v;
  const profile = _readJson(path.join(v.userDir, PROFILE_FILE));
  if (!profile) return { ok: false, error: 'profile_missing' };
  const av = _normalizeAvatar(avatarInput);
  if (!av) return { ok: false, error: 'invalid_avatar' };
  if (av._error) return { ok: false, error: 'invalid_avatar', detail: av._error };
  if (av.type === 'upload') {
    fs.writeFileSync(path.join(v.userDir, AVATAR_FILE), av.b64, { mode: 0o600 });
    profile.avatar = { type: 'upload', mime: av.mime, w: av.w, h: av.h };
  } else {
    try { fs.unlinkSync(path.join(v.userDir, AVATAR_FILE)); } catch (_) { }
    profile.avatar = { type: 'picker', id: av.id, emoji: av.emoji, name: av.name };
  }
  profile.updated_at = new Date().toISOString();
  _writeJson(path.join(v.userDir, PROFILE_FILE), profile);
  return { ok: true, user_id: v.userId, profile };
}

function findByEmail(email, usersDir) {
  const dir = usersDir || DEFAULT_USERS_DIR;
  if (!fs.existsSync(dir)) return null;
  const target = _sanitizeEmail(email);
  if (!target) return null;
  for (const entry of fs.readdirSync(dir)) {
    const profile = _readJson(path.join(dir, entry, PROFILE_FILE));
    if (profile && profile.email && profile.email === target) return { user_id: entry, profile };
  }
  return null;
}

module.exports = {
  DEFAULT_USERS_DIR, PROFILE_FILE, AVATAR_FILE, SECRET_HMAC_FILE,
  MAX_AVATAR_DIM, MAX_AVATAR_BYTES, MAX_DISPLAY_NAME, SECRET_PREFIX,
  userIdFromSecret, _mintSecret, _verifyHmac, _userDir, _ensureDir,
  _writeJson, _readJson, _sanitizeDisplayName, _sanitizeEmail,
  _validateImage, _normalizeAvatar,
  createUser, lookupBySecret, updateProfile, setAvatar, getAvatarData, findByEmail,
};
