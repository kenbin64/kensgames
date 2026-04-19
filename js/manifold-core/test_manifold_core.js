/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD CORE TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for:
 * - ManifoldSurface (data storage and retrieval)
 * - SubstrateBase (lens functionality)
 * - SubstrateRegistry (registration and loading)
 * - GameConfig (coordinate mapping)
 *
 * Run: node test_manifold_core.js
 * Expected: All tests pass with green checkmarks
 */

let passCount = 0;
let failCount = 0;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function assert(condition, message) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
    passCount++;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${message}`);
    failCount++;
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function test(name, fn) {
  console.log(`\n${colors.cyan}${name}${colors.reset}`);
  try {
    fn();
  } catch (error) {
    console.log(`${colors.red}✗ ERROR:${colors.reset} ${error.message}`);
    failCount++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
console.log(`${colors.cyan}MANIFOLD CORE TEST SUITE${colors.reset}`);
console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}`);

// ─────────────────────────────────────────────────────────────────────────
// Test 1: ManifoldSurface - Write and Read
// ─────────────────────────────────────────────────────────────────────────

test('ManifoldSurface: Basic Write/Read Operations', () => {
  ManifoldSurface.clear();
  ManifoldSurface.initialize(
    [
      { name: 'playerCount', min: 1, max: 6 },
      { name: 'difficulty', type: 'enum', values: ['easy', 'hard'] }
    ],
    {}
  );

  const testData = { mass: 1200, thrust: 50 };
  const coordinate = [2, 1]; // 2 players, hard difficulty

  // Write data
  const hash = ManifoldSurface.write(coordinate, testData);
  assert(hash !== null, 'Write returns a hash');

  // Read data back
  const readData = ManifoldSurface.read(coordinate);
  assertEqual(readData.mass, 1200, 'Mass value persists');
  assertEqual(readData.thrust, 50, 'Thrust value persists');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: ManifoldSurface - Object coordinates
// ─────────────────────────────────────────────────────────────────────────

test('ManifoldSurface: Object-based Coordinates', () => {
  ManifoldSurface.clear();

  const objectCoord = { playerCount: 3, difficulty: 'easy' };
  const data = { color: 0xff0000 };

  ManifoldSurface.write(objectCoord, data);
  const readData = ManifoldSurface.read(objectCoord);

  assertEqual(readData.color, 0xff0000, 'Object-based coordinates work');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3: ManifoldSurface - Query Nearby
// ─────────────────────────────────────────────────────────────────────────

test('ManifoldSurface: Query Nearby Coordinates', () => {
  ManifoldSurface.clear();

  // Write multiple data points
  ManifoldSurface.write([1, 10], { id: 'game1' });
  ManifoldSurface.write([2, 15], { id: 'game2' });
  ManifoldSurface.write([3, 20], { id: 'game3' });
  ManifoldSurface.write([10, 50], { id: 'game4' }); // Far away

  // Query near [2, 14]
  const nearby = ManifoldSurface.queryNearby([2, 14], 10);

  assert(nearby.length >= 2, 'Returns multiple nearby entries');
  assert(nearby[0].data.id === 'game2', 'Closest entry is first');
  assert(nearby.some(e => e.data.id === 'game4') === false, 'Distant entries not included');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4: ManifoldSurface - Distance calculation
// ─────────────────────────────────────────────────────────────────────────

test('ManifoldSurface: Euclidean Distance', () => {
  const distance = ManifoldSurface.distance([0, 0], [3, 4]);
  assertEqual(distance, 5, 'Distance calculation correct (3-4-5 triangle)');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 5: ManifoldSurface - Calculate Z
// ─────────────────────────────────────────────────────────────────────────

test('ManifoldSurface: Manifold Z Calculation', () => {
  const z = ManifoldSurface.calculateZ(3, 4);
  assertEqual(z, 12, 'Z = x·y portal dimensional law (3×4=12)');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 6: SubstrateBase - Extend and Extract
// ─────────────────────────────────────────────────────────────────────────

test('SubstrateBase: Inheritance and Extract', () => {
  ManifoldSurface.clear();

  // Create a test substrate
  class TestSubstrate extends SubstrateBase {
    name() {
      return 'test-substrate';
    }

    extract(coordinate) {
      const raw = this.manifold.read(coordinate);
      return {
        name: this.name(),
        data: raw || {},
        timestamp: Date.now()
      };
    }

    getSchema() {
      return { data: 'object', timestamp: 'number' };
    }
  }

  // Write data to manifold
  ManifoldSurface.write([1, 2], { testValue: 42 });

  // Create substrate instance
  const substrate = new TestSubstrate(ManifoldSurface);

  // Extract data
  const extracted = substrate.extract([1, 2]);
  assertEqual(extracted.name, 'test-substrate', 'Substrate name correct');
  assertEqual(extracted.data.testValue, 42, 'Extracted data correct');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 7: SubstrateBase - Caching
// ─────────────────────────────────────────────────────────────────────────

test('SubstrateBase: Extract with Caching', () => {
  class CachingSubstrate extends SubstrateBase {
    name() {
      return 'caching-substrate';
    }

    extract(coordinate) {
      return { value: Math.random(), location: coordinate };
    }
  }

  const substrate = new CachingSubstrate(ManifoldSurface);

  // First call - should cache
  const result1 = substrate.extractCached([1, 2], { useCache: true, expiry: 10000 });
  // Second call - should return cached (same value)
  const result2 = substrate.extractCached([1, 2], { useCache: true, expiry: 10000 });

  assertEqual(result1.value, result2.value, 'Caching returns same value');

  // Clear cache and try again
  substrate.clearCache([1, 2]);
  const result3 = substrate.extractCached([1, 2], { useCache: true, expiry: 10000 });
  assert(result3.value !== result1.value, 'After cache clear, gets new value');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 8: SubstrateBase - Batch Extract
// ─────────────────────────────────────────────────────────────────────────

test('SubstrateBase: Batch Extract', () => {
  class BatchSubstrate extends SubstrateBase {
    name() {
      return 'batch-substrate';
    }

    extract(coordinate) {
      return { coord: coordinate.join(',') };
    }
  }

  const substrate = new BatchSubstrate(ManifoldSurface);
  const coords = [[1, 2], [3, 4], [5, 6]];
  const results = substrate.extractBatch(coords);

  assertEqual(results.length, 3, 'Batch returns correct count');
  assertEqual(results[0].coord, '1,2', 'First batch item correct');
  assertEqual(results[2].coord, '5,6', 'Last batch item correct');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 9: SubstrateRegistry - Register and Get
// ─────────────────────────────────────────────────────────────────────────

test('SubstrateRegistry: Register and Retrieve', () => {
  SubstrateRegistry.clearCache();

  class DummySubstrate extends SubstrateBase {
    name() {
      return 'dummy';
    }
  }

  // Register
  SubstrateRegistry.register('dummy', DummySubstrate);

  // Get
  const instance = SubstrateRegistry.get('dummy');
  assertEqual(instance.name(), 'dummy', 'Retrieved substrate has correct name');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 10: SubstrateRegistry - List All
// ─────────────────────────────────────────────────────────────────────────

test('SubstrateRegistry: List All Registered', () => {
  SubstrateRegistry.clearCache();

  class Sub1 extends SubstrateBase {
    name() {
      return 'sub1';
    }
  }
  class Sub2 extends SubstrateBase {
    name() {
      return 'sub2';
    }
  }

  SubstrateRegistry.register('sub1', Sub1);
  SubstrateRegistry.register('sub2', Sub2);

  const list = SubstrateRegistry.listAll();
  assert(list.includes('sub1'), 'sub1 in list');
  assert(list.includes('sub2'), 'sub2 in list');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 11: GameConfig - Register Game
// ─────────────────────────────────────────────────────────────────────────

test('GameConfig: Register and Load Game', () => {
  const games = GameConfig.listGames();
  assert(games.includes('brickbreaker3d-solo'), 'BrickBreaker Solo registered by default');
  assert(games.includes('space-combat'), 'Space Combat registered by default');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 12: GameConfig - Create Coordinate
// ─────────────────────────────────────────────────────────────────────────

test('GameConfig: Create Coordinate from Parameters', () => {
  const config = GameConfig.load('brickbreaker3d-multiplayer');
  const coord = config.createCoordinate({
    playerCount: 3,
    playtime: 25,
    skillLevel: 0.8
  });

  assertEqual(coord[0], 3, 'PlayerCount in coordinate');
  assertEqual(coord[1], 25, 'Playtime in coordinate');
  assertEqual(coord[2], 75, 'Z = 3 * 25 = 75');
  assertEqual(coord[3], 0, 'Difficulty defaults to 0 (easy)');
  assertEqual(coord[4], 0.8, 'Skill level in coordinate');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 13: GameConfig - Get Substrates
// ─────────────────────────────────────────────────────────────────────────

test('GameConfig: Get Required Substrates', () => {
  const config = GameConfig.load('space-combat');
  const substrates = config.getSubstrates();

  assert(substrates.includes('physics'), 'Physics substrate required');
  assert(substrates.includes('graphics'), 'Graphics substrate required');
  assert(substrates.includes('multiplayer'), 'Multiplayer substrate required');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 14: GameConfig - Get Dimensions
// ─────────────────────────────────────────────────────────────────────────

test('GameConfig: Get Game Dimensions', () => {
  const config = GameConfig.load('brickbreaker3d-solo');
  const dims = config.getDimensions();

  assert(dims.length > 0, 'Has dimensions');
  assert(dims.some(d => d.name === 'playerCount'), 'PlayerCount dimension exists');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 15: Integration - Full Pipeline
// ─────────────────────────────────────────────────────────────────────────

test('Integration: Full Manifold Pipeline', () => {
  ManifoldSurface.clear();
  SubstrateRegistry.clearCache();

  // 1. Initialize manifold
  ManifoldSurface.initialize(
    [
      { name: 'playerCount', min: 1, max: 6 },
      { name: 'playtime', min: 5, max: 180 }
    ],
    {}
  );

  // 2. Register a substrate
  class IntegrationSubstrate extends SubstrateBase {
    name() {
      return 'integration-test';
    }

    extract(coordinate) {
      const raw = this.manifold.read(coordinate);
      return {
        ...raw,
        processed: true
      };
    }
  }

  SubstrateRegistry.initialize(ManifoldSurface);
  SubstrateRegistry.register('integration-test', IntegrationSubstrate);

  // 3. Write data using GameConfig
  const config = GameConfig.load('brickbreaker3d-multiplayer');
  const coordinate = config.createCoordinate({
    playerCount: 4,
    playtime: 30,
    skillLevel: 0.7
  });

  ManifoldSurface.write(coordinate, { gameState: 'active' });

  // 4. Extract using substrate
  const substrate = SubstrateRegistry.get('integration-test');
  const result = substrate.extract(coordinate);

  assert(result.processed === true, 'Substrate processed data');
  assertEqual(result.gameState, 'active', 'Data retrieved correctly');
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
console.log(`${colors.cyan}TEST SUMMARY${colors.reset}`);
console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
console.log(`${colors.green}Passed: ${passCount}${colors.reset}`);
if (failCount > 0) {
  console.log(`${colors.red}Failed: ${failCount}${colors.reset}`);
} else {
  console.log(`${colors.green}Failed: 0${colors.reset}`);
}
console.log(`${'─'.repeat(70)}`);

if (failCount === 0) {
  console.log(`${colors.green}✓ ALL TESTS PASSED${colors.reset}`);
} else {
  console.log(`${colors.red}✗ SOME TESTS FAILED${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);
