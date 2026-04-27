// Inventory every audio reference across the repo. Read-only.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKIP = /node_modules|_archive|\.git|downloads|backups/i;
const EXTS = new Set(['.js', '.html', '.json']);

const PATTERNS = [
  ['AudioContext',     /\bAudioContext\b|\bwebkitAudioContext\b/],
  ['createOscillator', /\.createOscillator\s*\(/],
  ['createBuffer',     /\.createBuffer(Source)?\s*\(/],
  ['createGain',       /\.createGain\s*\(/],
  ['biquadFilter',     /\.createBiquadFilter\s*\(/],
  ['new Audio()',      /new\s+Audio\s*\(/],
  ['HTMLAudio src',    /<audio\b[^>]*src=/i],
  ['fetch decode',     /decodeAudioData/],
  ['mp3/wav/ogg ref',  /["'`][^"'`]*\.(mp3|wav|ogg|m4a|flac)["'`]/i],
  ['playSound() call', /\bplaySound\s*\(/],
  ['SFX manager',      /\b(sfx|SFX|soundManager|AudioManager|MusicPlayer)\b/],
  ['Tone.js',          /\bTone\.[A-Z]/],
  ['Howler',           /\bHowl\b|\bHowler\b/],
];

const hits = {};
for (const [, re] of PATTERNS) hits[re.source] = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    if (!EXTS.has(path.extname(ent.name).toLowerCase())) continue;
    let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    for (const [label, re] of PATTERNS) {
      if (re.test(txt)) {
        const lines = txt.split(/\r?\n/);
        const first = lines.findIndex(l => re.test(l));
        hits[re.source].push({ label, file: path.relative(ROOT, p), line: first + 1, sample: (lines[first] || '').trim().slice(0, 100) });
      }
    }
  }
}
walk(ROOT);

console.log('\n══ AUDIO INVENTORY ══\n');
for (const [label, re] of PATTERNS) {
  const list = hits[re.source];
  if (!list.length) continue;
  console.log(`── ${label} (${list.length}) `.padEnd(78, '─'));
  for (const h of list.slice(0, 12)) console.log(`  ${h.file}:${h.line}  ${h.sample}`);
  if (list.length > 12) console.log(`  … +${list.length - 12} more`);
}
console.log();
