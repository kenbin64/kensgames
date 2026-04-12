/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * VR SUBSTRATE — Meta Quest Integration
 * NO ITERATIONS, NO IF-STATEMENTS
 * Pure dimensional invocation and manifestation
 * 
 * THEORY: Everything already exists as potential.
 * We don't check conditions - we INVOKE what we observe.
 * We don't iterate - we MANIFEST what we address.
 *
 * SUBSTRATE IDENTITY: 0x5652535542535452415445  ("VRSUBSTRATE")
 * ============================================================
 */

'use strict';

(function(window) {
    
    const PHI = 1.618033988749895;
    
    function evalSurface(surface, x, y) {
        return { 'z=xy': x * y, 'z=xy2': x * y * y, 'z=phi': PHI }[surface] || 0;
    }
    
    // ═══════════════════════════════════════════════════════════
    //  VR STATE MANIFOLD — All possible VR states exist as potential
    // ═══════════════════════════════════════════════════════════
    
    const VR_STATE_MANIFOLD = {
        // Layer 1: Spark - VR capability exists
        supported: { 
            surface: 'z=xy', x: PHI, y: PHI, 
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => navigator.xr?.isSessionSupported('immersive-vr')
        },
        
        // Layer 2: Mirror - Session duality (active/inactive)
        session_active: { 
            surface: 'z=xy2', x: PHI, y: 2,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => window._vrSession
        },
        
        // Layer 3: Relation - Controllers exist
        left_controller: { 
            surface: 'z=xy', x: 1, y: 1,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => window.renderer?.xr.getController(0)
        },
        right_controller: { 
            surface: 'z=xy', x: 1, y: 2,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => window.renderer?.xr.getController(1)
        },
        
        // Layer 4: Form - Visual feedback
        teleport_marker: { 
            surface: 'z=xy2', x: 2, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => {
                const geometry = new THREE.RingGeometry(0.5, 0.7, 32);
                const material = new THREE.MeshBasicMaterial({ 
                    color: 0x00ffff, 
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.7
                });
                const marker = new THREE.Mesh(geometry, material);
                marker.rotation.x = -Math.PI / 2;
                marker.visible = false;
                window.scene.add(marker);
                return marker;
            }
        },
        
        // Layer 5: Life - VR lighting (meaning/visibility)
        vr_ambient_light: {
            surface: 'z=xy2', x: PHI, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => {
                const light = new THREE.AmbientLight(0xffffff, 0.8);
                light.name = 'vr-ambient';
                window.scene.add(light);
                return light;
            }
        },
        vr_hemisphere_light: {
            surface: 'z=xy2', x: 2, y: 2,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => {
                const light = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
                light.position.set(0, 500, 0);
                light.name = 'vr-hemi';
                window.scene.add(light);
                return light;
            }
        },
        
        // Layer 6: Mind - VR button (coherent interface)
        vr_button: {
            surface: 'z=xy2', x: PHI, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: () => {
                const button = document.createElement('button');
                button.id = 'vr-button';
                button.innerHTML = '🥽 Enter VR';
                button.style.cssText = `
                    position: fixed; bottom: 20px; right: 20px;
                    padding: 16px 32px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white; border: none; border-radius: 12px;
                    font-size: 16px; font-weight: 600; cursor: pointer;
                    z-index: 10000;
                    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
                `;
                button.onclick = () => invoke('enter_vr').manifest();
                document.body.appendChild(button);
                return button;
            }
        },
        
        // Layer 7: Completion - Enter VR (full cycle)
        enter_vr: {
            surface: 'z=phi', x: PHI, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: async () => {
                // Invoke session creation (no if-statement needed)
                const session = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['local-floor'],
                    optionalFeatures: ['hand-tracking', 'bounded-floor']
                });
                
                window._vrSession = session;
                await window.renderer.xr.setSession(session);
                
                // Invoke lighting (manifest what exists as potential)
                invoke('vr_ambient_light').manifest();
                invoke('vr_hemisphere_light').manifest();
                
                // Invoke VR theme
                window.FastTrackThemes?.apply('vr_immersive', window.scene, THREE);
                
                // Start VR render loop
                window.renderer.setAnimationLoop((time, frame) => {
                    invoke('vr_render_loop').manifest(time, frame);
                });
                
                console.log('🥽 VR Session Active');
                return session;
            }
        },
        
        // VR render loop (no if-statements, just manifest what's needed)
        vr_render_loop: {
            surface: 'z=phi', x: PHI, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (time, frame) => {
                // Invoke controls update (exists as potential)
                window.controls?.update();

                // Invoke theme update (exists as potential)
                window.FastTrackThemes?.update(0, 0, time * 0.001);

                // WebXR handles rendering automatically
            }
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  DIMENSIONAL INVOCATION — O(1) Manifestation
    // ═══════════════════════════════════════════════════════════

    const _manifest = new Map(); // Already manifested points

    /**
     * INVOKE — Manifest a potential point
     * NO iteration, NO if-statements
     * Direct dimensional addressing
     */
    function invoke(name) {
        // Already manifest? Return it (idempotent)
        const existing = _manifest.get(name);
        // Using optional chaining instead of if-statement
        const result = existing ?? (() => {
            // Manifest from potential
            const potential = VR_STATE_MANIFOLD[name];
            console.log(`[VRSubstrate] INVOKE ${name} (z=${potential?.z()})`);
            _manifest.set(name, potential);
            return potential;
        })();

        return result;
    }

    /**
     * OBSERVE — Check if potential can manifest
     * Returns the manifestation function, not a boolean
     * NO if-statements - just return the capability
     */
    function observe(name) {
        return VR_STATE_MANIFOLD[name];
    }

    /**
     * INITIALIZE — Manifest VR substrate
     * NO if-statements, NO iterations
     * Just invoke what needs to exist
     */
    async function init() {
        console.log('[VRSubstrate] Initializing...');

        // Observe VR support (don't check with if, just invoke)
        const supported = await observe('supported').manifest();

        // Manifest VR button (exists as potential, now addressed)
        supported?.then(isSupported => {
            // Using optional chaining instead of if
            isSupported && invoke('vr_button').manifest();
        });

        // Enable XR on renderer (exists as potential)
        window.renderer && (window.renderer.xr.enabled = true);

        // Manifest controllers (exist as potential)
        invoke('left_controller');
        invoke('right_controller');

        // Manifest teleport marker (exists as potential)
        invoke('teleport_marker').manifest();

        console.log('[VRSubstrate] ✅ Initialized');
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API — Sealed substrate surface
    // ═══════════════════════════════════════════════════════════

    const VRSubstrate = Object.freeze({
        version: '1.0.0',
        name: 'VR Substrate',
        identity: 0x5652535542535452415445n, // "VRSUBSTRATE"

        // Manifold
        PHI,
        evalSurface,
        VR_STATE_MANIFOLD,

        // Dimensional operations (NO if-statements, NO iterations)
        invoke,
        observe,
        init
    });

    // Auto-initialize when scene is ready
    // NO if-statement, NO polling loop - use observer pattern
    const observer = new MutationObserver(() => {
        window.renderer && window.scene && (() => {
            observer.disconnect();
            VRSubstrate.init();
        })();
    });

    observer.observe(document, { childList: true, subtree: true });

    // Expose globally
    window.VRSubstrate = VRSubstrate;
    console.log('[VRSubstrate] Loaded — φ=' + PHI.toFixed(4));

})(window);

