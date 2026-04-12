#!/usr/bin/env node

/**
 * ArraySubstrate Test Runner
 * Tests dimensional array operations
 */

const fs = require('fs');
const path = require('path');

// Create minimal global environment
global.window = {};
global.console = console;

// Load the substrate
const substrateCode = fs.readFileSync(path.join(__dirname, 'array_substrate.js'), 'utf8');
eval(substrateCode);

const ArraySubstrate = global.window.ArraySubstrate;

// Test harness
const results = [];
let passCount = 0;
let failCount = 0;

async function test(name, fn) {
    try {
        const result = await fn();
        if (result.pass) {
            passCount++;
            results.push({ name, pass: true, message: result.message });
            console.log(`✅ PASS: ${name}`);
            if (result.message) console.log(`   ${result.message}`);
        } else {
            failCount++;
            results.push({ name, pass: false, error: result.error });
            console.log(`❌ FAIL: ${name}`);
            console.log(`   ${result.error}`);
        }
    } catch (error) {
        failCount++;
        results.push({ name, pass: false, error: error.message });
        console.log(`❌ ERROR: ${name}`);
        console.log(`   ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

(async () => {

console.log('\n🧪 ArraySubstrate Test Suite - Dimensional Computing\n');
console.log('='.repeat(60));

// ============================================================
// TEST SUITE
// ============================================================

console.log('\n📋 Layer 1: SPARK - Individual Elements\n');

await test('ArraySubstrate exists', () => {
    assert(typeof ArraySubstrate === 'object', 'ArraySubstrate not found');
    assert(ArraySubstrate.version === '1.0.0', 'Wrong version');
    return { pass: true, message: 'Version: ' + ArraySubstrate.version };
});

await test('at() gets element at index', () => {
    const arr = [10, 20, 30, 40, 50];
    assert(ArraySubstrate.at(arr, 0) === 10, 'Should get first');
    assert(ArraySubstrate.at(arr, 2) === 30, 'Should get middle');
    assert(ArraySubstrate.at(arr, -1) === 50, 'Should support negative index');
    assert(ArraySubstrate.at(arr, 99, 'default') === 'default', 'Should return default');
    return { pass: true };
});

await test('first() and last() work', () => {
    const arr = [1, 2, 3, 4, 5];
    assert(ArraySubstrate.first(arr) === 1, 'First should be 1');
    assert(ArraySubstrate.last(arr) === 5, 'Last should be 5');
    return { pass: true };
});

console.log('\n📋 Layer 2: MIRROR - Pairs and Mappings\n');

await test('map() transforms array', () => {
    const arr = [1, 2, 3];
    const doubled = ArraySubstrate.map(arr, x => x * 2);
    assert(doubled[0] === 2, 'Should double first');
    assert(doubled[1] === 4, 'Should double second');
    assert(doubled[2] === 6, 'Should double third');
    return { pass: true };
});

await test('mapDimensional() adds coordinates', () => {
    const arr = [10, 20, 30];
    const dimensional = ArraySubstrate.mapDimensional(arr, ({ x, y, z, item }) => {
        return { x, y, z, item };
    });
    
    assert(dimensional[0].x === 10, 'x should be item value');
    assert(dimensional[0].y === 0, 'y should be index');
    assert(dimensional[0].z === 0, 'z should be x*y = 10*0 = 0');
    
    assert(dimensional[1].z === 20, 'z should be 20*1 = 20');
    assert(dimensional[2].z === 60, 'z should be 30*2 = 60');
    
    return { pass: true, message: 'Dimensional coordinates: z=x·y' };
});

await test('zip() pairs two arrays', () => {
    const arr1 = [1, 2, 3];
    const arr2 = ['a', 'b', 'c'];
    const zipped = ArraySubstrate.zip(arr1, arr2);
    
    assert(zipped[0][0] === 1 && zipped[0][1] === 'a', 'First pair');
    assert(zipped[1][0] === 2 && zipped[1][1] === 'b', 'Second pair');
    assert(zipped[2][0] === 3 && zipped[2][1] === 'c', 'Third pair');
    
    return { pass: true };
});

console.log('\n📋 Layer 3: RELATION - Filtering and Binding\n');

await test('filter() selects points', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const evens = ArraySubstrate.filter(arr, x => x % 2 === 0);
    
    assert(evens.length === 3, 'Should have 3 evens');
    assert(evens[0] === 2, 'First even is 2');
    assert(evens[2] === 6, 'Last even is 6');
    
    return { pass: true };
});

await test('filterActive() removes completed items', () => {
    const pegs = [
        { id: 1, completed: false },
        { id: 2, completed: true },
        { id: 3, completed: false }
    ];
    
    const active = ArraySubstrate.filterActive(pegs, 'completed');
    
    assert(active.length === 2, 'Should have 2 active');
    assert(active[0].id === 1, 'First active is id 1');
    assert(active[1].id === 3, 'Second active is id 3');
    
    return { pass: true };
});

await test('find() locates first match', () => {
    const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const found = ArraySubstrate.find(arr, item => item.id === 2);
    
    assert(found !== null, 'Should find item');
    assert(found.id === 2, 'Should find correct item');
    
    return { pass: true };
});

await test('findBy() locates by property', () => {
    const players = [
        { name: 'Alice', score: 10 },
        { name: 'Bob', score: 20 }
    ];
    
    const bob = ArraySubstrate.findBy(players, 'name', 'Bob');
    assert(bob.score === 20, 'Should find Bob');
    
    return { pass: true };
});

console.log('\n📋 Layer 4: FORM - Transformations and Shapes\n');

await test('groupBy() partitions dimension', () => {
    const items = [
        { type: 'fruit', name: 'apple' },
        { type: 'veg', name: 'carrot' },
        { type: 'fruit', name: 'banana' }
    ];
    
    const grouped = ArraySubstrate.groupBy(items, 'type');
    
    assert(grouped.fruit.length === 2, 'Should have 2 fruits');
    assert(grouped.veg.length === 1, 'Should have 1 veg');
    
    return { pass: true, message: 'Partitioned into sub-dimensions' };
});

await test('partition() splits into two', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const [evens, odds] = ArraySubstrate.partition(arr, x => x % 2 === 0);
    
    assert(evens.length === 3, 'Should have 3 evens');
    assert(odds.length === 3, 'Should have 3 odds');
    
    return { pass: true };
});

await test('chunk() divides into segments', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const chunks = ArraySubstrate.chunk(arr, 3);
    
    assert(chunks.length === 3, 'Should have 3 chunks');
    assert(chunks[0].length === 3, 'First chunk has 3');
    assert(chunks[2].length === 2, 'Last chunk has 2');
    
    return { pass: true };
});

await test('flatten() collapses dimensions', () => {
    const nested = [[1, 2], [3, 4], [5, 6]];
    const flat = ArraySubstrate.flatten(nested);
    
    assert(flat.length === 6, 'Should have 6 elements');
    assert(flat[0] === 1 && flat[5] === 6, 'Should be flattened');
    
    return { pass: true, message: 'Multi-dimensional → single dimension' };
});

console.log('\n📋 Layer 5: LIFE - Reductions and Aggregations\n');

await test('reduce() collapses to point', () => {
    const arr = [1, 2, 3, 4, 5];
    const sum = ArraySubstrate.reduce(arr, (acc, val) => acc + val, 0);
    
    assert(sum === 15, 'Sum should be 15');
    return { pass: true, message: 'Dimension collapsed to single point' };
});

await test('sum() aggregates energy', () => {
    const arr = [10, 20, 30];
    const total = ArraySubstrate.sum(arr);
    
    assert(total === 60, 'Sum should be 60');
    return { pass: true };
});

await test('average() finds center of mass', () => {
    const arr = [10, 20, 30];
    const avg = ArraySubstrate.average(arr);
    
    assert(avg === 20, 'Average should be 20');
    return { pass: true };
});

await test('min() and max() find extremes', () => {
    const arr = [5, 2, 8, 1, 9];
    
    assert(ArraySubstrate.min(arr) === 1, 'Min should be 1');
    assert(ArraySubstrate.max(arr) === 9, 'Max should be 9');
    
    return { pass: true };
});

await test('count() measures dimension', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const evenCount = ArraySubstrate.count(arr, x => x % 2 === 0);
    
    assert(evenCount === 3, 'Should count 3 evens');
    return { pass: true };
});

console.log('\n📋 Layer 6: MIND - Sorting and Coherence\n');

await test('sortBy() imposes order', () => {
    const arr = [{ val: 3 }, { val: 1 }, { val: 2 }];
    const sorted = ArraySubstrate.sortBy(arr, 'val');
    
    assert(sorted[0].val === 1, 'First should be 1');
    assert(sorted[1].val === 2, 'Second should be 2');
    assert(sorted[2].val === 3, 'Third should be 3');
    
    return { pass: true, message: 'Chaos → coherent sequence' };
});

await test('sortBy() descending order', () => {
    const arr = [1, 2, 3];
    const sorted = ArraySubstrate.sortBy(arr, x => x, true);
    
    assert(sorted[0] === 3, 'First should be 3');
    assert(sorted[2] === 1, 'Last should be 1');
    
    return { pass: true };
});

await test('unique() removes duplicates', () => {
    const arr = [1, 2, 2, 3, 3, 3, 4];
    const uniq = ArraySubstrate.unique(arr);
    
    assert(uniq.length === 4, 'Should have 4 unique');
    assert(uniq.includes(1) && uniq.includes(4), 'Should have all values');
    
    return { pass: true };
});

await test('reverse() inverts dimension', () => {
    const arr = [1, 2, 3];
    const rev = ArraySubstrate.reverse(arr);
    
    assert(rev[0] === 3 && rev[2] === 1, 'Should be reversed');
    assert(arr[0] === 1, 'Original should be unchanged');
    
    return { pass: true };
});

console.log('\n📋 Layer 7: COMPLETION - Unified Whole\n');

await test('all() checks universal truth', () => {
    const arr = [2, 4, 6, 8];
    
    assert(ArraySubstrate.all(arr, x => x % 2 === 0) === true, 'All even');
    assert(ArraySubstrate.all(arr, x => x > 10) === false, 'Not all > 10');
    
    return { pass: true };
});

await test('any() checks existential truth', () => {
    const arr = [1, 3, 5, 8];
    
    assert(ArraySubstrate.any(arr, x => x % 2 === 0) === true, 'Has even');
    assert(ArraySubstrate.any(arr, x => x > 10) === false, 'None > 10');
    
    return { pass: true };
});

await test('isEmpty() checks void', () => {
    assert(ArraySubstrate.isEmpty([]) === true, 'Empty array is void');
    assert(ArraySubstrate.isEmpty([1]) === false, 'Non-empty has existence');
    
    return { pass: true };
});

await test('clone() duplicates dimension', () => {
    const arr = [1, 2, 3];
    const copy = ArraySubstrate.clone(arr);
    
    copy[0] = 999;
    
    assert(arr[0] === 1, 'Original unchanged');
    assert(copy[0] === 999, 'Copy changed');
    
    return { pass: true };
});

console.log('\n📋 Dimensional Operations - Manifold Mathematics\n');

await test('toManifold() creates coordinates', () => {
    const arr = [10, 20, 30];
    const manifold = ArraySubstrate.toManifold(arr);
    
    assert(manifold[0].x === 0 && manifold[0].y === 10, 'First point');
    assert(manifold[0].z === 0, 'z = x·y = 0·10 = 0');
    
    assert(manifold[1].z === 20, 'z = 1·20 = 20');
    assert(manifold[2].z === 60, 'z = 2·30 = 60');
    
    return { pass: true, message: 'Points on z=x·y manifold' };
});

await test('fibonacciWeight() applies dimensional weights', () => {
    const arr = [1, 1, 1, 1, 1];
    const weighted = ArraySubstrate.fibonacciWeight(arr);
    
    assert(weighted[0].weight === 1, 'First weight is 1');
    assert(weighted[1].weight === 1, 'Second weight is 1');
    assert(weighted[2].weight === 2, 'Third weight is 2');
    assert(weighted[3].weight === 3, 'Fourth weight is 3');
    assert(weighted[4].weight === 5, 'Fifth weight is 5');
    
    return { pass: true, message: 'Fibonacci sequence: 1,1,2,3,5' };
});

await test('goldenScale() applies φ scaling', () => {
    const arr = [1, 1, 1];
    const scaled = ArraySubstrate.goldenScale(arr);
    
    const phi = 1.618033988749895;
    assert(Math.abs(scaled[0] - 1) < 0.001, 'First is 1');
    assert(Math.abs(scaled[1] - phi) < 0.001, 'Second is φ');
    assert(Math.abs(scaled[2] - phi*phi) < 0.001, 'Third is φ²');
    
    return { pass: true, message: 'Golden ratio scaling: 1, φ, φ²' };
});

await test('distance() measures dimensional separation', () => {
    const arr1 = [0, 0, 0];
    const arr2 = [3, 4, 0];
    const dist = ArraySubstrate.distance(arr1, arr2);
    
    assert(Math.abs(dist - 5) < 0.001, 'Distance should be 5 (3-4-5 triangle)');
    
    return { pass: true, message: 'Euclidean distance in n-space' };
});

console.log('\n📋 Real-World Game Usage\n');

await test('Filter active pegs (common pattern)', () => {
    const pegs = [
        { id: 1, holeId: 0, completed: false },
        { id: 2, holeId: 10, completed: true },
        { id: 3, holeId: 5, completed: false },
        { id: 4, holeId: 10, completed: true }
    ];
    
    const active = ArraySubstrate.filterActive(pegs, 'completed');
    
    assert(active.length === 2, 'Should have 2 active pegs');
    assert(active[0].id === 1, 'First active is peg 1');
    
    return { pass: true };
});

await test('Group moves by peg', () => {
    const moves = [
        { pegId: 1, toHoleId: 5 },
        { pegId: 2, toHoleId: 6 },
        { pegId: 1, toHoleId: 7 },
        { pegId: 2, toHoleId: 8 }
    ];
    
    const grouped = ArraySubstrate.groupBy(moves, 'pegId');
    
    assert(grouped[1].length === 2, 'Peg 1 has 2 moves');
    assert(grouped[2].length === 2, 'Peg 2 has 2 moves');
    
    return { pass: true };
});

await test('Sort players by score', () => {
    const players = [
        { name: 'Alice', score: 50 },
        { name: 'Bob', score: 80 },
        { name: 'Charlie', score: 30 }
    ];
    
    const sorted = ArraySubstrate.sortBy(players, 'score', true);
    
    assert(sorted[0].name === 'Bob', 'Bob should be first (highest)');
    assert(sorted[2].name === 'Charlie', 'Charlie should be last (lowest)');
    
    return { pass: true };
});

// ============================================================
// METRICS & SUMMARY
// ============================================================

const totalCount = passCount + failCount;
const successRate = ((passCount / totalCount) * 100).toFixed(1);

console.log('\n' + '='.repeat(60));
console.log('\n📊 TEST METRICS\n');
console.log('='.repeat(60));
console.log(`Total Tests:    ${totalCount}`);
console.log(`Passed:         ${passCount} ✅`);
console.log(`Failed:         ${failCount} ${failCount > 0 ? '❌' : ''}`);
console.log(`Success Rate:   ${successRate}%`);
console.log('='.repeat(60));

if (failCount === 0) {
    console.log('\n🎉 ALL TESTS PASSED!\n');
    console.log('ArraySubstrate is ready for production use.');
    console.log('Zero duplication achieved for array operations.');
    console.log('Dimensional Computing principles validated.\n');
    process.exit(0);
} else {
    console.log('\n⚠️  SOME TESTS FAILED\n');
    console.log('Failed tests:');
    results.filter(r => !r.pass).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
    });
    console.log('');
    process.exit(1);
}

})(); // Close async IIFE
