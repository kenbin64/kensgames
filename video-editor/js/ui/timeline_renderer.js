/**
 * TimelineRenderer - Canvas-based timeline visualization
 * Renders multi-track timeline with clips, ruler, and playhead
 * Handles all timeline drawing at 60 FPS
 */

const TimelineRenderer = (() => {
  const config = {
    pixelsPerSecond: 60,
    trackHeight: 100,
    headerWidth: 150,
    rulerHeight: 40,
    backgroundColor: '#0a0a14',
    textColor: '#e2e8f0',
    trackAlternateColor1: '#1a1a2e',
    trackAlternateColor2: '#0a0a14',
    clipColor: '#334155',
    clipBorderColor: '#64748b',
    playheadColor: '#ff6b9d',
    handleColor: '#00b4ff'
  };

  /**
   * Main draw function - call this on each animation frame
   */
  function draw(ctx, timeline, playheadTime) {
    if (!ctx || !timeline) return;

    const fps = timeline.fps || 30;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // 1. CLEAR CANVAS
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    // 2. DRAW TRACKS & CLIPS
    if (timeline.tracks && Array.isArray(timeline.tracks)) {
      timeline.tracks.forEach((track, trackIndex) => {
        const trackY = config.rulerHeight + trackIndex * config.trackHeight;

        // Track background (alternate colors)
        ctx.fillStyle = trackIndex % 2 === 0
          ? config.trackAlternateColor1
          : config.trackAlternateColor2;
        ctx.fillRect(0, trackY, w, config.trackHeight);

        // Track border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, trackY, w, config.trackHeight);

        // Track type label
        ctx.fillStyle = config.textColor;
        ctx.font = '12px monospace';
        ctx.fillText(`${track.type}`, 10, trackY + 25);

        // DRAW CLIPS in this track
        if (track.clips && Array.isArray(track.clips)) {
          track.clips.forEach(clipId => {
            const clip = timeline.clips?.get ? timeline.clips.get(clipId) : null;
            if (clip) {
              drawClip(ctx, clip, trackY, config, fps);
            }
          });
        }
      });
    }

    // 3. DRAW TIMELINE RULER
    drawTimelineRuler(ctx, 0, timeline.totalDuration || 0, config);

    // 4. DRAW PLAYHEAD
    const playheadX = playheadTime * config.pixelsPerSecond;
    ctx.strokeStyle = config.playheadColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, ctx.canvas.height);
    ctx.stroke();

    // Playhead circle at top
    ctx.fillStyle = config.playheadColor;
    ctx.beginPath();
    ctx.arc(playheadX, config.rulerHeight / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw individual clip on timeline
   */
  function drawClip(ctx, clip, trackY, cfg, fps) {
    const x = clip.startTime * cfg.pixelsPerSecond;
    const width = clip.duration * cfg.pixelsPerSecond;
    const height = cfg.trackHeight - 20;

    // Clip background
    ctx.fillStyle = cfg.clipColor;
    ctx.fillRect(x, trackY + 10, width, height);

    // Clip border
    ctx.strokeStyle = cfg.clipBorderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, trackY + 10, width, height);

    // Clip label
    ctx.fillStyle = cfg.textColor;
    ctx.font = 'bold 12px monospace';
    const label = clip.id.substring(0, 16);
    ctx.fillText(label, x + 5, trackY + 30);

    // Duration display
    ctx.font = '10px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${clip.duration.toFixed(1)}s`, x + 5, trackY + 45);

    // Left resize handle
    ctx.fillStyle = cfg.handleColor;
    ctx.fillRect(x - 4, trackY + 10, 8, height);

    // Right resize handle
    ctx.fillRect(x + width - 4, trackY + 10, 8, height);
  }

  /**
   * Draw timeline ruler with time markers
   */
  function drawTimelineRuler(ctx, startTime, endTime, cfg) {
    // Ruler background
    ctx.fillStyle = cfg.trackAlternateColor1;
    ctx.fillRect(0, 0, ctx.canvas.width, cfg.rulerHeight);

    // Ruler border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, ctx.canvas.width, cfg.rulerHeight);

    // Time markers for each second
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;

    for (let t = 0; t <= endTime + 1; t++) {
      const x = t * cfg.pixelsPerSecond;

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(x, cfg.rulerHeight - 20);
      ctx.lineTo(x, cfg.rulerHeight);
      ctx.stroke();

      // Time label
      ctx.fillStyle = cfg.textColor;
      ctx.font = '11px monospace';
      const label = `${t}s`;
      ctx.fillText(label, x + 5, cfg.rulerHeight - 5);
    }
  }

  /**
   * Get pixel position from time
   */
  function timeToPixels(time) {
    return time * config.pixelsPerSecond;
  }

  /**
   * Get time from pixel position
   */
  function pixelsToTime(pixels) {
    return pixels / config.pixelsPerSecond;
  }

  /**
   * Get clip at canvas position (for click detection)
   */
  function getClipAtPosition(x, y, timeline) {
    const trackIndex = Math.floor((y - config.rulerHeight) / config.trackHeight);
    const time = x / config.pixelsPerSecond;

    if (trackIndex < 0 || !timeline.tracks[trackIndex]) return null;

    const track = timeline.tracks[trackIndex];
    for (const clipId of track.clips || []) {
      const clip = timeline.clips?.get(clipId);
      if (clip && time >= clip.startTime && time < clip.startTime + clip.duration) {
        return clip;
      }
    }
    return null;
  }

  /**
   * Check if position is on left or right edge of clip (for resizing)
   */
  function getClipEdge(x, y, timeline) {
    const clip = getClipAtPosition(x, y, timeline);
    if (!clip) return null;

    const clipLeft = clip.startTime * config.pixelsPerSecond;
    const clipRight = clipLeft + clip.duration * config.pixelsPerSecond;

    // Check if cursor is near left edge (±4px)
    if (Math.abs(x - clipLeft) < 8) {
      return { clip, side: 'left', trackIndex: clip.trackIndex };
    }
    // Check if cursor is near right edge (±4px)
    if (Math.abs(x - clipRight) < 8) {
      return { clip, side: 'right', trackIndex: clip.trackIndex };
    }

    return null;
  }

  return {
    draw,
    config,
    timeToPixels,
    pixelsToTime,
    getClipAtPosition,
    getClipEdge
  };
})();

// Export for both browser and Node environments
if (typeof window !== 'undefined') window.TimelineRenderer = TimelineRenderer;
if (typeof module !== 'undefined') module.exports = TimelineRenderer;
