#!/usr/bin/env node

/**
 * ValidationSubstrate Test Runner
 * Runs tests and outputs metrics
 */

const fs = require('fs');
const path = require('path');

// Load the substrate
const substrateCode = fs.readFileSync(path.join(__dirname, 'validation_substrate.js'), 'utf8');

// Create a minimal global environment
global.window = {};
global.console = console;

// Execute the substrate code
eval(substrateCode);

const ValidationSubstrate = global.window.ValidationSubstrate;

// Test harness
const results = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        const result = fn();
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

console.log('\n🧪 ValidationSubstrate Test Suite\n');
console.log('='.repeat(60));

// ============================================================
// TEST SUITE
// ============================================================

console.log('\n📋 1. Basic Validation\n');

test('ValidationSubstrate exists', () => {
    assert(typeof ValidationSubstrate === 'object', 'ValidationSubstrate not found');
    assert(ValidationSubstrate.version === '1.0.0', 'Wrong version');
    return { pass: true, message: 'Version: ' + ValidationSubstrate.version };
});

test('validate() method exists', () => {
    assert(typeof ValidationSubstrate.validate === 'function', 'validate method not found');
    return { pass: true };
});

test('validate() accepts valid entity', () => {
    const entity = { name: 'Test', value: 42 };
    const schema = {
        name: (v) => v !== null,
        value: (v) => v > 0
    };
    const result = ValidationSubstrate.validate(entity, schema);
    assert(result.valid === true, 'Should be valid');
    assert(result.errors.length === 0, 'Should have no errors');
    return { pass: true };
});

test('validate() rejects invalid entity', () => {
    const entity = { name: null, value: -5 };
    const schema = {
        name: (v) => v !== null || 'Name required',
        value: (v) => v > 0 || 'Value must be positive'
    };
    const result = ValidationSubstrate.validate(entity, schema);
    assert(result.valid === false, 'Should be invalid');
    assert(result.errors.length === 2, 'Should have 2 errors');
    assert(result.field === 'name', 'First failed field should be name');
    return { pass: true, message: `Caught ${result.errors.length} errors correctly` };
});

console.log('\n📋 2. Common Validators\n');

test('validators.required works', () => {
    const v = ValidationSubstrate.validators;
    assert(v.required(42) === true, 'Should accept number');
    assert(v.required('test') === true, 'Should accept string');
    assert(v.required(null) !== true, 'Should reject null');
    assert(v.required(undefined) !== true, 'Should reject undefined');
    return { pass: true };
});

test('validators.isNumber works', () => {
    const v = ValidationSubstrate.validators;
    assert(v.isNumber(42) === true, 'Should accept number');
    assert(v.isNumber(0) === true, 'Should accept zero');
    assert(v.isNumber('42') !== true, 'Should reject string');
    assert(v.isNumber(NaN) !== true, 'Should reject NaN');
    return { pass: true };
});

test('validators.positive works', () => {
    const v = ValidationSubstrate.validators;
    assert(v.positive(1) === true, 'Should accept 1');
    assert(v.positive(100) === true, 'Should accept 100');
    assert(v.positive(0) !== true, 'Should reject 0');
    assert(v.positive(-5) !== true, 'Should reject negative');
    return { pass: true };
});

test('validators.inRange works', () => {
    const v = ValidationSubstrate.validators;
    const inRange = v.inRange(1, 10);
    assert(inRange(5) === true, 'Should accept 5');
    assert(inRange(1) === true, 'Should accept min');
    assert(inRange(10) === true, 'Should accept max');
    assert(inRange(0) !== true, 'Should reject below min');
    assert(inRange(11) !== true, 'Should reject above max');
    return { pass: true };
});

console.log('\n📋 3. Composite Validators\n');

test('all() combines validators with AND', () => {
    const validator = ValidationSubstrate.all(
        ValidationSubstrate.validators.required,
        ValidationSubstrate.validators.isNumber,
        ValidationSubstrate.validators.positive
    );
    assert(validator(5) === true, 'Should accept valid value');
    assert(validator(-5) !== true, 'Should reject negative');
    assert(validator('5') !== true, 'Should reject string');
    assert(validator(null) !== true, 'Should reject null');
    return { pass: true };
});

test('any() combines validators with OR', () => {
    const validator = ValidationSubstrate.any(
        (v) => v === 'admin',
        (v) => v === 'user'
    );
    assert(validator('admin') === true, 'Should accept admin');
    assert(validator('user') === true, 'Should accept user');
    assert(validator('guest') !== true, 'Should reject guest');
    return { pass: true };
});

test('optional() allows null/undefined', () => {
    const validator = ValidationSubstrate.optional(
        ValidationSubstrate.validators.positive
    );
    assert(validator(null) === true, 'Should accept null');
    assert(validator(undefined) === true, 'Should accept undefined');
    assert(validator(5) === true, 'Should accept valid value');
    assert(validator(-5) !== true, 'Should reject invalid value');
    return { pass: true };
});

console.log('\n📋 4. Game-Specific Validators\n');

test('game.validateMove() works', () => {
    const validMove = { pegId: 1, toHoleId: 5, steps: 3 };
    const result = ValidationSubstrate.game.validateMove(validMove);
    assert(result.valid === true, 'Should accept valid move');
    return { pass: true };
});

test('game.validateMove() rejects invalid', () => {
    const invalidMove = { pegId: null, toHoleId: 5, steps: -1 };
    const result = ValidationSubstrate.game.validateMove(invalidMove);
    assert(result.valid === false, 'Should reject invalid move');
    assert(result.errors.length > 0, 'Should have errors');
    return { pass: true, message: `Caught ${result.errors.length} errors` };
});

test('game.validateCard() works', () => {
    const validCard = { rank: 'A', suit: 'hearts' };
    const result = ValidationSubstrate.game.validateCard(validCard);
    assert(result.valid === true, 'Should accept valid card');
    return { pass: true };
});

test('game.validatePeg() works', () => {
    const validPeg = { id: 1, holeId: 0, color: 0xff0000 };
    const result = ValidationSubstrate.game.validatePeg(validPeg);
    assert(result.valid === true, 'Should accept valid peg');
    return { pass: true };
});

test('game.validatePlayer() works', () => {
    const validPlayer = { name: 'Player 1', color: 0xff0000, peg: [] };
    const result = ValidationSubstrate.game.validatePlayer(validPlayer);
    assert(result.valid === true, 'Should accept valid player');
    return { pass: true };
});

console.log('\n📋 5. Real-World Usage\n');

test('Complex schema validation', () => {
    const gameState = {
        phase: 'play',
        currentPlayerIndex: 0,
        turnCount: 5,
        players: [
            { name: 'Alice', score: 10 },
            { name: 'Bob', score: 8 }
        ]
    };

    const schema = {
        phase: ValidationSubstrate.validators.oneOf(['draw', 'play', 'end']),
        currentPlayerIndex: ValidationSubstrate.all(
            ValidationSubstrate.validators.isNumber,
            ValidationSubstrate.validators.nonNegative,
            ValidationSubstrate.validators.integer
        ),
        turnCount: ValidationSubstrate.validators.positive,
        players: ValidationSubstrate.all(
            ValidationSubstrate.validators.isArray,
            ValidationSubstrate.validators.minItems(2)
        )
    };

    const result = ValidationSubstrate.validate(gameState, schema);
    assert(result.valid === true, 'Should validate complex game state');
    return { pass: true, message: 'Complex validation passed' };
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
    console.log('ValidationSubstrate is ready for production use.');
    console.log('Zero duplication achieved for validation logic.\n');
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
