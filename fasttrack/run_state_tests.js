#!/usr/bin/env node

/**
 * StateSubstrate Test Runner
 * Runs tests and outputs metrics
 */

const fs = require('fs');
const path = require('path');

// Create minimal global environment
global.window = {};
global.console = console;
global.localStorage = {
    _data: {},
    setItem(key, value) { this._data[key] = value; },
    getItem(key) { return this._data[key] || null; },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = {}; }
};

// Load the substrate
const substrateCode = fs.readFileSync(path.join(__dirname, 'state_substrate.js'), 'utf8');
eval(substrateCode);

const StateSubstrate = global.window.StateSubstrate;

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

console.log('\n🧪 StateSubstrate Test Suite\n');
console.log('='.repeat(60));

// ============================================================
// TEST SUITE
// ============================================================

console.log('\n📋 1. Basic State Management\n');

await test('StateSubstrate exists', () => {
    assert(typeof StateSubstrate === 'object', 'StateSubstrate not found');
    assert(StateSubstrate.version === '1.0.0', 'Wrong version');
    return { pass: true, message: 'Version: ' + StateSubstrate.version };
});

await test('set() and get() work', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('testKey', 'testValue');
    const value = StateSubstrate.get('testKey');
    
    assert(value === 'testValue', 'Should get correct value');
    return { pass: true };
});

await test('get() returns default for missing key', () => {
    StateSubstrate.clear(true);
    
    const value = StateSubstrate.get('nonexistent', 'default');
    assert(value === 'default', 'Should return default value');
    return { pass: true };
});

await test('has() checks key existence', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('exists', true);
    
    assert(StateSubstrate.has('exists') === true, 'Should return true for existing key');
    assert(StateSubstrate.has('missing') === false, 'Should return false for missing key');
    return { pass: true };
});

await test('delete() removes key', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('toDelete', 'value');
    assert(StateSubstrate.has('toDelete') === true, 'Key should exist');
    
    const deleted = StateSubstrate.delete('toDelete');
    assert(deleted === true, 'Should return true');
    assert(StateSubstrate.has('toDelete') === false, 'Key should be deleted');
    return { pass: true };
});

await test('clear() removes all state', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('key1', 'value1');
    StateSubstrate.set('key2', 'value2');
    
    StateSubstrate.clear(true);
    
    assert(StateSubstrate.has('key1') === false, 'key1 should be cleared');
    assert(StateSubstrate.has('key2') === false, 'key2 should be cleared');
    return { pass: true };
});

console.log('\n📋 2. Batch Operations\n');

await test('getAll() returns all state', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('a', 1);
    StateSubstrate.set('b', 2);
    StateSubstrate.set('c', 3);
    
    const all = StateSubstrate.getAll();
    
    assert(all.a === 1, 'Should have a');
    assert(all.b === 2, 'Should have b');
    assert(all.c === 3, 'Should have c');
    return { pass: true, message: JSON.stringify(all) };
});

await test('setAll() sets multiple values', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.setAll({
        x: 10,
        y: 20,
        z: 30
    }, true);
    
    assert(StateSubstrate.get('x') === 10, 'Should set x');
    assert(StateSubstrate.get('y') === 20, 'Should set y');
    assert(StateSubstrate.get('z') === 30, 'Should set z');
    return { pass: true };
});

console.log('\n📋 3. Event Listeners\n');

await test('on() listens for changes', () => {
    StateSubstrate.clear(true);
    
    let received = null;
    StateSubstrate.on('change:test', (data) => {
        received = data;
    });
    
    StateSubstrate.set('test', 'value');
    
    assert(received !== null, 'Should receive event');
    assert(received.newValue === 'value', 'Should receive new value');
    return { pass: true };
});

await test('off() removes listener', () => {
    StateSubstrate.clear(true);
    
    let callCount = 0;
    const id = StateSubstrate.on('change:counter', () => {
        callCount++;
    });
    
    StateSubstrate.set('counter', 1);
    assert(callCount === 1, 'Should call once');
    
    StateSubstrate.off(id);
    StateSubstrate.set('counter', 2);
    assert(callCount === 1, 'Should not call after removal');
    
    return { pass: true };
});

await test('once() auto-removes after first trigger', () => {
    StateSubstrate.clear(true);
    
    let callCount = 0;
    StateSubstrate.once('change:once', () => {
        callCount++;
    });
    
    StateSubstrate.set('once', 1);
    assert(callCount === 1, 'Should call once');
    
    StateSubstrate.set('once', 2);
    assert(callCount === 1, 'Should not call second time');
    
    return { pass: true };
});

await test('watch() monitors multiple keys', () => {
    StateSubstrate.clear(true);
    
    let changeCount = 0;
    const ids = StateSubstrate.watch(['a', 'b', 'c'], () => {
        changeCount++;
    });
    
    StateSubstrate.set('a', 1);
    StateSubstrate.set('b', 2);
    StateSubstrate.set('c', 3);
    
    assert(changeCount === 3, 'Should call for each change');
    
    StateSubstrate.unwatch(ids);
    return { pass: true, message: `Watched 3 keys, got ${changeCount} changes` };
});

console.log('\n📋 4. Computed State\n');

await test('computed() creates reactive value', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('width', 10, true);
    StateSubstrate.set('height', 5, true);
    
    StateSubstrate.computed('area', (state) => {
        return state.get('width') * state.get('height');
    }, ['width', 'height']);
    
    assert(StateSubstrate.get('area') === 50, 'Initial computed value should be 50');
    
    StateSubstrate.set('width', 20);
    assert(StateSubstrate.get('area') === 100, 'Should recompute when width changes');
    
    StateSubstrate.set('height', 10);
    assert(StateSubstrate.get('area') === 200, 'Should recompute when height changes');
    
    return { pass: true, message: 'Computed area: 200' };
});

