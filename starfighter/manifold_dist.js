#!/usr/bin/env node
// 🜂 MANIFOLD DIST — m = xyz  (Layer 5 of the Dimensional Helix)
//
// x = manifold_deploy --electron   (bundle: z=xy² output → electron/game/)
// y = icon pipeline                (icons: z=xy output → electron/assets/)
// z = electron-builder             (installers: platform artifacts per target)
// m = xyz                          (all three compose: the complete distribution point)
//
// Helix principle: the diamond hash of z (bundle) seeds the manifest of m (installer).
// Every build is a unique point on the Schwartz Diamond surface.
// No two distributions share the same manifold coordinate.
//
// Usage:
//   node manifold_dist.js              — build win + linux (local host)
//   node manifold_dist.js --win        — Windows only
//   node manifold_dist.js --linux      — Linux only
//   node manifold_dist.js --mac        — macOS only (requires macOS runner)
//   node manifold_dist.js --all        — all three (mac requires macOS)
//   node manifold_dist.js --steam-only — skip installer, write Steam depot VDFs only
//   node manifold_dist.js --audit      — dry run, print plan, no writes

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SF = __dirname;
const ROOT = path.resolve(SF, '..');
const ELECTRON_DIR = path.join(SF, 'electron');
const STEAM_DIR = path.join(SF, 'steam');
const DOWNLOADS = path.join(SF, '..', 'downloads');

const args = process.argv.slice(2);
const AUDIT = args.includes('--audit');
const WIN = args.includes('--win') || args.includes('--all') || (!args.some(a => a.startsWith('--')) && process.platform !== 'darwin');
const LINUX = args.includes('--linux') || args.includes('--all') || (!args.some(a => a.startsWith('--')) && true);
const MAC = args.includes('--mac') || args.includes('--all');
const STEAM_ONLY = args.includes('--steam-only');

const K = (2 * Math.PI) / 2000;
const diamond = (x, y, z) =>
  Math.cos(x * K) * Math.cos(y * K) * Math.cos(z * K) -
  Math.sin(x * K) * Math.sin(y * K) * Math.sin(z * K);

const fmt = b => b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : b > 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B';

