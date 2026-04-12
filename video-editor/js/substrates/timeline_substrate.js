/**
 * TimelineSubstrate - Core timeline management
 * Organizes video clips on a manifold surface where:
 *   x = track_index (0=video, 1=audio, 2=text overlay)
 *   y = clip_duration (seconds)
 *   z = x * y (complexity token for discovery)
 *   t = playhead_time (monotonic, like ragtime)
 */

const TimelineSubstrate = (() => {
  // ═══ PRIVATE STATE (encapsulated)
  const _state = {
    tracks: [],
    clips: new Map(),       // id → clip object
    masterTime: 0,          // Playhead position (seconds)
    totalDuration: 0,
    fps: 30,
    resolution: { w: 1280, h: 720 }
  };

  const _listeners = new Map();

  // ═══ PRIVATE METHODS
  function recalculateDuration() {
    _state.totalDuration = Math.max(
      ...Array.from(_state.clips.values()).map(c => c.startTime + c.duration),
      0
    );
  }

  function calcDistance(m1, m2) {
    const dx = m1.x - m2.x;
    const dy = m1.y - m2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function emit(event, data) {
    (_listeners.get(event) || []).forEach(cb => cb(data));
  }

  // ═══ PUBLIC API (minimal, composable)
  return {
    /**
     * Initialize timeline with configuration
     */
    init(config) {
      Object.assign(_state, config);
    },

    /**
     * Add a new track to the timeline
     */
    addTrack(trackIndex, type) {
      _state.tracks.push({
        trackIndex,
        type,  // 'video', 'audio-music', 'audio-voiceover', 'overlay-text'
        clips: []
      });
      emit('track:added', { trackIndex, type });
    },

    /**
     * Add a clip to the timeline
     */
    addClip(trackIndex, { file, startTime = 0, duration = 5 }) {
      const clip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        trackIndex,
        startTime,
        duration,
        manifold: {
          x: trackIndex,
          y: duration,
          z: trackIndex * duration,  // z = x · y (always)
          layer: 0
        },
        source: file,
        effects: [],
        keyframes: {},
        text: null,
        properties: {
          opacity: 1,
          scale: 1,
          rotation: 0,
          volume: 1  // for audio tracks
        }
      };

      _state.clips.set(clip.id, clip);
      if (_state.tracks[trackIndex]) {
        _state.tracks[trackIndex].clips.push(clip.id);
      }
      recalculateDuration();
      emit('clip:added', { clipId: clip.id, clip });
      return clip;
    },

    /**
     * Move clip to new start time
     */
    moveClip(clipId, newStartTime) {
      const clip = _state.clips.get(clipId);
      if (clip) {
        clip.startTime = Math.max(0, newStartTime);
        recalculateDuration();
        emit('clip:moved', { clipId, newStartTime });
      }
    },

    /**
     * Trim clip to new duration
     */
    trimClip(clipId, newDuration) {
      const clip = _state.clips.get(clipId);
      if (clip) {
        clip.duration = Math.max(0.1, newDuration);
        clip.manifold.y = clip.duration;
        clip.manifold.z = clip.manifold.x * clip.manifold.y;
        recalculateDuration();
        emit('clip:trimmed', { clipId, newDuration });
      }
    },

    /**
     * Remove clip from timeline
     */
    removeClip(clipId) {
      const clip = _state.clips.get(clipId);
      if (clip && _state.tracks[clip.trackIndex]) {
        const trackClips = _state.tracks[clip.trackIndex].clips;
        const idx = trackClips.indexOf(clipId);
        if (idx > -1) trackClips.splice(idx, 1);
        _state.clips.delete(clipId);
        recalculateDuration();
        emit('clip:removed', { clipId });
      }
    },

    /**
     * Get all clips active at given time
     */
    getClipsAtTime(time) {
      return Array.from(_state.clips.values()).filter(c =>
        c.startTime <= time && time < c.startTime + c.duration
      );
    },

    /**
     * Get nearby clips on manifold surface (for effect suggestions)
     * Uses Euclidean distance on (trackIndex, duration) axes
     */
    getNearbyClips(clipId, limit = 3) {
      const clip = _state.clips.get(clipId);
      if (!clip) return [];

      const allClips = Array.from(_state.clips.values());
      return allClips
        .filter(c => c.id !== clipId)
        .map(c => ({
          clip: c,
          distance: calcDistance(clip.manifold, c.manifold)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map(r => r.clip);
    },

    /**
     * Seek playhead to time (seconds)
     */
    seek(time) {
      _state.masterTime = Math.max(
        0,
        Math.min(time, _state.totalDuration)
      );
      emit('playback:seek', { time: _state.masterTime });
    },

    /**
     * Get current playhead time
     */
    getPlayheadTime() {
      return _state.masterTime;
    },

    /**
     * Get clip by ID
     */
    getClip(clipId) {
      return _state.clips.get(clipId);
    },

    /**
     * Get all clips
     */
    getAllClips() {
      return Array.from(_state.clips.values());
    },

    /**
     * Get state property
     */
    query(prop) {
      return _state[prop];
    },

    /**
     * Get full state
     */
    state() {
      return JSON.parse(JSON.stringify(_state));
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
if (typeof window !== 'undefined') window.TimelineSubstrate = TimelineSubstrate;
if (typeof module !== 'undefined') module.exports = TimelineSubstrate;
