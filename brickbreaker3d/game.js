// BrickBreaker3D - Manifold Audio Edition
// Complete 3D game engine with physics and rendering

let scene, camera, renderer, controls;
let gameActive = false, gamePaused = false;
let gameMode = 'easy'; // 'easy', 'hard', 'multi2', 'multi3', 'multi4'
let raycaster, floorPlane;

// Real-time reflections (lightweight, updated intermittently)
let reflectCubeRT = null;
let reflectCubeCam = null;
let __reflectFrame = 0;
const REFLECTION_RES = 128;
const REFLECTION_UPDATE_EVERY = 8; // update cubemap every N frames

// Game objects
let balls = [], paddles = [], bricks = [], players = [];

// Manifold substrate -- all physics constants and pure math
const BC = BB.C;
const PHI = BB.PHI;
const LAYER_BOOST = BB.LAYER_BOOST;
const BRICK_COLORS = BB.BRICK_HEX;
const PLAYER_COLORS = BB.PLAYER_HEX;
const COLORS = { cyan: 0x00ffff, dark: 0x0a0a1a };

// Geometry shortcuts (used 10+ times in physics/collision loops)
const BALL_RADIUS = BC.BALL_R;
const PADDLE_RADIUS = BC.PADDLE_R;
const PADDLE_THICKNESS = BC.PADDLE_THICK;
const PADDLE_BEVEL = BC.PADDLE_BEVEL;

// Dynamic arena dimensions (set per-game by BB.arenaLens in buildArena)
const ARENA_HEIGHT = BC.ARENA_H;
let ARENA_WIDTH = BC.ARENA_BASE_W;
let HALF_H = BC.ARENA_H / 2;
let HALF_W = ARENA_WIDTH / 2;
let WALL_INNER = HALF_W - 1;
let PADDLE_Y = BB.arenaLens(1).paddleY;
let PADDLE_BOUND = HALF_W - 5;

// Clamp ball Three.js velocity to substrate speed range
function clampBallEnergyAndSpeed(ball) {
    ball.baseSpeed = THREE.MathUtils.clamp(ball.baseSpeed ?? BC.SPEED_EASY, BC.MIN_SPEED, BC.MAX_SPEED);
    const spd = ball.velocity.length();
    if (spd > 0.0001) ball.velocity.multiplyScalar(ball.baseSpeed / spd);
}
// Arena meshes that get rebuilt per game
let arenaObjects = [];

// Initialize Three.js scene (once)
function initScene() {
    const canvas = document.getElementById('canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.dark);
    scene.fog = new THREE.Fog(COLORS.dark, 120, 400);

    // Camera
    camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, -2, 85);
    camera.lookAt(0, -3, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
    };
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 40;
    controls.maxDistance = 250;
    controls.target.set(0, 0, 0);

    raycaster = new THREE.Raycaster();
    floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), HALF_H - 0.5);

    initReflections();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 60, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0002;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 220;
    dirLight.shadow.camera.left = -70;
    dirLight.shadow.camera.right = 70;
    dirLight.shadow.camera.top = 70;
    dirLight.shadow.camera.bottom = -70;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-10, 0, 50);
    scene.add(fillLight);

    createStarfield();

    // Build initial arena for solo
    buildArena(1);

    // Prime reflections once so reflective materials aren't black on first frame
    if (reflectCubeCam) {
        reflectCubeCam.position.set(0, 0, 0);
        reflectCubeCam.update(renderer, scene);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
}

function initReflections() {
    // Dynamic cubemap used as envMap for reflective materials.
    // Not physically perfect, but gives the “objects reflect each other” feel.
    reflectCubeRT = new THREE.WebGLCubeRenderTarget(REFLECTION_RES, {
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
    });
    reflectCubeRT.texture.mapping = THREE.CubeReflectionMapping;
    reflectCubeCam = new THREE.CubeCamera(0.1, 600, reflectCubeRT);
    reflectCubeCam.position.set(0, 0, 0);
    scene.add(reflectCubeCam);
}

function applyReflectionsToMaterial(mat, intensity = 1.0) {
    if (!mat || !reflectCubeRT) return;
    mat.envMap = reflectCubeRT.texture;
    mat.envMapIntensity = intensity;
    mat.needsUpdate = true;
}

// Build/rebuild arena for given player count
function buildArena(numPlayers) {
    // Remove old arena objects
    arenaObjects.forEach(obj => scene.remove(obj));
    arenaObjects = [];
    bricks.forEach(b => scene.remove(b));
    bricks = [];

    // Apply arena dimensions from BB manifold substrate
    const _a = BB.arenaLens(numPlayers);
    ARENA_WIDTH = _a.width; HALF_W = _a.halfW; HALF_H = _a.halfH;
    WALL_INNER = _a.wallInner; PADDLE_BOUND = _a.paddleBound; PADDLE_Y = _a.paddleY;

    // Update camera to see full arena
    camera.position.set(0, -2, ARENA_WIDTH * 1.6);
    controls.target.set(0, -3, 0);

    // Retune shadow volume for the new arena size
    scene.traverse(obj => {
        if (obj && obj.isDirectionalLight && obj.castShadow && obj.shadow?.camera) {
            const s = Math.max(70, HALF_W + 20);
            obj.shadow.camera.left = -s;
            obj.shadow.camera.right = s;
            obj.shadow.camera.top = s;
            obj.shadow.camera.bottom = -s;
            obj.shadow.camera.updateProjectionMatrix();
        }
    });

    createArenaWalls();
    createFloor();
    createBricks();
}

