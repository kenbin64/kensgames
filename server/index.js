/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD AUTH API SERVER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Minimal Express server for in-house authentication
 * All state lives on manifold coordinates (no database)
 * 7 endpoints: register, login, validate, forgot-password, reset-password,
 *              promote-superuser, admin-info
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const AuthHandler = require('./auth-handler');
const EncryptionService = require('./encryption');
const EmailService = require('./email-service');
const db = require('./db');

// Initialize Express
const app = express();
const authHandler = new AuthHandler();
const encryptionService = new EncryptionService();
const emailService = new EmailService();

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['https://kensgames.com', 'https://www.kensgames.com', 'http://localhost:3000', 'http://localhost', 'http://127.0.0.1'],
  credentials: true
}));

// ── Records layer (SQLite via db.js) ─────────────────────────────────────────
// Transactional/exact state: users, tokens, scores.
// Navigational/relational queries use manifold-projection.js.

// Kick off DB initialisation immediately so the file is created before
// the first request arrives.
db.getDb();

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/register
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;

    // Validate username
    const usernameCheck = authHandler.validateUsername(username);
    if (!usernameCheck.valid) {
      return res.status(400).json({ success: false, error: usernameCheck.error });
    }

    // Check if username exists
    if (db.users.usernameExists(username)) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }

      // Check if email exists
      if (db.users.emailExists(email)) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      // Email cannot contain username
      if (email.toLowerCase().includes(username.toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Email cannot contain username' });
      }
    }

    // Validate password
    const passwordCheck = authHandler.validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ success: false, error: passwordCheck.error });
    }

    // Hash password
    const passwordHash = await authHandler.hashPassword(password);

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeHash = require('crypto')
      .createHash('sha256')
      .update(verificationCode)
      .digest('hex');

    // Persist user to records layer (exact state — credentials, identity)
    const newUserId = db.users.create({
      username,
      email,
      passwordHash,
      displayName: username,
      avatar: avatar || '🎮',
      status: 'active',
      emailVerified: true,
      verificationCodeHash,
      verificationCodeExpiry: Date.now() + (24 * 60 * 60 * 1000),
      adminLevel: 0,
    });

    // Send verification email (non-blocking — don't await)
    if (email) {
      emailService.sendVerificationEmail(email, username, verificationCode)
        .catch(emailError => console.error('Verification email failed:', emailError));
    }

    return res.status(201).json({
      success: true,
      message: 'Account created! You can now sign in.',
      userId: newUserId,
      username,
      email,
      requiresEmailVerification: false
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username required' });
    }

    // Find user (records layer)
    // NOTE: UI label says "Username or Email", but older code only looked up username.
    // Accept email login transparently.
    const loginIdent = String(username).trim();
    let userData = db.users.findByUsername(loginIdent);

    if (!userData && loginIdent.includes('@')) {
      userData = db.users.findByEmail(loginIdent);
    }

    if (!userData) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check status
    if (userData.status === 'banned') {
      return res.status(403).json({ success: false, error: 'User banned' });
    }

    if (userData.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'User suspended' });
    }

    if (userData.status === 'pending' || !userData.emailVerified) {
      return res.status(403).json({
        success: false,
        error: 'Email not verified. Please check your email for verification code.',
        requiresVerification: true
      });
    }

    // Validate password if required
    if (userData.passwordHash) {
      if (!password) {
        return res.status(401).json({ success: false, error: 'Password required' });
      }

      const passwordMatch = await authHandler.comparePassword(password, userData.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }
    }

    // Create JWT session
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const token = authHandler.generateToken(userData.userId, sessionId);

    // Record last login in the records layer (use canonical username from DB)
    const canonicalUsername = userData.username;
    db.users.update(canonicalUsername, { last_login_at: Date.now() });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      userId: userData.userId,
      username: canonicalUsername,
      displayName: userData.displayName,
      avatar: userData.avatar
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════// ENDPOINT: GET /api/profile  /  PUT /api/profile
// ═════════════════════════════════════════════════════════════════════════
// Cross-device persistence for player display name + avatar.
// Bound to the user account via Bearer token. Guests (no token) get 401
// and fall back to localStorage-only.

