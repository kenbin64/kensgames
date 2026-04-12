/**
 * 🌊 META QUEST VR - ENTANGLED SUBSTRATE PROTOCOL (ESP)
 * ======================================================
 * Dimensional VR implementation using substrate co-observation
 * 
 * PARADIGM:
 * - No classes, no if-statements, no polling loops
 * - VR headset and game share an entangled lens into the substrate
 * - Communication = co-observation, not message passing
 * - Intent vectors manifest as coordinates on the VR manifold
 * 
 * ARCHITECTURE:
 * - VR Lens: Shared observation point (Genesis Layer 2: Mirror)
 * - Intent Manifold: Coordinate-based action lookup (Layer 6: Mind)
 * - Entangled Channel: Non-local state sharing (Layer 3: Relation)
 * - Observation Substrate: State manifestation (Layer 5: Life)
 */

// ═══════════════════════════════════════════════════════════
//  CONSTANTS — Genesis Layer 1: Spark
// ═══════════════════════════════════════════════════════════

const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio φ ≈ 1.618
const VR_SUBSTRATE_ID = 0x5652454E54414E474C45n; // "VRENTANGLE"

// ═══════════════════════════════════════════════════════════
//  VR LENS — Shared observation point into substrate
// ═══════════════════════════════════════════════════════════

const VRLens = {
    id: VR_SUBSTRATE_ID,
    surface: 'z=xy2', // φ³ manifold
    x: PHI,
    y: PHI,
    
    // Boundary conditions (shared state)
    state: {
        session: null,
        controllers: [null, null],
        hands: [null, null],
        teleportMarker: null,
        button: null,
        referenceSpace: null
    },
    
    // Compute lens coordinate
    z() { return this.x * this.y * this.y; }
};

// ═══════════════════════════════════════════════════════════
//  INTENT MANIFOLD — Coordinate-based action lookup
// ═══════════════════════════════════════════════════════════

