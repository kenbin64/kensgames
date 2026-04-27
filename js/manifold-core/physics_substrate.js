/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHYSICS SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Universal physics extraction for all games.
 * Reads physics parameters from any manifold coordinate and standardizes them.
 *
 * Example output:
 * {
 *   bodies: [
 *     { id: 'paddle1', mass: 1200, velocity: {...}, forces: {...} },
 *     { id: 'ball1', mass: 50, velocity: {...}, forces: {...} }
 *   ],
 *   gravity: 0,
 *   airResistance: 0.99,
 *   collisionGroups: {...}
 * }
 */

class PhysicsSubstrate extends SubstrateBase {
  name() {
    return 'physics';
  }

  getSchema() {
    return {
      bodies: 'array',
      gravity: 'number',
      airResistance: 'number',
      collisionGroups: 'object',
      constraints: 'array'
    };
  }

  /**
   * Extract physics data from manifold coordinate
   * Different games provide different physics data; this normalizes it.
   */
  extract(coordinate) {
    // Reversal: physics defaults derive from the field, stored bodies layer
    // on top. Gravity defaults to 0 even when the field is calm; non-zero
    // stored gravity wins. Same shape as before — validators stay green.
    const view = this.observeField(coordinate);
    const raw = (this.manifold && this.manifold.read ? this.manifold.read(coordinate) : null) || {};
    return {
      ...view,
      bodies: this._extractBodies(raw),
      gravity: raw.gravity !== undefined ? raw.gravity : 0,
      airResistance: raw.airResistance !== undefined ? raw.airResistance : 0.99,
      collisionGroups: this._extractCollisionGroups(raw),
      constraints: this._extractConstraints(raw),
      timestamp: raw.timestamp || Date.now()
    };
  }

