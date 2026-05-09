#!/usr/bin/env node
'use strict';

/**
 * Static lobby UX audit — no browser, no server required.
 *
 * Verifies every lobby page conforms to the shared contract documented
 * in HARD_RULES (HR-6.2 control rail, HR-7..12 wizard architecture,
 * HR-13..16 guest-friendly landing) and the unified panel substrate.
 *
 * Run:  node scripts/lobby_ux_audit.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const LOBBIES = [
  { id: 'fasttrack', file: 'fasttrack/lobby.html', kind: 'redirect' },
  { id: 'fasttrack', file: 'fasttrack/lobby-simple.html', kind: 'panel' },
  { id: '4dtictactoe', file: '4DTicTacToe/lobby.html', kind: 'panel' },
  { id: 'brickbreaker3d', file: 'brickbreaker3d/lobby.html', kind: 'panel' },
  { id: 'cubic3d', file: 'cubic3d/lobby.html', kind: 'panel' },
  { id: 'starfighter', file: 'starfighter/lobby.html', kind: 'panel' },
];

// Required ingredients for any "panel" style lobby
const PANEL_CHECKS = [
  { id: 'has-viewport-meta', re: /<meta\s+name=["']viewport["']/i, why: 'mobile viewport meta required' },
  { id: 'has-arcade-theme', re: /lib\/arcade-theme\.css/, why: 'shared arcade theme stylesheet' },
  { id: 'has-mp-panel-host', re: /id=["']mp-panel-host["']/, why: 'unified KGMultiplayerPanel mount point' },
  { id: 'has-multiplayer-client', re: /js\/multiplayer-client\.js/, why: 'shared multiplayer client script' },
  { id: 'has-game-setup', re: /js\/substrates\/game_setup\.js/, why: 'shared KGGameSetup substrate' },
  { id: 'has-game-manager', re: /js\/substrates\/game_manager\.js/, why: 'shared KGGameManager substrate' },
  { id: 'has-avatar-picker', re: /js\/substrates\/avatar_picker\.js/, why: 'shared avatar picker' },
  { id: 'has-profile-gate', re: /id=["']kg-player["'][^>]*data-profile-required/, why: 'profile gate (HR-13 guest-friendly landing)' },
  { id: 'has-player-panel', re: /js\/player-panel\.js/, why: 'unified player-panel header (HR-6.2 control rail)' },
  { id: 'has-arc-nav', re: /class=["']arc-nav["']|<nav[^>]*class=["']arc-nav/, why: 'shared portal navigation' },
  { id: 'has-portal-link', re: /href=["']\/["'][^>]*>[^<]*Portal/i, why: 'back-to-portal link required' },
  { id: 'mounts-game-setup', re: /KGGameSetup\.mount\s*\(/, why: 'lobby must wire KGGameSetup.mount()' },
  { id: 'wires-launch', re: /KGGameSetup\.launchTo\s*\(|onLaunch\s*[:(]/, why: 'launch handler required' },
  { id: 'single-viewport', re: /height:\s*100dvh|overflow:\s*hidden\s*[;}\n]/, why: 'HR-6.1 single-viewport / HR-6.2 fixed rail' },
];

const REDIRECT_CHECKS = [
  { id: 'redirects-properly', re: /location\.replace\(|http-equiv=["']refresh["']/i, why: 'redirect lobby must navigate elsewhere' },
];

// Cross-lobby contract: gameId in mount() must match the route
function gameIdInMount(html) {
  const m = html.match(/KGGameSetup\.mount\([^)]+gameId:\s*['"]([^'"]+)['"]/m);
  return m ? m[1].toLowerCase() : null;
}

let warnings = 0;
let errors = 0;
const results = [];

for (const lobby of LOBBIES) {
  const full = path.join(ROOT, lobby.file);
  if (!fs.existsSync(full)) {
    errors++;
    results.push({ lobby, status: 'MISSING', detail: `file not found: ${lobby.file}` });
    continue;
  }
  const html = fs.readFileSync(full, 'utf8');
  const checks = lobby.kind === 'redirect' ? REDIRECT_CHECKS : PANEL_CHECKS;
  const failed = [];
  for (const chk of checks) {
    if (!chk.re.test(html)) failed.push(chk);
  }
  // Cross-check gameId vs declared route id
  let gidMismatch = null;
  if (lobby.kind === 'panel') {
    const gid = gameIdInMount(html);
    if (gid && gid !== lobby.id.toLowerCase()) {
      gidMismatch = { expected: lobby.id, got: gid };
    } else if (!gid) {
      failed.push({ id: 'mount-game-id-readable', why: 'mount() must declare gameId literal' });
    }
  }
  const status = failed.length === 0 && !gidMismatch ? 'PASS' : 'FAIL';
  if (status === 'FAIL') errors++;
  results.push({ lobby, status, failed, gidMismatch });
}

// ── Report ────────────────────────────────────────────────────────────────

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

console.log('\n═══ Lobby UX Static Audit ═══\n');
for (const r of results) {
  const tag = r.status === 'PASS' ? C.green('PASS')
    : r.status === 'MISSING' ? C.red('MISS')
      : C.red('FAIL');
  console.log(`${tag}  ${r.lobby.id.padEnd(16)} ${C.dim(r.lobby.file)} (${r.lobby.kind})`);
  if (r.detail) console.log('      ' + r.detail);
  if (r.failed && r.failed.length) {
    for (const f of r.failed) {
      console.log(`      ${C.yellow('•')} missing [${f.id}] — ${f.why}`);
    }
  }
  if (r.gidMismatch) {
    console.log(`      ${C.red('•')} gameId mismatch — expected '${r.gidMismatch.expected}', got '${r.gidMismatch.got}'`);
  }
}

const total = results.length;
const passed = results.filter((r) => r.status === 'PASS').length;
console.log(`\n${passed}/${total} lobbies pass.`);
if (errors) {
  console.log(C.red(`${errors} lobbies failed audit.`));
  process.exit(1);
}
console.log(C.green('All lobbies conform to the shared UX contract.'));
process.exit(0);