function createFloor() {
    const geo = new THREE.PlaneGeometry(ARENA_WIDTH - 0.2, ARENA_WIDTH - 0.2);
    // Opaque, semi-reflective floor
    const mat = new THREE.MeshPhysicalMaterial({
        color: 0x0b1025,
        metalness: 0.15,
        roughness: 0.22,
        clearcoat: 1.0,
        clearcoatRoughness: 0.10,
        transparent: false,
        opacity: 1,
    });
    applyReflectionsToMaterial(mat, 1.25);
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -HALF_H;
    floor.receiveShadow = true;
    scene.add(floor);
    arenaObjects.push(floor);
}

function createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const starColors = [0x00ffff, 0x39ff14, 0xbf00ff, 0xffee00, 0xffffff];

    for (let i = 0; i < 500; i++) {
        positions.push(
            (Math.random() - 0.5) * 300,
            (Math.random() - 0.5) * 300,
            -50 - Math.random() * 100
        );
        const c = starColors[Math.floor(Math.random() * starColors.length)];
        colors.push((c >> 16) & 255, (c >> 8) & 255, c & 255);
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(colors), 3, true));

    const starMat = new THREE.PointsMaterial({ size: 0.8, vertexColors: true });
    scene.add(new THREE.Points(starGeo, starMat));

    // Glows in background
    const pinkGlow = new THREE.PointLight(0xff00ff, 2, 150);
    pinkGlow.position.set(-20, 20, -70);
    scene.add(pinkGlow);

    const purpleGlow = new THREE.PointLight(0x8a2be2, 2, 150);
    purpleGlow.position.set(30, -10, -70);
    scene.add(purpleGlow);
}

function createArenaWalls() {
    const w = ARENA_WIDTH;
    const h = ARENA_HEIGHT;

    // Cyan wireframe edges (box: w × h × w)
    const boxGeo = new THREE.BoxGeometry(w, h, w);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.cyan, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    scene.add(wireframe);
    arenaObjects.push(wireframe);

    // Glassy wall panels
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.14,
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        side: THREE.DoubleSide,
    });
    applyReflectionsToMaterial(glassMat, 0.9);

    const wallDefs = [
        { geo: [w, h], pos: [0, 0, -HALF_W], rot: [0, 0, 0] },           // back
        { geo: [w, h], pos: [0, 0, HALF_W], rot: [0, 0, 0] },            // front
        { geo: [w, h], pos: [-HALF_W, 0, 0], rot: [0, Math.PI / 2, 0] }, // left
        { geo: [w, h], pos: [HALF_W, 0, 0], rot: [0, Math.PI / 2, 0] },  // right
        { geo: [w, w], pos: [0, HALF_H, 0], rot: [Math.PI / 2, 0, 0] }   // ceiling
    ];

    wallDefs.forEach(wd => {
        const geo = new THREE.PlaneGeometry(wd.geo[0], wd.geo[1]);
        const wall = new THREE.Mesh(geo, glassMat.clone());
        wall.position.set(...wd.pos);
        wall.rotation.set(...wd.rot);
        wall.receiveShadow = true;
        scene.add(wall);
        arenaObjects.push(wall);
    });
}

function createBricks() {
    BB.brickLayout(ARENA_WIDTH).forEach(b => {
        const mat = new THREE.MeshPhysicalMaterial({
            color: b.color, transparent: true, opacity: 0.7,
            roughness: 0.05, metalness: 0.15, clearcoat: 1.0, clearcoatRoughness: 0.05,
        });
        applyReflectionsToMaterial(mat, 1.15);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.position.set(b.x, b.y, b.z);
        mesh.health = 1;
        mesh.layer = b.layer;
        scene.add(mesh);
        bricks.push(mesh);
    });
}

function setupPlayers() {
    balls.forEach(b => scene.remove(b));
    paddles.forEach(p => scene.remove(p));
    balls = []; paddles = []; players = [];

    const { numPlayers, isMulti, baseSpeed, lives, ballsPerPlayer, paddleRadius } = BB.modeLens(gameMode);

    for (let i = 0; i < numPlayers; i++)
        players.push({ id: i, score: 0, alive: true, color: PLAYER_COLORS[i], lives });

    for (let i = 0; i < numPlayers; i++) {
        const pi = BB.paddleInit(i, paddleRadius);
        const geo = new THREE.CylinderGeometry(paddleRadius * PADDLE_BEVEL, paddleRadius, PADDLE_THICKNESS, 48, 1, false);
        const mat = new THREE.MeshPhysicalMaterial({
            color: PLAYER_COLORS[i], metalness: 0.35, roughness: 0.22, clearcoat: 1.0, clearcoatRoughness: 0.12,
        });
        applyReflectionsToMaterial(mat, 1.1);
        const p = new THREE.Mesh(geo, mat);
        p.castShadow = p.receiveShadow = true;
        p.position.set(pi.x, PADDLE_Y, pi.z);
        p.playerId = i;
        p.paddleRadius = p.baseRadius = paddleRadius;
        p.ceilingPenaltyApplied = false;
        scene.add(p);
        paddles.push(p);
    }

    if (isMulti) {
        for (let i = 0; i < numPlayers; i++)
            for (let k = 0; k < ballsPerPlayer; k++) spawnBall(i, baseSpeed, true);
    } else {
        spawnBall(0, baseSpeed, false);
    }
}

