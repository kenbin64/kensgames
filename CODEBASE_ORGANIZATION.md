# Manifold Game Codebase Organization
**Last Updated:** 2026-04-10

---

## 🎯 Official Game Versions

### FastTrack v2.1.0 (PRODUCTION READY)
**Location:** `/var/www/kensgames.com/fasttrack/`
**Status:** ✅ Production Ready | Deployed

**Main Files:**
- `board_3d.html` (838KB) - **OFFICIAL** main game board
- `game_engine.js` (191KB) - Game logic engine
- `game_ui_minimal.js` (82KB) - Minimal UI controls
- `move_selection_modal.js` (14KB) - Move selection UI

**Dimensional Substrates (10):**
- `move_generation_substrate.js` - Move calculation
- `card_logic_substrate.js` - Card processing
- `ui_manifold.js` - UI component management
- `ai_manifold.js` - AI decision making
- `game_engine_manifold.js` - Game engine orchestration
- Plus 5 additional core substrates

**Performance Gains (v2.0 → v2.1):**
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Load Time | 2.4s | 0.9s | 62.5% ⚡ |
| Move Generation | 45ms | 18ms | 60% ⚡ |
| Code Size | 3,925 lines | 2,211 lines | 43.7% 📉 |
| Memory | 85KB | 30KB | 65% 📉 |

**Deployment:**
```bash
cd /var/www/kensgames.com/fasttrack
bash deploy/push-to-vps.sh root
```

---

### BrickBreaker3D v1.0 (ZENXY KERNEL EDITION)
**Official Location:** `C:/manifold/legacy/junkyard/zenxy/games/brickbreaker3d/`
**Current Location:** `/var/www/kensgames.com/brickbreaker3d/` (INCOMPLETE - NEEDS UPDATE)

**Official Files (in archive):**
- `index.html` - Zenxy kernel edition
- `game.js` - Full game implementation with:
  - Zenxy kernel machine state management
  - Three.js rendering
  - Paddle/ball physics via z=xy saddle math
  - Brick collision detection
  - Score/level progression

**Status:** ⚠️ Incomplete in production
**Action Required:** Copy official version from archive

---

## 📁 Directory Structure Report

### FastTrack Directory Contents

#### ✅ KEEP (Official v2.1.0)
```
board_3d.html                  (838KB) - OFFICIAL MAIN GAME
game_engine.js                 (191KB) - Game logic
game_ui_minimal.js             (82KB)  - UI controls
move_selection_modal.js        (14KB)  - Move UI
```

#### ⚠️ INVESTIGATE (Large Monolithic Files)
```
board_3d_game.js              (502KB) - May be embedded
board_3d_renderer.js          (168KB) - May be embedded
board_3d_session.js           (26KB)  - Session management
```

#### ❌ ARCHIVE (Old/Duplicate)
```
OLD HTML VERSIONS:
  3d.html                     (19KB)  - Old minimal version
  index_old.html              - Old landing page

OLD MODULES:
  modules/                    - Old modular refactoring attempt

DEBUG FILES:
  debug_board_render.js       - Debug utilities
  manifold_runner.py          - Debug runner

TEST FILES (Keep latest only):
  test_runner_ui.html         - KEEP (official test UI)
  test_game_flows_ui.html     - KEEP (flow tests)
  Other test_*.html           - Archive (duplicates)
  run_*.js                    - Archive (duplicate runners)
```

---

## 🗂️ Reference Versions (C:/manifold)

### Examine Files (Architecture Reference)
```
C:/manifold/_examine_3d.html              - Reference 3D implementation
C:/manifold/_examine_fasttrack3d.js       - Reference renderer logic
C:/manifold/_examine_gamecore.js          - Reference game core
```

### Legacy Archive (Zenxy Foundation)
```
C:/manifold/legacy/junkyard/zenxy/games/brickbreaker3d/
  ├── index.html              - Zenxy kernel edition
  └── game.js                 - Full game with physics

C:/manifold/legacy/junkyard/zenxy/engine/
  ├── saddle_helix.js         - z=xy mathematics
  ├── zenxy.js                - Kernel implementation
  └── zenxy_kernel.js         - KVM state machine
```

---

## 📝 Version Tags

### FastTrack
- **v2.1.0** (2026-02-26) - PRODUCTION READY
  - Location: `/var/www/kensgames.com/fasttrack/board_3d.html`
  - Substrates: 10 dimensional modules
  - Performance: 62.5% faster, 43.7% smaller
  - Status: ✅ Deployed to kensgames.com/fasttrack

### BrickBreaker3D
- **v1.0-Zenxy** (in archive) - Official implementation
  - Location: `C:/manifold/legacy/junkyard/zenxy/games/brickbreaker3d/`
  - Engine: Zenxy kernel + z=xy manifold math
  - Physics: Complete collision & paddle detection
  - Status: ⚠️ NEEDS DEPLOYMENT

---

## 🧹 Cleanup Action Items

### Priority 1: IMMEDIATE
- [ ] Copy BrickBreaker3D official files to `/var/www/kensgames.com/brickbreaker3d/`
- [ ] Verify `board_3d.html` is tagged as official v2.1.0
- [ ] Document which files in `board_3d_*.js` are embedded vs. standalone

### Priority 2: ARCHIVE OLD CODE
- [ ] Move old HTML files to `archive/old_html/`
- [ ] Move `modules/` to `archive/old_modules/`
- [ ] Move old test files to `archive/old_tests/`
- [ ] Move debug files to `archive/old_debug/`

### Priority 3: VERIFY REFERENCES
- [ ] Check if `board_3d_game.js` content is embedded in `board_3d.html`
- [ ] Check if `board_3d_renderer.js` content is embedded in `board_3d.html`
- [ ] Determine if these can be safely archived

### Priority 4: DOCUMENT
- [ ] Update deployment checklist with new archive structure
- [ ] Document which substrates are active vs. legacy
- [ ] Create MANIFEST.md for FastTrack official files

---

## 📊 File Statistics

| Project | Official Files | Total Size | Status |
|---------|---|---|---|
| **FastTrack v2.1.0** | 4 core + 10 substrates | ~2.5MB | ✅ Production |
| **BrickBreaker3D v1.0** | 2 files | ~150KB | ⚠️ Needs update |
| **Old/Duplicate** | 20+ files | ~5MB | ❌ Archive |

---

## 🔗 Related Documentation

- **Dimensional Architecture:** `DIMENSIONAL_MANIFOLD_SUBSTRATE_PRINCIPLES.md`
- **FastTrack Rules:** `FASTTRACK_RULES.md`
- **Game Architecture:** `GAME_ARCHITECTURE.md`
- **Deployment:** `deploy/DEPLOYMENT_CHECKLIST.md`
- **VR Setup:** `VR_SETUP_GUIDE.md`
- **Refactoring Progress:** `DIMENSIONAL_REFACTORING_PROGRESS.md`

---

## 🚀 Next Steps

1. **Tag Version:** Create `VERSION.md` in each game directory
2. **Organize:** Move old files to archive
3. **Deploy:** Update BrickBreaker3D with official version
4. **Document:** Create MANIFEST files for each official release
5. **Reference:** Update C:/manifold with production snapshots

