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
const https = require('https');
const querystring = require('querystring');
require('dotenv').config();

const AuthHandler = require('./auth-handler');
const EncryptionService = require('./encryption');
const EmailService = require('./email-service');
const { PlayerDB, AdminDB, AuthDB, PiiCrypto } = require('./db'); // initialize DB schema on first require
const PasswordRecoveryManager = require('./password-recovery');

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

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER: Manifold Integration
// ═══════════════════════════════════════════════════════════════════════════
// TODO: Import manifold_core when server runs in Node environment
// For now using mock manifold - will be replaced with real manifold integration

const { manifoldData } = require('./store'); // Shared in-memory store
let nextUserId = 1;

function hydrateCacheFromAuthRow(row) {
  if (!row || !row.username) return null;
  const key = `user-${row.username}`;
  manifoldData[key] = {
    ...(manifoldData[key] || {}),
    id: `user-${row.userId}`,
    userId: row.userId,
    username: row.username,
    email: row.email,
    passwordHash: row.passwordHash || null,
    displayName: row.displayName || row.username,
    avatar: row.avatar || '🎮',
    authMethod: row.authMethod || 1,
    status: row.status || 'active',
    emailVerified: row.emailVerified !== false,
    verificationCodeHash: row.verificationCodeHash || null,
    verificationCodeExpiry: row.verificationCodeExpiry || null,
    sessions: Array.isArray(row.sessions) ? row.sessions : [],
    lastPasswordChangeAt: row.lastPasswordChangeAt || null,
    createdAt: row.createdAt || Date.now(),
    lastLoginAt: row.lastLoginAt || null,
    profileSetup: !!row.profileSetup,
    playername: row.playername || null,
    avatarId: row.avatarId || null,
    isAdmin: !!row.isAdmin,
    isSuperuser: !!row.isSuperuser,
    adminLevel: Number(row.adminLevel) || 0,
    lastModified: Date.now(),
  };
  if (row.userId >= nextUserId) nextUserId = row.userId + 1;
  return manifoldData[key];
}

function bootstrapAuthCache() {
  try {
    const all = AuthDB.listUsers();
    all.forEach(hydrateCacheFromAuthRow);
  } catch (e) {
    console.warn('[auth] bootstrap from sqlite failed:', e.message);
  }
}

bootstrapAuthCache();

// ─── Cloudflare Turnstile verification ────────────────────────────────────
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;

