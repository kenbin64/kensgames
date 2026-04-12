/**
 * FastTrack Render Manifold
 *
 * Minimal Surface: 3D rendering for FastTrack
 * Maintains original look and feel with OrbitControls
 */

const FastTrackRender = (function() {
    'use strict';

    let renderer, scene, camera, controls;
    let boardGroup, pegGroup;
    let holeMeshes = new Map();

    // Golden ratio for proportions
    const PHI = 1.618033988749895;
    const BOARD_RADIUS = 12;
    const HOLE_RADIUS = 0.35;

    /**
     * Initialize 3D scene
     */
    function init(container) {
        // Get or create container
        const containerEl = typeof container === 'string'
            ? document.getElementById(container)
            : container || document.getElementById('container');

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        containerEl.appendChild(renderer.domElement);

        // Scene with gradient background
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a1a);
        scene.fog = new THREE.Fog(0x0a0a1a, 30, 80);

        // Camera
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 25, 25);

        // OrbitControls for smooth interaction
        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.rotateSpeed = 0.5;
            controls.zoomSpeed = 0.8;
            controls.minDistance = 15;
            controls.maxDistance = 60;
            controls.maxPolarAngle = Math.PI / 2.1;
            controls.target.set(0, 0, 0);
            controls.update();
        }

        // Create groups
        boardGroup = new THREE.Group();
        pegGroup = new THREE.Group();
        scene.add(boardGroup);
        scene.add(pegGroup);

        // Lighting - atmospheric like original
        const ambient = new THREE.AmbientLight(0x404060, 0.4);
        scene.add(ambient);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.9);
        mainLight.position.set(15, 30, 10);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 1;
        mainLight.shadow.camera.far = 80;
        mainLight.shadow.camera.left = -25;
        mainLight.shadow.camera.right = 25;
        mainLight.shadow.camera.top = 25;
        mainLight.shadow.camera.bottom = -25;
        scene.add(mainLight);

        // Accent lights
        const blueLight = new THREE.PointLight(0x4488ff, 0.4, 40);
        blueLight.position.set(-15, 10, -15);
        scene.add(blueLight);

        const goldLight = new THREE.PointLight(0xffaa00, 0.3, 40);
        goldLight.position.set(15, 8, 15);
        scene.add(goldLight);

        const centerLight = new THREE.PointLight(0xffd700, 0.5, 20);
        centerLight.position.set(0, 5, 0);
        scene.add(centerLight);

        // Handle resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        return { scene, camera, controls };
    }
    
    /**
     * Render the board - matching original FastTrack look
     */
    function renderBoard() {
        // Clear existing
        while (boardGroup.children.length > 0) {
            boardGroup.remove(boardGroup.children[0]);
        }
        holeMeshes.clear();

        // Board base - circular with wood-like texture
        const baseGeom = new THREE.CylinderGeometry(BOARD_RADIUS + 1, BOARD_RADIUS + 1.2, 0.8, 64);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x2a1810,
            metalness: 0.1,
            roughness: 0.8
        });
        const base = new THREE.Mesh(baseGeom, baseMat);
        base.position.y = -0.4;
        base.receiveShadow = true;
        base.castShadow = true;
        boardGroup.add(base);

        // Playing surface
        const surfaceGeom = new THREE.CylinderGeometry(BOARD_RADIUS, BOARD_RADIUS, 0.3, 64);
        const surfaceMat = new THREE.MeshStandardMaterial({
            color: 0x1a472a, // Green felt
            metalness: 0,
            roughness: 0.9
        });
        const surface = new THREE.Mesh(surfaceGeom, surfaceMat);
        surface.receiveShadow = true;
        boardGroup.add(surface);

        // Board rim
        const rimGeom = new THREE.TorusGeometry(BOARD_RADIUS, 0.15, 8, 64);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            metalness: 0.8,
            roughness: 0.2
        });
        const rim = new THREE.Mesh(rimGeom, rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.15;
        boardGroup.add(rim);

        // Render holes
        for (const [id, hole] of BoardSubstrate.holes) {
            const holeMesh = createHoleMesh(hole);
            holeMeshes.set(id, holeMesh);
            boardGroup.add(holeMesh);
        }
    }
    
    /**
     * Create mesh for a hole
     */
    function createHoleMesh(hole) {
        const color = getHoleColor(hole);
        const radius = hole.type === 'center' ? 0.6 : BoardSubstrate.HOLE_RADIUS;
        
        const geom = new THREE.CylinderGeometry(radius, radius, 0.2, 16);
        const mat = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.5,
            roughness: 0.3
        });
        
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(hole.position.x, 0.2, hole.position.z);
        mesh.userData.holeId = hole.id;
        mesh.receiveShadow = true;
        
        return mesh;
    }
    
    /**
     * Get color for hole type
     */
    function getHoleColor(hole) {
        if (hole.playerIndex >= 0) {
            return BoardSubstrate.PLAYER_POSITIONS[hole.playerIndex].color;
        }
        
        switch (hole.type) {
            case 'center': return 0xffd700;
            case 'outer': return 0x666688;
            default: return 0x444466;
        }
    }
    
    /**
     * Render all pegs
     */
    function renderPegs() {
        while (pegGroup.children.length > 0) {
            pegGroup.remove(pegGroup.children[0]);
        }
        
        for (const [id, peg] of PegSubstrate.pegs) {
            const color = BoardSubstrate.PLAYER_POSITIONS[peg.playerIndex].color;
            const mesh = PegSubstrate.createMesh(peg, color);
            
            // Position at hole
            const hole = BoardSubstrate.getHole(peg.holeId);
            if (hole) {
                mesh.position.set(hole.position.x, 0.5, hole.position.z);
            }
            
            pegGroup.add(mesh);
        }
    }
    
    /**
     * Animate peg movement
     */
    function animatePegMove(pegId, fromHoleId, toHoleId, onComplete) {
        const peg = PegSubstrate.getPeg(pegId);
        if (!peg || !peg.mesh) {
            onComplete?.();
            return;
        }
        
        const fromHole = BoardSubstrate.getHole(fromHoleId);
        const toHole = BoardSubstrate.getHole(toHoleId);
        if (!fromHole || !toHole) {
            onComplete?.();
            return;
        }
        
        const mesh = peg.mesh;
        const start = { x: fromHole.position.x, z: fromHole.position.z };
        const end = { x: toHole.position.x, z: toHole.position.z };
        
        const duration = 500;
        const startTime = performance.now();
        
        function animate() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease out cubic
            const ease = 1 - Math.pow(1 - t, 3);
            
            // Arc motion
            const x = start.x + (end.x - start.x) * ease;
            const z = start.z + (end.z - start.z) * ease;
            const y = 0.5 + Math.sin(t * Math.PI) * 2;
            
            mesh.position.set(x, y, z);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                mesh.position.set(end.x, 0.5, end.z);
                onComplete?.();
            }
        }
        
        animate();
    }
    
    /**
     * Highlight legal moves
     */
    function highlightMoves(moves) {
        clearHighlights();
        
        for (const move of moves) {
            const holeMesh = holeMeshes.get(move.to);
            if (holeMesh) {
                holeMesh.material.emissive.setHex(0x00ff00);
                holeMesh.material.emissiveIntensity = 0.5;
            }
        }
    }
    
    /**
     * Clear highlights
     */
    function clearHighlights() {
        for (const mesh of holeMeshes.values()) {
            mesh.material.emissive.setHex(0x000000);
            mesh.material.emissiveIntensity = 0;
        }
    }
    
    /**
     * Render frame
     */
    function render() {
        if (controls) controls.update();
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    /**
     * Reset camera view
     */
    function resetView() {
        if (camera) {
            camera.position.set(0, 25, 25);
            if (controls) {
                controls.target.set(0, 0, 0);
                controls.update();
            }
        }
    }
    
    // Public API
    return {
        init,
        renderBoard,
        renderPegs,
        animatePegMove,
        highlightMoves,
        clearHighlights,
        render,
        resetView,
        get scene() { return scene; },
        get camera() { return camera; },
        get controls() { return controls; }
    };
})();

if (typeof module !== 'undefined') module.exports = FastTrackRender;

