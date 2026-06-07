#!/usr/bin/env node
/**
 * ============================================================
 * MANIFOLD KERNEL — everything collapses to two verbs
 *
 * The SAME collapse() and the SAME expand() run four unrelated
 * domains: a counter, a validated bank, a real game core, and a
 * folder-ingest (the "compiler"). No per-domain engine — just
 * the two verbs with different arguments. Collapse to one.
 *
 * Run: node js/manifold-kernel.test.js
 * ============================================================
 */
const K = require('./manifold-kernel.js');
const FT = require('../fasttrack/manifold/ft-manifold.js');
const fs = require('fs'), path = require('path');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}${d ? '  ' + d : ''}`); } else { fail++; console.log(`  ❌ ${n}${d ? '  ' + d : ''}`); } };
const J = (x) => JSON.stringify(x);

console.log('── ONE collapse() folds four unrelated domains ──');

// 1) counter
const cR = (z, y) => y.t === 'inc' ? { n: z.n + 1 } : y.t === 'add' ? { n: z.n + y.by } : z;
const c = K.collapse({ n: 0 }, [{ t: 'inc' }, { t: 'add', by: 5 }, { t: 'inc' }], cR);
ok(c.z.n === 7, 'counter folds to a point (n=7)', `head ${c.head}`);

// 2) bank with validation — rejected y never enters the record
const bR = (z, y) => y.t === 'dep' ? { bal: z.bal + y.a } : (y.t === 'wd' && y.a <= z.bal) ? { bal: z.bal - y.a } : z;
const b = K.collapse({ bal: 0 }, [{ t: 'dep', a: 100 }, { t: 'wd', a: 250 }, { t: 'wd', a: 30 }], bR);
ok(b.z.bal === 70 && b.log.length === 2, 'bank folds to bal=70; the overdraft was rejected + unlogged');

// 3) FastTrack — collapse over actions IS derive()
const g = FT.genesis('K', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', isBot: true }]);
const ys = [{ type: 'draw' }, { type: 'pass' }, { type: 'draw' }, { type: 'pass' }];
const ft = K.collapse(() => FT.derive(g, []), ys, (z, y) => FT.step(z, g, y));
ok(J(ft.z) === J(FT.derive(g, ys)), 'FastTrack: collapse(actions) == the core\'s own derive() (same fold)');

// 4) a folder — the "compiler" is collapse over files
const dir = path.join(__dirname, '..', 'fasttrack', 'manifold');
const files = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort()
  .map(f => ({ path: f, hash: K.hash(fs.readFileSync(path.join(dir, f))) }));
const folder = K.collapse({ tree: [] }, files, (z, file) => ({ tree: [...z.tree, file] }));
ok(folder.z.tree.length === files.length, 'folder: collapse folds every file into one manifold point', `(${files.length} files)`);

console.log('\n── ONE expand() projects any point through any lens ──');
// the SAME expand, three lenses, on the counter point and the folder point
const jsonLens = (z) => JSON.stringify(z);
const rootLens = (z) => K.hash(z.tree ? z.tree.map(f => f.path + ':' + f.hash).join('\n') : J(z));
const sizeLens = (z) => (z.tree ? z.tree.length + ' files' : Object.keys(z).join(','));
ok(typeof K.expand(c.z, jsonLens) === 'string', 'expand(counter, jsonLens) → manifest');
const root = K.expand(folder.z, rootLens);
ok(/^[0-9a-f]{8}$/.test(root), 'expand(folder, rootLens) → a content root', `(${root})`);
ok(K.expand(folder.z, sizeLens).includes('files'), 'expand(folder, sizeLens) → a different artifact, same point, same verb');

console.log('\n── the two verbs ARE the audit + determinism ──');
// reproducible: same x + same y-stream → same head, on a second collapse
const c2 = K.collapse({ n: 0 }, [{ t: 'inc' }, { t: 'add', by: 5 }, { t: 'inc' }], cR);
ok(c2.head === c.head, 'same (x, y-stream) → identical head (reproducible)');
// tamper: change one y → different head (tamper-evident)
const cBad = K.collapse({ n: 0 }, [{ t: 'inc' }, { t: 'add', by: 6 }, { t: 'inc' }], cR);
ok(cBad.head !== c.head, 'change one y → different head (tamper-evident)');

console.log(`\n══════════════════════\n  ${pass} proven, ${fail} failed\n══════════════════════`);
console.log('\nFour domains, two verbs. The harness, the compiler, and the game adapter');
console.log('are not separate engines — they are collapse() and expand() with different');
console.log('arguments. That is the collapse-to-one.');
process.exit(fail ? 1 : 0);
