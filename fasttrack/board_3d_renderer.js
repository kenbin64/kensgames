// ============================================================
// FAST TRACK 3D - BUTTERFLYFX MANIFOLD SUBSTRATE
// Complete game board with hole registry and peg system
//
// CANONICAL HOLE REFERENCE: BOARD_TOPOLOGY in board_manifold.js
// All hole IDs, counts, and ordering are defined there.
// ============================================================

let scene, camera, renderer, controls;
let boardGroup, pegGroup;

// References for theme color updates
let boardMesh = null;
let borderSegments = [];
let coloredMarkers = [];  // {mesh, playerIndex} for pentagons, diamonds, circles, rings
let currentBoardPalette = null;

// ============================================================
// GOLDEN RATIO PROPORTIONS (φ = 1.618033988749895)
// All dimensions cascade from a base unit using φ
// ============================================================
// PHI is already declared globally by external substrates
const BASE_UNIT = 5;  // Fundamental unit

// Board dimensions (anchor point)
const BOARD_RADIUS = 300;

// Golden cascade: each level = previous × φ
// Level 1: 5 × φ = 8.09 → 8
// Level 2: 8 × φ = 12.94 → 13
// Level 3: 13 × φ = 21.03 → 21
// Level 4: 21 × φ = 34.0 → 34
const LEVEL_1 = Math.round(BASE_UNIT * PHI);           // 8
const LEVEL_2 = Math.round(LEVEL_1 * PHI);             // 13
const LEVEL_3 = Math.round(LEVEL_2 * PHI);             // 21
const LEVEL_4 = Math.round(LEVEL_3 * PHI);             // 34

// Hole dimensions (Level 1)
const HOLE_RADIUS = LEVEL_1;                           // 8
const TRACK_HOLE_RADIUS = LEVEL_1;                     // 8
const CENTER_HOLE_RADIUS = LEVEL_1;                    // 8

// Marker/ring dimensions (Level 2)
const RING_WIDTH = LEVEL_2;                            // 13
const DIAMOND_SIZE = LEVEL_2;                          // 13
const LINE_HEIGHT = 15;                                // Above board surface (board top ~13.5 with bevel)
const BORDER_WIDTH = LEVEL_2;                          // 13

// Larger elements (Level 3)
const PENTAGON_SIZE = LEVEL_3;                         // 21
const BOARD_THICKNESS = LEVEL_3;                       // 21

// Largest elements (Level 4)
const HOLDING_CIRCLE_RADIUS = LEVEL_4;                 // 34
const HOLDING_HOLE_SPACING = LEVEL_3;                  // 21

// Peg dimensions derived from HOLE_RADIUS using φ
const PEG_BOTTOM_RADIUS = LEVEL_1;                     // 8
const PEG_TOP_RADIUS = Math.round(LEVEL_1 / PHI);      // 5
const PEG_HEIGHT = LEVEL_4;                            // 34
const PEG_DOME_RADIUS = LEVEL_1;                       // 8

// Border height
const BORDER_HEIGHT = BOARD_THICKNESS + LEVEL_1;       // 29

// Key radii calculations using golden ratio
const outerRadius = BOARD_RADIUS * Math.cos(Math.PI / 6);      // ~259.8 (geometric)
const innerRadius = Math.round(outerRadius / (PHI * PHI));     // ~99 (φ² relationship)
const innerHexRadius = innerRadius / Math.cos(Math.PI / 6);    // ~114
const wedgeFactor = 0.85;                                      // Visual balance (geometric)

// Maximally distinct player colors — no two are close
const RAINBOW_COLORS = [
    0xff2020, // Red
    0x2196ff, // Blue
    0x4caf50, // Green
    0xffeb3b, // Yellow
    0xff9800, // Orange
    0x9c27b0  // Purple
];
const COLORS = RAINBOW_COLORS;  // Alias for convenience

const PLAYER_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple'];

// Track safe zone planes for theme color updates
const safeZonePlanes = [];

// ============================================================
// MANIFOLD SUBSTRATE: Hole Registry (ButterflyFX)
// Each hole has identity, type, position, and relationships
// ============================================================

const holeRegistry = new Map();  // id -> HoleObject
const pegRegistry = new Map();   // id -> PegObject

// Active player count - only create pegs/decks for this many players
let activePlayerCount = 3;  // Default: 1 human + 2 AI (indices 0, 1, 2)

// Export to window for game engine access
window.holeRegistry = holeRegistry;
window.pegRegistry = pegRegistry;

// ============================================================
// HOLE PROPERTY TAGGING SYSTEM
// Based on FastTrack Universal Specification
// A hole can have multiple roles/properties
// ============================================================

// Helper function to normalize hole type (side-left/side-right → outer)
function getNormalizedHoleType(holeId) {
    if (!holeId) return 'unknown';
    if (holeId === 'center') return 'center';
    if (holeId.startsWith('hold-')) return 'holding';
    if (holeId.startsWith('home-')) return 'home';
    if (holeId.startsWith('ft-')) return 'fasttrack';
    if (holeId.startsWith('safe-')) return 'safezone';
    if (holeId.startsWith('outer-') || holeId.startsWith('side-')) return 'outer';
    return 'unknown';
}

function createHole(id, type, playerIndex, x, y, z, marker = null, properties = {}) {
    const hole = {
        id: id,
        type: type,
        playerIndex: playerIndex,
        position: { x: x, y: y, z: z },
        radius: TRACK_HOLE_RADIUS,
        occupied: false,
        occupiedBy: null,
        marker: marker,
        mesh: null,
        connections: [],
        // Property tags - a hole can have multiple roles
        properties: {
            isHoldingExit: properties.isHoldingExit || false,      // Holding pen exit (also winner hole)
            isWinnerHole: properties.isWinnerHole || false,        // Where 5th peg wins
            isSafeZoneEntry: properties.isSafeZoneEntry || false,  // Pivot point before safe zone
            isSafeZone: properties.isSafeZone || false,            // Inside safe zone
            isFastTrack: properties.isFastTrack || false,          // FastTrack ring hole
            isFastTrackEntry: properties.isFastTrackEntry || false,// Can enter FastTrack from here
            isFastTrackExit: properties.isFastTrackExit || false,  // Player's own FT hole (exit point)
            isBullseye: properties.isBullseye || false,            // Center bullseye
            isOuterTrack: properties.isOuterTrack || false         // Regular perimeter track
        }
    };
    holeRegistry.set(id, hole);
    // Debug: Log first few holes
    if (holeRegistry.size <= 3) {
        console.log('🕳️ Created hole:', id, 'Registry size:', holeRegistry.size, 'Props:', hole.properties);
    }
    return hole;
}

// Color names for player areas
const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

// Per-move suggestion colors — vivid complementary hues, one per peg group
// Used for path highlights, destination glow, AND suggestion button borders
const MOVE_COLORS = [
    { hex: '#00e5ff', three: 0x00e5ff },  // cyan
    { hex: '#ff6b35', three: 0xff6b35 },  // orange
    { hex: '#a3ff4d', three: 0xa3ff4d },  // lime
    { hex: '#ff3cac', three: 0xff3cac },  // hot pink
    { hex: '#ffd700', three: 0xffd700 },  // gold
    { hex: '#b040ff', three: 0xb040ff },  // violet
];

// Get peg number from id (peg-X-4 = #1, peg-X-0 = #2, etc)
function getPegNumber(pegId) {
    const match = pegId.match(/peg-(\d+)-(\d+)/);
    if (!match) return 0;
    const pegIdx = parseInt(match[2]);
    // peg-X-4 (starts on home) = #1, then 0-3 = #2-5 in order they leave holding
    return pegIdx === 4 ? 1 : pegIdx + 2;
}

// Get color name by board position
function getColorName(boardPosition) {
    return COLOR_NAMES[boardPosition] || 'Unknown';
}

// Get peg label like "Red 1" or "Blue 3"
function getPegLabel(pegId, boardPosition) {
    const num = getPegNumber(pegId);
    const color = getColorName(boardPosition);
    return `${color} ${num}`;
}

// ── Friendly hole name helper ──
// Converts raw hole IDs to simple, human-readable descriptions
function friendlyHoleName(holeId) {
    if (!holeId) return 'Unknown';

    // Helper: get player name or color from board position in hole ID
    function ownerOf(boardPos) {
        if (gameState && gameState.players) {
            const owner = gameState.players.find(p => p.boardPosition == boardPos);
            if (owner) return owner.name;
        }
        return COLOR_NAMES[boardPos] || 'Player';
    }

    // Bullseye / Center
    if (holeId === 'center') return 'the Bullseye';

    // Holding area
    if (holeId.startsWith('hold-')) return 'Holding Area';

    // Home hole — say whose
    if (holeId.startsWith('home-')) {
        const bp = parseInt(holeId.split('-')[1]);
        return `${ownerOf(bp)}'s Home Hole`;
    }

    // Safe zone — say whose and which slot
    if (holeId.startsWith('safe-')) {
        const parts = holeId.split('-');
        const bp = parseInt(parts[1]);
        const num = parts[2];
        return `${ownerOf(bp)}'s Safe Zone #${num}`;
    }

    // FastTrack corners
    if (holeId.startsWith('ft-')) {
        const bp = parseInt(holeId.split('-')[1]);
        return `${COLOR_NAMES[bp] || ''} FastTrack corner`;
    }

    // Outer track — check for safe zone gateway
    if (holeId.startsWith('outer-')) {
        const parts = holeId.split('-');
        const bp = parseInt(parts[1]);
        const idx = parseInt(parts[2]);
        if (idx === 2) return `${ownerOf(bp)}'s Safe Zone Gateway`;
        return 'the perimeter track';
    }

    // Side tracks
    if (holeId.startsWith('side-')) return 'the perimeter track';

    return holeId;
}

// Create a floating number sprite for a peg
function createPegNumberSprite(number, pegColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Draw circle background
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw number
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(15, 15, 1);
    return sprite;
}

// Show number labels on pegs that have choices
function showPegNumbers(pegIds) {
    pegIds.forEach(pegId => {
        const peg = pegRegistry.get(pegId);
        if (peg && peg.numberSprite) {
            peg.numberSprite.visible = true;
        }
    });
}

// Hide all peg number labels
function hidePegNumbers() {
    pegRegistry.forEach(peg => {
        if (peg.numberSprite) {
            peg.numberSprite.visible = false;
        }
    });
}

function createPeg(id, playerIndex, holeId, colorIndex = null) {
    // Use colorIndex if provided, otherwise fall back to playerIndex
    // Use themed colors if available, fallback to RAINBOW_COLORS
    const colorIdx = colorIndex !== null ? colorIndex : playerIndex;
    const color = (currentBoardPalette && currentBoardPalette.playerColors)
        ? currentBoardPalette.playerColors[colorIdx]
        : RAINBOW_COLORS[colorIdx];
    const hole = holeRegistry.get(holeId);
    const pegNumber = getPegNumber(id);

    // Create peg group to hold body + flat top
    const pegGroup = new THREE.Group();

    // Tapered cylinder body (Light Bright style)
    const bodyGeo = new THREE.CylinderGeometry(
        PEG_TOP_RADIUS, PEG_BOTTOM_RADIUS, PEG_HEIGHT, 32
    );

    // Translucent glowing body material
    const bodyMat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.2,
        metalness: 0.3,
        emissive: color,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.85
    });

    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.position.y = PEG_HEIGHT / 2;
    pegGroup.add(bodyMesh);

    // Flat glowing disc top
    const discGeo = new THREE.CylinderGeometry(PEG_DOME_RADIUS, PEG_DOME_RADIUS, 3, 32);

    // Flat top material - same color as body
    const discMat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.2,
        metalness: 0.3,
        emissive: color,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.85
    });

    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.position.y = PEG_HEIGHT + 1.5;
    discMesh.castShadow = true;
    pegGroup.add(discMesh);

    // Explicit render order keeps transparent meshes sorted correctly
    bodyMesh.renderOrder = 0;
    discMesh.renderOrder = 1;

    // Add invisible touch zone to increase clickable area for pegs (helps mobile)
    try {
        const touchGeo = new THREE.CylinderGeometry(PEG_DOME_RADIUS * 2.8, PEG_DOME_RADIUS * 2.8, 6, 24);
        // colorWrite:false + depthWrite:false removes this mesh from BOTH the color and depth
        // render passes entirely — it will NOT appear as an "orb" and will NOT punch holes in
        // neighbouring transparent peg bodies. Three.js raycasting still hits it (geometry-based),
        // so mobile tap targets remain large.
        const touchMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            colorWrite: false,
            depthWrite: false
        });
        const touchMesh = new THREE.Mesh(touchGeo, touchMat);
        touchMesh.position.y = PEG_HEIGHT + 1.5;
        touchMesh.name = 'peg-touch-zone';
        touchMesh.castShadow = false;
        touchMesh.receiveShadow = false;
        pegGroup.add(touchMesh);
    } catch (e) {
        console.warn('[createPeg] touch zone creation failed', e);
    }

    // Position on top of hole
    if (hole) {
        pegGroup.position.set(hole.position.x, hole.position.y + 2, hole.position.z);
        hole.occupied = true;
        hole.occupiedBy = id;
    }

    // Create number label sprite (hidden by default)
    const numberSprite = createPegNumberSprite(pegNumber, color);
    numberSprite.position.y = PEG_HEIGHT + 20; // Above the peg
    numberSprite.visible = false;
    pegGroup.add(numberSprite);

    const peg = {
        id: id,
        playerIndex: playerIndex,
        colorIndex: colorIdx,  // Board position index for matching area colors
        pegNumber: pegNumber,  // 1-5, order they leave holding
        color: color,
        currentHole: holeId,
        mesh: pegGroup,
        bodyMesh: bodyMesh,
        discMesh: discMesh,
        numberSprite: numberSprite
    };

    pegRegistry.set(id, peg);
    // Add peg group to global pegGroup container if present so raycasts against boardGroup/pegGroup find them
    try {
        if (typeof window.pegGroup !== 'undefined' && window.pegGroup && window.pegGroup.add) {
            window.pegGroup.add(pegGroup);
        } else {
            scene.add(pegGroup);
        }
    } catch (e) {
        scene.add(pegGroup);
    }

    return peg;
}

// Helper to create shiny material for board elements
function createShinyMaterial(color, isEmissive = true) {
    return new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.2,
        metalness: 0.7,
        emissive: isEmissive ? color : 0x000000,
        emissiveIntensity: isEmissive ? 0.2 : 0,
        side: THREE.DoubleSide
    });
}

// Create branding ring with curved text - gradient lettering with drop shadow
function createBrandingRing(radius, yPosition) {
    // Create canvas for text texture
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw circular text
    ctx.save();
    ctx.translate(size / 2, size / 2);

    // Text radius - position filling the pink circle width
    const textRadius = size * 0.44;

    // Full circle text: "Fastrack!" repeated with star glyphs
    const brandText = "★ Fastrack! ★ Fastrack! ★ Fastrack! ★ Fastrack! ";
    ctx.font = 'bold 72px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Create gradient (gold to orange)
    const gradient = ctx.createLinearGradient(-size / 2, 0, size / 2, 0);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.5, '#FFA500');
    gradient.addColorStop(1, '#FFD700');

    // Calculate angle per character for full circle
    const totalAngle = Math.PI * 2;
    const anglePerChar = totalAngle / brandText.length;

    // Draw each character around the full circle
    for (let i = 0; i < brandText.length; i++) {
        const angle = -Math.PI / 2 - i * anglePerChar;  // Start at top, go counter-clockwise

        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -textRadius);  // Place on outer edge
        ctx.rotate(Math.PI);  // Flip letters right-side up

        // Drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Gradient fill
        ctx.fillStyle = gradient;
        ctx.fillText(brandText[i], 0, 0);

        ctx.restore();
    }

    ctx.restore();

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Create circular plane for the text - sized to fit on divider circle
    const textGeo = new THREE.CircleGeometry(radius + 5, 64);
    const textMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });

    const textMesh = new THREE.Mesh(textGeo, textMat);
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.y = yPosition;
    boardGroup.add(textMesh);
}

// ============================================================
// INITIALIZATION
// ============================================================

// Theme system variables
let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;
let currentThemeName = 'speakeasy';  // Prohibition-era speakeasy (alias for billiard)
let isVRMode = false;

// ============================================================
// VR DETECTION & SUPPORT
// ============================================================
async function detectVRMode() {
    console.log('[VR Detection] Checking for VR headset...');

    // Check if WebXR is supported
    if (!navigator.xr) {
        console.log('[VR Detection] WebXR not supported');
        return false;
    }

    try {
        // Check if VR is supported
        const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');

        if (isVRSupported) {
            console.log('[VR Detection] ✅ VR headset detected! Auto-switching to VR Immersive theme');
            return true;
        } else {
            console.log('[VR Detection] VR not available');
            return false;
        }
    } catch (error) {
        console.log('[VR Detection] Error checking VR support:', error);
        return false;
    }
}

