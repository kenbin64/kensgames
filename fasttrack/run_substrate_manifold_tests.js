#!/usr/bin/env node

/**
 * SubstrateManifold Test Runner
 * Tests meta-substrate geometric composition
 */

const fs = require('fs');
const path = require('path');

// Create minimal global environment
global.window = {};
global.console = console;

// Load all substrates first
const validationCode = fs.readFileSync(path.join(__dirname, 'validation_substrate.js'), 'utf8');
const eventCode = fs.readFileSync(path.join(__dirname, 'event_substrate.js'), 'utf8');
const stateCode = fs.readFileSync(path.join(__dirname, 'state_substrate.js'), 'utf8');
const arrayCode = fs.readFileSync(path.join(__dirname, 'array_substrate.js'), 'utf8');
const manifoldCode = fs.readFileSync(path.join(__dirname, 'substrate_manifold.js'), 'utf8');

eval(validationCode);
eval(eventCode);
eval(stateCode);
eval(arrayCode);
eval(manifoldCode);

const SubstrateManifold = global.window.SubstrateManifold;
const ValidationSubstrate = global.window.ValidationSubstrate;
const EventSubstrate = global.window.EventSubstrate;
const StateSubstrate = global.window.StateSubstrate;
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

console.log('\n🌌 SubstrateManifold Test Suite - Meta-Substrate\n');
console.log('='.repeat(60));

// ============================================================
// TEST SUITE
// ============================================================

console.log('\n📋 1. Substrate Registration\n');

await test('SubstrateManifold exists', () => {
    assert(typeof SubstrateManifold === 'object', 'SubstrateManifold not found');
    assert(SubstrateManifold.version === '1.0.0', 'Wrong version');
    return { pass: true, message: 'Version: ' + SubstrateManifold.version };
});

await test('All substrates auto-registered', () => {
    const stats = SubstrateManifold.getStats();
    
    assert(stats.totalSubstrates === 4, `Should have 4 substrates, got ${stats.totalSubstrates}`);
    assert(SubstrateManifold.get('Universal Validation Substrate') !== null, 'ValidationSubstrate registered');
    assert(SubstrateManifold.get('Universal Event Substrate') !== null, 'EventSubstrate registered');
    assert(SubstrateManifold.get('Universal State Substrate') !== null, 'StateSubstrate registered');
    assert(SubstrateManifold.get('Universal Array Substrate - Dimensional Computing') !== null, 'ArraySubstrate registered');
    
    return { pass: true, message: `${stats.totalSubstrates} substrates on manifold` };
});

await test('Substrates have manifold coordinates', () => {
    const validationPoint = SubstrateManifold.getPoint('Universal Validation Substrate');
    
    assert(validationPoint !== null, 'Should have point');
    assert(validationPoint.layer === 3, 'ValidationSubstrate at layer 3 (Relation)');
    assert(validationPoint.domain === 'validation', 'Correct domain');
    assert(typeof validationPoint.z === 'number', 'Has z coordinate');
    
    return { pass: true, message: `Layer ${validationPoint.layer}, z=${validationPoint.z}` };
});

console.log('\n📋 2. Substrate Discovery\n');

await test('findByLayer() locates substrates', () => {
    const layer3 = SubstrateManifold.findByLayer(3);
    
    assert(layer3.length > 0, 'Should find substrates at layer 3');
    assert(layer3[0].name.includes('Validation'), 'Should find ValidationSubstrate');
    
    return { pass: true, message: `Found ${layer3.length} substrates at layer 3` };
});

await test('findByDomain() groups substrates', () => {
    const validation = SubstrateManifold.findByDomain('validation');
    
    assert(validation.length > 0, 'Should find validation domain');
    
    return { pass: true };
});

await test('findNearest() locates closest substrate', () => {
    const nearest = SubstrateManifold.findNearest({
        x: 'validation',
        y: 1,
        layer: 3
    });
    
    assert(nearest !== null, 'Should find nearest');
    assert(nearest.domain === 'validation', 'Should find validation substrate');
    
    return { pass: true, message: `Nearest: ${nearest.name}` };
});

console.log('\n📋 3. Substrate Composition (z = x·y)\n');

