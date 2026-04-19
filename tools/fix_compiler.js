const fs = require('fs');
let c = fs.readFileSync('engine/manifold_compiler.py', 'utf8');

// Fix 1: docstring
c = c.replace(
  'Validate that z == x * y (universal access rule).',
  'Validate that z == x * y\u00b2  (universal access rule).'
);

// Fix 2: condition
c = c.replace('    if x * y != z:\r\n', '    if x * y * y != z:\r\n');

// Fix 3: error message — replace the two occurrences of the old formula
c = c.replace(
  'f"[{game_id}] z \u2260 x*y: {z} \u2260 {x}*{y} = {x*y}  (violates z = xy axiom)"',
  'f"[{game_id}] z \u2260 x*y\u00b2: {z} \u2260 {x}*{y}\u00b2 = {x*y*y}  (violates z = xy\u00b2 axiom)"'
);

// Fix 4: top-level module docstring axiom line
c = c.replace(
  '    z = x * y  (universal access rule)\r\n    Every game must declare x, y, z and satisfy z == x * y',
  '    z = x * y\u00b2  (universal access rule)\r\n    Every game must declare x, y, z and satisfy z == x * y\u00b2'
);

fs.writeFileSync('engine/manifold_compiler.py', c, 'utf8');

const v = fs.readFileSync('engine/manifold_compiler.py', 'utf8');
console.log('docstring axiom ok:', v.includes('x * y\u00b2  (universal'));
console.log('cond ok:           ', v.includes('if x * y * y != z:'));
console.log('msg ok:            ', v.includes('violates z = xy\u00b2 axiom'));
console.log('module doc ok:     ', v.includes('satisfy z == x * y\u00b2'));
