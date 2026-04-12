// BrickBreaker 3D - Manifold Audio Edition
// Complete game engine with cubic bricks, curved paddle, and starfield

let scene, camera, renderer;
let balls = [], paddle, bricks = [];
// Ball config
const INITIAL_BALLS = 3;
const BASE_SPEED = 0.25;
let hasHitCeiling = false;  // Tracks if ANY ball has hit the ceiling this level

let score = 0, level = 1;
// Lives removed. You lose when you have 0 balls left.
let gameOver = false, won = false;

// Starfield parameters
let starfield = [];
const STAR_COLORS = [0x00ffcc, 0x00ff88, 0xffff00, 0x8a2be2, 0xffffff];

// Game dimensions
const GAME_WIDTH = 40;
const GAME_HEIGHT = 30;
const GAME_DEPTH = 80;

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 200, 400);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.z = 30;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('canvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lighting
    setupLighting();

    // Create starfield background
    createStarfield();

    // Create game objects
    createPaddle();
    createBalls();
    createBricks();

    // Event listeners
    document.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('resize', onWindowResize, false);

    // Start game loop
    animate();
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 20, 20);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Colored accent lights
    const cyanLight = new THREE.PointLight(0x00ffcc, 0.5, 100);
    cyanLight.position.set(-20, 10, 0);
    scene.add(cyanLight);

    const greenLight = new THREE.PointLight(0x00ff88, 0.5, 100);
    greenLight.position.set(20, 10, 0);
    scene.add(greenLight);

    const purpleLight = new THREE.PointLight(0x8a2be2, 0.4, 80);
    purpleLight.position.set(0, 10, 20);
    scene.add(purpleLight);
}

function createStarfield() {
    const starfieldGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;

        // Random position in sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const radius = 150 + Math.random() * 100;

        positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
        positions[i3 + 1] = Math.cos(phi) * radius;
        positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

        // Random color from palette
        const colorIndex = Math.floor(Math.random() * STAR_COLORS.length);
        const color = new THREE.Color(STAR_COLORS[colorIndex]);
        colors[i3] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;

        starfield.push({
            position: { x: positions[i3], y: positions[i3 + 1], z: positions[i3 + 2] },
            velocity: { x: (Math.random() - 0.5) * 0.02, y: (Math.random() - 0.5) * 0.02, z: (Math.random() - 0.5) * 0.02 }
        });
    }

    starfieldGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starfieldGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starfieldMaterial = new THREE.PointsMaterial({
        size: 0.3,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true
    });

    const points = new THREE.Points(starfieldGeometry, starfieldMaterial);
    scene.add(points);
}

function createPaddle() {
    // Curved paddle - hybrid of cube and sphere (subtle curve)
    const paddleGroup = new THREE.Group();

    // Main paddle body with slight curvature
    const mainGeometry = new THREE.BoxGeometry(6, 0.8, 1.5);
    const mainMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.3
    });
    const mainPaddle = new THREE.Mesh(mainGeometry, mainMaterial);
    mainPaddle.castShadow = true;
    mainPaddle.receiveShadow = true;
    paddleGroup.add(mainPaddle);

    // Curved edges (spherical caps on sides)
    const edgeGeometry = new THREE.SphereGeometry(0.4, 8, 8);
    const edgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        metalness: 0.85,
        roughness: 0.15,
        emissive: 0x00ff88,
        emissiveIntensity: 0.2
    });

    const leftEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    leftEdge.position.x = -3.2;
    leftEdge.scale.set(0.7, 1, 1);
    leftEdge.castShadow = true;
    paddleGroup.add(leftEdge);

    const rightEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    rightEdge.position.x = 3.2;
    rightEdge.scale.set(0.7, 1, 1);
    rightEdge.castShadow = true;
    paddleGroup.add(rightEdge);

    // Position at bottom
    paddleGroup.position.y = -GAME_HEIGHT / 2 + 2;
    paddleGroup.position.z = -20;

    paddle = paddleGroup;
    paddle.userData.width = 6;
    paddle.userData.height = 0.8;
    paddle.userData.depth = 1.5;

    scene.add(paddle);
}

