/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MANIFOLD AUDIO SUBSTRATE — Starfighter
 * ═══════════════════════════════════════════════════════════════════════════
 * Dimensional Programming Architecture:
 * - Audio files are NOT loaded as binary assets
 * - Instead, waveforms are encoded as manifold equations
 * - This substrate OBSERVES manifold data and EXTRACTS audio on demand
 * - The manifold IS the data; substrates observe and interpret
 *
 * Philosophy:
 * - Every sound IS a dimension
 * - Every sample IS a point in that dimension
 * - Waveforms are manifold functions, not discrete samples
 * - No binary audio loading — pure mathematical synthesis
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SFManifoldAudio = (function () {
  'use strict';

  let _audioContext = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // § 1. WAVEFORM MANIFOLD DATABASE
  // ═══════════════════════════════════════════════════════════════════════════
  // Each sound is defined as a series of harmonics and envelopes
  // Format: { harmonics: [...], envelope: {...}, duration: number }

  const _audioManifolds = {
    // Weapon sounds
    'laser': {
      harmonics: [
        { freq: 880, amp: 0.3, phase: 0 },
        { freq: 1320, amp: 0.2, phase: Math.PI / 4 },
        { freq: 1760, amp: 0.15, phase: Math.PI / 2 },
      ],
      envelope: { attack: 0.002, decay: 0.08, sustain: 0.0, release: 0.01 },
      duration: 0.12,
      type: 'square',
      filter: { type: 'lowpass', freq: 2400, q: 2 }
    },

    'torpedo': {
      harmonics: [
        { freq: 120, amp: 0.4, phase: 0 },
        { freq: 180, amp: 0.25, phase: Math.PI / 3 },
        { freq: 240, amp: 0.2, phase: Math.PI / 2 },
      ],
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.25 },
      duration: 0.6,
      type: 'sawtooth',
      filter: { type: 'bandpass', freq: 300, q: 4 },
      noise: { amp: 0.15, duration: 0.4 }
    },

    'missile': {
      harmonics: [
        { freq: 220, amp: 0.35, phase: 0 },
        { freq: 330, amp: 0.25, phase: Math.PI / 4 },
        { freq: 440, amp: 0.2, phase: Math.PI / 3 },
      ],
      envelope: { attack: 0.008, decay: 0.12, sustain: 0.15, release: 0.18 },
      duration: 0.45,
      type: 'triangle',
      filter: { type: 'lowpass', freq: 1200, q: 3 }
    },

    // Explosion sounds (manifold of noise + harmonics)
    'explosion': {
      harmonics: [
        { freq: 60, amp: 0.5, phase: 0 },
        { freq: 90, amp: 0.3, phase: Math.PI / 6 },
        { freq: 120, amp: 0.2, phase: Math.PI / 4 },
      ],
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 0.6 },
      duration: 1.2,
      type: 'sawtooth',
      filter: { type: 'lowpass', freq: 600, q: 1 },
      noise: { amp: 0.6, duration: 0.8, filter: { type: 'bandpass', freq: 800, q: 2 } }
    },

    'impact': {
      harmonics: [
        { freq: 180, amp: 0.4, phase: 0 },
        { freq: 270, amp: 0.25, phase: Math.PI / 5 },
      ],
      envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.12 },
      duration: 0.25,
      type: 'square',
      noise: { amp: 0.5, duration: 0.15 }
    },

    // Engine/thrust sounds (continuous harmonics)
    'engine': {
      harmonics: [
        { freq: 55, amp: 0.3, phase: 0 },
        { freq: 110, amp: 0.25, phase: Math.PI / 3 },
        { freq: 165, amp: 0.15, phase: Math.PI / 2 },
        { freq: 220, amp: 0.1, phase: Math.PI },
      ],
      envelope: { attack: 0.05, decay: 0.0, sustain: 1.0, release: 0.2 },
      duration: -1, // Continuous (looping)
      type: 'sawtooth',
      filter: { type: 'lowpass', freq: 400, q: 2 },
      lfo: { freq: 4, depth: 0.15 } // Low-frequency oscillation for variation
    },

    'afterburner': {
      harmonics: [
        { freq: 80, amp: 0.35, phase: 0 },
        { freq: 160, amp: 0.28, phase: Math.PI / 4 },
        { freq: 240, amp: 0.2, phase: Math.PI / 3 },
        { freq: 320, amp: 0.15, phase: Math.PI / 2 },
      ],
      envelope: { attack: 0.03, decay: 0.0, sustain: 1.0, release: 0.15 },
      duration: -1,
      type: 'sawtooth',
      filter: { type: 'lowpass', freq: 600, q: 1.5 },
      noise: { amp: 0.25, duration: -1 },
      lfo: { freq: 8, depth: 0.25 }
    },

    // UI/Alert sounds
    'lock_warning': {
      harmonics: [
        { freq: 880, amp: 0.35, phase: 0 },
        { freq: 1100, amp: 0.25, phase: Math.PI / 4 },
      ],
      envelope: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.03 },
      duration: 0.1,
      type: 'square',
      repeat: { count: 3, interval: 0.15 }
    },

    'flare_deploy': {
      harmonics: [
        { freq: 3200, amp: 0.3, phase: 0 },
        { freq: 2400, amp: 0.25, phase: Math.PI / 6 },
        { freq: 1600, amp: 0.2, phase: Math.PI / 4 },
      ],
      envelope: { attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.08 },
      duration: 0.25,
      type: 'sine',
      filter: { type: 'highpass', freq: 1200, q: 2 },
      noise: { amp: 0.2, duration: 0.15, filter: { type: 'highpass', freq: 2000, q: 1 } }
    },

    'error': {
      harmonics: [
        { freq: 220, amp: 0.4, phase: 0 },
      ],
      envelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1 },
      duration: 0.3,
      type: 'sawtooth',
      filter: { type: 'lowpass', freq: 400, q: 1 }
    },

    'menu_select': {
      harmonics: [
        { freq: 660, amp: 0.25, phase: 0 },
        { freq: 990, amp: 0.15, phase: Math.PI / 4 },
      ],
      envelope: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.04 },
      duration: 0.12,
      type: 'sine'
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // § 2. MANIFOLD SYNTHESIS (Math → Audio)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate audio buffer from manifold definition
   * @param {object} manifold - Audio manifold data
   * @returns {AudioBuffer}
   */
  function _synthesizeAudio(manifold) {
    if (!_audioContext) {
      _audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const { harmonics, envelope, duration, type, filter, noise, lfo } = manifold;
    const sampleRate = _audioContext.sampleRate;
    const bufferDuration = duration > 0 ? duration : 1.0; // Use 1s for looping sounds
    const bufferLength = Math.ceil(bufferDuration * sampleRate);
    const buffer = _audioContext.createBuffer(1, bufferLength, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Generate waveform from harmonics
    for (let i = 0; i < bufferLength; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Sum all harmonics
      for (const harmonic of harmonics) {
        const { freq, amp, phase } = harmonic;
        let lfoMod = 1.0;
        if (lfo) {
          lfoMod = 1.0 + lfo.depth * Math.sin(2 * Math.PI * lfo.freq * t);
        }
        sample += amp * _generateWaveform(type, freq * lfoMod, t, phase);
      }

      // Add noise if specified
      if (noise && t < (noise.duration > 0 ? noise.duration : bufferDuration)) {
        sample += noise.amp * (Math.random() * 2 - 1);
      }

      // Apply envelope
      const env = _applyEnvelope(t, bufferDuration, envelope);
      channelData[i] = sample * env;
    }

    // Apply filter if specified (simple IIR approximation)
    if (filter) {
      _applySimpleFilter(channelData, filter, sampleRate);
    }

    return buffer;
  }

  /**
   * Generate waveform sample
   * @param {string} type - 'sine', 'square', 'sawtooth', 'triangle'
   * @param {number} freq - Frequency in Hz
   * @param {number} t - Time in seconds
   * @param {number} phase - Phase offset
   * @returns {number} - Sample value [-1, 1]
   */
  function _generateWaveform(type, freq, t, phase = 0) {
    const angle = 2 * Math.PI * freq * t + phase;
    switch (type) {
      case 'sine':
        return Math.sin(angle);
      case 'square':
        return Math.sin(angle) >= 0 ? 1 : -1;
      case 'sawtooth':
        return 2 * ((freq * t + phase / (2 * Math.PI)) % 1) - 1;
      case 'triangle':
        const saw = 2 * ((freq * t + phase / (2 * Math.PI)) % 1) - 1;
        return 2 * Math.abs(saw) - 1;
      default:
        return Math.sin(angle);
    }
  }

  /**
   * Apply ADSR envelope
   * @param {number} t - Current time
   * @param {number} duration - Total duration
   * @param {object} env - { attack, decay, sustain, release }
   * @returns {number} - Envelope multiplier [0, 1]
   */
  function _applyEnvelope(t, duration, env) {
    const { attack, decay, sustain, release } = env;
    const sustainLevel = sustain;

    if (t < attack) {
      // Attack phase
      return t / attack;
    } else if (t < attack + decay) {
      // Decay phase
      const decayT = (t - attack) / decay;
      return 1.0 - (1.0 - sustainLevel) * decayT;
    } else if (t < duration - release) {
      // Sustain phase
      return sustainLevel;
    } else {
      // Release phase
      const releaseT = (t - (duration - release)) / release;
      return sustainLevel * (1.0 - releaseT);
    }
  }

  /**
   * Apply simple IIR filter (single-pole lowpass/highpass/bandpass)
   * @param {Float32Array} data - Audio samples
   * @param {object} filter - { type, freq, q }
   * @param {number} sampleRate - Sample rate
   */
  function _applySimpleFilter(data, filter, sampleRate) {
    const { type, freq, q = 1 } = filter;
    const omega = 2 * Math.PI * freq / sampleRate;
    const alpha = Math.sin(omega) / (2 * q);

    let b0, b1, b2, a0, a1, a2;

    if (type === 'lowpass') {
      b0 = (1 - Math.cos(omega)) / 2;
      b1 = 1 - Math.cos(omega);
      b2 = (1 - Math.cos(omega)) / 2;
      a0 = 1 + alpha;
      a1 = -2 * Math.cos(omega);
      a2 = 1 - alpha;
    } else if (type === 'highpass') {
      b0 = (1 + Math.cos(omega)) / 2;
      b1 = -(1 + Math.cos(omega));
      b2 = (1 + Math.cos(omega)) / 2;
      a0 = 1 + alpha;
      a1 = -2 * Math.cos(omega);
      a2 = 1 - alpha;
    } else if (type === 'bandpass') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * Math.cos(omega);
      a2 = 1 - alpha;
    } else {
      return; // Unknown filter type
    }

    // Normalize coefficients
    b0 /= a0;
    b1 /= a0;
    b2 /= a0;
    a1 /= a0;
    a2 /= a0;

    // Apply filter (IIR)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x0 = data[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      data[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 3. SUBSTRATE OBSERVATION INTERFACE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Observe manifold and extract audio buffer for sound type
   * @param {string} soundType - Sound identifier (e.g., 'laser', 'explosion')
   * @returns {AudioBuffer|null}
   */
  function observeAudio(soundType) {
    const manifold = _audioManifolds[soundType];
    if (!manifold) {
      console.warn(`[ManifoldAudio] No manifold for sound: ${soundType}`);
      return null;
    }

    return _synthesizeAudio(manifold);
  }

  /**
   * Play audio from manifold directly
   * @param {string} soundType - Sound identifier
   * @param {number} volume - Volume [0, 1]
   * @param {number} pan - Stereo pan [-1, 1]
   * @returns {AudioBufferSourceNode|null} - Source node for control
   */
  function playSound(soundType, volume = 1.0, pan = 0) {
    const buffer = observeAudio(soundType);
    if (!buffer) return null;

    if (!_audioContext) {
      _audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const source = _audioContext.createBufferSource();
    source.buffer = buffer;

    // Volume control
    const gainNode = _audioContext.createGain();
    gainNode.gain.value = volume;

    // Panning
    const panNode = _audioContext.createStereoPanner ?
      _audioContext.createStereoPanner() : null;
    if (panNode) {
      panNode.pan.value = pan;
      source.connect(panNode);
      panNode.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    gainNode.connect(_audioContext.destination);

    // Handle repeating sounds
    const manifold = _audioManifolds[soundType];
    if (manifold.repeat) {
      let count = 0;
      const playRepeat = () => {
        if (count < manifold.repeat.count) {
          const repeatSource = _audioContext.createBufferSource();
          repeatSource.buffer = buffer;
          repeatSource.connect(gainNode);
          repeatSource.start();
          count++;
          setTimeout(playRepeat, manifold.repeat.interval * 1000);
        }
      };
      source.start();
      setTimeout(playRepeat, manifold.repeat.interval * 1000);
    } else {
      source.start();
    }

    return source;
  }

  /**
   * List all available audio manifolds
   * @returns {Array<string>}
   */
  function getAvailableSounds() {
    return Object.keys(_audioManifolds);
  }

  /**
   * Check if manifold exists for sound
   * @param {string} soundType
   * @returns {boolean}
   */
  function hasManifold(soundType) {
    return !!_audioManifolds[soundType];
  }

  /**
   * Initialize audio context (required for some browsers)
   */
  function init() {
    if (!_audioContext) {
      _audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // § 4. PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Substrate observation interface
    observeAudio,
    playSound,

    // Introspection
    hasManifold,
    getAvailableSounds,

    // Initialization
    init,
  };
})();

// Expose globally
window.SFManifoldAudio = SFManifoldAudio;