function verifyTurnstile(token, remoteip) {
  return new Promise((resolve) => {
    if (!TURNSTILE_SECRET) {
      // Secret not configured — fail open in dev, fail closed in production
      if (process.env.NODE_ENV === 'production') { resolve(false); }
      else { resolve(true); }
      return;
    }
    const body = querystring.stringify({
      secret: TURNSTILE_SECRET,
      response: token,
      ...(remoteip ? { remoteip } : {})
    });
    const req = https.request({
      hostname: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).success === true); }
        catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// Superuser email addresses — accounts registered with these emails are
// automatically granted isSuperuser=true, isAdmin=true, adminLevel=3.
const SUPERUSER_EMAILS = [
  'kenetics.art@gmail.com',
  'ken.bingham64@gmail.com',
];

// Initialize recovery manager with mock manifold
const recoveryManager = new PasswordRecoveryManager(manifoldData);
recoveryManager.startAutoCleanup();

/**
 * Get or create user coordinate [userId, authMethod, z]
 */
function getOrCreateUserCoordinate(username, authMethod = 1) {
  const fromDb = AuthDB.getByUsername(username);
  if (fromDb) return hydrateCacheFromAuthRow(fromDb);

  const coordinateKey = `user-${username}`;
  if (!manifoldData[coordinateKey]) {
    const userId = nextUserId++;
    manifoldData[coordinateKey] = {
      id: `user-${userId}`,
      userId: userId,
      username: username,
      authMethod: authMethod,
      coordinate: [userId, authMethod, userId * authMethod],
      createdAt: Date.now(),
      sessions: []
    };
  }
  return manifoldData[coordinateKey];
}

/**
 * Read user from manifold by username
 */
function readUserFromManifold(username) {
  const coordinateKey = `user-${username}`;
  if (manifoldData[coordinateKey]) return manifoldData[coordinateKey];
  const fromDb = AuthDB.getByUsername(username);
  return fromDb ? hydrateCacheFromAuthRow(fromDb) : null;
}

/**
 * Read user from manifold by email
 */
function readUserFromManifoldByEmail(email) {
  const em = String(email || '').toLowerCase();
  const fromDb = AuthDB.getByEmail(em);
  if (fromDb) return hydrateCacheFromAuthRow(fromDb);
  for (const key in manifoldData) {
    if (key.startsWith('user-') && String(manifoldData[key].email || '').toLowerCase() === em) {
      return manifoldData[key];
    }
  }
  return null;
}

/**
 * Write user to manifold
 */
function writeUserToManifold(username, userData) {
  const coordinateKey = `user-${username}`;
  const prev = manifoldData[coordinateKey] || readUserFromManifold(username) || null;
  manifoldData[coordinateKey] = {
    ...(prev || {}),
    ...userData,
    lastModified: Date.now()
  };
  const merged = manifoldData[coordinateKey];

  try {
    if (prev || merged.userId) {
      AuthDB.updateByUsername(username, {
        username: merged.username || username,
        email: merged.email,
        passwordHash: merged.passwordHash,
        displayName: merged.displayName,
        avatar: merged.avatar,
        authMethod: merged.authMethod,
        status: merged.status,
        emailVerified: merged.emailVerified,
        verificationCodeHash: merged.verificationCodeHash,
        verificationCodeExpiry: merged.verificationCodeExpiry,
        sessions: merged.sessions,
        lastPasswordChangeAt: merged.lastPasswordChangeAt,
        lastLoginAt: merged.lastLoginAt,
        isAdmin: merged.isAdmin,
        isSuperuser: merged.isSuperuser,
      });
    }
  } catch (e) {
    console.warn('[auth] sqlite sync failed:', e.message);
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/auth/access-session
// ═══════════════════════════════════════════════════════════════════════════
// If the request is already authenticated by Cloudflare Access, mint a
// KensGames JWT token and return it so game pages don't require a second login.
//
// Cloudflare Access typically injects identity headers such as:
//   - cf-access-authenticated-user-email
//   - cf-access-authenticated-user-id
//
// If those headers are missing (e.g., local dev), this endpoint returns 401.

function sanitizeUsernameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  if (cleaned.length >= 3) return cleaned;
  return `player_${Math.random().toString(36).slice(2, 8)}`;
}

// Cloudflare Access bridge removed — use /api/auth/google or /api/auth/login instead.
app.get('/api/auth/access-session', (req, res) => {
  return res.status(410).json({ success: false, error: 'Cloudflare Access bridge removed. Use /api/auth/login or /api/auth/google.' });
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: verify a Google ID token via Google's tokeninfo endpoint
// ═══════════════════════════════════════════════════════════════════════════
function verifyGoogleIdToken(credential) {
  return new Promise((resolve, reject) => {
    const path = `/oauth2/v3/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    https.get({ hostname: 'oauth2.googleapis.com', path, headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode === 200, status: res.statusCode, payload: JSON.parse(data) }); }
        catch { reject(new Error('Invalid JSON from Google tokeninfo')); }
      });
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/google
// ═══════════════════════════════════════════════════════════════════════════
// Accepts a Google ID token (from Sign In With Google / One Tap), verifies it,
// and returns a KensGames JWT — creating the account automatically on first login.
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ success: false, error: 'No Google credential provided' });
    }

    // Verify with Google
    const result = await verifyGoogleIdToken(credential);
    if (!result.ok) {
      return res.status(401).json({ success: false, error: 'Invalid Google token' });
    }

    const info = result.payload;

    // Validate audience
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && info.aud !== expectedAud) {
      return res.status(401).json({ success: false, error: 'Token audience mismatch' });
    }

    const email = (info.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'No email in Google token' });
    }

    // Find or create KensGames account
    let userData = readUserFromManifoldByEmail(email);
    let username;

    if (userData && userData.username) {
      username = userData.username;
    } else {
      username = sanitizeUsernameFromEmail(email);
      const existingByName = readUserFromManifold(username);
      if (existingByName && existingByName.email && existingByName.email !== email) {
        username = `${username.slice(0, 18)}_${Math.random().toString(36).slice(2, 6)}`;
      }
      const isSuperuser = SUPERUSER_EMAILS.includes(email);
      const persisted = AuthDB.createUser({
        username,
        email,
        passwordHash: null,
        displayName: info.name || info.given_name || username,
        avatar: '🎮',
        authMethod: 4,
        status: 'active',
        emailVerified: true,
        isAdmin: isSuperuser,
        isSuperuser,
      });
      userData = writeUserToManifold(username, {
        ...persisted,
        googleSub: info.sub,
        stats: { gamesPlayed: 0, totalScore: 0 },
      });
    }

    // Mint a KensGames JWT
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const token = authHandler.generateToken(userData.userId, sessionId);
    const session = { id: sessionId, token, createdAt: Date.now(), lastActivityAt: Date.now(), method: 'google' };
    const sessions = userData.sessions || [];
    sessions.push(session);
    writeUserToManifold(username, { sessions, lastLoginAt: Date.now() });

    // Upsert SQLite player record
    let profileSetup = false, playername = null, avatarId = null;
    try {
      const emailEnc = PiiCrypto.encrypt(email || '');
      const dbPlayer = PlayerDB.ensurePlayer(userData.userId, email, emailEnc);
      profileSetup = dbPlayer ? dbPlayer.profile_setup === 1 : false;
      playername = dbPlayer ? dbPlayer.player_name : null;
      avatarId = dbPlayer ? dbPlayer.avatar_id : null;
    } catch (dbErr) {
      console.error('DB ensurePlayer error:', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      token,
      userId: userData.userId,
      username,
      displayName: userData.displayName || username,
      avatar: userData.avatar,
      email,
      profileSetup,
      playername,
      avatarId,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/auth/check-username?username=...
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/auth/check-username', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ available: false, error: 'Missing username' });
  const check = authHandler.validateUsername(username);
  if (!check.valid) return res.json({ available: false, error: check.error });
  const taken = !!AuthDB.getByUsername(username);
  res.json({ available: !taken });
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/register
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword, avatar, turnstileToken, tosAgreed } = req.body;
    const avatarId = typeof avatar === 'string' ? avatar.trim() : '';

    // Verify Turnstile challenge
    const tsOk = await verifyTurnstile(turnstileToken, req.ip);
    if (!tsOk) {
      return res.status(400).json({ success: false, error: 'Security check failed. Please try again.' });
    }

    // TOS must be accepted
    if (!tosAgreed) {
      return res.status(400).json({ success: false, error: 'You must agree to the Terms of Service to register.' });
    }

    if (!avatarId) {
      return res.status(400).json({ success: false, error: 'Avatar selection required' });
    }

    // Validate username
    const usernameCheck = authHandler.validateUsername(username);
    if (!usernameCheck.valid) {
      return res.status(400).json({ success: false, error: usernameCheck.error });
    }

    // Check if username exists
    if (readUserFromManifold(username)) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }

    // Industry-standard registration requires verified email identity.
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Check if email exists
    if (readUserFromManifoldByEmail(email)) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    if (typeof confirmPassword === 'string' && password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
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

    const isSuperuser = SUPERUSER_EMAILS.includes(email ? email.toLowerCase() : '');
    const persisted = AuthDB.createUser({
      username,
      email: email ? email.toLowerCase() : null,
      passwordHash,
      displayName: username,
      avatar: avatarId,
      authMethod: 1,
      status: 'active',
      emailVerified: true,
      verificationCodeHash,
      verificationCodeExpiry: Date.now() + (24 * 60 * 60 * 1000),
      isAdmin: isSuperuser,
      isSuperuser,
      sessions: [],
    });

    const userData = {
      ...persisted,
      email: email ? email.toLowerCase() : null,
      passwordHash: passwordHash,
      displayName: username,
      avatar: avatarId,
      status: 'active',
      emailVerified: true,
      verificationCodeHash: verificationCodeHash,
      verificationCodeExpiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      isAdmin: isSuperuser,
      isSuperuser: isSuperuser,
      adminLevel: isSuperuser ? 3 : 0,
      stats: { gamesPlayed: 0, totalScore: 0 },
      preferences: { theme: 'light' },
      createdAt: Date.now()
    };

    writeUserToManifold(username, userData);

    // Record player + TOS agreement in SQLite
    try {
      const emailEnc = PiiCrypto.encrypt(email ? email.toLowerCase() : '');
      const dbPlayer = PlayerDB.ensurePlayer(userData.userId, email ? email.toLowerCase() : null, emailEnc);
      if (dbPlayer) {
        PlayerDB.agreeTOS(userData.userId, '1.0');
        PlayerDB.setupProfile(userData.userId, username, avatarId);
      }
    } catch (dbErr) {
      console.error('DB register error:', dbErr.message);
    }

    // Keep in-memory auth/profile state aligned with SQLite to avoid duplicate setup prompts.
    writeUserToManifold(username, {
      avatar: avatarId,
      avatarId,
      playername: username,
      profileSetup: true,
      tosAgreed: true,
    });

    // Send verification email (non-blocking — don't await)
    if (email) {
      emailService.sendVerificationEmail(email, username, verificationCode)
        .catch(emailError => console.error('Verification email failed:', emailError));
    }

    return res.status(201).json({
      success: true,
      message: 'Account created! You can now sign in.',
      userId: userData.userId,
      username: username,
      email: email,
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
    const { username, password, turnstileToken } = req.body;

    // Verify Turnstile challenge
    const tsOk = await verifyTurnstile(turnstileToken, req.ip);
    if (!tsOk) {
      return res.status(400).json({ success: false, error: 'Security check failed. Please try again.' });
    }

    // Validate input
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username required' });
    }

    // Find user
    const userData = readUserFromManifold(username);
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

    // Create session
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const token = authHandler.generateToken(userData.userId, sessionId);

    // Create session object
    const session = {
      id: sessionId,
      token: token,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    // Add session to user
    const sessions = userData.sessions || [];
    sessions.push(session);

    // Write back to manifold
    writeUserToManifold(username, {
      sessions: sessions,
      lastLoginAt: Date.now()
    });

    // Check profile setup via SQLite
    let profileSetup = false;
    try {
      const emailEnc = PiiCrypto.encrypt(userData.email || '');
      const dbPlayer = PlayerDB.ensurePlayer(userData.userId, userData.email, emailEnc);
      profileSetup = dbPlayer ? dbPlayer.profile_setup === 1 : false;
      if (!profileSetup) {
        const inferredAvatarId = (typeof userData.avatar === 'string' && /^[A-Za-z0-9_]{2,40}$/.test(userData.avatar))
          ? userData.avatar
          : null;
        if (inferredAvatarId) {
          PlayerDB.setupProfile(userData.userId, username, inferredAvatarId);
          profileSetup = true;
          writeUserToManifold(username, {
            avatarId: inferredAvatarId,
            playername: username,
            profileSetup: true,
            tosAgreed: true,
          });
        }
      }
      // Sync profileSetup into in-memory store so validate is consistent mid-session
      if (profileSetup) writeUserToManifold(username, { profileSetup: true });
    } catch (dbErr) {
      console.error('DB ensurePlayer error:', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      userId: userData.userId,
      username: username,
      displayName: userData.displayName,
      avatar: userData.avatar,
      profileSetup,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/auth/validate
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

    // Look up user to return profile state — SQLite is source of truth; fall back to in-memory
    let profileSetup = false, playername = null, avatarId = null;
    try {
      const dbPlayer = PlayerDB.getByKgUserId(decoded.userId);
      if (dbPlayer) {
        profileSetup = dbPlayer.profile_setup === 1;
        playername = dbPlayer.player_name || null;
        avatarId = dbPlayer.avatar_id || null;
      }
    } catch { }
    // Fill any gaps from in-memory store (e.g. display name for new registrations)
    if (!profileSetup || !playername) {
      for (const key in manifoldData) {
        if (manifoldData[key].userId === decoded.userId) {
          if (!profileSetup) profileSetup = manifoldData[key].profileSetup || false;
          if (!playername) playername = manifoldData[key].playername || null;
          if (!avatarId) avatarId = manifoldData[key].avatarId || null;
          break;
        }
      }
    }

    return res.status(200).json({
      valid: true,
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      expiresAt: decoded.exp * 1000,
      profileSetup,
      playername,
      avatarId,
    });
  } catch (error) {
    console.error('Validate error:', error);
    return res.status(500).json({ valid: false, error: 'Validation failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/send-reset-code  — send 6-digit OTP to email
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/send-reset-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }

    // Always respond success to prevent email enumeration
    const userData = readUserFromManifoldByEmail(email);
    if (!userData) {
      return res.status(200).json({ success: true, message: 'If that email is registered, a code has been sent.' });
    }

    const code = recoveryManager.generateOTPCode(email);
    try {
      await emailService.sendOTPEmail(email, userData.username, code);
      console.log(`✓ Reset OTP sent to ${email}`);
    } catch (emailErr) {
      console.error('OTP email failed:', emailErr);
      return res.status(500).json({ success: false, error: 'Failed to send code. Please try again.' });
    }

    return res.status(200).json({ success: true, message: 'Code sent. Check your inbox (and spam folder).' });
  } catch (err) {
    console.error('send-reset-code error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/reset-with-code  — verify OTP + set new password
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/reset-with-code', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ success: false, error: 'Email, code, and new password are required' });
    }

    // Validate OTP
    const otpResult = recoveryManager.validateOTPCode(email, code);
    if (!otpResult.valid) {
      return res.status(401).json({ success: false, error: otpResult.error });
    }

    // Validate password strength
    const pwCheck = authHandler.validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, error: pwCheck.error });
    }

    // Find user
    const userData = readUserFromManifoldByEmail(email);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Hash and save
    const passwordHash = await authHandler.hashPassword(password);
    writeUserToManifold(userData.username, {
      passwordHash,
      lastPasswordChangeAt: Date.now(),
      sessions: []
    });

    // Consume the OTP
    recoveryManager.consumeOTPCode(email);
    console.log(`✓ Password reset via OTP for ${userData.username}`);

    return res.status(200).json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    console.error('reset-with-code error:', err);
    return res.status(500).json({ success: false, error: 'Password reset failed' });
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

    // Find user by email
    const userData = readUserFromManifoldByEmail(email);

    // For security, always return success even if email not found
    // This prevents email enumeration attacks
    if (!userData) {
      console.warn(`Password recovery requested for unknown email: ${email}`);
      return res.status(200).json({
        success: true,
        message: 'If this email exists in our system, a recovery link has been sent.'
      });
    }

    // Generate recovery token
    const token = recoveryManager.generateRecoveryToken(email, userData.username);

    // Send recovery email
    try {
      await emailService.sendPasswordRecoveryEmail(email, token, userData.username);
      console.log(`✓ Recovery email sent to ${email}`);
    } catch (emailError) {
      console.error('Recovery email failed:', emailError);
      // Don't fail the request, just log it
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

    // Validate recovery token
    const tokenValidation = recoveryManager.validateRecoveryToken(email, token);
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

    // Update user on manifold
    writeUserToManifold(username, {
      passwordHash: passwordHash,
      lastPasswordChangeAt: Date.now(),
      sessions: [] // Invalidate all existing sessions
    });

    // Consume (mark as used) the recovery token
    recoveryManager.consumeRecoveryToken(email, token);

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

    // Find user
    const userData = readUserFromManifold(username);
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

    // Verify code (use crypto.timingSafeEqual to prevent timing attacks)
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

    // Mark email as verified
    writeUserToManifold(username, {
      emailVerified: true,
      status: 'active',
      verificationCodeHash: null,
      verificationCodeExpiry: null,
      verifiedAt: Date.now()
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
  res.json({ status: 'OK', timestamp: Date.now() });
});

// ─── Directive 2.6 — Privacy analytics ingest ────────────────────────────────
// Accepts beacon payloads: { duration_ms, events: [{t,d,ts}] }
// No IP logged, no user identity, no PII stored.
app.post('/api/analytics', (req, res) => {
  // Silently accept — aggregate persistence added in a future sprint
  res.sendStatus(204);
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/resend-verification
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ success: false, error: 'Username and email required' });
    }

    // Find user
    const userData = readUserFromManifold(username);
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

    // Update user with new code
    writeUserToManifold(username, {
      verificationCodeHash: verificationCodeHash,
      verificationCodeExpiry: Date.now() + (24 * 60 * 60 * 1000)
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

// ── Middleware: superuser only (checks admins table in SQLite) ────────────
function requireSuperuser(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid token' });
  const player = PlayerDB.getByKgUserId(decoded.userId);
  if (!player) return res.status(401).json({ success: false, error: 'Player not found' });
  if (!AdminDB.isSuperuser(player.id)) {
    return res.status(403).json({ success: false, error: 'Superuser access required' });
  }
  req.actorId = player.id;
  req.actorName = player.player_name;
  req.isSuperuser = true;
  next();
}

// ── Middleware: admin OR superuser ────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  const decoded = authHandler.verifyToken(token);
  if (decoded.error) return res.status(401).json({ success: false, error: 'Invalid token' });
  const player = PlayerDB.getByKgUserId(decoded.userId);
  if (!player) return res.status(401).json({ success: false, error: 'Player not found' });
  const rec = AdminDB.getAdminRecord(player.id);
  if (!rec) return res.status(403).json({ success: false, error: 'Admin access required' });
  req.actorId = player.id;
  req.actorName = player.player_name;
  req.isSuperuser = !!rec.is_superuser;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/init-superuser
// One-time bootstrap — only works when NO superuser exists yet.
// Requires ADMIN_INIT_SECRET env var.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/init-superuser', (req, res) => {
  try {
    const existing = AdminDB.getSuperuser();
    if (existing) {
      return res.status(403).json({ success: false, error: 'Superuser already designated' });
    }
    const { username, secret } = req.body;
    const initSecret = process.env.ADMIN_INIT_SECRET;
    if (!initSecret || !secret || secret !== initSecret) {
      return res.status(403).json({ success: false, error: 'Invalid secret' });
    }
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Username required' });
    }
    const player = PlayerDB.getByPlayerName(username.trim());
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    AdminDB.promoteAdmin(player.id, null, true, 'Initial superuser designation');
    console.log(`[init-superuser] ${player.player_name} designated as superuser`);
    return res.json({ success: true, message: `${player.player_name} is now superuser` });
  } catch (err) {
    console.error('Init superuser error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/me — returns caller's admin role info
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/me', requireAdmin, (req, res) => {
  const rec = AdminDB.getAdminRecord(req.actorId);
  return res.json({
    success: true,
    isSuperuser: !!rec.is_superuser,
    isAdmin: true,
    grantedAt: rec.granted_at
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/players — player list (admin or superuser)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/players', requireAdmin, (req, res) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 80);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const players = PlayerDB.adminList(q, limit, offset);
    const stats = PlayerDB.adminStats();
    return res.json({ success: true, players, stats, query: q, limit, offset });
  } catch (err) {
    console.error('Admin players error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list players' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/admins — list admin roster (superuser only)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/admins', requireSuperuser, (req, res) => {
  try {
    const admins = AdminDB.listAdmins();
    return res.json({ success: true, admins });
  } catch (err) {
    console.error('Admin list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list admins' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/suspensions — suspended players (admin or superuser)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/suspensions', requireAdmin, (req, res) => {
  try {
    const players = AdminDB.listSuspended();
    return res.json({ success: true, players });
  } catch (err) {
    console.error('Suspensions list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list suspensions' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/admin/banned — banned players (superuser only)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/banned', requireSuperuser, (req, res) => {
  try {
    const players = AdminDB.listBanned();
    return res.json({ success: true, players });
  } catch (err) {
    console.error('Banned list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to list banned' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/players/:name/suspend — admin OR superuser
// Cannot suspend a superuser.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/suspend', requireAdmin, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (AdminDB.isSuperuser(player.id)) {
      return res.status(403).json({ success: false, error: 'Cannot suspend the superuser' });
    }
    // Non-superuser admins cannot suspend other admins
    if (!req.isSuperuser && AdminDB.isAdmin(player.id)) {
      return res.status(403).json({ success: false, error: 'Only the superuser can suspend admins' });
    }
    if (player.status === 'suspended') {
      return res.status(400).json({ success: false, error: 'Already suspended' });
    }
    const reason = (req.body && typeof req.body.reason === 'string')
      ? req.body.reason.trim().slice(0, 200) : 'Admin action';
    PlayerDB.setStatus(player.kg_user_id, 'suspended', reason, null);
    PlayerDB.recordAdminAction(req.actorId, player.id, 'suspend', reason, null);
    AdminDB.updateLastAction(req.actorId);
    console.log(`[admin] ${req.actorName} suspended ${name}`);
    return res.json({ success: true, player_name: name, status: 'suspended' });
  } catch (err) {
    console.error('Suspend error:', err);
    return res.status(500).json({ success: false, error: 'Failed to suspend' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/players/:name/unsuspend — admin OR superuser
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/unsuspend', requireAdmin, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (player.status !== 'suspended') {
      return res.status(400).json({ success: false, error: 'Player is not suspended' });
    }
    PlayerDB.setStatus(player.kg_user_id, 'active', null, null);
    PlayerDB.recordAdminAction(req.actorId, player.id, 'unsuspend', null, null);
    AdminDB.updateLastAction(req.actorId);
    console.log(`[admin] ${req.actorName} unsuspended ${name}`);
    return res.json({ success: true, player_name: name, status: 'active' });
  } catch (err) {
    console.error('Unsuspend error:', err);
    return res.status(500).json({ success: false, error: 'Failed to unsuspend' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/players/:name/ban — SUPERUSER ONLY
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/ban', requireSuperuser, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (AdminDB.isSuperuser(player.id)) {
      return res.status(403).json({ success: false, error: 'The superuser cannot be banned' });
    }
    const reason = (req.body && typeof req.body.reason === 'string')
      ? req.body.reason.trim().slice(0, 500) : 'Banned by superuser';
    PlayerDB.setStatus(player.kg_user_id, 'banned', reason, null);
    PlayerDB.recordAdminAction(req.actorId, player.id, 'ban', reason, null);
    AdminDB.updateLastAction(req.actorId);
    console.log(`[superuser] ${req.actorName} banned ${name}`);
    return res.json({ success: true, player_name: name, status: 'banned' });
  } catch (err) {
    console.error('Ban error:', err);
    return res.status(500).json({ success: false, error: 'Failed to ban' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/players/:name/unban — SUPERUSER ONLY
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/unban', requireSuperuser, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (player.status !== 'banned') {
      return res.status(400).json({ success: false, error: 'Player is not banned' });
    }
    PlayerDB.setStatus(player.kg_user_id, 'active', null, null);
    PlayerDB.recordAdminAction(req.actorId, player.id, 'unban', null, null);
    AdminDB.updateLastAction(req.actorId);
    console.log(`[superuser] ${req.actorName} unbanned ${name}`);
    return res.json({ success: true, player_name: name, status: 'active' });
  } catch (err) {
    console.error('Unban error:', err);
    return res.status(500).json({ success: false, error: 'Failed to unban' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/players/:name/make-admin — SUPERUSER ONLY
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/make-admin', requireSuperuser, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (AdminDB.isAdmin(player.id)) {
      return res.status(400).json({ success: false, error: 'Already an admin' });
    }
    const notes = (req.body && typeof req.body.notes === 'string')
      ? req.body.notes.trim().slice(0, 300) : null;
    AdminDB.promoteAdmin(player.id, req.actorId, false, notes);
    PlayerDB.recordAdminAction(req.actorId, player.id, 'make-admin', notes, null);
    console.log(`[superuser] ${req.actorName} promoted ${name} to admin`);
    return res.json({ success: true, player_name: name, is_admin: true });
  } catch (err) {
    console.error('Make-admin error:', err);
    return res.status(500).json({ success: false, error: 'Failed to promote admin' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/players/:name/revoke-admin — SUPERUSER ONLY
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/revoke-admin', requireSuperuser, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (player.id === req.actorId) {
      return res.status(403).json({ success: false, error: 'Cannot revoke your own superuser role' });
    }
    AdminDB.revokeAdmin(player.id, req.actorId);
    PlayerDB.recordAdminAction(req.actorId, player.id, 'revoke-admin', null, null);
    console.log(`[superuser] ${req.actorName} revoked admin from ${name}`);
    return res.json({ success: true, player_name: name, is_admin: false });
  } catch (err) {
    console.error('Revoke-admin error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to revoke admin' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/transfer-superuser — SUPERUSER ONLY
// Transfers the superuser role to another player (superuser becomes regular admin)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/transfer-superuser', requireSuperuser, (req, res) => {
  try {
    const { toUsername, confirm } = req.body;
    if (!toUsername || confirm !== 'TRANSFER') {
      return res.status(400).json({ success: false, error: 'Provide toUsername and confirm="TRANSFER"' });
    }
    const target = PlayerDB.getByPlayerName(toUsername.trim());
    if (!target) return res.status(404).json({ success: false, error: 'Target player not found' });
    if (target.id === req.actorId) {
      return res.status(400).json({ success: false, error: 'Already superuser' });
    }
    AdminDB.transferSuperuser(req.actorId, target.id);
    PlayerDB.recordAdminAction(req.actorId, target.id, 'transfer-superuser', null, null);
    console.log(`[superuser] ${req.actorName} transferred superuser to ${target.player_name}`);
    return res.json({ success: true, newSuperuser: target.player_name });
  } catch (err) {
    console.error('Transfer-superuser error:', err);
    return res.status(500).json({ success: false, error: 'Failed to transfer superuser' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY: toggle-suspend (kept for backward compat — now uses requireAdmin)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/players/:name/toggle-suspend', requireAdmin, (req, res) => {
  try {
    const name = (req.params.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: 'Invalid player name' });
    const player = PlayerDB.getByPlayerName(name);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    if (AdminDB.isSuperuser(player.id)) {
      return res.status(403).json({ success: false, error: 'Cannot modify the superuser account' });
    }
    if (!req.isSuperuser && AdminDB.isAdmin(player.id)) {
      return res.status(403).json({ success: false, error: 'Only the superuser can suspend admins' });
    }
    const newStatus = player.status === 'suspended' ? 'active' : 'suspended';
    const reason = (req.body && req.body.reason) || 'Admin action';
    PlayerDB.setStatus(player.kg_user_id, newStatus, newStatus === 'suspended' ? reason : null, null);
    PlayerDB.recordAdminAction(req.actorId, player.id, newStatus === 'suspended' ? 'suspend' : 'unsuspend', reason, null);
    AdminDB.updateLastAction(req.actorId);
    console.log(`[admin] ${req.actorName} toggled ${name} → ${newStatus}`);
    return res.json({ success: true, player_name: name, status: newStatus });
  } catch (err) {
    console.error('Toggle suspend error:', err);
    return res.status(500).json({ success: false, error: 'Failed to toggle suspend' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ELEVATION (NEW AUTH FLOW)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/elevate-to-superuser
 * Elevates a registered user to superuser status.
 * Only callable by existing superuser (once system is bootstrapped).
 * Requires: username, targetUsername in body
 */
app.post('/api/admin/elevate-to-superuser', (req, res) => {
  try {
    const { username, password, targetUsername } = req.body;
    if (!username || !password || !targetUsername) {
      return res.status(400).json({ success: false, error: 'username, password, and targetUsername required' });
    }

    // Validate elevator credentials
    const elevatorAuth = AuthDB.getByUsername(username);
    if (!elevatorAuth) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const passwordMatch = AuthHandler.validatePassword(password, elevatorAuth.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // Check if elevator is already superuser
    if (!AuthDB.isSuperuser(elevatorAuth.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can elevate users' });
    }

    // Get target user
    const targetAuth = AuthDB.getByUsername(targetUsername);
    if (!targetAuth) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    // Elevate target to superuser
    AuthDB.elevateToSuperuser(targetAuth.userId, elevatorAuth.userId);
    console.log(`[admin] ${username} elevated ${targetUsername} to superuser`);

    return res.json({
      success: true,
      message: `${targetUsername} is now superuser`,
      user: {
        username: targetAuth.username,
        display_name: targetAuth.display_name,
        is_superuser: true
      }
    });
  } catch (err) {
    console.error('Elevate superuser error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/create-admin
 * Creates a new admin (requires superuser).
 * Superuser only.
 */
app.post('/api/admin/create-admin', (req, res) => {
  try {
    const { superuserPassword, targetUsername, reason } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const decoded = AuthHandler.verify(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Verify superuser status
    if (!AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can create admins' });
    }

    // Get target user
    const targetAuth = AuthDB.getByUsername(targetUsername);
    if (!targetAuth) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Create admin
    AuthDB.createAdmin(targetAuth.userId, decoded.userId, reason || '');
    console.log(`[admin] Superuser created admin: ${targetUsername}`);

    return res.json({
      success: true,
      message: `${targetUsername} is now admin`,
      user: {
        username: targetAuth.username,
        display_name: targetAuth.display_name,
        is_admin: true
      }
    });
  } catch (err) {
    console.error('Create admin error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/revoke-admin
 * Revokes admin status (superuser only).
 * Cannot revoke superuser via this endpoint.
 */
app.post('/api/admin/revoke-admin', (req, res) => {
  try {
    const { targetUsername, reason } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token || !targetUsername) {
      return res.status(401).json({ success: false, error: 'Authorization and targetUsername required' });
    }

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can revoke admins' });
    }

    const targetAuth = AuthDB.getByUsername(targetUsername);
    if (!targetAuth) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    AuthDB.revokeAdmin(targetAuth.userId, decoded.userId, reason || '');
    console.log(`[admin] Superuser revoked admin: ${targetUsername}`);

    return res.json({
      success: true,
      message: `${targetUsername} is no longer admin`
    });
  } catch (err) {
    console.error('Revoke admin error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BETA CODE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/generate-beta-codes
 * Generates beta promotional codes.
 * Superuser only.
 */
app.post('/api/admin/generate-beta-codes', (req, res) => {
  try {
    const { count, expiresInDays } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can generate beta codes' });
    }

    const codeCount = Math.min(parseInt(count) || 1, 100);
    const codes = AuthDB.generateBetaCodes(codeCount, decoded.userId, expiresInDays || null);

    console.log(`[admin] Generated ${codeCount} beta codes`);

    return res.json({
      success: true,
      message: `Generated ${codeCount} beta codes`,
      codes
    });
  } catch (err) {
    console.error('Generate beta codes error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/beta-codes-status
 * Lists status of all generated beta codes.
 * Superuser only.
 */
app.get('/api/admin/beta-codes-status', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can view beta code status' });
    }

    const codes = AuthDB.getBetaCodesStatus(decoded.userId);

    return res.json({
      success: true,
      total: codes.length,
      claimed: codes.filter(c => c.status === 'claimed').length,
      active: codes.filter(c => c.status === 'active').length,
      codes
    });
  } catch (err) {
    console.error('Get beta codes error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/betatester/claim-code
 * Claims a beta code and grants beta tester status.
 * Anyone can claim if they have a valid code.
 */
app.post('/api/betatester/claim-code', (req, res) => {
  try {
    const { code } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!code) {
      return res.status(400).json({ success: false, error: 'Code required' });
    }

    const decoded = AuthHandler.verify(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    AuthDB.claimBetaCode(code, decoded.userId);
    console.log(`[betatester] User ${decoded.username} claimed beta code`);

    return res.json({
      success: true,
      message: 'Beta code claimed! You now have free play for life.',
      status: 'beta_tester'
    });
  } catch (err) {
    console.error('Claim beta code error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG REPORTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/betatester/report-bug
 * Submits a bug report.
 */
app.post('/api/betatester/report-bug', (req, res) => {
  try {
    const { gameId, title, description, priority, stepsToRepro } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'Title and description required' });
    }

    const decoded = AuthHandler.verify(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const report = AuthDB.submitBugReport(decoded.userId, gameId || null, title, description, priority, stepsToRepro || null);
    console.log(`[bug] Bug report #${report.id} submitted by ${decoded.username}`);

    return res.json({
      success: true,
      message: 'Bug report submitted! Thank you for helping us improve.',
      report_id: report.id
    });
  } catch (err) {
    console.error('Submit bug report error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/bug-reports
 * Lists bug reports (superuser only).
 * Query params: filter=open|critical|all, limit=50
 */
app.get('/api/admin/bug-reports', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const filter = req.query.filter || 'all';

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can view bug reports' });
    }

    const reports = AuthDB.getBugReports(filter, decoded.userId);

    return res.json({
      success: true,
      total: reports.length,
      open_count: reports.filter(r => r.status === 'open').length,
      critical_count: reports.filter(r => ['critical', 'show_stopper'].includes(r.priority)).length,
      reports
    });
  } catch (err) {
    console.error('Get bug reports error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/bug-reports/:reportId/update-status
 * Updates bug report status.
 * Superuser only.
 */
app.post('/api/admin/bug-reports/:reportId/update-status', (req, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    const { status, resolutionNote } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can update bug reports' });
    }

    const validStatuses = ['open', 'investigating', 'in_progress', 'resolved', 'wontfix', 'duplicate'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const updated = AuthDB.updateBugReportStatus(reportId, status, decoded.userId, resolutionNote);
    console.log(`[bug] Report #${reportId} updated to ${status}`);

    return res.json({
      success: true,
      message: `Bug report updated`,
      report: updated
    });
  } catch (err) {
    console.error('Update bug report error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER REVIEWS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/betatester/submit-review
 * Submits a 5-star review.
 */
app.post('/api/betatester/submit-review', (req, res) => {
  try {
    const { rating, comment } = req.body;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
    }

    const decoded = AuthHandler.verify(token);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const review = AuthDB.submitReview(decoded.userId, rating, comment || null);
    console.log(`[review] ${decoded.username} submitted ${rating}-star review`);

    return res.json({
      success: true,
      message: 'Review submitted! Thank you for your feedback.',
      review_id: review.id
    });
  } catch (err) {
    console.error('Submit review error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/reviews
 * Lists all user reviews (superuser only).
 */
app.get('/api/admin/reviews', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Only superuser can view reviews' });
    }

    const reviews = AuthDB.getReviews(decoded.userId);
    const stats = AuthDB.getReviewStats(decoded.userId);

    return res.json({
      success: true,
      stats,
      reviews
    });
  } catch (err) {
    console.error('Get reviews error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/dashboard
 * Admin dashboard with stats (superuser only).
 */
app.get('/api/admin/dashboard', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    const decoded = AuthHandler.verify(token);
    if (!decoded || !AuthDB.isSuperuser(decoded.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Gather dashboard stats
    const bugReports = AuthDB.getBugReports('all', decoded.userId);
    const reviews = AuthDB.getReviews(decoded.userId);
    const reviewStats = AuthDB.getReviewStats(decoded.userId);
    const betaCodes = AuthDB.getBetaCodesStatus(decoded.userId);

    return res.json({
      success: true,
      dashboard: {
        open_bugs: bugReports.filter(b => b.status === 'open').length,
        critical_bugs: bugReports.filter(b => ['critical', 'show_stopper'].includes(b.priority)).length,
        total_bug_reports: bugReports.length,
        total_reviews: reviews.length,
        average_rating: reviewStats.average_rating || 0,
        beta_codes_generated: betaCodes.length,
        beta_codes_claimed: betaCodes.filter(c => c.status === 'claimed').length
      }
    });
  } catch (err) {
    console.error('Get dashboard error:', err);
    return res.status(500).json({ success: false, error: err.message });
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
// FEATURE ROUTES
// ═══════════════════════════════════════════════════════════════════════════
const playersRouter = require('./routes/players');
const friendsRouter = require('./routes/friends');
const guildsRouter = require('./routes/guilds');
const chatRouter = require('./routes/chat');
const leaderboardRouter = require('./routes/leaderboards');
const tournamentsRouter = require('./routes/tournaments');
const gameSessionsRouter = require('./routes/game-sessions');
const assetsManifestRouter = require('./routes/assets-manifest');

app.use('/api/players', playersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/guilds', guildsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/leaderboards', leaderboardRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/sessions', gameSessionsRouter);
app.use('/api/assets', assetsManifestRouter);

// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Manifold Auth Server running on http://localhost:${PORT}`);
});

module.exports = app;
