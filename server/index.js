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

let manifoldData = {}; // Mock manifold storage
let nextUserId = 1;

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
      status: 'pending', // Not active until email verified
      emailVerified: false,
      verificationCodeHash: verificationCodeHash,
      verificationCodeExpiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      isAdmin: false,
      isSuperuser: false,
      adminLevel: 0, // 0=user, 1=mod, 2=admin, 3=superuser
      stats: { gamesPlayed: 0, totalScore: 0 },
      preferences: { theme: 'light' },
      createdAt: Date.now()
    };

    writeUserToManifold(username, userData);

    // Send verification email
    if (email) {
      try {
        await emailService.sendVerificationEmail(email, username, verificationCode);
      } catch (emailError) {
        console.error('Verification email failed:', emailError);
        // Don't fail registration if email fails
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Check your email for verification code.',
      userId: userCoord.userId,
      username: username,
      email: email,
      requiresEmailVerification: true
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

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      userId: userData.userId,
      username: username,
      displayName: userData.displayName,
      avatar: userData.avatar
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

  // Find user and check if superuser
  const userId = decoded.userId;
  let isAdmin = false;

  for (const key in manifoldData) {
    if (manifoldData[key].userId === userId && manifoldData[key].isSuperuser) {
      isAdmin = true;
      break;
    }
  }

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

    const userData = readUserFromManifold(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (userData.isSuperuser) {
      return res.status(400).json({ success: false, error: 'Already a superuser' });
    }

    writeUserToManifold(username, {
      isAdmin: true,
      isSuperuser: true,
      adminLevel: 3,
      promotedAt: Date.now()
    });

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
    const users = [];

    for (const key in manifoldData) {
      if (key.startsWith('user-')) {
        const user = manifoldData[key];
        users.push({
          userId: user.userId,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          avatar: user.avatar,
          status: user.status,
          emailVerified: user.emailVerified,
          isAdmin: user.isAdmin,
          isSuperuser: user.isSuperuser,
          adminLevel: user.adminLevel,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        });
      }
    }

    return res.status(200).json({
      success: true,
      users: users,
      totalUsers: users.length
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
    let totalUsers = 0;
    let activeUsers = 0;
    let bannedUsers = 0;
    let suspendedUsers = 0;
    let admins = 0;
    let superusers = 0;

    for (const key in manifoldData) {
      if (key.startsWith('user-')) {
        const user = manifoldData[key];
        totalUsers++;

        if (user.status === 'active') activeUsers++;
        if (user.status === 'banned') bannedUsers++;
        if (user.status === 'suspended') suspendedUsers++;
        if (user.isAdmin) admins++;
        if (user.isSuperuser) superusers++;
      }
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers: totalUsers,
        activeUsers: activeUsers,
        bannedUsers: bannedUsers,
        suspendedUsers: suspendedUsers,
        admins: admins,
        superusers: superusers,
        timestamp: Date.now()
      }
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

    const userData = readUserFromManifold(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    writeUserToManifold(username, {
      status: 'suspended',
      suspendedAt: Date.now()
    });

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

    const userData = readUserFromManifold(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    writeUserToManifold(username, {
      status: 'banned',
      bannedAt: Date.now()
    });

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

    const userData = readUserFromManifold(username);
    if (!userData) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    writeUserToManifold(username, {
      status: 'active',
      emailVerified: true
    });

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
  console.log(`📝 Endpoints:`);
  console.log(`   POST /api/auth/register`);
  console.log(`   POST /api/auth/login`);
  console.log(`   GET  /api/auth/validate`);
  console.log(`   POST /api/auth/forgot-password`);
  console.log(`   POST /api/auth/reset-password`);
});

module.exports = app;
