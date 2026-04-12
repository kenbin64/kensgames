# 🎬 Manifold Video Editor

A dimensional video editing application built on manifold computing principles. Record, edit, and compose videos with a timeline based on manifold surfaces where clips are positioned by track and duration.

## Features

### Phase 1: Core Timeline (✅ COMPLETE)

- **🎥 Screen Recording**
  - Record your screen in real-time
  - Capture microphone audio simultaneously
  - Records to WebM video format (VP9)
  - Auto-adds to timeline upon stop

- **📹 Timeline Editing**
  - Multi-track canvas-based timeline
  - Playhead scrubbing (click to seek)
  - Clip drag-and-drop rearrangement
  - Clip trimming (resize edges for duration)
  - Frame-accurate playback at 30 FPS

- **🎨 Transport Controls**
  - Play/Pause (Spacebar)
  - Stop (goes to start)
  - Step forward/backward (Arrow keys)
  - Jump to first/last frame

- **📊 Timeline Information**
  - Total duration
  - Clip count
  - Current frame display
  - Real-time frame counter

### Phase 2-5: Future

- Text overlays with animation keyframes
- Fade/wipe transitions
- Audio mixing and volume control
- Export to MP4
- Undo/redo history

## Manifold Architecture

```
TIMELINE MANIFOLD SURFACE
x = track_index    (0=video, 1=audio-music, 2=audio-voiceover, etc)
y = clip_duration  (seconds, 1-300)
z = x · y          (complexity token for discovery)
t = playhead_time  (monotonic like musical time)
```

Each clip positioned as a point on this manifold surface enables geometric recommendations: nearby clips (by Euclidean distance) suggest compatible transitions and effects.

## Getting Started

### Recording Your First Video

1. **Open the Editor**
   - Navigate to `http://kensgames.com/video-editor/`

2. **Start Recording**
   - Click the **🎥 Start Recording** button in the sidebar
   - Select which screen/window to share when prompted
   - Optionally allow microphone access for audio

3. **Do Your Thing**
   - Use your selected screen/window normally
   - Everything is being recorded in real-time
   - The timer shows elapsed recording time

4. **Stop Recording**
   - Click **⏹ Stop Recording** when done
   - Video is automatically added to the timeline at track 0 (video)
   - You'll see a confirmation with duration and file size

5. **Edit Your Timeline**
   - **Scrub playhead**: Click anywhere on the timeline ruler to jump to that time
   - **Drag clips**: Click and drag a clip to move it earlier/later
   - **Trim clips**: Drag the left or right edge of a clip to adjust duration
   - **Play back**: Click the play button or press Space to watch your recording

### Importing Files

1. Click **+ Add Video** or **+ Add Audio**
2. Select a file from your computer
3. Drag & drop works too!
4. Audio files go to track 1, video files to track 0

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| ← | Previous Frame (step back) |
| → | Next Frame (step forward) |
| Home | Jump to start |
| End | Jump to end |

## Technical Stack

### Substrates (ButterflyFX Architecture)

1. **TimelineSubstrate** - Clip management, manifold coordinates, duration tracking
2. **PlaybackSubstrate** - Frame-accurate play/pause/seek, Web Audio sync
3. **CaptureSubstrate** - Screen recording via MediaRecorder + getDisplayMedia
4. **TimelineRenderer** - Canvas-based multi-track UI rendering

### Web APIs

- **MediaRecorder** - Screen & audio recording
- **getDisplayMedia** - Screen capture
- **getUserMedia** - Microphone access
- **Canvas 2D** - Real-time timeline visualization
- **Web Audio API** - Audio processing (phase 3+)

## Browser Support

- Chrome/Chromium 72+ ✅
- Firefox 66+ ✅
- Safari 13+ (limited recording support) ⚠️
- Edge (Chromium) 79+ ✅

## File Organization