function addVRButton() {
    console.log('[VR] Adding VR button...');

    // Create VR button
    const vrButton = document.createElement('button');
    vrButton.id = 'vr-button';
    vrButton.innerHTML = '🥽 ENTER VR';
    vrButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 15px 30px;
            background: linear-gradient(135deg, #ff00ff 0%, #00ffff 100%);
            color: white;
            border: 3px solid #ffffff;
            border-radius: 10px;
            font-family: 'Press Start 2P', monospace;
            font-size: 14px;
            cursor: pointer;
            z-index: 10000;
            box-shadow: 0 0 20px rgba(255, 0, 255, 0.6);
            transition: all 0.3s;
        `;

    vrButton.addEventListener('mouseenter', () => {
        vrButton.style.transform = 'scale(1.1)';
        vrButton.style.boxShadow = '0 0 30px rgba(255, 0, 255, 0.8)';
    });

    vrButton.addEventListener('mouseleave', () => {
        vrButton.style.transform = 'scale(1)';
        vrButton.style.boxShadow = '0 0 20px rgba(255, 0, 255, 0.6)';
    });

    vrButton.addEventListener('click', async () => {
        console.log('[VR] Entering VR mode...');

        try {
            // Request VR session
            const session = await navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor']
            });

            console.log('[VR] VR session started');

            // Enable XR on renderer
            await renderer.xr.setSession(session);
            renderer.xr.enabled = true;

            // Hide VR button when in VR
            vrButton.style.display = 'none';

            // Handle session end
            session.addEventListener('end', () => {
                console.log('[VR] VR session ended');
                renderer.xr.enabled = false;
                vrButton.style.display = 'block';
            });

        } catch (error) {
            console.error('[VR] Failed to enter VR mode:', error);
            alert('Failed to enter VR mode. Please ensure your VR headset is connected and permissions are granted.');
        }
    });

    document.body.appendChild(vrButton);
    console.log('[VR] VR button added');
}

function init() {
    console.log('🔄 init() started');

    // Guard: Three.js is loaded locally from /lib/three/three.min.js.
    // If it's still undefined, the file failed to load — show message and reload.
    if (typeof THREE === 'undefined') {
        console.error('❌ THREE.js not loaded — local lib may not have served correctly. Reloading...');
        const msg = document.createElement('div');
        msg.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0a14;color:#64d8ff;font-family:sans-serif;z-index:99999;gap:16px;';
        msg.innerHTML = '<div style="font-size:2em;">🎲 Fast Track</div><div>Loading 3D engine… please wait.</div>';
        document.body.appendChild(msg);
        window.location.reload();
        return;
    }

    try {
        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a14);

        // Camera - far plane extended to see distant theme backdrops (stars, planets, etc.)
        // FOV 55° for wider field of view; lower angle for more level perspective
        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 5000);
        // ~22° above center — closer, more level view of the board
        camera.position.set(0, 200, 450);
        camera.lookAt(0, 0, 0);

        // Renderer
        const urlP = new URLSearchParams(window.location.search);
        const isPromo = urlP.has('promo');
        renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: isPromo });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        var container = document.getElementById('container');
        container.appendChild(renderer.domElement);

        // Controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        // CameraGuard REMOVED — the new CameraDirector handles all camera
        // positioning through a single update() call each frame.
        // No monkey-patching of camera.position.set / lookAt needed.

        // Default camera mode is MANUAL (angled board view) — user has full control
        // with zoom, pan, rotate. Auto camera can be enabled via settings.
        try {
            boardViewMode = 0;
            fixedViewsActive = false;
            currentCameraView = 'chase';
            // UI: ensure board-view button is not marked active
            const bv = document.getElementById('board-view-btn');
            if (bv) bv.classList.remove('active');
            // Apply automatic chase view immediately
            if (typeof setCameraViewMode === 'function') setCameraViewMode('chase', { force: true });
        } catch (e) { }
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.minDistance = 200;
        controls.maxDistance = 1200;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI / 2.1;
        // Mobile: one finger PAN (slide board around), two fingers DOLLY+ROTATE
        // Default OrbitControls uses ONE=ROTATE which feels like spinning from a fixed pole.
        // Switching ONE to PAN gives free camera movement the user expects on mobile.
        if (typeof THREE.TOUCH !== 'undefined') {
            controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
        }

        // Setup camera interaction tracking
        setupCameraInteractionTracking();

        // Lighting
        setupLighting();

        // Board group — render above backdrop layers
        boardGroup = new THREE.Group();
        boardGroup.name = 'boardGroup';
        boardGroup.renderOrder = 1;
        scene.add(boardGroup);

        // Peg group — render above board and backdrop
        pegGroup = new THREE.Group();
        pegGroup.renderOrder = 2;
        scene.add(pegGroup);

        // Expose 3D globals for external modules (tooltips, tutorial)
        window.scene = scene;
        window.camera = camera;
        window.controls = controls;
        window.boardGroup = boardGroup;
        window.getNormalizedHoleType = getNormalizedHoleType;
        window.renderer = renderer;

        // Build hexagon and borders only
        console.log('🎮 Creating hexagon board...');
        try {
            createHexagonBoard();
            console.log('✅ Hexagon board created');
        } catch (e) {
            console.error('❌ createHexagonBoard failed:', e);
        }

        console.log('🌈 Creating rainbow border...');
        try {
            createRainbowBorder();
            console.log('✅ Rainbow border created');
        } catch (e) {
            console.error('❌ createRainbowBorder failed:', e);
        }

        // Draw schema lines and create hole registry
        console.log('📐 About to call drawSchemaLines...');
        try {
            drawSchemaLines();
            console.log('📐 drawSchemaLines completed, holeRegistry.size =', holeRegistry.size);
        } catch (e) {
            console.error('❌ drawSchemaLines failed:', e);
        }

        // Create pegs and place in start positions
        createPegsAndPlace();

        // Detect VR and apply appropriate theme
        detectVRMode().then(vrDetected => {
            isVRMode = vrDetected;

            if (vrDetected) {
                // Auto-switch to VR Immersive theme
                currentThemeName = 'vr_immersive';
                console.log('[VR Detection] 🎮 Activating VR Immersive theme');

                // Add VR button for entering VR mode
                addVRButton();
            }

            // Apply theme
            if (window.FastTrackThemes) {
                FastTrackThemes.apply(currentThemeName, scene, THREE);
                // Freeze backdrop motion by default in production so background does not drift over the board.
                if (typeof FastTrackThemes.setMotionScale === 'function') {
                    FastTrackThemes.setMotionScale(0);
                }
            }
        });

        // Log substrate status
        if (typeof FastTrackSubstrates !== 'undefined') {
            console.log('🎲 FastTrack Substrates loaded:', {
                Rules: FastTrackSubstrates.Rules.rules.size + ' rules',
                Board: 'Board topology defined',
                Card: Object.keys(FastTrackSubstrates.Card.cards).length + ' cards',
                Events: 'Event system active'
            });
        }

        // Events
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('mousemove', onMouseMove);

        // Initialize settings UI
        const autoMoveToggle = document.getElementById('auto-move-toggle');
        if (autoMoveToggle) {
            autoMoveToggle.checked = GAME_CONFIG.autoMoveForHumans;
            const label = document.getElementById('auto-move-label');
            if (label) label.textContent = GAME_CONFIG.autoMoveForHumans ? 'ON' : 'OFF';
        }

        // Initialize victory ceremony with scene references
        if (window.VictoryCeremony) {
            VictoryCeremony.init(scene, camera, renderer);
        }

        // Start animation
        animate();

        // Mark board as ready for multiplayer integration
        if (holeRegistry && holeRegistry.size > 0) {
            window.boardReady = true;
            console.log('✅ boardReady set in init()');
        }

        console.log('✅ init() completed, holeRegistry.size =', holeRegistry.size);
    } catch (e) {
        console.error('❌ init() error:', e);
        // Surface unexpected init errors visibly so they aren't silently swallowed
        const errMsg = document.createElement('div');
        errMsg.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(200,30,30,0.9);color:#fff;padding:12px 24px;border-radius:8px;font-family:sans-serif;z-index:99999;';
        errMsg.textContent = '⚠️ 3D board failed to initialize. Try refreshing the page.';
        document.body.appendChild(errMsg);
    }
}

// ============================================================
// LIGHTING - Enhanced for shiny materials
// ============================================================

function setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(200, 500, 200);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-200, 300, -200);
    scene.add(fillLight);

    // Rim light for highlights
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 100, -400);
    scene.add(rimLight);

    // Point light above center for bullseye glow
    const centerLight = new THREE.PointLight(0xffffff, 0.5, 200);
    centerLight.position.set(0, 100, 0);
    scene.add(centerLight);
}

// ============================================================
// HEXAGON BOARD
// ============================================================

function createHexagonBoard() {
    const shape = new THREE.Shape();

    // Create hexagon vertices
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        const x = Math.cos(angle) * BOARD_RADIUS;
        const y = Math.sin(angle) * BOARD_RADIUS;
        if (i === 0) {
            shape.moveTo(x, y);
        } else {
            shape.lineTo(x, y);
        }
    }
    shape.closePath();

    const extrudeSettings = {
        depth: BOARD_THICKNESS,
        bevelEnabled: true,
        bevelThickness: 3,
        bevelSize: 3,
        bevelSegments: 5
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -BOARD_THICKNESS / 2, 0);

    // Procedural wood-grain texture via canvas (no external asset dependency)
    const woodCanvas = document.createElement('canvas');
    woodCanvas.width = 512;
    woodCanvas.height = 512;
    const woodCtx = woodCanvas.getContext('2d');

    // Base warm tan fill
    woodCtx.fillStyle = '#d4a574';
    woodCtx.fillRect(0, 0, 512, 512);

    // Layered wood grain rings — lighter and darker streaks
    const grainColors = ['rgba(180,120,60,0.18)', 'rgba(210,160,90,0.22)', 'rgba(150,90,40,0.15)', 'rgba(230,180,110,0.20)'];
    for (let g = 0; g < 28; g++) {
        const y0 = (g / 28) * 512;
        const waviness = 12 + Math.sin(g * 1.3) * 8;
        woodCtx.beginPath();
        woodCtx.moveTo(0, y0);
        for (let x = 0; x <= 512; x += 16) {
            const dy = Math.sin((x / 512) * Math.PI * 4 + g * 0.7) * waviness;
            woodCtx.lineTo(x, y0 + dy);
        }
        woodCtx.lineWidth = 2 + Math.abs(Math.sin(g * 0.9)) * 3;
        woodCtx.strokeStyle = grainColors[g % grainColors.length];
        woodCtx.stroke();
    }

    // Subtle diagonal cross-grain for cardboard texture
    for (let c = 0; c < 10; c++) {
        woodCtx.beginPath();
        woodCtx.moveTo(c * 55, 0);
        woodCtx.lineTo(c * 55 + 512, 512);
        woodCtx.lineWidth = 1;
        woodCtx.strokeStyle = 'rgba(160,100,50,0.07)';
        woodCtx.stroke();
    }

    const woodTexture = new THREE.CanvasTexture(woodCanvas);
    woodTexture.wrapS = THREE.RepeatWrapping;
    woodTexture.wrapT = THREE.RepeatWrapping;
    woodTexture.repeat.set(3, 3);

    // Wood material per BOARD_BUILDING_SPEC: roughness 0.7, metalness 0.1
    const material = new THREE.MeshStandardMaterial({
        map: woodTexture,
        color: 0xd4a574,
        roughness: 0.7,
        metalness: 0.1
    });

    const board = new THREE.Mesh(geometry, material);
    board.receiveShadow = true;
    boardGroup.add(board);

    // Store reference for theme updates
    boardMesh = board;
}

// ============================================================
// RAINBOW BORDER - 6 edge segments with continuous rainbow gradient
// ============================================================

/**
 * Build a canvas texture that blends from colorA to colorB left-to-right.
 * Each segment transitions into the next, creating a seamless rainbow around
 * all six edges of the hexagonal board.
 */
function createGradientBorderTexture(colorA, colorB) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Convert packed hex int to CSS rgb string
    function hexToRgb(hex) {
        const r = (hex >> 16) & 0xff;
        const g = (hex >> 8) & 0xff;
        const b = hex & 0xff;
        return `rgb(${r},${g},${b})`;
    }

    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, hexToRgb(colorA));
    grad.addColorStop(0.5, hexToRgb(colorA));   // hold center so transition is near edges
    grad.addColorStop(1, hexToRgb(colorB));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 64);

    // Subtle gloss highlight along the top quarter
    const gloss = ctx.createLinearGradient(0, 0, 0, 64);
    gloss.addColorStop(0, 'rgba(255,255,255,0.30)');
    gloss.addColorStop(0.25, 'rgba(255,255,255,0.10)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

function createRainbowBorder() {
    // Clear existing border segments
    borderSegments = [];

    // Border uses golden ratio constants BORDER_WIDTH and BORDER_HEIGHT
    for (let i = 0; i < 6; i++) {
        const angle1 = (i * Math.PI / 3) - Math.PI / 6;
        const angle2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;

        const x1 = Math.cos(angle1) * BOARD_RADIUS;
        const z1 = Math.sin(angle1) * BOARD_RADIUS;
        const x2 = Math.cos(angle2) * BOARD_RADIUS;
        const z2 = Math.sin(angle2) * BOARD_RADIUS;

        // Calculate exact edge length — no overlap
        const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const edgeAngle = Math.atan2(z2 - z1, x2 - x1);

        // Gradient from this player's color to the next, creating a seamless rainbow
        const colorA = RAINBOW_COLORS[i];
        const colorB = RAINBOW_COLORS[(i + 1) % 6];
        const gradientTex = createGradientBorderTexture(colorA, colorB);

        const geometry = new THREE.BoxGeometry(length, BORDER_HEIGHT, BORDER_WIDTH);
        const material = new THREE.MeshStandardMaterial({
            map: gradientTex,
            roughness: 0.25,
            metalness: 0.55,
            emissive: new THREE.Color(colorA),
            emissiveIntensity: 0.12
        });

        const segment = new THREE.Mesh(geometry, material);
        segment.position.set(midX, 5, midZ);  // Raised to avoid z-fighting with board
        segment.rotation.y = -edgeAngle;
        segment.userData.playerIndex = i;  // Store player index for theme updates
        boardGroup.add(segment);
        borderSegments.push(segment);  // Store reference
    }
}

// ============================================================
// DRAW GAME ELEMENTS - Holes, pentagons, and bullseye
// ============================================================

function drawSchemaLines() {
    // Uses global LINE_HEIGHT constant (golden ratio Level 2)

    // Key radius calculations
    const innerRadius = BOARD_RADIUS / 3;
    const outerRadius = BOARD_RADIUS * Math.cos(Math.PI / 6);  // R * cos(30°) ≈ 260
    const innerHexRadius = innerRadius / Math.cos(Math.PI / 6);  // ~115.5
    const wedgeFactor = 0.85;  // How much narrower at outer edge

    // FAST TRACK HOLES - one at each inner hexagon corner (where pie lines meet)
    const HOLE_RADIUS = 6;
    const PENTAGON_SIZE = 18;  // Pentagon outer size

    for (let i = 0; i < 6; i++) {
        // Hexagon corner angle - each pentagon points to a corner of the main hexagon
        const cornerAngle = (i * Math.PI / 3) - Math.PI / 6;

        // Pentagon shape surrounding the hole (color matches border to the right)
        // Flat edge faces center, point faces outward toward hexagon corner
        const pentShape = new THREE.Shape();
        for (let p = 0; p < 5; p++) {
            // Pentagon with point at top (in local coordinates)
            const pentAngle = (p * 2 * Math.PI / 5) - Math.PI / 2;
            const px = Math.cos(pentAngle) * PENTAGON_SIZE;
            const pz = Math.sin(pentAngle) * PENTAGON_SIZE;
            if (p === 0) pentShape.moveTo(px, pz);
            else pentShape.lineTo(px, pz);
        }
        pentShape.closePath();

        // Cut hole in center
        const holePath = new THREE.Path();
        for (let h = 0; h < 32; h++) {
            const hAngle = (h * 2 * Math.PI / 32);
            const hx = Math.cos(hAngle) * HOLE_RADIUS;
            const hz = Math.sin(hAngle) * HOLE_RADIUS;
            if (h === 0) holePath.moveTo(hx, hz);
            else holePath.lineTo(hx, hz);
        }
        holePath.closePath();
        pentShape.holes.push(holePath);

        // Position pentagon so flat base is on inner circle
        const baseDistance = PENTAGON_SIZE * Math.cos(Math.PI / 5);  // ~14.5
        const pentCenterRadius = innerRadius + baseDistance;
        const pentX = Math.cos(cornerAngle) * pentCenterRadius;
        const pentZ = Math.sin(cornerAngle) * pentCenterRadius;

        // Create pentagon mesh with shiny material
        const pentGeo = new THREE.ShapeGeometry(pentShape);
        const pentMat = createShinyMaterial(RAINBOW_COLORS[i], true);
        const pentagon = new THREE.Mesh(pentGeo, pentMat);
        pentagon.rotation.x = -Math.PI / 2;
        // Rotate so point faces outward along the corner angle
        // Shape is drawn with point at +Y (local), after rotation.x it points to -Z
        // We need to rotate around Y to align with cornerAngle
        pentagon.rotation.z = -cornerAngle + Math.PI / 2;
        pentagon.position.set(pentX, LINE_HEIGHT, pentZ);
        boardGroup.add(pentagon);
        coloredMarkers.push({ mesh: pentagon, playerIndex: i });

        // Create hole (cylinder) at pentagon center
        const holeGeo = new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, 5, 16);
        const holeMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.8
        });
        const holeMesh = new THREE.Mesh(holeGeo, holeMat);
        holeMesh.position.set(pentX, LINE_HEIGHT - 2, pentZ);
        boardGroup.add(holeMesh);

        // Register fast track hole in manifold substrate
        const ftHole = createHole(`ft-${i}`, 'fasttrack', i, pentX, LINE_HEIGHT - 2, pentZ, 'pentagon', {
            isFastTrack: true,
            isFastTrackEntry: true,  // Each ft-{i} is entry point for player i
            isFastTrackExit: true    // Also exit point when landing on own ft-{i}
        });
        ftHole.mesh = holeMesh;
    }

    // CENTER BULLSEYE - target with all player colors (using global golden ratio constants)
    const bullseyeY = LINE_HEIGHT;

    // Draw rings from outside in (so inner rings are on top)
    for (let r = 5; r >= 0; r--) {
        const outerR = CENTER_HOLE_RADIUS + RING_WIDTH * (r + 1);
        const innerR = CENTER_HOLE_RADIUS + RING_WIDTH * r;

        // Create ring shape
        const ringShape = new THREE.Shape();
        for (let a = 0; a <= 64; a++) {
            const angle = (a / 64) * Math.PI * 2;
            const x = Math.cos(angle) * outerR;
            const z = Math.sin(angle) * outerR;
            if (a === 0) ringShape.moveTo(x, z);
            else ringShape.lineTo(x, z);
        }
        ringShape.closePath();

        // Cut inner hole
        const innerHole = new THREE.Path();
        for (let a = 0; a <= 64; a++) {
            const angle = (a / 64) * Math.PI * 2;
            const x = Math.cos(angle) * innerR;
            const z = Math.sin(angle) * innerR;
            if (a === 0) innerHole.moveTo(x, z);
            else innerHole.lineTo(x, z);
        }
        innerHole.closePath();
        ringShape.holes.push(innerHole);

        const ringGeo = new THREE.ShapeGeometry(ringShape);
        const ringMat = createShinyMaterial(RAINBOW_COLORS[r], false);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = bullseyeY;
        boardGroup.add(ring);
        coloredMarkers.push({ mesh: ring, playerIndex: r });
    }

    // Center hole
    const centerHoleGeo = new THREE.CylinderGeometry(CENTER_HOLE_RADIUS, CENTER_HOLE_RADIUS, 5, 32);
    const centerHoleMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.8
    });
    const centerHoleMesh = new THREE.Mesh(centerHoleGeo, centerHoleMat);
    centerHoleMesh.position.set(0, bullseyeY - 2, 0);
    boardGroup.add(centerHoleMesh);

    // CIRCLE between bullseye and pentagons - with branding text
    const bullseyeOuterRadius = CENTER_HOLE_RADIUS + RING_WIDTH * 6;  // Golden proportioned
    const dividerRadius = (bullseyeOuterRadius + innerRadius) / 2;  // Midpoint between bullseye and inner radius

    // BRANDING RING with curved gradient text on divider circle
    createBrandingRing(dividerRadius, bullseyeY + 1);

    // Register center hole in manifold substrate
    const centerHoleObj = createHole('center', 'center', -1, 0, bullseyeY - 2, 0, 'bullseye', {
        isBullseye: true
    });
    centerHoleObj.mesh = centerHoleMesh;
    centerHoleObj.radius = CENTER_HOLE_RADIUS;

    // WEDGE TRACK HOLES - 5 holes along outer edge of each wedge (near colored borders)
    // Spacing must match the side holes
    const TRACK_HOLE_RADIUS = 6;

    for (let i = 0; i < 6; i++) {
        // ============================================================
        // PLAYER SECTION LAYOUT: 6 holes per section
        // 1 FT pentagon + 4 outer edge + 1 home/diamond
        // ============================================================

        // Fast track hole positions (at inner hexagon corners)
        const cornerAngle1 = (i * Math.PI / 3) - Math.PI / 6;  // Left FT for this player
        const cornerAngle2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;  // Right FT (next player's)
        const ftX1 = Math.cos(cornerAngle1) * innerHexRadius;
        const ftZ1 = Math.sin(cornerAngle1) * innerHexRadius;
        const ftX2 = Math.cos(cornerAngle2) * innerHexRadius;
        const ftZ2 = Math.sin(cornerAngle2) * innerHexRadius;

        // Wedge mid-angle (points from center toward middle of outer edge)
        const wedgeMidAngle = (cornerAngle1 + cornerAngle2) / 2;

        // Direction vectors:
        // - radialDir: points OUTWARD from center (perpendicular to outer edge = along safe zone)
        // - tangentDir: points along outer edge (LEFT to RIGHT from player's perspective)
        const radialDirX = Math.cos(wedgeMidAngle);
        const radialDirZ = Math.sin(wedgeMidAngle);
        const tangentDirX = -radialDirZ;  // Perpendicular to radial (counterclockwise)
        const tangentDirZ = radialDirX;

        // Outer edge center point (slightly inward from edge so holes are on the board)
        const outerTrackInset = 15;  // Inset from board edge
        const outerCenterX = radialDirX * (outerRadius - outerTrackInset);
        const outerCenterZ = radialDirZ * (outerRadius - outerTrackInset);

        // Hole spacing - calculated to fit 6 holes from outer edge to near FT holes
        // Distance from outer edge to inner hex radius is about: outerRadius - innerHexRadius ≈ 260 - 115 = 145
        // We need 6 side holes, so spacing should be about 145/7 ≈ 20.7
        const sideTrackLength = outerRadius - innerHexRadius - 20; // Leave gap near FT
        const holeSpacing = sideTrackLength / 6;  // ~20 units between holes

        // ── OUTER EDGE: 5 holes centered on the outer edge ──
        // Holes are placed along the tangent direction
        const outerHolePositions = [];
        for (let h = 0; h < 5; h++) {
            const offset = (h - 2) * holeSpacing;  // -2, -1, 0, 1, 2 spacing from center
            const holeX = outerCenterX + tangentDirX * offset;
            const holeZ = outerCenterZ + tangentDirZ * offset;
            outerHolePositions.push({ x: holeX, z: holeZ });

            const trackHoleGeo = new THREE.CylinderGeometry(TRACK_HOLE_RADIUS, TRACK_HOLE_RADIUS, 5, 16);
            const trackHoleMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.8
            });
            const trackHoleMesh = new THREE.Mesh(trackHoleGeo, trackHoleMat);
            trackHoleMesh.position.set(holeX, LINE_HEIGHT - 2, holeZ);
            boardGroup.add(trackHoleMesh);

            // Register outer track hole (h=4 is home/winner hole)
            const holeType = (h === 4) ? 'home' : 'outer';
            const holeId = (h === 4) ? `home-${i}` : `outer-${i}-${h}`;

            // Build properties based on hole position
            const holeProps = { isOuterTrack: true };
            if (h === 2) {
                holeProps.isSafeZoneEntry = true;  // Safe zone pivot point (center)
            }
            if (h === 4) {
                holeProps.isHoldingExit = true;    // Entry point from holding pen (rightmost)
            }

            const outerHole = createHole(holeId, holeType, i, holeX, LINE_HEIGHT - 2, holeZ, (h === 4) ? 'diamond' : null, holeProps);
            outerHole.mesh = trackHoleMesh;
        }

        // Positions of corner holes for reference
        const leftCornerX = outerHolePositions[0].x;
        const leftCornerZ = outerHolePositions[0].z;
        const rightCornerX = outerHolePositions[4].x;  // Home hole position
        const rightCornerZ = outerHolePositions[4].z;

        // HOME/WINNER HOLE - diamond shape around rightmost hole (hole 5)
        const diamondShape = new THREE.Shape();
        diamondShape.moveTo(0, DIAMOND_SIZE);     // Top
        diamondShape.lineTo(DIAMOND_SIZE, 0);     // Right
        diamondShape.lineTo(0, -DIAMOND_SIZE);    // Bottom
        diamondShape.lineTo(-DIAMOND_SIZE, 0);    // Left
        diamondShape.closePath();

        // Cut hole in center of diamond
        const diamondHolePath = new THREE.Path();
        for (let dh = 0; dh < 32; dh++) {
            const dhAngle = (dh * 2 * Math.PI / 32);
            const dhx = Math.cos(dhAngle) * TRACK_HOLE_RADIUS;
            const dhz = Math.sin(dhAngle) * TRACK_HOLE_RADIUS;
            if (dh === 0) diamondHolePath.moveTo(dhx, dhz);
            else diamondHolePath.lineTo(dhx, dhz);
        }
        diamondHolePath.closePath();
        diamondShape.holes.push(diamondHolePath);

        const diamondGeo = new THREE.ShapeGeometry(diamondShape);
        const diamondMat = createShinyMaterial(RAINBOW_COLORS[i], true);
        const diamond = new THREE.Mesh(diamondGeo, diamondMat);
        diamond.rotation.x = -Math.PI / 2;
        diamond.position.set(rightCornerX, LINE_HEIGHT, rightCornerZ);
        boardGroup.add(diamond);
        coloredMarkers.push({ mesh: diamond, playerIndex: i });

        // ── INWARD DIRECTION: used by safe zone and winner hole ──
        const inwardDirX = -radialDirX;  // Points toward center
        const inwardDirZ = -radialDirZ;

        // ── SIDE-LEFT: 4 holes from left outer corner inward toward left FT pentagon ──
        // IDs 1-4: 1=near FT, 4=near outer corner (matches smart_peg.js convention)
        for (let h = 0; h < 4; h++) {
            const t = (h + 1) / 5;  // Evenly spaced between corner and FT hole
            const holeX = leftCornerX + (ftX1 - leftCornerX) * t;
            const holeZ = leftCornerZ + (ftZ1 - leftCornerZ) * t;

            const sideHoleGeo = new THREE.CylinderGeometry(TRACK_HOLE_RADIUS, TRACK_HOLE_RADIUS, 5, 16);
            const sideHoleMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.8
            });
            const sideHoleMesh = new THREE.Mesh(sideHoleGeo, sideHoleMat);
            sideHoleMesh.position.set(holeX, LINE_HEIGHT - 2, holeZ);
            boardGroup.add(sideHoleMesh);

            // h=0 is near corner (ID=4), h=3 is near FT (ID=1)
            const sideHole = createHole(`side-left-${i}-${4 - h}`, 'outer', i, holeX, LINE_HEIGHT - 2, holeZ, null, { isOuterTrack: true });
            sideHole.mesh = sideHoleMesh;
        }

        // ── SIDE-RIGHT: 4 holes from right outer corner (home) inward toward right FT pentagon ──
        // IDs 1-4: 1=near FT, 4=near home corner (matches smart_peg.js convention)
        for (let h = 0; h < 4; h++) {
            const t = (h + 1) / 5;  // Evenly spaced between corner and FT hole
            const holeX = rightCornerX + (ftX2 - rightCornerX) * t;
            const holeZ = rightCornerZ + (ftZ2 - rightCornerZ) * t;

            const sideHoleGeo = new THREE.CylinderGeometry(TRACK_HOLE_RADIUS, TRACK_HOLE_RADIUS, 5, 16);
            const sideHoleMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.8
            });
            const sideHoleMesh = new THREE.Mesh(sideHoleGeo, sideHoleMat);
            sideHoleMesh.position.set(holeX, LINE_HEIGHT - 2, holeZ);
            boardGroup.add(sideHoleMesh);

            // h=0 is near home corner (ID=4), h=3 is near FT (ID=1)
            const sideHole = createHole(`side-right-${i}-${4 - h}`, 'outer', i, holeX, LINE_HEIGHT - 2, holeZ, null, { isOuterTrack: true });
            sideHole.mesh = sideHoleMesh;
        }

        // ── SAFE ZONE: 4 holes between the parallel lines, pointing to center ──
        // Safe zone starts from center of outer edge (outer-2) and goes INWARD
        const safeStartX = outerCenterX;  // Center of outer edge
        const safeStartZ = outerCenterZ;

        // Calculate safe zone hole positions (4 holes going inward)
        const safeHolePositions = [];
        for (let h = 1; h <= 4; h++) {
            const holeX = safeStartX + inwardDirX * (h * holeSpacing);
            const holeZ = safeStartZ + inwardDirZ * (h * holeSpacing);
            safeHolePositions.push({ x: holeX, z: holeZ });

            const safeHoleGeo = new THREE.CylinderGeometry(TRACK_HOLE_RADIUS, TRACK_HOLE_RADIUS, 5, 16);
            const safeHoleMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.8
            });
            const safeHoleMesh = new THREE.Mesh(safeHoleGeo, safeHoleMat);
            safeHoleMesh.position.set(holeX, LINE_HEIGHT - 2, holeZ);
            boardGroup.add(safeHoleMesh);

            // Register safe zone hole
            const safeHole = createHole(`safe-${i}-${h}`, 'safezone', i, holeX, LINE_HEIGHT - 2, holeZ, null, { isSafeZone: true });
            safeHole.mesh = safeHoleMesh;
        }

        // Safe zone enclosure (rounded rectangle around all 4 safe holes)
        const safeHole1X = safeHolePositions[0].x;
        const safeHole1Z = safeHolePositions[0].z;
        const safeHole4X = safeHolePositions[3].x;
        const safeHole4Z = safeHolePositions[3].z;
        const safeCenterX = (safeHole1X + safeHole4X) / 2;
        const safeCenterZ = (safeHole1Z + safeHole4Z) / 2;

        const safeZoneLength = holeSpacing * 3;  // 4 holes = 3 gaps
        const safeZoneWidth = TRACK_HOLE_RADIUS * 3;
        const cornerRadiusSafe = safeZoneWidth / 2;

        const halfLength = (safeZoneLength + safeZoneWidth) / 2;
        const halfWidth = safeZoneWidth / 2;
        const safeShape = new THREE.Shape();

        safeShape.moveTo(-halfLength + cornerRadiusSafe, -halfWidth);
        safeShape.lineTo(halfLength - cornerRadiusSafe, -halfWidth);
        safeShape.quadraticCurveTo(halfLength, -halfWidth, halfLength, -halfWidth + cornerRadiusSafe);
        safeShape.lineTo(halfLength, halfWidth - cornerRadiusSafe);
        safeShape.quadraticCurveTo(halfLength, halfWidth, halfLength - cornerRadiusSafe, halfWidth);
        safeShape.lineTo(-halfLength + cornerRadiusSafe, halfWidth);
        safeShape.quadraticCurveTo(-halfLength, halfWidth, -halfLength, halfWidth - cornerRadiusSafe);
        safeShape.lineTo(-halfLength, -halfWidth + cornerRadiusSafe);
        safeShape.quadraticCurveTo(-halfLength, -halfWidth, -halfLength + cornerRadiusSafe, -halfWidth);

        const safePlaneGeo = new THREE.ShapeGeometry(safeShape);
        const safePlaneMat = new THREE.MeshBasicMaterial({
            color: COLORS[i],
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const safePlaneMesh = new THREE.Mesh(safePlaneGeo, safePlaneMat);
        safePlaneMesh.rotation.x = -Math.PI / 2;
        safePlaneMesh.rotation.z = -wedgeMidAngle;  // Align radially with wedge
        safePlaneMesh.position.set(safeCenterX, LINE_HEIGHT - 0.5, safeCenterZ);
        boardGroup.add(safePlaneMesh);
        safeZonePlanes.push({ mesh: safePlaneMesh, playerIndex: i });

        // ── WINNER HOLE: at the end of safe zone (5th position, innermost) ──
        const winnerX = safeStartX + inwardDirX * (5 * holeSpacing);
        const winnerZ = safeStartZ + inwardDirZ * (5 * holeSpacing);

        // Create star-shaped marker for winner hole
        const starShape = new THREE.Shape();
        const starPoints = 5;
        const outerR = TRACK_HOLE_RADIUS * 2;
        const innerR = TRACK_HOLE_RADIUS * 0.8;
        for (let s = 0; s < starPoints * 2; s++) {
            const r = s % 2 === 0 ? outerR : innerR;
            const angle = (s * Math.PI) / starPoints - Math.PI / 2;
            const sx = Math.cos(angle) * r;
            const sz = Math.sin(angle) * r;
            if (s === 0) starShape.moveTo(sx, sz);
            else starShape.lineTo(sx, sz);
        }
        starShape.closePath();

        const starGeo = new THREE.ShapeGeometry(starShape);
        const starMat = new THREE.MeshBasicMaterial({
            color: 0xffd700, // Gold
            side: THREE.DoubleSide
        });
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.rotation.x = -Math.PI / 2;
        starMesh.position.set(winnerX, LINE_HEIGHT + 0.5, winnerZ);
        boardGroup.add(starMesh);

        // Register winner hole (star serves as visual marker, no cylinder needed)
        const winnerHole = createHole(`winner-${i}`, 'winner', i, winnerX, LINE_HEIGHT - 2, winnerZ, 'star', { isWinnerHole: true, isSafeZone: true });
        winnerHole.mesh = starMesh; // Use star as the hole mesh for highlighting
    }

    // ============================================================
    // GOLDEN CROWN — Glowing crown above WINNER hole when all 4 safe zone holes filled
    // ============================================================
    const goldenCrowns = [];  // Array of { mesh, pointLight, playerIndex, winnerPos }

    for (let i = 0; i < 6; i++) {
        // Get winner hole position from registry (the 5th/final hole to land on)
        const winnerHoleReg = holeRegistry.get(`winner-${i}`);
        if (!winnerHoleReg) continue;

        const hx = winnerHoleReg.position.x;
        const hz = winnerHoleReg.position.z;
        const crownY = LINE_HEIGHT + 14; // Float above the winner hole

        // Build a crown shape using a ring with 5 triangular points
        const crownGroup = new THREE.Group();

        // Crown base ring
        const ringGeo = new THREE.TorusGeometry(TRACK_HOLE_RADIUS * 1.6, 0.8, 8, 24);
        const crownMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,        // Gold
            emissive: 0xffa500,      // Warm orange glow
            emissiveIntensity: 0.6,
            metalness: 0.9,
            roughness: 0.15,
            transparent: true,
            opacity: 0.95
        });
        const ring = new THREE.Mesh(ringGeo, crownMat);
        ring.rotation.x = Math.PI / 2;
        crownGroup.add(ring);

        // Crown points (5 triangular prongs)
        for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2;
            const px = Math.cos(angle) * TRACK_HOLE_RADIUS * 1.6;
            const pz = Math.sin(angle) * TRACK_HOLE_RADIUS * 1.6;

            const pointGeo = new THREE.ConeGeometry(1.2, 4, 4);
            const pointMesh = new THREE.Mesh(pointGeo, crownMat);
            pointMesh.position.set(px, 2, pz);
            crownGroup.add(pointMesh);
        }

        // Gem on top of each point (small sphere)
        for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2;
            const gx = Math.cos(angle) * TRACK_HOLE_RADIUS * 1.6;
            const gz = Math.sin(angle) * TRACK_HOLE_RADIUS * 1.6;

            const gemGeo = new THREE.SphereGeometry(0.6, 8, 8);
            const gemMat = new THREE.MeshStandardMaterial({
                color: RAINBOW_COLORS[i],  // Player's color
                emissive: RAINBOW_COLORS[i],
                emissiveIntensity: 0.8,
                metalness: 0.7,
                roughness: 0.2
            });
            const gem = new THREE.Mesh(gemGeo, gemMat);
            gem.position.set(gx, 4.2, gz);
            crownGroup.add(gem);
        }

        // Point light for golden glow effect
        const crownLight = new THREE.PointLight(0xffd700, 0, 40);
        crownLight.position.set(0, 2, 0);
        crownGroup.add(crownLight);

        crownGroup.position.set(hx, crownY, hz);
        crownGroup.visible = false;  // Hidden until 4 safe zone pegs
        boardGroup.add(crownGroup);

        goldenCrowns.push({
            mesh: crownGroup,
            pointLight: crownLight,
            material: crownMat,
            playerIndex: i,
            active: false,
            winnerPos: { x: hx, y: LINE_HEIGHT, z: hz }  // World position of winner hole
        });
    }

    // Export crowns for access from animate loop and update functions
    window._goldenCrowns = goldenCrowns;

    // ── Crown tagline DOM overlay ──────────────────────────────────────
    let _crownTaglineEl = null;
    function _showCrownTagline(playerIndex, playerColor) {
        _hideCrownTagline();
        const el = document.createElement('div');
        el.id = 'crown-tagline-overlay';
        el.style.cssText = [
            'position:fixed', 'bottom:22%', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(0,0,0,0.72)', 'border:2px solid gold',
            'border-radius:12px', 'padding:14px 28px', 'z-index:3500',
            'text-align:center', 'pointer-events:none',
            'animation:crownTaglineFade 0.5s ease-out'
        ].join(';');
        el.innerHTML = `<div style="font-size:2rem;line-height:1">👑</div>
                <div style="color:gold;font-size:1.15rem;font-weight:700;margin-top:4px;text-shadow:0 0 12px gold">
                    Land here to WIN the Crown!
                </div>`;
        document.body.appendChild(el);
        _crownTaglineEl = el;
        // Auto-hide after 5 s so it doesn't block gameplay permanently
        setTimeout(_hideCrownTagline, 5000);
    }
    function _hideCrownTagline() {
        if (_crownTaglineEl) { _crownTaglineEl.remove(); _crownTaglineEl = null; }
    }
    // Inject keyframe if not already present
    if (!document.getElementById('crown-tagline-style')) {
        const st = document.createElement('style');
        st.id = 'crown-tagline-style';
        st.textContent = '@keyframes crownTaglineFade{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
        document.head.appendChild(st);
    }
    window._hideCrownTagline = _hideCrownTagline;

    // Check and toggle crown visibility for a player
    window.updateGoldenCrown = function (playerIndex, safeZoneCount) {
        const crown = goldenCrowns[playerIndex];
        if (!crown) return;

        if (safeZoneCount >= 4 && !crown.active) {
            crown.mesh.visible = true;
            crown.active = true;
            crown.pointLight.intensity = 2.5;
            console.log(`👑 Golden crown ACTIVATED for player ${playerIndex}!`);

            // Camera cut to winner hole + tagline overlay
            const wp = crown.winnerPos;
            if (wp && typeof smoothCameraTransition === 'function') {
                // Position camera above and slightly back from the winner hole
                const camOffset = new THREE.Vector3(wp.x, wp.y + 55, wp.z + 40);
                const lookAt = new THREE.Vector3(wp.x, wp.y, wp.z);
                smoothCameraTransition(camOffset, lookAt, 1800, null);
            }
            // Get player color from RAINBOW_COLORS if available
            const pColor = (typeof RAINBOW_COLORS !== 'undefined' && RAINBOW_COLORS[playerIndex])
                ? RAINBOW_COLORS[playerIndex] : 0xffd700;
            _showCrownTagline(playerIndex, pColor);

        } else if (safeZoneCount < 4 && crown.active) {
            crown.mesh.visible = false;
            crown.active = false;
            crown.pointLight.intensity = 0;
            _hideCrownTagline();
            console.log(`👑 Golden crown deactivated for player ${playerIndex}`);
        }
    };

    // HOLDING AREA - 4 holes (2x2) in a colored circle (using global HOLDING constants)
    for (let i = 0; i < 6; i++) {
        // Position holding area in the corner region, to the right of the player's wedge
        // Place it between the two pie lines, closer to the outer edge
        const angle1 = (i * Math.PI / 3) - Math.PI / 6;
        const angle2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;

        // Position at about 80% of the way toward corner, biased to the right side
        const holdingAngle = angle2 - (angle2 - angle1) * 0.08;  // More to the right
        const holdingRadius = BOARD_RADIUS * 0.82;  // Closer to hexagon edge

        const holdX = Math.cos(holdingAngle) * holdingRadius;
        const holdZ = Math.sin(holdingAngle) * holdingRadius;

        // Create colored circle with shiny material - smaller size
        const smallerCircleRadius = HOLDING_CIRCLE_RADIUS * 0.7;  // 70% of original
        const circleGeo = new THREE.CircleGeometry(smallerCircleRadius, 32);
        const circleMat = createShinyMaterial(RAINBOW_COLORS[i], false);
        const holdingCircle = new THREE.Mesh(circleGeo, circleMat);
        holdingCircle.rotation.x = -Math.PI / 2;
        holdingCircle.position.set(holdX, LINE_HEIGHT, holdZ);
        boardGroup.add(holdingCircle);
        coloredMarkers.push({ mesh: holdingCircle, playerIndex: i });

        // Create 4 holes in 2x2 grid - rotated to align with hexagon
        const cosA = Math.cos(holdingAngle);
        const sinA = Math.sin(holdingAngle);
        const offsets = [
            [-HOLDING_HOLE_SPACING / 2, -HOLDING_HOLE_SPACING / 2],
            [HOLDING_HOLE_SPACING / 2, -HOLDING_HOLE_SPACING / 2],
            [-HOLDING_HOLE_SPACING / 2, HOLDING_HOLE_SPACING / 2],
            [HOLDING_HOLE_SPACING / 2, HOLDING_HOLE_SPACING / 2]
        ];

        let holdIdx = 0;
        for (const [localX, localZ] of offsets) {
            // Rotate offset to align with radial direction
            const rotatedX = localX * cosA - localZ * sinA;
            const rotatedZ = localX * sinA + localZ * cosA;

            const holeGeo = new THREE.CylinderGeometry(TRACK_HOLE_RADIUS, TRACK_HOLE_RADIUS, 5, 16);
            const holeMat = new THREE.MeshStandardMaterial({
                color: 0x222222,
                roughness: 0.8
            });
            const holeMesh = new THREE.Mesh(holeGeo, holeMat);
            const holeX = holdX + rotatedX;
            const holeZ = holdZ + rotatedZ;
            holeMesh.position.set(holeX, LINE_HEIGHT - 2, holeZ);
            boardGroup.add(holeMesh);

            // Register holding area hole
            const holdHole = createHole(`hold-${i}-${holdIdx}`, 'holding', i, holeX, LINE_HEIGHT - 2, holeZ, null, { isHolding: true });
            holdHole.mesh = holeMesh;
            holdIdx++;
        }
    }

    // Log hole registry summary
    console.log(`Hole Registry created: ${holeRegistry.size} holes`);
    const typeCounts = {};
    holeRegistry.forEach(h => {
        typeCounts[h.type] = (typeCounts[h.type] || 0) + 1;
    });
    console.log('Hole types:', typeCounts);
}

// ============================================================
// CREATE PEGS AND PLACE IN START POSITIONS
// ============================================================

function clearAllPegs() {
    // Remove all pegs from scene and registry
    pegRegistry.forEach((peg, id) => {
        if (peg.mesh) {
            // Remove from scene (where pegs are actually added)
            scene.remove(peg.mesh);
            // Dispose of geometry and materials to free memory
            if (peg.bodyMesh) {
                peg.bodyMesh.geometry.dispose();
                peg.bodyMesh.material.dispose();
            }
            if (peg.discMesh) {
                peg.discMesh.geometry.dispose();
                peg.discMesh.material.dispose();
            }
        }
        // Clear hole occupancy
        const hole = holeRegistry.get(peg.currentHole);
        if (hole) {
            hole.occupied = false;
            hole.occupiedBy = null;
        }
    });
    pegRegistry.clear();
    console.log('[clearAllPegs] All pegs cleared from scene and registry');
}

// Map player index to balanced board position
// For 3 players: use positions 0, 2, 4 (every other slot)
// For 4 players: use positions 0, 1, 3, 4 (skip 2 and 5)
// For 2 players: use positions 0, 3 (opposite sides)
// For 5/6 players: use all positions
function getBalancedBoardPosition(playerIdx, playerCount) {
    if (playerCount === 2) {
        return [0, 3][playerIdx];  // Opposite sides
    } else if (playerCount === 3) {
        return [0, 2, 4][playerIdx];  // Every other position
    } else if (playerCount === 4) {
        return [0, 1, 3, 4][playerIdx];  // Skip 2 and 5
    } else {
        return playerIdx;  // 5 or 6 players use all positions
    }
}

function createPegsAndPlace(playerCount) {
    // Use passed count or global activePlayerCount
    const count = playerCount || activePlayerCount;

    // Clear existing pegs first
    clearAllPegs();

    // For each active player, create 5 pegs:
    // - 4 in holding area
    // - 1 on home/winner hole (starts in play)
    for (let playerIdx = 0; playerIdx < count; playerIdx++) {
        // Get the balanced board position for this player
        const boardPos = getBalancedBoardPosition(playerIdx, count);

        // Place 4 pegs in holding area (matching 2x2 grid)
        for (let pegIdx = 0; pegIdx < 4; pegIdx++) {
            const holeId = `hold-${boardPos}-${pegIdx}`;
            const pegId = `peg-${playerIdx}-${pegIdx}`;
            createPeg(pegId, playerIdx, holeId, boardPos);  // Pass boardPos for color
        }

        // Place 5th peg on home/winner hole (starts in play)
        const homeHoleId = `home-${boardPos}`;
        const homePegId = `peg-${playerIdx}-4`;
        createPeg(homePegId, playerIdx, homeHoleId, boardPos);  // Pass boardPos for color
    }

    console.log(`Peg Registry created: ${pegRegistry.size} pegs`);

    // Update stats display
    const statsDiv = document.getElementById('stats');
    if (statsDiv) {
        statsDiv.innerHTML = `Holes: ${holeRegistry.size} | Pegs: ${pegRegistry.size}`;
    }
}

// ============================================================
// CAMERA VIEWS
// ============================================================

function setCameraView(viewName) {
    const views = {
        'top': { pos: [0, 700, 0], target: [0, 0, 0] },
        'angle': { pos: [0, 500, 400], target: [0, 0, 0] },
        'side': { pos: [500, 100, 0], target: [0, 0, 0] }
    };

    const view = views[viewName];
    if (!view) return;

    camera.position.set(view.pos[0], view.pos[1], view.pos[2]);
    camera.lookAt(view.target[0], view.target[1], view.target[2]);
    controls.target.set(view.target[0], view.target[1], view.target[2]);
}

// ============================================================
// SMOOTH CAMERA TRANSITIONS
// ============================================================

let cameraTransition = null;
let userOverrideCamera = false;
let userIsInteracting = false;  // true while mouse/touch is down on canvas
let userInteractionTimeout = null;  // smooth-return delay timer
let cameraMode = 'cinematic'; // 'cinematic' = auto-follow, 'manual' = user control
let activePegTracking = null; // Ref to peg being tracked for smooth follow
// Pointer tracking to determine deliberate pan/rotate vs click
let _pointerStart = null;
let _pointerMoved = false;
const POINTER_MOVE_THRESHOLD = 8; // pixels
// When user drags during auto mode: temp explore state (resets next turn, no snap-back).
// This is distinct from explicit lock (fixedViewsActive) which never auto-resets.
let _tempManualOverride = false;

// Saved camera state for smooth return after user releases mouse
let savedCameraTarget = null;

// ============================================================
// LEADING PEG TRACKING
// Camera follows the leading peg (furthest along track) unless
// a special event occurs (FastTrack, bullseye, safe zone, etc.)
// ============================================================

// Track position priority for determining leading peg
// Higher number = further along track
function getPegTrackProgress(peg) {
    if (!peg || !peg.holeId) return -100;
    const holeId = peg.holeId;

    // Winning = furthest possible
    if (holeId.includes('winner')) return 1000;

    // Safe zone positions (progressively closer to win)
    if (holeId.startsWith('safe-')) {
        const safeNum = parseInt(holeId.split('-').pop()) || 0;
        return 500 + safeNum * 10; // safe-0 = 500, safe-1 = 510, etc.
    }

    // Bullseye = very close to winning
    if (holeId === 'center') return 450;

    // FastTrack holes = advantageous position
    if (holeId.startsWith('ft-')) {
        const ftNum = parseInt(holeId.replace('ft-', '')) || 0;
        return 300 + ftNum * 5;
    }

    // Outer track - most common positions
    if (holeId.startsWith('outer-')) {
        const parts = holeId.split('-');
        const section = parseInt(parts[1]) || 0;
        const hole = parseInt(parts[2]) || 0;
        return 100 + section * 10 + hole;
    }

    // Side positions
    if (holeId.startsWith('side-')) {
        const parts = holeId.split('-');
        const section = parseInt(parts[2]) || 0;
        const hole = parseInt(parts[3]) || 0;
        return 50 + section * 10 + hole;
    }

    // Home position
    if (holeId.startsWith('home-')) return 10;

    // Holding = not yet on track
    if (holeId.startsWith('hold-')) return 0;

    return 1; // Default
}

// Find the leading peg (furthest along track) for a player
function getLeadingPeg(playerIndex) {
    const player = gameState?.players?.[playerIndex];
    if (!player || !player.peg || player.peg.length === 0) return null;

    let leadingPeg = null;
    let maxProgress = -100;

    for (const peg of player.peg) {
        const progress = getPegTrackProgress(peg);
        if (progress > maxProgress) {
            maxProgress = progress;
            leadingPeg = peg;
        }
    }

    return leadingPeg;
}

// Check if a move destination is a special event that should override leading peg tracking
function isSpecialEventMove(move) {
    if (!move || !move.toHoleId) return false;
    const dest = move.toHoleId;

    // FastTrack entry or traversal
    if (dest.startsWith('ft-') || move.isFastTrackEntry) return true;

    // Bullseye/center
    if (dest === 'center') return true;

    // Safe zone entry
    if (dest.startsWith('safe-')) return true;

    // Escaping holding area (entering the board)
    if (move.fromHoleId && move.fromHoleId.startsWith('hold-')) return true;

    // Winning move
    if (dest.includes('winner')) return true;

    return false;
}

// Pan camera to a special event destination
function panToSpecialEvent(move, onComplete = null) {
    // CameraDirector handles framing. Add destination as hint for dramatic events.
    if (CameraDirector.mode === 'auto' && move && move.toHoleId) {
        const destHole = holeRegistry.get(move.toHoleId);
        if (destHole) {
            const dx = destHole.position ? destHole.position.x : destHole.x;
            const dz = destHole.position ? destHole.position.z : destHole.z;
            CameraDirector.setHint({ x: dx, y: 0, z: dz }, 3000);
        }
    }
    if (onComplete) setTimeout(onComplete, 500);
}

// ============================================================
// CAMERA VIEW SYSTEM - Multiple Adjustable Camera Modes
// ============================================================

let currentCameraView = 'smooth'; // 'smooth' (default), 'board', 'ground', 'chase', 'orbit', 'manual'
let orbitAngle = 0;
let orbitAnimationId = null;
let chaseTargetPeg = null;

// Camera speed factor: 1.0 = normal, lower = slower/smoother, higher = faster
// Default 0.6 for buttery smooth movement
let cameraSpeedFactor = 0.6;

function setCameraSpeed(value) {
    cameraSpeedFactor = parseFloat(value);
    const label = document.getElementById('camera-speed-value');
    if (label) {
        if (cameraSpeedFactor <= 0.3) label.textContent = 'Ultra Smooth';
        else if (cameraSpeedFactor <= 0.5) label.textContent = 'Very Smooth';
        else if (cameraSpeedFactor <= 0.7) label.textContent = 'Smooth';
        else if (cameraSpeedFactor <= 1.0) label.textContent = 'Normal';
        else if (cameraSpeedFactor <= 1.4) label.textContent = 'Fast';
        else label.textContent = 'Very Fast';
    }
    console.log(`[Camera] Speed set to ${cameraSpeedFactor.toFixed(1)}`);
}
window.setCameraSpeed = setCameraSpeed;

// Camera view presets
const CAMERA_VIEWS = {
    smooth: {
        name: 'Smooth Focus',
        icon: '🎥',
        description: 'Smoothly follows gameplay action (default)',
        height: 280,
        distance: 480,
        followPeg: true,
        autoOrbit: false,
        smoothFollow: true  // Gentle tracking of active peg
    },
    board: {
        name: 'Board View',
        icon: '🎯',
        description: 'Level view of the board',
        height: 200,
        distance: 450,
        followPeg: false,
        autoOrbit: false
    },
    ground: {
        name: 'Ground Level',
        icon: '🏃',
        description: 'Low angle following the action',
        height: 40,
        distance: 120,
        followPeg: true,
        autoOrbit: false
    },
    chase: {
        name: 'Chase Cam',
        icon: '🎬',
        description: 'Behind-the-peg cinematic view',
        height: 60,
        distance: 80,
        followPeg: true,
        autoOrbit: false,
        behindPeg: true
    },
    orbit: {
        name: 'Orbit',
        icon: '🌀',
        description: 'Slowly orbiting the board',
        height: 350,
        distance: 450,
        followPeg: false,
        autoOrbit: true
    },
    manual: {
        name: 'Manual',
        icon: '🎮',
        description: 'Full manual camera control',
        height: null,
        distance: null,
        followPeg: false,
        autoOrbit: false
    },
    pegeye: {
        name: "Peg's Eye",
        icon: '👁️',
        description: 'First-person view from any peg — click a peg, then pan 360°',
        height: null,
        distance: null,
        followPeg: false,
        autoOrbit: false,
        pegEye: true
    }
};

// ============================================================
// CAMERA DIRECTOR — single centralized camera controller
// Rule #1: All pegs of the active player must be visible.
// Called every frame from animate(). Uses exponential damping
// for silky-smooth motion with no jerk or double-takes.
// ============================================================
const CameraDirector = {
    mode: 'auto',          // 'auto' | 'manual' | 'fixed-straight' | 'fixed-angled'
    _pos: new THREE.Vector3(0, 200, 450),   // current camera position
    _look: new THREE.Vector3(0, 0, 0),        // current look-at target
    _tPos: new THREE.Vector3(0, 200, 450),    // target camera position
    _tLook: new THREE.Vector3(0, 0, 0),        // target look-at
    _damping: 0.04,        // exponential damping factor (0 = frozen, 1 = instant)
    _hint: null,           // temporary point-of-interest { pos, lookAt, ttl, priority }
    _hintTimer: 0,
    _movingPegPos: null,   // set by animatePegMove each frame so camera tracks the peg
    _legalMovePositions: [],  // world positions of all legal move destinations
    _lastTurnOwner: -1,
    _margin: 1.55,         // frustum safety margin (1.0 = exactly fills viewport)
    _minHeight: 120,       // never go lower than this in auto
    _maxHeight: 900,       // never go higher than this in auto
    _baseOffset: 80,       // Z offset behind center for perspective

    /** Called once per frame from animate() */
    update: function (dt) {
        if (!camera || !controls) return;
        // Skip in manual/pegeye modes — OrbitControls handles it
        if (this.mode === 'manual' || pegEyeActive || pegEyeSelectMode) return;

        // Fixed views: let OrbitControls handle mouse manipulation.
        // The initial placement is done in setBoardViewMode(); Director does nothing.
        if (this.mode === 'fixed-top' || this.mode === 'fixed-angled') {
            return;
        }

        // If user is actively dragging or has a temp override, pause auto tracking.
        // Sync internal state from camera so the resume transition is smooth.
        if (userIsInteracting || _tempManualOverride) {
            this._pos.copy(camera.position);
            this._look.copy(controls.target);
            return;
        }

        // === AUTO MODE: compute target to frame all active player pegs ===
        this._computeAutoTarget();

        // Exponential damping: current += (target - current) * factor
        const f = 1 - Math.pow(1 - this._damping, (dt || 16) / 16);
        this._pos.lerp(this._tPos, f);
        this._look.lerp(this._tLook, f);

        camera.up.set(0, 1, 0);
        camera.position.copy(this._pos);
        controls.target.copy(this._look);
        camera.lookAt(this._look);
    },

    /** Compute ideal camera position to frame all active player pegs */
    _computeAutoTarget: function () {
        const positions = this._gatherPegPositions();

        // If hint is active, include it in positions
        if (this._hint && this._hintTimer > 0) {
            this._hintTimer -= 16;
            positions.push(this._hint.pos.clone());
            if (this._hintTimer <= 0) this._hint = null;
        }

        if (positions.length === 0) {
            // No pegs on board — show the whole board
            this._tPos.set(0, 350, 400);
            this._tLook.set(0, 0, 0);
            return;
        }

        // Bounding box of all positions
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const p of positions) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const spanX = (maxX - minX) || 1;
        const spanZ = (maxZ - minZ) || 1;
        const span = Math.max(spanX, spanZ) * this._margin;

        // Required height to fit span in view (using vertical FOV)
        const fovRad = (camera.fov || 55) * Math.PI / 180;
        const aspect = camera.aspect || (window.innerWidth / window.innerHeight);
        const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
        // Use the tighter of horizontal and vertical FOV
        const effectiveFov = Math.min(fovRad, hFov);
        let reqHeight = (span / 2) / Math.tan(effectiveFov / 2);
        reqHeight = Math.max(this._minHeight, Math.min(this._maxHeight, reqHeight));

        // Dynamic angle: 33° (close-up) to 66° (wide view), rule-of-thirds range
        // Interpolate based on how high the camera needs to be (height ratio within min/max)
        const heightRatio = (reqHeight - this._minHeight) / (this._maxHeight - this._minHeight);
        const angleDeg = 33 + (66 - 33) * Math.min(1, Math.max(0, heightRatio));
        const angleRad = angleDeg * Math.PI / 180;
        const zOffset = reqHeight / Math.tan(Math.PI / 2 - angleRad);

        this._tPos.set(cx, reqHeight, cz + zOffset);
        this._tLook.set(cx, 0, cz);
    },

    /** Gather world positions of all active player's on-board pegs + highlighted destination holes */
    _gatherPegPositions: function () {
        const positions = [];
        const owner = gameState?.turnOwner ?? gameState?.currentPlayerIndex ?? -1;
        if (owner < 0 || !gameState?.players?.[owner]) return positions;

        const player = gameState.players[owner];
        if (!player.peg) return positions;

        for (const p of player.peg) {
            // Skip pegs in holding (off-board)
            if (p.holeType === 'holding' || (p.holeId && p.holeId.startsWith('hold-'))) continue;
            const reg = pegRegistry.get(p.id);
            if (reg && reg.mesh) {
                positions.push(reg.mesh.position.clone());
            }
        }

        // Include ALL legal move destination positions (set by focusOnChoices)
        for (const lp of this._legalMovePositions) {
            positions.push(lp.clone());
        }

        // Fallback: also include highlighted holes (belt-and-suspenders)
        if (typeof highlightedHoles !== 'undefined' && highlightedHoles.length > 0) {
            for (const hole of highlightedHoles) {
                if (hole && hole.mesh) {
                    positions.push(hole.mesh.position.clone());
                }
            }
        }

        // Include the currently-moving peg so camera tracks it in real time
        if (this._movingPegPos) {
            positions.push(this._movingPegPos.clone());
        }

        return positions;
    },

    /** Add a temporary point of interest (e.g., vanquish target, crown) */
    setHint: function (worldPos, durationMs) {
        durationMs = durationMs || 3000;
        this._hint = { pos: new THREE.Vector3(worldPos.x, worldPos.y || 0, worldPos.z) };
        this._hintTimer = durationMs;
    },

    /** Instantly snap to a position (no damping) */
    snapTo: function (pos, lookAt) {
        this._pos.set(pos.x, pos.y, pos.z);
        this._look.set(lookAt.x, lookAt.y, lookAt.z);
        this._tPos.copy(this._pos);
        this._tLook.copy(this._look);
        if (camera) {
            camera.position.copy(this._pos);
            camera.lookAt(this._look);
        }
        if (controls) controls.target.copy(this._look);
    },

    /** Set damping factor (0.01 = very slow, 0.15 = snappy) */
    setDamping: function (d) { this._damping = Math.max(0.005, Math.min(0.2, d)); }
};
window.CameraDirector = CameraDirector;

// ============================================================
// PEG'S EYE VIEW — First-person camera from any peg
// ============================================================
let pegEyeActive = false;
let pegEyeTargetPeg = null;      // pegRegistry entry
let pegEyeYaw = 0;               // horizontal rotation (radians)
let pegEyePitch = 0;             // vertical tilt (radians)
let pegEyeDragging = false;
let pegEyeLastX = 0;
let pegEyeLastY = 0;
let pegEyeSelectMode = false;    // waiting for user to click a peg

function enterPegEyeMode() {
    pegEyeSelectMode = true;
    pegEyeActive = false;
    pegEyeTargetPeg = null;
    pegEyeYaw = 0;
    pegEyePitch = 0;
    // Show selection prompt
    _showPegEyePrompt('👁️ Click any peg to see its point of view');
    _showPegEyeBackButton();
    // Highlight all pegs to show they're clickable
    pegRegistry.forEach(peg => {
        if (peg.bodyMesh) {
            peg._origEmissiveIntensity = peg.bodyMesh.material.emissiveIntensity;
            peg.bodyMesh.material.emissiveIntensity = 1.2;
        }
    });
    console.log("[Peg's Eye] Select mode — click any peg");
}

function _pegEyeOnClick(event) {
    if (!pegEyeSelectMode) return;
    // Raycast to find clicked peg
    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, camera);
    const hits = rc.intersectObjects(scene.children, true);
    for (const hit of hits) {
        for (const [pegId, peg] of pegRegistry) {
            if (peg.bodyMesh === hit.object || peg.discMesh === hit.object || peg.mesh === hit.object) {
                // Found a peg — activate peg eye on it
                _activatePegEye(peg);
                return;
            }
        }
    }
}

function _activatePegEye(peg) {
    pegEyeSelectMode = false;
    pegEyeActive = true;
    pegEyeTargetPeg = peg;
    pegEyeYaw = 0;
    pegEyePitch = 0.1; // slight upward look
    // Restore peg highlights
    pegRegistry.forEach(p => {
        if (p.bodyMesh && p._origEmissiveIntensity !== undefined) {
            p.bodyMesh.material.emissiveIntensity = p._origEmissiveIntensity;
        }
    });
    // Disable orbit controls while in peg eye (we handle mouse ourselves)
    if (controls) controls.enabled = false;
    userOverrideCamera = true;

    // Position camera at peg
    _updatePegEyeCamera();
    _showPegEyePrompt("👁️ " + (peg.id || 'Peg') + " — drag to pan 360°");

    console.log("[Peg's Eye] Activated on", peg.id);
}

function _updatePegEyeCamera() {
    if (!pegEyeActive || !pegEyeTargetPeg) return;
    const pos = pegEyeTargetPeg.mesh.position;
    // Camera sits at peg top height (eye level)
    const eyeHeight = pos.y + 25; // top of peg + a little above
    camera.position.set(pos.x, eyeHeight, pos.z);
    // Look direction from yaw/pitch
    const lookDist = 100;
    const lookX = pos.x + Math.sin(pegEyeYaw) * Math.cos(pegEyePitch) * lookDist;
    const lookY = eyeHeight + Math.sin(pegEyePitch) * lookDist;
    const lookZ = pos.z + Math.cos(pegEyeYaw) * Math.cos(pegEyePitch) * lookDist;
    camera.lookAt(lookX, lookY, lookZ);
    if (controls) {
        controls.target.set(lookX, lookY, lookZ);
    }
}

function _pegEyePointerDown(e) {
    if (!pegEyeActive) return;
    pegEyeDragging = true;
    pegEyeLastX = e.clientX;
    pegEyeLastY = e.clientY;
}
function _pegEyePointerMove(e) {
    if (!pegEyeActive || !pegEyeDragging) return;
    const dx = e.clientX - pegEyeLastX;
    const dy = e.clientY - pegEyeLastY;
    pegEyeLastX = e.clientX;
    pegEyeLastY = e.clientY;
    // Sensitivity
    pegEyeYaw -= dx * 0.005;
    pegEyePitch = Math.max(-0.8, Math.min(0.8, pegEyePitch + dy * 0.003));
    _updatePegEyeCamera();
}
function _pegEyePointerUp() {
    pegEyeDragging = false;
}

function exitPegEyeMode() {
    pegEyeSelectMode = false;
    pegEyeActive = false;
    pegEyeTargetPeg = null;
    pegEyeDragging = false;
    // Restore peg highlights
    pegRegistry.forEach(p => {
        if (p.bodyMesh && p._origEmissiveIntensity !== undefined) {
            p.bodyMesh.material.emissiveIntensity = p._origEmissiveIntensity;
            delete p._origEmissiveIntensity;
        }
    });
    // Re-enable orbit controls
    if (controls) controls.enabled = true;
    userOverrideCamera = false;
    // Hide prompts and back button
    _hidePegEyePrompt();
    _hidePegEyeBackButton();
    // Return to board view
    setCameraViewMode('board');
    console.log("[Peg's Eye] Exited, returned to board view");
}

// UI helpers for Peg's Eye
function _showPegEyePrompt(text) {
    let el = document.getElementById('pegeye-prompt');
    if (!el) {
        el = document.createElement('div');
        el.id = 'pegeye-prompt';
        el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:20010;' +
            'background:linear-gradient(135deg,rgba(52,152,219,0.9),rgba(155,89,182,0.85));color:#fff;' +
            'padding:12px 28px;border-radius:30px;font-family:Orbitron,Rajdhani,sans-serif;font-size:1em;' +
            'font-weight:600;letter-spacing:0.5px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);' +
            'border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);transition:opacity 0.3s;';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
}
function _hidePegEyePrompt() {
    const el = document.getElementById('pegeye-prompt');
    if (el) el.style.opacity = '0';
}

function _showPegEyeBackButton() {
    let btn = document.getElementById('pegeye-back-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'pegeye-back-btn';
        btn.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:20010;' +
            'background:linear-gradient(135deg,rgba(231,76,60,0.9),rgba(192,57,43,0.9));color:#fff;' +
            'padding:14px 32px;border-radius:30px;font-family:Orbitron,Rajdhani,sans-serif;font-size:1.05em;' +
            'font-weight:700;letter-spacing:1px;cursor:pointer;border:2px solid rgba(255,255,255,0.2);' +
            'box-shadow:0 4px 25px rgba(231,76,60,0.4);transition:transform 0.2s,box-shadow 0.2s;';
        btn.textContent = '🎯 Back to Board';
        btn.addEventListener('mouseenter', function () { this.style.transform = 'translateX(-50%) scale(1.06)'; });
        btn.addEventListener('mouseleave', function () { this.style.transform = 'translateX(-50%) scale(1)'; });
        btn.addEventListener('click', exitPegEyeMode);
        document.body.appendChild(btn);
    }
    btn.style.display = 'block';
}
function _hidePegEyeBackButton() {
    const btn = document.getElementById('pegeye-back-btn');
    if (btn) btn.style.display = 'none';
}

// Small informational popup for Fixed Views state
function showFixedViewInfo(text, duration = 2400) {
    let el = document.getElementById('fixed-views-info');
    if (!el) {
        el = document.createElement('div');
        el.id = 'fixed-views-info';
        el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:20020;' +
            'background:rgba(0,0,0,0.85);color:#fff;padding:10px 18px;border-radius:12px;' +
            'font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;pointer-events:none;' +
            'box-shadow:0 6px 30px rgba(0,0,0,0.45);transition:opacity 0.25s ease;opacity:0;';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    if (el._hideTimeout) clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// Wire mouse events for peg eye (added once, checked inside handlers)
document.addEventListener('click', _pegEyeOnClick);
document.addEventListener('pointerdown', _pegEyePointerDown);
document.addEventListener('pointermove', _pegEyePointerMove);
document.addEventListener('pointerup', _pegEyePointerUp);

// Expose globally
window.enterPegEyeMode = enterPegEyeMode;
window.exitPegEyeMode = exitPegEyeMode;

// Cycle through camera modes (for quick toggle button)
function cycleCameraMode() {
    const modes = ['smooth', 'board', 'chase', 'orbit', 'manual'];
    const currentIndex = modes.indexOf(currentCameraView);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];

    console.log(`[Camera] Cycling from ${currentCameraView} to ${nextMode}`);
    setCameraViewMode(nextMode);
}
window.cycleCameraMode = cycleCameraMode;

// Toggle camera panel visibility (for settings menu)
function toggleCameraPanel() {
    const panel = document.getElementById('camera-view-panel');
    if (panel) {
        panel.classList.toggle('visible');
    }
}
window.toggleCameraPanel = toggleCameraPanel;

// Set camera view mode
function setCameraViewMode(viewName, opts) {
    opts = opts || {};
    if (!CAMERA_VIEWS[viewName]) return;

    // If board fixed views are active (straight or angled), completely ignore
    // any attempts to change camera mode. This guarantees strict separation
    // between fixed straight / fixed angled and automatic modes.
    if (typeof boardViewMode !== 'undefined' && boardViewMode > 0) {
        try {
            const stack = (new Error().stack || '').split('\n').slice(2, 8).map(s => s.trim()).join('\n');
            console.warn('[Camera] Board fixed view active (mode', boardViewMode, ') — ignoring change to', viewName, { stack });
            window._lastCameraOverrideCaller = { time: Date.now(), caller: viewName, mode: 'boardFixed', boardViewMode, stack };
        } catch (e) {
            console.log('[Camera] Board fixed view active — ignoring change to', viewName);
        }
        return;
    }

    // If fixedViewsActive is true for other reasons, ignore changes unless forced
    if (typeof fixedViewsActive !== 'undefined' && fixedViewsActive && !opts.force) {
        console.log('[Camera] Fixed views active — ignoring change to', viewName);
        return;
    }

    // Stop any existing orbit animation
    if (orbitAnimationId) {
        cancelAnimationFrame(orbitAnimationId);
        orbitAnimationId = null;
    }

    currentCameraView = viewName;
    const view = CAMERA_VIEWS[viewName];

    // Update UI
    document.querySelectorAll('.camera-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update toggle button icon
    const btn = document.getElementById('camera-toggle-btn');
    if (btn) {
        btn.textContent = view.icon;
        btn.title = `Camera: ${view.name}`;
        btn.classList.toggle('cinematic', viewName !== 'manual');
    }

    // Hide panel after selection
    const panel = document.getElementById('camera-view-panel');
    if (panel) panel.classList.remove('visible');

    // Apply view settings
    if (viewName === 'manual') {
        userOverrideCamera = true;
        cameraMode = 'manual';
        CameraDirector.mode = 'manual';
        return;
    }

    userOverrideCamera = false;
    cameraMode = 'cinematic';
    CameraDirector.mode = 'auto';

    // Get target position (active peg or board center)
    let targetX = 0, targetZ = 0;
    const activePeg = getActivePegPosition();
    if (activePeg && view.followPeg) {
        targetX = activePeg.x;
        targetZ = activePeg.z;
    }

    if (view.autoOrbit) {
        // Start orbit animation
        startOrbitAnimation();
    } else if (view.followPeg && view.behindPeg) {
        // Chase cam - position behind the peg
        positionChaseCam(targetX, targetZ, view.height, view.distance);
    } else if (view.followPeg) {
        // Ground level - low angle facing the peg
        positionGroundCam(targetX, targetZ, view.height, view.distance);
    } else {
        // Board view - standard elevated view
        smoothCameraTransition(
            { x: 0, y: view.height, z: view.distance },
            { x: 0, y: 0, z: 0 },
            1000
        );
    }
}
window.setCameraViewMode = setCameraViewMode;

// Fixed Views Mode - Toggle between straight down and angled preset views
// These are persistent until the user toggles them off.
// 0 = off (automatic), 1 = straight down, 2 = angled
let boardViewMode = 0;
let fibonacciBackdrop = null;
// When fixedViewsActive is true, automatic camera changes are suppressed
// until the user explicitly disables fixed views.
let fixedViewsActive = false;

function setBoardViewMode() {
    const btn = document.getElementById('board-view-btn');

    // Cycle through: off -> straight down -> angled -> off
    boardViewMode = (boardViewMode + 1) % 3;

    if (boardViewMode === 0) {
        // Exit board view mode - return to automatic camera
        if (btn) {
            btn.classList.remove('active');
            btn.textContent = '🎯';
            btn.title = 'View: Auto (tap to switch to straight-down)';
            btn.setAttribute('aria-label', 'Camera view: automatic');
            try {
                btn.style.pointerEvents = '';
                btn.style.zIndex = '';
                btn.removeAttribute('data-fixed-views');
            } catch (e) { }
        }

        // Hide lava lamp backdrop
        if (fibonacciBackdrop) {
            fibonacciBackdrop.hide();
        }

        // Re-enable controls (keep them enabled for mouse manipulation)
        if (controls) {
            controls.enabled = true;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
        }
        userOverrideCamera = false;
        fixedViewsActive = false;

        // Inform user
        showFixedViewInfo('Automatic View — automatic camera enabled');

        // Reset camera up vector (may have been changed for straight-down view)
        if (camera) camera.up.set(0, 1, 0);

        // Tell CameraDirector to resume auto mode
        CameraDirector.mode = 'auto';
        currentCameraView = 'smooth';
        console.log('[Fixed Views] Exited - returned to automatic camera (CameraDirector auto)');
    } else {
        // Enter board view mode (straight down or angled)
        if (btn) {
            btn.classList.add('active');
            // Ensure the fixed-views button stays clickable even when other
            // overlays are shown (demo/promo). Bring to front and allow pointer events.
            try {
                btn.style.pointerEvents = 'auto';
                btn.style.zIndex = '100001';
                btn.setAttribute('data-fixed-views', 'true');
            } catch (e) { }
        }

        // Create and show lava lamp backdrop if not exists
        if (!fibonacciBackdrop && window.FibonacciBackdrop) {
            fibonacciBackdrop = new window.FibonacciBackdrop(scene);
            fibonacciBackdrop.create();
        }
        if (fibonacciBackdrop) {
            fibonacciBackdrop.show();
        }

        // Keep controls enabled so user can manipulate with mouse
        if (controls) {
            controls.enabled = true;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
        }

        // Apply camera placement first while allowing internal writes,
        // then enable fixed view mode so external scripts cannot override.
        // (legacy _allowCameraWrite removed — CameraDirector handles camera)

        if (camera && controls) {
            if (boardViewMode === 1) {
                // Straight down view
                // IMPORTANT: When looking straight down, the default up vector (0,1,0)
                // is parallel to the look direction (0,-1,0), creating a degenerate
                // view matrix → black screen. Use Z-axis as up instead.
                camera.up.set(0, 0, -1);
                camera.position.set(0, 700, 0);
                camera.lookAt(0, 0, 0);
                controls.target.set(0, 0, 0);
                if (btn) {
                    btn.textContent = '⬇️';
                    btn.title = 'View: Straight Down (tap for angled)';
                    btn.setAttribute('aria-label', 'Camera view: straight down');
                }
                console.log('[Fixed Views] Mode 1: Straight Down - mouse controls enabled');
                showFixedViewInfo('Straight Down View — tap 🎯 for angled');
                currentCameraView = 'fixed-straight';
                CameraDirector.mode = 'fixed-top';
            } else if (boardViewMode === 2) {
                // Angled view — restore normal up vector
                camera.up.set(0, 1, 0);
                // Angled view (45 degrees)
                const distance = 700;
                const angle = Math.PI / 4; // 45 degrees
                camera.position.set(
                    distance * Math.sin(angle),
                    distance * Math.cos(angle),
                    distance * Math.sin(angle)
                );
                camera.lookAt(0, 0, 0);
                controls.target.set(0, 0, 0);
                if (btn) {
                    btn.textContent = '↗️';
                    btn.title = 'View: Angled (tap for automatic)';
                    btn.setAttribute('aria-label', 'Camera view: angled');
                }
                console.log('[Fixed Views] Mode 2: Angled View - mouse controls enabled');
                showFixedViewInfo('Angled View — tap 🎯 for automatic');
                currentCameraView = 'fixed-angled';
                CameraDirector.mode = 'fixed-angled';
            }
        }

        // (legacy _allowCameraWrite removed — CameraDirector handles camera)

        // Now mark as fixed so external writes are blocked
        userOverrideCamera = true;
        fixedViewsActive = true;
    }
}
window.setBoardViewMode = setBoardViewMode;

// Get active peg position (current player's leading peg)
function getActivePegPosition() {
    if (!gameState) return null;

    const leadingPeg = getLeadingPeg(gameState.currentPlayerIndex);
    if (!leadingPeg || !leadingPeg.holeId) return null;

    const hole = holeRegistry.get(leadingPeg.holeId);
    if (!hole) return null;

    return {
        x: hole.position ? hole.position.x : hole.x,
        z: hole.position ? hole.position.z : hole.z,
        pegId: leadingPeg.id
    };
}

// Position camera for ground level view
function positionGroundCam(targetX, targetZ, height, distance) {
    // Calculate direction from center to target
    const dx = targetX || 0.01;
    const dz = targetZ || 0.01;
    const mag = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / mag;
    const dirZ = dz / mag;

    // Position camera slightly behind and to the side of target
    const camX = targetX - dirX * distance;
    const camZ = targetZ - dirZ * distance;

    smoothCameraTransition(
        { x: camX, y: height, z: camZ },
        { x: targetX, y: 10, z: targetZ },
        800
    );
}

// Position camera for chase cam (behind peg)
function positionChaseCam(targetX, targetZ, height, distance) {
    // Get peg's movement direction from last move or use direction from center
    const dx = targetX || 0.01;
    const dz = targetZ || 0.01;
    const mag = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / mag;
    const dirZ = dz / mag;

    // Position camera behind the peg (opposite direction of travel)
    const camX = targetX - dirX * distance;
    const camZ = targetZ - dirZ * distance;

    smoothCameraTransition(
        { x: camX, y: height, z: camZ },
        { x: targetX + dirX * 50, y: 5, z: targetZ + dirZ * 50 },
        600
    );
}

// Auto-orbit animation
function startOrbitAnimation() {
    const view = CAMERA_VIEWS.orbit;
    const radius = view.distance;
    const height = view.height;
    const speed = 0.0005 * cameraSpeedFactor; // radians per frame, scaled by speed

    function animateOrbit() {
        // Stop orbit if user takes over or manual/fixed board views are active
        if (userIsInteracting || currentCameraView === 'manual') return;
        if ((typeof boardViewMode !== 'undefined' && boardViewMode > 0) || (typeof fixedViewsActive !== 'undefined' && fixedViewsActive)) return;

        orbitAngle += speed;

        const x = Math.sin(orbitAngle) * radius;
        const z = Math.cos(orbitAngle) * radius;

        camera.position.set(x, height, z);
        controls.target.set(0, 0, 0);
        camera.lookAt(0, 0, 0);

        if (currentCameraView === 'orbit') {
            orbitAnimationId = requestAnimationFrame(animateOrbit);
        }
    }

    animateOrbit();
}

// Flag: true while a peg move animation is actively running
let _pegMoveInProgress = false;

// Update camera during peg movement — now a no-op.
// CameraDirector automatically tracks all active player pegs each frame.
function updateCameraForPegMove(pegX, pegZ) {
    // Feed the moving peg's position into CameraDirector so it stays in frame
    if (CameraDirector.mode === 'auto') {
        if (!CameraDirector._movingPegPos) {
            CameraDirector._movingPegPos = new THREE.Vector3(pegX, 0, pegZ);
            // Temporarily boost damping for snappier tracking during animation
            CameraDirector._preMoveD = CameraDirector._damping;
            CameraDirector._damping = Math.max(CameraDirector._damping, 0.10);
        } else {
            CameraDirector._movingPegPos.set(pegX, 0, pegZ);
        }
    }
    // Peg's eye mode still needs manual update
    if (pegEyeActive) _updatePegEyeCamera();
}
window.updateCameraForPegMove = updateCameraForPegMove;

// ============================================================
// PRE-CINEMATIC CAMERA — called on card draw to position the
// camera on the current player's movable peg(s) BEFORE the
// move highlights appear, so the action is always in frame.
// ============================================================
function preCinematicCamera(playerIdx, legalMoves) {
    // CameraDirector already frames all active player pegs — no-op.
}
window.preCinematicCamera = preCinematicCamera;

// Legacy toggle function (for compatibility)
function toggleCameraMode() {
    toggleCameraPanel();
}

// ============================================================
// CAMERA VIEW TOGGLE (3 modes: Automatic, Straight Down, Angled)
// ============================================================
let cameraViewMode = 'automatic'; // 'automatic', 'straight-down', 'angled'

function toggleCameraView() {
    const modes = ['automatic', 'straight-down', 'angled'];
    const currentIndex = modes.indexOf(cameraViewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    cameraViewMode = modes[nextIndex];

    const btn = document.getElementById('camera-view-toggle-btn');

    switch (cameraViewMode) {
        case 'automatic':
            // Automatic mode: follows gameplay and active peg
            userOverrideCamera = false;
            cameraMode = 'cinematic';
            if (btn) btn.title = 'Camera: Automatic (follows gameplay)';
            console.log('[Camera] Mode: Automatic - follows gameplay');
            // Return to current view default
            returnToViewDefault();
            break;

        case 'straight-down':
            // Straight down view: top-down, manual control
            userOverrideCamera = true;
            cameraMode = 'manual';
            if (btn) btn.title = 'Camera: Straight Down (manual control)';
            console.log('[Camera] Mode: Straight Down - manual control');
            // Set camera to top-down position
            camera.position.set(0, 700, 0);
            camera.lookAt(0, 0, 0);
            controls.target.set(0, 0, 0);
            break;

        case 'angled':
            // Angled view: angled perspective, manual control
            userOverrideCamera = true;
            cameraMode = 'manual';
            if (btn) btn.title = 'Camera: Angled (manual control)';
            console.log('[Camera] Mode: Angled - manual control');
            // Set camera to angled position
            camera.position.set(0, 500, 400);
            camera.lookAt(0, 0, 0);
            controls.target.set(0, 0, 0);
            break;
    }
}
window.toggleCameraView = toggleCameraView;

// ============================================================
// MUSIC TOGGLE
// ============================================================
let musicMuted = false;

function toggleMusic() {
    musicMuted = !musicMuted;
    const btn = document.getElementById('music-toggle-btn');

    if (musicMuted) {
        // Mute music
        if (btn) {
            btn.textContent = '🔇';
            btn.title = 'Music: Off (click to turn on)';
            btn.classList.add('muted');
        }
        console.log('[Music] Muted');
        // TODO: Add actual music muting logic when music system is implemented
    } else {
        // Unmute music
        if (btn) {
            btn.textContent = '🎵';
            btn.title = 'Music: On (click to turn off)';
            btn.classList.remove('muted');
        }
        console.log('[Music] Unmuted');
        // TODO: Add actual music unmuting logic when music system is implemented
    }
}
window.toggleMusic = toggleMusic;

// Track user interaction with camera
// While user is actively manipulating (mouse/touch down), ALL cinematic
// movement is blocked. After release, there's a grace period then a
// smooth transition back to the current camera mode's position.
function setupCameraInteractionTracking() {
    if (!controls || !renderer) return;
    // Pointer down: mark interaction start and record start position
    renderer.domElement.addEventListener('pointerdown', (e) => {
        userIsInteracting = true;
        userOverrideCamera = true;
        _pointerMoved = false;
        try { _pointerStart = { x: e.clientX, y: e.clientY }; } catch (ex) { _pointerStart = null; }
        // Cancel any pending smooth-return timer
        if (userInteractionTimeout) {
            clearTimeout(userInteractionTimeout);
            userInteractionTimeout = null;
        }
        // Cancel any active cinematic transition but preserve game callbacks
        if (cameraTransition) {
            cancelAnimationFrame(cameraTransition.animId);
            const pendingCallback = cameraTransition.onComplete;
            cameraTransition = null;
            // Fire the callback so game logic (deck enable, AI turn) is never blocked
            if (pendingCallback) pendingCallback();
        }
    });

    // Track pointer movement while interacting to detect deliberate pans/rotates
    renderer.domElement.addEventListener('pointermove', (e) => {
        // If pointer is not down we don't treat as drag here
        if (!_pointerStart) return;
        const cx = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
        const cy = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
        const dx = cx - _pointerStart.x;
        const dy = cy - _pointerStart.y;
        if (!_pointerMoved && Math.sqrt(dx * dx + dy * dy) > POINTER_MOVE_THRESHOLD) {
            _pointerMoved = true;
            // Temp explore: block auto camera for this turn only, not permanently.
            // Camera resets to auto at the start of the next turn (resetCameraOverride).
            userOverrideCamera = true;
            _tempManualOverride = true;
            // Cancel any in-flight cinematic transition (fire callback so game logic proceeds)
            if (cameraTransition) {
                cancelAnimationFrame(cameraTransition.animId);
                const cb = cameraTransition.onComplete;
                cameraTransition = null;
                if (cb) cb();
            }
            showFixedViewInfo('📷 Exploring — auto camera resumes next turn');
        }
    }, { passive: true });

    // Wheel (zoom) — temp explore this turn, resets at next turn start
    renderer.domElement.addEventListener('wheel', (e) => {
        _tempManualOverride = true;
        userOverrideCamera = true;
        // Cancel in-flight cinematic transition so zoom doesn't fight the user
        if (cameraTransition) {
            cancelAnimationFrame(cameraTransition.animId);
            const cb = cameraTransition.onComplete;
            cameraTransition = null;
            if (cb) cb();
        }
    }, { passive: true });

    // Multi-touch gestures — same temp explore behaviour
    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length > 1) {
            _tempManualOverride = true;
            userOverrideCamera = true;
            if (cameraTransition) {
                cancelAnimationFrame(cameraTransition.animId);
                const cb = cameraTransition.onComplete;
                cameraTransition = null;
                if (cb) cb();
            }
        }
    }, { passive: true });

    renderer.domElement.addEventListener('pointerup', onUserCameraRelease);
    renderer.domElement.addEventListener('pointerleave', onUserCameraRelease);
    renderer.domElement.addEventListener('pointercancel', onUserCameraRelease);
}

function onUserCameraRelease() {
    if (!userIsInteracting) return;
    userIsInteracting = false;

    // If the user deliberately dragged: stay in temp-explore mode.
    // Camera holds its position until the next turn (resetCameraOverride clears it).
    // No snap-back timer — that was the source of the Catan frustration.
    if (_pointerMoved) {
        userOverrideCamera = true;
        _tempManualOverride = true;
        _pointerStart = null;
        _pointerMoved = false;
        // Camera stays exactly where user left it — no return timer.
        return;
    }

    // Explicit lock (fixed views button) — always stay put
    if (fixedViewsActive) {
        _pointerStart = null;
        return;
    }

    // Tap without drag (e.g. selecting a peg) — cancel any pending timer and
    // let the auto camera resume normally; no forced return.
    if (userInteractionTimeout) {
        clearTimeout(userInteractionTimeout);
        userInteractionTimeout = null;
    }
    userOverrideCamera = false;
    _pointerStart = null;
}

// Smoothly transition back to the current camera view's default position
function returnToViewDefault() {
    // If user is interacting, in manual mode, or fixed board views are active, do nothing
    if (userIsInteracting || currentCameraView === 'manual') return;
    if ((typeof boardViewMode !== 'undefined' && boardViewMode > 0) || (typeof fixedViewsActive !== 'undefined' && fixedViewsActive)) return;

    const view = CAMERA_VIEWS[currentCameraView];
    if (!view) return;

    if (view.autoOrbit) {
        // Just restart orbit from current angle
        orbitAngle = Math.atan2(camera.position.x, camera.position.z);
        startOrbitAnimation();
    } else if (view.followPeg) {
        const activePeg = getActivePegPosition();
        if (activePeg) {
            if (view.behindPeg) {
                positionChaseCam(activePeg.x, activePeg.z, view.height, view.distance);
            } else {
                positionGroundCam(activePeg.x, activePeg.z, view.height, view.distance);
            }
        }
    } else {
        // Board view — return to default
        smoothCameraTransition(
            { x: 0, y: view.height || 200, z: view.distance || 450 },
            { x: 0, y: 0, z: 0 },
            1500
        );
    }
}

function smoothCameraTransition(targetPos, targetLookAt, duration = 2500, onComplete = null, opts) {
    // CameraDirector now handles all auto-mode camera positioning.
    // For cinematic events (vanquish, crown) that still call this,
    // set a hint so the director expands its frame to include the target.
    if (CameraDirector.mode === 'auto' && targetLookAt) {
        CameraDirector.setHint(
            { x: targetLookAt.x, y: targetLookAt.y || 0, z: targetLookAt.z },
            duration || 2500
        );
    }
    // Fire callback after a short delay so game logic proceeds
    if (onComplete) setTimeout(onComplete, Math.min(duration || 500, 800));
}

function focusOnPlayerPeg(playerIndex, onComplete = null) {
    // CameraDirector auto-frames all pegs for the active player each frame.
    // This stub exists for call-site compatibility; just fire the callback.
    if (onComplete) setTimeout(onComplete, 100);
}

// focusOnChoices — CameraDirector auto-frames all active pegs.
// Destination choices are near the pegs, so they're already in frame.
// Just add hints for far-away choices.
function focusOnChoices(moves) {
    if (!moves || moves.length === 0) return;
    if (CameraDirector.mode !== 'auto') return;

    // Clear interaction overrides so auto-reframe kicks in immediately
    userIsInteracting = false;
    _tempManualOverride = false;
    if (userInteractionTimeout) {
        clearTimeout(userInteractionTimeout);
        userInteractionTimeout = null;
    }

    // Store ALL destination world positions so CameraDirector frames them
    const positions = [];
    for (const m of moves) {
        const hole = holeRegistry.get(m.toHoleId);
        if (hole) {
            const hx = hole.position ? hole.position.x : (hole.mesh ? hole.mesh.position.x : undefined);
            const hz = hole.position ? hole.position.z : (hole.mesh ? hole.mesh.position.z : undefined);
            if (hx !== undefined && hz !== undefined) {
                positions.push(new THREE.Vector3(hx, 0, hz));
            }
        }
    }
    CameraDirector._legalMovePositions = positions;
    console.log(`[focusOnChoices] Feeding ${positions.length} legal-move positions to CameraDirector`);
}

function panOutForBoardView() {
    // CameraDirector auto-frames all pegs — no manual pan-out needed.
    // Just enter decision mode on mobile for UI cleanup.
    const isMobile = window.innerWidth <= 768;
    if (isMobile) enterDecisionMode();
}

// Decision mode - hide UI panels on mobile so player sees entire board
let isDecisionMode = false;

function enterDecisionMode() {
    if (isDecisionMode) return;
    isDecisionMode = true;

    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    console.log('[Camera] Entering decision mode - hiding panels');

    // Hide mobile header
    const mobileHeader = document.getElementById('mobile-header');
    if (mobileHeader) mobileHeader.style.display = 'none';

    // Hide floating card
    const floatingCard = document.getElementById('mobile-floating-card');
    if (floatingCard) floatingCard.style.display = 'none';

    // Hide mobile action bar (will be shown via showMoves if needed)
    const actionBar = document.getElementById('mobile-action-bar');
    if (actionBar) actionBar.classList.remove('has-moves');

    // Hide reaction bar
    const reactionBar = document.getElementById('reaction-bar');
    if (reactionBar) reactionBar.style.display = 'none';
}

function exitDecisionMode() {
    if (!isDecisionMode) return;
    isDecisionMode = false;

    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    console.log('[Camera] Exiting decision mode - showing panels');

    // Show mobile header (uses flex display)
    const mobileHeader = document.getElementById('mobile-header');
    if (mobileHeader) mobileHeader.style.display = '';  // Restore to CSS default

    // Clear inline style on floating card (CSS controls visibility)
    const floatingCard = document.getElementById('mobile-floating-card');
    if (floatingCard) floatingCard.style.display = '';

    // Clear inline style on reaction bar
    const reactionBar = document.getElementById('reaction-bar');
    if (reactionBar) reactionBar.style.display = '';
}

// Export for use by game callbacks
window.enterDecisionMode = enterDecisionMode;
window.exitDecisionMode = exitDecisionMode;

function resetCameraOverride() {
    // CameraDirector handles framing — just clear the temp override flag
    _tempManualOverride = false;
    userOverrideCamera = false;
}

// ============================================================
// WINDOW RESIZE
// ============================================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// ANIMATION LOOP
// ============================================================

function animate() {
    requestAnimationFrame(animate);

    // CameraDirector: unified camera each frame (auto, fixed, etc.)
    if (typeof CameraDirector !== 'undefined' && CameraDirector.mode !== 'manual') {
        CameraDirector.update(16); // ~60fps
    }

    controls.update();

    // Smooth mouse tracking for parallax
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    // Update theme parallax and animations
    if (window.FastTrackThemes) {
        FastTrackThemes.update(mouseX, mouseY);
        FastTrackThemes.updateSpectators(Date.now() * 0.001);
    }

    // Update Fibonacci backdrop animation (Board View mode)
    if (fibonacciBackdrop && fibonacciBackdrop.isActive) {
        fibonacciBackdrop.update(0.016); // ~60fps delta time
    }

    // Animate golden crowns (oscillate + glow pulse)
    if (window._goldenCrowns) {
        const t = Date.now() * 0.001;
        for (const crown of window._goldenCrowns) {
            if (!crown.active) continue;
            // Gentle bobbing (oscillate Y position)
            const baseY = LINE_HEIGHT + 12;
            crown.mesh.position.y = baseY + Math.sin(t * 1.5) * 1.5;
            // Slow rotation
            crown.mesh.rotation.y = t * 0.5;
            // Pulsing glow
            const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
            crown.pointLight.intensity = 1.5 + pulse * 2;
            crown.material.emissiveIntensity = 0.4 + pulse * 0.6;
        }
    }

    renderer.render(scene, camera);
}

function onMouseMove(event) {
    targetMouseX = (event.clientX / window.innerWidth - 0.5) * 2;
    targetMouseY = (event.clientY / window.innerHeight - 0.5) * 2;
}

// ============================================================
// THEME SWITCHER
// ============================================================

function setTheme(themeName) {
    console.log('[Theme] Switching to:', themeName);

    // ── Analytics: Track theme change (skip during demo/promo auto-rotation) ──
    if (window.FTAnalytics && !window.DemoDirector) {
        FTAnalytics.themeChange(themeName);
    }

    if (!window.FastTrackThemes) {
        console.error('[Theme] Theme system not loaded');
        return;
    }

    if (!scene) {
        console.error('[Theme] Scene not initialized');
        return;
    }

    try {
        currentThemeName = themeName;
        FastTrackThemes.apply(themeName, scene, THREE);
        // Keep backdrop motion frozen when switching themes unless explicitly enabled
        if (typeof FastTrackThemes.setMotionScale === 'function') {
            FastTrackThemes.setMotionScale(0);
        }
        console.log('[Theme] Applied successfully, backdrop layers:', FastTrackThemes.backdropLayers.length);
    } catch (err) {
        console.error('[Theme] Apply error:', err);
    }

    // Sync stadium audio theme with visual theme
    const themeMapping = {
        'billiard': 'RAGTIME',          // 1920s prohibition-era piano
        'speakeasy': 'RAGTIME',         // Same era — speakeasy is billiard alias
        'cosmic': 'SPACE_ACE',
        'colosseum': 'ROMAN_COLISEUM',
        'spaceace': 'SPACE_ACE',
        'undersea': 'UNDERSEA',
        'highcontrast': 'DEFAULT',
        'fibonacci': 'FIBONACCI'
    };

    // Start ragtime for billiard/speakeasy theme
    if ((themeName === 'billiard' || themeName === 'speakeasy') && typeof RagtimeSubstrate !== 'undefined') {
        // Stop any other music first
        if (typeof MusicSubstrate !== 'undefined') MusicSubstrate.stop();
        RagtimeSubstrate.play();
    } else if (typeof RagtimeSubstrate !== 'undefined') {
        RagtimeSubstrate.stop();
    }
    const stadiumTheme = themeMapping[themeName] || 'DEFAULT';
    if (typeof StadiumController !== 'undefined') {
        StadiumController.setTheme(stadiumTheme);
        const select = document.getElementById('stadiumThemeSelect');
        if (select) select.value = stadiumTheme;
    }
    // Sync game SFX theme
    if (typeof GameSFX !== 'undefined') {
        GameSFX.setTheme(stadiumTheme);
    }
    // Always sync music directly (StadiumController may not be wired)
    if (typeof MusicSubstrate !== 'undefined') {
        MusicSubstrate.setTheme(stadiumTheme);
    }
}

// ============================================================
// STADIUM AUDIO CONTROLS
// ============================================================

function setStadiumTheme(themeName) {
    if (typeof StadiumController !== 'undefined') {
        StadiumController.setTheme(themeName);
    }
    // Sync game SFX theme
    if (typeof GameSFX !== 'undefined') {
        GameSFX.setTheme(themeName);
    }
}

function toggleStadiumMusic() {
    if (typeof StadiumController !== 'undefined') {
        const enabled = StadiumController.toggleMusic();
        updateStadiumButton('btn-music', enabled);
        if (enabled && StadiumController.systems.music) {
            // Play a brief sound check before starting music
            playSoundCheck('music');
            StadiumController.systems.music.play();
        }
    }
}

// ── Music Toggle (floating button) ──────────────────────────
let gameMusicPlaying = false;
let musicAutoStarted = false;  // Track if music already auto-started on first card draw

function toggleGameMusic() {
    const btn = document.getElementById('music-toggle-btn');
    if (gameMusicPlaying) {
        // Turn OFF
        gameMusicPlaying = false;
        if (typeof MusicSubstrate !== 'undefined') {
            MusicSubstrate.stop();
        }
        if (typeof StadiumController !== 'undefined' && StadiumController.systems.music) {
            StadiumController.systems.music.stop?.();
        }
        if (btn) {
            btn.textContent = '🔇';
            btn.title = 'Music: OFF';
            btn.classList.remove('music-on');
        }
        console.log('🎵 Music OFF');
    } else {
        // Turn ON
        gameMusicPlaying = true;
        if (typeof MusicSubstrate !== 'undefined') {
            MusicSubstrate.activate();
            if (MusicSubstrate.play) MusicSubstrate.play();
        }
        if (typeof StadiumController !== 'undefined' && StadiumController.systems.music) {
            StadiumController.systems.music.play?.();
        }
        if (btn) {
            btn.textContent = '🎵';
            btn.title = 'Music: ON';
            btn.classList.add('music-on');
        }
        console.log('🎵 Music ON');
    }
}
window.toggleGameMusic = toggleGameMusic;

// ─── Music & Sound Panel ──────────────────────────────────────────────
function openMusicPanel() {
    const panel = document.getElementById('music-sound-panel');
    if (!panel) return;
    // Sync checkboxes with current state
    const musicChk = document.getElementById('msp-music-toggle');
    const sfxChk = document.getElementById('msp-sfx-toggle');
    if (musicChk) musicChk.checked = gameMusicPlaying;
    if (sfxChk) sfxChk.checked = (localStorage.getItem('fasttrack_sfx') !== 'false');
    panel.classList.toggle('visible');
}
window.openMusicPanel = openMusicPanel;

function closeMusicPanel() {
    const panel = document.getElementById('music-sound-panel');
    if (panel) panel.classList.remove('visible');
}
window.closeMusicPanel = closeMusicPanel;

function setGameMusic(enabled) {
    if (enabled && !gameMusicPlaying) {
        gameMusicPlaying = true;
        if (typeof MusicSubstrate !== 'undefined') { MusicSubstrate.activate(); if (MusicSubstrate.play) MusicSubstrate.play(); }
        if (typeof StadiumController !== 'undefined' && StadiumController.systems?.music) StadiumController.systems.music.play?.();
        const btn = document.getElementById('music-toggle-btn');
        if (btn) { btn.textContent = '🎵'; btn.title = 'Music & Sound'; btn.classList.add('music-on'); }
    } else if (!enabled && gameMusicPlaying) {
        gameMusicPlaying = false;
        if (typeof MusicSubstrate !== 'undefined') MusicSubstrate.stop?.();
        if (typeof StadiumController !== 'undefined' && StadiumController.systems?.music) StadiumController.systems.music.stop?.();
        const btn = document.getElementById('music-toggle-btn');
        if (btn) { btn.textContent = '🔇'; btn.title = 'Music & Sound'; btn.classList.remove('music-on'); }
    }
    localStorage.setItem('fasttrack_music', enabled ? 'true' : 'false');
}
window.setGameMusic = setGameMusic;

function setGameSFX(enabled) {
    localStorage.setItem('fasttrack_sfx', enabled ? 'true' : 'false');
    if (typeof GameSFX !== 'undefined') {
        GameSFX.muted = !enabled;
    }
}
window.setGameSFX = setGameSFX;

// ─── Ask Mom — persistent real-time advice toggle ─────────────────────
let momAdviceActive = false;
let momAdviceTimer = null;
function toggleMomAdvice() {
    const btn = document.getElementById('ask-mom-btn');
    momAdviceActive = !momAdviceActive;
    if (momAdviceActive) {
        btn?.classList.add('mom-active');
        showMomHelp();
        momAdviceTimer = setInterval(() => { if (momAdviceActive) showMomHelp(); }, 15000);
    } else {
        btn?.classList.remove('mom-active');
        clearInterval(momAdviceTimer);
        momAdviceTimer = null;
        hideMomHelp();
    }
}
window.toggleMomAdvice = toggleMomAdvice;

// Auto-start music on first card draw by any player
function autoStartMusicOnFirstDraw() {
    if (musicAutoStarted || gameMusicPlaying) return;
    musicAutoStarted = true;

    console.log('🎵 Auto-starting music on first card draw');
    gameMusicPlaying = true;

    if (typeof MusicSubstrate !== 'undefined') {
        MusicSubstrate.activate();
        if (MusicSubstrate.play) MusicSubstrate.play();
    }
    if (typeof StadiumController !== 'undefined' && StadiumController.systems.music) {
        StadiumController.systems.music.play?.();
    }

    const btn = document.getElementById('music-toggle-btn');
    if (btn) {
        btn.textContent = '🎵';
        btn.title = 'Music: ON';
        btn.classList.add('music-on');
    }
}

function toggleStadiumCrowd() {
    if (typeof StadiumController !== 'undefined') {
        const enabled = StadiumController.toggleCrowd();
        updateStadiumButton('btn-crowd', enabled);
        if (enabled && StadiumController.systems.crowd) {
            // Play a brief crowd sound check
            playSoundCheck('crowd');
            StadiumController.systems.crowd.startAmbient();
        }
    }
}

function toggleStadiumCommentary() {
    if (typeof StadiumController !== 'undefined') {
        const enabled = StadiumController.toggleCommentary();
        updateStadiumButton('btn-commentary', enabled);
        if (enabled) {
            // Play a brief commentary sound check
            playSoundCheck('commentary');
        }
    }
}

function toggleStadiumSpeech() {
    if (typeof StadiumController !== 'undefined') {
        const enabled = StadiumController.toggleSpeech();
        updateStadiumButton('btn-speech', enabled);
        if (enabled) {
            // Play a brief speech sound check
            playSoundCheck('speech');
        }
    }
}

// Sound check - plays a brief sample when audio is toggled on
// Uses MusicSubstrate.ping() to generate sounds from substrate coordinates
function playSoundCheck(type) {
    console.log(`🔊 [Sound Check] Starting ${type} sound check...`);

    // Use MusicSubstrate ping system if available
    if (typeof MusicSubstrate !== 'undefined') {
        console.log(`🔊 [Sound Check] MusicSubstrate available`);

        // Ensure substrate is activated
        const activated = MusicSubstrate.activate();
        console.log(`🔊 [Sound Check] Activated: ${activated}, Context state: ${MusicSubstrate.audioContext?.state}`);

        if (type === 'music') {
            // Ping a musical arpeggio across the substrate
            console.log(`🔊 [Sound Check] Calling pingSoundCheck()`);
            MusicSubstrate.pingSoundCheck();
        } else if (type === 'crowd') {
            // Ping multiple random points for crowd-like texture
            console.log(`🔊 [Sound Check] Calling pingChord() for crowd`);
            const crowdPings = [
                { x: Math.random() * 100, y: Math.random() * 30 },
                { x: Math.random() * 100, y: Math.random() * 30 },
                { x: Math.random() * 100, y: Math.random() * 30 },
                { x: Math.random() * 100, y: Math.random() * 30 },
                { x: Math.random() * 100, y: Math.random() * 30 }
            ];
            MusicSubstrate.pingChord(crowdPings, { duration: 0.6, volume: 0.15 });
        } else if (type === 'commentary' || type === 'speech') {
            // Use speech synthesis for commentary
            if ('speechSynthesis' in window) {
                console.log(`🔊 [Sound Check] Using speech synthesis`);
                const utterance = new SpeechSynthesisUtterance('Sound check!');
                utterance.rate = 1.2;
                utterance.pitch = type === 'commentary' ? 0.9 : 1.0;
                utterance.volume = 0.8;
                window.speechSynthesis.speak(utterance);
            } else {
                // Fallback: ping a single attention tone
                console.log(`🔊 [Sound Check] Fallback ping for ${type}`);
                MusicSubstrate.ping(50, 70, { duration: 0.3, volume: 0.2 });
            }
        }
        return;
    }

    // Fallback if MusicSubstrate not available - use raw Web Audio
    let ctx = null;
    try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn('Cannot create audio context for sound check:', e);
        return;
    }

    // Resume context if suspended
    if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
            playSoundCheckFallback(ctx, type);
        }).catch(e => console.warn('Failed to resume audio context:', e));
    } else {
        playSoundCheckFallback(ctx, type);
    }
}

// Fallback sound check without MusicSubstrate
function playSoundCheckFallback(ctx, type) {
    const now = ctx.currentTime;

    if (type === 'music') {
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.3);
        });
    } else if (type === 'crowd') {
        const bufferSize = ctx.sampleRate * 0.8;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.8);
    } else if (type === 'commentary' || type === 'speech') {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance('Sound check!');
            utterance.rate = 1.2;
            utterance.volume = 0.8;
            window.speechSynthesis.speak(utterance);
        }
    }

    setTimeout(() => {
        if (ctx && ctx.state !== 'closed') ctx.close().catch(() => { });
    }, 2000);
}

function updateStadiumButton(btnId, enabled) {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.style.opacity = enabled ? '1' : '0.4';
        btn.style.borderColor = enabled ? '#4CAF50' : '#555';
    }
}

// ============================================================
// MOVE HINT MODE CONTROLS
// ============================================================

function setHintMode(mode) {
    GAME_CONFIG.hintMode = mode;
    console.log('[Hints] Mode set to:', mode);

    // Update button visuals
    const modes = ['blink', 'dropdown', 'voice', 'all', 'none'];
    modes.forEach(m => {
        const btn = document.getElementById(`btn-hint-${m}`);
        if (btn) {
            if (m === mode) {
                btn.style.background = '#4a4a6e';
                btn.style.borderColor = '#888';
            } else {
                btn.style.background = '#2a2a3e';
                btn.style.borderColor = '#555';
            }
        }
    });

    // ALWAYS show highlights (blinking holes) UNLESS 'none' mode is selected
    // Blinking destination holes is the PRIMARY visual feedback for all modes
    // Other modes (dropdown, voice) are OPTIONAL overlays on top of blinking
    GAME_CONFIG.showHighlights = (mode !== 'none');

    // Announce mode change if voice mode selected
    if ((mode === 'voice' || mode === 'all') && 'speechSynthesis' in window) {
        const modeNames = {
            'blink': 'Visual hints mode - holes will blink',
            'dropdown': 'Dropdown list mode with blinking holes',
            'voice': 'Voice hints with blinking holes',
            'all': 'All hints enabled',
            'none': 'Hints disabled - expert mode'
        };
        const utterance = new SpeechSynthesisUtterance(modeNames[mode] || 'Hint mode changed');
        utterance.rate = 1.1;
        utterance.volume = 0.7;
        window.speechSynthesis.speak(utterance);
    }
}

// Toggle move suggestion popups on/off
function toggleSuggestions() {
    GAME_CONFIG.suggestionsDisabled = !GAME_CONFIG.suggestionsDisabled;
    const btn = document.getElementById('suggestions-toggle');
    if (btn) {
        if (GAME_CONFIG.suggestionsDisabled) {
            btn.textContent = '💡 Suggestions OFF';
            btn.style.color = '#888';
            btn.style.borderColor = '#555';
        } else {
            btn.textContent = '💡 Suggestions ON';
            btn.style.color = '#ffd700';
            btn.style.borderColor = '#ffd700';
        }
    }
    // If a suggestion modal is currently visible, close it
    hideMoveChoiceModal();
    if (window.moveSelectionModal) {
        window.moveSelectionModal.hide();
    }
    console.log('[Suggestions]', GAME_CONFIG.suggestionsDisabled ? 'DISABLED' : 'ENABLED');
}
window.toggleSuggestions = toggleSuggestions;

// Generate descriptive move label
function getMoveDescription(move, includeToken = false) {
    const fromHole = holeRegistry.get(move.fromHoleId);
    const toHole = holeRegistry.get(move.toHoleId);

    // Get peg label prefix if including token identity
    let prefix = '';
    if (includeToken && move.pegId) {
        const peg = pegRegistry.get(move.pegId);
        if (peg) {
            prefix = `${getPegLabel(move.pegId, peg.colorIndex)}: `;
        }
    }

    // Use move's own description if provided
    if (move.description) return prefix + move.description;

    // Check for cut target first - most exciting move!
    const cutTarget = findCutTargetAtHole(move.toHoleId);
    if (cutTarget) {
        return `${prefix}⚔️ Capture ${cutTarget.player.name}`;
    }

    // Entry from holding
    if (move.type === 'enter' || fromHole?.type === 'holding') {
        return `${prefix}🚀 Enter the board`;
    }

    // Bullseye moves
    if (toHole?.type === 'bullseye' || move.toHoleId === 'center') {
        return `${prefix}🎯 Enter Bullseye`;
    }
    if (fromHole?.type === 'bullseye' || move.fromHoleId === 'center') {
        return `${prefix}🎯 Exit Bullseye`;
    }

    // FastTrack moves
    if (move.isFastTrack || move.enteringFastTrack) {
        return `${prefix}⚡ Traverse Fast Track`;
    }
    if (move.exitingFastTrack) {
        return `${prefix}🚪 Exit Fast Track`;
    }
    if (toHole?.type === 'fasttrack' && fromHole?.type !== 'fasttrack') {
        return `${prefix}⚡ Enter Fast Track`;
    }
    if (fromHole?.type === 'fasttrack' && toHole?.type !== 'fasttrack') {
        return `${prefix}🚪 Leave Fast Track at this point`;
    }

    // Safe zone moves
    if (toHole?.type === 'safezone' || toHole?.type === 'safe') {
        return `${prefix}🛡️ Enter Safe Zone`;
    }
    if (fromHole?.type === 'safezone' && toHole?.type === 'safezone') {
        return `${prefix}🧹 Tidy Up Safe Zone`;
    }

    // Winner move
    if (toHole?.type === 'home' && (move.isWinner || move.completesCircuit)) {
        return `${prefix}🏆 Winner!`;
    }

    // Backward move (4 card)
    if (move.direction === 'backward' || move.steps < 0) {
        return `${prefix}⬅️ Go Back 4`;
    }

    // Decline options
    if (move.declineFastTrack) {
        return `${prefix}🚫 Decline Fast Track`;
    }
    if (move.declineBullseye) {
        return `${prefix}🚫 Decline Bullseye`;
    }

    // Default
    return `${prefix}Move ${move.steps || '?'} spaces`;
}

// Speak legal moves using voice synthesis
function speakLegalMoves(moves) {
    if (!('speechSynthesis' in window)) return;
    if (GAME_CONFIG.hintMode !== 'voice' && GAME_CONFIG.hintMode !== 'all') return;

    if (moves.length === 0) {
        const utterance = new SpeechSynthesisUtterance('No legal moves available');
        utterance.rate = 1.2;
        window.speechSynthesis.speak(utterance);
        return;
    }

    // Build move descriptions
    const moveDescriptions = moves.slice(0, 5).map((move, i) => {
        return getMoveDescription(move);
    });

    const text = moves.length === 1
        ? `One move available: ${moveDescriptions[0]}`
        : `${moves.length} moves available. ${moveDescriptions.join('. ')}`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.3;
    utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
}

// Show dropdown suggestion list for moves
function showMoveDropdown(moves) {
    if (GAME_CONFIG.hintMode !== 'dropdown' && GAME_CONFIG.hintMode !== 'all') return;

    // Remove existing dropdown
    const existing = document.getElementById('move-suggestion-dropdown');
    if (existing) existing.remove();

    if (moves.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.id = 'move-suggestion-dropdown';
    dropdown.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: rgba(30, 30, 50, 0.95);
            border: 2px solid #666;
            border-radius: 10px;
            padding: 10px;
            z-index: 9000;
            max-height: 300px;
            overflow-y: auto;
            min-width: 200px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

    const title = document.createElement('div');
    title.style.cssText = 'color: #ffd700; font-weight: bold; margin-bottom: 8px; font-size: 14px;';
    title.textContent = `📋 ${moves.length} Legal Moves`;
    dropdown.appendChild(title);

    // Check if moves involve multiple different pegs
    const uniquePegIds = new Set(moves.map(m => m.pegId).filter(Boolean));
    const multipleTokens = uniquePegIds.size > 1;

    // Show number labels on pegs when multiple can move
    if (multipleTokens) {
        showPegNumbers([...uniquePegIds]);
    }

    moves.forEach((move, i) => {
        const toHole = holeRegistry.get(move.toHoleId);
        const option = document.createElement('div');
        option.style.cssText = `
                padding: 8px 12px;
                margin: 4px 0;
                background: #3a3a5a;
                border-radius: 6px;
                cursor: pointer;
                color: #fff;
                font-size: 13px;
                transition: background 0.2s;
            `;

        // Use descriptive label with token ID when multiple pegs can move
        const label = getMoveDescription(move, multipleTokens);

        option.textContent = label;
        option.title = multipleTokens && move.pegId ? getPegLabel(move.pegId, pegRegistry.get(move.pegId)?.colorIndex || 0) : '';
        option.onmouseover = () => option.style.background = '#5a5a7a';
        option.onmouseout = () => option.style.background = '#3a3a5a';
        option.onclick = () => {
            dropdown.remove();
            hidePegNumbers();
            executeMoveDirectly(move);
        };

        dropdown.appendChild(option);
    });

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'text-align: center; color: #888; font-size: 11px; margin-top: 8px; cursor: pointer;';
    closeBtn.textContent = '(click move or tap board)';
    closeBtn.onclick = () => {
        dropdown.remove();
        hidePegNumbers();
    };
    dropdown.appendChild(closeBtn);

    document.body.appendChild(dropdown);
}

// Hide move dropdown
function hideMoveDropdown() {
    const dropdown = document.getElementById('move-suggestion-dropdown');
    if (dropdown) dropdown.remove();
}

// Expose to window
window.setHintMode = setHintMode;

// ============================================================
// SETTINGS PANEL TOGGLE (Legacy - removed, using GameUIMinimal menu)
// ============================================================

window.toggleSettingsPanel = function () {
    // Legacy stub — settings are now in GameUIMinimal hamburger menu
    if (window.GameUIMinimal) {
        window.GameUIMinimal.toggleMenu();
    }
};

// ============================================================
// MOVE MODE TOGGLE (Auto vs Manual)
// ============================================================

function setMoveMode(mode) {
    const isAuto = (mode === 'auto');
    GAME_CONFIG.autoMoveForHumans = isAuto;
    console.log('[MoveMode] Set to:', mode, 'autoMoveForHumans:', isAuto);

    // Update button visuals
    const autoBtn = document.getElementById('btn-move-auto');
    const manualBtn = document.getElementById('btn-move-manual');

    if (autoBtn) {
        autoBtn.style.background = isAuto ? '#4a4a6e' : '#2a2a3e';
        autoBtn.style.borderColor = isAuto ? '#888' : '#555';
    }
    if (manualBtn) {
        manualBtn.style.background = isAuto ? '#2a2a3e' : '#4a4a6e';
        manualBtn.style.borderColor = isAuto ? '#555' : '#888';
    }

    // Also sync the pause menu toggle
    const pauseToggle = document.getElementById('auto-move-toggle');
    const pauseLabel = document.getElementById('auto-move-label');
    if (pauseToggle) pauseToggle.checked = isAuto;
    if (pauseLabel) pauseLabel.textContent = isAuto ? 'ON' : 'OFF';
}

// Expose to window
window.setMoveMode = setMoveMode;

// ============================================================
// PLAYER REACTIONS (Desktop)
// ============================================================

function sendDesktopReaction(emoji, reactionName) {
    console.log('[Reactions] Sending:', reactionName, emoji);

    // Play reaction sound effect
    if (window.MusicSubstrate && window.MusicSubstrate.playReactionSound) {
        window.MusicSubstrate.playReactionSound(reactionName);
    }

    // Create floating animation
    showFloatingReactionDesktop(emoji);

    // Broadcast to other players if multiplayer
    if (window.gameStateBroadcaster) {
        window.gameStateBroadcaster.broadcastReaction({
            emoji: emoji,
            name: reactionName,
            playerId: window.gameState?.currentPlayerId || 'local',
            timestamp: Date.now()
        });
    }
}

function showFloatingReactionDesktop(emoji) {
    const el = document.createElement('div');
    el.textContent = emoji;

    // Random position across the screen
    const startX = 50 + Math.random() * (window.innerWidth - 200);
    const startY = window.innerHeight * 0.6 + Math.random() * (window.innerHeight * 0.3);

    el.style.cssText = `
            position: fixed;
            left: ${startX}px;
            top: ${startY}px;
            font-size: 120px;
            pointer-events: none;
            z-index: 10002;
            text-shadow: 0 8px 30px rgba(0,0,0,0.6);
            filter: drop-shadow(0 0 20px rgba(255,255,255,0.3));
            will-change: transform, opacity;
        `;

    document.body.appendChild(el);

    // JavaScript-driven animation (immune to CSS conflicts)
    const duration = 3000;
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function
        const eased = 1 - Math.pow(1 - progress, 3);

        // Float up 350px
        const translateY = -350 * eased;

        // Scale from 1 to 2.5
        const scale = 1 + (1.5 * eased);

        // Wobble rotation
        const wobble = Math.sin(progress * Math.PI * 4) * 8 * (1 - progress);

        // Fade out in last 30%
        const opacity = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;

        el.style.transform = `translateY(${translateY}px) scale(${scale}) rotate(${wobble}deg)`;
        el.style.opacity = opacity;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            el.remove();
        }
    }

    requestAnimationFrame(animate);
}

// Make it globally available
window.sendDesktopReaction = sendDesktopReaction;

/**
 * AI Chat Bubble — bots express personality with floating text messages!
 * Shows a styled chat bubble with the bot's message, floating up and fading out.
 * This makes bots feel alive and friendly — they're not just silent algorithms.
 * @param {string} message - The chat message text (with emoji)
 * @param {string} [botName] - Optional bot name for attribution
 * @param {Object} [options] - Optional styling overrides
 */
function aiSendChatBubble(message, botName, options = {}) {
    if (!AI_REACTIONS.enabled) return;

    const el = document.createElement('div');
    const displayMsg = botName ? `${botName}: ${message}` : message;
    el.textContent = displayMsg;

    // Position: random horizontal, bottom third of screen
    const startX = 80 + Math.random() * (window.innerWidth - 400);
    const startY = window.innerHeight * 0.55 + Math.random() * (window.innerHeight * 0.2);

    const bgColor = options.bg || 'rgba(30, 30, 60, 0.92)';
    const borderColor = options.border || 'rgba(100, 180, 255, 0.5)';
    const textColor = options.color || '#fff';

    el.style.cssText = `
            position: fixed;
            left: ${startX}px;
            top: ${startY}px;
            font-size: 18px;
            font-weight: 600;
            color: ${textColor};
            background: ${bgColor};
            border: 1px solid ${borderColor};
            border-radius: 16px;
            padding: 10px 18px;
            pointer-events: none;
            z-index: 10003;
            max-width: 320px;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
            box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 15px rgba(100,180,255,0.15);
            will-change: transform, opacity;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            letter-spacing: 0.3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

    document.body.appendChild(el);

    // Float up and fade out animation
    const duration = 4000;
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        const translateY = -200 * eased;
        const opacity = progress > 0.65 ? 1 - ((progress - 0.65) / 0.35) : 1;
        const scale = progress < 0.1 ? 0.8 + 0.2 * (progress / 0.1) : 1;

        el.style.transform = `translateY(${translateY}px) scale(${scale})`;
        el.style.opacity = opacity;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            el.remove();
        }
    }

    requestAnimationFrame(animate);
}