function spawnBall(ownerIdx, baseSpeed, isMulti) {
    const init = BB.ballInit(ownerIdx, baseSpeed, isMulti);
    const { position: ip, velocity: iv, spin: _s, ...scalars } = init;
    const mat = new THREE.MeshPhysicalMaterial({
        color: 0xcccccc, metalness: 0.85, roughness: 0.16, clearcoat: 1.0, clearcoatRoughness: 0.10,
    });
    applyReflectionsToMaterial(mat, 1.25);
    if (isMulti) { mat.emissive = new THREE.Color(0x000000); mat.emissiveIntensity = 0.0; }
    const b = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), mat);
    b.castShadow = b.receiveShadow = true;
    b.position.copy(ip);
    b.velocity = new THREE.Vector3().copy(iv);
    b.spin = new THREE.Vector3();
    Object.assign(b, scalars);
    scene.add(b);
    balls.push(b);
    return b;
}

function onMouseMove(e) {
    if (!gameActive || paddles.length === 0) return;
    if (e.buttons === 2 || e.buttons === 4) return; // camera controls

    const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(floorPlane, intersection);
    if (!intersection) return;

    // Player 0 paddle always follows mouse
    const p = paddles[0];
    if (!p || !players[0].alive) return;

    let tx = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, intersection.x));
    let tz = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, intersection.z));

    // Try to move there, but stop at collision boundary with other paddles
    movePaddleTo(0, tx, tz);
}

function onWindowResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function startGame(mode) {
    gameMode = mode;
    gameActive = true;
    gamePaused = false;

    const isMulti = mode.startsWith('multi');
    const numPlayers = isMulti ? parseInt(mode.slice(5)) : 1;

    // Rebuild arena for player count (resizes walls, floor, bricks)
    buildArena(numPlayers);

    setupPlayers();

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').style.display = 'block';
    updateHUD();
}

