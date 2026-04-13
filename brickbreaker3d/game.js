// BrickBreaker3D - Manifold Audio Edition
// Complete 3D game engine with physics and rendering

let scene, camera, renderer, controls;
let gameActive = false, gamePaused = false;
let gameMode = 'easy'; // 'easy', 'hard', 'multi2', 'multi3', 'multi4'
let raycaster, floorPlane;

// Game objects
let balls = [], paddles = [], bricks = [], players = [];

const BRICK_COLORS = { red: 0xcc2222, orange: 0xcc7700, yellow: 0xbbbb00, green: 0x22aa22 };
const PLAYER_COLORS = [0x00ccff, 0xff3366, 0x39ff14, 0xffaa00]; // cyan, pink, green, orange
const COLORS = { cyan: 0x00ffff, dark: 0x0a0a1a };
const PHI = 1.618;
const BALL_RADIUS = 1;
const PADDLE_RADIUS = 4.5;

// Ball speeds
const SPEED_EASY = 0.25;
const SPEED_HARD = 0.4;
const SPEED_MULTI = 0.3;
// Spin physics constants
const MAGNUS_STRENGTH = 0.002;  // how much spin curves the ball per frame
const SPIN_DECAY = 0.998;       // spin friction per frame (slow decay)
const SPIN_TRANSFER = 0.3;     // how much tangential collision force becomes spin

// Golden ratio speed boosts per brick layer (bottom→top = mild→intense)
// Layer 3 (green): φ^0.25 ≈ 1.12, Layer 2 (yellow): φ^0.5 ≈ 1.27
// Layer 1 (orange): φ^0.75 ≈ 1.44, Layer 0 (red): φ^1 ≈ 1.618
const LAYER_BOOST = [
    Math.pow(PHI, 1.0),   // red:    ×1.618
    Math.pow(PHI, 0.75),  // orange: ×1.44
    Math.pow(PHI, 0.5),   // yellow: ×1.27
    Math.pow(PHI, 0.25)   // green:  ×1.12
];

// Dynamic arena dimensions — wider with more paddles, height stays fixed
const ARENA_HEIGHT = 50;  // always 50 tall
let ARENA_WIDTH = 50;     // X and Z — grows with player count
let HALF_H = 25;          // half height (constant)
let HALF_W = 25;          // half width (dynamic)
let WALL_INNER = 24;      // ball bounce boundary
let PADDLE_Y = -24.5;     // paddle Y position
let PADDLE_BOUND = 20;    // paddle movement clamp

function setArenaSize(numPlayers) {
    // 1 player: 50, 2: 60, 3: 70, 4: 80
    ARENA_WIDTH = 50 + (numPlayers - 1) * 10;
    HALF_W = ARENA_WIDTH / 2;
    WALL_INNER = HALF_W - 1;
    PADDLE_BOUND = HALF_W - 5;
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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 60, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-10, 0, 50);
    scene.add(fillLight);

    createStarfield();

    // Build initial arena for solo
    buildArena(1);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
}

// Build/rebuild arena for given player count
function buildArena(numPlayers) {
    // Remove old arena objects
    arenaObjects.forEach(obj => scene.remove(obj));
    arenaObjects = [];
    bricks.forEach(b => scene.remove(b));
    bricks = [];

    setArenaSize(numPlayers);

    // Update camera to see full arena
    camera.position.set(0, -2, ARENA_WIDTH * 1.6);
    controls.target.set(0, -3, 0);

    createArenaWalls();
    createFloor();
    createBricks();
}

function createFloor() {
    const geo = new THREE.PlaneGeometry(ARENA_WIDTH - 0.2, ARENA_WIDTH - 0.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xddeeff, roughness: 0.6, metalness: 0.1 });
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
        color: 0x88ccff, transparent: true, opacity: 0.12,
        roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide
    });

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
        scene.add(wall);
        arenaObjects.push(wall);
    });
}

