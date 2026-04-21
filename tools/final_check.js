const fs = require('fs');

const mj = fs.readFileSync('js/manifold.js', 'utf8');
console.log('manifold.js:');
console.log('  surfaceAt fn:    ', mj.includes('surfaceAt: _surface'));
console.log('  surface obj:     ', mj.includes('surface: { gyroid'));
console.log('  distance uses _z:', mj.includes('_z(ax, ay)'));
console.log('  write emits:     ', mj.includes("_emit('write'"));

const ms = fs.readFileSync('js/manifold_core/manifold_surface.js', 'utf8');
console.log('manifold_surface.js:');
console.log('  calculateZ x*y:  ', ms.includes('return x * y;'));

const sb = fs.readFileSync('js/manifold_core/substrate_base.js', 'utf8');
console.log('substrate_base.js:');
console.log('  write-invalidated:', sb.includes("manifold.on('write'"));
console.log('  no Date.now():    ', !sb.includes('Date.now'));
console.log('  _hash method:     ', sb.includes('_hash(coord)'));

const mc = fs.readFileSync('engine/manifold_compiler.py', 'utf8');
console.log('manifold_compiler.py:');
console.log('  z=x*y check:     ', mc.includes('if x * y != z:'));
console.log('  no x*y*y:        ', !mc.includes('x * y * y'));

const co = fs.readFileSync('engine/manifold_core.py', 'utf8');
console.log('manifold_core.py:');
console.log('  co_names check:  ', co.includes('_unknown = set(code.co_names)'));
console.log('  NPC no registry: ', co.includes('avoid polluting'));

const ex = fs.readFileSync('engine/export_three.py', 'utf8');
console.log('export_three.py:');
console.log('  pre-alloc:       ', ex.includes('n_quads   = res * res'));
console.log('  no extend():     ', !ex.includes('vertices.extend'));
console.log('  immut sign:      ', ex.includes('return {**payload'));
