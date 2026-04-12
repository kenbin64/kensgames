/**
 * KeyframeSubstrate - Animation keyframe system
 * Manages animation curves for clip properties (opacity, scale, rotation, etc)
 * Supports easing functions for smooth interpolation between keyframes
 */

const KeyframeSubstrate = (() => {
  // ═══ PRIVATE STATE
  const _curves = new Map();  // propertyId → [keyframes with time, value, easing]
  const _listeners = new Map();

  // ═══ EASING FUNCTIONS (standard animation curves)
  const easing = {
    linear: t => t,

    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

    easeInCubic: t => t * t * t,
    easeOutCubic: t => 1 + (t - 1) * (t - 1) * (t - 1),
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 + (t - 1) * (2 * (t - 2)) * (2 * (t - 2)),

    easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
    easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeInOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2,

    easeInCirc: t => 1 - Math.sqrt(1 - t * t),
    easeOutCirc: t => Math.sqrt(1 - (t - 1) * (t - 1)),

    easeInBounce: t => 1 - easeOutBounce(1 - t),
    easeOutBounce: t => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  };

  // ═══ PRIVATE METHODS
  function emit(event, data) {
    (_listeners.get(event) || []).forEach(cb => cb(data));
  }

  /**
   * Get easing function by name or return linear
   */
  function getEasing(easingName) {
    return easing[easingName] || easing.linear;
  }

  // ═══ PUBLIC API
  return {
    /**
     * Add a keyframe to a property animation curve
     * @param {string} propertyId - Unique identifier (e.g., "clip-001-opacity")
     * @param {number} time - Time in seconds
     * @param {number} value - Property value (0-1 for opacity, any for scale/rotation)
     * @param {string} easeType - Easing function name (default: "linear")
     */
    addKeyframe(propertyId, time, value, easeType = 'linear') {
      if (!_curves.has(propertyId)) {
        _curves.set(propertyId, []);
      }

      const keyframes = _curves.get(propertyId);
      keyframes.push({ time, value, easeType });
      keyframes.sort((a, b) => a.time - b.time);

      emit('keyframe:added', { propertyId, time, value, easeType });
      return keyframes;
    },

    /**
     * Remove a keyframe from a property
     * @param {string} propertyId - Unique identifier
     * @param {number} index - Index of keyframe to remove
     */
    removeKeyframe(propertyId, index) {
      const keyframes = _curves.get(propertyId);
      if (!keyframes || index < 0 || index >= keyframes.length) return false;

      keyframes.splice(index, 1);
      emit('keyframe:removed', { propertyId, index });
      return true;
    },

    /**
     * Interpolate property value at given time
     * Uses keyframe easing functions for smooth motion
     * @param {string} propertyId - Unique identifier
     * @param {number} time - Time in seconds
     * @returns {number} Interpolated value, or null if no keyframes
     */
    interpolate(propertyId, time) {
      const keyframes = _curves.get(propertyId);
      if (!keyframes || keyframes.length === 0) return null;
      if (keyframes.length === 1) return keyframes[0].value;

      // Handle time before first keyframe
      if (time <= keyframes[0].time) return keyframes[0].value;

      // Handle time after last keyframe
      if (time >= keyframes[keyframes.length - 1].time) {
        return keyframes[keyframes.length - 1].value;
      }

      // Find surrounding keyframes
      let before = keyframes[0];
      let after = keyframes[keyframes.length - 1];

      for (let i = 0; i < keyframes.length - 1; i++) {
        if (keyframes[i].time <= time && time <= keyframes[i + 1].time) {
          before = keyframes[i];
          after = keyframes[i + 1];
          break;
        }
      }

      // Calculate normalized time between keyframes
      const duration = after.time - before.time;
      if (duration === 0) return before.value;

      const t = (time - before.time) / duration;
      const easeFunc = getEasing(before.easeType);
      const eased = easeFunc(t);

      // Linear interpolation with easing
      const value = before.value + eased * (after.value - before.value);
      return value;
    },

    /**
     * Get all keyframes for a property
     */
    getCurve(propertyId) {
      return _curves.get(propertyId) || [];
    },

    /**
     * Get all property curves
     */
    getAllCurves() {
      return Array.from(_curves.entries());
    },

    /**
     * Clear all keyframes for a property
     */
    clearCurve(propertyId) {
      _curves.delete(propertyId);
      emit('curve:cleared', { propertyId });
    },

    /**
     * Get list of available easing functions
     */
    getEasingFunctions() {
      return Object.keys(easing);
    },

    /**
     * Get easing function preview (for UI visualization)
     * Returns array of points for curve display
     */
    getEasingCurvePoints(easingName, steps = 20) {
      const easingFunc = getEasing(easingName);
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push({ t, value: easingFunc(t) });
      }
      return points;
    },

    /**
     * Get animation duration (time of last keyframe across all curves)
     */
    getAnimationDuration() {
      let maxTime = 0;
      for (const [, keyframes] of _curves) {
        if (keyframes.length > 0) {
          maxTime = Math.max(maxTime, keyframes[keyframes.length - 1].time);
        }
      }
      return maxTime;
    },

    /**
     * Event subscription
     */
    on(event, callback) {
      if (!_listeners.has(event)) _listeners.set(event, []);
      _listeners.get(event).push(callback);
    }
  };
})();

// Export for both browser and Node environments
if (typeof window !== 'undefined') window.KeyframeSubstrate = KeyframeSubstrate;
if (typeof module !== 'undefined') module.exports = KeyframeSubstrate;
