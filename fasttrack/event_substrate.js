/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * EVENT SUBSTRATE
 * Universal event management - works across all applications
 * 
 * PARADIGM: No duplication. Every event handler exists exactly once.
 * All event management flows through this substrate.
 * 
 * Reusable in: FastTrack, Chess, Blog, any ButterflyFX app
 * ============================================================
 */

'use strict';

const EventSubstrate = {
    version: '1.0.0',
    name: 'Universal Event Substrate',
    
    // Internal state
    _listeners: new Map(),
    _domListeners: new Map(),
    _nextId: 1,
    
    // ============================================================
    // DOM EVENT MANAGEMENT
    // ============================================================
    
    /**
     * Attach event listener to DOM element
     * @param {HTMLElement|string} element - Element or selector
     * @param {string} event - Event name (click, mouseover, etc.)
     * @param {Function} handler - Event handler function
     * @param {Object} options - addEventListener options
     * @returns {string} Listener ID for removal
     */
    on(element, event, handler, options = {}) {
        // Resolve element if string selector
        const el = typeof element === 'string' 
            ? document.querySelector(element) 
            : element;
        
        if (!el) {
            console.warn('[EventSubstrate] Element not found:', element);
            return null;
        }
        
        // Generate unique ID
        const id = `evt_${this._nextId++}`;
        
        // Store listener info
        this._domListeners.set(id, {
            element: el,
            event,
            handler,
            options
        });
        
        // Attach to DOM
        el.addEventListener(event, handler, options);
        
        return id;
    },
    
    /**
     * Remove event listener by ID
     * @param {string} id - Listener ID from on()
     * @returns {boolean} Success
     */
    off(id) {
        const listener = this._domListeners.get(id);
        if (!listener) return false;
        
        listener.element.removeEventListener(
            listener.event,
            listener.handler,
            listener.options
        );
        
        this._domListeners.delete(id);
        return true;
    },
    
    /**
     * Remove all event listeners for an element
     * @param {HTMLElement} element - Element to clear
     * @returns {number} Number of listeners removed
     */
    clearElement(element) {
        let count = 0;
        for (const [id, listener] of this._domListeners.entries()) {
            if (listener.element === element) {
                this.off(id);
                count++;
            }
        }
        return count;
    },
    
    /**
     * Remove all event listeners
     * @returns {number} Number of listeners removed
     */
    clearAll() {
        const count = this._domListeners.size;
        for (const id of this._domListeners.keys()) {
            this.off(id);
        }
        return count;
    },
    
    /**
     * One-time event listener (auto-removes after first trigger)
     * @param {HTMLElement|string} element - Element or selector
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - addEventListener options
     * @returns {string} Listener ID
     */
    once(element, event, handler, options = {}) {
        const wrappedHandler = (e) => {
            handler(e);
            this.off(id);
        };
        
        const id = this.on(element, event, wrappedHandler, options);
        return id;
    },
    
    /**
     * Delegate event handling (event delegation pattern)
     * @param {HTMLElement|string} parent - Parent element
     * @param {string} selector - Child selector to match
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @returns {string} Listener ID
     */
    delegate(parent, selector, event, handler) {
        const delegateHandler = (e) => {
            const target = e.target.closest(selector);
            if (target) {
                handler.call(target, e);
            }
        };
        
        return this.on(parent, event, delegateHandler);
    },
    
    // ============================================================
    // CUSTOM EVENT SYSTEM (Pub/Sub)
    // ============================================================
    
    /**
     * Subscribe to custom event
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     * @param {number} priority - Handler priority (higher = earlier)
     * @returns {string} Subscription ID
     */
    subscribe(eventName, handler, priority = 0) {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        
        const id = `sub_${this._nextId++}`;
        const subscription = {
            id,
            handler,
            priority,
            eventName
        };
        
        this._listeners.get(eventName).push(subscription);
        
        // Sort by priority (descending)
        this._listeners.get(eventName).sort((a, b) => b.priority - a.priority);
        
        return id;
    },
    
    /**
     * Unsubscribe from custom event
     * @param {string} id - Subscription ID
     * @returns {boolean} Success
     */
    unsubscribe(id) {
        for (const [eventName, subs] of this._listeners.entries()) {
            const index = subs.findIndex(s => s.id === id);
            if (index !== -1) {
                subs.splice(index, 1);
                if (subs.length === 0) {
                    this._listeners.delete(eventName);
                }
                return true;
            }
        }
        return false;
    },
    
    /**
     * Emit custom event
     * @param {string} eventName - Event name
     * @param {*} data - Event data
     * @returns {number} Number of handlers called
     */
    emit(eventName, data) {
        const subs = this._listeners.get(eventName);
        if (!subs || subs.length === 0) return 0;
        
        let count = 0;
        for (const sub of subs) {
            try {
                sub.handler(data);
                count++;
            } catch (error) {
                console.error(`[EventSubstrate] Error in handler for ${eventName}:`, error);
            }
        }
        
        return count;
    },
    
    /**
     * Subscribe once (auto-unsubscribes after first emit)
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     * @param {number} priority - Handler priority
     * @returns {string} Subscription ID
     */
    subscribeOnce(eventName, handler, priority = 0) {
        const wrappedHandler = (data) => {
            handler(data);
            this.unsubscribe(id);
        };
        
        const id = this.subscribe(eventName, wrappedHandler, priority);
        return id;
    },
    
    /**
     * Wait for event (returns Promise)
     * @param {string} eventName - Event name
     * @param {number} timeout - Timeout in ms (0 = no timeout)
     * @returns {Promise} Resolves with event data
     */
    waitFor(eventName, timeout = 0) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            
            const id = this.subscribeOnce(eventName, (data) => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve(data);
            });
            
            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    this.unsubscribe(id);
                    reject(new Error(`Timeout waiting for event: ${eventName}`));
                }, timeout);
            }
        });
    },
    
    // ============================================================
    // UTILITY METHODS
    // ============================================================
    
    /**
     * Get all active listeners (for debugging)
     * @returns {Object} Listener counts
     */
    getStats() {
        return {
            domListeners: this._domListeners.size,
            customEvents: this._listeners.size,
            totalSubscriptions: Array.from(this._listeners.values())
                .reduce((sum, subs) => sum + subs.length, 0)
        };
    },
    
    /**
     * Trigger DOM event programmatically
     * @param {HTMLElement} element - Element to trigger on
     * @param {string} eventType - Event type
     * @param {Object} detail - Event detail data
     */
    trigger(element, eventType, detail = {}) {
        const event = new CustomEvent(eventType, {
            bubbles: true,
            cancelable: true,
            detail
        });
        element.dispatchEvent(event);
    },
    
    /**
     * Debounce event handler
     * @param {Function} handler - Handler to debounce
     * @param {number} delay - Delay in ms
     * @returns {Function} Debounced handler
     */
    debounce(handler, delay = 300) {
        let timeoutId = null;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => handler.apply(this, args), delay);
        };
    },
    
    /**
     * Throttle event handler
     * @param {Function} handler - Handler to throttle
     * @param {number} limit - Limit in ms
     * @returns {Function} Throttled handler
     */
    throttle(handler, limit = 300) {
        let inThrottle = false;
        return function(...args) {
            if (!inThrottle) {
                handler.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.EventSubstrate = EventSubstrate;
    console.log('✅ EventSubstrate loaded - Universal event management ready');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventSubstrate;
}
