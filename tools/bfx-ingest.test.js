#!/usr/bin/env node
/**
 * bfx-ingest — tests. Pure Node, no deps. Run: node bfx-ingest.test.js
 *
 * Proves the properties the README claims: deterministic (same repo → same
 * root + same bytes), dedup actually saves tokens, and every output format is
 * produced and contains the source.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingest, lensMd, lensXml, lensJson } = require('./bfx-ingest.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

// ── build a small deterministic fixture (a.js and b.js are identical) ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bfx-'));
fs.writeFileSync(path.join(dir, 'a.js'), 'export const hello = () => 42;\n');
fs.writeFileSync(path.join(dir, 'b.js'), 'export const hello = () => 42;\n');   // identical → should dedup
fs.writeFileSync(path.join(dir, 'c.md'), '# notes\nsome prose\n');
fs.mkdirSync(path.join(dir, 'node_modules'));                                    // must be skipped
fs.writeFileSync(path.join(dir, 'node_modules', 'junk.js'), 'should not appear');
fs.writeFileSync(path.join(dir, 'logo.png'), Buffer.from([0, 1, 2, 0, 3]));      // binary → skipped

const m1 = ingest(dir, {});
const m2 = ingest(dir, {});

ok(m1.files.length === 3, 'walks source files only (node_modules + binary skipped)');
ok(m1.root === m2.root, 'deterministic: same folder → same root hash');
ok(lensMd(m1) === lensMd(m2), 'deterministic: byte-identical Markdown across runs');

const dup = m1.files.find(f => f.dupOf);
ok(!!dup && m1.savedTokens > 0, 'dedup: the identical file is flagged and tokens are saved');

ok(/\d+/.test(String(m1.tokens)) && m1.tokens > 0, 'reports a token estimate');

const md = lensMd(m1), xml = lensXml(m1), json = lensJson(m1);
ok(md.includes('hello = () => 42') && md.includes('### '), 'md lens includes file bodies + tree');
ok(xml.startsWith('<context') && xml.includes('<file '), 'xml lens is Claude-shaped');
ok((() => { try { const o = JSON.parse(json); return o.root === m1.root && Array.isArray(o.files); } catch (_) { return false; } })(), 'json lens parses and carries the root');

// the deduped file body appears once, not twice
ok((md.match(/hello = \(\) => 42/g) || []).length === 1, 'dedup: identical body emitted once, not twice');

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
