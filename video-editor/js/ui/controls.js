/**
 * UI Controls - Event handlers and interactions
 * Handles button clicks, file uploads, and UI updates
 */

const EditorControls = (() => {
  function init() {
    // TRANSPORT CONTROLS
    document.getElementById('btn-play')?.addEventListener('click', () => {
      VideoEditorApp.play();
      updateTransportButtons();
    });

    document.getElementById('btn-pause')?.addEventListener('click', () => {
      VideoEditorApp.pause();
      updateTransportButtons();
    });

    document.getElementById('btn-stop')?.addEventListener('click', () => {
      VideoEditorApp.pause();
      VideoEditorApp.seek(0);
      updateTransportButtons();
    });

    document.getElementById('btn-first')?.addEventListener('click', () => {
      VideoEditorApp.seek(0);
    });

    document.getElementById('btn-last')?.addEventListener('click', () => {
      const tracks = VideoEditorApp.getTracks();
      const maxDuration = tracks.reduce((max, t) => {
        const clips = t.clips || [];
        const trackMax = Math.max(...clips.map(cid => {
          // Get clip from state
          const state = VideoEditorApp.state();
          return state.timeline?.state?.()?.clips?.get?.(cid)?.startTime || 0;
        }), 0);
        return Math.max(max, trackMax);
      }, 0);
      VideoEditorApp.seek(maxDuration);
    });

    // RECORDING CONTROLS
    document.getElementById('btn-record')?.addEventListener('click', startRecording);
    document.getElementById('btn-stop-record')?.addEventListener('click', stopRecording);

    // Setup recording substrate listeners
    CaptureSubstrate.on('recording:started', onRecordingStarted);
    CaptureSubstrate.on('recording:stopped', onRecordingStopped);
    CaptureSubstrate.on('recording:error', onRecordingError);

    // FILE CONTROLS
    document.getElementById('btn-add-video')?.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('btn-add-audio')?.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('btn-export')?.addEventListener('click', () => {
      alert('Export feature coming in Phase 3!');
    });

    // TEXT CONTROLS
    document.getElementById('btn-add-text')?.addEventListener('click', addTextFromUI);

    // TRANSITION CONTROLS
    document.getElementById('btn-add-transition')?.addEventListener('click', addTransitionFromUI);

    // FILE INPUT
    document.getElementById('file-input')?.addEventListener('change', onFileSelected);

    // UPLOAD AREA DRAG & DROP
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
      uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });

      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });

      uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          handleFileUpload(files[0]);
        }
      });

      uploadArea.addEventListener('click', () => {
        document.getElementById('file-input').click();
      });
    }

    // ZOOM SLIDER
    document.getElementById('zoom-slider')?.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      document.getElementById('zoom-value').textContent = Math.round(value * 100) + '%';
      // TODO: Implement zoom functionality
    });

    // Update UI
    updateTransportButtons();
    updateTimelineInfo();
    setInterval(updateTimelineInfo, 100);  // Update every 100ms
  }

  function onFileSelected(e) {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
    e.target.value = '';  // Reset for next selection
  }

  function handleFileUpload(file) {
    // Determine track based on file type
    const isAudio = file.type.startsWith('audio/');
    const trackIndex = isAudio ? 1 : 0;

    // Create object URL
    const url = URL.createObjectURL(file);

    // Add to timeline
    const clip = VideoEditorApp.addClip(trackIndex, url, 5);
    console.log('Added clip:', clip);

    // Update info
    updateTimelineInfo();
  }

  function updateTransportButtons() {
    const state = VideoEditorApp.state();
    const isPlaying = state.playback?.isPlaying?.() || false;

    document.getElementById('btn-play').classList.toggle('active', !isPlaying);
    document.getElementById('btn-pause').classList.toggle('active', isPlaying);
  }

  function updateTimelineInfo() {
    const state = VideoEditorApp.state();
    const timeline = state.timeline?.state?.();
    const playback = state.playback;

    if (!timeline) return;

    // Duration
    document.getElementById('info-duration').textContent = timeline.totalDuration?.toFixed(1) || '0.0' + 's';

    // Clip count
    const clipCount = timeline.clips?.size || 0;
    document.getElementById('info-clips').textContent = clipCount;

    // Current frame
    const time = playback?.getFrameTime?.() || 0;
    const frame = playback?.getFrameIndex?.() || 0;
    document.getElementById('info-frame').textContent = frame;

    // Playhead time (already updated by app.js)
  }

  /**
   * Start screen recording
   */
  async function startRecording() {
    console.log('Starting screen recording...');
    const success = await CaptureSubstrate.startRecording();
    if (!success) {
      alert('Failed to start recording. Please try again.');
    }
  }

  /**
   * Stop screen recording and add to timeline
   */
  async function stopRecording() {
    console.log('Stopping recording...');
    try {
      const result = await CaptureSubstrate.stopRecording();
      console.log('Recording stopped:', result);

      // Add recorded video to timeline (track 0 = video)
      const clip = VideoEditorApp.addClip(0, result.url, result.duration);
      console.log('Added recorded clip to timeline:', clip);

      updateTimelineInfo();
    } catch (e) {
      console.error('Error stopping recording:', e);
      alert('Error stopping recording: ' + e.message);
    }
  }

  /**
   * Recording started callback
   */
  function onRecordingStarted(data) {
    console.log('Recording started at:', data.timestamp);
    const recordingStatus = document.getElementById('recording-status');
    const recordBtn = document.getElementById('btn-record');

    if (recordingStatus) recordingStatus.style.display = 'block';
    if (recordBtn) recordBtn.style.display = 'none';

    // Update recording time every 100ms
    const recordingInterval = setInterval(() => {
      const status = CaptureSubstrate.getStatus();
      if (status) {
        const timeDisplay = document.getElementById('recording-time');
        if (timeDisplay) {
          timeDisplay.textContent = status.formattedTime;
        }
      } else {
        clearInterval(recordingInterval);
      }
    }, 100);
  }

  /**
   * Recording stopped callback
   */
  function onRecordingStopped(data) {
    console.log('Recording stopped after', data.duration, 'seconds');
    const recordingStatus = document.getElementById('recording-status');
    const recordBtn = document.getElementById('btn-record');

    if (recordingStatus) recordingStatus.style.display = 'none';
    if (recordBtn) recordBtn.style.display = 'block';

    // Show success message
    alert(`Recording saved! Duration: ${data.duration.toFixed(1)}s, Size: ${(data.size / 1024 / 1024).toFixed(1)}MB`);
  }

  /**
   * Add text from UI input
   */
  function addTextFromUI() {
    const content = document.getElementById('text-content')?.value || 'Text';
    const color = document.getElementById('text-color')?.value || '#ffffff';

    const text = VideoEditorApp.addText(content, color, 3);
    console.log('Added text:', text);

    // Show success
    alert(`Text added! Duration: 3s at ${VideoEditorApp.formatTime(text.startTime)}`);
    updateTimelineInfo();
  }

  /**
   * Add transition from UI input
   */
  function addTransitionFromUI() {
    const type = document.getElementById('transition-type')?.value || 'fade';
    const duration = parseFloat(document.getElementById('transition-duration')?.value || '0.5');

    const transition = VideoEditorApp.addTransition(type, duration);
    console.log('Added transition:', transition);

    // Show success
    alert(`${type} transition added! Duration: ${duration}s`);
    updateTimelineInfo();
  }
    console.error('Recording error:', data.error);
    const recordingStatus = document.getElementById('recording-status');
    const recordBtn = document.getElementById('btn-record');

    if (recordingStatus) recordingStatus.style.display = 'none';
    if (recordBtn) recordBtn.style.display = 'block';

    alert('Recording error: ' + data.error);
  }

  return {
    init
  };
})();

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing UI Controls...');
  EditorControls.init();
});
