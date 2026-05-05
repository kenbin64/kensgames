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
// Manifold-driven constants (defaults below; overwritten from
// manifold.game.json `params` at window.load — see loadManifoldParams).
let REFLECTION_RES = 128;
let REFLECTION_UPDATE_EVERY = 8;

// Game objects
let balls = [], paddles = [], bricks = [], players = [];
// Transient wall-impact rings (created on every wall/ceiling bounce so the
// player sees where contact happened on the otherwise glassy surfaces).
let wallImpacts = [];
const IMPACT_LIFETIME = 0.42;     // seconds before the ring is removed
const IMPACT_GROW = 3.4;          // final radius multiplier over lifetime

const BRICK_COLORS = { red: 0xcc2222, orange: 0xcc7700, yellow: 0xbbbb00, green: 0x22aa22 };
const PLAYER_COLORS = [0x00ccff, 0xff3366, 0x39ff14, 0xffaa00]; // cyan, pink, green, orange
const COLORS = { cyan: 0x00ffff, dark: 0x0a0a1a };
let PHI = 1.618;
let BALL_RADIUS = 1;
let PADDLE_RADIUS = 4.5;
let PADDLE_THICKNESS = 0.85;
const PADDLE_BEVEL = 0.94; // top radius ratio to create a subtle bevel
const MOBILE_INPUT = {
    enabled: (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''))
        || (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 1024),
    touchActive: false,
    touchNormX: 0,
    tiltEnabled: false,
    tiltNormX: 0,
    tiltMode: 'paddle', // 'paddle' | 'camera'
    paddleTouchId: null,
    cameraTouchId: null,
    cameraTouchActive: false,
    tiltNormYaw: 0,
    tiltNormPitch: 0,
    tiltNeutralGamma: null,
    tiltNeutralBeta: null,
};

// Ball speeds (PHI-scaled — golden-ratio kick over the previous baseline so
// rallies feel snappier without breaking paddle reaction time).
let SPEED_EASY = 0.25 * PHI;   // ≈ 0.405
let SPEED_HARD = 0.4 * PHI;    // ≈ 0.647
let SPEED_MULTI = 0.3 * PHI;   // ≈ 0.485

// Ball dynamics (pseudo-physics)
// NOTE: Units are per-frame; tuned to keep the existing “feel” while adding arch + chaos.
const GRAVITY = 0.00075;              // downward acceleration (adds an arc)
const FREE_FLIGHT_DRAG = 0.99935;     // slow energy bleed (walls/ceiling restore)
let MIN_BALL_SPEED = 0.22 * PHI;    // ≈ 0.356 — scaled with base speeds so clamps don't pinch
let MAX_BALL_SPEED = 0.85 * PHI;    // ≈ 1.375 — scaled with base speeds so clamps don't pinch
const WALL_BOOST = 1.035;
const CEILING_BOOST = 1.06;
const WALL_BOOST_ADD = 0.004;
const CEILING_BOOST_ADD = 0.006;
const BRICK_ABSORB_BASE = 0.968;      // bricks absorb energy
const BRICK_ABSORB_SPEED_FACTOR = 0.08; // more energy => more absorption
const BRICK_DEFLECT = 0.030;          // random nudge on brick hits
const WALL_DEFLECT = 0.012;           // small random nudge on wall/ceiling hits
const TURBULENCE_DECAY = 0.987;
const TURBULENCE_MAX = 0.08;
const TURBULENCE_BRICK_ADD = 0.022;
const TURBULENCE_WALL_ADD = 0.010;

const PADDLE_LAUNCH_EASY = 0.34;
const PADDLE_LAUNCH_HARD = 0.42;
const PADDLE_LAUNCH_MULTI = 0.38;
const FINAL_LAYER_INDEX = 0;
const FINAL_LAYER_SPEED_MULT = 1.618; // speed up by 61.8% once per ball
const PADDLE_SHRINK_FACTOR = 0.618;

function fib1to4(n) {
    // Fibonacci starting at F1=1, F2=1
    switch (n) {
        case 1: return 1;
        case 2: return 1;
        case 3: return 2;
        case 4: return 3;
        default: return 1;
    }
}
// Spin physics constants
const MAGNUS_STRENGTH = 0.002;  // how much spin curves the ball per frame
const SPIN_DECAY = 0.998;       // spin friction per frame (slow decay)
const SPIN_TRANSFER = 0.3;     // how much tangential collision force becomes spin

function clampBallEnergyAndSpeed(ball) {
    if (!ball || !ball.velocity) return;
    ball.baseSpeed = THREE.MathUtils.clamp(ball.baseSpeed ?? SPEED_EASY, MIN_BALL_SPEED, MAX_BALL_SPEED);
    const spd = ball.velocity.length();
    if (spd > 0.0001) ball.velocity.multiplyScalar(ball.baseSpeed / spd);
}

