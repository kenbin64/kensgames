// ============================================================
// FASTTRACK THEMES - Multi-Theme Backdrop System
// ============================================================

const FastTrackThemes = {
    currentTheme: null,
    backdropLayers: [],
    // Global multiplier to scale backdrop motion. Set to 0 to freeze movement, <1 to slow.
    motionScale: 1.0,
    _sceneObjects: [],  // All objects added to scene by themes
    spectators: [], // For interactive themes like Colosseum
    crowdState: 'idle', // idle, cheering, booing, excited
    eventIntensity: 0, // Current event reaction intensity (0-1)
    bannerTimeout: null, // For clearing banner animations

    // Theme registry
    themes: {},

    // Board color palettes for each theme
    boardPalettes: {
        default: {
            boardColor: 0xd4a574,      // Warm wood
            boardRoughness: 0.5,
            boardMetalness: 0.2,
            playerColors: [0xff0000, 0x00ff4a, 0x9400ff, 0xffdf00, 0x00d4ff, 0xff008a],
            playerNames: ['Red', 'Teal', 'Violet', 'Gold', 'Azure', 'Pink'],
            holeColor: 0x1a1a1a,
            bullseyeColor: 0xffd700
        },
        billiard: {
            boardColor: 0x0f5132,      // Classic billiard green felt
            boardRoughness: 0.9,       // Felt texture
            boardMetalness: 0.0,       // No shine on felt
            playerColors: [
                0xffd700,  // Gold (1 ball)
                0x0000cd,  // Blue (2 ball)
                0xff4500,  // Red-orange (3 ball)
                0x800080,  // Purple (4 ball)
                0xff6347,  // Tomato (5 ball)
                0x228b22   // Forest green (6 ball)
            ],
            playerNames: ['Gold', 'Blue', 'Orange', 'Purple', 'Coral', 'Green'],
            holeColor: 0x1a1a1a,       // Black pocket holes
            bullseyeColor: 0xffffff,   // White cue ball center
            railColor: 0x8b4513,       // Saddle brown wood rails
            feltTexture: true
        },
        // Speakeasy is the billiard palette — same prohibition-era aesthetic
        speakeasy: {
            boardColor: 0x0f5132,      // Classic billiard green felt
            boardRoughness: 0.9,       // Felt texture
            boardMetalness: 0.0,       // No shine on felt
            playerColors: [
                0xffd700,  // Gold
                0x0000cd,  // Blue
                0xff4500,  // Red-orange
                0x800080,  // Purple
                0xff6347,  // Tomato
                0x228b22   // Forest green
            ],
            playerNames: ['Gold', 'Blue', 'Orange', 'Purple', 'Coral', 'Green'],
            holeColor: 0x1a1a1a,       // Black pocket holes
            bullseyeColor: 0xffffff,   // White cue ball center
            railColor: 0x8b4513,       // Saddle brown wood rails
            feltTexture: true
        },
        cosmic: {
            boardColor: 0x2a2a3e,
            boardRoughness: 0.3,
            boardMetalness: 0.5,
            playerColors: [
                0xff2d7b,  // Neon magenta
                0x00ffcc,  // Cyber teal
                0xb34dff,  // Plasma purple
                0xffe633,  // Supernova yellow
                0x33aaff,  // Nebula blue
                0xa0522d   // Nova ember (sienna)
            ],
            playerNames: ['Magenta', 'Cyber', 'Plasma', 'Nova', 'Nebula', 'Blaze'],
            holeColor: 0x0a0a14,
            bullseyeColor: 0xffd700
        },
        colosseum: {
            boardColor: 0xe8dcc8,       // Travertine marble
            boardRoughness: 0.6,
            boardMetalness: 0.1,
            playerColors: [
                0xcd7f32,  // Bronze
                0x228b22,  // Forest green
                0xffd700,  // Gold
                0xa0522d,  // Sienna (darker, distinct from gold/yellow)
                0x4169e1,  // Royal blue
                0x7851a9   // Royal purple
            ],
            playerNames: ['Bronze', 'Forest', 'Gold', 'Orange', 'Royal', 'Purple'],
            holeColor: 0x3d2b1f,
            bullseyeColor: 0xffd700
        },
        spaceace: {
            boardColor: 0x1a1a2e,
            boardRoughness: 0.2,
            boardMetalness: 0.7,
            playerColors: [
                0x4169e1,  // Neptune blue
                0xc0c0c0,  // Moon gray
                0xcd5c5c,  // Mars red
                0xffd700,  // Sun yellow
                0xa0522d,  // Jupiter (sienna)
                0x9370db   // Mercury purple
            ],
            playerNames: ['Neptune', 'Moon', 'Mars', 'Sun', 'Jupiter', 'Mercury'],
            holeColor: 0x000510,
            bullseyeColor: 0x00ffff
        },
        undersea: {
            boardColor: 0x2d5a6b,       // Ocean blue-green
            boardRoughness: 0.4,
            boardMetalness: 0.3,
            playerColors: [
                0xff7f50,  // Coral
                0x32cd32,  // Lime
                0xb19cd9,  // Pastel purple
                0x00ffff,  // Cyan
                0x4b0082,  // Indigo
                0xffb347   // Pastel orange
            ],
            playerNames: ['Coral', 'Lime', 'Lavender', 'Cyan', 'Indigo', 'Tangerine'],
            holeColor: 0x001a33,
            bullseyeColor: 0x7fffd4
        },
        // Accessibility theme — colorblind-safe, no red/green, high contrast
        highcontrast: {
            boardColor: 0xd0c8b8,       // Warm light gray board
            boardRoughness: 0.6,
            boardMetalness: 0.05,
            playerColors: [
                0x0077bb,  // Strong blue
                0xb8651b,  // Burnt sienna (darker, distinct from yellow)
                0xdddddd,  // Near-white
                0xffdd00,  // Bright yellow
                0x222222,  // Near-black
                0x8844bb   // Purple
            ],
            playerNames: ['Blue', 'Orange', 'White', 'Yellow', 'Black', 'Purple'],
            holeColor: 0x2a2a2a,        // Dark gray holes
            bullseyeColor: 0xffdd00     // Bright yellow bullseye
        },
        // Fibonacci spiral theme - golden ratio inspired colors
        fibonacci: {
            boardColor: 0x2a1f14,       // Deep amber/brown
            boardRoughness: 0.4,
            boardMetalness: 0.3,
            playerColors: [
                0xffd700,  // Gold (the golden ratio color)
                0xf4a460,  // Sandy brown (sunflower)
                0xdaa520,  // Goldenrod
                0xa0522d,  // Sienna (nautilus shell)
                0xb8860b,  // Dark goldenrod
                0xe6be8a   // Pale gold
            ],
            playerNames: ['Gold', 'Sunflower', 'Amber', 'Nautilus', 'Bronze', 'Cream'],
            holeColor: 0x0d0906,        // Near black with warm tint
            bullseyeColor: 0xffd700     // Pure gold for the spiral center
        },
        // VR Immersive theme - 4D realistic cosmic environments
        vr_immersive: {
            boardColor: 0x1a1a2e,
            boardRoughness: 0.2,
            boardMetalness: 0.7,
            playerColors: [
                0xff6b6b,  // Cosmic red
                0x4ecdc4,  // Teal nebula
                0xffe66d,  // Solar yellow
                0xa8e6cf,  // Mint aurora
                0xff8fab,  // Pink supernova
                0x95e1d3   // Aqua galaxy
            ],
            playerNames: ['Cosmic', 'Nebula', 'Solar', 'Aurora', 'Nova', 'Galaxy'],
            holeColor: 0x0a0a1e,
            bullseyeColor: 0xffffff
        }
    },

    // Get current board palette
    getBoardPalette: function () {
        return this.boardPalettes[this.currentTheme] || this.boardPalettes.default;
    },

    // Register a theme
    register: function (name, themeConfig) {
        this.themes[name] = themeConfig;
    },

    // Clear current backdrop
    clearBackdrop: function (scene) {
        // Remove ALL objects added by themes (ships, planets, coral, lights, etc.)
        this._sceneObjects.forEach(obj => {
            scene.remove(obj);
            if (obj.traverse) {
                obj.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
        });
        this._sceneObjects = [];
        this.backdropLayers.forEach(layer => {
            if (layer.mesh) {
                scene.remove(layer.mesh);
                if (layer.mesh.geometry) layer.mesh.geometry.dispose();
                if (layer.mesh.material) {
                    if (Array.isArray(layer.mesh.material)) {
                        layer.mesh.material.forEach(m => m.dispose());
                    } else {
                        layer.mesh.material.dispose();
                    }
                }
            }
        });
        // Also clear spectators from the scene
        this.spectators.forEach(spec => {
            scene.remove(spec);
            spec.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });
        // Clear emperor box if exists
        if (this.emperorBox) {
            scene.remove(this.emperorBox);
            this.emperorBox = null;
        }
        // Clear theme-specific references
        if (this.ships) {
            this.ships.forEach(s => { scene.remove(s); });
            this.ships = null;
        }
        this.backdropLayers = [];
        this.spectators = [];
        this.crowdState = 'idle';
    },

    // Apply a theme
    apply: function (themeName, scene, THREE) {
        console.log('[FastTrackThemes] Applying theme:', themeName);
        console.log('[FastTrackThemes] Available themes:', Object.keys(this.themes));

        if (!this.themes[themeName]) {
            console.error(`Theme "${themeName}" not found. Available:`, Object.keys(this.themes));
            return;
        }

        try {
            this.clearBackdrop(scene);
            this.currentTheme = themeName;

            // Intercept scene.add to track all theme objects
            const origAdd = scene.add.bind(scene);
            const tracked = this._sceneObjects;
            scene.add = function (obj) {
                tracked.push(obj);
                return origAdd(obj);
            };

            console.log('[FastTrackThemes] Calling create for theme:', themeName);
            this.themes[themeName].create(scene, THREE, this);

            // Restore original scene.add
            scene.add = origAdd;

            console.log('[FastTrackThemes] Theme created successfully. Backdrop layers:', this.backdropLayers.length, 'Scene objects:', this._sceneObjects.length);

            // Ensure all backdrop/theme objects render behind the board and pegs
            // Board renderOrder=1, Pegs renderOrder=2, so backdrop must be 0 or below
            // NOTE: BOARD_SAFE_ZONE push-out is intentionally disabled — it destroys immersive
            // room themes (billiard, speakeasy) that are built around the board geometry.
            // Backdrop-only themes that need spatial separation must handle their own positioning.

            this._sceneObjects.forEach(obj => {
                obj.renderOrder = -1;

                if (obj.traverse) {
                    obj.traverse(child => {
                        child.renderOrder = -1;
                    });
                }
            });

            // Trigger board retheming if function exists
            if (typeof window.applyBoardTheme === 'function') {
                window.applyBoardTheme(this.getBoardPalette());
            }

            console.log(`Theme "${themeName}" applied`);
        } catch (error) {
            console.error('[FastTrackThemes] Error applying theme:', error);
        }
    },

    // Update parallax and animations
    update: function (mouseX, mouseY, gameEvent) {
        const time = Date.now() * 0.001;

        // Update crowd reaction if theme supports it
        if (gameEvent && this.themes[this.currentTheme]?.onGameEvent) {
            this.themes[this.currentTheme].onGameEvent(gameEvent, this);
        }

        this.backdropLayers.forEach((layer) => {
            const mesh = layer.mesh;
            if (!mesh) return;

            // Parallax offset with position constraints to prevent drift into board area
            if (layer.parallaxFactor > 0) {
                const maxDrift = layer.maxDrift || 300; // Maximum drift from initial position
                const minDistance = 400; // Minimum distance from board center

                // Scale parallax by global motionScale so we can slow/freeze background motion
                const parallaxFactor = (layer.parallaxFactor || 0) * (this.motionScale === undefined ? 1 : this.motionScale);
                const targetX = -mouseX * parallaxFactor * 50;
                const targetZ = -mouseY * parallaxFactor * 30;

                // Apply parallax with damping
                let newX = mesh.position.x + (targetX - mesh.position.x) * 0.001;
                let newZ = mesh.position.z + (targetZ - mesh.position.z) * 0.001;

                // Clamp to max drift
                newX = Math.max(-maxDrift, Math.min(maxDrift, newX));
                newZ = Math.max(-maxDrift, Math.min(maxDrift, newZ));

                // Enforce minimum distance from board center
                const dist = Math.sqrt(newX ** 2 + newZ ** 2);
                if (dist < minDistance && dist > 0) {
                    const scale = minDistance / dist;
                    newX *= scale;
                    newZ *= scale;
                }

                mesh.position.x = newX;
                mesh.position.z = newZ;
            }

            // Subtle rotation for depth (time-based, not frame-based)
            if (layer.rotationSpeed) {
                const dt = Math.min(0.033, 1 / 60); // Cap at ~30fps equivalent to prevent fast-monitor speedup
                const rotationScale = (this.motionScale === undefined ? 1 : this.motionScale);
                mesh.rotation.y += layer.rotationSpeed * rotationScale * dt * 60; // Normalize to 60fps
            }

            // Floating animation for geometric shapes
            if (layer.isFloating && mesh.children) {
                mesh.children.forEach(child => {
                    if (child.userData.floatSpeed) {
                        child.position.y += Math.sin(time * child.userData.floatSpeed + (child.userData.floatOffset || 0)) * 0.02;
                    }
                    if (child.userData.rotSpeed) {
                        child.rotation.x += child.userData.rotSpeed * 0.2;
                        child.rotation.z += child.userData.rotSpeed * 0.14;
                    }
                });
            }

            // Pulsing glow effect
            if (layer.pulseSpeed && mesh.material) {
                mesh.material.opacity = 0.08 + Math.sin(time * layer.pulseSpeed * 10) * 0.04;
            }

            // Update shader time uniforms
            if (mesh.material && mesh.material.uniforms && mesh.material.uniforms.time) {
                mesh.material.uniforms.time.value = time;
            }

            // Custom update function
            if (layer.update) {
                layer.update(mesh, time, this);
            }
        });
    },

    // Trigger crowd reaction (for interactive themes)
    triggerCrowdReaction: function (reaction) {
        this.crowdState = reaction;
        if (this.themes[this.currentTheme]?.triggerCrowd) {
            this.themes[this.currentTheme].triggerCrowd(reaction, this);
        }
    },

    // Set global motion scale for backdrop layers (0 = frozen, 1 = normal, <1 = slower)
    setMotionScale: function (scale) {
        if (typeof scale !== 'number' || isNaN(scale)) return;
        this.motionScale = Math.max(0, scale);
        console.log('[FastTrackThemes] motionScale set to', this.motionScale);
    },

    // ============================================================
    // GAME EVENT SYSTEM - React to gameplay moments
    // ============================================================

    // Trigger a game event (fasttrack, sendHome, win, etc.)
    triggerGameEvent: function (eventType, data = {}) {
        console.log(`Game Event: ${eventType}`, data);
        this.eventIntensity = 1.0;

        // Show appropriate banner + visual crowd + audio crowd
        switch (eventType) {
            case 'fasttrack':
                this.showBanner('FAST TRACK!', '#FFD700', '#FF4500', data.playerColor);
                this.triggerCrowdReaction('roaring');
                if (window.GameSFX) GameSFX.playCrowdReaction('roaring');
                break;
            case 'sendHome':
                this.showBanner("SEND 'EM HOME!", '#FF4444', '#8B0000', data.playerColor);
                this.triggerCrowdReaction('cheering');
                if (window.GameSFX) GameSFX.playCrowdReaction('cheering');
                break;
            case 'win':
                this.showBanner('VICTORY!', '#FFD700', '#4B0082', data.playerColor);
                this.triggerCrowdReaction('roaring');
                if (window.GameSFX) GameSFX.playCrowdReaction('roaring');
                break;
            case 'bullseye':
                this.showBullseyeBanner(data.playerColor, data.playerName);
                this.triggerCrowdReaction('excited');
                if (window.GameSFX) GameSFX.playCrowdReaction('excited');
                break;
            case 'royal':
                this.showRoyalBanner(data.playerColor, data.playerName);
                this.triggerCrowdReaction('roaring');
                if (window.GameSFX) GameSFX.playCrowdReaction('roaring');
                break;
        }

        // Theme-specific reactions
        if (this.themes[this.currentTheme]?.onGameEvent) {
            this.themes[this.currentTheme].onGameEvent(eventType, data, this);
        }

        // Amplify all animations temporarily
        this.backdropLayers.forEach(layer => {
            if (layer.mesh) {
                layer.eventBoost = 2.0; // Double animation intensity
            }
        });

        // Decay event intensity over time
        if (this.eventDecayInterval) clearInterval(this.eventDecayInterval);
        this.eventDecayInterval = setInterval(() => {
            this.eventIntensity *= 0.95;
            this.backdropLayers.forEach(layer => {
                if (layer.eventBoost) {
                    layer.eventBoost = 1.0 + (layer.eventBoost - 1.0) * 0.95;
                }
            });
            if (this.eventIntensity < 0.01) {
                clearInterval(this.eventDecayInterval);
                this.eventIntensity = 0;
            }
        }, 50);
    },

    // Show bullseye banner with animated target graphic
    showBullseyeBanner: function (playerColor, playerName) {
        // Create or get banner container
        let banner = document.getElementById('game-event-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'game-event-banner';
            banner.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.15s ease-out;
            `;
            document.body.appendChild(banner);
        }

        // Clear any existing timeout
        if (this.bannerTimeout) {
            clearTimeout(this.bannerTimeout);
        }

        const accentHex = playerColor ? '#' + playerColor.toString(16).padStart(6, '0') : '#FFD700';
        const playerDisplay = playerName || 'Player';

        // Create bullseye banner with animated target rings
        banner.innerHTML = `
            <div class="bullseye-target" style="
                position: relative;
                width: clamp(200px, 40vw, 400px);
                height: clamp(200px, 40vw, 400px);
                margin-bottom: 20px;
                animation: targetPulse 0.5s ease-in-out infinite alternate, targetSpin 3s linear infinite;
            ">
                <!-- Outer ring -->
                <div style="
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    border-radius: 50%;
                    background: radial-gradient(circle, transparent 60%, #FF0000 60%, #FF0000 70%, #FFFFFF 70%, #FFFFFF 80%, #FF0000 80%, #FF0000 90%, #FFFFFF 90%);
                    box-shadow: 0 0 60px #FF0000, 0 0 120px ${accentHex};
                    animation: ringPulse 0.3s ease-in-out infinite alternate;
                "></div>
                <!-- Center bullseye -->
                <div style="
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 30%;
                    height: 30%;
                    border-radius: 50%;
                    background: radial-gradient(circle, #FFD700 0%, #FF0000 100%);
                    box-shadow: 0 0 40px #FFD700, 0 0 80px ${accentHex};
                    animation: centerGlow 0.2s ease-in-out infinite alternate;
                "></div>
                <!-- Dart -->
                <div style="
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -100%) rotate(45deg);
                    font-size: clamp(60px, 12vw, 120px);
                    animation: dartStrike 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                    filter: drop-shadow(0 0 20px ${accentHex});
                ">🎯</div>
            </div>
            <div style="
                font-family: 'Impact', 'Arial Black', sans-serif;
                font-size: clamp(60px, 12vw, 160px);
                font-weight: bold;
                text-transform: uppercase;
                text-align: center;
                color: #FFD700;
                text-shadow:
                    4px 4px 0 #FF0000,
                    -4px -4px 0 #FF0000,
                    4px -4px 0 #FF0000,
                    -4px 4px 0 #FF0000,
                    0 0 40px ${accentHex},
                    0 0 80px ${accentHex};
                letter-spacing: 8px;
                animation: bannerEntry 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            ">
                BULLSEYE!
            </div>
            <div style="
                font-family: 'Arial', sans-serif;
                font-size: clamp(20px, 4vw, 40px);
                color: #FFFFFF;
                text-shadow: 0 0 20px ${accentHex};
                margin-top: 10px;
                animation: fadeIn 0.6s ease-out 0.3s forwards;
                opacity: 0;
            ">
                ${playerDisplay} hit the center!
            </div>
            <div style="
                font-family: 'Arial', sans-serif;
                font-size: clamp(16px, 3vw, 28px);
                color: #FFD700;
                text-shadow: 0 0 15px ${accentHex};
                margin-top: 8px;
                animation: fadeIn 0.6s ease-out 0.5s forwards;
                opacity: 0;
            ">
                Only a Jack, Queen, or King can escape!
            </div>
            <style>
                @keyframes targetPulse {
                    0% { transform: scale(0.95); }
                    100% { transform: scale(1.05); }
                }
                @keyframes targetSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes ringPulse {
                    0% { filter: brightness(1); box-shadow: 0 0 60px #FF0000; }
                    100% { filter: brightness(1.3); box-shadow: 0 0 100px #FF0000, 0 0 150px #FFD700; }
                }
                @keyframes centerGlow {
                    0% { filter: brightness(1); }
                    100% { filter: brightness(1.5); }
                }
                @keyframes dartStrike {
                    0% { transform: translate(-50%, -500%) rotate(45deg) scale(2); opacity: 0; }
                    70% { transform: translate(-50%, -80%) rotate(45deg) scale(1); }
                    100% { transform: translate(-50%, -100%) rotate(45deg) scale(1); opacity: 1; }
                }
                @keyframes bannerEntry {
                    0% { transform: scale(0) rotate(-10deg); opacity: 0; }
                    50% { transform: scale(1.2) rotate(5deg); }
                    100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes bannerExit {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(2) rotate(10deg); opacity: 0; }
                }
            </style>
        `;

        // Show banner
        banner.style.opacity = '1';

        // Add screen flash effect
        this.screenFlash('#FFD700');

        // Hide after delay
        this.bannerTimeout = setTimeout(() => {
            const textDivs = banner.querySelectorAll('div');
            textDivs.forEach(div => {
                div.style.animation = 'bannerExit 0.3s ease-in forwards';
            });
            setTimeout(() => {
                banner.style.opacity = '0';
            }, 250);
        }, 2500);
    },

    // Show "Got a Royal!" banner when exiting bullseye with J/Q/K
    showRoyalBanner: function (playerColor, playerName) {
        // Create or get banner container
        let banner = document.getElementById('game-event-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'game-event-banner';
            banner.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(banner);
        }

        // Clear previous content
        banner.innerHTML = '';
        if (this.bannerTimeout) clearTimeout(this.bannerTimeout);

        // Create crown graphic with sparkles
        const crownSvg = `
            <svg width="120" height="80" viewBox="0 0 120 80" style="filter: drop-shadow(0 0 20px gold);">
                <!-- Crown base -->
                <path d="M10 65 L20 25 L40 45 L60 15 L80 45 L100 25 L110 65 Z"
                      fill="url(#crownGradient)" stroke="#FFD700" stroke-width="3"/>
                <!-- Jewels -->
                <circle cx="60" cy="30" r="8" fill="#FF0044" stroke="#FFF" stroke-width="2"/>
                <circle cx="35" cy="45" r="5" fill="#00BFFF" stroke="#FFF" stroke-width="1"/>
                <circle cx="85" cy="45" r="5" fill="#00FF88" stroke="#FFF" stroke-width="1"/>
                <!-- Gradient definitions -->
                <defs>
                    <linearGradient id="crownGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#FFD700"/>
                        <stop offset="50%" style="stop-color:#FFA500"/>
                        <stop offset="100%" style="stop-color:#FF8C00"/>
                    </linearGradient>
                </defs>
            </svg>
        `;

        // Sparkle elements
        const sparkles = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const distance = 80 + Math.random() * 40;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            const delay = i * 0.1;
            sparkles.push(`
                <div style="
                    position: absolute;
                    left: calc(50% + ${x}px);
                    top: calc(50% + ${y}px);
                    width: 20px;
                    height: 20px;
                    transform: translate(-50%, -50%);
                    animation: royalSparkle 0.6s ease-out ${delay}s both;
                ">✨</div>
            `);
        }

        banner.innerHTML = `
            <div style="
                animation: royalCrownBounce 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
                transform: scale(0);
            ">
                ${crownSvg}
            </div>
            <div style="
                font-family: 'Arial Black', sans-serif;
                font-size: 72px;
                font-weight: 900;
                background: linear-gradient(45deg, #FFD700, #FFA500, #FF8C00, #FFD700);
                background-size: 300% 300%;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 0 30px rgba(255,215,0,0.8);
                animation: royalTextSlam 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both, royalShimmer 2s ease-in-out infinite;
                text-transform: uppercase;
                letter-spacing: 8px;
            ">GOT A ROYAL!</div>
            <div style="
                font-family: 'Arial', sans-serif;
                font-size: 28px;
                color: ${playerColor || '#FFF'};
                text-shadow: 2px 2px 8px rgba(0,0,0,0.8), 0 0 20px ${playerColor || '#FFD700'};
                animation: fadeIn 0.5s ease-out 0.4s both;
                margin-top: 15px;
            ">${playerName || 'Player'} exits the bullseye!</div>
            ${sparkles.join('')}
            <style>
                @keyframes royalCrownBounce {
                    0% { transform: scale(0) rotate(-20deg); }
                    60% { transform: scale(1.3) rotate(10deg); }
                    100% { transform: scale(1) rotate(0deg); }
                }
                @keyframes royalTextSlam {
                    0% { transform: scale(3) translateY(-50px); opacity: 0; }
                    100% { transform: scale(1) translateY(0); opacity: 1; }
                }
                @keyframes royalShimmer {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                @keyframes royalSparkle {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    50% { transform: translate(-50%, -50%) scale(1.5); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        `;

        // Show banner
        banner.style.opacity = '1';

        // Add golden screen flash
        this.screenFlash('#FFD700');

        // Hide after delay
        this.bannerTimeout = setTimeout(() => {
            const textDivs = banner.querySelectorAll('div');
            textDivs.forEach(div => {
                div.style.animation = 'bannerExit 0.3s ease-in forwards';
            });
            setTimeout(() => {
                banner.style.opacity = '0';
            }, 250);
        }, 2500);
    },

    // Show a dramatic banner overlay
    showBanner: function (text, color1, color2, accentColor) {
        // Create or get banner container
        let banner = document.getElementById('game-event-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'game-event-banner';
            banner.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.15s ease-out;
            `;
            document.body.appendChild(banner);
        }

        // Clear any existing timeout
        if (this.bannerTimeout) {
            clearTimeout(this.bannerTimeout);
        }

        // Create dramatic text with animations
        const accentHex = accentColor ? '#' + accentColor.toString(16).padStart(6, '0') : color1;
        banner.innerHTML = `
            <div style="
                font-family: 'Impact', 'Arial Black', sans-serif;
                font-size: clamp(60px, 15vw, 200px);
                font-weight: bold;
                text-transform: uppercase;
                text-align: center;
                color: ${color1};
                text-shadow:
                    4px 4px 0 ${color2},
                    -4px -4px 0 ${color2},
                    4px -4px 0 ${color2},
                    -4px 4px 0 ${color2},
                    0 0 40px ${accentHex},
                    0 0 80px ${accentHex},
                    0 0 120px ${accentHex};
                letter-spacing: 8px;
                animation: bannerPulse 0.3s ease-in-out infinite alternate,
                           bannerShake 0.1s ease-in-out infinite;
                transform: scale(0);
                animation: bannerEntry 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            ">
                ${text}
            </div>
            <style>
                @keyframes bannerEntry {
                    0% { transform: scale(0) rotate(-10deg); opacity: 0; }
                    50% { transform: scale(1.2) rotate(5deg); }
                    100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes bannerPulse {
                    0% { filter: brightness(1); }
                    100% { filter: brightness(1.3); }
                }
                @keyframes bannerShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px) rotate(-1deg); }
                    75% { transform: translateX(5px) rotate(1deg); }
                }
                @keyframes bannerExit {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(2) rotate(10deg); opacity: 0; }
                }
            </style>
        `;

        // Show banner
        banner.style.opacity = '1';

        // Add screen flash effect
        this.screenFlash(accentHex);

        // Hide after delay
        this.bannerTimeout = setTimeout(() => {
            const textDiv = banner.querySelector('div');
            if (textDiv) {
                textDiv.style.animation = 'bannerExit 0.3s ease-in forwards';
            }
            setTimeout(() => {
                banner.style.opacity = '0';
            }, 250);
        }, 2000);
    },

    // Screen flash effect
    screenFlash: function (color) {
        let flash = document.getElementById('screen-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'screen-flash';
            flash.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9999;
                opacity: 0;
            `;
            document.body.appendChild(flash);
        }

        flash.style.background = `radial-gradient(circle, ${color}66 0%, transparent 70%)`;
        flash.style.opacity = '1';
        flash.style.transition = 'opacity 0s';

        requestAnimationFrame(() => {
            flash.style.transition = 'opacity 0.5s ease-out';
            flash.style.opacity = '0';
        });
    },

    // Get available themes
    getThemeList: function () {
        return Object.keys(this.themes);
    }
};

// ============================================================
// THEME: BILLIARD TABLE - High-Poly Prohibition Era Pool Hall
// Octagonal room with parquet floor, ornate gold frames, chandelier,
// Kenneth Bingham paintings, and dramatic warm lighting
// ============================================================

FastTrackThemes.register('billiard', {
    name: 'Billiard Table',
    description: 'High-poly prohibition-era pool hall with parquet floors, chandelier, and paintings by Kenneth Bingham',

    _poolHallObjects: [],
    _paintingFrames: [],

    paintings: [
        'assets/images/art/bridge.png',
        'assets/images/art/chess.png',
        'assets/images/art/DrivingTheHerd.png',
        'assets/images/art/pigs.png',
        'assets/images/art/lighthouse.png',
        'assets/images/art/rainyday.jpg'
    ],

    // Store chandelier meshes for hide/show during gameplay
    _chandelierParts: [],

    create: function (scene, THREE, manager) {
        this._poolHallObjects = [];
        this._paintingFrames = [];
        this._chandelierParts = [];

        scene.background = new THREE.Color(0x080605);

        // ── High-quality procedural walnut texture ──
        const walnutCanvas = document.createElement('canvas');
        walnutCanvas.width = 1024; walnutCanvas.height = 1024;
        const wctx = walnutCanvas.getContext('2d');
        // Base warm walnut tone
        const baseGrad = wctx.createLinearGradient(0, 0, 1024, 1024);
        baseGrad.addColorStop(0, '#4a2510');
        baseGrad.addColorStop(0.3, '#3d1e0c');
        baseGrad.addColorStop(0.6, '#5a2e14');
        baseGrad.addColorStop(1.0, '#3a1a08');
        wctx.fillStyle = baseGrad;
        wctx.fillRect(0, 0, 1024, 1024);
        // Wood grain lines — tight, running horizontally
        for (let g = 0; g < 420; g++) {
            const y = Math.random() * 1024;
            const width = 0.4 + Math.random() * 2.5;
            const darkness = Math.random();
            const alpha = darkness < 0.15 ? 0.55 : (darkness < 0.5 ? 0.18 : 0.07);
            const col = darkness < 0.15 ? 'rgba(12,5,2,' : 'rgba(80,38,12,';
            wctx.beginPath();
            // Slight wave in grain
            wctx.moveTo(0, y);
            for (let x = 0; x < 1024; x += 32) {
                wctx.lineTo(x, y + (Math.random() - 0.5) * 4);
            }
            wctx.lineWidth = width;
            wctx.strokeStyle = col + alpha + ')';
            wctx.stroke();
        }
        // Pore dots for open-grain walnut
        for (let p = 0; p < 1800; p++) {
            const px = Math.random() * 1024, py = Math.random() * 1024;
            const pr = 0.5 + Math.random() * 1.2;
            wctx.beginPath();
            wctx.arc(px, py, pr, 0, Math.PI * 2);
            wctx.fillStyle = 'rgba(8,3,1,0.5)';
            wctx.fill();
        }
        // Subtle highlight sheen (polished surface)
        const sheenGrad = wctx.createLinearGradient(0, 0, 1024, 0);
        sheenGrad.addColorStop(0, 'rgba(255,200,140,0.04)');
        sheenGrad.addColorStop(0.5, 'rgba(255,200,140,0.10)');
        sheenGrad.addColorStop(1, 'rgba(255,200,140,0.03)');
        wctx.fillStyle = sheenGrad;
        wctx.fillRect(0, 0, 1024, 1024);
        const walnutTex = new THREE.CanvasTexture(walnutCanvas);
        walnutTex.wrapS = THREE.RepeatWrapping;
        walnutTex.wrapT = THREE.RepeatWrapping;
        walnutTex.repeat.set(3, 1);
        walnutTex.anisotropy = 8;

        // ── Materials — Prohibition-era cherry wood palette ──
        const cherryWoodMat = new THREE.MeshStandardMaterial({
            map: walnutTex, color: 0x4a1c1c, roughness: 0.28, metalness: 0.08,
            envMapIntensity: 0.5
        });
        const darkWoodMat = new THREE.MeshStandardMaterial({
            map: walnutTex, color: 0x2d1010, roughness: 0.32, metalness: 0.12,
            envMapIntensity: 0.4
        });
        const medWoodMat = new THREE.MeshStandardMaterial({
            map: walnutTex, color: 0x5c2e18, roughness: 0.38, metalness: 0.08,
            envMapIntensity: 0.5
        });
        const floorWoodMat = new THREE.MeshStandardMaterial({
            map: walnutTex, color: 0x3a2218, roughness: 0.55, metalness: 0.05,
            envMapIntensity: 0.3
        });
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.92, metalness: 0.0 });
        const wainscotMat = new THREE.MeshStandardMaterial({ color: 0x3d1a1a, roughness: 0.4, metalness: 0.1 });
        const goldFrameMat = new THREE.MeshStandardMaterial({ color: 0xc5a033, roughness: 0.25, metalness: 0.75 });
        const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.7 });
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.3, metalness: 0.8 });
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1.0 });
        const greenFeltMat = new THREE.MeshStandardMaterial({ color: 0x0d4528, roughness: 0.95, metalness: 0.0 });

        // ── Procedural herringbone parquet floor ──
        const floorCanvas = document.createElement('canvas');
        floorCanvas.width = 512; floorCanvas.height = 512;
        const fctx = floorCanvas.getContext('2d');
        fctx.fillStyle = '#1a1210';
        fctx.fillRect(0, 0, 512, 512);
        // Herringbone parquet — alternating wood planks
        const plankW = 32, plankH = 96;
        for (let row = 0; row < 512 / plankH + 1; row++) {
            for (let col = 0; col < 512 / plankW + 1; col++) {
                const isFlipped = (row + col) % 2 === 0;
                const baseVal = 28 + Math.floor(Math.random() * 18);
                const r = baseVal + 8 + Math.floor(Math.random() * 6);
                const g = baseVal + Math.floor(Math.random() * 4);
                const b = baseVal - 6 + Math.floor(Math.random() * 4);
                fctx.fillStyle = `rgb(${r},${g},${b})`;
                const px = col * plankW, py = row * plankH;
                if (isFlipped) {
                    fctx.fillRect(px + 1, py + 1, plankW - 2, plankH - 2);
                } else {
                    fctx.fillRect(px + 1, py + 1, plankH - 2, plankW - 2);
                }
                // Subtle grain lines per plank
                fctx.strokeStyle = `rgba(${r - 10},${g - 10},${b - 10},0.3)`;
                fctx.lineWidth = 0.5;
                for (let gl = 0; gl < 3; gl++) {
                    const gy = py + 8 + gl * (plankH / 4);
                    fctx.beginPath(); fctx.moveTo(px, gy); fctx.lineTo(px + plankW, gy + (Math.random() - 0.5) * 4);
                    fctx.stroke();
                }
                // Plank gap
                fctx.strokeStyle = 'rgba(0,0,0,0.5)';
                fctx.lineWidth = 1;
                fctx.strokeRect(px, py, plankW, plankH);
            }
        }
        const floorTex = new THREE.CanvasTexture(floorCanvas);
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(6, 5);
        floorTex.anisotropy = 8;

        const floorGeo = new THREE.PlaneGeometry(1800, 1500);
        const floor = new THREE.Mesh(floorGeo, floorWoodMat.clone());
        floor.material.map = floorTex;
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -80;
        floor.receiveShadow = true;
        scene.add(floor);
        manager._sceneObjects.push(floor);

        // ── Ceiling ──
        const ceilGeo = new THREE.PlaneGeometry(1800, 1500);
        const ceil = new THREE.Mesh(ceilGeo, ceilingMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.y = 420;
        scene.add(ceil);
        manager._sceneObjects.push(ceil);

        // ── 3-wall room (no front wall — open behind camera) ──
        const wallH = 500;
        const wainH = 130;
        const roomW = 700; // half-width — close to board
        const roomD = 600; // half-depth — close to board

        const wallSegments = [
            // Back wall
            { px: 0, pz: -roomD, ry: 0, w: roomW * 2.2 },
            // Left wall
            { px: -roomW, pz: -60, ry: Math.PI / 2, w: roomD * 1.8 },
            // Right wall
            { px: roomW, pz: -60, ry: -Math.PI / 2, w: roomD * 1.8 },
        ];

        // Brick texture for interior wall surface (behind paintings + behind wainscot panel).
        // One source texture, cloned per wall so each can carry its own repeat factor.
        // Tile sized ~220x110 units → consistent brick scale across the differently-sized walls.
        const _brickLoader = new THREE.TextureLoader();
        const _brickSrc = _brickLoader.load('assets/images/Brick texture.png');
        _brickSrc.wrapS = _brickSrc.wrapT = THREE.RepeatWrapping;
        _brickSrc.anisotropy = 8;

        wallSegments.forEach(ws => {
            const upperH = wallH - wainH;

            // Per-wall brick textures (cloned so repeat is independent)
            const upperBrickTex = _brickSrc.clone();
            upperBrickTex.needsUpdate = true;
            upperBrickTex.wrapS = upperBrickTex.wrapT = THREE.RepeatWrapping;
            upperBrickTex.repeat.set(Math.max(1, ws.w / 220), Math.max(1, upperH / 110));

            const wainBrickTex = _brickSrc.clone();
            wainBrickTex.needsUpdate = true;
            wainBrickTex.wrapS = wainBrickTex.wrapT = THREE.RepeatWrapping;
            wainBrickTex.repeat.set(Math.max(1, ws.w / 220), Math.max(1, wainH / 110));

            const upperBrickMat = new THREE.MeshStandardMaterial({
                map: upperBrickTex, color: 0xb89484, roughness: 0.88, metalness: 0.02,
                envMapIntensity: 0.3
            });
            const wainBrickMat = new THREE.MeshStandardMaterial({
                map: wainBrickTex, color: 0x8a5a48, roughness: 0.85, metalness: 0.04,
                envMapIntensity: 0.3
            });

            // Upper wall (behind paintings)
            const upperGeo = new THREE.PlaneGeometry(ws.w, upperH);
            const upper = new THREE.Mesh(upperGeo, upperBrickMat);
            upper.position.set(ws.px, wainH + upperH / 2 - 80, ws.pz);
            upper.rotation.y = ws.ry;
            scene.add(upper); manager._sceneObjects.push(upper);

            // Wainscoting plane (lower half panel) — brick behind chair rail / baseboard / wood trim
            const wGeo = new THREE.PlaneGeometry(ws.w, wainH);
            const wMesh = new THREE.Mesh(wGeo, wainBrickMat);
            wMesh.position.set(ws.px, wainH / 2 - 80, ws.pz);
            wMesh.rotation.y = ws.ry;
            scene.add(wMesh); manager._sceneObjects.push(wMesh);

            // Chair rail (divider between upper/lower panels) — cherry wood
            const crGeo = new THREE.BoxGeometry(ws.w, 8, 12);
            const cr = new THREE.Mesh(crGeo, cherryWoodMat);
            cr.position.set(ws.px, wainH - 77, ws.pz);
            cr.rotation.y = ws.ry;
            scene.add(cr); manager._sceneObjects.push(cr);

            // Gold trim strip on chair rail
            const crTrimGeo = new THREE.BoxGeometry(ws.w, 3, 2);
            const crTrim = new THREE.Mesh(crTrimGeo, goldTrimMat);
            crTrim.position.set(ws.px, wainH - 72, ws.pz);
            crTrim.rotation.y = ws.ry;
            // Push trim forward slightly
            const crFwd = new THREE.Vector3(0, 0, 8).applyAxisAngle(new THREE.Vector3(0, 1, 0), ws.ry);
            crTrim.position.add(crFwd);
            scene.add(crTrim); manager._sceneObjects.push(crTrim);

            // Crown molding at ceiling — cherry wood
            const cmGeo = new THREE.BoxGeometry(ws.w, 20, 20);
            const cm = new THREE.Mesh(cmGeo, cherryWoodMat);
            cm.position.set(ws.px, wallH - 85, ws.pz);
            cm.rotation.y = ws.ry;
            scene.add(cm); manager._sceneObjects.push(cm);

            // Gold trim on crown molding
            const cmTrimGeo = new THREE.BoxGeometry(ws.w, 5, 3);
            const cmTrim = new THREE.Mesh(cmTrimGeo, goldTrimMat);
            cmTrim.position.set(ws.px, wallH - 75, ws.pz);
            cmTrim.rotation.y = ws.ry;
            const cmFwd = new THREE.Vector3(0, 0, 12).applyAxisAngle(new THREE.Vector3(0, 1, 0), ws.ry);
            cmTrim.position.add(cmFwd);
            scene.add(cmTrim); manager._sceneObjects.push(cmTrim);

            // Baseboard at floor level — dark wood
            const bbGeo = new THREE.BoxGeometry(ws.w, 12, 6);
            const bb = new THREE.Mesh(bbGeo, darkWoodMat);
            bb.position.set(ws.px, -74, ws.pz);
            bb.rotation.y = ws.ry;
            scene.add(bb); manager._sceneObjects.push(bb);
        });

        // ── Pool table structure ──
        // Board: hexagon with BOARD_RADIUS=300 (vertex), apothem ≈ 260 (edge midpoint)
        // Board surface extruded BOARD_THICKNESS=21, centred at Y=0, so top ≈ +10.5
        // Rails sit flush: inner face touching board edge, top lip just above board surface
        const hexR = 300;            // BOARD_RADIUS — vertex distance
        const apothem = hexR * Math.cos(Math.PI / 6);  // ≈ 259.8 — edge midpoint distance
        const boardTopY = 10.5;      // board surface Y (BOARD_THICKNESS/2)
        const railW = 28;            // width of rail (outward from board edge)
        const apronH = 40;           // height of apron below board
        const railTopY = boardTopY + 4;    // lip 4 units above board surface
        const railBotY = boardTopY - apronH; // bottom of apron ≈ -29.5
        const railTotalH = railTopY - railBotY;  // ≈ 44

        // Cushion (green felt bead on inner lip of rail)
        const cushionMat = new THREE.MeshStandardMaterial({ color: 0x0d4a22, roughness: 0.85, metalness: 0.0 });

        // Rails — one per hex side, positioned at edge midpoint pushed outward
        for (let i = 0; i < 6; i++) {
            const a1 = (i * Math.PI / 3) - Math.PI / 6;
            const a2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;
            // Hex edge endpoints
            const x1 = Math.cos(a1) * hexR, z1 = Math.sin(a1) * hexR;
            const x2 = Math.cos(a2) * hexR, z2 = Math.sin(a2) * hexR;
            const edgeLen = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);  // = hexR = 300
            const edgeMidX = (x1 + x2) / 2, edgeMidZ = (z1 + z2) / 2;
            const edgeAng = Math.atan2(z2 - z1, x2 - x1);
            // Outward normal direction (perpendicular to edge, pointing away from center)
            const nx = Math.cos((a1 + a2) / 2), nz = Math.sin((a1 + a2) / 2);

            // Main rail body — cherry wood, centred on edge, pushed outward
            const railGeo = new THREE.BoxGeometry(edgeLen + 6, railTotalH, railW);
            const rail = new THREE.Mesh(railGeo, cherryWoodMat);
            rail.position.set(
                edgeMidX + nx * railW / 2,
                railBotY + railTotalH / 2,
                edgeMidZ + nz * railW / 2
            );
            rail.rotation.y = -edgeAng;
            rail.castShadow = true; rail.receiveShadow = true;
            scene.add(rail); manager._sceneObjects.push(rail);

            // Green cushion bead on top-inner lip
            const cushGeo = new THREE.BoxGeometry(edgeLen - 20, 6, 8);
            const cush = new THREE.Mesh(cushGeo, cushionMat);
            cush.position.set(
                edgeMidX + nx * 4,
                railTopY - 3,
                edgeMidZ + nz * 4
            );
            cush.rotation.y = -edgeAng;
            scene.add(cush); manager._sceneObjects.push(cush);

            // Rail cap strip — dark wood with gold inlay effect
            const capGeo = new THREE.BoxGeometry(edgeLen + 6, 3, railW + 2);
            const cap = new THREE.Mesh(capGeo, medWoodMat);
            cap.position.set(
                edgeMidX + nx * railW / 2,
                railTopY,
                edgeMidZ + nz * railW / 2
            );
            cap.rotation.y = -edgeAng;
            scene.add(cap); manager._sceneObjects.push(cap);
        }

        // Corner posts at each hex vertex — fills the gaps between rail segments
        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI / 3) - Math.PI / 6;
            const vx = Math.cos(a) * hexR, vz = Math.sin(a) * hexR;
            // Push outward by half rail width
            const cx = Math.cos(a) * (hexR + railW / 2);
            const cz = Math.sin(a) * (hexR + railW / 2);
            const postGeo = new THREE.CylinderGeometry(railW / 2 + 2, railW / 2 + 2, railTotalH + 3, 24);
            const post = new THREE.Mesh(postGeo, cherryWoodMat);
            post.position.set(cx, railBotY + railTotalH / 2, cz);
            post.castShadow = true;
            scene.add(post); manager._sceneObjects.push(post);

            // Brass cap on corner post
            const bCapGeo = new THREE.CylinderGeometry(railW / 2 - 1, railW / 2 + 1, 4, 24);
            const bCap = new THREE.Mesh(bCapGeo, brassMat);
            bCap.position.set(cx, railTopY + 2, cz);
            scene.add(bCap); manager._sceneObjects.push(bCap);
        }

        // Turned table legs at each hex vertex using LatheGeometry
        const legH = 100;
        const legBotY = railBotY - legH;
        const legProfile = [
            new THREE.Vector2(14, 0),    // foot base
            new THREE.Vector2(16, 3),    // foot swell
            new THREE.Vector2(12, 8),    // ankle
            new THREE.Vector2(8, 18),   // lower shaft
            new THREE.Vector2(7, 35),   // mid shaft
            new THREE.Vector2(10, 50),   // vase belly
            new THREE.Vector2(12, 58),   // vase widest
            new THREE.Vector2(8, 70),   // above vase
            new THREE.Vector2(7, 82),   // upper neck
            new THREE.Vector2(9, 90),   // collar
            new THREE.Vector2(12, 96),   // mounting flare
            new THREE.Vector2(14, legH)  // top block (meets rail bottom)
        ];
        const legGeo = new THREE.LatheGeometry(legProfile, 24);

        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI / 3) - Math.PI / 6;
            const lx = Math.cos(a) * (hexR + railW / 2);
            const lz = Math.sin(a) * (hexR + railW / 2);
            const leg = new THREE.Mesh(legGeo, medWoodMat);
            // LatheGeometry Y goes 0→legH; position so top meets RAIL_BOT
            leg.position.set(lx, legBotY, lz);
            leg.castShadow = true; leg.receiveShadow = true;
            scene.add(leg); manager._sceneObjects.push(leg);
        }

        // Stretchers connecting adjacent legs at ~40% height
        const stretchY = legBotY + legH * 0.40;
        for (let i = 0; i < 6; i++) {
            const a1 = (i * Math.PI / 3) - Math.PI / 6;
            const a2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;
            const r = hexR + railW / 2;
            const lx1 = Math.cos(a1) * r, lz1 = Math.sin(a1) * r;
            const lx2 = Math.cos(a2) * r, lz2 = Math.sin(a2) * r;
            const smx = (lx1 + lx2) / 2, smz = (lz1 + lz2) / 2;
            const sAng = Math.atan2(lz2 - lz1, lx2 - lx1);
            const sLen = Math.sqrt((lx2 - lx1) ** 2 + (lz2 - lz1) ** 2);
            const sGeo = new THREE.BoxGeometry(sLen - 30, 6, 8);
            const sMesh = new THREE.Mesh(sGeo, medWoodMat);
            sMesh.position.set(smx, stretchY, smz);
            sMesh.rotation.y = -sAng; sMesh.castShadow = true;
            scene.add(sMesh); manager._sceneObjects.push(sMesh);
        }

        // ── Multi-arm chandelier (stored for hide/show) ──
        const chanY = 360;
        const chanGroup = new THREE.Group();
        chanGroup.name = 'chandelier';

        const hubGeo = new THREE.SphereGeometry(12, 16, 12);
        const hub = new THREE.Mesh(hubGeo, brassMat);
        hub.position.set(0, chanY, 0);
        chanGroup.add(hub);

        const mountGeo = new THREE.CylinderGeometry(8, 10, 12, 12);
        const mount = new THREE.Mesh(mountGeo, brassMat);
        mount.position.set(0, 415, 0);
        chanGroup.add(mount);
        const rodGeo = new THREE.CylinderGeometry(3, 3, 55, 8);
        const rod = new THREE.Mesh(rodGeo, brassMat);
        rod.position.set(0, chanY + 35, 0);
        chanGroup.add(rod);

        const armCount = 6, armLen = 80;
        const chanLights = [];
        for (let i = 0; i < armCount; i++) {
            const aa = (i / armCount) * Math.PI * 2;
            const armGeo = new THREE.CylinderGeometry(2.5, 2.5, armLen, 8);
            const arm = new THREE.Mesh(armGeo, brassMat);
            arm.position.set(Math.cos(aa) * armLen / 2, chanY - 5, Math.sin(aa) * armLen / 2);
            arm.rotation.z = Math.PI / 2; arm.rotation.y = -aa;
            chanGroup.add(arm);
            const endX = Math.cos(aa) * armLen, endZ = Math.sin(aa) * armLen;
            const cupGeo = new THREE.CylinderGeometry(6, 4, 8, 8);
            const cup = new THREE.Mesh(cupGeo, brassMat);
            cup.position.set(endX, chanY - 8, endZ);
            chanGroup.add(cup);
            const candleGeo = new THREE.CylinderGeometry(3, 3, 18, 8);
            const candleMesh = new THREE.Mesh(candleGeo, new THREE.MeshStandardMaterial({ color: 0xfff8e7, roughness: 0.6 }));
            candleMesh.position.set(endX, chanY + 3, endZ);
            chanGroup.add(candleMesh);
            const flameGeo = new THREE.SphereGeometry(3, 8, 8);
            const flame = new THREE.Mesh(flameGeo, new THREE.MeshStandardMaterial({
                color: 0xffaa33, emissive: 0xffaa33, emissiveIntensity: 1.5, transparent: true, opacity: 0.9
            }));
            flame.position.set(endX, chanY + 15, endZ);
            chanGroup.add(flame);
            const armLight = new THREE.PointLight(0xffddaa, 0.3, 400, 2);
            armLight.position.set(endX, chanY + 15, endZ);
            chanGroup.add(armLight);
            chanLights.push(armLight);
        }

        const chanSpot = new THREE.SpotLight(0xffeedd, 2.5, 600, Math.PI / 2.5, 0.7, 1);
        chanSpot.position.set(0, chanY - 20, 0);
        chanSpot.target.position.set(0, 0, 0);
        chanSpot.castShadow = true;
        chanSpot.shadow.mapSize.set(1024, 1024);
        chanGroup.add(chanSpot); chanGroup.add(chanSpot.target);
        chanLights.push(chanSpot);

        scene.add(chanGroup);
        manager._sceneObjects.push(chanGroup);
        this._chandelierParts = [chanGroup];
        this._chandelierLights = chanLights;

        // ── Lighting — eliminate plastic flat look ──
        // Low ambient: forces shadows to read, makes light sources do the work
        const ambient = new THREE.AmbientLight(0x1a0e06, 0.18);
        scene.add(ambient); manager._sceneObjects.push(ambient);

        // Key fill: warm overhead wash from chandelier direction
        const keyFill = new THREE.PointLight(0xffd090, 1.1, 1200, 1.4);
        keyFill.position.set(0, 380, 0);
        scene.add(keyFill); manager._sceneObjects.push(keyFill);

        // Rim light: cool blue-purple from behind (separates table from floor)
        const rimLight = new THREE.PointLight(0x304060, 0.55, 900, 1.8);
        rimLight.position.set(0, 80, 420);
        scene.add(rimLight); manager._sceneObjects.push(rimLight);

        // Table bounce: warm light just under the board face (bounces off wood)
        const bounceLight = new THREE.PointLight(0xc87030, 0.45, 500, 2.0);
        bounceLight.position.set(0, -60, 0);
        scene.add(bounceLight); manager._sceneObjects.push(bounceLight);

        // Side accent: opposite warm/cool to create wood grain variation
        const sideA = new THREE.PointLight(0xffe0a0, 0.3, 700, 2.2);
        sideA.position.set(-420, 120, -200);
        scene.add(sideA); manager._sceneObjects.push(sideA);
        const sideB = new THREE.PointLight(0x804020, 0.25, 700, 2.2);
        sideB.position.set(420, 120, 200);
        scene.add(sideB); manager._sceneObjects.push(sideB);

        // ── 6 Paintings with ornate gold frames ──
        // 2 per wall: back, left, right
        const paintingDefs = [
            // Back wall
            { x: -250, y: 230, z: -roomD + 5, w: 200, h: 150, ry: 0 },
            { x: 250, y: 220, z: -roomD + 5, w: 200, h: 150, ry: 0 },
            // Left wall
            { x: -roomW + 5, y: 220, z: -250, w: 180, h: 140, ry: Math.PI / 2 },
            { x: -roomW + 5, y: 220, z: 180, w: 180, h: 140, ry: Math.PI / 2 },
            // Right wall
            { x: roomW - 5, y: 220, z: -250, w: 180, h: 140, ry: -Math.PI / 2 },
            { x: roomW - 5, y: 220, z: 180, w: 180, h: 140, ry: -Math.PI / 2 },
        ];

        const loader = new THREE.TextureLoader();

        paintingDefs.forEach((p, idx) => {
            const ft = 16, fd = 14;
            const outerGeo = new THREE.BoxGeometry(p.w + ft * 2, p.h + ft * 2, fd);
            const outer = new THREE.Mesh(outerGeo, goldFrameMat);
            outer.position.set(p.x, p.y, p.z); outer.rotation.y = p.ry; outer.castShadow = true;
            scene.add(outer); manager._sceneObjects.push(outer);
            this._poolHallObjects.push({ mesh: outer, parallaxFactor: 0.01, basePos: outer.position.clone() });

            const innerGeo = new THREE.BoxGeometry(p.w + 10, p.h + 10, 4);
            const inner = new THREE.Mesh(innerGeo, new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.9 }));
            inner.position.set(p.x, p.y, p.z); inner.rotation.y = p.ry;
            inner.position.add(new THREE.Vector3(0, 0, fd / 2 + 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.ry));
            scene.add(inner); manager._sceneObjects.push(inner);

            const canvasGeo = new THREE.PlaneGeometry(p.w, p.h);
            const canvasMesh = new THREE.Mesh(canvasGeo, new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
            canvasMesh.position.set(p.x, p.y, p.z); canvasMesh.rotation.y = p.ry;
            canvasMesh.position.add(new THREE.Vector3(0, 0, fd / 2 + 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.ry));
            canvasMesh.userData.paintingIndex = idx;
            scene.add(canvasMesh); manager._sceneObjects.push(canvasMesh);
            this._paintingFrames.push(canvasMesh);

            if (this.paintings[idx]) {
                loader.load(this.paintings[idx], (tex) => {
                    canvasMesh.material = new THREE.MeshBasicMaterial({ map: tex });
                });
            }

            // Ornamental picture light above each painting
            const spotPos = new THREE.Vector3(p.x, p.y + 100, p.z);
            spotPos.add(new THREE.Vector3(0, 0, 80).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.ry));
            const pSpot = new THREE.SpotLight(0xffeebb, 1.2, 300, Math.PI / 5, 0.8, 1.5);
            pSpot.position.copy(spotPos);
            pSpot.target.position.set(p.x, p.y, p.z);
            scene.add(pSpot); scene.add(pSpot.target);
            manager._sceneObjects.push(pSpot);

            // Brass picture light fixture
            const fixGeo = new THREE.BoxGeometry(p.w * 0.6, 4, 6);
            const fix = new THREE.Mesh(fixGeo, brassMat);
            fix.position.set(p.x, p.y + p.h / 2 + 22, p.z);
            fix.rotation.y = p.ry;
            fix.position.add(new THREE.Vector3(0, 0, 12).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.ry));
            scene.add(fix); manager._sceneObjects.push(fix);
            // Fixture arm
            const armFixGeo = new THREE.CylinderGeometry(2, 2, 20, 6);
            const armFix = new THREE.Mesh(armFixGeo, brassMat);
            armFix.position.set(p.x, p.y + p.h / 2 + 12, p.z);
            armFix.rotation.y = p.ry;
            armFix.position.add(new THREE.Vector3(0, 0, 8).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.ry));
            scene.add(armFix); manager._sceneObjects.push(armFix);
        });

        // ── Pool cue rack on right wall ──
        const cueMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.45, metalness: 0.05 });
        const rackX = roomW - 15, rackZ = 0;
        // Rack board — cherry wood
        const rackGeo = new THREE.BoxGeometry(8, 180, 40);
        const rack = new THREE.Mesh(rackGeo, cherryWoodMat);
        rack.position.set(rackX, 140, rackZ); rack.rotation.y = -Math.PI / 2;
        scene.add(rack); manager._sceneObjects.push(rack);
        // Pool cues
        for (let c = 0; c < 4; c++) {
            const cueGeo = new THREE.CylinderGeometry(1.5, 2.5, 160, 8);
            const cue = new THREE.Mesh(cueGeo, cueMat);
            cue.position.set(rackX - 5, 140, rackZ - 15 + c * 10);
            cue.rotation.z = 0.05;
            scene.add(cue); manager._sceneObjects.push(cue);
        }

        // ── Small table with pool balls (triangle rack) ──
        const tableMat = cherryWoodMat;
        const tblX = -roomW + 55, tblZ = 0;
        // Table top
        const tTopGeo = new THREE.CylinderGeometry(22, 22, 4, 16);
        const tTop = new THREE.Mesh(tTopGeo, tableMat);
        tTop.position.set(tblX, -20, tblZ);
        scene.add(tTop); manager._sceneObjects.push(tTop);
        const tLegGeo = new THREE.CylinderGeometry(5, 7, 58, 10);
        const tLeg = new THREE.Mesh(tLegGeo, tableMat);
        tLeg.position.set(tblX, -51, tblZ);
        scene.add(tLeg); manager._sceneObjects.push(tLeg);
        const tBaseGeo = new THREE.CylinderGeometry(14, 16, 4, 12);
        const tBase = new THREE.Mesh(tBaseGeo, tableMat);
        tBase.position.set(tblX, -78, tblZ);
        scene.add(tBase); manager._sceneObjects.push(tBase);

        // Pool balls in triangle on table
        const ballColors = [0xffff00, 0x0000cc, 0xff0000, 0x800080, 0xff8c00, 0x006400];
        const ballR = 3;
        let ballIdx = 0;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col <= row; col++) {
                const bx = tblX + (col - row / 2) * (ballR * 2.2);
                const bz = tblZ - 8 + row * (ballR * 2);
                const bGeo = new THREE.SphereGeometry(ballR, 12, 8);
                const bMat = new THREE.MeshStandardMaterial({
                    color: ballColors[ballIdx % ballColors.length], roughness: 0.2, metalness: 0.1
                });
                const ball = new THREE.Mesh(bGeo, bMat);
                ball.position.set(bx, -16, bz);
                scene.add(ball); manager._sceneObjects.push(ball);
                ballIdx++;
            }
        }

        console.log('🎱 [Billiard Theme] High-poly pool hall created');
        console.log('🖼️ [Billiard Theme] Painting frames:', this._paintingFrames.length);
    },

    // Hide chandelier when camera is close (gameplay view)
    setChandelierVisible: function (visible) {
        if (this._chandelierParts && this._chandelierParts[0]) {
            this._chandelierParts[0].visible = visible;
        }
    },

    setPaintings: function (THREE, imageUrls) {
        const loader = new THREE.TextureLoader();
        imageUrls.forEach((url, idx) => {
            if (this._paintingFrames[idx]) {
                loader.load(url, (texture) => {
                    this._paintingFrames[idx].material = new THREE.MeshBasicMaterial({ map: texture });
                });
            }
        });
    },

    update: function (mouseX, mouseY, manager) {
        if (!this._poolHallObjects) return;
        this._poolHallObjects.forEach(obj => {
            if (obj.mesh && obj.basePos) {
                obj.mesh.position.x = obj.basePos.x + mouseX * obj.parallaxFactor * 80;
                obj.mesh.position.z = obj.basePos.z + mouseY * obj.parallaxFactor * 80;
            }
        });
        // Auto-hide chandelier when camera is close/looking down at board
        const cam = window.camera;
        if (cam && this._chandelierParts && this._chandelierParts[0]) {
            // Hide when camera is below chandelier height (gameplay views)
            this._chandelierParts[0].visible = cam.position.y > 300;
        }
    }
});

// ============================================================
// THEME: SPEAKEASY — Alias for Billiard (same prohibition-era room)
// The speakeasy IS the billiard room. Same room, same vibe.
// Registered as separate theme so UI can show "Speakeasy" name.
// ============================================================
FastTrackThemes.register('speakeasy', Object.assign(
    Object.create(FastTrackThemes.themes.billiard),
    {
        name: 'Speakeasy',
        description: 'Prohibition-era speakeasy with Kenneth Bingham paintings, chandelier, and warm lighting'
    }
));

// ============================================================
// THEME: COSMIC SPACE
// ============================================================

FastTrackThemes.register('cosmic', {
    name: 'Cosmic Space',
    description: 'Deep space with nebulas, stars, and floating geometric shapes',

    create: function (scene, THREE, manager) {
        // Set background color
        scene.background = new THREE.Color(0x0a0a14);

        // === LAYER 0: Infinite gradient sphere (skybox) ===
        const gradientSphereGeo = new THREE.SphereGeometry(1500, 64, 64);
        const gradientSphereMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x0a0a14) },
                midColor: { value: new THREE.Color(0x1a1a3e) },
                bottomColor: { value: new THREE.Color(0x2d1b4e) },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 midColor;
                uniform vec3 bottomColor;
                uniform float time;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    float pulse = sin(time * 0.5) * 0.1 + 0.9;
                    vec3 color;
                    if (h > 0.0) {
                        color = mix(midColor, topColor, h) * pulse;
                    } else {
                        color = mix(midColor, bottomColor, -h) * pulse;
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const gradientSphere = new THREE.Mesh(gradientSphereGeo, gradientSphereMat);
        scene.add(gradientSphere);
        manager.backdropLayers.push({ mesh: gradientSphere, parallaxFactor: 0, rotationSpeed: 0.00001 });

        // === LAYER 1: Far starfield ===
        const farStarCount = 2000;
        const farStarGeo = new THREE.BufferGeometry();
        const farStarPositions = new Float32Array(farStarCount * 3);
        const farStarColors = new Float32Array(farStarCount * 3);

        for (let i = 0; i < farStarCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const radius = 1200 + Math.random() * 200;

            farStarPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            farStarPositions[i * 3 + 1] = radius * Math.cos(phi);
            farStarPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

            const colorChoice = Math.random();
            if (colorChoice < 0.6) {
                farStarColors[i * 3] = 0.9 + Math.random() * 0.1;
                farStarColors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
                farStarColors[i * 3 + 2] = 1.0;
            } else if (colorChoice < 0.8) {
                farStarColors[i * 3] = 0.8;
                farStarColors[i * 3 + 1] = 0.85;
                farStarColors[i * 3 + 2] = 1.0;
            } else {
                farStarColors[i * 3] = 1.0;
                farStarColors[i * 3 + 1] = 0.9;
                farStarColors[i * 3 + 2] = 0.95;
            }
        }

        farStarGeo.setAttribute('position', new THREE.BufferAttribute(farStarPositions, 3));
        farStarGeo.setAttribute('color', new THREE.BufferAttribute(farStarColors, 3));

        const farStarMat = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending
        });

        const farStars = new THREE.Points(farStarGeo, farStarMat);
        scene.add(farStars);
        manager.backdropLayers.push({ mesh: farStars, parallaxFactor: 0.02, rotationSpeed: 0.00002 });

        // === LAYER 2: Nebula clouds ===
        const nebulaGroup = new THREE.Group();
        const nebulaColors = [0x4a3f6b, 0x2d1b4e, 0x1a2744, 0x0f3b3b, 0x3d2a5f];

        for (let n = 0; n < 8; n++) {
            const nebulaGeo = new THREE.IcosahedronGeometry(80 + Math.random() * 120, 1);
            const nebulaMat = new THREE.MeshBasicMaterial({
                color: nebulaColors[n % nebulaColors.length],
                transparent: true,
                opacity: 0.15 + Math.random() * 0.1,
                blending: THREE.AdditiveBlending,
                wireframe: true
            });
            const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);

            const angle = (n / 8) * Math.PI * 2;
            const distance = 600 + Math.random() * 300;
            nebula.position.set(
                Math.cos(angle) * distance,
                -200 + Math.random() * 400,
                Math.sin(angle) * distance
            );
            nebula.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            nebula.scale.setScalar(1 + Math.random() * 0.5);
            nebulaGroup.add(nebula);
        }
        scene.add(nebulaGroup);
        manager.backdropLayers.push({ mesh: nebulaGroup, parallaxFactor: 0.05, rotationSpeed: 0.00003 });

        // === LAYER 3: Floating geometric shapes ===
        const floatingShapes = new THREE.Group();
        const shapeColors = [0x6b4a7a, 0x4a6b7a, 0x7a6b4a, 0x4a7a6b, 0x7a4a6b];

        for (let s = 0; s < 20; s++) {
            let shapeGeo;
            const shapeType = Math.floor(Math.random() * 4);
            switch (shapeType) {
                case 0:
                    shapeGeo = new THREE.TorusGeometry(15 + Math.random() * 20, 1, 6, 6);
                    break;
                case 1:
                    shapeGeo = new THREE.OctahedronGeometry(10 + Math.random() * 15);
                    break;
                case 2:
                    shapeGeo = new THREE.TorusGeometry(12 + Math.random() * 18, 2, 8, 32);
                    break;
                case 3:
                    shapeGeo = new THREE.TorusGeometry(10 + Math.random() * 15, 1, 5, 5);
                    break;
            }

            const shapeMat = new THREE.MeshBasicMaterial({
                color: shapeColors[s % shapeColors.length],
                transparent: true,
                opacity: 0.3 + Math.random() * 0.3,
                blending: THREE.AdditiveBlending,
                wireframe: true
            });

            const shape = new THREE.Mesh(shapeGeo, shapeMat);
            const angle = Math.random() * Math.PI * 2;
            const distance = 450 + Math.random() * 400;
            const height = -150 + Math.random() * 350;

            shape.position.set(
                Math.cos(angle) * distance,
                height,
                Math.sin(angle) * distance
            );
            shape.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            shape.userData.floatSpeed = 0.003 + Math.random() * 0.005;
            shape.userData.floatOffset = Math.random() * Math.PI * 2;
            shape.userData.rotSpeed = (Math.random() - 0.5) * 0.001;
            floatingShapes.add(shape);
        }
        scene.add(floatingShapes);
        manager.backdropLayers.push({ mesh: floatingShapes, parallaxFactor: 0.08, rotationSpeed: 0, isFloating: true });

        // === LAYER 4: Dust particles ===
        const dustCount = 500;
        const dustGeo = new THREE.BufferGeometry();
        const dustPositions = new Float32Array(dustCount * 3);

        for (let i = 0; i < dustCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 420 + Math.random() * 250;
            dustPositions[i * 3] = Math.cos(angle) * distance;
            dustPositions[i * 3 + 1] = -50 + Math.random() * 200;
            dustPositions[i * 3 + 2] = Math.sin(angle) * distance;
        }

        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

        const dustMat = new THREE.PointsMaterial({
            size: 3,
            color: 0x8888aa,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        const dustCloud = new THREE.Points(dustGeo, dustMat);
        scene.add(dustCloud);
        manager.backdropLayers.push({ mesh: dustCloud, parallaxFactor: 0.15, rotationSpeed: 0.00006 });

        // === LAYER 5: Grid floor ===
        const gridHelper = new THREE.GridHelper(2000, 40, 0x2a2a4a, 0x1a1a2a);
        gridHelper.position.y = -100;
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.3;
        scene.add(gridHelper);
        manager.backdropLayers.push({ mesh: gridHelper, parallaxFactor: 0.03, rotationSpeed: 0 });

        // === LAYER 6: Radial perspective lines ===
        const radialLines = new THREE.Group();
        const lineCount = 12;
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x3a3a5a,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });

        for (let i = 0; i < lineCount; i++) {
            const angle = (i / lineCount) * Math.PI * 2;
            const lineGeo = new THREE.BufferGeometry();
            const linePoints = [
                new THREE.Vector3(0, -80, 0),
                new THREE.Vector3(Math.cos(angle) * 1000, -80, Math.sin(angle) * 1000)
            ];
            lineGeo.setFromPoints(linePoints);
            const line = new THREE.Line(lineGeo, lineMaterial);
            radialLines.add(line);
        }
        scene.add(radialLines);
        manager.backdropLayers.push({ mesh: radialLines, parallaxFactor: 0.02, rotationSpeed: 0.000015 });

        // === Ambient glow spheres ===
        const glowCount = 6;
        const glowColors = [0x4a3f8b, 0x3f5a8b, 0x3f8b6a, 0x8b6a3f, 0x8b3f6a, 0x6a8b3f];

        for (let g = 0; g < glowCount; g++) {
            const glowGeo = new THREE.SphereGeometry(60 + Math.random() * 40, 16, 16);
            const glowMat = new THREE.MeshBasicMaterial({
                color: glowColors[g],
                transparent: true,
                opacity: 0.1,
                blending: THREE.AdditiveBlending
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            const angle = (g / glowCount) * Math.PI * 2;
            glow.position.set(
                Math.cos(angle) * 800,
                -50 + Math.random() * 100,
                Math.sin(angle) * 800
            );
            scene.add(glow);
            manager.backdropLayers.push({ mesh: glow, parallaxFactor: 0.04, rotationSpeed: 0, pulseSpeed: 0.002 + Math.random() * 0.003 });
        }
    },

    // Cosmic theme game event reactions
    onGameEvent: function (eventType, data, manager) {
        switch (eventType) {
            case 'fasttrack':
            case 'win':
            case 'royal':
                // Cosmic explosion - intensify all nebulas and stars
                manager.backdropLayers.forEach(layer => {
                    if (layer.pulseSpeed) {
                        layer.pulseSpeed *= 5; // Rapid pulsing
                        setTimeout(() => { layer.pulseSpeed /= 5; }, 2000);
                    }
                    if (layer.rotationSpeed) {
                        layer.rotationSpeed *= 10;
                        setTimeout(() => { layer.rotationSpeed /= 10; }, 2000);
                    }
                });
                break;
            case 'sendHome':
            case 'bullseye':
                // Stars twinkle rapidly
                manager.backdropLayers.forEach(layer => {
                    if (layer.rotationSpeed) {
                        layer.rotationSpeed *= 3;
                        setTimeout(() => { layer.rotationSpeed /= 3; }, 1500);
                    }
                });
                break;
        }
    }
});

// ============================================================
// THEME: ROMAN COLOSSEUM
// Grand open cylinder with arched tiers, toga'd spectators
// with laurel crowns, and the Emperor in his Imperial perch.
// ALL structures pushed beyond radius 500 — board stays clear.
// ============================================================

FastTrackThemes.register('colosseum', {
    name: 'Roman Colosseum',
    description: 'Grand Roman amphitheatre with toga-clad spectators & Emperor',

    create: function (scene, THREE, manager) {
        // Warm Mediterranean sky
        scene.background = new THREE.Color(0x87CEEB);

        const FLOOR_Y = -2;      // Just below board
        const WALL_INNER_R = 520;     // Inner wall — well beyond board (radius ~260)
        const stoneLight = 0xd4c4a8;
        const stoneMed = 0xc4b498;
        const stoneDark = 0xa89880;
        const marbleWhite = 0xf0ece4;
        const sandColor = 0xe8d4a8;
        const imperialPurple = 0x4b0082;
        const crimson = 0xc41e3a;
        const gold = 0xffd700;

        // Shared materials (reuse for perf)
        const stoneMat = new THREE.MeshStandardMaterial({ color: stoneLight, roughness: 0.75, metalness: 0.05 });
        const stoneDarkMat = new THREE.MeshStandardMaterial({ color: stoneDark, roughness: 0.8, metalness: 0.05 });
        const marbleMat = new THREE.MeshStandardMaterial({ color: marbleWhite, roughness: 0.35, metalness: 0.15 });
        const goldMat = new THREE.MeshStandardMaterial({ color: gold, roughness: 0.25, metalness: 0.8 });

        // ────────────────────────────
        // SKY DOME with sun glow
        // ────────────────────────────
        const skyGeo = new THREE.SphereGeometry(2500, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x1e90ff) },
                bottomColor: { value: new THREE.Color(0x87ceeb) },
                sunColor: { value: new THREE.Color(0xffd700) }
            },
            vertexShader: `
                varying vec3 vWP;
                void main() {
                    vWP = (modelMatrix * vec4(position,1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
                }`,
            fragmentShader: `
                uniform vec3 topColor, bottomColor, sunColor;
                varying vec3 vWP;
                void main() {
                    float h = normalize(vWP).y;
                    vec3 c = mix(bottomColor, topColor, max(0.0, h));
                    vec3 sd = normalize(vec3(0.5,0.6,0.3));
                    float d = max(0.0, dot(normalize(vWP), sd));
                    c += sunColor * (pow(d,32.0) + pow(d,8.0)*0.3) * 0.5;
                    gl_FragColor = vec4(c,1.0);
                }`
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        scene.add(sky);
        manager.backdropLayers.push({ mesh: sky, parallaxFactor: 0, rotationSpeed: 0 });

        // ────────────────────────────
        // ARENA FLOOR — sandy ground below the board
        // ────────────────────────────
        const sandFloor = new THREE.Mesh(
            new THREE.CircleGeometry(1200, 64),
            new THREE.MeshStandardMaterial({ color: sandColor, roughness: 0.9, metalness: 0 })
        );
        sandFloor.rotation.x = -Math.PI / 2;
        sandFloor.position.y = FLOOR_Y - 1;
        sandFloor.receiveShadow = true;
        scene.add(sandFloor);
        manager.backdropLayers.push({ mesh: sandFloor, parallaxFactor: 0, rotationSpeed: 0 });

        // ────────────────────────────
        // PODIUM WALL — low marble retaining wall with decorative band
        // ────────────────────────────
        const podiumH = 40;
        const podiumWall = new THREE.Mesh(
            new THREE.CylinderGeometry(WALL_INNER_R, WALL_INNER_R, podiumH, 80, 1, true),
            new THREE.MeshStandardMaterial({ color: marbleWhite, roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide })
        );
        podiumWall.position.y = FLOOR_Y + podiumH / 2;
        scene.add(podiumWall);
        manager.backdropLayers.push({ mesh: podiumWall, parallaxFactor: 0.005, rotationSpeed: 0 });

        // Decorative red band around podium top
        const bandMesh = new THREE.Mesh(
            new THREE.TorusGeometry(WALL_INNER_R, 3, 8, 80),
            new THREE.MeshStandardMaterial({ color: crimson, roughness: 0.6, metalness: 0.2 })
        );
        bandMesh.rotation.x = Math.PI / 2;
        bandMesh.position.y = FLOOR_Y + podiumH;
        scene.add(bandMesh);
        manager.backdropLayers.push({ mesh: bandMesh, parallaxFactor: 0.005, rotationSpeed: 0 });

        // Gold shields and laurel wreaths on podium wall
        const artGroup = new THREE.Group();
        const artCount = 24;
        for (let i = 0; i < artCount; i++) {
            const a = (i / artCount) * Math.PI * 2;
            const ax = Math.cos(a) * (WALL_INNER_R - 2);
            const az = Math.sin(a) * (WALL_INNER_R - 2);
            const ay = FLOOR_Y + podiumH * 0.55;

            if (i % 2 === 0) {
                // Roman scutum shield
                const sg = new THREE.Group();
                sg.add(new THREE.Mesh(new THREE.BoxGeometry(14, 20, 1.5),
                    new THREE.MeshStandardMaterial({ color: crimson, roughness: 0.5, metalness: 0.3 })));
                const boss = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 10, 0, Math.PI), goldMat);
                boss.position.z = 1; sg.add(boss);
                sg.position.set(ax, ay, az);
                sg.lookAt(0, ay, 0);
                artGroup.add(sg);
            } else {
                // Laurel wreath
                const wg = new THREE.Group();
                for (let l = 0; l < 10; l++) {
                    const la = (l / 10) * Math.PI * 2;
                    const lf = new THREE.Mesh(
                        new THREE.SphereGeometry(1.5, 4, 4),
                        new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.7 })
                    );
                    lf.position.set(Math.cos(la) * 6, Math.sin(la) * 6, 0);
                    lf.scale.set(1.5, 0.6, 0.4);
                    wg.add(lf);
                }
                wg.add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1, 10), goldMat));
                wg.children[wg.children.length - 1].rotation.x = Math.PI / 2;
                wg.position.set(ax, ay, az);
                wg.lookAt(0, ay, 0);
                artGroup.add(wg);
            }
        }
        scene.add(artGroup);
        manager.backdropLayers.push({ mesh: artGroup, parallaxFactor: 0.005, rotationSpeed: 0 });

        // ────────────────────────────
        // THREE TIERS OF ARCHED SEATING — the iconic Colosseum look
        // Each tier: arched openings (columns + arches) backed by solid wall
        // ────────────────────────────
        const tierDefs = [
            { innerR: WALL_INNER_R + 5, outerR: WALL_INNER_R + 70, baseY: FLOOR_Y + podiumH, h: 70, archN: 40, col: stoneLight },
            { innerR: WALL_INNER_R + 70, outerR: WALL_INNER_R + 140, baseY: FLOOR_Y + podiumH + 70, h: 65, archN: 48, col: stoneMed },
            { innerR: WALL_INNER_R + 140, outerR: WALL_INNER_R + 200, baseY: FLOOR_Y + podiumH + 135, h: 55, archN: 56, col: stoneDark }
        ];

        tierDefs.forEach((td, ti) => {
            const tierGroup = new THREE.Group();
            const midR = (td.innerR + td.outerR) / 2;

            // Solid back wall for this tier
            const backWall = new THREE.Mesh(
                new THREE.CylinderGeometry(td.outerR, td.outerR, td.h, 80, 1, true),
                new THREE.MeshStandardMaterial({ color: td.col, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide })
            );
            backWall.position.y = td.baseY + td.h / 2;
            tierGroup.add(backWall);

            // Horizontal ledge / cornice at top of tier
            const cornice = new THREE.Mesh(
                new THREE.TorusGeometry(td.outerR, 4, 6, 80),
                new THREE.MeshStandardMaterial({ color: marbleWhite, roughness: 0.4, metalness: 0.1 })
            );
            cornice.rotation.x = Math.PI / 2;
            cornice.position.y = td.baseY + td.h;
            tierGroup.add(cornice);

            // Columns and arches around the tier's inner face
            const colMatl = new THREE.MeshStandardMaterial({ color: marbleWhite, roughness: 0.35, metalness: 0.12 });
            for (let i = 0; i < td.archN; i++) {
                const a = (i / td.archN) * Math.PI * 2;
                const cx = Math.cos(a) * td.innerR;
                const cz = Math.sin(a) * td.innerR;

                // Column (Doric-style)
                const col = new THREE.Mesh(
                    new THREE.CylinderGeometry(3.5 - ti * 0.3, 4 - ti * 0.3, td.h - 8, 8),
                    colMatl
                );
                col.position.set(cx, td.baseY + td.h / 2, cz);
                tierGroup.add(col);

                // Column capital (wider top piece)
                const cap = new THREE.Mesh(
                    new THREE.BoxGeometry(10 - ti, 5, 10 - ti),
                    colMatl
                );
                cap.position.set(cx, td.baseY + td.h - 4, cz);
                cap.lookAt(0, cap.position.y, 0);
                tierGroup.add(cap);

                // Arch between every 2 columns
                if (i % 2 === 0 && td.archN > 0) {
                    const nextA = ((i + 1) / td.archN) * Math.PI * 2;
                    const midA = (a + nextA) / 2;
                    const archSpan = td.innerR * (2 * Math.PI / td.archN);
                    const archR = archSpan * 0.4;
                    const arch = new THREE.Mesh(
                        new THREE.TorusGeometry(archR, 2.5 - ti * 0.3, 6, 12, Math.PI),
                        colMatl
                    );
                    arch.position.set(
                        Math.cos(midA) * td.innerR,
                        td.baseY + td.h - 6,
                        Math.sin(midA) * td.innerR
                    );
                    arch.rotation.y = -midA + Math.PI / 2;
                    arch.rotation.x = Math.PI;
                    tierGroup.add(arch);
                }
            }

            scene.add(tierGroup);
            manager.backdropLayers.push({ mesh: tierGroup, parallaxFactor: 0.01 + ti * 0.005, rotationSpeed: 0 });
        });

        // ────────────────────────────
        // TORCH BRAZIERS on top of podium wall
        // ────────────────────────────
        const torchGroup = new THREE.Group();
        const torchN = 16;
        for (let i = 0; i < torchN; i++) {
            const a = (i / torchN) * Math.PI * 2;
            const tx = Math.cos(a) * (WALL_INNER_R + 8);
            const tz = Math.sin(a) * (WALL_INNER_R + 8);

            // Bronze bowl
            const bowl = new THREE.Mesh(
                new THREE.ConeGeometry(5, 8, 8, 1, true),
                new THREE.MeshStandardMaterial({ color: 0xcd7f32, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide })
            );
            bowl.rotation.x = Math.PI;
            bowl.position.set(tx, FLOOR_Y + podiumH + 4, tz);
            torchGroup.add(bowl);

            // Fire glow
            const fire = new THREE.Mesh(
                new THREE.SphereGeometry(3.5, 8, 8),
                new THREE.MeshStandardMaterial({
                    color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.5,
                    transparent: true, opacity: 0.8, roughness: 1
                })
            );
            fire.position.set(tx, FLOOR_Y + podiumH + 9, tz);
            fire.userData.flickerOffset = i * 0.7;
            torchGroup.add(fire);
        }
        scene.add(torchGroup);
        manager.backdropLayers.push({
            mesh: torchGroup, parallaxFactor: 0.01, rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(child => {
                    if (child.userData.flickerOffset !== undefined) {
                        const f = 0.6 + Math.sin(time * 8 + child.userData.flickerOffset) * 0.2
                            + Math.sin(time * 13 + child.userData.flickerOffset * 2) * 0.15;
                        child.material.emissiveIntensity = f * 1.5;
                        child.material.opacity = 0.6 + f * 0.3;
                        child.scale.setScalar(0.8 + f * 0.3);
                    }
                });
            }
        });

        // ────────────────────────────
        // TOGA-CLAD SPECTATORS WITH LAUREL CROWNS
        // Placed across the 3 tiers with varied Roman attire
        // ────────────────────────────
        const skinTones = [0xffe4c4, 0xdeb887, 0xd2b48c, 0xbc8f8f, 0x8b7355, 0xf5deb3];
        const togaColors = [
            0xf5f5dc, 0xe8e4d4, 0xfaf0e6,   // White/cream togas (citizens)
            0xe8d8c0, 0xf0e6d3, 0xddd5c4,   // Off-whites
            0xc41e3a,                          // Crimson (magistrates — rare)
            0x4b0082                           // Purple (senators — rare)
        ];

        const specTiers = [
            { innerR: WALL_INNER_R + 10, outerR: WALL_INNER_R + 60, baseY: FLOOR_Y + podiumH + 5, count: 60, isVIP: true },
            { innerR: WALL_INNER_R + 75, outerR: WALL_INNER_R + 130, baseY: FLOOR_Y + podiumH + 75, count: 80, isVIP: false },
            { innerR: WALL_INNER_R + 145, outerR: WALL_INNER_R + 190, baseY: FLOOR_Y + podiumH + 140, count: 70, isVIP: false }
        ];

        specTiers.forEach((st, si) => {
            for (let i = 0; i < st.count; i++) {
                const a = (i / st.count) * Math.PI * 2 + si * 0.15;
                const r = st.innerR + Math.random() * (st.outerR - st.innerR);
                const rowProg = (r - st.innerR) / (st.outerR - st.innerR);
                const sy = st.baseY + rowProg * 30;

                const spectator = new THREE.Group();

                // Pick toga color — VIP tier gets more purple/crimson
                let togaIdx;
                if (st.isVIP && Math.random() > 0.6) {
                    togaIdx = Math.random() > 0.5 ? 6 : 7; // crimson or purple
                } else {
                    togaIdx = Math.floor(Math.random() * 6); // citizen whites
                }
                const togaColor = togaColors[togaIdx];
                const togaMat = new THREE.MeshStandardMaterial({ color: togaColor, roughness: 0.8 });

                // Body — capsule (toga-draped torso)
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(3.5, 7, 4, 8), togaMat);
                body.position.y = 5;
                spectator.add(body);

                // Toga drape — thin tilted plane for sash effect
                const drape = new THREE.Mesh(
                    new THREE.PlaneGeometry(4, 8),
                    new THREE.MeshStandardMaterial({ color: togaColor, roughness: 0.9, side: THREE.DoubleSide })
                );
                drape.position.set(2, 6, 1.5);
                drape.rotation.set(0.1, 0.3, -0.2);
                spectator.add(drape);

                // Head
                const skinColor = skinTones[Math.floor(Math.random() * skinTones.length)];
                const head = new THREE.Mesh(
                    new THREE.SphereGeometry(2.8, 8, 8),
                    new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 })
                );
                head.position.y = 12;
                spectator.add(head);

                // LAUREL CROWN — every Roman gets one! (gold torus + small green leaves)
                const laurel = new THREE.Group();
                const laurelRing = new THREE.Mesh(
                    new THREE.TorusGeometry(3.2, 0.5, 6, 12),
                    goldMat
                );
                laurelRing.rotation.x = Math.PI / 2;
                laurel.add(laurelRing);
                // Small leaf sprigs
                for (let lf = 0; lf < 8; lf++) {
                    const la = (lf / 8) * Math.PI * 2;
                    const leaf = new THREE.Mesh(
                        new THREE.SphereGeometry(0.8, 3, 3),
                        new THREE.MeshStandardMaterial({ color: 0x2e8b2e, roughness: 0.7 })
                    );
                    leaf.position.set(Math.cos(la) * 3.2, 0, Math.sin(la) * 3.2);
                    leaf.scale.set(1.8, 0.5, 0.8);
                    laurel.add(leaf);
                }
                laurel.position.y = 14.5;
                spectator.add(laurel);

                // VIP tier senators get wider purple sash
                if (st.isVIP && togaIdx >= 6) {
                    const sash = new THREE.Mesh(
                        new THREE.PlaneGeometry(2, 10),
                        new THREE.MeshStandardMaterial({ color: imperialPurple, roughness: 0.8, side: THREE.DoubleSide })
                    );
                    sash.position.set(-1, 5, 2);
                    sash.rotation.set(0, 0, 0.15);
                    spectator.add(sash);
                }

                // Arms
                const armMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
                const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4, 4, 6), armMat);
                leftArm.position.set(-4.5, 6, 0);
                leftArm.rotation.z = 0.3;
                leftArm.userData.baseRotZ = 0.3;
                spectator.add(leftArm);

                const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4, 4, 6), armMat);
                rightArm.position.set(4.5, 6, 0);
                rightArm.rotation.z = -0.3;
                rightArm.userData.baseRotZ = -0.3;
                spectator.add(rightArm);

                // Some hold small flags or staffs
                if (!st.isVIP && Math.random() > 0.85) {
                    const fp = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.2, 0.2, 7, 4),
                        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
                    );
                    fp.position.set(4, 12, 0);
                    spectator.add(fp);
                    const fl = new THREE.Mesh(
                        new THREE.PlaneGeometry(3, 2.5),
                        new THREE.MeshStandardMaterial({
                            color: [crimson, gold, 0x4169e1][Math.floor(Math.random() * 3)],
                            side: THREE.DoubleSide
                        })
                    );
                    fl.position.set(5.5, 14, 0);
                    spectator.add(fl);
                }

                spectator.position.set(Math.cos(a) * r, sy, Math.sin(a) * r);
                spectator.lookAt(0, sy, 0);

                spectator.userData.waveSpeed = 2 + Math.random() * 3;
                spectator.userData.waveOffset = Math.random() * Math.PI * 2;
                spectator.userData.excitement = 0.2 + Math.random() * 0.15;
                spectator.userData.leftArm = leftArm;
                spectator.userData.rightArm = rightArm;
                spectator.userData.originalY = sy;

                scene.add(spectator);
                manager.spectators.push(spectator);
            }
        });

        // ────────────────────────────
        // VELARIUM (shade awnings) on top tier
        // ────────────────────────────
        const velariumGroup = new THREE.Group();
        const velN = 16;
        const velInner = WALL_INNER_R + 80;
        const velOuter = WALL_INNER_R + 210;
        const velY = FLOOR_Y + podiumH + 200;
        const velariumColors = [crimson, gold, 0x800020, crimson, gold];

        for (let i = 0; i < velN; i++) {
            const a1 = (i / velN) * Math.PI * 2;
            const a2 = ((i + 1) / velN) * Math.PI * 2;
            const verts = new Float32Array([
                Math.cos(a1) * velInner, velY + 10, Math.sin(a1) * velInner,
                Math.cos(a2) * velInner, velY + 10, Math.sin(a2) * velInner,
                Math.cos(a1) * velOuter, velY - 15, Math.sin(a1) * velOuter,
                Math.cos(a2) * velOuter, velY - 15, Math.sin(a2) * velOuter
            ]);
            const idx = new Uint16Array([0, 2, 1, 1, 2, 3]);
            const cg = new THREE.BufferGeometry();
            cg.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            cg.setIndex(new THREE.BufferAttribute(idx, 1));
            cg.computeVertexNormals();
            const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({
                color: velariumColors[i % velariumColors.length],
                roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.65
            }));
            cm.userData.waveOffset = i * 0.5;
            velariumGroup.add(cm);
        }
        scene.add(velariumGroup);
        manager.backdropLayers.push({
            mesh: velariumGroup, parallaxFactor: 0.01, rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(c => {
                    const p = c.geometry.attributes.position.array;
                    p[7] = (velY - 15) + Math.sin(time * 0.5 + c.userData.waveOffset) * 8;
                    p[10] = (velY - 15) + Math.sin(time * 0.5 + c.userData.waveOffset + 0.5) * 8;
                    c.geometry.attributes.position.needsUpdate = true;
                });
            }
        });

        // ────────────────────────────
        // BANNERS on poles around top
        // ────────────────────────────
        const bannerGroup = new THREE.Group();
        const bColors = [crimson, gold, 0x4169e1, 0x228b22, imperialPurple];
        const topR = WALL_INNER_R + 205;

        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5, 1.5, 50, 6),
                new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 })
            );
            pole.position.set(Math.cos(a) * topR, velY + 20, Math.sin(a) * topR);
            bannerGroup.add(pole);

            const ban = new THREE.Mesh(
                new THREE.PlaneGeometry(20, 32),
                new THREE.MeshStandardMaterial({ color: bColors[i % bColors.length], roughness: 0.9, side: THREE.DoubleSide })
            );
            ban.position.set(Math.cos(a) * topR, velY + 35, Math.sin(a) * topR);
            ban.rotation.y = -a;
            ban.userData.waveOffset = i * 0.3;
            bannerGroup.add(ban);
        }
        scene.add(bannerGroup);
        manager.backdropLayers.push({
            mesh: bannerGroup, parallaxFactor: 0.02, rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(c => {
                    if (c.userData.waveOffset !== undefined && c.geometry && c.geometry.type === 'PlaneGeometry') {
                        c.rotation.z = Math.sin(time * 2 + c.userData.waveOffset) * 0.08;
                    }
                });
            }
        });

        // ────────────────────────────
        // EMPEROR'S BOX (PULVINAR) — Grand imperial perch
        // Positioned at front of the arena, first tier, facing the board
        // ────────────────────────────
        const emperorBox = new THREE.Group();
        const boxAngle = 0; // front-center
        const boxR = WALL_INNER_R + 35;
        const boxBaseY = FLOOR_Y + podiumH;

        // Wide marble platform jutting out from tier 1
        const platW = 100, platH = 12, platD = 60;
        const platform = new THREE.Mesh(
            new THREE.BoxGeometry(platW, platH, platD),
            new THREE.MeshStandardMaterial({ color: marbleWhite, roughness: 0.3, metalness: 0.15 })
        );
        platform.position.set(boxR, boxBaseY + platH / 2, 0);
        emperorBox.add(platform);

        // Gold trim around platform edge
        const trimGeo = new THREE.BoxGeometry(platW + 4, 3, platD + 4);
        const trim = new THREE.Mesh(trimGeo, goldMat);
        trim.position.set(boxR, boxBaseY + platH, 0);
        emperorBox.add(trim);

        // 4 ornate marble columns with Corinthian-style capitals
        const colPositions = [
            [-platW / 2 + 8, -platD / 2 + 8], [-platW / 2 + 8, platD / 2 - 8],
            [platW / 2 - 8, -platD / 2 + 8], [platW / 2 - 8, platD / 2 - 8]
        ];
        const canopyH = 70;
        colPositions.forEach(([ox, oz]) => {
            const col = new THREE.Mesh(
                new THREE.CylinderGeometry(4, 5, canopyH, 10),
                marbleMat
            );
            col.position.set(boxR + ox, boxBaseY + platH + canopyH / 2, oz);
            emperorBox.add(col);
            // Corinthian capital
            const cap = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), goldMat);
            cap.position.set(boxR + ox, boxBaseY + platH + canopyH + 2, oz);
            emperorBox.add(cap);
        });

        // Canopy roof (rich burgundy)
        const canopy = new THREE.Mesh(
            new THREE.BoxGeometry(platW + 10, 5, platD + 10),
            new THREE.MeshStandardMaterial({ color: 0x800020, roughness: 0.7, metalness: 0.1 })
        );
        canopy.position.set(boxR, boxBaseY + platH + canopyH + 8, 0);
        emperorBox.add(canopy);

        // Imperial purple drape curtains on sides
        for (let side = -1; side <= 1; side += 2) {
            const drape = new THREE.Mesh(
                new THREE.PlaneGeometry(15, canopyH - 5),
                new THREE.MeshStandardMaterial({ color: imperialPurple, roughness: 0.9, side: THREE.DoubleSide })
            );
            drape.position.set(boxR + side * (platW / 2), boxBaseY + platH + canopyH / 2, 0);
            drape.rotation.y = Math.PI / 2;
            emperorBox.add(drape);
        }

        // S·P·Q·R banner behind the emperor
        const spqrCanvas = document.createElement('canvas');
        spqrCanvas.width = 256; spqrCanvas.height = 128;
        const ctx = spqrCanvas.getContext('2d');
        ctx.fillStyle = '#c41e3a'; ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 56px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('S·P·Q·R', 128, 64);
        const spqr = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 30),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(spqrCanvas), side: THREE.DoubleSide })
        );
        spqr.position.set(boxR + platW / 2 - 2, boxBaseY + platH + canopyH * 0.6, 0);
        spqr.rotation.y = -Math.PI / 2;
        emperorBox.add(spqr);

        // ── THE EMPEROR (seated on golden throne) ──
        const emperor = new THREE.Group();

        // Golden throne
        const throneBase = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 16), goldMat);
        throneBase.position.y = 4; emperor.add(throneBase);
        const throneBack = new THREE.Mesh(new THREE.BoxGeometry(22, 40, 4), goldMat);
        throneBack.position.set(0, 24, -8); emperor.add(throneBack);
        // Throne armrests
        for (let s = -1; s <= 1; s += 2) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 14), goldMat);
            arm.position.set(s * 10, 10, -1); emperor.add(arm);
        }

        // Emperor body — imperial purple toga
        const empBody = new THREE.Mesh(
            new THREE.CapsuleGeometry(7, 14, 8, 12),
            new THREE.MeshStandardMaterial({ color: imperialPurple, roughness: 0.6, metalness: 0.1 })
        );
        empBody.position.y = 22; emperor.add(empBody);

        // Gold sash across chest
        const empSash = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 14),
            new THREE.MeshStandardMaterial({ color: gold, roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide })
        );
        empSash.position.set(2, 22, 4); empSash.rotation.z = -0.4;
        emperor.add(empSash);

        // Head
        const empHead = new THREE.Mesh(
            new THREE.SphereGeometry(5, 14, 14),
            new THREE.MeshStandardMaterial({ color: 0xffe4c4, roughness: 0.5 })
        );
        empHead.position.y = 36; emperor.add(empHead);

        // Grand laurel crown — larger, more ornate
        const empCrown = new THREE.Group();
        const crownRing = new THREE.Mesh(
            new THREE.TorusGeometry(6, 1.2, 8, 16),
            goldMat
        );
        crownRing.rotation.x = Math.PI / 2;
        empCrown.add(crownRing);
        for (let lf = 0; lf < 12; lf++) {
            const la = (lf / 12) * Math.PI * 2;
            const leaf = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 4, 4),
                new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.6 })
            );
            leaf.position.set(Math.cos(la) * 6, 0, Math.sin(la) * 6);
            leaf.scale.set(2, 0.5, 1);
            empCrown.add(leaf);
        }
        empCrown.position.y = 40;
        emperor.add(empCrown);

        // Emperor's right arm + thumb (for reactions)
        const thumbGroup = new THREE.Group();
        const empArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(2, 10, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0xffe4c4, roughness: 0.6 })
        );
        empArm.rotation.z = Math.PI / 4;
        thumbGroup.add(empArm);
        const fist = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffe4c4, roughness: 0.6 }));
        fist.position.set(7, 7, 0);
        thumbGroup.add(fist);
        const thumb = new THREE.Mesh(
            new THREE.CapsuleGeometry(1, 5, 4, 8),
            new THREE.MeshStandardMaterial({ color: gold, roughness: 0.4, metalness: 0.3, emissive: 0x332200, emissiveIntensity: 0.3 })
        );
        thumb.position.set(7, 12, 0);
        manager.emperorThumb = thumb;
        thumbGroup.add(thumb);
        thumbGroup.position.set(10, 25, 4);
        emperor.add(thumbGroup);

        // Position emperor in the box, facing inward
        emperor.position.set(boxR - 5, boxBaseY + platH + 1, 0);
        emperor.rotation.y = Math.PI; // face the arena
        emperorBox.add(emperor);

        // Roman eagle standard next to the box
        const eagleGroup = new THREE.Group();
        const ePole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 90, 6), goldMat);
        eagleGroup.add(ePole);
        const eBody = new THREE.Mesh(new THREE.ConeGeometry(7, 12, 6), goldMat);
        eBody.position.y = 50; eagleGroup.add(eBody);
        for (let s = -1; s <= 1; s += 2) {
            const w = new THREE.Mesh(new THREE.BoxGeometry(18, 2.5, 6), goldMat);
            w.position.set(s * 14, 46, 0); w.rotation.z = s * -0.3;
            eagleGroup.add(w);
        }
        eagleGroup.position.set(boxR + platW / 2 + 15, boxBaseY + platH + 10, 0);
        emperorBox.add(eagleGroup);

        // Second eagle on other side
        const eagle2 = eagleGroup.clone();
        eagle2.position.set(boxR - platW / 2 - 15, boxBaseY + platH + 10, 0);
        emperorBox.add(eagle2);

        scene.add(emperorBox);
        manager.emperorBox = emperorBox;
        manager.backdropLayers.push({
            mesh: emperorBox, parallaxFactor: 0.015, rotationSpeed: 0,
            update: function (mesh, time, mgr) {
                if (mgr.emperorThumb) {
                    mgr.emperorThumb.rotation.z += (0 - mgr.emperorThumb.rotation.z) * 0.02;
                    const g = new THREE.Color(0xffd700);
                    mgr.emperorThumb.material.color.lerp(g, 0.02);
                    if (mgr.emperorThumb.material.emissiveIntensity > 0.3) {
                        mgr.emperorThumb.material.emissiveIntensity *= 0.98;
                    }
                    mgr.emperorThumb.material.emissive.lerp(new THREE.Color(0x332200), 0.02);
                }
            }
        });

        // ────────────────────────────
        // LIGHTING — warm Mediterranean sun
        // ────────────────────────────
        const sunLight = new THREE.DirectionalLight(0xffd700, 0.4);
        sunLight.position.set(500, 700, 300);
        scene.add(sunLight);
        manager.backdropLayers.push({ mesh: sunLight, parallaxFactor: 0, rotationSpeed: 0 });

        // Ambient warm fill
        const warmFill = new THREE.HemisphereLight(0xffeedd, 0x886644, 0.2);
        scene.add(warmFill);
        manager.backdropLayers.push({ mesh: warmFill, parallaxFactor: 0, rotationSpeed: 0 });

        // ────────────────────────────
        // DUST MOTES floating in the arena
        // ────────────────────────────
        const dustN = 250;
        const dPos = new Float32Array(dustN * 3);
        for (let i = 0; i < dustN; i++) {
            const da = Math.random() * Math.PI * 2;
            const dd = 420 + Math.random() * 300;
            dPos[i * 3] = Math.cos(da) * dd;
            dPos[i * 3 + 1] = FLOOR_Y + 5 + Math.random() * 180;
            dPos[i * 3 + 2] = Math.sin(da) * dd;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
        const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
            size: 2, color: 0xd4b896, transparent: true, opacity: 0.35, sizeAttenuation: true
        }));
        scene.add(dust);
        manager.backdropLayers.push({
            mesh: dust, parallaxFactor: 0.08, rotationSpeed: 0.0002,
            update: function (mesh, time) {
                const p = mesh.geometry.attributes.position.array;
                for (let i = 0; i < p.length; i += 3) {
                    p[i + 1] += Math.sin(time + i) * 0.04;
                    if (p[i + 1] > 200) p[i + 1] = FLOOR_Y + 5;
                }
                mesh.geometry.attributes.position.needsUpdate = true;
            }
        });

        // Group all stadium/backdrop elements under a single root so the
        // board can be unambiguously centered and backdrop render order
        // kept behind the board. This prevents backdrop pieces from
        // accidentally overlapping the board or being misaligned.
        try {
            const stadiumRoot = new THREE.Group();
            stadiumRoot.name = 'stadiumRoot';
            stadiumRoot.position.set(0, 0, 0);
            stadiumRoot.renderOrder = -2;

            // Reparent all backdropLayers meshes that were added directly to scene
            manager.backdropLayers.forEach(layer => {
                if (layer && layer.mesh && layer.mesh.parent === scene) {
                    try { scene.remove(layer.mesh); } catch (e) { }
                    stadiumRoot.add(layer.mesh);
                }
            });

            // Move any spectators into the stadium root as well
            if (manager.spectators && manager.spectators.length) {
                manager.spectators.forEach(spec => {
                    if (spec && spec.parent === scene) {
                        try { scene.remove(spec); } catch (e) { }
                        stadiumRoot.add(spec);
                    }
                });
            }

            // Move emperor box if present
            if (manager.emperorBox && manager.emperorBox.parent === scene) {
                try { scene.remove(manager.emperorBox); } catch (e) { }
                stadiumRoot.add(manager.emperorBox);
            }

            // Finally add the root to the scene and expose on manager
            scene.add(stadiumRoot);
            manager.stadiumRoot = stadiumRoot;
            // Also ensure the stadium root is available as a backdrop layer
            manager.backdropLayers.unshift({ mesh: stadiumRoot, parallaxFactor: 0, rotationSpeed: 0 });
        } catch (e) {
            console.warn('[Colosseum] stadium grouping failed:', e);
        }
    },

    // React to game events — Emperor reacts!
    onGameEvent: function (eventType, data, manager) {
        switch (eventType) {
            case 'fasttrack':
                manager.triggerCrowdReaction('roaring');
                if (manager.emperorThumb) {
                    manager.emperorThumb.rotation.z = 0;
                    manager.emperorThumb.material.color.setHex(0xffd700);
                    manager.emperorThumb.material.emissive.setHex(0xffd700);
                    manager.emperorThumb.material.emissiveIntensity = 0.8;
                }
                break;
            case 'sendHome':
                manager.triggerCrowdReaction('cheering');
                if (manager.emperorThumb) {
                    manager.emperorThumb.rotation.z = Math.PI;
                    manager.emperorThumb.material.color.setHex(0xc41e3a);
                    manager.emperorThumb.material.emissive.setHex(0xc41e3a);
                    manager.emperorThumb.material.emissiveIntensity = 1.0;
                }
                if (window.GameSFX) GameSFX.playCrowdReaction('boo');
                break;
            case 'win':
                manager.triggerCrowdReaction('roaring');
                if (manager.emperorThumb) {
                    manager.emperorThumb.rotation.z = 0;
                    manager.emperorThumb.material.color.setHex(0xffd700);
                    manager.emperorThumb.material.emissive.setHex(0xffd700);
                    manager.emperorThumb.material.emissiveIntensity = 1.2;
                }
                break;
            case 'bullseye':
                manager.triggerCrowdReaction('excited');
                if (manager.emperorThumb) {
                    manager.emperorThumb.rotation.z = 0;
                    manager.emperorThumb.material.color.setHex(0x00ff00);
                    manager.emperorThumb.material.emissive.setHex(0x00ff00);
                    manager.emperorThumb.material.emissiveIntensity = 0.6;
                }
                break;
            case 'royal':
                manager.triggerCrowdReaction('roaring');
                if (manager.emperorThumb) {
                    manager.emperorThumb.rotation.z = 0;
                    manager.emperorThumb.material.color.setHex(0xffd700);
                    manager.emperorThumb.material.emissive.setHex(0xffd700);
                    manager.emperorThumb.material.emissiveIntensity = 0.9;
                }
                break;
        }
    },

    // Trigger crowd animations
    triggerCrowd: function (reaction, manager) {
        manager.crowdState = reaction;
        manager.spectators.forEach(spec => {
            switch (reaction) {
                case 'cheering': spec.userData.excitement = 1.0; break;
                case 'excited': spec.userData.excitement = 0.7; break;
                case 'roaring': spec.userData.excitement = 1.5; break;
                case 'anticipation': spec.userData.excitement = 0.4; break;
                default: spec.userData.excitement = 0.2;
            }
        });
    }
});

// Spectator animation (called every frame when colosseum theme is active)
FastTrackThemes.updateSpectators = function (time) {
    if (this.currentTheme !== 'colosseum') return;

    this.spectators.forEach(spec => {
        const excitement = spec.userData.excitement || 0.2;
        const speed = spec.userData.waveSpeed || 3;
        const offset = spec.userData.waveOffset || 0;

        // Arm waving
        if (spec.userData.leftArm) {
            const wave = Math.sin(time * speed + offset) * excitement;
            spec.userData.leftArm.rotation.z = spec.userData.leftArm.userData.baseRotZ + wave;
            spec.userData.leftArm.rotation.x = wave * 0.5;
        }
        if (spec.userData.rightArm) {
            const wave = Math.sin(time * speed + offset + Math.PI) * excitement;
            spec.userData.rightArm.rotation.z = spec.userData.rightArm.userData.baseRotZ + wave;
            spec.userData.rightArm.rotation.x = wave * 0.5;
        }

        // Jumping/standing
        const jumpHeight = Math.max(0, Math.sin(time * speed * 2 + offset)) * excitement * 3;
        spec.position.y = spec.userData.originalY + jumpHeight;

        // Gradually calm down
        if (spec.userData.excitement > 0.2) {
            spec.userData.excitement *= 0.998;
        }
    });
};

// ============================================================
// THEME: SPACE ACE
// ============================================================

FastTrackThemes.register('spaceace', {
    name: 'Space Ace',
    description: 'Epic space adventure with planets, spaceships, and the sun',

    create: function (scene, THREE, manager) {
        // Deep space background
        scene.background = new THREE.Color(0x000510);

        // === LAYER 0: Space gradient skybox ===
        const skyGeo = new THREE.SphereGeometry(2000, 64, 64);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec3 vWorldPosition;
                varying vec2 vUv;

                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
                }

                void main() {
                    vec3 deepSpace = vec3(0.0, 0.02, 0.05);
                    vec3 nebula1 = vec3(0.1, 0.0, 0.2);
                    vec3 nebula2 = vec3(0.0, 0.05, 0.15);

                    float h = normalize(vWorldPosition).y;
                    float angle = atan(vWorldPosition.z, vWorldPosition.x);

                    // Create nebula swirls
                    float nebulaMix = sin(angle * 2.0 + h * 3.0 + time * 0.1) * 0.5 + 0.5;
                    nebulaMix *= sin(angle * 5.0 - h * 2.0) * 0.5 + 0.5;
                    nebulaMix *= 0.3;

                    vec3 color = mix(deepSpace, mix(nebula1, nebula2, h * 0.5 + 0.5), nebulaMix);

                    // Add subtle color variation
                    color += vec3(0.02, 0.0, 0.03) * (sin(angle * 10.0 + time * 0.2) * 0.5 + 0.5);

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        scene.add(sky);
        manager.backdropLayers.push({ mesh: sky, parallaxFactor: 0, rotationSpeed: 0.000004 });

        // === LAYER 1: Dense starfield (3 layers for depth) ===
        const createStarfield = (count, minRadius, maxRadius, size, opacity) => {
            const starGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const sizes = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(Math.random() * 2 - 1);
                const radius = minRadius + Math.random() * (maxRadius - minRadius);

                positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
                positions[i * 3 + 1] = radius * Math.cos(phi);
                positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

                // Star colors: white, blue-white, yellow, orange-red
                const colorType = Math.random();
                if (colorType < 0.5) {
                    colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0;
                } else if (colorType < 0.7) {
                    colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0;
                } else if (colorType < 0.85) {
                    colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 0.8;
                } else {
                    colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 0.5;
                }

                sizes[i] = size * (0.5 + Math.random());
            }

            starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const starMat = new THREE.PointsMaterial({
                size: size,
                vertexColors: true,
                transparent: true,
                opacity: opacity,
                sizeAttenuation: true,
                blending: THREE.AdditiveBlending
            });

            return new THREE.Points(starGeo, starMat);
        };

        // Far stars
        const farStars = createStarfield(3000, 1500, 1800, 1.5, 0.6);
        scene.add(farStars);
        manager.backdropLayers.push({ mesh: farStars, parallaxFactor: 0.01, rotationSpeed: 0.00001 });

        // Mid stars
        const midStars = createStarfield(1500, 1000, 1400, 2.5, 0.8);
        scene.add(midStars);
        manager.backdropLayers.push({ mesh: midStars, parallaxFactor: 0.02, rotationSpeed: 0.00002 });

        // Bright close stars
        const closeStars = createStarfield(500, 600, 900, 4, 1.0);
        scene.add(closeStars);
        manager.backdropLayers.push({ mesh: closeStars, parallaxFactor: 0.04, rotationSpeed: 0.00003 });

        // === LAYER 2: THE SUN (dramatic backdrop) ===
        const sunGroup = new THREE.Group();

        // Sun core
        const sunGeo = new THREE.SphereGeometry(200, 64, 64);
        const sunMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                void main() {
                    vUv = uv;
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                varying vec3 vNormal;

                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                void main() {
                    vec3 sunCore = vec3(1.0, 0.95, 0.8);
                    vec3 sunEdge = vec3(1.0, 0.6, 0.1);
                    vec3 sunSpot = vec3(0.8, 0.3, 0.0);

                    // Fresnel for edge glow
                    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);

                    // Animated surface noise (solar activity)
                    float n = noise(vUv * 20.0 + time * 0.5);
                    n += noise(vUv * 50.0 - time * 0.3) * 0.5;
                    n += noise(vUv * 100.0 + time * 0.8) * 0.25;
                    n = n / 1.75;

                    // Sunspots
                    float spots = smoothstep(0.6, 0.65, n) * 0.3;

                    vec3 color = mix(sunCore, sunEdge, fresnel);
                    color = mix(color, sunSpot, spots);

                    // Bright center
                    color += vec3(0.2) * (1.0 - fresnel);

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const sun = new THREE.Mesh(sunGeo, sunMat);
        sunGroup.add(sun);

        // Sun glow layers
        const glowSizes = [220, 260, 320, 400];
        const glowOpacities = [0.4, 0.25, 0.15, 0.08];

        glowSizes.forEach((size, i) => {
            const glowGeo = new THREE.SphereGeometry(size, 32, 32);
            const glowMat = new THREE.MeshBasicMaterial({
                color: i < 2 ? 0xffaa33 : 0xff6600,
                transparent: true,
                opacity: glowOpacities[i],
                blending: THREE.AdditiveBlending,
                side: THREE.BackSide
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            sunGroup.add(glow);
        });

        // Corona rays
        const rayCount = 24;
        for (let i = 0; i < rayCount; i++) {
            const rayGeo = new THREE.ConeGeometry(15, 150 + Math.random() * 100, 4);
            const rayMat = new THREE.MeshBasicMaterial({
                color: 0xffcc66,
                transparent: true,
                opacity: 0.15,
                blending: THREE.AdditiveBlending
            });
            const ray = new THREE.Mesh(rayGeo, rayMat);
            const angle = (i / rayCount) * Math.PI * 2;
            ray.position.set(Math.cos(angle) * 200, Math.sin(angle) * 200, 0);
            ray.rotation.z = angle - Math.PI / 2;
            ray.userData.baseAngle = angle;
            sunGroup.add(ray);
        }

        sunGroup.position.set(-800, 300, -1200);
        scene.add(sunGroup);
        manager.backdropLayers.push({
            mesh: sunGroup,
            parallaxFactor: 0.02,
            rotationSpeed: 0,
            update: function (mesh, time) {
                // Animate sun shader
                const sunMesh = mesh.children[0];
                if (sunMesh.material.uniforms) {
                    sunMesh.material.uniforms.time.value = time;
                }
                // Animate corona rays
                mesh.children.forEach(child => {
                    if (child.userData.baseAngle !== undefined) {
                        const pulse = Math.sin(time * 2 + child.userData.baseAngle * 3) * 0.2 + 1;
                        child.scale.y = pulse;
                    }
                });
            }
        });

        // Sun lens flare effect (simple)
        const flareGeo = new THREE.CircleGeometry(30, 32);
        const flareMat = new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const flare = new THREE.Mesh(flareGeo, flareMat);
        flare.position.set(-400, 150, -600);
        flare.lookAt(0, 0, 0);
        scene.add(flare);
        manager.backdropLayers.push({ mesh: flare, parallaxFactor: 0.05, pulseSpeed: 0.003 });

        // === LAYER 3: SATURN ===
        const saturnGroup = new THREE.Group();

        // Saturn body
        const saturnGeo = new THREE.SphereGeometry(60, 32, 32);
        const saturnMat = new THREE.MeshStandardMaterial({
            color: 0xead6a6,
            roughness: 0.8,
            metalness: 0.1
        });
        const saturn = new THREE.Mesh(saturnGeo, saturnMat);

        // Saturn bands (stripes)
        const bandColors = [0xc9b896, 0xead6a6, 0xd4c4a8, 0xbfaf8a];
        for (let i = 0; i < 8; i++) {
            const bandGeo = new THREE.TorusGeometry(60, 2, 8, 64);
            const bandMat = new THREE.MeshBasicMaterial({
                color: bandColors[i % bandColors.length],
                transparent: true,
                opacity: 0.3
            });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.rotation.x = Math.PI / 2;
            band.position.y = -40 + i * 10;
            band.scale.set(1, 1, 0.1);
            saturnGroup.add(band);
        }
        saturnGroup.add(saturn);

        // Saturn rings
        const ringGeo = new THREE.RingGeometry(80, 130, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xc9b070,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const rings = new THREE.Mesh(ringGeo, ringMat);
        rings.rotation.x = Math.PI / 2.5;
        saturnGroup.add(rings);

        // Inner ring detail
        const innerRingGeo = new THREE.RingGeometry(75, 78, 64);
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0x8b7355,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.rotation.x = Math.PI / 2.5;
        saturnGroup.add(innerRing);

        saturnGroup.position.set(600, 200, -800);
        saturnGroup.rotation.z = 0.3;
        scene.add(saturnGroup);
        manager.backdropLayers.push({
            mesh: saturnGroup,
            parallaxFactor: 0.04,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.rotation.y = time * 0.05;
            }
        });

        // === LAYER 4: JUPITER ===
        const jupiterGroup = new THREE.Group();

        const jupiterGeo = new THREE.SphereGeometry(90, 48, 48);
        const jupiterMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                varying vec3 vPosition;

                void main() {
                    // Jupiter bands
                    vec3 band1 = vec3(0.9, 0.85, 0.7);
                    vec3 band2 = vec3(0.8, 0.6, 0.4);
                    vec3 band3 = vec3(0.7, 0.5, 0.35);
                    vec3 band4 = vec3(0.85, 0.75, 0.6);

                    float y = vUv.y;
                    float band = sin(y * 30.0 + sin(vUv.x * 10.0 + time * 0.2) * 0.5);

                    vec3 color;
                    if (band > 0.3) color = band1;
                    else if (band > -0.1) color = band2;
                    else if (band > -0.4) color = band3;
                    else color = band4;

                    // Great Red Spot
                    vec2 spotCenter = vec2(0.3, 0.55);
                    float spotDist = length((vUv - spotCenter) * vec2(1.5, 1.0));
                    if (spotDist < 0.08) {
                        float spotBlend = 1.0 - spotDist / 0.08;
                        color = mix(color, vec3(0.8, 0.3, 0.2), spotBlend * 0.8);
                    }

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const jupiter = new THREE.Mesh(jupiterGeo, jupiterMat);
        jupiterGroup.add(jupiter);

        jupiterGroup.position.set(-500, -100, -600);
        scene.add(jupiterGroup);
        manager.backdropLayers.push({
            mesh: jupiterGroup,
            parallaxFactor: 0.05,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.rotation.y = time * 0.03;
                const jup = mesh.children[0];
                if (jup.material.uniforms) {
                    jup.material.uniforms.time.value = time;
                }
            }
        });

        // === LAYER 5: NEPTUNE ===
        const neptuneGroup = new THREE.Group();

        const neptuneGeo = new THREE.SphereGeometry(45, 32, 32);
        const neptuneMat = new THREE.MeshStandardMaterial({
            color: 0x4169e1,
            roughness: 0.6,
            metalness: 0.2,
            emissive: 0x1a1a4a,
            emissiveIntensity: 0.3
        });
        const neptune = new THREE.Mesh(neptuneGeo, neptuneMat);
        neptuneGroup.add(neptune);

        // Neptune atmosphere glow
        const neptuneGlowGeo = new THREE.SphereGeometry(48, 32, 32);
        const neptuneGlowMat = new THREE.MeshBasicMaterial({
            color: 0x6495ed,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        const neptuneGlow = new THREE.Mesh(neptuneGlowGeo, neptuneGlowMat);
        neptuneGroup.add(neptuneGlow);

        // Neptune's faint ring
        const neptuneRingGeo = new THREE.RingGeometry(55, 65, 64);
        const neptuneRingMat = new THREE.MeshBasicMaterial({
            color: 0x4a5a8a,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const neptuneRing = new THREE.Mesh(neptuneRingGeo, neptuneRingMat);
        neptuneRing.rotation.x = Math.PI / 3;
        neptuneGroup.add(neptuneRing);

        neptuneGroup.position.set(400, -200, -500);
        scene.add(neptuneGroup);
        manager.backdropLayers.push({
            mesh: neptuneGroup,
            parallaxFactor: 0.06,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.rotation.y = time * 0.04;
            }
        });

        // === LAYER 6: SPACESHIPS ===
        const createSpaceship = (type) => {
            const shipGroup = new THREE.Group();

            if (type === 'fighter') {
                // Sleek fighter ship
                const bodyGeo = new THREE.ConeGeometry(8, 30, 6);
                const bodyMat = new THREE.MeshStandardMaterial({
                    color: 0x888899,
                    roughness: 0.3,
                    metalness: 0.8
                });
                const body = new THREE.Mesh(bodyGeo, bodyMat);
                body.rotation.x = Math.PI / 2;
                shipGroup.add(body);

                // Wings
                const wingGeo = new THREE.BoxGeometry(40, 2, 10);
                const wingMat = new THREE.MeshStandardMaterial({
                    color: 0x666677,
                    roughness: 0.4,
                    metalness: 0.7
                });
                const wings = new THREE.Mesh(wingGeo, wingMat);
                wings.position.z = 5;
                shipGroup.add(wings);

                // Cockpit
                const cockpitGeo = new THREE.SphereGeometry(4, 16, 16);
                const cockpitMat = new THREE.MeshStandardMaterial({
                    color: 0x44aaff,
                    roughness: 0.1,
                    metalness: 0.9,
                    emissive: 0x2266aa,
                    emissiveIntensity: 0.5
                });
                const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
                cockpit.position.z = -5;
                cockpit.scale.z = 0.5;
                shipGroup.add(cockpit);

                // Engine glow
                const engineGeo = new THREE.CylinderGeometry(3, 5, 8, 8);
                const engineMat = new THREE.MeshBasicMaterial({
                    color: 0x00aaff,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const engine = new THREE.Mesh(engineGeo, engineMat);
                engine.rotation.x = Math.PI / 2;
                engine.position.z = 18;
                shipGroup.add(engine);

            } else if (type === 'cruiser') {
                // Large cruiser
                const hullGeo = new THREE.CylinderGeometry(15, 20, 80, 8);
                const hullMat = new THREE.MeshStandardMaterial({
                    color: 0x555566,
                    roughness: 0.5,
                    metalness: 0.6
                });
                const hull = new THREE.Mesh(hullGeo, hullMat);
                hull.rotation.x = Math.PI / 2;
                shipGroup.add(hull);

                // Bridge
                const bridgeGeo = new THREE.BoxGeometry(25, 15, 20);
                const bridge = new THREE.Mesh(bridgeGeo, hullMat);
                bridge.position.set(0, 10, -20);
                shipGroup.add(bridge);

                // Engine pods
                [-1, 1].forEach(side => {
                    const podGeo = new THREE.CylinderGeometry(8, 10, 30, 8);
                    const pod = new THREE.Mesh(podGeo, hullMat);
                    pod.rotation.x = Math.PI / 2;
                    pod.position.set(side * 25, -5, 30);
                    shipGroup.add(pod);

                    // Engine glow
                    const glowGeo = new THREE.CylinderGeometry(6, 8, 10, 8);
                    const glowMat = new THREE.MeshBasicMaterial({
                        color: 0xff6600,
                        transparent: true,
                        opacity: 0.8,
                        blending: THREE.AdditiveBlending
                    });
                    const glow = new THREE.Mesh(glowGeo, glowMat);
                    glow.rotation.x = Math.PI / 2;
                    glow.position.set(side * 25, -5, 48);
                    shipGroup.add(glow);
                });
            }

            return shipGroup;
        };

        // Add multiple ships
        const ships = [];

        // Fighter squadron (formation)
        for (let i = 0; i < 5; i++) {
            const fighter = createSpaceship('fighter');
            const formationX = (i - 2) * 40;
            const formationZ = Math.abs(i - 2) * 30;
            fighter.position.set(200 + formationX, 150 + (i % 2) * 20, -300 - formationZ);
            fighter.rotation.y = -0.3;
            fighter.userData.orbitRadius = 400;
            fighter.userData.orbitSpeed = 0.1 + i * 0.02;
            fighter.userData.orbitOffset = (i / 5) * Math.PI * 2;
            fighter.userData.baseY = fighter.position.y;
            scene.add(fighter);
            ships.push(fighter);
        }

        // Cruiser in distance
        const cruiser = createSpaceship('cruiser');
        cruiser.position.set(-300, 50, -700);
        cruiser.rotation.y = 0.5;
        cruiser.userData.driftSpeed = 0.02;
        cruiser.userData.basePos = cruiser.position.clone();
        scene.add(cruiser);
        ships.push(cruiser);

        // Second cruiser
        const cruiser2 = createSpaceship('cruiser');
        cruiser2.position.set(500, -50, -900);
        cruiser2.rotation.y = -0.8;
        cruiser2.scale.setScalar(0.7);
        cruiser2.userData.driftSpeed = 0.015;
        cruiser2.userData.basePos = cruiser2.position.clone();
        scene.add(cruiser2);
        ships.push(cruiser2);

        // Store ships for animation
        manager.ships = ships;
        manager.backdropLayers.push({
            mesh: new THREE.Group(), // Dummy for update
            parallaxFactor: 0,
            update: function (mesh, time, mgr) {
                if (!mgr.ships) return;
                mgr.ships.forEach((ship, i) => {
                    if (ship.userData.orbitRadius) {
                        // Fighter orbital movement
                        const angle = time * ship.userData.orbitSpeed + ship.userData.orbitOffset;
                        ship.position.y = ship.userData.baseY + Math.sin(time * 0.5 + i) * 10;
                        ship.rotation.z = Math.sin(time * 0.3 + i) * 0.1;
                    } else if (ship.userData.driftSpeed) {
                        // Cruiser slow drift
                        ship.position.x = ship.userData.basePos.x + Math.sin(time * ship.userData.driftSpeed) * 20;
                        ship.position.y = ship.userData.basePos.y + Math.cos(time * ship.userData.driftSpeed * 0.7) * 10;
                    }
                });
            }
        });

        // === LAYER 7: Asteroid field (subtle) ===
        const asteroidGroup = new THREE.Group();

        for (let i = 0; i < 30; i++) {
            const size = 5 + Math.random() * 15;
            const asteroidGeo = new THREE.DodecahedronGeometry(size, 0);
            const asteroidMat = new THREE.MeshStandardMaterial({
                color: 0x554433,
                roughness: 0.9,
                metalness: 0.1
            });
            const asteroid = new THREE.Mesh(asteroidGeo, asteroidMat);

            const angle = Math.random() * Math.PI * 2;
            const dist = 500 + Math.random() * 400;
            asteroid.position.set(
                Math.cos(angle) * dist,
                -150 + Math.random() * 300,
                Math.sin(angle) * dist
            );
            asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            asteroid.userData.rotSpeed = (Math.random() - 0.5) * 0.01;
            asteroidGroup.add(asteroid);
        }
        scene.add(asteroidGroup);
        manager.backdropLayers.push({
            mesh: asteroidGroup,
            parallaxFactor: 0.06,
            rotationSpeed: 0.00005,
            isFloating: true,
            update: function (mesh, time) {
                mesh.children.forEach(asteroid => {
                    asteroid.rotation.x += asteroid.userData.rotSpeed;
                    asteroid.rotation.y += asteroid.userData.rotSpeed * 0.7;
                });
            }
        });

        // === LAYER 8: Space dust / particles ===
        const dustCount = 400;
        const dustGeo = new THREE.BufferGeometry();
        const dustPositions = new Float32Array(dustCount * 3);

        for (let i = 0; i < dustCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 420 + Math.random() * 350;
            dustPositions[i * 3] = Math.cos(angle) * dist;
            dustPositions[i * 3 + 1] = -100 + Math.random() * 250;
            dustPositions[i * 3 + 2] = Math.sin(angle) * dist;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

        const dustMat = new THREE.PointsMaterial({
            size: 2,
            color: 0x6688aa,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        const dust = new THREE.Points(dustGeo, dustMat);
        scene.add(dust);
        manager.backdropLayers.push({ mesh: dust, parallaxFactor: 0.1, rotationSpeed: 0.0002 });

        // === Additional sun lighting ===
        const sunPointLight = new THREE.PointLight(0xffddaa, 0.5, 2000);
        sunPointLight.position.set(-800, 300, -1200);
        scene.add(sunPointLight);
        manager.backdropLayers.push({ mesh: sunPointLight, parallaxFactor: 0, rotationSpeed: 0 });
    }
});

// ============================================================
// THEME: UNDER THE SEA
// ============================================================

FastTrackThemes.register('undersea', {
    name: 'Under the Sea',
    description: 'Magical underwater world with fish, coral, and sunbeams',

    create: function (scene, THREE, manager) {
        // Deep ocean blue background
        scene.background = new THREE.Color(0x001a33);

        // === LAYER 0: Ocean gradient dome ===
        const oceanGeo = new THREE.SphereGeometry(1500, 64, 64);
        const oceanMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec3 vWorldPosition;
                varying vec2 vUv;

                void main() {
                    vec3 deepOcean = vec3(0.0, 0.05, 0.15);
                    vec3 midOcean = vec3(0.0, 0.15, 0.35);
                    vec3 shallowOcean = vec3(0.0, 0.3, 0.5);
                    vec3 surface = vec3(0.2, 0.5, 0.7);

                    float h = normalize(vWorldPosition).y;

                    // Caustic-like patterns
                    float caustic = sin(vUv.x * 30.0 + time * 0.5) * sin(vUv.y * 30.0 + time * 0.3);
                    caustic += sin(vUv.x * 20.0 - time * 0.4) * sin(vUv.y * 25.0 + time * 0.6);
                    caustic = caustic * 0.5 + 0.5;
                    caustic *= 0.1;

                    vec3 color;
                    if (h > 0.5) {
                        color = mix(midOcean, surface, (h - 0.5) * 2.0);
                    } else if (h > 0.0) {
                        color = mix(midOcean, shallowOcean, h * 2.0);
                    } else {
                        color = mix(deepOcean, midOcean, h + 1.0);
                    }

                    // Add caustics near surface
                    color += vec3(caustic) * smoothstep(0.0, 0.8, h);

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        scene.add(ocean);
        manager.backdropLayers.push({ mesh: ocean, parallaxFactor: 0, rotationSpeed: 0 });

        // === LAYER 1: Sunbeams from surface ===
        const sunbeamGroup = new THREE.Group();
        const beamCount = 12;

        for (let i = 0; i < beamCount; i++) {
            const beamGeo = new THREE.CylinderGeometry(5, 40, 800, 8, 1, true);
            const beamMat = new THREE.ShaderMaterial({
                transparent: true,
                side: THREE.DoubleSide,
                uniforms: {
                    time: { value: 0 },
                    offset: { value: i * 0.5 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float time;
                    uniform float offset;
                    varying vec2 vUv;
                    void main() {
                        float alpha = (1.0 - vUv.y) * 0.15;
                        alpha *= sin(time * 0.5 + offset) * 0.3 + 0.7;
                        alpha *= smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
                        vec3 color = vec3(0.4, 0.7, 0.9);
                        gl_FragColor = vec4(color, alpha);
                    }
                `
            });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            const angle = (i / beamCount) * Math.PI * 2;
            const dist = 420 + Math.random() * 300;
            beam.position.set(
                Math.cos(angle) * dist,
                400,
                Math.sin(angle) * dist
            );
            beam.rotation.x = (Math.random() - 0.5) * 0.3;
            beam.rotation.z = (Math.random() - 0.5) * 0.3;
            beam.userData.offset = i * 0.5;
            sunbeamGroup.add(beam);
        }
        scene.add(sunbeamGroup);
        manager.backdropLayers.push({
            mesh: sunbeamGroup,
            parallaxFactor: 0.02,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(beam => {
                    if (beam.material.uniforms) {
                        beam.material.uniforms.time.value = time;
                    }
                });
            }
        });

        // === LAYER 2: Bubbles ===
        const bubbleCount = 200;
        const bubbleGroup = new THREE.Group();

        for (let i = 0; i < bubbleCount; i++) {
            const size = 2 + Math.random() * 6;
            const bubbleGeo = new THREE.SphereGeometry(size, 16, 16);
            const bubbleMat = new THREE.MeshBasicMaterial({
                color: 0xaaddff,
                transparent: true,
                opacity: 0.3 + Math.random() * 0.3,
                blending: THREE.AdditiveBlending
            });
            const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);

            const angle = Math.random() * Math.PI * 2;
            const dist = 420 + Math.random() * 300;
            bubble.position.set(
                Math.cos(angle) * dist,
                -200 + Math.random() * 600,
                Math.sin(angle) * dist
            );
            bubble.userData.speed = 0.5 + Math.random() * 1.5;
            bubble.userData.wobbleSpeed = 2 + Math.random() * 3;
            bubble.userData.wobbleAmount = 0.5 + Math.random();
            bubble.userData.startX = bubble.position.x;
            bubble.userData.startZ = bubble.position.z;
            bubbleGroup.add(bubble);
        }
        scene.add(bubbleGroup);
        manager.backdropLayers.push({
            mesh: bubbleGroup,
            parallaxFactor: 0.08,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(bubble => {
                    bubble.position.y += bubble.userData.speed * 0.3;
                    bubble.position.x = bubble.userData.startX + Math.sin(time * bubble.userData.wobbleSpeed) * bubble.userData.wobbleAmount * 5;
                    bubble.position.z = bubble.userData.startZ + Math.cos(time * bubble.userData.wobbleSpeed * 0.7) * bubble.userData.wobbleAmount * 5;

                    // Reset bubble when it reaches top
                    if (bubble.position.y > 500) {
                        bubble.position.y = -200;
                    }
                });
            }
        });

        // === LAYER 3: Sandy ocean floor ===
        const floorGeo = new THREE.CircleGeometry(1000, 64);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xc9a86c,
            roughness: 0.9,
            metalness: 0.0
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -150;
        scene.add(floor);
        manager.backdropLayers.push({ mesh: floor, parallaxFactor: 0, rotationSpeed: 0 });

        // Sand ripples
        for (let i = 0; i < 8; i++) {
            const rippleGeo = new THREE.TorusGeometry(100 + i * 80, 3, 8, 64);
            const rippleMat = new THREE.MeshBasicMaterial({
                color: 0xb8976b,
                transparent: true,
                opacity: 0.3
            });
            const ripple = new THREE.Mesh(rippleGeo, rippleMat);
            ripple.rotation.x = -Math.PI / 2;
            ripple.position.y = -148;
            scene.add(ripple);
        }

        // === LAYER 4: Coral reef ===
        const coralGroup = new THREE.Group();
        const coralColors = [0xff6b6b, 0xff8e72, 0xffa07a, 0xff69b4, 0xda70d6, 0x9370db, 0x20b2aa, 0x00ced1];

        // Create different coral types
        const createBranchCoral = (color, height) => {
            const coral = new THREE.Group();
            const branches = 5 + Math.floor(Math.random() * 5);

            for (let i = 0; i < branches; i++) {
                const branchHeight = height * (0.5 + Math.random() * 0.5);
                const branchGeo = new THREE.CylinderGeometry(2, 4, branchHeight, 6);
                const branchMat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.8,
                    metalness: 0.1
                });
                const branch = new THREE.Mesh(branchGeo, branchMat);
                branch.position.set(
                    (Math.random() - 0.5) * 15,
                    branchHeight / 2,
                    (Math.random() - 0.5) * 15
                );
                branch.rotation.x = (Math.random() - 0.5) * 0.5;
                branch.rotation.z = (Math.random() - 0.5) * 0.5;
                coral.add(branch);

                // Small tips
                const tipGeo = new THREE.SphereGeometry(3, 8, 8);
                const tip = new THREE.Mesh(tipGeo, branchMat);
                tip.position.set(branch.position.x, branchHeight, branch.position.z);
                coral.add(tip);
            }
            return coral;
        };

        const createFanCoral = (color) => {
            const fanGeo = new THREE.CircleGeometry(20 + Math.random() * 20, 32);
            const fanMat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.7,
                metalness: 0.1,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9
            });
            const fan = new THREE.Mesh(fanGeo, fanMat);
            fan.rotation.x = -0.3 + Math.random() * 0.6;
            return fan;
        };

        const createBrainCoral = (color) => {
            const brainGeo = new THREE.DodecahedronGeometry(15 + Math.random() * 15, 1);
            const brainMat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.9,
                metalness: 0.0
            });
            const brain = new THREE.Mesh(brainGeo, brainMat);
            brain.scale.y = 0.5;
            return brain;
        };

        // Place corals around the scene
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 250 + Math.random() * 400;
            const coralType = Math.floor(Math.random() * 3);
            const color = coralColors[Math.floor(Math.random() * coralColors.length)];

            let coral;
            switch (coralType) {
                case 0:
                    coral = createBranchCoral(color, 30 + Math.random() * 30);
                    break;
                case 1:
                    coral = createFanCoral(color);
                    coral.position.y = 15 + Math.random() * 20;
                    break;
                case 2:
                    coral = createBrainCoral(color);
                    break;
            }

            coral.position.x = Math.cos(angle) * dist;
            coral.position.z = Math.sin(angle) * dist;
            coral.position.y += -145;
            coral.rotation.y = Math.random() * Math.PI * 2;
            coralGroup.add(coral);
        }
        scene.add(coralGroup);
        manager.backdropLayers.push({ mesh: coralGroup, parallaxFactor: 0.04, rotationSpeed: 0 });

        // === LAYER 5: Seaweed ===
        const seaweedGroup = new THREE.Group();

        for (let i = 0; i < 50; i++) {
            const seaweed = new THREE.Group();
            const segments = 5 + Math.floor(Math.random() * 5);
            const baseHeight = 20 + Math.random() * 40;

            for (let j = 0; j < segments; j++) {
                const segGeo = new THREE.CylinderGeometry(2 - j * 0.3, 3 - j * 0.3, baseHeight / segments, 6);
                const segMat = new THREE.MeshStandardMaterial({
                    color: j % 2 === 0 ? 0x228b22 : 0x32cd32,
                    roughness: 0.8,
                    metalness: 0.0
                });
                const seg = new THREE.Mesh(segGeo, segMat);
                seg.position.y = j * (baseHeight / segments);
                seg.userData.segIndex = j;
                seaweed.add(seg);
            }

            const angle = Math.random() * Math.PI * 2;
            const dist = 200 + Math.random() * 500;
            seaweed.position.set(
                Math.cos(angle) * dist,
                -145,
                Math.sin(angle) * dist
            );
            seaweed.userData.swaySpeed = 1 + Math.random() * 2;
            seaweed.userData.swayOffset = Math.random() * Math.PI * 2;
            seaweedGroup.add(seaweed);
        }
        scene.add(seaweedGroup);
        manager.backdropLayers.push({
            mesh: seaweedGroup,
            parallaxFactor: 0.05,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(seaweed => {
                    seaweed.children.forEach(seg => {
                        const sway = Math.sin(time * seaweed.userData.swaySpeed + seaweed.userData.swayOffset + seg.userData.segIndex * 0.3) * 0.1;
                        seg.rotation.x = sway * (seg.userData.segIndex + 1) * 0.5;
                        seg.rotation.z = sway * 0.5;
                    });
                });
            }
        });

        // === LAYER 5.5: More coral varieties (tube coral, staghorn) ===
        const extraCoralGroup = new THREE.Group();

        // Tube coral
        const createTubeCoral = (color) => {
            const tubeGroup = new THREE.Group();
            const tubeCount = 8 + Math.floor(Math.random() * 8);

            for (let i = 0; i < tubeCount; i++) {
                const height = 15 + Math.random() * 25;
                const radius = 2 + Math.random() * 3;
                const tubeGeo = new THREE.CylinderGeometry(radius, radius * 1.2, height, 12, 1, true);
                const tubeMat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.7,
                    metalness: 0.1,
                    side: THREE.DoubleSide
                });
                const tube = new THREE.Mesh(tubeGeo, tubeMat);
                tube.position.set(
                    (Math.random() - 0.5) * 20,
                    height / 2,
                    (Math.random() - 0.5) * 20
                );
                tube.rotation.x = (Math.random() - 0.5) * 0.2;
                tube.rotation.z = (Math.random() - 0.5) * 0.2;
                tubeGroup.add(tube);

                // Inner glow
                const innerGeo = new THREE.CircleGeometry(radius * 0.8, 12);
                const innerMat = new THREE.MeshBasicMaterial({
                    color: 0xffff88,
                    transparent: true,
                    opacity: 0.5
                });
                const inner = new THREE.Mesh(innerGeo, innerMat);
                inner.position.set(tube.position.x, height, tube.position.z);
                inner.rotation.x = -Math.PI / 2;
                tubeGroup.add(inner);
            }
            return tubeGroup;
        };

        // Staghorn coral
        const createStaghornCoral = (color) => {
            const staghornGroup = new THREE.Group();

            const createBranch = (parentPos, direction, length, depth) => {
                if (depth > 3 || length < 5) return;

                const branchGeo = new THREE.CylinderGeometry(length * 0.1, length * 0.15, length, 6);
                const branchMat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.8,
                    metalness: 0.0
                });
                const branch = new THREE.Mesh(branchGeo, branchMat);

                branch.position.copy(parentPos);
                branch.position.y += length / 2;
                branch.rotation.x = direction.x * 0.3;
                branch.rotation.z = direction.z * 0.3;
                staghornGroup.add(branch);

                // Add sub-branches
                if (Math.random() > 0.3) {
                    createBranch(
                        new THREE.Vector3(
                            parentPos.x + direction.x * 5,
                            parentPos.y + length * 0.7,
                            parentPos.z + direction.z * 5
                        ),
                        new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
                        length * 0.7,
                        depth + 1
                    );
                }
                if (Math.random() > 0.4) {
                    createBranch(
                        new THREE.Vector3(
                            parentPos.x - direction.x * 3,
                            parentPos.y + length * 0.5,
                            parentPos.z - direction.z * 3
                        ),
                        new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
                        length * 0.6,
                        depth + 1
                    );
                }
            };

            // Create main trunk and branches
            for (let i = 0; i < 3; i++) {
                createBranch(
                    new THREE.Vector3((Math.random() - 0.5) * 15, 0, (Math.random() - 0.5) * 15),
                    new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5)),
                    20 + Math.random() * 15,
                    0
                );
            }
            return staghornGroup;
        };

        // Mushroom coral
        const createMushroomCoral = (color) => {
            const mushroom = new THREE.Group();
            const capGeo = new THREE.SphereGeometry(12 + Math.random() * 8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const capMat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.6,
                metalness: 0.1
            });
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.scale.y = 0.4;
            mushroom.add(cap);

            // Ridges
            const ridgeCount = 16;
            for (let i = 0; i < ridgeCount; i++) {
                const ridgeAngle = (i / ridgeCount) * Math.PI * 2;
                const ridgeGeo = new THREE.BoxGeometry(1, 2, 10);
                const ridge = new THREE.Mesh(ridgeGeo, capMat);
                ridge.position.set(Math.cos(ridgeAngle) * 6, 1, Math.sin(ridgeAngle) * 6);
                ridge.rotation.y = ridgeAngle;
                mushroom.add(ridge);
            }
            return mushroom;
        };

        const extraCoralColors = [0xffa500, 0x00ff7f, 0xffd700, 0xff1493, 0x00ffff, 0xff6347];

        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 280 + Math.random() * 450;
            const coralType = Math.floor(Math.random() * 3);
            const color = extraCoralColors[Math.floor(Math.random() * extraCoralColors.length)];

            let coral;
            switch (coralType) {
                case 0:
                    coral = createTubeCoral(color);
                    break;
                case 1:
                    coral = createStaghornCoral(color);
                    break;
                case 2:
                    coral = createMushroomCoral(color);
                    break;
            }

            coral.position.x = Math.cos(angle) * dist;
            coral.position.z = Math.sin(angle) * dist;
            coral.position.y = -147;
            coral.rotation.y = Math.random() * Math.PI * 2;
            extraCoralGroup.add(coral);
        }
        scene.add(extraCoralGroup);
        manager.backdropLayers.push({ mesh: extraCoralGroup, parallaxFactor: 0.04, rotationSpeed: 0 });

        // === LAYER 5.6: Sea Crabs ===
        const crabGroup = new THREE.Group();

        const createCrab = (color) => {
            const crab = new THREE.Group();

            // Body (oval shell)
            const bodyGeo = new THREE.SphereGeometry(5, 12, 8);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.5,
                metalness: 0.2
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.scale.set(1.5, 0.5, 1.2);
            body.position.y = 3;
            crab.add(body);

            // Shell details (bumps)
            for (let i = 0; i < 5; i++) {
                const bumpGeo = new THREE.SphereGeometry(1.5, 8, 8);
                const bump = new THREE.Mesh(bumpGeo, bodyMat);
                bump.position.set(
                    (Math.random() - 0.5) * 5,
                    4,
                    (Math.random() - 0.5) * 4
                );
                bump.scale.y = 0.6;
                crab.add(bump);
            }

            // Eyes on stalks
            const eyeStalkMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 });
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

            for (let side = -1; side <= 1; side += 2) {
                const stalkGeo = new THREE.CylinderGeometry(0.3, 0.5, 3, 8);
                const stalk = new THREE.Mesh(stalkGeo, eyeStalkMat);
                stalk.position.set(side * 3, 4.5, -3);
                stalk.rotation.x = -0.4;
                crab.add(stalk);

                const eyeGeo = new THREE.SphereGeometry(0.8, 8, 8);
                const eye = new THREE.Mesh(eyeGeo, eyeMat);
                eye.position.set(side * 3, 6, -4);
                crab.add(eye);
            }

            // Claws (pincers)
            const clawMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(color).offsetHSL(0, 0, -0.1),
                roughness: 0.4,
                metalness: 0.3
            });

            for (let side = -1; side <= 1; side += 2) {
                const clawArm = new THREE.Group();

                // Arm segment
                const armGeo = new THREE.CylinderGeometry(1, 1.2, 6, 8);
                const arm = new THREE.Mesh(armGeo, clawMat);
                arm.rotation.z = Math.PI / 2;
                arm.position.x = side * 4;
                clawArm.add(arm);

                // Claw pincer (top)
                const pincer1Geo = new THREE.ConeGeometry(1.5, 5, 6);
                const pincer1 = new THREE.Mesh(pincer1Geo, clawMat);
                pincer1.position.set(side * 8, 1, 0);
                pincer1.rotation.z = side * -0.8;
                pincer1.userData.isPincer = 'top';
                clawArm.add(pincer1);

                // Claw pincer (bottom)
                const pincer2 = new THREE.Mesh(pincer1Geo, clawMat);
                pincer2.position.set(side * 8, -1, 0);
                pincer2.rotation.z = side * 0.8;
                pincer2.userData.isPincer = 'bottom';
                clawArm.add(pincer2);

                clawArm.position.y = 3;
                clawArm.userData.side = side;
                crab.add(clawArm);
            }

            // Legs (4 on each side)
            const legMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 });

            for (let side = -1; side <= 1; side += 2) {
                for (let i = 0; i < 4; i++) {
                    const leg = new THREE.Group();

                    const upperLegGeo = new THREE.CylinderGeometry(0.4, 0.5, 4, 6);
                    const upperLeg = new THREE.Mesh(upperLegGeo, legMat);
                    upperLeg.rotation.z = side * 0.8;
                    upperLeg.position.x = side * 2;
                    leg.add(upperLeg);

                    const lowerLegGeo = new THREE.CylinderGeometry(0.2, 0.4, 4, 6);
                    const lowerLeg = new THREE.Mesh(lowerLegGeo, legMat);
                    lowerLeg.rotation.z = side * -0.3;
                    lowerLeg.position.set(side * 4, -1.5, 0);
                    leg.add(lowerLeg);

                    leg.position.set(0, 2, -2 + i * 1.5);
                    leg.userData.legIndex = i;
                    leg.userData.side = side;
                    crab.add(leg);
                }
            }

            return crab;
        };

        const crabColors = [0xff4500, 0xdc143c, 0x8b0000, 0xff6347, 0xd2691e, 0xa52a2a];

        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 200 + Math.random() * 400;
            const crab = createCrab(crabColors[Math.floor(Math.random() * crabColors.length)]);

            crab.position.set(
                Math.cos(angle) * dist,
                -148,
                Math.sin(angle) * dist
            );
            crab.rotation.y = Math.random() * Math.PI * 2;
            crab.scale.setScalar(0.8 + Math.random() * 0.6);

            crab.userData.walkSpeed = 0.5 + Math.random() * 0.5;
            crab.userData.walkOffset = Math.random() * Math.PI * 2;
            crab.userData.walkDirection = Math.random() * Math.PI * 2;
            crab.userData.sidestepPhase = 0;
            crab.userData.startX = crab.position.x;
            crab.userData.startZ = crab.position.z;

            crabGroup.add(crab);
        }
        scene.add(crabGroup);
        manager.backdropLayers.push({
            mesh: crabGroup,
            parallaxFactor: 0.03,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(crab => {
                    // Sideways walking motion
                    const walkCycle = Math.sin(time * crab.userData.walkSpeed * 3 + crab.userData.walkOffset);
                    const sidestep = Math.sin(time * crab.userData.walkSpeed + crab.userData.walkOffset) * 15;

                    crab.position.x = crab.userData.startX + Math.cos(crab.userData.walkDirection) * sidestep;
                    crab.position.z = crab.userData.startZ + Math.sin(crab.userData.walkDirection) * sidestep;

                    // Leg animation
                    crab.children.forEach(child => {
                        if (child.userData.legIndex !== undefined) {
                            const legPhase = child.userData.legIndex * Math.PI / 2 + (child.userData.side > 0 ? Math.PI : 0);
                            child.rotation.x = Math.sin(time * crab.userData.walkSpeed * 6 + legPhase) * 0.3;
                        }
                    });

                    // Claw snapping
                    crab.children.forEach(child => {
                        if (child.userData.side !== undefined && child.children.length > 0) {
                            child.children.forEach(pincer => {
                                if (pincer.userData.isPincer === 'top') {
                                    pincer.rotation.z = child.userData.side * (-0.8 + Math.sin(time * 2) * 0.2);
                                } else if (pincer.userData.isPincer === 'bottom') {
                                    pincer.rotation.z = child.userData.side * (0.8 - Math.sin(time * 2) * 0.2);
                                }
                            });
                        }
                    });
                });
            }
        });

        // === LAYER 5.7: Sea Clams ===
        const clamGroup = new THREE.Group();

        const createClam = (color) => {
            const clam = new THREE.Group();

            // Bottom shell
            const shellGeo = new THREE.SphereGeometry(8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const shellMat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.4,
                metalness: 0.2
            });
            const bottomShell = new THREE.Mesh(shellGeo, shellMat);
            bottomShell.scale.set(1.2, 0.5, 1);
            bottomShell.rotation.x = Math.PI;
            clam.add(bottomShell);

            // Add ridges to shell
            for (let i = 0; i < 12; i++) {
                const ridgeAngle = (i / 12) * Math.PI * 2;
                const ridgeGeo = new THREE.BoxGeometry(0.5, 1, 8);
                const ridge = new THREE.Mesh(ridgeGeo, shellMat);
                ridge.position.set(Math.cos(ridgeAngle) * 6, -2, Math.sin(ridgeAngle) * 5);
                ridge.rotation.y = ridgeAngle;
                ridge.rotation.x = 0.3;
                clam.add(ridge);
            }

            // Top shell (hinged)
            const topShell = new THREE.Mesh(shellGeo, shellMat);
            topShell.scale.set(1.2, 0.5, 1);
            topShell.position.z = -7;
            topShell.userData.isTopShell = true;
            clam.add(topShell);

            // Top shell ridges
            const topRidgeGroup = new THREE.Group();
            for (let i = 0; i < 12; i++) {
                const ridgeAngle = (i / 12) * Math.PI * 2;
                const ridgeGeo = new THREE.BoxGeometry(0.5, 1, 8);
                const ridge = new THREE.Mesh(ridgeGeo, shellMat);
                ridge.position.set(Math.cos(ridgeAngle) * 6, 2, Math.sin(ridgeAngle) * 5);
                ridge.rotation.y = ridgeAngle;
                ridge.rotation.x = -0.3;
                topRidgeGroup.add(ridge);
            }
            topRidgeGroup.position.z = -7;
            topRidgeGroup.userData.isTopShell = true;
            clam.add(topRidgeGroup);

            // Pearl inside
            const pearlGeo = new THREE.SphereGeometry(3, 16, 16);
            const pearlMat = new THREE.MeshStandardMaterial({
                color: 0xfff8f0,
                roughness: 0.1,
                metalness: 0.8,
                emissive: 0x444433,
                emissiveIntensity: 0.2
            });
            const pearl = new THREE.Mesh(pearlGeo, pearlMat);
            pearl.position.y = -1;
            pearl.userData.isPearl = true;
            clam.add(pearl);

            // Fleshy interior
            const fleshGeo = new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const fleshMat = new THREE.MeshStandardMaterial({
                color: 0xffb6c1,
                roughness: 0.7,
                metalness: 0.0
            });
            const flesh = new THREE.Mesh(fleshGeo, fleshMat);
            flesh.scale.set(1.1, 0.3, 0.9);
            flesh.rotation.x = Math.PI;
            flesh.position.y = -2;
            clam.add(flesh);

            return clam;
        };

        const clamColors = [0x8fbc8f, 0x9370db, 0xdeb887, 0xd2691e, 0x708090, 0xbc8f8f];

        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 220 + Math.random() * 380;
            const clam = createClam(clamColors[Math.floor(Math.random() * clamColors.length)]);

            clam.position.set(
                Math.cos(angle) * dist,
                -147,
                Math.sin(angle) * dist
            );
            clam.rotation.y = Math.random() * Math.PI * 2;
            clam.scale.setScalar(0.7 + Math.random() * 0.5);

            clam.userData.openSpeed = 0.3 + Math.random() * 0.4;
            clam.userData.openOffset = Math.random() * Math.PI * 2;
            clam.userData.openAmount = 0;

            clamGroup.add(clam);
        }
        scene.add(clamGroup);
        manager.backdropLayers.push({
            mesh: clamGroup,
            parallaxFactor: 0.03,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(clam => {
                    // Opening and closing animation
                    const openCycle = (Math.sin(time * clam.userData.openSpeed + clam.userData.openOffset) + 1) / 2;
                    const openAngle = openCycle * 0.8; // Max open angle

                    clam.children.forEach(child => {
                        if (child.userData.isTopShell) {
                            child.rotation.x = openAngle;
                            child.position.y = Math.sin(openAngle) * 3;
                        }
                        // Pearl gleam
                        if (child.userData.isPearl) {
                            child.material.emissiveIntensity = 0.2 + openCycle * 0.4;
                        }
                    });
                });
            }
        });

        // === LAYER 5.8: Sea Turtles ===
        const turtleGroup = new THREE.Group();

        const createSeaTurtle = (shellColor, skinColor) => {
            const turtle = new THREE.Group();

            // Shell (carapace)
            const shellGeo = new THREE.SphereGeometry(12, 16, 12);
            const shellMat = new THREE.MeshStandardMaterial({
                color: shellColor,
                roughness: 0.6,
                metalness: 0.1
            });
            const shell = new THREE.Mesh(shellGeo, shellMat);
            shell.scale.set(1.3, 0.5, 1);
            shell.position.y = 2;
            turtle.add(shell);

            // Shell pattern (hexagonal plates)
            const plateCount = 13;
            const plateMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(shellColor).offsetHSL(0, 0, 0.1),
                roughness: 0.5,
                metalness: 0.15
            });

            // Center plate
            const centerPlateGeo = new THREE.CylinderGeometry(4, 4, 1, 6);
            const centerPlate = new THREE.Mesh(centerPlateGeo, plateMat);
            centerPlate.rotation.x = Math.PI / 2;
            centerPlate.position.set(0, 6, 0);
            turtle.add(centerPlate);

            // Surrounding plates
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const plateGeo = new THREE.CylinderGeometry(3.5, 3.5, 1, 6);
                const plate = new THREE.Mesh(plateGeo, plateMat);
                plate.rotation.x = Math.PI / 2;
                plate.position.set(Math.cos(angle) * 7, 5, Math.sin(angle) * 5);
                turtle.add(plate);
            }

            // Head
            const skinMat = new THREE.MeshStandardMaterial({
                color: skinColor,
                roughness: 0.7,
                metalness: 0.0
            });

            const headGeo = new THREE.SphereGeometry(4, 12, 10);
            const head = new THREE.Mesh(headGeo, skinMat);
            head.scale.set(0.8, 0.7, 1);
            head.position.set(0, 2, -14);
            turtle.add(head);

            // Snout/beak
            const snoutGeo = new THREE.ConeGeometry(2, 4, 8);
            const snout = new THREE.Mesh(snoutGeo, skinMat);
            snout.rotation.x = -Math.PI / 2;
            snout.position.set(0, 1, -18);
            turtle.add(snout);

            // Eyes
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            for (let side = -1; side <= 1; side += 2) {
                const eyeGeo = new THREE.SphereGeometry(0.8, 8, 8);
                const eye = new THREE.Mesh(eyeGeo, eyeMat);
                eye.position.set(side * 2.5, 3, -14);
                turtle.add(eye);
            }

            // Front flippers
            for (let side = -1; side <= 1; side += 2) {
                const flipper = new THREE.Group();

                const flipperGeo = new THREE.BoxGeometry(3, 1, 15);
                const flipperMesh = new THREE.Mesh(flipperGeo, skinMat);
                flipperMesh.position.z = -5;
                flipper.add(flipperMesh);

                // Flipper tip (wider)
                const tipGeo = new THREE.BoxGeometry(5, 0.5, 6);
                const tip = new THREE.Mesh(tipGeo, skinMat);
                tip.position.z = -11;
                flipper.add(tip);

                flipper.position.set(side * 12, 0, -5);
                flipper.rotation.z = side * 0.3;
                flipper.userData.side = side;
                flipper.userData.isFrontFlipper = true;
                turtle.add(flipper);
            }

            // Back flippers (smaller)
            for (let side = -1; side <= 1; side += 2) {
                const backFlipper = new THREE.Group();

                const bfGeo = new THREE.BoxGeometry(2, 0.8, 8);
                const bfMesh = new THREE.Mesh(bfGeo, skinMat);
                backFlipper.add(bfMesh);

                backFlipper.position.set(side * 10, 0, 8);
                backFlipper.rotation.y = side * 0.5;
                backFlipper.userData.side = side;
                backFlipper.userData.isBackFlipper = true;
                turtle.add(backFlipper);
            }

            // Tail
            const tailGeo = new THREE.ConeGeometry(1.5, 6, 6);
            const tail = new THREE.Mesh(tailGeo, skinMat);
            tail.rotation.x = Math.PI / 2 + 0.3;
            tail.position.set(0, 0, 12);
            turtle.add(tail);

            return turtle;
        };

        const turtleData = [
            { shell: 0x556b2f, skin: 0x8fbc8f },  // Green sea turtle
            { shell: 0x8b4513, skin: 0xdaa520 },  // Loggerhead
            { shell: 0x2f4f4f, skin: 0x708090 },  // Leatherback
            { shell: 0x6b4226, skin: 0xf4a460 }   // Hawksbill
        ];

        for (let i = 0; i < 6; i++) {
            const tData = turtleData[Math.floor(Math.random() * turtleData.length)];
            const turtle = createSeaTurtle(tData.shell, tData.skin);

            const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 420 + Math.random() * 250;
            const height = 50 + Math.random() * 150;

            turtle.position.set(
                Math.cos(angle) * dist,
                height,
                Math.sin(angle) * dist
            );
            turtle.rotation.y = angle + Math.PI / 2;
            turtle.scale.setScalar(0.8 + Math.random() * 0.4);

            turtle.userData.swimSpeed = 0.05 + Math.random() * 0.05;
            turtle.userData.orbitRadius = dist;
            turtle.userData.baseAngle = angle;
            turtle.userData.baseY = height;
            turtle.userData.bobSpeed = 0.5 + Math.random() * 0.5;
            turtle.userData.flipperSpeed = 2 + Math.random();

            turtleGroup.add(turtle);
        }
        scene.add(turtleGroup);
        manager.backdropLayers.push({
            mesh: turtleGroup,
            parallaxFactor: 0.05,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(turtle => {
                    // Swimming orbit
                    const angle = turtle.userData.baseAngle + time * turtle.userData.swimSpeed;
                    turtle.position.x = Math.cos(angle) * turtle.userData.orbitRadius;
                    turtle.position.z = Math.sin(angle) * turtle.userData.orbitRadius;
                    turtle.position.y = turtle.userData.baseY + Math.sin(time * turtle.userData.bobSpeed) * 15;

                    // Face swimming direction
                    turtle.rotation.y = angle + Math.PI / 2;
                    turtle.rotation.z = Math.sin(time * turtle.userData.bobSpeed) * 0.1;

                    // Flipper animation
                    turtle.children.forEach(child => {
                        if (child.userData.isFrontFlipper) {
                            const flipPhase = time * turtle.userData.flipperSpeed + (child.userData.side > 0 ? 0 : Math.PI);
                            child.rotation.x = Math.sin(flipPhase) * 0.4;
                            child.rotation.y = Math.sin(flipPhase) * 0.2 * child.userData.side;
                        }
                        if (child.userData.isBackFlipper) {
                            const flipPhase = time * turtle.userData.flipperSpeed * 0.5 + (child.userData.side > 0 ? 0 : Math.PI);
                            child.rotation.z = Math.sin(flipPhase) * 0.3 * child.userData.side;
                        }
                    });
                });
            }
        });

        // === LAYER 6: Fish schools ===
        const fishGroup = new THREE.Group();
        const fishColors = [0xff6347, 0xffd700, 0x00bfff, 0x9932cc, 0xff69b4, 0x00fa9a, 0xff8c00];

        // Create a single fish
        const createFish = (color, size) => {
            const fish = new THREE.Group();

            // Body
            const bodyGeo = new THREE.ConeGeometry(size, size * 3, 8);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.3,
                metalness: 0.4
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.z = -Math.PI / 2;
            fish.add(body);

            // Tail
            const tailGeo = new THREE.ConeGeometry(size * 0.8, size * 1.5, 4);
            const tail = new THREE.Mesh(tailGeo, bodyMat);
            tail.rotation.z = Math.PI / 2;
            tail.position.x = size * 1.8;
            fish.add(tail);

            // Dorsal fin
            const finGeo = new THREE.ConeGeometry(size * 0.3, size, 4);
            const fin = new THREE.Mesh(finGeo, bodyMat);
            fin.position.set(0, size * 0.8, 0);
            fin.rotation.z = 0.2;
            fish.add(fin);

            // Eye
            const eyeGeo = new THREE.SphereGeometry(size * 0.2, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(-size * 0.8, size * 0.3, size * 0.4);
            fish.add(eye);

            const pupilGeo = new THREE.SphereGeometry(size * 0.1, 8, 8);
            const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const pupil = new THREE.Mesh(pupilGeo, pupilMat);
            pupil.position.set(-size * 0.9, size * 0.3, size * 0.45);
            fish.add(pupil);

            return fish;
        };

        // Create schools of fish
        for (let school = 0; school < 6; school++) {
            const schoolGroup = new THREE.Group();
            const fishCount = 8 + Math.floor(Math.random() * 12);
            const schoolColor = fishColors[school % fishColors.length];
            const fishSize = 3 + Math.random() * 4;

            for (let i = 0; i < fishCount; i++) {
                const fish = createFish(schoolColor, fishSize);
                fish.position.set(
                    (Math.random() - 0.5) * 60,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 60
                );
                fish.userData.offset = Math.random() * Math.PI * 2;
                schoolGroup.add(fish);
            }

            const angle = (school / 6) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 450 + Math.random() * 200;
            schoolGroup.position.set(
                Math.cos(angle) * dist,
                -50 + Math.random() * 200,
                Math.sin(angle) * dist
            );
            schoolGroup.userData.orbitSpeed = 0.05 + Math.random() * 0.1;
            schoolGroup.userData.orbitRadius = dist;
            schoolGroup.userData.baseAngle = angle;
            schoolGroup.userData.baseY = schoolGroup.position.y;
            fishGroup.add(schoolGroup);
        }
        scene.add(fishGroup);
        manager.backdropLayers.push({
            mesh: fishGroup,
            parallaxFactor: 0.06,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(school => {
                    // School orbits around
                    const angle = school.userData.baseAngle + time * school.userData.orbitSpeed;
                    school.position.x = Math.cos(angle) * school.userData.orbitRadius;
                    school.position.z = Math.sin(angle) * school.userData.orbitRadius;
                    school.position.y = school.userData.baseY + Math.sin(time * 0.5) * 20;
                    school.rotation.y = -angle + Math.PI / 2;

                    // Individual fish wiggle
                    school.children.forEach(fish => {
                        fish.rotation.y = Math.sin(time * 8 + fish.userData.offset) * 0.2;
                        fish.position.y += Math.sin(time * 3 + fish.userData.offset) * 0.05;
                    });
                });
            }
        });

        // === LAYER 7: Jellyfish ===
        const jellyGroup = new THREE.Group();

        const createJellyfish = (color, size) => {
            const jelly = new THREE.Group();

            // Bell
            const bellGeo = new THREE.SphereGeometry(size, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const bellMat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
            });
            const bell = new THREE.Mesh(bellGeo, bellMat);
            jelly.add(bell);

            // Inner bell (bioluminescence)
            const innerBellGeo = new THREE.SphereGeometry(size * 0.7, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const innerBellMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending
            });
            const innerBell = new THREE.Mesh(innerBellGeo, innerBellMat);
            innerBell.position.y = -size * 0.1;
            jelly.add(innerBell);

            // Tentacles
            const tentacleCount = 8;
            for (let i = 0; i < tentacleCount; i++) {
                const tentacleAngle = (i / tentacleCount) * Math.PI * 2;
                const tentacleLength = size * 2 + Math.random() * size;

                const tentacleGeo = new THREE.CylinderGeometry(0.5, 0.2, tentacleLength, 4);
                const tentacleMat = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.5
                });
                const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
                tentacle.position.set(
                    Math.cos(tentacleAngle) * size * 0.6,
                    -tentacleLength / 2,
                    Math.sin(tentacleAngle) * size * 0.6
                );
                tentacle.userData.baseAngle = tentacleAngle;
                tentacle.userData.length = tentacleLength;
                jelly.add(tentacle);
            }

            return jelly;
        };

        const jellyColors = [0xff69b4, 0x9370db, 0x00ced1, 0x7fffd4, 0xdda0dd];

        for (let i = 0; i < 15; i++) {
            const jelly = createJellyfish(
                jellyColors[i % jellyColors.length],
                10 + Math.random() * 15
            );
            const angle = Math.random() * Math.PI * 2;
            const dist = 420 + Math.random() * 350;
            jelly.position.set(
                Math.cos(angle) * dist,
                50 + Math.random() * 200,
                Math.sin(angle) * dist
            );
            jelly.userData.floatSpeed = 0.3 + Math.random() * 0.5;
            jelly.userData.floatOffset = Math.random() * Math.PI * 2;
            jelly.userData.baseY = jelly.position.y;
            jelly.userData.pulseSpeed = 1 + Math.random();
            jellyGroup.add(jelly);
        }
        scene.add(jellyGroup);
        manager.backdropLayers.push({
            mesh: jellyGroup,
            parallaxFactor: 0.07,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.children.forEach(jelly => {
                    // Float up and down
                    jelly.position.y = jelly.userData.baseY + Math.sin(time * jelly.userData.floatSpeed + jelly.userData.floatOffset) * 30;

                    // Pulsing bell animation
                    const pulse = Math.sin(time * jelly.userData.pulseSpeed) * 0.1 + 1;
                    jelly.children[0].scale.set(pulse, 0.8 + (1 - pulse) * 0.4, pulse);

                    // Tentacle sway
                    jelly.children.forEach((child, idx) => {
                        if (idx > 1 && child.userData.baseAngle !== undefined) {
                            child.rotation.x = Math.sin(time * 2 + child.userData.baseAngle) * 0.3;
                            child.rotation.z = Math.cos(time * 2 + child.userData.baseAngle) * 0.3;
                        }
                    });
                });
            }
        });

        // === LAYER 8: Large sea creatures (whale/manta silhouettes) ===
        const createWhale = () => {
            const whale = new THREE.Group();

            // Body
            const bodyGeo = new THREE.CapsuleGeometry(30, 100, 16, 32);
            const bodyMat = new THREE.MeshBasicMaterial({
                color: 0x1a3a5c,
                transparent: true,
                opacity: 0.6
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.z = Math.PI / 2;
            whale.add(body);

            // Tail flukes
            const flukeGeo = new THREE.CircleGeometry(25, 8);
            const fluke1 = new THREE.Mesh(flukeGeo, bodyMat);
            fluke1.position.set(70, 0, 0);
            fluke1.rotation.y = Math.PI / 4;
            fluke1.rotation.x = Math.PI / 2;
            whale.add(fluke1);

            const fluke2 = new THREE.Mesh(flukeGeo, bodyMat);
            fluke2.position.set(70, 0, 0);
            fluke2.rotation.y = -Math.PI / 4;
            fluke2.rotation.x = Math.PI / 2;
            whale.add(fluke2);

            return whale;
        };

        const whale = createWhale();
        whale.position.set(-600, 200, -800);
        whale.rotation.y = 0.5;
        whale.userData.swimSpeed = 0.02;
        whale.userData.basePos = whale.position.clone();
        scene.add(whale);
        manager.backdropLayers.push({
            mesh: whale,
            parallaxFactor: 0.02,
            rotationSpeed: 0,
            update: function (mesh, time) {
                mesh.position.x = mesh.userData.basePos.x + Math.sin(time * mesh.userData.swimSpeed) * 100;
                mesh.position.y = mesh.userData.basePos.y + Math.sin(time * 0.1) * 20;
                mesh.rotation.z = Math.sin(time * 0.3) * 0.05;
            }
        });

        // === LAYER 9: Floating particles (plankton/debris) ===
        const particleCount = 500;
        const particleGeo = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleSpeeds = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 420 + Math.random() * 350;
            particlePositions[i * 3] = Math.cos(angle) * dist;
            particlePositions[i * 3 + 1] = -150 + Math.random() * 500;
            particlePositions[i * 3 + 2] = Math.sin(angle) * dist;
            particleSpeeds[i] = 0.1 + Math.random() * 0.3;
        }

        particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

        const particleMat = new THREE.PointsMaterial({
            size: 3,
            color: 0xaaddee,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        const particles = new THREE.Points(particleGeo, particleMat);
        particles.userData.speeds = particleSpeeds;
        scene.add(particles);
        manager.backdropLayers.push({
            mesh: particles,
            parallaxFactor: 0.1,
            rotationSpeed: 0,
            update: function (mesh, time) {
                const positions = mesh.geometry.attributes.position.array;
                const speeds = mesh.userData.speeds;
                for (let i = 0; i < positions.length / 3; i++) {
                    positions[i * 3 + 1] += speeds[i] * 0.2;
                    positions[i * 3] += Math.sin(time + i) * 0.05;
                    if (positions[i * 3 + 1] > 400) {
                        positions[i * 3 + 1] = -150;
                    }
                }
                mesh.geometry.attributes.position.needsUpdate = true;
            }
        });

        // === Underwater lighting ===
        const waterLight = new THREE.DirectionalLight(0x4488aa, 0.5);
        waterLight.position.set(0, 500, 0);
        scene.add(waterLight);

        const ambientWater = new THREE.AmbientLight(0x003355, 0.3);
        scene.add(ambientWater);

        // Caustic light on the floor
        const causticLight = new THREE.SpotLight(0x66aacc, 0.3, 500, Math.PI / 3);
        causticLight.position.set(0, 300, 0);
        causticLight.target.position.set(0, -150, 0);
        scene.add(causticLight);
        scene.add(causticLight.target);
    }
});

