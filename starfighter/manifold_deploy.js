#!/usr/bin/env node
// 🜂 MANIFOLD DEPLOY — z = xy²
// x = 14 source JS files (input)
// y = Schwartz Diamond stamp+compress (multiplier)
// z = 1 bundle + 1 HTML (artifact = single point)
// Source lives on GitHub. Server exposes only the artifact.
// Usage: node manifold_deploy.js [--audit]
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const K = (2 * Math.PI) / 2000;
const diamond = (x, y, z) => Math.cos(x * K) * Math.cos(y * K) * Math.cos(z * K) - Math.sin(x * K) * Math.sin(y * K) * Math.sin(z * K);
const stamp = buf => {
  const h = crypto.createHash('sha256').update(buf).digest();
  const x = h.readUInt16BE(0), y = h.readUInt16BE(2), z = h.readUInt16BE(4);
  return { hash: h.toString('hex').slice(0, 16), field: diamond(x, y, z), w: x * K * y * K * y * K };
};
const ROOT = path.resolve(__dirname, '..'), SF = __dirname;
const AUDIT = process.argv.includes('--audit');
const ELECTRON = process.argv.includes('--electron');
const ELECTRON_GAME = path.join(__dirname, 'electron', 'game');
const fmt = b => b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : b > 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B';
const fsz = fp => fs.existsSync(fp) ? fs.statSync(fp).size : 0;

// x: source dimensions
const X = [
  ['js/analytics.js', ROOT],
  // Manifold kernel — field + loop + codec must precede manifold.js so the
  // unified manifold can resolve them via window globals at load time. The
  // instrument and conductor follow so audio.js / intro.js can voice the
  // field. The worklet is NOT bundled — it is fetched directly by addModule.
  ['js/manifold-codec.js', ROOT],
  ['js/manifold-field.js', ROOT],
  ['js/manifold-loop.js', ROOT],
  ['js/manifold-instrument.js', ROOT],
  ['js/manifold-conductor.js', ROOT],
  ['js/manifold.js', ROOT],
  ['js/substrates/manifold_ingestor.js', ROOT],
  ['js/access_session_bridge.js', ROOT], ['js/manifold_bridge.js', ROOT],
  ['manifold.js', SF], ['native/bridge.js', SF],
  ['manifold_native_substrate.js', SF],
  ['dimensional_substrate.js', SF], ['manifold_geometry_substrate.js', SF],
  ['lib/three/three.min.js', ROOT], ['lib/three/GLTFLoader.js', ROOT],
  ['js/manifold-environment.js', ROOT],
  ['audio.js', SF], ['music.js', SF], ['anpc.js', SF], ['progression.js', SF],
  ['js/multiplayer-client.js', ROOT], ['multiplayer.js', SF],
  ['announcer.js', SF], ['core.js', SF], ['input.js', SF], ['3d.js', SF],
  ['codex_data.js', SF], ['codex.js', SF], ['enhance.js', SF], ['intro.js', SF],
];

console.log('\n🜂  z = xy²\n' + '─'.repeat(60));
let xSz = 0; X.forEach(([p, b]) => { xSz += fsz(path.join(b, p)); });
const srcHtml = fs.existsSync(path.join(SF, 'index.src.html'))
  ? path.join(SF, 'index.src.html') : path.join(SF, 'index.html');
const hBefore = fsz(srcHtml);
console.log(`x (source):  ${X.length} files, ${fmt(xSz)} + html ${fmt(hBefore)}`);

// y: multiply — concat + stamp + compress
const parts = [];
X.forEach(([p, b]) => {
  const fp = path.join(b, p);
  if (!fs.existsSync(fp)) { console.warn('  ⚠ ' + p); return; }
  const c = fs.readFileSync(fp, 'utf8'), s = stamp(Buffer.from(c));
  parts.push(`\n/* ═ ${p} [${s.hash}] ═ */\n`);
  parts.push(c);
});
const bundle = parts.join(''), bS = stamp(Buffer.from(bundle));
const bGz = zlib.gzipSync(Buffer.from(bundle), { level: 9 });
console.log(`y (manifold): ${bS.hash} field=${bS.field.toFixed(6)} w=${bS.w.toFixed(2)}`);

