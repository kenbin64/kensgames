/**
 * Video Editor App - Main orchestrator
 * Coordinates all substrates and UI interactions
 * Timeline substrate + Playback substrate + UI rendering
 */

const VideoEditorApp = (() => {
  const state = {
    timeline: null,
    playback: null,
    keyframe: null,
    text: null,
    transition: null,
    canvas: null,
    ctx: null,
    isMouseDown: false,
    draggingClip: null,
    resizingEdge: null,
    config: {
      fps: 30,
      width: 1280,
      height: 720
    }
  };

  /**
   * Initialize the video editor app
   */
  function init(canvasId = 'timeline-canvas') {
    state.canvas = document.getElementById(canvasId);
    if (!state.canvas) {
      console.error('Canvas element not found:', canvasId);
      return false;
    }

    state.ctx = state.canvas.getContext('2d');
    if (!state.ctx) {
      console.error('Could not get canvas context');
      return false;
    }

    // Initialize substrates
    TimelineSubstrate.init({ fps: state.config.fps, ...state.config });
    PlaybackSubstrate.init(state.config.fps);

    state.timeline = TimelineSubstrate;
    state.playback = PlaybackSubstrate;
    state.keyframe = KeyframeSubstrate;
    state.text = TextSubstrate;
    state.transition = TransitionSubstrate;

    // Setup event listeners
    setupEventListeners();

    // Setup initial tracks
    state.timeline.addTrack(0, 'video');
    state.timeline.addTrack(1, 'audio-music');

    // Start animation loop
    startAnimationLoop();

    return true;
  }

  /**
   * Setup canvas and document event listeners
   */
  function setupEventListeners() {
    // CANVAS EVENTS
    state.canvas.addEventListener('mousedown', onCanvasMouseDown);
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);

    // PLAYBACK EVENTS
    state.playback.on('frame:rendered', onFrameRendered);
    state.playback.on('playback:seeked', () => {
      updatePlayheadUI();
    });

    // TIMELINE EVENTS
    state.timeline.on('clip:added', () => {
      console.log('Clip added');
      updateTimelineUI();
    });
    state.timeline.on('clip:moved', () => {
      updateTimelineUI();
    });
    state.timeline.on('clip:trimmed', () => {
      updateTimelineUI();
    });

    // DOCUMENT EVENTS
    document.addEventListener('keydown', onKeyDown);
  }

  /**
   * Canvas mouse down - check for scrubbing, clip selection, or resize
   */
  function onCanvasMouseDown(e) {
    const rect = state.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked on playhead (scrub)
    const playheadX = state.playback.getFrameTime() * TimelineRenderer.config.pixelsPerSecond;
    if (Math.abs(x - playheadX) < 10 && y < TimelineRenderer.config.rulerHeight) {
      // Scrub playhead
      const time = TimelineRenderer.pixelsToTime(x);
      state.playback.seek(time);
      state.isMouseDown = true;
      return;
    }

    // Check if clicked on clip edge (resize)
    const edge = TimelineRenderer.getClipEdge(x, y, state.timeline.state());
    if (edge) {
      state.resizingEdge = edge;
      state.isMouseDown = true;
      return;
    }

    // Check if clicked on clip (drag)
    const clip = TimelineRenderer.getClipAtPosition(x, y, state.timeline.state());
    if (clip) {
      state.draggingClip = {
        clip,
        startX: x,
        startTime: clip.startTime
      };
      state.isMouseDown = true;
      return;
    }

    // Clicked on timeline ruler - seek
    if (y < TimelineRenderer.config.rulerHeight) {
      const time = TimelineRenderer.pixelsToTime(x);
      state.playback.seek(time);
      state.isMouseDown = true;
    }
  }

  /**
   * Document mouse move - handle dragging/resizing
   */
  function onDocumentMouseMove(e) {
    if (!state.isMouseDown) return;

    const rect = state.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Handle playhead scrubbing
    if (Math.abs(x - state.playback.getFrameTime() * TimelineRenderer.config.pixelsPerSecond) < 10) {
      const time = TimelineRenderer.pixelsToTime(x);
      state.playback.seek(time);
      return;
    }

    // Handle clip dragging
    if (state.draggingClip) {
      const deltaPixels = x - state.draggingClip.startX;
      const deltaTime = TimelineRenderer.pixelsToTime(deltaPixels);
      const newStartTime = Math.max(0, state.draggingClip.startTime + deltaTime);
      state.timeline.moveClip(state.draggingClip.clip.id, newStartTime);
      return;
    }

    // Handle clip edge resizing
    if (state.resizingEdge) {
      const edge = state.resizingEdge;
      const currentTime = TimelineRenderer.pixelsToTime(x);
      const deltaTime = currentTime - edge.clip.startTime;

      if (edge.side === 'left') {
        // Left edge: adjust duration and start time
        const newDuration = edge.clip.duration - deltaTime;
        if (newDuration > 0.1) {
          state.timeline.moveClip(edge.clip.id, edge.clip.startTime + deltaTime);
          state.timeline.trimClip(edge.clip.id, newDuration);
        }
      } else if (edge.side === 'right') {
        // Right edge: adjust duration only
        const newDuration = deltaTime;
        if (newDuration > 0.1) {
          state.timeline.trimClip(edge.clip.id, newDuration);
        }
      }
      return;
    }
  }

  /**
   * Document mouse up - stop all interactions
   */
  function onDocumentMouseUp(e) {
    state.isMouseDown = false;
    state.draggingClip = null;
    state.resizingEdge = null;
  }

  /**
   * Keyboard shortcuts
   */
  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;  // Don't handle if typing

    switch (e.key) {
      case ' ':
        e.preventDefault();
        state.playback.isPlaying() ? state.playback.pause() : state.playback.play();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        const currentTime = state.playback.getFrameTime();
        state.playback.seek(Math.max(0, currentTime - 0.033));  // Back one frame
        break;
      case 'ArrowRight':
        e.preventDefault();
        const nextTime = state.playback.getFrameTime();
        state.playback.seek(nextTime + 0.033);  // Forward one frame
        break;
      case 'Home':
        e.preventDefault();
        state.playback.seek(0);
        break;
      case 'End':
        e.preventDefault();
        state.playback.seek(state.timeline.query('totalDuration'));
        break;
    }
  }

  /**
   * Animation loop - renders timeline every frame
   */
  function startAnimationLoop() {
    function render() {
      const timeline = state.timeline.state();
      const playheadTime = state.playback.getFrameTime();

      TimelineRenderer.draw(state.ctx, timeline, playheadTime);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }

  /**
   * Frame rendered event from playback substrate
   */
  function onFrameRendered(data) {
    // Update UI or perform per-frame logic here
  }

  /**
   * Update playhead UI
   */
  function updatePlayheadUI() {
    const time = state.playback.getFrameTime();
    const display = document.getElementById('playhead-time');
    if (display) {
      display.textContent = formatTime(time);
    }
  }

  /**
   * Update timeline UI
   */
  function updateTimelineUI() {
    updatePlayheadUI();
  }

  /**
   * Format seconds to MM:SS.FF format
   */
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.round((seconds % 1) * state.config.fps);
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(frames).padStart(2, '0')}`;
  }

  /**
   * Public API
   */
  return {
    init,
    addClip(trackIndex, file, duration = 5) {
      return state.timeline.addClip(trackIndex, {
        file,
        duration,
        startTime: 0
      });
    },
    play() {
      state.playback.play();
    },
    pause() {
      state.playback.pause();
    },
    seek(time) {
      state.playback.seek(time);
    },
    getClips() {
      return state.timeline.getAllClips();
    },
    getTracks() {
      return state.timeline.query('tracks');
    },
    addText(content, color = '#ffffff', duration = 3) {
      const currentTime = state.playback.getFrameTime();
      return state.text.createText({
        content,
        color,
        duration,
        startTime: currentTime
      });
    },
    getText(id) {
      return state.text.getText(id);
    },
    getAllText() {
      return state.text.getAllText();
    },
    removeText(id) {
      return state.text.removeText(id);
    },
    addKeyframe(propertyId, value, easeType = 'linear') {
      const currentTime = state.playback.getFrameTime();
      return state.keyframe.addKeyframe(propertyId, currentTime, value, easeType);
    },
    addTransition(type, duration = 0.5) {
      // Get adjacent clips and create transition
      const currentTime = state.playback.getFrameTime();
      return state.transition.createTransition({
        type,
        duration,
        startTime: currentTime
      });
    },
    getTransitionTypes() {
      return state.transition.getTransitionTypes();
    },
    formatTime,
    state: () => ({
      playback: state.playback,
      timeline: state.timeline,
      text: state.text,
      keyframe: state.keyframe,
      transition: state.transition,
      canvas: state.canvas
    })
  };
})();

// Auto-initialize if DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing Video Editor...');
  VideoEditorApp.init('timeline-canvas');
  console.log('Video Editor initialized');
});

// Export for Node environments
if (typeof module !== 'undefined') module.exports = VideoEditorApp;