// ============================================================
// HIGH CONTRAST THEME - Earth tones without green for colorblind accessibility
// Uses browns, tans, rusts, and creams
// ============================================================
FastTrackThemes.register('highcontrast', {
    name: 'Clean (Accessible)',
    description: 'Minimal backdrop — colorblind-safe, no red/green, high contrast',

    create: function (scene, THREE, manager) {
        // ── Neutral gradient sky dome (warm gray → slate) ──
        const skyGeo = new THREE.SphereGeometry(2000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x4a4a5a) },
                midColor: { value: new THREE.Color(0x787880) },
                bottomColor: { value: new THREE.Color(0xb0aaa0) }
            },
            vertexShader: `
                varying vec3 vWP;
                void main() {
                    vWP = (modelMatrix * vec4(position,1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
                }`,
            fragmentShader: `
                uniform vec3 topColor, midColor, bottomColor;
                varying vec3 vWP;
                void main() {
                    float h = normalize(vWP).y;
                    vec3 c = h > 0.0
                        ? mix(midColor, topColor, h)
                        : mix(midColor, bottomColor, -h);
                    gl_FragColor = vec4(c, 1.0);
                }`
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        scene.add(sky);
        manager.backdropLayers.push({ mesh: sky, parallaxFactor: 0, rotationSpeed: 0 });

        // ── Clean matte floor ──
        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(1200, 64),
            new THREE.MeshStandardMaterial({ color: 0x9a9590, roughness: 0.9, metalness: 0 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -3;
        floor.receiveShadow = true;
        scene.add(floor);
        manager.backdropLayers.push({ mesh: floor, parallaxFactor: 0, rotationSpeed: 0 });

        // ── Subtle radial ring at board edge for visual reference ──
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(310, 2, 8, 80), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -1;
        scene.add(ring);
        manager.backdropLayers.push({ mesh: ring, parallaxFactor: 0, rotationSpeed: 0 });

        // Outer reference ring
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(500, 1.5, 8, 80), ringMat);
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = -2;
        scene.add(ring2);
        manager.backdropLayers.push({ mesh: ring2, parallaxFactor: 0, rotationSpeed: 0 });

        // ── Strong, even, neutral lighting ──
        // Key light — bright white, overhead
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(0, 600, 200);
        key.castShadow = true;
        scene.add(key);
        manager.backdropLayers.push({ mesh: key, parallaxFactor: 0, rotationSpeed: 0 });

        // Fill — soft from opposite side
        const fill = new THREE.DirectionalLight(0xf0f0f0, 0.6);
        fill.position.set(-200, 400, -300);
        scene.add(fill);
        manager.backdropLayers.push({ mesh: fill, parallaxFactor: 0, rotationSpeed: 0 });

        // Hemisphere — neutral warm/cool split for depth
        const hemi = new THREE.HemisphereLight(0xeeeeee, 0x888888, 0.5);
        scene.add(hemi);
        manager.backdropLayers.push({ mesh: hemi, parallaxFactor: 0, rotationSpeed: 0 });
    },

    onGameEvent: function (eventType, data, manager) {
        // Minimal — no distracting effects
    }
});