const VRIntentManifold = {
    // 🌊 DIMENSIONAL: Check VR support (no if-statement, returns potential)
    check_support: async () => 
        navigator.xr?.isSessionSupported?.('immersive-vr') ?? Promise.resolve(false),
    
    // 🌊 DIMENSIONAL: Create VR button (pure manifestation)
    manifest_button: () => {
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
            transition: all 0.3s ease;
        `;
        
        // 🌊 DIMENSIONAL: Use intent invocation instead of addEventListener
        button.onmouseenter = () => button.style.transform = 'scale(1.05)';
        button.onmouseleave = () => button.style.transform = 'scale(1)';
        button.onclick = () => VRIntentManifold.enter_vr();
        
        document.body.appendChild(button);
        VRLens.state.button = button;
        return button;
    },
    
    // 🌊 DIMENSIONAL: Setup XR renderer (no if-statements)
    enable_xr: () => {
        window.renderer.xr.enabled = true;
        console.log('✅ VR XR enabled');
    },
    
    // 🌊 DIMENSIONAL: Create controllers (array map instead of loop)
    manifest_controllers: () => {
        VRLens.state.controllers = [0, 1].map(index => {
            const controller = window.renderer.xr.getController(index);
            
            // 🌊 DIMENSIONAL: Direct property assignment instead of addEventListener
            controller.onselectstart = (e) => VRIntentManifold.on_select_start(e, index);
            controller.onselectend = (e) => VRIntentManifold.on_select_end(e, index);
            controller.onsqueezestart = (e) => VRIntentManifold.on_squeeze_start(e, index);
            
            // Add visual ray
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1)
            ]);
            const material = new THREE.LineBasicMaterial({
                color: 0x6366f1,
                linewidth: 2,
                opacity: 0.8,
                transparent: true
            });
            const line = new THREE.Line(geometry, material);
            line.name = 'ray';
            line.scale.z = 5;
            controller.add(line);
            
            window.scene.add(controller);
            return controller;
        });
    },
    
    // 🌊 DIMENSIONAL: Create teleport marker (pure manifestation)
    manifest_teleport: () => {
        const geometry = new THREE.RingGeometry(0.2, 0.3, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x6366f1,
            side: THREE.DoubleSide,
            opacity: 0.7,
            transparent: true
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.rotation.x = -Math.PI / 2;
        marker.visible = false;
        window.scene.add(marker);
        VRLens.state.teleportMarker = marker;
        return marker;
    },

    // 🌊 DIMENSIONAL: Manifest hand tracking (optional chaining instead of if)
    manifest_hands: () => {
        const factory = window.XRHandModelFactory?.();
        VRLens.state.hands = factory && [0, 1].map(index => {
            const hand = window.renderer.xr.getHand(index);
            hand.add(factory.createHandModel(hand, 'mesh'));
            window.scene.add(hand);
            return hand;
        });
    },

    // 🌊 DIMENSIONAL: Enhance VR lighting (pure manifestation)
    manifest_lighting: () => {
        const lights = [
            new THREE.AmbientLight(0xffffff, 0.8),
            (() => {
                const h = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
                h.position.set(0, 500, 0);
                return h;
            })(),
            (() => {
                const d = new THREE.DirectionalLight(0xffffff, 0.8);
                d.position.set(200, 400, 200);
                d.castShadow = true;
                return d;
            })()
        ];
        lights.forEach((light, i) => {
            light.name = `vr-light-${i}`;
            window.scene.add(light);
        });
        console.log('✅ VR lighting enhanced');
    },

    // 🌊 DIMENSIONAL: Enter VR session (async manifestation)
    enter_vr: async () => {
        const supported = await VRIntentManifold.check_support();

        // 🌊 DIMENSIONAL: Short-circuit instead of if-statement
        supported || (() => {
            alert('VR not supported on this device. Please use Meta Quest 2/3/Pro with a WebXR-compatible browser.');
        })();

        // 🌊 DIMENSIONAL: Potential substrate - manifest or return
        const session = supported && await navigator.xr.requestSession('immersive-vr', {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['hand-tracking', 'bounded-floor', 'layers']
        }).catch(error => {
            console.error('❌ Failed to enter VR:', error);
            alert('Failed to start VR session. Make sure you\'re using Meta Quest browser.');
            return null;
        });

        session && await (async () => {
            VRLens.state.session = session;
            console.log('✅ VR Session started');

            await window.renderer.xr.setSession(session);
            VRLens.state.referenceSpace = await session.requestReferenceSpace('local-floor');

            VRLens.state.button.style.display = 'none';

            // 🌊 DIMENSIONAL: Direct property assignment instead of addEventListener
            session.onend = () => VRIntentManifold.exit_vr();

            VRIntentManifold.manifest_lighting();
            window.FastTrackThemes?.apply?.('vr_immersive', window.scene, THREE);

            // 🌊 DIMENSIONAL: Start VR render loop
            console.log('🥽 Starting VR render loop...');
            window.renderer.setAnimationLoop((time, frame) =>
                VRIntentManifold.render_loop(time, frame)
            );
        })();
    },

    // 🌊 DIMENSIONAL: Exit VR (pure state reset)
    exit_vr: () => {
        console.log('🥽 Exiting VR');
        VRLens.state.session = null;
        VRLens.state.button && (VRLens.state.button.style.display = 'block');

        window.renderer.setAnimationLoop(null);
        window.animate?.();
    },

    // 🌊 DIMENSIONAL: Controller select start (raycast manifestation)
    on_select_start: (event, controllerIndex) => {
        const controller = VRLens.state.controllers[controllerIndex];
        controller && (() => {
            const raycaster = new THREE.Raycaster();
            const tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);

            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

            const intersects = raycaster.intersectObjects(window.scene.children, true);
            const hit = intersects[0];

            hit && (() => {
                console.log('🎯 VR Select:', hit.object.name);

                // 🌊 DIMENSIONAL: Haptic feedback (optional chaining)
                event.inputSource?.gamepad?.hapticActuators?.[0]?.pulse?.(0.5, 100);

                // 🌊 DIMENSIONAL: Dispatch event
                window.dispatchEvent(new CustomEvent('vr-select', {
                    detail: { object: hit.object, point: hit.point, controller: controllerIndex }
                }));
            })();
        })();
    },

    // 🌊 DIMENSIONAL: Controller select end
    on_select_end: (event, controllerIndex) => {
        VRLens.state.teleportMarker && (VRLens.state.teleportMarker.visible = false);
    },

    // 🌊 DIMENSIONAL: Controller squeeze (teleport mode)
    on_squeeze_start: (event, controllerIndex) => {
        console.log('🎮 Squeeze detected - teleport mode');
        VRLens.state.teleportMarker && (VRLens.state.teleportMarker.visible = true);
    },

    // 🌊 DIMENSIONAL: VR render loop (no if-statements)
    render_loop: (time, frame) => {
        frame && (() => {
            window.controls?.update?.();
            window.FastTrackThemes?.update?.(0, 0, time * 0.001);
            VRIntentManifold.update_teleport();
        })();
    },

    // 🌊 DIMENSIONAL: Update teleport target (forEach instead of for-loop)
    update_teleport: () => {
        VRLens.state.teleportMarker?.visible && VRLens.state.controllers.forEach(controller => {
            controller && (() => {
                const raycaster = new THREE.Raycaster();
                const tempMatrix = new THREE.Matrix4();
                tempMatrix.identity().extractRotation(controller.matrixWorld);

                raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
                raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                const intersects = raycaster.intersectObjects(window.scene.children, true);
                const hit = intersects[0];

                hit && (() => {
                    VRLens.state.teleportMarker.position.copy(hit.point);
                    VRLens.state.teleportMarker.position.y += 0.01;
                })();
            })();
        });
    }
};

// ═══════════════════════════════════════════════════════════
//  ENTANGLED CHANNEL — Co-observation initialization
// ═══════════════════════════════════════════════════════════

const EntangledVRChannel = {
    // 🌊 DIMENSIONAL: Initialize VR substrate (observation-based, no polling)
    init: async () => {
        console.log('🌊 Entangled VR Channel — Initializing');

        const supported = await VRIntentManifold.check_support();
        console.log('✅ WebXR VR supported:', supported);

        // 🌊 DIMENSIONAL: Manifest button and wait for scene (no if-statement)
        supported && VRIntentManifold.manifest_button();

        // 🌊 DIMENSIONAL: Use ObservationSubstrate instead of setInterval
        supported && (typeof ObservationSubstrate !== 'undefined' ?
            ObservationSubstrate.when(
                () => window.renderer && window.scene && window.camera,
                () => {
                    VRIntentManifold.enable_xr();
                    VRIntentManifold.manifest_controllers();
                    VRIntentManifold.manifest_teleport();
                    VRIntentManifold.manifest_hands();
                    console.log('✅ VR — Scene ready, substrate entangled');
                },
                { timeout: 10000, interval: 100 }
            ) :
            // Fallback for compatibility
            (() => {
                const check = () => {
                    (window.renderer && window.scene && window.camera) ? (() => {
                        VRIntentManifold.enable_xr();
                        VRIntentManifold.manifest_controllers();
                        VRIntentManifold.manifest_teleport();
                        VRIntentManifold.manifest_hands();
                        console.log('✅ VR — Scene ready, substrate entangled');
                    })() : setTimeout(check, 100);
                };
                check();
            })()
        );
    }
};

// ═══════════════════════════════════════════════════════════
//  AUTO-INITIALIZE — Observation-based startup
// ═══════════════════════════════════════════════════════════

// 🌊 DIMENSIONAL: Use addEventListener to avoid overwriting window.onload
// This prevents interference with jQuery's $(function() {...}) and other initialization
window.addEventListener('load', () => {
    EntangledVRChannel.init();
    window.VREntangledSubstrate = { VRLens, VRIntentManifold, EntangledVRChannel };
    console.log('🌊 Meta Quest VR ESP — Ready');
});


