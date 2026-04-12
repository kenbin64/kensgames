/**
 * 🎮 MOBILE TOUCH ENGINE
 * =====================
 * Advanced touch gesture system for FastTrack mobile gameplay
 * 
 * Features:
 * - Pinch to zoom (smooth, inertial)
 * - Two-finger rotate
 * - Swipe to navigate
 * - Tap to select
 * - Long-press for context
 * - Haptic feedback
 * - Gesture recognition
 */

class MobileTouchEngine {
    constructor() {
        this.gestures = {
            tap: { threshold: 10, maxDuration: 300 },
            longPress: { threshold: 10, minDuration: 500 },
            swipe: { minDistance: 50, maxDuration: 500 },
            pinch: { minScale: 0.5, maxScale: 3 },
            rotate: { minAngle: 5 }
        };
        
        this.state = {
            touching: false,
            touches: [],
            startTime: 0,
            startPos: { x: 0, y: 0 },
            currentPos: { x: 0, y: 0 },
            lastScale: 1,
            lastRotation: 0,
            velocity: { x: 0, y: 0 },
            inertia: { active: false, vx: 0, vy: 0 }
        };
        
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.canvas = null;
        
        this.init();
    }
    
    init() {
        console.log('🎮 Mobile Touch Engine — Initializing');
        
        // Wait for Three.js scene to be ready
        this.waitForScene();
        
        // Enable haptic feedback if available
        this.hapticEnabled = 'vibrate' in navigator;
        
        // Prevent default touch behaviors
        this.preventDefaults();
    }
    
