/**
 * =========================================
 * 🌀 MANIFOLD DISCOVERY SUBSTRATE
 * Game Positioning on Dimensional Surface
 * =========================================
 *
 * Games positioned in dimensional space:
 * - x = playerCount
 * - y = playtime (minutes)
 * - z = x * y (manifold surface)
 *
 * Provides:
 * - Game positioning in manifold coordinates
 * - Distance calculation between games
 * - Recommendation algorithm (nearest neighbors)
 * - 3D visualization of game manifold
 */

const ManifoldDiscoverySubstrate = (() => {
    // =========================================
    // GAME MANIFOLD COORDINATES
    // =========================================
    const gameManifold = {
        'fasttrack-v2': {
            x: 2,      // 2 players
            y: 45,     // 45 minutes
            color: 0x00b4ff,
            emoji: '🏎️'
        },
        'fasttrack-5card': {
            x: 2,      // 2 players
            y: 15,     // 15 minutes
            color: 0xffd700,
            emoji: '🎲'
        },
        'brickbreaker-solo': {
            x: 1,      // 1 player
            y: 20,     // 20 minutes
            color: 0xff6b9d,
            emoji: '🧱'
        },
        'brickbreaker-multi': {
            x: 3,      // 3 players
            y: 25,     // 25 minutes
            color: 0x22d3ee,
            emoji: '🎯'
        }
    };

    // =========================================
    // CALCULATE MANIFOLD Z COORDINATE
    // =========================================
    const calculateManifoldZ = (x, y) => {
        return x * y;
    };

    // =========================================
    // CONVERT TO 3D CARTESIAN COORDINATES
    // =========================================
    /**
     * Projects manifold coordinates to 3D space for visualization
     * Uses trigonometric mapping to create smooth distribution
     */
    const getManifoldPosition = (gameId) => {
        const game = gameManifold[gameId];
        if (!game) return null;

        const z = calculateManifoldZ(game.x, game.y);

        // Map to 3D space using trig functions
        // This creates a curved distribution on the z=xy surface
        const x = Math.cos((game.x * Math.PI) / 5) * (game.x * 30);
        const y = z / 15; // Scale z for visibility
        const z3d = Math.sin((game.y * Math.PI) / 30) * (game.y * 2);

        return {
            gameId: gameId,
            x: x,
            y: y,
            z: z3d,
            // Original manifold coordinates
            manifoldX: game.x,
            manifoldY: game.y,
            manifoldZ: z,
            color: game.color,
            emoji: game.emoji
        };
    };

    // =========================================
    // CALCULATE EUCLIDEAN DISTANCE IN MANIFOLD
    // =========================================
    const calculateDistance = (gameId1, gameId2) => {
        const pos1 = getManifoldPosition(gameId1);
        const pos2 = getManifoldPosition(gameId2);

        if (!pos1 || !pos2) return Infinity;

        // Euclidean distance in 3D manifold space
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // =========================================
    // GET NEARBY GAMES (RECOMMENDATIONS)
    // =========================================
    /**
     * Returns games closest to the specified game in manifold space
     * Excludes the reference game itself
     */
    const getNearbyGames = (gameId, limit = 3) => {
        const games = Object.keys(gameManifold);
        const distances = games
            .filter(g => g !== gameId)
            .map(g => ({
                gameId: g,
                distance: calculateDistance(gameId, g),
                position: getManifoldPosition(g)
            }))
            .sort((a, b) => a.distance - b.distance);

        return distances.slice(0, limit);
    };

    // =========================================
    // CREATE 3D VISUALIZATION SCENE
    // =========================================
    const createVisualizationScene = (containerId, selectedGameId = null) => {
        const container = document.getElementById(containerId);
        if (!container) return null;

        // Initialize Three.js
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            75,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        camera.position.set(100, 80, 100);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x0a0a14, 0.8);
        container.appendChild(renderer.domElement);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00b4ff, 1, 500);
        pointLight.position.set(100, 100, 100);
        scene.add(pointLight);

        // Create game nodes
        const gameNodes = {};
        Object.keys(gameManifold).forEach(gameId => {
            const pos = getManifoldPosition(gameId);

            // Create sphere for game
            const geometry = new THREE.SphereGeometry(5, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: pos.color,
                emissive: pos.color,
                emissiveIntensity: selectedGameId === gameId ? 0.6 : 0.2,
                shininess: 100
            });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(pos.x, pos.y, pos.z);

            scene.add(sphere);
            gameNodes[gameId] = { sphere, pos };

            // Add label
            const label = createGameLabel(gameId, pos);
            scene.add(label);
        });

        // Create manifold surface mesh (simplified)
        createManifoldSurface(scene);

        // Mouse interaction
        let mouseX = 0, mouseY = 0;
        let targetRotationX = 0, targetRotationY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / container.clientWidth) - 0.5;
            mouseY = (e.clientY / container.clientHeight) - 0.5;

            targetRotationY = mouseX * Math.PI * 0.4;
            targetRotationX = mouseY * Math.PI * 0.3;
        });

        // Animation loop
        let rotationX = 0, rotationY = 0;
        function animate() {
            requestAnimationFrame(animate);

            rotationX += (targetRotationX - rotationX) * 0.05;
            rotationY += (targetRotationY - rotationY) * 0.05;

            scene.rotation.x = rotationX;
            scene.rotation.y = rotationY;

            renderer.render(scene, camera);
        }
        animate();

        // Handle resize
        const handleResize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        return { scene, camera, renderer, gameNodes };
    };

    // =========================================
    // CREATE GAME LABEL (TextGeometry alternative)
    // =========================================
    const createGameLabel = (gameId, pos) => {
        const game = gameManifold[gameId];
        const group = new THREE.Group();

        // Create canvas texture for label
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00b4ff';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(game.emoji, 128, 50);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '24px Arial';
        ctx.fillText(gameId, 128, 90);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(pos.x, pos.y + 15, pos.z);
        sprite.scale.set(10, 5, 1);

        group.add(sprite);
        return group;
    };

    // =========================================
    // CREATE MANIFOLD SURFACE MESH
    // =========================================
    const createManifoldSurface = (scene) => {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        // Generate z=xy surface mesh
        const gridSize = 5;
        const scale = 20;

        for (let x = 0; x <= gridSize; x++) {
            for (let y = 0; y <= gridSize; y++) {
                const xVal = (x / gridSize - 0.5) * scale;
                const yVal = (y / gridSize - 0.5) * scale;
                const z = yVal * 15; // Scale for visibility

                positions.push(xVal, z, yVal);

                // Color based on height
                const hue = (z + scale * 5) / (scale * 10);
                const color = new THREE.Color();
                color.setHSL(0.6 + hue * 0.3, 0.8, 0.5);
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

        // Create indices for surface
        const indices = [];
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const a = x * (gridSize + 1) + y;
                const b = a + (gridSize + 1);
                const c = a + 1;
                const d = b + 1;

                indices.push(a, b, c);
                indices.push(b, d, c);
            }
        }

        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
    };

    // =========================================
    // FORMAT RECOMMENDATION HTML
    // =========================================
    const formatRecommendations = (gameId) => {
        const nearby = getNearbyGames(gameId, 3);

        if (nearby.length === 0) {
            return '<p>No nearby games found</p>';
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';

        nearby.forEach((rec, i) => {
            const game = gameManifold[rec.gameId];
            const distPercent = Math.round((1 - rec.distance / 150) * 100);

            html += `
                <div style="
                    background: rgba(0, 180, 255, 0.1);
                    border-left: 4px solid ${`#${rec.position.color.toString(16).padStart(6, '0')}`};
                    padding: 12px;
                    border-radius: 8px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 20px; margin-right: 10px;">${game.emoji}</span>
                        <div style="flex: 1;">
                            <strong>${rec.gameId}</strong>
                            <div style="font-size: 12px; color: #94a3b8;">
                                Players: ${rec.position.manifoldX} | Duration: ${rec.position.manifoldY}m
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 12px; color: #00b4ff;">
                            <strong>${distPercent}%</strong><br>similar
                        </div>
                    </div>
                    <div style="margin-top: 8px; background: rgba(0, 180, 255, 0.2); height: 4px; border-radius: 2px;">
                        <div style="background: #00b4ff; height: 100%; width: ${distPercent}%; border-radius: 2px;"></div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    };

    // =========================================
    // PUBLIC API
    // =========================================
    return {
        getGameManifold: () => gameManifold,
        getManifoldPosition: getManifoldPosition,
        calculateDistance: calculateDistance,
        getNearbyGames: getNearbyGames,
        createVisualizationScene: createVisualizationScene,
        formatRecommendations: formatRecommendations,
        calculateManifoldZ: calculateManifoldZ
    };
})();

// Browser + Node dual export
if (typeof window !== 'undefined') window.ManifoldDiscoverySubstrate = ManifoldDiscoverySubstrate;
if (typeof module !== 'undefined') module.exports = ManifoldDiscoverySubstrate;
