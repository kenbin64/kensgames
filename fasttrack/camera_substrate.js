/**
 * 📷 CAMERA SUBSTRATE
 * ButterflyFX Dimensional Pattern: Camera exists on observation manifold
 * 
 * Controls all camera movements, views, and transitions.
 * Camera position is computed as: z = f(player, action, time)
 * 
 * Views:
 *   - Chase: follows active peg
 *   - Bird's Eye: top-down strategic view
 *   - Peg's Eye: first-person from peg perspective
 *   - Fixed Angled: manual control mode
 *   - Cinematic: cutscene camera paths
 * 
 * @requires THREE.js
 */

const CameraSubstrate = {
    // Substrate identity
    name: 'Camera',
    version: '1.0.0',
    layer: 'View',
    
    // Golden ratio for smooth transitions
    PHI: 1.618033988749895,
    
    // Camera modes
    MODES: {
        CHASE: 'chase',
        BIRDS_EYE: 'birds-eye',
        PEGS_EYE: 'pegs-eye',
        FIXED: 'fixed-angled',
        CINEMATIC: 'cinematic'
    },
    
    // State
    state: {
        currentMode: 'chase',
        isTransitioning: false,
        targetPosition: null,
        targetLookAt: null,
        followTarget: null,  // Peg mesh to follow
        manualOverride: false,
    },
    
    // Configuration
    config: {
        transitionDuration: 800,  // ms
        chaseDistance: 150,
        chaseHeight: 120,
        birdsEyeHeight: 500,
        cinematicSpeed: 0.5,
    },
    
    // References
    camera: null,
    controls: null,
    scene: null,
    
    /**
     * Initialize camera substrate
     */
    init: function(camera, controls, scene) {
        this.camera = camera;
        this.controls = controls;
        this.scene = scene;
        
        console.log('📷 [CameraSubstrate] Initialized');
        return this;
    },
    
    /**
     * Set camera mode
     */
    setMode: function(mode, options) {
        options = options || {};
        if (this.state.isTransitioning && !options.force) return this;
        
        this.state.currentMode = mode;
        console.log(`📷 [CameraSubstrate] Mode: ${mode}`);
        
        switch (mode) {
            case this.MODES.CHASE:
                this.enableChaseMode(options.target);
                break;
            case this.MODES.BIRDS_EYE:
                this.transitionTo({ x: 0, y: this.config.birdsEyeHeight, z: 0 }, { x: 0, y: 0, z: 0 });
                break;
            case this.MODES.PEGS_EYE:
                this.enablePegsEyeMode(options.peg);
                break;
            case this.MODES.FIXED:
                this.enableManualControl();
                break;
            case this.MODES.CINEMATIC:
                this.playCinematicPath(options.path);
                break;
        }
        
        return this;
    },
    
    /**
     * Enable chase camera that follows active peg
     */
    enableChaseMode: function(target) {
        this.state.followTarget = target;
        this.state.manualOverride = false;
        if (this.controls) this.controls.enabled = false;
        return this;
    },
    
    /**
     * Enable peg's eye view (first person from peg)
     */
    enablePegsEyeMode: function(peg) {
        if (!peg || !peg.mesh) return this;
        
        const pegPos = peg.mesh.position;
        const lookDir = new THREE.Vector3(0, 0, 0).sub(pegPos).normalize();
        
        this.camera.position.set(
            pegPos.x + lookDir.x * 20,
            pegPos.y + 15,
            pegPos.z + lookDir.z * 20
        );
        this.camera.lookAt(0, 0, 0);
        
        return this;
    },
    
    /**
     * Enable manual orbit controls
     */
    enableManualControl: function() {
        this.state.manualOverride = true;
        if (this.controls) this.controls.enabled = true;
        return this;
    },
    
    /**
     * Smooth transition to target position
     */
    transitionTo: function(targetPos, lookAtPos, duration, callback) {
        duration = duration || this.config.transitionDuration;
        
        const startPos = this.camera.position.clone();
        const startTime = performance.now();
        this.state.isTransitioning = true;
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const eased = this.easeOutCubic(t);
            
            this.camera.position.lerpVectors(startPos, new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z), eased);
            if (lookAtPos) this.camera.lookAt(lookAtPos.x, lookAtPos.y, lookAtPos.z);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.state.isTransitioning = false;
                if (callback) callback();
            }
        };
        
        requestAnimationFrame(animate);
        return this;
    },
    
    /**
     * Easing function (φ-influenced)
     */
    easeOutCubic: function(t) {
        return 1 - Math.pow(1 - t, 3);
    }
};

// Export
window.CameraSubstrate = CameraSubstrate;
if (typeof SubstrateManifold !== 'undefined') SubstrateManifold.register(CameraSubstrate);
console.log('📷 [CameraSubstrate] Module loaded');

