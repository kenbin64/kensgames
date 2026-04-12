// BrickBreaker 3D - Multiplayer Edition
// Game mode selector and launcher

let currentGameMode = null;

const GAME_MODES = {
    SINGLE_PLAYER: 'singleplayer',
    PRIVATE_GAME: 'private_game',
    MATCHMAKER: 'matchmaker',
    PRACTICE_BOTS: 'practice_bots'
};

const PLAYER_COLORS = [
    { hex: 0x00ffcc, name: 'Cyan', rgb: 'rgb(0, 255, 204)' },
    { hex: 0x00ff88, name: 'Green', rgb: 'rgb(0, 255, 136)' },
    { hex: 0xffff00, name: 'Yellow', rgb: 'rgb(255, 255, 0)' },
    { hex: 0x8a2be2, name: 'Purple', rgb: 'rgb(138, 43, 226)' }
];

const BOT_DIFFICULTIES = {
    EASY: { accuracy: 0.6, speed: 0.08, reaction: 500 },
    MEDIUM: { accuracy: 0.8, speed: 0.12, reaction: 300 },
    HARD: { accuracy: 0.95, speed: 0.15, reaction: 150 },
    EXPERT: { accuracy: 0.98, speed: 0.18, reaction: 80 }
};

class MultiplayerGame {
    constructor(mode, playerCount, includeBotsInPrivate = false) {
        this.mode = mode;
        this.playerCount = playerCount;
        this.includeBotsInPrivate = includeBotsInPrivate;
        this.players = [];
        this.activePlayers = [];
        this.balls = [];
        this.bricks = [];

        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.gameWidth = 20 + (playerCount - 1) * 15;
        this.gameHeight = 25 + (playerCount - 1) * 8;
        this.gameDepth = 80;

        this.gameRunning = true;
    }

