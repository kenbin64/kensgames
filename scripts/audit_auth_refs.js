#!/usr/bin/env node
const { execSync } = require('child_process');
const targets = [
  'require_auth', 'access_session_bridge', 'access_status',
  'auth_portal_substrate', 'auth_substrate.js', 'auth_ui.js',
  'assets/js/auth.js', '/login', '/register', '/forgot-password',
  '/reset-password', '/verify-email', '/lobby/', 'user_token', '/api/auth',
];
for (const t of targets) {
  console.log('===', t, '===');
  try {
    const out = execSync('git grep -l ' + JSON.stringify(t), { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (e) { console.log('(no matches)'); }
}
