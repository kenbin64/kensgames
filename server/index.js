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
const { PlayerDB, AdminDB, PiiCrypto } = require('./db'); // initialize DB schema on first require
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
// TODO: Import manifold-core when server runs in Node environment
// For now using mock manifold - will be replaced with real manifold integration

const { manifoldData } = require('./store'); // Shared in-memory store
let nextUserId = 1;

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
  return manifoldData[coordinateKey] || null;
}

/**
 * Read user from manifold by email
 */
function readUserFromManifoldByEmail(email) {
  for (const key in manifoldData) {
    if (key.startsWith('user-') && manifoldData[key].email === email.toLowerCase()) {
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
  manifoldData[coordinateKey] = {
    ...manifoldData[coordinateKey],
    ...userData,
    lastModified: Date.now()
  };
  return manifoldData[coordinateKey];
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
      const userCoord = getOrCreateUserCoordinate(username, 4); // authMethod 4 = Google
      const isSuperuser = SUPERUSER_EMAILS.includes(email);
      userData = writeUserToManifold(username, {
        ...userCoord,
        username,
        email,
        displayName: info.name || info.given_name || username,
        googleSub: info.sub,
        avatar: '🎮',
        emailVerified: true,
        status: 'active',
        isAdmin: isSuperuser,
        isSuperuser: isSuperuser,
        adminLevel: isSuperuser ? 3 : 0,
        stats: { gamesPlayed: 0, totalScore: 0 },
        createdAt: Date.now(),
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
  const taken = PlayerDB.isNameTaken(username);
  res.json({ available: !taken });
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /api/auth/register
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, avatar, turnstileToken, tosAgreed } = req.body;

    // Verify Turnstile challenge
    const tsOk = await verifyTurnstile(turnstileToken, req.ip);
    if (!tsOk) {
      return res.status(400).json({ success: false, error: 'Security check failed. Please try again.' });
    }

    // TOS must be accepted
    if (!tosAgreed) {
      return res.status(400).json({ success: false, error: 'You must agree to the Terms of Service to register.' });
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

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }

      // Check if email exists
      if (readUserFromManifoldByEmail(email)) {
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

    // Create user on manifold
    const authMethod = 1; // username + password
    const userCoord = getOrCreateUserCoordinate(username, authMethod);

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeHash = require('crypto')
      .createHash('sha256')
      .update(verificationCode)
      .digest('hex');

    const userData = {
      ...userCoord,
      email: email ? email.toLowerCase() : null,
      passwordHash: passwordHash,
      displayName: username,
      avatar: avatar || '🎮',
      status: 'active',
      emailVerified: true,
      verificationCodeHash: verificationCodeHash,
      verificationCodeExpiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      isAdmin: SUPERUSER_EMAILS.includes(email ? email.toLowerCase() : ''),
      isSuperuser: SUPERUSER_EMAILS.includes(email ? email.toLowerCase() : ''),
      adminLevel: SUPERUSER_EMAILS.includes(email ? email.toLowerCase() : '') ? 3 : 0,
      stats: { gamesPlayed: 0, totalScore: 0 },
      preferences: { theme: 'light' },
      createdAt: Date.now()
    };

    writeUserToManifold(username, userData);

    // Record player + TOS agreement in SQLite
    try {
      const emailEnc = PiiCrypto.encrypt(email ? email.toLowerCase() : '');
      const dbPlayer = PlayerDB.ensurePlayer(userCoord.userId, email ? email.toLowerCase() : null, emailEnc);
      if (dbPlayer) PlayerDB.agreeTOS(userCoord.userId, '1.0');
    } catch (dbErr) {
      console.error('DB register error:', dbErr.message);
    }

    // Send verification email (non-blocking — don't await)
    if (email) {
      emailService.sendVerificationEmail(email, username, verificationCode)
        .catch(emailError => console.error('Verification email failed:', emailError));
    }

    return res.status(201).json({
      success: true,
      message: 'Account created! You can now sign in.',
      userId: userCoord.userId,
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

    // Look up user to return profile state — gates need this in one request
    let profileSetup = false, playername = null, avatarId = null;
    for (const key in manifoldData) {
      if (manifoldData[key].userId === decoded.userId) {
        profileSetup = manifoldData[key].profileSetup || false;
        playername = manifoldData[key].playername || null;
        avatarId = manifoldData[key].avatarId || null;
        break;
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
const gameSessionsRouter = require('./routes/game_sessions');

app.use('/api/players', playersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/guilds', guildsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/leaderboards', leaderboardRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/sessions', gameSessionsRouter);

// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Manifold Auth Server running on http://localhost:${PORT}`);
});

module.exports = app;
