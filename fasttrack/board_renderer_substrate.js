/**
 * 🎯 BOARD RENDERER SUBSTRATE
 * ButterflyFX Dimensional Pattern: z = xy (holes exist at coordinates)
 * 
 * Extracts board rendering from 3d.html into a composable substrate.
 * All board geometry lives on a 2D manifold where:
 *   - x = angular position (0-2π around hexagon)
 *   - y = radial distance from center
 *   - z = computed properties (hole type, player index, etc.)
 * 
 * @requires THREE.js
 * @requires PHI (golden ratio constant)
 */

const BoardRendererSubstrate = {
    // Substrate identity
    name: 'BoardRenderer',
    version: '1.0.0',
    layer: 'Render',
    
    // Dimensional constants (φ-proportioned)
    PHI: 1.618033988749895,
    
    // Board geometry
    config: {
        boardRadius: null,      // Set on init based on viewport
        innerHexRadius: null,   // FastTrack ring radius
        outerRadius: null,      // Outer track radius
        lineHeight: null,       // Height of game surface
        holeRadius: 8,          // Standard hole radius
        trackHoleRadius: 7,     // Track hole radius
    },
    
    // References (set on init)
    scene: null,
    boardGroup: null,
    holeRegistry: null,
    
    // Visual elements
    elements: {
        boardMesh: null,
        borderSegments: [],
        goldenCrowns: [],
        safeZonePlanes: [],
        coloredMarkers: [],
    },
    
    /**
     * Initialize the substrate with scene reference
     * @param {THREE.Scene} scene - Three.js scene
     * @param {THREE.Group} boardGroup - Group to add board elements to
     * @param {Map} holeRegistry - Registry for hole data
     */
    init: function(scene, boardGroup, holeRegistry) {
        this.scene = scene;
        this.boardGroup = boardGroup;
        this.holeRegistry = holeRegistry || new Map();
        
        // Calculate φ-proportioned dimensions
        const baseSize = Math.min(window.innerWidth, window.innerHeight);
        this.config.boardRadius = baseSize * 0.35;
        this.config.innerHexRadius = this.config.boardRadius / this.PHI / this.PHI;
        this.config.outerRadius = this.config.boardRadius * 0.95;
        this.config.lineHeight = this.config.boardRadius / this.PHI / 10;
        
        console.log('🎯 [BoardRendererSubstrate] Initialized with φ-proportions');
        return this;
    },
    
    /**
     * Create the complete board
     * Manifests all board geometry from dimensional coordinates
     */
    createBoard: function() {
        if (!this.boardGroup) {
            console.error('[BoardRendererSubstrate] Not initialized - call init() first');
            return;
        }
        
        console.log('🎯 [BoardRendererSubstrate] Creating board...');
        
        // Create in dimensional order (inner to outer)
        this.createHexagonSurface();
        this.createRainbowBorder();
        this.createCenterBullseye();
        this.createFastTrackRing();
        this.createPlayerSections();
        
        console.log('🎯 [BoardRendererSubstrate] Board complete, holes:', this.holeRegistry.size);
        return this;
    },
    
    /**
     * Create hexagonal board surface
     */
    createHexagonSurface: function() {
        const shape = new THREE.Shape();
        const radius = this.config.boardRadius;
        
        // Hexagon vertices
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI / 3) - Math.PI / 6;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (i === 0) shape.moveTo(x, z);
            else shape.lineTo(x, z);
        }
        shape.closePath();
        
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshStandardMaterial({
            color: 0x2a2a4a,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide
        });
        
        this.elements.boardMesh = new THREE.Mesh(geometry, material);
        this.elements.boardMesh.rotation.x = -Math.PI / 2;
        this.elements.boardMesh.position.y = 0;
        this.elements.boardMesh.receiveShadow = true;
        this.boardGroup.add(this.elements.boardMesh);
        
        return this;
    },
    
    // Player colors (rainbow)
    COLORS: [
        0x00ff88, // Cyan-green
        0xffcc00, // Yellow
        0xff6600, // Orange
        0xff0066, // Red-pink
        0x9933ff, // Purple
        0x0099ff  // Blue
    ],

    /**
     * Create a hole and register it
     * Dimensional: hole = point on z=xy surface
     */
    createHole: function(id, type, playerIndex, x, y, z, marker, properties) {
        const hole = {
            id: id,
            type: type,
            playerIndex: playerIndex,
            x: x, y: y, z: z,
            marker: marker,
            mesh: null,
            ...properties
        };
        this.holeRegistry.set(id, hole);
        return hole;
    },

    /**
     * Create rainbow gradient border around hexagon
     */
    createRainbowBorder: function() {
        const radius = this.config.boardRadius;
        const borderWidth = 8;

        for (let i = 0; i < 6; i++) {
            const angle1 = (i * Math.PI / 3) - Math.PI / 6;
            const angle2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;

            const innerR = radius - borderWidth;
            const outerR = radius;

            const shape = new THREE.Shape();
            shape.moveTo(Math.cos(angle1) * innerR, Math.sin(angle1) * innerR);
            shape.lineTo(Math.cos(angle1) * outerR, Math.sin(angle1) * outerR);
            shape.lineTo(Math.cos(angle2) * outerR, Math.sin(angle2) * outerR);
            shape.lineTo(Math.cos(angle2) * innerR, Math.sin(angle2) * innerR);
            shape.closePath();

            const geo = new THREE.ShapeGeometry(shape);
            const mat = new THREE.MeshBasicMaterial({
                color: this.COLORS[i],
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = this.config.lineHeight + 0.5;
            this.boardGroup.add(mesh);
            this.elements.borderSegments.push(mesh);
        }

        console.log('🌈 [BoardRendererSubstrate] Rainbow border created');
        return this;
    },

    /**
     * Create center bullseye hole
     */
    createCenterBullseye: function() {
        const radius = this.config.holeRadius * 1.5;
        const geo = new THREE.CylinderGeometry(radius, radius, 10, 32);
        const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, this.config.lineHeight - 5, 0);
        this.boardGroup.add(mesh);

        // Register bullseye hole
        const hole = this.createHole('center', 'bullseye', -1, 0, this.config.lineHeight, 0, 'bullseye', {
            isBullseye: true, isRoyalExit: true
        });
        hole.mesh = mesh;

        console.log('🎯 [BoardRendererSubstrate] Center bullseye created');
        return this;
    },

    /**
     * Create FastTrack ring (6 pentagon holes at inner hex corners)
     */
    createFastTrackRing: function() {
        const innerR = this.config.innerHexRadius;

        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI / 3) - Math.PI / 6;
            const x = Math.cos(angle) * innerR;
            const z = Math.sin(angle) * innerR;

            // Create pentagon marker
            const pentaShape = new THREE.Shape();
            const pentaR = 12;
            for (let p = 0; p < 5; p++) {
                const pa = (p * 2 * Math.PI / 5) - Math.PI / 2;
                const px = Math.cos(pa) * pentaR;
                const pz = Math.sin(pa) * pentaR;
                if (p === 0) pentaShape.moveTo(px, pz);
                else pentaShape.lineTo(px, pz);
            }
            pentaShape.closePath();

            const pentaGeo = new THREE.ShapeGeometry(pentaShape);
            const pentaMat = new THREE.MeshStandardMaterial({
                color: this.COLORS[i],
                emissive: this.COLORS[i],
                emissiveIntensity: 0.3
            });
            const pentaMesh = new THREE.Mesh(pentaGeo, pentaMat);
            pentaMesh.rotation.x = -Math.PI / 2;
            pentaMesh.position.set(x, this.config.lineHeight + 0.5, z);
            this.boardGroup.add(pentaMesh);

            // Create hole
            const holeGeo = new THREE.CylinderGeometry(this.config.trackHoleRadius, this.config.trackHoleRadius, 5, 16);
            const holeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const holeMesh = new THREE.Mesh(holeGeo, holeMat);
            holeMesh.position.set(x, this.config.lineHeight - 2.5, z);
            this.boardGroup.add(holeMesh);

            // Register FT hole
            const hole = this.createHole(`ft-${i}`, 'fasttrack', i, x, this.config.lineHeight, z, 'pentagon', {
                isFastTrack: true, homestretchHole: true
            });
            hole.mesh = holeMesh;
        }

        console.log('⚡ [BoardRendererSubstrate] FastTrack ring created (6 holes)');
        return this;
    },

    /**
     * Create all 6 player sections with parallel lines
     * Each section: 6 down + 5 across + 6 up = 17 holes
     */
    createPlayerSections: function() {
        // Delegate to 3d.html's drawSchemaLines for now
        // This will be fully extracted in the next iteration
        console.log('🎮 [BoardRendererSubstrate] Player sections - delegating to legacy code');
        return this;
    },

    /**
     * Update board theme colors
     */
    setTheme: function(themeColors) {
        if (this.elements.boardMesh && themeColors.board) {
            this.elements.boardMesh.material.color.setHex(themeColors.board);
        }
        console.log('🎨 [BoardRendererSubstrate] Theme applied');
        return this;
    }
};

// Export as global and for module systems
window.BoardRendererSubstrate = BoardRendererSubstrate;

// Register with SubstrateManifold if available
if (typeof SubstrateManifold !== 'undefined') {
    SubstrateManifold.register(BoardRendererSubstrate);
}

console.log('🎯 [BoardRendererSubstrate] Module loaded');