function nudgeVelocity(ball, amount) {
    if (!ball || !ball.velocity) return;
    ball.velocity.x += (Math.random() - 0.5) * amount;
    ball.velocity.y += (Math.random() - 0.5) * (amount * 0.35);
    ball.velocity.z += (Math.random() - 0.5) * amount;
}

function setPaddlePenalty(playerIdx, isShrunk) {
    const paddle = paddles[playerIdx];
    if (!paddle) return;
    const ratio = isShrunk ? PADDLE_SHRINK_FACTOR : 1;
    paddle.paddleRadius = paddle.baseRadius * ratio;
    paddle.scale.x = ratio;
    paddle.scale.z = ratio;
}

function estimateTimeToY(ball, targetY) {
    // Solve: y(t) = y0 + vy*t - 0.5*g*t^2 = targetY
    // => 0.5*g*t^2 - vy*t + (targetY - y0) = 0
    const y0 = ball.position.y;
    const vy = ball.velocity.y;
    const a = 0.5 * GRAVITY;
    const b = -vy;
    const c = (targetY - y0);
    const disc = b * b - 4 * a * c;
    if (disc <= 0 || Math.abs(a) < 1e-9) {
        const denom = Math.abs(vy) > 1e-6 ? Math.abs(vy) : 1e-6;
        return Math.max(0, Math.abs(y0 - targetY) / denom);
    }
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b + sqrtD) / (2 * a);
    const t2 = (-b - sqrtD) / (2 * a);
    const t = Math.max(t1, t2);
    return Number.isFinite(t) && t > 0 ? t : 0;
}

// Legacy per-layer boosts replaced by final-layer one-time boost (see brick collision logic).

// Dynamic arena dimensions — wider with more paddles, height stays fixed
let ARENA_HEIGHT = 50;  // always 50 tall
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

function fitCameraToArena() {
    if (!camera || !controls) return;
    const aspect = Math.max(0.6, window.innerWidth / Math.max(1, window.innerHeight));
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const halfW = HALF_W + 6;
    const halfH = HALF_H + 6;
    const distByW = halfW / Math.tan(hFov / 2);
    const distByH = halfH / Math.tan(vFov / 2);
    const dist = Math.max(distByW, distByH, 48);
    camera.position.set(0, -2, dist);
    controls.target.set(0, -3, 0);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;

    // Manifold-derived PMREM env — supplies image-based lighting so PBR
    // bricks/balls read with depth even before the live CubeCamera primes.
    if (typeof ManifoldEnvironment !== 'undefined') {
        ManifoldEnvironment.bind(renderer, scene, { seed: 'brickbreaker', palette: 'arena', size: 64 });
    }

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
    // Mobile: we handle one-finger orbit with our own gesture zone so paddle and camera
    // controls never fight each other. Keep two-finger pinch zoom via OrbitControls.
    if (MOBILE_INPUT.enabled && THREE.TOUCH) {
        controls.touches = {
            ONE: THREE.TOUCH.NONE,
            TWO: THREE.TOUCH.DOLLY,
        };
    }

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
    if (MOBILE_INPUT.enabled) initMobileControls();
}