function run(cmd, cwd, label) {
  console.log(`\n  → ${label}`);
  if (AUDIT) { console.log(`    [audit] would run: ${cmd}`); return; }
  const r = spawnSync(cmd, { shell: true, cwd: cwd || SF, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n  ✗ FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
  console.log(`  ✓ ${label}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Read current bundle hash (must exist; run manifold_deploy first if not)
// ─────────────────────────────────────────────────────────────────────────────
function getBundleHash() {
  const manifest = path.join(ELECTRON_DIR, 'game', 'manifest.json');
  if (!fs.existsSync(manifest)) return null;
  try { return JSON.parse(fs.readFileSync(manifest, 'utf8')).hash; }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Steam VDF generation
// Every depot content script is a manifold point:
//   x = platform, y = build hash, z = VDF artifact
// ─────────────────────────────────────────────────────────────────────────────
function writeVdf(hash) {
  if (AUDIT) { console.log('    [audit] would write Steam VDFs'); return; }
  fs.mkdirSync(STEAM_DIR, { recursive: true });

  // Steam App ID placeholder (replace with your real ID after Steamworks registration)
  const APP_ID = fs.existsSync(path.join(STEAM_DIR, 'steam_appid.txt'))
    ? fs.readFileSync(path.join(STEAM_DIR, 'steam_appid.txt'), 'utf8').trim()
    : '480';   // 480 = Spacewar (Valve's public test app)

  // Depot IDs: by convention AppID+1=win, +2=linux, +3=mac, +4=content
  const DEP_WIN = String(parseInt(APP_ID) + 1);
  const DEP_LINUX = String(parseInt(APP_ID) + 2);
  const DEP_MAC = String(parseInt(APP_ID) + 3);

  const buildDesc = `Starfighter build ${hash} — z=xy² manifold point`;

  // ── app_build.vdf ──────────────────────────────────────────────────────
  const appBuild = `"appbuild"
{
  "appid"       "${APP_ID}"
  "desc"        "${buildDesc}"
  "buildoutput" "${path.join(STEAM_DIR, 'output')}"
  "contentroot" "${DOWNLOADS}"
  "setlive"     "beta"
  "preview"     "0"
  "depots"
  {
    "${DEP_WIN}"   "depot_win.vdf"
    "${DEP_LINUX}" "depot_linux.vdf"
    "${DEP_MAC}"   "depot_mac.vdf"
  }
}
`;

  // ── depot_win.vdf ──────────────────────────────────────────────────────
  const depotWin = `"DepotBuildConfig"
{
  "DepotID" "${DEP_WIN}"
  "contentroot" ""
  "FileMapping"
  {
    "LocalPath" "win-unpacked/*"
    "DepotPath" "."
    "recursive" "1"
  }
  "FileExclusion" "*.map"
}
`;

  // ── depot_linux.vdf ───────────────────────────────────────────────────
  const depotLinux = `"DepotBuildConfig"
{
  "DepotID" "${DEP_LINUX}"
  "contentroot" ""
  "FileMapping"
  {
    "LocalPath" "linux-unpacked/*"
    "DepotPath" "."
    "recursive" "1"
  }
  "FileExclusion" "*.map"
}
`;

  // ── depot_mac.vdf ─────────────────────────────────────────────────────
  const depotMac = `"DepotBuildConfig"
{
  "DepotID" "${DEP_MAC}"
  "contentroot" ""
  "FileMapping"
  {
    "LocalPath" "mac/*"
    "DepotPath" "."
    "recursive" "1"
  }
  "FileExclusion" "*.map"
}
`;

  fs.writeFileSync(path.join(STEAM_DIR, 'app_build.vdf'), appBuild);
  fs.writeFileSync(path.join(STEAM_DIR, 'depot_win.vdf'), depotWin);
  fs.writeFileSync(path.join(STEAM_DIR, 'depot_linux.vdf'), depotLinux);
  fs.writeFileSync(path.join(STEAM_DIR, 'depot_mac.vdf'), depotMac);

  // ── upload helper script ───────────────────────────────────────────────
  const upload = `#!/bin/bash
# 🜂 Steam Upload — run after manifold_dist.js completes
# Requires steamcmd installed and authenticated
# Usage: bash steam/upload.sh

set -e
STEAMCMD=\${STEAMCMD:-steamcmd}
STEAM_USER=\${STEAM_USER:-"your_steam_username"}
VDF="${path.join(STEAM_DIR, 'app_build.vdf')}"

echo "🜂  Uploading Starfighter build ${hash} to Steam..."
$STEAMCMD +login "$STEAM_USER" +run_app_build "$VDF" +quit
echo "✓ Upload complete."
`;
  fs.writeFileSync(path.join(STEAM_DIR, 'upload.sh'), upload);
  fs.chmodSync(path.join(STEAM_DIR, 'upload.sh'), 0o755);

  console.log(`  ✓ Steam VDFs written (App ID: ${APP_ID})`);
  console.log(`    Run: STEAM_USER=you bash steam/upload.sh`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Main pipeline
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  const crypto = require('crypto');

  console.log('\n🜂  m = xyz  (Manifold Distribution Pipeline)\n' + '═'.repeat(60));
  console.log(`  Targets: ${[WIN && 'win', LINUX && 'linux', MAC && 'mac'].filter(Boolean).join(' + ') || 'steam-vdf only'}`);
  if (AUDIT) console.log('  MODE: --audit (dry run)\n');

  // ── x: bundle pass ──────────────────────────────────────────────────────
  console.log('\n── x: manifold_deploy --electron  (z=xy²)\n' + '─'.repeat(50));
  run('node manifold_deploy.js --electron', SF, 'Bundle sources → electron/game/');

  // ── y: icon pass ────────────────────────────────────────────────────────
  console.log('\n── y: icon pipeline  (z=xy)\n' + '─'.repeat(50));
  run('node make_icons.js', ELECTRON_DIR, 'Generate icons → electron/assets/');

  if (STEAM_ONLY) {
    const hash = getBundleHash() || 'no-bundle';
    console.log('\n── z: Steam VDFs only\n' + '─'.repeat(50));
    writeVdf(hash);
    console.log('\n🜂  m complete (steam-only mode).\n');
    return;
  }

  // ── z: electron-builder pass ─────────────────────────────────────────────
  console.log('\n── z: electron-builder  (m=xyz)\n' + '─'.repeat(50));
  fs.mkdirSync(DOWNLOADS, { recursive: true });

  const targets = [WIN && '--win', LINUX && '--linux', MAC && '--mac'].filter(Boolean).join(' ');
  if (targets) {
    run(`npx electron-builder ${targets} --publish never`, ELECTRON_DIR, `Build installers (${targets})`);
  }

  // ── Stamp final manifest ─────────────────────────────────────────────────
  const hash = getBundleHash() || 'unknown';
  const hBuf = Buffer.from(hash);
  const hx = hBuf.readUInt16BE(0) % 2000;
  const hy = hBuf.readUInt16BE(2) % 2000;
  const hz = hBuf.readUInt16BE(4) % 2000;
  const field = diamond(hx, hy, hz);

  if (!AUDIT) {
    writeVdf(hash);

    // List outputs
    console.log('\n── Distribution artifacts:\n' + '─'.repeat(50));
    if (fs.existsSync(DOWNLOADS)) {
      for (const f of fs.readdirSync(DOWNLOADS)) {
        const fp = path.join(DOWNLOADS, f);
        if (fs.statSync(fp).isFile())
          console.log(`  ${f.padEnd(55)} ${fmt(fs.statSync(fp).size)}`);
      }
    }

    console.log('\n── Manifold stamp:\n' + '─'.repeat(50));
    console.log(`  hash:  ${hash}`);
    console.log(`  field: ${field.toFixed(6)}  (Schwartz Diamond coordinate)`);
    console.log(`  xy:    (${hx}, ${hy}, ${hz})`);
    console.log(`  surface: m = xyz  →  each build is a unique point`);
  }

  console.log('\n🜂  Distribution complete.\n');
  console.log('  Next steps:');
  console.log('  1. Download installer from downloads/ and test offline');
  console.log('  2. Register App ID at https://partner.steamgames.com');
  console.log('  3. Edit steam/steam_appid.txt with your real App ID');
  console.log('  4. STEAM_USER=you bash steam/upload.sh\n');
}

main();