// z: rewrite HTML
let html = fs.readFileSync(srcHtml, 'utf8');
const origN = (html.match(/<script src="[^"]*"/g) || []).length;
html = html.replace(/<script src="[^"]*\.js[^"]*"><\/script>\s*\n?/g, '');
html = html.replace('</body>', `<script src="starfighter.bundle.js?v=${bS.hash}"></script>\n</body>`);
const hGz = zlib.gzipSync(Buffer.from(html), { level: 9 });
console.log(`z (artifact): bundle ${fmt(bundle.length)}→${fmt(bGz.length)} | html ${fmt(html.length)}→${fmt(hGz.length)} | ${origN}→1 scripts`);

if (!AUDIT) {
  if (!fs.existsSync(path.join(SF, 'index.src.html')))
    fs.copyFileSync(path.join(SF, 'index.html'), path.join(SF, 'index.src.html'));
  fs.writeFileSync(path.join(SF, 'starfighter.bundle.js'), bundle);
  fs.writeFileSync(path.join(SF, 'starfighter.bundle.js.gz'), bGz);
  fs.writeFileSync(path.join(SF, 'index.html'), html);
  fs.writeFileSync(path.join(SF, 'index.html.gz'), hGz);
  console.log('\n  ✓ starfighter.bundle.js\n  ✓ index.html (source→index.src.html)');

  // ── Electron copy: z=xy — bundle × platform = local game point ────────────
  if (ELECTRON) {
    fs.mkdirSync(ELECTRON_GAME, { recursive: true });

    // Copy bundle and HTML
    fs.writeFileSync(path.join(ELECTRON_GAME, 'starfighter.bundle.js'), bundle);
    fs.writeFileSync(path.join(ELECTRON_GAME, 'index.html'), html);

    // Copy lobby.html (entry point loaded by main.js)
    const lobbyHtml = path.join(SF, 'lobby.html');
    if (fs.existsSync(lobbyHtml)) {
      fs.copyFileSync(lobbyHtml, path.join(ELECTRON_GAME, 'lobby.html'));
    }

    // Copy assets directory (textures, models, audio — no GLB binaries needed at runtime)
    const srcAssets = path.join(SF, 'assets');
    const dstAssets = path.join(ELECTRON_GAME, 'assets');
    function copyDir(src, dst) {
      fs.mkdirSync(dst, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name), d = path.join(dst, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else {
          // Skip GLB binaries — geometry is derived from manifold equations at runtime
          if (entry.name.endsWith('.glb')) {
            console.log(`    ⊘ skip GLB (manifold derives geometry): ${entry.name}`);
            continue;
          }
          fs.copyFileSync(s, d);
        }
      }
    }
    if (fs.existsSync(srcAssets)) copyDir(srcAssets, dstAssets);

    // Stamp manifest: manifold hash + build time + diamond field
    const manifest = {
      hash: bS.hash,
      field: parseFloat(bS.field.toFixed(6)),
      w: parseFloat(bS.w.toFixed(4)),
      built: new Date().toISOString(),
      surface: 'z=xy²',
      note: 'geometry derived from manifold equations — no GLB binaries in runtime',
    };
    fs.writeFileSync(path.join(ELECTRON_GAME, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`  ✓ electron/game/ (${bS.hash}) — lobby.html + bundle + assets (GLB excluded)`);
  }
}

console.log('\n' + '─'.repeat(60));
console.log('SERVER (nginx exposes):');
console.log('  index.html | starfighter.bundle.js | lobby.html | assets/*');
console.log('SOURCE (GitHub only, nginx-blocked):');
console.log('  *.js (source) | *.json | docs/ | native/ | model-test.html');
console.log('─'.repeat(60));
const before = xSz + hBefore, after = bGz.length + hGz.length;
console.log(`BEFORE: ${X.length + 1} reqs, ${fmt(before)}`);
console.log(`AFTER:  2 reqs, ${fmt(after)} gzip (${((1 - after / before) * 100).toFixed(0)}% reduction)`);
console.log('🜂  single point on the Schwartz Diamond.\n');