function initMobileControls() {
    if (document.getElementById('bb-mobile-controls')) return;

    const rotateCameraGesture = (dx, dy, mult = 0.005) => {
        if (!controls) return;
        controls.rotateLeft(dx * mult);
        controls.rotateUp(dy * mult);
        controls.update();
    };

    const wrap = document.createElement('div');
    wrap.id = 'bb-mobile-controls';
    wrap.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:140;display:flex;gap:8px;align-items:center;';
    const tiltBtn = document.createElement('button');
    tiltBtn.id = 'bb-tilt-btn';
    tiltBtn.textContent = 'TILT';
    tiltBtn.style.cssText = 'height:44px;padding:0 10px;border:1px solid rgba(0,255,204,.55);background:rgba(4,20,34,.82);color:#00ffcc;border-radius:10px;font:700 11px Rajdhani,sans-serif;';

    const gyroModeBtn = document.createElement('button');
    gyroModeBtn.id = 'bb-gyro-mode-btn';
    gyroModeBtn.textContent = 'GYRO:PADDLE';
    gyroModeBtn.style.cssText = 'height:44px;padding:0 10px;border:1px solid rgba(0,255,204,.45);background:rgba(4,20,34,.72);color:#9ffff0;border-radius:10px;font:700 11px Rajdhani,sans-serif;';

    const imuSupported = (typeof window !== 'undefined') && (typeof DeviceOrientationEvent !== 'undefined');

    const modeLabel = document.createElement('div');
    modeLabel.id = 'bb-input-mode';
    modeLabel.style.cssText = 'position:fixed;left:10px;bottom:62px;z-index:141;padding:6px 10px;border-radius:8px;border:1px solid rgba(0,255,204,.45);background:rgba(4,20,34,.78);color:#9ffff0;font:700 11px Rajdhani,sans-serif;letter-spacing:.06em;';
    const setModeLabel = (isImu, tiltMode = MOBILE_INPUT.tiltMode) => {
        modeLabel.textContent = isImu
            ? (tiltMode === 'camera' ? 'GYRO CAMERA + SWIPE PADDLE' : 'GYRO PADDLE + SWIPE CAMERA')
            : 'SWIPE LEFT=PADDLE | RIGHT=CAM';
        modeLabel.style.color = isImu ? '#b8ffe8' : '#9ffff0';
        modeLabel.style.borderColor = isImu ? 'rgba(100,255,220,.75)' : 'rgba(0,255,204,.45)';
    };
    setModeLabel(false);
    document.body.appendChild(modeLabel);

    const pad = document.createElement('div');
    pad.id = 'bb-touch-pad';
    pad.style.cssText = 'position:relative;flex:1;height:44px;border:1px solid rgba(0,255,204,.35);background:rgba(4,20,34,.66);border-radius:10px;overflow:hidden;';
    const thumb = document.createElement('div');
    thumb.id = 'bb-touch-thumb';
    thumb.style.cssText = 'position:absolute;top:4px;left:50%;transform:translateX(-50%);width:36px;height:36px;border-radius:18px;background:rgba(0,255,204,.28);border:1px solid rgba(0,255,204,.8);';
    pad.appendChild(thumb);
    wrap.appendChild(tiltBtn);
    wrap.appendChild(gyroModeBtn);
    wrap.appendChild(pad);
    document.body.appendChild(wrap);

    const paddleZone = document.createElement('div');
    paddleZone.id = 'bb-gesture-paddle';
    paddleZone.style.cssText = 'position:fixed;left:0;top:56px;bottom:64px;width:58vw;z-index:130;touch-action:none;background:transparent;';
    const cameraZone = document.createElement('div');
    cameraZone.id = 'bb-gesture-camera';
    cameraZone.style.cssText = 'position:fixed;right:0;top:56px;bottom:64px;width:42vw;z-index:130;touch-action:none;background:transparent;';
    document.body.appendChild(paddleZone);
    document.body.appendChild(cameraZone);

    const setThumb = (norm) => {
        const w = pad.clientWidth - 40;
        thumb.style.left = `${20 + ((norm + 1) * 0.5 * w)}px`;
    };
    setThumb(0);

    const updateTouchNorm = (clientX) => {
        const r = paddleZone.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
        MOBILE_INPUT.touchNormX = t * 2 - 1;
        setThumb(MOBILE_INPUT.touchNormX);
    };

    paddleZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        MOBILE_INPUT.paddleTouchId = touch.identifier;
        MOBILE_INPUT.touchActive = true;
        updateTouchNorm(touch.clientX);
    }, { passive: false });

    paddleZone.addEventListener('touchmove', (e) => {
        if (!MOBILE_INPUT.touchActive) return;
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.identifier === MOBILE_INPUT.paddleTouchId);
        if (!touch) return;
        updateTouchNorm(touch.clientX);
    }, { passive: false });

    const releaseTouch = () => {
        MOBILE_INPUT.touchActive = false;
        MOBILE_INPUT.paddleTouchId = null;
        MOBILE_INPUT.touchNormX = 0;
        setThumb(0);
    };
    paddleZone.addEventListener('touchend', (e) => {
        const ended = Array.from(e.changedTouches).some(t => t.identifier === MOBILE_INPUT.paddleTouchId);
        if (ended) releaseTouch();
    }, { passive: true });
    paddleZone.addEventListener('touchcancel', releaseTouch, { passive: true });

    cameraZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        MOBILE_INPUT.cameraTouchActive = true;
        MOBILE_INPUT.cameraTouchId = touch.identifier;
        MOBILE_INPUT._cameraLastX = touch.clientX;
        MOBILE_INPUT._cameraLastY = touch.clientY;
    }, { passive: false });

    cameraZone.addEventListener('touchmove', (e) => {
        if (!MOBILE_INPUT.cameraTouchActive) return;
        e.preventDefault();
        const touch = Array.from(e.touches).find(t => t.identifier === MOBILE_INPUT.cameraTouchId);
        if (!touch) return;
        const dx = touch.clientX - (MOBILE_INPUT._cameraLastX ?? touch.clientX);
        const dy = touch.clientY - (MOBILE_INPUT._cameraLastY ?? touch.clientY);
        MOBILE_INPUT._cameraLastX = touch.clientX;
        MOBILE_INPUT._cameraLastY = touch.clientY;
        rotateCameraGesture(dx, dy, 0.0065);
    }, { passive: false });

    const releaseCamTouch = () => {
        MOBILE_INPUT.cameraTouchActive = false;
        MOBILE_INPUT.cameraTouchId = null;
        MOBILE_INPUT._cameraLastX = null;
        MOBILE_INPUT._cameraLastY = null;
    };
    cameraZone.addEventListener('touchend', (e) => {
        const ended = Array.from(e.changedTouches).some(t => t.identifier === MOBILE_INPUT.cameraTouchId);
        if (ended) releaseCamTouch();
    }, { passive: true });
    cameraZone.addEventListener('touchcancel', releaseCamTouch, { passive: true });

    const onTilt = (ev) => {
        if (!MOBILE_INPUT.tiltEnabled || typeof ev.gamma !== 'number') return;
        MOBILE_INPUT.tiltNormX = Math.max(-1, Math.min(1, ev.gamma / 30));
        if (MOBILE_INPUT.tiltNeutralGamma == null) MOBILE_INPUT.tiltNeutralGamma = ev.gamma;
        if (MOBILE_INPUT.tiltNeutralBeta == null) MOBILE_INPUT.tiltNeutralBeta = ev.beta;
        const dg = ev.gamma - MOBILE_INPUT.tiltNeutralGamma;
        const db = ev.beta - MOBILE_INPUT.tiltNeutralBeta;
        MOBILE_INPUT.tiltNormYaw = Math.max(-1, Math.min(1, dg / 26));
        MOBILE_INPUT.tiltNormPitch = Math.max(-1, Math.min(1, db / 26));
    };

    if (!imuSupported) {
        tiltBtn.textContent = 'TOUCH';
        tiltBtn.disabled = true;
        gyroModeBtn.disabled = true;
        gyroModeBtn.style.opacity = '0.65';
        tiltBtn.style.opacity = '0.65';
        tiltBtn.title = 'IMU not available. Using touch pad control.';
        gyroModeBtn.title = 'IMU not available.';
        setModeLabel(false);
    }

    gyroModeBtn.addEventListener('click', () => {
        MOBILE_INPUT.tiltMode = (MOBILE_INPUT.tiltMode === 'paddle') ? 'camera' : 'paddle';
        gyroModeBtn.textContent = MOBILE_INPUT.tiltMode === 'camera' ? 'GYRO:CAMERA' : 'GYRO:PADDLE';
        if (MOBILE_INPUT.tiltMode === 'camera') {
            MOBILE_INPUT.tiltNeutralGamma = null;
            MOBILE_INPUT.tiltNeutralBeta = null;
        }
        setModeLabel(MOBILE_INPUT.tiltEnabled, MOBILE_INPUT.tiltMode);
    });

    tiltBtn.addEventListener('click', async () => {
        if (!imuSupported) return;
        if (!MOBILE_INPUT.tiltEnabled) {
            try {
                if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    const perm = await DeviceOrientationEvent.requestPermission();
                    if (perm !== 'granted') return;
                }
                window.addEventListener('deviceorientation', onTilt, true);
                MOBILE_INPUT.tiltEnabled = true;
                MOBILE_INPUT.tiltNeutralGamma = null;
                MOBILE_INPUT.tiltNeutralBeta = null;
                tiltBtn.textContent = 'TILT ON';
                setModeLabel(true, MOBILE_INPUT.tiltMode);
            } catch (_) {
                MOBILE_INPUT.tiltEnabled = false;
                setModeLabel(false);
            }
            return;
        }
        MOBILE_INPUT.tiltEnabled = false;
        MOBILE_INPUT.tiltNormX = 0;
        MOBILE_INPUT.tiltNormYaw = 0;
        MOBILE_INPUT.tiltNormPitch = 0;
        window.removeEventListener('deviceorientation', onTilt, true);
        tiltBtn.textContent = 'TILT';
        setModeLabel(false);
    });
}