// Make globally available
window.aiSendChatBubble = aiSendChatBubble;

// ============================================================
// DRAGGABLE REACTION BAR
// ============================================================

(function initDraggableReactions() {
    const bar = document.getElementById('floating-reactions');
    if (!bar) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let hasBeenDragged = false;

    function onMouseDown(e) {
        // Only drag if clicking on handle or bar background
        if (e.target.classList.contains('reaction-btn-desktop')) return;

        isDragging = true;
        bar.classList.add('dragging');

        const rect = bar.getBoundingClientRect();
        startX = e.clientX || e.touches?.[0]?.clientX;
        startY = e.clientY || e.touches?.[0]?.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        // Remove the centering transform once user starts dragging
        if (!hasBeenDragged) {
            bar.style.transform = 'none';
            bar.style.left = startLeft + 'px';
            bar.style.top = startTop + 'px';
            hasBeenDragged = true;
        }

        e.preventDefault();
    }

    function onMouseMove(e) {
        if (!isDragging) return;

        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        const newLeft = Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, startLeft + dx));
        const newTop = Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, startTop + dy));

        bar.style.left = newLeft + 'px';
        bar.style.top = newTop + 'px';
        bar.style.right = 'auto';
        bar.style.bottom = 'auto';
    }

    function onMouseUp() {
        isDragging = false;
        bar.classList.remove('dragging');
    }

    // Mouse events
    bar.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Touch events
    bar.addEventListener('touchstart', onMouseDown, { passive: false });
    document.addEventListener('touchmove', onMouseMove, { passive: true });
    document.addEventListener('touchend', onMouseUp);
})();

