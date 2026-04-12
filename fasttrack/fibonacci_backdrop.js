/**
 * Lava Lamp Backdrop for Board View Mode
 * Creates soothing, organic blobs that float and morph slowly
 * Inspired by classic lava lamps - calm and mesmerizing
 */

const PHI = 1.618033988749895; // Golden Ratio

class FibonacciBackdrop {
    constructor(scene) {
        this.scene = scene;
        this.lavaGroup = null;
        this.isActive = false;
        this.blobs = [];
        this.time = 0;
    }

    create() {
        if (this.lavaGroup) {
            this.scene.remove(this.lavaGroup);
        }

        this.lavaGroup = new THREE.Group();
        this.lavaGroup.name = 'lava-lamp-backdrop';
        this.blobs = [];

        // Create 7 lava blobs (following the 7-layer dimensional model)
        const numBlobs = 7;

        for (let i = 0; i < numBlobs; i++) {
            const blob = this.createLavaBlob(i, numBlobs);
            this.lavaGroup.add(blob.mesh);
            this.blobs.push(blob);
        }

        // Position the lava lamp below the board
        this.lavaGroup.position.y = -300;

        this.scene.add(this.lavaGroup);
        this.lavaGroup.visible = false;
    }

    createLavaBlob(index, total) {
        // Create organic blob shape using icosahedron (more organic than sphere)
        const geometry = new THREE.IcosahedronGeometry(80 + (index * 20), 2);

        // Store original vertices for morphing
        const originalPositions = geometry.attributes.position.array.slice();

        // Soft, glowing colors - warm lava lamp palette
        const hues = [0, 30, 60, 180, 240, 280, 320]; // Reds, oranges, blues, purples
        const hue = hues[index % hues.length];
        const color = new THREE.Color().setHSL(hue / 360, 0.8, 0.5);

        const material = new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: 0.4,
            emissive: color,
            emissiveIntensity: 0.3,
            shininess: 100,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Position blobs in a circular pattern at different depths
        const angle = (index / total) * Math.PI * 2;
        const radius = 400 + (index * 50);
        mesh.position.x = Math.cos(angle) * radius;
        mesh.position.z = Math.sin(angle) * radius;
        mesh.position.y = -100 - (index * 40); // Stagger vertically

        return {
            mesh: mesh,
            geometry: geometry,
            originalPositions: originalPositions,
            // Slow, unique oscillation speeds for each blob
            speedX: 0.1 + (index * 0.05) / PHI,
            speedY: 0.15 + (index * 0.03) / PHI,
            speedZ: 0.12 + (index * 0.04) / PHI,
            phaseX: index * 1.2,
            phaseY: index * 0.8,
            phaseZ: index * 1.5,
            morphSpeed: 0.3 + (index * 0.1) / PHI,
            morphPhase: index * 2.1
        };
    }

    update(deltaTime) {
        if (!this.isActive || !this.lavaGroup || !this.lavaGroup.visible) return;

        this.time += deltaTime;

        // Update each blob with slow, organic movement
        this.blobs.forEach((blob, index) => {
            const mesh = blob.mesh;

            // Slow floating motion - like blobs in a lava lamp
            const floatX = Math.sin(this.time * blob.speedX + blob.phaseX) * 30;
            const floatY = Math.sin(this.time * blob.speedY + blob.phaseY) * 50;
            const floatZ = Math.cos(this.time * blob.speedZ + blob.phaseZ) * 30;

            // Apply gentle movement
            mesh.position.x += (floatX - mesh.position.x) * 0.01;
            mesh.position.y += floatY * 0.02;
            mesh.position.z += (floatZ - mesh.position.z) * 0.01;

            // Keep blobs in vertical range (rise and fall like lava lamp)
            const baseY = -100 - (index * 40);
            if (mesh.position.y > baseY + 200) {
                mesh.position.y = baseY - 200; // Teleport to bottom
            }

            // Gentle rotation
            mesh.rotation.x += 0.001 * blob.speedX;
            mesh.rotation.y += 0.002 * blob.speedY;

            // Organic morphing - deform the blob shape
            const positions = blob.geometry.attributes.position.array;
            const originalPositions = blob.originalPositions;

            for (let i = 0; i < positions.length; i += 3) {
                const morphAmount = Math.sin(this.time * blob.morphSpeed + blob.morphPhase + i * 0.1) * 0.15;
                positions[i] = originalPositions[i] * (1 + morphAmount);
                positions[i + 1] = originalPositions[i + 1] * (1 + morphAmount * 0.8);
                positions[i + 2] = originalPositions[i + 2] * (1 + morphAmount);
            }

            blob.geometry.attributes.position.needsUpdate = true;
            blob.geometry.computeVertexNormals(); // Keep lighting smooth
        });
    }

    show() {
        if (!this.lavaGroup) {
            this.create();
        }
        this.lavaGroup.visible = true;
        this.isActive = true;
        console.log('[LavaLampBackdrop] Activated - 7 organic blobs floating');
    }

    hide() {
        if (this.lavaGroup) {
            this.lavaGroup.visible = false;
        }
        this.isActive = false;
        console.log('[LavaLampBackdrop] Deactivated');
    }

    dispose() {
        if (this.lavaGroup) {
            this.scene.remove(this.lavaGroup);
            this.lavaGroup.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            this.lavaGroup = null;
            this.blobs = [];
        }
        this.isActive = false;
    }
}

// Export for use in 3d.html
window.FibonacciBackdrop = FibonacciBackdrop;

