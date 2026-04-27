#!/usr/bin/env node
/* Verify dead-vs-live status and surface audio call sites in the
   files actually loaded by 3d.html (the only live game entry). */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FT = path.join(ROOT, 'fasttrack');

// Files actually loaded by the live game entry-point
const LIVE = [
  'fasttrack-game-core.js',
  'fasttrack_manifold_substrate.js',
  'schwarz_diamond_renderer.js',
  'fasttrack-3d.js',
];

// Suspected-dead audio files
const DEAD_CANDIDATES = [
  'audio_substrate.js', 'music_substrate.js', 'game_sfx.js',
  'ragtime_substrate.js', 'crowd_substrate.js', 'lobby-speakeasy.js',
  'modules/peg_personality_substrate.js', 'natural_lens.js',
  'potential_substrate.js', 'board_3d_renderer.js', 'board_3d_game.js',
  'game_engine.js',
];

// 1. Look for any dynamic import / fetch / new Function / eval that could
//    pull a dead candidate in at runtime
console.log('── dynamic-load search across fasttrack/ ──────────────');
const allJS = [];
(function walk(d){
  for (const e of fs.readdirSync(d, { withFileTypes:true })) {
    const p = path.join(d, e.name);
    if (/node_modules|_archive|\.git/.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') || e.name.endsWith('.html')) allJS.push(p);
  }
})(FT);

const dynamicHits = [];
for (const f of allJS) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const cand of DEAD_CANDIDATES) {
    const base = path.basename(cand, '.js');
    // import('...'), fetch('...'), <script src dynamically>
    const re = new RegExp(`(import\\(|fetch\\(|loadScript\\(|appendChild|createElement\\('script\\)|src\\s*=)[^\\n]*${base}`, 'i');
    if (re.test(txt)) dynamicHits.push(`${path.relative(ROOT,f)}  → mentions ${cand}`);
  }
}
if (!dynamicHits.length) console.log('  (no dynamic loads found — dead files are confirmed dead)');
else dynamicHits.forEach(h => console.log('  ! ' + h));

// 2. Audio call-site map for LIVE files only
console.log('\n── live-file audio call sites (line numbers) ──────────');
const PATTERNS = [
  ['AudioContext', /(?:new\s+)?(?:webkit)?AudioContext\s*\(/],
  ['createOscillator', /\.createOscillator\s*\(/],
  ['createBuffer',     /\.createBuffer\s*\(/],
  ['createBufferSource', /\.createBufferSource\s*\(/],
  ['createGain',       /\.createGain\s*\(/],
  ['createBiquad',     /\.createBiquadFilter\s*\(/],
  ['noise',            /noiseBuffer|whiteNoise|pinkNoise/i],
  ['playSfx-callsite', /play(?:Sfx|Sound|Note|Beep|Tick|Pluck|Click)\s*\(/],
];
for (const lf of LIVE) {
  const p = path.join(FT, lf);
  if (!fs.existsSync(p)) { console.log('  (missing) ' + lf); continue; }
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  console.log(`\n  ${lf}  (${lines.length} lines)`);
  const groups = {};
  lines.forEach((l, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(l)) (groups[name] = groups[name] || []).push(i+1);
    }
  });
  for (const [name, lns] of Object.entries(groups)) {
    const head = lns.slice(0, 12).join(',');
    const more = lns.length > 12 ? ` …+${lns.length-12}` : '';
    console.log(`    ${name.padEnd(20)} ${lns.length.toString().padStart(3)}× lines: ${head}${more}`);
  }
}

// 3. Look for "music" / "ragtime" / "song" hooks in the live files
console.log('\n── music/ragtime/peg hooks in live files ──────────────');
const HOOKS = /ragtime|swing|piano|song|music|peg.{0,8}(hit|land|click)|crowd|cheer/i;
for (const lf of LIVE) {
  const p = path.join(FT, lf);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const hits = [];
  lines.forEach((l, i) => { if (HOOKS.test(l)) hits.push(i+1); });
  console.log(`  ${lf.padEnd(40)} ${hits.length}× : ${hits.slice(0,15).join(',')}${hits.length>15?' …':''}`);
}