// ============================================================
// APPLY BOARD THEME - Update board, border, and peg colors
// ============================================================

function applyBoardTheme(palette) {
    if (!palette) return;

    currentBoardPalette = palette;
    console.log('Applying board palette:', palette);

    // Update board material
    if (boardMesh && boardMesh.material) {
        boardMesh.material.color.setHex(palette.boardColor);
        if (palette.boardRoughness !== undefined) {
            boardMesh.material.roughness = palette.boardRoughness;
        }
        if (palette.boardMetalness !== undefined) {
            boardMesh.material.metalness = palette.boardMetalness;
        }
        boardMesh.material.needsUpdate = true;
    }

    // Update border segments with new player colors
    borderSegments.forEach((segment, i) => {
        if (segment && segment.material && palette.playerColors && palette.playerColors[i]) {
            const newColor = palette.playerColors[i];
            segment.material.color.setHex(newColor);
            segment.material.emissive.setHex(newColor);
            segment.material.needsUpdate = true;
        }
    });

    // Update existing pegs with new colors (use colorIndex to match board areas)
    pegRegistry.forEach((peg, id) => {
        const colorIndex = peg.colorIndex !== undefined ? peg.colorIndex : peg.playerIndex;
        if (palette.playerColors && palette.playerColors[colorIndex]) {
            const newColor = palette.playerColors[colorIndex];

            // Update body mesh
            if (peg.bodyMesh && peg.bodyMesh.material) {
                peg.bodyMesh.material.color.setHex(newColor);
                peg.bodyMesh.material.emissive.setHex(newColor);
                peg.bodyMesh.material.needsUpdate = true;
            }

            // Update disc mesh
            if (peg.discMesh && peg.discMesh.material) {
                peg.discMesh.material.color.setHex(newColor);
                peg.discMesh.material.emissive.setHex(newColor);
                peg.discMesh.material.needsUpdate = true;
            }

            // Update stored color
            peg.color = newColor;
        }
    });

    // Update colored board markers (pentagons, diamonds, circles, bullseye rings)
    coloredMarkers.forEach(({ mesh, playerIndex }) => {
        if (palette.playerColors && palette.playerColors[playerIndex] && mesh.material) {
            const newColor = palette.playerColors[playerIndex];
            mesh.material.color.setHex(newColor);
            if (mesh.material.emissive) mesh.material.emissive.setHex(newColor);
            mesh.material.needsUpdate = true;
        }
    });

    // Update safe zone plane colors to match theme player colors
    safeZonePlanes.forEach(({ mesh, playerIndex }) => {
        if (palette.playerColors && palette.playerColors[playerIndex] && mesh.material) {
            mesh.material.color.setHex(palette.playerColors[playerIndex]);
            mesh.material.needsUpdate = true;
        }
    });

    console.log('Board theme applied successfully');
}

