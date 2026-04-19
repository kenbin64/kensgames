const fs = require('fs');

// manifold_surface.js: calculateZ — portal-level z = x*y (AGENTS.md law, not engine _z)
let ms = fs.readFileSync('js/manifold-core/manifold_surface.js', 'utf8');
const msOld = 'calculateZ(x, y) { return x * y * y; }';
const msNew = 'calculateZ(x, y) { return x * y; }  // z = x\u00b7y \u2014 portal dimensional law (AGENTS.md)';
if (!ms.includes(msOld)) { console.error('manifold_surface: old string not found'); process.exit(1); }
ms = ms.replace(msOld, msNew);
fs.writeFileSync('js/manifold-core/manifold_surface.js', ms, 'utf8');
console.log('manifold_surface.js:', ms.includes('return x * y;') ? 'OK' : 'FAIL');

// test_manifold_core.js: assert z(3,4)=12 (portal z=x*y)
let tc = fs.readFileSync('js/manifold-core/test_manifold_core.js', 'utf8');
tc = tc.replace("assertEqual(z, 48, 'Z = x * y\u00b2 formula (3\xd716=48)')",
  "assertEqual(z, 12, 'Z = x\u00b7y portal dimensional law (3\xd74=12)')");
fs.writeFileSync('js/manifold-core/test_manifold_core.js', tc, 'utf8');
console.log('test_manifold_core.js:', fs.readFileSync('js/manifold-core/test_manifold_core.js', 'utf8').includes('assertEqual(z, 12') ? 'OK' : 'FAIL');

// manifold_compiler.py: validate_dimension — portal z = x*y
const mc = fs.readFileSync('engine/manifold_compiler.py', 'utf8');
console.log('compiler cond ok (x*y*y):', mc.includes('if x * y * y != z:'));
// This one is correctly x*y*y now — but game JSONs all use z=x*y.
// The compiler SHOULD validate z=x*y to match all existing game configs and AGENTS.md.
// Revert back to x*y check.
let mc2 = mc;
mc2 = mc2.replace(
  'Validate that z == x * y\u00b2  (universal access rule).',
  'Validate that z == x * y  (universal access rule).'
);
mc2 = mc2.replace('    if x * y * y != z:', '    if x * y != z:');
mc2 = mc2.replace(
  'f"[{game_id}] z \u2260 x*y\u00b2: {z} \u2260 {x}*{y}\u00b2 = {x*y*y}  (violates z = xy\u00b2 axiom)"',
  'f"[{game_id}] z \u2260 x*y: {z} \u2260 {x}*{y} = {x*y}  (violates z = xy axiom)"'
);
mc2 = mc2.replace(
  '    z = x * y\u00b2  (universal access rule)\r\n    Every game must declare x, y, z and satisfy z == x * y\u00b2',
  '    z = x * y  (universal access rule)\r\n    Every game must declare x, y, z and satisfy z == x * y'
);
fs.writeFileSync('engine/manifold_compiler.py', mc2, 'utf8');
const mc3 = fs.readFileSync('engine/manifold_compiler.py', 'utf8');
console.log('compiler cond reverted (x*y):', mc3.includes('if x * y != z:') && !mc3.includes('if x * y * y'));
console.log('compiler msg reverted:       ', mc3.includes('violates z = xy axiom'));
