/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * VALIDATION SUBSTRATE
 * Universal validation logic - works across all applications
 * 
 * PARADIGM: No duplication. Every validation exists exactly once.
 * All validation logic flows through this substrate.
 * 
 * Reusable in: FastTrack, Chess, Blog, any ButterflyFX app
 * ============================================================
 */

'use strict';

const ValidationSubstrate = {
    version: '1.0.0',
    name: 'Universal Validation Substrate',
    
    // ============================================================
    // CORE VALIDATION
    // ============================================================
    
    /**
     * Validate an entity against a schema
     * @param {Object} entity - The entity to validate
     * @param {Object} schema - Validation rules { field: validatorFn }
     * @returns {Object} { valid: boolean, errors: Array, field: string }
     */
    validate(entity, schema) {
        if (!entity) {
            return { valid: false, errors: ['Entity is null or undefined'], field: null };
        }
        
        if (!schema || typeof schema !== 'object') {
            return { valid: false, errors: ['Invalid schema'], field: null };
        }
        
        const errors = [];
        let firstFailedField = null;
        
        for (const [field, validator] of Object.entries(schema)) {
            if (typeof validator !== 'function') {
                errors.push(`Invalid validator for field: ${field}`);
                if (!firstFailedField) firstFailedField = field;
                continue;
            }
            
            const value = entity[field];
            const result = validator(value, entity);
            
            if (result !== true) {
                const errorMsg = typeof result === 'string' ? result : `Invalid ${field}`;
                errors.push(errorMsg);
                if (!firstFailedField) firstFailedField = field;
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            field: firstFailedField
        };
    },
    
    // ============================================================
    // COMMON VALIDATORS (Reusable building blocks)
    // ============================================================
    
    validators: {
        // Existence validators
        required: (value) => value !== null && value !== undefined || 'Required field',
        notNull: (value) => value !== null || 'Cannot be null',
        notUndefined: (value) => value !== undefined || 'Cannot be undefined',
        notEmpty: (value) => {
            if (value === null || value === undefined) return 'Cannot be empty';
            if (typeof value === 'string' && value.trim() === '') return 'Cannot be empty string';
            if (Array.isArray(value) && value.length === 0) return 'Cannot be empty array';
            return true;
        },
        
        // Type validators
        isString: (value) => typeof value === 'string' || 'Must be a string',
        isNumber: (value) => typeof value === 'number' && !isNaN(value) || 'Must be a number',
        isBoolean: (value) => typeof value === 'boolean' || 'Must be a boolean',
        isArray: (value) => Array.isArray(value) || 'Must be an array',
        isObject: (value) => value !== null && typeof value === 'object' && !Array.isArray(value) || 'Must be an object',
        isFunction: (value) => typeof value === 'function' || 'Must be a function',
        
        // Number validators
        positive: (value) => value > 0 || 'Must be positive',
        negative: (value) => value < 0 || 'Must be negative',
        nonNegative: (value) => value >= 0 || 'Must be non-negative',
        integer: (value) => Number.isInteger(value) || 'Must be an integer',
        inRange: (min, max) => (value) => (value >= min && value <= max) || `Must be between ${min} and ${max}`,
        
        // String validators
        minLength: (min) => (value) => value.length >= min || `Must be at least ${min} characters`,
        maxLength: (max) => (value) => value.length <= max || `Must be at most ${max} characters`,
        matches: (pattern) => (value) => pattern.test(value) || 'Invalid format',
        
        // Array validators
        minItems: (min) => (value) => value.length >= min || `Must have at least ${min} items`,
        maxItems: (max) => (value) => value.length <= max || `Must have at most ${max} items`,
        
        // Custom validators
        oneOf: (allowedValues) => (value) => allowedValues.includes(value) || `Must be one of: ${allowedValues.join(', ')}`,
        custom: (fn) => fn
    },
    
    // ============================================================
    // COMPOSITE VALIDATORS (Combine multiple validators)
    // ============================================================
    
    /**
     * Combine multiple validators with AND logic
     * All validators must pass
     */
    all(...validators) {
        return (value, entity) => {
            for (const validator of validators) {
                const result = validator(value, entity);
                if (result !== true) return result;
            }
            return true;
        };
    },
    
    /**
     * Combine multiple validators with OR logic
     * At least one validator must pass
     */
    any(...validators) {
        return (value, entity) => {
            const errors = [];
            for (const validator of validators) {
                const result = validator(value, entity);
                if (result === true) return true;
                errors.push(result);
            }
            return `All validations failed: ${errors.join(', ')}`;
        };
    },
    
    /**
     * Optional field - only validate if value exists
     */
    optional(validator) {
        return (value, entity) => {
            if (value === null || value === undefined) return true;
            return validator(value, entity);
        };
    },
    
    // ============================================================
    // GAME-SPECIFIC VALIDATORS (FastTrack examples)
    // ============================================================
    
    game: {
        /**
         * Validate a move object
         */
        validateMove(move) {
            return ValidationSubstrate.validate(move, {
                pegId: ValidationSubstrate.validators.required,
                toHoleId: ValidationSubstrate.validators.required,
                steps: ValidationSubstrate.all(
                    ValidationSubstrate.validators.required,
                    ValidationSubstrate.validators.isNumber,
                    ValidationSubstrate.validators.positive,
                    ValidationSubstrate.validators.integer
                )
            });
        },
        
        /**
         * Validate a card object
         */
        validateCard(card) {
            return ValidationSubstrate.validate(card, {
                rank: ValidationSubstrate.validators.required,
                suit: ValidationSubstrate.validators.required
            });
        },
        
        /**
         * Validate a peg object
         */
        validatePeg(peg) {
            return ValidationSubstrate.validate(peg, {
                id: ValidationSubstrate.validators.required,
                holeId: ValidationSubstrate.validators.notNull,
                color: ValidationSubstrate.validators.required
            });
        },
        
        /**
         * Validate a player object
         */
        validatePlayer(player) {
            return ValidationSubstrate.validate(player, {
                name: ValidationSubstrate.all(
                    ValidationSubstrate.validators.required,
                    ValidationSubstrate.validators.isString,
                    ValidationSubstrate.validators.notEmpty
                ),
                color: ValidationSubstrate.validators.required,
                peg: ValidationSubstrate.validators.isArray
            });
        }
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.ValidationSubstrate = ValidationSubstrate;
    console.log('✅ ValidationSubstrate loaded - Universal validation ready');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationSubstrate;
}
