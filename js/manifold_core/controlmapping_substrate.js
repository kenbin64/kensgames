/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTROL MAPPING SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 */

class ControlMappingSubstrate extends SubstrateBase {
  name() { return 'controlmapping'; }

  getSchema() {
    return { keyboard: 'object', mouse: 'object', gamepad: 'object', sensitivity: 'object' };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate) || {};
    return {
      keyboard: raw.keyboard || this._defaultKeyboard(),
      mouse: raw.mouse || this._defaultMouse(),
      gamepad: raw.gamepad || this._defaultGamepad(),
      sensitivity: raw.sensitivity || { mouse: 1, gamepad: 1, keyboard: 1 }
    };
  }

  validate(data) {
    return data.keyboard && data.mouse && data.sensitivity;
  }

  _defaultKeyboard() {
    return { forward: 'W', back: 'S', left: 'A', right: 'D', jump: 'SPACE', interact: 'E' };
  }

  _defaultMouse() {
    return { look: true, sensitivity: 0.5, yInvert: false, speedBoost: 'SHIFT' };
  }

  _defaultGamepad() {
    return { deadzone: 0.15, triggerThreshold: 0.5, vibration: true };
  }

  mapInput(inputType, key, action) {
    return { inputType, key, action, timestamp: Date.now() };
  }

  applySensitivity(input, sensitivity) {
    return { ...input, value: input.value * sensitivity };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ControlMappingSubstrate;
}
if (typeof window !== 'undefined') {
  window.ControlMappingSubstrate = ControlMappingSubstrate;
}
