/**
 * CaptureSubstrate - Screen & Audio Recording
 * Captures screen display + microphone audio using MediaRecorder
 * Records to WebM blob, ready to add to timeline
 */

const CaptureSubstrate = (() => {
  const _state = {
    isRecording: false,
    recorder: null,
    chunks: [],
    displayStream: null,
    audioStream: null,
    combinedStream: null,
    recordingStartTime: null
  };

  const _listeners = new Map();

  function emit(event, data) {
    (_listeners.get(event) || []).forEach(cb => cb(data));
  }

  return {
    /**
     * Start screen recording with audio
     */
    async startRecording() {
      try {
        // Request screen capture
        _state.displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'monitor'
          },
          audio: false  // Capture audio separately for better quality
        });

        // Request microphone audio
        let audioStream;
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } catch (e) {
          console.warn('Microphone not available, recording video only:', e);
          audioStream = null;
        }

        // Combine streams
        _state.combinedStream = new MediaStream();

        // Add video tracks
        _state.displayStream.getVideoTracks().forEach(track => {
          _state.combinedStream.addTrack(track);

          // Listen for stream end (user stopped sharing)
          track.onended = () => {
            if (_state.isRecording) {
              this.stopRecording();
            }
          };
        });

        // Add audio tracks
        if (audioStream) {
          audioStream.getAudioTracks().forEach(track => {
            _state.combinedStream.addTrack(track);
          });
        }

        // Create recorder
        _state.recorder = new MediaRecorder(_state.combinedStream, {
          mimeType: 'video/webm;codecs=vp9,opus',
          videoBitsPerSecond: 5000000  // 5 Mbps for quality
        });

        _state.chunks = [];
        _state.isRecording = true;
        _state.recordingStartTime = Date.now();

        // Handle data chunks
        _state.recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            _state.chunks.push(e.data);
          }
        };

        // Handle stop
        _state.recorder.onstop = () => {
          _state.isRecording = false;
        };

        _state.recorder.start();
        emit('recording:started', { timestamp: _state.recordingStartTime });

        return true;
      } catch (e) {
        console.error('Error starting recording:', e);
        emit('recording:error', { error: e.message });
        return false;
      }
    },

    /**
     * Stop recording and return blob
     */
    async stopRecording() {
      return new Promise((resolve, reject) => {
        if (!_state.recorder || !_state.isRecording) {
          reject(new Error('No recording in progress'));
          return;
        }

        _state.recorder.onstop = () => {
          _state.isRecording = false;

          // Stop all tracks
          _state.displayStream?.getTracks().forEach(track => track.stop());
          _state.audioStream?.getTracks().forEach(track => track.stop());

          // Create blob
          const blob = new Blob(_state.chunks, { type: 'video/webm' });
          const duration = (Date.now() - _state.recordingStartTime) / 1000;

          emit('recording:stopped', {
            blob,
            duration,
            size: blob.size,
            url: URL.createObjectURL(blob)
          });

          resolve({
            blob,
            duration,
            url: URL.createObjectURL(blob)
          });
        };

        _state.recorder.stop();
      });
    },

    /**
     * Check if recording
     */
    isRecording() {
      return _state.isRecording;
    },

    /**
     * Get recording status
     */
    getStatus() {
      if (!_state.isRecording) return null;

      const elapsed = Date.now() - _state.recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);

      return {
        isRecording: true,
        elapsedSeconds: seconds,
        formattedTime: `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      };
    },

    /**
     * Pause recording
     */
    pauseRecording() {
      if (_state.recorder && _state.isRecording) {
        _state.recorder.pause();
        emit('recording:paused');
      }
    },

    /**
     * Resume recording
     */
    resumeRecording() {
      if (_state.recorder && _state.recorder.state === 'paused') {
        _state.recorder.resume();
        emit('recording:resumed');
      }
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
if (typeof window !== 'undefined') window.CaptureSubstrate = CaptureSubstrate;
if (typeof module !== 'undefined') module.exports = CaptureSubstrate;
