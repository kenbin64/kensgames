/**
 * 🌊 OBSERVATION SUBSTRATE
 * "Everything exists. Only observation manifests reality."
 * 
 * Replaces: setTimeout, setInterval, polling loops, state checking
 * With: Pure observation of potential manifestation
 */

const ObservationSubstrate = {
    identity: 0x4F425345525645n, // "OBSERVE"
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 1: SPARK - Existence of observation potential
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Observe when a potential manifests (replaces setInterval polling)
     * @param {Function} potential - Function that returns value when manifested
     * @param {Function} onManifest - Called when potential becomes real
     */
    when(potential, onManifest) {
        const check = () => {
            const manifested = potential();
            manifested !== null && manifested !== undefined
                ? onManifest(manifested)
                : requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    },
    
    /**
     * Delayed manifestation (replaces setTimeout)
     * @param {Function} potential - What to manifest
     * @param {Number} delay - Delay in ms
     */
    async after(potential, delay) {
        return new Promise(resolve => {
            const start = performance.now();
            const tick = () => {
                const elapsed = performance.now() - start;
                elapsed >= delay
                    ? resolve(potential())
                    : requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    },
    
    /**
     * Observe DOM mutations (replaces polling for DOM changes)
     */
    dom(selector, onManifest) {
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            element && onManifest(element);
        });
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Check if already exists
        const existing = document.querySelector(selector);
        existing && onManifest(existing);
    },
    
    /**
     * Observe property changes (replaces polling for state changes)
     */
    property(obj, prop, onManifest) {
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        const originalSet = descriptor?.set;
        
        Object.defineProperty(obj, prop, {
            get: descriptor?.get,
            set(value) {
                originalSet?.call(this, value);
                onManifest(value);
            },
            configurable: true
        });
    },
    
    /**
     * Observe when condition becomes true (replaces while loops)
     */
    until(condition, onTrue) {
        const check = () => {
            condition()
                ? onTrue()
                : requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 2: MIRROR - Reflection of observation patterns
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Observe multiple potentials, manifest when all are ready
     */
    all(potentials, onAllManifest) {
        const results = new Array(potentials.length);
        let manifestedCount = 0;
        
        potentials.forEach((potential, index) => {
            this.when(potential, (value) => {
                results[index] = value;
                manifestedCount++;
                manifestedCount === potentials.length && onAllManifest(results);
            });
        });
    },
    
    /**
     * Observe multiple potentials, manifest when any is ready
     */
    any(potentials, onFirstManifest) {
        let manifested = false;
        potentials.forEach(potential => {
            this.when(potential, (value) => {
                !manifested && onFirstManifest(value);
                manifested = true;
            });
        });
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 3: RELATION - Relationships between observations
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Chain observations (replaces nested callbacks)
     */
    chain(...observations) {
        return observations.reduce((prev, curr) => 
            prev.then(result => curr(result)),
            Promise.resolve()
        );
    },
    
    /**
     * Observe with timeout (replaces setTimeout + clearTimeout patterns)
     */
    async withTimeout(potential, timeout, onTimeout) {
        return Promise.race([
            this.after(potential, 0),
            this.after(() => onTimeout?.(), timeout)
        ]);
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 4: FORM - Structured observation patterns
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Create an observable potential that can be watched
     */
    createPotential(initialValue) {
        let value = initialValue;
        const observers = [];
        
        return {
            get() { return value; },
            set(newValue) {
                value = newValue;
                observers.forEach(obs => obs(value));
            },
            observe(callback) {
                observers.push(callback);
                callback(value); // Immediate manifestation
            }
        };
    }
};

// Export for use in other substrates
window.ObservationSubstrate = ObservationSubstrate;

