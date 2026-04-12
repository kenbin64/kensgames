/**
 * 🌀 POTENTIAL SUBSTRATE
 * "Errors don't exist. Only potentials that don't manifest."
 * 
 * Replaces: try-catch blocks, error handling, null checks
 * With: Potential manifestation observation
 */

const PotentialSubstrate = {
    identity: 0x504F54454E5449414Cn, // "POTENTIAL"
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 1: SPARK - Potential exists without error
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Attempt to manifest a potential (replaces try-catch)
     * @param {Function} potential - Function that may or may not manifest
     * @returns {*} Manifested value or null
     */
    async manifest(potential) {
        const result = await potential()?.catch?.(() => null) ?? await potential();
        return result ?? null;
    },
    
    /**
     * Synchronous manifestation
     */
    manifestSync(potential) {
        const result = potential();
        return result ?? null;
    },
    
    /**
     * Manifest with fallback (replaces try-catch with fallback)
     */
    async manifestOr(potential, fallback) {
        const result = await this.manifest(potential);
        return result ?? fallback;
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 2: MIRROR - Chained potentials
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Chain potentials (replaces nested try-catch)
     */
    async chain(...potentials) {
        for (const potential of potentials) {
            const result = await this.manifest(potential);
            if (result !== null) return result;
        }
        return null;
    },
    
    /**
     * Parallel manifestation (replaces Promise.all with error handling)
     */
    async all(potentials) {
        const results = await Promise.all(
            potentials.map(p => this.manifest(p))
        );
        return results.filter(r => r !== null);
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 3: RELATION - Property access potentials
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Safe property access (replaces optional chaining with null checks)
     */
    access(obj, path) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            current = current?.[key];
            if (current === null || current === undefined) return null;
        }
        
        return current;
    },
    
    /**
     * Safe method invocation
     */
    invoke(obj, method, ...args) {
        const fn = this.access(obj, method);
        return fn ? fn.call(obj, ...args) : null;
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 4: FORM - Structured potential patterns
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * VR session potential (replaces VR try-catch)
     */
    async vrSession(mode = 'immersive-vr') {
        const xr = this.access(navigator, 'xr');
        if (!xr) return null;
        
        const supported = await this.manifest(() => 
            xr.isSessionSupported(mode)
        );
        
        if (!supported) return null;
        
        return await this.manifest(() => 
            xr.requestSession(mode, {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['hand-tracking', 'bounded-floor']
            })
        );
    },
    
    /**
     * WebSocket connection potential
     */
    async websocket(url) {
        return new Promise((resolve) => {
            const ws = new WebSocket(url);
            
            ws.onopen = () => resolve(ws);
            ws.onerror = () => resolve(null);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                ws.readyState !== WebSocket.OPEN && resolve(null);
            }, 5000);
        });
    },
    
    /**
     * LocalStorage potential (replaces try-catch for storage)
     */
    storage: {
        get(key) {
            const value = localStorage.getItem(key);
            if (!value) return null;
            
            return PotentialSubstrate.manifestSync(() => 
                JSON.parse(value)
            ) ?? value;
        },
        
        set(key, value) {
            return PotentialSubstrate.manifestSync(() => {
                const serialized = typeof value === 'string' 
                    ? value 
                    : JSON.stringify(value);
                localStorage.setItem(key, serialized);
                return true;
            });
        }
    },
    
    /**
     * Audio context potential
     */
    audioContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        
        return this.manifestSync(() => new AudioContext());
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 5: LIFE - DOM potentials
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Query selector potential
     */
    element(selector) {
        return document.querySelector(selector) ?? null;
    },
    
    /**
     * Multiple elements potential
     */
    elements(selector) {
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.length > 0 ? elements : null;
    },
    
    /**
     * Clipboard potential
     */
    async clipboard(text) {
        return await this.manifest(() => 
            navigator.clipboard.writeText(text)
        );
    },
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 6: MIND - Network potentials
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Fetch potential (replaces fetch with try-catch)
     */
    async fetch(url, options) {
        const response = await this.manifest(() => 
            fetch(url, options)
        );
        
        if (!response) return null;
        
        return await this.manifest(() => response.json());
    }
};

// Export for global use
window.PotentialSubstrate = PotentialSubstrate;