    init() {
        this.setupScene();
        this.setupPlayers();
        this.createBricks();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x000000, 250, 500);

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            10000
        );

        // Adjust camera based on player count
        this.camera.position.z = 25 + (this.playerCount - 1) * 5;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            canvas: document.getElementById('canvas')
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        this.setupLighting();
        this.createStarfield();
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(30, 30, 30);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Colored accent lights for each player
        PLAYER_COLORS.forEach((color, idx) => {
            const light = new THREE.PointLight(color.hex, 0.6, 120);
            const angle = (idx / this.playerCount) * Math.PI * 2;
            light.position.set(Math.cos(angle) * 40, 15, Math.sin(angle) * 40);
            this.scene.add(light);
        });
    }

    createStarfield() {
        const starfieldGeometry = new THREE.BufferGeometry();
        const starCount = 1500;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 200 + Math.random() * 150;

            positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
            positions[i3 + 1] = Math.cos(phi) * radius;
            positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

            const colorIndex = Math.floor(Math.random() * PLAYER_COLORS.length);
            const color = new THREE.Color(PLAYER_COLORS[colorIndex].hex);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        starfieldGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starfieldGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const starfieldMaterial = new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true
        });

        const points = new THREE.Points(starfieldGeometry, starfieldMaterial);
        this.scene.add(points);
    }

    setupPlayers() {
        // Create player objects
        for (let i = 0; i < this.playerCount; i++) {
            const isBot = i > 0 && (this.mode === GAME_MODES.SINGLE_PLAYER || this.includeBotsInPrivate);
            const playerColor = PLAYER_COLORS[i % PLAYER_COLORS.length];

            const player = {
                id: i,
                name: isBot ? `Bot ${i}` : `Player ${i + 1}`,
                color: playerColor,
                score: 0,
                isBot: isBot,
                isActive: true,
                difficulty: isBot ? this.getDifficultyForMode(i) : null,
                paddle: null,
                ball: null,
                ballVelocity: new THREE.Vector3(0, 0, 0),
                mouseX: 0
            };

            // Create paddle
            player.paddle = this.createPaddle(i, playerColor);

            // Create ball
            player.ball = this.createBall(i, playerColor, player.paddle);
            player.ballVelocity.set(
                (Math.random() - 0.5) * 0.3,
                -0.2 - Math.random() * 0.1,
                0
            );

            this.players.push(player);
            this.activePlayers.push(player);
        }

        this.updatePlayerHUD();
    }

    getDifficultyForMode(playerIndex) {
        if (this.mode === GAME_MODES.SINGLE_PLAYER) {
            return BOT_DIFFICULTIES.MEDIUM; // Single player gets medium difficulty
        } else if (this.mode === GAME_MODES.PRACTICE_BOTS) {
            // Progressive difficulty based on player index
            const diffLevels = [
                BOT_DIFFICULTIES.EASY,
                BOT_DIFFICULTIES.MEDIUM,
                BOT_DIFFICULTIES.HARD,
                BOT_DIFFICULTIES.EXPERT
            ];
            return diffLevels[Math.min(playerIndex - 1, 3)];
        } else if (this.mode === GAME_MODES.MATCHMAKER) {
            return BOT_DIFFICULTIES.MEDIUM; // Matchmaker uses medium
        }
        return BOT_DIFFICULTIES.EASY;
    }

    createPaddle(playerIndex, color) {
        const paddleGroup = new THREE.Group();

        // Main paddle body
        const mainGeometry = new THREE.BoxGeometry(5, 0.7, 1.2);
        const mainMaterial = new THREE.MeshStandardMaterial({
            color: color.hex,
            metalness: 0.8,
            roughness: 0.2,
            emissive: color.hex,
            emissiveIntensity: 0.4
        });
        const mainPaddle = new THREE.Mesh(mainGeometry, mainMaterial);
        mainPaddle.castShadow = true;
        mainPaddle.receiveShadow = true;
        paddleGroup.add(mainPaddle);

        // Curved edges
        const edgeGeometry = new THREE.SphereGeometry(0.35, 8, 8);
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: color.hex,
            metalness: 0.85,
            roughness: 0.15,
            emissive: color.hex,
            emissiveIntensity: 0.3
        });

        const leftEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        leftEdge.position.x = -2.8;
        leftEdge.scale.set(0.65, 1, 1);
        leftEdge.castShadow = true;
        paddleGroup.add(leftEdge);

        const rightEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        rightEdge.position.x = 2.8;
        rightEdge.scale.set(0.65, 1, 1);
        rightEdge.castShadow = true;
        paddleGroup.add(rightEdge);

        // Position paddle based on player index
        const angle = (playerIndex / this.playerCount) * Math.PI * 2;
        const radius = this.gameWidth / 2 + 8;

        paddleGroup.position.x = Math.cos(angle) * radius;
        paddleGroup.position.z = Math.sin(angle) * radius;
        paddleGroup.position.y = -this.gameHeight / 2 + 1.5;
        paddleGroup.rotation.y = angle + Math.PI / 2;

        paddleGroup.userData = {
            playerIndex: playerIndex,
            width: 5,
            height: 0.7,
            depth: 1.2
        };

        this.scene.add(paddleGroup);
        return paddleGroup;
    }

    createBall(playerIndex, color, paddle) {
        const ballGeometry = new THREE.SphereGeometry(0.25, 16, 16);
        const ballMaterial = new THREE.MeshStandardMaterial({
            color: color.hex,
            metalness: 0.95,
            roughness: 0.05,
            emissive: color.hex,
            emissiveIntensity: 0.6
        });

        const ball = new THREE.Mesh(ballGeometry, ballMaterial);
        ball.castShadow = true;
        ball.receiveShadow = true;

        // Position near paddle
        ball.position.copy(paddle.position);
        ball.position.y = paddle.position.y + 2;

        const ballLight = new THREE.PointLight(color.hex, 0.9, 50);
        ballLight.position.copy(ball.position);
        ball.add(ballLight);

        ball.userData = {
            playerIndex: playerIndex,
            active: true,
            color: color
        };

        this.scene.add(ball);
        return ball;
    }

    createBricks() {
        const brickWidth = 2;
        const brickHeight = 0.8;
        const brickDepth = 0.8;
        const spacing = 0.2;

        const startX = -this.gameWidth / 2 + 2;
        const startY = this.gameHeight / 2 - 6;
        const startZ = -50;

        const rows = 3 + Math.floor(this.playerCount / 2);
        const cols = 10 + this.playerCount * 2;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = startX + col * (brickWidth + spacing);
                const y = startY - row * (brickHeight + spacing);
                const z = startZ;

                if (x < -this.gameWidth / 2 - 5 || x > this.gameWidth / 2 + 5) continue;

                const brickGeometry = new THREE.BoxGeometry(brickWidth, brickHeight, brickDepth);

                const colorIndex = (row + col) % PLAYER_COLORS.length;
                const brickColor = PLAYER_COLORS[colorIndex].hex;

                const brickMaterial = new THREE.MeshStandardMaterial({
                    color: brickColor,
                    metalness: 0.6,
                    roughness: 0.3,
                    emissive: brickColor,
                    emissiveIntensity: 0.15
                });

                const brick = new THREE.Mesh(brickGeometry, brickMaterial);
                brick.position.set(x, y, z);
                brick.castShadow = true;
                brick.receiveShadow = true;

                brick.userData = {
                    active: true,
                    width: brickWidth,
                    height: brickHeight,
                    depth: brickDepth
                };

                this.bricks.push(brick);
                this.scene.add(brick);
            }
        }
    }

    setupEventListeners() {
        document.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    onMouseMove(event) {
        const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        // Find human player and update their paddle
        const humanPlayer = this.players.find(p => !p.isBot);
        if (humanPlayer) {
            humanPlayer.mouseX = mouseX;
        }
    }

    updateGame() {
        if (!this.gameRunning) return;

        // Update each player's ball
        this.activePlayers.forEach(player => {
            // Move ball
            player.ball.position.add(player.ballVelocity);

            // Update light position
            if (player.ball.children.length > 0) {
                player.ball.children[0].position.copy(player.ball.position);
            }

            // Ball boundary checks
            if (Math.abs(player.ball.position.x) > this.gameWidth / 2 + 5) {
                player.ballVelocity.x *= -1;
            }
            if (Math.abs(player.ball.position.z) > this.gameDepth / 2) {
                player.ballVelocity.z *= -1;
            }
            if (player.ball.position.y > this.gameHeight / 2 + 5) {
                player.ballVelocity.y *= -1;
            }

            // Ball lost - check if player is eliminated
            if (player.ball.position.y < -this.gameHeight / 2 - 10) {
                this.handleBallLost(player);
            }

            // Paddle collision
            this.checkPaddleCollision(player);

            // Brick collisions
            this.bricks.forEach(brick => {
                if (brick.userData.active) {
                    this.checkBrickCollision(player, brick);
                }
            });

            // Bot AI
            if (player.isBot && player.isActive) {
                this.updateBotPaddle(player);
            } else if (!player.isBot && player.isActive) {
                this.updateHumanPaddle(player);
            }
        });

        // Check win condition
        if (this.activePlayers.length === 1) {
            this.endGame();
        }
    }

    handleBallLost(player) {
        player.score = Math.max(0, player.score - 50); // Penalty for lost ball

        // Check if player is lowest scorer
        if (this.activePlayers.length > 1) {
            const lowestScore = Math.min(...this.activePlayers.map(p => p.score));
            if (player.score === lowestScore) {
                this.eliminatePlayer(player);
            } else {
                // Reset ball
                player.ballVelocity.set(
                    (Math.random() - 0.5) * 0.3,
                    -0.25,
                    0
                );
                player.ball.position.copy(player.paddle.position);
                player.ball.position.y = player.paddle.position.y + 2;
            }
        }

        this.updatePlayerHUD();
    }

    eliminatePlayer(player) {
        player.isActive = false;
        this.scene.remove(player.ball);

        // Gray out paddle
        player.paddle.children[0].material.opacity = 0.3;
        player.paddle.children[0].material.transparent = true;

        this.activePlayers = this.activePlayers.filter(p => p.id !== player.id);
    }

    checkPaddleCollision(player) {
        const paddleBox = new THREE.Box3().setFromObject(player.paddle);
        const ballBox = new THREE.Box3().setFromObject(player.ball);

        if (paddleBox.intersectsBox(ballBox)) {
            player.ballVelocity.y = Math.abs(player.ballVelocity.y) * 1.05;

            const hitPos = (player.ball.position.x - player.paddle.position.x) / (player.paddle.userData.width * 0.8);
            player.ballVelocity.x = hitPos * 0.3;

            player.score += 5;
        }
    }

    checkBrickCollision(player, brick) {
        const brickBox = new THREE.Box3().setFromObject(brick);
        const ballBox = new THREE.Box3().setFromObject(player.ball);

        if (brickBox.intersectsBox(ballBox)) {
            brick.userData.active = false;
            this.scene.remove(brick);

            player.score += 10;

            const brickCenter = brickBox.getCenter(new THREE.Vector3());
            const ballCenter = ballBox.getCenter(new THREE.Vector3());
            const diff = ballCenter.sub(brickCenter);

            if (Math.abs(diff.x) > Math.abs(diff.y)) {
                player.ballVelocity.x *= -1.02;
            } else {
                player.ballVelocity.y *= -1.02;
            }

            this.updatePlayerHUD();
        }
    }

    updateHumanPaddle(player) {
        const targetX = player.mouseX * this.gameWidth / 2 * 0.8;
        player.paddle.position.x += (targetX - player.paddle.position.x) * 0.15;
        player.paddle.position.x = Math.max(
            -this.gameWidth / 2 + 3,
            Math.min(this.gameWidth / 2 - 3, player.paddle.position.x)
        );
    }

    updateBotPaddle(player) {
        const diff = new THREE.Difficulty(player.difficulty);

        // Predict ball position
        const ballFuturePos = player.ball.position.clone().add(
            player.ballVelocity.clone().multiplyScalar(diff.reaction)
        );

        // Calculate target position with accuracy variance
        let targetX = ballFuturePos.x;
        if (Math.random() > diff.accuracy) {
            targetX += (Math.random() - 0.5) * 4;
        }

        // Move paddle toward target
        const moveSpeed = diff.speed;
        player.paddle.position.x += Math.max(-moveSpeed, Math.min(moveSpeed, targetX - player.paddle.position.x)) * 0.1;
        player.paddle.position.x = Math.max(
            -this.gameWidth / 2 + 3,
            Math.min(this.gameWidth / 2 - 3, player.paddle.position.x)
        );
    }

    updatePlayerHUD() {
        const hudContainer = document.getElementById('hud');
        hudContainer.innerHTML = '';

        this.players.forEach(player => {
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.color = player.color.rgb;
            div.style.textShadow = `0 0 10px ${player.color.rgb}`;
            div.style.fontFamily = 'Rajdhani, sans-serif';
            div.style.fontSize = '14px';
            div.style.fontWeight = '700';
            div.style.opacity = player.isActive ? '1' : '0.4';

            if (this.playerCount === 2) {
                div.style.left = player.id === 0 ? '30px' : 'auto';
                div.style.right = player.id === 1 ? '30px' : 'auto';
                div.style.top = '120px';
            } else if (this.playerCount === 3) {
                if (player.id === 0) {
                    div.style.left = '30px';
                    div.style.top = '120px';
                } else if (player.id === 1) {
                    div.style.right = '30px';
                    div.style.top = '120px';
                } else {
                    div.style.left = '50%';
                    div.style.transform = 'translateX(-50%)';
                    div.style.top = '30px';
                }
            } else {
                this.positionPlayerHUD(div, player.id, 4);
            }

            div.innerHTML = `
                <div>${player.name}</div>
                <div>Score: <span style="color: ${player.color.rgb}">${player.score}</span></div>
            `;

            hudContainer.appendChild(div);
        });
    }

    positionPlayerHUD(div, id, total) {
        const size = '14px';
        if (total === 4) {
            if (id === 0) { div.style.left = '30px'; div.style.top = '120px'; }
            else if (id === 1) { div.style.right = '30px'; div.style.top = '120px'; }
            else if (id === 2) { div.style.left = '30px'; div.style.bottom = '120px'; }
            else { div.style.right = '30px'; div.style.bottom = '120px'; }
        }
    }

    endGame() {
        this.gameRunning = false;
        const winner = this.players.reduce((prev, current) =>
            (prev.score > current.score) ? prev : current
        );

        alert(`GAME OVER!\n\nWinner: ${winner.name}\nScore: ${winner.score}`);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateGame();
        this.renderer.render(this.scene, this.camera);
    }
}