function _profileFromToken(req) {
  const raw = req.headers.authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'No token provided', status: 401 };
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return { error: decoded.error, status: 401 };
  const user = db.users.findById(decoded.userId);
  if (!user) return { error: 'User not found', status: 404 };
  return { user };
}

app.get('/api/profile', (req, res) => {
  const ctx = _profileFromToken(req);
  if (ctx.error) return res.status(ctx.status).json({ success: false, error: ctx.error });
  const u = ctx.user;
  return res.status(200).json({
    success: true,
    userId: u.userId,
    username: u.username,
    displayName: u.displayName || u.username,
    avatar: u.avatar || null,
  });
});

app.put('/api/profile', express.json(), (req, res) => {
  const ctx = _profileFromToken(req);
  if (ctx.error) return res.status(ctx.status).json({ success: false, error: ctx.error });
  const u = ctx.user;
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName')) {
    const dn = String(req.body.displayName || '').trim().slice(0, 32);
    if (dn.length < 2) {
      return res.status(400).json({ success: false, error: 'displayName must be ≥2 chars' });
    }
    patch.displayName = dn;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar')) {
    const av = req.body.avatar;
    if (av === null) {
      patch.avatar = null;
    } else if (av && typeof av === 'object') {
      patch.avatar = {
        id: String(av.id || '').slice(0, 64),
        emoji: String(av.emoji || '').slice(0, 8),
        name: String(av.name || '').slice(0, 32),
      };
      if (!patch.avatar.id || !patch.avatar.emoji) {
        return res.status(400).json({ success: false, error: 'avatar requires id + emoji' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'avatar must be object or null' });
    }
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ success: false, error: 'nothing to update' });
  }

  db.users.update(u.username, patch);
  const updated = db.users.findByUsername(u.username);
  return res.status(200).json({
    success: true,
    userId: updated.userId,
    username: updated.username,
    displayName: updated.displayName || updated.username,
    avatar: updated.avatar || null,
  });
});

// ═════════════════════════════════════════════════════════════════════════// ENDPOINT: GET /api/auth/validate
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/auth/validate', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const decoded = authHandler.verifyToken(token);
    if (decoded.error) {
      return res.status(401).json({ valid: false, error: decoded.error });
    }

    return res.status(200).json({
      valid: true,
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      expiresAt: decoded.exp * 1000 // Convert to milliseconds
    });
  } catch (error) {
    console.error('Validate error:', error);
    return res.status(500).json({ valid: false, error: 'Validation failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/forgot-password
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Find user by email (records layer — exact lookup)
    const userData = db.users.findByEmail(email);

    // For security, always return success even if email not found
    // This prevents email enumeration attacks
    if (!userData) {
      console.warn(`Password recovery requested for unknown email: ${email}`);
      return res.status(200).json({
        success: true,
        message: 'If this email exists in our system, a recovery link has been sent.'
      });
    }

    // Generate recovery token and persist to records layer
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    db.resetTokens.create(email, token);

    // Send recovery email
    try {
      await emailService.sendPasswordRecoveryEmail(email, token, userData.username);
      console.log(`✓ Recovery email sent to ${email}`);
    } catch (emailError) {
      console.error('Recovery email failed:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send recovery email. Please try again later.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Recovery email sent. Check your inbox and spam folder.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, error: 'Password recovery failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/reset-password
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, token, password } = req.body;

    // Validate inputs
    if (!email || !token || !password) {
      return res.status(400).json({ success: false, error: 'Email, token, and password required' });
    }

    // Validate recovery token (records layer)
    const tokenValidation = db.resetTokens.validate(email, token);
    if (!tokenValidation.valid) {
      return res.status(401).json({ success: false, error: tokenValidation.error });
    }

    const username = tokenValidation.username;

    // Validate new password
    const passwordCheck = authHandler.validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ success: false, error: passwordCheck.error });
    }

    // Hash new password
    const passwordHash = await authHandler.hashPassword(password);

    // Update user record
    db.users.update(username, {
      password_hash: passwordHash,
      last_password_change_at: Date.now(),
    });

    // Consume the token
    db.resetTokens.consume(email, token);

    console.log(`✓ Password reset successful for ${username}`);

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, error: 'Password reset failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/verify-email
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { username, email, verificationCode } = req.body;

    // Validate inputs
    if (!username || !email || !verificationCode) {
      return res.status(400).json({ success: false, error: 'Username, email, and verification code required' });
    }

    // Find user (records layer)
    const userData = db.users.findByUsername(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if already verified
    if (userData.emailVerified) {
      return res.status(400).json({ success: false, error: 'Email already verified' });
    }

    // Check verification code expiry
    if (Date.now() > userData.verificationCodeExpiry) {
      return res.status(401).json({ success: false, error: 'Verification code expired' });
    }

    // Verify email matches
    if (userData.email !== email.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Email does not match' });
    }

    // Verify code (timing-safe comparison)
    const crypto = require('crypto');
    const providedCodeHash = crypto
      .createHash('sha256')
      .update(verificationCode)
      .digest('hex');

    try {
      const codeMatch = crypto.timingSafeEqual(
        Buffer.from(providedCodeHash, 'hex'),
        Buffer.from(userData.verificationCodeHash, 'hex')
      );
      if (!codeMatch) {
        return res.status(401).json({ success: false, error: 'Invalid verification code' });
      }
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid verification code' });
    }

    // Mark email as verified in records layer
    db.users.update(username, {
      email_verified: 1,
      status: 'active',
      verification_code_hash: null,
      verification_code_expiry: null,
    });

    console.log(`✓ Email verified for user ${username}`);

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! You can now login.',
      username: username
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({ success: false, error: 'Email verification failed' });
  }
});



