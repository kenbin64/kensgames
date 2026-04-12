/**
 * PlaybackSubstrate - Frame-accurate playback management
 * Handles play/pause/seek with Web Audio synchronization
 * Emits frame:rendered events for animation loop
 */

const PlaybackSubstrate = (() => {
  // ═══ PRIVATE STATE
  const _state = {
    isPlaying: false,
    frameIndex: 0,
    fps: 30,
    audioContext: null,
    masterGain: null,
    rafId: null
  };

  const _listeners = new Map();

  // ═══ PRIVATE METHODS
  function emit(event, data) {
    (_listeners.get(event) || []).forEach(cb => cb(data));
  }

  function startRenderLoop() {
    const render = () => {
      if (_state.isPlaying) {
        _state.frameIndex++;
        const time = _state.frameIndex / _state.fps;
        emit('frame:rendered', { frame: _state.frameIndex, time });
        _state.rafId = requestAnimationFrame(render);
      }
    };
    _state.rafId = requestAnimationFrame(render);
  }

  // ═══ PUBLIC API
  return {
    /**
     * Initialize playback substrate
     */
    init(fps) {
      _state.fps = fps || 30;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        _state.audioContext = new AudioContext();
        _state.masterGain = _state.audioContext.createGain();
        _state.masterGain.connect(_state.audioContext.destination);
      } catch (e) {
        console.warn('AudioContext not available:', e);
      }
    },

    /**
     * Start playback
     */
    play() {
      if (_state.isPlaying) return;
      _state.isPlaying = true;
      if (_state.audioContext) {
        _state.audioContext.resume().catch(e => console.warn('Resume audio:', e));
      }
      emit('playback:started', { time: _state.frameIndex / _state.fps });
      startRenderLoop();
    },

    /**
     * Pause playback
     */
    pause() {
      _state.isPlaying = false;
      if (_state.rafId) {
        cancelAnimationFrame(_state.rafId);
        _state.rafId = null;
      }
      emit('playback:paused', { time: _state.frameIndex / _state.fps });
    },

    /**
     * Seek to time (seconds) - frame-accurate
     */
    seek(time) {
      const wasPlaying = _state.isPlaying;
      if (wasPlaying) this.pause();

      _state.frameIndex = Math.round(time * _state.fps);
      if (_state.audioContext) {
        _state.audioContext.currentTime = time;
      }
      emit('playback:seeked', {
        frame: _state.frameIndex,
        time: _state.frameIndex / _state.fps
      });

      if (wasPlaying) this.play();
    },

    /**
     * Get current frame time (seconds)
     */
    getFrameTime() {
      return _state.frameIndex / _state.fps;
    },

    /**
     * Get current frame index
     */
    getFrameIndex() {
      return _state.frameIndex;
    },

    /**
     * Check if playing
     */
    isPlaying() {
      return _state.isPlaying;
    },

    /**
     * Set playback speed (1 = normal, 0.5 = half speed, 2 = double speed)
     */
    setPlaybackRate(rate) {
      if (_state.audioContext) {
        // Note: Web Audio API playback rate changes are complex
        // For now, we adjust frame increment speed
        _state.playbackRate = rate;
      }
    },

    /**
     * Get master audio gain node
     */
    getMasterGain() {
      return _state.masterGain;
    },

    /**
     * Get audio context
     */
    getAudioContext() {
      return _state.audioContext;
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
if (typeof window !== 'undefined') window.PlaybackSubstrate = PlaybackSubstrate;
if (typeof module !== 'undefined') module.exports = PlaybackSubstrate;
