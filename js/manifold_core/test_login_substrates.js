/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEST: Login & Session Substrates
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for LoginSubstrate and SessionSubstrate on manifold coordinates
 * Ensures unified authentication across all games (BrickBreaker3D, Space Combat, FastTrack)
 */

// Mock manifold for testing
class MockManifold {
  constructor() {
    this.data = {};
  }

  read(coordinate) {
    const key = JSON.stringify(coordinate);
    return this.data[key] || null;
  }

  write(coordinate, data) {
    const key = JSON.stringify(coordinate);
    this.data[key] = data;
  }

  clear() {
    this.data = {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE: LoginSubstrate
// ═══════════════════════════════════════════════════════════════════════════

function testLoginSubstrate() {
  console.log('\n🧪 Testing LoginSubstrate...');
  const manifest = new MockManifold();
  const loginSubstrate = new LoginSubstrate(manifest);

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Register new user
  try {
    const result = loginSubstrate.register('testplayer', 'password123');
    if (result.success && result.userId && result.coordinate) {
      console.log('✅ Test 1: Register user - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 1: Register user - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 1: Register user - ERROR', e.message);
    testsFailed++;
  }

  // Test 2: Reject duplicate username
  try {
    const result = loginSubstrate.register('testplayer', 'different');
    if (!result.success && result.error.includes('taken')) {
      console.log('✅ Test 2: Reject duplicate - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 2: Reject duplicate - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 2: Reject duplicate - ERROR', e.message);
    testsFailed++;
  }

  // Test 3: Register user without password
  try {
    const result = loginSubstrate.register('nopassuser');
    if (result.success && result.userId) {
      console.log('✅ Test 3: Register without password - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 3: Register without password - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 3: Register without password - ERROR', e.message);
    testsFailed++;
  }

  // Test 4: Login with correct password
  try {
    const result = loginSubstrate.login('testplayer', 'password123');
    if (result.success && result.userId) {
      console.log('✅ Test 4: Login with correct password - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 4: Login with correct password - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 4: Login with correct password - ERROR', e.message);
    testsFailed++;
  }

  // Test 5: Reject login with wrong password
  try {
    const result = loginSubstrate.login('testplayer', 'wrongpassword');
    if (!result.success) {
      console.log('✅ Test 5: Reject wrong password - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 5: Reject wrong password - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 5: Reject wrong password - ERROR', e.message);
    testsFailed++;
  }

  // Test 6: Login user without password
  try {
    const result = loginSubstrate.login('nopassuser');
    if (result.success && result.userId) {
      console.log('✅ Test 6: Login without password - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 6: Login without password - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 6: Login without password - ERROR', e.message);
    testsFailed++;
  }

  // Test 7: Validate credentials
  try {
    const result = loginSubstrate.validateCredentials('testplayer', 'password123');
    if (result.valid === true) {
      console.log('✅ Test 7: Validate credentials - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 7: Validate credentials - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 7: Validate credentials - ERROR', e.message);
    testsFailed++;
  }

  // Test 8: Username validation (invalid chars)
  try {
    const result = loginSubstrate.register('user@domain.com', 'pass');
    if (!result.success && result.error.includes('invalid')) {
      console.log('✅ Test 8: Username validation - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 8: Username validation - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 8: Username validation - ERROR', e.message);
    testsFailed++;
  }

  console.log(`\n📊 LoginSubstrate: ${testsPassed} passed, ${testsFailed} failed\n`);
  return { passed: testsPassed, failed: testsFailed };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE: SessionSubstrate
// ═══════════════════════════════════════════════════════════════════════════

function testSessionSubstrate() {
  console.log('\n🧪 Testing SessionSubstrate...');
  const manifest = new MockManifold();
  const sessionSubstrate = new SessionSubstrate(manifest);

  let testsPassed = 0;
  let testsFailed = 0;

  // Setup: Create a mock user coordinate
  const userCoord = [1001, 1, 1001];
  const userData = {
    id: 'user-1001',
    username: 'sessiontest',
    sessions: []
  };
  manifest.write(userCoord, userData);

  // Test 1: Create session
  try {
    const result = sessionSubstrate.createSession(userCoord, 'user-1001');
    if (result.token && result.sessionId && result.expiresAt) {
      console.log('✅ Test 1: Create session - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 1: Create session - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 1: Create session - ERROR', e.message);
    testsFailed++;
  }

  // Test 2: Validate valid token
  let validToken = null;
  try {
    const session = sessionSubstrate.createSession(userCoord, 'user-1001');
    validToken = session.token;
    const result = sessionSubstrate.validateSession(validToken);
    if (result.valid === true && result.userId === 'user-1001') {
      console.log('✅ Test 2: Validate valid token - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 2: Validate valid token - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 2: Validate valid token - ERROR', e.message);
    testsFailed++;
  }

  // Test 3: Reject invalid token
  try {
    const result = sessionSubstrate.validateSession('invalid-token');
    if (result.valid === false) {
      console.log('✅ Test 3: Reject invalid token - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 3: Reject invalid token - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 3: Reject invalid token - ERROR', e.message);
    testsFailed++;
  }

  // Test 4: Get active sessions
  try {
    sessionSubstrate.createSession(userCoord, 'user-1001');
    sessionSubstrate.createSession(userCoord, 'user-1001');
    const activeSessions = sessionSubstrate.getActiveSessions(userCoord);
    if (Array.isArray(activeSessions) && activeSessions.length >= 2) {
      console.log('✅ Test 4: Get active sessions - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 4: Get active sessions - FAILED', activeSessions);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 4: Get active sessions - ERROR', e.message);
    testsFailed++;
  }

  // Test 5: Revoke specific session
  try {
    const session = sessionSubstrate.createSession(userCoord, 'user-1001');
    const sessionId = session.sessionId;
    const result = sessionSubstrate.revokeSession(userCoord, sessionId);
    if (result.success) {
      const sessions = sessionSubstrate.getActiveSessions(userCoord);
      const revoked = !sessions.some(s => s.id === sessionId);
      if (revoked) {
        console.log('✅ Test 5: Revoke specific session - PASSED');
        testsPassed++;
      } else {
        console.error('❌ Test 5: Revoke specific session - FAILED (not removed)');
        testsFailed++;
      }
    } else {
      console.error('❌ Test 5: Revoke specific session - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 5: Revoke specific session - ERROR', e.message);
    testsFailed++;
  }

  // Test 6: Revoke all sessions (logout everywhere)
  try {
    sessionSubstrate.createSession(userCoord, 'user-1001');
    sessionSubstrate.createSession(userCoord, 'user-1001');
    const result = sessionSubstrate.revokeAllSessions(userCoord);
    if (result.success) {
      const activeSessions = sessionSubstrate.getActiveSessions(userCoord);
      if (activeSessions.length === 0) {
        console.log('✅ Test 6: Revoke all sessions - PASSED');
        testsPassed++;
      } else {
        console.error('❌ Test 6: Revoke all sessions - FAILED (sessions remain)');
        testsFailed++;
      }
    } else {
      console.error('❌ Test 6: Revoke all sessions - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 6: Revoke all sessions - ERROR', e.message);
    testsFailed++;
  }

  // Test 7: Extract session data
  try {
    const result = sessionSubstrate.extract(userCoord);
    if (result && Array.isArray(result.sessions)) {
      console.log('✅ Test 7: Extract session data - PASSED');
      testsPassed++;
    } else {
      console.error('❌ Test 7: Extract session data - FAILED', result);
      testsFailed++;
    }
  } catch (e) {
    console.error('❌ Test 7: Extract session data - ERROR', e.message);
    testsFailed++;
  }

  console.log(`\n📊 SessionSubstrate: ${testsPassed} passed, ${testsFailed} failed\n`);
  return { passed: testsPassed, failed: testsFailed };
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🎮 MANIFOLD LOGIN & SESSION SUBSTRATE TESTS');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  const loginResults = testLoginSubstrate();
  const sessionResults = testSessionSubstrate();

  const totalPassed = loginResults.passed + sessionResults.passed;
  const totalFailed = loginResults.failed + sessionResults.failed;

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`📈 TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! ✨\n');
  } else {
    console.log(`⚠️  ${totalFailed} test(s) failed. Please review and fix.\n`);
  }

  return { passed: totalPassed, failed: totalFailed };
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests, testLoginSubstrate, testSessionSubstrate };
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}