// --- AI for multiplayer paddles — each is an independent rival ---
function updateAIPaddles() {
    for (let i = 1; i < paddles.length; i++) {
        if (!players[i].alive) continue;
        const p = paddles[i];
        let targetX, targetZ;
        let aimBall = null;

        // AI aims for a catch height near the paddle's top surface (with a little slack)
        const thicknessY = PADDLE_THICKNESS * ((p.scale && typeof p.scale.y === 'number') ? p.scale.y : 1);
        const catchY = p.position.y + thicknessY * 0.5 + BALL_RADIUS * 0.8;

        // Priority 1: Save MY liability ball (the one that will cost me a life) if it's falling
        const myBall = balls.find(b => b.alive && b.liabilityOwner === i && b.velocity.y < 0);
        if (myBall) {
            const t = BB.estimateTimeToY(myBall.position, myBall.velocity, catchY);
            targetX = myBall.position.x + myBall.velocity.x * t;
            targetZ = myBall.position.z + myBall.velocity.z * t;
            aimBall = myBall;

            // But if another ball I don't own is closer and I can steal it, go for that
            const myDist = Math.sqrt(
                Math.pow(targetX - p.position.x, 2) + Math.pow(targetZ - p.position.z, 2)
            );

            // Priority 2: Steal someone else's falling ball if it's closer
            let stealBall = null, stealDist = myDist;
            balls.forEach(b => {
                if (!b.alive || b.liabilityOwner === i || b.velocity.y >= 0) return;
                const st = BB.estimateTimeToY(b.position, b.velocity, catchY);
                const sx = b.position.x + b.velocity.x * st;
                const sz = b.position.z + b.velocity.z * st;
                const sd = Math.sqrt(Math.pow(sx - p.position.x, 2) + Math.pow(sz - p.position.z, 2));
                if (sd < stealDist * 0.7) { // only steal if significantly closer
                    stealBall = b; stealDist = sd;
                    targetX = sx; targetZ = sz;
                    aimBall = b;
                }
            });
        } else {
            // No own ball falling — look for any ball to intercept or block an opponent

            // Priority 3: Intercept any falling ball I can reach
            let bestBall = null, bestTime = Infinity;
            balls.forEach(b => {
                if (!b.alive || b.velocity.y >= 0) return;
                const t = BB.estimateTimeToY(b.position, b.velocity, catchY);
                const lx = b.position.x + b.velocity.x * t;
                const lz = b.position.z + b.velocity.z * t;
                const d = Math.sqrt(Math.pow(lx - p.position.x, 2) + Math.pow(lz - p.position.z, 2));
                const reachTime = d / 5; // rough paddle speed estimate
                if (reachTime < t && t < bestTime) {
                    bestTime = t; bestBall = b;
                    targetX = lx; targetZ = lz;
                    aimBall = b;
                }
            });

            if (!bestBall) {
                // Priority 4: Block a rival — pick the leading opponent
                let rival = null, rivalScore = -1;
                players.forEach((pl, j) => {
                    if (j === i || !pl.alive) return;
                    if (pl.score > rivalScore) { rivalScore = pl.score; rival = pl; }
                });

                if (rival) {
                    const rivalIdx = rival.id;
                    const rivalPaddle = paddles[rivalIdx];
                    // Find rival's ball
                    const rivalBall = balls.find(b => b.alive && b.liabilityOwner === rivalIdx && b.velocity.y < 0);
                    if (rivalBall) {
                        // Block between rival paddle and their ball's landing
                        const t = BB.estimateTimeToY(rivalBall.position, rivalBall.velocity, catchY);
                        const landX = rivalBall.position.x + rivalBall.velocity.x * t;
                        const landZ = rivalBall.position.z + rivalBall.velocity.z * t;
                        targetX = (rivalPaddle.position.x + landX) / 2;
                        targetZ = (rivalPaddle.position.z + landZ) / 2;
                        aimBall = rivalBall;
                    } else {
                        // Rival has no falling ball — roam independently
                        // Each AI drifts to a different quadrant based on their ID
                        const angle = (i / paddles.length) * Math.PI * 2 + performance.now() * 0.0003;
                        targetX = Math.cos(angle) * 8;
                        targetZ = Math.sin(angle) * 8;
                    }
                } else {
                    targetX = 0; targetZ = 0;
                }
            }
        }

        // Imperfect aim: more energy/turbulence => harder to predict
        if (aimBall) {
            const turb = aimBall.turbulence || 0;
            const spd = aimBall.baseSpeed || BC.SPEED_EASY;
            const err = 0.35 + turb * 14 + Math.max(0, spd - BC.MIN_SPEED) * 3.2;
            targetX += (Math.random() - 0.5) * err;
            targetZ += (Math.random() - 0.5) * err;
        }

        // Move toward target — capped at ball speed to prevent teleporting
        let dx = targetX - p.position.x;
        let dz = targetZ - p.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        let maxSpeed = 0.3; // Default
        const activeBalls = balls.filter(b => b.alive);
        if (activeBalls.length > 0) {
            maxSpeed = Math.max(...activeBalls.map(b => b.velocity.length()));
        }

        // AI shouldn't be perfectly fast; slight constraint keeps it fair
        maxSpeed *= 0.90;

        if (dist > maxSpeed) {
            dx = (dx / dist) * maxSpeed;
            dz = (dz / dist) * maxSpeed;
        }

        const newX = p.position.x + dx;
        const newZ = p.position.z + dz;
        movePaddleTo(i, newX, newZ);
    }
}

// Move a paddle to target position (no collision check — that happens in separation pass)
function movePaddleTo(idx, tx, tz) {
    const p = paddles[idx];
    p.position.x = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, tx));
    p.position.z = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, tz));
}

