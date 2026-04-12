/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * STATE SUBSTRATE
 * Universal state management - works across all applications
 * 
 * PARADIGM: No duplication. Every state mutation exists exactly once.
 * All state management flows through this substrate.
 * 
 * Reusable in: FastTrack, Chess, Blog, any ButterflyFX app
 * ============================================================
 */

'use strict';

const StateSubstrate = {
    version: '1.0.0',
    name: 'Universal State Substrate',
    
    // Internal state storage
    _state: new Map(),
    _listeners: new Map(),
    _history: [],
    _maxHistory: 50,
    
    // ============================================================
    // CORE STATE MANAGEMENT
    // ============================================================
    
    /**
     * Set state value
     * @param {string} key - State key
     * @param {*} value - State value
     * @param {boolean} silent - Skip emitting change event
     * @returns {*} The value that was set
     */
    set(key, value, silent = false) {
        const oldValue = this._state.get(key);
        
        // Only update if value actually changed
        if (oldValue === value) return value;
        
        this._state.set(key, value);
        
        // Record in history
        this._recordHistory('set', key, oldValue, value);
        
        // Emit change events
        if (!silent) {
            this._emit('change', { key, oldValue, newValue: value });
            this._emit(`change:${key}`, { oldValue, newValue: value });
        }
        
        return value;
    },
    
    /**
     * Get state value
     * @param {string} key - State key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} State value or default
     */
    get(key, defaultValue = null) {
        return this._state.has(key) ? this._state.get(key) : defaultValue;
    },
    
    /**
     * Check if state key exists
     * @param {string} key - State key
     * @returns {boolean} True if key exists
     */
    has(key) {
        return this._state.has(key);
    },
    
    /**
     * Delete state key
     * @param {string} key - State key
     * @returns {boolean} True if key was deleted
     */
    delete(key) {
        if (!this._state.has(key)) return false;
        
        const oldValue = this._state.get(key);
        this._state.delete(key);
        
        this._recordHistory('delete', key, oldValue, undefined);
        this._emit('delete', { key, oldValue });
        this._emit(`delete:${key}`, { oldValue });
        
        return true;
    },
    
    /**
     * Clear all state
     * @param {boolean} silent - Skip emitting events
     */
    clear(silent = false) {
        const oldState = new Map(this._state);
        this._state.clear();
        
        this._recordHistory('clear', null, oldState, null);
        
        if (!silent) {
            this._emit('clear', { oldState });
        }
    },
    
    /**
     * Get all state as object
     * @returns {Object} State object
     */
    getAll() {
        const obj = {};
        for (const [key, value] of this._state.entries()) {
            obj[key] = value;
        }
        return obj;
    },
    
    /**
     * Set multiple state values at once
     * @param {Object} values - Key-value pairs to set
     * @param {boolean} silent - Skip emitting events
     */
    setAll(values, silent = false) {
        for (const [key, value] of Object.entries(values)) {
            this.set(key, value, silent);
        }
    },
    
    // ============================================================
    // REACTIVE STATE (Computed Values)
    // ============================================================
    
    /**
     * Define a computed state value
     * @param {string} key - Computed state key
     * @param {Function} computeFn - Function to compute value
     * @param {Array<string>} dependencies - State keys to watch
     */
    computed(key, computeFn, dependencies = []) {
        // Compute initial value
        const initialValue = computeFn(this);
        this.set(key, initialValue, true);
        
        // Recompute when dependencies change
        dependencies.forEach(dep => {
            this.on(`change:${dep}`, () => {
                const newValue = computeFn(this);
                this.set(key, newValue);
            });
        });
    },
    
    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    
    /**
     * Listen for state changes
     * @param {string} event - Event name (change, change:key, delete, etc.)
     * @param {Function} handler - Event handler
     * @returns {string} Listener ID for removal
     */
    on(event, handler) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        
        const id = `listener_${Date.now()}_${Math.random()}`;
        this._listeners.get(event).push({ id, handler });
        
        return id;
    },
    
    /**
     * Remove event listener
     * @param {string} id - Listener ID from on()
     * @returns {boolean} True if removed
     */
    off(id) {
        for (const [event, listeners] of this._listeners.entries()) {
            const index = listeners.findIndex(l => l.id === id);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this._listeners.delete(event);
                }
                return true;
            }
        }
        return false;
    },
    
    /**
     * Listen once (auto-removes after first trigger)
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @returns {string} Listener ID
     */
    once(event, handler) {
        const wrappedHandler = (data) => {
            handler(data);
            this.off(id);
        };
        
        const id = this.on(event, wrappedHandler);
        return id;
    },
    
    /**
     * Emit event to listeners
     * @private
     */
    _emit(event, data) {
        const listeners = this._listeners.get(event);
        if (!listeners) return;
        
        for (const { handler } of listeners) {
            try {
                handler(data);
            } catch (error) {
                console.error(`[StateSubstrate] Error in ${event} handler:`, error);
            }
        }
    },
    
    // ============================================================
    // HISTORY & TIME TRAVEL
    // ============================================================
    
    /**
     * Record state change in history
     * @private
     */
    _recordHistory(action, key, oldValue, newValue) {
        this._history.push({
            timestamp: Date.now(),
            action,
            key,
            oldValue,
            newValue
        });
        
        // Limit history size
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }
    },
    
    /**
     * Get state change history
     * @param {number} limit - Max number of entries
     * @returns {Array} History entries
     */
    getHistory(limit = 10) {
        return this._history.slice(-limit);
    },
    
    /**
     * Clear history
     */
    clearHistory() {
        this._history = [];
    },
    
    /**
     * Create snapshot of current state
     * @returns {Object} State snapshot
     */
    snapshot() {
        return {
            timestamp: Date.now(),
            state: this.getAll()
        };
    },
    
    /**
     * Restore state from snapshot
     * @param {Object} snapshot - Snapshot from snapshot()
     * @param {boolean} silent - Skip emitting events
     */
    restore(snapshot, silent = false) {
        this.clear(true);
        this.setAll(snapshot.state, silent);
        
        if (!silent) {
            this._emit('restore', { snapshot });
        }
    },
    
    // ============================================================
    // PERSISTENCE
    // ============================================================
    
    /**
     * Save state to localStorage
     * @param {string} storageKey - localStorage key
     * @param {Array<string>} keys - Specific keys to save (null = all)
     */
    save(storageKey, keys = null) {
        if (typeof localStorage === 'undefined') {
            console.warn('[StateSubstrate] localStorage not available');
            return false;
        }
        
        const dataToSave = keys 
            ? keys.reduce((obj, key) => {
                if (this.has(key)) obj[key] = this.get(key);
                return obj;
            }, {})
            : this.getAll();
        
        try {
            localStorage.setItem(storageKey, JSON.stringify(dataToSave));
            return true;
        } catch (error) {
            console.error('[StateSubstrate] Save failed:', error);
            return false;
        }
    },
    
    /**
     * Load state from localStorage
     * @param {string} storageKey - localStorage key
     * @param {boolean} merge - Merge with existing state (true) or replace (false)
     * @returns {boolean} Success
     */
    load(storageKey, merge = true) {
        if (typeof localStorage === 'undefined') {
            console.warn('[StateSubstrate] localStorage not available');
            return false;
        }
        
        try {
            const data = localStorage.getItem(storageKey);
            if (!data) return false;
            
            const parsed = JSON.parse(data);
            
            if (!merge) {
                this.clear(true);
            }
            
            this.setAll(parsed);
            this._emit('load', { storageKey, data: parsed });
            
            return true;
        } catch (error) {
            console.error('[StateSubstrate] Load failed:', error);
            return false;
        }
    },
    
    // ============================================================
    // UTILITY METHODS
    // ============================================================
    
    /**
     * Get state statistics
     * @returns {Object} Stats
     */
    getStats() {
        return {
            keys: this._state.size,
            listeners: Array.from(this._listeners.values())
                .reduce((sum, arr) => sum + arr.length, 0),
            historySize: this._history.length
        };
    },
    
    /**
     * Watch multiple keys and call handler when any change
     * @param {Array<string>} keys - Keys to watch
     * @param {Function} handler - Handler function
     * @returns {Array<string>} Listener IDs
     */
    watch(keys, handler) {
        return keys.map(key => this.on(`change:${key}`, handler));
    },
    
    /**
     * Unwatch (remove multiple listeners)
     * @param {Array<string>} listenerIds - IDs from watch()
     */
    unwatch(listenerIds) {
        listenerIds.forEach(id => this.off(id));
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.StateSubstrate = StateSubstrate;
    console.log('✅ StateSubstrate loaded - Universal state management ready');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateSubstrate;
}
