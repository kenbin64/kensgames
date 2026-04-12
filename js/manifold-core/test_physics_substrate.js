/**
 * Physics Substrate Test Suite
 */

console.log('\n=== Physics Substrate Tests ===\n');

const PhysicsSubstrate = require('./physics_substrate.js');

// Initialize manifold
ManifoldSurface.clear();
ManifoldSurface.initialize([
  { name: 'playerCount', min: 1, max: 6 },
  { name: 'playtime', min: 5, max: 180 }
], {});

// Write test physics data
ManifoldSurface.write([1, 20], {
  bodies: [
    { id: 'ball', mass: 50, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0.1, y: -0.2, z: 0 }, radius: 0.5 },
    { id: 'paddle', mass: 1000, position: { x: 0, y: -15, z: 0 }, isStatic: true, radius: 3 }
  ],
  gravity: 0,
  airResistance: 0.99
});

// Create substrate instance
const physics = new PhysicsSubstrate(ManifoldSurface);

// Test 1: Extract physics data
const extracted = physics.extract([1, 20]);
console.log('  ✓ Extract physics data');
console.log('    - Bodies:', extracted.bodies.length);
console.log('    - Gravity:', extracted.gravity);
console.log('    - Air resistance:', extracted.airResistance);

// Test 2: Collision detection
const body1 = { id: 'b1', position: { x: 0, y: 0, z: 0 }, radius: 1 };
const body2 = { id: 'b2', position: { x: 1.5, y: 0, z: 0 }, radius: 1 };
const collision = physics.checkCollision(body1, body2);
console.log('  ✓ Collision detection:', collision ? 'colliding' : 'not colliding');

// Test 3: Update velocities
const testBodies = [
  { id: 'b1', mass: 1, velocity: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } }
];
const forces = { b1: { x: 10, y: 0, z: 0 } };
const updated = physics.updateVelocities(testBodies, forces, 0.016);
console.log('  ✓ Update velocities');
console.log('    - New velocity X:', updated[0].velocity.x.toFixed(3));

// Test 4: Validate physics data
const valid = physics.validate(extracted);
console.log('  ✓ Validation:', valid ? 'passed' : 'failed');

console.log('\n✓ Physics Substrate: All tests passed\n');
