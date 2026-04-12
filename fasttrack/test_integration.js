#!/usr/bin/env node

/**
 * Integration Test - Verify all substrates work together
 */

const fs = require('fs');
const path = require('path');

// Create minimal global environment
global.window = {};
global.console = console;
global.localStorage = {
    _data: {},
    setItem(key, value) { this._data[key] = value; },
    getItem(key) { return this._data[key] || null; }
};

// Load all substrates in order
console.log('Loading substrates...\n');

const validationCode = fs.readFileSync(path.join(__dirname, 'validation_substrate.js'), 'utf8');
eval(validationCode);

const eventCode = fs.readFileSync(path.join(__dirname, 'event_substrate.js'), 'utf8');
eval(eventCode);

const stateCode = fs.readFileSync(path.join(__dirname, 'state_substrate.js'), 'utf8');
eval(stateCode);

const arrayCode = fs.readFileSync(path.join(__dirname, 'array_substrate.js'), 'utf8');
eval(arrayCode);

const manifoldCode = fs.readFileSync(path.join(__dirname, 'substrate_manifold.js'), 'utf8');
eval(manifoldCode);

console.log('\n' + '='.repeat(60));
console.log('🧪 Integration Test - All Substrates');
console.log('='.repeat(60) + '\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

// Test 1: All substrates loaded
test('All substrates loaded', () => {
    if (!global.window.ValidationSubstrate) throw new Error('ValidationSubstrate not loaded');
    if (!global.window.EventSubstrate) throw new Error('EventSubstrate not loaded');
    if (!global.window.StateSubstrate) throw new Error('StateSubstrate not loaded');
    if (!global.window.ArraySubstrate) throw new Error('ArraySubstrate not loaded');
    if (!global.window.SubstrateManifold) throw new Error('SubstrateManifold not loaded');
});

// Test 2: SubstrateManifold auto-registered all substrates
test('SubstrateManifold auto-registered substrates', () => {
    const stats = global.window.SubstrateManifold.getStats();
    if (stats.totalSubstrates !== 4) {
        throw new Error(`Expected 4 substrates, got ${stats.totalSubstrates}`);
    }
});

// Test 3: ValidationSubstrate works
test('ValidationSubstrate validates data', () => {
    const result = global.window.ValidationSubstrate.game.validateMove({
        pegId: 1,
        toHoleId: 5,
        steps: 3
    });
    if (!result.valid) throw new Error('Valid move rejected');
});

// Test 4: EventSubstrate works
test('EventSubstrate handles events', () => {
    let triggered = false;
    const id = global.window.EventSubstrate.subscribe('test:event', () => {
        triggered = true;
    });
    global.window.EventSubstrate.emit('test:event');
    global.window.EventSubstrate.unsubscribe(id);
    if (!triggered) throw new Error('Event not triggered');
});

// Test 5: StateSubstrate works
test('StateSubstrate manages state', () => {
    global.window.StateSubstrate.set('testKey', 'testValue');
    const value = global.window.StateSubstrate.get('testKey');
    if (value !== 'testValue') throw new Error('State not stored correctly');
});

// Test 6: ArraySubstrate works
test('ArraySubstrate processes arrays', () => {
    const arr = [1, 2, 3, 4, 5];
    const filtered = global.window.ArraySubstrate.filter(arr, x => x > 2);
    if (filtered.length !== 3) throw new Error('Filter failed');
});

// Test 7: SubstrateManifold can invoke substrates
test('SubstrateManifold invokes substrates', () => {
    const substrate = global.window.SubstrateManifold.get('Universal Validation Substrate');
    if (!substrate) throw new Error('Could not get substrate from manifold');
});

// Test 8: SubstrateManifold flow works
test('SubstrateManifold flow executes', () => {
    const flow = global.window.SubstrateManifold.flow([
        { 
            substrate: 'Universal Array Substrate - Dimensional Computing',
            method: 'filter',
            layer: 7,
            args: [x => x > 2]
        }
    ]);
    const result = flow.execute([1, 2, 3, 4, 5]);
    if (result.length !== 3) throw new Error('Flow execution failed');
});

// Test 9: Substrates have correct layers
test('Substrates mapped to correct layers', () => {
    const validation = global.window.SubstrateManifold.getPoint('Universal Validation Substrate');
    const event = global.window.SubstrateManifold.getPoint('Universal Event Substrate');
    const state = global.window.SubstrateManifold.getPoint('Universal State Substrate');
    const array = global.window.SubstrateManifold.getPoint('Universal Array Substrate - Dimensional Computing');
    
    if (validation.layer !== 3) throw new Error('ValidationSubstrate wrong layer');
    if (event.layer !== 2) throw new Error('EventSubstrate wrong layer');
    if (state.layer !== 5) throw new Error('StateSubstrate wrong layer');
    if (array.layer !== 7) throw new Error('ArraySubstrate wrong layer');
});

// Test 10: Dimensional operations work
test('Dimensional operations (z=x·y)', () => {
    const arr = [10, 20, 30];
    const manifold = global.window.ArraySubstrate.toManifold(arr);
    
    if (manifold[0].z !== 0) throw new Error('z coordinate wrong for index 0');
    if (manifold[1].z !== 20) throw new Error('z coordinate wrong for index 1');
    if (manifold[2].z !== 60) throw new Error('z coordinate wrong for index 2');
});

console.log('\n' + '='.repeat(60));
console.log('📊 Integration Test Results');
console.log('='.repeat(60));
console.log(`Total Tests:  ${passed + failed}`);
console.log(`Passed:       ${passed} ✅`);
console.log(`Failed:       ${failed} ${failed > 0 ? '❌' : ''}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (failed === 0) {
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED!\n');
    console.log('FastTrack game is ready with dimensional computing framework.\n');
    
    // Show manifold visualization
    console.log(global.window.SubstrateManifold.visualize());
    
    process.exit(0);
} else {
    console.log('\n⚠️  SOME INTEGRATION TESTS FAILED\n');
    process.exit(1);
}
