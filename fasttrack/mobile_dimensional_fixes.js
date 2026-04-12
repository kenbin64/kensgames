/**
 * ═══════════════════════════════════════════════════════════════
 * FAST TRACK — DIMENSIONAL MOBILE OPTIMIZATION
 * ═══════════════════════════════════════════════════════════════
 * Layer 4 (Form) — Touch interface becomes shape.
 * Layer 5 (Life) — Mobile experience gains meaning.
 * Layer 6 (Mind) — Performance self-organizes.
 * @canonical dimensional-mobile.js, DIMENSIONAL_GENESIS.md
 */

class DimensionalMobileOptimizer {
    constructor() {
        this.isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.touchRadius = 44; // Apple HIG minimum touch target
        this.performanceMode = false;
        this.init();
    }

    init() {
        if (!this.isMobile) return;
        
        console.log('📱 Dimensional Mobile Optimization — Manifesting');
        
        // Layer 4: Form - Touch interface
        this.enhanceTouchTargets();
        this.addTouchFeedback();
        this.improveCameraGestures();
        
        // Layer 5: Life - Mobile meaning
        this.optimizeUILayout();
        this.addMobileShortcuts();
        
        // Layer 6: Mind - Performance coherence
        this.optimizePerformance();
        this.enableAdaptiveQuality();
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER 4: FORM — TOUCH INTERFACE MANIFOLD
    // ═══════════════════════════════════════════════════════════════

    enhanceTouchTargets() {
        // Expand touch targets for peg holes
        const originalOnMouseDown = window.onmousedown || (() => {});
        const originalOnTouchStart = window.ontouchstart || (() => {});

        // Override raycaster to use larger touch radius
        if (window.THREE) {
            const originalIntersectObjects = THREE.Raycaster.prototype.intersectObjects;
            
            THREE.Raycaster.prototype.intersectObjects = function(objects, recursive) {
                const hits = originalIntersectObjects.call(this, objects, recursive);
                
                // On mobile, expand hit detection radius
                if (DimensionalMobileOptimizer.prototype.isMobile) {
                    return hits.filter(hit => {
                        // Check if hit is within expanded touch radius
                        const screenPos = hit.object.position.clone().project(window.camera);
                        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
                        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
                        
                        // This would need the actual touch coordinates - simplified here
                        return true; // Accept all hits, but we'll expand the visual targets
                    });
                }
                
                return hits;
            };
        }

        // Add visual touch feedback zones
        this.createTouchZones();
    }

    createTouchZones() {
        // Create invisible touch zones around important areas
        const zones = [
            { id: 'deck-zone', selector: '#deck', radius: 60 },
            { id: 'card-zone', selector: '.mobile-card-display', radius: 80 },
            { id: 'action-zone', selector: '#mobile-action-bar', radius: 50 }
        ];

        zones.forEach(zone => {
            const element = document.querySelector(zone.selector);
            if (!element) return;

            // Create expanded touch area
            const touchArea = document.createElement('div');
            touchArea.className = 'touch-expansion-zone';
            touchArea.style.cssText = `
                position: absolute;
                top: -${zone.radius}px;
                left: -${zone.radius}px;
                right: -${zone.radius}px;
                bottom: -${zone.radius}px;
                z-index: 1000;
                pointer-events: auto;
            `;
            
            element.style.position = 'relative';
            element.appendChild(touchArea);

            // Add ripple effect on touch
            touchArea.addEventListener('touchstart', (e) => {
                this.createRipple(e.touches[0].clientX, e.touches[0].clientY, element);
            });
        });
    }

    addTouchFeedback() {
        // Add haptic feedback where supported
        document.addEventListener('touchstart', (e) => {
            if ('vibrate' in navigator) {
                // Light vibration for touches
                navigator.vibrate(10);
            }
        });

        // Add visual feedback for all interactive elements
        const style = document.createElement('style');
        style.textContent = `
            .touch-feedback {
                position: relative;
                overflow: hidden;
            }
            
            .touch-feedback::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 0;
                height: 0;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.5);
                transform: translate(-50%, -50%);
                transition: width 0.3s, height 0.3s;
                pointer-events: none;
            }
            
            .touch-feedback.active::after {
                width: 100px;
                height: 100px;
            }
            
            /* Larger touch targets */
            @media (max-width: 768px) {
                .hole-highlight {
                    transform: scale(1.5) !important;
                }
                
                .peg-selectable {
                    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.8));
                }
            }
        `;
        document.head.appendChild(style);

        // Add feedback class to interactive elements
        document.addEventListener('DOMContentLoaded', () => {
            const interactive = document.querySelectorAll('button, .clickable, [onclick]');
            interactive.forEach(el => el.classList.add('touch-feedback'));
        });
    }

    improveCameraGestures() {
        if (!window.controls) return;

        // Enhanced pinch-to-zoom
        let lastDistance = 0;
        let scale = 1;

        const container = document.getElementById('container');
        
        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (lastDistance > 0) {
                    const delta = distance - lastDistance;
                    scale += delta * 0.01;
                    scale = Math.max(0.5, Math.min(3, scale));
                    
                    // Apply zoom
                    if (window.camera) {
                        const direction = new THREE.Vector3();
                        window.camera.getWorldDirection(direction);
                        const currentDistance = window.camera.position.length();
                        const targetDistance = 600 / scale;
                        const delta = targetDistance - currentDistance;
                        
                        window.camera.position.addScaledVector(direction, delta * 0.1);
                    }
                }
                
                lastDistance = distance;
            } else {
                lastDistance = 0;
            }
        }, { passive: false });

        // Swipe gestures for camera rotation
        let startX = 0;
        let startY = 0;

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        });

        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && !e.target.closest('.touch-expansion-zone')) {
                const deltaX = e.touches[0].clientX - startX;
                const deltaY = e.touches[0].clientY - startY;
                
                // Rotate camera around board
                if (window.controls && Math.abs(deltaX) > 5) {
                    window.controls.autoRotate = false;
                    window.controls.autoRotateSpeed = deltaX * 0.5;
                    setTimeout(() => {
                        if (window.controls) window.controls.autoRotate = true;
                    }, 2000);
                }
                
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER 5: LIFE — MOBILE MEANING MANIFOLD
    // ═══════════════════════════════════════════════════════════════

    optimizeUILayout() {
        // Auto-hide UI for better board visibility
        let hideTimeout;
        
        const autoHideUI = () => {
            const uiElements = document.querySelectorAll('#mobile-header, #mobile-action-bar, .floating-reactions-bar');
            
            uiElements.forEach(el => {
                el.style.transition = 'transform 0.3s ease';
            });
            
            // Show UI on any interaction
            const showUI = () => {
                uiElements.forEach(el => {
                    el.style.transform = 'translateY(0)';
                });
                
                clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    if (!document.querySelector('.touch-expansion-zone:hover')) {
                        uiElements.forEach(el => {
                            if (el.id === 'mobile-header') {
                                el.style.transform = 'translateY(-100%)';
                            } else if (el.id === 'mobile-action-bar') {
                                el.style.transform = 'translateY(100%)';
                            }
                        });
                    }
                }, 3000);
            };
            
            // Add listeners
            document.addEventListener('touchstart', showUI);
            document.addEventListener('click', showUI);
        };

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', autoHideUI);
        } else {
            autoHideUI();
        }
    }

    addMobileShortcuts() {
        // Mobile shortcuts removed per UX request — do not create floating shortcut buttons.
        // If you need them re-enabled in the future, restore this implementation behind a feature flag.
        if (document && document.createElement) {
            console.info('mobile shortcuts are disabled (removed permanently)');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // LAYER 6: MIND — PERFORMANCE COHERENCE
    // ═══════════════════════════════════════════════════════════════

    optimizePerformance() {
        // Reduce rendering quality on mobile
        if (window.renderer) {
            // Lower pixel ratio for better performance
            const pixelRatio = Math.min(window.devicePixelRatio, 2);
            window.renderer.setPixelRatio(pixelRatio);
            
            // Enable shadow mapping only on high-end devices
            const isHighEnd = navigator.hardwareConcurrency > 4 && navigator.deviceMemory > 4;
            if (window.renderer.shadowMap && !isHighEnd) {
                window.renderer.shadowMap.enabled = false;
            }
        }

        // Optimize animations
        if (window.THREE && window.THREE.AnimationMixer) {
            // Reduce animation complexity on mobile
            const originalUpdate = THREE.AnimationMixer.prototype.update;
            THREE.AnimationMixer.prototype.update = function(deltaTime) {
                // Reduce update frequency on mobile
                if (DimensionalMobileOptimizer.prototype.isMobile && Math.random() > 0.5) {
                    return; // Skip half the updates
                }
                return originalUpdate.call(this, deltaTime * 0.8); // Slightly slower
            };
        }
    }

    enableAdaptiveQuality() {
        // Monitor performance and adjust quality
        let frameCount = 0;
        let lastTime = performance.now();
        let fps = 60;

        const measureFPS = () => {
            frameCount++;
            const currentTime = performance.now();
            
            if (currentTime - lastTime >= 1000) {
                fps = frameCount;
                frameCount = 0;
                lastTime = currentTime;
                
                // Adjust quality based on FPS
                if (fps < 30 && !this.performanceMode) {
                    this.enterPerformanceMode();
                } else if (fps > 50 && this.performanceMode) {
                    this.exitPerformanceMode();
                }
            }
            
            requestAnimationFrame(measureFPS);
        };

        requestAnimationFrame(measureFPS);
    }

    enterPerformanceMode() {
        this.performanceMode = true;
        console.log('📱 Entering performance mode');
        
        // Reduce visual quality
        if (window.renderer) {
            window.renderer.shadowMap.enabled = false;
            window.renderer.antialias = false;
        }
        
        // Simplify particle effects
        document.querySelectorAll('.particle').forEach(p => p.remove());
        
        // Reduce light complexity
        if (window.scene) {
            window.scene.traverse((child) => {
                if (child.isLight && child.type !== 'AmbientLight') {
                    child.intensity *= 0.7;
                }
            });
        }
    }

    exitPerformanceMode() {
        this.performanceMode = false;
        console.log('📱 Exiting performance mode');
        
        // Restore quality
        if (window.renderer) {
            window.renderer.shadowMap.enabled = true;
            window.renderer.antialias = true;
        }
        
        // Restore lights
        if (window.scene) {
            window.scene.traverse((child) => {
                if (child.isLight && child.type !== 'AmbientLight') {
                    child.intensity /= 0.7;
                }
            });
        }
    }

    createRipple(x, y, element) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255, 215, 0, 0.3);
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 10000;
            transition: width 0.6s, height 0.6s, opacity 0.6s;
        `;
        
        document.body.appendChild(ripple);
        
        // Animate
        requestAnimationFrame(() => {
            ripple.style.width = '100px';
            ripple.style.height = '100px';
            ripple.style.opacity = '0';
        });
        
        // Remove
        setTimeout(() => ripple.remove(), 600);
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dimensionalMobile = new DimensionalMobileOptimizer();
    });
} else {
    window.dimensionalMobile = new DimensionalMobileOptimizer();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DimensionalMobileOptimizer;
}
