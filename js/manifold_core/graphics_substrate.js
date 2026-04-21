/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPHICS SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Universal graphics/rendering extraction for all games.
 * Extracts visual properties (models, colors, particles, cameras) from manifold.
 */

class GraphicsSubstrate extends SubstrateBase {
  name() {
    return 'graphics';
  }

  getSchema() {
    return {
      scene: 'object',
      camera: 'object',
      lighting: 'array',
      objects: 'array',
      particles: 'array',
      postProcessing: 'object'
    };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate);

    if (!raw) {
      return this._getDefaults();
    }

    return {
      scene: this._extractScene(raw),
      camera: this._extractCamera(raw),
      lighting: this._extractLighting(raw),
      objects: this._extractObjects(raw),
      particles: this._extractParticles(raw),
      postProcessing: this._extractPostProcessing(raw),
      timestamp: raw.timestamp || Date.now()
    };
  }

  validate(data) {
    return (
      data.scene && typeof data.scene === 'object' &&
      data.camera && typeof data.camera === 'object' &&
      Array.isArray(data.lighting) &&
      Array.isArray(data.objects)
    );
  }

  /**
   * Update object visuals based on physics state
   */
  syncObjectsToPhysics(objects, physicsObjects) {
    return objects.map(obj => {
      const physicsBody = physicsObjects.find(b => b.id === obj.id);
      if (!physicsBody) return obj;

      return {
        ...obj,
        position: physicsBody.position,
        velocity: physicsBody.velocity,
        scale: obj.scale || { x: 1, y: 1, z: 1 }
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════════

  _extractScene(raw) {
    return {
      background: raw.scene?.background || 0x000000,
      fog: raw.scene?.fog || null,
      ambientLight: raw.scene?.ambientLight || 0x666666
    };
  }

  _extractCamera(raw) {
    return {
      position: raw.camera?.position || { x: 0, y: 0, z: 30 },
      target: raw.camera?.target || { x: 0, y: 0, z: 0 },
      fov: raw.camera?.fov || 75,
      near: raw.camera?.near || 0.1,
      far: raw.camera?.far || 10000
    };
  }

  _extractLighting(raw) {
    if (Array.isArray(raw.lighting)) {
      return raw.lighting;
    }

    return [
      { type: 'ambient', intensity: 0.6, color: 0xffffff },
      { type: 'directional', intensity: 0.8, position: { x: 20, y: 20, z: 20 }, color: 0xffffff }
    ];
  }

  _extractObjects(raw) {
    if (!Array.isArray(raw.objects)) return [];

    return raw.objects.map(obj => ({
      id: obj.id || `obj-${Date.now()}`,
      model: obj.model || 'cube',
      material: obj.material || { color: 0xffffff, metalness: 0.5, roughness: 0.5 },
      position: obj.position || { x: 0, y: 0, z: 0 },
      rotation: obj.rotation || { x: 0, y: 0, z: 0 },
      scale: obj.scale || { x: 1, y: 1, z: 1 },
      castShadow: obj.castShadow !== false,
      receiveShadow: obj.receiveShadow !== false
    }));
  }

  _extractParticles(raw) {
    if (!Array.isArray(raw.particles)) return [];

    return raw.particles.map(p => ({
      type: p.type || 'sprite',
      position: p.position || { x: 0, y: 0, z: 0 },
      velocity: p.velocity || { x: 0, y: 0, z: 0 },
      color: p.color || 0xffffff,
      size: p.size || 1,
      lifetime: p.lifetime || 1,
      emissionRate: p.emissionRate || 10
    }));
  }

  _extractPostProcessing(raw) {
    return raw.postProcessing || {
      bloom: { enabled: false, strength: 1, bloomThreshold: 0 },
      dof: { enabled: false, focus: 10, blur: 1 },
      chromaticAbberation: { enabled: false, amount: 0.05 },
      vignette: { enabled: false, darkness: 0.5 }
    };
  }

  _getDefaults() {
    return {
      scene: { background: 0x000000, fog: null, ambientLight: 0x666666 },
      camera: { position: { x: 0, y: 0, z: 30 }, target: { x: 0, y: 0, z: 0 }, fov: 75, near: 0.1, far: 10000 },
      lighting: [{ type: 'ambient', intensity: 0.6, color: 0xffffff }],
      objects: [],
      particles: [],
      postProcessing: {},
      timestamp: Date.now()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GraphicsSubstrate;
}
if (typeof window !== 'undefined') {
  window.GraphicsSubstrate = GraphicsSubstrate;
}
