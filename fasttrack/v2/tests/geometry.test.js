// tests/geometry.test.js
// Locks the reconciliation between rules.json's flat canonical numbering (outer-{p}-{1..14})
// and the proven semantic loop. The n-th canonical position is the n-th hole of the semantic
// wedge, so: position 1 = ft, position 8 = the safe-zone entrance (the semantic outer-{p}-2),
// position 10 = home. This is the mapping the data layer uses; the engine speaks semantic.
// Run: node tests/geometry.test.js   (from fasttrack/v2)
import { wedgeSegment, safeEntranceId, ftId, homeId, outerId } from '../logic/board.js';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const seg = wedgeSegment(0);  // the 14 semantic holes, in clockwise (canonical 1..14) order

console.log('\n== rules.json canonical positions map onto the semantic wedge ==');
ok(seg.length === 14, 'a wedge maps 14 canonical positions to 14 semantic holes');
ok(seg[0] === ftId(0), 'canonical position 1 is the fast-track hole (rules.json ft_hole_index 1)');
ok(seg[7] === outerId(0, 2) && seg[7] === safeEntranceId(0), 'canonical position 8 is the safe-zone entrance, the semantic outer-0-2 (rules.json index 8)');
ok(seg[9] === homeId(0), 'canonical position 10 is the home/winner hole (rules.json home position 10)');

console.log('\n== the four outer-role holes are canonical positions 6..9 ==');
ok(seg[5] === outerId(0, 0) && seg[6] === outerId(0, 1) && seg[7] === outerId(0, 2) && seg[8] === outerId(0, 3),
  'positions 6,7,8,9 are outer-0-0..3, so the entrance (8) is the third outer hole');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