function createBallObject(offsetX) {
    const ballGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const ballMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        metalness: 0.95,
        roughness: 0.05,
        emissive: 0x00ff88,
        emissiveIntensity: 0.5
    });

    const newBall = new THREE.Mesh(ballGeometry, ballMaterial);
    newBall.castShadow = true;
    newBall.receiveShadow = true;

    // Spread initial balls out slightly along the paddle
    newBall.position.set(offsetX, -GAME_HEIGHT / 2 + 4, -20);

    const ballLight = new THREE.PointLight(0x00ff88, 0.8, 40);
    ballLight.position.copy(newBall.position);
    newBall.add(ballLight);

    scene.add(newBall);

    // Each ball needs its own velocity vector and state
    return {
        mesh: newBall,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.2, BASE_SPEED, 0),
        hasSpedUp: false // tracks if THIS ball has accelerated from its first row hit
    };
}

function createBalls() {
    // Clear old balls if any
    balls.forEach(b => scene.remove(b.mesh));
    balls = [];

    // Spread 3 balls across the paddle
    const offsets = [-1.5, 0, 1.5];
    for (let i = 0; i < INITIAL_BALLS; i++) {
        balls.push(createBallObject(paddle ? paddle.position.x + offsets[i] : offsets[i]));
    }
}

function createBricks() {
    bricks = [];
    const brickWidth = 2.5;
    const brickHeight = 1;
    const brickDepth = 1;
    const spacing = 0.3;

    const startX = -GAME_WIDTH / 2 + 1;
    const startY = GAME_HEIGHT / 2 - 5;
    const startZ = -40;

    // Create grid of cubic bricks
    const rows = 4 + Math.floor(level / 2);
    const cols = 8;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = startX + col * (brickWidth + spacing);
            const y = startY - row * (brickHeight + spacing);
            const z = startZ;

            // Cubic brick geometry
            const brickGeometry = new THREE.BoxGeometry(brickWidth, brickHeight, brickDepth);

            // Color based on row
            const colorIndex = row % STAR_COLORS.length;
            const brickColor = STAR_COLORS[colorIndex];

            const brickMaterial = new THREE.MeshStandardMaterial({
                color: brickColor,
                metalness: 0.6,
                roughness: 0.3,
                emissive: brickColor,
                emissiveIntensity: 0.2
            });

            const brick = new THREE.Mesh(brickGeometry, brickMaterial);
            brick.position.set(x, y, z);
            brick.castShadow = true;
            brick.receiveShadow = true;

            brick.userData.active = true;
            brick.userData.width = brickWidth;
            brick.userData.height = brickHeight;
            brick.userData.depth = brickDepth;

            bricks.push(brick);
            scene.add(brick);
        }
    }
}

function onMouseMove(event) {
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    paddle.position.x = mouseX * GAME_WIDTH / 2;
    paddle.position.x = Math.max(-GAME_WIDTH / 2 + 3, Math.min(GAME_WIDTH / 2 - 3, paddle.position.x));
}

function updateGame() {
    if (gameOver) return;

    // Move starfield slowly
    starfield.forEach(star => {
        star.position.x += star.velocity.x;
        star.position.y += star.velocity.y;
        star.position.z += star.velocity.z;

        // Wrap around
        if (Math.abs(star.position.x) > 200) star.position.x *= -0.95;
        if (Math.abs(star.position.y) > 200) star.position.y *= -0.95;
        if (Math.abs(star.position.z) > 250) star.position.z *= -0.95;
    });

    // Update all balls
    for (let i = balls.length - 1; i >= 0; i--) {
        let b = balls[i];

        b.mesh.position.add(b.velocity);
        // Update light position (assuming it's the first child)
        if (b.mesh.children[0]) {
            b.mesh.children[0].position.copy(b.mesh.position);
        }

        // Horizontal boundaries
        if (b.mesh.position.x < -GAME_WIDTH / 2) b.velocity.x = Math.abs(b.velocity.x);
        if (b.mesh.position.x > GAME_WIDTH / 2) b.velocity.x = -Math.abs(b.velocity.x);

        // Ceiling hit
        if (b.mesh.position.y > GAME_HEIGHT / 2) {
            b.velocity.y = -Math.abs(b.velocity.y);

            // First time hitting ceiling this level: speed up + shrink paddle
            if (!hasHitCeiling) {
                hasHitCeiling = true;

                // Speed up ALL currently active balls by 25%
                balls.forEach(activeBall => {
                    activeBall.velocity.multiplyScalar(1.25);
                });

                // Shrink paddle by golden ratio (1 - 0.618) = 0.382 multiplier.
                paddle.scale.x *= 0.618;
                paddle.userData.width *= 0.618;
            }
        }

        // Ball lost (bottom)
        if (b.mesh.position.y < -GAME_HEIGHT / 2 - 5) {
            scene.remove(b.mesh);
            balls.splice(i, 1);
            updateHUD();

            // If out of balls, game over
            if (balls.length === 0) {
                endGame(false);
                return; // Stop processing this frame
            }
        } else {
            // Ball still active: Check collisions
            checkPaddleCollision(b);

            bricks.forEach(brick => {
                if (brick.userData.active) {
                    checkBrickCollision(b, brick);
                }
            });
        }
    }

    // Check win condition
    const activeBricks = bricks.filter(b => b.userData.active).length;
    if (activeBricks === 0) {
        level++;
        endGame(true);
    }
}

