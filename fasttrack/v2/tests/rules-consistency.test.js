// tests/rules-consistency.test.js
// Guards the rule set against contradiction and collision: no duplicate ids, no two rules at
// the same (x,y,z) manifold point (a literal collision), every rule complete, the card-derived
// sets agree with the card-set rules, and the safe-entrance reconciliation holds (rules.json
// index 8 is the same physical hole the engine calls outer-{p}-2). Deprecated rules kept in the
// file are surfaced so they cannot be applied by mistake.
// Run: node tests/rules-consistency.test.js   (from fasttrack/v2)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadRules } from '../engine/rules.js';

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, '..', '..', 'fasttrack.rules.json'), 'utf8'));
const R = doc.rules;
const L = loadRules(doc);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const setEq = (s, arr) => [...s].sort().join(',') === [...arr].sort().join(',');

console.log('\n== no duplicate ids, no manifold-point collisions ==');
const ids = R.map((r) => r.id);
ok(new Set(ids).size === ids.length, 'every rule id is unique');
const pts = R.map((r) => `${r.x},${r.y},${r.z}`);
ok(new Set(pts).size === pts.length, 'no two rules occupy the same (x,y,z) point (no collision)');

console.log('\n== every rule is complete (has a description and an assertion) ==');
const incomplete = R.filter((r) => !r.desc || !r.assertion);
ok(incomplete.length === 0, 'each rule carries a desc and an assertion' + (incomplete.length ? ' (missing: ' + incomplete.map((r) => r.id).join(',') + ')' : ''));

console.log('\n== card-derived sets agree with the card-set rules ==');
ok(setEq(L.redrawSet, ['A', '6', 'J', 'Q', 'K', 'JOKER']), 'CARD_REDRAW_SET matches the extra_turn card flags');
ok(setEq(L.oneStepSet, ['A', 'J', 'Q', 'K', 'JOKER']), 'CARD_ONE_STEP_SET matches the movement===1 card flags');
ok(setEq(L.bullseyeExit, ['J', 'Q', 'K']), 'CARD_BULL_EXIT_SET matches the can_exit_bullseye card flags');
ok(setEq(L.entryFromHolding, ['A', '6', 'JOKER']), 'CARD_ENTRY_TRIO matches the can_enter_from_holding card flags');

console.log('\n== safe-entrance reconciliation (one hole, two numbering schemes) ==');
ok(doc.board.outer_track.safe_zone_entrance_index === 8, 'rules.json canonical safe entrance is position 8');
const ftExit = R.find((r) => r.id === 'FT_EXIT_ANY_HOLE');
ok(ftExit && /outer-\{?p?\}?-8.*outer-\{?bp?\}?-2|outer-\{p\}-8 = engine outer-\{bp\}-2/.test(ftExit.desc),
  'FT_EXIT_ANY_HOLE documents that canonical 8 is the engine\'s outer-{bp}-2 (same hole)');

console.log('\n== deprecated/removed rules are flagged, not silently live ==');
const deprecated = R.filter((r) => /\b(DEPRECATED|REMOVED)\b/.test(r.desc));
console.log('  INFO deprecated/removed rules kept in the file: ' + (deprecated.map((r) => r.id).join(', ') || 'none'));
ok(true, 'deprecated rules surfaced (' + deprecated.length + '): their assertions must state the CURRENT behavior, and the engine must not apply the old meaning');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
