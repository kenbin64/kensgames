# FastTrack Game - Version Registry

## Official Release: v2.1.0
**Date:** 2026-04-10  
**Status:** Production Ready  
**Main File:** `board_3d.html` (838KB)

### Core Files (Official v2.1.0)
- ✅ `board_3d.html` - Main game board (OFFICIAL)
- ✅ `game_engine.js` - Game logic (191KB)
- ✅ `game_ui_minimal.js` - UI controls (82KB)
- ✅ `move_selection_modal.js` - Move selection UI

### Dimensional Substrates (10 Required)
- ✅ `move_generation_substrate.js`
- ✅ `card_logic_substrate.js`
- ✅ `ui_manifold.js`
- ✅ `ai_manifold.js`
- ✅ `game_engine_manifold.js`
- Plus 5 additional core substrates

### Reference Versions (C:/manifold)
- 📋 `_examine_3d.html` - Clean reference implementation
- 📋 `_examine_fasttrack3d.js` - Reference 3D renderer  
- 📋 `_examine_gamecore.js` - Reference game core

---

## Archive: Old/Duplicate Files
Move these to `./archive/` directory:
- `3d.html` (old minimal version)
- `index_old.html` 
- `modules/` directory
- `debug_board_render.js`
- `manifold_runner.py`
- Duplicate test runners
- Outdated test files

---

## Deployment Command
```bash
bash deploy/push-to-vps.sh root
```