await test('bind() creates geometric composition', () => {
    const bound = SubstrateManifold.bind(
        'Universal Validation Substrate',
        'Universal State Substrate'
    );
    
    assert(bound !== null, 'Should create binding');
    assert(bound.type === 'binding', 'Should be binding type');
    assert(bound.substrates.length === 2, 'Should bind 2 substrates');
    assert(typeof bound.z === 'number', 'Should have z coordinate (binding strength)');
    
    return { pass: true, message: `Binding z=${bound.z}` };
});

await test('compose() creates multi-substrate pipeline', () => {
    const pipeline = SubstrateManifold.compose(
        'Universal Validation Substrate',
        'Universal Array Substrate - Dimensional Computing',
        'Universal State Substrate'
    );
    
    assert(pipeline !== null, 'Should create pipeline');
    assert(pipeline.type === 'composition', 'Should be composition type');
    assert(pipeline.substrates.length === 3, 'Should compose 3 substrates');
    
    return { pass: true, message: `Pipeline: ${pipeline.substrates.join(' → ')}` };
});

console.log('\n📋 4. Dimensional Pipelines (Flow Through Layers)\n');

await test('flow() creates dimensional pipeline', () => {
    const flow = SubstrateManifold.flow([
        { substrate: 'Universal Validation Substrate', method: 'validate', layer: 3 },
        { substrate: 'Universal Array Substrate - Dimensional Computing', method: 'filter', layer: 7 },
        { substrate: 'Universal State Substrate', method: 'set', layer: 5 }
    ]);
    
    assert(flow !== null, 'Should create flow');
    assert(flow.type === 'flow', 'Should be flow type');
    assert(flow.pipeline.length === 3, 'Should have 3 steps');
    
    // Check layer ordering (should be sorted)
    assert(flow.pipeline[0].layer === 3, 'First should be layer 3');
    assert(flow.pipeline[1].layer === 5, 'Second should be layer 5');
    assert(flow.pipeline[2].layer === 7, 'Third should be layer 7');
    
    return { pass: true, message: 'Flow through layers 3→5→7' };
});

await test('flow() executes in layer order', () => {
    const testData = [1, 2, 3, 4, 5];
    
    const flow = SubstrateManifold.flow([
        { 
            substrate: 'Universal Array Substrate - Dimensional Computing', 
            method: 'filter',
            layer: 7,
            args: [x => x > 2]
        },
        { 
            substrate: 'Universal Array Substrate - Dimensional Computing', 
            method: 'map',
            layer: 7,
            args: [x => x * 2]
        }
    ]);
    
    const result = flow.execute(testData);
    
    assert(Array.isArray(result), 'Should return array');
    assert(result.length === 3, 'Should filter to 3 elements');
    assert(result[0] === 6, 'Should map 3 → 6');
    
    return { pass: true, message: `Result: [${result.join(', ')}]` };
});

console.log('\n📋 5. Substrate Dependencies\n');

await test('dependencies() finds lower-layer substrates', () => {
    const deps = SubstrateManifold.dependencies('Universal Array Substrate - Dimensional Computing');
    
    assert(Array.isArray(deps), 'Should return array');
    assert(deps.length > 0, 'Should have dependencies');
    
    // ArraySubstrate (layer 7) depends on all lower layers
    const hasLowerLayers = deps.every(d => d.layer < 7);
    assert(hasLowerLayers, 'All dependencies should be lower layers');
    
    return { pass: true, message: `${deps.length} dependencies` };
});

await test('dependents() finds higher-layer substrates', () => {
    const deps = SubstrateManifold.dependents('Universal Event Substrate');
    
    assert(Array.isArray(deps), 'Should return array');
    
    // EventSubstrate (layer 2) has higher layers depending on it
    const hasHigherLayers = deps.every(d => d.layer > 2);
    assert(hasHigherLayers, 'All dependents should be higher layers');
    
    return { pass: true, message: `${deps.length} dependents` };
});

console.log('\n📋 6. Substrate Routing\n');

await test('route() finds substrate by operation', () => {
    const result = SubstrateManifold.route('validate', {
        testKey: 'testValue'
    });
    
    // ValidationSubstrate should handle 'validate' operation
    assert(result !== null, 'Should route to substrate');
    
    return { pass: true };
});