console.log('\n📋 5. History & Snapshots\n');

await test('History records changes', () => {
    StateSubstrate.clear(true);
    StateSubstrate.clearHistory();
    
    StateSubstrate.set('a', 1);
    StateSubstrate.set('b', 2);
    StateSubstrate.delete('a');
    
    const history = StateSubstrate.getHistory(10);
    
    assert(history.length === 3, `Should have 3 history entries, got ${history.length}`);
    assert(history[0].action === 'set', 'First action should be set');
    assert(history[2].action === 'delete', 'Last action should be delete');
    
    return { pass: true, message: `${history.length} history entries` };
});

await test('snapshot() and restore() work', () => {
    StateSubstrate.clear(true);
    
    StateSubstrate.set('x', 100, true);
    StateSubstrate.set('y', 200, true);
    
    const snapshot = StateSubstrate.snapshot();
    
    StateSubstrate.set('x', 999, true);
    StateSubstrate.set('y', 888, true);
    
    assert(StateSubstrate.get('x') === 999, 'x should be changed');
    
    StateSubstrate.restore(snapshot, true);
    
    assert(StateSubstrate.get('x') === 100, 'x should be restored');
    assert(StateSubstrate.get('y') === 200, 'y should be restored');
    
    return { pass: true };
});

console.log('\n📋 6. Persistence\n');

await test('save() and load() work', () => {
    StateSubstrate.clear(true);
    global.localStorage.clear();
    
    StateSubstrate.set('saved1', 'value1', true);
    StateSubstrate.set('saved2', 'value2', true);
    
    const saved = StateSubstrate.save('test_state');
    assert(saved === true, 'Should save successfully');
    
    StateSubstrate.clear(true);
    assert(StateSubstrate.has('saved1') === false, 'State should be cleared');
    
    const loaded = StateSubstrate.load('test_state');
    assert(loaded === true, 'Should load successfully');
    assert(StateSubstrate.get('saved1') === 'value1', 'Should restore saved1');
    assert(StateSubstrate.get('saved2') === 'value2', 'Should restore saved2');
    
    return { pass: true };
});

await test('save() with specific keys', () => {
    StateSubstrate.clear(true);
    global.localStorage.clear();
    
    StateSubstrate.set('keep', 'yes', true);
    StateSubstrate.set('skip', 'no', true);
    
    StateSubstrate.save('partial_state', ['keep']);
    
    StateSubstrate.clear(true);
    StateSubstrate.load('partial_state');
    
    assert(StateSubstrate.has('keep') === true, 'Should have keep');
    assert(StateSubstrate.has('skip') === false, 'Should not have skip');
    
    return { pass: true };
});

console.log('\n📋 7. Utility Methods\n');

await test('getStats() returns correct counts', () => {
    StateSubstrate.clear(true);
    StateSubstrate.clearHistory();
    
    // Clear all listeners from previous tests
    StateSubstrate._listeners.clear();
    
    StateSubstrate.set('a', 1, true);
    StateSubstrate.set('b', 2, true);
    StateSubstrate.set('c', 3, true);
    
    const id1 = StateSubstrate.on('change', () => {});
    const id2 = StateSubstrate.on('change:a', () => {});
    
    const stats = StateSubstrate.getStats();
    
    assert(stats.keys === 3, `Should have 3 keys, got ${stats.keys}`);
    assert(stats.listeners === 2, `Should have 2 listeners, got ${stats.listeners}`);
    
    StateSubstrate.off(id1);
    StateSubstrate.off(id2);
    
    return { pass: true, message: JSON.stringify(stats) };
});

console.log('\n📋 8. Real-World Usage\n');

await test('Game state management', () => {
    StateSubstrate.clear(true);
    
    // Set up game state
    StateSubstrate.set('phase', 'draw', true);
    StateSubstrate.set('currentPlayer', 0, true);
    StateSubstrate.set('turnCount', 1, true);
    
    // Listen for phase changes
    let phaseChanges = 0;
    StateSubstrate.on('change:phase', () => {
        phaseChanges++;
    });
    
    // Simulate game flow
    StateSubstrate.set('phase', 'play');
    assert(StateSubstrate.get('phase') === 'play', 'Phase should change');
    assert(phaseChanges === 1, 'Should trigger phase change event');
    
    StateSubstrate.set('phase', 'animate');
    StateSubstrate.set('phase', 'resolve');
    
    assert(phaseChanges === 3, 'Should track all phase changes');
    
    return { pass: true, message: `${phaseChanges} phase changes tracked` };
});

await test('Reactive UI updates', () => {
    StateSubstrate.clear(true);
    
    // Simulate score tracking
    StateSubstrate.set('player1Score', 0, true);
    StateSubstrate.set('player2Score', 0, true);
    
    // Computed total score
    StateSubstrate.computed('totalScore', (state) => {
        return state.get('player1Score') + state.get('player2Score');
    }, ['player1Score', 'player2Score']);
    
    assert(StateSubstrate.get('totalScore') === 0, 'Initial total should be 0');
    
    StateSubstrate.set('player1Score', 10);
    assert(StateSubstrate.get('totalScore') === 10, 'Total should update');
    
    StateSubstrate.set('player2Score', 15);
    assert(StateSubstrate.get('totalScore') === 25, 'Total should be 25');
    
    return { pass: true, message: 'Reactive total: 25' };
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
    console.log('StateSubstrate is ready for production use.');
    console.log('Zero duplication achieved for state management.\n');
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
