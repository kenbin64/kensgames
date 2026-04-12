/**
 * Quick test to extract recovery token from manifold for testing
 */

const crypto = require('crypto');

// Simulate finding the recovery token in manifold
function extractTokenForEmail(email) {
  const emailHash = crypto
    .createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex');

  const coordinateKey = `recovery-${emailHash}`;
  console.log(`Looking for token at coordinate key: ${coordinateKey}`);

  // In a real test, we'd access the server's manifold storage
  // For now, we'll need to manually set the token or get it from logs
  return emailHash;
}

const testEmail = 'myemail@example.com';
const emailHash = extractTokenForEmail(testEmail);

console.log(`Email hash: ${emailHash}`);
console.log(`Token would be stored at: recovery-${emailHash}`);
console.log(``);
console.log(`To test reset-password endpoint:`);
console.log(`POST /api/auth/reset-password`);
console.log(`Body: { email, token, password }`);
