# 🧪 DIMENSIONAL REFACTORING - TESTING CHECKLIST

## 📋 PRE-COMMIT TESTING

Before committing the ESP refactoring, verify all functionality works:

---

## ✅ CORE FUNCTIONALITY TESTS

### **1. Game Loads**
- [ ] Navigate to `http://localhost:8080/lobby.html`
- [ ] Lobby screen appears without errors
- [ ] No console errors on page load
- [ ] All scripts load successfully (check Network tab)

### **2. Board Renders**
- [ ] Click "Play Solo" or "Quick Play"
- [ ] 3D board appears in viewport
- [ ] Board has hexagonal shape with colored wedges
- [ ] Pegs are visible in holding areas
- [ ] Camera controls work (drag to rotate, scroll to zoom)

### **3. Game Starts**
- [ ] Cards are dealt
- [ ] Current player indicator shows
- [ ] "Roll Dice" or card selection appears
- [ ] Turn progresses when action taken

### **4. Dimensional Substrates Work**
- [ ] `ObservationSubstrate` - Board ready detection works (no infinite polling)
- [ ] `IntentManifold` - AI turns execute without errors
- [ ] `PotentialSubstrate` - Error handling works gracefully
- [ ] No `if`-statement related bugs in refactored code

### **5. Lobby Message Handler**
- [ ] Multiplayer lobby loads
- [ ] Chat messages appear
- [ ] Player join/leave notifications work
- [ ] Session settings update correctly
- [ ] No switch-statement related errors

---

## 🥽 VR FUNCTIONALITY TESTS

### **6. VR ESP Integration**
- [ ] VR button appears (if WebXR supported)
- [ ] Clicking VR button doesn't cause errors
- [ ] VR session starts (on Meta Quest)
- [ ] Controllers appear with blue rays
- [ ] Board is visible in VR (not void)
- [ ] VR lighting is adequate
- [ ] Exiting VR returns to normal mode

### **7. VR Fallback**
- [ ] Game works on non-VR browsers
- [ ] No VR-related errors in console
- [ ] VR button hidden on unsupported devices

---

## 🎮 GAMEPLAY TESTS

### **8. AI Turns**
- [ ] AI makes valid moves
- [ ] AI turn doesn't hang or loop infinitely
- [ ] AI respects game rules
- [ ] Turn passes back to human player

### **9. Move Selection**
- [ ] Click peg to see available moves
- [ ] Move highlights appear
- [ ] Clicking destination moves peg
- [ ] Invalid moves are blocked

### **10. Card Logic**
- [ ] Ace allows entry from holding
- [ ] King allows bullseye exit
- [ ] 4 moves backward
- [ ] 7 can split between pegs
- [ ] Jack swaps with opponent

---

## 🌐 MULTIPLAYER TESTS

### **11. Private Lobby**
- [ ] Create private game
- [ ] Share code appears
- [ ] Other players can join
- [ ] Host can kick players
- [ ] Settings sync across players

### **12. Game Sync**
- [ ] Moves sync to all players
- [ ] Turn indicator updates
- [ ] Chat works
- [ ] Late join works
- [ ] Disconnect handling works

---

## 📱 MOBILE TESTS

### **13. Mobile Rendering**
- [ ] Board renders on mobile viewport
- [ ] Touch controls work
- [ ] UI is responsive
- [ ] No layout breaks
- [ ] Performance is acceptable

---

## 🐛 ERROR HANDLING TESTS

### **14. Console Errors**
- [ ] No JavaScript errors in console
- [ ] No 404s for missing files
- [ ] No CORS errors
- [ ] No undefined variable errors
- [ ] No "Cannot read property of undefined" errors

### **15. Edge Cases**
- [ ] Refresh during game doesn't break
- [ ] Back button works
- [ ] Multiple tabs don't conflict
- [ ] Offline mode works (if applicable)

---

## 🔍 CODE QUALITY CHECKS

### **16. Dimensional Programming Compliance**
- [ ] No new `if` statements added
- [ ] No new `for` loops added
- [ ] No new `switch` statements added
- [ ] All conditionals use `&&`, `??`, `?.`, or ternary
- [ ] All iterations use `.map()`, `.forEach()`, `.filter()`, etc.

### **17. ESP Principles**
- [ ] VR uses lens-based observation
- [ ] No explicit message passing
- [ ] Intent manifolds used for action lookup
- [ ] Observation substrates used for state changes

---

## 📊 PERFORMANCE TESTS

### **18. Load Time**
- [ ] Page loads in < 3 seconds
- [ ] Scripts load without blocking
- [ ] No memory leaks detected

### **19. Runtime Performance**
- [ ] 60 FPS during gameplay
- [ ] No frame drops during animations
- [ ] Smooth camera movement

---

## ✅ FINAL CHECKLIST

Before committing:
- [ ] All core functionality tests pass
- [ ] All VR tests pass (or N/A if no VR device)
- [ ] All gameplay tests pass
- [ ] All multiplayer tests pass (or N/A if solo only)
- [ ] All mobile tests pass
- [ ] No console errors
- [ ] Code follows dimensional programming principles
- [ ] Documentation updated
- [ ] Git commit message is descriptive

---

## 🚨 ROLLBACK PLAN

If tests fail:
```bash
# Restore to safe checkpoint
git reset --hard 664a535

# Or restore specific files
git checkout 664a535 -- web/games/fasttrack/board_3d.html
git checkout 664a535 -- web/games/fasttrack/vr_meta_quest.js
```

---

**Status:** 🟡 Testing in progress
**Last Updated:** 2026-02-28

