# 🎬 Video & Screenshot Capture Guide for Manifold Gaming Portal

## Quick Start

### Immediate Solution (Use Now)
The portal includes **animated canvas-based previews** for each game that generate dynamically:
- **Location**: `/kensgames.com/showcase.html`
- **No files needed**: Previews are rendered in real-time
- **Instant deployment**: Works immediately without video files

### Real Videos (Next Phase)
Once you have actual gameplay footage, follow this guide to capture, optimize, and integrate.

---

## Part 1: Recording Gameplay Video

### Tools Needed
- **OBS Studio** (Free, cross-platform) - Recommended
- **FFmpeg** (Free, CLI tool) - For optimization
- **Shotcut** (Free) - For editing

### Recording Setup (OBS Studio)

#### Basic Configuration
```
Resolution: 1280x720 (720p) or 1920x1080 (1080p)
Frame Rate: 60 fps
Bitrate: 6000-8000 kbps (for good quality)
Encoder: NVIDIA/AMD Hardware (if available), else x264
Audio: 192 kbps AAC
```

#### Steps
1. **Add Game as Source**
   - Click "+" under Scene Sources
   - Select "Game Capture" (Windows) or "Display Capture" (Mac)
   - Choose the game window

2. **Configure Output**
   - Settings → Output
   - Recording Format: MP4
   - Quality: High (CRF 18-23)

3. **Record Red**
   - Start your game
   - Play ~30-60 seconds of good gameplay
   - Highlight key features (winning, cool moves, etc.)
   - Click "Start Recording"

4. **Save & Optimize**
   - Videos save to configured folder
   - Output: `game-promo.mp4`

### What to Record

#### FastTrack v2.1.0
- Game setup screen
- Players moving around track
- Competitive moments (cutting opponents)
- Victory celebration

#### BrickBreaker3D Solo
- Paddle in action
- Ball bouncing
- Power-ups activating
- Level progression

#### BrickBreaker3D Multiplayer
- Four paddles in arena
- Multiple balls in play
- Players scoring
- Intense competition moments

---

## Part 2: Video Optimization

### Convert for Web (FFmpeg)

#### Command (Copy & Paste)

```bash
# Optimize for web streaming
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset medium \
  -crf 23 \
  -maxrate 2M \
  -bufsize 4M \
  -c:a aac \
  -b:a 192k \
  -movflags +faststart \
  output.mp4

# Result: ~5-15 MB file (30-60 second clip)
```

#### What This Does
- **libx264**: Best video codec for web
- **crf 23**: Quality level (23 = high quality, fast)
- **maxrate 2M**: Prevents buffering on slower connections
- **faststart**: Allows video to play before fully downloaded
- **aac 192k**: Good quality audio

#### Installation
- **macOS**: `brew install ffmpeg`
- **Windows**: Download from ffmpeg.org
- **Linux**: `sudo apt install ffmpeg`

### File Sizes (Target)
- 30-second promo: 3-8 MB
- 60-second promo: 6-15 MB

---

## Part 3: Screenshot Capture

### Tools
- **Windows**: PrintScreen + Paint, or Game's built-in screenshot
- **Mac**: Cmd+Shift+4 (entire screen) or Cmd+Shift+5 (selection)
- **OBS**: Screenshot button during recording

### What to Screenshot

#### Best Shots
1. **Title Screen** - Clean, showing game title
2. **Gameplay Action** - Mid-game with visible mechanics
3. **Victory Screen** - Showing success/leaderboard
4. **Feature Highlight** - Showing unique mechanic

#### For Each Game
- Capture at least 3 different scenarios
- Include UI/stats visible on screen
- Ensure readable at thumbnail size

### Screenshot Optimization

```bash
# Optimize PNG for web (ImageMagick)
convert screenshot.png \
  -resize 1200x675 \
  -quality 85 \
  screenshot-optimized.png

# Result: High quality, small file
```

Or use online tools:
- **TinyPNG**: tinypng.com (free, web-based)
- **ImageOptim**: Free for Mac

### Dimensions (Recommended)
- Width: 1280-1920px
- Height: 720-1080px
- Aspect Ratio: 16:9 (same as videos)

---

## Part 4: Integration into Portal

### File Structure
```
/var/www/kensgames.com/
├── videos/
│   ├── fasttrack-promo.mp4
│   ├── brickbreaker-solo-promo.mp4
│   └── brickbreaker-multi-promo.mp4
├── screenshots/
│   ├── fasttrack/
│   │   ├── 1.jpg
│   │   ├── 2.jpg
│   │   └── 3.jpg
│   ├── brickbreaker-solo/
│   │   ├── 1.jpg
│   │   ├── 2.jpg
│   │   └── 3.jpg
│   └── brickbreaker-multi/
│       ├── 1.jpg
│       ├── 2.jpg
│       └── 3.jpg
└── js/substrates/
    └── promo_media_substrate.js (update URLs)
```

### Update PromoMediaSubstrate

Edit `/kensgames.com/js/substrates/promo_media_substrate.js`:

