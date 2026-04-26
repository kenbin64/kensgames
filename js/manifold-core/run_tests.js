/**
 * Test Runner - Loads all manifold core modules and runs tests
 * Run: cd /var/www/kensgames.com && node js/manifold-core/run_tests.js
 */

const path = require('path');

// Load all manifold core modules
const coreDir = __dirname;

console.log('Loading manifold core modules...\n');

// The shim (manifold_surface.js) delegates to window.Manifold. Load the
// unified manifold first under a window stub so the shim has a target.
global.window = global.window || {};
global.Manifold = require(path.join(coreDir, '..', 'manifold.js'));
global.window.Manifold = global.Manifold;
console.log('✓ Loaded manifold.js (unified core)');

global.ManifoldSurface = require(path.join(coreDir, 'manifold_surface.js'));
console.log('✓ Loaded manifold_surface.js');

global.SubstrateBase = require(path.join(coreDir, 'substrate_base.js'));
console.log('✓ Loaded substrate_base.js');

global.SubstrateRegistry = require(path.join(coreDir, 'substrate_registry.js'));
console.log('✓ Loaded substrate_registry.js');

global.GameConfig = require(path.join(coreDir, 'game_config.js'));
console.log('✓ Loaded game_config.js');

console.log('\n');

// Now load and run tests
require(path.join(coreDir, 'test_manifold_core.js'));
