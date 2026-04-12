/**
 * TransitionSubstrate - Transition effects between clips
 * Manages fade, wipe, dissolve, and other transition effects
 */

const TransitionSubstrate = (() => {
  // ═══ PRIVATE STATE
  const _transitions = new Map();  // id → transition object
  const _listeners = new Map();

  // ═══ TRANSITION IMPLEMENTATIONS
  const transitionTypes = {
    /**
     * Fade transition - alpha blend from one clip to another
     */
    fade: {
      render(ctx, fromClip, toClip, progress, w, h) {
        // From clip at full opacity
        ctx.globalAlpha = 1 - progress;
        // (Draw fromClip)

        // To clip fading in
        ctx.globalAlpha = progress;
        // (Draw toClip)
      }
    },

    /**
     * Wipe transition - reveals new clip from one direction
     */
    wipeRight: {
      render(ctx, fromClip, toClip, progress, w, h) {
        const wipeX = progress * w;

        // Draw from clip
        ctx.globalAlpha = 1;
        // (Draw fromClip to wipeX)

        // Draw to clip
        ctx.globalAlpha = 1;
        // (Draw toClip from wipeX)
      }
    },

    /**
     * Dissolve transition - adds grain noise during transition
     */
    dissolve: {
      render(ctx, fromClip, toClip, progress, w, h) {
        // Mix with noise pattern
        ctx.globalAlpha = 1 - progress;
        // (Draw fromClip with noise)

        ctx.globalAlpha = progress;
        // (Draw toClip with noise)
      }
    },

    /**
     * Slide transition - clips slide past each other
     */
    slideRight: {
      render(ctx, fromClip, toClip, progress, w, h) {
        const offset = progress * w;

        // From clip slides left
        ctx.globalAlpha = 1;
        ctx.translate(-offset, 0);
        // (Draw fromClip)
        ctx.translate(offset, 0);

        // To clip slides in from right
        ctx.globalAlpha = 1;
        ctx.translate(offset, 0);
        // (Draw toClip)
        ctx.translate(-offset, 0);
      }
    },

    /**
     * Cross fade - standard crossfade
     */
    crossfade: {
      render(ctx, fromClip, toClip, progress, w, h) {
        ctx.globalAlpha = 1 - progress;
        // (Draw fromClip)
        ctx.globalAlpha = progress;
        // (Draw toClip)
      }
    }
  };

  // ═══ PRIVATE METHODS
  function emit(event, data) {
    (_listeners.get(event) || []).forEach(cb => cb(data));
  }

  function generateId() {
    return `transition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ═══ PUBLIC API
  return {
    /**
     * Create a transition between two clips
     */
    createTransition(config) {
      const transition = {
        id: config.id || generateId(),
        type: config.type || 'fade',  // fade, wipeRight, dissolve, slideRight, crossfade
        fromClipId: config.fromClipId,
        toClipId: config.toClipId,
        duration: config.duration || 0.5,  // seconds
        startTime: config.startTime || 0,

        // Transition parameters (varies by type)
        params: config.params || {}
      };

      // Validate transition type
      if (!transitionTypes[transition.type]) {
        console.warn(`Unknown transition type: ${transition.type}`);
        transition.type = 'fade';
      }

      _transitions.set(transition.id, transition);
      emit('transition:created', { transition });
      return transition;
    },

    /**
     * Remove transition
     */
    removeTransition(id) {
      if (_transitions.delete(id)) {
        emit('transition:removed', { id });
        return true;
      }
      return false;
    },

    /**
     * Get transition by ID
     */
    getTransition(id) {
      return _transitions.get(id);
    },

    /**
     * Get transition at given time (if any)
     */
    getTransitionAtTime(time) {
      for (const [, transition] of _transitions) {
        if (time >= transition.startTime && time < transition.startTime + transition.duration) {
          return transition;
        }
      }
      return null;
    },

    /**
     * Get all transitions
     */
    getAllTransitions() {
      return Array.from(_transitions.values());
    },

    /**
     * Calculate transition progress (0-1) at given time
     */
    getTransitionProgress(transition, currentTime) {
      if (currentTime < transition.startTime) return 0;
      if (currentTime >= transition.startTime + transition.duration) return 1;

      const elapsed = currentTime - transition.startTime;
      return elapsed / transition.duration;
    },

    /**
     * Render transition effect
     */
    renderTransition(ctx, transition, progress, fromClip, toClip, canvasWidth, canvasHeight) {
      const renderer = transitionTypes[transition.type];
      if (!renderer) return;

      renderer.render(ctx, fromClip, toClip, progress, canvasWidth, canvasHeight);
    },

    /**
     * Get available transition types
     */
    getTransitionTypes() {
      return Object.keys(transitionTypes);
    },

    /**
     * Get transition duration
     */
    getTransitionDuration(id) {
      const transition = _transitions.get(id);
      return transition ? transition.duration : 0;
    },

    /**
     * Update transition properties
     */
    updateTransition(id, updates) {
      const transition = _transitions.get(id);
      if (!transition) return null;

      Object.assign(transition, updates);
      emit('transition:updated', { id, updates });
      return transition;
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
if (typeof window !== 'undefined') window.TransitionSubstrate = TransitionSubstrate;
if (typeof module !== 'undefined') module.exports = TransitionSubstrate;