// Game launcher
function startGame(mode, playerCount, includeBotsInPrivate = false) {
    const game = new MultiplayerGame(mode, playerCount, includeBotsInPrivate);
    game.init();
    window.currentGame = game;
}

// Initialize with menu
window.addEventListener('load', () => {
    showGameModeMenu();
});

function showGameModeMenu() {
    const menuHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.95); padding: 40px; border: 2px solid #00ffcc;
                    border-radius: 15px; text-align: center; z-index: 1000; font-family: Orbitron;">
            <h1 style="color: #00ffcc; margin-bottom: 30px; text-shadow: 0 0 20px rgba(0,255,204,0.8);">
                BRICKBREAKER 3D - MULTIPLAYER
            </h1>
            <div style="display: flexdirection: column; gap: 15px;">
                <button onclick="startGame('${GAME_MODES.SINGLE_PLAYER}', 1)"
                        style="padding: 12px 30px; font-size: 16px; background: #00ffcc; color: #000;
                               border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    1 PLAYER vs BOTS
                </button>
                <button onclick="showPrivateGameMenu()"
                        style="padding: 12px 30px; font-size: 16px; background: #00ff88; color: #000;
                               border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    PRIVATE GAME (2-4 PLAYERS)
                </button>
                <button onclick="startMatchmaker()"
                        style="padding: 12px 30px; font-size: 16px; background: #8a2be2; color: #fff;
                               border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    MATCHMAKER
                </button>
            </div>
        </div>
    `;
    document.body.innerHTML += menuHTML;
}

function showPrivateGameMenu() {
    // Will handle private game creation with code
    alert('Private Game: Coming Soon\nCreate game with 2-4 players');
}

function startMatchmaker() {
    alert('Matchmaker: Finding players...\nFor now, starting with 2 players + bots');
    const playerCount = Math.floor(Math.random() * 3) + 2;
    startGame(GAME_MODES.MATCHMAKER, playerCount, true);
}
