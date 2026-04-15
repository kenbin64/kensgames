/**
 * Starfighter 3D Renderer
 * Three.js, First-Person Cockpit, Entity Meshes
 */

const SF3D = (function () {
    let scene, camera, renderer;
    const entityMeshes = new Map();
    let cockpitGroup;
    let cockpitModel; // GLB cockpit model
    let manifoldCockpitGroup;
    let manifoldCockpitShell;
    let manifoldCockpitDash;
    let manifoldCockpitMat;
    let manifoldCockpitShellMat;
    let cockpitLeftArm, cockpitRightArm; // separated arm meshes for animation
    let leftScreenMesh, rightScreenMesh; // 3D screen planes
    let telemetryCanvas, telemetryCtx, telemetryTexture;
    let radarTexture; // CanvasTexture from radar-canvas
    let cockpitLoaded = false;
    let cockpitLoadFailed = false;
    let cockpitVisible = true; // cockpit always visible — seamless through launch and combat
    let lastCockpitToggleAt = 0;
    let lastCockpitToggleValue = true;
    const MANIFOLD_COCKPIT_DEBUG = /(?:\?|&)manifoldCockpit=1(?:&|$)/.test(window.location.search);
    let targetLockMesh;
    let launchBayGroup;
    let cameraShakeIntensity = 0;
    const STRICT_MODEL_BASELINE = false;
    const _viewProj = new THREE.Matrix4();
    const _viewFrustum = new THREE.Frustum();
    const _tmpSphere = new THREE.Sphere();
    const _tmpVec = new THREE.Vector3();
    let _staticAnimFrame = 0;
    let _lastTelemetrySignature = '';
    const _activeIds = new Set();  // reused every frame — no allocation
    let _frameTime = 0;  // cached performance.now() per frame

    // ── GLB model cache: loaded once, cloned per entity ──
    const glbModels = {};    // { modelName: THREE.Group }
    // LOD levels: [{ path, distance }] — distance is the camera distance at which
    // Three.js switches FROM this level to the next (coarser) one.
    // Model paths — single LOD using full original GLBs
    const GLB_LOD = {
        enemy: [
            { path: 'assets/models/AlienEnemyFighter.glb', distance: 0 },
        ],
        ally: [
            { path: 'assets/models/HumanFriendlStarFighter.glb', distance: 0 },
        ],
        'alien-baseship': [
            { path: 'assets/models/AlienMotherShip.glb', distance: 0 },
        ],
        predator: [
            { path: 'assets/models/AlienEnemyPreditorDrone.glb', distance: 0 },
        ],
        baseship: [
            { path: 'assets/models/HumanSpaceBattleShip.glb', distance: 0 },
        ],
        station: [
            { path: 'assets/models/HumanSpaceStationWithAritificalGravity.glb', distance: 0 },
        ],
        // New enemy types
        interceptor: [
            { path: 'assets/models/Interceptor_Needle.glb', distance: 0 },
        ],
        bomber: [
            { path: 'assets/models/Bomber_Leviathan%20Tick.glb', distance: 0 },
        ],
        dreadnought: [
            { path: 'assets/models/Dreadnought_Hive%20Throne.glb', distance: 0 },
        ],
        // Friendly support
        tanker: [
            { path: 'assets/models/friendlyfueltanker.glb', distance: 0 },
        ],
        medic: [
            { path: 'assets/models/freindly_medical_frigate.glb', distance: 0 },
        ],
        // Earth uses full hi-poly model (single level) — it's always distant, always impressive
        earth: [
            { path: 'assets/models/Earth.glb', distance: 0 },
        ],
        // Moon uses full model — visible from combat area
        moon: [
            { path: 'assets/models/moon.glb', distance: 0 },
        ],
    };
    // Scale factors — proportional to real ship sizes, forced perspective for celestials
    // Player ~F-16 (16m), Baseship ~aircraft carrier (400m), Alien ships 3× human
    // Earth/Moon use forced perspective: sized for apparent angular size from player, not real scale
    const GLB_SCALES = {
        enemy: 50,             // alien fighter ~48m (3× human)
        predator: 200,         // predator drone ~240m — massive alien hunter
        interceptor: 50,       // interceptor ~48m — 3× human, fast
        bomber: 120,           // bomber ~120m — 3× heavy craft
        dreadnought: 1800,     // dreadnought ~1800m — alien capital
        'alien-baseship': 2100,// alien mothership ~2100m — 3× human carrier
        baseship: 400,         // human carrier ~400m — aircraft carrier class
        ally: 16,              // human fighter ~16m wingspan
        tanker: 60,            // fuel tanker ~80m — support craft
        medic: 80,             // medical frigate ~90m — larger support vessel
        station: 3000,         // space station ~massive, thousands of people
        earth: 18000,  // forced perspective — fills ~27° of sky at distance 60000
        moon: 4000,    // forced perspective — fills ~4.5° of sky at distance 80000 (1/4.5 Earth ratio)
    };

    // ── Dimensional LOD Manifold: z = xy ──
    // Visual detail (z) is the product of model fidelity (x) and camera distance (y)
    // Tier 0 (near): Full GLB model — Tier 1 (mid): Procedural mesh — Tier 2 (far): Glow sphere
    const PRELOAD_MODELS = STRICT_MODEL_BASELINE
        ? new Set(Object.keys(GLB_LOD))
        : new Set(['earth', 'moon', 'baseship', 'station', 'ally']);
    const LOD_GLOW_DIST = {
        enemy: 1800, predator: 2500, interceptor: 1800, bomber: 2200,
        dreadnought: 6000, 'alien-baseship': 8000, tanker: 1800, medic: 2000,
        ally: 1500, baseship: 12000, station: 25000, earth: 300000, moon: 200000,
    };
    const _lazyState = {};   // key → 'loading' | 'loaded' | 'error'

    // ── Distance-based dot rendering ──
    // Beyond DOT_DIST, entities render as simple glowing sprites instead of full models.
    // Beyond CULL_DIST, entities are not rendered at all (data-only).
    // RULE: 3D models should appear well before enemies are close enough to attack.
    // Combat range is ~500-1500 units, so 3D models must be visible by ~1500-2000.
    const DOT_DIST = {
        enemy: 800, predator: 1200, interceptor: 800, bomber: 1000,
        dreadnought: 3000, 'alien-baseship': 4000, tanker: 800, medic: 1000,
        ally: 700, baseship: 8000, station: 15000, earth: 200000, moon: 150000,
        laser: 600, machinegun: 400, torpedo: 800, plasma: 600,
        egg: 500, youngling: 400,
    };
    const CULL_DIST = 50000; // beyond this, skip entirely (except celestials)
    const _NO_CULL_TYPES = new Set(['earth', 'moon', 'baseship', 'station', 'alien-baseship']);
    const DOT_COLORS = {
        enemy: 0x22ff44, predator: 0x44ff00, interceptor: 0x00ffcc, bomber: 0xff6600,
        dreadnought: 0xff0044, 'alien-baseship': 0xff00ff, tanker: 0xffaa44, medic: 0xff4444,
        ally: 0x4488ff, baseship: 0x88ccff, station: 0xaaaaff, earth: 0x4488ff, moon: 0xcccccc,
        laser: 0x00ffaa, machinegun: 0xffcc00, torpedo: 0xff8800, plasma: 0x44ff00,
        egg: 0x99cc33, youngling: 0x332211,
    };
    const _dotSprites = new Map(); // entity id → sprite
    let _dotMaterialCache = {};

    function _getDotSprite(type) {
        const color = DOT_COLORS[type] || 0xffffff;
        if (!_dotMaterialCache[color]) {
            _dotMaterialCache[color] = new THREE.SpriteMaterial({
                color: color,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
        }
        const sprite = new THREE.Sprite(_dotMaterialCache[color]);
        sprite.scale.setScalar(8);
        scene.add(sprite);
        return sprite;
    }

    function _showAsDot(entityId, type, position) {
        let dot = _dotSprites.get(entityId);
        if (!dot) {
            dot = _getDotSprite(type);
            _dotSprites.set(entityId, dot);
        }
        dot.position.copy(position);
        dot.visible = true;
    }

    function _hideDot(entityId) {
        const dot = _dotSprites.get(entityId);
        if (dot) dot.visible = false;
    }

    function _cleanupDots(activeIds) {
        for (const [id, dot] of _dotSprites) {
            if (!activeIds.has(id)) {
                scene.remove(dot);
                _dotSprites.delete(id);
            }
        }
    }

    // ── Shared starfield vertex data (world-space positions, shared with radar) ──
    const STAR_COUNT = 6000;
    const STAR_RADIUS = 200000;
    let starfieldVerts = null; // Float32Array — filled once, read by radar

    // ═══════════════════════════════════════════════════════════════════════
    // PARTICLE ENGINE — 2026 quality: large softbody sprites, bloom fade
    // ═══════════════════════════════════════════════════════════════════════
    const MAX_PARTICLES = 2000;
    const particlePool = [];
    let activeParticles = 0;
    let particlePoints = null;
    let particlePositions, particleColors, particleSizes, particleAges, particleLifetimes;
    let particleVelocities;
    let particleInitSizes; // per-particle initial size (NOT a fixed 4px)
    let particleAlphas;    // per-particle initial alpha

    // Soft circular gradient texture — eliminates hard-edged square sprites
    function _createSoftCircleTexture() {
        const sz = 64;
        const c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.15, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, sz, sz);
        const tex = new THREE.CanvasTexture(c);
        tex.needsUpdate = true;
        return tex;
    }

    function _initParticleSystem() {
        particlePositions = new Float32Array(MAX_PARTICLES * 3);
        particleColors = new Float32Array(MAX_PARTICLES * 3);
        particleSizes = new Float32Array(MAX_PARTICLES);
        particleAges = new Float32Array(MAX_PARTICLES);
        particleLifetimes = new Float32Array(MAX_PARTICLES);
        particleVelocities = new Float32Array(MAX_PARTICLES * 3);
        particleInitSizes = new Float32Array(MAX_PARTICLES);
        particleAlphas = new Float32Array(MAX_PARTICLES);
        particleSizes.fill(0);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
        const mat = new THREE.PointsMaterial({
            size: 32, vertexColors: true, transparent: true,
            opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false,
            sizeAttenuation: true,
            map: _createSoftCircleTexture(),
            alphaTest: 0.001,
        });
        particlePoints = new THREE.Points(geo, mat);
        particlePoints.frustumCulled = false;
        scene.add(particlePoints);
        activeParticles = 0;
    }

    function _emitParticle(px, py, pz, vx, vy, vz, r, g, b, lifetime, size, alpha) {
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
        const sz = size || 30;
        particleSizes[i] = sz;
        particleInitSizes[i] = sz;
        particleAlphas[i] = alpha || 1.0;
        particleAges[i] = 0;
        particleLifetimes[i] = lifetime;
    }

    function _updateParticles(dt) {
        if (!particlePoints) return;
        // Decay muzzle flash lights
        for (let fi = 0; fi < _muzzleFlashPool.length; fi++) {
            const f = _muzzleFlashPool[fi];
            if (f.timer > 0) {
                f.timer -= dt;
                if (f.timer <= 0) f.light.intensity = 0;
                else f.light.intensity = f.baseIntensity * (f.timer / f.baseDuration);
            }
        }
        let write = 0;
        for (let read = 0; read < activeParticles; read++) {
            particleAges[read] += dt;
            if (particleAges[read] >= particleLifetimes[read]) continue;
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
                particleInitSizes[write] = particleInitSizes[read];
                particleAlphas[write] = particleAlphas[read];
                particleAges[write] = particleAges[read];
                particleLifetimes[write] = particleLifetimes[read];
            }
            const w3 = write * 3;
            particlePositions[w3] += particleVelocities[w3] * dt;
            particlePositions[w3 + 1] += particleVelocities[w3 + 1] * dt;
            particlePositions[w3 + 2] += particleVelocities[w3 + 2] * dt;
            // Slight drag
            particleVelocities[w3] *= 0.985;
            particleVelocities[w3 + 1] *= 0.985;
            particleVelocities[w3 + 2] *= 0.985;
            // ── Bloom fade: bright burst → rapid dim → slow ember glow ──
            // Exponential curve: size peaks at 20% life then fades, color stays hot
            const t = particleAges[write] / particleLifetimes[write];
            const bloom = t < 0.15 ? (t / 0.15) : Math.pow(1 - (t - 0.15) / 0.85, 1.5);
            particleSizes[write] = particleInitSizes[write] * Math.max(0.08, bloom);
            // Color fade: stays bright then dims toward end (multiply RGB)
            const colorFade = t < 0.4 ? 1.0 : Math.pow(1 - (t - 0.4) / 0.6, 0.8);
            particleColors[w3] *= (0.97 + colorFade * 0.03);
            particleColors[w3 + 1] *= (0.95 + colorFade * 0.05);
            particleColors[w3 + 2] *= (0.93 + colorFade * 0.07);
            write++;
        }
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
        scene.fog = new THREE.FogExp2(0x000000, 0.000008);

        // Camera setup
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 300000);

        // Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        // Cockpit visor filter — sun in space is blinding; the canopy polarizes
        // light down to a level the human eye (and HUD) can tolerate
        renderer.toneMappingExposure = 0.55;
        container.appendChild(renderer.domElement);

        // ── Sun direction — all lighting derives from this ──
        const SUN_POS = new THREE.Vector3(200000, 100000, 80000);
        const EARTH_POS = new THREE.Vector3(-15000, -55000, -25000);

        // Ambient — very dim base so deep-shadow side isn't pitch black
        const ambient = new THREE.AmbientLight(0x060610, 0.08);
        scene.add(ambient);

        // Primary sun directional light — intense (space has no atmosphere to soften)
        // Cockpit visor filter (toneMappingExposure) tames this to a viewable level
        const sunLight = new THREE.DirectionalLight(0xfff5e0, 5.0);
        sunLight.position.copy(SUN_POS);
        scene.add(sunLight);

        // ── Earth-shine — blue reflected light from the Earth's day side ──
        const earthShineDir = EARTH_POS.clone().normalize();
        const earthShine = new THREE.DirectionalLight(0x4488cc, 0.6);
        earthShine.position.copy(earthShineDir.clone().multiplyScalar(-1)); // light FROM Earth toward scene
        scene.add(earthShine);

        // Very subtle fill from opposite sun (scattered starlight / nebula)
        const fillLight = new THREE.DirectionalLight(0x0a0a1a, 0.08);
        fillLight.position.set(-SUN_POS.x, -SUN_POS.y, -SUN_POS.z);
        scene.add(fillLight);

        // ── Visible Sun — pure corona expanding outward, no solid sphere ──
        // In space without atmosphere, the sun has no defined edge — just a
        // blindingly bright point with corona radiating outward indefinitely
        const sunGroup = new THREE.Group();
        sunGroup.name = 'sun-group';

        // Tiny blazing core — point-like, overwhelmingly bright
        const sunCoreGeo = new THREE.SphereGeometry(200, 16, 16);
        const sunCoreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 1.0,
            blending: THREE.AdditiveBlending
        });
        sunGroup.add(new THREE.Mesh(sunCoreGeo, sunCoreMat));

        // Inner corona — intense white-yellow glow radiating from core
        const innerCoronaLayers = [
            { r: 600, color: 0xffffff, opacity: 0.8 },
            { r: 1200, color: 0xffffee, opacity: 0.5 },
            { r: 2500, color: 0xffeeaa, opacity: 0.25 },
            { r: 4000, color: 0xffdd66, opacity: 0.12 },
        ];
        innerCoronaLayers.forEach((layer, i) => {
            const geo = new THREE.SphereGeometry(layer.r, 24, 24);
            const mat = new THREE.MeshBasicMaterial({
                color: layer.color, transparent: true, opacity: layer.opacity,
                blending: THREE.AdditiveBlending, side: THREE.BackSide
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'inner-corona-' + i;
            sunGroup.add(mesh);
        });

        // Outer corona — expands far outward, fading from orange to deep red
        const outerCoronaColors = [0xffaa22, 0xff7711, 0xff4400, 0xcc2200, 0x881100, 0x440800];
        for (let i = 0; i < outerCoronaColors.length; i++) {
            const r = 6000 + i * 3000;
            const coronaGeo = new THREE.SphereGeometry(r, 24, 24);
            const coronaMat = new THREE.MeshBasicMaterial({
                color: outerCoronaColors[i],
                transparent: true, opacity: 0.06 / (1 + i * 0.5),
                blending: THREE.AdditiveBlending, side: THREE.BackSide
            });
            const corona = new THREE.Mesh(coronaGeo, coronaMat);
            corona.name = 'corona-' + i;
            sunGroup.add(corona);
        }

        // Outermost halo — barely perceptible, extends very far
        const haloGeo = new THREE.SphereGeometry(30000, 16, 16);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0xff4400, transparent: true, opacity: 0.008,
            blending: THREE.AdditiveBlending, side: THREE.BackSide
        });
        sunGroup.add(new THREE.Mesh(haloGeo, haloMat));

        // Sun point light — the actual light source for nearby objects
        const sunPLight = new THREE.PointLight(0xfff5e0, 5, 400000);
        sunGroup.add(sunPLight);

        sunGroup.position.copy(SUN_POS);
        scene.add(sunGroup);

        // Particle system
        _initParticleSystem();

        // Starfield
        createStarfield();

        // Cockpit GLB
        createCockpit();

        // Cockpit interior lighting — slightly brighter to compensate for visor filter
        const cockpitLight = new THREE.PointLight(0xccddff, 2.0, 5);
        cockpitLight.position.set(0, 0.3, 0);
        camera.add(cockpitLight);
        const cockpitAmbient = new THREE.HemisphereLight(0x4466aa, 0x112233, 1.0);
        camera.add(cockpitAmbient);

        // Launch Bay
        createLaunchBay();

        // Preload all GLB models
        _preloadGLBModels();

        // Target Lock Reticle — modern bracket-style ring
        targetLockMesh = _createTargetReticle();
        targetLockMesh.visible = false;
        scene.add(targetLockMesh);

        window.addEventListener('resize', onWindowResize, false);
    }

    // ── Create modern targeting reticle (ring + corner brackets) ──
    function _createTargetReticle() {
        const group = new THREE.Group();
        // Outer ring
        const ringGeo = new THREE.RingGeometry(9, 10, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);
        // Inner ring (thinner, brighter)
        const innerRingGeo = new THREE.RingGeometry(6.5, 7, 32);
        const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
        group.add(new THREE.Mesh(innerRingGeo, innerRingMat));
        // Corner brackets (four L-shaped lines)
        const bracketMat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
        const bSize = 12, bLen = 4;
        const corners = [
            [[-bSize, bSize, 0], [-bSize + bLen, bSize, 0], [-bSize, bSize, 0], [-bSize, bSize - bLen, 0]],
            [[bSize, bSize, 0], [bSize - bLen, bSize, 0], [bSize, bSize, 0], [bSize, bSize - bLen, 0]],
            [[-bSize, -bSize, 0], [-bSize + bLen, -bSize, 0], [-bSize, -bSize, 0], [-bSize, -bSize + bLen, 0]],
            [[bSize, -bSize, 0], [bSize - bLen, -bSize, 0], [bSize, -bSize, 0], [bSize, -bSize + bLen, 0]],
        ];
        corners.forEach(pts => {
            const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
            group.add(new THREE.LineSegments(geo, bracketMat));
        });
        // Diamond center pip
        const dotGeo = new THREE.RingGeometry(0, 1.5, 4);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        group.add(new THREE.Mesh(dotGeo, dotMat));
        return group;
    }

    // ── Loading progress tracking ──
    let _totalModelsToLoad = 0;
    let _modelsLoaded = 0;
    let _allModelsReady = false;
    let _onReadyCallback = null;

    function _updateLoadingProgress(label) {
        _modelsLoaded++;
        const pct = Math.floor((_modelsLoaded / _totalModelsToLoad) * 100);
        const bar = document.getElementById('loading-bar');
        const text = document.getElementById('loading-text');
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = label ? ('LOADING ' + label.toUpperCase() + '...') : ('LOADING ' + pct + '%');
        if (_modelsLoaded >= _totalModelsToLoad) {
            _allModelsReady = true;
            console.log('All GLB models loaded — game ready');
            const loadScreen = document.getElementById('loading-screen');
            if (loadScreen) loadScreen.style.display = 'none';
            if (_onReadyCallback) _onReadyCallback();
        }
    }

    function onAllModelsReady(cb) { _onReadyCallback = cb; if (_allModelsReady) cb(); }
    function isReady() { return _allModelsReady; }

    // ── Preload essential GLBs; lazy-load combat models on demand ──
    // Dimensional LOD: preloaded types get GLB + glow sphere immediately;
    // lazy types start as procedural fallback, GLB streams in during gameplay
    function _preloadGLBModels() {
        const loader = new THREE.GLTFLoader();

        // Only count preloaded models for loading screen (+ cockpit)
        _totalModelsToLoad = 1; // cockpit
        Object.entries(GLB_LOD).forEach(([key, levels]) => {
            if (PRELOAD_MODELS.has(key)) _totalModelsToLoad += levels.length;
        });

        Object.entries(GLB_LOD).forEach(([key, levels]) => {
            if (PRELOAD_MODELS.has(key)) {
                // ── Essential: load immediately, block loading screen ──
                _loadGLBType(loader, key, levels, true);
            } else {
                // ── Combat entity: empty template, lazy-loaded on first encounter ──
                glbModels[key] = new THREE.LOD(); // empty — triggers procedural fallback
            }
        });
    }

    // Shared GLB loading logic — used by both preload and lazy paths
    function _loadGLBType(loader, key, levels, countProgress) {
        const lod = new THREE.LOD();
        glbModels[key] = lod;
        let loaded = 0;
        const levelResults = new Array(levels.length);

        levels.forEach(({ path, distance }, idx) => {
            loader.load(path,
                function (gltf) {
                    const model = gltf.scene;
                    model.traverse(child => {
                        if (child.isMesh && child.material && child.material.map)
                            child.material.map.encoding = THREE.sRGBEncoding;
                    });
                    levelResults[idx] = { model, distance };
                    loaded++;
                    if (countProgress) _updateLoadingProgress(key);

                    if (loaded === levels.length) {
                        levelResults.sort((a, b) => a.distance - b.distance);

                        const lod0Mats = [];
                        levelResults[0].model.traverse(c => {
                            if (c.isMesh) lod0Mats.push(c.material);
                        });

                        levelResults.forEach(({ model, distance }, i) => {
                            if (i > 0) {
                                let mi = 0;
                                model.traverse(c => {
                                    if (c.isMesh && lod0Mats[mi])
                                        c.material = lod0Mats[mi++];
                                });
                            }
                            if (!STRICT_MODEL_BASELINE && ALIEN_GLOW_COLORS[key]) _applyBioluminescence(model, key);
                            lod.addLevel(model, distance);
                        });

                        // Add glow sphere as far-distance tier (disabled in strict model baseline)
                        if (!STRICT_MODEL_BASELINE) {
                            const glowDist = LOD_GLOW_DIST[key];
                            if (glowDist) lod.addLevel(_createGlowSphere(key), glowDist);
                        }

                        console.log(`GLB LOD ready: ${key} (${levels.length} detail + glow)`);
                        if (!countProgress) _lazyState[key] = 'loaded';
                        if (key === 'earth') _placeEarth(lod);
                        if (key === 'moon') _placeMoon(lod);
                        if (key === 'station') _placeStation(lod);
                    }
                },
                null,
                err => {
                    console.error('Failed to load GLB:', path, err);
                    if (countProgress) _updateLoadingProgress(key);
                    if (!countProgress) _lazyState[key] = 'error';
                }
            );
        });
    }

    // ── Lazy loader: streams combat model GLBs on first encounter ──
    function _triggerLazyLoad(key) {
        if (_lazyState[key]) return; // already loading/loaded
        _lazyState[key] = 'loading';
        console.log(`Lazy-loading GLB: ${key}...`);
        const levels = GLB_LOD[key];
        if (!levels || !levels[0]) return;
        const loader = new THREE.GLTFLoader();
        _loadGLBType(loader, key, levels, false);
    }

    // ── Bioluminescent glow for alien species from Brown Giant ──
    // They glow like deep-sea creatures in the vacuum of space
    const ALIEN_GLOW_COLORS = {
        enemy: { emissive: 0x22ff44, intensity: 0.6, pointColor: 0x44ff66, pointIntensity: 2.5, pointDist: 300 },
        predator: { emissive: 0x44ff00, intensity: 0.8, pointColor: 0x66ff22, pointIntensity: 4.0, pointDist: 600 },
        interceptor: { emissive: 0x00ffcc, intensity: 0.7, pointColor: 0x22ffdd, pointIntensity: 3.0, pointDist: 300 },
        bomber: { emissive: 0xff6600, intensity: 0.6, pointColor: 0xff8800, pointIntensity: 3.5, pointDist: 500 },
        dreadnought: { emissive: 0xff0044, intensity: 0.7, pointColor: 0xff2266, pointIntensity: 8.0, pointDist: 3000 },
        'alien-baseship': { emissive: 0xff00ff, intensity: 0.5, pointColor: 0xff44ff, pointIntensity: 6.0, pointDist: 2000 },
    };

    // ── Glow Sphere: far-distance LOD tier — minimal geometry, maximum visibility ──
    function _createGlowSphere(key) {
        const group = new THREE.Group();
        const cfg = ALIEN_GLOW_COLORS[key];
        const color = cfg ? cfg.emissive :
            (key === 'tanker' ? 0x00ff88 :
                key === 'medic' ? 0xff4444 :
                    key === 'ally' ? 0x4488ff :
                        key === 'baseship' ? 0x4488ff :
                            key === 'station' ? 0x4488ff : 0xffffff);

        // Core sphere — bright, visible at distance
        group.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 8, 8),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
        ));
        // Additive halo — soft bloom effect
        group.add(new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 6, 6),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.25,
                blending: THREE.AdditiveBlending, side: THREE.BackSide
            })
        ));
        return group;
    }

    function _applyBioluminescence(model, key) {
        const cfg = ALIEN_GLOW_COLORS[key];
        if (!cfg) return;
        model.traverse(child => {
            if (child.isMesh && child.material) {
                // Clone material so shared instances don't bleed
                child.material = child.material.clone();
                child.material.emissive = new THREE.Color(cfg.emissive);
                child.material.emissiveIntensity = cfg.intensity;
                // Make slightly translucent for organic feel
                child.material.transparent = true;
                child.material.opacity = 0.92;
            }
        });
    }

    function _addGlowLight(mesh, key) {
        const cfg = ALIEN_GLOW_COLORS[key];
        if (!cfg) return;
        const light = new THREE.PointLight(cfg.pointColor, cfg.pointIntensity, cfg.pointDist);
        light.name = 'bioGlow';
        mesh.add(light);
    }

    // ── Clone a LOD model for a new entity ──
    function _cloneLOD(key) {
        const src = glbModels[key];
        if (!src) return null;
        const lod = new THREE.LOD();
        src.levels.forEach(({ object, distance }) => {
            lod.addLevel(object.clone(), distance);
        });
        return lod;
    }

    // ── Place Earth with atmosphere ──
    function _placeEarth(model) {
        const earthGroup = new THREE.Group();
        earthGroup.name = 'earth-scenery';

        // The GLB model is the planet surface (LOD clone)
        const earth = _cloneLOD('earth') || model.clone();
        earth.scale.setScalar(GLB_SCALES.earth);
        earthGroup.add(earth);

        // Compute the visual radius from the GLB scale
        // GLB models from Meshy are roughly unit-sized (±0.8), so scaled radius:
        const earthRadius = GLB_SCALES.earth * 0.8;

        // ── Atmosphere shell — soft blue glow around the limb ──
        const atmosGeo = new THREE.SphereGeometry(earthRadius * 1.02, 32, 32);
        const atmosMat = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(0x4488ff) },
                viewVector: { value: new THREE.Vector3() },
                sunDirection: { value: new THREE.Vector3(200000, 100000, 80000).normalize() }
            },
            vertexShader: [
                'varying vec3 vNormal;',
                'varying vec3 vWorldPos;',
                'void main() {',
                '  vNormal = normalize(normalMatrix * normal);',
                '  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 glowColor;',
                'uniform vec3 viewVector;',
                'uniform vec3 sunDirection;',
                'varying vec3 vNormal;',
                'varying vec3 vWorldPos;',
                'void main() {',
                '  float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);',
                '  float sunFacing = max(0.0, dot(normalize(vNormal), sunDirection));',
                '  float glow = intensity * (0.3 + 0.7 * sunFacing);',
                '  gl_FragColor = vec4(glowColor, glow * 0.6);',
                '}'
            ].join('\n'),
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
        earthGroup.add(atmosphere);

        // ── Thin bright limb ring — Fresnel edge highlight ──
        const limbGeo = new THREE.SphereGeometry(earthRadius * 1.01, 32, 32);
        const limbMat = new THREE.ShaderMaterial({
            uniforms: {
                sunDirection: { value: new THREE.Vector3(200000, 100000, 80000).normalize() }
            },
            vertexShader: [
                'varying vec3 vNormal;',
                'void main() {',
                '  vNormal = normalize(normalMatrix * normal);',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 sunDirection;',
                'varying vec3 vNormal;',
                'void main() {',
                '  float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));',
                '  float sunFacing = max(0.0, dot(vNormal, sunDirection));',
                '  float intensity = pow(rim, 4.0) * sunFacing;',
                '  vec3 col = mix(vec3(0.3, 0.6, 1.0), vec3(0.7, 0.9, 1.0), rim);',
                '  gl_FragColor = vec4(col, intensity * 0.8);',
                '}'
            ].join('\n'),
            side: THREE.FrontSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        earthGroup.add(new THREE.Mesh(limbGeo, limbMat));

        // ── Cloud layer — slightly larger, semi-transparent white sphere ──
        const cloudGeo = new THREE.SphereGeometry(earthRadius * 1.008, 48, 48);
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15,
            roughness: 1.0,
            metalness: 0.0,
            depthWrite: false
        });
        const clouds = new THREE.Mesh(cloudGeo, cloudMat);
        clouds.name = 'earth-clouds';
        earthGroup.add(clouds);

        // Position Earth — forced perspective backdrop below the combat area
        // At scale 18000 with radius ~14400, fills ~27° of sky from 60000 distance
        earthGroup.position.set(-15000, -55000, -25000);
        scene.add(earthGroup);
    }

    // ── Place Moon — real GLB model, oriented toward Earth, forced perspective ──
    function _placeMoon(model) {
        const moonGroup = new THREE.Group();
        moonGroup.name = 'moon-scenery';

        // Use the GLB model instead of a procedural sphere
        const moon = _cloneLOD('moon') || model.clone();
        moon.scale.setScalar(GLB_SCALES.moon);
        moonGroup.add(moon);

        const moonRadius = GLB_SCALES.moon * 0.8; // ~3200

        // Subtle Earth-shine glow on the Earth-facing hemisphere
        const EARTH_POS_LOCAL = new THREE.Vector3(-15000, -55000, -25000);
        const MOON_POS = new THREE.Vector3(35000, -25000, -85000);
        const earthDir = EARTH_POS_LOCAL.clone().sub(MOON_POS).normalize();

        const earthGlowGeo = new THREE.SphereGeometry(moonRadius * 1.005, 32, 32);
        const earthGlowMat = new THREE.ShaderMaterial({
            uniforms: {
                earthDir: { value: earthDir }
            },
            vertexShader: [
                'varying vec3 vNormal;',
                'void main() {',
                '  vNormal = normalize(normalMatrix * normal);',
                '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 earthDir;',
                'varying vec3 vNormal;',
                'void main() {',
                '  float facing = max(0.0, dot(vNormal, earthDir));',
                '  float intensity = pow(facing, 2.0) * 0.12;',
                '  gl_FragColor = vec4(0.3, 0.5, 0.8, intensity);',
                '}'
            ].join('\n'),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.FrontSide
        });
        moonGroup.add(new THREE.Mesh(earthGlowGeo, earthGlowMat));

        // Position moon on opposite side from Earth — forced perspective
        // Earth at (-15000,-55000,-25000), Moon at (35000,-25000,-85000)
        // Station sits between them
        moonGroup.position.copy(MOON_POS);

        // Orient moon's near side toward Earth (tidal locking)
        moonGroup.lookAt(EARTH_POS_LOCAL);

        scene.add(moonGroup);
    }

    // ── Place Space Station as scenery ──
    function _placeStation(model) {
        const station = _cloneLOD('station') || model.clone();
        station.scale.setScalar(GLB_SCALES.station);
        // Civilian station between Earth and Moon — forced perspective corridor
        // Earth at (-15000,-55000,-25000), Moon at (35000,-25000,-85000)
        station.position.set(8000, -12000, -18000);
        station.name = 'station-scenery';
        scene.add(station);
    }

    function createLaunchBay() {
        launchBayGroup = new THREE.Group();

        const tubeLength = 600;
        const halfW = 25;   // half-width (total width 50)
        const halfH = 15;   // half-height (total height 30)
        const ribSpacing = 50;
        const ribDepth = 2.0;

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

        // ── Point lights for illumination every 80 units (boosted for visor filter) ──
        for (let z = 0; z > -tubeLength; z -= 80) {
            const ceilingLight = new THREE.PointLight(0x4488ff, 3.0, 60);
            ceilingLight.position.set(0, halfH - 1, z);
            launchBayGroup.add(ceilingLight);
        }

        // ── End-of-tunnel exit glow ──
        const exitLight = new THREE.PointLight(0xffffff, 6, 100);
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

        // Stage 1: Countdown phase (0 - 0.625) - Bay idle → engine spool-up
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
            // Only shake during engine rev-up (last 30% of countdown, ~70%+ progress)
            // Before that the ship is just sitting idle in the bay — no shake
            if (countdownPhase > 0.7) {
                const revPhase = (countdownPhase - 0.7) / 0.3; // 0→1 during rev-up
                cameraShakeIntensity = revPhase * 0.4;
            } else {
                cameraShakeIntensity = 0;
            }
            // Reset bay position
            launchBayGroup.position.set(0, -32, 50);
            launchBayGroup.visible = true;
        }
        // Stage 2: Launch acceleration (0.625 - 1.0) - Bay streaks past into open space
        else {
            const launchPhase = (progress - 0.625) / 0.375;
            // Move bay backward away from camera
            launchBayGroup.position.z = 50 + launchPhase * 2000;
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
        cockpitGroup.frustumCulled = false;

        // Build manifold cockpit as a diagnostic/fallback lens.
        // Visual default remains the authored GLB cockpit.
        createManifoldCockpit();

        // Load GLB cockpit model
        const gltfLoader = new THREE.GLTFLoader();
        gltfLoader.load('assets/models/firstPersonStarFighterCockpit.glb',
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
                        child.frustumCulled = false;
                        child.material.side = THREE.DoubleSide;
                        // Keep cockpit as a camera-overlay layer so nearby world geometry
                        // (baseship hull / launch tunnel) cannot punch it out after launch.
                        child.material.depthTest = false;
                        child.material.depthWrite = false;
                        child.material.toneMapped = true;
                        // Keep the PBR look
                        if (child.material.map) child.material.map.encoding = THREE.sRGBEncoding;
                    }
                });

                // ── Separate arm geometry for procedural animation ──
                cockpitModel.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        _extractArms(child);
                    }
                });

                cockpitGroup.add(cockpitModel);
                cockpitModel.visible = cockpitVisible;
                cockpitLoaded = true;
                cockpitLoadFailed = false;
                if (manifoldCockpitGroup) manifoldCockpitGroup.visible = cockpitVisible && MANIFOLD_COCKPIT_DEBUG;
                _updateLoadingProgress('cockpit');

                console.log('Cockpit GLB loaded successfully');
            },
            function (progress) {
                if (progress.total > 0) {
                    const pct = Math.floor(progress.loaded / progress.total * 100);
                    const text = document.getElementById('loading-text');
                    if (text) text.textContent = 'LOADING COCKPIT... ' + pct + '%';
                }
            },
            function (error) {
                console.error('Failed to load cockpit GLB:', error);
                cockpitLoadFailed = true;
                if (manifoldCockpitGroup) manifoldCockpitGroup.visible = cockpitVisible;
                _updateLoadingProgress('cockpit');
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

    function createManifoldCockpit() {
        manifoldCockpitGroup = new THREE.Group();
        manifoldCockpitGroup.position.set(0, -0.57, -0.75);
        manifoldCockpitGroup.renderOrder = 99;
        manifoldCockpitGroup.frustumCulled = false;
        manifoldCockpitGroup.visible = MANIFOLD_COCKPIT_DEBUG;

        const shellPositions = [];
        const shellColors = [];
        const manifold = window.SpaceManifold;
        const shellColor = new THREE.Color();

        for (let xi = -16; xi <= 16; xi++) {
            for (let yi = -12; yi <= 10; yi++) {
                const x = xi * 0.055;
                const y = yi * 0.055;
                const fold = x * y;
                const z = -0.18 - Math.abs(fold) * 2.15 - Math.pow(Math.abs(x), 1.45) * 0.32;
                const field = manifold && manifold.diamond ? manifold.diamond(x * 700, y * 700, z * 700) : 0;

                if (Math.abs(field) < 0.33 || Math.abs(fold) < 0.045) {
                    shellPositions.push(
                        x,
                        y + field * 0.03,
                        z - Math.abs(field) * 0.08
                    );

                    const intensity = 0.35 + (0.25 * (1 - Math.min(1, Math.abs(field))));
                    shellColor.setRGB(0.08, 0.65 + intensity * 0.4, 0.9 + intensity * 0.1);
                    shellColors.push(shellColor.r, shellColor.g, shellColor.b);
                }
            }
        }

        const shellGeo = new THREE.BufferGeometry();
        shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellPositions, 3));
        shellGeo.setAttribute('color', new THREE.Float32BufferAttribute(shellColors, 3));
        manifoldCockpitShellMat = new THREE.PointsMaterial({
            size: 0.028,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            sizeAttenuation: true,
        });
        manifoldCockpitShell = new THREE.Points(shellGeo, manifoldCockpitShellMat);
        manifoldCockpitShell.renderOrder = 99;
        manifoldCockpitShell.frustumCulled = false;
        manifoldCockpitGroup.add(manifoldCockpitShell);

        const dashGeo = new THREE.BoxGeometry(1.55, 0.18, 0.88, 4, 1, 3);
        manifoldCockpitMat = new THREE.MeshStandardMaterial({
            color: 0x0b1322,
            emissive: 0x0f8fb0,
            emissiveIntensity: 0.28,
            roughness: 0.72,
            metalness: 0.55,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false,
        });
        manifoldCockpitDash = new THREE.Mesh(dashGeo, manifoldCockpitMat);
        manifoldCockpitDash.position.set(0, -0.17, -0.28);
        manifoldCockpitDash.rotation.x = -0.32;
        manifoldCockpitDash.renderOrder = 98;
        manifoldCockpitDash.frustumCulled = false;
        manifoldCockpitGroup.add(manifoldCockpitDash);

        const railMat = new THREE.LineBasicMaterial({
            color: 0x66eeff,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            depthTest: false,
        });
        const railCurves = [-1, 1].map(sign => {
            const points = [];
            for (let i = 0; i <= 18; i++) {
                const t = i / 18;
                const x = sign * (0.34 + 0.14 * (1 - t));
                const y = -0.28 + Math.sin(t * Math.PI) * 0.38;
                const z = -0.18 - t * 1.05 - Math.abs(x * y) * 0.55;
                points.push(new THREE.Vector3(x, y, z));
            }
            return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), railMat);
        });
        railCurves.forEach(line => {
            line.renderOrder = 99;
            line.frustumCulled = false;
            manifoldCockpitGroup.add(line);
        });

        cockpitGroup.add(manifoldCockpitGroup);
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

        const yaw = THREE.MathUtils.clamp(player.yaw || 0, -1.6, 1.6);    // bounded steering intent
        const pitch = THREE.MathUtils.clamp(player.pitch || 0, -1.4, 1.4); // bounded steering intent
        const roll = player.roll || 0;

        // Smoothly tilt cockpit to follow stick input
        // Target rotation: stick-right → cockpit tilts right, stick-forward → tilts forward
        const targetRollZ = -yaw * 0.15;   // yaw input tilts cockpit left/right
        const targetPitchX = pitch * 0.12;  // pitch input tilts cockpit forward/back
        const targetYawY = yaw * 0.08;      // slight yaw follow

        // Smooth interpolation (lerp)
        cockpitModel.rotation.z += (targetRollZ - cockpitModel.rotation.z) * 0.12;
        cockpitModel.rotation.x += (targetPitchX - cockpitModel.rotation.x) * 0.12;
        cockpitModel.rotation.y += (targetYawY - cockpitModel.rotation.y) * 0.12;

        // Hard safety rails: keep cockpit in-frame even if input spikes slip through.
        cockpitModel.rotation.z = THREE.MathUtils.clamp(cockpitModel.rotation.z, -0.26, 0.26);
        cockpitModel.rotation.x = THREE.MathUtils.clamp(cockpitModel.rotation.x, -0.22, 0.22);
        cockpitModel.rotation.y = THREE.MathUtils.clamp(cockpitModel.rotation.y, -0.16, 0.16);
    }

    function _animateManifoldCockpit(player) {
        if (!manifoldCockpitGroup || !manifoldCockpitGroup.visible) return;

        const yaw = player.yaw || 0;
        const pitch = player.pitch || 0;
        const throttle = player.throttle || 0;
        const phase = window.SpaceManifold && window.SpaceManifold.helixPhase
            ? window.SpaceManifold.helixPhase(player.position.x, player.position.y)
            : performance.now() * 0.001;

        manifoldCockpitGroup.rotation.z += ((-yaw * 0.08) - manifoldCockpitGroup.rotation.z) * 0.08;
        manifoldCockpitGroup.rotation.x += ((pitch * 0.06) - manifoldCockpitGroup.rotation.x) * 0.08;

        const pulse = 0.55 + 0.25 * Math.sin(performance.now() * 0.002 + phase);
        const thrustGlow = 0.18 + Math.max(0, throttle) * 0.18;
        if (manifoldCockpitShellMat) manifoldCockpitShellMat.opacity = cockpitLoaded ? 0.24 + pulse * 0.08 : 0.72 + pulse * 0.12;
        if (manifoldCockpitMat) manifoldCockpitMat.emissiveIntensity = 0.22 + pulse * 0.2 + thrustGlow;
    }

    // Resize cockpit — GLB model scales naturally, no quad to rebuild
    function resizeCockpit() {
        // GLB cockpit is 3D and attached to camera — no resize needed
        // Aspect ratio changes are handled by the perspective projection
    }

    // Show/hide cockpit (called by core.js on launch complete)
    function showCockpit(visible) {
        cockpitVisible = visible;
        lastCockpitToggleAt = Date.now();
        lastCockpitToggleValue = !!visible;
        if (cockpitModel) cockpitModel.visible = visible;
        if (manifoldCockpitGroup) manifoldCockpitGroup.visible = visible && (MANIFOLD_COCKPIT_DEBUG || cockpitLoadFailed);
    }

    function getCockpitDebugState() {
        return {
            cockpitLoaded,
            cockpitVisible,
            hasCockpitModel: !!cockpitModel,
            hasManifoldCockpit: !!manifoldCockpitGroup,
            cockpitLoadFailed,
            manifoldCockpitDebugMode: MANIFOLD_COCKPIT_DEBUG,
            cockpitModelVisible: cockpitModel ? !!cockpitModel.visible : null,
            manifoldCockpitVisible: manifoldCockpitGroup ? !!manifoldCockpitGroup.visible : null,
            lastCockpitToggleAt,
            lastCockpitToggleValue,
        };
    }

    // Draw telemetry gauges onto the right-screen canvas
    function updateTelemetryScreen(data) {
        if (!telemetryCtx) return;

        // Delta-only telemetry: if values did not change, keep canvas as-is.
        const sig = [
            data.speed, data.maxSpeed, data.throttle, data.fuel,
            data.hull, data.shields, data.basePct,
            data.score, data.wave, data.torpedoes,
            data.kills, data.message || ''
        ].join('|');
        if (sig === _lastTelemetrySignature) return;
        _lastTelemetrySignature = sig;

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
            // ── Laser — brilliant green-cyan beam with hot white core ──
            laserCore: new THREE.MeshBasicMaterial({ color: 0xccffee }),
            laserGlow: new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
            laserHalo: new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
            laserTrail: new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }),
            // ── Torpedo — white-hot warhead, deep orange-red exhaust ──
            torpCore: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            torpInner: new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
            torpGlow: new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }),
            torpTrail: new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }),
            torpHalo: new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.BackSide }),
        };
        return sharedMats;
    }

    function createEntityMesh(type) {
        let mesh;

        // ── Map entity types to GLB model keys ──
        const glbKey = type === 'wingman' ? 'ally' : type;

        // ── Try GLB LOD clone first (only if model has finished loading levels) ──
        if (glbModels[glbKey] && glbModels[glbKey].levels && glbModels[glbKey].levels.length > 0) {
            mesh = _cloneLOD(glbKey);
            mesh.scale.setScalar(GLB_SCALES[glbKey] || 10);
            if (type === 'wingman') mesh.userData.isWingman = true;
            if (type === 'baseship') mesh.userData.isBaseship = true;
            if (type === 'tanker') mesh.userData.isTanker = true;
            if (type === 'medic') mesh.userData.isMedic = true;
            // Add bioluminescent point light to alien types
            if (ALIEN_GLOW_COLORS[glbKey]) {
                _addGlowLight(mesh, glbKey);
                mesh.userData.alienGlow = true;
            }
            scene.add(mesh);
            return mesh;
        }

        // ── Trigger lazy GLB load for combat types (streams in during gameplay) ──
        if (GLB_LOD[glbKey] && !_lazyState[glbKey]) _triggerLazyLoad(glbKey);

        // ── Fallback: simple procedural geometry while GLBs load ──
        mesh = new THREE.Group();
        const m = _getSharedMats();

        if (type === 'enemy') {
            // Fallback: bioluminescent organic form (glow worm from Brown Giant)
            const bodyMat = new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.85 });
            const body = new THREE.Mesh(new THREE.IcosahedronGeometry(25, 1), bodyMat);
            mesh.add(body);
            // Inner glow core
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xaaffaa, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(16, 8, 8), coreMat));
            // Outer glow halo
            const haloMat = new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(40, 8, 8), haloMat));
            // Point light
            _addGlowLight(mesh, 'enemy');
            mesh.userData.alienGlow = true;
        } else if (type === 'baseship') {
            mesh.userData.isBaseship = true;
            mesh.add(new THREE.Mesh(new THREE.BoxGeometry(60, 30, 300), m.hull));
        } else if (type === 'alien-baseship') {
            mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(200, 1), m.alienCap));
        } else if (type === 'alien-base') {
            // Hive: massive glowing organic structure
            const hiveMat = new THREE.MeshBasicMaterial({ color: 0x880088, transparent: true, opacity: 0.8 });
            mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(400, 2), hiveMat));
            const hiveGlow = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.BackSide });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(600, 16, 16), hiveGlow));
            const hiveLight = new THREE.PointLight(0xff44ff, 8, 15000);
            mesh.add(hiveLight);
            mesh.userData.alienGlow = true;
        } else if (type === 'predator') {
            // Predator Drone fallback: intense bioluminescent hunter
            const bodyMat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.9 });
            mesh.add(new THREE.Mesh(new THREE.DodecahedronGeometry(60, 0), bodyMat));
            // Blazing plasma core
            const coreMat = new THREE.MeshBasicMaterial({ color: 0x88ff22, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(30, 8, 8), coreMat));
            // Outer glow halo
            const haloMat = new THREE.MeshBasicMaterial({ color: 0x66ff00, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.BackSide });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(80, 8, 8), haloMat));
            _addGlowLight(mesh, 'predator');
            mesh.userData.alienGlow = true;
        } else if (type === 'interceptor') {
            // Interceptor fallback: sleek cyan glowing form
            const bodyMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85 });
            mesh.add(new THREE.Mesh(new THREE.ConeGeometry(16, 50, 6), bodyMat));
            const coreMat = new THREE.MeshBasicMaterial({ color: 0x88ffee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), coreMat));
            _addGlowLight(mesh, 'interceptor');
            mesh.userData.alienGlow = true;
        } else if (type === 'bomber') {
            // Bomber fallback: bulbous orange-glowing form
            const bodyMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 });
            const bodyGeo = new THREE.SphereGeometry(35, 8, 8);
            bodyGeo.scale(1.3, 0.8, 1.0);
            mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(20, 8, 8), coreMat));
            _addGlowLight(mesh, 'bomber');
            mesh.userData.alienGlow = true;
        } else if (type === 'dreadnought') {
            // Dreadnought fallback: massive red-glowing form
            const bodyMat = new THREE.MeshBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.85 });
            mesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(160, 1), bodyMat));
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xff4488, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(100, 8, 8), coreMat));
            _addGlowLight(mesh, 'dreadnought');
            mesh.userData.alienGlow = true;
        } else if (type === 'tanker') {
            // Tanker fallback: white-orange utility craft
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xccbbaa, metalness: 0.5, roughness: 0.5 });
            const bodyGeo = new THREE.BoxGeometry(40, 20, 60);
            mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
            const boomMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
            const boom = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 35, 6), boomMat);
            boom.rotation.x = Math.PI / 2;
            boom.position.z = -30;
            mesh.add(boom);
            // Beacon light
            const beacon = new THREE.PointLight(0x00ff88, 2, 200);
            beacon.position.set(0, 14, -40);
            mesh.add(beacon);
        } else if (type === 'medic') {
            // Medical frigate fallback: white-red medical vessel
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 });
            const bodyGeo = new THREE.BoxGeometry(45, 24, 75);
            mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
            // Red cross markings (horizontal + vertical bars)
            const crossMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
            const crossH = new THREE.Mesh(new THREE.BoxGeometry(20, 0.8, 7), crossMat);
            crossH.position.set(0, 12.2, 8);
            mesh.add(crossH);
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 20), crossMat);
            crossV.position.set(0, 12.2, 8);
            mesh.add(crossV);
            // Medical beacon
            const beacon = new THREE.PointLight(0xff4444, 2, 250);
            beacon.position.set(0, 16, 0);
            mesh.add(beacon);
        } else if (type === 'plasma') {
            // Toxic green plasma bolt
            const plasmaMat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.8 });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), plasmaMat));
            const glowMat = new THREE.MeshBasicMaterial({ color: 0x88ff44, transparent: true, opacity: 0.3 });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(20, 6, 6), glowMat));
        } else if (type === 'egg') {
            // Organic egg — yellowish-green translucent ovoid
            const eggMat = new THREE.MeshBasicMaterial({ color: 0x99cc33, transparent: true, opacity: 0.75 });
            const eggGeo = new THREE.SphereGeometry(14, 8, 8);
            eggGeo.scale(1, 1.3, 1); // elongated
            mesh.add(new THREE.Mesh(eggGeo, eggMat));
            // Inner glow (something growing inside)
            const innerMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.4 });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(7, 6, 6), innerMat));
        } else if (type === 'youngling') {
            // Small spidery creature — dark with red eyes
            const bodyMat = new THREE.MeshBasicMaterial({ color: 0x332211, transparent: true, opacity: 0.9 });
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(8, 6, 6), bodyMat));
            // Red eyes
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const eye1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 4, 4), eyeMat);
            eye1.position.set(3, 1.2, -6);
            mesh.add(eye1);
            const eye2 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 4, 4), eyeMat);
            eye2.position.set(-3, 1.2, -6);
            mesh.add(eye2);
        } else if (type === 'laser') {
            // ═══════════════════════════════════════════════════════════════
            // LASER BOLT — bright twin beams, hot white core + cyan glow halo
            // Looks like a real laser cannon — visible, bright, satisfying
            // ═══════════════════════════════════════════════════════════════
            const boltLen = 48, sep = 3.0;
            // Hot white-green core beam — thick enough to see
            const coreGeo = new THREE.CylinderGeometry(0.4, 0.4, boltLen, 6, 1);
            coreGeo.rotateX(Math.PI / 2);
            // Primary glow: tapered energy envelope
            const glowGeo = new THREE.CylinderGeometry(1.8, 0.5, boltLen + 6, 6, 1);
            glowGeo.rotateX(Math.PI / 2);
            // Outer halo: wide soft bloom
            const haloGeo = new THREE.CylinderGeometry(4.0, 1.0, boltLen + 10, 6, 1);
            haloGeo.rotateX(Math.PI / 2);
            // Leading tip: bright sphere flash
            const tipGeo = new THREE.SphereGeometry(1.5, 6, 6);
            tipGeo.translate(0, 0, -boltLen / 2);
            // Rear spark
            const rearGeo = new THREE.SphereGeometry(0.8, 4, 4);
            rearGeo.translate(0, 0, boltLen / 2);
            for (const xOff of [-sep, sep]) {
                const core = new THREE.Mesh(coreGeo, m.laserCore);
                core.position.x = xOff;
                mesh.add(core);
                const glow = new THREE.Mesh(glowGeo, m.laserGlow);
                glow.position.x = xOff;
                mesh.add(glow);
                const halo = new THREE.Mesh(haloGeo, m.laserHalo);
                halo.position.x = xOff;
                mesh.add(halo);
                const tip = new THREE.Mesh(tipGeo, m.laserCore);
                tip.position.x = xOff;
                mesh.add(tip);
                const rear = new THREE.Mesh(rearGeo, m.laserGlow);
                rear.position.x = xOff;
                mesh.add(rear);
            }
        } else if (type === 'machinegun') {
            // ═══════════════════════════════════════════════════════════════
            // TRACER ROUNDS — bright hot yellow-white dashes with streak
            // ═══════════════════════════════════════════════════════════════
            const tracerLen = 14;
            const coreGeo = new THREE.CylinderGeometry(0.2, 0.15, tracerLen, 4, 1);
            coreGeo.rotateX(Math.PI / 2);
            const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
            const streakGeo = new THREE.CylinderGeometry(0.8, 0.1, tracerLen + 4, 4, 1);
            streakGeo.rotateX(Math.PI / 2);
            const streakMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending });
            const haloGeo = new THREE.CylinderGeometry(2.0, 0.3, tracerLen + 2, 4, 1);
            haloGeo.rotateX(Math.PI / 2);
            const haloMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending });
            mesh.add(new THREE.Mesh(coreGeo, tracerMat));
            mesh.add(new THREE.Mesh(streakGeo, streakMat));
            mesh.add(new THREE.Mesh(haloGeo, haloMat));
            // Bright tip
            const tipGeo = new THREE.SphereGeometry(0.6, 4, 4);
            tipGeo.translate(0, 0, -tracerLen / 2);
            mesh.add(new THREE.Mesh(tipGeo, tracerMat));
        } else if (type === 'torpedo') {
            // ═══════════════════════════════════════════════════════════════
            // PROTON TORPEDO — white-hot warhead, deep orange firework exhaust
            // Multi-layer: core → inner glow → flame cone → wide halo → sparkler ring
            // ═══════════════════════════════════════════════════════════════
            // Warhead: brilliant white-hot core
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(2.0, 8, 8), m.torpCore));
            // Inner yellow-white glow
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(4.0, 8, 8), m.torpInner));
            // Orange glow envelope
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(7.0, 6, 6), m.torpGlow));
            // Wide outer halo — visible at distance
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(14, 6, 6), m.torpHalo));
            // Exhaust flame cone — long tapered trail
            const plumeGeo = new THREE.ConeGeometry(5.0, 30, 8);
            plumeGeo.rotateX(-Math.PI / 2);
            plumeGeo.translate(0, 0, 18);
            mesh.add(new THREE.Mesh(plumeGeo, m.torpTrail));
            // Secondary wider exhaust
            const plume2Geo = new THREE.ConeGeometry(8.0, 20, 6);
            plume2Geo.rotateX(-Math.PI / 2);
            plume2Geo.translate(0, 0, 14);
            mesh.add(new THREE.Mesh(plume2Geo, m.torpHalo));
            // Sparkler ring — bright points around exhaust (firework look)
            const sparkGeo = new THREE.BufferGeometry();
            const sparkCount = 24;
            const sparkPos = new Float32Array(sparkCount * 3);
            for (let s = 0; s < sparkCount; s++) {
                const a = (s / sparkCount) * Math.PI * 2;
                const r = 4 + Math.random() * 4;
                sparkPos[s * 3] = Math.cos(a) * r;
                sparkPos[s * 3 + 1] = Math.sin(a) * r;
                sparkPos[s * 3 + 2] = 10 + Math.random() * 12;
            }
            sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
            const sparkMat = new THREE.PointsMaterial({
                color: 0xffdd66, size: 6, transparent: true, opacity: 0.9,
                blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
                map: _createSoftCircleTexture(),
            });
            mesh.add(new THREE.Points(sparkGeo, sparkMat));
            mesh.userData.isTorpedo = true;
        } else {
            // Fallback: glowing point
            mesh.add(new THREE.Mesh(new THREE.SphereGeometry(3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })));
        }

        scene.add(mesh);
        return mesh;
    }

    // ── Helper: hex color → rgb floats ──
    function _hexRGB(hex) {
        return [(hex >> 16 & 0xff) / 255, (hex >> 8 & 0xff) / 255, (hex & 0xff) / 255];
    }

    function spawnExplosion(pos) {
        // ═══════════════════════════════════════════════════════════════
        // EXPLOSION — 2026 quality: multi-phase volumetric detonation
        // Phase 1: Brilliant white flash sphere (blinding burst)
        // Phase 2: Expanding shockwave ring (visible pressure wave)
        // Phase 3: Hot debris cloud (orange-white fragments)
        // Phase 4: Fast sparks (streaking metal shards)
        // ═══════════════════════════════════════════════════════════════

        // Dynamic point light — intense white flash
        const light = new THREE.PointLight(0xffffff, 30, 1500);
        light.position.copy(pos);
        scene.add(light);
        let flashTimer = 0;
        const flashInterval = setInterval(() => {
            flashTimer += 16;
            const t = flashTimer / 350;
            // Fast quadratic decay with orange shift
            light.intensity = 30 * Math.max(0, 1 - t * t);
            if (t > 0.3) light.color.setHex(0xff8844);
            if (t >= 1) { scene.remove(light); clearInterval(flashInterval); }
        }, 16);

        // Expanding flash sphere mesh (brief bright ball that grows and fades)
        const flashGeo = new THREE.SphereGeometry(1, 12, 12);
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.95,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const flashSphere = new THREE.Mesh(flashGeo, flashMat);
        flashSphere.position.copy(pos);
        scene.add(flashSphere);
        let sphereTimer = 0;
        const sphereInterval = setInterval(() => {
            sphereTimer += 16;
            const t = sphereTimer / 250;
            const scale = 20 + t * 80;
            flashSphere.scale.setScalar(scale);
            flashMat.opacity = Math.max(0, 0.9 * (1 - t * t));
            if (t > 0.4) flashMat.color.setHex(0xffaa44);
            if (t >= 1) {
                scene.remove(flashSphere);
                flashGeo.dispose(); flashMat.dispose();
                clearInterval(sphereInterval);
            }
        }, 16);

        // Shockwave ring — expanding torus (visible pressure wave)
        const ringGeo = new THREE.TorusGeometry(1, 0.3, 6, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xaaddff, transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(camera.position);
        scene.add(ring);
        let ringTimer = 0;
        const ringInterval = setInterval(() => {
            ringTimer += 16;
            const t = ringTimer / 500;
            ring.scale.setScalar(15 + t * 150);
            ringMat.opacity = Math.max(0, 0.5 * (1 - t));
            if (t >= 1) {
                scene.remove(ring);
                ringGeo.dispose(); ringMat.dispose();
                clearInterval(ringInterval);
            }
        }, 16);

        // Phase 1: Initial flash burst — large bright white-blue particles
        const flashColors = [[1, 1, 1], [0.8, 0.9, 1], [1, 0.97, 0.85], [1, 1, 0.9]];
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 150 + Math.random() * 350;
            const c = flashColors[(Math.random() * 4) | 0];
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
                c[0], c[1], c[2], 0.25 + Math.random() * 0.2, 50 + Math.random() * 40);
        }

        // Phase 2: Hot debris cloud — orange-white expanding chunks
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 40 + Math.random() * 200;
            const heat = Math.random();
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
                0.8 + heat * 0.2, 0.4 + heat * 0.4, heat * 0.15,
                0.8 + Math.random() * 1.2, 20 + Math.random() * 35);
        }

        // Phase 3: Fast sparks — bright streaking metal fragments
        for (let i = 0; i < 25; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 400 + Math.random() * 800;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
                1, 0.8 + Math.random() * 0.2, 0.3 + Math.random() * 0.3,
                0.3 + Math.random() * 0.4, 8 + Math.random() * 12);
        }

        // Phase 4: Secondary ember glow — slow dim particles that linger
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 20 + Math.random() * 60;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
                1, 0.3, 0.05, 1.5 + Math.random() * 1.5, 35 + Math.random() * 25);
        }

        cameraShakeIntensity = Math.max(cameraShakeIntensity, 4.0);
    }

    function spawnImpactEffect(pos, color = 0xff00ff) {
        // ── Weapon impact — bright burst with radial sparks ──
        const [r, g, b] = _hexRGB(color);
        // Central flash
        _emitParticle(pos.x, pos.y, pos.z, 0, 0, 0, 1, 1, 1, 0.1, 40);
        // Radial sparks
        for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 100 + Math.random() * 250;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.6, Math.sin(a) * Math.cos(el) * sp,
                r, g, b, 0.3 + Math.random() * 0.4, 12 + Math.random() * 18);
        }
        // Bright core particles
        for (let i = 0; i < 6; i++) {
            const sp = 30 + Math.random() * 60;
            const a = Math.random() * Math.PI * 2;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * sp, (Math.random() - 0.5) * sp, Math.sin(a) * sp,
                1, 1, 0.9, 0.15 + Math.random() * 0.1, 25 + Math.random() * 15);
        }
        cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.8);
    }

    // ── Muzzle flash point light pool ──
    const _muzzleFlashPool = [];
    let _muzzleFlashIdx = 0;
    function _getMuzzleFlash() {
        if (_muzzleFlashPool.length < 6) {
            const light = new THREE.PointLight(0x00ffaa, 8.0, 120);
            scene.add(light);
            _muzzleFlashPool.push({ light, timer: 0, baseIntensity: 8, baseDuration: 0.12 });
            return _muzzleFlashPool[_muzzleFlashPool.length - 1];
        }
        const flash = _muzzleFlashPool[_muzzleFlashIdx % 6];
        _muzzleFlashIdx++;
        return flash;
    }

    function spawnLaser(laserEntity) {
        const p = laserEntity.position;
        // Bright muzzle flash
        const flash = _getMuzzleFlash();
        flash.light.position.copy(p);
        flash.light.color.setHex(0x00ffaa);
        flash.light.intensity = 8.0;
        flash.baseIntensity = 8.0;
        flash.baseDuration = 0.12;
        flash.timer = 0.12;
        // Bright muzzle spark burst
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 80 + Math.random() * 120;
            _emitParticle(p.x, p.y, p.z,
                Math.cos(a) * sp * 0.4, (Math.random() - 0.5) * sp * 0.3, Math.sin(a) * sp * 0.4 - sp,
                0.3, 1, 0.75, 0.12 + Math.random() * 0.08, 15 + Math.random() * 10);
        }
        // Central bright flash particle
        _emitParticle(p.x, p.y, p.z, 0, 0, -40, 0.7, 1, 0.9, 0.08, 35);
    }

    function spawnTorpedoTrail(torpEntity) {
        // ═══════════════════════════════════════════════════════════════
        // TORPEDO TRAIL — dense streaming firework exhaust
        // Multiple layers: core flame + sparks + smoke wisps
        // ═══════════════════════════════════════════════════════════════
        const p = torpEntity.position;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(torpEntity.quaternion);
        // Core flame particles — bright orange-white
        for (let i = 0; i < 8; i++) {
            const spread = 30;
            const heat = Math.random();
            _emitParticle(
                p.x + (Math.random() - 0.5) * 3,
                p.y + (Math.random() - 0.5) * 3,
                p.z + (Math.random() - 0.5) * 3,
                fwd.x * 80 + (Math.random() - 0.5) * spread,
                fwd.y * 80 + (Math.random() - 0.5) * spread,
                fwd.z * 80 + (Math.random() - 0.5) * spread,
                1, 0.6 + heat * 0.4, heat * 0.3,
                0.3 + Math.random() * 0.4, 18 + Math.random() * 22
            );
        }
        // Sparkler particles — fast bright tiny specks (firework look)
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 5 + Math.random() * 8;
            _emitParticle(
                p.x + Math.cos(a) * r * 0.3,
                p.y + Math.sin(a) * r * 0.3,
                p.z + fwd.z * 4,
                fwd.x * 40 + Math.cos(a) * 60 + (Math.random() - 0.5) * 80,
                fwd.y * 40 + Math.sin(a) * 60 + (Math.random() - 0.5) * 80,
                fwd.z * 40 + (Math.random() - 0.5) * 80,
                1, 0.9, 0.4 + Math.random() * 0.3,
                0.15 + Math.random() * 0.2, 6 + Math.random() * 8
            );
        }
        // Dim smoke wisps — darker, slower, fade slowly
        if (Math.random() < 0.4) {
            _emitParticle(
                p.x + (Math.random() - 0.5) * 4,
                p.y + (Math.random() - 0.5) * 4,
                p.z + fwd.z * 6,
                fwd.x * 15 + (Math.random() - 0.5) * 20,
                fwd.y * 15 + (Math.random() - 0.5) * 20,
                fwd.z * 15 + (Math.random() - 0.5) * 20,
                0.5, 0.25, 0.1, 0.8 + Math.random() * 0.6, 30 + Math.random() * 20
            );
        }
        // Bright white sparks (sparkler effect)
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 30 + Math.random() * 50;
            _emitParticle(
                p.x, p.y, p.z,
                Math.cos(a) * sp + fwd.x * 20,
                (Math.random() - 0.5) * sp + fwd.y * 20,
                Math.sin(a) * sp + fwd.z * 20,
                1, 1, 0.8,
                0.2 + Math.random() * 0.2
            );
        }
    }

    function render(state) {
        if (!scene) return;

        // Cockpit must stay visible during all player-flight phases.
        const phase = state && state.phase;
        const cockpitRequired = phase === 'bay-ready' || phase === 'launching' || phase === 'combat' ||
            phase === 'land-approach' || phase === 'landing' || phase === 'docking';
        if (cockpitRequired && !cockpitVisible) {
            cockpitVisible = true;
            lastCockpitToggleAt = Date.now();
            lastCockpitToggleValue = true;
        }

        if (cockpitGroup) cockpitGroup.visible = cockpitVisible;
        if (cockpitModel) cockpitModel.visible = cockpitVisible;
        if (manifoldCockpitGroup) manifoldCockpitGroup.visible = cockpitVisible && (MANIFOLD_COCKPIT_DEBUG || cockpitLoadFailed);

        // Build camera frustum once per frame for on-screen culling decisions.
        camera.updateMatrixWorld();
        _viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _viewFrustum.setFromProjectionMatrix(_viewProj);

        // Update pooled particle system
        _updateParticles(0.016);
        _frameTime = performance.now();  // cache once per frame

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
            _animateManifoldCockpit(state.player);
        }

        // Sync Entities — acquire dining philosopher forks before touching
        const DP = window.SpaceManifold && window.SpaceManifold.DiningPhilosophers;
        _activeIds.clear();

        for (let i = 0, len = state.entities.length; i < len; i++) {
            const e = state.entities[i];
            if (e.type === 'player') continue; // Handled by camera

            // 🍴 Acquire fork — skip entity if destroyed (fork revoked)
            if (DP && !DP.acquire(e.id, 'render')) continue;

            // Skip baseship during launch phase - don't even create or show it
            if (e.type === 'baseship' && launchPhaseActive) {
                continue;
            }

            _activeIds.add(e.id);

            if (!e.position || !e.quaternion) continue;

            // ── Distance-based rendering: dot / full model / cull ──
            _tmpVec.copy(e.position).sub(camera.position);
            const distSq = _tmpVec.lengthSq();
            const dotThresh = DOT_DIST[e.type] || 3000;
            const isFar = distSq > dotThresh * dotThresh;
            const isCulled = !_NO_CULL_TYPES.has(e.type) && distSq > CULL_DIST * CULL_DIST;

            // Beyond cull distance: entity is data-only, no rendering at all
            if (isCulled) {
                const mesh = entityMeshes.get(e.id);
                if (mesh) mesh.visible = false;
                _hideDot(e.id);
                continue;
            }

            // Far but not culled: render as a simple glowing dot
            if (isFar) {
                // Check frustum for the dot position
                _tmpSphere.center.copy(e.position);
                _tmpSphere.radius = 10;
                const dotOnScreen = _viewFrustum.intersectsSphere(_tmpSphere);
                if (dotOnScreen) {
                    _showAsDot(e.id, e.type, e.position);
                } else {
                    _hideDot(e.id);
                }
                // Hide full model
                const mesh = entityMeshes.get(e.id);
                if (mesh) mesh.visible = false;
                continue;
            }

            // Close enough for full model rendering
            _hideDot(e.id); // hide dot if transitioning from far to close

            let mesh = entityMeshes.get(e.id);
            if (!mesh) {
                mesh = createEntityMesh(e.type);
                entityMeshes.set(e.id, mesh);
            }

            // Delta-only transform updates.
            const ud = mesh.userData;
            if (ud._px !== e.position.x || ud._py !== e.position.y || ud._pz !== e.position.z) {
                mesh.position.copy(e.position);
                ud._px = e.position.x; ud._py = e.position.y; ud._pz = e.position.z;
            }
            if (ud._qx !== e.quaternion.x || ud._qy !== e.quaternion.y || ud._qz !== e.quaternion.z || ud._qw !== e.quaternion.w) {
                mesh.quaternion.copy(e.quaternion);
                ud._qx = e.quaternion.x; ud._qy = e.quaternion.y; ud._qz = e.quaternion.z; ud._qw = e.quaternion.w;
            }

            // On-screen work only: if outside camera frustum, hide and skip expensive updates.
            const cullRadius = Math.max(8, (e.radius || 10) * 1.25);
            _tmpSphere.center.copy(mesh.position);
            _tmpSphere.radius = cullRadius;
            const onScreen = _viewFrustum.intersectsSphere(_tmpSphere);
            mesh.visible = onScreen;
            if (!onScreen) continue;

            // Update LOD level selection based on camera distance
            if (mesh.isLOD) mesh.update(camera);

            // Bioluminescent pulse — alien organisms glow rhythmically in space
            if (mesh.userData && mesh.userData.alienGlow) {
                const glow = mesh.getObjectByName('bioGlow');
                if (glow) {
                    const pulse = 0.7 + 0.3 * Math.sin(_frameTime * 0.003 + e.id * 1.7);
                    glow.intensity = glow.intensity * 0.9 + (pulse * (ALIEN_GLOW_COLORS[e.type] ? ALIEN_GLOW_COLORS[e.type].pointIntensity : 2.5)) * 0.1;
                }
            }

            // Torpedo sparkler trail — continuous particle emission
            if (e.type === 'torpedo' && mesh.userData && mesh.userData.isTorpedo) {
                spawnTorpedoTrail(e);
            }
        }

        // Cleanup dots for entities no longer active
        _cleanupDots(_activeIds);

        // Target Lock Reticle — check fork before accessing locked target
        const lt = state.player && state.player.lockedTarget;
        if (lt && lt.position && (!DP || DP.acquire(lt.id, 'render'))) {
            targetLockMesh.visible = true;
            targetLockMesh.position.copy(lt.position);
            // Scale reticle to fit the target's radius
            const r = lt.radius * 2.5;
            targetLockMesh.scale.set(r / 20, r / 20, r / 20);
            // Face camera then spin slowly on local Z
            targetLockMesh.quaternion.copy(camera.quaternion);
            targetLockMesh.rotateZ(_frameTime * 0.001);
        } else {
            if (targetLockMesh) targetLockMesh.visible = false;
        }

        // Cleanup removed entities
        for (const [id, mesh] of entityMeshes) {
            if (!_activeIds.has(id)) {
                scene.remove(mesh);
                entityMeshes.delete(id);
            }
        }

        // 🍴 Release all render forks — philosophers put down their forks
        if (DP) DP.releaseAll('render');

        // Rotate Earth slowly, clouds slightly faster
        // Static scenery: animate only intermittently and only when potentially visible.
        _staticAnimFrame = (_staticAnimFrame + 1) % 3;

        const earth = scene.getObjectByName('earth-scenery');
        if (earth && _staticAnimFrame === 0) {
            earth.getWorldPosition(_tmpVec);
            _tmpSphere.center.copy(_tmpVec);
            _tmpSphere.radius = 22000;
            if (_viewFrustum.intersectsSphere(_tmpSphere)) {
                earth.rotation.y += 0.0003;
                const clouds = earth.getObjectByName('earth-clouds');
                if (clouds) clouds.rotation.y += 0.0005;
            }
        }

        // Rotate station slowly
        const station = scene.getObjectByName('station-scenery');
        if (station && _staticAnimFrame === 0) {
            station.getWorldPosition(_tmpVec);
            _tmpSphere.center.copy(_tmpVec);
            _tmpSphere.radius = 5000;
            if (_viewFrustum.intersectsSphere(_tmpSphere)) {
                station.rotation.y += 0.001;
                if (station.isLOD) station.update(camera);
            }
        }

        // Rotate moon very slowly (tidally locked in real life, slight drift here for visual)
        const moon = scene.getObjectByName('moon-scenery');
        if (moon && _staticAnimFrame === 0) {
            moon.getWorldPosition(_tmpVec);
            _tmpSphere.center.copy(_tmpVec);
            _tmpSphere.radius = 5000;
            if (_viewFrustum.intersectsSphere(_tmpSphere)) moon.rotation.y += 0.00008;
        }

        // Animate sun corona — subtle breathing pulse
        const sunGrp = scene.getObjectByName('sun-group');
        if (sunGrp && _staticAnimFrame === 0) {
            sunGrp.getWorldPosition(_tmpVec);
            _tmpSphere.center.copy(_tmpVec);
            _tmpSphere.radius = 35000;
            if (_viewFrustum.intersectsSphere(_tmpSphere)) {
                const t = _frameTime * 0.001;
                sunGrp.children.forEach(child => {
                    if (child.name && child.name.startsWith('corona-')) {
                        const idx = parseInt(child.name.split('-')[1]);
                        const pulse = 1.0 + Math.sin(t * (0.5 + idx * 0.15) + idx) * 0.04;
                        child.scale.setScalar(pulse);
                    }
                });
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

    // ── Predator Drone plasma bolt — toxic green glowing projectile ──
    function spawnPlasma(plasmaEntity) {
        const p = plasmaEntity.position;
        // Green toxic muzzle flash
        const flash = _getMuzzleFlash();
        flash.light.position.copy(p);
        flash.light.color.setHex(0x44ff00);
        flash.light.intensity = 4.0;
        flash.timer = 0.15;
        // Spray of green plasma particles
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 60;
            _emitParticle(p.x, p.y, p.z,
                Math.cos(a) * sp * 0.4, (Math.random() - 0.5) * sp * 0.4, Math.sin(a) * sp * 0.4,
                0.2, 1, 0, 0.3 + Math.random() * 0.3);
        }
    }

    // ── Egg spawn — subtle organic pulse ──
    function spawnEgg(eggEntity) {
        const p = eggEntity.position;
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 10 + Math.random() * 20;
            _emitParticle(p.x, p.y, p.z,
                Math.cos(a) * sp * 0.3, (Math.random() - 0.5) * sp * 0.3, Math.sin(a) * sp * 0.3,
                0.6, 0.8, 0.2, 0.4 + Math.random() * 0.3);
        }
    }

    // ── Egg hatch — burst of particles ──
    function spawnEggHatch(pos) {
        // Green/orange organic burst
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI;
            const sp = 30 + Math.random() * 50;
            const r = Math.random() > 0.5 ? 0.9 : 0.4;
            const g = Math.random() > 0.5 ? 0.8 : 0.3;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp,
                Math.sin(el) * sp,
                Math.sin(a) * Math.cos(el) * sp,
                r, g, 0, 0.4 + Math.random() * 0.4);
        }
        // Flash
        const flash = _getMuzzleFlash();
        flash.light.position.copy(pos);
        flash.light.color.setHex(0xaaff00);
        flash.light.intensity = 2.0;
        flash.timer = 0.2;
    }

    // ── EMP Burst — expanding electromagnetic wave ring ──
    function spawnEMPBurst(pos, range) {
        // Create an expanding ring of purple-white energy
        const ringGeo = new THREE.RingGeometry(1, 3, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xcc44ff, transparent: true, opacity: 0.8,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        // Face the camera
        ring.lookAt(camera.position);
        scene.add(ring);

        // Second ring — offset for depth
        const ring2Geo = new THREE.RingGeometry(1, 5, 32);
        const ring2Mat = new THREE.MeshBasicMaterial({
            color: 0x8822ff, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
        });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.position.copy(pos);
        ring2.lookAt(camera.position);
        scene.add(ring2);

        // Flash light
        const flash = new THREE.PointLight(0xcc44ff, 8, range * 1.5);
        flash.position.copy(pos);
        scene.add(flash);

        // Animate expansion
        const startTime = performance.now();
        const duration = 600; // ms
        const maxScale = range / 2;
        function animateEMP() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const scale = t * maxScale;
            const fade = 1 - t;
            ring.scale.setScalar(scale);
            ring.material.opacity = 0.8 * fade;
            ring2.scale.setScalar(scale * 0.7);
            ring2.material.opacity = 0.5 * fade;
            flash.intensity = 8 * fade * fade;
            if (t < 1) {
                requestAnimationFrame(animateEMP);
            } else {
                scene.remove(ring);
                scene.remove(ring2);
                scene.remove(flash);
                ring.geometry.dispose();
                ring.material.dispose();
                ring2.geometry.dispose();
                ring2.material.dispose();
            }
        }
        requestAnimationFrame(animateEMP);

        // Spark particles — scattered purple-white sparks
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const el = (Math.random() - 0.5) * Math.PI * 0.5;
            const sp = 100 + Math.random() * 200;
            _emitParticle(pos.x, pos.y, pos.z,
                Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.5, Math.sin(a) * Math.cos(el) * sp,
                0.8, 0.3, 1, 0.4 + Math.random() * 0.3);
        }

        cameraShakeIntensity = Math.max(cameraShakeIntensity, 1.5);
    }

    return { init, render, spawnExplosion, spawnLaser, spawnPlasma, spawnEgg, spawnEggHatch, spawnTorpedoTrail, spawnEMPBurst, removeLaunchBay, updateLaunchCinematic, hideHangarBay, showHangarBay, spawnImpactEffect, hideBaseship, showBaseship, showLaunchBay, setLaunchPhase, getStarfieldVerts: () => starfieldVerts, STAR_COUNT, STAR_RADIUS, showCockpit, getCockpitDebugState, updateTelemetryScreen, updateRadarTexture, onAllModelsReady, isReady };
})();

window.SF3D = SF3D;