// ============================================================
// FIBONACCI SPIRAL THEME
// All visuals derived from the golden ratio (φ = 1.618...)
// and the Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13, 21
// ============================================================
FastTrackThemes.register('fibonacci', {
    name: 'Golden Spiral',
    description: 'Mathematical beauty - golden spirals, Fibonacci geometry',

    // Golden ratio constant
    PHI: 1.618033988749895,

    create: function (scene, THREE, manager) {
        const PHI = this.PHI;

        // Warm amber/gold background
        scene.background = new THREE.Color(0x0d0906);

        // === LAYER 0: Gradient sky sphere ===
        const skyGeo = new THREE.SphereGeometry(1500, 64, 64);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x1a0f05) },
                midColor: { value: new THREE.Color(0x2d1a0a) },
                bottomColor: { value: new THREE.Color(0x0d0604) },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 midColor;
                uniform vec3 bottomColor;
                uniform float time;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    // Golden ratio pulse
                    float pulse = sin(time * 0.618) * 0.05 + 0.95;
                    vec3 color;
                    if (h > 0.0) {
                        color = mix(midColor, topColor, h) * pulse;
                    } else {
                        color = mix(midColor, bottomColor, -h) * pulse;
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        scene.add(sky);
        manager.backdropLayers.push({ mesh: sky, parallaxFactor: 0, rotationSpeed: 0.00003 });

        // === LAYER 1: Golden spiral particle system ===
        const spiralCount = 1597; // Fibonacci number!
        const spiralGeo = new THREE.BufferGeometry();
        const spiralPositions = new Float32Array(spiralCount * 3);
        const spiralColors = new Float32Array(spiralCount * 3);

        for (let i = 0; i < spiralCount; i++) {
            // Golden angle: 137.5 degrees (related to golden ratio)
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399 radians
            const angle = i * goldenAngle;
            const radius = Math.sqrt(i) * 15;
            const height = (i / spiralCount - 0.5) * 800;

            spiralPositions[i * 3] = Math.cos(angle) * radius;
            spiralPositions[i * 3 + 1] = height;
            spiralPositions[i * 3 + 2] = Math.sin(angle) * radius;

            // Gold to amber gradient
            const t = i / spiralCount;
            spiralColors[i * 3] = 1.0;
            spiralColors[i * 3 + 1] = 0.7 + t * 0.15;
            spiralColors[i * 3 + 2] = 0.2 + t * 0.3;
        }

        spiralGeo.setAttribute('position', new THREE.BufferAttribute(spiralPositions, 3));
        spiralGeo.setAttribute('color', new THREE.BufferAttribute(spiralColors, 3));

        const spiralMat = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        const spiralPoints = new THREE.Points(spiralGeo, spiralMat);
        spiralPoints.position.set(0, 0, -700);
        scene.add(spiralPoints);
        manager.backdropLayers.push({
            mesh: spiralPoints,
            parallaxFactor: 0.1,
            rotationSpeed: 0.0003,
            userData: { type: 'spiral' }
        });

        // === LAYER 2: Fibonacci rectangles (golden ratio subdivisions) ===
        const fibSequence = [1, 1, 2, 3, 5, 8, 13, 21];
        const rectGroup = new THREE.Group();
        let x = 0, y = 0;
        let direction = 0; // 0=right, 1=up, 2=left, 3=down

        fibSequence.forEach((size, idx) => {
            const scaledSize = size * 8;
            const rectGeo = new THREE.PlaneGeometry(scaledSize, scaledSize);
            const rectMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(0.1 + idx * 0.02, 0.6, 0.3 + idx * 0.05),
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                wireframe: idx % 2 === 0
            });
            const rect = new THREE.Mesh(rectGeo, rectMat);

            // Position based on golden rectangle subdivision
            rect.position.set(x + scaledSize / 2, y + scaledSize / 2, -500 + idx * 10);
            rectGroup.add(rect);

            // Next position follows golden rectangle pattern
            const prevSize = idx > 0 ? fibSequence[idx - 1] * 8 : 0;
            switch (direction) {
                case 0: x += scaledSize; break;
                case 1: y += scaledSize; break;
                case 2: x -= prevSize + scaledSize; break;
                case 3: y -= prevSize + scaledSize; break;
            }
            direction = (direction + 1) % 4;
        });

        rectGroup.position.set(-100, -50, 0);
        rectGroup.rotation.y = Math.PI * 0.1;
        scene.add(rectGroup);
        manager.backdropLayers.push({ mesh: rectGroup, parallaxFactor: 0.05, rotationSpeed: 0.0001 });

        // === LAYER 3: Nautilus shell curve ===
        const shellCurvePoints = [];
        const shellSegments = 200;
        for (let i = 0; i < shellSegments; i++) {
            const t = (i / shellSegments) * 4 * Math.PI;
            const r = Math.pow(PHI, t / (Math.PI / 2)) * 2;
            shellCurvePoints.push(new THREE.Vector3(
                Math.cos(t) * r,
                Math.sin(t) * r,
                i * 0.5
            ));
        }

        const shellCurve = new THREE.CatmullRomCurve3(shellCurvePoints);
        const shellTubeGeo = new THREE.TubeGeometry(shellCurve, 100, 2, 8, false);
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0xdaa520,
            transparent: true,
            opacity: 0.5,
            wireframe: true
        });
        const shellMesh = new THREE.Mesh(shellTubeGeo, shellMat);
        shellMesh.position.set(600, 150, -600);
        shellMesh.scale.setScalar(3);
        scene.add(shellMesh);
        manager.backdropLayers.push({ mesh: shellMesh, parallaxFactor: 0.08, rotationSpeed: 0.0002 });

        // === LAYER 4: Floating golden spheres at Fibonacci positions ===
        const sphereGroup = new THREE.Group();
        fibSequence.forEach((fib, idx) => {
            const sphereGeo = new THREE.IcosahedronGeometry(fib * 3, 1);
            const sphereMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(0.12, 0.8, 0.4 + idx * 0.05),
                transparent: true,
                opacity: 0.4,
                wireframe: true
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);

            // Position at golden angle intervals — outside the board (min radius 450)
            const goldenAngle = 2.399;
            const angle = idx * goldenAngle;
            const dist = 450 + fib * 25;
            sphere.position.set(
                Math.cos(angle) * dist,
                Math.sin(angle * PHI) * 100,
                Math.sin(angle) * dist
            );
            sphere.userData = { baseY: sphere.position.y, phase: idx * 0.5 };
            sphereGroup.add(sphere);
        });
        scene.add(sphereGroup);
        manager.backdropLayers.push({
            mesh: sphereGroup,
            parallaxFactor: 0.06,
            rotationSpeed: 0,
            userData: { type: 'spheres' }
        });

        // === LAYER 5: Sunflower seed pattern floor ===
        const seedCount = 377; // Fibonacci number
        const seedGroup = new THREE.Group();
        for (let i = 0; i < seedCount; i++) {
            const goldenAngle = Math.PI * (3 - Math.sqrt(5));
            const angle = i * goldenAngle;
            const radius = Math.sqrt(i) * 8;

            const seedGeo = new THREE.CircleGeometry(3 + Math.sqrt(i) * 0.3, 6);
            const seedMat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(0.08 + (i / seedCount) * 0.08, 0.7, 0.25),
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
            });
            const seed = new THREE.Mesh(seedGeo, seedMat);
            seed.position.set(
                Math.cos(angle) * radius,
                -180,
                Math.sin(angle) * radius
            );
            seed.rotation.x = -Math.PI / 2;
            seedGroup.add(seed);
        }
        scene.add(seedGroup);
        manager.backdropLayers.push({ mesh: seedGroup, parallaxFactor: 0, rotationSpeed: 0.00005 });

        // === LIGHTING: Golden warm tones ===
        const mainLight = new THREE.DirectionalLight(0xffd700, 1.2);
        mainLight.position.set(200, 400, 200);
        scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0xf4a460, 0.6);
        fillLight.position.set(-200, 200, -200);
        scene.add(fillLight);

        const ambient = new THREE.AmbientLight(0xffd700, 0.3);
        scene.add(ambient);

        console.log('[Fibonacci] Golden Spiral theme created - φ = ' + PHI.toFixed(10));
    },

    update: function (scene, camera, deltaTime, manager) {
        const time = performance.now() * 0.001;
        const PHI = this.PHI;

        manager.backdropLayers.forEach(layer => {
            if (layer.mesh) {
                // Rotation based on golden ratio
                if (layer.rotationSpeed) {
                    layer.mesh.rotation.y += layer.rotationSpeed * PHI;
                }

                // Spiral particles pulse
                if (layer.userData && layer.userData.type === 'spiral') {
                    layer.mesh.scale.setScalar(1 + Math.sin(time * 0.618) * 0.05);
                }

                // Floating spheres bob at golden ratio intervals
                if (layer.userData && layer.userData.type === 'spheres') {
                    layer.mesh.children.forEach((sphere, idx) => {
                        const phase = sphere.userData.phase || 0;
                        sphere.position.y = sphere.userData.baseY +
                            Math.sin(time * PHI * 0.5 + phase) * 20;
                        sphere.rotation.y = time * 0.1 * (idx % 2 === 0 ? 1 : -1);
                    });
                }
            }
        });
    },

    onFastTrack: function (scene, manager, data) {
        console.log('[Fibonacci] Fast track - golden flash');
        // Pulse all golden elements
        manager.backdropLayers.forEach(layer => {
            if (layer.mesh && layer.mesh.material) {
                const mat = layer.mesh.material;
                if (mat.opacity !== undefined) {
                    const origOpacity = mat.opacity;
                    mat.opacity = Math.min(1, origOpacity * 1.5);
                    setTimeout(() => { mat.opacity = origOpacity; }, 300);
                }
            }
        });
    },

    onBullseye: function (scene, manager, data) {
        console.log('[Fibonacci] Bullseye - spiral intensify');
    },

    onSendHome: function (scene, manager, data) {
        console.log('[Fibonacci] Send home');
    },

    onWinner: function (scene, manager, data) {
        console.log('[Fibonacci] Winner - golden celebration!');
        // Flash everything gold
        manager.backdropLayers.forEach(layer => {
            if (layer.mesh && layer.mesh.material && !Array.isArray(layer.mesh.material)) {
                const origColor = layer.mesh.material.color.clone();
                layer.mesh.material.color.setHex(0xffd700);
                setTimeout(() => { layer.mesh.material.color.copy(origColor); }, 1000);
            }
        });
    }
});

