/**
 * ============================================================
 * UI MANIFOLD
 * Dimensional manifold for UI component management
 * Treats UI elements as points on a dimensional space
 * Part of ButterflyFX Dimensional Computing Framework
 * ============================================================
 */

const UIManifold = {
    // Manifold metadata
    _meta: {
        name: 'UIManifold',
        dimension: 4,
        type: 'container',
        version: '1.0.0'
    },

    // Registered UI components (3D substrates)
    _components: {},

    // Component state (lazy manifestation)
    _state: {},

    // ════════════════════════════════════════════════════════
    // COMPONENT REGISTRATION (Dimensional Points)
    // ════════════════════════════════════════════════════════

    /**
     * Register a UI component as a point on the manifold
     * @param {string} name - Component name (coordinate)
     * @param {Object} config - Component configuration
     */
    register(name, config) {
        console.log(`[UIManifold] Registering component: ${name}`);
        
        this._components[name] = {
            name: name,
            selector: config.selector,
            events: config.events || {},
            potential: config.potential || [], // Lazy attributes
            geometry: config.geometry || { x: 'interactive', y: 'visual' },
            state: config.state || {},
            _manifested: false
        };

        // Lazy manifestation - don't attach events until first interaction
        if (config.eager) {
            this._manifestComponent(name);
        }

        return this;
    },

    /**
     * Invoke a component method via dimensional coordinates
     * @param {string} path - Coordinate path (e.g., 'button.onClick')
     * @param {*} data - Data to pass
     */
    invoke(path, data) {
        const [componentName, method] = path.split('.');
        const component = this._components[componentName];

        if (!component) {
            console.error(`[UIManifold] Component not found: ${componentName}`);
            return null;
        }

        // Manifest component if not already manifested
        if (!component._manifested) {
            this._manifestComponent(componentName);
        }

        // Execute method
        if (method && component.events[method]) {
            return component.events[method](data);
        }

        console.warn(`[UIManifold] Method ${method} not found on ${componentName}`);
        return null;
    },

    /**
     * Get component state via coordinates
     * @param {string} path - Coordinate path (e.g., 'modal.visible')
     */
    getState(path) {
        const [componentName, property] = path.split('.');
        const component = this._components[componentName];

        if (!component) return undefined;

        return property ? component.state[property] : component.state;
    },

    /**
     * Set component state via coordinates
     * @param {string} path - Coordinate path
     * @param {*} value - New value
     */
    setState(path, value) {
        const [componentName, property] = path.split('.');
        const component = this._components[componentName];

        if (!component) {
            console.error(`[UIManifold] Component not found: ${componentName}`);
            return;
        }

        if (property) {
            component.state[property] = value;
        } else {
            component.state = value;
        }

        // Trigger state change event if defined
        if (component.events.onStateChange) {
            component.events.onStateChange(component.state);
        }
    },

    /**
     * Query components by geometry
     * @param {Object} geometry - Geometric coordinates { x, y }
     */
    queryByGeometry(geometry) {
        return Object.values(this._components).filter(comp => {
            return (!geometry.x || comp.geometry.x === geometry.x) &&
                   (!geometry.y || comp.geometry.y === geometry.y);
        });
    },

    /**
     * Bind two components geometrically (z = x · y)
     * @param {string} component1 - First component name
     * @param {string} component2 - Second component name
     * @param {Function} binding - Binding function
     */
    bind(component1, component2, binding) {
        const comp1 = this._components[component1];
        const comp2 = this._components[component2];

        if (!comp1 || !comp2) {
            console.error('[UIManifold] Cannot bind - component not found');
            return;
        }

        console.log(`[UIManifold] Binding ${component1} · ${component2}`);

        // Create binding relationship
        if (!comp1._bindings) comp1._bindings = [];
        comp1._bindings.push({
            target: component2,
            fn: binding
        });

        // When comp1 state changes, invoke binding
        const originalOnStateChange = comp1.events.onStateChange;
        comp1.events.onStateChange = (state) => {
            if (originalOnStateChange) originalOnStateChange(state);
            binding(comp1, comp2);
        };
    },

    // ════════════════════════════════════════════════════════
    // LAZY MANIFESTATION
    // ════════════════════════════════════════════════════════

    _manifestComponent(name) {
        const component = this._components[name];
        if (!component || component._manifested) return;

        console.log(`[UIManifold] Manifesting component: ${name}`);

        // Attach event listeners if selector exists
        if (component.selector) {
            const elements = document.querySelectorAll(component.selector);
            
            // Attach events via direct coordinate access (not iteration)
            Object.entries(component.events).forEach(([eventName, handler]) => {
                if (eventName.startsWith('on')) {
                    const domEvent = eventName.substring(2).toLowerCase();
                    elements.forEach(el => {
                        el.addEventListener(domEvent, handler);
                    });
                }
            });
        }

        // Manifest potential attributes
        component.potential.forEach(attr => {
            if (!component.state[attr]) {
                component.state[attr] = this._getDefaultValue(attr);
            }
        });

        component._manifested = true;
    },

    _getDefaultValue(attribute) {
        const defaults = {
            'hover': false,
            'focus': false,
            'active': false,
            'visible': true,
            'disabled': false
        };
        return defaults[attribute] !== undefined ? defaults[attribute] : null;
    },

    // ════════════════════════════════════════════════════════
    // MANIFOLD INTERFACE
    // ════════════════════════════════════════════════════════

    getStats() {
        const manifested = Object.values(this._components).filter(c => c._manifested).length;
        const total = Object.keys(this._components).length;
        
        return {
            totalComponents: total,
            manifestedComponents: manifested,
            lazyComponents: total - manifested,
            manifestationRatio: total > 0 ? (manifested / total * 100).toFixed(1) + '%' : '0%'
        };
    },

    visualize() {
        const stats = this.getStats();
        let output = '\n🎨 UI Manifold Visualization\n';
        output += '═'.repeat(50) + '\n';
        output += `Total Components: ${stats.totalComponents}\n`;
        output += `Manifested: ${stats.manifestedComponents}\n`;
        output += `Lazy (not yet manifested): ${stats.lazyComponents}\n`;
        output += `Manifestation Ratio: ${stats.manifestationRatio}\n`;
        output += '─'.repeat(50) + '\n';
        
        Object.entries(this._components).forEach(([name, comp]) => {
            const status = comp._manifested ? '✓' : '○';
            output += `${status} ${name} [${comp.geometry.x}, ${comp.geometry.y}]\n`;
        });
        
        return output;
    },

    getMetadata() {
        return this._meta;
    }
};

// Register with SubstrateManifold
if (typeof SubstrateManifold !== 'undefined') {
    SubstrateManifold.register('UI', UIManifold);
}

// Global export
window.UIManifold = UIManifold;
console.log('✅ UIManifold loaded - Dimensional UI management ready');
