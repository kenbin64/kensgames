#!/usr/bin/env node
/**
 * ============================================================
 * TREE DIVERGENCE GUARD
 *
 * FastTrack exists in two places on this machine:
 *
 *   fasttrack-play/www/fasttrack          this repo. Git tracked. Canonical.
 *   kensgames/kensgames/fasttrack         inside the whole kensgames platform,
 *                                         beside 4DTicTacToe, brickbreaker3d,
 *                                         bugzapper, cubic3d, the arcade, the
 *                                         lobby server and the deploy scripts.
 *                                         NOT a git repository.
 *
 * They are not copies of one another and neither is redundant. The platform
 * tree holds things a game-only repo has no business holding, such as the test
 * for handoff with server/lobby-server.js. What the two share is the game.
 *
 * The danger is quiet: edit the platform's copy of a shared file, and the work
 * lands somewhere with no history, no branches and nothing to roll back to,
 * while the tracked copy silently falls behind. That is what this catches.
 *
 * It does NOT complain that the platform tree has extra files. It is supposed
 * to. It complains when a file the two SHARE has drifted, and it says which way
 * it drifted, because only one of those directions is a problem.
 *
 * If the platform tree is not on this machine, there is nothing to compare and
 * the check passes quietly rather than failing on somebody else's checkout.
 *
 * Run: node fasttrack/test_tree_divergence.js
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
};

const HERE = __dirname;
const PLATFORM = path.resolve(HERE, '..', '..', '..', 'kensgames', 'kensgames', 'fasttrack');

if (!fs.existsSync(PLATFORM)) {
  console.log('SKIP  the kensgames platform tree is not on this machine, so there is nothing to diverge from');
  console.log('\n0 passed, 0 failed');
  process.exit(0);
}

// Line endings differ between the two trees for reasons that are not anybody's
// fault and do not matter. Content is what is being compared.
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const listFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isFile()).map((d) => d.name);

const here = new Set(listFiles(HERE));
const there = new Set(listFiles(PLATFORM));
const shared = [...here].filter((f) => there.has(f)).sort();

check('both trees are present and share the game itself',
  shared.length > 40, `${shared.length} files in common`);

// ── The one that matters ────────────────────────────────────
// A shared file that differs is only a problem when the PLATFORM copy has
// something this one does not, because that is work sitting outside git.
const behind = [];
const ahead = [];
for (const f of shared) {
  const a = read(path.join(HERE, f));
  const b = read(path.join(PLATFORM, f));
  if (a === b) continue;
  const aLines = new Set(a.split('\n'));
  const bLines = new Set(b.split('\n'));
  const onlyThere = [...bLines].filter((l) => l.trim() && !aLines.has(l));
  const onlyHere = [...aLines].filter((l) => l.trim() && !bLines.has(l));
  if (onlyThere.length) behind.push({ f, lines: onlyThere.length });
  else if (onlyHere.length) ahead.push({ f, lines: onlyHere.length });
}

check('no shared file has content that exists ONLY in the untracked platform copy',
  behind.length === 0,
  behind.length
    ? `EDIT THE TRACKED COPY: ${behind.map((b) => `${b.f} (${b.lines} lines stranded)`).join(', ')}`
    : 'nothing is stranded outside version control');

if (ahead.length) {
  console.log(`      this tree is ahead on ${ahead.length} file${ahead.length === 1 ? '' : 's'}, which is the right direction:`);
  for (const a of ahead) console.log(`        ${a.f}  (+${a.lines} lines here)`);
  console.log('      the platform copy can be refreshed from this one whenever it is deployed.');
}

// ── A softer note, not a failure ────────────────────────────
// New game files appearing only in the platform tree are worth knowing about,
// but some of them belong there: anything reaching for the lobby server, the
// arcade or another game is platform code and should stay platform code.
const onlyThere = [...there].filter((f) => !here.has(f)).sort();
if (onlyThere.length) {
  console.log(`\n  ${onlyThere.length} file${onlyThere.length === 1 ? '' : 's'} exist only in the platform tree:`);
  for (const f of onlyThere) {
    let why = '';
    try {
      const src = read(path.join(PLATFORM, f));
      if (/lobby-server|\.\.\/server\/|arcade|admin/.test(src)) why = '  (reaches into the platform, belongs there)';
    } catch (e) {}
    console.log(`    ${f}${why}`);
  }
  console.log('  Those without a note are candidates for moving into this repo, where they');
  console.log('  would be under version control. This is a prompt, not a failure.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