function applyMobilePaddleControl() {
    if (!MOBILE_INPUT.enabled || !gameActive || gamePaused || paddles.length === 0 || !players[0] || !players[0].alive) return;
    let n = null;
    if (MOBILE_INPUT.touchActive) n = MOBILE_INPUT.touchNormX;
    else if (MOBILE_INPUT.tiltEnabled && MOBILE_INPUT.tiltMode === 'paddle') n = MOBILE_INPUT.tiltNormX;
    if (n === null) return;
    const p = paddles[0];
    const tx = Math.max(-PADDLE_BOUND, Math.min(PADDLE_BOUND, n * PADDLE_BOUND));
    movePaddleTo(0, tx, p.position.z);
}

function applyMobileCameraControl() {
    if (!MOBILE_INPUT.enabled || !controls || !gameActive || gamePaused) return;
    if (!(MOBILE_INPUT.tiltEnabled && MOBILE_INPUT.tiltMode === 'camera')) return;
    // Subtle gyro orbit so the cube can be inspected without stealing paddle control.
    controls.rotateLeft(MOBILE_INPUT.tiltNormYaw * 0.028);
    controls.rotateUp(MOBILE_INPUT.tiltNormPitch * 0.018);
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

// ── Wall-impact ring ──
// Drops a thin reflective ring flush against the wall at the impact point,
// scales it outward and fades it. The ring carries the env-map so each
// bounce literally shows the reflective surface flaring at the contact.
function spawnWallImpact(pos, axis, sign, color) {
    if (!scene) return;
    const ringGeo = new THREE.RingGeometry(0.6, 1.0, 32);
    const ringMat = new THREE.MeshPhysicalMaterial({
        color: color || 0xffffff,
        emissive: color || 0xffffff,
        emissiveIntensity: 0.9,
        metalness: 0.9,
        roughness: 0.05,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    applyReflectionsToMaterial(ringMat, 1.6);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    // Park the ring on the wall, biased a hair inward so it doesn't z-fight.
    const bias = 0.05;
    ring.position.copy(pos);
    if (axis === 'x') {
        ring.position.x = sign > 0 ? -WALL_INNER + bias : WALL_INNER - bias;
        ring.rotation.y = Math.PI / 2;
    } else if (axis === 'z') {
        ring.position.z = sign > 0 ? -WALL_INNER + bias : WALL_INNER - bias;
    } else {
        ring.position.y = HALF_H - bias;
        ring.rotation.x = Math.PI / 2;
    }
    scene.add(ring);
    wallImpacts.push({ mesh: ring, mat: ringMat, age: 0 });
}

function updateWallImpacts(dt) {
    for (let i = wallImpacts.length - 1; i >= 0; i--) {
        const w = wallImpacts[i];
        w.age += dt;
        const t = w.age / IMPACT_LIFETIME;
        if (t >= 1) {
            scene.remove(w.mesh);
            w.mesh.geometry.dispose();
            w.mat.dispose();
            wallImpacts.splice(i, 1);
            continue;
        }
        const s = 1 + (IMPACT_GROW - 1) * t;
        w.mesh.scale.set(s, s, s);
        w.mat.opacity = 0.95 * (1 - t);
        w.mat.emissiveIntensity = 0.9 * (1 - t);
    }
}

// Build/rebuild arena for given player count
function buildArena(numPlayers) {
    // Remove old arena objects
    arenaObjects.forEach(obj => scene.remove(obj));
    arenaObjects = [];
    bricks.forEach(b => scene.remove(b));
    bricks = [];
    // Drop any in-flight wall-impact rings — WALL_INNER may shift with player count
    wallImpacts.forEach(w => { scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mat.dispose(); });
    wallImpacts = [];

    setArenaSize(numPlayers);

    // Update camera to keep the whole arena in frame.
    fitCameraToArena();

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
                    metalness: 0.35,             // bumped — visibly mirror-y bricks
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.05
                });
                applyReflectionsToMaterial(mat, 1.35);
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
    const ballsPerPlayer = isMulti ? fib1to4(numPlayers) : 1;
    const numBalls = isMulti ? (numPlayers * ballsPerPlayer) : 1; // solo = 1 ball at a time
    const baseSpeed = isMulti ? SPEED_MULTI : (gameMode === 'easy' ? SPEED_EASY : SPEED_HARD);
    // Lives scaling: 1p=lives_solo, 2p=4, 3p=3, 4p=2 (multi = max(2, 6-numPlayers))
    // Solo lives is yielded from the manifold (params.lives_solo).
    const livesSolo = (window.__BB_MANIFOLD__?.params?.lives_solo) ?? 5;
    const lives = isMulti ? Math.max(2, 6 - numPlayers) : livesSolo;

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
        // Flat circular paddle with a subtle bevel
        const geo = new THREE.CylinderGeometry(
            basePaddleRadius * PADDLE_BEVEL,
            basePaddleRadius,
            PADDLE_THICKNESS,
            48,
            1,
            false
        );
        const mat = new THREE.MeshPhysicalMaterial({
            color: PLAYER_COLORS[i],
            metalness: 0.35,
            roughness: 0.22,
            clearcoat: 1.0,
            clearcoatRoughness: 0.12,
        });
        applyReflectionsToMaterial(mat, 1.1);
        const p = new THREE.Mesh(geo, mat);
        p.castShadow = true;
        p.receiveShadow = true;

        // Lift the paddle a clean 1/PHI off the floor — wide enough that the
        // directional light throws a definite shadow puddle directly under it,
        // which doubles as the player's spatial-orientation cue on the floor.
        p.position.set(startPositions[i][0], -HALF_H + (PADDLE_THICKNESS * 0.5) + (1 / PHI), startPositions[i][1]);
        p.playerId = i;
        p.paddleRadius = basePaddleRadius;
        p.baseRadius = basePaddleRadius;
        p.ceilingPenaltyApplied = false;
        scene.add(p);
        paddles.push(p);
    }

    // Create balls
    if (isMulti) {
        for (let ownerIdx = 0; ownerIdx < numPlayers; ownerIdx++) {
            for (let k = 0; k < ballsPerPlayer; k++) {
                spawnBall(ownerIdx, baseSpeed, true);
            }
        }
    } else {
        for (let i = 0; i < numBalls; i++) {
            spawnBall(i % numPlayers, baseSpeed, false);
        }
    }
}

