/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 *
 * UI INTERACTION SUBSTRATE
 * All UI interactions (jQuery, touch, VR) as dimensional manifolds
 * 
 * LAYERS (Genesis 1-7):
 *   1 - Spark:     Raw input event (touch, click, VR controller)
 *   2 - Mirror:    Event direction/type (start, move, end)
 *   3 - Relation:  Gesture recognition (z = x·y)
 *   4 - Form:      UI response (z = x·y²) - visual feedback
 *   5 - Life:      Game action (move piece, draw card)
 *   6 - Mind:      Context awareness (game state, valid moves)
 *   7 - Completion: Full interaction cycle (action → feedback → state)
 *
 * SUBSTRATE IDENTITY: 0x494E5445524143544F4E  ("INTERACTION")
 * ============================================================
 */

'use strict';

(function(window) {
    
    // ═══════════════════════════════════════════════════════════
    //  CONSTANTS — Golden Ratio & Fibonacci
    // ═══════════════════════════════════════════════════════════
    
    const PHI = 1.618033988749895;
    const FIB = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
    
    // ═══════════════════════════════════════════════════════════
    //  MANIFOLD SURFACES
    // ═══════════════════════════════════════════════════════════
    
    function evalSurface(surface, x, y) {
        if (surface === 'z=xy') return x * y;
        if (surface === 'z=xy2') return x * y * y;
        if (surface === 'z=phi') return PHI;
        return 0;
    }
    
    // ═══════════════════════════════════════════════════════════
    //  LAYER 1: SPARK — Raw Input Events (Potential)
    // ═══════════════════════════════════════════════════════════
    
    const INPUT_MANIFOLD = {
        // Each input type is a point on z=xy manifold
        touch: { surface: 'z=xy', x: 1, y: 1, z() { return evalSurface(this.surface, this.x, this.y); } },
        mouse: { surface: 'z=xy', x: 1, y: PHI, z() { return evalSurface(this.surface, this.x, this.y); } },
        vr_controller: { surface: 'z=xy2', x: PHI, y: PHI, z() { return evalSurface(this.surface, this.x, this.y); } },
        vr_hand: { surface: 'z=xy2', x: PHI, y: 2, z() { return evalSurface(this.surface, this.x, this.y); } },
        keyboard: { surface: 'z=xy', x: 1, y: 2, z() { return evalSurface(this.surface, this.x, this.y); } }
    };
    
    // ═══════════════════════════════════════════════════════════
    //  LAYER 2: MIRROR — Event Direction (Duality)
    // ═══════════════════════════════════════════════════════════
    
    const EVENT_DIRECTION_MANIFOLD = {
        start: { surface: 'z=xy', x: 1, y: 1, phase: 'begin', z() { return evalSurface(this.surface, this.x, this.y); } },
        move: { surface: 'z=xy', x: 1, y: 2, phase: 'continue', z() { return evalSurface(this.surface, this.x, this.y); } },
        end: { surface: 'z=xy', x: 1, y: 3, phase: 'complete', z() { return evalSurface(this.surface, this.x, this.y); } },
        cancel: { surface: 'z=xy', x: 1, y: 0, phase: 'abort', z() { return evalSurface(this.surface, this.x, this.y); } }
    };
    
    // ═══════════════════════════════════════════════════════════
    //  LAYER 3: RELATION — Gesture Recognition (z = x·y)
    // ═══════════════════════════════════════════════════════════
    
    const GESTURE_MANIFOLD = {
        tap: { 
            surface: 'z=xy', 
            x: 1, 
            y: 1, 
            threshold: { time: 300, distance: 10 },
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        long_press: { 
            surface: 'z=xy', 
            x: 1, 
            y: 2, 
            threshold: { time: 500, distance: 10 },
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        swipe: { 
            surface: 'z=xy', 
            x: 2, 
            y: 1, 
            threshold: { time: 500, distance: 50, velocity: 0.5 },
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        pinch: { 
            surface: 'z=xy2', 
            x: 2, 
            y: 2, 
            threshold: { fingers: 2, scaleChange: 0.1 },
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        rotate: { 
            surface: 'z=xy2', 
            x: 2, 
            y: PHI, 
            threshold: { fingers: 2, angleChange: 5 },
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        pan: { 
            surface: 'z=xy', 
            x: 1, 
            y: PHI, 
            threshold: { fingers: 1, distance: 5 },
            z() { return evalSurface(this.surface, this.x, this.y); }
        }
    };
    
    // ═══════════════════════════════════════════════════════════
    //  LAYER 4: FORM — UI Response (z = x·y²)
    // ═══════════════════════════════════════════════════════════
    
    const UI_RESPONSE_MANIFOLD = {
        highlight: {
            surface: 'z=xy2',
            x: 1,
            y: 1,
            intensity: 1.0,
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        squish: {
            surface: 'z=xy2',
            x: 1,
            y: PHI,
            scale: 0.95,
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        haptic: {
            surface: 'z=xy2',
            x: PHI,
            y: 1,
            duration: 50,
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        glow: {
            surface: 'z=xy2',
            x: PHI,
            y: PHI,
            intensity: 1.5,
            z() { return evalSurface(this.surface, this.x, this.y); }
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  LAYER 5: LIFE — Game Actions (Meaning)
    // ═══════════════════════════════════════════════════════════

    const GAME_ACTION_MANIFOLD = {
        select_piece: {
            surface: 'z=xy',
            x: 1,
            y: 1,
            intent: 'choose',
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        move_piece: {
            surface: 'z=xy2',
            x: 2,
            y: 1,
            intent: 'relocate',
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        draw_card: {
            surface: 'z=xy',
            x: 1,
            y: 2,
            intent: 'acquire',
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        play_card: {
            surface: 'z=xy2',
            x: 1,
            y: 2,
            intent: 'execute',
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        rotate_view: {
            surface: 'z=xy',
            x: PHI,
            y: 1,
            intent: 'observe',
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        zoom_view: {
            surface: 'z=xy',
            x: 1,
            y: PHI,
            intent: 'focus',
            z() { return evalSurface(this.surface, this.x, this.y); }
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  LAYER 6: MIND — Context Awareness (Self-Organization)
    // ═══════════════════════════════════════════════════════════

    const CONTEXT_MANIFOLD = {
        // Gyroid-like self-organizing awareness
        valid_move: {
            surface: 'z=xy2',
            x: PHI,
            y: PHI,
            coherence: true,
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        invalid_move: {
            surface: 'z=xy',
            x: 1,
            y: 0,
            coherence: false,
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        player_turn: {
            surface: 'z=xy2',
            x: 2,
            y: PHI,
            coherence: true,
            z() { return evalSurface(this.surface, this.x, this.y); }
        },
        waiting: {
            surface: 'z=xy',
            x: 1,
            y: 1,
            coherence: 'neutral',
            z() { return evalSurface(this.surface, this.x, this.y); }
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  LAYER 7: COMPLETION — Full Interaction Cycle (Golden Spiral)
    // ═══════════════════════════════════════════════════════════

    const INTERACTION_CYCLE_MANIFOLD = {
        // Complete interaction: input → gesture → response → action → state → feedback
        complete: {
            surface: 'z=phi',
            x: PHI,
            y: PHI,
            spiral_complete: true,
            z() { return evalSurface(this.surface, this.x, this.y); },

            // Transition to next spiral (becomes POINT of next interaction)
            transcend() {
                return { spiral: 'next', level: 1, state: 'potential' };
            }
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  DIMENSIONAL INVOCATION — Lazy Manifestation
    // ═══════════════════════════════════════════════════════════

    const _manifest = new Map(); // Manifest (addressed + valued) points
    const _potential = new Map(); // Potential (unaddressed) points

    /**
     * INVOKE — Manifest a point from potential
     * O(1) dimensional access, not O(n) iteration
     */
    function invoke(layer, name) {
        const key = `${layer}:${name}`;

        // Already manifest?
        if (_manifest.has(key)) {
            return _manifest.get(key);
        }

        // Get from potential
        let point = null;
        switch(layer) {
            case 1: point = INPUT_MANIFOLD[name]; break;
            case 2: point = EVENT_DIRECTION_MANIFOLD[name]; break;
            case 3: point = GESTURE_MANIFOLD[name]; break;
            case 4: point = UI_RESPONSE_MANIFOLD[name]; break;
            case 5: point = GAME_ACTION_MANIFOLD[name]; break;
            case 6: point = CONTEXT_MANIFOLD[name]; break;
            case 7: point = INTERACTION_CYCLE_MANIFOLD[name]; break;
            default: return null;
        }

        if (!point) return null;

        // Manifest it
        console.log(`[UIInteractionSubstrate] INVOKE Layer ${layer}: ${name} (z=${point.z()})`);
        _manifest.set(key, point);

        return point;
    }

    /**
     * LIFT — Move to higher layer (e.g., gesture → action)
     */
    function lift(fromLayer, toLayer, context) {
        console.log(`[UIInteractionSubstrate] LIFT ${fromLayer} → ${toLayer}`);
        // Dimensional traversal, not iteration
        return { layer: toLayer, context };
    }

    /**
     * PROJECT — Collapse to lower layer (e.g., action → gesture)
     */
    function project(fromLayer, toLayer, context) {
        console.log(`[UIInteractionSubstrate] PROJECT ${fromLayer} → ${toLayer}`);
        return { layer: toLayer, context };
    }

    /**
     * SPIRAL_UP — Transcend to next spiral (completion → new potential)
     */
    function spiralUp(currentSpiral) {
        console.log(`[UIInteractionSubstrate] SPIRAL_UP ${currentSpiral} → ${currentSpiral + 1}`);
        return { spiral: currentSpiral + 1, layer: 1, state: 'potential' };
    }