```javascript
const gamePromos = {
    'fasttrack-v2': {
        // ... existing fields ...
        videoUrl: '/kensgames.com/videos/fasttrack-promo.mp4',  // NEW
        screenshotUrls: [                                       // NEW
            '/kensgames.com/screenshots/fasttrack/1.jpg',
            '/kensgames.com/screenshots/fasttrack/2.jpg',
            '/kensgames.com/screenshots/fasttrack/3.jpg'
        ]
    },
    // ... rest of games ...
};
```

### Deploy
```bash
# Upload files to VPS
scp -r videos/ screenshots/ user@vps:/var/www/kensgames.com/
```

---

## Part 5: Poster Images (Video Thumbnails)

### Create Poster Frame
```bash
# Extract first frame from video
ffmpeg -i game-promo.mp4 -ss 0 -vframes 1 poster.jpg
```

### Poster in HTML
```html
<video poster="/kensgames.com/posters/fasttrack-poster.jpg">
    <source src="/kensgames.com/videos/fasttrack-promo.mp4" type="video/mp4">
</video>
```

---

## Part 6: Animated GIFs (Social Media)

### Create GIF from Video
```bash
# Extract 10 frames per second, create GIF
ffmpeg -i game-promo.mp4 \
  -vf "fps=10,scale=640:-1" \
  -c:v pam \
  -f image2pipe \
  - | convert - -delay 10 -loop 0 promo.gif
```

### Use Cases
- Twitter/X preview
- Discord server
- Email campaigns
- Social media posts

### File Size
- 10 seconds @ 10fps: 2-5 MB
- Acceptable for most platforms

---

## Part 7: Immediate Action Plan

### Step 1: Use Canvas Previews NOW
- Deploy `showcase.html` immediately
- Visit `/kensgames.com/showcase.html`
- Animated previews work without any video files

### Step 2: Capture Real Videos (This Week)
1. Record 30-60 seconds of each game
2. Optimize with FFmpeg
3. Upload to `/kensgames.com/videos/`
4. Update `promo_media_substrate.js`

### Step 3: Add Screenshots (This Week)
1. Capture 3 best shots per game
2. Optimize with ImageOptim/TinyPNG
3. Upload to `/kensgames.com/screenshots/`
4. Update URLs in promo substrate

### Step 4: Deploy (Ready to Go)
1. Push updated files to production
2. Update nginx config if needed
3. Test all video playback
4. Share showcase page

---

## Troubleshooting

### Video Won't Play
```
Issue: Black video or "media not supported"
Solution: Check file format
  - Verify MP4 codec: ffmpeg -i video.mp4
  - Re-encode if needed with FFmpeg command above
```

### Video Too Large
```
Issue: File size > 20MB
Solution: Lower bitrate or resolution
  - Change -crf to 26-28 (lower quality)
  - Add -vf "scale=1280:-1" to reduce resolution
```

### Slow Loading
```
Issue: Videos take too long to load
Solution: Implement lazy loading + preload
  - Add loading="lazy" to <video> tag
  - Use preload="none" instead of preload="auto"
```

### Screenshot Carousel Not Working
```
Issue: Can't navigate between screenshots
Solution: Check browser console for errors
  - Ensure all screenshot URLs are correct
  - Verify images exist on server
```

---

## Performance Tips

### Video Optimization Checklist
- [ ] MP4 format (H.264 video, AAC audio)
- [ ] Resolution: 720p or 1080p
- [ ] Bitrate: 2000-4000 kbps
- [ ] Frame rate: 30-60 fps
- [ ] Duration: 30-60 seconds
- [ ] File size: < 15 MB

### Screenshot Optimization Checklist
- [ ] JPEG format (~85% quality) or PNG
- [ ] Resolution: 1280x720 minimum
- [ ] File size: < 200 KB per image
- [ ] All 3+ screenshots per game

### CDN Recommendation
For production, use CDN to serve videos:
- **Cloudflare**: Free tier supports video
- **AWS CloudFront**: ~$0.085/GB
- **Bunny CDN**: Video hosting at $0.02/GB

---

## Backup Plan (If Videos Unavailable)

The animated canvas previews are **always working** as a fallback:
- No external files needed
- Real-time rendering
- Responsive on all devices
- No bandwidth concerns

**Deploy showcase.html today. Add real videos whenever ready.**

---

## Timeline

| Phase | Action | Timeline |
|-------|--------|----------|
| **Now** | Deploy canvas previews | Immediate |
| **Week 1** | Record & optimize videos | 2-3 hours |
| **Week 1** | Capture & optimize screenshots | 1-2 hours |
| **Week 1** | Update substrate & deploy | 30 minutes |
| **Week 2+** | Create social media content | Ongoing |

---

## Assets Needed

### Minimum (MVP)
- 1 promo video per game (30-60 sec)
- 3 screenshots per game

### Recommended (Production)
- 2-3 promo videos per game (different scenarios)
- 5-10 screenshots per game
- Poster images (for video thumbnails)
- Animated GIFs (for social media)

---

**Status**: Canvas previews deployed. Real videos optional but recommended. 🎬