function spawnBall(ownerIdx, baseSpeed, isMulti) {
    // In multiplayer: ball starts neutral (not scored) but is *liable* to an owner.
    const color = isMulti ? 0xcccccc : 0xcccccc;
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    const mat = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.85,
        roughness: 0.16,
        clearcoat: 1.0,
        clearcoatRoughness: 0.10,
    });
    applyReflectionsToMaterial(mat, 1.25);
    if (isMulti) { mat.emissive = new THREE.Color(0x000000); mat.emissiveIntensity = 0.0; }
    const b = new THREE.Mesh(geo, mat);
    b.castShadow = true;
    b.receiveShadow = true;

    const angle = Math.random() * Math.PI * 2;
    const vx = Math.sin(angle) * baseSpeed * 0.6;
    const vz = Math.cos(angle) * baseSpeed * 0.4;
    b.velocity = new THREE.Vector3(vx, baseSpeed, vz);

    // Serve point: always random X/Z just under the bottom brick layer.
    const gap = 0.15;
    const brickH = 1.0;
    const brickW = PHI * 3;
    const gridSpacing = brickW + gap;
    const layerStride = brickH + gap;
    const ceilingGap = PHI * PHI * PHI;
    const topLayerY = HALF_H - ceilingGap - brickH / 2;
    const bottomLayerY = topLayerY - 3 * layerStride;
    const serveY = bottomLayerY - (brickH * 0.5 + BALL_RADIUS + 0.25);

    const numAcross = Math.max(1, Math.floor(ARENA_WIDTH / gridSpacing));
    const offset = (numAcross - 1) * gridSpacing / 2;
    const randX = (Math.random() * 2 - 1) * Math.max(1, offset);
    const randZ = (Math.random() * 2 - 1) * Math.max(1, offset);
    b.position.set(randX, serveY, randZ);

    // belongsTo: visual/scoring "current color" owner; -1 means neutral/unclaimed
    b.belongsTo = isMulti ? -1 : -1;
    // liabilityOwner: who loses a life if THIS ball falls through
    b.liabilityOwner = isMulti ? ownerIdx : -1;
    // lastTouchedBy: who gets points for bricks hit (only when >= 0)
    b.lastTouchedBy = isMulti ? -1 : ownerIdx;
    b.owner = ownerIdx;          // kept for AI compatibility
    b.alive = true;
    b.baseSpeed = baseSpeed;
    b.spawnBaseSpeed = baseSpeed; // baseline for non-multiplicative layer boosts
    b.turbulence = 0;
    b.finalLayerSpeedApplied = false;
    b.ceilingPenaltyApplied = false;
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
    fitCameraToArena();
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
            const t = estimateTimeToY(myBall, catchY);
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
                const st = estimateTimeToY(b, catchY);
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
                const t = estimateTimeToY(b, catchY);
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
                        const t = estimateTimeToY(rivalBall, catchY);
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
            const spd = aimBall.baseSpeed || SPEED_EASY;
            const err = 0.35 + turb * 14 + Math.max(0, spd - MIN_BALL_SPEED) * 3.2;
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

    // Frame dt (cap to 1/30 s so a hitch doesn't snap-fade every impact ring at once)
    const _now = performance.now();
    const _dt = Math.min(0.033, ((_now - (animate._lastT || _now)) / 1000) || 0.016);
    animate._lastT = _now;
    updateWallImpacts(_dt);

    const isMulti = gameMode.startsWith('multi');

    applyMobilePaddleControl();
    applyMobileCameraControl();

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
        b.baseSpeed *= FREE_FLIGHT_DRAG;
        if (b.baseSpeed < MIN_BALL_SPEED) b.baseSpeed = MIN_BALL_SPEED;

        // Magnus effect: spin curves the ball's trajectory
        // Force = spin × velocity (cross product)
        if (b.spin && b.spin.lengthSq() > 0.0001) {
            const magnus = new THREE.Vector3().crossVectors(b.spin, b.velocity);
            magnus.multiplyScalar(MAGNUS_STRENGTH);
            b.velocity.add(magnus);

            // Spin decays over time (air friction)
            b.spin.multiplyScalar(SPIN_DECAY);

            // Visual: rotate ball mesh based on spin
            b.rotation.x += b.spin.x * 0.1;
            b.rotation.y += b.spin.y * 0.1;
            b.rotation.z += b.spin.z * 0.1;
        }

        // Gravity adds a visible arc
        b.velocity.y -= GRAVITY;

        // Turbulence adds small unpredictable curving so trajectories aren't precomputable
        if (b.turbulence && b.turbulence > 0.00001) {
            b.velocity.x += (Math.random() - 0.5) * b.turbulence;
            b.velocity.z += (Math.random() - 0.5) * b.turbulence;
            b.velocity.y += (Math.random() - 0.5) * (b.turbulence * 0.22);
            b.turbulence *= TURBULENCE_DECAY;
        }

        // Clamp to the current energy (baseSpeed)
        clampBallEnergyAndSpeed(b);

        b.position.add(b.velocity);

        // Tint impact rings with the last-touching player's color so each
        // bounce visibly belongs to whoever last hit the ball.
        const owner = paddles[b.lastTouchedBy];
        const impactColor = owner ? owner.material.color.getHex() : 0xffffff;

        // Side wall bounces — reflect + impart spin from tangential velocity
        let wallHit = false;
        let ceilingHit = false;
        if (b.position.x > WALL_INNER) {
            b.position.x = WALL_INNER; b.velocity.x *= -1;
            // Wall normal is (-1,0,0), tangential is Y and Z
            b.spin.y += b.velocity.z * SPIN_TRANSFER;
            b.spin.z -= b.velocity.y * SPIN_TRANSFER;
            spawnWallImpact(b.position, 'x', -1, impactColor);
            wallHit = true;
        }
        if (b.position.x < -WALL_INNER) {
            b.position.x = -WALL_INNER; b.velocity.x *= -1;
            b.spin.y -= b.velocity.z * SPIN_TRANSFER;
            b.spin.z += b.velocity.y * SPIN_TRANSFER;
            spawnWallImpact(b.position, 'x', 1, impactColor);
            wallHit = true;
        }
        if (b.position.z > WALL_INNER) {
            b.position.z = WALL_INNER; b.velocity.z *= -1;
            b.spin.y -= b.velocity.x * SPIN_TRANSFER;
            b.spin.x += b.velocity.y * SPIN_TRANSFER;
            spawnWallImpact(b.position, 'z', -1, impactColor);
            wallHit = true;
        }
        if (b.position.z < -WALL_INNER) {
            b.position.z = -WALL_INNER; b.velocity.z *= -1;
            b.spin.y += b.velocity.x * SPIN_TRANSFER;
            b.spin.x -= b.velocity.y * SPIN_TRANSFER;
            spawnWallImpact(b.position, 'z', 1, impactColor);
            wallHit = true;
        }

        // Ceiling — reverses Y to downward, imparts spin from tangential
        if (b.position.y > HALF_H - 1) {
            b.position.y = HALF_H - 1;
            b.velocity.y = -Math.abs(b.velocity.y);
            // Ceiling normal is (0,-1,0), tangential is X and Z
            b.spin.x += b.velocity.z * SPIN_TRANSFER;
            b.spin.z -= b.velocity.x * SPIN_TRANSFER;
            spawnWallImpact(b.position, 'y', -1, impactColor);
            ceilingHit = true;

            // Ceiling restores energy so balls keep reaching bricks
            b.baseSpeed = Math.min(MAX_BALL_SPEED, b.baseSpeed * CEILING_BOOST + CEILING_BOOST_ADD);
            b.turbulence = Math.min(TURBULENCE_MAX, (b.turbulence || 0) + TURBULENCE_WALL_ADD);
            nudgeVelocity(b, WALL_DEFLECT);

            // Reduce the paddle of whoever last touched this ball by golden ratio (.618)
            // only once for this specific ball life.
            const owner = paddles[b.lastTouchedBy];
            if (owner && !b.ceilingPenaltyApplied) {
                setPaddlePenalty(b.lastTouchedBy, true);
                b.ceilingPenaltyApplied = true;
            }

            clampBallEnergyAndSpeed(b);
        }

        if (!ceilingHit && wallHit) {
            // Walls re-energize, but less than the ceiling
            b.baseSpeed = Math.min(MAX_BALL_SPEED, b.baseSpeed * WALL_BOOST + WALL_BOOST_ADD);
            b.turbulence = Math.min(TURBULENCE_MAX, (b.turbulence || 0) + TURBULENCE_WALL_ADD);
            nudgeVelocity(b, WALL_DEFLECT);
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
                    const launch = isMulti ? PADDLE_LAUNCH_MULTI : (gameMode === 'easy' ? PADDLE_LAUNCH_EASY : PADDLE_LAUNCH_HARD);
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
                    nudgeVelocity(b, 0.018);

                    // Transfer spin from tangential components
                    b.spin.x += b.velocity.z * SPIN_TRANSFER;
                    b.spin.z -= b.velocity.x * SPIN_TRANSFER;

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
                            // New life: restore owner's paddle to normal size.
                            setPaddlePenalty(liable, false);
                            // Respawn a fresh neutral ball liable to that player
                            spawnBall(liable, SPEED_MULTI, true);
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
                        // New life: restore paddle to normal; next ceiling hit can shrink again.
                        setPaddlePenalty(0, false);
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
                if (typeof b.lastTouchedBy === 'number' && b.lastTouchedBy >= 0 && players[b.lastTouchedBy]) {
                    players[b.lastTouchedBy].score += 100;
                }

                // Bricks absorb energy; higher-energy impacts get absorbed more.
                const speedFactor = Math.max(0, b.baseSpeed - MIN_BALL_SPEED);
                const absorb = THREE.MathUtils.clamp(
                    BRICK_ABSORB_BASE - speedFactor * BRICK_ABSORB_SPEED_FACTOR,
                    0.90,
                    BRICK_ABSORB_BASE
                );
                b.baseSpeed *= absorb;

                // Extra randomness on brick hits so the AI can't precompute a clean trajectory
                b.turbulence = Math.min(TURBULENCE_MAX, (b.turbulence || 0) + TURBULENCE_BRICK_ADD);
                nudgeVelocity(b, BRICK_DEFLECT);

                // Final-layer boost: speed up exactly once per ball when it hits the last layer.
                if (!b.finalLayerSpeedApplied && brick.layer === FINAL_LAYER_INDEX) {
                    b.baseSpeed = Math.min(MAX_BALL_SPEED, b.baseSpeed * FINAL_LAYER_SPEED_MULT);
                    b.finalLayerSpeedApplied = true;
                }

                // Never allow energy to fall below the safe minimum
                if (b.baseSpeed < MIN_BALL_SPEED) b.baseSpeed = MIN_BALL_SPEED;
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

// Manifold-first: pull tuning constants from manifold.game.json. Defaults
// declared at top of file are the fallback if the fetch fails (offline,
// 404, …) so the game stays playable.
async function loadManifoldParams() {
    try {
        const res = await fetch('manifold.game.json', { cache: 'no-cache' });
        if (!res.ok) return;
        const m = await res.json();
        window.__BB_MANIFOLD__ = m;
        const p = m.params || {};
        if (typeof p.phi === 'number') PHI = p.phi;
        if (typeof p.ball_radius === 'number') BALL_RADIUS = p.ball_radius;
        if (typeof p.paddle_radius === 'number') PADDLE_RADIUS = p.paddle_radius;
        if (typeof p.paddle_thickness === 'number') PADDLE_THICKNESS = p.paddle_thickness;
        if (typeof p.arena_height === 'number') ARENA_HEIGHT = p.arena_height;
        if (typeof p.reflection_resolution === 'number') REFLECTION_RES = p.reflection_resolution;
        if (typeof p.reflection_update_every === 'number') REFLECTION_UPDATE_EVERY = p.reflection_update_every;
        // Speeds are PHI-scaled — recompute against the (possibly updated) PHI.
        SPEED_EASY = (p.speed_easy_phi ?? 0.25) * PHI;
        SPEED_HARD = (p.speed_hard_phi ?? 0.4) * PHI;
        SPEED_MULTI = (p.speed_multi_phi ?? 0.3) * PHI;
        MIN_BALL_SPEED = (p.min_ball_speed_phi ?? 0.22) * PHI;
        MAX_BALL_SPEED = (p.max_ball_speed_phi ?? 0.85) * PHI;
    } catch (e) {
        console.warn('[brickbreaker3d] manifold params load failed; using defaults', e);
    }
}

// Initialize on load
window.addEventListener('load', async () => {
    await loadManifoldParams();
    initScene();
    animate();

    // ── MANIFOLD BRIDGE ───────────────────────────────────────────
    if (typeof ManifoldBridge !== 'undefined') {
        const m = window.__BB_MANIFOLD__ || {};
        ManifoldBridge.init({
            id: m.manifold || 'brickbreaker3d',
            version: m.version || '1.0.0',
            x: m.dimension?.x ?? 2,
            y: m.dimension?.y ?? 22,
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
