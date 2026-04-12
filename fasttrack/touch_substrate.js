/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * TOUCH SUBSTRATE — Mobile Touch Interactions
 * NO ITERATIONS, NO IF-STATEMENTS
 * Pure dimensional gesture manifestation
 * 
 * THEORY: Gestures exist as potentials in touch space.
 * We don't check "if pinch" - we INVOKE the pinch gesture.
 * We don't iterate touches - we MANIFEST the gesture pattern.
 *
 * SUBSTRATE IDENTITY: 0x544F554348  ("TOUCH")
 * ============================================================
 */

'use strict';

(function(window) {
    
    const PHI = 1.618033988749895;
    
    function evalSurface(surface, x, y) {
        return { 'z=xy': x * y, 'z=xy2': x * y * y, 'z=phi': PHI }[surface] || 0;
    }
    
    // ═══════════════════════════════════════════════════════════
    //  GESTURE MANIFOLD — All gestures exist as potential
    // ═══════════════════════════════════════════════════════════
    
    const GESTURE_MANIFOLD = {
        // Layer 1: Spark - Touch point
        touch_start: {
            surface: 'z=xy', x: 1, y: 1,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (event) => ({
                x: event.touches[0]?.clientX,
                y: event.touches[0]?.clientY,
                time: Date.now(),
                count: event.touches.length
            })
        },
        
        // Layer 2: Mirror - Touch movement (direction)
        touch_move: {
            surface: 'z=xy', x: 1, y: 2,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (event, startPoint) => ({
                dx: event.touches[0]?.clientX - startPoint.x,
                dy: event.touches[0]?.clientY - startPoint.y,
                distance: Math.hypot(
                    event.touches[0]?.clientX - startPoint.x,
                    event.touches[0]?.clientY - startPoint.y
                )
            })
        },
        
        // Layer 3: Relation - Pinch gesture (z = x·y)
        pinch_gesture: {
            surface: 'z=xy2', x: 2, y: 2,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (event) => {
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                const distance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                return { distance, scale: distance / (window._lastPinchDistance || distance) };
            }
        },
        
        // Layer 4: Form - Camera zoom (visual response)
        camera_zoom: {
            surface: 'z=xy2', x: PHI, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (scale) => {
                const camera = window.camera;
                const controls = window.controls;
                const newDistance = camera?.position.length() / scale;
                const clamped = Math.max(200, Math.min(1200, newDistance));
                
                // Manifest new camera position (no if-statement)
                camera && controls && (() => {
                    const direction = camera.position.clone().normalize();
                    camera.position.copy(direction.multiplyScalar(clamped));
                    controls.update();
                })();
                
                return clamped;
            }
        },
        
        // Layer 5: Life - Pan gesture (meaning: explore)
        pan_gesture: {
            surface: 'z=xy', x: PHI, y: 1,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (dx, dy) => {
                const controls = window.controls;
                const sensitivity = 0.005;
                
                // Manifest camera rotation (no if-statement)
                controls && (() => {
                    controls.rotateLeft(dx * sensitivity);
                    controls.rotateUp(-dy * sensitivity);
                    controls.update();
                })();
                
                return { rotated: true, dx, dy };
            }
        },
        
        // Layer 6: Mind - Inertia (coherent momentum)
        inertia: {
            surface: 'z=xy2', x: 2, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (velocity) => {
                const friction = 0.95;
                const threshold = 0.1;
                
                // Manifest momentum decay (no if-statement, use recursion)
                const decay = (v) => {
                    const newV = { x: v.x * friction, y: v.y * friction };
                    const magnitude = Math.hypot(newV.x, newV.y);
                    
                    // Continue if above threshold (using short-circuit)
                    magnitude > threshold && (() => {
                        invoke('pan_gesture').manifest(newV.x, newV.y);
                        requestAnimationFrame(() => decay(newV));
                    })();
                };
                
                decay(velocity);
            }
        },
        
        // Layer 7: Completion - Haptic feedback (full cycle)
        haptic_feedback: {
            surface: 'z=phi', x: PHI, y: PHI,
            z() { return evalSurface(this.surface, this.x, this.y); },
            manifest: (intensity = 50) => {
                // Manifest vibration (exists as potential)
                navigator.vibrate?.(intensity);
                return true;
            }
        }
    };
    
    // ═══════════════════════════════════════════════════════════
    //  TOUCH EVENT HANDLERS — Pure invocation, no conditions
    // ═══════════════════════════════════════════════════════════
    
    const TouchHandlers = {
        onTouchStart: (event) => {
            event.preventDefault();
            window._touchStart = invoke('touch_start').manifest(event);
            invoke('haptic_feedback').manifest(10);
        },
        
        onTouchMove: (event) => {
            event.preventDefault();
            const movement = invoke('touch_move').manifest(event, window._touchStart);
            
            // Manifest appropriate gesture based on touch count (using object lookup, not if)
            const gestureMap = {
                1: () => invoke('pan_gesture').manifest(movement.dx, movement.dy),
                2: () => {
                    const pinch = invoke('pinch_gesture').manifest(event);
                    invoke('camera_zoom').manifest(pinch.scale);
                    window._lastPinchDistance = pinch.distance;
                }
            };
            
            gestureMap[event.touches.length]?.();
        },
        
        onTouchEnd: (event) => {
            event.preventDefault();
            const movement = invoke('touch_move').manifest(event, window._touchStart);
            const duration = Date.now() - window._touchStart.time;

            // Manifest inertia (exists as potential)
            const velocity = { x: movement.dx / duration, y: movement.dy / duration };
            invoke('inertia').manifest(velocity);

            window._lastPinchDistance = null;
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  DIMENSIONAL INVOCATION
    // ═══════════════════════════════════════════════════════════

    const _manifest = new Map();

    function invoke(name) {
        const existing = _manifest.get(name);
        const result = existing ?? (() => {
            const potential = GESTURE_MANIFOLD[name];
            _manifest.set(name, potential);
            return potential;
        })();
        return result;
    }

    function observe(name) {
        return GESTURE_MANIFOLD[name];
    }

    // ═══════════════════════════════════════════════════════════
    //  AUTO-INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    function init() {
        console.log('[TouchSubstrate] Initializing...');

        // Manifest touch event listeners (exist as potential)
        const canvas = window.renderer?.domElement;

        canvas && (() => {
            canvas.addEventListener('touchstart', TouchHandlers.onTouchStart, { passive: false });
            canvas.addEventListener('touchmove', TouchHandlers.onTouchMove, { passive: false });
            canvas.addEventListener('touchend', TouchHandlers.onTouchEnd, { passive: false });
            console.log('[TouchSubstrate] ✅ Touch events bound');
        })();
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════

    const TouchSubstrate = Object.freeze({
        version: '1.0.0',
        name: 'Touch Substrate',
        identity: 0x544F554348n, // "TOUCH"

        PHI,
        evalSurface,
        GESTURE_MANIFOLD,

        invoke,
        observe,
        init
    });

    // Auto-initialize when renderer is ready
    const observer = new MutationObserver(() => {
        window.renderer && (() => {
            observer.disconnect();
            TouchSubstrate.init();
        })();
    });

    observer.observe(document, { childList: true, subtree: true });

    window.TouchSubstrate = TouchSubstrate;
    console.log('[TouchSubstrate] Loaded — φ=' + PHI.toFixed(4));

})(window);

