/**
 * Starfighter 3D Renderer
 * Three.js, First-Person Cockpit, Entity Meshes
 */

const SF3D = (function () {
    let scene, camera, renderer;
    const entityMeshes = new Map();
    let cockpitGroup;
    let cockpitModel; // GLB cockpit model
    let cockpitLeftArm, cockpitRightArm; // separated arm meshes for animation
    let leftScreenMesh, rightScreenMesh; // 3D screen planes
    let telemetryCanvas, telemetryCtx, telemetryTexture;
    let radarTexture; // CanvasTexture from radar-canvas
    let cockpitLoaded = false;
    let cockpitVisible = false; // track desired visibility
    let targetLockMesh;
    let launchBayGroup;
    let cameraShakeIntensity = 0;

    // ── Shared starfield vertex data (world-space positions, shared with radar) ──
    const STAR_COUNT = 4000;
    const STAR_RADIUS = 9000;
    let starfieldVerts = null; // Float32Array — filled once, read by radar

    // ── Particle pool (reuse sprites instead of allocating) ──
    const MAX_PARTICLES = 200;
    const particlePool = [];
    let activeParticles = 0;
    let particlePoints = null;
    let particlePositions, particleColors, particleSizes, particleAges, particleLifetimes;
    let particleVelocities; // Float32Array for vel xyz

    function _initParticleSystem() {
        particlePositions = new Float32Array(MAX_PARTICLES * 3);
        particleColors = new Float32Array(MAX_PARTICLES * 3);
        particleSizes = new Float32Array(MAX_PARTICLES);
        particleAges = new Float32Array(MAX_PARTICLES);
        particleLifetimes = new Float32Array(MAX_PARTICLES);
        particleVelocities = new Float32Array(MAX_PARTICLES * 3);
        particleSizes.fill(0);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
        const mat = new THREE.PointsMaterial({
            size: 4, vertexColors: true, transparent: true,
            opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
            sizeAttenuation: true
        });
        particlePoints = new THREE.Points(geo, mat);
        scene.add(particlePoints);
        activeParticles = 0;
    }

    function _emitParticle(px, py, pz, vx, vy, vz, r, g, b, lifetime) {
        if (activeParticles >= MAX_PARTICLES) return;
        const i = activeParticles++;
        const i3 = i * 3;
        particlePositions[i3] = px;
        particlePositions[i3 + 1] = py;
        particlePositions[i3 + 2] = pz;
        particleVelocities[i3] = vx;
        particleVelocities[i3 + 1] = vy;
        particleVelocities[i3 + 2] = vz;
        particleColors[i3] = r;
        particleColors[i3 + 1] = g;
        particleColors[i3 + 2] = b;
        particleSizes[i] = 4;
        particleAges[i] = 0;
        particleLifetimes[i] = lifetime;
    }

    function _updateParticles(dt) {
        if (!particlePoints) return;
        let write = 0;
        for (let read = 0; read < activeParticles; read++) {
            particleAges[read] += dt;
            if (particleAges[read] >= particleLifetimes[read]) continue;
            // Copy surviving particle to write position (compact)
            if (write !== read) {
                const r3 = read * 3, w3 = write * 3;
                particlePositions[w3] = particlePositions[r3];
                particlePositions[w3 + 1] = particlePositions[r3 + 1];
                particlePositions[w3 + 2] = particlePositions[r3 + 2];
                particleVelocities[w3] = particleVelocities[r3];
                particleVelocities[w3 + 1] = particleVelocities[r3 + 1];
                particleVelocities[w3 + 2] = particleVelocities[r3 + 2];
                particleColors[w3] = particleColors[r3];
                particleColors[w3 + 1] = particleColors[r3 + 1];
                particleColors[w3 + 2] = particleColors[r3 + 2];
                particleSizes[write] = particleSizes[read];
                particleAges[write] = particleAges[read];
                particleLifetimes[write] = particleLifetimes[read];
            }
            // Advance position
            const w3 = write * 3;
            particlePositions[w3] += particleVelocities[w3] * dt;
            particlePositions[w3 + 1] += particleVelocities[w3 + 1] * dt;
            particlePositions[w3 + 2] += particleVelocities[w3 + 2] * dt;
            // Drag
            particleVelocities[w3] *= 0.98;
            particleVelocities[w3 + 1] *= 0.98;
            particleVelocities[w3 + 2] *= 0.98;
            // Fade size
            const t = particleAges[write] / particleLifetimes[write];
            particleSizes[write] = 4 * (1 - t);
            write++;
        }
        // Zero out dead slots
        for (let i = write; i < activeParticles; i++) particleSizes[i] = 0;
        activeParticles = write;
        particlePoints.geometry.attributes.position.needsUpdate = true;
        particlePoints.geometry.attributes.color.needsUpdate = true;
        particlePoints.geometry.attributes.size.needsUpdate = true;
    }

    // ── Shared materials (created once, reused across all entities) ──
    let sharedMats = null;

    let launchPhaseActive = false;

    function setLaunchPhase(active) {
        launchPhaseActive = active;
    }

    function init(state) {
        const container = document.getElementById('game-canvas');

        // Scene setup
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000000, 0.0001);

        // Camera setup
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);

        // Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        container.appendChild(renderer.domElement);

        // Lighting — Realistic Sun
        const ambient = new THREE.AmbientLight(0x111122, 0.3);
        scene.add(ambient);

        const sunLight = new THREE.DirectionalLight(0xfff5e0, 3.0);
        sunLight.position.set(5000, 3000, 2000);
        scene.add(sunLight);

        // Subtle fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0x334466, 0.4);
        fillLight.position.set(-3000, -1000, -2000);
        scene.add(fillLight);

        // The Sun — a visible glowing sphere in the distance
        const sunGroup = new THREE.Group();
        const sunCoreGeo = new THREE.SphereGeometry(400, 64, 64);
        const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
        const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);
        sunGroup.add(sunCore);

        // Corona layers
        for (let i = 1; i <= 4; i++) {
            const coronaGeo = new THREE.SphereGeometry(400 + i * 80, 32, 32);
            const coronaMat = new THREE.MeshBasicMaterial({
                color: i < 3 ? 0xffdd44 : 0xff6600,
                transparent: true,
                opacity: 0.15 / i,
                blending: THREE.AdditiveBlending,
                side: THREE.BackSide
            });
            const corona = new THREE.Mesh(coronaGeo, coronaMat);
            sunGroup.add(corona);
        }

        // Sun lens flare point light
        const sunPLight = new THREE.PointLight(0xfff5e0, 3, 15000);
        sunGroup.add(sunPLight);

        sunGroup.position.set(5000, 3000, 2000);
        scene.add(sunGroup);

        // Particle system
        _initParticleSystem();

        // Starfield background (attached to camera so it always surrounds the player)
        createStarfield();

        // Textured cockpit: GLB 3D model attached to camera
        createCockpit();

        // Cockpit interior lighting (PBR materials need light)
        const cockpitLight = new THREE.PointLight(0xccddff, 1.2, 5);
        cockpitLight.position.set(0, 0.3, 0); // above pilot's head
        camera.add(cockpitLight);
        const cockpitAmbient = new THREE.HemisphereLight(0x4466aa, 0x112233, 0.6);
        camera.add(cockpitAmbient);

        // Launch Bay
        createLaunchBay();

        // Target Lock Reticle
        const reticleGeo = new THREE.BoxGeometry(20, 20, 20);
        const reticleMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        targetLockMesh = new THREE.Mesh(reticleGeo, reticleMat);
        targetLockMesh.visible = false;
        scene.add(targetLockMesh);

        window.addEventListener('resize', onWindowResize, false);
    }

    function createLaunchBay() {
        launchBayGroup = new THREE.Group();

        const tubeLength = 400;
        const halfW = 20;   // half-width (total width 40)
        const halfH = 12;   // half-height (total height 24)
        const ribSpacing = 40;
        const ribDepth = 1.5;

        // ── Shared materials ──
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e, metalness: 0.8, roughness: 0.4, transparent: true
        });
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0f0f1a, metalness: 0.9, roughness: 0.3, transparent: true
        });
        const ribMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a3e, metalness: 0.9, roughness: 0.2, transparent: true,
            emissive: new THREE.Color(0x111122), emissiveIntensity: 0.3
        });
        const stripCyanMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true
        });
        const stripGreenMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88, transparent: true
        });
        const warningMat = new THREE.MeshBasicMaterial({
            color: 0xff4400, transparent: true
        });

        // ── Floor ──
        const floorGeo = new THREE.BoxGeometry(halfW * 2, 0.5, tubeLength);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(0, -halfH, -tubeLength / 2);
        launchBayGroup.add(floor);

        // ── Ceiling ──
        const ceilGeo = new THREE.BoxGeometry(halfW * 2, 0.5, tubeLength);
        const ceil = new THREE.Mesh(ceilGeo, wallMat);
        ceil.position.set(0, halfH, -tubeLength / 2);
        launchBayGroup.add(ceil);

        // ── Left wall ──
        const wallGeo = new THREE.BoxGeometry(0.5, halfH * 2, tubeLength);
        const leftWall = new THREE.Mesh(wallGeo, wallMat);
        leftWall.position.set(-halfW, 0, -tubeLength / 2);
        launchBayGroup.add(leftWall);

        // ── Right wall ──
        const rightWall = new THREE.Mesh(wallGeo, wallMat);
        rightWall.position.set(halfW, 0, -tubeLength / 2);
        launchBayGroup.add(rightWall);

        // ── Structural ribs (cross-beams) ──
        const ribGeoH = new THREE.BoxGeometry(halfW * 2 + 2, ribDepth, ribDepth);
        const ribGeoV = new THREE.BoxGeometry(ribDepth, halfH * 2 + 2, ribDepth);
        for (let z = 0; z > -tubeLength; z -= ribSpacing) {
            // Top & bottom horizontal ribs
            const ribTop = new THREE.Mesh(ribGeoH, ribMat);
            ribTop.position.set(0, halfH + 0.5, z);
            launchBayGroup.add(ribTop);

            const ribBot = new THREE.Mesh(ribGeoH, ribMat);
            ribBot.position.set(0, -halfH - 0.5, z);
            launchBayGroup.add(ribBot);

            // Left & right vertical ribs
            const ribL = new THREE.Mesh(ribGeoV, ribMat);
            ribL.position.set(-halfW - 0.5, 0, z);
            launchBayGroup.add(ribL);

            const ribR = new THREE.Mesh(ribGeoV, ribMat);
            ribR.position.set(halfW + 0.5, 0, z);
            launchBayGroup.add(ribR);
        }

        // ── Light strips along ceiling edges (cyan left, green right) ──
        const stripGeo = new THREE.BoxGeometry(1.0, 0.3, tubeLength);
        const stripL = new THREE.Mesh(stripGeo, stripCyanMat);
        stripL.position.set(-halfW + 2, halfH - 0.5, -tubeLength / 2);
        launchBayGroup.add(stripL);

        const stripR = new THREE.Mesh(stripGeo, stripGreenMat);
        stripR.position.set(halfW - 2, halfH - 0.5, -tubeLength / 2);
        launchBayGroup.add(stripR);

        // ── Floor edge warning strips ──
        const warnGeo = new THREE.BoxGeometry(0.8, 0.15, tubeLength);
        const warnL = new THREE.Mesh(warnGeo, warningMat);
        warnL.position.set(-halfW + 1, -halfH + 0.2, -tubeLength / 2);
        launchBayGroup.add(warnL);

        const warnR = new THREE.Mesh(warnGeo, warningMat);
        warnR.position.set(halfW - 1, -halfH + 0.2, -tubeLength / 2);
        launchBayGroup.add(warnR);

        // ── Floor center guide line ──
        const guideGeo = new THREE.BoxGeometry(0.5, 0.1, tubeLength);
        const guideMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true });
        const guide = new THREE.Mesh(guideGeo, guideMat);
        guide.position.set(0, -halfH + 0.15, -tubeLength / 2);
        launchBayGroup.add(guide);

        // ── Point lights for illumination every 80 units ──
        for (let z = 0; z > -tubeLength; z -= 80) {
            const ceilingLight = new THREE.PointLight(0x4488ff, 1.5, 50);
            ceilingLight.position.set(0, halfH - 1, z);
            launchBayGroup.add(ceilingLight);
        }

        // ── End-of-tunnel exit glow ──
        const exitLight = new THREE.PointLight(0xffffff, 3, 80);
        exitLight.position.set(0, 0, -tubeLength + 10);
        launchBayGroup.add(exitLight);

        // Position launch bay at player start
        launchBayGroup.position.set(0, -32, 50);
        scene.add(launchBayGroup);
    }

    function removeLaunchBay() {
        // Just hide the bay instead of removing it, so it can be shown again for next wave
        if (launchBayGroup) {
            launchBayGroup.visible = false;
        }
    }

    function showLaunchBay() {
        // Show the launch bay for next launch
        if (launchBayGroup) {
            launchBayGroup.visible = true;
        }
    }

    function hideHangarBay() {
        // Find and hide the baseship hangar bay during launch
        if (!scene) return;
        scene.traverse((obj) => {
            if (obj.name === 'baseship-hangar' || obj.name === 'baseship-hangar-glow') {
                obj.visible = false;
            }
        });
    }

    function showHangarBay() {
        // Show the baseship hangar bay after launch
        if (!scene) return;
        scene.traverse((obj) => {
            if (obj.name === 'baseship-hangar' || obj.name === 'baseship-hangar-glow') {
                obj.visible = true;
            }
        });
    }

    function hideBaseship() {
        // Find and hide the baseship mesh
        if (!scene) return;
        scene.traverse((obj) => {
            if (obj.userData && obj.userData.isBaseship) {
                obj.visible = false;
            }
        });
    }

    function showBaseship() {
        // Show the baseship mesh
        if (!scene) return;
        scene.traverse((obj) => {
            if (obj.userData && obj.userData.isBaseship) {
                obj.visible = true;
            }
        });
    }

    function updateLaunchCinematic(progress) {
        if (!launchBayGroup) return;

        // Stage 1: Countdown phase (0 - 0.625) - Rattling bay with engine spooling
        if (progress < 0.625) {
            const countdownPhase = progress / 0.625;
            // Metallic rattle - subtle rotation oscillation
            const rattle = Math.sin(countdownPhase * 50) * 0.02;
            launchBayGroup.rotation.z = rattle;
            // Light strips pulse brighter during countdown
            launchBayGroup.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = 1.0;
                    if (child.material.emissive) {
                        child.material.emissiveIntensity = 0.3 + countdownPhase * 0.5;
                    }
                }
            });
            // Camera shaking during countdown
            cameraShakeIntensity = countdownPhase * 0.5;
            // Reset bay position
            launchBayGroup.position.set(0, -32, 50);
            launchBayGroup.visible = true;
        }
        // Stage 2: Launch acceleration (0.625 - 1.0) - Bay streaks past into open space
        else {
            const launchPhase = (progress - 0.625) / 0.375;
            // Move bay backward away from camera
            launchBayGroup.position.z = 50 + launchPhase * 1000;
            // Fade out opacity gradually
            const opacity = Math.max(0, 1.0 - launchPhase * 2);
            launchBayGroup.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = opacity;
                    if (child.material.emissive) {
                        child.material.emissiveIntensity = 0.8 + launchPhase * 1.2;
                    }
                }
            });
            // Intense camera shake during acceleration
            cameraShakeIntensity = 0.5 + launchPhase * 1.5;
        }
    }


    function createStarfield() {
        // Stars live in WORLD SPACE — they move relative to the player as you fly.
        // The same vertex array is shared with the radar sphere for a mirrored miniature.
        starfieldVerts = new Float32Array(STAR_COUNT * 3);
        for (let i = 0; i < STAR_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const r = STAR_RADIUS + Math.random() * 1000;
            const i3 = i * 3;
            starfieldVerts[i3] = r * Math.sin(phi) * Math.cos(theta);
            starfieldVerts[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            starfieldVerts[i3 + 2] = r * Math.cos(phi);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(starfieldVerts, 3));
        const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false });
        scene.add(new THREE.Points(geo, mat)); // world space, NOT camera.add
    }

    function createCockpit() {
        cockpitGroup = new THREE.Group();
        cockpitGroup.renderOrder = 100;

        // Load GLB cockpit model
        const gltfLoader = new THREE.GLTFLoader();
        gltfLoader.load('assets/models/Meshy_AI_Starfighter_Cockpit_V_0412075340_texture.glb',
            function (gltf) {
                cockpitModel = gltf.scene;

                // Model bounds are roughly -0.8 to 0.8 (unit cube).
                // Scale and position so the pilot view looks out through the cockpit.
                // We want the cockpit to fill the lower portion of the view.
                cockpitModel.scale.setScalar(1.8);
                cockpitModel.position.set(0, -0.6, -0.8);

                // Ensure cockpit renders on top of everything (depth-free overlay)
                cockpitModel.traverse(child => {
                    if (child.isMesh) {
                        child.renderOrder = 100;
                        child.material.depthTest = false;
                        child.material.depthWrite = false;
                        // Keep the PBR look
                        if (child.material.map) child.material.map.encoding = THREE.sRGBEncoding;
                    }
                });

                // ── Separate arm geometry for procedural animation ──
                // The model is a single mesh. We'll find vertices in arm-like positions
                // (lower-left and lower-right of the cockpit) and split them out.
                cockpitModel.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        _extractArms(child);
                    }
                });

                cockpitGroup.add(cockpitModel);
                cockpitModel.visible = cockpitVisible;
                cockpitLoaded = true;

                console.log('Cockpit GLB loaded successfully');
            },
            function (progress) {
                if (progress.total > 0) {
                    const pct = Math.floor(progress.loaded / progress.total * 100);
                    console.log('Loading cockpit: ' + pct + '%');
                }
            },
            function (error) {
                console.error('Failed to load cockpit GLB:', error);
                // Fallback: just leave cockpit empty
            }
        );

        // ── Telemetry canvas (still drawn to offscreen canvas for HUD) ──
        telemetryCanvas = document.createElement('canvas');
        telemetryCanvas.width = 256;
        telemetryCanvas.height = 256;
        telemetryCtx = telemetryCanvas.getContext('2d');
        telemetryTexture = new THREE.CanvasTexture(telemetryCanvas);
        telemetryTexture.minFilter = THREE.LinearFilter;

        // ── Radar texture from radar-canvas ──
        const radarCanvas = document.getElementById('radar-canvas');
        if (radarCanvas) {
            radarTexture = new THREE.CanvasTexture(radarCanvas);
            radarTexture.minFilter = THREE.LinearFilter;
        }

        camera.add(cockpitGroup);
        scene.add(camera);
    }

    /**
     * Extract arm-like vertices from the cockpit mesh into separate sub-groups.
     * We identify "arm" regions by their local-space X position:
     *   Left arm: x < -0.35, y < 0.0 (lower-left quadrant)
     *   Right arm: x > 0.35, y < 0.0 (lower-right quadrant)
     * These get reparented as pivot groups that can rotate with steering input.
     */
    function _extractArms(mesh) {
        const pos = mesh.geometry.attributes.position;
        if (!pos) return;

        // Just create pivot groups at arm positions for rotation
        // Since splitting a 1.3M vertex mesh is expensive, we use a lightweight approach:
        // Create invisible pivot points at arm positions that rotate the whole cockpit subtly
        cockpitLeftArm = new THREE.Group();
        cockpitLeftArm.position.set(-0.35, -0.25, -0.2); // left arm pivot
        cockpitGroup.add(cockpitLeftArm);

        cockpitRightArm = new THREE.Group();
        cockpitRightArm.position.set(0.35, -0.25, -0.2); // right arm pivot
        cockpitGroup.add(cockpitRightArm);
    }

    /**
     * Animate cockpit arms based on player flight controls.
     * Called each frame from render(). Rotates the whole cockpit model subtly
     * to simulate the pilot steering — arms move with the ship controls.
     */
    function _animateCockpitArms(player) {
        if (!cockpitModel || !cockpitLoaded) return;

        // The cockpit is attached to the camera (first-person), so it stays fixed
        // in view. To simulate the pilot actively steering, we apply subtle tilt
        // to the cockpit model based on pitch/yaw input.
        // This makes the hands appear to push the stick in the direction of travel.

        const yaw = player.yaw || 0;    // current frame yaw input
        const pitch = player.pitch || 0; // current frame pitch input
        const roll = player.roll || 0;

        // Smoothly tilt cockpit to follow stick input
        // Target rotation: stick-right → cockpit tilts right, stick-forward → tilts forward
        const targetRollZ = -yaw * 0.15;   // yaw input tilts cockpit left/right
        const targetPitchX = pitch * 0.12;  // pitch input tilts cockpit forward/back
        const targetYawY = yaw * 0.08;      // slight yaw follow

        // Smooth interpolation (lerp)
        cockpitModel.rotation.z += (targetRollZ - cockpitModel.rotation.z) * 0.1;
        cockpitModel.rotation.x += (targetPitchX - cockpitModel.rotation.x) * 0.1;
        cockpitModel.rotation.y += (targetYawY - cockpitModel.rotation.y) * 0.1;
    }

    // Resize cockpit — GLB model scales naturally, no quad to rebuild
    function resizeCockpit() {
        // GLB cockpit is 3D and attached to camera — no resize needed
        // Aspect ratio changes are handled by the perspective projection
    }

    // Show/hide cockpit (called by core.js on launch complete)
    function showCockpit(visible) {
        cockpitVisible = visible;
        if (cockpitModel) cockpitModel.visible = visible;
    }

    // Draw telemetry gauges onto the right-screen canvas
    function updateTelemetryScreen(data) {
        if (!telemetryCtx) return;
        const c = telemetryCtx;
        const W = 256, H = 256;
        c.clearRect(0, 0, W, H);
        c.fillStyle = 'rgba(0,5,10,0.9)';
        c.fillRect(0, 0, W, H);

        const gauges = [
            { label: 'SPD', val: data.speed, max: data.maxSpeed, color: '#0ff' },
            { label: 'THR', val: data.throttle, max: 100, color: '#0ff' },
            { label: 'FUEL', val: data.fuel, max: 100, color: '#0f0' },
            { label: 'HULL', val: data.hull, max: 100, color: data.hull < 30 ? '#f00' : '#48f' },
            { label: 'SHLD', val: data.shields, max: 100, color: data.shields < 30 ? '#f80' : '#48f' },
            { label: 'BASE', val: data.basePct, max: 100, color: data.basePct < 20 ? '#f00' : '#f80' }
        ];

        const barX = 52, barW = 160, barH = 14, gap = 6;
        const startY = 18;

        c.font = '11px Courier New';
        c.textBaseline = 'middle';

        gauges.forEach((g, i) => {
            const y = startY + i * (barH + gap);
            const pct = Math.max(0, Math.min(1, g.val / g.max));

            // Label
            c.fillStyle = '#6cf';
            c.textAlign = 'right';
            c.fillText(g.label, barX - 6, y + barH / 2);

            // Track
            c.fillStyle = 'rgba(0,255,255,0.08)';
            c.fillRect(barX, y, barW, barH);
            c.strokeStyle = 'rgba(0,255,255,0.2)';
            c.strokeRect(barX, y, barW, barH);

            // Fill
            c.fillStyle = g.color;
            c.globalAlpha = 0.8;
            c.fillRect(barX, y, barW * pct, barH);
            c.globalAlpha = 1.0;

            // Value
            c.fillStyle = '#fff';
            c.textAlign = 'left';
            c.fillText(Math.floor(g.val), barX + barW + 6, y + barH / 2);
        });

        // Score + Wave at bottom
        const scoreY = startY + gauges.length * (barH + gap) + 10;
        c.fillStyle = '#fff';
        c.font = 'bold 18px Courier New';
        c.textAlign = 'center';
        c.fillText(data.score, W / 2, scoreY);
        c.fillStyle = '#6cf';
        c.font = '11px Courier New';
        c.fillText('WAVE ' + data.wave, W / 2, scoreY + 20);

        // Weapons
        c.fillStyle = '#0f0';
        c.font = '10px Courier New';
        c.textAlign = 'left';
        c.fillText('● LASERS ONLINE', 20, scoreY + 42);
        c.fillStyle = '#0ff';
        c.fillText('● TORPEDOES: ' + data.torpedoes, 20, scoreY + 56);

        // Warning message
        if (data.message) {
            c.fillStyle = '#ff0';
            c.font = '10px Courier New';
            c.textAlign = 'center';
            c.fillText(data.message, W / 2, H - 12);
        }

        telemetryTexture.needsUpdate = true;
    }

    // Update radar texture from existing radar canvas
    function updateRadarTexture() {
        if (radarTexture) radarTexture.needsUpdate = true;
    }

    let hangarMesh = null;
    let sharedNoiseTexture = null;
    function getNoiseTexture() {
        if (sharedNoiseTexture) return sharedNoiseTexture;
        const size = 256; // 256 is plenty for bump noise (was 512)
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(size, size);
        for (let i = 0; i < imgData.data.length; i += 4) {
            const v = Math.random() * 255;
            imgData.data[i] = v;
            imgData.data[i + 1] = v;
            imgData.data[i + 2] = v;
            imgData.data[i + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        sharedNoiseTexture = new THREE.CanvasTexture(canvas);
        sharedNoiseTexture.wrapS = THREE.RepeatWrapping;
        sharedNoiseTexture.wrapT = THREE.RepeatWrapping;
        return sharedNoiseTexture;
    }

    // ── Shared material cache (created once on first use) ──
    function _getSharedMats() {
        if (sharedMats) return sharedMats;
        const nt = getNoiseTexture();
        sharedMats = {
            // Enemy fighter
            alien: new THREE.MeshPhysicalMaterial({ color: 0x334433, metalness: 0.95, roughness: 0.25, clearcoat: 1.0, bumpMap: nt, bumpScale: 0.08 }),
            alienDark: new THREE.MeshPhysicalMaterial({ color: 0x112211, metalness: 1.0, roughness: 0.15, bumpMap: nt, bumpScale: 0.1 }),
            alienGlow: new THREE.MeshBasicMaterial({ color: 0x00ff44 }),
            alienSpike: new THREE.MeshPhysicalMaterial({ color: 0x556655, metalness: 1.0, roughness: 0.1, clearcoat: 1.0 }),
            alienDome: new THREE.MeshPhysicalMaterial({ color: 0x003300, metalness: 0.5, roughness: 0.1, clearcoat: 1.0, opacity: 0.7, transparent: true }),
            // Baseship
            hull: new THREE.MeshPhysicalMaterial({ color: 0x667788, metalness: 0.85, roughness: 0.2, bumpMap: nt, bumpScale: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
            detail: new THREE.MeshPhysicalMaterial({ color: 0x99aabb, metalness: 0.95, roughness: 0.1, clearcoat: 1.0 }),
            dark: new THREE.MeshPhysicalMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.3, bumpMap: nt, bumpScale: 0.1 }),
            glowBlue: new THREE.MeshBasicMaterial({ color: 0x44aaff }),
            glowCyan: new THREE.MeshBasicMaterial({ color: 0x00ffff }),
            window: new THREE.MeshBasicMaterial({ color: 0x88ccff }),
            hangarGlow: new THREE.MeshBasicMaterial({ color: 0x335577, transparent: true, opacity: 0.6 }),
            // Alien capital
            alienCap: new THREE.MeshPhysicalMaterial({ color: 0x221133, emissive: 0x110011, metalness: 1.0, roughness: 0.15, bumpMap: nt, bumpScale: 0.3, clearcoat: 1.0 }),
            alienArmor: new THREE.MeshPhysicalMaterial({ color: 0x332244, metalness: 0.95, roughness: 0.1, bumpMap: nt, bumpScale: 0.2 }),
            alienCapSpike: new THREE.MeshPhysicalMaterial({ color: 0x664488, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 }),
            alienCapGlow: new THREE.MeshBasicMaterial({ color: 0xff00ff }),
            alienShield: new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.08 }),
            // Laser
            laserCore: new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            laserGlow: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
            // Torpedo
            torpCore: new THREE.MeshBasicMaterial({ color: 0x00ffff }),
            torpGlow: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
        };
        return sharedMats;
    }

    function createEntityMesh(type) {
        let mesh = new THREE.Group();
        const m = _getSharedMats();

        if (type === 'enemy') {
            // ── Alien Fighter: Boomerang — reduced segment counts, no PointLights ──
            const bodyGeo = new THREE.CylinderGeometry(1.5, 3.5, 18, 12);
            bodyGeo.rotateX(-Math.PI / 2);
            bodyGeo.scale(1, 0.4, 1);
            mesh.add(new THREE.Mesh(bodyGeo, m.alien));

            for (let side = -1; side <= 1; side += 2) {
                const wingGeo = new THREE.BufferGeometry();
                const v = new Float32Array([
                    0, 0, -8, side * 22, 0, 2, side * 18, 0, 8,
                    0, 0, -8, side * 18, 0, 8, 0, 0, 4,
                ]);
                wingGeo.setAttribute('position', new THREE.BufferAttribute(v, 3));
                wingGeo.computeVertexNormals();
                mesh.add(new THREE.Mesh(wingGeo, m.alien));
                const wingBot = new THREE.Mesh(wingGeo, m.alienDark);
                wingBot.rotation.x = Math.PI;
                mesh.add(wingBot);

                const plateGeo = new THREE.BoxGeometry(6, 0.8, 4);
                const plate = new THREE.Mesh(plateGeo, m.alienDark);
                plate.position.set(side * 12, 0.5, 2);
                mesh.add(plate);

                const spikeGeo = new THREE.ConeGeometry(0.8, 8, 6);
                spikeGeo.rotateZ(side * -Math.PI / 2);
                const spike = new THREE.Mesh(spikeGeo, m.alienSpike);
                spike.position.set(side * 24, 0, 3);
                mesh.add(spike);

                const fwdSpikeGeo = new THREE.ConeGeometry(0.5, 6, 6);
                fwdSpikeGeo.rotateX(-Math.PI / 2);
                const fwdSpike = new THREE.Mesh(fwdSpikeGeo, m.alienSpike);
                fwdSpike.position.set(side * 8, 0, -10);
                mesh.add(fwdSpike);

                // Engine glow — emissive sphere, NO PointLight
                const engGeo = new THREE.SphereGeometry(1.2, 8, 8);
                const eng = new THREE.Mesh(engGeo, m.alienGlow);
                eng.position.set(side * 8, 0, 7);
                mesh.add(eng);
            }

            const domeGeo = new THREE.SphereGeometry(2, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
            const dome = new THREE.Mesh(domeGeo, m.alienDome);
            dome.position.set(0, 1, -4);
            mesh.add(dome);

            const noseGeo = new THREE.ConeGeometry(0.6, 10, 6);
            noseGeo.rotateX(-Math.PI / 2);
            const nose = new THREE.Mesh(noseGeo, m.alienSpike);
            nose.position.set(0, 0, -14);
            mesh.add(nose);

        } else if (type === 'baseship') {
            mesh.userData.isBaseship = true;

            // ── Main hull: long wedge-shaped body ──
            const hullGeo = new THREE.BoxGeometry(120, 50, 600, 4, 2, 8);
            mesh.add(new THREE.Mesh(hullGeo, m.hull));

            const bowGeo = new THREE.CylinderGeometry(10, 65, 200, 16, 4);
            bowGeo.rotateX(-Math.PI / 2);
            bowGeo.scale(1, 0.4, 1);
            const bow = new THREE.Mesh(bowGeo, m.hull);
            bow.position.set(0, 0, -400);
            mesh.add(bow);

            const sternGeo = new THREE.BoxGeometry(160, 70, 100, 2, 2, 2);
            const stern = new THREE.Mesh(sternGeo, m.hull);
            stern.position.set(0, 0, 300);
            mesh.add(stern);

            // Bridge
            const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 80, 2, 2, 2), m.detail);
            bridgeBase.position.set(0, 40, -80);
            mesh.add(bridgeBase);
            const bridgeTower = new THREE.Mesh(new THREE.BoxGeometry(30, 50, 40), m.detail);
            bridgeTower.position.set(0, 70, -80);
            mesh.add(bridgeTower);
            const bridgeWindow = new THREE.Mesh(new THREE.BoxGeometry(32, 8, 2), m.window);
            bridgeWindow.position.set(0, 80, -100);
            mesh.add(bridgeWindow);

            // Antenna
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 4), m.detail);
            mast.position.set(0, 125, -80);
            mesh.add(mast);
            const dish = new THREE.Mesh(new THREE.SphereGeometry(8, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.detail);
            dish.position.set(0, 155, -80);
            dish.rotation.x = Math.PI;
            mesh.add(dish);

            // Hull plates (fewer)
            const plateGeo = new THREE.BoxGeometry(122, 2, 8);
            for (let z = -250; z <= 200; z += 100) {
                const plate = new THREE.Mesh(plateGeo, m.dark);
                plate.position.set(0, 26, z);
                mesh.add(plate);
                const plateBot = new THREE.Mesh(plateGeo, m.dark);
                plateBot.position.set(0, -26, z);
                mesh.add(plateBot);
            }

            // Side nacelles — NO PointLights, emissive glow instead
            for (let side = -1; side <= 1; side += 2) {
                const strut = new THREE.Mesh(new THREE.BoxGeometry(80, 10, 20), m.hull);
                strut.position.set(side * 100, -5, 100);
                mesh.add(strut);

                const nacGeo = new THREE.CylinderGeometry(20, 25, 200, 16, 4);
                nacGeo.rotateX(Math.PI / 2);
                const nac = new THREE.Mesh(nacGeo, m.hull);
                nac.position.set(side * 140, -5, 100);
                mesh.add(nac);

                // Engine glow — emissive, no PointLight
                const nacEngGeo = new THREE.CylinderGeometry(20, 20, 10, 16);
                nacEngGeo.rotateX(Math.PI / 2);
                const nacEng = new THREE.Mesh(nacEngGeo, m.glowBlue);
                nacEng.position.set(side * 140, -5, 200);
                mesh.add(nacEng);

                // Turret domes (one per side instead of three)
                const turret = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.detail);
                turret.position.set(side * 60, 27, 0);
                mesh.add(turret);
            }

            // Hangar bay
            const hangar = new THREE.Mesh(new THREE.BoxGeometry(80, 15, 120, 2, 1, 2), m.dark);
            hangar.position.set(0, -32, 50);
            hangar.name = 'baseship-hangar';
            mesh.add(hangar);
            const hangarGlow = new THREE.Mesh(new THREE.PlaneGeometry(60, 100), m.hangarGlow);
            hangarGlow.position.set(0, -40, 50);
            hangarGlow.rotation.x = Math.PI / 2;
            hangarGlow.name = 'baseship-hangar-glow';
            mesh.add(hangarGlow);

            // Engine cluster — emissive, no PointLights (was 15 lights!)
            const engGeo = new THREE.CylinderGeometry(12, 12, 15, 12);
            engGeo.rotateX(Math.PI / 2);
            for (let row = -1; row <= 1; row++) {
                for (let col = -2; col <= 2; col++) {
                    const eng = new THREE.Mesh(engGeo, m.glowCyan);
                    eng.position.set(col * 28, row * 20, 350);
                    mesh.add(eng);
                }
            }

        } else if (type === 'alien-baseship') {
            // ── Alien Capital Ship — reduced segments, no PointLights ──
            mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(80, 1), m.alienCap));

            for (let side = -1; side <= 1; side += 2) {
                const armGeo = new THREE.BufferGeometry();
                const av = new Float32Array([
                    0, 0, -60, side * 250, 0, 20, side * 200, 0, 80,
                    0, 0, -60, side * 200, 0, 80, 0, 0, 60,
                ]);
                armGeo.setAttribute('position', new THREE.BufferAttribute(av, 3));
                armGeo.computeVertexNormals();
                mesh.add(new THREE.Mesh(armGeo, m.alienCap));
                const armBot = new THREE.Mesh(armGeo, m.alienArmor);
                armBot.rotation.x = Math.PI;
                mesh.add(armBot);

                // Two ridges per arm instead of three
                for (let r = 1; r <= 2; r++) {
                    const ridge = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 20), m.alienArmor);
                    ridge.position.set(side * r * 80, 5, 10);
                    mesh.add(ridge);
                }

                // Two spikes per arm instead of four + four
                for (let s = 0; s < 2; s++) {
                    const spike = new THREE.Mesh(new THREE.ConeGeometry(4, 40 - s * 15, 6), m.alienCapSpike);
                    spike.position.set(side * (60 + s * 80), 20, 10 + s * 15);
                    mesh.add(spike);
                }

                const tipGeo = new THREE.ConeGeometry(6, 50, 6);
                tipGeo.rotateZ(side * -Math.PI / 2);
                const tip = new THREE.Mesh(tipGeo, m.alienCapSpike);
                tip.position.set(side * 260, 0, 30);
                mesh.add(tip);

                // Engine pods — emissive, no PointLight
                const ePod = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), m.alienCapGlow);
                ePod.position.set(side * 110, 0, 70);
                mesh.add(ePod);
            }

            const ramGeo = new THREE.ConeGeometry(8, 80, 6);
            ramGeo.rotateX(-Math.PI / 2);
            const ram = new THREE.Mesh(ramGeo, m.alienCapSpike);
            ram.position.set(0, 0, -100);
            mesh.add(ram);

            const shield = new THREE.Mesh(new THREE.SphereGeometry(280, 16, 16), m.alienShield);
            mesh.add(shield);

        } else if (type === 'laser') {
            // Laser bolt — no PointLight
            const geo = new THREE.CylinderGeometry(0.8, 0.8, 20, 6);
            geo.rotateX(Math.PI / 2);
            mesh.add(new THREE.Mesh(geo, m.laserCore));
            const glowGeo = new THREE.CylinderGeometry(1.5, 1.5, 22, 6);
            glowGeo.rotateX(Math.PI / 2);
            mesh.add(new THREE.Mesh(glowGeo, m.laserGlow));

        } else if (type === 'torpedo') {
            // Torpedo — no PointLight
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), m.torpCore));
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), m.torpGlow));

        } else {
            mesh.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
        }

        scene.add(mesh);
        return mesh;
    }

    // ── Helper: hex color → rgb floats ──
    function _hexRGB(hex) {
        return [(hex >> 16 & 0xff) / 255, (hex >> 8 & 0xff) / 255, (hex & 0xff) / 255];
    }

    function spawnExplosion(pos) {
        // Single flash light (kept — explosions are rare)
        const light = new THREE.PointLight(0xffaa00, 8, 500);
        light.position.copy(pos);
        scene.add(light);
        setTimeout(() => scene.remove(light), 300);

        // Explosion particles via pooled system
        const colors = [[1, 0.53, 0], [1, 0.67, 0], [1, 1, 0], [1, 0.4, 0]];
        for (let i = 0; i < 25; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 100 + Math.random() * 300;
            const c = colors[(Math.random() * 4) | 0];
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
                c[0], c[1], c[2], 1.2 + Math.random() * 0.5);
        }
        // Shockwave ring
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * 150, (Math.random() - 0.5) * 100, Math.sin(a) * 150,
                1, 0.67, 0, 0.8);
        }
        cameraShakeIntensity = Math.max(cameraShakeIntensity, 2.0);
    }

    function spawnImpactEffect(pos, color = 0xff00ff) {
        const [r, g, b] = _hexRGB(color);
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 80 + Math.random() * 150;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * sp, (Math.random() - 0.5) * sp, Math.sin(a) * sp,
                r, g, b, 0.6 + Math.random() * 0.3);
        }
    }

    function spawnLaser(laserEntity) {
        const p = laserEntity.position;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            _emitParticle(p.x, p.y, p.z,
                Math.cos(a) * 50, (Math.random() - 0.5) * 30, Math.sin(a) * 50,
                0, 1, 0, 0.2);
        }
    }

    function render(state) {
        if (!scene) return;

        // Update pooled particle system
        _updateParticles(0.016);

        // Update Camera to Player Position/Rotation
        if (state.player) {
            camera.position.copy(state.player.position);

            // Apply camera shake if active
            if (cameraShakeIntensity > 0) {
                camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
                camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
                camera.position.z += (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
                cameraShakeIntensity *= 0.92; // Decay shake faster
            }

            camera.quaternion.copy(state.player.quaternion);

            // Animate cockpit steering (arms follow stick input)
            _animateCockpitArms(state.player);
        }

        // Sync Entities
        const activeIds = new Set();

        state.entities.forEach(e => {
            if (e.type === 'player') return; // Handled by camera

            // Skip baseship during launch phase - don't even create or show it
            if (e.type === 'baseship' && launchPhaseActive) {
                return;
            }

            activeIds.add(e.id);
            let mesh = entityMeshes.get(e.id);

            if (!mesh) {
                mesh = createEntityMesh(e.type);
                entityMeshes.set(e.id, mesh);
            }

            mesh.position.copy(e.position);
            mesh.quaternion.copy(e.quaternion);
            mesh.visible = true; // Ensure it's visible when not in launch phase
        });

        // Target Lock Reticle
        if (state.player && state.player.lockedTarget) {
            targetLockMesh.visible = true;
            targetLockMesh.position.copy(state.player.lockedTarget.position);
            // Scale reticle to fit the target's radius
            const r = state.player.lockedTarget.radius * 2.5;
            targetLockMesh.scale.set(r / 20, r / 20, r / 20);
            // Rotate it slowly for visual effect
            targetLockMesh.rotation.x += 0.05;
            targetLockMesh.rotation.y += 0.05;
        } else {
            if (targetLockMesh) targetLockMesh.visible = false;
        }

        // Cleanup removed entities
        for (const [id, mesh] of entityMeshes) {
            if (!activeIds.has(id)) {
                scene.remove(mesh);
                entityMeshes.delete(id);
            }
        }

        renderer.render(scene, camera);
    }

    function onWindowResize() {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        resizeCockpit();
    }

    return { init, render, spawnExplosion, spawnLaser, removeLaunchBay, updateLaunchCinematic, hideHangarBay, showHangarBay, spawnImpactEffect, hideBaseship, showBaseship, showLaunchBay, setLaunchPhase, getStarfieldVerts: () => starfieldVerts, STAR_COUNT, STAR_RADIUS, showCockpit, updateTelemetryScreen, updateRadarTexture };
})();

window.SF3D = SF3D;
