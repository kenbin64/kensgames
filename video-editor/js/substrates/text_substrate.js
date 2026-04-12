/**
 * TextSubstrate - Text overlay rendering system
 * Manages text elements positioned on video timeline
 * Supports positioning, sizing, styling, and keyframe animation
 */

const TextSubstrate = (() => {
  // ═══ PRIVATE STATE
  const _textElements = new Map();  // id → text object
  const _listeners = new Map();

  // ═══ PRIVATE METHODS
  function emit(event, data) {
    (_listeners.get(event) || []).forEach(cb => cb(data));
  }

  function generateId() {
    return `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ═══ PUBLIC API
  return {
    /**
     * Create a text element on the timeline
     */
    createText(config) {
      const textElement = {
        id: config.id || generateId(),
        content: config.content || 'Text',
        startTime: config.startTime || 0,
        duration: config.duration || 3,

        // Position & sizing
        x: config.x || 0.5,  // 0-1 (normalized)
        y: config.y || 0.5,
        width: config.width || 0.4,
        height: config.height || 0.1,

        // Styling
        font: config.font || '48px Orbitron',
        color: config.color || '#ffffff',
        backgroundColor: config.backgroundColor || 'transparent',
        textAlign: config.textAlign || 'center',
        opacity: config.opacity !== undefined ? config.opacity : 1,

        // Animation
        scale: config.scale !== undefined ? config.scale : 1,
        rotation: config.rotation !== undefined ? config.rotation : 0,

        // Metadata
        createdAt: Date.now(),
        modified: false
      };

      _textElements.set(textElement.id, textElement);
      emit('text:created', { textElement });
      return textElement;
    },

    /**
     * Update text element properties
     */
    updateText(id, updates) {
      const text = _textElements.get(id);
      if (!text) return null;

      Object.assign(text, updates);
      text.modified = true;
      emit('text:updated', { id, updates });
      return text;
    },

    /**
     * Remove text element
     */
    removeText(id) {
      if (_textElements.delete(id)) {
        emit('text:removed', { id });
        return true;
      }
      return false;
    },

    /**
     * Get text element by ID
     */
    getText(id) {
      return _textElements.get(id);
    },

    /**
     * Get all text elements active at given time
     */
    getTextAtTime(time) {
      const active = [];
      for (const [, text] of _textElements) {
        if (time >= text.startTime && time < text.startTime + text.duration) {
          active.push(text);
        }
      }
      return active;
    },

    /**
     * Get all text elements
     */
    getAllText() {
      return Array.from(_textElements.values());
    },

    /**
     * Render text element on canvas
     * Uses KeyframeSubstrate for animation if available
     */
    renderText(ctx, textElement, currentTime, canvasWidth, canvasHeight) {
      if (!ctx) return;

      // Calculate local time within text duration
      const localTime = currentTime - textElement.startTime;
      if (localTime < 0 || localTime >= textElement.duration) return;

      // Get animated properties from KeyframeSubstrate if available
      let opacity = textElement.opacity;
      let scale = textElement.scale;
      let rotation = textElement.rotation;

      if (typeof KeyframeSubstrate !== 'undefined') {
        const opacityId = `${textElement.id}-opacity`;
        const scaleId = `${textElement.id}-scale`;
        const rotationId = `${textElement.id}-rotation`;

        const animOpacity = KeyframeSubstrate.interpolate(opacityId, localTime);
        const animScale = KeyframeSubstrate.interpolate(scaleId, localTime);
        const animRotation = KeyframeSubstrate.interpolate(rotationId, localTime);

        if (animOpacity !== null) opacity = animOpacity;
        if (animScale !== null) scale = animScale;
        if (animRotation !== null) rotation = animRotation;
      }

      // Calculate pixel position
      const pixelX = textElement.x * canvasWidth;
      const pixelY = textElement.y * canvasHeight;
      const pixelWidth = textElement.width * canvasWidth;
      const pixelHeight = textElement.height * canvasHeight;

      // Save context state
      ctx.save();

      // Apply transformations
      ctx.globalAlpha = opacity;
      ctx.translate(pixelX + pixelWidth / 2, pixelY + pixelHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scale, scale);

      // Draw background if set
      if (textElement.backgroundColor !== 'transparent') {
        ctx.fillStyle = textElement.backgroundColor;
        ctx.fillRect(-pixelWidth / 2, -pixelHeight / 2, pixelWidth, pixelHeight);
      }

      // Draw text
      ctx.fillStyle = textElement.color;
      ctx.font = textElement.font;
      ctx.textAlign = textElement.textAlign;
      ctx.textBaseline = 'middle';
      ctx.fillText(textElement.content, 0, 0, pixelWidth);

      // Draw border (for editing mode)
      if (textElement.selected) {
        ctx.strokeStyle = '#00b4ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-pixelWidth / 2, -pixelHeight / 2, pixelWidth, pixelHeight);
      }

      // Restore context state
      ctx.restore();
    },

    /**
     * Select/highlight a text element for editing
     */
    selectText(id) {
      for (const [, text] of _textElements) {
        text.selected = false;
      }
      const text = _textElements.get(id);
      if (text) {
        text.selected = true;
        emit('text:selected', { id });
      }
    },

    /**
     * Check if point (x, y) is inside a text element
     * Useful for click detection
     */
    hitTest(x, y, canvasWidth, canvasHeight) {
      for (const [, text] of _textElements) {
        const pixelX = text.x * canvasWidth;
        const pixelY = text.y * canvasHeight;
        const pixelWidth = text.width * canvasWidth;
        const pixelHeight = text.height * canvasHeight;

        if (x >= pixelX && x <= pixelX + pixelWidth &&
          y >= pixelY && y <= pixelY + pixelHeight) {
          return text;
        }
      }
      return null;
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
if (typeof window !== 'undefined') window.TextSubstrate = TextSubstrate;
if (typeof module !== 'undefined') module.exports = TextSubstrate;