    waitForScene() {
        const check = setInterval(() => {
            if (window.camera && window.scene && window.renderer) {
                this.camera = window.camera;
                this.scene = window.scene;
                this.renderer = window.renderer;
                this.canvas = this.renderer.domElement;
                
                clearInterval(check);
                this.setupTouchHandlers();
                console.log('✅ Touch Engine — Scene ready');
            }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => clearInterval(check), 10000);
    }
    
    preventDefaults() {
        // Prevent pull-to-refresh, pinch-zoom on page
        document.body.style.touchAction = 'none';
        document.body.style.overscrollBehavior = 'none';
        
        // Prevent context menu on long press
        document.addEventListener('contextmenu', e => e.preventDefault());
    }
    
    setupTouchHandlers() {
        const canvas = this.canvas;
        
        // Touch start
        canvas.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
        
        // Touch move
        canvas.addEventListener('touchmove', e => this.onTouchMove(e), { passive: false });
        
        // Touch end
        canvas.addEventListener('touchend', e => this.onTouchEnd(e), { passive: false });
        
        // Touch cancel
        canvas.addEventListener('touchcancel', e => this.onTouchEnd(e), { passive: false });
        
        console.log('✅ Touch handlers registered');
    }
    
    onTouchStart(e) {
        e.preventDefault();
        
        this.state.touching = true;
        this.state.touches = Array.from(e.touches);
        this.state.startTime = Date.now();
        
        if (e.touches.length === 1) {
            // Single touch - potential tap, long-press, or swipe
            const touch = e.touches[0];
            this.state.startPos = { x: touch.clientX, y: touch.clientY };
            this.state.currentPos = { x: touch.clientX, y: touch.clientY };
            
            // Start long-press timer
            this.longPressTimer = setTimeout(() => {
                this.onLongPress(touch);
            }, this.gestures.longPress.minDuration);
            
        } else if (e.touches.length === 2) {
            // Two-finger gesture - pinch or rotate
            this.handleTwoFingerStart(e.touches);
        }
    }
    
    onTouchMove(e) {
        e.preventDefault();

        if (!this.state.touching) return;

        // Cancel long-press if moved
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (e.touches.length === 1) {
            this.handleSingleFingerMove(e.touches[0]);
        } else if (e.touches.length === 2) {
            this.handleTwoFingerMove(e.touches);
        }
    }

    onTouchEnd(e) {
        e.preventDefault();

        const duration = Date.now() - this.state.startTime;
        const distance = this.getDistance(this.state.startPos, this.state.currentPos);

        // Clear long-press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // Detect gesture type
        if (e.touches.length === 0) {
            // All fingers lifted
            if (duration < this.gestures.tap.maxDuration && distance < this.gestures.tap.threshold) {
                this.onTap(this.state.currentPos);
            } else if (distance >= this.gestures.swipe.minDistance && duration < this.gestures.swipe.maxDuration) {
                this.onSwipe(this.state.startPos, this.state.currentPos, duration);
            }

            // Apply inertia if moving fast
            if (this.state.velocity.x !== 0 || this.state.velocity.y !== 0) {
                this.applyInertia();
            }

            this.state.touching = false;
        }
    }

    // ============================================================
    // SINGLE FINGER GESTURES
    // ============================================================

    handleSingleFingerMove(touch) {
        const prevPos = this.state.currentPos;
        this.state.currentPos = { x: touch.clientX, y: touch.clientY };

        // Calculate velocity for inertia
        const dx = this.state.currentPos.x - prevPos.x;
        const dy = this.state.currentPos.y - prevPos.y;
        this.state.velocity = { x: dx, y: dy };

        // Pan camera (orbit around board)
        this.panCamera(dx, dy);
    }

    panCamera(dx, dy) {
        if (!this.camera || !window.controls) return;

        // Rotate camera around target
        const sensitivity = 0.005;

        if (window.controls.enabled) {
            // Use OrbitControls if available
            const azimuth = -dx * sensitivity;
            const polar = -dy * sensitivity;

            // Manually adjust controls
            if (window.controls.getAzimuthalAngle) {
                const currentAzimuth = window.controls.getAzimuthalAngle();
                const currentPolar = window.controls.getPolarAngle();

                // Smooth rotation
                window.controls.rotateLeft(azimuth);
                window.controls.rotateUp(polar);
            }
        } else {
            // Manual camera rotation
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(this.camera.position);

            spherical.theta -= dx * sensitivity;
            spherical.phi -= dy * sensitivity;

            // Clamp phi to prevent flipping
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            this.camera.position.setFromSpherical(spherical);
            this.camera.lookAt(0, 0, 0);
        }
    }

    // ============================================================
    // TWO FINGER GESTURES (Pinch & Rotate)
    // ============================================================

    handleTwoFingerStart(touches) {
        const touch1 = touches[0];
        const touch2 = touches[1];

        // Calculate initial distance (for pinch)
        this.state.lastScale = this.getDistance(
            { x: touch1.clientX, y: touch1.clientY },
            { x: touch2.clientX, y: touch2.clientY }
        );

        // Calculate initial angle (for rotation)
        this.state.lastRotation = this.getAngle(
            { x: touch1.clientX, y: touch1.clientY },
            { x: touch2.clientX, y: touch2.clientY }
        );
    }

    handleTwoFingerMove(touches) {
        const touch1 = touches[0];
        const touch2 = touches[1];

        const pos1 = { x: touch1.clientX, y: touch1.clientY };
        const pos2 = { x: touch2.clientX, y: touch2.clientY };

        // PINCH TO ZOOM
        const currentDistance = this.getDistance(pos1, pos2);
        const scaleDelta = currentDistance / this.state.lastScale;
        this.handlePinchZoom(scaleDelta);
        this.state.lastScale = currentDistance;

        // TWO-FINGER ROTATE
        const currentAngle = this.getAngle(pos1, pos2);
        const angleDelta = currentAngle - this.state.lastRotation;
        if (Math.abs(angleDelta) > this.gestures.rotate.minAngle) {
            this.handleRotate(angleDelta);
            this.state.lastRotation = currentAngle;
        }
    }

    handlePinchZoom(scaleDelta) {
        if (!this.camera) return;

        // Smooth zoom with limits
        const zoomSpeed = 0.1;
        const minDistance = 200;
        const maxDistance = 1200;

        const currentDistance = this.camera.position.length();
        const targetDistance = currentDistance / (1 + (scaleDelta - 1) * zoomSpeed);
        const clampedDistance = Math.max(minDistance, Math.min(maxDistance, targetDistance));

        // Apply zoom
        const direction = this.camera.position.clone().normalize();
        this.camera.position.copy(direction.multiplyScalar(clampedDistance));

        // Haptic feedback on zoom
        this.haptic(10);
    }

    handleRotate(angleDelta) {
        if (!this.camera) return;

        // Rotate camera around Z-axis (board rotation)
        const rotationSpeed = 0.01;
        const rotation = angleDelta * rotationSpeed;

        // Apply rotation to camera position
        const x = this.camera.position.x;
        const y = this.camera.position.y;

        this.camera.position.x = x * Math.cos(rotation) - y * Math.sin(rotation);
        this.camera.position.y = x * Math.sin(rotation) + y * Math.cos(rotation);

        this.camera.lookAt(0, 0, 0);
    }

    // ============================================================
    // TAP & LONG-PRESS GESTURES
    // ============================================================

    onTap(pos) {
        console.log('👆 Tap detected at', pos);

        // Raycast to detect board elements
        this.raycastTap(pos);

        // Haptic feedback
        this.haptic(5);
    }

    onLongPress(touch) {
        console.log('👆 Long-press detected');

        const pos = { x: touch.clientX, y: touch.clientY };

        // Show context menu or special action
        this.showContextMenu(pos);

        // Stronger haptic feedback
        this.haptic(20);
    }

    raycastTap(pos) {
        if (!this.camera || !this.scene) return;

        // Convert screen coordinates to normalized device coordinates
        const rect = this.canvas.getBoundingClientRect();
        const x = ((pos.x - rect.left) / rect.width) * 2 - 1;
        const y = -((pos.y - rect.top) / rect.height) * 2 + 1;

        // Create raycaster
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera({ x, y }, this.camera);

        // Check for intersections with board elements
        const intersects = raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            console.log('🎯 Hit:', hit.object.name || hit.object.type);

            // Trigger click event on the object
            if (hit.object.userData && hit.object.userData.onClick) {
                hit.object.userData.onClick(hit);
            }

            // Dispatch custom event for game logic
            window.dispatchEvent(new CustomEvent('mobile-tap', {
                detail: { object: hit.object, point: hit.point, pos }
            }));
        }
    }