```
/video-editor/
├── index.html                  Main app
├── css/
│   └── editor.css             All styling
├── js/
│   ├── app.js                 App orchestrator
│   ├── substrates/
│   │   ├── timeline_substrate.js
│   │   ├── playback_substrate.js
│   │   └── capture_substrate.js
│   └── ui/
│       ├── timeline_renderer.js
│       └── controls.js
└── README.md                   This file
```

## Example Workflow

```
1. Start Recording
   └─ Record 60 seconds of screen activity
   
2. Stop Recording
   └─ Auto-added to timeline as "clip-1705123456"
   └─ Duration: 60.0s
   
3. Import Background Music
   └─ Click + Add Audio
   └─ Select music.mp3
   └─ Appears on track 1 (audio)
   
4. Edit Timeline
   ├─ Trim video clip to 35s (edit out a boring section)
   ├─ Move music to start (drag to time 0)
   └─ Play to preview (Space key)
   
5. Add Text & Effects (Phase 2)
   ├─ Add title at 0s
   ├─ Fade transition between clips
   └─ Animate text in with scale keyframes
   
6. Export (Phase 3)
   └─ Render to MP4 at 1280x720, 30fps
```

## Limitations (Phase 1)

- ⚠️ No text overlays yet
- ⚠️ No transitions/effects yet
- ⚠️ No audio mixing
- ⚠️ No export to file
- ⚠️ No undo/redo
- ⚠️ No project save/load
- ⚠️ Single canvas zoom level

## Performance

- Tested with 10+ clips on timeline
- 60 FPS canvas rendering
- Recording quality: 5 Mbps VP9
- ~30-50 MB per minute of recorded video

## Troubleshooting

### Screen Recording Won't Start
- **Problem**: "Permission denied" error
- **Solution**: Your browser needs permission. Check your system settings or try a different browser.

### Audio Not Recording
- **Problem**: Only video is recorded, no audio
- **Solution**: Grant microphone permission when prompted. If denied, you can still record video-only.

### Timeline Jumping or Stuttering
- **Problem**: Playback is choppy
- **Solution**: Close other browser tabs. The canvas rendering is CPU-intensive at high zoom levels.

### Recorded Video is Huge
- **Problem**: 5GB file for 1 minute!
- **Solution**: Yes, WebM at 5Mbps is large. Phase 3 will include compression options.

## Future Enhancements

- **Text Overlays**: Add titles, captions, credits with custom positioning
- **Animation Keyframes**: Scale, rotate, opacity curves for all elements
- **Transitions**: Fade, wipe, dissolve between clips
- **Audio Mixing**: Multi-track volume and panning
- **Effects Library**: Blur, color correction, motion blur
- **Export Formats**: MP4, WebM, MOV, ProRes
- **Project Persistence**: Save/load projects as JSON
- **Collaboration**: Share timelines with team members
- **Performance**: Hardware acceleration, GPU rendering

## Development

### Architecture Philosophy

Every component follows the ButterflyFX substrate pattern:
- **Immutable**: Substrates don't mutate external state
- **Composable**: Minimal public API, event-driven communication
- **Deterministic**: Same input = same output (frame-accurate)
- **Testable**: Each substrate works independently

### Running Locally

```bash
# Clone/navigate to repository
cd /var/www/kensgames.com/video-editor

# Serve with any HTTP server (Python 3)
python -m http.server 8000

# For development with live reload
npx live-server .
```

### Testing Checklist

- [ ] Record a 30-second screen capture
- [ ] Verify audio captures from microphone
- [ ] Scrub playhead to random times
- [ ] Drag a clip 5 seconds forward
- [ ] Trim a clip from 30s to 15s
- [ ] Import an audio file
- [ ] Play back full timeline
- [ ] Open browser console (F12) for logs

## License

Part of the ButterflyFX proof-of-concept. Manifold computing principles applied to temporal media composition.

---

**v1.0.0** - Phase 1 Complete: Core Timeline + Screen Recording ✅