app.get('/api/health', (req, res) => {
  const dbOk = !!db.getDb();
  res.json({ status: 'OK', timestamp: Date.now(), database: dbOk ? 'sqlite' : 'unavailable' });
});

// Evidence endpoint — proven-usage stats per substrate (public; non-sensitive aggregate only)
app.get('/api/substrate-evidence', (req, res) => {
  try {
    res.json({ success: true, stats: db.getUsageStats(), byOp: db.getUsageByOp() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Evidence query failed' });
  }
});

// Proxy GM log ingest/tail to lobby server so public /api/gm/log works even
// when nginx routes /api/* to this auth service.
async function proxyGmLog(req, res) {
  const lobbyBase = `http://127.0.0.1:${process.env.LOBBY_PORT || '8765'}`;
  const target = `${lobbyBase}/api/gm/log${req.method === 'GET' && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers['x-kg-guest-id']) headers['X-KG-Guest-Id'] = String(req.headers['x-kg-guest-id']);
  if (req.headers['x-kg-secret']) headers['X-KG-Secret'] = String(req.headers['x-kg-secret']);
  if (req.headers.authorization) headers['Authorization'] = String(req.headers.authorization);

  try {
    const init = {
      method: req.method,
      headers,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = JSON.stringify(req.body || {});
    }
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.set('Content-Type', ct);
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ error: 'gm_log_proxy_failed', detail: err && err.message ? err.message : String(err) });
  }
}

app.post('/api/gm/log', proxyGmLog);
app.get('/api/gm/log', proxyGmLog);

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/resend-verification
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ success: false, error: 'Username and email required' });
    }

    // Find user (records layer)
    const userData = db.users.findByUsername(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if already verified
    if (userData.emailVerified) {
      return res.status(400).json({ success: false, error: 'Email already verified' });
    }

    // Verify email matches
    if (userData.email !== email.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Email does not match' });
    }

    // Generate new verification code
    const crypto = require('crypto');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeHash = crypto
      .createHash('sha256')
      .update(verificationCode)
      .digest('hex');

    // Update records layer with new code
    db.users.update(username, {
      verification_code_hash: verificationCodeHash,
      verification_code_expiry: Date.now() + (24 * 60 * 60 * 1000),
    });

    // Send verification email
    try {
      await emailService.sendVerificationEmail(email, username, verificationCode);
    } catch (emailError) {
      console.error('Verification email failed:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email. Please try again later.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code sent! Check your email.'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ success: false, error: 'Failed to resend verification code' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to check if user is superuser
 */
function requireSuperuser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const decoded = authHandler.verifyToken(token);
  if (decoded.error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // Find user and check if superuser (records layer — exact auth check)
  const userId = decoded.userId;
  const callerUser = db.users.findById(userId);
  const isAdmin = callerUser && callerUser.adminLevel >= 3;

  if (!isAdmin) {
    return res.status(403).json({ success: false, error: 'Superuser access required' });
  }

  req.userId = userId;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/promote-superuser
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/admin/promote-superuser', (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, error: 'Username required' });
    }

    const userData = db.users.findByUsername(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (userData.adminLevel >= 3) {
      return res.status(400).json({ success: false, error: 'Already a superuser' });
    }

    db.users.update(username, { admin_level: 3 });

    console.log(`✓ ${username} promoted to superuser`);

    return res.status(200).json({
      success: true,
      message: `${username} is now a superuser`,
      username: username,
      adminLevel: 3
    });
  } catch (error) {
    console.error('Promote superuser error:', error);
    return res.status(500).json({ success: false, error: 'Promotion failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/users (requires superuser)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/admin/users', requireSuperuser, (req, res) => {
  try {
    const allUsers = db.users.all().map(u => ({
      userId: u.userId,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      avatar: u.avatar,
      status: u.status,
      emailVerified: u.emailVerified,
      isAdmin: u.isAdmin,
      isSuperuser: u.isSuperuser,
      adminLevel: u.adminLevel,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));

    return res.status(200).json({
      success: true,
      users: allUsers,
      totalUsers: allUsers.length,
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/stats (requires superuser)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/admin/stats', requireSuperuser, (req, res) => {
  try {
    const byStatus = db.users.countByStatus();
    const tally = { active: 0, banned: 0, suspended: 0, pending: 0 };
    let totalUsers = 0;
    for (const row of byStatus) { tally[row.status] = row.n; totalUsers += row.n; }

    const allUsers = db.users.all();
    const admins = allUsers.filter(u => u.adminLevel >= 2).length;
    const superusers = allUsers.filter(u => u.adminLevel >= 3).length;

    // Include proven-usage evidence in admin stats
    const usageStats = db.getUsageStats();

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeUsers: tally.active,
        bannedUsers: tally.banned,
        suspendedUsers: tally.suspended,
        pendingUsers: tally.pending,
        admins,
        superusers,
        timestamp: Date.now(),
      },
      substrateEvidence: usageStats,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/user/:username/suspend (requires superuser)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/admin/user/:username/suspend', requireSuperuser, (req, res) => {
  try {
    const { username } = req.params;

    const userData = db.users.findByUsername(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    db.users.update(username, { status: 'suspended' });

    console.log(`⚠️ ${username} suspended`);

    return res.status(200).json({
      success: true,
      message: `${username} has been suspended`
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    return res.status(500).json({ success: false, error: 'Failed to suspend user' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/user/:username/ban (requires superuser)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/admin/user/:username/ban', requireSuperuser, (req, res) => {
  try {
    const { username } = req.params;

    const userData = db.users.findByUsername(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    db.users.update(username, { status: 'banned' });

    console.log(`🚫 ${username} banned`);

    return res.status(200).json({
      success: true,
      message: `${username} has been banned`
    });
  } catch (error) {
    console.error('Ban user error:', error);
    return res.status(500).json({ success: false, error: 'Failed to ban user' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/user/:username/activate (requires superuser)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/admin/user/:username/activate', requireSuperuser, (req, res) => {
  try {
    const { username } = req.params;

    const userData = db.users.findByUsername(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    db.users.update(username, { status: 'active', email_verified: 1 });

    console.log(`✓ ${username} activated by admin`);

    return res.status(200).json({
      success: true,
      message: `${username} has been activated`
    });
  } catch (error) {
    console.error('Activate user error:', error);
    return res.status(500).json({ success: false, error: 'Failed to activate user' });
  }
});





// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎮 Manifold Auth Server running on http://localhost:${PORT}`);
  const dbPath = require('path').join(__dirname, '..', 'state', 'kensgames.db');
  console.log(`💾 Database: ${dbPath}`);
  console.log(`📝 Endpoints:`);
  console.log(`   GET  /api/admin/stats  — includes substrate evidence (use v_usage_stats view for full breakdown)`);
  console.log(`   POST /api/auth/register`);
  console.log(`   POST /api/auth/login`);
  console.log(`   GET  /api/auth/validate`);
  console.log(`   POST /api/auth/forgot-password`);
  console.log(`   POST /api/auth/reset-password`);
});

module.exports = app;