// Make applyBoardTheme globally accessible for theme system
window.applyBoardTheme = applyBoardTheme;

// ============================================================
// TEST REACTION BUTTONS
// ============================================================

// Helper to get current theme's player color (by board position, not player index)
// playerIndex is converted to boardPosition to match area colors
function getThemedPlayerColor(playerIndex) {
    // Convert player index to board position to match area colors
    const boardPos = getBalancedBoardPosition(playerIndex, activePlayerCount);
    if (currentBoardPalette && currentBoardPalette.playerColors) {
        return currentBoardPalette.playerColors[boardPos] || 0xffd700;
    }
    return RAINBOW_COLORS[boardPos] || 0xffd700;
}

// Get color directly by board position (0-5), no conversion
function getColorByBoardPosition(boardPos) {
    if (currentBoardPalette && currentBoardPalette.playerColors) {
        return currentBoardPalette.playerColors[boardPos] || 0xffd700;
    }
    return RAINBOW_COLORS[boardPos] || 0xffd700;
}

// Helper to convert suit name to symbol
function getSuitSymbol(suitName) {
    const symbols = {
        'hearts': '♥',
        'diamonds': '♦',
        'clubs': '♣',
        'spades': '♠',
        'red': '★',   // for red joker
        'black': '★'  // for black joker
    };
    return symbols[suitName] || '';
}