function createBricks() {
    const colors = [BRICK_COLORS.red, BRICK_COLORS.orange, BRICK_COLORS.yellow, BRICK_COLORS.green];

    // Fit bricks to arena width — compute how many fit
    const gap = 0.15;
    const brickH = 1.0;
    const brickW = PHI * 3;                           // ≈ 4.854
    const brickD = brickW;
    const gridSpacing = brickW + gap;
    const layerStride = brickH + gap;
    const ceilingGap = PHI * PHI * PHI;               // ≈ 4.236
    const topLayerY = HALF_H - ceilingGap - brickH / 2;

    // Number of bricks that fit across the arena width
    const numAcross = Math.floor(ARENA_WIDTH / gridSpacing);
    const offset = (numAcross - 1) * gridSpacing / 2; // center the grid

    for (let layer = 0; layer < 4; layer++) {
        const yPos = topLayerY - layer * layerStride;
        for (let row = 0; row < numAcross; row++) {
            for (let col = 0; col < numAcross; col++) {
                const geo = new THREE.BoxGeometry(brickW, brickH, brickD);
                const mat = new THREE.MeshPhysicalMaterial({
                    color: colors[layer],
                    transparent: true,
                    opacity: 0.7,
                    roughness: 0.05,
                    metalness: 0.15,
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.05
                });
                const brick = new THREE.Mesh(geo, mat);
                brick.castShadow = true;
                brick.receiveShadow = true;
                brick.position.set(
                    col * gridSpacing - offset,
                    yPos,
                    row * gridSpacing - offset
                );
                brick.health = 1;
                brick.layer = layer; // track which layer for speed boost
                scene.add(brick);
                bricks.push(brick);
            }
        }
    }
}

function setupPlayers() {
    // Clean up old objects
    balls.forEach(b => scene.remove(b));
    paddles.forEach(p => scene.remove(p));
    balls = []; paddles = []; players = [];

    const isMulti = gameMode.startsWith('multi');
    const numPlayers = isMulti ? parseInt(gameMode.slice(5)) : 1;
    const numBalls = isMulti ? numPlayers : 1; // solo = 1 ball at a time
    const baseSpeed = isMulti ? SPEED_MULTI : (gameMode === 'easy' ? SPEED_EASY : SPEED_HARD);
    const lives = isMulti ? 1 : (gameMode === 'easy' ? 5 : 3);

    // Create players
    for (let i = 0; i < numPlayers; i++) {
        players.push({ id: i, score: 0, alive: true, color: PLAYER_COLORS[i], lives });
    }

    // Paddle size scales down with more players
    // 1p: 4.5, 2p: 3.8, 3p: 3.2, 4p: 2.8
    const basePaddleRadius = PADDLE_RADIUS - (numPlayers - 1) * 0.6;

    // Create paddles
    const startPositions = [
        [0, 0], [-10, -10], [10, 10], [-10, 10]
    ];
    for (let i = 0; i < numPlayers; i++) {
        // Hemisphere paddle — half sphere sitting on the floor
        const geo = new THREE.SphereGeometry(basePaddleRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
            color: PLAYER_COLORS[i],
            metalness: 0.3,
            roughness: 0.4
        });
        const p = new THREE.Mesh(geo, mat);
        p.castShadow = true;
        p.receiveShadow = true;

        // Semi-oval paddle: take away .618 of height (Y = 1 - 0.618 = 0.382), Z = 0.618, X = 1
        p.scale.set(1, 0.382, 0.618);

        p.position.set(startPositions[i][0], PADDLE_Y, startPositions[i][1]);
        p.playerId = i;
        p.paddleRadius = basePaddleRadius;
        p.baseRadius = basePaddleRadius;
        p.ceilingPenaltyApplied = false;
        scene.add(p);
        paddles.push(p);
    }

    // Create balls
    for (let i = 0; i < numBalls; i++) {
        spawnBall(i % numPlayers, baseSpeed, isMulti);
    }
}