    showContextMenu(pos) {
        // Dispatch event for UI to handle
        window.dispatchEvent(new CustomEvent('mobile-longpress', {
            detail: { pos }
        }));
    }

    // ============================================================
    // SWIPE GESTURES
    // ============================================================

    onSwipe(startPos, endPos, duration) {
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Determine swipe direction
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        let direction = '';

        if (angle > -45 && angle <= 45) direction = 'right';
        else if (angle > 45 && angle <= 135) direction = 'down';
        else if (angle > 135 || angle <= -135) direction = 'left';
        else direction = 'up';

        console.log(`👉 Swipe ${direction} (${distance.toFixed(0)}px in ${duration}ms)`);

        // Dispatch swipe event
        window.dispatchEvent(new CustomEvent('mobile-swipe', {
            detail: { direction, distance, duration, dx, dy }
        }));

        // Haptic feedback
        this.haptic(8);
    }

    // ============================================================
    // INERTIA & PHYSICS
    // ============================================================

    applyInertia() {
        this.state.inertia.active = true;
        this.state.inertia.vx = this.state.velocity.x;
        this.state.inertia.vy = this.state.velocity.y;

        const animate = () => {
            if (!this.state.inertia.active) return;

            // Apply friction
            const friction = 0.95;
            this.state.inertia.vx *= friction;
            this.state.inertia.vy *= friction;

            // Continue panning with inertia
            this.panCamera(this.state.inertia.vx, this.state.inertia.vy);

            // Stop when velocity is very small
            if (Math.abs(this.state.inertia.vx) < 0.1 && Math.abs(this.state.inertia.vy) < 0.1) {
                this.state.inertia.active = false;
                return;
            }

            requestAnimationFrame(animate);
        };

        animate();
    }

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    getDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getAngle(pos1, pos2) {
        return Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x) * 180 / Math.PI;
    }

    haptic(duration = 10) {
        if (this.hapticEnabled) {
            navigator.vibrate(duration);
        }
    }
}

// ============================================================
// AUTO-INITIALIZE ON MOBILE
// ============================================================

if (window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    window.addEventListener('load', () => {
        window.mobileTouchEngine = new MobileTouchEngine();
        console.log('📱 Mobile Touch Engine — Ready');
    });
}


