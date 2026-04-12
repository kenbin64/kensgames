/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 3D UI BUTTON SYSTEM FOR FASTTRACK
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Renders UI buttons as clickable 3D objects using THREE.js instead of HTML overlays.
 * Uses ButterflyFX dimensional architecture with proper depth layering.
 * 
 * DIMENSIONAL LAYERS:
 *   Layer 6 (Mind) → Navigation, controls, coherence
 *   Z-depth: --z-layer-6 = 60
 * 
 * @version 1.0.0
 * @author Kenneth Bingham — ButterflyFX
 */

class UIButton3D {
    constructor(config) {
        this.id = config.id;
        this.emoji = config.emoji;
        this.title = config.title;
        this.onClick = config.onClick;
        this.position = config.position; // { x, y } in screen space (-1 to 1)
        this.color = config.color || 0x8855ff;
        this.size = config.size || 50;
        this.visible = config.visible !== undefined ? config.visible : true;
        
        this.mesh = null;
        this.isHovered = false;
        this.baseScale = 1.0;
        this.targetScale = 1.0;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create circular button background
        const geometry = new THREE.CircleGeometry(this.size, 32);
        const material = new THREE.MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.userData.isUIButton = true;
        this.mesh.userData.buttonId = this.id;
        this.mesh.userData.buttonInstance = this;
        this.mesh.renderOrder = 10000; // Render on top
        
        // Create emoji text sprite
        this.createEmojiSprite();
        
        // Add glow effect
        this.createGlow();
        
        this.mesh.visible = this.visible;
    }
    
    createEmojiSprite() {
        // Create canvas for emoji
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Draw emoji
        ctx.font = `${size * 0.7}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, size / 2, size / 2);
        
        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(this.size * 1.2, this.size * 1.2, 1);
        sprite.position.z = 1;
        sprite.renderOrder = 10001;
        
        this.mesh.add(sprite);
        this.emojiSprite = sprite;
    }
    
    createGlow() {
        const glowGeometry = new THREE.CircleGeometry(this.size * 1.3, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.z = -1;
        glow.renderOrder = 9999;
        
        this.mesh.add(glow);
        this.glowMesh = glow;
    }
    
    setHovered(hovered) {
        this.isHovered = hovered;
        this.targetScale = hovered ? 1.15 : 1.0;
        
        // Animate glow
        if (this.glowMesh) {
            const targetOpacity = hovered ? 0.4 : 0;
            this.glowMesh.material.opacity = targetOpacity;
        }
    }
    
    update(deltaTime) {
        // Smooth scale animation
        const lerpFactor = 0.15;
        this.baseScale += (this.targetScale - this.baseScale) * lerpFactor;
        this.mesh.scale.set(this.baseScale, this.baseScale, 1);
    }
    
    setVisible(visible) {
        this.visible = visible;
        this.mesh.visible = visible;
    }
    
    updateScreenPosition(camera, width, height) {
        // Convert screen space position to 3D position
        // Position in front of camera, fixed to screen
        const vector = new THREE.Vector3(this.position.x, this.position.y, -0.5);
        vector.unproject(camera);

        const dir = vector.sub(camera.position).normalize();
        const distance = 200; // Distance from camera
        const pos = camera.position.clone().add(dir.multiplyScalar(distance));

        this.mesh.position.copy(pos);
        this.mesh.lookAt(camera.position);
    }
}

/**
 * Manages all 3D UI buttons
 */
class UIButtonManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.buttons = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredButton = null;

        // Create button group (Layer 6 - Mind)
        this.buttonGroup = new THREE.Group();
        this.buttonGroup.name = 'UIButtons';
        this.scene.add(this.buttonGroup);

        // Bind event handlers
        this.onMouseMove = this.handleMouseMove.bind(this);
        this.onClick = this.handleClick.bind(this);

        // Add event listeners
        window.addEventListener('mousemove', this.onMouseMove, false);
        window.addEventListener('click', this.onClick, false);
    }

    createButton(config) {
        const button = new UIButton3D(config);
        this.buttons.push(button);
        this.buttonGroup.add(button.mesh);
        return button;
    }

    handleMouseMove(event) {
        // Update mouse position
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Raycast to find hovered button
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.buttonGroup.children, true);

        // Clear previous hover
        if (this.hoveredButton) {
            this.hoveredButton.setHovered(false);
            this.hoveredButton = null;
            document.body.style.cursor = 'default';
        }

        // Check for new hover
        for (const intersect of intersects) {
            if (intersect.object.userData.isUIButton) {
                const button = intersect.object.userData.buttonInstance;
                if (button && button.visible) {
                    this.hoveredButton = button;
                    button.setHovered(true);
                    document.body.style.cursor = 'pointer';
                    // Show tooltip
                    document.title = button.title;
                    break;
                }
            }
        }
    }

    handleClick(event) {
        // Update mouse position
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Raycast to find clicked button
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.buttonGroup.children, true);

        for (const intersect of intersects) {
            if (intersect.object.userData.isUIButton) {
                const button = intersect.object.userData.buttonInstance;
                if (button && button.visible && button.onClick) {
                    button.onClick();
                    console.log('[3D UI] Button clicked:', button.id);
                    return;
                }
            }
        }
    }

    update(deltaTime) {
        // Update all buttons
        for (const button of this.buttons) {
            button.update(deltaTime);
            button.updateScreenPosition(this.camera, window.innerWidth, window.innerHeight);
        }
    }

    getButton(id) {
        return this.buttons.find(b => b.id === id);
    }

    showButton(id) {
        const button = this.getButton(id);
        if (button) button.setVisible(true);
    }

    hideButton(id) {
        const button = this.getButton(id);
        if (button) button.setVisible(false);
    }

    destroy() {
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('click', this.onClick);
        this.scene.remove(this.buttonGroup);
    }
}