// ============================================================
// VR IMMERSIVE THEME - Full 360° VR Experience
// ============================================================
FastTrackThemes.register('vr_immersive', {
    name: 'VR Immersive',
    description: '360° VR experience with dynamic cosmic scenes',
    vrTheme: null,

    create: function (scene, THREE, manager) {
        console.log('[VR Immersive] Creating VR theme...');

        // Load VR theme module
        if (typeof VRImmersiveTheme !== 'undefined') {
            this.vrTheme = Object.create(VRImmersiveTheme);
            this.vrTheme.init(scene, window.camera, window.renderer);
        } else {
            console.error('[VR Immersive] VRImmersiveTheme not loaded!');
        }
    },

    update: function (scene, camera, deltaTime, manager) {
        if (this.vrTheme && this.vrTheme.update) {
            this.vrTheme.update(deltaTime);
        }
    },

    onFastTrack: function (scene, manager, data) {
        console.log('[VR Immersive] Fast track event');
        // Could trigger scene transition or effect
    },

    onBullseye: function (scene, manager, data) {
        console.log('[VR Immersive] Bullseye event');
    },

    onSendHome: function (scene, manager, data) {
        console.log('[VR Immersive] Send home event');
    },

    onWinner: function (scene, manager, data) {
        console.log('[VR Immersive] Winner - cosmic celebration!');
        // Could trigger special scene or effect
    },

    dispose: function () {
        if (this.vrTheme && this.vrTheme.dispose) {
            this.vrTheme.dispose();
        }
    }
});

// Export for use
if (typeof window !== 'undefined') {
    window.FastTrackThemes = FastTrackThemes;
}
