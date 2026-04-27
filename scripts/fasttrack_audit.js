#!/usr/bin/env node
/* FastTrack audit — surface the audio + entry-point graph so we can
   plan the manifold rewire without disturbing rules or visuals. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'fasttrack');
const SKIP = /node_modules|_archive|\.git|tests?[\\/]/i;

const files = [];
(function walk(d){
  for (const e of fs.readdirSync(d, { withFileTypes:true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

// ── 1. HTML entry points → script src list ────────────────────────────
console.log('\n── HTML entry points (script src order) ────────────────');
for (const f of files.filter(f => f.endsWith('.html'))) {
  const t = fs.readFileSync(f, 'utf8');
  const srcs = [...t.matchAll(/<script[^>]*src=["']([^"']+)["']/g)].map(m=>m[1]);
  if (!srcs.length) continue;
  console.log(`\n  ${rel(f)} (${srcs.length})`);
  srcs.forEach(s => console.log('    · ' + s));
}

// ── 2. Audio surface — anything that can make sound ───────────────────
console.log('\n── Audio surface (per JS file) ────────────────────────');
const audioRe = /AudioContext|webkitAudioContext|createOscillator|createBuffer(?!Source)|createBufferSource|new Audio\(|\.mp3|\.wav|\.ogg/g;
const totals = { ctx:0, osc:0, buf:0, audEl:0, asset:0 };
for (const f of files.filter(f => f.endsWith('.js'))) {
  const t = fs.readFileSync(f, 'utf8');
  const counts = {
    ctx:   (t.match(/AudioContext|webkitAudioContext/g)||[]).length,
    osc:   (t.match(/createOscillator/g)||[]).length,
    buf:   (t.match(/createBuffer\b/g)||[]).length,
    bufsrc:(t.match(/createBufferSource/g)||[]).length,
    audEl: (t.match(/new Audio\(/g)||[]).length,
    asset: (t.match(/\.(mp3|wav|ogg|m4a|flac)/gi)||[]).length,
    lines: t.split('\n').length,
  };
  if (counts.ctx+counts.osc+counts.buf+counts.bufsrc+counts.audEl+counts.asset === 0) continue;
  totals.ctx += counts.ctx; totals.osc += counts.osc;
  totals.buf += counts.buf + counts.bufsrc;
  totals.audEl += counts.audEl; totals.asset += counts.asset;
  console.log(`  ${rel(f).padEnd(46)} L=${String(counts.lines).padStart(5)}  `
    + `ctx=${counts.ctx} osc=${counts.osc} buf=${counts.buf+counts.bufsrc} `
    + `aud=${counts.audEl} assets=${counts.asset}`);
}
console.log(`\n  TOTAL  ctx=${totals.ctx} osc=${totals.osc} buf=${totals.buf} `
  + `audEl=${totals.audEl} assets=${totals.asset}`);

// ── 3. Top files by LOC ───────────────────────────────────────────────
console.log('\n── Top JS files by LOC (cleanup targets) ──────────────');
const sized = files.filter(f=>f.endsWith('.js'))
  .map(f => ({ f, n: fs.readFileSync(f,'utf8').split('\n').length }))
  .sort((a,b) => b.n - a.n).slice(0, 25);
sized.forEach(({f,n}) => console.log(`  ${String(n).padStart(5)}  ${rel(f)}`));

// ── 4. Asset files in fasttrack/ ──────────────────────────────────────
console.log('\n── Audio asset files under fasttrack/ ─────────────────');
let assetCount = 0;
(function walk(d){
  for (const e of fs.readdirSync(d, { withFileTypes:true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(e.name)) {
      console.log('  · ' + rel(p));
      assetCount++;
    }
  }
})(ROOT);
if (!assetCount) console.log('  (none)');