function checkPaddleCollision(b) {
    const paddleBox = new THREE.Box3().setFromObject(paddle);
    const ballBox = new THREE.Box3().setFromObject(b.mesh);

    if (paddleBox.intersectsBox(ballBox)) {
        // Ensure it bounces UP
        b.velocity.y = Math.abs(b.velocity.y);

        // Use the paddle's scale into account for hit position
        const currentWidth = paddle.userData.width;
        const hitPos = (b.mesh.position.x - paddle.position.x) / currentWidth;

        // Map hit pos to X velocity (-1 left edge, +1 right edge)
        // Keep the speed roughly constant by normalizing
        const speed = Math.hypot(b.velocity.x, b.velocity.y);
        b.velocity.x = hitPos * speed * 0.8;

        // Re-normalize to maintain speed
        const newSpeed = Math.hypot(b.velocity.x, b.velocity.y);
        b.velocity.x = (b.velocity.x / newSpeed) * speed;
        b.velocity.y = (b.velocity.y / newSpeed) * speed;

        b.velocity.z = Math.random() * 0.1 - 0.05;
    }
}

function checkBrickCollision(b, brick) {
    const brickBox = new THREE.Box3().setFromObject(brick);
    const ballBox = new THREE.Box3().setFromObject(b.mesh);

    if (brickBox.intersectsBox(ballBox)) {
        brick.userData.active = false;
        scene.remove(brick);
        score += 10 * level;
        updateHUD();

        // Bounce ball
        const brickCenter = brickBox.getCenter(new THREE.Vector3());
        const ballCenter = ballBox.getCenter(new THREE.Vector3());
        const diff = ballCenter.sub(brickCenter);

        if (Math.abs(diff.x) > Math.abs(diff.y)) {
            b.velocity.x *= -1;
        } else {
            b.velocity.y *= -1;
        }

        // Balls only accelerate the first time they hit a higher level (row)
        // We'll use hasSpedUp flag on the ball for this "first time" boost
        if (!b.hasSpedUp) {
            b.velocity.multiplyScalar(1.2); // One-time significant boost per ball
            b.hasSpedUp = true;
        }
    }
}

function resetBalls() {
    hasHitCeiling = false; // Reset ceiling state for the new level
    createBalls();         // Give player 3 fresh balls
}

function updateHUD() {
    document.querySelector('#score .hud-value').textContent = score;
    document.querySelector('#lives').innerHTML = 'BALLS: <span class="hud-value">' + balls.length + '</span>';
    document.querySelector('#level .hud-value').textContent = level;
    document.querySelector('#bricksLeft .hud-value').textContent = bricks.filter(b => b.userData.active).length;

    let maxSpd = 0;
    balls.forEach(b => {
        let spd = Math.hypot(b.velocity.x, b.velocity.y);
        if (spd > maxSpd) maxSpd = spd;
    });
    document.querySelector('#energy .hud-value').textContent = Math.floor(maxSpd * 100);
}

function endGame(won_) {
    gameOver = true;
    won = won_;

    const overlay = document.getElementById('gameOverOverlay');
    const message = document.getElementById('gameOverMessage');
    const finalScore = document.getElementById('finalScore');

    if (won) {
        message.textContent = 'LEVEL COMPLETE!';
        message.style.color = '#00ff88';
        message.style.textShadow = '0 0 30px rgba(0, 255, 136, 0.8)';
    } else {
        message.textContent = 'GAME OVER';
        message.style.color = '#ff0000';
        message.style.textShadow = '0 0 30px rgba(255, 0, 0, 0.8)';
    }

    finalScore.textContent = `SCORE: ${score}`;
    overlay.classList.add('active');
}

function restartGame() {
    location.reload();
}

function animate() {
    requestAnimationFrame(animate);

    updateGame();

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start game
window.addEventListener('load', () => {
    init();
    updateHUD();
});