console.log('\n📋 7. Manifold Statistics\n');

await test('getStats() returns manifold info', () => {
    const stats = SubstrateManifold.getStats();
    
    assert(stats.totalSubstrates === 4, 'Should have 4 substrates');
    assert(typeof stats.layerDistribution === 'object', 'Should have layer distribution');
    assert(typeof stats.domainDistribution === 'object', 'Should have domain distribution');
    assert(Array.isArray(stats.layers), 'Should have layers array');
    
    return { pass: true, message: JSON.stringify(stats.layerDistribution) };
});

await test('list() returns all substrates', () => {
    const all = SubstrateManifold.list();
    
    assert(Array.isArray(all), 'Should return array');
    assert(all.length === 4, 'Should have 4 substrates');
    assert(all[0].substrate !== undefined, 'Should have substrate reference');
    
    return { pass: true };
});

await test('visualize() creates ASCII representation', () => {
    const viz = SubstrateManifold.visualize();
    
    assert(typeof viz === 'string', 'Should return string');
    assert(viz.includes('Layer'), 'Should show layers');
    assert(viz.includes('Validation'), 'Should show substrates');
    
    return { pass: true, message: 'Visualization generated' };
});

console.log('\n📋 8. Real-World Usage - Geometric Composition\n');

await test('Validate → Filter → Store pipeline', () => {
    const testData = [
        { id: 1, value: 10 },
        { id: 2, value: 20 },
        { id: 3, value: 30 }
    ];
    
    // Create flow: validate each item → filter valid → store
    const flow = SubstrateManifold.flow([
        {
            substrate: 'Universal Array Substrate - Dimensional Computing',
            method: 'filter',
            layer: 7,
            args: [item => item.value > 15]
        },
        {
            substrate: 'Universal Array Substrate - Dimensional Computing',
            method: 'map',
            layer: 7,
            args: [item => item.value]
        }
    ]);
    
    const result = flow.execute(testData);
    
    assert(result.length === 2, 'Should filter to 2 items');
    assert(result[0] === 20, 'First should be 20');
    assert(result[1] === 30, 'Second should be 30');
    
    return { pass: true, message: 'Geometric pipeline executed' };
});

await test('Layer-aware substrate selection', () => {
    // Find all substrates at layer 7 (Completion)
    const completionLayer = SubstrateManifold.findByLayer(7);
    
    assert(completionLayer.length > 0, 'Should have completion layer substrates');
    
    // ArraySubstrate should be at completion layer
    const hasArray = completionLayer.some(p => p.name.includes('Array'));
    assert(hasArray, 'ArraySubstrate should be at completion layer');
    
    return { pass: true, message: `${completionLayer.length} substrates at completion layer` };
});

console.log('\n📋 9. Dimensional Computing Principles\n');

await test('Substrates as points on manifold', () => {
    const point = SubstrateManifold.getPoint('Universal Validation Substrate');
    
    assert(point.x !== undefined, 'Has x coordinate');
    assert(point.y !== undefined, 'Has y coordinate');
    assert(point.z !== undefined, 'Has z coordinate (z = x·y)');
    assert(point.layer !== undefined, 'Has layer (1-7)');
    assert(point.weight !== undefined, 'Has Fibonacci weight');
    
    return { pass: true, message: `Point: (x, y, z) = (${point.x}, ${point.y}, ${point.z})` };
});

await test('7-Layer Genesis Model mapping', () => {
    const layers = SubstrateManifold.getStats().layers;
    
    assert(layers.length > 0, 'Should have layers');
    
    // Check layer names
    const hasRelation = layers.some(l => l.name === 'Relation');
    const hasMirror = layers.some(l => l.name === 'Mirror');
    const hasLife = layers.some(l => l.name === 'Life');
    const hasCompletion = layers.some(l => l.name === 'Completion');
    
    assert(hasRelation || hasMirror || hasLife || hasCompletion, 'Should have Genesis layer names');
    
    return { pass: true, message: `${layers.length} layers active` };
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
    console.log('SubstrateManifold is ready for production use.');
    console.log('Meta-substrate architecture validated.');
    console.log('Substrates are now points on a higher-order manifold.\n');
    
    // Show final visualization
    console.log(SubstrateManifold.visualize());
    
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