  /**
   * Validate physics data structure
   */
  validate(data) {
    if (!Array.isArray(data.bodies)) return false;
    if (typeof data.gravity !== 'number') return false;
    if (typeof data.airResistance !== 'number') return false;
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICS CALCULATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update body velocities based on forces and time delta
   */
  updateVelocities(bodies, forces, timestep = 0.016) {
    return bodies.map(body => {
      if (body.isStatic) return body;

      const mass = body.mass || 1;
      const acceleration = {
        x: (forces[body.id]?.x || 0) / mass,
        y: (forces[body.id]?.y || 0) / mass,
        z: (forces[body.id]?.z || 0) / mass
      };

      return {
        ...body,
        velocity: {
          x: (body.velocity?.x || 0) + acceleration.x * timestep,
          y: (body.velocity?.y || 0) + acceleration.y * timestep,
          z: (body.velocity?.z || 0) + acceleration.z * timestep
        }
      };
    });
  }

  /**
   * Update body positions based on velocities
   */
  updatePositions(bodies, timestep = 0.016) {
    return bodies.map(body => {
      if (body.isStatic) return body;

      const airResistance = this.config.airResistance || 0.99;

      return {
        ...body,
        position: {
          x: (body.position?.x || 0) + (body.velocity?.x || 0) * timestep,
          y: (body.position?.y || 0) + (body.velocity?.y || 0) * timestep,
          z: (body.position?.z || 0) + (body.velocity?.z || 0) * timestep
        },
        velocity: {
          x: (body.velocity?.x || 0) * airResistance,
          y: (body.velocity?.y || 0) * airResistance,
          z: (body.velocity?.z || 0) * (this.config.gravity !== 0 ? airResistance : airResistance)
        }
      };
    });
  }

  /**
   * Check collision between two bodies (AABB - axis-aligned bounding box)
   */
  checkCollision(body1, body2) {
    const b1 = body1.bounds || this._boundsFromRadius(body1);
    const b2 = body2.bounds || this._boundsFromRadius(body2);

    return !(b1.max.x < b2.min.x || b1.min.x > b2.max.x ||
      b1.max.y < b2.min.y || b1.min.y > b2.max.y ||
      b1.max.z < b2.min.z || b1.min.z > b2.max.z);
  }

  /**
   * Resolve collision between two bodies (simple elastic collision)
   */
  resolveCollision(body1, body2, restitution = 0.8) {
    if (body1.isStatic && body2.isStatic) return { body1, body2 };

    // Calculate collision normal
    const normal = {
      x: (body2.position?.x || 0) - (body1.position?.x || 0),
      y: (body2.position?.y || 0) - (body1.position?.y || 0),
      z: (body2.position?.z || 0) - (body1.position?.z || 0)
    };

    const distance = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
    if (distance === 0) return { body1, body2 };

    // Normalize
    normal.x /= distance;
    normal.y /= distance;
    normal.z /= distance;

    // Calculate relative velocity
    const relVel = {
      x: (body2.velocity?.x || 0) - (body1.velocity?.x || 0),
      y: (body2.velocity?.y || 0) - (body1.velocity?.y || 0),
      z: (body2.velocity?.z || 0) - (body1.velocity?.z || 0)
    };

    const velAlongNormal = relVel.x * normal.x + relVel.y * normal.y + relVel.z * normal.z;

    if (velAlongNormal > 0) return { body1, body2 }; // Objects moving apart

    // Calculate impulse
    const mass1 = body1.mass || 1;
    const mass2 = body2.mass || 1;
    const totalMass = (body1.isStatic ? Infinity : mass1) + (body2.isStatic ? Infinity : mass2);
    const impulse = -(1 + restitution) * velAlongNormal / totalMass;

    // Apply impulse
    const updatedBody1 = body1.isStatic ? body1 : {
      ...body1,
      velocity: {
        x: body1.velocity?.x + impulse * normal.x / mass1,
        y: body1.velocity?.y + impulse * normal.y / mass1,
        z: body1.velocity?.z + impulse * normal.z / mass1
      }
    };

    const updatedBody2 = body2.isStatic ? body2 : {
      ...body2,
      velocity: {
        x: body2.velocity?.x - impulse * normal.x / mass2,
        y: body2.velocity?.y - impulse * normal.y / mass2,
        z: body2.velocity?.z - impulse * normal.z / mass2
      }
    };

    return { body1: updatedBody1, body2: updatedBody2 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _extractBodies(raw) {
    if (Array.isArray(raw.bodies)) {
      return raw.bodies.map(b => ({
        id: b.id || `body-${Date.now()}`,
        mass: b.mass || 1,
        position: b.position || { x: 0, y: 0, z: 0 },
        velocity: b.velocity || { x: 0, y: 0, z: 0 },
        forces: b.forces || { x: 0, y: 0, z: 0 },
        isStatic: b.isStatic || false,
        bounds: b.bounds,
        radius: b.radius,
        restitution: b.restitution !== undefined ? b.restitution : 0.8
      }));
    }
    return [];
  }

  _extractCollisionGroups(raw) {
    return raw.collisionGroups || {
      player: { mask: 0b11 },
      enemy: { mask: 0b11 },
      environment: { mask: 0b10 },
      projectile: { mask: 0b11 }
    };
  }

  _extractConstraints(raw) {
    return Array.isArray(raw.constraints) ? raw.constraints : [];
  }

  _boundsFromRadius(body) {
    const r = body.radius || 1;
    const pos = body.position || { x: 0, y: 0, z: 0 };
    return {
      min: { x: pos.x - r, y: pos.y - r, z: pos.z - r },
      max: { x: pos.x + r, y: pos.y + r, z: pos.z + r }
    };
  }

  _getDefaults() {
    return {
      bodies: [],
      gravity: 0,
      airResistance: 0.99,
      collisionGroups: {},
      constraints: [],
      timestamp: Date.now()
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsSubstrate;
}
if (typeof window !== 'undefined') {
  window.PhysicsSubstrate = PhysicsSubstrate;
}
