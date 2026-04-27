/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIO SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Universal audio/sound extraction for all games.
 * Extracts audio properties (music, effects, spatial audio) from manifold.
 */

class AudioSubstrate extends SubstrateBase {
  name() {
    return 'audio';
  }

  getSchema() {
    return {
      music: 'object',
      soundEffects: 'array',
      spatialAudio: 'array',
      masterVolume: 'number'
    };
  }

  extract(coordinate) {
    // Reversal: field is the source, storage is the cache. The field view
    // (point, value, gradient) flows through every extraction; stored audio
    // params override field metadata only on key collision.
    const view = this.observeField(coordinate);
    const raw = (this.manifold && this.manifold.read ? this.manifold.read(coordinate) : null) || {};
    return {
      ...view,
      music: this._extractMusic(raw),
      soundEffects: this._extractSoundEffects(raw),
      spatialAudio: this._extractSpatialAudio(raw),
      masterVolume: raw.masterVolume !== undefined ? raw.masterVolume : 0.8,
      timestamp: raw.timestamp || Date.now()
    };
  }

  validate(data) {
    return (
      data.music && typeof data.music === 'object' &&
      Array.isArray(data.soundEffects) &&
      typeof data.masterVolume === 'number'
    );
  }

  /**
   * Queue a sound effect
   */
  queueSound(name, options = {}) {
    return {
      id: `sound-${Date.now()}`,
      name,
      volume: options.volume !== undefined ? options.volume : 1,
      pitch: options.pitch || 1,
      loop: options.loop || false,
      delay: options.delay || 0
    };
  }

  /**
   * Transition music smoothly
   */
  transitionMusic(fromTrack, toTrack, duration = 2) {
    return {
      fromTrack,
      toTrack,
      duration,
      fadeOut: duration / 2,
      fadeIn: duration / 2,
      startTime: Date.now()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════════

  _extractMusic(raw) {
    return {
      track: raw.music?.track || 'ambient',
      volume: raw.music?.volume || 0.6,
      loop: raw.music?.loop !== false,
      fade: raw.music?.fade || false,
      fadeTime: raw.music?.fadeTime || 1
    };
  }

  _extractSoundEffects(raw) {
    if (!Array.isArray(raw.soundEffects)) return [];

    return raw.soundEffects.map(fx => ({
      id: fx.id || `fx-${Date.now()}`,
      name: fx.name || 'default',
      volume: fx.volume || 1,
      pitch: fx.pitch || 1,
      loop: fx.loop || false,
      threeDimensional: fx.threeDimensional !== false
    }));
  }

  _extractSpatialAudio(raw) {
    if (!Array.isArray(raw.spatialAudio)) return [];

    return raw.spatialAudio.map(audio => ({
      id: audio.id || `spatial-${Date.now()}`,
      source: audio.source || 'ambient',
      position: audio.position || { x: 0, y: 0, z: 0 },
      maxDistance: audio.maxDistance || 100,
      refDistance: audio.refDistance || 1,
      rolloffFactor: audio.rolloffFactor || 1
    }));
  }

  _getDefaults() {
    return {
      music: { track: 'ambient', volume: 0.6, loop: true, fade: false, fadeTime: 1 },
      soundEffects: [],
      spatialAudio: [],
      masterVolume: 0.8,
      timestamp: Date.now()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioSubstrate;
}
if (typeof window !== 'undefined') {
  window.AudioSubstrate = AudioSubstrate;
}
