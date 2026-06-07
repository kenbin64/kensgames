#!/usr/bin/env node
// Content-addressed release manifest — deterministic, zero-dependency.
//
// A release is reproducible by hash: walk every regular file under a release
// tree, hash its bytes, sort by path, and fold those into one root hash. Two
// machines that built the same release compute the same rootHash, so you can
// prove the live site == a given commit, and detect any tampering after.
//
// The rootHash is defined over the sorted `<sha256>  <path>` lines ONLY (the
// same shape `sha256sum` emits), never over JSON formatting — so the bash and
// Node implementations agree byte-for-byte. See release.sh for the twin.
//
// Usage:
//   node manifest.mjs generate <release-dir> [--git <sha>] [--id <release-id>] [--built-at <iso>]
//   node manifest.mjs verify   <release-dir>
//
// generate: writes <release-dir>/manifest.json and prints the rootHash.
// verify:   re-hashes the tree, compares to the embedded manifest, exits
//           non-zero on any drift. The manifest file itself is excluded.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const MANIFEST_NAME = 'manifest.json';
const SCHEMA = 'kg.release-manifest/1';

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Recursively list regular files, returning paths relative to root with
// forward slashes. Symlinks are skipped (a release tree is plain files; the
// `current` pointer lives outside it). The manifest file is never included.
function walk(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isSymbolicLink && st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walk(root, abs, out);
    } else if (st.isFile()) {
      const rel = relative(root, abs).split(sep).join('/');
      if (rel === MANIFEST_NAME) continue;
      out.push(rel);
    }
  }
  return out;
}

// The canonical body: `<sha256>  <path>\n` per file, sorted by path in C
// (byte) order. This exact string is what both implementations hash.
function manifestBody(root) {
  const files = walk(root).sort(); // default JS sort is codepoint order == C order for ascii paths
  const lines = files.map((rel) => `${sha256(readFileSync(join(root, rel)))}  ${rel}`);
  return { files, body: lines.join('\n') + (lines.length ? '\n' : '') };
}

function generate(root, opts) {
  const { files, body } = manifestBody(root);
  const rootHash = sha256(Buffer.from(body, 'utf8'));
  const manifest = {
    schema: SCHEMA,
    releaseId: opts.id || null,
    gitSha: opts.git || null,
    builtAt: opts.builtAt || null, // caller supplies; we never read the clock so output stays reproducible
    fileCount: files.length,
    rootHash,
    files: files.map((rel) => ({ path: rel, sha256: sha256(readFileSync(join(root, rel))) })),
  };
  writeFileSync(join(root, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  return rootHash;
}

function verify(root) {
  let stored;
  try {
    stored = JSON.parse(readFileSync(join(root, MANIFEST_NAME), 'utf8'));
  } catch (e) {
    console.error(`verify: cannot read ${MANIFEST_NAME}: ${e.message}`);
    return false;
  }
  const { body } = manifestBody(root);
  const actual = sha256(Buffer.from(body, 'utf8'));
  if (actual !== stored.rootHash) {
    console.error(`verify: rootHash MISMATCH`);
    console.error(`  manifest: ${stored.rootHash}`);
    console.error(`  actual:   ${actual}`);
    return false;
  }
  console.log(`verify OK: ${actual} (${stored.fileCount} files)`);
  return true;
}

const [cmd, root, ...rest] = process.argv.slice(2);
if (!cmd || !root) {
  console.error('usage: manifest.mjs generate|verify <release-dir> [--git SHA] [--id ID] [--built-at ISO]');
  process.exit(2);
}

const opts = {};
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === '--git') opts.git = rest[i + 1];
  else if (rest[i] === '--id') opts.id = rest[i + 1];
  else if (rest[i] === '--built-at') opts.builtAt = rest[i + 1];
}

if (cmd === 'generate') {
  const h = generate(root, opts);
  console.log(h);
  process.exit(0);
} else if (cmd === 'verify') {
  process.exit(verify(root) ? 0 : 1);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
