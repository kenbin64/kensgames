// ============================================================
// VICTORY CEREMONY — Crown cutscene + confetti celebration
// ============================================================
//
// Flow:
//   1. Crown descends and envelops winning peg on home hole
//   2. Camera zooms in, peg+crown rises up dramatically
//   3. "VICTORY FOR [username]!" text appears in 3D
//   4. Giant peg with crown does a slight bowing gesture
//   5. Applause sound plays
//   6. Confetti, balloons, ribbons, party icons burst in
//   7. Particles fall with gravity physics and disappear
//   8. After ~5s, "Replay?" button appears
// ============================================================

'use strict';

const VictoryCeremony = {
    active: false,
    scene: null,
    camera: null,
    renderer: null,
    ceremonyGroup: null,
    particles: [],
    animFrameId: null,
    onComplete: null,
    _savedCameraPos: null,
    _savedCameraTarget: null,
    _startTime: 0,

    // Party emoji icons for confetti
    PARTY_ICONS: ['🎉', '🎊', '🥳', '🎈', '🎁', '⭐', '✨', '💫', '🌟', '🏆', '👑', '🎯'],
    RIBBON_COLORS: [0xff0044, 0x00ccff, 0xffdd00, 0x44ff00, 0xff8800, 0xcc00ff, 0xff66aa, 0x00ffcc],

    /**
     * Initialize with Three.js scene references
     */
    init(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
    },

    /**
     * Start the full victory ceremony
     * @param {Object} winner - The winning player object { name, index, avatar, colorHex, boardPosition }
     * @param {THREE.Vector3} homePos - Position of the home hole on the board
     * @param {number} playerColor - Hex color of the player (e.g., 0xff0000)
     * @param {Function} onComplete - Called when ceremony ends and replay should show
     */
    start(winner, homePos, playerColor, onComplete) {
        if (this.active) return;
        this.active = true;
        this.onComplete = onComplete;
        this._startTime = Date.now();
        this._boardGroup = null;
        this._savedBoardRotation = 0;

        // Save camera state
        this._savedCameraPos = this.camera.position.clone();
        if (window.controls) {
            this._savedCameraTarget = window.controls.target.clone();
        }

        // Find the board group for spinning
        this.scene.traverse(child => {
            if (child.name === 'boardGroup' || (child.isGroup && child.children.length > 50 && !this._boardGroup)) {
                this._boardGroup = child;
            }
        });
        if (this._boardGroup) {
            this._savedBoardRotation = this._boardGroup.rotation.y;
        }

        // Create ceremony container
        this.ceremonyGroup = new THREE.Group();
        this.scene.add(this.ceremonyGroup);

        // ── Triumphal music starts immediately ──
        if (window.MusicSubstrate && MusicSubstrate.playVictoryFanfare) {
            MusicSubstrate.activate();
            MusicSubstrate.playVictoryFanfare();
        }

        // ── Phase 1: Crown envelops peg (0-1.5s) ──
        this._createCeremonyPeg(homePos, playerColor, winner);
        this._animateCrownEnvelop(homePos);

        // ── Phase 2: Rise up + camera zoom (1.5-3s) ──
        setTimeout(() => {
            if (!this.active) return;
            this._animateRiseAndZoom(homePos, winner);
        }, 1500);

        // ── Phase 3: Victory text + bow + applause + cheering (3-4s) ──
        setTimeout(() => {
            if (!this.active) return;
            this._showVictoryText(winner);
            this._animateBowAndSpin(homePos);
            // Play applause + crowd cheering
            if (window.GameSFX) {
                GameSFX.playApplause(6);
            }
            if (window.CrowdSubstrate && CrowdSubstrate.react) {
                CrowdSubstrate.react('cheer');
                setTimeout(() => {
                    if (this.active && CrowdSubstrate.react) CrowdSubstrate.react('cheer');
                }, 1500);
            }
        }, 3000);

        // ── Phase 4: Confetti burst (3.5-8.5s) ──
        setTimeout(() => {
            if (!this.active) return;
            this._launchConfetti();
        }, 3500);

        // ── Phase 5: Clean up and show replay (after ~8.5s) ──
        setTimeout(() => {
            if (!this.active) return;
            this._endCeremony();
        }, 8500);
    },

    /**
     * Create a large ceremony peg with golden crown at the home position
     */
    _createCeremonyPeg(homePos, playerColor, winner) {
        // Large peg body
        const pegGeo = new THREE.CylinderGeometry(6, 8, 50, 32);
        const pegMat = new THREE.MeshStandardMaterial({
            color: playerColor,
            emissive: playerColor,
            emissiveIntensity: 0.6,
            metalness: 0.3,
            roughness: 0.2,
            transparent: true,
            opacity: 0.9
        });
        const pegMesh = new THREE.Mesh(pegGeo, pegMat);
        pegMesh.position.set(homePos.x, homePos.y + 25, homePos.z);
        pegMesh.castShadow = true;
        this.ceremonyGroup.add(pegMesh);
        this._ceremonyPeg = pegMesh;

        // Flat top disc
        const discGeo = new THREE.CylinderGeometry(7, 7, 4, 32);
        const discMat = new THREE.MeshStandardMaterial({
            color: playerColor,
            emissive: playerColor,
            emissiveIntensity: 0.6,
            metalness: 0.3,
            roughness: 0.2,
            transparent: true,
            opacity: 0.9
        });
        const discMesh = new THREE.Mesh(discGeo, discMat);
        discMesh.position.y = 52;
        pegMesh.add(discMesh);

        // Crown on top
        const crownGroup = new THREE.Group();

        // Crown base ring
        const ringGeo = new THREE.TorusGeometry(8, 1.5, 8, 24);
        const crownMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            emissive: 0xffa500,
            emissiveIntensity: 0.8,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0
        });
        const ring = new THREE.Mesh(ringGeo, crownMat);
        ring.rotation.x = Math.PI / 2;
        crownGroup.add(ring);
        this._crownMat = crownMat;

        // Crown prongs
        for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2;
            const px = Math.cos(angle) * 8;
            const pz = Math.sin(angle) * 8;
            const pointGeo = new THREE.ConeGeometry(2, 7, 4);
            const pointMesh = new THREE.Mesh(pointGeo, crownMat);
            pointMesh.position.set(px, 3.5, pz);
            crownGroup.add(pointMesh);

            // Gem on each prong
            const gemGeo = new THREE.SphereGeometry(1, 8, 8);
            const gemMat = new THREE.MeshStandardMaterial({
                color: this.RIBBON_COLORS[p % this.RIBBON_COLORS.length],
                emissive: this.RIBBON_COLORS[p % this.RIBBON_COLORS.length],
                emissiveIntensity: 0.9,
                metalness: 0.7,
                roughness: 0.2,
                transparent: true,
                opacity: 0
            });
            const gem = new THREE.Mesh(gemGeo, gemMat);
            gem.position.set(px, 7.5, pz);
            crownGroup.add(gem);
            if (!this._gemMats) this._gemMats = [];
            this._gemMats.push(gemMat);
        }

        // Crown point light
        const crownLight = new THREE.PointLight(0xffd700, 0, 100);
        crownLight.position.set(0, 5, 0);
        crownGroup.add(crownLight);
        this._crownLight = crownLight;

        crownGroup.position.y = 56;
        pegMesh.add(crownGroup);
        this._ceremonyCrown = crownGroup;

        // Start peg below the board (will rise up)
        pegMesh.position.y = homePos.y - 60;
        pegMesh.scale.set(0.3, 0.3, 0.3);
    },

    /**
     * Phase 1: Crown fades in and envelops the peg position
     */
    _animateCrownEnvelop(homePos) {
        const startTime = Date.now();
        const duration = 1500;
        const peg = this._ceremonyPeg;

        const animate = () => {
            if (!this.active) return;
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / duration);
            const easeOut = 1 - Math.pow(1 - t, 3);

            // Peg rises from below board to home position
            peg.position.y = homePos.y - 60 + (homePos.y + 30 + 60) * easeOut;
            // Scale up from tiny to normal
            const scale = 0.3 + 0.7 * easeOut;
            peg.scale.set(scale, scale, scale);

            // Crown fades in
            if (this._crownMat) {
                this._crownMat.opacity = easeOut * 0.95;
            }
            if (this._gemMats) {
                this._gemMats.forEach(m => { m.opacity = easeOut * 0.95; });
            }
            if (this._crownLight) {
                this._crownLight.intensity = easeOut * 3;
            }

            if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    /**
     * Phase 2: Peg + crown rise up dramatically, camera zooms in
     */
    _animateRiseAndZoom(homePos, winner) {
        const startTime = Date.now();
        const duration = 1500;
        const peg = this._ceremonyPeg;
        const cam = this.camera;

        // Target camera position: looking at the peg from slightly above and in front
        const camTarget = new THREE.Vector3(
            homePos.x + 40,
            homePos.y + 120,
            homePos.z + 60
        );
        const camStart = cam.position.clone();

        const animate = () => {
            if (!this.active) return;
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / duration);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad

            // Peg rises higher and scales up to giant size
            peg.position.y = homePos.y + 30 + 80 * ease;
            const scale = 1 + 1.5 * ease; // grows to 2.5x
            peg.scale.set(scale, scale, scale);

            // Camera moves to dramatic position
            cam.position.lerpVectors(camStart, camTarget, ease);
            cam.lookAt(peg.position);

            if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    /**
     * Phase 3a: Show "VICTORY FOR [username]!" as HTML overlay
     */
    _showVictoryText(winner) {
        // Remove any existing
        let existing = document.getElementById('victory-ceremony-text');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'victory-ceremony-text';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '8%',
            left: '50%',
            transform: 'translate(-50%, 0) scale(0)',
            zIndex: '60000',
            textAlign: 'center',
            pointerEvents: 'none',
            transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s'
        });

        const avatar = winner.avatar || '👤';
        const colorHex = winner.colorHex || '#ffd700';

        overlay.innerHTML = `
            <div style="
                font-size: clamp(28px, 5vw, 56px);
                font-weight: 900;
                color: #ffd700;
                text-shadow: 0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,180,0,0.4), 2px 2px 4px rgba(0,0,0,0.5);
                letter-spacing: 3px;
                font-family: 'Segoe UI', system-ui, sans-serif;
                margin-bottom: 10px;
            ">👑</div>
            <div style="
                font-size: clamp(26px, 5vw, 52px);
                font-weight: 900;
                color: ${colorHex};
                text-shadow: 0 0 30px ${colorHex}80, 0 0 60px ${colorHex}40, 2px 2px 4px rgba(0,0,0,0.5);
                letter-spacing: 2px;
                font-family: 'Segoe UI', system-ui, sans-serif;
                margin-bottom: 8px;
            "><span style="font-size: 1.2em; margin-right: 8px;">${avatar}</span>${winner.name || 'Player'}</div>
            <div style="
                font-size: clamp(32px, 6vw, 64px);
                font-weight: 900;
                color: #ffd700;
                text-shadow: 0 0 40px rgba(255,215,0,0.9), 0 0 80px rgba(255,180,0,0.5), 3px 3px 6px rgba(0,0,0,0.6);
                letter-spacing: 5px;
                font-family: 'Segoe UI', system-ui, sans-serif;
                animation: victoryPulse 1s ease-in-out infinite alternate;
            ">WINS!</div>
            <style>
                @keyframes victoryPulse {
                    from { transform: scale(1); text-shadow: 0 0 40px rgba(255,215,0,0.9); }
                    to { transform: scale(1.08); text-shadow: 0 0 60px rgba(255,215,0,1), 0 0 100px rgba(255,180,0,0.6); }
                }
            </style>
        `;

        document.body.appendChild(overlay);

        // Animate in with a pop
        requestAnimationFrame(() => {
            overlay.style.transform = 'translate(-50%, 0) scale(1)';
        });

        this._victoryOverlay = overlay;
    },

    /**
     * Phase 3b: Peg bows while the entire board spins around it
     */
    _animateBowAndSpin(homePos) {
        const peg = this._ceremonyPeg;
        if (!peg) return;
        const startTime = Date.now();
        const bowDuration = 1500;
        const spinDuration = 5000; // Full board spin takes 5s
        const board = this._boardGroup;
        const boardStartRot = board ? board.rotation.y : 0;

        const animate = () => {
            if (!this.active) return;
            const elapsed = Date.now() - startTime;

            // Bow (first 1.5s): forward then back
            const bowT = Math.min(1, elapsed / bowDuration);
            const bowAngle = Math.sin(bowT * Math.PI) * 0.3;
            peg.rotation.x = bowAngle;

            // Continuous slow peg rotation
            peg.rotation.y += 0.01;

            // Board spins a full 360° over spinDuration
            const spinT = Math.min(1, elapsed / spinDuration);
            const easeInOut = spinT < 0.5
                ? 2 * spinT * spinT
                : 1 - Math.pow(-2 * spinT + 2, 2) / 2;
            if (board) {
                board.rotation.y = boardStartRot + easeInOut * Math.PI * 2;
            }

            if (spinT < 1) {
                requestAnimationFrame(animate);
            } else if (board) {
                // Snap back to original rotation
                board.rotation.y = boardStartRot;
            }
        };
        requestAnimationFrame(animate);
    },

    /**
     * Phase 4: Launch confetti, balloons, ribbons, party icons
     */
    _launchConfetti() {
        this.particles = [];
        this._confettiOverlay = document.createElement('div');
        this._confettiOverlay.id = 'victory-confetti';
        Object.assign(this._confettiOverlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            zIndex: '59000',
            pointerEvents: 'none',
            overflow: 'hidden'
        });
        document.body.appendChild(this._confettiOverlay);

        // Create particles in bursts
        const totalParticles = 120;
        const burstDelay = 50;

        for (let i = 0; i < totalParticles; i++) {
            setTimeout(() => {
                if (!this.active) return;
                this._spawnParticle();
            }, Math.random() * 2000); // spread over 2 seconds
        }

        // Start physics simulation for particles
        this._simulateParticles();
    },

    /**
     * Spawn a single confetti/balloon/ribbon/icon particle
     */
    _spawnParticle() {
        if (!this._confettiOverlay) return;

        const kind = Math.random();
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'absolute',
            pointerEvents: 'none',
            willChange: 'transform'
        });

        let width, height;

        if (kind < 0.30) {
            // Confetti square/rectangle
            width = 8 + Math.random() * 10;
            height = 6 + Math.random() * 8;
            const color = this.RIBBON_COLORS[Math.floor(Math.random() * this.RIBBON_COLORS.length)];
            const hexColor = '#' + color.toString(16).padStart(6, '0');
            Object.assign(el.style, {
                width: width + 'px',
                height: height + 'px',
                background: hexColor,
                borderRadius: Math.random() > 0.5 ? '2px' : '50%',
                opacity: '0.9'
            });
        } else if (kind < 0.50) {
            // Balloon
            width = 24 + Math.random() * 16;
            height = width * 1.3;
            const colors = ['#ff4444', '#44aaff', '#ffdd44', '#44ff88', '#ff44aa', '#aa44ff', '#ff8844'];
            const balloonColor = colors[Math.floor(Math.random() * colors.length)];
            el.innerHTML = `<svg viewBox="0 0 40 52" width="${width}" height="${height}">
                <ellipse cx="20" cy="20" rx="18" ry="20" fill="${balloonColor}" opacity="0.85"/>
                <polygon points="20,39 17,42 23,42" fill="${balloonColor}"/>
                <line x1="20" y1="42" x2="20" y2="52" stroke="${balloonColor}" stroke-width="1" opacity="0.6"/>
            </svg>`;
        } else if (kind < 0.70) {
            // Ribbon (long thin wavy strip)
            width = 4 + Math.random() * 4;
            height = 30 + Math.random() * 40;
            const color = this.RIBBON_COLORS[Math.floor(Math.random() * this.RIBBON_COLORS.length)];
            const hexColor = '#' + color.toString(16).padStart(6, '0');
            Object.assign(el.style, {
                width: width + 'px',
                height: height + 'px',
                background: `linear-gradient(180deg, ${hexColor}, ${hexColor}88)`,
                borderRadius: '2px',
                opacity: '0.8'
            });
        } else {
            // Party icon emoji
            width = 24;
            height = 24;
            const icon = this.PARTY_ICONS[Math.floor(Math.random() * this.PARTY_ICONS.length)];
            Object.assign(el.style, {
                fontSize: (20 + Math.random() * 16) + 'px',
                lineHeight: '1'
            });
            el.textContent = icon;
        }

        this._confettiOverlay.appendChild(el);

        // Random starting position (from top area, spread across width)
        const startX = Math.random() * window.innerWidth;
        const startY = -20 - Math.random() * 100; // above viewport

        this.particles.push({
            el: el,
            x: startX,
            y: startY,
            vx: (Math.random() - 0.5) * 4,          // horizontal velocity
            vy: Math.random() * 2 + 0.5,              // initial downward velocity
            gravity: 0.08 + Math.random() * 0.06,     // gravity acceleration
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 8, // spin speed
            wobble: Math.random() * Math.PI * 2,       // phase for horizontal wobble
            wobbleSpeed: 0.02 + Math.random() * 0.04,
            wobbleAmp: 0.3 + Math.random() * 0.8,
            opacity: 1,
            width: width,
            height: height
        });
    },

    /**
     * Physics simulation loop for confetti particles
     */
    _simulateParticles() {
        if (!this.active) return;

        const maxY = window.innerHeight + 50;
        let allGone = true;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Apply gravity
            p.vy += p.gravity;

            // Horizontal wobble (sinusoidal drift)
            p.wobble += p.wobbleSpeed;
            p.vx += Math.sin(p.wobble) * p.wobbleAmp * 0.1;

            // Air resistance for horizontal
            p.vx *= 0.99;

            // Update position
            p.x += p.vx;
            p.y += p.vy;

            // Rotation
            p.rotation += p.rotationSpeed;

            // Fade out near bottom
            if (p.y > maxY - 100) {
                p.opacity = Math.max(0, (maxY - p.y) / 100);
            }

            // Remove if below viewport
            if (p.y > maxY || p.opacity <= 0) {
                if (p.el.parentNode) {
                    p.el.parentNode.removeChild(p.el);
                }
                this.particles.splice(i, 1);
                continue;
            }

            allGone = false;

            // Apply transform
            p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`;
            p.el.style.opacity = p.opacity;
        }

        if (!allGone) {
            requestAnimationFrame(() => this._simulateParticles());
        }
    },

    /**
     * End the ceremony and trigger replay prompt
     */
    _endCeremony() {
        // Fade out victory text
        if (this._victoryOverlay) {
            this._victoryOverlay.style.opacity = '0';
            this._victoryOverlay.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                if (this._victoryOverlay && this._victoryOverlay.parentNode) {
                    this._victoryOverlay.parentNode.removeChild(this._victoryOverlay);
                }
                this._victoryOverlay = null;
            }, 600);
        }

        // Wait for all particles to fall (check every 200ms)
        const waitForParticles = () => {
            if (this.particles.length > 0) {
                setTimeout(waitForParticles, 200);
                return;
            }

            // Remove confetti overlay
            if (this._confettiOverlay && this._confettiOverlay.parentNode) {
                this._confettiOverlay.parentNode.removeChild(this._confettiOverlay);
            }
            this._confettiOverlay = null;

            // Remove 3D ceremony elements
            if (this.ceremonyGroup) {
                this.scene.remove(this.ceremonyGroup);
                this.ceremonyGroup.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                this.ceremonyGroup = null;
            }

            // Restore camera
            if (this._savedCameraPos) {
                this.camera.position.copy(this._savedCameraPos);
            }
            if (this._savedCameraTarget && window.controls) {
                window.controls.target.copy(this._savedCameraTarget);
                window.controls.update();
            }

            // Restore board rotation
            if (this._boardGroup && this._savedBoardRotation !== undefined) {
                this._boardGroup.rotation.y = this._savedBoardRotation;
            }

            this.active = false;
            this._ceremonyPeg = null;
            this._ceremonyCrown = null;
            this._crownMat = null;
            this._crownLight = null;
            this._gemMats = null;
            this._boardGroup = null;

            // Trigger replay prompt
            if (this.onComplete) {
                this.onComplete();
            }
        };

        waitForParticles();
    },

    /**
     * Force-stop ceremony (e.g. if user clicks away)
     */
    stop() {
        this.active = false;

        // Clean up overlays
        ['victory-ceremony-text', 'victory-confetti'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        // Clean up particles
        this.particles = [];

        // Clean up 3D
        if (this.ceremonyGroup && this.scene) {
            this.scene.remove(this.ceremonyGroup);
            this.ceremonyGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.ceremonyGroup = null;
        }

        // Restore camera
        if (this._savedCameraPos && this.camera) {
            this.camera.position.copy(this._savedCameraPos);
        }
        if (this._savedCameraTarget && window.controls) {
            window.controls.target.copy(this._savedCameraTarget);
            window.controls.update();
        }

        // Restore board rotation
        if (this._boardGroup && this._savedBoardRotation !== undefined) {
            this._boardGroup.rotation.y = this._savedBoardRotation;
        }

        this._ceremonyPeg = null;
        this._ceremonyCrown = null;
        this._crownMat = null;
        this._crownLight = null;
        this._gemMats = null;
        this._boardGroup = null;
        this._victoryOverlay = null;
        this._confettiOverlay = null;
    }
};

// Export
window.VictoryCeremony = VictoryCeremony;

console.log('🏆 [VictoryCeremony] Victory ceremony system loaded');
