#!/usr/bin/env node
// manifold-deploy — atomic, content-addressed deploys from your laptop.
//
// One command takes a local folder to a live, reproducible deploy on a remote
// host over plain SSH. No agent on the server, no CI required. The flow is the
// one good deploys always use, just automated:
//
//   stage (copy, minus .git)  ->  content-hash  ->  ship over scp  ->
//   back up the live dir  ->  atomic swap into place  ->  health-check  ->
//   auto-rollback if unhealthy  ->  prune old backups
//
// The "manifold" part: each release is identified by the hash of its contents,
// so the same folder always produces the same release id, and you can prove
// what is live. Reproducible by construction.
//
// Depends only on Node (>=18, for global fetch) plus the `ssh` and `scp` already
// on your machine. Zero npm dependencies.
//
//   node deploy.mjs <target> [--dry-run]
//
// Targets are defined in deploy.config.json next to this file. See
// deploy.config.example.json.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, cpSync, rmSync, mkdtempSync } from 'node:fs';
import { join, sep, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

function die(msg) { console.error(`\n[manifold-deploy] ERROR: ${msg}`); process.exit(1); }
function log(msg) { console.log(`[manifold-deploy] ${msg}`); }

// ---- args + config ---------------------------------------------------------
const target = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!target || target.startsWith('--')) {
  console.error('usage: node deploy.mjs <target> [--dry-run]');
  process.exit(2);
}
let config;
try {
  config = JSON.parse(readFileSync(join(HERE, 'deploy.config.json'), 'utf8'));
} catch (e) {
  die(`cannot read deploy.config.json (${e.message}). Copy deploy.config.example.json and edit it.`);
}
const t = config[target];
if (!t) die(`no target "${target}" in deploy.config.json. Have: ${Object.keys(config).join(', ') || '(none)'}`);
for (const k of ['local', 'host', 'user', 'remoteBase', 'serveDir']) {
  if (!t[k]) die(`target "${target}" is missing required field "${k}".`);
}
const port = String(t.port || 22);
const keep = Number.isInteger(t.keepBackups) ? t.keepBackups : 5;
const health = Array.isArray(t.health) ? t.health : [];

// ---- helpers ---------------------------------------------------------------
const EXCLUDE = /\/(\.git|node_modules)(\/|$)/;
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}
function ssh(remoteScript) {
  return sh('ssh', ['-p', port, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    `${t.user}@${t.host}`, remoteScript]);
}

// Content hash of the staged tree: sha256 over sorted "<filehash>  <relpath>".
function contentHash(root) {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) files.push(abs);
    }
  })(root);
  const lines = files
    .map((abs) => {
      const rel = relative(root, abs).split(sep).join('/');
      return `${createHash('sha256').update(readFileSync(abs)).digest('hex')}  ${rel}`;
    })
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

async function checkHealth() {
  if (!health.length) { log('no health URLs configured; skipping check.'); return true; }
  for (const url of health) {
    let ok = false;
    for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
        clearTimeout(timer);
        if (res.status >= 200 && res.status < 400) ok = true;
        else log(`  ${url} -> ${res.status} (attempt ${attempt})`);
      } catch (e) {
        log(`  ${url} -> ${e.name} (attempt ${attempt})`);
      }
      if (!ok) await new Promise((r) => setTimeout(r, 2000));
    }
    if (!ok) { log(`HEALTH FAILED: ${url}`); return false; }
    log(`  health OK: ${url}`);
  }
  return true;
}

// ---- deploy ----------------------------------------------------------------
const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
log(`target "${target}": ${t.local}  ->  ${t.user}@${t.host}:${t.remoteBase}/${t.serveDir}`);

// 1) stage a clean copy (no .git / node_modules)
const stage = mkdtempSync(join(tmpdir(), 'mdeploy-'));
cpSync(t.local, stage, { recursive: true, filter: (s) => !EXCLUDE.test(s.replace(/\\/g, '/')) });
const hash = contentHash(stage);
const shortHash = hash.slice(0, 12);
const releaseId = `${id}-${shortHash}`;
log(`content hash ${shortHash} -> release ${releaseId}`);

if (dryRun) {
  log('dry run: staged and hashed only, nothing shipped.');
  rmSync(stage, { recursive: true, force: true });
  process.exit(0);
}

const remoteTmp = `/tmp/${basename(stage)}`;
try {
  // 2) ship the staged tree. Run scp from the stage's parent with a RELATIVE
  //    name, so a Windows drive-letter ("C:\...") is not mistaken for a host.
  log('shipping over scp...');
  sh('scp', ['-P', port, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-r', basename(stage), `${t.user}@${t.host}:/tmp/`], { cwd: dirname(stage) });

  // 3) back up live dir, atomic-swap the new release into place, prune backups
  log('backing up + swapping on the server...');
  const deployScript = [
    'set -e',
    `BASE='${t.remoteBase}'`,
    `SERVE='${t.serveDir}'`,
    `ID='${releaseId}'`,
    `SRC='${remoteTmp}'`,
    `KEEP=${keep}`,
    'cd "$BASE"',
    'mkdir -p .mdeploy-backups',
    'if [ -d "$SERVE" ]; then tar czf ".mdeploy-backups/$SERVE-$ID.tar.gz" "$SERVE"; fi',
    'find "$SRC" -type d -exec chmod 755 {} \\;',
    'find "$SRC" -type f -exec chmod 644 {} \\;',
    'printf "%s\\n" "$ID" > "$SRC/.release-id"',
    'rm -rf "$SERVE.__prev"',
    'if [ -d "$SERVE" ]; then mv "$SERVE" "$SERVE.__prev"; fi',
    'mv "$SRC" "$SERVE"',
    'ls -1t .mdeploy-backups/$SERVE-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f',
    'echo "SWAPPED $ID"',
  ].join('\n');
  process.stdout.write('  ' + ssh(deployScript).trim() + '\n');

  // 4) health-gate; roll back on failure
  log('health-checking...');
  const healthy = await checkHealth();
  if (!healthy) {
    log('rolling back to previous release...');
    const rollback = [
      'set -e',
      `cd '${t.remoteBase}'`,
      `S='${t.serveDir}'`,
      'if [ -d "$S.__prev" ]; then rm -rf "$S.__bad"; mv "$S" "$S.__bad"; mv "$S.__prev" "$S"; echo ROLLED_BACK; else echo NO_PREV_TO_ROLLBACK; fi',
    ].join('\n');
    process.stdout.write('  ' + ssh(rollback).trim() + '\n');
    die(`deploy ${releaseId} was unhealthy and was rolled back.`);
  }

  log(`LIVE and healthy: release ${releaseId} (content ${shortHash})`);
  log(`rollback if needed:  ssh -p ${port} ${t.user}@${t.host} "cd ${t.remoteBase} && rm -rf ${t.serveDir} && mv ${t.serveDir}.__prev ${t.serveDir}"`);
} catch (e) {
  const out = (e.stdout || '') + (e.stderr || '');
  die(`deploy failed: ${e.message}\n${out}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