// Physics-based paddle separation — equal and opposite nudge
// Runs after ALL paddles have moved. Resolves overlaps with equal push on both.
function resolvePaddleCollisions() {
    // Soft phase gives the “nudge” feel; hard phase guarantees no overlap.
    const softIterations = 8;
    const hardIterations = 4;
    const softPushCap = 0.22; // max nudge per paddle per pair per pass

    const separate = (a, b, minDist, pushCap) => {
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist >= minDist) return;

        let nx, nz;
        if (dist < 0.001) {
            const angle = Math.random() * Math.PI * 2;
            nx = Math.cos(angle);
            nz = Math.sin(angle);
        } else {
            nx = dx / dist;
            nz = dz / dist;
        }

        const overlap = minDist - dist;
        let push = overlap / 2;
        if (typeof pushCap === 'number') push = Math.min(push, pushCap);

        a.position.x += nx * push;
        a.position.z += nz * push;
        b.position.x -= nx * push;
        b.position.z -= nz * push;

        a.position.x = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, a.position.x));
        a.position.z = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, a.position.z));
        b.position.x = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, b.position.x));
        b.position.z = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, b.position.z));
    };

    for (let iter = 0; iter < softIterations; iter++) {
        for (let i = 0; i < paddles.length; i++) {
            if (!players[i].alive) continue;
            for (let j = i + 1; j < paddles.length; j++) {
                if (!players[j].alive) continue;

                const a = paddles[i];
                const b = paddles[j];
                const minDist = a.paddleRadius + b.paddleRadius + 0.3;
                separate(a, b, minDist, softPushCap);
            }
        }
    }

    // Hard enforcement: remove any remaining overlap (rare, but can happen with many paddles).
    for (let iter = 0; iter < hardIterations; iter++) {
        for (let i = 0; i < paddles.length; i++) {
            if (!players[i].alive) continue;
            for (let j = i + 1; j < paddles.length; j++) {
                if (!players[j].alive) continue;

                const a = paddles[i];
                const b = paddles[j];
                const minDist = a.paddleRadius + b.paddleRadius + 0.3;
                separate(a, b, minDist, null);
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Update reflection cubemap intermittently (expensive: 6 renders)
    __reflectFrame++;
    if (reflectCubeCam && renderer && scene && gameActive && !gamePaused && (__reflectFrame % REFLECTION_UPDATE_EVERY === 0)) {
        reflectCubeCam.position.set(0, 0, 0);
        reflectCubeCam.update(renderer, scene);
    }

    if (!gameActive || gamePaused) {
        renderer.render(scene, camera);
        return;
    }

    const isMulti = gameMode.startsWith('multi');

    if (isMulti) updateAIPaddles();

    // Resolve paddle overlaps — equal and opposite nudge, every frame
    resolvePaddleCollisions();

    // Brick actual half-dimensions (no ball radius padding — we do sphere-AABB properly)
    const brickHW = (PHI * 3) / 2;   // half width  ≈ 2.427
    const brickHH = 0.5;              // half height = 0.5
    const brickHD = (PHI * 3) / 2;   // half depth  ≈ 2.427

    // Top 2 layers Y range (for hard mode speed boost)
    const ceilingGap = PHI * PHI * PHI;
    const topLayerY = HALF_H - ceilingGap - 0.5;
    const layer2Y = topLayerY - (1.0 + 0.15);

    // Update each ball
    balls.forEach(b => {
        if (!b.alive) return;

        // Free-flight energy bleed (walls/ceiling restore energy)
        b.baseSpeed *= BC.DRAG;
        if (b.baseSpeed < BC.MIN_SPEED) b.baseSpeed = BC.MIN_SPEED;

        // Magnus effect: spin curves the ball's trajectory
        // Force = spin × velocity (cross product)
        if (b.spin && b.spin.lengthSq() > 0.0001) {
            const magnus = new THREE.Vector3().crossVectors(b.spin, b.velocity);
            magnus.multiplyScalar(BC.MAGNUS);
            b.velocity.add(magnus);

            // Spin decays over time (air friction)
            b.spin.multiplyScalar(BC.SPIN_DECAY);

            // Visual: rotate ball mesh based on spin
            b.rotation.x += b.spin.x * 0.1;
            b.rotation.y += b.spin.y * 0.1;
            b.rotation.z += b.spin.z * 0.1;
        }

        // Gravity adds a visible arc
        b.velocity.y -= BC.GRAVITY;

        // Turbulence adds small unpredictable curving so trajectories aren't precomputable
        if (b.turbulence && b.turbulence > 0.00001) {
            b.velocity.x += (Math.random() - 0.5) * b.turbulence;
            b.velocity.z += (Math.random() - 0.5) * b.turbulence;
            b.velocity.y += (Math.random() - 0.5) * (b.turbulence * 0.22);
            b.turbulence *= BC.TURB_DECAY;
        }

        // Clamp to the current energy (baseSpeed)
        clampBallEnergyAndSpeed(b);

        b.position.add(b.velocity);

        // Side wall bounces — reflect + impart spin from tangential velocity
        let wallHit = false;
        let ceilingHit = false;
        if (b.position.x > WALL_INNER) {
            b.position.x = WALL_INNER; b.velocity.x *= -1;
            // Wall normal is (-1,0,0), tangential is Y and Z
            b.spin.y += b.velocity.z * BC.SPIN_TRANSFER;
            b.spin.z -= b.velocity.y * BC.SPIN_TRANSFER;
            wallHit = true;
        }
        if (b.position.x < -WALL_INNER) {
            b.position.x = -WALL_INNER; b.velocity.x *= -1;
            b.spin.y -= b.velocity.z * BC.SPIN_TRANSFER;
            b.spin.z += b.velocity.y * BC.SPIN_TRANSFER;
            wallHit = true;
        }
        if (b.position.z > WALL_INNER) {
            b.position.z = WALL_INNER; b.velocity.z *= -1;
            b.spin.y -= b.velocity.x * BC.SPIN_TRANSFER;
            b.spin.x += b.velocity.y * BC.SPIN_TRANSFER;
            wallHit = true;
        }
        if (b.position.z < -WALL_INNER) {
            b.position.z = -WALL_INNER; b.velocity.z *= -1;
            b.spin.y += b.velocity.x * BC.SPIN_TRANSFER;
            b.spin.x -= b.velocity.y * BC.SPIN_TRANSFER;
            wallHit = true;
        }

        // Ceiling — reverses Y to downward, imparts spin from tangential
        if (b.position.y > HALF_H - 1) {
            b.position.y = HALF_H - 1;
            b.velocity.y = -Math.abs(b.velocity.y);
            // Ceiling normal is (0,-1,0), tangential is X and Z
            b.spin.x += b.velocity.z * BC.SPIN_TRANSFER;
            b.spin.z -= b.velocity.x * BC.SPIN_TRANSFER;
            ceilingHit = true;

            // Ceiling restores energy so balls keep reaching bricks
            b.baseSpeed = Math.min(BC.MAX_SPEED, b.baseSpeed * BC.CEILING_BOOST + BC.CEILING_BOOST_ADD);
            b.turbulence = Math.min(BC.TURB_MAX, (b.turbulence || 0) + BC.TURB_WALL);
            BB.nudge(b.velocity, BC.WALL_DEFLECT);

            // Reduce the paddle of whoever last touched this ball by golden ratio (.618)
            // ONLY the first time a paddle gets hit by this penalty
            const owner = paddles[b.lastTouchedBy];
            if (owner && !owner.ceilingPenaltyApplied) {
                owner.paddleRadius = owner.baseRadius * 0.618;
                owner.scale.multiplyScalar(0.618);
                owner.ceilingPenaltyApplied = true;
            }

            clampBallEnergyAndSpeed(b);
        }

        if (!ceilingHit && wallHit) {
            // Walls re-energize, but less than the ceiling
            b.baseSpeed = Math.min(BC.MAX_SPEED, b.baseSpeed * BC.WALL_BOOST + BC.WALL_BOOST_ADD);
            b.turbulence = Math.min(BC.TURB_MAX, (b.turbulence || 0) + BC.TURB_WALL);
            BB.nudge(b.velocity, BC.WALL_DEFLECT);
            clampBallEnergyAndSpeed(b);
        }

        // Paddle collision — flat disk deflection
        if (b.velocity.y < 0) {
            let deflected = false;
            for (let i = 0; i < paddles.length; i++) {
                if (!players[i].alive) continue;
                const paddle = paddles[i];

                const thicknessY = PADDLE_THICKNESS * ((paddle.scale && typeof paddle.scale.y === 'number') ? paddle.scale.y : 1);
                const topY = paddle.position.y + thicknessY * 0.5;
                if (b.position.y > topY + BALL_RADIUS + 0.35) continue;

                const dx = b.position.x - paddle.position.x;
                const dz = b.position.z - paddle.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                const pR = paddle.paddleRadius;
                if (dist < pR + BALL_RADIUS) {
                    // Paddle re-energizes the ball: always enough to reach the ceiling if unobstructed
                    const launch = isMulti ? BC.PADDLE_LAUNCH_MULTI : (gameMode === 'easy' ? BC.PADDLE_LAUNCH_EASY : BC.PADDLE_LAUNCH_HARD);
                    b.baseSpeed = Math.max(b.baseSpeed, launch);

                    // Aim upward with a controllable horizontal component based on hit offset
                    const upBias = 1.35;
                    let dirX = 0, dirZ = 0;
                    if (dist > 0.001) {
                        dirX = dx / dist;
                        dirZ = dz / dist;
                    }
                    b.velocity.set(
                        dirX * 0.75 + b.velocity.x * 0.25,
                        upBias,
                        dirZ * 0.75 + b.velocity.z * 0.25
                    );

                    // Slight randomness so repeated hits don't create a deterministic loop
                    BB.nudge(b.velocity, 0.018);

                    // Transfer spin from tangential components
                    b.spin.x += b.velocity.z * BC.SPIN_TRANSFER;
                    b.spin.z -= b.velocity.x * BC.SPIN_TRANSFER;

                    clampBallEnergyAndSpeed(b);

                    // Place ball just above the paddle surface
                    b.position.y = topY + BALL_RADIUS + 0.02;

                    // Hitting the paddle calms turbulence (clean "launch")
                    b.turbulence = Math.max(0, (b.turbulence || 0) * 0.35);

                    // The ball now belongs to this player (it becomes their color, their life is at risk)
                    if (isMulti) {
                        b.belongsTo = i;
                        b.liabilityOwner = i;
                        b.material.color.setHex(PLAYER_COLORS[i]);
                        b.material.emissive.setHex(PLAYER_COLORS[i]);
                        b.material.emissiveIntensity = 0.5;
                    }
                    b.lastTouchedBy = i;

                    deflected = true;
                    break;
                }
            }

            // Ball fell through
            if (!deflected && b.position.y < (-HALF_H - 1)) {
                if (isMulti) {
                    // Multiplayer: ONLY the liable player loses a life; other players unaffected.
                    const liable = (typeof b.liabilityOwner === 'number' && b.liabilityOwner >= 0) ? b.liabilityOwner : -1;

                    // Remove the fallen ball
                    b.alive = false;
                    b.visible = false;
                    scene.remove(b);

                    if (liable >= 0 && players[liable] && players[liable].alive) {
                        players[liable].lives = Math.max(0, (players[liable].lives || 0) - 1);

                        if (players[liable].lives <= 0) {
                            // Eliminate the player (remove their paddle)
                            players[liable].alive = false;
                            const pad = paddles[liable];
                            if (pad) {
                                pad.visible = false;
                                scene.remove(pad);
                            }

                            // Remove any remaining balls liable to this player
                            balls.forEach(bl => {
                                if (!bl.alive) return;
                                if (bl.liabilityOwner === liable) {
                                    bl.alive = false;
                                    bl.visible = false;
                                    scene.remove(bl);
                                }
                            });
                        } else {
                            // Respawn a fresh neutral ball liable to that player
                            spawnBall(liable, BC.SPEED_MULTI, true);
                        }
                    }

                    // Game over when <= 1 player remains alive
                    const alivePlayers = players.filter(pl => pl.alive);
                    if (alivePlayers.length <= 1) {
                        let best = players[0];
                        for (let pl of players) if (pl.score > best.score) best = pl;
                        if (alivePlayers.length === 1) {
                            const winner = alivePlayers[0];
                            endGame(`Player ${winner.id + 1} wins! (${winner.score} pts)`);
                        } else {
                            endGame(`Game over! Player ${best.id + 1} wins with ${best.score} pts!`);
                        }
                    }
                } else {
                    // Solo play: standard life loss
                    players[0].lives--;
                    b.alive = false;
                    b.visible = false;
                    scene.remove(b);
                    if (players[0].lives <= 0) {
                        endGame('Game Over');
                    } else {
                        // Respawn a new ball
                        const spd = gameMode === 'easy' ? BC.SPEED_EASY : BC.SPEED_HARD;
                        spawnBall(0, spd, false);
                    }
                }
            }
        }

        // Brick collision — sphere vs AABB with proper surface normal
        // Faces → clean reflection, edges → diagonal deflection, corners → ball sent back
        let hitBrick = false;
        bricks.forEach(brick => {
            if (hitBrick || !brick.visible) return;

            // Find the closest point on the brick AABB to the ball center
            const bx = brick.position.x, by = brick.position.y, bz = brick.position.z;
            const closestX = Math.max(bx - brickHW, Math.min(bx + brickHW, b.position.x));
            const closestY = Math.max(by - brickHH, Math.min(by + brickHH, b.position.y));
            const closestZ = Math.max(bz - brickHD, Math.min(bz + brickHD, b.position.z));

            // Distance from ball center to closest point on brick
            const dx = b.position.x - closestX;
            const dy = b.position.y - closestY;
            const dz = b.position.z - closestZ;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < BALL_RADIUS * BALL_RADIUS) {
                // Contact! Compute surface normal at the hit point
                const dist = Math.sqrt(distSq);
                let nx, ny, nz;

                if (dist < 0.001) {
                    // Ball center is inside brick — use velocity to push out
                    nx = -b.velocity.x;
                    ny = -b.velocity.y;
                    nz = -b.velocity.z;
                    const vLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
                    nx /= vLen; ny /= vLen; nz /= vLen;
                } else {
                    // Normal from closest point on brick surface to ball center
                    // This naturally blends axes for edge/corner hits:
                    //   Face hit:   normal is (1,0,0), (0,1,0), or (0,0,1)
                    //   Edge hit:   normal is diagonal (1,1,0), (1,0,1), etc
                    //   Corner hit: normal is (1,1,1) — sends ball back the way it came
                    nx = dx / dist;
                    ny = dy / dist;
                    nz = dz / dist;
                }

                // Reflect velocity across the surface normal: v' = v - 2(v·n)n
                const dot = b.velocity.x * nx + b.velocity.y * ny + b.velocity.z * nz;
                b.velocity.x -= 2 * dot * nx;
                b.velocity.y -= 2 * dot * ny;
                b.velocity.z -= 2 * dot * nz;

                // Push ball out of brick
                const penetration = BALL_RADIUS - dist;
                b.position.x += nx * penetration;
                b.position.y += ny * penetration;
                b.position.z += nz * penetration;

                brick.visible = false;
                hitBrick = true;

                // Points go to whoever last touched the ball
                if (typeof b.lastTouchedBy === 'number' && b.lastTouchedBy >= 0 && players[b.lastTouchedBy]) {
                    players[b.lastTouchedBy].score += 100;
                }

                // Bricks absorb energy; higher-energy impacts get absorbed more.
                const speedFactor = Math.max(0, b.baseSpeed - BC.MIN_SPEED);
                const absorb = THREE.MathUtils.clamp(
                    BC.BRICK_ABSORB - speedFactor * BC.BRICK_ABSORB_SF,
                    0.90,
                    BC.BRICK_ABSORB
                );
                b.baseSpeed *= absorb;

                // Extra randomness on brick hits so the AI can't precompute a clean trajectory
                b.turbulence = Math.min(BC.TURB_MAX, (b.turbulence || 0) + BC.TURB_BRICK);
                BB.nudge(b.velocity, BC.BRICK_DEFLECT);

                // Layer boost (non-multiplicative): only when reaching a higher brick layer for the first time.
                // Higher bricks are smaller layer indices (layer 0 is highest).
                const prevHighest = (typeof b.highestLayerReached === 'number') ? b.highestLayerReached : (LAYER_BOOST.length - 1);
                if (typeof brick.layer === 'number' && brick.layer < prevHighest) {
                    b.highestLayerReached = brick.layer;
                    const boost = LAYER_BOOST[brick.layer] || 1;
                    const layerFactor = 1 + (boost - 1) * 0.35;
                    const baseline = (typeof b.spawnBaseSpeed === 'number') ? b.spawnBaseSpeed : b.baseSpeed;
                    const target = Math.min(BC.MAX_SPEED, baseline * layerFactor);
                    b.baseSpeed = Math.max(b.baseSpeed, target);
                }

                // Never allow energy to fall below the safe minimum
                if (b.baseSpeed < BC.MIN_SPEED) b.baseSpeed = BC.MIN_SPEED;
                clampBallEnergyAndSpeed(b);
            }
        });
    });

    // Ball-ball collisions — elastic along contact normal, preserve each ball's speed
    for (let i = 0; i < balls.length; i++) {
        if (!balls[i].alive) continue;
        for (let j = i + 1; j < balls.length; j++) {
            if (!balls[j].alive) continue;
            const d = balls[i].position.distanceTo(balls[j].position);
            if (d < BALL_RADIUS * 2) {
                const a = balls[i], b = balls[j];

                // Contact normal from b to a
                const nx = (a.position.x - b.position.x) / (d || 0.001);
                const ny = (a.position.y - b.position.y) / (d || 0.001);
                const nz = (a.position.z - b.position.z) / (d || 0.001);

                // Relative velocity along normal
                const dvx = a.velocity.x - b.velocity.x;
                const dvy = a.velocity.y - b.velocity.y;
                const dvz = a.velocity.z - b.velocity.z;
                const dvDotN = dvx * nx + dvy * ny + dvz * nz;

                // Only resolve if approaching
                if (dvDotN < 0) {
                    // Exchange normal component (equal mass elastic)
                    a.velocity.x -= dvDotN * nx;
                    a.velocity.y -= dvDotN * ny;
                    a.velocity.z -= dvDotN * nz;
                    b.velocity.x += dvDotN * nx;
                    b.velocity.y += dvDotN * ny;
                    b.velocity.z += dvDotN * nz;

                    // Preserve each ball's individual speed (forward momentum)
                    const spdA = a.velocity.length();
                    const spdB = b.velocity.length();
                    if (spdA > 0.001) a.velocity.multiplyScalar(a.baseSpeed / spdA);
                    if (spdB > 0.001) b.velocity.multiplyScalar(b.baseSpeed / spdB);
                }

                // Separate balls
                const overlap = BALL_RADIUS * 2 - d;
                a.position.x += nx * overlap / 2;
                a.position.y += ny * overlap / 2;
                a.position.z += nz * overlap / 2;
                b.position.x -= nx * overlap / 2;
                b.position.y -= ny * overlap / 2;
                b.position.z -= nz * overlap / 2;
            }
        }
    }

    // Check win
    if (bricks.every(b => !b.visible)) {
        if (gameMode.startsWith('multi')) {
            let best = players[0];
            for (let p of players) if (p.score > best.score) best = p;
            endGame(`Player ${best.id + 1} wins with ${best.score} pts!`);
        } else {
            endGame('All bricks cleared!');
        }
    }

    updateHUD();
    renderer.render(scene, camera);
}

function updateHUD() {
    const hud = document.getElementById('hud');
    const isMulti = gameMode.startsWith('multi');

    if (isMulti) {
        hud.innerHTML = players.map((p, i) => {
            const colorHex = '#' + PLAYER_COLORS[i].toString(16).padStart(6, '0');
            const status = p.alive ? '' : ' (OUT)';
            const lives = typeof p.lives === 'number' ? p.lives : 0;
            return `<div style="color:${colorHex}">${i === 0 ? 'YOU' : `P${i + 1}`}: ${p.score} • ${lives} lives${status}</div>`;
        }).join('');
    } else {
        const p = players[0];
        hud.innerHTML =
            `<div>Score: ${p ? p.score : 0}</div>` +
            `<div>Balls: ${p ? p.lives : 0}</div>`;
    }
}

function endGame(msg) {
    gameActive = false;
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    if (msg) {
        // Brief flash of result
        const hud = document.getElementById('hud');
        hud.style.display = 'block';
        hud.innerHTML = `<div style="font-size:24px;color:#ffcc00">${msg}</div>`;
        setTimeout(() => { hud.style.display = 'none'; }, 4000);
    }
}

// Initialize on load
window.addEventListener('load', () => {
    initScene();
    animate();

    // ── MANIFOLD BRIDGE ───────────────────────────────────────────
    if (typeof ManifoldBridge !== 'undefined') {
        ManifoldBridge.init({
            id: 'brickbreaker3d',
            version: '1.0.0',
            x: 2,
            y: 22,
            exposes: () => ({
                gameActive,
                gamePaused,
                mode: gameMode,
                playerCount: players.length,
                scores: players.map(p => ({ id: p.id, score: p.score, alive: p.alive })),
            }),
        });
    }
});

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { gamePaused = !gamePaused; e.preventDefault(); }
    if (e.code === 'Escape') endGame();
});