function testFastTrack() {
    if (!window.FastTrackThemes) return;

    // Get current player color from current theme palette
    const playerIndex = gameState?.currentPlayer?.index || 0;
    const playerColor = getThemedPlayerColor(playerIndex);
    const playerName = gameState?.currentPlayer?.name || 'Player 1';

    // Trigger the swirling effect
    triggerThemeSwirl();

    // Trigger the game event
    FastTrackThemes.triggerGameEvent('fasttrack', {
        playerColor: playerColor,
        playerName: playerName
    });

    console.log('🚀 TEST: Fast Track triggered!');
}

function testSendHome() {
    if (!window.FastTrackThemes) return;

    const playerIndex = gameState?.currentPlayer?.index || 0;
    const playerColor = getThemedPlayerColor(playerIndex);

    FastTrackThemes.triggerGameEvent('sendHome', {
        playerColor: playerColor
    });

    console.log('🏠 TEST: Send Home triggered!');
}

function testWinner() {
    if (!window.FastTrackThemes) return;

    const playerIndex = gameState?.currentPlayer?.index || 0;
    const playerColor = getThemedPlayerColor(playerIndex);
    const playerName = gameState?.currentPlayer?.name || 'Player 1';
    const playerAvatar = gameState?.currentPlayer?.avatar || '👤';

    // Trigger swirl for winner too
    triggerThemeSwirl();

    // Custom winner banner with player avatar and name
    FastTrackThemes.showBanner(`${playerAvatar} ${playerName} WINS!`, '#FFD700', '#4B0082', playerColor);
    FastTrackThemes.triggerCrowdReaction('roaring');

    console.log('🏆 TEST: Winner triggered!');
}

