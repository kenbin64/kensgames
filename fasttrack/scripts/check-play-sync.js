#!/usr/bin/env node
/**
 * ============================================================
 * FASTTRACK / FASTTRACK-PLAY DRIFT CHECK
 *
 * There are two copies of this game on disk:
 *
 *   C:\projects\kensgames\kensgames\fasttrack   the web build, and where all
 *                                               development happens
 *   C:\projects\fasttrack-play\www\fasttrack    the Google Play / desktop build
 *
 * They forked once already and it cost real work: for a day, fasttrack-play sat
 * a full set of bug fixes behind while looking like a working copy, and the Card
 * 7 rule differed between them because a build flag had been wired into the
 * game rules instead of into appearance.
 *
 * The rule that keeps them honest: every build difference must be expressed as a
 * FLAG READ AT RUNTIME, never as a different copy of the code. Both builds ship
 * byte-identical JavaScript; only 3d.html differs, by the one line that sets the
 * flag.
 *
 *   window.FT_MOBILE = true                     starry skydome, void room
 *   window.__KENSGAMES_PLATFORM__ === 'desktop' desktop invite lobby
 *
 * Run this before shipping either build:
 *
 *   node fasttrack/scripts/check-play-sync.js
 *
 * Exits non-zero if a shared file has drifted, so it can gate a deploy.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '..');
const PLAY = path.resolve(__dirname, '..', '..', '..', '..', 'fasttrack-play', 'www', 'fasttrack');

// Must be byte-identical in both builds, ignoring line endings (the two trees
// have different git autocrlf histories, which is noise, not drift).
const SHARED = [
  'fasttrack-game-core.js',
  'fasttrack-3d.js',
  'fasttrack.rules.json',
  'ai_setup.html',
  'lobby-simple.html',
  'scripts/3d-bootstrap.js',
  'scripts/build.bat',
  'scripts/build.sh',
];

// Allowed to differ, with the reason. Anything NOT listed here and not in
// SHARED is simply not checked, so adding a new shared file means adding it
// above on purpose.
const ALLOWED_TO_DIFFER = {
  '3d.html': 'carries the window.FT_MOBILE build flag, which is the whole point',
};

// Expected to exist on one side only.
// Development and packaging assets the Play build has no use for. `scripts` is
// NOT in this list: both trees legitimately have one, and its contents are
// compared as shared files above. check-play-sync.js itself lives there and is
// the one file allowed to be web-only inside it.
const WEB_ONLY = ['engine', 'electron', '_archive'];
const PLAY_ONLY = ['desktop-login.html', 'desktop-login.js'];

const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');

let problems = 0;
const note = (ok, msg) => {
  console.log(`  ${ok ? 'OK  ' : 'DRIFT'}  ${msg}`);
  if (!ok) problems++;
};

console.log('FASTTRACK / PLAY SYNC');
console.log('='.repeat(64));
console.log(`web : ${WEB}`);
console.log(`play: ${PLAY}`);

if (!fs.existsSync(PLAY)) {
  console.log('\nfasttrack-play not found at that path. Nothing to compare.');
  process.exit(0);
}

console.log('\nShared files (must be identical):');
for (const f of SHARED) {
  const a = path.join(WEB, f);
  const b = path.join(PLAY, f);
  if (!fs.existsSync(a)) { note(false, `${f} — missing from the web build`); continue; }
  if (!fs.existsSync(b)) { note(false, `${f} — missing from the play build`); continue; }
  const same = norm(fs.readFileSync(a)) === norm(fs.readFileSync(b));
  note(same, same ? f : `${f} — the two builds have DIFFERENT code`);
}

console.log('\nAllowed differences:');
for (const [f, why] of Object.entries(ALLOWED_TO_DIFFER)) {
  const a = path.join(WEB, f), b = path.join(PLAY, f);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { note(false, `${f} — missing on one side`); continue; }
  const differs = norm(fs.readFileSync(a)) !== norm(fs.readFileSync(b));
  // If these ever become identical the flag has been lost, which breaks the
  // Play build's appearance. That is worth reporting too.
  note(differs, differs ? `${f} — differs as expected (${why})` : `${f} — NO LONGER differs; the build flag may have been lost`);
}

console.log('\nBuild-specific files:');
for (const f of PLAY_ONLY) {
  note(fs.existsSync(path.join(PLAY, f)), `${f} — present in the play build`);
}
for (const f of WEB_ONLY) {
  const there = fs.existsSync(path.join(PLAY, f));
  note(!there, there ? `${f} — should NOT be in the play build` : `${f} — correctly web-only`);
}

console.log('\n' + '='.repeat(64));
if (problems) {
  console.log(`  ${problems} problem(s). The builds have drifted.`);
  console.log('  Development happens in the WEB tree. To resync, copy the shared');
  console.log('  files listed above from web to play, and express any build');
  console.log('  difference as a runtime flag rather than as different code.');
  process.exit(1);
}
console.log('  In sync.');
process.exit(0);
