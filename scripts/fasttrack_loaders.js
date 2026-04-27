#!/usr/bin/env node
/* Trace where each audio-bearing fasttrack file is loaded/referenced. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = /node_modules|_archive|\.git/i;

const targets = [
  'audio_substrate.js',
  'music_substrate.js',
  'game_sfx.js',
  'ragtime_substrate.js',
  'crowd_substrate.js',
  'lobby-speakeasy.js',
  'peg_personality_substrate.js',
  'natural_lens.js',
  'potential_substrate.js',
  'board_3d_renderer.js',
  'fasttrack-3d.js',
  'board_3d_game.js',
  'game_engine.js',
  'fasttrack-game-core.js',
  'fasttrack_manifold_substrate.js',
];

const files = [];
(function walk(d){
  for (const e of fs.readdirSync(d, { withFileTypes:true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) files.push(p);
  }
})(path.join(ROOT, 'fasttrack'));

for (const t of targets) {
  const refs = [];
  for (const f of files) {
    if (path.basename(f) === t) continue;
    const txt = fs.readFileSync(f, 'utf8');
    if (txt.includes(t)) {
      const lineIdx = txt.split('\n').findIndex(l => l.includes(t));
      refs.push(`${path.relative(ROOT, f)}:${lineIdx+1}`);
    }
  }
  console.log(`\n  ${t}  (${refs.length} refs)`);
  refs.slice(0, 8).forEach(r => console.log('    · ' + r));
  if (refs.length > 8) console.log(`    … +${refs.length-8} more`);
}