function debugUI() {
    console.log('=== DEBUG UI ===');
    console.log('gameState:', gameState);
    console.log('window.playerPanelUI:', window.playerPanelUI);

    const panelsContainer = document.getElementById('player-panels');
    console.log('player-panels element:', panelsContainer);
    if (panelsContainer) {
        console.log('player-panels display:', panelsContainer.style.display);
        console.log('player-panels children:', panelsContainer.children.length);
        console.log('player-panels z-index:', window.getComputedStyle(panelsContainer).zIndex);
    }

    const startScreen = document.getElementById('start-game-screen');
    console.log('start-game-screen element:', startScreen);
    if (startScreen) {
        console.log('start-game-screen display:', startScreen.style.display);
        console.log('start-game-screen computed display:', window.getComputedStyle(startScreen).display);
    }

    // Force create panels if missing
    if (!window.playerPanelUI && typeof window.PlayerPanelUI === 'function') {
        console.log('Creating PlayerPanelUI manually...');
        window.playerPanelUI = new window.PlayerPanelUI();
        setupPlayerPanels(3);
    }

    // CardUI removed — no-op stub active

    console.log('=== END DEBUG ===');
}
window.debugUI = debugUI;

// Dramatic swirling effect for major events
function triggerThemeSwirl() {
    if (!window.FastTrackThemes) return;

    const duration = 3000; // 3 seconds of swirl
    const startTime = Date.now();

    // Store original rotation speeds
    const originalSpeeds = FastTrackThemes.backdropLayers.map(layer => ({
        rotation: layer.rotationSpeed || 0,
        parallax: layer.parallaxFactor || 0
    }));

    // Amplify all rotations dramatically
    FastTrackThemes.backdropLayers.forEach((layer, i) => {
        if (layer.rotationSpeed !== undefined) {
            layer.rotationSpeed = (originalSpeeds[i].rotation || 0.001) * 50;
        }
        if (layer.parallaxFactor !== undefined) {
            layer.parallaxFactor = originalSpeeds[i].parallax * 3;
        }
    });

    // Gradually restore
    const restoreSwirl = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);

        FastTrackThemes.backdropLayers.forEach((layer, i) => {
            if (layer.rotationSpeed !== undefined) {
                const maxSpeed = (originalSpeeds[i].rotation || 0.001) * 50;
                layer.rotationSpeed = maxSpeed * (1 - easeOut) + originalSpeeds[i].rotation * easeOut;
            }
            if (layer.parallaxFactor !== undefined) {
                const maxParallax = originalSpeeds[i].parallax * 3;
                layer.parallaxFactor = maxParallax * (1 - easeOut) + originalSpeeds[i].parallax * easeOut;
            }
        });

        if (progress < 1) {
            requestAnimationFrame(restoreSwirl);
        }
    };

    requestAnimationFrame(restoreSwirl);
}

// ============================================================
// START - Using jQuery for reliable initialization
// ============================================================

// jQuery's $(function() {...}) waits for DOM to be ready AND all scripts loaded
// This is more reliable than window.onload or DOMContentLoaded alone
// Fixes the issue where board doesn't load until hard refresh
$(function () {
    console.log('🎮 jQuery ready - initializing game board...');
    init();
});

window.setCameraView = setCameraView;
window.setCameraViewMode = setCameraViewMode;
window.setTheme = setTheme;
window.testFastTrack = testFastTrack;
window.testSendHome = testSendHome;
window.testWinner = testWinner;
window.smoothCameraTransition = smoothCameraTransition;
// Called at the start of each new turn (non-extra-turn).
// Clears temp explore state so auto camera resumes.
// Explicit lock (fixedViewsActive) is NOT cleared here — only the user can release it.
window.resetCameraOverride = function () {
    // Respect ALL explicit user camera locks
    if (currentCameraView === 'manual' || fixedViewsActive ||
        currentCameraView === 'fixed-straight' || currentCameraView === 'fixed-angled') return;
    userOverrideCamera = false;
    userIsInteracting = false;
    highlightsActive = false;
    _tempManualOverride = false; // temp explore resets at turn boundary
};