function spawnBall(ownerIdx, baseSpeed, isMulti) {
    // In multiplayer each player owns their ball from the start
    const color = isMulti ? PLAYER_COLORS[ownerIdx] : 0xcccccc;
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.2 });
    if (isMulti) { mat.emissive = new THREE.Color(PLAYER_COLORS[ownerIdx]); mat.emissiveIntensity = 0.5; }
    const b = new THREE.Mesh(geo, mat);
    b.castShadow = true;
    b.receiveShadow = true;

    const angle = Math.random() * Math.PI * 2;
    const vx = Math.sin(angle) * baseSpeed * 0.6;
    const vz = Math.cos(angle) * baseSpeed * 0.4;
    b.velocity = new THREE.Vector3(vx, baseSpeed, vz);

    // Spawn near owner's paddle position (or center for solo)
    if (isMulti) {
        const startPositions = [[0, 0], [-10, -10], [10, 10], [-10, 10]];
        const sp = startPositions[ownerIdx] || [0, 0];
        b.position.set(sp[0] + (Math.random() - 0.5) * 4, -10, sp[1] + (Math.random() - 0.5) * 4);
    } else {
        const offset = new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
        b.position.set(0, -10, 0).add(offset);
    }

    b.belongsTo = isMulti ? ownerIdx : -1;
    b.lastTouchedBy = ownerIdx;
    b.owner = ownerIdx;          // kept for AI compatibility
    b.alive = true;
    b.baseSpeed = baseSpeed;
    b.maxLayerHit = -1;          // tracks highest brick layer hit for one-time acceleration
    b.spin = new THREE.Vector3(0, 0, 0); // angular velocity (spin axis × magnitude)
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

        // Priority 1: Save MY ball (the one that belongs to me) if it's falling
        const myBall = balls.find(b => b.alive && b.belongsTo === i && b.velocity.y < 0);
        if (myBall) {
            const t = Math.abs(myBall.position.y - (-HALF_H + 2)) / (Math.abs(myBall.velocity.y) || 0.1);
            targetX = myBall.position.x + myBall.velocity.x * t;
            targetZ = myBall.position.z + myBall.velocity.z * t;

            // But if another ball I don't own is closer and I can steal it, go for that
            const myDist = Math.sqrt(
                Math.pow(targetX - p.position.x, 2) + Math.pow(targetZ - p.position.z, 2)
            );

            // Priority 2: Steal someone else's falling ball if it's closer
            let stealBall = null, stealDist = myDist;
            balls.forEach(b => {
                if (!b.alive || b.owner === i || b.velocity.y >= 0) return;
                const st = Math.abs(b.position.y - (-HALF_H + 2)) / (Math.abs(b.velocity.y) || 0.1);
                const sx = b.position.x + b.velocity.x * st;
                const sz = b.position.z + b.velocity.z * st;
                const sd = Math.sqrt(Math.pow(sx - p.position.x, 2) + Math.pow(sz - p.position.z, 2));
                if (sd < stealDist * 0.7) { // only steal if significantly closer
                    stealBall = b; stealDist = sd;
                    targetX = sx; targetZ = sz;
                }
            });
        } else {
            // No own ball falling — look for any ball to intercept or block an opponent

            // Priority 3: Intercept any falling ball I can reach
            let bestBall = null, bestTime = Infinity;
            balls.forEach(b => {
                if (!b.alive || b.velocity.y >= 0) return;
                const t = Math.abs(b.position.y - (-HALF_H + 2)) / (Math.abs(b.velocity.y) || 0.1);
                const lx = b.position.x + b.velocity.x * t;
                const lz = b.position.z + b.velocity.z * t;
                const d = Math.sqrt(Math.pow(lx - p.position.x, 2) + Math.pow(lz - p.position.z, 2));
                const reachTime = d / 5; // rough paddle speed estimate
                if (reachTime < t && t < bestTime) {
                    bestTime = t; bestBall = b;
                    targetX = lx; targetZ = lz;
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
                    const rivalBall = balls.find(b => b.alive && b.belongsTo === rivalIdx && b.velocity.y < 0);
                    if (rivalBall) {
                        // Block between rival paddle and their ball's landing
                        const t = Math.abs(rivalBall.position.y - (-HALF_H + 2)) /
                            (Math.abs(rivalBall.velocity.y) || 0.1);
                        const landX = rivalBall.position.x + rivalBall.velocity.x * t;
                        const landZ = rivalBall.position.z + rivalBall.velocity.z * t;
                        targetX = (rivalPaddle.position.x + landX) / 2;
                        targetZ = (rivalPaddle.position.z + landZ) / 2;
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
        maxSpeed *= 0.95;

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
    const iterations = 5; // multiple passes for stability
    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < paddles.length; i++) {
            if (!players[i].alive) continue;
            for (let j = i + 1; j < paddles.length; j++) {
                if (!players[j].alive) continue;

                const a = paddles[i];
                const b = paddles[j];
                const minDist = a.paddleRadius + b.paddleRadius + 0.3;

                const dx = a.position.x - b.position.x;
                const dz = a.position.z - b.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < minDist) {
                    let nx, nz;
                    if (dist < 0.001) {
                        // Exactly overlapping — push in random direction
                        const angle = Math.random() * Math.PI * 2;
                        nx = Math.cos(angle);
                        nz = Math.sin(angle);
                    } else {
                        nx = dx / dist;
                        nz = dz / dist;
                    }

                    // Equal push — each paddle gets nudged half the overlap
                    const overlap = minDist - dist;
                    const push = overlap / 2;

                    a.position.x += nx * push;
                    a.position.z += nz * push;
                    b.position.x -= nx * push;
                    b.position.z -= nz * push;

                    // Clamp to bounds
                    a.position.x = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, a.position.x));
                    a.position.z = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, a.position.z));
                    b.position.x = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, b.position.x));
                    b.position.z = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, b.position.z));
                }
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

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

        // Magnus effect: spin curves the ball's trajectory
        // Force = spin × velocity (cross product)
        if (b.spin && b.spin.lengthSq() > 0.0001) {
            const magnus = new THREE.Vector3().crossVectors(b.spin, b.velocity);
            magnus.multiplyScalar(MAGNUS_STRENGTH);
            b.velocity.add(magnus);

            // Renormalize speed so spin only changes direction, not speed
            const spd = b.velocity.length();
            if (spd > 0.001) b.velocity.multiplyScalar(b.baseSpeed / spd);

            // Spin decays over time (air friction)
            b.spin.multiplyScalar(SPIN_DECAY);

            // Visual: rotate ball mesh based on spin
            b.rotation.x += b.spin.x * 0.1;
            b.rotation.y += b.spin.y * 0.1;
            b.rotation.z += b.spin.z * 0.1;
        }

        b.position.add(b.velocity);

        // Side wall bounces — reflect + impart spin from tangential velocity
        let wallHit = false;
        if (b.position.x > WALL_INNER) {
            b.position.x = WALL_INNER; b.velocity.x *= -1;
            // Wall normal is (-1,0,0), tangential is Y and Z
            b.spin.y += b.velocity.z * SPIN_TRANSFER;
            b.spin.z -= b.velocity.y * SPIN_TRANSFER;
            wallHit = true;
        }
        if (b.position.x < -WALL_INNER) {
            b.position.x = -WALL_INNER; b.velocity.x *= -1;
            b.spin.y -= b.velocity.z * SPIN_TRANSFER;
            b.spin.z += b.velocity.y * SPIN_TRANSFER;
            wallHit = true;
        }
        if (b.position.z > WALL_INNER) {
            b.position.z = WALL_INNER; b.velocity.z *= -1;
            b.spin.y -= b.velocity.x * SPIN_TRANSFER;
            b.spin.x += b.velocity.y * SPIN_TRANSFER;
            wallHit = true;
        }
        if (b.position.z < -WALL_INNER) {
            b.position.z = -WALL_INNER; b.velocity.z *= -1;
            b.spin.y += b.velocity.x * SPIN_TRANSFER;
            b.spin.x -= b.velocity.y * SPIN_TRANSFER;
            wallHit = true;
        }

        // Ceiling — reverses Y to downward, imparts spin from tangential
        if (b.position.y > HALF_H - 1) {
            b.position.y = HALF_H - 1;
            b.velocity.y = -Math.abs(b.velocity.y);
            // Ceiling normal is (0,-1,0), tangential is X and Z
            b.spin.x += b.velocity.z * SPIN_TRANSFER;
            b.spin.z -= b.velocity.x * SPIN_TRANSFER;
            wallHit = true;

            // Reduce the paddle of whoever last touched this ball by golden ratio (.618)
            // ONLY the first time a paddle gets hit by this penalty
            const owner = paddles[b.lastTouchedBy];
            if (owner && !owner.ceilingPenaltyApplied) {
                owner.paddleRadius = owner.baseRadius * 0.618;
                owner.scale.multiplyScalar(0.618);
                owner.ceilingPenaltyApplied = true;
            }
        }

        // After any wall hit, renormalize to preserve speed
        if (wallHit) {
            const spd = b.velocity.length();
            if (spd > 0.001) b.velocity.multiplyScalar(b.baseSpeed / spd);
        }

        // Paddle collision — any paddle can deflect any ball
        if (b.position.y < (-HALF_H + 2) && b.velocity.y < 0) {
            let deflected = false;
            for (let i = 0; i < paddles.length; i++) {
                if (!players[i].alive) continue;
                const dx = b.position.x - paddles[i].position.x;
                // Paddle is scaled in Z by 0.618, so we normalize dz for distance check
                const dzNorm = (b.position.z - paddles[i].position.z) / 0.618;
                const distNorm = Math.sqrt(dx * dx + dzNorm * dzNorm);

                const pR = paddles[i].paddleRadius;
                if (distNorm < pR + BALL_RADIUS) {
                    // Semi-oval surface-normal reflection
                    // Calculate hit fraction using the normalized distance
                    const hitFraction = Math.min(distNorm / pR, 1.0);

                    // Base sphere normal
                    let nx = distNorm > 0.01 ? (dx / distNorm) * hitFraction : 0;
                    let nz = distNorm > 0.01 ? (dzNorm / distNorm) * hitFraction : 0;
                    let ny = Math.sqrt(Math.max(0, 1 - hitFraction * hitFraction));

                    // Scale normal for ellipsoid (divide by scale factors)
                    // Y scale = 0.382, Z scale = 0.618
                    ny /= 0.382;
                    nz /= 0.618;

                    // Normalize the surface normal
                    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
                    const snx = nx / nLen, sny = ny / nLen, snz = nz / nLen;

                    // Reflect velocity across the surface normal: v' = v - 2(v·n)n
                    const dot = b.velocity.x * snx + b.velocity.y * sny + b.velocity.z * snz;
                    b.velocity.x -= 2 * dot * snx;
                    b.velocity.y -= 2 * dot * sny;
                    b.velocity.z -= 2 * dot * snz;

                    // Ensure ball goes upward after paddle hit
                    if (b.velocity.y < 0) b.velocity.y = Math.abs(b.velocity.y);

                    // Add slight randomness for unpredictability
                    b.velocity.x += (Math.random() - 0.5) * 0.03;
                    b.velocity.z += (Math.random() - 0.5) * 0.03;

                    // Normalize to base speed
                    const spd = b.velocity.length();
                    b.velocity.multiplyScalar(b.baseSpeed / spd);
                    b.position.y = -HALF_H + 2;

                    // The ball now belongs to this player (it becomes their color, their life is at risk)
                    if (isMulti) {
                        b.belongsTo = i;
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
                    // Multiplayer: ball is permanently gone — not replaced
                    b.alive = false;
                    b.visible = false;
                    scene.remove(b);

                    // Check if all balls are gone → game over, highest score wins
                    const aliveBalls = balls.filter(bl => bl.alive);
                    if (aliveBalls.length === 0) {
                        let best = players[0];
                        for (let p of players) if (p.score > best.score) best = p;
                        endGame(`All balls lost! Player ${best.id + 1} wins with ${best.score} pts!`);
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
                        const spd = gameMode === 'easy' ? SPEED_EASY : SPEED_HARD;
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
                players[b.lastTouchedBy].score += 100;

                // Speed boost per brick layer — only apply the first time a ball reaches this layer
                if (brick.layer > b.maxLayerHit) {
                    b.maxLayerHit = brick.layer;
                    const boost = LAYER_BOOST[brick.layer] || 1;
                    b.baseSpeed *= boost;
                }
                const spd2 = b.velocity.length();
                if (spd2 > 0.001) b.velocity.multiplyScalar(b.baseSpeed / spd2);
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
        const aliveBalls = balls.filter(b => b.alive).length;
        const totalBalls = players.length;
        hud.innerHTML = players.map((p, i) => {
            const colorHex = '#' + PLAYER_COLORS[i].toString(16).padStart(6, '0');
            return `<div style="color:${colorHex}">${i === 0 ? 'YOU' : `P${i + 1}`}: ${p.score}</div>`;
        }).join('') + `<div style="color:#aaa;margin-top:4px">Balls: ${aliveBalls}/${totalBalls}</div>`;
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
});

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { gamePaused = !gamePaused; e.preventDefault(); }
    if (e.code === 'Escape') endGame();
});
